---
name: critique
description: >
  Hard critique of a document or non-code plan, then batched question rounds,
  then a synthesis with a declined list. Fire on your own when the owner brings
  a draft, vision statement, proposal, policy, or non-code plan for review or
  before acting on one. For coding tasks, use spec-first instead.
argument-hint: "[path or description of the document or plan]"
credits: frontier and facts-versus-decisions rules adapted 2026-10-04 from mattpocock/skills @24fe0ef, grilling (MIT; see LICENSE)
---

Target: $ARGUMENTS (if empty, ask what to critique). Read it in full before anything else.

## 1. Hard critique first, before any question

Worked examples: [critique-examples.md](critique-examples.md) loaded
(`/reflect` curates it). Widen the option space before judging a
recommendation: at least three materially different designs per question,
including do-nothing and do-less, each with cost and failure modes, then
the verdict (C1). For a requirements table, ask of every row what forces
it and whether a design rule meets it with no test (C2).

**Revision first.** When the target revises something already critiqued, read
`git diff <last critiqued commit>..HEAD` and the rulings folded since. Report
what the revision broke (a ruling contradicted, an unchanged passage now false,
a requirement dropped without a ruling) before any new finding.

Substantive, not polite. Cover: claims untested against real operations; requirements
with no named landing zone; premises not checked against the record (check them now,
against files, not memory); internal contradictions; where a first read would miss a
flaw; parts with no job (delete is an option). Nothing invented: every number, name,
date, and citation has a source or is marked as a placeholder. For co-owned documents,
critique is not rewriting: proposed changes are additive and keep prior authors.

## 2. Batched question rounds

Ask only the frontier: questions whose prerequisites are already settled. A
question whose answer depends on another still open this round waits for a
later round. Facts are Claude's job, decisions are the owner's: anything
answerable from files, tools or the web gets looked up (a subagent if it is
slow), never asked. Prioritized rounds of about four questions, each one load-bearing. Give a recommendation
with reasons and the cost of the alternative on each. Treat unselected multi-select
options as deliberate declines and say so for confirmation. Where a choice trades
first-version simplicity for richer capability, offer a lean version and name what was
deferred.
Continue rounds until understanding is total. Do not synthesize early.

## 3. Synthesis

Decisions as canon; a considered-and-declined list so nothing gets re-litigated; open
items marked open. Land it in a real saved file, and record the round as a dated ruling
in the repo's living record or ledger, quoting the owner's rulings verbatim with Claude's
context on a separate labeled line. Commit each fold on its own, so the next
critique's revision check diffs exactly this round. Chat alone is not done.
