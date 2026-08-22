# Task: Duplicate Room Numbers

Severity class: 2 (documentation integrity) · Phase: v1

## Objective
Every room number is unique within a phase. When two rooms share a number,
decide which rightfully keeps it, propose a renumber for the other, and
explain the decision. Revit can flag the duplicate; the keeper call is the
value-add.

## Inputs
Query contract with the cache agent (runtime.md) — only these objects and
fields, cheapest first, warning seed before room data.
- Imported Revit warnings: duplicate room 'Number' values (detection seed —
  fleet-rules.md, Detection sources)
- All Room objects: Number, Name, Level, Department, Area, phase,
  creation/edit recency where available
- Sheet and schedule references per room
- Project standards file (optional): /standards/naming.md (numbering scheme)
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Seed duplicate sets from the warning list. Fallback when the feed is
   absent: group rooms by Number within phase (note degraded coverage in
   the daily report).
2. Decide the keeper by weighing, in order:
   - **Documentation footprint**: the room on more sheets/schedules keeps
     (renumbering it breaks the most annotation).
   - **Numbering-scheme fit**: if numbers encode level (per naming.md or
     the inferred scheme), the room on the matching level keeps; room 204
     on Level 3 is the likelier mistake.
   - **Recency**: the recently created or renumbered room is the likelier
     accident.
3. Propose for the non-keeper the nearest free number consistent with the
   scheme on its level.
4. Skip sets matching the Exceptions log.

## Fix policy: suggest-with-options
Propose the keeper decision and renumber with a stated preference. If the
call is genuinely close (similar footprint, both scheme-valid), offer both
directions as the 2 options — never more.

## Confidence gate
- High (draft CR): one room clearly keeps (wins on footprint or scheme fit
  without contradiction) and a scheme-consistent free number exists.
- Medium (flag, no CR): comparable claims, or no free number fits the
  scheme without renumbering neighbors.
- No discernible numbering scheme: propose only the minimal fix (nearest
  free number) and say the scheme was not inferable.

## Change request format
- Per duplicate set: both element IDs, keeper and why in one line ("east
  204 keeps: on 3 sheets; west 204 on none, created last week"), current →
  proposed number
- Batch sets by level, max 5 sets per CR (each set is two rooms — keep the
  per-CR reading load small)

## Feedback handling
Rejected renumber → Exceptions log with set and reason; never re-propose,
including the mirror-image proposal (swapped keeper) unless the rejection
reason says the keeper call was backwards. 3+ rejections sharing a pattern
→ revise the inferred numbering scheme, note it in the daily report.

## Hard limits
- Parameter writes only (Number). Never renumber the keeper, never
  cascade-renumber neighbors — if the clean fix needs a cascade, flag it.
- Max 2 CRs per day.
- If >10 duplicate sets, fix the worst level only and report the total.
