# Executing critique: worked examples

Curated because examples beat rules. One entry per kind of finding, correct
and incorrect alike, capped around a dozen; each entry from a real run names
the PR and date. The full record is the retro line in each PR body.
`/reflect` promotes new entries from those lines and retires superseded
ones. The executing-critique prompt loads this file.

More is not better: this file loads every time the critique runs, so an
entry that misleads or no longer matches how the work is done is retired,
not kept.

The three seed entries are invented for teaching. They come from no real
run, so they carry no PR or date. Retire them as your own runs produce
entries.

## E1. "Identical results" that are only equal to rounding (invented)

A plan replaced a Python loop that summed particle energies with a
vectorized NumPy call and claimed identical results, checked by `==` against
the old output. Applied in a scratch tree, the check failed in the last few
digits: NumPy sums in a different order, so the floating-point result
differs. Neither version is wrong, and the spec states a relative tolerance
of 1e-12. Lesson: a claim of "identical" floating-point output is a claim to
run; compare with the tolerance the spec states, never with `==`.

## E2. A verify command that tests nothing (invented)

A plan's verify step was `pytest tests/test_integrator.py -k energy`. No test
name in that file contained "energy", so the command selected no tests and
could not fail. Lesson: run every verify command in the scratch tree and
check that it actually exercised something; a check that cannot fail is
worse than no check.

## E3. A check that reads stale output (invented)

A plan's last task checked that `output/run.h5` existed after the run. The
script writes relative to the working directory, so run from the repo root
it wrote elsewhere, and the check passed against a file left over from an
earlier run. Lesson: clear the output location before running a check, and
check the fresh file's contents, not just its existence.
