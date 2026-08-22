# Task: Misspellings

Severity class: 4 (consistency/cosmetic) · Phase: v1

## Objective
Find clear spelling errors in text-bearing fields — sheet names, view names,
text notes, comments — and propose the correction. Spelling only: never
expand abbreviations, rephrase, or change meaning. Room names are excluded —
nomenclature owns them.

## Inputs
Query contract with the cache agent (runtime.md) — only these objects and
fields, cheapest first.
- All Sheet objects: Number, Name
- All View objects: Name, Title on Sheet
- All TextNote objects: Text, owner view/sheet
- Comments parameter where non-empty: element id, category, Comments
- Project standards file (optional): /standards/naming.md — project
  dictionary and approved abbreviations, if listed
- Exceptions log: fleet/state/exceptions.md
- Prior change requests for this task (approved and rejected)

## Detection
1. Infer the model's language from the text set and state it. If the
   standards file names a language or dictionary, that wins.
2. A candidate is a token that is not a dictionary word in that language.
   Immediately discard: recognized AEC abbreviations (MECH, ELEC, CORR,
   TYP, DIM, …), proper nouns and product/manufacturer names,
   codes/identifiers (type marks, grid names, sheet numbers), units.
3. A candidate is a **misspelling** only when a small-edit-distance
   dictionary word clearly fits the context. Strongest signal: the correct
   form already elsewhere in the model ("Coridor" in one view title,
   "Corridor" in fourteen others) — cite it when present.
4. A possible intentional abbreviation or domain term is not a misspelling.
   When in doubt, it isn't one.
5. Skip terms in the Exceptions log or the project dictionary.

## Fix policy: auto-propose
The corrected spelling of the same word — deterministic once confirmed.
Where two corrections genuinely fit (rare), offer at most 2 options with a
stated preference.

## Confidence gate
- High (draft CR): misspelling and correction both unambiguous — ideally
  the correct form already appears in the model.
- Medium (plausible typo, possibly intentional): daily report as "flagged,
  no CR."
- Model language not establishable (heavily mixed or unrecognized): propose
  nothing; report that instead.

## Change request format
- Element ID, field/parameter, current value, proposed value
- One-line rationale naming the word and evidence ("'Coridor' →
  'Corridor'; correct spelling appears in 14 other views")
- Batch by field type (sheet names together, text notes together), max 15
  corrections per CR

## Feedback handling
Rejected correction → Exceptions log as accepted project vocabulary; never
flag that term again anywhere in the model. 3+ rejections sharing a pattern
(e.g. house abbreviations) → suggest adding them to the naming.md project
dictionary, noted in the daily report.

## Hard limits
- Parameter writes only. Never modify geometry, delete, or create.
- Spelling only: never expand/contract abbreviations or change word choice;
  casing and structure belong to nomenclature.
- Never flag room Name values.
- Max 2 CRs per day.
- If >40 misspellings, fix the most-repeated terms first; report the total
  in the deferred backlog.
