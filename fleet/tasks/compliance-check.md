# Task: Compliance Check (fire ratings and required values)

Severity class: 1 (life-safety/compliance) · Phase: v1 · Fix policy: suggest-with-options (parameter update CRs)

## Objective
Verify that required parameter values (fire ratings, occupancy, and other
rules a firm declares) are present, consistent, and semantically coherent —
the check Revit cannot do, because "4 HR", "4hr", "4 hours", and "240 min"
are four strings to Revit and one rating to a code official. Draft parameter
update CRs where the correct value is defensible; deliver diagnosis where it
is a design decision. Never guess a rating into existence.

## Inputs
Model-data bullets are the query contract with the cache agent (runtime.md):
query only these objects and fields, cheapest first.
- Element parameters for every category named in the compliance rules
  (typically walls, doors, floors, rooms): the rule's target parameter,
  type name, level, host relationships, phase
- Compliance rules file (required for requirement checks):
  /standards/compliance.md
- Exceptions log: fleet/state/exceptions.md
- Prior CRs and findings from this task (approved, rejected, standing)

## Detection
1. For each rule in compliance.md, resolve its scope to concrete elements,
   then check the requirement. Normalize semantically equivalent values
   before comparing ("2 HR" satisfies "2 hours"; "45 min" satisfies
   "0.75 hr") — and report the value as written in the model.
2. Consistency checks run even without a rules file:
   - Same rating written in different forms across a type or level.
   - Conflicting ratings: a door rated below its host wall's requirement,
     or two instances of one type carrying different values.
   - Required parameter empty on an element whose peers all carry a value.
3. Skip findings matching the Exceptions log. Mark diagnose-only findings
   NEW or STANDING (first-seen date) so repeats read as unresolved, not
   rediscovered.

## Fix policy: suggest-with-options (parameter update CRs), diagnose where ambiguous
Draft a parameter update CR when the correct value is determined by the
rules or the model itself:
- **Normalization**: equivalent-but-differently-written values rewritten to
  the standard's written form ("2 HR" → "2 hours" per compliance.md).
- **Conflict resolution with a defensible answer**: instances of one type
  diverging where the type's value is established — propose aligning, with
  the source stated; offer at most 2 options when two readings are viable.

Stay diagnose-only (report entry, no CR) when the fix would *invent* a
value: a missing rating, or a door genuinely under-rated for its host wall —
those are design decisions. The report entry still names the element, the
rule (cited with source), the value as written, and what satisfying the
rule requires.

## Confidence gate
- High (draft CR): the rule clearly applies and the target written form is
  explicit in compliance.md or unanimous among peers.
- Medium (flag, no CR): scope match uncertain (e.g. "rated wall" reading is
  ambiguous), equivalence uncertain, or peers disagree on the written form.
- Ambiguous or conflicting rules in compliance.md: report the ambiguity
  itself; enforce neither reading.

## Change request format
- Element/type ID, parameter, current value → proposed value
- One-line rationale citing the rule and source column ("per compliance.md:
  ratings written in hours; '120 min' → '2 hours', IBC 713.4")
- Batch by rule, max 15 updates per CR
- Diagnose-only findings lead the daily report (severity class 1),
  [HIGH] before [MED]

## Feedback handling
Rejected CR or dismissed finding → Exceptions log (element scope; pattern
scope when the reason names a class). Never re-propose or re-report. 3+
rejections sharing a pattern → suggest the corresponding compliance.md
edit in the daily report; never silently rewrite the standards file.

## Hard limits
- Parameter writes only, and only to values already defensible from the
  rules file or the model — never invent a rating. Missing values are
  always diagnose-only.
- Max 2 CRs per day for this task; max 15 diagnose findings per report,
  overflow to the deferred backlog, life-safety-first.
- If compliance.md is missing, run consistency checks only and note in the
  report that requirement checks are off.
