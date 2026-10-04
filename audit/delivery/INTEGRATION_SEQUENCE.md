# Integration sequence (prepared 2026-09-25; reconciled 2026-10-02 to the owner's standing merge authorization)

Prepared under the owner's instruction of 2026-09-25 ("Prepare its separate merge decision and the stack integration sequence").
**Current instruction (the owner, 2026-10-02):** "Routine merge approval is already granted for genuinely ready work."
- **How a merge proceeds now.** Each PR below merges in order once EVERY required check has completed successfully on its exact head. That head must be the one produced by merging the merged base in.
- **What comes before each next merge.** The complete `main` chain — CI, the C17 finalize and C19 — completes successfully.
- **Never done:**
  - a failed-check waiver;
  - a stale-head substitution;
  - a failed-job-only re-run on `main`;
  - merging #70's standalone migration-gap head.
- **What remains the owner's.** Credential rotation, a purchase, an account change or a live-system operation remain the owner's own word; this authorization grants none of them.

The text below keeps the 2026-09-25 history. Where a step reads "→ the owner's decision", it now means "→ merged under the standing authorization when its checks pass". (Originally: every merge below was a separate decision of the owner.) The bounded review of 2026-09-25
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
| #70 B90 | `phase6-b90` → `phase6-b36` | `c5dd168` (0098 at `ea1f4bb`, the hosted corrections at `da19ef9`, the records, `audit/CP6_BATCHES.md` §B90.13) | **consolidated into #71 (2026-10-01; kept open with its review and evidence history, not merged independently).** Hosted on `c5dd168` (ci 36865279216): integration 1527/1527, unit, web, acceptance, the upgrade proof and browser passed; **C18 FAILED** — `migration sequence broken at '0098_b90f2_catchup_contiguous_coverage.sql' (expected 0097)`: this head carries 0098 without B27's 0097, and C18's contiguity is frozen. C19 36865279309 green; supply-chain the Redis recheck only (#62's). No migration is renumbered, inserted or placeholdered; every applied filename and byte stands |
| #71 B90 + B27 (consolidated) | `phase6-b27` → **`phase6-b36`** (retargeted 2026-10-01) | the records commit above `aa45ac1` (contains #70's head `c5dd168`; migrations 0095, 0096, 0097, 0098 in order) | the complete B90 + B27 candidate. Hosted on `aa45ac1` while based on `phase6-b90` (ci 36865283539): build-test green — integration 1583/1583, unit 2942 + 9, web 187, acceptance 58/58, upgrade PASS, **C18 all four stages passed** — browser green, C19 36865283730 green; supply-chain the Redis recheck only. Its checks against the new base run on this head |
| #72 B31 | `phase6-b31` → `phase6-b27` | `1dbb93d` (0099, 0100; the records, `audit/CP6_BATCHES.md` §B31, §B31.9 and its addendum) | stacked on #71. Hosted on `2b591de` (ci 36909407667) FAILED build-test on `phase6-orchestration-b31` O1 (a database-wide count meeting B31-F's own experiments in the shared integration database; upgrade and C18 not run) — scoped to the harness's tenant at `1dbb93d`; on `1dbb93d` (ci 36921570491) build-test (integration, upgrade, C18) and browser green, C19 36921570496 green, supply-chain the Redis recheck only |
| #73 B35 | `phase6-b35` → `phase6-b31` | the records commit above `fd6ec64` (0101; the records, `audit/CP6_BATCHES.md` §B35) | stacked on #72. Local gates at `5ee776b`: integration 1716/1716, unit 3099 + 9, web 225, acceptance 58/58, upgrade PASS (80), browser 93/93; the act HELD on `eye_demo`; the hosted run is the PR's first |
| N-01 (0102) | `phase6-n01` → `phase6-b35` | the N-01 commit above `8dbc79f` | the corrective candidate: later-schema definer reads bound to the caller's scope, the constraint-gate capability narrowed, PUBLIC EXECUTE revoked, the creator's default function privileges (`audit/CP6_BATCHES.md` §N-01). Local: the N-01 harness 58/58 each way, integration 1774/1774, acceptance 58/58, upgrade PASS (81); the hosted run is the PR's first |
| B30 (0103) | `phase6-b30` → `phase6-n01` | the B30 records commit | twin state, reconciliation, envelope and calibration (`audit/CP6_BATCHES.md` §B30). Local: part harnesses 21/22/7/18, integration 1841/1841, unit 3193 + 9, web 244, acceptance 58/58, upgrade PASS (roles 54, migrations 82), browser 93/93; the act HELD on `eye_demo` (through 0103); the walks 13/13 twice. The hosted run is the PR's first |
| #62 refreshed (2026-10-02) | `maintenance/c15-redis-index-2026-09-25` → `main` | `cd8428f` (was `17f0236`) | the exact-head refresh of `17f0236` (ci 36129773111 attempt 2) failed `supply-chain`: the scanners' data had moved, not #62. Carried: the reviewed pins (fast-uri 3.1.7 / multer 2.4.0 — `1bd2bce`; next 16.3.6 — `da19ef9`'s pin), the stack's `.gitleaks.toml` (`c385d02` + `cdd61b4`; the all-refs history scan reaches the stack's commits), and one NEW pin under the same rule: fast-uri 3.1.8 (GHSA-hrr3-gc8f-f4qj, MODERATE; the final-manifest assertion accepts only a clean receipt). On `d65eaf7` (ci 37005512372) every C15 step passed |

## 1. #62 (the 2026-09-25 decision record; merged under the standing authorization once its refreshed head passes)

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

11. **#70 (B90).** Stacks on #69 (base `phase6-b36`); the records are on it (`audit/CP6_BATCHES.md` §B90 — the three features' B90 clauses built and harness-proven, 76/76; the residuals assigned to B31, B45, B91, B92, B93, B106/R1 and B107); its hosted checks — build-test with the upgrade proof (roles 53, migrations 74, schema registry 48) and the C18 steps, browser-regression, C19 — completed green on `ed50673` (run 36723620658; C19 36723620672; the Redis recheck #62's); the owner's review of 2026-09-30 held it for B90-F1 (the lagging subscription's backlog — corrected in 0096 above `ed50673`, §B90.11); after #69 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision. On 2026-10-01 its run at `5aeb70f` (36775390596) failed; B90-F1's second pass (0098, `ea1f4bb`) and the traced hosted corrections (`da19ef9`) are above it (§B90.13), and its next hosted run is on the new head. **Consolidated into #71 on 2026-10-01:** its head fails C18 alone (0098 without 0097); it stays open with its history and is not merged independently — its content lands with #71.

12. **#71 (B27).** Stacks on #70 (base `phase6-b90`); the records are on it (`audit/CP6_BATCHES.md` §B27 — the three features' B27 clauses built and harness-proven, 72/72 on a fresh database; the residuals assigned to B26, B31, B35, B73, B74, B78, B83 and R2); its hosted checks — build-test with the upgrade proof (migrations 76) and the C18 steps, browser-regression, C19 — must complete on its head; after #70 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision. On 2026-10-01 its run at `21ee226` (36782666166) failed; the corrections (§B90.13) and the completion bookkeeping (§B27.10) are above it, and its next hosted run is on the new head. **Retargeted on 2026-10-01 to `phase6-b36`:** #71 is now the complete B90 + B27 candidate (it contains #70's head and migrations 0095–0098 in order, so C18's contiguity holds); after #69 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision. #72 (B31) stays stacked on it. Merging or closing #70 and #71 remains the owner's decision; #62 is separate.
13. **#72 (B31).** Stacks on #71 (base `phase6-b27`); the records are on it (`audit/CP6_BATCHES.md` §B31 — F-P5-09 complete by the rows, F-P5-06 and F-P5-07 partial with their residuals named, the unplaced ones for the owner); its hosted checks run on the PR's head; after #71 merges, retarget to `main`, merge `main` in, checks on the new head → the owner's decision.
14. **#73 (B35).** Stacks on #72 (base `phase6-b31`); the records are on it (`audit/CP6_BATCHES.md` §B35 — the four features advanced, each completing after its remaining construction); its hosted checks run on the PR's head; after #72 merges, retarget, merge the base in, checks on the new head → the owner's decision.
15. **N-01 (0102).** Stacks on #73 (base `phase6-b35`), where the complete history 0001–0101 exists. The bounded correction is not a new audit; it merges last in this sequence. After #73 merges: retarget, merge the base in, checks on the new head, then merge under the standing authorization. B30 (0103) stacks on it.

16. **B30 (0103).** Stacks on N-01 (base `phase6-n01`). After N-01 merges: retarget, merge the base in, checks on the new head, then merge under the standing authorization.

**Progress, 2026-10-02.** Each merge was made on its verified exact head; each main chain is recorded. Main's two red runs were corrected FORWARD, never re-run on their own.
- **#62** at `cd8428f`. Its refreshed run first failed supply-chain, because the scanners' data had moved. The reviewed pins were carried, plus fast-uri 3.1.8 and the stack's gitleaks exceptions (see the heads table). Merged as `1f51373`.
  - **The red run.** Main's C17 finalize 37010824759 refused the recorded development closure: 320 expected, 313 measured. multer 2.4.0 drops `concat-stream` and its six-package subtree.
- **#75** at `58caf9b`. It moves the measured closure to 313, reconciled package by package. The verifier now expects the closure the VERIFIED SOURCE declares; the first head's C19 dry-run had refused the last real publication, measured 320. Merged as `045a1a9`.
  - **The red run.** Main's ci 37018370741 failed `phase6-retention-b14` H2: the demonstration https recipient's early 401 raced the streamed archive. It did not reproduce locally (5/5).
- **#76** at `59c7bb1`. The recipient's mode `unauthorized` reads the body first. Merged as `b92715b`.
  - **Main's chain completed:** ci 37024091653, C19 lifecycle 37024091441, C17 finalize 37026993556, C19 anchor 37027137960.
- **#60** at `6d94438`, with main brought in three times. Merged as `144e1f2`.
- **#61** at `665e89b`, with main merged in. Merged as `d364591`.
  - **A5 on the earlier head `4a0a15c`.** It failed (foreign 1.79 ms against absent 8.79 ms). Its existing per-probe diagnostics (the A5 hunk of `da19ef9`) were carried unchanged. On `665e89b` the ratio was 1.0007.
- **#63** at `98c03cb`. Merged as `e1a090c`.
- **#64** at `4503964`. Merged as `449fc3f`.
  - **Conflicts with main:** the maintenance pins and `.gitleaks.toml` were taken from main (the superset). DELIVERY_PLAN keeps both main's PLAN-F4 residual and B24's B24-F2 row.
- **#65** at `01b6620`. Merged as `b450e0c`.
  - **The `phase6-review-corrections` `max_items` stop case** ("stopped" expected, "finished" received; ci 36632094289) did not recur. It is recorded, not relabelled.
  - **Main's ci on `b450e0c`:** attempt 1 was CANCELLED at its 30-minute job bound with every test step passed. It was re-run in full.
- **#66** at `3c4886d`. Merged as `ea3346f`.
  - **Main's ci on `ea3346f`** (run 37065675852) was cancelled at the same 30-minute bound.
- **#78** at `d1b9495`. Merged as `68fca69`.
  - **The fix.** It carries the reviewed B34 change `a9b2e6d` to main: build-test's budget 30 → 55 minutes, and the integration step's own 28-minute bound. This corrected the cancellations forward.
- **#67** at `709bf73`. Merged as `45c1cd3`.
- **#68** at `6185e51`. Merged as `812f9e8`.
  - CodeRabbit posted no status on that head. Its only status on every other head is "Review skipped". This is stated, not waived.
- **#69** at `5775b87`. Merged as `942de35`.
- **#71** at `f1c1e24`. Merged as `dbedf8b`.
  - **The consolidated B90 + B27.** Migrations 0095–0098 are contiguous, and every applied filename and byte is unchanged.
  - **#70** stays open with its history and is not merged.
- **#72** at `604989a`. Merged as `7195aeb`.
  - **A5 on the first run.** Its diagnostics showed ONE stalled foreign probe: 176.12 ms among 3.4–4.2 ms. The threshold and the statistic are unchanged.
  - **A5 on the full re-run:** ratio 1.0123, with stalls on both sides. Both are recorded for H1.
- **#73** at `4b176bc`. Merged as `41b3fe1`.
- **#74** (N-01) at `d2b325f`. Merged as `b952b46`, after main's chain for `41b3fe1`.
- **#77** (B30) at its verified head `2c04441`. Merged as `3779079`.
  - **Two corrections on the way, each found by its own hosted run:**
    - `pnpm boundaries` found a circular import (fixed in `e0bcaa3`);
    - the `phase6-commitments-b34` O1 read-before-applied race (fixed in `2c04441`; the assertion is unchanged).
  - **Main's chain for `3779079`:** ci 37096472221 → C17 finalize 37098742587 → C19 anchor 37098830166, all succeeded.
  - **C19 lifecycle 37096472256:** attempt 1 FAILED. Its `lifecycle (macos-14)` job failed the C19 "DELIBERATE EVASION" control: the evader was not alive at 300 ms. Attempt 2, a FULL re-run of every job, succeeded.
    - **What is known:** the merge changed no gate, workflow or lifecycle file. The control passed 5/5 locally on macOS, and passed on #77's own head and on every earlier main chain.
    - **What is not known:** a passing retry does not prove the first failure's cause. It is recorded as unexplained, a hosted macOS runner effect suspected; the boundary is unchanged.
- **The sequence is complete.** Main was `3779079`. #70 is open and not merged.
- **After the sequence: #79** (B30-F, migration 0104, the bounded publication concern of §B30.8) at its verified head `de9db6a`, after main's chain for `3779079` had completed.
  - Hosted on `de9db6a`: ci 37192237056 succeeded. build-test ran integration 1843/1843, API unit 3199 plus 9, web 244 and acceptance 58; supply-chain and browser-regression also passed. C19 lifecycle 37192237062 succeeded (ubuntu, macos, delivery-chain-dry, foreign-checkout-pinning). CodeRabbit: "Review skipped".
  - Merged as `97d87ed` (2026-10-04) under the owner's standing merge authorization.
  - Main's chain for `97d87ed`: ci 37194638684 → C19 lifecycle 37194638669 → C17 finalize 37196895886 → C19 anchor 37196965854 (created after the finalize), all succeeded on their first attempt.
- **Every main chain** (ci, C19 lifecycle, C17 finalize, then the C19 anchor that follows the finalize) completed successfully before the next merge.


**Diagnostics rules carried with the sequence (2026-10-02).**
- **#61's A5.** The threshold and the statistic are preserved. If it fails again, its existing per-probe samples (`da19ef9`) are read first; nothing else changes before that.
- **#65.** If `phase6-review-corrections` again reports "expected 'stopped', received 'finished'", the actual stop-condition failure is diagnosed on that run. It is not relabelled as A5 or as the older C18 timing failure.

**Completion assignments (unchanged, recorded once).**
- F-P5-06 → B73
- F-P5-07 → B26
- F-P5-09 → B31, complete by rows only
- F-P6-01 → B73
- F-P6-02 and F-P6-03 → B26
- F-P6-06 → B100

**What these assignments do not establish.**
- Construction effort and the actual dependencies are retained.
- Passing the 58-case acceptance harness is not full-product acceptance.
- The three-account schedule is a scenario, not an authorization for additional accounts.
- The B103, R2 and H1 residuals stay assigned.
- The Decision Agent demo substitution stays B73's: it is not completed agent-runtime integration.

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
