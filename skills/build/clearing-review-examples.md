# Clearing review: worked examples

Curated because examples beat rules. One entry per kind of finding or call,
correct and incorrect alike, capped around a dozen; each entry from a real
run names the PR and date. The full record is the retro line in each PR
body. `/reflect` promotes new entries from those lines and retires
superseded ones. The clearing review in `/build` loads this file.

More is not better: this file loads every time the review runs, so an entry
that misleads or no longer matches how the work is done is retired, not
kept.

The first three entries come from one real run, on 2026-11-12, in a
repository that is not public, so they name no PR; C5's project name is
left out too. Retire them as your own runs produce entries.

Format for an entry:

```
## Cn. <one-line kind> (correct | incorrect)
<repo> PR <n>, <date>. What the review found or how it graded it, what was
done about it, and what that cost or saved. One lesson sentence.
```

## C1. A nit fixed after clearing made a regression (incorrect)

A review cleared a head and noted one nit: a type check in a validator
changed only an error's wording, because a later rule rejected the same
values, so drop it or pin it. The fix round dropped it. The later rule built
its error message by putting the value into a string, and an object with no
usable `toString` made that throw, so one bad record in an import file took
the good records down with it. The next review caught it by running the old
and the new code on every JSON type. Lesson: a nit is not a reason to commit
after a clearing review, and when the choice is to drop a guard or pin it,
pin it.

## C2. A spec number no test pinned, graded minor (incorrect)

The spec said two spans match at an overlap of 0.5 or more. The reviewer
changed the threshold to 0.2, every test still passed, and it graded the gap
minor. That is a major: a spec number no test holds is what charter floor
item 9 exists to catch, and one case just under the threshold closes it.
Lesson: grade by what the spec loses, not by how small the fix is.

## C3. A declined finding's reason, tested instead of trusted (correct)

A fix round declined one finding with a reason: rewriting a media query as
`max-width` would change nothing, because the bundler emits the same range
form either way. The delta reviewer made the change itself, built into a
scratch folder, and compared the output; the reason held. Lesson: a reason
for not fixing something is a claim, and a claim gets run.

## C4. A sentence about a script's output, run instead of read (correct)

symplecticator PR 3, 2026-11-12. The rule's own text said the ground-truth
script "takes the last commit id on that line". The reviewer extracted the
script's jq program, ran twelve Review-line variants through it, and showed
that the line has to end at the commit id. The fix then predicted what the
PR would read, and was wrong for a body with two Review lines; the next
review found that the same way and graded it major, as a defect a fix round
made. Lesson: text that says what a script reads or prints is a claim; run
the program on fixtures, with one matching line and with several.

## C5. A fix forked a pinned expression; nothing held the new branch (correct)

A fix added a mode flag inside one expression, so a replay and a live run
took different sides of it. Every old test reached only the live side, and
the fix's three task reviews aimed their mutants at the new operand, not at
the shared ones. The clearing review mutated each operand inside the new
branch alone: a replay that ignored an event window's reach survived the
full suite, and under it the code refused a file it had written. One test
closed it. Lesson: a fix that adds a mode flag to shared code leaves each
old test pinning only the branch it reaches, so mutate every operand inside
the new branch.
