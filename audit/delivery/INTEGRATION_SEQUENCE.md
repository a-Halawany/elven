# Integration sequence and the #62 merge decision (prepared 2026-09-25; no merge is authorized by this file)

Prepared under the owner's instruction of 2026-09-25 ("Prepare its separate merge decision and the stack integration sequence").
**Every merge below is a separate decision of the owner.** The bounded review of 2026-09-25
(`audit/reviews/The_Eye_B23_Plan_and_Redis_Review_2026-09-25.md`) advises against approving #60, #61 and #63 as a group.

## The heads (verified 2026-09-25)

| PR | Branch → base | Head | State |
|---|---|---|---|
| #60 B22 | `phase6-b22` → `main` (`5165a97`) | `7125550` | CLEAN; every check green (before the redis index moved) |
| #61 the corrected plan | `planning/delivery-plan-2026-09` → `phase6-b22` | `45fda0f` (was `e579514`) | `supply-chain` red (the redis recheck) until #62 is on its base; the limiter residual (PLAN-F4) CLOSED on it at `45fda0f` (step 3 done) |
| #62 redis index re-pin | `maintenance/c15-redis-index-2026-09-25` → `main` | `17f0236` | CLEAN; every check green (ci 36129773111, C19 36129773207) |
| #63 B23 | `phase6-b23` → `planning/delivery-plan-2026-09` | `d2fa829` (was `95dfcdb`) | `supply-chain` red (the redis recheck); B23-F1 CLOSED on it at `d2fa829` by the forward migration 0085 (step 4's precondition done) |
| #64 B24 | `phase6-b24` → `phase6-b23` | `1bd2bce` (the reviewed pins fast-uri 3.1.7 / multer 2.4.0 cherry-picked 2026-09-29; was `3409418` — B24-F1; records on top — ci 36242673225: build-test 1183/1183, browser and C19 36242673205 green) | `supply-chain` red (the redis recheck) until #62 is on its base; build-test (integration 1182/1182), browser-regression and C19 36164183865 green (ci 36164184010); holds the limiter fix (same patch as #61's `45fda0f`) and 0086 |
| #65 B28 | `phase6-b28` → `phase6-b24` | `9e9dd9e` (the pins merged forward 2026-09-29; was `2c75487`) | ci 36276627852: integration 1214/1214, browser and C19 36276627853 green; build-test red on ONE C18 timing control (622/623 — carried to H1; must pass on the next head); `supply-chain` red (the redis recheck) until #62 is on its base |
| #66 B32 | `phase6-b32` → `phase6-b28` | `11c8102` (the pins merged forward 2026-09-29; was `a71a3b7` — B32-F1 corrected at `aa038f3`; the records on top; was `e45353e`) | stacked on #65; the hosted run for the correction pass at `a71a3b7`: build-test green (1243/1243) |
| #67 B34 | `phase6-b34` → `phase6-b32` | `522f747` (the pins merge, content-identical; was `864029f` — B34-F; B34-F1/F2 CLOSED there by the review of 2026-09-29) | stacked on #66; hosted at `864029f`: build-test pass (job 109362321377: integration 1293/1293, unit 2585 + 9, acceptance 58/58, C18 dual-path proof completed then 623 + 44 controls, 32m10s — the 55-minute job budget proven necessary), browser and C19 pass, `supply-chain` red on the redis recheck only |
| #68 B29 | `phase6-b29` → `phase6-b34` | `4e0e441` (B29-F: `8b3ba25` — 0093, `audit/CP6_BATCHES.md` §B29.11 — plus the pins merge; was `425eab4`) | stacked on #67; hosted at `425eab4` (recorded once): build-test FAIL — integration 1339/1342 (three methods-harness failures, B29-F2), the upgrade and C18 steps SKIPPED; **hosted at `4e0e441` — ci 36632092967: build-test PASS (job 109623575085, 33m10s: unit 2664 + 9, acceptance 58/58, integration 1344/1344 in 104 files, the upgrade proof PASS — roles 49, migrations 72, 276/276 on upgraded data — and the C18 dual-path proof completed, then 623 + 44 controls), browser-regression pass, C19 36632092838 pass; `supply-chain` red on the redis recheck only (#62)** |
| #69 B36 | `phase6-b36` → `phase6-b29` | `adc05d0` (the reviewed head; the B36-F1 correction above it — `audit/CP6_BATCHES.md` §B36.14) | stacked on #68; hosted on `adc05d0`: run 36671183370 build-test and browser-regression green, C19 36671183445 green, supply-chain red on the Redis recheck only (#62's); B36-F1 corrected above it — its hosted run is the next on the PR |
| #70 B90 | `phase6-b90` → `phase6-b36` | the records commit above `ea1f4bb` (0098 at `ea1f4bb`, the hosted corrections at `da19ef9`; the records, `audit/CP6_BATCHES.md` §B90.13; was `5aeb70f`) | stacked on #69; hosted on `ed50673` green except the Redis recheck (run 36723620658); on `5aeb70f` run 36775390596 FAILED — integration 1526/1527 (B17 S2, traced to the second-order attention cascade and corrected), supply-chain on next 16.3.3 (moved to 16.3.6) and the Redis recheck; upgrade and C18 did not run; browser and C19 (36775390653) green. B90-F1's second pass is 0098. The next hosted run is on the new head |

## 1. The #62 decision (ready for the owner's word)

- **What it changes:** the redis pin in `docker-compose.yml`, `apps/api/test/gate/docker-compose.yml` and `conformance.manifest.json` (index `ba6e394f…` → `38117873…`; the linux/amd64 and linux/arm64 children unchanged — only the upstream linux/riscv64 child and its attestation were rebuilt), the C15 trace fixture and `real-image-results.json` re-recorded from a passing real local gate run with the pinned scanners, the recheck control's per-service `pinned_at`, the evidence under `infra/images/official/20260925/`, `docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md` §7 row and §8.5.
- **What it does not change:** no disposition record (no SCX names the redis pin), no budget, cadence, source or C19 anchor; nothing purchased.
- **Evidence:** ci 36129773111 and C19 36129773207 green at `17f0236`; local C18 dual-path proof and verification PASS (its cosign download step not run locally); the review compared the two indexes independently and found the same.
- **Why it comes first:** until it is on a branch's base, that branch's `supply-chain` job fails on the recheck. It is independent of the stack (it touches none of the stack's files).
- **After its merge (automatic, not a further decision):** watch the push-to-main `ci` and the C17 finalize → C19 anchor chain to **completed success**; a failure on `main` is re-run in FULL, never `--failed`.
- **Separately (its own word):** recreating the live `eye-redis` demonstration container onto the new index — a recorded operation (`docs/ops/BACKUP_RESTORE.md` §3: queues only, rebuildable). Its image for this host's platform is byte-identical either way; nothing requires it before the stack merges.

## 2. The stack, after #62 is on `main` — one step at a time, each step's checks on its NEW head

Older heads' green checks never stand for a new combination: every step below produces a new head whose checks must complete successfully before its merge decision is asked for.

1. **#60 (B22).** Merge `main` (with #62) into `phase6-b22` → new head; push; its `ci` (all three jobs, `supply-chain` now green) and C19 lifecycle complete successfully → the owner's decision on #60. The review states #60's independent runtime closure is outside its delta; that remains the owner's call. After a merge: the `main` chain to completed success.
2. **#61 (the plan).** Retarget to `main` (`gh pr edit 61 --base main` — a merge commit leaves `phase6-b22` in place, so GitHub does not retarget by itself); merge `main` into `planning/delivery-plan-2026-09`; its checks on the new head → the owner's decision.
3. **The limiter fix on #61.** Before step 2's decision, the PLAN-F4 residual fix (`c0b9d25` on `phase6-b24`: the slot kept until the cancelled workload's process group has exited; three regressions; the control reproducing the old defect) is cherry-picked onto `planning/delivery-plan-2026-09`, so #61 carries the complete limiter. (The same patch reaches `phase6-b24` again through the stack's merges without conflict.)
4. **#63 (B23).** Before its decision: the B23-F1 forward correction (migration 0085) is committed on `phase6-b23`, with its focused regressions and a records note, so #63 closes its own defect; retarget to `main` after #61 merges; merge `main` in; checks on the new head → the owner's decision.
5. **#64 (B24).** B24-F1 (the evidence version, the bounded B24 review) is corrected on it first (0087, a new head whose checks must complete). It stacks on #63 (base `phase6-b23`); after #63 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision.

6. **#65 (B28).** Stacks on #64 (base `phase6-b24`); after #64 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision.

7. **#66 (B32).** Stacks on #65 (base `phase6-b28`); after #65 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision.

8. **#67 (B34).** Stacks on #66 (base `phase6-b32`); after #66 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision.

9. **#68 (B29).** Stacks on #67 (base `phase6-b34`); the B29-F correction pass (0093) is on it first, its hosted checks — the build job's upgrade and C18 steps included, which the first run skipped — must complete; after #67 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision.

10. **#69 (B36).** Stacks on #68 (base `phase6-b29`); the records are on it (`audit/CP6_BATCHES.md` §B36 — the hosted browser cases of its conditions (e), (h), (i), (m), (p) and (s) are open at `fd47d1c`: every B36 spec is a demo walk); its hosted checks — build-test with the upgrade proof (roles 52, migrations 73) and the C18 steps, browser-regression, C19 — completed green on `adc05d0` (run 36671183370; C19 36671183445; supply-chain red on the Redis recheck only, #62's); the owner's review of 2026-09-30 held it for B36-F1 (the history allowlist's missing AND — corrected above `adc05d0`, §B36.14); after #68 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision.

11. **#70 (B90).** Stacks on #69 (base `phase6-b36`); the records are on it (`audit/CP6_BATCHES.md` §B90 — the three features' B90 clauses built and harness-proven, 76/76; the residuals assigned to B31, B45, B91, B92, B93, B106/R1 and B107); its hosted checks — build-test with the upgrade proof (roles 53, migrations 74, schema registry 48) and the C18 steps, browser-regression, C19 — completed green on `ed50673` (run 36723620658; C19 36723620672; the Redis recheck #62's); the owner's review of 2026-09-30 held it for B90-F1 (the lagging subscription's backlog — corrected in 0096 above `ed50673`, §B90.11); after #69 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision. On 2026-10-01 its run at `5aeb70f` (36775390596) failed; B90-F1's second pass (0098, `ea1f4bb`) and the traced hosted corrections (`da19ef9`) are above it (§B90.13), and its next hosted run is on the new head.

Between two merges the first merge's `main` chain completes before the next merge (the B18 rule: the C17 finalize of a merge overtaken by another merge refuses).

## 4. #61's A5 timing-gate failure — the focused disposition (2026-09-26)

- **The failure** (ci 36147700841, job 108112881879 at `45fda0f`): `phase1-acceptance` A5 "EXISTENCE AND TIMING", one of 1103 integration tests. The foreign-scope mean was 3.48 ms and the absent mean 12.11 ms; the ratio 3.48 is not below 3. The NON-existent path was the slow one.
- **It is not caused by #61.** #61's diff against #60 (`phase6-b22`) contains no runtime code: the register doc, the plan records, `scripts/dev/heavy-slot.sh` and its test. The same test passed on #60's head, on #63 `d2fa829` (ci 36149261460) and on #64 `8459390` (ci 36164184010).
- **It does not reproduce on #61's exact code** (a worktree at `45fda0f`, fresh databases, the heavy slot):
  - 30/30 runs of A5 alone;
  - 10/10 runs of the whole file (46/46 each) on a fresh database each, alongside a full integration run for load.
- **It is not treated as a proven isolation leak, nor waived.** It reads as a transient stall inflating one path's 12-sample mean. That is inferred from the numbers, not proven.
- **Disposition:**
  - The gate is UNCHANGED: threshold 3, the same statistic, required.
  - #61 gets a new head in step 2 (`main` merged in), and A5 must pass there like every other check. Its merge decision is not asked for until it does.
  - If it fails again, the next step is to record the per-probe samples of the failing run (a diagnostics-only change to the test, same threshold) before any other change.
- **It failed again** on #71 (ci 36782666166 at `21ee226`, 2026-10-01): ratio 3.0688, foreign mean 4.93 ms, absent mean 15.12 ms — the absent path again the slow one. The recorded next step is taken (`da19ef9`): A5 records and prints its per-probe samples (`A5 TIMING SAMPLES …`) and puts them in the assertion's message. The threshold, the statistic and the gate are unchanged, and the item stays H1's. The next failing run's samples decide what follows; nothing else changes before then.
  - Redis explains only the `supply-chain` red, not this one.

## 3. What is never done in this sequence

No blanket approval; no merge on a pending or timed-out check; no `--failed` re-run on `main`; no waiver of C15–C19; no rewrite of an applied migration (0084 stays as applied; its correction is 0085); no live recreation without its own word.
