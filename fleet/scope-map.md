# Scope map

Who detects what, how far each capability closes the loop, and what gates
each phase. Phases match the scope ladder in `product-overview.md` §8.

## Deliverable classes

| Label | What it is | Loop closure |
|---|---|---|
| [parameters update CR] | Change request updating parameter values | Full — approve in Revit |
| [delete CR] | Change request deleting an element | Full — approve in Revit |
| [context and rec] | Located, analyzed issue + recommended action | Partial — user acts; finding and diagnosis are done |

## The map

Each phase is gated by one runtime capability, in order: scoped candidate
selection (v0.5) → per-object deltas (v1) → warning ingestion + geometry
read (v1.5) → geometry write (v2). Everything live today is agent-detected
over the parameter index; Speckle does not yet expose Revit's warning list,
so warnings-seeded capabilities are parked as specs in `fleet/tasks/`.

**v0 — live** 
- parameter-value-consistency (misspellings, notation drift,
unit incoherence, junk values) → [parameters update CR].

**v0.5 — scout bodies in `fleet/scouts/`** 
- compliance-triage → [parameters update CR], missing values stay diagnose-only
- room-nomenclature → [parameters update CR], the no-convention finding is [context and rec]
- duplicate-marks → [context and rec].

**v1** 
- duplicate-marks and duplicate-room-numbers as
[parameters update CR] (renumbers)
- nomenclature beyond rooms.

**v1.5 — warnings-seeded** 
- identical-instances → [delete CR]
- overlap-locator, off-axis-lines, room-not-enclosed → [context and rec].

**v2** 
- off-axis snap
- simple element creation (e.g. a wall closing a room
boundary) → creation CRs.

## Principles

- **Ship the *closure* the write path supports.** What cannot
  close fully still arrives located, dissected, with a recommended action.
- **Warnings-first once warnings are reachable.** Where Revit already
  warns, the agent starts where the warning stops: triage, keeper call,
  rationale.
- **Severity classes order everything.** 1 life-safety/compliance ·
  2 documentation integrity · 3 model integrity · 4 consistency/cosmetic.
