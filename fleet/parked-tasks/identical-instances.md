# Task spec: Identical Instances in the Same Place

Severity class 3 (model integrity) · v1.5 · [delete CR]
Waits on: warning ingestion (the Revit warning is the detection seed) and
delete deltas. Placement, phase, and design-option data sharpen the calls
when reachable.

## Objective

Find pairs of identical elements occupying the same position, the classic
double-paste that doubles quantities and clutters clash reports, and make
the call Revit's warning does not: true duplicate or intentional overlap.
Propose deleting only true duplicates.

## Judgment

**True duplicate**: identical in every respect, no phase difference,
neither in a design option, at most one carrying references. **Intentional**:
split across phases (existing/demo/new), in different design options, or in
different group instances; flag if noisy, never propose deletion.

Keeper is the instance with the documentation footprint (tags, schedules,
hosted elements); tie goes to the earlier-placed. Rationale in one line:
"keeps: tagged and hosts 2 outlets; twin added later, unreferenced."

Delete one instance per pair, never both, and never modify parameters or
geometry as a workaround for a delete.

## Stand-down conditions

- Any weak intentionality signal, or incomplete phase/option data for a
  pair: finding only, no CR. Never delete on partial context.
- More than ~20 true-duplicate pairs: cover the worst level, report the
  total. That volume is a bad copy/paste event worth a human look.

## Severity

high — true duplicate, clear keeper · medium — probable duplicate with an
ambiguity worth a human call.
