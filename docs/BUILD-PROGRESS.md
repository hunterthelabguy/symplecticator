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

Spawned: 22. Resumed: 21.

## Notes

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
