# Exceptions Log Format

One log, shared across all tasks: fixes the humans said no to, and
deviations that are intentional. Every task's Detection step consults it
before proposing anything — this is what makes rejection feedback durable.

## Location

```
fleet/state/exceptions.md
```

Append-only for the fleet. Humans may edit freely: seed rows for
known-intentional deviations, delete rows that no longer apply.

## Format

A single markdown table, one row per exception.

```markdown
# Exceptions Log

| Date | Task | Scope | Element(s) | Pattern | Reason | Source |
|---|---|---|---|---|---|---|
| 2026-08-20 | nomenclature | element | 411203 | Room "design_space" | Client-required name, per PM | CR-0142 rejected |
| 2026-08-20 | duplicate-marks | pattern | — | Casework marks duplicated across mirrored units | Intentional: mirrored pairs share marks | CR-0139 rejected |
| 2026-08-21 | identical-instances | element | 502114, 502115 | Overlapping columns at grid C4 | Design option study in progress | seeded by BIM manager |
```

### Columns

- **Date** — when logged (absolute date).
- **Task** — task file name (matches `tasks/*.md`).
- **Scope** — `element` (this element only) or `pattern` (a class of fixes).
- **Element(s)** — Revit element IDs, or `—` for pattern rows.
- **Pattern** — what was proposed. For pattern rows this is the matching
  rule; write it concretely enough to apply without guessing.
- **Reason** — the rejection reason as given, or the human's note for
  seeded rows. If infra delivered only a reject event, write `rejected, no
  reason given`.
- **Source** — the rejected CR id, or `seeded by <who>`.

## Rules of use

1. **Element scope** suppresses that fix for that element forever, unless a
   human deletes the row.
2. **Pattern scope** suppresses the whole class. Apply pattern rows
   conservatively — when unsure whether a candidate matches, skip it and
   list it in the daily report as "skipped per exception (uncertain match)"
   so a human can tighten or delete the row.
3. **3+ element-scope rows sharing a pattern** (same task, similar fix)
   trigger the task's convention-revision step; the runner may consolidate
   the rows into one pattern row.
4. The log is an input to every run — a task proposing a fix that matches a
   log row is a bug in the task file.
