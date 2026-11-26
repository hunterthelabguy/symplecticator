// self-audit.test.mjs: prove each check of self-audit.mjs can fail. The repository as it stands is the passing
// case; each test then plants one fault in a copy of that tree and expects its check, by name, to report it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, readTree, CHECKS } from './self-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REAL = readTree(ROOT);
const SETUP = '.claude/skills/setup-config/SKILL.md';

// The problems one check reports on the real tree after edit(tree) changed a copy of it.
function problems(check, edit) {
  const tree = new Map(REAL);
  edit(tree);
  const r = audit(tree).results.find((x) => x.name === check);
  assert.ok(r, `no check named "${check}"`);
  return r.problems;
}
// Replace text in one file; the text must be there, so a test cannot pass by planting nothing.
const swap = (file, from, to) => (tree) => {
  const text = tree.get(file);
  assert.ok(text.includes(from), `${file} no longer holds ${JSON.stringify(from)}`);
  tree.set(file, text.replace(from, () => to));
};
const add = (file, text) => (tree) => tree.set(file, (tree.get(file) ?? '') + text);
const expects = (check, edit, ...texts) => {
  const found = problems(check, edit);
  for (const text of texts) assert.ok(found.some((p) => p.includes(text)), `expected a problem holding ${JSON.stringify(text)}, got:\n${found.join('\n') || '(none)'}`);
};

test('the repository as it stands passes every check', () => {
  const { results } = audit(REAL);
  assert.deepEqual(results.flatMap((r) => r.problems.map((p) => `${r.name}: ${p}`)), []);
  assert.equal(results.length, CHECKS.length);
});

test('suites: one left out of the workflow, the setup check or the verify line; a new one; a wrong count', () => {
  const check = 'every suite is named where the verification is described';
  expects(check, swap('.github/workflows/test.yml', 'run: bash scripts/perturb-hook.test.sh', 'run: true'), 'test.yml does not name scripts/perturb-hook.test.sh');
  expects(check, swap(SETUP, 'bash ~/.claude/scripts/commit-scan.test.sh', 'the scan suite'), 'step 10 does not name scripts/commit-scan.test.sh');
  expects(check, swap('CLAUDE.md', '`node --test audit/self-audit.test.mjs`', 'the audit suite'), 'the Verify bullet does not name audit/self-audit.test.mjs');
  expects(check, add('scripts/new.test.sh', 'true\n'), 'the Verify bullet does not name scripts/new.test.sh',
    'test.yml does not name scripts/new.test.sh', 'step 10 does not name scripts/new.test.sh', 'README.md says seven suites; there are 8', 'CLAUDE.md says eight suites; there are 9');
  // A suite of the repository's own is not asked of setup, which runs on the adopter's machine.
  const own = problems(check, add('audit/new.test.mjs', ''));
  assert.ok(own.some((p) => p.includes('test.yml does not name audit/new.test.mjs')));
  assert.ok(!own.some((p) => p.includes('step 10')));
});

test('links: a relative link to a file that is not there', () => {
  expects('relative links resolve', add('README.md', '\nSee [the notes](docs/no-such-notes.md).\n'), 'README.md links to docs/no-such-notes.md');
  assert.deepEqual(problems('relative links resolve', add('README.md', '\n[site](https://example.com/x) [top](#install) [primer](PRIMER.md#caching)\n')), []);
});

test('examples: a cited example with no heading in the examples file beside the skill', () => {
  expects('cited examples exist', swap('skills/build/SKILL.md', 'example C5', 'example C9'), 'skills/build/SKILL.md cites example C9');
  expects('cited examples exist', swap('skills/critique/SKILL.md', '(C2)', '(C7)'), 'cites example C7');
});

test('scripts: a named script that is not in scripts/', () => {
  expects('named scripts exist', add('README.md', '\nRun `bash ~/.claude/scripts/no-such.sh`.\n'), 'README.md names scripts/no-such.sh');
  expects('named scripts exist', swap('templates/settings.template.json', 'scripts/ground-truth.sh', 'scripts/ground-truthh.sh'), 'names scripts/ground-truthh.sh');
  // A scripts folder beside the file counts only when the name carries no ~/.claude.
  expects('named scripts exist', add('skills/diagnosing-bugs/SKILL.md', '\n`~/.claude/scripts/hitl-loop.template.sh`\n'), 'names scripts/hitl-loop.template.sh');
});

test('commands: a slash command that is no skill, command or built-in', () => {
  expects('named slash commands exist', add('PRIMER.md', '\nThen run `/reflectt now`.\n'), 'PRIMER.md names /reflectt');
  assert.deepEqual(problems('named slash commands exist', add('PRIMER.md', '\n`/compact`, `/build overnight`, `/tmp/x`, `/dev/null`\n')), []);
});

test('README table: a skill with no row, and a row for a skill that is gone', () => {
  const check = 'the README table lists every skill and command';
  expects(check, add('skills/newskill/SKILL.md', '---\nname: newskill\n---\n'), 'no row for newskill');
  expects(check, (tree) => tree.delete('skills/frames/SKILL.md'), 'names frames, which is no skill or command here');
});

test('user-only: a user-only skill the addendum template does not list', () => {
  expects('user-only skills are listed in the addendum', swap('templates/addendum.template.md', '- `/perturb`:', '- perturb:'), 'does not name /perturb');
  expects('user-only skills are listed in the addendum', swap('templates/addendum.template.md', '- `/reflect`:', '- reflect:'), 'commands/reflect.md is user-only');
});

test('floor: a cited item the charter lacks, and a setup list that differs from the charter', () => {
  expects('cited floor items exist', add('skills/tdd/SKILL.md', '\nSee floor item 0.\n'), 'skills/tdd/SKILL.md cites floor item 0');
  expects('cited floor items exist', swap('templates/charter.template.md', '\n9. Tests exactly as thick', '\nNine. Tests exactly as thick'), 'differ on floor item(s) 9', 'cites floor item 9');
});

test('em dash: one anywhere', () => {
  expects('no em dash', add('skills/frames/SKILL.md', `\nA dash ${String.fromCharCode(0x2014)} here.\n`), 'skills/frames/SKILL.md holds an em dash');
});

test('numbers: a repeated number that drifts, and a template over its cap', () => {
  const check = 'repeated numbers agree, and templates fit their caps';
  expects(check, swap('scripts/ground-truth.sh', 'SHOWCASE_DAYS=14', 'SHOWCASE_DAYS=21'), 'scripts/ground-truth.sh says 21, commands/handoff.md says 14');
  expects(check, swap(SETUP, 'charter under about 130', 'charter under about 120'), 'line cap for the charter');
  expects(check, add('templates/charter.template.md', 'one more line\n'.repeat(40)), 'templates/charter.template.md has');
  // Lines inside a template comment do not count: the adopter's copy drops them.
  assert.deepEqual(problems(check, add('templates/charter.template.md', `<!--\n${'a comment line\n'.repeat(40)}-->\n`)), []);
});

test('licenses: a license the frontmatter points to and the folder lacks', () => {
  expects('licenses pointed to exist', (tree) => tree.delete('skills/tdd/LICENSE'), 'skills/tdd/SKILL.md points to LICENSE');
  expects('licenses pointed to exist', (tree) => tree.delete('scripts/LICENSE-workflow'), 'scripts/LICENSE-workflow does not exist');
});

test('names: a skill named otherwise than its folder', () => {
  expects('skill names match their folders', swap('skills/frames/SKILL.md', 'name: frames', 'name: frame'), 'skills/frames/SKILL.md is named frame');
});

test("guard tools: a tool the skill's text names and the guard lacks, and the reverse", () => {
  const check = "the guard's tool list matches /perturb's text";
  expects(check, swap('scripts/perturb-guard.mjs', "Glob: 'read',", ''), 'says the guard lets Glob through');
  expects(check, swap('scripts/perturb-guard.mjs', "Bash: 'bash',", "Bash: 'bash', Shell: 'bash',"), 'lets Shell through; skills/perturb/SKILL.md does not name it');
});

test('move together: a command that runs a script and is not on the update rule', () => {
  expects('files that run scripts move with scripts/', add('commands/reflect.md', '\nRun `bash ~/.claude/scripts/ground-truth.sh`.\n'), 'does not name commands/reflect.md');
});

test('a check that cannot run fails, and the plan files still in docs/ are a note, not a failure', () => {
  class Broken extends Map { get(k) { if (k === 'README.md') throw new Error('unreadable'); return super.get(k); } }
  const { results, failed } = audit(new Broken(REAL));
  assert.ok(failed);
  assert.ok(results.some((r) => r.problems.some((p) => p.includes('the check could not run: unreadable'))));
  const held = [...REAL.keys()].some((p) => p.startsWith('docs/'));
  assert.equal(audit(REAL).notes.some((n) => n.includes('holds no plan')), held);
});
