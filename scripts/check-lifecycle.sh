#!/usr/bin/env bash
# Checks Keel's install, activation, and removal lifecycle against a real Claude Code CLI.
# Uses a throwaway CLAUDE_CONFIG_DIR, so the caller's own configuration is untouched.
# Makes a few short model calls. A stored /login does not carry into the throwaway configuration,
# so authenticate through the environment: CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`)
# or ANTHROPIC_API_KEY.
# Every step must observably succeed; a missing session, transcript, or failed command is a FAIL.
# The full output of every command and the session transcripts are kept in a diagnostics
# directory (KEEL_LIFECYCLE_LOGS, or a new temporary directory), printed at the end.
#
# Exit status: 0 all checks passed, 1 a check failed, 3 not authenticated (only install checked).
#
# Usage: scripts/check-lifecycle.sh [marketplace-source]   (default: this checkout)
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-$REPO}"
CORE_MARK="Keel: engineering partner"
HOST_MARK="Keel host notes: Claude Code"

for tool in claude git; do
  command -v "$tool" >/dev/null || { echo "FAIL  required command not found: $tool"; exit 1; }
done
# On Windows, python3 is often a Microsoft Store stub; use whichever interpreter actually runs.
PYTHON=""
for candidate in python3 python py; do
  if command -v "$candidate" >/dev/null && "$candidate" -c "import json" >/dev/null 2>&1; then PYTHON="$candidate"; break; fi
done
[ -n "$PYTHON" ] || { echo "FAIL  no working Python found (tried python3, python, py)"; exit 1; }
# Under Git Bash on Windows, hand native programs Windows-style paths.
native_path() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
[ "$SOURCE" = "$REPO" ] && SOURCE="$(native_path "$REPO")"

# Run as an independent session, not as a child of any session that launched this script.
unset CLAUDECODE CLAUDE_CODE_SESSION_ID CLAUDE_CODE_REMOTE_SESSION_ID CLAUDE_CODE_CHILD_SESSION

WORK="$(native_path "$(mktemp -d)")"
LOGDIR="$(native_path "${KEEL_LIFECYCLE_LOGS:-$(mktemp -d -t keel-lifecycle-XXXXXX)}")"
mkdir -p "$LOGDIR"
keep_diagnostics() {
  [ -d "$WORK/config/projects" ] && cp -R "$WORK/config/projects" "$LOGDIR/transcripts" 2>/dev/null
  rm -rf "$WORK"
  echo "Diagnostics: $LOGDIR"
}
trap keep_diagnostics EXIT
export CLAUDE_CONFIG_DIR="$WORK/config"
mkdir -p "$CLAUDE_CONFIG_DIR" "$WORK/project"
cd "$WORK/project" && git init -q

failures=0
# Save one command's full output to the diagnostics directory. Usage: save_log label output
# (Numbered from the files already there, because some callers run in subshells.)
save_log() {
  local n
  n="$(find "$LOGDIR" -maxdepth 1 -name '*.log' | wc -l | tr -d ' ')"
  printf '%s\n' "$2" > "$LOGDIR/$(printf '%02d' $((n + 1)))-$(printf '%s' "$1" | tr -c 'A-Za-z0-9' '-' | cut -c1-50).log"
}
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '      %s\n' "$2" | head -n 5; failures=$((failures + 1)); }
check() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected $3, got $2)"; fi; }

# Run a command; on failure record it with its output. Usage: step "label" cmd args...
step() {
  local label="$1" out status; shift
  out="$("$@" 2>&1 < /dev/null)"; status=$?
  save_log "$label" "\$ $* (exit $status)"$'\n'"$out"
  [ "$status" -eq 0 ] && return 0
  fail "$label" "$out"; return 1
}

# Start or resume a headless session and print its session id. It runs inside command
# substitution, so its diagnostics go to stderr; the empty id then fails every check that uses it.
run_session() {
  local label="$1" out errfile errtext sid status; shift
  # stdin is closed and stderr kept apart: the CLI can print warnings to stderr, which must not
  # be parsed as the JSON result.
  errfile="$(mktemp)"
  out="$(claude -p "$@" --output-format json 2>"$errfile" < /dev/null)"; status=$?
  errtext="$(cat "$errfile")"; rm -f "$errfile"
  save_log "$label" "\$ claude -p $* --output-format json (exit $status)"$'\n'"$out"$'\n'"--- stderr ---"$'\n'"$errtext"
  if [ "$status" -ne 0 ]; then fail "$label: claude exited non-zero" "$errtext $out" >&2; return 1; fi
  sid="$(printf '%s' "$out" | "$PYTHON" -I -c '
import json, sys
d = json.load(sys.stdin)
if d.get("is_error") or not d.get("session_id"):
    sys.exit(1)
print(d["session_id"])' 2>/dev/null)" || { fail "$label: no successful session result" "$out $errtext" >&2; return 1; }
  printf '%s' "$sid"
}

transcripts() { find "$CLAUDE_CONFIG_DIR/projects" -name '*.jsonl' 2>/dev/null | sort; }

# Occurrences of a marker in one session's transcript, or "missing" if the transcript is absent or ambiguous.
count() {
  local files n
  [ -n "$2" ] || { echo missing; return; }
  files="$(find "$CLAUDE_CONFIG_DIR/projects" -name "$2.jsonl" 2>/dev/null)"
  [ "$(printf '%s' "$files" | grep -c .)" = 1 ] || { echo missing; return; }
  n="$(grep -c -- "$1" "$files")"
  echo "${n:-0}"
}

echo "Claude Code $(claude --version 2>/dev/null)"
echo "Core: $(wc -c < "$REPO/plugin/core.md") chars; Claude Code notes: $(wc -c < "$REPO/plugin/hosts/claude-code.md") chars (hook output cap: 10000 each)"

# Install
if step "install from $SOURCE" claude plugin install keel --marketplace "$SOURCE" -y; then
  pass "install from $SOURCE"
else
  echo "Cannot continue without an installed plugin."; exit 1
fi

# Every later check needs a model call. Without authentication, stop here explicitly with exit
# status 3 (inconclusive) instead of reporting each model-dependent check as a failure.
# stderr is kept apart, as in run_session, so a CLI warning cannot be parsed as the status.
errfile="$(mktemp)"
auth="$(claude auth status --json 2>"$errfile" < /dev/null)"
autherr="$(cat "$errfile")"; rm -f "$errfile"
save_log "auth status" "$auth"$'\n'"--- stderr ---"$'\n'"$autherr"
logged_in="$(printf '%s' "$auth" | "$PYTHON" -I -c 'import json, sys; print(json.load(sys.stdin)["loggedIn"])' 2>/dev/null)"
case "$logged_in" in
  True) ;;
  False)
    echo "STOP  not authenticated: model-dependent checks not run (install checked only)"
    echo "      Set CLAUDE_CODE_OAUTH_TOKEN (from \`claude setup-token\`) or ANTHROPIC_API_KEY and rerun."
    exit 3;;
  *)
    fail "authentication status readable" "$auth $autherr"; exit 1;;
esac

# Fresh session: core and host notes injected exactly once
SID="$(run_session "startup session" "Reply with exactly: OK")"
check "startup injects core once" "$(count "$CORE_MARK" "$SID")" 1
check "startup injects Claude Code notes once" "$(count "$HOST_MARK" "$SID")" 1

# The model can see it
reply="$(claude -p "If your context contains a section titled 'Keel: engineering partner', reply exactly YES. Otherwise reply exactly NO." 2>&1 < /dev/null)"; rstatus=$?
save_log "model sees the core" "(exit $rstatus)"$'\n'"$reply"
if [ "$rstatus" -eq 0 ]; then
  case "$reply" in *YES*) pass "model sees the core";; *) fail "model sees the core" "$reply";; esac
else
  fail "model sees the core: claude exited non-zero" "$reply"
fi

# Resume: no duplicate injection
run_session "resume session" --resume "$SID" "Reply with exactly: OK" >/dev/null
check "resume does not re-inject" "$(count "$CORE_MARK" "$SID")" 1

# Compaction: re-injected after the summary
step "/compact command" claude -p --resume "$SID" "/compact" && pass "/compact command"
check "compaction re-injects" "$(count "$CORE_MARK" "$SID")" 2

# /clear: exactly one new conversation, which gets the core
before="$(transcripts)"
step "/clear command" claude -p --resume "$SID" "/clear" && pass "/clear command"
new="$(comm -13 <(printf '%s\n' "$before") <(transcripts) | grep .)"
if [ "$(printf '%s' "$new" | grep -c .)" = 1 ]; then
  check "/clear injects core in new conversation" "$(count "$CORE_MARK" "$(basename "$new" .jsonl)")" 1
else
  fail "/clear creates exactly one new conversation" "new transcripts: ${new:-none}"
fi

# Disable: fresh sessions are clean; a resumed old session keeps its transcript text
step "disable command" claude plugin disable keel@keel && pass "disable command"
OFF="$(run_session "disabled fresh session" "Reply with exactly: OK")"
check "disabled: fresh session has no core" "$(count "$CORE_MARK" "$OFF")" 0
run_session "disabled resumed session" --resume "$SID" "Reply with exactly: OK" >/dev/null
check "disabled: resumed session keeps earlier core text, adds none" "$(count "$CORE_MARK" "$SID")" 2
step "re-enable command" claude plugin enable keel@keel && pass "re-enable command"

# Uninstall: no longer installed, data directory removed. Claude Code keeps the old cached
# version marked orphaned and deletes it later by design, so sessions already using it keep working.
step "uninstall command" claude plugin uninstall keel@keel && pass "uninstall command"
record="$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json"
if [ -f "$record" ]; then
  check "uninstall removes install record" "$(grep -c '"keel@keel"' "$record")" 0
else
  fail "uninstall removes install record" "$record not found"
fi
data="$(find "$CLAUDE_CONFIG_DIR/plugins/data" -maxdepth 1 -name '*keel*' 2>/dev/null | head -n 1)"
check "uninstall leaves no plugin data" "${data:-none}" none
marked="$(find "$CLAUDE_CONFIG_DIR/plugins/cache" -path '*keel*' -name .orphaned_at 2>/dev/null | head -n 1)"
if [ -n "$marked" ]; then pass "uninstall marks cached copy for cleanup"; else fail "uninstall marks cached copy for cleanup"; fi
GONE="$(run_session "uninstalled fresh session" "Reply with exactly: OK")"
check "uninstalled: fresh session has no core" "$(count "$CORE_MARK" "$GONE")" 0

# Hook failure: a missing core file is reported as a hook error, the host notes still load,
# and the session still answers.
BROKEN="$WORK/broken"
cp -R "$REPO/plugin" "$BROKEN" && rm "$BROKEN/core.md"
events="$(claude -p --plugin-dir "$BROKEN" "Reply with exactly: OK" --output-format stream-json --verbose 2>/dev/null < /dev/null)"; estatus=$?
save_log "missing core file session" "(exit $estatus)"$'\n'"$events"
if [ "$estatus" -eq 0 ]; then
  verdict="$(printf '%s\n' "$events" | "$PYTHON" -I -c '
import json, sys
core_error = notes_ok = answered = False
for line in sys.stdin:
    try:
        d = json.loads(line)
    except ValueError:
        continue
    if d.get("subtype") == "hook_response" and d.get("hook_event") == "SessionStart":
        if d.get("outcome") == "error" and d.get("exit_code") not in (0, None) and "core.md" in d.get("stderr", ""):
            core_error = True
        if d.get("outcome") == "success" and "Keel host notes" in d.get("stdout", ""):
            notes_ok = True
    if d.get("type") == "result" and not d.get("is_error") and "OK" in (d.get("result") or ""):
        answered = True
print(f"{core_error} {notes_ok} {answered}")')"
  read -r core_error notes_ok answered <<<"$verdict"
  check "missing core file: reported as SessionStart hook error" "$core_error" True
  check "missing core file: Claude Code notes still load" "$notes_ok" True
  check "missing core file: session still answers" "$answered" True
else
  fail "missing core file: claude exited non-zero" "$events"
fi

echo
if [ "$failures" -eq 0 ]; then echo "All lifecycle checks passed."; else echo "$failures lifecycle check(s) failed."; fi
[ "$failures" -eq 0 ]
