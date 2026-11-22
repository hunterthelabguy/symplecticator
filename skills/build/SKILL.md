---
name: build
description: Execute an approved implementation plan as a task graph with parallel implementer subagents, per-task review, and an integration branch ending in a draft PR. "/build overnight" runs it unattended.
disable-model-invocation: true
argument-hint: "[overnight] [path to the plan, if the repo's CLAUDE.md does not name it]"
license: MIT. Task-graph execution adapted 2026-10-04 from github.com/mattpocock/skills @24fe0ef, implement-spec, (c) 2026 Matt Pocock (LICENSE-mattpocock); task-reviewer-prompt.md adapted from superpowers, (c) 2025 Jesse Vincent (LICENSE-superpowers).
hooks:
  Stop:
    - hooks:
        - type: command
          shell: bash
          command: "bash ~/.claude/scripts/build-stop-gate.sh"
          timeout: 30
---

# /build

Arguments: $ARGUMENTS

Build the plan the repo's CLAUDE.md names (or the path given), written in
writing-plans form: tasks with **Depends on**, **Seams**, **Verify**. The
plan's dependency edges make it a **task graph**: the **frontier** is every
task whose dependencies are done, and the whole frontier runs at once.

**Modes.** Without `overnight`: attended. With it: unattended, which means
no one answers questions until morning, whatever the hour. Differences are
marked **[overnight]**.

## 0. Preflight (while the owner is still here)

Everything that could fail for lack of a human fails now, not at 1 a.m.

1. **[overnight]** Enabled: the addendum (already loaded) has its
   "`/build overnight` enabled" line set to yes. If not, say so in the first
   reply and do not start overnight: say what an unattended run needs (a
   plan that passed writing-plans' overnight readiness and a clean executing
   critique), offer attended mode, and note that changing that addendum line
   to yes enables it.
2. **First reply, fast.** Read only the plan's task list, then answer within
   this one short turn, before any other reading. State the number of tasks
   and the agent count: one implementer and one reviewer per task, the
   floor-9 batch if it is taken (one of each), the simplify passes (up to
   three), and the final clearing review. Give what
   similar steps cost before, from `~/.claude/COSTS.md`, or "not yet
   measured". Then ask the one question: **[overnight]** "Start overnight?
   Stay until you see 'You can leave now'." (this approves the night's
   budget); attended, the cost gate's run, lighter or skip, if the gate is
   on.
3. Read the repo's CLAUDE.md (verify command, landing rule), the plan, its
   spec, and the decision ledger. Missing any: ask.
4. **[overnight]** Readiness: every task names Seams and Verify, and no open
   question remains. If any task fails that bar, list them and do not start
   overnight; offer attended mode or a plan fix.
5. Working tree clean; the full verify command is green on the base branch.
   Red base: stop, report.
6. Create the integration branch `build/<plan-name>` from the base, check it
   out in this session's tree (the Stop hook keys on it), and push it, which
   proves the push works under the current permissions. With more than one
   remote, `gh repo set-default` the push remote's repository first, or gh
   (and the Stop hook) may ask another repository about the PR.
7. **[overnight]** Ask the owner to switch on the desktop app's keep-awake, then
   end preflight with: "Preflight green. Starting overnight build of N
   tasks; report lands at <path>. You can leave now."

## 1. Progress file

Keep `BUILD-PROGRESS.md` beside the plan, committed on the integration branch
after every state change: each task's state (todo, running, done, parked),
its commit, its verify result, the rulings made, and the running count of
agents spawned and resumed: the controller keeps that count here and reads
it from here, not from its head (in-session counts have run high). Its own
edits to a commit body are read back before the landing script runs, not
after. Its edits to the progress file go by a script file, never a one-line
`node -e` or `sed` (one has mangled an escape). Nothing commits it after
the clearing review that clears: that would void the review. If the file
already exists, this is a resume: trust it, reconcile with git, and
continue. If the cost gate is on, append each finished agent's token count
to `~/.claude/COSTS.md` by a write that cannot truncate: an append, or a
temp file renamed over it (a full disk has truncated that file to 0 bytes
mid-run; restore it from git).

## 2. Run the frontier

For each frontier task, up to 4 at once (a default, not a law):

1. **Implementer subagent** in its own worktree (`isolation: "worktree"`),
   branched from the integration branch tip. Its brief: the plan header,
   Global constraints, and the task block, verbatim, cut by the controller
   into a file per task in its scratch folder (not committed) that the agent
   reads; the prompt names the file's path and does not paste the block
   (blocks have run 200 to 1,300 lines). The brief also carries the
   instruction to use the tdd skill at the task's named seams and
   verification-before-completion before reporting; never make a red test
   pass by weakening, skipping or deleting it (tdd, "Never buy green by
   weakening a test") unless the task block asks for that exact change,
   reporting a test it believes wrong as a concern instead; commit in the
   charter's commit form (floor item 4), trailer per the addendum unless the
   repo's CLAUDE.md says otherwise, with a commit subject used only after the
   controller has checked it against the repo's barred words (plan labels,
   ledger IDs, process names, product names) before the brief goes out; read
   the commit body sentence by sentence against the code and the spec before
   committing (every review after the first few has found one or two false
   sentences, and none after this instruction was a false claim that
   landed); report what was built, the Verify command's output, and any
   concern.
   The controller also reads the plan's commit body for the task sentence by
   sentence against the task's own code steps and the spec before the brief
   goes out, corrects a false or wide sentence in the brief file, and logs
   each as a `Ruling (Claude)`; the implementer's and reviewer's reads
   against the built code still run (most plan bodies have needed at least
   one sentence corrected at review). A sentence on what the code did before
   the change ("where it threw X") goes in a body only from a probe of the
   parent tree, case by case: sentences written from the plan's words have
   been false in several places.
   The harness cuts an isolation worktree from the default branch, not from
   the integration tip, so the prompt names the tip's sha and has the agent
   `git reset --hard` its own fresh branch to it and confirm before work
   (every implementer after the first frontier has otherwise started at the
   default branch). When the session's own tree is not the code repo (a plan
   in a notes repo, a session in another repo's worktree), an isolation
   worktree is of the wrong repository: the controller cuts each task's
   worktree by hand in the code repo (`git worktree add` on a new branch at
   the integration tip), names its path in the prompt, and removes it and
   its branch at Finish. No agent ever junctions or symlinks `node_modules`
   into a scratch export (a recursive delete can follow the link into the
   worktree): a scratch export installs from the lockfile, and on Windows is
   made with `git -c core.autocrlf=false archive` so exact-match edits
   apply. An agent runs its shell commands from its scratch folder, with
   paths given in full, never with a repo worktree as the working directory,
   and a landing script checks the tree is clean before it merges (a stray
   `awk '... > 0'` run in the integration worktree once wrote a file named
   `0` there; the clean-tree check caught it). An agent's scripts, outputs
   and patches go in its scratch folder and are copied beside the plan; its
   report comes back as its final message and the controller saves it by
   hand (the harness refuses a report file from a subagent). Save it at
   once, from the hand-back: the transcript file of an agent that was never
   resumed can be empty.
2. **Task reviewer subagent** with [task-reviewer-prompt.md](task-reviewer-prompt.md).
   Its standard check is floor 9's measurement: each mutant the task names,
   alone, on the full suite, in a scratch export. It also reads the commit
   body sentence by sentence and returns each false or wider-than-the-code
   sentence as a corrected line ready to paste. Needs fixes: the implementer
   fixes, the reviewer re-checks, at most two rounds, and the same two agents
   are resumed for the fix and the re-check, not a fresh pair (resuming has
   cost a fraction of a fresh pair's tokens). Still failing: attended, ask
   the owner; **[overnight]** park it.
3. **Merge** the task branch into the integration branch. Conflicts that are
   mechanical get resolved; anything else parks the task. A merge commit's
   subject reads `Merge: <what the task does>`, with no task number: plan
   labels stay out of the code repo's history (rewording merge subjects
   later costs a rebuilt branch and a force-push). Tasks that run at the
   same time and change one function have their merge rehearsed in a
   throwaway worktree before either lands: the resolution written as a
   script, the rehearsed tree verified green.
4. **Verify** the full suite on the integration branch. Red: revert that
   merge and park the task with the output. A red whose only failure is a
   flake the plan or the progress file names is rerun once before the merge
   is reverted (a landing script that reverted a good merge on a known flake
   then left the next task's script refusing to land on a tip without it).
5. Update the progress file, push the integration branch, and open the draft
   PR after the first merge (it needs a commit ahead of base).
6. Recompute the frontier; start what is newly unblocked.

**Quiet phase.** A timed or load-sensitive step (a timed probe, a
measurement whose result is committed) runs on a quiet machine: the brief
has the implementer stop before it and report, and the controller resumes
that agent only when no other agent or Node process runs (one limits
measurement proposed half the cells on a loaded machine that it did on a
quiet one).

**Pipelining a chain** (an option, named at preflight). Where the graph is
a chain, the frontier is one task and reviews set the clock (implementers
have taken 1 to 8 minutes, reviews 8 to 50). Pipelined, each next
implementer starts on the previous task's commit while that task is in
review. Each reviewed commit lands by replay onto the integration tip:
`git commit-tree` with its own tree (which already holds the tasks before
it), its author and date, and the reviewer's corrected body, so a reworded
body never forces a rebuild of the tasks built on it. A review finding
whose fix would change a later task's tree goes to the floor-9 batch if
one is taken, else attended to the owner and **[overnight]** parks the
chain from that task (reviews have trailed by up to five tasks, with five
agents running at the peak).

**Parking** marks the task and every task depending on it as parked, with a
ledger entry naming the blocking question or failure, and leaves the rest of
the graph running.

**Floor-9 batch** (an option, named at preflight). A floor-9 finding a
reviewer marks Important gets its task's fix round. Minor survivors and
tests that kill no mutant of their own may instead wait for one batch after
the last task: one implementer pins or deletes them all, test-first, and
one reviewer reviews it like a task, each mutant alone on the full suite.
One review instead of a round per task. The batch counts as a task in the
agent count and the progress file, and runs before Finish.
The controller's prototype of a tests-only batch measures both directions:
each mutant the batch is to kill, and every mutant the changed lines killed
before (a green prototype once traded away four base kills that the batch
review found).

An Important floor-9 finding that is a gap in the plan's own tests may also
wait for the batch when the plan prints test counts in its later task
blocks (a fix then shifts those counts). This is a second option, named at
preflight so that it is the owner's choice and never the controller's.

## 3. Decisions during the run

- Inside the approved spec: decide, and log in the ledger as
  `Ruling (Claude): <what>; why: <reason>; cost if wrong: <cost>`. These are
  Claude's rulings and are labeled as such, never quoted as the owner's.
- A change to scope, an interface others depend on, or a ruled decision:
  attended, stop and ask; **[overnight]** park the task.
- A task added in the build (a ruled-in fix, a clearing fix round) has had
  no executing critique. The controller prototypes its design in a scratch
  export, full suite green, before briefing it, and writes the brief from
  the prototype (the first brief of an added fix once failed both
  round-trip properties at the implementer's gate; the next added task was
  prototyped first and landed as briefed). The prototype of a clearing fix
  also probes the finding's neighbours, the same fault reached by another
  input, before the brief goes out; where it finds one, the controller
  takes the measurements back to the owner rather than land the narrower
  fix (prototyping the ruled fix for a replay that counted another document
  once found the same replay counting two other things, and the ruled fix
  gave way to one at the root). Where a fix adds a mode flag to shared
  code, its brief names a mutant of each operand inside the new branch
  (clearing-review example C5).
- A change to detection or parsing is compared with the base over
  generated inputs before it is briefed or cleared: old against new,
  every differing class named with an example, from two generators and
  classifiers written apart (the implementer's and the reviewer's), each
  covering every line end the parser accepts. A comparison is only as
  wide as its generator (each of four single-generator comparisons missed
  a class the next one found). A sentence in the PR body that describes a
  class of inputs is drafted from the classifier's rule, not from the
  plan's prose, and the class list is checked against each class's
  wording, not only against the sorting rule: every short string over
  small alphabets is a cheap second generator (in one build the plan's
  wording of two classes was narrower than the rule the comparisons sorted
  by; three seeded generators passed it, and the clearing review's
  exhaustive run found the false sentence, twice). A change to a generator
  is measured for what it stops drawing as well as for what it starts
  drawing.
- A question to the owner that offers "list it" for an error that escapes
  states the smallest input measured to trigger it, not the input the
  asker has in mind (one such question was asked with 2**32 in mind, and
  150,000 already triggered it).
- A step's output that differs from the plan's stated text only in how
  the runner renders it (an ellipsis character, `+0` for 0, a count the
  plan labels as an earlier revision's) does not stop a task, in either
  mode, when the same tests fail with the same values: log it as a
  `Ruling (Claude)` and list it in the report. A different test, value or
  count stops it.
- Always stop, in both modes: irreversible or destructive actions,
  security-sensitive actions, any merge to the base branch (a yes is not
  leave to merge: step 5 says who merges, and this run never does),
  force-pushes.
  Stopping means not taking that action: attended, ask; **[overnight]**,
  park the task. The run still ends with its report and block.
- **[overnight]** No gates and no coaching notes (the charter's
  unattended-runs rule): the budget was approved at preflight, and the
  report replaces the rest.

## 4. Finish

The order matters: the clearing review comes last, because any commit after
it voids it.

1. Full verify on the integration branch. Red: stop, write the report (step
   3, with the failing output), then do steps 5 to 7 with the PR marked
   uncleared.
2. Simplify pass. With the full verify green, run Claude Code's bundled
   simplify skill on the branch against base with the spec as its reference
   (goals, non-goals, anything the spec or plan says to delete, the slop list
   in the ponytail skill) and [simplify-examples.md](simplify-examples.md)
   loaded. Deterministic tools, where available, run first and feed the
   agent: jscpd for duplication, the compiler's or linter's unused checks
   (for Python, ruff or vulture) and an import count for dead knobs and
   one-consumer seams. Every finding cites the non-goal or slop item it
   enforces, in the pass's report; a commit body gives the reason in plain
   words and cites spec sections, never a slop item's label or number, and
   the brief says so rather than inviting the citation (a brief that said
   "cites ... the slop item" once put a slop label in a body, reworded at
   landing). Clean is the expected default and carries its evidence line
   ("clean against non-goals N1-N4, slop S1-S6"). Then full verify and
   typecheck green again; a pass that breaks green is reverted whole, never
   patched, and ends the loop (breakage is information about the tests).
   Otherwise repeat with a fresh context (different model or effort) until a
   pass returns clean; cap three. A pass whose only change is one line that
   an earlier pass weighed and rejected does not reopen the loop: list the
   line for the owner instead (such a pass once bought a third pass of
   about 218,000 tokens that changed nothing).
   Before each pass lands, a grep over every commit body it made enforces
   what the repo's CLAUDE.md bars from a body (ledger IDs, plan labels,
   product names) and requires a spec section cited; the controller reads
   only what the grep flags, and the pass's agent is told the same rules (a
   body that named a private checklist item and cited no section once cost
   a ruling and the build's one force-push).
3. Write the report beside the plan, `BUILD-REPORT-<date>.md`: tasks landed
   (with commits and verify results), tasks parked and why, rulings made,
   final verify output, anything unverified listed as unverified, and the
   retro line for the PR body: simplify findings proposed / accepted /
   rejected (`/reflect` promotes from these lines). Add what the run taught
   as proposed edits to the repo's CLAUDE.md or plan, applied after the owner
   merges: an edit on this branch after the clearing review voids it. Update
   the progress file. Commit both and push.

   **The PR body.** Before writing it, read the plan's "Known and not
   changed" section (or its like) and carry every item into the body (a
   false sentence in one review round, that a module's source held no
   library call left to throw, came from not reading it). A sentence on
   what a fix changed is written from a run at every place the fix touches,
   or from the report's stated rule, never from a report's summary line (one
   major copied "5 or 7" from a summary where the rule and a run gave 4, 5,
   6 or 7).
4. **Final clearing review**, by a fresh subagent that wrote none of the
   diff (it may run Claude Code's bundled code-review skill), on the branch
   against base at the head commit, with
   [clearing-review-examples.md](clearing-review-examples.md) loaded. It
   grades every finding blocker, major, minor or nit, and it clears when
   there is no blocker and no major. These are major at least: a spec line
   the code does not meet, a spec number no test pins, a false claim in the
   PR body.
   - **Not cleared:** one implementer pass on the blockers and majors only,
     reviewed like a task, full verify green, then a new clearing review on
     the new head. When a finding is one instance of a fault with a
     syntactic shape (a list spread into a call's arguments), the fix brief
     asks first for a parser scan of the whole source for that shape, and
     the fix is sized from the scan (found one place at a time, one such
     fault took three rounds and three commits). At most three rounds, then
     stop, report, and still do
     steps 5 to 7 with the PR marked uncleared. That round's minor findings
     and nits are listed for the owner too (next bullet); the fix pass
     takes one only when the owner rules it in.
   - **Cleared with minor findings or nits:** no fix round. List them in
     the PR body under "Left for the owner", each with its file and line;
     the owner rules on them at merge. Fixing one is a new commit, which
     voids the review and buys another, and a review at this depth rarely
     comes back empty. A wrong claim in the PR body is corrected by editing
     the body, which is not a commit.
   - **A defect that a fix round made** is a major, whatever its size.
   - **Delta review:** once one clearing review has read the whole diff, a
     later round may read only the diff from the last reviewed head to the
     new head, and every caller and callee of what it changed. It is handed
     the earlier round's blockers and majors, and any lesser finding the
     owner ruled into the fix, and confirms each one closed; one still open
     keeps its grade. Only the owner picks a delta review:
     attended, at the cost gate as "lighter" or by asking for one;
     **[overnight]** every round reads the whole diff. The PR body then
     says, on a line of its own, that no single review read the whole head.
   - **Record:** each clearing round's COSTS.md entry gives its round
     number, the counts per grade and the leftovers listed; a defect later
     traced to a finding left unfixed, or to code a delta review did not
     read, is recorded there as an escape.

   When it clears, put `Review: <reviewer> at <sha>` in the PR body
   (editing the PR body is not a commit), plus what it caught that the
   simplify pass missed, for the retro line. The ground-truth script and
   the Stop hook read only a line that starts with `Review: ` and ends with
   `at <sha>`, and the script takes the last such line in the body. So the
   newest review's line goes last; a delta review names its scope before
   "at", as in `Review: delta review at <sha>`; and no words follow the
   commit id. A line that does not fit is not read at all, as if it were
   absent.
5. Link the report in the draft PR, and put the resume block in its body:
   `/handoff` step 4 form, written from the ground-truth script's output at
   the head. Its task is for the next agent: run the ground truth, confirm
   the PR reads cleared at head, walk the owner through the report and the
   findings left for the owner, and once the owner has merged, apply its
   proposed edits and route any of those findings the owner has not ruled
   on as `/handoff` step 3 does after a merge (into the living plan, or
   Awaiting owner word where there is none); the merge goes under Awaiting
   owner word. On an uncleared run the State says why it stopped, and the
   task is the next piece of work: fix the findings or the red verify and
   get a fresh clearing review, unless the owner's merge-anyway call is quoted
   in the PR. The PR stays a draft until the owner marks it ready. It is
   merged on a cleared head with green CI (the block's Ground truth line
   shows it; `/handoff` checks the same Review line when it does the
   landing), by the owner, or by Claude on the owner's word for that PR,
   quoted in the PR.
   This run never merges it.
6. Remove the task worktrees.
7. End with the block as the final message, cleared or not. The Stop hook
   in this skill's frontmatter (`~/.claude/scripts/build-stop-gate.sh`)
   refuses the stop only on the cleared path, while the PR body has step
   4's Review line and no block; a broken check (no `gh`, no network) lets
   the stop through with a warning.
