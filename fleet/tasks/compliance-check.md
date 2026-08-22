# Task: Compliance Check (fire ratings and required values)

Severity class: 1 (life-safety/compliance) · Phase: v1

## Objective
Verify that required parameter values (fire ratings, occupancy, and other
rules a firm declares) are present, consistent, and semantically coherent —
the check Revit cannot do, because "4 HR", "4hr", "4 hours", and "240 min"
are four strings to Revit and one rating to a code official. Deliver precise
findings. This task never drafts fixes: a missing rating is a design
decision, not a typo.

## Inputs
- Element parameters for every category named in the compliance rules
  (typically walls, doors, floors, rooms): the rule's target parameter,
  type name, level, host relationships, phase
- Compliance rules file (required for requirement checks):
  /standards/compliance.md
- Exceptions log: fleet/state/exceptions.md
- Prior findings from this task (to mark long-standing vs. new)

## Detection
1. For each rule in compliance.md, resolve its scope to concrete elements,
   then check the requirement. Normalize semantically equivalent values
   before comparing ("2 HR" satisfies "2 hours"; "45 min" satisfies
   "0.75 hr") — but always report the value as written in the model.
2. Consistency checks run even without a rules file:
   - Same rating written in different forms across a wall type or level —
     flag for normalization (the divergence itself is the finding).
   - Conflicting ratings: a door rated below its host wall's requirement,
     or two instances of one type carrying different values.
   - Required parameter empty on an element whose peers all carry a value.
3. Skip findings matching the Exceptions log. Mark each finding NEW or
   STANDING (with first-seen date) so repeat findings read as unresolved,
   not rediscovered.

## Fix policy: diagnose-only
Never draft a CR, even for pure normalization renames. Every finding is a
daily-report entry stating: element(s), the rule (cited from compliance.md,
with source column), the value as written, and what satisfying the rule
requires. Value normalization is a candidate for promotion to
suggest-with-options once this task's diagnoses prove reliable — that
promotion is a task-file edit a firm makes deliberately, not a drift.

## Confidence gate
- [HIGH]: the rule clearly applies and the value is missing or clearly
  short of the requirement.
- [MED]: scope match is uncertain (e.g. "rated wall" reading is ambiguous)
  or equivalence is uncertain. Report as "possible finding" with the
  ambiguity stated.
- Ambiguous or conflicting rules in compliance.md: report the ambiguity
  itself; check neither reading against the model.

## Change request format
Not applicable — this task produces report entries only. Findings lead the
daily report (severity class 1), [HIGH] before [MED], and follow the
compliance-findings line format in formats/daily-report.md.

## Feedback handling
If the BIM manager marks a finding as intentional or not-applicable, log it
to the Exceptions log (element scope; pattern scope if they indicate a
class). Never re-report an excepted finding. 3+ dismissals sharing a
pattern → suggest the corresponding compliance.md scope tightening in the
daily report.

## Hard limits
- No CRs, no writes of any kind, ever, from this task.
- Max 15 findings per daily report; overflow goes to the deferred backlog
  with the total count, worst (highest-confidence, life-safety-first)
  findings reported first.
- If compliance.md is missing, run consistency checks only and note in the
  report that requirement checks are off.
