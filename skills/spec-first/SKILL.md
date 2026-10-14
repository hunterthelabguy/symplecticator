---
name: spec-first
description: >
  Shape a coding task before building it: classify it (spike, bounded,
  architectural), critique the idea, ask batched questions, propose approaches,
  get approval, then spec and plan. Fire on your own before new features,
  components, subsystems, or behavior changes in code. For documents and
  non-code plans, use critique instead.
license: MIT (adapted 2026-10-03 from superpowers 6.3.0 brainstorming, (c) 2025 Jesse Vincent, merged with this config's /critique)
---

# Spec first

Turn an idea into an approved design before any code. The ceremony scales with
the task; the approval does not. Charter floor and the repo's CLAUDE.md win
where they differ from this.

## 1. Classify, out loud

Say the path so the owner can override it.

- **Spike:** a feasibility question whose output is an answer, not kept code.
  State the question and the probe in 2 to 3 sentences, get a nod, find out as
  cheaply as correctness allows, report a recommendation. Anything built is
  labeled throwaway.
- **Bounded:** a well-scoped change to a flow that already exists in this repo.
  If there is no existing flow to read, it is not bounded. A few questions, a
  short design in chat (approach, files touched, the check that proves it),
  then stop for a yes. No spec file, no plan document.
- **Architectural:** new projects, subsystems, or changes to interfaces others
  depend on. Full process below.

In doubt, take the heavier path. Complexity found mid-task upgrades the path;
nothing downgrades.

## 2. Read, then critique the idea

Read the code, docs, and recent commits the change touches. Then a hard
critique before any question: premises checked against the record (files, not
memory), requirements with no landing zone, untested claims, contradictions,
parts with no job (delete-first; the ponytail ladder applies). If the request
spans independent subsystems, say so and decompose before refining details.

## 3. Batched question rounds

Rounds of about four load-bearing questions, each with a recommendation, the
reason, and the cost of the alternative. Treat unselected multi-select options
as deliberate declines and say so. Where first-version simplicity trades
against capability, offer a lean version and name what was deferred. Continue until
understanding is total; do not design early. Load
[spec-first-examples.md](spec-first-examples.md) before drafting a round
(examples beat rules).

## 4. Approaches and design (architectural)

Propose 2 to 3 approaches, recommended one first, YAGNI applied to each. Then
present the design in sections scaled to their complexity (architecture, units
and their interfaces, data flow, error handling, the checks that pin it), with
approval after each. Prefer small units with one purpose that can be tested
alone. In existing code, follow its patterns; fix only what blocks the goal.

## 5. Land the spec

Write it where the repo's CLAUDE.md names its living plan or spec, with a
decision-ledger entry for each ruling (the owner's words quoted verbatim,
Claude's context on a separate labeled line) and a considered-and-declined list.
If the repo names no location, ask. Self-review before showing it: no
placeholders, no contradictions, no requirement readable two ways, scope fits
one plan. The owner reviews the file; changes loop back. Then write the
implementation plan into the living plan as small, verifiable tasks.
