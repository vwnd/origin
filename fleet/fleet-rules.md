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

## Severity ordering

Every daily batch (and the daily report) is ordered by severity class, highest
first, so the reviewer's attention lands on what matters most:

| Rank | Class | Tasks |
|---|---|---|
| 1 | Life-safety / compliance | compliance-check (diagnose-only findings lead the report) |
| 2 | Documentation integrity — breaks schedules, tags, printed sets | duplicate-room-numbers, duplicate-marks |
| 3 | Model integrity — double counts, phantom elements, clash noise | identical-instances, duplicate-doors |
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
