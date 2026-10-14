---
disable-model-invocation: true
description: End-of-session ship. Reflect, verify, commit in the charter's commit form, land through the repo's gate, then emit a copy-paste handoff block.
argument-hint: "[optional next-task hint, 'skip ship', or 'human']"
---

You are closing out a session. Run the whole tail in order: reflect, verify, land,
handoff. Optional hint: $ARGUMENTS

Never invent work, rulings, or findings. If the session is not done (verify red, a PR
open and unmerged), say so and stop rather than ship a half-pass.

## 0. Read the repo's contract

Read the repo's `CLAUDE.md`. It must supply: the verify command (or the statement that
none exists), the landing rule (PR gate, direct-to-main for ruled docs, or other),
the merge method, the living plan file, and the archival spec file (or the statement
that there is none). A commit-trailer choice is needed only where the repo differs
from the addendum. If any is missing, ask; do not guess.

## 1. Reflect

Run the /reflect routing on this session and apply the findings now (end of session,
so no confirmation round). Skip if nothing was learned, and say so.

## 2. Verify

Run the repo's verify command, including any platform-specific steps its `CLAUDE.md`
documents for this machine. Red means stop and report. If the repo defines none,
say "no verification exists for this repo" and do not imply otherwise. Before any
push, confirm no secrets or third-party personal data are in the change; if unsure,
stop and ask.

## 3. Land

1. Branch if the landing rule requires it.
2. Check `git config user.name` and `git config user.email` against the identity
   the addendum names. Any other identity: stop.
3. Commit in the charter's commit form (floor item 4): subject 72 chars or less,
   dense narrative body with the why. Trailer per the addendum's Commit trailer
   line, unless the repo's `CLAUDE.md` says otherwise.
4. Push via the repo's remote as configured.
5. Before any merge, check the clearing review: the PR body's
   `Review: <reviewer> at <sha>` line must name the PR's head commit. Run the
   ground-truth script on the repo (section 4); it prints the verdict per open
   PR: `cleared at head`, `review STALE` or `no Review line`. Where it cannot
   (no GitHub, or an UNKNOWN line), compare by hand: `gh pr view --json
   headRefOid,body`, or without GitHub, `git rev-parse HEAD`.
   Missing or stale: stop and ask for a fresh clearing review by a context that
   wrote none of the diff (the cost gate applies). A skipped review stays
   marked uncleared in the PR body, and merging it anyway is the owner's
   explicit call, quoted there.
6. Follow the landing rule exactly: open the PR, watch checks to green, merge by the
   named method, sync main. Never merge before checks report. Where the rule allows
   direct landing for ruled spec/docs commits, use it only for those.
7. Do any cleanup the repo's `CLAUDE.md` attaches to the handoff (for example pruning
   merged local branches), and use its documented recoveries for known landing failures.
8. If the change is user-visible and there is a deploy, confirm it picked the change up.
9. Config sync, only if the addendum says `~/.claude` is a git repo and
   `git -C ~/.claude rev-parse --show-prefix` succeeds and prints an empty line
   (so the repo's top level is `~/.claude` itself, not a parent such as `~`): if
   `git -C ~/.claude status --porcelain` shows changes to tracked files, show
   them, stage only those (`git -C ~/.claude add -u`), commit in the charter's
   commit form (identity check as above), and push to `main` if a remote exists.
   Never add an untracked path without the owner's yes. Why: `~/.claude` also
   holds transcripts (`projects/`), session state and possibly credentials, so a
   whitelist `.gitignore` (ignore everything, then un-ignore only the
   hand-written files) is what keeps them out of history for good.

If the hint says "skip ship", stop after committing and report branch state.

## 4. Emit the handoff (chat, copy-paste, no preamble)

The block is a claim; git and GitHub are the facts. Before writing it, run
`bash ~/.claude/scripts/ground-truth.sh <repo> ...` on every repo this session
touched, and write the header and State from its output, never from memory: a
branch is pushed or merged only where the script says so. Exit 2 means a probe
failed: name the UNKNOWN section in State rather than claim it clean. Anything
it shows on this disk only (LOCAL ONLY, uncommitted, commits not pushed) that
this session touched is landed now or named in State with its path.

This block is for the next agent, not the owner. It is a fenced block of dense prose
paragraphs, each opening with its label, addressed to the reader as "you" (never "the
owner's word" as if reporting to them). Do not re-summarize the conversation, and do
not use bullet lists or section headings inside the block. Canonical form: six
labelled paragraphs after a three-line header.

    Repo: <name>, <branch> @ <short sha> (pushed and merged)
    Commits: <identity>. Production: <url, if any>
    Ground truth: run `bash ~/.claude/scripts/ground-truth.sh <repo paths>` first;
    report where it contradicts this block before anything else.
    Read first: <files in order, with what each is for; name the newest
    amendment or ruling number; say which file wins where they differ>
    State: <what shipped this session, with concrete counts (items, tests
    added, suites and totals green); the ruling made this session, by
    number, and why; what production or the deliverable now shows, and any
    flags still in force>
    Your task: <the next piece of work, imperative, from the hint or the
    plan's order, with sizing (for example changes per PR), what to draft for
    owner review before it ships, and the constraint that makes it legitimate>
    Awaiting owner word: <each hold or judgment call, as a concrete question,
    that you must not build on until ruled>
    Verify: <the verify command with its parts, platform quirks, and the
    landing recipe compressed to one sentence>
    Watch-items: <standing conventions that bite, semicolon separated: no
    invented data, rulings quoted verbatim, repo-specific ones from
    `CLAUDE.md`>

Rules: numbers are real (counted from the run, not remembered) or omitted; every
ruling is named by its amendment or ledger number; the task states what not to
invent; where the repo has no verify command, the Verify paragraph says so. For a
session that spans several repos, the header lists each repo and its commit, the
Ground truth line names every repo path (as `~/...`), and the paragraphs stay singular.

## 5. Human handoff (opt-in: only when the hint says "human")

The reader is the owner at a later time, or a successor; not an agent. This is a
saved file, not chat. Chat is not durable.

1. Read the repo's `CLAUDE.md` "Human handoff" field. It names the path and
   the landing rule. If the field is missing, ask; never write into a repo
   not cleared to hold the content.
2. Build it from the same reflect pass (step 1) and this session's ledger
   deltas. Content: what was decided and why, the alternatives declined and
   why (declines are kept), what is open, what to check next.
3. Register: role language, plain prose, no agent jargon (no "you" addressed
   to an agent, no repo mechanics), no third-party personal data. Every fact sourced or marked as a placeholder.
4. Show the draft before saving if the destination is a shared or public repo;
   otherwise save, then land it by the repo's own landing rule and report the
   path.
5. It supplements step 4's agent block; it does not replace it.
