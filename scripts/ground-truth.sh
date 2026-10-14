#!/usr/bin/env bash
#
# ground-truth.sh: what is true right now in these repos, read from git and GitHub.
#
# A handoff block is a claim written by a past session; this prints the facts it is checked against. /handoff
# runs it before writing the block, and the block's Ground truth line has the next session run it on the same
# repos and report contradictions first.
#
# license: MIT (adapted 2026-10-11 from github.com/truongfelix/workflow @6d2623c,
# template/.claude/skills/session-start/ground-truth.sh, (c) 2026 truongfelix; see LICENSE-workflow)
#
# Read-only apart from `git fetch --prune origin` (so "pushed" means pushed; --no-fetch skips it) and the merge
# results `git merge-tree` writes as loose objects no ref points to (gc prunes them). Exit 0 = every probe answered.
# Exit 2 = at least one probe failed: its line says UNKNOWN, never clean.
#
# Usage: bash ~/.claude/scripts/ground-truth.sh [--no-fetch] [repo ...]
#   With no repo given, the REPOS list in ground-truth.conf beside this script, if you keep one: bash assignments
#   only, for example REPOS=(~/thesis-code ~/analysis).
# Needs bash, git 2.38 or later, ssh, and for the open-PR lines the GitHub CLI (gh), signed in.

set -uo pipefail

FETCH=1
[ "${1:-}" = "--no-fetch" ] && { FETCH=0; shift; }
REPOS=()
if [ $# -gt 0 ]; then
  REPOS=("$@")
else
  # shellcheck source=/dev/null
  CONF="$(dirname "${BASH_SOURCE[0]}")/ground-truth.conf"
  [ -f "$CONF" ] && . "$CONF"
fi
REMOTE=origin
FAILED=0
unknown() { echo "  UNKNOWN: $*"; FAILED=$((FAILED + 1)); }

# A probe must not hang the session: GNU timeout (Git Bash and Linux ship it; Homebrew's coreutils installs it on
# macOS as gtimeout) ends it after 60 s, and a timeout is a failed probe. Where neither exists, probes run unlimited.
LIMITER=""
for t in timeout gtimeout; do command -v "$t" >/dev/null && { LIMITER=$t; break; }; done
limit() { if [ -n "$LIMITER" ]; then "$LIMITER" 60 "$@"; else "$@"; fi; }

# Paths print as ~/..., never C:/Users/<login>/...: blocks get saved into tracked handoff files. Compared with -ef
# (same directory), since git spells paths its own way; backslashes (a path pasted from PowerShell) read as slashes.
tilde() {
  local p=${1//\\//} suffix=""
  while :; do
    if [ "$p" -ef "$HOME" ]; then echo "~${suffix:+/$suffix}"; return; fi
    suffix="${p##*/}${suffix:+/$suffix}"
    p=${p%/*}
    case $p in */*) ;; *) break ;; esac
  done
  echo "$1"
}

# owner/repo from a remote URL. An SSH host is resolved with `ssh -G`, so an alias such as
# github-work (a Host entry in ~/.ssh/config) counts as github.com. Sets GH_REPO (empty when the host is not GitHub) and GH_HOST.
# Returns 1 when the URL cannot be read: the caller says UNKNOWN rather than skipping the repo.
RE_LOCAL='^(/|[A-Za-z]:[/\\]|\.|file://)'
RE_HTTPS='^https?://([^@/]+@)?([^/:]+)(:[0-9]+)?/(.*)$'
RE_SSH='^ssh://([^@/]+@)?([^/:]+)(:[0-9]+)?/(.*)$'
RE_SCP='^([^@/:]+@)?([^/:]+):(.*)$'
RE_OWNER_REPO='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
remote_github() { # <url>
  local url=$1 host path ssh=0
  GH_REPO="" GH_HOST=""
  if [[ $url =~ $RE_LOCAL ]]; then
    GH_HOST="a local path"
    return 0
  elif [[ $url =~ $RE_HTTPS ]]; then host=${BASH_REMATCH[2]} path=${BASH_REMATCH[4]}
  elif [[ $url =~ $RE_SSH ]]; then host=${BASH_REMATCH[2]} path=${BASH_REMATCH[4]} ssh=1
  elif [[ $url == *://* ]]; then return 1 # git://, git+ssh://: a scheme read as an scp host would skip the repo
  elif [[ $url =~ $RE_SCP ]]; then host=${BASH_REMATCH[2]} path=${BASH_REMATCH[3]} ssh=1
  else return 1
  fi
  if [ "$ssh" = 1 ]; then
    host=$(ssh -G "$host" 2>/dev/null | awk '$1 == "hostname" { print $2; exit }') || return 1
    [ -n "$host" ] || return 1
  fi
  GH_HOST=$host
  [ "$host" = github.com ] || return 0
  path=${path%/}
  path=${path%.git}
  [[ $path =~ $RE_OWNER_REPO ]] || return 1
  GH_REPO=$path
}

# Open PRs, one line each: a CI verdict (an empty rollup is "no CI"; green only when a check passed and every other
# passed, was skipped or was neutral, so STALE or anything unfinished is "running") and the clearing-review
# verdict (the last `Review: <who> at <sha>` line in the body against the PR head).
PR_JQ='
def verdict: [ .statusCheckRollup[]?
               | if (.status // "COMPLETED") != "COMPLETED" then "PENDING" else (.conclusion // .state // "PENDING") end ]
  | if length == 0 then "no CI"
    elif any(.[]; IN("FAILURE","CANCELLED","TIMED_OUT","ERROR","ACTION_REQUIRED","STARTUP_FAILURE")) then "CI RED"
    elif all(.[]; IN("NEUTRAL","SKIPPED")) then "no check passed"
    elif all(.[]; IN("SUCCESS","NEUTRAL","SKIPPED")) then "CI green"
    else "CI running" end;
def review: .headRefOid as $head
  | [ (.body // "") | splits("\r?\n") | capture("^[ \t]*Review: (?P<who>.+) at `?(?P<sha>[0-9a-f]{7,40})`?[ \t.]*$") ]
  | if length == 0 then "no Review line"
    else .[-1].sha as $sha
      | if ($head | startswith($sha)) then "cleared at head"
        else "review STALE (review \($sha[0:9]), head \($head[0:9]))" end end;
.[] | "    #\(.number) [\(.headRefName)]\(if .isDraft then " draft" else "" end) \(verdict), \(review): \(.title)"'

note=""
[ "$FETCH" = 0 ] && note=" (--no-fetch: compared with the last fetch)"
echo "GROUND TRUTH, $(date '+%Y-%m-%d %H:%M %Z')$note"
[ ${#REPOS[@]} -gt 0 ] || { echo; unknown "no repos given and none listed in ground-truth.conf"; }

# The + form: macOS's bash 3.2 calls an empty "${REPOS[@]}" unbound under set -u.
for repo in ${REPOS[@]+"${REPOS[@]}"}; do
  echo
  echo "== $(tilde "$repo")"
  top=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$top" ]; then
    unknown "not a git checkout"
    continue
  elif ! [ "$top" -ef "$repo" ]; then
    unknown "not a repo root: inside $(tilde "$top")"
    continue
  fi

  # The remote and its default branch. No remote at all is a finding, not a failure: nothing here is pushed.
  base="" def="" url_ok=0 GH_REPO="" GH_HOST=""
  if ! url=$(git -C "$repo" remote get-url "$REMOTE" 2>/dev/null); then
    if [ -z "$(git -C "$repo" remote)" ]; then
      echo "  no remote: nothing in this repo is pushed anywhere"
    else
      unknown "no remote '$REMOTE' (has: $(git -C "$repo" remote | tr '\n' ' ')): push state not compared"
    fi
  else
    if [ "$FETCH" = 1 ] && ! limit git -C "$repo" fetch --quiet --prune "$REMOTE" 2>/dev/null; then
      unknown "git fetch $REMOTE failed: everything below compares against a STALE $REMOTE"
    fi
    def=$(git -C "$repo" symbolic-ref -q --short "refs/remotes/$REMOTE/HEAD" 2>/dev/null)
    def=${def#"$REMOTE"/}
    for d in "$def" main master; do
      [ -n "$d" ] && git -C "$repo" rev-parse -q --verify "refs/remotes/$REMOTE/$d" >/dev/null && { def=$d; break; }
    done
    if [ -n "$def" ] && git -C "$repo" rev-parse -q --verify "refs/remotes/$REMOTE/$def" >/dev/null; then
      base="$REMOTE/$def" base_tree=$(git -C "$repo" rev-parse "$base^{tree}")
      echo "  $base: $(git -C "$repo" log -1 --format='%h %cd %s' --date=format:'%m-%d %H:%M' "$base")"
    elif [ -z "$(git -C "$repo" for-each-ref --count=1 "refs/remotes/$REMOTE")" ]; then
      echo "  '$REMOTE' has no branches yet: nothing is pushed"
    else
      unknown "no $REMOTE/HEAD, main or master: default branch unknown (git remote set-head $REMOTE --auto)"
    fi
    # The URL is never printed: an https remote can carry a token.
    if remote_github "$url"; then url_ok=1; else unknown "cannot read the $REMOTE URL as a local path or a host and owner/repo"; fi
  fi

  # Verbatim patch ids ("<id> <commit>") of the commits named on stdin: whitespace counts, and an empty commit has
  # none.
  pids() { git -C "$repo" diff-tree --stdin -p | git patch-id --verbatim; }

  # Whether a commit's work is in base. A rebase merge lands copies with new SHAs, so the
  # patches are compared by patch id (git cherry), not by ancestry alone. Fails when git cannot answer.
  landing() { # <commit>
    local cherry commits marks plus n tree
    if git -C "$repo" merge-base --is-ancestor "$1" "$base" 2>/dev/null; then echo "merged into $base"; return; fi
    cherry=$(git -C "$repo" cherry "$base" "$1" 2>/dev/null) || return 1
    # A line per commit of base..$1, merges aside: "+ <sha>" when no patch in $1..base matches it, else "- <sha>". A
    # sha is hex, so the marks count the commits.
    commits=${cherry//[-+] /} marks=${cherry//[^-+]/} plus=${cherry//[^+]/}
    n=${#plus}
    # git cherry's patch ids ignore whitespace, and any empty commit matches any other: a match stands only beside a
    # verbatim twin in $1..base. Those patch ids come first, so each of ours is checked as it arrives. The commits
    # reach awk through the environment: macOS awk refuses a newline in a -v value.
    if [ "$n" = 0 ]; then
      n=$({ git -C "$repo" rev-list "$1..$base"; printf '%s\n' "$commits"; } | pids |
        COMMITS=$commits awk -v n="${#marks}" 'BEGIN { split(ENVIRON["COMMITS"], c, "\n"); for (i in c) mine[c[i]] }
          $2 in mine { if ($1 in up) n--; next } { up[$1] } END { print n }') || return 1
    fi
    if [ "$n" = 0 ]; then
      echo "merged into $base as rebased copies"
    # Merging main into a landed branch moves the merge base past the landed copies, so no patch matches. When
    # merging the commit would leave base's tree as it is, nothing is left to land; an empty commit has no content
    # to check, so a commit with one behind it never lands this way.
    elif tree=$(git -C "$repo" merge-tree --write-tree "$base" "$1" 2>/dev/null) && [ "$tree" = "$base_tree" ] &&
      [ "$(pids <<<"$commits" | grep -c .)" = "${#marks}" ]; then
      echo "merged into $base: nothing left to merge"
    else
      echo "$n patch(es) not in $base"
    fi
  }

  # A commit neither landed nor on its own pushed branch: on another branch of the remote, on another remote, or
  # only on this disk?
  elsewhere() {
    local other
    other=$(git -C "$repo" for-each-ref --count=1 --contains "$1" --format='%(refname:short)' "refs/remotes/$REMOTE")
    if [ -n "$other" ]; then echo "on $other"; return; fi
    other=$(git -C "$repo" for-each-ref --count=1 --contains "$1" --format='%(refname:short)' refs/remotes)
    if [ -n "$other" ]; then echo "not on $REMOTE, only on $other"; return; fi
    echo "LOCAL ONLY: on no remote at all (or squash-merged, then deleted)"
  }

  # Every worktree: where it stands against the remote, and whether it holds uncommitted work.
  wt_line() {
    local path=$1 head=$2 branch=$3 state dirty label land
    if [ ! -d "$path" ]; then
      echo "    $(tilde "$path"): MISSING (git worktree prune?)"
      return
    fi
    # A status that cannot run is UNKNOWN, never "0 uncommitted". No optional locks: status must not rewrite the
    # index under a concurrent session, so the script stays read-only.
    dirty=$(git --no-optional-locks -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ') || dirty=""
    if [ -z "$head" ]; then
      state="no commit yet"
    elif [ -z "$base" ]; then
      state="not compared (no $REMOTE default branch)"
    elif [ -n "$branch" ] && [ "$branch" = "$def" ]; then
      state=$(git -C "$repo" rev-list --left-right --count "$head...$base" |
        awk -v b="$base" '{ if ($1==0 && $2==0) print "= " b; else printf "ahead %d / behind %d of %s\n", $1, $2, b }')
    elif ! land=$(landing "$head"); then
      state="UNKNOWN: git cherry or patch-id failed"
      FAILED=$((FAILED + 1))
    elif [ -n "$branch" ] && git -C "$repo" rev-parse -q --verify "refs/remotes/$REMOTE/$branch" >/dev/null; then
      state=$(git -C "$repo" rev-list --left-right --count "refs/heads/$branch...$REMOTE/$branch" |
        awk '{ if ($1==0 && $2==0) print "= pushed"; else printf "ahead %d / behind %d of the pushed branch\n", $1, $2 }')
      state="$state, $land"
    else
      case $land in merged*) state=$land ;; *) state=$(elsewhere "$head") ;; esac
    fi
    if [ -n "$branch" ]; then label="[$branch]"; else label="detached ${head:0:9}"; fi
    if [ -z "$dirty" ]; then
      state="$state, uncommitted UNKNOWN (git status failed)"
      FAILED=$((FAILED + 1))
    elif [ "$dirty" != 0 ]; then
      state="$state, $dirty uncommitted"
    fi
    echo "    $(tilde "$path") $label: $state"
  }
  # git lists a --separate-git-dir checkout's main worktree as its git dir (a config repo can be one). When we were given
  # that checkout, it is the main worktree; otherwise the path stays and its status fails as UNKNOWN.
  common=$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)
  gitdir=$(git -C "$repo" rev-parse --path-format=absolute --git-dir)
  echo "  worktrees:"
  wt_path="" wt_head="" wt_branch=""
  while IFS= read -r line; do
    case $line in
      "worktree "*)
        wt_path=${line#worktree } wt_head="" wt_branch=""
        [ "$wt_path" -ef "$common" ] && [ "$gitdir" -ef "$common" ] && wt_path=$top
        ;;
      "HEAD "*) wt_head=${line#HEAD } ;;
      "branch "*) wt_branch=${line#branch refs/heads/} ;;
      "") [ -n "$wt_path" ] && wt_line "$wt_path" "$wt_head" "$wt_branch"; wt_path="" ;;
    esac
  done < <(git -C "$repo" worktree list --porcelain; echo)

  # Branches no worktree has checked out: the work that is easiest to forget. Landed ones are left out.
  checked_out=" $(git -C "$repo" worktree list --porcelain | sed -n 's|^branch refs/heads/||p' | tr '\n' ' ') "
  others=""
  while IFS= read -r ref; do
    b=${ref#refs/heads/}
    [ -z "$b" ] && continue
    case $checked_out in *" $b "*) continue ;; esac
    land=""
    if [ -n "$base" ] && ! land=$(landing "$ref"); then
      s="UNKNOWN: git cherry or patch-id failed"
      FAILED=$((FAILED + 1))
    elif [ -n "$base" ] && git -C "$repo" rev-parse -q --verify "refs/remotes/$REMOTE/$b" >/dev/null; then
      ahead=$(git -C "$repo" rev-list --count "$REMOTE/$b..$ref")
      behind=$(git -C "$repo" rev-list --count "$ref..$REMOTE/$b")
      s=""
      [ "$ahead" != 0 ] && s="$ahead commit(s) not pushed, $land"
      # Commits only the pushed copy holds are judged on their own: the local tip landing says nothing of them.
      if [ "$behind" != 0 ] && ! pland=$(landing "$REMOTE/$b"); then
        s="UNKNOWN: git cherry or patch-id failed"
        FAILED=$((FAILED + 1))
      elif [ "$behind" != 0 ]; then
        case $pland in merged*) ;; *) s="${s:+$s; }$behind commit(s) only on $REMOTE/$b, $pland" ;; esac
      fi
      if [ -z "$s" ]; then
        case $land in merged*) continue ;; esac
        s="pushed, $land"
      fi
    else
      case $land in merged*) continue ;; esac
      s=$(elsewhere "$ref")
    fi
    others="$others    $b: $s"$'\n'
  done < <(git -C "$repo" for-each-ref --format='%(refname)' refs/heads)
  if [ -n "$others" ]; then
    echo "  branches with no worktree, not in ${base:-a remote}:"
    printf '%s' "$others"
  fi

  # Open PRs with their CI and review verdicts.
  if [ "$url_ok" = 0 ]; then
    : # no remote, or an unreadable URL already counted as UNKNOWN
  elif [ -z "$GH_REPO" ]; then
    echo "  open PRs: not a GitHub repo ($GH_HOST)"
  elif ! command -v gh >/dev/null; then
    unknown "gh is not installed: open PRs, CI and reviews not checked"
  elif ! prs=$(limit gh pr list -R "$GH_REPO" --state open --limit 30 \
    --json number,title,headRefName,headRefOid,isDraft,body,statusCheckRollup --jq "$PR_JQ" 2>&1); then
    unknown "gh pr list -R $GH_REPO failed: $prs"
  elif [ -z "$prs" ]; then
    echo "  open PRs ($GH_REPO): none"
  else
    echo "  open PRs ($GH_REPO):"
    printf '%s\n' "$prs"
  fi
done

echo
if [ "$FAILED" -gt 0 ]; then
  echo "GROUND TRUTH: INCOMPLETE, $FAILED probe(s) failed; read their sections as UNKNOWN"
  exit 2
fi
echo "GROUND TRUTH: complete"
