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

## 5. P5-M6 — the Twins workspace

A fifth workspace beside Prediction, Graph, Intelligence and Observation (`apps/web/app/twins`,
client `apps/web/lib/twins.ts`), linked from the other shells. **Twins**: the twin's world
(`SYNTHETIC` or observed), validation status and limitations, boundary, versions and branches
(fork lineage, draft/admitted, verified/unverified, complete/incomplete), the two cut-offs in
words ("observations through … read at record time … — nothing recorded after that instant, and
nothing observed after that day, is in this version"), the state-set digest, and every element
with its kind (observed / estimated / assumed / predicted / simulated, plus the claim's truth
state where derived and a `SYNTHETIC WORLD` marker), materiality, health, validity and exact
citations; `PROPAGATION PENDING` for applied corrections no operator has walked; recorded
reconciliations. **Simulations**: run a control or an intervention on an admitted, complete
version against a chosen control; every run listed with its interventions, line-stop days and
cost, `FAILED` with its reason where applicable, `twin version UNVERIFIED` where applicable;
compare selected runs on their common control; a run's bound contract, cut-offs, digests,
totals, the assumptions carrying the result, envelope breaches, reproductions with verdicts; a
governed "Reproduce from the stored contract" action. Every value on that screen is labelled
SYNTHETIC. The screens offer only what the server would allow (twin owner / simulation
operator) and enforce nothing themselves.

## 6. P5-M7 — the end-to-end demonstration and the browser

### 6.1 Act V, through the same servers as acts I–IV

`scripts/phase5/seed-twins.mjs` runs after acts I–IV on the demonstration deployment
(`eye_demo`, API on :3401, degraded journal `apps/api/.eye-local/degraded-demo`), through the
governed routes only. It is idempotent across passes: a persona is reused only when it IS that
persona (a login already belonging to another persona is refused, never re-bound), an open draft
left by an earlier pass is resumed, a series already grounded in that draft is reported rather
than re-grounded (elements are append-only per draft), and a correction already walked is not
staged again (a restatement is an event, not a fixture). The final pass reports **0 problems**:

1. **The twin owner, the boundary, the records.** T. Nakamura (`twin_owner`) is created by the
   platform administrator. The boundary is chosen from the graph acts I–III resolved — the
   company `NORDWERK ANTRIEBSTECHNIK GmbH`, the constrained component `SYN-PART-MAG` and the
   corridor place the graph actually holds (`Suez Canal`; no "Bab el-Mandeb" place entity exists
   in the demonstration graph, and the script does not invent one). The three NORDWERK records
   (inventory, shipments, routes-and-terms) are identified by **downloading their bytes** and
   matching the CSV headers, never by a name; each is `synthetic_state = true` at object level.
2. **Declare.** One twin, `supply-chain`, `supply-flow@1`, validation `unvalidated (synthetic
   grounding)` with four limitations, two intended decisions.
3. **Ground and admit version 1.** `series.transits:chokepoint4` OBSERVED from the PortWatch
   replay — 20 points through 2024-01-17, `known_at` the real 2026 record instant — and 16
   elements citing the uploaded records (all material, synthetic world folded upward);
   ADMITTED complete with its state-set digest bound.
4. **Control.** `run_kind = control`, intervention `none`, on the flipped branch's shock: 29
   line-stop days from 2024-01-28, €4,118,000.00, outputs digest `4345238e…` — the executable
   spec's shock checkpoint (§6b of the plan).
5. **Interventions on that control.** Reroute SYN-SHIP-4472 via the Cape (€48,100 reroute, the
   stop unchanged), the air bridge decided 2024-01-17 (22 stop days, €79,539.97 air), draw-down
   (0 stops, 38 days below safety stock, €0), draw-down + reroute; rerouting the committed
   SYN-SHIP-4471 refused (422); the comparison on one control; the assumption carrying the
   control's result (`terms.line_stop_cost_per_day:SYN-LINE-A1`, spread €823,600.00).
6. **Reproduce.** A cold re-execution in a fresh process from the stored contract and the API's
   own reproduction both return the identical outputs digest: `REPRODUCED`.
7. **Change one assumption by hand.** Branch `alt-30-day-delay`, version 2 forked from 1 with
   carry-forward of everything but the corridor delay (now 30 days): a different state set, a
   different contract, a different digest (45 stop days, €6,390,000.00); versions 1 and 2 differ
   in exactly `shock.corridor_delay_days`; comparing runs on different initial states refused.
8. **The correction reaches the twin through the operator.** A publisher restatement of a corridor
   day is submitted and applied: the twin shows PROPAGATION PENDING and version 1 stays verified —
   nothing moved by itself. The strategy owner runs the walk: version 1 UNVERIFIED by event, the
   six runs built on it surfaced, the alternative branch (which cites the same evidence) unverified.
9. **What the act does not say.** No option is recommended, nothing is decided — Phase 6.

### 6.2 Browser verification

`npx playwright test -c playwright.demo.config.ts` (installed Chrome, against the demonstration
servers) — **12/12**: the ten Phase 4 checks unchanged, plus **TWINS** (as T. Nakamura: the
NORDWERK row `SYNTHETIC`, `unvalidated (synthetic grounding)`; the detail's `SYNTHETIC WORLD`
marker, the two cut-offs in words — "observations through 2024-01-17, read at record time 2026-…" —
`● OBSERVED` and `◍ ASSUMED` kinds, `complete` health, and `UNVERIFIED — a cited input was
corrected` after the walk) and **SIMULATIONS** (the SYNTHETIC banner; selecting one control and
the interventions that reference it — read from the rows — and comparing them on that control;
opening the control run, its cut-off line "observations through 2024-01-17, read at record time 2026-…",
its assumptions carrying the result, and the governed "Reproduce from the stored contract" action
returning `REPRODUCED`). Screenshots `evidence/phase4-browser/10-twins.png`
and `11-simulations.png` are regenerated by every run of the suite and committed with it (the
M7 commit carried the whole `evidence/phase4-browser/` set; an earlier draft of this sentence said
they were not committed, which was wrong).

### 6.3 What the demonstration found, and what changed for it

The end-to-end pass is the first time the routes were exercised over HTTP in sequence, and it
found four defects the controller-harness probes could not see (the third in two services). Each is fixed with a check:

| Found | Fix | Check |
|---|---|---|
| `POST …/twins/simulations/compare` answered "a and b must be version numbers": Express matches routes in declaration order and `/:twinId/compare` captured `simulations`. | The per-twin compare route is declared after the static simulations routes, with the reason recorded beside it. | Act V step 5 (comparison on one control) and the SIMULATIONS browser check pass over HTTP. |
| Refusals raised by the twin and simulation ports (a second draft on a branch, grounding into an admitted version, an incompatible control, …) reached the operator as `500 internal integrity or processing failure`: the refusal translation knew only the Phase 1–2 ports. | `TWIN_RULES` in `observation-errors.ts`: each port refusal answers as what it is — 409 conflict, 422 bad request, 404 absent — in the product's words, with the port's text kept server-side; SQLSTATE `2F002` (immutability) admitted to the translation. | `test/unit/phase5-refusals.test.ts` (5 checks, including that a fault without a port SQLSTATE still stays a fault). |
| The Twins screen showed `observations through 2024-01-16` for a version whose cut-off is 2024-01-17: `twin.get`/`list` returned DATE columns as driver Dates, which JSON printed in UTC — a day west of Greenwich. | Day-valued columns (`observed_through`, `valid_from`, `valid_to`) leave the twin service as the day they name; the same for a run's `observed_through` in the simulation service's get and list (the run detail showed the same day-early cut-off). | `phase5-twins.test.ts` WORLD-time probe reads the version back and asserts `observed_through === '2023-11-20'` and `known_at` unchanged (15/15); `phase5-simulations.test.ts` reads the control run back by get and list and asserts `2024-01-17` (9/9); the SIMULATIONS browser check asserts the run detail's cut-off line. |
| The demonstration's twin owner login `r.okafor` already belonged to the Phase 2 extraction agent, so the "twin owner" was bound `extraction_agent` and every twin action was refused 403. | The twin owner is `t.nakamura`; `ensureOperator` refuses to reuse a login that belongs to a different persona. | Act V step 1; the TWINS/SIMULATIONS browser checks log in as `t.nakamura`. |

Two observations recorded, not changed: the screens shorten object ids to eight characters, which
for time-ordered ids is shared by every object of one pass (the browser check therefore selects
the control by its kind and branch, not by prefix alone); and a series element lists every cited
evidence version in full (twenty for the PortWatch series), which is exact but long.

### 6.4 Harness evidence at the M7 commit

All run from the main checkout with the API stopped (C14 inertness), after the browser suite:

| Suite | Result |
|---|---|
| API unit (`pnpm run test`) | 2121 checks: 2118 passed; the 3 failures are the C15 hermetic scanner controls in `test/gate/receipt-contract.test.ts`, which fail under batch load and pass alone (14/14 rerun) — the same load-related behaviour recorded at M1–M5 |
| API integration, all (`pnpm run test:int:all`) | 30 files, 628/628 (phase5-twins 15, phase5-simulations 9, phase5-propagation 4; the frozen `test:int` manifest still excludes `phase5-*`) |
| Acceptance (`pnpm run test:accept`) | 58/58 |
| Module boundaries (`pnpm run boundaries`) | no violations, 452 modules, 1753 dependencies |
| Upgrade check (`scripts/phase1/verify-0022-upgrade.mjs`) | PASS (13 migrations, 19 schema-registry rows, 11 roles) |
| Web (`vitest`, `tsc --noEmit`, `next build`) | 4/4, clean, built |
| New unit: `test/unit/phase5-refusals.test.ts` | 5/5 |
| Browser (`playwright.demo.config.ts`) | 12/12 |
| Act V (`scripts/phase5/seed-twins.mjs` on `eye_demo`) | 0 problems; acts I–IV before it unchanged (the ECB live backfill hit its transient egress timeout once and resumed from the checkpoint) |
| Secrets (`gitleaks git`) | no leaks found |
| C15 supply-chain gate | unchanged: red on the 13 ungoverned util-linux findings (PR #39 recheck; no patched image), no waiver |

## 7. One consolidated correction pass — the Codex review of `f66a958d` (migration `0035_twin_cutoffs_scenario_binding_reconciliation`)

The review reproduced twelve adverse outcomes at the service level with dependency doubles
and identified four more by inspecting the SQL. Each group was first REPRODUCED through the
real database and controller harness at `f66a958d`, then corrected. E1–E8 and the §6a
grounding rules were not broadened; Phase 4's closed functional review was not reopened.

### 7.1 Reproduction before the fix (database and controller, not doubles)

`apps/api/test/int/phase5-corrections.test.ts` states the correct behaviour for all six
groups. Run at `f66a958d` (with only the harness's new upload fixture, `Phase4Harness.upload`,
which pushes CSV records through the real upload route and the upload connector), **17 of 17
probes failed**, each with the consequence the review named — a citation recorded after
`known_at` accepted as complete; a caller-supplied 999,999 stored as observed; a run opened
on a stale on-hand and on a version with no world cut-off; carried elements keeping
`complete` under earlier cut-offs; `validation_impossible` absent from the element and the
run; a NULL claim basis passing the CHECK; unresolved scenario ids accepted with an
unchanged inputs digest and no scenario dependency; a reproduction "in a cold process" on
the caller's word, and `reproduced` after the cited document was withdrawn; one citation
route kept and the claim-cited version left verified; a correction behind a cited forecast
not shown pending; an as-of read returning a later verification state; kg and tonnes
reported the same; a reconciliation accepting an earlier observation. The log is
`repro-f66a958d.log` in the session scratchpad; the same file is the regression after the
fix (17/17).

Three review sub-items were checked at the database boundary and closed as stated, not
refuted: the SQL-only NULL-basis finding (a direct insert with a claim citation and no
truth state passed at `f66a958d`; it now violates `tse_claim_basis_named`), the carry-forward
finding (`open_version` copied health unchanged), and the reconciliation finding (an
observation citing evidence recorded before the run completed was accepted).

### 7.2 What changed, by group

| Group | Correction | Where |
|---|---|---|
| **F1 grounding and cut-offs** | Every substantive citation must be recorded at or before the version's `known_at` (record time). An observed or estimated element may not be valid from, or cite a record dated (its event time — an upload's stated document time), after `observed_through` (world time). An OBSERVED value is **established from the cited record**: the element names `record: { locator, field }` or `{ locator, fields }`, the service retrieves the bytes through the governed path for the reader, finds the row by the record's id column, and refuses a value that is not what the record says; a series window is not a record set and is grounded through ground-series; an observed claim establishes its value from the claim's payload. **Carry-forward** re-evaluates health under the new cut-offs in the port (not yet recorded → incomplete; withdrawn/retired → unreadable; dated after the world cut-off → incomplete; validity ended → stale). A run is refused when the version has no world cut-off (`sim_world_cutoff`, NOT VALID for history) and when any required input for the **selected component** is not usable (`twin.unusable_inputs`: the component's own key, a shared key, or a shipment of that component; a healthy key of another component never stands in). `paramsFromSnapshot` consumes only complete elements. | `twin.service.ts` (`ground`, `RecordLocator`, `rowsOf`), `series.service.ts` (`retrieveBytes`, shared), 0035 §4–§7, `simulation.service.ts` |
| **F2 kinds and forecast validation** | A PREDICTED element cites exactly one forecast version and stores its `validation` state in `inherited_validation` (column, port guard, `tse_predicted_validation`); the TWN payload carries it; the run's `validation_status` names each predicted input, its forecast and its state, and the SIM payload lists them (`inherited_validation`). A claim citation without a truth state fails closed at the CHECK (`tse_claim_basis_named`) and at the port. | 0035 §1–§3, `twin.service.ts`, `simulation.service.ts` |
| **F3 scenario binding** | With a scenario named, the service resolves the tree and the branch, takes the branch's state at opening, and the port re-verifies all of it: the branch belongs to the scenario, the state is as offered, the SCN canonical version is the current one, and the shock **follows the branch** (flipped → shock; open → none; a contradiction is refused). Stored on the run: `scenario_version`, `scenario_branch_state`, `scenario_flip_event`, `shock_basis` (`none` / `hypothetical` / `scenario-branch-flipped`; runs opened before 0035 read `unrecorded`). The scenario's controls fold into the run's controls and the SIM header (the port refuses controls less restricted than the twin's). The inputs digest binds the scenario binding; control compatibility compares it; `complete_run` records the SIM → scenario dependency; SIM@v2 carries `scenario` and `shock_basis`. A shock with no scenario is recorded and shown as a **HYPOTHETICAL**. | 0035 §6–§8, §11, `simulation.service.ts`, web run form and detail |
| **F4 reproduction** | The request carries no attestation (`cold` is ignored). The service first establishes **availability** to this reader: every cited evidence version is retrieved through the governed path (policy, governed deletion, integrity decide now), every cited claim, forecast and run is read under RLS, and an object whose latest version is withdrawn or retired — or whose exact version is — makes the run `unreproducible`, with the artefacts named. Then it re-executes the stored contract in a **separate process it spawns** (`reproduce-worker.js`, fed the stored run on stdin, answering with the outputs digest, the implementation digest it ran and its pid); `cold_process` is derived from that execution and the reason records the pid. No executor installed → `unreproducible`, never a silent in-process run. | `simulation.service.ts` (`reproduce`, `executeInSeparateProcess`, `workerPath`), `reproduce-worker.ts`, `twin.controller.ts` |
| **F5 propagation** | The walk keeps **every** route to a twin or run (`via_ids`); `record_impact` marks every admitted, verified version citing any of them. The twin's pending list uses the same dependency reachability as the walk (evidence → derived claims via lineage → dependents, bounded) without writing anything, so a correction behind a cited forecast or run shows as pending. Propagation stays operator-initiated; the consumer stays deferred. | `impact.service.ts`, 0035 §9, `twin.service.ts` (`get`, `reachedVia`) |
| **F6 version semantics** | As-of reconstructs the verification state from the events at or before the instant and states the current state beside it (`verification_state_as_of`, `verification_state_now`, `events_after_instant`). Comparison signs every material semantic — kind, basis, value **and unit**, validity, citations, health, confidence, synthetic state, inherited validation, controls — and lists which changed. Reconciliation requires both versions admitted, the same unit, the same target day when both name one, and an observation whose cited evidence was **recorded after** the simulated or predicted value was established (the run's completion, the forecast's record time); the difference records the unit, target and both instants. | `twin.service.ts` (`asOf`, `compare`), 0035 §10 |

Refusals the new ports raise answer over HTTP as 404/409/422 in the product's words
(`TWIN_RULES`, extended). The demonstration grounds every observed value from the uploaded
records with record locators, runs a fresh control per pass bound to act IV's flipped branch,
and shows the product's own separate-process reproduction; the Simulations screen binds a
scenario branch (a flipped branch applies the shock; a hypothetical is a separate, labelled
choice) and shows the shock's basis on every row and in the run detail; the Twins screen shows
a predicted element's inherited validation.

### 7.3 Consequences recorded, not hidden

* The state-set digest and the initial-state snapshot now bind `inherited_validation` and
  health; versions and runs recorded before 0035 keep their stored digests, and an
  intervention opened after 0035 is not compatible with a control opened before it (the
  snapshot formula differs). The demonstration runs a fresh control per pass for this reason.
* `sim_world_cutoff`, `sim_scenario_bound`, `sim_shock_basis_consistent`,
  `tse_claim_basis_named` and `tse_predicted_validation` are NOT VALID: history stays as it was
  written; every new row is checked. Pre-0035 runs show `shock_basis = unrecorded`.
* An observed element from a record cites ONE record; a value read from several documents is
  not an observation and is grounded as estimated or assumed.

### 7.4 Harness evidence at the correction candidate

Batch results and isolated reruns are reported separately. Everything ran from the main checkout with the API stopped (C14 inertness), after the browser suite.

| Suite | Batch | Isolated rerun |
|---|---|---|
| API unit (`pnpm run test`) | 2121/2125 — the 4 failures are the C15/C18 hermetic scanner and SIGKILL controls, which fail under batch load | full suite alone: 2134/2134 (includes the new `phase5-records` and `phase5-refusals` checks) |
| API integration, all (`pnpm run test:int:all`) | 31 files, 645/645 (phase5-corrections 17, phase5-twins 15, phase5-simulations 9, phase5-propagation 4) | — |
| Acceptance (`pnpm run test:accept`) | 58/58 | — |
| Module boundaries (`pnpm run boundaries`) | no output captured by the batch's tail | alone: no violations, 454 modules, 1768 dependencies |
| Upgrade check (`scripts/phase1/verify-0022-upgrade.mjs`) | FAIL (1 problem) in the batch, run immediately after `test:int:all` | alone: PASS (14 migrations, 20 schema-registry rows, 11 roles); the batch failure is not reproduced in isolation and is recorded as such |
| Web (`vitest`, `tsc --noEmit`, `next build`) | 4/4, clean, built | — |
| Reproduction probes at `f66a958d` (`phase5-corrections.test.ts`) | 17/17 FAILED with the review's consequences (`repro-f66a958d.log`) | at the candidate: 17/17 pass |
| Fresh demonstration (acts I–V on a new `eye_demo`) | acceptance 58/58; acts I–V 0 problems; Act V refuses a wrong on-hand (99999) with the record's own value; the product's reproduction ran in a separate process (pid recorded) | — |
| Browser (`playwright.demo.config.ts`) | 12/12 against the fresh demonstration (TWINS; SIMULATIONS asserting the shock's basis "the bound scenario branch is FLIPPED" and the separate-process REPRODUCED verdict) | — |
| Secrets (`gitleaks git`) | no leaks found | — |
| C15 supply-chain gate | unchanged: red on the 13 ungoverned util-linux findings (PR #39 recheck; no patched image), no waiver | — |

