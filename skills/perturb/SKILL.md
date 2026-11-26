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
the browser's read-only tools, and tools that ask the owner, plan, search,
fetch a page or report progress; it refuses every other tool, Agent,
Workflow, PowerShell, MCP tools and session starters included. Of those,
it refuses, among others, writes to or removal of the owner's protected
config; pushes to the default branch, force pushes, `gh pr merge`, and
deleting remote branches outside `showcase/`; `git commit -F -`; and a
`git commit` or `git push` that follows any command in the same Bash call
but a plain `cd` to a folder that exists, joined to it by `&&`, `;` or a
newline. It scans every other
commit for private values, and before every other push the commits that
push would send, since git also makes commits that were never a
`git commit` here (a cherry-pick, `git am`, a merge). A refusal is not an obstacle to route around:
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
  the page; resize back to desktop after. Call the browser tools one at a
  time: the browser skill and the batch tool are refused, and so is
  scrolling, so read the page for what lies past the first screen.
  Clicks, typing, form input, page scripts and `preview_start` are
  refused: say what to click, and the owner tries it.
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
