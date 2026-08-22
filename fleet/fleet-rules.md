# Global Fleet Rules

Runner-level rules that apply across all tasks. Task files own their task-specific
limits; this file owns everything that spans tasks. When a task file and this file
conflict, the stricter rule wins.

## Daily batch cap

- **Default mode: max 10 CRs per day fleet-wide**, across all tasks. The target
  review session is ~5 minutes; the daily-five-minutes scenario (~8 CRs) is the
  design center.
- **Sweep mode** (pre-milestone, enabled explicitly by the BIM manager): max 25
  CRs per day. Sweep mode never relaxes confidence gates or hard limits — it only
  raises the batch cap and lets tasks work through their deferred backlogs.
- When detections exceed the cap, the overflow is not dropped: it appears in the
  daily report as a deferred backlog with totals, and is drawn down on
  subsequent days in severity order.
- Per-task caps in task files apply first; the fleet cap applies to the remainder.

## Context & rec report cap

[context and rec] tasks deliver context & recommendation reports
(formats/context-rec-report.md), not CRs. Reports have their own cap — **max 10
new reports per day fleet-wide** (sweep: 25) — because they don't consume the
CR cap but do compete for the same human attention. Same severity ordering,
same deferred-backlog rule: overflow is counted, never dropped silently. On the
issue panel, reports are grouped by recommended-action type, then level, so
similar manual fixes batch into one Revit sitting.

## Automate before agents

Agents are for small, fast judgment tasks — not for driving viewers, waiting on
loads, or mechanical data shuffling. Whenever a workflow step is
deterministically automatable (data extraction and shaping, like the JSON
exports in the bim2graph pipeline; warning-list import), it belongs in the
pipeline as automation, not in an agent prompt. This keeps agent work time
short and agent output focused on the judgment layer: triage, keeper calls,
rationale. Screenshot/viewer generation is out of scope for this project
entirely — Speckle/Revit auto-locate from element IDs. The runtime follows the
same logic: a cache agent downloads from Speckle once per run and task agents
SQL-query it for small subsets (runtime.md); after v1 runs, instrumentation
decides which recurring data translations get automated deterministically.
(Pipeline-side automation is largely the infra teammates' scope; this section
states the boundary.)

## Detection sources: warnings first

Where Revit already detects the issue natively, the task **imports the Revit
warning list as its detection seed** — it does not re-implement detection.
The agent's work starts where the warning stops: triage (real vs. intentional),
the keeper/fix judgment, the rationale, and the packaging. Task-side detection
logic exists only as (a) a fallback when the warning feed is absent — noted in
the daily report as degraded coverage — and (b) a supplement for what warnings
miss. Semantic tasks (nomenclature, compliance) have no native warning and are
fully agent-detected — that's their point.

| Task | Native Revit warning seed |
|---|---|
| duplicate-marks | "Elements have duplicate 'Mark' values." |
| duplicate-room-numbers | duplicate room 'Number' values |
| identical-instances | "There are identical instances in the same place." |
| overlap-locator | "Highlighted walls overlap." / wall–line overlap warnings |
| off-axis-lines | "Line is slightly off axis and may cause inaccuracies." |
| nomenclature | none — agent-detected |

## Severity ordering

Every daily batch (and the daily report) is ordered by severity class, highest
first, so the reviewer's attention lands on what matters most:

| Rank | Class | Tasks |
|---|---|---|
| 1 | Life-safety / compliance | compliance-check (diagnose-only findings lead the report; CRs lead the batch) |
| 2 | Documentation integrity — breaks schedules, tags, printed sets | duplicate-room-numbers, duplicate-marks |
| 3 | Model integrity — double counts, overlaps, drafting inaccuracy | identical-instances, overlap-locator, off-axis-lines (archived: duplicate-doors) |
| 4 | Consistency / cosmetic | nomenclature |

Within a severity class, order by blast radius (element count affected), largest
first. Ties broken by detection age, oldest first.

## Safety invariants (never relaxed, in any mode)

1. **No CR without a rationale a BIM manager can evaluate in one read.** If the
   rationale needs a second paragraph, the fix is not confident enough to propose.
2. **Human approval is the only path to a model change.** The fleet never writes
   directly; it only drafts CRs.
3. **Parameter writes and element deletes only in v1.** Deletes are simple,
   lossless-to-review operations (the CR names exactly what disappears);
   geometry edits are not. No task modifies geometry, creates elements, or
   moves elements in v1 — simple element creation (e.g. drawing a wall to
   close a room boundary) is a candidate for v2, after geometry write lands.
4. **Rejections are respected.** A fix rejected once is never re-proposed
   (Exceptions log, formats/exceptions-log.md). 3+ rejections sharing a pattern
   force a convention revision, noted in the daily report.
5. **Never enforce a pattern nobody chose.** If a task infers a convention, the
   inference is stated explicitly in every CR and report entry it produces. If no
   dominant convention exists, the task reports that instead of proposing fixes.

## Aggressiveness knobs (what sweep mode may change)

| Knob | Default | Sweep |
|---|---|---|
| Fleet-wide daily CR cap | 10 | 25 |
| Per-task daily caps | per task file | per task file × 2, rounded down |
| Confidence gates | high only → CR | unchanged |
| Fix-policy classes | per task file | unchanged |
| Batch sizes within a CR | per task file | unchanged |

Confidence and policy never loosen — sweep mode changes *volume*, not *judgment*.
