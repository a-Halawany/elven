# THE EYE — bounded review of d4730f2

Reviewed 2026-09-10. Code head: `d4730f2ff42c4f6337c3b866d4b98a59ff58da3a`. Documentation head: `3d7a37821b08b5bf22f83903547ce8c524bcf3ba`.

The publication and hosted CI claims are supported. The old isolation failures are corrected. Two previously requested acceptance elements remain incomplete: governed disposition coverage for the published arm64 PostgreSQL image, and reliable source/build identity for the restored API. These can be completed within the next planned checkpoint; they do not require another broad Phase 6 review.

PR #46 remains open and unmerged. The bounded Phase 6 correction closure at `2e839458361b2accc457f5ae1b53d7a2263780ce` and all earlier closed findings remain closed. This review does not authorize a merge or establish full-product acceptance.

## Evidence and scope

Compared the eight commits from `59a245938f88ad9d3abb1a0518c69645eb9c06c7` to the code head, covering 88 changed paths. The documentation follow-up changes only `FULL_PRODUCT_DELIVERY_REGISTER.md`, `PHASE6_REPORT.md`, and `PROGRESS.md`.

Independently performed in this review:

- Recounted and compared the actual acceptance-unit and requirement CSVs, including retained identifiers and source-row mappings.
- Executed eight disposable-directory probes against the committed guard functions: 8/8 passed, including the previous outside-symlink and backup-root-equals-repository failures. No Docker calls were made by these probes.
- Fetched both GHCR index manifests anonymously, obtained HTTP 200, recomputed their SHA-256 digests, and checked the four child references.
- Inspected the hosted job logs, job outcomes and artifact metadata; inspected the publication workflow and committed per-platform evidence. Eleven retained publication files, including the four decompressed SBOMs, match their recorded receipt checksums.
- Exercised the actual C18 command-graph verifier with bounded producer-shaped prefixes and explicit doubles to investigate the empty-image-user branch. This was a partial command-graph probe, not an execution of the C18 database gate.

Not independently executed here: PostgreSQL, Redis, HTTP application flows, browsers, Docker, Trivy, backup/restore, or PortWatch collection. Their runtime results remain author-observed or hosted evidence, as identified below.

## Disposition of the four follow-ups

| Follow-up | Bounded disposition | Remaining acceptance work |
|---|---|---|
| T1 — accounting and identified unit repairs | The corrected count and preservation checks pass. Named examples are repaired. | Correct the 7/5 reporting typo; complete CP-6 semantic reconciliation and exact evidence binding. |
| T2 — isolation and recovery after repinning | Close the demonstrated destination-guard failures. GHCR service lookup and bundle-pin checks are implemented. | Bind the API build to verified source/dependencies. CP-4/5 operational recovery remains open. |
| T3 — temporary GHCR publication | Publication, public readability, recipe binding, two-platform manifests and SBOMs are evidenced. amd64 C15 reconciliation passed. | arm64 PostgreSQL findings lack applicable governed dispositions. Complete this before treating arm64 use as accepted. |
| T4 — Redis process protections | Close the configuration regression: both services declare user, cap_drop ALL and no-new-privileges. Author drill evidence records their effect on the published arm64 images. | Live containers still need the separately recorded rollout. |

### T1: counts are correct; completeness remains open

The actual files contain 6,264 unique volume/id requirement pairs and 3,884 unique acceptance units. All 6,264 source rows resolve from the units, with no unknown row references. All 3,881 previous unit IDs remain, and no previous unit loses a source-row mapping. The three additional IDs are `AU-GOV-0439`, `AU-GOV-0440`, and `AU-INF-0867`. The requirement files still map 220 historical family IDs.

There are 3,306 open units, 345 marked verified locally, and 233 not applicable. Mandatory unfinished work is exactly **3,535 = 3,196 open + 339 verified locally but applicable to all profiles**. No mandatory unit remains marked not applicable. This is an inventory count, not a product-completion percentage.

The former twelve mandatory N/A units actually became **seven open obligations and five documentary rules**, not eight and four. Both the CSVs and the per-unit table support 7/5. Correct the narrative in `audit/UNIT_REPAIRS.md` and checkpoint summaries; do not alter valid classifications to fit the mistaken prose.

`AU-GOV-0083` is now an open document-class obligation; the truncated/conflated `AU-UX-0408` statement is repaired; `ES-24-004` is branch-only; `PR-65-004` points to page 148. These specific findings need not be reopened.

CP-6 remains substantive work. There are still 873 empty source references, 292 references using paragraph/slide fallback, and 217 page-mismatch markers reported by the method. The repair ledger also explicitly preserves detached preamble/table fragments whose acceptance-unit mapping is unresolved. They must receive exact mappings or documented applicability decisions. A nonempty pointer or a named test does not establish that every obligation in a unit is verified.

[Unit repairs at the reviewed head](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/audit/UNIT_REPAIRS.md), [audit method](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/audit/AUDIT_METHOD.md).

### T2: preserve the guard closure; finish build binding in the planned recovery drill

The corrected guards resolve physical paths, reject protected-path containment, require a fresh destination, and record created resources for cleanup. The two previously demonstrated failures are now refused. Service-based Compose parsing supports GHCR references; restore checks the bundle pins against the recorded source revision when that revision is available.

The author’s 44/44 drill demonstrates restoration onto the published arm64 images with the declared protections. It preserves the earlier quiet-state evidence and honestly records the empty journal, frozen fixture partitions, harness blob limitations, and disabled scheduler.

The API build linkage requested in T2 is still not established by the evidence. The drill says that no source file is newer than the newest `dist` file, and therefore reuses the September 9 build. File timestamps do not prove which source and dependencies produced that build. `restore.sh` starts the checkout’s `apps/api/dist/main.js` without verifying a recorded application artifact digest.

For the already planned encrypted, non-empty-journal drill, use a clean, identified source and lockfile, record the resulting build identity/digests, and bind the restore receipt to those artifacts. Record any deliberate source-to-target upgrade. Do not rerun another empty-journal demonstration merely to add a check count.

CP-4/5 still needs coherent capture across database/vault/journal/configuration, encryption and recoverable key handling, non-empty degraded-journal recovery, and scheduler reconstruction with collection enabled in isolation. Before replacing live Redis, demonstrate reconstruction of persisted schedules/attempts from durable state: Compose declares no Redis data volume. Preserve the actual approved source cadence and budget.

[Restore implementation](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/scripts/ops/restore.sh), [published-image drill](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/docs/ops/evidence/restore-drill-20260910T173954Z.md).

### T3: publication is real; arm64 governance remains separate from amd64 C15

The publisher uses a push bootstrap on its bounded publication branch, job-scoped package authority, validated committed inputs, recipe-blob comparison against the approved source, native platform builds, and retained receipts. Hosted package API output confirms public visibility and repository linkage. Independent anonymous reads confirm these index and child digests:

| Image | Index | linux/amd64 | linux/arm64 |
|---|---|---|---|
| PostgreSQL | `69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` | `bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a` | `d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc` |
| Redis | `1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15` | `0c0a48ddfcea413916152bc64e91c665d0822053099d9bc385a4747d71609432` | `c11d75cace5d4effc9524e6baa11f559440f398e6f53899332557bf455ad56dc` |

All values above use `sha256:`. References are under `ghcr.io/a-halawany/elven/{postgres,redis}`.

Both platform SBOMs record PostgreSQL’s libuuid 2.42.3-r1, OpenSSL libraries 3.5.8-r0 and c-ares 1.34.8-r0; Redis’s setpriv 2.41.6-r1 and OpenSSL libraries 3.5.8-r0. The retained scans report zero HIGH/CRITICAL findings for Redis and 22 PostgreSQL gosu findings per platform, with zero PostgreSQL OS-package findings at that severity filter. Do not turn this filtered result into an all-severity vulnerability-free claim.

The four reissued SCX records all explicitly say `scan_platform: linux/amd64`. The dispositions document expressly states that they cannot govern another platform. The hosted amd64 C15 result correctly reconciles 22 findings to four records with zero unmatched and zero unused records. Fifteen findings are RISK_ACCEPTED; seven are NOT_AFFECTED. They are not all false positives.

The published arm64 child has its own binary and finding set, and the local drill actually used it. An arm64 scan and byte identity to the arm64 base do not make amd64-scoped approval or amd64 symbol analysis applicable to arm64. Complete artifact-specific arm64 analysis/dispositions and reconciliation under the existing governance contract. Preserve the amd64 records’ scope, dates, expiry and unused-record checks. No blanket zero-finding requirement is being introduced.

GHCR remains a temporary maintenance route. The revised monitor checks the watched package fixes on both official platforms and blocks for a qualifying candidate or indeterminate result. Actual return still requires provenance, compatibility, applicable dispositions and the release chain. Keep the monitoring and evidence; do not ask the owner to choose GHCR again.

[Publication run](https://github.com/a-Halawany/elven/actions/runs/34502081248), [disposition scope](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/docs/SCANNER_DISPOSITIONS.md), [machine records](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/scripts/gate/scanner-exclusions.json).

## Hosted gates and the bounded C18 follow-up

The CI run is green on synthetic merge `a2feb620e437a4c6451bbea7e158c6aa2e6d8bdc`, joining code head `d4730f2` to base `c5460465aa3c9a551d15ee5f565c8986dd509a55`. Build-test includes the reported C18 612 tests plus 44 controls. Supply-chain logs confirm C15, patched-image recheck, FINAL C16, FINAL-manifest assertion, licence inventory and C17 validation. C19 lifecycle also passed. C17 archive packaging/upload are push-only and skipped in this PR run, as reported; their post-merge execution remains required.

The filesystem verifier now derives Dockerfile targets from tracked source and rejects reported failures/exceptions. The frozen C18 verifiers retain their code; a generated and stale-checked legacy Compose view preserves image digests while presenting the old reference syntax. Differential-suite translation is distinct from verification of the current producer’s unmodified ledger. No current derived-image gate waiver was found in these inspected adaptations.

A narrow new producer/verifier mismatch exists for an image with empty `Config.User`. The producer always records the image-user lookup and always uses `docker exec -u 0 -i` for the secret sink. For empty output it returns a null owner, but the verifier rejects the recorded empty lookup and expects the older seven-argument exec form. The independent prefix probe reproduces both errors; a named-user control has neither handoff error. This does not invalidate the green run using the current non-root images. Fix the empty-user branch before relying on the governed return to official images, preserving exact argv/stdin binding and historical ledger compatibility. The probe did not execute Docker or a complete database history.

[CI run](https://github.com/a-Halawany/elven/actions/runs/34515658422), [C19 run](https://github.com/a-Halawany/elven/actions/runs/34515658380), [C18 producer](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/scripts/gate/c18-db-paths.mjs), [C18 verifier](https://github.com/a-Halawany/elven/blob/d4730f2ff42c4f6337c3b866d4b98a59ff58da3a/scripts/gate/lib/c18-query-plan.mjs).

The green browser-regression job covers its configured Phase 0/1 scope. It does not replace the recorded Phase 6 3/3 browser evidence or the Phase 4/5 serial run with one ECB-dependent failure and twelve not run.

## Next checkpoint and message to Claude

The existing full-product register remains authoritative for unfinished capabilities. The four product decisions, eight required scenario kinds and deferred CorrectionApplied consumer remain implementation work. Owners and dates schedule that work; they do not satisfy S7. PortWatch approval is recorded as granted, while its exact grant text/conditions remain a concrete evidence resource to obtain. UN Comtrade remains deferred and its key untouched.

Send Claude the following:

> Continue from d4730f2 / 3d7a378 with one bounded checkpoint. Preserve the Phase 6 closure at 2e83945 and every earlier closed finding. Codex confirmed the revised counts, the repaired guard failures, the publication digests/public readability and the hosted green chain. Full-product acceptance remains open.
>
> 1. Finish arm64 disposition reconciliation before the live arm64 rollout. All four current SCX records are amd64-only; the published arm64 PostgreSQL image has 22 gosu findings and was used in the restore drill. Bind the arm64 analysis and governed dispositions to its actual artifact. Preserve justified NOT_AFFECTED treatment, existing approval/expiry history and strict per-platform matching; do not widen the amd64 records or weaken unused-record checks.
>
> 2. Complete the planned CP-4/5 drill with a clean source/build identity and recorded artifact digests, encrypted backups, a non-empty degraded journal, coherent capture, and scheduler reconstruction with collection enabled in isolation. The existing newest-dist timestamp comparison does not establish build identity. Preserve the 44/44 quiet-state evidence and closed guard findings. Request only a concrete missing encryption/recovery resource if needed.
>
> 3. Prioritize the live PortWatch P1 fixes before the rollout: serialize operator and scheduled attempts per source, make admission idempotent under overlap and retry, and implement the versioned chokepoints composite key while preserving existing single-field key behavior. Exercise overlap and crash/retry cases in isolation. Reconcile the 2,133 reported duplicate copies through the governed correction path, preserving history and reporting distinct observations accurately. Then activate the corrected chokepoints contract within the existing permission, cadence and budget. Keep the exact grant text/conditions as a pending evidence resource; do not invent them.
>
> 4. Fix the narrow C18 empty-Config.User mismatch: the producer records an empty lookup and root exec, while the verifier rejects that lookup and expects legacy exec. Retain exact command/stdin binding, named-user behavior, historical ledger compatibility and frozen verifier files. This is preparation for the temporary GHCR exit, not a reopened Phase 6 correction.
>
> 5. Correct the accounting prose to seven open obligations and five documentary rules among the twelve former mandatory N/A units. The independently checked unfinished total remains 3,535. Continue CP-6 source/acceptance/evidence reconciliation and schedule implementation of the four decisions, eight scenario kinds and CorrectionApplied consumer. None closes by scheduling alone.
>
> Once the applicable rollout prerequisites are evidenced, perform the governed live-container recreation with verified backup and rollback, retaining volumes and recording actual image/process protections plus scheduler recovery. Prepare the branch stack in its recorded order with the maintenance fixes present on every proposed integration head; preserve the existing review and merge gates. Report exact head/base/merge SHAs and the full chain, then require the push-only C17 archive after each applicable merge. Distinguish the configured CI browser scope from Phase 4/5/6 browser evidence. PR #46 stays unmerged until its prerequisites are met.
>
> GHCR remains temporary until compatible fixed official images are verified through the governed return process. Keep upstream monitoring active. No new purchases, cadence/budget changes or Comtrade activation. Return one consolidated evidence-backed checkpoint identifying remaining blockers, not a full-delivery claim.
