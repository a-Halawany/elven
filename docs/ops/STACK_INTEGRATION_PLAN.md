# Stack integration plan — placing the maintenance change-set first

Prepared 2026-09-11 by inspection only, from the corrected head of `phase6-decisions`
(`0c09274`, the head the review at `461a2b56` asked the plan to be refreshed from; PR #46's remote
head is behind it until pushed). No branch was checked out, rebased or merged. Every merge result
below comes from `git merge-tree --write-tree` (three-way, no working tree) against a synthetic
maintenance-only commit (`72125d4`, built with `git read-tree main` + `git update-index` from HEAD's
blobs + `git commit-tree`); the object is a dangling probe, not a ref. This supersedes the version
prepared from `ef85a12`/`3d7a378`, which predated the two-platform gate, the arm64 records,
migrations 0051–0056 and the recovery scripts.

**The problem, restated in evidence.** All nine heads share the merge base `4491c7f` (`main`) and are
strictly ahead of it. Eight of the nine pin the official images that make C15 red:

    main:docker-compose.yml         postgres@sha256:9a8afca5…   redis@sha256:978f0e01…
    0c09274:docker-compose.yml      ghcr.io/a-halawany/elven/postgres@sha256:69a974ae…
                                    ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24…

Every maintenance path is byte-identical to `main` on #36, #38, #40, #41, #43, #44 and #45; only #39
diverges, on the same four files as before. The maintenance work is not entangled with product code;
it sits on the wrong end of the order.

---

## 1. The maintenance change-set

179 files, `git diff --stat main 72125d4` (43,349 insertions, 5,700 deletions): 45 gate/config/test
paths that changed on #46 after its base (`c546046`) and 134 pure additions under `infra/images/**`
and `docs/images/**`. Grouped by function, with the commit that last touched each and its coupling
to Phase 6 code.

| Group | Paths | Last touched by | Depends on Phase 6? |
|---|---|---|---|
| GHCR re-pin | `docker-compose.yml`, `conformance.manifest.json` | `c9d3d68` (compose also `54d8ecc`, Redis process protections) | No |
| Dispositions (both platforms) | `scripts/gate/scanner-exclusions.json` (SCX-0002…0005 amd64, SCX-0010/0011 arm64), `docs/SCANNER_DISPOSITIONS.md`, `docs/images/ARM64_RISK_DECISION.md` | `929265b` | No |
| Two-platform C15 gate | `scripts/gate/supply-chain.mjs`, `lib/scanner-provenance.mjs` (`SCAN_PLATFORMS`), `lib/scanner-exclusions.mjs`, `lib/verification-contract.mjs`, `assert-final-manifests.mjs` | `f011cc1` | No |
| Upstream monitor | `scripts/gate/check-patched-images.mjs`, `scripts/gate/lib/c19-patched-images.mjs`, `.github/workflows/c15-patched-image-recheck.yml` | `c9d3d68` | No |
| Gate — C18 secret handoff | `scripts/gate/c18-db-paths.mjs`, `lib/c18-contract.mjs`, `lib/c18-query-plan.mjs` | `ea8edb2`, `c9d3d68`, `ef85a12` (**pushed**, in `461a2b5`'s history) | No |
| Gate — legacy compose view | `scripts/gate/legacy-compose-view.mjs` *(new)*, `apps/api/test/gate/docker-compose.yml` (symlink → generated file, see below) | `d4730f2` | No |
| Publisher + published evidence | `.github/workflows/publish-derived-images.yml` *(new)*, `infra/images/**`, `docs/images/**` (134 files, all new; includes the arm64 govulncheck evidence `infra/images/published/20260910/gosu-arm64-3a8ef022.govulncheck.{txt,json}`) | `a269deb`, `54d8ecc`, `b30242f`, `929265b` | No |
| C15 trace / receipt fixtures | `fixtures/c15-trace/**` (13: both index children, `trivy-image-0..3`), `fixtures/real-image-results.json`, `helpers/{fake-scanner,evidence-fixture-r34,hermetic-adapter}`, `c15-patched-recheck.suite.ts`, `c15-runner-behaviour.test.ts`, `c15-scanner-provenance.test.ts`, `final-receipt-semantics.test.ts`, `receipt-{contract,invariants}.test.ts`, `hermetic-suite-meta.test.ts`, `source-anchored-reconstruction.test.ts` | `c9d3d68`, `f011cc1` | No |
| Gate — C18 tests | `apps/api/test/gate/c18-db-paths.test.ts`, `c18-mutation-controls.suite.ts` | `d4730f2`, `ef85a12` | No |
| Secret-scanner allowlist | `.gitleaks.toml`, `scripts/gate/supply-chain.mjs` | `59a2459` | No |
| CI maintenance steps | `.github/workflows/ci.yml` | `d4730f2` (legacy-view check), `c9d3d68` (recheck rename) | No |

**Coupling checked, not assumed.** Grepping the gate/config files of the set at `0c09274` for
`phase6|executive|decision_pack|004[1-9]_|005[0-6]_` returns only `policy.policy_decisions` — a Phase 0
table named in `c18-db-paths.mjs` and `c18-contract.mjs`. Nothing in the set reads Phase 6 code,
schema or migrations. `infra/images/**` and `docs/images/**` do not exist at `main`, so they are pure
additions everywhere.

**Deliberately NOT in the set, and why.**

* **`scripts/ops/**` (backup, restore, guards, build identity, bundle crypto) and
  `docs/ops/**`.** `restore.sh` reads `observation.scheduled_attempts`, `scheduler_entries` and
  `schedules_to_reconcile()` (migration 0038, PR #44) and `audit.open_availability_incidents()`; the
  scripts are product-coupled to the Phase 5/6 schema and stay on #46 (or any head at or after #44).
* **`scripts/phase1/verify-0022-upgrade.mjs`** — its ledger count (35 = 0022–0056) is #46's.
* **The dependency maintenance of `038fa9f`** — see §5 item 3: it is authored as a new, product-free
  commit for #39, not carried across.

**One structural change to flag:** `apps/api/test/gate/docker-compose.yml` is a *symlink* at `main`
(`120000 blob b4d69e1` → `../../../../docker-compose.yml`) and becomes a 95-line *generated regular
file*. The frozen C18 differential verifiers under `fixtures/c18-legacy-*/` predate registry-qualified
image names, so once the live compose says `ghcr.io/a-halawany/elven/postgres@…` the symlink would feed
them a spelling they cannot parse. `legacy-compose-view.mjs` regenerates the view with the same digests
in the pre-registry spelling, and `ci.yml` stale-checks it, blocking, immediately before the C18 gate.

**The arm64 records are in the set, and they are provisional.** SCX-0010/0011 govern the arm64 child
technically (the gate reconciles both platforms) but have no attributable approver yet
(`docs/images/ARM64_RISK_DECISION.md`). Landing the set on #39 makes the gate green on both platforms
with those records in place; it does **not** approve them, and the live rollout on an arm64 host stays
blocked on the decision. If the decision is Option B (re-issue as NOT_AFFECTED), the new records land
as one more maintenance commit on whichever head is current at the time — the set is not frozen.

---

## 2. Does it apply to #39, the first head?

`git merge-tree --write-tree maintenance/c15-image-recheck-2026-09 <synthetic>` → **conflict, four
files.** Every other path merged clean, because #39 does not touch them.

| File | Why it conflicts | Resolution |
|---|---|---|
| `scripts/gate/lib/c19-patched-images.mjs` | Both sides rewrite the same watch table. #39 (`4420356`) adds the util-linux CVE-2026-53612 family beside `OPENSSL_FIX`; the maintenance version keeps both **and adds `c-ares` CVE-2026-33630** and per-platform resolution. | Take the maintenance version — it is a strict superset. Confirmed by grep: both carry the same seven util-linux CVEs and `OPENSSL_FIX`; only maintenance carries `c-ares`. |
| `scripts/gate/check-patched-images.mjs` | Same file, two generations of the same monitor. | Take the maintenance version. |
| `apps/api/test/gate/c15-patched-recheck.suite.ts` | #39 extends the suite for its watch table; maintenance re-records it against the derived artefacts. | Take the maintenance version. |
| `.github/workflows/ci.yml` | Adjacent edits to one hunk. #39 (`8cc6d25`) adds `if: always() && env.C15_OUT != ''` so the recheck survives a red gate. Maintenance rewrites the same comment block and renames the step to *"fails when a compatible fixed official image exists"*. | **Hand-merge:** keep the maintenance comment + step name **and** re-add #39's `if:` guard. This is the one line that a "take theirs" resolution would silently drop. |

Nothing in the change-set is missing at `main`. Of 21 representative paths checked with
`git cat-file -e <ref>:<path>` across all nine heads plus `main`, only two do not exist anywhere yet
— `scripts/gate/legacy-compose-view.mjs` and `.github/workflows/publish-derived-images.yml` — and
both are additions, so they cannot conflict. There is no "gate script added in a later phase" that
the change-set depends on.

**Fixtures pinned by digest — the reason fixtures must travel with the pin.**
`fixtures/c15-trace/trace.json` contains the official digest strings 4× (`9a8afca5…`) and 4×
(`978f0e01…`) at `main`, and the GHCR references (both index children) at `0c09274`.
`fixtures/real-image-results.json` carries the GHCR references at `0c09274` and none at `main`. A head that took the compose re-pin
without these fixtures would fail the C15 receipt tests, and vice versa. They are one atomic unit.

---

## 3. What each of the nine heads needs

Verified by merge-tree of the synthetic change-set into each head individually.

| PR | Head | Base | Merge of the set | Migrations added | Extra work before its chain passes |
|---|---|---|---|---|---|
| #39 | `7259c49` | main | **CONFLICT** ×4 (§2) | none (27) | Resolve the four files; keep the `if:` guard. This is where the set lands. |
| #36 | `63a6c9f` | main | CLEAN | none (27) | None. Doc-only (`PHASE3_REPORT.md`, `PHASE4_DATA_READINESS_PLAN.md`, `PHASE4_PORTWATCH_PERMISSION_REQUEST.md`, `PROGRESS.md`). Merge `main`. |
| #38 | `879ce2d` | main | CLEAN | 0028–0031 (31) | Merge `main`; resolve `PROGRESS.md` (§5). |
| #40 | `9e33e97` | main | CLEAN | none (27) | None beyond `PROGRESS.md`. Doc-only. |
| #41 | `f527446` | `phase4-prediction` | CLEAN | 0032–0037 (37) | Merge base; resolve `PROGRESS.md`. |
| #43 | `6086de4` | `phase5-twins` | CLEAN | none (37) | None. Merge base. |
| #44 | `c546046` | `integrations/…` | CLEAN | 0038–0040 (40) | None. Merge base. |
| #45 | `4f88381` | main | CLEAN | none (27) | None. Doc-only (`PHASE6_BUILD_PLAN.md`). |
| #46 | `0c09274` (remote `87d3297` until pushed) | `scheduling/…` | CLEAN at `0c09274` — the set is a subset of it (the remote head conflicts on the two disposition files only because it is behind) | 0041–0056 (56) | Push the local head. Then, once the set is on `main`, #46's merge of its base brings nothing new for these paths. |

No branch pins the images independently. All eight non-#46 heads reference the official digests in
exactly the same ten files as `main`, byte-identical — so a merge of the updated base brings the new
pins with no per-branch edit. Three of those ten (`evidence/supply-chain/trivy-image-*.txt`,
`evidence/test-runs.txt`, `docs/evidence/govulncheck-gosu-b6a16ed0.json`) are *not* in the
change-set and still name the official digests at `0c09274`. They are gate **outputs**
(`scripts/gate/supply-chain.mjs:1086` writes `evidence/supply-chain`) or fixed evidence bound by
path from `scanner-exclusions.json:146`, not gate inputs. They are stale history, not a failure.

The gate that catches a half-applied re-pin is the `supply-chain` job's first step, **"Pinned-digest
consistency (compose == conformance manifest)"**; the C15 FINAL gate then scans exactly those
digests.

---

## 4. Recommended sequence

The recorded order is preserved exactly: **#39 → #36 → #38 → #40 → #41 → #43 → #44 → #45 → #46.**

**Never rebase.** Every one of these heads has been reviewed at its current SHA (#46's review record
runs from `09abd095` through `07edd9dc`). Each branch takes the maintenance work by **merging its
base**, which preserves the reviewed commits and records the integration as a merge. Do not rebase,
squash or force-push any reviewed head.

The push-only **C17 evidence archive** runs in the `supply-chain` job at
`ci.yml` step *"Package + verify the C17 evidence archive"*, gated `if: github.event_name !=
'pull_request'` with `--profile ${{ github.event_name == 'push' && 'delivery' || 'candidate' }}`, and
the workflow's `push:` trigger is `branches: [main]`. So the delivery-profile archive is produced
**once per merge, on `main`, after the merge lands** — nine archives, one per step. A PR run executes
every C15–C17 gate but deliberately skips the archive.

| Step | PR | Head | Base | What must be present | Checks green | Artefact of proof |
|---|---|---|---|---|---|---|
| 1 | #39 | `7259c49` + maintenance merge | main | Full change-set; `if:` guard kept | build-test, browser-regression, supply-chain (C15 FINAL, recheck, C16, C17, C18 + legacy-view check) | delivery-profile C17 zip on `main` |
| 2 | #36 | `63a6c9f` + merge main | main | GHCR pin inherited | full chain | C17 zip |
| 3 | #38 | `879ce2d` + merge main | main | pin inherited; `PROGRESS.md` resolved | full chain; migrations 0001–0031 contiguous | C17 zip |
| 4 | #40 | `9e33e97` + merge main | main | pin inherited | full chain | C17 zip |
| 5 | #41 | `f527446` + merge base | `phase4-prediction` → main | pin inherited; `PROGRESS.md` | full chain; 0001–0037 | C17 zip |
| 6 | #43 | `6086de4` + merge base | `phase5-twins` → main | pin inherited | full chain | C17 zip |
| 7 | #44 | `c546046` + merge base | `integrations/…` → main | pin inherited | full chain | C17 zip |
| 8 | #45 | `4f88381` + merge main | main | pin inherited | full chain | C17 zip |
| 9 | #46 | `0c09274` + merge base | `scheduling/…` → main | maintenance already on main; Phase 6, migrations 0041–0056, `scripts/ops/**`, the audit and the recovery records remain | full chain; 0001–0056 | C17 zip |

**Fresh full-chain runs required at every step.** Each head's PR run must be re-triggered after it
merges its base, because the C15/C16/C17 manifests are bound to the exact head SHA
(`assert-final-manifests.mjs "$C15_OUT" "$C16_OUT" "$GITHUB_SHA"`). Steps 1, 3, 5, 7 and 9 change
gate inputs materially (pin, or migrations); steps 2, 4, 6 and 8 are doc-only or inert but still need
a run bound to the new merge SHA.

**Simulated end state.** Replaying the recorded order with the change-set folded into #39
(`git merge-tree` + `git commit-tree`, nine steps) yields the GHCR pin on `main` from **step 1
onward**, and 56 contiguous migrations at the end. Replaying it as the stack stands today yields the
GHCR pin only at **step 9**. That is the whole of the reviewer's point, and the whole of the fix.

---

## 5. Blockers — what ordering alone does not solve

1. **The local head is ahead of PR #46's remote head.** `0c09274` carries, beyond `87d3297`: migration
   0056 (the lease fences every effect), the recovery corrections R1/R2/R4 and the fifth drill, the arm64
   analysis and decision record, the "seven" correction with the re-bound dispositions digest, and the
   connector code-digest change. Two of those (`scanner-exclusions.json`, `SCANNER_DISPOSITIONS.md`)
   are in the maintenance set, which is why merge-tree against the *remote* head reports a conflict on
   exactly those two files and against the local head reports clean. **Push before anything else.**

2. **`PROGRESS.md` conflicts three times** — at #38, #40 and #41 (four branches edit the same running
   log: #36, #38, #40, #41). Pre-existing, unrelated to maintenance, and unavoidable: it needs a human
   resolution at each of those three merges. Not a candidate for automation.

3. **`038fa9f` is mixed and is not cherry-picked.** It carries the dependency maintenance (next
   16.2.12 → 16.3.3, sharp override exact 0.35.4, multer exact 2.3.0, vitest 4.1.11 in all four
   workspaces; `pnpm-workspace.yaml` overrides; `scripts/gate/bundled-components.{json,mjs}`,
   `source-offers.json`, `vendor/sharp-libvips/1.3.3/**`, `c17-bundled-stack.test.ts`) together with
   Phase 6 product code (`agents.service.ts`, `phase6-residual-corrections.test.ts`, two browser
   screenshots, the report and the register). **The selected changes** for #39 are the dependency
   halves only, authored as a NEW product-free commit on #39:
   * `pnpm-workspace.yaml` overrides (`sharp: 0.35.4`, `multer: 2.3.0`, and the existing `nanoid`,
     `fast-uri`, `qs`, `postcss` lines);
   * the version bumps in `apps/web/package.json` (next 16.3.3), and vitest 4.1.11 in the four
     workspace `package.json` files **that exist at #39** (`apps/api`, `apps/web`, `packages/contracts`,
     `packages/tokens`);
   * `pnpm-lock.yaml` **regenerated on #39's own tree** (`pnpm install --lockfile-only` after the
     edits above, then `pnpm install --frozen-lockfile` to prove it) — HEAD's lockfile cannot be
     copied: it resolves Phase 4–6 dependencies (`bullmq`, `ioredis`, …) that #39's manifests do not
     declare, and a frozen install would refuse it;
   * `scripts/gate/bundled-components.json`, `scripts/gate/lib/bundled-components.mjs`,
     `scripts/gate/source-offers.json`, `vendor/sharp-libvips/1.3.3/**` and
     `apps/api/test/gate/c17-bundled-stack.test.ts`, byte for byte from `0c09274`.
   That commit needs its own C15 (pnpm audit clean) and C17 (licence inventory, bundled stack 1.3.3)
   run on #39 before step 1 is proven. Until it lands, C17's bundled-stack assertion reflects 1.3.2
   on steps 1–8 and the C15 dependency audit on `main` still reports the findings `038fa9f` closed.

4. **The four-file conflict at #39** (§2) is unchanged; the `ci.yml` `if:` guard is still the one line
   a "take theirs" resolution would drop.

5. **The arm64 risk decision** (`docs/images/ARM64_RISK_DECISION.md`) is not a merge blocker — the gate
   is green on both platforms with the provisional records — but it is a **rollout** blocker on any
   arm64 host, and Option B would add one more maintenance commit (new records, retirements) to whichever
   head is current.

6. **The upstream recheck on `main` is still the old one.** `c15-patched-image-recheck.yml` on `main`
   runs daily at 12:16 UTC with its pre-repurpose meaning (fixed util-linux in the official image); the
   repurposed workflow ("a compatible fixed official image exists for each service") is in the set and
   takes effect on `main` at step 1. Its last run before this plan was 2026-09-10 12:16 UTC, `success`.

7. **Tracked separately, not blockers of the order:** the stalled scheduled tick (a job that stops
   making progress is neither finished nor failed and nothing says so — the lease expiry now releases
   the source; the observation stands), the outbox publisher crash during a correction (`capability
   denied: mode publish required (context is none)`), and the three local `phase5-twins` staleness
   failures under full-suite load on the long-lived harness database (15/15 in isolation, green on
   CI's fresh database). Each is in `FULL_PRODUCT_DELIVERY_REGISTER.md` with an owner; none changes
   what lands where.

### Migration-number collisions: none

`git ls-tree -r <ref> apps/api/migrations/` on all ten refs. The stack is strictly nested
(`git merge-base --is-ancestor` confirms #38 ⊂ #41 ⊂ #43 ⊂ #44 ⊂ #46), so every branch inherits its
predecessors' migrations *as the same files*, not as re-numbered copies.

| Ref | Count | New vs `main` |
|---|---|---|
| main, #39, #36, #40, #45 | 27 | — |
| #38 | 31 | 0028–0031 |
| #41 | 37 | + 0032–0037 |
| #43 | 37 | — |
| #44 | 40 | + 0038–0040 |
| #46 | 56 | + 0041–0056 |

Merged in the recorded order the ledger stays contiguous at every step: 27 → 31 → 37 → 40 → 56. This
matters because `c18-contract.mjs` line ~224 fails on `migration sequence broken at '<f>'` if the
tracked set has a gap. **The recorded order is what keeps it contiguous** — merging #44 before #41
would open a 0032–0037 gap.

**No migration-count gate is at risk.** `verifyMigrationLedger` compares against
`MIGRATION_COUNT_HISTORICAL = 12` / `MIGRATION_COUNT_LATEST = 21`, with
`HISTORICAL_LAST = '0012'` and `LATEST_LAST = '0021'` — identical constants on all ten refs,
including #46 with its 56 migrations. `scripts/phase1/verify-0022-upgrade.mjs` (35 lines above the
ceiling) is #46's own check and travels with it. C18's two paths are bound to the Phase 0/Phase 2 boundary and
do not count the phase suites.

---

## 6. What could not be determined without running a merge

- **Whether the resolved #39 goes green.** Merge-tree proves the trees combine; it cannot run C15,
  C16, C17 or C18. In particular the C15 FINAL gate resolves and scans the two GHCR indexes
  live — its result depends on the registry, not on the tree. Step 1 must be proven by an actual CI
  run, not by this document.
- **Whether the derived images remain the right pin.** `c15-patched-image-recheck.yml` (daily,
  07:20 UTC) fails deliberately when a compatible fixed official image appears. If it has fired since
  the re-pin, the change-set's justification has expired and the re-pin must be redone before step 1.
- **The `if:`-guard merge.** I read both sides of the `ci.yml` hunk and describe the correct
  resolution, but I did not produce the merged file. Verify by eye that the resolved step keeps both
  `if: always() && env.C15_OUT != ''` and the new step name.
- **Semantic effects of the clean merges.** Seven heads merge the change-set cleanly at the text
  level. Clean text is not a passing gate; each still needs its own full-chain run (§4).


---

## 7. The stack, PREPARED (2026-09-11) — exact heads, what each carries, its hosted run

Executed as §4 describes, by the owner's instruction "prepare the integration stack": every head
merged its predecessor in the recorded order, nothing rebased or squashed, no reviewed commit
rewritten. The maintenance set landed on #39 as one product-free commit (`65c0f4d`, the 179 files of
§1 taken byte for byte from `phase6-decisions@4ad058f`, #39's `if:` guard kept), the dependency
maintenance as a second (`fd00dfe`: the pins of `038fa9f`, the lockfile regenerated on #39's own tree,
`pnpm audit` clean, C17 bundled stack 1.3.3 32/32, licence gate PASS), and `apps/web/next-env.d.ts`
as next 16.3.3 writes it (`a2cb0d8` — the build regenerates the tracked file and the C18 step refuses
a dirty worktree). Two things ordering alone did not solve appeared in execution and are recorded:

* **git's textual merge of two `pnpm-lock.yaml` files does not satisfy the manifests**
  (`ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY`): every head from #38 on regenerated its lockfile on its own
  tree after the merge, and carried the `apps/web` vitest pin (a workspace #39's tree did not
  declare); each such commit says so.
* The three `PROGRESS.md` conflicts (#38, #40, #41) were resolved by hand: Phase 3 keeps the merged
  status #36 records; Phase 4 and Phase 5 keep the implementing branch's row over the plan's.

| Order | PR | Prepared head | Carries | Hosted `ci` run |
|---|---|---|---|---|
| 1 | #39 | `a2cb0d8` | `7259c49` + maintenance set `65c0f4d` + dependency maintenance `fd00dfe` + `a2cb0d8` | 34620632427 — green (build-test, browser-regression, supply-chain) |
| 2 | #36 | `d458b36` | `63a6c9f` + merges of #39 | 34620663921 — green on attempt 2 (attempt 1: the A5 timing side-channel assertion flaked on the runner, 15 ms vs 1.3 ms; the build-test job re-run alone) |
| 3 | #38 | `1ed69ed` | `879ce2d` + merges of #36 (`PROGRESS.md` by hand) + lockfile on its tree `42c348a` | 34620667803 — green |
| 4 | #40 | `fb18c1f` | `9e33e97` + merges of #38 (`PROGRESS.md` by hand) + lockfile `2e44bbf` | 34620672990 — green |
| 5 | #41 | `9f18468` | `f527446` + merges of #40 (`PROGRESS.md` by hand) + lockfile `11a8052` | 34620677405 — green |
| 6 | #43 | `34969e8` | `6086de4` + merges of #41 + lockfile `80eb588` | 34620681791 — green |
| 7 | #44 | `41eaa04` | `c546046` + merges of #43 + lockfile `3e8d83c` | 34620686380 — green |
| 8 | #45 | `da47bd3` | `4f88381` + merges of #44 + lockfile `d568a37` | 34620692823 — green |
| 9 | #46 | `1a99784` | `590928f` + merges of #45 (`ci.yml` by hand) + this checkpoint's commits (0057, 0058, CP-4a, the register) | 34621875479 — RUN46_RESULT |

Each PR's required checks run on the synthetic merge of its prepared head with its base; a head that
contains its predecessors passes the same chain it will pass on `main`. The push-only C17 archive is
produced on `main` after each merge and is not part of these runs. **No merge has been made; merging
waits for the owner's explicit instruction**, in this order, one at a time, with the archive verified
after each.
