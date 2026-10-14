---
name: setup-config
description: Install this shared Claude Code config into ~/.claude. Walks the adopter through the required reading, interviews them, then writes their own charter, addendum, ledger and settings, and copies the skills and commands. Run from a clone of the config repo.
disable-model-invocation: true
argument-hint: "[update]"
---

# Setup: adopt this config

Arguments: $ARGUMENTS

You are installing a shared Claude Code config for a new adopter: anyone
who uses Claude Code for coding (the primer's examples come from
computational physics). This repo is the source: `PRIMER.md`,
`skills/`, `commands/`, `scripts/` and `templates/`. The install target is
`~/.claude` (`%USERPROFILE%\.claude` on Windows).

The adopter may be new to coding agents, or wary of sharing personal
details. Explain each choice in one or two plain sentences, say what it
changes, give a recommendation, and let them choose. Any question can be
skipped; a skipped item is left out, never guessed. Never use em dashes in
anything you write for them or into their files.

## Rules for the whole run

- Nothing is written into `~/.claude` before the adopter has seen it and said
  yes, in full setup and in `update` alike.
- Backups: before modifying any file (`LEDGER.md` and `settings.json`
  included), copy it to `~/.claude/setup-backups/<YYYY-MM-DD>/<its path
  relative to ~/.claude>`. If that date folder already exists, use
  `<YYYY-MM-DD>-2`, then `-3`. Never back up inside `skills/` or `commands/`:
  a copied skill folder would load as a second skill. Replacing a folder
  means: move the old folder to its backup path, then copy the new one in.
  Never delete anything.
- Do not change global git config, SSH config, or anything outside
  `~/.claude` without a separate yes.
- Nothing invented, and no FILL IN or template comment survives into the
  adopter's files.
- Private values stay out: when the adopter names something they keep out of
  tracked files, record the category, never the value.
- Copied files are copied unchanged. Read and write bytes, so line endings
  and encoding stay as they are.
- Drafts (step 8) and the temporary file for the private-value check (step
  10) go in the session's scratchpad or the OS temp folder, and are deleted
  once the files are written. These are the only writes outside `~/.claude`.
- Setup spawns no agents.

## 0. Look before asking

Without asking, find out and report in a few lines:
- the OS and shell;
- whether `~/.claude` exists and what it holds (`CLAUDE.md`,
  `settings.json`, `LEDGER.md`, and any names in `skills/`, `commands/` or
  `scripts/` that collide with this repo's);
- `git config --global user.name` and `user.email`;
- `git --version` (the ground-truth script needs 2.38 or later) and
  whether the GitHub CLI is installed and signed in (`gh auth status`);
- whether `~/.claude` is itself a git repo:
  `git -C ~/.claude rev-parse --show-prefix` succeeds and prints an empty
  line (a repo at a parent such as `~` does not count);
- this source folder's commit, `git rev-parse HEAD`, but only if
  `git rev-parse --show-prefix` in this folder succeeds and prints an empty
  line (otherwise, for example a zip unpacked inside another repo, record
  "no git").

### `update` mode

Skip the reading and the interview.

1. Read `~/.claude/setup-source.md` for the commit that was installed (or, if
   the source had no git, the baseline copy under
   `~/.claude/setup-backups/baseline/`).
2. Find upstream changes and local edits:
   - With git: upstream changes are `git diff <sha> HEAD -- skills commands
     scripts templates`; local edits are what is installed against the
     installed-from version (`git show <sha>:<path>`).
   - Without git: upstream changes are the baseline against the current
     source; local edits are what is installed against the baseline.
3. Sort every path into one group:
   - **add:** new upstream and absent locally (present locally: conflict);
   - **replace:** changed upstream, not edited locally; per file, back up the
     installed file, then overwrite it;
   - **conflict:** changed both upstream and locally; show both changes and
     let the adopter decide;
   - **local only:** edited locally, unchanged upstream; left alone, and
     listed so the adopter knows;
   - **keep:** the adopter declines a replace; offer to add the path to the
     addendum's "Kept local" list, with a yes;
   - **remove:** gone upstream; with a yes, move it to the backup path (a
     whole skill folder moves as one).

   `*-examples.md` files never enter replace or remove: the adopter's
   `/reflect` curates them, so report upstream changes only (a new one is an
   add). Paths under "Kept local" are skipped. `skills/build`,
   `commands/handoff.md` and `scripts/` move together: `/build`'s Stop hook
   and `/handoff` run those scripts, so never install either at a version
   whose scripts are missing or kept at an older version. Changes in
   `templates/` are reported, never applied: the charter and addendum
   belong to the adopter now. Two exceptions are offered, each with a yes:
   a new settings hook, merged as in step 8.5, and an `## Escapes` section
   with its text from step 8.4, appended to an existing `COSTS.md` that
   lacks one (`/reflect` logs escapes there).
4. Show the groups, ask for a yes per group, back up, write, and update
   `setup-source.md`. With git, record the new commit. Without git, refresh
   the baseline: move `setup-backups/baseline/` into this run's backup
   folder, then copy the current source's `skills/`, `commands/`,
   `scripts/` and `templates/` in its place. Otherwise the next update
   misreads accepted changes as conflicts. Run the step 10 checks that
   apply, and stop.

## 1. Orientation

Ask one question first: "How much have you used coding agents? New, some,
or daily?" It sets the depth of everything after: for "new", plainer words,
smaller steps, an example with each idea; for "daily", terse.

Then say, briefly:
- **What happens:** a short required reading, then four rounds of
  questions; then you see every file before anything is written into
  `~/.claude`. Anything replaced is backed up first.
- **Privacy:** "What you tell this setup is written only into files in
  `~/.claude` on this computer, and this setup sends it nowhere else. Like
  everything you type into Claude Code, this conversation is itself sent to
  Anthropic to be processed; Claude Code's data-usage page
  (code.claude.com/docs/en/data-usage) says how that data is handled. While
  setup runs, drafts sit in a temporary folder and are deleted once the
  files are written. Skip any question you would rather not answer."
- **Undo:** everything installed is listed in `~/.claude/setup-source.md`.
  Anything setup replaced is in `~/.claude/setup-backups/<date>/`; restore it
  from there. On a fresh install nothing was replaced, so undoing means
  removing the listed paths. (`setup-backups/baseline/`, if present, is a
  reference copy for updates, not your backup.)

## 2. Required reading: PRIMER.md

This is homework, and setup does not skip it. Walk the adopter through
`PRIMER.md`, at the depth step 1 set:

- **The plain version**, for everyone.
- **The physics version**, offered: "If you've met the particle in a box,
  this is the reason behind the plain version." Skip it on a no.
- **Caching**, for everyone, because it decides what a session costs. Make
  sure these land: on a Claude subscription such as Pro, within the plan's
  included usage, the main conversation keeps a one-hour cache; once the
  plan draws on extra-usage credits it drops to five minutes, unless
  `promptCacheTtl` pins it (Round 4 asks); subagents get five minutes by
  default; `/usage` shows a "Prompt cache (main)" line with
  the hit ratio, whether the cache is warm, and the likely cause of the last
  miss.
- **`/handoff` before a long break.** Say it plainly: a fresh session from a
  `/handoff` block is cheap, and coming back to a large session after the
  cache has gone cold is not. If they would rather keep a session, `/compact`
  before leaving, while the cache is warm.

Ask them to read the file themselves too, and ask whether anything is
unclear before going on.

## 3. Round 1: how to refer to you

Ask in one batch, all optional except the first:

1. "How should I refer to you? A codename is fine." It goes into your
   charter; the skills themselves call you "the owner".
2. Your role and field, and what you build (for example: "second-year PhD,
   condensed matter, Python and NumPy simulations on a cluster").
3. Languages and tools, and your experience with git, tests, pull requests
   and CI.
4. What Claude should defer to you on: the physics, the choice of numerical
   method, what counts as a correct result, anything else.
5. How you like Claude's prose (terse, explained, anything to avoid).
6. Anything you never want in a tracked file (a full name you keep private,
   this computer's login name, a personal email). Only the category is
   recorded, in the third person ("<name>'s private full name"). If you want setup
   to check that none of these values ended up in your files, give each value
   once; it is used only for that check, from a temporary file deleted right
   after.

Round 1 answers are facts, not rulings: items 1 to 5 go into the charter,
item 6 into the addendum, and none into the ledger.

## 4. Round 2: habits Claude will hold you to

The charter's practice floor is the list of habits Claude holds you to in
every repo. List the nine with the reason for each, then ask for the numbers
to adopt. Items not chosen are deliberate declines; say so.

1. **Tests green before any commit:** every commit is a known-good point to
   return to.
2. **Minimal CI:** the tests run on every push even when you forget to.
3. **Honest verification:** a test file or badge that never runs is worse
   than none, because it claims a check that does not happen.
4. **Commit subjects at most 72 characters, the reasoning in the body:** the
   history stays scannable and the why survives.
5. **Code lands by pull request and green CI:** a review point before code
   reaches main.
6. **Rulings verbatim, a lab notebook for decisions.** Two payoffs.
   Provenance: months later you, an advisor or a coauthor can see what was
   decided, when and why, in your own words rather than Claude's paraphrase.
   Calibration: the ledger becomes worked examples of how you decide; the
   skills read a project's ledger before working there, and at each review
   the rulings that keep recurring move into your charter, so it is written
   from your actual decisions. Adopting this creates `~/.claude/LEDGER.md`
   for rulings about how you work; each project keeps its own ledger too.
7. **Nothing invented:** every number, citation and date has a source or is
   marked as a placeholder. For research code this is the floor under the
   floor.
8. **The SOP:** spec, critique, plan, an executing critique that builds the
   plan in a scratch copy, build, simplify, and a final clearing review by a
   fresh context that wrote none of the code, then a draft pull request. A
   self-review can inform the work; only the clearing review clears it for
   merge, and any later commit voids it.
9. **Test thickness by mutation testing** (mutmut for Python): a surviving
   mutant means dead code or a missing test, and the spec decides which, so
   the spec is written and hardened before the code. Needs a scheduled
   mutation run you set up per project. Advanced.

Say plainly: the skills themselves keep a decision record in each project and
write short-subject commits whatever is chosen here; the floor decides what
Claude holds you to.

Ask whether their code is on GitHub yet. Recommendation by experience: new
to git and testing, take 1, 3, 4, 6 and 7, and add 2 and 5 once your code
lives on GitHub (if it is not there yet, the addendum's "Deferred floor
items" line records that, so the term review picks it up); comfortable with git, tests
and pull requests, take 1 to 7; building software other people rely on, take
all nine.

In the same round, ask (optional) for strengths: practices you already do
well that coaching should leave alone.

## 5. Round 3: optional modes and modifiers

Ask: "Which of these optional modes and modifiers would you like on?" Explain
each first. Any combination is valid.

- **Coaching notes:** when one of your process choices has a gap, Claude says
  so in at most three sentences (the gap, why it bites, the stronger move),
  without stopping the work, at most about three per session. Recommended
  for students.
- **Pro-move gate:** Claude may pause before a request and suggest a better
  way to ask, showing the rewritten request: "Run as rewritten, or as-is?"
  You can always say "as-is"; "deadline" turns it off for the session.
- **Cost gate** (recommended on): before any step that spawns agents (an
  executing critique, a clearing review, `/build`, a repeated pass), Claude
  says how many agents and what similar steps cost before, and asks: run,
  lighter, or skip. Agent steps cost far more than ordinary turns, because
  each agent starts cold. Costs are logged in `~/.claude/COSTS.md`. A skip
  needs your acknowledgement, recorded where the check would have been (a
  skipped clearing review leaves the pull request marked uncleared), and a
  repeated skip draws a coaching note.
- **`/build` and the executing critique** are installed for everyone; there
  is nothing to switch on. They suit anyone who plans carefully before
  building, whether that took an hour or a week at a whiteboard. Explain
  them briefly here.
- **`/build overnight`:** walk through the README section "How `/build
  overnight` works" before they choose, at the depth step 1 set, and point
  out that the section stays there to reread. Recommendation: leave it off
  until you have run at least one attended `/build` end to end. To turn it on
  later, change the addendum's "`/build overnight` enabled" line to yes.

Ask about each mode as its own question, so each answer can be quoted on its
own in the ledger.

In the same round, ask for up to three focus threads: habits you want to
build right now (for example, "every numerical routine gets a test against
an analytic solution"). None is fine.

## 6. Round 4: settings and identity

Explain each, then ask:

- **Git identity.** Report what step 0 found, or that it is unset. Ask for
  the name and email commits should carry. Commits are visible to anyone who
  can see the repo, so suggest GitHub's private noreply address (GitHub
  shows it under Settings, Emails). If the chosen name or email contains any
  word of a private value given in Round 1, say so (without repeating the
  value) before accepting it. With a separate yes, run
  `git config --global user.name`, `user.email` and `user.useConfigOnly true`;
  `/handoff` stops landing when the identity does not match the addendum.
- **GitHub accounts.** One on this machine, or more? If more, which identity
  does each commit as?
- **Transcript retention (`cleanupPeriodDays`).** Claude Code deletes local
  session data, transcripts included, older than this many days; the default
  is 30. Transcripts are the record of what was decided and why, and the
  ledger quotes them word for word, so once one is deleted the exact words
  are gone. Choose a number of days.
- **Cache window (`promptCacheTtl`).** On Pro, within included usage, the
  main conversation already gets one hour. Once you draw on extra-usage
  credits it drops to five minutes; setting `1h` keeps the hour there, at
  twice the cache-write price. With an API key the default is five minutes,
  and `1h` pays off if you often step away for 5 to 60 minutes. Choices:
  leave it out (the default), `1h`, or `5m`. The setting needs Claude Code
  v2.1.242 or later (`claude --version`); older versions ignore it silently.
- **Resume check (a settings hook).** When a session is compacted or
  resumed, Claude's memory of it is a summary, and a summary can be wrong
  about what was pushed or merged. With this on, Claude is told at that
  moment to run the ground-truth script on the repos the session touched and
  report where it contradicts what it remembers. It costs one short script
  run per resume. Recommended: on.
- **GitHub CLI.** Report what step 0 found. `/handoff`'s ground-truth check
  and `/build`'s close-out read pull requests through `gh`; without it,
  signed in, their PR lines read UNKNOWN (honest, but less useful).
  Installing it is a separate task outside `~/.claude`; offer the link
  (cli.github.com) and change nothing.
- **Commit trailer.** Should commits Claude makes carry a "Co-Authored-By:
  Claude" line? Default: no, and a repo can opt in in its own CLAUDE.md.
- **Versioned config.** Should `~/.claude` itself be a git repo, so your
  config has history? Record the current state, not the wish: wanted but not
  yet set up is "no". If wanted, say what that separate task starts with: a
  whitelist `.gitignore` that ignores everything (`/*`) and un-ignores only
  the hand-written files (`CLAUDE.md`, `PERSONAL-ADDENDUM.md`, `LEDGER.md`,
  `COSTS.md`, `settings.json`, `skills/`, `commands/`, `scripts/`). Why:
  `~/.claude` also holds transcripts (`projects/`), session state and
  possibly credentials, and a whitelist is what keeps them out of history
  for good.
- **Auto mode: advanced.** Say it plainly: "Only if you already use auto
  permission mode; otherwise skip this." If they use it, ask for the GitHub
  account or organization and a one-line primary use, so routine pushes to
  their own repos are not blocked.

## 7. Decisions before drafting

Ask these in one batch, so every draft shown in step 9 is final:

- If `~/.claude/CLAUDE.md` exists: fold its content verbatim into a section
  of their choosing in the new charter or addendum, or leave it only in the
  backup.
- For each settings key this setup would set that already exists with a
  different value: show old against new; the adopter picks.
- For each collision in `skills/`, `commands/` or `scripts/`: replace (after
  a backup) or keep theirs. `skills/build`, `commands/handoff.md` and
  `scripts/` are replaced or kept together (see `update` mode). A kept one
  goes on the addendum's "Kept local" list. For a kept skill or command,
  name what in the charter, addendum or other skills refers to it, and
  adjust or drop those lines in the drafts (for example, its line under
  User-only skills).

If none of these applies, say so and go on.

## 8. Draft

Build everything in the scratch location first (see the rules):

1. **Charter** from `templates/charter.template.md`: fill each FILL IN. Keep
   only the adopted floor items, with their original numbers (for example
   1, 3, 4, 6, 7); never renumber, because the skills cite items by number.
   In Working protocol, drop the Coaching note, Pro-move gate or Cost gate
   bullet for any that are off; if the pro-move gate is off, also drop the
   cost gate's last sentence. Always keep the Unattended-runs bullet, naming
   only the gates that are on: it does nothing while overnight is off, and
   `/build` needs it once overnight is turned on. The /handoff,
   Delegated-work and focus-thread bullets always stay. Drop Review cadence
   clauses for gates that are off. Write Strengths in the third person, or
   drop the section if none were named. Drop Rulings if item 6 was declined.
   Apply the fold from step 7. Remove every template comment.
2. **Addendum** from `templates/addendum.template.md`: the identity (one
   line per account if they differ), the private categories, the trailer,
   the config-repo state (when no, drop its sentence about committing
   appends), the cost gate (on or off), overnight (yes or no;
   when yes, drop the sentence about turning it on), the deferred floor
   items (or drop that line), Kept local (one bullet per path relative to
   `~/.claude`, or "none"), the focus threads (drop the section if none),
   and the working-habits section with the Windows block only on Windows and
   the accounts line only for more than one account (drop the section if
   nothing is left). A FILL IN's parenthesised options are replaced by the
   answer, not kept; plain sentences after it stay. Remove every template
   comment.
3. **Ledger**, only if item 6 was adopted. If `~/.claude/LEDGER.md` exists,
   append a new section with the next L-number and never rewrite what is
   there. Otherwise create it with this header, then the section:

   ```
   # Ledger

   Append-only. Each ruling is quoted verbatim from the session transcript;
   Claude's context sits on a separate line labeled `Context (Claude):`. A
   wrong entry is corrected by a new entry, never edited away.
   ```

   The section is `## <YYYY-MM-DD>: setup`, then one entry per ruling, in
   this order: floor items, strengths, each mode (coaching notes, pro-move
   gate, cost gate, overnight), focus threads, permission to set global git
   config, retention, cache window, resume check, trailer, versioned config,
   auto mode, and each step 7 decision. Form:
   `Ln. <topic>: "<verbatim reply>"`, then `Context (Claude): <the option text the reply selected, marked
   Claude-drafted, or "free answer">`. Facts are not rulings and are never
   quoted: Round 1 answers, the identity, the number of accounts, the plan
   type, and any private value.
4. **Costs log**, only if the cost gate is on: `~/.claude/COSTS.md` with the
   header "# Agent costs", then "One line per agent run: date, step, model,
   tokens. The cost gate reads this file; the term review sets it beside the
   findings each step caught and the escapes below. Each critique, simplify
   and review entry names the commit it read; an executing-critique entry
   also logs tasks executed out of total. New agent lines go above the
   Escapes section.", then a section "## Escapes" with "A defect found after
   a step passed work whose contract covered it, present at the commit that
   step read. One line each: date found; the defect; who or what found it;
   the step, by its log date above; a miss (in contract) or a contract gap
   (fix the skill, add a worked example). The skill text decides."
5. **Settings** from `templates/settings.template.json`, merged into any
   existing `~/.claude/settings.json` per step 7. Write `cleanupPeriodDays` as
   a number; `promptCacheTtl` only if they chose one; `attribution` with
   empty strings only if the trailer is off; `hooks` (the resume check) only
   if they chose it, appended to any `SessionStart` hooks already there,
   never replacing one; `autoMode` only if they use auto mode. To fill an
   `autoMode` line, delete the `FILL IN:` marker or the `FILL IN (...)` text and substitute `<account>`, `<name>` and `<email>`.
6. **Copy plan:** all of `skills/*` into `~/.claude/skills/`, `commands/*`
   into `~/.claude/commands/` and `scripts/*` into `~/.claude/scripts/`,
   minus the kept collisions.
7. **Source record:** `~/.claude/setup-source.md` with the date, this
   source's commit (or "no git"), and every installed path. Without git,
   also copy this source's `skills/`, `commands/`, `scripts/` and
   `templates/` to `~/.claude/setup-backups/baseline/` for `update` to compare against; it
   is raw source, so it holds template markers, and it is not the adopter's
   backup.

## 9. Show, then write

Show the charter and addendum in full, the ledger section, the costs log
header, the settings change as a diff, the copy list, `setup-source.md`,
and (without git) the baseline copy. Ask for one final yes, then write, and
delete the drafts.

If writing the `autoMode` lines is refused, show the exact lines and ask the
adopter to paste them into `settings.json` themselves.

## 10. Verify, with evidence

Run each and report the command and its result. In Git Bash `~` follows
`HOME`, and Python's `expanduser` follows `USERPROFILE` on Windows; if they
differ, use the explicit path. PowerShell forms are given for Windows. For
the "nothing found" checks, `grep` exits 1 when it finds nothing: here that
is the pass, so say so to the adopter.

- **Settings parse as JSON:**
  `python -c "import json,os; json.load(open(os.path.expanduser('~/.claude/settings.json'), encoding='utf-8'))"`,
  or `Get-Content "$env:USERPROFILE\.claude\settings.json" -Raw | ConvertFrom-Json | Out-Null`.
- **No template residue** in the written files (`CLAUDE.md`,
  `PERSONAL-ADDENDUM.md`, and `LEDGER.md`, `COSTS.md` if created, and
  `settings.json`): `grep -n -e "FILL IN" -e "<!--" <files>`, or
  `Select-String -Path <files> -Pattern 'FILL IN','<!--'`; nothing found.
- **No em dashes** in the written files: `grep -n $'\xe2\x80\x94' <files>`, or
  `Select-String -Path <files> -Pattern ([string][char]0x2014)`; nothing found.
- **No private values**, if the adopter gave any: write each value, and each
  word of a multi-word value, one per line to a temporary file; run
  `grep -rliF -f <tmpfile> <written files> ~/.claude/skills ~/.claude/commands ~/.claude/scripts`,
  or `Get-ChildItem -Recurse -File <written files>,"$env:USERPROFILE\.claude\skills","$env:USERPROFILE\.claude\commands","$env:USERPROFILE\.claude\scripts" | Select-String -SimpleMatch -Pattern (Get-Content <tmpfile>) -List`;
  delete the temporary file; report only the file names that matched, or
  "not found", never the values.
- **Only skills under `skills/`:**
  `for d in ~/.claude/skills/*/; do test -f "$d/SKILL.md" || echo "no SKILL.md: $d"; done`,
  or `Get-ChildItem -Directory "$env:USERPROFILE\.claude\skills" | Where-Object { -not (Test-Path "$($_.FullName)\SKILL.md") }`;
  no top-level folder lacks one, and none is a backup.
- **Line counts:** `wc -l ~/.claude/CLAUDE.md ~/.claude/PERSONAL-ADDENDUM.md`,
  or `(Get-Content <file>).Count`; charter under about 120, addendum under
  about 50.
- **Source record:** every path listed in `~/.claude/setup-source.md`
  exists, for example
  `grep '^- [a-zA-Z]' ~/.claude/setup-source.md | cut -c3- | while read p; do test -e ~/.claude/"$p" || echo "missing: $p"; done`;
  nothing missing.
- **The scripts work on this machine:** `bash ~/.claude/scripts/ground-truth.test.sh`
  and `bash ~/.claude/scripts/build-stop-gate.test.sh` (in Git Bash on
  Windows). Run them in the background: on Windows they take several
  minutes. Each must exit 0 and end "all checks passed, N skipped"; a skip
  names its reason (for example, `gh` not signed in) and is not a failure.
  Report any FAIL line to the adopter as it is: until it is fixed,
  `/handoff`'s ground truth and `/build`'s close-out gate are not to be
  trusted on this machine.

A running session does not reload skills. Ask the adopter to open a new
session and check that the skills appear.

## 11. Close

Tell the adopter, briefly:

- **Where to start:** spec-first fires on its own before new code; `/reflect`
  captures what a session learned; `/handoff` closes a session out.
- **Before a long break, `/handoff`.** Then start the next session from its
  block; its Ground truth line has that session check the block against git
  and GitHub first. Charter edits also take effect only in a new session.
- **Each project needs a short contract** in its CLAUDE.md before `/handoff`
  and `/build` can run there; the README's "Per-repo contract" lists what it
  names.
- **The review cadence** in the charter: each term, drop what nobody uses.
- **Updating:** pull this repo, open it, and run `/setup-config update`. To
  change a habit or mode, edit the charter or addendum directly, or run full
  setup again (an existing ledger is appended to, never rewritten).
- **Undo:** remove the paths listed in `~/.claude/setup-source.md`, and
  restore anything setup replaced from `~/.claude/setup-backups/<date>/`.
- **Optional extras** this setup does not install:
  - **Transcript copies.** Claude Code's cleanup deletes old transcripts. To
    keep them, copy `~/.claude/projects` somewhere now and then with a
    copy-only command, never one that mirrors or deletes. The desktop app
    can run that on a schedule; offer to set one up, and create nothing
    without a yes.
  - **The skill-creator plugin**, for writing your own skills.
