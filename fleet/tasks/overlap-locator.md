# Task: Overlaps (wall/wall, line/wall)

Severity class: 3 (model integrity) · Phase: v1.5 (geometry read) · Fix policy: [context and rec]

## Objective
Overlaps are frequent, annoying to find, and annoying to inspect — the work
is not the fix, it's the locating and the judgement. This task does that
work: each overlap arrives as a context & recommendation report — element
IDs (Speckle/Revit auto-locate from them), measured extent, one-paragraph
dissection, and a recommended action — on the issue panel. The user fixes
manually in Revit, with zero search-and-squint effort. Never writes
anything.

## Inputs
Model-data bullets are the query contract with the cache agent (runtime.md):
query only these objects and fields, cheapest first — warning seed before
geometry.
- Imported Revit warnings: "Highlighted walls overlap." and wall–line
  overlap warnings (detection seed — see fleet-rules.md, Detection sources)
- Wall location lines, model/detail line geometry, reference planes:
  curve, level, phase (geometry-read feed — used to dissect and measure
  extents on the seeded warnings)
- Element metadata: type, hosted elements, tag/schedule/sheet references,
  recent-change history where available
- Exceptions log: fleet/state/exceptions.md
- Prior packages for this task (resolved and dismissed)

## Detection
0. Seed from the imported Revit warning list — the warnings *are* the
   overlap inventory; this task's job is the dissection, views, and
   proposal on top. Geometry-based detection below is the fallback when
   the feed is absent, and the measurement layer either way.
1. **Wall/wall**: location lines parallel and coincident (within model
   tolerance) with overlapping segments on the same level. Distinguish:
   - **Join problem**: walls meet end-to-end or tee and merely fail to
     join/clean up — propose reviewing the join, not deleting anything.
   - **Real overlap**: two walls genuinely occupying the same run — identify
     the keeper (hosted elements, references, phase fit) and propose
     shortening or deleting the redundant one.
2. **Line/wall**: a model line collinear/coincident with a wall's location
   line — typically a leftover trace or sketch line. **Between a line and a
   wall, always propose deleting the line.** Note the likely origin (recent
   re-layout) when change history supports it.
3. Skip matches in the Exceptions log; carry forward unresolved reports
   as STANDING rather than re-issuing.

## Fix policy: [context and rec]
No CRs. Each finding becomes a context & recommendation report
(formats/context-rec-report.md): element IDs plus level/grid, one-paragraph
dissection with measured extent, and a concrete recommended action.

## Confidence gate
- High: overlap geometry is unambiguous and the proposed action is clear
  (line/wall deletions are almost always high).
- Medium: keeper call between two walls is close, or the overlap may be a
  join problem — report it as "inspect: likely join issue" with both
  readings stated, still fully located.
- Never suppress a located overlap for low confidence — downgrade the
  recommendation, keep the locating value.

## Change request format
Not applicable — this task produces context & rec reports only, indexed in
the daily report and grouped on the issue panel by recommended-action type,
then level (see context-rec-report.md, Panel grouping).

## Feedback handling
Dismissed report → Exceptions log with the dismissal reason (element
scope; pattern scope when the reason names a class, e.g. "trace lines in
the lobby are working drawings"). Never re-issue a dismissed report.
3+ dismissals sharing a pattern → tighten detection and note it in the
daily report.

## Hard limits
- Read-only. No CRs, no writes, ever, from this task.
- Max 10 new reports per day; overflow to the deferred backlog with
  totals, worst (largest overlap extent) first.
- If >30 overlaps exist model-wide, report the worst level only and
  give the total — that volume signals an import or tracing artifact
  worth one conversation, not thirty reports.
