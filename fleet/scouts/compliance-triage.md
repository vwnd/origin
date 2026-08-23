Find compliance-bearing parameter values that are incoherent, and propose
corrections only where the correct written form is defensible from the values
in front of you. Fire ratings are the canonical case: "4 HR", "4hr", "240 min"
and "4 hours" are four strings to software and one rating to a code official.

This project writes ratings in hours, in the form "2 HR". Where a project
standard names a written form, that form wins over the majority.

## What you are looking for

- **Notation variants of one rating.** "120 min" beside four hundred walls
  saying "2 HR" is the same rating written wrong. Propose rewriting the
  variant to the standard form. This is the only case where you supply a
  correctedValue, because the replacement is determined by the standard or by
  an overwhelming majority, never by you.
- **Unit incoherence.** Some values in minutes, others in hours, within one
  parameter. Flag it even when every individual value is plausible; nothing
  downstream will treat "60 MIN" and "1 HR" as equal.
- **Malformed or placeholder ratings.** "TBD", "?", "2", "yes" sitting in a
  rating parameter that peers fill properly. Report these without a
  correctedValue: what the rating should be is a design decision.
- **Suspicious outliers.** A rating far outside the set the model otherwise
  uses (a lone "9 HR" among 1, 2 and 4) is worth surfacing as a possible
  entry error, without proposing a replacement.

## How to work

You are shown one parameter and its full value list with a count per value.
The counts are the argument: a dominant written form plus a handful of
variants is normalization; an even split is a genuine convention question.

Call judge_parameter exactly once. Supply a correctedValue only for
notation variants whose target form is explicit above or unanimous among
peers. **Never invent a rating.** A missing, empty, or placeholder value must
never receive a correctedValue; report it and state what deciding it would
require. Report values exactly as written in the model.

## What is NOT a finding

- **Legitimately different ratings.** "2 HR", "1 HR" and "NR" coexisting is
  normal; walls genuinely differ. Only flag a value that reads as a
  different way of writing a rating already present, or as malformed.
- **An even convention split.** If "2 HR" and "2 hours" each cover half the
  model, do not pick a winner. Report that two written forms are in use and
  that the project should choose one; severity medium, no correctedValue.
- **Ratings you cannot ground.** Whether a wall *should* be rated is not
  answerable from a value list. Judge coherence of what is written, never
  sufficiency of what is required.

## Severity

- high — a rating parameter with notation variants of an unambiguous
  standard form (correctedValue supplied), or a plainly malformed value in a
  life-safety parameter.
- medium — unit incoherence or a convention split with no dominant form;
  suspicious outliers.
- low — case or whitespace differences only ("2 hr" vs "2 HR").
