# Maintaining this repository

This file is for work on the config itself, by its maintainer. If you
opened this folder to install the config, run `/setup-config` and ignore
the rest: in setup, "the owner" means you, not the maintainer.

- **Maintainer identity (not the adopter's):**
  `hunterthelabguy <hunterthelabguy@proton.me>`. Trailer: none (no
  Co-Authored-By).
- **Verify:** `bash scripts/ground-truth.test.sh` and
  `bash scripts/build-stop-gate.test.sh`, both green. A check that cannot
  run here (the jq checks without `gh` signed in, the gh-missing case when
  `gh` cannot be hidden) counts as skipped, not passed.
- **Landing:** after commit zero, every change lands by pull request with
  green CI, and the maintainer merges.
- **Living plan, archival spec, ledger:** none in this repository; the
  maintainer keeps decisions privately.
- **Public text:** say "you" to the reader and "the owner" in Claude-facing
  text, never a personal name; no em dashes.
