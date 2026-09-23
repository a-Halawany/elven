# Supply-chain maintenance, 2026-09 — the re-pin that cannot yet be made

Under ADR-P0-01 the monthly cadence re-pins the two Compose images to patched builds within their
major versions and re-scans them as a blocking gate. This note records the September 2026 attempt:
**no patched official image exists for the findings that fail the gate**, so this PR does not
re-pin, adds no waiver, and instead makes the daily C15 recheck the thing that notices the rebuild.

## 1. What fails the gate today

The C15 supply-chain gate on `main` (last green run 2026-09-04) and on PR #38 (2026-09-05) fails
on **13 ungoverned HIGH findings** in the exact pinned digests, all util-linux
(CVE-2026-53612, -53613, -53614, -76642, -78408, -78409, -78410), published to the advisory
database after the last green run:

| Pinned image | Package | Installed | Alpine fix |
|---|---|---|---|
| `postgres@sha256:9a8afca5…` (`postgres:18-alpine`, Alpine 3.24.1) | `libuuid` | 2.42.1-r0 | 2.42.3-r0 (CVE-2026-78408: 2.42.3-r1) |
| `redis@sha256:978f0e01…` (`redis:8-alpine`, Alpine 3.23.5) | `setpriv` | 2.41.4-r0 | 2.41.6-r0 (CVE-2026-78408: 2.41.6-r1) |

## 2. What the registry offers (scanned 2026-09-06 and re-verified 2026-09-08, trivy 0.73.0, linux/amd64)

> **Latest verified check: 2026-09-08 13:21 UTC** (run 34231435056 on this branch, and the same
> script locally). Result: **no patched official image available**. The index digests below are
> the ones the tags resolved to on that date; the affected packages are unchanged since 2026-09-06.
> "No patched image available" in this record refers to that check, not to any earlier one.

| Tag | Index digest today | util-linux | OpenSSL | c-ares |
|---|---|---|---|---|
| `postgres:18-alpine` (unchanged 2026-09-08) | `sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2` | `libuuid` **2.42.1-r0 — affected** | 3.5.7-r0 (SCX-0006/7 class) | 1.34.8 — the SCX-0001 finding is gone in this build |
| `redis:8-alpine` (unchanged 2026-09-08) | `sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576` | `setpriv` **2.41.4-r0 — affected** | 3.5.7-r0 (SCX-0008/9 class) | — |
| `postgres:18-alpine3.22`, `postgres:18-alpine3.23`, `postgres:18.1-alpine`, `redis:8-alpine3.22`, `redis:8.4-alpine` | (2026-09-05 scans) | affected in every variant | affected | — |

Every published Postgres 18 and Redis 8 image variant ships util-linux below the Alpine fix.
Alpine published the fixed packages; the official images have not been rebuilt with them.

## 3. Why there is no re-pin in this PR

* **"Patched images rather than waivers"** is the instruction. There is no patched image, and a
  waiver is what a disposition record is. Neither is done here.
* Re-pinning `postgres:18-alpine` to today's `d3e1620b…` would retire the c-ares acceptance
  (SCX-0001) but leave the gate red on util-linux, and would require every other postgres record
  (SCX-0002…0007) to be re-bound to the new child digest — including the `gosu` NOT_AFFECTED
  symbol analyses (SCX-0004/0005), which are evidence about one exact binary and would have to be
  regenerated and re-approved. That is a security review, not a maintenance re-pin; it is the
  right thing to do **once**, when the util-linux rebuild lands, so that one re-pin and one
  re-approval close everything.

## 4. What this PR does instead

`scripts/gate/check-patched-images.mjs` — required in CI and scheduled daily — now watches the
util-linux findings alongside the OpenSSL acceptance:

* three specs (`openssl`, `util-linux/postgres`, `util-linux/redis`), one scan per image, every
  spec decided from the same report;
* Alpine **package** ranges, revision-aware: `2.42.3-r0` still fails CVE-2026-78408 and only
  `-r1` clears the set; an unknown revision reads as affected;
* on a rebuilt image the check FAILS and names the digest to re-pin to, and says whether SCX
  records must be deleted (OpenSSL) or that none exist and the re-pin is what turns the gate green
  (util-linux).

Digest consistency (`scripts/verify-images.sh`, `conformance.manifest.json` ⇄
`docker-compose.yml`) and the gate's record reconciliation are untouched. Nothing in
`docs/SCANNER_DISPOSITIONS.md` changes: its SHA-256 binds nine approved records and this PR
approves nothing.

## 5. When the recheck fires

1. Re-pin `docker-compose.yml` and `conformance.manifest.json` to the named digest(s),
   `pinned_at` = that day.
2. Re-scan under the gate; re-bind or delete the SCX records the new child digest invalidates —
   with the owner's approval, since the records carry `approved_on`.
3. If the OpenSSL rebuild lands in the same image, delete SCX-0006…0009 as the recheck says.

## 6. How the monitoring actually executes — and where it does not yet

GitHub runs `schedule:` triggers **only from the default branch's copy of the workflow**. Until
this PR is merged, the daily 07:20 UTC recheck on `main` runs `main`'s
`check-patched-images.mjs`, which watches OpenSSL only. The util-linux extension has executed
so far in exactly these places:

| Where | Trigger | Commit | Result |
|---|---|---|---|
| `C15 patched-image recheck` on this branch | `workflow_dispatch --ref maintenance/c15-image-recheck-2026-09` (read-only: `contents: read`, asserted by `assert-readonly-workflow.mjs`) | `8cc6d25a3a706cea202f84962af7285d6a025fc6` | run `34029030389`, success — `[util-linux/postgres] AFFECTED: libuuid 2.42.1-r0`, `[util-linux/redis] AFFECTED: setpriv 2.41.4-r0`, OpenSSL still affected in both; "no patched official image yet" |
| `C15 patched-image recheck` on this branch | `workflow_dispatch --ref maintenance/c15-image-recheck-2026-09` (read-only) | `70c34083a1ad9844fdea206e7d6929920efac19b` | run `34231435056`, **2026-09-08 13:21 UTC**, success — same digests as 2026-09-06 (`postgres:18-alpine` → `d3e1620b…`, `redis:8-alpine` → `becdda6c…`); `[util-linux/postgres] AFFECTED: libuuid 2.42.1-r0` (7 rows), `[util-linux/redis] AFFECTED: setpriv 2.41.4-r0` (6 rows), OpenSSL 3.5.7-r0 still affected in both (CVE-2026-14456); "no patched official image yet" |
| local read-only recheck, this branch | `node scripts/gate/check-patched-images.mjs` (trivy 0.73.0, linux/amd64, live registry) | `70c34083` | **2026-09-08 13:21 UTC**, identical verdict to run 34231435056 above |
| `ci.yml` required job, this branch | push / pull_request | `8cc6d25a…` | the recheck step now runs **after a failed C15 gate** (`if: always() && env.C15_OUT != ''`); before this commit a red gate skipped it, so the runs inspected on PR #38 and PR #39 never executed the recheck |

**Remaining limitation, stated:** until merge, no scheduled run watches util-linux. The
read-only dispatch above is how it is checked on demand
(`gh workflow run c15-patched-image-recheck.yml --ref maintenance/c15-image-recheck-2026-09`),
and every push to THIS branch executes it in the required job regardless of the gate's verdict.
PR #38's branch does not carry the `ci.yml` change: its inspected run (34029714842) failed the
gate and SKIPPED the recheck, exactly as before. The step executes there only once this PR is
merged and PR #38 is rebased onto it. After merge the schedule picks it up on the next day's run with no further
change. C15 stays blocking; no waiver is added.

## 7. Recheck log

| Date (UTC) | Method | Pinned digests (compose, `conformance.manifest.json`) | Registry digests | Affected packages | Result |
|---|---|---|---|---|---|
| 2026-09-06 | run 34029030389 (dispatch) + local scan | `postgres@sha256:9a8afca5…`, `redis@sha256:978f0e01…` | `d3e1620b…`, `becdda6c…` | util-linux `libuuid` 2.42.1-r0 / `setpriv` 2.41.4-r0 (CVE-2026-53612, -53613, -53614, -76642, -78408, -78409, -78410); OpenSSL 3.5.7-r0 (CVE-2026-14456) | no patched image; no re-pin; no waiver |
| **2026-09-08 13:21** | run **34231435056** (dispatch, `70c34083`) + local `check-patched-images.mjs` | unchanged | unchanged: `d3e1620b…`, `becdda6c…` | unchanged (7 rows postgres, 6 rows redis; OpenSSL 2 rows each) | **no patched image available as of this check**; no re-pin possible; no waiver; C15 remains red on the pins and blocks every merge in the recorded order |
| 2026-09-10 | the owner's approval (`docs/images/DERIVED_IMAGES_APPROVAL.md`); `65c0f4d` on `main` — the C15 change-set of `phase6-decisions@4ad058f` (PR #46's branch) landed first, through PR #39 (merge `d675707`, 2026-09-12) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974ae…`, `…/redis@sha256:1ad0ff24…` (derived from `9a8afca5…` / `978f0e01…` with the util-linux, OpenSSL and c-ares fixes) | official tags still affected | none on the derived images beyond the 22 governed `gosu` rows (SCX-0002…0005 re-issued, SCX-0010/0011 new; SCX-0001, -0006…-0009 retired) | TEMPORARY re-pin to the derived images; the recheck repurposed to watch for a compatible fixed OFFICIAL image on both platforms |
| **2026-09-22 12:41** | scheduled run **35728647457** on `main` (the pinned trivy 0.73.0) + local `check-patched-images.mjs` (Homebrew trivy 0.73.0, evidence only) | the derived images above | `postgres:18-alpine` → **`77f58511…`** (children `d8703cd7…` amd64, `89f74717…` arm64; 18.6-alpine3.24, Alpine 3.24.2), `redis:8-alpine` → **`ba6e394f…`** (children `2d3814be…` amd64, `41a10b18…` arm64; 8.10.2-alpine, Alpine 3.23.6) | **none of the watched ones**: `libuuid` 2.42.3-r1, `setpriv` 2.41.6-r1, `libcrypto3`/`libssl3` 3.5.8-r0, `c-ares` 1.34.8-r0 on both platforms; the official postgres children carry the same 22 `gosu` stdlib rows as the derived image and nothing else at HIGH/CRITICAL; redis 0 at every severity | **COMPATIBLE FIXED OFFICIAL IMAGE for both services** — the recheck FAILED on purpose; the return begins (§8): re-pinned 2026-09-22, provenance and compatibility verified, SCX re-issues DRAFTED for the owner |
| **2026-09-23** | the owner’s approval applied (the six re-issues in force, §3.9 of the dispositions document); local `check-patched-images.mjs` under its completed return transition (§8.4; the pinned trivy 0.73.0 authenticated by `install-scanners.sh`, live registry, both platforms) | `postgres@sha256:77f58511…`, `redis@sha256:ba6e394f…` (the official indexes, since 2026-09-22) | unchanged: `postgres:18-alpine` → `77f58511…`, `redis:8-alpine` → `ba6e394f…` — THE SAME indexes as the pins | none of the watched ones on any child (`libuuid` 2.42.3-r1 / `setpriv` 2.41.6-r1, `libcrypto3`/`libssl3` 3.5.8-r0, `c-ares` 1.34.8-r0) | **PASS** — "the configured pin is the compatible official image" for both services; no NEWER compatible official build; the C15 gate on the same pins with the six records: 44 findings, 6 records, 0 unmatched, 0 unused |

## 8. The return to the official images (2026-09-22)

The recheck fired. This section records what the branch `maintenance/c15-return-to-official-2026-09`
does — the documented process (§5 and `docs/images/DERIVED_IMAGES_APPROVAL.md`) followed exactly as far
as it goes without the owner — what the gate says in that state, and what awaits the owner.

### 8.1 What the commit does

1. **Provenance verified** (`infra/images/official/20260922/index/`, `source/SOURCE.txt`). The two
   official tags resolve to the indexes the recheck named: `postgres:18-alpine` →
   `sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` (`linux/amd64`
   `d8703cd7…`, `linux/arm64` `89f74717…`), `redis:8-alpine` →
   `sha256:ba6e394f6acc2a695ef1b6944f161b9ca813711739be68319fa0db3470673f1d` (`2d3814be…`,
   `41a10b18…`); the raw index bytes hash to those digests; the children's `org.opencontainers.image.source`
   annotations equal the Docker Official Images library entries (`docker-library/postgres@e00e1bd3…`
   `18/alpine3.24`; `redis/docker-library-redis@8104e63b…` `alpine`, `refs/tags/v8.10.2`); the redis commit's
   signature is valid on GitHub, the postgres one (Docker Library Bot) is unsigned; both indexes carry
   per-platform SLSA provenance and SPDX SBOM attestations naming the same source commits and the
   Docker Official Images builder — in-toto statements, not cosign signatures, which Docker Official
   Images do not publish. The postgres image was built on 2026-09-17 from a 2026-08-13 commit: the
   rebuild is Alpine 3.24 → 3.24.2, which is where `libuuid` 2.42.3-r1, OpenSSL 3.5.8-r0 and `c-ares`
   1.34.8-r0 come from.
2. **Compatibility verified** (`…/compat/`). Throwaway containers on `127.0.0.1:5439` / `:6399` under
   exactly the compose file's `user`, `cap_drop: [ALL]` and `no-new-privileges` keys: uid 70 / uid 999,
   CapPrm = CapEff = CapBnd = 0, NoNewPrivs 1; PostgreSQL 18.6 initialised a fresh volume, took migrations
   0001–0078, survived a stop/start with data and migrations intact; Redis 8.10.2 answered the
   repository's client with `--requirepass`; the acceptance suite 58/58 and the `audit-chain`
   integration file 8/8 against them. (The first pass's acceptance step never started the API — the
   harness had built `@eye/api` without its workspace dependencies; the transcript is kept and says so.)
   The host is `darwin/arm64`: these are the `linux/arm64` children, the ones the compose file runs
   here; CI exercises the amd64 children through `docker compose up`.
3. **Scanned** (`…/scans/`, `scan-summary.txt`; trivy 0.73.0 as the Homebrew build — evidence, not the
   gate's verdict). Both children of both official images, beside the four derived children, same
   scanner, same DB (2026-09-22), same day: official postgres 22 HIGH/CRITICAL rows per child, all `gosu`
   stdlib, 0 OS-package rows, identical to the derived image's 22 (0 gone, 0 new); official redis 0 rows
   at every severity. Every advisory of every record is present on the official child of its platform;
   no HIGH/CRITICAL `gosu` advisory falls outside the six records. `gosu` is byte-identical to the
   analysed binaries (`52c8749d…` amd64, `3a8ef022…` arm64), so the NOT_AFFECTED and RISK_ACCEPTED
   bases carry over on byte identity, as on 2026-09-10.
4. **Re-pinned** — §5 step 1. `docker-compose.yml` and `conformance.manifest.json` name the official
   indexes with the human tags, `pinned_at` 2026-09-22, `platform_children` recorded, `previous` naming
   the derived references; the generated C18 legacy view regenerated (`legacy-compose-view.mjs --check`:
   current); the R34 evidence fixture's children map gains the official children.
5. **SCX re-issues DRAFTED** — §5 step 2, up to the owner's part. `docs/SCANNER_DISPOSITIONS.md` §3.9
   holds the six records (SCX-0002…0005 for `d8703cd7…`, SCX-0010/0011 for `89f74717…`) exactly as they
   would read, with a `Status: DRAFT` row and every approval date **PENDING**; `scripts/gate/scanner-exclusions.json`
   carries the same six as objects under `pending_reissues`, outside `records`, where the validator
   never reads them. The approved records stand unchanged. No record is dated, approved, or deleted.
   The redis derived image is named by no record (confirmed: `records` and `retired_records` name
   postgres only), so redis returns with nothing to re-issue.
6. **§5 step 3 (OpenSSL: delete SCX-0006…0009)** — already done on 2026-09-10 (§3.6 of the
   dispositions document retired SCX-0001 and SCX-0006…0009 when the derived images fixed those
   findings); their ids stay in `retired_records`. Nothing further to propose there: the official images
   carry the same fixes, so no OpenSSL or c-ares record is needed and none returns.

### 8.2 What the gate says on this branch

* `Pinned-digest consistency (compose == conformance manifest)`: passes (both files name the official
  indexes).
* `C15 supply-chain gate`: **FAILS, as it must** — it refuses at the disposition validation ("6 records,
  12 rejected": every approved record's `evidence_sha256` and `evidence_files` entry for the dispositions
  document name the digest of 2026-09-10, and the document changed with §3.9) and stops there, before any
  image is scanned; the hosted run on the pull request (35776435696, job 106910707235) shows exactly
  those twelve lines and `Process completed with exit code 1`. Re-binding the digest alone would not
  turn it green: the records would then reach reconciliation naming an image the compose file no longer
  pins — the 22 `gosu` rows on each official postgres child UNGOVERNED (44), the six records UNUSED —
  until they name the official image. This is the pending state the process defines: a record is
  re-bound only with the owner's approval.
* `C15 patched-image recheck`: **FAILS, by its own design** — a compatible fixed official image
  "now exists", and it is the one pinned. PUBLICATION.md §8.5 leaves what the recheck becomes after the
  return (the trigger for a NEWER official build under ADR-P0-01's cadence, or retired) to the owner.
* The build-test job's gate unit suites are red for the same reason, and only for it. The hosted run on
  the pull request's head `d6e5e47` (ci 35776917560, job 106912353611, `pnpm --filter @eye/api test`):
  2,141 of 2,272 tests pass and **131** fail, in six of 51 files — `source-anchored-reconstruction`
  (60 of 75), `receipt-invariants` (23 of 24), `c15-runner-behaviour` (18 of 45),
  `final-receipt-semantics` (17 of 18), `receipt-contract` (12 of 14), `hermetic-isolation` (1 of 8)
  (the six per-file counts sum to 131; an earlier local reading of this paragraph said 133 / 2,139,
  which its own per-file counts did not support — corrected on the refuter's pass against the hosted
  log) — and every one of them fails on one of two facts of the pending state: the
  six approved records' `evidence_sha256` no longer matches the dispositions document, so the replayed
  gate refuses before the behaviour under test is reached, or the recorded C15 trace and the R34
  fixture name the derived scan references and records, so the reconstruction from tracked source
  (the official pins) reports the trace's argv and reconciliation as mismatched. They turn green with
  the owner's re-issue and a re-recorded trace. (`c18-db-paths` had two failures that were not the
  pending state: a stale legacy view, regenerated before the commit, and a drift regex in its own
  `--check` control that recognised only the registry-path spelling `ghcr.io/…/postgres@sha256:` and
  not the official `postgres@sha256:` — the registry path is now optional in that one expression;
  both mechanical.) `pnpm boundaries`, the licence gate, `supply-chain-artifacts.test.ts` and
  `c15-patched-recheck.ctl.ts` pass.

### 8.3 What awaited the owner (done on 2026-09-23 — §8.4)

1. Approve the six re-issues: move each draft from `pending_reissues` into `records`, delete its `status`
   key, set `approved_on` / `reviewed_on` to the day of the review, replace each "PENDING" in §3.9 with
   that date and the approver; recompute the dispositions document's SHA-256 into every record.
2. Re-record `apps/api/test/gate/fixtures/c15-trace/` and `fixtures/real-image-results.json` from a real
   run with the pinned scanners against the official indexes; run the FINAL C15/C16/C17 chain on the
   approving commit.
3. Decide the recheck's future (§8.2) and, separately, the governed recreation of the live containers
   (`eye-postgres`, `eye-redis`) onto the official images — a recorded operation under
   `docs/ops/BACKUP_RESTORE.md`, not made by this branch; the demonstration stack is untouched.
4. Merge. Nothing here changes a budget, a cadence, a source, or the C19 anchor, and nothing was purchased.


### 8.4 The recheck after the return (the owner's decision of 2026-09-23)

The owner's instruction of 2026-09-23, verbatim in the part that decides this: "Complete #57's
official-image transition. Update the recheck so the adopted compatible official pin passes, while newer
compatible official builds trigger the existing update process. Preserve cadence and visible indeterminate
failures. Regenerate the real scanner/trace evidence and pass the existing gates; do not bypass them." (The
same instruction approved the six SCX re-issues — `docs/SCANNER_DISPOSITIONS.md` §3.9 quotes it — and
authorised the integration order of #57, #56 and #58, recorded in the delivery records.)

**What the recheck is now.** `scripts/gate/check-patched-images.mjs` keeps resolving the official tags at the
existing cadence — daily at 07:20 UTC (`.github/workflows/c15-patched-image-recheck.yml`, read-only,
`contents: read` asserted) and in the required `supply-chain` job of `ci.yml`, after the C15 gate, even when
that gate failed on its findings — and scans BOTH platform children of the index each tag currently names,
exactly as before (no severity filter; installed versions decide; a report that contradicts itself is
indeterminate). What changed is the decision, `decideService` in `scripts/gate/lib/c19-patched-images.mjs`,
which is taken against the CONFIGURED PIN read from `conformance.manifest.json` (`pinned_images`, held equal
to `docker-compose.yml` by CI's "Pinned-digest consistency" step):

| The tag's current index | Every watched fix on both platforms | Decision |
|---|---|---|
| **is the configured pin** | yes | **PASS** — "the configured pin is the compatible official image" |
| is the configured pin | no | **FAIL** — the return's premise no longer holds; re-review the pin and the records scoped to it |
| is the configured pin, but the manifest's `platform_children` disagree with the index | — | **FAIL** — the record of the return is wrong or the manifest was edited |
| **is a DIFFERENT index** | yes | **FAIL** — "a COMPATIBLE FIXED OFFICIAL image now exists … NEWER than the configured pin": the existing update process (re-pin `docker-compose.yml` and `conformance.manifest.json`, verify provenance and compatibility, re-issue or retire the SCX records that name the pin — SCX-0002…0005 and SCX-0010/0011 today — regenerate evidence, FINAL chain) |
| is a different index | no | nothing to do — the pin stays, and the run says which fix the newer build lacks |
| cannot be resolved, a platform is absent or unscannable, a report contradicts itself, or the pins cannot be read | — | **FAIL**, visibly — "could not check" never reads like "nothing to do" |

Until 2026-09-23 the recheck failed whenever ANY compatible fixed official image existed, which after the
return meant failing on the very image pinned (hosted runs 35771687190 on `main` and 35778667098 on PR #57
did exactly that; those runs are preserved as they were). It re-pins nothing and deletes no evidence, as
before; `--manifest <path>` exists only so the unit controls can prove the decision against a crafted pin
(the script produces no evidence to launder). The controls are `apps/api/test/gate/c15-patched-recheck.suite.ts`:
the pure decision for each row above, and the CLI executed as a subprocess against fake `docker` and
`trivy` for the configured pin (PASS), a newer compatible build (FAIL, the update text), a newer
incompatible build (exit 0, the pin stays), the configured pin without a watched fix (FAIL), disagreeing
`platform_children` (FAIL), an unreadable manifest (FAIL) and every indeterminate shape from before.

**On this branch, 2026-09-23.** The six re-issues were applied under the owner's approval (§8.3 item 1 —
`docs/SCANNER_DISPOSITIONS.md` §3.9; the 2026-09-10 versions listed under `superseded_records` in
`scripts/gate/scanner-exclusions.json`, nothing deleted), the dispositions document re-bound by digest, the
C15 trace fixture and `real-image-results.json` re-recorded from a real local run of the gate with the pinned
release scanners (authenticated by `scripts/gate/install-scanners.sh`) against the official indexes (item 2),
and the recheck completed as above (item 3). The live containers' recreation onto the official images remains
the separate recorded operation named in item 3. The FINAL chain is the hosted run on the approving commits.
