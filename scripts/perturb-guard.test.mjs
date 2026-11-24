// perturb-guard.test.mjs: prove perturb-guard.mjs can fail. Each refusal row of the spec has a fixture and an
// allowed neighbor beside it, run through the real process with a throwaway HOME, a throwaway repo whose origin
// HEAD names trunk (so a guard that assumes main fails) and a worktree of it, a second repo with no origin, and
// the real commit-scan.sh beside the guard.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, realpathSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'perturb-guard.mjs');
// realpath: macOS's temp folder is a symlink, and git reports the repo's real path.
const T = realpathSync(mkdtempSync(join(tmpdir(), 'perturb-guard-test-')));
after(() => rmSync(T, { recursive: true, force: true }));
const HOME = join(T, 'home-qzx');
const REPO = join(T, 'repo');
const WT = join(T, 'wt');
const OTHER = join(T, 'other');
const TMP = join(T, 'tmp');
mkdirSync(TMP);
const env = { ...process.env, HOME, USERPROFILE: HOME, TMPDIR: TMP, TEMP: TMP, TMP, GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't' };
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
};

mkdirSync(join(HOME, '.claude'), { recursive: true });
writeFileSync(join(HOME, '.claude', 'scan-patterns.local'), 'legal name\tzanzibar\nhome folder\thome-qzx\n');
git(T, 'init', '-q', '--bare', 'origin.git');
git(T, 'init', '-q', 'repo');
git(REPO, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
writeFileSync(join(REPO, 'a.txt'), 'clean\n');
git(REPO, 'add', 'a.txt');
git(REPO, 'commit', '-qm', 'first');
git(REPO, 'remote', 'add', 'origin', join(T, 'origin.git'));
git(REPO, 'push', '-q', 'origin', 'trunk');
git(REPO, 'remote', 'set-head', 'origin', 'trunk');
git(REPO, 'worktree', 'add', '-q', '-b', 'showcase/2026-11-20-x', WT);
git(T, 'init', '-q', 'other');

function run(tool, input, { cwd = REPO, raw, guard = GUARD, extraEnv = {} } = {}) {
  const stdin = raw ?? JSON.stringify({ session_id: 's', cwd, tool_name: tool, tool_input: input });
  const r = spawnSync(process.execPath, [guard], { input: stdin, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  return { code: r.status, err: r.stderr };
}
const bash = (command, opts) => run('Bash', { command }, opts);
const refused = (r, text) => {
  assert.equal(r.code, 2, r.err);
  assert.match(r.err, /^perturb-guard: refused /);
  assert.match(r.err, /Ask the owner; if you approve, run it yourself\.\n$/);
  if (text) assert.ok(r.err.includes(text), r.err);
};
const allowed = (r) => assert.equal(r.code, 0, r.err);
const onFeat = (fn) => {
  git(REPO, 'checkout', '-q', '-b', 'feat');
  try { fn(); } finally { git(REPO, 'checkout', '-q', 'trunk'); git(REPO, 'branch', '-q', '-D', 'feat'); }
};
const C = join(HOME, '.claude');

test('push: feature branch allowed, default branch refused', () => {
  allowed(bash('git push origin feat'));
  allowed(bash('git push -u origin showcase/2026-11-20-x'));
  allowed(bash('git push origin main'));
  refused(bash('git push origin trunk'), 'trunk');
  refused(bash("git push origin 'trunk'"), 'trunk');
  refused(bash('git push origin tr\\unk'), 'trunk');
  refused(bash('git push origin "tr\\\nunk"'), 'trunk');
  refused(bash('git push origin HEAD:trunk'), 'trunk');
  refused(bash('git push origin HEAD:refs/heads/trunk'), 'trunk');
});
test('push with no refspec, HEAD or @: refused on the default branch, allowed off it', () => {
  refused(bash('git push'), 'trunk');
  refused(bash('git push origin HEAD'), 'trunk');
  refused(bash('git push origin @'), 'trunk');
  onFeat(() => {
    allowed(bash('git push'));
    allowed(bash('git push origin'));
    allowed(bash('git push origin HEAD'));
    allowed(bash('git push origin @'));
  });
});
test('force push refused in every spelling; a plain upstream push allowed', () => {
  for (const c of ['git push -f origin feat', 'git push --force origin feat', 'git push -uf origin feat',
    'git push --force-with-lease origin feat', 'git push --force-with-lease=feat origin feat',
    'git push origin +feat']) refused(bash(c), 'force');
  allowed(bash('git push -u origin feat'));
});
test('push: redirections and option values are not refspecs; an unknown option refuses', () => {
  for (const c of ['git push origin 2>&1', 'git push origin 2>/dev/null', 'git push -u origin 2>&1 | tail -5',
    'git push origin &> push.log', 'git push origin >& push.log', 'git push -o ci.skip origin',
    'git push -oci.skip origin', 'git push --push-option ci.skip origin', 'git push --push-option=ci.skip origin',
    'git push --repo origin', 'git push --receive-pack x origin']) refused(bash(c), 'trunk');
  allowed(bash('git push -o ci.skip origin feat 2>&1'));
  refused(bash('git push --frobnicate origin feat'), 'does not know');
  refused(bash('git push -uz origin feat'), 'does not know');
  onFeat(() => refused(bash('git push -oci.skip origin trunk'), 'trunk'));
});
test('--all, --mirror and glob refspecs refused, even off the default branch', () => {
  onFeat(() => {
    refused(bash('git push --all origin'), '--all');
    refused(bash('git push --mirror origin'), '--mirror');
    refused(bash("git push origin 'refs/heads/*:refs/heads/*'"), 'glob');
  });
});
test('remote branch deletion: showcase allowed, others refused', () => {
  allowed(bash('git push origin --delete showcase/2026-11-01-old'));
  allowed(bash('git push origin :showcase/2026-11-01-old'));
  refused(bash('git push origin --delete feature/x'), 'feature/x');
  refused(bash('git push origin -d feature/x'), 'feature/x');
  refused(bash('git push origin :feature/x'), 'feature/x');
  refused(bash('git push origin --delete showcaseold'), 'showcaseold');
});
test('git -C and cd reach the right repo; a repo with no origin HEAD falls back to main', () => {
  allowed(bash('git push origin trunk', { cwd: OTHER }));
  refused(bash('git push origin main', { cwd: OTHER }), 'main');
  refused(bash(`git -C "${REPO}" push origin trunk`, { cwd: OTHER }), 'trunk');
  refused(bash(`cd "${REPO}" && git push origin trunk`, { cwd: OTHER }), 'trunk');
  refused(bash(`cd -- "${REPO}" && git push origin trunk`, { cwd: OTHER }), 'trunk');
  refused(bash(`cd -@ "${OTHER}"; git push origin trunk`), 'trunk');
  refused(bash(`cd "${OTHER}" extra; git push origin trunk`), 'trunk');
  allowed(bash(`git -C "${REPO}" push origin feat`, { cwd: OTHER }));
  refused(bash('git -c core.x=y push origin trunk'), 'trunk');
  refused(bash('git --no-pager push origin trunk'), 'trunk');
});
test('push or commit where git cannot answer refused', () => {
  const nowhere = join(T, 'no-such-folder');
  refused(bash('git push origin feat', { cwd: nowhere }), 'cannot answer');
  refused(bash(`cd "${nowhere}" && git push origin feat`, { cwd: T }), 'cannot answer');
  refused(bash(`git -C "${nowhere}" commit -m clean`), 'cannot answer');
});
test('prefixes, wrappers and env assignments before git are skipped', () => {
  for (const c of ['MSYS_NO_PATHCONV=1 git push origin trunk', '(git push origin trunk)',
    '{ git push origin trunk; }', 'if git push origin trunk; then :; fi', 'if true; then git push origin trunk; fi',
    'if false; then :; elif git push origin trunk; then :; fi', 'if false; then :; else git push origin trunk; fi',
    'while git push origin trunk; do :; done', 'until git push origin trunk; do :; done',
    'for x in 1; do git push origin trunk; done', '! git push origin trunk', 'time git push origin trunk',
    'env X=1 git push origin trunk', 'env -i git push origin trunk', 'env -u X git push origin trunk',
    'env -C . git push origin trunk',
    'command git push origin trunk', 'nohup git push origin trunk', 'exec git push origin trunk',
    'timeout 60 git push origin trunk', 'timeout -k 5 60 git push origin trunk', 'nice -n 5 git push origin trunk',
    'sudo -u x git push origin trunk', 'git \\\n  push origin trunk']) {
    refused(bash(c), 'git push');
  }
});
test('comments and heredoc bodies are skipped; a quote left open refuses', () => {
  refused(bash("# don't forget the tests\ngit push origin trunk"), 'trunk');
  refused(bash("# it's ready\ngit push --force origin feat"), 'force');
  refused(bash("echo ok # that's all\ngh pr merge 3"), 'gh pr merge');
  refused(bash("cat > n.txt <<'EOF'\nthe owner's note\nEOF\nrm -rf ~/.claude"), 'protected');
  refused(bash('cat > n.txt <<EOF\nthe owner\'s note\nEOF\nrm -rf ~/.claude'), 'protected');
  refused(bash('cat > n.txt <<-"EOF"\n\tthe owner\'s note\n\tEOF\nrm -rf ~/.claude'), 'protected');
  refused(bash("cat > n.txt <<'EOF'\nbody\nEOF\necho a\nrm -rf ~/.claude"), 'protected');
  refused(bash('echo a\ngit push origin trunk'), 'git push');
  refused(bash('echo a#b; git push origin trunk'), 'git push');
  refused(bash('echo "it is open'), 'quote left open');
  allowed(bash("# don't forget the tests\ngit push origin feat"));
  allowed(bash("cat > n.txt <<'EOF'\nthe owner's note\nEOF\nrm -rf build"));
  allowed(bash("cat > n.md <<'EOF'\ngit push origin trunk\nEOF"));
  allowed(bash("cat > n.md <<'EOF'\nEOFX\nrm -rf ~/.claude\nEOF"));
  allowed(bash('cat > n.md <<EOF\n\tEOF\nrm -rf ~/.claude\nEOF'));
  allowed(bash("echo ok # that's all\ngh pr create --fill"));
});
test('$((...)) starts no heredoc; the commands inside a substitution, quoted or not, are parsed', () => {
  refused(bash('x=$((1<<4))\ngit push origin trunk'), 'git push');
  refused(bash('echo $((1<<2))\nrm -rf ~/.claude'), 'protected');
  refused(bash('echo "$(rm -rf ~/.claude)"'), 'protected');
  refused(bash('echo `rm -rf ~/.claude`'), 'protected');
  refused(bash('diff <(rm -rf ~/.claude) a.txt'), 'protected');
  refused(bash('echo "$( (cd /tmp); rm -rf ~/.claude )"'), 'protected');
  refused(bash('echo "$(cat <<\'EOF\'\n"\nEOF\n)"; rm -rf ~/.claude #"'), 'protected');
  refused(bash('echo "$(date'), 'substitution left open');
  allowed(bash('echo $((1 << 4))'));
  allowed(bash('x=$((1<<4)); echo $x'));
  allowed(bash('echo "$(git rev-parse HEAD) `date`"'));
});
test('gh pr merge refused, with or without a repo flag; gh pr create allowed', () => {
  refused(bash('gh pr merge 12 --squash'), 'gh pr merge');
  refused(bash('gh -R o/r pr merge 3'), 'gh pr merge');
  refused(bash('gh --repo=o/r pr merge 3'), 'gh pr merge');
  refused(bash('gh --repo o/r pr merge 3'), 'gh pr merge');
  allowed(bash('gh pr create --draft --title x --body y'));
  allowed(bash('gh browse merge'));
});
test('commit: scan clean allowed, scan hit refused (tracked file and every message spelling)', () => {
  allowed(bash('git commit -m "a clean message"'));
  for (const c of ['git commit -m "signed zanzibar"', 'git commit -am "signed zanzibar"',
    'git commit --message "signed zanzibar"', 'git commit --message="signed zanzibar"', 'git commit -mzanzibar',
    'git commit --mess "signed zanzibar"',
    'git commit -m "subject" -m "body zan""zibar"',
    'git commit -m "$(cat <<\'EOF\'\nsubject\n\nsay "quoted words" then zanzibar\nEOF\n)"']) {
    refused(bash(c), 'zanzibar');
  }
  allowed(bash('git commit -m "$(cat <<\'EOF\'\nQuote handling\n\nTreat "don\'t" as one word.\nEOF\n)"'));
  allowed(bash('git commit -m "$(cat <<\'EOF\'\nRulers\n\nA 12" ruler.\nEOF\n)"'));
  writeFileSync(join(T, 'msg.txt'), 'subject\n\nzanzibar\n');
  for (const f of ['-F', '--file', '--fil', '-aF']) refused(bash(`git commit ${f} "${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit --file="${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit --fil="${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit -F"${join(T, 'msg.txt')}"`), 'zanzibar');
  refused(bash(`git commit -F "${join(T, 'no-msg.txt')}"`), 'no message file');
  writeFileSync(join(T, 'rel-msg.txt'), 'subject\n\nclean\n');
  writeFileSync(join(REPO, 'rel-msg.txt'), 'subject\n\nzanzibar\n');
  refused(bash(`git -C "${REPO}" commit -F rel-msg.txt`, { cwd: T }), 'zanzibar');
  rmSync(join(REPO, 'rel-msg.txt'));
  writeFileSync(join(HOME, 'clean-msg.txt'), 'subject\n\nclean\n');
  allowed(bash(`git commit -F "${join(HOME, 'clean-msg.txt')}"`));
  writeFileSync(join(REPO, 'b.txt'), 'zanzibar\n');
  git(REPO, 'add', 'b.txt');
  refused(bash('git commit -m clean'), 'zanzibar');
  git(REPO, 'rm', '-q', '--cached', 'b.txt');
  rmSync(join(REPO, 'b.txt'));
  assert.deepEqual(readdirSync(TMP), []);
});
test('commit or push after another command in the same call refused; after cd allowed', () => {
  writeFileSync(join(REPO, 'new.txt'), 'zanzibar\n');
  refused(bash('git add new.txt && git commit -m "add new"'), 'stage in one call');
  rmSync(join(REPO, 'new.txt'));
  refused(bash('echo x >> a.txt && git commit -am edit'), 'stage in one call');
  refused(bash('git commit -m clean && git push origin feat'), 'stage in one call');
  for (const c of ['git commit -m x $(git add new.txt)', 'git commit -m x "$(git add new.txt)"',
    'git commit -m x `git add new.txt`', 'git commit -m x <(git add new.txt)', 'git commit -m "$(printf \'za%s\' nzibar)"',
    'git commit -m "$(cat <<EOF\nsubject\nEOF\n)"']) refused(bash(c), 'stage in one call');
  // A heredoc read that also does anything else, here a redirection, is a command like any other.
  refused(bash('git commit -m "$(cat <<\'EOF\' 2>/dev/null\nsubject\nEOF\n)"'), 'after another command');
  // Only cat reading the heredoc, inside a substitution, is exempt.
  refused(bash('git commit -m "$(sh <<\'EOF\'\ngit add b.txt\nEOF\n)"'), 'after another command');
  refused(bash('cat <<\'EOF\'\nnote\nEOF\ngit commit -m x'), 'after another command');
  // A cd bash throws away (in a substitution, in parentheses, or not ended by &&, ; or a newline) moves nothing
  // and is a command before the commit or push.
  writeFileSync(join(REPO, 'b.txt'), 'zanzibar\n');
  git(REPO, 'add', 'b.txt');
  try {
    refused(bash(`git commit -m "fix $(cd "${WT}")"`), 'after another command');
    refused(bash(`git commit -m "fix $(cd "${WT}";)"`), 'after another command');
  } finally { git(REPO, 'rm', '-q', '--cached', 'b.txt'); rmSync(join(REPO, 'b.txt')); }
  for (const c of [`git push origin trunk $(cd "${OTHER}")`, `(cd "${OTHER}"); git push origin trunk`,
    `(cd "${OTHER}";); git push origin trunk`,
    `cd "${OTHER}" | git push origin trunk`, `cd "${OTHER}" |& git push origin trunk`, `cd "${OTHER}" & git commit -m x`,
    `cd "${OTHER}" || git push origin trunk`]) refused(bash(c), 'after another command');
  allowed(bash(`cd "${REPO}" && git commit -m clean`, { cwd: OTHER }));
  allowed(bash(`cd "${REPO}" && git push origin feat`, { cwd: OTHER }));
  allowed(bash(`cd "${REPO}"; git push origin feat`, { cwd: OTHER }));
  allowed(bash(`cd "${REPO}"\ngit push origin feat`, { cwd: OTHER }));
});
test('commit: a message from stdin refused', () => {
  refused(bash('git commit -F -'), 'stdin');
  refused(bash('git commit -F-'), 'stdin');
  refused(bash('git commit --file=-'), 'stdin');
  refused(bash('git commit --fil=-'), 'stdin');
  refused(bash('git commit -F /dev/stdin'), 'a message from stdin');
});
test('commit: any nonzero scan exit refuses, not only 1', () => {
  const lone = join(T, 'lone');
  mkdirSync(lone, { recursive: true });
  copyFileSync(GUARD, join(lone, 'perturb-guard.mjs'));
  refused(bash('git commit -m clean', { guard: join(lone, 'perturb-guard.mjs') }), 'commit-scan.sh exited 127');
});
test('commit: a scan that does not finish in time refuses', () => {
  const slow = join(T, 'slow');
  mkdirSync(slow, { recursive: true });
  copyFileSync(GUARD, join(slow, 'perturb-guard.mjs'));
  writeFileSync(join(slow, 'commit-scan.sh'), 'sleep 3\n');
  refused(bash('git commit -m clean', { guard: join(slow, 'perturb-guard.mjs'), extraEnv: { PERTURB_SCAN_TIMEOUT_MS: '500' } }),
    'did not finish');
});
test('Edit and Write: repo files allowed, protected paths refused in every spelling', () => {
  allowed(run('Edit', { file_path: join(REPO, 'scripts', 'x.sh') }));
  allowed(run('Write', { file_path: join(C, 'LEDGER.md') }));
  allowed(run('Write', { file_path: join(C, 'COSTS.md') }));
  allowed(run('Write', { file_path: join(C, 'scripts-old', 'a.sh') }));
  allowed(run('Write', { file_path: join(C, 'skills', 'perturb-notes', 'a.md') }));
  refused(run('Edit', { file_path: join(C, 'scripts', 'ground-truth.sh') }), 'protected');
  refused(run('MultiEdit', { file_path: join(C, 'settings.json'), edits: [] }), 'protected');
  refused(run('Write', { file_path: join(C, 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(C, 'CLAUDE.md') }), 'protected');
  refused(run('Write', { file_path: join(C, 'scan-patterns.local') }), 'protected');
  refused(run('Edit', { file_path: join(C, 'skills', 'perturb', 'SKILL.md') }), 'protected');
  refused(run('Edit', { file_path: `${C}/skills/other/../perturb/SKILL.md` }), 'protected');
  refused(run('Edit', { file_path: `${C}\\scripts\\a.sh` }), 'protected');
  refused(run('Write', { file_path: '~/.claude/settings.local.json' }), 'protected');
  refused(run('NotebookEdit', { notebook_path: join(C, 'scripts', 'n.ipynb') }), 'protected');
  refused(run('Write', { file_path: join(REPO, '.claude', 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(REPO, '.claude', 'settings.local.json') }), 'protected');
  refused(run('Write', { file_path: join(WT, '.claude', 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(REPO, '.claude', 'settings.local.json') }, { cwd: WT }), 'protected');
  allowed(run('Write', { file_path: join(REPO, '.claude', 'skills', 'x.md') }));
  // A link to the config folder is another spelling of it.
  symlinkSync(C, join(T, 'link-c'), 'junction');
  refused(run('Write', { file_path: join(T, 'link-c', 'settings.json') }), 'protected');
  refused(bash(`rm -f "${join(T, 'link-c', 'CLAUDE.md')}"`), 'protected');
  allowed(run('Write', { file_path: join(T, 'link-c', 'LEDGER.md') }));
});
test('Windows spellings: /c/ form and other case refused', { skip: process.platform !== 'win32' }, (t) => {
  const slash = C.replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/');
  refused(run('Write', { file_path: `${slash}/settings.json` }), 'protected');
  refused(run('Write', { file_path: join(C.toUpperCase(), 'SETTINGS.JSON') }), 'protected');
  const [drive, ...parts] = C.split(/[\\/]/);
  refused(bash(`cd /${drive[0].toLowerCase()} && rm -rf ${parts.join('/')}`), 'protected');
  allowed(bash(`cd /${drive[0].toLowerCase()} && rm -rf ${parts.join('/')}-not`));
  // The raw command is scanned with the home folder read as ~, in its /c/ form and in other case too.
  writeFileSync(join(HOME, 'clean-msg.txt'), 'subject\n\nclean\n');
  allowed(bash(`git commit -F "${slash.replace(/\/\.claude$/, '')}/clean-msg.txt"`));
  allowed(bash(`git commit -F "${HOME.toUpperCase()}\\clean-msg.txt"`));
  // The 8.3 short spelling, where the disk makes one: asked short with HOME long, and asked long with HOME short.
  const r = spawnSync('cmd', ['/d', '/s', '/c', `"for %I in ("${C}") do @echo %~sI"`], { encoding: 'utf8', windowsVerbatimArguments: true });
  assert.equal(r.status, 0, r.stderr);
  const shortC = r.stdout.trim();
  if (shortC.toLowerCase() === C.toLowerCase()) {
    t.diagnostic('no 8.3 short name on this disk: the short-spelling assertions did not run');
    return;
  }
  const shortHome = { extraEnv: { HOME: dirname(shortC), USERPROFILE: dirname(shortC) } };
  refused(run('Write', { file_path: join(shortC, 'settings.json') }), 'protected');
  refused(run('Write', { file_path: join(C, 'settings.json') }, shortHome), 'protected');
});
test('Bash writes and removals in protected paths refused; the same elsewhere allowed', () => {
  refused(bash(`echo x > "${join(C, 'settings.json')}"`), 'protected');
  refused(bash(`echo x > "${C}\\settings.json"`), 'protected');
  refused(bash('echo x >> ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x >~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x 2> ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x &> ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x >& ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x >| ~/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x > $HOME/.claude/CLAUDE.md'), 'protected');
  // cd's options and -- are not its folder.
  refused(bash(`cd -P "${C}" && rm CLAUDE.md`), 'protected');
  refused(bash(`cd -L -P "${C}"; echo x > CLAUDE.md`), 'protected');
  refused(bash(`cd -Pe "${C}" && rm CLAUDE.md`), 'protected');
  refused(bash(`cd -- "${C}" && rm CLAUDE.md`), 'protected');
  // A cd bash refuses moves nowhere, so the next command after ; runs in the old folder.
  refused(bash(`cd -@ "${OTHER}"; rm CLAUDE.md`, { cwd: C }), 'protected');
  refused(bash(`cd "${join(T, 'no-such-folder')}"; rm CLAUDE.md`, { cwd: C }), 'protected');
  refused(bash(`cd "${OTHER}" extra; rm CLAUDE.md`, { cwd: C }), 'protected');
  refused(bash(`cd "${join(C, 'scan-patterns.local')}"\nrm CLAUDE.md`, { cwd: C }), 'protected');
  allowed(bash(`cd "${OTHER}"; rm CLAUDE.md`, { cwd: C }));
  refused(bash(`builtin cd "${C}" && rm CLAUDE.md`), 'protected');
  allowed(bash(`cd -P "${OTHER}" && rm CLAUDE.md`));
  // After an invalid option bash moves nowhere, so the folder stays.
  refused(bash(`cd -x "${OTHER}"; rm CLAUDE.md`, { cwd: C }), 'protected');
  // Even when a folder of that name exists.
  mkdirSync(join(C, '-x'));
  try { refused(bash('cd -x; rm CLAUDE.md', { cwd: C }), 'protected'); } finally { rmSync(join(C, '-x'), { recursive: true }); }
  refused(bash('echo x > ${HOME}/.claude/CLAUDE.md'), 'protected');
  refused(bash('echo x | tee ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('cp a.txt ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('mv a.txt ~/.claude/scripts/a.sh'), 'protected');
  refused(bash('cp settings.json ~/.claude/'), 'protected');
  refused(bash('mv CLAUDE.md ~/.claude'), 'protected');
  refused(bash('cp -r perturb/ ~/.claude/skills/'), 'protected');
  refused(bash('cp -t ~/.claude settings.json'), 'protected');
  refused(bash('cp --target-directory=~/.claude settings.json'), 'protected');
  refused(bash(`cp -t"${C}" settings.json`), 'protected');
  refused(bash('cp -r skills ~/.claude/'), 'protected');
  refused(bash('cp -a skills ~/.claude'), 'protected');
  refused(bash('cp -r . ~/.claude/'), 'protected');
  refused(bash('sed -i.bak s/a/b/ ~/.claude/PERSONAL-ADDENDUM.md'), 'protected');
  refused(bash('sed --in-place s/a/b/ ~/.claude/PERSONAL-ADDENDUM.md'), 'protected');
  refused(bash('rm ~/.claude/scripts/perturb-guard.mjs'), 'protected');
  refused(bash('rm -rf ~/.claude'), 'protected');
  refused(bash('rm -rf /'), 'protected');
  refused(bash('rm -rf /*'), 'protected');
  refused(bash('rm -rf ~/.claude/*'), 'protected');
  refused(bash('rm ~/.claude/settings*.json'), 'protected');
  refused(bash('rm -rf ~/.cl*'), 'protected');
  refused(bash('rm -rf ~/.claude/scripts/*'), 'protected');
  refused(bash(`mv ~/.claude/CLAUDE.md "${join(T, 'x')}"`), 'protected');
  // A home whose .claude is a link to config kept elsewhere: removing the home removes what the link names.
  const HOME2 = join(T, 'home2'), DOT = join(T, 'dotfiles', 'claude');
  mkdirSync(DOT, { recursive: true });
  writeFileSync(join(DOT, 'settings.json'), '{}');
  mkdirSync(HOME2);
  symlinkSync(DOT, join(HOME2, '.claude'), 'junction');
  const home2 = { extraEnv: { HOME: HOME2, USERPROFILE: HOME2 } };
  refused(bash(`rm -rf "${HOME2}"`, home2), 'protected');
  refused(bash(`rm -rf ${HOME2.replace(/\\/g, '/')}/.c*`, home2), 'protected');
  allowed(bash(`echo x > "${join(T, 'free.txt')}"`));
  allowed(bash('echo x 2>&1'));
  allowed(bash('cp a.txt b.txt'));
  allowed(bash('cp a.txt ~/.claude/notes/'));
  allowed(bash('cp -r notes ~/.claude/'));
  allowed(bash('cp -a skills ~/.claude/notes'));
  allowed(bash('mv b.txt c.txt'));
  allowed(bash('rm c.txt ~/.claude/other.txt'));
  allowed(bash('rm -f *.log ~/.claude/*.bak'));
  allowed(bash('rm -f *'));
  allowed(bash('cat ~/.claude/settings.json'));
});
test('a cd moves the folder only after cds that moved; any other cd adds its folder to those checked', () => {
  const missing = join(T, 'no-such-folder');
  mkdirSync(join(C, 'cd-sub'));
  mkdirSync(join(REPO, 'sub'));
  try {
    // A relative operand names a folder under the one the cd runs in.
    refused(bash('cd cd-sub; rm ../CLAUDE.md', { cwd: C }), 'protected');
    // After && too, a cd to a folder that does not exist moves nothing.
    refused(bash(`cd "${missing}" && true; rm CLAUDE.md`, { cwd: C }), 'protected');
    allowed(bash(`cd "${OTHER}" && true; rm CLAUDE.md`, { cwd: C }));
    // Ended by ||, in parentheses or a substitution, or after another command, bash may or may not have moved.
    refused(bash(`cd "${C}" || exit; rm CLAUDE.md`), 'protected');
    refused(bash(`cd "${C}" || exit; echo x > settings.json`), 'protected');
    refused(bash(`cd "${C}" || exit; cp -r skills .`), 'protected');
    refused(bash(`cd "${OTHER}" || exit; rm CLAUDE.md`, { cwd: C }), 'protected');
    allowed(bash(`cd "${OTHER}" || exit; rm CLAUDE.md`));
    refused(bash(`(cd "${C}" && rm CLAUDE.md)`), 'protected');
    refused(bash(`echo "$(cd "${C}"; rm CLAUDE.md)"`), 'protected');
    allowed(bash(`(cd "${OTHER}" && rm CLAUDE.md)`));
    for (const c of [`true | cd "${OTHER}"; rm CLAUDE.md`, `false && cd "${OTHER}"; rm CLAUDE.md`,
      `true || cd "${OTHER}"; rm CLAUDE.md`, `if false; then cd "${OTHER}"; fi; rm CLAUDE.md`,
      `cd "${missing}" && cd "${OTHER}"; rm CLAUDE.md`, `(cd "${OTHER}") || cd "${REPO}"; rm CLAUDE.md`]) {
      refused(bash(c, { cwd: C }), 'protected');
    }
    // A cd behind a reserved word may not run: in a body, or after a negated condition.
    refused(bash(`if ! cd "${C}"; then cd "${OTHER}"; fi; rm CLAUDE.md`, { cwd: OTHER }), 'protected');
    allowed(bash(`{ cd "${OTHER}"; }; rm CLAUDE.md`, { cwd: C }));
    // A cd run by nohup, env, nice or timeout is a program of its own: bash stays, and it is another command.
    refused(bash(`nohup cd "${OTHER}"; rm CLAUDE.md`, { cwd: C }), 'protected');
    refused(bash(`nohup cd "${REPO}"; git push origin feat`, { cwd: OTHER }), 'after another command');
    for (const w of ['command', 'time']) allowed(bash(`${w} cd "${OTHER}"; rm CLAUDE.md`, { cwd: C }));
    // A cd ended by | or & runs in a shell bash throws away.
    allowed(bash(`cd "${C}" | true; rm CLAUDE.md`));
    allowed(bash(`cd "${C}" & rm CLAUDE.md`));
    // A push or commit goes ahead only where the guard knows its one folder.
    allowed(bash(`cd "${REPO}" && cd sub && cd .. && git push origin feat`, { cwd: OTHER }));
    refused(bash(`cd "${missing}" && cd "${REPO}" && git push origin feat`, { cwd: OTHER }), 'cannot place');
  } finally {
    rmSync(join(C, 'cd-sub'), { recursive: true });
    rmSync(join(REPO, 'sub'), { recursive: true });
  }
});
test('only the safe tools pass: Agent, Workflow, the other shells, auto-merge, session tools and the rest refused', () => {
  for (const t of ['Agent', 'Task', 'Workflow', 'PowerShell', 'Monitor', 'mcp__terminal__run_in_terminal',
    'mcp__ccd_pr__set_auto_merge', 'mcp__ccd_session__start_session', 'mcp__ccd_session__hand_off_to_session',
    'mcp__scheduled-tasks__create_scheduled_task', 'SomeNewTool']) {
    refused(run(t, { prompt: 'x' }), t);
  }
  refused(run('Skill', { skill: 'build' }), 'build');
  allowed(run('Skill', { skill: 'frames' }));
  allowed(run('Read', { file_path: join(C, 'settings.json') }));
  for (const t of ['Grep', 'Glob', 'TodoWrite', 'AskUserQuestion', 'ToolSearch', 'WebSearch', 'WebFetch',
    'mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up']) {
    allowed(run(t, { pattern: 'x' }));
  }
});
test('browser: navigate, read, resize and screenshots pass; clicks, typing, scripts and preview_start refused', () => {
  const B = 'mcp__Claude_Browser__';
  for (const t of ['navigate', 'read_page', 'get_page_text', 'find', 'resize_window', 'tabs_context']) {
    allowed(run(B + t, { url: 'http://localhost:8080', preset: 'mobile' }));
  }
  allowed(run(`${B}computer`, { action: 'screenshot' }));
  allowed(run(`${B}computer`, { action: 'zoom', region: [0, 0, 10, 10] }));
  refused(run(`${B}computer`, { action: 'left_click', coordinate: [1, 1] }), 'left_click');
  refused(run(`${B}computer`, { action: 'type', text: 'x' }), 'type');
  for (const t of ['javascript_tool', 'form_input', 'preview_start', 'tabs_create']) refused(run(B + t, { text: 'x' }), B + t);
});
test('fails closed: malformed JSON, missing fields, a bad input shape', () => {
  for (const r of [run('Bash', {}, { raw: '{not json' }), run('Bash', {}, { raw: '{}' }),
    run('Bash', { nocommand: 1 }), run('Edit', {}),
    run('Read', {}, { raw: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x' } }) }),
    run('Read', {}, { raw: JSON.stringify({ cwd: REPO, tool_input: { file_path: 'x' } }) }),
    run('Read', {}, { raw: JSON.stringify({ cwd: REPO, tool_name: 'Read', tool_input: 'x' }) }),
    run('Read', {}, { raw: JSON.stringify({ cwd: REPO, tool_name: 'Read', tool_input: null }) })]) {
    assert.equal(r.code, 2, r.err);
    assert.match(r.err, /^perturb-guard: refusing, the guard could not decide \(/);
  }
});
