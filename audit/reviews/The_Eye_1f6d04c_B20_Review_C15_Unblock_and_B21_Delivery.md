# THE EYE — B20 bounded review, C15 unblock, and B21 delivery
Reviewed 2026-09-22. Repository: a-Halawany/elven. Continuation of the B18/B19 review; closed findings remain closed.

**New capabilities implemented and functioning.** B20 adds six governed projection partitions, a derived verification watermark on twelve exploration/memory reads, withdrawal and rebuilding, labelled fallback reads and constrained traversal, canonical-memory metadata fallback, deletion pause, briefing degradation signalling and a Projections UI. The hosted functional jobs passed. This review inspected source and hosted evidence and executed a focused isolated TypeScript probe.

**Capabilities partially implemented.** The projection model covers the six declared graph/memory projections, not every operator/agent route or an implemented lexical/vector index. Vault-byte degradation remains incomplete under AU-MEM-0067; source-derived memory and the 14 partial interface contracts retain their outstanding clauses. One bounded B20 defect is reproduced below and should be corrected in B21.

**Capabilities still missing.** The existing register still includes broader source-memory ingestion/coverage, governed cross-domain reference, replication/portability, package encryption and the other unfinished eleven-volume requirements. Fourteen partial interface contracts are not the total number of remaining product features. B21 fitness/coherence/challenge can proceed while the integration prerequisite is completed.

**Acceptance work remaining.** The recorded split is **3,555 mandatory units unfinished = 3,179 open + 339 verified locally + 37 verified in CI**. B20's records bind AU-MEM-0068 and AU-MEM-0083 to passing functional/browser jobs; AU-MEM-0067 stays open. The overall CI workflow is red, so this is not a claim that all required gates passed. No deployment leg is accepted and these statuses are not an implementation percentage.

**Recommendation.** Complete the prepared official-image transition in #57, including the recheck's post-return behavior; pass its required gates before merging. Then integrate #56 and #58 in order with their normal checks and completed main/archive chains. Carry B20-F1 in B21 and continue feature delivery. No new broad hardening/review campaign is warranted.

No repository writes, merges, workflow dispatches, account changes, deployments or live-service operations were performed by Codex.

**Verified heads and gate state**

| Item | Independently checked state |
|---|---|
| #55 / main | Merged at `e70f90fbc0b331889f9bd630f03ece758948f1e5`. [CI 35771687190](https://github.com/a-Halawany/elven/actions/runs/35771687190): build-test and browser green; supply-chain failed at the patched-image recheck. Subsequent C16/C17 steps were skipped. |
| #55 archive follow-up | [C17 finalize 35773974178](https://github.com/a-Halawany/elven/actions/runs/35773974178) skipped. [C19 anchor 35773990447](https://github.com/a-Halawany/elven/actions/runs/35773990447) has green guard/verification jobs but **publish skipped**. A green workflow badge here does not establish a finalized archive or a newly published anchor. |
| [#56](https://github.com/a-Halawany/elven/pull/56) | Open at `3ea676d3d136b09d57e0ad09eaa4767dcfe260cc`, still based on phase6-b18. Prior bounded review stands. |
| [#57](https://github.com/a-Halawany/elven/pull/57) | Draft at `920376004526ee2f351a457fd1b29e54de486b17`, based on main. Both the draft disposition state and unchanged recheck leave its gates red. |
| [#58](https://github.com/a-Halawany/elven/pull/58) | B20 code `1f6d04cfa52bcd23f78044865fad597cca99d4c1`; records `13ed40caee9feecc860f69c6ef5b1f731e8b3be9`; based on phase6-b19. The records commit changes seven record/evidence files, not product code. |

At the last inspection, records CI 35785003874 still had build-test running, browser passed and supply-chain failed; records C19 35785003861 had passed. No new refresh or waiting loop is needed to establish the already verified blocker.

**Correction to my previous C15 guidance**

I described the patched-image recheck as a separate scheduled monitor. That was incomplete: [.github/workflows/ci.yml](https://github.com/a-Halawany/elven/blob/e70f90fbc0b331889f9bd630f03ece758948f1e5/.github/workflows/ci.yml) also runs it as a **blocking supply-chain step**, including after an earlier failure when its output directory exists. It was therefore capable of stopping #55's post-merge chain. Claude correctly held #56 under the instruction to finish the first chain before advancing main.

There are three concrete pieces to completing #57:

1. Apply the six prepared disposition reissues with the owner's actual approval date and accurate evidence hashes.
2. Refresh the recorded scanner/trace fixtures from real runs with the pinned tooling, then pass the existing required gates.
3. Complete the recheck's return transition. At `9203760`, [check-patched-images.mjs](https://github.com/a-Halawany/elven/blob/920376004526ee2f351a457fd1b29e54de486b17/scripts/gate/check-patched-images.mjs) exits 1 whenever it finds a compatible fixed official image. It does not recognize that this is now the configured image. **The six approvals alone cannot make this branch green.**

The existing publication/maintenance records explicitly leave the post-return monitor behavior to the owner. The practical choice is to retain monitoring at the existing cadence and make the completed, matching official pin pass; a newer compatible official build should trigger the documented update process, and an indeterminate check must remain visible. This is completion of the existing transition, not removal of the supply-chain gate or use of continue-on-error.

Allow #57 to advance main to repair this prerequisite. Its successful cumulative main/archive chain can cover the code already merged through #55. Preserve #55's original red/skipped history; do not describe that original run as retrospectively green or rerun it indefinitely.

**What the six owner approvals cover**

I compared the approved and draft objects in [scanner-exclusions.json](https://github.com/a-Halawany/elven/blob/920376004526ee2f351a457fd1b29e54de486b17/scripts/gate/scanner-exclusions.json). Each keeps its advisory list, platform, package/PURL/version, severity, result target, classification and prohibited-use scope. Every expiry remains **2026-11-05**.

| Records | Platform | Existing classification and finding scope |
|---|---|---|
| SCX-0002 | amd64 | RISK_ACCEPTED, 14 HIGH |
| SCX-0003 | amd64 | RISK_ACCEPTED, 1 CRITICAL |
| SCX-0004 / SCX-0005 | amd64 | NOT_AFFECTED, 1 / 6 HIGH |
| SCX-0010 | arm64 | RISK_ACCEPTED, 21 HIGH |
| SCX-0011 | arm64 | RISK_ACCEPTED, 1 CRITICAL |

They rebind these dispositions to official PostgreSQL index `77f58511…`, with updated evidence. The committed official-versus-derived scan tables contain identical HIGH/CRITICAL finding sets for each platform: 22 each, zero newly added rows. The author's evidence records the same gosu binaries, compatibility work and the official Redis return without a disposition reissue. Local scans used a Homebrew scanner build; they do not replace the required authenticated scanner run.

This supports approving the **bounded reissue**, without widening scope, extending expiry or treating it as deployment approval. I did not run Docker/Trivy or independently extract the image binaries. Approval markers remain PENDING in [SCANNER_DISPOSITIONS §3.9](https://github.com/a-Halawany/elven/blob/920376004526ee2f351a457fd1b29e54de486b17/docs/SCANNER_DISPOSITIONS.md); Codex has not filled them in.

**B20 functional evidence**

Inspected [CI 35779940271, attempt 2](https://github.com/a-Halawany/elven/actions/runs/35779940271), build-test job 106930091028:

| Check | Hosted result |
|---|---:|
| API unit / meta | 2,338 / 9 passed |
| Acceptance | 58 passed |
| Integration | 1,070 passed in 71 files |
| B20 projection harness | 9 passed |
| Upgrade proof | Through 0080 |
| C18 | 612 + 44 passed |
| Browser regression | 51 passed, including three B20 walks |
| C19 lifecycle | [35779940295](https://github.com/a-Halawany/elven/actions/runs/35779940295) passed |

GitHub used synthetic merge `f81d2f9`, combining B20 code with B19's records head. The supply-chain gate itself reconciled 44 findings with six dispositions and zero unmatched findings. The next recheck failed, and downstream C16/C17 steps were skipped. Calling the whole chain green would be incorrect.

Attempt 1's actual B14 failure was an expected 401 versus null receipt status on attempt ten; 1,069/1,070 passed. The same-commit rerun passed. I verified the failure and rerun, not its alleged environmental cause. Preserve that distinction.

Source inspection covered [migration 0080](https://github.com/a-Halawany/elven/blob/1f6d04cfa52bcd23f78044865fad597cca99d4c1/apps/api/migrations/0080_b20_index_tier_degradation.sql), the projection state/fallback/services, retrieval consumer, memory service, controller delta and relevant harness assertions. The SQL implements the derived applied-prefix watermark, shared check locks versus exclusive rebuild locks, symmetric comparisons and withdrawal, and the recorded rebuild/refusal outcomes. These SQL paths were inspected, not independently executed in PostgreSQL.

The isolated probe executed actual candidate TypeScript for projection labels, entity fallback and memory retrieval, with explicit query/savepoint/ledger doubles and the actual clearance helper. It confirmed:
- Current/unverified/withdrawn labels and independence of routes that do not read the withdrawn partition.
- Entity fallback excludes a row absent from the log, serves log state for drift, and represents a missing projection row.
- A serving memory projection plus recoverable content failure serves metadata without content and records degradation.
- A disallowed purpose still refuses; an existing withdrawn projection row plus the same content failure returns the declared 503.
- A missing projection row can be reconstructed and read while its canonical content answers.

**B20-F1 — a missing memory projection bypasses the content-failure boundary**

At the reviewed code, combine a withdrawn memory partition, an item present in its log but absent from its projection, and a recoverable failure of the canonical lookup.

[MemoryService.retrieve](https://github.com/a-Halawany/elven/blob/1f6d04cfa52bcd23f78044865fad597cca99d4c1/apps/api/src/graph/memory/memory.service.ts) calls `current()` before entering its canonical-content savepoint/catch. For an absent row, [memoryItemsFromLog](https://github.com/a-Halawany/elven/blob/1f6d04cfa52bcd23f78044865fad597cca99d4c1/apps/api/src/graph/projections/fallback.ts) itself queries canonical content. A statement cancellation there escapes the promised degraded-response handling.

The independent query double threw SQLSTATE **57014** at that actual lookup:

| Case | Observed service outcome |
|---|---|
| Serving projection + cancelled content query | Metadata only; one degradation record |
| Withdrawn partition + existing row + cancelled content query | 503, EYE-DEG-001 |
| Withdrawn partition + missing row + content available | Correct content served |
| Withdrawn partition + missing row + cancelled content query | Raw 57014 escaped; **zero savepoints entered** |

This is a service-boundary reproduction, not a real database cancellation or HTTP-status measurement. Local probe: `review-b20/probe-b20.cjs`; result and source hashes: `review-b20/probe-b20-results.json`.

Correct the early fallback lookup's failure handling and transaction boundary, preserving authority refusals and the declared unavailable response. Add a focused case combining the missing-row and content-failure conditions; existing separate controls remain. This is bounded work for B21, not grounds for another broad audit or reopening closed findings. My integration recommendation carries this finding explicitly; it does not call it closed.

**Scope, demonstration and remaining delivery**

AU-MEM-0067 expressly requires metadata fallback when the content tier is unavailable. The current record says the canonical-read clause is implemented but the vault-byte clause is not. Keep it open and implement the missing behavior while preserving A7's confidentiality/integrity rules. Do not seek an owner waiver merely to promote the unit.

The [B20 demonstration log](https://github.com/a-Halawany/elven/blob/1f6d04cfa52bcd23f78044865fad597cca99d4c1/evidence/cp6/act-b20.txt) records 39 checks, withdrawal, labelled traversal, deletion pause and restoration. Its rebuild changed **zero rows** because the live demonstration was not corrupted; repair of drift/poison/missing rows is harness evidence. Six subscriptions received the rebuilt event: retrieval did non-empty verification work; five did no item work. These are author logs, not independently operated live services.

The reported loss of the B18/B19 scratch backups must remain recorded. The act names a new pre-0080 dump under the repository's local backup directory. I did not inspect that host or verify the dump. Preserve durable backups and recovered implementation records; do not claim the lost backups were restored from transcripts.

Broader operator/agent read labelling, vault degradation and remaining source-memory semantics remain implementation work. Keep the fixture-quality and previously recorded structural hardening residuals for the later campaign. This review did not run PostgreSQL, Redis, HTTP, browsers, Docker, Trivy, the full suite or an archive verifier.

**Proposed owner instruction to Claude**

> I approve the six prepared #57 reissues—SCX-0002, 0003, 0004, 0005, 0010 and 0011—with their scope, classification and 2026-11-05 expiry unchanged. Record the actual approval date.
>
> Complete the official-image return in #57: update the recheck so the already adopted, compatible official pin passes and newer compatible official builds trigger the existing update process. Preserve cadence and visible indeterminate failures. Regenerate the real scanner/trace evidence and pass the existing gates; do not bypass them.
>
> I authorize #57 to advance main and unblock the incomplete #55 chain. After #57's main C17/C19 chain completes, retarget and merge #56, complete its chain, then retarget and merge #58 after its required checks and complete its chain. Preserve the original failed/skipped runs. This authorizes these integrations, not deployment.
>
> Continue B21 from 13ed40c while the transition runs. Include Codex's B20-F1 missing-projection/content-failure correction with a focused reproduction. Keep AU-MEM-0067 open until the missing vault behavior is delivered; do not reduce the acceptance scope.
>
> Full features across all eleven volumes and the integrated NORDWERK demo remain the priority. No broad hardening or repeated review campaign. Preserve closed findings, frozen criteria, applied migrations, durable backups, demo services and budgets/cadences. Bind hosted evidence once per batch and continue the delivery register.


