# Build progress: perturb-plan

Mode: overnight. Base: ce5cbbb (the plan branch; main's cf68b19 merged
in). Integration branch: `build/perturb-plan`. Options taken at
preflight: the floor-9 batch (yes); its plan-test-gap extension (no);
pipelining the T1 to T3 chain (no).

Base verify (2026-11-22): `ground-truth.test.sh` all passed, 0 skipped;
`build-stop-gate.test.sh` all passed, 0 skipped. The other three suites
do not exist on the base; T1, T2 and T3 create them.

## Tasks

| Task | State | Commit | Verify |
|---|---|---|---|
| T1 commit-scan.sh | done | 445f9df (merge 2c873fc) | commit-scan all passed; 22 of 22 mutants killed; suites green after merge |
| T2 perturb-guard.mjs | done | 97d0941 | full verify green on rerun (first run: 4 ground-truth fixture checks red, named flake); guard 23 of 23 |
| T3 /perturb skill and hook | done | 47a8c88 | full verify green: all five suites; hook 7 of 7, guard 23 of 23 |
| T4 frames skill | done | aaa2522 (merge 2ad404b) | grep 10, no em dash; ground-truth and build-stop-gate green |
| T5 showcase branches, ruling count | done | a42af3d (merge 26c15f2) | ground-truth all passed; 12 of 12 mutants killed; suites green after merge |
| T6 setup, template, docs, CI | done | e012012 | full verify green: all five suites; both greps empty |
| Floor-9 batch | done | a2965f5 | full verify green; body corrected at landing by replay (49655f7) |

## Agents

Spawned: 23. Resumed: 20.

## Notes

Fix round after the run (a fresh session, 2026-11-23 to 24): A, B and C fixed in one change, test first, after the owner's two rulings on its scope (below); landed as 32217aa; full verify green, guard 24 of 24; 19 of 19 fix mutants killed at eight at once (k7 after one test line), no scan timeout. A fresh clearing review follows.

Clearing round 3 at 257bac3 (the last allowed): not cleared, 3 major. The run ends uncleared; the PR body, the report and the resume block carry the findings.

Clearing round 2 at ae46512: not cleared (1 major). Fix landed as 56d2b68 on the owner ruling; clearing round 3 reviews it.

Clearing round 1 at 1abb851: not cleared (3 major). Fix landed as 7656713. The "for the owner" item above on the scan list having no ignore line is withdrawn: ~/.claude/.gitignore is a whitelist that ignores it.

Simplify pass 2: clean, no commit; the loop ends after one landed pass.

Simplify pass 1 landed: 50c8088 (proposed 9, applied 4, left 5); full verify green. Pass 2 running.

Added task "Real paths" landed: aef35e1. All tasks, the batch and the added fix are in; Finish begins.

Added task "Real paths": the pull request's first Windows CI run failed one guard test (an 8.3 short temp name against git's long path); a real gap, fixed at the root after a prototype.

## Rulings

- Ruling (Claude): the base verify ran only the two suites present on
  ce5cbbb; why: the other three suites are created by T1 to T3, so the
  full Verify line cannot run on the base; cost if wrong: none (a red
  existing suite would still have stopped the run).
- Ruling (Claude): agent reports, briefs and scripts stay in the
  controller's scratch folder and are summarized here, not copied
  beside the plan; why: they hold home-folder paths, and this public
  repo bars the OS login name from tracked files; cost if wrong: the
  raw reports are lost when the scratch folder is cleared, leaving
  these summaries.
- Ruling (Claude): the run's Claude rulings are kept in this file as
  they are made and go into the private ledger as one entry at
  Finish; why: several sessions append to that ledger at once and
  collide on entry numbers; cost if wrong: one ledger entry instead of
  several.
- Ruling (Claude): the frames commit landed by replay (same tree,
  author and date) with one body sentence corrected as its reviewer
  drafted it ("It is model-invocable, so ... the closing report's bets
  can fire it on their own" became "Its description tells Claude to
  fire it on its own when drafting conjugate bets, so the /perturb
  command can name it"), and "The task is prose" became "Both files
  are prose"; why: the reviewer graded the first sentence wider than
  the diff, and "task" is a plan word; cost if wrong: one reworded
  body. The reviewer's other Minor ("(offered)" in both headings) is
  plan-mandated text, left as written.
- Ruling (Claude): the commit scan's three Important floor-9 gaps
  (a one-rule list, a rule holding `#`, every message hit; each a gap
  in the plan's own test text) go to the task's own fix round, not
  the batch; why: the owner declined the batch option for plan-test
  gaps at preflight, and the fix adds checks to the scan's suite
  only, which no later task block counts; cost if wrong: one fix
  round. The review's Minor survivors (untracked files unpinned,
  error line numbers counted over rule lines only) wait for the
  floor-9 batch; the three plan-acknowledged survivors stay listed
  for the owner.
- Ruling (Claude): the showcase flag's fix round adds edge fixtures
  at 13 and 15 days beside the plan's 5 and 20 (the Important gap:
  cutoffs from about 6 to 19 days passed), and fixes a branch named
  exactly `showcase` being listed, with an awk filter rather than new
  for-each-ref patterns; why: spec section 7 scopes the flag to
  `showcase/*`, a spec line the code missed, cheap to fix in the same
  round, and keeping the plan's patterns keeps its named mutants
  meaningful; cost if wrong: one awk line and three checks. The
  reviewer's other Minor, a stale local branch standing for a newer
  pushed copy, is the plan's own interface ("listed once, by its local
  name") and is listed for the owner.
- Ruling (Claude): the showcase flag's fix takes the implementer's
  option B over the controller's first brief: trailing slashes on both
  for-each-ref patterns (`refs/heads/showcase/`,
  `refs/remotes/$REMOTE/showcase/`) instead of an awk filter, edge
  fixtures at 14.5 and 13.5 days instead of 15 and 13, and the
  exact-`showcase` fixture in a repo of its own; why: the brief failed
  as written (whole-day fixtures sit on the cutoff mutants'
  boundaries, so one survived; git refuses a `showcase` branch beside
  `showcase/*` ones; the awk filter made the block's mutants (e) and
  (f) survive), and option B killed all 12 mutants in scratch; cost if
  wrong: the trailing-slash pattern behaves otherwise on an older git
  (macOS CI would show it).
- Ruling (Claude): the commit scan landed by replay with its
  re-check's corrected last sentence ("a red run of the test as
  committed, again before commit-scan.sh existed, ends ... 39
  FAILED"); why: the reviewer read the earlier wording as naming the
  first run; cost if wrong: one reworded body.
- Batch list (Minor, for the floor-9 batch): the scan's untracked
  files unpinned (a mutant scanning them survives, erring toward
  refusing); the scan's error line numbers unpinned when comments come
  first; the scan test's header line 9 wider than the rest; the
  showcase test section's opening comment not naming the edge
  fixtures.
- For the owner (not the batch): the scan's three plan-acknowledged
  survivors (`-I`, the last-tab split, the message grep's exit test);
  hits sorted lexically (line 10 before line 2); a stale local
  showcase branch standing for a newer pushed copy (the plan's
  interface).
- Ruling (Claude): the guard's plan-mandated cd handling goes to a fix
  round rather than parking: a cd moves the guard's cwd and counts as a
  lead only where bash keeps it (top level, outside parentheses and
  substitutions, ended by &&, ; or a newline); anywhere else it is an
  ordinary command; why: spec section 4 refuses a commit or push after a
  substitution that runs first, and spec beats plan; the fix narrows what
  the guard allows and changes no refusal text, tool list or anchor; the
  controller widened the review's fix to the neighbours it found by
  reading the parser (a cd ended by |, || or a single &, which bash also
  discards for the next command); cost if wrong: `(cd x && git commit)`
  and those forms are refused where the plan let them through.
- Ruling (Claude): the review's three Minor survivors (`>|`, `gh --repo
  o/r` as two words, readsHeredoc's three-token condition) go into the
  same fix round instead of the floor-9 batch; why: same two files,
  test-first, and the round runs anyway; cost if wrong: none beyond the
  round's tokens.
- Ruling (Claude): a push with no refspec under push.default=upstream is
  spec-compliant and stays as built, named as a miss in the commit body
  and listed for the owner; why: spec section 4 asks only for "no refspec
  while on it"; cost if wrong: a follow-up to resolve @{push}.
- For the owner: spec section 4 says `.claude/settings*.json`; the code
  protects exactly settings.json and settings.local.json, as the plan's
  global constraints list them. Confirm the spec meant those two.
- Ruling (Claude): the guard's fix round takes the implementer's option
  A over the controller's brief: two more refusals, a cd ended by ;
  inside a substitution and inside parentheses; why: the brief failed as
  written (its forms $(cd x) and (cd x) end at a closing parenthesis,
  outside the keep set, so the substitution and parenthesis checks stood
  untested and their mutants survived); option A kills both alone, suite
  green; cost if wrong: none (two more refusal assertions).
- Ruling (Claude): the guard's merge (97d0941) stands although its first
  full verify was red; why: the only failures were four checks of the
  ground-truth suite's deleted-object fixture ("pushed copy cannot be
  compared: UNKNOWN", "verbatim check cannot run: UNKNOWN", "git cherry
  failing partway: UNKNOWN", "every failed comparison counted"), a
  script the merge does not touch; the same tree then passed the full
  verify once and the ground-truth suite four times in a row; that area
  of the suite has failed once before with no script change (the commit
  that made a failed check print what it read). Named here as a known
  flake: a later landing whose only red is these four checks reruns the
  suite once before reverting. The landing script cut the failed checks'
  detail lines, so their cause is not known. Cost if wrong: a real
  regression in the ground-truth suite lands; CI on three systems
  reruns it.
- Ruling (Claude): the skill's review findings go to one fix round,
  Minor ones included: the user-only check scoped to the frontmatter;
  the skill's body names the browser refusals (browser skill, batch
  tool, scrolling), says "among others" before its refusal list, adds
  fetching a page and reporting progress to the allowed kinds, and is
  rewrapped; four body lines corrected; why: same two files, every
  change measured by the review's probes of the guard, and none changes
  the hooks block, the tool list or the guard; cost if wrong: a reworded
  skill paragraph.
- For the owner: the guard's scan timeout can be raised above the
  hook's 30 s by PERTURB_SCAN_TIMEOUT_MS in the environment, and the hook
  suite reads only the literal default; `gh pr create` is refused by the
  skill's prose only (spec section 11 declines blocking it).
- Ruling (Claude): the README's CI badge caption is corrected in the
  docs task's fix round, though the plan's checklist omits it; why: the
  workflow now runs five suites and a Windows job, and a caption naming
  two would misstate the repo's verification; cost if wrong: one
  reworded caption.
- For the owner: nothing keeps `~/.claude/scan-patterns.local` out of
  `~/.claude`'s own git (setup writes no ignore line), so a `git add -A`
  there would track the private list; setup's step 10 check catches it
  only when setup runs.
- For the owner: the Windows CI job's guard suite runs commit-scan.sh
  through whatever `bash` the runner's PATH resolves; if that is not Git
  Bash, the job fails and is fixed in the pull request.
- Ruling (Claude): the guard's cd-after-a-pipe gap leaves the floor-9
  batch for the owner instead of landing; why: a scratch prototype (a cd
  marked piped is ordinary) killed the pipe form and kept the suite
  green, but probing its neighbours found the same fault by another
  input: from the home config folder, `false && cd /; rm CLAUDE.md` and
  `true || cd /; rm CLAUDE.md` both exit 0 on the tip and on the
  prototype, while bash skips the cd and removes the protected file; a
  fix at the root (a cd whose running bash decides at run time) is a
  design question for the owner; cost if wrong: the pipe form stays
  open until the owner rules.
- Ruling (Claude): the parser comment on the depth step's order stays as
  intent; why: the order is equivalent today (no test can pin it) and the
  comment states the reading a later change would need; cost if wrong:
  one comment line.
- Ruling (Claude): the pull request's first Windows CI failure is fixed
  at the root in the guard, as a task added in the build: the guard
  compares real paths (8.3 short names, junctions and symlinks resolved
  on the longest existing prefix); why: the failing assertion exposed a
  real gap (from the repo's main checkout, a Write to the 8.3 spelling of
  its .claude/settings.json exited 0 while the long spelling exited 2),
  the plan says a Windows FAIL is fixed in the pull request, and a
  prototype killed both the 8.3 and the junction forms with the guard
  and hook suites green; a test-only fix would have hidden the gap; cost
  if wrong: a symlink pointing into protected config is refused for
  removal too, where removing the link alone would be harmless.
- For the owner: a hard link to a protected file is a second name no
  path resolution can see; it stays a miss.
- Ruling (Claude): the batch lands by replay with its reviewer's
  corrected guard paragraph, without a re-check; why: the review's only
  findings were in the commit body (one 110-character line, one sentence
  wider than the guard), the tree is the reviewed one, and the corrected
  paragraph was read back (every line at most 72, no barred word); cost
  if wrong: one reworded body.
- Ruling (Claude): the real-path fix compares both spellings, written
  and real, in a fix round; why: its review probed a regression (with
  ~/.claude a link, removing the home folder was refused before the fix
  and allowed after it), and comparing both spellings keeps every
  earlier refusal while adding the link and 8.3 ones; the round also
  pins the 8.3 branch locally, since this disk makes short names; cost
  if wrong: a little more refusal where a written spelling and a real
  one both happen to match.
- Ruling (Claude): the real-path fix lands by replay with its
  re-check's corrected rm-of-a-link sentence; its two Minor comment
  findings (a 148-column header line; real's comment claiming every
  spelling compares equal, which dangling and hard links contradict) go
  to the simplify pass rather than a second fix round; why: comment-only,
  and the simplify pass reviews comments against the code anyway; cost
  if wrong: the comments land a pass later.
- Ruling (Claude): the /perturb skill's body sentence on the lead rule
  was corrected in its brief before it went out ("follows any command
  but `cd`" became "follows any command in the same Bash call but a `cd`
  joined to it by `&&`, `;` or a newline"); why: the guard as fixed
  counts any other cd as an ordinary command; cost if wrong: one
  sentence reworded.
- Ruling (Claude): the batch's commit-scan test header keeps the two
  phrases naming its new cases, beyond the brief's "words unchanged";
  why: without them the header would go stale; cost if wrong: two
  phrases deleted.
- Ruling (Claude): simplify pass 1's four edits landed (two guard
  comments, a test helper renamed from sh to git, and the charter
  template's comment losing the history of when its line cap was
  raised); why: each was proved a no-behaviour edit by a comparison and
  the full verify was identical before and after; the template comment
  is the one judgment call (setup strips it before an adopter sees it);
  cost if wrong: the history clause restored.
- For the owner: commands/handoff.md repeats "14 days" from
  SHOWCASE_DAYS=14 in ground-truth.sh with no test tying them.
- Ruling (Claude): clearing round 1's two code majors go to one fix
  round, prototyped first: cd's options (-L, -P, -e, -@, clusters, --)
  are skipped before its folder, an invalid option leaves the folder
  unchanged (bash moves nowhere), and `builtin` is stripped like
  `command`; two readsHeredoc conditions get refused fixtures; why: the
  prototype's neighbour probe found `builtin cd` passing by another
  input and fixed it at the same root (how the guard reads a cd), with
  every probed form matching bash; cost if wrong: a cd form the guard
  now follows that bash would not.
- Ruling (Claude): the false PR-body bullet (the scan list has no
  ignore line in ~/.claude) is withdrawn from the body, the report and
  the owner's list; ~/.claude/.gitignore is a whitelist that ignores it
  (git check-ignore confirms), as spec section 3 says. The two minors
  (git -c indirection, GNU cp -T) are added to the PR's known-miss list
  without code changes; a nit's PR line was narrowed. Cost if wrong:
  none; body edits are not commits.
- Ruling (Claude): the clearing fix adds a test for an option cluster
  (`cd -Pe <config> && rm CLAUDE.md` refused); why: the implementer's own
  mutant (clusters not skipped) survived the briefed tests, a floor-9
  gap; cost if wrong: one test line.
- Owner ruling, 2026-11-23, in session, quoted: "run timed mutants four
  at a time and if it works well, we'll make that the standard for
  symplecticator workflow. Yes?" Claude answered yes, with a safeguard
  (a timing-only kill is rerun alone before it counts) and two measures
  of "works well": no verdict flips on a solo rerun, and the wall time
  saved against one-at-a-time runs (about 90 s a mutant). Applies from
  the clearing fix's re-check on; the running implementer keeps its
  one-at-a-time runs.
- Owner ruling, 2026-11-23, in session: on clearing round 2's N1 (the
  guard follows a cd that bash refuses), asked "How should the fix go?"
  (question and option text Claude-drafted), the owner picked "Validate
  the cd (Recommended)", whose description read: "Follow a cd only when
  bash would move: options -L, -P, -e only (drop -@), exactly one
  operand, and an existing folder at check time; otherwise keep the old
  folder. Closes every N1 probe with little risk to round 3. The pipe
  and conditional forms stay held for you, as listed."
- Ruling (Claude): within that pick, a cd joined by && still moves the
  guard's folder to its target even when the target does not exist;
  why: if the cd fails nothing after && runs, so following it is
  harmless, and it keeps the existing "cd to a missing folder && push"
  refusal; cost if wrong: a refusal message names the wrong reason.
- Owner ruling, 2026-11-23, in session, quoted: "yes, take 1 and 2",
  answering Claude's offer (Claude-drafted): "1. Fold the fix's task
  review into clearing round 3 ... one fresh agent does both jobs" and
  "2. More mutants at once ... Six to eight at once ... Same safeguard:
  solo rerun on any timeout." Applies to the rest of this run: clearing
  fix round 2 lands on its implementer's verify and the clearing
  review, with no separate task review; mutants run up to eight at
  once.
- Ruling (Claude): the fix's surviving invalid-option branch gets a pin
  (a folder named `-x` in the config folder; `cd -x; rm CLAUDE.md` is
  refused), not deletion; why: the branch is right (bash rejects the
  option and stays, so the removal hits the config folder) and only the
  test was missing; cost if wrong: one test line and a fixture folder.
- Correction (Claude): the earlier ruling that a cd joined by && moves
  the guard's folder even to a folder that does not exist was wrong.
  Its premise ("if the cd fails nothing after && runs") holds only to
  the end of the && list; whatever follows a later ; or newline runs in
  the old folder, so `cd <missing> && true; rm CLAUDE.md` from the
  config folder gets through (clearing round 3, probed). Its stated cost
  ("a refusal message names the wrong reason") was misstated: the real
  cost is a removal of protected config getting through. The owner's
  pick named "an existing folder at check time" with no && exception.
- Ruling (Claude): the run ends uncleared after clearing round 3, the
  third and last round the build allows, with its findings carried into
  the PR body, the report and the resume block for the next session.

### Fix round after the run (fresh session)

- Owner ruling, 2026-11-23, after the run: on finding B, asked "Should a
  cd ended by || make the guard check both folders?" (Claude-drafted),
  the owner chose "Check both folders".
- Owner ruling, 2026-11-23, in the fix round: the B prototype closed
  every A and B probe, but its neighbour probe found the same fault by
  another input (a cd inside parentheses or a substitution, then a
  removal in the same subshell: 7 forms, exit 0 while bash removes the
  file). Asked "How far should this fix go?" (question and option text
  Claude-drafted), the owner picked "Broad rule (Recommended)": "Any cd
  the guard cannot place (in parentheses or a substitution, ended by ||,
  after a pipe, && or ||) adds its folder to the ones checked; a commit
  or push with two possible folders is refused. A cd after && counts as
  placed when the command before it was a cd to an existing folder, so
  `cd repo && cd sub && git push` still passes. This also answers the
  held forms. 31 lines."
- Owner ruling, 2026-11-23, in the fix round: probing that rule as
  drafted found 7 more forms (a cd in the body of `if false; then`,
  `case`, `for`, `while`, `else`, an uncalled function, or after
  `(false) &&`). Asked "Which definition of a placed cd?" (Claude-drafted),
  the owner picked "Stricter (Recommended)": "A cd moves the folder only
  while everything before it in the call was a cd that moved to an
  existing folder; any other cd (except one ended by | or &, which bash
  throws away) adds its folder. Closes the 7 compound forms. 4 more
  over-refusals, all from a folder that holds protected config."
- Ruling (Claude): the lone-dash sentence is corrected to say what the
  code does (a lone `-` is read as a folder named `-`), not the code to
  match the old sentence; why: the brief asked for the sentence, and
  `cd -` stays on the known-miss list either way; cost if wrong: `cd -`
  moves the guard only where a folder named `-` exists.
- Ruling (Claude): the new refusal reads "git push after a cd the guard
  cannot place: it could run in any of N folders; run it alone, or
  after cds to folders that exist"; why: the owner's pick says such a
  push or commit is refused but not in what words; cost if wrong: a
  reworded message.
- Ruling (Claude): four test lines beyond the brief's list, each to
  kill a mutant of this change: the old folder stays checked after
  `cd <other> || exit` from the config folder, a write and a recursive
  copy after `cd <config> || exit`, and `(cd x) || cd y`; why: floor 9,
  each pins a line the brief's tests leave open; cost if wrong: four
  lines.
- Owner ruling, 2026-11-23, after clearing round 4 (not cleared at
  f9178c3: the branch conflicted with main; a wrapped cd and a cd behind
  a reserved word were misplaced): asked "What goes into the next
  round?" (Claude-drafted), the owner picked "Fix both, merge main
  (Recommended)": "Land the prototype test-first, then merge main into
  the branch with a merge commit, never a rebase. Resolving the
  conflicts takes main's ledger suite into the verify line and the
  workflow. Then full verify, CI on the merged head, and mutants." Cost
  gate for the next clearing review: "Run".
- Ruling (Claude): within that pick, `command`, `builtin` and `time`
  still let a cd move, and a `{` group still places it; why: each runs
  the builtin in the current shell, unconditionally; cost if wrong: a
  form behind one of them that bash skips gets through, the class
  round 4 found.
- Ruling (Claude): the merge's README line says the ledger script needs
  Node 18.13 or later and the guard needs Node too, and its badge
  caption counts six suites; why: each side's sentence was true of its
  side only; cost if wrong: a reworded line.
- Owner ruling, 2026-11-24, after clearing round 5 (not cleared at
  4a8b355: a cd in a list ended by &, or in a piped or backgrounded
  group, moved the guard): asked "What next?" (Claude-drafted), the
  owner picked "Keep every folder (Recommended)": "Land the 4-line rule
  test first. The 2 tests that allowed `cd /other; rm CLAUDE.md` from
  the config folder flip to refused, and the new forms get tests. The
  over-refusal goes on the known list. Then verify, mutants and CI."
  Cost gate for round 6's review: "Lighter" (a delta review of the
  commits since 4a8b355, with round 5's report as context).
- Ruling (Claude): within that pick, each cd's folder is resolved from
  every folder seen, not only the placed one, and three conditions that
  became dead go (`else placing = false`, and the kept-cd and not-placed
  tests in placement, whose mutants survived as equivalent: placing
  matters only to a push or commit, which any command but a kept cd
  refuses); why: the four-line prototype let
  `cd <other> && true & cd cd-sub; rm ../CLAUDE.md` through from the
  config folder (probed: exit 0, bash removed the file), and after any
  other command a push or commit is refused anyway; cost if wrong: a
  few more over-refusals of the kind the owner accepted.
- Ruling (Claude): tests that now pass only because the starting folder
  stays checked are folded into one list of the forms the clearing
  rounds found, and the pins that matter only for a push (a `{ }`
  group, `command` and `time`, a reserved word) move onto push tests;
  why: floor 9; cost if wrong: a form's line reads less directly.
- Correction (Claude), an escape: the earlier ruling in this round that
  the not-placed test in placement was dead was wrong. Its premise (only
  a cd behind a leading reserved word fails to place, and every later cd
  in that compound is behind one too) missed `! cd A && cd B`: bash runs
  `! cd A`, which moves and reports failure, skips `cd B`, and runs the
  next command in A, while the guard placed the push in B. The delta
  clearing review at 7d35599 found it; the session reran it (a throwaway
  origin's default branch moved; the guard at 4a8b355 refused it). The
  condition is restored, with a test. Its stated cost ("none") was wrong:
  the real cost was a push or commit placed in the wrong repo.
- Owner ruling, 2026-11-24, after clearing round 7 (a delta, not
  cleared at 2dc10d4: on Windows a cd to a Git Bash mount path named no
  folder the guard found): asked "What now?" (Claude-drafted), the owner
  picked "Map mount paths (Recommended)": "Land the cygpath mapping
  test-first, plus the reviewer's missing test (a bare `cd` then a
  relative `cd` before a push). The redirect-failed `cd` goes on the
  known list, next to the folder that cannot be entered, and the PR
  body's two stale lines are fixed." Cost gate: "Delta review".
- Ruling (Claude): the guard asks cygpath through bash, not directly;
  why: the Windows CI job runs the guard from node, where Git's usr/bin
  may not be on the path, while bash (which the suite already needs for
  the commit scan) puts it there; cost if wrong: about 90 ms more per
  distinct mount path (138 ms against 47 ms, measured once).
- Ruling (Claude): two survivors of the mapping's mutants were dead and
  went (glob characters in the mount test, since a glob path is cut
  before it reaches it; the exit-status check beside the output check),
  and the fallback to the written path is pinned by a test with no bash
  on the path, as the question put to the owner described ("If `cygpath`
  is missing, the path stays unmapped, as today", question text, not the
  option the owner picked); cost if wrong: that fallback fails open where bash is
  missing, which the hook itself never is.
- Correction (Claude), an escape: the mapping of mount paths also read
  the Write and Edit tools' drive-less paths through cygpath, so a Write
  to `/Users/.../.claude/CLAUDE.md`, which Claude Code reads on the
  current drive, passed (the delta clearing review at 65a01ab found it;
  the session reran it: 2dc10d4 refused, 65a01ab let it through). Not
  probed before landing: the session probed only Bash paths.
- Ruling (Claude): the fix checks a drive-less mount path in both
  readings, bash's and a Windows tool's, the fail-closed union used for
  cds; why: a regression of this session's own, repaired without a new
  rule; cost if wrong: an over-refusal where a drive-less path means
  different files to bash and to a tool.
- Correction (Claude): the /tmp test added in the last fix asked cygpath
  where /tmp is under the suite's own TEMP, then ran the guard under the
  fixture TEMP; a fresh msys runtime (every CI runner) reads /tmp from
  TEMP, so the Windows CI job failed it (the delta clearing review at
  c29959a found it; the session reproduced it with a copied msys
  runtime, and the fixed test passes there). Its commit body's claim
  that the line skips with a diagnostic held only where /tmp is not the
  temp folder.
- Ruling (Claude): the owner's two rulings went into the private ledger
  as their own entries, committed that file alone and not pushed, since
  that checkout holds other sessions' unpushed commits; cost if wrong:
  the owner pushes them with the rest.
