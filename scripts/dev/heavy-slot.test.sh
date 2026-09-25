#!/usr/bin/env bash
# The limiter's own check (scripts/dev/heavy-slot.sh): run on a private slot directory; prints PASS or FAIL per case.
# It signals only the processes it started itself (their pids, never a name pattern), and every workload it launches ends by
# itself within a few seconds.
set -u
cd "$(dirname "$0")/../.."
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export EYE_HEAVY_SLOT_DIR="$T/slots" EYE_HEAVY_POLL_SECONDS=1
fail=0; ok() { echo "PASS $1"; }; ko() { echo "FAIL $1"; fail=1; }
H=scripts/dev/heavy-slot.sh
now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
wait_for() { local f=$1 i; for i in $(seq 1 100); do [ -e "$f" ] && return 0; sleep 0.1; done; return 1; }
child_of() { sed -n 's/^child=//p' "$EYE_HEAVY_SLOT_DIR"/slot-*/owner 2>/dev/null | head -1; }

# 1 — two slots admit two of four
LOG="$T/log"
job() { $H "$1" -- bash -c "echo start \$(date +%s) >> $LOG; sleep 2; echo end \$(date +%s) >> $LOG" 2>/dev/null; }
job a & job b & job c & job d & wait
mx=$(sort -k2,2n -k1,1 "$LOG" | awk '{ if ($1=="start") c++; else c--; if (c>m) m=c } END { print m }')
runs=$(grep -c start "$LOG")
[ "$mx" = 2 ] && [ "$runs" = 4 ] && ok "four jobs, two slots: at most $mx concurrent, $runs ran" || ko "concurrency $mx, runs $runs"

# 2 — the command's exit status
EYE_HEAVY_SLOTS=2 $H x -- bash -c 'exit 7' 2>/dev/null; [ $? = 7 ] && ok "the command's exit status is returned" || ko "exit status"

# 3 — TERM stops a cooperative command and releases
$H term -- sleep 30 2>/dev/null & W=$!
wait_for "$EYE_HEAVY_SLOT_DIR/slot-1/owner"; sleep 0.5; C=$(child_of)
kill -TERM $W; wait $W; st=$?
{ [ $st = 143 ] && [ -n "$C" ] && ! kill -0 "$C" 2>/dev/null && [ -z "$(ls "$EYE_HEAVY_SLOT_DIR")" ]; } && ok "TERM stops the command's process group and releases the slot" || ko "TERM (status $st)"

export EYE_HEAVY_SLOTS=1
# 4 — a SIGKILLed wrapper whose command still runs keeps its slot; 5 — reclaimed once the command has ended
$H victim -- sleep 3 2>/dev/null & V=$!
wait_for "$EYE_HEAVY_SLOT_DIR/slot-1/owner"; sleep 0.5
kill -KILL $V 2>/dev/null; wait $V 2>/dev/null
$H probe -- true 2>"$T/perr" & P=$!; sleep 1.5
kill -0 $P 2>/dev/null && ok "a SIGKILLed wrapper's command still running keeps its slot" || ko "slot reclaimed while the command ran"
wait $P; grep -q "reclaiming stale slot-1" "$T/perr" && ok "the slot is reclaimed once the command has ended" || ko "stale reclaim"

# 6 — CANCELLATION RETAINS THE SLOT: a workload that ignores TERM and exits 3 s later keeps the slot; the waiting job enters
#     only after it has exited (the review of 2026-09-25, PLAN-F4 residual)
M="$T/m6"; mkdir -p "$M"
$H slow -- bash -c "trap '' TERM; touch $M/ready; sleep 3; python3 -c 'import time; print(int(time.time()*1000))' > $M/child_end" 2>/dev/null & W=$!
wait_for "$M/ready"
kill -TERM $W
$H next -- bash -c "python3 -c 'import time; print(int(time.time()*1000))' > $M/next_start" 2>/dev/null & N=$!
wait $W; st=$?; wait $N
if [ -s "$M/child_end" ] && [ -s "$M/next_start" ] && [ "$(cat "$M/next_start")" -ge "$(cat "$M/child_end")" ] && [ $st = 143 ]; then
  ok "a cancelled workload that shuts down late keeps its slot: the waiting job entered $(( $(cat "$M/next_start") - $(cat "$M/child_end") )) ms after it exited"
else ko "cancellation released the slot early (child_end=$(cat "$M/child_end" 2>/dev/null) next_start=$(cat "$M/next_start" 2>/dev/null) status=$st)"; fi

# 7 — the grace: a workload that ignores TERM for good is KILLed after EYE_HEAVY_TERM_GRACE, then the slot is released
M="$T/m7"; mkdir -p "$M"
EYE_HEAVY_TERM_GRACE=1 $H stubborn -- bash -c "trap '' TERM; touch $M/ready; sleep 20" 2>"$T/e7" & W=$!
wait_for "$M/ready"; C=$(child_of)
t0=$(now_ms); kill -TERM $W; wait $W; st=$?; t1=$(now_ms)
{ [ $st = 143 ] && ! kill -0 -- "-$C" 2>/dev/null && [ -z "$(ls "$EYE_HEAVY_SLOT_DIR")" ] && grep -q "outlived its grace" "$T/e7" && [ $((t1 - t0)) -lt 5000 ]; } \
  && ok "a workload ignoring TERM is KILLed after its grace and only then released ($((t1 - t0)) ms)" || ko "grace escalation (status $st, $((t1 - t0)) ms)"

# 8 — a normal finish waits for what the command left running in its group
M="$T/m8"; mkdir -p "$M"
$H parent -- bash -c "(sleep 2; python3 -c 'import time; print(int(time.time()*1000))' > $M/grandchild_end) & exit 0" 2>/dev/null & W=$!
sleep 0.5
$H after -- bash -c "python3 -c 'import time; print(int(time.time()*1000))' > $M/after_start" 2>/dev/null & A=$!
wait $W; wait $A
[ -s "$M/grandchild_end" ] && [ "$(cat "$M/after_start")" -ge "$(cat "$M/grandchild_end")" ] \
  && ok "a finished command's lingering group member holds the slot until it exits" || ko "released before the group exited"

[ $fail = 0 ] && echo "heavy-slot: ALL PASS" || { echo "heavy-slot: FAILED"; exit 1; }
