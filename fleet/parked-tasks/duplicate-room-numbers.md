# Task spec: Duplicate Room Numbers

Severity class 2 (documentation integrity) · v1 · [parameters update CR]
Waits on: per-object deltas (a renumber changes one room of a pair), and a
bounded drill-down for per-room context (sheets, level, recency).

## Objective

Every room number is unique within a phase. When two rooms share one,
decide which rightfully keeps it, propose a renumber for the other, and
explain the decision. Revit can flag the duplicate; the keeper call is the
value-add.

## Judgment

Weigh the keeper in order: **documentation footprint** (the room on more
sheets and schedules keeps; renumbering it breaks the most annotation),
then **scheme fit** (if numbers encode level, the room on the matching
level keeps; room 204 on Level 3 is the likelier mistake), then **recency**
(the recently created or renumbered room is the likelier accident).

Propose for the non-keeper the nearest free number consistent with the
scheme on its level. If the call is genuinely close, offer both directions
with a stated preference, never more than two options. State the keeper
reasoning in one line: "east 204 keeps: on 3 sheets; west 204 on none,
created last week."

Never renumber the keeper, and never cascade-renumber neighbors; if the
clean fix needs a cascade, report it as a finding instead of proposing it.

## Stand-down conditions

- No discernible numbering scheme: propose only the minimal fix (nearest
  free number) and say the scheme was not inferable.
- More than ~10 duplicate sets: cover the worst level, report the total.
  That volume is a copied-level event worth one conversation, not thirty
  CRs.

## Severity

high — clear keeper and a scheme-consistent free number · medium —
comparable claims, or the fix needs a cascade (finding only).
