# Standards File Format

The rules files a firm authors — the artifact that turns a BIM execution
plan into something the fleet enforces. Design constraint: **a BIM manager
must be able to write one in plain markdown in under 20 minutes.** No
schema, no YAML, no JSON. The agent interprets intent, including semantic
equivalence ("4 HR" means "4 hours"); the firm only states the rules.

## Location

Project-relative, read by every task that declares them as inputs:

```
/standards/naming.md        naming conventions (rooms, sheets, levels, marks)
/standards/compliance.md    required values (fire ratings, code requirements)
```

Starter versions of both live in the repo's `standards/` folder — firms
adjust them rather than authoring from scratch.

Both optional. Without a naming file, nomenclature-class tasks infer the
dominant convention and say so explicitly. Without a compliance file, the
compliance task runs only its built-in consistency checks.

## Authoring rules

- Plain statements and small tables; prose is fine — the agent reads intent.
- One rule per line or table row, so rejections map back to a specific rule.
- List known abbreviations and accepted equivalents rather than trusting
  the agent to guess firm-specific shorthand.
- Intentional non-conformances belong in the Exceptions log
  (exceptions-log.md), not as carve-out sentences buried here.

## Template: /standards/naming.md

```markdown
# Naming Conventions — <Project Name>

## Rooms
- Names are Title Case: "Meeting Room", not "MEETING ROOM" or "meeting room".
- No abbreviations in room names except those listed below.
- Room numbers are <level><two digits>: 204 is on Level 2. Suites append a
  letter: 204A.

### Accepted abbreviations
| Abbreviation | Means |
|---|---|
| MECH | Mechanical |
| ELEC | Electrical |
| JAN | Janitor |

## Sheets
- Sheet numbers: <discipline letter>-<series><two digits>, e.g. A-101.
- Sheet names are ALL CAPS.

## Levels
- "Level 1", "Level 2", ... "Roof". Never "L1", "1st Floor", "Ground".

## Marks
- Doors: <room number><letter>, e.g. 204A means the first door into room 204.
- Windows: W-<sequence> per level.
```

## Template: /standards/compliance.md

```markdown
# Compliance Requirements — <Project Name>

Rules are checked, never auto-fixed. Findings appear in the daily report.

| Scope | Parameter | Requirement | Accepted equivalents | Source |
|---|---|---|---|---|
| Walls, type name contains "Shaft" | Fire Rating | 2 hours | "2 HR", "2hr", "120 min" | IBC 713.4 |
| Doors hosted in rated walls | Fire Rating | at least 3/4 of host wall rating | "45 min" = "0.75 hr" | IBC 716.1(2) |
| Rooms, Department = "Egress" | Occupancy | must not be empty | — | project BEP |

## Notes
- "Rated wall" means any wall whose Fire Rating parameter is non-empty.
- Minutes and hours are the same rating; the fleet normalizes when
  comparing but reports the written form.
```

## How tasks consume these files

1. A standards file, when present, **is** the convention — never overridden
   by an inferred pattern.
2. Every CR rationale resting on a rule cites it ("per naming.md: Rooms are
   Title Case").
3. Ambiguous or conflicting rules: the task reports the ambiguity in the
   daily report and enforces neither reading.
4. 3+ rejections sharing a pattern against one rule surface in the daily
   report as a suggested edit — the firm updates the file; the fleet never
   silently rewrites it.
