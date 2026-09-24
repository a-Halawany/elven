# THE EYE — B21 bounded review and B22 delivery

Independent review, 2026-09-24. Repository: a-Halawany/elven. This continues the closed reviews; it does not reopen them or start the comprehensive hardening campaign.

**Recommendation: B20-F1 is CLOSED at `a2303ff`. Proceed with #59 once the required checks on its current head have completed successfully, then continue B22.** Carry the known nonce-sweep hang into that implementation batch as a functional fix. Do not make the owner choose between ordinary technical implementations, and do not hold feature delivery for another broad review round.

**Exact reviewed state**

| Item | Revision / state |
|---|---|
| B21 code | `a2303ff88f2862c66d2b08bef32e7c4e8f41dc3d` |
| B21 records; current #59 head | `9c56bb42f138598d1bed779b62920c6fa858e059` |
| Main | `e180b181fb9b323411129d3e8c46845cfcec365c` |
| PR #59 | Open, mergeable; `unstable` while the records-head build-test was still running at the last inspection |

The records commit is a direct child of the reviewed code commit. Its six changed files are the report, batch record, summary, acceptance CSV evidence, evidence index and hosted summary; no runtime code changed. Do not confuse the green code-head run with completion of the later head's required checks.

**New capabilities implemented and functioning within the inspected evidence**

| Capability | What the source and evidence establish |
|---|---|
| Withdrawn-memory content failure | Both canonical statements in the fallback reader are protected and classified. Retrieve/list/get map the unavailable content tier to the withdrawn refusal; the briefing omits memory items and declares degradation. |
| Unreachable vault root | After authorization and lifecycle checks, an unreadable primary-root marker produces metadata-only retrieval with `custody.retrieval_degraded`. Per-object integrity refusals now retain their custody evidence through commit. |
| Twin validation | An admitted version is validated by someone other than its owner; the port computes the envelope evidence. An unfit version blocks new runs; envelope breaches require the declared acknowledgement. |
| Forecast fitness | A versioned rule evaluates recorded outcomes, attention and expiry, records the assessment, and publishes fitness changes to affected consumers. |
| Scenario coherence | Structural failures are recorded on admitted scenarios and restrict downstream use. Retirement and a passing successor provide the demonstrated repair path. |
| Simulation challenge and promotion | Governed open/rerun/withdraw/decide acts, separation of duties, upheld invalidation, and promotion for a stated use are implemented. |
| Simulation run/reproduction hang | These routes establish governed evidence retrievals before their opening write. The new T1.8 regression checks transaction ordering with aged nonce fixtures. This is not proof that every nested-write site has been corrected. |

**Capabilities partially implemented**

The interface register is 40 bound / 10 partial / 0 unbound. Binding an interface is not semantic acceptance of every clause. Remaining delivery includes consumers and attention policy, the purpose-bound query and change-set command, forecast scheduling/reissue, fuller fitness and coherence measures, source-memory propagation and ingestion, and the recorded degradation behavior outside the twelve labelled reads. These unfinished behaviors remain implementation work even where prose has moved them under “hardening.” The comprehensive robustness/profile campaign still follows feature implementation.

AU-MEM-0067 remains open. The root-unreachable case is delivered; an individual missing/corrupt object under a reachable root still returns the uniform A7 409. Preserve that nondisclosure control and the outstanding specification obligation. This review does not waive or reinterpret the remaining requirement as accepted.

**Capabilities still missing**

The register continues to carry cross-domain reference without copying, replication/portability packages, package encryption beyond TLS, communications/telemetry ingestion and the analyses object, remaining source-memory capabilities, remaining interface contracts, and deployment work. Comtrade activation still needs the owner's key binding. Production recipient/signing activation and the owner's demonstration walks remain separate from synthetic and hosted evidence.

**Acceptance work remaining**

The unchanged reported acceptance backlog is **3,555 = 3,179 open + 339 verified locally + 37 verified in CI**. B21's binding adds evidence without promoting units. No deployment leg is accepted. These figures are not implementation-completion percentages. In the next normal records update, replace stale “until the hosted run binds” explanations with the actual remaining clauses; do not create another records-refresh chain for wording alone.

**B20-F1 independent closure evidence**

I executed the actual B21 TypeScript for `MemoryService.retrieve/current`, the fallback reader and the shared content-tier classifier, with explicit query/savepoint/ledger doubles. The unchanged projection-block and clearance helpers were also used. The query double injected SQLSTATE `57014` at the canonical read reached by the original reproduction.

| Control | Result |
|---|---|
| Serving projection, content query fails | Metadata-only; one degraded-retrieval record |
| Same condition, unauthorized purpose | 403; no degraded-retrieval record |
| Withdrawn projection, present row, content unavailable | 503 / `EYE-DEG-001` |
| Withdrawn projection, missing row, canonical content available | Correct version served from the fallback |
| **Original defect: withdrawn + missing row + failing canonical query** | **503 / `EYE-DEG-001`; two savepoint boundaries reached** |
| Fallback's `memory.expected_items` query fails | 503 / `EYE-DEG-001`; its savepoint reached |
| Connection error `08006` or authority error `42501` | Propagated; neither is relabelled as content degradation |

The lightweight error-body double preserves the internal underscore form (`EYE_DEG_001`); the inspected HTTP harness asserts the product's hyphenated wire code. The probe verifies control flow and classification, not PostgreSQL transaction recovery. Hosted F1 exercises the route and database behavior, including list/get, briefings and agent stop behavior.

Source SHA-256 values used by the independent probe:

| Source under `apps/api/src` | SHA-256 |
|---|---|
| `graph/projections/content-tier.ts` | `10d1c34b0079eb417ea9f0f6953ff8840869008de25135b93312e659dea5d41c` |
| `graph/projections/fallback.ts` | `3cee939a6c3dcdec2173e682c9af5faf8f3d367406285875d1e8877272f70075` |
| `graph/memory/memory.service.ts` | `3876b840dd6332c87eef93d44428cc6a8f92b407ae19a092f9c114e129e50796` |

**Hosted and demonstration evidence**

[B21 CI 35982420268](https://github.com/a-Halawany/elven/actions/runs/35982420268) and [C19 35982420259](https://github.com/a-Halawany/elven/actions/runs/35982420259) passed on the code head. Inspected hosted logs support unit 2,389 + meta 9; acceptance 58; integration 1,086 in 74 files, including F1 1/1, evidence degradation 6/6 and fitness 6/6; upgrade through 0081; C18 623 + 44; browser 51. CI used GitHub's synthetic PR merge checkout. Supply-chain passed on the returned official image pins. PR archive packaging/upload remains skipped; #59's push-to-main archive chain must follow its merge.

The records-head CI [35984737389](https://github.com/a-Halawany/elven/actions/runs/35984737389) had successful supply-chain/browser jobs and an in-progress build-test at final inspection. Its C19 run 35984737353 was successful. This review does not label that pending build green or authorize a timeout to count as success.

The inspected [B21 act](https://github.com/a-Halawany/elven/blob/a2303ff88f2862c66d2b08bef32e7c4e8f41dc3d/evidence/cp6/act-b21.txt) is **author evidence**, reporting 54 checks and concrete NORDWERK effects. The archive-marker removal is a declared simulation of an unreachable root, not an independently tested unmount. The upheld-challenge and outside-envelope cases are harness/rehearsal evidence. The 51 hosted browser cases add no new fitness walk; that walk is a demo spec. Event delivery counts alone do not establish non-empty work in every subscriber.

I did not independently run a PostgreSQL server, Redis, HTTP, browsers, Docker, Trivy, the full integration suite, or the demonstration. I inspected source, harness assertions, hosted job logs and author act records, plus executed the isolated TypeScript probe described above. No GitHub or live-system changes were made.

**Integration history verified without reopening it**

| Integration | Evidence state |
|---|---|
| #57 → `870b212` | Full CI attempt 3 and finalize passed; anchor 35918837855 publish failed because the resolution named attempt 2 while finalized evidence authenticated attempt 3. Preserve the refusal. |
| #56 → `6212c5b` | CI 35919379221, C19 attempt 2, finalize 35921411985 and anchor 35921521108 passed/published. This is the later cumulative chain. |
| #58 → `e180b18` | Main CI 35923830613 passed in one attempt; C19 35923830611, finalize 35926060309 and anchor 35926159815 passed/published. |

The premature #58 merge remains an error. Its pending PR build-test rerun **subsequently failed**, with 1,069/1,070 integration cases, on the Phase 1 timing assertion (job 107390622048, run 35920796097 attempt 2). The later main run passed. The records already preserve both outcomes; do not rewrite them as an all-green pre-merge chain. A merge predicate must require completion and success of every required check on the intended head; zero failures, an empty result, or a timed-out wait is insufficient.

The six current SCX reissues carry approval/review date 2026-09-23 and expiry 2026-11-05. Inspected supply-chain logs show the official pins passing the gate and the return-transition recheck. Repository CI's return is established; the statement that live demo containers still use derived images remains author-reported.

**Technical decision for B22**

Use an additive migration to make expired-nonce cleanup in `ctx.build` skip rows locked by another transaction, preferably with bounded work per invocation. Keep expiry, signature, transaction/backend binding, single-use enforcement and authority checks unchanged. The current cleanup is an unconditional `DELETE` of entries expired for more than an hour; the inspected forecast issue/backtest/outcome handlers still assemble governed evidence inside another write. B21's route-specific preflights reduce the exposed sites but leave the shared trigger.

This is a functional blocker already demonstrated by the author, not a new speculative hardening campaign. A focused two-connection reproduction should show that an outer transaction holding an expired nonce cannot stall the inner capability issuance, that cleanup can later complete, and that expired/consumed contexts remain unusable. Keep T1.8 and the existing required gates. Exercise the named residual paths with aged state on the isolated copy; change additional call sites only as needed to resolve that bounded defect.

PostgreSQL documents that `SKIP LOCKED` skips immediately unavailable row locks, while ordinary table locking still applies. The recommendation addresses this particular cleanup dependency; it is not a claim that all nested transactions become safe. [PostgreSQL 18 SELECT documentation](https://www.postgresql.org/docs/18/sql-select.html).

Prepare the next demonstration scenes from the actual route/port contracts and validate a failed scene in isolation before repeating the whole act. Preserve the nine rehearsals as history, but do not repeat the guess-payload/whole-rehearsal cycle as a delivery method.

**Recommended continuation prompt**

Sending the following text supplies the owner's authorization for #59 and the bounded demo-container operation described in it. The review itself performed neither action.

> Continue from `a2303ff` / records `9c56bb4`. Read and file the attached bounded review. B20-F1 is closed; preserve every earlier closure. Our priority remains the complete product across all eleven volumes and the integrated NORDWERK demonstration. Comprehensive hardening follows feature implementation.
>
> I authorize merging #59 at the reviewed code plus its records once every required check on the current head has completed successfully. Pending, unknown, cancelled, empty or timed-out checks are not success. Preserve branches and failed attempts. Complete its push-to-main C17/C19 chain, binding the same source run and attempt through finalization and anchor publication. Do not create a recursive records-refresh chain.
>
> Continue B22 while integration checks run. First fix the known `ctx.build` nonce-cleanup hang in an additive migration using locked-row skipping and bounded cleanup, preserving all authority and expiry semantics. Keep B21's preflight fixes, add the focused two-connection proof and exercise the named residual paths with aged state. This implementation choice does not need another owner decision. Use existing required gates; do not launch another broad audit or multi-round re-judge campaign.
>
> Deliver the planned consumers and attention policy, including L10-I05's package cause and the remaining fitness/coherence-to-attention behavior in the agreed B22 scope. Then continue the register's missing capabilities. Keep unfinished contract behavior in the implementation backlog; do not relabel it as optional hardening. AU-MEM-0067 remains open without a waiver; preserve A7 while resolving its remaining contract. No promotion merely because a run is green.
>
> I also authorize a controlled recreation of the existing demonstration containers onto the official image digests already accepted on main. Use the established runbook, a fresh durable backup and an isolated restore check first; preserve the data volumes, vault roots, credentials and rollback evidence. Verify the database target is `eye_demo`, restore the demo services and confirm the functioning demonstration afterward. This authorizes no new hosting, other-company resources, purchases or budget/cadence changes. Schedule this operation so feature work continues independently.
>
> Build the next act from the actual contracts, verify affected scenes before a full rehearsal, and demonstrate actual effects. Keep the two timing controls unchanged, with failed attempts retained and their determinism work in the later hardening campaign. Use durable storage for irreplaceable backups and handoffs. Do not restart completed monitors or repeat credential hunts.
>
> Report new functioning capabilities, partial capabilities, missing capabilities and acceptance work remaining. Keep exact heads and evidence limits clear, with one hosted binding. Return a consolidated checkpoint when the batch is delivered; stop only for a concrete access, owner credential or resource decision that truly prevents further work.

