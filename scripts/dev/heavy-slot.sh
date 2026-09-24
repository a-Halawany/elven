#!/usr/bin/env bash
# heavy-slot.sh — admit at most N heavy verification runs (full integration suite, browser suites, cluster runs) at once
# on THIS host (audit/DELIVERY_PLAN.md §6.1). Every participating account wraps its heavy command:
#
#   scripts/dev/heavy-slot.sh <label> -- <command> [args…]     run the command holding one slot; waits for a free slot
#   scripts/dev/heavy-slot.sh --status                          list the holders
#
# A slot is a directory created atomically with mkdir under $EYE_HEAVY_SLOT_DIR (default ~/.eye-verify/slots): slot-1 …
# slot-$EYE_HEAVY_SLOTS (default 2). The holder writes its pid, host, label, command and start time into the slot and
# removes the slot on exit (normal exit, error, SIGINT/SIGTERM). A slot whose holder pid no longer runs on this host is
# stale and is reclaimed, with a message. The lock is HOST-LOCAL: it coordinates the processes of this machine only; an
# account on another machine or a cloud session runs its heavy suites on its own host (with its own limiter) or on hosted
# CI, never against this host's databases. The command's exit status is returned.
set -u
SLOT_DIR="${EYE_HEAVY_SLOT_DIR:-$HOME/.eye-verify/slots}"
SLOTS="${EYE_HEAVY_SLOTS:-2}"
POLL="${EYE_HEAVY_POLL_SECONDS:-5}"
HOST="$(hostname -s 2>/dev/null || hostname)"
mkdir -p "$SLOT_DIR"

holder_alive() { # $1 = slot path — alive while the wrapper OR the command it started still runs
  local pid child host
  pid="$(sed -n 's/^pid=//p' "$1/owner" 2>/dev/null)"; child="$(sed -n 's/^child=//p' "$1/owner" 2>/dev/null)"
  host="$(sed -n 's/^host=//p' "$1/owner" 2>/dev/null)"
  [ -z "$pid" ] && return 0              # being written right now: treat as alive
  [ "$host" != "$HOST" ] && return 0     # another host's record: never reclaimed from here
  kill -0 "$pid" 2>/dev/null && return 0
  [ -n "$child" ] && kill -0 "$child" 2>/dev/null
}

if [ "${1:-}" = "--status" ]; then
  for i in $(seq 1 "$SLOTS"); do
    s="$SLOT_DIR/slot-$i"
    if [ -d "$s" ]; then echo "slot-$i: $(tr '\n' ' ' < "$s/owner" 2>/dev/null)"; else echo "slot-$i: free"; fi
  done
  exit 0
fi
LABEL="${1:-}"; shift || true
[ "${1:-}" = "--" ] && shift
if [ -z "$LABEL" ] || [ $# -eq 0 ]; then echo "usage: heavy-slot.sh <label> -- <command> [args…] | --status" >&2; exit 64; fi

MINE=""; CHILD=""
release() { [ -n "$MINE" ] && rm -rf "$MINE"; MINE=""; }
stop_child() { [ -n "$CHILD" ] && kill -TERM "$CHILD" 2>/dev/null; }
trap 'release' EXIT
trap 'stop_child; release; exit 130' INT
trap 'stop_child; release; exit 143' TERM

announced=0
while [ -z "$MINE" ]; do
  for i in $(seq 1 "$SLOTS"); do
    s="$SLOT_DIR/slot-$i"
    if mkdir "$s" 2>/dev/null; then
      printf 'pid=%s\nhost=%s\nlabel=%s\nstarted=%s\ncommand=%s\n' "$$" "$HOST" "$LABEL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" > "$s/owner"
      MINE="$s"; break
    elif ! holder_alive "$s"; then
      echo "heavy-slot: reclaiming stale slot-$i ($(tr '\n' ' ' < "$s/owner" 2>/dev/null))" >&2
      rm -rf "$s"
      if mkdir "$s" 2>/dev/null; then
        printf 'pid=%s\nhost=%s\nlabel=%s\nstarted=%s\ncommand=%s\n' "$$" "$HOST" "$LABEL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" > "$s/owner"
        MINE="$s"; break
      fi
    fi
  done
  if [ -z "$MINE" ]; then
    [ $announced -eq 0 ] && { echo "heavy-slot: $LABEL waiting — all $SLOTS slots held:" >&2; "$0" --status >&2; announced=1; }
    sleep "$POLL"
  fi
done
echo "heavy-slot: $LABEL holds $(basename "$MINE")" >&2
"$@" &
CHILD=$!
echo "child=$CHILD" >> "$MINE/owner"
wait "$CHILD"
status=$?
release
exit $status
