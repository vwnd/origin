# Scope Map — who detects what, and how far we close the loop

Detection ownership and deliverable class per issue. (Detection source
"Revit" means the native warning list imported through the pipeline —
fleet-rules.md, Detection sources.)

## Deliverable classes

| Label | What it is | Loop closure |
|---|---|---|
| [delete CR] | Change request deleting an element | Full — approve in Revit |
| [parameters update CR] | Change request updating parameter values (including names) | Full — approve in Revit |
| [context and rec] | Context analysis + recommendation report supporting the user's own fix in Revit/Speckle | Partial — user acts manually, but the issue arrives located, analyzed, with a recommended action |

`{geometry inference}` marks issues needing inference over geometry data
before the deliverable can be produced.

## The map

**Revit detects** (native warnings seed; agents triage, judge, draft):

- Duplicates
  - Marks → [parameters update CR] (renumber; a duplicated *element* is
    identical-instances' delete case)
  - Identical instances → [delete CR]
  - Room numbers → [parameters update CR]
- Off-axis
  - Lines `{geometry inference}` → [context and rec]
- Overlap
  - Wall and line `{geometry inference}` → [context and rec]
  - Wall segments `{geometry inference}` → [context and rec]

**We detect** (semantic — no native warning; full agent detection):

- Nomenclature: room names against conventions → [parameters update CR]
- Compliance: fire rating → [parameters update CR]
- Misspellings: sheet names, view names, text notes, comments →
  [parameters update CR] (room names excluded — nomenclature owns them)

## Design principles

1. **Warnings first** — never re-implement detection Revit already does
   (fleet-rules.md, Detection sources).
2. **Automate before agents** — deterministic steps go in the pipeline;
   agents do small, fast judgment work (fleet-rules.md).
3. **No locator/viewer in this project** — Speckle and Revit auto-locate
   from element IDs; reports carry IDs and context, nothing more.
4. **Cache-and-query runtime** — cache agent + SQL-querying task agents;
   run, instrument, then assess what to automate (runtime.md).

## Resolved questions

- **Duplicate marks: renumber** (decided 2026-08-22). Two distinct elements
  sharing a mark get a renumber [parameters update CR]; a duplicated
  *element* is identical-instances' [delete CR] case.
