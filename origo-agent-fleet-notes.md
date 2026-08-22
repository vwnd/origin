# Origo Agent Fleet — Session Notes

Working doc for the agent fleet setup (task/prompt markdowns). Infra/pipeline is owned by other teammates; this covers value framing, task taxonomy, the task-file skeleton, and open asks.

## Pipeline context

Revit → Speckle → Origo server → **agent fleet** (this work) → Origo server → Speckle → Revit change requests → human approval in Revit → model updated and pushed back. Fleet runs daily as automated background maintenance.

## Value framing

- Detection splits into two classes, only the former currently exsits:
  - **Geometric/identity issues** (unenclosed rooms, identical instances, duplicate marks): Revit native warnings + Model Checker/Ideate catch these. Origo's value here is closing the loop.
  - **Semantic issues**: Revit is blind to semantic meaning (e.g., "4 HR" and "4 hours", "Studio A" vs "design_space" vs "Room"). Checking against a company's convention rules, and compliance checks (fire ratings etc.), require understanding intent. **This is agent-side detection value.**
- Nothing happens after detection: warnings pile up untriaged, cleanup is deferred junior work, then becomes a crunch before permit sets / IFC export / clash coordination.
- **Positioning: Dependabot for Revit** The fleet closes the loop: small, reviewable, pre-drafted fixes delivered as change requests, approved by a human. Daily maintenance instead of episodic cleanup sprints. For semantic tasks it also does the detection a rule engine can't.
- The change-request-with-human-approval flow is the core safety model. Protect it in every design decision. Avoid anything that trains users to bulk-approve without reading (batch caps, severity ordering).

## User scenarios

1. **Daily five minutes.** BIM manager opens Revit, reviews ~8 overnight CRs, approves most, rejects some with reasons. *Rejections feed back* so the fleet stops proposing that class of fix. 
2. **Pre-milestone sweep.** Crank fleet aggressiveness 1–2 weeks before a submission; drive warning count to zero. 
3. **Standards as markdown.** A firm's BIM execution plan becomes rule files the fleet enforces. The task markdowns ARE the customizable product surface.
4. **Incoming model audit.** Health report on a consultant's model before linking.

## Approval model

- Approver: BIM managers (understands proper terminology)
- Implication: one person's attention is the bottleneck → batch-size caps and severity ordering within each daily batch are essential.

## Geometry decision

- **Request geometry READ access from infra now** (room boundary loops, wall location lines, instance placement points). Cheap to add, enables good diagnosis, avoids a v2 blocker.
- **Defer geometry WRITE.** The v1 Origo→Speckle→Revit round trip is clean for parameter writes and element deletes (conveniently where the highest-judgement tasks are) but lossy/risky for geometry modification/creation. Simple geom edit/write (e.g., drawing a wall to close a room boundary) can land in future iterations.

## Task taxonomy

| Task | Data needed | Fix policy | Agent's value-add | Phase |
|---|---|---|---|---|
| Nomenclature | Room/space/sheet params + company convention rules | Suggest with options | Checks against company rules incl. semantic equivalence ("4 HR" = "4 hours"); infers convention only if no rules file exists | v1 |
| Compliance check (fire rating, etc.) | Element params + company/code requirement rules | Diagnose only (v1) | Semantic check Revit can't do: verifies required values present and equivalent-but-differently-written values normalized; flags missing/conflicting ratings | v1 |
| Duplicate room numbers | Room params + sheet/schedule refs | Suggest with options | Decides which room keeps the number, explains why | v1 |
| Duplicate mark values | Element params by category | Auto-propose | Renumbering per rule + rationale, flags intentional dupes | v1 |
| Duplicate doors | Door instances + host wall + phase | Suggest with options | Identifies the real door from hosting/phase context | v1 |
| Identical instances, same place | Placement points + type + level | Auto-propose (delete) | Confidence call: true dupe vs. intentional (e.g. phased) | v1 |
| Room not enclosed | Room + boundary geometry (read) | Diagnose only | Locates the gap, hypothesizes cause from recent changes | v1.5 (geo read) |
| Overlapping walls | Wall location lines (read) | Diagnose only | Distinguishes join problems from real overlaps | v1.5 (geo read) |
| Off-axis lines | Line geometry (read/write) | Auto-propose (snap) | Threshold judgment: sloppy vs. intentional angle | v2 (geo write) |

Fix-policy classes:
- **Auto-propose**: deterministic fix; agent adds rationale + confidence call.
- **Suggest-with-options**: judgment fix; agent proposes with stated preference, max 2 options.
- **Diagnose-only**: frequently a design condition in progress, not an error. Never auto-fix; a precise diagnosis ("Room 204 boundary gap at grid C4, likely from yesterday's wall move") is the deliverable.

## Task file skeleton

Every task md uses the same sections so the fleet runner treats them uniformly:

1. **Objective** — what "good" looks like; what the task never does.
2. **Inputs** — data pulled from Origo, optional standards file, prior CRs (approved + rejected) for this task.
3. **Detection** — logic, incl. convention inference where relevant. Inferred conventions must be stated explicitly in output. Respect the Exceptions log.
4. **Fix policy** — one of the three classes above.
5. **Confidence gate** — draft a CR only at high confidence; medium → daily report as "flagged, no CR"; include a no-convention/ambiguous branch (report it, don't enforce a pattern nobody chose).
6. **Change request format** — element IDs, current → proposed, one-line rationale, batching rules (e.g. per level/department, max ~15 items per CR).
7. **Feedback handling** — rejected CRs go to the Exceptions log; never re-propose a rejected fix; 3+ rejections sharing a pattern → revise inferred convention and note it in the daily report.
8. **Hard limits** — live in the task file (visible to customizing firms), not hidden in the runner. E.g. parameter writes only; max CRs per day; large-outlier fallback (fix worst level only, report the total).

Global fleet rules (runner-level, apply across tasks):
- Daily batch cap across all tasks; severity ordering within the batch.
- No CR without a rationale a BIM manager can evaluate in one read.

## Exemplar: nomenclature task

(First task to draft fully; highest-value judgment task.)

```markdown
# Task: Room Nomenclature Consistency

## Objective
Ensure room names follow the project's dominant naming convention.
Propose renames for outliers. Never invent a convention; infer it
or read it from the project standards file if one exists.

## Inputs
- All Room objects: Name, Number, Level, Department, Area
- Project standards file (optional): /standards/naming.md
- Prior change requests for this task (approved and rejected)

## Detection
1. If a standards file exists, treat it as the convention. Otherwise
   infer the dominant pattern from the room set: casing, abbreviation
   style, numbering format, separator use. State the inferred
   convention explicitly in your output.
2. A room is an outlier if it deviates from the convention in casing,
   abbreviation, spelling, or structure.
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
- One-line rationale referencing the convention
- Batch related renames into a single CR per level or department,
  max 15 renames per CR

## Feedback handling
If a proposed rename was rejected, log the room and pattern to the
Exceptions log. Never re-propose a rejected rename. If 3+ rejections
share a pattern, revise the inferred convention and note the revision
in the next daily report.

## Hard limits
- Parameter writes only. Never modify geometry, delete, or create.
- Max 1 CR per level per day for this task.
- If >40 outliers are found, propose the convention fix for the worst
  level only and report the total count.
```

## Asks for infra teammates

- Geometry read access in the Origo → agent data feed (boundary loops, wall location lines, placement points).
- Rejected CRs must flow back to the agent layer with the rejection reason (or at minimum the reject event). The Exceptions log and convention-revision loop depend on this — confirm Origo's data model captures it.
- Confirm phase/hosting data comes through Speckle for door and instance dedup tasks.
- Element **delete** support in the CR round trip (alongside parameter writes) — duplicate-doors and identical-instances propose deletes in v1.

## Next steps

- [x] Draft remaining v1 task files in the skeleton: duplicate room numbers, duplicate marks, duplicate doors, identical instances, compliance check. → `fleet/tasks/`
- [x] Define the company rules file format (naming conventions + compliance requirements) — this is the artifact firms author, so it needs to be writable by a BIM manager, not just by us. → `fleet/formats/standards-file.md`
- [x] Define the Exceptions log format (shared across tasks). → `fleet/formats/exceptions-log.md`
- [x] Define the daily report format (flagged-no-CR items, convention revisions, totals). → `fleet/formats/daily-report.md`
- [x] Set the global daily batch cap and severity ordering rule. → `fleet/fleet-rules.md` (default 10 CRs/day, sweep 25; severity: compliance > documentation integrity > model integrity > cosmetic)
- [ ] Pressure-test the nomenclature task against a real messy project. (Needs real model data.)
- [x] Resolve the delete-fix gap: v1 scope is parameter writes + element deletes (the deferred class is geometry *edits*, which are risky/lossy — not deletes). duplicate-doors and identical-instances propose delete CRs in v1; simple geo-creation (e.g. wall to close a boundary) stays a v2 stretch.
