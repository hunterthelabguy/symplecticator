#!/usr/bin/env node
// ledger.mjs: keep a decision ledger small. An index file beside the ledger holds each ruling's status; this
// script lists, checks, reserves numbers, settles merged rounds and moves settled rulings to a second file,
// byte for byte. No dependencies. Run it from the folder that holds LEDGER.md.
//
// Usage: node ~/.claude/scripts/ledger.mjs <list|check|next|merged|move|init> [args]
// Exit: 0 done; 1 check found problems; 2 refused, nothing changed.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ACTIVE = 'LEDGER.md';
export const SETTLED = 'LEDGER_SETTLED.md';
export const INDEX = 'LEDGER_INDEX.md';
export class LedgerError extends Error {}

// latin1 maps every byte to one character and back, so a file that is read and written this way keeps its
// bytes whatever its encoding, and a string's length is its size in bytes.
const read = (file) => fs.readFileSync(file, 'latin1');
const write = (file, text) => fs.writeFileSync(file, text, 'latin1');

// White space is these four ASCII characters and no other. The white-space class of a regular expression and
// the built-in trim also take the byte 0xA0, which is the last byte of several UTF-8 characters in a file
// read as latin1, so neither is used anywhere in this script.
const HEAD_SPACE = /^[ \t\r\n]+/;
const TAIL_SPACE = /[ \t\r\n]+$/;
const trimEnd = (s) => s.replace(TAIL_SPACE, '');
const trim = (s) => trimEnd(s).replace(HEAD_SPACE, '');
const blank = (s) => trim(s) === '';

// ==== T1: entries

// The id an entry heading line carries, or null. Three old forms and the new one:
//   - **R12 (2030-01-28: title).**     bullet
//   L12. "quoted words"                paragraph
//   ## L12 (2030-01-04): title         heading (every new entry)
// An old bullet with no number (`- **Design note.**`) is keyed by its text up to the first full stop.
export function entryId(line, prefix, { paragraph = true, unnumbered = true } = {}) {
  let m = line.match(new RegExp(`^(?:- \\*\\*|## )(${prefix}\\d+)[ .(:]`));
  if (m) return m[1];
  m = paragraph && line.match(new RegExp(`^(${prefix}\\d+)\\. `));
  if (m) return m[1];
  m = unnumbered && line.match(/^- \*\*([^.]*)/);
  if (m) return '`' + trim(m[1].replace(/\*\*.*$/, '').replace(/[|`]/g, '_')) + '`';
  return null;
}

// Whether a ledger's numbered entries are bullets. A ledger is two files, so loadRepo asks this of both.
export const hasNumberedBullets = (text, prefix) => new RegExp(`^- \\*\\*${prefix}\\d+[ .(:]`, 'm').test(text);

// The line that opens or closes a fenced code block: three or more backticks or tildes, indented by three
// spaces at most, counted from the start of the line (with four, or a tab, the line is text). That is
// CommonMark's rule at the top level only: inside a list item CommonMark counts from the item's text, and
// this script does not. A backtick line that has a backtick later on is code within a line, not a fence.
const FENCE = /^ {0,3}(?:(`{3,})[^`]*$|(~{3,}))/;

// Split a ledger into segments. An entry runs from its heading line to the line before the next entry, the
// next `## ` line that is not an entry, or the end of the file. A `# ` line ends nothing, and a line inside a
// fenced code block neither ends an entry nor starts one. Text that belongs to no entry (the header, a dated
// session heading) is a segment with id null. Every byte of the file is in exactly one segment, so joining
// the segments gives the file back. A bullet or a heading starts an entry wherever it stands; a paragraph
// does so only after a blank line or a heading, since a wrapped line can begin "L12. ". An old bullet with
// no number counts only in a ledger whose numbered entries are bullets (`bullets`, read from this text
// unless the caller knows the ledger's other file), and only above the first entry in the new heading form.
export function parseLedger(text, prefix, { bullets = hasNumberedBullets(text, prefix) } = {}) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const segs = [];
  let cur = null;
  let afterBreak = true;
  let headingFormSeen = false;
  let fence = null;
  for (const line of text.split(/(?<=\n)/)) {
    const bare = line.replace(/\r?\n$/, '');
    const mark = bare.match(FENCE);
    const run = mark && (mark[1] || mark[2]);
    const fenced = fence !== null || run !== null;
    if (fence === null) fence = run;
    else if (run && run[0] === fence[0] && run.length >= fence.length && blank(bare.slice(bare.indexOf(run) + run.length))) fence = null;
    const isHeading = !fenced && /^## /.test(bare);
    const id = fenced ? null : entryId(bare, prefix, { paragraph: afterBreak, unnumbered: bullets && !headingFormSeen });
    if (id !== null && isHeading) headingFormSeen = true;
    if (id !== null || isHeading || cur === null) {
      cur = { id, text: '' };
      segs.push(cur);
    }
    cur.text += line;
    afterBreak = blank(bare) || /^#{1,2} /.test(bare);
  }
  return { eol, segs };
}

export function formatLedger(ledger) {
  return ledger.segs.map((s) => s.text).join('');
}

// ==== T2: index and check

const COLS = ['id', 'date', 'status', 'round', 'pr', 'superseded-by', 'file', 'title'];
const OPEN_COLS = ['item', 'ruling', 'opened'];
export const STATUSES = ['reserved', 'standing', 'round', 'settled', 'superseded', 'unclassified'];
export const DEFAULT_THRESHOLD = 131072;

function splitRow(line) {
  const s = trim(line);
  if (s.length < 2 || !s.startsWith('|') || !s.endsWith('|')) throw new LedgerError(`${INDEX}: not a table row: ${s}`);
  const cells = [];
  let cur = '';
  for (let i = 1; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; }
    else if (s[i] === '|') { cells.push(trim(cur)); cur = ''; }
    else cur += s[i];
  }
  return cells;
}

// A table is its heading row, a separator row (cells of dashes, colons allowed at the ends), then data rows.
function parseTable(body, cols, name) {
  const lines = body.split(/\r?\n/).filter((l) => !blank(l));
  if (!lines.length || splitRow(lines[0]).join(' | ') !== cols.join(' | ')) {
    throw new LedgerError(`${INDEX}: the ${name} table must start with the row | ${cols.join(' | ')} |`);
  }
  const rule = lines.length > 1 ? splitRow(lines[1]) : [];
  if (rule.length !== cols.length || !rule.every((c) => /^:?-+:?$/.test(c))) {
    throw new LedgerError(`${INDEX}: the ${name} table needs a separator row (| --- | --- |) as its second line`);
  }
  return lines.slice(2).map((line) => {
    const cells = splitRow(line);
    if (cells.length !== cols.length) throw new LedgerError(`${INDEX}: ${cols.length} cells expected, ${cells.length} found: ${trim(line)}`);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
}

export function parseIndex(text) {
  const parts = text.split(/^## (Settings|Rulings|Open items)[ \t]*\r?\n/m);
  if (parts.length !== 7 || parts[1] !== 'Settings' || parts[3] !== 'Rulings' || parts[5] !== 'Open items') {
    throw new LedgerError(`${INDEX}: needs the sections Settings, Rulings and Open items, once each, in that order`);
  }
  const settings = {};
  for (const line of parts[2].split(/\r?\n/)) {
    if (blank(line)) continue;
    const m = line.match(/^- ([a-z-]+): ([^ \t].*)$/);
    if (!m) throw new LedgerError(`${INDEX}: not a setting: ${line}`);
    settings[m[1]] = trim(m[2]);
  }
  settings['pr-repo'] ??= 'none';
  settings['threshold-bytes'] ??= String(DEFAULT_THRESHOLD);
  if (!/^[A-Z]+$/.test(settings.prefix || '')) throw new LedgerError(`${INDEX}: the prefix setting must be capital letters`);
  if (!/^\d+$/.test(settings['threshold-bytes'])) throw new LedgerError(`${INDEX}: threshold-bytes must be a whole number`);
  return {
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    intro: parts[0],
    settings,
    rows: parseTable(parts[4], COLS, 'Rulings'),
    open: parseTable(parts[6], OPEN_COLS, 'Open items'),
  };
}

export function formatIndex(ix) {
  const row = (cells) => '|' + cells.map((c) => (c === '' ? ' ' : ` ${String(c).replace(/\|/g, '\\|')} `)).join('|') + '|';
  const table = (cols, rows) => [row(cols), '|' + cols.map(() => '---').join('|') + '|', ...rows.map((r) => row(cols.map((c) => r[c])))];
  const lines = [
    '## Settings', '',
    ...Object.entries(ix.settings).map(([k, v]) => `- ${k}: ${v}`), '',
    '## Rulings', '', ...table(COLS, ix.rows), '',
    '## Open items', '', ...table(OPEN_COLS, ix.open), '',
  ];
  return ix.intro + lines.join(ix.eol);
}

// An open item is closed when its item cell is struck through from end to end. A row struck cell by cell is
// closed the same way, and its ruling id is read through the strike. An item cell struck in part is open, and
// so is one with `~~` inside the strike (that is two strikes with open words between them) or with nothing
// inside it. One tilde inside is text, but not as the last character: `~~a~~~` is open.
const STRUCK = /^~~((?:(?!~~).)+)~~$/;
export const isClosed = (item) => STRUCK.test(item.item);
const unstruck = (cell) => cell.replace(STRUCK, '$1');

// Both ledger files, parsed. Whether numbered entries are bullets is decided once for the two of them, so an
// old bullet with no number is still an entry in a file the numbered bullets have all left.
function readLedgers(dir, prefix) {
  const texts = [ACTIVE, SETTLED].map((f) => (fs.existsSync(path.join(dir, f)) ? read(path.join(dir, f)) : null));
  const bullets = texts.some((text) => text !== null && hasNumberedBullets(text, prefix));
  return texts.map((text) => (text === null ? null : parseLedger(text, prefix, { bullets })));
}

export function loadRepo(dir) {
  const at = (f) => path.join(dir, f);
  if (!fs.existsSync(at(INDEX))) throw new LedgerError(`${INDEX} not found; run init first`);
  if (!fs.existsSync(at(ACTIVE))) throw new LedgerError(`${ACTIVE} not found`);
  const ix = parseIndex(read(at(INDEX)));
  const [active, settled] = readLedgers(dir, ix.settings.prefix);
  const where = new Map();
  for (const [file, ledger] of [[ACTIVE, active], [SETTLED, settled]]) {
    for (const s of ledger ? ledger.segs : []) {
      if (s.id === null) continue;
      if (!where.has(s.id)) where.set(s.id, []);
      where.get(s.id).push({ file, seg: s });
    }
  }
  return { ix, active, settled, where, activeBytes: fs.statSync(at(ACTIVE)).size };
}

export function check(dir) {
  const { ix, where, activeBytes } = loadRepo(dir);
  const problems = [];
  const notices = [];
  const rowIds = new Set();
  for (const [id, places] of where) {
    if (places.length > 1) problems.push(`${id}: ${places.length} entries (${places.map((p) => p.file).join(', ')})`);
  }
  for (const r of ix.rows) {
    if (rowIds.has(r.id)) problems.push(`${r.id}: more than one row`);
    rowIds.add(r.id);
    if (!STATUSES.includes(r.status)) problems.push(`${r.id}: unknown status "${r.status}"`);
    if (r.pr !== 'none' && !/^PR \d+$/.test(r.pr)) problems.push(`${r.id}: pr must be "PR n" or "none", found "${r.pr}"`);
    const places = where.get(r.id) || [];
    if (r.status === 'reserved') {
      if (places.length) problems.push(`${r.id}: the row is reserved but its entry is written; fill the row`);
      else notices.push(`${r.id}: reserved`);
      continue;
    }
    if (r.status === 'unclassified') notices.push(`${r.id}: unclassified`);
    if (!places.length) problems.push(`${r.id}: a row with no entry`);
    else if (places.length === 1 && places[0].file !== r.file) problems.push(`${r.id}: the row says ${r.file}, the entry is in ${places[0].file}`);
  }
  for (const r of ix.rows) {
    if (r.status === 'superseded' && !rowIds.has(r['superseded-by'])) {
      problems.push(`${r.id}: superseded-by must name a ruling in the index, found "${r['superseded-by']}"`);
    }
  }
  for (const id of where.keys()) if (!rowIds.has(id)) problems.push(`${id}: an entry with no row`);
  for (const o of ix.open) if (!rowIds.has(unstruck(o.ruling))) problems.push(`open item "${o.item}": no ruling ${unstruck(o.ruling)} in the index`);
  const threshold = Number(ix.settings['threshold-bytes']);
  notices.push(`${ACTIVE}: ${activeBytes} bytes, threshold ${threshold}${activeBytes > threshold ? ': over, run move' : ''}`);
  notices.push(`open items: ${ix.open.filter((o) => !isClosed(o)).length}`);
  return { problems, notices };
}

export function list(dir) {
  const { ix, where } = loadRepo(dir);
  const status = new Map(ix.rows.map((r) => [r.id, r.status]));
  const out = [];
  for (const [id, places] of where) {
    for (const p of places) out.push({ id, bytes: p.seg.text.length, file: p.file, status: status.get(id) || '-' });
  }
  return out;
}

// ==== T3: init

export const HEADER_NOTE = [
  'Before writing a ruling, run `node ~/.claude/scripts/ledger.mjs next` and',
  "use the number it prints. Fill that ruling's row in `LEDGER_INDEX.md`",
  '(status, round, pr) in the commit that adds the entry.',
];

const INDEX_INTRO = [
  '# Ledger index', '',
  'Status and open items for the rulings in `LEDGER.md` and',
  '`LEDGER_SETTLED.md`. Rows are edited by hand and by `ledger.mjs`; run',
  '`node ~/.claude/scripts/ledger.mjs check` after a hand edit. An open item',
  'is closed by striking its item cell (`~~item~~`), or every cell of its row.', '',
  'Statuses: `reserved`, a number `next` took whose entry is not written yet;',
  '`standing`, a rule that keeps applying (a ruling that also steers a round',
  'is `standing`); `round`, a choice that steers work not yet merged;',
  '`settled`, its work has merged or a spec now holds it; `superseded`, a',
  'later ruling replaces it, named in `superseded-by`; `unclassified`, written',
  'by `init`. Read each `unclassified` entry and give its row one of the',
  'others by hand. Only `settled` and `superseded` rows move.', '', '',
];

// A title is at most 80 bytes. The cut never falls inside a UTF-8 character: it backs up while the first
// byte it would drop is a continuation byte (0x80 to 0xBF), three times at most, since a character has no
// more of them. So a title in a file that is not UTF-8 loses three bytes at worst, not all of them.
function cut(s, max) {
  let n = max;
  while (n > max - 3 && (s.charCodeAt(n) & 0xc0) === 0x80) n--;
  return s.slice(0, n);
}

function titleOf(first, id) {
  if (!/^(- \*\*|## )/.test(first)) return '';
  let t = first.replace(/^(- \*\*|## )/, '');
  if (!id.startsWith('`')) t = t.slice(id.length);
  t = t.replace(/\*\*.*$/, '').replace(/\d{4}-\d{2}-\d{2}/, '').replace(/[()]/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/^[ \t:.]+|[ \t:.]+$/g, '');
  return trimEnd(cut(t, 80));
}

// A git command that fails is a refusal (exit 2) that carries git's own words, not a crash.
function git(dir, ...args) {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new LedgerError(`git ${args[0]} failed: ${trim(String(e.stderr || e.message))}`);
  }
}

// Outside a git repository init refuses: the note it writes sends every session to next, which needs one.
export function init(dir, prefix, prRepo = 'none') {
  const at = (f) => path.join(dir, f);
  if (!/^[A-Z]+$/.test(prefix || '')) throw new LedgerError('init: give the ruling prefix in capitals, for example: init R');
  if (fs.existsSync(at(INDEX))) throw new LedgerError(`init: ${INDEX} exists`);
  if (fs.existsSync(at(SETTLED))) throw new LedgerError(`init: ${SETTLED} exists; this ledger was split by hand and its index is written by hand`);
  if (!fs.existsSync(at(ACTIVE))) throw new LedgerError(`init: ${ACTIVE} not found`);
  git(dir, 'rev-parse', '--git-dir');
  const ledger = parseLedger(read(at(ACTIVE)), prefix);
  const rows = [];
  let sectionDate = '';
  for (const s of ledger.segs) {
    const first = s.text.split(/\r?\n/, 1)[0];
    const date = (first.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    if (s.id === null) { if (date) sectionDate = date; continue; }
    rows.push({ id: s.id, date: date || sectionDate, status: 'unclassified', round: '', pr: 'none', 'superseded-by': '', file: ACTIVE, title: titleOf(first, s.id) });
  }
  const eol = ledger.eol;
  const note = HEADER_NOTE.join(eol);
  const head = ledger.segs.length && ledger.segs[0].id === null ? ledger.segs[0] : null;
  if (head) head.text = trimEnd(head.text) + eol + eol + note + eol + eol;
  else ledger.segs.unshift({ id: null, text: note + eol + eol });
  const ix = { eol, intro: INDEX_INTRO.join(eol), settings: { prefix, 'pr-repo': prRepo, 'threshold-bytes': String(DEFAULT_THRESHOLD) }, rows, open: [] };
  write(at(INDEX), formatIndex(ix));
  write(at(ACTIVE), formatLedger(ledger));
  return rows.length;
}

// ==== T4: next

function today() {
  if (process.env.LEDGER_TODAY) return process.env.LEDGER_TODAY;
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function requireCleanIndex(dir, command) {
  if (trim(git(dir, 'status', '--porcelain', '--', INDEX)) !== '') {
    throw new LedgerError(`${command}: ${INDEX} has uncommitted changes; commit them first`);
  }
}

// Write the index and commit it alone; each message is a paragraph of the commit message, the first its
// subject. If the commit fails the file goes back to what it was, so the next command does not find a
// half-made change.
function commitIndex(dir, ix, ...message) {
  const file = path.join(dir, INDEX);
  const before = read(file);
  write(file, formatIndex(ix));
  try {
    git(dir, 'commit', '-q', '--only', ...message.flatMap((p) => ['-m', p]), '--', INDEX);
  } catch (e) {
    write(file, before);
    throw e;
  }
}

// Run fn while holding the lock that the sessions of one checkout share: a directory under the git directory.
// Two worktrees do not share it; check catches their duplicate number once they merge. Making a directory
// that another process is removing can fail with EPERM on Windows, so that code means "held" too; when it
// lasts to the deadline with no lock there, the lock cannot be made and the command refuses.
function withLock(dir, command, waitMs, fn) {
  const lock = path.join(path.resolve(dir, trim(git(dir, 'rev-parse', '--git-dir'))), 'ledger-next.lock');
  const deadline = Date.now() + waitMs;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST' && e.code !== 'EPERM') throw e;
      if (Date.now() >= deadline) {
        let age = 0;
        try { age = Math.round((Date.now() - fs.statSync(lock).mtimeMs) / 1000); } catch {
          if (e.code === 'EPERM') throw new LedgerError(`${command}: the lock ${lock} cannot be made (${e.code})`);
          continue;
        }
        throw new LedgerError(`${command}: the lock ${lock} is ${age} s old; remove it by hand if no session is running next or merged`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmdirSync(lock);
  }
}

// Reserve the next ruling number: a `reserved` row, committed alone, under the lock.
export function next(dir, { waitMs = 10000 } = {}) {
  return withLock(dir, 'next', waitMs, () => {
    requireCleanIndex(dir, 'next');
    const { ix } = loadRepo(dir);
    const prefix = ix.settings.prefix;
    // Every line of either file that begins like a numbered entry counts, whatever stands above it, and so does
    // every row. A paragraph entry written with no blank line above it is not found as an entry, and its number
    // is taken all the same.
    const headingLine = new RegExp(`^(?:- \\*\\*|## )${prefix}(\\d+)[ .(:]|^${prefix}(\\d+)\\. `, 'gm');
    const rowId = new RegExp(`^${prefix}(\\d+)$`);
    let max = 0;
    for (const f of [ACTIVE, SETTLED]) {
      if (!fs.existsSync(path.join(dir, f))) continue;
      for (const m of read(path.join(dir, f)).matchAll(headingLine)) max = Math.max(max, Number(m[1] || m[2]));
    }
    for (const r of ix.rows) {
      const m = r.id.match(rowId);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const id = prefix + (max + 1);
    ix.rows.push({ id, date: today(), status: 'reserved', round: '', pr: 'none', 'superseded-by': '', file: ACTIVE, title: '' });
    commitIndex(dir, ix, `Ledger: reserve ${id}`);
    return id;
  });
}

// ==== CLI

function main(argv) {
  const [command, ...args] = argv;
  const dir = process.cwd();
  switch (command) {
    case 'list':
      for (const e of list(dir)) console.log([e.id, e.bytes, e.file, e.status].join('\t'));
      return 0;
    case 'check': {
      const { problems, notices } = check(dir);
      for (const p of problems) console.log(`FAIL  ${p}`);
      for (const n of notices) console.log(`note  ${n}`);
      return problems.length ? 1 : 0;
    }
    case 'init':
      console.log(`${INDEX} written: ${init(dir, args[0], args[1])} rulings, all unclassified`);
      return 0;
    case 'next':
      console.log(next(dir));
      return 0;
    default:
      throw new LedgerError('usage: ledger.mjs <list|check|next|merged|move|init> [args]');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof LedgerError)) throw e;
    console.error(e.message);
    process.exitCode = 2;
  }
}
