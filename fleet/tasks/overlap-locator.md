# Task: Overlaps (wall/wall, line/wall)

Severity class: 3 (model integrity) · Phase: v1.5 (geometry read) · Fix policy: [context and rec]

## Objective
Overlaps are frequent and annoying to find and inspect — the work is the
locating and the judgement, not the fix. Deliver each overlap as a context &
recommendation report — element IDs (Speckle/Revit auto-locate from them),
measured extent, one-paragraph dissection, recommended action — on the
issue panel. The user fixes manually in Revit. Never writes anything.

## Inputs
Query contract with the cache agent (runtime.md) — only these objects and
fields, cheapest first, warning seed before geometry.
- Imported Revit warnings: "Highlighted walls overlap." and wall–line
  overlap warnings (detection seed — fleet-rules.md, Detection sources)
- Wall location lines, model/detail line geometry, reference planes: curve,
  level, phase (to dissect and measure extents on the seeded warnings)
- Element metadata: type, hosted elements, tag/schedule/sheet references,
  recent-change history where available
- Exceptions log: fleet/state/exceptions.md
- Prior packages for this task (resolved and dismissed)

## Detection
0. Seed from the warning list — the warnings *are* the overlap inventory;
   this task adds the dissection and proposal. Geometry detection below is
   the fallback when the feed is absent, and the measurement layer either
   way.
1. **Wall/wall**: location lines parallel and coincident (within model
   tolerance) with overlapping segments on the same level. Distinguish:
   - **Join problem**: walls meet end-to-end or tee and merely fail to
     join/clean up — propose reviewing the join, not deleting.
   - **Real overlap**: two walls occupying the same run — identify the
     keeper (hosted elements, references, phase fit); propose shortening or
     deleting the redundant one.
2. **Line/wall**: a model line collinear with a wall's location line —
   typically a leftover trace. **Always propose deleting the line.** Note
   the likely origin (recent re-layout) when change history supports it.
3. Skip Exceptions-log matches; carry unresolved reports forward as
   STANDING rather than re-issuing.

## Fix policy: [context and rec]
No CRs. Each finding is a context & recommendation report
(formats/context-rec-report.md): element IDs plus level/grid, one-paragraph
dissection with measured extent, concrete recommended action.

## Confidence gate
- High: overlap geometry unambiguous and the action clear (line/wall
  deletions almost always are).
- Medium: close keeper call, or possibly a join problem — report as
  "inspect: likely join issue" with both readings, still fully located.
- Never suppress a located overlap for low confidence — downgrade the
  recommendation, keep the locating value.

## Change request format
Not applicable — context & rec reports only, indexed in the daily report,
grouped on the issue panel by recommended-action type then level
(context-rec-report.md, Panel grouping).

## Feedback handling
Dismissed report → Exceptions log with reason (element scope; pattern scope
when the reason names a class, e.g. "trace lines in the lobby are working
drawings"); never re-issue. 3+ dismissals sharing a pattern → tighten
detection, note it in the daily report.

## Hard limits
- Read-only. No CRs, no writes, ever.
- Max 10 new reports per day; overflow to the deferred backlog, largest
  overlap extent first.
- If >30 overlaps model-wide, report the worst level only and give the
  total — that volume signals an import or tracing artifact worth one
  conversation, not thirty reports.
