# Runtime Architecture — cache agent and task agents

How the fleet executes at run time, and what that means for task markdowns.

## The A/B structure

```
Speckle ──(one download per run)──► Agent A: cache agent
                                        │  holds the model data, serves SQL
                                        ▼
                          Agent B: task agents (one per task md)
                              │  query A for small subsets,
                              │  do the judgment work,
                              ▼
                          Origo server (CRs, context & rec reports,
                          daily report entries)
```

- **Agent A (cache agent)** queries Speckle once per run, caches the
  download, and answers SQL queries over it.
- **Agent B (task agents)** never touch Speckle: each sends SQL to A, works
  on the small subset returned, and sends output (CRs, reports) to the
  server.

Why: agents work best on small fast judgment tasks (fleet-rules.md). The
cache kills redundant downloads; SQL subsetting keeps each task agent's
working set small and its run time short.

## What this means for task markdowns

The **Inputs** section of every task md is agent B's *query contract* with A:

- Each bullet names an object type, the fields needed, and any filter —
  translatable into one or two SQL queries, nothing more.
- B requests only the listed fields — never "everything about rooms."
- Inputs are ordered cheap to expensive (params before geometry) so B can
  short-circuit: if the warning seed returns nothing, no geometry query
  fires.

Example — nomenclature's first input as B would query it:

```sql
SELECT id, name, number, level, department, area
FROM rooms;
-- and only if outliers are found:
SELECT id, name FROM rooms WHERE level = 'Level 2';
```

Non-model inputs (standards files, Exceptions log, prior CRs) come from the
fleet's own state, not from A.

## Assess-then-automate plan

Run v1 with the A/B structure as-is, instrumented per run: queries issued
per task, subset sizes, agent A time (download, cache build) vs. agent B
time, repeated identical/near-identical queries across tasks or days.

Then assess: any translation that shows up stable and mechanical (same
query and reshaping every run) is a candidate to automate deterministically
in the pipeline — the way the bim2graph JSON exports work — so A shrinks
toward a dumb cache and B's prompts stay pure judgment. If the numbers show
the A/B split is efficient enough, leave it.
