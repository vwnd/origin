# Dynamo scripts — fire-rating test arc

Python scripts for Dynamo (Revit) to support the compliance-check task:
inspect what fire-rating data actually exists in a model, and seed
realistic issues into a **test model** for product demo/testing.

⚠️ `fire_rating_seed_issues.py` **modifies the model**. Run it only on a
throwaway copy, keep `dry_run = True` first, and save the originals log it
outputs so you can restore.

## Setup (per script)

1. Open the model in Revit, launch Dynamo (2.x).
2. Add a **Python Script** node, paste the script's contents into it.
3. Wire inputs as listed below, add a **Watch** node on the output.
4. Works under both IronPython2 and CPython3 engines (no f-strings used).

## fire_rating_inspect.py — what data do we have?

Answers: which walls/doors carry a Fire Rating, where (instance vs. type
parameter), in what spellings, and which doors sit in rated host walls.
This tells us what analysis compliance-check can actually perform on this
model, and shows the semantic-variant problem ("2 HR" vs "120 min") as a
spelling histogram.

- **Inputs**: none.
- **Output**: `[summary_json, rows]` — summary has counts and the rating
  spelling histogram; rows are per-element dicts (id, category, type name,
  level, rating, rating source, host info for doors) ready to export to
  JSON/CSV (pipeline-style, like the bim2graph exports).

## fire_rating_seed_issues.py — create demo issues

Seeds three issue classes compliance-check should catch:

1. **Spelling variants** — rewrites equivalent ratings across wall types to
   mixed forms ("2 HR", "2 hours", "120 min").
2. **Missing value** — blanks the Fire Rating on one rated door type.
3. **Under-rated door** — sets one door type hosted in rated walls to
   "20 min".

- **Inputs**: `IN[0]` = `dry_run` (bool; `True` = report planned changes
  only, default).
- **Output**: originals log (JSON string) — **save this** (e.g. to a file
  via a String-to-File node); it's the input for restore.
- Note: Fire Rating is typically a *type* parameter, so a seeded change
  shows on every instance of that type — that's fine for demo purposes and
  the log records the type-level original.

## fire_rating_restore.py — undo the seeding

- **Inputs**: `IN[0]` = the originals log JSON string from the seed run.
- **Output**: per-entry restore results.
