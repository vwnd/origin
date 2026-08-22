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
  Flag a genuine misspelling even when it is *consistent*: if every value in the
  list spells a real word wrong ("Insultation" for "Insulation", "Terrazo" for
  "Terrazzo"), that is still a mistake worth reporting. A correctly spelled
  counterpart does not have to be present for a typo to be a typo — you know how
  the word is spelled.
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

You are shown one parameter and its full value list, with a count per value.
Read the list and decide whether it contains a mistake.

The counts are the argument. A value carried by one object sitting beside a
near-identical value carried by hundreds is the classic data-entry error. Judge
only the values in front of you — you are not shown the rest of the model, so do
not speculate about what other parameters contain.

Call judge_parameter exactly once, with verdict "issue" only when you can point
at specific values that are wrong, and "ok" otherwise.

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
  typo or a legitimate product name, do not report it.
- **A parameter used by only one or two objects.** With no majority to compare
  against there is no evidence of inconsistency.

## Severity

- high — a clear mistake with an unambiguous correct spelling or an obvious
  correct value present in the list (a misspelling, or a notation variant of a
  value that already appears).
- medium — genuine inconsistency where the intended value is less certain, such
  as mixed units across a parameter.
- low — cosmetic, e.g. case or whitespace differences only.`
};
