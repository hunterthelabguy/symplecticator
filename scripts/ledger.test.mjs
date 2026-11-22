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

