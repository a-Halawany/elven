# THE EYE — bounded review of 461a2b56

Reviewed 2026-09-11. Code: `461a2b56979b0e43c1d86b9323dac4439f4cc80a`. Records-only head: `87d32973ec1dd921fa7ba0f9d66219f04a6ddaf5`.

The checkpoint is **partially accepted, with three reproduced defects requiring correction before live recovery/rollout or stack integration**. The C18 empty-user correction and seven/five accounting correction close. The two-platform scanner implementation is supported; its passing reconciliation does not independently establish the authorization for new risk acceptances. CP-4/5 and PortWatch serialization cannot yet close as claimed.

This review preserves the bounded Phase 6 functional closure at `2e839458361b2accc457f5ae1b53d7a2263780ce`, the earlier path-guard and Redis protection closures, and every earlier frozen finding. The new defects below arise in the subsequently added build, encryption and lease paths. This is not a renewed review of all prior functionality or the eleven-volume specification.

**Checkpoint and evidence.**

- [PR #46](https://github.com/a-Halawany/elven/pull/46) remained open and unmerged when checked.
- [Hosted CI 34546359239](https://github.com/a-Halawany/elven/actions/runs/34546359239) checks out synthetic merge `3794864e919838e6b3edcfb4439a769c86f1a7d8`: code head `461a2b56…` into base `c5460465aa3c9a551d15ee5f565c8986dd509a55`. Its logs substantiate 806/806 integration tests, build/test, C18, two-platform C15, patched-image recheck, FINAL C16, manifest assertion, licence inventory and C17 validation. [C19 run 34546359306](https://github.com/a-Halawany/elven/actions/runs/34546359306) is successful.
- C17 archive packaging and upload are skipped by the PR condition. The future required push archive is still outstanding; neither its success nor a merge has been inferred.
- Independent checks here: exact source/diffs; hosted job metadata and logs; bounded C18 and reconciliation probes using actual JavaScript; backup cleanup using actual source functions and the builder refusal path in disposable directories; the actual encryption CLI on synthetic files; actual unmodified lease/admission PL/pgSQL in PGlite 0.3.7, with explicit authorization/scope and supporting-schema doubles.
- Codex did **not** independently run the full product, a PostgreSQL server, Redis, Docker, Trivy, HTTP, browsers, recovery drill, or PortWatch live collection. The PostgreSQL WASM function probe is not a substitute for the required server/runtime verification.

| Bounded item | Disposition at this head |
| --- | --- |
| C18 empty Config.User | Closed for the reported branch defect. Root, named-user and historical ledger shapes pass the focused handoff check; changed sink commands, invalid user output and missing credential bindings remain rejected. |
| Accounting: seven open obligations/five documentary rules | Closed. Acceptance-unit files did not change in this delta. The unfinished mandatory total remains 3,535; no new semantic/full-product acceptance is implied. |
| Arm64 scanning and matching | Technical matching gap closed: platform-qualified findings remain separate, amd64 records cannot absorb arm64 findings, and records for an unscanned platform are blocking. New approval authority remains to be evidenced as described below. |
| CP-4/5 recovery | Open: R1 and R2 reproduced; R4 records a failed credential check, refused scheduled collection and an unbound dependency fallback. |
| PortWatch integrity | Useful admission/key/correction work is supported by source and author evidence. Lease serialization remains open under R3. |

**R1 — backup failure cleanup can delete a build directory this run never created. Priority: P1; reproduced.**

In [backup.sh](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/scripts/ops/backup.sh), the new build path records `BUILD_ROOT` in the run manifest before invoking the builder. In [build-identity.mjs](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/scripts/ops/build-identity.mjs), `cmdBuild` then refuses an already existing root. The failure trap removes every recorded directory. A claimed destination has incorrectly become proof of ownership.

Independent reproduction used only reviewer-owned temporary directories: create a pre-existing build directory with a sentinel; initialize the run manifest; execute the unchanged record/build-refusal/cleanup sequence. The actual builder refused the existing root, but cleanup then removed it and its sentinel. This did not require a symlink or any live service.

Recorded result: `existing_build_deleted=true`, `sentinel_survived=false`.

Frozen correction criteria: create and establish ownership atomically before registering a directory for cleanup; retain cleanup for partially created resources owned by the failing run. A pre-existing directory and its sentinel must survive refusal, and concurrent attempts for the same destination must not delete each other's resources. Keep the earlier physical-containment and symlink refusals. Do not use the defective path against live or shared data while fixing it.

**R2 — encrypted bundle metadata can redirect decrypted output outside the restore directory. Priority: P1; reproduced.**

[bundle-crypto.mjs](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/scripts/ops/bundle-crypto.mjs) selects source/output paths from keys in `encryption.files`, but authenticates each payload with independently supplied `rec.aad`. The key and AAD are not required to agree; the path mapping is not authenticated or contained before writes.

Independent reproduction: seal a synthetic `payload.txt`; preserve its ciphertext, authentication tag and AAD; change its file-map key to `../../escaped.bin` and place the unchanged ciphertext at the corresponding source path, all within a disposable test tree. Both `verify` and `open` succeeded. `open --into <temp>/restore/plain` wrote the decrypted bytes to `<temp>/escaped.bin`, outside its intended destination. The ordinary round trip succeeded; wrong-password and modified-ciphertext controls were refused. Thus the defect is in path/metadata binding, not evidence that AES-GCM itself failed.

Recorded result: `verify_passed=true`, `open_passed=true`, `escaped=true` for the altered mapping. This is an actual crypto-CLI reproduction, not a claim that the complete Docker restore was executed or completed.

Frozen correction criteria: validate canonical relative paths and physical containment before any payload or temporary-file write; bind the authenticated file identity to the actual canonical path and validate the required file mapping. Reject altered mappings, traversal and symlink escapes without any output outside the run-owned destination. Preserve successful recovery and the existing wrong-key/ciphertext-tampering refusals. Node's standard crypto API is an available implementation choice; the absence of OpenSSL CLI AEAD support is not itself a reason to reject it.

**R3 — an expired lease's former holder remains able to admit work after takeover. Priority: P1; reproduced.**

[Migration 0051](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/apps/api/migrations/0051_source_run_lease_and_admission_register.sql) checks the holder when appending `run.started`. Subsequent events update the run projection, then attempt a lease heartbeat update without rejecting a zero-row update. [Migration 0052](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/apps/api/migrations/0052_admission_register_respects_availability.sql)'s admission claim does not enforce lease ownership either.

The PGlite probe executed these functions unchanged, using minimal supporting tables and explicitly inert authorization/scope doubles. Sequence: A acquires and starts; B is refused while A's lease is current; advance the fixture heartbeat past expiry; B acquires and starts; resume A and append `item.admitted`, then claim a new deterministic item. Both operations from A were accepted while the source lease belonged to B. Both run projections remained `started`.

Recorded results: current-lease competitor refused; expired takeover granted and previous holder recorded; `lease_still_owned_by_new_run=true`; `old_run_admitted_event_accepted_after_takeover=true`; `old_run_new_item_claim_after_takeover="admitted"`.

Frozen correction criteria: fence effectful admission/progress/checkpoint operations against current ownership and expiry in the relevant transaction; prevent stale workers from issuing further collection after losing ownership, and reject late results from already in-flight work. Preserve a legitimate path to record the displaced run's terminal/diagnostic state. Prove paused A → expiry → B takeover → A resumes, with no stale admission or checkpoint effect and no deletion/renewal of B's lease by A. Keep normal overlap refusal, retry/no-op behavior, and F07's original property unchanged. Use a forward migration; do not rewrite applied migrations or earlier reviewed behavior.

**R4 — finish the recovery demonstration against a compatible, identified runtime. Open acceptance evidence; includes a source fallback defect.**

The author transparently records 68 passes and one operator-credential failure. That is progress, not completion of CP-4/5. The [retained drill](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/docs/ops/evidence/restore-drill-20260910T223824Z.md) also records the reconstructed scheduler attempt as `outcome: refused`, with “run … may only open while holding the source run lease … holds none.” It made no egress request and the connector never ran. The script counts dispatch/recording as passes. Scheduler reconstruction and dispatch were demonstrated; successful governed collection was not.

The restored artifact was built from committed `ef85a12…`, while the captured database had the newer lease requirement. This is a concrete application/schema compatibility issue to reconcile, not merely the reported password problem. The source/build hashes help identify it; hashes alone cannot establish compatibility.

Additionally, [restore.sh](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/scripts/ops/restore.sh)'s missing-build-root fallback runs the bundled API dist against the checkout's `node_modules`. A different lockfile is reported and execution continues; an equal lockfile is treated as proof of installed dependency identity. The receipt still sets `identified:true, bound_to_bundle:true`. Code inspection establishes this fallback; no full fallback runtime was executed independently.

Frozen correction criteria: after R1–R3, use one committed, compatible application/dependency/migration checkpoint. Recover/install the dependencies from the recorded build/lock artifacts or fail before launch when they cannot be bound; a report-only mismatch is insufficient. Demonstrate recovery with the original build checkout unavailable. Resolve the operator credential through the existing authorized secret/recovery process; never reset shared data or publish passwords. Repeat the encrypted, non-empty journal/boundary restore and a successful authorized scheduled collection through the restored worker, plus the governed read. Retain the failed evidence and distinguish source restoration from any deliberately authorized upgrade. Then perform the governed live-container recreation with a coherent rollback point and verify image digests, health, service access and process protections.

**Arm64 dispositions — matching is evidenced; approval must be attributable.**

The six records cover 44 platform-qualified finding rows. Focused matching probes independently returned 44 matches across six records, zero unmatched/unused/out-of-scope/stale in the positive control; removing arm64 records left 22 unmatched arm64 findings, and scanning amd64 alone reported both arm64 records as out of scope. This validates matcher behavior, not a new independent vulnerability scan.

SCX-0010 and SCX-0011 classify all 22 arm64 gosu findings as risk accepted, including advisories for which only amd64 has symbol-based not-affected evidence. Do not copy amd64 analysis across platforms. There are **seven unique amd64 NOT_AFFECTED advisories**, not eight: SCX-0004 has one and SCX-0005 has six. Correct this incidental prose without reopening the amd64 findings.

The [temporary GHCR approval](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/docs/images/DERIVED_IMAGES_APPROVAL.md) allows publication and governed re-issuance of applicable dispositions. The record name `gate-2.2-security-review` and a passing scanner reconciliation do not themselves identify the authorized human decision for the new arm64 acceptances. The source policy requires owner and approver to be distinct. No additional explicit decision was established in the available approval evidence; this is an evidence gap, not an assertion that no such decision exists.

Locate and bind the actual decision if already authorized. Otherwise finish artifact-specific analysis using a suitable free Go/govulncheck environment, identify precisely any resource/access genuinely missing, and prepare only the remaining concrete risk decision for the authorized approver. Do not invent approval dates or recast temporary GHCR approval as a waiver. Keep existing amd64 scope/expiry and both-platform gates. Do not ask the user to choose GHCR again; it remains temporary until compatible fixed official images qualify through the governed process.

**Other claims and delivery accounting.**

- PortWatch's 8,418 element rows and 8,427 distinct admitted keys are reconcilable: the keys include nine page objects. Do not treat this as nine extra data rows. The 2,133 governed supersessions and the field outcomes remain author-observed evidence. The connector implementation/version/code-digest discrepancy already reported by Claude needs its governed resolution before treating the revised live connector's provenance as complete.
- The F07 warm-up change is a scheduling accommodation; the relevant asserted property remains. Hosted fresh-database integration passes substantiate the repaired checkpoint. The three local Phase 5 twin staleness failures remain a concrete delivery-register issue; fresh CI and isolated 15/15 do not erase them.
- The stalled attempt and correction-time outbox crash require diagnosis and explicit delivery ownership. R3 must address safe takeover even if the stall is separately repaired. Preserve the deferred `CorrectionApplied` consumer as full-product work.
- The [stack plan](https://github.com/a-Halawany/elven/blob/461a2b56979b0e43c1d86b9323dac4439f4cc80a/docs/ops/STACK_INTEGRATION_PLAN.md) is based on `ef85a12`/`3d7a378`, still calls `ef85a12` unpushed, and ends at migration 0050. It predates the current two-platform gate and 0051–0055. Refresh it from the actual reviewed/corrected head, including the complete maintenance dependency set and selected changes from mixed commit `038fa9f`; do not cherry-pick that commit whole.
- Preserve the recorded integration order: #39 → #36 → #38 → #40 → #41 → #43 → #44 → #45 → #46. Keep reviewed history; do not rebase or rewrite closed heads. The plan is preparation, not merge authorization. Require the complete chain on each actual integration head and its required C17 push archive.
- Browser evidence remains: hosted Phase 0/1 only; author Phase 6 3/3; latest Phase 4/5 one ECB-dependent failure and twelve not run. No changed claim of full browser coverage follows from the green job.
- Full-product unfinished mandatory units remain 3,535. CP-6 acceptance reconciliation, the four decided product choices, eight scenario kinds and other registered requirements remain required. The S7 rule remains zero unfinished mandatory acceptance units on every agreed profile. Owners/dependencies/dates do not close work.
- PortWatch permission remains granted; preserve its actual conditions when supplied. No invented grant text, new purchases, source cadence/budget changes, or use of the deferred UN Comtrade key.

**Next checkpoint to request from Claude.**

Correct R1–R3 with pre-fix reproductions and focused regression evidence; complete R4 against one compatible, recoverable runtime; bind the arm64 risk decision or prepare the exact unresolved approval; refresh connector provenance and the stack plan. Report one code head plus any records-only head, negative and positive probe results, real runtime evidence and actual hosted runs, and the explicit remaining delivery register. Close demonstrated corrections once; do not widen this into another review of earlier closed phases. Do not merge the stack on this review alone.
