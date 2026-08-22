# Context & Recommendation Report Format ([context and rec])

The deliverable for issues the fleet cannot fix via change request: a context
analysis and recommendation report that supports the user's own decision in
Revit/Speckle. The value: even without a CR, the fleet saves the energy of
**locating, inspecting, and analyzing** — the user arrives at the issue with
it found, dissected, and with a recommended action.

Produced by [context and rec] tasks (overlap-locator, off-axis-lines) and
surfaced on the server's issue-management panel alongside CRs.

**No locator/viewer.** Screenshot/viewer generation is out of scope for this
project — Speckle and Revit already point to an issue's location automatically
from its element IDs. A report carries the IDs and the analysis; the tools do
the pointing.

## Location

```
fleet/state/reports/context-rec/YYYY-MM-DD/<issue-id>.md
```

## Report contents

```markdown
# ISS-0031 — Line/wall overlap, Level 2 near grid C4

- **Task**: overlap-locator · **Severity**: model integrity · **Confidence**: high
- **Elements**: model line 611402, wall 512230 ("Interior - 4 7/8\" Partition")
- **Where**: Level 2, grids C3–C4, corridor south wall (IDs above auto-locate
  in Speckle/Revit)

## Context
Model line 611402 runs collinear with wall 512230's location line for 3.2 m —
a leftover trace line from the corridor re-layout on 2026-08-18. It reads as
duplicate geometry in exports and snaps.

## Recommendation
Delete model line 611402. The wall is the real element: hosted door 204A,
tagged on A-201. (Between a line and a wall, the line is always the
disposable one.)
```

### Field rules

- **Elements/Where** — element IDs (Speckle/Revit auto-locate from them) plus
  level and nearest grid cell for human orientation when reading the report
  away from the model.
- **Context** is one short paragraph of dissection: what, extent (measured,
  from geometry inference), and likely cause when recent-change data
  supports it.
- **Recommendation** is a concrete action, one read long, stating why the
  kept element is the keeper. Every report has one — a report without a
  recommendation is just a warning, which Revit already has.

## Panel grouping (UI note)

The issue panel should group reports so the user can batch through similar
work in one Revit sitting:

- Group by **recommended-action type first** ("delete leftover line" × 6,
  "review wall join" × 2), then by **level** — same action + same level is
  one batch of identical hand-motions.
- Same severity ordering as CRs (fleet-rules.md) between groups.
- Each report gets a resolve/dismiss control; dismiss-with-reason feeds the
  Exceptions log exactly like a CR rejection.
- Reports and CRs touching the same elements sit adjacent, not interleaved
  with unrelated issues.

## Caps and reporting

- [context and rec] reports have their own daily cap (fleet-rules.md),
  separate from the CR cap — they don't consume it but compete for the same
  human attention.
- Every report is indexed in the daily report; overflow beyond the cap goes
  to the deferred backlog with totals, same as CRs.
