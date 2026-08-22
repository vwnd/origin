# Daily Report Format

The single artifact a BIM manager reads alongside the day's CRs: everything
that is *not* a change request — diagnose-only findings, flagged items,
convention revisions, backlog totals. Target read time: two minutes.

## Location

```
fleet/state/reports/YYYY-MM-DD.md
```

## Structure

Sections in this order; empty sections omitted. Findings within each
section follow fleet-rules.md severity ordering.

```markdown
# Fleet Daily Report — 2026-08-22

**8 CRs drafted · 5 findings · 3 flagged (no CR) · backlog 41 · 1 convention revision**

## Compliance findings (diagnose-only)
- [HIGH] Door 204A (Level 2): Fire Rating empty; host wall is 2 HR shaft wall.
  Required ≥ 90 min per compliance.md (IBC 716.1). No CR — diagnose-only task.
- [HIGH] Wall type "Shaft - Interior" on Level 3: Fire Rating "2" — unit
  missing; rooms adjacent write "2 hours". Confirm and normalize.

## Change requests drafted (8)
Ordered as delivered for review, severity first.
- CR-0151 [dup-room-numbers] Level 2: rooms 204/204 → keep east room (on 3
  sheets), renumber west to 206. 1 rename.
- CR-0152 [dup-marks] Doors, Level 1: 4 marks renumbered per <room><letter>
  scheme. 4 renames.
- CR-0153 [nomenclature] Level 2: 7 rooms renamed to Title Case per naming.md.

## Flagged, no CR (medium confidence)
- [nomenclature] "Studio A" vs "Design Space" vs "Room" on Level 4 — three
  patterns, no dominant convention (54% agreement). Suggest defining one in
  naming.md before the fleet proposes renames.
- [identical-instances] 2 overlapping columns at C4 — matches design-option
  exception pattern, skipped (uncertain match).

## Convention revisions
- [nomenclature] 3 rejections share a pattern: abbreviated mechanical room
  names kept as "MECH". Inferred convention revised to accept "MECH"; suggest
  adding it to naming.md accepted abbreviations.

## Deferred backlog
- [nomenclature] 41 outliers beyond today's cap — worst level (Level 2) covered
  today; remainder drawn down in following days or via sweep mode.

## Data gaps / errors
- Phase data absent for doors on Level 5 — duplicate-doors skipped that level.
```

## Section rules

- **Header summary line** — always present: CRs drafted, diagnose findings,
  flagged count, backlog total, convention revisions.
- **Compliance findings** — top section when non-empty (severity rank 1).
  Tag `[HIGH]`/`[MED]` per the task's confidence gate.
- **Change requests drafted** — one line per CR: id, task, scope, what
  changes, count. Full detail lives in the CR; this is the index.
- **Context & rec reports issued** — one line per report: id, task,
  location, recommended action. Full detail lives on the issue panel.
  Follows the CR section.
- **Flagged, no CR** — medium-confidence detections and uncertain exception
  matches, so nothing is silently dropped and the manager can promote one
  by tightening a rule.
- **Convention revisions** — required whenever 3+ rejections shared a
  pattern: old reading, new reading, suggested standards-file edit.
- **Deferred backlog** — totals for anything beyond daily caps. Silent
  truncation is forbidden: if a cap dropped work, the number appears here.
- **Data gaps / errors** — anything the fleet could not check, so absence
  of a finding is never mistaken for a pass.
