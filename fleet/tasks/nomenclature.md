# Task: Room Nomenclature Consistency

Severity class: 4 (consistency/cosmetic) · Phase: v1

## Objective
Ensure room names follow the project's dominant naming convention; propose
renames for outliers. Never invent a convention — read it from the standards
file or infer it.

## Inputs
Query contract with the cache agent (runtime.md) — only these objects and
fields, cheapest first.
- All Room objects: Name, Number, Level, Department, Area
- Project standards file (optional): /standards/naming.md
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. If a standards file exists, it is the convention. Otherwise infer the
   dominant pattern (casing, abbreviation style, numbering format,
   separators) and state the inferred convention explicitly in your output.
2. An outlier deviates in casing, abbreviation, spelling, or structure.
   Treat semantically equivalent spellings as the same intent ("MTG RM" =
   "Meeting Room") — normalize form, never change meaning.
3. Skip rooms covered by the Exceptions log.

## Fix policy: suggest-with-options
Propose the convention-consistent rename. Where intent is ambiguous ("MTG"
could be Meeting or Mtg. per the convention), offer at most 2 options with
a stated preference.

## Confidence gate
- High (draft CR): convention clear (≥80% of rooms follow it) and the fix
  unambiguous.
- Medium: daily report as "flagged, no CR."
- No dominant convention (<60% agreement): propose nothing; report that the
  project lacks a convention and suggest the BIM manager define one.

## Change request format
- Element ID, current name, proposed name
- One-line rationale citing naming.md, or "inferred convention: ..." when
  none exists
- Batch per level or department, max 15 renames per CR

## Feedback handling
Rejected rename → Exceptions log (room and pattern); never re-propose. 3+
rejections sharing a pattern → revise the inferred convention, note it in
the daily report, and suggest the naming.md edit.

## Hard limits
- Parameter writes only. Never modify geometry, delete, or create.
- Max 1 CR per level per day.
- If >40 outliers, fix the worst level only; report the total in the
  deferred backlog.
