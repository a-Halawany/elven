# THE EYE — B24 correction and B28 bounded review
27 September 2026 · Repository: https://github.com/a-Halawany/elven

B28 adds functioning event-time stream rules, weak-signal nomination and corroboration, warning intake/lifecycle processing, and the two B24 coverage/assumption-marker carryovers. These additions are supported by the inspected code and hosted harnesses. Their larger feature groups remain partial, with construction and external proof still assigned to later stages.

The tracker now reports **1 functioning / 168 partial / 14 missing / 18 externally blocked** among 201 open-register groups. Delivered baselines are separate; “1 functioning” is not a count of all working product capabilities. Requirement rows are **1,048 implemented / 2,722 partial / 2,468 missing / 26 not applicable**, totaling 6,264. Mandatory acceptance is unchanged: **3,555 = 3,179 open + 339 local + 37 CI**. No deployment leg is accepted.

This is a review of the supplied delta, not another full audit. No GitHub mutation, workflow dispatch, merge, credential operation or live-system change was performed. Earlier closures, including B20-F1, B23-F1 and the PLAN-F4 limiter correction, are preserved. B22's broader runtime claims were not independently reopened or closed here.

**Recommendation**

Continue **B32 on the current account**. Keep one focused B24-F1 correction alongside it; that finding cannot yet close. Make one small B28 scheduling correction in the next normal records update.

**#62 remains the separate merge recommendation**, at `17f0236d61e042080e3828846653e30ceb1da8f5`: open, CLEAN and supported by its successful published checks. No merge authorization has been supplied. The remaining stack still needs individual decisions and checks after integration; no old head's green checks prove a new combined head.

**B24-F1 — partly fixed, still OPEN at the actual retrieval boundary**

The pre-drain case is fixed. The worker now supplies `evidenceVersions`; the orchestrator refuses a superseded version before starting a run; migration 0087 records refusal and queues one live successor; a withdrawn successor is refused. X7 exercises the actual correction route, correct-version processing, duplicate/retry handling and the ledger's wrong-version refusal. The current hosted run passes all seven plan tests. Migrations 0084–0086 are byte-identical to the previously reviewed files.

However, the version is still lost between that check and the governed byte read:

1. In `orchestrator.service.ts`, the evidence selection and version check occur before a separate `pipeline.write` retrieval.
2. The call to `EvidenceService.retrieve` passes `evidence_version` inside its sixth argument, **context metadata**. The seventh argument, **version**, is omitted.
3. `EvidenceService.retrieve` expressly treats context as descriptive metadata. Its version argument defaults to null, which selects the newest canonical row.
4. The new `RetrievalReceipt.evidenceVersion` is copied from the earlier `evd` snapshot, not a version established by the retrieval result. The 0087 completion guard compares that reported number to the queued number.

A correction between the two reads can therefore select version 2 while the receipt still reports version 1. The ledger guard then compares two matching “1” values; it does not detect the mismatch. The existing X7 corrects the evidence **before** the drain, so it does not exercise this boundary.

I ran a focused probe using the **actual orchestrator retrieval callback, actual EvidenceService method signature and canonical-row selector, and actual receipt-construction code**. The database query builder and successful vault result are explicit doubles. Output:

```json
{
  "queued_and_prechecked_version": 1,
  "actual_retrieval_selected_version": 2,
  "reported_receipt_version": 1,
  "ledger_string_comparison_would_match": true,
  "returned_bytes": "version 2"
}
```

This is an executable source-level reproduction, not an end-to-end PostgreSQL/vault/model run. It does not claim that I independently executed the SQL completion port. For attachment compatibility, the companion code is supplied as `B24_Retrieval_Version_Probe.txt`. Save that code as `b24-retrieval-version-boundary-probe.mjs` and run it with a recent Node version and the reviewed repository path as its argument.

The remaining correction is narrow: bind the selected version at the actual governed retrieval, establish the receipt/custody/audit version from what that read served, and refuse or explicitly reselect a mismatch **before extraction/claim admission**. Preserve current withdrawal, tombstone and access-control refusals; merely forcing an old version must not bypass them. Add a deterministic real-database interleaving test that commits a correction between precheck and retrieval, plus its withdrawn-successor control. Keep 0084–0088 immutable; allocate a forward migration only if SQL changes are necessary.

This remains the original evidence-version finding, not a new hardening campaign.

Source anchors:
- [Orchestrator](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/apps/api/src/intelligence/extraction/orchestrator.service.ts#L155-L290)
- [Retrieval signature and selection](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/apps/api/src/observation/vault/evidence.service.ts#L233-L282)
- [0087 ledger guard and reselection](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/apps/api/migrations/0087_b24f1_plan_evidence_version.sql)
- [X7 regression](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/apps/api/test/int/phase6-attention-plan-b24.test.ts#L437-L516)

**B24-F2 — CLOSED for the attention allocation; one B28 dependency remains**

The requested attention correction is now explicit: B24 advances F-P6-07; B28 owns novelty and both carryovers; B34 completes the remaining software after B32's objects; R2 retains real-provider proof under D6. The B28 conditions and scenes name remediation and assumption-marker reach. Channel adapter construction remains before implementation completion. This resolves the prior F-P6-07 allocation finding.

B28 also honestly advances its three main groups rather than declaring them complete. One dependency was omitted:

**B28-F1 — F-P4-10 completes in B74 but still assigns required UX construction to B84 without making B84 a prerequisite.** Its remaining field names compare/contextualize views plus disposition digest, consequence preview and signature in B84. B74's full transitive prerequisite set is only B23, B24, B28, B32, B34 and B45. B84 is absent. The current three-account dates happen to place B84 earlier, but the dependency graph does not preserve that ordering if resources or progress change.

Add B84 as a completion prerequisite, or assign the completing stage after that required UX construction another explicit way. Ensure B84's existing brief/conditions own those named clauses, then run the existing tracker/model checks once. This does not block B32 or require a new planning exercise.

I reran both checkers successfully. They currently accept the missing B84 edge. All 6,264 rows still map once; 216 tracker records and 78 stages remain (72 implementation, 3 hardening, 3 deployment-readiness).

Sources: [feature tracker](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/audit/delivery/FEATURE_TRACKER.csv), [stages](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/audit/delivery/STAGES.csv).

**What B28 evidence supports**

| Capability | Code and evidence inspected | Boundary retained |
|---|---|---|
| Streams | Governed evidence retrieval passes its version argument; SQL advances event-time watermarks, fires/revises windows and records late exclusions; hosted streams harness 10/10 | Rule-fitness automation, consumed-evidence correction reconciliation and production load proof remain later work. |
| Weak signals | Maturity trigger requires same-version independent corroboration; detectors, human dispositions, indicator governance and constrained agent paths; hosted signals harness 10/10 | Remaining model, learning and UX clauses are still partial. |
| Warnings | Shared intake, dedup/storm paths, context/playbook/closure, expiry tick and separate governed after-tick raises; preflight chooses an active human or defers; hosted warnings harness 7/7 | Material-policy approval, forecast-movement summaries, learning feedback integration and real-provider proof remain open. |
| Coverage and markers | Remediation ports and UI, gap acceptance/recovery, assumption citations in commitment bearing; hosted remediation harness 4/4 | A planned recollection step is a recorded plan, not proof that collection ran. Assumption traversal is bounded to four levels in this implementation. |

The selected-plan migration also explicitly records a limit: correction after an older execution has already finished does not automatically trigger re-extraction. Do not describe the correction as automatically re-extracting every corrected record.

The committed act reports **73 checks held**. The documented host sleep and delayed escalation establish catch-up after wake; they do not prove uninterrupted deadline service while the host sleeps. The new browser walk records and screenshots are consistent with the supplied scope. I did not independently operate the demo, verify backups in place or rerun its hour-long act.

Sources: [0088](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/apps/api/migrations/0088_b28_signals_streams_warnings.sql), [stream consumer](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/apps/api/src/prediction/streams/stream-rules.consumer.ts), [act transcript](https://github.com/a-Halawany/elven/blob/07b9776801c0f4ecbdfd98e37039c13f525c28ad/evidence/cp6/act-b28.txt).

**Hosted checks and timing dispositions**

| PR/head | Inspected result |
|---|---|
| #64 `2ff1bfb` | CI 36244307305: build-test and browser successful; supply-chain fails only at patched-image recheck. C19 36244307345 successful. |
| #65 candidate `2c75487` | CI 36276627852: build-test fails at one C18 differential control; browser passes; supply-chain fails at Redis recheck. Preserve this failed run. |
| #65 records `07b9776` | CI 36278247045: build-test and browser successful; supply-chain fails only at Redis recheck. C19 36278247015 successful. |

The **raw records-head build log** confirms integration **1214/1214 across 90 files**, API unit **2522 + 9**, web **63**, acceptance **58**, upgrade **67 migrations**, and C18 **623 + 44** passing. Candidate-to-records differences are narrative/planning/evidence files; runtime and gate code are unchanged.

The C18 explanation is supported by source: the control adds 5 ms to the rotated credential's expiry; the verifier checks whether the implied marking instant remains inside creation/rotation/bootstrap bounds. A fixed 5 ms addition does not necessarily cross those bounds. The failed candidate and successful unchanged-code records run support carrying this timing-sensitive control into H1. I did not inspect the failed run's full snapshot archive, so I do not independently assert its exact timestamp slack. Preserve C18's closure, the failed evidence and all required gates; no threshold waiver or new audit is needed.

The A5 disposition is reasonable: #61's diff is docs/limiter work, the runtime gate is unchanged and it passes on subsequent functional heads. The 40-run study is documented by Claude; I did not repeat it or independently retrieve its raw local logs. #61 must still pass on its integrated head. **Correction to my preceding report:** A5 uses the mean of 12 samples, not the median.

[Current B28 build job](https://github.com/a-Halawany/elven/actions/runs/36278247045/job/108505026704) · [Failed candidate job](https://github.com/a-Halawany/elven/actions/runs/36276627852/job/108500518761)

**Calibration and the reported credential incident**

The published model reproduces its provisional dates: one account 2028-08-02, two 2027-10-06, three 2027-07-02 for implementation completion. These remain assumption-driven outputs, not accepted forecasts. Three partial-stage construction observations with parallel implementers cannot establish that construction will never constrain delivery. Recorded approval waiting also does not justify silently counting it in both construction throughput and explicit model delays. Keep construction and wait measurements separate in the next normal calibration update; this is not a reason to stop implementation.

The claim that the development password “never left this machine” is **unverified** once it appeared in AI tool output. That does not establish a repository leak. Do not reproduce the value or perform another credential hunt. I recommend targeted rotation of that one development credential under the appropriate owner authorization, with its actual service impact recorded. No rotation was performed by this review, and the incident is not a reason to restart the closed security reviews.

**Continuation**

Continue B32 on the current account. Preserve all earlier closed findings and frozen gates. B24-F2 is closed for the attention-stage allocation; B24-F1 remains open only at the governed retrieval boundary described above. Fix that boundary and its deterministic regression before #64's merge decision, then propagate the fix through the stack. Preserve applied migrations.

In the next records pass, add the F-P4-10/B84 construction dependency to its actual completion stage and make ownership explicit; rerun only the existing checks. Keep A5/C18 timing work in H1 with no waiver or criteria changes. Report the current heads and their actual checks without extra records-only refresh chains.

#62 is still a separate explicit owner decision. This continuation grants no merge, purchase, workflow dispatch, live-system modification or additional-account authorization.
