# Critique: worked examples

Curated because examples beat rules. One entry per kind of finding from a
reading critique of a spec or plan, correct and incorrect alike, capped
around a dozen; each entry from a real run names the document, the PR and
the date. The full record is the ledger entry the critique's fold produced.
`/reflect` promotes new entries and retires superseded ones. Step 1 of the
skill (hard critique) loads this file.

More is not better: this file loads every time the critique runs, so an
entry that misleads or no longer matches how the work is done is retired,
not kept.

The two seed entries are invented for teaching. They come from no real run,
so they carry no PR or date. Retire them as your own critiques produce
entries.

## C1. Widen the option space before judging the recommendation (invented)

A spec for a 1D heat-equation solver recommended a hand-written
Crank-Nicolson stepper over explicit Euler, because explicit Euler is
stable only for dt <= dx^2 / (2D). Judged as a choice between those two,
the recommendation held. Asked for at least three designs, do-nothing and
do-less among them, the critique added two the author had never listed:
explicit Euler at the stable step, which the spec's grid and run length
made affordable, and the implicit solver already in a library the group
used. Each got a cost and a failure mode; the library solver won, and the
hand-written stepper and its tests left the plan. Lesson: a yes-or-no read
of a recommendation cannot find the option its author never listed; list
the options first, then judge.

## C2. Ask what forces each row of a requirements table (invented)

A plan for a data-reduction script carried fourteen requirements, from
"reads HDF5 and CSV" to "plots in three color schemes". Asked of each row
what forces it to exist, the author could name a consumer for five: the
lab's data were all HDF5, no one had asked for CSV, and one color scheme
met the journal's figure rules. Two more rows needed no test at all once a
design rule covered them (every figure goes through one function that sets
its style). Lesson: a complete table is not a rulable one; ask of each row
what forces it, and whether a design rule meets it with no test.
