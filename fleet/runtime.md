# Runtime Architecture — cache agent and task agents

How the fleet actually executes at run time, and what that means for how task
markdowns are written.

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

- **Agent A (cache agent)** queries Speckle **once per run** and stores the
  download in a cache — no re-downloading on every query. It answers SQL
  queries over that cache.
- **Agent B (task agents)** never touch Speckle. Each one sends SQL queries to
  A, receives a small, easy-to-process subset, works on it, and sends its
  output (CRs, reports) back to the server.

Why: agents work best on small fast judgment tasks (fleet-rules.md, Automate
before agents). The cache kills redundant downloads; SQL subsetting keeps each
task agent's working set small and its run time short.

## What this means for task markdowns

The **Inputs** section of every task md is agent B's *query contract* with A:

- Each bullet names an object type, the fields needed, and any filter — scoped
  so B can translate it into one or two SQL queries and nothing more.
- B requests only the fields its Inputs list — never "everything about rooms."
- Ordering data needs from cheap to expensive (params before geometry) lets B
  short-circuit: if the warning seed returns nothing, no geometry query fires.

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

Run v1 with the A/B structure as-is, instrumented per run:

- queries issued per task, subset sizes returned
- agent A time (download, cache build) vs. agent B time per task
- repeated identical/near-identical queries across tasks or across days

Then assess: any data translation that shows up as stable and mechanical
(same query every run, same reshaping) is a candidate to automate
deterministically in the pipeline — the way the bim2graph JSON exports work —
so A shrinks toward a dumb cache and B's prompts stay pure judgment. If the
numbers show the A/B split is already efficient enough, leave it.
