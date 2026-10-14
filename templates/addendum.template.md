<!-- TEMPLATE. /setup-config writes the adopter's copy to
~/.claude/PERSONAL-ADDENDUM.md, filling each FILL IN, keeping only the blocks
that apply, and removing every template comment. It loads in every session,
so it stays under about 50 lines. -->

# Personal addendum to the charter (always loaded; keep it short)

Changing facts live here so the charter stays short.

## Identity
- Git identity: FILL IN `Full Name <email>` (one line per GitHub account if
  they differ). Check `git config user.name` before committing.
- Tracked files never carry FILL IN (the category, never the value: for
  example "a full name I keep private" or "this computer's login name"); no
  email but the commit identity's, and no one else's email. Use `~` or
  repo-relative paths, never absolute ones.
- Commit trailer: FILL IN (off: no Co-Authored-By trailer unless a repo's
  CLAUDE.md opts in; or on).
- Config repo: FILL IN (no; or yes, `~/.claude` is a git repo whose top level
  is `~/.claude` itself). Wanted but not set up yet counts as no. When yes,
  commit each append to `LEDGER.md` or `COSTS.md` at once, that file alone,
  so one session's commit never sweeps in another session's entries.

## Gates and modifiers
- Cost gate: FILL IN (on or off).
- `/build overnight` enabled: FILL IN (yes or no). Turning it on means
  changing this line to yes after reading "How `/build overnight` works" in
  the config repo's README.
- Deferred floor items: FILL IN (for example, "2 and 5, once my code is on
  GitHub"), or drop this line.

## Kept local (`/setup-config update` never overwrites these)
- FILL IN: one bullet per path relative to `~/.claude`, or "none".

## User-only skills (descriptions not in context; suggest them by name)
- `/handoff`: end-of-session ship: reflect, verify, land, emit a handoff block.
- `/reflect`: mid-session capture into the repo's CLAUDE.md and living plan.
- `/build`: execute an approved plan as a task graph, ending at a draft PR;
  `/build overnight` runs it unattended when enabled above.

<!-- Drop the section if no focus threads were named. -->
## Focus threads (at most 3)
- FILL IN: a habit the owner is building now (for example, "tests pin an
  analytic solution before any refactor").

<!-- Drop the section if nothing below applies. -->
## Working habits (this machine: FILL IN OS and shells)
<!-- WINDOWS BLOCK: keep on Windows with Git Bash or PowerShell. -->
- Common Windows pitfalls:
  - If long heredocs fail in the Bash tool, Write the file, then run it.
  - Git Bash rewrites leading-slash arguments: prefix `MSYS_NO_PATHCONV=1`,
    then read the result back.
  - PowerShell commit messages: `git add`, then pipe a single-quoted
    here-string into `git commit -F -`; never pass it as an argument or
    combine with `-a`.
  - Stop a server by its own process or task id, never by program name.
<!-- ACCOUNTS LINE: keep only if the adopter uses more than one GitHub
account. -->
- More than one GitHub account: give each an SSH host alias in
  `~/.ssh/config` and use the alias in remotes.
