// guard-oracle.test.mjs: the guard against the bash it models. guard-oracle.mjs generates commands, runs each in
// real bash inside a throwaway home, and asks the guard about every one bash was harmed by. One bash pass serves
// both tests: the guard as it stands must let none of those through, and a guard with one rule taken out (it
// checks a write only in the starting folder, not in the folders a cd names) must let some through, which proves
// the oracle can fail.
//
// GUARD_ORACLE_N sets the number of random commands beside the short forms (default 150), GUARD_ORACLE_SEED the
// seed (default 1). For a wider run, a replay of older guards, or the list of misses: node scripts/guard-oracle.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './guard-oracle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const N = Number(process.env.GUARD_ORACLE_N) || 150;
const SEED = Number(process.env.GUARD_ORACLE_SEED) || 1;
const skip = spawnSync('bash', ['-c', 'command -v git']).status === 0 ? false : 'bash and git are needed on PATH';

const T = mkdtempSync(join(tmpdir(), 'guard-oracle-test-'));
after(() => rmSync(T, { recursive: true, force: true }));
let result;

before(async () => {
  if (skip) return;
  // The mutant: a write or removal is looked up from the starting folder alone.
  const source = readFileSync(join(HERE, 'perturb-guard.mjs'), 'utf8');
  const mutant = source.replace('const anyHit = (check, t) => [...seen].some(', 'const anyHit = (check, t) => [start].some(');
  assert.notEqual(mutant, source, 'the mutant must change the guard: its anchor line has moved');
  writeFileSync(join(T, 'perturb-guard.mjs'), mutant);
  copyFileSync(join(HERE, 'commit-scan.sh'), join(T, 'commit-scan.sh'));
  result = await run({ n: N, seed: SEED, wide: false, replay: [join(T, 'perturb-guard.mjs')] });
});

const show = (v) => `[${v.family}, from ${v.from}] ${v.command}`;

test('bash is harmed by enough of the generated commands for the check to mean something', { skip }, () => {
  assert.ok(result.harmful >= 100, `only ${result.harmful} of ${result.cases} commands did harm`);
  // Each family on its own: one that harms nothing checks nothing (a stand-in git that is not on PATH, say).
  for (const family of ['rm', 'push', 'write']) {
    assert.ok(result.families[family] >= 10, `the ${family} family did harm ${result.families[family] ?? 0} times`);
  }
  assert.equal(result.undecided, 0, 'the guard answered every command it was asked about');
});
test('no command that damages the canary config, or pushes where the default branch is checked out, gets through', { skip }, () => {
  assert.deepEqual(result.violations.map(show), []);
});
test('the oracle can fail: a guard that checks writes in the starting folder alone lets harm through', { skip }, () => {
  const [{ violations }] = result.history;
  assert.ok(violations.length > 0, 'the mutant guard was let off');
  assert.ok(violations.every((v) => v.family === 'rm'), 'the mutant changes only how writes and removals are placed');
});
