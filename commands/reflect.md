---
disable-model-invocation: true
description: Mid-session capture of re-derived knowledge into the repo's CLAUDE.md and living plan, routed by a fixed rule, then a prune of what CLAUDE.md no longer needs to load.
argument-hint: "[optional focus, e.g. 'gotchas' or 'just CLAUDE.md']"
---

You are running a reflection pass on this session so far. Goal: capture knowledge that
was re-derived so the next session does not pay for it again.

Optional focus: $ARGUMENTS

## 1. Find the friction

Scan the session for: facts about how this repo works learned by trial and error;
gotchas and environment quirks (shell differences, remotes, build order); explicit
corrections from the user; multi-step procedures repeated. If nothing is worth
capturing, say so plainly and stop. Do not invent findings or make cosmetic edits.

## 2. Route each finding

Read the repo's `CLAUDE.md` first: it names the living plan file and the archival spec
file, if any. If it does not, ask before routing state.

- Operational facts (verify recipe, landing ceremony, where things live, gotchas):
  the repo's `CLAUDE.md`. Tight and pointer-heavy; it loads every session.
- Operational facts needed only for one kind of task (previewing, measuring, deploy,
  one subsystem): the on-demand reference file `CLAUDE.md` names (for example
  `docs/agent-reference.md`), under that task's section, never `CLAUDE.md` itself.
- Project state and design changes: the repo's living plan, updated in place, with
  numbered amendments for changes. Decisions go to the ledger, dated and append-only;
  a wrong entry is corrected by a new one, never edited away. Each entry quotes
  the owner's ruling verbatim from the transcript, never paraphrased; Claude's context
  goes on a separate line labeled `Context (Claude):`. A ruling made by picking an
  option quotes the owner's words and the option text, marked as Claude-drafted.
- Never the archival spec. Amendments route to the living plan.
- Successor-facing runbook knowledge: `README.md`, if not already there.
- Facts about the user, not the repo: agent memory, never committed.
- A repeatable procedure: a proposed command; confirm with the user before creating it.
- Worked examples: a finding from a simplify, executing-critique or mutation
  pass that teaches something, correct or incorrect, goes to the curated examples
  file beside that skill (one entry per kind, about a dozen, with PR number and
  date), promoted from the PR retro lines; retire the entry it supersedes. More
  is not better: the file loads whenever its skill runs, so an entry that
  misleads or no longer fits is retired too.
- A defect found this session that an earlier step had passed (critique, simplify,
  clearing review): one line under Escapes in `~/.claude/COSTS.md`, if that file
  exists.

## 3. Prune

Adding is half the pass. For each `CLAUDE.md` section this session read, used, or
touched, ask two questions: is it still true, and does every session need it?

- No longer true: correct it, or delete it if what replaced it is already recorded.
- History (what was probed, learned, or tried, and when): delete it; git, the plans
  and the ledger keep it. Keep any live rule it holds, stated once.
- True but needed only for one kind of task: move it, verbatim, to the on-demand
  reference file, and leave `CLAUDE.md` one line naming when to read that section.
  If the repo has no such file, propose one instead of creating it.
- Said twice: keep the one in the right place.

Never prune the shipping contract, a convention that prevents harm, or anything
touching an owner ruling without asking. Report what moved, what was deleted, and the
line count before and after, measured, not estimated.

## 4. Propose, then apply

List findings and destinations as short bullets. Apply straightforward additions to
`CLAUDE.md` or the living plan directly. Confirm first for anything larger: a new
command, a structural doc change, anything touching an owner ruling.

## 5. Repo conventions

Never document a command, badge, or claim that is not real and
tested. Do not duplicate what the README, spec, or plan already record; link instead.
Preserve prior authors' prose; new material is additive. Keep edits minimal.
