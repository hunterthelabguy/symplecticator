#!/usr/bin/env node
// self-audit.mjs: check what this repository says about itself against what it holds.
//
// The skills, the README and the setup interview make claims a tool can read: which test suites exist and
// where they run, which files a link or a hook names, which example a rule cites, which floor item a skill
// leans on, how many lines a template may hold, how many days a script waits. Each check here reads one such
// claim from the prose and the fact from the files, and fails when they differ. Nothing is judged: a check
// that needs judgement does not belong here.
//
// Repo-only: setup copies scripts/ into ~/.claude, and this folder is not copied.
//
// Usage: node audit/self-audit.mjs [<repo root>]
// Exit 0 = every check passed (notes may print); 1 = at least one FAIL line; 2 = the audit could not run.
// Exports audit(tree) for the test beside it: a tree is a Map of path (forward slashes) to text.

import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EM_DASH = String.fromCharCode(0x2014);
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
// Claude Code's own commands the prose may name; any other /name must be a skill or command of this repository.
const BUILT_IN = new Set(['clear', 'compact', 'usage']);
// Files an adopter writes, which the prose names and this repository does not hold.
const ADOPTER_FILES = new Set(['scripts/ground-truth.conf']);

const SETUP = '.claude/skills/setup-config/SKILL.md';
const CHARTER = 'templates/charter.template.md';
const ADDENDUM = 'templates/addendum.template.md';
const GUARD = 'scripts/perturb-guard.mjs';

// ---- reading

const isMd = (p) => p.endsWith('.md');
// The plan and build records under docs/ quote other repositories and earlier states; they make no claim here.
const isRecord = (p) => p.startsWith('docs/');
const prose = (t) => [...t.keys()].filter((p) => isMd(p) && !isRecord(p));

// The text between a line that matches start and the next line that matches end (or the end of the file).
function section(text, start, end) {
  const lines = text.split(/\r?\n/);
  const a = lines.findIndex((l) => start.test(l));
  if (a < 0) return null;
  const b = lines.findIndex((l, i) => i > a && end.test(l));
  return lines.slice(a, b < 0 ? lines.length : b).join('\n');
}
// A SKILL.md or command file's frontmatter, as its lines.
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  return m ? m[1] : '';
}
const skillNames = (t) => [...t.keys()].map((p) => /^skills\/([^/]+)\/SKILL\.md$/.exec(p)?.[1]).filter(Boolean);
const commandNames = (t) => [...t.keys()].map((p) => /^commands\/([^/]+)\.md$/.exec(p)?.[1]).filter(Boolean);
const localSkillNames = (t) => [...t.keys()].map((p) => /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(p)?.[1]).filter(Boolean);

// ---- the checks: each returns its problems, and may add notes

// Floor item 3, on this repository: every suite is named wherever the verification is described. A suite under
// scripts/ is installed, so setup runs it on the adopter's machine too; one under audit/ is this repository's own.
function suites(t, note) {
  const out = [];
  const installed = [...t.keys()].filter((p) => /^scripts\/[^/]+\.test\.(sh|mjs)$/.test(p));
  const own = [...t.keys()].filter((p) => /^audit\/[^/]+\.test\.(sh|mjs)$/.test(p));
  const places = [
    ['CLAUDE.md, the Verify bullet', section(t.get('CLAUDE.md') ?? '', /\*\*Verify:\*\*/, /^- \*\*(?!Verify)/), [...installed, ...own]],
    ['.github/workflows/test.yml', t.get('.github/workflows/test.yml') ?? null, [...installed, ...own]],
    [`${SETUP}, step 10`, section(t.get(SETUP) ?? '', /^## 10\./, /^## 11\./), installed],
  ];
  for (const [where, text, wanted] of places) {
    if (text === null) { out.push(`${where}: not found`); continue; }
    for (const s of wanted) if (!text.includes(s)) out.push(`${where} does not name ${s}`);
  }
  const counted = [
    ['README.md', /the scripts' (\w+) test suites/, installed.length],
    ['CLAUDE.md', /CI runs all (\w+) on/, installed.length + own.length],
  ];
  for (const [file, re, n] of counted) {
    const m = re.exec((t.get(file) ?? '').replace(/\s+/g, ' '));
    if (!m) out.push(`${file}: no sentence matching ${re} to count the suites in`);
    else if (m[1] !== NUMBER_WORDS[n] && m[1] !== String(n)) out.push(`${file} says ${m[1]} suites; there are ${n}`);
  }
  note(`suites: ${installed.length} installed, ${own.length} repository-only`);
  return out;
}

function links(t) {
  const out = [];
  const has = (p) => t.has(p) || [...t.keys()].some((k) => k.startsWith(`${p}/`));
  for (const p of prose(t)) {
    for (const m of t.get(p).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].replace(/#.*$/, '');
      if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(p), target));
      if (!has(resolved)) out.push(`${p} links to ${m[1]}, which does not exist`);
    }
  }
  return out;
}

// A cited example ("example C5", "(C1)") is a heading in an examples file of the same skill.
function examples(t) {
  const out = [];
  for (const name of skillNames(t)) {
    const dir = `skills/${name}/`;
    const defined = new Set();
    for (const p of [...t.keys()].filter((k) => k.startsWith(dir) && k.endsWith('-examples.md'))) {
      for (const m of t.get(p).matchAll(/^## ([A-Z]\d+)\. /gm)) defined.add(m[1]);
    }
    const text = t.get(`${dir}SKILL.md`);
    for (const m of text.matchAll(/examples? ([A-Z]\d+)\b|\(([A-Z]\d+)\)/g)) {
      const id = m[1] ?? m[2];
      if (!defined.has(id)) out.push(`${dir}SKILL.md cites example ${id}; no examples file beside it has a "## ${id}." heading`);
    }
  }
  return out;
}

// Every script the prose, a settings hook or the workflow names is in scripts/ (or, named with no ~/.claude
// before it, in a scripts folder beside the file that names it).
function scripts(t) {
  const out = [];
  for (const p of [...t.keys()].filter((k) => !isRecord(k) && /\.(md|json|yml)$/.test(k))) {
    for (const m of t.get(p).matchAll(/(?<![\w./-])(?:~\/\.claude\/)?(scripts\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:sh|mjs|conf))\b/g)) {
      const beside = !m[0].startsWith('~') && t.has(posix.join(posix.dirname(p), m[1]));
      if (!t.has(m[1]) && !beside && !ADOPTER_FILES.has(m[1])) out.push(`${p} names ${m[1]}, which does not exist`);
    }
  }
  return [...new Set(out)];
}

// Every /name in backticks is a skill or command here, or one of Claude Code's own.
function commands(t) {
  const out = [];
  const known = new Set([...skillNames(t), ...commandNames(t), ...localSkillNames(t), ...BUILT_IN]);
  for (const p of prose(t)) {
    for (const m of t.get(p).matchAll(/`\/([a-z][a-z-]*)(?: [^`]*)?`/g)) {
      if (!known.has(m[1])) out.push(`${p} names /${m[1]}, which is no skill or command here`);
    }
  }
  return [...new Set(out)];
}

// The README's "What you get" table has a row for every skill and command.
function readmeTable(t) {
  const out = [];
  const table = section(t.get('README.md') ?? '', /^## What you get/, /^## (?!What you get)/);
  if (table === null) return ['README.md: no "What you get" section'];
  const cells = table.split('\n').filter((l) => l.startsWith('|')).map((l) => l.split('|')[1] ?? '');
  const named = new Set(cells.flatMap((c) => [...c.matchAll(/`\/?([a-z][a-z-]*)`/g)].map((m) => m[1])));
  for (const n of [...skillNames(t), ...commandNames(t)]) {
    if (!named.has(n)) out.push(`README.md's "What you get" table has no row for ${n}`);
  }
  const real = new Set([...skillNames(t), ...commandNames(t)]);
  for (const n of named) if (!real.has(n)) out.push(`README.md's "What you get" table names ${n}, which is no skill or command here`);
  return out;
}

// A user-only skill's description is not in Claude's context, so the addendum must list it by name.
function userOnly(t) {
  const out = [];
  const list = section(t.get(ADDENDUM) ?? '', /^## User-only skills/, /^(## |<!--)/);
  if (list === null) return [`${ADDENDUM}: no "User-only skills" section`];
  const files = [...skillNames(t).map((n) => [n, `skills/${n}/SKILL.md`]), ...commandNames(t).map((n) => [n, `commands/${n}.md`])];
  for (const [n, p] of files) {
    if (/^disable-model-invocation: true$/m.test(frontmatter(t.get(p))) && !list.includes(`\`/${n}\``)) {
      out.push(`${p} is user-only, and ${ADDENDUM}'s "User-only skills" list does not name /${n}`);
    }
  }
  return out;
}

// A cited floor item exists in the charter template, and setup's list of the floor has the same numbers.
function floor(t) {
  const out = [];
  const items = (text) => new Set([...(text ?? '').matchAll(/^(\d)\. /gm)].map((m) => m[1]));
  const charter = items(section(t.get(CHARTER) ?? '', /^## Practice floor/, /^## (?!Practice floor)/));
  if (charter.size === 0) return [`${CHARTER}: no numbered "Practice floor" section`];
  for (const p of prose(t)) {
    for (const m of t.get(p).matchAll(/\bfloor(?:[ -]item)?[ -](\d)\b/gi)) {
      if (!charter.has(m[1])) out.push(`${p} cites floor item ${m[1]}; ${CHARTER} has none`);
    }
  }
  const round = items(section(t.get(SETUP) ?? '', /^## 4\. Round 2/, /^## 5\./));
  const differ = [...charter].filter((n) => !round.has(n)).concat([...round].filter((n) => !charter.has(n)));
  if (differ.length) out.push(`${SETUP} Round 2 and ${CHARTER} differ on floor item(s) ${[...new Set(differ)].sort().join(', ')}`);
  return [...new Set(out)];
}

// The house rule for public text.
function emDash(t) {
  return [...t.keys()].filter((p) => t.get(p).includes(EM_DASH)).map((p) => `${p} holds an em dash`);
}

// A number the prose repeats from a script or a template is the same number, and a template fits its own cap.
function numbers(t) {
  const out = [];
  const first = (file, re) => re.exec((t.get(file) ?? '').replace(/\s+/g, ' '))?.[1] ?? null;
  const same = (what, pairs) => {
    const got = pairs.map(([file, re]) => [file, first(file, re)]);
    for (const [file, v] of got) if (v === null) out.push(`${what}: no number found in ${file}`);
    const values = new Set(got.map(([, v]) => v).filter((v) => v !== null));
    if (values.size > 1) out.push(`${what}: ${got.map(([file, v]) => `${file} says ${v}`).join(', ')}`);
    return got[0][1];
  };
  same('days before a showcase branch is flagged', [['scripts/ground-truth.sh', /SHOWCASE_DAYS=(\d+)/], ['commands/handoff.md', /showcase branches older than (\d+) days/]]);
  const stripped = (file) => (t.get(file) ?? '').replace(/<!--[\s\S]*?-->\r?\n?/g, '').split(/\r?\n/).length - 1;
  for (const [file, what, setupRe] of [[CHARTER, 'the charter', /charter under about (\d+)/], [ADDENDUM, 'the addendum', /addendum under about (\d+)/]]) {
    const cap = same(`line cap for ${what}`, [[file, /stays under about (\d+) lines/], [SETUP, setupRe]]);
    // "About": a tenth over still reads as the cap; more does not.
    if (cap !== null && stripped(file) > Number(cap) * 1.1) out.push(`${file} has ${stripped(file)} lines outside its comments; its cap is about ${cap}`);
  }
  return out;
}

// A license a skill's frontmatter points to is a file.
function licenses(t) {
  const out = [];
  for (const name of skillNames(t)) {
    const p = `skills/${name}/SKILL.md`;
    for (const m of frontmatter(t.get(p)).matchAll(/(?:(scripts)\/)?\b(LICENSE(?:-[a-z]+)?)\b/g)) {
      const file = m[1] ? `scripts/${m[2]}` : `skills/${name}/${m[2]}`;
      if (!t.has(file)) out.push(`${p} points to ${m[2]}; ${file} does not exist`);
    }
  }
  return [...new Set(out)];
}

// A skill is found by its folder, so its name is the folder's.
function names(t) {
  const out = [];
  for (const [dir, list] of [['skills', skillNames(t)], ['.claude/skills', localSkillNames(t)]]) {
    for (const n of list) {
      const m = /^name: (.+)$/m.exec(frontmatter(t.get(`${dir}/${n}/SKILL.md`)));
      if (!m) out.push(`${dir}/${n}/SKILL.md: no name in its frontmatter`);
      else if (m[1].trim() !== n) out.push(`${dir}/${n}/SKILL.md is named ${m[1].trim()} in its frontmatter`);
    }
  }
  return out;
}

// /perturb's own text names the tools its guard lets through; each is on the guard's list, and each tool on
// the list that reads, writes or runs is named.
function guardTools(t) {
  const out = [];
  const skill = (t.get('skills/perturb/SKILL.md') ?? '').replace(/\s+/g, ' ');
  const said = /It lets through only ([A-Za-z, ]+?), the frames skill/.exec(skill);
  const block = /const SAFE = \{([\s\S]*?)\n\};/.exec(t.get(GUARD) ?? '');
  if (!said) return ['skills/perturb/SKILL.md: no "It lets through only ..., the frames skill" sentence'];
  if (!block) return [`${GUARD}: no SAFE list`];
  const safe = new Map([...block[1].matchAll(/([A-Za-z_]+): '([a-z]+)'/g)].map((m) => [m[1], m[2]]));
  const named = said[1].split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of named) if (!safe.has(n)) out.push(`skills/perturb/SKILL.md says the guard lets ${n} through; ${GUARD}'s list lacks it`);
  for (const [tool, kind] of safe) {
    if (['read', 'write', 'bash'].includes(kind) && !tool.startsWith('mcp__') && !named.includes(tool)) {
      out.push(`${GUARD} lets ${tool} through; skills/perturb/SKILL.md does not name it`);
    }
  }
  return out;
}

// setup's update mode keeps every file that runs a script in step with scripts/: a skill or command that names
// a script by its installed path is on that list.
function moveTogether(t) {
  const out = [];
  const rule = /`\*-examples\.md` files[\s\S]*?move together/.exec(t.get(SETUP) ?? '');
  if (!rule) return [`${SETUP}: no "move together" rule in update mode`];
  const files = [...skillNames(t).map((n) => [`skills/${n}`, `skills/${n}/SKILL.md`]), ...commandNames(t).map((n) => [`commands/${n}.md`, `commands/${n}.md`])];
  for (const [unit, p] of files) {
    if (/~\/\.claude\/scripts\//.test(t.get(p)) && !rule[0].includes(`\`${unit}\``)) {
      out.push(`${p} runs a script under ~/.claude/scripts, and ${SETUP}'s "move together" rule does not name ${unit}`);
    }
  }
  return out;
}

// Not a failure: the maintainer's own pending step, named so it is not forgotten.
function records(t, note) {
  const none = /\*\*Living plan, archival spec, ledger:\*\* none in this repository/.test((t.get('CLAUDE.md') ?? '').replace(/\s+/g, ' '));
  const held = [...t.keys()].filter(isRecord);
  if (none && held.length) note(`CLAUDE.md says this repository holds no plan; docs/ holds ${held.length} file(s): ${held.join(', ')}`);
  return [];
}

export const CHECKS = [
  ['every suite is named where the verification is described', suites],
  ['relative links resolve', links],
  ['cited examples exist', examples],
  ['named scripts exist', scripts],
  ['named slash commands exist', commands],
  ['the README table lists every skill and command', readmeTable],
  ['user-only skills are listed in the addendum', userOnly],
  ['cited floor items exist', floor],
  ['no em dash', emDash],
  ['repeated numbers agree, and templates fit their caps', numbers],
  ['licenses pointed to exist', licenses],
  ['skill names match their folders', names],
  ["the guard's tool list matches /perturb's text", guardTools],
  ['files that run scripts move with scripts/', moveTogether],
  ['records the repository says it does not hold', records],
];

// Run every check on a tree; a check that throws is a failure of that check, never a pass.
export function audit(tree) {
  const results = [];
  const notes = [];
  for (const [name, check] of CHECKS) {
    let problems;
    try { problems = check(tree, (n) => notes.push(n)); } catch (e) { problems = [`the check could not run: ${e.message}`]; }
    results.push({ name, problems });
  }
  return { results, notes, failed: results.some((r) => r.problems.length) };
}

// The tracked files and the new ones not ignored, as text.
export function readTree(root) {
  const list = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  const tree = new Map();
  for (const p of list.split('\0').filter(Boolean)) {
    try { tree.set(p, readFileSync(join(root, p), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return tree;
}

function main(argv) {
  const root = argv[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const { results, notes, failed } = audit(readTree(root));
  for (const r of results) {
    if (r.problems.length === 0) console.log(`ok    ${r.name}`);
    for (const p of r.problems) console.log(`FAIL  ${r.name}: ${p}`);
  }
  for (const n of notes) console.log(`note  ${n}`);
  console.log(failed ? '\nself-audit: FAILED' : '\nself-audit: all checks passed');
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`self-audit: could not run: ${e.message}`);
    process.exitCode = 2;
  }
}
