# THE EYE — B11 closure and return to feature delivery

Independent bounded review, 2026-09-15. Repository: a-Halawany/elven.

**B11-F1 and B11-F2 close at code `6b93a27c7981fa58a3cccf762860a8b64845ed33`, with records `a07dd2c3b7317c9c153d5141ef7c2155018a5aa0`. PR #48 can proceed under the existing merge authorization and required gates. There is no remaining Codex closure hold on these two findings.**

The governing delivery instruction remains: complete every agreed feature across all eleven specification volumes and the integrated NORDWERK demonstration; conduct comprehensive hardening and product/profile acceptance afterward. Preserve closed reviews and frozen criteria. This review did not start another adversarial campaign, change GitHub, merge, dispatch workflows, contact Claude or modify demonstration services.

## Capability position

| Category | Position |
|---|---|
| Newly functioning behavior | Archive cleanup preserves the successful overlapping action's bytes; the standalone export verifier rejects incomplete/non-package input. These are corrections to delivered capabilities, not a new broad feature batch. The demonstration restart script explicitly selects and verifies the demonstration database. |
| Partially implemented | Archive and export lifecycle remain partial. The new workspace pages still need their role-based functional walks. Comtrade is approved but activation remains pending the credential binding reported unavailable on the author's host. |
| Capabilities still missing | The existing register retains restore-to-hot and cold-tier management, export delivery capabilities, source-derived memory, index-tier degradation and the unfinished semantics of 24 partial interfaces. This is the carried delivery backlog, not a newly repeated eleven-volume audit. |
| Acceptance work remaining | Integrate #48 and complete its normal main push/archive chain; continue missing capabilities and the connected demonstration. Comprehensive hardening and every deployment/profile acceptance leg remain due later. |

## Exact candidate and hosted evidence

[PR #48](https://github.com/a-Halawany/elven/pull/48) is open, mergeable and clean against main. Its head is `a07dd2c`; main remains `93bce74462e624c54adbc2579c36726172f4e25c`, the already completed #47 merge. Those earlier integration reviews were not repeated.

The inspected `6b93a27` → `a07dd2c` diff changes only PHASE6_REPORT.md, evidence/cp6/README.md and the hosted result summary. There is no executable-code or migration change in that records commit. No recursive records refresh is required by this review.

[CI 34968358484](https://github.com/a-Halawany/elven/actions/runs/34968358484) and [C19 lifecycle 34968358342](https://github.com/a-Halawany/elven/actions/runs/34968358342) succeed at the exact code head. Inspected build-test logs show 2,156 API unit tests, 9 meta tests, 58 acceptance tests, 994 integration tests across 61 files including the 9-case closure harness, and C18's 612 tests plus 44 differential checks. Upgrade execution through 0071 succeeded. Supply-chain and browser-regression jobs also succeed.

The CI checkout was GitHub's synthetic merge `d010373`, merging `6b93a27` into `93bce744`. C17 archive packaging and upload were skipped under the PR condition. Their execution belongs to the subsequent main push chain. Existing browser regression does not establish the new pages' signed-in functional walks.

## B11-F1 — closed for the original archive-overlap finding

Inspected sources: [RetentionService](https://github.com/a-Halawany/elven/blob/6b93a27/apps/api/src/retention/retention.service.ts), [VaultService](https://github.com/a-Halawany/elven/blob/6b93a27/apps/api/src/observation/vault/vault.service.ts), [RetentionController](https://github.com/a-Halawany/elven/blob/6b93a27/apps/api/src/retention/retention.controller.ts), and [migration 0071](https://github.com/a-Halawany/elven/blob/6b93a27/apps/api/migrations/0071_b11_closure_manifest_locks.sql).

Each execution gets a unique attempt ID. A new archive copy is staged under that attempt's name; the successful transaction's result is published before its hot copy is removed. A failing execution removes only its own staged file. Manifest/domain advisory locks serialize ordinary execution, but ownership supplies the protection against a failed execution's later cleanup. Archive reads also handle a committed move awaiting publication, with digest verification and a retained hot-copy fallback.

Codex executed the candidate's actual TypeScript using explicit database/transaction/port doubles and real isolated filesystem operations. The overlap probe deliberately omitted advisory-lock serialization to examine copy ownership independently. All three original-scope cases passed:

| Case | Result after A fails on Q and cleans up |
|---|---|
| A stages P; B independently archives P, commits and publishes; A resumes and fails | B's record remains committed; archive bytes remain readable; hot bytes removed; staged files cleared. |
| Serial failure before B starts | B creates and publishes its own readable archive. |
| B already committed before A starts | A recognizes the existing archive, creates no replacement for P, and its later failure preserves B's bytes. |

The pending-publication read control returned staged bytes with the expected digest before publication, then the published copy afterward.

The inspected [hosted closure harness](https://github.com/a-Halawany/elven/blob/6b93a27/apps/api/test/int/phase6-retention-b11-closure.test.ts) additionally exercises real-database serialization, cleanup holds, backend termination, statement cancellation and a second attempt of the same action. Those are hosted executions, not locally executed PostgreSQL tests by Codex.

## B11-F2 — closed for false verifier success

Codex ran the [unmodified standalone verifier](https://github.com/a-Halawany/elven/blob/6b93a27/scripts/retention/verify-export.mjs) against isolated synthetic packages. A valid one-object package built using the actual contract/header and export digest helpers returned exit 0, `ok: true`, zero failures and PACKAGE OK. Tampered format, `null`, `[]`, missing objects, missing signature and a non-list `excluded` all returned exit 1 and `ok: false`; text verdicts agreed. Requested digest comparisons that cannot run become failures. The source and hosted harness support the closure.

## Demonstration and scope limits

The supplied [closure act](https://github.com/a-Halawany/elven/blob/6b93a27/evidence/cp6/closure-b11.txt) records concurrent NORDWERK archives, retrieval from archive, export verification/revocation and the inactive Comtrade contract. These are author HTTP/database/process observations. Codex did not independently operate that host or run PostgreSQL server, Redis, HTTP, browsers, Docker, Trivy or the full integration suite.

The checked migration SHA-256 is `dce154d66d5d99f6aba7288b0c9d1cc5f44f9d2cd8976f3580259dfb62332899`, matching the prefix in the author's applied-migration output.

The two recorded structural residuals—post-commit byte movers outside the manifest lock, and archive-root reconciliation—remain open for later hardening. Closure of the original interleaving is not a claim that all archive concurrency or recovery properties are accepted. Keep required archive lifecycle features in the implementation register; do not relabel missing functionality as optional hardening.

Some CSV evidence wording and harness titles still describe superseded lock/cleanup designs. Correct that wording during the next ordinary records update to describe per-attempt ownership. This is not another merge hold or test campaign.

The acceptance-unit register was not changed by this closure. The carried mandatory unfinished split remains **3,555 = 3,188 open + 338 verified locally + 29 verified in CI**. It is not a feature-completion percentage. No deployment leg is accepted.

## Next delivery instruction

1. Integrate #48 at records `a07dd2c` under existing authorization and gates; finish its normal C17/C19 main chain and preserve previous branches/evidence.
2. Proceed to the next named missing-feature batch. Start with the governed restore-to-hot and remaining cold-tier lifecycle capability from the existing register, then continue the established delivery sequence. Demonstrate actual NORDWERK effects as each capability lands.
3. Use focused functional checks and existing gates. No new broad audits, repeated judges or separate hardening closure requirement. Preserve the two residual findings for the later campaign.
4. Treat the reported Comtrade credential binding as a discrete owner step; continue other implementation meanwhile. Preserve current source permissions, budgets/cadences, GHCR temporary approval, backups and demo services.
5. Report what was implemented, integrated and demonstrated, what remains partial or missing, and acceptance work still due. Continue across the full eleven-volume scope.
