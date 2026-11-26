# Grading function implementation plan

**Goal:** a grader that scores each step of the pipeline against ground
truth someone can check (replayed real escapes, git and GitHub, the
escapes log), ships to adopters, and is read each term beside `COSTS.md`.
**Architecture:** one node script, `scripts/grade.mjs` (no dependencies,
one subcommand per check), appends one JSON row per result to
`~/.claude/grades.jsonl` and prints the term's table. A fixture is a
repository at a commit plus a key of the faults known to be there: three
ship under `grading/fixtures/` (this repository's PR 13, replayed), and
more are minted under `~/.claude/grading/fixtures/` from logged escapes
and from history. A user-only command, `/grade` (`commands/grade.md`),
runs a step on a fixture in an ordinary session, so the config graded is
the config in use; `/handoff` gains a block check and minting.
**Spec:** `~/.claude/specs/grading.md` (the owner's private copy). This
plan carries everything a task needs; the spec decides where they differ.
**Verify:** `bash scripts/ground-truth.test.sh && bash scripts/build-stop-gate.test.sh && node --test scripts/ledger.test.mjs && bash scripts/commit-scan.test.sh && node --test scripts/perturb-guard.test.mjs && bash scripts/perturb-hook.test.sh && node --test scripts/grade.test.mjs`

This plan file lives on its pull request's branch and leaves the
repository by a docs pull request after merge (see "After merge").

How it was built: every code block below was written and run in a scratch
tree of main at 8e8a24a on Windows 11 (Git Bash, node 24.14.1, git 2.54).
A script then applied the tasks in order, exactly as written here, to a
fresh export of main at that commit, ran each task's red and green steps
and each named mutant alone on the full suite (with the oracle beside the
script), and checked that the files it ended with are, byte for byte, the
tested files. Every expected output quoted below is copied from those
runs. With the oracle present the full suite ran 23 pass, 0 fail, 0 skipped, of 23.

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
  unusable input, nothing written. `GRADE_HOME` (default `~/.claude`)
  holds `grades.jsonl`; `GRADE_TODAY` fixes the date for tests.
- Fixture (`fixture.json`): `id`, `step` (`clearing-review`,
  `reading-critique`, `executing-critique`, `handoff`), `source`, `repo`
  (a URL or a local path), `head`, `base`, `held_out` (examples a run may
  not see, as `<examples file path>#<ID>`), `key` (each entry: `id`,
  `class`, `match` (a regex, matched case-folded), `locator` (`file` and
  `lines`; `[0, 0]` is the whole file), optional `source`, `probe` and
  `fix_commit`), and, written by the script, `history`, `status` (`ready`
  or `draft`) and `self_check`.
- Row (one JSON line in `grades.jsonl`): `date`, `config` (the
  `~/.claude` commit, or `unversioned`), `kind` (`fixture`, `handoff`,
  `coldstart`, `perturb`, `cite`, `reasks`, `field`) and that kind's
  counts; a `fixture` row adds `step`, `fixture`, `head`, `run`, `model`,
  `tokens`, `held_out`, `without`, `leak_flags`, `key_size`, `hits`,
  `findings`, `severe_unmatched`, `false_alarms`, `new_faults`,
  `unadjudicated`, `minor_unmatched`.
- A finding is a paragraph or list item of a report; its severity is its
  own leading label, else its heading's, else major; nothing under a
  heading that starts "Notes" is a finding.
- The guard probes use `scripts/guard-oracle.mjs`, which pull request 16
  adds. Where it is not beside `grade.mjs`, the two tests that need it
  skip by name, and `score` runs no probe.

## File map

| File | Job |
|---|---|
| `scripts/grade.mjs` (create) | The grader: rows, fixtures, findings, scoring, leaks, the table (T1); the guard probe (T2); the shipped fixtures' own check (T3); the handoff check (T4); minting (T5); citations and re-asks (T6); field recall and perturb rows (T7). |
| `scripts/grade.test.mjs` (create) | Its suite, one block per task, each test shown able to fail by a named mutant. |
| `grading/fixtures/pr13-round{1,4,8}/fixture.json` (create) | The reference fixtures (T3). |
| `commands/grade.md` (create) | `/grade`, the runner (T8). |
| `commands/handoff.md` (modify) | The block check before emitting (T4); minting after reflect (T5). |
| `commands/reflect.md` (modify) | Escapes also go to `ESCAPES.md`, naming the commits (T5). |
| `.github/workflows/test.yml`, `CLAUDE.md`, `README.md` caption (modify) | The suite joins verify and CI (T1). |
| `.claude/skills/setup-config/SKILL.md`, `README.md`, `templates/charter.template.md`, `templates/addendum.template.md` (modify) | Setup installs and tests the grader; the docs name it (T9). |

Every task edits `scripts/grade.mjs` or its suite, so the tasks run one
after another (T1 to T9); none can run beside another without a merge
conflict in those two files.

## Preflight (by hand, before `/build`; not a precondition)

1. Rebase onto main. Pull request 16 (the oracle) and the pull requests
   mined from the 2026-11-25 showcase change `CLAUDE.md`'s Verify bullet,
   the workflow, the README caption, setup's step 10 and the addendum
   template's user-only list. Where an old text in T1 or T9 no longer
   matches, re-read the file and make the same change to what is there,
   counting suites from the base (the caption's count is the base's plus
   one).
2. Whether pull request 16 is merged. If not, T2 and T3's oracle tests
   skip, and T3's by-hand probe check waits for it.
3. Whether a subagent spawned from an ordinary session sees the user
   `CLAUDE.md` (the charter): spawn one and ask it to quote the first line
   of its user instructions. If it does not, `/grade`'s brief (T8, step 3)
   must carry the charter's text; amend T8 before building it.
4. Where a subagent's transcript is written (for `leaks`): after the
   probe in 3, find the newest `.jsonl` under `~/.claude/projects/`, and
   put its path pattern in T8's step 5 in place of "the subagent's JSONL
   under `~/.claude/projects/`".

### T1: the scorer core, in verify and CI

**Depends on:** none
**Files:** create `scripts/grade.mjs`, `scripts/grade.test.mjs`; modify
`.github/workflows/test.yml`, `CLAUDE.md` (Verify bullet), `README.md`
(badge caption)
**Seams:** `checkFixture`, `readFixture`, `parseFindings`, `score`,
`growKey`, `leaks`, `table`, `readRows`, `appendRow`; the CLI
`score`, `leaks` and `table`
**Interfaces:** produces `GradeError`, `home()`, `today()`,
`appendRow(row, dir?)`, `readRows(dir?)`, `checkFixture(f, where?)`,
`readFixture(file)`, `STEPS`, `parseFindings(report) -> [{text, severity}]`,
`score(fixture, report, verdicts?) -> {key_size, hits, findings, severe_unmatched, false_alarms, new_faults, unadjudicated, minor_unmatched}`,
`growKey(fixture, verdicts, run)`, `leaks(transcript, fixture, {later, examplesRoot})`,
`table(rows, since?)`, `parseArgs(argv, flags)`, `main(argv)`; the
`commands` object, the `USAGE` string and the `// ---- command line`
section every later task inserts into
**Verify:** `node --test scripts/grade.test.mjs`

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
    '  continues here.', '', 'Minor: a comment is wrong.', '',
    '## Notes', '', 'Ran 22 mutants.', '',
    '## Nits (2)', '', '1. spacing', '2) wording',
  ].join('\n');
  assert.deepEqual(G.parseFindings(report), [
    { text: 'Not cleared.', severity: 'major' },
    { text: '- `nohup cd <other>; rm CLAUDE.md` gets through.', severity: 'major' },
    { text: '- Second major continues here.', severity: 'major' },
    { text: 'Minor: a comment is wrong.', severity: 'minor' },
    { text: '1. spacing', severity: 'nit' },
    { text: '2) wording', severity: 'nit' },
  ]);
  assert.deepEqual(G.parseFindings('## Blockers\n\nCI never ran.\r\n'), [{ text: 'CI never ran.', severity: 'blocker' }]);
});

test('score: hits by regex, case-folded; unmatched severe findings settled by verdicts; minors counted only', () => {
  const report = '## Major\n\n- `NOHUP cd x; rm y` passes\n- a made-up problem\n- another one\n\n## Minor\n\n- style\n';
  const r = G.score(fixture(), report, [{ text: '- a made-up problem', verdict: 'not-reproduced' }]);
  assert.deepEqual(r, {
    key_size: 2, hits: ['k1'], findings: 4, severe_unmatched: ['- a made-up problem', '- another one'],
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

test('leaks: a later commit, the repository slug, a held-out heading; a clean transcript has none', (t) => {
  const root = tmp(t);
  fs.mkdirSync(path.join(root, 'skills/build'), { recursive: true });
  put(root, 'skills/build/clearing-review-examples.md', '# x\n\n## C9. The oracle found it (real)\n');
  const f = fixture();
  const opts = { later: ['1234567aaaa', 'short'], examplesRoot: root };
  assert.deepEqual(G.leaks('read 1234567 then github.com/o/r; C9. The oracle found it (real)', f, opts),
    ['later commit 1234567', 'repository o/r', 'held-out example skills/build/clearing-review-examples.md#C9']);
  assert.deepEqual(G.leaks('reviewed abc1234 against def5678', f, opts), []);
});

test('score CLI: appends one row; refuses a held-out ablation and a draft fixture; grows the key file', (t) => {
  const h = tmp(t);
  const fx = put(h, 'fx.json', JSON.stringify(fixture()));
  const rep = put(h, 'r.md', '## Major\n\n- `nohup cd a; rm b`\n- `env cd <other>; rm CLAUDE.md`\n');
  const ver = put(h, 'v.json', JSON.stringify([{ text: '- `env cd <other>; rm CLAUDE.md`', verdict: 'reproduced' }]));
  const r = cli(h, 'score', fx, rep, '--verdicts', ver, '--tokens', '1000', '--model', 'm', '--run', 'r1');
  assert.equal(r.status, 0, r.stderr);
  const rows = G.readRows(h);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'fixture');
  assert.equal(rows[0].config, 'unversioned');
  assert.deepEqual([rows[0].hits, rows[0].new_faults.length, rows[0].tokens], [['k1'], 1, 1000]);
  assert.equal(JSON.parse(fs.readFileSync(fx, 'utf8')).key.length, 3);
  const held = cli(h, 'score', fx, rep, '--without', 'skills/build/clearing-review-examples.md#C9');
  assert.equal(held.status, 2);
  assert.match(held.stderr, /refused: skills\/build\/clearing-review-examples.md#C9 is held out of fx/);
  const draft = put(h, 'd.json', JSON.stringify(fixture({ status: 'draft' })));
  assert.match(cli(h, 'score', draft, rep).stderr, /refused: fx is a draft fixture/);
  assert.equal(G.readRows(h).length, 1, 'refusals write nothing');
});

test('table: recall per fixture, leak-flagged runs counted and left out of the means', () => {
  const run = (hits, leak, tokens) => ({ date: '2030-01-02', kind: 'fixture', step: 'clearing-review', fixture: 'fx', key_size: 4,
    hits: Array(hits).fill('k'), false_alarms: 1, new_faults: [], unadjudicated: 0, leak_flags: leak, tokens });
  const out = G.table([run(2, 0, 100), run(4, 0, 300), run(0, 1, 200), { ...run(4, 0, 9), date: '2029-01-01' }], '2030-01-01');
  assert.match(out, /\| clearing-review fx \| 3 \| 0\.75 \| 1 \| 0 \| 0 \| 1 \| 200 \|/);
  const again = G.table([{ ...run(0, 0, 100), run: 'a' }, { ...run(4, 0, 100), run: 'a' }, { ...run(2, 0, 100), run: 'b' }]);
  assert.match(again, /\| clearing-review fx \| 2 \| 0\.75 \|/, 'run a scored twice counts once, as its last row');
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
// Usage: node grade.mjs <score|handoff|mint|cite|reasks|field|leaks|table|perturb> [args]  (see usage below)
// Exit 0 = done; 1 = the check found something (a contradiction, a leak, a draft fixture); 2 = refused or unusable
// input, nothing written. GRADE_HOME (default ~/.claude) holds grades.jsonl; GRADE_TODAY fixes the date.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export class GradeError extends Error {}
export const home = () => process.env.GRADE_HOME ?? path.join(os.homedir(), '.claude');
export const today = () => process.env.GRADE_TODAY ?? new Date().toISOString().slice(0, 10);
const read = (file) => {
  try { return fs.readFileSync(file, 'utf8'); } catch { throw new GradeError(`cannot read ${file}`); }
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
  const m = /^[\s*_#>:-]*(blocker|major|minor|nit)s?\b/i.exec(text);
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
export function score(fixture, report, verdicts = []) {
  const findings = parseFindings(report);
  const hit = new Set();
  const unmatched = [];
  for (const f of findings) {
    const ids = fixture.key.filter((e) => new RegExp(e.match, 'i').test(f.text)).map((e) => e.id);
    for (const id of ids) hit.add(id);
    if (ids.length === 0) unmatched.push(f);
  }
  const severeUnmatched = unmatched.filter(severe);
  const verdictOf = (f) => verdicts.find((v) => v.text === f.text)?.verdict;
  return {
    key_size: fixture.key.length,
    hits: fixture.key.map((e) => e.id).filter((id) => hit.has(id)),
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

// A run leaks when its transcript names a commit after the fixture's head, the fixture's repository by URL or
// owner/name, or the heading of an example the fixture holds out (the brief strips it, so the run read it).
export function leaks(transcript, fixture, { later = [], examplesRoot = null } = {}) {
  const found = [];
  for (const sha of later) if (sha.length >= 7 && transcript.includes(sha.slice(0, 7))) found.push(`later commit ${sha.slice(0, 7)}`);
  if (/^https?:\/\//.test(fixture.repo)) {
    const slug = fixture.repo.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');
    if (transcript.includes(slug)) found.push(`repository ${slug}`);
  }
  for (const h of fixture.held_out) {
    const [file, id] = h.split('#');
    if (!examplesRoot || !id) continue;
    const p = path.join(examplesRoot, file);
    if (!fs.existsSync(p)) continue;
    const head = read(p).split(/\r?\n/).find((l) => l.startsWith(`## ${id}.`));
    if (head && transcript.includes(head.slice(3))) found.push(`held-out example ${h}`);
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
// One line per fixture (run rows), and one per other kind. A run scored again (with an adjudicator's verdicts)
// counts once, as its last row. Runs with a leak flag are counted, and left out of the means.
export function table(rows, since = '0000-00-00') {
  const last = new Map();
  rows.forEach((r, i) => { if (r.kind === 'fixture' && r.run) last.set(`${r.fixture}\n${r.run}`, i); });
  const inTerm = rows.filter((r, i) => r.date >= since && !(r.kind === 'fixture' && r.run && last.get(`${r.fixture}\n${r.run}`) !== i));
  const lines = ['| What | Rows | Recall (mean) | False alarms (mean) | New faults | Unadjudicated | Leak-flagged | Tokens (median) |', '|---|---|---|---|---|---|---|---|'];
  const fixtures = [...new Set(inTerm.filter((r) => r.kind === 'fixture').map((r) => r.fixture))].sort();
  for (const id of fixtures) {
    const all = inTerm.filter((r) => r.kind === 'fixture' && r.fixture === id);
    const clean = all.filter((r) => !(r.leak_flags > 0));
    lines.push(`| ${all[0].step} ${id} | ${all.length} | ${fmt(mean(clean.map((r) => r.hits.length / r.key_size)))} | ${fmt(mean(clean.map((r) => r.false_alarms)))} | ${clean.reduce((a, r) => a + r.new_faults.length, 0)} | ${clean.reduce((a, r) => a + r.unadjudicated, 0)} | ${all.length - clean.length} | ${fmt(median(all.filter((r) => typeof r.tokens === 'number').map((r) => r.tokens)), 0)} |`);
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
    const verdicts = opt.verdicts ? JSON.parse(read(opt.verdicts)) : [];
    const result = score(fixture, report, verdicts);
    const row = appendRow({
      kind: 'fixture', step: fixture.step, fixture: fixture.id, head: fixture.head, run: opt.run ?? null, model: opt.model ?? null,
      tokens: opt.tokens ? Number(opt.tokens) : null, held_out: fixture.held_out, without,
      leak_flags: Number(opt['leak-flags'] ?? 0), ...result,
    });
    const grown = growKey(fixture, verdicts, opt.run ?? row.date);
    if (grown.key.length > fixture.key.length) fs.writeFileSync(pos[0], JSON.stringify(grown, null, 2) + '\n');
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
# A Windows job runs the guard suite alone (node only).
```

with

```yaml
# A Windows job runs the guard and grade suites (node only).
```

- [ ] In `.github/workflows/test.yml`, replace

```yaml
        run: bash scripts/perturb-hook.test.sh
```

with

```yaml
        run: bash scripts/perturb-hook.test.sh
      - if: ${{ !cancelled() }}
        run: node --test scripts/grade.test.mjs
```

- [ ] In `.github/workflows/test.yml`, replace

```yaml
    # The guard suite alone on Windows, where its drive-letter, /c/ and case-folding paths run. The bash suites
    # stay on Linux and macOS.
```

with

```yaml
    # The guard and grade suites on Windows, where the guard's drive-letter, /c/ and case-folding paths run. The
    # bash suites stay on Linux and macOS.
```

- [ ] In `.github/workflows/test.yml`, replace

```yaml
      - run: node --test scripts/perturb-guard.test.mjs
```

with

```yaml
      - run: node --test scripts/perturb-guard.test.mjs
      - if: ${{ !cancelled() }}
        run: node --test scripts/grade.test.mjs
```

- [ ] In `CLAUDE.md`, replace

```md
  `node --test scripts/perturb-guard.test.mjs` and
  `bash scripts/perturb-hook.test.sh`, all green. CI runs all six on
  Linux and macOS, and the guard suite (`node --test`) alone on Windows.
```

with

```md
  `node --test scripts/perturb-guard.test.mjs`,
  `bash scripts/perturb-hook.test.sh` and
  `node --test scripts/grade.test.mjs`, all green. CI runs all seven on
  Linux and macOS, and the guard and grade suites (`node --test`) on
  Windows.
```

- [ ] In `README.md`, replace

```md
(the scripts' six test suites on Ubuntu and macOS, and the guard suite
also on Windows; the skills themselves are prose and have no tests)
```

with

```md
(the scripts' seven test suites on Ubuntu and macOS, and the guard and
grade suites also on Windows; the skills themselves are prose and have no
tests)
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 7 pass, 0 fail, 0 skipped, of 7.

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **Notes not skipped**: in `scripts/grade.mjs` replace `notes = /^notes\b/i.test(h[1]);` with `notes = false;`; fails: "findings: a paragraph or list item each; labels from the paragraph, then its heading; unlabeled is major; Notes is skipped".
  - **an unlabeled finding is minor**: in `scripts/grade.mjs` replace `severity: labelOf(text) ?? heading ?? 'major'` with `severity: labelOf(text) ?? heading ?? 'minor'`; fails: "findings: a paragraph or list item each; labels from the paragraph, then its heading; unlabeled is major; Notes is skipped".
  - **matching is case-sensitive**: in `scripts/grade.mjs` replace `fixture.key.filter((e) => new RegExp(e.match, 'i').test(f.text))` with `fixture.key.filter((e) => new RegExp(e.match).test(f.text))`; fails: "score: hits by regex, case-folded; unmatched severe findings settled by verdicts; minors counted only".
  - **growKey adds an entry twice**: in `scripts/grade.mjs` replace `if (out.key.some((e) => new RegExp(e.match, 'i').test(v.text))) continue;` with `(nothing)`; fails: "growKey: a reproduced finding joins the key once, matched by its longest backticked span, with history".
  - **no duplicate-id check**: in `scripts/grade.mjs` replace `if (ids.has(e.id)) throw new GradeError(\`${where}: key entry ${e.id} appears twice\`);` with `(nothing)`; fails: "a fixture missing a field, with an unknown step, an empty key, a duplicate id or a bad regex is refused".
  - **no held-out refusal**: in `scripts/grade.mjs` replace `if (clash.length) throw` with `if (false) throw`; fails: "score CLI: appends one row; refuses a held-out ablation and a draft fixture; grows the key file".
  - **a draft fixture is scored**: in `scripts/grade.mjs` replace `if (fixture.status === 'draft') throw` with `if (false) throw`; fails: "score CLI: appends one row; refuses a held-out ablation and a draft fixture; grows the key file".
  - **a held-out leak goes unseen**: in `scripts/grade.mjs` replace `if (head && transcript.includes(head.slice(3))) found.push` with `if (false) found.push`; fails: "leaks: a later commit, the repository slug, a held-out heading; a clean transcript has none".
  - **leak-flagged runs in the means**: in `scripts/grade.mjs` replace `const clean = all.filter((r) => !(r.leak_flags > 0));` with `const clean = all;`; fails: "table: recall per fixture, leak-flagged runs counted and left out of the means".
  - **a run scored again counts twice**: in `scripts/grade.mjs` replace `!(r.kind === 'fixture' && r.run && last.get(\`${r.fixture}\n${r.run}\`) !== i)` with `true`; fails: "table: recall per fixture, leak-flagged runs counted and left out of the means".

- [ ] Commit: "Grade: score a review against a fixture's key"; the body
  says what a fixture, a hit and a false alarm are, and that verify and
  CI now run the suite.

### T2: the guard probe

**Depends on:** T1
**Files:** modify `scripts/grade.mjs`; test `scripts/grade.test.mjs`
**Seams:** `guardCases(text, sandbox)`, `probeGuard(texts, guardPath, oraclePath)`; the CLI `score --checkout --oracle`
**Interfaces:** consumes the oracle's `run` and `makeSandbox` (pull
request 16); produces `guardCases`, `probeGuard -> [{text, verdict}]`, and
the private `oracleRun(oraclePath, guard, build)` that T3 uses
**Verify:** `node --test scripts/grade.test.mjs`

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

const ORACLE = fileURLToPath(new URL('./guard-oracle.mjs', import.meta.url));

const GUARD = fileURLToPath(new URL('./perturb-guard.mjs', import.meta.url));

test('probeGuard: a guard that allows everything reproduces a harmful finding; the guard as it stands does not', { skip: !fs.existsSync(ORACLE) && 'guard-oracle.mjs is not beside grade.mjs' }, async (t) => {
  const dir = tmp(t);
  const open = put(dir, 'open-guard.mjs', 'process.exit(0);\n');
  const texts = ['Major: `nohup cd <other>; rm CLAUDE.md` from the config folder removes it.', 'Major: `cd <somewhere>; rm CLAUDE.md`', 'Major: prose only'];
  assert.deepEqual(await G.probeGuard(texts, open, ORACLE), [{ text: texts[0], verdict: 'reproduced' }]);
  assert.deepEqual(await G.probeGuard(texts, GUARD, ORACLE), [{ text: texts[0], verdict: 'not-reproduced' }]);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 1 failing of 9 (1 skipped: the oracle is not beside the script), these:

```
✖ guardCases: placeholders map to the oracle folders, both starts per family; an unplaceable span refuses
```

  with errors such as

```
TypeError: G.guardCases is not a function
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
// Each unmatched severe finding of a guard fixture: run its commands and ask the guard at the fixture's head.
// Harm let through is reproduced; harm refused, or no harm, is not reproduced; a finding with no command, or one
// the rules cannot place, is left for the adjudicator.
export async function probeGuard(texts, guardPath, oraclePath) {
  const ran = await oracleRun(oraclePath, guardPath, (s) => texts.flatMap((text, i) => (guardCases(text, s) ?? []).map((c) => ({ ...c, i }))));
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

- [ ] In `scripts/grade.mjs`, replace

```js
    const verdicts = opt.verdicts ? JSON.parse(read(opt.verdicts)) : [];
```

with

```js
    let verdicts = opt.verdicts ? JSON.parse(read(opt.verdicts)) : [];
    const probed = fixture.key.some((e) => e.probe?.kind === 'guard');
    if (probed && opt.checkout && opt.oracle) {
      const first = score(fixture, report, verdicts);
      const open = first.severe_unmatched.filter((t) => !verdicts.some((v) => v.text === t));
      const guard = path.join(opt.checkout, 'scripts', 'perturb-guard.mjs');
      verdicts = [...verdicts, ...(await probeGuard(open, guard, opt.oracle))];
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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 8 pass, 0 fail, 1 skipped, of 9 (the skips name the missing oracle).

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **an unplaceable span is kept**: in `scripts/grade.mjs` replace `if (/<[^<>]+>/.test(command)) return null;` with `(nothing)`; fails: "guardCases: placeholders map to the oracle folders, both starts per family; an unplaceable span refuses", "probeGuard: a guard that allows everything reproduces a harmful finding; the guard as it stands does not".
  - **the verdict ignores the guard**: in `scripts/grade.mjs` replace `verdict: p.mine.some((c) => c.let) ? 'reproduced'` with `verdict: p.mine.length ? 'reproduced'`; fails: "probeGuard: a guard that allows everything reproduces a harmful finding; the guard as it stands does not".

- [ ] Commit: "Grade: settle a guard finding in real bash"; the body
  names the placeholders a finding may use and why an unplaceable one is
  left for the adjudicator.

### T3: the PR 13 reference fixtures

**Depends on:** T2
**Files:** create `grading/fixtures/pr13-round1/fixture.json`,
`grading/fixtures/pr13-round4/fixture.json`,
`grading/fixtures/pr13-round8/fixture.json`; modify `scripts/grade.mjs`;
test `scripts/grade.test.mjs`
**Seams:** the shipped fixture files; `checkGuardProbes(fixture, repoDir, oraclePath)`; the CLI `probes`
**Interfaces:** consumes `readFixture`, `oracleRun`; produces
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
regex matches them and no other entry's (the test pins both). The probes
were run on 2026-11-26 through the oracle at pull request 16's head
4473b5d against each head's guard: of the eighteen commands the report
quotes, seventeen do harm the guard at 1abb851 lets through (all but
`builtin cd -@ sub; rm CLAUDE.md`, which round 1's own fix brought in),
six at f9178c3 (the wrapped, else, backgrounded, piped and negated-push
forms), and none at 65a01ab, where only the drive-less Write and Edit
path to the config gets through (on Windows). Round 4's blocker, a
conflict with main, is not in the tree and is left out.

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T3: shipped fixtures

const FIXTURES = fileURLToPath(new URL('../grading/fixtures/', import.meta.url));

test('shipped fixtures: each is valid; each key regex matches its own source and no other entry\'s', () => {
  const ids = fs.readdirSync(FIXTURES).sort();
  assert.deepEqual(ids, ['pr13-round1', 'pr13-round4', 'pr13-round8']);
  for (const id of ids) {
    const f = G.readFixture(path.join(FIXTURES, id, 'fixture.json'));
    assert.equal(f.id, id);
    for (const e of f.key) {
      assert.ok(new RegExp(e.match, 'i').test(e.source), `${id} ${e.id} misses its own source`);
      const cross = f.key.filter((o) => o !== e && new RegExp(e.match, 'i').test(o.source)).map((o) => o.id);
      assert.deepEqual(cross, [], `${id} ${e.id} also matches ${cross.join(', ')}`);
    }
  }
});

test('checkGuardProbes: a probe the head guard lets through passes; one it refuses is listed', { skip: !fs.existsSync(ORACLE) && 'guard-oracle.mjs is not beside grade.mjs' }, async (t) => {
  const dir = tmp(t);
  const g = (...a) => { const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t', '-C', dir, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g('init', '-q');
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'scripts/perturb-guard.mjs'), 'process.exit(0);\n');
  g('add', '-A'); g('commit', '-qm', 'open');
  const open = g('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'scripts/perturb-guard.mjs'), "process.stderr.write('perturb-guard: refused all'); process.exit(2);\n");
  g('commit', '-qam', 'shut');
  const shut = g('rev-parse', 'HEAD');
  const f = fixture({ key: [{ ...fixture().key[0], probe: { kind: 'guard', start: 'C', command: 'nohup cd {O}; rm CLAUDE.md' } }] });
  assert.deepEqual(await G.checkGuardProbes({ ...f, head: open }, dir, ORACLE), []);
  assert.deepEqual(await G.checkGuardProbes({ ...f, head: shut }, dir, ORACLE), [`k1: its probe does no harm, or the guard at ${shut} refuses it`]);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 1 failing of 11 (2 skipped: the oracle is not beside the script), these:

```
✖ shipped fixtures: each is valid; each key regex matches its own source and no other entry's
```

  with errors such as

```
Error: ENOENT: no such file or directory, scandir '<tree>\grading\fixtures\'
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
      "match": "\\bcd\\s+(-[PL]|--)\\s|\\bcd\\b[^.]{0,40}\\boption|\\boption[^.]{0,40}\\bcd\\b",
      "locator": { "file": "scripts/perturb-guard.mjs", "lines": [0, 0] },
      "probe": { "kind": "guard", "start": "O", "command": "cd -P {C}; rm CLAUDE.md" }
    },
    {
      "id": "cd-refused",
      "class": "the guard follows a cd that bash refuses",
      "source": "the guard followed a `cd` that bash refuses (`-@`, a missing folder, a file, two operands)",
      "match": "\\bcd\\s+-@|bash refuses|missing (folder|directory)|not a (folder|directory)|two operands|too many arguments|\\bcd\\b[^.]{0,40}\\b(fails|failed)\\b",
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
      "match": "\\(\\s*cd\\b|\\$\\(\\s*cd\\b|subshell|command substitution|inside parentheses",
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
      "match": "ignore line|whitelist|\\.gitignore[^.]{0,60}scan|scan[^.]{0,60}\\.gitignore",
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
        "platform": "win32"
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
  const guardAt = (s) => {
    const file = path.join(s.T, 'guard-at-head.mjs');
    fs.writeFileSync(file, execFileSync('git', ['-C', repoDir, 'show', `${fixture.head}:scripts/perturb-guard.mjs`]));
    return file;
  };
  const ran = await oracleRun(oraclePath, guardAt, (s) => probes.map((e) => ({
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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 9 pass, 0 fail, 2 skipped, of 11 (the skips name the missing oracle).

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **head probes always pass**: in `scripts/grade.mjs` replace `return ran.filter((c) => !c.let).map` with `return ran.filter(() => false).map`; fails: "checkGuardProbes: a probe the head guard lets through passes; one it refuses is listed".

- [ ] By hand, in a full clone with `scripts/guard-oracle.mjs` present
  (after pull request 16), from a scratch folder that holds a file of its
  own you can check survives: for each fixture,
  `node <repo>/scripts/grade.mjs probes <repo>/grading/fixtures/<id>/fixture.json --clone <repo> --oracle <repo>/scripts/guard-oracle.mjs`;
  expected for all three `probes failing: 0` (measured: exit 0 each). To
  see it fail, copy round 1's fixture with `"head": "8743947"` (PR 13's
  last head) and run it the same way; expected 10 lines
  `probe: <id>: its probe does no harm, or the guard at 8743947 refuses it`
  and `probes failing: 10` (measured).
- [ ] Commit: "Grade: ship PR 13's clearing rounds as fixtures"; the body
  gives the three heads, how each key was proved, and the recall the real
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
prints them at 8e8a24a: `== <path>`, `  origin/<branch>: <sha> ...`,
`    <path> [<branch>]: <state>` under `  worktrees:`, and
`    <branch>: <state>` under `  branches with no worktree, ...`. Run the
script with repo paths (as `/handoff` does), so the section names the
repository by its folder.

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T4: handoff

const GT = [
  'GROUND TRUTH, 2030-01-02 09:00 PST', '', '== ~/proj',
  '  origin/main: 8e8a24a 01-02 08:48 Merge pull request #17',
  '  worktrees:',
  '    ~/proj [main]: ahead 0 / behind 2 of origin/main',
  '    ~/proj/.claude/worktrees/a [feat-a]: = pushed, merged into origin/main',
  '    ~/proj/.claude/worktrees/b [feat-b]: = pushed, 1 patch(es) not in origin/main',
  '    ~/proj/.claude/worktrees/c [feat-c]: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)',
  '  branches with no worktree, not in origin/main:',
  '    feat-d: ahead 3 / behind 0 of the pushed branch',
  '    feat-e: not on origin, only on upstream',
  '  open PRs (o/proj):', '    #16 [feat-b] draft CI green, no Review line: B', '', 'GROUND TRUTH: complete', '',
].join('\n');

test('parseGroundTruth: the base head and each branch state, worktree lines and no-worktree lines', () => {
  const [r] = G.parseGroundTruth(GT);
  assert.equal(r.path, '~/proj');
  assert.deepEqual(r.base, { branch: 'main', sha: '8e8a24a' });
  assert.deepEqual(Object.keys(r.branches), ['main', 'feat-a', 'feat-b', 'feat-c', 'feat-d', 'feat-e']);
  assert.equal(r.branches['feat-d'], 'ahead 3 / behind 0 of the pushed branch');
});

test('checkHandoff: a clean block has none; each false header and State claim, sha and missing count is one', () => {
  const ok = 'Repo: proj, feat-a @ 1234567 (pushed and merged)\nState: feat-b is pushed, not merged; Rulings asked of the owner: 1; made by Claude: 0.\nYour task: x\n';
  assert.deepEqual(G.checkHandoff(ok, GT), []);
  const bad = [
    'Repo: proj, feat-b @ 1234567 (pushed and merged); proj, main @ 1111111 (pushed); nope, x @ 2222222 (pushed)',
    'State: feat-c is pushed. feat-d is pushed too. feat-e is pushed. feat-a is not merged. feat-z is merged.',
    'Your task: none',
  ].join('\n');
  assert.deepEqual(G.checkHandoff(bad, GT), [
    'header: feat-b claimed merged; ground truth: = pushed, 1 patch(es) not in origin/main',
    'header: main @ 1111111; ground truth: origin/main at 8e8a24a',
    'header: repo nope is not in ground truth',
    'State: feat-c claimed pushed; ground truth: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)',
    'State: feat-d claimed pushed; ground truth: ahead 3 / behind 0 of the pushed branch',
    'State: feat-e claimed pushed; ground truth: not on origin, only on upstream',
    'State: feat-a claimed not merged; ground truth: = pushed, merged into origin/main',
    'State: no "Rulings asked of the owner: N; made by Claude: M" line',
  ]);
  assert.deepEqual(G.checkHandoff('State: x', GT).slice(0, 1), ['header: no Repo: line']);
  assert.deepEqual(G.checkHandoff('Repo: proj, feat-q @ 1234567 (pushed)\nRulings asked of the owner: 0; made by Claude: 0', GT),
    ['header: branch feat-q is not in ground truth']);
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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 3 failing of 14 (2 skipped: the oracle is not beside the script), these:

```
✖ parseGroundTruth: the base head and each branch state, worktree lines and no-worktree lines
✖ checkHandoff: a clean block has none; each false header and State claim, sha and missing count is one
✖ handoff CLI: exit 1 and a row with the count; a cold start row carries its questions
```

  with errors such as

```
TypeError: G.parseGroundTruth is not a function or its return value is not iterable
TypeError: G.checkHandoff is not a function
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `// ---- command line`:

```js
// ---- handoff

// What ground-truth.sh printed: per repo (its "== <path>" section), the default branch's head, and each branch's
// state, from the worktree lines ("<path> [<branch>]: <state>") and the no-worktree lines ("<branch>: <state>").
export function parseGroundTruth(text) {
  const repos = [];
  let cur = null;
  let others = false;
  for (const line of text.split(/\r?\n/)) {
    const sec = /^== (.+)$/.exec(line);
    if (sec) { cur = { path: sec[1].trim(), base: null, branches: {} }; repos.push(cur); others = false; continue; }
    if (!cur) continue;
    const base = /^ {2}origin\/(\S+): ([0-9a-f]{7,40}) /.exec(line);
    if (base) { cur.base = { branch: base[1], sha: base[2] }; continue; }
    if (/^ {2}\S/.test(line)) others = /^ {2}branches with no worktree/.test(line);
    const wt = /^ {4}\S.* \[([^\]]+)\]: (.*)$/.exec(line);
    if (wt) { cur.branches[wt[1]] = wt[2]; continue; }
    const br = /^ {4}(\S+): (.*)$/.exec(line);
    if (br && others) cur.branches[br[1]] = br[2];
  }
  return repos;
}
// Pushed: a state that says so, or that is merged or behind the pushed branch; "not on origin" also says "on origin".
const isPushed = (state) => !/not on origin/.test(state) && /= pushed|merged into|ahead 0 \/|on origin/.test(state);
const isMerged = (state) => /merged into/.test(state);
// Claims a phrase makes about one branch: pushed or not, merged or not (absent when it says nothing).
function claims(words) {
  const w = words.toLowerCase();
  const c = {};
  if (/\b(not pushed|unpushed|local only)\b/.test(w)) c.pushed = false;
  else if (/\bpushed\b/.test(w)) c.pushed = true;
  if (/\b(not merged|unmerged)\b/.test(w)) c.merged = false;
  else if (/\bmerged\b/.test(w)) c.merged = true;
  return c;
}
// Every claim in the block's header (Repo: <name>, <branch> @ <sha> (<claims>), several separated by ";") and in
// each State sentence that names a known branch, checked against ground truth; plus the ruling count line.
export function checkHandoff(block, groundTruth) {
  const repos = parseGroundTruth(groundTruth);
  const out = [];
  const repoOf = (name) => repos.find((r) => r.path === name || r.path.endsWith(`/${name}`));
  const check = (where, repo, branch, c, sha) => {
    const state = repo.branches[branch];
    if (state === undefined && !(repo.base && repo.base.branch === branch)) { out.push(`${where}: branch ${branch} is not in ground truth`); return; }
    const st = state ?? 'merged into itself = pushed';
    if (c.pushed === true && !isPushed(st)) out.push(`${where}: ${branch} claimed pushed; ground truth: ${st}`);
    if (c.pushed === false && isPushed(st)) out.push(`${where}: ${branch} claimed not pushed; ground truth: ${st}`);
    if (c.merged === true && !isMerged(st) && !(repo.base && repo.base.branch === branch)) out.push(`${where}: ${branch} claimed merged; ground truth: ${st}`);
    if (c.merged === false && isMerged(st)) out.push(`${where}: ${branch} claimed not merged; ground truth: ${st}`);
    if (sha && repo.base && repo.base.branch === branch && !repo.base.sha.startsWith(sha) && !sha.startsWith(repo.base.sha)) {
      out.push(`${where}: ${branch} @ ${sha}; ground truth: origin/${branch} at ${repo.base.sha}`);
    }
  };
  const headers = [];
  for (const line of block.split(/\r?\n/)) {
    const m = /^\s*Repo:\s*(.*)$/.exec(line);
    if (!m) continue;
    for (const part of m[1].split(';')) {
      const h = /^\s*([^,]+),\s*(\S+)\s*@\s*([0-9a-f]{7,40})\s*(?:\(([^)]*)\))?/.exec(part);
      if (!h) { out.push(`header: cannot read "${part.trim()}"`); continue; }
      headers.push({ name: h[1].trim(), branch: h[2], sha: h[3], words: h[4] ?? '' });
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
    for (const sentence of state[1].replace(/\s+/g, ' ').split(/(?<=[.;])\s+/)) {
      for (const repo of repos) {
        for (const branch of Object.keys(repo.branches)) {
          const re = new RegExp(`(^|[\\s\`(])${branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\`),.;]|$)`);
          if (re.test(sentence)) check('State', repo, branch, claims(sentence));
        }
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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 12 pass, 0 fail, 2 skipped, of 14 (the skips name the missing oracle).

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **"not on origin" reads as pushed**: in `scripts/grade.mjs` replace `!/not on origin/.test(state) &&` with `(nothing)`; fails: "checkHandoff: a clean block has none; each false header and State claim, sha and missing count is one".
  - **no sha check**: in `scripts/grade.mjs` replace `if (sha && repo.base && repo.base.branch === branch && !repo.base.sha.startsWith(sha)` with `if (false && sha && repo.base && repo.base.branch === branch && !repo.base.sha.startsWith(sha)`; fails: "checkHandoff: a clean block has none; each false header and State claim, sha and missing count is one".
  - **State goes unchecked**: in `scripts/grade.mjs` replace `if (re.test(sentence)) check` with `if (false) check`; fails: "checkHandoff: a clean block has none; each false header and State claim, sha and missing count is one".

- [ ] Commit: "Grade: check a handoff block against ground truth"; the
  body says the check runs once, before emitting, so its row grades the
  first draft.

### T5: minting

**Depends on:** T4
**Files:** modify `scripts/grade.mjs`, `commands/handoff.md` (step 1),
`commands/reflect.md`; test `scripts/grade.test.mjs`
**Seams:** `selfCheck(fixture, repoDir)`, `writeMinted(fixture, repoDir, outDir)`, `wordsRegex(subject)`, `fromHistory(repoDir, {base, days, repoName})`; the CLI `mint` and `mint --from-history`
**Interfaces:** consumes `checkFixture`; produces `selfCheck -> [problem]`,
`writeMinted -> fixture` (with `status`), `wordsRegex -> string`,
`fromHistory -> [fixture]`
**Verify:** `node --test scripts/grade.test.mjs`

A fix commit, for `--from-history`, is a first-parent commit on the base
branch whose subject names a fix, or any commit within 30 days after a
merge; its changed lines are blamed back, and those written by a merged
pull request (reachable from the merge's second parent, not its first)
mint a fixture at that pull request's head (after the SZZ method:
Sliwerski, Zimmermann and Zeller, "When Do Changes Induce Fixes?", MSR
2005).

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T5: minting

// A repo whose main has: base (lines 1 and 2); a merged PR adding a bug as line 3 of lib.mjs; a fix commit that
// changes line 3, and line 1 (from base, not the PR), and adds a test which fails on the bug.
function historyRepo(t) {
  const dir = tmp(t);
  const env = ['-c', 'user.name=t', '-c', 'user.email=t', '-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main'];
  const g = (...a) => { const r = spawnSync('git', [...env, '-C', dir, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g('init', '-q');
  fs.writeFileSync(path.join(dir, 'lib.mjs'), 'export const add = (a, b) => a + b;\nexport const mul = (a, b) => a * b;\n');
  g('add', '-A'); g('commit', '-qm', 'base');
  g('checkout', '-qb', 'pr');
  fs.appendFileSync(path.join(dir, 'lib.mjs'), 'export const half = (x) => x / 3;\n');
  g('commit', '-qam', 'Add half');
  g('checkout', '-q', 'main');
  g('merge', '-q', '--no-ff', '-m', 'Merge pull request #1 from pr', 'pr');
  fs.writeFileSync(path.join(dir, 'lib.mjs'), 'export const add = (a, b) => b + a;\nexport const mul = (a, b) => a * b;\nexport const half = (x) => x / 2;\n');
  fs.writeFileSync(path.join(dir, 'lib.test.mjs'), "import { half } from './lib.mjs';\nimport assert from 'node:assert';\nimport { test } from 'node:test';\ntest('half', () => assert.equal(half(4), 2));\n");
  g('add', '-A'); g('commit', '-qm', 'Fix half dividing by three');
  return { dir, g };
}

test('wordsRegex: the two longest words of a subject, both required, in either order', () => {
  const re = new RegExp(G.wordsRegex('Fix half dividing by three'), 'i');
  assert.equal(G.wordsRegex('Fix half dividing by three'), '(?=[\\s\\S]*\\bdividing\\b)(?=[\\s\\S]*\\bthree\\b)');
  assert.ok(re.test('Major: three is the wrong divisor; dividing by it halves nothing'));
  assert.ok(!re.test('Major: dividing is wrong'));
});

test('fromHistory and selfCheck: the fix blames to the PR; its test fails at the PR head and passes at the fix', (t) => {
  const { dir, g } = historyRepo(t);
  const [f] = G.fromHistory(dir, { repoName: 'local/proj' });
  const pr = g('rev-parse', 'pr');
  assert.equal(f.id, `hist-${pr.slice(0, 7)}`);
  assert.equal(f.head, pr);
  assert.equal(f.key.length, 1);
  assert.deepEqual(f.key[0].locator, { file: 'lib.mjs', lines: [3, 3] }, 'line 1 blames to base, outside the PR');
  assert.deepEqual(f.key[0].probe, { kind: 'test', file: 'lib.test.mjs', command: 'node --test lib.test.mjs' });
  assert.deepEqual(G.selfCheck(f, dir), []);
  const out = tmp(t);
  assert.equal(G.writeMinted(f, dir, out).status, 'ready');
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, f.id, 'fixture.json'), 'utf8')).status, 'ready');
  const broken = { ...f, key: [{ ...f.key[0], match: 'nothing like it' }, { ...f.key[0], id: 'b', locator: { file: 'gone.mjs', lines: [1, 1] } }] };
  assert.deepEqual(G.selfCheck(broken, dir), [`${f.key[0].id}: match does not match its source`]);
  assert.equal(G.writeMinted({ ...broken, id: 'broken' }, dir, out).status, 'draft');
  const noFix = { ...f, key: [{ ...f.key[0], fix_commit: undefined }] };
  assert.deepEqual(G.selfCheck(noFix, dir), [`${f.key[0].id}: a test probe needs a fix commit`]);
  const passesAtHead = { ...f, head: g('rev-parse', 'HEAD') };
  assert.deepEqual(G.selfCheck(passesAtHead, dir), [`${f.key[0].id}: the probe passes at head`]);
});

test('fromHistory: a commit past the window that names no fix mints nothing', (t) => {
  const { dir, g } = historyRepo(t);
  g('-c', 'user.name=t', 'commit', '-q', '--amend', '-m', 'Tidy half', '--date', '2099-01-01T00:00:00');
  spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t', 'commit', '-q', '--amend', '--no-edit'], { env: { ...process.env, GIT_COMMITTER_DATE: '2099-01-01T00:00:00' } });
  assert.deepEqual(G.fromHistory(dir, { days: 30 }), []);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 3 failing of 17 (2 skipped: the oracle is not beside the script), these:

```
✖ wordsRegex: the two longest words of a subject, both required, in either order
✖ fromHistory and selfCheck: the fix blames to the PR; its test fails at the PR head and passes at the fix
✖ fromHistory: a commit past the window that names no fix mints nothing
```

  with errors such as

```
TypeError: G.wordsRegex is not a function
TypeError: G.fromHistory is not a function or its return value is not iterable
TypeError: G.fromHistory is not a function
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
    fs.rmSync(wt, { recursive: true, force: true });
  }
}
// A minted fixture's self-check, against a local clone: each entry's regex matches the source's own words, its
// locator's file exists at head, and its probe, where given, fails at head and passes at its fix commit.
export function selfCheck(fixture, repoDir) {
  const problems = [];
  if (!gitOk(repoDir, 'cat-file', '-e', `${fixture.head}^{commit}`)) problems.push(`head ${fixture.head} is not in ${repoDir}`);
  for (const e of fixture.key) {
    const words = e.source ?? fixture.source;
    if (!new RegExp(e.match, 'i').test(words)) problems.push(`${e.id}: match does not match its source`);
    if (!problems.length && e.locator.file && !gitOk(repoDir, 'cat-file', '-e', `${fixture.head}:${e.locator.file}`)) problems.push(`${e.id}: ${e.locator.file} is not at head`);
    if (!problems.length && e.probe?.kind === 'test') {
      if (!e.fix_commit) problems.push(`${e.id}: a test probe needs a fix commit`);
      else {
        if (probePasses(repoDir, fixture.head, e.probe, e.fix_commit)) problems.push(`${e.id}: the probe passes at head`);
        if (!probePasses(repoDir, e.fix_commit, e.probe, null)) problems.push(`${e.id}: the probe fails at the fix commit`);
      }
    }
  }
  return problems;
}
export function writeMinted(fixture, repoDir, outDir) {
  const problems = selfCheck(fixture, repoDir);
  const f = { ...fixture, status: problems.length ? 'draft' : 'ready', ...(problems.length ? { self_check: problems } : {}) };
  checkFixture(f, f.id);
  const dir = path.join(outDir, f.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify(f, null, 2) + '\n');
  return f;
}
// Two of a subject's longest words, both required in either order: the fix commit's own words, loose enough to
// match a reviewer who describes the same fault.
export function wordsRegex(subject) {
  const words = [...new Set(subject.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [])]
    .filter((w) => !['this', 'that', 'with', 'from', 'when', 'into', 'fix', 'fixes', 'fixed'].includes(w))
    .sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 2);
  return words.map((w) => `(?=[\\s\\S]*\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)`).join('') || subject;
}
// After the SZZ method (Sliwerski, Zimmermann and Zeller, MSR 2005): for each first-parent commit on base that
// names a fix, or that comes within days of a merge, blame the lines it changes back to the commits that wrote
// them; where those belong to a merged pull request (reachable from its second parent, not its first), mint a
// draft-or-ready clearing-review fixture at that pull request's head.
export function fromHistory(repoDir, { base = 'main', days = 30, repoName = repoDir } = {}) {
  const merges = git(repoDir, 'log', '--first-parent', '--merges', '--format=%H %P %ct', base).split('\n').filter(Boolean)
    .map((l) => { const [m, p1, p2, t] = l.split(' '); return { m, p1, p2, t: Number(t) }; });
  const commits = git(repoDir, 'log', '--first-parent', '--no-merges', '--format=%H %ct %s', base).split('\n').filter(Boolean)
    .map((l) => { const [h, t, ...s] = l.split(' '); return { h, t: Number(t), subject: s.join(' ') }; });
  const inPr = (pr, c) => gitOk(repoDir, 'merge-base', '--is-ancestor', c, pr.p2) && !gitOk(repoDir, 'merge-base', '--is-ancestor', c, pr.p1);
  const found = new Map();
  for (const c of commits) {
    const named = /\bfix(e[sd])?\b/i.test(c.subject);
    const recent = merges.filter((pr) => c.t > pr.t && c.t - pr.t <= days * 86400);
    if (!named && !recent.length) continue;
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
      const out = git(repoDir, 'blame', '-l', '-s', '-L', `${from},${to}`, `${c.h}^`, '--', file);
      for (const b of out.split('\n')) blamed.add(`${b.slice(0, 40).replace(/^\^/, '')}\t${file}\t${from}\t${to}`);
    }
    for (const pr of named ? merges : recent) {
      const mine = [...blamed].filter((b) => inPr(pr, b.split('\t')[0]));
      if (!mine.length) continue;
      const [, file2, from, to] = mine[0].split('\t');
      const test = git(repoDir, 'diff', '--name-only', `${c.h}^`, c.h).split('\n').find((p) => /\.test\.(m?js|sh)$/.test(p));
      const id = `hist-${pr.p2.slice(0, 7)}`;
      const fx = found.get(id) ?? { id, step: 'clearing-review', source: `mined from history: fixes after ${pr.m.slice(0, 7)}`, repo: repoName, head: pr.p2, base: pr.p1, held_out: [], key: [] };
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
    const out = opt.out ?? path.join(home(), 'grading', 'fixtures');
    if (opt['from-history']) {
      const repo = opt['from-history'];
      const minted = fromHistory(repo, { base: opt.base ?? 'main', days: Number(opt.days ?? 30), repoName: opt.name ?? repo })
        .map((f) => writeMinted(f, repo, out));
      for (const f of minted) console.log(`${f.status} ${f.id}: ${f.key.length} key entries${f.self_check ? ` (${f.self_check.join('; ')})` : ''}`);
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
the fixture and writes it to `~/.claude/grading/fixtures/`, `ready`, or `draft`
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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 15 pass, 0 fail, 2 skipped, of 17 (the skips name the missing oracle).

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **no passes-at-head check**: in `scripts/grade.mjs` replace `if (probePasses(repoDir, fixture.head, e.probe, e.fix_commit)) problems.push` with `if (false) problems.push`; fails: "fromHistory and selfCheck: the fix blames to the PR; its test fails at the PR head and passes at the fix".
  - **the PR includes base commits**: in `scripts/grade.mjs` replace `&& !gitOk(repoDir, 'merge-base', '--is-ancestor', c, pr.p1);` with `;`; fails: "fromHistory and selfCheck: the fix blames to the PR; its test fails at the PR head and passes at the fix".
  - **the probe keeps NODE_TEST_CONTEXT**: in `scripts/grade.mjs` replace `delete env.NODE_TEST_CONTEXT;` with `(nothing)`; fails: "fromHistory and selfCheck: the fix blames to the PR; its test fails at the PR head and passes at the fix".
  - **the window is ignored**: in `scripts/grade.mjs` replace `if (!named && !recent.length) continue;` with `if (!named && false) continue;`; fails: "fromHistory and selfCheck: the fix blames to the PR; its test fails at the PR head and passes at the fix", "fromHistory: a commit past the window that names no fix mints nothing".

- [ ] Commit: "Grade: mint fixtures from escapes and from history"; the
  body says a fixture that fails its self-check is kept as a draft and
  stays out of the table.

### T6: citations and re-asks

**Depends on:** T5
**Files:** modify `scripts/grade.mjs`; test `scripts/grade.test.mjs`
**Seams:** `exampleIds(text)`, `citations(transcripts, skillsDir, since)`, `reasks(ledger, since)`; the CLI `cite` and `reasks`
**Interfaces:** produces `citations -> {counts, ambiguous, uncited}`,
`reasks -> [{entry, repeats}]`
**Verify:** `node --test scripts/grade.test.mjs`

The transcript lines `cite` reads are Claude Code's session JSONL as
written on 2026-11-26: one object a line; Claude's own turns have `type`
`assistant`, a `timestamp`, and `message.content` as a list of blocks
(`text` with `text`; `tool_use` with `name` and `input`, where a Skill
call's `input.skill` names the skill and a Read's `input.file_path` the
file).

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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 2 failing of 19 (2 skipped: the oracle is not beside the script), these:

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
    const r = citations(walk(projects).map(read), opt.skills ?? path.join(home(), 'skills'), opt.since);
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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 17 pass, 0 fail, 2 skipped, of 19 (the skips name the missing oracle).

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **text outside Claude's own counts**: in `scripts/grade.mjs` replace `if (o.type !== 'assistant' ||` with `if (o.type === 'nothing' ||`; fails: "citations: an ID counts for the one loaded file defining it; two loaded files sharing it is ambiguous".
  - **re-asks ignore since**: in `scripts/grade.mjs` replace `if (m[2] < since) return;` with `(nothing)`; fails: "reasks: both ledger forms, dated on or after since".

- [ ] Commit: "Grade: count example citations and ledger re-asks"; the
  body says an uncited example is listed for `/reflect`, never retired by
  the script.

### T7: field recall and perturb rows

**Depends on:** T6
**Files:** modify `scripts/grade.mjs`; test `scripts/grade.test.mjs`
**Seams:** `stepOf(words)`, `fieldRecall(costs, since)`, `perturbRow(report, prs, branch)`; the CLI `field` and `perturb`
**Interfaces:** produces `fieldRecall -> {steps: {<step>: {findings, escapes, recall}}, unread}`,
`perturbRow -> {branch, pieces, merged, closed, open, unmined}`
**Verify:** `node --test scripts/grade.test.mjs`

Run on the maintainer's `COSTS.md` on 2026-11-26, `field` read:
executing-critique 75 findings and 4 escapes (0.95), clearing-review 79
and 0 (1.00), task-review 221 and 0 (1.00), reading-critique 82 and 1
(0.99), with 54 review lines and 3 escapes listed as unread. The
clearing review's 1.00 sits beside PR 13's replayed round 1 at 3 of 12:
a round that misses what the next round finds is not logged as an
escape, so field recall is a ceiling, read beside the fixtures, never
alone.

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T7: field recall and perturb

test('fieldRecall: findings per step without nits, escapes by step words, unreadable lines listed', () => {
  const costs = [
    '# Agent costs', '',
    '- [p] 2030-01-02, clearing review (PR 1), 1,000 tokens. NOT CLEARED: 1 blocker, 2 major, 3 minor, 9 nit.', '',
    '- [p] 2030-01-03, clearing review round 2 (PR 1), CLEARED: 0 blocker, 0 major, 1 minor.', '',
    '- [q] 2030-01-03, executing critique pass 1, found things', '',
    '- [q] 2030-01-03, build implementer T1, 5 major mentioned but not a review', '',
    '## Escapes', '', 'Header text.', '',
    '- 2030-01-04; a defect; found by x; step:\n  the 2030-01-02 clearing review; a miss.',
    '- 2030-01-05; another; step: fold 1; contract gap.', '',
    '## Stuck', '', '- 2030-01-06; step: clearing review; not an escape',
  ].join('\n');
  const r = G.fieldRecall(costs);
  assert.deepEqual(r.steps, { 'clearing-review': { findings: 7, escapes: 1, recall: 7 / 8 } });
  assert.deepEqual(r.unread, ['[q] 2030-01-03, executing critique pass 1', 'escape 2030-01-05, step: fold 1']);
  assert.deepEqual(G.fieldRecall(costs, '2030-01-03').steps['clearing-review'], { findings: 1, escapes: 1, recall: 0.5 });
});

test('perturbRow: section 5 rows against PRs naming the branch', () => {
  const report = '# R\n\n## 5. Mineable pieces\n\n| Piece | Cost |\n|---|---|\n| a | 1 |\n| b | 2 |\n| c | 3 |\n\n## 6. Bets\n\n| x | y |\n';
  const prs = [{ state: 'MERGED', body: 'from showcase/s' }, { state: 'CLOSED', body: 'showcase/s' }, { state: 'MERGED', body: 'other' }];
  assert.deepEqual(G.perturbRow(report, prs, 'showcase/s'), { branch: 'showcase/s', pieces: 3, merged: 1, closed: 1, open: 0, unmined: 1 });
});

test('field CLI: reads COSTS.md, or ESCAPES.md where there is no COSTS.md', (t) => {
  const h = tmp(t);
  put(h, 'ESCAPES.md', '# Escapes\n\n## Escapes\n\n- 2030-01-04; a defect; step: the 2030-01-02 clearing review; a miss.\n');
  assert.match(cli(h, 'field').stdout, /clearing-review: 0 findings, 1 escapes, recall 0\.00/);
  put(h, 'COSTS.md', '# Agent costs\n\n- [p] 2030-01-02, clearing review, 1 major.\n\n## Escapes\n\n');
  assert.match(cli(h, 'field').stdout, /clearing-review: 1 findings, 0 escapes, recall 1\.00/);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 3 failing of 22 (2 skipped: the oracle is not beside the script), these:

```
✖ fieldRecall: findings per step without nits, escapes by step words, unreadable lines listed
✖ perturbRow: section 5 rows against PRs naming the branch
✖ field CLI: reads COSTS.md, or ESCAPES.md where there is no COSTS.md
```

  with errors such as

```
TypeError: G.fieldRecall is not a function
TypeError: G.perturbRow is not a function
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /clearing-review: 0 findings, 1 escapes, recall 0\.00/. Input:
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
// lines naming that step. A review line with no counts it can read is listed, not guessed.
export function fieldRecall(costs, since = '0000-00-00') {
  const [agents, escapes = ''] = costs.split(/^## Escapes\s*$/m);
  const bullets = (text) => text.split(/\n(?=- )/).filter((b) => b.startsWith('- '));
  const steps = {};
  const unread = [];
  const at = (s) => (steps[s] ??= { findings: 0, escapes: 0, recall: null });
  for (const b of bullets(agents)) {
    const m = /^- \[([^\]]+)\] (\d{4}-\d{2}-\d{2}), ([^(,]*)/.exec(b);
    if (!m || m[2] < since) continue;
    const step = stepOf(m[3]);
    if (!step) continue;
    const n = (word) => [...b.matchAll(new RegExp(`(\\d+) ${word}s?\\b`, 'g'))].reduce((a, x) => a + Number(x[1]), 0);
    if (!/\d+ (blocker|major|minor)s?\b/.test(b)) { unread.push(`[${m[1]}] ${m[2]}, ${m[3].replace(/\s+/g, ' ').trim()}`); continue; }
    at(step).findings += n('blocker') + n('major') + n('minor');
  }
  for (const b of bullets(escapes.split(/^## /m)[0])) {
    const date = /^- (\d{4}-\d{2}-\d{2})/.exec(b)?.[1];
    if (!date || date < since) continue;
    const words = (/step:\s*([^;]*)/.exec(b)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const step = stepOf(words);
    if (!step) { unread.push(`escape ${date}, step: ${words || '(none named)'}`); continue; }
    at(step).escapes++;
  }
  for (const v of Object.values(steps)) v.recall = v.findings + v.escapes ? v.findings / (v.findings + v.escapes) : null;
  return { steps, unread };
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
    // An adopter with no costs log keeps escapes alone in ESCAPES.md (setup writes it); field reads that instead.
    const costs = path.join(home(), 'COSTS.md');
    const r = fieldRecall(read(pos[0] ?? (fs.existsSync(costs) ? costs : path.join(home(), 'ESCAPES.md'))), opt.since);
    for (const [k, v] of Object.entries(r.steps)) console.log(`${k}: ${v.findings} findings, ${v.escapes} escapes, recall ${v.recall === null ? '-' : v.recall.toFixed(2)}`);
    for (const u of r.unread) console.log(`unread: ${u}`);
    appendRow({ kind: 'field', since: opt.since ?? null, ...r });
    return 0;
  },
  perturb(argv) {
    const { pos, opt } = parseArgs(argv, { repo: 1, prs: 1 });
    if (pos.length !== 1) throw new GradeError(USAGE);
    const repo = opt.repo ?? '.';
    let report;
    try { report = git(repo, 'show', `${pos[0]}:PERTURB-REPORT.md`); } catch { throw new GradeError(`no PERTURB-REPORT.md on ${pos[0]}`); }
    const prs = opt.prs ? JSON.parse(read(opt.prs))
      : JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'all', '--search', `${pos[0]} in:body`, '--json', 'number,state,body', '--limit', '200'], { cwd: repo, encoding: 'utf8' }));
    const row = appendRow({ kind: 'perturb', ...perturbRow(report, prs, pos[0]) });
    console.log(JSON.stringify(row));
    return 0;
  },
```

- [ ] In `scripts/grade.mjs`, insert immediately before the line `grade.mjs table [--since <date>]`;`:

```js
  grade.mjs field [--since <date>] [<COSTS.md>]
  grade.mjs perturb <showcase branch> [--repo <dir>] [--prs <gh JSON file>]
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 20 pass, 0 fail, 2 skipped, of 22 (the skips name the missing oracle).

- [ ] Mutant runs, one at a time on the full suite with `scripts/guard-oracle.mjs` present, restored after each, under a timeout of 300 s. Each must fail the tests named:

  - **nits are counted**: in `scripts/grade.mjs` replace `at(step).findings += n('blocker') + n('major') + n('minor');` with `at(step).findings += n('blocker') + n('major') + n('minor') + n('nit');`; fails: "fieldRecall: findings per step without nits, escapes by step words, unreadable lines listed".
  - **an escape with no step is dropped**: in `scripts/grade.mjs` replace `if (!step) { unread.push(\`escape ${date}, step: ${words || '(none named)'}\`); continue; }` with `if (!step) continue;`; fails: "fieldRecall: findings per step without nits, escapes by step words, unreadable lines listed".
  - **the table header row is a piece**: in `scripts/grade.mjs` replace `.filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1);` with `.filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l));`; fails: "perturbRow: section 5 rows against PRs naming the branch".
  - **no ESCAPES.md fallback**: in `scripts/grade.mjs` replace `(fs.existsSync(costs) ? costs : path.join(home(), 'ESCAPES.md'))` with `costs`; fails: "field CLI: reads COSTS.md, or ESCAPES.md where there is no COSTS.md".

- [ ] Commit: "Grade: field recall from the escapes log, perturb rows";
  the body gives the ceiling caveat above.

### T8: the runner, `/grade`

**Depends on:** T7
**Files:** create `commands/grade.md`; test `scripts/grade.test.mjs`
**Seams:** `commands/grade.md` as read by its test (every `grade.mjs`
subcommand and option it names exists)
**Interfaces:** consumes every subcommand above
**Verify:** `node --test scripts/grade.test.mjs`

- [ ] Write the failing tests at the named seams. Append to `scripts/grade.test.mjs`:

```js
// ---- T8: the runner

test('commands/grade.md names only subcommands and options grade.mjs accepts', () => {
  const md = fs.readFileSync(fileURLToPath(new URL('../commands/grade.md', import.meta.url)), 'utf8');
  const usage = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).stderr;
  const subs = new Set([...usage.matchAll(/grade\.mjs (\w+)/g)].map((m) => m[1]));
  const named = new Set();
  for (const line of md.split('\n')) {
    for (const m of line.matchAll(/grade\.mjs (\w+)([^`]*)/g)) {
      named.add(m[1]);
      assert.ok(subs.has(m[1]), `grade.md names grade.mjs ${m[1]}`);
      const allowed = usage.split('\n').filter((u, i, all) => u.includes(`grade.mjs ${m[1]}`) || (/^\s{10,}/.test(u) && all[i - 1]?.includes(`grade.mjs ${m[1]}`))).join(' ');
      for (const [opt] of m[2].matchAll(/--[a-z-]+/g)) assert.ok(allowed.includes(opt), `grade.md gives ${m[1]} ${opt}`);
    }
  }
  assert.deepEqual([...named].sort(), ['cite', 'field', 'handoff', 'leaks', 'reasks', 'score', 'table']);
});
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 1 failing of 23 (2 skipped: the oracle is not beside the script), these:

```
✖ commands/grade.md names only subcommands and options grade.mjs accepts
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

Fixtures live in `~/.claude/grading/fixtures/<id>/fixture.json`. A fixture is
a repository at a commit (`head`) with a key: the faults known to be there.
Never show the step under test the key, the fixture file, or anything after
`head`.

## 1. A fixture run: `<fixture id> [runs] [--without <file>#<ID>]`

1. Read the fixture. If its `status` is `draft`, stop: a draft has not
   passed its self-check. If a `--without` example is in its `held_out`
   list, stop: that arm would measure leakage, not help (the script refuses
   it too).
2. Check out the fixture for each run: `git clone --no-local <repo> <scratch>/<id>-<n>`
   (a URL or a local path), then in it `git checkout --detach <head>`,
   `git remote remove origin`, and delete every branch and tag
   (`git for-each-ref --format='%(refname)' refs/heads refs/tags | xargs -n1 git update-ref -d`),
   so nothing past `head` can be read. Write the commits that are not
   `head` or before it to `<scratch>/<id>-later.txt` from a full clone
   first: `git -C <source> rev-list --all ^<head>`.
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
5. Spawn one fresh subagent per run with the brief. Save each report to
   `<scratch>/<id>-<n>.md` and its transcript (the subagent's JSONL under
   `~/.claude/projects/`) to `<scratch>/<id>-<n>.jsonl`.
6. For each run: `node ~/.claude/scripts/grade.mjs leaks <scratch>/<id>-<n>.jsonl <fixture.json> --later <scratch>/<id>-later.txt --examples-root ~/.claude/skills`.
   Exit 1 means a leak: keep the run, and pass the count as
   `--leak-flags <n>` below.
7. Score: `node ~/.claude/scripts/grade.mjs score <fixture.json> <scratch>/<id>-<n>.md --model <model> --tokens <n> --run <id>-<n> [--without ...] [--leak-flags <n>]`,
   and for a fixture whose key carries a guard probe add
   `--checkout <scratch>/<id>-<n> --oracle ~/.claude/scripts/guard-oracle.mjs`:
   the script then runs each unmatched blocker or major finding's commands
   in real bash and asks the guard at `head`.
8. Adjudicate what is left. The row's `severe_unmatched` lists every
   unmatched blocker or major finding; those not yet settled are its
   `unadjudicated` count. If it is above zero, spawn one fresh adjudicator
   (it wrote nothing here) with the checkout and those findings' text. Its
   job, per finding: make it fail at `head` (a test, a command, a probe),
   and run it. Reproduced: it failed as the finding says. Not reproduced:
   it tried and could not. It writes `[{"text": "<the finding, verbatim>", "verdict": "reproduced" | "not-reproduced", "class": "<short name>", "locator": {"file": "<path>", "lines": [a, b]}}]`
   to `<scratch>/<id>-<n>.verdicts.json`. Score again with
   `--verdicts <that file>`: a reproduced finding joins the fixture's key on
   its own, recorded in its `history`. Use the same `--run` name both times:
   the table counts a run once, as its last row.
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

Show the table, the uncited examples (retirement candidates for
`/reflect`, never retired here), and field recall's unread lines.
```

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 21 pass, 0 fail, 2 skipped, of 23 (the skips name the missing oracle).

- [ ] Commit: "Grade: the /grade command"; the body says the brief is
  built from the current skill text minus held-out examples, so the
  current config is graded on old heads.

### T9: setup and docs

**Depends on:** T8
**Files:** modify `.claude/skills/setup-config/SKILL.md` (opening,
update mode, step 8.4, 8.7, 8.8, step 10, close), `templates/charter.template.md`
(Review cadence), `templates/addendum.template.md` (user-only skills),
`README.md` (install, table, layout)
**Seams:** none testable by the suite; the check is the full verify and
the greps below
**Interfaces:** none
**Verify:** the full verify (header), then
`grep -c "grading/" .claude/skills/setup-config/SKILL.md` (expected 5, measured) and
`grep -c "/grade" README.md templates/addendum.template.md templates/charter.template.md`
(expected at least 1 each)

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
`skills/`, `commands/`, `scripts/` and `templates/`. The install target is
```

with

```md
`skills/`, `commands/`, `scripts/`, `grading/` and `templates/`. The install target is
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
   `skills/perturb`, `commands/handoff.md` and `scripts/` move together:
   `/build`'s Stop hook, `/perturb`'s guard and `/handoff` run those
   scripts,
```

with

```md
   `skills/perturb`, `commands/handoff.md`, `commands/grade.md`,
   `grading/` and `scripts/` move together: `/build`'s Stop hook,
   `/perturb`'s guard, `/handoff` and `/grade` run those scripts,
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
copy the current source's `skills/`, `commands/`,
   `scripts/` and `templates/` in its place.
```

with

```md
copy the current source's `skills/`, `commands/`,
   `scripts/`, `grading/` and `templates/` in its place.
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
4. **Costs log**, only if the cost gate is on:
```

with

```md
4. **Costs log**, only if the cost gate is on (if it is off, write
   `~/.claude/ESCAPES.md` instead, with the header "# Escapes" and only the
   "## Escapes" section below, so `/reflect` has somewhere to log escapes and
   the grader something to read):
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
   `templates/` to
```

with

```md
also copy this source's `skills/`, `commands/`, `scripts/`, `grading/`
   and `templates/` to
```

- [ ] In `.claude/skills/setup-config/SKILL.md`, replace

```md
  `node --test ~/.claude/scripts/ledger.test.mjs`; every test must pass.
  Without Node the ledger script is unavailable; say so.
```

with

```md
  `node --test ~/.claude/scripts/ledger.test.mjs` and
  `node --test ~/.claude/scripts/grade.test.mjs`; every test must pass (the
  grader's two probe tests skip, by name, where `guard-oracle.mjs` is
  absent). Without Node the ledger script and the grader are unavailable;
  say so.
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
  `/build overnight` runs it unattended when enabled above.
```

with

```md
  `/build overnight` runs it unattended when enabled above.
- `/grade`: score a step on a fixture with a known key, a handoff cold start,
  or the term's free counts.
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

- [ ] Run `node --test scripts/grade.test.mjs`; expected: 21 pass, 0 fail, 2 skipped, of 23 (the skips name the missing oracle).

- [ ] Run the full verify (header); every suite green.
- [ ] Commit: "Setup: install and test the grader; docs name /grade".

## After merge (the owner's word, not `/build`)

1. Install: `/setup-config update` from this repository.
2. Mint the private critique fixtures from the escapes already logged
   (the 2026-10-10 reading critique, the 2026-10-29 executing-critique
   passes, kymograph PR 7's two of 2026-11-15) with `mint`, on the
   maintainer's machine; they stay in `~/.claude/grading/fixtures/` and
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
internals no student sees):

1. A locator with lines `[0, 0]` names the whole file; the PR 13 entries
   use it, since the guard's faults are not one line range.
2. A key holds the faults the real rounds rated blocker or major, plus
   the oracle-shown classes; minors are counted, not keyed.
3. A finding under a heading that starts "Notes" is not a finding;
   `/grade`'s brief puts non-findings there.
4. A fixture row carries `run` and `unadjudicated` (beyond the spec's
   list): `run` so a run scored again with verdicts counts once in the
   table, `unadjudicated` so an unsettled finding is neither a hit nor a
   false alarm.
5. A new `probes` subcommand re-proves a shipped guard fixture's key at
   its head, so the fixture's probe fields have a reader and an adopter
   can check them.
6. `--from-history`'s regex is the fix subject's two longest words, both
   required, in either order.
7. An adopter with no `COSTS.md` gets `ESCAPES.md` from setup; `/reflect`
   logs there and `field` reads it.
8. A grown key entry's regex is the finding's longest backticked span, or
   its first eight words.

## Overnight readiness

Every task names its seams and its verify command. Two things are not
settled by the plan alone: the subagent premise (preflight 3), which may
change T8's step 3, and the oracle (pull request 16), without which T2
and T3's oracle tests skip and T3's by-hand check cannot run. Attended
`/build` can start now; overnight once both are settled. The plan is not
ready for either until its executing critique comes back clean.
