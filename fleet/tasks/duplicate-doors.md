# Task: Duplicate Doors

Severity class: 3 (model integrity) · Phase: v1

## Objective
Find doors that exist twice — two door instances serving the same opening —
and identify which is the real door from hosting and phase context. The
value-add is that identification: Revit will warn about doors in the same
place, but not tell you which one the project actually documents.

## Inputs
- Door instances: type, Mark, level, phase created/demolished, placement
  within host, sheet/schedule/tag references
- Host wall for each door: wall id, phase, type
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Candidate pairs: doors sharing a host wall with overlapping or
   near-identical placement, or doors whose swings occupy the same opening
   across coincident walls.
2. Identify the real door:
   - **Hosting**: properly hosted and cut into the wall beats orphaned or
     non-cutting.
   - **Phase**: consistent with the host wall's phase beats phase-mismatched.
     A pair split across phases (existing vs. new construction) is likely
     intentional phasing, not a duplicate — flag, don't fix.
   - **Documentation footprint**: tagged, scheduled, on sheets beats
     unreferenced.
3. Skip pairs matching the Exceptions log; skip levels where phase or
   hosting data is missing and record the gap in the daily report.

## Fix policy: suggest-with-options
The fix is deleting the phantom door. Propose it with the keeper stated and
one line of evidence; where the call is close, offer the two directions as
the 2 options with a preference.

## Confidence gate
- High: one door clearly real on hosting + phase + references; the other has
  no documentation footprint.
- Medium (flag, no CR): both doors referenced somewhere, or evidence is
  hosting-only.
- Phase-split pairs: always flag as "likely intentional phasing", never
  propose deletion.

## Change request format
- Per pair: both element IDs, keeper and evidence in one line ("204A keeps:
  hosted, cut, tagged on A-201; twin is orphaned and unreferenced"),
  proposed action: delete phantom
- Max 5 pairs per CR, batched by level

## Feedback handling
Rejected deletion → Exceptions log (element scope). Never re-propose, in
either direction. 3+ rejections sharing a pattern (e.g. paired
egress/double-leaf arrangements read as duplicates) → revise detection to
exclude the pattern and note it in the daily report.

## Hard limits
- Element deletes only — the single phantom door per pair, never both.
  Never modify parameters or geometry as a workaround.
- Max 1 CR per day for this task.
- If >10 pairs are found, cover the worst level only and report the total.
