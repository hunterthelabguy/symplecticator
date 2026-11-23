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

test('a heading or bullet entry line may have a space, a full stop, a bracket or a colon after its number', () => {
  for (const f of [' ', '.', '(', ':']) {
    assert.equal(L.entryId(`## R5${f}title`, 'R'), 'R5', `heading ${f}`);
    assert.equal(L.entryId(`- **R5${f}title**`, 'R'), 'R5', `bullet ${f}`);
    assert.equal(L.hasNumberedBullets(`# T\n\n- **R5${f}title**\n`, 'R'), true, `bullets ${f}`);
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
  // The note's exact three lines, typed out here and not read from the script, so a change to them fails.
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

// ==== T4: next

test('next reserves the number after the highest in either file or the index, and commits the index alone', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1', 'R2'), 'LEDGER_INDEX.md': index('R', [['R1', 'standing'], ['R2', 'round']]) });
  put(dir, 'notes.txt', 'someone else is working here\n');
  assert.equal(L.next(dir), 'R3');
  assert.deepEqual(L.parseIndex(get(dir, 'LEDGER_INDEX.md')).rows[2], { id: 'R3', date: '2030-01-02', status: 'reserved', round: '', pr: 'none', 'superseded-by': '', file: 'LEDGER.md', title: '' });
  assert.equal(git(dir, 'log', '-1', '--format=%s').trim(), 'Ledger: reserve R3');
  assert.equal(git(dir, 'show', '--name-only', '--format=', 'HEAD').trim(), 'LEDGER_INDEX.md');
  assert.equal(git(dir, 'status', '--porcelain').trim(), '?? notes.txt');
  const run = cli(dir, 'next');
  assert.equal(run.stdout, 'R4\n');

  const settledHigh = repo(t, { 'LEDGER.md': ledger('K1'), 'LEDGER_SETTLED.md': ledger('K9'), 'LEDGER_INDEX.md': index('K', [['K1', 'standing'], ['K9', 'settled', 'LEDGER_SETTLED.md']]) });
  assert.equal(L.next(settledHigh), 'K10');
  const reservedHigh = repo(t, { 'LEDGER.md': ledger('K1'), 'LEDGER_INDEX.md': index('K', [['K1', 'standing'], ['K30', 'reserved']]) });
  assert.equal(L.next(reservedHigh), 'K31');
  const noRowHigh = repo(t, { 'LEDGER.md': ledger('K1', 'K50'), 'LEDGER_INDEX.md': index('K', [['K1', 'standing']]) });
  assert.equal(L.next(noRowHigh), 'K51');
  const noRowBullet = repo(t, { 'LEDGER.md': '# T\n\n- **K1 (a).** "x"\n- **K60 (b).** "y"\n', 'LEDGER_INDEX.md': index('K', [['K1', 'standing']]) });
  assert.equal(L.next(noRowBullet), 'K61');
});

test('next counts every line that begins like an entry, whatever the line above it', (t) => {
  for (const p of ['L', 'K']) {
    // Paragraph entries with no blank line between them: only the first of each file is found as an entry.
    const tight = (a, b) => `# T\n\n## 2030-01-01: a session\n\n${p}${a}. "a"\nNote: one.\n${p}${b}. "b"\nNote: two.\n`;
    assert.deepEqual(ids(tight(1, 2), p), [null, null, `${p}1`]);
    const active = repo(t, { 'LEDGER.md': tight(1, 2), 'LEDGER_INDEX.md': index(p, [[`${p}1`, 'standing']]) });
    assert.deepEqual(L.check(active).problems, []);
    assert.equal(L.next(active), `${p}3`);
    const settled = repo(t, {
      'LEDGER.md': tight(1, 2), 'LEDGER_SETTLED.md': tight(3, 4),
      'LEDGER_INDEX.md': index(p, [[`${p}1`, 'standing'], [`${p}3`, 'settled', 'LEDGER_SETTLED.md']]),
    });
    assert.deepEqual(L.check(settled).problems, []);
    assert.equal(L.next(settled), `${p}5`);
  }
});

test('next counts no line that only looks like an entry, and counts one inside a fenced block', (t) => {
  const rows = [['R1', 'standing'], ['R2', 'standing']];
  const withLines = (...lines) => `# T\n\n${entry('R1')}## R2 (2030-01-02): b\n\n${lines.join('\n')}\n`;
  // Indented; another prefix; a longer prefix that ends in this one; a letter after the digits; no space after
  // the full stop; the number in the middle of a line.
  const looksLike = ['  ## R90 (2030-01-03): c', 'K90. "x"', 'RR90. "x"', '- **R90a (c).** "x"', 'R90.5 is a figure', 'see R90. and on'];
  const dir = repo(t, { 'LEDGER.md': withLines(...looksLike), 'LEDGER_INDEX.md': index('R', rows) });
  assert.deepEqual(L.check(dir).problems, []);
  assert.equal(L.next(dir), 'R3');
  // A line inside a fenced block is no entry, and its number is taken all the same.
  const fenced = repo(t, { 'LEDGER.md': withLines('~~~', 'R50. "an example"', '~~~'), 'LEDGER_INDEX.md': index('R', rows) });
  assert.deepEqual(L.check(fenced).problems, []);
  assert.equal(L.next(fenced), 'R51');
});

test('next counts a heading or bullet line whose number has a full stop, a bracket or a colon after it', (t) => {
  // Inside a fenced block a line is no entry, so only next's scan of the lines can find its number.
  for (const [line, want] of [['## R40(2030-01-03): c', 'R41'], ['- **R60:** "x"', 'R61'], ['## R70. c', 'R71']]) {
    const dir = repo(t, { 'LEDGER.md': `# T\n\n${entry('R1')}~~~\n${line}\n~~~\n`, 'LEDGER_INDEX.md': index('R', [['R1', 'standing']]) });
    assert.deepEqual(L.check(dir).problems, []);
    assert.equal(L.next(dir), want);
  }
});

test('next refuses when the index has uncommitted changes, and leaves no lock behind', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1'), 'LEDGER_INDEX.md': index('R', [['R1', 'standing']]) });
  const dirty = get(dir, 'LEDGER_INDEX.md') + '\n';
  put(dir, 'LEDGER_INDEX.md', dirty);
  refuses(() => L.next(dir), /next: LEDGER_INDEX\.md has uncommitted changes; commit them first/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), dirty);
  assert.ok(!fs.existsSync(at(dir, LOCK)));
});

test('next refuses while another holds the lock, and names its age', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1'), 'LEDGER_INDEX.md': index('R', [['R1', 'standing']]) });
  fs.mkdirSync(at(dir, LOCK));
  const before = get(dir, 'LEDGER_INDEX.md');
  refuses(() => L.next(dir, { waitMs: 0 }), /^next: the lock .*ledger-next\.lock is \d+ s old; remove it by hand/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), before);
  assert.ok(fs.existsSync(at(dir, LOCK)));
});

test('next takes EPERM from making the lock as the lock held, and refuses when it lasts', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1'), 'LEDGER_INDEX.md': index('R', [['R1', 'standing']]) });
  // The script and this file share one fs object, so the failure can be made here.
  const mkdirSync = fs.mkdirSync;
  t.after(() => { fs.mkdirSync = mkdirSync; });
  let failures = 1;
  fs.mkdirSync = (target, ...rest) => {
    if (!String(target).endsWith('ledger-next.lock') || failures-- <= 0) return mkdirSync(target, ...rest);
    throw Object.assign(new Error('EPERM: operation not permitted, mkdir'), { code: 'EPERM' });
  };
  // Once, as when another process is removing the lock: next waits and takes it.
  assert.equal(L.next(dir, { waitMs: 1000 }), 'R2');
  // Every time: no lock can be made, and next refuses.
  failures = Infinity;
  const reserved = get(dir, 'LEDGER_INDEX.md');
  refuses(() => L.next(dir, { waitMs: 0 }), /the lock .*ledger-next\.lock cannot be made \(EPERM\)$/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), reserved);
  assert.ok(!fs.existsSync(at(dir, LOCK)));
});

test('two next calls at once yield two different numbers', async (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1'), 'LEDGER_INDEX.md': index('R', [['R1', 'standing']]) });
  const call = () => new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, 'next'], { cwd: dir });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve([code, out.trim()]));
  });
  const results = await Promise.all([call(), call(), call()]);
  assert.deepEqual(results.map((r) => r[0]), [0, 0, 0]);
  assert.deepEqual(results.map((r) => r[1]).sort(), ['R2', 'R3', 'R4']);
  assert.deepEqual(L.check(dir).problems, []);
});

test('next restores the index and refuses when its commit fails', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1'), 'LEDGER_INDEX.md': index('R', [['R1', 'standing']]) });
  const before = get(dir, 'LEDGER_INDEX.md');
  fs.mkdirSync(at(dir, '.git/hooks'), { recursive: true });
  fs.writeFileSync(at(dir, '.git/hooks/pre-commit'), '#!/bin/sh\necho "the hook says no" >&2\nexit 1\n');
  fs.chmodSync(at(dir, '.git/hooks/pre-commit'), 0o755);
  refuses(() => L.next(dir), /^git commit failed: the hook says no$/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), before);
  assert.equal(git(dir, 'status', '--porcelain').trim(), '');
  assert.ok(!fs.existsSync(at(dir, LOCK)));
  const run = cli(dir, 'next');
  assert.equal(run.status, 2);
  assert.equal(run.stderr, 'git commit failed: the hook says no\n');
  fs.rmSync(at(dir, '.git/hooks/pre-commit'));
  assert.equal(L.next(dir), 'R2');
});

test('outside a git repository next refuses with exit 2', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  put(dir, 'LEDGER.md', ledger('R1'));
  put(dir, 'LEDGER_INDEX.md', index('R', [['R1', 'standing']]));
  // The ceiling keeps git from finding a repository above the temp folder.
  const run = spawnSync(process.execPath, [SCRIPT, 'next'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^git rev-parse failed: fatal: not a git repository/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), index('R', [['R1', 'standing']]));
});

// ==== T5: merged

test('merged settles only round rows whose pull request has merged', (t) => {
  for (const prRepo of ['owner/code', 'other/app']) {
    const rows = [['R1', 'round', 'LEDGER.md', 'PR 7'], ['R2', 'round', 'LEDGER.md', 'PR 8'], ['R3', 'standing', 'LEDGER.md', 'PR 7'], ['R4', 'round'], ['R5', 'round', 'LEDGER.md', 'PR 70']];
    const dir = repo(t, { 'LEDGER.md': ledger('R1', 'R2', 'R3', 'R4', 'R5'), 'LEDGER_INDEX.md': index('R', rows, { repo: prRepo }) });
    const asked = [];
    const prState = (n, r) => { asked.push([n, r]); return { 7: 'MERGED', 8: 'OPEN', 70: 'CLOSED' }[n]; };
    assert.deepEqual(L.merged(dir, { prState }), ['R1']);
    assert.deepEqual(asked, [[7, prRepo], [8, prRepo], [70, prRepo]]);
    assert.deepEqual(L.parseIndex(get(dir, 'LEDGER_INDEX.md')).rows.map((r) => r.status), ['settled', 'round', 'standing', 'round', 'round']);
    assert.equal(git(dir, 'log', '-1', '--format=%s').trim(), 'Ledger: 1 ruling settled, merged');
    assert.equal(git(dir, 'show', '--name-only', '--format=', 'HEAD').trim(), 'LEDGER_INDEX.md');
    assert.deepEqual(L.merged(dir, { prState }), []);
    assert.equal(git(dir, 'rev-list', '--count', 'HEAD').trim(), '2');
    assert.ok(!fs.existsSync(at(dir, LOCK)));
  }
});

test('merged writes a commit subject of one length, with the rulings in the body', (t) => {
  for (const count of [1, 12]) {
    const settling = Array.from({ length: count }, (_, i) => `R${100 + i}`);
    const dir = repo(t, { 'LEDGER.md': ledger(...settling), 'LEDGER_INDEX.md': index('R', settling.map((id) => [id, 'round', 'LEDGER.md', 'PR 7']), { repo: 'owner/code' }) });
    assert.deepEqual(L.merged(dir, { prState: () => 'MERGED' }), settling);
    const subject = git(dir, 'log', '-1', '--format=%s').trim();
    assert.equal(subject, count === 1 ? 'Ledger: 1 ruling settled, merged' : 'Ledger: 12 rulings settled, merged');
    assert.ok(subject.length <= 72);
    assert.equal(git(dir, 'log', '-1', '--format=%b').trim(), settling.join('\n'));
  }
});

test('merged refuses, changing nothing, when gh fails, gh is missing, or pr-repo is none', (t) => {
  const rows = [['R1', 'round', 'LEDGER.md', 'PR 7'], ['R2', 'round', 'LEDGER.md', 'PR 8']];
  const dir = repo(t, { 'LEDGER.md': ledger('R1', 'R2'), 'LEDGER_INDEX.md': index('R', rows, { repo: 'owner/code' }) });
  const before = get(dir, 'LEDGER_INDEX.md');
  refuses(() => L.merged(dir, { prState: (n) => { if (n === 8) throw new L.LedgerError('merged: gh failed for PR 8: boom'); return 'MERGED'; } }), /gh failed for PR 8/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), before);
  const run = spawnSync(process.execPath, [SCRIPT, 'merged'], { cwd: dir, encoding: 'utf8', env: { ...process.env, LEDGER_GH: 'no-such-gh-command' } });
  assert.equal(run.status, 2);
  assert.equal(run.stderr, 'merged: gh not found\n');
  assert.equal(get(dir, 'LEDGER_INDEX.md'), before);
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD').trim(), '1');

  const none = repo(t, { 'LEDGER.md': ledger('R1', 'R2'), 'LEDGER_INDEX.md': index('R', rows) });
  refuses(() => L.merged(none, { prState: () => 'MERGED' }), /rows name pull requests but pr-repo is none/);
  put(none, 'LEDGER_INDEX.md', get(none, 'LEDGER_INDEX.md') + '\n');
  refuses(() => L.merged(none, { prState: () => 'MERGED' }), /merged: LEDGER_INDEX\.md has uncommitted changes/);
});

test('merged keeps what another session did to the index while gh was asked', (t) => {
  const rows = [['R1', 'round', 'LEDGER.md', 'PR 7'], ['R2', 'round', 'LEDGER.md', 'PR 8'], ['R3', 'standing']];
  const files = { 'LEDGER.md': ledger('R1', 'R2', 'R3'), 'LEDGER_INDEX.md': index('R', rows, { repo: 'owner/code' }) };

  // The other session reserves a number during each question, and sets R2 back to standing.
  const dir = repo(t, files);
  const reserved = [];
  const busy = (n) => {
    reserved.push(L.next(dir));
    if (n === 8) setStatus(dir, 'R2', 'round', 'standing');
    return 'MERGED';
  };
  assert.deepEqual(L.merged(dir, { prState: busy }), ['R1']);
  assert.deepEqual(reserved, ['R4', 'R5']);
  assert.deepEqual(L.parseIndex(get(dir, 'LEDGER_INDEX.md')).rows.map((r) => [r.id, r.status]), [['R1', 'settled'], ['R2', 'standing'], ['R3', 'standing'], ['R4', 'reserved'], ['R5', 'reserved']]);
  assert.equal(git(dir, 'log', '-1', '--format=%s').trim(), 'Ledger: 1 ruling settled, merged');
  assert.equal(L.next(dir), 'R6');
  assert.deepEqual(L.check(dir).problems, []);

  // The other session points R1 at another pull request: the answer about PR 7 says nothing about PR 9.
  const repointed = repo(t, files);
  const repoint = (n) => {
    if (n === 7) {
      put(repointed, 'LEDGER_INDEX.md', get(repointed, 'LEDGER_INDEX.md').replace('| PR 7 |', '| PR 9 |'));
      git(repointed, 'commit', '-qam', 'another pull request');
    }
    return n === 7 ? 'MERGED' : 'OPEN';
  };
  assert.deepEqual(L.merged(repointed, { prState: repoint }), []);
  assert.deepEqual(L.parseIndex(get(repointed, 'LEDGER_INDEX.md')).rows.map((r) => [r.id, r.status, r.pr]), [['R1', 'round', 'PR 9'], ['R2', 'round', 'PR 8'], ['R3', 'standing', 'none']]);
  assert.equal(git(repointed, 'rev-list', '--count', 'HEAD').trim(), '2');

  // The other session points R1 at PR 8, which was asked about for R2 and has merged: the answer holds for R1.
  const shared = repo(t, files);
  const share = (n) => {
    if (n === 7) {
      put(shared, 'LEDGER_INDEX.md', get(shared, 'LEDGER_INDEX.md').replace('| PR 7 |', '| PR 8 |'));
      git(shared, 'commit', '-qam', 'the same pull request');
    }
    return n === 8 ? 'MERGED' : 'OPEN';
  };
  assert.deepEqual(L.merged(shared, { prState: share }), ['R1', 'R2']);

  // The other session settles both rows itself: nothing is left to do, and nothing is committed.
  const done = repo(t, files);
  const settleBoth = (n) => { setStatus(done, n === 7 ? 'R1' : 'R2', 'round', 'standing'); return 'MERGED'; };
  assert.deepEqual(L.merged(done, { prState: settleBoth }), []);
  assert.equal(git(done, 'rev-list', '--count', 'HEAD').trim(), '3');

  // The other session leaves a row half written: merged does not commit it.
  const half = repo(t, files);
  const dirty = get(half, 'LEDGER_INDEX.md') + '\n';
  refuses(() => L.merged(half, { prState: () => { put(half, 'LEDGER_INDEX.md', dirty); return 'MERGED'; } }), /merged: LEDGER_INDEX\.md has uncommitted changes/);
  assert.equal(get(half, 'LEDGER_INDEX.md'), dirty);
  assert.equal(git(half, 'rev-list', '--count', 'HEAD').trim(), '1');
  assert.ok(!fs.existsSync(at(half, LOCK)));
});

test('merged writes under the lock that next takes', (t) => {
  const dir = repo(t, { 'LEDGER.md': ledger('R1'), 'LEDGER_INDEX.md': index('R', [['R1', 'round', 'LEDGER.md', 'PR 7']], { repo: 'owner/code' }) });
  const before = get(dir, 'LEDGER_INDEX.md');
  fs.mkdirSync(at(dir, LOCK));
  refuses(() => L.merged(dir, { prState: () => 'MERGED', waitMs: 0 }), /^merged: the lock .*ledger-next\.lock is \d+ s old; remove it by hand/);
  assert.equal(get(dir, 'LEDGER_INDEX.md'), before);
  assert.ok(fs.existsSync(at(dir, LOCK)));
  fs.rmdirSync(at(dir, LOCK));
  assert.deepEqual(L.merged(dir, { prState: () => 'MERGED' }), ['R1']);
});

// ==== T6: move

const start = (t, extra = {}) => repo(t, {
  'LEDGER.md': ledger('R1', 'R2', 'R3', 'R4', 'R5'),
  'LEDGER_SETTLED.md': file('# Settled\n\nStill bind.\n\n', 'R0'),
  'LEDGER_INDEX.md': index('R', [['R0', 'settled', 'LEDGER_SETTLED.md'], ['R1', 'standing'], ['R2', 'settled'], ['R3', 'round'], ['R4', 'superseded', 'LEDGER.md', 'none', 'R5'], ['R5', 'unclassified'], ['R6', 'reserved']]),
  ...extra,
});

test('move sends settled and superseded entries to the settled file and nothing else', (t) => {
  const dir = start(t);
  const run = cli(dir, 'move');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'to LEDGER_SETTLED.md: R2, R4\nto LEDGER.md: none\n');
  assert.equal(get(dir, 'LEDGER.md'), ledger('R1', 'R3', 'R5'));
  assert.equal(get(dir, 'LEDGER_SETTLED.md'), file('# Settled\n\nStill bind.\n\n', 'R0', 'R2', 'R4'));
  assert.deepEqual(L.parseIndex(get(dir, 'LEDGER_INDEX.md')).rows.map((r) => r.file), ['LEDGER_SETTLED.md', 'LEDGER.md', 'LEDGER_SETTLED.md', 'LEDGER.md', 'LEDGER_SETTLED.md', 'LEDGER.md', 'LEDGER.md']);
  assert.deepEqual(L.check(dir).problems, []);
  git(dir, 'commit', '-qam', 'moved');
  assert.deepEqual(L.move(dir), { toSettled: [], toActive: [] });
  assert.equal(git(dir, 'status', '--porcelain').trim(), '');
  // With nothing to move and no settled file, none is made.
  const idle = repo(t, { 'LEDGER.md': ledger('K1'), 'LEDGER_INDEX.md': index('K', [['K1', 'standing']]) });
  assert.deepEqual(L.move(idle), { toSettled: [], toActive: [] });
  assert.equal(git(idle, 'status', '--porcelain').trim(), '');
});

test('move creates the settled file with the sentence that its rulings still bind', (t) => {
  const dir = repo(t, { 'LEDGER.md': '# T\r\n\r\n- **K1 (a).** "x"\r\n- **K2 (b).** "y"\r\n- **K3 (c).** "z"\r\n', 'LEDGER_INDEX.md': index('K', [['K1', 'standing'], ['K2', 'settled'], ['K3', 'standing']]) });
  assert.deepEqual(L.move(dir), { toSettled: ['K2'], toActive: [] });
  // K1 and K3 are new neighbours and get one blank line.
  assert.equal(get(dir, 'LEDGER.md'), '# T\r\n\r\n- **K1 (a).** "x"\r\n\r\n- **K3 (c).** "z"\r\n');
  assert.equal(get(dir, 'LEDGER_SETTLED.md'), L.SETTLED_HEADER.join('\r\n') + '\r\n\r\n- **K2 (b).** "y"\r\n');
  assert.match(get(dir, 'LEDGER_SETTLED.md'), /They still bind unless superseded\. Settled means the work is done, not\r\nthat the ruling lapsed\./);
});

test('two entries with no blank line between them still have none after a move that touches neither', (t) => {
  for (const eol of ['\n', '\r\n']) {
    const lines = ['# T', '', '- **K0 (z).** "w"', '- **K1 (a).** "x"', '- **K2 (b).** "y"', '- **K3 (c).** "z"', '- **K4 (d).** "v"', ''];
    const dir = repo(t, { 'LEDGER.md': lines.join(eol), 'LEDGER_INDEX.md': index('K', [['K0', 'standing'], ['K1', 'standing'], ['K2', 'settled'], ['K3', 'standing'], ['K4', 'standing']]) });
    assert.deepEqual(L.move(dir), { toSettled: ['K2'], toActive: [] });
    // K0 and K1, and K3 and K4, were neighbours and stay as they were; K1 and K3 are new neighbours.
    assert.equal(get(dir, 'LEDGER.md'), ['# T', '', '- **K0 (z).** "w"', '- **K1 (a).** "x"', '', '- **K3 (c).** "z"', '- **K4 (d).** "v"', ''].join(eol));
  }
  // The same in the settled file: K1 and K2 stay as they were when K3 arrives after them.
  const dir = repo(t, {
    'LEDGER.md': '# T\n\n- **K3 (c).** "z"\n\n- **K4 (d).** "v"\n', 'LEDGER_SETTLED.md': '# S\n\n- **K1 (a).** "x"\n- **K2 (b).** "y"\n',
    'LEDGER_INDEX.md': index('K', [['K1', 'settled', 'LEDGER_SETTLED.md'], ['K2', 'settled', 'LEDGER_SETTLED.md'], ['K3', 'settled'], ['K4', 'standing']]),
  });
  assert.deepEqual(L.move(dir), { toSettled: ['K3'], toActive: [] });
  assert.equal(get(dir, 'LEDGER_SETTLED.md'), '# S\n\n- **K1 (a).** "x"\n- **K2 (b).** "y"\n\n- **K3 (c).** "z"\n');
});

test('the settled file keeps the order of the index rows', (t) => {
  const dir = repo(t, {
    'LEDGER.md': ledger('K1', 'K2', 'K4'), 'LEDGER_SETTLED.md': file('# S\n\n', 'K3'),
    'LEDGER_INDEX.md': index('K', [['K1', 'settled'], ['K2', 'standing'], ['K3', 'settled', 'LEDGER_SETTLED.md'], ['K4', 'settled']]),
  });
  assert.deepEqual(L.move(dir), { toSettled: ['K1', 'K4'], toActive: [] });
  assert.equal(get(dir, 'LEDGER_SETTLED.md'), file('# S\n\n', 'K1', 'K3', 'K4'));
});

test('move then the reverse leaves both files byte-identical to the start', (t) => {
  const dir = start(t);
  const before = [get(dir, 'LEDGER.md'), get(dir, 'LEDGER_SETTLED.md'), get(dir, 'LEDGER_INDEX.md')];
  L.move(dir);
  git(dir, 'commit', '-qam', 'moved');
  setStatus(dir, 'R2', 'settled', 'standing');
  setStatus(dir, 'R4', 'superseded', 'round');
  assert.deepEqual(L.move(dir), { toSettled: [], toActive: ['R2', 'R4'] });
  setStatus(dir, 'R2', 'standing', 'settled');
  setStatus(dir, 'R4', 'round', 'superseded');
  assert.deepEqual([get(dir, 'LEDGER.md'), get(dir, 'LEDGER_SETTLED.md'), get(dir, 'LEDGER_INDEX.md')], before);
});

test('on a ledger with session headings, an entry moved out and back lands after the nearest earlier entry', (t) => {
  // The stated limit: L3 was written under the second heading and comes back above it.
  const text = '# T\n\n## 2030-01-01: first session\n\nL1. "a"\n\nL2. "b"\n\n## 2030-01-02: second session\n\nL3. "c"\n\nL4. "d"\n';
  const dir = repo(t, { 'LEDGER.md': text, 'LEDGER_INDEX.md': index('L', [['L1', 'standing'], ['L2', 'standing'], ['L3', 'settled'], ['L4', 'standing']]) });
  assert.deepEqual(L.move(dir), { toSettled: ['L3'], toActive: [] });
  assert.equal(get(dir, 'LEDGER.md'), text.replace('L3. "c"\n\n', ''));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'moved');
  setStatus(dir, 'L3', 'settled', 'standing');
  assert.deepEqual(L.move(dir), { toSettled: [], toActive: ['L3'] });
  assert.equal(get(dir, 'LEDGER.md'), '# T\n\n## 2030-01-01: first session\n\nL1. "a"\n\nL2. "b"\n\nL3. "c"\n\n## 2030-01-02: second session\n\nL4. "d"\n');

  // The other half of the limit: the blank lines around a returning entry are not restored.
  const tight = repo(t, { 'LEDGER.md': '# T\n\n- **K1 (a).** "w"\n- **K2 (b).** "x"\n- **K3 (c).** "y"\n', 'LEDGER_INDEX.md': index('K', [['K1', 'standing'], ['K2', 'settled'], ['K3', 'standing']]) });
  L.move(tight);
  git(tight, 'add', '-A');
  git(tight, 'commit', '-qm', 'moved');
  setStatus(tight, 'K2', 'settled', 'standing');
  assert.deepEqual(L.move(tight), { toSettled: [], toActive: ['K2'] });
  assert.equal(get(tight, 'LEDGER.md'), '# T\n\n- **K1 (a).** "w"\n\n- **K2 (b).** "x"\n\n- **K3 (c).** "y"\n');
});

test('an entry that comes back with no earlier entry in the active file goes before the first entry', (t) => {
  const dir = start(t);
  setStatus(dir, 'R0', 'settled', 'standing');
  assert.deepEqual(L.move(dir), { toSettled: ['R2', 'R4'], toActive: ['R0'] });
  assert.equal(get(dir, 'LEDGER.md'), ledger('R0', 'R1', 'R3', 'R5'));
  // With no entry left in the active file, it goes below the header.
  const empty = repo(t, { 'LEDGER.md': '# T\n\nHeader text.\n', 'LEDGER_SETTLED.md': file('# S\n\n', 'K1'), 'LEDGER_INDEX.md': index('K', [['K1', 'standing', 'LEDGER_SETTLED.md']]) });
  assert.deepEqual(L.move(empty), { toSettled: [], toActive: ['K1'] });
  assert.equal(get(empty, 'LEDGER.md'), file('# T\n\nHeader text.\n\n', 'K1'));
});

test('an old bullet with no number moves, and stays, when the numbered bullets are in the other file', (t) => {
  const text = '# T\n\n- **K1 (a).** "w"\n- **Design note.** "x"\n\n## K2 (2030-01-01): new form\n\n"y"\n';
  const settledHead = L.SETTLED_HEADER.join('\n') + '\n\n';
  // The only numbered bullet leaves, and the bullet with no number stays behind.
  const stays = repo(t, { 'LEDGER.md': text, 'LEDGER_INDEX.md': index('K', [['K1', 'settled'], ['`Design note`', 'standing'], ['K2', 'standing']]) });
  assert.deepEqual(L.move(stays), { toSettled: ['K1'], toActive: [] });
  assert.equal(get(stays, 'LEDGER.md'), '# T\n\n- **Design note.** "x"\n\n## K2 (2030-01-01): new form\n\n"y"\n');
  assert.equal(get(stays, 'LEDGER_SETTLED.md'), settledHead + '- **K1 (a).** "w"\n');
  assert.deepEqual(L.check(stays).problems, []);
  // The bullet with no number leaves alone, for a settled file that has no numbered bullet.
  const goes = repo(t, { 'LEDGER.md': text, 'LEDGER_INDEX.md': index('K', [['K1', 'standing'], ['`Design note`', 'settled'], ['K2', 'standing']]) });
  assert.deepEqual(L.move(goes), { toSettled: ['`Design note`'], toActive: [] });
  assert.equal(get(goes, 'LEDGER.md'), '# T\n\n- **K1 (a).** "w"\n\n## K2 (2030-01-01): new form\n\n"y"\n');
  assert.equal(get(goes, 'LEDGER_SETTLED.md'), settledHead + '- **Design note.** "x"\n');
  assert.deepEqual(L.check(goes).problems, []);
});

test('move leaves an entry that ends in a non-ASCII character as it was', (t) => {
  const text = '# T\n\n## R1 (2030-01-01): a\n\n"x" voil\xc3\xa0\n\n## R2 (2030-01-01): b\n\n"y"\n\n## R3 (2030-01-01): c\n\n"z" voil\xc3\xa0\n';
  const dir = repo(t, { 'LEDGER.md': text, 'LEDGER_INDEX.md': index('R', [['R1', 'standing'], ['R2', 'settled'], ['R3', 'settled']]) });
  assert.deepEqual(L.move(dir), { toSettled: ['R2', 'R3'], toActive: [] });
  assert.equal(get(dir, 'LEDGER.md'), '# T\n\n## R1 (2030-01-01): a\n\n"x" voil\xc3\xa0\n');
  assert.equal(get(dir, 'LEDGER_SETTLED.md'), L.SETTLED_HEADER.join('\n') + '\n\n## R2 (2030-01-01): b\n\n"y"\n\n## R3 (2030-01-01): c\n\n"z" voil\xc3\xa0\n');
  assert.ok(validUtf8(get(dir, 'LEDGER.md')) && validUtf8(get(dir, 'LEDGER_SETTLED.md')));
});

test('move restores all three files when the entries afterwards are not the entries before', (t) => {
  for (const withSettled of [true, false]) {
    const dir = start(t);
    if (!withSettled) {
      fs.rmSync(at(dir, 'LEDGER_SETTLED.md'));
      put(dir, 'LEDGER_INDEX.md', get(dir, 'LEDGER_INDEX.md').replace(/^\| R0 .*\n/m, ''));
      git(dir, 'commit', '-qam', 'no settled file');
    }
    const before = [get(dir, 'LEDGER.md'), withSettled ? get(dir, 'LEDGER_SETTLED.md') : null, get(dir, 'LEDGER_INDEX.md')];
    const damage = () => put(dir, 'LEDGER_SETTLED.md', get(dir, 'LEDGER_SETTLED.md').replace('words of R4', 'words of R4, edited'));
    refuses(() => L.move(dir, { afterWrite: damage }), /not the entries before it; all three files restored/);
    assert.deepEqual([get(dir, 'LEDGER.md'), fs.existsSync(at(dir, 'LEDGER_SETTLED.md')) ? get(dir, 'LEDGER_SETTLED.md') : null, get(dir, 'LEDGER_INDEX.md')], before);
    assert.equal(git(dir, 'status', '--porcelain').trim(), '');
  }
});

test('move also restores when a header or a session heading was changed or an entry lost', (t) => {
  const damages = [
    (dir) => put(dir, 'LEDGER.md', get(dir, 'LEDGER.md').replace('Header text.', 'Header.')),
    (dir) => put(dir, 'LEDGER_SETTLED.md', get(dir, 'LEDGER_SETTLED.md').replace('Still bind.', 'Lapsed.')),
    (dir) => put(dir, 'LEDGER_SETTLED.md', get(dir, 'LEDGER_SETTLED.md').replace(entry('R2'), '')),
  ];
  for (const damage of damages) {
    const dir = start(t);
    refuses(() => L.move(dir, { afterWrite: () => damage(dir) }), /all three files restored/);
    assert.equal(git(dir, 'status', '--porcelain').trim(), '');
  }
});

test('a ## line that is not an entry never moves', (t) => {
  const text = '# T\n\n## 2030-01-01: first session\n\nL1. "a"\n\nL2. "b"\n\n## 2030-01-02: second session\n\nL3. "c"\n';
  const dir = repo(t, { 'LEDGER.md': text, 'LEDGER_INDEX.md': index('L', [['L1', 'settled'], ['L2', 'settled'], ['L3', 'superseded', 'LEDGER.md', 'none', 'L1']]) });
  assert.deepEqual(L.move(dir), { toSettled: ['L1', 'L2', 'L3'], toActive: [] });
  assert.equal(get(dir, 'LEDGER.md'), '# T\n\n## 2030-01-01: first session\n\n## 2030-01-02: second session\n');
  assert.equal(get(dir, 'LEDGER_SETTLED.md'), L.SETTLED_HEADER.join('\n') + '\n\nL1. "a"\n\nL2. "b"\n\nL3. "c"\n');
});

test('move refuses on a dirty tree or a failing check, changing nothing', (t) => {
  const dirty = start(t);
  put(dirty, 'notes.txt', 'x\n');
  refuses(() => L.move(dirty), /move: the working tree is not clean; commit first/);
  assert.equal(get(dirty, 'LEDGER.md'), ledger('R1', 'R2', 'R3', 'R4', 'R5'));

  const broken = start(t, { 'LEDGER.md': ledger('R1', 'R2', 'R3', 'R4', 'R5', 'R7') });
  refuses(() => L.move(broken), /move: check fails:\nR7: an entry with no row/);
  assert.equal(cli(broken, 'move').status, 2);
  assert.equal(git(broken, 'status', '--porcelain').trim(), '');
});

test('every command refuses, changing nothing, on a table it cannot parse', (t) => {
  const dir = start(t);
  put(dir, 'LEDGER_INDEX.md', get(dir, 'LEDGER_INDEX.md').replace('|---|---|---|---|---|---|---|---|\n', '').replace('- pr-repo: none', '- pr-repo: owner/code'));
  git(dir, 'commit', '-qam', 'a hand edit that lost the separator row');
  const state = () => [get(dir, 'LEDGER.md'), get(dir, 'LEDGER_SETTLED.md'), get(dir, 'LEDGER_INDEX.md'), git(dir, 'rev-parse', 'HEAD'), git(dir, 'status', '--porcelain')];
  const before = state();
  for (const command of ['list', 'check', 'next', 'merged', 'move']) {
    const run = cli(dir, command);
    assert.equal(run.status, 2, command);
    assert.equal(run.stderr, 'LEDGER_INDEX.md: the Rulings table needs a separator row (| --- | --- |) as its second line\n', command);
    assert.equal(run.stdout, '', command);
  }
  assert.deepEqual(state(), before);
  assert.ok(!fs.existsSync(at(dir, LOCK)));
});
