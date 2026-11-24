#!/usr/bin/env bash
#
# perturb-hook.test.sh: check skills/perturb/SKILL.md's frontmatter and run its hook command exactly as written,
# with a throwaway HOME holding the scripts where setup installs them: the hooks block is the one below, word for
# word (every tool reaches the guard); the guard's scan timeout is under the hook's; the skill is user-only; node
# hidden from PATH refuses (exit 2); the guard script missing refuses; an allowed call passes. Exit 0 = every check
# passed.
#
# Usage: bash scripts/perturb-hook.test.sh

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$HERE/../skills/perturb/SKILL.md"
T=$(mktemp -d "${TMPDIR:-/tmp}/perturb-hook-test.XXXXXX") || exit 1
trap 'rm -rf "$T"' EXIT
export HOME="$T/home" USERPROFILE="$T/home"
mkdir -p "$HOME/.claude/scripts"
cp "$HERE/perturb-guard.mjs" "$HERE/commit-scan.sh" "$HOME/.claude/scripts/"

failures=0 skipped=0
check() { # <what> <command...>
  if "${@:2}"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
has() { grep -qF -- "$2" "$1"; } # <file> <text>

EXPECTED=$(cat <<'EOF'
hooks:
  PreToolUse:
    - matcher: ".*"
      hooks:
        - type: command
          shell: bash
          command: "command -v node >/dev/null || { echo 'perturb-guard: node not found, refusing' >&2; exit 2; }; node ~/.claude/scripts/perturb-guard.mjs || exit 2"
          timeout: 30
EOF
)
# The frontmatter from its hooks: line to its closing ---.
block=$(awk 'NR == 1 && $0 == "---" { fm = 1; next } fm && $0 == "---" { exit } fm && /^hooks:/ { on = 1 } on { print }' "$SKILL" 2>/dev/null)
check "the frontmatter hooks block, word for word" [ "$block" = "$EXPECTED" ]
fm=$(awk 'NR == 1 && $0 == "---" { fm = 1; next } fm && $0 == "---" { exit } fm { print }' "$SKILL" 2>/dev/null)
check "user-only: disable-model-invocation: true" grep -qx 'disable-model-invocation: true' <<<"$fm"
cmd=$(printf '%s\n' "$block" | sed -n 's/^ *command: "\(.*\)"$/\1/p' | sed 's/\\"/"/g')
# The guard's scan timeout (ms) under the hook's (s), so a slow scan is refused by the guard, not cut off.
hook_s=$(printf '%s\n' "$block" | sed -n 's/^ *timeout: \([0-9][0-9]*\)$/\1/p')
scan_ms=$(sed -n 's/.*PERTURB_SCAN_TIMEOUT_MS) || \([0-9][0-9]*\);$/\1/p' "$HERE/perturb-guard.mjs")
under() { [ -n "$1" ] && [ -n "$2" ] && [ "$2" -lt $(($1 * 1000)) ]; } # <hook s> <scan ms>
check "the scan timeout is under the hook timeout" under "$hook_s" "$scan_ms"

# PATH with every folder that holds node left out; empty when that also leaves out bash.
path_without_node() {
  local d p=""
  while IFS= read -r d; do
    [ -x "$d/node" ] || [ -x "$d/node.exe" ] || p="$p$d:"
  done < <(printf '%s\n' "$PATH" | tr ':' '\n')
  p=${p%:}
  PATH="$p" command -v bash >/dev/null 2>&1 && printf '%s' "$p"
}
BASH_BIN=$(command -v bash)
nonode=$(path_without_node)
if [ -n "$nonode" ]; then
  echo '{}' | PATH="$nonode" "$BASH_BIN" -c "$cmd" >"$T/out" 2>&1; code=$?
  check "node missing: exit 2" [ "$code" = 2 ]
  check "node missing: says so" has "$T/out" "perturb-guard: node not found, refusing"
else
  echo "skip  node missing: no PATH leaves out node and keeps bash"
  skipped=$((skipped + 1))
fi

printf '{"session_id":"s","cwd":"%s","tool_name":"Read","tool_input":{"file_path":"x"}}' "$T" |
  "$BASH_BIN" -c "$cmd" >"$T/out" 2>&1; code=$?
check "an allowed call: exit 0" [ "$code" = 0 ]

mv "$HOME/.claude/scripts/perturb-guard.mjs" "$T/saved.mjs"
printf '{"session_id":"s","cwd":"%s","tool_name":"Read","tool_input":{"file_path":"x"}}' "$T" |
  "$BASH_BIN" -c "$cmd" >"$T/out" 2>&1; code=$?
check "guard script missing: exit 2" [ "$code" = 2 ]

echo
if [ "$failures" -gt 0 ]; then echo "perturb-hook.test.sh: $failures FAILED, $skipped skipped"; exit 1; fi
echo "perturb-hook.test.sh: all passed, $skipped skipped"
