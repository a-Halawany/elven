# THE EYE — Phase 5 Report: Digital Twins + Simulation (L5, L8)

> Evidence per stage of [PHASE5_BUILD_PLAN.md](PHASE5_BUILD_PLAN.md). E1–E8 and the grounding
> rules were frozen at the first implementation commit on `phase5-twins` (branched from PR #38
> head `879ce2d8`). Every stage's evidence is established through the real database and
> controller harness; browser evidence is stated separately.

## 0. Freeze record

* Plan revision frozen: the PR #40 head carrying the consolidated pre-freeze corrections (§13).
* Baseline: PR #38 head `879ce2d8fece1daaa8aa21be51fe55b7ce335169`.
* Not broadened after this point unless new evidence shows a specific constitutional violation.

## 1. P5-M1 — the twin registry (migration `0032_twin_registry`)

**What exists now.** The `twin` schema: registries of twin kinds (material keys) and behaviour
models (required inputs); twins (events + projection); versions that are drafts until admitted,
immutable after (a trigger allows only the verification state to change, and only by event),
branchable (`branch_id`, `forked_from_version`, `supersedes`) with carry-forward on open; state
elements with a constrained kind, `basis_truth_state`, typed `citations[]` (a `citations_ok`
check that fails closed on null or malformed nested fields), materiality derived in the port from
the registries, component health, per-element synthetic state and controls; ports `declare_twin`,
`open_version`, `ground_element`, `state_set_digest`, `missing_required_keys`, `admit_version`,
`mark_unverified`; `TWN@v1` in the schema registry; `twin.version.admit → ['TWN']` in the
canonical write actions; `TWN` as a Strategy Graph dependent with target kind `twin` (`SIM`
reserved and refused until 0033); roles `twin_owner`, `simulation_operator`; FORCE RLS on every
table; `twin.rebuild_projections()`. Routes: `twins/declare`, `/:id/versions/open`,
`/:id/versions/:v/ground`, `/:id/versions/:v/ground-series`, `/:id/versions/:v/admit`,
`/list`, `/:id/get`, `/:id/as-of`, `/:id/compare`, `/behaviour-models/list`. Fixture:
`routes-and-terms-2024Q1.csv` in the NORDWERK upload set (manifest-listed, synthetic).

**Evidence — `test/int/phase5-twins.test.ts`, 15 / 15 through the real database and controllers:**

| Criterion | What was proved |
|---|---|
| E1 · record time | a draft with `known_at = 2020-01-01` grounds the transit series with **0 observations** (health incomplete, no citation) although `observed_through = 2023-11-20`; replay evidence recorded in 2026 is never "known in 2020" |
| E1 · world time | a draft with `known_at` after the recording and `observed_through = 2023-11-20` grounds **1 054 points, latest 2023-11-20**, citing exactly the 3 evidence versions that contributed; a synthetic restated December window recorded before `known_at` but observed after the cut-off does **not** fold in; a revision recorded **after** `known_at` is invisible (every citation is version 1) |
| E1 · materiality and substantiation | `inventory.on_hand` (material by the registries) substantiated only by an entity is refused — also when the caller sends `material: false`; an immaterial context key may be entity-named |
| E2 · derived truth state | an `extracted` claim cannot ground an `observed` element (422); grounded as `estimated` it keeps `basis_truth_state = extracted`; the database refuses the laundering directly (append-only) |
| E2 · synthetic folds upward | a version citing a synthetic contract's evidence is admitted with `synthetic_state = true` on the version, the twin and the `TWN` header, while `truth_state` stays `asserted`; classification `confidential` and residency `EU-only` inherited through the fold |
| E1 · required inputs | a version missing 9 of 14 required keys is refused (409) unless admitted explicitly as `incomplete`, which is then marked with its missing keys |
| E3 · immutability | grounding into an admitted version is refused (409); `UPDATE` of its digest and `DELETE` are refused by trigger |
| E3 · new version, supersedes | a change opens version 2 with carry-forward minus the re-grounded key; different state-set digest; `supersedes` on the row and `TWN:<id>@1` on the header |
| E3 · branches | `alt-no-shock` forked from v1 coexists with `actual`; comparison lists exactly the differing key and changes neither digest; as-of per branch returns each branch's latest admitted version; as-of before any admission returns nothing |
| E3 · verification by event | `mark_unverified` appends an event; the projection reflects `unverified`; digest, header digest, element count and admission time unchanged; `rebuild_projections()` reports 0 mismatches |
| admission boundaries | a `prediction.forecast.issue` write cannot admit a `TWN`; a `twin.version.admit` write cannot admit a `FCT`; neither object exists afterwards; a simulation operator cannot declare, version, ground or admit (403); null digest, string version, unknown kind, non-array and null citations all fail a CHECK; `citations_ok` returns false |

Unit: `test/unit/phase5-twins.test.ts` 4 / 4 (intake validation, no caller-set materiality,
entity digest stability, fail-closed fold).

## 2. P5-M2 — `supply-flow@1`

`src/twin/models/supply-flow.ts` executes PHASE5_BUILD_PLAN.md §6b: daily steps, arrivals before
consumption, `daily = weekly / 7` at full precision, `hold_safety_stock` vs `consume_to_zero`,
exposure by position, `reroute` / `air_bridge` / `draw_down` / `none` (combinable, canonically
ordered), costs, half-even canonicalisation (quantities 3 dp, money 2 dp), and the explicitly
seeded `xoshiro128**@1` lead-time jitter as the only stochastic element. The implementation
digest `7f129e6f…` (`supply-flow.digest.ts`) is the sha256 of the source; a unit control
recomputes it.

**Evidence — `test/unit/phase5-supply-flow.test.ts`, 11 / 11**, the §6b checkpoints reproduced by
execution on the corrected fixture: control without shock stops on **2024-01-28** for **15 days,
€2 130 000**, 4471 landing **2024-02-12**; with the shock 4471 is exposed, lands **2024-02-26**,
**29 days, €4 118 000**; a shipment past the chokepoint is not exposed; `draw_down` alone with
the shock: **0** line-stop days, on-hand **2 942.857** at the start of 2024-02-26, below safety
stock from 2024-01-28, and without 4471 the first stop would be **2024-02-28**;
`reroute(SYN-SHIP-4472)` lands **2024-03-04**, **€48 100**, and 4471 (`at risk`) cannot be
rerouted; `air_bridge(1 week, 2024-01-17)` lands **9 200 on 2024-01-24, €79 540.00**; combined
interventions apply once each; identical inputs give identical digests regardless of
intervention order; the seeded mode reproduces for the same seed and differs for another;
unseeded stochastic and incomplete contracts are refused; canonicalisation is half-even.

## 3. P5-M3 (with the M4 scope it absorbed) — simulation runs (migration `0033_simulation_runs`)

**What exists now.** The `simulation` schema: runs (events + projection) whose experiment
contract is bound at opening — twin version and branch, `run_kind` (`control` with intervention
`none` and `control_run_id = null`, or `intervention` referencing a completed compatible
control), the **immutable resolved initial-state snapshot** taken by the port from the admitted
version with citations and controls under its two cut-offs, the pinned implementation digest
(0033 binds `7f129e6f…` to `supply-flow@1`; a run offering another is refused), the environment
digest, stochastic mode with RNG/seed/samples/jitter, interventions, constraints, assumptions,
`inputs_digest`; then outputs, `outputs_digest` over the semantic outputs only, one-at-a-time
sensitivity with envelope marking, and the SIM canonical object admitted as `synthetic`.
Completed runs are immutable by trigger; a failed completion is recorded as `failed` with its
reason. Reproductions re-execute from the stored contract (never from the twin) and record
`reproduced` / `mismatch` / `unreproducible` with the environment match and whether the process
was cold. `SIM@v1`; `simulation.run.complete → ['SIM']`; `SIM` as a Strategy Graph dependent
with target kinds `twin` and `run`; roles as declared; FORCE RLS; `simulation.rebuild_projections()`.
Routes: `twins/simulations/run` (two governed writes: open, then complete), `/:id/reproduce`,
`/compare`, `/list`, `/:id/get`.

**Evidence — `test/int/phase5-simulations.test.ts`, 8 / 8 through the real database and controller:**

| Criterion | What was proved |
|---|---|
| E5 · contract complete or refused | a control that references a control, an intervention without one, an unseeded stochastic run, an empty intervention list and a horizon outside the envelope are all refused (422) and nothing is recorded |
| E5/E2 · control run | completes with **29 line-stop days, €4 118 000** (the §6b anchor); `control_run_id` null; 64-hex `outputs_digest` and `initial_state_digest`; the snapshot holds all 16 elements; the SIM object is `truth_state = synthetic`, `synthetic_state = true`, `SIM@v1`; a `SIM → twin` dependency; sensitivity names `shock.corridor_delay_days`; not outside the envelope |
| E5/E6 · intervention and comparison | `reroute(SYN-SHIP-4472)` on the control costs **€48 100**, depends on `run` and `twin`; an intervention naming another intervention as control is refused; a control without the shock is a different contract — compatible only with a no-shock intervention, incompatible otherwise; a control on another twin version (corridor delay 30 → **45** stop days) cannot be a control for this version and cannot be compared with it (422); comparing control, reroute, air bridge and draw-down on the common baseline yields **29 / 29 / 22 / 0** line-stop days, the air case totalling **€3 203 540.00** |
| E5 · immutability | a completed run's outputs cannot be updated and the row cannot be deleted; a run on an explicitly incomplete twin version is refused; a twin owner may also run |
| E4 · reproduction | the same process reproduces the control (`reproduced`, actual = expected, environment matches, recorded); a **seeded** run (`xoshiro128**@1`, seed 42, 50 samples) reproduces; a **cold `node` process** re-executes the stored contract with the pinned implementation and reaches the identical digest, recorded as a cold reproduction |
| E4 · unreproducible | with the registry's pinned implementation changed, the verdict is `unreproducible` with no actual digest and the reason recorded, and no new run can open against it; the reproduction ledger reads `reproduced, reproduced, unreproducible`; reproducing an unknown run is 404 |
| admission boundaries | `simulation.run.complete` cannot admit a `TWN`, `twin.version.admit` cannot admit a `SIM`, neither object exists afterwards; `rebuild_projections()` reports 0 mismatches |

Unit: `test/unit/phase5-supply-flow.test.ts` 11 / 11 (§2).

## 4. P5-M5 — propagation through the operator-initiated walk; reconciliation (migration `0034_twin_propagation_and_reconciliation`)

**What exists now.** `graph.invalidations_current` carries `affected_twins` and
`affected_simulations`; `graph.record_impact` (0029's signature retired) marks every admitted,
still-verified twin version that **cites the object the walk came through** as unverified — by
calling the twin port, which appends the event and updates the projection — and surfaces every
run the walk reached with a `run.unverified` event, leaving the run immutable. The Phase 3 walk
reaches `TWN` through `evidence` / `claim` / `entity` / `strategy` / `forecast` dependencies and
`SIM` through `twin` and `run`, in the same table and the same bounded traversal; the statement
names the twins and runs. A twin's `get` lists **`propagation_pending`**: applied correction
cases whose affected evidence the twin cites and whose walk has not completed. Nothing is
automatic — the `CorrectionApplied` consumer stays deferred. `twin.reconciliations` (append-only)
and `twin.record_reconciliation` record the difference between a simulated or predicted element
and a later complete observed element of the same key; neither element changes.
Routes: `twins/:id/reconcile`; `twins/:id/get` now returns `reconciliations` and `propagation_pending`.

**Evidence — `test/int/phase5-propagation.test.ts`, 4 / 4 through the real database and controllers:**

| Criterion | What was proved |
|---|---|
| E7 · pending before the walk | a Phase 1 correction case submitted and applied (collection manager) against the evidence the `shock.corridor_delay_days` assumption cites appears on the twin as `propagation_pending`; the citing version is still `verified` — nothing moved without an operator |
| E7 · the walk | the strategy owner runs `graph/impact/propagate` on the corrected evidence with the case id: the walk reports the twin and **both** runs (control and intervention); the statement reads "1 twin(s) whose citing versions are marked unverified and 2 simulation run(s) surfaced"; the version is `unverified` with one `version.unverified` event naming the invalidation; `affected_twins` and `affected_simulations` are recorded; two `run.unverified` events exist; the runs stay `completed` with their digests; a later run on that version carries `UNVERIFIED` in its validation status; the case no longer shows as pending |
| E7 · precision | a version on another branch that does not cite the corrected object is left `verified` by a second walk |
| E3 · reconciliation | a `simulated` element citing the control run (synthetic) is reconciled against a later `observed` element of the same key: the numeric difference **157.143** is recorded with both citations, the simulated value is unchanged, and an observed element cannot be reconciled "as if" simulated |

