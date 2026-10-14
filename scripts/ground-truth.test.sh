#!/usr/bin/env bash
#
# ground-truth.test.sh: prove ground-truth.sh can fail. Throwaway repos with an unpushed commit, a dirty worktree,
# a branch on no remote, a separate git dir, a dead remote, unreadable remote URLs, gh missing and gh failing;
# copies on main that git cherry matches but that differ in whitespace or are empty, pushed copies past their local
# tips, main merged into a landed branch; then the CI and review verdicts, run by gh's own jq on fixtures. Exit 0 =
# every check passed. Written for Git Bash, Linux and macOS (run so far on the first two); a fake ssh keeps your
# own ~/.ssh/config out of it.
#
# license: MIT (adapted 2026-10-11 from github.com/truongfelix/workflow @6d2623c, test/run.sh,
# (c) 2026 truongfelix; see LICENSE-workflow)
#
# Usage: bash ~/.claude/scripts/ground-truth.test.sh

set -u
GT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ground-truth.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/ground-truth-test.XXXXXX") || exit 1
trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test

failures=0 skipped=0
check() { # <what> <command...>
  if "${@:2}"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
has() { grep -qF -- "$2" "$1"; }    # <file> <text>
lacks() { ! grep -qF -- "$2" "$1"; } # <file> <text>
line() { grep -qxF -- "$2" "$1"; }   # <file> <whole line>
ends() { awk -v s="$2" 'substr($0, length($0) - length(s) + 1) == s { f = 1 } END { exit !f }' "$1"; } # <file> <line end>
green() { [ "$2" = 0 ] && has "$1" "$3"; } # <file> <exit code> <text>: answered, and says so
red() { [ "$2" = 2 ] && has "$1" "$3"; }   # <file> <exit code> <text>: a failed probe, exit 2 and its UNKNOWN line
same() { [ -n "$1" ] && [ "$1" = "$2" ]; } # <text> <text>: equal, and not both empty
git_q() { git "$@" >/dev/null 2>&1; }
run() { # <output file> <args...>: run the script, keep its output, return its exit code
  local out=$1
  shift
  bash "$GT" "$@" >"$out" 2>&1
}
# PATH with every folder that holds gh left out; empty when that also leaves out a tool the script needs (a Linux
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

# A repo with a remote, a worktree, a branch on no remote, uncommitted work.
cd "$T" || exit 1
git_q init --bare remote.git
git_q clone "$T/remote.git" repo && cd repo || exit 1
git symbolic-ref HEAD refs/heads/main
git_q commit --allow-empty -m first && git_q push origin main && git remote set-head origin main
git_q commit --allow-empty -m "on main, not pushed"
git_q worktree add ../repo-feat -b feat
(cd ../repo-feat && git_q commit --allow-empty -m feat && git_q push origin feat &&
  git_q commit --allow-empty -m "feat, not pushed" && echo x >dirty.txt)
git_q checkout -b spike && git_q commit --allow-empty -m spike && git_q checkout main
git_q checkout -b wip origin/main && git_q push origin wip && git_q commit --allow-empty -m "not pushed" &&
  git_q checkout main
git_q worktree add ../repo-done -b done origin/main
git_q checkout -b moved origin/main && git_q commit --allow-empty -m moved && git_q push origin moved:other-name &&
  git_q checkout main
git_q init --bare "$T/fork.git" && git remote add fork "$T/fork.git"
git_q checkout -b forked origin/main && git_q commit --allow-empty -m forked && git_q push fork forked &&
  git_q checkout main
# A rebase merge lands copies with new SHAs; the merged branches are on no remote after.
git_q checkout -b landed origin/main && echo a >a.txt && git_q add a.txt && git_q commit -m landed &&
  git_q checkout -b landed-wt && echo c >c.txt && git_q add c.txt && git_q commit -m landed-wt &&
  git_q checkout -b tmp origin/main && echo b >b.txt && git_q add b.txt && git_q commit -m other &&
  git_q cherry-pick landed landed-wt && git_q push origin tmp:main && git_q checkout main && git_q branch -D tmp
git_q worktree add ../repo-landed landed-wt
git_q checkout -b abandoned origin/main && echo d >d.txt && git_q add d.txt && git_q commit -m abandoned &&
  git_q push origin abandoned && git_q checkout main
git_q branch shipped origin/main~1 && git_q push origin shipped
# Tags named like branches, on the first commit: a branch's facts are never read off its tag.
root=$(git rev-list --max-parents=0 HEAD) && for t in feat wip spike abandoned; do git tag "$t" "$root"; done
cd "$T" || exit 1
# Read-only: a stale stat on a tracked file must not get the worktree's index rewritten.
touch -t 200101010000 repo-landed/a.txt
index=$(git -C repo-landed rev-parse --path-format=absolute --git-path index)
before=$(cksum <"$index")

run "$T/gt.txt" "$T/repo"
rc=$?
sed 's/^/      | /' "$T/gt.txt"
check "healthy repo: exit 0, complete" green "$T/gt.txt" "$rc" "GROUND TRUTH: complete"
check "read-only: no index rewritten" [ "$(cksum <"$index")" = "$before" ]
check "unpushed commit on main: ahead" has "$T/gt.txt" "[main]: ahead 1 / behind 3 of origin/main"
check "worktree: unpushed commit and uncommitted file, never its tag's" \
  ends "$T/gt.txt" "[feat]: ahead 1 / behind 0 of the pushed branch, 3 patch(es) not in origin/main, 1 uncommitted"
check "worktree on a rebase-merged branch: merged, not LOCAL ONLY" \
  ends "$T/gt.txt" "[landed-wt]: merged into origin/main as rebased copies"
check "rebase-merged branch with no worktree: left out" lacks "$T/gt.txt" "    landed:"
check "pushed and merged branch with no worktree: left out" lacks "$T/gt.txt" "    shipped:"
check "pushed branch never merged: listed, never dropped" \
  line "$T/gt.txt" "    abandoned: pushed, 1 patch(es) not in origin/main"
check "branch on no remote: LOCAL ONLY" \
  line "$T/gt.txt" "    spike: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)"
check "pushed branch with no worktree: commits not pushed, never its tag's" \
  line "$T/gt.txt" "    wip: 1 commit(s) not pushed, 1 patch(es) not in origin/main"
check "worktree on a merged branch" ends "$T/gt.txt" "[done]: merged into origin/main"
check "tip pushed under another branch name: on it" line "$T/gt.txt" "    moved: on origin/other-name"
check "tip only on another remote" line "$T/gt.txt" "    forked: not on origin, only on fork/forked"
check "local remote: not a GitHub repo, not UNKNOWN" has "$T/gt.txt" "open PRs: not a GitHub repo (a local path)"
check "paths print as ~/, never the home path git spells" lacks "$T/gt.txt" ":/Users/"
# A repo path as PowerShell spells it, backslashes and all: the header reads as for the same path in forward slashes.
if command -v cygpath >/dev/null; then
  run "$T/gt-fwd.txt" --no-fetch "$(cygpath -m "$T/repo")"
  run "$T/gt-bs.txt" --no-fetch "$(cygpath -w "$T/repo")"
  check "a backslash path: the header a forward-slash path gets" \
    same "$(grep '^== ' "$T/gt-fwd.txt")" "$(grep '^== ' "$T/gt-bs.txt")"
else
  echo "SKIP  a backslash path: needs cygpath (Git for Windows)"
  skipped=$((skipped + 1))
fi

# No origin/HEAD: the default branch falls back to main. A deleted worktree folder is MISSING.
git -C repo remote set-head origin -d && rm -rf "$T/repo-done"
run "$T/gt-nohead.txt" --no-fetch "$T/repo"
check "no origin/HEAD: falls back to main" has "$T/gt-nohead.txt" "  origin/main: "
check "--no-fetch says so" has "$T/gt-nohead.txt" "(--no-fetch: compared with the last fetch)"
check "deleted worktree folder: MISSING" has "$T/gt-nohead.txt" "repo-done: MISSING"

# A --separate-git-dir checkout (a config repo can be one): git lists its main worktree as the git dir, where status
# cannot run. Given the checkout, its own line and count; given a linked worktree of it, UNKNOWN.
git_q init --bare "$T/sep-remote.git" && git_q init --separate-git-dir "$T/sep.git" "$T/sep"
(cd "$T/sep" && git symbolic-ref HEAD refs/heads/main && git_q commit --allow-empty -m first &&
  git remote add origin "$T/sep-remote.git" && git_q push origin main && echo x >dirty.txt &&
  git_q worktree add ../sep-wt -b side)
run "$T/gt-sep.txt" --no-fetch "$T/sep"
check "separate git dir: exit 0, the checkout's own line and count" \
  green "$T/gt-sep.txt" $? "/sep [main]: = origin/main, 1 uncommitted"
run "$T/gt-sepwt.txt" --no-fetch "$T/sep-wt"
check "a status that cannot run: UNKNOWN, never 0 uncommitted" \
  red "$T/gt-sepwt.txt" $? "uncommitted UNKNOWN (git status failed)"

# A remote with no branches yet: nothing is pushed, a fact. Push state the script cannot compare is UNKNOWN.
git_q init "$T/fresh" && git -C "$T/fresh" remote add origin "$T/remote.git"
run "$T/gt-fresh.txt" --no-fetch "$T/fresh"
check "remote with no branches: nothing pushed" green "$T/gt-fresh.txt" $? "'origin' has no branches yet: nothing is pushed"
git -C sep remote rename origin upstream
run "$T/gt-noorigin.txt" --no-fetch "$T/sep"
check "no origin but another remote" red "$T/gt-noorigin.txt" $? "UNKNOWN: no remote 'origin' (has: upstream"
git -C sep remote rename upstream origin && git_q -C sep push origin main:other &&
  git -C sep update-ref -d refs/remotes/origin/main
run "$T/gt-nodefault.txt" --no-fetch "$T/sep"
check "no origin/HEAD, main or master" red "$T/gt-nodefault.txt" $? "UNKNOWN: no origin/HEAD, main or master"

# Every failed probe is UNKNOWN with exit 2.
mkdir "$T/plain"
run "$T/gt-plain.txt" "$T/plain"
check "not a git checkout" red "$T/gt-plain.txt" $? "UNKNOWN: not a git checkout"
mkdir "$T/noconf" && cp "$GT" "$T/noconf/"
bash "$T/noconf/ground-truth.sh" >"$T/gt-noconf.txt" 2>&1
check "no repos given and no conf: never an empty complete" red "$T/gt-noconf.txt" $? "UNKNOWN: no repos given"
mkdir "$T/repo/sub"
run "$T/gt-sub.txt" --no-fetch "$T/repo/sub"
check "a folder inside a repo: not the parent's facts" red "$T/gt-sub.txt" $? "UNKNOWN: not a repo root"

git -C repo remote set-url origin "$T/nowhere.git"
run "$T/gt-dead.txt" "$T/repo"
check "dead remote" red "$T/gt-dead.txt" $? "UNKNOWN: git fetch origin failed"

# A fake ssh answers `ssh -G <host>`: the alias github-work resolves to github.com, as a Host entry in
# ~/.ssh/config would, and any other host stays itself.
mkdir "$T/bin"
printf '#!/usr/bin/env bash\nh=$2\n[ "$h" = github-work ] && h=github.com\necho "hostname $h"\n' >"$T/bin/ssh"
chmod +x "$T/bin/ssh"
for url in not-a-url "git@github-work:just-one-part" "https://github.com/a/b/c" \
  "git+ssh://git@github.com/o/r.git"; do
  git -C repo remote set-url origin "$url"
  PATH="$T/bin:$PATH" run "$T/gt-url.txt" --no-fetch "$T/repo"
  check "unreadable remote ($url)" red "$T/gt-url.txt" $? "UNKNOWN: cannot read the origin URL"
done

# gh missing, then gh failing. A fake gh records its -R argument, which checks how owner/repo is read.
git -C repo remote set-url origin "git@github-work:o/some-repo.git"
nogh=$(path_without_gh git awk sed grep tr cut wc date)
if [ -n "$nogh" ]; then
  PATH="$T/bin:$nogh" run "$T/gt-nogh.txt" --no-fetch "$T/repo"
  check "gh missing" red "$T/gt-nogh.txt" $? "UNKNOWN: gh is not installed"
else
  echo "SKIP  gh missing: gh shares a folder with a tool the script needs, so it cannot be hidden"
  skipped=$((skipped + 1))
fi

printf '#!/usr/bin/env bash\necho "fake gh: no network" >&2\nexit 1\n' >"$T/bin/gh"
chmod +x "$T/bin/gh"
PATH="$T/bin:$PATH" run "$T/gt-ghfail.txt" --no-fetch "$T/repo"
check "gh failing: UNKNOWN with gh's own message" \
  red "$T/gt-ghfail.txt" $? "UNKNOWN: gh pr list -R o/some-repo failed: fake gh: no network"

printf '#!/usr/bin/env bash\nexit 0\n' >"$T/bin/gh"
for pair in "git@github-work:o/r1.git|o/r1" "github-work:o/r2.git|o/r2" \
  "ssh://git@github.com/o/r3.git|o/r3" "https://github.com/o/r4|o/r4" "https://x@github.com:443/o/r5.git/|o/r5"; do
  git -C repo remote set-url origin "${pair%|*}"
  PATH="$T/bin:$PATH" run "$T/gt-gh.txt" --no-fetch "$T/repo"
  check "owner/repo from ${pair%|*}" has "$T/gt-gh.txt" "open PRs (${pair#*|}): none"
done
git -C repo remote set-url origin "https://gitlab.com/o/r.git"
PATH="$T/bin:$PATH" run "$T/gt-gl.txt" --no-fetch "$T/repo"
check "a non-GitHub host: a finding, named, not UNKNOWN" \
  green "$T/gt-gl.txt" $? "open PRs: not a GitHub repo (gitlab.com)"

# A probe git cannot answer: the blob that landed and its rebased copy share is gone, so git cherry fails (it
# reads blobs only when two patches touch the same paths) while ancestry still answers.
obj=$(git -C repo rev-parse landed:a.txt)
rm -f "repo/.git/objects/${obj:0:2}/${obj:2}"
PATH="$T/bin:$PATH" run "$T/gt-cherry.txt" --no-fetch "$T/repo"
rc=$?
check "git cherry cannot run: UNKNOWN" ends "$T/gt-cherry.txt" "[landed-wt]: UNKNOWN: git cherry or patch-id failed"
check "git cherry cannot run: the worktree and the branch both counted" \
  red "$T/gt-cherry.txt" "$rc" "GROUND TRUTH: INCOMPLETE, 2 probe(s) failed"

# Landing judged by patch and by content, in a repo of its own so the counts above stay put. Each branch's work
# reaches main as a copy: ws's differs only in whitespace and blank's is another empty commit (git cherry matches
# both, yet neither landed); rw's second commit has a verbatim twin only in history main and rw share, and its copy
# differs in whitespace; hb's empty commit has no copy and its other commit's content lands inside a larger commit;
# pb's, mb's and pf's copies are exact. pb's, pf's and dv's pushed copies hold commits their local tips lack; mb gets
# main merged in after landing.
cd "$T" || exit 1
git_q init --bare lr-remote.git
git_q clone "$T/lr-remote.git" lr && cd lr || exit 1
git symbolic-ref HEAD refs/heads/main
echo base >f.txt && git_q add f.txt && git_q commit -m base &&
  echo x >g.txt && git_q add g.txt && git_q commit -m g && echo y >>g.txt && git_q commit -am "g, a second line" &&
  git_q push origin main && git remote set-head origin main
git_q checkout -b ws && printf 'w\n' >w.txt && git_q add w.txt && git_q commit -m ws
git_q checkout -b blank main && git_q commit --allow-empty -m blank
git_q checkout -b rw main && git_q rm g.txt && git_q commit -m "g out" && echo x >g.txt && git_q add g.txt &&
  git_q commit -m "g back, one line"
git_q checkout -b hb main && git_q commit --allow-empty -m hb && echo h >h.txt && git_q add h.txt && git_q commit -m h
git_q checkout -b pb main && echo p >p.txt && git_q add p.txt && git_q commit -m pb &&
  echo q >q.txt && git_q add q.txt && git_q commit -m "pb, pushed only" && git_q push origin pb && git_q reset --hard HEAD~1
git_q checkout -b pf main && echo r >r.txt && git_q add r.txt && git_q commit -m pf && git_q push origin pf &&
  git_q reset --hard main
git_q checkout -b pq main && echo s >s.txt && git_q add s.txt && git_q commit -m pq && git_q cherry-pick origin/pf
git_q checkout -b dv main && echo e >e.txt && git_q add e.txt && git_q commit -m "dv, pushed only" &&
  git_q push origin dv && git_q reset --hard main && echo d >d.txt && git_q add d.txt && git_q commit -m dv
git_q checkout -b mb main && echo m >m.txt && git_q add m.txt && git_q commit -m mb
git_q checkout -b tmp main && printf 'w \n' >w.txt && git_q add w.txt && git_q commit -m "ws, a trailing space" &&
  git_q commit --allow-empty -m "not blank" && git_q cherry-pick pb mb origin/pf && git_q rm g.txt &&
  git_q commit -m "g out" && printf 'x \n' >g.txt && git_q add g.txt && git_q commit -m "g back, a trailing space" &&
  echo h >h.txt && echo k >k.txt && git_q add h.txt k.txt && git_q commit -m "h and k" && git_q push origin tmp:main &&
  git_q checkout main && git_q branch -D tmp
git_q worktree add ../lr-mb mb && git_q -C ../lr-mb merge --no-edit origin/main
cd "$T" || exit 1
run "$T/gt-lr.txt" --no-fetch "$T/lr"
rc=$?
sed 's/^/      | /' "$T/gt-lr.txt"
check "landing repo: exit 0, complete" green "$T/gt-lr.txt" "$rc" "GROUND TRUTH: complete"
check "copy differing only in whitespace: not landed" \
  line "$T/gt-lr.txt" "    ws: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)"
check "empty commit beside another empty commit: not landed" \
  line "$T/gt-lr.txt" "    blank: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)"
check "verbatim twin only in shared history: not landed" \
  line "$T/gt-lr.txt" "    rw: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)"
check "empty commit, the rest landed by content: not landed" \
  line "$T/gt-lr.txt" "    hb: LOCAL ONLY: on no remote at all (or squash-merged, then deleted)"
check "local tip landed, pushed copy not: listed" \
  line "$T/gt-lr.txt" "    pb: 1 commit(s) only on origin/pb, 1 patch(es) not in origin/main"
check "commits on both sides: both reported" line "$T/gt-lr.txt" \
  "    dv: 1 commit(s) not pushed, 1 patch(es) not in origin/main; 1 commit(s) only on origin/dv, 1 patch(es) not in origin/main"
check "local tip behind a landed pushed copy: left out" lacks "$T/gt-lr.txt" "    pf:"
check "main merged into a landed branch: merged, not LOCAL ONLY" \
  ends "$T/gt-lr.txt" "[mb]: merged into origin/main: nothing left to merge"

# A blob only patch comparisons read, gone: pf's pushed copy and its copy on main touch the same path, so git cherry
# reads it and fails, on pq after printing a line for pq's first commit. pb's, ws's, blank's and rw's tips pass git
# cherry but not the verbatim check, which reads every patch on main past them.
obj=$(git -C lr rev-parse origin/pf:r.txt) && rm -f "lr/.git/objects/${obj:0:2}/${obj:2}"
run "$T/gt-lr-gone.txt" --no-fetch "$T/lr"
rc=$?
check "pushed copy cannot be compared: UNKNOWN" line "$T/gt-lr-gone.txt" "    pf: UNKNOWN: git cherry or patch-id failed"
check "verbatim check cannot run: UNKNOWN" line "$T/gt-lr-gone.txt" "    pb: UNKNOWN: git cherry or patch-id failed"
check "git cherry failing partway: UNKNOWN" line "$T/gt-lr-gone.txt" "    pq: UNKNOWN: git cherry or patch-id failed"
check "every failed comparison counted" red "$T/gt-lr-gone.txt" "$rc" "GROUND TRUTH: INCOMPLETE, 6 probe(s) failed"

# The CI and review verdicts, in gh's own jq: `gh api` fetches something cheap and the program ignores it.
eval "$(sed -n "/^PR_JQ='/,/^.*\"'\$/p" "$GT")"
if [ -z "${PR_JQ:-}" ]; then
  check "PR_JQ read from the script" false
elif ! command -v gh >/dev/null || ! gh api rate_limit --jq .rate.limit >/dev/null 2>&1; then
  echo "SKIP  CI and review verdicts: need gh, signed in, and the network"
  skipped=$((skipped + 1))
else
  H=abc1234def5678abc1234def5678abc1234def56
  fixtures='[
    {number:1, title:"t", headRefName:"b", isDraft:false, headRefOid:"'$H'", body:"", statusCheckRollup:[]},
    {number:2, title:"t", headRefName:"b", isDraft:true, headRefOid:"'$H'", body:"x\r\nReview: Opus 5.5 high at `abc1234`\r\n",
     statusCheckRollup:[{status:"COMPLETED", conclusion:"SUCCESS"}, {state:"SUCCESS"}]},
    {number:3, title:"t", headRefName:"b", isDraft:false, headRefOid:"'$H'", body:"Review: a at 1111111\nReview: b at fff0000",
     statusCheckRollup:[{status:"COMPLETED", conclusion:"FAILURE"}, {status:"IN_PROGRESS", conclusion:null}]},
    {number:4, title:"t", headRefName:"b", isDraft:false, headRefOid:"'$H'", body:"**Clearing review:** CLEARED at `abc1234`",
     statusCheckRollup:[{status:"COMPLETED", conclusion:"STALE"}]},
    {number:5, title:"t", headRefName:"b", isDraft:false, headRefOid:"'$H'", body:"",
     statusCheckRollup:[{status:"COMPLETED", conclusion:"SUCCESS"}, {status:"IN_PROGRESS", conclusion:null}]},
    {number:6, title:"t", headRefName:"b", isDraft:false, headRefOid:"'$H'", body:"",
     statusCheckRollup:[{status:"COMPLETED", conclusion:"SKIPPED"}, {status:"COMPLETED", conclusion:"NEUTRAL"}]}
  ] | '
  gh api rate_limit --jq "$fixtures$PR_JQ" >"$T/verdicts.txt" 2>&1
  sed 's/^/      | /' "$T/verdicts.txt"
  check "empty rollup: no CI" has "$T/verdicts.txt" "#1 [b] no CI, no Review line: t"
  check "green rollup, CRLF body, Review at head: cleared" has "$T/verdicts.txt" "#2 [b] draft CI green, cleared at head: t"
  check "a failure beats running; last Review line wins: STALE" \
    has "$T/verdicts.txt" "#3 [b] CI RED, review STALE (review fff0000, head abc1234de): t"
  check "drifted form: no Review line; STALE is not green" has "$T/verdicts.txt" "#4 [b] CI running, no Review line: t"
  check "a check still running: not green" has "$T/verdicts.txt" "#5 [b] CI running, no Review line: t"
  check "every check skipped or neutral: not green" has "$T/verdicts.txt" "#6 [b] no check passed, no Review line: t"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) FAILED, $skipped skipped"
  exit 1
fi
echo "all checks passed, $skipped skipped"
