# THE EYE — #46 closure and B10 bounded review

Independent review, 2026-09-13. Repository: a-Halawany/elven.

**B9-F1 is CLOSED at `48f7bdc3fb58dc67d991d65b24d188b2412db8f1`. PR #46 is eligible to merge under the existing conditional authorization. B10 does not hold it.** Claude should merge that candidate and complete its existing post-merge C17/C19 archive chain. Codex performed no GitHub mutation, merge, workflow dispatch, deployment, or live-system operation during this review.

**B10 has one merge blocker for #47: B10-F1, disclosure of role-restricted memory through a stored briefing.** Two further bounded defects affect briefing reproducibility and historical composition. Fix them together in the memory-to-briefing implementation work; they are not additional blockers for #46. B9-F2, B9-F3 and G2 close on B10's inspected implementation and evidence.

This continues the review at code `36ce748` / records `121f636`; it does not reopen completed phase, stack, B7 or B8 reviews. The eight preceding merges and their archived evidence remain closed. Full eleven-volume product delivery and the integrated synthetic-company demonstration remain required; comprehensive product/profile verification follows implementation.

## New capabilities, partial delivery, missing work, acceptance

| Category | Independently supported disposition |
|---|---|
| Newly functioning behavior | Historical memory responses no longer return unauthorized current-version content. A refused relationship assertion rolls back to a savepoint and leaves a durable unresolved item; re-drive and vocabulary repair reach a successor. Review cases govern graph derivation. Retention reviews of superseded, current and held evidence verify preservation without a DeletionVerified event. Memory withdrawal has its own action, current-read refusal, and historical retrieval. |
| Partially implemented capabilities | Briefing composition reads memory and records the composer's access, but has the three defects below. `/graph/memory` has a page and governed client calls; its signed-in browser walk is unverified. Broader retention, source-derived memory, interface behavior and previously recorded flow/profile coverage remain incomplete. |
| Still missing | Archive/customer-export executors and other registered retention capabilities; safe pause when deletion's referential scope cannot be established; communications/telemetry memory integration; the remaining workspace pages; authorized UN Comtrade/PortWatch activation acts; deployment/profile legs and the rest of the delivery register. Some listed areas have delivered clauses; they are not all wholly absent. |
| Acceptance work remaining | **3,555 unfinished mandatory units = 3,190 open + 338 verified:local + 27 verified:ci. No deployment leg accepted.** No acceptance unit was added, removed or moved between statuses in the reviewed delta. This carries forward the previously independently counted 3,904 unique units; it is not an implementation-completion percentage. |

## Exact candidates and hosted evidence

| Scope | Candidate | Evidence inspected |
|---|---|---|
| #46 → main | `48f7bdc3fb58dc67d991d65b24d188b2412db8f1` | [CI 34744726183](https://github.com/a-Halawany/elven/actions/runs/34744726183): 932 integration tests in 56 files; graph-subscriptions-4 28; API units 2,148 plus separate meta suite 9; acceptance 58; C18 612; upgrade proof. [C19 34744726187](https://github.com/a-Halawany/elven/actions/runs/34744726187): successful jobs and steps. |
| #47, base phase6-decisions | Code `0cee4390ac388f9ab307e40c35874410692af15d`; records `c04f6b1cad3c562edad94d9026ea8abe0c7cdf03` | [CI 34747248517](https://github.com/a-Halawany/elven/actions/runs/34747248517): 937 integration tests in 56 files; graph-subscriptions-4 32; executive-requests 10; API units 2,151 plus meta suite 9; acceptance 58; C18 612; upgrade through 0068. [C19 34747248530](https://github.com/a-Halawany/elven/actions/runs/34747248530): successful jobs and steps. |

At inspection, both PRs were open and mergeable. #46's base remained main `e0c50259a27d65918068007a857db81ddcfc8b37`. #47's base was exactly #46's candidate. The final B10 commit changes 15 documentation, accounting and evidence files; runtime code remains that of `0cee439`.

CI used synthetic merge checkouts: #46 build-test logged `8fa4189`, merging `48f7bdc` into main `e0c5025`; B10 logged `f3382a4`, merging `0cee439` into `48f7bdc`. These runs do not establish post-merge archives. C17 packaging/verification and archive upload were skipped by the PR condition in both supply-chain jobs. #46's push-to-main archive, finalize and anchor chain remains due after merge. No recursive records-refresh chain is requested.

## Closed findings

**B9-F1 — historical memory response disclosure: closed at `48f7bdc`.**

[MemoryService.retrieve](https://github.com/a-Halawany/elven/blob/48f7bdc3fb58dc67d991d65b24d188b2412db8f1/apps/api/src/graph/memory/memory.service.ts) now builds content from the served canonical version and returns an allowlisted availability object from the current projection. The controller records the served version. The original actual-TypeScript probe was adapted without changing the reviewed source: independent classification and audience restrictions both deny the unauthorized current read, permit the authorized current control, and return historical v1 without current statement, source reference or title anywhere in the serialized response. The access double receives v1.

The three added hosted harness cases use the real database and governed controller/pipeline. They establish v1, classification-restricted v2, and role-restricted v3; exercise refused/authorized controls; inspect the complete serialized historical response; and query the access ledger. They do not themselves issue HTTP. The separate inspected `closure-b9-f1.mjs` and its committed log supply author-reported real HTTP evidence, not Codex execution. This satisfies the frozen closure scope.

**B9-F2 — SQL refusal aborts the unresolved checkpoint: closed on B10.**

`GraphCore.withSavepoint` wraps the relationships subscriber's assertion. On a SQL refusal, rollback to the savepoint restores a usable transaction before the unresolved ledger write. Codex reran the actual capability, consumer, derivation and ledger TypeScript with an explicit transaction-state double: the healthy assertion succeeds; the refused assertion returns `derivation.blocked`, leaves the transaction usable, and permits the unresolved checkpoint.

The hosted real DB/queue case additionally checks durable unresolved/human-review state, pending reassessment, no successor, no duplicate cause on re-drive, and successful supersession after an approved additive vocabulary repair. This closes the original transaction-boundary finding; it is not a fresh multi-host ownership claim.

**G2 — approved review case ignored by the builder: closed.**

Migration 0068's `graph.assert_edge` and the shared derivation logic consult `intelligence.review_current`. Hosted harness coverage establishes approved queued-payload claims reaching the graph and rejected claims being refused; three unit cases also cover the corrected-case version being superseded. The existing B9 evidence is preserved.

**B9-F3 — review verification applies deletion criteria: closed.**

Migration 0068 checks an executed review for no tombstone, bytes present and a completed review execution. The controller emits no DeletionVerified for it. The scope fix selects current and held evidence for preservation, while the harness retains the current-evidence deletion refusal. Inspected hosted cases cover superseded, current and held reviews, vault presence, verification rows and absence of the deletion event. Codex did not execute this SQL independently.

## B10 findings: fixed scope for the next implementation pass

### B10-F1 — a briefing discloses memory outside its role audience

**Priority: high. Blocks #47; does not block #46.**

Source: [BriefingService](https://github.com/a-Halawany/elven/blob/0cee4390ac388f9ab307e40c35874410692af15d/apps/api/src/executive/briefings/briefing.service.ts), memory composition at lines 257–279 and stored retrieval at line 512; [ExecutiveController](https://github.com/a-Halawany/elven/blob/0cee4390ac388f9ab307e40c35874410692af15d/apps/api/src/executive/executive.controller.ts), compose/getBriefing.

Composition checks the composer's roles, copies the permitted memory statement and source into the briefing, and folds classification. It does not retain/enforce that memory version's role audience on a subsequent briefing read. `get` checks room membership, briefing purpose and classification, then returns the stored items. Its availability loop also ignores `memory:` sources. A same-domain reader can therefore receive content that direct memory retrieval refuses.

**Independent reproduction:** a human with `executive` and `knowledge_owner` composes a domain briefing from an internal memory item whose role audience is `knowledge_owner` and whose purposes include `briefing`. A different human holding only `executive` is refused the direct memory retrieval (403) but receives the restricted statement through the actual `getBriefing` controller and service. The authorized composer read and wrong-purpose refusal controls pass. The query/pipeline/framework boundary is doubled; this is not an independently executed PostgreSQL or HTTP reproduction. The inspected PDP permits the executive's briefing read, so this is not an impossible route-role combination.

**Bounded closure:** reproduce through the governed DB/HTTP path; preserve the cited memory version's audience restrictions when serving the derived briefing. The non-audience reader must receive none of the restricted statement/source through the complete briefing response. Keep authorized-reader, purpose and ordinary unrestricted-memory controls working. Keep the composer's access evidence and immutable snapshot contract. Do not redefine a role-restricted source as shareable merely because its purpose includes briefing. The fix may choose an appropriate restriction/refusal mechanism; no full new authority audit is requested.

### B10-F2 — per-read access IDs change deterministic content digests

**Priority: medium. Required implementation follow-up; not an additional merge gate.**

Source: the same briefing service, `recordMemoryAccess` and `details.access_id` at lines 274–279, followed by `contentDigest(content)` at lines 395–396. Migration 0068 creates a new UUID for each access.

**Independent reproduction:** compose twice with the same reader, memory version, `knownAt`, explicit null prior and otherwise unchanged input. The actual JCS/SHA-256 content digests differ. Removing only `items[].details.access_id` makes both item arrays identical; watermarks are identical. The empty-memory control produces equal digests. Both memory reads remain separately recorded.

**Bounded closure:** keep unique access records and their provenance outside the deterministic content, or otherwise bind them without introducing invocation-specific values into the content digest. Recomposition with the same inputs must have one content digest while retaining two distinct audited accesses. Include a changed-memory-version control that changes content when it belongs within the cutoff.

### B10-F3 — later supersession removes memory from an earlier-cutoff composition

**Priority: medium. Required implementation follow-up; not an additional merge gate.**

Source: briefing memory selection filters `memory.items_current` by `state = active` and current `recorded_at <= knownAt` before reading historical canonical versions. Migration 0066 `memory.record_item` advances that projection timestamp on supersession; 0067/0068 do not replace that behavior.

**Independent reproduction:** at a fixed cutoff, v1 contributes one memory item. Add v2 after the cutoff and update the projection as the port does. Recompose with the same cutoff and bound prior: memory count falls from one to zero, although direct historical memory retrieval still serves v1. The new version is outside the requested history but changes what the briefing contains.

**Bounded closure:** determine candidate existence and the served version from history at the requested cutoff; apply that version's content/audience rules under the reader's present authority. Separate present availability from historical content. The same cutoff must retain v1 after a later supersession, and a cutoff including v2 must use v2. Retain the existing withdrawal/history distinction. No broader temporal audit is requested.

The three findings are confined to B10's new memory contribution path. Correct them in one implementation pass where practical; the latter two remain required delivery work if carried forward. Preserve the closures above and the original phase criteria.

## Demonstration and reporting corrections

The inspected [B10 act](https://github.com/a-Halawany/elven/blob/c04f6b1cad3c562edad94d9026ea8abe0c7cdf03/evidence/cp6/act-b10.txt) names `0cee439` and records four meaningful HTTP scenes: memory routes and withdrawal, one admitted memory item in an agent-produced briefing, durable refusal followed by relationship repair, and preserved current evidence verified as a review. Its migration digest prefix matches independently hashed committed 0068 bytes: `9c324c9a0b2d2fdf`. Backups, restored-copy rehearsals, service restart and live effects are author evidence; Codex did not inspect the live database or execute the act.

The demo excludes a knowledge-owner-only item from a briefing-agent composition. That is useful composition evidence, but it does not test a subsequent reader outside the audience of a memory item the composer was allowed to include. The demo's G2 builder run asserts zero new edges, so the positive approval-to-graph proof comes from the hosted harness, not that scene.

Two records corrections belong in the next normal records update, without a refresh loop:

1. PHASE6_REPORT §23.4 says AU-MEM-0059 and AU-MEM-0061 were and remain `verified:ci`. The actual CSV rows are **open before and after**. AU-DP-0176 and AU-MEM-0065 are `verified:ci`; that status records evidence and does not erase remaining clauses. Keep the previously owed decided-reassessment guard coverage visible until actually evidenced.
2. The claim about remaining “unbound” interfaces is stale for the 50-row register: the independently checked B9 count remains **26 bound / 24 partial / 0 unbound**; B10 changes none of its bindings. State the remaining capabilities/partial contracts, without inventing new unbound rows or treating “bound” as full semantic acceptance.

## Evidence scope and next delivery action

Codex executed three local probe programs against downloaded, blob-verified candidate TypeScript and selected unchanged helpers. Dependency doubles are explicit in the programs. The briefing probe uses actual control folding, clearance, canonical-header digest, JCS and SHA-256 helpers; JSON transport bridges VM realms, and header schema validation is doubled. It does not model or claim complete database authorization enforcement. Actual hosted CI logs and test source supply the separate real-database/queue evidence.

Codex did **not** independently run PostgreSQL server, PGlite, Redis, HTTP, browsers, Docker, Trivy, the full integration suite, or any live demonstration service in this review. No production/profile leg is accepted. The evidence ZIP contains reproducible programs, results, selected source, hash manifests and compact hosted/accounting records; it contains no credentials.

**Next:** merge #46 at the cleared candidate under the existing authorization and complete its established archive chain; retarget #47 to main and handle its B10 audience defect separately. Return one corrected #47 candidate with focused evidence and existing required checks; the next independent closure is limited to the changed behavior. Keep implementation moving on retention executors/safe scope, authorized source activation acts, and the missing pages. Preserve GHCR monitoring, source permissions and budgets, backups, demo services and completed monitors. No new purchase, cadence/budget change or production deployment is authorized by this review.
