**THE EYE — B16/B17 bounded review and next delivery**

Independent review dated 2026-09-16. Candidates: B16 `f4b2345e324c13ae13488c8eb73d7560becb1f4a`, B17 `2d923859efc330b777cb44316c998a805d450e65`. Records: `1d6eea390f1cb1b3750b855ea1da32d50aac34e3` and `e98907c04a3fbdbf30d10203e9b670a442a73529`.

**New capabilities implemented and functioning.** B16 adds governed package import, a partner/key and intake-contract check, sixteen recorded intake checks, approval/admission separation, new local identities with preserved origin provenance, and an export→import→re-export path. B17 adds import publication, revocation into an importing domain, withdrawn versions and graph changes, signed revocation notices and hold handling. Source, inspected hosted tests and author demonstration records support these bounded workflows. Independent local execution additionally confirms the exact-version closure, import intake/verification/planning, provenance helpers and notice signatures. The B14-F1 and B15-F1 findings close.

**Capabilities partially implemented.** Revocation recovery has one new defect, B17-F1 below: an interrupted attempt can leave bytes behind while the resumed attempt reports destruction complete. Cross-installation revocation uses a presented signed station notice; an inbound endpoint is absent. The impact walk is bounded at 32 seeds. Public HTTPS activation, production signing keys, Comtrade activation and functional page walks remain incomplete. External recipient obligations beyond copies controlled by this product remain only partially enforceable.

**Capabilities still missing.** Governed cross-domain references; replication/portability packages; package encryption beyond TLS; the remaining semantics of 24 partial interface contracts; source-derived memory; index-tier degradation behavior; and the outstanding deployment capabilities/legs. These remain required delivery work. Comprehensive hardening follows implementation.

**Acceptance work remaining.** I parsed the four acceptance-unit CSVs at the B17 records head: 3,904 rows with 3,904 unique IDs. Mandatory unfinished units remain **3,555 = 3,182 open + 339 verified locally + 34 verified in CI**. All `legs_verified` fields are empty. These are acceptance statuses, not an implementation-completion percentage. The interface register remains 26 bound / 24 partial / 0 unbound; a binding is not semantic acceptance. [B17 checkpoint and register pointers](https://github.com/a-Halawany/elven/blob/e98907c04a3fbdbf30d10203e9b670a442a73529/PHASE6_REPORT.md)

**Delivery recommendation**

Continue implementation. I recommend integrating #53, then retargeting and integrating #54 after the normal required checks, with B17-F1 explicitly carried as the first fix in the immediately following feature batch. This is integration of delivered work; it does not close B17-F1, grant deployment acceptance or establish complete revocation recovery. Do not introduce a separate broad audit or another finder/refuter/re-judge cycle.

The latest checkpoint explicitly reserves #53/#54 for the owner's word. The draft at the end supplies that authorization only if the owner sends it. Codex has not merged either PR or changed GitHub.

**Repository and hosted evidence checked**

| Item | Independently observed state |
|---|---|
| #51 | Merged at `47cca317bb9a17c62cc440045375df577ee4fb91` |
| #52 | Merged at `88057d24771923d40fc3c56821e3427eb5370a4c` |
| #53 | Open, mergeable, CLEAN; base main; head `1d6eea3` |
| #54 | Open, mergeable, CLEAN; base phase6-b16 at `1d6eea3`; head `e98907c` |

Sources: [#51](https://github.com/a-Halawany/elven/pull/51), [#52](https://github.com/a-Halawany/elven/pull/52), [#53](https://github.com/a-Halawany/elven/pull/53), [#54](https://github.com/a-Halawany/elven/pull/54). States describe this review's read, not a promise that heads cannot subsequently move.

| Merged PR | main CI | C19 lifecycle | C17 finalize | Completed C19 anchor |
|---|---|---|---|---|
| #51 | [35080668461](https://github.com/a-Halawany/elven/actions/runs/35080668461) | [35080668362](https://github.com/a-Halawany/elven/actions/runs/35080668362) | [35082250495](https://github.com/a-Halawany/elven/actions/runs/35082250495) | [35082335147](https://github.com/a-Halawany/elven/actions/runs/35082335147) |
| #52 | [35085514555](https://github.com/a-Halawany/elven/actions/runs/35085514555) | [35085514462](https://github.com/a-Halawany/elven/actions/runs/35085514462) | [35087366921](https://github.com/a-Halawany/elven/actions/runs/35087366921) | [35087461561](https://github.com/a-Halawany/elven/actions/runs/35087461561) |

These runs are successful. The main CI jobs actually executed the C17 package/verify/upload steps; the listed anchors include a successful publication job. I inspected workflow/job/step evidence, not the downloaded archive contents independently.

| Candidate | Code CI / C19 | Records CI / C19 |
|---|---|---|
| B16 | [35097020135](https://github.com/a-Halawany/elven/actions/runs/35097020135) / [35097020209](https://github.com/a-Halawany/elven/actions/runs/35097020209) | [35099348274](https://github.com/a-Halawany/elven/actions/runs/35099348274) / [35099348275](https://github.com/a-Halawany/elven/actions/runs/35099348275) |
| B17 | [35115226285](https://github.com/a-Halawany/elven/actions/runs/35115226285) / [35115226352](https://github.com/a-Halawany/elven/actions/runs/35115226352) | [35117669248](https://github.com/a-Halawany/elven/actions/runs/35117669248) / [35117669253](https://github.com/a-Halawany/elven/actions/runs/35117669253) |

All eight are successful on attempt 1. Both records commits contain only four documentation/evidence files; they do not change product code. No additional evidence-binding refresh is needed.

I inspected the code CI build-test logs, not just Claude's summaries:

| Evidence | B16 | B17 |
|---|---|---|
| Synthetic merge checkout | `195b4ba`, f4b2345 into 88057d2 | `7821f8e`, 2d92385 into 1d6eea3 |
| API units / meta | 2,184 / 9 | 2,210 / 9 |
| Acceptance suite | 58 | 58 |
| Full integration | 1,030 in 66 files | 1,035 in 67 files |
| New batch harness | B16: 6 | B17: 5; B16: 6 also passed |
| Upgrade | Through 0076; upgraded/virgin schema comparison passed | Through 0077; upgraded/virgin schema comparison passed |
| C18 | 612 plus the 44-case control suite passed | 612 plus the 44-case control suite passed |

Supply-chain, browser-regression and C19 jobs also passed. PR C17 archive packaging/upload were skipped under the PR condition, as expected; those PR runs do not prove post-merge archive production.

**Closed finding: B14-F1 — held recipients omitted from revocation**

Closed at B16 `f4b2345`, retained in B17.

Migration 0076's `retention.export_delivery_held` and `retention.export_recipients` include mismatched delivery receipts as confirmed recipients and failures after possible transmission as possible recipients. Known pre-egress refusals remain excluded. The revoke/notice paths use that recipient selection.

I inspected actual R1 assertions, which check the recipient set, acknowledged notices and retained delivery evidence: mismatched, HTTP 500 after transmission and redirect-after-body destinations are included; unbound credentials and DNS refusal are excluded; a failed notice is retried successfully. This is source plus inspected hosted execution, not an independently executed PostgreSQL/TLS test in this review.

Sources: [migration 0076](https://github.com/a-Halawany/elven/blob/f4b2345e324c13ae13488c8eb73d7560becb1f4a/apps/api/migrations/0076_b16_governed_import_versioned_closure_and_held_recipients.sql), [B16 R1 harness](https://github.com/a-Halawany/elven/blob/f4b2345e324c13ae13488c8eb73d7560becb1f4a/apps/api/test/int/phase6-retention-b16.test.ts).

**Closed finding: B15-F1 — an exported edge outlived its exact claim version in the package**

Closed at B16 `f4b2345`, retained in B17.

Independent execution of the actual `linksOf` implementation at both code heads produced the same result: C@1 and C@2 both travel in `links/2`, and the historical edge still names C@1. Restricting C@1 excludes its dependent edge while leaving admissible C@2.

I built real signed synthetic tar packages and ran the actual customer verifier. The valid package passed. Removing C@1 while retaining the edge and re-signing the otherwise coherent package caused both the customer verifier and actual B17 import intake to refuse it. The latter package's signature still verified: the refusal was the missing exact claim pair, not merely a bad signature.

The actual import intake ran all sixteen checks, created quarantine files in an isolated vault and planned C@1/C@2 under one new local object ID. An unknown partner was refused while retaining only the manifest. The imported-header/provenance helpers preserved the tested original times, classification and original identity inside `imported_from`. The database reads and record port were explicit doubles; database admission writes were not independently executed.

Sources: [closure implementation](https://github.com/a-Halawany/elven/blob/f4b2345e324c13ae13488c8eb73d7560becb1f4a/apps/api/src/retention/retention.service.ts), [import checks](https://github.com/a-Halawany/elven/blob/2d923859efc330b777cb44316c998a805d450e65/apps/api/src/retention/import-package.ts), [customer verifier](https://github.com/a-Halawany/elven/blob/f4b2345e324c13ae13488c8eb73d7560becb1f4a/scripts/retention/verify-export.mjs).

**New bounded finding: B17-F1 — resumed revocation can falsely report copies destroyed**

Status: independently reproduced; open. Candidate: `2d92385`. This affects the new feature's recovery behavior and belongs in the next implementation batch.

A record-revocation transaction can commit its tombstone, withdrawn version and item outcome before the finish transaction and filesystem removal occur. If execution stops there, the durable import remains `revoking`, but that record item is already marked `tombstoned`.

On the resumed request:

1. `revokeImport` starts a fresh tally with `locators: []`.
2. `isPendingRevocation` skips the already-settled tombstoned item.
3. The finish port accepts the durable settled item map and completes the import.
4. Physical removal uses only this attempt's empty locator tally.
5. The response and recorded receipt say `copies_destroyed: true`, although the earlier record's bytes still exist.

The graph-event reconstruction correctly reads durable outcomes; the physical cleanup does not. The separate branch for a request arriving when the import is already `revoked` reconstructs the locators and can remove those bytes, but it takes an additional request after the false-success response.

Independent result from the actual service and vault code:

```json
{
  "resumedRequest": {
    "kind": "revoked",
    "bytesStillExist": true,
    "copiesDestroyed": true,
    "removed": 0,
    "recordedReceipt": true,
    "event": "import.revoked"
  },
  "extraRequestAfterStateIsRevoked": {
    "kind": "retried",
    "bytesRemoved": 1,
    "bytesStillExist": false,
    "noDuplicateChangeEvent": true
  }
}
```

The fixture seeded the durable state corresponding to the interruption: one admitted record, `revoked_at` set, `revocation.outcome = tombstoned`, its valid locator recorded, import state `revoking`, and an actual file in an isolated evidence root. It executed the unmodified TypeScript business logic of `revokeImport`, its event/receipt construction, `retryRevocation`, `RetentionService.removeBytes` and `VaultService`. Pipeline/database ports and the impact walk were explicit doubles. I did not crash a PostgreSQL-backed process.

I also inspected migration 0077: `finish_import_revocation` decides completion from the durable item outcomes; `record_import_revocation_receipt` records `import.copies_destroyed` from the supplied boolean and calls the origin-answer function. This supports the production consequence, but those SQL functions were not independently executed in this probe.

**Bounded correction:** reconstruct required cleanup and the completion receipt from the durable revocation item map on the resumed path. Account for the established evidence/archive/staged-copy contract. Do not report destruction complete while required copies remain or cleanup is unverified; retain residual/refusal evidence for retry. Add one focused interruption test after a record batch commits and before finish/cleanup. The first resumed request must remove the earlier attempt's bytes or report incomplete cleanup; a subsequent redelivery must not add duplicate lifecycle effects. Preserve legal holds and scope. Use an additive migration only if a database change is necessary; do not edit applied 0076/0077.

Sources: [ImportService — initialization at 1059, pending filter at 1064, cleanup/receipt at 1138, retry at 1162, pending predicate at 1603](https://github.com/a-Halawany/elven/blob/2d923859efc330b777cb44316c998a805d450e65/apps/api/src/retention/import.service.ts), [migration 0077 finish and receipt functions](https://github.com/a-Halawany/elven/blob/2d923859efc330b777cb44316c998a805d450e65/apps/api/migrations/0077_b17_import_publication_and_revocation_propagation.sql).

Reproduction provenance: actual B17 `import.service.ts` SHA-256 `c801db6194f804374856a7b4af3659cf665820dff86bed3159b4ac68d48ae2f1`; actual B17 `retention.service.ts` SHA-256 `ba28fffba723aaaba99aa4fd2c6f177eef4d77c27fc238d1a48f6c9b37397203`. The isolated review scripts are `review-b1617/probe-revocation-resume.cjs` and `probe-closure-import.cjs`; their result files contain the full loaded-source hashes. These are review fixtures, not repository changes or product tests.

**Demonstration and functional scope**

The B16 act records the station-based NORDWERK round trip, original provenance recovery, a mismatch-only recipient receiving revocation, and the pre-egress production refusal. The B17 act records a mirror import's destruction/withdrawal/graph changes, an origin acknowledgement, a twin becoming unverified, and a new import under fresh identities. These are author-executed demonstration records, not demonstrations independently run by Codex. [B16 act](https://github.com/a-Halawany/elven/blob/f4b2345e324c13ae13488c8eb73d7560becb1f4a/evidence/cp6/act-b16.txt), [B17 act](https://github.com/a-Halawany/elven/blob/2d923859efc330b777cb44316c998a805d450e65/evidence/cp6/act-b17.txt).

Preserve these qualifications:

- In the displayed B17 revocation, six consumers received the event; retrieval and twins did non-empty work. The other displayed consumers had no items. The subsequent fresh admission displayed retrieval work. Do not count every delivery as a non-empty effect.
- “Revocation reaches every recipient” is too broad without its scope. Same-installation domain authority, pending/refused execution, legal holds, external custody, foreign station presentation and B17-F1 all matter.
- The known 32-seed impact bound and event-list truncation remain explicit partial coverage. The demonstrated company is not proof of arbitrary-size propagation. Carry the required continuation/completeness work in delivery, not an optional hardening label.
- Foreign-origin revocation is a signed station act today. A deployed public HTTPS recipient and a foreign installation's positive exchange were not independently demonstrated here.
- The real listener's inline-import body limit remains a stated constraint; the demonstration used the station path. The large import is supported by inspected hosted evidence. I did not repeat the 272 MB test in this review.
- The large-import memory claim is a 50 ms sample of heapUsed plus external memory above baseline, not RSS or a guaranteed continuous peak.
- New-page browser walks remain functional verification. Claude should perform available authenticated walks where its tooling and authorized access permit; identify only actual owner-only steps. Hosted browser regression does not automatically establish those new walks.

**Evidence boundaries and continuity**

This review was read-only against GitHub. Local execution used actual candidate TypeScript with import/decorator wrappers removed, real synthetic files, tar scanning, signing and the standalone verifier, with the declared doubles. It did not independently run a PostgreSQL server, Redis, a product HTTP server, browser walks, Docker, Trivy, the full integration suite or the live demonstration. Hosted evidence and author acts are labeled separately.

Earlier Phase 6 corrections, interrupted-attempt and accounting closures, publication/replay/fencing closures, B11/B12 closures and B13-F1 stay closed. B14-F1/B15-F1 close here. B17-F1 is a new bounded finding, not a reopening of the archive ownership work.

Preserve the eleven-volume scope, backups, historical evidence, applied migrations, demo services, approved GHCR route, source permissions, budgets/cadences and stopped monitors. Existing Comtrade authorization stands; secure key binding is an owner dependency, not a reason to repeat credential searches or pause unrelated implementation. Do not deploy into another company's workspace.

**Ready-to-send prompt**

Continue from the B16/B17 checkpoint and the attached Codex review. The priority remains the complete product across all eleven specification volumes and the integrated NORDWERK demonstration. Comprehensive hardening comes after feature implementation.

I authorize merging #53 at the reviewed records head 1d6eea3, then retargeting #54 at e98907c to main and merging it once the normal required checks pass. Run each normal C17/C19 main chain and preserve failed attempts. These merges integrate delivered work; they do not close remaining findings or accept deployment. Bind evidence once; do not start another records-refresh chain.

Codex closes B14-F1 and B15-F1. Preserve them and all earlier closures.

Include B17-F1 as the first correction in the next feature batch: a revocation interrupted after a record batch commits can resume, skip that settled record's cleanup, and report copies_destroyed while its file remains. Recover cleanup from durable outcomes and verify the first resumed request; retain explicit residuals if removal fails and preserve redelivery idempotency. Add the focused DB/filesystem interruption case described in the review and run the existing required gates. Do not start a separate broad adversarial or re-judge campaign.

Then continue the register's next functional batch: remaining interface semantics, source-derived memory and index-tier degradation. Keep governed cross-domain references, replication/portability, package encryption, complete propagation beyond the stated bounds and the remaining deployment capabilities in the mandatory delivery queue. Finish the functional UI flows and available signed-in walks as part of delivery. Do not replace these capabilities with documentation or move them into optional hardening.

Maintain the integrated NORDWERK demonstration with actual effects and preserved history. Distinguish delivered events from non-empty consumer work, same-installation exchange from foreign-installation operation, and author/hosted evidence from Codex's isolated probes.

Keep public-host/production-key decisions and secure Comtrade binding as named owner dependencies while continuing other work. Preserve budgets, source permissions, backups, applied migrations, demo services, GHCR and monitor decisions.

Report new functioning capabilities, partial capabilities, missing capabilities and acceptance work remaining, with exact heads and evidence. No completion percentage and no new review hold beyond a concrete defect or required gate that prevents the batch functioning.
