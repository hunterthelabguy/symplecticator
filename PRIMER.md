# Required reading: how working with Claude works

Read this before your first session; `/setup-config` walks through it with
you. The plain version is for everyone. The physics version is for anyone who
has met the particle in a box, and gives the reasons behind the plain one.

## Plain version

- **Claude knows only what is loaded.** Each session it reads your charter,
  the repo's CLAUDE.md, the files it opens and the conversation so far.
  Nothing else.
- **More is not better.** Every stale or irrelevant line competes for
  attention and pulls answers off course. Files that load every session stay
  short; notes needed for one kind of task load only for that task; and you
  prune often (`/reflect` does the pruning pass).
- **An answer is a sample, not a calculation.** Ask twice and you can get
  two different answers. So anything a tool can check the same way every
  time (types, tests, linters, a comparison with an analytic solution) is
  checked that way first. What only an agent can judge, an agent judges,
  citing the spec line it rests on, and you check the judgement by running
  something, not by how convincing it sounds.
- **Critique rounds remove problems before code exists.** Each round should
  leave fewer open questions. Stop when a fresh look finds none; "clean" is
  a real result.
- **Before a long break, run `/handoff`.** It writes a short block for the
  next session. Starting fresh from that block is cheap; coming back to a
  large session that has gone cold is not (see Caching below). The block is
  itself a claim, so it opens by having the next session check it against
  git and GitHub with the ground-truth script: the deterministic check
  comes first here too. A long turn that ran on its own and ends waiting on
  you closes with the same block.

## Physics version: a particle in a box

Treat a piece of work (a spec, a plan, a codebase) as a state in a box,
psi = sum_n c_n psi_n. The ground state psi_1 is exactly what you meant.
Each excited state psi_n is a way it could be wrong: an ambiguity, a
contradiction, a hidden assumption. The context window is the box: finite
and fixed.

- **Expectation value.** <E> = sum_n |c_n|^2 E_n. Every unresolved question
  and every stale line of context keeps weight in excited states and raises
  <E>. A critique round finds an excited component and removes it, and
  pruning stops re-adding them: cooling, not just looking. Each round
  lowers <E>.
- **Measurement.** Running Claude is a measurement: it returns one
  eigenstate, with probability |c_n|^2. A good-looking output from a
  high-<E> state is a lucky draw, not evidence that the state is good.
  Judging work by one output is estimating <E> from one measurement. That is
  vibes.
- **Collapse.** Measure again right away and you get the same eigenvalue.
  Asking the same session to re-check its own work is that second
  measurement: correlated with the first, not independent. An independent
  check needs a re-prepared state, which is a fresh context. That is why the
  final review before a merge is always done by a fresh context.
- **Deterministic first.** A test against an analytic solution is a
  measurement with no spread: same verdict every run. The order is: the type
  system, then tests, then other tools, and only then an agent. Tools
  enumerate; agents adjudicate, citing the spec.
- **Zero-point energy.** A confined particle cannot sit at E = 0: the
  uncertainty principle, Delta x Delta p >= hbar/2, forbids it. A finite
  context likewise never yields a perfectly determined answer. Critique
  drives <E> toward the ground state, never to zero, so stop at the first
  clean fresh pass (at most three), and keep the deterministic checks even
  when the state looks good.

**Where the analogy breaks.** In a real box, widening the box lowers every
level (E_n is proportional to n^2/L^2). Context does not work that way:
loading more text does not settle the model, it dilutes it. The box stands
for "the context is finite", not for "how big to make it".

## Caching: why a warm session is cheap and a cold one is not

Every turn, Claude re-reads the whole session: charter, files, the
conversation so far. Re-reading the same opening is cheap because it is
cached, and the rules of that cache shape good habits. (Sources: "How Claude
Code uses prompt caching", code.claude.com/docs/en/prompt-caching, read
2026-10-09; Anthropic's prompt-caching API reference for the price ratios,
which are API rates and show the scale.)

- **It matches from the front.** The cache covers the longest unchanged
  opening of the session; change something early and everything after it is
  re-read at full price. The big one is switching models: each model has its
  own cache. Turning on fast mode costs one re-read too. Pick the model at
  the top of a session, not halfway through. (On current models, changing
  effort keeps the cache with an API key or a Claude subscription, and
  connecting an MCP server usually does too.)
- **Reads are about a tenth of the price.** A cache read costs about 0.1x
  the normal input price; writing the cache costs about 1.25x (2x for the
  one-hour kind). A long session that stays warm is far cheaper per turn
  than its size suggests.
- **It expires when idle, and the window depends on how you pay.** Each
  turn resets the clock. On a Claude subscription (Pro, Max), within the
  plan's included usage, the main conversation gets a one-hour window. With
  an API key, a cloud provider, or once a subscription is drawing on
  extra-usage credits, it is five minutes. Subagents get five minutes by
  default.
- **You can choose.** The `promptCacheTtl` setting (or the
  `CLAUDE_CODE_PROMPT_CACHE_TTL` environment variable) sets the main
  conversation's window, and `subagentPromptCacheTtl` sets everything else;
  each takes `5m` or `1h` (Claude Code v2.1.242 or later). On Pro, setting
  `1h` keeps the hour after you start drawing on credits, at twice the write
  price. `/usage` shows a "Prompt cache (main)" line: the hit ratio, whether
  the cache is warm right now, and the likely cause of the last miss.
- **Keeping it warm means keeping working.** Finish a line of thought in one
  sitting. Pinging a session only to keep it warm costs a cache write each
  time and rarely pays.
- **Before a long break, `/handoff`.** Coming back to a large session after
  the window has passed re-reads the whole history at full price. If you
  would rather keep the session, run `/compact` before you leave, while the
  cache is still warm: compacting after a break costs the most, because the
  summary then reads the whole history uncached. (On Pro and Max, Claude Code
  offers to resume a large session from a summary after a long break; take
  that offer.)
- **Your charter and CLAUDE.md load at session start.** Editing them
  mid-session costs nothing and changes nothing until `/clear`, `/compact`,
  or a new session. One more reason to end with `/handoff` and start fresh.
- **Subagents start cold.** A subagent shares no cache with the main
  session and reads its inputs at full price. That is part of why agent
  steps cost what they do, and why the cost gate asks before spawning them.
- **Tiny openings never cache.** Below a minimum length (512 tokens on
  current models) nothing is cached, which matters only for very short
  prompts.

## Your decisions, in your own words

If you adopt the ledger (practice floor item 6), it works as a lab notebook
for decisions, with two payoffs. Provenance: months later you, an advisor or
a coauthor can see what was decided, when and why, in your own words rather
than Claude's paraphrase. Calibration: the ledger becomes a set of worked
examples of how you decide. The skills read a project's ledger before working
in that area, and at each review the rulings that keep recurring are promoted
into your charter, so the charter is written from your actual decisions, not
from guesses.
