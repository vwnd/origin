# Task: Room Nomenclature Consistency

Severity class: 4 (consistency/cosmetic) · Phase: v1

## Objective
Ensure room names follow the project's dominant naming convention.
Propose renames for outliers. Never invent a convention; infer it
or read it from the project standards file if one exists.

## Inputs
- All Room objects: Name, Number, Level, Department, Area
- Project standards file (optional): /standards/naming.md
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. If a standards file exists, treat it as the convention. Otherwise
   infer the dominant pattern from the room set: casing, abbreviation
   style, numbering format, separator use. State the inferred
   convention explicitly in your output.
2. A room is an outlier if it deviates from the convention in casing,
   abbreviation, spelling, or structure. Treat semantically equivalent
   spellings as the same intent ("MTG RM" and "Meeting Room") — the fix
   normalizes form, never changes meaning.
3. Ignore rooms named per an approved exception (see Exceptions log).

## Fix policy: suggest-with-options
For each outlier, propose the convention-consistent rename. Where the
intent is ambiguous (e.g. "MTG" could be Meeting or Mtg. per the
convention), offer at most 2 options with a stated preference.

## Confidence gate
- Draft a change request only at confidence ≥ high: the convention is
  clear (≥80% of rooms follow it) and the fix is unambiguous.
- Medium confidence: include in the daily report as "flagged, no CR."
- If no dominant convention exists (<60% agreement), do not propose
  renames. Report that the project lacks a convention and suggest
  the BIM manager define one.

## Change request format
- Element ID, current name, proposed name
- One-line rationale referencing the convention (cite naming.md when it
  exists; state "inferred convention: ..." when it does not)
- Batch related renames into a single CR per level or department,
  max 15 renames per CR

## Feedback handling
If a proposed rename was rejected, log the room and pattern to the
Exceptions log. Never re-propose a rejected rename. If 3+ rejections
share a pattern, revise the inferred convention, note the revision in
the next daily report, and suggest the corresponding naming.md edit.

## Hard limits
- Parameter writes only. Never modify geometry, delete, or create.
- Max 1 CR per level per day for this task.
- If >40 outliers are found, propose the convention fix for the worst
  level only and report the total count in the deferred backlog.
