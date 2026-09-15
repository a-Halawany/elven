# THE EYE — #47 closure and B11 bounded review

Independent review, 2026-09-14. Repository: `a-Halawany/elven`.

**Disposition: #46 and its archive chain are complete. B10-F1/F2/F3/F4 close at `1fa3b08`, with records at `8463174`; #47 can proceed under the existing conditional merge authorization. B11 has two bounded findings at `1e3e4be`, records `44b01bb`. B11-F1 blocks #48 because overlapping archive actions can lose committed evidence bytes. Fix B11-F2 alongside it. Neither finding holds #47.**

This continues the previous `48f7bdc`/B10 review. Earlier closures and frozen criteria remain closed. This was a review of the correction and implementation delta, not another product audit. Codex made no GitHub changes, contacted nobody, dispatched no workflows, and touched no demonstration or live services.

## Progress by capability

| Category | Independently checked position |
|---|---|
| New capabilities implemented and functioning | B10 briefing audience enforcement, stable content digests with separate access records, and historical memory selection pass focused local probes and inspected hosted tests. B11 implements credential references, archive and export execution, deletion scope checks, and a separate retention withdrawal act; inspected hosted tests and author demonstration logs show successful paths. Five additional page workflows exist in source and the web build passed. |
| Partially implemented | Archive execution has the B11-F1 concurrency defect and still lacks restore-to-hot, tier management and the archive sweeper walk. Export integrity verification has B11-F2; external delivery, package HTTP download and a key signature remain unfinished. Comtrade is registered/approved but not activated. The six page walks and the forecast-less scenario fold remain outstanding. |
| Capabilities still missing | Remaining semantics of the 24 partial interface contracts, source-derived memory records, index-tier degradation, and all deployment legs remain in the delivery register. There are **26 bound / 24 partial / 0 unbound** interfaces; binding does not establish semantic acceptance. |
| Acceptance work remaining | Merge #47 and verify its normal push/archive chain; correct B11-F1/F2 within #48, then obtain bounded closure and its required gates; finish the outstanding implementation and demonstrations. Comprehensive product/profile acceptance remains after implementation. |

The recorded acceptance backlog is **3,555 mandatory units unfinished = 3,188 open + 338 verified locally + 29 verified in CI**. This is not an implementation percentage. The checked delta preserves the 3,904 unique-unit baseline, adds/removes no units, and moves AU-MEM-0059 and AU-MEM-0061 from open to CI evidence status through B11. AU-MEM-0060 changes only explanatory evidence. Statements and conditions remain unchanged. The new findings must be attached to the affected units without erasing historical green evidence; these recorded totals do not mean the defective behavior is accepted. No deployment leg is accepted.

## Exact heads and hosted evidence

| Item | Exact reviewed head | Result |
|---|---|---|
| #46 approved code | `48f7bdc3fb58dc67d991d65b24d188b2412db8f1` | Merged into main as `a6c9b910cf85e9a7979f736571b5d28c42daf56a`; this code head is the merge's second parent. |
| #47 B10 correction code | `1fa3b081b44899b4de34da0d2ef1fdeb585e30d4` | CI and C19 green. |
| #47 records/head | `846317451cc7697d0ea2195e946ad5bb55bf9d2e` | Open, base main. Difference from tested code is records only. |
| #48 B11 code | `1e3e4be0ea99f905f379a4fe007ed44c42ac5837` | CI and C19 green; bounded findings below. |
| #48 records/head | `44b01bb06b456312f06d16ed44a8eb54aae14bfe` | Open, base phase6-b10 at 8463174. Difference from tested code is records only. |

**#46 is no longer waiting for review or merge.** GitHub records its merge on 2026-09-13 at 09:43:15Z. Its first parent is the previously checked main head `e0c50259a27d65918068007a857db81ddcfc8b37`. The eight older integration steps were not re-audited.

The [main push CI](https://github.com/a-Halawany/elven/actions/runs/34750092541), [C19 lifecycle](https://github.com/a-Halawany/elven/actions/runs/34750092578), [C17 finalize](https://github.com/a-Halawany/elven/actions/runs/34750840687), and [C19 anchor](https://github.com/a-Halawany/elven/actions/runs/34750888559) all succeed on `a6c9b91`. Inspected steps/logs show C17 packaging, verification and upload actually ran. Artifact `10314888914` is `c17-evidence-archive-a1-d982e59b7e2080a896e6f5a5f8cefc1e9d060eddbc59a6471a49acf47ef30c5f`, 2,429,571 bytes. The cross-host finalizer downloaded that artifact and passed verification; the anchor passed signing and foreign-checkout offline verification. Codex inspected those hosted results, rather than independently downloading and verifying the archive.

[B10 CI 34752156335](https://github.com/a-Halawany/elven/actions/runs/34752156335) passed: API units 2,151; acceptance 58; integration **943/943 in 57 files**, including `phase6-briefing-memory` **6/6**; C18 **612/612**; upgrade proofs 297/297 and 275/275. [B10 C19](https://github.com/a-Halawany/elven/actions/runs/34752156341) passed. The PR CI checkout was GitHub's synthetic merge `4e9506f`.

[B11 CI 34869384873](https://github.com/a-Halawany/elven/actions/runs/34869384873) passed: API units 2,156; acceptance 58; integration **985/985 in 60 files**, including retention **35/35**, archive-poll **4/4**, credentials **3/3**, and the preserved B10 closure **6/6**; C18 **612/612**; upgrade proofs through 0070 and the supply-chain/C15 job. [B11 C19](https://github.com/a-Halawany/elven/actions/runs/34869384887) passed. Its synthetic merge checkout was `da983cd`. The existing browser-regression workflow passed; this does not establish the new pages' signed-in acceptance walks.

C17 archive packaging/upload remains skipped under the **PR** condition for #47/#48, as expected. Their post-merge push chains are separate work. Records-only commits do not require an endless refresh-and-bind chain. The earlier unsuccessful B11 attempt remains recorded; it is not the candidate to which this review binds.

## #47 bounded closure — B10-F1/F2/F3/F4

| Finding | Verification and disposition |
|---|---|
| B10-F1: a briefing leaked a restricted memory version to another reader | **Closed.** `BriefingService.get` checks the cited MEM version's audience and classification against the current reader, withholds content, and withholds a narrative citing a withheld item. Actual TypeScript probe: direct MEM access denied; restricted statement/source absent from the whole briefing response; authorized composer and unrestricted-memory controls served; wrong purpose denied; stored snapshot unchanged. |
| B10-F2: an access UUID changed the content digest | **Closed.** Access IDs live outside content in the composition result and the briefing row's `memory_accesses` (0069 §1). Identical inputs produced identical actual SHA-256/JCS content digests while recording distinct accesses. Two compositions sharing a correlation ID still reported only their own accesses. Hosted tests also cover the changed-version control. |
| B10-F3: a later supersession removed an item from earlier-cutoff composition | **Closed.** Selection starts from canonical history at the cutoff, chooses one version per item, and accounts for withdrawal timing. Actual probe retained v1 and its digest after v2, selected v2 at the later cutoff, retained pre-withdrawal history, excluded the withdrawn item at a later cutoff, and reported present availability separately. |
| B10-F4: generic and typed routes bypassed MEM/BRF ports | **Closed by source and hosted-test inspection.** Generic get/as-of/history/list withhold MEM/BRF payloads. Claim/evidence detail routes constrain their object types. Migration 0069 §2 rejects MEM/BRF admission through generic create/correct actions. The hosted harness exercises generic/typed read bypasses, generic correction refusals, and an ordinary EVD control. |

The local closure probe executes the candidate's actual service/controller and clearance/digest helpers with explicit query, transaction, framework and header-validation doubles. It does not run a database server or HTTP. The before/after HTTP demonstration in `evidence/cp6/closure-b10.txt` remains author evidence.

**Merge disposition:** #47 can merge at records head `8463174` under the carried conditional authorization, using the tested code `1fa3b08` plus the inspected records delta, subject to the existing required gates. Do not wait for #48, Comtrade, page walks or whole-product completion. Codex has not performed the merge.

## B11-F1 — overlapping archive actions can delete committed bytes

**Severity: high. #48 merge blocker.** New archive implementation at `1e3e4be`.

Sources: [RetentionService](https://github.com/a-Halawany/elven/blob/1e3e4be/apps/api/src/retention/retention.service.ts), [VaultService](https://github.com/a-Halawany/elven/blob/1e3e4be/apps/api/src/observation/vault/vault.service.ts), and [migration 0070](https://github.com/a-Halawany/elven/blob/1e3e4be/apps/api/migrations/0070_b11_credential_path_retention_executors_and_safe_scope.sql), especially `begin_execution` and `archive_blob`.

Two approved actions overlap on manifest P. Action A also includes another manifest Q whose bytes cannot be copied.

1. A copies P from hot to archive. `copyBlob` returns `created: true`; A adds the locator to `copiesMade`. Pause A before recording the tier move.
2. B finds that identical archive copy and receives `created: false`. B records its archive move, commits, and removes P's hot copy. P is now served successfully from archive under B's committed record.
3. A resumes. The archive port sees P already archived and returns false. A then fails copying Q.
4. A rolls back and invokes its cleanup, which deletes every archive locator it originally created. It deletes P even though B has adopted it and committed.

**Observed result:** B remains committed, hot P is absent, archive P is absent, and retrieval fails with `missing`. In the serial control, A fails and cleans up before B starts; B's subsequent archive remains retrievable.

Codex reproduced this using **actual RetentionService and VaultService TypeScript with real isolated filesystem operations**, including copy/fsync/read/removal. Database/transaction ports are explicit doubles reflecting the inspected action-local locking and manifest-tier behavior. The SQL locks each action row, not the shared manifest across copy/adoption/cleanup; `archive_blob` does not supply that serialization. The ordinary write pipeline invokes the business handler before closing policy/audit evidence. **This is not an independently executed PostgreSQL concurrency reproduction.**

The hosted A9 control protects a copy that was already present before the failing execution began. It does not cover a copy created by A and adopted by B while A is still in progress. Its existing successful evidence remains valid for that control.

**Frozen closure:** reproduce this interleaving through the governed PostgreSQL path in an isolated database and isolated vault; preserve the successful serial and already-committed-copy controls. Make copy ownership/adoption and cleanup safe across overlapping actions, so rollback cannot remove bytes another committed action needs. Scope any locking or ownership mechanism through the relevant filesystem cleanup boundary; a transaction lock that expires before cleanup alone is insufficient. After A fails, B's committed evidence must still retrieve and verify. Retain the failure record and retry behavior. Add a forward migration if database changes are needed; 0070 has already been applied and must not be rewritten.

## B11-F2 — the standalone export verifier succeeds without a package

**Severity: medium. Include in the same B11 correction batch.**

Source: [scripts/retention/verify-export.mjs](https://github.com/a-Halawany/elven/blob/1e3e4be/scripts/retention/verify-export.mjs).

With `manifest.json` containing `null` or `[]`, the unmodified verifier records only a successful JSON-parse check and skips the entire package-validation branch. It exits **0**. With `--json` it reports **`ok: true`, `failed: 0`, `summary: null`**, including when `--expect-package-digest` is supplied. In text mode its wording and exit status disagree: it prints `PACKAGE FAILED: 0 check(s)` but still exits successfully.

Codex ran the actual standalone script against isolated synthetic directories. A one-object control with a 43-field header and matching actual contracts/package digests passed all checks, including the expected-digest check. A tampered-format control correctly failed with a nonzero exit. The null and array manifests incorrectly succeeded.

**Frozen closure:** reject a non-object manifest and an incomplete package without a completed validation result; return nonzero with `ok: false`, and make text/JSON/exit outcomes agree. The supplied expected digest must not be silently skipped on a successful result. Preserve the valid-package and tamper controls. This is a bounded validation correction, not a demand to redesign signing or build a new exporter.

## B11 delivery and continuity details

**Credential path:** source and the three hosted integration cases support the reference/value separation, missing-binding cancellation before egress, reference-only readiness, SRC@v3 validation and REST credential carriage. The named credential header travels separately from ordinary headers; the HTTP client applies its existing origin-change stripping logic to it. Codex did not make credentialed requests or independently establish live Comtrade availability. The hosted credential tests use an explicit egress double.

**Comtrade:** the author act shows live contract v1 registered, approved and rights recorded, then stopped before activation because the running deployment did not bind `EYE_SRC_COMTRADE_KEY`. This is a missing runtime binding, **not a missing user authorization**. Existing UN keys and PortWatch remain authorized within the previously agreed source permissions, budgets and cadences. If the existing authorized key is available locally, Claude can locate and bind it securely without printing it; do not ask the owner to paste it into chat. A changed environment file alone does not change the running API's process environment: readiness must show the binding in the intended `eye_demo` process before the activation act. If the key is genuinely unavailable there, state the exact local binding step still needed and continue other implementation. Do not recreate already-live PortWatch sources.

**Retention and demonstration:** inspected source/tests cover archive retrieval and repeated live polls against archived evidence; approved export construction and revocation; version/digest-aware deletion dependencies and a recheck at execution; separate withdrawal authority. `act-b11.txt` is author evidence: archive of 3,934-byte sanctions evidence remained served; a two-object, 1,285-byte export passed the author's verifier and was revoked; a deletion paused for a live review case, then proceeded after that case was decided. The export is a digest chain bound to a recorded approval. It is **not a key signature**, and the remaining key-signature requirement stays open.

**Demonstration process incident:** PHASE6_REPORT §24.3 records that `scripts/demo.sh` ran outside Claude's session on September 13, selected default database `eye`, and replaced the API serving `eye_demo`; Claude reports restoring `eye_demo` on September 14. Codex verified the committed account, not that host's process state. Carry this forward in the operator runbook: future demonstration restarts must explicitly select `eye_demo` and its intended vault roots and verify the running target. Do not use the Phase 0 bootstrap script as an interchangeable restart. Preserve backups and existing evidence; do not repeat the incident to investigate it.

**Page work:** source wiring exists for retention, ontology, contradictions, scenario review and executive requests. `/graph/memory` remains the sixth page awaiting its signed-in walk. A green build and old browser regression tests do not close these page walks. Schedule them without holding the completed #47 correction.

## Evidence scope and next handoff

Codex independently inspected repository source, commit/PR metadata, job steps and selected hosted logs, and executed the three supplied probe scripts. The archive probe additionally performed real filesystem operations only inside newly created synthetic scratch fixtures. Codex did **not** independently run PostgreSQL server, Redis, an HTTP server/client demonstration, browsers, Docker, Trivy, the full integration suite or a deployment. Author demonstrations and hosted tests are identified separately throughout.

Preserve the original Phase 6 correction closure at `2e83945`, B1/B4, B7 retrieval/order/replay closures, B8 serving closures, B9-F1/F2/F3 and G2, and now B10-F1/F2/F3/F4. Preserve GHCR's approved temporary route and existing gates. No purchases, cadence/budget changes, completed-monitor rearming or broader audit is requested.

The next action for Claude is concrete: merge eligible #47 under the existing authorization and complete its archive chain; retarget #48 to main; fix B11-F1/F2 together and return one code checkpoint with focused evidence and existing gates. Continue missing capabilities from the delivery register alongside that bounded work. Keep a short restart record naming the exact heads, dispositions, outstanding findings and demonstration target. Do not manufacture another records-only refresh chain.

Companion evidence: `The_Eye_1fa3b08_B11_Probe_Evidence.zip`, containing exact downloaded source fixtures, source hashes, independent probes/results, accounting delta, and inspected hosted-evidence excerpts. It is a review fixture, not a runnable product checkout.
