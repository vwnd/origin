# Origo Agent Fleet

Automated daily maintenance for Revit models — "Dependabot for Revit." The
fleet detects model-health and semantic issues, drafts small reviewable
change requests (CRs), and delivers them for human approval in Revit.
Nothing changes a model without a BIM manager approving it.

The value is two-fold: **pre-drafted fixes** (small CRs, human-approved),
and **pre-done investigation** — issues the fleet can't or shouldn't fix
still arrive located, dissected, and with a recommended action, as a
context & recommendation report (formats/context-rec-report.md). Who
detects what, and the deliverable class per issue: scope-map.md.

## Pipeline

Revit → Speckle → Origo server → **agent fleet (this directory)** → Origo
server → Speckle → Revit change requests → human approval in Revit → model
updated and pushed back. Runs daily as background maintenance.

## Directory map

```
fleet/
  README.md
  fleet-rules.md         global runner rules: caps, severity ordering, safety invariants
  scope-map.md           who detects what, deliverable class per issue
  runtime.md             cache agent + task agents (A/B) execution structure
  tasks/                 one md per task — the customizable product surface
    nomenclature.md
    misspellings.md
    compliance-check.md
    duplicate-room-numbers.md
    duplicate-marks.md
    identical-instances.md
    overlap-locator.md       wall & line overlaps → context & rec (v1.5)
    off-axis-lines.md        off-axis lines/planes (v1.5 context & rec → v2 snap)
    archive/                 parked tasks; skeleton kept current
      duplicate-doors.md
  formats/
    standards-file.md    the rules files a firm authors, with templates
    exceptions-log.md    shared rejected-fix log all tasks must respect
    daily-report.md      the daily report the runner assembles
    context-rec-report.md  the [context and rec] deliverable
  state/                 runner-maintained state — created at runtime
```

## How the runner consumes tasks

Every task file uses the same eight sections: **Objective, Inputs,
Detection, Fix policy, Confidence gate, Change request format, Feedback
handling, Hard limits.** Hard limits live in the task file — visible to
customizing firms — not hidden in the runner.

Detection is **warnings-first** (fleet-rules.md): where Revit natively
warns, the imported warning list is the seed and the agent adds the
judgment — triage, keeper calls, fix drafting, packaging. Only semantic
tasks detect from scratch.

Each task's **Inputs section is a query contract** (runtime.md): a cache
agent downloads from Speckle once per run; the task agent SQL-queries it
for exactly the fields and filters its Inputs list.

## Fix-policy classes

- **Auto-propose** — deterministic fix; the agent adds rationale and a
  confidence call.
- **Suggest-with-options** — judgment fix; stated preference, max 2 options.
- **Diagnose-only** — often a design condition in progress, not an error.
  Never auto-fix; the precise diagnosis is the deliverable.
- **[context and rec]** — the fix must happen by hand in Revit; the
  deliverable is a context & recommendation report: element IDs
  (Speckle/Revit auto-locate from them), dissection, recommended action.

## Safety model

The change-request-with-human-approval flow is the core safety model. Every
design decision protects it:

- Daily batch cap and severity ordering keep review at ~5 minutes so
  approvals stay considered, never bulk-rubber-stamped.
- No CR ships without a rationale a BIM manager can evaluate in one read.
- Rejected CRs feed the Exceptions log; a rejected fix is never re-proposed.
- v1 writes are **parameter writes and element deletes only** — operations
  a reviewer can fully evaluate from the CR. Geometry modification and
  creation are deferred to v2 (fleet-rules.md).

## Customizing for a firm

1. Adjust the starter files in /standards/ (naming.md, compliance.md) —
   plain markdown a BIM manager edits, no schema. Format and templates:
   formats/standards-file.md.
2. Adjust per-task hard limits (caps, batch sizes) in tasks/*.md.
3. Seed state/exceptions.md with known intentional deviations.

## Open infra dependencies

- **Revit warning import** in the Origo → agent feed (type, message,
  element ids, ideally per sync) — most non-semantic tasks seed from it.
- Geometry **read** access (room boundary loops, wall location lines,
  placement points) — v1.5 tasks and identical-instance detection.
- Rejected CRs flowing back with the rejection reason (or at minimum the
  reject event) — the Exceptions log and convention-revision loop depend
  on it.
- Phase/hosting data through Speckle — instance dedup needs it.
- Element **delete** operations in the CR round trip — identical-instances
  proposes deletes in v1.
- SQL-queryable access to the cached Speckle download (runtime.md), plus
  per-run instrumentation (queries, subset sizes, agent time) to feed the
  assess-then-automate decision.
- **Issue panel grouping** by proposed-action type, then level, with
  dismiss-with-reason feeding back like CR rejections.
