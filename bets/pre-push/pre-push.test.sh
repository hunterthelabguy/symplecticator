#!/usr/bin/env bash
#
# pre-push.test.sh: prove the prototype hook refuses real pushes, spelled the ways perturb-guard.mjs's own list of
# misses says it cannot read. A throwaway HOME holds the scan list, a throwaway origin's default branch is trunk,
# and a clone has the hook on core.hooksPath. Every case runs real git and then asks the origin what it holds.
# Not part of the repository's verify: the hook is a prototype (see PERTURB-REPORT.md).
#
# Usage: bash bets/pre-push/pre-push.test.sh        Exit 0 = every check passed.

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$HERE/pre-push.sh"
SCAN="$HERE/../../scripts/commit-scan.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/pre-push-test.XXXXXX") || exit 1
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test
export GIT_CEILING_DIRECTORIES="$(dirname "$T")" GIT_CONFIG_NOSYSTEM=1
export HOME="$T/home" USERPROFILE="$T/home" PERTURB_SCAN="$SCAN"
mkdir -p "$HOME/.claude" "$T/hooks"
printf 'legal name\tzanzibar\n' >"$HOME/.claude/scan-patterns.local"
printf '#!/usr/bin/env bash\nexec bash "%s" "$@"\n' "$HOOK" >"$T/hooks/pre-push"
chmod +x "$T/hooks/pre-push"

failures=0
check() { # <what> <command...>
  if "${@:2}"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
has() { grep -qF -- "$2" "$1"; } # <file> <text>
tip() { git -C "$T/origin.git" rev-parse -q --verify "refs/heads/$1" 2>/dev/null || echo none; } # <branch>
commit() { echo "$1" >>"$2" && git add "$2" && git commit -qm "$3"; } # <line> <file> <message>

cd "$T" || exit 1
git init -q --bare origin.git
git init -q repo && cd repo || exit 1
git config core.autocrlf false
git symbolic-ref HEAD refs/heads/trunk
commit base a.txt base
git remote add origin "$T/origin.git"
git push -q origin trunk && git remote set-head origin trunk
git config core.hooksPath "$T/hooks"
trunk=$(tip trunk)

git checkout -q -b feat && commit work a.txt "work on feat"

# refused <what> <command...>: the command fails, says why, and the origin's default branch has not moved.
refused() {
  local what=$1
  shift
  "$@" >"$T/out" 2>&1
  local rc=$?
  check "$what: the push fails" [ "$rc" != 0 ]
  check "$what: the hook says so" has "$T/out" "perturb pre-push: refused"
  check "$what: the default branch has not moved" [ "$(tip trunk)" = "$trunk" ]
}

refused "to the default branch" git push origin feat:trunk
refused "HEAD to the default branch, full ref" git push origin HEAD:refs/heads/trunk
refused "git --git-dir, its folder a word of its own" git --git-dir .git push origin feat:trunk
refused "inside bash -c" bash -c 'git push origin feat:trunk'
refused "through an alias" git -c alias.p=push p origin feat:trunk
printf 'git push origin feat:trunk\n' >"$T/p.sh"
refused "from a script" bash "$T/p.sh"
git checkout -q -b up --track origin/trunk && commit more a.txt "work on up"
refused "a bare push under push.default=upstream" git -c push.default=upstream push
git checkout -q feat

# A branch of its own goes through, and is there afterwards.
git push -q origin feat >"$T/out" 2>&1
check "a feature branch: pushed" [ "$(tip feat)" = "$(git rev-parse feat)" ]
git push -q -u origin feat:showcase/2026-11-25-x >"$T/out" 2>&1
check "a showcase branch: pushed" [ "$(tip showcase/2026-11-25-x)" = "$(git rev-parse feat)" ]

# A push that is not a fast-forward is a force push, however it is asked for.
git commit -q --amend -m "work on feat, reworded"
was=$(tip feat)
for form in "-f origin feat" "origin +feat" "--force-with-lease origin feat"; do
  # shellcheck disable=SC2086
  git push $form >"$T/out" 2>&1
  check "force push ($form): refused, the branch as it was" [ "$(tip feat)" = "$was" ]
  check "force push ($form): the hook says so" has "$T/out" "not a fast-forward"
done

# Deleting: only under showcase/.
git push origin :feat >"$T/out" 2>&1
check "deleting a branch outside showcase/: refused" [ "$(tip feat)" = "$was" ]
git push -q origin --delete showcase/2026-11-25-x >"$T/out" 2>&1
check "deleting a showcase branch: done" [ "$(tip showcase/2026-11-25-x)" = none ]

# The commits a push would send are scanned, however they were made.
git checkout -q -b leak trunk && commit clean b.txt "picked from zanzibar"
git push origin leak >"$T/out" 2>&1
check "a message with a scan-list value: refused" [ "$(tip leak)" = none ]
check "a message with a scan-list value: the hit is shown" has "$T/out" "picked from zanzibar"
git checkout -q -b clean trunk && commit clean c.txt "a clean commit"
git push -q origin clean >"$T/out" 2>&1
check "a clean branch: pushed" [ "$(tip clean)" = "$(git rev-parse clean)" ]
mv "$HOME/.claude/scan-patterns.local" "$T/saved"
git checkout -q -b nolist trunk && commit clean d.txt "another clean commit"
git push origin nolist >"$T/out" 2>&1
check "no scan list: refused, since a scan that did not run would read as a pass" [ "$(tip nolist)" = none ]
mv "$T/saved" "$HOME/.claude/scan-patterns.local"

# The limit, pinned as a fact: --no-verify skips the hook, so a guard beside it must refuse that flag.
git push -q --no-verify origin leak >"$T/out" 2>&1
check "--no-verify: the hook does not run (the stated limit)" [ "$(tip leak)" = "$(git rev-parse leak)" ]

echo
if [ "$failures" -gt 0 ]; then echo "pre-push.test.sh: $failures FAILED"; exit 1; fi
echo "pre-push.test.sh: all passed"
