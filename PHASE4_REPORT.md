# THE EYE — Phase 4 Report: Prediction + Scenario Intelligence (L6–L7)

> **Status: IMPLEMENTED — awaiting owner review. The implementation PR is unmerged.**
>
> Plan, targets and criteria: [PHASE4_DATA_READINESS_PLAN.md](PHASE4_DATA_READINESS_PLAN.md)
> (§2a T1–T4, §9 D1–D8, §14 the owner's four source decisions). Product handoff:
> [PHASE4_PRODUCT_HANDOFF.md](PHASE4_PRODUCT_HANDOFF.md). Permission request, ready to send:
> [PHASE4_PORTWATCH_PERMISSION_REQUEST.md](PHASE4_PORTWATCH_PERMISSION_REQUEST.md).
>
> **What this report does not claim.** No forecast in this phase has been validated on the
> corridor signal. The five-day corridor replay cannot establish forecast quality, and every
> forecast issued from it carries `validation_impossible` in its own record. The one series with
> real depth — the ECB rate — was backtested honestly, and the honest result is that the learned
> model did **not** beat seasonal naive, so the baseline is the forecaster and says so.

---

## 1. What was built

**P4-M0a — the closed-range backfill** (connector `observation.rest@1.2.0`, migration `0028`).
The Phase 1 poller walks forward from a checkpoint; a backfill walks a closed `[from, to)` window
in deterministic pages and terminates. The traversal is **declared on the contract** (`SRC@v2`:
strategy, endpoint, window, page size, ordering) so it is a reviewed fact rather than a connector's
habit. Two strategies: `period-range` (ECB: `startPeriod`/`endPeriod`) and `arcgis-offset`
(PortWatch: `where` + `orderByFields` + `resultOffset`, because an ArcGIS page order is undefined
without ordering). The walk stops **before** the run's request budget is exceeded and resumes from
the checkpoint on the next run; a backfill larger than one budget takes several runs. A backfilled
window is a **deterministic item**: a re-run with identical bytes is an audited `item.noop`,
changed bytes are a **revision admitted as the next version of the same evidence object**
(`item.revised`, `supersedes` set, the prior bytes still retrievable at their version). A new
contract version walks the declaration again — that is how a range is re-collected after a
restatement.

**P4-M0b — ECB EUR/USD activated and backfilled**, through the governed connector, as the owner
decided: contract v2 registered by a.hoffmann, approved by m.dvorak (self-approval refused, 403),
rights confirmed with the ESCB reuse policy quoted as evidence, v1 superseded, v2 activated, an agent
provisioned for the current connector version (the 1.1.0 agent revoked), and **28 windows
(1999-01-04 → today) admitted in 3 runs of ≤12 requests: 1,143,481 bytes, 0 quarantined**.
Every rate shown carries *"Source: ECB statistics."*

**P4-M1 — the `prediction` schema** (migration `0029`): series registry; forecast events and
projection; backtests; the outcome ledger; scenario events, scenarios, branches; indicators and
evaluations; warning events and warnings — twelve tables under FORCE row-level security, eleven
SECURITY DEFINER ports, canonical schemas `FCT@v1`, `SCN@v1`, `WRN@v1`, roles `forecast_owner` and
`forecast_agent`, and the Strategy Graph extended with three dependents (FCT, SCN, WRN) and two
target kinds (`forecast`, `evidence`) so Phase 3's one propagation reaches them.

**P4-M2 — series assembly and the two forecasters.** A series is read out of evidence by a
**deterministic, version-pinned parser** (`sdmx-json-observations@1`, `arcgis-feature-attribute@1`)
under `observation.evidence.retrieve` — manifest-resolved, digest-verified, in custody, by
**version** — with two cut-offs always both: `knownAt` (record time) and `observedThrough` (world
time). `seasonal-naive@1` is the baseline; `holt-winters-additive@1` the learned model, parameters
by grid search, intervals from empirical h-step errors over the recent window, and — when history
is too short to measure them — an **approximated** band that says so on the forecast.

**P4-M3/M4 — scenarios, indicators, warnings.** A scenario tree with a baseline and flippable
branches; an indicator is a comparator, a threshold and a run of consecutive published
observations; evaluation feeds each new observation to the port in date order; a breach **flips**
every open branch that names it, each flip its own event, and the controller raises a **warning**
to the branch owner with the branch's response window in the same governed operation. Acknowledged
or expired is a recorded state.

**P4-M5 — outcomes and calibration.** An outcome scores a forecast against the observation known at
its target (a stand-in within three days for business-day series, recorded as such) — pinball
loss and coverage, never revised in place. Calibration aggregates outcomes and backtests
separately and states in words when there is nothing to score.

**P4-M6 — the Prediction workspace**: Overview, Forecasts, Scenarios, Warnings, Calibration, beside
Graph, Intelligence and Observation. Validation state and label are rendered before the number.

**P4-M7 — Act IV** (`scripts/phase4/seed-prediction.mjs`), D1–D8 in
`apps/api/test/int/phase4-acceptance.test.ts`, this report.

## 2. The targets, measured

| # | Target | Measured | Result |
|---|---|---|---|
| **T1** | 10–90 band covers the outcome 80% ± 5pp | ECB EUR/USD, 30 days, 40 rolling origins: learned model **85.0%**, seasonal naive **85.0%** | **Met, at the edge**, on the one series with depth. **Not measurable on the corridor.** |
| **T2** | ≥15% lower pinball than seasonal naive at 30 days | ECB: learned 0.0051 vs naive 0.0050 — **skill −1.6%** | **NOT met.** The seasonal baseline is the forecaster, and the forecast says so. |
| **T3** | Warning fires before the decision window closes in ≥80% of episodes | The replay holds **one** episode; the warning fired on the last published observation (2024-01-17) with a 48-hour window | **1 of 1. Not a rate.** The ≥80% target needs more than one episode. |
| **T4** | 100% of shown forecasts carry distribution, drivers, assumptions, evidence | Enforced by `FCT@v1` and four table constraints; a forecast resting on nothing is refused (422) | **Met by construction.** |

The corridor series (~20 observations) cannot be backtested (`CANNOT VALIDATE: 0 usable origins`),
and no accuracy is claimed for it anywhere.

## 3. The eight criteria

| # | Criterion | Where it is enforced | Evidence |
|---|---|---|---|
| D1 | A forecast names distribution, horizon, drivers, assumptions; every driver resolves to evidence; refused otherwise | `FCT@v1`, `fct_names_drivers/evidence/assumptions/quantiles_ordered`, `validateHeader`, `issue_forecast` assumption check | acceptance D1 |
| D2 | A hindcast reads only through the known-at path | `evidenceVersionsKnownAt` (record cut-off), `observedThrough` (world cut-off), retrieval by version | acceptance D2 ×2: a revision recorded after the cut-off is invisible to a reader positioned before it; the hindcast used version 1 |
| D3 | Learned model scored against seasonal naive on the same windows, reported either way | `backtest()` records both on identical origins; verdict stored whether flattering or not | acceptance D3/D4; ECB: T2 NOT met, recorded |
| D4 | Calibration measured: coverage and pinball by horizon | `record_outcome` computes both; `calibration()` aggregates | acceptance D4 |
| D5 | A branch flips on a breached indicator, with a receipt and a named owner | `evaluate_indicator` returns the flip event id; `brn_flipped_has_receipt` | acceptance D5/D6; Act IV flip on 2024-01-17 |
| D6 | A warning carries a window, routes to a named owner, acknowledged or not | `wrn_window`, `routed_to NOT NULL` + principal check, `expire_warnings` | acceptance D5/D6 and D6 (expired) |
| D7 | Correcting a claim a forecast rests on surfaces the forecast | `graph.dependencies` dependents FCT/SCN/WRN; the walk's Phase 4 buckets; `record_impact` marks attention with an event | acceptance D7; Act IV step 6 |
| D8 | Phase 0–3 regression; C18 frozen at 0021 | full suites; the post-C18 upgrade check | §4 |

## 4. Measured

| Suite | Result |
|---|---|
| Phase 4 acceptance, D1–D8 + M0 (`phase4-acceptance.test.ts`) | **15 / 15** |
| Service-level: backfill traversal, models, scores, parsers | **22 / 22** (`phase4-backfill` 11, `phase4-models` 11) |
| Integration, everything (`test:int:all`) | **571 / 571** (23 files) |
| C18-era manifest (`test:int`, phases 1–4 excluded) | **297 / 297** — unchanged |
| Phase 0 acceptance (`test:accept`) | **58 / 58** |
| Unit (api) | **2096 / 2096** + 9 (hermetic suite meta) |
| Post-C18 upgrade check (`0022`→`0029`) | **PASS** — 1,020 pre-existing rows unchanged; roles +9, schema registry +17, ledger +8, exactly as declared; eight pre-0026 correction cases reconciled; upgraded and virgin schema digests identical (`585d9a72e20eb19d…`); later-phase suites on upgraded data **274 / 274** |
| Typecheck · module boundaries | clean · no violations (436 modules, 1,676 dependencies) |
| The demonstration, acts I–IV on a fresh database, with the live ECB activation | **0 problems** in every act |

## 5. The demonstration — act IV, measured

On a freshly migrated (0001–0029), bootstrapped database, after acts I–III and the ECB activation:

```
✓ N. Eriksen — forecast owner created (forecast_owner)
  · forecast owner n.eriksen 01a07159…

1. the series — a number read out of evidence by a named, deterministic parser
  ✓ ecb-eurusd registered (sdmx-json-observations@1)
  ✓ portwatch:chokepoint1:n_total registered (arcgis-feature-attribute@1)
  ✓ portwatch:chokepoint4:n_total registered (arcgis-feature-attribute@1)
  ✓ portwatch:chokepoint7:n_total registered (arcgis-feature-attribute@1)
  ✓ ecb-eurusd: 7086 observation(s) from 28 evidence version(s), last 2026-09-04 = 1.1622 USD per EUR
  · Source: ECB statistics. Shown as published; the statistics are not modified.
  ✓ portwatch:chokepoint1:n_total: 21 observation(s) from 21 evidence version(s), last 2024-01-17 = 50 transits/day
  · Source: IMF PortWatch (IMF / Oxford). Replay set; collection rights pending. Shown as published; the statistics are not modified.
  ✓ portwatch:chokepoint4:n_total: 20 observation(s) from 20 evidence version(s), last 2024-01-17 = 31 transits/day
  · Source: IMF PortWatch (IMF / Oxford). Replay set; collection rights pending. Shown as published; the statistics are not modified.
  ✓ portwatch:chokepoint7:n_total: 19 observation(s) from 19 evidence version(s), last 2024-01-17 = 80 transits/day
  · Source: IMF PortWatch (IMF / Oxford). Replay set; collection rights pending. Shown as published; the statistics are not modified.
  ✓ the corridor: Bab el-Mandeb Strait — median 54, minimum 27 (50% drawdown); indicator threshold 41

2. backtests at 30 days — the learned model against seasonal naive, on identical origins
  ✓ ecb-eurusd: 40 origins, 30d: learned holt-winters-additive coverage 85.0% (T1 met, band 75–85%), pinball 0.0051 vs seasonal naive 0.005 → skill -1.6% (T2 NOT met, bar 15%). The seasonal baseline is the forecaster until the lea
  · coverage 85.0% (naive 85.0%) · pinball 0.0051 vs 0.005 · skill -1.6%
  ✓ portwatch:chokepoint1:n_total: CANNOT VALIDATE: 21 observation(s) known and 0 usable origin(s); a backtest needs 400 observations and 20 origins. No accuracy is claimed for this series and horizon.
  ✓ portwatch:chokepoint4:n_total: CANNOT VALIDATE: 20 observation(s) known and 0 usable origin(s); a backtest needs 400 observations and 20 origins. No accuracy is claimed for this series and horizon.
  ✓ portwatch:chokepoint7:n_total: CANNOT VALIDATE: 19 observation(s) known and 0 usable origin(s); a backtest needs 400 observations and 20 origins. No accuracy is claimed for this series and horizon.

3. forecasts — distribution, drivers, assumptions and evidence, or refused
  ✓ assumption "EUR/USD stays within its recent regime" declared by j.weber
  ✓ a forecast that rests on nothing is refused (422)
  ✓ ECB 30d [validated] ecb-eurusd at 30d (2026-10-04): median 1.1656 USD per EUR, 10–90 band 1.1416–1.1901; seasonal-naive@1 on 7086 observation(s) known at 2026-09-05T11:34:32.482Z (last 2026-09-04); validated. The seasonal base
  ✓ corridor 30d [validation_impossible] portwatch:chokepoint4:n_total at 30d (2024-02-10): median 49 transits/day, 10–90 band 10.6594–49; seasonal-naive@1 on 15 observation(s) known at 2026-09-05T11:34:32.521Z (last 2024-01-11); 
  ✓ as known on 2024-01-01, no forecast existed — the list has no hindsight

4. the scenario tree — a baseline, and the branch that would replace it
  ✓ indicator defined: transits < 41 for 5 consecutive observations (01a07159…)
  ✓ scenario declared with 2 branches (01a07159…)

5. the January collapse, replayed — the branch flips, the warning routes, the owner answers
  ✓ 20 observation(s) evaluated · streak 5 · 1 flip(s) · 1 warning(s)
  · branch 01a07159… FLIPPED on 2024-01-17 at 31 transits — event 59c68ca1…
  · warning 01a07159… routed to 01a07159… (n.eriksen), window closes 2026-09-07T11:34:32.594Z
  ✓ acknowledged inside the window (acknowledged)
  ✓ 1 warning(s) on record for this indicator: acknowledged

6. the publisher corrects evidence the corridor forecast rests on
  ✓ correction case 01a07159… applied: evidence 01a07158… superseded
  ✓ propagated — dependency propagation assessed by invalidation 01a07159-4bcc-785e-9ccd-4120c5e44612: 0 assumption(s) marked unverified; 0 objective(s), 0 decision(s) and 0 commitment(s) reported for human review; 1 forecast(s) m
  ✓ the corridor forecast was reached and marked for attention
  ✓ the forecast now says: invalidation 01a07159-4bcc-785e-9ccd-4120c5e44612: a value it was fitted on was read from the corrected evidence

7. calibration — what the record can say, and what it cannot yet
  ✓ No forecast has been scored against an outcome yet: no issued horizon has elapsed against a recorded observation. The calibration numbers below come from BACKTESTS on held-out history, not from live outcomes, and say so.
  · portwatch:chokepoint7:n_total 30d: CANNOT VALIDATE: 19 observation(s) known and 0 usable origin(s); a backtest needs 400 observations and 20 origins. No accuracy is claimed for this series and horizon.
  · portwatch:chokepoint4:n_total 30d: CANNOT VALIDATE: 20 observation(s) known and 0 usable origin(s); a backtest needs 400 observations and 20 origins. No accuracy is claimed for this series and horizon.
  · portwatch:chokepoint1:n_total 30d: CANNOT VALIDATE: 21 observation(s) known and 0 usable origin(s); a backtest needs 400 observations and 20 origins. No accuracy is claimed for this series and horizon.
  · ecb-eurusd 30d: 40 origins, 30d: learned holt-winters-additive coverage 85.0% (T1 met, band 75–85%), pinball 0.0051 vs seasonal naive 0.005 → skill -1.6% (T2 NOT met, bar 15%). The seasonal baseline is the forecaster until the
  ✓ scoring the corridor forecast is refused until its target day is observed (409: no observation at or before 2024-02-10 is known at 2026-09-05T11:34:32.670Z; the outcome c)

=== act IV complete — 0 problem(s) ===
```

## 6. Data-dependent validation gaps — stated, not deferred

* **The corridor cannot be validated on the replay** — 19–21 observations per chokepoint, 0
  usable backtest origins. The forecast is a replay demonstration and carries
  `validation_impossible`; its band is approximated from 1-step errors and says so. Validation
  waits on the multi-year PortWatch history, which waits on the IMF's answer. The `arcgis-offset`
  backfill that will collect it is built and tested against a transport double.
* **T3 is one episode, not a rate.**
* **No live outcome has been scored.** Calibration from outcomes starts when the first issued
  horizon elapses; the screen says so and labels the backtests as backtests.
* **The backfilled ECB history is the series as published now.** All 28 windows were recorded on
  2026-09-05; revisions the ECB made before that are indistinguishable. From now on every revision
  is a version, and the known-at discipline applies to it.
* **The learned model adds nothing on EUR/USD** (skill −1.6%) — expected for a rate close to a
  random walk, and the reason the leash exists.

## 7. What was touched outside Phase 4, and why

* `observation.rest` **1.1.0 → 1.2.0** (the backfill). A version is an identity: agents registered
  for 1.1.0 no longer run, and Phase 1 fixtures now read the version from the connector instead of
  a literal. The ECB activation provisions a 1.2.0 agent and revokes the 1.1.0 one.
* `AcquisitionLifecycle`: prior-evidence index per run, audited no-op, revision as a version;
  `EvidenceService.retrieve` gains an optional version; `SourcesService` emits `SRC@v2` when a
  contract uses v2 fields; `/sources/register` accepts `sourceId` to version an existing source.
* `graph.record_impact` gains a forecasts bucket (0027's signature retired by 0029);
  `graph.dependencies` loses its foreign key to `strategy_current` in favour of a typed existence
  trigger; the impact walk reports `forecasts`, `scenarios`, `warnings`.
* PDP: `prediction.*` rules; `forecast_*` roles on `identity.self.read`, `graph.read`,
  `observation.evidence.retrieve`.
* `test:int` (the C18-era manifest) now excludes `phase4-*` as it excludes phases 1–3, so it stays
  at its frozen scope.

## 8. Defects found and fixed during implementation

* A series cache keyed on evidence version alone served one chokepoint's rows to another; keyed
  by parser, field, selector and version.
* `date` columns read through `toISOString()` moved a day west of Greenwich; one helper reads
  them by their local components.
* An outcome "stood in" the last observation 24 days early; the stand-in is bounded to three days.
* An approximated band could sit entirely on one side of the point and break quantile ordering;
  scaled bands are anchored at the point.
* Interval errors measured over 27 years of FX regimes gave 95% coverage; measured over the recent
  750 observations they give 85%.
* The ArcGIS pager treated a full last page as "more"; the service's own transfer-limit flag decides.
* The Phase 3 C14 inertness suite fails when the API process is running beside it (its outbox
  publisher mutates governed state between the suite's two reads); the suite passes 9/9 with the
  API stopped. Reported, not changed.

## 9. Known limitations

* No browser verification of the Prediction workspace in this pass: typechecked, not exercised.
* The Model Gateway is not used; `narrative` is `null`.
* Scheduled continuation of a backfill relies on the source's cadence; Act IV triggers runs.
* Series assembly retrieves every evidence version once per process and caches parsed rows; the
  custody chain records the first read, not every in-memory reuse.
* UN Comtrade untouched; PortWatch in replay; nothing purchased.
