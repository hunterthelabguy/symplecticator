# /perturb implementation plan

**Goal:** a user-only `/perturb` command under which Claude works with wide
latitude toward an ambitious result on a showcase branch, while one
PreToolUse hook, not prose, refuses the actions that could break anything.
**Architecture:** `/perturb`'s skill frontmatter registers one PreToolUse hook,
a bash wrapper that runs `perturb-guard.mjs` (node, no dependencies) and
refuses if node or the guard script is missing. The guard refuses
default-branch and force pushes, merges, writes to or removal of protected
config paths, and every Agent, Workflow, PowerShell, terminal run tool and
PR auto-merge call; on `git commit` it runs `commit-scan.sh`, which scans the
tracked files (index and working tree) and the message against an untracked
pattern list. A model-invocable `frames` skill holds the generators and
checks the bets draw on; ground truth flags old showcase branches;
`/handoff` carries a ruling count.
**Spec:** `~/.claude/specs/perturb.md` (the owner's private copy; this plan
carries everything a task needs, and the spec decides where they differ).
**Verify:** `bash scripts/ground-truth.test.sh && bash scripts/build-stop-gate.test.sh && bash scripts/commit-scan.test.sh && node --test scripts/perturb-guard.test.mjs && bash scripts/perturb-hook.test.sh`

This plan file, `BUILD-PROGRESS.md` and `BUILD-REPORT-<date>.md` live on the
build branch only. They reach main with the merge, and one docs commit on
main removes them right after (see "After merge").

Folded 2026-11-20: executing critique pass 1 and the owner's rulings on it.
Agent and Workflow are refused on every call (a subagent's tool calls never
reached a frontmatter hook in the critique's run), so the agent budget, its
no-op, counter, folder and tests are gone; PowerShell, the terminal run tool
and PR auto-merge are refused; `git commit -F -` is refused; the scan list is
protected. Every code block below was built in a scratch tree of 9717339 and
run on Windows (Git Bash, node 24); each red and green line quoted is from
those runs.

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
  exit 1 and exit 127 let the call through, so the hook command ends
  `|| exit 2` (a missing guard script would otherwise switch the guard off).
  A skill's frontmatter PreToolUse hook fires once the skill is invoked and
  stays for the session, in the main conversation only: a subagent's tool
  calls never reached it.
- Hook input is JSON on stdin with at least `session_id`, `cwd`,
  `tool_name` and `tool_input`; the probe matched Bash only and saw Bash's
  `tool_input.command`. Edit and Write's `file_path` and NotebookEdit's
  `notebook_path` are from Claude Code's documented tool inputs, not from
  the probe. The guard needs no other field (no session id: there is no
  per-session state).
- The guard fails closed: any input it cannot read, and any error it throws,
  exits 2.
- Every refusal message starts `perturb-guard: refused ` and ends
  `. Ask the owner; if you approve, run it yourself.`
- Protected paths, under the home directory's `.claude`: `settings.json`,
  `settings.local.json`, `CLAUDE.md`, `PERSONAL-ADDENDUM.md`,
  `scan-patterns.local`, everything under `scripts/` and `skills/perturb/`;
  plus the working repo's `.claude/settings.json` and
  `.claude/settings.local.json`. `LEDGER.md` and `COSTS.md` are not
  protected.
- The default branch is `refs/remotes/origin/HEAD`'s target, else `main`.
  On a repo whose default is `master` and that has no `origin/HEAD`, pushes
  to `master` pass: the spec's fallback is kept as written, and noted here.
- Showcase branches are named `showcase/<YYYY-MM-DD>-<topic>`; ground truth
  flags any whose newest commit is older than 14 days (a placeholder
  number, revisited at the review cadence).
- The ruling-count line is `Rulings asked of the owner: N; made by Claude: M`.
  N counts the rulings the owner made this session: questions put to the
  owner that the owner answered. M counts `Ruling (Claude)` entries logged.

## File map

| File | Change | Responsibility |
|---|---|---|
| `scripts/commit-scan.sh` | create | Scan tracked files (index and working tree) and a message file against the untracked pattern list |
| `scripts/commit-scan.test.sh` | create | Prove the scan can fail |
| `scripts/perturb-guard.mjs` | create | The PreToolUse dispatcher |
| `scripts/perturb-guard.test.mjs` | create | One fixture per refusal row, each with an allowed neighbor |
| `skills/perturb/SKILL.md` | create | The user-only command and its frontmatter hook |
| `scripts/perturb-hook.test.sh` | create | The frontmatter's matcher and hook command, run as written: node missing, guard missing, malformed input, an allowed call |
| `skills/frames/SKILL.md`, `skills/frames/frames-examples.md` | create | Generators and checks; real bets only |
| `scripts/ground-truth.sh`, `scripts/ground-truth.test.sh` | modify | Old showcase branches, local or pushed |
| `commands/handoff.md` | modify | Ask per old showcase branch; ruling-count line |
| `.claude/skills/setup-config/SKILL.md` | modify | Consent and write the pattern list; offer it in `update`; verify it |
| `templates/charter.template.md` | modify | Conjugate pass; the `/perturb` line |
| `README.md`, `CLAUDE.md`, `.github/workflows/test.yml` | modify | List the new pieces and a Daily use step; the verify line and CI run all five suites |

## Preflight (before `/build`)

Done in the drafting session, 2026-11-20: a throwaway skill with a
frontmatter PreToolUse hook (matcher Bash) confirmed exit 2 refuses, exits
1 and 127 pass, and the Bash input fields above. Nothing to run.

Open pull requests #8 and #9 also modify `scripts/ground-truth.sh`,
`scripts/ground-truth.test.sh` and `commands/handoff.md`; `git merge-tree`
of T5's change with either or both merges cleanly, so no task waits on
them.

---

### T1: commit-scan.sh

**Depends on:** none
**Files:** create `scripts/commit-scan.sh`; test `scripts/commit-scan.test.sh`
**Seams:** the command line `bash commit-scan.sh <repo> [<message file>]`:
its exit code and its stdout and stderr.
**Interfaces:** produces `commit-scan.sh <repo> [<message file>]`: exit 0
and no output when clean; exit 1 with `== <label>` headers and
`<file>:<line>:<text>` hits when anything matches; exit 1 with a line
starting `commit-scan: ` when the pattern list is missing, has no rules, has
a malformed line or a regex grep cannot read, when the message file is
missing, or when `<repo>` is not in a git repository; exit 2 on a usage
error. Scans from `<repo>`'s top level, the index (`git grep --cached`) and
the tracked files in the working tree (`git grep`). Reads
`$HOME/.claude/scan-patterns.local`: one rule per line,
`<label><TAB><extended regex>`, blank lines and lines starting `#` ignored,
CRLF endings and a last line with no newline accepted, matching
case-insensitive.
**Verify:** `bash scripts/commit-scan.test.sh`

- [ ] Write the failing test `scripts/commit-scan.test.sh`:

```bash
#!/usr/bin/env bash
#
# commit-scan.test.sh: prove commit-scan.sh can fail. A throwaway HOME holds the pattern list and a throwaway
# repo holds the files: a clean tree, a hit in a tracked file, a hit in a staged new file, a hit staged but gone
# from the working tree, a hit in an untracked file (not scanned: it is not part of the commit), a scan started
# from a subfolder, the second of two rules, case, a message file by absolute, relative and backslash path, a
# missing message file, a folder that is not a repo, a list with CRLF endings and no final newline, and the
# refusals that keep an empty or broken scan from reading as a pass (no list, a list with no rules, a malformed
# rule, a regex grep cannot read). Exit 0 = every check passed.
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
git init -q "$T/repo" && cd "$T/repo" && git config core.autocrlf false || exit 1
echo "nothing here" >clean.txt && mkdir sub && echo "nothing" >sub/s.txt && git add clean.txt sub && git commit -qm first

run "$T/out" "$T/repo"; code=$?
check "clean tree: exit 0" [ "$code" = 0 ]
check "clean tree: no output" empty "$T/out"

echo "qwopler was here" >tracked.txt && git add tracked.txt && git commit -qm tracked
run "$T/out" "$T/repo"; code=$?
check "hit in a tracked file: exit 1" [ "$code" = 1 ]
check "hit in a tracked file: the second rule's label" has "$T/out" "== login name"
check "hit in a tracked file: no label for the rule with no hit" lacks "$T/out" "== legal name"
check "hit in a tracked file: file and line" has "$T/out" "tracked.txt:1:qwopler was here"
run "$T/out" "$T/repo/sub"; code=$?
check "scan from a subfolder: still sees the top-level file" has "$T/out" "tracked.txt:1:qwopler was here"
git rm -q tracked.txt && git commit -qm untrack

echo "ZANZIBAR" >staged.txt && git add staged.txt
run "$T/out" "$T/repo"; code=$?
check "staged new file, other case: exit 1" [ "$code" = 1 ]
check "staged new file, other case: the first rule's label" has "$T/out" "== legal name"
echo "now clean" >staged.txt
run "$T/out" "$T/repo"; code=$?
check "hit staged, gone from the working tree: still found" has "$T/out" "staged.txt:1:ZANZIBAR"
git rm -q -f --cached staged.txt && rm staged.txt

echo "zanzibar" >untracked.txt
run "$T/out" "$T/repo"; code=$?
check "untracked file: not scanned, exit 0" [ "$code" = 0 ]
rm untracked.txt

printf 'subject\n\nsigned zanzibar\n' >"$T/msg.txt"
run "$T/out" "$T/repo" "$T/msg.txt"; code=$?
check "message file, absolute path: exit 1" [ "$code" = 1 ]
check "message file, absolute path: names the file" has "$T/out" "msg.txt:3:signed zanzibar"
(cd "$T" && bash "$SCAN" "$T/repo" msg.txt >"$T/out" 2>&1); code=$?
check "message file, relative path: the hit" has "$T/out" "msg.txt:3:signed zanzibar"
back=$(printf '%s' "$T/msg.txt" | tr '/' '\\')
run "$T/out" "$T/repo" "$back"; code=$?
check "message file, backslash path: the hit" has "$T/out" "msg.txt:3:signed zanzibar"
printf 'subject\n\nSigned QWOPLER\n' >"$T/upper-msg.txt"
run "$T/out" "$T/repo" "$T/upper-msg.txt"; code=$?
check "message file, other case: the hit" has "$T/out" "upper-msg.txt:3:Signed QWOPLER"
printf 'subject\n\nnothing private\n' >"$T/clean-msg.txt"
run "$T/out" "$T/repo" "$T/clean-msg.txt"; code=$?
check "clean message file: exit 0" [ "$code" = 0 ]
run "$T/out" "$T/repo" "$T/no-such-msg.txt"; code=$?
check "missing message file: exit 1" [ "$code" = 1 ]
check "missing message file: says so" has "$T/out" "commit-scan: no message file at"

mkdir "$T/plain"
run "$T/out" "$T/plain"; code=$?
check "not a repository: exit 1" [ "$code" = 1 ]
check "not a repository: says so" has "$T/out" "commit-scan: not a git repository:"

mv "$PAT" "$T/saved"
printf 'login name\tqwopler\r\nlegal name\tzanzibar' >"$PAT"
printf 'subject\n\nqwopler and zanzibar\n' >"$T/both-msg.txt"
run "$T/out" "$T/repo" "$T/both-msg.txt"; code=$?
check "CRLF list: the CRLF rule hits" has "$T/out" "== login name"
check "CRLF list: the last rule, with no newline, hits" has "$T/out" "== legal name"
printf 'bad regex\t(unclosed\n' >"$PAT"
run "$T/out" "$T/repo"; code=$?
check "a regex grep cannot read: exit 1" [ "$code" = 1 ]
check "a regex grep cannot read: names the line" has "$T/out" "commit-scan: rule on line 1"
rm "$PAT"
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

- [ ] Run it; expected failure: every check FAILs except
  `ok    hit in a tracked file: no label for the rule with no hit` (an
  absence check passes with nothing to read), since
  `scripts/commit-scan.sh` does not exist. The scratch run began
  `FAIL  clean tree: exit 0` and ended `commit-scan.test.sh: 30 FAILED`;
  copy the first FAIL line from your run into the commit body.
- [ ] Minimal implementation `scripts/commit-scan.sh`:

```bash
#!/usr/bin/env bash
#
# commit-scan.sh: the pre-commit privacy scan /perturb's guard runs before every git commit. From the repo's top
# level it scans the tracked files as staged (the index) and as they stand in the working tree (what `commit -a`
# would add); untracked files are not part of the commit. When given, it scans the commit message file too. The
# patterns are the owner's untracked list ~/.claude/scan-patterns.local: one rule per line,
# <label><TAB><extended regex>, blank and # lines ignored, matching case-insensitive. A missing list, a list with
# no rules, a malformed line, a regex grep cannot read, a missing message file and a folder that is not a repo all
# refuse (exit 1), because a scan that could not run would read as a pass.
#
# Usage: bash commit-scan.sh <repo> [<message file>]
# Exit 0 = clean; 1 = a hit, or a scan that could not run; 2 = usage error.

set -u
repo="${1:-}"
msg="${2:-}"
[ -n "$repo" ] || { echo "usage: commit-scan.sh <repo> [<message file>]" >&2; exit 2; }
pat="$HOME/.claude/scan-patterns.local"
if [ ! -f "$pat" ]; then
  echo "commit-scan: no pattern list at ~/.claude/scan-patterns.local; setup writes one. Refusing, since a scan with nothing to scan for would read as a pass."
  exit 1
fi
top=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || { echo "commit-scan: not a git repository: $repo"; exit 1; }
if [ -n "$msg" ]; then
  msg=$(printf '%s' "$msg" | tr '\\' '/')
  [ -f "$msg" ] || { echo "commit-scan: no message file at $msg; refusing, since an unread message would read as a pass."; exit 1; }
fi

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
  for where in --cached --no-cached; do
    out=$(git -C "$top" grep -n -I -i -E --no-color "$where" -e "$re" 2>&1)
    rc=$?
    [ "$rc" -le 1 ] || { echo "commit-scan: rule on line $n failed (git grep exit $rc): $out"; exit 1; }
    [ "$rc" = 0 ] && hits="${hits:+$hits$'\n'}$out"
  done
  if [ -n "$msg" ]; then
    out=$(grep -H -n -i -E -- "$re" "$msg" 2>&1)
    rc=$?
    [ "$rc" -le 1 ] || { echo "commit-scan: rule on line $n failed on the message (grep exit $rc): $out"; exit 1; }
    [ "$rc" = 0 ] && hits="${hits:+$hits$'\n'}$out"
  fi
  if [ -n "$hits" ]; then
    printf '== %s\n%s\n' "$label" "$(printf '%s\n' "$hits" | sort -u)"
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
  each (each was killed in the scratch run, by the check named):
  (a) delete `-i` from the `git grep` line: "staged new file, other case";
  (b) `for where in --cached --no-cached` to `for where in --no-cached`:
  "hit staged, gone from the working tree"; (c) `[ "$rules" = 0 ]` to
  `false`: "a list with no rules"; (d) delete the `tr '\\' '/'` line:
  "message file, backslash path"; (e) `git -C "$top" grep` to
  `git -C "$repo" grep`: "scan from a subfolder"; (f) replace the git grep
  `[ "$rc" -le 1 ]` test with `true`: "a regex grep cannot read";
  (g) replace `[ -f "$msg" ]` with `true`: "missing message file: says
  so"; (h) delete the CR strip: "CRLF list: the CRLF rule hits"; (i) delete
  `|| [ -n "$line" ]`: "the last rule, with no newline, hits"; (j) delete
  `-i` from the message grep: "message file, other case".
- [ ] Commit: `Scripts: commit-scan, the pre-commit privacy scan`, body: why
  a missing or empty list, a bad regex and a missing message refuse, and why
  the scan reads the index.

### T2: perturb-guard.mjs

**Depends on:** T1
**Files:** create `scripts/perturb-guard.mjs`; test `scripts/perturb-guard.test.mjs`
**Seams:** the process: hook JSON on stdin, exit code, stderr. Tests set
`HOME` and `USERPROFILE` to a throwaway directory, so `os.homedir()` and the
protected paths follow it.
**Interfaces:** consumes `commit-scan.sh` (T1) from the guard's own
directory, exit codes as T1 states (any nonzero exit refuses). Produces
`node perturb-guard.mjs`: exit 0 allows; exit 2 refuses with the global
refusal form, or with
`perturb-guard: refusing, the guard could not decide (<error>).` for
unreadable input or a thrown error.
**Verify:** `node --test scripts/perturb-guard.test.mjs`

The Bash parse is a tripwire for ordinary Claude style. It sees through
`( )`, `{ }`, `if`/`then`/`elif`/`else`, `while`/`until`/`do`, `!`, `time`,
`env`, `command`, `nohup`, env assignments, `git -C`, `git -c`, `cd`, `~`,
`$HOME` and `${HOME}`, and bash's double-quote backslash rule. It does not
see through `bash -c`, `xargs`, `$(...)`, other shell variables, `gh api`,
`perl -pi`, `node -e`, `curl -o`, `install`, `dd`, `ln`, `truncate` or `>|`.

- [ ] Write the failing test `scripts/perturb-guard.test.mjs`:

```js
// perturb-guard.test.mjs: prove perturb-guard.mjs can fail. Each refusal row of the spec has a fixture and an
// allowed neighbor beside it, run through the real process with a throwaway HOME, a throwaway repo whose origin
// HEAD names trunk (so a guard that assumes main fails), a second repo with no origin, and the real commit-scan.sh
// beside the guard.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'perturb-guard.mjs');
// realpath: macOS's temp folder is a symlink, and git reports the repo's real path.
const T = realpathSync(mkdtempSync(join(tmpdir(), 'perturb-guard-test-')));
after(() => rmSync(T, { recursive: true, force: true }));
const HOME = join(T, 'home');
const REPO = join(T, 'repo');
const OTHER = join(T, 'other');
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
sh(REPO, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
writeFileSync(join(REPO, 'a.txt'), 'clean\n');
sh(REPO, 'add', 'a.txt');
sh(REPO, 'commit', '-qm', 'first');
sh(REPO, 'remote', 'add', 'origin', join(T, 'origin.git'));
sh(REPO, 'push', '-q', 'origin', 'trunk');
sh(REPO, 'remote', 'set-head', 'origin', 'trunk');
sh(T, 'init', '-q', 'other');

function run(tool, input, { cwd = REPO, raw, guard = GUARD } = {}) {
  const stdin = raw ?? JSON.stringify({ session_id: 's', cwd, tool_name: tool, tool_input: input });
  const r = spawnSync(process.execPath, [guard], { input: stdin, env, encoding: 'utf8' });
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
const onFeat = (fn) => {
  sh(REPO, 'checkout', '-q', '-b', 'feat');
  try { fn(); } finally { sh(REPO, 'checkout', '-q', 'trunk'); sh(REPO, 'branch', '-q', '-D', 'feat'); }
};
const C = join(HOME, '.claude');

test('push: feature branch allowed, default branch refused', () => {
  allowed(bash('git push origin feat'));
  allowed(bash('git push -u origin showcase/2026-11-20-x'));
  allowed(bash('git push origin main'));
  refused(bash('git push origin trunk'), 'trunk');
  refused(bash('git push origin HEAD:trunk'), 'trunk');
  refused(bash('git push origin HEAD:refs/heads/trunk'), 'trunk');
});
test('push with no refspec, HEAD or @: refused on the default branch, allowed off it', () => {
  refused(bash('git push'), 'trunk');
  refused(bash('git push origin HEAD'), 'trunk');
  refused(bash('git push origin @'), 'trunk');
  onFeat(() => {
    allowed(bash('git push'));
    allowed(bash('git push origin'));
    allowed(bash('git push origin HEAD'));
    allowed(bash('git push origin @'));
  });
});
test('force push refused in every spelling; a plain upstream push allowed', () => {
  for (const c of ['git push -f origin feat', 'git push --force origin feat', 'git push -uf origin feat',
    'git push --force-with-lease origin feat', 'git push --force-with-lease=feat origin feat',
    'git push origin +feat']) refused(bash(c), 'force');
  allowed(bash('git push -u origin feat'));
});
test('--all, --mirror and glob refspecs refused, even off the default branch', () => {
  onFeat(() => {
    refused(bash('git push --all origin'), '--all');
    refused(bash('git push --mirror origin'), '--mirror');
    refused(bash("git push origin 'refs/heads/*:refs/heads/*'"), 'glob');
  });
});
test('remote branch deletion: showcase allowed, others refused', () => {
  allowed(bash('git push origin --delete showcase/2026-11-01-old'));
  allowed(bash('git push origin :showcase/2026-11-01-old'));
  refused(bash('git push origin --delete feature/x'), 'feature/x');
  refused(bash('git push origin -d feature/x'), 'feature/x');
  refused(bash('git push origin :feature/x'), 'feature/x');
});
test('git -C and cd reach the right repo; a repo with no origin HEAD falls back to main', () => {
  allowed(bash('git push origin trunk', { cwd: OTHER }));
  refused(bash('git push origin main', { cwd: OTHER }), 'main');
  refused(bash(`git -C "${REPO}" push origin trunk`, { cwd: OTHER }), 'trunk');
  refused(bash(`cd "${REPO}" && git push origin trunk`, { cwd: OTHER }), 'trunk');
  allowed(bash(`git -C "${REPO}" push origin feat`, { cwd: OTHER }));
  refused(bash('git -c core.x=y push origin trunk'), 'trunk');
});
test('prefixes and env assignments before git are skipped', () => {
  for (const c of ['MSYS_NO_PATHCONV=1 git push origin trunk', '(git push origin trunk)',
    '{ git push origin trunk; }', 'if git push origin trunk; then :; fi', 'if true; then git push origin trunk; fi',
    'if false; then :; elif git push origin trunk; then :; fi', 'if false; then :; else git push origin trunk; fi',
    'while git push origin trunk; do :; done', 'until git push origin trunk; do :; done',
    'for x in 1; do git push origin trunk; done', '! git push origin trunk', 'time git push origin trunk',
    'env X=1 git push origin trunk', 'command git push origin trunk', 'nohup git push origin trunk']) {
    refused(bash(c), 'trunk');
  }
});
test('gh pr merge refused; gh pr create allowed', () => {
  refused(bash('gh pr merge 12 --squash'), 'gh pr merge');
  allowed(bash('gh pr create --draft --title x --body y'));
});
test('commit: scan clean allowed, scan hit refused (tracked file and every message spelling)', () => {
  allowed(bash('git commit -m "a clean message"'));
  for (const c of ['git commit -m "signed zanzibar"', 'git commit -am "signed zanzibar"',
    'git commit --message "signed zanzibar"', 'git commit --message="signed zanzibar"', 'git commit -mzanzibar']) {
    refused(bash(c), 'zanzibar');
  }
  writeFileSync(join(T, 'msg.txt'), 'subject\n\nzanzibar\n');
  for (const f of ['-F', '--file']) refused(bash(`git commit ${f} "${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit --file="${join(T, 'msg.txt')}"`), 'zanzibar');
  writeFileSync(join(T, 'rel-msg.txt'), 'subject\n\nclean\n');
  writeFileSync(join(REPO, 'rel-msg.txt'), 'subject\n\nzanzibar\n');
  refused(bash(`git -C "${REPO}" commit -F rel-msg.txt`, { cwd: T }), 'zanzibar');
  rmSync(join(REPO, 'rel-msg.txt'));
  writeFileSync(join(REPO, 'b.txt'), 'zanzibar\n');
  sh(REPO, 'add', 'b.txt');
  refused(bash('git commit -m clean'), 'zanzibar');
  sh(REPO, 'rm', '-q', '--cached', 'b.txt');
  rmSync(join(REPO, 'b.txt'));
});
test('commit: a message from stdin refused', () => {
  refused(bash('git commit -F -'), 'stdin');
  refused(bash('git commit --file=-'), 'stdin');
});
test('commit: any nonzero scan exit refuses, not only 1', () => {
  const lone = join(T, 'lone');
  mkdirSync(lone, { recursive: true });
  copyFileSync(GUARD, join(lone, 'perturb-guard.mjs'));
  refused(bash('git commit -m clean', { guard: join(lone, 'perturb-guard.mjs') }), 'commit-scan.sh exited 127');
});
test('Edit and Write: repo files allowed, protected paths refused in every spelling', () => {
  allowed(run('Edit', { file_path: join(REPO, 'scripts', 'x.sh') }));
  allowed(run('Write', { file_path: join(C, 'LEDGER.md') }));
  allowed(run('Write', { file_path: join(C, 'COSTS.md') }));
  allowed(run('Write', { file_path: join(C, 'scripts-old', 'a.sh') }));
  allowed(run('Write', { file_path: join(C, 'skills', 'perturb-notes', 'a.md') }));
  refused(run('Edit', { file_path: join(C, 'scripts', 'ground-truth.sh') }), 'protected');
  refused(run('Write', { file_path: join(C, 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(C, 'CLAUDE.md') }), 'protected');
  refused(run('Write', { file_path: join(C, 'scan-patterns.local') }), 'protected');
  refused(run('Edit', { file_path: join(C, 'skills', 'perturb', 'SKILL.md') }), 'protected');
  refused(run('Edit', { file_path: `${C}/skills/other/../perturb/SKILL.md` }), 'protected');
  refused(run('Edit', { file_path: `${C}\\scripts\\a.sh` }), 'protected');
  refused(run('Write', { file_path: '~/.claude/settings.local.json' }), 'protected');
  refused(run('NotebookEdit', { notebook_path: join(C, 'scripts', 'n.ipynb') }), 'protected');
  refused(run('Write', { file_path: join(REPO, '.claude', 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(REPO, '.claude', 'settings.local.json') }), 'protected');
  allowed(run('Write', { file_path: join(REPO, '.claude', 'skills', 'x.md') }));
});
test('Windows spellings: /c/ form and other case refused', { skip: process.platform !== 'win32' }, () => {
  const slash = C.replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/');
  refused(run('Write', { file_path: `${slash}/settings.json` }), 'protected');
  refused(run('Write', { file_path: join(C.toUpperCase(), 'SETTINGS.JSON') }), 'protected');
});
test('Bash writes and removals in protected paths refused; the same elsewhere allowed', () => {
  refused(bash(`echo x > "${join(C, 'settings.json')}"`), 'protected');
  refused(bash(`echo x > "${C}\\settings.json"`), 'protected');
  refused(bash('echo x >> ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x >~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x > $HOME/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x > ${HOME}/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x | tee ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('cp a.txt ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('mv a.txt ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('sed -i.bak s/a/b/ ~/.claude/PERSONAL-ADDENDUM.md'), 'protected');
  refused(bash('sed --in-place s/a/b/ ~/.claude/PERSONAL-ADDENDUM.md'), 'protected');
  refused(bash('rm ~/.claude/scripts/perturb-guard.mjs'), 'protected');
  refused(bash('rm -rf ~/.claude'), 'protected');
  refused(bash(`mv ~/.claude/CLAUDE.md "${join(T, 'x')}"`), 'protected');
  allowed(bash(`echo x > "${join(T, 'free.txt')}"`));
  allowed(bash('cp a.txt b.txt'));
  allowed(bash('mv b.txt c.txt'));
  allowed(bash('rm c.txt ~/.claude/other.txt'));
  allowed(bash('cat ~/.claude/settings.json'));
});
test('Agent, Workflow, PowerShell, the terminal run tool and auto-merge always refused; other tools allowed', () => {
  for (const t of ['Agent', 'Workflow', 'PowerShell', 'mcp__terminal__run_in_terminal', 'mcp__ccd_pr__set_auto_merge']) {
    refused(run(t, { prompt: 'x' }), t);
  }
  allowed(run('Read', { file_path: join(C, 'settings.json') }));
  allowed(run('Grep', { pattern: 'x' }));
});
test('fails closed: malformed JSON, missing fields, a bad input shape', () => {
  for (const r of [run('Bash', {}, { raw: '{not json' }), run('Bash', {}, { raw: '{}' }),
    run('Bash', { nocommand: 1 }), run('Edit', {}),
    run('Bash', {}, { raw: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }) }),
    run('Bash', {}, { raw: JSON.stringify({ cwd: REPO, tool_name: 'Bash', tool_input: 'ls' }) })]) {
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /^perturb-guard: refusing, the guard could not decide \(/);
  }
});
```

- [ ] Run it; expected failure: all 16 tests fail (`ℹ pass 0`,
  `ℹ fail 16`). The child's stderr names the missing module, reported
  through the first `assert.equal(r.code, ...)`; the scratch run printed
  `AssertionError [ERR_ASSERTION]: node:internal/modules/cjs/loader:1459`
  and `code: 'MODULE_NOT_FOUND'`. Copy the first failing assertion line
  from your run into the commit body.
- [ ] Minimal implementation `scripts/perturb-guard.mjs`:

```js
#!/usr/bin/env node
//
// perturb-guard.mjs: the PreToolUse hook /perturb registers from its frontmatter, active from invocation to the
// end of that session. It refuses (exit 2, reason on stderr) what could break something while Claude works with
// wide latitude: pushes to the default branch, force pushes, --all, --mirror and glob refspecs, gh pr merge,
// deleting a remote branch outside showcase/, writes to or removal of the owner's protected config, and git commit
// -F - (a message from stdin is not scanned). Before every other git commit it runs commit-scan.sh beside it.
// Agent and Workflow are refused on every call, since a subagent's tool calls never reach a frontmatter hook;
// PowerShell, the terminal run tool and PR auto-merge are refused on every call, since they reach a push or a
// merge this guard does not parse. It is a tripwire, not a sandbox: a script Claude writes can still push or
// write anywhere.
//
// Fails closed: input it cannot read and any error it throws exit 2, since Claude Code lets a hook's other exit
// codes through.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WIN = process.platform === 'win32';
const HOME = homedir();
const CLAUDE = join(HOME, '.claude');
const HERE = dirname(fileURLToPath(import.meta.url));

class Refusal extends Error {}
function refuse(what, why) {
  throw new Refusal(`perturb-guard: refused ${what}: ${why}. Ask the owner; if you approve, run it yourself.`);
}

// Tools refused on every call, with the reason.
const ALWAYS = {
  Agent: "a subagent's tool calls never reach this guard",
  Workflow: "its agents' tool calls never reach this guard",
  PowerShell: 'this guard parses only the Bash tool',
  mcp__terminal__run_in_terminal: 'this guard parses only the Bash tool',
  mcp__ccd_pr__set_auto_merge: "merges are the owner's",
};

// A path as the shell meant it: ~, $HOME and ${HOME} expanded, Git Bash's /c/... read as C:/... on Windows, made
// absolute.
function toPath(p, cwd) {
  let s = String(p).replace(/^(~|\$HOME|\$\{HOME\})(?=$|[\\/])/, () => HOME);
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
// origin's HEAD, else main (the spec's fallback, kept as written).
function defaultBranch(repo) {
  const ref = git(repo, 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD');
  return ref ? ref.slice(ref.indexOf('/') + 1) : 'main';
}
const currentBranch = (repo) => short(git(repo, 'symbolic-ref', '-q', 'HEAD'));

function protectedRules(cwd) {
  const rules = ['settings.json', 'settings.local.json', 'CLAUDE.md', 'PERSONAL-ADDENDUM.md', 'scan-patterns.local']
    .map((f) => ({ path: norm(join(CLAUDE, f), cwd) }));
  for (const d of [join(CLAUDE, 'scripts'), join(CLAUDE, 'skills', 'perturb')]) {
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
// Removing a folder removes what is under it.
function holdsProtected(p, cwd, rules) {
  const t = norm(p, cwd);
  return isProtected(p, cwd, rules) || rules.some((r) => r.path.startsWith(t + '/'));
}

// A shell command split into simple commands (on newlines, ;, &, |, parentheses) of tokens, quotes removed; > and
// >> kept as their own tokens. Inside double quotes a backslash escapes only what bash lets it escape.
function segments(cmd) {
  const segs = [];
  let toks = [], cur = '', has = false, q = null;
  const endTok = () => { if (has) toks.push(cur); cur = ''; has = false; };
  const endSeg = () => { endTok(); if (toks.length) segs.push(toks); toks = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length && '$`"\\\n'.includes(cmd[i + 1])) cur += cmd[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === '\\' && i + 1 < cmd.length) { cur += cmd[++i]; has = true; continue; }
    if ('\n;&|()'.includes(c)) { endSeg(); continue; }
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
// Words that run the command after them: reserved words, and wrappers that run their arguments.
const PREFIX = new Set(['{', 'if', 'then', 'elif', 'else', 'do', 'while', 'until', '!', 'time', 'env', 'command', 'nohup']);

// The command's words: redirections dropped, then leading prefixes and env assignments.
function words(toks) {
  const w = toks.filter((t, i) => !isRedir(t) && !isRedir(toks[i - 1]));
  while (w.length && (PREFIX.has(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w.shift();
  return w;
}

// Paths the command writes, and paths it removes (rm's arguments, mv's sources).
function targets(toks) {
  const writes = [], removes = [];
  toks.forEach((t, i) => { if (isRedir(t) && toks[i + 1] !== undefined) writes.push(toks[i + 1]); });
  const [cmd, ...args] = words(toks);
  const plain = args.filter((a) => !a.startsWith('-'));
  if (cmd === 'tee') writes.push(...plain);
  if ((cmd === 'cp' || cmd === 'mv') && plain.length) writes.push(plain[plain.length - 1]);
  if (cmd === 'mv') removes.push(...plain.slice(0, -1));
  if (cmd === 'rm') removes.push(...plain);
  if (cmd === 'sed' && args.some((a) => /^-i/.test(a) || a.startsWith('--in-place')) && plain.length) {
    writes.push(plain[plain.length - 1]);
  }
  return { writes, removes };
}

function gitArgs(w) {
  let i = 0, dir = null;
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C') { dir = w[i + 1]; i += 2; } else if (w[i] === '-c') i += 2; else i += 1;
  }
  return { sub: w[i], rest: w.slice(i + 1), dir };
}

function checkPush(rest, repo) {
  const flags = rest.filter((a) => a.startsWith('-'));
  const pos = rest.filter((a) => !a.startsWith('-'));
  const force = flags.some((f) => f === '--force' || f.startsWith('--force-with-lease') ||
    (/^-[a-zA-Z]+$/.test(f) && f.includes('f')));
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

function checkCommit(rest, repo) {
  const msgs = [];
  let file = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--message') msgs.push(rest[++i] ?? '');
    else if (a.startsWith('--message=')) msgs.push(a.slice(10));
    else if (/^-[a-zA-Z]*m$/.test(a)) msgs.push(rest[++i] ?? '');
    else if (/^-m./.test(a)) msgs.push(a.slice(2));
    else if (a === '-F' || a === '--file') file = rest[++i] ?? '';
    else if (a.startsWith('--file=')) file = a.slice(7);
  }
  if (file === '-') refuse('git commit -F -', 'a message from stdin is not scanned; use -m or -F <file>');
  let tmp = null;
  if (msgs.length) {
    tmp = mkdtempSync(join(tmpdir(), 'perturb-msg-'));
    file = join(tmp, 'msg');
    writeFileSync(file, msgs.join('\n\n'));
  } else if (file !== null) {
    file = toPath(file, repo); // git -C runs git in that folder, so -F is relative to it
  }
  const r = spawnSync('bash', [join(HERE, 'commit-scan.sh'), repo, ...(file !== null ? [file] : [])], { encoding: 'utf8' });
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) {
    refuse('git commit', `commit-scan.sh exited ${r.status}:\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim()}\n`);
  }
}

function bash(command, cwd) {
  const rules = protectedRules(cwd);
  for (const toks of segments(command)) {
    const { writes, removes } = targets(toks);
    for (const t of writes) {
      if (isProtected(t, cwd, rules)) refuse(`a write to ${t}`, 'it is protected config under /perturb');
    }
    for (const t of removes) {
      if (holdsProtected(t, cwd, rules)) refuse(`removing ${t}`, 'it is or holds protected config under /perturb');
    }
    const [cmd, ...rest] = words(toks);
    if (cmd === 'cd' && rest[0]) { cwd = toPath(rest[0], cwd); continue; }
    if (cmd === 'gh' && rest[0] === 'pr' && rest[1] === 'merge') refuse('gh pr merge', "merges are the owner's");
    if (cmd === 'git') {
      const { sub, rest: args, dir } = gitArgs(rest);
      const repo = dir ? toPath(dir, cwd) : cwd;
      if (sub === 'push') checkPush(args, repo);
      if (sub === 'commit') checkCommit(args, repo);
    }
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const { tool_name: tool, tool_input: ti, cwd } = input ?? {};
  if (typeof tool !== 'string' || typeof cwd !== 'string' || !ti || typeof ti !== 'object') {
    throw new Error('unexpected hook input shape');
  }
  if (Object.hasOwn(ALWAYS, tool)) return refuse(tool, `${ALWAYS[tool]}, so it is off under /perturb`);
  switch (tool) {
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
      return bash(ti.command, cwd);
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

- [ ] Run it; expected: `ℹ pass 16`, `ℹ fail 0` (on Linux and macOS the
  Windows-spellings test is skipped: `ℹ pass 15`, `ℹ skipped 1`).
- [ ] Mutant runs, one at a time against the full T2 suite, restored after
  each (each was killed in the scratch run, by the test named):
  (a) in `checkPush`, delete `|| (/^-[a-zA-Z]+$/.test(f) && f.includes('f'))`:
  "force push refused in every spelling"; (b) revert the double-quote
  backslash rule to unescape every character: "Bash writes and removals",
  "commit" and "git -C and cd" (Windows paths in double quotes);
  (c) delete `'scan-patterns.local'` from the protected list: "Edit and
  Write"; (d) delete the `cd` line in `bash`: "git -C and cd";
  (e) the catch's `process.exit(2)` to `process.exit(1)`: every refusal
  test; (f) delete the `while` in `words` that drops prefixes and env
  assignments: "prefixes and env assignments"; (g) `defaultBranch` always
  returns `'main'`: both push tests, "git -C and cd" and "prefixes";
  (h) `-C` never sets `dir`: "git -C and cd" and "commit"; (i) drop
  `--all` from the flag check: "--all, --mirror and glob refspecs";
  (j) `r.status !== 0` to `r.status === 1`: "any nonzero scan exit";
  (k) resolve `-F` against the shell's cwd, not the `git -C` folder:
  "commit"; (l) drop the glob refusal: "--all, --mirror and glob
  refspecs"; (m) drop `|| dst === '@'`: "push with no refspec, HEAD or
  @"; (n) removals checked with `isProtected`, not `holdsProtected`:
  "Bash writes and removals" (`rm -rf ~/.claude`); (o) delete the `mv`
  sources line: same test; (p) delete the `rm` line: same test; (q) drop
  `$HOME` and `${HOME}` from `toPath`: same test; (r) parentheses not
  separators: "prefixes"; (s) delete `PowerShell` from `ALWAYS`: "Agent,
  Workflow, PowerShell"; (t) drop the `-F -` refusal: "a message from
  stdin"; (u) drop `--in-place`: "Bash writes and removals"; (v) delete
  the `/c/` line in `toPath`: "Windows spellings" (Windows only);
  (w) `r.path + '/'` to `r.path` in `isProtected`: "Edit and Write"
  (`scripts-old`); (x) the repo list without `settings.local.json`: "Edit
  and Write"; (y) `-c` skips one word, not two: "git -C and cd";
  (z) delete the `-mX` branch: "commit".
- [ ] Commit: `Scripts: perturb-guard, the /perturb PreToolUse hook`, body:
  the tripwire-not-sandbox limit, and why Agent and the other shells are
  refused outright.

### T3: the /perturb skill and its hook command

**Depends on:** T2
**Files:** create `skills/perturb/SKILL.md`; test `scripts/perturb-hook.test.sh`
**Seams:** the frontmatter's matcher and hook `command` string, the command
run exactly as written by `bash -c`.
**Interfaces:** consumes `node ~/.claude/scripts/perturb-guard.mjs` (T2).
Produces the user-only skill `perturb`, the matcher
`Bash|Edit|Write|NotebookEdit|Agent|Workflow|PowerShell|mcp__terminal__run_in_terminal|mcp__ccd_pr__set_auto_merge`,
and the hook command
`command -v node >/dev/null || { echo 'perturb-guard: node not found, refusing' >&2; exit 2; }; node ~/.claude/scripts/perturb-guard.mjs || exit 2`.
**Verify:** `bash scripts/perturb-hook.test.sh`

- [ ] Write the failing test `scripts/perturb-hook.test.sh`:

```bash
#!/usr/bin/env bash
#
# perturb-hook.test.sh: run the hook command from skills/perturb/SKILL.md's frontmatter exactly as written, with
# a throwaway HOME holding the scripts where setup installs them: the matcher names every tool the guard refuses,
# node hidden from PATH refuses (exit 2), the guard script missing refuses, unreadable input refuses, and an
# allowed call passes. Exit 0 = every check passed.
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

MATCHER='matcher: "Bash|Edit|Write|NotebookEdit|Agent|Workflow|PowerShell|mcp__terminal__run_in_terminal|mcp__ccd_pr__set_auto_merge"'
check "the matcher names every tool the guard refuses" grep -qF -- "$MATCHER" "$SKILL"
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

mv "$HOME/.claude/scripts/perturb-guard.mjs" "$T/saved.mjs"
printf '{"session_id":"s","cwd":"%s","tool_name":"Read","tool_input":{"file_path":"x"}}' "$T" |
  "$BASH_BIN" -c "$cmd" >"$T/out" 2>&1; code=$?
check "guard script missing: exit 2" [ "$code" = 2 ]

echo
if [ "$failures" -gt 0 ]; then echo "perturb-hook.test.sh: $failures FAILED, $skipped skipped"; exit 1; fi
echo "perturb-hook.test.sh: all passed, $skipped skipped"
```

- [ ] Run it; expected failure: with `skills/perturb/SKILL.md` missing,
  the command is empty and `bash -c ""` exits 0, so every check FAILs
  except "an allowed call: exit 0" (grep and sed also report the missing
  file). The scratch run printed:

```text
FAIL  the matcher names every tool the guard refuses
FAIL  the frontmatter has one hook command
FAIL  node missing: exit 2
FAIL  node missing: says so
FAIL  unreadable input: exit 2
FAIL  unreadable input: the could-not-decide line
ok    an allowed call: exit 0
FAIL  guard script missing: exit 2
perturb-hook.test.sh: 7 FAILED, 0 skipped
```

  Copy the FAIL lines from your run.
- [ ] Minimal implementation `skills/perturb/SKILL.md`:

````markdown
---
name: perturb
description: Work with wide latitude toward an ambitious result on a showcase branch to mine, with a hook refusing what could break anything. User-only; lasts the session.
disable-model-invocation: true
argument-hint: "<the problem or direction>"
hooks:
  PreToolUse:
    - matcher: "Bash|Edit|Write|NotebookEdit|Agent|Workflow|PowerShell|mcp__terminal__run_in_terminal|mcp__ccd_pr__set_auto_merge"
      hooks:
        - type: command
          shell: bash
          command: "command -v node >/dev/null || { echo 'perturb-guard: node not found, refusing' >&2; exit 2; }; node ~/.claude/scripts/perturb-guard.mjs || exit 2"
          timeout: 30
---

# /perturb

Arguments: $ARGUMENTS

The owner points a direction; you find out what is possible. Be ambitious:
the result is a showcase branch the owner mines, never merges whole, so a
large diff is welcome. The guard in this skill's frontmatter holds the
floor from now to the end of the session: it refuses pushes to the default
branch, force pushes, `gh pr merge`, deleting remote branches outside
`showcase/`, writes to or removal of the owner's protected config, and
`git commit -F -`; it scans every other commit for private values. It
refuses every Agent and Workflow call (a subagent's tool calls never reach
the guard), and every PowerShell, terminal run tool and PR auto-merge call
(routes to a push or a merge the guard does not parse). A refusal is not
an obstacle to route around: say what was refused and why you wanted it,
and the owner runs it if they approve. The guard is a tripwire, not a
sandbox; never write a script to do what it refuses.

Leaving `/perturb` means starting a new session; the default there is the
owner's full charter.

After the session is resumed or compacted, the guard may no longer be
registered. Before any write, push or commit, stop and ask the owner to run
`/perturb` again.

## 1. Preflight (one short turn)

1. Check: `node --version` answers; the working tree is clean; the repo's
   CLAUDE.md names a verify command. Any missing: say so and stop.
2. State the goal in one line, then what "possible" might look like in two
   or three sentences.
3. Ask one question: go, with the branch name
   `showcase/<YYYY-MM-DD>-<topic>`?

## 2. Work

- Work in the main conversation only: no Agent, no Workflow. Use the Bash
  tool for shell work, never PowerShell or the terminal tool.
- Work in a worktree on the showcase branch, pushed so it survives the
  machine.
- You rule unasked on everything except: what a student or end user would
  see, interfaces others depend on, file formats, the spec's words, merges,
  and deploys. Those you ask. Log each call you make at once in the report
  draft as `Ruling (Claude): <what>; why: <reason>; cost if wrong: <cost>`.
- The floor holds on every commit: tests and typecheck green before it, the
  commit form of the charter. Red exploration stays uncommitted or is
  reverted. Commit messages go by `-m` or `-F <file>`, both scanned.
- Draw on the `frames` skill for directions the owner's framing hides.
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
5. Mineable pieces, each with an order-of-magnitude estimate of cost,
   complexity, time and risk against its payoff.
6. Zero to two conjugate bets, each naming its generator and the assumption
   it breaks.
7. `Rulings asked of the owner: N; made by Claude: M`, where N counts the
   rulings the owner made this session (questions put to the owner that
   the owner answered) and M counts your `Ruling (Claude)` entries.
````

- [ ] Run it; expected: `perturb-hook.test.sh: all passed, 0 skipped` (or
  `1 skipped` where no PATH leaves out node and keeps bash, which the run
  must report).
- [ ] Mutant runs, one at a time against the full T3 suite, restored after
  each (each was killed in the scratch run, by the check named):
  (a) in the frontmatter command, the node-missing `exit 2` to `exit 1`:
  "node missing: exit 2" (or skipped where no PATH leaves out node, which
  the run must report); (b) `perturb-guard.mjs` in the command to
  `perturb-guard.js`: "an allowed call: exit 0" and "unreadable input: the
  could-not-decide line"; (c) delete the trailing `|| exit 2`: "guard
  script missing: exit 2"; (d) drop `PowerShell` from the matcher: "the
  matcher names every tool the guard refuses".
- [ ] Commit: `Skills: /perturb, latitude behind a hook`, body: why the hook
  lives in the frontmatter, why it ends `|| exit 2`, and why leaving means a
  new session.

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

**Depends on:** none
**Files:** modify `scripts/ground-truth.sh` (after the "branches with no
worktree" block, before "Open PRs with their CI and review verdicts");
modify `scripts/ground-truth.test.sh` (a new section before its final
`echo` and summary); modify `commands/handoff.md` (step 3 item 7; step 4's
State template and Rules paragraph).
**Seams:** ground-truth.sh's stdout for a repo with showcase branches.
**Interfaces:** produces the ground-truth section
`  showcase branches older than 14 days:` with lines
`    <ref>: <n> days old`, where `<ref>` is a local branch or
`origin/<branch>` for a pushed one.
**Verify:** `bash scripts/ground-truth.test.sh`

- [ ] Write the failing test, inserted in `scripts/ground-truth.test.sh`
  before its final `echo` and summary, using the file's own `check`, `has`,
  `lacks`, `git_q` and `run`. The "not listed" check asks for the line
  this section would print: the existing "branches with no worktree"
  section lists every local branch, showcase ones included.

```bash
# Showcase branches: a local one past 14 days is listed with its age, as is a pushed one no local branch holds;
# one inside 14 days is not.
git_q init -q --bare "$T/show-origin.git"
git_q init -q "$T/show" && (
  cd "$T/show" || exit 1
  git symbolic-ref HEAD refs/heads/main
  git_q commit --allow-empty -m first
  old=$(( $(date +%s) - 20 * 86400 )) new=$(( $(date +%s) - 5 * 86400 ))
  git_q checkout -b showcase/2026-01-01-old &&
    GIT_COMMITTER_DATE="@$old" git_q commit --allow-empty -m old
  git_q checkout -b showcase/2026-01-02-new main &&
    GIT_COMMITTER_DATE="@$new" git_q commit --allow-empty -m new
  git_q checkout -b showcase/2026-01-03-pushed main &&
    GIT_COMMITTER_DATE="@$old" git_q commit --allow-empty -m pushed
  git_q remote add origin "$T/show-origin.git"
  git_q push origin showcase/2026-01-03-pushed
  git_q checkout main
  git_q branch -D showcase/2026-01-03-pushed
)
run "$T/show.txt" --no-fetch "$T/show"
check "showcase past 14 days: listed under its header" has "$T/show.txt" "  showcase branches older than 14 days:"
check "showcase past 14 days: its age" has "$T/show.txt" "    showcase/2026-01-01-old: 20 days old"
check "showcase past 14 days, pushed only: listed" has "$T/show.txt" "    origin/showcase/2026-01-03-pushed: 20 days old"
check "showcase inside 14 days: not listed" lacks "$T/show.txt" "    showcase/2026-01-02-new: 5 days old"
```

- [ ] Run it; expected failure: the three listing checks FAIL; "showcase
  inside 14 days: not listed" passes (nothing prints it yet). The scratch
  run printed:

```text
FAIL  showcase past 14 days: listed under its header
FAIL  showcase past 14 days: its age
FAIL  showcase past 14 days, pushed only: listed
ok    showcase inside 14 days: not listed
3 check(s) FAILED, 0 skipped
```

- [ ] Implementation, in `scripts/ground-truth.sh` before the line
  `  # Open PRs with their CI and review verdicts.`, followed by one blank
  line:

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
  in place of `>`, and add to the Rules paragraph: "N counts the rulings
  the owner made this session: questions put to the owner that the owner
  answered; M counts `Ruling (Claude)` entries logged."
- [ ] Run it; expected: the suite ends `all checks passed, N skipped`.
- [ ] Mutant runs, one at a time against the full suite, restored after
  each (each was killed in the scratch run, by the check named):
  (a) `SHOWCASE_DAYS=14` to `SHOWCASE_DAYS=25`: the three "showcase past
  14 days" checks; (b) `SHOWCASE_DAYS=14` to `SHOWCASE_DAYS=3`: "showcase
  inside 14 days: not listed" (and the header check); (c) delete
  `refs/heads/showcase` from the for-each-ref line: "showcase past 14
  days: its age"; (d) delete `"refs/remotes/$REMOTE/showcase"`: "showcase
  past 14 days, pushed only: listed".
- [ ] Commit: `Ground truth: flag showcase branches past 14 days`, body: the
  placeholder, and the count line's purpose (measure the ruling load).

### T6: setup, template, docs and CI

**Depends on:** T1, T2, T3, T4, T5
**Files:** modify `.claude/skills/setup-config/SKILL.md` (`update` mode
step 3; Round 1 item 6; step 8 Draft, a new item 6; step 10 Verify);
`templates/charter.template.md` (The two-way deal; Working protocol);
`README.md` (What you get; Daily use); `CLAUDE.md` (Verify line);
`.github/workflows/test.yml` (header comment; three steps).
**Seams:** CI itself: the workflow runs every suite on Linux and macOS.
**Interfaces:** consumes every file T1 to T5 create.
**Verify:** the plan header's Verify command, then both greps below print
nothing. Every file the plan creates or modifies:

```bash
F="README.md CLAUDE.md templates .claude .github/workflows/test.yml commands/handoff.md skills/perturb skills/frames scripts/commit-scan.sh scripts/commit-scan.test.sh scripts/perturb-guard.mjs scripts/perturb-guard.test.mjs scripts/perturb-hook.test.sh scripts/ground-truth.sh scripts/ground-truth.test.sh docs/perturb-plan.md"
grep -rn $'\xe2\x80\x94' $F
grep -rnE '\b[KRL][0-9]{1,3}[a-z]?\b' $F
```

- [ ] setup-config `update` mode step 3: in "`skills/build`,
  `commands/handoff.md` and `scripts/` move together: `/build`'s Stop hook
  and `/handoff` run those scripts, so never install either at a version
  whose scripts are missing or kept at an older version.", make it
  "`skills/build`, `skills/perturb`, `commands/handoff.md` and `scripts/`
  move together: `/build`'s Stop hook, `/perturb`'s guard and `/handoff`
  run those scripts, so never install any of them at a version whose
  scripts are missing or kept at an older version." (an installed
  `skills/perturb` beside an older `scripts/` would run a guard that is not
  there).
- [ ] Same step: "Two exceptions are offered" becomes "Three exceptions are
  offered", the first two joined by semicolons, ending: "; and, when
  `~/.claude/scan-patterns.local` is absent, Round 1 item 6's separate
  question about the scan list, then the list as in step 8.6."
- [ ] setup-config Round 1 item 6: after "deleted right after.", add:
  "Separately: `/perturb`'s commit scan needs these values on this disk, in
  an untracked `~/.claude/scan-patterns.local`, to refuse commits that
  contain them. Keep them there? Without the list, `/perturb` refuses every
  commit."
- [ ] setup-config step 8, new item 6 (renumber the following items):
  "**Scan list**, only if they said keep: `~/.claude/scan-patterns.local`,
  one rule per line, `<label><TAB><regex>`, the label the category's
  third-person name, the regex the value with regex characters escaped,
  plus a home path rule when the login name was given. The file holds
  one backslash pair per Windows separator; for the login `jdoe` the
  line is `home path<TAB>(C:\\Users\\|/Users/|/home/)jdoe`, which
  matches `C:\Users\jdoe`, its forward-slash form and `/home/jdoe` in any
  case. Shown in step 9 like every other draft." (Checked in the scratch
  run: that rule, read from a file, matched all three forms under both
  `grep -i -E` and `git grep -i -E`, and not `C:Usersjdoe`.)
- [ ] setup-config step 10, a new check after "No private values":
  "**Scan list**, if written, and only if `~/.claude` is a git repository
  (`git -C ~/.claude rev-parse --show-toplevel` prints its own path):
  `bash ~/.claude/scripts/commit-scan.sh ~/.claude` exits 0 (no tracked
  file holds a value); report the exit code only. Otherwise say it was
  skipped: the No private values check covers the installed files."
- [ ] Charter template, The two-way deal, a new last bullet:
  "- **Conjugate pass:** each side hunts the other's blind sides. A task's
  closing report ends with 0 to 2 conjugate bets, orthogonal to the
  owner's framing, each naming its generator and the assumption it breaks
  (the `frames` skill holds the generators and checks). Claude names one
  unexamined premise per session; the owner may answer \"median answer\"
  and gets a non-median alternative."
- [ ] Charter template, Working protocol, after the Unattended-runs bullet:
  "- Under `/perturb`, Claude rules unasked on everything except what a
  student or end user would see, interfaces, formats, spec words, merges
  and deploys; it spawns no agents, so the cost gate has nothing to ask."
- [ ] README What you get, two rows after `/build`: `/perturb` ("Works
  with wide latitude toward an ambitious result on a showcase branch you
  mine; a hook refuses default-branch and force pushes, merges, config
  writes, agents, and the shells it cannot parse. Needs node."); `frames`
  ("Generators and checks for the 0 to 2 bets that end a task's report.");
  and in the Ground truth row, add "`commit-scan.sh` refuses a `/perturb`
  commit that holds a value from your untracked scan list."
- [ ] README Daily use, a last bullet: "- **`/perturb <direction>`** when
  you want to see how far an idea goes. Claude works alone on a showcase
  branch you mine later in a fresh session; to leave `/perturb`, start a
  new session."
- [ ] `CLAUDE.md` Verify bullet: list all five suites as in the plan
  header, and add "`node --test` needs node 20 or later."
- [ ] `.github/workflows/test.yml`: the header comment's first words
  "The two script suites" become "The test suites"; after the
  build-stop-gate step add:

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

Every task names its seams and verify command, and no task waits on an open
pull request. Attended `/build` can run T1 to T6 now.
