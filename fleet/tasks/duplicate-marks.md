# Task: Duplicate Mark Values

Severity class: 2 (documentation integrity) · Phase: v1

## Objective
Mark values are unique within each category. Renumber duplicates per the
project's mark scheme with a rationale, and recognize intentional
duplicates instead of steamrolling them. The value-add is scheme-consistent
renumbering plus the intentional-vs-accidental call.

## Inputs
Query contract with the cache agent (runtime.md) — only these objects and
fields, cheapest first, warning seed before element data.
- Imported Revit warnings: "Elements have duplicate 'Mark' values."
  (detection seed — fleet-rules.md, Detection sources)
- Element Mark parameters by category (doors, windows, casework, equipment,
  …): Mark, type, level, host, phase
- Project standards file (optional): /standards/naming.md (mark schemes)
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Seed duplicate groups from the warning list. Fallback when the feed is
   absent: group by Mark within category and phase (note degraded coverage
   in the daily report).
2. Classify each group:
   - **Accidental**: typically copy/paste or mirrored elements where every
     other property diverges (different levels, hosts).
   - **Possibly intentional**: mirrored pairs, same group instance, or
     repeated identical assemblies the firm may mark by unit — flag, don't
     fix.
3. For accidental groups: the first-placed element keeps its mark (or, when
   the scheme encodes location — e.g. door marks derive from room numbers —
   the one whose mark matches its location). Renumber the others to the
   next free value in the category's dominant format.
4. State the mark scheme used (naming.md or inferred — say which).
5. Skip groups matching the Exceptions log.

## Fix policy: auto-propose
Deterministic once keeper and scheme are set; propose with a one-line
rationale and explicit confidence call. Possibly-intentional groups never
get a CR — they go to the daily report.

## Confidence gate
- High (draft CR): accidental, scheme clear (≥80% of the category follows
  it), free values available in scheme format.
- Medium (flag, no CR): classification uncertain, or no dominant scheme
  (<60% agreement) — report that instead of inventing one.

## Change request format
- Per element: element ID, category, current → proposed mark
- One-line rationale per group: keeper, scheme cited, why judged accidental
- Batch by category, max 15 renumbers per CR

## Feedback handling
Rejected renumber → Exceptions log (element scope; pattern scope when the
reason indicates a class, e.g. "mirrored pairs share marks here"); never
re-propose. 3+ sharing a pattern → reclassify that pattern as intentional,
revise the inferred scheme if implicated, note both in the daily report.

## Hard limits
- Parameter writes only (Mark). Never delete, create, or touch geometry.
- Max 2 CRs per day.
- If >30 duplicate marks in a category, renumber the worst level only and
  report the total.
