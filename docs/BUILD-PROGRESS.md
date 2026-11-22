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
| T1 commit-scan.sh | fix round 1 | c90ac8e (task branch) | review: 3 Important test gaps |
| T2 perturb-guard.mjs | todo | | |
| T3 /perturb skill and hook | todo | | |
| T4 frames skill | done | aaa2522 (merge 2ad404b) | grep 10, no em dash; ground-truth and build-stop-gate green |
| T5 showcase branches, ruling count | fix round 1 | b4e1612 (task branch) | review: 1 Important (14-day edge), spec miss |
| T6 setup, template, docs, CI | todo | | |
| Floor-9 batch | todo | | |

## Agents

Spawned: 6. Resumed: 2.

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
