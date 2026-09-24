# THE EYE — bounded review of the finite delivery plan

**Recommendation:** retain this plan's traceable structure, correct the bounded issues below once, and proceed with B23. Do not restart the five-reader planning exercise. Treat the February 2027 date as a scenario estimate, not an established delivery commitment. Additional accounts should use the corrected integration rules before starting dependent migrations.

Reviewed planning commit: `5da47998b8c7d5c382e87bf5a8c3344cb8025691`, on `planning/delivery-plan-2026-09`. Its parent is B22 records `71255504cd7c740a7a8ad6d0e2eb36a6ef8ea633`. At inspection, #60 remained open at that head against main `5165a97167b9cc047c13f26c959eb75401941241`, with GitHub reporting `clean`. This review concerns the planning package; it does not independently close the B22 runtime review or authorize a merge.

**What I independently checked**

I downloaded the committed plan, tracker, row map, stage table, checker, schedule model, demo plan, account prompts, stale-status candidates, all ten requirement CSV files covering Volumes 0–10, and the actual migration runner. I ran the unchanged tracker and scheduling model in isolation and independently checked the counts and stage assignments. I also executed the migration runner with explicit filesystem, database-client and process doubles to test the proposed naming rules. No PostgreSQL server, Docker, live services or remote mutations were involved.

| Check | Result |
|---|---|
| Requirement coverage | 6,264 rows, each mapped once; the combined v00-v01 file accounts for two volumes |
| Tracker size | 216 records: 201 open-register feature groups, 14 delivered baselines, one not-applicable bucket |
| Open-register grouping | 1 functioning, 167 partial, 15 missing, 18 externally blocked; 200 are unfinished |
| Delivered baselines | 14 groups covering 686 rows, separate from the 201-group table |
| Stage assignments | 65 stage IDs; no duplicate feature or stage IDs; every unfinished feature has one completing stage |
| Stage split | 59 implementation stages, three hardening stages, three deployment-readiness stages |
| Tracker check | PASS against the exact committed requirement CSVs |
| M1 model check | PASS; published implementation dates reproduced |

This establishes arithmetic coverage of the register, not independent semantic proof that every feature is fully characterized. The status algorithm derives labels from requirement rows, some of which the plan itself flags as stale. “One functioning feature” is therefore **not** a count of all working product capabilities. Keep these as planning groups and retain their delivered/remaining clauses. The 3,555 acceptance backlog stays separate.

**PLAN-F1 — missing implementation is still placed after “implementation complete.”**

M1 says every remaining functional clause is implemented. The tracker contradicts that definition by leaving substantial software construction in H1–H3. Examples from its own `remaining` column:

| Feature | Current stage | Unbuilt behavior explicitly listed |
|---|---|---|
| F-R0-03 | H1 | Runtime exception register, expiry review, audited configuration-change surface |
| F-P2-05 | H1 | Inference admission/budgets, tenant/task economics ledger, model-serving cell |
| F-P3-11 | H1 | Quality/freshness metrics and remediation workflows |
| F-P7D-02 | H2 | Workload identities, internal mTLS, network zones, governed egress, trusted-time service |
| F-P7D-13 | H2 | Replication, fencing/failover and recovery controllers |
| F-P7D-25 | H2 | Conformance manifests, traceability and exception/stewardship registries |
| F-P7-F-12 | H3 | Product-governance workspace and its baseline, traceability, exceptions and release-conflict services; status is `missing` |

Split construction from verification. Move the missing software into implementation stages; keep stress tests, representative evaluations, independent assessment and comprehensive verification afterward. Apply the same distinction to deployment-profile features: software that can be built locally belongs before implementation completion; actual external installation/proof stays gated on its resources. A substitute can demonstrate software but cannot close a clause requiring a real external integration.

This is a correction to the delivery plan, not a reopening of previously closed findings or a request to perform hardening now. Reuse the stage IDs where practical and update dependencies and estimates from the revised allocation.

**PLAN-F2 — three feature milestones disagree with their completing stages, and the checker misses it.**

| Feature | Completing stage | Feature milestone | Stage milestone |
|---|---|---|---|
| F-P3-01 — canonical headers | B50 | hardening | M1 implementation |
| F-P7A-08 — agent sandbox | B70 | hardening | M1 implementation |
| F-P7B-07 — red-team suites/safety cases | B75 | hardening | M1 implementation |

These are remnants of the reported stage moves. The tracker passes despite them. The feature-based implementation estimate is 352.75–601 units; the implementation-stage table totals 361.25–616.25. The feature-based hardening estimate is 29–53; H1–H3 total 24.5–44.5. Some differences are legitimate—B23 advances existing groups—but they need an explicit reconciliation rather than competing totals.

Make stage/milestone assignment authoritative and check consistency, including unique completing assignments, dependencies and the feature dates/owners against their stages. B23 currently has no completing features, an empty `demo_scenes` field and a generic completion condition referring to “the completing features.” Give this advancing stage explicit clause-level completion conditions and scenes for its six interfaces and briefing change. It need not falsely claim completion of the larger feature groups it advances.

Keep differences between computed labels and characterization notes explicit, and update stale rows only where evidence supports a move. A mechanically calculated label is not a new verification result.

**PLAN-F3 — the model reproduces assumptions; it does not yet validate the promised dates.**

| Accounts | Reproduced M1 planning date |
|---|---|
| 1 | 2027-08-20 |
| 2 | 2027-03-26 |
| 3 | 2027-02-09 |
| 4 | 2027-01-21 |

The simulator uses midpoint effort, a chosen rate of 3 units/account-day, a 25% allowance, fixed account efficiencies of 1.0/0.9/0.8/0.7, and 0.5 coordinator-day per integration. Its results are internally reproducible.

Limits to state and correct:

- The plan defines an effort unit as roughly a batch-day, yet asserts 3–4 units per account-day. The committed package contains no calibration table tying the same unit definition to completed B20–B22 work, active account time and measured waiting. Resolve that unit ambiguity and show the small calibration table; do not invent a tighter ETA.
- The model has no explicit two-slot heavy-verification resource or owner-approval delay. These are assumptions absorbed into constants, not simulated constraints. Either model those bottlenecks simply or label their treatment honestly.
- It schedules the 59 M1 stages. H1–H3, final acceptance and readiness dates are not generated or checked by it. Do not describe it as reproducing every date in the complete plan.
- The single-account simulation starts with B50, while the account prompt says B23 then B24. Pin the intended first assignments in the model so the proposal and executable schedule agree.
- The displayed 62.8-unit chain is the longest precedence chain by midpoint effort. The resource-limited three-account finish is B26, with A3, on February 9. “Every day's slip on that chain moves M1 by a day” is not established by this model.

Keep the date range as provisional planning information. Calibrate again after the first two or three completed stages using the same effort definition; then use the agreed regular review cadence. Implementation should continue during this calibration. The plan does not justify purchasing a fourth account or machine solely for a claimed 2.5-week gain.

**PLAN-F4 — stage-number-based temporary migration names can reverse dependencies.**

The plan permits a stage to start on an implemented but unmerged parent. It also derives temporary migration names from stage IDs. These rules conflict:

| Declared dependency | Proposed names | Runner order |
|---|---|---|
| B46 depends on B51 | `9046_b46_…sql`, `9051_b51_…sql` | B46 before B51 |
| B41 depends on B55 | `9041_b41_…sql`, `9055_b55_…sql` | B41 before B55 |

I executed the actual `apps/api/scripts/migrate.mjs` loop with explicit doubles. It applied the B46-named fixture before B51, because it sorts filenames. A second control showed that renaming an already-applied temporary file to `0084…` causes the identical content to be executed again: the migration ledger is keyed by filename, and the old filename remains. This was a runner-control-flow probe, not a real database migration test.

Use coordinator-issued names in dependency order, or require a parent checkpoint with final migration names before a dependent branch starts. Freeze final names before candidate verification and demonstration application. After a temporary name changes, rebuild only the affected disposable databases; never repair this by rewriting an applied shared/demo ledger. The current rule that temporary migrations never reach `eye_demo` is correct and should stay.

The proposed `heavy.lock` is also only a convention. One lock filename does not itself implement “at most two holders.” Provide one runnable two-slot admission mechanism shared by the participating processes before enabling heavy parallel verification. Cross-machine workers need a separate integration rule; a local path coordinates only its own host. Preserve historical evidence and backups; do not bulk-drop the 229 old verification databases to create space without establishing their ownership and retained evidence.

Probe source hash for `migrate.mjs`: `db1df30727f804ef1d643a59362b8e0575a2105817f73c316b428863aad3c3b5`.

**Standing decisions and immediate execution**

PortWatch permission is already approved. Remove that as a new D4 owner blocker; retain source-specific permissions for genuinely new feeds and the Comtrade key-binding prerequisite. Keep additional accounts/resources as proposals until the owner chooses them. Product features may proceed independently of later external acceptance resources, but do not label those unmet external clauses complete.

The planning branch descends from #60. Carry its ten-file planning delta forward through a planning PR/normal integration path; do not replay its B22 parent as a new implementation. This review authorizes no GitHub, live, resource or purchase action and makes no change to #60's separate merge decision.

The proposed A1/B23, A2/B50, A3/B80 separation is a reasonable first-wave structure once accounts and isolation are available. Start B23 on the existing account after the single bounded plan correction, while preparing the other two assignments. Nothing here requires waiting for a new whole-product audit, all external resources, or all future estimates to become certain.

**Ready-to-send continuation**

> Keep `5da4799` as the preserved planning baseline and apply the attached bounded review in one correction pass. Do not repeat the five-reader exercise or start another broad audit.
>
> Move missing software out of post-implementation hardening and split build work from external proof. Reconcile the three feature/stage milestone mismatches, effort totals and tracker checks. Give B23 its explicit clause-level completion conditions and demo scenes without declaring the larger feature groups complete.
>
> Keep the dates provisional. Define the effort unit consistently, show its B20–B22 calibration, align the single-account starting order, and state which waits/resources and milestones the model does or does not simulate. Recalibrate from the first completed stages while delivery continues.
>
> Correct temporary migration numbering to respect dependency order. Finalize names before candidate checks and any shared/demo application; rebuild disposable databases after a rename, never rewrite shared migration history. Provide a working two-slot heavy-verification limiter. Preserve backups and historical evidence.
>
> PortWatch is already authorized; remove the repeated permission blocker. Account count and new resources remain proposals. This instruction adds no merge or purchasing authorization.
>
> After this bounded correction, proceed with B23 on the current account, stacked on #60 if needed. Prepare A2/B50 and A3/B80 for the chosen account allocation. Preserve the full eleven-volume scope, closed findings, frozen criteria and the complete NORDWERK demonstration. Keep full hardening after feature implementation. Return the corrected baseline once, then report actual stage deliveries against it.

Sources: [planning commit](https://github.com/a-Halawany/elven/commit/5da47998b8c7d5c382e87bf5a8c3344cb8025691), [master plan](https://github.com/a-Halawany/elven/blob/5da4799/audit/DELIVERY_PLAN.md), [feature tracker](https://github.com/a-Halawany/elven/blob/5da4799/audit/delivery/FEATURE_TRACKER.csv), [stages](https://github.com/a-Halawany/elven/blob/5da4799/audit/delivery/STAGES.csv), [schedule model](https://github.com/a-Halawany/elven/blob/5da4799/audit/delivery/schedule-model.py), [account prompts](https://github.com/a-Halawany/elven/blob/5da4799/audit/delivery/ACCOUNT_PROMPTS.md), [migration runner](https://github.com/a-Halawany/elven/blob/5da4799/apps/api/scripts/migrate.mjs).
