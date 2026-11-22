# Simplify pass: worked examples

Curated because examples beat rules. One entry per kind of
finding, correct and incorrect alike, capped around a dozen; each names the
PR and date. The full record is the retro line in each PR body (findings
proposed / accepted / rejected / what review caught that the pass missed).
`/reflect` promotes new entries from those lines and retires superseded
ones. The simplify step in `/build` loads this file.

More is not better: this file loads every time the pass runs, so an entry
that misleads or no longer matches how the work is done is retired, not
kept.

S1 to S7 come from real runs in one project, with its name and PR numbers
left out. Retire them as your own runs produce entries.

Format for an entry:

```
## Sn. <one-line kind> (correct | incorrect)
<repo> PR <n>, <date>. What the pass proposed, against which non-goal or
slop item, what happened (accepted, rejected and why, or missed by the pass
and caught in review). One lesson sentence.
```

## S1. A comment citing a private plan's numbering (correct)
A PR, 2026-10-28. Pass 1 rewrote 17 comments and test titles that
cited the private plan's decision numbers so each states its rule or a spec
pointer; accepted. A public comment states the rule it enforces; a private
plan's numbering means nothing to its reader.

## S2. A defensive fallback the types exclude (correct)
Same PR. Pass 1 removed `forced[c] ?? false` as a defensive branch for a
state the types exclude; accepted. A default the types already rule out is
noise.

## S3. Public options nothing passes, under an interface lock (correct rejection)
Same PR. The passes proposed dropping public options nothing passes;
rejected under the interface lock and sent to the owner, who ruled them to
the next plan. A dead-default finding on a public interface is a question
for the owner, not a pass's edit.

## S4. A forwarding wrapper (correct)
Next PR, 2026-10-29. Pass 1 inlined a `format` function that only forwarded
to `formatDisplayed`; accepted, with per-test results and the built entry's
runtime names compared identical before and after. Prove a no-behaviour edit
by those comparisons, not by a green run alone.

## S5. A two-copy line held by a test (correct rejection)
Same PR. Pass 1 proposed one helper for the start-row guard copied in two
commands; rejected, since a test compares both messages, so the copies cannot
drift unnoticed, and a helper adds lines; it rejected a literal the type
system holds on the same ground. Duplication is a finding only where a copy
can drift unnoticed.

## S6. A test comment untrue of its own data (correct)
Same PR. A test comment said the third decimal "cannot tell every neighbour
apart", untrue of the test's ten samples (all distinct at three decimals); a
task reviewer measured it and pass 1 fixed it. A comment's claim about test
data is checked against that data.

## S7. A clean pass on too thin a record (incorrect)
A later PR, 2026-11-12. Pass 2 reported clean, 0 proposed, in 6 tool uses and
32 s: too few to install, verify, and read the diff, these examples, the slop
list, six spec sections and the plan's non-goals it named. The controller did
not count it. Pass 3, told to name each input and check, found a test comment
untrue of its data and a guard clause pass 1 had wrongly called pinned. A
clean result's evidence includes the pass's own record.
