# Task spec: Overlaps (wall/wall, line/wall)

Severity class 3 (model integrity) · v1.5 · [context and rec]
Waits on: warning ingestion (the warnings are the overlap inventory) and
geometry read as derived facts (extent measurements as rows, never meshes
to the scout).

## Objective

Overlaps are frequent and miserable to find; the work is the locating and
the judgment, not the fix. Deliver each overlap located, measured, and
dissected, with a recommended action. The user fixes manually in Revit.
This task never writes anything.

## Judgment

**Wall/wall**: distinguish a **join problem** (walls meet end-to-end or tee
and merely fail to clean up; recommend reviewing the join, not deleting)
from a **real overlap** (two walls occupying the same run; identify the
keeper by hosted elements, references, and phase fit, and recommend
shortening or deleting the redundant one).

**Line/wall**: a model line collinear with a wall's location line is almost
always a leftover trace; always recommend deleting the line, noting the
likely origin when change history supports it.

Never suppress a located overlap for low confidence; downgrade the
recommendation ("inspect: likely join issue", both readings given) and keep
the locating value. Carry unresolved reports forward as standing rather
than re-issuing.

## Stand-down conditions

- More than ~30 overlaps model-wide: report the worst level and the total.
  That volume signals an import or tracing artifact worth one conversation,
  not thirty reports.

## Severity

high — unambiguous geometry and a clear action (line/wall deletions almost
always are) · medium — close keeper call or probable join issue.
