# Daily Report Format

The single artifact a BIM manager reads each day: the run's Speckle issue,
retitled as the report ("Scout daily report — <model> — <date>"). Proposed
edits ride the same issue as objectDeltas and are applied in Speckle's
viewer; the report body is everything worth reading around them. Target
read time: two minutes.

Sections in order, empty sections omitted, findings severity-ordered
(high → medium → low) within each. Sections marked (designed) render once
their feature lands; nothing else about the format changes.

```markdown
# Scout daily report — ARCH-CARTER — 2026-08-24

**6 findings · 4 with proposed edits · 2 diagnose-only · deferred 3**

## Proposed edits
One line per finding: scout, scope, current → proposed, count, rationale.
- [compliance-triage · HIGH] Walls, Fire Rating: "120 min" → "2 HR" (3
  elements). Notation variant of the project's standard form.
- [room-nomenclature · HIGH] Rooms: "MEETING ROOM", "meeting room" →
  "Meeting Room" (2). Dominant convention: Title Case, 14 of 16 rooms.

## Diagnose-only findings
Located and analyzed, no edit attached. Every entry carries element IDs, 
what was found with measured
specifics, and a concrete recommended action with the keeper reasoning in
one line.
- [duplicate-marks · HIGH] Doors: "D101" × 2. Scheme is D<level><seq>;
  D112 is free. Likely a copied pair.
- [room-nomenclature · MED] No dominant convention among Level 4 room
  names (54% agreement). Recommend defining one before renames are
  proposed.

## Deferred
Findings beyond the per-report cap, severity-ordered, totals stated.
Silent truncation is forbidden: if the cap dropped work, the number
appears here.

## Convention revisions (designed)
Required when 3+ rejections share a pattern: old reading, new reading,
suggested standards-file edit.

## Data gaps / errors
Anything the run could not check, so absence of a finding is not
mistaken for a pass.
```

