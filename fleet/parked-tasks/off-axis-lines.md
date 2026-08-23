# Task spec: Off-Axis Lines & Reference Planes

Severity class 3 (model integrity) · v1.5 [context and rec] → v2 snap CRs
Waits on: warning ingestion (detection seed), geometry read as derived
facts (exact deviation per element); the v2 snap additionally waits on
geometry write. Judgment carries over unchanged between rungs.

## Objective

Lines, walls, and reference planes slightly off axis (0.05° from
orthogonal, a location line 1 mm off grid) silently cause dimension
rounding, misaligned hosted elements, and drafting inaccuracy, and are
nearly impossible to spot by eye. Find them, judge sloppy versus
intentional, and deliver each located and measured with a fix
recommendation ("0.07° off axis; far end 4 mm out over 3.4 m; snap holding
the grid end").

## Judgment

A candidate deviates from the nearest project axis by more than zero and
less than 0.5°; larger angles are presumed intentional design geometry and
never flagged. Project axes include any dominant non-orthogonal grid
direction; a 30° wing is an axis too.

Sloppy versus intentional: a deviation shared by a cluster (a whole rotated
wing) reads intentional; a lone element 0.07° off among on-axis neighbors
reads sloppy. Splayed walls that dimension cleanly to a stated angle are
intentional. Also flag near-miss alignment: parallel to an axis but a
sub-tolerance offset from the grid it visually sits on.

At v2, only the high-confidence sloppy findings become snap CRs:
deterministic transform, hold-point stated, never deleting or creating,
and never proposed when hosted elements would move ambiguously.

## Stand-down conditions

- No project axes inferable (no grids, freeform massing): report that and
  stand down. Never snap to axes nobody chose.
- More than ~50 off-axis elements: cover the worst level, report the
  total; that is likely a rotated import to fix at the source.

## Severity

high — lone off-axis element among on-axis peers, deviation under 0.2° ·
medium — clustered deviations, hosted elements involved, or angles near
the 0.5° boundary ("confirm intent", cluster listed).
