# THE EYE — three-track review and response to Claude

Reviewed 10 September 2026. Repository: a-Halawany/elven.
Candidate: `59a245938f88ad9d3abb1a0518c69645eb9c06c7`, PR #46, `phase6-decisions`.
Comparison: three commits after `2e839458361b2accc457f5ae1b53d7a2263780ce`.

## Decision and scope

The three tracks have made substantial progress. “Everything is delivered; nothing further to request” overstates this checkpoint. The audit is a useful first acceptance-unit decomposition; the restore is an author-demonstrated local drill; the publisher is prepared but not operationally ready. Four bounded follow-ups below address these new changes. They do not reopen the closed Phase 6 functional correction review or the earlier closed findings.

The owner has already approved GHCR for TEMPORARY maintenance images, until compatible fixed official PostgreSQL and Redis images are available and verified. Do not ask the owner to choose GHCR again. No waiver, unchecked merge, new purchase, source cadence or budget change follows from that approval. Preserve upstream monitoring and a governed return to official images.

The owner also reports that PortWatch permission has been granted and authorizes proceeding accordingly. The old permission-related replay-only hold is superseded. The grant text/conditions have not been supplied to this reviewer; record the owner-reported approval accurately and preserve its conditions when obtained. This is not evidence that live activation has already happened. UN Comtrade remains deferred and its key untouched.

## Independently established facts

Read-only GitHub inspection confirmed PR #46 open and unmerged at the candidate. Local copies of 41 selected files were verified byte-for-byte against candidate Git blob IDs. Independent Python CSV checks found:

| Measure | Count |
|---|---:|
| Requirements rows / unique volume-ID pairs | 6,264 / 6,264 |
| Acceptance units / unique unit IDs | 3,881 / 3,881 |
| Requirements rows referenced by units | 6,264 |
| Unknown source-row references | 0 |
| Historical family IDs represented | 220 |
| Unit status `open` | 3,238 |
| Unit status `verified:local` | 404 |
| Unit status `not-applicable` | 239 |
| Mandatory=yes units | 3,538 |
| Mandatory=yes, open | 3,129 |
| Mandatory=yes, verified:local, profiles=all | 397 |
| Mandatory=yes, not-applicable | 12 |

No unit has status `done`. One documentary traceability unit retains package=`done`; that is not itself a product-completion claim. These counts establish structure, not exhaustive semantic coverage or a product-completion percentage.

[CI run 34456605360](https://github.com/a-Halawany/elven/actions/runs/34456605360): build-test and browser-regression succeeded. Supply-chain job 102804362797 reports every raw scan step `[ok]`, including trivy-fs and both gitleaks scans. Final reconciliation: 40 findings, nine governed records, 13 unmatched, zero unused records. The patched-image recheck and FINAL C16/C17 steps were skipped. Its checkout was synthetic merge `5aeb2e42a013120ade39e2eb207a0cfcbcd47d9c`, combining candidate `59a2459` with base `c5460465aa3c9a551d15ee5f565c8986dd509a55`. [C19 lifecycle run 34456605532](https://github.com/a-Halawany/elven/actions/runs/34456605532) succeeded.

The CI browser job is the Phase 0/1 regression gate. It does not supersede the separate author evidence: Phase 6 3/3, latest Phase 4/5 serial run one ECB-dependent failure and twelve not run.

I did not independently run PostgreSQL, Redis, the API, browsers, Docker builds, Trivy, Gitleaks or a restore. The focused local executions below used actual script fragments with disposable directories and a harmless marker, plus independent CSV calculations. Recorded image scans and recovery transcripts remain attributed to Claude.

## T1 — Finish acceptance accounting and traceability

The S7 prose is corrected, but its summary logic still conflicts with it. [audit/summarise-units.mjs](https://github.com/a-Halawany/elven/blob/59a245938f88ad9d3abb1a0518c69645eb9c06c7/audit/summarise-units.mjs) excludes every status beginning with `verified` and every `not-applicable` unit from `mandatoryOpen`, then labels that count “Mandatory units not yet verified for every applicable profile.” This drops 397 mandatory `verified:local` units with profiles=`all`.

3,129 is the count in the explicit open status. At least **3,526** mandatory units remain unfinished for full-profile acceptance (3,129 + 397), before resolving the 12 mandatory/not-applicable classifications. Keep progress on the local profile visible without treating it as released cross-profile acceptance.

Concrete classification error: `AU-GOV-0083` is mandatory=yes and not-applicable while its own remaining_work says component evaluation methods and lifecycle relationships still need declaration. Its source, V0:V00-T-001, is a conformance obligation. Documentary verification is a legitimate evidence class; it is not automatically non-applicability. Review these classifications individually, without inventing product tests for genuinely explanatory source rows.

[audit/second-pass.mjs](https://github.com/a-Halawany/elven/blob/59a245938f88ad9d3abb1a0518c69645eb9c06c7/audit/second-pass.mjs) uses path existence on main as release evidence, ignores some bare migration references as prose, and locates source text by the first matching opening words across an entire volume. Examples:

- V4 `ES-24-004` remains `merged` while citing branch-only migration 0033.
- V8 `PR-65-004` records page 148 but source_ref points to page 11, a different occurrence of repeated wording.
- 873 rows have no automatic source_ref. There are 1,333 page-column/source_ref-page discrepancies; repeated definitions can explain some, so this is a reconciliation list, not a claim of 1,333 distinct semantic defects.
- `AU-UX-0408` contains a truncated clause and an adjacent appendix heading (“K Deployment Parity…”). The presence of full extraction files does not itself make every unit lossless or atomic.

The audit method explicitly says verified statuses are inherited and still need case-by-case rechecking. Therefore the 404 are authored local-status assignments, not 404 independently verified units.

Bounded exit: profile-aware acceptance accounting; applicability rationales for mandatory/documentary rows; exact revision/content and result bindings for release/verification labels; source-identity/page-aware start/end spans; repair truncated or conflated units; retain all mappings and historical snapshots. Carry remaining per-unit implementation/verification as CP-6 work, without reopening Phase 6.

## T2 — Fix isolation and preserve recovery after the GHCR switch

The [committed drill](https://github.com/a-Halawany/elven/blob/59a245938f88ad9d3abb1a0518c69645eb9c06c7/docs/ops/evidence/restore-drill-20260910T075051Z.md) supports Claude's 36/36 local result: 247/247 live demo blobs verified, all unfrozen partitions checked, and a governed API read. The harness database has 2,130 absent blobs; the journal was empty. This is useful evidence with the documented scope, not a production recovery acceptance.

Two executable path guards do not uphold the promised isolation:

- [restore.sh](https://github.com/a-Halawany/elven/blob/59a245938f88ad9d3abb1a0518c69645eb9c06c7/scripts/ops/restore.sh) resolves RROOT through `cd ... && pwd`, which preserves a logical symlink path, then checks its textual prefix. The exact preflight fragment accepted an outside symlink pointing directly into a disposable stand-in repository. The real physical destination was inside the repository.
- [backup.sh](https://github.com/a-Halawany/elven/blob/59a245938f88ad9d3abb1a0518c69645eb9c06c7/scripts/ops/backup.sh) checks the parent of BACKUP_ROOT. The exact guard accepted BACKUP_ROOT equal to a disposable stand-in repository itself.

No real runtime state was touched in these probes. Before another drill, use physical canonical paths, reject aliases into protected runtime/worktree/bundle locations, require a newly created isolated destination, and bind cleanup to resources created by that run. Validate destinations before chmod/copy/extraction.

There is also a deterministic integration failure with the planned image switch: backup's image lookup requires `image: postgres@...` / `redis@...`; restore explicitly greps `image: postgres@...`. Neither matches `ghcr.io/a-halawany/elven/postgres@...`. An independent predicate probe confirmed the GHCR reference does not match. Read images by Compose service identity, preserve and verify both bundle pins, and bind the restore to the matching source/build artifact. Re-run the recovery drill against the actual published image digests before disruptive integration work.

Keep encryption, non-empty degraded-journal restoration, and collection/scheduler reconstitution as explicit CP-4/5 acceptance work. The current drill disabled collection and did not prove a non-trivial degraded-journal restore. The current live dump sequence is not a common snapshot across database/vault/journal/config: before/after database counters do not detect every later journal/config change. Either establish a consistent capture boundary or define and verify a bounded consistency/reconciliation procedure. This extends the already requested coherent-recovery work; it does not invalidate the observed quiet-state drill.

## T3 — Make the temporary publisher operational and reviewable

[publish-derived-images.yml](https://github.com/a-Halawany/elven/blob/59a245938f88ad9d3abb1a0518c69645eb9c06c7/.github/workflows/publish-derived-images.yml) has several concrete mismatches:

1. **Dispatch bootstrap:** it exists only on the unmerged branch. Main's workflow directory has no publisher. GitHub requires a workflow_dispatch workflow to exist on the default branch before dispatch, even when the chosen run ref is another branch. Prepare a bounded bootstrap method that respects existing gates; do not merge PR #46 or waive C15 to enable publication. [GitHub's manual-workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
2. **Input handling:** approval_ref and date_tag are interpolated directly into shell source. A harmless command-substitution marker in approval_ref executed during the extracted validation line. Use environment variables/structured inputs, quoted expansions and validation; do not execute approval prose as shell. This was a local reproduction with no token and no external action. [GitHub's script-injection explanation](https://docs.github.com/en/actions/concepts/security/script-injections).
3. **Tags and revision:** the workflow emits `postgres:postgres-maint-20260910` and `redis:redis-maint-20260910`, whereas the proposal names `postgres:18-alpine-maint-20260910` and `redis:8-alpine-maint-20260910`. Align names and bind the run to the exact reviewed source SHA. The current workflow records github.sha but does not validate it against an approved expected SHA.
4. **Platforms and evidence:** it offers amd64+arm64 but scans and generates an SBOM only for amd64. Explicitly establish/verify builder platform support, resolve the index and both children, and retain scans/SBOMs and runtime/upgrade evidence for each published platform. The runner's arm64 build capability was not independently tested here; missing setup is a readiness question, not a proven hosted build failure. [Docker's multi-platform guidance](https://docs.docker.com/build/ci/github-actions/multi-platform/).
5. **Package access and partial failures:** login success proves authentication, not package-specific write authority or public anonymous reads. Actual package settings remain unverified. Check repository association, write access and public visibility; retain publication receipts even if a later scan/image fails. The current evidence upload lacks an always/failure path, so a pushed image can outlive a failed job without its expected uploaded receipt.
6. **Temporary exit:** PUBLICATION.md currently offers retiring the upstream recheck as an option. The owner has now resolved that choice: retain monitoring, update its purpose, and return each service to a compatible verified official image as soon as it qualifies. The present monitor checks OpenSSL only on amd64. A return-to-official decision must also cover the other maintenance fixes, both applicable platforms, provenance, compatibility and the full governed disposition/release chain. No automatic unreviewed repin or deletion of retained evidence.

Keep publication, digest validation, SCX re-issuance, repinning and final integration distinct. A scanner emitting a report successfully does not establish a governed zero-unmatched verdict. No new blanket zero-finding rule is requested: retain justified NOT_AFFECTED treatment for the actual new gosu artifact, without extending old evidence dates.

## T4 — Preserve Redis process protections

The v3 image's explicit USER resolves DS-0002 but skips Redis's upstream setpriv path. The [v3 compatibility evidence](https://github.com/a-Halawany/elven/blob/59a245938f88ad9d3abb1a0518c69645eb9c06c7/infra/images/candidates/evidence/v3/compat-redis.txt) records:

| Redis runtime | Effective capabilities | Bounding capabilities | NoNewPrivs |
|---|---|---|---:|
| Base after setpriv | 0 | 0 | 1 |
| v3 with USER redis | 0 | Docker default set | 0 |

This is a demonstrated reduction in existing runtime protection, acknowledged in the candidate README. Restore equivalent restrictions in the deployment configuration or entrypoint and verify them on the new artifacts. The suggested Compose `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]` are a concrete path to evaluate. Preserving existing protection is part of this image replacement; it need not become a new product-choice request. The current recorded startups, TLS and base-data compatibility are useful but do not erase this delta.

## Four product choices — recommended response

These are recommendations for the owner to convey, not decisions this reviewer has applied:

- Warning levels: accept low/normal/high/critical with a versioned derivation that states impact and response urgency. Keep confidence and C0–C4 operation/authority class explicit and distinct; a display label must not change decision authority.
- Profiles: three deployment-mode legs are a reasonable register structure, provided disconnected and air-gapped rows carry every applicable capability's acceptance evidence, conditions and dependencies. Do not use dedicated rows to omit cross-capability offline evidence.
- SLOs: preserve safety/durability/provenance semantics and required floors, with expressly declared, justified operational variance where the controlling clauses permit it. Complete the mapping for the entire catalogue, not just the examples listed.
- Capability IDs: prefer subject-based, versioned aliases, including CAP-PD-11 to CAP-AU-08 plus CAP-DL-12, only with lossless mapping of every source obligation. Never delete a capability requirement merely to preserve the number 108. Keep historical identifiers resolvable.

The eight scenario kinds belong in P4 delivery work. Preserve the earlier correction closure; this is a full-product omission, not a reopened correction finding.

## Copy-ready message for Claude

Continue from 59a245938f88ad9d3abb1a0518c69645eb9c06c7. Preserve Codex's Phase 6 correction closure at 2e83945 and all earlier closed findings. Do not call this checkpoint full delivery.

GHCR is already approved as a TEMPORARY maintenance route for PostgreSQL and Redis. Keep upstream monitoring and return to compatible verified official images through the governed digest/disposition/release process. Do not ask me to choose GHCR again or treat it as a permanent image-maintenance commitment. No waiver or unchecked merge.

Complete four bounded follow-ups:

1. Audit: implement S7 in the accounting, not only prose. 397 mandatory profiles=all units marked verified:local still lack full-profile acceptance: 3,129 open-status units therefore do not represent all unfinished mandatory work. Reconcile the 12 mandatory/not-applicable cases, including AU-GOV-0083. Fix exact source spans, truncated/conflated units and release evidence (examples PR-65-004, AU-UX-0408, ES-24-004). Keep all 6,264 rows and 220 historical families; treat 404 local statuses as provisional until their exact evidence is reconciled. Finish CP-6 incrementally.

2. Recovery: fix physical-path/symlink containment and require a fresh isolated destination before any chmod/copy/extraction. The current restore guard accepts an external symlink into the repository, and backup accepts the repository itself as its root. Update image lookup for GHCR service pins; the current postgres@/redis@ regexes will break after repinning. Repeat the drill against the actual published digests and matching source/build. Keep encryption, meaningful degraded-journal recovery, snapshot consistency and scheduler reconstruction as explicit CP-4/5 work. Preserve the existing 36/36 quiet-state drill with its scope.

3. Publisher: resolve the default-branch workflow_dispatch bootstrap without merging the Phase 6 stack or bypassing gates. Pass free-text inputs through environment variables, align the exact proposed tags, validate the approved source SHA, verify builder support and both platform digests, retain per-platform scans/SBOMs and compatibility evidence, and preserve receipts on partial failure. Verify actual package write/public access; docker login alone is insufficient. Continue publication and the full FINAL chain within the existing temporary approval once this preparation is complete. Bring me only a specific additional authority requirement if the bounded bootstrap or an account setting genuinely needs it.

4. Redis: preserve the base's NoNewPrivs=1 and empty capability bounding set. v3 currently loses both by skipping setpriv. Apply and verify equivalent restrictions as part of the image deployment change; do not treat restoring these existing protections as an optional product feature.

For the four product choices, use the recommended directions subject to these conditions: four warning levels with explicit impact/urgency and separate confidence/authority semantics; three deployment modes with complete disconnected/air-gapped coverage; non-weakened safety SLOs with declared permitted operational variance; versioned subject-based CAP aliases that preserve every obligation. Schedule all eight scenario kinds as P4 completion work, without reopening its closed correction reviews.

PortWatch permission is now granted according to the owner: record the approval and applicable conditions and progress activation within the approved rights, cadence and budget. Correct “all holds unchanged”; UN Comtrade remains deferred and its key untouched. The CorrectionApplied consumer remains required full-product work.

Return one consolidated checkpoint with exact SHAs, changes, passed/failed/not-run evidence by class, unresolved dependencies and the next implementation checkpoint. Keep unblocked work moving; no additional broad correction pass.

## Local probe results

Actual guard fragments executed only against disposable stand-in directories:

- Restore outside symlink into stand-in repository: accepted, exit 0; physical destination inside repository.
- Backup root equal to stand-in repository: accepted, exit 0.
- approval_ref command substitution: harmless marker executed, exit 0; no credentials supplied.
- Restore's literal postgres@ predicate against a representative GHCR pin: no match.

No upstream repository changes, comments, workflow dispatches, publication, merge, source activation, credential use, purchases or emails were performed by this review.
