# Origo Agent Fleet

Automated daily maintenance for Revit models — "Dependabot for Revit." The fleet
detects model-health and semantic issues, drafts small reviewable change requests
(CRs), and delivers them for human approval in Revit. Nothing changes a model
without a BIM manager approving it.

## Pipeline

Revit → Speckle → Origo server → **agent fleet (this directory)** → Origo server
→ Speckle → Revit change requests → human approval in Revit → model updated and
pushed back. The fleet runs daily as background maintenance.

## Directory map

```
fleet/
  README.md              this file
  fleet-rules.md         global runner rules: batch cap, severity ordering, safety invariants
  tasks/                 one markdown file per task — the customizable product surface
    nomenclature.md
    compliance-check.md
    duplicate-room-numbers.md
    duplicate-marks.md
    duplicate-doors.md
    identical-instances.md
  formats/               shared file-format specs
    standards-file.md    the rules files a firm authors (naming + compliance), with templates
    exceptions-log.md    shared rejected-fix log all tasks must respect
    daily-report.md      the daily report the runner assembles
  state/                 runner-maintained state (exceptions log, reports) — created at runtime
```

## How the runner consumes tasks

Every file in `tasks/` uses the same eight sections, so the runner treats them
uniformly: **Objective, Inputs, Detection, Fix policy, Confidence gate, Change
request format, Feedback handling, Hard limits.** Hard limits live in the task
file — visible to customizing firms — not hidden in the runner.

## Fix-policy classes

- **Auto-propose** — deterministic fix; the agent adds rationale and a confidence call.
- **Suggest-with-options** — judgment fix; the agent proposes with a stated
  preference, max 2 options.
- **Diagnose-only** — frequently a design condition in progress, not an error.
  Never auto-fix; a precise diagnosis is the deliverable.

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
- Phase/hosting data through Speckle — door and instance dedup tasks need it.
- Element **delete** operations in the CR round trip (alongside parameter
  writes) — duplicate-doors and identical-instances propose deletes in v1.
