# THE EYE — bounded B24 review
Reviewed 25 September 2026. Repository: https://github.com/a-Halawany/elven

Functioning behavior is supported for the attention timer, in-app and synthetic-mailbox delivery, additional materiality rules and overload handling, suppression/delegation/evaluation, and the implemented source-impact gates. B24 also adds a working extraction worker, but its evidence-version binding has a functional defect described below. Attention remains partial: real-provider delivery, novelty, some item classes, fairness, the act transition, Strategic Health Score inputs, and the declared coverage/marker carryovers remain unfinished.

Acceptance remains **3,555 = 3,179 open + 339 verified locally + 37 verified in CI**. No deployment leg is accepted. These are acceptance statuses, not implementation percentages.

This review covers the two requested corrections and B24's relevant delta. It does not reopen earlier closures, independently close B22's runtime claims, or constitute a broad audit. No repository, workflow, demo, or other live system was changed.

**Decision**

Recommend approving **#62 alone at `17f0236d61e042080e3828846653e30ceb1da8f5`**, subject to the owner's explicit instruction. It remains open, mergeable and CLEAN; its successful CI/C19 evidence is unchanged. No new technical objection to that separate re-pin was found. This recommendation is not merge authorization.

Do not approve the stack as a group. Fix B24-F1 before #64's merge decision. Reconcile B24-F2 in one bounded delivery-record pass while B28 implementation proceeds. Retain the individual merge sequence and checks for each resulting head. There is also a distinct #61 integration-gate failure, detailed below; Redis does not explain every red check.

**Closed findings**

- **B23-F1 CLOSED at #63 `d2fa829`.** Migration 0085 moves the reader's purpose, clearance and audience authorization inside `memory.retrieve_context`, before bounds and diagnostics are calculated. Unverified log rows are no longer counted. Content-absent counts require policy metadata from a serving projection and disappear when that projection is withdrawn. The service supplies the authenticated reader's metadata and keeps its item filter. Tests X10–X14 cover unauthorized purpose/audience/clearance, authorized positive controls, truncation and the withdrawn projection. The hosted B24 candidate log contains all 14 passing context tests. The already-applied 0084 file is byte-identical to the B23 records baseline. This closure rests on source inspection and actual hosted PostgreSQL test evidence; I did not run PostgreSQL locally.
- **PLAN-F4's limiter residual CLOSED at #61 `45fda0f`.** The workload has its own process group; cancellation signals and drains that group, including the grace/KILL path, before releasing the slot. Normal completion also drains remaining group members. The same script is present at B24's records head. I ran the actual corrected script in a private one-slot directory with a TERM-ignoring workload and a waiting job: no overlap, cancelled wrapper exit 143, waiter exit 0, slot released after the workload finished (1.89 seconds overall). The committed eight-case transcript covers the added regressions, including the lingering grandchild. The old test's broad process-name cleanup is gone. This closes the reported cancellation defect, not an unlimited claim about every process/host failure.

B20-F1 and other earlier closures remain unchanged.

**B24-F1 — selected evidence version is lost before extraction (functional blocker for #64)**

The execution ledger records and deduplicates `(method_id, method_version, evd_object_id, evd_version)`. The worker then drops `evd_version`:

1. `ExtractionPlanWorkerService.runOne`, lines 202–215, passes `evidenceIds: [x.evd_object_id]` and the method version, but no evidence version.
2. `ExtractionOrchestrator.run`, lines 118–147, queries those IDs and deliberately selects the highest `object_version` for each.
3. A completed extraction with a nonzero evidence count makes the worker return `done`. `record_plan_execution` does not compare the run's evidence version with the queued version.

This is reachable in the model the product already supports: evidence corrections create later canonical versions. A pending plan can wait for an extraction agent or a later drain while evidence changes. A version-1 plan can consequently be marked done after selecting version 2. The queue's uniqueness constraint does not fix that mismatch.

I reproduced the boundary with **the actual TypeScript worker method and the actual orchestrator selection callback**, stripped with Node's TypeScript support. The query builder and post-selection successful extraction are explicit doubles. With EVD versions 2 and 1 available:

```json
{
  "queued_evidence_version": 1,
  "extraction_argument_keys": [
    "envelope", "principal", "tenantId", "domainId", "methodId",
    "limit", "newAttempt", "evidenceIds", "methodVersion"
  ],
  "selected_evidence_versions": [2],
  "worker_outcome": "done"
}
```

This is a source-level executable reproduction, **not** an end-to-end database/vault/model run. The companion `b24-plan-version-probe.mjs` records those boundaries and can be run with a recent Node version as `node b24-plan-version-probe.mjs /path/to/elven` against the reviewed checkout. The existing six plan tests exercise duplicate events and a lost outcome on the same version; they do not cover a newer version arriving before the queued plan executes.

Required correction: carry the selected evidence version through the governed extraction/read path and its execution evidence, without bypassing current withdrawal/access controls. If that version cannot safely be used, record an explicit refusal or governed reselection; do not mark the old execution done using another version. Add a focused real-database regression for a plan queued on v1 with v2 arriving before its drain, including the correct-version and duplicate/retry controls. **0086 has reached the demo: preserve it.** Use a forward migration only if SQL changes are needed.

Source anchors:
- [Worker, lines 202–215](https://github.com/a-Halawany/elven/blob/45ed41b8bfa7325dcd141a804bfa5921b24e59b3/apps/api/src/intelligence/plan/extraction-plan-worker.service.ts#L202-L215)
- [Orchestrator's current-version selection](https://github.com/a-Halawany/elven/blob/45ed41b8bfa7325dcd141a804bfa5921b24e59b3/apps/api/src/intelligence/extraction/orchestrator.service.ts#L118-L147)
- [Execution identity and ledger](https://github.com/a-Halawany/elven/blob/45ed41b8bfa7325dcd141a804bfa5921b24e59b3/apps/api/migrations/0086_b24_attention_completion.sql#L2635-L2667)
- [Outcome recording](https://github.com/a-Halawany/elven/blob/45ed41b8bfa7325dcd141a804bfa5921b24e59b3/apps/api/migrations/0086_b24_attention_completion.sql#L2969-L3001)
- [Existing evidence correction path](https://github.com/a-Halawany/elven/blob/45ed41b8bfa7325dcd141a804bfa5921b24e59b3/apps/api/src/observation/corrections/corrections.service.ts#L132-L208)

**B24-F2 — unfinished attention still points to B24 as its completing stage**

The report is candid about unfinished clauses. The authoritative schedule has not caught up:

| Record | Current value | Consequence |
|---|---|---|
| FEATURE_TRACKER.csv, F-P6-07 | `stage=B24`, partial, target 2026-10-06, no verification stage | Its unfinished construction has no truthful future completing stage. |
| STAGES.csv, B24 | Completes F-P6-07; notes say DELIVERED except carryovers | Its generic completion condition still requires all the feature's remaining clauses. |
| STAGES.csv, B28 | Two B24 carryovers appear in notes | They are not explicit clause-level completion conditions or demonstration scenes; its `advances` field is empty. |
| B32/B34 | Provide later objects needed by attention | F-P6-07's completion/dependencies do not reflect those later prerequisites. |

The remaining field also still lists browser coverage of B24 panels despite the new demo walk. That is a small correction within this same reconciliation, not a separate review campaign.

I reran `feature-tracker.mjs --check` and `schedule-model.py --check`: both pass. Their syntactic consistency does not detect this completion mismatch. The tracker still maps all 6,264 rows once, with 216 records, 201 open-register groups and 78 stages (72 implementation, 3 hardening, 3 deployment-readiness). Group labels remain 1 functioning / 167 partial / 15 missing / 18 externally blocked, with delivered baselines separate.

Required correction: treat B24 as advancing the unfinished feature, map every remaining attention clause to an explicit future implementation stage and owner, and name the actual completing stage with the B28/B32/B34 dependencies it needs. Make the two B28 carryovers explicit in its completion conditions and NORDWERK scenes. Separate external-provider proof from software construction; preserve D6 and purchasing constraints. Reconcile effort, dates and the existing check once. Do not move missing construction into hardening or reduce final acceptance.

Sources: [F-P6-07 tracker](https://github.com/a-Halawany/elven/blob/45ed41b8bfa7325dcd141a804bfa5921b24e59b3/audit/delivery/FEATURE_TRACKER.csv#L92), [stage definitions](https://github.com/a-Halawany/elven/blob/45ed41b8bfa7325dcd141a804bfa5921b24e59b3/audit/delivery/STAGES.csv).

**Verification and current check limits**

| Head / run | Independently inspected result |
|---|---|
| #62 `17f0236`; CI 36129773111 / C19 36129773207 | Successful; #62 remains open and CLEAN. Earlier image-index comparison remains closed. |
| #61 `45fda0f`; CI 36147700841 | Redis recheck fails **and build-test fails**. Browser and C19 pass. |
| #63 `d2fa829`; CI 36149261460 | Build-test and browser pass; supply-chain fails at the Redis recheck. C19 passes. |
| #64 candidate `8459390`; CI 36164184010 | Raw build log: integration 1182/1182 in 86 files, API unit 2487 + hermetic meta 9, acceptance 58, upgrade through 65 migrations, C18 all four stages passed. Browser and C19 36164183865 pass; supply-chain fails at the Redis recheck. |
| #64 records `45ed41b`; CI 36167074968 | At final inspection, build-test is still running. Browser passes; supply-chain fails at the Redis recheck; C19 36167075072 passes. The candidate's completed run is not a completed run for this records head. |

The extra #61 failure is `phase1-acceptance.test.ts`, A5 “EXISTENCE AND TIMING”: foreign-scope median **3.48 ms**, nonexistent median **12.11 ms**, ratio **3.48055**, against the assertion `< 3` (line 471); 1102/1103 integration tests passed. This establishes a failed timing gate, not a new proven isolation leak or proof that the plan patch caused it. It requires a focused disposition and the existing required gate on the integrated head. Do not attribute it to Redis, waive it, or start a broad hardening audit.

[Failed #61 job](https://github.com/a-Halawany/elven/actions/runs/36147700841/job/108112881879) · [B24 candidate CI](https://github.com/a-Halawany/elven/actions/runs/36164184010) · [B24 records CI](https://github.com/a-Halawany/elven/actions/runs/36167074968)

The demo transcript reports 63 checks and “ALL SCENES HELD” in 486.1 seconds. Its scope and the new browser walk are consistent with the implementation inspected. These are committed demonstration records; I did not independently operate `eye_demo`, its backup or its continuously running agents. In-app and the database mailbox are not real-provider acceptance.

The requirement counts reproduce: **1,013 implemented, 2,726 partial, 2,499 missing, 26 not applicable** across 6,264 rows. Mandatory acceptance counts reproduce separately. The provisional date model still reproduces its published table. B23/B24 timing observations are recorded, and recalibration after B28 can proceed as planned; the measurements with parallel implementers do not independently establish a delivery commitment.

**Continuation for Claude**

Preserve B23-F1 and PLAN-F4 as closed. Apply one focused B24-F1 correction before #64's merge decision: preserve the selected evidence version through extraction, refuse or explicitly reselect if it cannot safely be used, and prove the delayed-v1/new-v2 case with the actual database path. Keep 0084–0086 immutable; add a forward migration only if necessary.

In one bounded tracker correction, assign every unfinished F-P6-07 clause to its future implementation work and actual completing stage. Make the two B28 carryovers explicit completion conditions and demo scenes, reconcile effort/dependencies/checks, and keep real-provider proof open under D6. Continue B28 implementation on the current account alongside this correction; do not wait for unallocated A2/A3, redo the planning audit, or launch comprehensive hardening.

The stack's individual merge sequence remains appropriate, but #61 also has the A5 timing-test failure. Give that required gate a focused disposition and report each actual head's checks accurately. #62 is ready for a separate explicit owner merge decision. This continuation grants no merge, purchase, workflow-dispatch, live-system, or additional-account authorization.

