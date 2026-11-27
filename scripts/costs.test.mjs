// costs.test.mjs: prove costs.mjs can fail. Every record here is invented for the test; none is a real one.
// Usage: node --test scripts/costs.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as C from './costs.mjs';

const SCRIPT = fileURLToPath(new URL('./costs.mjs', import.meta.url));
// GIT_CEILING_DIRECTORIES keeps git from finding a repository above the temp folder, so a test folder that is
// meant to be outside a repository is outside one even when the temp folder sits inside a checkout.
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test',
  GIT_CEILING_DIRECTORIES: os.tmpdir(), COSTS_TODAY: '2030-01-02',
});

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
const LOG = 'COSTS.jsonl';

// A throwaway folder, and one that is a git repository with one commit.
function folder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'costs-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function repo(t) {
  const dir = folder(t);
  git(dir, 'init', '-q');
  git(dir, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'other.txt'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}
const at = (dir) => path.join(dir, LOG);
const lines = (dir) => fs.readFileSync(at(dir), 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const refuses = (fn, pattern) => assert.throws(fn, (e) => e instanceof C.CostsError && pattern.test(e.message));

const RUN = { repo: 'demo', step: 'implement', model: 'opus-5.5', tokens: 84238 };
const ESCAPE = { kind: 'escape', run: 'an older run', class: 'miss', 'found-by': 'a later review', note: 'a defect' };
const record = (extra) => ({ kind: 'run', id: '2030-01-01-0a0a', date: '2030-01-01', ...RUN, ...extra });
const escape = (extra) => ({ id: '2030-01-01-0e0e', date: '2030-01-01', ...ESCAPE, ...extra });
const voided = (extra) => ({ kind: 'void', id: '2030-01-01-0f0f', date: '2030-01-01', supersedes: '2030-01-01-0a0a', note: 'recorded twice', ...extra });
const write = (dir, records) => fs.writeFileSync(at(dir), records.map((r) => `${typeof r === 'string' ? r : JSON.stringify(r)}\n`).join(''));
const ADD = ['add', '--repo', 'demo', '--step', 'implement', '--model', 'opus-5.5', '--tokens', '5', '--file'];

// ==== records and add

test('4.1, 4.2: a run and an escape are appended as one line each that parses back; kind defaults to run, date to today', (t) => {
  const dir = folder(t);
  const all = { ...RUN, step: 'executing-critique', date: '2030-02-03', effort: 'high', resumed: true, total: 90000, round: 2, tools: 39,
    minutes: 5.3, plan: 'demo plan rev 2', pr: 'PR 7', read: 'abc123..def456', 'tasks-done': 4, 'tasks-total': 9,
    'first-changed': 'T3', verdict: 'needs-fixes', findings: { major: 2, nit: 0 }, note: 'two lines\nof "note"' };
  const id = C.add(at(dir), all);
  assert.match(id, /^2030-02-03-[0-9a-f]{4}$/);
  assert.equal(fs.readFileSync(at(dir), 'utf8').split('\n').length, 2);
  const first = C.add(at(dir), RUN);
  const second = C.add(at(dir), { ...ESCAPE, run: first });
  assert.match(first, /^2030-01-02-/);
  assert.deepEqual(lines(dir), [{ kind: 'run', id, ...all }, { kind: 'run', id: first, date: '2030-01-02', ...RUN },
    { id: second, date: '2030-01-02', ...ESCAPE, run: first }]);
});

test('4.1: an id is the record date, a hyphen and four hex characters', () => {
  assert.deepEqual(C.validate({ kind: 'run', id: '2030-01-01-0a0a', date: '2030-01-01', ...RUN }), []);
  for (const id of ['2030-01-01-0a0a0', '2030-01-01-0A0A', '2030-01-01-0a0']) {
    assert.deepEqual(C.validate({ kind: 'run', id, date: '2030-01-01', ...RUN }), ["id: the record's date, a hyphen and four hex characters"]);
  }
  for (const id of ['2030-01-02-0a0a', '9999-99-99-ffff']) {
    assert.deepEqual(C.validate({ kind: 'run', id, date: '2030-01-01', ...RUN }), ["id: its first ten characters are the record's date"]);
  }
});

test('4.1: add makes an id that is in no line of the file, of any kind, valid or not', (t) => {
  const dir = folder(t);
  write(dir, [escape({ id: '2030-01-02-aaaa', date: '2030-01-02' }), record({ id: '2030-01-02-bbbb', date: '2030-01-02' }),
    '{"kind":"run","id":"2030-01-02-cccc"}', voided({ id: '2030-01-02-dddd', date: '2030-01-02', supersedes: '2030-01-02-cccc' })]);
  const made = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee'];
  assert.equal(C.add(at(dir), RUN, { hex: () => made.shift() }), '2030-01-02-eeee');
});

// Each row: the fields given to add, and the key its refusal names.
const REFUSED = [
  [{ ...RUN, repo: undefined }, /repo: required \(lower-case letters, digits, dot, underscore, hyphen\)/], [{ ...RUN, step: undefined }, /step: required/],
  [{ ...RUN, model: undefined }, /model: required/], [{ ...RUN, tokens: undefined }, /tokens: required/],
  [{ ...RUN, repo: 'Demo' }, /repo: lower-case/], [{ ...RUN, repo: 'a b' }, /repo: lower-case/],
  [{ ...RUN, model: 'Opus 5.5' }, /model: lower-case/], [{ ...RUN, model: 'opus_5' }, /model: lower-case/],
  [{ ...RUN, step: 'build' }, /step: one of/], [{ ...RUN, kind: 'stuck' }, /kind: run, escape or void/],
  [{ ...RUN, tokens: -1 }, /tokens: a whole number/], [{ ...RUN, tokens: 1.5 }, /tokens: a whole number/], [{ ...RUN, tokens: '9' }, /tokens: a whole number/],
  [{ ...RUN, tokens: 2 ** 53 }, /tokens: a whole number/],
  [{ ...RUN, date: '2030-02-30' }, /date: an ISO date/], [{ ...RUN, date: '2030-1-2' }, /date: an ISO date/],
  [{ ...RUN, 'step-note': 'a note' }, /step-note: only with step other/], [{ ...RUN, step: 'other' }, /step-note: required/],
  [{ ...RUN, step: 'other', 'step-note': 'two\nlines' }, /step-note: one line/],
  [{ ...RUN, total: 90000 }, /total: only with resumed/], [{ ...RUN, resumed: true }, /total: required/],
  [{ ...RUN, resumed: true, total: 84237 }, /total: a whole number, at least tokens/], [{ ...RUN, resumed: true, total: 90000.5 }, /total: a whole number/],
  [{ ...RUN, resumed: false }, /resumed: true, or absent/],
  // The five steps are written out: a list read from the script would follow any change to it.
  ...['reading-critique', 'executing-critique', 'task-review', 'simplify', 'clearing-review'].map((step) => [{ ...RUN, step }, /read: required/]),
  [{ ...RUN, read: '' }, /read: the commit or range/], [{ ...RUN, step: 'task-review', read: 'abc\ndef' }, /read: the commit or range/],
  [{ ...RUN, 'tasks-done': 1 }, /tasks-done: only with step executing-critique/], [{ ...RUN, 'tasks-total': 1 }, /tasks-total: only with/],
  [{ ...RUN, 'first-changed': 'T2' }, /first-changed: only with/],
  ...[['tasks-done', -1], ['tasks-total', 1.5], ['first-changed', 'T2\nT3']]
    .map(([k, v]) => [{ ...RUN, step: 'executing-critique', read: 'abc', [k]: v }, new RegExp(`${k}: `)]),
  [{ ...RUN, effort: 'High' }, /effort: lower-case/], [{ ...RUN, round: 0 }, /round: a whole number, one or more/], [{ ...RUN, round: 1.5 }, /round: a whole/],
  [{ ...RUN, tools: 1.5 }, /tools: a whole number/], [{ ...RUN, tools: -1 }, /tools: a whole number/],
  [{ ...RUN, minutes: -1 }, /minutes: a number/], [{ ...RUN, minutes: '5' }, /minutes: a number/], [{ ...RUN, minutes: Infinity }, /minutes: a number/],
  [{ ...RUN, plan: 'a\nb' }, /plan: one line/], [{ ...RUN, plan: 'a\rb' }, /plan: one line/], [{ ...RUN, pr: '' }, /pr: one line/],
  [{ ...RUN, verdict: 'passed' }, /verdict: one of/],
  [{ ...RUN, findings: { Major: 1 } }, /findings: a map/], [{ ...RUN, findings: { 'ma.jor': 1 } }, /findings: a map/],
  [{ ...RUN, findings: { major: -1 } }, /findings: a map/], [{ ...RUN, findings: { major: 1.5 } }, /findings: a map/], [{ ...RUN, findings: [1] }, /findings: a map/],
  [{ ...RUN, note: 5 }, /note: text/], [{ ...RUN, mode: 'attended' }, /mode: not a key of a run record/],
  [{ ...RUN, supersedes: 'the last one' }, /supersedes: the id/],
  [{ ...ESCAPE, run: undefined }, /run: required/], [{ ...ESCAPE, class: undefined }, /class: required/],
  [{ ...ESCAPE, 'found-by': undefined }, /found-by: required/], [{ ...ESCAPE, note: undefined }, /note: required/],
  [{ ...ESCAPE, run: '' }, /run: the id/], [{ ...ESCAPE, run: 'a\nb' }, /run: the id/], [{ ...ESCAPE, 'found-by': 'a\nb' }, /found-by: one line/],
  [{ ...ESCAPE, note: '' }, /note: text/], [{ ...ESCAPE, note: 5 }, /note: text/], [{ ...ESCAPE, class: 'gap' }, /class: miss or contract-gap/],
  [{ ...ESCAPE, tokens: 5 }, /tokens: not a key of an escape record/],
  [{ kind: 'void', note: 'recorded twice' }, /supersedes: required \(the id of the earlier line it retracts, of any kind/],
  [{ kind: 'void', supersedes: '2030-01-01-0a0a' }, /note: required \(text, why/], [{ kind: 'void', supersedes: '2030-01-01-0a0a', note: '' }, /note: text, why/],
  [{ kind: 'void', supersedes: '2030-01-01-0a0a', note: 'x', tokens: 5 }, /tokens: not a key of a void record/],
  [{ kind: 'void', supersedes: 'the last one', note: 'x' }, /supersedes: the id of the earlier line it retracts/],
];
test('4, 6.1: add refuses a record outside its rules, names the key and writes nothing', (t) => {
  const dir = folder(t);
  for (const [fields, pattern] of REFUSED) {
    const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    refuses(() => C.add(at(dir), given), pattern);
  }
  assert.equal(fs.existsSync(at(dir)), false);
});

test('4.1: the values at the edge of each rule are taken', (t) => {
  const dir = folder(t);
  C.add(at(dir), { ...RUN, tokens: 0, repo: 'a.b_c-9', resumed: true, total: 0, round: 1, tools: 0, minutes: 0, findings: {} });
  C.add(at(dir), { ...RUN, step: 'other', 'step-note': 'a commit-zero review', read: 'abc123', tokens: 2 ** 53 - 1 });
  assert.equal(lines(dir).length, 2);
});

test('4.3, 6.1: add refuses a supersedes that names nothing or the other kind, and an id-shaped run that names no run', (t) => {
  const dir = folder(t);
  write(dir, [record(), escape(), voided({ supersedes: '2030-01-01-0e0e' })]);
  const before = fs.readFileSync(at(dir), 'utf8');
  refuses(() => C.add(at(dir), { ...RUN, supersedes: '2030-01-01-ffff' }), /supersedes: no earlier record 2030-01-01-ffff/);
  refuses(() => C.add(at(dir), { ...RUN, supersedes: '2030-01-01-0e0e' }), /supersedes: 2030-01-01-0e0e is an escape record/);
  refuses(() => C.add(at(dir), { ...ESCAPE, supersedes: '2030-01-01-0a0a' }), /supersedes: 2030-01-01-0a0a is a run record/);
  refuses(() => C.add(at(dir), { ...ESCAPE, run: '2030-01-01-ffff' }), /run: no earlier run record 2030-01-01-ffff/);
  refuses(() => C.add(at(dir), { ...ESCAPE, run: '2030-01-01-0e0e' }), /run: no earlier run record 2030-01-01-0e0e/);
  refuses(() => C.add(at(dir), { ...ESCAPE, run: '2030-01-01-0f0f' }), /run: no earlier run record 2030-01-01-0f0f/);
  assert.equal(fs.readFileSync(at(dir), 'utf8'), before);
  C.add(at(dir), { ...RUN, supersedes: '2030-01-01-0a0a' });
  C.add(at(dir), { ...ESCAPE, run: '2030-01-01-0a0a' });
  assert.equal(lines(dir).length, 5);
});

test('4.3: a supersedes may name a JSON line that is not a valid record; a second superseder is refused, naming the record that stands', (t) => {
  const dir = folder(t);
  write(dir, [record(), '{"kind":"escape","id":"2030-01-01-0b0b","tokens":-1}']);
  const hex = (h) => () => h;
  C.add(at(dir), { ...RUN, supersedes: '2030-01-01-0b0b' }, { hex: hex('0c0c') });
  C.add(at(dir), { ...RUN, supersedes: '2030-01-02-0c0c' }, { hex: hex('0d0d') });
  C.add(at(dir), { ...RUN, supersedes: '2030-01-02-0d0d' }, { hex: hex('0e0e') });
  const before = fs.readFileSync(at(dir), 'utf8');
  refuses(() => C.add(at(dir), { ...RUN, supersedes: '2030-01-01-0b0b' }), /supersedes: 2030-01-01-0b0b is already superseded; the record that stands is 2030-01-02-0e0e/);
  refuses(() => C.add(at(dir), { ...RUN, supersedes: '2030-01-02-0c0c' }), /the record that stands is 2030-01-02-0e0e/);
  assert.equal(fs.readFileSync(at(dir), 'utf8'), before);
  C.add(at(dir), { ...RUN, supersedes: '2030-01-01-0a0a' });
  assert.equal(lines(dir).length, 6);
});

test('4.4, 6.1: add --kind void retracts an earlier line of any kind, follows 4.3 otherwise, and a void is never superseded', (t) => {
  const dir = repo(t);
  write(dir, [record(), escape(), '{"kind":"run","id":"2030-01-01-0b0b","tokens":-1}']);
  const voids = (target, ...extra) => cli('add', '--file', at(dir), '--kind', 'void', '--supersedes', target, '--note', 'recorded twice', ...extra);
  const made = [];
  for (const target of ['2030-01-01-0a0a', '2030-01-01-0e0e', '2030-01-01-0b0b']) {
    const r = voids(target);
    assert.equal(r.status, 0, r.stderr);
    made.push(r.stdout.trim());
  }
  assert.deepEqual(lines(dir).slice(3), ['2030-01-01-0a0a', '2030-01-01-0e0e', '2030-01-01-0b0b']
    .map((supersedes, i) => ({ kind: 'void', id: made[i], date: '2030-01-02', supersedes, note: 'recorded twice' })));
  assert.equal(git(dir, 'show', '-s', '--format=%s', 'HEAD').trim(), 'Costs: void');
  const before = fs.readFileSync(at(dir), 'utf8');
  for (const [r, pattern] of [
    [voids('2030-01-01-ffff'), /^add: supersedes: no earlier record 2030-01-01-ffff/],
    [voids('2030-01-01-0a0a'), new RegExp(`^add: supersedes: 2030-01-01-0a0a was retracted by the void ${made[0]}: record the run or escape again`)],
    [voids(made[0]), new RegExp(`^add: supersedes: ${made[0]} is a void record, and a void is never superseded: record the run or escape again`)],
    [cli(...ADD, at(dir), '--supersedes', made[0]), new RegExp(`^add: supersedes: ${made[0]} is a void record`)],
    [voids('2030-01-01-0a0a', '--tokens', '5'), /^add: unknown flag --tokens/],
    [cli('add', '--file', at(dir), '--kind', 'void', '--supersedes', '2030-01-01-0a0a'), /^add: note: required/],
  ]) {
    assert.equal(r.status, 2);
    assert.match(r.stderr, pattern);
  }
  assert.equal(fs.readFileSync(at(dir), 'utf8'), before);
});

test('6.1: a log whose last line has no line end gets one first, and the torn line keeps its bytes', (t) => {
  const dir = folder(t);
  const torn = `${JSON.stringify(record())}\n{"kind":"run","id":"2030-01-01-0b`;
  fs.writeFileSync(at(dir), torn);
  const id = C.add(at(dir), RUN);
  const text = fs.readFileSync(at(dir), 'utf8');
  assert.equal(text, `${torn}\n${JSON.stringify({ kind: 'run', id, date: '2030-01-02', ...RUN })}\n`);
});

test('6.1: a log that ends in a line end gets no blank line', (t) => {
  const dir = folder(t);
  C.add(at(dir), RUN);
  C.add(at(dir), RUN);
  assert.doesNotMatch(fs.readFileSync(at(dir), 'utf8'), /\n\n/);
});

test('6.5: a byte order mark at the start of the log is not part of the first line', (t) => {
  const dir = folder(t);
  fs.writeFileSync(at(dir), `${String.fromCharCode(0xfeff)}${JSON.stringify(record())}\n`);
  assert.deepEqual(C.readLog(at(dir)).records, [record()]);
});

test('6.1: in a repository add commits the log alone, and what else is staged stays staged', (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'other.txt'), 'two\n');
  git(dir, 'add', 'other.txt');
  C.add(at(dir), RUN);
  C.add(at(dir), { ...ESCAPE });
  assert.equal(git(dir, 'show', '--name-only', '--format=%s', 'HEAD~1').trim(), `Costs: implement demo\n\n${LOG}`);
  assert.equal(git(dir, 'show', '--name-only', '--format=%s', 'HEAD').trim(), `Costs: escape\n\n${LOG}`);
  assert.equal(git(dir, 'status', '--porcelain').trim(), 'M  other.txt');
});

test('6.1: the commit carries a whole line appended by hand and not committed', (t) => {
  const dir = repo(t);
  write(dir, [record()]);
  C.add(at(dir), RUN);
  assert.equal(git(dir, 'status', '--porcelain').trim(), '');
  assert.equal(git(dir, 'show', `HEAD:${LOG}`).split('\n').filter(Boolean).length, 2);
});

test('6.1: with --no-commit nothing is committed, and outside a repository add appends', (t) => {
  const dir = repo(t);
  const r = cli(...ADD, at(dir), '--no-commit');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(dir, 'status', '--porcelain').trim(), `?? ${LOG}`);
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD').trim(), '1');
  const plain = folder(t);
  assert.notEqual(spawnSync('git', ['-C', plain, 'rev-parse', '--git-dir']).status, 0, 'the folder is outside any repository');
  C.add(at(plain), RUN);
  assert.equal(lines(plain).length, 1);
});

test('6.1: when git cannot say whether the log is in a repository, add refuses and writes nothing', (t) => {
  const dir = folder(t);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
  const r = spawnSync(process.execPath, [SCRIPT, ...ADD, at(dir)], { encoding: 'utf8', env: { ...env, PATH: '' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^add: cannot tell whether .* is in a git repository: /);
  assert.equal(fs.existsSync(at(dir)), false);
  // A linked worktree whose git directory is gone is a repository git will not open, not outside one.
  fs.writeFileSync(path.join(dir, '.git'), `gitdir: ${path.join(dir, 'gone')}\n`);
  const broken = cli(...ADD, at(dir));
  assert.equal(broken.status, 2);
  // Git words this refusal two ways across versions; either is a repository git will not open.
  assert.match(broken.stderr, /^add: cannot tell whether .* is in a git repository: fatal: (not a git repository|gitfile does not point to a valid repository): /);
  assert.equal(fs.existsSync(at(dir)), false);
});

test('6.1: a commit that fails leaves the line unstaged, exits 2 and says appended, not committed, and not to add again', (t) => {
  const dir = repo(t);
  const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const r = cli(...ADD, at(dir));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^add: appended, not committed \(2030-01-02-[0-9a-f]{4}\); the record is written, so do not run add again for it/);
  assert.equal(lines(dir).length, 1);
  assert.equal(git(dir, 'status', '--porcelain').trim(), `?? ${LOG}`);
  assert.equal(fs.existsSync(path.join(dir, '.git', 'costs-add.lock')), false);
  // A log already committed, with another file staged: the log ends modified and unstaged, the other file staged.
  const tracked = repo(t);
  write(tracked, [record()]);
  git(tracked, 'add', LOG);
  git(tracked, 'commit', '-q', '-m', 'log');
  fs.writeFileSync(path.join(tracked, 'other.txt'), 'two\n');
  git(tracked, 'add', 'other.txt');
  fs.writeFileSync(path.join(tracked, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.equal(cli(...ADD, at(tracked)).status, 2);
  assert.equal(lines(tracked).length, 2);
  assert.equal(git(tracked, 'status', '--porcelain'), ` M ${LOG}\nM  other.txt\n`);
  // A log the repository ignores: nothing is committed or staged.
  const ignored = repo(t);
  fs.writeFileSync(path.join(ignored, '.gitignore'), `${LOG}\n`);
  git(ignored, 'add', '.gitignore');
  git(ignored, 'commit', '-q', '-m', 'ignore');
  const r2 = cli(...ADD, at(ignored));
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /^add: appended, not committed/);
  assert.equal(lines(ignored).length, 1);
  assert.equal(git(ignored, 'rev-list', '--count', 'HEAD').trim(), '2');
  assert.equal(git(ignored, 'status', '--porcelain', '--ignored'), `!! ${LOG}\n`);
});

test('6.1: a lock removed by hand while add holds it does not fail the add', (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nrmdir .git/costs-add.lock\n', { mode: 0o755 });
  const r = cli(...ADD, at(dir));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD').trim(), '2');
  assert.equal(fs.existsSync(path.join(dir, '.git', 'costs-add.lock')), false);
});

test('6.1: a held lock refuses after the wait and names its age; nothing is written', (t) => {
  const dir = repo(t);
  const lock = path.join(dir, '.git', 'costs-add.lock');
  fs.mkdirSync(lock);
  const old = new Date(Date.now() - 90000);
  fs.utimesSync(lock, old, old);
  const t0 = Date.now();
  let message = '';
  refuses(() => C.add(at(dir), RUN, { waitMs: 100 }), { test: (m) => { message = m; return /the lock .*costs-add\.lock is \d+ s old/.test(m); } });
  const age = Number(/is (\d+) s old/.exec(message)[1]);
  const slack = Math.ceil((Date.now() - t0) / 1000);
  assert.ok(age >= 89 && age <= 91 + slack, `the lock is ${age} s old after ${slack} s`);
  assert.equal(fs.existsSync(at(dir)), false);
  assert.equal(fs.existsSync(lock), true);
});

test('6.1: add takes a lock released within the wait, and with no wait given refuses a held one after 10 seconds', async (t) => {
  const held = repo(t);
  const freed = repo(t);
  fs.mkdirSync(path.join(held, '.git', 'costs-add.lock'));
  fs.mkdirSync(path.join(freed, '.git', 'costs-add.lock'));
  const started = Date.now();
  const exit = (dir) => {
    const child = spawn(process.execPath, [SCRIPT, ...ADD, at(dir)]);
    return { child, done: new Promise((resolve) => child.on('close', (code) => resolve([code, Date.now() - started]))) };
  };
  const a = exit(held);
  const b = exit(freed);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(b.child.exitCode, null);
  fs.rmdirSync(path.join(freed, '.git', 'costs-add.lock'));
  const [freedCode, freedMs] = await b.done;
  assert.equal(freedCode, 0);
  assert.ok(freedMs < 9000, `waited ${freedMs} ms`);
  assert.equal(lines(freed).length, 1);
  const [heldCode, heldMs] = await a.done;
  assert.equal(heldCode, 2);
  assert.ok(heldMs >= 10000 && heldMs < 15000, `waited ${heldMs} ms`);
  assert.equal(fs.existsSync(at(held)), false);
});

test('6.1: four adds at once leave four whole lines with different ids, and four commits', async (t) => {
  const dir = repo(t);
  const run = (tokens) => new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, 'add', '--file', at(dir), '--repo', 'demo', '--step', 'implement', '--model', 'opus-5.5', '--tokens', tokens]);
    child.on('close', resolve);
  });
  assert.deepEqual(await Promise.all([run('11'), run('22'), run('33'), run('44')]), [0, 0, 0, 0]);
  const got = lines(dir);
  assert.deepEqual(got.map((r) => r.tokens).sort(), [11, 22, 33, 44]);
  assert.equal(new Set(got.map((r) => r.id)).size, 4);
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD').trim(), '5');
  assert.equal(git(dir, 'status', '--porcelain').trim(), '');
});

test('6.1: the command line takes one flag per key and prints the id; with no COSTS_TODAY the date is today', (t) => {
  const dir = folder(t);
  const noteFile = path.join(dir, 'note.txt');
  fs.writeFileSync(noteFile, 'from a file\n');
  const a = cli('add', '--file', at(dir), '--repo', 'demo', '--step', 'task-review', '--model', 'opus-5.5', '--tokens', '120000', '--resumed',
    '--total', '150000', '--read', 'abc..def', '--minutes', '5.3', '--round', '2', '--verdict', 'approved', '--finding', 'major=2',
    '--finding', 'minor=0', '--note-file', noteFile, '--date', '2030-03-04');
  assert.equal(a.status, 0, a.stderr);
  const env = { ...process.env };
  delete env.COSTS_TODAY;
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const b = spawnSync(process.execPath, [SCRIPT, 'add', '--file', at(dir), '--kind', 'escape', '--run', a.stdout.trim(), '--class', 'contract-gap',
    '--found-by', 'a later review', '--note-file', '-'], { encoding: 'utf8', input: 'from standard input\n', env });
  assert.equal(b.status, 0, b.stderr);
  const c = cli('add', '--file', at(dir), '--repo', 'demo', '--step', 'executing-critique', '--model', 'opus-5.5', '--tokens', '7', '--read', 'abc',
    '--tasks-done', '2', '--tasks-total', '3', '--tools', '39', '--first-changed', 'T2', '--note', 'given inline');
  assert.equal(c.status, 0, c.stderr);
  const [run, esc, third] = lines(dir);
  assert.equal(`${run.id}\n`, a.stdout);
  assert.deepEqual(run, { kind: 'run', id: run.id, date: '2030-03-04', repo: 'demo', step: 'task-review', model: 'opus-5.5', tokens: 120000,
    resumed: true, total: 150000, round: 2, minutes: 5.3, read: 'abc..def', verdict: 'approved', findings: { major: 2, minor: 0 }, note: 'from a file' });
  assert.deepEqual(esc, { kind: 'escape', id: esc.id, date: local, run: run.id, class: 'contract-gap', 'found-by': 'a later review', note: 'from standard input' });
  assert.deepEqual(third, { kind: 'run', id: third.id, date: '2030-01-02', repo: 'demo', step: 'executing-critique', model: 'opus-5.5', tokens: 7,
    tools: 39, read: 'abc', 'tasks-done': 2, 'tasks-total': 3, 'first-changed': 'T2', note: 'given inline' });
});

test('6.1: the command line refuses an unknown flag, a flag of the other kind or given twice, an id, and a bad finding', (t) => {
  const dir = folder(t);
  const base = ['add', '--file', at(dir), '--repo', 'demo', '--step', 'implement', '--model', 'opus-5.5', '--tokens', '5'];
  for (const [extra, pattern] of [
    [['--mode', 'attended'], /^add: unknown flag --mode/], [['--class', 'miss'], /^add: unknown flag --class/],
    [['--id', '2030-01-01-0a0a'], /^add: unknown flag --id/], [['--findings', 'major=1'], /^add: unknown flag --findings/],
    [['--finding', 'major'], /^add: --finding takes grade=count, not major/], [['--finding', 'major=two'], /^add: --finding takes grade=count/],
    [['--finding', 'major=1', '--finding', 'major=4'], /^add: --finding major given twice/],
    [['--finding', 'major=99999999999999999999'], /^add: findings: a map/],
    [['--tokens', '6'], /^--tokens given twice/], [['--resumed', '--resumed'], /^--resumed given twice/],
    [['--note', 'a', '--note-file', 'b'], /^add: give --note or --note-file, not both/],
    [['--tokens'], /^--tokens given twice/], [['stray'], /^not a flag: stray/],
  ]) {
    const r = cli(...base, ...extra);
    assert.equal(r.status, 2);
    assert.match(r.stderr, pattern);
  }
  assert.match(cli(...base.slice(0, 9), '--tokens').stderr, /^--tokens needs a value/);
  assert.match(cli(...base.slice(0, 9), '--tokens', '5k').stderr, /^add: tokens: a whole number/);
  assert.match(cli(...base.slice(0, 9), '--tokens', '99999999999999999999').stderr, /^add: tokens: a whole number/);
  assert.equal(fs.existsSync(at(dir)), false);
  assert.match(cli('adds').stderr, /^usage: costs\.mjs </);
});

test('6: a log or note file that cannot be read or appended to refuses in one line and exits 2', (t) => {
  const dir = folder(t);
  const cases = [
    [['--file', path.join(dir, 'missing', LOG)], /^add: no folder .*missing\n$/],
    [['--file', dir], /^cannot read .* \(EISDIR\)\n$/],
    [['--file', at(dir), '--note-file', path.join(dir, 'missing.txt')], /^add: cannot read --note-file .*missing\.txt \(ENOENT\)\n$/],
    // Under a regular file: ENOTDIR on Linux and macOS, ENOENT on Windows.
    [['--file', at(dir), '--note-file', path.join(SCRIPT, 'note.txt')], /^add: cannot read --note-file .*note\.txt \((ENOTDIR|ENOENT)\)\n$/],
  ];
  for (const [extra, pattern] of cases) {
    const r = cli(...ADD.slice(0, -1), ...extra);
    assert.equal(r.status, 2);
    assert.match(r.stderr, pattern);
  }
  write(dir, [record()]);
  fs.chmodSync(at(dir), 0o444);
  const r = cli(...ADD, at(dir));
  fs.chmodSync(at(dir), 0o644);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^add: cannot append to .*COSTS\.jsonl \((EACCES|EPERM)\)\n$/);
});

test('6.6: add --help, and add with no flags, print every key of each kind, whether it is required, and its rule', () => {
  const h = cli('add', '--help');
  assert.equal(h.status, 0);
  for (const key of [...C.RUN_KEYS, ...C.ESCAPE_KEYS, ...C.VOID_KEYS].filter((k) => !['kind', 'id', 'findings', 'note', 'resumed'].includes(k))) {
    assert.match(h.stdout, new RegExp(`^  --${key} <value>: `, 'm'));
  }
  for (const line of [
    'A run record (the default):', 'An escape record (--kind escape):',
    '  --date <value>: default today; an ISO date',
    '  --repo <value>: required; lower-case letters, digits, dot, underscore, hyphen',
    '  --step <value>: required; one of reading-critique, executing-critique, draft, implement, task-review, simplify, clearing-review, other',
    '  --step-note <value>: required with step other, and only then; one line of text',
    '  --effort <value>: optional; lower-case letters, digits, dot, hyphen',
    '  --resumed: optional; true, or absent',
    '  --read <value>: required with step reading-critique or executing-critique or task-review or simplify or clearing-review; the commit or range the step read, on one line',
    '  --tasks-done <value>: optional, only with step executing-critique; a whole number, zero or more',
    '  --finding <grade>=<count> (repeatable): optional; a map of grade (lower-case letters, digits, hyphen) to a whole number',
    '  --note <text> or --note-file <path> (- reads standard input): required; text',
    '  --supersedes <value>: optional; the id of the earlier line it corrects, not yet superseded: a record of this kind, or a line that is not a valid record',
    '  --run <value>: required; the id of the earlier run record that passed the defect, or one line of text for a run older than the records',
    'A void record (--kind void), which retracts a record that should not exist:',
    '  --supersedes <value>: required; the id of the earlier line it retracts, of any kind, not yet superseded and not a void record',
    '  --note <text> or --note-file <path> (- reads standard input): required; text, why the record is retracted',
  ]) assert.ok(h.stdout.split('\n').includes(line), line);
  const bare = cli('add');
  assert.equal(bare.status, 2);
  assert.equal(bare.stderr, h.stdout);
});

test('3: the default log is COSTS.jsonl in the parent of the script folder, and --file wins', (t) => {
  assert.equal(C.DEFAULT_FILE, path.join(path.dirname(path.dirname(SCRIPT)), 'COSTS.jsonl'));
  const dir = folder(t);
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'costs.mjs'));
  const r = spawnSync(process.execPath, [path.join(dir, 'scripts', 'costs.mjs'), 'add', '--repo', 'demo', '--step', 'implement', '--model', 'opus-5.5',
    '--tokens', '5'], { encoding: 'utf8', cwd: os.tmpdir() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lines(dir).length, 1);
});

// ==== check, similar, table

test('6.2: check passes a clean log, counts its records and lists grades and step-notes', (t) => {
  const dir = folder(t);
  write(dir, [
    record({ findings: { major: 2, nit: 1 } }),
    record({ id: '2030-01-01-0b0b', step: 'other', 'step-note': 'a smoke test', findings: { major: 3 } }),
    record({ id: '2030-01-01-0c0c', step: 'other', 'step-note': 'a smoke test' }),
    escape({ run: '2030-01-01-0a0a' }),
    voided({ supersedes: '2030-01-01-0c0c' }),
  ]);
  assert.deepEqual(C.check(at(dir)), { problems: [], info: ['records: 3 run, 1 escape, 1 void', 'grades in use: major 5, nit 1', 'step-notes in use: a smoke test 2'] });
  const r = cli('check', '--file', at(dir));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'records: 3 run, 1 escape, 1 void\ngrades in use: major 5, nit 1\nstep-notes in use: a smoke test 2\n');
  fs.writeFileSync(at(dir), '');
  assert.deepEqual(C.check(at(dir)), { problems: [], info: ['records: 0 run, 0 escape, 0 void', 'grades in use: none', 'step-notes in use: none'] });
});

const NO_ID = 'no usable id, so no record can supersede this line: delete it by hand and commit the log';
const VOID_HAND = 'a void record, so no record can supersede this line: delete it by hand and commit the log';

test('6.2: check fails on each of its conditions, with the line number, and not on a line a later line supersedes', (t) => {
  const dir = folder(t);
  const cases = [
    // A bad line with no well-formed id cannot be superseded, and check says to delete it; one with an id is not told so.
    [[record(), '{"kind":"run"'], ['line 2: not JSON', `line 2: ${NO_ID}`]],
    [['[1]'], ['line 1: not an object', `line 1: ${NO_ID}`]],
    [[record({ id: 'r1' })], ["line 1: id: the record's date, a hyphen and four hex characters", `line 1: ${NO_ID}`]],
    [['{"kind":"run","date":"2030-01-01"}'], ["line 1: id: required (the record's date, a hyphen and four hex characters)", 'line 1: repo: required (lower-case letters, digits, dot, underscore, hyphen)',
      `line 1: step: required (one of ${C.STEPS.join(', ')})`, 'line 1: model: required (lower-case letters, digits, dot, hyphen)',
      'line 1: tokens: required (a whole number, zero or more)', `line 1: ${NO_ID}`]],
    [[record({ tokens: -1 })], 'line 1: tokens: a whole number, zero or more'],
    [[record({ id: '2030-01-02-0a0a' })], "line 1: id: its first ten characters are the record's date"],
    [[record(), '', record()], 'line 3: id 2030-01-01-0a0a occurs twice'],
    [[record(), escape({ id: '2030-01-01-0a0a' })], 'line 2: id 2030-01-01-0a0a occurs twice'],
    [[record({ supersedes: '2030-01-01-0a0a' })], 'line 1: supersedes: no earlier record 2030-01-01-0a0a'],
    [[record({ supersedes: '2030-01-01-0b0b' }), record({ id: '2030-01-01-0b0b' })], 'line 1: supersedes: no earlier record 2030-01-01-0b0b'],
    [[escape(), record({ supersedes: '2030-01-01-0e0e' })], 'line 2: supersedes: 2030-01-01-0e0e is an escape record'],
    [[escape({ run: '2030-01-01-0a0a' }), record()], 'line 1: run: no earlier run record 2030-01-01-0a0a'],
    [[record(), record({ id: '2030-01-01-0b0b', supersedes: '2030-01-01-0a0a' }), record({ id: '2030-01-01-0c0c', supersedes: '2030-01-01-0a0a' })],
      'line 3: supersedes: 2030-01-01-0a0a is already superseded; the record that stands is 2030-01-01-0b0b'],
    [[record(), voided(), record({ id: '2030-01-01-0c0c', supersedes: '2030-01-01-0f0f' })],
      'line 3: supersedes: 2030-01-01-0f0f is a void record, and a void is never superseded: record the run or escape again'],
    // No record can supersede a void either, so a void with a problem is deleted by hand, and check says so.
    [[record(), voided({ supersedes: '2030-01-01-ffff' })], ['line 2: supersedes: no earlier record 2030-01-01-ffff', `line 2: ${VOID_HAND}`]],
    [[record(), record({ id: '2030-01-01-0b0b', supersedes: '2030-01-01-0a0a' }), voided()],
      ['line 3: supersedes: 2030-01-01-0a0a is already superseded; the record that stands is 2030-01-01-0b0b', `line 3: ${VOID_HAND}`]],
    [[record(), voided(), voided({ id: '2030-01-01-0f10', supersedes: '2030-01-01-0f0f' })],
      ['line 3: supersedes: 2030-01-01-0f0f is a void record, and a void is never superseded: record the run or escape again', `line 3: ${VOID_HAND}`]],
  ];
  for (const [records, problem] of cases) {
    write(dir, records);
    assert.deepEqual(C.check(at(dir)).problems, [].concat(problem));
  }
  write(dir, [record(), escape({ run: '2030-01-01-ffff', 'found-by': 'x\ny' }), escape({ id: '2030-01-01-0e0f', supersedes: '2030-01-01-0e0e', run: '2030-01-01-0a0a' }),
    '{"kind":"run","id":"2030-01-01-0b0b","tokens":-1}', voided({ supersedes: '2030-01-01-0b0b' })]);
  assert.deepEqual(C.check(at(dir)).problems, []);
  fs.writeFileSync(at(dir), JSON.stringify(record()));
  assert.deepEqual(C.check(at(dir)).problems, ['the log does not end in a line end']);
  const r = cli('check', '--file', at(dir));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^the log does not end in a line end\nrecords: 1 run, 0 escape, 0 void\n/);
});

test('6.5: a log that does not exist or cannot be read refuses, for every reader', (t) => {
  const dir = folder(t);
  for (const args of [['check'], ['similar', 'implement'], ['table']]) {
    const r = cli(...args, '--file', at(dir));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^no log at .*COSTS\.jsonl/);
    assert.match(cli(...args, '--file', dir).stderr, /^cannot read .* \(EISDIR\)\n$/);
  }
});

const run = (id, date, tokens, extra) => record({ id: `${date}-${id}`, date, tokens, ...extra });

test('6.3: similar prints the spread of fresh runs and the last five, the newest first', (t) => {
  const dir = folder(t);
  write(dir, [
    run('0001', '2030-01-09', 1000), run('0002', '2030-01-03', 3000000), run('0003', '2030-01-05', 2000),
    run('0004', '2030-01-04', 4000), run('0005', '2030-01-08', 5000), run('0006', '2030-01-06', 7000, { model: 'sonnet-5.5', repo: 'other-repo' }),
    run('0007', '2030-01-10', 999999, { resumed: true, total: 999999 }),
    run('0008', '2030-01-10', 888888, { step: 'simplify', read: 'abc' }),
    run('0009', '2030-01-10', 777777), run('0010', '2030-01-11', 666666, { supersedes: '2030-01-10-0009' }),
    run('0011', '2030-01-11', 6000, { supersedes: '2030-01-11-0010' }),
  ]);
  assert.equal(C.similar(at(dir), 'implement').out, [
    'implement: 7 fresh runs, min 1,000, median 5,000, max 3,000,000 tokens (2030-01-03 to 2030-01-11)',
    'last 5:', '  2030-01-11  6,000  opus-5.5  demo', '  2030-01-09  1,000  opus-5.5  demo', '  2030-01-08  5,000  opus-5.5  demo',
    '  2030-01-06  7,000  sonnet-5.5  other-repo', '  2030-01-05  2,000  opus-5.5  demo',
  ].join('\n'));
  assert.equal(C.similar(at(dir), 'implement', { model: 'opus-5.5' }).out.split('\n')[0],
    'implement: 6 fresh runs, min 1,000, median 4,500, max 3,000,000 tokens (2030-01-03 to 2030-01-11)');
  assert.equal(C.similar(at(dir), 'implement', { repo: 'other-repo' }).out,
    'implement: 1 fresh run, min 7,000, median 7,000, max 7,000 tokens (2030-01-06 to 2030-01-06)\nlast 1:\n  2030-01-06  7,000  sonnet-5.5  other-repo');
  assert.equal(C.similar(at(dir), 'simplify', { model: 'opus-5.5', repo: 'demo' }).out.split('\n')[0],
    'simplify: 1 fresh run, min 888,888, median 888,888, max 888,888 tokens (2030-01-10 to 2030-01-10)');
  assert.equal(cli('similar', 'implement', '--file', at(dir), '--model', 'sonnet-5.5', '--repo', 'other-repo').stdout.split('\n')[0],
    'implement: 1 fresh run, min 7,000, median 7,000, max 7,000 tokens (2030-01-06 to 2030-01-06)');
});

test('6.3: the median of an even count is the mean of the middle two, rounded', (t) => {
  const dir = folder(t);
  write(dir, [run('0001', '2030-01-01', 10), run('0002', '2030-01-01', 1), run('0003', '2030-01-01', 4), run('0004', '2030-01-01', 9)]);
  assert.match(C.similar(at(dir), 'implement').out, /min 1, median 7, max 10 tokens/);
});

test('6.3: with no run of the step, similar says not yet measured; a step not in the list refuses', (t) => {
  const dir = folder(t);
  write(dir, [run('0001', '2030-01-01', 10, { resumed: true, total: 10 })]);
  assert.equal(C.similar(at(dir), 'implement').out, 'implement: not yet measured');
  assert.equal(cli('similar', 'draft', '--file', at(dir)).stdout, 'draft: not yet measured\n');
  refuses(() => C.similar(at(dir), 'build'), /^similar: give a step, one of reading-critique, /);
  assert.equal(cli('similar', '--file', at(dir)).status, 2);
  assert.match(cli('similar', 'draft', '--file', at(dir), '--since', '2030-01-01').stderr, /^similar: unknown flag --since/);
});

const TABLE = [
  run('0001', '2030-01-10', 100000, { findings: { major: 2, nit: 0 } }),
  run('0002', '2030-01-11', 300000, { findings: { major: 1, minor: 4 } }),
  run('0003', '2030-01-12', 50002, { resumed: true, total: 350002 }),
  run('0004', '2030-01-12', 80000, { step: 'clearing-review', read: 'abc', resumed: true, total: 200000 }),
  run('0005', '2030-01-13', 70000, { step: 'draft' }),
  run('0006', '2030-01-13', 999, { step: 'draft', supersedes: '2030-01-13-0005' }),
  run('0007', '2030-01-13', 555, { step: 'draft', supersedes: '2030-01-13-0006' }),
  escape({ id: '2030-01-12-e001', date: '2030-01-12', run: '2030-01-10-0001' }),
  escape({ id: '2030-01-12-e002', date: '2030-01-12', run: '2030-01-12-0004' }),
  escape({ id: '2030-01-13-e003', date: '2030-01-13', run: 'a run older than the log' }),
  escape({ id: '2030-01-13-e004', date: '2030-01-13', run: '2030-01-12-0004', supersedes: '2030-01-12-e002' }),
  escape({ id: '2030-01-13-e005', date: '2030-01-13', run: '2030-01-11-0002' }),
  escape({ id: '2030-01-14-e006', date: '2030-01-14', run: '2030-01-13-0005' }),
  // Two escapes whose id-shaped run names no run: one names an escape, one names nothing. Both are unlinked.
  escape({ id: '2030-01-13-e007', date: '2030-01-13', run: '2030-01-12-e001' }),
  escape({ id: '2030-01-13-e008', date: '2030-01-13', run: '2030-01-09-ffff' }),
];

test('6.4: table prints every column per step, the totals and the unlinked escapes', (t) => {
  const dir = folder(t);
  write(dir, TABLE);
  assert.equal(C.table(at(dir)).out, [
    '| Step | Runs | Fresh | Min | Median | Max | Tokens | Findings | Escapes |',
    '|---|---|---|---|---|---|---|---|---|',
    '| draft | 1 | 1 | 555 | 555 | 555 | 555 | - | 1 |',
    '| implement | 3 | 2 | 100,000 | 200,000 | 300,000 | 450,002 | major 3 (150,001 each), minor 4 (112,501 each), nit 0 | 2 |',
    '| clearing-review | 1 | 0 | - | - | - | 80,000 | - | 1 |',
    '',
    'total: 5 runs, 530,557 tokens, 7 escapes',
    'escapes with no linked run: 3',
  ].join('\n'));
});

test('6.4: the date range is inclusive at both ends; an escape in range counts on its run step, whatever the run date', (t) => {
  const dir = folder(t);
  write(dir, TABLE);
  assert.equal(C.table(at(dir), { since: '2030-01-11', until: '2030-01-12' }).out.split('\n').slice(2).join('\n'), [
    '| implement | 2 | 1 | 300,000 | 300,000 | 300,000 | 350,002 | major 1 (350,002 each), minor 4 (87,501 each) | 1 |',
    '| clearing-review | 1 | 0 | - | - | - | 80,000 | - | 0 |',
    '',
    'total: 3 runs, 430,002 tokens, 1 escape',
    'escapes with no linked run: 0',
  ].join('\n'));
  assert.equal(cli('table', '--file', at(dir), '--since', '2030-01-14', '--until', '2030-01-14').stdout, [
    '| Step | Runs | Fresh | Min | Median | Max | Tokens | Findings | Escapes |',
    '|---|---|---|---|---|---|---|---|---|',
    '| draft | 0 | 0 | - | - | - | 0 | - | 1 |',
    '',
    'total: 0 runs, 0 tokens, 1 escape',
    'escapes with no linked run: 0',
    '',
  ].join('\n'));
  assert.match(C.table(at(dir), { since: '2030-01-12' }).out, /\| implement \| 1 \| 0 \|/);
  assert.match(C.table(at(dir), { until: '2030-01-10' }).out, /total: 1 run, 100,000 tokens, 0 escapes/);
  refuses(() => C.table(at(dir), { since: 'january' }), /^table: --since takes an ISO date/);
  refuses(() => C.table(at(dir), { until: '2030-02-30' }), /^table: --until takes an ISO date/);
  assert.match(cli('table', '--file', at(dir), '--model', 'opus-5.5').stderr, /^table: unknown flag --model/);
});

test('6.5: similar and table skip a line that is not a valid record and say so, unless a later line supersedes it', (t) => {
  const dir = folder(t);
  write(dir, [run('0001', '2030-01-01', 10), '{"kind":"run","id":"2030-01-01-0b', record({ id: '2030-01-01-0c0c', tokens: -5 }), run('0002', '2030-01-01', 30)]);
  const s = cli('similar', 'implement', '--file', at(dir));
  assert.equal(s.status, 0);
  assert.match(s.stdout, /^implement: 2 fresh runs, min 10, median 20, max 30 /);
  assert.equal(s.stderr, 'costs: skipped 2 lines that are not a valid record; run check\n');
  write(dir, [run('0001', '2030-01-01', 10), 'torn']);
  const tb = cli('table', '--file', at(dir));
  assert.equal(tb.status, 0);
  assert.match(tb.stdout, /total: 1 run, 10 tokens, 0 escapes/);
  assert.equal(tb.stderr, 'costs: skipped 1 line that is not a valid record; run check\n');
  write(dir, [record({ tokens: -5 }), run('0001', '2030-01-01', 10, { supersedes: '2030-01-01-0a0a' })]);
  assert.equal(cli('table', '--file', at(dir)).stderr, '');
});

test('4.4: a void drops its target and counts as nothing: no run, escape, row, total, list or skipped line; an escape naming a voided run still counts on its step', (t) => {
  const dir = folder(t);
  write(dir, [
    run('0001', '2030-01-10', 100), run('0002', '2030-01-10', 900),
    escape({ id: '2030-01-10-e001', date: '2030-01-10', run: '2030-01-10-0001' }), escape({ id: '2030-01-10-e002', date: '2030-01-10', run: '2030-01-10-0001' }),
    escape({ id: '2030-01-10-e003', date: '2030-01-10', run: 'an older run' }), escape({ id: '2030-01-10-e004', date: '2030-01-10', run: '2030-01-10-0002' }),
    '{"kind":"run","id":"2030-01-10-0b0b","tokens":-1}',
    voided({ id: '2030-01-11-0f01', date: '2030-01-11', supersedes: '2030-01-10-0002' }),
    voided({ id: '2030-01-11-0f02', date: '2030-01-11', supersedes: '2030-01-10-e002' }),
    voided({ id: '2030-01-11-0f03', date: '2030-01-11', supersedes: '2030-01-10-0b0b' }),
    voided({ id: '2030-01-11-0f04', date: '2030-01-11', supersedes: '2030-01-10-e003' }),
  ]);
  assert.deepEqual(C.similar(at(dir), 'implement'), {
    out: 'implement: 1 fresh run, min 100, median 100, max 100 tokens (2030-01-10 to 2030-01-10)\nlast 1:\n  2030-01-10  100  opus-5.5  demo', skipped: 0,
  });
  assert.deepEqual(C.table(at(dir)), { out: [
    '| Step | Runs | Fresh | Min | Median | Max | Tokens | Findings | Escapes |',
    '|---|---|---|---|---|---|---|---|---|',
    '| implement | 1 | 1 | 100 | 100 | 100 | 100 | - | 2 |',
    '',
    'total: 1 run, 100 tokens, 2 escapes',
    'escapes with no linked run: 0',
  ].join('\n'), skipped: 0 });
});
