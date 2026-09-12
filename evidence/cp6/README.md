# CP-6 author evidence (2026-09-12)

The author's own demonstrations for the checkpoint recorded in `PHASE6_REPORT.md` §19 — one class of evidence,
kept apart from Codex's focused checks (quoted in §19) and from the hosted results (GitHub Actions, the only chain
that verifies a harness unit). Every file is the unedited output of the named command on the author's machine
(the vitest configuration warning lines and blank lines stripped from the suite logs).

| File | What it is |
|---|---|
| `repro-b1.mjs`, `repro-b1-before.txt`, `repro-b1-after.txt` | Codex finding 1 reproduced on the actual function `graph.propagations_to_reconcile()` (a rolled-back transaction pointing one attempt at each state) before and after migration 0062 |
| `repro-b4-before.txt`, `repro-b4-before-summary.md`, `repro-b4-after.txt` | Codex finding 2 reproduced on a scratch copy of the tracked audit before and after the evidence-backed summariser |
| `b1-suite-run1.txt`, `b1-suite-run2.txt` | `phase6-propagation-consumer` (18 cases) at the 0062 head, two consecutive runs on real Redis and the real outbox |
| `b6-run7.txt`, `b6-run8.txt` | `phase6-graph-subscriptions` (13 cases) at the 0063 head, two consecutive runs on `eye_verify3_20260912` (created and migrated 0001–0063 for this checkpoint) |
| `b6-regress-1.txt`, `b6-regress-2.txt` | the suites whose write paths gained the GraphChanged/MemoryCorrected emitters, re-run at the 0063 head (81/81, 98/98) |
| `upgrade-0063.txt` | the tail of `scripts/phase1/verify-0022-upgrade.mjs` at the 0063 head (63 files; roles +25; migrations +42; 275/275 on the upgraded data; virgin and upgraded schema digests equal) |
| `act-b6.txt` | `scripts/phase6/register-subscriptions.mjs` on the NORDWERK demonstration (`eye_demo` migrated 0062–0063) — cited as `act-b6.log` at `fcbdefc`/`cb014a9`, where the repository's `*.log` ignore rule kept it out of the commit; the retained file, renamed |
| `hosted-fcbdefc-build-test-summary.txt` | the totals lines of the hosted `build-test` job at `fcbdefc` (ci run 34663012651): unit, the integration suite 852/852 in 49 files with `phase6-graph-subscriptions` 13/13, the upgrade proof PASS — the hosted result itself is GitHub's, this is its extract |
| `repro-retrieval-before.txt`, `repro-retrieval-after.txt` | Codex finding 3 reproduced at the database/queue boundary by `apps/api/test/int/phase6-repro-retrieval-retry.test.ts` — before (code at `fcbdefc`, database at 0063: `failed` → re-drive → `applied`, one check) and after (0064: `unresolved` → re-drive → `unresolved`, a second check) |
| `b7-run16.txt`, `b7-run15.txt` | `phase6-graph-subscriptions-2` (14 cases) at the 0064 head on `eye_verify8_20260912` (created and migrated 0001–0064 from the final migration file) — run 16 alone with console output (the telemetry measurement); run 15 beside `phase6-graph-subscriptions`, the reproduction file, `phase6-propagation-consumer` and `gate22-outbox-hardening` (50/50) |
| `b7-regress-b1.txt` | `phase6-propagation-consumer`, `gate22-outbox-hardening`, `phase1-acceptance` at an earlier 0064 state (68/68) |
| `b7-int-all-4.txt`, `upgrade-0064.txt` | the full integration suite and the upgrade proof on a database created and migrated 0001–0064 from the final migration file |
| `b7-adversarial-review.txt` | the independent adversarial review of the batch before its commit (a workflow of fifteen skeptics over five claims, every finding verified independently): the distinct findings and what each became |
| `b7-telemetry-measurement.txt` | the one operating measurement AU-MEM-0041 asks for, on the local profile (a retrieval delivery: queue wait, apply time, end-to-end age, retries) and the tenant's open failure states as the status route reports them |
| `act-b7.txt` | the same act re-run on the NORDWERK demonstration after `eye_demo` was migrated through 0064 (the six subscriptions kept; the correction's MemoryCorrected and the retraction's GraphChanged delivered and verified — the ledger route's events now read through `outbox_event_id`) |
| `hosted-a852c65-build-test-summary.txt` | the totals lines of the hosted `build-test` job at `a852c65` (ci run 34693808238): unit, the integration suite 867/867 in 51 files with `phase6-graph-subscriptions-2` 14/14 and the reproduction file, the upgrade proof PASS with the declared column additions — the hosted result itself is GitHub's, this is its extract |
