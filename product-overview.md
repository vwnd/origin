# Origo Agent Fleet — Product Overview

*Automated daily maintenance for Revit models. "Dependabot for Revit."*

Scope: Agent-side work and overall product narrative. Infra/pipeline scope is marked with
`[TEAMMATE SCOPE]` placeholders. Implementation detail lives in
`fleet/README.md`, `fleet/fleet-rules.md`, `fleet/runtime.md`,
`fleet/scope-map.md`, and the task files in `fleet/tasks/`.

---

## 1. The problem

**Models rot continuously; cleanup happens episodically.** That mismatch is
the cost.

A live Revit model accumulates entropy every day it is worked in: duplicate
marks, identical instances stacked on top of each other, rooms named five
different ways, fire ratings written as "2 HR" on one wall and "120 min" on
its neighbour, leftover trace lines collinear with the walls they were used
to draw. None of it stops work today. All of it breaks something later —
schedules, tags, IFC exports, clash coordination, permit sets.

Three structural failures keep it that way:

**1. Detection without resolution.** Revit already warns. Model Checker,
Solibri and Ideate warn more. The warning list is not a scarce resource —
on a real project it is a scroll of hundreds of untriaged lines that no one
owns. *Knowing* is solved. *Doing* is not. Every existing tool in this
category stops exactly where the work begins.

**2. Semantic blindness.** Rule engines compare strings. "4 HR", "4hr",
"240 min" and "4 hours" are four values to Revit and one rating to a code
official. "Studio A", "Design Space" and "design_space" are three names and
one intent. A regex cannot tell a convention from a violation, an
intentional mirrored-unit duplicate from a modelling mistake, or a design
option in progress from a defect. The judgment layer has never been
automatable — so it was never automated.
- Current Revit built-in "spelling check" doesn't detect obvious spelling mistakes.
- There are well-spelled typos such as "insultation" in place of "insulation". Imagine a sleep-deprived architect naming an item "I hate [client]".

**3. The work is uneconomic for humans.** Each individual fix is thirty
seconds of trivial effort, so it is never worth scheduling. Collectively it
is weeks of deferred junior labour, so it becomes a crunch: the pre-permit,
pre-IFC, pre-coordination cleanup sprint that everyone budgets for and no
one enjoys. Deferred, it also gets *more* expensive — a naming
inconsistency propagated across four hundred rooms costs more than the same
one caught the day it appeared.

The net effect: **BIM standards are hard to maintain.** 

---

## 2. Why now

Speckle can push **parameter updates into Revit as change requests**: a
proposed change lands in the modeller's own file and is accepted with a
click. 

That is a positive signal for "closing the loop". Issue detection (beyond the semantics catch) was not difficult. Handing a fix *back* was (beyond the simple "delete instances" in Revit warning window). Without a return path the ceiling on any
checker is a report, and the expensive half of the job, the doing, stays
manual.

The other half arrived with agents: what's left after detection is
small-batch contextual judgment — intentional duplicate or mistake? "4 HR" or
"4 hours"? — which rule engines can't do and agents can.

Together, the loop closes:

```
detect ──► judge ──► draft the fix ──► deliver into Revit ──► approve
   ▲                                                            │
   └───────────── rejection teaches the fleet ◄──────────────────┘
```

And it closes only as far as the write path is clean — which is what sets
v1's scope, not caution. Parameter writes and element deletes round-trip, so
those ship as approve-in-Revit change requests. Geometry doesn't yet, so
those ship located, diagnosed, and with a recommended action. (§5.2, §8.)

---

## 3. Value proposition

**The fleet does the part nobody does: it closes the loop.**

Value lands in two forms, and the second one matters more than it first
looks:

**A. Pre-drafted fixes.** Issues arrive as small, reviewable change requests
— element ID, current value, proposed value, one-line rationale — delivered
through Speckle's parameter-update change requests and approved by the BIM
manager inside Revit, in place. Not a report to act on. A change to accept.

**B. Pre-done investigation.** Some issues can't or shouldn't be auto-fixed
(a wall overlap, an off-axis line, a missing fire rating that is genuinely a
design decision). Those still arrive **located, dissected, and with a
recommended action** — a context & recommendation report. The fleet saves
the energy of finding, inspecting and analyzing even when the hands stay
human. *A report without a recommendation is just a warning, and Revit
already has warnings.*

**The wedge on top of both: semantic detection.** For nomenclature,
misspellings and compliance-value coherence there is no native warning to
inherit. This is detection a rule engine cannot perform at all — and the
clearest demonstration that this is a different category of tool, not a
better checker.

**Positioning:** daily background maintenance instead of episodic cleanup
sprints. Small, reviewable, pre-drafted, human-approved. Dependabot's exact
shape, applied to building models.

### What changes for the customer

| Today | With the fleet |
|---|---|
| Hundreds of untriaged warnings, no owner | ~8 CRs and a 2-minute report, reviewed daily |
| Cleanup crunch before every milestone | Warning count trends toward zero continuously |
| Standards live in a PDF nobody checks | Standards are markdown the fleet enforces |
| Semantic drift invisible until export | Caught the day it appears |
| Every issue costs find + diagnose + fix | Find and diagnose are already done |

---

## 4. Conceptual system

Five layers. This repo owns layer 3 and the knowledge layer that feeds it.

```
┌────────────────────────────────────────────────────────────────┐
│ 1. CAPTURE & TRANSPORT           [TEAMMATE SCOPE]              │
│    Revit ──► Speckle ──► Origo server                          │
│    Model geometry + parameters + native warning list           │
└────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│ 2. KNOWLEDGE LAYER              (customer-authored)            │
│    /standards/naming.md     the firm's conventions             │
│    /standards/compliance.md the firm's code requirements       │
│    fleet/state/exceptions.md  what humans already said no to   │
└─────────────────────────────┬──────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│ 3. AGENT FLEET                                                 │
│    Agent A  cache agent — one Speckle download/run, serves SQL │
│    Agent B  task agents  — one per task md, judgment work only │
│    Output: CRs · context & rec reports · daily report          │
└─────────────────────────────┬──────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│ 4. DELIVERY & APPROVAL           [TEAMMATE SCOPE]              │
│    Origo server ──► Speckle parameter-update change requests   │
│                 ──► approved in place, inside Revit            │
│    Issue panel: grouped by action type, then level             │
│    BIM manager approves / rejects / dismisses                  │
└─────────────────────────────┬──────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│ 5. FEEDBACK LOOP                (shared)                       │
│    Approvals ──► model updated, pushed back to Revit           │
│    Rejections + reasons ──► Exceptions log ──► layer 2         │
│    3+ same-pattern rejections ──► convention revision          │
└────────────────────────────────────────────────────────────────┘
```

**The loop is the product.** Layers 1 and 4 make the round trip possible;
layer 3 does the judgment; layer 5 is what makes the system get better at
*this firm* over time rather than staying generic forever.

---

## 5. Fleet Structure

**The task markdown is the unit of product.** Every capability is one file
with the same eight sections: Objective · Inputs · Detection · Fix policy ·
Confidence gate · CR format · Feedback handling · Hard limits. Two
consequences: a BIM manager can read exactly what the fleet will and won't do, and change it; and adding a capability means just
authoring another markdown file.

**Deliverable classes — how far each issue closes the loop:**

| Class | Deliverable | Closure |
|---|---|---|
| `[parameters update CR]` | Change request updating parameter values | Full — approve in Revit |
| `[delete CR]` | Change request deleting an element | Full — approve in Revit |
| `[context and rec]` | Located, analyzed issue + recommended action | Partial — user acts, finding and diagnosis are done |

Full map: `fleet/scope-map.md`.

**Fix policy — how much the agent decides:** *auto-propose* (deterministic
fix, agent adds rationale) · *suggest-with-options* (judgment fix, stated
preference, max 2) · *diagnose-only* (often a design condition in progress,
not an error — the diagnosis is the deliverable). Over all three, a
confidence gate: high → CR, medium → flagged line in the daily report, no
dominant convention → "this project has none; define one." *The fleet is
allowed to say it doesn't know.*

**Detection is warnings-first.** Where Revit warns natively, the imported
warning list is the seed and the agent starts where the warning stops:
triage, keeper call, rationale. Nomenclature, misspellings and compliance
coherence have no warning to inherit — fully agent-detected.

**Runtime.** One cache agent downloads from Speckle per run and answers SQL
over it; task agents query it for small subsets and do judgment only. Each
task's Inputs section *is* that query contract. Principle: **automate before
agents** — anything deterministic belongs in the pipeline, never in a prompt.

**The daily workflow:**

```
overnight   fleet runs · caps + severity ordering applied
morning     ~8 CRs, severity-ordered, + one 2-minute daily report
            (diagnose-only findings · flagged items · convention
             revisions · deferred backlog · data gaps)
~5 min      approve most · reject some with a reason
            rejections ──► Exceptions log ──► never re-proposed
```

Optional switch to other modes: **pre-milestone sweep** (caps 10 → 25;
gates and hard limits unchanged — sweep changes volume, not judgment) and
**incoming model audit** (health report on a consultant's model before
linking).

---

## 6. Trust architecture

The binding constraint is not detection capability. It is whether a BIM
manager trusts a probabilistic machine near their model. Five invariants:

1. **Human approval is the only path to a model change.**
2. **No CR without a rationale evaluable in one read.** If it needs a second
   paragraph, the fix isn't confident enough.
3. **v1 writes are parameter updates and element deletes only** — what a
   reviewer can fully evaluate from the CR text.
4. **Rejections are durable.** Never re-proposed; 3+ sharing a pattern force
   a convention revision.
5. **Never enforce a pattern nobody chose.** Inferred conventions are stated
   explicitly in every CR.

Plus the caps: max 10 CRs/day, ~8 as the design center, ~5-minute review.
Overflow becomes a visible deferred backlog.

**The cap is a feature.** What would kill this product is a
user trained to bulk-approve. 

---

## 7. The compounding asset

Rejections-with-reasons and convention revisions accumulate into the
Exceptions log and the standards files — an executable record of what *this
firm* actually means, assembled as a byproduct of five minutes a day. It
answers "our standards aren't really written down": **using the product
writes them.** 

---

## 8. Scope ladder

| Phase | Write scope | Capabilities |
|---|---|---|
| **v1** | Parameter writes + element deletes | nomenclature · misspellings · compliance-check · duplicate-room-numbers · duplicate-marks · identical-instances |
| **v1.5** | + geometry **read** | overlap-locator · off-axis-lines (as context & rec) · room-not-enclosed diagnosis |
| **v2** | + geometry write | off-axis snap · simple element creation (e.g. a wall closing a room boundary) |
