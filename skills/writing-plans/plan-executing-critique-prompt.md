# Plan executing-critique prompt

The document critique reads; this one builds. Dispatch it after the plan is written and self-reviewed, before the
plan is handed to the owner for `/build`. Run it on the strongest model
available at high effort; it is the last check before code is written at scale.

**Purpose:** execute the plan's early tasks verbatim in a throwaway tree,
compare the result with the spec's intent, and report what the plan gets
wrong, omits, or silently changes, returning what it took to make the tasks
run as a patch the fold copies from.

**Hard rules for the subagent:** read-only on the repo. All work happens in a
throwaway git tree of the base commit under the scratchpad (`git worktree
add` on a throwaway branch, or an export with `git init`), deleted at the end
once its patch is saved. Dependencies (`node_modules`, a Python virtual
environment) may be linked or reused from the real checkout; nothing is
installed.
Stop any server the probe started by its own process or task id, never by
program name.

```
Subagent (general-purpose, strongest model, effort high):
  description: "Executing critique of <plan>"
  prompt: |
    You are reviewing an implementation plan before it is executed. Do a
    hard, adversarial critique. Do not edit any tracked file.

    Plan: <PLAN_PATH or git show <ref>:<path>>
    Spec it implements: <SPEC_PATH>, sections <...>
    Base commit the plan assumes: <ref>
    Repo rules: read CLAUDE.md first.
    Worked examples of past findings: <path to executing-critique-examples.md>
    Last critiqued commit: <sha, or "none" for a first critique>
    Patch folder: <a new folder beside the plan, outside the repo if the
    plan lives outside it>

    **Revision first.** When the target revises something already
    critiqued, read `git diff <last critiqued commit>..HEAD` and the
    rulings folded since. Report what the revision broke (a ruling
    contradicted, an unchanged passage now false, a requirement dropped
    without a ruling) before any new finding.

    Method, in this order:
    1. Read the plan and the spec sections it cites. List every claim the
       plan makes about the repo (counts, paths, flags, imports, what a
       command serves). Verify each against the actual files; cite
       path:line. Mark CONFIRMED or PLAUSIBLE.
    2. In a throwaway git tree of the base commit, apply the plan's first
       N tasks exactly as written, with the plan's own commands. Commit
       each task alone as `T<n> as written`, its body the failure message
       the red step showed. When a task cannot proceed, make the smallest
       fix that unblocks the next task and commit it alone as
       `F<k>: <the finding, one line>`, the finding in the body; label it
       mechanical or needs-ruling. A needs-ruling fix stops every task
       that depends on it: report those as not executed, never proceed on
       an assumption. Nothing else changes; no improvements. Run
       everything the plan's verify steps name, plus build, typecheck,
       unit tests, and any dev or preview server the change touches.
       Record what differs from the plan's expectations.
    3. Compare the built result with the spec's intent, not only with the
       plan's checks: what changed at runtime that nothing asserts
       (ordering, cascade, bundling, polyfills, targets, sizes, URLs that
       stop existing, timing)? What does the spec require that no task
       delivers? What does a task do that the spec forbids?
    4. Check task ordering and atomicity: is the tree green at each task
       boundary the plan claims; are parallel edges real; is any rename
       pure.
    5. Check the plan's verify commands themselves: run each; does it
       reach the expected value, or is it unreachable as written?
    6. Note scope creep and undeclared dependencies.
    7. Save the patch before deleting the tree: `git format-patch -o
       <patch folder> <base>..HEAD`, every commit (a path outside the
       plan's **Files** lists is a finding that amends them), plus your
       probe scripts. Run the tripwire `git log --format=%s <base>..HEAD |
       grep -Ev '^(T[0-9]+ as written|F[0-9]+: )'`: each line it prints is
       a finding (it cannot see a fix hidden inside a T commit). Grep the
       patch files, bodies included, for any names the repo's CLAUDE.md
       keeps out of tracked files, absolute home paths and secrets before
       you leave them. On a moved base the patch applies with
       `git am --3way`; on a conflict, `git am --abort`.

    Report in plain markdown. First lines: `Read: <sha>`, the commit you
    critiqued; the base sha; the OS and runtime version; the hash of the
    lockfile or environment file behind the dependencies you ran; tasks
    executed out of the plan's total. Never call a task validated: say
    what ran, where ("executed verbatim at <base sha>"). Then: findings
    ranked by severity, each with path:line citations and
    CONFIRMED/PLAUSIBLE, each fix finding naming its F commit and label;
    then a numbered list of concrete edits to the plan; then the patch
    folder and the tripwire's output; then the scratch artefacts you left
    and the servers you stopped. No file writes in the repo.
```

**After the report:** the plan author folds the findings into a revision,
copying each mechanical fix from the patch into the plan's code blocks
(judging the label, merging by hand where a block is a fragment);
needs-ruling fixes enter only after the owner rules. The fold is committed on
its own with the patch folder, staged by path, never `git add -A` (a synced
folder can hold conflict files), so the next critique's revision check diffs
exactly this round. The fold summary for the owner lists only behaviour changes
and the rulings needed; mechanical fixes go in the fold commit's body.
Record any new rulings the findings force, and hand the revised plan to
the owner with the critique attached. Findings that change behaviour or need a
decision are raised to the owner directly, never resolved by assumption.
