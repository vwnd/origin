# Task: Identical Instances in the Same Place

Severity class: 3 (model integrity) · Phase: v1

## Objective
Find pairs of identical elements occupying the same position — the classic
double-paste that doubles quantities and clutters clash reports — and make
the call Revit's warning doesn't: true duplicate vs. intentional overlap
(phasing, design options, groups). Propose deleting only true duplicates.

## Inputs
Query contract with the cache agent (runtime.md) — only these objects and
fields, cheapest first, warning seed before placement data.
- Imported Revit warnings: "There are identical instances in the same
  place." (detection seed — fleet-rules.md, Detection sources)
- Instance placement points, type, level, rotation/orientation, phase
  created/demolished, group and design-option membership, host,
  tag/schedule/sheet references (placement points enrich classification;
  the warning seed lets the task run without them, with weaker tolerance
  checks)
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Seed candidate pairs from the warning list. Fallback or supplement (e.g.
   near-coincident pairs the exact-overlap test misses): same type, same
   level, placement coincident within ~1mm, same orientation.
2. Classify:
   - **True duplicate**: identical in every respect, no phase difference,
     neither in a design option, at most one carrying references.
   - **Intentional**: split across phases (existing/demo/new), in different
     design options, or in different group instances. Flag if noisy, never
     propose deletion.
3. Keeper: the instance with the documentation footprint (tags, schedules,
   hosted elements); tie → earlier-placed.
4. Skip pairs matching the Exceptions log.

## Fix policy: auto-propose (delete)
Delete the redundant instance — deterministic for true duplicates — with
rationale and an explicit confidence call.

## Confidence gate
- High: true duplicate with no phase/option/group signal and a clear keeper.
- Medium (flag, no CR): any weak intentionality signal, or incomplete
  reference data for the pair.
- Missing phase or option data for a level: skip the level and record the
  gap in the daily report — never delete on partial context.

## Change request format
- Per pair: both element IDs, type, location (level + nearest grid), keeper
  and one-line rationale ("keeps: tagged and hosts 2 outlets; twin added
  later, unreferenced"), proposed action: delete duplicate
- Max 10 pairs per CR, batched by level

## Feedback handling
Rejected deletion → Exceptions log (element scope; pattern scope when the
reason names a class, e.g. "option-study overlaps in this zone"); never
re-propose. 3+ sharing a pattern → treat that pattern as intentional going
forward, note the revision in the daily report.

## Hard limits
- Element deletes only — one instance per pair, never both. Never modify
  parameters or geometry as a workaround.
- Max 1 CR per day.
- If >20 true-duplicate pairs, cover the worst level only and report the
  total — that volume suggests a bad copy/paste event worth a human look.
