#!/usr/bin/env bash
#
# build-stop-gate.test.sh: prove build-stop-gate.sh can fail. A throwaway repo and a fake gh walk the gate's
# branches (loop guard, off a build branch, no PR, no Review line yet, block missing, block present, gh failing,
# gh missing, a garbled answer); the fake gh answers only the call the gate is meant to make, and every warning
# must parse as JSON. Then the gate's jq program runs in gh's own jq on fixtures, and the gate and
# ground-truth.sh's review() must agree on shared bodies. Exit 0 = every check passed.
#
# Usage: bash ~/.claude/scripts/build-stop-gate.test.sh

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/build-stop-gate.sh"
GT="$HERE/ground-truth.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/build-stop-gate-test.XXXXXX") || exit 1
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test
# Git ignores a ceiling equal to the current directory, so the ceiling is $T's parent: "not a git repo" then
# holds even when TMPDIR sits inside a repo.
export GIT_CEILING_DIRECTORIES="$(dirname "$T")"

failures=0 skipped=0
check() { # <what> <command...>
  if "${@:2}"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
has() { grep -qF -- "$2" "$1"; } # <file> <text>
empty() { [ ! -s "$1" ]; }       # <file>
json_ok() { perl -MJSON::PP -e 'local $/; decode_json(<STDIN>)' <"$1" 2>/dev/null; } # <file>: valid JSON

# A fake gh: it answers `gh pr list --head build/x --state open --json body --jq <the gate's program>` as that
# program would, FAKE_GH picking the answer, and refuses any other call, so a gate asking the wrong question
# goes red.
mkdir -p "$T/bin"
cat >"$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
case " $* " in
  *" pr list --head build/x --state open --json body --jq "*) ;;
  *) echo "fake gh: unexpected call: $*" >&2; exit 3 ;;
esac
case ${!#} in
  'if length == 0 then "nopr"'*) ;;
  *) echo "fake gh: unexpected jq program" >&2; exit 3 ;;
esac
case $FAKE_GH in
  nopr) echo nopr ;;
  noreview) printf 'false\tfalse\n' ;;
  noblock) printf 'true\tfalse\n' ;;
  block) printf 'true\ttrue\n' ;;
  fail) echo 'HTTP 502: Bad "Gateway" at C:\Users\x\gh.exe' >&2; exit 1 ;;
  garbled) echo 'garbled' ;;
esac
EOF
chmod +x "$T/bin/gh"
FAKE_PATH="$T/bin:$PATH"
# PATH with every folder that holds gh left out; empty when that also leaves out a tool the gate needs (a Linux
# gh package installs into /usr/bin beside git), and the gh-missing check is then skipped.
path_without_gh() { # <tools that must still resolve...>
  local d p="" t
  while IFS= read -r d; do
    [ -x "$d/gh" ] || [ -x "$d/gh.exe" ] || p="$p$d:"
  done < <(printf '%s\n' "$PATH" | tr ':' '\n')
  p=${p%:}
  for t in "$@"; do (PATH=$p && command -v "$t") >/dev/null 2>&1 || return 0; done
  printf '%s' "$p"
}
NO_GH_PATH=$(path_without_gh git cat mktemp head tr cut)

run() { # <dir> <path> <fake gh mode> <stdin>: run the gate there; stdout, stderr and exit code land in $T
  (cd "$1" && printf '%s' "$4" | PATH="$2" FAKE_GH="$3" bash "$GATE" >"$T/out" 2>"$T/err")
  echo $? >"$T/code"
}
code() { [ "$(cat "$T/code")" = "$1" ]; }
silent_pass() { code 0 && empty "$T/out" && empty "$T/err"; }
warned() { code 0 && json_ok "$T/out" && has "$T/out" '"systemMessage": "build-stop-gate: ' && has "$T/out" "$1"; }
STOP='{"hook_event_name":"Stop","stop_hook_active":false}'

mkdir "$T/repo" && cd "$T/repo" && git init -q && git symbolic-ref HEAD refs/heads/main &&
  git commit -q --allow-empty -m base || exit 1

run "$T" "$FAKE_PATH" noblock "$STOP"
check "not a git repo: passes" silent_pass
run "$T/repo" "$FAKE_PATH" noblock "$STOP"
check "on main: passes" silent_pass

git checkout -q -b build/x
run "$T/repo" "$FAKE_PATH" noblock '{"hook_event_name":"Stop","stop_hook_active":true}'
check "already continued by a stop hook: passes" silent_pass
run "$T/repo" "$FAKE_PATH" noblock '{"hook_event_name": "Stop", "stop_hook_active": true}'
check "loop guard, spaced JSON: passes" silent_pass
run "$T/repo" "$FAKE_PATH" nopr "$STOP"
check "no open PR: passes" silent_pass
run "$T/repo" "$FAKE_PATH" noreview "$STOP"
check "no Review line yet: passes" silent_pass
run "$T/repo" "$FAKE_PATH" block "$STOP"
check "block in the PR body: passes" silent_pass
run "$T/repo" "$FAKE_PATH" noblock "$STOP"
check "Review line, no block: refuses the stop" eval 'code 2 && has "$T/err" "close-out is missing"'
run "$T/repo" "$FAKE_PATH" fail "$STOP"
check "gh failing (quotes, a Windows path): passes, valid JSON warning with gh's text" \
  warned "gh pr list failed: HTTP 502: Bad  Gateway  at C: Users x gh.exe"
run "$T/repo" "$FAKE_PATH" garbled "$STOP"
check "garbled answer: passes with a warning" warned "unexpected answer"
if [ -n "$NO_GH_PATH" ]; then
  run "$T/repo" "$NO_GH_PATH" noblock "$STOP"
  check "gh missing: passes with a warning" warned "gh is not installed"
else
  echo "skip  gh missing: gh shares a folder with a tool the gate needs, so it cannot be hidden"
  skipped=$((skipped + 1))
fi

# The gate's jq, in gh's own jq: `gh api` fetches something cheap and the program ignores it. Then the gate and
# ground-truth.sh's review() read the same bodies and must agree on whether a Review line is there.
eval "$(sed -n "/^GATE_JQ='/,/'\$/p" "$GATE")"
if [ -z "${GATE_JQ:-}" ]; then
  check "GATE_JQ read from the script" false
elif ! command -v gh >/dev/null || ! gh api rate_limit --jq .rate.limit >/dev/null 2>&1; then
  echo "skip  jq verdicts and the drift check against ground truth (gh not signed in or no network)"
  skipped=$((skipped + 1))
else
  verdict() { # <fixture JSON>: the gate's answer for it, tab shown as |
    gh api rate_limit --jq "$1 | $GATE_JQ" 2>&1 | tr '\t' '|'
  }
  check "no PR" [ "$(verdict '[]')" = "nopr" ]
  check "Review line (CRLF body), no block" \
    [ "$(verdict '[{"body": "Draft.\r\nReview: Opus clearing review at abc1234\r\n"}]')" = "true|false" ]
  check "Review line first, block" \
    [ "$(verdict '[{"body": "Review: Opus at abc1234\nRepo: x\nYour task: walk the owner through it"}]')" = "true|true" ]
  check "a Repo line alone is not the block" \
    [ "$(verdict '[{"body": "Review: Opus at abc1234\nRepo: x"}]')" = "true|false" ]
  check "'Your task' without its colon is not the block" \
    [ "$(verdict '[{"body": "Review: Opus at abc1234\nYour task is pending"}]')" = "true|false" ]
  check "backticked sha counts" [ "$(verdict '[{"body": "Review: Opus at `abc1234`."}]')" = "true|false" ]
  check "indented line counts" [ "$(verdict '[{"body": "  Review: Opus at abc1234"}]')" = "true|false" ]
  check "trailing verdict word does not count (as in ground truth)" \
    [ "$(verdict '[{"body": "Review: Opus clearing review at abc1234 CLEARED"}]')" = "false|false" ]
  check "Review not at line start does not count" \
    [ "$(verdict '[{"body": "Clearing Review: Opus at abc1234"}]')" = "false|false" ]
  check "null body" [ "$(verdict '[{"body": null}]')" = "false|false" ]

  REVIEW_DEF=$(sed -n '/^def review:/,/end end;$/p' "$GT")
  if [ -z "$REVIEW_DEF" ]; then
    check "review() read from ground-truth.sh" false
  else
    # One gh call per side for all bodies (per-body calls flaked under rapid requests). A failed call leaves
    # its error words in place of true or false, so it fails the comparison rather than passing.
    bodies=('"Draft.\r\nReview: Opus at abc1234\r\n"' '"Review: Opus at `abc1234`."' '"\tReview: Opus at abc1234"'
      '"Review: Opus at abc1234 CLEARED"' '"Clearing Review: Opus at abc1234"' '"review: Opus at abc1234"'
      '"Review: Opus at ABC1234"' '"Review: at abc1234"' '"Review:  at abc1234"' '"Review:  Opus at abc1234"'
      '"Review: Opus at abc123"'
      '"Review: Opus at abc1234abc1234abc1234abc1234abc1234abc123"'
      '"x\nReview: A at abc1234 CLEARED\nReview: B at abc1234"' null)
    all="[$(IFS=,; printf '%s' "${bodies[*]}")]"
    # The programs are built outside "$(...)": bash 3.2 brace-expands {a, b} in a quoted string nested there.
    gate_prog="$all | map([{body: .}] | ($GATE_JQ) | split(\"\t\")[0]) | join(\" \")"
    gt_prog="$REVIEW_DEF $all
      | map({headRefOid: \"abc1234000\", body: .} | review
        | if . == \"no Review line\" then \"false\"
          elif . == \"cleared at head\" or startswith(\"review STALE\") then \"true\" else \"other\" end)
      | join(\" \")"
    read -ra gate_says <<<"$(gh api rate_limit --jq "$gate_prog" 2>&1)"
    read -ra gt_says <<<"$(gh api rate_limit --jq "$gt_prog" 2>&1)"
    check "both sides answered for all ${#bodies[@]} bodies" \
      eval '[ "${#gate_says[@]}" = "${#bodies[@]}" ] && [ "${#gt_says[@]}" = "${#bodies[@]}" ]'
    for i in "${!bodies[@]}"; do
      check "gate agrees with ground truth on ${bodies[i]}" [ "${gate_says[i]:-}" = "${gt_says[i]:-}" ]
    done
  fi
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) FAILED, $skipped skipped"
  exit 1
fi
echo "all checks passed, $skipped skipped"
