# THE EYE — B13 bounded review and next delivery

## Decision

B13 delivers functioning new capabilities: governed schedule retirement, deterministic package download, tenant-key signing, and the transfer-station delivery/recipient-receipt workflow. #49 is merged and its main archive chain is complete. Preserve all earlier closures.

This review adds no correction-only hold on #50. Merge it under the existing authorization once its existing required checks pass. One bounded defect in the still-partial HTTPS path belongs in the next export-delivery implementation batch, alongside a positive HTTPS demonstration. Do not begin another broad audit, finder/refuter/re-judge campaign, or records-refresh chain.

This is not full product acceptance. The goal remains every agreed feature across all eleven specification volumes and the integrated NORDWERK demonstration; comprehensive hardening follows implementation.

## Exact checkpoint and current gate blocker

| Item | Independently observed |
|---|---|
| #49 | Merged, merge commit `2d760e49e49c219c59fd19c25abbde7b4de8c6eb` |
| B13 code | `3a5a181849c0ffd5953763f275f6861b0e284548` |
| B13 records / #50 head | `37e0339718f7930ff0ccef96add925bbaf35026e` |
| #50 | Open, mergeable; base main at `2d760e4`; mergeable state unstable while checks are unresolved |
| Code CI | [35032929806](https://github.com/a-Halawany/elven/actions/runs/35032929806), attempt 1, success |
| Code C19 lifecycle | [35032929929](https://github.com/a-Halawany/elven/actions/runs/35032929929), attempt 1, success |
| Records CI | [35034334913](https://github.com/a-Halawany/elven/actions/runs/35034334913), in progress at inspection; browser-regression and supply-chain successful |
| Records C19 lifecycle | [35034334861](https://github.com/a-Halawany/elven/actions/runs/35034334861), attempt 1, **failure** |

The records-head C19 failure is important: merge is not waiting solely for CI. Job `delivery-chain-dry` / `104599846542` failed while acquiring/verifying historical #49 evidence because GitHub's artifacts endpoint returned **HTTP 504**:

`/repos/a-Halawany/elven/actions/runs/35025939601/artifacts`

The macOS and Ubuntu lifecycle jobs and foreign-checkout-pinning job passed. The failed job had resolved the correct source and finalizer and reported successful inner evidence checks before the endpoint failure. This is evidence of an artifact-service failure in that attempt, not a demonstrated B13 code defect. Retry the existing C19 workflow on the same records commit under the established workflow, preserve the failed attempt, and do not weaken or bypass the gate. If a retry exposes a different error, diagnose that exact failure.

The records commit changes seven documentation/accounting/evidence files only; no runtime code or migration changed.

## #49 integration is closed

All four runs are green, attempt 1, on `2d760e4`:

- [Main CI 35025939601](https://github.com/a-Halawany/elven/actions/runs/35025939601): inspected the actual successful C17 packaging/verification and upload steps.
- [C19 lifecycle 35025939594](https://github.com/a-Halawany/elven/actions/runs/35025939594).
- [C17 finalize 35027783826](https://github.com/a-Halawany/elven/actions/runs/35027783826): source archive verification and macOS ARM64 cross-host finalization succeeded.
- [C19 anchor 35027874264](https://github.com/a-Halawany/elven/actions/runs/35027874264): both offline verification jobs and publication job succeeded.

Codex inspected hosted outcomes and steps; it did not itself download and independently verify the C17 archive.

## New capability assessment

| Capability | Bounded conclusion |
|---|---|
| Schedule retirement | Implemented through route, authority/policy, SQL port, append-only schedule ledger and page control. Hosted S1 checks preserved evaluation/action history and no new evaluation work after retirement. The author demonstration retired the B12-created schedule without deleting history. |
| Signing and download | Actual signing, archive, vault, controller and service code exercised with isolated synthetic files and explicit database/pipeline doubles. A generated synthetic Ed25519 key signs the package digest; downloaded tar is byte-deterministic; the unmodified verifier succeeds with the public key and fails on tampered object bytes. |
| Transfer-station exchange | Actual delivery code writes package.tar, package.sig and delivery.json. The unmodified demonstration-recipient script verifies the tar and writes a valid receipt; the actual collect route reads it. Database acknowledgement enforcement is supported by inspected SQL and hosted T1, not by our doubled database. |
| HTTPS delivery | Source exists and the refusal paths are hosted-tested. The positive wire/TLS/recipient path is still unproven in the submitted harness and act. Codex exercised positive/mismatched response handling with an explicit egress double and found B13-F1 below. |
| Retention page | Controls are present in source and the build is green. No independent signed-in browser walk was performed. |

The downloaded “tar” API answer is a governed JSON response containing base64 bytes; the page makes a Blob/download link. It is not a raw streaming tar response. The declared 256 MiB ceiling and larger-package support remain distinct from the demonstrated small package.

The source `0073_b13_schedule_retirement_and_export_delivery.sql` SHA-256 is `35826c5336939226643197783471d36ca3c99e60b0afd8558450160fad25b1a3`, matching the prefix in the author's applied-migration log. Do not edit the applied migration to make the next correction; use the normal additive change path where SQL changes are needed.

## B13-F1 — initial HTTPS receipt can acknowledge the wrong delivery

**Disposition:** confirmed bounded defect, to fix in the next export-delivery feature batch before claiming the HTTPS path complete. This is not a request to reopen B11/B12 or launch a separate hardening cycle.

**Actual code path:** [export-delivery.service.ts](https://github.com/a-Halawany/elven/blob/3a5a181849c0ffd5953763f275f6861b0e284548/apps/api/src/retention/export-delivery.service.ts), `deliverToHttps → receiptState`; [retention.service.ts](https://github.com/a-Halawany/elven/blob/3a5a181849c0ffd5953763f275f6861b0e284548/apps/api/src/retention/retention.service.ts), `deliverExport`; migration 0073 `record_export_delivery`.

Reproduction using the actual candidate TypeScript with an explicit HTTPS response double:

1. Deliver the signed package once, producing delivery A.
2. Deliver the same package again, producing delivery B.
3. The endpoint's HTTP-200 JSON explicitly names delivery A and its earlier attempt, but repeats the matching archive/package digests and `verified: true`.
4. The actual controller/service returns delivery B as **acknowledged** and passes that state and the contradictory receipt to the record port.

Observed fixture: current attempt 4 acknowledged a receipt naming attempt 3's delivery. A control with the wrong archive digest instead became mismatched; the unbound-credential control made no egress call.

The classifier checks only the two digests and `verified`. The inspected initial-record SQL port does not reject a conflicting receipt `delivery_id`. By contrast, the separate `acknowledge_export_delivery` port rejects an explicitly different delivery ID; hosted T1 tests that rule for transfer-station collection.

**Bounded correction:** apply the existing explicit-ID binding consistently to initial HTTPS responses. A receipt explicitly naming another delivery must not acknowledge the current one; preserve the received evidence and an appropriate non-acknowledged outcome. Add a focused normal-response and stale-response test through the delivery route/record boundary. Preserve the existing deliberately supported out-of-band receipt behavior; do not invent a blanket new identity/authentication contract in this correction.

**Evidence limit:** Codex executed application logic, including the argument sent to a recording double. It inspected the SQL but did not execute this path against PostgreSQL or a real HTTPS endpoint. This is not represented as a real-network or real-database reproduction.

## Evidence scope

Independently executed:

- Candidate TypeScript business logic for signing, deterministic tar creation, governed download orchestration, transfer-station delivery and receipt collection.
- Real isolated synthetic filesystem; unmodified standalone verifier and demonstration-recipient CLI.
- Explicit pipeline/database/port doubles; explicit HTTPS egress double for response handling.
- Valid-signature, modified-digest, tampered-object, expired/revoked download, unbound-credential, normal HTTPS response, wrong-digest response and stale-delivery-ID controls.

Probe: `review-b13/probe-b13.cjs`; recorded result: `review-b13/probe-b13-results.json`. Cached source files gained one terminal newline during materialization; executable business logic was not modified.

Independently inspected hosted [build-test job 104595361754](https://github.com/a-Halawany/elven/actions/runs/35032929806/job/104595361754):

| Check | Observed result |
|---|---|
| API unit / meta | 2156 / 9 passed |
| Acceptance | 58 passed |
| Integration | 1016 passed, 63 files; B13 10/10 |
| Upgrade | 73 files overall; 52 migrations above 0021; preserved 1,021 rows in 29 tables; upgraded/virgin schema digests match |
| Earlier upgrade suites | Phase 0 297 before/after; Phase 1/2 275 passed |
| C18 | 612 plus 44 passed |
| Supply-chain / browser-regression | Successful |

CI checked out GitHub's synthetic merge `9b97f31`, merging code `3a5a181` into main `2d760e4`. PR C17 archive packaging/upload was skipped under its normal PR condition; the post-merge main chain is separate.

The NORDWERK [act-b13.txt](https://github.com/a-Halawany/elven/blob/3a5a181849c0ffd5953763f275f6861b0e284548/evidence/cp6/act-b13.txt) is **author evidence**: backup, migration, schedule retirement, demonstration-key declaration, signed download and offline verification, actual transfer-station files, recipient receipt/acknowledgement, pre-egress credential refusal, package revocation and preserved delivery history. A local synthetic transfer station is not a successful production HTTPS delivery.

Codex did not run PostgreSQL server, Redis, HTTP/TLS, browsers, Docker, Trivy, the full integration suite, or eye_demo. No GitHub or live-system mutation was made.

## Partial / missing capabilities and acceptance work

Keep the following in feature delivery, not optional hardening:

- Positive HTTPS delivery/recipient exchange, including B13-F1.
- Destination revocation notification.
- Larger-package handling beyond the current archive ceiling.
- Import direction and relationship/graph-link export coverage.
- The 24 partial interface contracts' remaining semantics, source-derived memory and index-tier degradation.
- Remaining functional page walks and deployment-profile delivery/acceptance.
- Comtrade activation once the owner securely binds the authorized key; do not stall unrelated implementation.

Production signing-key custody and a real customer endpoint/credential remain production activation steps. Demonstration keys and isolated synthetic destinations can support functional implementation evidence without claiming production activation or weakening egress vetting.

Keep the previously recorded archive concurrency/reconciliation residuals for the comprehensive hardening campaign; do not reopen their completed bounded closures.

Accounting is consistent with the inspected records delta: **3,555 mandatory acceptance units unfinished = 3,183 open + 338 verified locally + 34 verified in CI**. Three B13 units gained CI evidence: AU-IDP-0179, AU-IDP-0180 and AU-COM-0060. The register has 3,904 unique units and 6,264 referenced source rows; no deployment leg accepted. These are acceptance statuses, not an implementation-completion percentage.

## Prompt to continue

Continue THE EYE from B13 code 3a5a181, records 37e0339, PR #50.

Codex's bounded review confirms the new schedule-retirement and signed transfer-station export workflow. #49's merge and full archive chain are closed. Preserve all earlier closures.

1. Resolve the existing gates only: records-head C19 35034334861 failed on GitHub's artifact endpoint HTTP 504 in delivery-chain-dry; retry it on the same commit and retain the failed attempt. Records CI 35034334913 was still running at review. Once all required checks pass, merge #50 under the existing authorization and complete its normal C17/C19 main chain. No records-refresh chain or additional review hold.

2. Continue the next export-delivery feature batch while those gates finish: prove a successful HTTPS delivery and recipient acknowledgement, and implement destination revocation notification. Include B13-F1: an initial HTTPS receipt explicitly naming an earlier delivery currently acknowledges the new one when its digests match. Enforce the existing receipt-ID binding consistently, preserve the received evidence, and add normal/stale-response controls through the delivery and recording path.

3. Demonstrate actual effects using an authorized isolated synthetic recipient and demonstration key; retain TLS/egress policy. Production bindings remain separate. Do not wait for production credentials to implement other features.

4. Then continue the register's missing features, including import/graph-link coverage and larger-package support. Full product across all eleven volumes plus the integrated demo remains the priority. Use focused functional checks and existing required gates; comprehensive hardening comes afterward. No new broad finder/refuter/re-judge campaign.

Preserve applied migrations, source permissions, budgets/cadences, backups, demo services, GHCR's approved temporary route and completed monitors. Report functioning, partial, missing and acceptance work separately.

