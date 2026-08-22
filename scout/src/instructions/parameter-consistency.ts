import type { Instruction } from "./types";

/**
 * Note on style: literal values below are wrapped in "double quotes" rather
 * than markdown backticks, because the body is a template literal and stray
 * backticks would need escaping throughout.
 */
export const parameterConsistency: Instruction = {
  id: "parameter-consistency",
  title: "Parameter value consistency",
  enabled: true,
  body: `Find parameter values in this model that are mistakes: misspellings, grammar
errors, or values that are semantically inconsistent with how the same parameter
is used elsewhere in the model.

## What you are looking for

The strongest signal is a value that is *nearly* consistent with many others but
differs on a handful of objects. If 500 walls have a fire rating of "4 HR" and
one says "4 hours", that one is a data-entry mistake — same meaning, wrong
notation, and it will break any downstream filter or schedule that groups on
that value.

Concretely, look for:

- **Misspellings** — "Strucutral" where every other object says "Structural".
- **Notation drift** — the same parameter written several ways across the model:
  "4 HR" / "4 hours" / "4hr", or "Level 2" / "L2" / "Lvl 2".
- **Unit inconsistency** — the same quantity expressed in different units in one
  parameter, e.g. some objects in minutes and others in hours. Two values that
  mean the same thing but read differently ("60 MIN" and "1 HR") are worth
  flagging: nothing downstream will treat them as equal.
- **Case and whitespace** — "fire rated" vs "Fire Rated", or values with leading
  or trailing spaces that make otherwise-identical values distinct.
- **Placeholder or junk values** — "TBD", "xxx", "N/A", "asdf", "?" sitting in a
  parameter that is otherwise properly filled in.

## How to work

1. Start with list_object_types to see what is in the model.
2. Use list_property_keys to find candidate parameters. The interesting ones
   have **many objects and few distinct values** — that shape means the
   parameter is effectively an enumeration, so a one-off variant stands out.
   Text-like parameters (Type Mark, Comments, Description, Fire Rating, material
   and finish names) are far more likely to carry mistakes than computed
   numeric ones.
3. For each candidate, call distinct_values and read the histogram. A value with
   a low count sitting beside a near-identical value with a high count is the
   classic case.
4. Before reporting, use sample_objects to confirm the objects are genuinely
   comparable — same category, same kind of element.
5. Call report_finding once per distinct problem.

Work through the most promising parameters first. You do not need to examine
every parameter in the model; prefer a few well-evidenced findings over broad
shallow coverage.

## What is NOT a finding

Be conservative. A wrong finding costs the reviewer more than a missed one.

- **Legitimate variety.** A model containing "2 HR", "1 HR", and "NR" fire
  ratings is normal — different walls genuinely have different ratings. Only
  flag a value if it looks like a *different way of writing* a value that
  already exists, or is plainly malformed.
- **Distinct real values.** Different room names, different mark numbers,
  different dimensions. High distinct-value counts usually mean the parameter is
  an identifier, not an enumeration.
- **Computed numbers.** Areas, volumes, lengths and coordinates vary
  continuously by design. Never report these as inconsistent.
- **Domain vocabulary you are unsure about.** Construction has a lot of
  legitimate jargon and abbreviation. If you cannot tell whether a term is a
  typo or a product name, either check whether a correctly spelled variant
  exists elsewhere in the model, or do not report it.
- **A parameter used by only one or two objects.** With no majority to compare
  against there is no evidence of inconsistency.

## Severity

- high — a clear mistake with an unambiguous correct value present in the model
  (a misspelling, or a notation variant of an existing value).
- medium — genuine inconsistency where the intended value is less certain, such
  as mixed units across a parameter.
- low — cosmetic, e.g. case or whitespace differences only.`
};
