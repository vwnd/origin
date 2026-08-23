# Standards File Format

The rules files a firm authors: the artifact that turns a BIM execution
plan into something the fleet enforces. Design constraint: **a BIM manager
must be able to write one in plain markdown in under 20 minutes.** No
schema, no YAML. The scouts read intent, including semantic equivalence
("4 HR" means "4 hours"); the firm only states the rules.

```
standards/naming.md        naming conventions (rooms, sheets, levels, marks)
standards/compliance.md    required values (fire ratings, code requirements)
```

Standards are appended to the judgment prompt after the scout body, inside
the cached prefix, so a rule cited in a finding traces to a file the firm
owns. Until injection lands, demo rules live inlined in scout bodies,
which is equivalent: bodies are customer-authored markdown either way.
Starter versions live in `standards/`; firms adjust rather than author
from scratch.

Both files are optional. Without a naming file, nomenclature scouts infer
the dominant convention and state it explicitly in every finding. Without
a compliance file, compliance-triage runs its coherence checks only.

## Authoring rules

- Plain statements and small tables; prose is fine.
- One rule per line or table row, so a rejection maps back to one rule.
- List known abbreviations and accepted equivalents rather than trusting
  the scouts to guess firm shorthand.
- Intentional non-conformances belong in the exceptions log
  (formats/exceptions-log.md), not as carve-outs buried here.

## Template: standards/naming.md

```markdown
# Naming Conventions — <Project Name>

## Rooms
- Names are Title Case: "Meeting Room", not "MEETING ROOM".
- No abbreviations except those listed: MECH, ELEC, JAN.
- Room numbers are <level><two digits>; suites append a letter: 204A.

## Levels
- "Level 1", "Level 2", ... "Roof". Never "L1", "1st Floor", "Ground".

## Marks
- Doors: <room number><letter>. Windows: W-<sequence> per level.
```

## Template: standards/compliance.md

```markdown
# Compliance Requirements — <Project Name>

Rules are checked, never auto-filled. Missing values are findings.

| Scope | Parameter | Requirement | Accepted equivalents | Source |
|---|---|---|---|---|
| Walls, type name contains "Shaft" | Fire Rating | 2 hours | "2 HR", "120 min" | IBC 713.4 |
| Doors hosted in rated walls | Fire Rating | ≥ 3/4 of host rating | "45 min" = "0.75 hr" | IBC 716.1(2) |
```

## How scouts consume these files

1. A standards file, when present, **is** the convention, never overridden
   by an inferred pattern.
2. Every rationale resting on a rule cites it ("per naming.md: rooms are
   Title Case").
3. Ambiguous or conflicting rules: the finding reports the ambiguity and
   enforces neither reading.
4. Repeated rejections against one rule surface as a suggested edit in the
   daily report. The firm updates the file; the fleet never silently
   rewrites it.
