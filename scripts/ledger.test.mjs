// ledger.test.mjs: prove ledger.mjs can fail. Every ledger here is written for the test; none is a real one.
// Usage: node --test scripts/ledger.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from './ledger.mjs';

const SCRIPT = fileURLToPath(new URL('./ledger.mjs', import.meta.url));
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test',
  LEDGER_TODAY: '2030-01-02',
});

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
const at = (dir, f) => path.join(dir, f);
const get = (dir, f) => fs.readFileSync(at(dir, f), 'latin1');
const put = (dir, f, text) => fs.writeFileSync(at(dir, f), text, 'latin1');

// A throwaway git repository holding the given files, committed.
function repo(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'core.autocrlf', 'false');
  for (const [f, text] of Object.entries(files)) put(dir, f, text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}
const cli = (dir, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
const refuses = (fn, pattern) => assert.throws(fn, (e) => e instanceof L.LedgerError && pattern.test(e.message));

// rows: [id, status, file?, pr?, supersededBy?]; open: [item, ruling, opened?]
function index(prefix, rows, { open = [], repo: prRepo = 'none', threshold = 131072 } = {}) {
  return [
    '# Ledger index', '', 'Fixture.', '',
    '## Settings', '', `- prefix: ${prefix}`, `- pr-repo: ${prRepo}`, `- threshold-bytes: ${threshold}`, '',
    '## Rulings', '',
    '| id | date | status | round | pr | superseded-by | file | title |', '|---|---|---|---|---|---|---|---|',
    ...rows.map(([id, status, file = 'LEDGER.md', pr = 'none', by = '']) => `| ${id} | 2030-01-01 | ${status} | | ${pr} |${by ? ` ${by} ` : ' '}| ${file} | t |`),
    '', '## Open items', '', '| item | ruling | opened |', '|---|---|---|',
    ...open.map(([item, ruling, opened = '2030-01-01']) => `| ${item} | ${ruling} | ${opened} |`), '',
  ].join('\n');
}
const entry = (id, words = 'words') => `## ${id} (2030-01-01): title of ${id}\n\n"${words} of ${id}"\n\n`;
// A file ends with one line end, so its last entry has no blank line after it.
const file = (head, ...ids) => head + ids.map((id) => entry(id)).join('').replace(/\n\n$/, '\n');
const ledger = (...ids) => file('# Ledger\n\nHeader text.\n\n', ...ids);
const ids = (text, prefix) => L.parseLedger(text, prefix).segs.map((s) => s.id);
const setStatus = (dir, id, from, to) => {
  put(dir, 'LEDGER_INDEX.md', get(dir, 'LEDGER_INDEX.md').replace(`| ${id} | 2030-01-01 | ${from} |`, `| ${id} | 2030-01-01 | ${to} |`));
  git(dir, 'commit', '-qam', 'status');
};
// Files are handled as latin1, one character per byte, so a non-ASCII character is written here as its UTF-8
// bytes: \xc3\xa0 and \xc3\xa9 are two-byte characters, \xe2\x86\x92 a three-byte one, \xc2\xa0 a no-break space.
const validUtf8 = (latin1) => {
  try { new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(latin1, 'latin1')); return true; } catch { return false; }
};
const LOCK = '.git/ledger-next.lock';

// ==== T1: entries

test('each of the four heading forms parses to the same entry list', () => {
  for (const p of ['R', 'L']) {
    const forms = {
      bullet: `# T\n\n- **${p}1 (2030-01-01: a).** "x"\n  more\n- **${p}2 (b).** "y"\n\n- **${p}3 (c).** "z"\n`,
      paragraph: `# T\n\n${p}1. "x"\nmore\n\n${p}2. "y"\n\n${p}3. "z"\n`,
      heading: `# T\n\n## ${p}1 (2030-01-01): a\n\n"x"\n\n## ${p}2 (2030-01-02): b\n"y"\n\n## ${p}3 (2030-01-03): c\n"z"\n`,
      mixed: `# T\n\n- **${p}1 (a).** "x"\n- **${p}2 (b).** "y"\n\n## ${p}3 (2030-01-03): c\n\n"z"\n`,
    };
    for (const [form, text] of Object.entries(forms)) assert.deepEqual(ids(text, p), [null, `${p}1`, `${p}2`, `${p}3`], `${form} ${p}`);
  }
});

test('joining the segments gives the file back, byte for byte', () => {
  const texts = [
    '# T\r\n\r\n- **R1 (a).** "x"\r\n- **R2 (b).** "y"\r\n\r\n\r\n- **R3 (c).** "z"',
    'L1. "x"\n\n\n## 2030-01-01: a session\n\nL2. "y" caf\xe9 \xff\n',
    '',
  ];
  for (const text of texts) assert.equal(L.formatLedger(L.parseLedger(text, text.startsWith('L') ? 'L' : 'R')), text);
  assert.equal(L.parseLedger(texts[0], 'R').eol, '\r\n');
  assert.equal(L.parseLedger(texts[1], 'L').eol, '\n');
});

test('a wrapped line that begins like a paragraph entry is not an entry', () => {
  assert.deepEqual(ids('L1. "x" as ruled in\nL7. and more\n\nL2. "y"\n', 'L'), ['L1', 'L2']);
  assert.deepEqual(ids('## 2030-01-01: session\nL1. "x"\n', 'L'), [null, 'L1']);
  assert.deepEqual(ids('# T\nL1. "x"\n', 'L'), [null, 'L1']);
});

test('a ## line that is not an entry is a segment of its own', () => {
  const led = L.parseLedger('# T\n\nL1. "x"\n\n## 2030-01-02: next session\n\nIntro.\n\nL2. "y"\n', 'L');
  assert.deepEqual(led.segs.map((s) => s.id), [null, 'L1', null, 'L2']);
  assert.equal(led.segs[2].text, '## 2030-01-02: next session\n\nIntro.\n\n');
  assert.equal(led.segs[1].text, 'L1. "x"\n\n');
  // A ### heading is part of its entry.
  assert.deepEqual(ids('# T\n\n## L1 (2030-01-01): a\n\n### Part one\n\ntext\n\n### Part two\n\n## L2 (2030-01-02): b\n', 'L'), [null, 'L1', 'L2']);
});

test('a # line, and a ## line inside a fenced block, do not end an entry', () => {
  const after = '## R2 (2030-01-02): b\n\n"y"\n';
  const inside = ['# a comment', '## Not a heading', '## R9 (2030-01-01): an example', '- **R8 (b).** an example', '', 'R7. an example'];
  // [the line that opens the block, a line inside it that does not close it, the line that closes it]
  const fences = [
    ['```', '~~~', '```'], ['~~~', '```', '~~~'], ['```sh', '```sh', '```'], ['~~~ sh', '~~~ sh', '~~~'],
    ['````', '```', '````'], ['  ```', '``', '  `````  '], ['   ~~~~', '~~~', '   ~~~~~'], ['~~~ a`b', '~~~ c', '~~~'],
  ];
  for (const [open, within, close] of fences) {
    const one = ['## R1 (2030-01-01): a', '', '# a line of one hash', '', open, ...inside, within, ...inside, close, 'the tail of R1', '', ''].join('\n');
    const led = L.parseLedger(`# T\n\n${one}${after}`, 'R');
    assert.deepEqual(led.segs.map((s) => s.id), [null, 'R1', 'R2'], open);
    assert.equal(led.segs[1].text, one, open);
  }
  // Backticks in the middle of a line open nothing, and neither does a line that goes on after its closing run.
  for (const line of ['see ``` in the text', '```x``` is code in a line', '``']) {
    assert.deepEqual(ids(`# T\n\n## R1 (2030-01-01): a\n\n${line}\n\n${after}`, 'R'), [null, 'R1', 'R2'], line);
  }
  // A run indented four spaces or more, or by a tab, is text and opens nothing.
  for (const line of ['    ```', '     ~~~~', '\t~~~']) {
    assert.deepEqual(ids(`# T\n\n## R1 (2030-01-01): a\n\n${line}\n\n${after}`, 'R'), [null, 'R1', 'R2'], JSON.stringify(line));
  }
  // A run indented as far closes nothing either: the block runs on, and the entry below it is not found.
  for (const close of ['    ```', '\t```']) {
    assert.deepEqual(ids(['# T', '', '## R1 (2030-01-01): a', '', '```', 'code', close, '', after].join('\n'), 'R'), [null, 'R1'], JSON.stringify(close));
  }
  // A paragraph entry and a session heading inside a fenced block are text too.
  assert.deepEqual(ids('L1. "x"\n\n~~~\n## 2030-01-05: a session\n\nL2. "y"\n~~~\n\nL3. "z"\n', 'L'), ['L1', 'L3']);
  // The line that closes a block is not a blank line: a wrapped line under it is no paragraph entry.
  assert.deepEqual(ids('L1. "x"\n\n~~~\ncode\n~~~\nL7. wrapped\n\nL2. "y"\n', 'L'), ['L1', 'L2']);
});

test('an old bullet with no number is keyed by its text, only among bullet entries', () => {
  const text = '# T\n\n- **R1 (a).** "x"\n- **Design note.** "y"\n- **Side notes, a | b (2030-01-01).** z\n\n## R2 (2030-01-01): b\n\n- **Not an entry.** inside R2\n';
  assert.deepEqual(ids(text, 'R'), [null, 'R1', '`Design note`', '`Side notes, a _ b (2030-01-01)`', 'R2']);
  assert.deepEqual(ids('# T\n\n## L1 (2030-01-01): a\n\n- **Bold point.** inside L1\n', 'L'), [null, 'L1']);
  // The caller says so when the numbered bullets of this ledger are all in its other file.
  const alone = '# T\n\n- **Design note.** "y"\n\n## R2 (2030-01-01): b\n\n- **Not an entry.** inside R2\n';
  assert.deepEqual(ids(alone, 'R'), [null, 'R2']);
  assert.deepEqual(L.parseLedger(alone, 'R', { bullets: true }).segs.map((s) => s.id), [null, '`Design note`', 'R2']);
});

test('the byte 0xA0 is text, never white space', () => {
  assert.deepEqual(ids('# T\n\n- **R1 (a).** "x"\n- **A not\xc3\xa0.** "y"\n- **\xa0B\xa0.** "z"\n', 'R'), [null, 'R1', '`A not\xc3\xa0`', '`\xa0B\xa0`']);
  assert.deepEqual(ids('L1. "x"\n\xa0\nL7. wrapped\n\nL2. "y"\n', 'L'), ['L1', 'L2']);
});

test("another ledger's prefix is not an entry here", () => {
  assert.deepEqual(ids('# T\n\n## L1 (2030-01-01): a\n\nR1. "x"\n\n- **K2 (b).** "y"\n', 'R'), [null, null, 'R1']);
  assert.deepEqual(ids('# T\n\n## L1 (2030-01-01): a\n\nR1. "x"\n', 'L'), [null, 'L1']);
  assert.deepEqual(ids('# T\n\nR12. "x"\n\nR1. "y"\n', 'R'), [null, 'R12', 'R1']);
});

// ==== T2: index and check

test('the index parses and formats back to the same text', () => {
  const text = index('R', [['R1', 'standing'], ['`Design note`', 'settled', 'LEDGER_SETTLED.md', 'PR 4']], { open: [['~~done~~', 'R1'], ['a \\| b', 'R1'], ['~~half~~ done', 'R1']] });
  const ix = L.parseIndex(text);
  assert.equal(L.formatIndex(ix), text);
  assert.deepEqual(ix.rows[1], { id: '`Design note`', date: '2030-01-01', status: 'settled', round: '', pr: 'PR 4', 'superseded-by': '', file: 'LEDGER_SETTLED.md', title: 't' });
  assert.equal(ix.open[1].item, 'a | b');
  assert.deepEqual(ix.open.map(L.isClosed), [true, false, false]);
  assert.deepEqual(ix.settings, { 'pr-repo': 'none', 'threshold-bytes': '131072', prefix: 'R' });
  assert.equal(L.parseIndex(text.replace(/\n/g, '\r\n')).rows.length, 2);
  assert.equal(L.formatIndex(L.parseIndex(text.replace(/\n/g, '\r\n'))), text.replace(/\n/g, '\r\n'));
  // A separator row may carry colons and spaces; it is written back plain.
  const aligned = text.replace('|---|---|---|---|---|---|---|---|', '| :--- | :---: | ---: | - | --- | --- | --- | --- |').replace('\n|---|---|---|\n', '\n| :-- | --: | - |\n');
  assert.equal(L.formatIndex(L.parseIndex(aligned)), text);
  // A tab beside a cell is white space, at either end.
  assert.equal(L.formatIndex(L.parseIndex(text.replace('| R1 | 2030-01-01 |', '|\tR1 | 2030-01-01\t|'))), text);
});

test('an index cell keeps the byte 0xA0 at either end', () => {
  const text = index('R', [['R1', 'standing']], { open: [['voil\xc3\xa0', 'R1'], ['\xa0x\xa0', 'R1']] }).replace('| t |', '| d\xc3\xa9j\xc3\xa0 |');
  const ix = L.parseIndex(text);
  assert.equal(ix.rows[0].title, 'd\xc3\xa9j\xc3\xa0');
  assert.deepEqual(ix.open.map((o) => o.item), ['voil\xc3\xa0', '\xa0x\xa0']);
  assert.equal(L.formatIndex(ix), text);
});

test('an index that cannot be parsed is refused', () => {
  const good = index('R', [['R1', 'standing']]);
  refuses(() => L.parseIndex(good.replace('## Open items', '## Open')), /needs the sections Settings, Rulings and Open items/);
  refuses(() => L.parseIndex(good + '\n## Rulings\n'), /needs the sections/);
  refuses(() => L.parseIndex(good.replace('| LEDGER.md | t |', '| LEDGER.md |')), /8 cells expected, 7 found/);
  refuses(() => L.parseIndex(good.replace('| id | date |', '| id | day |')), /the Rulings table must start with the row \| id \| date \|/);
  refuses(() => L.parseIndex(good.replace('- prefix: R', '- prefix: r1')), /prefix setting must be capital letters/);
  refuses(() => L.parseIndex(good.replace('- prefix: R', 'prefix = R')), /not a setting: prefix = R/);
  refuses(() => L.parseIndex(good.replace('131072', 'big')), /threshold-bytes must be a whole number/);
  refuses(() => L.parseIndex(good.replace('| R1 |', 'R1 |')), /not a table row/);
  // A table needs its separator row: without one the first data row would be taken for it and dropped.
  const items = index('R', [['R1', 'standing']], { open: [['one', 'R1'], ['two', 'R1']] });
  const noRule = [
    [good.replace('|---|---|---|---|---|---|---|---|\n', ''), 'Rulings'],
    [good.replace('|---|---|---|---|---|---|---|---|', '|---|---|---|---|---|---|---|'), 'Rulings'],
    [good.replace('|---|---|---|---|---|---|---|---|', '|---|---|---|---|---|---|---|-x-|'), 'Rulings'],
    [items.replace('\n|---|---|---|\n', '\n'), 'Open items'],
    [good.replace('\n|---|---|---|\n', '\n'), 'Open items'],
    [items.replace('\n|---|---|---|\n', '\n|---|---|---|---|\n'), 'Open items'],
    [items.replace('\n|---|---|---|\n', '\n|:|---|---|\n'), 'Open items'],
    [items.replace('\n|---|---|---|\n', '\n|::-|---|---|\n'), 'Open items'],
  ];
  for (const [text, name] of noRule) {
    refuses(() => L.parseIndex(text), new RegExp(`^LEDGER_INDEX\\.md: the ${name} table needs a separator row \\(\\| --- \\| --- \\|\\) as its second line$`));
  }
});

test('check passes a ledger whose every entry has one row', (t) => {
  const dir = repo(t, {
    'LEDGER.md': ledger('R1', 'R3'), 'LEDGER_SETTLED.md': ledger('R2'),
    'LEDGER_INDEX.md': index('R', [['R1', 'standing'], ['R2', 'superseded', 'LEDGER_SETTLED.md', 'none', 'R3'], ['R3', 'round', 'LEDGER.md', 'PR 12'], ['R4', 'reserved']], { open: [['an item', 'R3']] }),
  });
  assert.deepEqual(L.check(dir).problems, []);
  const run = cli(dir, 'check');
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^note  R4: reserved$/m);
});

test('check names each kind of break', (t) => {
  const base = { 'LEDGER.md': ledger('R1', 'R3'), 'LEDGER_SETTLED.md': ledger('R2') };
  const rows = [['R1', 'standing'], ['R2', 'settled', 'LEDGER_SETTLED.md'], ['R3', 'round']];
  const cases = [
    [{ 'LEDGER.md': ledger('R1', 'R3', 'R5') }, rows, {}, 'R5: an entry with no row'],
    [{}, [...rows, ['R6', 'standing']], {}, 'R6: a row with no entry'],
    [{ 'LEDGER.md': ledger('R1', 'R3', 'R2') }, rows, {}, 'R2: 2 entries (LEDGER.md, LEDGER_SETTLED.md)'],
    [{ 'LEDGER.md': ledger('R1', 'R3', 'R3') }, rows, {}, 'R3: 2 entries (LEDGER.md, LEDGER.md)'],
    [{}, [...rows, ['R3', 'round']], {}, 'R3: more than one row'],
    [{}, [rows[0], ['R2', 'settled', 'LEDGER.md'], rows[2]], {}, 'R2: the row says LEDGER.md, the entry is in LEDGER_SETTLED.md'],
    [{}, [['R1', 'standing', 'LEDGER_SETTLED.md'], rows[1], rows[2]], {}, 'R1: the row says LEDGER_SETTLED.md, the entry is in LEDGER.md'],
    [{}, [['R1', 'archived'], rows[1], rows[2]], {}, 'R1: unknown status "archived"'],
    [{}, [['R1', 'superseded'], rows[1], rows[2]], {}, 'R1: superseded-by must name a ruling in the index, found ""'],
    [{}, [['R1', 'superseded', 'LEDGER.md', 'none', 'R9'], rows[1], rows[2]], {}, 'R1: superseded-by must name a ruling in the index, found "R9"'],
    [{}, rows, { open: [['an item', 'R9']] }, 'open item "an item": no ruling R9 in the index'],
    [{}, rows, { open: [['~~an item~~', '~~R8~~', '~~2030-01-01~~']] }, 'open item "~~an item~~": no ruling R8 in the index'],
    [{}, [['R1', 'standing', 'LEDGER.md', '12'], rows[1], rows[2]], {}, 'R1: pr must be "PR n" or "none", found "12"'],
    [{}, [['R1', 'reserved'], rows[1], rows[2]], {}, 'R1: the row is reserved but its entry is written; fill the row'],
  ];
  for (const [files, caseRows, options, problem] of cases) {
    const dir = repo(t, { ...base, ...files, 'LEDGER_INDEX.md': index('R', caseRows, options) });
    assert.deepEqual(L.check(dir).problems, [problem]);
    const run = cli(dir, 'check');
    assert.equal(run.status, 1, problem);
    assert.ok(run.stdout.includes(`FAIL  ${problem}\n`), problem);
  }
});

test('check counts a struck open item as closed and reports the size against the threshold', (t) => {
  const files = { 'LEDGER.md': ledger('R1') };
  const size = files['LEDGER.md'].length;
  const one = repo(t, { ...files, 'LEDGER_INDEX.md': index('R', [['R1', 'unclassified']], { open: [['~~closed~~', 'R1'], ['still open', 'R1']], threshold: size }) });
  assert.deepEqual(L.check(one).notices, ['R1: unclassified', `LEDGER.md: ${size} bytes, threshold ${size}`, 'open items: 1']);
  const two = repo(t, { ...files, 'LEDGER_INDEX.md': index('R', [['R1', 'standing']], { open: [['a', 'R1'], ['b', 'R1']], threshold: size - 1 }) });
  assert.deepEqual(L.check(two).notices, [`LEDGER.md: ${size} bytes, threshold ${size - 1}: over, run move`, 'open items: 2']);
});

test('a struck open-item row is read as closed, whether its item cell or every cell is struck', (t) => {
  const open = [
    ['~~item cell struck~~', 'R1'], ['~~every cell struck~~', '~~R2~~', '~~2030-01-01~~'], ['~~struck~~ in part', 'R1'], ['open', '~~R2~~'],
    // Two strikes with open words between them are a cell struck in part; one tilde inside a strike is text.
    ['~~done~~ closed by ~~R2~~', 'R1'], ['~~about ~5 of them~~', 'R1'],
    // A strike with nothing in it strikes nothing.
    ['~~~~', 'R1'],
  ];
  const dir = repo(t, { 'LEDGER.md': ledger('R1', 'R2'), 'LEDGER_INDEX.md': index('R', [['R1', 'standing'], ['R2', 'standing']], { open }) });
  const found = L.check(dir);
  assert.deepEqual(found.problems, []);
  assert.deepEqual(L.parseIndex(get(dir, 'LEDGER_INDEX.md')).open.map(L.isClosed), [true, true, false, false, false, true, false]);
  assert.equal(found.notices.at(-1), 'open items: 4');
  assert.equal(L.formatIndex(L.parseIndex(get(dir, 'LEDGER_INDEX.md'))), get(dir, 'LEDGER_INDEX.md'));
});

test('list prints every entry with its size, file and status', (t) => {
  const dir = repo(t, {
    'LEDGER.md': ledger('K1', 'K3'), 'LEDGER_SETTLED.md': ledger('K2'),
    'LEDGER_INDEX.md': index('K', [['K1', 'standing'], ['K2', 'settled', 'LEDGER_SETTLED.md']]),
  });
  const run = cli(dir, 'list');
  assert.equal(run.status, 0);
  assert.equal(run.stdout, `K1\t${entry('K1').length}\tLEDGER.md\tstanding\nK3\t${entry('K3').length - 1}\tLEDGER.md\t-\nK2\t${entry('K2').length - 1}\tLEDGER_SETTLED.md\tsettled\n`);
});

test('a command refuses with exit 2 when the index is missing or broken, or the command is unknown', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1') });
  let run = cli(dir, 'check');
  assert.equal(run.status, 2);
  assert.equal(run.stderr, 'LEDGER_INDEX.md not found; run init first\n');
  put(dir, 'LEDGER_INDEX.md', 'not an index\n');
  run = cli(dir, 'list');
  assert.equal(run.status, 2);
  assert.match(run.stderr, /needs the sections/);
  run = cli(dir, 'archive');
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^usage: ledger\.mjs <list\|check\|next\|merged\|move\|init> \[args\]\n$/);
});

// ==== T3: init

test('init writes an unclassified row for every entry and a note in the header', (t) => {
  const bullets = '# T\n\nIntro.\n\n## 2. Entries\n\n- **R1 (first).** "x"\n- **R2 (2030-01-05: a first topic; then a second).** "y"\n- **Design note.** "z"\n';
  const dir = repo(t, { 'LEDGER.md': bullets });
  const run = cli(dir, 'init', 'R', 'owner/code');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'LEDGER_INDEX.md written: 3 rulings, all unclassified\n');
  const ix = L.parseIndex(get(dir, 'LEDGER_INDEX.md'));
  assert.deepEqual(ix.settings, { 'pr-repo': 'owner/code', 'threshold-bytes': '131072', prefix: 'R' });
  assert.deepEqual(ix.rows.map((r) => [r.id, r.date, r.status, r.pr, r.file, r.title]), [
    ['R1', '', 'unclassified', 'none', 'LEDGER.md', 'first'],
    ['R2', '2030-01-05', 'unclassified', 'none', 'LEDGER.md', 'a first topic; then a second'],
    ['`Design note`', '', 'unclassified', 'none', 'LEDGER.md', 'Design note'],
  ]);
  assert.equal(get(dir, 'LEDGER.md'), bullets.replace('Intro.\n\n', `Intro.\n\n${L.HEADER_NOTE.join('\n')}\n\n`));
  // The note is the three lines the spec gives (section 7), typed out here and not read from the script.
  assert.deepEqual(L.HEADER_NOTE, [
    'Before writing a ruling, run `node ~/.claude/scripts/ledger.mjs next` and',
    "use the number it prints. Fill that ruling's row in `LEDGER_INDEX.md`",
    '(status, round, pr) in the commit that adds the entry.',
  ]);
  // The index's intro says what each status means, and that only settled and superseded rows move.
  const intro = ix.intro.replace(/\n/g, ' ');
  for (const s of L.STATUSES) assert.match(intro, new RegExp(`\`${s}\`, `));
  assert.match(intro, /Only `settled` and `superseded` rows move\./);
  assert.deepEqual(L.check(dir).problems, []);
});

test('init dates a paragraph entry from the session heading above it and leaves its title empty', (t) => {
  // The tabs in the last heading: white space inside a title becomes one space.
  const text = 'L1. "x"\n\n## 2030-02-03: a session\n\nL2. "y"\n\nL3. 2030-02-09, later: "z"\n\n## L4 (2030-03-01): a\tnew \t one\n\n"w"\n';
  const dir = repo(t, { 'LEDGER.md': text });
  assert.equal(L.init(dir, 'L'), 4);
  const ix = L.parseIndex(get(dir, 'LEDGER_INDEX.md'));
  assert.deepEqual(ix.rows.map((r) => [r.id, r.date, r.title]), [['L1', '', ''], ['L2', '2030-02-03', ''], ['L3', '2030-02-09', ''], ['L4', '2030-03-01', 'a new one']]);
  assert.equal(ix.settings['pr-repo'], 'none');
  assert.equal(get(dir, 'LEDGER.md'), `${L.HEADER_NOTE.join('\n')}\n\n${text}`);
});

test('init keeps a non-ASCII character whole, in a title and at the end of the header', (t) => {
  const arrow = '\xe2\x86\x92';
  const titles = [
    ['d\xc3\xa9j\xc3\xa0', 'd\xc3\xa9j\xc3\xa0'],
    ['a\xc2\xa0b  c', 'a\xc2\xa0b c'],
    [`${'a'.repeat(78)}${arrow} tail`, 'a'.repeat(78)],
    [`${'a'.repeat(79)}\xc3\xa9 tail`, 'a'.repeat(79)],
    [`${'a'.repeat(77)}${arrow}x`, `${'a'.repeat(77)}${arrow}`],
    // A four-byte character that begins at byte 77: the cut backs up three bytes, the most there can be.
    [`${'a'.repeat(77)}\xf0\x9f\x98\x80 tail`, 'a'.repeat(77)],
    [`${'a'.repeat(79)} b`, 'a'.repeat(79)],
    ['b'.repeat(80), 'b'.repeat(80)],
  ];
  const text = '# T\n\nIntro, voil\xc3\xa0\n\n' + titles.map(([title], i) => `## R${i + 1} (2030-01-01): ${title}\n\n"x"\n`).join('\n');
  const dir = repo(t, { 'LEDGER.md': text });
  L.init(dir, 'R');
  assert.deepEqual(L.parseIndex(get(dir, 'LEDGER_INDEX.md')).rows.map((r) => r.title), titles.map((pair) => pair[1]));
  assert.ok(validUtf8(get(dir, 'LEDGER_INDEX.md')));
  assert.equal(L.formatIndex(L.parseIndex(get(dir, 'LEDGER_INDEX.md'))), get(dir, 'LEDGER_INDEX.md'));
  assert.equal(get(dir, 'LEDGER.md'), text.replace('voil\xc3\xa0\n\n', `voil\xc3\xa0\n\n${L.HEADER_NOTE.join('\n')}\n\n`));
});

test('init cuts a title that is not UTF-8 at most three bytes short', (t) => {
  // The bytes 0x93 and 0x94 are quotation marks in one old encoding and continuation bytes in UTF-8.
  const title = '\x93\x94'.repeat(50);
  const dir = repo(t, { 'LEDGER.md': `# T\n\n## R1 (2030-01-01): ${title}\n\n"x"\n` });
  L.init(dir, 'R');
  assert.equal(L.parseIndex(get(dir, 'LEDGER_INDEX.md')).rows[0].title, title.slice(0, 77));
});

test('init keeps CRLF line ends', (t) => {
  const dir = repo(t, { 'LEDGER.md': '# T\r\n\r\n- **K1 (a).** "x"\r\n' });
  L.init(dir, 'K');
  assert.equal(get(dir, 'LEDGER.md'), `# T\r\n\r\n${L.HEADER_NOTE.join('\r\n')}\r\n\r\n- **K1 (a).** "x"\r\n`);
  assert.ok(!/[^\r]\n/.test(get(dir, 'LEDGER_INDEX.md')));
});

test('init refuses without a prefix, over an index, and on a ledger already split', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1') });
  refuses(() => L.init(dir), /give the ruling prefix in capitals/);
  refuses(() => L.init(dir, 'r'), /give the ruling prefix in capitals/);
  put(dir, 'LEDGER_SETTLED.md', ledger('R0'));
  refuses(() => L.init(dir, 'R'), /LEDGER_SETTLED\.md exists/);
  fs.rmSync(at(dir, 'LEDGER_SETTLED.md'));
  L.init(dir, 'R');
  const written = get(dir, 'LEDGER_INDEX.md');
  refuses(() => L.init(dir, 'R'), /init: LEDGER_INDEX\.md exists/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), written);
  assert.equal(cli(dir, 'init', 'R').status, 2);
});

test('init refuses outside a git repository, writing nothing', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  put(dir, 'LEDGER.md', ledger('R1'));
  // The ceiling keeps git from finding a repository above the temp folder.
  const run = spawnSync(process.execPath, [SCRIPT, 'init', 'R'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^git rev-parse failed: fatal: not a git repository/);
  assert.deepEqual(fs.readdirSync(dir), ['LEDGER.md']);
  assert.equal(get(dir, 'LEDGER.md'), ledger('R1'));
});
