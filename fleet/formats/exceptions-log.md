# Exceptions Log Format

One log, shared across all tasks: the record of fixes the humans said no to, and
of deviations that are intentional. Every task's Detection step must consult it
before proposing anything. This is what makes rejection feedback durable —
a rejected fix is never re-proposed.

## Location

```
fleet/state/exceptions.md
```

Append-only for the fleet. Humans may edit freely: seed rows proactively for
known-intentional deviations, or delete rows when an exception no longer applies.

## Format

A single markdown table. One row per exception.

```markdown
# Exceptions Log

| Date | Task | Scope | Element(s) | Pattern | Reason | Source |
|---|---|---|---|---|---|---|
| 2026-08-20 | nomenclature | element | 411203 | Room "design_space" | Client-required name, per PM | CR-0142 rejected |
| 2026-08-20 | duplicate-marks | pattern | — | Casework marks duplicated across mirrored units | Intentional: mirrored pairs share marks | CR-0139 rejected |
| 2026-08-21 | identical-instances | element | 502114, 502115 | Overlapping columns at grid C4 | Design option study in progress | seeded by BIM manager |
```

### Columns

- **Date** — when the exception was logged (absolute date).
- **Task** — the task file name (matches `tasks/*.md`).
- **Scope** — `element` (this element only) or `pattern` (a class of fixes).
- **Element(s)** — Revit element IDs, or `—` for pattern-scope rows.
- **Pattern** — short description of what was proposed. For pattern-scope rows
  this is the matching rule; write it concretely enough that the task can apply
  it without guessing.
- **Reason** — the rejection reason as given, or the human's note for seeded
  rows. If infra delivered only a reject event with no reason, write
  `rejected, no reason given`.
- **Source** — the rejected CR id, or `seeded by <who>`.

## Rules of use

1. **Element scope** suppresses re-proposing that fix for that element, forever,
   unless a human deletes the row.
2. **Pattern scope** suppresses the whole class of fix. Tasks apply pattern rows
   conservatively — when unsure whether a candidate matches a pattern row, skip
   it and list it in the daily report as "skipped per exception (uncertain
   match)" so a human can tighten or delete the row.
3. **3+ element-scope rows sharing a pattern** (same task, similar fix) trigger
   the task's convention-revision step: the task revises its inferred convention
   or flags the standards-file rule, notes the revision in the daily report, and
   the runner may consolidate the rows into one pattern row.
4. The log is an input to every task run — a task that proposes a fix matching a
   log row is a bug in the task file.
