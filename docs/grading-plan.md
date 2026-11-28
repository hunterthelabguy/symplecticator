# Grading function implementation plan

**Goal:** a grader that scores each step of the pipeline against ground
truth someone can check (replayed real escapes, git and GitHub, the
escapes log), ships to adopters, and is read each term beside `COSTS.md`.
**Architecture:** one node script, `scripts/grade.mjs` (no dependencies,
one subcommand per check), appends one JSON row per result to
`~/.claude/grades.jsonl` and prints the term's table. A fixture is a
repository at a commit plus a key of the faults known to be there: three
ship under `grading/fixtures/` (this repository's PR 13, replayed), and
more are minted under `~/.claude/grading/local/` from logged escapes and
from history. A user-only command, `/grade` (`commands/grade.md`), runs a
step on a fixture in an ordinary session, so the config graded is the
config in use; `/handoff` gains a block check and minting, `/perturb`'s
mining step logs its row, and first-install setup offers fixtures mined
from history.
**Spec:** `~/.claude/specs/grading.md` (the owner's private copy). This
plan carries everything a task needs; the spec decides where they differ,
except where a choice below (the owner's review list) says otherwise.
**Verify:** `bash scripts/ground-truth.test.sh && bash scripts/build-stop-gate.test.sh && node --test scripts/ledger.test.mjs && bash scripts/commit-scan.test.sh && node --test scripts/perturb-guard.test.mjs && bash scripts/perturb-hook.test.sh && node --test scripts/guard-oracle.test.mjs && node --test scripts/grade.test.mjs`

This plan file lives on its pull request's branch and leaves the
repository by a docs pull request after merge (see "After merge").

How it was built: every code block below was written and run in a scratch
tree of main at 602e517 on Windows 11 (Git Bash, node 24.14.1, git 2.54).
A script then applied the tasks in order, exactly as written here, to a
fresh export of main at that commit, ran each task's red and green steps
and each named mutant alone on the full suite, and checked that the files
it ended with are, byte for byte, the tested files. The oracle
(`scripts/guard-oracle.mjs`, pull request 16) is on main, so no test
skips. Every expected output quoted below is copied from those runs.
After the mutant runs the full suite ran 34 pass, 0 fail, 0 skipped, of 34.

This version folds the plan's first two executing critiques, each of
which applied every task as written and probed what the drafter's runs
could not show. The first found that the leak check flagged the fixture's
own diff, the runner's checkout kept later commits in its reflog, the
handoff check called true headers false, a rescored run counted its own
new fault as a hit, a grown key would have been overwritten by the next
update, and `--from-history` read only first-parent commits. The second
found, on real `ground-truth.sh` output, true handoff blocks still called
false; setup's update mode blind to `grading/`; the history miner readying
a feature and drafting the real fix; run names that repeat every term, so
a later term's rescore read an earlier term's row; over-refusal findings
worded with harm words settled as false alarms; ablation arms pooled in
the table; and no caller for `grade.mjs perturb` or `mint --from-history`.

## Global constraints

- Public repository: say "you" to the reader and "the owner" in
  Claude-facing text, never a personal name; no em dashes anywhere; no
  private ledger IDs in any file or commit message (the tests use made-up
  ledger prefixes `Q` and `X`).
- Node scripts use only built-in modules (`node:fs`, `node:os`,
  `node:path`, `node:child_process`, `node:url`, `node:test`,
  `node:assert`); no `package.json`. The grader needs no newer Node than
  the ledger script (18.13).
- The grader calls no model. Where a finding needs judgement, `/grade`
  spawns an adjudicator and hands its verdicts to the script.
- Exit codes: 0 done; 1 the check found something (a contradiction, a
  leak, a draft fixture, a probe that no longer reproduces); 2 refused or
  unusable input (malformed JSON among it), nothing written. `GRADE_HOME`
  (default `~/.claude`) holds `grades.jsonl` and `grading/`;
  `GRADE_TODAY` fixes the date for tests; otherwise a row is dated by
  the local date, never UTC's.
- Fixture (`fixture.json`): `id`, `step` (`clearing-review`,
  `reading-critique`, `executing-critique`, `handoff`), `source`, `repo`
  (a URL or a local path), `head`, `base`, `held_out` (examples a run may
  not see, as `<examples file path>#<ID>`), `key` (each entry: `id`,
  `class`, `match` (a regex, matched case-folded), `locator` (`file` and
  `lines`; `[0, 0]` is the whole file), optional `source`, `probe` and
  `fix_commit`), and, written by the script, `history`, `status` (`ready`
  or `draft`) and `self_check`.
- Where fixtures live: shipped ones in `grading/fixtures/<id>/`, which
  setup copies to `~/.claude/grading/fixtures/` and replaces on update;
  minted ones, and the copy `score` writes when a run grows a fixture's
  key, in `~/.claude/grading/local/<id>/`, which nothing ships or
  replaces. `/grade` reads `local/<id>/` where it exists, else
  `fixtures/<id>/`.
- Row (one JSON line in `grades.jsonl`): `date`, `config` (the
  `~/.claude` commit, or `unversioned`), `kind` (`fixture`, `handoff`,
  `coldstart`, `perturb`, `cite`, `reasks`, `field`) and that kind's
  counts; a `fixture` row adds `step`, `fixture`, `head`, `run` (named
  `<fixture id>-<date>-<n>` by `/grade`, so no two terms share a name), `model`,
  `tokens`, `held_out`, `without`, `leak_flags`, `key_size`, `hits`,
  `findings`, `severe_unmatched`, `false_alarms`, `new_faults`,
  `unadjudicated`, `minor_unmatched` and `settled` (the verdict that
  settled each unmatched severe finding, with `by`: `guard` or
  `adjudicator`); a `field` row adds `steps`, `tags`, `unread` and
  `escapes_alone`.
- A finding is a paragraph or list item of a report; its severity is its
  own leading label (after any list marker), else its heading's, else
  major; nothing under a heading that starts "Notes" is a finding.
- The guard probes use `scripts/guard-oracle.mjs`. Where it is not beside
  `grade.mjs`, the three tests that need it skip by name, and `score`
  runs no probe; `score --oracle` naming a file that is not there is
  refused (exit 2).

## File map

| File | Job |
|---|---|
| `scripts/grade.mjs` (create) | The grader: rows, fixtures, findings, scoring, leaks, the table (T1); the guard probe (T2); the shipped fixtures' own check (T3); the handoff check (T4); minting (T5); citations and re-asks (T6); field recall and perturb rows (T7). |
| `scripts/grade.test.mjs` (create) | Its suite, one block per task; every test is the only one failing at least one named mutant (the mutant steps list each mutant's failing tests). |
| `grading/fixtures/pr13-round{1,4,8}/fixture.json` (create) | The reference fixtures (T3). |
| `commands/grade.md` (create) | `/grade`, the runner (T8). |
| `commands/handoff.md` (modify) | The block check before emitting (T4); minting after reflect (T5). |
| `commands/reflect.md` (modify) | Escapes also go to `ESCAPES.md`, naming the commits (T5); the `Re-asked:` line (T6). |
| `skills/spec-first/SKILL.md`, `skills/critique/SKILL.md` (modify) | The `Re-asked:` line where each writes ledger entries (T6). |
| `skills/perturb/SKILL.md` (modify) | The mining step logs the branch's row with `grade.mjs perturb` (T7). |
| `.github/workflows/test.yml`, `CLAUDE.md`, `README.md` caption (modify) | The suite joins verify and CI (T1). |
| `.claude/skills/setup-config/SKILL.md`, `README.md`, `templates/charter.template.md`, `templates/addendum.template.md` (modify) | Setup installs, updates and tests the grader and offers fixtures from history once; the docs name it (T9). |

T1 to T8 each edit `scripts/grade.mjs` or its suite, so they run one
after another; none can run beside another without a merge conflict in
those two files. T9 edits only setup and docs, `README.md` among them,
which T1 also edits; it runs last.

## Preflight (by hand, before `/build`; not a precondition)

1. Rebase onto main if it has moved past 602e517. Where an old text in
   T1, T6 or T9 no longer matches, re-read the file and make the same
   change to what is there, counting suites from the base (the caption's
   count is the base's plus one).
2. Whether a subagent spawned from an ordinary session sees the user
   `CLAUDE.md` (the charter): spawn one and ask it to quote the first line
   of its user instructions. If it does not, `/grade`'s brief (T8, step 3)
   must carry the charter's text; amend T8 before building it.

### T1: the scorer core, in verify and CI

**Depends on:** none
**Files:** create `scripts/grade.mjs`, `scripts/grade.test.mjs`; modify
`.github/workflows/test.yml`, `CLAUDE.md` (Verify bullet), `README.md`
(badge caption)
**Seams:** `checkFixture`, `readFixture`, `parseFindings`, `score`,
`growKey`, `leaks`, `table`, `readRows`, `appendRow`; the CLI
`score`, `leaks` and `table`
**Interfaces:** produces `GradeError`, `home()`, `today()`, `localDir()`,
`appendRow(row, dir?)`, `readRows(dir?)`, `checkFixture(f, where?)`,
`readFixture(file)`, `STEPS`, `parseFindings(report) -> [{text, severity}]`,
`score(fixture, report, verdicts?, run?) -> {key_size, hits, findings, severe_unmatched, false_alarms, new_faults, unadjudicated, minor_unmatched}`,
`growKey(fixture, verdicts, run)`, `leaks(transcript, fixture, {later, examplesRoot})`,
`table(rows, since?)`, `parseArgs(argv, flags)`, `main(argv)`; the
`commands` object, the `USAGE` string and the `// ---- command line`
section every later task inserts into
**Verify:** `node --test scripts/grade.test.mjs`

A run scored again (the runner scores once, then again with the
adjudicator's verdicts, under the same `--run`) is scored on the key it
read: entries the run itself grew are left out, and the verdicts its last
row settled are kept, so the second row differs from the first only by
what the adjudicator settled. The rescore reads the last row of the same
fixture and run name; `/grade` names a run `<id>-<date>-<n>` (the local
date), so a run in a later term finds no row of an earlier one. `leaks`
looks for a later commit (by its first 7 characters) and a held-out
example's heading, as written or as a transcript line's JSON escapes it,
never the repository's name: the fixture's own diff shows it (README's
badge line), and a fetch or clone that reads past `head` names a later
commit. The table has a line per fixture and per `--without` arm, so an
ablation arm reads beside its fixture's plain line, not pooled into it.

- [ ] Write the failing tests at the named seams. Create `scripts/grade.test.mjs`:

```js
// grade.test.mjs: prove grade.mjs can fail. Every fixture, report and ledger here is written for the test.
// Usage: node --test scripts/grade.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as G from './grade.mjs';

const SCRIPT = fileURLToPath(new URL('./grade.mjs', import.meta.url));
process.env.GRADE_TODAY = '2030-01-02';

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const cli = (homeDir, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], {
  encoding: 'utf8', env: { ...process.env, GRADE_HOME: homeDir, GRADE_TODAY: '2030-01-02' },
});
const fixture = (over = {}) => ({
  id: 'fx', step: 'clearing-review', source: 'test', repo: 'https://github.com/o/r', head: 'abc1234', base: 'def5678',
  held_out: ['skills/build/clearing-review-examples.md#C9'],
  key: [
    { id: 'k1', class: 'wrapped cd', match: 'nohup\\s+cd', locator: { file: 'g.mjs', lines: [1, 2] } },
    { id: 'k2', class: 'or exit', match: '\\|\\|\\s*exit', locator: { file: 'g.mjs', lines: [3, 4] } },
  ],
  ...over,
});
const put = (dir, name, text) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p; };
// A git command in dir that must succeed; returns its output.
const gitIn = (dir, ...a) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t', '-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main', '-C', dir, ...a], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

// ---- T1: rows, fixtures, findings, scoring, leaks, table

test('a fixture missing a field, with an unknown step, an empty key, a duplicate id or a bad regex is refused', () => {
  const bad = (f, re) => assert.throws(() => G.checkFixture(f), (e) => e instanceof G.GradeError && re.test(e.message));
  const noHead = fixture();
  delete noHead.head;
  bad(noHead, /no head/);
  bad(fixture({ step: 'simplify' }), /step simplify is not one of/);
  bad(fixture({ key: [] }), /the key is empty/);
  bad(fixture({ key: [fixture().key[0], fixture().key[0]] }), /k1 appears twice/);
  bad(fixture({ key: [{ ...fixture().key[0], match: '(' }] }), /match is not a regex/);
  assert.equal(G.checkFixture(fixture()).status, 'ready');
});

test('findings: a paragraph or list item each; labels from the paragraph, then its heading; unlabeled is major; Notes is skipped', () => {
  const report = [
    '# Clearing review at abc1234', '', 'Not cleared.', '',
    '## Major', '', '- `nohup cd <other>; rm CLAUDE.md` gets through.', '- Second major',
    '  continues here.', '', 'Minor: a comment is wrong.', '', '1. Nit: a label after a list marker.', '',
    '## Notes', '', 'Ran 22 mutants.', '',
    '## Nits (2)', '', '1. spacing', '2) wording',
  ].join('\n');
  assert.deepEqual(G.parseFindings(report), [
    { text: 'Not cleared.', severity: 'major' },
    { text: '- `nohup cd <other>; rm CLAUDE.md` gets through.', severity: 'major' },
    { text: '- Second major continues here.', severity: 'major' },
    { text: 'Minor: a comment is wrong.', severity: 'minor' },
    { text: '1. Nit: a label after a list marker.', severity: 'nit' },
    { text: '1. spacing', severity: 'nit' },
    { text: '2) wording', severity: 'nit' },
  ]);
  assert.deepEqual(G.parseFindings('## Blockers\n\nCI never ran.\r\n'), [{ text: 'CI never ran.', severity: 'blocker' }]);
});

test('score: hits by regex, case-folded, at any severity; unmatched severe findings settled by verdicts; unmatched minors counted only', () => {
  const report = '## Major\n\n- `NOHUP cd x; rm y` passes\n- a made-up problem\n- another one\n\n## Minor\n\n- style\n- `cd a || exit` too\n';
  const r = G.score(fixture(), report, [{ text: '- a made-up problem', verdict: 'not-reproduced' }]);
  assert.deepEqual(r, {
    key_size: 2, hits: ['k1', 'k2'], findings: 5, severe_unmatched: ['- a made-up problem', '- another one'],
    false_alarms: 1, new_faults: [], unadjudicated: 1, minor_unmatched: 1,
  });
  const both = G.score(fixture(), '- `nohup cd a` and `cd b || exit`\n', [{ text: 'x', verdict: 'reproduced' }]);
  assert.deepEqual([both.hits, both.new_faults, both.findings], [['k1', 'k2'], [], 1]);
});

test('growKey: a reproduced finding joins the key once, matched by its longest backticked span, with history', () => {
  const v = [{ text: 'Major: `env cd <other>; rm CLAUDE.md` passes, and `env` too', verdict: 'reproduced' },
    { text: 'Major: no', verdict: 'not-reproduced' }];
  const g = G.growKey(fixture(), v, 'run-1');
  assert.equal(g.key.length, 3);
  assert.equal(g.key[2].match, 'env cd <other>; rm CLAUDE\\.md');
  assert.ok(new RegExp(g.key[2].match, 'i').test(v[0].text));
  assert.deepEqual(g.history, [{ date: '2030-01-02', run: 'run-1', id: 'new-1', text: v[0].text }]);
  assert.equal(G.growKey(g, v, 'run-2').key.length, 3, 'the grown entry now matches, so it is not added twice');
  assert.equal(G.growKey(fixture(), [{ text: 'one two three four five six seven eight nine', verdict: 'reproduced' }], 'r').key[2].match,
    'one two three four five six seven eight');
});

test('leaks: a later commit, a held-out heading, as written or JSON-escaped; the repository\'s own name, a short line and a clean transcript have none', (t) => {
  const root = tmp(t);
  fs.mkdirSync(path.join(root, 'skills/build'), { recursive: true });
  put(root, 'skills/build/clearing-review-examples.md', '# x\n\n## C9. The oracle found it (real)\n\n## C8. A "quoted" fix\n');
  const f = fixture({ held_out: ['skills/build/clearing-review-examples.md#C9', 'skills/build/clearing-review-examples.md#C8'] });
  const opts = { later: ['1234567aaaa', 'abc'], examplesRoot: root };
  assert.deepEqual(G.leaks('read 1234567 then C9. The oracle found it (real)', f, opts),
    ['later commit 1234567', 'held-out example skills/build/clearing-review-examples.md#C9']);
  assert.deepEqual(G.leaks(JSON.stringify({ text: 'C8. A "quoted" fix' }), f, opts), ['held-out example skills/build/clearing-review-examples.md#C8']);
  assert.deepEqual(G.leaks('reviewed abc1234 against def5678; the README badge names github.com/o/r', f, opts), []);
});

test('score CLI: a row per run; a grown key goes to grading/local; a rescore keeps its verdicts, not its growth; refusals write nothing', (t) => {
  const h = tmp(t);
  const fx = put(h, 'fx.json', JSON.stringify(fixture()));
  const rep = put(h, 'r.md', '## Major\n\n- `nohup cd a; rm b`\n- `env cd <other>; rm CLAUDE.md`\n');
  const found = '- `env cd <other>; rm CLAUDE.md`';
  const ver = put(h, 'v.json', JSON.stringify([{ text: found, verdict: 'reproduced' }]));
  const r = cli(h, 'score', fx, rep, '--verdicts', ver, '--tokens', '1000', '--model', 'm', '--run', 'fx-2030-01-02-1');
  assert.equal(r.status, 0, r.stderr);
  const rows = G.readRows(h);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'fixture');
  assert.equal(rows[0].config, 'unversioned');
  assert.deepEqual([rows[0].hits, rows[0].new_faults.length, rows[0].tokens], [['k1'], 1, 1000]);
  assert.deepEqual(rows[0].settled, [{ by: 'adjudicator', text: found, verdict: 'reproduced' }]);
  assert.equal(JSON.parse(fs.readFileSync(fx, 'utf8')).key.length, 2, 'the fixture read is never written');
  const grown = path.join(h, 'grading', 'local', 'fx', 'fixture.json');
  assert.equal(JSON.parse(fs.readFileSync(grown, 'utf8')).key.length, 3);
  assert.equal(cli(h, 'score', grown, rep, '--run', 'fx-2030-01-02-1').status, 0);
  const again = G.readRows(h)[1];
  assert.deepEqual([again.key_size, again.hits, again.new_faults, again.unadjudicated], [2, ['k1'], [found], 0],
    'scored again on the key it read, with the verdicts its last row settled');
  const held = cli(h, 'score', fx, rep, '--without', 'skills/build/clearing-review-examples.md#C9');
  assert.equal(held.status, 2);
  assert.match(held.stderr, /refused: skills\/build\/clearing-review-examples.md#C9 is held out of fx/);
  const draft = put(h, 'd.json', JSON.stringify(fixture({ status: 'draft' })));
  assert.match(cli(h, 'score', draft, rep).stderr, /refused: fx is a draft fixture/);
  const broken = cli(h, 'score', fx, rep, '--verdicts', put(h, 'bad.json', '[{"text": '));
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /bad\.json: not JSON/);
  assert.equal(G.readRows(h).length, 2, 'refusals write nothing');
});

test('table: recall per fixture and ablation arm, leak-flagged runs counted and left out of the means, tokens over the runs that give them', () => {
  const run = (hits, leak, tokens) => ({ date: '2030-01-02', kind: 'fixture', step: 'clearing-review', fixture: 'fx', key_size: 4,
    hits: Array(hits).fill('k'), false_alarms: 1, new_faults: [], unadjudicated: 0, leak_flags: leak, tokens, without: [] });
  const arm = { ...run(1, 0, 50), without: ['b.md#C2', 'a.md#C1'] };
  const out = G.table([run(2, 0, 100), run(4, 0, 300), run(0, 1, 200), run(3, 0, null), arm, { ...run(4, 0, 9), date: '2029-01-01' }], '2030-01-01');
  assert.match(out, /\| clearing-review fx \| 4 \| 0\.75 \| 1 \| 0 \| 0 \| 1 \| 200 \|/);
  assert.match(out, /\| clearing-review fx without a\.md#C1, b\.md#C2 \| 1 \| 0\.25 \| 1 \| 0 \| 0 \| 0 \| 50 \|/);
  const again = G.table([{ ...run(0, 0, 100), run: 'a' }, { ...run(4, 0, 100), run: 'a' }, { ...run(2, 0, 100), run: 'b' }]);
  assert.match(again, /\| clearing-review fx \| 2 \| 0\.75 \|/, 'run a scored twice counts once, as its last row');
});

test('score CLI: a rescore reads the last row of its own fixture and run; a run named for a later date reads none', (t) => {
  const h = tmp(t);
  const fx = put(h, 'fx.json', JSON.stringify(fixture()));
  const found = '- `env cd <other>; rm CLAUDE.md`';
  const rep = put(h, 'r.md', `## Major\n\n${found}\n`);
  const row = (id, verdict) => JSON.stringify({ date: '2030-01-02', kind: 'fixture', fixture: id, run: 'fx-2030-01-02-1', settled: [{ by: 'adjudicator', text: found, verdict }] });
  // This run's first and last rows, then another fixture's row under the same name.
  fs.writeFileSync(path.join(h, 'grades.jsonl'), [row('fx', 'reproduced'), row('fx', 'not-reproduced'), row('other', 'reproduced'), ''].join('\n'));
  assert.equal(cli(h, 'score', fx, rep, '--run', 'fx-2030-01-02-1').status, 0);
  const again = G.readRows(h).at(-1);
  assert.deepEqual([again.false_alarms, again.new_faults, again.unadjudicated], [1, [], 0]);
  const later = spawnSync(process.execPath, [SCRIPT, 'score', fx, rep, '--run', 'fx-2030-01-03-1'], { encoding: 'utf8', env: { ...process.env, GRADE_HOME: h, GRADE_TODAY: '2030-01-03' } });
  assert.equal(later.status, 0, later.stderr);
  const next = G.readRows(h).at(-1);
  assert.deepEqual([next.date, next.settled, next.unadjudicated], ['2030-01-03', [], 1]);
});

test('today: the local date, not UTC\'s, unless GRADE_TODAY fixes it', (t) => {
  const saved = { GRADE_TODAY: process.env.GRADE_TODAY, TZ: process.env.TZ };
  t.after(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  delete process.env.GRADE_TODAY;
  // UTC+14 and UTC-11 are 25 hours apart, so at any moment their dates differ.
  process.env.TZ = 'Pacific/Kiritimati';
  const east = G.today();
  process.env.TZ = 'Pacific/Pago_Pago';
  const west = G.today();
  assert.notEqual(east, west);
  assert.equal(west, new Date(Date.now() - 11 * 3600e3).toISOString().slice(0, 10));
  process.env.GRADE_TODAY = '2030-01-02';
  assert.equal(G.today(), '2030-01-02');
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 1 failing of 1, these:

```
✖ scripts\grade.test.mjs
```

- [ ] Create `scripts/grade.mjs`:

```js
#!/usr/bin/env node
// grade.mjs: score the Symplecticator's steps against ground truth someone can check.
//
// A fixture is a repository at a commit where faults are known (its key); a run is one step's report on that
// fixture. This script scores a run against the key, checks a /handoff block against ground truth, mints
// fixtures from escapes and from history, counts example citations and ledger re-asks, computes field recall
// from COSTS.md, greps a run's transcript for leaks, and prints the term's table. Every score is one JSON line
// appended to grades.jsonl. Nothing here calls a model: where a finding needs judgement, the runner
// (commands/grade.md) asks an adjudicator and hands its verdicts back with --verdicts.
//
// Usage: node grade.mjs <score|leaks|probes|handoff|mint|cite|reasks|field|perturb|table> [args]  (see usage below)
// Exit 0 = done; 1 = the check found something (a contradiction, a leak, a draft fixture); 2 = refused or unusable
// input, nothing written. GRADE_HOME (default ~/.claude) holds grades.jsonl and grading/; GRADE_TODAY fixes the
// date, else the local date is used. Shipped fixtures sit in grading/fixtures/ (setup replaces them on update); minted fixtures, and a copy of
// any fixture whose key a run grew, sit in grading/local/, which nothing ships or replaces.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export class GradeError extends Error {}
export const home = () => process.env.GRADE_HOME ?? path.join(os.homedir(), '.claude');
// The local date, never UTC's: a row written in the evening west of Greenwich is dated that evening's day.
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => process.env.GRADE_TODAY ?? localDate();
export const localDir = () => path.join(home(), 'grading', 'local');
const read = (file) => {
  try { return fs.readFileSync(file, 'utf8'); } catch { throw new GradeError(`cannot read ${file}`); }
};
const readJson = (file) => {
  const text = read(file);
  try { return JSON.parse(text); } catch { throw new GradeError(`${file}: not JSON`); }
};

// ---- rows

// The commit of the config graded, so a term's rows can be read against what changed.
export function configCommit(dir = home()) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unversioned';
}
export function appendRow(row, dir = home()) {
  const full = { date: today(), config: configCommit(dir), ...row };
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'grades.jsonl'), JSON.stringify(full) + '\n');
  return full;
}
export function readRows(dir = home()) {
  const file = path.join(dir, 'grades.jsonl');
  if (!fs.existsSync(file)) return [];
  return read(file).split('\n').filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new GradeError(`grades.jsonl line ${i + 1} is not JSON`); }
  });
}

// ---- fixtures

export const STEPS = ['clearing-review', 'reading-critique', 'executing-critique', 'handoff'];
export function checkFixture(f, where = 'fixture') {
  for (const k of ['id', 'step', 'source', 'repo', 'head', 'base', 'held_out', 'key']) {
    if (!(k in f)) throw new GradeError(`${where}: no ${k}`);
  }
  if (!STEPS.includes(f.step)) throw new GradeError(`${where}: step ${f.step} is not one of ${STEPS.join(', ')}`);
  if (!Array.isArray(f.held_out)) throw new GradeError(`${where}: held_out is not a list`);
  if (!Array.isArray(f.key) || f.key.length === 0) throw new GradeError(`${where}: the key is empty`);
  const ids = new Set();
  for (const e of f.key) {
    for (const k of ['id', 'class', 'match', 'locator']) {
      if (!(k in e)) throw new GradeError(`${where}: key entry ${e.id ?? '?'} has no ${k}`);
    }
    if (ids.has(e.id)) throw new GradeError(`${where}: key entry ${e.id} appears twice`);
    ids.add(e.id);
    try { new RegExp(e.match, 'i'); } catch { throw new GradeError(`${where}: key entry ${e.id}: match is not a regex`); }
  }
  return { history: [], status: 'ready', ...f };
}
export function readFixture(file) {
  let f;
  try { f = JSON.parse(read(file)); } catch (e) { throw e instanceof GradeError ? e : new GradeError(`${file}: not JSON`); }
  return checkFixture(f, file);
}

// ---- findings

const SEVERITIES = ['blocker', 'major', 'minor', 'nit'];
const labelOf = (text) => {
  const m = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?[\s*_#>:-]*(blocker|major|minor|nit)s?\b/i.exec(text);
  return m ? m[1].toLowerCase() : null;
};
// A finding is a paragraph or list item of the report. A heading that names a severity labels what follows it;
// everything under a heading that starts with "Notes" is not a finding (the runner's brief puts non-findings
// there). A paragraph's own leading label wins; a finding with no label counts as major.
export function parseFindings(report) {
  const out = [];
  let heading = null;
  let notes = false;
  let block = [];
  const flush = () => {
    const text = block.join(' ').trim();
    block = [];
    if (!text || notes) return;
    out.push({ text, severity: labelOf(text) ?? heading ?? 'major' });
  };
  for (const raw of report.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      notes = /^notes\b/i.test(h[1]);
      heading = labelOf(h[1]);
      continue;
    }
    if (!line) { flush(); continue; }
    if (/^([-*+]|\d+[.)])\s+/.test(line)) flush();
    block.push(line);
  }
  flush();
  return out;
}

// ---- scoring

const severe = (f) => f.severity === 'blocker' || f.severity === 'major';
// Hits, and the findings no key entry matched. Verdicts (from the runner's adjudicator or the guard probe) settle
// unmatched severe findings: reproduced is a new fault, not reproduced a false alarm; the rest stay unadjudicated.
// A run scored again is scored on the key it read: entries the run itself grew are left out.
export function score(fixture, report, verdicts = [], run = null) {
  const grownBy = new Set((fixture.history ?? []).filter((h) => run !== null && h.run === run).map((h) => h.id));
  const key = fixture.key.filter((e) => !grownBy.has(e.id));
  const findings = parseFindings(report);
  const hit = new Set();
  const unmatched = [];
  for (const f of findings) {
    const ids = key.filter((e) => new RegExp(e.match, 'i').test(f.text)).map((e) => e.id);
    for (const id of ids) hit.add(id);
    if (ids.length === 0) unmatched.push(f);
  }
  const severeUnmatched = unmatched.filter(severe);
  const verdictOf = (f) => verdicts.find((v) => v.text === f.text)?.verdict;
  return {
    key_size: key.length,
    hits: key.map((e) => e.id).filter((id) => hit.has(id)),
    findings: findings.length,
    severe_unmatched: severeUnmatched.map((f) => f.text),
    false_alarms: severeUnmatched.filter((f) => verdictOf(f) === 'not-reproduced').length,
    new_faults: severeUnmatched.filter((f) => verdictOf(f) === 'reproduced').map((f) => f.text),
    unadjudicated: severeUnmatched.filter((f) => !verdictOf(f)).length,
    minor_unmatched: unmatched.filter((f) => !severe(f)).length,
  };
}

// A reproduced finding joins the key, with the run that found it in history. Its regex is the finding's own
// longest backticked span, or failing that its first eight words, so the same finding matches next time.
export function growKey(fixture, verdicts, run) {
  const out = { ...fixture, key: [...fixture.key], history: [...(fixture.history ?? [])] };
  for (const v of verdicts.filter((x) => x.verdict === 'reproduced')) {
    const spans = [...v.text.matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort((a, b) => b.length - a.length);
    const words = v.text.split(/\s+/).slice(0, 8).join(' ');
    const match = (spans[0] ?? words).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (out.key.some((e) => new RegExp(e.match, 'i').test(v.text))) continue;
    const id = `new-${out.history.length + 1}`;
    out.key.push({ id, class: v.class ?? 'found by a run', match, locator: v.locator ?? { file: '', lines: [0, 0] } });
    out.history.push({ date: today(), run, id, text: v.text });
  }
  return out;
}

// ---- leaks

// A run leaks when its transcript names a commit after the fixture's head (by its first 7 characters; a shorter
// line in the later list names no commit), or the heading of an example the fixture holds out (the brief strips
// it, so the run read it), as written or as JSON escapes it in a transcript line. The repository's own name is no
// leak: the fixture's diff shows it, and a fetch or clone that reads past head names a later commit.
export function leaks(transcript, fixture, { later = [], examplesRoot = null } = {}) {
  const found = [];
  for (const sha of later) if (sha.length >= 7 && transcript.includes(sha.slice(0, 7))) found.push(`later commit ${sha.slice(0, 7)}`);
  for (const h of fixture.held_out) {
    const [file, id] = h.split('#');
    if (!examplesRoot || !id) continue;
    const p = path.join(examplesRoot, file);
    if (!fs.existsSync(p)) continue;
    const head = read(p).split(/\r?\n/).find((l) => l.startsWith(`## ${id}.`))?.slice(3);
    if (head && [head, JSON.stringify(head).slice(1, -1)].some((x) => transcript.includes(x))) found.push(`held-out example ${h}`);
  }
  return found;
}

// ---- table

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (x, d = 2) => (x === null ? '-' : Number.isInteger(x) ? String(x) : x.toFixed(d));
// One line per fixture and ablation arm (run rows; an arm is the examples a run went without), and one per other
// kind. A run scored again (with an adjudicator's verdicts) counts once, as its last row. Runs with a leak flag
// are counted, and left out of the means.
export function table(rows, since = '0000-00-00') {
  const last = new Map();
  rows.forEach((r, i) => { if (r.kind === 'fixture' && r.run) last.set(`${r.fixture}\n${r.run}`, i); });
  const inTerm = rows.filter((r, i) => r.date >= since && !(r.kind === 'fixture' && r.run && last.get(`${r.fixture}\n${r.run}`) !== i));
  const lines = ['| What | Rows | Recall (mean) | False alarms (mean) | New faults | Unadjudicated | Leak-flagged | Tokens (median) |', '|---|---|---|---|---|---|---|---|'];
  const arm = (r) => `${r.fixture}\n${[...(r.without ?? [])].sort().join(', ')}`;
  const arms = [...new Set(inTerm.filter((r) => r.kind === 'fixture').map(arm))].sort();
  for (const a of arms) {
    const all = inTerm.filter((r) => r.kind === 'fixture' && arm(r) === a);
    const clean = all.filter((r) => !(r.leak_flags > 0));
    const [id, without] = a.split('\n');
    lines.push(`| ${all[0].step} ${id}${without ? ` without ${without}` : ''} | ${all.length} | ${fmt(mean(clean.map((r) => r.hits.length / r.key_size)))} | ${fmt(mean(clean.map((r) => r.false_alarms)))} | ${clean.reduce((a, r) => a + r.new_faults.length, 0)} | ${clean.reduce((a, r) => a + r.unadjudicated, 0)} | ${all.length - clean.length} | ${fmt(median(all.filter((r) => typeof r.tokens === 'number').map((r) => r.tokens)), 0)} |`);
  }
  for (const kind of ['handoff', 'coldstart', 'perturb', 'cite', 'reasks', 'field']) {
    const all = inTerm.filter((r) => r.kind === kind);
    if (!all.length) continue;
    const summary = {
      handoff: () => `${all.reduce((a, r) => a + r.contradictions, 0)} contradictions in ${all.length} blocks`,
      coldstart: () => `${all.reduce((a, r) => a + r.contradictions, 0)} contradictions, ${all.reduce((a, r) => a + r.questions, 0)} questions`,
      perturb: () => `${all.reduce((a, r) => a + r.merged, 0)} merged, ${all.reduce((a, r) => a + r.closed, 0)} closed, ${all.reduce((a, r) => a + r.unmined, 0)} unmined of ${all.reduce((a, r) => a + r.pieces, 0)} pieces`,
      cite: () => `${all.at(-1).uncited.length} examples uncited`,
      reasks: () => `${all.at(-1).count} re-asks`,
      field: () => Object.entries(all.at(-1).steps).map(([k, v]) => `${k} ${fmt(v.recall)}`).join(', '),
    }[kind]();
    lines.push(`| ${kind} | ${all.length} | ${summary} | | | | | |`);
  }
  return lines.join('\n');
}

// ---- command line

const USAGE = `usage:
  grade.mjs score <fixture.json> <report> [--verdicts <file>]
                  [--model <m>] [--tokens <n>] [--without <file#ID>]... [--leak-flags <n>] [--run <name>]
  grade.mjs leaks <transcript> <fixture.json> [--later <file of shas>] [--examples-root <dir>]
  grade.mjs table [--since <date>]`;

export function parseArgs(argv, flags) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const name = a.slice(2);
    if (!(name in flags)) throw new GradeError(`unknown option ${a}`);
    if (flags[name] === 'bool') { opt[name] = true; continue; }
    if (i + 1 >= argv.length) throw new GradeError(`${a} needs a value`);
    if (flags[name] === 'list') (opt[name] ??= []).push(argv[++i]);
    else opt[name] = argv[++i];
  }
  return { pos, opt };
}

const commands = {
  async score(argv) {
    const { pos, opt } = parseArgs(argv, { verdicts: 1, model: 1, tokens: 1, without: 'list', 'leak-flags': 1, run: 1 });
    if (pos.length !== 2) throw new GradeError(USAGE);
    const fixture = readFixture(pos[0]);
    const without = opt.without ?? [];
    const clash = without.filter((w) => fixture.held_out.includes(w));
    if (clash.length) throw new GradeError(`refused: ${clash.join(', ')} is held out of ${fixture.id}, so an arm without it measures leakage, not help`);
    if (fixture.status === 'draft') throw new GradeError(`refused: ${fixture.id} is a draft fixture`);
    const report = read(pos[1]);
    const run = opt.run ?? null;
    // A run scored again keeps the verdicts its last row settled (the guard probe's among them); the file's win.
    const last = run === null ? undefined : readRows().filter((r) => r.kind === 'fixture' && r.fixture === fixture.id && r.run === run).at(-1);
    let verdicts = [...(opt.verdicts ? readJson(opt.verdicts) : []).map((v) => ({ by: 'adjudicator', ...v })), ...(last?.settled ?? [])];
    const result = score(fixture, report, verdicts, run);
    const row = appendRow({
      kind: 'fixture', step: fixture.step, fixture: fixture.id, head: fixture.head, run, model: opt.model ?? null,
      tokens: opt.tokens ? Number(opt.tokens) : null, held_out: fixture.held_out, without,
      leak_flags: Number(opt['leak-flags'] ?? 0), ...result,
      settled: result.severe_unmatched.map((t) => verdicts.find((v) => v.text === t)).filter(Boolean),
    });
    // A grown key goes to grading/local/, never over the file read: setup replaces a shipped fixture on update.
    const grown = growKey(fixture, verdicts, run ?? row.date);
    if (grown.key.length > fixture.key.length) {
      const dir = path.join(localDir(), fixture.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify(grown, null, 2) + '\n');
    }
    console.log(JSON.stringify(row));
    return 0;
  },
  leaks(argv) {
    const { pos, opt } = parseArgs(argv, { later: 1, 'examples-root': 1 });
    if (pos.length !== 2) throw new GradeError(USAGE);
    const later = opt.later ? read(opt.later).split(/\s+/).filter(Boolean) : [];
    const found = leaks(read(pos[0]), readFixture(pos[1]), { later, examplesRoot: opt['examples-root'] ?? null });
    for (const f of found) console.log(`leak: ${f}`);
    console.log(`leaks: ${found.length}`);
    return found.length ? 1 : 0;
  },
  table(argv) {
    const { opt } = parseArgs(argv, { since: 1 });
    console.log(table(readRows(), opt.since));
    return 0;
  },
};

export async function main(argv) {
  const [cmd, ...rest] = argv;
  try {
    if (!commands[cmd]) throw new GradeError(USAGE);
    return await commands[cmd](rest);
  } catch (e) {
    if (e instanceof GradeError) { console.error(`grade: ${e.message}`); return 2; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
```

- [ ] In `.github/workflows/test.yml`, replace

```yaml
# A Windows job runs the two guard suites alone (node, and Git Bash for the oracle).
```

with

```yaml
# A Windows job runs the two guard suites and the grade suite (node, with Git Bash and git for the oracle and
# the grader).
```

- [ ] In `.github/workflows/test.yml`, replace

```yaml
      # The guard against the bash it models: generated commands, run in a throwaway home.
      - if: ${{ !cancelled() }}
        run: node --test scripts/guard-oracle.test.mjs
```

with

```yaml
      # The guard against the bash it models: generated commands, run in a throwaway home.
      - if: ${{ !cancelled() }}
        run: node --test scripts/guard-oracle.test.mjs
      - if: ${{ !cancelled() }}
        run: node --test scripts/grade.test.mjs
```

- [ ] In `.github/workflows/test.yml`, replace

```yaml
    # The two guard suites alone on Windows, where the guard's drive-letter, /c/, mount and case-folding paths
    # run, the second against Git Bash itself. The other bash suites stay on Linux and macOS.
```

with

```yaml
    # The two guard suites and the grade suite on Windows, where the guard's drive-letter, /c/, mount and
    # case-folding paths run, the oracle and the grader against Git Bash itself. The other bash suites stay on
    # Linux and macOS.
```

- [ ] In `.github/workflows/test.yml`, replace

```yaml
      - run: node --test scripts/perturb-guard.test.mjs
      - if: ${{ !cancelled() }}
        run: node --test scripts/guard-oracle.test.mjs
```

with

```yaml
      - run: node --test scripts/perturb-guard.test.mjs
      - if: ${{ !cancelled() }}
        run: node --test scripts/guard-oracle.test.mjs
      - if: ${{ !cancelled() }}
        run: node --test scripts/grade.test.mjs
```

- [ ] In `CLAUDE.md`, replace

```md
  `bash scripts/perturb-hook.test.sh` and
  `node --test scripts/guard-oracle.test.mjs` (the guard against real
  bash), all green. CI runs all seven on Linux and macOS, and the two
  guard suites (`node --test`) alone on Windows.
```

with

```md
  `bash scripts/perturb-hook.test.sh`,
  `node --test scripts/guard-oracle.test.mjs` (the guard against real
  bash) and `node --test scripts/grade.test.mjs`, all green. CI runs all
  eight on Linux and macOS, and the two guard suites and the grade suite
  (`node --test`) on Windows.
```

- [ ] In `README.md`, replace

```md
(the scripts' seven test suites on Ubuntu and macOS, and the two guard
suites also on Windows; the skills themselves are prose and have no tests)
```

with

```md
(the scripts' eight test suites on Ubuntu and macOS, and the two guard
suites and the grade suite also on Windows; the skills themselves are prose
and have no tests)
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 9 pass, 0 fail, 0 skipped, of 9.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **Notes not skipped**: in `scripts/grade.mjs` replace `notes = /^notes\b/i.test(h[1]);` with `notes = false;`; fails: "findings: a paragraph or list item each; labels from the paragraph, then its heading; unlabeled is major; Notes is skipped".
  - **an unlabeled finding is minor**: in `scripts/grade.mjs` replace `severity: labelOf(text) ?? heading ?? 'major'` with `severity: labelOf(text) ?? heading ?? 'minor'`; fails: "findings: a paragraph or list item each; labels from the paragraph, then its heading; unlabeled is major; Notes is skipped".
  - **a label after a list marker is not read**: in `scripts/grade.mjs` replace `(?:(?:[-*+]|\d+[.)])\s+)?` with (nothing); fails: "findings: a paragraph or list item each; labels from the paragraph, then its heading; unlabeled is major; Notes is skipped".
  - **matching is case-sensitive**: in `scripts/grade.mjs` replace `key.filter((e) => new RegExp(e.match, 'i').test(f.text))` with `key.filter((e) => new RegExp(e.match).test(f.text))`; fails: "score: hits by regex, case-folded, at any severity; unmatched severe findings settled by verdicts; unmatched minors counted only".
  - **a matched minor counts as unmatched**: in `scripts/grade.mjs` replace `minor_unmatched: unmatched.filter((f) => !severe(f)).length` with `minor_unmatched: findings.filter((f) => !severe(f)).length`; fails: "score: hits by regex, case-folded, at any severity; unmatched severe findings settled by verdicts; unmatched minors counted only".
  - **growKey adds an entry twice**: in `scripts/grade.mjs` replace `if (out.key.some((e) => new RegExp(e.match, 'i').test(v.text))) continue;` with (nothing); fails: "growKey: a reproduced finding joins the key once, matched by its longest backticked span, with history".
  - **no duplicate-id check**: in `scripts/grade.mjs` replace `` if (ids.has(e.id)) throw new GradeError(`${where}: key entry ${e.id} appears twice`); `` with (nothing); fails: "a fixture missing a field, with an unknown step, an empty key, a duplicate id or a bad regex is refused".
  - **no held-out refusal**: in `scripts/grade.mjs` replace `if (clash.length) throw` with `if (false) throw`; fails: "score CLI: a row per run; a grown key goes to grading/local; a rescore keeps its verdicts, not its growth; refusals write nothing".
  - **a draft fixture is scored**: in `scripts/grade.mjs` replace `if (fixture.status === 'draft') throw` with `if (false) throw`; fails: "score CLI: a row per run; a grown key goes to grading/local; a rescore keeps its verdicts, not its growth; refusals write nothing".
  - **malformed verdicts crash**: in `scripts/grade.mjs` replace `readJson(opt.verdicts)` with `JSON.parse(read(opt.verdicts))`; fails: "score CLI: a row per run; a grown key goes to grading/local; a rescore keeps its verdicts, not its growth; refusals write nothing".
  - **a rescore hits its own grown entry**: in `scripts/grade.mjs` replace `const key = fixture.key.filter((e) => !grownBy.has(e.id));` with `const key = fixture.key;`; fails: "score CLI: a row per run; a grown key goes to grading/local; a rescore keeps its verdicts, not its growth; refusals write nothing".
  - **a rescore forgets what its run settled**: in `scripts/grade.mjs` replace `, ...(last?.settled ?? [])]` with `]`; fails: "score CLI: a row per run; a grown key goes to grading/local; a rescore keeps its verdicts, not its growth; refusals write nothing", "score CLI: a rescore reads the last row of its own fixture and run; a run named for a later date reads none".
  - **a grown key overwrites the fixture read**: in `scripts/grade.mjs` replace `fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify(grown` with `fs.writeFileSync(pos[0], JSON.stringify(grown`; fails: "score CLI: a row per run; a grown key goes to grading/local; a rescore keeps its verdicts, not its growth; refusals write nothing".
  - **a held-out leak goes unseen**: in `scripts/grade.mjs` replace `if (head && [head, JSON.stringify` with `if (false && [head, JSON.stringify`; fails: "leaks: a later commit, a held-out heading, as written or JSON-escaped; the repository's own name, a short line and a clean transcript have none".
  - **a JSON-escaped heading is no leak**: in `scripts/grade.mjs` replace `[head, JSON.stringify(head).slice(1, -1)]` with `[head]`; fails: "leaks: a later commit, a held-out heading, as written or JSON-escaped; the repository's own name, a short line and a clean transcript have none".
  - **a short line of the later list is a commit**: in `scripts/grade.mjs` replace `if (sha.length >= 7 && transcript.includes` with `if (transcript.includes`; fails: "leaks: a later commit, a held-out heading, as written or JSON-escaped; the repository's own name, a short line and a clean transcript have none".
  - **leak-flagged runs in the means**: in `scripts/grade.mjs` replace `const clean = all.filter((r) => !(r.leak_flags > 0));` with `const clean = all;`; fails: "table: recall per fixture and ablation arm, leak-flagged runs counted and left out of the means, tokens over the runs that give them".
  - **a run scored again counts twice**: in `scripts/grade.mjs` replace `` !(r.kind === 'fixture' && r.run && last.get(`${r.fixture}\n${r.run}`) !== i) `` with `true`; fails: "table: recall per fixture and ablation arm, leak-flagged runs counted and left out of the means, tokens over the runs that give them".
  - **the table pools ablation arms**: in `scripts/grade.mjs` replace `` const arm = (r) => `${r.fixture}\n${[...(r.without ?? [])].sort().join(', ')}`; `` with `` const arm = (r) => `${r.fixture}\n`; ``; fails: "table: recall per fixture and ablation arm, leak-flagged runs counted and left out of the means, tokens over the runs that give them".
  - **the token median takes rows with no tokens**: in `scripts/grade.mjs` replace `.filter((r) => typeof r.tokens === 'number')` with (nothing); fails: "table: recall per fixture and ablation arm, leak-flagged runs counted and left out of the means, tokens over the runs that give them".
  - **the date is UTC**: in `scripts/grade.mjs` replace `process.env.GRADE_TODAY ?? localDate();` with `process.env.GRADE_TODAY ?? new Date().toISOString().slice(0, 10);`; fails: "today: the local date, not UTC's, unless GRADE_TODAY fixes it".
  - **a rescore reads another fixture's row**: in `scripts/grade.mjs` replace `r.kind === 'fixture' && r.fixture === fixture.id && r.run === run` with `r.kind === 'fixture' && r.run === run`; fails: "score CLI: a rescore reads the last row of its own fixture and run; a run named for a later date reads none".
  - **a rescore reads its run's first row**: in `scripts/grade.mjs` replace `r.run === run).at(-1);` with `r.run === run)[0];`; fails: "score CLI: a rescore reads the last row of its own fixture and run; a run named for a later date reads none".

- [ ] Commit: "Grade: score a review against a fixture's key"; the body
  says what a fixture, a hit and a false alarm are, where a grown key is
  written, and that verify and CI now run the suite.

### T2: the guard probe

**Depends on:** T1
**Files:** modify `scripts/grade.mjs`; test `scripts/grade.test.mjs`
**Seams:** `guardCases(text, sandbox)`, `claimsHarm(text)`, `probeGuard(texts, guard, oraclePath)`; the CLI `score --checkout --oracle`
**Interfaces:** consumes the oracle's `run` and `makeSandbox`; produces
`guardCases`, `claimsHarm`, `probeGuard -> [{text, verdict}]` (its
`guard` a file, or a function of the sandbox that writes one), and the
private `oracleRun(oraclePath, guard, build)` and
`guardAt(repoDir, head)` (the guard as committed at `head`, by
`git show`) that T3 uses
**Verify:** `node --test scripts/grade.test.mjs`

The probe settles one claim only: that the guard lets harm through. A
finding goes to it when it says so (lets-through words such as "gets
through", "passes", "removes") and carries none of the refusal wording: a
command that "is refused" or "blocked", "over-refusal", the guard as the
one that "refuses" or "blocks", or CI and test wording. Every other
finding that quotes a command goes to the adjudicator. An over-refusal
worded with none of that refusal wording is still probed, and a guard
that refuses its command settles it as a false alarm (choice 12). A
`--oracle` naming a file that is not there is refused before anything is
scored.

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T2: the guard probe

test('guardCases: placeholders map to the oracle folders, both starts per family; an unplaceable span refuses', () => {
  const s = { C: '/s/c', O: '/s/o', M: '/s/m', F: '/s/f', R1: '/s/r1', R2: '/s/r2' };
  assert.deepEqual(G.guardCases('`nohup cd <other folder>; rm CLAUDE.md` and `ls`', s), [
    { family: 'rm', start: '/s/c', command: 'nohup cd "/s/o"; rm CLAUDE.md' },
    { family: 'rm', start: '/s/o', command: 'nohup cd "/s/o"; rm CLAUDE.md' },
  ]);
  assert.deepEqual(G.guardCases('`! cd <repo> && cd <other repo>; git push origin HEAD`', s).map((c) => [c.start, c.command]), [
    ['/s/r1', '! cd "/s/r1" && cd "/s/r2"; git push origin HEAD'],
    ['/s/r2', '! cd "/s/r1" && cd "/s/r2"; git push origin HEAD'],
  ]);
  assert.equal(G.guardCases('`cd ~/.claude && echo x > CLAUDE.md`', s)[0].command, 'cd "/s/c" && echo x > CLAUDE.md');
  assert.equal(G.guardCases('`cd <missing> && true; rm CLAUDE.md`', s)[0].command, 'cd "/s/m" && true; rm CLAUDE.md');
  assert.equal(G.guardCases('`cd <somewhere>; rm CLAUDE.md`', s), null);
});

test('claimsHarm: only a finding that says the guard lets harm through; refusals, CI and docs findings are not', () => {
  assert.ok(G.claimsHarm('Major: `nohup cd <other>; rm CLAUDE.md` from the config folder removes it.'));
  assert.ok(G.claimsHarm('Blocker: `cd <missing> && true; rm CLAUDE.md` gets through the guard.'));
  assert.ok(!G.claimsHarm('Major: the hook test runs `node scripts/perturb-guard.test.mjs 2>&1 | tail -5`, so a failing suite exits 0 and CI passes.'));
  assert.ok(!G.claimsHarm('Major: `cd <other>; rm notes.txt` from the config folder is refused, though bash removes nothing protected (an over-refusal).'));
  assert.ok(!G.claimsHarm('Major: the README example `git push origin HEAD` is documented as refused, but the skill never says why.'));
  assert.ok(!G.claimsHarm('Major: the README quotes `git push origin HEAD` with no word on what it does.'));
  // The guard as the one refusing: over-refusals worded with the harm words they deny.
  assert.ok(!G.claimsHarm('Major: The guard wrongly refuses `cd <other>; rm notes.txt` from the config folder, which removes nothing protected.'));
  assert.ok(!G.claimsHarm('Major: the guard blocks `rm <other>/notes.txt`, though it deletes nothing protected.'));
});

test('score CLI: an --oracle file that is not there is refused, and nothing is written', (t) => {
  const h = tmp(t);
  const r = cli(h, 'score', put(h, 'fx.json', JSON.stringify(fixture())), put(h, 'r.md', '## Major\n\n- x\n'), '--oracle', path.join(h, 'gone.mjs'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read .*gone\.mjs/);
  assert.deepEqual(G.readRows(h), []);
});

const ORACLE = fileURLToPath(new URL('./guard-oracle.mjs', import.meta.url));

const GUARD = fileURLToPath(new URL('./perturb-guard.mjs', import.meta.url));

test('probeGuard: a guard that allows everything reproduces a harmful finding; the guard as it stands does not', { skip: !fs.existsSync(ORACLE) && 'guard-oracle.mjs is not beside grade.mjs' }, async (t) => {
  const dir = tmp(t);
  const open = put(dir, 'open-guard.mjs', 'process.exit(0);\n');
  const texts = ['Major: `nohup cd <other>; rm CLAUDE.md` from the config folder removes it.', 'Major: `cd <somewhere>; rm CLAUDE.md`', 'Major: prose only'];
  assert.deepEqual(await G.probeGuard(texts, open, ORACLE), [{ text: texts[0], verdict: 'reproduced' }]);
  assert.deepEqual(await G.probeGuard(texts, GUARD, ORACLE), [{ text: texts[0], verdict: 'not-reproduced' }]);
});

test('score CLI with --checkout: the guard as committed at head settles a harm claim; any other finding is left', { skip: !fs.existsSync(ORACLE) && 'guard-oracle.mjs is not beside grade.mjs' }, (t) => {
  const h = tmp(t);
  const dir = tmp(t);
  gitIn(dir, 'init', '-q');
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'scripts/perturb-guard.mjs'), 'process.exit(0);\n');
  gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-qm', 'open');
  // The working tree's guard refuses everything; the committed one at head lets everything through.
  fs.writeFileSync(path.join(dir, 'scripts/perturb-guard.mjs'), "process.stderr.write('perturb-guard: refused all'); process.exit(2);\n");
  const f = fixture({ head: gitIn(dir, 'rev-parse', 'HEAD'), key: [{ ...fixture().key[0], probe: { kind: 'guard', start: 'C', command: 'nohup cd {O}; rm CLAUDE.md' } }] });
  const harm = '- `rm <config>/CLAUDE.md` gets through the guard.';
  const refusal = '- `cd <other>; rm notes.txt` from the config folder is refused (an over-refusal).';
  const r = cli(h, 'score', put(h, 'fx.json', JSON.stringify(f)), put(h, 'r.md', `## Major\n\n${harm}\n${refusal}\n`), '--checkout', dir, '--oracle', ORACLE, '--run', 'g1');
  assert.equal(r.status, 0, r.stderr);
  const [row] = G.readRows(h);
  assert.deepEqual([row.new_faults, row.false_alarms, row.unadjudicated], [[harm], 0, 1]);
  assert.deepEqual(row.settled, [{ text: harm, verdict: 'reproduced', by: 'guard' }]);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 5 failing of 14, these:

```
✖ guardCases: placeholders map to the oracle folders, both starts per family; an unplaceable span refuses
✖ claimsHarm: only a finding that says the guard lets harm through; refusals, CI and docs findings are not
✖ score CLI: an --oracle file that is not there is refused, and nothing is written
✖ probeGuard: a guard that allows everything reproduces a harmful finding; the guard as it stands does not
✖ score CLI with --checkout: the guard as committed at head settles a harm claim; any other finding is left
```

  with errors such as

```
TypeError: G.guardCases is not a function
TypeError: G.claimsHarm is not a function
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /cannot read .*gone\.mjs/. Input:
TypeError: G.probeGuard is not a function
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `// ---- command line`:

```js
// ---- the guard probe (fixtures whose key entries carry a guard probe)

// Placeholders a reviewer writes for the oracle's folders. Anything else in angle brackets cannot be placed.
const PLACES = [
  [/<[^<>]*config[^<>]*>|~\/\.claude|\$HOME\/\.claude/gi, 'C'],
  [/<[^<>]*other repo[^<>]*>/gi, 'R2'],
  [/<[^<>]*repo[^<>]*>/gi, 'R1'],
  [/<[^<>]*other[^<>]*>/gi, 'O'],
  [/<[^<>]*missing[^<>]*>/gi, 'M'],
  [/<[^<>]*file[^<>]*>/gi, 'F'],
];
// The commands a finding names, as oracle cases: every backticked span that removes, writes or pushes, from both
// folders of its family. Returns null when a span holds a placeholder no rule places.
export function guardCases(text, s) {
  const out = [];
  for (const [, span] of text.matchAll(/`([^`]+)`/g)) {
    const family = /\bgit push\b/.test(span) ? 'push' : /\brm\b|>/.test(span) ? 'rm' : null;
    if (!family) continue;
    let command = span;
    for (const [re, key] of PLACES) command = command.replace(re, `"${s[key]}"`);
    if (/<[^<>]+>/.test(command)) return null;
    const starts = family === 'push' ? [s.R1, s.R2] : [s.C, s.O];
    for (const start of starts) out.push({ family, start, command });
  }
  return out;
}
// Run cases (built from the sandbox) in real bash in the oracle's sandbox and ask a guard about each; returns
// the cases and, for each, whether it did harm the guard let through.
async function oracleRun(oraclePath, guard, build) {
  const { run, makeSandbox } = await import(pathToFileURL(oraclePath).href);
  const s = makeSandbox();
  try {
    const cases = await build(s);
    if (!cases.length) return [];
    const r = await run({ n: 0, exhaust: false, guard: typeof guard === 'function' ? guard(s) : guard, sandbox: s, extra: cases, all: true });
    const names = s.spell(s.Y).sort((a, b) => b.length - a.length);
    const plain = (t) => names.reduce((x, name) => x.split(name).join('<sandbox>'), t);
    const let_ = new Set(r.violations.map((v) => `${v.from}\n${v.command}`));
    return cases.map((c) => ({ ...c, let: let_.has(`${plain(c.start)}\n${plain(c.command)}`) }));
  } finally {
    fs.rmSync(s.T, { recursive: true, force: true });
  }
}
// The guard as committed at head (git show, never a checkout's working tree), written into the oracle's sandbox.
const guardAt = (repoDir, head) => (s) => {
  const file = path.join(s.T, 'guard-at-head.mjs');
  fs.writeFileSync(file, execFileSync('git', ['-C', repoDir, 'show', `${head}:scripts/perturb-guard.mjs`]));
  return file;
};
// Whether a finding says the guard lets harm through, the one claim the probe can settle. A finding that the guard
// refuses too much (a command refused or blocked, or the guard as the one refusing or blocking it), or about CI,
// tests or docs that only quote a command, goes to the adjudicator.
const LETS_THROUGH = /\b(through|past|bypass\w*|allow(s|ed)?|pass(es|ed)?|not (refused|blocked|caught)|unrefused|removes?|deletes?|overwrites?|clobbers?|pushes)\b/i;
const NOT_A_HARM_CLAIM = /over-?refus|\b(is|are|was|were|be|been|gets?|got|wrongly|documented as|still) (refused|blocked)\b|\bguard(\s+\w+){0,2}\s+(refuses|refused|blocks|blocked|rejects|rejected|denies|denied)\b|\b(CI|suites?|tests?|jobs?|builds?) (pass(es|ed)?|stays? green|exits? 0)\b/i;
export const claimsHarm = (text) => LETS_THROUGH.test(text) && !NOT_A_HARM_CLAIM.test(text);
// Each unmatched severe finding of a guard fixture that claims harm: run its commands and ask the guard (a file,
// or a function of the sandbox that writes one). Harm let through is reproduced; harm refused, or no harm, is not
// reproduced; any other finding, one with no command, or one the rules cannot place, is left for the adjudicator.
export async function probeGuard(texts, guard, oraclePath) {
  const ran = await oracleRun(oraclePath, guard, (s) => texts.flatMap((text, i) => (claimsHarm(text) ? guardCases(text, s) ?? [] : []).map((c) => ({ ...c, i }))));
  return texts.map((text, i) => ({ text, mine: ran.filter((c) => c.i === i) })).filter((p) => p.mine.length)
    .map((p) => ({ text: p.text, verdict: p.mine.some((c) => c.let) ? 'reproduced' : 'not-reproduced' }));
}

```

- [ ] In `scripts/grade.mjs`, replace

```js
{ verdicts: 1, model: 1, tokens: 1, without: 'list', 'leak-flags': 1, run: 1 }
```

with

```js
{ verdicts: 1, checkout: 1, oracle: 1, model: 1, tokens: 1, without: 'list', 'leak-flags': 1, run: 1 }
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `const result = score(fixture, report, verdicts, run);`:

```js
    if (opt.oracle && !fs.existsSync(opt.oracle)) throw new GradeError(`cannot read ${opt.oracle}`);
    const probed = fixture.key.some((e) => e.probe?.kind === 'guard');
    if (probed && opt.checkout && opt.oracle) {
      const first = score(fixture, report, verdicts, run);
      const open = first.severe_unmatched.filter((t) => !verdicts.some((v) => v.text === t));
      verdicts = [...verdicts, ...(await probeGuard(open, guardAt(opt.checkout, fixture.head), opt.oracle)).map((v) => ({ ...v, by: 'guard' }))];
    }
```

- [ ] In `scripts/grade.mjs`, replace

```js
  grade.mjs score <fixture.json> <report> [--verdicts <file>]
```

with

```js
  grade.mjs score <fixture.json> <report> [--verdicts <file>] [--checkout <dir>] [--oracle <file>]
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 14 pass, 0 fail, 0 skipped, of 14.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **an unplaceable span is kept**: in `scripts/grade.mjs` replace `if (/<[^<>]+>/.test(command)) return null;` with (nothing); fails: "guardCases: placeholders map to the oracle folders, both starts per family; an unplaceable span refuses".
  - **a refusal reads as a harm claim**: in `scripts/grade.mjs` replace `&& !NOT_A_HARM_CLAIM.test(text)` with (nothing); fails: "claimsHarm: only a finding that says the guard lets harm through; refusals, CI and docs findings are not".
  - **a finding with no harm words is probed**: in `scripts/grade.mjs` replace `LETS_THROUGH.test(text) &&` with (nothing); fails: "claimsHarm: only a finding that says the guard lets harm through; refusals, CI and docs findings are not".
  - **the probe ignores what a finding claims**: in `scripts/grade.mjs` replace `(claimsHarm(text) ? guardCases(text, s) ?? [] : [])` with `(guardCases(text, s) ?? [])`; fails: "score CLI with --checkout: the guard as committed at head settles a harm claim; any other finding is left".
  - **the verdict ignores the guard**: in `scripts/grade.mjs` replace `verdict: p.mine.some((c) => c.let) ? 'reproduced'` with `verdict: p.mine.length ? 'reproduced'`; fails: "probeGuard: a guard that allows everything reproduces a harmful finding; the guard as it stands does not".
  - **the guard is read from the working tree**: in `scripts/grade.mjs` replace `guardAt(opt.checkout, fixture.head)` with `path.join(opt.checkout, 'scripts', 'perturb-guard.mjs')`; fails: "score CLI with --checkout: the guard as committed at head settles a harm claim; any other finding is left".
  - **the guard refusing is a harm claim**: in `scripts/grade.mjs` replace `|\bguard(\s+\w+){0,2}\s+(refuses|refused|blocks|blocked|rejects|rejected|denies|denied)\b` with (nothing); fails: "claimsHarm: only a finding that says the guard lets harm through; refusals, CI and docs findings are not".
  - **a missing oracle file is not refused**: in `scripts/grade.mjs` replace `` if (opt.oracle && !fs.existsSync(opt.oracle)) throw new GradeError(`cannot read ${opt.oracle}`); `` with (nothing); fails: "score CLI: an --oracle file that is not there is refused, and nothing is written".

- [ ] Commit: "Grade: settle a guard finding in real bash"; the body
  names the placeholders a finding may use, why an unplaceable one is
  left for the adjudicator, that only a finding claiming harm let through
  is probed, and that the guard is read as committed at `head`.

### T3: the PR 13 reference fixtures

**Depends on:** T2
**Files:** create `grading/fixtures/pr13-round1/fixture.json`,
`grading/fixtures/pr13-round4/fixture.json`,
`grading/fixtures/pr13-round8/fixture.json`; modify `scripts/grade.mjs`;
test `scripts/grade.test.mjs`
**Seams:** the shipped fixture files; `checkGuardProbes(fixture, repoDir, oraclePath)`; the CLI `probes`
**Interfaces:** consumes `readFixture`, `oracleRun`, `guardAt`; produces
`checkGuardProbes -> [problem]`
**Verify:** `node --test scripts/grade.test.mjs`, then the by-hand check
at the end of this task

Where the keys come from. Each fixture is PR 13 at the head a clearing
round read: 1abb851 (round 1), f9178c3 (round 4), 65a01ab (round 8), with
`base` the merge base with main then (cf68b19, cf68b19, e2845ff). The
key holds each fault present at that head: every finding the build
report (`docs/BUILD-REPORT-2026-11-23.md`, "Clearing review") rates
blocker or major whose class the oracle shows the guard at that head
letting through, plus that round's own blocker and major findings that
are in the tree. Each entry's `source` is the report's words, and its
regex matches them, no other entry's, and none of four decoy findings in
the words a looser key once matched (a test helper's "subshell", a
README's "missing folder", an installer's "option", a docs "whitelist");
the shipped-fixtures test checks each of those three. The probes were run on 2026-11-26 through the
oracle at pull request 16's head 4473b5d against each head's guard: of
the eighteen commands the report quotes, seventeen do harm the guard at
1abb851 lets through (all but `builtin cd -@ sub; rm CLAUDE.md`, which
round 1's own fix brought in), six at f9178c3 (the wrapped, else,
backgrounded, piped and negated-push forms), and none at 65a01ab, where
only the drive-less Write and Edit path to the config gets through (on
Windows). That last entry's probe (`kind: guard-write`) is not
machine-checked: `probes` reads only `guard` probes (the test holds it to
that), and the fixture's probe says so in a `note`. Round 4's blocker, a
conflict with main, is not in the tree and is left out. Each fixture's
`held_out` names C6, the worked example the spec plans from PR 13's
escape; it is not in `clearing-review-examples.md` yet, so until it lands
the brief strips nothing for it and `leaks` finds no heading to look for.

What no key covers. The oracle's replay (seed 11, 1,200 cases, from the
first executing critique) found 353 commands the guard at 1abb851 lets
through and 61 at f9178c3. Read as text, 71 of the 353 match none of
round 1's key regexes: 30 a `cd` with two operands, 18 a `cd` inside a
compound command (braces, parentheses, a function, `if`, `while`, `for`
or `case`), 9 a `cd` behind `time`, `command` or `builtin`, 8 a negated
`cd`, 1 a `cd` joined by a pipe, and 5 a plain `cd` to the config or a
missing folder, then a write or a push. Of the 61, 17 match none of round 4's: 11
in a compound command, 2 negated, 1 with two operands, 1 behind a
prefix word, 1 piped and 1 plain. The keys hold the faults the real
rounds named, in a reviewer's words, so no key names these forms as
such; a run that reports one is an unmatched finding, which the guard
probe settles (reproduced: a new fault, and the key grows).

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T3: shipped fixtures

const FIXTURES = fileURLToPath(new URL('../grading/fixtures/', import.meta.url));

test('shipped fixtures: each is valid; each key regex matches its own source, no other entry\'s, and no decoy', () => {
  const ids = fs.readdirSync(FIXTURES).sort();
  assert.deepEqual(ids, ['pr13-round1', 'pr13-round4', 'pr13-round8']);
  // Findings that name no keyed fault, in the words a key once matched (a test helper's subshell, a README's
  // missing folder, an installer's option, a docs whitelist).
  const decoys = [
    'Major: the test helper spawns a subshell for every case, which is slow on Windows.',
    'Major: the README says a missing folder is created, but setup never creates it.',
    'Major: an option to the installer is ignored, and the cd step in setup is documented wrong.',
    'Major: the whitelist in the docs is out of date.',
  ];
  for (const id of ids) {
    const f = G.readFixture(path.join(FIXTURES, id, 'fixture.json'));
    assert.equal(f.id, id);
    for (const e of f.key) {
      assert.ok(new RegExp(e.match, 'i').test(e.source), `${id} ${e.id} misses its own source`);
      const cross = f.key.filter((o) => o !== e && new RegExp(e.match, 'i').test(o.source)).map((o) => o.id);
      assert.deepEqual(cross, [], `${id} ${e.id} also matches ${cross.join(', ')}`);
      for (const d of decoys) assert.ok(!new RegExp(e.match, 'i').test(d), `${id} ${e.id} matches the decoy "${d}"`);
    }
  }
});

test('checkGuardProbes: a probe the head guard lets through passes; one it refuses is listed; a guard-write probe is not read', { skip: !fs.existsSync(ORACLE) && 'guard-oracle.mjs is not beside grade.mjs' }, async (t) => {
  const dir = tmp(t);
  gitIn(dir, 'init', '-q');
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'scripts/perturb-guard.mjs'), 'process.exit(0);\n');
  gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-qm', 'open');
  const open = gitIn(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'scripts/perturb-guard.mjs'), "process.stderr.write('perturb-guard: refused all'); process.exit(2);\n");
  gitIn(dir, 'commit', '-qam', 'shut');
  const shut = gitIn(dir, 'rev-parse', 'HEAD');
  const f = fixture({ key: [{ ...fixture().key[0], probe: { kind: 'guard', start: 'C', command: 'nohup cd {O}; rm CLAUDE.md' } },
    { ...fixture().key[1], probe: { kind: 'guard-write', note: 'checked by hand on Windows' } }] });
  assert.deepEqual(await G.checkGuardProbes({ ...f, head: open }, dir, ORACLE), []);
  assert.deepEqual(await G.checkGuardProbes({ ...f, head: shut }, dir, ORACLE), [`k1: its probe does no harm, or the guard at ${shut} refuses it`]);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 2 failing of 16, these:

```
✖ shipped fixtures: each is valid; each key regex matches its own source, no other entry's, and no decoy
✖ checkGuardProbes: a probe the head guard lets through passes; one it refuses is listed; a guard-write probe is not read
```

  with errors such as

```
Error: ENOENT: no such file or directory, scandir '<tree>\grading\fixtures\'
TypeError: G.checkGuardProbes is not a function
```

- [ ] Create `grading/fixtures/pr13-round1/fixture.json`:

```json
{
  "id": "pr13-round1",
  "step": "clearing-review",
  "source": "symplecticator PR 13, clearing round 1 at 1abb851 (docs/BUILD-REPORT-2026-11-23.md, Clearing review); faults present at the head, from that round and later rounds, each shown let through by the guard at 1abb851 with real bash (guard-oracle.mjs) or reported by round 1",
  "repo": "https://github.com/hunterthelabguy/symplecticator",
  "head": "1abb851",
  "base": "cf68b19",
  "held_out": ["skills/build/clearing-review-examples.md#C6"],
  "key": [
    {
      "id": "cd-option",
      "class": "a cd with an option moves the guard to the wrong folder",
      "source": "a `cd` with an option moved the guard to the wrong folder",
      "match": "\\bcd\\s+(-[PL]|--)\\s|\\bcd\\b\\W{0,3}(with|given|takes) an option|\\boptions? (to|of|for) \\W?cd\\b",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "O", "command": "cd -P {C}; rm CLAUDE.md" }
    },
    {
      "id": "cd-refused",
      "class": "the guard follows a cd that bash refuses",
      "source": "the guard followed a `cd` that bash refuses (`-@`, a missing folder, a file, two operands)",
      "match": "\\bcd\\s+-@|\\bcd\\b[^.]{0,60}(bash refuses|missing (folder|directory)|not a (folder|directory)|two operands|too many arguments|\\b(fails|failed)\\b)",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "C", "command": "cd {M}; rm CLAUDE.md" }
    },
    {
      "id": "and-list",
      "class": "a cd joined by && is followed past the end of its list",
      "source": "the guard follows a `cd` joined by `&&` even to a folder that does not exist; that holds only to the end of the `&&` list, so `cd <missing> && true; rm CLAUDE.md` from the config folder gets through",
      "match": "&&\\s*true\\s*;|end of the (`?&&`?|and) list",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "C", "command": "cd {M} && true; rm CLAUDE.md" }
    },
    {
      "id": "or-exit",
      "class": "a cd ended by || is treated as moving nowhere",
      "source": "a `cd` ended by `||` is treated as moving nowhere, but in `cd X || exit; rm ...` the removal runs in X",
      "match": "\\|\\|\\s*exit|ended by `?\\|\\||\\bcd\\b[^.;]{0,30}\\|\\|",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "O", "command": "cd {C} || exit; rm CLAUDE.md" }
    },
    {
      "id": "subshell-cd",
      "class": "a cd inside parentheses or a substitution, then a removal in the same subshell",
      "source": "a `cd` inside parentheses or a substitution, then a removal in the same subshell (`(cd <config> && rm CLAUDE.md)`, `echo \"$(cd <config>; rm CLAUDE.md)\"`)",
      "match": "\\(\\s*cd\\b|\\$\\(\\s*cd\\b|\\bcd\\b[^.]{0,60}(subshell|substitution|parentheses)",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "O", "command": "(cd {C} && rm CLAUDE.md)" }
    },
    {
      "id": "unrun-cd",
      "class": "a cd in a body that never runs counts as placed",
      "source": "a `cd` in the body of `if false; then`, `case`, `for`, `while`, `else`, an uncalled function, or after `(false) &&`",
      "match": "if false|uncalled function|\\(false\\)\\s*&&|\\bcd\\b[^.]{0,40}(never runs|is not run|does not run)",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "C", "command": "if false; then cd {O}; fi; rm CLAUDE.md" }
    },
    {
      "id": "wrapped-cd",
      "class": "a cd behind nohup, env, nice or timeout counts as a cd bash keeps",
      "source": "a `cd` behind `nohup`, `env`, `nice` or `timeout` counted as a `cd` bash keeps, though those run it as a program of its own and bash never moves",
      "match": "\\b(nohup|env|nice|timeout)\\b[^.;]{0,20}\\bcd\\b",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "C", "command": "nohup cd {O}; rm CLAUDE.md" }
    },
    {
      "id": "else-cd",
      "class": "a cd in an else, elif or do body, or after a negated condition, counts as placed",
      "source": "a `cd` in an `else`, `elif` or `do` body, or after a negated condition, counted as placed when the condition was a `cd` that moved (`if ! cd <config>; then cd <other>; fi; rm CLAUDE.md`)",
      "match": "\\b(else|elif)\\b[^.]{0,40}\\bcd\\b|\\bcd\\b[^.]{0,40}\\b(else|elif)\\b|if\\s*!\\s*cd\\b|negated condition",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "C", "command": "if ! cd {C}; then cd {O}; fi; rm CLAUDE.md" }
    },
    {
      "id": "throwaway-shell-cd",
      "class": "a cd in a list ending in &, or in a piped or backgrounded group, moves the guard",
      "source": "a `cd` joined by `&&` in a list that ends in `&`, and a `cd` in a piped or backgrounded `{ }` group, moved the guard though bash runs them in a throwaway shell (`cd <other> && true & rm CLAUDE.md`)",
      "match": "(?<!&)&\\s*rm\\b|throwaway shell|background(ed)?\\b[^.]{0,40}\\bcd\\b|\\bcd\\b[^.]{0,40}background|piped[^.]{0,20}(group|\\{)|\\}\\s*\\|",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "C", "command": "cd {O} && true & rm CLAUDE.md" }
    },
    {
      "id": "negated-two-cd-push",
      "class": "a push after a negated cd and a second cd runs from the first repository",
      "source": "`! cd <repo> && cd <other>; git push origin HEAD` pushed from the first repo while the guard checked the second",
      "match": "!\\s*cd\\b[^;]{0,60}&&\\s*cd\\b|push(ed|es)? from the first repo|checked the second",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "R2", "command": "! cd {R1} && cd {R2}; git push origin HEAD" }
    },
    {
      "id": "report-ignore-line",
      "class": "the build report's for-the-owner item is false",
      "source": "a false \"for the owner\" item: this report said `~/.claude` has no ignore line for the scan list, but its whitelist `.gitignore` ignores it",
      "match": "ignore line|whitelist \\W?\\.gitignore|\\.gitignore[^.]{0,60}scan|scan[^.]{0,60}\\.gitignore",
      "locator": { "file": "docs/BUILD-REPORT-2026-11-23.md", "lines": [0, 0] }
    },
    {
      "id": "heredoc-conditions",
      "class": "two conditions of the heredoc exception survive the suite",
      "source": "two conditions of the heredoc exception survived the suite",
      "match": "heredoc[^.]{0,80}(condition|exception|surviv|mutant|untested)|(condition|exception|surviv|mutant|untested)[^.]{0,80}heredoc",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] }
    }
  ]
}
```

- [ ] Create `grading/fixtures/pr13-round4/fixture.json`:

```json
{
  "id": "pr13-round4",
  "step": "clearing-review",
  "source": "symplecticator PR 13, clearing round 4 at f9178c3 (docs/BUILD-REPORT-2026-11-23.md, Clearing review); faults present at the head, each shown let through by the guard at f9178c3 with real bash (guard-oracle.mjs); round 4's blocker (a conflict with main) is not in the tree and is left out",
  "repo": "https://github.com/hunterthelabguy/symplecticator",
  "head": "f9178c3",
  "base": "cf68b19",
  "held_out": [
    "skills/build/clearing-review-examples.md#C6"
  ],
  "key": [
    {
      "id": "wrapped-cd",
      "class": "a cd behind nohup, env, nice or timeout counts as a cd bash keeps",
      "source": "a `cd` behind `nohup`, `env`, `nice` or `timeout` counted as a `cd` bash keeps, though those run it as a program of its own and bash never moves",
      "match": "\\b(nohup|env|nice|timeout)\\b[^.;]{0,20}\\bcd\\b",
      "locator": {
        "file": "scripts/perturb-guard.mjs",
        "lines": [
          0,
          0
        ]
      },
      "probe": {
        "kind": "guard",
        "start": "C",
        "command": "nohup cd {O}; rm CLAUDE.md"
      }
    },
    {
      "id": "else-cd",
      "class": "a cd in an else, elif or do body, or after a negated condition, counts as placed",
      "source": "a `cd` in an `else`, `elif` or `do` body, or after a negated condition, counted as placed when the condition was a `cd` that moved (`if ! cd <config>; then cd <other>; fi; rm CLAUDE.md`)",
      "match": "\\b(else|elif)\\b[^.]{0,40}\\bcd\\b|\\bcd\\b[^.]{0,40}\\b(else|elif)\\b|if\\s*!\\s*cd\\b|negated condition",
      "locator": {
        "file": "scripts/perturb-guard.mjs",
        "lines": [
          0,
          0
        ]
      },
      "probe": {
        "kind": "guard",
        "start": "C",
        "command": "if ! cd {C}; then cd {O}; fi; rm CLAUDE.md"
      }
    },
    {
      "id": "throwaway-shell-cd",
      "class": "a cd in a list ending in &, or in a piped or backgrounded group, moves the guard",
      "source": "a `cd` joined by `&&` in a list that ends in `&`, and a `cd` in a piped or backgrounded `{ }` group, moved the guard though bash runs them in a throwaway shell (`cd <other> && true & rm CLAUDE.md`)",
      "match": "(?<!&)&\\s*rm\\b|throwaway shell|background(ed)?\\b[^.]{0,40}\\bcd\\b|\\bcd\\b[^.]{0,40}background|piped[^.]{0,20}(group|\\{)|\\}\\s*\\|",
      "locator": {
        "file": "scripts/perturb-guard.mjs",
        "lines": [
          0,
          0
        ]
      },
      "probe": {
        "kind": "guard",
        "start": "C",
        "command": "cd {O} && true & rm CLAUDE.md"
      }
    },
    {
      "id": "negated-two-cd-push",
      "class": "a push after a negated cd and a second cd runs from the first repository",
      "source": "`! cd <repo> && cd <other>; git push origin HEAD` pushed from the first repo while the guard checked the second",
      "match": "!\\s*cd\\b[^;]{0,60}&&\\s*cd\\b|push(ed|es)? from the first repo|checked the second",
      "locator": {
        "file": "scripts/perturb-guard.mjs",
        "lines": [
          0,
          0
        ]
      },
      "probe": {
        "kind": "guard",
        "start": "R2",
        "command": "! cd {R1} && cd {R2}; git push origin HEAD"
      }
    }
  ]
}
```

- [ ] Create `grading/fixtures/pr13-round8/fixture.json`:

```json
{
  "id": "pr13-round8",
  "step": "clearing-review",
  "source": "symplecticator PR 13, clearing round 8 at 65a01ab (docs/BUILD-REPORT-2026-11-23.md, Clearing review); the one fault the guard at 65a01ab lets through, shown with guard-oracle.mjs on Windows",
  "repo": "https://github.com/hunterthelabguy/symplecticator",
  "head": "65a01ab",
  "base": "e2845ff",
  "held_out": [
    "skills/build/clearing-review-examples.md#C6"
  ],
  "key": [
    {
      "id": "driveless-write",
      "class": "a Write or Edit to a drive-less path to the config passes on Windows",
      "source": "the mapping also read the Write and Edit tools' drive-less paths through `cygpath`, so a Write to `/Users/.../.claude/CLAUDE.md` passed though Claude Code writes it on the current drive",
      "match": "drive-?less|without a drive|current drive|/Users/[^`\\s]*\\.claude|cygpath[^.]{0,60}\\b(Write|Edit)\\b|\\b(Write|Edit)\\b[^.]{0,60}cygpath",
      "locator": {
        "file": "scripts/perturb-guard.mjs",
        "lines": [
          0,
          0
        ]
      },
      "probe": {
        "kind": "guard-write",
        "tool": "Write",
        "path": "/<home without its drive>/.claude/CLAUDE.md",
        "platform": "win32",
        "note": "not machine-checked: grade.mjs probes reads only guard probes; the oracle replay of 2026-11-26 on Windows showed this path let through"
      }
    }
  ]
}
```

- [ ] In `scripts/grade.mjs`, insert immediately after

```js
    .map((p) => ({ text: p.text, verdict: p.mine.some((c) => c.let) ? 'reproduced' : 'not-reproduced' }));
}
```

this:

```js
// A shipped guard fixture's own evidence: each key entry's probe ({C}, {O}, {M}, {F}, {R1}, {R2} name the
// oracle's folders) must still do harm the guard at the fixture's head lets through, read from a local clone.
export async function checkGuardProbes(fixture, repoDir, oraclePath) {
  const probes = fixture.key.filter((e) => e.probe?.kind === 'guard');
  if (!probes.length) return [];
  const ran = await oracleRun(oraclePath, guardAt(repoDir, fixture.head), (s) => probes.map((e) => ({
    id: e.id, family: /\bgit push\b/.test(e.probe.command) ? 'push' : 'rm', start: s[e.probe.start],
    command: e.probe.command.replace(/\{(C|O|M|F|R1|R2)\}/g, (m, k) => `"${s[k]}"`),
  })));
  return ran.filter((c) => !c.let).map((c) => `${c.id}: its probe does no harm, or the guard at ${fixture.head} refuses it`);
}
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `table(argv) {`:

```js
  async probes(argv) {
    const { pos, opt } = parseArgs(argv, { clone: 1, oracle: 1 });
    if (pos.length !== 1 || !opt.clone || !opt.oracle) throw new GradeError(USAGE);
    const found = await checkGuardProbes(readFixture(pos[0]), opt.clone, opt.oracle);
    for (const f of found) console.log(`probe: ${f}`);
    console.log(`probes failing: ${found.length}`);
    return found.length ? 1 : 0;
  },
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `grade.mjs table [--since <date>]`;`:

```js
  grade.mjs probes <fixture.json> --clone <repo dir> --oracle <file>
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 16 pass, 0 fail, 0 skipped, of 16.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **a key regex misses its own source**: in `grading/fixtures/pr13-round4/fixture.json` replace `"match": "\\b(nohup|env|nice|timeout)\\b[^.;]{0,20}\\bcd\\b"` with `"match": "\\bnohup and nothing else\\b"`; fails: "shipped fixtures: each is valid; each key regex matches its own source, no other entry's, and no decoy".
  - **a key regex matches another entry's source**: in `grading/fixtures/pr13-round1/fixture.json` replace `"match": "\\|\\|\\s*exit|` with `"match": "\\bcd\\b|\\|\\|\\s*exit|`; fails: "shipped fixtures: each is valid; each key regex matches its own source, no other entry's, and no decoy".
  - **a key regex matches a decoy**: in `grading/fixtures/pr13-round1/fixture.json` replace `(subshell|substitution|parentheses)"` with `(subshell|substitution|parentheses)|subshell"`; fails: "shipped fixtures: each is valid; each key regex matches its own source, no other entry's, and no decoy".
  - **head probes always pass**: in `scripts/grade.mjs` replace `return ran.filter((c) => !c.let).map` with `return ran.filter(() => false).map`; fails: "checkGuardProbes: a probe the head guard lets through passes; one it refuses is listed; a guard-write probe is not read".
  - **probes reads a guard-write probe as a guard probe**: in `scripts/grade.mjs` replace `fixture.key.filter((e) => e.probe?.kind === 'guard');` with `fixture.key.filter((e) => e.probe);`; fails: "checkGuardProbes: a probe the head guard lets through passes; one it refuses is listed; a guard-write probe is not read".

- [ ] By hand, in a full clone, from a scratch folder that holds a file
  of its own you can check survives: for each fixture,
  `node <repo>/scripts/grade.mjs probes <repo>/grading/fixtures/<id>/fixture.json --clone <repo> --oracle <repo>/scripts/guard-oracle.mjs`;
  expected for all three `probes failing: 0` (measured: exit 0 each;
  round 8's is 0 because it has no `guard` probe to run). To see it fail,
  copy round 1's fixture with `"head": "8743947"` (PR 13's last head) and
  run it the same way; expected 10 lines
  `probe: <id>: its probe does no harm, or the guard at 8743947 refuses it`
  and `probes failing: 10` (measured).
- [ ] Commit: "Grade: ship PR 13's clearing rounds as fixtures"; the body
  gives the three heads, how each key was proved, that round 8's
  Windows-only probe is checked by no code, and the recall the real
  rounds' summaries score (round 1 hits 3 of 12, round 4 2 of 4, round 8
  1 of 1; measured with `score` on each round's paragraph of the build
  report, a summary rather than the reviewer's own report).

### T4: the handoff check

**Depends on:** T3
**Files:** modify `scripts/grade.mjs`, `commands/handoff.md` (step 4);
test `scripts/grade.test.mjs`
**Seams:** `parseGroundTruth(text)`, `checkHandoff(block, groundTruth)`; the CLI `handoff` and `handoff --coldstart --questions`
**Interfaces:** consumes `appendRow`; produces
`parseGroundTruth -> [{path, base, branches}]`, `checkHandoff -> [contradiction]`
**Verify:** `node --test scripts/grade.test.mjs`

The ground-truth lines the parser reads are `ground-truth.sh`'s as it
prints them at 602e517: `== <path>`, `  origin/<branch>: <sha> ...`,
`    <path> [<branch>]: <state>` under `  worktrees:` (the first is the
main worktree), and `    <branch>: <state>` under
`  branches with no worktree, ...` (and no other section). The test's
ground truth is the script's own output (`--no-fetch`) on two scratch
repositories built to hold the branch states it prints for a pushed,
local, merged, rebased, behind or elsewhere branch and a default branch
ahead of origin, with the paths, date and time made up; a run on a
linked worktree's path prints the same but for its `== ` line
(measured). A branch is pushed when every commit of it is on origin:
"not pushed" or "ahead <n>" says no first, even beside "merged into ...
as rebased copies"; then a line level with origin (`= origin/<default>`,
`= pushed`, or `pushed, ...` on a line with no worktree), behind it
("ahead 0 / behind <n>", "only on origin/<branch>"), merged, or on
another origin branch says yes; anything else (LOCAL ONLY, "not on
origin, only on <remote>") says no.

The header is `Repo: <name>, <branch> @ <sha> (<claims>)`, with more
branches after commas or semicolons outside the parentheses; a branch
with no name before it belongs to the repo named last, and a part that
reads as neither is one contradiction. A repo is the section whose path,
or whose main worktree's path, ends in its name. A sha is checked only
for a default branch claimed pushed: a block may say main is ahead of
origin. `ground-truth.sh` leaves out a landed branch with no worktree, so
a merged claim about a branch it omits stands, and any other claim about
one is a branch it does not know. "not pushed", "not yet pushed", "never
pushed", "unpushed" and "local only" claim not pushed, and "not yet
merged" claims not merged. A State claim belongs to the branches its own
clause names (a clause runs between commas, semicolons, "and", "but" and
"while"), else to those the sentence named last; State ends at the next
label (Your task, Awaiting owner word, Verify, Watch-items).

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T4: handoff

// ground-truth.sh's own output (--no-fetch) on scratch repos built to hold each branch state it prints, with the
// paths, the date and the origin/main line's time made up. feat-g and feat-r landed as rebased copies; feat-h and
// feat-k are behind their pushed copies; feat-o's commit is on origin/feat-b; feat-m landed and has no worktree, so
// the script leaves it out; proj's main is a commit ahead of origin; proj2's only worktree is on another branch,
// so its main has no line.
const GT = [
  'GROUND TRUTH, 2030-01-02 09:00 PST (--no-fetch: compared with the last fetch)', '',
  '== ~/proj',
  '  origin/main: 29e780f 01-02 08:58 r2',
  '  worktrees:',
  '    ~/proj [main]: ahead 1 / behind 0 of origin/main',
  '    ~/proj-wt/a [feat-a]: = pushed, merged into origin/main',
  '    ~/proj-wt/b [feat-b]: = pushed, 1 patch(es) not in origin/main',
  '    ~/proj-wt/c [feat-c]: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)',
  '    ~/proj-wt/f [feat-f]: ahead 1 / behind 0 of the pushed branch, 2 patch(es) not in origin/main',
  '    ~/proj-wt/g [feat-g]: ahead 1 / behind 0 of the pushed branch, merged into origin/main as rebased copies',
  '    ~/proj-wt/h [feat-h]: ahead 0 / behind 1 of the pushed branch, 1 patch(es) not in origin/main',
  '  branches with no worktree, not in origin/main:',
  '    feat-d: 1 commit(s) not pushed, 2 patch(es) not in origin/main',
  '    feat-e: not on origin, only on upstream/feat-e',
  '    feat-k: 1 commit(s) only on origin/feat-k, 2 patch(es) not in origin/main',
  '    feat-o: on origin/feat-b',
  '    feat-r: 1 commit(s) not pushed, merged into origin/main as rebased copies',
  '    feat-x: pushed, 1 patch(es) not in origin/main',
  '    showcase/2030-01-01-old: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)',
  '  showcase branches older than 14 days:',
  '    showcase/2030-01-01-old: 40 days old',
  '  open PRs: not a GitHub repo (a local path)', '',
  '== ~/proj2',
  '  origin/main: 29e780f 01-02 08:58 r2',
  '  worktrees:',
  '    ~/proj2 [side]: merged into origin/main',
  '  open PRs: not a GitHub repo (a local path)', '',
  'GROUND TRUTH: complete', '',
].join('\n');
// The same script run on proj's linked worktree ~/proj-wt/a: its output differs only in the "== " line (measured).
const GT_WT = GT.replace('== ~/proj\n', '== ~/proj-wt/a\n').replace(/\n== ~\/proj2\n[\s\S]*?\n\n/, '\n');

test('parseGroundTruth: the base head, the main worktree, and each branch state, from worktree lines and no-worktree lines only', () => {
  const [r, r2] = G.parseGroundTruth(GT);
  assert.deepEqual([r.path, r.main], ['~/proj', '~/proj']);
  assert.deepEqual(r.base, { branch: 'main', sha: '29e780f' });
  assert.deepEqual(Object.keys(r.branches), ['main', 'feat-a', 'feat-b', 'feat-c', 'feat-f', 'feat-g', 'feat-h', 'feat-d', 'feat-e', 'feat-k', 'feat-o', 'feat-r', 'feat-x', 'showcase/2030-01-01-old']);
  assert.equal(r.branches['feat-x'], 'pushed, 1 patch(es) not in origin/main');
  assert.equal(r.branches['showcase/2030-01-01-old'], 'LOCAL ONLY: on no remote at all (or squash-merged, then deleted)');
  assert.deepEqual([r2.path, r2.main, r2.branches], ['~/proj2', '~/proj2', { side: 'merged into origin/main' }]);
});

test('checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one', () => {
  const ok = [
    'Repo: proj, main @ dadaee9 (ahead 1 of origin, not pushed), feat-x @ 1234567 (pushed); proj, feat-r @ 1234567 (not pushed; merged as rebased copies), feat-m @ 0f0f3e6 (pushed and merged); proj2, main @ 29e780f1239 (pushed)',
    'State: Merged PR 17 (feat-a) and pushed feat-b for review. feat-b is pushed, not merged; feat-g is merged, not pushed. feat-h is pushed, not yet merged; feat-k is pushed; feat-o is pushed. feat-c was never pushed; feat-d is not yet pushed.',
    'Rulings asked of the owner: 1; made by Claude: 0.',
    'Awaiting owner word: whether feat-c is to be pushed and merged.', 'Your task: x', '',
  ].join('\n');
  assert.deepEqual(G.checkHandoff(ok, GT), []);
  const bad = [
    'Repo: proj, feat-b @ 1234567 (pushed and merged); proj, main @ 1111111 (pushed); nope, x @ 2222222 (pushed); proj, feat-x @ 1234567 (not pushed), feat-a @ 1234567 (local only), main @ zzz (pushed)',
    'State: feat-c is pushed. feat-d is pushed too. feat-e is pushed. feat-f is pushed. feat-a is pushed, but not merged. feat-z is merged. feat-x is unpushed.',
    'Your task: none',
  ].join('\n');
  assert.deepEqual(G.checkHandoff(bad, GT), [
    'header: cannot read "main @ zzz (pushed)"',
    'header: feat-b claimed merged; ground truth: = pushed, 1 patch(es) not in origin/main',
    'header: main claimed pushed; ground truth: ahead 1 / behind 0 of origin/main',
    'header: main @ 1111111; ground truth: origin/main at 29e780f',
    'header: repo nope is not in ground truth',
    'header: feat-x claimed not pushed; ground truth: pushed, 1 patch(es) not in origin/main',
    'header: feat-a claimed not pushed; ground truth: = pushed, merged into origin/main',
    'State: feat-c claimed pushed; ground truth: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)',
    'State: feat-d claimed pushed; ground truth: 1 commit(s) not pushed, 2 patch(es) not in origin/main',
    'State: feat-e claimed pushed; ground truth: not on origin, only on upstream/feat-e',
    'State: feat-f claimed pushed; ground truth: ahead 1 / behind 0 of the pushed branch, 2 patch(es) not in origin/main',
    'State: feat-a claimed not merged; ground truth: = pushed, merged into origin/main',
    'State: feat-x claimed not pushed; ground truth: pushed, 1 patch(es) not in origin/main',
    'State: no "Rulings asked of the owner: N; made by Claude: M" line',
  ]);
  assert.deepEqual(G.checkHandoff('State: x', GT).slice(0, 1), ['header: no Repo: line']);
  assert.deepEqual(G.checkHandoff('Repo: proj, feat-q @ 1234567 (pushed)\nRulings asked of the owner: 0; made by Claude: 0', GT),
    ['header: branch feat-q is not in ground truth']);
});

test('checkHandoff: ground truth run on a linked worktree\'s path is read as its repo, by the main worktree\'s name', () => {
  assert.equal(G.parseGroundTruth(GT_WT)[0].path, '~/proj-wt/a');
  assert.deepEqual(G.checkHandoff('Repo: proj, feat-a @ 1234567 (pushed and merged)\nRulings asked of the owner: 0; made by Claude: 0', GT_WT), []);
});

test('handoff CLI: exit 1 and a row with the count; a cold start row carries its questions', (t) => {
  const h = tmp(t);
  const gt = put(h, 'gt.txt', GT);
  const r = cli(h, 'handoff', put(h, 'b.txt', 'Repo: proj, feat-c @ 1234567 (pushed)\nRulings asked of the owner: 0; made by Claude: 0'), gt);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /contradictions: 1/);
  assert.equal(cli(h, 'handoff', put(h, 'c.txt', 'Repo: proj, feat-c @ 1234567 (local only)\nRulings asked of the owner: 0; made by Claude: 0'), gt, '--coldstart', '--questions', '3').status, 0);
  const rows = G.readRows(h);
  assert.deepEqual(rows.map((x) => [x.kind, x.contradictions, x.questions]), [['handoff', 1, undefined], ['coldstart', 0, 3]]);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 4 failing of 20, these:

```
✖ parseGroundTruth: the base head, the main worktree, and each branch state, from worktree lines and no-worktree lines only
✖ checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one
✖ checkHandoff: ground truth run on a linked worktree's path is read as its repo, by the main worktree's name
✖ handoff CLI: exit 1 and a row with the count; a cold start row carries its questions
```

  with errors such as

```
TypeError: G.parseGroundTruth is not a function or its return value is not iterable
TypeError: G.checkHandoff is not a function
TypeError: G.parseGroundTruth is not a function
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `// ---- command line`:

```js
// ---- handoff

// What ground-truth.sh printed: per repo (its "== <path>" section), the default branch's head, the main worktree's
// path (the first worktree line: a run on a linked worktree's path names that path in its section), and each
// branch's state, from the worktree lines ("<path> [<branch>]: <state>") and the no-worktree lines
// ("<branch>: <state>").
export function parseGroundTruth(text) {
  const repos = [];
  let cur = null;
  let others = false;
  let worktrees = false;
  for (const line of text.split(/\r?\n/)) {
    const sec = /^== (.+)$/.exec(line);
    if (sec) { cur = { path: sec[1].trim(), base: null, main: null, branches: {} }; repos.push(cur); others = false; continue; }
    if (!cur) continue;
    const base = /^ {2}origin\/(\S+): ([0-9a-f]{7,40}) /.exec(line);
    if (base) { cur.base = { branch: base[1], sha: base[2] }; continue; }
    if (/^ {2}\S/.test(line)) { others = /^ {2}branches with no worktree/.test(line); worktrees = /^ {2}worktrees:/.test(line); }
    if (worktrees && cur.main === null && /^ {4}\S/.test(line)) cur.main = /^ {4}(.*?)(?: \[[^\]]+\]| detached \S+)?: /.exec(line)?.[1] ?? null;
    const wt = /^ {4}\S.* \[([^\]]+)\]: (.*)$/.exec(line);
    if (wt) { cur.branches[wt[1]] = wt[2]; continue; }
    const br = /^ {4}(\S+): (.*)$/.exec(line);
    if (br && others) cur.branches[br[1]] = br[2];
  }
  return repos;
}
// Pushed: every commit of the branch is on origin. "not pushed" and "ahead <n>" (of the default or the pushed
// branch) say no, first, even beside "merged into ... as rebased copies"; then a line level with origin ("= origin/
// <default>", "= pushed", or "pushed, ..." on a line with no worktree), behind it, merged, or on another origin
// branch says yes. Anything else (LOCAL ONLY, "not on origin, only on <remote>") says no.
const isPushed = (state) => !/\bnot pushed\b|^ahead [1-9]/.test(state) && /^= |^pushed\b|^ahead 0 \/|merged into|\bonly on origin\/|^on origin\//.test(state);
const isMerged = (state) => /merged into/.test(state);
// Claims a phrase makes about one branch: pushed or not, merged or not (absent when it says nothing).
function claims(words) {
  const w = words.toLowerCase();
  const c = {};
  if (/\b(not (yet )?(been )?pushed|never (been )?pushed|unpushed|local only)\b/.test(w)) c.pushed = false;
  else if (/\bpushed\b/.test(w)) c.pushed = true;
  if (/\b(not (yet )?(been )?merged|never (been )?merged|unmerged)\b/.test(w)) c.merged = false;
  else if (/\bmerged\b/.test(w)) c.merged = true;
  return c;
}
// A header's parts: split at commas and semicolons outside parentheses.
function headerParts(text) {
  const parts = [''];
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';')) parts.push('');
    else parts[parts.length - 1] += ch;
  }
  return parts.map((p) => p.trim()).filter(Boolean);
}
// Every claim in the block's header and in each State clause that names a known branch, checked against ground
// truth; plus the ruling count line. The header is "Repo: <name>, <branch> @ <sha> (<claims>)", with more
// branches after commas or semicolons; a branch part with no name before it belongs to the repo named last. A
// repo is the section whose path, or whose main worktree's path, ends in its name. A sha is checked only against
// a default branch claimed pushed (level with origin). ground-truth.sh leaves out a landed branch with no
// worktree, so a merged claim about a branch it omits stands. A State clause is a stretch of a sentence between
// commas, semicolons, "and", "but" and "while"; one that names no branch speaks of the branches the sentence named
// last. State ends at the next label (Your task, Awaiting owner word, Verify, Watch-items).
export function checkHandoff(block, groundTruth) {
  const repos = parseGroundTruth(groundTruth);
  const out = [];
  const repoOf = (name) => repos.find((r) => [r.path, r.main].some((p) => p === name || p?.endsWith(`/${name}`)));
  const check = (where, repo, branch, c, sha) => {
    const isBase = repo.base?.branch === branch;
    const st = repo.branches[branch] ?? (isBase ? 'merged into itself = pushed'
      : c.merged === true && repo.base ? `merged into origin/${repo.base.branch}, so left out` : undefined);
    if (st === undefined) { out.push(`${where}: branch ${branch} is not in ground truth`); return; }
    if (c.pushed === true && !isPushed(st)) out.push(`${where}: ${branch} claimed pushed; ground truth: ${st}`);
    if (c.pushed === false && isPushed(st)) out.push(`${where}: ${branch} claimed not pushed; ground truth: ${st}`);
    if (c.merged === true && !isMerged(st) && !isBase) out.push(`${where}: ${branch} claimed merged; ground truth: ${st}`);
    if (c.merged === false && isMerged(st)) out.push(`${where}: ${branch} claimed not merged; ground truth: ${st}`);
    if (sha && isBase && c.pushed === true && !repo.base.sha.startsWith(sha) && !sha.startsWith(repo.base.sha)) {
      out.push(`${where}: ${branch} @ ${sha}; ground truth: origin/${branch} at ${repo.base.sha}`);
    }
  };
  const headers = [];
  for (const line of block.split(/\r?\n/)) {
    const m = /^\s*Repo:\s*(.*)$/.exec(line);
    if (!m) continue;
    let name = null;
    for (const part of headerParts(m[1])) {
      if (!part.includes('@')) { name = part; continue; }
      const h = /^(\S+)\s*@\s*([0-9a-f]{7,40})\s*(?:\((.*)\))?\s*\.?$/.exec(part);
      if (!h || name === null) { out.push(`header: cannot read "${part}"`); continue; }
      headers.push({ name, branch: h[1], sha: h[2], words: h[3] ?? '' });
    }
  }
  if (!headers.length) out.push('header: no Repo: line');
  for (const h of headers) {
    const repo = repoOf(h.name);
    if (!repo) { out.push(`header: repo ${h.name} is not in ground truth`); continue; }
    check('header', repo, h.branch, claims(h.words), h.sha);
  }
  const state = /State:([\s\S]*?)(?:\n\s*(?:Your task|Awaiting owner word|Verify|Watch-items):|$)/.exec(block);
  if (state) {
    const known = repos.flatMap((repo) => Object.keys(repo.branches).map((branch) => ({
      repo, branch, re: new RegExp(`(^|[\\s\`(])${branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\`),.;]|$)`),
    })));
    for (const sentence of state[1].replace(/\s+/g, ' ').split(/(?<=[.;])\s+/)) {
      let last = [];
      for (const clause of sentence.split(/[,;]| and | but | while /)) {
        const here = known.filter((k) => k.re.test(clause));
        if (here.length) last = here;
        for (const k of last) check('State', k.repo, k.branch, claims(clause));
      }
    }
  }
  if (!/Rulings asked of the owner: \d+; made by Claude: \d+/.test(block)) out.push('State: no "Rulings asked of the owner: N; made by Claude: M" line');
  return out;
}

```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `table(argv) {`:

```js
  handoff(argv) {
    const { pos, opt } = parseArgs(argv, { coldstart: 'bool', questions: 1 });
    if (pos.length !== 2) throw new GradeError(USAGE);
    const found = checkHandoff(read(pos[0]), read(pos[1]));
    for (const f of found) console.log(`contradiction: ${f}`);
    console.log(`contradictions: ${found.length}`);
    appendRow(opt.coldstart ? { kind: 'coldstart', contradictions: found.length, questions: Number(opt.questions ?? 0), found }
      : { kind: 'handoff', contradictions: found.length, found });
    return found.length ? 1 : 0;
  },
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `grade.mjs table [--since <date>]`;`:

```js
  grade.mjs handoff <block file> <ground-truth output file> [--coldstart --questions <n>]
```

- [ ] In `commands/handoff.md`, replace

```md
## 5. Human handoff (opt-in: only when the hint says "human")
```

with

```md
Before emitting, check the block against the ground truth you just ran:
save the block and that output to scratch files and run
`node ~/.claude/scripts/grade.mjs handoff <block file> <ground truth file>`.
Each `contradiction:` line is a claim the facts do not back: fix it in the
block. Run the check once; its row in `~/.claude/grades.jsonl` records what
the first draft got wrong, which is the grade.

## 5. Human handoff (opt-in: only when the hint says "human")
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 20 pass, 0 fail, 0 skipped, of 20.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **no-worktree lines read in any section**: in `scripts/grade.mjs` replace `if (br && others)` with `if (br)`; fails: "parseGroundTruth: the base head, the main worktree, and each branch state, from worktree lines and no-worktree lines only".
  - **level with origin reads as not pushed**: in `scripts/grade.mjs` replace `/^= |^pushed` with `/^pushed`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a no-worktree "pushed, ..." reads as not pushed**: in `scripts/grade.mjs` replace `|^pushed\b|^ahead 0` with `|^ahead 0`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **"not pushed" reads as pushed**: in `scripts/grade.mjs` replace `!/\bnot pushed\b|^ahead [1-9]/` with `!/^ahead [1-9]/`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **ahead of the pushed branch reads as pushed**: in `scripts/grade.mjs` replace `!/\bnot pushed\b|^ahead [1-9]/` with `!/\bnot pushed\b/`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a not-pushed claim is never checked**: in `scripts/grade.mjs` replace `` if (c.pushed === false && isPushed(st)) out.push(`${where}: ${branch} claimed not pushed; ground truth: ${st}`); `` with (nothing); fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **"local only" is not a not-pushed claim**: in `scripts/grade.mjs` replace `|unpushed|local only)\b/.test(w)) c.pushed = false;` with `|unpushed)\b/.test(w)) c.pushed = false;`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **"unpushed" is no claim**: in `scripts/grade.mjs` replace `|never (been )?pushed|unpushed|local only)` with `|never (been )?pushed|local only)`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **"not yet pushed" and "never pushed" read as pushed**: in `scripts/grade.mjs` replace `not (yet )?(been )?pushed|never (been )?pushed|` with `not pushed|`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **"not yet merged" reads as merged**: in `scripts/grade.mjs` replace `not (yet )?(been )?merged|never (been )?merged|` with `not merged|`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **ahead 0 of the pushed branch reads as not pushed**: in `scripts/grade.mjs` replace `|^ahead 0 \/|merged into` with `|merged into`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **behind its pushed copy reads as not pushed**: in `scripts/grade.mjs` replace `|\bonly on origin\/|^on origin\//` with `|^on origin\//`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **on another origin branch reads as not pushed**: in `scripts/grade.mjs` replace `|\bonly on origin\/|^on origin\//.test(state)` with `|\bonly on origin\//.test(state)`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **no sha check**: in `scripts/grade.mjs` replace `if (sha && isBase && c.pushed === true && !repo.base.sha.startsWith(sha)` with `if (false && sha && isBase && c.pushed === true && !repo.base.sha.startsWith(sha)`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a sha is checked on any claim**: in `scripts/grade.mjs` replace `&& isBase && c.pushed === true &&` with `&& isBase &&`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a header sha longer than ground truth's reads as wrong**: in `scripts/grade.mjs` replace `&& !sha.startsWith(repo.base.sha)` with (nothing); fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **the base branch with no line reads as not pushed**: in `scripts/grade.mjs` replace `isBase ? 'merged into itself = pushed'` with `isBase ? ''`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a merged claim on a branch ground truth leaves out is refused**: in `scripts/grade.mjs` replace `c.merged === true && repo.base ?` with `false ?`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a repo is matched by its section path only**: in `scripts/grade.mjs` replace `[r.path, r.main].some(` with `[r.path].some(`; fails: "checkHandoff: ground truth run on a linked worktree's path is read as its repo, by the main worktree's name".
  - **header parts split inside parentheses**: in `scripts/grade.mjs` replace `if (depth === 0 && (ch ===` with `if ((ch ===`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a branch part with no name before it is unreadable**: in `scripts/grade.mjs` replace `headers.push({ name, branch: h[1], sha: h[2], words: h[3] ?? '' });` with `headers.push({ name, branch: h[1], sha: h[2], words: h[3] ?? '' }); name = null;`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **an unreadable header part is silent**: in `scripts/grade.mjs` replace `` if (!h || name === null) { out.push(`header: cannot read "${part}"`); continue; } `` with `if (!h || name === null) continue;`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **State runs past its next label**: in `scripts/grade.mjs` replace `(?:Your task|Awaiting owner word|Verify|Watch-items)` with `(?:Your task)`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **State goes unchecked**: in `scripts/grade.mjs` replace `for (const k of last) check('State', k.repo, k.branch, claims(clause));` with (nothing); fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **claims are read per sentence**: in `scripts/grade.mjs` replace `sentence.split(/[,;]| and | but | while /)` with `[sentence]`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a clause naming no branch claims nothing**: in `scripts/grade.mjs` replace `if (here.length) last = here;` with `last = here;`; fails: "checkHandoff: a true block has none; each false header and State clause, sha, unreadable part and missing count is one".
  - **a cold start drops its questions**: in `scripts/grade.mjs` replace `questions: Number(opt.questions ?? 0)` with `questions: 0`; fails: "handoff CLI: exit 1 and a row with the count; a cold start row carries its questions".

- [ ] Commit: "Grade: check a handoff block against ground truth"; the
  body says the check runs once, before emitting, so its row grades the
  first draft, and that its test reads the script's real output.

### T5: minting

**Depends on:** T4
**Files:** modify `scripts/grade.mjs`, `commands/handoff.md` (step 1),
`commands/reflect.md`; test `scripts/grade.test.mjs`
**Seams:** `selfCheck(fixture, repoDir)`, `writeMinted(fixture, repoDir, outDir)`, `wordsRegex(subject)`, `fromHistory(repoDir, {base, days, repoName})`; the CLI `mint` and `mint --from-history`
**Interfaces:** consumes `checkFixture`, `localDir`; produces
`selfCheck -> [problem]` (every problem, or only the missing head),
`writeMinted -> fixture` (with `status`), `wordsRegex -> string`,
`fromHistory -> [fixture]`, `HISTORY_SOURCE`
**Verify:** `node --test scripts/grade.test.mjs`

`--from-history` follows the owner's rulings, after the SZZ method
(Sliwerski, Zimmermann and Zeller, "When Do Changes Induce Fixes?", MSR
2005). Each first-parent commit on the base branch lands one pull
request: a merge, the commits its second parent brings in (head the
second parent, base the first); any other commit, a squash merge, is a
pull request of its own (head itself, base its parent). Every non-merge
commit reachable from the base branch, roots aside, is read: its changed
lines are blamed back, and lines from a different pull request (one that
landed earlier, since blame reads only ancestors) make it a fix of that
pull request when its subject names a fix or it comes within 30 days of
that landing. Each such pull request gets a `clearing-review` fixture at
its head, one key entry per fix. Its regex is the fix's own subject
words, so matching its source proves nothing, and the owner's rulings ask
more of each entry: its fix commit's subject names a fix (a feature or a
refactor that changed a pull request's lines is no escape), and it has a
test probe whose file is at head (a refactor or a format fix has no test
to fail; a test new since head tests something new). An entry that
fails any check is dropped and listed under `dropped`, so one bad sibling
never drafts a real fix; a fixture with no entry left, or no head, is a
draft. A subject with no word long enough for the regex matches itself,
its regex characters escaped. A probe worktree that cannot be removed (a
file Windows still holds open) is named on stderr and left, so a mint
that has run for minutes goes on. Run on this repository at 602e517
(without the self-check, which runs each probe), `fromHistory` found 8
pull requests with fixes and 13 key entries, 4 of them with a test probe,
the same as at 75995af; read first-parent only, as the first draft of
this plan did, it found none. With the self-check, `mint --from-history`
on a full clone at 602e517 minted 8 and readied none (measured, 4,089 s
beside a concurrent build): 12 of the 13 entries' subjects name no fix,
cb6560e among them, the guard fix whose test fails at head and passes at
the fix, which that rule alone drafts; the one subject that names a fix
(55f53bf, "the port's review findings, fixed") has no test. In that run a
probe worktree Windows held open was named and left, and the mint went
on. This repository's subjects name what changed, not that it fixed
something, so here the ruled rule mints drafts only.

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T5: minting

// A repo whose main has: base (lines 1 and 2); a merged PR adding a bug as line 3 of lib.mjs, with a test too weak
// to see it; a fix commit that changes line 3, and line 1 (from base, not the PR), and makes the test see the bug.
// blame.showRoot is on, as an owner may set it: a root commit's lines must still find no pull request.
function historyRepo(t) {
  const dir = tmp(t);
  const g = (...a) => gitIn(dir, ...a);
  g('init', '-q');
  g('config', 'blame.showRoot', 'true');
  const test = (call, want) => `import { half } from './lib.mjs';\nimport assert from 'node:assert';\nimport { test } from 'node:test';\ntest('half', () => assert.equal(${call}, ${want}));\n`;
  fs.writeFileSync(path.join(dir, 'lib.mjs'), 'export const add = (a, b) => a + b;\nexport const mul = (a, b) => a * b;\n');
  g('add', '-A'); g('commit', '-qm', 'base');
  g('checkout', '-qb', 'pr');
  fs.appendFileSync(path.join(dir, 'lib.mjs'), 'export const half = (x) => x / 3;\n');
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), test('half(0)', 0));
  g('add', '-A'); g('commit', '-qm', 'Add half');
  g('checkout', '-q', 'main');
  g('merge', '-q', '--no-ff', '-m', 'Merge pull request #1 from pr', 'pr');
  fs.writeFileSync(path.join(dir, 'lib.mjs'), 'export const add = (a, b) => b + a;\nexport const mul = (a, b) => a * b;\nexport const half = (x) => x / 2;\n');
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), test('half(4)', 2));
  g('add', '-A'); g('commit', '-qm', 'Fix half dividing by three');
  return { dir, g };
}

test('wordsRegex: the two longest words of a subject but stop words, both required, in either order; a subject with none matches itself', () => {
  const re = new RegExp(G.wordsRegex('Fix half dividing by three'), 'i');
  assert.equal(G.wordsRegex('Fix half dividing by three'), '(?=[\\s\\S]*\\bdividing\\b)(?=[\\s\\S]*\\bthree\\b)');
  assert.ok(re.test('Major: three is the wrong divisor; dividing by it halves nothing'));
  assert.ok(!re.test('Major: dividing is wrong'));
  assert.equal(G.wordsRegex('Fixed sign flip'), '(?=[\\s\\S]*\\bflip\\b)(?=[\\s\\S]*\\bsign\\b)');
  assert.equal(G.wordsRegex('fix: [x'), 'fix: \\[x');
  assert.ok(new RegExp(G.wordsRegex('Fix (#3)'), 'i').test('Fix (#3)'));
});

test('fromHistory and selfCheck: the fix blames to the PR; the fix\'s test fails at the PR head and passes at the fix; every problem is named', (t) => {
  const { dir, g } = historyRepo(t);
  const all = G.fromHistory(dir, { repoName: 'local/proj' });
  const pr = g('rev-parse', 'pr');
  assert.deepEqual(all.map((f) => f.id), [`hist-${pr.slice(0, 7)}`], 'line 1 blames to the root commit, which is no pull request');
  const [f] = all;
  assert.equal(f.head, pr);
  assert.equal(f.key.length, 1);
  assert.deepEqual(f.key[0].locator, { file: 'lib.mjs', lines: [3, 3] });
  assert.deepEqual(f.key[0].probe, { kind: 'test', file: 'lib.test.mjs', command: 'node --test lib.test.mjs' });
  assert.deepEqual(G.selfCheck(f, dir), [], 'the PR\'s own weak test passes at head; the fix\'s copy fails there');
  const out = tmp(t);
  assert.equal(G.writeMinted(f, dir, out).status, 'ready');
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, f.id, 'fixture.json'), 'utf8')).status, 'ready');
  const k = f.key[0].id;
  const broken = { ...f, key: [{ ...f.key[0], match: 'nothing like it' }, { ...f.key[0], id: 'b', locator: { file: 'gone.mjs', lines: [1, 1] } }] };
  assert.deepEqual(G.selfCheck(broken, dir), [`${k}: match does not match its source`, 'b: gone.mjs is not at head']);
  assert.equal(G.writeMinted({ ...broken, id: 'broken' }, dir, out).status, 'draft');
  const noFix = { ...f, key: [{ ...f.key[0], fix_commit: undefined }] };
  assert.deepEqual(G.selfCheck(noFix, dir), [`${k}: a test probe needs a fix commit`]);
  const passesAtHead = { ...f, head: g('rev-parse', 'HEAD') };
  assert.deepEqual(G.selfCheck(passesAtHead, dir), [`${k}: the probe passes at head`]);
  const failsAtFix = { ...f, key: [{ ...f.key[0], probe: { ...f.key[0].probe, command: 'exit 1' } }] };
  assert.deepEqual(G.selfCheck(failsAtFix, dir), [`${k}: the probe fails at the fix commit`]);
  const gone = '0'.repeat(40);
  assert.deepEqual(G.selfCheck({ ...f, head: gone }, dir), [`head ${gone} is not in ${dir}`], 'a missing head is the only problem named');
});

test('history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft', (t) => {
  const { dir, g } = historyRepo(t);
  const [f] = G.fromHistory(dir, { repoName: 'local/proj' });
  const e = f.key[0];
  const out = tmp(t);
  // A feature: its subject names no fix, though its test fails at head and passes after.
  const feature = { ...f, id: 'feature', key: [{ ...e, source: 'Halve by two', match: G.wordsRegex('Halve by two') }] };
  assert.deepEqual(G.writeMinted(feature, dir, out).self_check, [`${e.id}: its fix commit's subject names no fix`]);
  // A test new since head: at the base commit, lib.test.mjs is not there yet.
  const root = g('rev-list', '--max-parents=0', 'HEAD');
  assert.deepEqual(G.writeMinted({ ...f, id: 'new-test', head: root }, dir, out).self_check, [`${e.id}: its test lib.test.mjs is not at head`]);
  // One entry passes and one fails: the failing one is dropped, and the fixture is ready on the other.
  const two = G.writeMinted({ ...f, id: 'two', key: [e, { ...e, id: 'b', probe: { ...e.probe, command: 'exit 1' } }] }, dir, out);
  assert.deepEqual([two.status, two.key.map((x) => x.id), two.dropped], ['ready', [e.id], ['b: the probe fails at the fix commit']]);
  assert.equal(G.writeMinted({ ...f, id: 'gone', head: '0'.repeat(40) }, dir, out).status, 'draft');
});

test('probe cleanup: a probe worktree that cannot be removed is named, and the check goes on', (t) => {
  const { dir } = historyRepo(t);
  const [f] = G.fromHistory(dir);
  const saved = [fs.rmSync, console.error];
  const said = [];
  fs.rmSync = (p, o) => { if (String(p).includes('grade-probe-')) throw Object.assign(new Error('held open'), { code: 'EPERM' }); return saved[0](p, o); };
  console.error = (m) => said.push(String(m));
  try {
    assert.deepEqual(G.selfCheck(f, dir), []);
  } finally {
    [fs.rmSync, console.error] = saved;
  }
  assert.equal(said.length, 2);
  assert.match(said[0], /^grade: could not remove .*grade-probe-\S* \(EPERM\); delete it by hand$/);
});

test('fromHistory: past the window, only a commit whose subject names a fix is read as one', (t) => {
  const { dir } = historyRepo(t);
  const amend = (subject) => {
    const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t', 'commit', '-q', '--amend', '-m', subject, '--date', '2099-01-01T00:00:00'], { env: { ...process.env, GIT_COMMITTER_DATE: '2099-01-01T00:00:00' } });
    assert.equal(r.status, 0, String(r.stderr));
  };
  amend('Tidy half');
  assert.deepEqual(G.fromHistory(dir, { days: 30 }), []);
  amend('Fix half dividing by three');
  assert.equal(G.fromHistory(dir, { days: 30 }).length, 1);
});

// A repo for the pull-request rules: a squash merge S adds a bug; a pull request P adds a second bug, fixes it in
// its own next commit, then fixes S's with a new shell test; after P merges, a refactor with no test renames P's
// line.
function rulesRepo(t) {
  const dir = tmp(t);
  const at = (day) => ({ ...process.env, GIT_AUTHOR_DATE: `2030-01-0${day}T00:00:00`, GIT_COMMITTER_DATE: `2030-01-0${day}T00:00:00` });
  const g = (day, ...a) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t', '-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main', '-C', dir, ...a], { encoding: 'utf8', env: at(day) });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const lib = (...lines) => fs.writeFileSync(path.join(dir, 'lib.mjs'), lines.map((l) => `export const ${l};\n`).join(''));
  g(1, 'init', '-q');
  lib('a = 1');
  g(1, 'add', '-A'); g(1, 'commit', '-qm', 'base');
  const root = g(1, 'rev-parse', 'HEAD');
  lib('a = 1', 'b = 3');
  g(2, 'commit', '-qam', 'Add b (#2)');
  const s = g(2, 'rev-parse', 'HEAD');
  g(3, 'checkout', '-qb', 'p');
  lib('a = 1', 'b = 3', 'c = 30');
  g(3, 'commit', '-qam', 'Add c');
  lib('a = 1', 'b = 3', 'c = 3');
  g(4, 'commit', '-qam', 'Fix c typo');
  lib('a = 1', 'b = 2', 'c = 3');
  fs.writeFileSync(path.join(dir, 'lib.test.sh'), "grep -q 'b = 2' lib.mjs\n");
  g(5, 'add', '-A'); g(5, 'commit', '-qm', 'Fix b off by one');
  const p = g(5, 'rev-parse', 'HEAD');
  g(6, 'checkout', '-q', 'main');
  g(6, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #3 from p', 'p');
  lib('a = 1', 'b = 2', 'cee = 3');
  g(7, 'commit', '-qam', 'Rename c for readability');
  return { dir, root, s, p, refactor: g(7, 'rev-parse', 'HEAD') };
}

test('fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft', (t) => {
  const { dir, root, s, p, refactor } = rulesRepo(t);
  const all = G.fromHistory(dir, { repoName: 'local/r' });
  assert.deepEqual(all.map((f) => [f.id, f.head, f.base, f.key.map((e) => e.fix_commit)]), [
    [`hist-${p.slice(0, 7)}`, p, s, [refactor]],
    [`hist-${s.slice(0, 7)}`, s, root, [p]],
  ]);
  assert.deepEqual(all[1].key[0].probe, { kind: 'test', file: 'lib.test.sh', command: 'bash lib.test.sh' });
  const out = tmp(t);
  assert.deepEqual(all.map((f) => G.writeMinted(f, dir, out)).map((f) => [f.status, f.self_check]), [
    ['draft', [`fix-${refactor.slice(0, 7)}: its fix commit's subject names no fix`, `fix-${refactor.slice(0, 7)}: no test probe, which a fixture mined from history needs`]],
    ['draft', [`fix-${p.slice(0, 7)}: its test lib.test.sh is not at head`]],
  ]);
});

test('mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones', (t) => {
  const h = tmp(t);
  const { dir, g } = historyRepo(t);
  const id = `hist-${g('rev-parse', 'pr').slice(0, 7)}`;
  const r = cli(h, 'mint', '--from-history', dir, '--name', 'local/proj');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`ready ${id}: 1 key entries\\nminted: 1, ready: 1`));
  assert.equal(JSON.parse(fs.readFileSync(path.join(h, 'grading', 'local', id, 'fixture.json'), 'utf8')).status, 'ready');
  assert.ok(!fs.existsSync(path.join(h, 'grading', 'fixtures')));
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 7 failing of 27, these:

```
✖ wordsRegex: the two longest words of a subject but stop words, both required, in either order; a subject with none matches itself
✖ fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named
✖ history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft
✖ probe cleanup: a probe worktree that cannot be removed is named, and the check goes on
✖ fromHistory: past the window, only a commit whose subject names a fix is read as one
✖ fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft
✖ mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones
```

  with errors such as

```
TypeError: G.wordsRegex is not a function
TypeError: G.fromHistory is not a function
TypeError: G.fromHistory is not a function or its return value is not iterable
AssertionError [ERR_ASSERTION]: grade: usage:
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `// ---- command line`:

```js
// ---- minting

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitOk = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { stdio: 'ignore' }).status === 0;
// Run a probe's command in a throwaway worktree of repo at rev, with the fix's copy of the probe file put in
// first (the test the fix added, tried on the code before the fix). True when the command exits 0.
function probePasses(repo, rev, probe, fix) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-probe-'));
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '--detach', wt, rev], { stdio: 'ignore' });
    if (probe.file && fix) {
      fs.mkdirSync(path.dirname(path.join(wt, probe.file)), { recursive: true });
      fs.writeFileSync(path.join(wt, probe.file), execFileSync('git', ['-C', repo, 'show', `${fix}:${probe.file}`]));
    }
    // A node --test inside a node --test run reports to its parent and exits 0 unless this is dropped.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync('bash', ['-c', probe.command], { cwd: wt, env, stdio: 'ignore', timeout: 600000 }).status === 0;
  } finally {
    spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' });
    // A worktree Windows still holds open (EPERM) must not end a mint that has run for minutes: retry, then leave
    // the folder and say so.
    try { fs.rmSync(wt, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { console.error(`grade: could not remove ${wt} (${e.code}); delete it by hand`); }
  }
}
// A minted fixture's self-check, against a local clone, naming every problem: each entry's regex matches the
// source's own words, its locator's file exists at head, and its probe, where given, fails at head and passes at
// its fix commit. A fixture mined from history asks more of every entry: its regex is built from the fix's own
// subject, so matching its source proves nothing. The subject must name a fix (a feature or a refactor that
// changed a pull request's lines is no escape), and the entry needs a test probe whose file is at head (a refactor
// or a format fix has no test to fail; a test new since head tests something new).
export const HISTORY_SOURCE = 'mined from history';
const NAMES_A_FIX = /\bfix(e[sd])?\b/i;
export function selfCheck(fixture, repoDir) {
  if (!gitOk(repoDir, 'cat-file', '-e', `${fixture.head}^{commit}`)) return [`head ${fixture.head} is not in ${repoDir}`];
  const history = fixture.source.startsWith(HISTORY_SOURCE);
  const problems = [];
  for (const e of fixture.key) {
    const words = e.source ?? fixture.source;
    if (!new RegExp(e.match, 'i').test(words)) problems.push(`${e.id}: match does not match its source`);
    if (e.locator.file && !gitOk(repoDir, 'cat-file', '-e', `${fixture.head}:${e.locator.file}`)) problems.push(`${e.id}: ${e.locator.file} is not at head`);
    if (history && !NAMES_A_FIX.test(words)) problems.push(`${e.id}: its fix commit's subject names no fix`);
    if (history && e.probe?.kind !== 'test') problems.push(`${e.id}: no test probe, which a fixture mined from history needs`);
    if (e.probe?.kind === 'test') {
      if (history && !gitOk(repoDir, 'cat-file', '-e', `${fixture.head}:${e.probe.file}`)) problems.push(`${e.id}: its test ${e.probe.file} is not at head`);
      if (!e.fix_commit) problems.push(`${e.id}: a test probe needs a fix commit`);
      else {
        if (probePasses(repoDir, fixture.head, e.probe, e.fix_commit)) problems.push(`${e.id}: the probe passes at head`);
        if (!probePasses(repoDir, e.fix_commit, e.probe, null)) problems.push(`${e.id}: the probe fails at the fix commit`);
      }
    }
  }
  return problems;
}
// Ready when the self-check finds nothing. A fixture mined from history keeps the entries that pass and drops the
// rest (listed under `dropped`), so one bad sibling never drafts a real fix; it is a draft when none passes, or its
// head is missing. Any other fixture is a draft on any problem, listed under `self_check`.
export function writeMinted(fixture, repoDir, outDir) {
  const problems = selfCheck(fixture, repoDir);
  const mine = (e) => problems.some((p) => p.startsWith(`${e.id}: `));
  const whole = problems.some((p) => !fixture.key.some((e) => p.startsWith(`${e.id}: `)));
  const kept = fixture.source.startsWith(HISTORY_SOURCE) && !whole ? fixture.key.filter((e) => !mine(e)) : [];
  const f = kept.length
    ? { ...fixture, key: kept, status: 'ready', ...(problems.length ? { dropped: problems } : {}) }
    : { ...fixture, status: problems.length ? 'draft' : 'ready', ...(problems.length ? { self_check: problems } : {}) };
  checkFixture(f, f.id);
  const dir = path.join(outDir, f.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify(f, null, 2) + '\n');
  return f;
}
// Two of a subject's longest words, both required in either order: the fix commit's own words, loose enough to
// match a reviewer who describes the same fault. A subject with no such word matches itself, its regex characters
// escaped.
export function wordsRegex(subject) {
  const words = [...new Set(subject.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [])]
    .filter((w) => !['this', 'that', 'with', 'from', 'when', 'into', 'fix', 'fixes', 'fixed'].includes(w))
    .sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 2);
  return words.map((w) => `(?=[\\s\\S]*\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)`).join('') || subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// After the SZZ method (Sliwerski, Zimmermann and Zeller, MSR 2005). Each first-parent commit on base lands one
// pull request: a merge, what its second parent brings in; any other commit (a squash merge), itself. For every
// non-merge commit reachable from base but a root, blame the lines it changes back to the commits that wrote them;
// lines from a different pull request, which landed earlier since blame reads only ancestors, make it a fix of that
// pull request when its subject names a fix or it comes within days of that landing. Each such pull request gets a
// draft-or-ready clearing-review fixture at its head.
export function fromHistory(repoDir, { base = 'main', days = 30, repoName = repoDir } = {}) {
  const prOf = new Map();
  for (const l of git(repoDir, 'log', '--first-parent', '--format=%H %ct %P', base).split('\n').filter(Boolean)) {
    const [m, t, p1, p2] = l.split(' ');
    const pr = p2 ? { m, head: p2, base: p1, t: Number(t) } : { m, head: m, base: p1, t: Number(t) };
    for (const c of p2 ? git(repoDir, 'rev-list', `${p1}..${p2}`).split('\n').filter(Boolean) : [m]) prOf.set(c, pr);
  }
  const commits = git(repoDir, 'log', '--no-merges', '--format=%H %ct %P%x09%s', base).split('\n').filter(Boolean)
    .map((l) => { const [meta, ...s] = l.split('\t'); const [h, t, p] = meta.split(' '); return { h, t: Number(t), root: !p, subject: s.join('\t') }; });
  const found = new Map();
  for (const c of commits) {
    if (c.root) continue;
    const named = NAMES_A_FIX.test(c.subject);
    const diff = git(repoDir, 'diff', '-U0', `${c.h}^`, c.h);
    let file = null;
    const blamed = new Set();
    for (const line of diff.split('\n')) {
      const f = /^--- a\/(.*)$/.exec(line);
      if (f) { file = f[1]; continue; }
      if (/^--- \/dev\/null/.test(line)) { file = null; continue; }
      const h = /^@@ -(\d+)(?:,(\d+))? /.exec(line);
      if (!h || !file || h[2] === '0') continue;
      const from = Number(h[1]);
      const to = from + Number(h[2] ?? 1) - 1;
      // A line from a root commit blames as "^" and 39 characters (whatever blame.showRoot says), so it finds no
      // pull request: a root has no base to review against.
      const out = git(repoDir, '-c', 'blame.showRoot=false', 'blame', '-l', '-s', '-L', `${from},${to}`, `${c.h}^`, '--', file);
      for (const b of out.split('\n')) blamed.add(`${b.slice(0, 40)}\t${file}\t${from}\t${to}`);
    }
    const mine = new Map();
    for (const b of blamed) {
      const pr = prOf.get(b.split('\t')[0]);
      if (!pr || pr === prOf.get(c.h) || mine.has(pr)) continue;
      if (named || (c.t > pr.t && c.t - pr.t <= days * 86400)) mine.set(pr, b);
    }
    for (const [pr, b] of mine) {
      const [, file2, from, to] = b.split('\t');
      const test = git(repoDir, 'diff', '--name-only', `${c.h}^`, c.h).split('\n').find((p) => /\.test\.(m?js|sh)$/.test(p));
      const id = `hist-${pr.head.slice(0, 7)}`;
      const fx = found.get(id) ?? { id, step: 'clearing-review', source: `${HISTORY_SOURCE}: fixes after ${pr.m.slice(0, 7)}`, repo: repoName, head: pr.head, base: pr.base, held_out: [], key: [] };
      fx.key.push({ id: `fix-${c.h.slice(0, 7)}`, class: 'fixed after merge', match: wordsRegex(c.subject), source: c.subject,
        locator: { file: file2, lines: [Number(from), Number(to)] }, fix_commit: c.h,
        ...(test ? { probe: { kind: 'test', file: test, command: test.endsWith('.sh') ? `bash ${test}` : `node --test ${test}` } } : {}) });
      found.set(id, fx);
    }
  }
  return [...found.values()];
}

```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `table(argv) {`:

```js
  mint(argv) {
    const { pos, opt } = parseArgs(argv, { clone: 1, out: 1, 'from-history': 1, base: 1, days: 1, name: 1 });
    const out = opt.out ?? localDir();
    if (opt['from-history']) {
      const repo = opt['from-history'];
      const minted = fromHistory(repo, { base: opt.base ?? 'main', days: Number(opt.days ?? 30), repoName: opt.name ?? repo })
        .map((f) => writeMinted(f, repo, out));
      for (const f of minted) console.log(`${f.status} ${f.id}: ${f.key.length} key entries${f.self_check ? ` (${f.self_check.join('; ')})` : ''}${f.dropped ? `; dropped: ${f.dropped.join('; ')}` : ''}`);
      console.log(`minted: ${minted.length}, ready: ${minted.filter((f) => f.status === 'ready').length}`);
      return 0;
    }
    if (pos.length !== 1 || !opt.clone) throw new GradeError(USAGE);
    let draft;
    try { draft = JSON.parse(read(pos[0])); } catch (e) { throw e instanceof GradeError ? e : new GradeError(`${pos[0]}: not JSON`); }
    const f = writeMinted(checkFixture(draft, pos[0]), opt.clone, out);
    console.log(`${f.status} ${f.id}${f.self_check ? `: ${f.self_check.join('; ')}` : ''}`);
    return f.status === 'ready' ? 0 : 1;
  },
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `grade.mjs table [--since <date>]`;`:

```js
  grade.mjs mint <fixture.json draft> --clone <repo dir> [--out <dir>]
  grade.mjs mint --from-history <repo dir> [--base <branch>] [--days <n>] [--name <repo>] [--out <dir>]
```

- [ ] In `commands/handoff.md`, replace

```md
Run the /reflect routing on this session and apply the findings now (end of session,
so no confirmation round). Skip if nothing was learned, and say so.
```

with

```md
Run the /reflect routing on this session and apply the findings now (end of session,
so no confirmation round). Skip if nothing was learned, and say so.

Then mint a grading fixture for each line this session added under `## Escapes`
(in `~/.claude/COSTS.md`, or `~/.claude/ESCAPES.md` where there is no COSTS.md),
so the grader learns from every escape without a ruling. An escape of a step the
grader does not score yet (a simplify pass, a fold) mints nothing; say so in
State. Otherwise write a draft `fixture.json` to a scratch folder: `id`
(`esc-<date>-<short name>`), `step` (`clearing-review`, `reading-critique` or
`executing-critique`), `source` (the Escapes line, verbatim), `repo` (the local
clone's path), `head` (the commit the step read), `base` (what it read against),
`held_out` (any example this session wrote from the same escape, as
`<examples file path>#<ID>`), and one `key` entry: `id`, `class`, `match` (a
regex that matches the defect as a reviewer would name it, and the Escapes
line's own words), `locator` (`{"file": <path>, "lines": [a, b]}` at `head`;
`[0, 0]` for the whole file), `fix_commit` where there is one, and `probe`
(`{"kind": "test", "file": <the fix's test file>, "command": <its run command>}`)
where the fix added a test. Then run
`node ~/.claude/scripts/grade.mjs mint <draft> --clone <repo>`: it self-checks
the fixture and writes it to `~/.claude/grading/local/`, `ready`, or `draft`
naming what failed (a draft stays out of the table). Name each minted fixture
and its status in the block's State.
```

- [ ] In `commands/reflect.md`, replace

```md
- A defect found this session that an earlier step had passed (critique, simplify,
  clearing review): one line under Escapes in `~/.claude/COSTS.md`, if that file
  exists.
```

with

```md
- A defect found this session that an earlier step had passed (critique, simplify,
  clearing review): one line under Escapes in `~/.claude/COSTS.md`, or in
  `~/.claude/ESCAPES.md` where there is no COSTS.md, naming the commit the step
  read and the fix commit, if any (`/handoff` mints a grading fixture from it).
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 27 pass, 0 fail, 0 skipped, of 27.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **no stop words**: in `scripts/grade.mjs` replace `.filter((w) => !['this', 'that', 'with', 'from', 'when', 'into', 'fix', 'fixes', 'fixed'].includes(w))` with (nothing); fails: "wordsRegex: the two longest words of a subject but stop words, both required, in either order; a subject with none matches itself".
  - **no locator-file check**: in `scripts/grade.mjs` replace `` if (e.locator.file && !gitOk(repoDir, 'cat-file', '-e', `${fixture.head}:${e.locator.file}`)) problems.push `` with `if (false) problems.push`; fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named".
  - **a fallback regex is not escaped**: in `scripts/grade.mjs` replace `|| subject.replace(` with `|| subject || subject.replace(`; fails: "wordsRegex: the two longest words of a subject but stop words, both required, in either order; a subject with none matches itself".
  - **a missing head is not checked first**: in `scripts/grade.mjs` replace `` if (!gitOk(repoDir, 'cat-file', '-e', `${fixture.head}^{commit}`)) return `` with `if (false) return`; fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft".
  - **a history fixture with no test can be ready**: in `scripts/grade.mjs` replace `` if (history && e.probe?.kind !== 'test') problems.push(`${e.id}: no test probe, which a fixture mined from history needs`); `` with (nothing); fails: "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft".
  - **a subject naming no fix can be ready**: in `scripts/grade.mjs` replace `` if (history && !NAMES_A_FIX.test(words)) problems.push(`${e.id}: its fix commit's subject names no fix`); `` with (nothing); fails: "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft".
  - **a test new since head can be ready**: in `scripts/grade.mjs` replace `` if (history && !gitOk(repoDir, 'cat-file', '-e', `${fixture.head}:${e.probe.file}`)) problems.push(`${e.id}: its test ${e.probe.file} is not at head`); `` with (nothing); fails: "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft".
  - **a failing entry drafts the whole history fixture**: in `scripts/grade.mjs` replace `const kept = fixture.source.startsWith(HISTORY_SOURCE) && !whole ?` with `const kept = false ?`; fails: "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft".
  - **a missing head keeps every entry**: in `scripts/grade.mjs` replace `HISTORY_SOURCE) && !whole ?` with `HISTORY_SOURCE) ?`; fails: "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft".
  - **a probe folder that cannot be removed ends the check**: in `scripts/grade.mjs` replace `` catch (e) { console.error(`grade: could not remove `` with `` catch (e) { throw e; console.error(`grade: could not remove ``; fails: "probe cleanup: a probe worktree that cannot be removed is named, and the check goes on".
  - **a subject naming a fix counts for nothing**: in `scripts/grade.mjs` replace `const named = NAMES_A_FIX.test(c.subject);` with `const named = false;`; fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "fromHistory: past the window, only a commit whose subject names a fix is read as one", "mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones".
  - **a shell test runs under node**: in `scripts/grade.mjs` replace `` ? `bash ${test}` : `` with `` ? `node --test ${test}` : ``; fails: "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft".
  - **no passes-at-head check**: in `scripts/grade.mjs` replace `if (probePasses(repoDir, fixture.head, e.probe, e.fix_commit)) problems.push` with `if (false) problems.push`; fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "probe cleanup: a probe worktree that cannot be removed is named, and the check goes on".
  - **no fails-at-fix check**: in `scripts/grade.mjs` replace `if (!probePasses(repoDir, e.fix_commit, e.probe, null)) problems.push` with `if (false) problems.push`; fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "probe cleanup: a probe worktree that cannot be removed is named, and the check goes on".
  - **the fix's test is not copied in**: in `scripts/grade.mjs` replace `if (probe.file && fix) {` with `if (false) {`; fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "probe cleanup: a probe worktree that cannot be removed is named, and the check goes on", "mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones".
  - **the probe keeps NODE_TEST_CONTEXT**: in `scripts/grade.mjs` replace `delete env.NODE_TEST_CONTEXT;` with (nothing); fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "probe cleanup: a probe worktree that cannot be removed is named, and the check goes on", "mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones".
  - **a squash merge is no pull request**: in `scripts/grade.mjs` replace `: [m]) prOf.set(c, pr);` with `: []) prOf.set(c, pr);`; fails: "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft".
  - **only first-parent commits are read**: in `scripts/grade.mjs` replace `'log', '--no-merges', '--format=%H %ct %P%x09%s', base` with `'log', '--first-parent', '--no-merges', '--format=%H %ct %P%x09%s', base`; fails: "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft".
  - **a root commit is read as a fix**: in `scripts/grade.mjs` replace `if (c.root) continue;` with (nothing); fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "probe cleanup: a probe worktree that cannot be removed is named, and the check goes on", "fromHistory: past the window, only a commit whose subject names a fix is read as one", "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft", "mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones".
  - **blame shows root commits**: in `scripts/grade.mjs` replace `'-c', 'blame.showRoot=false',` with (nothing); fails: "fromHistory and selfCheck: the fix blames to the PR; the fix's test fails at the PR head and passes at the fix; every problem is named", "history readiness: an entry counts only when its subject names a fix and its test is at head; failing entries are dropped; none left, or no head, is a draft", "probe cleanup: a probe worktree that cannot be removed is named, and the check goes on", "fromHistory: past the window, only a commit whose subject names a fix is read as one", "mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones".
  - **a fix in its own pull request counts**: in `scripts/grade.mjs` replace `if (!pr || pr === prOf.get(c.h) || mine.has(pr)) continue;` with `if (!pr || mine.has(pr)) continue;`; fails: "fromHistory: every commit is read; a squash merge is a pull request; a fix in its own pull request is not; a shell test runs in bash; no test, or one new since head, is a draft".
  - **the window is ignored**: in `scripts/grade.mjs` replace `if (named || (c.t > pr.t && c.t - pr.t <= days * 86400)) mine.set(pr, b);` with `if (named || c.t > pr.t) mine.set(pr, b);`; fails: "fromHistory: past the window, only a commit whose subject names a fix is read as one".
  - **mint writes beside the shipped fixtures**: in `scripts/grade.mjs` replace `const out = opt.out ?? localDir();` with `const out = opt.out ?? path.join(home(), 'grading', 'fixtures');`; fails: "mint CLI: fixtures mined from history land in grading/local, never beside the shipped ones".

- [ ] Commit: "Grade: mint fixtures from escapes and from history"; the
  body says a fixture that fails its self-check is kept as a draft and
  stays out of the table, that a history entry needs a subject naming a
  fix and a test at head and is dropped without them, and that minted
  fixtures land in `~/.claude/grading/local/`.

### T6: citations and re-asks

**Depends on:** T5
**Files:** modify `scripts/grade.mjs`, `skills/spec-first/SKILL.md`
(step 5), `skills/critique/SKILL.md` (section 3), `commands/reflect.md`;
test `scripts/grade.test.mjs`
**Seams:** `exampleIds(text)`, `citations(transcripts, skillsDir, since)`, `reasks(ledger, since)`; the CLI `cite` and `reasks`
**Interfaces:** produces `citations -> {counts, ambiguous, uncited}` (its
`transcripts` any iterable of texts; the CLI reads one file at a time),
`reasks -> [{entry, repeats}]`
**Verify:** `node --test scripts/grade.test.mjs`

The transcript lines `cite` reads are Claude Code's session JSONL as
written on 2026-11-26: one object a line; Claude's own turns have `type`
`assistant`, a `timestamp`, and `message.content` as a list of blocks
(`text` with `text`; `tool_use` with `name` and `input`, where a Skill
call's `input.skill` names the skill and a Read's `input.file_path` the
file). A subagent's transcript sits under
`<project>/<session>/subagents/`, and `cite` reads those too. The three
places that write ledger entries (spec-first, critique, `/reflect`) gain
one sentence each, so `reasks` has lines to count.

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T6: citations and re-asks

test('citations: an ID counts for the one loaded file defining it; two loaded files sharing it is ambiguous', (t) => {
  const skills = tmp(t);
  for (const [d, f, ids] of [['build', 'clearing-review-examples.md', ['C1', 'C2']], ['critique', 'critique-examples.md', ['C1']]]) {
    fs.mkdirSync(path.join(skills, d));
    fs.writeFileSync(path.join(skills, d, f), ids.map((id) => `## ${id}. title\n`).join('\n'));
  }
  const line = (content, ts = '2030-01-02T00:00:00Z') => JSON.stringify({ type: 'assistant', timestamp: ts, message: { content } });
  const s1 = [line([{ type: 'tool_use', name: 'Skill', input: { skill: 'build' } }]), line([{ type: 'text', text: 'As C1 and C2 say.' }]),
    JSON.stringify({ type: 'user', message: { content: 'C2 in a tool result is not a citation' } })].join('\n');
  const s2 = [line([{ type: 'tool_use', name: 'Read', input: { file_path: 'C:\\h\\.claude\\skills\\critique\\critique-examples.md' } }]),
    line([{ type: 'tool_use', name: 'Skill', input: { skill: 'build' } }]), line([{ type: 'text', text: 'C1 applies.' }])].join('\n');
  const s3 = [line([{ type: 'tool_use', name: 'Skill', input: { skill: 'build' } }], '2029-01-01'), line([{ type: 'text', text: 'C2' }], '2029-01-01')].join('\n');
  const s4 = [line([{ type: 'tool_use', name: 'Skill', input: { skill: 'build' } }]),
    JSON.stringify({ type: 'user', timestamp: '2030-01-02', message: { content: [{ type: 'text', text: 'the owner names C2' }] } })].join('\n');
  const r = G.citations([s1, s2, s3, s4], skills, '2030-01-01');
  assert.deepEqual(r.counts, { 'build/clearing-review-examples.md#C1': 1, 'build/clearing-review-examples.md#C2': 1 });
  assert.equal(r.ambiguous, 1);
  assert.deepEqual(r.uncited, ['critique/critique-examples.md#C1']);
});

test('reasks: both ledger forms, dated on or after since', () => {
  const ledger = 'Q1. 2030-01-01, x\nRe-asked: Q0\n\nQ2. 2030-01-03, y\nRe-asked: Q1\n\n## X3 (2030-01-04): z\n\nRe-asked: X1\n';
  assert.deepEqual(G.reasks(ledger, '2030-01-02'), [{ entry: 'Q2', repeats: 'Q1' }, { entry: 'X3', repeats: 'X1' }]);
  assert.equal(G.reasks(ledger).length, 3);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 2 failing of 29, these:

```
✖ citations: an ID counts for the one loaded file defining it; two loaded files sharing it is ambiguous
✖ reasks: both ledger forms, dated on or after since
```

  with errors such as

```
TypeError: G.citations is not a function
TypeError: G.reasks is not a function
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `// ---- command line`:

```js
// ---- bloat: citations and re-asks

// Example IDs each examples file defines, from its "## <ID>." headings.
export function exampleIds(text) {
  return [...text.matchAll(/^## ([A-Z]+\d+)\./gm)].map((m) => m[1]);
}
// Over session transcripts (one JSON object a line): the examples files each session loaded (a Read of the file,
// or a Skill call whose folder holds it) and the IDs Claude's own text names. An ID counts for the one loaded
// file that defines it; one two loaded files define is ambiguous.
export function citations(transcripts, skillsDir, since = '0000-00-00') {
  const files = {};
  for (const skill of fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : []) {
    const d = path.join(skillsDir, skill);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => /examples\.md$/.test(x))) files[`${skill}/${f}`] = exampleIds(read(path.join(d, f)));
  }
  const counts = {};
  let ambiguous = 0;
  for (const text of transcripts) {
    const loaded = new Set();
    const said = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (o.type !== 'assistant' || (o.timestamp ?? '') < since || !Array.isArray(o.message?.content)) continue;
      for (const c of o.message.content) {
        if (c.type === 'tool_use' && c.name === 'Skill') for (const f of Object.keys(files)) if (f.startsWith(`${c.input?.skill}/`)) loaded.add(f);
        if (c.type === 'tool_use' && c.name === 'Read') {
          const p = String(c.input?.file_path ?? '').replace(/\\/g, '/');
          for (const f of Object.keys(files)) if (p.endsWith(`/${f}`)) loaded.add(f);
        }
        if (c.type === 'text') said.push(c.text);
      }
    }
    for (const id of new Set(said.join('\n').match(/\b[A-Z]+\d+\b/g) ?? [])) {
      const owners = [...loaded].filter((f) => files[f].includes(id));
      if (owners.length === 1) counts[`${owners[0]}#${id}`] = (counts[`${owners[0]}#${id}`] ?? 0) + 1;
      else if (owners.length > 1) ambiguous++;
    }
  }
  const uncited = Object.entries(files).flatMap(([f, ids]) => ids.map((id) => `${f}#${id}`)).filter((k) => !counts[k]);
  return { counts, ambiguous, uncited };
}
// Ledger entries dated on or after since that carry a "Re-asked: <ID>" line. Entries start "<ID>. <date>" (the
// maintainer's form) or "## <ID> (<date>)" (ledger.mjs's form).
export function reasks(ledger, since = '0000-00-00') {
  const starts = [...ledger.matchAll(/^(?:## )?([A-Z]+\d+)[.:]? *\(?(\d{4}-\d{2}-\d{2})/gm)];
  const found = [];
  starts.forEach((m, i) => {
    const body = ledger.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined);
    if (m[2] < since) return;
    for (const r of body.matchAll(/^Re-asked: ([A-Z]+\d+)/gm)) found.push({ entry: m[1], repeats: r[1] });
  });
  return found;
}

```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `table(argv) {`:

```js
  cite(argv) {
    const { opt } = parseArgs(argv, { since: 1, projects: 1, skills: 1 });
    const projects = opt.projects ?? path.join(home(), 'projects');
    const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : e.name.endsWith('.jsonl') ? [p] : [];
    }) : []);
    // One transcript in memory at a time: the projects folder can hold gigabytes.
    const texts = (function* () { for (const f of walk(projects)) yield read(f); })();
    const r = citations(texts, opt.skills ?? path.join(home(), 'skills'), opt.since);
    for (const [k, n] of Object.entries(r.counts).sort()) console.log(`cited ${n}: ${k}`);
    for (const k of r.uncited) console.log(`uncited: ${k}`);
    console.log(`ambiguous: ${r.ambiguous}`);
    appendRow({ kind: 'cite', since: opt.since ?? null, ...r });
    return 0;
  },
  reasks(argv) {
    const { pos, opt } = parseArgs(argv, { since: 1 });
    const found = reasks(read(pos[0] ?? path.join(home(), 'LEDGER.md')), opt.since);
    for (const f of found) console.log(`re-asked: ${f.entry} repeats ${f.repeats}`);
    console.log(`re-asks: ${found.length}`);
    appendRow({ kind: 'reasks', since: opt.since ?? null, count: found.length, found });
    return 0;
  },
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `grade.mjs table [--since <date>]`;`:

```js
  grade.mjs cite [--since <date>] [--projects <dir>] [--skills <dir>]
  grade.mjs reasks [--since <date>] [<ledger file>]
```

- [ ] In `skills/spec-first/SKILL.md`, replace

```md
Claude's context on a separate labeled line) and a considered-and-declined list.
If the repo names no location, ask. Self-review before showing it: no
```

with

```md
Claude's context on a separate labeled line) and a considered-and-declined list.
When an answer repeats a ruling already in the ledger, the new entry gets a line
`Re-asked: <ID>` naming the earlier entry. If the repo names no location, ask.
Self-review before showing it: no
```

- [ ] In `skills/critique/SKILL.md`, replace

```md
context on a separate labeled line. Commit each fold on its own, so the next
```

with

```md
context on a separate labeled line. When an answer repeats a ruling already in the
ledger, the new entry gets a line `Re-asked: <ID>` naming the earlier entry. Commit
each fold on its own, so the next
```

- [ ] In `commands/reflect.md`, replace

```md
  option quotes the owner's words and the option text, marked as Claude-drafted.
```

with

```md
  option quotes the owner's words and the option text, marked as Claude-drafted.
  When an answer repeats a ruling already in the ledger, the new entry gets a line
  `Re-asked: <ID>` naming the earlier entry (`/grade term` counts them).
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 29 pass, 0 fail, 0 skipped, of 29.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **text outside Claude's own counts**: in `scripts/grade.mjs` replace `if (o.type !== 'assistant' ||` with `if (o.type === 'nothing' ||`; fails: "citations: an ID counts for the one loaded file defining it; two loaded files sharing it is ambiguous".
  - **re-asks ignore since**: in `scripts/grade.mjs` replace `if (m[2] < since) return;` with (nothing); fails: "reasks: both ledger forms, dated on or after since".

- [ ] Commit: "Grade: count example citations and ledger re-asks"; the
  body says an uncited example is listed for `/reflect`, never retired by
  the script, and names the three skills that now write `Re-asked:`.

### T7: field recall and perturb rows

**Depends on:** T6
**Files:** modify `scripts/grade.mjs`, `skills/perturb/SKILL.md` (Work,
the mining bullet); test `scripts/grade.test.mjs`
**Seams:** `stepOf(words)`, `fieldRecall(costs, since)`, `perturbRow(report, prs, branch)`; the CLI `field` and `perturb`
**Interfaces:** produces `fieldRecall -> {steps: {<step>: {findings, escapes, recall}}, tags: {<tag>: {<step>: ...}}, unread}`,
`perturbRow -> {branch, pieces, merged, closed, open, unmined}`
**Verify:** `node --test scripts/grade.test.mjs`

An escape takes the repo tag of the review lines its step names by date,
when they share one; else the one tag its own text names as a word; else
`?`. With no `COSTS.md`, `field` reads `ESCAPES.md` and reports the
escapes alone, with no recall. `perturb` takes a branch as a remote's copy
too (`origin/showcase/...`) and matches pull requests by the branch's own
name. Its caller is `/perturb`'s mining step, as the owner ruled: mining
happens in a fresh session that does not load `/perturb`, so the skill
has its closing block's task carry the one command, run once when the
branch is mined (the table sums a branch's rows); nothing else in mining
changes. Run on the maintainer's `COSTS.md` on 2026-11-27 (after the grading
plan's second executing critique was logged), `field` read:
executing-critique 94 findings and 4 escapes (0.96), clearing-review 79
and 0 (1.00), task-review 221 and 0 (1.00), reading-critique 82 and 1
(0.99), with 55 review lines and 3 escapes listed as unread; by tag, 3 of
the 4 executing-critique escapes fall to `kymograph`, and the other two
escapes to `?`. The clearing review's 1.00 sits beside PR 13's replayed
round 1 at 3 of 12: a round that misses what the next round finds is not
logged as an escape, so field recall is a ceiling, read beside the
fixtures, never alone.

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T7: field recall and perturb

test('fieldRecall: findings per step and per repo tag without nits, escapes by step words, date and name, unreadable lines listed', () => {
  const costs = [
    '# Agent costs', '',
    '- [alpha] 2030-01-02, clearing review (PR 1), 1,000 tokens. NOT CLEARED: 1 blocker, 2 major, 3 minor, 9 nit.', '',
    '- [alpha] 2030-01-03, clearing review round 2 (PR 1), CLEARED: 0 blocker, 0 major, 1 minor.', '',
    '- [beta] 2030-01-03, clearing review (PR 9), CLEARED: 0 blocker, 2 major, 0 minor.', '',
    '- [beta] 2030-01-03, executing critique pass 1, found things', '',
    '- [beta] 2030-01-03, build implementer T1, 5 major mentioned but not a review', '',
    '## Escapes', '', 'Header text.', '',
    '- 2030-01-02; an early defect; step: the 2030-01-02 clearing review; a miss.',
    '- 2030-01-04; a defect; found by x; step:\n  the 2030-01-02 clearing review; a miss.',
    '- 2030-01-05; another; step: fold 1; contract gap.',
    '- 2030-01-05; a third; step: the 2030-01-03 clearing review, which two repos ran that day; a miss.',
    '- 2030-01-05; a fourth, in beta-notes and beta; step: the clearing review of PR 9; a miss.', '',
    '## Stuck', '', '- 2030-01-06; step: clearing review; not an escape',
  ].join('\n');
  const r = G.fieldRecall(costs);
  assert.deepEqual(r.steps, { 'clearing-review': { findings: 9, escapes: 4, recall: 9 / 13 } });
  assert.deepEqual(r.tags, {
    alpha: { 'clearing-review': { findings: 7, escapes: 2, recall: 7 / 9 } },
    beta: { 'clearing-review': { findings: 2, escapes: 1, recall: 2 / 3 } },
    '?': { 'clearing-review': { findings: 0, escapes: 1, recall: 0 } },
  });
  assert.deepEqual(r.unread, ['[beta] 2030-01-03, executing critique pass 1', 'escape 2030-01-05, step: fold 1']);
  assert.deepEqual(G.fieldRecall(costs, '2030-01-03').steps['clearing-review'], { findings: 3, escapes: 3, recall: 0.5 });
});

test('perturbRow: section 5 rows against PRs naming the branch', () => {
  const report = '# R\n\n## 5. Mineable pieces\n\n| Piece | Cost |\n|---|---|\n| a | 1 |\n| b | 2 |\n| c | 3 |\n\n## 6. Bets\n\n| x | y |\n';
  const prs = [{ state: 'MERGED', body: 'from showcase/s' }, { state: 'CLOSED', body: 'showcase/s' }, { state: 'MERGED', body: 'other' }];
  assert.deepEqual(G.perturbRow(report, prs, 'showcase/s'), { branch: 'showcase/s', pieces: 3, merged: 1, closed: 1, open: 0, unmined: 1 });
  assert.deepEqual(G.perturbRow(report, [...prs, { state: 'OPEN', body: 'mines showcase/s' }], 'showcase/s'), { branch: 'showcase/s', pieces: 3, merged: 1, closed: 1, open: 1, unmined: 0 });
});

test('perturb CLI: a remote\'s copy of the branch is matched by the branch\'s own name', (t) => {
  const h = tmp(t);
  const dir = tmp(t);
  gitIn(dir, 'init', '-q');
  put(dir, 'PERTURB-REPORT.md', '# R\n\n## 5. Mineable pieces\n\n| Piece | Cost |\n|---|---|\n| a | 1 |\n| b | 2 |\n');
  gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-qm', 'report');
  gitIn(dir, 'remote', 'add', 'origin', 'https://example.invalid/r.git');
  gitIn(dir, 'update-ref', 'refs/remotes/origin/showcase/s', 'HEAD');
  const prs = put(h, 'prs.json', JSON.stringify([{ number: 1, state: 'MERGED', body: 'mined from showcase/s' }]));
  const r = cli(h, 'perturb', 'origin/showcase/s', '--repo', dir, '--prs', prs);
  assert.equal(r.status, 0, r.stderr);
  const [row] = G.readRows(h);
  assert.deepEqual([row.branch, row.merged], ['showcase/s', 1]);
});

test('field CLI: reads COSTS.md, per step and per tag; with only ESCAPES.md, the escapes alone and no recall', (t) => {
  const h = tmp(t);
  put(h, 'ESCAPES.md', '# Escapes\n\n## Escapes\n\n- 2030-01-04; a defect; step: the 2030-01-02 clearing review; a miss.\n');
  const alone = cli(h, 'field').stdout;
  assert.match(alone, /^clearing-review: 1 escapes$/m);
  assert.doesNotMatch(alone, /recall/);
  assert.equal(G.readRows(h)[0].steps['clearing-review'].recall, null);
  put(h, 'COSTS.md', '# Agent costs\n\n- [p] 2030-01-02, clearing review, 1 major.\n\n## Escapes\n\n');
  const both = cli(h, 'field').stdout;
  assert.match(both, /^clearing-review: 1 findings, 0 escapes, recall 1\.00$/m);
  assert.match(both, /^ {2}\[p\] clearing-review: 1 findings, 0 escapes, recall 1\.00$/m);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 4 failing of 33, these:

```
✖ fieldRecall: findings per step and per repo tag without nits, escapes by step words, date and name, unreadable lines listed
✖ perturbRow: section 5 rows against PRs naming the branch
✖ perturb CLI: a remote's copy of the branch is matched by the branch's own name
✖ field CLI: reads COSTS.md, per step and per tag; with only ESCAPES.md, the escapes alone and no recall
```

  with errors such as

```
TypeError: G.fieldRecall is not a function
TypeError: G.perturbRow is not a function
AssertionError [ERR_ASSERTION]: grade: usage:
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /^clearing-review: 1 escapes$/m. Input:
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `// ---- command line`:

```js
// ---- field recall

// Which step a COSTS.md line or Escapes line is about, from its words.
export function stepOf(words) {
  const w = words.toLowerCase();
  if (/clearing/.test(w)) return 'clearing-review';
  if (/executing critique/.test(w)) return 'executing-critique';
  if (/simplify/.test(w)) return 'simplify';
  if (/task review/.test(w)) return 'task-review';
  if (/reading critique|reading review/.test(w)) return 'reading-critique';
  return null;
}
// From COSTS.md: findings each review line names (blocker, major and minor; nits left out) beside the Escapes
// lines naming that step, per step and per repo tag (the "[tag]" a review line starts with). An escape takes the
// tag of the review lines its step names by date, when they share one; else the one tag, of those or of all, that
// its own text names as a word; else "?". A review line with no counts it can read is listed, not guessed.
export function fieldRecall(costs, since = '0000-00-00') {
  const [agents, escapes = ''] = costs.split(/^## Escapes\s*$/m);
  const bullets = (text) => text.split(/\n(?=- )/).filter((b) => b.startsWith('- '));
  const steps = {};
  const tags = {};
  const unread = [];
  const tagsOf = new Map();
  const known = new Set();
  const cell = (o, step) => (o[step] ??= { findings: 0, escapes: 0, recall: null });
  const add = (tag, step, what, n) => { cell(steps, step)[what] += n; cell(tags[tag] ??= {}, step)[what] += n; };
  for (const b of bullets(agents)) {
    const m = /^- \[([^\]]+)\] (\d{4}-\d{2}-\d{2}), ([^(,]*)/.exec(b);
    if (!m) continue;
    known.add(m[1]);
    const step = stepOf(m[3]);
    if (!step) continue;
    const k = `${m[2]} ${step}`;
    if (!tagsOf.has(k)) tagsOf.set(k, new Set());
    tagsOf.get(k).add(m[1]);
    if (m[2] < since) continue;
    const n = (word) => [...b.matchAll(new RegExp(`(\\d+) ${word}s?\\b`, 'g'))].reduce((a, x) => a + Number(x[1]), 0);
    if (!/\d+ (blocker|major|minor)s?\b/.test(b)) { unread.push(`[${m[1]}] ${m[2]}, ${m[3].replace(/\s+/g, ' ').trim()}`); continue; }
    add(m[1], step, 'findings', n('blocker') + n('major') + n('minor'));
  }
  for (const b of bullets(escapes.split(/^## /m)[0])) {
    const date = /^- (\d{4}-\d{2}-\d{2})/.exec(b)?.[1];
    if (!date || date < since) continue;
    const words = (/step:\s*([^;]*)/.exec(b)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const step = stepOf(words);
    if (!step) { unread.push(`escape ${date}, step: ${words || '(none named)'}`); continue; }
    const dated = tagsOf.get(`${/\d{4}-\d{2}-\d{2}/.exec(words)?.[0]} ${step}`);
    const named = [...(dated ?? known)].filter((t) => new RegExp(`(^|[^\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`, 'i').test(b));
    add(dated?.size === 1 ? [...dated][0] : named.length === 1 ? named[0] : '?', step, 'escapes', 1);
  }
  for (const v of [...Object.values(steps), ...Object.values(tags).flatMap((t) => Object.values(t))]) {
    v.recall = v.findings + v.escapes ? v.findings / (v.findings + v.escapes) : null;
  }
  return { steps, tags, unread };
}

// ---- perturb

// A mined showcase branch: the rows of its report's section 5 table against the pull requests whose body names
// the branch (gh's JSON: number, state, body).
export function perturbRow(report, prs, branch) {
  const sec = /^## 5\.[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(report)?.[1] ?? '';
  const rows = sec.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1);
  const mine = prs.filter((p) => (p.body ?? '').includes(branch));
  const merged = mine.filter((p) => p.state === 'MERGED').length;
  const closed = mine.filter((p) => p.state === 'CLOSED').length;
  return { branch, pieces: rows.length, merged, closed, open: mine.length - merged - closed, unmined: Math.max(0, rows.length - mine.length) };
}

```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `table(argv) {`:

```js
  field(argv) {
    const { pos, opt } = parseArgs(argv, { since: 1 });
    // An adopter with no costs log keeps escapes alone in ESCAPES.md (setup writes it); field reads that instead
    // and reports the escapes alone, since it holds no findings to set them against.
    const costs = path.join(home(), 'COSTS.md');
    const alone = !pos[0] && !fs.existsSync(costs);
    const r = fieldRecall(read(pos[0] ?? (alone ? path.join(home(), 'ESCAPES.md') : costs)), opt.since);
    if (alone) for (const v of [...Object.values(r.steps), ...Object.values(r.tags).flatMap((t) => Object.values(t))]) v.recall = null;
    const line = (v) => (alone ? `${v.escapes} escapes` : `${v.findings} findings, ${v.escapes} escapes, recall ${v.recall === null ? '-' : v.recall.toFixed(2)}`);
    for (const [k, v] of Object.entries(r.steps)) console.log(`${k}: ${line(v)}`);
    for (const [tag, s] of Object.entries(r.tags)) for (const [k, v] of Object.entries(s)) console.log(`  [${tag}] ${k}: ${line(v)}`);
    for (const u of r.unread) console.log(`unread: ${u}`);
    appendRow({ kind: 'field', since: opt.since ?? null, escapes_alone: alone, ...r });
    return 0;
  },
  perturb(argv) {
    const { pos, opt } = parseArgs(argv, { repo: 1, prs: 1 });
    if (pos.length !== 1) throw new GradeError(USAGE);
    const repo = opt.repo ?? '.';
    let report;
    try { report = git(repo, 'show', `${pos[0]}:PERTURB-REPORT.md`); } catch { throw new GradeError(`no PERTURB-REPORT.md on ${pos[0]}`); }
    // Pull request bodies name the branch, never a remote's copy of it (origin/showcase/...).
    const branch = git(repo, 'remote').split('\n').filter(Boolean).reduce((b, r) => (b.startsWith(`${r}/`) ? b.slice(r.length + 1) : b), pos[0]);
    const prs = opt.prs ? readJson(opt.prs)
      : JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'all', '--search', `${branch} in:body`, '--json', 'number,state,body', '--limit', '200'], { cwd: repo, encoding: 'utf8' }));
    const row = appendRow({ kind: 'perturb', ...perturbRow(report, prs, branch) });
    console.log(JSON.stringify(row));
    return 0;
  },
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `grade.mjs table [--since <date>]`;`:

```js
  grade.mjs field [--since <date>] [<COSTS.md>]
  grade.mjs perturb <showcase branch> [--repo <dir>] [--prs <gh JSON file>]
```

- [ ] In `skills/perturb/SKILL.md`, replace

```md
- Open no pull request: the branch is pushed, never merged. Mining happens
  in a fresh session, under the full charter.
```

with

```md
- Open no pull request: the branch is pushed, never merged. Mining happens
  in a fresh session, under the full charter. Say in the closing block's
  task that once the branch is mined, that session runs
  `node ~/.claude/scripts/grade.mjs perturb <branch> --repo <repo>` once:
  it logs the branch's row in `~/.claude/grades.jsonl` (the report's
  section 5 pieces against the pull requests whose body names the branch).
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 33 pass, 0 fail, 0 skipped, of 33.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **nits are counted**: in `scripts/grade.mjs` replace `add(m[1], step, 'findings', n('blocker') + n('major') + n('minor'));` with `add(m[1], step, 'findings', n('blocker') + n('major') + n('minor') + n('nit'));`; fails: "fieldRecall: findings per step and per repo tag without nits, escapes by step words, date and name, unreadable lines listed".
  - **escapes ignore since**: in `scripts/grade.mjs` replace `if (!date || date < since) continue;` with `if (!date) continue;`; fails: "fieldRecall: findings per step and per repo tag without nits, escapes by step words, date and name, unreadable lines listed".
  - **an escape with no step is dropped**: in `scripts/grade.mjs` replace `` if (!step) { unread.push(`escape ${date}, step: ${words || '(none named)'}`); continue; } `` with `if (!step) continue;`; fails: "fieldRecall: findings per step and per repo tag without nits, escapes by step words, date and name, unreadable lines listed".
  - **an escape never takes its review's tag**: in `scripts/grade.mjs` replace `dated?.size === 1 ? [...dated][0] :` with (nothing); fails: "fieldRecall: findings per step and per repo tag without nits, escapes by step words, date and name, unreadable lines listed".
  - **an escape's text never names its tag**: in `scripts/grade.mjs` replace `named.length === 1 ? named[0] : '?'` with `'?'`; fails: "fieldRecall: findings per step and per repo tag without nits, escapes by step words, date and name, unreadable lines listed".
  - **the table header row is a piece**: in `scripts/grade.mjs` replace `.filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1);` with `.filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l));`; fails: "perturbRow: section 5 rows against PRs naming the branch".
  - **perturb keeps the remote's name**: in `scripts/grade.mjs` replace `` const branch = git(repo, 'remote').split('\n').filter(Boolean).reduce((b, r) => (b.startsWith(`${r}/`) ? b.slice(r.length + 1) : b), pos[0]); `` with `const branch = pos[0];`; fails: "perturb CLI: a remote's copy of the branch is matched by the branch's own name".
  - **no ESCAPES.md fallback**: in `scripts/grade.mjs` replace `read(pos[0] ?? (alone ? path.join(home(), 'ESCAPES.md') : costs))` with `read(pos[0] ?? costs)`; fails: "field CLI: reads COSTS.md, per step and per tag; with only ESCAPES.md, the escapes alone and no recall".
  - **escapes alone print a recall**: in `scripts/grade.mjs` replace `const line = (v) => (alone ?` with `const line = (v) => (false ?`; fails: "field CLI: reads COSTS.md, per step and per tag; with only ESCAPES.md, the escapes alone and no recall".
  - **escapes alone store a recall**: in `scripts/grade.mjs` replace `if (alone) for (const v of [...Object.values(r.steps), ...Object.values(r.tags).flatMap((t) => Object.values(t))]) v.recall = null;` with (nothing); fails: "field CLI: reads COSTS.md, per step and per tag; with only ESCAPES.md, the escapes alone and no recall".
  - **open pull requests are never counted**: in `scripts/grade.mjs` replace `open: mine.length - merged - closed,` with `open: 0,`; fails: "perturbRow: section 5 rows against PRs naming the branch".

- [ ] Commit: "Grade: field recall from the escapes log, perturb rows";
  the body gives the ceiling caveat above.

### T8: the runner, `/grade`

**Depends on:** T7
**Files:** create `commands/grade.md`; test `scripts/grade.test.mjs`
**Seams:** the grader's callers as its test reads them,
`commands/grade.md`, `commands/handoff.md`, `skills/perturb/SKILL.md`
and, where it is there (it is never installed), setup's own skill: every
`grade.mjs` subcommand and option each names exists, each option matched
exactly, and together they name every subcommand but `probes`, which is
run by hand (T3)
**Interfaces:** consumes every subcommand above
**Verify:** `node --test scripts/grade.test.mjs`

The checkout in step 1.2 was run on this repository at 1abb851: without
the reflog expiry and `gc`, all 74 commits past `head` stayed readable
through the reflog; with them, none (measured with the step's own check).
Step 5 names each run `<id>-<date>-<n>` and puts the name on the brief's
first line, so a later term's run never reads an earlier one's rows and
a run's transcript is found by its name, not by being the newest file
(runs spawned together finish in any order).

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T8: the runner

test('the callers (/grade, /handoff, /perturb, setup) name only subcommands and options grade.mjs accepts, each option exactly, and together every subcommand but probes', () => {
  const usage = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).stderr;
  const subs = new Set([...usage.matchAll(/grade\.mjs (\w+)/g)].map((m) => m[1]));
  // Setup's own skill is never installed, so an installed suite reads the other three.
  const files = ['commands/grade.md', 'commands/handoff.md', 'skills/perturb/SKILL.md', '.claude/skills/setup-config/SKILL.md']
    .map((f) => [f, fileURLToPath(new URL(`../${f}`, import.meta.url))]).filter(([f, p]) => !f.startsWith('.claude/') || fs.existsSync(p));
  const named = new Set();
  for (const [f, p] of files) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      for (const m of line.matchAll(/grade\.mjs (\w+)([^`]*)/g)) {
        named.add(m[1]);
        assert.ok(subs.has(m[1]), `${f} names grade.mjs ${m[1]}`);
        const lines = usage.split('\n').filter((u, i, all) => u.includes(`grade.mjs ${m[1]}`) || (/^\s{10,}/.test(u) && all[i - 1]?.includes(`grade.mjs ${m[1]}`)));
        const allowed = new Set(lines.join(' ').match(/--[a-z-]+/g));
        for (const [opt] of m[2].matchAll(/--[a-z-]+/g)) assert.ok(allowed.has(opt), `${f} gives ${m[1]} ${opt}`);
      }
    }
  }
  // probes is run by hand, on a shipped fixture; every other subcommand has a caller.
  assert.deepEqual([...named].sort(), [...subs].filter((s) => s !== 'probes').sort());
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 1 failing of 34, these:

```
✖ the callers (/grade, /handoff, /perturb, setup) name only subcommands and options grade.mjs accepts, each option exactly, and together every subcommand but probes
```

  with errors such as

```
Error: ENOENT: no such file or directory, open '<tree>\commands\grade.md'
```

- [ ] Create `commands/grade.md`:

```md
---
disable-model-invocation: true
description: Grade a step of the pipeline on a fixture with a known key, a handoff cold start, or the term's free counts; every result is one row in ~/.claude/grades.jsonl.
argument-hint: "<fixture id> [runs] [--without <file>#<ID>] | coldstart <block file> | term [<since date>]"
---

You are grading the owner's config against ground truth someone can check. The
script decides every number; you run the step under test, the checks, and
the adjudicator. Arguments: $ARGUMENTS

A fixture is a repository at a commit (`head`) with a key: the faults known
to be there. Shipped fixtures live in `~/.claude/grading/fixtures/<id>/`
(setup replaces them on update); minted fixtures, and the copy the script
writes when a run grows a fixture's key, live in
`~/.claude/grading/local/<id>/`. A fixture's file is
`local/<id>/fixture.json` where that exists, else
`fixtures/<id>/fixture.json`. Never show the step under test the key, the
fixture file, or anything after `head`.

## 1. A fixture run: `<fixture id> [runs] [--without <file>#<ID>]`

1. Read the fixture. If its `status` is `draft`, stop: a draft has not
   passed its self-check. If a `--without` example is in its `held_out`
   list, stop: that arm would measure leakage, not help (the script refuses
   it too).
2. Check out the fixture for each run, so nothing past `head` can be read.
   First write the commits that are not `head` or before it to
   `<scratch>/<id>-later.txt` from a full clone:
   `git -C <source> rev-list --all ^<head>`. Then
   `git clone --no-local <repo> <scratch>/<id>-<n>` (a URL or a local path),
   and in it `git checkout --detach <head>`, `git remote remove origin`,
   delete every branch and tag
   (`git for-each-ref --format='%(refname)' refs/heads refs/tags | xargs -n1 git update-ref -d`),
   and drop the reflog and every object no ref reaches (the reflog still
   names the clone's tip):
   `git reflog expire --expire=now --all && git gc -q --prune=now`. Check
   it: `while read -r c; do git cat-file -e "$c" 2>/dev/null && echo "$c"; done < <scratch>/<id>-later.txt`
   must print nothing; if it prints a commit, stop.
3. Build the brief from the step's current text: for `clearing-review`, the
   clearing-review section of `~/.claude/skills/build/SKILL.md` and
   `clearing-review-examples.md` beside it; for `reading-critique`, the
   `critique` skill and its examples; for `executing-critique`,
   `writing-plans/plan-executing-critique-prompt.md` and its examples. Copy
   each examples file into the brief minus every entry named in `held_out`
   and every `--without` entry (an entry is its `## <ID>.` heading through
   the line before the next `## `). Tell the reviewer it reviews `head`
   against `base` in the checkout, to label every finding with its severity
   as its first word (Blocker, Major, Minor or Nit), one finding a
   paragraph, and to put anything that is not a finding under a heading
   `## Notes`. Say it may not fetch anything or read outside the checkout.
4. Cost gate: say how many agents (the runs, plus up to one adjudicator a
   run) and what this step has cost before, from `~/.claude/COSTS.md` (a
   clearing review: 66k to 326k tokens, median 149k, on 27 runs to
   2026-11-13), or "not yet measured"; ask run, lighter or skip.
5. Name each run `<id>-<date>-<n>`, with today's local date as `date +%F`
   prints it, so a run in a later term never takes an earlier run's name
   (and its rows). Spawn one fresh subagent per run with the brief, its
   first line `Run <id>-<date>-<n>.` Save each report to
   `<scratch>/<id>-<n>.md` and its transcript to `<scratch>/<id>-<n>.jsonl`:
   once it returns, the `.jsonl` in
   `~/.claude/projects/<project>/<this session's id>/subagents/` that
   `grep -lF "Run <id>-<date>-<n>."` names (runs spawned together finish in
   any order, so the newest file is not always this run's).
6. For each run: `node ~/.claude/scripts/grade.mjs leaks <scratch>/<id>-<n>.jsonl <fixture.json> --later <scratch>/<id>-later.txt --examples-root ~/.claude`.
   Exit 1 means a leak: keep the run, and pass the count as
   `--leak-flags <n>` below.
7. Score: `node ~/.claude/scripts/grade.mjs score <fixture.json> <scratch>/<id>-<n>.md --model <model> --tokens <n> --run <id>-<date>-<n> [--without ...] [--leak-flags <n>]`,
   and for a fixture whose key carries a guard probe add
   `--checkout <scratch>/<id>-<n> --oracle ~/.claude/scripts/guard-oracle.mjs`:
   the script then runs the commands of each unmatched blocker or major
   finding that says the guard lets harm through in real bash, and asks the
   guard as committed at `head`. Every other unmatched finding is left for
   step 8.
8. Adjudicate what is left. The row's `severe_unmatched` lists every
   unmatched blocker or major finding; those not yet settled are its
   `unadjudicated` count. If it is above zero, spawn one fresh adjudicator
   (it wrote nothing here) with the checkout and those findings' text. Its
   job, per finding: make it fail at `head` (a test, a command, a probe),
   and run it. Reproduced: it failed as the finding says. Not reproduced:
   it tried and could not. It writes `[{"text": "<the finding, verbatim>", "verdict": "reproduced" | "not-reproduced", "class": "<short name>", "locator": {"file": "<path>", "lines": [a, b]}}]`
   to `<scratch>/<id>-<n>.verdicts.json`. Score again with
   `--verdicts <that file>` and the same `--run` name, the one step 5 gave
   (after midnight too): the table counts a run once, as its last row, and the script keeps what the run's last row
   settled (the guard's verdicts among them) and leaves out the key entries
   the run itself grew. A reproduced finding joins the key on its own,
   recorded in its `history`, in the copy under `~/.claude/grading/local/`.
9. Log every agent's tokens to `~/.claude/COSTS.md` as usual, naming the
   fixture and `head`.

## 2. A cold start: `coldstart <block file>`

1. Spawn one fresh subagent given only the block (no repository context,
   no session history). It runs the block's Ground truth line, then lists
   each contradiction between the block and that output, and each question
   it would have to ask before starting the block's task.
2. Save the ground-truth output it ran to a file, then
   `node ~/.claude/scripts/grade.mjs handoff <block file> <ground truth file> --coldstart --questions <n>`,
   where n is the count of questions it listed.

## 3. The term's free counts: `term [<since date>]`

No agents. Run, in order, with `--since` when given:

1. `node ~/.claude/scripts/grade.mjs cite`
2. `node ~/.claude/scripts/grade.mjs reasks`
3. `node ~/.claude/scripts/grade.mjs field`
4. `node ~/.claude/scripts/grade.mjs table`

Show the table (a line per fixture and per `--without` arm: an arm's
recall beside its fixture's plain line is what the examples left out were
worth), the uncited examples (retirement candidates for
`/reflect`, never retired here), and field recall's unread lines.
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 34 pass, 0 fail, 0 skipped, of 34.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **the usage misspells an option**: in `scripts/grade.mjs` replace `[--leak-flags <n>]` with `[--leak-flagsx <n>]`; fails: "the callers (/grade, /handoff, /perturb, setup) name only subcommands and options grade.mjs accepts, each option exactly, and together every subcommand but probes".
  - **/perturb's mining step runs no grader**: in `skills/perturb/SKILL.md` replace `` `node ~/.claude/scripts/grade.mjs perturb <branch> --repo <repo>` `` with `the grader`; fails: "the callers (/grade, /handoff, /perturb, setup) name only subcommands and options grade.mjs accepts, each option exactly, and together every subcommand but probes".

- [ ] Commit: "Grade: the /grade command"; the body says the brief is
  built from the current skill text minus held-out examples, so the
  current config is graded on old heads, and that the checkout drops its
  reflog so nothing past `head` can be read.

### T9: setup and docs

**Depends on:** T8
**Files:** modify `.claude/skills/setup-config/SKILL.md` (opening,
update mode, step 8.4, 8.7, 8.8, step 10, close), `templates/charter.template.md`
(Review cadence), `templates/addendum.template.md` (user-only skills),
`README.md` (install, table, layout)
**Seams:** the suite's caller test (T8) reads setup's `mint
--from-history` line; the rest is checked by the full verify and the
greps below
**Interfaces:** none
**Verify:** the full verify (header), then
`grep -c "grading/" .claude/skills/setup-config/SKILL.md` (expected 7, measured),
`grep -c "scripts grading templates" .claude/skills/setup-config/SKILL.md`
(expected 1: update mode's pathspec) and
`grep -c "/grade" README.md templates/addendum.template.md templates/charter.template.md`
(expected at least 1 each)

Update mode reads `grading/` too: its git pathspec and its without-git
baseline name it, so an update installs new and changed shipped fixtures
(and the installed suite's shipped-fixtures test has them). Step 10 runs
the grade suite beside the guard suites, from Git Bash on Windows, since
its probe tests run real bash; and, in full setup only, offers once to
mint fixtures from the history of one repository the adopter names,
saying it takes minutes and writes drafts and ready fixtures for the
adopter to review (the owner's ruling).

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
computational physics). This repo is the source: `PRIMER.md`,
`skills/`, `commands/`, `scripts/` and `templates/`. The install target is
```

with

```md
computational physics). This repo is the source: `PRIMER.md`, `skills/`,
`commands/`, `scripts/`, `grading/` and `templates/`. The install target is
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
   - With git: upstream changes are `git diff <sha> HEAD -- skills commands
     scripts templates`; local edits are what is installed against the
     installed-from version (`git show <sha>:<path>`).
   - Without git: upstream changes are the baseline against the current
     source; local edits are what is installed against the baseline.
```

with

```md
   - With git: upstream changes are `git diff <sha> HEAD -- skills commands
     scripts grading templates`; local edits are what is installed against
     the installed-from version (`git show <sha>:<path>`).
   - Without git: upstream changes are the baseline (`skills/`,
     `commands/`, `scripts/`, `grading/` and `templates/`) against the
     current source; local edits are what is installed against the
     baseline.
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
   `skills/perturb`, `commands/handoff.md` and `scripts/` move together:
   `/build`'s Stop hook, `/perturb`'s guard and `/handoff` run those
   scripts, so never install any of them at a version whose scripts are
   missing or kept at an older version. Changes in `templates/` are
```

with

```md
   `skills/perturb`, `commands/handoff.md`, `commands/grade.md`,
   `grading/` and `scripts/` move together: `/build`'s Stop hook,
   `/perturb`'s guard, `/handoff` and `/grade` run those scripts, so never
   install any of them at a version whose scripts are missing or kept at
   an older version. Changes in `templates/` are
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
   folder, then copy the current source's `skills/`, `commands/`,
   `scripts/` and `templates/` in its place. Otherwise the next update
   misreads accepted changes as conflicts. Run the step 10 checks that
   apply, and stop.
```

with

```md
   folder, then copy the current source's `skills/`, `commands/`,
   `scripts/`, `grading/` and `templates/` in its place. Otherwise the
   next update misreads accepted changes as conflicts. Run the step 10
   checks that apply, and stop.
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
4. **Costs log**, only if the cost gate is on:
```

with

```md
4. **Costs log**, only if the cost gate is on (if it is off, write
   `~/.claude/ESCAPES.md` instead, with the header "# Escapes" and only
   the "## Escapes" section below, so `/reflect` has somewhere to log
   escapes and the grader something to read):
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
into `~/.claude/commands/` and `scripts/*` into `~/.claude/scripts/`,
   minus the kept collisions.
```

with

```md
into `~/.claude/commands/`, `scripts/*` into `~/.claude/scripts/` and
   `grading/*` into `~/.claude/grading/`, minus the kept collisions.
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
   also copy this source's `skills/`, `commands/`, `scripts/` and
   `templates/` to `~/.claude/setup-backups/baseline/` for `update` to compare against; it
   is raw source, so it holds template markers, and it is not the adopter's
   backup.
```

with

```md
   also copy this source's `skills/`, `commands/`, `scripts/`, `grading/`
   and `templates/` to `~/.claude/setup-backups/baseline/` for `update`
   to compare against; it is raw source, so it holds template markers,
   and it is not the adopter's backup.
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md

A running session does not reload skills. Ask the adopter to open a new
```

with

```md
- **The grader works on this machine:** with Node,
  `node --test ~/.claude/scripts/grade.test.mjs` must pass every test. Its
  probe tests run generated commands in real bash through
  `guard-oracle.mjs`, and its minting tests run git, so on Windows run it
  from Git Bash, in the background with the guard suites. Report any
  failure as it is. Without Node the grader is unavailable; say so.
- **Fixtures from history**, in full setup only (`update` skips it):
  offer once, with Node, to mint grading fixtures from one repository the
  adopter names, a local clone with merged pull requests and tests:
  `node ~/.claude/scripts/grade.mjs mint --from-history <repo> [--base <branch>]`.
  Say that it takes minutes (it runs each fix's test at two commits) and
  writes fixtures to `~/.claude/grading/local/` for the adopter to review
  before any is scored: a draft names what its self-check failed, and a
  ready one is the history's reading, not a ruling. Run it only on a yes,
  in the background.

A running session does not reload skills. Ask the adopter to open a new
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
- **The review cadence** in the charter: each term, drop what nobody uses.
```

with

```md
- **The review cadence** in the charter: each term, drop what nobody uses;
  `/grade term` prints the grader's table for it, and `/grade <fixture>`
  scores a step on a fixture with a known key.
```

- [ ] In `templates/charter.template.md`, replace

```md
escapes, per agent step (from `COSTS.md`). A rule nobody uses is not a rule.
```

with

```md
escapes, per agent step (from `COSTS.md`), beside the grader's table
(`/grade term`). A rule nobody uses is not a rule.
```

- [ ] In `templates/addendum.template.md`, replace

```md
- `/perturb`: wide latitude on a showcase branch to mine, behind a guard hook.
```

with

```md
- `/perturb`: wide latitude on a showcase branch to mine, behind a guard hook.
- `/grade`: score a step on a fixture with a known key, a handoff cold
  start, or the term's free counts.
```

- [ ] In `README.md`, replace

```md
later, and `/perturb`'s guard needs Node too (setup checks for it);
```

with

```md
later, and `/perturb`'s guard and the grader need Node too (setup checks for it);
```

- [ ] In `README.md`, replace

```md
| `/handoff` | Closes a session: reflect, verify, land the work, write a handoff for the next session. |
```

with

```md
| `/handoff` | Closes a session: reflect, verify, land the work, write a handoff for the next session. |
| `/grade` | Scores the pipeline's steps against ground truth someone can check: a review on a fixture whose faults are known, a handoff block against git and GitHub, field recall from your escapes log, and how often each worked example is cited. One row per result in `~/.claude/grades.jsonl`; `/grade term` prints the table for your term review. |
```

- [ ] In `README.md`, replace

```md
`PRIMER.md` is the required reading. `skills/`, `commands/` and `scripts/`
are copied into `~/.claude` by setup;
```

with

```md
`PRIMER.md` is the required reading. `skills/`, `commands/`, `scripts/` and
`grading/` (the grader's fixtures) are copied into `~/.claude` by setup;
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 34 pass, 0 fail, 0 skipped, of 34.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **setup gives mint an option it lacks**: in `.claude/skills/setup-config/SKILL.md` replace `mint --from-history <repo>` with `mint --from-histroy <repo>`; fails: "the callers (/grade, /handoff, /perturb, setup) name only subcommands and options grade.mjs accepts, each option exactly, and together every subcommand but probes".

- [ ] Run the full verify (header); every suite green.
- [ ] Commit: "Setup: install and test the grader; docs name /grade".

## After merge (the owner's word, not `/build`)

1. Install: `/setup-config update` from this repository.
2. Mint the private critique fixtures from the escapes already logged
   (the 2026-10-10 reading critique, the 2026-10-29 executing-critique
   passes, kymograph PR 7's two of 2026-11-15) with `mint`, on the
   maintainer's machine; they land in `~/.claude/grading/local/` and
   never enter this repository. The 2026-11-21 fold escapes mint nothing
   (folds are not a graded step).
3. The first term run: `/grade term`, then `/grade pr13-round1 3`,
   `/grade pr13-round4 3` and `/grade pr13-round8 3` behind the cost gate
   (nine clearing reviews, about 1.3M tokens at the median of 149k).
4. The maintainer's private term-review list gains the table at its
   tokens-beside-findings item.
5. A docs pull request removes this plan file.

## Choices for the owner's review

Calls the spec left open, made while building the plan (Claude's lane:
internals no student sees). The owner has ruled on seven critique
findings already (the leak check drops the repository's name;
`--from-history` reads every commit and counts a fix only against a
different, earlier pull request; a history fixture with no test probe
stays a draft; the `Re-asked:` sentence goes into spec-first, critique
and `/reflect`; a history entry needs a subject naming a fix and a test
at head, and failing entries are dropped; run names carry the date;
`/perturb`'s mining step and first-install setup call the two commands
that had no caller); those are built as ruled and are not listed here.

1. A locator with lines `[0, 0]` names the whole file; the PR 13 entries
   use it, since the guard's faults are not one line range.
2. A key holds the faults the real rounds rated blocker or major, plus
   the oracle-shown classes; minors are counted, not keyed.
3. A finding under a heading that starts "Notes" is not a finding;
   `/grade`'s brief puts non-findings there and asks for severity labels
   (ruled by the owner: kept, in the brief only).
4. A fixture row carries `run`, `unadjudicated` and `settled` (beyond the
   spec's list): `run` so a run scored again counts once in the table,
   `unadjudicated` so an unsettled finding is neither a hit nor a false
   alarm, `settled` so a rescore keeps the guard's verdicts and the row
   names who settled each finding.
5. A new `probes` subcommand re-proves a shipped guard fixture's key at
   its head, so the fixture's probe fields have a reader and an adopter
   can check them.
6. `--from-history`'s regex is the fix subject's two longest words but
   stop words, both required, in either order.
7. An adopter with no `COSTS.md` gets `ESCAPES.md` from setup; `/reflect`
   logs there and `field` reads it, reporting escapes alone.
8. A grown key entry's regex is the finding's longest backticked span, or
   its first eight words.
9. Where fixtures live (the spec put minted ones in
   `~/.claude/grading/fixtures/`): shipped fixtures stay there,
   setup-owned and replaced on update; minted fixtures and any grown copy
   of a shipped one go to `~/.claude/grading/local/`, which `/grade` reads
   first, so an update never overwrites a grown key and the installed
   suite tests only what ships. Cost if wrong: a grown copy hides a later
   upstream fix to its shipped fixture until the copy is deleted.
10. Under `--from-history`, every first-parent commit that is not a merge
    counts as its own pull request, a direct commit as well as a squash
    merge (git cannot tell them apart). Cost if wrong: a repository that
    commits straight to main mints fixtures for single commits.
11. A rescore with the same `--run` reads the last row of that fixture
    and run in `grades.jsonl` for the verdicts already settled, and
    leaves out the key entries the run grew; with run names dated (the
    owner's ruling), a later term's run starts clean. Cost if wrong: a run
    renamed between the two scorings is scored as two runs.
12. The guard probe takes only findings that claim harm let through, by
    vocabulary; any other unmatched severe finding goes to the
    adjudicator. Cost if wrong: a harm finding worded without those words,
    or with the guard as the one refusing, costs an adjudicator's tokens;
    an over-refusal worded with harm words and none of the refusal words
    (no "refused", "blocked", "over-refusal", nor the guard refusing) is
    still probed, and the guard's refusal settles it as a false alarm.
13. Field recall by repo tag: an escape takes the tag of the review lines
    its step names by date, else the one tag its text names, else `?`.
    Cost if wrong: escapes sit under `?` and per-tag recall reads high.
14. `selfCheck` names every problem a fixture has (a missing `head` alone
    stops it, and the test holds it to that), so a draft's `self_check`
    lists all there is to fix.
15. A history fixture that keeps some entries lists the dropped ones'
    problems under `dropped` (a new field) and stays `ready`; `mint`
    prints them after its line. Every other minted fixture still drafts
    whole on any problem: an escape fixture has one entry, and the ruling
    was about history. Cost if wrong: a reader of `self_check` alone
    misses why a ready fixture has fewer entries than its fixes.
16. The table names an ablation arm `<step> <id> without <file#ID>, ...`,
    the list sorted, so two runs that left out the same examples in a
    different order share a line. Cost if wrong: none beyond a label.
17. `/perturb`'s mining step reaches the mining session through the
    closing block's task, since that session does not load `/perturb`.
    Cost if wrong: a block that drops the line leaves the branch's row
    unwritten until someone runs the command.
18. Setup's offer of `mint --from-history` sits in step 10, after the
    grade suite has passed, and runs in the background on a yes; `update`
    never offers it. Cost if wrong: an adopter who skips it at install
    must find the command in the setup skill later.
19. `leaks` also looks for a held-out heading as a transcript line's
    JSON escapes it (a quote becomes `\"`), the cheap fix of a critique's
    plausible miss. Left: a reproduced finding reworded later grows its
    class a second key entry, since telling a reworded fault from a new
    one is judgement the adjudicator would need the key to make; each
    entry matches its own wording, so recall counts the class twice.
20. `/grade` step 5 finds a run's transcript by the run name on its
    brief's first line (`grep -lF`), not as the newest file, since runs
    spawned together finish in any order.

## Overnight readiness

Every task names its seams and its verify command. One thing is not
settled by the plan alone: the subagent premise (preflight 2), which may
change T8's step 3. The oracle is on main, so no test skips and T3's
by-hand check can run. Attended `/build` can start now; overnight once
the premise is settled. The plan is not ready for either until an
executing critique comes back clean.
