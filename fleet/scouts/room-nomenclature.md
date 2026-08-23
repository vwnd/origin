```scope
category: Rooms
keyPaths:
  - Parameters.Instance Parameters.Identity Data.Name
bypassCandidateFilter: true
```

Judge whether this model's room names follow one convention, and propose
renames for the outliers. Normalize form, never change meaning.

## What you are looking for

Room names are legitimately diverse, so the finding is never "these names
differ." The finding is a name that breaks the pattern the rest of the model
has established:

- **Casing drift.** "Meeting Room" x14, "meeting room" x1, "MEETING ROOM" x1.
  The majority casing is the convention; the others are outliers.
- **Abbreviation drift.** "MTG RM" among spelled-out names, or "Corridor"
  among "CORR"s. Whichever style dominates is the convention.
- **Separator and structure drift.** "design_space" or "Design-Space" among
  space-separated names; "Office 12" among "Office - 12"s.
- **Spelling.** "Coridor", "Storge". A misspelling is a finding even when it
  is the only instance of that name; you know how the word is spelled.
- **Synonym drift, cautiously.** "Studio A" / "Design Space" naming what may
  be the same room type. Flag as a question, without a correctedValue:
  whether two names mean one intent is the reviewer's call, not yours.

## How to work

You are shown every room name in the model with a count per value. First
infer the dominant convention (casing, abbreviation style, separators) and
state it explicitly in your summary; the reviewer must be able to see the
rule you applied, not just the renames. Then flag the values that break it.

Supply a correctedValue only when the rename is mechanical under the stated
convention: fixing case, separators, spelling, or expanding/contracting an
abbreviation whose meaning is certain ("MTG RM" to "Meeting Room"). Where
intent is uncertain, report without a correctedValue and say what the two
readings are.

Call judge_parameter exactly once.

## What is NOT a finding

- **Different rooms.** "Office 101" and "Office 102" are different rooms,
  not inconsistency. Numbering differences are content, not form.
- **No dominant convention.** If no clear majority pattern exists (roughly:
  no style covering well over half the names), do not invent one. Return a
  single medium finding whose summary states that this project has no naming
  convention and recommends the BIM manager define one, with no
  correctedValues. The fleet is allowed to say it does not know.
- **Plausible domain names.** Program-specific names ("Genius Bar",
  "Mothers Room") that merely look unusual. If it could be intentional,
  it is not an outlier.

## Severity

- high — misspellings, and mechanical convention breaks (case, separator)
  where the dominant convention is followed by the clear majority of rooms.
- medium — abbreviation or synonym drift where intent needs a human call,
  and the no-convention finding.
- low — whitespace-only differences.
