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

Format for an entry:

```
## Sn. <one-line kind> (correct | incorrect)
<repo> PR <n>, <date>. What the pass proposed, against which non-goal or
slop item, what happened (accepted, rejected and why, or missed by the pass
and caught in review). One lesson sentence.
```

No entries yet: the first `/build` that runs the pass writes the first
retro line, and `/reflect` promotes from there.
