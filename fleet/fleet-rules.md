# Global Fleet Rules

Runner-level rules spanning all tasks; task files own task-specific limits.
When a task file and this file conflict, the stricter rule wins.

## Daily batch cap

- **Default mode: max 10 CRs per day fleet-wide.** Target review session is
  ~5 minutes (~8 CRs is the design center).
- **Sweep mode** (pre-milestone, enabled explicitly by the BIM manager):
  max 25 CRs per day. Sweep never relaxes confidence gates or hard limits —
  it only raises the cap and works through deferred backlogs.
- Overflow beyond the cap is never dropped: it appears in the daily report
  as a deferred backlog with totals, drawn down on subsequent days in
  severity order.
- Per-task caps apply first; the fleet cap applies to the remainder.

## Context & rec report cap

[context and rec] tasks deliver reports (formats/context-rec-report.md),
not CRs. Reports have their own cap — **max 10 new reports per day
fleet-wide** (sweep: 25) — they don't consume the CR cap but compete for
the same attention. Same severity ordering and deferred-backlog rule. On
the issue panel, reports group by recommended-action type, then level, so
similar manual fixes batch into one Revit sitting.

## Automate before agents

Agents are for small, fast judgment tasks — not driving viewers, waiting on
loads, or mechanical data shuffling. Any deterministically automatable step
(data extraction/shaping, warning-list import) belongs in the pipeline, not
in an agent prompt — keeping agent time short and output focused on triage,
keeper calls, rationale. Screenshot/viewer generation is out of scope
entirely — Speckle/Revit auto-locate from element IDs. The runtime follows
the same logic (cache agent + SQL subsets, runtime.md); after v1 runs,
instrumentation decides which recurring translations get automated.
(Pipeline-side automation is largely the infra teammates' scope.)

## Detection sources: warnings first

Where Revit already detects the issue natively, the task **imports the
Revit warning list as its detection seed** — it never re-implements
detection. The agent's work starts where the warning stops: triage (real
vs. intentional), the keeper/fix judgment, rationale, packaging. Task-side
detection exists only as (a) a fallback when the warning feed is absent —
noted in the daily report as degraded coverage — and (b) a supplement for
what warnings miss. Semantic tasks (nomenclature, misspellings, compliance)
have no native warning and are fully agent-detected — that's their point.

| Task | Native Revit warning seed |
|---|---|
| duplicate-marks | "Elements have duplicate 'Mark' values." |
| duplicate-room-numbers | duplicate room 'Number' values |
| identical-instances | "There are identical instances in the same place." |
| overlap-locator | "Highlighted walls overlap." / wall–line overlap warnings |
| off-axis-lines | "Line is slightly off axis and may cause inaccuracies." |
| nomenclature | none — agent-detected |
| misspellings | none — agent-detected |

## Severity ordering

Every daily batch and report is ordered by severity class, highest first:

| Rank | Class | Tasks |
|---|---|---|
| 1 | Life-safety / compliance | compliance-check (diagnose-only findings lead the report; CRs lead the batch) |
| 2 | Documentation integrity — breaks schedules, tags, printed sets | duplicate-room-numbers, duplicate-marks |
| 3 | Model integrity — double counts, overlaps, drafting inaccuracy | identical-instances, overlap-locator, off-axis-lines (archived: duplicate-doors) |
| 4 | Consistency / cosmetic | nomenclature, misspellings |

Within a class, order by blast radius (element count), largest first; ties
by detection age, oldest first.

## Safety invariants (never relaxed, in any mode)

1. **No CR without a rationale a BIM manager can evaluate in one read.** If
   the rationale needs a second paragraph, the fix is not confident enough.
2. **Human approval is the only path to a model change.** The fleet never
   writes directly; it only drafts CRs.
3. **Parameter writes and element deletes only in v1.** Deletes are simple
   to review (the CR names exactly what disappears); geometry edits are
   not. No task modifies geometry, creates, or moves elements in v1 —
   simple element creation (e.g. a wall closing a room boundary) is a v2
   candidate, after geometry write lands.
4. **Rejections are respected.** A fix rejected once is never re-proposed
   (formats/exceptions-log.md). 3+ rejections sharing a pattern force a
   convention revision, noted in the daily report.
5. **Never enforce a pattern nobody chose.** Inferred conventions are
   stated explicitly in every CR and report entry. If no dominant
   convention exists, the task reports that instead of proposing fixes.

## Aggressiveness knobs (what sweep mode may change)

| Knob | Default | Sweep |
|---|---|---|
| Fleet-wide daily CR cap | 10 | 25 |
| Per-task daily caps | per task file | per task file × 2, rounded down |
| Confidence gates | high only → CR | unchanged |
| Fix-policy classes | per task file | unchanged |
| Batch sizes within a CR | per task file | unchanged |

Sweep mode changes *volume*, not *judgment*.
