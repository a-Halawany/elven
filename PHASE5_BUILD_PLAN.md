# THE EYE — Phase 5 Product Build Plan: Digital Twins + Simulation (L5, L8)

> Scope comes strictly from the frozen roadmap (`docs/the-eye-master-build-prompt.md`, Phase 5),
> the constitution's twin and simulation chapters (Volume 0 §12, §15; invariants C-018, C-019,
> C-023) and the boundary the demonstration already promises
> (`docs/phase1/DEMO_STORYBOARD.md` §2, row 5). It does not touch Phases 6–7.
>
> **Status: APPROVED 2026-09-06 with the pre-freeze corrections of the consolidated review
> incorporated (§13).** The four owner decisions are confirmed: object codes `TWN` and `SIM`;
> `supply-flow@1` limited to the deterministic flow model and its explicitly seeded stochastic
> lead-time mode; `routes-and-terms-2024Q1.csv` as governed synthetic evidence through the existing
> file connector; implementation stacked on the current PR #38 head. **E1–E8 (§6) and the grounding
> rules (§6a) are FROZEN** as of the first implementation commit on `phase5-twins`; they are not
> broadened after implementation begins unless new evidence shows a specific constitutional
> violation. The first stage is defined in §11.

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

**Baseline: Phase 4 at PR #38 head `879ce2d8fece1daaa8aa21be51fe55b7ce335169`** — the reviewed
implementation whose functional correction review is closed at `98e7d9e6` (PHASE4_REPORT.md §13),
plus the commit that records that closure. It is unmerged behind the red C15 gate; Phase 5 is
built on it (§9) and its merge is sequenced after it. Phase 3 is merged (`6914af03` + `4491c7f5`).

**Two cut-offs, never one.** Phase 4's `knownAt` is RECORD time and `observedThrough` is WORLD
time. The corridor replay evidence was captured and recorded in 2026; an instantiation with
`known_at = 2024-01-17` would return no evidence at all, and nothing in Phase 5 backdates
`recorded_at` or describes replay evidence as "known in January 2024". A twin version and a run
store and display **both**: `known_at` (the record-time cut-off at which the evidence was read —
for the replay, the actual 2026 record-time cut-off) and `observed_through` (the world-time cut-off
— for Act V, 2024-01-17). E1 tests each cut-off independently.

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
| **Twin registry** | A `TWN` canonical object per twin, versioned. A twin version declares **identity and scope** (the real system, its boundary as a set of Phase 3 entities, owner, intended decisions), **interfaces** (control variables, policy limits), **behaviour model** (a pinned `method_ref`, e.g. `supply-flow@1`), **validation** (status, operating envelope, known limitations) and **assumptions** (`ASU` objects it rests on). Truth state `asserted` — a person declared it; `synthetic_state` folds up from what it cites. **A version is a draft until admitted:** a draft accumulates state elements, and admission **atomically binds the complete state set — its canonical digest — into the `TWN` canonical version** in the same transaction. Once admitted a version is immutable: grounding or changing state creates a new draft version. Every version carries explicit **branch lineage** — `branch_id` and `forked_from_version` — so an actual branch and an alternative branch coexist, compare element by element, and never overwrite one another. Verification changes (`verified` → `unverified`) are append-only events reflected through the projection, never edits to a version. |
| **Grounded state** | Every **state element** of a twin version has a `kind` — `observed`, `estimated`, `assumed`, `predicted`, `simulated` — never collapsed (C-018, constitutional rule 5) — and typed **`citations[]`**, each binding an exact object id, version and digest: `{ kind: evidence \| claim \| entity \| forecast \| assumption \| run, id, version, digest }`. An **entity citation identifies the subject or boundary of an element; it cannot by itself substantiate a material value** — a material element needs at least one evidence, claim, forecast, assumption or run citation. An `observed` element is created only from a directly observed evidence point (a series point read through Phase 4's known-at path, or an uploaded record) or a claim whose truth state is `observed`; an `extracted`, `inferred` or `assessed` claim yields an `estimated` element that **retains the claim's truth state** in `basis_truth_state` — it cannot silently become observed. A `predicted` element cites exactly one `FCT` version and inherits its validation state; an `assumed` element cites an `ASU` or the uploaded document that states it; a `simulated` element cites the `SIM` that produced it and is `synthetic`. **Materiality is not the caller's to declare:** the behaviour model's parameter schema names its required inputs and the twin schema names the material elements of the twin's kind; an element under a required key is material whatever the caller sends, and a required element that is missing, unreadable, stale beyond its declared validity or incomplete makes the version's **component health** visibly incomplete and prevents any run that needs it. Synthetic state folds **upward**: a twin version whose cited objects include a synthetic one carries `synthetic_state = true` even though its declaration is `asserted` — the NORDWERK twin is synthetic — and the UI shows both the element kind and whether its underlying world is synthetic. |
| **Behaviour model registry** | Deterministic, version-pinned model implementations behind a method registry — the same discipline as Phase 4's parsers and forecasters. Phase 5 ships one: `supply-flow@1`, a daily discrete-time flow model (inventory, consumption, shipments with ETAs, safety stock, line stop, costs). Its parameters are twin state elements, never literals. The Model Gateway is not a behaviour model. |
| **Simulation runs** | A `SIM` canonical object per run, **immutable once completed** (Vol 0 §15 experiment contract). `run_kind` is `control` or `intervention`. A **control** run applies intervention `none` and has `control_run_id = null`; every **intervention** run references a completed, compatible control run — same twin version, same resolved initial state (by digest), same behaviour model implementation, same assumptions and constraints — and an incompatible reference is refused, as is a comparison across incompatible runs. A run declares: twin version and branch, scenario version (optional), an **immutable resolved initial-state snapshot** (every element with its citations and inherited controls, plus `known_at` and `observed_through`), interventions (typed: `reroute`, `air_bridge`, `draw_down`, `none`; combinable), constraints and policy limits, assumptions, the **exact behaviour-model implementation digest**, the **runtime/environment digest**, the stochastic mode (`deterministic` or `seeded`) with **RNG algorithm and version, seed and sample count**, responsible operator, outputs (daily trajectories and totals), uncertainty, sensitivity, validation status. Truth state `synthetic`, `synthetic_state = true` (the 0023 constraint). |
| **Reproducibility** | `inputs_digest` over the canonicalised experiment contract (snapshot, interventions, constraints, assumptions, model implementation digest, environment digest, stochastic mode, RNG, seed, samples). `outputs_digest` over the **deterministic semantic outputs only** — fixed units, fixed ordering (component key, then date), numeric canonicalisation (quantities to 3 decimals, money to 2, half-even) — and never over audit timestamps, generated ids, receipts or reproduction-record metadata. **Reproduce** re-executes a completed run in a cold process **from the stored contract and the pinned implementation**, never by reassembling the twin from newer evidence, and records the verdict; a mismatch is a recorded failure. When policy, withdrawal or governed deletion makes a required artefact unavailable, the reproduction records `unreproducible` with the reason rather than substituting later state. |
| **Sensitivity and comparison** | One-at-a-time perturbation of each declared assumption within its declared range, reporting output deltas — "the assumptions carrying the result". Compare any runs sharing a control case on identical output keys. |
| **Reconciliation and propagation** | A `simulated` or `predicted` element can later be **reconciled** against an `observed` one (the difference is recorded, nothing overwritten). Propagation follows the **operator-initiated lifecycle Phase 3 and 4 use today**, because the automatic `CorrectionApplied` consumer stays deferred: a correction case becomes `awaiting`; an authorised operator runs the dependency walk (`graph/impact/propagate`); the resulting impact event marks the affected element and twin version **unverified** through an append-only event reflected in the projection, and surfaces every run built on that version. Until the walk runs, the twin shows **propagation pending** for the awaiting case. Nothing claims automatic propagation. |

**Data model.** Forward migrations at the next unused number when implementation starts (`0032`
at the time of writing), in the shape of `0029`–`0031`: `twin.*` and `simulation.*` with event
logs + projections, scope triple NOT NULL and CHECK-constrained, `FORCE ROW LEVEL SECURITY`,
SECURITY DEFINER ports asserting the caller's own bound action, append-only where the
constitution says immutable. The post-C18 upgrade check is extended by one line — **not a new
gate**.

**Every admission boundary for `TWN` and `SIM`, inventoried and proved.** Each row is a change
Phase 5 makes and a control that proves a method or action authorised for another object type
cannot admit a `TWN` or a `SIM`:

| Boundary | `TWN` | `SIM` |
|---|---|---|
| `objects.schema_registry` | `TWN@v1` (declaration + state-set digest + branch lineage) | `SIM@v1` (experiment contract + digests) |
| `observation.canonical_write_actions` (action → object types) | `twin.version.admit` → `['TWN']` | `simulation.run.complete` → `['SIM']` |
| method-to-object permissions (`objects.admit_version` checks the bound action's object types) | `twin.version.admit` only | `simulation.run.complete` only |
| database ports | `twin.declare_twin`, `twin.open_version`, `twin.ground_element`, `twin.admit_version`, `twin.mark_unverified` | `simulation.open_run`, `simulation.complete_run`, `simulation.record_reproduction`, `simulation.record_sensitivity` |
| `graph.dependency_dependent_exists` / dependency kinds | dependent `TWN`; target kind `twin` | dependent `SIM`; target kinds `twin`, `run` |
| `record_impact` buckets | `twins` | `simulations` |
| API capability contracts | `TwinWrites`, `TwinReads` | `SimulationWrites`, `SimulationReads` |
| PDP actions and roles | `twin.declare`, `twin.version`, `twin.ground`, `twin.version.admit`, `twin.read` — `twin_owner` | `simulation.run`, `simulation.run.complete`, `simulation.reproduce`, `simulation.read` — `simulation_operator` |
| UI object mappings | Twins workspace: `TWN` badges, kinds, synthetic-world marker | Simulations workspace: `SIM` badges, `SYNTHETIC` on every value |
| Controls | a `prediction.forecast.issue`-authorised writer cannot admit a `TWN`; `twin.version.admit` cannot admit a `SIM`; a `SIM` cannot be admitted through `twin.*`; a null or malformed nested citation field fails the JSON CHECK closed | the same in the other direction |

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
through the scenario branch — observations through `observed_through = 2024-01-17`, read at the
actual 2026 record-time cut-off of the replay evidence — not the corridor forecast, and no
accuracy is claimed for the twin itself: its grounding is a synthetic company, so its validation
status is **`unvalidated (synthetic grounding)`** and stays that way in Phase 5. That is stated on
screen, with `known_at` and `observed_through` beside it.

## 5. Implementation stages and dependencies

| Stage | Deliverable | Depends on | Est. |
|---|---|---|---|
| **P5-M1** | Migration `0032`: `twin` schema, `TWN@v1`, roles and actions, grounded state elements with kinds and citations, as-of instantiation; upgrade check +1 line; the `routes-and-terms` synthetic upload | Phase 3 (merged); Phase 4 series path for observed elements (PR #38 branch) | 4–5 days |
| **P5-M2** | Behaviour model registry + `supply-flow@1` (pure, deterministic, with the explicitly seeded stochastic lead-time mode), implemented from the **executable specification in §6b** and golden-tested against trajectories and digests **derived from the corrected fixture**, never from the earlier prose arithmetic (which was inconsistent: with 63 400 sets, 9 200/week and arrivals of 38 400 and 41 000, 1 March holds ≈ 78 400, not a breach) | none beyond M1's parameter shape | 3–4 days |
| **P5-M3** | `simulation` schema, `SIM@v1`, run contract admission, `run_kind` control/intervention with compatibility, immutable initial-state snapshot, implementation and environment digests, interventions, outputs, `inputs_digest`/`outputs_digest`, cold reproduction with `unreproducible` | M1, M2 | 5–6 days |
| **P5-M4** | Sensitivity (one-at-a-time), seeded stochastic lead-time option (Monte Carlo N with declared seed), comparison on a common baseline, operating-envelope marking | M3 | 3–4 days |
| **P5-M5** | Reconciliation of simulated/predicted elements against later observation; propagation through the operator-initiated walk: corrections reach twin versions and runs (dependents in `graph.dependencies`, `record_impact` buckets, `propagation pending` before the walk) | M1, M3; Phase 3 propagation | 3–4 days |
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
| **E1** | **A twin instantiates from graph + evidence, under two cut-offs.** Every material state element carries typed `citations[]` with exact ids, versions and digests; an entity citation names the subject and never substantiates a value; materiality comes from the twin and behaviour-model schemas, not from the caller; a version with an unsubstantiated material element is **refused at admission**, and a required element that is missing, unreadable or stale makes component health incomplete and blocks any run needing it. **Record time and world time are tested independently:** a `known_at` before the replay evidence's record time yields no elements; a `known_at` after it with `observed_through = 2024-01-17` yields the January observations and nothing later; a version recorded after `known_at` is invisible. |
| **E2** | **Observed ≠ estimated ≠ assumed ≠ predicted ≠ simulated, and never collapsed.** Element kinds are constrained in the database and shown on screen beside whether the underlying world is synthetic; an `observed` element comes only from a directly observed evidence point or an `observed` claim, an extracted or inferred claim yields `estimated` with its truth state retained; a simulated element and every run output carry `truth_state = synthetic` and `synthetic_state = true`; synthetic state folds upward so the NORDWERK twin is `synthetic_state = true` though `asserted`; a predicted element inherits its forecast's validation state; a twin whose grounding is synthetic says `unvalidated (synthetic grounding)`. |
| **E3** | **Twin versionability.** A draft accumulates state; admission atomically binds the complete state-set digest into the `TWN` version; an admitted version is immutable and any further grounding is a new version with `supersedes`; verification changes are append-only events reflected through the projection. Every version carries `branch_id` and `forked_from_version`; an actual branch and an alternative branch coexist, compare element by element and never overwrite one another; a known-at query returns the twin as it stood; a simulated or predicted element can be reconciled against a later observation with the difference recorded and nothing overwritten. |
| **E4** | **Reproducibility.** A cold process re-executes a completed run from its stored contract — the immutable resolved initial-state snapshot, interventions, constraints, assumptions, the pinned behaviour-model implementation digest, environment digest, stochastic mode, RNG algorithm/version, seed and sample count — and yields an identical `outputs_digest`, defined over deterministic semantic outputs only with fixed units, ordering and numeric canonicalisation; it never reassembles from newer evidence. The reproduction is recorded with its verdict; a mismatch is a recorded failure; an artefact made unavailable by policy, withdrawal or governed deletion yields a recorded `unreproducible`, never substituted later state. The seeded stochastic mode reproduces; an unseeded stochastic run is refused. |
| **E5** | **The experiment contract is complete or the run is refused.** A run without twin version and branch, `known_at` and `observed_through`, behaviour-model implementation digest, interventions (`none` is an intervention), constraints, `run_kind`, responsible operator or — when seeded — RNG, seed and sample count is refused at admission. A `control` run has intervention `none` and `control_run_id = null`; an `intervention` run must reference a completed compatible control (same twin version, initial-state digest, implementation digest, assumptions and constraints) or it is refused; a completed run is immutable; a correction produces a new run linked to the original. |
| **E6** | **Common baseline and the assumptions carrying the result.** Intervention runs compare only against their compatible control, and a comparison across incompatible runs is refused; every run reports one-at-a-time sensitivity over its declared assumptions; when an assumption is pushed outside the model's validated operating envelope the outputs are marked, not hidden. |
| **E7** | **Corrections reach twins and runs through the operator-initiated walk.** When evidence a state element cites is corrected or withdrawn, the correction case becomes `awaiting` and the twin shows `propagation pending`; an authorised operator runs the dependency walk, and its impact event marks the element and its twin version unverified (append-only, reflected in the projection) and surfaces every run built on it — Phase 3's propagation, extended through Phase 4's forecasts to twins and simulations, asserted end to end. No automatic propagation is claimed while the `CorrectionApplied` consumer stays deferred. |
| **E8** | **Phase 0–4 regression**: full CI green, no constitutional invariant weakened, C18 still frozen at 0021, the Phase 1–4 operator journeys unchanged, source decisions preserved, the automatic CorrectionApplied consumer still deferred. |

**Measured targets.** Unlike Phase 4 there is no accuracy target: the twin's grounding is a
synthetic company, so a "twin accuracy" number would describe fiction. The measurable claims are
E4's digest equality across N reproductions (N ≥ 3 including a cold process), E6's sensitivity
report on every run, E1's refusal rate on unsubstantiated material elements (100% refused), and
the admission-boundary controls of §3 (100% refused across object types). Twin validation against
real outcomes begins when a twin is grounded in real enterprise records, which is outside Phase 5.

## 6a. Twin grounding rules (to be frozen with E1–E8)

| # | Rule |
|---|---|
| **1** | A state element is `observed` only when it is read from a directly observed evidence point (a series point or an uploaded record) or a claim whose truth state is `observed`, through the known-at path. A claim whose truth state is `extracted`, `inferred` or `assessed` yields an `estimated` element that records that truth state in `basis_truth_state`; anything computed from observations is `estimated`. |
| **2** | Costs, lead times, contractual terms and thresholds are `assumed`: they cite an `ASU` object or the uploaded document that states them, never a literal in code. |
| **3** | A behaviour model's parameters are state elements of the twin version the run declares; a run cannot pass a parameter the twin does not hold. Which elements are material and which inputs are required is declared by the twin schema and the behaviour-model schema, never by the caller; an entity citation identifies a subject and substantiates no value. |
| **4** | A `predicted` element cites exactly one forecast version and inherits its validation state; `validation_impossible` or `unvalidated` inputs make the run say so in its own validation status. |
| **5** | A run reads the twin under two cut-offs — `known_at` (record time) and `observed_through` (world time) — stores both in its immutable initial-state snapshot, and nothing recorded after `known_at` or observed after `observed_through` reaches it. Replay evidence is never described as known before it was recorded. |
| **6** | Simulated output never becomes an `observed` element. Reconciliation records the difference between a simulated element and a later observation; it does not replace either. |
| **7** | Inherited controls fold from every cited object into the twin version, and from the twin version and the scenario into the run (Phase 4's `foldControls`, fail-closed). |
| **8** | The Model Gateway may narrate a run; it may not produce, adjust or select a number in it. |

## 6b. `supply-flow@1` — the executable specification (frozen with E1–E8)

The behaviour model is specified here to the day, so that its golden tests are **derived from the
corrected fixture by executing this specification**, and never frozen from prose arithmetic.

**Time.** Daily discrete steps. `t0` is the `valid_from` of the inventory element (the upload's
as-of date, `2024-01-11`); the horizon `H` is a constraint (Act V: 90 days, through
`2024-04-09`). Dates are UTC calendar days.

**Order of a day.** (1) arrivals available at plant are added at the start of the day; (2) the day's
consumption is taken; (3) end-of-day state is recorded. `on_hand_end(t) = on_hand_start(t) +
arrivals(t) − consumed(t)`.

**Consumption.** `daily = weekly_consumption / 7`, carried at full double precision through the
recursion and canonicalised only on output (quantities to 3 decimals, half-even). Consumption is
taken every calendar day (no working-day calendar in v1; that is a declared limitation).

**Production policy and `draw_down`.** The twin holds `production_policy`. Under the control
policy `hold_safety_stock`, production on day `t` runs only if `on_hand_start(t) + arrivals(t) −
daily ≥ safety_stock`; otherwise the line stops that day (`consumed = 0`, a line-stop day, cost
`line_stop_cost_per_day`). The intervention **`draw_down`** switches the policy to
`consume_to_zero` for a declared period: production runs whenever `on_hand_start + arrivals ≥
daily`, and the days on which `on_hand_end < safety_stock` are counted as **days below safety
stock**. `draw_down` is therefore a policy decision to spend the buffer, with its exposure counted,
not a free lunch.

**Shipments and arrivals.** A shipment `s` has `qty`, `eta_port` (the fixture's `eta_rotterdam`),
`position_at_t0` and a route. Plant arrival `= eta_port + inland_days` (route element: 14 = 42
door-to-door − 28 port-to-port). A shipment is **exposed** to the corridor shock when its
`position_at_t0` is before or at the chokepoint on the standing route — `Ningbo`, `Malacca
Strait`, `Approaching Bab el-Mandeb` — and not exposed when past it (`Suez transit`). The shock
(the flipped scenario branch) adds `corridor_delay_days` (an `assumed` element, cited to the
terms upload; Act V: 14) to the plant arrival of every exposed, un-rerouted shipment.

**Interventions** (a run may declare several; each is applied to its target once):
* `reroute(shipment)` — allowed only for shipments whose fixture status is `reroutable` or
  `bookable`; removes the exposure; plant arrival `= eta_port + reroute_delay_days (11) +
  inland_days`; cost `= containers × reroute_cost_per_container` with `containers =
  ceil(qty / units_per_container)`, `units_per_container = 1 600` (38 400 sets / 24 containers).
* `air_bridge(component, weeks, decision_date)` — adds `weeks × weekly_consumption` units
  arriving on `decision_date + air_lead_days (7)`; cost `= units × kg_per_unit ×
  air_cost_per_kg` with `kg_per_unit = 4 100 / 9 200 = 0.445652…` carried at full precision from
  the two cited figures, `air_cost_per_kg = 19.40`.
* `draw_down(component, from, to)` — as above.
* `none` — the control.

**Costs.** `reroute` and `air` as above; `line_stop_cost_per_day = 142 000`; `total = reroute +
air + line_stop`. Liquidated damages are **not modelled** in v1 (declared limitation). Money is
canonicalised to 2 decimals, half-even, in EUR.

**Stochastic mode (seeded).** `lead_time_jitter`: for each shipment, plant arrival shifts by an
integer number of days drawn from a declared discrete distribution (Act V: `{−2: 0.1, 0: 0.6,
+2: 0.2, +5: 0.1}`), using **`xoshiro128**` (declared version)** seeded from the run's `seed`
and the shipment's stable index, `samples = N` runs; outputs are the per-sample totals and their
canonicalised summary (min, p10, median, p90, max). The same seed reproduces the same draws;
`deterministic` mode draws nothing.

**Outputs (semantic, digested).** Per component, per day: `date, on_hand_start, arrivals,
consumed, on_hand_end, line_stop, below_safety_stock`; totals: `line_stop_days,
days_below_safety_stock, min_on_hand, first_line_stop_date, cost { reroute, air, line_stop,
total }`; ordering by component key then date; nothing else enters `outputs_digest`.

**Checkpoints the executed specification must reproduce** (hand-derived from the fixture, used
as sanity anchors for the generated golden trajectories, not as the trajectories themselves):
* Control, no shock: `SYN-PART-MAG` starts at 63 400 on 2024-01-11 with `daily = 1 314.285 714…`;
  under `hold_safety_stock` the last full production day before the floor is the day on which
  `63 400 − k·daily ≥ 40 000` last holds, `k = 17` → **2024-01-27**; the line stops from
  **2024-01-28** until `SYN-SHIP-4471` (38 400) lands at plant on **2024-02-12** (`eta_port
  2024-01-29 + 14`), i.e. **15 line-stop days = €2 130 000**.
* Control, with the Act V shock (`corridor_delay_days = 14`): `SYN-SHIP-4471` is exposed
  (`Approaching Bab el-Mandeb`) and lands **2024-02-26**; line stops 2024-01-28 → 2024-02-25 =
  **29 days = €4 118 000**.
* `draw_down` alone, with the shock: consumption continues; `63 400 / daily = 48.24` → on-hand
  falls below `daily` after **48** full days, so the first line-stop day would be **2024-02-28**,
  but 4471 lands 2024-02-26 → **0 line-stop days**, on-hand at start of 2024-02-26 = `63 400 −
  46·daily = 2 942.857…`, days below safety stock counted from **2024-01-28** onward.
* `reroute(SYN-SHIP-4472)` with the shock: lands `2024-02-08 + 11 + 14` = **2024-03-04**, cost
  `ceil(41 000 / 1 600) = 26` containers → **€48 100**; `SYN-SHIP-4471` cannot be rerouted (status
  `at risk`) and a run that tries is refused.
* `air_bridge(SYN-PART-MAG, 1 week, 2024-01-17)`: 9 200 units arrive **2024-01-24**; cost
  `9 200 × 0.445652… × 19.40 = €79 540.00`.

Golden tests in M2 are generated by executing this specification on the corrected fixture and
are checked against these anchors before they are committed; the earlier narrative statements
("cover runs to ≈ 2024-02-28", "second reroute breaches safety stock in early March") are
retired, not frozen.

## 7. What this plan deliberately excludes

Decision packages, options, approvers and Decision Replay (Phase 6) · monitoring agents and the
governed release pipeline (Phase 7) · twin templates beyond the supply-chain twin · causal
discovery, optimisation, agent-based or system-dynamics engines (the registry admits them later
as pinned methods; Phase 5 ships one deterministic flow model with a seeded stochastic option) ·
any new source cohort, connector, credential or paid service · any new gate, testing framework or
acceptance matrix beyond E1–E8.

## 8. The end-to-end demonstration — Act V, "before we commit"

Acts I–IV run as today on a fresh database. Then, as the twin owner:

1. **The twin.** Open *NORDWERK — Ningbo → Regensburg chain*, branch `actual`, version 1,
   instantiated with **observations through 2024-01-17, read at the replay evidence's actual
   record-time cut-off** (`observed_through = 2024-01-17`, `known_at =` the 2026 instant at which
   the replay evidence had been recorded — both shown; nothing is presented as known in January
   2024). Its boundary: the chokepoint entities (Bab el-Mandeb, Suez, Cape), the supplier, the
   plant, the route. Its elements by kind: transits **observed** from PortWatch evidence (real,
   attributed); shipments, inventory and consumption **observed** from the uploaded records; route
   days, reroute delta, corridor delay, freight and line-stop costs **assumed**, citing the uploaded
   terms; nothing predicted. The twin is marked **synthetic world** (its cited company records are
   synthetic) and its validation status reads *unvalidated (synthetic grounding)*, in words.
2. **The control.** Run `supply-flow@1` as a `control` run (intervention `none`,
   `control_run_id = null`) on that version's resolved initial-state snapshot, against the flipped
   scenario branch (transits below threshold for five days → `corridor_delay_days`). Output: daily
   on-hand for `SYN-PART-MAG`, line-stop days, days below safety stock, cost — every value marked
   **SYNTHETIC**, with the control's `inputs_digest` and `outputs_digest`.
3. **Interventions on that control.** *Reroute* `SYN-SHIP-4472` via the Cape; *air bridge* one
   week of magnets; *draw-down* of safety stock; and a combined *draw-down + reroute*. Each
   references the control; the comparison shows on-hand, line-stop days, days below safety stock
   and cost side by side, and the sensitivity panel shows that `corridor_delay_days` carries the
   result, not the consumption rate. A comparison against a run on another twin version is refused.
4. **Reproduce.** A cold process re-executes the reroute run from its stored contract: identical
   `outputs_digest`, recorded. Change one assumption by hand: a new run, linked, with a different
   digest and a visible reason.
5. **The correction reaches the twin — through the operator.** The publisher restates one day of
   the corridor series (act IV's correction): the case becomes `awaiting` and the twin shows
   *propagation pending*; the strategy owner runs the dependency walk; the observed element and the
   twin version go *unverified* by event, and the five runs built on it are surfaced beside the
   forecast and the scenario.
6. **What it does not say.** No option is recommended; no decision is recorded. That is Phase 6.

Everything real (PortWatch, ECB) stays attributed; everything synthetic (the company, the runs)
stays marked. The demo Playwright suite gains the Twins and Simulations screens and the reproduce
and compare actions.

## 9. What can proceed while the security maintenance is blocked

The C15 gate is red on the pinned images (PR #39) and no patched official image exists. That
blocks **merges**, not construction:

* **Proceed now, on `phase5-twins` branched from PR #38's current head `879ce2d8`**, carrying
  this revised plan: P5-M1 through P5-M7. Every required check except `supply-chain` runs and is
  expected green on the branch, as it is on PR #38 today; the local regression (`test:int:all`,
  acceptance, upgrade check, demo, browser suite) runs as in Phase 4. Migrations are numbered after
  0031 and remain forward-only.
* **Independent of Phase 4** (could even start from `main`): P5-M2's behaviour model and its
  golden tests, and the `routes-and-terms` synthetic upload — pure code and a fixture. Everything
  that reads series, forecasts or scenarios depends on the Phase 4 branch.
* **Waits for C15 — in this order:** when verified patched images are available, merge the
  governed security maintenance (PR #39 with the digest update and disposition reconciliation)
  first; then rebase and validate PR #38 and merge it; then rebase and validate the Phase 5 PR. The
  downstream C16/C17 steps skipped behind C15 must run green on each final candidate. PR #40 (this
  plan) and the implementation PR stay unmerged until their applicable review and gates finish;
  Phase 5's implementation PR is kept unmerged for one consolidated review like Phase 4's.
* **Continues independently:** the on-demand image recheck; when a verified patched image
  appears, the governed digest update and disposition reconciliation on PR #39 first.

## 10. Owner decisions — confirmed 2026-09-06

1. **Object types `TWN` and `SIM`** — confirmed.
2. **Behaviour model scope** — `supply-flow@1`, limited to the deterministic flow model and its
   explicitly seeded stochastic lead-time mode; no optimisation, agent-based or system-dynamics
   engine in Phase 5 — confirmed.
3. **Synthetic terms as evidence** — `routes-and-terms-2024Q1.csv` as governed synthetic evidence
   through the existing file connector — confirmed.
4. **Branch base** — implementation stacked on the current PR #38 head (`879ce2d8`, including its
   closure documentation); merge order security maintenance → #38 → Phase 5 — confirmed.

No approval is needed for what the plan preserves: the source decisions, the forecast
limitations, the frozen T1–T4 / D1–D8, and the deferred correction consumer.

## 11. The first implementation stage — P5-M1, defined

**Goal.** A twin exists as a governed, versioned, branchable, grounded object, and can be
instantiated from graph + evidence under both cut-offs — E1, the database half of E2, and the
draft/admission, immutability and branch-lineage half of E3 — with every `TWN` admission boundary
proved.

**Migration `0032_twin_registry.sql`** (forward-only):
* `twin.twin_events` (append-only) and `twin.twins_current` (projection): twin id, scope triple,
  title, statement, twin kind (`supply-chain`), boundary (entity ids), owner, intended decisions,
  interfaces, behaviour model ref, validation `{ status, envelope, limitations }`, controls,
  `synthetic_state`, current admitted version per branch.
* `twin.twin_versions` (append-only for admitted rows): `version`, `branch_id`,
  `forked_from_version`, `supersedes`, `state` (`draft` → `admitted`), `known_at`,
  `observed_through`, `state_set_digest` (bound at admission), `element_count`, `completeness`
  (`complete` / `incomplete` with the missing or unreadable required keys), the `TWN` header
  digest, `verification_state` (`verified` / `unverified`) maintained **only** from
  `twin_events`.
* `twin.state_elements` (append-only, per draft version until admission): `key`, `kind` CHECK IN
  (`observed`,`estimated`,`assumed`,`predicted`,`simulated`), `basis_truth_state`, `value` jsonb,
  `unit`, `material` (derived by the port from the twin-kind schema and the behaviour model's
  required inputs, **never taken from the caller**), `citations` jsonb array, `health`
  (`complete`/`incomplete`/`unreadable`/`stale`), `valid_from`, `valid_to`, `confidence`,
  `controls`. CHECKs, all failing closed on null or malformed nested fields: `citations` is an
  array; every citation has `kind ∈ {evidence,claim,entity,forecast,assumption,run}`, a uuid `id`,
  an integer `version` and a 64-hex `digest`; `material ⇒ at least one citation whose kind ≠
  entity`; `observed ⇒ an evidence citation, or a claim citation with basis_truth_state =
  'observed'`; `estimated from a claim ⇒ basis_truth_state ∈ {extracted,inferred,assessed}`;
  `predicted ⇒ exactly one forecast citation`; `simulated ⇒ a run citation`; `assumed ⇒ an
  assumption or evidence citation`.
* `twin.twin_kind_schemas` and `twin.behaviour_models` (registries): the supply-chain twin kind
  names its material keys; `supply-flow@1` names its required inputs, parameter schema, declared
  operating envelope and validation notes; both seeded by the migration.
* Ports (SECURITY DEFINER, `observation.assert_authority` + `assert_scope`):
  `twin.declare_twin`, `twin.open_version` (draft; branch lineage), `twin.ground_element` (draft
  only; derives materiality; folds controls and synthetic state), `twin.admit_version` (binds the
  state-set digest and the canonical `TWN` version atomically, refuses an unsubstantiated material
  element or an incomplete required set unless explicitly admitted as `incomplete`, which then
  blocks runs), `twin.mark_unverified` (event only); `graph.dependencies` dependent type `TWN`
  and target kind `twin`; roles `twin_owner`, `simulation_operator`; PDP rules `twin.declare`,
  `twin.version`, `twin.ground`, `twin.version.admit`, `twin.read`;
  `observation.canonical_write_actions`: `twin.version.admit → ['TWN']`.
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
a boundary entity; a material element substantiated only by an entity citation → refused; a
caller sending `material: false` for a required key → still material, still refused without
substantiation (E1); an extracted claim grounded as `observed` → refused, admitted as `estimated`
with `basis_truth_state` retained (E2); a synthetic upload cited → the version and twin carry
`synthetic_state = true` though `asserted` (E2); **two cut-offs independently**: `known_at`
before the fixture evidence's record time → no observed elements; after it with
`observed_through = 2023-11-20` → observations through that day only; a version recorded after
`known_at` invisible (E1); draft → admit binds `state_set_digest`, a further `ground_element` on
the admitted version is refused and opens version 2 instead; branch `alt` forked from version 1
coexists with branch `actual` and comparing them lists the differing elements without either
changing (E3); `mark_unverified` appends an event and the projection reflects it, the version row
unchanged (E3); admission-boundary controls: `prediction.forecast.issue` cannot admit a `TWN`,
`twin.version.admit` cannot admit a `FCT`, a citation with a null digest or a non-array
`citations` fails closed (§3). Unit: header and controls fold for `TWN`. Upgrade check:
`INTENDED_ADDITIONS` +1 migration, +2 roles, +1 schema registry row. Regression: `test:int:all`,
acceptance, typecheck, boundaries.

**Exit criteria for M1.** All of the above green locally with the API stopped; the Phase 5 branch's
CI green except `supply-chain`; `PHASE5_REPORT.md` opened with the M1 evidence table. No UI in M1.

## 12. Estimated implementation time

Five to six weeks in total (§5). P5-M1 is four to five days from approval.

## 13. Pre-freeze corrections incorporated (consolidated review of PR #40, 2026-09-06)

| # | Correction | Where |
|---|---|---|
| 1 | Replay time: `known_at` is record time; replay evidence was recorded in 2026; both `known_at` and `observed_through` stored and displayed; E1 tests each independently; nothing backdated | §2, §4, §6 E1, §6a rule 5, §8 |
| 2 | Grounding structurally complete: entity citations name subjects only; typed `citations[]` with id/version/digest; observed only from direct evidence or observed claims, derived truth states retained; materiality from schemas, never the caller; required missing/unreadable/stale inputs make health incomplete and block runs; synthetic state folds upward and both are shown | §3, §6 E1/E2, §6a rules 1/3, §11 |
| 3 | Versions immutable and branchable: drafts, atomic admission binding the state-set digest, new version on change, append-only verification events, `branch_id` / `forked_from_version`, coexistence proved | §3, §6 E3, §11 |
| 4 | Reproducibility contract complete: immutable resolved snapshot with citations and controls; implementation, environment, stochastic mode, RNG, seed, samples bound; `outputs_digest` over deterministic semantic outputs only; cold reproduction from the stored contract; `unreproducible` instead of substitution | §3, §6 E4 |
| 5 | Control case: `run_kind = control` with intervention `none` and `control_run_id = null`; intervention runs reference a completed compatible control; incompatible comparisons refused | §3, §6 E5/E6, §8 |
| 6 | Golden arithmetic replaced by the executable specification with exact conventions and hand-derived checkpoints; the earlier prose retired | §5 M2, §6b |
| 7 | Propagation stays operator-initiated while the `CorrectionApplied` consumer is deferred: awaiting → walk → unverified by event; `propagation pending` before the walk | §3, §5 M5, §6 E7, §8 |
| 8 | Every admission boundary for `TWN` and `SIM` inventoried, with cross-type refusal and fail-closed JSON controls | §3, §11 |
| 9 | Branch and merge sequencing: `phase5-twins` from PR #38's current head `879ce2d8`; security maintenance → #38 → Phase 5; PR #40 and the implementation unmerged until review and gates finish | §2, §9, §10 |
| 10 | PR #40's actual CI: `build-test` red once on the unchanged Phase 1 A5 control *EXISTENCE AND TIMING: a foreign-scope probe answers like a non-existent one* (555 / 556; run 34040851665). Run in isolation three times on 2026-09-06: **3 / 3 passed**, not reproduced — recorded as transient, threshold unchanged, not folded into Phase 5. `supply-chain` is independently red on the pinned images (PR #39) | this row |

