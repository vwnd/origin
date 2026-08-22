# Task: Duplicate Mark Values

Severity class: 2 (documentation integrity) · Phase: v1

## Objective
Mark values are unique within each category (the Revit warning this task
closes the loop on). Renumber duplicates per the project's mark scheme with
a rationale, and recognize intentional duplicates instead of steamrolling
them. The value-add is scheme-consistent renumbering plus the
intentional-vs-accidental call.

## Inputs
- Element Mark parameters by category (doors, windows, casework, equipment,
  ...): Mark, type, level, host, phase
- Project standards file (optional): /standards/naming.md (mark schemes)
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Within each category and phase, group by Mark. Groups >1 are duplicates.
2. Classify each group:
   - **Accidental**: typically copy/paste or mirrored elements where every
     other property diverges (different levels, different hosts).
   - **Possibly intentional**: mirrored pairs, elements in the same group
     instance, or repeated identical assemblies where the firm may mark by
     unit rather than by instance. These are flagged, not fixed.
3. For accidental groups, the element that keeps its mark is the one placed
   first (or, when the scheme encodes location — e.g. door marks derive from
   room numbers — the one whose mark matches its location). Renumber the
   others per the scheme: next free value in the category's dominant format.
4. State the mark scheme used (from naming.md, or inferred — say which).
5. Skip groups matching the Exceptions log.

## Fix policy: auto-propose
The renumber is deterministic once the keeper and scheme are set; propose it
directly with a one-line rationale and an explicit confidence call. Groups
classified possibly-intentional never get a CR — they go to the daily report.

## Confidence gate
- High (draft CR): group classified accidental, scheme clear (≥80% of the
  category follows it), free values available in scheme format.
- Medium (flag, no CR): classification uncertain, or the category shows no
  dominant mark scheme (<60% agreement) — report that instead of inventing
  a scheme.

## Change request format
- Per element: element ID, category, current mark → proposed mark
- One-line rationale per group: keeper, scheme cited, why the dupe is
  judged accidental
- Batch by category, max 15 renumbers per CR

## Feedback handling
Rejected renumber → Exceptions log (element scope; pattern scope when the
reason indicates a class, e.g. "mirrored pairs share marks here"). Never
re-propose. 3+ rejections sharing a pattern → reclassify that pattern as
intentional, revise the inferred scheme if implicated, and note both in the
daily report.

## Hard limits
- Parameter writes only (Mark parameter). Never delete, create, or touch
  geometry.
- Max 2 CRs per day for this task.
- If >30 duplicate marks exist in a category, renumber the worst level only
  and report the total count.
