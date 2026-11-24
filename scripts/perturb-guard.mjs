#!/usr/bin/env node
//
// perturb-guard.mjs: the PreToolUse hook /perturb registers from its frontmatter, for every tool, active from
// invocation to the end of that session. It lets through a named list of safe tools and refuses every other tool, MCP
// tools included (exit 2, reason on stderr). Of the safe tools, Edit, MultiEdit, Write and NotebookEdit are refused
// on a protected path, Skill runs only frames, the browser's computer tool only takes screenshots, and Bash is
// parsed: it refuses pushes to the default branch, force pushes, --all, --mirror, glob refspecs and push options it
// does not know, gh pr merge, deleting a remote branch outside showcase/, writes to or removal of the owner's
// protected config (checked in the starting folder and every folder a cd names), git commit -F - (a
// message from stdin is not scanned), a git commit or push after any command but a cd bash keeps (top level, ended by
// &&, ; or a newline) in the same call, a substitution's command included (the scan reads the repo before the call
// runs), a push or commit after a cd the guard cannot place or where git cannot answer, and a call with a quote or
// substitution left open.
// Paths compare in both their written and their real spelling (8.3 names, junctions and symlinks resolved). Before
// every other git commit it runs commit-scan.sh beside it, on the parsed messages, any -F file and the raw command.
// It is a tripwire, not a sandbox: a script Claude writes can still push or write anywhere.
//
// Fails closed: input it cannot read and any error it throws exit 2, since Claude Code lets a hook's other exit
// codes through.

import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WIN = process.platform === 'win32';
const HOME = homedir();
const CLAUDE = join(HOME, '.claude');
const HERE = dirname(fileURLToPath(import.meta.url));
// Under the hook's own timeout (30 s in the frontmatter), so the guard refuses before Claude Code stops it.
const SCAN_TIMEOUT_MS = Number(process.env.PERTURB_SCAN_TIMEOUT_MS) || 20000;

class Refusal extends Error {}
function refuse(what, why) {
  throw new Refusal(`perturb-guard: refused ${what}: ${why}. Ask the owner; if you approve, run it yourself.`);
}

// The tools let through, by what the guard checks: read (nothing), write (the path), bash (the parse), skill
// (frames only), look (the browser's computer tool: screenshot and zoom only), free (nothing to check). Every
// other tool is refused, the browser's clicks, typing, form input, page scripts and preview_start included.
const SAFE = {
  Read: 'read', Grep: 'read', Glob: 'read',
  Edit: 'write', MultiEdit: 'write', Write: 'write', NotebookEdit: 'write',
  Bash: 'bash',
  Skill: 'skill',
  TodoWrite: 'free', AskUserQuestion: 'free', ToolSearch: 'free', WebSearch: 'free', WebFetch: 'free',
  mcp__ccd_turn__update_plan: 'free', mcp__ccd_turn__wrap_up: 'free',
  mcp__Claude_Browser__navigate: 'read', mcp__Claude_Browser__read_page: 'read',
  mcp__Claude_Browser__get_page_text: 'read', mcp__Claude_Browser__find: 'read',
  mcp__Claude_Browser__resize_window: 'read', mcp__Claude_Browser__tabs_context: 'read',
  mcp__Claude_Browser__computer: 'look',
};
const LOOKS = new Set(['screenshot', 'zoom']);

// A path as the shell meant it: ~, $HOME and ${HOME} expanded, Git Bash's /c/... read as C:/... on Windows (and
// /c alone as C:/, not the current folder on C:), made absolute.
function toPath(p, cwd) {
  let s = String(p).replace(/^(~|\$HOME|\$\{HOME\})(?=$|[\\/])/, () => HOME);
  if (WIN) s = s.replace(/^\/([a-zA-Z])(?:\/|$)/, '$1:/');
  return resolve(cwd, s);
}
// The real path of the longest part of s that exists, with the rest added back: 8.3 short names, junctions and
// symlinks resolved, so those spellings of one file compare equal.
function real(s) {
  let head = s;
  const rest = [];
  for (;;) {
    try { return join(realpathSync.native(head), ...rest); } catch {}
    const up = dirname(head);
    if (up === head) return s;
    rest.unshift(basename(head));
    head = up;
  }
}
// A spelling in the one form paths compare in: forward slashes, lower case on Windows.
function form(s) {
  const f = s.replace(/\\/g, '/');
  return WIN ? f.toLowerCase() : f;
}
// The same path in both spellings it compares in: as written (made absolute) and real. A path is protected when any
// of its spellings meets any spelling of a rule: the real one alone would miss removing a folder that holds a link
// to config, since the rule then names the link's target.
function spellings(p, cwd) {
  const s = toPath(p, cwd);
  return [...new Set([form(s), form(real(s))])];
}

function git(cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}
const short = (ref) => ref.replace(/^refs\/heads\//, '');
// origin's HEAD, else main (the spec's fallback, kept as written).
function defaultBranch(repo) {
  const ref = git(repo, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD');
  return ref ? ref.slice(ref.indexOf('/') + 1) : 'main';
}
const currentBranch = (repo) => short(git(repo, 'symbolic-ref', '-q', 'HEAD'));

function protectedRules(cwd) {
  const rules = ['settings.json', 'settings.local.json', 'CLAUDE.md', 'PERSONAL-ADDENDUM.md', 'scan-patterns.local']
    .map((f) => ({ paths: spellings(join(CLAUDE, f), cwd) }));
  for (const d of [join(CLAUDE, 'scripts'), join(CLAUDE, 'skills', 'perturb')]) {
    rules.push({ paths: spellings(d, cwd), tree: true });
  }
  // Every checkout of the working repo, the main one and each worktree.
  for (const line of git(cwd, 'worktree', 'list', '--porcelain').split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    for (const f of ['settings.json', 'settings.local.json']) rules.push({ paths: spellings(join(line.slice(9), '.claude', f), cwd) });
  }
  return rules;
}
function isProtected(p, cwd, rules) {
  const ts = spellings(p, cwd);
  return rules.some((r) => r.paths.some((q) => ts.some((t) => t === q || (r.tree && t.startsWith(q + '/')))));
}
// Removing a folder removes what is under it; the root holds everything.
function holdsProtected(p, cwd, rules) {
  return isProtected(p, cwd, rules) || spellings(p, cwd).some((t) => {
    const base = t.endsWith('/') ? t : t + '/';
    return rules.some((r) => r.paths.some((q) => q.startsWith(base)));
  });
}
// A path with a glob: its literal parent, if protected, or a protected path under that parent whose next name the
// first globbed name could match (a leading dot only by a leading dot, as bash expands it).
function globHits(p, cwd, rules) {
  const s = String(p).replace(/\\/g, '/');
  const cut = s.lastIndexOf('/', s.search(/[*?[]/));
  const parent = cut < 0 ? '.' : s.slice(0, cut) || '/';
  const name = s.slice(cut + 1).split('/')[0];
  if (isProtected(parent, cwd, rules)) return true;
  const body = name.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\[!/g, '[^');
  const re = new RegExp(`^${name.startsWith('.') ? '' : '(?!\\.)'}${body}$`, WIN ? 'i' : '');
  return spellings(parent, cwd).some((t) => {
    const base = t.endsWith('/') ? t : t + '/';
    return rules.some((r) => r.paths.some((q) => q.startsWith(base) && re.test(q.slice(base.length).split('/')[0])));
  });
}
const hasGlob = (p) => /[*?[]/.test(p);

// A redirection operator, kept as its own token so no word can pass for one.
class Redir { constructor(op) { this.op = op; } }
const isRedir = (t) => t instanceof Redir;
const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '<>', '>&']);

// From the newline at i, skip a heredoc body to its delimiter line; return the index of that line's newline.
function skipBody(cmd, i, h) {
  let start = i + 1;
  while (start <= cmd.length) {
    let end = cmd.indexOf('\n', start);
    if (end < 0) end = cmd.length;
    const line = cmd.slice(start, end);
    if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) return end;
    start = end + 1;
  }
  return cmd.length;
}

// A shell command split into simple commands (on newlines, ;, &, |, parentheses) of tokens, quotes removed;
// redirections are Redir tokens, a descriptor number before one dropped. A # that starts a word begins a comment;
// a heredoc body is skipped to its delimiter line; a backslash before a newline joins the lines. Inside double
// quotes a backslash escapes only what bash lets it escape. The commands inside $(...), backticks, <(...) and
// >(...), quoted or not, are parsed as commands of their own, marked sub, and listed before the command that
// holds them, since bash runs them first; their text stays in the word. $((...)) parses the same way, so a << in
// it reaches no further than its closing parentheses. A quote or substitution left open refuses. Each simple
// command records the separator that ends it (&&, ||, | for | and |&, &, ;, a parenthesis, a newline or the end)
// and whether it sits inside parentheses.
function segments(cmd) {
  const segs = [];
  parse(cmd, 0, null, segs);
  return segs;
}
// Parse from i to the closer (null for the whole command, ')' or a backtick for a substitution); return the
// closer's index, or the command's length if there is none.
function parse(cmd, i, closer, segs) {
  let toks = [], cur = '', has = false, quoted = false, q = null, wantDelim = null, depth = 0;
  const here = [];
  const endTok = () => {
    if (has) {
      if (wantDelim) { wantDelim.delim = cur; wantDelim.quoted = quoted; here.push(wantDelim); wantDelim = null; }
      toks.push(cur);
    }
    cur = '';
    has = false;
    quoted = false;
  };
  const endSeg = (sep) => {
    endTok();
    if (toks.length) segs.push(Object.assign(toks, { sub: closer !== null, paren: depth > 0, sep }));
    toks = [];
  };
  // A substitution starting at j: its commands parsed, its text added to the word; returns its end.
  const subst = (j) => {
    const end = cmd[j] === '`' ? parse(cmd, j + 1, '`', segs) : parse(cmd, j + 2, ')', segs);
    if (end >= cmd.length) refuse('a command with a substitution left open', 'the guard cannot tell where it ends');
    cur += cmd.slice(j, end + 1);
    has = true;
    return end;
  };
  for (; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && cmd[i + 1] === '\n') i++;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length && '$`"\\'.includes(cmd[i + 1])) cur += cmd[++i];
      else if (q === '"' && (cmd.startsWith('$(', i) || c === '`')) i = subst(i);
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') { q = c; has = true; quoted = true; continue; }
    if (c === '\\' && cmd[i + 1] === '\n') { i++; continue; }
    if (c === '\\' && i + 1 < cmd.length) { cur += cmd[++i]; has = true; quoted = true; continue; }
    if (c === '`' && closer === '`') { endSeg('`'); return i; }
    if (cmd.startsWith('$(', i) || c === '`' || /^[<>]\(/.test(cmd.slice(i, i + 2))) { i = subst(i); continue; }
    if (c === '#' && !has) { while (i + 1 < cmd.length && cmd[i + 1] !== '\n') i++; continue; }
    if (c === '\n') {
      endSeg('\n');
      wantDelim = null;
      for (const h of here) i = skipBody(cmd, i, h);
      here.length = 0;
      continue;
    }
    const op = /^(&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<&|<>|<)/.exec(cmd.slice(i, i + 3));
    if (op) {
      if (has && /^[0-9]+$/.test(cur)) { cur = ''; has = false; } else endTok();
      const r = new Redir(op[1]);
      toks.push(r);
      if (op[1] === '<<' || op[1] === '<<-') wantDelim = r.h = { strip: op[1] === '<<-' };
      i += op[1].length - 1;
      continue;
    }
    if (c === ')' && closer === ')' && depth === 0) { endSeg(')'); return i; }
    if (';&|()'.includes(c)) {
      // A parenthesis ends the command before it at the depth outside it, and one inside it at the depth inside.
      const two = cmd.slice(i, i + 2);
      const sep = two === '&&' || two === '||' ? two : two === '|&' ? '|' : c;
      endSeg(sep);
      if (two === '&&' || two === '||' || two === '|&') i++;
      if (c === '(') depth++;
      if (c === ')' && depth > 0) depth--;
      continue;
    }
    if (/\s/.test(c)) { endTok(); continue; }
    cur += c;
    has = true;
  }
  if (q) refuse('a command with a quote left open', 'the guard cannot tell where it ends; for a long commit message, write it to a file and use -F');
  endSeg('end');
  return cmd.length;
}
// A substitution that only reads a heredoc with a quoted delimiter, as in "$(cat <<'EOF' ... EOF)": it runs
// nothing and expands nothing, so it may come before a commit.
const readsHeredoc = (toks) => toks.sub && toks.length === 3 && toks[0] === 'cat' && isRedir(toks[1]) && toks[1].h?.quoted === true;
// Reserved words that run the command after them.
const PREFIX = new Set(['{', 'if', 'then', 'elif', 'else', 'do', 'while', 'until', '!']);
// Wrappers that run the command after them, with their options that take a value.
const WRAP = {
  env: /^(-u|--unset|-C|--chdir|-S|--split-string)$/, timeout: /^(-s|--signal|-k|--kill-after)$/,
  nice: /^(-n|--adjustment)$/, sudo: /^(-u|--user|-g|--group)$/, exec: /^-a$/, command: null, builtin: null, time: null, nohup: null,
};

// The command's words: redirections and their targets dropped, then leading reserved words, env assignments and
// wrappers with their options (and timeout's duration). Marked reserved when a reserved word but { was dropped (the
// command may not run, or runs negated), and wrapped when a wrapper that runs a program was (bash runs a cd then as
// a program of its own, so it moves nothing); command, builtin and time run the builtin itself.
const RUNS_BUILTIN = new Set(['command', 'builtin', 'time']);
function words(toks) {
  const w = toks.filter((t, i) => !isRedir(t) && !isRedir(toks[i - 1]));
  for (;;) {
    const h = w[0];
    if (PREFIX.has(h) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(h ?? '')) {
      if (PREFIX.has(h) && h !== '{') w.reserved = true;
      w.shift();
      continue;
    }
    if (!Object.hasOwn(WRAP, h ?? '')) return w;
    if (!RUNS_BUILTIN.has(h)) w.wrapped = true;
    w.shift();
    while (w.length && /^-./.test(w[0])) {
      const o = w.shift();
      if (o === '--') break;
      if (WRAP[h]?.test(o)) w.shift();
    }
    if (h === 'timeout') w.shift();
  }
}

// Paths the command writes, paths it removes (rm's arguments, mv's sources), and folders a recursive cp fills.
function targets(toks) {
  const writes = [], removes = [], fills = [];
  toks.forEach((t, i) => {
    const to = toks[i + 1];
    if (isRedir(t) && WRITE_OPS.has(t.op) && typeof to === 'string' && !(t.op === '>&' && /^([0-9]+|-)$/.test(to))) {
      writes.push(to);
    }
  });
  const [cmd, ...args] = words(toks);
  const plain = args.filter((a) => !a.startsWith('-'));
  if (cmd === 'tee') writes.push(...plain);
  if (cmd === 'cp' || cmd === 'mv') {
    // The destination is -t's folder, else the last word; each source lands in it under its own name.
    let dest = null;
    const srcs = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-t' || a === '--target-directory') dest = args[++i];
      else if (a.startsWith('--target-directory=')) dest = a.slice(19);
      else if (/^-t./.test(a)) dest = a.slice(2);
      else if (!a.startsWith('-')) srcs.push(a);
    }
    if (dest == null) dest = srcs.pop();
    const landed = dest == null ? [] : srcs.map((s) => `${dest.replace(/[\\/]+$/, '')}/${basename(s)}`);
    if (dest != null) writes.push(dest, ...landed);
    // cp -r, -R or -a copies each source folder whole, so what lands may hold protected config.
    if (cmd === 'cp' && args.some((a) => a === '--recursive' || a === '--archive' || (/^-[a-zA-Z]*[rRa]/.test(a) && !a.startsWith('-t')))) {
      fills.push(...landed);
    }
    if (cmd === 'mv') removes.push(...srcs);
  }
  if (cmd === 'rm') removes.push(...plain);
  if (cmd === 'sed' && args.some((a) => /^-i/.test(a) || a.startsWith('--in-place')) && plain.length) {
    writes.push(plain[plain.length - 1]);
  }
  return { writes, removes, fills };
}

function gitArgs(w) {
  let i = 0, dir = null;
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C') { dir = w[i + 1]; i += 2; } else if (w[i] === '-c') i += 2; else i += 1;
  }
  return { sub: w[i], rest: w.slice(i + 1), dir };
}

// git push's options the guard knows: those that take a value (the next word, or after =), and those that take
// none. Any other option refuses, since the guard could not tell what the push would do.
const PUSH_VALUED = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
const PUSH_EQ = /^--(push-option|repo|receive-pack|exec|force-with-lease|signed|recurse-submodules)=/;
const PUSH_FLAGS = new Set(['--all', '--mirror', '-n', '--dry-run', '--porcelain', '-d', '--delete', '--tags',
  '--follow-tags', '--no-follow-tags', '--signed', '--no-signed', '--atomic', '--no-atomic', '-f', '--force',
  '--force-with-lease', '--no-force-with-lease', '--force-if-includes', '--no-force-if-includes', '-u',
  '--set-upstream', '--thin', '--no-thin', '-q', '--quiet', '-v', '--verbose', '--progress', '--no-progress',
  '--no-recurse-submodules', '--verify', '--no-verify', '-4', '--ipv4', '-6', '--ipv6']);
function pushArgs(rest) {
  const flags = [], pos = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') { pos.push(...rest.slice(i + 1)); break; }
    if (!a.startsWith('-') || a === '-') pos.push(a);
    else if (PUSH_VALUED.has(a)) i++;
    else if (PUSH_EQ.test(a) || PUSH_FLAGS.has(a)) flags.push(a);
    else if (/^-[^-]/.test(a)) {
      // A cluster of short options: o takes the rest of the cluster, or the next word.
      for (let j = 1; j < a.length; j++) {
        if (a[j] === 'o') { if (j === a.length - 1) i++; break; }
        if (!PUSH_FLAGS.has(`-${a[j]}`)) refuse(`git push ${a}`, `the guard does not know the option -${a[j]}`);
        flags.push(`-${a[j]}`);
      }
    } else refuse(`git push ${a}`, 'the guard does not know that option, so it cannot tell what the push would do');
  }
  return { flags, pos };
}

function checkPush(rest, repo) {
  const { flags, pos } = pushArgs(rest);
  if (flags.some((f) => f === '-f' || f === '--force' || f.startsWith('--force-with-lease'))) {
    refuse('a force push', 'force pushes are off under /perturb');
  }
  if (flags.some((f) => f === '--all' || f === '--mirror')) refuse('git push --all or --mirror', 'it would push the default branch');
  const del = flags.includes('-d') || flags.includes('--delete');
  const def = defaultBranch(repo);
  const refspecs = pos.slice(1);
  if (refspecs.length === 0) {
    if (!del && currentBranch(repo) === def) refuse(`git push on ${def}`, 'pushes to the default branch are off under /perturb');
    return;
  }
  for (const r of refspecs) {
    if (r.startsWith('+')) refuse('a force push', `the + refspec ${r} forces it`);
    if (r.includes('*')) refuse(`the glob refspec ${r}`, 'it could push the default branch');
    const colon = r.indexOf(':');
    const src = colon < 0 ? r : r.slice(0, colon);
    const dst = short(colon < 0 ? r : r.slice(colon + 1));
    if (del || (colon >= 0 && src === '')) {
      if (!dst.startsWith('showcase/')) refuse(`deleting remote branch ${dst}`, 'only showcase/ branches may be deleted under /perturb');
      continue;
    }
    const target = dst === 'HEAD' || dst === '@' ? currentBranch(repo) : dst;
    if (target === def) refuse(`git push to ${def}`, 'pushes to the default branch are off under /perturb');
  }
}

// The home folder in each spelling a command may use, so the raw command can be scanned without every path in it
// matching a home path or login name rule.
const homeRe = (() => {
  const fwd = HOME.replace(/\\/g, '/');
  const forms = [HOME, fwd, ...(WIN ? [fwd.replace(/^([A-Za-z]):/, (m, d) => `/${d}`)] : [])];
  return new RegExp(forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), WIN ? 'gi' : 'g');
})();

function checkCommit(rest, repo, command) {
  const msgs = [];
  let file = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--message') msgs.push(rest[++i] ?? '');
    else if (a.startsWith('--message=')) msgs.push(a.slice(10));
    else if (/^--file?$/.test(a)) file = rest[++i] ?? ''; // git takes --fil for --file
    else if (/^--file?=/.test(a)) file = a.slice(a.indexOf('=') + 1);
    else if (/^-[a-zA-Z]/.test(a)) {
      // A cluster of short options: m or F takes the rest of the cluster, or the next word.
      const k = a.search(/[mF]/);
      if (k < 0) continue;
      const v = k < a.length - 1 ? a.slice(k + 1) : rest[++i] ?? '';
      if (a[k] === 'm') msgs.push(v); else file = v;
    }
  }
  if (file === '-' || file === '/dev/stdin') refuse('git commit -F -', 'a message from stdin is not scanned; use -m or -F <file>');
  if (file !== null) {
    const p = toPath(file, repo); // git -C runs git in that folder, so -F is relative to it
    try { msgs.push(readFileSync(p, 'utf8')); } catch { refuse(`git commit -F ${file}`, `no message file at ${p} to scan`); }
  }
  // The raw command too: a message the parse does not read, such as one after git's abbreviation --mess, is still
  // scanned.
  msgs.push(command.replace(homeRe, '~'));
  const tmp = mkdtempSync(join(tmpdir(), 'perturb-msg-'));
  let r;
  try {
    writeFileSync(join(tmp, 'message'), msgs.join('\n\n'));
    r = spawnSync('bash', [join(HERE, 'commit-scan.sh'), repo, join(tmp, 'message')],
      { encoding: 'utf8', timeout: SCAN_TIMEOUT_MS });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (r.error?.code === 'ETIMEDOUT') refuse('git commit', `the scan did not finish in ${SCAN_TIMEOUT_MS / 1000} s`);
  if (r.status !== 0) {
    refuse('git commit', `commit-scan.sh exited ${r.status}:\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim()}\n`);
  }
}

// A cd bash keeps for the commands after it: top level (in no substitution and no parentheses) and ended by &&, ;,
// a newline or the end of the command. Any other cd is an ordinary command, so a commit or push after it is refused.
const KEEPS = new Set(['&&', ';', '\n', 'end']);
const keepsCd = (toks) => !toks.sub && !toks.paren && KEEPS.has(toks.sep);
// The folder a cd names: its options (-L, -P, -e and clusters of them) and a -- skipped. Any other word of two or
// more characters starting with - is an invalid option, and two operands are too many; after either bash moves
// nowhere, so the folder stays. A bare cd (home) is not followed; a lone - (bash's previous folder) is read as a
// folder named -, so it moves the folder only where one exists.
function cdTarget(rest) {
  let i = 0;
  while (/^-[LPe]+$/.test(rest[i] ?? '')) i++;
  if (rest[i] === '--') i++;
  else if (/^-./.test(rest[i] ?? '')) return '';
  return rest.length - i === 1 ? rest[i] : '';
}
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// Writes and removals are checked in every folder seen: the starting folder and each folder a cd names, resolved from
// every folder seen, since the guard cannot always tell whether bash ran a cd in its own shell (a list ended by &, a
// piped group). A cd ended by | or & runs in a shell bash throws away, and one run by a wrapper is a program of its
// own (another command); neither names a folder.
// A push or commit needs the one folder it runs in, cwds. A cd bash keeps, with no reserved word before it, while
// every command before it in the call was a cd that moved, moves each folder to its target where that is a folder;
// any other cd adds its targets, and a push or commit with more than one folder is refused.
function bash(command, start) {
  const rules = protectedRules(start);
  let cwds = [start];
  let other = false, placing = true;
  const seen = new Set(cwds);
  const anyHit = (check, t) => [...seen].some((c) => check(t, c, rules));
  for (const toks of segments(command)) {
    if (readsHeredoc(toks)) continue;
    const { writes, removes, fills } = targets(toks);
    for (const t of writes) {
      if (anyHit(hasGlob(t) ? globHits : isProtected, t)) refuse(`a write to ${t}`, 'it is protected config under /perturb');
    }
    for (const t of removes) {
      if (anyHit(hasGlob(t) ? globHits : holdsProtected, t)) refuse(`removing ${t}`, 'it is or holds protected config under /perturb');
    }
    for (const t of fills) {
      if (anyHit(hasGlob(t) ? globHits : holdsProtected, t)) refuse(`a recursive copy to ${t}`, 'it is or holds protected config under /perturb');
    }
    const w = words(toks);
    const [cmd, ...rest] = w;
    if (cmd === 'cd' && !w.wrapped && toks.sep !== '|' && toks.sep !== '&') {
      const d = cdTarget(rest);
      const moved = cwds.map((c) => (d && isDir(toPath(d, c)) ? toPath(d, c) : c));
      // Placing matters only to a push or commit, which any command but a kept cd refuses (other), so a cd that is
      // not kept needs no test here. A cd behind a reserved word adds; one that names no folder stops placing.
      const placed = placing && !w.reserved;
      if (!(d && isDir(toPath(d, cwds[0])))) placing = false;
      cwds = [...new Set(placed ? moved : [...cwds, ...moved])];
      for (const c of [...seen]) if (d && isDir(toPath(d, c))) seen.add(toPath(d, c));
      if (keepsCd(toks)) continue;
    }
    // Any other command makes a later push or commit refuse (other), so placing need not change here.
    const [cwd] = cwds;
    if (cmd === 'gh') {
      const g = rest.filter((a, i) => !/^(-R|--repo)$/.test(a) && !/^(-R|--repo)$/.test(rest[i - 1] ?? '') && !/^(-R.|--repo=)/.test(a));
      if (g[0] === 'pr' && g[1] === 'merge') refuse('gh pr merge', "merges are the owner's");
    }
    if (cmd === 'git') {
      const { sub, rest: args, dir } = gitArgs(rest);
      const repo = dir ? toPath(dir, cwd) : cwd;
      if (sub === 'push' || sub === 'commit') {
        if (other) refuse(`git ${sub} after another command`, `the checks read the repo before the call runs; stage in one call, then run git ${sub} in the next, alone or after cd, with no substitution but $(cat <<'EOF' ...) for a message`);
        // With no other command before it, more than one folder means a cd after a cd that did not move.
        if (cwds.length > 1) refuse(`git ${sub} after a cd the guard cannot place`, `it could run in any of ${cwds.length} folders; run it alone, or after cds to folders that exist`);
        if (!git(repo, 'rev-parse', '--git-dir')) refuse(`git ${sub} in ${repo}`, 'git cannot answer there, so the guard cannot check it');
      }
      if (sub === 'push') checkPush(args, repo);
      if (sub === 'commit') checkCommit(args, repo, command);
    }
    other = true;
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const { tool_name: tool, tool_input: ti, cwd } = input ?? {};
  if (typeof tool !== 'string' || typeof cwd !== 'string' || !ti || typeof ti !== 'object') {
    throw new Error('unexpected hook input shape');
  }
  const kind = Object.hasOwn(SAFE, tool) ? SAFE[tool] : null;
  if (!kind) refuse(tool, "it is not on the guard's list of safe tools, and a tool the guard cannot see into could push, merge, write config or start work outside it");
  if (kind !== 'read') {
    const p = ti.file_path ?? ti.notebook_path;
    if (kind === 'write' && typeof p !== 'string') throw new Error(`${tool} without a path`);
    if (typeof p === 'string' && isProtected(p, cwd, protectedRules(cwd))) refuse(`${tool} of ${p}`, 'it is protected config under /perturb');
  }
  if (kind === 'look' && !LOOKS.has(ti.action)) refuse(`${tool} ${ti.action}`, 'only screenshot and zoom are read-only; clicks, typing and keys could submit a form');
  if (kind === 'skill' && ti.skill !== 'frames') refuse(`the skill ${ti.skill}`, 'only frames runs under /perturb, since another skill could start work the guard cannot see');
  if (kind === 'bash') {
    if (typeof ti.command !== 'string') throw new Error('Bash without a command');
    bash(ti.command, cwd);
  }
}

try {
  main();
  process.exit(0);
} catch (e) {
  process.stderr.write(e instanceof Refusal
    ? `${e.message}\n`
    : `perturb-guard: refusing, the guard could not decide (${e?.message ?? e}).\n`);
  process.exit(2);
}
