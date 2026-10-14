# The Symplecticator

A Claude Code configuration for anyone who writes code with Claude: the
Symplecticator pipeline (below), plus the skills, commands and setup
interview around it, which writes your own charter. It was first built for
computational physics, and the primer keeps a physics version beside its
plain one.

## What the Symplecticator is

The Symplecticator is the pipeline this config runs an idea through before
it becomes merged code. It is named for symplectic integrators, which keep a
simulation's energy error bounded over long runs instead of letting it
drift. The pipeline does the same for intent: many rounds of critique and
rewriting, without losing what the idea was for.

1. **Spec.** spec-first shapes the task with you and writes down what done
   means: goals, non-goals, and every decision, recorded in a ledger in your
   own words. When a later step disagrees with the spec, the spec wins.
2. **Critique.** The spec, then the plan writing-plans makes from it, are
   critiqued hard, with rounds of questions, until no question is open.
3. **Executing critique.** A subagent with a fresh context carries out the
   plan in a scratch copy of the repository and runs everything, because
   building a plan finds problems that reading it does not. Any finding
   revises the plan and earns another fresh pass, at most three.
4. **Build.** `/build` runs the plan's tasks; each is implemented by one
   subagent and reviewed by another, and the tests and type checker must
   pass after every merge.
5. **Simplify.** Fresh contexts trim the code against the spec's non-goals,
   one pass at a time, until a pass finds nothing (at most three). A pass
   that breaks a test is reverted whole. This uses Claude Code's own
   `simplify` skill.
6. **Clearing review.** A subagent that wrote none of the code reviews the
   final commit, by name, and may use Claude Code's own `code-review` skill.
   Any later commit voids its clearance.
7. **Draft pull request.** You read the report, rule on anything it raised,
   and merge.

Two rules run through every step. *Independence:* each critic, simplifier
and reviewer starts from a fresh context, so it cannot inherit the blind
spots of the step before it. *Deterministic checks first:* the type checker,
the tests and other tools run before any agent is asked for its judgment,
because they are cheaper and more reliable. A small change skips most of
this: spec-first classifies each task and scales the ceremony to fit.

## The Symplecticator, as its marketing department describes it (parody)

> **Parody**, in the tradition of the turbo encabulator. The section above is
> the real description. Each phrase below maps to one of its steps, and none
> of it is meant literally.

Through a proprietary process of symplectication, the Symplecticator
advances an idea through critique space without the secular semantic drift
of conventional forward-Euler review, in which one reviewer takes one large
step and the idea spirals quietly out of its original orbit. The spec is
held fixed as the conserved Hamiltonian. Independently instantiated
sub-agents share no context, so their Poisson brackets vanish identically,
and each performs counter-rotating epistemic transforms on a sandboxed copy
of the plan, executing it in full before a single real trajectory is
committed. Deterministic terms (types, tests, tools) are evaluated exactly;
only the nonlinear remainder is referred to an agent. The build then passes
through at most three simplification maps, each followed by a Metropolis
acceptance step that rejects any pass that breaks a test and restores the
prior state, until spurious reasoning harmonics fall below the noise floor
of a fresh context. Finally, an orthogonal clearing reviewer who has never
seen the diff certifies the result at a single named commit; any further
evolution voids the certificate. The output occupies the same conceptual
phase-space volume as the input, with fewer mistakes and a considerably
larger number of diagrams.

## Required reading

[PRIMER.md](PRIMER.md): how Claude's context works, why answers must be
checked by running something, and how caching decides what a session costs.
Setup walks you through it, and you should read it yourself too.

## Install

1. Install Claude Code (the desktop app's Code tab, or the CLI).
2. Clone this repo anywhere except `~/.claude`.
3. Open the cloned folder in Claude Code and run `/setup-config`.

The scripts need bash (Git Bash on Windows, which Claude Code uses anyway),
git 2.38 or later, and ssh for SSH remotes; their pull-request checks also
need the GitHub CLI (`gh`), signed in. Setup checks git and `gh`, and runs
the scripts' tests on your machine.

Setup looks at your existing `~/.claude` first, goes through the primer,
asks four short rounds of questions (any of them can be skipped), shows you
every file before writing it, and backs up anything it replaces. Nothing
outside `~/.claude` changes without a separate yes. Open a new session
afterwards so the skills load.

To update: pull, open the folder, run `/setup-config update`. To undo:
restore from `~/.claude/setup-backups/`, using the list in
`~/.claude/setup-source.md`.

## Daily use

- **spec-first** fires on its own before new code; let it shape the task.
- **`/reflect`** mid-session captures what you learned into the repo's
  CLAUDE.md.
- **Before a long break, `/handoff`.** It lands the work and writes a short
  block; start the next session from that block. Coming back to a large
  session after its cache has gone cold re-reads the whole history at full
  price, and charter edits only take effect in a new session anyway.
- **The cost gate** (if you turned it on) asks before any step that spawns
  agents, because those cost far more than ordinary turns.

## What you get

| Piece | What it does |
|---|---|
| Charter (`~/.claude/CLAUDE.md`) | Your working agreement with Claude: who you are, the habits Claude holds you to, optional coaching and gates. Setup writes it from your answers. |
| Addendum (`~/.claude/PERSONAL-ADDENDUM.md`) | Facts that change: git identity, gates, focus threads, machine habits. |
| `spec-first` | Shapes a coding task before any code: classify it, critique it, ask questions, get a design approved. Fires on its own. |
| `critique` | Hard critique of a document or non-code plan, then rounds of questions. |
| `writing-plans` | Turns an approved spec into a task plan, then builds its first tasks in a scratch copy to find what reading misses (the executing critique). |
| `/build` | Executes a plan as a task graph ending in a draft pull request, with a resume block for the next session in its body; `/build overnight` runs it unattended once enabled. |
| Ground truth (`scripts/`) | `ground-truth.sh` prints what is true in your repos right now, read from git and GitHub: pushed or not, merged or not, open pull requests with their CI and clearing-review verdicts. `/handoff` writes its block from it, and the next session runs it first. `/build`'s Stop hook and the optional resume hook rely on the same facts. |
| `tdd` | Test-first reference: where tests go, anti-patterns, how thick tests should be. |
| `diagnosing-bugs` | A feedback-loop-first method for hard bugs. |
| `verification-before-completion` | No claim of "done" or "passing" without a fresh run. |
| `ponytail` | The simplest-solution ladder and the slop list. |
| `/reflect` | Captures what a session learned into the repo's CLAUDE.md. |
| `/handoff` | Closes a session: reflect, verify, land the work, write a handoff for the next session. |

## How `/build overnight` works

`/build` executes an approved plan as a task graph: parallel implementer
subagents, a reviewer for each task, an integration branch, and a draft pull
request opened after the first task merges. Attended, it asks you whenever
it is stuck. The `overnight` modifier runs it unattended: no one answers
questions until morning, so everything that would have been a question has
to be settled before it starts. That means the whole works, and it relies on
the SOP steps whether or not you adopted charter floor item 8:

- **A tight spec.** Goals, non-goals, and every decision ruled: spec-first,
  then critique rounds until no open question remains.
- **A tight plan.** writing-plans form, where each task names what it depends
  on, the seams its tests target, and the exact command that verifies it.
  `/build` refuses to start overnight if any task lacks its seams or verify
  command, or any question is still open.
- **No parts without a job.** writing-plans' self-review audits the plan
  with the ponytail ladder: anything that does not need to exist is cut
  before it is built.
- **An executing critique that came back clean.** writing-plans does not call
  a plan ready until a subagent has applied its first tasks in a scratch copy
  and run everything, because reading a plan does not find what building it
  finds. Any finding means a revised plan and another pass with a fresh
  context, until a pass is clean (at most three). `/build` trusts that this
  happened, so do not skip it.
- **Clear stop conditions.** Inside the spec, Claude decides and logs its
  ruling, labelled as Claude's. A change of scope or of a ruled decision
  parks that task and everything depending on it, while the rest keeps
  running. Irreversible or destructive actions, security-sensitive actions,
  merges to main and force-pushes always stop. Nothing merges to main; the
  pull request stays a draft.
- **The finish.** A simplify pass checks the code against the spec's
  non-goals and the slop list, to a fixed point (a fresh context each pass,
  at most three; a pass that breaks the tests is reverted whole). Then a
  final clearing review by a fresh context reads the last commit. The run
  ends with a resume block in the pull request's body and in its final
  message, cleared or not; once the review clears, a Stop hook will not let
  the session end without it.
- **How the start works.** Its first reply comes quickly: the number of
  tasks and agents, what that is likely to cost, and one question. Answer
  it, then wait for "Preflight green ... You can leave now." Do not walk away
  before that line: the slower checks (the base branch passes its tests,
  pushing works) run after your answer, and any of them can still need you.
- **Practicalities.** The computer must stay awake all night (the desktop app
  has a keep-awake setting). One night can spend a large share of your
  plan's usage; with the cost gate on, the budget is approved once, at the
  start. In the morning, start a fresh session from the resume block, read
  the report, and review the draft pull request.

To turn it on, change the addendum's "`/build overnight` enabled" line to
yes.

## Per-repo contract

`/handoff`, `/build`, `/reflect` and the planning skills read each project's
own `CLAUDE.md` for these, and ask when one is missing:

- **Verify:** the command that proves the repo is green, or the statement
  that none exists.
- **Landing:** how work reaches main (pull request and green CI, direct for
  ruled docs, or something else) and the merge method.
- **Living plan:** the file where the current plan and amendments live.
- **Archival spec:** the frozen spec, if any.
- **Ledger:** where the project's decisions are recorded.
- **Trailer:** only if the repo differs from your addendum.
- **Human handoff:** where `/handoff human` saves its note, if anywhere.

## Glossary

- **Charter:** `~/.claude/CLAUDE.md`, loaded every session; the habits and
  protocol you chose at setup.
- **Commit form:** charter floor item 4: a subject of at most 72
  characters, the reasoning in the body.
- **Living plan:** the project file that holds the current plan, updated in
  place, with numbered amendments.
- **Archival spec:** a spec frozen once approved; changes go to the living
  plan instead.
- **Ledger:** an append-only record of decisions, quoted in your own words.
- **Executing critique:** a subagent applies a plan's first tasks in a
  scratch copy and runs everything, to find what reading the plan misses.
- **Clearing review:** the final review before merge, by a fresh context that
  wrote none of the diff; it names the commit it read, and any later commit
  voids it.
- **Seam:** the public boundary a test targets.
- **Retro line:** one line in a pull request body recording what a review
  or simplify pass found; `/reflect` promotes the instructive ones into the
  worked-examples files.
- **Ground truth:** the output of `~/.claude/scripts/ground-truth.sh`, read
  from git and GitHub. A handoff block is a claim written from memory; the
  ground truth is what it is checked against.
- **Resume block:** the `/handoff` block, written from the ground truth,
  that the next session starts from. `/build` also leaves one in its pull
  request.
- **Escape:** a defect found after a step (a critique, a simplify pass, a
  clearing review) passed the work that held it; logged in `COSTS.md` so
  each term's review can weigh what each step costs against what it misses.

## Layout

`PRIMER.md` is the required reading. `skills/`, `commands/` and `scripts/`
are copied into `~/.claude` by setup; `templates/` holds the charter, addendum and
settings templates setup fills in; `.claude/skills/setup-config/` is the
setup skill itself, available only while Claude Code is open in this folder.

## License and credits

MIT for this repository's own work ([LICENSE](LICENSE)); where it started
from is in [ORIGIN.md](ORIGIN.md).

Several skills are adapted from MIT-licensed work: Matt Pocock's skills
(tdd, diagnosing-bugs, and parts of build and critique), Jesse Vincent's
superpowers (spec-first, writing-plans, verification-before-completion and
the task reviewer prompt), and DietrichGebert's ponytail. Each skill folder
carries its license. The ground-truth script, its test, and the "Reading the
run" lines in verification-before-completion are adapted from truongfelix's
workflow (MIT; `scripts/LICENSE-workflow`).
