#!/usr/bin/env bash
# The limiter's own check (scripts/dev/heavy-slot.sh): run on a private slot directory; prints PASS or FAIL per case.
set -u
cd "$(dirname "$0")/../.."
T="$(mktemp -d)"; trap 'rm -rf "$T"; pkill -f "heavy-slot-test-sleep" 2>/dev/null' EXIT
export EYE_HEAVY_SLOT_DIR="$T/slots" EYE_HEAVY_POLL_SECONDS=1
fail=0; ok() { echo "PASS $1"; }; ko() { echo "FAIL $1"; fail=1; }
LOG="$T/log"
job() { scripts/dev/heavy-slot.sh "$1" -- bash -c "echo start \$(date +%s) >> $LOG; sleep 2; echo end \$(date +%s) >> $LOG" 2>/dev/null; }
job a & job b & job c & job d & wait
mx=$(sort -k2,2n -k1,1 "$LOG" | awk '{ if ($1=="start") c++; else c--; if (c>m) m=c } END { print m }')
runs=$(grep -c start "$LOG")
[ "$mx" = 2 ] && [ "$runs" = 4 ] && ok "four jobs, two slots: at most $mx concurrent, $runs ran" || ko "concurrency $mx, runs $runs"
EYE_HEAVY_SLOTS=2 scripts/dev/heavy-slot.sh x -- bash -c 'exit 7' 2>/dev/null; [ $? = 7 ] && ok "the command's exit status is returned" || ko "exit status"
scripts/dev/heavy-slot.sh term -- bash -c 'exec -a heavy-slot-test-sleep sleep 30' 2>/dev/null & W=$!; sleep 1; kill -TERM $W; wait $W; st=$?
sleep 0.3; { [ $st = 143 ] && ! pgrep -f heavy-slot-test-sleep >/dev/null && [ -z "$(ls "$EYE_HEAVY_SLOT_DIR")" ]; } && ok "SIGTERM stops the command and releases the slot" || ko "SIGTERM (status $st)"
export EYE_HEAVY_SLOTS=1
scripts/dev/heavy-slot.sh victim -- bash -c 'exec -a heavy-slot-test-sleep sleep 4' 2>/dev/null & sleep 1; pkill -9 -f "heavy-slot.sh victim"; sleep 0.3
scripts/dev/heavy-slot.sh probe -- true 2>"$T/perr" & P=$!; sleep 1.5
kill -0 $P 2>/dev/null && ok "a SIGKILLed wrapper's command still running keeps its slot" || ko "slot reclaimed while the command ran"
wait $P; grep -q "reclaiming stale slot-1" "$T/perr" && ok "the slot is reclaimed once the command has ended" || ko "stale reclaim"
[ $fail = 0 ] && echo "heavy-slot: ALL PASS" || { echo "heavy-slot: FAILED"; exit 1; }
