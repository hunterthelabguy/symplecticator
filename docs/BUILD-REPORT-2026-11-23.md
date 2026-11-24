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
| Clearing fix 2: the guard follows only a cd bash takes | 56d2b68 | 0d0bd61 | 22 named mutants at eight at once: 21 killed, k4 killed after its pin; full verify green |
| Fix round after the run: every folder a cd may leave | 32217aa (direct, fresh session) | 32217aa | 19 named mutants at eight at once: 18 killed, k7 killed after one test line; no scan timeout; full verify green |
| Clearing round 4's fixes: a wrapped cd moves nothing, a conditional cd adds | 3024f72 (direct) | 3024f72 | 8 named mutants at eight at once: 8 killed, no scan timeout; guard and hook suites green |
| Merge of main (the ledger script, the one-text port) | c84f450 | c84f450 | full verify of six suites, 581 s; CI green |
| Clearing round 5's fix: writes checked in every folder a cd names | 2b7a132 (direct) | 2b7a132 | 33 named mutants at eight at once: 31 killed, 2 equivalent with their code removed; no scan timeout; full verify green |

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

## Not cleared

The run ended uncleared: see Clearing review below. Nothing was parked.
One finding was held back from the batch for the owner: a cd the guard
cannot place. A fresh session then fixed round 3's three majors and,
on your rulings, that held finding; a fresh clearing review reads the
result.

## Final verify (the tree committed as 2b7a132; later commits touch only docs)

```
ground-truth.test.sh: all checks passed, 0 skipped
build-stop-gate.test.sh: all checks passed, 0 skipped
ledger.test.mjs: tests 56, pass 56, fail 0, skipped 0
commit-scan.test.sh: commit-scan.test.sh: all passed
perturb-guard.test.mjs: tests 24, pass 24, fail 0, skipped 0
perturb-hook.test.sh: perturb-hook.test.sh: all passed, 0 skipped
```

448 s wall. CI at c84f450, the merge before it: suites on ubuntu-latest
and macos-latest, and guard-windows, all success; for later heads, see
the PR's checks. CI at aef35e1 and every first-parent
head after it through 5a8fc6e passed too; none ran at 32217aa, f9178c3
or 3024f72, while the branch conflicted with main.

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

- **A cd the guard cannot place** (after a pipe, `false &&` or
  `true ||`): answered in the fix round after the run, by your ruling on
  how a cd is placed, and then by keeping every folder (see Clearing
  review). Its cost is over-refusal: a write or removal is checked in
  the starting folder and in every folder a cd names, though bash runs
  it in one. Probed, each refused while bash leaves the config file
  alone: `cd /other; rm CLAUDE.md` from the config folder, and
  `(cd <config>) && rm CLAUDE.md` from another folder.
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
- **A bare `cd`** (to the home folder) is not followed, the same class
  as the listed `cd -`.
- **A known over-refusal:** `mkdir -p x; cd x; rm CLAUDE.md` from the
  config folder is refused, since `x` does not exist when the guard
  checks.

## Clearing review

Round 1 at 1abb851: not cleared, 3 major (a false "for the owner" item:
this report said `~/.claude` has no ignore line for the scan list, but
its whitelist `.gitignore` ignores it, as spec section 3 says; a `cd`
with an option moved the guard to the wrong folder; two conditions of
the heredoc exception survived the suite), 2 minor (git `-c`
indirection and GNU `cp -T`, now on the known-miss list), 2 nit. The
false item is withdrawn; the fix round landed as 7656713 and also
strips `builtin` like `command` (found by probing the fix's
neighbours).

Round 2 at ae46512: round 1's majors confirmed closed; not cleared on
one new major: the guard followed a `cd` that bash refuses (`-@`, a
missing folder, a file, two operands), so after `;` or a newline the
next command ran in a folder the guard did not check. The owner ruled
the fix in session, picking "Validate the cd (Recommended)" from
Claude-drafted options: follow a cd only when bash would move. Landed
as 56d2b68. On the owner's further word ("yes, take 1 and 2"), that
fix had no separate task review: clearing round 3 reviews it with the
whole diff, and mutants run up to eight at once.

Round 3 at 257bac3, the last the build allows: not cleared, 3 major.
A: the guard follows a `cd` joined by `&&` even to a folder that does
not exist; that holds only to the end of the `&&` list, so
`cd <missing> && true; rm CLAUDE.md` from the config folder gets
through. This came from a controller ruling that departed from the
owner's pick ("an existing folder at check time") and misstated its
cost; it leaves round 2's finding open in that form. B: a `cd` ended by
`||` is treated as moving nowhere, but in `cd X || exit; rm ...` the
removal runs in X (present since the guard first landed; on no list).
After the run the owner ruled B: check both folders. C: a test gap the
last fix round made: the existing-folder check
measured against the wrong base folder survives the suite, since every
new test uses an absolute operand. Minor: the comment and a commit body
say a lone `-` is not followed, but the guard follows it to a folder
named `-`; and CDPATH, a glob operand, a quoted `~` and a folder moved
earlier in the same call all resolve differently in bash. The fixes,
with the round-3 reviewer's suggested tests, are in the resume block of
the PR body.

### Fix round after the run

A fresh session fixed A, B and C in one change, test first. The B
prototype (check both folders after a `cd` ended by `||`) closed every
A and B probe, but probing its neighbours found the same fault by
another input: a `cd` inside parentheses or a substitution, then a
removal in the same subshell (`(cd <config> && rm CLAUDE.md)`,
`echo "$(cd <config>; rm CLAUDE.md)"` and five more), exits 0 while bash
removes the file. You ruled the broad rule ("Broad rule (Recommended)",
Claude-drafted): any `cd` the guard cannot place adds its folder to the
ones checked, and a push or commit with two possible folders is
refused. Probing that rule as drafted found seven more forms (a `cd` in
the body of `if false; then`, `case`, `for`, `while`, `else`, an
uncalled function, or after `(false) &&`); you ruled the stricter
definition ("Stricter (Recommended)", Claude-drafted): a `cd` moves the
guard's folder only while every command before it in the call was a
`cd` that moved to an existing folder, and any other `cd`, but one
ended by `|` or `&`, adds its folder. Every probe was rerun against
real bash in a throwaway home folder. This also answers the held forms
(a `cd` after a pipe, `false &&` or `true ||`). The comment and the
lone-dash sentence now say what the guard does.

Round 4 at f9178c3, a fresh review after the build: not cleared, 1
blocker, 2 major, 4 minor, 4 nit. The blocker: the branch conflicted
with main, so CI had not run at the fix round's head. The majors, both
rerun in the session against real bash: a `cd` behind `nohup`, `env`,
`nice` or `timeout` counted as a `cd` bash keeps, though those run it
as a program of its own and bash never moves (from the config folder
`nohup cd <other>; rm CLAUDE.md` removed the file; present since the
guard landed); and a `cd` in an `else`, `elif` or `do` body, or after a
negated condition, counted as placed when the condition was a `cd` that
moved (`if ! cd <config>; then cd <other>; fi; rm CLAUDE.md` and four
like it). You ruled both fixed and main merged ("Fix both, merge main
(Recommended)", Claude-drafted), and a fresh full review after
("Run"). 3024f72 makes a wrapped `cd` move nothing and count as another
command (`command`, `builtin` and `time` still run the builtin), and
makes a `cd` behind a reserved word but `{` add its folder. Its one new
over-refusal, probed: `if cd <other>; then cd sub; fi; rm CLAUDE.md`
from the config folder. c84f450 merges main; the three conflicts keep
both sides, and the verify line and the workflow gain main's ledger
suite.

Round 5 at 4a8b355, a fresh full review: not cleared, 0 blocker, 2
major, 3 minor. Round 4's blocker closed. The majors, rerun in the
session: a `cd` joined by `&&` in a list that ends in `&`, and a `cd`
in a piped or backgrounded `{ }` group, moved the guard though bash
runs them in a throwaway shell (`cd <other> && true & rm CLAUDE.md`
from the config folder removed the file). It was the fifth round
running to find one more way the guard believed bash moved when it did
not. You ruled the rule that closes the class ("Keep every folder
(Recommended)", Claude-drafted): writes and removals are checked in the
starting folder and in every folder any `cd` names, resolved from every
folder seen; a push or commit keeps the placement above. And a lighter
review after ("Lighter": a delta review of the commits since 4a8b355,
with round 5's report as context). Its cost: from a folder that holds a
protected name, removing that name after a real `cd` away is refused.
The minors: `function f { ... }; f`, `coproc` and `stdbuf` join the
known misses, with CDPATH, glob operands, a quoted `~` and a folder an
earlier command creates or moves, which the PR body had named without
listing.

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
is bound by process start-up, not compute. At eight at once (clearing
fix 2), 23 runs took 732 s wall, about 32 s a mutant, again with no
timeout. One reviewer, while waiting on its batch, spawned a throwaway
agent against its brief; it reviewed nothing.

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
