#!/usr/bin/env node
// costs.mjs: a cost log of agent runs, one JSON record per line. `add` validates a record, appends it and
// commits the log alone; `check` validates the whole log; `similar` and `table` print the figures a cost gate
// and a periodic review quote. No dependencies.
//
// Usage: node scripts/costs.mjs <add|check|similar|table> [--file path] [args]; `add --help` lists the keys.
// The log is COSTS.jsonl in the parent of this script's folder unless --file names another.
// Exit: 0 done; 1 check found problems; 2 refused (nothing changed, except "appended, not committed").
// Test seam: COSTS_TODAY=YYYY-MM-DD stands in for today's date; the tests set it, nothing else should.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class CostsError extends Error {}

// ==== T1: records and add

export const DEFAULT_FILE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'COSTS.jsonl');
export const STEPS = ['reading-critique', 'executing-critique', 'draft', 'implement', 'task-review', 'simplify', 'clearing-review', 'other'];
// The steps whose record must say what the step read.
export const NEEDS_READ = ['reading-critique', 'executing-critique', 'task-review', 'simplify', 'clearing-review'];
export const VERDICTS = ['cleared', 'not-cleared', 'approved', 'needs-fixes', 'clean', 'none'];
export const CLASSES = ['miss', 'contract-gap'];
const NUMBER_KEYS = ['tokens', 'total', 'round', 'tools', 'minutes', 'tasks-done', 'tasks-total'];

const ID = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{4}$/;
const isId = (v) => typeof v === 'string' && ID.test(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const whole = (min) => (v) => Number.isSafeInteger(v) && v >= min;
const matches = (re) => (v) => typeof v === 'string' && re.test(v);
const oneLine = (v) => typeof v === 'string' && v !== '' && !/[\r\n]/.test(v);
const oneOf = (list) => (v) => list.includes(v);
const tag = matches(/^[a-z0-9._-]+$/);
const name = matches(/^[a-z0-9.-]+$/);
const grade = matches(/^[a-z0-9-]+$/);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idOf = (line) => (isMap(line.json) ? line.json.id : undefined);

// Each kind's keys, in the order a record is written: [key, required, only, test, rule]. required is true, false or
// a condition [key, values], met when the record's key holds one of the values; only is null or a condition
// outside which the key is refused. A test gets the whole record as well. validate, the refusals and add's help
// all read these lists, so the help cannot drift from the rules.
const ONE_LINE = 'one line of text';
const NAME = 'lower-case letters, digits, dot, hyphen';
const WHOLE = 'a whole number, zero or more';
const OTHER = ['step', ['other']];
const RESUMED = ['resumed', [true]];
const EXECUTING = ['step', ['executing-critique']];
const SUPERSEDES = 'the id of the earlier line it corrects, not yet superseded: a record of this kind, or a line that is not a valid record';
export const RULES = {
  run: [
    ['kind', true, null, (v) => v === 'run', 'run'],
    ['id', true, null, isId, "the record's date, a hyphen and four hex characters"],
    ['date', true, null, isDate, 'an ISO date'],
    ['repo', true, null, tag, 'lower-case letters, digits, dot, underscore, hyphen'],
    ['step', true, null, oneOf(STEPS), `one of ${STEPS.join(', ')}`],
    ['step-note', OTHER, OTHER, oneLine, ONE_LINE],
    ['model', true, null, name, NAME],
    ['effort', false, null, name, NAME],
    ['tokens', true, null, whole(0), WHOLE],
    ['resumed', false, null, (v) => v === true, 'true, or absent'],
    ['total', RESUMED, RESUMED, (v, r) => whole(0)(v) && !(v < r.tokens), 'a whole number, at least tokens'],
    ['round', false, null, whole(1), 'a whole number, one or more'],
    ['tools', false, null, whole(0), WHOLE],
    ['minutes', false, null, (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0, 'a number, zero or more'],
    ['plan', false, null, oneLine, ONE_LINE],
    ['pr', false, null, oneLine, ONE_LINE],
    ['read', ['step', NEEDS_READ], null, oneLine, 'the commit or range the step read, on one line'],
    ['tasks-done', false, EXECUTING, whole(0), WHOLE],
    ['tasks-total', false, EXECUTING, whole(0), WHOLE],
    ['first-changed', false, EXECUTING, oneLine, ONE_LINE],
    ['verdict', false, null, oneOf(VERDICTS), `one of ${VERDICTS.join(', ')}`],
    ['findings', false, null, (v) => isMap(v) && Object.entries(v).every(([g, n]) => grade(g) && whole(0)(n)),
      'a map of grade (lower-case letters, digits, hyphen) to a whole number'],
    ['supersedes', false, null, isId, SUPERSEDES],
    ['note', false, null, (v) => typeof v === 'string', 'text'],
  ],
  escape: [
    ['kind', true, null, (v) => v === 'escape', 'escape'],
    ['id', true, null, isId, "the record's date, a hyphen and four hex characters"],
    ['date', true, null, isDate, 'an ISO date'],
    ['run', true, null, oneLine, 'the id of the earlier run record that passed the defect, or one line of text for a run older than the records'],
    ['class', true, null, oneOf(CLASSES), CLASSES.join(' or ')],
    ['found-by', true, null, oneLine, ONE_LINE],
    ['supersedes', false, null, isId, SUPERSEDES],
    ['note', true, null, (v) => typeof v === 'string' && v !== '', 'text'],
  ],
  // A void retracts the record it supersedes and counts as nothing itself.
  void: [
    ['kind', true, null, (v) => v === 'void', 'void'],
    ['id', true, null, isId, "the record's date, a hyphen and four hex characters"],
    ['date', true, null, isDate, 'an ISO date'],
    ['supersedes', true, null, isId, 'the id of the earlier line it retracts, of any kind, not yet superseded and not a void record'],
    ['note', true, null, (v) => typeof v === 'string' && v !== '', 'text, why the record is retracted'],
  ],
};
export const RUN_KEYS = RULES.run.map(([k]) => k);
export const ESCAPE_KEYS = RULES.escape.map(([k]) => k);
export const VOID_KEYS = RULES.void.map(([k]) => k);
const KEYS = { run: RUN_KEYS, escape: ESCAPE_KEYS, void: VOID_KEYS };
const said = ([k, values]) => (values[0] === true ? k : `${k} ${values.join(' or ')}`);
const article = (kind) => (kind === 'escape' ? 'an escape' : `a ${kind}`);

// What is wrong with one record, as a list of "key: rule" strings; empty when it is valid.
export function validate(r) {
  if (!isMap(r)) return ['not an object'];
  const rules = Object.hasOwn(RULES, r.kind) ? RULES[r.kind] : null;
  if (!rules) return ['kind: run, escape or void'];
  const bad = [];
  const holds = (c) => c === true || (Array.isArray(c) && c[1].includes(r[c[0]]));
  for (const k of Object.keys(r)) if (!rules.some(([key]) => key === k)) bad.push(`${k}: not a key of ${article(r.kind)} record`);
  for (const [k, required, only, ok, rule] of rules) {
    if (!Object.hasOwn(r, k)) { if (holds(required)) bad.push(`${k}: required (${rule})`); }
    else if (only && !holds(only)) bad.push(`${k}: only with ${said(only)}`);
    else if (!ok(r[k], r)) bad.push(`${k}: ${rule}`);
  }
  if (isId(r.id) && isDate(r.date) && r.id.slice(0, 10) !== r.date) bad.push("id: its first ten characters are the record's date");
  return bad;
}

// What add --help prints: every key of each kind with whether it is required and its rule, read from RULES.
const FLAG = { resumed: '--resumed', findings: '--finding <grade>=<count> (repeatable)', note: '--note <text> or --note-file <path> (- reads standard input)' };
function status([k, required, only]) {
  if (required === true) return k === 'date' ? 'default today' : 'required';
  if (required) return `required with ${said(required)}${only ? ', and only then' : ''}`;
  return only ? `optional, only with ${said(only)}` : 'optional';
}
export function help() {
  const block = (title, rules) => [title, ...rules.filter(([k]) => k !== 'kind' && k !== 'id')
    .map((row) => `  ${FLAG[row[0]] ?? `--${row[0]} <value>`}: ${status(row)}; ${row[4]}`)];
  return [
    'usage: costs.mjs add [--file <path>] [--no-commit] --<key> <value> ...',
    'add appends one record to the log and, in a git repository, commits the log alone.',
    `It prints the id it made: ${RULES.run[1][4]}.`,
    ...block('A run record (the default):', RULES.run),
    ...block('An escape record (--kind escape):', RULES.escape),
    ...block('A void record (--kind void), which retracts a record that should not exist:', RULES.void),
  ].join('\n');
}

// A file named on the command line that cannot be read or appended to refuses in one line; anything else throws.
function fileError(e, what) {
  return ['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES', 'EPERM'].includes(e.code) ? new CostsError(`${what} (${e.code})`) : e;
}

// Every non-empty line of the log: its number, its JSON value when it is JSON, its record when it is a valid one,
// and what is wrong with it otherwise. A log that does not exist refuses.
export function readLog(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') throw new CostsError(`no log at ${file}`);
    throw fileError(e, `cannot read ${file}`);
  }
  // A byte order mark, which some Windows editors write, is not part of the first line.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = [];
  text.split('\n').forEach((raw, i) => {
    const bare = raw.replace(/\r$/, '');
    if (bare === '') return;
    let json;
    let bad;
    try { json = JSON.parse(bare); bad = validate(json); } catch { bad = ['not JSON']; }
    lines.push({ n: i + 1, json, record: bad.length ? null : json, bad });
  });
  return { text, lines, records: lines.filter((l) => l.record).map((l) => l.record) };
}

// The line at the end of id's chain of superseders among the lines given, or null when nothing supersedes id.
function standing(id, lines) {
  let end = null;
  for (let i = 0; i < lines.length; i++) {
    const next = lines.find((l) => l.record && l.record.supersedes === id);
    if (!next) break;
    end = next;
    id = next.record.id;
  }
  return end;
}

// What is wrong between one record and the lines before it in the log. The target of supersedes is any earlier
// JSON line with that id, valid or not, so a bad line can be cleared; a valid target must be of the same kind,
// except that a void may retract a record of any kind. Nothing supersedes a void.
function linkProblems(record, earlier) {
  const bad = [];
  if (Object.hasOwn(record, 'supersedes')) {
    const target = earlier.find((l) => idOf(l) === record.supersedes);
    const stands = standing(record.supersedes, earlier);
    if (!target) bad.push(`supersedes: no earlier record ${record.supersedes}`);
    else if (target.record && target.record.kind === 'void') bad.push(`supersedes: ${record.supersedes} is a void record, and a void is never superseded: record the run or escape again`);
    else if (record.kind !== 'void' && target.record && target.record.kind !== record.kind) bad.push(`supersedes: ${record.supersedes} is ${article(target.record.kind)} record`);
    else if (stands && stands.record.kind === 'void') bad.push(`supersedes: ${record.supersedes} was retracted by the void ${stands.record.id}: record the run or escape again`);
    else if (stands) bad.push(`supersedes: ${record.supersedes} is already superseded; the record that stands is ${stands.record.id}`);
  }
  if (record.kind === 'escape' && isId(record.run) && !earlier.some((l) => l.record && l.record.kind === 'run' && l.record.id === record.run)) {
    bad.push(`run: no earlier run record ${record.run}`);
  }
  return bad;
}

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } })
    .replace(/[\r\n]+$/, '');
}

// The git directory of the repository that holds dir, or null outside one. Any other failure (git missing, a
// repository git will not open, a linked worktree whose git directory is gone) refuses, so it is never read as
// "outside a repository".
function gitDirOf(dir) {
  try { return git(dir, 'rev-parse', '--absolute-git-dir'); } catch (e) {
    if (/not a git repository \(or any/.test(String(e.stderr))) return null;
    throw new CostsError(`add: cannot tell whether ${dir} is in a git repository: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}

// Run fn while holding the lock that the sessions of one checkout share: a directory under the git directory.
// Making a directory that another process is removing can fail with EPERM on Windows, so that code means
// "held" too; when it lasts to the deadline with no lock there, the lock cannot be made and add refuses. Any
// other code refuses at once. The release does not fail when the lock is already gone.
function withLock(gitDir, waitMs, fn) {
  const lock = path.join(gitDir, 'costs-add.lock');
  const deadline = Date.now() + waitMs;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST' && e.code !== 'EPERM') throw new CostsError(`add: the lock ${lock} cannot be made (${e.code})`);
      if (Date.now() >= deadline) {
        let age;
        try { age = Math.round((Date.now() - fs.statSync(lock).mtimeMs) / 1000); } catch {
          if (e.code === 'EPERM') throw new CostsError(`add: the lock ${lock} cannot be made (${e.code})`);
          continue;
        }
        throw new CostsError(`add: the lock ${lock} is ${age} s old; remove it by hand if no session is running add`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

const today = () => {
  if (process.env.COSTS_TODAY) return process.env.COSTS_TODAY;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Validate one record, append it as one line and, in a git repository, commit the log alone. fields holds the
// record's keys but id; kind defaults to run and date to today. Returns the id.
export function add(file, fields, { commit = true, waitMs = 10000, hex = () => randomBytes(2).toString('hex') } = {}) {
  const given = { kind: 'run', date: today(), ...fields };
  given.id = `${isDate(given.date) ? given.date : '0000-00-00'}-0000`;
  const bad = validate(given);
  if (bad.length) throw new CostsError(`add: ${bad.join('; ')}`);
  const dir = path.dirname(path.resolve(file));
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new CostsError(`add: no folder ${dir}`);
  const gitDir = gitDirOf(dir);
  const append = () => {
    const log = fs.existsSync(file) ? readLog(file) : { text: '', lines: [] };
    const links = linkProblems(given, log.lines);
    if (links.length) throw new CostsError(`add: ${links.join('; ')}`);
    let id;
    do { id = `${given.date}-${hex()}`; } while (log.lines.some((l) => idOf(l) === id));
    const record = Object.fromEntries(KEYS[given.kind].filter((k) => Object.hasOwn(given, k)).map((k) => [k, k === 'id' ? id : given[k]]));
    // One write call on a file opened for append: the log is never opened for writing, so it cannot shrink.
    const lead = log.text !== '' && !log.text.endsWith('\n') ? '\n' : '';
    try { fs.appendFileSync(file, `${lead}${JSON.stringify(record)}\n`); } catch (e) { throw fileError(e, `add: cannot append to ${file}`); }
    if (gitDir !== null && commit) {
      const subject = record.kind === 'run' ? `Costs: ${record.step} ${record.repo}` : `Costs: ${record.kind}`;
      try {
        git(dir, 'add', '--', path.basename(file));
        git(dir, 'commit', '-q', '-m', subject, '--', path.basename(file));
      } catch (e) {
        const why = String(e.stderr || e.message).replace(/[\r\n]+$/, '');
        // Unstaged again, so the session's next commit does not sweep the log in.
        try { git(dir, 'reset', '-q', '--', path.basename(file)); } catch { /* the message below still holds */ }
        throw new CostsError(`add: appended, not committed (${id}); the record is written, so do not run add again for it: ${why}`);
      }
    }
    return id;
  };
  return gitDir === null ? append() : withLock(gitDir, waitMs, append);
}

// The flags after a command, as { name: value }. A flag in bare takes no value; one in many may repeat; any
// other flag given twice refuses.
function flags(argv, { bare = [], many = [] } = {}) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new CostsError(`not a flag: ${a}`);
    const k = a.slice(2);
    if (Object.hasOwn(out, k) && !many.includes(k)) throw new CostsError(`--${k} given twice`);
    if (bare.includes(k)) { out[k] = true; continue; }
    if (i + 1 >= argv.length) throw new CostsError(`--${k} needs a value`);
    const v = argv[++i];
    if (many.includes(k)) (out[k] ??= []).push(v);
    else out[k] = v;
  }
  return out;
}

const COMMANDS = {};

COMMANDS.add = (argv) => {
  if (argv.length === 0) { console.error(help()); return 2; }
  const f = flags(argv, { bare: ['resumed', 'no-commit', 'help'], many: ['finding'] });
  if (f.help) { console.log(help()); return 0; }
  if (Object.hasOwn(f, 'note') && Object.hasOwn(f, 'note-file')) throw new CostsError('add: give --note or --note-file, not both');
  const file = f.file ?? DEFAULT_FILE;
  const kind = f.kind ?? 'run';
  const keys = Object.hasOwn(KEYS, kind) ? KEYS[kind] : RUN_KEYS;
  const fields = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === 'file' || k === 'no-commit') continue;
    if (k === 'note-file') {
      try { fields.note = fs.readFileSync(v === '-' ? 0 : v, 'utf8').replace(/[\r\n]+$/, ''); } catch (e) { throw fileError(e, `add: cannot read --note-file ${v}`); }
      continue;
    }
    if (k === 'finding') {
      fields.findings = {};
      for (const pair of v) {
        const m = pair.match(/^([^=]+)=(\d+)$/);
        if (!m) throw new CostsError(`add: --finding takes grade=count, not ${pair}`);
        if (Object.hasOwn(fields.findings, m[1])) throw new CostsError(`add: --finding ${m[1]} given twice`);
        fields.findings[m[1]] = Number(m[2]);
      }
      continue;
    }
    if (k === 'id' || k === 'findings' || (k !== 'kind' && !keys.includes(k))) throw new CostsError(`add: unknown flag --${k}`);
    fields[k] = NUMBER_KEYS.includes(k) && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  console.log(add(file, fields, { commit: !f['no-commit'] }));
  return 0;
};

// ==== T2: check, similar, table

// Records no later record supersedes.
function live(records) {
  const dropped = new Set(records.filter((r) => Object.hasOwn(r, 'supersedes')).map((r) => r.supersedes));
  return records.filter((r) => !dropped.has(r.id));
}

// The numbers of the lines a later valid record supersedes: check does not report them, and a reader does not
// count one as skipped.
function supersededLines(log) {
  const last = new Map();
  for (const l of log.lines) if (l.record && Object.hasOwn(l.record, 'supersedes')) last.set(l.record.supersedes, l.n);
  return new Set(log.lines.filter((l) => (last.get(idOf(l)) ?? 0) > l.n).map((l) => l.n));
}

// Every problem in the log, each with its line number, and the counts a reader of the log wants beside them.
export function check(file) {
  const log = readLog(file);
  const quiet = supersededLines(log);
  const problems = [];
  const earlier = [];
  for (const l of log.lines) {
    const mine = [...l.bad];
    if (l.record) {
      if (earlier.some((e) => idOf(e) === l.record.id)) mine.push(`id ${l.record.id} occurs twice`);
      mine.push(...linkProblems(l.record, earlier));
    }
    // No record can supersede a line with no well-formed id, nor a void, so a problem on either is deleted by hand.
    if (!l.record && !isId(idOf(l))) mine.push('no usable id, so no record can supersede this line: delete it by hand and commit the log');
    else if (l.record?.kind === 'void' && mine.length) mine.push('a void record, so no record can supersede this line: delete it by hand and commit the log');
    if (!quiet.has(l.n)) for (const b of mine) problems.push(`line ${l.n}: ${b}`);
    earlier.push(l);
  }
  if (log.text !== '' && !log.text.endsWith('\n')) problems.push('the log does not end in a line end');
  const count = (list) => {
    const m = new Map();
    for (const [k, n] of list) m.set(k, (m.get(k) ?? 0) + n);
    return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  };
  const runs = log.records.filter((r) => r.kind === 'run');
  const kinds = (kind) => log.records.filter((r) => r.kind === kind).length;
  const info = [
    `records: ${runs.length} run, ${kinds('escape')} escape, ${kinds('void')} void`,
    `grades in use: ${count(runs.flatMap((r) => Object.entries(r.findings ?? {})))}`,
    `step-notes in use: ${count(runs.filter((r) => Object.hasOwn(r, 'step-note')).map((r) => [r['step-note'], 1]))}`,
  ];
  return { problems, info };
}

const num = (n) => n.toLocaleString('en-US');
// min, median and max of a list of whole numbers; the median of an even count is the mean of the middle two.
function spread(list) {
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { min: s[0], median: s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2), max: s[s.length - 1] };
}
const skippedOf = (log) => {
  const quiet = supersededLines(log);
  return log.lines.filter((l) => !l.record && !quiet.has(l.n)).length;
};
const liveRuns = (log) => live(log.records).filter((r) => r.kind === 'run');
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// What similar steps cost before: the line a cost gate quotes, then the last five runs, the newest first.
export function similar(file, step, { model, repo } = {}) {
  if (!STEPS.includes(step)) throw new CostsError(`similar: give a step, one of ${STEPS.join(', ')}`);
  const log = readLog(file);
  const runs = liveRuns(log)
    .filter((r) => r.step === step && r.resumed !== true && (model === undefined || r.model === model) && (repo === undefined || r.repo === repo))
    .sort(byDate);
  if (runs.length === 0) return { out: `${step}: not yet measured`, skipped: skippedOf(log) };
  const s = spread(runs.map((r) => r.tokens));
  const last = runs.slice(-5).reverse();
  const out = [
    `${step}: ${runs.length} fresh run${runs.length === 1 ? '' : 's'}, min ${num(s.min)}, median ${num(s.median)}, max ${num(s.max)} tokens (${runs[0].date} to ${runs[runs.length - 1].date})`,
    `last ${last.length}:`,
    ...last.map((r) => `  ${r.date}  ${num(r.tokens)}  ${r.model}  ${r.repo}`),
  ].join('\n');
  return { out, skipped: skippedOf(log) };
}

// The per-step table a periodic review reads: runs, the spread of fresh runs, tokens, findings, escapes. An escape
// counts on the step of the run it names, whatever that run's date and whether or not it was superseded.
export function table(file, { since, until } = {}) {
  for (const [k, v] of [['since', since], ['until', until]]) if (v !== undefined && !isDate(v)) throw new CostsError(`table: --${k} takes an ISO date`);
  const log = readLog(file);
  const inRange = (r) => (since === undefined || r.date >= since) && (until === undefined || r.date <= until);
  const runs = liveRuns(log).filter(inRange);
  const escapes = live(log.records).filter((r) => r.kind === 'escape' && inRange(r));
  const stepOf = new Map(log.records.filter((r) => r.kind === 'run').map((r) => [r.id, r.step]));
  const rows = [];
  for (const step of STEPS) {
    const mine = runs.filter((r) => r.step === step);
    const escaped = escapes.filter((e) => stepOf.get(e.run) === step).length;
    if (mine.length === 0 && escaped === 0) continue;
    const fresh = mine.filter((r) => r.resumed !== true);
    const s = fresh.length ? spread(fresh.map((r) => r.tokens)) : null;
    const tokens = mine.reduce((sum, r) => sum + r.tokens, 0);
    const grades = new Map();
    for (const r of mine) for (const [g, n] of Object.entries(r.findings ?? {})) grades.set(g, (grades.get(g) ?? 0) + n);
    const findings = [...grades].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([g, n]) => (n === 0 ? `${g} 0` : `${g} ${num(n)} (${num(Math.round(tokens / n))} each)`)).join(', ') || '-';
    rows.push(`| ${step} | ${mine.length} | ${fresh.length} | ${s ? num(s.min) : '-'} | ${s ? num(s.median) : '-'} | ${s ? num(s.max) : '-'} | ${num(tokens)} | ${findings} | ${escaped} |`);
  }
  const out = [
    '| Step | Runs | Fresh | Min | Median | Max | Tokens | Findings | Escapes |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    `total: ${runs.length} run${runs.length === 1 ? '' : 's'}, ${num(runs.reduce((sum, r) => sum + r.tokens, 0))} tokens, ${escapes.length} escape${escapes.length === 1 ? '' : 's'}`,
    `escapes with no linked run: ${escapes.filter((e) => !stepOf.has(e.run)).length}`,
  ].join('\n');
  return { out, skipped: skippedOf(log) };
}

// Print a reader's output; a log with lines that are not valid records says so on standard error.
function show({ out, skipped }) {
  console.log(out);
  if (skipped) console.error(`costs: skipped ${skipped} line${skipped === 1 ? '' : 's'} that ${skipped === 1 ? 'is' : 'are'} not a valid record; run check`);
  return 0;
}

COMMANDS.check = (argv) => {
  const f = flags(argv);
  for (const k of Object.keys(f)) if (k !== 'file') throw new CostsError(`check: unknown flag --${k}`);
  const { problems, info } = check(f.file ?? DEFAULT_FILE);
  for (const p of problems) console.log(p);
  for (const i of info) console.log(i);
  return problems.length ? 1 : 0;
};

COMMANDS.similar = ([step, ...argv]) => {
  const f = flags(argv);
  for (const k of Object.keys(f)) if (!['file', 'model', 'repo'].includes(k)) throw new CostsError(`similar: unknown flag --${k}`);
  return show(similar(f.file ?? DEFAULT_FILE, step, { model: f.model, repo: f.repo }));
};

COMMANDS.table = (argv) => {
  const f = flags(argv);
  for (const k of Object.keys(f)) if (!['file', 'since', 'until'].includes(k)) throw new CostsError(`table: unknown flag --${k}`);
  return show(table(f.file ?? DEFAULT_FILE, { since: f.since, until: f.until }));
};

// ==== run

export function main([command, ...argv]) {
  if (!Object.hasOwn(COMMANDS, command ?? '')) throw new CostsError(`usage: costs.mjs <${Object.keys(COMMANDS).join('|')}> [--file path] [args]`);
  return COMMANDS[command](argv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof CostsError)) throw e;
    console.error(e.message);
    process.exitCode = 2;
  }
}
