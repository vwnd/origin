# Scope Map — who detects what, and how far we close the loop

The working map of detection ownership and deliverable class per issue.
(Detection source "Revit" means the native warning list imported through the
pipeline — see fleet-rules.md, Detection sources.)

## Deliverable classes

| Label | What it is | Loop closure |
|---|---|---|
| [delete CR] | Change request deleting an element | Full — approve in Revit |
| [parameters update CR] | Change request updating parameter values (including names) | Full — approve in Revit |
| [context and rec] | Context analysis + recommendation report to support the user's own decision in Revit/Speckle | Partial — user acts manually, but arrives with the issue located, analyzed, and a recommended action |

`{geometry inference}` marks issues needing additional inference over geometry
data before the deliverable can be produced.

## The map

**Revit detects** (native warnings are the seed; agents triage, judge, draft):

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

**We detect** (semantic — no native warning exists; full agent detection):

- Nomenclature misalignment
  - Room names against conventions → [parameters update CR]
- Compliance
  - Fire rating → [parameters update CR]

## Design principles

1. **Warnings first** — never re-implement detection Revit already does
   (fleet-rules.md, Detection sources).
2. **Automate before agents** — agents are for small, fast judgment tasks. Whenever a step is
   deterministically automatable (e.g., data extraction), automate it in the pipeline so agent work time stays
   short. Partly a note for the infra teammates' scope
   (fleet-rules.md, Automate before agents).
3. **Locator/viewer is parked** — screenshot/viewer generation is not agent
   work. [context and rec] reports locate issues with element IDs (Revit's
   Select by ID is the deterministic locator), level, and grid references.
   Rendered views return only if infra ships them as a deterministic,
   automatically-fired step.

## Resolved questions

- **Duplicate marks: renumber** (decided 2026-08-22). Two distinct elements
  sharing a mark get a renumber [parameters update CR]; a duplicated *element*
  is identical-instances' [delete CR] case.
