#!/usr/bin/env bash
#
# commit-scan.sh: the pre-commit privacy scan /perturb's guard runs before every git commit. From the repo's top
# level it scans the tracked files as staged (the index) and as they stand in the working tree (what `commit -a`
# would add), and the tracked files' names; untracked files are not part of the commit. When given, it scans the
# commit message file too (the guard also passes it what a push would send). The patterns are the owner's
# untracked list ~/.claude/scan-patterns.local: one rule per line, <label><TAB><extended regex>, blank and # lines
# ignored, matching case-insensitive. A missing list, a list with no rules, a malformed line, a regex grep cannot
# read, a missing message file and a folder that is not a repo all refuse (exit 1), because a scan that could not
# run would read as a pass. Binary files are skipped (-I).
#
# Usage: bash commit-scan.sh <repo> [<message file>]
# Exit 0 = clean; 1 = a hit (each as <file>:<line>: <text> under its rule's label, a name as
# <file>: (file name)), or a scan that could not run; 2 = usage error.

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

# The tracked files' names, as staged: a name leaves with the commit like the lines do.
names=$(git -C "$top" -c core.quotePath=false ls-files 2>&1) || { echo "commit-scan: cannot list the tracked files: $names"; exit 1; }

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
  if [ -n "$names" ]; then
    out=$(printf '%s\n' "$names" | grep -i -E -e "$re" 2>&1)
    rc=$?
    [ "$rc" -le 1 ] || { echo "commit-scan: rule on line $n failed on the file names (grep exit $rc): $out"; exit 1; }
    [ "$rc" = 0 ] && hits="${hits:+$hits$'\n'}$(printf '%s\n' "$out" | sed 's/$/: (file name)/')"
  fi
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
