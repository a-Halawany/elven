#!/usr/bin/env bash
# THE DEMONSTRATION RESTART — docs/ops/DEMONSTRATION_RUNBOOK.md §2.
#
# Restarts the demonstration API on the DEMONSTRATION database (eye_demo) with the demonstration's vault roots, degraded
# journal and scheduler, then VERIFIES THE RUNNING TARGET before it reports success. It is not the Phase 0 bootstrap
# (scripts/demo.sh), which builds a fresh stack against the DEFAULT database `eye` — the 2026-09-13 incident
# (PHASE6_REPORT §24.3; the runbook §6).
#
#   scripts/ops/demo-restart.sh                 stop the API on :3401 (if one listens), start it on eye_demo, verify
#   scripts/ops/demo-restart.sh --build         rebuild apps/api first (after a code change), then the same
#   scripts/ops/demo-restart.sh --verify-only   verify the running process only; nothing restarted
#
# Nothing here prints a credential: the process environment is read for the demonstration's NON-SECRET settings only
# (the database name, the vault roots, the scheduler flag, the degraded directory, the per-source concurrency).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
PORT="${EYE_DEMO_PORT:-3401}"
TARGET_DB="${EYE_DEMO_DB_NAME:-eye_demo}"
LOG="${EYE_DEMO_API_LOG:-$ROOT/apps/api/.eye-local/api-demo.log}"
MODE=start; BUILD=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --verify-only) MODE=verify ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

api_pid() { lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1; }
# The process's environment, filtered to the demonstration's non-secret settings (macOS: ps -E; Linux: /proc).
proc_env() {
  local pid="$1"
  # macOS prints the environment after the command on one line, space-separated: it is split before each ' NAME=' token, so a value
  # with a plain space inside survives (a value containing ' word=' itself would not — no setting of the demonstration does).
  if [ "$(uname -s)" = "Darwin" ]; then ps -E -p "$pid" -o command= 2>/dev/null | sed -E 's/ ([A-Za-z_][A-Za-z0-9_]*=)/\
\1/g'; else tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null; fi \
    | grep -E '^EYE_(DB_NAME|VAULT_(QUARANTINE|EVIDENCE|ARCHIVE|EXPORT)_ROOT|SCHEDULER_ENABLED|DEGRADED_DIR|CONNECTOR_PER_SOURCE_CONCURRENCY|RUNTIME_PORT)=' | sort
}
verify() {
  local pid; pid="$(api_pid)"
  if [ -z "$pid" ]; then echo "VERIFY FAILED: no API listens on :$PORT" >&2; return 1; fi
  local env_lines db ready fails=0
  env_lines="$(proc_env "$pid")"
  db="$(printf '%s\n' "$env_lines" | sed -n 's/^EYE_DB_NAME=//p')"
  ready="$(curl -sf "localhost:$PORT/readyz" 2>/dev/null)"
  echo "the API on :$PORT is pid $pid; its demonstration settings:"
  printf '%s\n' "$env_lines" | sed 's/^/  /'
  if ! printf '%s\n' "$env_lines" | grep -q '^EYE_VAULT_'; then echo "  (no EYE_VAULT_*_ROOT set: the roots are the workspace's .eye-local/vault/{quarantine,evidence,archive,export})"; fi
  echo "  /readyz: ${ready:-<no answer>}"
  if [ "$db" != "$TARGET_DB" ]; then echo "VERIFY FAILED: the process serves database '${db:-<unset, so the default: eye>}', not the demonstration's '$TARGET_DB'" >&2; fails=1; fi
  case "$ready" in *'"status":"ok"'*) ;; *) echo "VERIFY FAILED: /readyz is not ok" >&2; fails=1 ;; esac
  if [ "$fails" = 0 ]; then echo "VERIFIED: the demonstration API serves $TARGET_DB and is ready"; fi
  return "$fails"
}
if [ "$MODE" = verify ]; then verify; exit $?; fi

[ -f .eye-local/env ] || { echo ".eye-local/env is missing (the local secret handoff); the demonstration cannot start" >&2; exit 1; }
set -a; . .eye-local/env; set +a
export EYE_DB_NAME="$TARGET_DB"
export EYE_RUNTIME_PORT="$PORT"
export EYE_DEGRADED_DIR="${EYE_DEMO_DEGRADED_DIR:-$ROOT/apps/api/.eye-local/degraded-demo}"
export EYE_SCHEDULER_ENABLED=true
export EYE_CONNECTOR_PER_SOURCE_CONCURRENCY="${EYE_CONNECTOR_PER_SOURCE_CONCURRENCY:-1}"
if [ "$BUILD" = 1 ]; then pnpm --filter @eye/api build || { echo "the build failed; nothing restarted" >&2; exit 1; }; fi
[ -f apps/api/dist/main.js ] || { echo "apps/api/dist/main.js is not built (run with --build)" >&2; exit 1; }
pid="$(api_pid)"
if [ -n "$pid" ]; then
  echo "stopping the API on :$PORT (pid $pid)"; kill "$pid" 2>/dev/null
  for _ in $(seq 1 20); do [ -z "$(api_pid)" ] && break; sleep 0.5; done
  [ -z "$(api_pid)" ] || { echo "the API on :$PORT did not stop" >&2; exit 1; }
fi
mkdir -p "$(dirname "$LOG")"
# Fully detach the API: its own fds to the log, immune to the hangup, and EXEC'd in the forked subshell — so no bash lingers as
# the API's parent holding the saved copies of this script's stdout (a plain `( ... & )` left the API attached to the caller's
# stdout pipe and hung it; a background FUNCTION call left a bash subshell holding those copies for the API's lifetime, which
# hung a caller that piped this script's output — found during the B12 demonstration, 2026-09-15). `exec` replaces the
# subshell by the API; bash's internal descriptors are close-on-exec, so nothing of the caller's reaches the API.
( cd apps/api && exec nohup node dist/main.js >> "$LOG" 2>&1 < /dev/null ) &
for _ in $(seq 1 60); do curl -sf "localhost:$PORT/readyz" > /dev/null 2>&1 && break; sleep 1; done
verify
exit $?
