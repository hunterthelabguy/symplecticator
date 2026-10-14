---
name: tdd
description: Test-driven development. Use when a plan task or the owner calls for test-first work, or on "red-green-refactor" or "TDD". Not a default for every edit.
license: MIT (adapted 2026-10-04 from github.com/mattpocock/skills @24fe0ef, skills/engineering/tdd, (c) 2026 Matt Pocock; see LICENSE)
---

# Test-Driven Development

TDD is the red, then green loop. This skill is the reference that makes the
loop produce tests worth keeping: what a good test is, where tests go, the
anti-patterns, and the rules of the loop. Every section applies on every
cycle.

Read the repo's spec and decision ledger for the area you touch, so test names
use the spec's vocabulary and the tests assert the spec's numbers.

## What a good test is

Tests verify behavior through public interfaces, not implementation details.
Code can change entirely; tests should not. A good test reads like a
specification: "one RK4 period of the harmonic oscillator returns to the
start within tolerance" names a capability, and it survives refactors because
it does not care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe
behavior without reaching inside. Tests live at seams, never against internals.

**Test only at agreed seams.** Seams are agreed before any test is written:
either named in the plan task (writing-plans records them, which is what lets
`/build overnight` run unattended) or confirmed with the owner in the session.
No test is written at an unagreed seam. Agreeing seams up front puts testing
effort on the critical paths instead of every edge case.

Ask, when the plan does not say: "What's the public interface, and which seams
should we test?"

## Anti-patterns

- **Implementation-coupled:** mocks internal collaborators, tests private
  methods, or verifies through a side channel (reading a private state array
  instead of the returned result). The tell: it breaks on a refactor that kept behavior.
- **Tautological:** the assertion recomputes the expected value the way the
  code does, so it passes by construction. Expected values come from an
  independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing:** all tests first, then all implementation. Bulk tests
  verify imagined behavior. Work in vertical slices: one test, one
  implementation, repeat, each test responding to what the last cycle taught.

## Rules of the loop

- **Red before green.** Write the failing test, watch it fail for the right
  reason, then write only enough code to pass it.
- **One slice at a time.** One seam, one test, one minimal implementation.
- **Refactoring is not part of the loop.** It belongs to review, not the
  red-green cycle.
- **Regression tests prove themselves:** pass, revert the fix, watch it fail,
  restore, watch it pass.

## Test thickness

Tests are exactly as thick as the spec, measured, not felt. Mutation testing
(mutmut for Python) is the instrument. A surviving mutant means dead code or
a missing test, and the spec decides which, which is why the spec is written
and hardened before the code. A test that kills no mutant the others miss is
dead weight. Deterministic first: the tool enumerates survivors; the agent
adjudicates each one citing the spec line it rests on.
