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
   simplify passes (up to three), and the final clearing review. Give what
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
its commit, its verify result, and the rulings made. Nothing commits it after
the clearing review that clears: that would void the review. If the file
already exists, this is a resume: trust it, reconcile with git, and continue. If
the cost gate is on, append each finished agent's token count to
`~/.claude/COSTS.md`.

## 2. Run the frontier

For each frontier task, up to 4 at once (a default, not a law):

1. **Implementer subagent** in its own worktree (`isolation: "worktree"`),
   branched from the integration branch tip. Its prompt: the plan header,
   Global constraints, and the task block, verbatim; the instruction to use
   the tdd skill at the task's named seams and verification-before-completion
   before reporting; commit in the charter's commit form (floor item 4),
   trailer per the addendum unless the repo's CLAUDE.md says otherwise;
   report what was built, the Verify command's output, and any concern.
2. **Task reviewer subagent** with [task-reviewer-prompt.md](task-reviewer-prompt.md).
   Needs fixes: the implementer fixes, the reviewer re-checks, at most two
   rounds. Still failing: attended, ask the owner; **[overnight]** park it.
3. **Merge** the task branch into the integration branch. Conflicts that are
   mechanical get resolved; anything else parks the task.
4. **Verify** the full suite on the integration branch. Red: revert that
   merge and park the task with the output.
5. Update the progress file, push the integration branch, and open the draft
   PR after the first merge (it needs a commit ahead of base).
6. Recompute the frontier; start what is newly unblocked.

**Parking** marks the task and every task depending on it as parked, with a
ledger entry naming the blocking question or failure, and leaves the rest of
the graph running.

## 3. Decisions during the run

- Inside the approved spec: decide, and log in the ledger as
  `Ruling (Claude): <what>; why: <reason>; cost if wrong: <cost>`. These are
  Claude's rulings and are labeled as such, never quoted as the owner's.
- A change to scope, an interface others depend on, or a ruled decision:
  attended, stop and ask; **[overnight]** park the task.
- Always stop, in both modes: irreversible or destructive actions,
  security-sensitive actions, any merge to the base branch, force-pushes.
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
   enforces. Clean is the expected default and carries its evidence line
   ("clean against non-goals N1-N4, slop S1-S6"). Then full verify and
   typecheck green again; a pass that breaks green is reverted whole, never
   patched, and ends the loop (breakage is information about the tests).
   Otherwise repeat with a fresh context (different model or effort) until a
   pass returns clean; cap three.
3. Write the report beside the plan, `BUILD-REPORT-<date>.md`: tasks landed
   (with commits and verify results), tasks parked and why, rulings made,
   final verify output, anything unverified listed as unverified, and the
   retro line for the PR body: simplify findings proposed / accepted /
   rejected (`/reflect` promotes from these lines). Add what the run taught
   as proposed edits to the repo's CLAUDE.md or plan, applied after the owner
   merges: an edit on this branch after the clearing review voids it. Update
   the progress file. Commit both and push.
4. **Final clearing review**, by a fresh subagent that wrote none of the
   diff (it may run Claude Code's bundled code-review skill), on the branch
   against base at the head commit. Findings: one implementer pass reviewed
   like a task, full verify green, then a new clearing review on the new head;
   at most three rounds, then stop, report, and still do steps 5 to 7 with
   the PR marked uncleared. When it clears, put
   `Review: <reviewer> at <sha>` in the PR body (editing the PR body is not a
   commit), plus what it caught that the simplify pass missed, for the retro
   line.
5. Link the report in the draft PR, and put the resume block in its body:
   `/handoff` step 4 form, written from the ground-truth script's output at
   the head. Its task is for the next agent: run the ground truth, confirm
   the PR reads cleared at head, walk the owner through the report, and apply
   its proposed edits once the owner has merged; the merge goes under Awaiting
   owner word. On an uncleared run the State says why it stopped, and the
   task is the next piece of work: fix the findings or the red verify and
   get a fresh clearing review, unless the owner's merge-anyway call is quoted
   in the PR. The PR stays a draft until the owner marks it ready
   and merges it on a cleared head (the block's Ground truth line shows it;
   `/handoff` checks the same Review line when it does the landing).
6. Remove the task worktrees.
7. End with the block as the final message, cleared or not. The Stop hook
   in this skill's frontmatter (`~/.claude/scripts/build-stop-gate.sh`)
   refuses the stop only on the cleared path, while the PR body has step
   4's Review line and no block; a broken check (no `gh`, no network) lets
   the stop through with a warning.
