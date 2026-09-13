# Twin re-run demonstration — two consecutive full-suite passes at 1430747 on the newly created database eye_twin_demo3_20260911 (2026-09-11)

Command: EYE_DB_NAME=eye_twin_demo3_20260911 EYE_SCHEDULER_ENABLED=true npx vitest run --config vitest.int.config.ts (apps/api), twice, same head, same database, no reset between runs.

```
head 1430747689d9f7df41d81e58f5b7dd52f65a8398 (1 dirty path(s))
database eye_twin_demo3_20260911 created at 2026-09-11T20:54:03Z
=== run 1 start 2026-09-11T20:54:04Z
rc=0
 Test Files  48 passed (48)
      Tests  836 passed (836)
   Duration  249.71s (transform 810ms, setup 216ms, import 10.34s, tests 235.70s, environment 2ms)
=== run 1 end 2026-09-11T20:58:15Z
=== run 2 start 2026-09-11T20:58:15Z
rc=0
 Test Files  48 passed (48)
      Tests  836 passed (836)
   Duration  281.04s (transform 823ms, setup 209ms, import 10.09s, tests 267.32s, environment 2ms)
=== run 2 end 2026-09-11T21:02:56Z
```

Earlier attempts at this checkpoint, on their own new databases (kept as the record of what the demonstration found):

```
eye_twin_demo_20260911 at e1d1100: run 1 835/836 (the consumer scope case read a job hash fetched before BullMQ's move to failed), run 2 836/836 — phase5-twins 15/15 on both runs, on the used database.
eye_twin_demo2_20260911 at 6d2f102: run 1 834/836 (the same scope case; the residual-corrections R2 fixture took its 16 January record within a second of the world's runs), run 2 835/836 (the scope case) — phase5-twins 15/15 on both runs.
```
