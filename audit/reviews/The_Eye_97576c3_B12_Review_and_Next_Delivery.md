# THE EYE — B12 bounded functional review and next delivery

Independent review, 2026-09-15. Repository: a-Halawany/elven.

**B12's reviewed functionality is ready for integration at code `97576c32a96bf16a325ee06c8febf3a5e0c70099`, records `70b85a67a0a461876d2404e342759bf45303e32c`. No new functional merge blocker was found in this bounded review. Merge #49 under the existing authorization once its already-running required records-head CI succeeds. No additional Codex hardening closure is required.**

The governing priority remains every agreed capability across all eleven specification volumes and the integrated NORDWERK demonstration. Comprehensive hardening and product/profile acceptance follow implementation. Closed reviews and frozen criteria remain preserved. Codex made no GitHub changes, merged nothing, dispatched no workflows and changed no demonstration service.

## Capability progress

| Category | Checked position |
|---|---|
| Newly implemented and functioning | Governed restore-to-hot, hot-tier retrieval during pending publication, retry of a failed publication, return to archive; cold-tier policy, admission budget, attempt limits and escalation, restore window, bounded oldest-due schedule evaluation and state reporting; sweeper classification of files in both blob roots. |
| Partially implemented | The retention page includes the cold-tier controls and restore action, but the new signed-in page walks remain outstanding. Export delivery remains partial. Comtrade activation remains pending the owner credential binding reported unavailable on the author host. |
| Missing capabilities carried forward | A governed schedule-retirement route; export package HTTP download, external destination delivery and key-based signing; source-derived memory records, index-tier degradation and unfinished semantics of the 24 partial interface contracts. This is the carried delivery register, not a new broad audit. |
| Acceptance remaining | Finish the existing records-head CI, merge #49 and complete its main push/archive chain; continue implementation and integrated demonstration. Comprehensive hardening and every deployment/profile acceptance leg remain due later. |

## Integration and hosted gates

[PR #48](https://github.com/a-Halawany/elven/pull/48) merged at `41d4a2690308a61aa33032f27c03ccd4a70a32ab`, with reviewed head `a07dd2c` preserved. Its [push CI](https://github.com/a-Halawany/elven/actions/runs/34990126368), [C19 lifecycle](https://github.com/a-Halawany/elven/actions/runs/34990126469), [C17 finalize](https://github.com/a-Halawany/elven/actions/runs/34992193646) and [C19 anchor](https://github.com/a-Halawany/elven/actions/runs/34992322188) all succeeded on attempt 1. Inspected steps show C17 packaging, verification and upload ran, followed by source-archive and cross-host verification and offline anchor verification. Codex inspected hosted results; it did not independently download and verify the archive.

[PR #49](https://github.com/a-Halawany/elven/pull/49) is open against that main head. [Code-head CI 35004457633](https://github.com/a-Halawany/elven/actions/runs/35004457633) and [C19 35004457741](https://github.com/a-Halawany/elven/actions/runs/35004457741) succeeded at `97576c3`. Inspected logs confirm 2,156 API units plus 9 meta tests, 58 acceptance tests, 1,006 integration tests in 62 files including B12's 12 cases, C18's 612 plus 44 tests, and upgrade through 0072: 72 files overall, 51 rows above the 0021 baseline. The CI checkout was GitHub's synthetic merge `a4d364b`. Supply-chain and browser-regression succeeded; C17 packaging/upload was skipped under the PR condition as expected.

The `97576c3` → `70b85a6` diff changes only records and two acceptance-unit evidence statuses; executable code and migrations are unchanged. At the final check, [records CI 35006827354](https://github.com/a-Halawany/elven/actions/runs/35006827354) was still running: supply-chain and browser-regression succeeded, build-test remained in progress with no failed step reported. [Records C19 35006827390](https://github.com/a-Halawany/elven/actions/runs/35006827390) succeeded. GitHub reported mergeable with merge state `unstable` while that run was outstanding. This pending existing gate is not a new review hold. Do not create another records binding chain.

## Functional verification

Sources inspected include [migration 0072](https://github.com/a-Halawany/elven/blob/97576c3/apps/api/migrations/0072_b12_restore_and_cold_tier_manager.sql), [RetentionController](https://github.com/a-Halawany/elven/blob/97576c3/apps/api/src/retention/retention.controller.ts), [RetentionService](https://github.com/a-Halawany/elven/blob/97576c3/apps/api/src/retention/retention.service.ts), [VaultService](https://github.com/a-Halawany/elven/blob/97576c3/apps/api/src/observation/vault/vault.service.ts), [SweeperService](https://github.com/a-Halawany/elven/blob/97576c3/apps/api/src/observation/sweeper/sweeper.service.ts), route/capability bindings and the B12 harness.

Codex executed the actual candidate controller, retention service and vault TypeScript using explicit pipeline/database/transaction/port doubles and real isolated filesystem operations:

| Case | Observed result |
|---|---|
| Restore succeeds | Before the simulated commit the archive source remains present, the hot locator is unpublished and one hot staged copy exists. After commit the controller publishes hot bytes and removes the archive source; the digest matches and verification observations report no archive or staged copy. |
| Restored record is re-archived | The same implemented controller/service path moves it back; the archive is published with the expected digest and the hot source is removed. |
| Hot publication fails, then the execute route is retried | The first response names one failed locator and removes no source bytes. A pending residual is recorded and retrieval serves the staged bytes. Retrying the same controller route publishes hot bytes and removes the archive source; verification observations then satisfy the restore contract. |

The policy, restore window, budget refusal, attempt counting/reset, escalation, concurrent successful restores and sweeper classifications are supported by inspected source and the hosted [12-case B12 harness](https://github.com/a-Halawany/elven/blob/97576c3/apps/api/test/int/phase6-retention-b12.test.ts). Evaluation ordering and the opens limit apply within each schedule, using the domain's configured policy. No claim is made here of one global oldest-first ordering across all schedules.

Local probe scope does not include real database authorization/locking, a PostgreSQL server, Redis, HTTP, browsers, Docker, Trivy or the full integration suite. Existing B11 closures were not re-opened or subjected to another campaign.

## Demonstration and remaining work

The [author's NORDWERK act](https://github.com/a-Halawany/elven/blob/97576c3/evidence/cp6/act-b12.txt) records restored evidence, hot retrieval, policy changes, budget refusal/retry, escalation, ordered schedule evaluation, re-archive and sweeper cleanup. It distinguishes the scenes shown on eye_demo from behaviors covered only by the harness. These host, HTTP and database observations remain author evidence. The migration digest independently computed from the candidate is `ef56c5befde84306617550d78ca5be09957bf44775acd2b3d397d55b78c25c7c`, matching the prefix in the act.

The runbook identifies the demonstration-created archive schedule still active for nordwerk-internal. Evaluation opens actions; approval and execution remain necessary to move bytes. Add a governed retirement route and page control in the next implementation batch, then use it to retire that demonstration-created schedule while preserving history. Codex did not execute the runbook's SQL workaround.

B12 now supplies a functional archive-root walk. Broader reconciliation correctness and post-commit byte-mover behavior remain in the recorded later hardening work; do not describe the archive-root walk itself as still wholly missing. The remaining export, source, memory, interface and deployment capabilities stay in the delivery register.

The records move AU-MEM-0062 and AU-INF-0791 to hosted-evidence status. Mandatory unfinished acceptance remains **3,555 = 3,186 open + 338 verified locally + 31 verified in CI**. No deployment leg is accepted. This is not an implementation-completion percentage.

## Next batch

Complete the existing #49 gate/integration chain, then deliver the governed schedule-retirement control and the customer-export delivery capabilities from the specification: package download, destination delivery and signing. Use a synthetic destination and demonstration key where appropriate to demonstrate the implemented workflow without selecting or purchasing a production service. Any unavailable production binding is a named remaining step, not a reason to stop other feature work. Preserve existing source permissions, budgets/cadences, backups and demonstration services. Keep verification focused on functioning features and existing gates; no new broad audit, repeated judges or recursive records-refresh loop.
