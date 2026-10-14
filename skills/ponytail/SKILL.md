---
name: ponytail
description: >
  Simplest-solution ladder. Fire on your own when about to add a dependency,
  file, class, abstraction, or config; when fixing a bug; or when auditing a
  plan for parts with no job. Also on "ponytail", "be lazy", "simplest",
  "YAGNI". Not for specs, ledgers, commit bodies, or institutional prose.
license: MIT (adapted 2026-10-03 from github.com/DietrichGebert/ponytail, (c) 2026 DietrichGebert; see LICENSE)
---

# Ponytail

Lazy means efficient, not careless. The best part is no part.

## Precedence

The charter floor outranks this skill: whatever the floor requires (specs,
ledgers, tests, sources) is never cut in the name of simplicity. YAGNI cuts
what gets built, never the record of why. Coaching notes stay as the charter
defines them.

## The ladder

Read the task and the code it touches first; trace the real flow. Then stop at
the first rung that holds:

1. **Does this need to exist at all?** Put "delete it" on the option list with
   its cost. Cut requirements, not just code.
2. **Already in this repo?** Reuse the helper, type, or pattern a few files over.
3. **Standard library does it?** Use it.
4. **Native platform covers it?** HTML input types over a picker library, CSS
   over JS, a DB constraint over app code.
5. **Installed dependency solves it?** Use it. No new dependency for a few lines.
6. **One line?** One line.
7. **Only then:** the minimum code that works.

Two rungs work: take the higher one.

## Rules

- **Bug fix = root cause.** Grep every caller first. One guard in the shared
  function beats a guard in each caller.
- No abstraction with one implementation, no config for a constant, no
  scaffolding "for later".
- Deletion over addition; boring over clever; fewest files.
- Shortest diff wins only once the problem is understood. The smallest change
  in the wrong place is a second bug.
- Complex request: ship the lean version and name what was skipped and when to
  add it, in one line. Do not stall on a question you can default.
- Same-size options: take the one correct on edge cases.
- A deliberate corner cut with a known ceiling gets a `ponytail:` comment naming
  the ceiling and the upgrade path, and a check that fails when the ceiling
  is reached. Example: a simulation keeps RK4 rather than switching to a
  symplectic integrator, knowing RK4 does not conserve energy, because the
  drift was measured to matter only after about 1000 s of simulated time and
  runs are shorter. The comment names that ceiling and the upgrade path (a
  symplectic integrator such as velocity Verlet); the check fails if a run's
  length passes the ceiling.

## Never simplify away

Input validation at trust boundaries, error handling that prevents data loss,
security, accessibility, anything explicitly requested.

**Hardware:** real clocks drift and sensors read off. Leave the calibration knob
(sims fit to measured data).

**One check:** non-trivial logic (a branch, loop, parser, or anything touching
money or security) leaves the smallest runnable check that fails if it
breaks. Trivial one-liners need none.

## One-consumer rule

An abstraction with one consumer and no planned future consumer is slop:
inline it. A planned future consumer must have a target date and a check
that reports when the date passes without the consumer arriving. A pure
function with one call site and its own tests is not a one-consumer
abstraction. Example: an integrator interface with only RK4 behind it is
slop unless a second integrator has a date and a check; otherwise call RK4
directly.

## Slop list (cited by the simplify pass)

A starting list; the owner amends it by ruling. A finding cites its item.

- S1. An abstraction with one consumer and no dated, checked future consumer.
- S2. A knob, option or parameter nothing passes.
- S3. A defensive branch for a state the types already exclude.
- S4. A comment that narrates the session or the decision instead of the
  code (invariants, units and spec pointers are the comments that stay).
- S5. A copied block where one module would do.
- S6. A wrapper that only forwards, or a hedging name (`maybe`, `helper`,
  `utils`, `v2`) that hides what the thing is.
