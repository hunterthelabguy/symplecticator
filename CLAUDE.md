# Maintaining this repository

This file is for work on the config itself, by its maintainer. If you
opened this folder to install the config, run `/setup-config` and ignore
the rest: in setup, "the owner" means you, not the maintainer.

- **Maintainer identity (not the adopter's):**
  `hunterthelabguy <hunterthelabguy@proton.me>`. Trailer: none (no
  Co-Authored-By).
- **Verify:** `bash scripts/ground-truth.test.sh`,
  `bash scripts/build-stop-gate.test.sh`,
  `node --test scripts/ledger.test.mjs`,
  `bash scripts/commit-scan.test.sh`,
  `node --test scripts/perturb-guard.test.mjs`,
  `bash scripts/perturb-hook.test.sh`,
  `node --test scripts/guard-oracle.test.mjs` (the guard against real
  bash) and `node --test audit/self-audit.test.mjs`, all green, then
  `node audit/self-audit.mjs` with no FAIL line (it checks what the
  prose says about this repository against its files). CI runs all eight
  on Linux and macOS with the audit, and the two guard suites
  (`node --test`) alone on Windows.
  A check that cannot run here (the jq checks without `gh` signed in, the
  gh-missing case when `gh` cannot be hidden) counts as skipped, not
  passed.
- **Landing:** after commit zero, every change lands by pull request with
  green CI. The maintainer merges, or Claude does on the maintainer's
  word for that pull request, quoted in it, once the pull request reads
  cleared at head with green CI. Merge method: merge commit.
- **Living plan, archival spec, ledger:** none in this repository; the
  maintainer keeps decisions privately.
- **Public text:** say "you" to the reader and "the owner" in Claude-facing
  text, never a personal name; no em dashes.
