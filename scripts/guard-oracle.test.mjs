// guard-oracle.test.mjs: the guard against the bash it models. guard-oracle.mjs generates commands, runs each in
// real bash inside a throwaway home, and asks the guard about every one bash was harmed by. One bash pass serves
// every test: the guard as it stands must let none of those through, and a guard with one rule taken out (it
// checks a write only in the starting folder, not in the folders a cd names) must let some through, which proves
// the oracle can fail.
//
// The pass also proves the oracle stays in its sandbox. It is started from a throwaway folder that holds a
// CLAUDE.md of its own, and is handed the commands that once got out: `cd -` (bash's OLDPWD is the folder the
// oracle was started from) and a chain of `cd ..` longer than the sandbox is deep. The bystander file must
// survive, and the chain must be reported as stopped.
//
// GUARD_ORACLE_N sets the number of random commands beside the short forms (default 150), GUARD_ORACLE_SEED the
// seed (default 1). For a wider run, a replay of older guards, or the list of misses: node scripts/guard-oracle.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './guard-oracle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const N = Number(process.env.GUARD_ORACLE_N) || 150;
const SEED = Number(process.env.GUARD_ORACLE_SEED) || 1;
const skip = spawnSync('bash', ['-c', 'command -v git']).status === 0 ? false : 'bash and git are needed on PATH';

const T = mkdtempSync(join(tmpdir(), 'guard-oracle-test-'));
const BYSTANDER = join(T, 'started-here', 'CLAUDE.md');
const CLIMB = 'cd ..; '.repeat(14) + 'true';
const back = process.cwd();
after(() => { process.chdir(back); rmSync(T, { recursive: true, force: true }); });
let result;

before(async () => {
  if (skip) return;
  // The mutant: a write or removal is looked up from the starting folder alone.
  const source = readFileSync(join(HERE, 'perturb-guard.mjs'), 'utf8');
  const mutant = source.replace('const anyHit = (check, t) => [...seen].some(', 'const anyHit = (check, t) => [start].some(');
  assert.notEqual(mutant, source, 'the mutant must change the guard: its anchor line has moved');
  mkdirSync(join(T, 'mutant'));
  writeFileSync(join(T, 'mutant', 'perturb-guard.mjs'), mutant);
  copyFileSync(join(HERE, 'commit-scan.sh'), join(T, 'mutant', 'commit-scan.sh'));
  // Start the oracle the way the first version was started when it got out: from a folder with a file to lose.
  mkdirSync(dirname(BYSTANDER));
  writeFileSync(BYSTANDER, 'keep\n');
  process.chdir(dirname(BYSTANDER));
  process.env.OLDPWD = dirname(BYSTANDER);
  result = await run({ n: N, seed: SEED, wide: false, replay: [join(T, 'mutant', 'perturb-guard.mjs')],
    extra: (s) => [
      { family: 'rm', start: s.O, command: 'cd -; rm CLAUDE.md' },
      { family: 'rm', start: s.O, command: 'cd -\necho x > CLAUDE.md' },
      { family: 'rm', start: s.O, command: '( cd - && rm CLAUDE.md )' },
      { family: 'rm', start: s.O, command: CLIMB, escape: true },
    ] });
});

const show = (v) => `[${v.family}, from ${v.from}] ${v.command}`;

test('the oracle stays in its sandbox: a file in the folder it was started from survives, and a climb out is stopped', { skip }, () => {
  assert.equal(readFileSync(BYSTANDER, 'utf8'), 'keep\n');
  assert.deepEqual(result.left.map((v) => v.command), [CLIMB]);
});
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
