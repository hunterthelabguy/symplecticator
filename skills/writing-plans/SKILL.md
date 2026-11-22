---
name: writing-plans
description: Use when an approved spec or set of requirements needs an implementation plan, before touching code. Usually follows spec-first; its output is what /build executes.
license: MIT (adapted 2026-10-04 from superpowers, (c) 2025 Jesse Vincent; see LICENSE)
---

# Writing plans

Write the plan so an implementer with zero context on this codebase, and no
access to this conversation, can build each task from the task alone. `/build`
runs every task in a fresh subagent that sees its own task and the plan's
header, nothing else. Everything a task needs goes in the plan.

**Where it goes:** the living plan the repo's CLAUDE.md names. If it names
none, ask. Never a tool-specific folder.

## Scope check

If the spec covers independent subsystems, say so and write one plan per
subsystem. Each plan produces working, tested software on its own.

## File structure first

Before tasks, map which files will be created or modified and what each is
responsible for. One clear responsibility per file; files that change
together live together; in existing code, follow its patterns.

## Task size

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. Fold setup and docs into the task whose deliverable
needs them; split only where a reviewer could reject one task and approve its
neighbour. Steps inside a task are single actions of a few minutes.

## Header

```markdown
# <Feature> implementation plan

**Goal:** <one sentence>
**Architecture:** <2 to 3 sentences>
**Spec:** <path; executors read both>
**Verify:** <the repo's full verify command>

## Global constraints
<the spec's project-wide requirements, one line each, values copied verbatim>
```

## Task structure

````markdown
### T<n>: <name>

**Depends on:** T<a>, T<b> (or "none")
**Files:** create `path`; modify `path:lines`; test `path`
**Seams:** <the public interfaces this task's tests target>
**Interfaces:** consumes <exact signatures from earlier tasks>; produces
<exact names and types later tasks rely on>
**Verify:** <the focused command that proves this task>

- [ ] Write the failing test at the named seam (code shown)
- [ ] Run it; expected failure: <message>
- [ ] Minimal implementation (code shown)
- [ ] Run it; expected: pass
- [ ] Commit (subject <=72 chars, body with the why: charter floor item 4)
````

A test that pins existing behaviour passes at the base, so its red step is a
**mutant run** instead: name the mutant (file, the exact edit) and the tests
expected to fail. Every mutant run, here and in the critique, is one mutant
at a time against the full suite, restored after each, under a timeout. A
file-scoped run, or several mutants at once, cannot show that a test is the
sole killer of anything, which is what floor item 9 asks; a plan step that
says "only X fails" means on the full suite.

A test asserts a site that carries a column, a dataset or a version at two
values, never one: with one value, a mutant that fixes that field to the
sample's value survives (in one project this single class produced the
Important findings of three tasks, and three survivors of the controller's
own prototype).

A stated failure message is copied from a run's output, never typed (one
plan typed three dots where the runner printed an ellipsis character, and
`[0, 0]` where it printed `[ +0, +0 ]`).

For a spec sentence stated as a rule with listed cases, one mutant is aimed
at the rule outside its listed cases (in one project every test checked the
five comma strings the spec names; a source that read `-1,5` as a number
passed three critique passes, three task reviews and the batch, and the
clearing review found it).

A task that changes a public signature lists every call site under
**Files**, found by a search of the whole repository, the ones outside
every typecheck among them (`scripts/*.mjs`, build and measurement
scripts): the compiler does not see those (in one project two measurement
scripts called the old signature and silently dropped their row limits; the
task review found them).

**Depends on** is what turns the plan into a task graph: `/build` runs every
task whose dependencies are done at the same time. Name real dependencies
only; a false edge serializes work for nothing, a missing one breaks a build.

## No placeholders

Every step carries the content it needs. Plan failures: "TBD", "add error
handling", "write tests for the above" without the tests, "similar to T3",
and any type or function no task defines.

## Self-review

Against the spec, fresh: (1) every requirement maps to a task; (2) no
placeholders; (3) names and signatures agree across tasks; (4) the dependency
edges are real and acyclic; (5) no part without a job: audit the plan with
the ponytail ladder and cut what does not need to exist. Fix inline. For a
large plan, dispatch the reviewer in
[plan-reviewer-prompt.md](plan-reviewer-prompt.md).

## Executing critique

Reading is not enough. After self-review (and the cost gate, if on),
dispatch the subagent in
[plan-executing-critique-prompt.md](plan-executing-critique-prompt.md): it
exports the base commit to a scratch tree, applies the plan's early tasks
exactly as written, runs build, typecheck, tests and servers, runs each named
mutant alone on the full suite, and compares the result with the spec's
intent, with
[executing-critique-examples.md](executing-critique-examples.md) loaded. It
returns the fixes it needed as a patch of `T<n> as written` and `F<k>:`
commits. Where a task changes detection or parsing, the pass also compares
the base's behaviour with the task's over generated inputs and names every
class that differs; running the task verbatim does not show a regression
against the base (in one project three passes ran such a task verbatim and
missed one). A plan's list of "the classes expected, and no other" is
checked against the base's own rule for each neighbouring decision, not only
the rule being removed (in one project the old header guess read commas
where the old inference did not, a class three passes and the plan missed).
Fold its findings into a revision, copying mechanical fixes from the patch,
one commit per fold with the patch folder; raise any finding that changes
behaviour or needs a decision to the owner directly. Each
fold runs in a fresh context that reads the plan file, the pass's report
and patch, and the decisions made since; never resume the drafter or an
earlier fold's agent, whose context grows with every round (four resumed
folds of one plan once ran 585k, 754k, 818k and 888k tokens, and the
plan's route came to more than three times the top of its estimate). Each
pass's `COSTS.md` line (if the cost gate is on) logs tasks executed out of
total and, from pass 2, the first task whose block changed since the last
pass: the data a prefix-reuse scheme would need. Fixed point: if the pass found anything, run it again on the revision
with a fresh context (different model or effort); stop at the first
clean pass; cap three. A plan is ready for `/build` only after a clean
pass, with every report attached. If the third pass still finds
something, stop: hand the plan and every report to the owner; it is not
ready for `/build overnight`.

## Overnight readiness

A plan can run under `/build overnight` only if every task names its seams and
its verify command and no open question remains for the owner. Say which tasks
fail that bar.

## Handoff

Land the plan in the repo by its landing rule, then tell the owner it is ready
for `/build` (attended) or `/build overnight`, with the readiness result. Do
not start building: `/build` is the owner's to invoke.
