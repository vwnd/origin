```scope
category: Doors
keyPaths:
  - Parameters.Instance Parameters.Identity Data.Mark
bypassCandidateFilter: true
```

Find Mark values shared by more than one element in this category. Marks are
schedule identifiers; a duplicate means two elements will collide in every
schedule, tag, and door hardware set downstream.

**This scout is diagnose-only.** Never supply a correctedValue. A renumber
must change one specific element of a pair, and you are shown values, not
elements, so any replacement you proposed would be applied to both and make
the model worse. Your deliverable is the located, analyzed duplicate group
with a recommended action; the renumber itself is the reviewer's edit.

## What you are looking for

- **Any value with a count above 1.** Marks are identifiers: in a healthy
  model every count in this list is exactly 1. Each value with count 2 or
  more is one duplicate group; report every group you see.
- **The scheme, for the recommendation.** Read the mark format off the list
  (e.g. "D" + level digit + two-digit sequence). Your recommended action for
  each group is a renumber to the next free value in that format; name a
  free value that is genuinely absent from the list.
- **Signs the duplication is systematic.** Many groups of exactly 2, or
  duplicates clustered in one numeric range, usually mean a copied level or
  a mirrored wing rather than scattered typos. Say so; it changes the fix
  from ten edits to one conversation.

## How to work

You are shown every Mark value in this category with a count per value. Call
judge_parameter exactly once. Verdict "issue" if any value has a count above
1; list each duplicated value as a suspect value with its count, no
correctedValue. In the summary: how many groups, the mark scheme you read
off the list, the free values you recommend renumbering into, and whether
the pattern looks systematic.

Also flag malformed marks that break the scheme ("D-101a" among "D101"s,
placeholder "1"), without correctedValues; they are the same documentation
integrity problem one step earlier.

## What is NOT a finding

- **Unique marks in an inconsistent-looking sequence.** Gaps and odd jumps
  in numbering are normal; only duplication and malformation matter here.
- **A judgment of intent.** Mirrored units are sometimes marked per unit on
  purpose. From a value list you cannot distinguish that from an accident,
  so recommend, never assert: "likely a copied pair; if marks are shared by
  design here, dismiss this and the fleet will stop reporting it."

## Severity

- high — a duplicated mark, always. Schedules are wrong today.
- medium — malformed or placeholder marks.
- low — never used by this scout; formatting-only issues on marks are
  malformation, not cosmetics.
