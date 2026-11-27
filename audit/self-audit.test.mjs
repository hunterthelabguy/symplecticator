// self-audit.test.mjs: prove each check of self-audit.mjs can fail. The repository as it stands is the passing
// case (the first test); the tests after it plant faults in a copy of that tree and expect the check, by name, to
// report each one. The records note, which never fails, is tested for when it appears and when it does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
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
  expects(check, swap('.github/workflows/test.yml', 'run: bash scripts/perturb-hook.test.sh', 'run: true'), 'the suites job does not name scripts/perturb-hook.test.sh');
  expects(check, swap(SETUP, 'bash ~/.claude/scripts/commit-scan.test.sh', 'the scan suite'), 'step 10 does not name scripts/commit-scan.test.sh');
  expects(check, swap('CLAUDE.md', '`node --test audit/self-audit.test.mjs`', 'the audit suite'), 'the Verify bullet does not name audit/self-audit.test.mjs');
  expects(check, add('scripts/new.test.sh', 'true\n'), 'the Verify bullet does not name scripts/new.test.sh',
    'the suites job does not name scripts/new.test.sh', 'step 10 does not name scripts/new.test.sh', 'README.md says seven suites; there are 8', 'CLAUDE.md says eight suites; there are 9');
  // A suite of the repository's own is not asked of setup, which runs on the adopter's machine.
  const own = problems(check, add('audit/new.test.mjs', ''));
  assert.ok(own.some((p) => p.includes('the suites job does not name audit/new.test.mjs')));
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

test('records: a note only, never a check, and only while CLAUDE.md says the repository holds none', () => {
  assert.ok(!CHECKS.some(([name]) => name.includes('records')), 'the records note must not be listed, or printed, as a check');
  const tree = new Map(REAL);
  tree.set('docs/a-record.md', 'a plan\n');
  assert.ok(audit(tree).notes.some((n) => n.includes('holds no plan')));
  swap('CLAUDE.md', 'none in this repository', 'kept in docs/')(tree);
  assert.ok(!audit(tree).notes.some((n) => n.includes('holds no plan')));
  // A note that cannot run is a failure, never silence. The tree throws only when the records function reads it.
  class NoRecords extends Map { keys() { if (/\bat records \(/.test(new Error().stack)) throw new Error('unreadable'); return super.keys(); } }
  const { results, failed } = audit(new NoRecords(REAL));
  assert.ok(failed);
  assert.deepEqual(results.filter((r) => r.problems.length).map((r) => [r.name, r.problems]), [['records the repository says it does not hold', ['the note could not run: unreadable']]]);
});

test('suites: the Linux and macOS job must run them, not only some other job', () => {
  const check = 'every suite is named where the verification is described';
  const moved = (tree) => {
    const yml = tree.get('.github/workflows/test.yml');
    const step = '      - if: ${{ !cancelled() }}\n        run: node --test audit/self-audit.test.mjs\n';
    assert.ok(yml.includes(step), 'the workflow no longer holds the audit suite step');
    tree.set('.github/workflows/test.yml', `${yml.replace(step, '')}      - run: node --test audit/self-audit.test.mjs\n`);
  };
  expects(check, moved, 'the suites job does not name audit/self-audit.test.mjs');
});

test('links: a folder is a target; a titled link and a reference-style link are read too', () => {
  const check = 'relative links resolve';
  assert.deepEqual(problems(check, add('README.md', '\nSee [the skills](skills/) and [build](skills/build).\n')), []);
  expects(check, add('README.md', '\nSee [nothing](skills/no-such-skill/).\n'), 'links to skills/no-such-skill/');
  expects(check, add('README.md', '\nSee [titled](no-such-titled.md "a title").\n'), 'links to no-such-titled.md');
  expects(check, add('README.md', "\nSee [single](no-such-single.md 'a title').\n"), 'links to no-such-single.md');
  expects(check, add('README.md', '\nSee [paren](no-such-paren.md (a title)).\n'), 'links to no-such-paren.md');
  expects(check, add('README.md', '\n[ref]: no-such-ref.md\n'), 'links to no-such-ref.md');
  expects(check, add('README.md', '\n   [indented]: no-such-indented.md\n'), 'links to no-such-indented.md');
  expects(check, add('README.md', '\n[angle]: <no-such-angle.md>\n'), 'links to no-such-angle.md,');
  // A footnote definition is no link, and an angle-bracketed target is the file inside the brackets.
  assert.deepEqual(problems(check, add('README.md', "\n[site]: https://example.com/x\n[titled](PRIMER.md \"the primer\") [single](PRIMER.md 'the primer')\n[^1]: Seen in a past build.\n[p]: <PRIMER.md>\n")), []);
});

test('scripts: names in the workflow, and installed spellings through $HOME or .claude/', () => {
  const check = 'named scripts exist';
  expects(check, add('.github/workflows/test.yml', '\n      - run: bash scripts/no-such-step.test.sh\n'), 'test.yml names scripts/no-such-step.test.sh');
  expects(check, add('skills/tdd/SKILL.md', '\nRun `bash "$HOME/.claude/scripts/no-such-home.sh"`.\n'), 'names scripts/no-such-home.sh');
  expects(check, add('skills/tdd/SKILL.md', '\nRun `bash "${HOME}/.claude/scripts/no-such-brace.sh"`.\n'), 'names scripts/no-such-brace.sh');
  expects(check, add('skills/tdd/SKILL.md', '\nRun `bash .claude/scripts/no-such-dot.sh`.\n'), 'names scripts/no-such-dot.sh');
  assert.deepEqual(problems(check, add('skills/tdd/SKILL.md', '\nRun `bash "$HOME/.claude/scripts/ground-truth.sh"`.\n')), []);
});

test('user-only: a quoted true counts as user-only', () => {
  for (const quoted of ['"true"', "'true'"]) {
    expects('user-only skills are listed in the addendum', (tree) => {
      swap('skills/perturb/SKILL.md', 'disable-model-invocation: true', `disable-model-invocation: ${quoted}`)(tree);
      swap('templates/addendum.template.md', '- `/perturb`:', '- perturb:')(tree);
    }, 'does not name /perturb');
  }
});

test('floor: every spelling of a citation, and a list of items', () => {
  const check = 'cited floor items exist';
  expects(check, add('skills/tdd/SKILL.md', '\nSee floor 0.\n'), 'cites floor item 0');
  expects(check, add('skills/tdd/SKILL.md', '\nSee floor-item 0.\n'), 'cites floor item 0');
  expects(check, add('skills/tdd/SKILL.md', '\nSee floor items 3 and 12.\n'), 'cites floor item 12');
  expects(check, add('skills/tdd/SKILL.md', '\nSee floor items 3, 12 and 5.\n'), 'cites floor item 12');
  expects(check, add('skills/tdd/SKILL.md', '\nSee floor items 3 or 12.\n'), 'cites floor item 12');
  expects(check, add('skills/tdd/SKILL.md', '\nSee floor items 3, 5, and 12.\n'), 'cites floor item 12');
  expects(check, add('skills/tdd/SKILL.md', '\nSee the charter floor\nitem 0.\n'), 'cites floor item 0');
  expects(check, add('skills/tdd/SKILL.md', '\nSee floor items\n3 and 12.\n'), 'cites floor item 12');
  assert.deepEqual(problems(check, add('skills/tdd/SKILL.md', '\nSee floor items 3, 5 and 9.\n')), []);
  // Only "floor items" takes a list: a count after one cited item is no citation, nor is a list item after a
  // line that ends in "floor".
  assert.deepEqual(problems(check, add('skills/tdd/SKILL.md', '\nMutants (floor 9, 20 of 20 killed).\nThe practice floor\n12. A list item.\n')), []);
  // A tenth item, in the charter and in setup's list alike, is a floor item like the others.
  assert.deepEqual(problems(check, (tree) => {
    swap('templates/charter.template.md', '\n9. Tests exactly as thick', '\n10. A tenth item.\n9. Tests exactly as thick')(tree);
    swap(SETUP, '\n9. **Test thickness by mutation testing**', '\n10. A tenth item.\n9. **Test thickness by mutation testing**')(tree);
    add('skills/tdd/SKILL.md', '\nSee floor item 10.\n')(tree);
  }), []);
});

test('em dash: in a script and in docs/ too, not only in skills', () => {
  const dash = String.fromCharCode(0x2014);
  expects('no em dash', add('scripts/ground-truth.sh', `\n# a ${dash} b\n`), 'scripts/ground-truth.sh holds an em dash');
  expects('no em dash', add('docs/a-record.md', `a ${dash} b\n`), 'docs/a-record.md holds an em dash');
});

test("numbers: the addendum's cap drifts, and the addendum outgrows it", () => {
  const check = 'repeated numbers agree, and templates fit their caps';
  expects(check, swap(SETUP, 'addendum under\n  about 50', 'addendum under\n  about 40'), 'line cap for the addendum');
  expects(check, add('templates/addendum.template.md', 'one more line\n'.repeat(20)), 'templates/addendum.template.md has');
});

test("names: a setup skill's frontmatter name, too", () => {
  expects('skill names match their folders', swap(SETUP, 'name: setup-config', 'name: setup'), '.claude/skills/setup-config/SKILL.md is named setup');
});

test('move together: a skill that runs a script and is not on the update rule', () => {
  expects('files that run scripts move with scripts/', add('skills/tdd/SKILL.md', '\nRun `bash ~/.claude/scripts/ground-truth.sh`.\n'), 'does not name skills/tdd');
});

test('readTree: an untracked file not ignored is read; an ignored one is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'self-audit-'));
  try {
    execFileSync('git', ['-C', dir, 'init', '-q']);
    writeFileSync(join(dir, '.gitignore'), 'ignored.md\n');
    writeFileSync(join(dir, 'new.md'), 'new\n');
    writeFileSync(join(dir, 'ignored.md'), 'ignored\n');
    const tree = readTree(dir);
    assert.equal(tree.get('new.md'), 'new\n');
    assert.ok(!tree.has('ignored.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
