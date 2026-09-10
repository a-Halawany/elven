# Stack integration plan — placing the maintenance change-set first

Prepared 2026-09-11 by inspection only. No branch was checked out, rebased or merged. Every merge
result below comes from `git merge-tree --write-tree` (three-way, no working tree) against a
synthetic maintenance-only commit built with `git commit-tree`; those objects are dangling probes,
not refs.

**The problem, restated in evidence.** All nine heads share the merge base `4491c7f` (`main`) and are
strictly ahead of it (`git merge-base main <ref>`; `git rev-list --count <ref>..main` = 0 for all
nine). Eight of the nine pin the official images that make C15 red:

    main:docker-compose.yml         postgres@sha256:9a8afca5…   redis@sha256:978f0e01…
    ef85a12:docker-compose.yml      ghcr.io/a-halawany/elven/postgres@sha256:69a974ae…
                                    ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24…

Every maintenance path is byte-identical to `main` on #36, #38, #40, #41, #43, #44 and #45 — verified
by comparing `git rev-parse <ref>:<path>` against `main:<path>` for 19 paths across 8 refs. Only #39
diverges, on four files. So the maintenance work is not entangled with product code; it simply sits
on the wrong end of the order.

---

## 1. The maintenance change-set

165 files, `git diff --stat main <synthetic>`. Grouped by function, with the commit that introduced
each and its coupling to Phase 6 code.

| Group | Paths | Introduced by | Depends on Phase 6? |
|---|---|---|---|
| GHCR re-pin | `docker-compose.yml`, `conformance.manifest.json` | `c9d3d68` (compose also `54d8ecc`, Redis process protections) | No |
| Dispositions | `scripts/gate/scanner-exclusions.json`, `docs/SCANNER_DISPOSITIONS.md` | `c9d3d68` | No |
| Upstream monitor | `scripts/gate/check-patched-images.mjs`, `scripts/gate/lib/c19-patched-images.mjs`, `.github/workflows/c15-patched-image-recheck.yml` | `c9d3d68` | No |
| Gate — FINAL manifests | `scripts/gate/assert-final-manifests.mjs` | `ea8edb2` | No |
| Gate — C18 secret handoff | `scripts/gate/c18-db-paths.mjs`, `scripts/gate/lib/c18-contract.mjs`, `scripts/gate/lib/c18-query-plan.mjs` | `ea8edb2`, `c9d3d68`; query-plan `75baf23` then **`ef85a12` (unpushed)** | No |
| Gate — legacy compose view | `scripts/gate/legacy-compose-view.mjs` *(new)*, `apps/api/test/gate/docker-compose.yml` | `d4730f2` | No |
| Publisher | `.github/workflows/publish-derived-images.yml` *(new)*, `infra/images/**`, `docs/images/**` (131 files, all new) | `a269deb`, `54d8ecc`, `b30242f` | No |
| C15 trace / receipt fixtures | `fixtures/c15-trace/**` (7), `fixtures/real-image-results.json`, `helpers/{fake-scanner,evidence-fixture-r34}.ts`, `c15-patched-recheck.suite.ts`, `c15-runner-behaviour.test.ts`, `final-receipt-semantics.test.ts`, `receipt-{contract,invariants}.test.ts` | `c9d3d68` | No |
| Gate — C18 tests | `apps/api/test/gate/c18-db-paths.test.ts`, `c18-mutation-controls.suite.ts` | `d4730f2`, `ef85a12` | No |
| Secret-scanner allowlist | `.gitleaks.toml`, `scripts/gate/supply-chain.mjs` | `59a2459` | No |
| CI maintenance steps | `.github/workflows/ci.yml` | `d4730f2` (legacy-view check), `c9d3d68` (recheck rename) | No |

**Coupling checked, not assumed.** Grepping the ten gate/config files at `ef85a12` for
`phase6|executive|decision_pack|004[1-9]_|0050_` returns only `policy.policy_decisions` — a Phase 0
table named in `c18-db-paths.mjs:893` and `c18-contract.mjs:313`. Nothing in the change-set reads
Phase 6 code, schema or migrations. `infra/images/**` and `docs/images/**` do not exist at `main`
(`git ls-tree -r main infra/images docs/images` → 0 entries), so they are pure additions everywhere.

**One structural change to flag:** `apps/api/test/gate/docker-compose.yml` is a *symlink* at `main`
(`120000 blob b4d69e1` → `../../../../docker-compose.yml`) and becomes a 95-line *generated regular
file* (`100644 blob e95e63c`). The frozen C18 differential verifiers under
`fixtures/c18-legacy-*/` predate registry-qualified image names, so once the live compose says
`ghcr.io/a-halawany/elven/postgres@…` the symlink would feed them a spelling they cannot parse.
`legacy-compose-view.mjs` regenerates the view with the same digests in the pre-registry spelling,
and `ci.yml` stale-checks it, blocking, immediately before the C18 gate.

**Deliberately excluded from the change-set.** `038fa9f` ("security maintenance · dependency pins,
sharp-libvips 1.3.3") is *mixed*: alongside `pnpm-lock.yaml`, `scripts/gate/bundled-components.json`
and `vendor/…/sharp-libvips/1.3.3/**` it edits `apps/api/src/executive/agents/agents.service.ts` and
`apps/api/test/int/phase6-residual-corrections.test.ts` — Phase 6 product code that cannot exist on
#39. It cannot be cherry-picked whole. See §5.

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
(`978f0e01…`) at `main`, and 7 GHCR references at `ef85a12`. `fixtures/real-image-results.json`
carries 2 GHCR references at `ef85a12` and none at `main`. A head that took the compose re-pin
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
| #46 | `3d7a378` | `scheduling/…` | CONFLICT ×1, `scripts/gate/lib/c18-query-plan.mjs` | 0041–0050 (50) | **Push `ef85a12`** (§5). Then drop the maintenance commits it no longer needs to own. |

No branch pins the images independently. All eight non-#46 heads reference the official digests in
exactly the same ten files as `main`, byte-identical — so a merge of the updated base brings the new
pins with no per-branch edit. Three of those ten (`evidence/supply-chain/trivy-image-*.txt`,
`evidence/test-runs.txt`, `docs/evidence/govulncheck-gosu-b6a16ed0.json`) are *not* in the
change-set and still name the official digests at `ef85a12`. They are gate **outputs**
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
| 9 | #46 | `3d7a378` (+`ef85a12`) + merge base | `scheduling/…` → main | maintenance already on main; only Phase 6 remains | full chain; 0001–0050 | C17 zip |

**Fresh full-chain runs required at every step.** Each head's PR run must be re-triggered after it
merges its base, because the C15/C16/C17 manifests are bound to the exact head SHA
(`assert-final-manifests.mjs "$C15_OUT" "$C16_OUT" "$GITHUB_SHA"`). Steps 1, 3, 5, 7 and 9 change
gate inputs materially (pin, or migrations); steps 2, 4, 6 and 8 are doc-only or inert but still need
a run bound to the new merge SHA.

**Simulated end state.** Replaying the recorded order with the change-set folded into #39
(`git merge-tree` + `git commit-tree`, nine steps) yields the GHCR pin on `main` from **step 1
onward**, and 50 contiguous migrations at the end. Replaying it as the stack stands today yields the
GHCR pin only at **step 9**. That is the whole of the reviewer's point, and the whole of the fix.

---

## 5. Blockers — what ordering alone does not solve

1. **`ef85a12` is unpushed.** `git branch -r --contains ef85a12` returns nothing. The local
   `phase6-decisions` is one commit ahead of PR #46's head `3d7a378`, and that commit carries a real
   maintenance fix (`c18-query-plan.mjs`: the secret handoff binds one argv per ledger shape, so a
   root-running image passes its own producer's shape) plus 99 lines of `c18-db-paths.test.ts`. It is
   the *only* reason #46 conflicts with the change-set. **Push it before anything else**, or the set
   that lands on #39 will be one fix short of the reviewed state.

2. **`PROGRESS.md` conflicts three times** — at #38, #40 and #41, in both the current and the
   corrected simulation. Four branches edit the same running log (`#36`, `#40` and `#41` all touch
   it). Pre-existing, unrelated to maintenance, and unavoidable: it needs a human resolution at each
   of those three merges. Not a candidate for automation.

3. **`038fa9f` cannot be split by path alone.** Moving the dependency pins (sharp-libvips 1.3.3,
   `pnpm-lock.yaml`, `bundled-components.json`) earlier would drag
   `apps/api/src/executive/agents/agents.service.ts` with them, and that file's directory does not
   exist before #46. Either leave the whole commit on #46 — accepting that C17's bundled-stack
   assertion (`apps/api/test/gate/c17-bundled-stack.test.ts`) reflects 1.3.2 for steps 1–8 — or
   author a *new*, product-free maintenance commit on #39 carrying only the lock/vendor/manifest
   halves. The second is cleaner but is new work, not a re-ordering, and needs its own C17 run.

4. **A migration in flight, outside the stack.** The working tree carries an untracked
   `apps/api/migrations/0051_source_run_lease_and_admission_register.sql` (another track). It takes
   0051, immediately above #46's 0050, so it does not collide — but it is only valid once #46 has
   landed. Whoever owns it must not renumber downward into the stack.

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
| #46 | 50 | + 0041–0050 |

Merged in the recorded order the ledger stays contiguous at every step: 27 → 31 → 37 → 40 → 50. This
matters because `c18-contract.mjs` line ~224 fails on `migration sequence broken at '<f>'` if the
tracked set has a gap. **The recorded order is what keeps it contiguous** — merging #44 before #41
would open a 0032–0037 gap.

**No migration-count gate is at risk.** `verifyMigrationLedger` compares against
`MIGRATION_COUNT_HISTORICAL = 12` / `MIGRATION_COUNT_LATEST = 21`, with
`HISTORICAL_LAST = '0012'` and `LATEST_LAST = '0021'` — identical constants on all ten refs,
including #46 with its 50 migrations. C18's two paths are bound to the Phase 0/Phase 2 boundary and
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
