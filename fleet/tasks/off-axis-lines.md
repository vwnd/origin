# Task: Off-Axis Lines & Reference Planes

Severity class: 3 (model integrity) · Phase: v1.5 (geometry read) → v2 snap fix (geometry write) · Fix policy: [context and rec] now, auto-propose (snap) at v2

## Objective
Lines, walls, and reference planes that are *slightly* off axis (0.05° from
orthogonal, a location line 1 mm off the grid) silently cause dimension
rounding errors, misaligned hosted elements, and downstream drafting
inaccuracy — and they are nearly impossible to spot by eye. Find them, make
the judgment call sloppy-vs-intentional, and deliver each as a located,
measured issue with a clean fix recommendation. Until geometry write lands
the fix is manual (guided by the report); at v2 the same detection feeds
auto-proposed snap CRs.

## Inputs
- Imported Revit warnings: "Line is slightly off axis and may cause
  inaccuracies." (detection seed — see fleet-rules.md, Detection sources)
- Line, wall location line, and reference plane geometry: curve, angle,
  level (geometry-read feed — measures the exact deviation and hold-point
  for seeded warnings; fallback detection when the feed is absent)
- Grid geometry and project true/plan north (to define the axes that count)
- Element metadata: type, hosted elements, references
- Exceptions log: fleet/state/exceptions.md
- Prior packages/CRs for this task (resolved, approved, dismissed)

## Detection
1. Seed candidates from the imported Revit warning list, then compute each
   one's exact angular deviation from the nearest project axis (orthogonal
   set, plus any dominant non-orthogonal grid direction the project
   establishes — a 30° wing is an axis too). Fallback when the feed is
   absent: sweep all line/plane geometry for deviations.
2. **Off-axis candidate**: deviation > 0 and < 0.5°. Larger angles are
   presumed intentional design geometry — never flagged.
3. Sloppy vs. intentional judgment: deviation shared by a cluster of
   elements (a whole rotated wing) reads as intentional; a lone element
   0.07° off among on-axis neighbors reads as sloppy. Splayed/angled walls
   that dimension cleanly to a stated angle are intentional.
4. Also flag near-miss alignment: element parallel to an axis but a
   sub-tolerance offset from the grid/reference it visually sits on.
5. Skip matches in the Exceptions log.

## Fix policy: [context and rec] (v1.5) → auto-propose snap (v2)
- **v1.5**: each finding is a context & recommendation report
  (formats/context-rec-report.md): Select-by-ID-ready element ID plus
  level/grid location, deviation stated exactly ("0.07° off axis; far end
  4 mm out over 3.4 m"), and the recommended manual fix (rotate/snap to
  axis, which end to hold).
- **v2**: for high-confidence sloppy findings, auto-propose the snap as a
  CR — deterministic transform, rationale, confidence call. The
  intentional-angle judgment and thresholds carry over unchanged.

## Confidence gate
- High: lone off-axis element among on-axis peers, deviation below 0.2°,
  no hosted geometry that would move ambiguously.
- Medium: clustered deviations, hosted elements involved, or angle near
  the 0.5° presumption boundary — report as "confirm intent" with the
  cluster listed.
- No project axes inferable (no grids, freeform massing): report that and
  stand down; never snap to axes nobody chose.

## Change request format
v2 only: element ID, current angle/position → proposed, hold-point stated,
one-line rationale with the measured deviation. Max 10 snaps per CR,
batched by level. Until then: context & rec reports only.

## Feedback handling
Dismissed report or rejected snap → Exceptions log (element scope;
pattern scope when the reason names a class, e.g. "the 1.5° splay on the
north facade is design"). Never re-propose. 3+ sharing a pattern → treat
that angle/zone as intentional and note it in the daily report.

## Hard limits
- v1.5: read-only. v2: snap transforms only — never delete, create, or
  move an element off its own axis line; hosted elements move with their
  host or the fix is not proposed.
- Deviation ≥ 0.5° is never touched or packaged.
- Max 10 new reports (or, at v2, 1 snap CR) per day; overflow to the
  deferred backlog. If >50 off-axis elements exist, cover the worst level
  and report the total — likely a rotated import to fix at the source.
