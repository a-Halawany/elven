**THE EYE — bounded review of the corrected plan, B23 and Redis maintenance**

Reviewed 25 September 2026. Continue from the preserved handoff; this is not a whole-product audit.

**Recommendation:** continue B24 on the current account. Preserve B23's delivered work and its successful functional CI evidence, but correct the new context-query diagnostic filtering defect before treating B23 as closed. Finish the limiter's cancellation handling in the same bounded pass. Redis PR #62 is technically ready for a separate owner merge decision. This review supplies no merge, deployment, purchase or extra-account authorization.

**Functioning capabilities and remaining delivery**

B23 contains actual implementations for material-change events and attention routing; human-convened reviews; segmented acquisition with credit backpressure, interruption, resume and explicit gaps; a purpose-bound memory context query; atomic graph change sets with revision checks and retries; versioned scenario branching; and the briefing's BRF@v2 attention section. These are code changes, not only interface-register edits.

The migration asserts 50 bound / 0 partial / 0 unbound interfaces. That is an interface-binding count, not proof that every surrounding feature or acceptance clause is complete. The context-query defect below qualifies its policy-filtering claim.

Attention remains partial: B24 still owns the escalation timer, delivery channel and receipts, remaining materiality/overload behavior, suppression approval, delegation, queue evaluation, source-impact enforcement and execution of the selected extraction plan. External-channel proof remains separate from a local or synthetic adapter. The demonstration's stream is a synthetic segment-pull fixture; it does not demonstrate a live publisher or socket transport.

The open-register labels remain 1 functioning, 167 partial, 15 missing and 18 externally blocked. Fourteen delivered baselines are separate. Mandatory acceptance remains **3,555 = 3,179 open + 339 verified locally + 37 verified in CI**, independently recounted from rows with mandatory=yes. No deployment leg is accepted. These counts do not establish implementation percentages.

**Live references checked**

| PR | Reviewed head | Base | State at inspection |
|---|---|---|---|
| #60 — B22 | 71255504cd7c740a7a8ad6d0e2eb36a6ef8ea633 | main, 5165a97167b9cc047c13f26c959eb75401941241 | Open; GitHub reports clean |
| #61 — corrected plan | e579514c77b1c4d60910228ac97c40094e456cb4 | phase6-b22 | Open; CI fails the Redis recheck; build/browser/C19 green |
| #62 — Redis maintenance | 17f0236d61e042080e3828846653e30ceb1da8f5 | main | Open; CI and C19 green |
| #63 — B23 records | 95dfcdb0867a6708b0a21ca0e51e66f919abd703 | planning/delivery-plan-2026-09 | Open; build/browser/C19 green; Redis recheck fails |

B23 implementation candidate: a3176c8915ddd529a1cd4ba14bed078cef2172d8. Main remains the handoff head. I made no GitHub or live-system changes.

This review does **not** independently close B22's nonce or attention runtime claims, and it does not reopen B20-F1 or any earlier closed finding.

**Verification actually inspected**

I cloned the relevant committed tree read-only with respect to GitHub, inspected the bounded deltas and relevant implementation paths, ran the unmodified tracker and schedule checker, read the hosted job logs, compared both captured Redis indexes, and ran two small local probes. No PostgreSQL server or live demo was available here; I did not independently repeat the full integration suite or demo.

| Evidence | Independently established result |
|---|---|
| Tracker at B23 records | PASS; 6,264 rows mapped; 216 records; 78 stages |
| Schedule model --check | PASS; published blocks and stage dates reproduce |
| B23 candidate CI 36073944410 | build-test succeeded; raw logs show 1,151/1,151 integration tests in 81 files, 2,441 API unit tests, upgrade PASS and C18 proof/verification PASS |
| B23 candidate browser job | Success; recorded browser evidence says 51/51 |
| B23 candidate run overall | Failure: supply-chain recheck on the newer Redis index; therefore “all checks green” would be inaccurate |
| B23 records CI 36129849473 | build-test/browser succeeded; only supply-chain failed, specifically the Redis recheck |
| B23 records C19 36129849539 | Success |
| #62 CI 36129773111 / C19 36129773207 | Both success on 17f0236 |
| NORDWERK act | Committed act transcript and script inspected; transcript ends ALL SCENES HELD, 28.5 s. Claude reports 49 checks and two rehearsals; I did not rerun these |
| Local timing failures | Failure summaries retained; successful isolated reruns and hosted pass support carrying them to H1. The hosted pass alone does not prove the precise cause of every local failure |

The source paths inspected include migration 0084; the decision and attention consumers; reviews service; acquisition lifecycle/orchestrator and connector contracts; memory context query/service; graph revision command; scenario branching; briefing composition; relevant focused tests; and the B23 act and evidence summaries.

**Disposition of the earlier plan findings**

| Finding | Bounded disposition |
|---|---|
| PLAN-F1 | Allocation corrected: 13 construction stages B100–B112 are before implementation completion. H/R retain comprehensive verification, independent assessment and external proof. Five groups described as having no software retain H/R completion |
| PLAN-F2 | Corrected: the three feature milestones now follow their completing stages; checker enforces feature/stage owner/date/milestone agreement, effort reconciliation, completing assignments and dependency reachability; B23 has explicit clause conditions and scenes |
| PLAN-F3 | Modeling corrections present: one stated unit, calibration table, pinned starts, explicit heavy slots, coordinator and approval wait; M1/M2 dates generated; M3/M4 explicitly undated. Calibration remains provisional |
| PLAN-F4 | Migration rules corrected. The implemented limiter still has the reproduced cancellation defect below, so the whole finding is not closed |

The 78 stages comprise 72 implementation, three hardening and three readiness stages. Requirement row totals are now 1,003 implemented, 2,722 partial, 2,513 missing and 26 not applicable. The net increase in implemented rows is 19; it includes stale-status reconciliation and B23 work, and is not 19 newly delivered product features. I verified the arithmetic; I did not repeat the semantic review of all 49 stale candidates.

Feature effort is 408.5–706.75 U. Stage effort is 410.5–710 U. B23/H1 own effort adds 2–3.5 U; F-R0-01's unstaged, already-functioning records allowance accounts for the 0–0.25 U offset. The pasted summary's reference to F-P3-01 for that offset is a wording error.

**PLAN-F4 residual — cancelling a heavy job releases its slot too early**

Source: scripts/dev/heavy-slot.sh, lines 43–47 and 71–77, unchanged between e579514 and the B23 records head.

The INT/TERM traps signal the immediate child, immediately delete the slot directory, and exit. They do not wait for the child to finish. A command that handles shutdown asynchronously or ignores SIGTERM can therefore continue after another run acquires the released slot. Tracking the child's PID in holder_alive protects the SIGKILL-wrapper path, but it cannot help once the TERM trap has deleted the directory.

I ran the actual committed wrapper in a private temporary slot directory with EYE_HEAVY_SLOTS=1. A synthetic child signalled readiness, ignored TERM and remained alive briefly. I then sent TERM to the wrapper and started a second command through the same wrapper.

Observed:
- Wrapper exit: 143.
- Second command started while the first child was still alive: true.
- First child had ended before the second started: false.

The one-slot mode makes the violation easy to observe; the same release path is used with the default two slots. All probe processes were isolated and cleaned up by their own process group. I did not invoke the repository's broad pkill-based test script against other processes.

**Bounded correction:** retain ownership until the launched workload has actually exited. Handle the process tree used by the real heavy commands, including delayed shutdown, and release the slot afterward. Add one focused cancellation regression demonstrating that a waiting job cannot enter early. Keep the existing successful cases. This is unfinished behavior of the newly introduced limiter, not a request for a new hardening campaign.

**B23-F1 — context omission diagnostics bypass purpose and reader filtering**

Sources:
- apps/api/migrations/0084_b23_interfaces_and_briefing_v2.sql, memory.retrieve_context, especially lines 1389–1396.
- apps/api/src/graph/memory/memory.service.ts, lines 760–779.
- apps/api/src/graph/memory/context.ts, omissionsOf and CONTEXT_POLICY_NOTE.
- apps/api/test/int/phase6-retrieve-context-b23.test.ts, X1/X2 and X7.

The SQL correctly filters served candidates by purpose, and the service filters returned items by clearance and audience. However, the SQL computes unverified_rows directly from linked projection candidates and content_absent_rows from the earlier cur set. These aggregate paths do not use the purpose-admitted set or reader clearance/audience checks.

The service then passes those raw aggregates into omissionsOf without applying the item policy. The response can therefore contain a numeric omission and an item-existence message for records the caller is not entitled to see. It can also change the declared product state because of those records. This contradicts the new query's explicit contract that policy-withheld items are neither counted nor mentioned.

The same SQL also sets bounded before the service's clearance/audience filter, and the service forwards it into bound.truncated. Keep that related diagnostic in the same focused policy review; do not start a separate finding campaign.

I executed the actual context method, the actual context helpers and actual clearance helpers after stripping TypeScript types. The SQL capability and projection-state read were explicit doubles. With zero returned items and no raw absent count, the answer was complete with no omissions. With zero returned items and content_absent_rows=1, it became partial with an omission containing rows:1 and the message “1 memory item(s) linked to this subject are not served…”. No memory access was recorded.

This directly reproduces the TypeScript exposure; the SQL origin was established by code inspection. It is **not** a live-PostgreSQL reproduction of the whole route. The current X7 case uses an internal, purpose-matching poisoned row; it does not test a denied purpose, denied audience or insufficient clearance on that diagnostic path.

**Bounded correction:** apply the same disclosure policy to diagnostic counts and truncation as to items. If trustworthy authorized metadata is unavailable, report a non-disclosing degradation rather than an unauthorized item count. Preserve useful omissions for records the caller may see. Prove this with focused database-backed cases for purpose, audience and clearance, alongside the existing authorized degradation cases.

Migration 0084 is already applied to the demo. Any SQL correction must be a forward migration allocated through the corrected ledger. Do not rewrite 0084 or its applied history. This is a new B23 route defect; earlier withdrawn-memory closures remain closed.

**Schedule interpretation**

The model reproduces these expected M1 dates: one account 2028-07-31; two 2027-10-04; three 2027-07-02; four 2027-05-21. These are assumptions-based scenarios, not accepted delivery commitments or reasons to buy accounts.

There is a useful faster B23 observation, but the current narrative mixes measurement boundaries:
- e579514 committed 2026-09-24 21:40:52 UTC.
- a3176c8 committed 2026-09-24 23:40:18 UTC: about 1 h 59 min after the corrected plan commit.
- Its hosted build finished 2026-09-25 00:05:18 UTC.
- 95dfcdb records committed 2026-09-25 11:31:17 UTC: about 13 h 50 min after the corrected plan commit.

Those are timestamp intervals, not measured active engineer/agent-hours. The reported “about three hours” needs its own stated start/end; it should not be treated as the same measure as 13–22 sequential session-hours. Record actual stage wall time, active account time if available, and hosted/review/approval waits separately.

With one account continuing, recalibration should use B23 and the next two completed stages on that account. Do not wait for A2/A3 stages that have not been allocated. This bookkeeping clarification can accompany normal stage records and should not pause B24 or trigger a new planning exercise.

**Redis and merge recommendation**

The captured new raw index hashes exactly to 3811787313eba226a2ef38658c6ccb91cd5e110edc89c37767de373120a0e5a0. I independently compared its manifests against the earlier captured index: only the riscv64 child and its attestation differ. The amd64 and arm64 digests are unchanged. Compose and the conformance manifest use the new index; the gate test now checks the per-service pin dates.

#62's hosted CI and C19 are now green, superseding the pasted “still running” status. A separate explicit owner approval for #62 is reasonable on this bounded technical evidence.

Merging #62 into main does not edit phase6-b22, the planning branch or phase6-b23. Claude must carry the maintenance change through the stack using the normal integration process and verify the resulting heads. Existing green checks from older heads do not prove those updated combinations. Follow the existing post-merge C17/C19 requirements for any expressly authorized merge; do not waive gates or re-arm completed monitors.

Do not approve #60, #61 and #63 as a blanket group on the strength of this review. #60's independent runtime closure remains outside this delta; #61 has the limiter residual; #63 has B23-F1 and the integration dependency. Implementation may keep stacking while merge decisions are separate.

**Ready-to-send continuation**

Continue B24 on the current account from B23 records 95dfcdb. Preserve B20-F1 and all earlier closures, frozen criteria, backups, applied migrations and demo state.

Keep the corrected plan. Resolve B23-F1 and the remaining PLAN-F4 limiter issue in one bounded pass alongside B24: context diagnostics must not count or mention records withheld by purpose, clearance or audience; cancelling a heavy job must retain its slot until the workload has exited. Add focused regressions for these cases. Any SQL correction to applied 0084 must use a forward migration.

Use B23 and the next two completed stages on this account for calibration, separating active work, elapsed build time and hosted/review/approval waits. No new broad audit or planning exercise.

Proceed with B24's stated attention scope. Keep synthetic delivery proof separate from any required real-provider proof, and report remaining clauses honestly. Carry the existing load-timing items to H1 unless they become functional blockers.

#62 now has green CI and C19 at 17f0236. Prepare its separate merge decision and the normal stack integration/check sequence. This instruction does not authorize any merge, live recreation, purchase or additional account. Report the delivered behavior, focused results, demo act, exact heads and remaining blockers once.

**Primary references**

- [B23 PR #63](https://github.com/a-Halawany/elven/pull/63)
- [Plan PR #61](https://github.com/a-Halawany/elven/pull/61)
- [Redis PR #62](https://github.com/a-Halawany/elven/pull/62)
- [B23 candidate CI](https://github.com/a-Halawany/elven/actions/runs/36073944410)
- [B23 current records CI](https://github.com/a-Halawany/elven/actions/runs/36129849473)
- [B23 current records C19](https://github.com/a-Halawany/elven/actions/runs/36129849539)
- [Redis CI](https://github.com/a-Halawany/elven/actions/runs/36129773111)
- [Redis C19](https://github.com/a-Halawany/elven/actions/runs/36129773207)
- [Corrected plan](https://github.com/a-Halawany/elven/blob/95dfcdb0867a6708b0a21ca0e51e66f919abd703/audit/DELIVERY_PLAN.md)
- [Limiter](https://github.com/a-Halawany/elven/blob/e579514c77b1c4d60910228ac97c40094e456cb4/scripts/dev/heavy-slot.sh)
- [B23 migration](https://github.com/a-Halawany/elven/blob/95dfcdb0867a6708b0a21ca0e51e66f919abd703/apps/api/migrations/0084_b23_interfaces_and_briefing_v2.sql)
- [Memory service](https://github.com/a-Halawany/elven/blob/95dfcdb0867a6708b0a21ca0e51e66f919abd703/apps/api/src/graph/memory/memory.service.ts)
- [Context diagnostics](https://github.com/a-Halawany/elven/blob/95dfcdb0867a6708b0a21ca0e51e66f919abd703/apps/api/src/graph/memory/context.ts)
- [Context integration tests](https://github.com/a-Halawany/elven/blob/95dfcdb0867a6708b0a21ca0e51e66f919abd703/apps/api/test/int/phase6-retrieve-context-b23.test.ts)
- [Recorded NORDWERK act](https://github.com/a-Halawany/elven/blob/95dfcdb0867a6708b0a21ca0e51e66f919abd703/evidence/cp6/act-b23.txt)

