// guard-oracle.mjs: compare perturb-guard.mjs with the shell it models, over generated commands.
//
// The guard decides from a command's text where bash will be when a removal, a write or a push runs. This
// script asks bash itself. It builds a throwaway home folder with a canary config file and two throwaway
// repositories, generates Bash commands from a small grammar (cd in every form the guard reads, the words that
// run or skip a command, groups, subshells, substitutions, functions, every separator), runs each one in real
// bash, and records what happened: whether the canary changed, and whether git ran in the repository whose
// current branch is the default one. Then it asks the guard about the same text, from the same folder.
//
// One invariant, checked one way: a command that damaged the canary, or ran its push where the default branch
// is checked out, must have been refused. A refusal of a harmless command is counted, not failed: the guard is
// allowed to be strict. The canary lives in a throwaway home; generated commands name paths only inside the
// sandbox, and the payloads are `rm CLAUDE.md`, a redirect to it, and `git push origin HEAD` with a stand-in
// git first on PATH (it records its folder and pushes nothing).
//
// Usage: node scripts/guard-oracle.mjs [--n <random cases>] [--seed <n>] [--guard <path>] [--json <file>]
//          [--replay <path>]... [--known] [--all] [--no-exhaust] [--narrow] [--keep]
//   --guard  the guard to ask (default: perturb-guard.mjs beside this file); an older copy replays history.
//   --replay an older guard to ask about the same harmful commands, after the first; may repeat.
//   --known  also generate the forms the guard's own list of misses names (bare cd, pushd, popd, cd -).
// Exit 0 = no violation; 1 = at least one, each printed shortest first, or a command that left the sandbox (it
// is stopped before it acts there); 2 = the oracle could not run.
// Needs bash and git on PATH. Exports run() for the test beside it.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === 'win32';
const fwd = (p) => p.replace(/\\/g, '/');

// A small seeded generator (mulberry32), so a run is repeatable from its seed.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the sandbox

function sh(cwd, env, cmd, ...args) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr || r.error}`);
  return r.stdout.trim();
}

// Containment. A generated command runs in real bash, so it must not be able to act outside the sandbox T.
// Three things hold that, each alone enough for the forms generated today:
// - depth: everything sits DEPTH folders below T, and a command with more than MAX_UPS `..` in it is dropped,
//   so no chain of `cd ..` (and a payload's `../`) climbs out of T;
// - the launch folder: the driver runs from a folder at that same depth, so `cd -` (bash's OLDPWD) lands
//   there, not in the folder this script was started from;
// - a tripwire: a DEBUG trap, inherited by functions and subshells, runs before every command of a case and
//   ends that shell if its folder is not under T, before the command runs. A case it ended is counted as left.
// The first version had none of the three in full: run with --known from a repository's root, its `cd -`
// followed OLDPWD there and `rm CLAUDE.md` removed that repository's own file.
const DEPTH = 8;
const MAX_UPS = 6;
export function makeSandbox() {
  const T = fwd(realpathSync.native(mkdtempSync(join(tmpdir(), 'guard-oracle-'))));
  const Y = `${T}/${Array.from({ length: DEPTH }, (_, i) => `d${i + 1}`).join('/')}`;
  const s = { T, Y, home: `${Y}/home`, C: `${Y}/home/.claude`, O: `${Y}/other`, R1: `${Y}/r1`, R2: `${Y}/r2`,
    M: `${Y}/missing`, F: `${Y}/file`, bin: `${T}/fakebin`, where: `${T}/where`, cases: `${T}/cases` };
  s.launch = `${Y}/launch`;
  for (const d of [s.C, s.O, s.bin, s.cases, s.launch]) mkdirSync(d, { recursive: true });
  for (const d of [s.C, s.O]) mkdirSync(`${d}/sub`);
  writeFileSync(s.F, 'a file, not a folder\n');
  s.env = { ...process.env, HOME: s.home, USERPROFILE: s.home, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't', GIT_CONFIG_NOSYSTEM: '1', GIT_CEILING_DIRECTORIES: T };
  delete s.env.CDPATH;
  delete s.env.OLDPWD;
  // r1 has the default branch (trunk) checked out, r2 a feature branch; both push to one bare origin.
  sh(Y, s.env, 'git', 'init', '-q', '--bare', 'origin.git');
  sh(Y, s.env, 'git', 'init', '-q', 'r1');
  sh(s.R1, s.env, 'git', 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
  writeFileSync(`${s.R1}/a.txt`, 'clean\n');
  sh(s.R1, s.env, 'git', 'add', 'a.txt');
  sh(s.R1, s.env, 'git', 'commit', '-qm', 'first');
  sh(s.R1, s.env, 'git', 'remote', 'add', 'origin', `${Y}/origin.git`);
  sh(s.R1, s.env, 'git', 'push', '-q', 'origin', 'trunk');
  sh(s.R1, s.env, 'git', 'remote', 'set-head', 'origin', 'trunk');
  sh(Y, s.env, 'git', 'clone', '-q', `${Y}/origin.git`, 'r2');
  sh(s.R2, s.env, 'git', 'checkout', '-q', '-b', 'feat');
  for (const d of [s.R1, s.R2]) mkdirSync(`${d}/sub`);
  writeFileSync(`${s.R1}/.danger`, '');
  // The stand-in git: says whether it ran in r1 (or r1/sub), and pushes nothing.
  writeFileSync(`${s.bin}/git`, '#!/bin/sh\nif [ -e .danger ] || [ -e ../.danger ]; then echo danger; else echo safe; fi >"$ORACLE_WHERE"\n');
  chmodSync(`${s.bin}/git`, 0o755);
  writeFileSync(`${T}/driver.sh`, DRIVER);
  // Another spelling of the config folder, for the write tools: a junction on Windows, a symlink elsewhere.
  s.link = `${Y}/link-c`;
  symlinkSync(s.C, s.link, 'junction');
  // The other spellings bash takes for one folder (Windows only): /c/..., and the mount form cygpath prints.
  s.spell = (p) => {
    if (!WIN) return [p];
    const u = spawnSync('bash', ['-c', 'cygpath -u -- "$1"', 'cygpath', p], { env: s.env, encoding: 'utf8' }).stdout?.trim();
    return [...new Set([p, p.replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`), u || p])];
  };
  s.have = (prog) => spawnSync('bash', ['-c', `command -v ${prog}`], { env: s.env }).status === 0;
  return s;
}

// The bash side. For each case file: put the canaries back, run the case from its start folder in a subshell,
// wait for what it left in the background, and print <index> <1 if the canary is damaged> <where git ran>.
const DRIVER = `#!/usr/bin/env bash
# usage: driver.sh <sandbox> <from> <to>, run from the launch folder, with ORACLE_Y the folder that holds the rest
T=$1
C="$ORACLE_Y/home/.claude"
O="$ORACLE_Y/other"
export ORACLE_WHERE="$T/where"
LEFT="$T/left"
# The sandbox in every spelling bash may give its folder after a generated cd: as bash itself prints it, and
# each spelling the generator uses (ORACLE_IN, one a line: on Windows the /c/ form and the mount form).
INS=("$(cd "$T" && pwd)" "$(cd "$T" && pwd -P)")
while IFS= read -r line; do [ -n "$line" ] && INS+=("$line"); done <<<"$ORACLE_IN"
inside() {
  local p
  for p in "\${INS[@]}"; do case $PWD in "$p" | "$p"/*) return 0 ;; esac; done
  return 1
}
inside || { echo "the driver itself was not started inside the sandbox" >&2; exit 4; }
# In bash's own spelling: on Windows a C:/ entry would split at its colon and the stand-in would never be found.
PATH="$(cd "$T/fakebin" && pwd):$PATH"
[ "$(command -v git)" = "$(cd "$T/fakebin" && pwd)/git" ] || { echo "the stand-in git is not first on PATH" >&2; exit 3; }
for ((i = $2; i < $3; i++)); do
  f="$T/cases/$i"
  IFS= read -r start <"$f.start"
  printf 'canary\\n' >"$C/CLAUDE.md"
  printf 'plain\\n' >"$O/CLAUDE.md"
  : >"$ORACLE_WHERE"
  : >"$LEFT"
  ( cd "$start" && {
      set -o functrace
      trap 'inside || { echo left >"$LEFT"; exit 97; }' DEBUG
      . "$f"
      wait
    } ) </dev/null >/dev/null 2>&1
  dmg=0
  { [ -f "$C/CLAUDE.md" ] && [ "$(<"$C/CLAUDE.md")" = canary ]; } || dmg=1
  printf '%s\\t%s\\t%s\\t%s\\n' "$i" "$dmg" "$(<"$ORACLE_WHERE")" "$(<"$LEFT")"
done
`;

// ---- the grammar

const SEPS = ['; ', '; ', ' && ', ' || ', ' | ', ' & ', '\n'];
const CD = [(d) => `cd ${d}`, (d) => `cd ${d}`, (d) => `cd ${d}`, (d) => `cd ${d}`, (d) => `cd -P ${d}`,
  (d) => `cd -L ${d}`, (d) => `cd -- ${d}`, (d) => `cd -@ ${d}`, (d) => `cd ${d} ${d}`];
// What the guard's own list of misses names: forms of moving it does not follow.
const KNOWN_CD = [() => 'cd', () => 'cd -', (d) => `pushd ${d}`, () => 'popd'];
const GROUPS = [
  (x) => `( ${x} )`, (x) => `{ ${x}; }`,
  (x) => `if true; then ${x}; fi`, (x) => `if false; then ${x}; fi`,
  (x) => `if ${x}; then true; fi`, (x) => `if ! ${x}; then true; fi`,
  (x) => `if false; then true; else ${x}; fi`, (x) => `if true; then true; else ${x}; fi`,
  (x) => `if false; then true; elif ${x}; then true; fi`,
  (x) => `while ${x}; do break; done`, (x) => `while true; do ${x}; break; done`,
  (x) => `until ${x}; do break; done`, (x) => `for i in 1; do ${x}; done`,
  (x) => `case x in x) ${x};; esac`, (x) => `case x in y) ${x};; esac`,
  (x) => `echo "$(${x})"`, (x) => `echo $(${x})`,
  (x) => `f() { ${x}; }; f`, (x) => `f() { ${x}; }`,
  (x) => `{ ${x}; } | cat`, (x) => `true | { ${x}; }`,
];

// A generator of cases for one family: `rm` (the canary, from the config folder or the other one) or `push`
// (from r1 or r2). A is the folder where the payload does harm, B its harmless twin.
function grammar(s, rand, { known = false } = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const wraps = ['', '', '', '', '', 'command ', 'builtin ', 'time ', '! ',
    ...['nohup', 'env', 'nice'].filter(s.have).map((w) => `${w} `), ...(s.have('timeout') ? ['timeout 5 '] : [])];
  const q = (p) => `"${p}"`;
  const make = (family) => {
    const [A, B] = family === 'rm' ? [s.C, s.O] : [s.R1, s.R2];
    const targets = [...s.spell(A).map(q), ...s.spell(A).map(q), ...s.spell(B).map(q), q(s.M), q(s.F), 'sub', '..'];
    const payloads = family === 'rm' ? ['rm CLAUDE.md', 'rm CLAUDE.md', 'echo x > CLAUDE.md', 'rm ../CLAUDE.md'] : ['git push origin HEAD'];
    const cds = known ? [...CD, ...KNOWN_CD] : CD;
    const unit = () => {
      const r = rand();
      if (r < 0.12) return 'true';
      if (r < 0.24) return 'false';
      return pick(wraps) + pick(cds)(pick(targets));
    };
    const item = (depth) => (depth > 0 && rand() < 0.35 ? pick(GROUPS)(seq(depth - 1, 1 + Math.floor(rand() * 2))) : unit());
    const seq = (depth, n) => {
      let out = item(depth);
      for (let i = 1; i < n; i++) out += pick(SEPS) + item(depth);
      return out;
    };
    return () => {
      const start = rand() < 0.5 ? A : B;
      const n = 1 + Math.floor(rand() * 3);
      const p = pick(payloads);
      const r = rand();
      let command;
      if (r < 0.7) command = seq(1, n) + pick(SEPS) + p;
      else if (r < 0.85) command = pick(GROUPS)(seq(1, n) + pick(SEPS) + p);
      else command = seq(1, 1) + pick(SEPS) + pick(GROUPS)(seq(0, n) + pick(SEPS) + p);
      return { family, start, command };
    };
  };
  return { rm: make('rm'), push: make('push') };
}

// The short strings, all of them: one unit, every separator, the payload, from both start folders; and the plain
// cd in each group, with the payload after the group and inside it. Kept to about a thousand commands, since
// real bash runs every one: each wrapper with each cd form to the harmful folder, its twin, a missing folder and
// a subfolder (rm), or with a plain cd to the first three (push).
function exhaustive(s, { known = false, wide = true } = {}) {
  const out = [];
  const q = (p) => `"${p}"`;
  const wraps = wide ? ['', 'command ', 'builtin ', 'time ', '! ', ...['nohup', 'env', 'nice'].filter(s.have).map((w) => `${w} `)]
    : ['', 'command ', '! ', ...['nohup'].filter(s.have).map((w) => `${w} `)];
  const seps = [...new Set(SEPS)];
  const groups = [GROUPS[0], GROUPS[1], GROUPS[3], GROUPS[4], GROUPS[6], GROUPS[15], GROUPS[17], GROUPS[18], GROUPS[19]];
  for (const family of ['rm', 'push']) {
    const [A, B] = family === 'rm' ? [s.C, s.O] : [s.R1, s.R2];
    const p = family === 'rm' ? 'rm CLAUDE.md' : 'git push origin HEAD';
    const forms = family !== 'rm' ? [CD[0]] : wide ? [CD[0], CD[4], CD[7], CD[8]] : [CD[0], CD[7]];
    const targets = family === 'rm' ? [q(A), q(B), q(s.M), 'sub'] : [q(A), q(B), q(s.M)];
    const units = ['true', 'false'];
    for (const w of wraps) for (const c of forms) for (const d of targets) units.push(w + c(d));
    if (known) for (const c of KNOWN_CD) for (const d of [q(A), q(B)]) units.push(c(d));
    for (const u of new Set(units)) for (const sep of seps) for (const start of [A, B]) out.push({ family, start, command: u + sep + p });
    const plain = [...s.spell(A).map((d) => `cd ${q(d)}`), `cd ${q(B)}`, ...(known ? KNOWN_CD.map((c) => c(q(A))) : [])];
    // Two cds before a push, joined by ; && and ||, with and without !: which repository bash is left in is
    // the whole question for a push, and one cd does not ask it.
    if (family === 'push') {
      const two = [`cd ${q(A)}`, `cd ${q(B)}`, `! cd ${q(A)}`, ...(wide ? [`! cd ${q(B)}`, `cd ${q(s.M)}`] : [])];
      for (const a of two) for (const b of two) for (const j of ['; ', ' && ', ' || ']) for (const k of ['; ', ' && ']) for (const start of [A, B]) {
        out.push({ family, start, command: a + j + b + k + p });
      }
    }
    for (const u of new Set(plain)) for (const g of groups) for (const start of [A, B]) {
      out.push({ family, start, command: g(u) + '; ' + p }, { family, start, command: g(u + '; ' + p) });
    }
  }
  return out;
}

// The write tools take a path, not a command: the guard reads its spelling, and the disk decides where the
// write lands. Every spelling here names the canary or a harmless file beside it; the oracle writes through
// node's own fs, from the start folder, and looks at the canary. Windows drops a trailing dot or space and
// reads ::$DATA as the file itself, and folds case, so those spellings are tried there only.
function toolCases(s) {
  const target = `${s.C}/CLAUDE.md`;
  const abs = [target, `${s.C}/sub/../CLAUDE.md`, `${s.C}/./CLAUDE.md`, `${s.C}//CLAUDE.md`, `${s.link}/CLAUDE.md`,
    `${s.link}/sub/../CLAUDE.md`, `${s.home}/../home/.claude/CLAUDE.md`, `${s.O}/CLAUDE.md`, `${s.C}/notes.md`];
  const rel = ['CLAUDE.md', './CLAUDE.md', 'sub/../CLAUDE.md', '../.claude/CLAUDE.md', 'notes.md'];
  if (WIN) {
    const native = target.replace(/\//g, '\\');
    abs.push(native, target.replace(/^[A-Za-z]:/, ''), native.replace(/^[A-Za-z]:/, ''), target.toUpperCase(), target.toLowerCase(),
      `\\\\?\\${native}`, `${target}.`, `${target} `, `${target}::$DATA`, ...s.spell(s.C).map((d) => `${d}/CLAUDE.md`));
  }
  const out = [];
  for (const p of new Set(abs)) for (const tool of ['Write', 'Edit']) out.push({ family: 'write', start: s.O, tool, path: p, command: `${tool} ${p}` });
  for (const p of rel) out.push({ family: 'write', start: s.C, tool: 'Write', path: p, command: `Write ${p}` });
  out.push({ family: 'write', start: s.O, tool: 'Write', path: '../home/.claude/CLAUDE.md', command: 'Write ../home/.claude/CLAUDE.md' });
  return out;
}
function runWrites(s, cases) {
  const canary = `${s.C}/CLAUDE.md`;
  for (const c of cases) {
    writeFileSync(canary, 'canary\n');
    try { writeFileSync(resolve(c.start, c.path), 'written\n'); } catch { /* a path the disk refuses harms nothing */ }
    let now = null;
    try { now = readFileSync(canary, 'utf8'); } catch { /* gone */ }
    c.harm = now !== 'canary\n';
    c.ran = true;
  }
  writeFileSync(canary, 'canary\n');
}

// ---- running

function runBash(s, cases) {
  cases.forEach((c, i) => {
    writeFileSync(`${s.cases}/${i}`, c.command + '\n');
    writeFileSync(`${s.cases}/${i}.start`, c.start + '\n');
  });
  // In chunks, so one hung case costs a chunk and names itself, not the run.
  const CHUNK = 200;
  for (let from = 0; from < cases.length; from += CHUNK) {
    const to = Math.min(cases.length, from + CHUNK);
    const r = spawnSync('bash', [`${s.T}/driver.sh`, s.T, String(from), String(to)],
      { cwd: s.launch, env: { ...s.env, ORACLE_Y: s.Y, ORACLE_IN: s.spell(s.T).join('\n') }, encoding: 'utf8', timeout: 300000 });
    for (const line of (r.stdout || '').split('\n')) {
      const [i, dmg, where, left] = line.split('\t');
      if (!/^\d+$/.test(i)) continue;
      cases[Number(i)].harm = dmg === '1' || where === 'danger';
      cases[Number(i)].left = left === 'left';
      cases[Number(i)].ran = true;
    }
    if (r.error || r.status !== 0) {
      const stuck = cases.slice(from, to).find((c) => !c.ran);
      throw new Error(`the bash driver stopped in cases ${from} to ${to}${stuck ? ` at: ${JSON.stringify(stuck.command)}` : ''}: ${r.error?.message ?? r.stderr}`);
    }
  }
}

// The guard's verdict on each case, as the hook would get it: the real process, eight at a time.
function askGuard(s, guard, cases, jobs = 8) {
  let next = 0;
  const one = (c) => new Promise((done) => {
    const p = spawn(process.execPath, [guard], { env: s.env, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      c.verdict = code === 0 ? 'allowed' : /^perturb-guard: refused /.test(err) ? 'refused' : 'undecided';
      c.why = err.trim();
      done();
    });
    const call = c.tool ? { tool_name: c.tool, tool_input: { file_path: c.path, content: 'x', old_string: 'a', new_string: 'b' } }
      : { tool_name: 'Bash', tool_input: { command: c.command } };
    p.stdin.end(JSON.stringify({ session_id: 's', cwd: c.start, ...call }));
  });
  const worker = async () => { while (next < cases.length) await one(cases[next++]); };
  return Promise.all(Array.from({ length: jobs }, worker));
}

// Generate, run in bash, ask the guard about every case bash was harmed by (and, with all, the rest too).
export async function run({ n = 400, seed = 1, guard = join(HERE, 'perturb-guard.mjs'), known = false, all = false,
  exhaust = true, wide = true, keep = false, sandbox = null, replay = [], extra = [] } = {}) {
  const s = sandbox ?? makeSandbox();
  try {
    const g = grammar(s, prng(seed), { known });
    const cases = exhaust ? exhaustive(s, { known, wide }) : [];
    for (let i = 0; i < n; i++) cases.push(i % 3 === 2 ? g.push() : g.rm());
    const seen = new Set();
    const ups = (c) => (c.command.match(/\.\./g) ?? []).length;
    const unique = [...cases, ...(typeof extra === 'function' ? extra(s) : extra)].filter((c) => { const k = `${c.start}\n${c.command}`; return (c.escape || ups(c) <= MAX_UPS) && !seen.has(k) && seen.add(k); });
    runBash(s, unique);
    const writes = toolCases(s);
    runWrites(s, writes);
    unique.push(...writes);
    const harmful = unique.filter((c) => c.harm);
    await askGuard(s, guard, all ? unique : harmful);
    const violations = harmful.filter((c) => c.verdict === 'allowed').sort((a, b) => a.command.length - b.command.length);
    const strict = all ? unique.filter((c) => !c.harm && c.verdict !== 'allowed').length : null;
    const names = s.spell(s.Y).sort((a, b) => b.length - a.length);
    const plain = (text) => names.reduce((x, name) => x.split(name).join('<sandbox>'), text);
    const tidy = (c) => ({ family: c.family, from: plain(c.start), command: plain(c.command), harm: c.harm, verdict: c.verdict });
    // Older guards, asked about the same harmful commands: what this run would have found at each.
    const history = [];
    for (const old of replay) {
      const again = harmful.map((c) => ({ ...c }));
      await askGuard(s, old, again);
      history.push({ guard: old, violations: again.filter((c) => c.verdict === 'allowed').sort((a, b) => a.command.length - b.command.length).map(tidy) });
    }
    const families = {};
    for (const c of harmful) families[c.family] = (families[c.family] ?? 0) + 1;
    return { history, families, cases: unique.length, harmful: harmful.length, violations: violations.map(tidy), harmless: unique.length - harmful.length,
      strict, left: unique.filter((c) => c.left).map(tidy), undecided: unique.filter((c) => c.verdict === 'undecided').length, all: all ? unique.map(tidy) : undefined };
  } finally {
    if (!keep && !sandbox) rmSync(s.T, { recursive: true, force: true });
  }
}

// ---- command line

async function main(argv) {
  const opt = { n: 400, seed: 1 };
  let json = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') opt.n = Number(argv[++i]);
    else if (a === '--seed') opt.seed = Number(argv[++i]);
    else if (a === '--guard') opt.guard = argv[++i];
    else if (a === '--replay') (opt.replay ??= []).push(argv[++i]);
    else if (a === '--json') json = argv[++i];
    else if (a === '--known') opt.known = true;
    else if (a === '--all') opt.all = true;
    else if (a === '--keep') opt.keep = true;
    else if (a === '--no-exhaust') opt.exhaust = false;
    else if (a === '--narrow') opt.wide = false;
    else { console.error(`guard-oracle: unknown argument ${a}`); return 2; }
  }
  const t0 = Date.now();
  const r = await run(opt);
  if (json) writeFileSync(json, JSON.stringify(r, null, 1));
  console.log(`guard-oracle: ${r.cases} commands run in bash, ${r.harmful} did harm (${Object.entries(r.families).map(([k, v]) => `${k} ${v}`).join(', ')}), ${r.violations.length} of those the guard let through`
    + (r.strict === null ? '' : `; of ${r.harmless} harmless ones it refused ${r.strict}`) + ` (${Math.round((Date.now() - t0) / 1000)} s, seed ${opt.seed})`);
  for (const v of r.left) console.log(`  LEFT THE SANDBOX, and was stopped there [from ${v.from}]: ${JSON.stringify(v.command)}`);
  for (const v of r.violations.slice(0, 40)) console.log(`  LET THROUGH [${v.family}, from ${v.from}]: ${JSON.stringify(v.command)}`);
  if (r.violations.length > 40) console.log(`  ... and ${r.violations.length - 40} more`);
  for (const h of r.history) console.log(`  replay ${h.guard}: ${h.violations.length} of the ${r.harmful} let through`);
  return r.violations.length || r.left.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(`guard-oracle: ${e.message}`); process.exitCode = 2; });
}
