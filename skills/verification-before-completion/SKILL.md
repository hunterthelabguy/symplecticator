---
name: verification-before-completion
description: Use before claiming work is complete, fixed, or passing, and before committing, pushing, or opening a PR. Run the command that proves the claim and read its output first.
license: MIT (adapted 2026-10-04 from superpowers, (c) 2025 Jesse Vincent; see LICENSE). "Reading the run" adapted 2026-10-11 from github.com/truongfelix/workflow @6d2623c, PRINCIPLES.md, (c) 2026 truongfelix (MIT; see scripts/LICENSE-workflow in this config).
---

# Verification before completion

A claim about the state of the work is only as good as the run behind it, and
the run must be from this turn. This is the charter's "a repo must not lie
about its verification" applied to what Claude says, not only to what the
repo claims.

## The gate

Before any status claim:

1. **Identify** the command that proves it (the repo's CLAUDE.md names the
   verify command; if it names none, say "no verification exists" and claim
   nothing beyond what you read).
2. **Run** it in full, fresh.
3. **Read** the whole output: exit code, failure count, warnings.
4. **State** the result with its evidence (the command and the counts). If it
   failed, the state is the failure, with the output.

## Reading the run

Five ways a run misreports itself:

- **Never pipe a gate into `head` or `tail`.** In bash without pipefail the
  pipeline's status is the pager's, and `head` can kill the run early. Log
  it and read the status from the log:
  `cmd > log 2>&1; echo "EXIT=$?" >> log`.
- **Unreadable is UNKNOWN, never a pass.** A check that crashed prints
  nothing, which reads as "found nothing". Tell empty from broken, and
  cross-check against the tool's own exit code.
- **Key the verdict on the runner's own marker** (its summary line, its exit
  code), never on English words: passing output is full of "failed" and
  "error".
- **Wait on an artifact, never on a name.** `pgrep -f` matches the watcher's
  own command line, so a finished job looks alive forever. Key the end on a
  line the job writes or a PID captured at launch.
- **Stage the paths you touched.** `git add -A` sweeps in whatever else sits
  in the tree, and the clean status afterwards proves nothing: it is clean
  because everything was staged. Read `git diff --cached --name-only` before
  committing.

## What proves what

| Claim | Proof | Not proof |
|---|---|---|
| Tests pass | test run, 0 failures, this turn | an earlier run; "should pass" |
| Typecheck clean | typecheck run, exit 0 | tests passing |
| Build succeeds | build command, exit 0 | lint passing |
| Bug fixed | the original symptom's loop now green | code changed |
| Regression test works | pass, revert fix, fail, restore, pass | one green run |
| Subagent finished | the diff shows the change; checks re-run | its report says done |
| Requirements met | each spec or plan item checked off against the diff | tests passing |
| Deployed | the live URL serves the change | the deploy command exited 0 |

## Tells that a claim is ahead of its evidence

"Should", "probably", "looks right"; satisfaction before a run; a partial
check generalised; a subagent's report taken as fact. Each means: run the
command, or downgrade the claim to what was actually checked.

## Under `/build overnight`

No one is watching, so the morning report carries the evidence: each landed
task names its verify command and result, and anything unverified is listed as
unverified, never folded into "done".
