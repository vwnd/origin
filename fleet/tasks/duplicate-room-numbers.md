# Task: Duplicate Room Numbers

Severity class: 2 (documentation integrity) · Phase: v1

## Objective
Every room number is unique within a phase. When two rooms share a number,
decide which room rightfully keeps it, propose a renumber for the other, and
explain the decision. The value-add is the keeper call — Revit can flag the
duplicate; it cannot tell you which room is the mistake.

## Inputs
- Imported Revit warnings: duplicate room 'Number' values (detection seed —
  see fleet-rules.md, Detection sources)
- All Room objects: Number, Name, Level, Department, Area, phase,
  creation/edit recency where available
- Sheet and schedule references: which sheets/schedules each room appears on
- Project standards file (optional): /standards/naming.md (numbering scheme)
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Seed duplicate sets from the imported Revit warning list. Fallback when
   the warning feed is absent: group rooms by Number within each phase
   (note degraded coverage in the daily report).
2. Decide the keeper by weighing, in order:
   - **Documentation footprint**: the room referenced on more sheets and
     schedules keeps its number (renumbering it breaks the most annotation).
   - **Numbering-scheme fit**: if numbers encode level (per naming.md or the
     inferred scheme), the room on the matching level keeps; room 204 on
     Level 3 is the likelier mistake.
   - **Recency**: the recently created or recently renumbered room is the
     likelier accident.
3. Propose the new number for the non-keeper: the nearest free number
   consistent with the project's scheme on that room's level.
4. Skip duplicate sets matching the Exceptions log.

## Fix policy: suggest-with-options
Propose the keeper decision and the renumber with a stated preference. If
the keeper call is genuinely close (similar footprint, both scheme-valid),
offer both directions as the 2 options — never more.

## Confidence gate
- High (draft CR): one room clearly keeps (wins on documentation footprint
  or scheme fit without contradiction) and a scheme-consistent free number
  exists.
- Medium (flag, no CR): both rooms have comparable claims, or no free
  number fits the scheme without renumbering neighbors.
- If the project has no discernible numbering scheme, propose only the
  minimal fix (nearest free number) and say the scheme was not inferable.

## Change request format
- Per duplicate set: both element IDs, which keeps and why (one line —
  e.g. "east 204 keeps: on 3 sheets; west 204 on none, created last week"),
  current → proposed number for the renumbered room
- Batch sets by level, max 5 duplicate sets per CR (each set is two rooms —
  keep the reviewer's per-CR reading load small)

## Feedback handling
Rejected renumber → Exceptions log with the set and reason. Never re-propose
a rejected renumber, including the mirror-image proposal (swapping keeper)
unless the rejection reason explicitly says the keeper call was backwards.
3+ rejections sharing a pattern → revise the inferred numbering scheme and
note it in the daily report.

## Hard limits
- Parameter writes only (Number parameter). Never renumber the keeper, never
  cascade-renumber neighbors to make room — if the clean fix needs a cascade,
  flag it instead.
- Max 2 CRs per day for this task.
- If >10 duplicate sets exist, fix the worst level only and report the total.
