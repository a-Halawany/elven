# THE EYE — B9 bounded review and merge disposition

Reviewed 2026-09-13. Baseline: code `661c2fb2b856d21e631be4b58a50f842a639d079`, records `39322071a008f2718f14d546c73a3efc5219018e`. Candidate: code `36ce74850723a0cf8be6074483c68e31509ac404`, records `121f636bc231c590563b5963de90f322557dd8e7`. PR #46 targets `main`, whose checked head is `e0c50259a27d65918068007a857db81ddcfc8b37`.

**Disposition:** the eight earlier merges are verified; both B8 findings are closed. B9 delivers substantial new behavior. **B9-F1, a memory response that discloses an unauthorized current version through an authorized historical read, blocks this #46 candidate.** B9-F2 and B9-F3 are bounded functional defects assigned to the next relevant implementation batch, not a blanket merge hold. Existing conditional merge authorization remains in force: after B9-F1 receives focused closure, the exact resulting candidate passes bounded review and existing gates, #46 can merge without another general permission request. Complete the normal post-merge C17/C19 evidence chain.

This review does not restart Phase 0, the original Phase 6 correction closure at `2e83945`, B1 interrupted recovery, B4 accounting, B7 retrieval retry, or either B7 event-delivery closure. It does not certify completion of all eleven volumes or any deployment leg.

## Delivery progress

| Category | Checked position |
|---|---|
| New capabilities implemented and functioning in inspected hosted cases | Serving ownership across delivery transactions and takeover; automatic relationship re-derivation on the exercised paths; memory record/retrieve/supersede and impact inclusion; governed evidence deletion and replay-floor moves; contradiction admission/challenge/adjudication; method evaluations that block unfit methods; ontology proposals/decisions; scenario review/retirement; seven typed executive requests. The legacy-warning update and new refusal mappings are present and tested. |
| Partially implemented | Historical memory response authorization (F1); relationship port-refusal recovery (F2); retention review verification (F3); the 24 partial interface bindings; the stated limits of memory, ontology, evaluation, delegation and telemetry. New memory, retention, ontology, contradiction, scenario-review and request capabilities generally have API routes without their workspace pages. |
| Still missing | Memory workspace and agent retrieval, communication/telemetry source integration, archive/customer-export execution, remaining interface behavior, evaluation-dataset reach, per-instance trust coverage and the broader delivery register. The separately recorded G2 path from approved claims into the builder remains work for the intelligence batch. No UN/PortWatch activation act was evidenced in B9. |
| Acceptance work remaining | **3,904 unique units; 3,555 mandatory unfinished = 3,190 open + 338 verified locally + 27 verified in CI.** No accepted deployment leg. These statuses are an acceptance backlog, not an implementation percentage. |

## Integration independently checked

GitHub reports all eight PRs merged. Each merge has two parents: the preceding main head and the recorded prepared candidate. The prepared heads match those checked before integration. The next merge occurred after the preceding reported anchor run completed.

| PR | Merge | Push CI | Cross-host C17 finalize | C19 anchor |
|---|---|---|---|---|
| [#39](https://github.com/a-Halawany/elven/pull/39) | `d675707` | [34714055388](https://github.com/a-Halawany/elven/actions/runs/34714055388) | [34714543911](https://github.com/a-Halawany/elven/actions/runs/34714543911) | [34714595878](https://github.com/a-Halawany/elven/actions/runs/34714595878) |
| [#36](https://github.com/a-Halawany/elven/pull/36) | `5b0d667` | [34714766782](https://github.com/a-Halawany/elven/actions/runs/34714766782) | [34715204263](https://github.com/a-Halawany/elven/actions/runs/34715204263) | [34715254309](https://github.com/a-Halawany/elven/actions/runs/34715254309) |
| [#38](https://github.com/a-Halawany/elven/pull/38) | `fed90fe` | [34715494412](https://github.com/a-Halawany/elven/actions/runs/34715494412), attempt 2 | [34716566659](https://github.com/a-Halawany/elven/actions/runs/34716566659) | [34716617298](https://github.com/a-Halawany/elven/actions/runs/34716617298) |
| [#40](https://github.com/a-Halawany/elven/pull/40) | `ae54e2d` | [34716840197](https://github.com/a-Halawany/elven/actions/runs/34716840197) | [34717383911](https://github.com/a-Halawany/elven/actions/runs/34717383911) | [34717430352](https://github.com/a-Halawany/elven/actions/runs/34717430352) |
| [#41](https://github.com/a-Halawany/elven/pull/41) | `48a01b4` | [34717734013](https://github.com/a-Halawany/elven/actions/runs/34717734013), attempt 2 | [34719532376](https://github.com/a-Halawany/elven/actions/runs/34719532376) | [34719580814](https://github.com/a-Halawany/elven/actions/runs/34719580814) |
| [#43](https://github.com/a-Halawany/elven/pull/43) | `4642856` | [34719853823](https://github.com/a-Halawany/elven/actions/runs/34719853823) | [34720424456](https://github.com/a-Halawany/elven/actions/runs/34720424456) | [34720462423](https://github.com/a-Halawany/elven/actions/runs/34720462423) |
| [#44](https://github.com/a-Halawany/elven/pull/44) | `cbe1790` | [34720646497](https://github.com/a-Halawany/elven/actions/runs/34720646497) | [34721192292](https://github.com/a-Halawany/elven/actions/runs/34721192292) | [34721231086](https://github.com/a-Halawany/elven/actions/runs/34721231086) |
| [#45](https://github.com/a-Halawany/elven/pull/45) | `e0c5025` | [34721784881](https://github.com/a-Halawany/elven/actions/runs/34721784881) | [34722387128](https://github.com/a-Halawany/elven/actions/runs/34722387128) | [34722425076](https://github.com/a-Halawany/elven/actions/runs/34722425076) |

All listed final outcomes are green. Inspected job steps show that every push CI actually packaged, verified and uploaded its C17 archive. Each finalizer downloaded and verified the source archive, then created, verified and uploaded cross-host evidence. Each anchor ran its verification jobs and publish job. This is inspected hosted execution evidence; Codex did not independently download and cryptographically re-verify the archive bytes.

The two red attempts are visible. The #38 log reports the A5 timing comparison failure (foreign 1.92 ms, absent 13.58 ms, ratio 7.06 against a threshold of 3). The #41 browser log reports `locator.fill: Malformed value` for the `datetime-local` input. The same merge heads then passed whole-workflow reruns. The detailed timing/datetime diagnoses remain author diagnoses, not independently reproduced root causes. Preserve those attempts and their maintenance assignments.

## Candidate evidence and B8 closures

The bounded baseline-to-records comparison contains four commits. The two commits after `36ce748` change records/evidence/accounting only; application code and migrations are unchanged. The inspected candidate comprises migrations 0066/0067 and the changed services/routes/tests, not another all-branch or all-volume audit.

- At `36ce748`, [CI 34726253751](https://github.com/a-Halawany/elven/actions/runs/34726253751) used synthetic merge checkout `acaa6a1`, merging the candidate into `e0c5025`. Its inspected build-test log shows 2,148 API unit tests, 58 acceptance tests, **929 integration tests in 56 files**, migration/upgrade gates and C18 612. The focused B9 files passed **25 + 9 + 5** cases; the preserved B8 files passed 19 and 4 cases. [C19 34726253762](https://github.com/a-Halawany/elven/actions/runs/34726253762) is green.
- The supplied refresh runs [34727137207](https://github.com/a-Halawany/elven/actions/runs/34727137207) and [34727137189](https://github.com/a-Halawany/elven/actions/runs/34727137189) belong to `6aaae07`, not `121f636`.
- The final records head `121f636` also has green [CI 34727987168](https://github.com/a-Halawany/elven/actions/runs/34727987168) and [C19 34727987157](https://github.com/a-Halawany/elven/actions/runs/34727987157). Their status/head metadata was inspected; the detailed test log inspected above is the code-head run.
- C17 archive packaging/upload is still skipped in the candidate's PR workflow. The successful archive executions in the integration table are the earlier push workflows, not a post-merge archive for #46.

**B8-F1 closed:** the expired handler calls detached worker shutdown and throws, rather than awaiting its own graceful drain. The scheduler tracks detached close promises for shutdown. The inspected real DB/Redis harness checks refusal, leaving the active queue state, re-serving and eventual delivery. Sources: [dispatcher](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/graph/subscriptions/subscription-dispatcher.service.ts), [scheduler](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/observation/scheduling/scheduler.service.ts), [five-case harness](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/test/int/phase6-repro-serving-lifecycle.test.ts).

**B8-F2 closed:** [0066 §1](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/migrations/0066_serving_ownership_and_reach.sql) introduces a monotonic generation and a serving-row fence. The dispatcher applies it to event reads, receipts, item resolution, item effects and completion. Effect transactions hold KEY SHARE; takeover explicitly obtains FOR UPDATE. The hosted cases cross expiry between items and before completion, and verify the new holder's ledger attribution and resumption. The harness uses two application contexts with separate clients in one OS process; this is not independent multi-host deployment proof.

## B9-F1 — historical memory retrieval exposes unauthorized current content

**Priority: high; merge blocker.** Sources: [MemoryService.retrieve](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/graph/memory/memory.service.ts), [GraphController.retrieveMemoryItem](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/graph/graph.controller.ts), and [shared clearance](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/shared/clearance.ts).

The service loads the current projection into `item`, chooses the requested historical canonical `served` version, and checks purpose, classification and audience against `served`. It then returns both `item` and `version: served`. The controller returns that object unchanged and calls the access-record port with only `versionServed`. The memory projection's RLS in 0066 scopes tenant/domain; it does not sanitize the current statement according to the historical version's audience.

Independent execution of the actual controller, service and clearance methods with explicit query/framework/pipeline doubles produced:

| Case | Result |
|---|---|
| Analyst requests current v2 restricted content | 403, as expected. |
| Authorized auditor requests current v2 | v2 returned, as expected. |
| Same analyst requests readable historical v1 | `versionServed = 1`, but `memory.item.statement` and `source_ref` contain current v2 data. The access port is called with version 1. |
| Repeat using an audience-role restriction instead of higher classification | Current read is 403; historical v1 response again contains the unauthorized current v2 statement. |

All content was synthetic. This proves the response-construction defect with actual TypeScript; it is not a live-data exposure observation or an independently executed HTTP/PostgreSQL run.

**Bounded correction:** return the authorized served version's content and only safe current availability metadata. Any additional version's content requires its own authorization and accurate access evidence. Preserve legitimate historical access. Check the full serialized response, not only `versionServed` or `version.payload`.

**Closure scope:** current denied/authorized controls; historical v1 with current v2 separately restricted by classification and audience; no unauthorized current content in the complete response; access evidence matches what was served. Exercise the real database/HTTP path. This is a fixed response-authorization defect, not a request to reopen the entire authority matrix.

## B9-F2 — a refused edge assertion leaves the unresolved checkpoint in an aborted transaction

**Priority: medium; next relationship/intelligence implementation batch.** Sources: [relationships consumer](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/graph/subscriptions/consumers/relationships.consumer.ts), [GraphCapability.assertEdge](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/graph/graph.capabilities.ts), and [subscription ledger](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/graph/subscriptions/graph-change.ts).

The consumer catches the port's SQLSTATE `22023` for an ontology/review refusal and returns `derivation.blocked` with an unresolved disposition. The capability executes the SQL directly; there is no savepoint or rollback around this assertion. Catching the JavaScript exception does not restore the database transaction. The dispatcher's subsequent unresolved-checkpoint write therefore cannot commit in that transaction. PostgreSQL documents transaction recovery through [ROLLBACK TO SAVEPOINT](https://www.postgresql.org/docs/16/sql-rollback-to.html).

The companion probe executes the actual consumer, derivation helper, capability and ledger. Its explicit transaction-state double models PostgreSQL's abort rule. The successful assertion control returns `edge.re_derived`; the refused predicate path returns `derivation.blocked`, then the actual ledger call encounters modeled `25P02`, with no unresolved record. PostgreSQL behavior is modeled here, not server-reproduced. Source inspection of the dispatcher shows this falls into infrastructure failure/retry instead of the intended human-work disposition.

**Correction/verification:** contain the expected port refusal in a recoverable transaction boundary, or return a typed refusal without aborting the enclosing transaction. Add the already-owed real-database port-refusal case: durable unresolved state, pending reassessment, no successor edge, repeat without duplicate cause/effect, then a successful repair. Preserve successful automatic re-derivation and decided-reassessment guards. Keep this under AU-DP-0176's existing remaining work.

## B9-F3 — retention review cannot verify while preserving the reviewed bytes

**Priority: medium; next retention implementation batch.** Sources: [RetentionService.execute](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/src/retention/retention.service.ts), [0067 retention.verify_action](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/migrations/0067_b9_review_corrections.sql), and the [B9 retention test](https://github.com/a-Halawany/elven/blob/36ce74850723a0cf8be6074483c68e31509ac404/apps/api/test/int/phase6-graph-subscriptions-4.test.ts).

A `review` action correctly records an execution with `port: none`, `outcome: done`, preserving the manifest and bytes. The verifier handles every manifest with disposition `execute` as a deletion: it requires a tombstone and `bytes_present = false`, without checking action kind. The correctly executed review therefore fails verification and remains `executed`. The hosted review case stops after checking the execution record and preserved bytes; it does not call verify for that action.

This is a source-confirmed state-path defect, not an independently executed SQL reproduction. **Correction:** verify reviews against their review execution and preservation contract, keep deletion/floor checks appropriate to those kinds, and emit truthful verification evidence. Extend the existing review case through verification; retain deletion and floor controls. Archive/customer-export execution remains separately missing and explicitly refused.

## Accounting, interfaces and demonstration

The three changed acceptance CSVs contain 1,037 baseline and 1,040 candidate units. No ID is removed. The new mandatory units are AU-DP-0176, AU-MEM-0121 and AU-PRD-0064, all `verified:ci`. Four existing units move from `open` to `verified:ci`: AU-DP-0091, AU-EXO-0051, AU-MEM-0060 and AU-MEM-0065. No `legs_verified` field changes. Against the previously verified baseline, the arithmetic is 3,904 unique units and 3,555 mandatory unfinished. The increase comes from three newly recorded obligations, not regression. Retain CI history while recording the affected clauses and findings accurately; a green run does not resolve these counterexamples.

Parsing the 0065 interface rows and 0066 updates confirms **26 bound / 24 partial / 0 unbound** across 50 identities: the six formerly unbound rows plus the formerly partial L3-I05 become bound. This verifies the register's row accounting, not final semantic acceptance of every interface contract.

The [demonstration log](https://github.com/a-Halawany/elven/blob/121f636bc231c590563b5963de90f322557dd8e7/evidence/cp6/act-b9.txt) is more substantive than B8: the claim-correction event records non-empty work for retrieval, memory-mappings and relationships, including a successor `stocks` edge. Other scenes record memory versions, method evaluation, ontology decisions, evidence deletion, scenario retirement and five executive requests. The four other consumers still have no work on that particular correction event; this does not establish the complete integrated demonstration.

The act ran at WIP `96c0a76` before the final adversarial corrections. The file appends the later 0067 migration/restart; it does not rerun all scenes at `36ce748`. Its printed migration digest prefixes match the committed files independently hashed here: 0066 `f5cd8beff6284b3b…`, 0067 `295d9aaa34264bc7…`. Backups, rehearsal, actual database changes, running services and final deployment/build state remain author evidence. The deletion target is `eu-sanctions-payload`; the misleading PortWatch heading is already explained in the report.

## Next instruction to Claude

Continue from `36ce748` / `121f636`. Codex verified the eight merges and closes B8-F1/F2. Preserve those and every prior closure. Keep the conditional merge authorization; there is no blanket stack hold.

1. Correct **B9-F1** in one bounded patch to the #46 candidate. Use the attached probe and the fixed closure scope above; verify through the real database/HTTP path, including the full response and access evidence. Preserve the authorized historical read. Return the exact candidate and existing required gate results for bounded independent closure. After closure, merge #46 under the existing authorization and complete its normal C17/C19 chain. Do not wait for the complete product or workspace pages to merge this accepted increment.
2. Carry **B9-F2** into the relationship/intelligence batch, including the already-recorded G2 approved-claim builder gap; carry **B9-F3** into retention work. These are assigned functional defects, not additional blanket merge gates. Keep their affected clauses visibly unfinished until corrected.
3. Continue missing capabilities on the next feature branch while the merge candidate stays fixed: start with the usable memory workspace and agent retrieval, then the remaining source/retention/interface work in the delivery register. Add meaningful NORDWERK scenes alongside implementation. Preserve the full eleven-volume product objective and the later comprehensive profile/product verification campaign.
4. Use focused verification plus existing gates. Do not repeat a broad adversarial campaign or produce another records-refresh-to-record-the-refresh chain. Preserve failed attempts and their maintenance work. Return one consolidated update with the frozen merge candidate, merge/archive status, functioning/partial/missing capabilities, acceptance backlog and exact evidence scope.

GHCR remains temporary with monitoring; existing UN keys/Comtrade and live PortWatch are authorized within source permissions and existing budgets/cadences. No new purchases or budget/cadence changes. Preserve backups, history and demonstration services; do not re-arm completed monitors. No production deployment is authorized by this review.

**Evidence boundary:** Codex inspected source and hosted evidence, parsed accounting, and executed the two TypeScript probes with explicit doubles. Codex did not independently run PostgreSQL server, PGlite, Redis, HTTP, browsers, Docker, Trivy, the full integration suite, or the demonstration. No GitHub mutation, workflow dispatch, external message, merge or live-system change was performed by Codex.
