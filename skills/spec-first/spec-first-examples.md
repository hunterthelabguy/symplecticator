# Spec-first: worked examples

Curated because examples beat rules. One entry per kind of finding from a
spec-first question round, correct and incorrect alike, capped around a
dozen; each entry from a real run names the spec, the branch or PR and the
date. `/reflect` promotes new entries and retires superseded ones. Step 3
of the skill (batched question rounds) loads this file.

More is not better: this file loads every time the skill runs, so an entry
that misleads or no longer matches how the work is done is retired, not
kept.

The seed entry is invented for teaching. It comes from no real run, so it
carries no branch, PR or date. Retire it as your own rounds produce
entries.

## S1. The owner's questions set the direction; the recommendations follow (invented)

Spec-first for a diagnostics module in a particle-in-cell plasma code.
Claude drafted a round of questions, each with a recommendation. Three of
the owner's replies changed the design, and each is traceable in the
spec's ledger to the owner's words.

1. "What does option B cost?" The recommendation had no cost line. Writing
   one from memory produced a wrong claim (that the field solver would
   need changes); read from the code, the cost was one new hook in the
   output loop.
2. "Can this be one level higher?" Three questions (which fields to save,
   how often, in what format) became one: every diagnostic is a function
   registered with a single writer, and the three answers became that
   writer's settings.
3. "Is a fixed time step a given, or a choice?" The preamble listed it as
   given. It was a convenience of the current runs, not physics, and an
   adaptive step changes what "every N steps" means, so the output
   schedule moved to simulated time.

Lessons for the next spec-first pass:

- A recommendation with no cost line is where the first question lands.
  Write the cost before the recommendation, from a file, not from memory.
- A premise about how something is computed is read from the code, not
  inferred from a description of it.
- Before writing a round with three questions about the same object, ask
  "one level higher?" first. If the three collapse, write the one.
- Each "taken as given" item in the preamble deserves one critique line.
- The ledger quotes the owner; the design cites the ledger. That is how the
  record shows who drove.

## S2. Limits ripple; option reasons are claims (mixed)

A browser data-viewer's core spec round, 2026-11-15. About 60 questions in
batches; every pick quoted with Claude-drafted option text.

1. Three option reasons were wrong when asked: "make the id field required"
   (it already was), "two message-worded rules" (there were four), and
   "every other ruled limit has its measured-cost line" (one has none).
   Each was caught later and corrected in the ledger, but the owner picked
   on them.
2. "Column count is quadratic" (running time) was read as the quadratic
   fit: "check and double check quadratic and all other fits". Plain
   words ("four times slower per doubling") would not have collided with
   a domain word.
3. Limits were added mid-round (rows, cells, columns, text length, a
   preview stop, a trimmed run record). Three reviews in a row found
   contradictions, all in the limits: the CSV round trip, "the same
   stream" in one rule, Save writing what Open refuses. The owner split
   them out ("Split: land the rest"); the rest landed clean and the
   limits took a round of their own.
4. A spike before any number changed the picture: it found six
   super-linear paths and a 3 MB file that crashes the preview, and the
   owner ruled "We fix problems rather than overlooking them, especially
   with this", so a limit is never the fix for a slow path.
5. "Can this even happen now?" A recommendation from a standard (the SI
   Brochure's digit grouping) was withdrawn once the owner's own record
   ("Never seen it") showed the risk was small.

Lessons for the next spec-first pass:

- Check every option's reason against a file before asking: a wrong
  reason is a wrong ruling's premise.
- In a question, prefer plain words over terms that are also domain
  words (quadratic, linear, fit, model).
- Before drafting a limit, list every route that creates, reads or
  writes the data (open, import, paste, export, run record, save) and
  every sentence that promises a round trip or an identical replay;
  check the limit against each. If the list is long, give limits their
  own round.
- Measure before proposing a number; where the code will change, have
  the PR measure and the owner ratify.
