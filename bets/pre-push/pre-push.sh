#!/usr/bin/env bash
#
# pre-push.sh: a prototype, not wired into /perturb and not installed by setup. A git pre-push hook that refuses,
# from what git itself says a push will do, what perturb-guard.mjs works out from the text of the push command:
# a push to the default branch, a push that is not a fast-forward (a force push), a deletion outside showcase/,
# and commits that hold a value from the scan list. git runs the hook for every push from every process (a
# script, bash -c, an alias, git --git-dir, a bare push under push.default=upstream) with the refs already
# resolved, so no spelling of the command needs reading, and no folder needs placing.
#
# What it does not cover: --no-verify skips every hook, and -c core.hooksPath=... points git at other hooks. A
# guard beside it would refuse those two in a command's text; the test beside this file pins the first as a fact.
#
# git calls it as `pre-push <remote name> <remote url>` with one line per ref on stdin:
#   <local ref> <local id> <remote ref> <remote id>      (an id of all zeros means nothing is there)
# Exit 0 lets the push go; 1 refuses it, each reason on stderr. The scan is commit-scan.sh: the path in
# PERTURB_SCAN, else beside this file, else ~/.claude/scripts/commit-scan.sh.

set -u
remote=${1:-}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
scan=${PERTURB_SCAN:-}
if [ -z "$scan" ]; then
  for c in "$here/commit-scan.sh" "$HOME/.claude/scripts/commit-scan.sh"; do
    [ -f "$c" ] && { scan=$c; break; }
  done
fi

# The default branch: the remote's HEAD as last fetched, else main (the guard's own fallback).
def=$(git symbolic-ref -q --short "refs/remotes/$remote/HEAD" 2>/dev/null) || def=""
def=${def#"$remote"/}
[ -n "$def" ] || def=main

refused=0
no() { echo "perturb pre-push: refused $*" >&2; refused=1; }

revs=()
while read -r lref lid rref rid; do
  [ -n "${rref:-}" ] || continue
  if [[ $lid =~ ^0+$ ]]; then
    case $rref in
      refs/heads/showcase/*) ;;
      *) no "deleting $rref: only showcase/ branches may be deleted under /perturb" ;;
    esac
    continue
  fi
  [ "$rref" = "refs/heads/$def" ] && no "a push to $def: pushes to the default branch are off under /perturb"
  if [[ $rid =~ ^0+$ ]]; then
    revs+=("$lid")
  elif git merge-base --is-ancestor "$rid" "$lid" 2>/dev/null; then
    revs+=("$lid" "^$rid")
  else
    no "a push to $rref that is not a fast-forward: force pushes are off under /perturb"
  fi
done

# The commits the push would send: what the pushed tips reach and the remote's branches, as last fetched, do not.
if [ "$refused" = 0 ] && [ ${#revs[@]} -gt 0 ]; then
  not=()
  git remote | grep -qxF -- "$remote" && not=(--not "--remotes=$remote")
  first=$(git rev-list --max-count=1 "${revs[@]}" ${not[@]+"${not[@]}"}) || { echo "perturb pre-push: git could not list the commits to send; refusing" >&2; exit 1; }
  if [ -n "$first" ]; then
    [ -n "$scan" ] || { echo "perturb pre-push: no commit-scan.sh to scan with; refusing, since a scan that did not run would read as a pass" >&2; exit 1; }
    tmp=$(mktemp -d "${TMPDIR:-/tmp}/perturb-pre-push.XXXXXX") || { echo "perturb pre-push: mktemp failed; refusing" >&2; exit 1; }
    trap 'rm -rf "$tmp"' EXIT
    git -c core.quotePath=false log --format=fuller --cc -U0 --no-color --no-ext-diff --no-textconv \
      "${revs[@]}" ${not[@]+"${not[@]}"} >"$tmp/message" || { echo "perturb pre-push: git could not print the commits to send; refusing" >&2; exit 1; }
    if ! out=$(bash "$scan" "$(git rev-parse --show-toplevel)" "$tmp/message" 2>&1); then
      no "commits that do not pass the scan (their messages, identities, file names and changes):"
      printf '%s\n' "$out" >&2
    fi
  fi
fi
exit $refused
