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
| #64 B24 | `phase6-b24` → `phase6-b23` | `3409418` (B24-F1; records on top) — ci 36242673225: build-test 1183/1183, browser and C19 36242673205 green | `supply-chain` red (the redis recheck) until #62 is on its base; build-test (integration 1182/1182), browser-regression and C19 36164183865 green (ci 36164184010); holds the limiter fix (same patch as #61's `45fda0f`) and 0086 |

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
  - Redis explains only the `supply-chain` red, not this one.

## 3. What is never done in this sequence

No blanket approval; no merge on a pending or timed-out check; no `--failed` re-run on `main`; no waiver of C15–C19; no rewrite of an applied migration (0084 stays as applied; its correction is 0085); no live recreation without its own word.
