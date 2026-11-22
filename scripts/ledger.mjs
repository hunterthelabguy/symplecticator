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

// ==== CLI

function main() {
  throw new LedgerError('usage: ledger.mjs <list|check|next|merged|move|init> [args]');
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
