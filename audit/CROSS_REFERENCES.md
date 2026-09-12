# Cross-reference resolution (second audit pass)

Sources: the rev2 register, `audit/extraction/text/v00–v10.txt`, the repository (read-only). Volume 0 pages follow its Contents table; `¶` numbers follow the register.

## 0. Authority order applied

Register, "Specification authority and coverage": "Volume 0 defines mandatory constitutional invariants. Volume 8 defines product completeness and stable PR-CC-NNN requirements. Volume 2 and the other controlled volumes resolve the technical and product details within the constitutional boundary. Retain each document's stated authority when resolving conflicts. Cross-reference equivalent requirements; do not delete duplicates before confirming they impose the same behavior and conditions. Preserve the original requirement IDs."

Volume 0 ch. 1 (p. 7): "Where a later document conflicts with this volume, this volume prevails until a formally ratified amendment is published." Volume 0 ch. 28 (p. 39): "The glossary in Appendix A is the seed of the controlled terminology register. Later volumes may define additional terms, but each definition must identify its scope and relationship to existing terms." Register R-4: "Follow source authority; preserve historical truth-state semantics through versioned mappings; trace CAP references. Parity/acceptance for every agreed deployment profile stays required, scheduled with P7-D where dependent."


## 1. Truth-state vocabulary

### Clauses

- Volume 0 Appendix A (p. 41), "Truth State": "The explicit status of an object as observed, asserted, inferred, assessed, predicted, simulated, disputed, superseded, or approved." Ch. 10 (p. 18): "Retrieval systems must communicate whether content is observed, inferred, disputed, superseded, simulated, or approved." C-010 (¶850): "Observed evidence, extracted claims, inferred relationships, model outputs, human judgments, and synthetic scenario data shall remain explicitly distinguishable throughout the system."
- Volume 3 ch. 20 (p. 50): Observed; "Claimed — Asserted by a source, person, document, or system"; Inferred; Assessed; Decided; Synthetic; "Withdrawn / superseded — No longer decision-active because of correction, expiry, invalidation, or replacement." Glossary (p. 120): "observed, claimed, inferred, assessed, decided, synthetic, withdrawn, and superseded".
- Volume 4 ch. 27 (p. 60): "Observed / Claimed / inferred / assessed / Decided / Synthetic / withdrawn / superseded"; ES-27-004: "Promotion between truth states SHALL require the evidence, evaluation, authority, and audit defined for that transition."
- Volume 7 ch. 22 (p. 54) DP-22-001: "SHALL encode whether data is observed, asserted, extracted, inferred, assessed, simulated, decided, corrected, disputed, or withdrawn". Appendix E (p. 170): "`truth_state` Observed, asserted, extracted, inferred, assessed, synthetic, decided, disputed, or withdrawn"; "`lifecycle_state` Proposed, admitted, active, disputed, corrected, withdrawn, archived, or deleted state." Appendix F (p. 172): TT-09 "Forecast package — Model output".
- Volume 8 glossary (p. 209): "Truth state — Explicit epistemic category such as observed, asserted, inferred, assessed, synthetic, recommended, decided, corrected, withdrawn, or unknown." ADR-006 (p. 205): "Draft, reviewed, approved, published, corrected, withdrawn, archived, and retired states remain distinct."
- Volume 9 Appendix B (p. 165): TS-01 Observed, TS-02 Asserted, TS-03 Inferred, TS-04 Assessed, TS-05 Synthetic, TS-06 Recommended, TS-07 Decided, TS-08 Corrected, TS-09 Withdrawn, TS-10 Indeterminate; "STATE SEPARATION — Truth state answers what kind of knowledge this is. Lifecycle answers where the governed object is in its controlled evolution. Authority answers who may commit a transition."
- Repository: `packages/contracts/src/truth-state.ts` `TRUTH_STATES` = observed, asserted, extracted, inferred, assessed, synthetic, decided, disputed, withdrawn; `LIFECYCLE_STATES` = proposed, admitted, active, disputed, corrected, withdrawn, superseded, archived, deleted; `TRUTH_STATE_COMPAT` = claimed, superseded, simulated, corrected, recommended, indeterminate, unknown. `apps/api/migrations/0006_objects.sql` lines 15–16 and 30–31 hold the same lists as CHECK constraints; line 73 `synthetic_consistency CHECK (truth_state <> 'synthetic' OR synthetic_state = true)`. `DECISIONS.md` ADR-P0-06 (2026-08-03): "Canonical stored enum (9 values, Vol 7 App. E) … Lifecycle state, correction state, and decision/display state are separate dimensions."

### Resolution

Volume 0 governs, but ch. 28 lets later volumes extend Appendix A when each term's relationship is declared. Volume 7 Appendix E is the controlled field dictionary and the stored enum; every Volume 0 term gets a declared relationship below, and Volume 4's and Volume 8/9's extra terms are separated by dimension as Volume 9 STATE SEPARATION requires.

**Truth-state mapping TSM-1** (version 1; effective migration 0006; 18 rows):

| Spec term (source) | Stored value | Conditions |
|---|---|---|
| observed (all; V9 TS-01) | `'observed'` | none |
| asserted (V0; V7; TS-02) | `'asserted'` | source attribution present |
| claimed (V3 ch. 20; V4 ch. 27) | `'asserted'` | V3 defines claimed as "Asserted by a source…": same behaviour (existing compat row) |
| extracted (V0 C-010; V7 ch. 22, App. E) | `'extracted'` | V9 App. B lacks a label: §4f |
| inferred | `'inferred'` | method, evidence, uncertainty, version recorded |
| assessed | `'assessed'` | accountable human role recorded |
| predicted (V0 App. A only) | `'inferred'` | `object_type='FCT'` with `model_refs` (V7 TT-09 "Model output"; V3 inferred = "Derived by a declared … model … method"). **New; absent from `TRUTH_STATE_COMPAT`** |
| simulated (V0 App. A; V0 ch. 10; V7 ch. 22) | `'synthetic'` | `synthetic_state=true` |
| synthetic (V3; V4; V7; TS-05) | `'synthetic'` | `synthetic_state=true` |
| decided (V3; V4; V7; TS-07) | `'decided'` | within the decision record's scope and time (V3 ch. 20) |
| approved (V0 App. A; V0 ch. 10) | none in `truth_state` | `lifecycle_state='admitted'` or `'active'` with an `approvals` reference (V3 ch. 7 header); V8 ADR-006 places approval in the lifecycle. **New** |
| disputed (V0; V7) | `'disputed'` | contradiction links present; lifecycle `'disputed'` is the governed-evolution counterpart |
| withdrawn (V3; V4; V7; TS-09) | `'withdrawn'` | same version sets lifecycle `'withdrawn'` |
| superseded (V0 App. A; V0 ch. 10; V3; V4) | none in `truth_state` | lifecycle `'superseded'` plus `supersedes` header link (V3 ch. 7 p. 20); V9 LS-06 |
| corrected (V7 DP-22-001; V8 glossary; TS-08) | none in `truth_state` | lifecycle `'corrected'` on the replaced version; replacement linked via `correction_of`. V7 App. E itself lists corrected under `lifecycle_state`, resolving its ch. 22 wording |
| recommended (V7 App. F; V8 glossary; TS-06) | none | display from object type (DEC option) and truth state; V3 ch. 7 p. 21: "A recommendation remains advisory until a named human authority creates a decision record" |
| indeterminate / unknown (TS-10; V8 glossary, FEX-23/30 p. 194) | none (`truth_state NOT NULL`) | display when the required state is unresolvable; object kept non-decision-active (V4 ch. 27 "Truth state missing") |
| twin observed/estimated/assumed/predicted/simulated (V3 ADR-0011 p. 121; C-019) | none | twin-state dimension, migration 0032 `kind` |

**Lifecycle mapping LSM-1** (12 rows; V8 ADR-006 and V9 LS-xx → V7 App. E / migration 0006): draft → `proposed`; proposed → `proposed`; in review → `proposed` + review record; approved → `admitted`; published → `active`; superseded → `superseded` (repository extension of V7's eight values, justified by V3 ch. 7 `supersedes`; keep); corrected → `corrected`; withdrawn → `withdrawn`; archived → `archived`; deleted → `deleted`; degraded, blocked → not lifecycle (availability and transition-guard dimensions, display only); **retired → no stored value** (V7 App. E p. 170 lacks it although V7 p. 174 says "Proposed through retired" for other profiles, and V8 ADR-006 and V9 LS-10 distinguish it from archived) → forward migration adding `'retired'` = LSM-2.

No stored value: predicted, approved, superseded, corrected, recommended, indeterminate/unknown, retired; claimed and simulated are aliases.

**Change procedure:** (1) stored values are never renamed, reused or deleted; (2) a new value requires a forward migration re-creating the CHECK, appending to `TRUTH_STATES`/`LIFECYCLE_STATES`, incrementing an exported `TRUTH_STATE_MAPPING_VERSION`, with a fixture; (3) a spec-term change adds a mapping row carrying version and effective migration, never edits one; (4) ADR-P0-06 is superseded by a new ADR, not edited; (5) replay reads history under the mapping version in force at record time. Immediate: add `predicted` and `approved` to `TRUTH_STATE_COMPAT` (no migration); LSM-2 migration for `retired`.

**Residual conflict for the owner: none.** Volume 0's "predicted" survives as `inferred` + FCT + `model_refs`, which keeps C-010's "model outputs" distinguishable from "inferred relationships" through object type and provenance; a first-class stored `predicted` would be a procedure-(2) change, not a conflict.

## 2. CAP-* capability identifiers

### Clauses

- Volume 8 Appendix A (p. 164): "The 108 stable product capabilities define accountable user outcomes across the nine product domains. A capability may be realized through multiple services, models, agents, data products, and deployment components; those implementations do not change its product contract." Ids are `CAP-<domain>-<nn>`, nine domain codes of twelve (pp. 164–168): AU Product Authority and Operating Model; OB Observe and Collect; UM Understand and Remember; FW Predict, Detect, and Warn; DS Scenario, Simulation, and Decision Intelligence; EO Executive Operating System and Collaboration; AG Agents and Automation; TR Trust, Governance, Administration, and Operations; DL Commercialization, Delivery, and Acceptance.
- Volume 8 ADR-004 (p. 205): "Product requirements use stable PR-CC-NNN identities — Acceptance, tests, releases, operations, and downstream design resolve to immutable IDs."
- Volume 9 Appendix N (p. 186): "The traceability matrix binds every Volume 9 design chapter to its immutable requirement range, Volume 8 product chapters, constitutional invariants, owned capabilities, and acceptance focus." Footer, ch. 1 (p. 11): "Volume 8 trace: Ch. 1, Ch. 8, Ch. 71, Ch. 72. Capabilities: CAP-AU-01, CAP-AU-09, CAP-AU-11, CAP-AU-12. Full trace: Appendix N."

### Findings

`audit/requirements/v09.csv` holds 89 distinct `CAP-` ids; 71 resolve to Appendix A. **18 are cited but not defined**: CAP-PD-01..06, -09..12 and CAP-TG-01..06, -08, -11. Volume 9 never cites `CAP-TR-*` or `CAP-DL-*`; its Part 8 carries the TR domain's exact title and its Part 9 "Delivery, Quality, and Design Operations" corresponds to DL. PD/TG are Volume 9-local prefixes for TR/DL whose numbers do not align (TG-11 traces to ch. 63 reliability = TR-09; TG-08 to ch. 64 integrations = TR-11), so aliases follow each id's chapter trace. Volume 8 governs ids; Volume 9 needs an amendment (rows UX-01-001..006).

Mapping (89 entries): CAP id, Appendix A definition (AU/OB p. 164, UM pp. 164–165, FW p. 165, DS pp. 165–166, EO p. 166, AG pp. 166–167, TR p. 167, DL pp. 167–168), then the `-001..006` requirements of every Volume 8 chapter the citing footers trace; `=` marks an undefined id and its alias; citing Volume 9 chapters are in v09.csv:

- CAP-AG-01 Agent registry and Marketplace PR-{11,34,44,49,54,56,61,66}
- CAP-AG-02 Agent invocation service PR-{50,51,52,53,56}
- CAP-AG-03 Observation agent family PR-{50,51,52,53,56}
- CAP-AG-04 Crawler and collection agent family PR-{50,51,52,53,56}
- CAP-AG-05 Search agent Retrieve evidence under exact sc PR-{50,51,52,53,56}
- CAP-AG-06 Cleaning and classification agent family Prop PR-{49,54,61}
- CAP-AG-07 NER and relationship agent family Propose ide PR-{55}
- CAP-AG-08 Graph, memory, and reasoning agent family Ret PR-{52,53,55,56,60,72}
- CAP-AU-01 Product baseline registry PR-{01,02,05,07,08,71,72}
- CAP-AU-02 Capability and domain registry PR-{01,02,05,08,41,72}
- CAP-AU-03 Product decision-rights service PR-{04,58}
- CAP-AU-04 Customer operating-context service Configure PR-{03,05,06,17,21,22,41}
- CAP-AU-05 Role and persona registry PR-{04,58}
- CAP-AU-06 Workspace registry PR-{01,05,07,22,39,41,46,47,63,72}
- CAP-AU-07 Work-object lifecycle service PR-{03,05,06,17,21,22,39,58,64,67}
- CAP-AU-08 Accessibility and preference service PR-{05,07,17,32,43,47,48,57,63,65,66,71}
- CAP-AU-09 Product traceability service PR-{01,08,71,72}
- CAP-AU-10 Product exception service PR-{02,05,07}
- CAP-AU-11 Conformance evidence service PR-{01,08,71,72}
- CAP-AU-12 Product governance workspace Review changes, PR-{01,02,05,07,08,71,72}
- CAP-DS-01 Scenario workspace PR-{33,34}
- CAP-DS-02 Scenario set comparator PR-{33,34}
- CAP-DS-03 Scenario Marketplace PR-{33,34}
- CAP-DS-04 Simulation designer PR-{35,36}
- CAP-DS-05 Simulation run center PR-{35,36}
- CAP-DS-06 Digital Twin portfolio PR-{35,36}
- CAP-DS-07 Twin state and branch explorer Separate obser PR-{35,36}
- CAP-DS-08 Strategy Graph workspace PR-{37,38,39,40}
- CAP-DS-09 Decision case workspace PR-{37,38,39,40}
- CAP-DS-10 Recommendation review service PR-{21,25,32,37,38,39,40}
- CAP-DS-11 Human decision and commitment service PR-{05,06,39,46,58,67}
- CAP-DS-12 Decision PR-{20,22,24,40}
- CAP-EO-01 Executive Operating System home PR-{02,05,08,41,63}
- CAP-EO-02 Executive context switcher Change organizatio PR-{03,05,41}
- CAP-EO-03 Strategic briefing studio PR-{42,47}
- CAP-EO-04 Command view service PR-{41,42,47,48,63}
- CAP-EO-05 Strategic Health PR-{07,17,32,43}
- CAP-EO-06 Proactive priority queue PR-{02,08,11,26,41,44,49,56}
- CAP-EO-07 Strategic planning workspace PR-{45}
- CAP-EO-08 Commitment tracker PR-{05,39,46}
- CAP-EO-09 Collaboration workspace PR-{05,07,14,22,42,47,64}
- CAP-EO-10 Durable task and workflow service PR-{05,07,41,42,48,63,65,71}
- CAP-EO-11 Publishing and distribution center PR-{05}
- CAP-FW-01 Weak signal workbench PR-{21,25,32,38}
- CAP-FW-02 Indicator registry PR-{25}
- CAP-FW-03 Early Warning System PR-{26}
- CAP-FW-04 Risk intelligence workspace PR-{27,28}
- CAP-FW-05 Opportunity intelligence workspace PR-{27,28}
- CAP-FW-06 Competitor intelligence workspace PR-{29,30,31}
- CAP-FW-07 Supply-chain intelligence workspace PR-{29,30,31}
- CAP-FW-08 Geopolitical intelligence package Extend sour PR-{29,30,31}
- CAP-FW-09 Technology intelligence package PR-{29,30,31}
- CAP-FW-10 Cyber intelligence package PR-{29,30,31}
- CAP-FW-11 Financial intelligence package PR-{29,30,31}
- CAP-FW-12 Forecast portfolio PR-{07,17,32,43}
- CAP-OB-04 Research and discovery workspace PR-{11,17,19,44,49,56,62}
- CAP-OB-06 Document intelligence viewer PR-{12,13}
- CAP-OB-07 Media intelligence viewer Inspect image, audi PR-{12,13}
- CAP-OB-08 Live event and telemetry console PR-{12,13}
- CAP-OB-09 Enterprise integration manager Configure ERP, PR-{14,47,64}
- CAP-PD-01 = CAP-DL-01 PR-{07,65,66}
- CAP-PD-02 = CAP-DL-02 PR-{07,34,49,65,66}
- CAP-PD-03 = CAP-DL-03 PR-{06,34,39,49,58,61,66,67}
- CAP-PD-04 = CAP-DL-04 PR-{67,68}
- CAP-PD-05 = CAP-DL-05 PR-{67,68}
- CAP-PD-06 = CAP-DL-06 PR-{67,68}
- CAP-PD-09 = DL-11 by subject or DL-09 by number (ambiguous) PR-{70}
- CAP-PD-10 = DL-12 by subject or DL-10 by number (ambiguous) PR-{71}
- CAP-PD-11 = no Volume 8 capability (accessibility, mobile, acceptance) PR-{05,07,48,71}
- CAP-PD-12 = CAP-DL-12 PR-{08,56,60,71,72}
- CAP-TG-01 = CAP-TR-01 PR-{07,17,22,24,57,62,63}
- CAP-TG-02 = CAP-TR-02 PR-{03,04,05,41,58}
- CAP-TG-03 = TR-04 policy console or TR-05 privacy rights (ambiguous) PR-{59}
- CAP-TG-04 = CAP-TR-06 PR-{56,60,72}
- CAP-TG-05 = CAP-TR-07 PR-{34,49,54,61,66}
- CAP-TG-06 = CAP-TR-08 PR-{11,17,19,22,57,62}
- CAP-TG-08 = CAP-TR-11 PR-{05,06,14,17,47,64}
- CAP-TG-11 = CAP-TR-09 PR-{05,07,41,42,48,57,63,65}
- CAP-UM-01 Intelligence object inspector PR-{03,05,06,11,17,18,19,21,22,62,64}
- CAP-UM-02 Evidence and citation viewer PR-{17,18,22,57,62}
- CAP-UM-03 Entity resolution workbench Review aliases, c PR-{18,19}
- CAP-UM-04 Relationship curation workbench Review typed PR-{18,19}
- CAP-UM-05 Knowledge Graph explorer Query and navigate c PR-{18,19}
- CAP-UM-06 Ontology and taxonomy manager PR-{18,19}
- CAP-UM-07 Enterprise Memory workspace PR-{20,40}
- CAP-UM-08 Strategic record manager PR-{20,40}
- CAP-UM-09 Claim and contradiction workbench PR-{21,25,32,38}
- CAP-UM-10 Timeline and as-of explorer PR-{03,05,06,17,21,22,24,40,47}
- CAP-UM-12 Correction and impact workspace PR-{22,24,40}

The 18 undefined ids stay as Appendix N rows in v09.csv, status "alias; V9 amendment pending"; none is an acceptance carrier. PD-09, PD-10, TG-03 and PD-11: §5 item 4.

## 3. Deployment-profile parity and acceptance rows

### Clauses

- Volume 0 C-042 (¶978): "SaaS, Private Cloud, and On-Premise deployments shall preserve the same core semantics, governance model, APIs, artifacts, and intelligence lifecycle, with documented capability differences only where unavoidable." Ch. 22 (p. 32): "Differences must be documented as capability constraints, not hidden product fragmentation."
- Volume 8 PR-CC-004, identical in all 72 chapters, e.g. PR-01-004 (p. 11), PR-02-004 (p. 14), PR-65-004 (p. 148): "SaaS, Private Cloud, and On-Premise SHALL preserve identical outcome, object, human-authority, explanation, correction, export, replay, and failure semantics; operational variance SHALL be declared."
- Volume 8 PR-CC-006: chapter-specific evidence plus the invariant tail "for the exact capability version, journey, role, tenant or domain, deployment, entitlement, data and model versions, configuration, consequence class, and period." PR-65-006 (p. 148): "identical golden journeys and fixtures, semantic diffs, export/re-import and replay, degraded-mode comparison, and customer acceptance for every profile"; PR-71-006 (p. 160): "requirements closure, end-to-end journey evidence, security/privacy/accessibility, scale and resilience exercises, deployment parity, support readiness, and signed acceptance".
- Volume 8 PR-65-001 (p. 147): "one semantic product across SaaS, Private Cloud, and On-Premise, including approved disconnected and air-gapped profiles, with only declared operational variance." PR-65-005 (p. 148): "the product SHALL mark the capability unavailable or explicitly non-parity, prevent unsupported claims, and require remediation or controlled exception". ADR-023 (p. 206): "Acceptance is evidence-bound and scope-specific — Release, deployment, tenant, role, versions, consequence, period, conditions, and authority are exact". Appendix J (p. 193) PAR-01..24 parity fixtures, PAR-24 requiring "Signed deployment acceptance".
- Volume 4 ch. 14 (p. 37) ES-14-005: "Release qualification SHALL execute the same normative conformance suite against each supported deployment profile." Evidence: "Versioned fixture and signed result for the exact provider, consumer, schema, and environment." Failure: "Mode-specific semantic drift — Classify the release as non-conformant and block promotion for that mode." P. 38: "Contract tests run against each deployment profile without mode-specific test semantics."
- Volume 6 ch. 3 (p. 14) IA-03-002: "Every production instance SHALL declare and continuously reconcile deployment capability profile, semantic parity claim, permitted physical variance, test suite, and evidence validity"; IA-03-005 (p. 15): "the platform SHALL mark the capability unavailable or explicitly degraded for that profile and block claims of product parity". Chapters 8–11 (pp. 25–32), e.g. IA-10-004: "SaaS, Private Cloud, and On-Premise SHALL preserve the same authority, state, isolation, failure, recovery, evidence, replay, and human-decision semantics for On-Premise Reference Architecture."
- Register, "Meaning of complete": "Verification states are unverified, failed, passed for a specified scope and stale after a relevant change. Release states distinguish branch-only, merged and accepted on each supported deployment profile." Register V06 family: "Existing local-only exceptions cannot be carried into production by renaming the environment."

### Rule

Parity and acceptance for every agreed profile stay required (C-042, ES-14-005, PR-CC-004, IA-03-002); they may be scheduled with P7-D ("Exit: section 7's profile-specific acceptance evidence exists for the exact release"); they cannot be marked passed on a local-only demonstration: a local harness is not a supported profile and yields no "signed result for the exact provider, consumer, schema, and environment".

### Register treatment of the 144 rows

1. **Vocabulary.** Implementation ∈ {missing, partial, implemented}. Verification ∈ {unverified, failed, passed(scope), stale}, scope naming the profile or "local-harness"; a local-harness pass is recorded, never rolled up as passed. Release ∈ {branch-only, merged, accepted(SaaS), accepted(Private Cloud), accepted(On-Premise)} as a per-profile triple. The only other terminal state is "non-parity declared(profile)" with exception owner and expiry (PR-65-005, IA-03-005): a per-capability product decision, never a default.
2. **72 PR-CC-004 rows.** Stay in P7-D (48 partial/branch-only, 24 missing/none today). Each gains legs PR-CC-004/SaaS, /PC, /OP (a decomposition, not new clauses), all unverified, dependent on the chapter's functional rows and P7-D. Evidence per leg: ES-14-005 signed suite result; PR-65-006 journeys, semantic diffs, export/re-import/replay, degraded-mode comparison, customer acceptance; the chapter's PAR fixture; IA-03-002 declared profile, parity claim and variance; evidence class "deployment". Complete only when all three legs are accepted.
3. **72 PR-CC-006 rows.** Keep their chapter packages (P1 6, P2 4, P3 7, P4 9, P5 2, P6 10, P7-A 7, P7-B 3, P7-C 2, P7-D 9, P7-E 3, P7-F 9, R0 PR-71-006) because the chapter evidence is functional; each carries a P7-D dependency for the "deployment" element of its tail and the same triple, and passes only when the evidence names the profile. PR-71-006 and PR-65-006 are closure rows and cannot close before every -004 triple is accepted or declared non-parity under a live exception.
4. Existing release labels say nothing about profiles; add the triple without altering them.

## 4. Other cross-volume conflicts

**4a. Object codes.** Volume 3 ch. 7 (pp. 20–21) lists twelve codes (SRC … RSK); Appendix B (pp. 109–110) lists twenty-four (adding TWN … AUD) and says "Every object inherits the universal header defined in Chapter 7." Not a conflict: Appendix B is the catalogue. Migration 0006 enforces only `^[A-Z]{3}$`; the registry rows (0022 onward) must cover all 24. Resolved.

**4b. Branch kinds.** C-022 (¶898): "baseline, upside, downside, disruption, and user-defined alternatives; no single forecast shall masquerade as destiny." Volume 0 ch. 14 (p. 22): "The system shall support baseline, upside, downside, disruption, stress, adversarial, counterfactual, and user-defined scenarios." Volume 4 L7-I02 (p. 174): "Creates a versioned upside, downside, disruption, or user-defined alternative." Volume 5 (p. 112): "Baseline, upside, downside, disruption, and governed custom branches". Volume 8 ch. 33 (p. 79) names none ("multiple plausible futures … branch points"). Migration 0029 line 328: `kind IN ('baseline', 'upside', 'downside')`. Authority resolves: ch. 14 is a "shall"; the index entry is a summary. Repository non-conforming: forward migration to the eight kinds; register family V00-F022 and the P4 exit text must name all eight. Rows: V00-F022, PR-33-002/-004/-006, V04 L7-I02, V05 ch. 49. No owner choice.

**4c. Horizons.** C-020 (¶890), Volume 0 ch. 13 (p. 21), Volume 4 (pp. 84, 190), Volume 5 AI-48-001 (p. 110), Volume 8 ch. 32 (p. 76) and PAR-06 (p. 193) agree on 30-day, 90-day, 180-day, 1-year, 3-year, 5-year; migration 0029 line 109 matches. AI-48-001 adds "unless a domain specification defines an additional governed operational horizon without replacing them"; such a horizon follows the §1 procedure. No conflict.

**4d. Warning severity.** Volume 8 ch. 26 (p. 64) controls "Warning, trigger, threshold, severity, confidence, evidence …" and "prevent unsupported severity or closure"; Volume 4 SLO-016 (p. 183): "Material warnings reach accountable owner inside response window — Per severity"; Volume 8 MET-021 (p. 198): "Severity + channel + deployment — Severity SLO"; Volume 9 Appendix M (p. 184): NOT-06 "Warning issued — Consequence-based", NOT-07 "Warning escalation — High or critical … Escalation does not alter severity evidence", other rows Low / Normal / High / Critical; Volume 5 consequence classes C0–C4 (pp. 131, 197). No volume defines the scale or its derivation; migration 0029's warning table has no severity column. Absent definitions cannot be resolved by authority: **§5 item 1.**

**4e. SLO catalogue.** Volume 4 Appendix F (p. 183): "These baseline objectives establish the minimum quality-control vocabulary. Component owners refine populations and targets by consequence and deployment profile without weakening constitutional safety or product transparency" (e.g. SLO-001 write durability 99.999%, SLO-009 provenance completeness 100%). Volume 8 PAR-14 (p. 193): "Identical SLO meaning, product state, degradation, recovery, and evidence — Topology and service objective values" as permitted variance; ch. 63 (p. 142) controls "SLI, SLO, error budget". Volumes 6 and 7 have no catalogue. Meaning is identical (resolved); whether the numbers are floors on every profile is undefined: **§5 item 3.**

**4f. Lifecycle and display.** V7 App. E (8), repository (9), V8 ADR-006 (8 incl. retired), V9 LS-01..12: resolved by LSM-1 with the `retired` migration. Volume 9 Appendix B lacks a label for `extracted`, which C-010 requires distinguishable: add TS "Extracted" by V9 amendment (rows UX-06-001..006, UX-27-001..006). No owner choice.

## 5. Genuine product choices for the owner

1. **Warning severity scale and derivation.** Clauses: V8 ch. 26 p. 64; V4 SLO-016 p. 183; V8 MET-021 p. 198; V9 NOT-06/07/08 p. 184; V5 pp. 131, 197. Options: (A) severity = consequence class C0–C4; (B) four levels {low, normal, high, critical} derived from consequence class and response window by a versioned rule; (C) delegate to domain specifications. Effects: A collapses Volume 9's "High or critical"; B satisfies V9 and populates SLO-016/MET-021 but needs a `severity` column and fixture; C leaves those rows unverifiable at product level. Rows: PR-26-001..006, PR-44-002, V04 SLO-016, V08 MET-021, V09 NOT-06/07/08, UX-31. Recommendation: B.
2. **Acceptance legs per profile row: three or five.** Clauses: C-042 and Volume 0 ch. 22 p. 32 (three modes; On-Premise includes "disconnected environment"); PR-65-001 p. 147; CAP-DL-01 p. 167 ("SaaS, Private Cloud, On-Premise, disconnected, and air-gapped profiles"); Volume 6 ch. 11; register ("all three profiles"). Options: (A) three legs, with disconnected/air-gapped accepted through IA-11-001..006, PR-48-001..006, PR-65-001, PAR-20/21; (B) five legs on every row. Effects: A = 216 legs on the -004 rows; B = 360, likewise on -006, and a register wording change. Rows: all PR-CC-004 and PR-CC-006, PAR-20/21, IA-11-001..006, PR-48-001..006, PR-65-001. Recommendation: A.
3. **SLO values: floors or per-profile variance.** Clauses: V4 App. F p. 183; V8 PAR-14 p. 193; PR-65-002 p. 147 ("variance"); V8 ch. 63 p. 142. Options: (A) all values are floors on every profile; (B) all may vary as declared variance; (C) semantics-bearing objectives (SLO-001, -003, -006, -007, -009: durability, no lost event, fail-closed, audit before acknowledgement, 100% provenance) are floors; latency/availability objectives (SLO-002, -004, -005, -010, -011) may vary by declared variance. Effects: A ties On-Premise acceptance to customer hardware; B lets a profile weaken safety semantics, which Appendix F forbids; C keeps C-043 semantics identical and moves only numbers. Rows: V04 SLO-001..016, PR-63-002/-004/-006, PR-65-002, PAR-14, V08 MET rows citing SLO. Recommendation: C.
4. **Volume 9 capability ids without a Volume 8 definition.** Clauses: V8 App. A p. 164; CAP-AU-02 p. 164 ("No orphaned or duplicate authority"); V9 App. N p. 186. Fourteen aliases are unambiguous (§2). CAP-PD-11 (traces to V8 ch. 5, 7, 48, 71: accessibility, mobile, acceptance): (A) alias to CAP-AU-08 + CAP-DL-12; (B) add a 109th capability to Volume 8. PD-09, PD-10, TG-03: alias by subject (DL-11, DL-12, TR-04) or by number (DL-09, DL-10, TR-05). Effects: A keeps 108 and needs only the V9 amendment; B changes Volume 8 and the register count. Rows: V09 CAP-PD-09/-10/-11, CAP-TG-03, UX-07/14/59/70/71-001..006, PR-01-001/-002. Recommendation: A, by subject.

Everything else in §1–§4 is resolved by the authority order and the versioned mappings (TSM-1: 18 rows; LSM-1: 12 rows; CAP: 89 entries, 18 aliases).
