# Exceptions Log Format

What humans said no to, made durable: a dismissed finding is never proposed again. One log across all scouts.

## Location

```
fleet/state/exceptions.md
```

Append-only for the fleet. Humans may edit freely: seed rows for
known-intentional deviations, delete rows that no longer apply.

## Format

| Date | Scout | Scope | Element(s) | Pattern | Reason | Source |
|---|---|---|---|---|---|---|
| 2026-08-20 | room-nomenclature | element | 411203 | Room "design_space" | Client-required name, per PM | dismissed finding |
| 2026-08-20 | duplicate-marks | pattern | — | Casework marks duplicated across mirrored units | Intentional: mirrored pairs share marks | dismissed finding |
| 2026-08-21 | identical-instances | element | 502114, 502115 | Overlapping columns at C4 | Design option study | seeded by BIM manager |


## Rules of use

1. **Element scope** suppresses that fix for that element until a human
   deletes the row.
2. **Pattern scope** suppresses the class, applied conservatively: an
   uncertain match is skipped and listed in the daily report as "skipped
   per exception (uncertain match)" so a human can tighten or delete the
   row. (designed)
3. **3+ element rows sharing a pattern** trigger a convention revision in
   the daily report and may be consolidated into one pattern row. (designed)
4. The log is an input to every run. A proposal matching a log row is a
   bug.
