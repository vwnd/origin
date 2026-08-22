# Task: Identical Instances in the Same Place

Severity class: 3 (model integrity) · Phase: v1

## Objective
Find pairs of identical elements occupying the same position — the classic
double-paste that doubles quantities and clutters clash reports — and make
the confidence call Revit's warning doesn't: true duplicate vs. intentional
overlap (phasing, design options, grouped assemblies). Propose deleting only
true duplicates.

## Inputs
- Instance placement points, type, level, rotation/orientation, phase
  created/demolished, group and design-option membership, host,
  tag/schedule/sheet references
  (placement points come from the geometry-read data feed — listed in the
  infra asks; without them this task cannot run)
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Candidate pairs: same type, same level, placement points coincident
   within tolerance (model precision, ~1mm), same orientation.
2. Classify:
   - **True duplicate**: identical in every respect, no phase difference,
     neither in a design option, at most one carrying references.
   - **Intentional**: split across phases (existing/demo/new), in different
     design options, or members of different group instances — these overlap
     on purpose. Flag if noisy, never propose deletion.
3. The keeper is the instance with the documentation footprint (tags,
   schedules, hosted elements attached); tie → the earlier-placed instance.
4. Skip pairs matching the Exceptions log.

## Fix policy: auto-propose (delete)
For true duplicates the fix is deterministic — delete the redundant
instance — proposed with rationale and an explicit confidence call.

## Confidence gate
- High: classified true duplicate with no phase/option/group signal and a
  clear keeper.
- Medium (flag, no CR): any intentionality signal is present but weak, or
  reference data is incomplete for the pair.
- Missing phase or option data for a level: skip the level and record the
  gap in the daily report — never make the deletion call on partial context.

## Change request format
- Per pair: both element IDs, type, location (level + nearest grid), keeper
  and one-line rationale ("keeps: tagged and hosts 2 outlets; twin added
  later, unreferenced"), proposed action: delete duplicate
- Max 10 pairs per CR, batched by level

## Feedback handling
Rejected deletion → Exceptions log (element scope; pattern scope when the
reason names a class, e.g. "option-study overlaps in this zone"). Never
re-propose. 3+ rejections sharing a pattern → treat that pattern as
intentional going forward and note the revision in the daily report.

## Hard limits
- Element deletes only — one instance per pair, never both. Never modify
  parameters or geometry as a workaround.
- Max 1 CR per day for this task.
- If >20 true-duplicate pairs are found, cover the worst level only and
  report the total — a count that high suggests a bad copy/paste event
  worth a human look rather than incremental cleanup.
