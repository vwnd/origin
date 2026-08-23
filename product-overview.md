# Origo Agent Fleet — Product Overview

*Automated daily maintenance for Revit models. Dependabot for Revit.*

The runtime is the `scout/` Cloudflare Worker on this branch. The fleet's
design docs (task specs, formats, scope map) live in `fleet/`. Status labels: **[built]** means running on this branch today,
**[designed]** means specified in `fleet/` and scheduled on the scope ladder.

---

## 1. The problem

**Models rot continuously; cleanup happens episodically.** That mismatch is
the cost.

A live Revit model accumulates entropy every day it is worked in: duplicate
marks, identical instances stacked in place, rooms named five different ways,
fire ratings written as "2 HR" on one wall and "120 min" on its neighbour,
leftover trace lines collinear with the walls they drew. None of it stops work
today. All of it breaks something later: schedules, tags, IFC exports, clash
coordination, permit sets.

Three structural failures keep it that way.

**1. Detection without resolution.** There are plenty of tools that can detect issues. But on a real project, the warning list is a scroll
of hundreds of untriaged lines that no one owns. Detection stops where the actual work begins.

**2. Semantic blindness.** Rule engines compare strings. "4 HR", "4hr",
"240 min" and "4 hours" are four values to Revit and one rating to a code
official. A regex cannot tell a convention from a violation, an intentional
mirrored-unit duplicate from a mistake, or a design option in progress from a
defect. The judgment layer
was never automatable.
Even spelling is out of reach: "Insultation" is a well-formed string,
and Revit's spell check never sees parameter values at all. 

- Revit's built-in "spelling check" doesn't detect obvious spelling mistakes.
- Well-spelled mistakes like "insultation". Imagine a sleep-deprived architect naming an item "I hate [client]".

**3. The work is uneconomic for humans.** Each fix is thirty seconds of
trivial effort, so it is never worth scheduling. Collectively it is weeks of
deferred junior labour, so it becomes the pre-permit, pre-IFC cleanup crunch
that everyone budgets for and no one enjoys. When deferred, it also compounds: a
naming inconsistency propagated across four hundred rooms costs more than the
same one caught the day it appeared.

Net effect: BIM standards are easy to write and very difficult to keep.

---

## 2. Why now

Two capabilities arrived at the same time, and the product exists in their
intersection.

Speckle can now carry **parameter updates back into Revit as change
requests**: a proposed edit lands in the modeller's own file and is accepted
with a click. Without that return path, the ceiling on any checker is a
report, and the expensive half of the job stays manual.

And what remains after detection, the small-batch contextual judgment
(intentional duplicate or mistake? "4 HR" or "4 hours"?), is exactly what
rule engines cannot do and language models can.

Together, the loop closes:

```
detect ──► judge ──► draft the fix ──► deliver into Revit ──► approve
   ▲                                                            │
   └───────────── rejection teaches the fleet ◄─────────────────┘
```

It closes only as far as the write path is clean, and that is what sets v0's
scope. Parameter writes round-trip today, so those ship as
approve-in-Revit change requests. Deletes and geometry do not yet, so those
ship located, diagnosed, and with a recommended action (§7).

---

## 3. Value proposition

**The fleet does the part nobody does: it closes the loop.**

Value lands in three forms, and the third compounds.

**A. Pre-drafted fixes.** Issues arrive as small, reviewable change requests:
element ID, current value, proposed value, one-line rationale, delivered as
Speckle parameter-update change requests and approved inside Revit, in place. 

**B. Pre-done investigation.** Some issues cannot or should not be auto-fixed
(a wall overlap, a missing fire rating that is genuinely a design decision).
Those still arrive located, dissected, and with a recommended action, reducing friction in the loop.

**C. Standards that write themselves.** Every rejection carries a reason, and
reasons accumulate into an exceptions log and the standards files: an
executable record of what *this firm* actually means, assembled as a
byproduct of five minutes a day. Most firms' standards live in a PDF nobody
checks. Using the fleet is what writes them down. This is also why the
product compounds per firm instead of staying generic, and why it is hard to
catch up with. **[designed; log format in `fleet/formats/exceptions-log.md`]**

**Positioning:** daily background maintenance instead of episodic cleanup
sprints. Small, reviewable, pre-drafted, human-approved. Dependabot for building models.

### What changes for the customer

| Today | With the fleet |
|---|---|
| Hundreds of untriaged warnings, no owner | A short severity-ordered CR batch and a 2-minute report, daily |
| Cleanup crunch before every milestone | Issue count trends toward zero continuously |
| Standards live in a PDF nobody checks | Standards are markdown the fleet enforces |
| Semantic drift invisible until export | Caught the day it appears |
| Every issue costs find + diagnose + fix | Find and diagnose are already done |

### Why not export a schedule and paste it into an LLM

Because that answers the easy half. An LLM reading a pasted schedule spots
"Insultation" perfectly well. Four things it cannot do:

| | Schedule → chat window | The fleet |
|---|---|---|
| Trigger | Someone remembers to export | Webhook, on every publish |
| Scope | The categories you thought to include | Every object's writable parameters |
| Knows what is fixable | No; proposes edits Revit will refuse | Non-editable parameters will not be indexed |
| Output | Text you retype into the model | A change request accepted in place |

 The additionality
is the pipeline and the return path (both built). Detection depth is
the roadmap.

---

## 4. System

```
┌────────────────────────────────────────────────────────────────┐
│ 1. CAPTURE & TRANSPORT                              [built]    │
│    Revit ──► Speckle ──► webhook ──► selective walk            │
│    Parameters only, geometry never fetched                     │
│    (863 MB model ──► 122.5 MB, zero meshes)                    │
└─────────────────────────────┬──────────────────────────────────┘
┌─────────────────────────────▼──────────────────────────────────┐
│ 2. KNOWLEDGE LAYER                 (customer-authored)         │
│    standards/naming.md          the firm's conventions         │
│    standards/compliance.md      the firm's code requirements   │
│    fleet/state/exceptions.md    what humans already said no to │
└─────────────────────────────┬──────────────────────────────────┘
┌─────────────────────────────▼──────────────────────────────────┐
│ 3. AGENT FLEET                                      [built]    │
│    Index: per-version Durable Object + SQLite, no geometry     │
│    Scouts: markdown bodies in R2, edited live in the UI        │
│    SQL picks the candidates; the model judges one histogram    │
└─────────────────────────────┬──────────────────────────────────┘
┌─────────────────────────────▼──────────────────────────────────┐
│ 4. DELIVERY & APPROVAL                              [built]    │
│    Findings ──► Speckle issue + objectDeltas resource meta,    │
│    the same shape Speckle's parameter updater writes, so the   │
│    proposed edits are reviewed and applied in Speckle's own    │
│    viewer and land in Revit as change requests                 │
└─────────────────────────────┬──────────────────────────────────┘
┌─────────────────────────────▼──────────────────────────────────┐
│ 5. FEEDBACK LOOP                                    [designed] │
│    Approvals ──► model updated, pushed back to Revit           │
│    Rejections + reasons ──► exceptions log ──► layer 2         │
│    3+ same-pattern rejections ──► convention revision          │
└────────────────────────────────────────────────────────────────┘
```

**The loop is the product.** Layers 1 and 4 make the round trip possible,
layer 3 does the judgment, layer 5 is what makes the system get better at
this firm over time instead of staying generic.

---

## 5. How a run works today

Everything in this section is running code.

1. **Publish.** A Revit model is published to Speckle; the webhook fires.
2. **Index.** A selective walk fetches parameters and never geometry into a
   per-version Durable Object holding SQLite. The index is disposable and
   rebuilt per version. Rows without a writable Revit parameter handle are
   dropped at index time: what cannot be fixed is never indexed, judged, or
   paid for.
3. **Select.** Candidate parameters are chosen by a deterministic SQL query
   over value-distribution shape (enough objects to establish a majority,
   few enough distinct values to be a vocabulary, no numerics). No model is
   involved in deciding what is worth looking at.
4. **Judge.** Each enabled scout judges one parameter histogram per request:
   "500 × '4 HR' next to 1 × '4 hours'" makes the outlier self-evident
   without loading a single object. Requests are small, stateless, parallel,
   and share a cached prefix. Moving selection out of the model and into SQL
   took a full run from ~$6 to cents (measured per run on the Analytics
   page), with a hard cost ceiling that stops a run rather than overspending.
5. **Deliver.** Novel findings (fingerprinted, deduped against open issues)
   are filed as one severity-ordered Speckle issue with proposed edits
   attached as objectDeltas. The reviewer sees current value, proposed value,
   and rationale, and applies accepted edits in place.

Found on the first real model, an 863 MB architectural project:
"Insultation" × 111, "Terrazo", a doubled inch mark, among seven findings.

---

## 6. Scouts

**The scout markdown is the unit of product.** A capability is a markdown
body a BIM manager can read and edit in the UI, saved to R2 and picked up on
the next publish with no redeploy. The body carries the judgment: what to
look for, what is explicitly *not* a finding, how to rate severity.

Everything that must hold every run lives in code, enforced rather than
requested: candidate selection is the SQL query, the CR format is the issue
renderer, hard limits are constants. That split is deliberate. A convention a
reviewer can argue with stays in prose; an invariant does not.

**Fix policy** spans three modes: *auto-propose* (deterministic fix, agent
adds rationale), *suggest-with-options* (judgment fix, stated preference,
max 2), *diagnose-only* (often a design condition in progress, not an error;
the diagnosis is the deliverable). The fleet is allowed to say it does not
know: where no dominant convention exists, the finding is "this project has
none; define one." **[auto-propose built; the other modes designed, specs in
`fleet/scouts/`]**

**Detection is warnings-first once warnings are reachable.** Where Revit
warns natively, the imported warning list should seed the work and the agent
should start where the warning stops: triage, keeper call, rationale.
Speckle's connectors do not expose Revit's warning dialogs today, so every
capability that depends on them sits at v1.5 on the ladder. What runs now is
the half that never had a warning to inherit: semantic consistency is fully
agent-detected.

---

## 7. Trust architecture

The binding constraint is not detection capability. It is whether a BIM
manager trusts a probabilistic machine near their model. Five invariants:

1. **Human approval is the only path to a model change.**
2. **No CR without a rationale evaluable in one read.** If it needs a second
   paragraph, the fix is not confident enough.
3. **Writes are parameter updates only, for now.** Exactly what a reviewer
   can fully evaluate from the CR text. Deletes and geometry wait for their
   rung on the ladder.
4. **A reported finding is never filed twice.** Findings carry a stable
   fingerprint and are deduped against the project's open issues, so
   republishing an unfixed model does not re-file the problem. Durable
   rejections come next: a dismissed finding enters the exceptions log and
   is never proposed again, and 3+ rejections sharing a pattern force a
   convention revision. **[dedupe built; exceptions log designed]**
5. **Volume cap as a design principle**: a short severity-ordered batch
(design center ~8 CRs, ~5-minute review), overflow held as a visible
deferred backlog. What would kill this product is a user trained to
bulk-approve.

---

## 8. Scope ladder

| Phase | Write scope | Capabilities |
|---|---|---|
| **v0** *(built)* | Parameter update CRs | parameter-value-consistency (misspellings, notation drift, unit coherence) |
| **v0.5** | same | compliance-triage · room-naming, via scoped scouts · severity cap + deferred backlog · exceptions log |
| **v1** | + element delete CRs | nomenclature · duplicate-room-numbers · duplicate-marks |
| **v1.5** | + geometry read, + warning list | identical-instances · overlap-locator · off-axis-lines · room-not-enclosed (as context & rec) |
| **v2** | + geometry write | off-axis snap · simple element creation (e.g. a wall closing a room boundary) |

Full detection-ownership map: `fleet/scope-map.md`. Task specs for the
parked rungs: `fleet/tasks/`.
