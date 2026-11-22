# Executing critique: worked examples

Curated because examples beat rules. One entry per kind of finding, correct
and incorrect alike, capped around a dozen; each entry from a real run names
the PR and date. The full record is the retro line in each PR body.
`/reflect` promotes new entries from those lines and retires superseded
ones. The executing-critique prompt loads this file.

More is not better: this file loads every time the critique runs, so an
entry that misleads or no longer matches how the work is done is retired,
not kept.

The three seed entries (E1 to E3) are invented for teaching. They come from
no real run, so they carry no PR or date. E4 onward are generalized from
real runs, with the project's names stripped. Retire the seeds as your own
runs produce entries.

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

## E4. Mutants one at a time on the full suite; the survivor is in the new code (correct, after a miss)

Four passes on one plan ran its mutant steps as written, scoped to one file
with several mutants at once, and passed; the build's task reviewers then
found nine plan tests that killed no mutant of their own. On that project's
next plan the critique ran all 22 named mutants alone on the full suite: 22
died as the plan said. It then added nine of its own to the code the tasks
introduced, and one survived: the new collision loop skipped its first
pair, the same class of survivor the plan had been written to pin in the old
loop. Lesson: confirming the plan's mutant list is half the job; mutate what
each task adds, because a fix tends to reintroduce the defect it fixes.

## E5. A kept test that stops testing its title once the change lands (correct)

A plan kept an older test, "a quote mark straight after a lone carriage
return opens a quoted field", and its text still passed. But its header held
no semicolon, so once a carriage return ended a line the semicolon could
never score, whether or not the quote opened: a mutant that stopped the
quote opening survived. Lesson: for each test a plan keeps, mutate the thing
its title names at the plan's end state; a test can go hollow without
failing.

## E6. An exact identity beats counting classes; a stop rule needs its classifier (correct, after a miss)

On the same plan, the author's one-generator comparison counted 18, 21 and
24 files a seed where the base was right and the change wrong; the first
pass's generator counted about 4,000, and the second pass's found a class
neither could make. What settled the change was an identity both passes
checked with no exception on 900,000 texts each: the change's answer on a
text equals the base's answer on that text with the change undone (lone
carriage returns turned into line feeds). The plan's rule "a class beyond
these three stops the commit" then fired or not depending on a generator the
step did not specify. Lesson: look for an exact relation between old and new
before counting; and a stop rule on classes states how a text is sorted into
one.

## E7. A fold changes a try's reach and names one thrower of two (correct, after two misses)

A ruling said an import function's fallback goes, reasoning that what the
log throws should reach the host as the log gave it. The first fold dropped
the `catch`, but its `try` also wrapped a call into the host's own code: the
next pass measured 14 thrown values now leaving raw. The second fold
restored the `catch` over the same `try`, so it now also re-made the log's
own throws after a landed import as the class that says nothing changed, and
a host run's core error as the class that says a subscriber threw: the pass
after found both, with a mutant no test killed. The fix wrapped the host
call alone. Lesson: when a step adds, drops or moves a `catch`, list every
call inside its `try` and who owns each, and give each owner a row; a reason
that names one thrower does not cover the others. A property over every
route (what leaves is the class whose meaning matches whether the document
changed) holds this as a rule rather than a table.
