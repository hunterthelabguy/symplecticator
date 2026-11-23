# Build report: perturb-plan (overnight, 2026-11-22 to 2026-11-23)

Plan: `docs/perturb-plan.md`. Spec: the owner's perturb spec, cited here by
section. Base: ce5cbbb. Integration branch: `build/perturb-plan`, draft
PR #13. Progress and every ruling, in full: `docs/BUILD-PROGRESS.md`.

## Landed

Every plan task landed; none was parked.

| Task | Merge | Task commit | Verify at landing |
|---|---|---|---|
| T4 frames skill | 2ad404b | aaa2522 (replayed, body corrected) | grep check 10, no em dash; suites green |
| T5 showcase flag, ruling count | 26c15f2 | a42af3d | 12 of 12 mutants killed; suites green |
| T1 commit-scan.sh | 2c873fc | 445f9df (replayed, body corrected) | 22 of 22 mutants killed; suites green |
| T2 perturb-guard.mjs | 97d0941 | d664ead | 106 of 106 named mutants plus 10 added killed; full verify green on rerun (see Flake) |
| T3 /perturb skill and hook | 47a8c88 | 831f43b | 13 of 13 mutants killed; full verify green |
| T6 setup, template, docs, CI | e012012 | f4e913a | full verify green; both greps empty |
| Floor-9 batch | a2965f5 | 49655f7 (replayed, body corrected) | three survivors killed, no earlier kill lost; full verify green |
| Added: the guard compares real paths | aef35e1 | e7a77bd (replay of 3726301, body corrected) | 15 of 15 mutants killed; full verify green |
| Simplify pass 1 | 50c8088 | 9d21343 | every check identical before and after; full verify green |
| Clearing fix 1: the guard reads cd's options | 7656713 | replay of 2ad91b6 (body corrected) | every named mutant killed; full verify green |

Fix rounds: the commit scan (three plan-test gaps), the showcase flag (an
edge the plan's fixtures left open, and a branch named exactly `showcase`),
the guard (a `cd` inside a substitution or parentheses moved the guard's
folder though bash discards it: a probe pushed the default branch; spec
section 4), the skill (the user-only check read the whole file), docs and
CI (the README badge caption named two suites), and the real-path fix (its
first form lost a refusal the parent made). Each was reviewed again and
approved before landing.

### Added task

The PR's first Windows CI run failed one guard test. The cause was a real
gap, not only a test artifact: the guard compared an 8.3 short spelling
(`SYMPLE~1`) against git's long path, so a Write to a protected repo
settings file in the short spelling got through (probed: exit 0, long
spelling exit 2). The fix compares every path in both its written and its
real spelling (8.3 names, junctions and symlinks resolved). Windows CI is
green at aef35e1 and after.

### Flake

The guard's first landing verify went red on four ground-truth checks of
its deleted-object fixture, a script the merge does not touch. The same
tree then passed the full verify once and that suite four times running.
That area failed once before with no script change. Named in the progress
file as a known flake; it did not recur in the five later landing
verifies. Cause
unknown: the landing script cut the failed checks' detail lines.

## Parked

Nothing parked. One finding was held back from the batch for the owner
(below): a cd the guard cannot place.

## Final verify (at 7656713; later commits touch only docs)

```
ground-truth.test.sh: all checks passed, 0 skipped
build-stop-gate.test.sh: all checks passed, 0 skipped
commit-scan.test.sh: commit-scan.test.sh: all passed
perturb-hook.test.sh: perturb-hook.test.sh: all passed, 0 skipped
perturb-guard.test.mjs: tests 23, pass 23, fail 0, skipped 0
```

CI at aef35e1 and every head after it through 1abb851: suites on
ubuntu-latest and macos-latest, and guard-windows, all success.

## Unverified

- The live check (the plan's After merge step 7): `/perturb` in a real
  session, one call per tool class. Not run: it is the owner's step.
- That a user-invoked skill's frontmatter hook with matcher `.*` reaches
  every tool, MCP tools included, and what Claude Code does when the 30 s
  hook timeout fires. Not tried live in this run.
- The guard's handling of `..` after a link off Windows (the kernel walks
  it through the link; the guard resolves it by name): stated in a commit
  body from the code, not run (no Linux or macOS machine here).
- The cause of the ground-truth flake (above).

## For the owner

- **A cd the guard cannot place.** A `cd` after a pipe, or after a
  conditional (`false && cd /`, `true || cd /`), is followed by the guard
  though bash discards or skips it. From the home config folder,
  `true | cd /; rm CLAUDE.md`, `false && cd /; rm CLAUDE.md` and
  `true || cd /; rm CLAUDE.md` all exit 0 while bash removes the protected
  file. A pipe-only fix was prototyped (suite green) and held back: the
  conditional forms need a decision at the root.
- **Spec section 4's settings line** says `.claude/settings*.json`; the
  guard protects exactly `settings.json` and `settings.local.json`, as the
  plan lists them. Confirm.
- **The hook timeout**, `timeout: 30`, is the plan's Choice for your
  review; spec section 4's block has no timeout line.
  `PERTURB_SCAN_TIMEOUT_MS` in the environment can raise the guard's scan
  timeout past it, and the hook suite reads only the literal default.
- **Real paths.** Spec section 4's comparison sentence names `~`, `..`,
  backslash and drive-letter forms; the guard now also resolves 8.3 names,
  junctions and symlinks, resting on the "file_path resolving to a
  protected path" row. A spec line for it is yours to add or not. Removing
  a link that points into protected config, or to a folder holding it, is
  refused though rm removes only the link. Still missed: hard links, a
  dangling link whose target is not yet written, and (off Windows) `..`
  after a link.
- **A bare push** under `push.default=upstream` is checked only by the
  current branch's name; spec section 4 asks no more. Named in the guard's
  commit body.
- **`gh pr create`** is stopped only by the skill's prose (spec section 11
  declines blocking it).
- **The commit scan's** three plan-acknowledged survivors (`-I`, the
  last-tab split, the message grep's exit test), and hits listed in
  lexical order (line 10 before line 2).
- **The showcase flag** lists a stale local branch by its local name even
  when a newer copy is pushed (the plan's interface).
- **`commands/handoff.md`** repeats "14 days" from `SHOWCASE_DAYS=14` in
  `ground-truth.sh` with no test tying them.
- **The charter template's** comment lost its history clause in simplify
  pass 1 (when the cap went from about 120 to about 130). Restore it if
  you wanted it kept.
- **The frames skill's** "(offered)" headings are plan text, left as
  written.
- **From the clearing fix's review:** a bare `cd` (to the home folder) is
  not followed, the same class as the listed `cd -`; two option forms are
  handled but unpinned (`-@`, and a cluster with a bad letter such as
  `-Px`); the comment above `cdTarget` says "any other word starting
  with -", wider than the code, which treats a lone `-` as the folder.

## Clearing review

Round 1 at 1abb851: not cleared, 3 major (a false "for the owner" item:
this report said `~/.claude` has no ignore line for the scan list, but
its whitelist `.gitignore` ignores it, as spec section 3 says; a `cd`
with an option moved the guard to the wrong folder; two conditions of
the heredoc exception survived the suite), 2 minor (git `-c`
indirection and GNU `cp -T`, now on the known-miss list), 2 nit. The
false item is withdrawn; the fix round landed as 7656713 and also
strips `builtin` like `command` (found by probing the fix's
neighbours). Round 2: see the PR body.

## Trial: timed mutants four at a time

Ruled by the owner in session, quoted: "run timed mutants four at a time
and if it works well, we'll make that the standard for symplecticator
workflow." The clearing fix's review ran 22 guard mutants four at a
time, the timed commit-test ones included: 888 s wall, about 40 s a
mutant, against 108 s for one suite run alone (the one-at-a-time runs
earlier tonight took about 90 to 120 s each). No run hit the 20 s scan
timeout, so no mutant needed its solo rerun and no verdict changed; the
unmutated suite, run beside three mutants, took 149 s and stayed 23 of
23. For contrast, one one-at-a-time run earlier did hit the timeout
once (mutant c2), killed correctly on its rerun. Machine load during a
one-at-a-time run was about 30% CPU of 10 cores and 3% disk: the suite
is bound by process start-up, not compute.

## Retro line

Simplify: proposed 9 / accepted 4 / rejected 5 (pass 1); pass 2 clean.
Clearing round 1 caught what simplify missed: the cd option forms and
the two heredoc conditions.

## Proposed edits, after you merge

- `CLAUDE.md`, Verify bullet: add "If ground-truth.test.sh's only failures
  are its four deleted-object checks, rerun it once before calling it red;
  the cause is not yet known."
- Mutant runs four at a time, the timed ones included, with a solo rerun
  of any mutant whose only failure is a timeout: as the standard for this
  repository's builds, if you take the trial above as working well
  (proposed for this repo's CLAUDE.md and the build skill's reviewer
  instructions).
- The plan and these build files leave the repo by the plan's After merge
  step 1.
