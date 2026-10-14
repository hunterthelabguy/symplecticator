#!/usr/bin/env bash
#
# build-stop-gate.sh: the Stop hook /build registers from its frontmatter. Once the clearing review has
# cleared a build (its `Review: <reviewer> at <sha>` line is in the draft PR's body, /build step 4), the session
# may not stop until the body also carries the resume block (/handoff step 4 form), so a cleared run cannot end
# without what the next session starts from. Editing a PR body is not a commit, so writing the block never voids
# the clearing review. Not gated, by design: a run that never clears (three review rounds
# without clearing, a red verify), which /build still has end with the block, whose PR reads "no Review line" in
# ground truth and whose report carries the state; and the block's repeat in the final message, since skill hooks
# persist for the session and checking every later message would refuse ordinary turns. A stale Review line
# (ground truth: "review STALE") still counts here, which is stricter than "cleared at head".
#
# The stop goes through when a stop hook already continued this turn, off a build/* branch (/build checks out
# its integration branch), with no open PR, before the Review line (preflight, mid-run questions, a review
# still running), or with the block present. When gh cannot answer, the stop goes through with a warning shown
# to the owner: a broken probe must not trap a session, and the warning keeps it from reading as a pass.
#
# Usage (as a hook, with the hook's JSON on stdin): bash ~/.claude/scripts/build-stop-gate.sh

set -u

# "nopr", or whether the body has a Review line and the block's "Your task:" label, as "true<TAB>false". The
# Review-line pattern is ground-truth.sh's, line for line; the test runs both on the same bodies.
GATE_JQ='if length == 0 then "nopr" else (.[0].body // "") as $b
  | [([$b | splits("\r?\n") | test("^[ \t]*Review: (?P<who>.+) at `?(?P<sha>[0-9a-f]{7,40})`?[ \t.]*$")] | any),
     ($b | contains("Your task:"))] | @tsv end'

input=$(cat)
case $input in *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;; esac

branch=$(git symbolic-ref -q --short HEAD 2>/dev/null) || exit 0
case $branch in build/*) ;; *) exit 0 ;; esac

warn() { # <what went wrong>: let the stop through, and say why to the owner (JSON-safe characters only)
  local why
  why=$(printf '%s' "$1" | tr -c '[:alnum:] .,:;_()/-' ' ' | cut -c1-200)
  printf '{"systemMessage": "build-stop-gate: %s, so the resume block was not checked."}\n' "$why"
  exit 0
}

command -v gh >/dev/null || warn "gh is not installed"
err=$(mktemp) || warn "mktemp failed"
trap 'rm -f "$err"' EXIT
if ! state=$(gh pr list --head "$branch" --state open --json body --jq "$GATE_JQ" 2>"$err"); then
  warn "gh pr list failed: $(head -n 1 "$err")"
fi
case $state in
  $'true\tfalse') ;;
  nopr | $'false\t'* | $'true\ttrue') exit 0 ;;
  *) warn "gh gave an unexpected answer" ;;
esac

echo "The /build close-out is missing: the PR body has the clearing review's Review line but no resume block." \
  "Put the /handoff step 4 block, written from the ground-truth script at the head, in the PR body with gh pr edit" \
  "(not a commit, so the clearing review stands), then repeat it in your final message." >&2
exit 2
