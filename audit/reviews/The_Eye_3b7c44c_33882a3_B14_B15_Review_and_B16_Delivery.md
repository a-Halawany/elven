# THE EYE — B14/B15 bounded review and B16 delivery
Date: 2026-09-16

## Decision

**New capabilities are functioning:** receipt binding on the initial HTTPS response, certificate-anchor TLS delivery, revocation notices, signed graph-link packaging, and streamed export/download/delivery above the earlier 256 MiB ceiling.

**Partially implemented:** revocation recipient coverage and exact-version graph closure have the two bounded defects below. Public-network HTTPS activation, functional browser walks and the wider exchange contract remain incomplete.

**Still missing:** governed import and round-trip delivery (B16), the remaining semantics of the 24 partial interface contracts, source-derived memory, index-tier degradation, and deployment-profile work. Required capabilities remain implementation work; they are not optional hardening.

**Acceptance work:** no deployment leg is accepted. The inspected B15 register reports 3,555 mandatory units unfinished = 3,182 open + 339 verified locally + 34 verified in CI. These statuses do not measure implementation completion. The AU-COM-0058 verification claim needs the qualification described below.

B13-F1 is **closed at B14 code 3b7c44c**. Preserve all earlier closures. This review introduces **no additional correction-only merge hold**. Recommend that the owner authorize #51, followed by #52 after retargeting and its normal required checks, with the usual post-merge C17/C19 chains. Claude explicitly reserved #51 for the owner's word; this report is a recommendation, not a GitHub action or evidence that new authorization was already given.

Carry B14-F1 and B15-F1 into B16's import/export implementation, with focused functional controls. Do not start another broad audit, finder/refuter/re-judge campaign, or records-refresh loop. Full implementation across all eleven volumes and the integrated NORDWERK demonstration remain the objective; comprehensive hardening follows implementation.

## Exact checkpoint and gates

| Item | Independently observed |
|---|---|
| #50 | Merged at `be72aa87d9604b87ab99ab3467786dcb04aacf5d` |
| B14 code | `3b7c44c8aa21b1143d5997fdb4e386026841f8bf` |
| #51 records/head | `20d0b0f425f9bf8c5a758f9b502b35b3cf264a34`; open, mergeable, clean; base main |
| B15 code / #52 head | `33882a31a0aaf5bee5d83e8e6b2cd425e0d19943`; open, mergeable, clean; base phase6-b14 |
| B14 code CI / C19 | [35070312503](https://github.com/a-Halawany/elven/actions/runs/35070312503) / [35070312431](https://github.com/a-Halawany/elven/actions/runs/35070312431), successful |
| B14 records CI / C19 | [35072239498](https://github.com/a-Halawany/elven/actions/runs/35072239498) / [35072239546](https://github.com/a-Halawany/elven/actions/runs/35072239546), successful |
| B15 code CI / C19 | [35074350184](https://github.com/a-Halawany/elven/actions/runs/35074350184) / [35074350249](https://github.com/a-Halawany/elven/actions/runs/35074350249), both completed successfully, attempt 1 |

B14's records commit changes four documentation/evidence files only. B15's hosted binding commit had not appeared on #52 at the final inspection. If it is added, check that its delta is records only and let the existing required checks run. A new independent product review is not required merely to bind those results.

The earlier #50 records C19 [35034334861](https://github.com/a-Halawany/elven/actions/runs/35034334861) is successful on attempt 2, at the same records commit. The failed HTTP-504 attempt remains in history.

**#50 integration is closed.** All four main-chain runs are successful on be72aa8: [CI 35066467509](https://github.com/a-Halawany/elven/actions/runs/35066467509), [C19 lifecycle 35066467514](https://github.com/a-Halawany/elven/actions/runs/35066467514), [C17 finalize 35067820527](https://github.com/a-Halawany/elven/actions/runs/35067820527), [C19 anchor 35067913755](https://github.com/a-Halawany/elven/actions/runs/35067913755). Inspected job steps show actual C17 packaging/verification/upload, successful cross-host finalization, and successful anchor verification/publication. Codex did not independently download and verify the archive itself.

## B13-F1 closure

The actual B14 TypeScript now checks an explicit receipt delivery ID before accepting its digests. A receipt naming another delivery returns `delivered`, preserving the answer. Migration 0074's `record_export_delivery` refuses `acknowledged` or `mismatched` for that conflicting ID and records the receipt-binding explanation.

Independent execution used the actual B14 delivery service and pinned HTTPS transport, with a real local TLS socket and the unmodified B15 synthetic recipient/verifier:

- Correct signed package and receipt: **acknowledged**, TLS verified.
- Next delivery answered with the previous delivery's ID: **delivered**, previous ID retained.
- Wrong archive digest for the current delivery: **mismatched**.
- Production address-vetting path to localhost: refused as **address_not_public**.
- Same self-signed recipient without its declared anchor: failed.
- Direct revocation-notice executor: acknowledged; recipient's stored copy removed.

The hosted B14 H2 test also exercises the route and database recording port, including normal/stale responses and the SQL refusal. Codex inspected that test and the passing hosted run. It did not execute PostgreSQL locally.

Sources: [delivery service](https://github.com/a-Halawany/elven/blob/3b7c44c8aa21b1143d5997fdb4e386026841f8bf/apps/api/src/retention/export-delivery.service.ts), [migration 0074](https://github.com/a-Halawany/elven/blob/3b7c44c8aa21b1143d5997fdb4e386026841f8bf/apps/api/migrations/0074_b14_https_exchange_receipt_binding_revocation_notice.sql), [B14 harness](https://github.com/a-Halawany/elven/blob/3b7c44c8aa21b1143d5997fdb4e386026841f8bf/apps/api/test/int/phase6-retention-b14.test.ts).

## B14-F1 — revocation excludes a recipient that holds bytes but returned a mismatched receipt

**Disposition:** confirmed source/transport defect; include in B16's exchange lifecycle. No full database-path reproduction is claimed.

Migration 0074's `retention.export_recipients` selects only:

```sql
WHERE d.action_id = p_action_id
  AND d.state IN ('delivered', 'acknowledged')
```

Both the revoke act's recipient list and `begin_revocation_notice` use this function.

The actual synthetic HTTPS recipient stores and verifies the archive before returning its controllable wrong-digest/denial receipt. Independent execution sent a valid 6,144-byte signed tar to a distinct mismatch-only destination path, attempt 1. The recipient retained the complete archive with the correct actual SHA-256; the product's actual delivery service classified the returned receipt as **mismatched**.

For a destination whose only delivery has that state, the inspected selector returns no recipient. The explicit notice port uses the same gate, so the operator cannot simply notify that destination through it either. A direct executor notice was used as a control and successfully destroyed the stored copy; the problem is selection/gating, not the basic notice transport.

**Focused correction:** preserve the distinction between byte delivery and receipt acceptance. A destination known to have received the package remains eligible for revocation even when its receipt mismatches or denies acceptance. Keep the mismatch and received evidence intact. Add a real route/database control for a destination with exactly one such delivery, and keep a pre-egress refusal control showing that an endpoint which received nothing is not incorrectly treated as a confirmed recipient.

This finding does not establish every uncertain-transport outcome; avoid claiming that the mismatch-only reproduction covers all network failure windows.

## B15 — independently demonstrated streaming behavior

Actual candidate TypeScript was executed with explicit database/capability query doubles, a real isolated vault, file streams, actual Ed25519 signing, the unmodified standalone verifier and a real local TLS recipient. The address-vetting substitution was the same narrow one as B14.

Observed:

| Control | Result |
|---|---|
| Payload | 17 files × 16,000,000 bytes = **272,000,000 bytes**, above 256 MiB |
| Produced tar | **272,053,248 bytes** in this fixture |
| Stream rebuild and download service | Digest matched; download-record callback invoked once |
| Existing in-memory download | Refused with the ceiling named |
| Unmodified offline verifier | Successful; Ed25519 signature verified |
| Streamed station delivery | Delivered; on-disk tar verified |
| Streamed HTTPS delivery | Acknowledged by the actual recipient over verified TLS |

These are service/executor tests, not an independently run Nest HTTP route or database transaction. Hosted tests and author demonstration logs cover their broader paths.

The implementation streams bulk payload bytes. **“Heap stayed under 256 MiB throughout” is not established by the submitted harness:** it checks the difference between before/after `heapUsed` readings, with optional GC, rather than peak heap, external Buffer memory or RSS. The verifier also retains/parses manifest and links metadata. Correct that wording to the actual evidence; do not add a performance campaign before feature delivery.

The new raw stream/CLI path supports larger packages, with a declared 64 GiB stream ceiling. The existing JSON/page download path retains its 256 MiB ceiling. No independent signed-in browser walk or peak-memory measurement was performed.

## B15-F1 — graph closure omits an exact historical claim version referenced by an exported edge

**Disposition:** independently reproduced in actual TypeScript plus the unmodified verifier, using explicit query doubles. Include in B16 before treating exact-version import/round-trip as functioning.

Source: [retention.service.ts, linksOf](https://github.com/a-Halawany/elven/blob/33882a31a0aaf5bee5d83e8e6b2cd425e0d19943/apps/api/src/retention/retention.service.ts), [verify-export.mjs](https://github.com/a-Halawany/elven/blob/33882a31a0aaf5bee5d83e8e6b2cd425e0d19943/scripts/retention/verify-export.mjs).

`linksOf` groups lineage by claim ID and fetches only its latest canonical version with `orderBy(object_version, desc).limit(1)`. Exported edges retain their recorded `claim.object_version`, including historical/retracted edges. The verifier checks membership by claim ID alone.

Reproduction:

1. One evidence object; relationship claim C@1; an edge referencing C@1; both endpoint entities.
2. Control with only C@1: the claim and edge's version reference agree.
3. Add canonical C@2 and its lineage; retain the historical edge referencing C@1.
4. The actual export closure contains **C@2 only**, with **zero exclusions**, while the edge still references **C@1**.
5. Bind that actual links.json inside a valid signed export and run the unmodified verifier.
6. The verifier exits **0**, verifies the signature and reports **“the closure is consistent”** despite the missing referenced version.

The signature correctly protects the bytes that were exported. It does not make the omitted version available for a faithful import.

**Focused correction:** export each exact claim version referenced by included edges/lineage, preserving recorded identity and temporal relationships. If policy excludes a required version, record that exclusion and handle its dependent edge explicitly. Validate references by the pair **(object_id, object_version)**; never reinterpret an edge referencing C@1 as an edge based on C@2. Demonstrate a versioned/corrected relationship through the new governed import and re-export path.

The inspected DP-47-003 requirement explicitly includes temporal truth, corrections and graph links. AU-COM-0058's new local-verification status and DP-47-003's “implemented” wording must not imply this counterexample has passed. Preserve the B15 positive evidence, record the exact missing clause, and bind any later whole-unit claim to the corrected versioned fixture. Make the record adjustment in the implementation batch, not as a separate gate cycle.

## Hosted evidence and demonstration scope

Inspected actual build logs:

| Gate | B14 code | B15 code |
|---|---:|---:|
| API unit / meta | 2,156 / 9 | 2,156 / 9 |
| Acceptance | 58 | 58 |
| Integration | 1,021 in 64 files; B14 5/5 | 1,024 in 65 files; B15 3/3 |
| Upgrade | 74 files; +53 ledger rows above 0021 | 75 files; +54 ledger rows above 0021; upgraded/virgin schema digests match |
| C18 | 612 + 44 | 612 + 44 |
| Supply-chain / browser-regression / C19 | Successful | Successful |

Build jobs: [B14 104710045011](https://github.com/a-Halawany/elven/actions/runs/35070312503/job/104710045011), [B15 104723078501](https://github.com/a-Halawany/elven/actions/runs/35074350184/job/104723078501). CI used GitHub synthetic merge checkouts: B14 `de491d5`; B15 `d486df5` merging 33882a3 into 20d0b0f. PR C17 archive packaging/upload remained skipped under the PR condition; the main push chain is separate.

The NORDWERK acts are **author evidence**, inspected here:

- [B14 act](https://github.com/a-Halawany/elven/blob/3b7c44c8aa21b1143d5997fdb4e386026841f8bf/evidence/cp6/act-b14.txt): recorded anchor; HTTPS attempt refused at DNS resolution; successful station delivery, receipt, revocation notice, removal and acknowledgement/refusal effects.
- [B15 act](https://github.com/a-Halawany/elven/blob/33882a31a0aaf5bee5d83e8e6b2cd425e0d19943/evidence/cp6/act-b15.txt): four NORDWERK evidence records, 14 claims, seven edges, seven entities; a 95,232-byte signed tar streamed through real HTTP and delivered to the station. This is a small integrated demo package; the 272 MB proof is a separate synthetic fixture.

The act's claim that graph closure is consistent is limited by B15-F1. The author accurately distinguishes the production-vetting refusal from the local TLS harness proof.

Applied-migration log prefixes match inspected source digests:
- 0074: `d52c8761c78de990fc19ce9f3b7f9586fa0782a85fd350d84cc2a27aae16766a`.
- 0075: `b6e0b64a13848a24b1b7598a4be3515baa47bc711d45cbb9e222b5738c32dcef`.

Preserve applied migrations; use additive changes where needed.

Codex independently ran actual TypeScript business logic with import/decorator wrappers removed, isolated files/streams, actual signing/verifier scripts and local TLS. Database, capability and recording boundaries were explicit doubles. Codex did **not** run PostgreSQL server, Redis, the full integration suite, browsers, Docker, Trivy, eye_demo or a public-network recipient. No GitHub, workflow, repository-account, deployment or live-demo mutation was performed.

Scratch probes: `review-b1415/load.cjs`, `probe-b14.cjs`, `probe-b15.cjs`; results `result-b14.json`, `result-b15.json`. The reproduction steps and observed results above are sufficient to recreate the focused controls in the repository's normal harness.

## Next implementation and constraints

B16 should implement the import direction as a governed product workflow under the existing specification: accept and validate the package, apply its declared identity/version/relationship and policy semantics, expose its result and evidence, and demonstrate actual imported effects and a round trip in an isolated NORDWERK destination. Reading links.json or printing PACKAGE OK alone does not deliver import.

Include the two bounded fixes above in that feature batch. Then continue the remaining interface semantics, source-derived memory, index-tier degradation and other missing capabilities in the delivery register. Functional page completion/walks belong to feature delivery; comprehensive profile and hardening verification follows implementation.

Public-network HTTPS remains an explicit activation/demonstration task. Local TLS is valid bounded functional evidence, with the vetting substitution stated. Do not weaken production egress or use another company's Railway workspace. Production key/customer endpoint and Comtrade secure credential binding remain owner-dependent steps; continue all unrelated features.

Preserve budgets/cadences and source permissions, backups and historical evidence, live demonstration services, closed reviews, the approved temporary GHCR route and completed monitors.

## Ready-to-send continuation

Continue THE EYE from B14 #51 (code 3b7c44c, records 20d0b0f) and B15 #52 (33882a3). Use the attached bounded review.

I authorize merging #51, then retargeting and merging #52 after its final head passes the existing required checks. Preserve branches and complete each normal C17/C19 main archive chain. Bind B15's now-green hosted run once; no records-refresh loop or additional review hold.

Codex closed B13-F1. Its review confirms real local TLS exchange and streamed signed delivery above 256 MiB. Keep the distinction between isolated TLS proof and public-network activation.

Proceed with B16: deliver governed import and an actual NORDWERK export → import → re-export demonstration under the existing specifications. Include:
1. B14-F1: revocation must reach a destination known to hold the package even when its only receipt is mismatched. Preserve the receipt evidence.
2. B15-F1: include and validate the exact claim versions referenced by exported edges. A C@1 edge must not be treated as based on C@2; prove the corrected case through import.

Correct the affected register claims and the peak-memory wording in that same batch, preserving prior evidence. Then continue the remaining features in the delivery register.

Our priority remains the complete product across all eleven volumes and the integrated demo. Use focused functional checks and existing required gates. Comprehensive hardening comes after implementation; do not launch another broad review campaign or stop at a validator-only import.

Do not wait for production/Comtrade credentials to implement unrelated features, weaken egress, or deploy into another company's workspace. Preserve all standing operational constraints. Report functioning, partial, missing and acceptance work separately.

