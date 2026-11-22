# /perturb implementation plan

**Goal:** a user-only `/perturb` command under which Claude works with wide
latitude toward an ambitious result on a showcase branch, while one
PreToolUse hook, not prose, refuses the actions that could break anything.
**Architecture:** `/perturb`'s skill frontmatter registers one PreToolUse hook
for every tool (matcher `.*`), a bash wrapper that runs `perturb-guard.mjs`
(node, no dependencies) and refuses if node or the guard script is missing.
The guard lets through a named list of safe tools and refuses every other
tool, MCP tools included. Of the safe tools it refuses writes to protected
config paths, and in Bash it refuses default-branch and force pushes,
merges, removal of protected config, and a commit or push that follows any
command but `cd` in the same call; on `git commit` it runs
`commit-scan.sh`, which scans the tracked files (index and working tree)
and the message against an untracked pattern list. A model-invocable
`frames` skill holds the generators and checks the bets draw on; ground
truth flags old showcase branches; `/handoff` carries a ruling count.
**Spec:** `~/.claude/specs/perturb.md` (the owner's private copy; this plan
carries everything a task needs, and the spec decides where they differ,
except where the owner's rulings on the two executing critiques amend it,
as the fold notes below say).
**Verify:** `bash scripts/ground-truth.test.sh && bash scripts/build-stop-gate.test.sh && bash scripts/commit-scan.test.sh && node --test scripts/perturb-guard.test.mjs && bash scripts/perturb-hook.test.sh`

This plan file, `BUILD-PROGRESS.md` and `BUILD-REPORT-<date>.md` live on the
build branch only. They reach main with the merge, and one docs pull request
removes them right after (see "After merge").

Folded 2026-11-20: executing critique pass 1 and the owner's rulings on it.
Agent and Workflow are refused on every call (a subagent's tool calls never
reached a frontmatter hook in the critique's run), so the agent budget, its
no-op, counter, folder and tests are gone; PowerShell, the terminal run tool
and PR auto-merge are refused; `git commit -F -` is refused; the scan list is
protected.

Folded 2026-11-21: executing critique pass 2 and the owner's rulings on it.
The Bash parse skips `#` comments and heredoc bodies and refuses a call
with a quote left open; it drops redirections with their descriptor and
target, knows `git push`'s options and refuses one it does not know, and
sees through `timeout`, `nice`, `exec`, `sudo`, line continuations and
`gh -R`. A `git commit` or `git push` after any command but `cd` in the
same call is refused (the scan reads the repo before the call runs). The
matcher is `.*` and the guard is an allow-list: the spec's "Others: never"
row and its separate refusal rows for Agent, Workflow, PowerShell, the
terminal tool and auto-merge become one rule, refuse every tool not on the
list. cp and mv into a protected folder, glob paths and the root are
caught; both checkouts' settings are protected; `-F` is read glued and in
clusters; the raw command is scanned with the message, and the scan has
its own timeout; a push or commit where git cannot answer is refused.
"spend" is back on the SKILL's ask-list. CI gains a Windows job for the
guard suite. Every code block below was built in a scratch tree of 9717339
and run on Windows (Git Bash, node 24); each red and green line quoted is
from those runs. Choices the rulings did not settle are marked "Choice for
the owner's review".

Folded 2026-11-22: executing critique pass 3 and the owner's rulings on it.
A recursive `cp` (`-r`, `-R`, `-a`) is refused when what lands holds
protected config. The commands inside `$(...)`, backticks, `<(...)` and
`>(...)`, quoted or not, are parsed and count as commands before the one
that holds them, so a commit or push call may hold no substitution but a
heredoc read with a quoted delimiter; `$((...))` hides nothing; `/c` alone
reads as `C:/`; `--fil` reads as `--file`. The browser's read-only tools
(navigate, read, find, resize, the tab list, and screenshots) join the safe
list, and the SKILL checks a result at phone width. The preflight gains a
probe of the hook's `cwd` after a `cd`. After merge step 3 changes
`leak-scan.sh` to read the login name at run time. New tests pin pass 3's
surviving mutants; the list of misses is extended. Every code block was
built again in a scratch tree of 9717339 on Windows, and every named mutant
run once.

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
  calls never reached it. That probe used matcher `Bash` and a
  model-invocable skill; the preflight below probes the matcher `.*`, a
  user-invoked skill and a hook timeout.
- The matcher `.*`, as Claude Code 2.1.330's own code reads it (checked in
  the installed binary during fold 2 and again by pass 3): for PreToolUse, a
  matcher that fits the class `/^[a-zA-Z0-9_|, -]+$/` (letters, digits, `_`,
  `|`, comma, space and hyphen) is a list of exact tool names, split on `|`
  or `,` (so `Edit` never matched `MultiEdit`); any other matcher is compiled with `new RegExp` and tested
  with `.test`, unanchored, so `.*` matches every tool name, MCP tools
  included; `*` and an empty matcher are also special-cased to match all.
  The same code rejects some regex matchers in cloud sessions; `.*` was not
  tried there. The hook's `timeout` field is "Timeout in seconds for this
  specific command" in the same version's settings schema; what happens to
  the tool call when it fires is unprobed (preflight). With `.*` the hook
  starts bash and node on every tool call: measured on Windows during this
  fold, through the hook command, medians of 10 calls were 210 ms for a
  Read, 255 ms for a refused MCP tool, 240 ms for an Edit and 309 ms for a
  Bash `ls` (node alone: 100 to 172 ms).
- Hook input is JSON on stdin with at least `session_id`, `cwd`,
  `tool_name` and `tool_input`; the probe saw Bash's `tool_input.command`.
  Edit, MultiEdit and Write's `file_path`, NotebookEdit's `notebook_path`
  and Skill's `skill` are from Claude Code's documented tool inputs, not
  from the probe. The guard needs no other field (no session id: there is
  no per-session state).
- The guard fails closed: any input it cannot read, and any error it throws,
  exits 2.
- Every refusal message starts `perturb-guard: refused ` and ends
  `. Ask the owner; if you approve, run it yourself.`
- Protected paths, under the home directory's `.claude`: `settings.json`,
  `settings.local.json`, `CLAUDE.md`, `PERSONAL-ADDENDUM.md`,
  `scan-patterns.local`, everything under `scripts/` and `skills/perturb/`;
  plus `.claude/settings.json` and `.claude/settings.local.json` in every
  checkout of the working repo (the main one and each worktree, from
  `git worktree list`). `LEDGER.md` and `COSTS.md` are not protected.
- The safe tools (Choice for the owner's review: the rulings name the
  first eight; the rest are this fold's, each with its reason):
  - Read, Grep, Glob: read only. Read stays allowed on protected paths,
    as `cat` of them does in Bash: the spec protects config from writes,
    and a literal "every tool carrying a `file_path`" would refuse reading
    the charter (Choice for the owner's review).
  - Bash: parsed (T2).
  - Edit, MultiEdit, Write, NotebookEdit: allowed after the path check.
  - Skill: only `frames`, which the SKILL names; any other skill could run
    in a forked context or start work the guard cannot see.
  - TodoWrite, `mcp__ccd_turn__update_plan`, `mcp__ccd_turn__wrap_up`:
    planning and the end-of-turn summary in the CLI and the desktop app;
    they change no file and run nothing, and refusing them would put a
    refusal in every turn.
  - AskUserQuestion: only asks the owner, which the flow needs.
  - ToolSearch: loads a deferred tool's schema; the tool itself still
    meets the guard.
  - WebSearch, WebFetch: read the web, write nothing local; research is
    part of finding what is possible.
  - The built-in browser's `mcp__Claude_Browser__navigate`, `read_page`,
    `get_page_text`, `find`, `resize_window` and `tabs_context`, and its
    `computer` tool only when `action` is `screenshot` or `zoom`: the
    owner's ruled scope, "navigate, screenshot, read and resize only;
    clicks and form input stay refused". `preview_start` (it starts a server
    from a config command), `javascript_tool`, `form_input`, `computer`
    clicks, typing, keys and scrolls, the console and network readers, and
    tab creation, selection and closing stay refused. The same tools under
    the `mcp__remote-devices__Claude_Browser__` prefix are not added (Choice
    for the owner's review): that prefix appears only in a cloud session
    linked to the owner's computer, where the hook runs in the cloud and
    `~/.claude/scripts/perturb-guard.mjs` is not installed, so the entries
    could not be reached or tested; add them with the same rule if
    `/perturb` ever runs there.
  Left off, so refused: TaskStop and other task tools (Bash's `kill`
  stops what Bash started), and every MCP tool not named above.
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
| `scripts/perturb-hook.test.sh` | create | The frontmatter's hooks block word for word, the user-only line, the guard's scan timeout under the hook's, and the hook command run as written: node missing, guard missing, an allowed call |
| `skills/frames/SKILL.md`, `skills/frames/frames-examples.md` | create | Generators and checks; real bets only |
| `scripts/ground-truth.sh`, `scripts/ground-truth.test.sh` | modify | Old showcase branches, local or pushed, each once |
| `commands/handoff.md` | modify | Ask per old showcase branch; ruling-count line |
| `.claude/skills/setup-config/SKILL.md` | modify | Consent and write the pattern list; offer it in `update`; show, record and verify it; node in step 0; the charter cap |
| `templates/charter.template.md` | modify | Conjugate pass; the `/perturb` line; the cap |
| `README.md`, `CLAUDE.md`, `.github/workflows/test.yml` | modify | List the new pieces, node and a Daily use step; the verify line says what runs where; CI runs all five suites on Linux and macOS and the guard suite on Windows |

## Preflight (before `/build`)

The owner runs this in a throwaway session, since it needs a user-invoked
skill; it records answers the design rests on, and changes no plan task
unless one fails.

1. Write `~/.claude/skills/perturb-probe/SKILL.md`: frontmatter
   `name: perturb-probe`, `disable-model-invocation: true`, and a hooks
   block shaped like T3's (`PreToolUse`, matcher `".*"`, `type: command`,
   `shell: bash`) with two entries. The first, `timeout: 30`, logs and
   refuses a marker: `input=$(cat); printf '%s\n' "$input" >> ~/perturb-probe.log; case "$input" in *probemarker*) echo refused >&2; exit 2 ;; esac; exit 0`.
   The second, `timeout: 5`, sleeps on another marker:
   `input=$(cat); case "$input" in *probeslow*) sleep 10 ;; esac; exit 0`.
2. In a new session, run `/perturb-probe`, then have Claude call Read,
   Bash (`echo hi`), ToolSearch and any connected MCP tool. Expect a log
   line for each, MCP included: the matcher reaches every tool and a
   user-invoked skill registers its hook.
3. Bash `echo probemarker`: expect a refusal.
4. Bash `echo probeslow`: record whether the call ran or was refused when
   the 5 s timeout fired. If it ran, a hook timeout lets calls through, and
   the guard's own scan timeout (20 s, under the hook's 30) is what keeps a
   slow scan from passing a commit; if it was refused, note it.
5. The hook's `cwd` after a `cd`: start the session in a git repo, Bash
   `mkdir -p probe-sub && cd probe-sub` in one call, then `echo probecwd`
   in the next. Read the `cwd` field of that call's log line. Every relative
   path, the default branch and the scan's repo resolve against it. If it
   names `probe-sub`, the hook follows the shell and T2 stands. If it names
   the start folder, a `cd` in one call and a relative write or `rm` in the
   next resolve against the wrong folder (`cd ~/.claude`, then
   `rm -rf scripts`, would pass). That result is reported to the owner
   before `/build`, not assumed; T2 is not changed on a guess. The options
   to put to the owner then: (a) the guard refuses a Bash call whose `cd`
   persists (a top-level `cd`, not one inside `( )`), and the SKILL says
   to use `git -C` and `( cd <dir> && ... )`, so the shell never leaves
   the folder the hook reports; (b) the guard keeps the shell's folder
   itself, in a per-session file keyed by `session_id`, from each call's
   literal `cd`, and refuses a call after a `cd` it could not read; (c) the
   SKILL alone asks Claude to repeat its `cd` in every call, which the
   guard cannot check. Remove `probe-sub` after.
6. Remove the probe skill and the log.

Pull requests #4, #8, #9 and #11 touched files this plan modifies
(`CLAUDE.md`, `README.md`, `commands/handoff.md`, `scripts/ground-truth.sh`,
`scripts/ground-truth.test.sh`) and are merged; `/build` starts from main at
cf68b19. Checked there on 2026-11-22: every anchor T5 and T6 name occurs
exactly once, as on 9717339, and pass 3's six as-written patches apply, T1
to T4 and T6 cleanly and T5 by a three-way apply with no conflict (its
context lines moved). On that tree all five suites passed, the
ground-truth suite with main's new Review-line checks and T5's showcase
checks together.

---

### T1: commit-scan.sh

**Depends on:** none
**Files:** create `scripts/commit-scan.sh`; test `scripts/commit-scan.test.sh`
**Seams:** the command line `bash commit-scan.sh <repo> [<message file>]`:
its exit code and its stdout and stderr.
**Interfaces:** produces `commit-scan.sh <repo> [<message file>]`: exit 0
and no output when clean; exit 1 with `== <label>` headers and
`<file>:<line>: <text>` hits (the spec's form; each hit once) when anything
matches; exit 1 with a line
starting `commit-scan: ` when the pattern list is missing, has no rules, has
a malformed line or a regex grep cannot read, when the message file is
missing, or when `<repo>` is not in a git repository; exit 2 on a usage
error. Scans from `<repo>`'s top level, the index (`git grep --cached`) and
the tracked files in the working tree (`git grep`). Reads
`$HOME/.claude/scan-patterns.local`: one rule per line,
`<label><TAB><extended regex>`, blank lines and lines starting `#` ignored,
CRLF endings and a last line with no newline accepted, matching
case-insensitive. Untracked files are not scanned: they are not part of
the commit, and the guard (T2) refuses a commit that follows `git add` or
any other command in the same call, a command inside a substitution in the
commit itself included (bash runs those first), so whatever a commit takes
is in the index or in the tracked files before the guard runs; the one
route left, an alternate index (`GIT_INDEX_FILE`), is in the T2 intro's
list of misses. Binary files are skipped
(`git grep -I`); see the T2 intro's list of misses.
**Verify:** `bash scripts/commit-scan.test.sh`

- [ ] Write the failing test `scripts/commit-scan.test.sh`:

```bash
#!/usr/bin/env bash
#
# commit-scan.test.sh: prove commit-scan.sh can fail. A throwaway HOME holds the pattern list and a throwaway
# repo holds the files: a clean tree, hits in a tracked file (each listed once, though both passes see it), a hit in a
# staged new file, a hit staged but gone from the working tree, an unstaged edit in a tracked file (what
# `commit -a` would add), different hits in the index and the working tree, a scan started from a subfolder, the
# second of two rules, a rule that starts with a dash, case, a message file by absolute, relative and backslash
# path, hits in a file and the message together, a missing message file, a folder that is not a repo, a list with
# CRLF endings and no final newline, and the refusals that keep an empty or broken scan from reading as a pass
# (no list, a list with no rules, a malformed rule, a regex grep cannot read). Exit 0 = every check passed.
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
once() { [ "$(grep -cF -- "$2" "$1")" = 1 ]; } # <file> <text>
empty() { [ ! -s "$1" ]; }         # <file>
run() { # <out file> <args...>: run the scan, keep stdout and stderr, return its exit code
  local out=$1
  shift
  bash "$SCAN" "$@" >"$out" 2>&1
}

printf '# private values, one rule per line\n\nlegal name\tzanzibar\nlogin name\tqwopler\ndash rule\t-zq\n' >"$PAT"
git init -q "$T/repo" && cd "$T/repo" && git config core.autocrlf false || exit 1
echo "nothing here" >clean.txt && mkdir sub && echo "nothing" >sub/s.txt && git add clean.txt sub && git commit -qm first

run "$T/out" "$T/repo"; code=$?
check "clean tree: exit 0" [ "$code" = 0 ]
check "clean tree: no output" empty "$T/out"

printf 'qwopler was here\nnothing\nqwopler again\n' >tracked.txt && git add tracked.txt && git commit -qm tracked
run "$T/out" "$T/repo"; code=$?
check "hit in a tracked file: exit 1" [ "$code" = 1 ]
check "hit in a tracked file: the second rule's label" has "$T/out" "== login name"
check "hit in a tracked file: no label for the rule with no hit" lacks "$T/out" "== legal name"
check "hit in a tracked file: file, line and text" has "$T/out" "tracked.txt:1: qwopler was here"
check "hit in a tracked file: listed once" once "$T/out" "tracked.txt:1: qwopler was here"
check "hit in a tracked file: every hit line" has "$T/out" "tracked.txt:3: qwopler again"
run "$T/out" "$T/repo/sub"; code=$?
check "scan from a subfolder: still sees the top-level file" has "$T/out" "tracked.txt:1: qwopler was here"
git rm -q tracked.txt && git commit -qm untrack

echo "ZANZIBAR" >staged.txt && git add staged.txt
run "$T/out" "$T/repo"; code=$?
check "staged new file, other case: exit 1" [ "$code" = 1 ]
check "staged new file, other case: the first rule's label" has "$T/out" "== legal name"
echo "now clean" >staged.txt
run "$T/out" "$T/repo"; code=$?
check "hit staged, gone from the working tree: still found" has "$T/out" "staged.txt:1: ZANZIBAR"
echo "zanzibar two" >staged.txt
run "$T/out" "$T/repo"; code=$?
check "different hits staged and in the working tree: the staged one" has "$T/out" "staged.txt:1: ZANZIBAR"
git rm -q -f --cached staged.txt && rm staged.txt

echo "zanzibar" >>clean.txt
run "$T/out" "$T/repo"; code=$?
check "unstaged edit in a tracked file: found" has "$T/out" "clean.txt:2: zanzibar"
git checkout -q -- clean.txt

printf 'subject\n\nsigned zanzibar\n' >"$T/msg.txt"
run "$T/out" "$T/repo" "$T/msg.txt"; code=$?
check "message file, absolute path: exit 1" [ "$code" = 1 ]
check "message file, absolute path: names the file" has "$T/out" "msg.txt:3: signed zanzibar"
(cd "$T" && bash "$SCAN" "$T/repo" msg.txt >"$T/out" 2>&1); code=$?
check "message file, relative path: the hit" has "$T/out" "msg.txt:3: signed zanzibar"
back=$(printf '%s' "$T/msg.txt" | tr '/' '\\')
run "$T/out" "$T/repo" "$back"; code=$?
check "message file, backslash path: the hit" has "$T/out" "msg.txt:3: signed zanzibar"
printf 'subject\n\nSigned QWOPLER\n' >"$T/upper-msg.txt"
run "$T/out" "$T/repo" "$T/upper-msg.txt"; code=$?
check "message file, other case: the hit" has "$T/out" "upper-msg.txt:3: Signed QWOPLER"
printf 'subject\n\nsee -zq\n' >"$T/dash-msg.txt"
run "$T/out" "$T/repo" "$T/dash-msg.txt"; code=$?
check "a rule that starts with a dash: the message hit" has "$T/out" "dash-msg.txt:3: see -zq"
echo "zanzibar in a file" >both.txt && git add both.txt
run "$T/out" "$T/repo" "$T/msg.txt"; code=$?
check "hits in a file and the message: the file" has "$T/out" "both.txt:1: zanzibar in a file"
git rm -q -f --cached both.txt && rm both.txt
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
  `FAIL  clean tree: exit 0` and ended `commit-scan.test.sh: 36 FAILED`;
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
# refuse (exit 1), because a scan that could not run would read as a pass. Binary files are skipped (-I).
#
# Usage: bash commit-scan.sh <repo> [<message file>]
# Exit 0 = clean; 1 = a hit (each as <file>:<line>: <text> under its rule's label), or a scan that could not
# run; 2 = usage error.

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
    [ "$rc" = 0 ] && hits="${hits:+$hits$'\n'}$(printf '%s\n' "$out" | sed 's/^\([^:]*:[0-9][0-9]*\):/\1: /')"
  done
  if [ -n "$msg" ]; then
    out=$(grep -n -i -E -- "$re" "$msg" 2>&1)
    rc=$?
    [ "$rc" -le 1 ] || { echo "commit-scan: rule on line $n failed on the message (grep exit $rc): $out"; exit 1; }
    [ "$rc" = 0 ] && hits="${hits:+$hits$'\n'}$(printf '%s\n' "$out" | awk -v f="$msg" '{ i = index($0, ":"); print f ":" substr($0, 1, i - 1) ": " substr($0, i + 1) }')"
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
  each (all 19 named here were killed in fold 3's scratch run, by the checks
  named; "alone" marks a check that was the only one to kill it):
  (a) delete `-i` from the `git grep` line: "staged new file, other case"
  and the two staged-hit checks; (b) `for where in --cached --no-cached` to
  `for where in --no-cached`: "hit staged, gone from the working tree" and
  "different hits"; (c) `[ "$rules" = 0 ]` to `false`: "a list with no
  rules"; (d) delete the `tr '\\' '/'` line: "message file, backslash path"
  alone; (e) `git -C "$top" grep` to `git -C "$repo" grep`: "scan from a
  subfolder" alone; (f) replace the git grep `[ "$rc" -le 1 ]` test with
  `true`: "a regex grep cannot read"; (g) replace `[ -f "$msg" ]` with
  `true`: "missing message file: says so" alone; (h) delete the CR strip:
  "CRLF list: the CRLF rule hits" alone; (i) delete `|| [ -n "$line" ]`:
  "the last rule, with no newline, hits" alone; (j) delete `-i` from the
  message grep: "message file, other case" alone; (k) `for where in
  --cached`: "unstaged edit in a tracked file" alone; (l) drop `| sort -u`:
  "hit in a tracked file: listed once" alone; (m) drop `-e` before the
  regex: "clean tree", "a rule that starts with a dash" and "clean message
  file" (the dash rule reads as an option); (n) drop `--` in the message
  grep: "a rule that starts with a dash: the message hit" alone; (o) the
  message hits replace the file hits: "hits in a file and the message: the
  file" alone; (p) the working-tree pass replaces the index pass's hits:
  "different hits staged and in the working tree: the staged one" alone;
  (q) drop the `sed` that puts a space after a file hit's line number:
  every file-hit check; (r) the message hit printed without that space:
  every message-hit check; (s) a `sed -n '1s/.../p'` that keeps only the
  first hit line of each pass: "hit in a tracked file: every hit line"
  alone. Pass 3 also killed a missing-list check removed, not-a-repo
  exiting 0, and comment or blank lines not skipped.
  Not covered, left for the owner (each survived fold 3's run): `-I`
  (dropping it scans binary files; only a test pinning the miss would kill
  it); the label or the regex split at the last tab, not the first (a rule
  whose regex holds a tab would tell them apart); and the message grep's
  `[ "$rc" -le 1 ]` test replaced with `true` (no regex `git grep` accepts
  and `grep` rejects was found to pin it).
- [ ] Commit: `Scripts: commit-scan, the pre-commit privacy scan`, body: why
  a missing or empty list, a bad regex and a missing message refuse, and why
  the scan reads the index, and the `file:line: text` form.

### T2: perturb-guard.mjs

**Depends on:** T1
**Files:** create `scripts/perturb-guard.mjs`; test `scripts/perturb-guard.test.mjs`
**Seams:** the process: hook JSON on stdin, exit code, stderr. Tests set
`HOME` and `USERPROFILE` to a throwaway directory, so `os.homedir()` and the
protected paths follow it, and `TMPDIR`, `TEMP` and `TMP` to another, so the
temporary message folder can be seen to go. `PERTURB_SCAN_TIMEOUT_MS`
shortens the scan's timeout for one test (Choice for the owner's review:
a test seam in the hook's own environment, which Claude's Bash calls do
not reach).
**Interfaces:** consumes `commit-scan.sh` (T1) from the guard's own
directory, exit codes as T1 states (any nonzero exit refuses), under a
20 s timeout of its own. Produces `node perturb-guard.mjs`: exit 0 allows;
exit 2 refuses with the global refusal form, or with
`perturb-guard: refusing, the guard could not decide (<error>).` for
unreadable input or a thrown error.
**Verify:** `node --test scripts/perturb-guard.test.mjs`

The Bash parse is a tripwire for ordinary Claude style: only the forms
named here are seen, and anything else passes unseen. It sees through
`( )`, `{ }`, `if`/`then`/`elif`/`else`, `while`/`until`/`do`, `!`, env
assignments, the wrappers `time`, `env`, `command`, `nohup`, `exec`,
`nice`, `sudo` and `timeout` (with their options and timeout's duration),
`git -C`, `git -c` and other git options before the subcommand, `cd`, `~`,
`$HOME` and `${HOME}`, quotes and bash's double-quote backslash rule,
backslash line continuations, `#` comments (a `#` that starts a word,
outside quotes), heredoc bodies to their delimiter (quoted or not, and
`<<-`), redirections with their descriptor number (`2>&1`, `2>/dev/null`,
`>&`, `&>`, `>|`), `gh -R` and `--repo`, and the commands inside `$(...)`,
backticks, `<(...)` and `>(...)`, quoted or not: they are parsed as
commands of their own and count as commands before the one that holds them,
since bash runs them first. A substitution that only reads a heredoc with a
quoted delimiter (`"$(cat <<'EOF' ... EOF)"`) runs nothing, so it alone may
come before a commit; an apostrophe or a lone `"` in that heredoc is body
text. `$((...))` parses the same way, so a `<<` in it hides nothing after
it. A call that ends with a quote or a substitution still open is refused.
Known misses, which pass:
- `bash -c`, `eval`, `xargs`, `sh -c`, the value a substitution or a shell
  variable other than `HOME` stands for (`echo x > "$(echo ~/.claude/CLAUDE.md)"`),
  brace expansion (`rm -rf ~/.claude/{scripts,x}`,
  `cp x ~/.claude/{settings.json,y}`), `gh api`, `perl -pi`, `node -e`,
  `python`, `curl -o`, `install`, `dd`, `ln`, `truncate`, `touch`,
  `mkdir`, `tar -C`, `unzip -d`, `rsync`, `git mv`, `find -delete`,
  `unlink`, `rmdir`, `chmod`, and git or gh named by a path (`/usr/bin/git`,
  `git.exe`).
- An unquoted heredoc's body is skipped, so a `$(...)` in it runs unseen
  (`cat <<EOF` / `$(rm -rf ~/.claude)` / `EOF`); so is `((...))` without
  `$`, whose `<<` reads as a heredoc.
- git run inside `~/.claude` that rewrites tracked files: `checkout --`,
  `restore`, `reset --hard`, `clean`, `stash`, `rm`.
- `sed -Ei` and other clusters holding `i`, and sed with two files (only
  the last is checked); `cp` or `mv` with `-t` inside a cluster.
- `git --git-dir`, `--work-tree` and `--namespace` given as a separate word
  (the value is read as the subcommand), and a push from another repo than
  the one the guard resolves.
- Refs the push check does not resolve: `heads/<default>`, and the default
  branch in other case, which a case-insensitive remote disk reads as the
  same ref.
- Folder changes the parse does not follow: `cd -`, a bare `cd`, `pushd`,
  `popd`, `env -C` (its folder is skipped as a value, not followed), and a
  protected path spelled `$USERPROFILE`.
- On Windows, a trailing dot or `::$DATA` on a protected name (Windows drops
  the dot and writes the same file); on macOS, other case on a
  case-insensitive disk (the guard folds case on Windows only).
- The scan (T1) skips binary files (`git grep -I`), UTF-16 files (git reads
  them as binary) and file names; it does not read tag, merge or
  cherry-pick messages, a message taken from a commit (`-C`, `-c`) or a
  template (`-t` with `GIT_EDITOR=true`), `--author` and `-c user.name`,
  or an alternate index (`GIT_INDEX_FILE=`; the scan reads the default
  one). On Linux and macOS, `-F /dev/fd/0 < m.txt` makes the guard read
  its own spent stdin, so the message scans empty while git reads `m.txt`
  (unrun there; on Windows the path does not exist and the commit is
  refused).

Known false refusals: `cd "$(git rev-parse --show-toplevel)" && git commit`
(the substitution counts as a command before the commit; `cd` to the
folder by its path), and, if Claude Code ever sends a Git
Bash `/c/...` form as the hook's `cwd` (unseen so far), every push and
commit, since git is handed that folder unconverted and cannot answer.

- [ ] Write the failing test `scripts/perturb-guard.test.mjs`:

```js
// perturb-guard.test.mjs: prove perturb-guard.mjs can fail. Each refusal row of the spec has a fixture and an
// allowed neighbor beside it, run through the real process with a throwaway HOME, a throwaway repo whose origin
// HEAD names trunk (so a guard that assumes main fails) and a worktree of it, a second repo with no origin, and
// the real commit-scan.sh beside the guard.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, realpathSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'perturb-guard.mjs');
// realpath: macOS's temp folder is a symlink, and git reports the repo's real path.
const T = realpathSync(mkdtempSync(join(tmpdir(), 'perturb-guard-test-')));
after(() => rmSync(T, { recursive: true, force: true }));
const HOME = join(T, 'home-qzx');
const REPO = join(T, 'repo');
const WT = join(T, 'wt');
const OTHER = join(T, 'other');
const TMP = join(T, 'tmp');
mkdirSync(TMP);
const env = { ...process.env, HOME, USERPROFILE: HOME, TMPDIR: TMP, TEMP: TMP, TMP, GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't' };
const sh = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
};

mkdirSync(join(HOME, '.claude'), { recursive: true });
writeFileSync(join(HOME, '.claude', 'scan-patterns.local'), 'legal name\tzanzibar\nhome folder\thome-qzx\n');
sh(T, 'init', '-q', '--bare', 'origin.git');
sh(T, 'init', '-q', 'repo');
sh(REPO, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
writeFileSync(join(REPO, 'a.txt'), 'clean\n');
sh(REPO, 'add', 'a.txt');
sh(REPO, 'commit', '-qm', 'first');
sh(REPO, 'remote', 'add', 'origin', join(T, 'origin.git'));
sh(REPO, 'push', '-q', 'origin', 'trunk');
sh(REPO, 'remote', 'set-head', 'origin', 'trunk');
sh(REPO, 'worktree', 'add', '-q', '-b', 'showcase/2026-11-20-x', WT);
sh(T, 'init', '-q', 'other');

function run(tool, input, { cwd = REPO, raw, guard = GUARD, extraEnv = {} } = {}) {
  const stdin = raw ?? JSON.stringify({ session_id: 's', cwd, tool_name: tool, tool_input: input });
  const r = spawnSync(process.execPath, [guard], { input: stdin, env: { ...env, ...extraEnv }, encoding: 'utf8' });
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
  refused(bash("git push origin 'trunk'"), 'trunk');
  refused(bash('git push origin tr\\unk'), 'trunk');
  refused(bash('git push origin "tr\\\nunk"'), 'trunk');
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
test('push: redirections and option values are not refspecs; an unknown option refuses', () => {
  for (const c of ['git push origin 2>&1', 'git push origin 2>/dev/null', 'git push -u origin 2>&1 | tail -5',
    'git push origin &> push.log', 'git push origin >& push.log', 'git push -o ci.skip origin',
    'git push -oci.skip origin', 'git push --push-option ci.skip origin', 'git push --push-option=ci.skip origin',
    'git push --repo origin', 'git push --receive-pack x origin']) refused(bash(c), 'trunk');
  allowed(bash('git push -o ci.skip origin feat 2>&1'));
  refused(bash('git push --frobnicate origin feat'), 'does not know');
  refused(bash('git push -uz origin feat'), 'does not know');
  onFeat(() => refused(bash('git push -oci.skip origin trunk'), 'trunk'));
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
  refused(bash('git push origin --delete showcaseold'), 'showcaseold');
});
test('git -C and cd reach the right repo; a repo with no origin HEAD falls back to main', () => {
  allowed(bash('git push origin trunk', { cwd: OTHER }));
  refused(bash('git push origin main', { cwd: OTHER }), 'main');
  refused(bash(`git -C "${REPO}" push origin trunk`, { cwd: OTHER }), 'trunk');
  refused(bash(`cd "${REPO}" && git push origin trunk`, { cwd: OTHER }), 'trunk');
  allowed(bash(`git -C "${REPO}" push origin feat`, { cwd: OTHER }));
  refused(bash('git -c core.x=y push origin trunk'), 'trunk');
  refused(bash('git --no-pager push origin trunk'), 'trunk');
});
test('push or commit where git cannot answer refused', () => {
  const nowhere = join(T, 'no-such-folder');
  refused(bash('git push origin feat', { cwd: nowhere }), 'cannot answer');
  refused(bash(`cd "${nowhere}" && git push origin feat`), 'cannot answer');
  refused(bash(`git -C "${nowhere}" commit -m clean`), 'cannot answer');
});
test('prefixes, wrappers and env assignments before git are skipped', () => {
  for (const c of ['MSYS_NO_PATHCONV=1 git push origin trunk', '(git push origin trunk)',
    '{ git push origin trunk; }', 'if git push origin trunk; then :; fi', 'if true; then git push origin trunk; fi',
    'if false; then :; elif git push origin trunk; then :; fi', 'if false; then :; else git push origin trunk; fi',
    'while git push origin trunk; do :; done', 'until git push origin trunk; do :; done',
    'for x in 1; do git push origin trunk; done', '! git push origin trunk', 'time git push origin trunk',
    'env X=1 git push origin trunk', 'env -i git push origin trunk', 'env -u X git push origin trunk',
    'env -C . git push origin trunk',
    'command git push origin trunk', 'nohup git push origin trunk', 'exec git push origin trunk',
    'timeout 60 git push origin trunk', 'timeout -k 5 60 git push origin trunk', 'nice -n 5 git push origin trunk',
    'sudo -u x git push origin trunk', 'git \\\n  push origin trunk']) {
    refused(bash(c), 'git push');
  }
});
test('comments and heredoc bodies are skipped; a quote left open refuses', () => {
  refused(bash("# don't forget the tests\ngit push origin trunk"), 'trunk');
  refused(bash("# it's ready\ngit push --force origin feat"), 'force');
  refused(bash("echo ok # that's all\ngh pr merge 3"), 'gh pr merge');
  refused(bash("cat > n.txt <<'EOF'\nthe owner's note\nEOF\nrm -rf ~/.claude"), 'protected');
  refused(bash('cat > n.txt <<EOF\nthe owner\'s note\nEOF\nrm -rf ~/.claude'), 'protected');
  refused(bash('cat > n.txt <<-"EOF"\n\tthe owner\'s note\n\tEOF\nrm -rf ~/.claude'), 'protected');
  refused(bash("cat > n.txt <<'EOF'\nbody\nEOF\necho a\nrm -rf ~/.claude"), 'protected');
  refused(bash('echo a\ngit push origin trunk'), 'git push');
  refused(bash('echo a#b; git push origin trunk'), 'git push');
  refused(bash('echo "it is open'), 'quote left open');
  allowed(bash("# don't forget the tests\ngit push origin feat"));
  allowed(bash("cat > n.txt <<'EOF'\nthe owner's note\nEOF\nrm -rf build"));
  allowed(bash("cat > n.md <<'EOF'\ngit push origin trunk\nEOF"));
  allowed(bash("cat > n.md <<'EOF'\nEOFX\nrm -rf ~/.claude\nEOF"));
  allowed(bash('cat > n.md <<EOF\n\tEOF\nrm -rf ~/.claude\nEOF'));
  allowed(bash("echo ok # that's all\ngh pr create --fill"));
});
test('$((...)) starts no heredoc; the commands inside a substitution, quoted or not, are parsed', () => {
  refused(bash('x=$((1<<4))\ngit push origin trunk'), 'git push');
  refused(bash('echo $((1<<2))\nrm -rf ~/.claude'), 'protected');
  refused(bash('echo "$(rm -rf ~/.claude)"'), 'protected');
  refused(bash('echo `rm -rf ~/.claude`'), 'protected');
  refused(bash('diff <(rm -rf ~/.claude) a.txt'), 'protected');
  refused(bash('echo "$( (cd /tmp); rm -rf ~/.claude )"'), 'protected');
  refused(bash('echo "$(cat <<\'EOF\'\n"\nEOF\n)"; rm -rf ~/.claude #"'), 'protected');
  refused(bash('echo "$(date'), 'substitution left open');
  allowed(bash('echo $((1 << 4))'));
  allowed(bash('x=$((1<<4)); echo $x'));
  allowed(bash('echo "$(git rev-parse HEAD) `date`"'));
});
test('gh pr merge refused, with or without a repo flag; gh pr create allowed', () => {
  refused(bash('gh pr merge 12 --squash'), 'gh pr merge');
  refused(bash('gh -R o/r pr merge 3'), 'gh pr merge');
  refused(bash('gh --repo=o/r pr merge 3'), 'gh pr merge');
  allowed(bash('gh pr create --draft --title x --body y'));
  allowed(bash('gh browse merge'));
});
test('commit: scan clean allowed, scan hit refused (tracked file and every message spelling)', () => {
  allowed(bash('git commit -m "a clean message"'));
  for (const c of ['git commit -m "signed zanzibar"', 'git commit -am "signed zanzibar"',
    'git commit --message "signed zanzibar"', 'git commit --message="signed zanzibar"', 'git commit -mzanzibar',
    'git commit --mess "signed zanzibar"',
    'git commit -m "subject" -m "body zan""zibar"',
    'git commit -m "$(cat <<\'EOF\'\nsubject\n\nsay "quoted words" then zanzibar\nEOF\n)"']) {
    refused(bash(c), 'zanzibar');
  }
  allowed(bash('git commit -m "$(cat <<\'EOF\'\nQuote handling\n\nTreat "don\'t" as one word.\nEOF\n)"'));
  allowed(bash('git commit -m "$(cat <<\'EOF\'\nRulers\n\nA 12" ruler.\nEOF\n)"'));
  writeFileSync(join(T, 'msg.txt'), 'subject\n\nzanzibar\n');
  for (const f of ['-F', '--file', '--fil', '-aF']) refused(bash(`git commit ${f} "${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit --file="${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit --fil="${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit -F"${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit -F "${join(T, 'no-msg.txt')}"`), 'no message file');
  writeFileSync(join(T, 'rel-msg.txt'), 'subject\n\nclean\n');
  writeFileSync(join(REPO, 'rel-msg.txt'), 'subject\n\nzanzibar\n');
  refused(bash(`git -C "${REPO}" commit -F rel-msg.txt`, { cwd: T }), 'zanzibar');
  rmSync(join(REPO, 'rel-msg.txt'));
  writeFileSync(join(HOME, 'clean-msg.txt'), 'subject\n\nclean\n');
  allowed(bash(`git commit -F "${join(HOME, 'clean-msg.txt')}"`));
  writeFileSync(join(REPO, 'b.txt'), 'zanzibar\n');
  sh(REPO, 'add', 'b.txt');
  refused(bash('git commit -m clean'), 'zanzibar');
  sh(REPO, 'rm', '-q', '--cached', 'b.txt');
  rmSync(join(REPO, 'b.txt'));
  assert.deepEqual(readdirSync(TMP), []);
});
test('commit or push after another command in the same call refused; after cd allowed', () => {
  writeFileSync(join(REPO, 'new.txt'), 'zanzibar\n');
  refused(bash('git add new.txt && git commit -m "add new"'), 'stage in one call');
  rmSync(join(REPO, 'new.txt'));
  refused(bash('echo x >> a.txt && git commit -am edit'), 'stage in one call');
  refused(bash('git commit -m clean && git push origin feat'), 'stage in one call');
  for (const c of ['git commit -m x $(git add new.txt)', 'git commit -m x "$(git add new.txt)"',
    'git commit -m x `git add new.txt`', 'git commit -m x <(git add new.txt)', 'git commit -m "$(printf \'za%s\' nzibar)"',
    'git commit -m "$(cat <<EOF\nsubject\nEOF\n)"']) refused(bash(c), 'stage in one call');
  allowed(bash(`cd "${REPO}" && git commit -m clean`, { cwd: OTHER }));
  allowed(bash(`cd "${REPO}" && git push origin feat`, { cwd: OTHER }));
});
test('commit: a message from stdin refused', () => {
  refused(bash('git commit -F -'), 'stdin');
  refused(bash('git commit -F-'), 'stdin');
  refused(bash('git commit --file=-'), 'stdin');
  refused(bash('git commit --fil=-'), 'stdin');
  refused(bash('git commit -F /dev/stdin'), 'a message from stdin');
});
test('commit: any nonzero scan exit refuses, not only 1', () => {
  const lone = join(T, 'lone');
  mkdirSync(lone, { recursive: true });
  copyFileSync(GUARD, join(lone, 'perturb-guard.mjs'));
  refused(bash('git commit -m clean', { guard: join(lone, 'perturb-guard.mjs') }), 'commit-scan.sh exited 127');
});
test('commit: a scan that does not finish in time refuses', () => {
  const slow = join(T, 'slow');
  mkdirSync(slow, { recursive: true });
  copyFileSync(GUARD, join(slow, 'perturb-guard.mjs'));
  writeFileSync(join(slow, 'commit-scan.sh'), 'sleep 3\n');
  refused(bash('git commit -m clean', { guard: join(slow, 'perturb-guard.mjs'), extraEnv: { PERTURB_SCAN_TIMEOUT_MS: '500' } }),
    'did not finish');
});
test('Edit and Write: repo files allowed, protected paths refused in every spelling', () => {
  allowed(run('Edit', { file_path: join(REPO, 'scripts', 'x.sh') }));
  allowed(run('Write', { file_path: join(C, 'LEDGER.md') }));
  allowed(run('Write', { file_path: join(C, 'COSTS.md') }));
  allowed(run('Write', { file_path: join(C, 'scripts-old', 'a.sh') }));
  allowed(run('Write', { file_path: join(C, 'skills', 'perturb-notes', 'a.md') }));
  refused(run('Edit', { file_path: join(C, 'scripts', 'ground-truth.sh') }), 'protected');
  refused(run('MultiEdit', { file_path: join(C, 'settings.json'), edits: [] }), 'protected');
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
  refused(run('Write', { file_path: join(WT, '.claude', 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(REPO, '.claude', 'settings.local.json') }, { cwd: WT }), 'protected');
  allowed(run('Write', { file_path: join(REPO, '.claude', 'skills', 'x.md') }));
});
test('Windows spellings: /c/ form and other case refused', { skip: process.platform !== 'win32' }, () => {
  const slash = C.replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/');
  refused(run('Write', { file_path: `${slash}/settings.json` }), 'protected');
  refused(run('Write', { file_path: join(C.toUpperCase(), 'SETTINGS.JSON') }), 'protected');
  const [drive, ...parts] = C.split(/[\\/]/);
  refused(bash(`cd /${drive[0].toLowerCase()} && rm -rf ${parts.join('/')}`), 'protected');
  allowed(bash(`cd /${drive[0].toLowerCase()} && rm -rf ${parts.join('/')}-not`));
  // The raw command is scanned with the home folder read as ~, in its /c/ form and in other case too.
  writeFileSync(join(HOME, 'clean-msg.txt'), 'subject\n\nclean\n');
  allowed(bash(`git commit -F "${slash.replace(/\/\.claude$/, '')}/clean-msg.txt"`));
  allowed(bash(`git commit -F "${HOME.toUpperCase()}\\clean-msg.txt"`));
});
test('Bash writes and removals in protected paths refused; the same elsewhere allowed', () => {
  refused(bash(`echo x > "${join(C, 'settings.json')}"`), 'protected');
  refused(bash(`echo x > "${C}\\settings.json"`), 'protected');
  refused(bash('echo x >> ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x >~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x 2> ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x &> ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x >& ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x > $HOME/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x > ${HOME}/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x | tee ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('cp a.txt ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('mv a.txt ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('cp settings.json ~/.claude/'), 'protected');
  refused(bash('mv CLAUDE.md ~/.claude'), 'protected');
  refused(bash('cp -r perturb/ ~/.claude/skills/'), 'protected');
  refused(bash('cp -t ~/.claude settings.json'), 'protected');
  refused(bash('cp --target-directory=~/.claude settings.json'), 'protected');
  refused(bash(`cp -t"${C}" settings.json`), 'protected');
  refused(bash('cp -r skills ~/.claude/'), 'protected');
  refused(bash('cp -a skills ~/.claude'), 'protected');
  refused(bash('cp -r . ~/.claude/'), 'protected');
  refused(bash('sed -i.bak s/a/b/ ~/.claude/PERSONAL-ADDENDUM.md'), 'protected');
  refused(bash('sed --in-place s/a/b/ ~/.claude/PERSONAL-ADDENDUM.md'), 'protected');
  refused(bash('rm ~/.claude/scripts/perturb-guard.mjs'), 'protected');
  refused(bash('rm -rf ~/.claude'), 'protected');
  refused(bash('rm -rf /'), 'protected');
  refused(bash('rm -rf /*'), 'protected');
  refused(bash('rm -rf ~/.claude/*'), 'protected');
  refused(bash('rm ~/.claude/settings*.json'), 'protected');
  refused(bash('rm -rf ~/.cl*'), 'protected');
  refused(bash('rm -rf ~/.claude/scripts/*'), 'protected');
  refused(bash(`mv ~/.claude/CLAUDE.md "${join(T, 'x')}"`), 'protected');
  allowed(bash(`echo x > "${join(T, 'free.txt')}"`));
  allowed(bash('echo x 2>&1'));
  allowed(bash('cp a.txt b.txt'));
  allowed(bash('cp a.txt ~/.claude/notes/'));
  allowed(bash('cp -r notes ~/.claude/'));
  allowed(bash('cp -a skills ~/.claude/notes'));
  allowed(bash('mv b.txt c.txt'));
  allowed(bash('rm c.txt ~/.claude/other.txt'));
  allowed(bash('rm -f *.log ~/.claude/*.bak'));
  allowed(bash('rm -f *'));
  allowed(bash('cat ~/.claude/settings.json'));
});
test('only the safe tools pass: Agent, Workflow, the other shells, auto-merge, session tools and the rest refused', () => {
  for (const t of ['Agent', 'Task', 'Workflow', 'PowerShell', 'Monitor', 'mcp__terminal__run_in_terminal',
    'mcp__ccd_pr__set_auto_merge', 'mcp__ccd_session__start_session', 'mcp__ccd_session__hand_off_to_session',
    'mcp__scheduled-tasks__create_scheduled_task', 'SomeNewTool']) {
    refused(run(t, { prompt: 'x' }), t);
  }
  refused(run('Skill', { skill: 'build' }), 'build');
  allowed(run('Skill', { skill: 'frames' }));
  allowed(run('Read', { file_path: join(C, 'settings.json') }));
  for (const t of ['Grep', 'Glob', 'TodoWrite', 'AskUserQuestion', 'ToolSearch', 'WebSearch', 'WebFetch',
    'mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up']) {
    allowed(run(t, { pattern: 'x' }));
  }
});
test('browser: navigate, read, resize and screenshots pass; clicks, typing, scripts and preview_start refused', () => {
  const B = 'mcp__Claude_Browser__';
  for (const t of ['navigate', 'read_page', 'get_page_text', 'find', 'resize_window', 'tabs_context']) {
    allowed(run(B + t, { url: 'http://localhost:8080', preset: 'mobile' }));
  }
  allowed(run(`${B}computer`, { action: 'screenshot' }));
  allowed(run(`${B}computer`, { action: 'zoom', region: [0, 0, 10, 10] }));
  refused(run(`${B}computer`, { action: 'left_click', coordinate: [1, 1] }), 'left_click');
  refused(run(`${B}computer`, { action: 'type', text: 'x' }), 'type');
  for (const t of ['javascript_tool', 'form_input', 'preview_start', 'tabs_create']) refused(run(B + t, { text: 'x' }), B + t);
});
test('fails closed: malformed JSON, missing fields, a bad input shape', () => {
  for (const r of [run('Bash', {}, { raw: '{not json' }), run('Bash', {}, { raw: '{}' }),
    run('Bash', { nocommand: 1 }), run('Edit', {}),
    run('Read', {}, { raw: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x' } }) }),
    run('Read', {}, { raw: JSON.stringify({ cwd: REPO, tool_input: { file_path: 'x' } }) }),
    run('Read', {}, { raw: JSON.stringify({ cwd: REPO, tool_name: 'Read', tool_input: 'x' }) }),
    run('Read', {}, { raw: JSON.stringify({ cwd: REPO, tool_name: 'Read', tool_input: null }) })]) {
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /^perturb-guard: refusing, the guard could not decide \(/);
  }
});
```

- [ ] Run it; expected failure: all 23 tests fail (`ℹ pass 0`,
  `ℹ fail 23`). The child's stderr names the missing module, reported
  through the first `assert.equal(r.code, ...)`; the scratch run printed
  `AssertionError [ERR_ASSERTION]: node:internal/modules/cjs/loader:1459`
  and `code: 'MODULE_NOT_FOUND'`. Copy the first failing assertion line
  from your run into the commit body.
- [ ] Minimal implementation `scripts/perturb-guard.mjs`:

```js
#!/usr/bin/env node
//
// perturb-guard.mjs: the PreToolUse hook /perturb registers from its frontmatter, for every tool, active from
// invocation to the end of that session. It lets through a named list of safe tools and refuses every other tool,
// MCP tools included (exit 2, reason on stderr). Of the safe tools, Edit, MultiEdit, Write and NotebookEdit are
// refused on a protected path, Skill runs only frames, the browser's computer tool only takes screenshots, and Bash
// is parsed: it refuses pushes to the default branch,
// force pushes, --all, --mirror, glob refspecs and push options it does not know, gh pr merge, deleting a remote
// branch outside showcase/, writes to or removal of the owner's protected config, git commit -F - (a message from
// stdin is not scanned), a git commit or push after any command but cd in the same call, a substitution's command
// included (the scan reads the repo before the call runs), a push or commit where git cannot answer, and a call
// with a quote or substitution left open. Before
// every other git commit it runs commit-scan.sh beside it, on the parsed messages, any -F file and the raw
// command. It is a tripwire, not a sandbox: a script Claude writes can still push or write anywhere.
//
// Fails closed: input it cannot read and any error it throws exit 2, since Claude Code lets a hook's other exit
// codes through.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
  // Every checkout of the working repo, the main one and each worktree.
  for (const line of git(cwd, 'worktree', 'list', '--porcelain').split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    for (const f of ['settings.json', 'settings.local.json']) rules.push({ path: norm(join(line.slice(9), '.claude', f), cwd) });
  }
  return rules;
}
function isProtected(p, cwd, rules) {
  const t = norm(p, cwd);
  return rules.some((r) => t === r.path || (r.tree && t.startsWith(r.path + '/')));
}
// Removing a folder removes what is under it; the root holds everything.
function holdsProtected(p, cwd, rules) {
  const t = norm(p, cwd);
  const base = t.endsWith('/') ? t : t + '/';
  return isProtected(p, cwd, rules) || rules.some((r) => r.path.startsWith(base));
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
  const t = norm(parent, cwd);
  const base = t.endsWith('/') ? t : t + '/';
  return rules.some((r) => r.path.startsWith(base) && re.test(r.path.slice(base.length).split('/')[0]));
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
// it reaches no further than its closing parentheses. A quote or substitution left open refuses.
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
  const endSeg = () => { endTok(); if (toks.length) segs.push(Object.assign(toks, { sub: closer !== null })); toks = []; };
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
    if (c === '`' && closer === '`') { endSeg(); return i; }
    if (cmd.startsWith('$(', i) || c === '`' || /^[<>]\(/.test(cmd.slice(i, i + 2))) { i = subst(i); continue; }
    if (c === '#' && !has) { while (i + 1 < cmd.length && cmd[i + 1] !== '\n') i++; continue; }
    if (c === '\n') {
      endSeg();
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
    if (c === ')' && closer === ')' && depth === 0) { endSeg(); return i; }
    if (c === '(') depth++;
    if (c === ')' && depth > 0) depth--;
    if (';&|()'.includes(c)) { endSeg(); continue; }
    if (/\s/.test(c)) { endTok(); continue; }
    cur += c;
    has = true;
  }
  if (q) refuse('a command with a quote left open', 'the guard cannot tell where it ends; for a long commit message, write it to a file and use -F');
  endSeg();
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
  nice: /^(-n|--adjustment)$/, sudo: /^(-u|--user|-g|--group)$/, exec: /^-a$/, command: null, time: null, nohup: null,
};

// The command's words: redirections and their targets dropped, then leading reserved words, env assignments and
// wrappers with their options (and timeout's duration).
function words(toks) {
  const w = toks.filter((t, i) => !isRedir(t) && !isRedir(toks[i - 1]));
  for (;;) {
    const h = w[0];
    if (PREFIX.has(h) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(h ?? '')) { w.shift(); continue; }
    if (!Object.hasOwn(WRAP, h ?? '')) return w;
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

function bash(command, cwd) {
  const rules = protectedRules(cwd);
  let other = false;
  for (const toks of segments(command)) {
    if (readsHeredoc(toks)) continue;
    const { writes, removes, fills } = targets(toks);
    for (const t of writes) {
      if (hasGlob(t) ? globHits(t, cwd, rules) : isProtected(t, cwd, rules)) refuse(`a write to ${t}`, 'it is protected config under /perturb');
    }
    for (const t of removes) {
      if (hasGlob(t) ? globHits(t, cwd, rules) : holdsProtected(t, cwd, rules)) refuse(`removing ${t}`, 'it is or holds protected config under /perturb');
    }
    for (const t of fills) {
      if (hasGlob(t) ? globHits(t, cwd, rules) : holdsProtected(t, cwd, rules)) refuse(`a recursive copy to ${t}`, 'it is or holds protected config under /perturb');
    }
    const [cmd, ...rest] = words(toks);
    if (cmd === 'cd') { if (rest[0]) cwd = toPath(rest[0], cwd); continue; }
    if (cmd === 'gh') {
      const g = rest.filter((a, i) => !/^(-R|--repo)$/.test(a) && !/^(-R|--repo)$/.test(rest[i - 1] ?? '') && !/^(-R.|--repo=)/.test(a));
      if (g[0] === 'pr' && g[1] === 'merge') refuse('gh pr merge', "merges are the owner's");
    }
    if (cmd === 'git') {
      const { sub, rest: args, dir } = gitArgs(rest);
      const repo = dir ? toPath(dir, cwd) : cwd;
      if (sub === 'push' || sub === 'commit') {
        if (other) refuse(`git ${sub} after another command`, `the checks read the repo before the call runs; stage in one call, then run git ${sub} in the next, alone or after cd, with no substitution but $(cat <<'EOF' ...) for a message`);
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
```

- [ ] Run it; expected: `ℹ pass 23`, `ℹ fail 0` (on Linux and macOS the
  Windows-spellings test is skipped: `ℹ pass 22`, `ℹ skipped 1`). On
  Windows the runs have taken 59 s to 107 s, by load (fold 3's: 80 s and 94 s),
  most of it the commit tests' scans.
- [ ] Mutant runs, one at a time against the full T2 suite ((bt) against
  T3's suite too, since that suite reads the guard), restored after each
  (fold 3's scratch run: 106 of 107 killed, by the tests named; (au)
  survived the first run and was killed once the `--mess` line was added;
  the one survivor is equivalent; "alone" marks a test that was the only one
  to kill it). Every test, "substitutions" (the `$((...))` test) and
  "browser" included, is the only killer of at least one. Short names:
  "commit" is "commit: scan clean allowed, scan hit refused", and
  "substitutions" is "$((...)) starts no heredoc; the commands inside a
  substitution, quoted or not, are parsed".
  - Pass 1's and revision 2's: (a) drop `f === '-f' ||` from the force
    check: "force push" alone; (b) the double-quote backslash rule
    unescapes every character: "Bash writes", "Windows spellings",
    "commit or push after another command", "commit" and "git -C and cd"
    (Windows paths in double quotes); (c) delete `'scan-patterns.local'`
    from the protected list: "Edit and Write" alone; (d) delete the `cd`
    line in `bash`: "Windows spellings", "commit or push after another
    command", "git -C and cd" and "git cannot answer"; (e) the catch's
    `process.exit(2)` to `process.exit(1)`: every test; (f) no prefix stripping in `words`: "prefixes"
    alone; (g) `defaultBranch` always returns `'main'`: six push, prefix
    and comment tests; (h) `-C` never sets `dir`: "commit", "git -C and cd"
    and "git cannot answer"; (i) drop `--all`: "--all, --mirror and glob"
    alone; (j) `r.status !== 0` to `r.status === 1`: "any nonzero scan
    exit" alone; (k) resolve `-F` against the hook's own cwd, not the
    `git -C` folder: "commit" alone; (l) drop the glob refspec refusal:
    "--all, --mirror and glob" alone; (m) drop `|| dst === '@'`: "push with
    no refspec, HEAD or @" alone; (n) removals checked with `isProtected`,
    (p) delete the `rm` line: "Bash writes", "Windows spellings",
    "comments and heredoc bodies" and "substitutions"; (o) delete the `mv`
    sources line, (q) drop `$HOME` and `${HOME}` from `toPath`, (u) drop
    `--in-place`: "Bash writes" alone; (r) parentheses not separators:
    "prefixes" alone; (s) `PowerShell` on the safe list: "only the safe
    tools" alone; (t) drop the `-F -` refusal: "a message from stdin"
    alone; (v) delete the `/c/` line in `toPath`: "Windows spellings"
    alone (Windows only); (w) `r.path + '/'` to `r.path` in `isProtected`,
    (x) the checkout list without `settings.local.json`: "Edit and Write"
    alone; (y) `-c` skips one word: "git -C and cd" alone; (z) a glued
    short-option value ignored: "commit" and "a message from stdin".
  - Fold 2's: (aa) the descriptor digit kept as a word, (ab) a value-taking
    push option keeps its value as a refspec, (ac) an unknown long push
    option allowed, (ad) an unknown short push option allowed: "push:
    redirections and option values" alone; (ae) no check that git can
    answer: "git cannot answer" alone; (af) `timeout` not a wrapper, (ag)
    its duration kept, (ah) `exec` not a wrapper, (ai) wrapper options that
    take a value not skipped, (ao) no line continuation: "prefixes" alone;
    (ak) any `#` starts a comment, (am) `<<-` tabs not stripped, (an) a
    quote left open allowed: "comments and heredoc bodies" alone; (aj)
    comments not skipped: "comments and heredoc bodies" and
    "substitutions"; (al) heredoc bodies not skipped, (ap) newline not a
    separator: "comments and heredoc bodies", "substitutions" and
    "commit"; (aq) `gh -R` not skipped, (ar) any `gh <x> merge` refused:
    "gh pr merge" alone; (as) only the first `-m` scanned, (at) a cluster
    read only at its first letter, (au) the raw command not scanned (the
    `--mess` line), (aw) the temporary folder not removed, (ax) a missing
    `-F` file allowed: "commit" alone; (av) the home folder not read as
    `~`: "commit" and "Windows spellings"; (ay) a commit after another
    command allowed: "commit or push after another command" alone; (az)
    `/dev/stdin` not refused: "a message from stdin" alone (on Windows the
    path does not exist; on Linux and macOS, unrun, the hook's spent stdin
    would read empty and the commit pass, which the same check also
    catches); (ba) the scan timeout not reported: "a scan that does not
    finish in time" alone; (bb) MultiEdit checked as a read, (bc) only the
    main checkout's settings: "Edit and Write" alone; (bd) cp with no
    source base name, (be) `cp -t` not read, (bf) globs read literally,
    (bg) a glob matching a leading dot, (bh) the root not a parent of all,
    (bi) `>&` not a write, (bj) `&>` not a write: "Bash writes" alone; (bk)
    Monitor on the safe list, (bl) any skill runs, (bm) Read checked as a
    write: "only the safe tools" alone; (bn) the tool name's type
    unchecked, (bo) a null `tool_input` passes, (bp) a string `tool_input`
    passes: "fails closed" alone; (bq) a deletion under `showcase` without
    the slash allowed: "remote branch deletion" alone; (br) single quotes
    not quotes: "push: feature branch", "comments", "substitutions" and
    "commit"; (bs) an unquoted backslash kept: "push: feature branch"
    alone.
  - Pass 3's own, each killed in fold 3's run, the twelve it saw survive
    first: (bt) the scan timeout 40 s, over the hook's 30: T3's "the scan
    timeout is under the hook timeout" alone (the guard suite cannot see
    it); (bu) the heredoc list not cleared after a body, (bv) a delimiter
    matched by its prefix, (bw) the `<<-` strip on every heredoc: "comments
    and heredoc bodies" alone; (bx) a push `-o` mid-cluster always taking
    the next word: "push: redirections and option values" alone; (by) the
    raw command's home folder without its `/c/` form, (bz) matched case
    sensitively: "Windows spellings" alone (Windows only); (ca) a glued
    `-t` ignored, (cb) the glob root's parent dropped: "Bash writes" alone;
    (cc) `env -C` not a valued option: "prefixes" alone; (cd) a backslash
    and newline kept inside double quotes: "push: feature branch" alone;
    (ce) `force-with-lease=` unknown to `PUSH_EQ`: survives, and is
    equivalent (the unknown option is refused anyway). The rest of pass 3's
    were killed as it found: (cf) redirect targets kept as words: "push:
    redirections and option values" alone; (cg) `cd` counted as another
    command: "commit or push after another command", "git -C and cd" and
    "git cannot answer"; (ch) only git counted as another command: "commit
    or push after another command" alone; (ci) the glob's parent check
    dropped, (cj) `tee` not a write, (ck) sed's last file not checked:
    "Bash writes" alone; (cl) a comment eating its newline: "comments and
    heredoc bodies" alone; (cm) `--file=` ignored: "commit" and "a message
    from stdin".
  - Fold 3's, on the new code: (cn) a recursive cp not checked, (co) `-a`
    not read as recursive: "Bash writes" alone; (cp) `/c` alone read as
    `c:` again: "Windows spellings" alone (Windows only); (cq) an unquoted
    `$(` not a substitution, (cr) unquoted backticks not one:
    "substitutions" and "commit or push after another command"; (cs)
    quoted substitutions not parsed: those two and "commit"; (ct) a heredoc
    read with an unquoted delimiter may lead a commit, (cu) `<(` and `>(`
    not substitutions: "commit or push after another command" alone; (cv)
    no heredoc read may lead: "commit" alone; (cw) a substitution left open
    allowed, (cx) a subshell's `)` closing the substitution around it:
    "substitutions" alone; (cy) `--fil` not read as `--file`: "commit"
    alone; (cz) `--fil=` not read as `--file=`: "commit" and "a message
    from stdin"; (da) the browser's `computer` tool taking any action, (db)
    zoom refused, (dc) `javascript_tool` on the safe list: "browser" alone.
- [ ] Commit: `Scripts: perturb-guard, the /perturb PreToolUse hook`, body:
  the tripwire-not-sandbox limit, why it is an allow-list, and why a commit
  or push must lead its call.

### T3: the /perturb skill and its hook command

**Depends on:** T2
**Files:** create `skills/perturb/SKILL.md`; test `scripts/perturb-hook.test.sh`
**Seams:** the frontmatter's hooks block and `disable-model-invocation`
line, and the hook command run exactly as written by `bash -c`.
**Interfaces:** consumes `node ~/.claude/scripts/perturb-guard.mjs` (T2).
Produces the user-only skill `perturb`, the matcher `.*` (every tool,
MCP tools included; see Global constraints), the hook command
`command -v node >/dev/null || { echo 'perturb-guard: node not found, refusing' >&2; exit 2; }; node ~/.claude/scripts/perturb-guard.mjs || exit 2`,
and `timeout: 30` (seconds; the value is a Choice for the owner's review:
above the scan's 20 s and the 6.7 to 7.1 s pass 2 measured for a 3000-file
scan under load; the test checks the guard's scan timeout stays under it).
**Verify:** `bash scripts/perturb-hook.test.sh`

- [ ] Write the failing test `scripts/perturb-hook.test.sh`:

```bash
#!/usr/bin/env bash
#
# perturb-hook.test.sh: check skills/perturb/SKILL.md's frontmatter and run its hook command exactly as written,
# with a throwaway HOME holding the scripts where setup installs them: the hooks block is the one below, word for
# word (every tool reaches the guard); the guard's scan timeout is under the hook's; the skill is user-only; node
# hidden from PATH refuses (exit 2); the guard script missing refuses; an allowed call passes. Exit 0 = every check
# passed.
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

EXPECTED=$(cat <<'EOF'
hooks:
  PreToolUse:
    - matcher: ".*"
      hooks:
        - type: command
          shell: bash
          command: "command -v node >/dev/null || { echo 'perturb-guard: node not found, refusing' >&2; exit 2; }; node ~/.claude/scripts/perturb-guard.mjs || exit 2"
          timeout: 30
EOF
)
# The frontmatter from its hooks: line to its closing ---.
block=$(awk 'NR == 1 && $0 == "---" { fm = 1; next } fm && $0 == "---" { exit } fm && /^hooks:/ { on = 1 } on { print }' "$SKILL" 2>/dev/null)
check "the frontmatter hooks block, word for word" [ "$block" = "$EXPECTED" ]
check "user-only: disable-model-invocation: true" grep -qx 'disable-model-invocation: true' "$SKILL"
cmd=$(printf '%s\n' "$block" | sed -n 's/^ *command: "\(.*\)"$/\1/p' | sed 's/\\"/"/g')
# The guard's scan timeout (ms) under the hook's (s), so a slow scan is refused by the guard, not cut off.
hook_s=$(printf '%s\n' "$block" | sed -n 's/^ *timeout: \([0-9][0-9]*\)$/\1/p')
scan_ms=$(sed -n 's/.*PERTURB_SCAN_TIMEOUT_MS) || \([0-9][0-9]*\);$/\1/p' "$HERE/perturb-guard.mjs")
under() { [ -n "$1" ] && [ -n "$2" ] && [ "$2" -lt $(($1 * 1000)) ]; } # <hook s> <scan ms>
check "the scan timeout is under the hook timeout" under "$hook_s" "$scan_ms"

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
  the hooks block is empty, so the command is empty and `bash -c ""`
  exits 0: every check FAILs except "an allowed call: exit 0" (grep also
  reports the missing file). The scratch run printed:

```text
FAIL  the frontmatter hooks block, word for word
FAIL  user-only: disable-model-invocation: true
FAIL  the scan timeout is under the hook timeout
FAIL  node missing: exit 2
FAIL  node missing: says so
ok    an allowed call: exit 0
FAIL  guard script missing: exit 2
perturb-hook.test.sh: 6 FAILED, 0 skipped
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
    - matcher: ".*"
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
large diff is welcome. The guard in this skill's frontmatter sees every
tool call from now to the end of the session. It lets through only Read,
Grep, Glob, Bash, Edit, MultiEdit, Write, NotebookEdit, the frames skill,
the browser's read-only tools, and tools that ask the owner, plan, or
search; it refuses every other tool, Agent, Workflow, PowerShell, MCP
tools and session starters included. Of those, it refuses writes to or
removal of the owner's protected config; pushes to the default branch,
force pushes, `gh pr merge`, and deleting remote branches outside
`showcase/`; `git commit -F -`; and a `git commit` or `git push` that
follows any command but `cd` in the same Bash call. It scans every other
commit for private values. A refusal is not an obstacle to route around:
say what was refused and why you wanted it, and the owner runs it if they
approve. The guard is a tripwire, not a sandbox; never write a script to
do what it refuses.

Leaving `/perturb` means starting a new session; the default there is the
owner's full charter.

After the session is resumed or compacted, the guard may no longer be
registered. Before any write, push or commit, stop and ask the owner to run
`/perturb` again.

## 1. Preflight (one short turn)

1. Check: `node --version` answers; the working tree is clean; the repo's
   CLAUDE.md names a verify command; `bash ~/.claude/scripts/commit-scan.sh .`
   exits 0 (a hit or a setup message here would refuse the first commit).
   Any missing: say so and stop.
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
  see, interfaces others depend on, file formats, the spec's words, spend,
  merges, and deploys. Those you ask. Log each call you make at once in the
  report draft as `Ruling (Claude): <what>; why: <reason>; cost if wrong:
  <cost>`.
- The floor holds on every commit: tests and typecheck green before it, the
  commit form of the charter. Red exploration stays uncommitted or is
  reverted.
- Commits and pushes: stage with `git add` in one Bash call; run
  `git commit` in the next, alone or after `cd`; push in a third. The scan
  reads the repo before a call runs, so a commit after other commands in
  the same call would go out unscanned. Messages go by `-m` or `-F <file>`;
  both, and the command itself, are scanned. For a message from a heredoc,
  use `-m "$(cat <<'EOF' ... EOF)"` with the delimiter quoted; no other
  substitution may appear in a commit or push call.
- Check anything a student would see the way they see it: serve it from a
  Bash call run in the background (or open the file), then in the browser
  navigate to it, resize to the mobile preset, take a screenshot and read
  the page; resize back to desktop after. Clicks, typing, form input, page
  scripts and `preview_start` are refused: say what to click, and the owner
  tries it.
- Draw on the `frames` skill for directions the owner's framing hides.
- Open no pull request: the branch is pushed, never merged. Mining happens
  in a fresh session, under the full charter.

## 3. Close

Write `PERTURB-REPORT.md` at the branch root. Then three Bash calls:
`git add PERTURB-REPORT.md`; `git commit -m "<subject>"`; `git push`. End
with the `/handoff` step 4 block. The report has, in order:

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
  each (all 9 were killed in fold 3's scratch run, by the checks named):
  (a) in the frontmatter command, the node-missing `exit 2` to `exit 1`:
  "the frontmatter hooks block" and "node missing: exit 2" (the second is
  skipped where no PATH leaves out node, which the run must report);
  (b) `perturb-guard.mjs` in the command to `perturb-guard.js`: the block
  and "an allowed call: exit 0"; (c) delete the trailing `|| exit 2`: the
  block and "guard script missing: exit 2"; (d) matcher `".*"` to
  `"Bash"`, (e) `PreToolUse` to `PostToolUse`, (f) delete `shell: bash`,
  (i) `type: command` to `type: prompt`: the block alone; (g) delete
  `timeout: 30`: the block and "the scan timeout is under the hook
  timeout"; (h) `disable-model-invocation: true` to `false`: "user-only"
  alone. The behavior checks are not sole killers of any frontmatter
  mutant, since the block is compared word for word; they stay because the
  spec names them (the wrapper refuses with node hidden, the hook command
  with the guard missing exits 2) and they prove the command runs as
  written. Pass 2's "unreadable input" check is dropped: it killed no
  mutant, and the guard suite covers malformed input. "The scan timeout is
  under the hook timeout" reads the guard too: it alone kills T2's mutant
  (bt), the guard's 20 s raised to 40 s. Two prose mutants survive and are
  left so: the SKILL body without its re-invoke paragraph, and another
  skill name in the frontmatter (the block check starts at `hooks:`).
- [ ] Commit: `Skills: /perturb, latitude behind a hook`, body: why the hook
  lives in the frontmatter and sees every tool, why it ends `|| exit 2`,
  and why leaving means a new session.

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
`origin/<branch>` for a pushed one no local branch holds (a branch both
local and pushed is listed once, by its local name).
**Verify:** `bash scripts/ground-truth.test.sh`

- [ ] Write the failing test, inserted in `scripts/ground-truth.test.sh`
  before its final `echo` and summary, using the file's own `check`, `has`,
  `lacks`, `git_q` and `run`. The "not listed" check asks for the line
  this section would print: the existing "branches with no worktree"
  section lists every local branch, showcase ones included, in another
  form.

```bash
# Showcase branches: with only one inside 14 days, no header; a local one past 14 days is listed with its age, once
# though it is also pushed, as is a pushed one no local branch holds; one inside 14 days is not, nor is an old branch
# outside showcase/, local or pushed.
git_q init -q --bare "$T/show-origin.git"
git_q init -q "$T/show" && (
  cd "$T/show" || exit 1
  git symbolic-ref HEAD refs/heads/main
  git_q commit --allow-empty -m first
  git_q remote add origin "$T/show-origin.git"
  new=$(( $(date +%s) - 5 * 86400 ))
  git_q checkout -b showcase/2026-01-02-new main &&
    GIT_COMMITTER_DATE="@$new" git_q commit --allow-empty -m new
  git_q checkout main
)
run "$T/show-new.txt" --no-fetch "$T/show"
check "showcase inside 14 days only: no header" lacks "$T/show-new.txt" "showcase branches older than"
(
  cd "$T/show" || exit 1
  old=$(( $(date +%s) - 20 * 86400 ))
  git_q checkout -b showcase/2026-01-01-old main &&
    GIT_COMMITTER_DATE="@$old" git_q commit --allow-empty -m old && git_q push origin showcase/2026-01-01-old
  git_q checkout -b showcase/2026-01-03-pushed main &&
    GIT_COMMITTER_DATE="@$old" git_q commit --allow-empty -m pushed
  git_q push origin showcase/2026-01-03-pushed
  git_q checkout -b old-feature main &&
    GIT_COMMITTER_DATE="@$old" git_q commit --allow-empty -m old-feature && git_q push origin old-feature
  git_q checkout main
  git_q branch -D showcase/2026-01-03-pushed
)
run "$T/show.txt" --no-fetch "$T/show"
check "showcase past 14 days: listed under its header" has "$T/show.txt" "  showcase branches older than 14 days:"
check "showcase past 14 days: its age" has "$T/show.txt" "    showcase/2026-01-01-old: 20 days old"
check "showcase past 14 days, local and pushed: listed once" [ "$(grep -c 'showcase/2026-01-01-old: 20 days old' "$T/show.txt")" = 1 ]
check "showcase past 14 days, pushed only: listed" has "$T/show.txt" "    origin/showcase/2026-01-03-pushed: 20 days old"
check "showcase inside 14 days: not listed" lacks "$T/show.txt" "    showcase/2026-01-02-new: 5 days old"
check "old branch outside showcase/: not listed" lacks "$T/show.txt" "old-feature: 20 days old"
```

- [ ] Run it; expected failure: the four listing checks FAIL; the
  "no header" and two "not listed" checks pass (nothing prints them
  yet). The scratch run printed:

```text
ok    showcase inside 14 days only: no header
FAIL  showcase past 14 days: listed under its header
FAIL  showcase past 14 days: its age
FAIL  showcase past 14 days, local and pushed: listed once
FAIL  showcase past 14 days, pushed only: listed
ok    showcase inside 14 days: not listed
ok    old branch outside showcase/: not listed
4 check(s) FAILED, 0 skipped
```

- [ ] Implementation, in `scripts/ground-truth.sh` before the line
  `  # Open PRs with their CI and review verdicts.`, followed by one blank
  line:

```bash
  # Showcase branches (from /perturb) past 14 days, local or pushed, each listed once (a local branch stands for
  # its pushed copy): /handoff asks the owner to delete or keep each. 14 is a placeholder number, revisited at the
  # review cadence.
  SHOWCASE_DAYS=14
  now=$(date +%s)
  old=$(git -C "$repo" for-each-ref --format='%(committerdate:unix) %(refname:short)' \
    refs/heads/showcase "refs/remotes/$REMOTE/showcase" |
    awk -v now="$now" -v d="$SHOWCASE_DAYS" -v r="$REMOTE/" '
      index($2, r) == 1 && (substr($2, length(r) + 1) in seen) { next }
      { seen[$2] = 1 }
      $1 < now - d * 86400 { printf "    %s: %d days old\n", $2, (now - $1) / 86400 }')
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
  each (all 8 were killed in fold 3's scratch run, by the checks named):
  (a) `SHOWCASE_DAYS=14` to `SHOWCASE_DAYS=25`: the four "showcase past
  14 days" checks; (b) `SHOWCASE_DAYS=14` to `SHOWCASE_DAYS=3`: "showcase
  inside 14 days: not listed", "no header" and the header check; (h)
  `if [ -n "$old" ]` to `if true`, the header printed with nothing under
  it: "showcase inside 14 days only: no header" alone; (c) delete
  `refs/heads/showcase` from the for-each-ref line: "showcase past 14
  days: its age" alone; (d) delete `"refs/remotes/$REMOTE/showcase"`:
  "showcase past 14 days, pushed only: listed" alone; (e) `refs/heads` in
  place of `refs/heads/showcase`, (f) `refs/remotes/$REMOTE` in place of
  `refs/remotes/$REMOTE/showcase`: "old branch outside showcase/: not
  listed" alone; (g) delete the awk line that skips a pushed copy: "listed
  once" alone. Pass 3's other eight were run too: seven killed (an inverted
  age test, age in hours, every local or every remote ref, the header
  dropped, author date, full ref names), and one survives as equivalent
  on these fixtures (a local branch also marked seen under its remote
  name).
- [ ] Commit: `Ground truth: flag showcase branches past 14 days`, body: the
  placeholder, and the count line's purpose (measure the ruling load).

### T6: setup, template, docs and CI

**Depends on:** T1, T2, T3, T4, T5
**Files:** modify `.claude/skills/setup-config/SKILL.md` (Rules for the
whole run; step 0; `update` mode step 3; Round 1 item 6; step 7; step 8,
item 1 and a new item 6; step 9; step 10; step 11 Undo);
`templates/charter.template.md` (header comment; The two-way deal; Working
protocol); `README.md` (Install; What you get; Daily use); `CLAUDE.md`
(Verify line); `.github/workflows/test.yml` (header comment; three steps; a
Windows job).
**Seams:** CI itself: the workflow runs every suite on Linux and macOS, and
the guard suite on Windows.
**Interfaces:** consumes every file T1 to T5 create.
**Verify:** the plan header's Verify command, then both greps below print
nothing. Every file the plan creates or modifies:

```bash
F="README.md CLAUDE.md templates .claude .github/workflows/test.yml commands/handoff.md skills/perturb skills/frames scripts/commit-scan.sh scripts/commit-scan.test.sh scripts/perturb-guard.mjs scripts/perturb-guard.test.mjs scripts/perturb-hook.test.sh scripts/ground-truth.sh scripts/ground-truth.test.sh docs/perturb-plan.md"
grep -rn $'\xe2\x80\x94' $F
grep -rnE '\b[KRL][0-9]{1,3}[a-z]?\b' $F
```

- [ ] setup-config, Rules for the whole run: "Private values stay out:
  when the adopter names something they keep out of tracked files, record
  the category, never the value." becomes "Private values stay out: when
  the adopter names something they keep out of tracked files, record the
  category, never the value. The one exception is the untracked scan list
  `~/.claude/scan-patterns.local` (step 8.6), written only on its own yes."
- [ ] setup-config step 0, a new bullet after the `git --version` one:
  "- `node --version`: `/perturb`'s guard runs on node, and without it every
  tool call under `/perturb` is refused;"
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
  `~/.claude/scan-patterns.local` is absent, the scan list: ask Round 1
  item 6's separate question, and on a yes ask for the values themselves
  (`update` skips the interview, so it has none in hand), then draft the
  list as in step 8.6 and show it before writing."
- [ ] setup-config Round 1 item 6: after "deleted right after.", add:
  "Separately: `/perturb`'s commit scan needs these values on this disk, in
  an untracked `~/.claude/scan-patterns.local`, to refuse commits that
  contain them. Keep them there? Without the list, `/perturb` refuses every
  commit."
- [ ] setup-config step 7, third bullet: "`skills/build`,
  `commands/handoff.md` and `scripts/` are replaced or kept together"
  becomes "`skills/build`, `skills/perturb`, `commands/handoff.md` and
  `scripts/` are replaced or kept together".
- [ ] setup-config step 8 item 1: "cost gate's last sentence. Always keep"
  becomes "cost gate's last sentence; if the cost gate is off, end the
  `/perturb` bullet at "it spawns no agents." Always keep".
- [ ] setup-config step 8, new item 6 (renumber the following items):
  "**Scan list**, only if they said keep: `~/.claude/scan-patterns.local`,
  one rule per line, `<label><TAB><regex>`, the label the category's
  third-person name, the regex the value with regex characters escaped,
  plus a home path rule when the login name was given. The file holds
  one backslash pair per Windows separator; for the login `jdoe` the
  line is `home path<TAB>(C:\\Users\\|/Users/|/home/)jdoe`, which
  matches `C:\Users\jdoe`, its forward-slash form and `/home/jdoe` in any
  case." (Checked in pass 2's scratch run: that rule, read from a file,
  matched all three forms under both `grep -i -E` and `git grep -i -E`, and
  not `C:Usersjdoe`.)
- [ ] setup-config step 8, the Source record item (now 8): after "and every
  installed path", add "(`scan-patterns.local` among them, if written)".
- [ ] setup-config step 9: "the copy list, `setup-source.md`," becomes "the
  copy list, the scan list (if they said keep; its values are the
  adopter's own and appear only in this session), `setup-source.md`,".
- [ ] setup-config step 10, a new check after "No private values":
  "**Scan list**, if written, and only if `~/.claude` is itself a git
  repository (`git -C ~/.claude rev-parse --show-prefix` succeeds and
  prints an empty line, as in step 0): `bash ~/.claude/scripts/commit-scan.sh ~/.claude`
  exits 0 (no tracked file holds a value); report the exit code only.
  Otherwise say it was skipped: the No private values check covers the
  installed files."
- [ ] setup-config step 10, Line counts: "charter under about 120" becomes
  "charter under about 130".
- [ ] setup-config step 11, Undo: "remove the paths listed in
  `~/.claude/setup-source.md`" becomes "remove the paths listed in
  `~/.claude/setup-source.md` (the scan list among them, if written)".
- [ ] Charter template, header comment: "so it stays under about 120
  lines." becomes "so it stays under about 130 lines (raised from about 120
  on 2026-11-21, when the conjugate pass and `/perturb` bullets came in)."
- [ ] Charter template, The two-way deal, a new last bullet:
  "- **Conjugate pass:** each side hunts the other's blind sides. A task's
  closing report ends with 0 to 2 conjugate bets, orthogonal to the
  owner's framing, each naming its generator and the assumption it breaks
  (the `frames` skill holds the generators and checks). Claude names one
  unexamined premise per session; the owner may answer \"median answer\"
  and gets a non-median alternative."
- [ ] Charter template, Working protocol, after the Unattended-runs bullet:
  "<!-- If the cost gate is off, end this bullet at "it spawns no agents." -->"
  on its own line, then "- Under `/perturb`, Claude rules unasked on
  everything except what a student or end user would see, interfaces,
  formats, spec words, spend, merges and deploys; it spawns no agents, so
  the cost gate has nothing to ask."
- [ ] README Install, the paragraph that starts "The scripts need bash", a
  last sentence: "`/perturb`'s guard also needs node; setup checks for it."
- [ ] README What you get, two rows after `/build`: `/perturb` ("Works
  with wide latitude toward an ambitious result on a showcase branch you
  mine; a hook lets through only the tools it can check and refuses
  default-branch and force pushes, merges, config writes, agents and the
  other shells. Needs node."); `frames` ("Generators and checks for the 0
  to 2 bets that end a task's report."); and in the Ground truth row, add
  "`commit-scan.sh` refuses a `/perturb` commit that holds a value from
  your untracked scan list."
- [ ] README Daily use, a last bullet: "- **`/perturb <direction>`** when
  you want to see how far an idea goes. Claude works alone on a showcase
  branch you mine later in a fresh session; to leave `/perturb`, start a
  new session."
- [ ] `CLAUDE.md` Verify bullet: "`bash scripts/ground-truth.test.sh` and
  `bash scripts/build-stop-gate.test.sh`, both green." becomes
  "`bash scripts/ground-truth.test.sh`, `bash scripts/build-stop-gate.test.sh`,
  `bash scripts/commit-scan.test.sh`, `node --test scripts/perturb-guard.test.mjs`
  and `bash scripts/perturb-hook.test.sh`, all green. CI runs all five on
  Linux and macOS, and the guard suite (`node --test`) alone on Windows."
- [ ] `.github/workflows/test.yml`: the header comment's first words
  "The two script suites" become "The test suites", and the comment gains
  a last line: "# A Windows job runs the guard suite alone (node only)."
  After the build-stop-gate step add the three steps and the job:

```yaml
      - if: ${{ !cancelled() }}
        run: bash scripts/commit-scan.test.sh
      - if: ${{ !cancelled() }}
        run: node --test scripts/perturb-guard.test.mjs
      - if: ${{ !cancelled() }}
        run: bash scripts/perturb-hook.test.sh

  guard-windows:
    # The guard suite alone on Windows, where its drive-letter, /c/ and case-folding paths run. The bash suites
    # stay on Linux and macOS.
    runs-on: windows-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - run: node --test scripts/perturb-guard.test.mjs
```

  The Windows job is unrun until the PR's CI: its `bash` (the guard runs
  `commit-scan.sh` through it) is assumed to be Git Bash, as on GitHub's
  Windows images; a FAIL there is fixed in the PR, not skipped.
- [ ] Run the Verify lines; expected: all five suites pass, both greps
  print nothing.
- [ ] Commit: `Docs and CI: /perturb, frames, commit scan`, body: the
  consent step, why CI runs node, and why the charter cap moved.

## After merge (the owner's word, not /build)

1. A docs pull request on main removes `docs/perturb-plan.md`,
   `BUILD-PROGRESS.md` and `BUILD-REPORT-*.md`; it lands with green CI and
   the maintainer merges, like every other change here.
2. Copy `skills/perturb/`, `skills/frames/`, `scripts/commit-scan.sh` and
   `scripts/perturb-guard.mjs` into `~/.claude`, and whitelist the two
   skill folders in `~/.claude/.gitignore`. Port T5's hunks into the
   installed `scripts/ground-truth.sh` and `commands/handoff.md` instead of
   copying them: the installed copies differ from this repo's base (by 19
   and 263 lines in pass 2's count), and T5's anchors each occur once in
   them.
3. Before step 4, take the OS login name out of tracked files in
   `~/.claude`, or `commit-scan.sh` would refuse every commit there under
   `/perturb`. List them first: `git -C ~/.claude grep -l -i "$(id -un)"`;
   at this fold it lists three, and the count moves.
   a. `scripts/leak-scan.sh` holds the name as its own pattern, in the rule
      labelled `login name or home path`, which kymograph's commits run
      through. Before editing, record its result on kymograph:
      `bash ~/.claude/scripts/leak-scan.sh ~/kymograph >/tmp/leak-before.txt; echo $?`.
      Then build the name at run time: add, just above `status=0`,

      ```bash
      login=$(id -un 2>/dev/null)
      [ -n "$login" ] || { echo "leak-scan: cannot read the login name (id -un); refusing, since an empty name would match every line" >&2; exit 2; }
      ```

      and in that rule's single-quoted pattern, replace the literal name
      that leads it with `"$login"`, closing the quote before it and
      reopening it after (`"$login"'|...'`, the home-path alternatives
      after the `|` kept as they are). The
      refusal matters: with an empty name the pattern starts with `|`, and
      `grep -E` then matches every line (checked: `grep -c -E '|zz'` counts
      every line). Confirm, in this order:
      - `git -C ~/.claude grep -c -i "$(id -un)" -- scripts/leak-scan.sh`
        prints nothing;
      - in a throwaway repo (`git init` in a temp folder), a file holding
        the name (`printf 'path %s\n' "$(id -un)" >t.txt`; untracked is
        enough, since leak-scan reads untracked files too): `leak-scan.sh`
        on it exits 1 and prints `== login name or home path` and a
        `t.txt:1:` line; with the file removed it exits 0;
      - with an `id` that fails first on `PATH`, it exits 2;
      - on kymograph, the same exit code and output as recorded before
        (`diff` against `/tmp/leak-before.txt`).
      This fold ran each of those on a scratch copy of the current file:
      exit 1 with the header and the hit line, exit 0 clean, exit 2 with
      `id` failing, and kymograph's output byte for byte the same (exit 0),
      before and after. Commit `scripts/leak-scan.sh` alone in `~/.claude`.
   b. The other two, under `plans/ledger/critiques/pass-2/`, belong to
      another session's work. Name them to the owner and ask whether to
      edit, remove or keep them; do not edit them here. Step 4's exit 0
      waits on that answer, and is reachable once both are out of the
      `git grep` list above.
4. Write `~/.claude/scan-patterns.local` from the owner's private values;
   `bash ~/.claude/scripts/commit-scan.sh ~/.claude` exits 0.
5. Add the charter line from the spec's section 8 to `~/.claude/CLAUDE.md`.
6. Delete `~/.claude/skills/hookprobe/` (the drafting session's probe).
7. Live check, in a throwaway session in a scratch repo with an `origin`:
   run `/perturb`, then try one call per tool class and expect each refused
   with the guard's reason: a Bash push to the default branch; a Write to
   `~/.claude/settings.json`; an Agent call; one MCP tool (a session
   starter, if connected); a commit whose message holds a scan-list value;
   a browser `computer` click. A Read and a browser screenshot pass. Record the results beside the build report.

## Overnight readiness

Every task names its seams and verify command, and no task waits on an open
pull request. Attended `/build` can run T1 to T6 once the preflight has
run.
