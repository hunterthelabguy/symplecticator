#!/usr/bin/env bash
#
# commit-scan.test.sh: prove commit-scan.sh can fail. A throwaway HOME holds the pattern list and a throwaway
# repo holds the files: a clean tree, hits in a tracked file (each listed once, though both passes see it), a hit in a
# staged new file, a hit staged but gone from the working tree, an unstaged edit in a tracked file (what
# `commit -a` would add), different hits in the index and the working tree, a scan started from a subfolder, the
# second of two rules, a rule that starts with a dash, a rule that holds #, case, a message file by absolute,
# relative and backslash path (every hit line), hits in a file and the message together, a missing message file, a
# folder that is not a repo, a list with CRLF endings and no final newline, a list with one rule, an untracked file
# (not scanned), and the refusals that keep an empty or broken scan from reading as a pass (no list, a list with no
# rules, a malformed rule, a regex grep cannot read, named by its line counted with comment and blank lines).
# Exit 0 = every check passed.
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

printf '# private values, one rule per line\n\nlegal name\tzanzibar\nlogin name\tqwopler\ndash rule\t-zq\nhash rule\tzq#9\n' >"$PAT"
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

echo "zanzibar" >loose.txt
run "$T/out" "$T/repo"; code=$?
check "untracked file with a hit: not reported" empty "$T/out"
rm loose.txt

printf 'subject\n\nsigned zanzibar\nzanzibar again\n' >"$T/msg.txt"
run "$T/out" "$T/repo" "$T/msg.txt"; code=$?
check "message file, absolute path: exit 1" [ "$code" = 1 ]
check "message file, absolute path: names the file" has "$T/out" "msg.txt:3: signed zanzibar"
check "message file: every hit line" has "$T/out" "msg.txt:4: zanzibar again"
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
printf 'subject\n\nsee zq#9\n' >"$T/hash-msg.txt"
run "$T/out" "$T/repo" "$T/hash-msg.txt"; code=$?
check "a rule that holds #: the message hit" has "$T/out" "== hash rule"
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
printf '# a comment, then a blank line\n\nbad regex\t(unclosed\n' >"$PAT"
run "$T/out" "$T/repo"; code=$?
check "a regex grep cannot read: its line counts comment and blank lines" has "$T/out" "commit-scan: rule on line 3 failed"
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
printf 'one rule\tqwopler\n' >"$PAT"
run "$T/out" "$T/repo"; code=$?
check "a list with one rule, clean tree: exit 0" [ "$code" = 0 ]
mv "$T/saved" "$PAT"

run "$T/out"; code=$?
check "no repo argument: usage error, exit 2" [ "$code" = 2 ]

echo
if [ "$failures" -gt 0 ]; then echo "commit-scan.test.sh: $failures FAILED"; exit 1; fi
echo "commit-scan.test.sh: all passed"
