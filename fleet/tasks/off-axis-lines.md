# Task: Off-Axis Lines & Reference Planes

Severity class: 3 (model integrity) · Phase: v1.5 (geometry read) → v2 snap fix (geometry write) · Fix policy: [context and rec] now, auto-propose (snap) at v2

## Objective
Lines, walls, and reference planes *slightly* off axis (0.05° from
orthogonal, a location line 1 mm off grid) silently cause dimension
rounding, misaligned hosted elements, and drafting inaccuracy — and are
nearly impossible to spot by eye. Find them, judge sloppy vs. intentional,
and deliver each as a located, measured issue with a fix recommendation.
Manual fix until geometry write lands; at v2 the same detection feeds
auto-proposed snap CRs.

## Inputs
Query contract with the cache agent (runtime.md) — only these objects and
fields, cheapest first, warning seed before geometry.
- Imported Revit warnings: "Line is slightly off axis and may cause
  inaccuracies." (detection seed — fleet-rules.md, Detection sources)
- Line, wall location line, and reference plane geometry: curve, angle,
  level (measures exact deviation and hold-point for seeded warnings;
  fallback detection when the feed is absent)
- Grid geometry and project true/plan north (defines the axes that count)
- Element metadata: type, hosted elements, references
- Exceptions log: fleet/state/exceptions.md
- Prior packages/CRs for this task (resolved, approved, dismissed)

## Detection
1. Seed candidates from the warning list; compute each one's exact angular
   deviation from the nearest project axis (orthogonal set, plus any
   dominant non-orthogonal grid direction — a 30° wing is an axis too).
   Fallback when the feed is absent: sweep all line/plane geometry.
2. **Candidate**: deviation > 0 and < 0.5°. Larger angles are presumed
   intentional design geometry — never flagged.
3. Sloppy vs. intentional: a deviation shared by a cluster (a whole rotated
   wing) reads intentional; a lone element 0.07° off among on-axis
   neighbors reads sloppy. Splayed walls that dimension cleanly to a stated
   angle are intentional.
4. Also flag near-miss alignment: parallel to an axis but a sub-tolerance
   offset from the grid/reference it visually sits on.
5. Skip Exceptions-log matches.

## Fix policy: [context and rec] (v1.5) → auto-propose snap (v2)
- **v1.5**: context & recommendation report (formats/context-rec-report.md):
  element ID plus level/grid, exact deviation ("0.07° off axis; far end
  4 mm out over 3.4 m"), recommended manual fix (rotate/snap to axis, which
  end to hold).
- **v2**: high-confidence sloppy findings become snap CRs — deterministic
  transform, rationale, confidence call. Judgment and thresholds carry over
  unchanged.

## Confidence gate
- High: lone off-axis element among on-axis peers, deviation < 0.2°, no
  hosted geometry that would move ambiguously.
- Medium: clustered deviations, hosted elements involved, or angle near the
  0.5° boundary — report as "confirm intent" with the cluster listed.
- No project axes inferable (no grids, freeform massing): report that and
  stand down — never snap to axes nobody chose.

## Change request format
v2 only: element ID, current → proposed angle/position, hold-point stated,
one-line rationale with the measured deviation. Max 10 snaps per CR,
batched by level. Until then: context & rec reports only.

## Feedback handling
Dismissed report or rejected snap → Exceptions log (element scope; pattern
scope when the reason names a class, e.g. "the 1.5° splay on the north
facade is design"); never re-propose. 3+ sharing a pattern → treat that
angle/zone as intentional, note it in the daily report.

## Hard limits
- v1.5: read-only. v2: snap transforms only — never delete, create, or move
  an element off its own axis line; hosted elements move with their host or
  the fix is not proposed.
- Deviation ≥ 0.5° is never touched or packaged.
- Max 10 new reports (v2: 1 snap CR) per day; overflow to the deferred
  backlog. If >50 off-axis elements, cover the worst level and report the
  total — likely a rotated import to fix at the source.
