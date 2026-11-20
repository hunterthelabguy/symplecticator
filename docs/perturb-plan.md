# /perturb implementation plan

**Goal:** a user-only `/perturb` command under which Claude works with wide
latitude toward an ambitious result on a showcase branch, while one
PreToolUse hook, not prose, refuses the actions that could break anything.
**Architecture:** `/perturb`'s skill frontmatter registers one PreToolUse hook,
a bash wrapper that runs `perturb-guard.mjs` (node, no dependencies) and
refuses if node is missing. The guard refuses default-branch and force
pushes, merges, writes to protected config paths, agents past a write-once
budget, and Workflow; on `git commit` it runs `commit-scan.sh`, which scans
tracked files and the message against an untracked pattern list. A
model-invocable `frames` skill holds the generators and checks the bets draw
on; ground truth flags old showcase branches; `/handoff` carries a ruling
count.
**Spec:** `~/.claude/specs/perturb.md` (the owner's private copy; this plan
carries everything a task needs, and the spec decides where they differ).
**Verify:** `bash scripts/ground-truth.test.sh && bash scripts/build-stop-gate.test.sh && bash scripts/commit-scan.test.sh && node --test scripts/perturb-guard.test.mjs && bash scripts/perturb-hook.test.sh`

This plan file, `BUILD-PROGRESS.md` and `BUILD-REPORT-<date>.md` live on the
build branch only. They reach main with the merge, and one docs commit on
main removes them right after (see "After merge").

## Global constraints

- Public repository: say "you" to the reader and "the owner" in
  Claude-facing text, never a personal name; no em dashes anywhere; no
  private ledger IDs (a capital K, R or L followed by digits) in any file or
  commit message.
- Bash scripts run on bash 3.2 (macOS CI): no `mapfile`, no `${x,,}`, no
  associative arrays; `set -u`; GNU and BSD tools both (no `xargs -r`, no
  `sed -i` without a backup suffix).
- Node scripts use only built-in modules (`node:fs`, `node:os`, `node:path`,
  `node:child_process`, `node:url`, `node:test`, `node:assert`); no
  `package.json`.
- Hook exit codes, confirmed by a probe on 2026-11-20 in Claude Code's
  desktop app: exit 2 refuses the tool call and shows stderr to Claude;
  exit 1 and exit 127 let the call through. A skill's frontmatter
  PreToolUse hook fires once the skill is invoked and stays for the session.
- Hook input (from the same probe) is JSON on stdin with at least
  `session_id` (36 characters), `cwd`, `tool_name` and `tool_input`; Bash's
  `tool_input` has `command`; Edit and Write have `file_path`; NotebookEdit
  has `notebook_path`.
- The guard fails closed: any input it cannot read, and any error it throws,
  exits 2.
- Every refusal message starts `perturb-guard: refused ` and ends
  `. Ask the owner; if you approve, run it yourself.`
- Protected paths, under the home directory's `.claude`: `settings.json`,
  `settings.local.json`, `CLAUDE.md`, `PERSONAL-ADDENDUM.md`, everything
  under `scripts/`, `skills/perturb/` and `perturb/`; plus the working
  repo's `.claude/settings.json` and `.claude/settings.local.json`.
  `LEDGER.md` and `COSTS.md` are not protected.
- The budget is set by the Bash command `: perturb-budget <N>` (a shell
  no-op the guard intercepts), N a whole number 1 or more, once per session.
  The guard writes `~/.claude/perturb/<session_id>.budget` and keeps its
  counter in `<session_id>.count`; Claude never writes either.
- Showcase branches are named `showcase/<YYYY-MM-DD>-<topic>`; ground truth
  flags any whose newest commit is older than 14 days (a placeholder
  number, revisited at the review cadence).
- The ruling-count line is `Rulings asked of the owner: N; made by Claude: M`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `scripts/commit-scan.sh` | create | Scan tracked files and a message file against the untracked pattern list |
| `scripts/commit-scan.test.sh` | create | Prove the scan can fail |
| `scripts/perturb-guard.mjs` | create | The PreToolUse dispatcher |
| `scripts/perturb-guard.test.mjs` | create | One fixture per refusal row, each with an allowed neighbor |
| `skills/perturb/SKILL.md` | create | The user-only command and its frontmatter hook |
| `scripts/perturb-hook.test.sh` | create | The frontmatter's hook command, run as written: node missing, malformed input, an allowed call |
| `skills/frames/SKILL.md`, `skills/frames/frames-examples.md` | create | Generators and checks; real bets only |
| `scripts/ground-truth.sh`, `scripts/ground-truth.test.sh` | modify | Old showcase branches |
| `commands/handoff.md` | modify | Ask per old showcase branch; ruling-count line |
| `.claude/skills/setup-config/SKILL.md` | modify | Consent and write the pattern list; verify it |
| `templates/charter.template.md` | modify | Conjugate pass; the `/perturb` line |
| `README.md`, `CLAUDE.md`, `.github/workflows/test.yml` | modify | List the new pieces; the verify line and CI run all five suites |

## Preflight (before `/build`)

Done in the drafting session, 2026-11-20: a throwaway skill with a
frontmatter PreToolUse hook confirmed exit 2 refuses, exits 1 and 127 pass,
and the input fields above. Nothing to run.

Open pull requests #8 and #9 modify `scripts/ground-truth.sh`,
`scripts/ground-truth.test.sh` and `commands/handoff.md`. T5 needs them
merged first or rebases onto them; the rest of the graph does not touch
those files.

---

### T1: commit-scan.sh

**Depends on:** none
**Files:** create `scripts/commit-scan.sh`; test `scripts/commit-scan.test.sh`
**Seams:** the command line `bash commit-scan.sh <repo> [<message file>]`:
its exit code and its stdout and stderr.
**Interfaces:** produces `commit-scan.sh <repo> [<message file>]`: exit 0
and no output when clean; exit 1 with `== <label>` headers and
`<file>:<line>:<text>` hits when anything matches; exit 1 with a line
starting `commit-scan: ` when the pattern list is missing, has no rules, or
has a malformed line; exit 2 on a usage error. Reads
`$HOME/.claude/scan-patterns.local`: one rule per line,
`<label><TAB><extended regex>`, blank lines and lines starting `#` ignored,
matching case-insensitive.
**Verify:** `bash scripts/commit-scan.test.sh`

- [ ] Write the failing test `scripts/commit-scan.test.sh`:

```bash
#!/usr/bin/env bash
#
# commit-scan.test.sh: prove commit-scan.sh can fail. A throwaway HOME holds the pattern list and a throwaway
# repo holds the files: a clean tree, a hit in a tracked file, a hit in a staged new file, a hit in an untracked
# file (not scanned: it is not part of the commit), the second of two rules, case, a message file by absolute,
# relative and backslash path, and the three refusals that keep an empty scan from reading as a pass (no list,
# a list with no rules, a malformed rule). Exit 0 = every check passed.
#
# Usage: bash scripts/commit-scan.test.sh

set -u
SCAN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/commit-scan.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/commit-scan-test.XXXXXX") || exit 1
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test
export GIT_CEILING_DIRECTORIES="$(dirname "$T")"
export HOME="$T/home" USERPROFILE="$T/home"
mkdir -p "$HOME/.claude"
PAT="$HOME/.claude/scan-patterns.local"

failures=0
check() { # <what> <command...>
  if "${@:2}"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
has() { grep -qF -- "$2" "$1"; }   # <file> <text>
lacks() { ! grep -qF -- "$2" "$1"; } # <file> <text>
empty() { [ ! -s "$1" ]; }         # <file>
run() { # <out file> <args...>: run the scan, keep stdout and stderr, return its exit code
  local out=$1
  shift
  bash "$SCAN" "$@" >"$out" 2>&1
}

printf '# private values, one rule per line\n\nlegal name\tzanzibar\nlogin name\tqwopler\n' >"$PAT"
git init -q "$T/repo" && cd "$T/repo" || exit 1
echo "nothing here" >clean.txt && git add clean.txt && git commit -qm first

run "$T/out" "$T/repo"; code=$?
check "clean tree: exit 0" [ "$code" = 0 ]
check "clean tree: no output" empty "$T/out"

echo "qwopler was here" >tracked.txt && git add tracked.txt && git commit -qm tracked
run "$T/out" "$T/repo"; code=$?
check "hit in a tracked file: exit 1" [ "$code" = 1 ]
check "hit in a tracked file: the second rule's label" has "$T/out" "== login name"
check "hit in a tracked file: the first rule's label is absent" lacks "$T/out" "== legal name"
check "hit in a tracked file: file and line" has "$T/out" "tracked.txt:1:qwopler was here"
git rm -q tracked.txt && git commit -qm untrack

echo "ZANZIBAR" >staged.txt && git add staged.txt
run "$T/out" "$T/repo"; code=$?
check "staged new file, other case: exit 1" [ "$code" = 1 ]
check "staged new file, other case: the first rule's label" has "$T/out" "== legal name"
git rm -q --cached staged.txt && rm staged.txt

echo "zanzibar" >untracked.txt
run "$T/out" "$T/repo"; code=$?
check "untracked file: not scanned, exit 0" [ "$code" = 0 ]
rm untracked.txt

printf 'subject\n\nsigned zanzibar\n' >"$T/msg.txt"
run "$T/out" "$T/repo" "$T/msg.txt"; code=$?
check "message file, absolute path: exit 1" [ "$code" = 1 ]
check "message file, absolute path: names the file" has "$T/out" "msg.txt:3:signed zanzibar"
(cd "$T" && bash "$SCAN" "$T/repo" msg.txt >"$T/out" 2>&1); code=$?
check "message file, relative path: exit 1" [ "$code" = 1 ]
back=$(printf '%s' "$T/msg.txt" | tr '/' '\\')
run "$T/out" "$T/repo" "$back"; code=$?
check "message file, backslash path: exit 1" [ "$code" = 1 ]
printf 'subject\n\nnothing private\n' >"$T/clean-msg.txt"
run "$T/out" "$T/repo" "$T/clean-msg.txt"; code=$?
check "clean message file: exit 0" [ "$code" = 0 ]

mv "$PAT" "$T/saved"
run "$T/out" "$T/repo"; code=$?
check "no pattern list: exit 1" [ "$code" = 1 ]
check "no pattern list: says so" has "$T/out" "commit-scan: no pattern list"
printf '# only comments\n\n' >"$PAT"
run "$T/out" "$T/repo"; code=$?
check "a list with no rules: exit 1" [ "$code" = 1 ]
check "a list with no rules: says so" has "$T/out" "commit-scan: no rules"
printf 'no tab on this line\n' >"$PAT"
run "$T/out" "$T/repo"; code=$?
check "malformed rule: exit 1" [ "$code" = 1 ]
check "malformed rule: names the line" has "$T/out" "commit-scan: malformed rule on line 1"
mv "$T/saved" "$PAT"

run "$T/out"; code=$?
check "no repo argument: usage error, exit 2" [ "$code" = 2 ]

echo
if [ "$failures" -gt 0 ]; then echo "commit-scan.test.sh: $failures FAILED"; exit 1; fi
echo "commit-scan.test.sh: all passed"
```

- [ ] Run it; expected failure: every check that runs the scan FAILs, since
  `scripts/commit-scan.sh` does not exist (bash reports
  `No such file or directory` into the out files); copy the first FAIL line
  from the run into the commit body.
- [ ] Minimal implementation `scripts/commit-scan.sh`:

```bash
#!/usr/bin/env bash
#
# commit-scan.sh: the pre-commit privacy scan /perturb's guard runs before every git commit. It scans the repo's
# tracked files (staged new files included; untracked ones are not part of the commit) and, when given, the
# commit message file, against the owner's untracked pattern list ~/.claude/scan-patterns.local: one rule per
# line, <label><TAB><extended regex>, blank and # lines ignored, matching case-insensitive. A missing list, a
# list with no rules and a malformed line all refuse (exit 1), because a scan with nothing to scan for would
# read as a pass.
#
# Usage: bash commit-scan.sh <repo> [<message file>]
# Exit 0 = clean; 1 = a hit or an unusable list; 2 = usage error.

set -u
repo="${1:-}"
msg="${2:-}"
[ -n "$repo" ] || { echo "usage: commit-scan.sh <repo> [<message file>]" >&2; exit 2; }
pat="$HOME/.claude/scan-patterns.local"
if [ ! -f "$pat" ]; then
  echo "commit-scan: no pattern list at ~/.claude/scan-patterns.local; setup writes one. Refusing, since a scan with nothing to scan for would read as a pass."
  exit 1
fi
if [ -n "$msg" ]; then
  msg=$(printf '%s' "$msg" | tr '\\' '/')
  case "$msg" in /* | ?:/*) ;; *) msg="$PWD/$msg" ;; esac
fi

files=$(mktemp) || exit 1
trap 'rm -f "$files"' EXIT
git -C "$repo" ls-files -z >"$files" || { echo "commit-scan: git ls-files failed in $repo"; exit 1; }

status=0 rules=0 n=0
while IFS= read -r line || [ -n "$line" ]; do
  n=$((n + 1))
  line=${line%$'\r'}
  case "$line" in '' | '#'*) continue ;; esac
  case "$line" in *$'\t'*) ;; *) echo "commit-scan: malformed rule on line $n (expected <label><TAB><regex>)"; exit 1 ;; esac
  label=${line%%$'\t'*}
  re=${line#*$'\t'}
  rules=$((rules + 1))
  hits=""
  if [ -s "$files" ]; then
    hits=$(cd "$repo" && xargs -0 grep -H -n -I -i -E -- "$re" <"$files" 2>/dev/null)
  fi
  if [ -n "$msg" ] && [ -f "$msg" ]; then
    mhits=$(grep -n -i -E -- "$re" "$msg" 2>/dev/null | sed "s|^|$msg:|")
    [ -n "$mhits" ] && hits="${hits:+$hits$'\n'}$mhits"
  fi
  if [ -n "$hits" ]; then
    printf '== %s\n%s\n' "$label" "$hits"
    status=1
  fi
done <"$pat"
if [ "$rules" = 0 ]; then
  echo "commit-scan: no rules in ~/.claude/scan-patterns.local. Refusing, since a scan with nothing to scan for would read as a pass."
  exit 1
fi
exit $status
```

- [ ] Run it; expected: `commit-scan.test.sh: all passed`.
- [ ] Mutant runs, one at a time against the full T1 suite, restored after
  each: (a) delete `-i` from the file grep: "staged new file, other case"
  fails; (b) change `ls-files -z` to `ls-files -co --exclude-standard -z`:
  "untracked file: not scanned" fails; (c) change `[ "$rules" = 0 ]` to
  `false`: "a list with no rules" fails; (d) delete the `tr '\\' '/'` line:
  "message file, backslash path" fails.
- [ ] Commit: `Scripts: commit-scan, the pre-commit privacy scan`, body: why
  a missing or empty list refuses.

### T2: perturb-guard.mjs

**Depends on:** T1
**Files:** create `scripts/perturb-guard.mjs`; test `scripts/perturb-guard.test.mjs`
**Seams:** the process: hook JSON on stdin, exit code, stderr. Tests set
`HOME` and `USERPROFILE` to a throwaway directory, so `os.homedir()` and the
protected paths follow it.
**Interfaces:** consumes `commit-scan.sh` (T1) from the guard's own
directory, exit codes as T1 states. Produces `node perturb-guard.mjs`:
exit 0 allows; exit 2 refuses with the global refusal form, or with
`perturb-guard: refusing, the guard could not decide (<error>).` for
unreadable input or a thrown error.
**Verify:** `node --test scripts/perturb-guard.test.mjs`

- [ ] Write the failing test `scripts/perturb-guard.test.mjs`:

```js
// perturb-guard.test.mjs: prove perturb-guard.mjs can fail. Each refusal row of the spec has a fixture and an
// allowed neighbor beside it, run through the real process with a throwaway HOME, a throwaway repo whose origin
// HEAD names main, and the real commit-scan.sh beside the guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'perturb-guard.mjs');
// realpath: macOS's temp folder is a symlink, and git reports the repo's real path.
const T = realpathSync(mkdtempSync(join(tmpdir(), 'perturb-guard-test-')));
const HOME = join(T, 'home');
const REPO = join(T, 'repo');
const SID = '11111111-2222-3333-4444-555555555555';
const env = { ...process.env, HOME, USERPROFILE: HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't' };
const sh = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
};

mkdirSync(join(HOME, '.claude'), { recursive: true });
writeFileSync(join(HOME, '.claude', 'scan-patterns.local'), 'legal name\tzanzibar\n');
sh(T, 'init', '-q', '--bare', 'origin.git');
sh(T, 'init', '-q', 'repo');
sh(REPO, 'symbolic-ref', 'HEAD', 'refs/heads/main');
writeFileSync(join(REPO, 'a.txt'), 'clean\n');
sh(REPO, 'add', 'a.txt');
sh(REPO, 'commit', '-qm', 'first');
sh(REPO, 'remote', 'add', 'origin', join(T, 'origin.git'));
sh(REPO, 'push', '-q', 'origin', 'main');
sh(REPO, 'remote', 'set-head', 'origin', 'main');

function run(tool, input, { sid = SID, cwd = REPO, raw } = {}) {
  const stdin = raw ?? JSON.stringify({ session_id: sid, cwd, tool_name: tool, tool_input: input });
  const r = spawnSync(process.execPath, [GUARD], { input: stdin, env, encoding: 'utf8' });
  return { code: r.status, err: r.stderr };
}
const bash = (command, opts) => run('Bash', { command }, opts);
const refused = (r, text) => {
  assert.equal(r.code, 2, r.err);
  assert.match(r.err, /^perturb-guard: refused /);
  assert.match(r.err, /Ask the owner; if you approve, run it yourself\.\n$/);
  if (text) assert.ok(r.err.includes(text), r.err);
};
const allowed = (r) => assert.equal(r.code, 0, r.err);
const C = join(HOME, '.claude');

test('push: feature branch allowed, default branch refused', () => {
  allowed(bash('git push origin feat'));
  allowed(bash('git push -u origin showcase/2026-11-20-x'));
  refused(bash('git push origin main'), 'main');
  refused(bash('git push origin HEAD:main'), 'main');
  refused(bash('git push origin HEAD:refs/heads/main'), 'main');
});
test('push with no refspec: refused on the default branch, allowed off it', () => {
  refused(bash('git push'), 'main');
  sh(REPO, 'checkout', '-q', '-b', 'feat');
  allowed(bash('git push'));
  allowed(bash('git push origin'));
  sh(REPO, 'checkout', '-q', 'main');
});
test('force push refused in every spelling; a plain upstream push allowed', () => {
  for (const c of ['git push -f origin feat', 'git push --force origin feat', 'git push -uf origin feat',
    'git push --force-with-lease origin feat', 'git push --force-with-lease=feat origin feat',
    'git push origin +feat']) refused(bash(c), 'force');
  allowed(bash('git push -u origin feat'));
});
test('--all and --mirror refused', () => {
  refused(bash('git push --all origin'));
  refused(bash('git push --mirror origin'));
});
test('remote branch deletion: showcase allowed, others refused', () => {
  allowed(bash('git push origin --delete showcase/2026-11-01-old'));
  allowed(bash('git push origin :showcase/2026-11-01-old'));
  refused(bash('git push origin --delete feature/x'), 'feature/x');
  refused(bash('git push origin -d feature/x'), 'feature/x');
  refused(bash('git push origin :feature/x'), 'feature/x');
});
test('git -C and cd reach the right repo', () => {
  refused(bash(`git -C "${REPO}" push origin main`), 'main');
  refused(bash(`cd "${REPO}" && git push origin main`, { cwd: T }), 'main');
  allowed(bash(`git -C "${REPO}" push origin feat`, { cwd: T }));
});
test('env assignments before git are skipped', () => {
  refused(bash('MSYS_NO_PATHCONV=1 git push origin main'), 'main');
});
test('gh pr merge refused; gh pr create allowed', () => {
  refused(bash('gh pr merge 12 --squash'), 'gh pr merge');
  allowed(bash('gh pr create --draft --title x --body y'));
});
test('commit: scan clean allowed, scan hit refused (tracked file and message)', () => {
  allowed(bash('git commit -m "a clean message"'));
  refused(bash('git commit -m "signed zanzibar"'), 'zanzibar');
  refused(bash('git commit -am "signed zanzibar"'), 'zanzibar');
  writeFileSync(join(T, 'msg.txt'), 'subject\n\nzanzibar\n');
  refused(bash(`git commit -F "${join(T, 'msg.txt')}"`), 'zanzibar');
  writeFileSync(join(REPO, 'b.txt'), 'zanzibar\n');
  sh(REPO, 'add', 'b.txt');
  refused(bash('git commit -m clean'), 'zanzibar');
  sh(REPO, 'rm', '-q', '--cached', 'b.txt');
  rmSync(join(REPO, 'b.txt'));
});
test('Edit and Write: repo files allowed, protected paths refused in every spelling', () => {
  allowed(run('Edit', { file_path: join(REPO, 'scripts', 'x.sh') }));
  allowed(run('Write', { file_path: join(C, 'LEDGER.md') }));
  allowed(run('Write', { file_path: join(C, 'COSTS.md') }));
  refused(run('Edit', { file_path: join(C, 'scripts', 'ground-truth.sh') }), 'protected');
  refused(run('Write', { file_path: join(C, 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(C, 'CLAUDE.md') }), 'protected');
  refused(run('Edit', { file_path: join(C, 'skills', 'perturb', 'SKILL.md') }), 'protected');
  refused(run('Edit', { file_path: `${C}/skills/other/../perturb/SKILL.md` }), 'protected');
  refused(run('Edit', { file_path: `${C}\\scripts\\a.sh` }), 'protected');
  refused(run('Write', { file_path: '~/.claude/settings.local.json' }), 'protected');
  refused(run('Write', { file_path: join(C, 'perturb', `${SID}.count`) }), 'protected');
  refused(run('NotebookEdit', { notebook_path: join(C, 'scripts', 'n.ipynb') }), 'protected');
  refused(run('Write', { file_path: join(REPO, '.claude', 'settings.json') }), 'protected');
  allowed(run('Write', { file_path: join(REPO, '.claude', 'skills', 'x.md') }));
});
test('Bash writes into protected paths refused; the same writes elsewhere allowed', () => {
  refused(bash(`echo x > "${join(C, 'settings.json')}"`), 'protected');
  refused(bash(`echo x >> ~/.claude/CLAUDE.md`), 'protected');
  refused(bash(`echo x | tee ~/.claude/scripts/a.sh`), 'protected');
  refused(bash(`cp a.txt ~/.claude/scripts/a.sh`), 'protected');
  refused(bash(`sed -i.bak s/a/b/ ~/.claude/PERSONAL-ADDENDUM.md`), 'protected');
  allowed(bash(`echo x > "${join(T, 'free.txt')}"`));
  allowed(bash(`cp a.txt b.txt`));
  allowed(bash(`cat ~/.claude/settings.json`));
});
test('budget: Agent refused before it, counted within it, refused past it; set once', () => {
  const sid = 'aaaaaaaa-0000-0000-0000-000000000002';
  refused(run('Agent', { prompt: 'x' }, { sid }), 'no budget');
  refused(bash(': perturb-budget 0', { sid }), 'whole number');
  refused(bash(': perturb-budget two', { sid }), 'whole number');
  allowed(bash(': perturb-budget 2', { sid }));
  assert.equal(readFileSync(join(C, 'perturb', `${sid}.budget`), 'utf8').trim(), '2');
  refused(bash(': perturb-budget 9', { sid }), 'once');
  allowed(run('Agent', { prompt: 'x' }, { sid }));
  allowed(run('Agent', { prompt: 'x' }, { sid }));
  refused(run('Agent', { prompt: 'x' }, { sid }), 'budget of 2');
  const sid3 = 'aaaaaaaa-0000-0000-0000-000000000003';
  allowed(bash(': perturb-budget 3', { sid: sid3 }));
  for (let i = 0; i < 3; i++) allowed(run('Agent', { prompt: 'x' }, { sid: sid3 }));
  refused(run('Agent', { prompt: 'x' }, { sid: sid3 }), 'budget of 3');
});
test('Workflow always refused; other tools allowed', () => {
  refused(run('Workflow', { script: 'x' }), 'Workflow');
  allowed(run('Read', { file_path: join(C, 'settings.json') }));
  allowed(run('Grep', { pattern: 'x' }));
});
test('fails closed: malformed JSON, missing fields, a missing session id for Agent', () => {
  for (const r of [run('Bash', {}, { raw: '{not json' }), run('Bash', {}, { raw: '{}' }),
    run('Bash', { nocommand: 1 }), run('Edit', {}), run('Agent', { prompt: 'x' }, { sid: null })]) {
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /^perturb-guard: refusing, the guard could not decide \(/);
  }
});
test('cleanup', () => rmSync(T, { recursive: true, force: true }));
```

- [ ] Run it; expected failure: every test fails with
  `Cannot find module` naming `perturb-guard.mjs` in the child's stderr,
  reported through the first `assert.equal(r.code, ...)`; copy the first
  failing assertion line from the run into the commit body.
- [ ] Minimal implementation `scripts/perturb-guard.mjs`:

```js
#!/usr/bin/env node
//
// perturb-guard.mjs: the PreToolUse hook /perturb registers from its frontmatter, active from invocation to the
// end of that session. It refuses (exit 2, reason on stderr) what could break something while Claude works with
// wide latitude: pushes to the default branch, force pushes, --all and --mirror, gh pr merge, deleting a remote
// branch outside showcase/, writes to the owner's protected config, Agent calls past the session's budget, and
// Workflow (its agent count cannot be known ahead). Before every git commit it runs commit-scan.sh beside it.
// It is a tripwire, not a sandbox: a script Claude writes can still push or write anywhere.
//
// The budget is set once per session by the Bash command ": perturb-budget <N>", a shell no-op this guard
// intercepts, so Claude never needs the session id and never writes the budget or the counter.
//
// Fails closed: input it cannot read and any error it throws exit 2, since Claude Code lets a hook's other exit
// codes through.

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WIN = process.platform === 'win32';
const HOME = homedir();
const CLAUDE = join(HOME, '.claude');
const PERTURB = join(CLAUDE, 'perturb');
const HERE = dirname(fileURLToPath(import.meta.url));

class Refusal extends Error {}
function refuse(what, why) {
  throw new Refusal(`perturb-guard: refused ${what}: ${why}. Ask the owner; if you approve, run it yourself.`);
}

// A path as the shell meant it: ~ expanded, Git Bash's /c/... read as C:/... on Windows, made absolute.
function toPath(p, cwd) {
  let s = String(p).replace(/^~(?=$|[\\/])/, HOME);
  if (WIN) s = s.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
  return resolve(cwd, s);
}
// The same, in one spelling for comparison: forward slashes, lower case on Windows.
function norm(p, cwd) {
  const s = toPath(p, cwd).replace(/\\/g, '/');
  return WIN ? s.toLowerCase() : s;
}

function git(cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}
const short = (ref) => ref.replace(/^refs\/heads\//, '');
function defaultBranch(repo) {
  const ref = git(repo, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD');
  return ref ? ref.slice(ref.indexOf('/') + 1) : 'main';
}
const currentBranch = (repo) => short(git(repo, 'symbolic-ref', '-q', 'HEAD'));

function protectedRules(cwd) {
  const rules = ['settings.json', 'settings.local.json', 'CLAUDE.md', 'PERSONAL-ADDENDUM.md']
    .map((f) => ({ path: norm(join(CLAUDE, f), cwd) }));
  for (const d of [join(CLAUDE, 'scripts'), join(CLAUDE, 'skills', 'perturb'), PERTURB]) {
    rules.push({ path: norm(d, cwd), tree: true });
  }
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  if (top) {
    for (const f of ['settings.json', 'settings.local.json']) rules.push({ path: norm(join(top, '.claude', f), cwd) });
  }
  return rules;
}
function isProtected(p, cwd, rules) {
  const t = norm(p, cwd);
  return rules.some((r) => t === r.path || (r.tree && t.startsWith(r.path + '/')));
}

// A shell command split into simple commands (on newlines, ;, &, |) of tokens, quotes removed; > and >> kept as
// their own tokens.
function segments(cmd) {
  const segs = [];
  let toks = [], cur = '', has = false, q = null;
  const endTok = () => { if (has) toks.push(cur); cur = ''; has = false; };
  const endSeg = () => { endTok(); if (toks.length) segs.push(toks); toks = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === '\\' && i + 1 < cmd.length) { cur += cmd[++i]; has = true; continue; }
    if (c === '\n' || c === ';' || c === '&' || c === '|') { endSeg(); continue; }
    if (c === '>') {
      endTok();
      if (cmd[i + 1] === '>') { toks.push('>>'); i++; } else toks.push('>');
      continue;
    }
    if (/\s/.test(c)) { endTok(); continue; }
    cur += c;
    has = true;
  }
  endSeg();
  return segs;
}
const isRedir = (t) => t === '>' || t === '>>';

function writeTargets(toks) {
  const out = [];
  toks.forEach((t, i) => { if (isRedir(t) && toks[i + 1] !== undefined) out.push(toks[i + 1]); });
  const [cmd, ...args] = toks.filter((t, i) => !isRedir(t) && !isRedir(toks[i - 1]));
  const plain = args.filter((a) => !a.startsWith('-'));
  if (cmd === 'tee') out.push(...plain);
  if ((cmd === 'cp' || cmd === 'mv') && plain.length) out.push(plain[plain.length - 1]);
  if (cmd === 'sed' && args.some((a) => /^-i/.test(a) || a.startsWith('--in-place')) && plain.length) {
    out.push(plain[plain.length - 1]);
  }
  return out;
}

function gitArgs(words) {
  let i = 0, dir = null;
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C') { dir = words[i + 1]; i += 2; } else if (words[i] === '-c') i += 2; else i += 1;
  }
  return { sub: words[i], rest: words.slice(i + 1), dir };
}

function checkPush(rest, repo) {
  const flags = rest.filter((a) => a.startsWith('-'));
  const pos = rest.filter((a) => !a.startsWith('-'));
  const force = flags.some((f) => f === '--force' || f.startsWith('--force-with-lease') ||
    f.startsWith('--force-if-includes') || (/^-[a-zA-Z]+$/.test(f) && f.includes('f')));
  if (force) refuse('a force push', 'force pushes are off under /perturb');
  if (flags.some((f) => f === '--all' || f === '--mirror')) refuse('git push --all or --mirror', 'it would push the default branch');
  const del = flags.some((f) => f === '--delete' || (/^-[a-zA-Z]+$/.test(f) && f.includes('d')));
  const def = defaultBranch(repo);
  const refspecs = pos.slice(1);
  if (refspecs.length === 0) {
    if (!del && currentBranch(repo) === def) refuse(`git push on ${def}`, 'pushes to the default branch are off under /perturb');
    return;
  }
  for (const r of refspecs) {
    if (r.startsWith('+')) refuse('a force push', `the + refspec ${r} forces it`);
    const colon = r.indexOf(':');
    const src = colon < 0 ? r : r.slice(0, colon);
    const dst = short(colon < 0 ? r : r.slice(colon + 1));
    if (del || (colon >= 0 && src === '')) {
      if (!dst.startsWith('showcase/')) refuse(`deleting remote branch ${dst}`, 'only showcase/ branches may be deleted under /perturb');
      continue;
    }
    const target = dst === 'HEAD' ? currentBranch(repo) : dst;
    if (target === def) refuse(`git push to ${def}`, 'pushes to the default branch are off under /perturb');
  }
}

function checkCommit(rest, repo, cwd) {
  const msgs = [];
  let file = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--message') msgs.push(rest[++i] ?? '');
    else if (a.startsWith('--message=')) msgs.push(a.slice(10));
    else if (/^-[a-zA-Z]*m$/.test(a)) msgs.push(rest[++i] ?? '');
    else if (/^-m./.test(a)) msgs.push(a.slice(2));
    else if (a === '-F' || a === '--file') file = rest[++i];
    else if (a.startsWith('--file=')) file = a.slice(7);
  }
  let tmp = null;
  if (msgs.length) {
    tmp = mkdtempSync(join(tmpdir(), 'perturb-msg-'));
    file = join(tmp, 'msg');
    writeFileSync(file, msgs.join('\n\n'));
  } else if (file && file !== '-') {
    file = toPath(file, cwd);
  } else {
    file = null;
  }
  const r = spawnSync('bash', [join(HERE, 'commit-scan.sh'), repo, ...(file ? [file] : [])], { encoding: 'utf8' });
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) refuse('git commit', `commit-scan.sh found:\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim()}\n`);
}

function setBudget(sid, n) {
  if (!sid) throw new Error('no session_id');
  if (!/^[1-9][0-9]*$/.test(n ?? '')) refuse(`perturb-budget ${n ?? ''}`.trim(), 'the budget is a whole number of agents, 1 or more');
  const f = join(PERTURB, `${sid}.budget`);
  if (existsSync(f)) refuse('a second perturb-budget', 'the budget is set once per session');
  mkdirSync(PERTURB, { recursive: true });
  writeFileSync(f, `${n}\n`);
}

function spend(sid) {
  if (!sid) throw new Error('no session_id');
  const b = join(PERTURB, `${sid}.budget`), c = join(PERTURB, `${sid}.count`);
  if (!existsSync(b)) refuse('Agent', 'no budget yet; preflight sets it with ": perturb-budget <N>" after the owner approves');
  const budget = Number(readFileSync(b, 'utf8').trim());
  const count = existsSync(c) ? Number(readFileSync(c, 'utf8').trim()) : 0;
  if (!Number.isInteger(budget) || !Number.isInteger(count)) throw new Error('unreadable budget or count file');
  if (count + 1 > budget) refuse('Agent', `the approved budget of ${budget} agents is spent`);
  writeFileSync(c, `${count + 1}\n`);
}

function bash(command, cwd, sid) {
  const rules = protectedRules(cwd);
  for (const toks of segments(command)) {
    for (const t of writeTargets(toks)) {
      if (isProtected(t, cwd, rules)) refuse(`a write to ${t}`, 'it is protected config under /perturb');
    }
    const words = toks.filter((t, i) => !isRedir(t) && !isRedir(toks[i - 1]));
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
    const [cmd, ...rest] = words;
    if (cmd === 'cd' && rest[0]) { cwd = toPath(rest[0], cwd); continue; }
    if (cmd === ':' && rest[0] === 'perturb-budget') { setBudget(sid, rest[1]); continue; }
    if (cmd === 'gh' && rest[0] === 'pr' && rest[1] === 'merge') refuse('gh pr merge', "merges are the owner's");
    if (cmd === 'git') {
      const { sub, rest: args, dir } = gitArgs(rest);
      const repo = dir ? toPath(dir, cwd) : cwd;
      if (sub === 'push') checkPush(args, repo);
      if (sub === 'commit') checkCommit(args, repo, cwd);
    }
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const { tool_name: tool, tool_input: ti, session_id: sid, cwd } = input ?? {};
  if (typeof tool !== 'string' || typeof cwd !== 'string' || !ti || typeof ti !== 'object') {
    throw new Error('unexpected hook input shape');
  }
  switch (tool) {
    case 'Workflow':
      return refuse('Workflow', 'its agent count cannot be known ahead, so it is off under /perturb');
    case 'Agent':
      return spend(sid);
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const p = ti.file_path ?? ti.notebook_path;
      if (typeof p !== 'string') throw new Error(`${tool} without a path`);
      if (isProtected(p, cwd, protectedRules(cwd))) refuse(`${tool} of ${p}`, 'it is protected config under /perturb');
      return;
    }
    case 'Bash':
      if (typeof ti.command !== 'string') throw new Error('Bash without a command');
      return bash(ti.command, cwd, sid);
    default:
      return;
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
```

- [ ] Run it; expected: every test passes.
- [ ] Mutant runs, one at a time against the full T2 suite, restored after
  each: (a) in `checkPush`, delete `|| (/^-[a-zA-Z]+$/.test(f) && f.includes('f'))`:
  "force push refused in every spelling" fails (`-f`, `-uf`); (b) change
  `count + 1 > budget` to `count > budget`: "budget" fails at both values;
  (c) in `protectedRules`, delete `PERTURB` from the tree list: "Edit and
  Write" fails on the `.count` path; (d) delete the `cd` line in `bash`:
  "git -C and cd reach the right repo" fails; (e) change the catch's
  `process.exit(2)` to `process.exit(1)`: every refusal test fails;
  (f) delete the `while` that drops env assignments: "env assignments"
  fails.
- [ ] Commit: `Scripts: perturb-guard, the /perturb PreToolUse hook`, body:
  the tripwire-not-sandbox limit and why the budget is a guard-run no-op.

### T3: the /perturb skill and its hook command

**Depends on:** T2
**Files:** create `skills/perturb/SKILL.md`; test `scripts/perturb-hook.test.sh`
**Seams:** the frontmatter's hook `command` string, run exactly as written
by `bash -c`.
**Interfaces:** consumes `node ~/.claude/scripts/perturb-guard.mjs` (T2).
Produces the user-only skill `perturb`, and the hook command
`command -v node >/dev/null || { echo 'perturb-guard: node not found, refusing' >&2; exit 2; }; node ~/.claude/scripts/perturb-guard.mjs`.
**Verify:** `bash scripts/perturb-hook.test.sh`

- [ ] Write the failing test `scripts/perturb-hook.test.sh`:

```bash
#!/usr/bin/env bash
#
# perturb-hook.test.sh: run the hook command from skills/perturb/SKILL.md's frontmatter exactly as written, with
# a throwaway HOME holding the scripts where setup installs them: node hidden from PATH refuses (exit 2), unreadable
# input refuses, and an allowed call passes. Exit 0 = every check passed.
#
# Usage: bash scripts/perturb-hook.test.sh

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$HERE/../skills/perturb/SKILL.md"
T=$(mktemp -d "${TMPDIR:-/tmp}/perturb-hook-test.XXXXXX") || exit 1
trap 'rm -rf "$T"' EXIT
export HOME="$T/home" USERPROFILE="$T/home"
mkdir -p "$HOME/.claude/scripts"
cp "$HERE/perturb-guard.mjs" "$HERE/commit-scan.sh" "$HOME/.claude/scripts/"

failures=0 skipped=0
check() { # <what> <command...>
  if "${@:2}"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
has() { grep -qF -- "$2" "$1"; } # <file> <text>

cmd=$(sed -n 's/^ *command: "\(.*\)"$/\1/p' "$SKILL")
check "the frontmatter has one hook command" [ "$(printf '%s\n' "$cmd" | grep -c .)" = 1 ]
cmd=$(printf '%s' "$cmd" | sed 's/\\"/"/g')

# PATH with every folder that holds node left out; empty when that also leaves out bash.
path_without_node() {
  local d p=""
  while IFS= read -r d; do
    [ -x "$d/node" ] || [ -x "$d/node.exe" ] || p="$p$d:"
  done < <(printf '%s\n' "$PATH" | tr ':' '\n')
  p=${p%:}
  PATH="$p" command -v bash >/dev/null 2>&1 && printf '%s' "$p"
}
BASH_BIN=$(command -v bash)
nonode=$(path_without_node)
if [ -n "$nonode" ]; then
  echo '{}' | PATH="$nonode" "$BASH_BIN" -c "$cmd" >"$T/out" 2>&1; code=$?
  check "node missing: exit 2" [ "$code" = 2 ]
  check "node missing: says so" has "$T/out" "perturb-guard: node not found, refusing"
else
  echo "skip  node missing: no PATH leaves out node and keeps bash"
  skipped=$((skipped + 1))
fi

echo '{not json' | "$BASH_BIN" -c "$cmd" >"$T/out" 2>&1; code=$?
check "unreadable input: exit 2" [ "$code" = 2 ]
check "unreadable input: the could-not-decide line" has "$T/out" "perturb-guard: refusing, the guard could not decide"

printf '{"session_id":"s","cwd":"%s","tool_name":"Read","tool_input":{"file_path":"x"}}' "$T" |
  "$BASH_BIN" -c "$cmd" >"$T/out" 2>&1; code=$?
check "an allowed call: exit 0" [ "$code" = 0 ]

echo
if [ "$failures" -gt 0 ]; then echo "perturb-hook.test.sh: $failures FAILED"; exit 1; fi
echo "perturb-hook.test.sh: all passed${skipped:+ ($skipped skipped)}"
```

- [ ] Run it; expected failure: `FAIL  the frontmatter has one hook command`
  (sed reports the missing `skills/perturb/SKILL.md`); copy the line from
  the run.
- [ ] Minimal implementation `skills/perturb/SKILL.md`:

````markdown
---
name: perturb
description: Work with wide latitude toward an ambitious result on a showcase branch to mine, with a hook refusing what could break anything. User-only; lasts the session.
disable-model-invocation: true
argument-hint: "<the problem or direction>"
hooks:
  PreToolUse:
    - matcher: "Bash|Edit|Write|NotebookEdit|Agent|Workflow"
      hooks:
        - type: command
          shell: bash
          command: "command -v node >/dev/null || { echo 'perturb-guard: node not found, refusing' >&2; exit 2; }; node ~/.claude/scripts/perturb-guard.mjs"
          timeout: 30
---

# /perturb

Arguments: $ARGUMENTS

The owner points a direction; you find out what is possible. Be ambitious:
the result is a showcase branch the owner mines, never merges whole, so a
large diff is welcome. The guard in this skill's frontmatter holds the
floor from now to the end of the session: it refuses pushes to the default
branch, force pushes, `gh pr merge`, deleting remote branches outside
`showcase/`, writes to the owner's protected config, agents past the
budget, and Workflow. A refusal is not an obstacle to route around: say
what was refused and why you wanted it, and the owner runs it if they
approve. The guard is a tripwire, not a sandbox; never write a script to
do what it refuses.

Leaving `/perturb` means starting a new session; the default there is the
owner's full charter.

## 1. Preflight (one short turn)

1. Check: `node --version` answers; the working tree is clean; the repo's
   CLAUDE.md names a verify command. Any missing: say so and stop.
2. State the goal in one line, then what "possible" might look like in two
   or three sentences.
3. Ask one question: the budget in agents (give what similar runs cost from
   `COSTS.md` beside the charter, or "not yet measured") and the branch
   name `showcase/<YYYY-MM-DD>-<topic>`.
4. After the owner's yes, and never before it, run `: perturb-budget <N>`
   once. The guard records it; no Agent call works before it.

## 2. Work

- Work in a worktree on the showcase branch, pushed so it survives the
  machine.
- You rule unasked on everything except: what a student or end user would
  see, interfaces others depend on, file formats, the spec's words, spend
  beyond the budget, merges, and deploys. Those you ask. Log each call you
  make at once in the report draft as
  `Ruling (Claude): <what>; why: <reason>; cost if wrong: <cost>`.
- The floor holds on every commit: tests and typecheck green before it, the
  commit form of the charter. Red exploration stays uncommitted or is
  reverted.
- Draw on the `frames` skill for directions the owner's framing hides.
- After each agent finishes, append its token count to `COSTS.md`.
- Open no pull request: the branch is pushed, never merged. Mining happens
  in a fresh session, under the full charter.

## 3. Close

Write `PERTURB-REPORT.md` at the branch root, commit it, push, and end with
the `/handoff` step 4 block. The report has, in order:

1. The goal, in one line.
2. A tour of what was built, in the order to read it, each stop with the
   file and why it matters.
3. The verify command's output at the head.
4. Your rulings, as logged.
5. Agents spent against the budget.
6. Mineable pieces, each with an order-of-magnitude estimate of cost,
   complexity, time and risk against its payoff.
7. Zero to two conjugate bets, each naming its generator and the assumption
   it breaks.
8. `Rulings asked of the owner: N; made by Claude: M`.
````

- [ ] Run it; expected: `perturb-hook.test.sh: all passed`.
- [ ] Mutant runs, one at a time against the full T3 suite, restored after
  each: (a) in the frontmatter command, change `exit 2` to `exit 1`:
  "node missing: exit 2" fails (or is skipped where no PATH leaves out
  node, which the run must report); (b) change `perturb-guard.mjs` in the
  command to `perturb-guard.js`: "an allowed call: exit 0" fails.
- [ ] Commit: `Skills: /perturb, latitude behind a hook`, body: why the hook
  lives in the frontmatter and why leaving means a new session.

### T4: the frames skill

**Depends on:** none
**Files:** create `skills/frames/SKILL.md`, `skills/frames/frames-examples.md`
**Seams:** none testable by a suite (prose); its check is a grep run
inline.
**Interfaces:** produces the model-invocable skill `frames`, which T3's
SKILL.md names.
**Verify:** `test -f skills/frames/SKILL.md && grep -c '^- \*\*' skills/frames/SKILL.md` prints `10`, and `grep -n $'\xe2\x80\x94' skills/frames/*.md` prints nothing.

- [ ] Write `skills/frames/SKILL.md`:

````markdown
---
name: frames
description: Generators and checks for conjugate bets, the 0 to 2 pursuits orthogonal to the owner's framing that end a task's closing report. Fire on your own when drafting those bets or a direction under /perturb.
---

# Frames

Divergence is made, not sampled: sampling varies wording more than
premises, so a bet starts from a named frame. Each bet names its generator
and the assumption it breaks, so the owner can reject the frame rather
than the idea. Run the checks before offering a bet; zero bets is a valid
result.

## Generators

- **Both limits.** Take the scope to 0.1x (the smallest version that still
  works; the ponytail skill asks this) and to 10x; look at degenerate cases.
- **Invert an assumption.** Name what the plan takes as given and flip it.
- **Draw a picture.** Diagram the system before planning it (archify, if
  installed).
- **Draw the boundary.** Isolate the system, as in a free body diagram, and
  list everything that crosses it: inputs, dependencies, users.
- **Change frame.** Sit where someone else sits: the student, a new
  adopter, the person on call.
- **Borrow a field.** Find a discipline with the same equations; its
  solutions transfer.
- **Work backward.** Start from the end state and ask what must be true
  just before it.

## Checks

- **Count constraints against freedoms.** More freedom than the
  requirements pin down needs a ruling; more constraints than freedom
  means two requirements contradict.
- **Order of magnitude.** Estimate cost, complexity, time and risk against
  the payoff, roughly, before building.
- **Name the invariant.** Say what must stay true through the change, and
  make it the test.

Worked examples: [frames-examples.md](frames-examples.md). Only real bets
go there, each with its date and outcome; `/reflect` adds and retires them.
````

- [ ] Write `skills/frames/frames-examples.md`:

```markdown
# Frames: worked examples

Real bets only, each with where it was offered, the generator, the
assumption it broke, and what happened. `/reflect` adds new ones and
retires ones that mislead.

## E1. Draw the boundary: adopters are not all physicists (offered)

This config's design session for `/perturb`, 2026-11-19. Generator: draw
the boundary. Assumption broken: everyone who adopts the config thinks
like a physicist. The frames list was drawn from physics problem solving;
an adopter in another field has their own moves. Bet: setup could ask for
the adopter's field's moves and write them into this skill. Outcome: not
yet taken.

## E2. The 0.1x limit: relief without the loop (offered)

Same session, 2026-11-19. Generator: both limits, the 0.1x end.
Assumption broken: the overnight loop is needed to relieve the owner's
bottleneck. Bet: the smallest `/perturb` (the conjugate pass, the
showcase branch, the hooks) runs for two weeks before any loop is built.
Outcome: taken; the loop was earmarked for a second spec after two weeks
of use.
```

- [ ] Run the Verify line; expected: `10`, and no em dash lines.
- [ ] Commit: `Skills: frames, generators and checks for conjugate bets`,
  body: why examples are real bets only.

### T5: old showcase branches and the ruling count

**Depends on:** none in this plan; base it on main after pull requests #8
and #9 merge, or rebase onto them (they modify the same three files).
**Files:** modify `scripts/ground-truth.sh` (after the "branches with no
worktree" block, before "Open PRs with their CI and review verdicts");
modify `scripts/ground-truth.test.sh` (a new section before its summary);
modify `commands/handoff.md` (step 3 item 7; step 4's State template).
**Seams:** ground-truth.sh's stdout for a repo with showcase branches.
**Interfaces:** produces the ground-truth section
`  showcase branches older than 14 days:` with lines
`    <ref>: <n> days old`.
**Verify:** `bash scripts/ground-truth.test.sh`

- [ ] Write the failing test, appended to `scripts/ground-truth.test.sh`
  before its final summary, using the file's own `check`, `has`, `lacks`,
  `git_q` and `run`:

```bash
# Showcase branches: one past 14 days is listed with its age, one inside it is not.
git_q init -q "$T/show" && (
  cd "$T/show" || exit 1
  git symbolic-ref HEAD refs/heads/main
  git_q commit --allow-empty -m first
  old=$(( $(date +%s) - 20 * 86400 )) new=$(( $(date +%s) - 5 * 86400 ))
  git_q checkout -b showcase/2026-01-01-old &&
    GIT_COMMITTER_DATE="@$old" git_q commit --allow-empty -m old
  git_q checkout -b showcase/2026-01-02-new main &&
    GIT_COMMITTER_DATE="@$new" git_q commit --allow-empty -m new
  git_q checkout main
)
run "$T/show.txt" --no-fetch "$T/show"
check "showcase past 14 days: listed under its header" has "$T/show.txt" "  showcase branches older than 14 days:"
check "showcase past 14 days: its age" has "$T/show.txt" "    showcase/2026-01-01-old: 20 days old"
check "showcase inside 14 days: not listed" lacks "$T/show.txt" "showcase/2026-01-02-new"
```

- [ ] Run it; expected failure: the three new checks FAIL (copy the first
  FAIL line from the run).
- [ ] Implementation, in `scripts/ground-truth.sh` after the block that
  prints `branches with no worktree`:

```bash
  # Showcase branches (from /perturb) past 14 days, local or pushed: /handoff asks the owner to delete or keep
  # each. 14 is a placeholder number, revisited at the review cadence.
  SHOWCASE_DAYS=14
  now=$(date +%s)
  old=$(git -C "$repo" for-each-ref --format='%(committerdate:unix) %(refname:short)' \
    refs/heads/showcase "refs/remotes/$REMOTE/showcase" |
    awk -v now="$now" -v d="$SHOWCASE_DAYS" '$1 < now - d * 86400 { printf "    %s: %d days old\n", $2, (now - $1) / 86400 }')
  if [ -n "$old" ]; then
    echo "  showcase branches older than $SHOWCASE_DAYS days:"
    printf '%s\n' "$old"
  fi
```

- [ ] In `commands/handoff.md` step 3, append to item 7: "If ground truth
  lists showcase branches older than 14 days, ask the owner, per branch:
  delete or keep."
- [ ] In `commands/handoff.md` step 4's template, end the State paragraph's
  placeholder with `; Rulings asked of the owner: N; made by Claude: M>`
  in place of `>`, and add to the Rules paragraph: "N counts questions the
  owner answered this session; M counts `Ruling (Claude)` entries logged."
- [ ] Run it; expected: `ground-truth.test.sh` all passed.
- [ ] Mutant runs, one at a time against the full suite, restored after
  each: (a) `SHOWCASE_DAYS=14` to `SHOWCASE_DAYS=25`: "showcase past 14
  days" fails; (b) `SHOWCASE_DAYS=14` to `SHOWCASE_DAYS=3`: "showcase
  inside 14 days: not listed" fails; (c) delete `refs/heads/showcase` from
  the for-each-ref line: "showcase past 14 days" fails.
- [ ] Commit: `Ground truth: flag showcase branches past 14 days`, body: the
  placeholder, and the count line's purpose (measure the ruling load).

### T6: setup, template, docs and CI

**Depends on:** T1, T2, T3, T4, T5
**Files:** modify `.claude/skills/setup-config/SKILL.md` (Round 1 item 6;
step 8 Draft, a new item after 5; step 10 Verify);
`templates/charter.template.md` (The two-way deal; Working protocol);
`README.md` (What you get; Daily use); `CLAUDE.md` (Verify line);
`.github/workflows/test.yml` (three steps).
**Seams:** CI itself: the workflow runs every suite on Linux and macOS.
**Interfaces:** consumes every file T1 to T5 create.
**Verify:** the plan header's Verify command, then
`grep -rn $'\xe2\x80\x94' README.md CLAUDE.md templates .claude skills/perturb skills/frames scripts/commit-scan.sh scripts/perturb-guard.mjs`
prints nothing, and
`grep -rnE '\b[KRL][0-9]{1,3}[a-z]?\b' skills/perturb skills/frames scripts/commit-scan* scripts/perturb-* docs/perturb-plan.md`
prints nothing.

- [ ] setup-config Round 1 item 6: after "deleted right after.", add:
  "Separately: `/perturb`'s commit scan needs these values on this disk, in
  an untracked `~/.claude/scan-patterns.local`, to refuse commits that
  contain them. Keep them there? Without the list, `/perturb` refuses every
  commit."
- [ ] setup-config step 8, new item 6 (renumber the following items):
  "**Scan list**, only if they said keep: `~/.claude/scan-patterns.local`,
  one rule per line, `<label><TAB><regex>`, the label the category's
  third-person name, the regex the value with regex characters escaped,
  plus `home path<TAB>(C:\\\\Users\\\\|/Users/|/home/)<login>` when the
  login name was given. Never shown in the step 9 summary; say only how
  many rules it holds."
- [ ] setup-config step 10, a new check: "**Scan list**, if written:
  `bash ~/.claude/scripts/commit-scan.sh ~/.claude` exits 0 (no installed
  file holds a value); report the exit code only."
- [ ] Charter template, The two-way deal, a new last bullet:
  "- **Conjugate pass:** each side hunts the other's blind sides. A task's
  closing report ends with 0 to 2 conjugate bets, orthogonal to the
  owner's framing, each naming its generator and the assumption it breaks
  (the `frames` skill holds the generators and checks). Claude names one
  unexamined premise per session; the owner may answer \"median answer\"
  and gets a non-median alternative."
- [ ] Charter template, Working protocol, after the Unattended-runs bullet:
  "- Under `/perturb`, Claude rules unasked on everything except what a
  student or end user would see, interfaces, formats, spec words, spend
  beyond the budget, merges and deploys; a preflight budget in agents
  replaces the cost gate."
- [ ] README What you get, three rows after `/build`: `/perturb` ("Works
  with wide latitude toward an ambitious result on a showcase branch you
  mine; a hook refuses default-branch and force pushes, merges, config
  writes and agents past the budget. Needs node."); `frames` ("Generators
  and checks for the 0 to 2 bets that end a task's report."); and in the
  Ground truth row, add "`commit-scan.sh` refuses a `/perturb` commit that
  holds a value from your untracked scan list."
- [ ] `CLAUDE.md` Verify bullet: list all five suites as in the plan
  header, and add "`node --test` needs node 20 or later."
- [ ] `.github/workflows/test.yml`, after the build-stop-gate step:

```yaml
      - if: ${{ !cancelled() }}
        run: bash scripts/commit-scan.test.sh
      - if: ${{ !cancelled() }}
        run: node --test scripts/perturb-guard.test.mjs
      - if: ${{ !cancelled() }}
        run: bash scripts/perturb-hook.test.sh
```

- [ ] Run the Verify lines; expected: all five suites pass, both greps
  print nothing.
- [ ] Commit: `Docs and CI: /perturb, frames, commit scan`, body: the
  consent step and why CI runs node.

## After merge (the owner's word, not /build)

1. A docs commit on main removes `docs/perturb-plan.md`,
   `BUILD-PROGRESS.md` and `BUILD-REPORT-*.md`.
2. Copy `skills/perturb/`, `skills/frames/`, `scripts/commit-scan.sh` and
   `scripts/perturb-guard.mjs` into `~/.claude`, with the updated
   `ground-truth.sh` and `commands/handoff.md`; whitelist the two skill
   folders in `~/.claude/.gitignore`.
3. Write `~/.claude/scan-patterns.local` from the owner's private values.
4. Add the charter line from the spec's section 8 to `~/.claude/CLAUDE.md`.
5. Delete `~/.claude/skills/hookprobe/` (the drafting session's probe).

## Overnight readiness

Every task names its seams and verify command. T5 is not ready while pull
requests #8 and #9 are open (same files). Attended `/build` can run T1 to
T4 now.
