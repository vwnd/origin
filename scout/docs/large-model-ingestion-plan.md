# Plan: Graceful Failure & Large-Model Ingestion

_Architecture plan, 2026-08-23. Context: a 900 MB Revit model was pushed to
Speckle; the inspection workflow got stuck with no graceful shutdown or
timeout. This documents the diagnosis, the immediate fix, and the
architecture changes needed to handle payloads of this size._

Scope: `scout/` inspection pipeline — `src/inspection/workflow.ts`,
`src/inspection/loader.ts`, `src/api/runs.ts`, `wrangler.jsonc`.

---

## 1. Diagnosis — why it "got stuck"

The whole load lives in **one workflow step** (`index-version`) that streams
the entire Speckle object graph in a single HTTP request. Three facts
collide:

1. **The comment in `workflow.ts` ("unlimited wall time per step") is
   wrong.** Cloudflare Workflows' default step config is
   `timeout: 10 minutes` _per attempt_,
   `retries: { limit: 5, delay: 10s, backoff: exponential }`. No step in the
   file passes a `StepConfig`, so all run on defaults.
2. **CPU is capped at the configured 300 s per invocation** (the platform
   maximum). A 900 MB Revit file is plausibly several GB of line-delimited
   JSON on the wire; decoding + `line.includes()` over every geometry line
   can blow 5 minutes of CPU. `exceededCpu` kills the isolate — it is **not
   catchable in-instance**.
3. **There is no terminal-failure path.** When the step exhausts 6 attempts
   (~1 h+ of silent churn, each attempt re-downloading from byte zero) the
   instance ends `errored` — and nothing updates the D1 `runs` row (stays
   `"running"` forever) or the DO's `run` row (stays `"indexing"`). The UI
   faithfully reports a run that will never finish. That is the observed
   "stuck".

Secondary weakness: the `inspect` step loops _all_ instructions inside one
step — one flaky model call retries the whole loop and re-spends every
prior instruction's cost.

---

## 2. Workstream A — graceful shutdown & honest state

Ships now, independent of the scale work.

**A1. Explicit `StepConfig` on every step.** `index-version`: long timeout
(30–60 min), `retries: { limit: 1–2 }` — re-downloading gigabytes five
times is not a retry strategy. API-call steps: short timeouts; current
retry counts are fine.

**A2. Classify failures.** Throw `NonRetryableError` (from
`cloudflare:workflows`) for permanent conditions — unsupported
`schemaVersion`, missing root object, no enabled scouts, 4xx from Speckle.
Today these burn the full retry budget for nothing.

**A3. Terminal-failure handler.** Wrap `run()` in try/catch: on failure →
`updateRun({ status: "failed", error, finished: true })`,
`publishEvent(run_failed)`, `agent.finishRun("failed")`, rethrow. Closes
the loop for every failure the instance _can_ observe.

**A4. Reaper cron — mandatory, not belt-and-braces.** Because
`exceededCpu` kills the isolate, A3 alone cannot catch the exact failure we
just hit. A scheduled handler sweeps D1 for runs `running` longer than N,
asks `INSPECTION_WORKFLOW.get(instanceId).status()`, and reconciles:
`errored`/`terminated` → `failed`; vanished or expired → `timed_out`. This
is the invariant that makes "stuck forever" structurally impossible.

**A5. Download stall watchdog.** The `fetch` in `loader.ts` has no abort
path — a stalled Speckle stream hangs until the step timeout. Add an
`AbortController` + idle timer (no bytes for ~60 s → abort with a distinct
error).

**A6. Pre-flight size gate.** `resolve-version` already fetches
`totalChildrenCount` and then ignores it. Until Workstream B lands, gate on
it: above a calibrated threshold → end the run _gracefully_ as
`"too_large"` with a clear message. That converts the next 900 MB push from
an hour of invisible churn into an immediate, honest answer. Also record
`bytes` seen per attempt, so we learn what the wire size of these models
actually is.

**A7. Heartbeat.** Have the loader's `onProgress` (currently unused by the
workflow) bump `last_progress_at` / `objects_so_far` on the D1 row
occasionally. The UI shows liveness; the reaper distinguishes "slow but
moving" from "dead".

---

## 3. Workstream B — architecture for large payloads

The structural flaw: we download **everything** to client-side-discard
~95% of it (geometry), inside one unresumable, CPU-bounded step. Three
levers, in order of value:

**B1. Server-side filtering + pagination (the big lever — spike first).**
Speckle's GraphQL exposes a paginated `children` query on an object
(`limit` / `cursor` / `select` / `query`). If Speckle can be asked for
_only_ DataObjects — or even just page ids, hydrated via the batch objects
endpoint — the 900 MB model likely collapses to tens of MB of property
data, and each page becomes **its own workflow step**: durable,
cursor-checkpointed, individually retried, each safely under CPU/wall
limits. A retry re-fetches one page, not the world. This turns "large
model" from a limits problem into a step-count problem (10 k steps default,
raisable to 25 k).

**B2. R2 staging (fallback if B1's filtering proves infeasible).** Step 1:
pipe the Speckle stream straight into an R2 multipart upload — near-zero
CPU, so a multi-GB download fits one long-timeout step. Steps 2..N: parse
from R2 via range reads in fixed-size slices (e.g. 256 MB per step),
checkpointing byte offset + line carry between steps. Decouples network
flakiness from CPU work; a parse retry never re-downloads.

**B3. Container/Sandbox offload (v2 escape hatch).** If models outgrow
even chunked Workers CPU, the workflow dispatches ingest to a Cloudflare
Container job (full CPU/memory) that streams batches into the same DO
index. On the shelf — only if B1+B2 measurably fall short.

**B4. Split `inspect` into one step per instruction.** Isolates retries
and cost per scout; each step gets its own CPU/timeout budget.

Unchanged and fine: per-version DO index (the 10 GB SQLite cap is nowhere
in sight for properties-only indexing), batch ingest, the 1 MiB
step-result discipline.

---

## 4. Sequencing

| Phase | What                                                                            | Gate                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Workstream A entire (A1–A7)                                                     | Acceptance: pushing the 900 MB model yields a terminal, human-readable run status within minutes; no run can sit `running` past the reaper window |
| 1     | Spike B1: can Speckle serve DataObjects-only, paginated? Measure real wire size | Decision: B1 vs B2                                                                                                                                |
| 2     | Implement chosen ingest path + B4; raise/remove the A6 gate threshold           | 900 MB model indexes end-to-end                                                                                                                   |
| 3     | B3 only if Phase 2 metrics demand it                                            | —                                                                                                                                                 |

**Non-negotiable ordering:** A4 (the reaper) and A6 (the gate) ship before
anyone pushes another large model. Everything else is improvement; those
two are the difference between a system that fails and a system that lies
about failing.

---

## 5. Phase 1 spike results (2026-08-23)

Phase 0 shipped (`4955c2a`). The spike ran live against
`app.speckle.systems` with `scripts/spike-selective-walk.mjs`. Verdict:
**B1 is feasible — via REST, not GraphQL. B2 (R2 staging) is not needed.**

**The GraphQL avenue is dead.** The server no longer exposes any
object-graph query: no `Query.stream`, no `Project.object`, no
`Object.children`. The `Object` type survives with five scalar fields.

**The REST surface is sufficient**, and it speaks the loader's language:

- `GET /objects/{projectId}/{rootId}/single` returns the root object alone —
  including its full `__closure` (every descendant id) and the proxy tables.
- `POST /api/getobjects/{projectId}` (body `{ objects: "[ids...]" }`,
  `Accept: text/plain`) returns any batch of ids as the same `{id}\t{json}`
  lines the loader already parses.

**Geometry hangs in exactly two places** in a Revit v3 commit, both
prunable before download: `displayValue` references on elements, and one
collection literally named `definitionGeometry` (instance-definition
meshes; its element count matches `instanceDefinitionProxies` 1:1).
A breadth-first walk over `reference` nodes that skips both fetches **zero
meshes** — verified by type tally.

**Measurements** (selective walk vs. today's full stream):

| Model                              | Packfile | Children | Selective wire | Objects fetched             | Requests | Time |
| ---------------------------------- | -------- | -------- | -------------- | --------------------------- | -------- | ---- |
| ARCH-CARTER-PRIMARY (`3ed937f226`) | 862.7 MB | 64,593   | **122.5 MB**   | 20,826 (19,742 DataObjects) | 45       | 35 s |
| Snowdon Towers (`02a7431fac`)      | 160.7 MB | 7,781    | **49.8 MB**    | 8,524 (7,574 DataObjects)   | 20       | 19 s |

7× less wire on the model that killed the pipeline — and the reduction
grows with model size, because geometry's share grows. Every byte fetched
is data the index actually wants.

### Consequences for Phase 2

- Replace the single-stream load with the batched walk, run as a **loop of
  workflow steps**: each step drains up to N frontier ids through
  `getobjects`, ingests DataObjects, enqueues newly discovered references,
  and returns counts only (the 1 MiB step-result cap stands). Bounded CPU
  and wall time per step; a retry re-fetches one slice, not the model.
- **The frontier lives in the InspectionAgent** (new SQLite table), not in
  step returns — it can exceed the step-result cap on large models, and the
  DO is already the run's durable scratch space. Drain must be
  mark-then-delete so a retried step re-reads the same slice;
  `ingestBatch` is already `INSERT OR REPLACE`, so re-ingesting is safe.
- Keep the streaming loader as the fallback path for non-Revit commits
  whose structure the walk's prune rules don't know.
- **Gate recalibration:** children count is a weak size proxy (64.6 k
  children at 863 MB vs 7.8 k at 161 MB — an 8× count spread for a 5×
  byte spread, in the wrong direction per object). Keep the packfile-bytes
  bound as primary. After Phase 2, the binding quantity becomes DataObject
  wire size, so the byte cap can rise roughly 7×.
- Subrequest budgets are a non-issue: 45 requests covered the 863 MB
  model, far under the per-invocation limit even in a single step.
