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
| `act-b6.log` | `scripts/phase6/register-subscriptions.mjs` on the NORDWERK demonstration (`eye_demo` migrated 0062–0063) |
