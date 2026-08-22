# Origo Agent Fleet

Automated daily maintenance for Revit models — "Dependabot for Revit." The fleet
detects model-health and semantic issues, drafts small reviewable change requests
(CRs), and delivers them for human approval in Revit. Nothing changes a model
without a BIM manager approving it.

The value is two-fold:

1. **Pre-drafted fixes** — small, reviewable CRs, approved by a human.
2. **Pre-done investigation** — for issues the fleet can't (or shouldn't) fix,
   it still saves the energy of *locating, inspecting, and analyzing*: the issue
   arrives found, dissected, and with a recommended action, as a context &
   recommendation report (see formats/context-rec-report.md).

Who detects what, and the deliverable class per issue: see scope-map.md.

## Pipeline

Revit → Speckle → Origo server → **agent fleet (this directory)** → Origo server
→ Speckle → Revit change requests → human approval in Revit → model updated and
pushed back. The fleet runs daily as background maintenance.

## Directory map

```
fleet/
  README.md              this file
  fleet-rules.md         global runner rules: batch cap, severity ordering, safety invariants
  scope-map.md           who detects what, deliverable class per issue, design principles
  tasks/                 one markdown file per task — the customizable product surface
    nomenclature.md
    compliance-check.md
    duplicate-room-numbers.md
    duplicate-marks.md
    identical-instances.md
    overlap-locator.md       wall & line overlaps → context & rec (v1.5, geo read)
    off-axis-lines.md        slightly off-axis lines/ref planes (v1.5 context & rec → v2 snap)
    archive/                 parked tasks (lower value-add for now; skeleton kept current)
      duplicate-doors.md
  formats/               shared file-format specs
    standards-file.md    the rules files a firm authors (naming + compliance), with templates
    exceptions-log.md    shared rejected-fix log all tasks must respect
    daily-report.md      the daily report the runner assembles
    context-rec-report.md  the [context and rec] deliverable for issues fixed manually
  state/                 runner-maintained state (exceptions log, reports) — created at runtime
```

## How the runner consumes tasks

Every file in `tasks/` uses the same eight sections, so the runner treats them
uniformly: **Objective, Inputs, Detection, Fix policy, Confidence gate, Change
request format, Feedback handling, Hard limits.** Hard limits live in the task
file — visible to customizing firms — not hidden in the runner.

Detection is **warnings-first** (fleet-rules.md): where Revit natively warns
about the issue, the imported warning list is the detection seed and the agent
adds the judgment on top — triage, keeper calls, fix drafting, packaging. Only
semantic tasks detect from scratch.

## Fix-policy classes

- **Auto-propose** — deterministic fix; the agent adds rationale and a confidence call.
- **Suggest-with-options** — judgment fix; the agent proposes with a stated
  preference, max 2 options.
- **Diagnose-only** — frequently a design condition in progress, not an error.
  Never auto-fix; a precise diagnosis is the deliverable.
- **[context and rec]** — the fix must happen by hand in Revit, so the
  deliverable is a context & recommendation report: located (Select-by-ID-ready
  IDs, level, grid), dissected, with a recommended action. The fleet does the
  finding and the judgement; the user does the clicking.

## Safety model

The change-request-with-human-approval flow is the core safety model. Every
design decision protects it:

- Daily batch cap and severity ordering keep the review load at ~5 minutes so
  approvals stay considered, never bulk-rubber-stamped.
- No CR ships without a rationale a BIM manager can evaluate in one read.
- Rejected CRs feed the Exceptions log; a rejected fix is never re-proposed.
- v1 writes are **parameter writes and element deletes only** — both are simple
  operations a reviewer can fully evaluate from the CR. Geometry modification
  and creation are deferred to v2 — see fleet-rules.md.

## Customizing for a firm

The task markdowns and the standards files are the product surface a firm edits:

1. Author `/standards/naming.md` and `/standards/compliance.md` per
   [formats/standards-file.md](formats/standards-file.md) — plain markdown a BIM
   manager writes, no schema to learn.
2. Adjust per-task hard limits (caps, batch sizes) directly in `tasks/*.md`.
3. Seed `state/exceptions.md` with known intentional deviations so the fleet
   never flags them.

## Open infra dependencies

- Geometry **read** access in the Origo → agent data feed (room boundary loops,
  wall location lines, instance placement points) — needed for v1.5 tasks and
  for identical-instance detection.
- Rejected CRs must flow back to the agent layer with the rejection reason (or
  at minimum the reject event) — the Exceptions log and convention-revision
  loop depend on it.
- **Revit warning import** in the Origo → agent data feed (warning type,
  message, element ids, ideally with each sync) — most non-semantic tasks seed
  detection from it instead of re-implementing what Revit already catches.
- Phase/hosting data through Speckle — instance dedup needs it.
- Element **delete** operations in the CR round trip (alongside parameter
  writes) — identical-instances proposes deletes in v1.
- **(Parked) server-side view rendering** for context & rec reports: wireframe,
  camera framing, highlight, screenshot capture. Only worth building as a
  deterministic, automatically-fired pipeline step — never agent-driven
  (fleet-rules.md, Automate before agents). Reports work without it via
  Select by ID + level/grid locate info.
- **Issue panel grouping**: the panel should group issues that can be fixed or
  inspected conveniently in batch — by proposed-action type, then level — and
  feed dismiss-with-reason back to the agent layer like CR rejections.
