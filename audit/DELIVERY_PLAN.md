# THE EYE: Finite Delivery Plan (baseline 2026-09-24, corrected 2026-09-25)

**Status of this file.** This is the one scheduling baseline from the current checkpoint to the complete product: all eleven volumes and the integrated NORDWERK demonstration. It adds no merge, deployment, purchase or budget authorization.

**The dates are provisional planning information, not delivery commitments.** They come from characterization estimates and one calibration (§5.1), and are recalibrated after the first two or three completed stages (§9).

It decomposes the owner's packages (R0, P1–P7-F in `audit/The_Eye_Full_Product_Delivery_Register_2026-09-09.md`) and the schedule steps S5–S7 of `FULL_PRODUCT_DELIVERY_REGISTER.md` §9 into fixed stages. Those files stay as written; §10 of the register points here.

**History.** The baseline was committed as `5da4799`, and git keeps it. One bounded review of it (`audit/reviews/The_Eye_5da4799_Delivery_Plan_Review.md`) was applied in one correction pass (§10). No broad audit was repeated.

**Machine-readable companions** (authoritative for per-item detail):

| File | What it holds |
|---|---|
| `audit/delivery/FEATURE_TRACKER.csv` | **The progress tracker**: one row per feature (201 open-register feature groups, 14 delivered baselines and one not-applicable bucket). Columns: feature ID; spec refs; volumes; the completing `stage` and its effort; the `verify_stage` (H or R) and its effort; milestone, owner and target date (mirrored from the completing stage); dependencies; status; row counts; delivered and remaining clauses; external prerequisites; NORDWERK scenes; evidence pointers |
| `audit/delivery/feature-rowmap.csv` | Every one of the 6,264 atomic requirement rows (`audit/requirements/*.csv`) mapped to exactly one feature |
| `audit/delivery/STAGES.csv` | The 78 stages: completing and verifying features, own effort, dependencies (derived, plus explicit extras), effort, owner, dates, scenes, completion conditions |
| `audit/delivery/feature-tracker.mjs` | Derives (`--write`) and checks the tracker and the stages. Fails on: an unmapped row; a stale count; a feature without exactly one completing stage; a verify stage that is not H/R; a milestone, owner or date differing from the stage; effort that does not add up; an unreachable dependency; a cycle; a non-completing stage without its own effort, scenes or explicit conditions |
| `audit/delivery/schedule-model.py` | The schedule model (§5): M1 and M2 only. `--write` updates STAGES.csv dates and owners and the generated blocks below; `--check` compares them |
| `audit/delivery/MIGRATION_LEDGER.csv` | Provisional migration sequence numbers and final names (§6.3) |
| `scripts/dev/heavy-slot.sh` (+ `.test.sh`) | The two-slot heavy-verification limiter (§6.1); its check passes (`evidence/planning/heavy-slot-test-20260925.txt`) |
| `audit/delivery/DEMONSTRATION_PLAN.md` | The NORDWERK story |
| `audit/delivery/ACCOUNT_PROMPTS.md` | Ready-to-copy prompts (proposal only; nothing activated) |
| `audit/delivery/briefs/B50.md`, `B80.md` | The prepared first assignments of A2 and A3 |
| `audit/delivery/STALE_STATUS_CANDIDATES.csv` | 49 register rows whose status looks stale against the code. They move only in B23's records step, and only with evidence |

## 0. Verified checkpoint (2026-09-25)

| Item | Value |
|---|---|
| `main` | `5165a97` (#59 merged; its C17/C19 chain completed) |
| PR #60 (B22) | Open at `7125550`, every check green, GitHub `CLEAN`. **The merge awaits the owner's word** |
| Planning | `5da4799` on `planning/delivery-plan-2026-09` (descends from #60). This correction is carried on the same branch through a planning PR stacked on #60; B22 is not replayed |
| B23 | Implemented on `phase6-b23` (migration 0084; stacked on #61) — the local gates and the act on `eye_demo` green (`audit/CP6_BATCHES.md` §B23); its hosted run binds in its records commit; the merge awaits the owner's word |
| Demonstration | `eye_demo` through 0083 on the official image pins; API :3401, web :3000. Backups under `.eye-local/backups/` are preserved |
| Interface register | 44 bound / 6 partial / 0 unbound |
| Acceptance units | 3,555 = 3,179 open + 339 verified locally + 37 verified in CI. **Verification, not implementation completion; no percentage is derived** |
| Local machine | 14 cores, 24 GB RAM, about 28 GB free disk. About 229 older verification databases (~17 GB) exist. **They are not bulk-dropped**: each needs its ownership and any retained evidence established first |

## 1. Milestones (distinct; none implies the next)

| Milestone | Meaning | Gate | Provisional target |
|---|---|---|---|
| **M1 Implementation complete** | Every implementation stage merged (B23–B112). This includes all locally buildable software of the hardening and deployment features: construction was moved forward (§10, PLAN-F1). Each feature's remaining functional clauses are built and demonstrated, with focused harnesses and the required gates. A substitute demonstrates software; it never closes a clause that needs a real external integration | STAGES.csv completion conditions of every M1 stage | Model (§5.2): 3 accounts, expected **2027-07-02**; range 2027-04-30 … 2027-11-08 |
| **M2 Comprehensive hardening** | H1–H3: the verifying features' comprehensive checks (stress, representative data, drills, independent assessment where named) and the carried timing items | H-stage conditions and the full hosted chain | Model: about 1–2 weeks after M1 (**2027-07-13** at 3 accounts), plus external auditors' lead time |
| **M3 Final acceptance** | Every applicable mandatory acceptance unit verified on the released artifact, and the owner's end-to-end demonstration walk | Register §9 S7: an owner, a date or a dependency never closes a unit | **Not modeled.** Most units are verified inside their stage; the residual sweep is estimated at 3–6 weeks after M2 (low confidence) |
| **M4 Deployment readiness** | R1–R3: installation and certification on real profiles, production proof, the commercial and investor package | External prerequisites in hand; the owner's acceptance | **Externally gated; not dated** |

## 2. Feature map (the classification)

Status is **computed from the requirement rows**:

- **functioning**: every row implemented or not applicable.
- **missing**: every row missing.
- **partial**: anything in between.
- **externally blocked**: carried from the characterization; the feature cannot complete without a named external prerequisite.

These are **planning-group labels, not verification results.** Some input rows are themselves flagged stale (§2.5). "One functioning feature" is therefore not a count of the product's working capabilities: most delivered behavior sits inside partial groups, as their `delivered` clauses show, and in the 14 delivered baselines.

### 2.1 Counts (open-register feature groups)

| Status | Groups |
|---|---|
| functioning | 1 (F-R0-01, the closed strategic loop with Decision Replay) |
| partial | 167 |
| missing | 15 |
| externally blocked | 18 |
| **Total** | **201** (200 unfinished) |

**The rest of the 6,264 rows:** 14 delivered baselines (`F-DONE-<area>`, 686 rows) and 26 not-applicable rows (`F-NA`). **Row counts:** implemented 984 · partial 2,722 · missing 2,532 · not applicable 26. **Acceptance verification is a separate ledger** (the 3,555 units).

| Package | Groups | functioning | partial | missing | ext. blocked | Rows (impl / partial / missing) |
|---|---|---|---|---|---|---|
| R0 | 6 | 1 | 4 | 0 | 1 | 49 (9 / 35 / 5) |
| P1 World Observation | 17 | 0 | 14 | 1 | 2 | 238 (22 / 127 / 89) |
| P2 Intelligence | 18 | 0 | 16 | 1 | 1 | 236 (11 / 174 / 51) |
| P3 Memory / KG / Strategy Graph | 18 | 0 | 17 | 0 | 1 | 364 (45 / 251 / 68) |
| P4 Prediction / Scenarios / Warnings | 16 | 0 | 14 | 2 | 0 | 290 (25 / 141 / 124) |
| P5 Twins / Simulation | 9 | 0 | 8 | 0 | 1 | 143 (40 / 91 / 12) |
| P6 Decision / Executive OS | 16 | 0 | 14 | 1 | 1 | 293 (29 / 182 / 82) |
| P7-A Agents | 17 | 0 | 14 | 2 | 1 | 320 (4 / 149 / 167) |
| P7-B Learning / Evaluation | 13 | 0 | 11 | 2 | 0 | 257 (5 / 134 / 118) |
| P7-C Marketplaces | 9 | 0 | 6 | 2 | 1 | 97 (1 / 43 / 53) |
| P7-D Trust / Infrastructure / Profiles | 25 | 0 | 22 | 0 | 3 | 1,707 (41 / 755 / 911) |
| P7-E UX / Accessibility / Localization | 21 | 0 | 19 | 0 | 2 | 910 (57 / 543 / 310) |
| P7-F Commercial / Interoperability | 16 | 0 | 8 | 4 | 4 | 648 (9 / 97 / 542) |

**Groups by the milestone of their completing stage:**

| Milestone | Groups | Of which |
|---|---|---|
| Implementation | 196 | F-R0-01, functioning, needs records only |
| Hardening | 1 | F-P7-F-13: governance documents constituted by the owner's decision |
| Deployment readiness | 4 | F-R0-06 production proof; F-P7-F-14/15/16 investor and commercial documents |

These five have no software to build. Every other group's software is built in M1. 28 groups also carry a separate verify stage: 17 in H1–H3 and 11 in R1–R3.

### 2.2 Effort, reconciled (one definition: §5.1)

| Bucket | Units (U) |
|---|---|
| Feature groups, total (stage + verify effort) | 408.5–706.75 |
| — of which F-R0-01 (no stage; records only) | 0–0.25 |
| — construction and completion at the completing stages | 391.5–674 |
| — comprehensive verification or external proof at the verify stages | 17–32.75 |
| Own stage effort (B23's interface work 1.5–2.5; H1's carried timing items 0.5–1) | 2–3.5 |
| **Stages, total** | **410.5–710** |
| — M1: 72 stages | 390.25–669.5 |
| — M2: H1–H3 | 8–15.25 |
| — M4: R1–R3 | 12.25–25.25 |

The baseline's two competing totals are explained by B23's own effort and the H/R features that have now moved:

| Baseline figure | Units |
|---|---|
| Features in M1 | 352.75–601 |
| M1 stages | 361.25–616.25 |

The checker now fails whenever a stage's effort differs from its features plus its own effort.

### 2.3 Delivered versus remaining clauses

Each tracker row carries its `delivered` clauses (with migration and evidence pointers) and its `remaining` clauses. That is the split of every partial group. Where a group's construction and its verification or external proof fall in different stages, `stage_effort` and `verify_effort` show the split. For example:

- **F-P7D-13** (HA): replication, fencing and the failover/DR controllers are built on compose/kind in **B105**. The drills and the regional-loss evidence are verified in **H2**; the regional clause needs a second region or site (D8).
- **F-P6-07** (attention): B22 delivered the policy, the engine, the queue and the page. **B23** delivers MaterialChangeRaised. **B24** completes the timer host, the delivery port, the remaining dimensions, suppression approval, delegation, queue evaluation and constraining markers. The real-channel clauses need a provider (D6).

### 2.4 Status where the characterization and the row arithmetic differ

Seven groups read "missing" in the characterization but compute as **partial**, because a few of their rows are partial:

| Feature | Partial rows |
|---|---|
| F-P1-07 | 2 of 8 |
| F-P1-08 | 2 of 28 |
| F-P1-09 | 3 of 21 |
| F-P7D-09 | 28 of 110 |
| F-P7D-10 | 5 of 52 |
| F-P7D-13 | 10 of 29 |
| F-P7D-23 | 17 of 75 |

The tracker keeps the computed label. The capability is largely absent in each, and the effort reflects that.

### 2.5 Externally blocked groups, missing groups, stale rows

**Externally blocked (18).** Each group's *software* is built in its completing stage; the group stays blocked until the prerequisite exists.

| Feature | Stages | What it needs |
|---|---|---|
| F-R0-06 | R2 | Production proof |
| F-P1-06 | B42 | The Comtrade key binding; licensed market, satellite and social feeds. **PortWatch is authorized and is not a blocker** |
| F-P1-17, F-P2-18, F-P3-18 | B109 → R1 | Profile conformance on real infrastructure |
| F-P5-08, F-P6-15, F-P7A-09 | B110 → R1 | Profile conformance on real infrastructure |
| F-P7D-21, F-P7D-22, F-P7D-24 | B111 → R1 | Real SaaS, private-cloud and on-prem profiles |
| F-P7C-09 | B112 → R3 | Real publishers, customers and commercial terms |
| F-P7-E-08 | B108 → H3 | Accessibility auditor, assistive-technology testers, users |
| F-P7-E-09 | B85 | Translation and counsel |
| F-P7-F-13 | H3 | The named councils |
| F-P7-F-14, F-P7-F-15, F-P7-F-16 | R3 | Volume 10 approvals, data room, commercial model |

**Missing (15):**

| Feature | Stage | Capability |
|---|---|---|
| F-P1-10 | B43 | Edge / IoT |
| F-P2-07 | B47 | Media |
| F-P4-11 | B28 | Event-time streams |
| F-P4-15 | B33 | Domain packages |
| F-P6-08 | B32 | Strategic Health Score |
| F-P7A-05 | B70 | Message contracts |
| F-P7A-15 | B73 | Graph / memory / reasoning / dissent agents |
| F-P7B-06 | B75 | Evaluator models |
| F-P7B-12 | B76 | Agent incident workspace |
| F-P7C-05, F-P7C-06 | B78 | Scenario and data marketplaces |
| F-P7-F-04, F-P7-F-05 | B94 | Onboarding and adoption |
| F-P7-F-10 | B90 | Semantic metrics |
| F-P7-F-12 | **B107** (built) → H3 (acceptance by named authorities) | Product governance workspace |

**Stale rows.** `STALE_STATUS_CANDIDATES.csv` lists 49 rows. The characterization also flagged these areas:

- legal hold and retention (0066, 0070–0072); the credential path (0070)
- the correction consumer (0060); graph subscribers (0063–0065)
- the ontology and contradictions (0066); the memory workspace and index tier (0080)
- export and import (B11–B17); backups; the twin envelope (0081)
- scenario kinds (0058); warning levels (0061); reopen / invalidation (0078); the series-cache removal
- the B22 attention rows; evaluation status (0066); the agent budget stop; dead-letter (0015); the trust anchor (0073/0074)

B23's records step checks each against the code and moves a row only with evidence. A mechanically computed label is never itself a verification result.

## 3. The stages

There are 78 fixed IDs. Full detail is in `STAGES.csv`.

**Lanes:**

| Lane | Scope |
|---|---|
| B | Interfaces and the decision spine |
| A | Observation, intelligence and knowledge |
| C | Agents, learning and marketplaces |
| D | Platform trust, infrastructure and profile software |
| E | Experience |
| F | Commercial, interoperability and governance |
| H | Hardening (M2) |
| R | Deployment readiness (M4) |

B100–B112 carry the construction moved forward from H1–H3 and R1–R3 (PLAN-F1). Effort is in U (§5.1).

### 3.1 B23 and the B22 deferrals

**B23: interface completion** (A1; own effort 1.5–2.5 U). B23 **completes no feature group**. It advances F-P6-07, F-P6-14, F-P1-09, F-P3-16, F-P3-08, F-P4-08 and F-P6-12, whose other remaining clauses stay open.

**Completion conditions** (clause level, as recorded in STAGES.csv):

1. **L10-I02 bound.** MaterialChangeRaised@v1 is published transactionally, carrying consequence, confidence, urgency and the attention-policy version. Delivery is at-least-once with consumer de-duplication and a checkpoint; an invalid event is quarantined; the committed publication is reconciled. Each point is proven by a focused harness case: positive, duplicate, quarantine, reconcile.
2. **L10-I03 bound.** ReviewConvened@v1 is opened around a declared objective, decision, scenario, commitment or outcome by a named human. Delivery, de-duplication and quarantine follow L10-I02.
3. **L1-I02 bound.** Acquire gains its stream form: at-least-once segments under a stable partition key, backpressure, resume from a cursor, and an explicit incomplete range. The existing command form is unchanged.
4. **L3-I02 bound.** One purpose-bound RetrieveContext query returns policy-filtered memory with explanation links. It changes no state, states its revision and staleness explicitly, and returns a partial or stale answer only with the declared product state.
5. **L4-I02 bound.** CommitGraphRevision applies an atomic, validated change set of nodes, edges, ontology references and provenance. Acceptance is idempotent with one authoritative effect; a conflict is rejected; a retry is accepted only under the same idempotency key.
6. **L7-I02 bound.** BranchScenario adds a versioned upside, downside, disruption or user-defined branch after the scenario's declaration. It is idempotent, and a conflict is rejected.
7. **BRF@v2.** The briefing gains its attention section; v1 readers are unaffected.
8. **The register.** Asserted at 50 / 0 / 0 in the migration and in the pinned tests.
9. **Stale rows.** The 49 candidates are each checked against the code: moved with evidence, or kept with the reason recorded.
10. **Gates and the demonstration.** The required gates pass locally. act-b23 scenes B23-1…B23-7 hold on the rehearsal copy and then on `eye_demo`. The hosted ci and C19 runs complete successfully. One records commit.

**The act's scenes (B23-1…B23-7):**

- **B23-1.** A Bab el-Mandeb closure bulletin moves the corridor warning. MaterialChangeRaised is routed to the COO first; a duplicate delivery changes nothing; a malformed event is quarantined.
- **B23-2.** L. Brandt convenes a review of the dual-sourcing package.
- **B23-3.** The corridor feed is acquired as a stream: backpressure, then an interrupt and a resume from the cursor, with an explicit incomplete range.
- **B23-4.** A. Hoffmann's purpose-bound context query returns a declared partial answer when a projection is withdrawn.
- **B23-5.** K. Müller's graph change set is atomic: a conflict is refused and an idempotent retry returns the first result.
- **B23-6.** N. Eriksen adds a "regional blockade" branch after the scenario's declaration.
- **B23-7.** The weekly briefing carries the attention section.

**B24: attention completion** (completes F-P6-07). It takes every B22 deferral:

- the timer host for escalation;
- the delivery port with receipts and a synthetic channel (real providers: D6);
- the remaining materiality dimensions and the overload rule;
- suppression approval, delegation and queue evaluation;
- markers that constrain decision-active use;
- the observations consumer's selected plan, executed by the existing extraction service (richer document plans arrive in B46).

AU-MEM-0067 is resolved per object in **B54**, with no waiver.

### 3.2 Every stage (generated from STAGES.csv and the model; 3 accounts, expected rate)

Feature IDs are shown without the `F-` prefix. The stages are listed in plan order; the dates come from the model.

<!-- model:stages:begin -->
| Stage | Lane | Title | Completes | Verifies | Depends on | Effort (U) | Owner | Start → merged |
|---|---|---|---|---|---|---|---|---|
| B23 | B | Interface completion: MaterialChangeRaised, ReviewConvened, the Acquire stream, RetrieveContext, CommitGraphRevision, BranchScenario; BRF@v2; the register 50/0/0 | — (advances P6-07, P6-14, P1-09, P3-16, P3-08, P4-08, P6-12) | — | — | 1.5–2.5 | A1 | 2026-09-28 → 2026-10-01 |
| B24 | B | Attention completion (the B22 deferrals) | P6-07 | — | B23 | 1.5–3 | A1 | 2026-09-30 → 2026-10-06 |
| B25 | B | Forecasting portfolio I: grounded context, multi-method horizons, ensembles | P4-01, P4-02, P4-03 | — | — | 6–10 | A1 | 2027-02-17 → 2027-03-05 |
| B26 | B | Forecasting portfolio II: explanation, fitness/refresh/scoring, review workspace | P4-04, P4-05, P4-06 | — | B25 | 4–7 | A1 | 2027-06-11 → 2027-06-23 |
| B27 | B | Scenario anatomy, sets and coherence | P4-07, P4-08, P4-09 | — | — | 5–8.5 | A1 | 2026-12-23 → 2027-01-05 |
| B28 | B | Stream processing, weak-signal workbench, early-warning lifecycle | P4-10, P4-11, P4-12 | — | B24 | 7–12.5 | A1 | 2026-10-05 → 2026-10-22 |
| B29 | B | Twin families, composition and simulation methods | P5-01, P5-05 | — | — | 7–12 | A1 | 2026-10-21 → 2026-11-06 |
| B30 | B | Twin state, reconciliation, envelope and calibration | P5-02, P5-03, P5-04 | — | B29 | 5.5–9.5 | A1 | 2027-03-11 → 2027-03-26 |
| B31 | B | Simulation orchestration, impact analysis, validity | P5-06, P5-07, P5-09 | — | B29 | 4.75–8.25 | A1 | 2027-01-04 → 2027-01-15 |
| B32 | B | Strategy Graph, risk and opportunity, Strategic Health Score | P4-13, P6-08, P6-09 | — | B28 | 7–12 | A1 | 2026-11-05 → 2026-11-23 |
| B33 | B | Supply-chain intelligence and domain packages | P4-14, P4-15 | — | B28, B29, B32 | 7.5–13 | A1 | 2027-04-14 → 2027-05-04 |
| B34 | B | Durable workflow, human gates and commitments | P6-04, P6-05, P6-14 | — | — | 7–12 | A1 | 2026-11-23 → 2026-12-09 |
| B35 | B | Decision analysis, recommendation, explanation/appeal, replay | P6-01, P6-02, P6-03, P6-06 | — | B27, B31, B32 | 8.5–13.5 | A1 | 2027-03-25 → 2027-04-15 |
| B36 | B | Strategic planning, executive home, briefing v2 completion, publishing | P6-10, P6-11, P6-12, P6-13 | — | B24, B32, B34 | 9–15 | A1 | 2027-01-14 → 2027-02-05 |
| B40 | A | Source platform: registry/rights, vault, intake sandbox, acquisition policy, connector runtime | P1-01, P1-02, P1-03, P1-04, P1-12 | — | — | 7.5–14 | A2 | 2026-10-13 → 2026-11-06 |
| B41 | A | Source health, quality SLOs, collection planning | P1-13, P1-14, P1-15 | — | B40, B55 | 6.5–11.5 | A2 | 2027-05-11 → 2027-06-01 |
| B42 | A | Public-source connectors, bulk/secure transfer, licensed-feed adapters | P1-05, P1-06, P1-11 | — | B40, B43 | 8.5–17 | A2 | 2026-12-29 → 2027-02-03 |
| B43 | A | Event/stream/telemetry ingestion and edge collection | P1-09, P1-10 | — | B40 | 6–11 | A2 | 2026-12-02 → 2026-12-23 |
| B44 | A | Enterprise applications/CDC, crawler/search, intake agents | P1-07, P1-08, P1-16 | — | B40, B42, B46 | 8.5–16 | A2 | 2027-03-09 → 2027-04-13 |
| B45 | A | Model fabric: registry, evaluation harness, provider adapters, routing, inference security | P2-01, P2-02, P2-03, P2-04, P2-15 | — | — | 10–18.5 | A2 | 2026-10-29 → 2026-11-23 |
| B46 | A | Documents: parsing/OCR/chunking, language/normalization, NER and events | P2-06, P2-08, P2-09 | — | B40, B45, B51 | 7.5–13 | A2 | 2026-12-15 → 2027-01-05 |
| B47 | A | Media intelligence: image, audio, video, geospatial | P2-07 | — | B45, B46 | 3–6 | A3 | 2027-06-15 → 2027-06-30 |
| B48 | A | Contradiction/corroboration, calibration, object inspector | P2-10, P2-14, P2-16 | — | B45, B46 | 5.5–10 | A2 | 2027-01-18 → 2027-02-04 |
| B49 | A | Assessments, summaries, analyst review, context manifests | P2-11, P2-12, P2-13, P2-17 | — | B45, B48, B53 | 7–12 | A2 | 2027-03-25 → 2027-04-14 |
| B50 | A | Knowledge core: canonical headers, lifecycle, provenance, timeline, correction closure | P3-01, P3-02, P3-03, P3-04, P3-05 | — | — | 8.25–14.5 | A2 | 2026-09-28 → 2026-10-21 |
| B51 | A | Ontology, atomic graph revisions, graph reasoning | P3-07, P3-08, P3-09 | — | B50 | 6.5–11.5 | A2 | 2026-11-18 → 2026-12-09 |
| B52 | A | Entity resolution and graph curation workspace | P3-10, P3-12 | — | B46, B51 | 4.5–7.5 | A2 | 2027-06-04 → 2027-06-22 |
| B53 | A | Hybrid semantic retrieval and context assembly | P3-15, P3-16 | — | B45, B51 | 5.5–9 | A2 | 2027-01-28 → 2027-02-17 |
| B54 | A | Enterprise Memory completion and retention across derivatives | P3-06, P3-14 | — | B50, B53 | 4–7.5 | A2 | 2027-06-14 → 2027-06-30 |
| B55 | A | Strategy Graph alignment diagnostics and research workspace | P3-13, P3-17 | — | B44, B49, B51, B53 | 4–7 | A2 | 2027-05-04 → 2027-05-19 |
| B60 | D | Canonical contracts and the state-class platform | P7D-14, P7D-15 | — | — | 7–12 | A3 | 2026-10-27 → 2026-11-20 |
| B61 | D | Identity federation/MFA/privileged access; keys, secrets, encryption | P7D-01, P7D-03 | — | — | 6–10 | A3 | 2026-11-10 → 2026-11-24 |
| B62 | D | Policy bundles, privacy lifecycle, residency and sovereignty | P7D-04, P7D-05, P7D-06 | — | B61 | 7–10 | A3 | 2027-01-19 → 2027-02-05 |
| B63 | D | Telemetry/tracing, degraded modes and service health, isolation and quotas | P7D-07, P7D-08, P7D-11 | — | — | 6–10 | A3 | 2026-12-02 → 2026-12-23 |
| B64 | D | SLOs, error budgets; backup, PITR and restore verification | P7D-09, P7D-12 | — | B60, B61, B63 | 5–8 | A3 | 2027-01-08 → 2027-02-04 |
| B65 | D | Packaging/installer/management plane; signed releases, upgrade, rollback | P7D-16, P7D-17 | — | B60, B61 | 6–10 | A3 | 2026-12-29 → 2027-01-15 |
| B66 | D | Security detection, incident command; trust and audit investigation | P7D-18, P7D-19 | — | B61, B63, B65 | 4.5–6.5 | A3 | 2027-04-01 → 2027-04-14 |
| B67 | D | Disconnected and air-gapped operation | P7D-20 | — | B61, B65 | 3–5 | A3 | 2027-02-18 → 2027-03-03 |
| B70 | C | Agent runtime: packages/admission, durable workflow, message contracts, tool gateway, sandbox | P7A-01, P7A-02, P7A-05, P7A-07, P7A-08 | — | — | 7.75–14 | A2 | 2027-02-08 → 2027-03-04 |
| B71 | C | Planner, supervisor, checkpoints and agent control | P7A-03, P7A-04, P7A-06, P7A-10 | — | B70 | 6–10.5 | A2 | 2027-04-08 → 2027-05-03 |
| B72 | C | Agent Operations workspace and supervision surfaces | P7A-11, P7A-12 | — | B71 | 3.5–5.5 | A3 | 2027-06-22 → 2027-07-02 |
| B73 | C | Specialist agent families (observation, extraction, graph/memory/reasoning, foresight) | P7A-13, P7A-14, P7A-15, P7A-16 | — | B70, B71, B74 | 6–10 | A2 | 2027-05-25 → 2027-06-11 |
| B74 | C | Evaluation foundation: datasets, registry, metrics, AI inventory | P7B-03, P7B-04, P7B-05, P7B-10 | — | — | 6.5–10.5 | A2 | 2027-02-24 → 2027-03-12 |
| B75 | C | Monitoring, red-team suites, release/canary/rollback, evaluator models | P7B-06, P7B-07, P7B-08, P7B-09 | — | B70, B74 | 6.25–10.5 | A2 | 2027-04-21 → 2027-05-18 |
| B76 | C | The Learn stage: lessons, attribution, governance console, incidents, loop closure | P7B-01, P7B-02, P7B-11, P7B-12, P7B-13 | — | B71, B74, B75 | 6.5–10.5 | A3 | 2027-05-21 → 2027-06-10 |
| B77 | C | Marketplace core: signed packages, admission, revocation, agent marketplace | P7C-01, P7C-02, P7C-03, P7C-04 | — | B70, B74 | 6–10 | A3 | 2027-04-15 → 2027-05-04 |
| B78 | C | Scenario/data marketplaces, domain packs, decision templates, domain agents | P7A-17, P7C-05, P7C-06, P7C-07, P7C-08 | — | B70, B71, B77 | 9–15 | A3 | 2027-05-04 → 2027-05-31 |
| B80 | E | Shell and foundations: tokens, component library, navigation | P7-E-01, P7-E-03, P7-E-05 | — | — | 6–9.5 | A3 | 2026-09-28 → 2026-10-21 |
| B81 | E | Interaction patterns: human authority, degraded states, content, object pages, layout, command palette | P7-E-02, P7-E-04, P7-E-06, P7-E-18, P7-E-19, P7-E-20 | — | B80 | 9.5–15.5 | A3 | 2026-10-08 → 2026-11-05 |
| B82 | E | Visualization library and the trust/provenance experience | P7-E-07, P7-E-21 | — | B80, B81 | 5.5–9 | A3 | 2026-11-20 → 2026-12-08 |
| B83 | E | Knowledge and foresight workspaces | P7-E-13, P7-E-14 | — | B81, B82 | 6–10 | A3 | 2027-02-01 → 2027-02-17 |
| B84 | E | Decision/briefing/publishing UX, attention center, governance administration | P7-E-12, P7-E-15, P7-E-16 | — | B80, B81, B82 | 8–13 | A3 | 2026-12-14 → 2027-01-04 |
| B85 | E | Personas and executive home; localization build | P7-E-09, P7-E-11 | — | B80, B81, B83, B84 | 5–9 | A3 | 2027-03-12 → 2027-03-25 |
| B86 | E | Mobile, field, offline | P7-E-10 | — | B80, B81, B84 | 5–8 | A3 | 2027-03-23 → 2027-04-13 |
| B90 | F | Data products, semantic metrics, metadata catalog | P7-09, P7-10, P7-11 | — | — | 6.5–10.5 | A1 | 2026-12-08 → 2026-12-24 |
| B91 | F | Usage metering, cost ledger, entitlements and licensing | P7-01, P7-02 | — | — | 5–9 | A1 | 2027-02-04 → 2027-02-18 |
| B92 | F | Product analytics and UX telemetry | P7-03 | — | B90 | 3–5 | A1 | 2027-03-04 → 2027-03-12 |
| B93 | F | Integration center, APIs/SDKs/webhooks; exit package completion | P7-07, P7-08 | — | B84, B90 | 4.5–8 | A1 | 2027-05-31 → 2027-06-14 |
| B94 | F | Onboarding/migration, service management/support, adoption | P7-04, P7-05, P7-06 | — | B84, B91, B92 | 8–11 | A1 | 2027-05-03 → 2027-05-20 |
| B100 | B | Contract envelope, configuration and exception governance, projection freshness, the authority-role taxonomy | R0-02, R0-03, P4-16, P6-16 | — | B60 | 2.75–5.5 | A1 | 2027-06-22 → 2027-07-02 |
| B101 | A | Knowledge quality and freshness monitoring with remediation | P3-11 | — | B51, B52 | 1.25–2.5 | A2 | 2027-06-22 → 2027-07-01 |
| B102 | C | Inference admission and budgets, the economics ledger and the serving cell | P2-05 | — | B45 | 1–2 | A3 | 2027-06-03 → 2027-06-11 |
| B103 | D | Workload identity, internal mTLS, network zones, governed egress and ingress, trusted time; API abuse controls and vulnerability exposure | R0-05, P7D-02 | — | B61, B65 | 3–5.25 | A3 | 2027-02-11 → 2027-03-03 |
| B104 | D | Workload classes and manifests, the load/soak harness, the capacity model and shedding, cost and accelerator governance software | P7D-10 | — | B63, B64, B65 | 1.25–2.5 | A3 | 2027-04-13 → 2027-05-03 |
| B105 | D | Replicated state, fencing and failover, the availability and DR controllers on compose/kind | P7D-13 | — | B60, B64, B65 | 1.5–3 | A3 | 2027-02-24 → 2027-03-04 |
| B106 | D | The deployment-profile catalog and the cross-profile conformance runner (compose vs kind) | P7D-23 | — | B65 | 1.25–2 | A3 | 2027-02-26 → 2027-03-05 |
| B107 | F | Governance registries, traceability and conformance manifests; the product-governance workspace; design governance; acceptance records | R0-04, P7D-25, P7-E-17, P7-12 | — | B64, B65, B92 | 4.75–8 | A1 | 2027-05-19 → 2027-06-01 |
| B108 | E | Accessibility software: automated and keyboard-only journey suites, preferences, timeouts, target size, live regions, accessible exports, governance | P7-E-08 | — | B80, B81, B82 | 2–3 | A3 | 2027-04-09 → 2027-04-15 |
| B109 | D | Profile manifests, desired/observed reconciliation and admission gates: observation, model serving, graph and index | P1-17, P2-18, P3-18 | — | B40, B43, B45, B51, B53, B65, B102, B106 | 4.5–8.5 | A3 | 2027-06-04 → 2027-06-22 |
| B110 | D | Profile manifests, desired/observed reconciliation and admission gates: twins/solvers, executive workflow, agent runtime | P5-08, P6-15, P7A-09 | — | B30, B31, B34, B36, B70, B71, B106 | 3–6 | A3 | 2027-04-28 → 2027-05-19 |
| B111 | D | The SaaS cell and placement service, the private-cloud/on-prem site packages and control bridge, the per-capability golden journeys — built and run locally | P7D-21, P7D-22, P7D-24 | — | B61, B62, B64, B65, B67, B103, B105, B106 | 5.5–10 | A3 | 2027-03-02 → 2027-03-25 |
| B112 | F | Marketplace commerce software: usage receipts, licence and entitlement enforcement, take-rate accounting, disputes | P7C-09 | — | B77, B91 | 0.5–1 | A2 | 2027-06-24 → 2027-07-01 |
| H1 | H | Comprehensive verification I: contracts, envelopes, freshness, header conformance, knowledge quality, inference serving at realistic load; the carried timing items | — | R0-02, R0-03, R0-05, P2-05, P3-01, P3-11, P4-16 | M1 | 2.5–5 | A1+A2+A3 | 2027-07-02 → 2027-07-12 |
| H2 | H | Comprehensive verification II: identity/network probes and drift, capacity/soak evidence, HA/DR drills, compose-vs-kind parity, agent containment and escape exercises | — | P7A-08, P7D-02, P7D-10, P7D-13, P7D-23, P7D-25 | M1 | 3–5.5 | A1+A2+A3 | 2027-07-02 → 2027-07-13 |
| H3 | H | Experience and governance acceptance: WCAG audit and assistive-technology testing, usability studies, design and product-governance acceptance by named authorities, independent adversarial review | P7-13 | P7B-07, P7-E-08, P7-E-17, P7-12 | M1 | 2.5–4.75 | A1+A2+A3 | 2027-07-02 → 2027-07-12 |
| R1 | R | Deployment profiles installed and certified on real SaaS, private-cloud and on-premise infrastructure; parity on every profile | — | P1-17, P2-18, P3-18, P5-08, P6-15, P7A-09, P7D-21, P7D-22, P7D-24 | H1, H2, H3 | 9–17.5 | owner + A1 | externally gated |
| R2 | R | Production proof of the loop and attested acceptance records | R0-06 | R0-04 | H1, H2, H3 | 1.5–4 | owner + A1 | externally gated |
| R3 | R | Commercial, marketplace commerce and investor package proof | P7-14, P7-15, P7-16 | P7C-09 | H1, H2, H3 | 1.75–3.75 | owner + A1 | externally gated |
<!-- model:stages:end -->

**Completion conditions.** Every implementation stage other than B23 carries the same conditions in STAGES.csv:

- the completing groups' remaining clauses are implemented and demonstrated locally;
- a focused harness per clause (positive, refusal, recovery);
- the required gates pass;
- the stage's act holds on the rehearsal copy and then on `eye_demo`;
- once B106 has merged, the stage's golden journey is added to the conformance runner;
- the hosted ci and C19 runs complete successfully;
- the tracker rows are moved with evidence;
- the coordinator merges on the owner's word.

**H stages:** the verifying groups' comprehensive checks run with evidence, and findings are corrected forward. H1 also closes the carried timing items. H3 also records F-P7-F-13's constitution.

**R stages:** the external prerequisite is in hand, the verifying groups are proven on the real infrastructure or with the real counterparty, and the owner accepts.

Comprehensive hardening follows implementation. Every stage still keeps the existing required gates and focused checks for the behavior it ships.

## 4. Dependencies

Stage dependencies are **derived** by the checker from the completing groups' `depends_on` (the stage completing each dependency; `pkg:P7-D` maps to B65), plus explicit extras (B24 → B23). H depends on all of M1; R depends on H1–H3 and its external prerequisites. The full edge list is in the `depends_on` column of §3.2.

<!-- model:chain:begin -->
Longest precedence chain by midpoint effort: **B50 → B51 → B46 → B48 → B49 → B55 → B41** = 62.38 U — a lower bound on M1 whatever the account count (≈ 52 working days at r=1.5 ×1.25 with no waits). The resource-limited 3-account finish (expected) is **B72**, merged 2027-07-02. A slip on the precedence chain moves M1 only while that chain is also the resource-limited path; this model does not establish that it is.
<!-- model:chain:end -->

The first wave's structure: lane A's knowledge core (B50) heads the longest chain; lane B's interfaces (B23 → B24 → B28 → B32 → B36) carry the decision spine; lanes D and E start independently (B80, B60, B61). The profile software (B106 → B109 / B110 / B111) needs most of the product before it, so it sits late in M1.

## 5. Schedule

### 5.1 The unit and its calibration

**The unit (one definition throughout).** **1 U** = the scope of one CP-6 batch of B21/B22 size: design → migration(s) → API → harness → web → act → records → hosted run. It is the unit the characterization estimated every feature in.

The baseline wrongly paired that unit with a rate of "3 units per account-day". That rate came from the pace of the smaller B13–B19 batches, not from this unit.

**The rate** r is U per account working day: a working day in which an account's session is active, with session and usage limits inside it.

**Calibration from B18–B22** (commit timestamps; elapsed session time from the previous batch's records commit, or the last integration commit before the batch, to its own records commit):

| Batch | Size (U) | Elapsed | Included |
|---|---|---|---|
| B18 (0078; with B18.1) | 1.0 | 8.3 h (09-16 18:47 → 09-17 03:03) | the #53/#54 merges |
| B19 (0079) | 0.75 | 3.0 h (09-17 03:03 → 06:00) | — |
| B20 (0080) | 1.0 | not measurable | its start is not recorded in commits (C15 maintenance interleaved) |
| B21 (0081) | 1.0 (definition) | 12.3 h (09-24 00:39 → 13:00) | the B20-F1 correction |
| B22 (0082, 0083) | 1.0 (definition) | 9.2 h (09-24 13:00 → 22:10) | #59's merge chain and the demo containers' return |

The sizes of B18–B20 are the integrator's retro-estimate against the definition. Two views of the pace:

- **Session time:** about 3.75 U in about 32.8 session-hours, so **≈ 8.7 h per U**.
- **Calendar:** across the 7 working days 2026-09-16 … 09-24, B14–B22 delivered about 8 U, together with C15 maintenance, about nine merges and a multi-day owner-review wait. That is ≈ 1.1 U per working day gross. On fully active days it reached 2–3 U (09-16: B14–B17; 09-24: B21, B22).

**Rates used:**

| Case | U per account working day |
|---|---|
| **Expected** | **1.5** |
| Optimistic | 2.0 |
| Conservative | 1.0 |

Owner-approval waits are now simulated separately, so the expected rate sits above the 1.1 gross figure and below the best days.

The per-feature estimates themselves were made in U without a task decomposition. After B23 and the first A2/A3 stages, their actual U versus estimate is recorded and the rate is re-fitted (§9).

### 5.2 What the model simulates, and what it does not

**Simulated as resources:**

- the accounts and their lanes, with **first assignments pinned** (A1: B23 then B24; A2: B50; A3: B80; with four accounts, A3: B70 and A4: B80);
- stacking: a stage starts once its dependencies are implemented;
- **two heavy-verification slots**: the last 0.15 day of each stage and the heavy part of each integration hold one; with no slot free, the account waits;
- **one coordinator**: 0.5 day per integration, serialized, starting only once the stage's dependencies are merged;
- **the owner's approval**: 1 working day from integration to merge, occupying no one;
- H1–H3 after M1.

**Not simulated; absorbed in constants:**

| Factor | Absorbed in |
|---|---|
| Review findings and their corrections | ×1.25 contingency |
| Session and usage limits | the calibrated rate |
| Shared-file conflicts and rebase churn | account efficiency 1.0 / 0.9 / 0.8 / 0.7 for 1–4 accounts (an assumption, not measured) |
| Holidays; hosted-CI queueing | none |

**Not scheduled at all:** M3 (final acceptance) and R1–R3 / M4.

<!-- model:comparison:begin -->
| Accounts | optimistic r=2.0 | **expected r=1.5** | conservative r=1.0 | M2 at expected | Stage finishing M1 (expected) |
|---|---|---|---|---|---|
| 1 | 2028-02-25 | **2028-07-31** | 2029-06-04 | 2028-08-16 | B112 (A1) |
| 2 | 2027-07-09 | **2027-10-04** | 2028-03-24 | 2027-10-15 | B101 (A2) |
| 3 | 2027-04-30 | **2027-07-02** | 2027-11-08 | 2027-07-13 | B72 (A3) |
| 4 | 2027-03-29 | **2027-05-21** | 2027-09-10 | 2027-06-01 | B110 (A3) |
<!-- model:comparison:end -->

Four accounts are not four times one. The single coordinator, the owner's approval, the two heavy slots, the lane-A chain and account efficiency cap the gain. **The model does not justify buying a fourth account or a second machine for its few weeks' gain** (compare rows 3 and 4). An additional account remains the owner's allocation decision (D3).

### 5.3 The 3-account sequence (provisional)

<!-- model:accounts:begin -->
| Account | Sequence, 3 accounts at the expected rate (start → merged) |
|---|---|
| A1 | B23 (26-09-28→26-10-01) → B24 (26-09-30→26-10-06) → B28 (26-10-05→26-10-22) → B29 (26-10-21→26-11-06) → B32 (26-11-05→26-11-23) → B34 (26-11-23→26-12-09) → B90 (26-12-08→26-12-24) → B27 (26-12-23→27-01-05) → B31 (27-01-04→27-01-15) → B36 (27-01-14→27-02-05) → B91 (27-02-04→27-02-18) → B25 (27-02-17→27-03-05) → B92 (27-03-04→27-03-12) → B30 (27-03-11→27-03-26) → B35 (27-03-25→27-04-15) → B33 (27-04-14→27-05-04) → B94 (27-05-03→27-05-20) → B107 (27-05-19→27-06-01) → B93 (27-05-31→27-06-14) → B26 (27-06-11→27-06-23) → B100 (27-06-22→27-07-02) |
| A2 | B50 (26-09-28→26-10-21) → B40 (26-10-13→26-11-06) → B45 (26-10-29→26-11-23) → B51 (26-11-18→26-12-09) → B43 (26-12-02→26-12-23) → B46 (26-12-15→27-01-05) → B42 (26-12-29→27-02-03) → B48 (27-01-18→27-02-04) → B53 (27-01-28→27-02-17) → B70 (27-02-08→27-03-04) → B74 (27-02-24→27-03-12) → B44 (27-03-09→27-04-13) → B49 (27-03-25→27-04-14) → B71 (27-04-08→27-05-03) → B75 (27-04-21→27-05-18) → B55 (27-05-04→27-05-19) → B41 (27-05-11→27-06-01) → B73 (27-05-25→27-06-11) → B52 (27-06-04→27-06-22) → B54 (27-06-14→27-06-30) → B101 (27-06-22→27-07-01) → B112 (27-06-24→27-07-01) |
| A3 | B80 (26-09-28→26-10-21) → B81 (26-10-08→26-11-05) → B60 (26-10-27→26-11-20) → B61 (26-11-10→26-11-24) → B82 (26-11-20→26-12-08) → B63 (26-12-02→26-12-23) → B84 (26-12-14→27-01-04) → B65 (26-12-29→27-01-15) → B64 (27-01-08→27-02-04) → B62 (27-01-19→27-02-05) → B83 (27-02-01→27-02-17) → B103 (27-02-11→27-03-03) → B67 (27-02-18→27-03-03) → B105 (27-02-24→27-03-04) → B106 (27-02-26→27-03-05) → B111 (27-03-02→27-03-25) → B85 (27-03-12→27-03-25) → B86 (27-03-23→27-04-13) → B66 (27-04-01→27-04-14) → B108 (27-04-09→27-04-15) → B104 (27-04-13→27-05-03) → B77 (27-04-15→27-05-04) → B110 (27-04-28→27-05-19) → B78 (27-05-04→27-05-31) → B76 (27-05-21→27-06-10) → B102 (27-06-03→27-06-11) → B109 (27-06-04→27-06-22) → B47 (27-06-15→27-06-30) → B72 (27-06-22→27-07-02) |
<!-- model:accounts:end -->

Overlapping windows are stacking: an account implements its next stage while the previous one waits for integration or approval. "Help" stages outside an account's lanes are assigned by the coordinator when the account's own lanes have nothing ready.

## 6. Safe parallel execution

### 6.1 Isolation per account

| Resource | A1 (coordinator) | A2 | A3 | A4 (only if allocated) |
|---|---|---|---|---|
| Worktree | the main checkout | `.claude/worktrees/a2-<stage>` | `.claude/worktrees/a3-<stage>` | `.claude/worktrees/a4-<stage>` |
| Branch prefix | `phase6-b<nn>` / `b/…`, `records/…` | `a/<stage>-…` | `d/…`, `e/…` | `c/…` |
| Scratch databases | `eye_verify_a1_*` | `eye_verify_a2_*` | `eye_verify_a3_*` | `eye_verify_a4_*` |
| Redis | the demo Redis (:6379) is **the demonstration's only**; A1 verifies on :6393 | :6394 | :6395 | :6396 |
| Vault root | `.eye-local/vault` (demo only) / `~/.eye-verify/a1/vault` | `~/.eye-verify/a2/vault` | `~/.eye-verify/a3/vault` | `~/.eye-verify/a4/vault` |
| API / web ports | 3411 / 3100 (3401 / 3000 are the demo's) | 3412 / 3102 | 3413 / 3103 | 3414 / 3104 |

**The heavy-verification limiter.** Every heavy run (the full integration suite, the browser suites, a kind/k3d cluster run) is wrapped:

```bash
scripts/dev/heavy-slot.sh <account>-<stage> -- pnpm --filter @eye/api test:int:all
```

- **Slots.** At most **two** are held on this host at once (mkdir-atomic slots under `~/.eye-verify/slots`). Other callers wait; `--status` lists the holders.
- **Stale slots.** A slot is kept while its wrapper or the command it started still runs. It is reclaimed only when both have ended.
- **Verified.** The five cases pass (`scripts/dev/heavy-slot.test.sh`): two of four concurrent, exit status passed through, SIGTERM stops the command, a SIGKILLed wrapper's running command keeps its slot, stale reclaim.
- **Host-local.** An account on another machine or a cloud session runs its heavy suites on its own host (with its own limiter) or on hosted CI, never against this host's databases or Redis. Cross-host work meets only through git and the coordinator's integration.

**Rules:**

1. **Only A1 touches `eye_demo`**, the demo API and web, the demo Redis and `.eye-local/`. Others rehearse on a restored copy under their own prefix, with their own Redis and a vault clone. The copy shares tenant and domain ids, so it must never share the demo Redis.
2. **An account drops only the scratch databases it created** for a run, once that run's evidence is written. The ~229 older databases stay until their ownership and any retained evidence are established. Backups and historical evidence are preserved.
3. **Never print or type a credential.** The owner's backup passphrase and the Comtrade key are not on this host; do not search for them.

### 6.2 Shared files: ownership

A1 is the only writer on the integration branch of:

- **The records:** `audit/CP6_BATCHES.md`, `PHASE6_REPORT.md`, `FULL_PRODUCT_DELIVERY_REGISTER.md`, `audit/requirements/*.csv`, `audit/acceptance-units/*.csv`, `audit/SUMMARY.md` and `summary.json`, `audit/delivery/*`, `docs/ops/DEMONSTRATION_RUNBOOK.md`, the evidence indexes.
- **The code hotspots:** `pdp.service.ts` (the first-match-wins order), `observation-errors.ts`, `graph-change.ts` METHOD_REFs, the interface-register pin tests, `scripts/phase1/verify-0022-upgrade.mjs`, the web nav layouts.

Streams append inside a delimited `/* <stage> */` block and list each edit in the PR body; A1 resolves the order.

### 6.3 Migration names (dependency-safe)

**Why the baseline's rule was wrong.** The runner (`apps/api/scripts/migrate.mjs`) applies `.sql` files **in filename order** and keys its ledger (`public.schema_migrations`) **by filename**, locking each file's digest. The baseline derived provisional names from stage numbers, which can reverse a dependency: B46 depends on B51, yet `9046_…` sorts before `9051_…`. Renaming an applied file makes the runner execute the same content again under the new name. The corrected rules:

1. **Provisional names are issued by the coordinator, in start order.** When a stage starts, A1 issues the next sequence number from `audit/delivery/MIGRATION_LEDGER.csv`: `9001`, `9002`, … The file is `9NNN_<stage>_<slug>.sql`, with an `a`/`b`/… suffix for a second file. A dependent stage starts only after its parent is implemented, so its number is always higher, and filename order respects every dependency. Provisional files sort after every real migration and apply only to that account's disposable databases.
2. **Final names are frozen at integration, before candidate verification.** A1 renames the stage's files to the next free `00NN` above `main` and updates the pins (migration and role counts), before running the candidate's full verification, rehearsing the act or touching `eye_demo`. A stage integrates only after its dependencies have merged, so final numbers also respect every dependency.
3. **After a rename, rebuild; never rewrite.** Every disposable database that applied the old name is dropped and rebuilt from scratch: the stream's own databases, and those of any stream stacked on it after it rebases. A shared or demo ledger is never edited. A provisional name never reaches `eye_demo` or any shared database.
4. **No shared re-declarations.** A stream never re-declares a function that another open stream re-declares (for example `objects.outbox_lease`, `ctx.build`) without A1 serializing the two stages.
5. **Register assertions** (interface register, catalog pins) are asserted in the integration commit.
6. **The coordinator's own stage** may take its final name at start when no other stream is open (recorded in the ledger). This is B23's case.

### 6.4 The integration coordinator (A1)

For each ready stage, one at a time:

1. Rebase onto `main` once the stage's dependencies have merged.
2. **Freeze the final migration name** (§6.3).
3. Apply the shared-file proposals.
4. Run the full local verification **under `heavy-slot.sh`**.
5. Rehearse the act on the copy, then run it on `eye_demo`.
6. Write the records once: `summarise.mjs`, then `summarise-units.mjs`, then the controls, after the last CSV edit; then `feature-tracker.mjs --write` and its check.
7. Push. Watch ci and C19 until **completed success**; pending or timed-out is never success.
8. Ask the owner for the merge word; merge only with zero pending and zero failing checks.
9. Complete the C17/C19 chain. On `main`, a full re-run only, never `--failed`.
10. Tell the other streams to rebase, and rebuild their disposable databases if a parent was renamed.

No records-refresh chain.

## 7. Decisions that genuinely need the owner

| # | Decision | What it blocks | Proceeds without it |
|---|---|---|---|
| D1 | **Merge cadence.** Per-PR word (current), or a standing rule: "merge any stage PR whose every required check on the exact head completed successfully and whose act held" | Throughput. The model assumes one working day from integration to merge; longer waits push every dependent merge | Everything. Stages stack and wait |
| D2 | **#60 (B22) merge**, then the planning PR stacked on it | B23's base on `main`. B23 stacks meanwhile | B23 on the stack |
| D3 | **Account allocation.** Recommendation: 3 accounts, §8. A 4th, or heavy runs on another host, needs its own machine or cloud sessions (the limiter is host-local) | Which §5.2 row applies | A1 alone (the 1-account row) |
| D4 | **Source keys and new licensed feeds:** the UN Comtrade key binding; market, satellite and social feeds. **PortWatch is already authorized: no decision** | Completion of F-P1-06 | All of B42's software on public feeds, PortWatch within its recorded conditions, and synthetic fixtures |
| D5 | **Model and compute:** a hosted LLM account with data-processing terms; GPU capacity | Completion of F-P2-01 (hosted adapter), F-P2-05's realistic benchmark, F-P2-07, F-P7D-10's accelerator rows | Local routes and CPU benchmarks |
| D6 | **Notification delivery provider** | The real-channel clauses of F-P6-07, F-P4-12, F-P6-13, F-P7-E-12 | The delivery port, receipts and a synthetic channel |
| D7 | **Evaluation data and people:** held-out labelled data and annotators; domain and human-factors reviewers | Acceptance of F-P2-14/15, F-P4-15, F-P6-03, F-P7A-17, F-P7B-07, F-P7C-07 | Harnesses and synthetic sets |
| D8 | **Profile infrastructure:** cloud (two regions), a private landing zone, an on-prem site, KMS/HSM, confidential computing, on-call | R1 / M4; certification rows of F-P7D-01/03/06/13 | All of M1 and M2 (compose/kind and two local "regions") |
| D9 | **Registry publication:** a GHCR namespace and approval to publish | F-P7D-16's publication clause | B65 builds and signs locally |
| D10 | **Independent assurance:** pentest/red team, WCAG auditor, assistive-technology testers, DPIA/legal, a named model-risk authority | H2/H3 sign-off; F-P7D-05/18, F-P7B-10, F-P7-E-08 | The software and self-tests |
| D11 | **Governance and commercial:** name the councils and owners; issuer approvals, pricing, a pilot customer and acceptance authority | H3's F-P7-F-13; R2; R3 | Everything else |
| D12 | **Arabic translation and counsel** | Completion of F-P7-E-09 | B85's localization build with pseudo-locale and RTL |

AU-MEM-0067 stays open by the owner's word and is resolved in B54 without a waiver: no new decision. The backup passphrase stays with the owner.

## 8. Recommendation and first assignments

**Recommended allocation: three accounts** (D3; nothing is activated by this plan).

| Account | Lanes | First assignment | Status |
|---|---|---|---|
| **A1: coordinator** (the current account) | B, F, integration, records, demo | **B23**, stacked on #60, then **B24** | Starts now |
| **A2** | A, C | **B50**, the knowledge core (heads the longest chain), then B40, B45 | **Prepared**: `audit/delivery/briefs/B50.md`; provisional migration issued at start |
| **A3** | D, E | **B80**, the shell and foundations, then B81 | **Prepared**: `audit/delivery/briefs/B80.md` |

**One account:** A1 runs B23 → B24, then the model's priority order (B50, B40, B45, …).

**Two accounts:**

| Account | Lanes | First assignments |
|---|---|---|
| A1 | B, D, F | B23 → B24 |
| A2 | A, C, E | B50 → … |

Prompts are in `audit/delivery/ACCOUNT_PROMPTS.md`.

## 9. Uncertainty and recalibration

- **Effort ranges** come from a one-pass characterization in U, not a task decomposition. P7-D (1,707 rows) and P7-E (910 rows) carry the widest ranges. The r = 1.0 column bounds the downside.
- **Recalibration.** After B23 and the next two stages completed on this account (the owner's instruction of 2026-09-25: A2/A3 are not allocated), record for each its build interval (active), its hosted-run wait and its review/approval wait separately, and its re-estimated size in U. Then re-fit r, re-run the model and update the provisional dates. Implementation continues meanwhile. After that, re-run monthly (the first working day), or when a stage on the resource-limited path slips more than five working days.
- **M3's duration** is unknown until the in-stage verification rate is seen. **M4** has no date until the external prerequisites exist.
- **Row-to-feature mapping.** Some rows were placed by area and package rather than clause by clause. A misplaced row moves in a records commit; the checker keeps the mapping total.
- **Stale statuses** (§2.5) may move rows in B23; that changes counts, not stages.
- **Observation 1 — B23 (recorded 2026-09-25, corrected the same day after the bounded review; not yet a re-fit).** Three measures, kept apart (UTC, from the commits and the hosted run):

  | Measure | Interval | Duration |
  |---|---|---|
  | Build — plan commit `e579514` (21:40:52) → candidate `a3176c8` (23:40:18) | active: the account worked this whole interval (mapping, five implementers in parallel worktrees, integration, local verification, the act on `eye_demo`) | **1 h 59 min** |
  | Hosted run — push → ci 36073944410 build-test finished (00:05:18) | waiting on CI | ~25 min |
  | Records — hosted finish → records `95dfcdb` (11:31:17) | the session idle until resumed (~11 h, NOT work); the records work itself ~15 min | 11 h 26 min elapsed |
  | Review and approval | the bounded review arrived the same day; no merge yet | open |

  B23 was sized 1.5–2.5 U (≈ 13–22 sequential session-hours at 8.7 h/U); its build took 1 h 59 min of active wall-clock with parallel subagents. The earlier "about 3 hours" mixed the build with the hosted wait and is withdrawn. **The re-fit uses B23 and the next two stages completed on THIS account** (B24, then the next A1 stage), each recorded with the same three measures — not unallocated A2/A3 stages.

- **Observation 2: B24 (recorded 2026-09-25; not yet a re-fit).** The same measures, kept apart (UTC, from the session's messages and the commits):

  | Measure | Interval | Duration |
  |---|---|---|
  | Build: the owner's instruction (14:18:59) → the candidate `8459390` with the demonstration and records (16:58:14) | active the whole interval. Folded in: the review's two residuals (the limiter fix `c0b9d25` at 14:22, B23-F1 by a parallel implementer), the #62 decision and the integration sequence (14:28–14:42). The B24 work itself: the prelude (14:24), five parts in parallel worktrees, the one 0086 combined at 15:06, three full integration runs, four act rehearsals, two act-found corrections, the demonstration and the demo walk | **2 h 39 min** |
  | Hosted run: push → ci 36164184010 finished (17:24:46) | waiting on CI | ~26 min |
  | Review and approval | no merge authorized; the stack's order in `INTEGRATION_SEQUENCE.md` | open |

  B24 was sized 1.5–3 U (≈ 13–26 sequential session-hours at 8.7 h/U). It took 2 h 39 min of active wall-clock with parallel subagents, and some of that was review work, not B24. The act's wall-clock is dominated by designed waits: 8 minutes per run, most of it the database clock and the 60 s tick. **Two of the three observations are now recorded** (B23, B24). The re-fit follows the next A1 stage (B28), per the instruction. The dates stay provisional until then.

## 10. Correction record (the bounded review of `5da4799`, applied 2026-09-25)

| Finding | Disposition |
|---|---|
| **PLAN-F1**: missing software placed after "implementation complete" | Construction moved into M1 stages **B100–B112** (13 new IDs; the existing IDs kept). **H1–H3 and R1–R3 keep only** comprehensive verification, independent assessment and external proof, recorded per group as `verify_stage` / `verify_effort`. Deployment-profile software is built and run locally in B106/B109–B111; real installation and certification stay in R1. Five groups with no software (F-R0-06, F-P7-F-13/14/15/16) keep their H/R completing stage |
| **PLAN-F2**: three milestone mismatches; competing totals; weak checks; B23 generic | F-P3-01 (B50), F-P7A-08 (B70) and F-P7B-07 (B75) are now implementation, with their independent parts in H1/H2/H3. **The stage is authoritative**: the checker derives milestone, owner and date from it and fails on any difference, on a feature not completed by exactly one stage, on effort not adding up (§2.2), on an unreachable dependency and on a cycle. B23 has clause-level completion conditions, scenes B23-1…B23-7 and its own effort, and completes no group |
| **PLAN-F3**: the model reproduces assumptions; unit ambiguity | One unit definition (§5.1) with the B18–B22 calibration table; rate 1.5 U per account working day (2.0 / 1.0 bands) replaces the baseline's 3. The heavy-verification slots and the owner's approval are **simulated**. First assignments are **pinned**. The model schedules M1 and M2 and says it does not date M3/M4. The longest chain is labeled a lower bound, and the resource-limited finish is reported separately. Result: the dates move later (3 accounts: expected about 2027-07 instead of 2027-02). They are provisional and recalibrated after the first stages |
| **PLAN-F4**: stage-numbered provisional migrations can reverse dependencies; the lock was a convention | Provisional names are coordinator-issued in start order (`MIGRATION_LEDGER.csv`). Final names are frozen at integration, before candidate verification and before any shared or demo application. Rebuild, never rewrite. `scripts/dev/heavy-slot.sh` implements two slots (tested, host-local; cross-host rule stated). The old databases are not bulk-dropped |
| **PortWatch** | Authorized; removed from D4 and from F-P1-06's prerequisites (the Comtrade key binding and genuinely new licensed feeds remain) |

The runner's behavior behind PLAN-F4 was confirmed by reading `apps/api/scripts/migrate.mjs` (filename-sorted apply; a filename-keyed `schema_migrations` with digest lock). The review's probe hash `db1df307…` differs from the committed bytes at `5da4799` (`7db08482…`), likely a download encoding; the control flow is the same.
