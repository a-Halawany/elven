# THE EYE — Phase 5 Product Build Plan: Digital Twins + Simulation (L5, L8)

> Scope comes strictly from the frozen roadmap (`docs/the-eye-master-build-prompt.md`, Phase 5),
> the constitution's twin and simulation chapters (Volume 0 §12, §15; invariants C-018, C-019,
> C-023) and the boundary the demonstration already promises
> (`docs/phase1/DEMO_STORYBOARD.md` §2, row 5). It does not touch Phases 6–7.
>
> **Status: PROPOSED — awaiting owner approval.** Acceptance criteria E1–E8 (§6) and the twin
> grounding rules (§6a) are to be frozen before implementation starts. The first implementation
> stage is defined in §11 and can begin on approval, independently of the security maintenance
> that keeps PRs #38 and #39 unmerged.

---

## 1. Product objective

**Intervene in a model before intervening in the world.**

Phase 4 tells the operator what the corridor is likely to do and warns them when a branch flips.
It cannot tell them what a reroute, an air-freight bridge or a safety-stock draw-down would do to
the plant — those are consequences, and consequences need a model of the system the decision acts
on. Phase 5 builds that model as a **Digital Twin** of the Ningbo → Regensburg supply chain,
grounded in the evidence Phases 1–4 already hold, and a **Simulation Engine** that runs declared
interventions against it reproducibly.

> The operator opens the twin of the chain, runs *reroute vs. air vs. draw-down* against the
> replayed January collapse from what was known on 17 January 2024, compares them on one baseline,
> sees which assumption carries the result, reproduces any run byte for byte — and every number
> is marked **synthetic**.

The roadmap's acceptance sentence is the product test: *a twin instantiates from graph +
evidence; re-running a simulation with identical inputs reproduces identical outputs; results are
marked synthetic.* The constitution adds the discipline: a twin never presents synthetic state as
observed fact (C-018); it supports time travel, branching, comparison, replay and reconciliation
(C-019); every run declares initial state, assumptions, interventions, model versions, constraints,
seeds, outputs and sensitivity so it can be reproduced and challenged (C-023).

Phase 5 does **not** decide (Phase 6: decision packages, approval workflow, Decision Replay), and
adds no agents beyond the bounded runs Phase 1's agent contract already governs (Phase 7).

## 2. Dependency baseline, and what is reused

**Baseline: Phase 4 at PR #38 head `98e7d9e6f37135d3e9b603a00253baf338c366c8`** — the reviewed
implementation whose functional correction review is closed (PHASE4_REPORT.md §13). It is unmerged
behind the red C15 gate; Phase 5 is built on it (§9) and its merge is sequenced after it. Phase 3
is merged (`6914af03` + `4491c7f5`).

| Reused as built | From | How Phase 5 uses it |
|---|---|---|
| Canonical objects, 43-column header, `objects.admit_version`, schema registry, `validateHeader` | Phase 0 | `TWN` and `SIM` are canonical objects; nothing new in the header |
| Governed pipeline (`PipelineService.write/consequentialRead`), capabilities, SECURITY DEFINER ports, FORCE RLS, receipts | Phase 0–1 | every twin and simulation write goes through the same envelope and the same scope triple |
| Evidence with custody; the file-upload connector; `observation.evidence.retrieve` by version | Phase 1 | grounding: the synthetic company's shipments, inventory and BOM are already uploaded evidence (`fixtures/phase1/replay/nordwerk-uploads`) |
| Claims with truth state and lineage; the review queue | Phase 2 | state elements may cite claims as well as evidence |
| Entities, edges with temporal validity, known-at graph, Strategy Graph (`OBJ/ASU/DEC/CMT/OUT`), `graph.dependencies`, invalidation propagation (`record_impact`) | Phase 3 | the twin's boundary is a set of entities; its assumptions are `ASU` objects; corrections propagate to twin state and to runs |
| Series registry, assembly through the known-at path per reader (no cache), `foldControls`, forecasts `FCT`, scenarios `SCN`, indicators, warnings `WRN`, backtest modes, the outcome ledger | Phase 4 | observed state elements read series as known at the twin's instant; a scenario branch is the shock a run applies; inherited controls flow twin → run; a forecast may feed a run only under its own validation state |
| Model Gateway (replay / local-live) | Phase 2 | **not used for numbers.** Optional narrative only, as in Phase 4; `narrative` may stay `null` |
| Post-C18 upgrade check, `test:int:all`, acceptance suite, demo scripts, the demo Playwright suite | Phase 0–4 | extended by lines, not by new gates |

**What Phase 5 adds:** the `twin` schema (registry, versions, grounded state elements, behaviour
model registry) and the `simulation` schema (runs, interventions, outputs, sensitivity,
reproductions, comparisons); two canonical object types `TWN@v1`, `SIM@v1`; one deterministic,
version-pinned behaviour model `supply-flow@1`; two roles `twin_owner`, `simulation_operator`;
`twin.*` and `simulation.*` PDP actions; a fifth workspace (Twins, Simulations); Act V of the
corridor demonstration. Nothing else.

## 3. Architecture

| Component | What it is |
|---|---|
| **Twin registry** | A `TWN` canonical object per twin, versioned. A twin version declares **identity and scope** (the real system, its boundary as a set of Phase 3 entities, owner, intended decisions), **interfaces** (control variables, policy limits), **behaviour model** (a pinned `method_ref`, e.g. `supply-flow@1`), **validation** (status, operating envelope, known limitations) and **assumptions** (`ASU` objects it rests on). Truth state `asserted` — a person declared it. |
| **Grounded state** | Every **state element** of a twin version has a `kind` — `observed`, `estimated`, `assumed`, `predicted`, `simulated` — never collapsed (C-018, constitutional rule 5). An `observed` element cites the evidence version (or claim) it was read from, with `valid_from/valid_to` and confidence; a `predicted` element cites an `FCT` and inherits its validation state; an `assumed` element cites an `ASU`; a `simulated` element cites the `SIM` that produced it and is `synthetic`. A **material** element without a citation is refused at admission. Observed elements read series through Phase 4's known-at path, so a twin can be instantiated **as of** any instant. |
| **Behaviour model registry** | Deterministic, version-pinned model implementations behind a method registry — the same discipline as Phase 4's parsers and forecasters. Phase 5 ships one: `supply-flow@1`, a daily discrete-time flow model (inventory, consumption, shipments with ETAs, safety stock, line stop, costs). Its parameters are twin state elements, never literals. The Model Gateway is not a behaviour model. |
| **Simulation runs** | A `SIM` canonical object per run, **immutable once completed** (Vol 0 §15 experiment contract). A run declares: twin version, scenario version (optional), **initial state** (the twin as known at an instant), **control case** (the baseline run it is compared against), **interventions** (typed: `reroute`, `air_bridge`, `draw_down`, `none`), constraints and policy limits, assumptions, behaviour model version and parameters, **seed** (for the stochastic lead-time option), execution environment digest, responsible operator, **outputs** (daily trajectories and totals), uncertainty, **sensitivity**, validation status. Truth state `synthetic`, `synthetic_state = true` (the 0023 constraint). |
| **Reproducibility** | An `inputs_digest` over the canonicalised experiment contract and an `outputs_digest` over the outputs. **Reproduce** re-executes a completed run from its stored contract and records whether the digests match; a mismatch is a recorded failure, never silently overwritten. |
| **Sensitivity and comparison** | One-at-a-time perturbation of each declared assumption within its declared range, reporting output deltas — "the assumptions carrying the result". Compare any runs sharing a control case on identical output keys. |
| **Reconciliation and propagation** | A `simulated` or `predicted` element can later be **reconciled** against an `observed` one (the difference is recorded, nothing overwritten). A correction or withdrawal of evidence a state element cites walks `graph.dependencies` (Phase 3/4 path) and marks the element and its twin version **unverified**, and surfaces every run built on that version. |

**Data model.** Forward migrations at the next unused number when implementation starts (`0032`
at the time of writing), in the shape of `0029`–`0031`: `twin.*` and `simulation.*` with event
logs + projections, scope triple NOT NULL and CHECK-constrained, `FORCE ROW LEVEL SECURITY`,
SECURITY DEFINER ports asserting the caller's own bound action, append-only where the
constitution says immutable. `TWN@v1` / `SIM@v1` in the schema registry; `graph.dependencies`
gains dependents `TWN`/`SIM`, `record_impact` gains twin and simulation buckets. The post-C18
upgrade check is extended by one line — **not a new gate**.

**API.** The same surface, same envelope, same capabilities, same receipts: `twins/*` (declare,
version, ground, list, get, as-of, compare, reconcile), `behaviour-models/list`, `simulations/*`
(run, get, reproduce, compare, sensitivity, list). Reading and writing stay separate decisions.

**UI.** A fifth workspace: **Twins** (boundary, state elements by kind with the evidence under
each, validation status and limitations, blind spots and staleness) and **Simulations** (run
against a scenario, compare on a common baseline, the assumptions carrying the result,
reproduce). Same rules: receipts only from authoritative responses, state never by colour alone,
`SYNTHETIC` on every simulated value, keyboard-operable, RTL-mirrored.

## 4. Data requirements, and the source decisions preserved

**No new source, connector, credential or paid service.** The owner's four source decisions of
2026-09-05 stand: PortWatch stays in replay with rights pending the IMF's answer; ECB stays live;
UN Comtrade is untouched; nothing is purchased.

| Need | Where it comes from | State |
|---|---|---|
| Corridor transits (Bab el-Mandeb, Suez, Cape) | PortWatch replay evidence, Phase 4 series `portwatch:chokepoint{1,4,7}:n_total` | exists |
| The scenario shock (transits below threshold for five days) | Phase 4 `SCN` branch + indicator, flipped in replay | exists |
| Shipments in flight, inventory, BOM | Phase 1 synthetic uploads `shipments-2024Q1.csv`, `inventory-2024Q1.csv`, `bom-2024Q1.docx` — marked synthetic at object level | exists |
| Route legs, transit days, reroute delta, freight and line-stop costs, LD terms | **not yet evidence** — only in `docs/phase1/SYNTHETIC_COMPANY_SPEC.md` §6, §9 | **new synthetic upload** `routes-and-terms-2024Q1.csv` through the existing file connector, `data_origin: synthetic`; entered as `assumed` state elements citing that evidence, since contractual parameters are assumptions, not observations |
| Chokepoint, supplier, plant and route entities | Phase 3 graph (act III) | exists; supplier/plant entities are resolved from the uploads' claims in act III |
| EUR/USD for cost conversion (optional) | Phase 4 `ecb-eurusd` live series | exists |

**The forecast limitation carries into the twin.** The corridor forecast is
`validation_impossible` and the ECB forecast is `validated_retrospective`; a `predicted` element
inherits that state and a run using it says so. Act V's shock is the **observed** replay collapse
through the scenario branch, not the corridor forecast, and no accuracy is claimed for the twin
itself: its grounding is a synthetic company, so its validation status is
**`unvalidated (synthetic grounding)`** and stays that way in Phase 5. That is stated on screen.

## 5. Implementation stages and dependencies

| Stage | Deliverable | Depends on | Est. |
|---|---|---|---|
| **P5-M1** | Migration `0032`: `twin` schema, `TWN@v1`, roles and actions, grounded state elements with kinds and citations, as-of instantiation; upgrade check +1 line; the `routes-and-terms` synthetic upload | Phase 3 (merged); Phase 4 series path for observed elements (PR #38 branch) | 4–5 days |
| **P5-M2** | Behaviour model registry + `supply-flow@1` (pure, deterministic, golden-tested against the company spec's arithmetic: cover to ≈ 2024-02-28, reroute lands ≈ 2024-02-09, second reroute breaches safety stock in early March) | none beyond M1's parameter shape | 3–4 days |
| **P5-M3** | `simulation` schema, `SIM@v1`, run contract admission, interventions, control case, outputs, `inputs_digest`/`outputs_digest`, reproduce | M1, M2 | 5–6 days |
| **P5-M4** | Sensitivity (one-at-a-time), seeded stochastic lead-time option (Monte Carlo N with declared seed), comparison on a common baseline, operating-envelope marking | M3 | 3–4 days |
| **P5-M5** | Reconciliation of simulated/predicted elements against later observation; propagation: corrections reach twin versions and runs (dependents in `graph.dependencies`, `record_impact` buckets) | M1, M3; Phase 3 propagation | 3–4 days |
| **P5-M6** | Twins and Simulations workspace; demo Playwright suite extended | M3–M5 | 5–6 days |
| **P5-M7** | Act V of the corridor demonstration; E1–E8 acceptance; Phase 5 report and handoff | all | 3–4 days |

**Realistic duration: 5–6 weeks**, one engineer, local-only, no live sources beyond ECB.

**Data requirements per stage:** M1 needs the existing uploads and the new `routes-and-terms`
upload; M2 needs nothing external; M3–M5 run on the replay window; M6–M7 need the fresh
demonstration (acts I–IV, then V).

## 6. Acceptance criteria — to be frozen before implementation

Eight, in the shape of C1–C7 and D1–D8: product capabilities the roadmap and constitution name,
each proved through the real database and controller harness and, where it renders, in a browser.

| # | Criterion |
|---|---|
| **E1** | **A twin instantiates from graph + evidence.** Every material state element cites the entity, evidence version, claim, forecast, assumption or run it comes from; a twin version with an uncited material element is **refused at admission**. Instantiating the twin as of 2024-01-17 reads only what was known by then, and a version recorded later is invisible to that instantiation. |
| **E2** | **Observed ≠ estimated ≠ assumed ≠ predicted ≠ simulated, and never collapsed.** Element kinds are constrained in the database and shown on screen; a simulated element and every run output carry `truth_state = synthetic` and `synthetic_state = true`; a predicted element inherits its forecast's validation state; a twin whose grounding is synthetic says `unvalidated (synthetic grounding)`. |
| **E3** | **Twin versionability.** A twin version is immutable; change is a new version with `supersedes`. A known-at query returns the twin as it stood; two versions or two branches can be compared element by element; a simulated or predicted element can be reconciled against a later observation with the difference recorded and nothing overwritten. |
| **E4** | **Reproducibility.** Re-running a completed run from its stored contract — same twin version, model version, initial state, interventions, constraints and seed — yields identical `outputs_digest`; the reproduction is recorded with its verdict; a mismatch is a recorded failure. The seeded stochastic option reproduces too; an unseeded stochastic run is refused. |
| **E5** | **The experiment contract is complete or the run is refused.** A run without twin version, initial-state instant, behaviour model version, interventions (`none` is an intervention), constraints, control case, responsible operator or — when stochastic — seed is refused at admission; a completed run is immutable; a correction produces a new run linked to the original. |
| **E6** | **Control case and the assumptions carrying the result.** Every run names its control (the no-intervention baseline on the same initial state) and reports one-at-a-time sensitivity over its declared assumptions; when an assumption is pushed outside the model's validated operating envelope the outputs are marked, not hidden. |
| **E7** | **Corrections reach twins and runs.** Correcting or withdrawing evidence a state element cites marks that element and its twin version unverified and surfaces every run built on it — Phase 3's propagation, extended through Phase 4's forecasts to twins and simulations, asserted end to end. |
| **E8** | **Phase 0–4 regression**: full CI green, no constitutional invariant weakened, C18 still frozen at 0021, the Phase 1–4 operator journeys unchanged, source decisions preserved, the automatic CorrectionApplied consumer still deferred. |

**Measured targets.** Unlike Phase 4 there is no accuracy target: the twin's grounding is a
synthetic company, so a "twin accuracy" number would describe fiction. The measurable claims are
E4's digest equality across N reproductions (N ≥ 3 including a cold process), E6's sensitivity
report on every run, and E1's refusal rate on ungrounded elements (100% refused). Twin
validation against real outcomes begins when a twin is grounded in real enterprise records, which
is outside Phase 5.

## 6a. Twin grounding rules (to be frozen with E1–E8)

| # | Rule |
|---|---|
| **1** | A state element is `observed` only when it is read from an evidence version or a claim with truth state `observed`/`extracted` through the known-at path; anything computed from observations is `estimated`. |
| **2** | Costs, lead times, contractual terms and thresholds are `assumed`: they cite an `ASU` object or the uploaded document that states them, never a literal in code. |
| **3** | A behaviour model's parameters are state elements of the twin version the run declares; a run cannot pass a parameter the twin does not hold. |
| **4** | A `predicted` element cites exactly one forecast version and inherits its validation state; `validation_impossible` or `unvalidated` inputs make the run say so in its own validation status. |
| **5** | A run reads the twin **as known at** its initial-state instant; nothing recorded after that instant reaches the run. |
| **6** | Simulated output never becomes an `observed` element. Reconciliation records the difference between a simulated element and a later observation; it does not replace either. |
| **7** | Inherited controls fold from every cited object into the twin version, and from the twin version and the scenario into the run (Phase 4's `foldControls`, fail-closed). |
| **8** | The Model Gateway may narrate a run; it may not produce, adjust or select a number in it. |

## 7. What this plan deliberately excludes

Decision packages, options, approvers and Decision Replay (Phase 6) · monitoring agents and the
governed release pipeline (Phase 7) · twin templates beyond the supply-chain twin · causal
discovery, optimisation, agent-based or system-dynamics engines (the registry admits them later
as pinned methods; Phase 5 ships one deterministic flow model with a seeded stochastic option) ·
any new source cohort, connector, credential or paid service · any new gate, testing framework or
acceptance matrix beyond E1–E8.

## 8. The end-to-end demonstration — Act V, "before we commit"

Acts I–IV run as today on a fresh database. Then, as the twin owner:

1. **The twin.** Open *NORDWERK — Ningbo → Regensburg chain*, version 1, instantiated **as of
   2024-01-17**. Its boundary: the chokepoint entities (Bab el-Mandeb, Suez, Cape), the supplier,
   the plant, the route. Its elements by kind: transits **observed** from PortWatch evidence
   (real, attributed); shipments, inventory and consumption **observed** from the uploaded records
   (marked synthetic at object level); route days, reroute delta, freight and line-stop costs
   **assumed**, citing the uploaded terms; nothing predicted. Validation status:
   *unvalidated (synthetic grounding)*, stated in words.
2. **The baseline.** Run `supply-flow@1` with intervention `none` from that instant against the
   flipped scenario branch (transits below threshold for five days). Output: daily cover for
   `SYN-PART-MAG`, line-stop days, cost — every value marked **SYNTHETIC**.
3. **Three interventions on one baseline.** *Reroute* `SYN-SHIP-4475` via the Cape (+11 days,
   +€1 850/container); *air bridge* one week of magnets (≈ €79 500); *draw-down* of safety stock.
   The comparison shows cover, line-stop days and cost side by side, and the sensitivity panel
   shows that the transit-delay assumption carries the result, not the consumption rate.
4. **Reproduce.** Re-run the reroute case from its stored contract: identical digest, recorded.
   Change one assumption by hand: a new run, linked, with a different digest and a visible reason.
5. **The correction reaches the twin.** The publisher restates one day of the corridor series (act
   IV's correction): the observed element goes *unverified*, the twin version is flagged, and the
   four runs built on it are surfaced beside the forecast and the scenario.
6. **What it does not say.** No option is recommended; no decision is recorded. That is Phase 6.

Everything real (PortWatch, ECB) stays attributed; everything synthetic (the company, the runs)
stays marked. The demo Playwright suite gains the Twins and Simulations screens and the reproduce
and compare actions.

## 9. What can proceed while the security maintenance is blocked

The C15 gate is red on the pinned images (PR #39) and no patched official image exists. That
blocks **merges**, not construction:

* **Proceed now, on `phase5-twins` branched from PR #38's head `98e7d9e6`:** P5-M1 through
  P5-M7. Every required check except `supply-chain` runs and is expected green on the branch, as
  it is on PR #38 today; the local regression (`test:int:all`, acceptance, upgrade check, demo,
  browser suite) runs as in Phase 4. Migrations are numbered after 0031 and remain forward-only.
* **Independent of Phase 4** (could even start from `main`): P5-M2's behaviour model and its
  golden tests, and the `routes-and-terms` synthetic upload — pure code and a fixture. Everything
  that reads series, forecasts or scenarios depends on the Phase 4 branch.
* **Waits for C15:** merging PR #38, then PR #39, then the Phase 5 PR, in that order; the downstream
  C16/C17 steps skipped behind C15 must run green on the final candidates. Phase 5's PR is kept
  unmerged for consolidated review like Phase 4's.
* **Continues independently:** the on-demand image recheck; when a verified patched image
  appears, the governed digest update and disposition reconciliation on PR #39 first.

## 10. Decisions needed from the owner

1. **Object types `TWN` and `SIM`** for twins and simulation runs — confirm the codes.
2. **Behaviour model scope** — recommended: the deterministic `supply-flow@1` with a seeded
   stochastic lead-time option; no agent-based, system-dynamics or optimisation engine in Phase 5.
3. **Synthetic terms as evidence** — recommended: one new synthetic upload
   `routes-and-terms-2024Q1.csv` through the existing file connector, so costs and route days are
   cited assumptions rather than literals.
4. **Branch base** — recommended: `phase5-twins` stacked on PR #38's head; merges sequenced
   #38 → #39 → Phase 5 once C15 is green.

No approval is needed for what the plan preserves: the source decisions, the forecast
limitations, the frozen T1–T4 / D1–D8, and the deferred correction consumer.

## 11. The first implementation stage — P5-M1, defined

**Goal.** A twin exists as a governed, versioned, grounded object, and can be instantiated as of
an instant from graph + evidence — E1, the database half of E2, and the known-at half of E3.

**Migration `0032_twin_registry.sql`** (forward-only):
* `twin.twin_events` (append-only) and `twin.twins_current` (projection): twin id, scope triple,
  title, statement, boundary (entity ids), owner, intended decisions, interfaces, behaviour model
  ref, validation `{ status, envelope, limitations }`, controls, current version, state.
* `twin.twin_versions` (append-only): one row per version with `supersedes`, `known_at`, the
  header digest of the `TWN` object, and `verification_state` (`verified` / `unverified`) for
  propagation.
* `twin.state_elements` (append-only, per version): `key`, `kind` CHECK IN
  (`observed`,`estimated`,`assumed`,`predicted`,`simulated`), `value` jsonb, `unit`, `material`
  boolean, citation `{ kind: evidence|claim|entity|forecast|assumption|run, id, version, digest }`,
  `valid_from`, `valid_to`, `confidence`, `controls`. CHECK: `material = true ⇒ citation IS NOT
  NULL`; CHECK: `kind = 'simulated' ⇒ citation.kind = 'run'`; `predicted ⇒ forecast`;
  `assumed ⇒ assumption or evidence`.
* `twin.behaviour_models` (registry): `method_ref` (`supply-flow@1`), parameter schema, declared
  operating envelope, validation notes; seeded by the migration.
* Ports (SECURITY DEFINER, `observation.assert_authority` + `assert_scope`):
  `twin.declare_twin`, `twin.add_version`, `twin.ground_element`, `twin.mark_unverified`;
  `graph.dependencies` dependent type `TWN` and target kinds `twin`; roles `twin_owner`,
  `simulation_operator`; PDP rules `twin.declare`, `twin.version`, `twin.ground`, `twin.read`.
* `TWN@v1` in `objects.schema_registry`; `twin.rebuild_projections()` in the shape of
  `prediction.rebuild_projections()`.

**Services.** `apps/api/src/twin/` — `twin.capabilities.ts` (narrow interfaces per action),
`twin.controller.ts` (`twins/declare`, `/version`, `/ground`, `/list`, `/:id/get`, `/:id/as-of`),
`twins/twin.service.ts` (header construction with inherited controls, admission through
`admitObject`, refusal of uncited material elements before the transaction), `grounding/` (readers
that produce elements from Phase 4 series as known at, from Phase 1 evidence rows and from Phase 3
entities, each recording the citation). Module boundaries: `twin` → `prediction/series`,
`graph`, `observation` through their exported services only; dependency-cruiser rule added.

**Fixture.** `fixtures/phase1/replay/nordwerk-uploads/routes-and-terms-2024Q1.csv` (synthetic,
manifest-listed), uploaded by the Phase 1 seed as S9 evidence.

**Tests.** `test/int/phase5-twins.test.ts` through the real harness: declare → refused without
a boundary entity; ground a material element without a citation → refused (E1); ground observed
elements from the fixture series as of two instants → the later version invisible to the earlier
instantiation (E1/E3); element kinds constrained (E2, database half); version 2 supersedes
version 1 and both remain readable (E3). Unit: header and controls fold for `TWN`. Upgrade
check: `INTENDED_ADDITIONS` +1 migration, +2 roles, +1 schema registry row. Regression:
`test:int:all`, acceptance, typecheck, boundaries.

**Exit criteria for M1.** All of the above green locally with the API stopped; the Phase 5 branch's
CI green except `supply-chain`; `PHASE5_REPORT.md` opened with the M1 evidence table. No UI in M1.

## 12. Estimated implementation time

Five to six weeks in total (§5). P5-M1 is four to five days from approval.
