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
| **T1** | 10–90 band covers the outcome 80% ± 5pp | ECB EUR/USD, 30 days, 40 rolling origins, **retrospective** mode (one evidence vintage recorded 2026-09-05, cut by publisher date at each origin): learned model **85.0%**, seasonal naive **85.0%** | **Met, at the edge, retrospectively**, on the one series with depth. **Not measurable on the corridor**, and not measurable under historical knowledge on a backfilled vintage. |
| **T2** | ≥15% lower pinball than seasonal naive at 30 days | ECB: learned 0.0051 vs naive 0.0050 — **skill −1.6%** (retrospective mode). In **historical** mode the backfilled vintage yields **0 usable origins**: every origin predates the day the history was recorded, so nothing can be validated under historical knowledge | **NOT met**, and only measurable retrospectively on this vintage. The seasonal baseline is the forecaster, and the forecast says so. |
| **T3** | Warning fires before the decision window closes in ≥80% of episodes | **UNMEASURED.** The first pass timed the replayed January 2024 flip by the 2026 audit clock, which measures nothing. The correction pass separates `raised_as_of` (replay: the breaching observation, 2024-01-17) from `raised_at` (audit) and compares it to a decision deadline the declarer sets from the decision; the replay holds one episode and one declared deadline (2024-01-22) — **1 of 1 timely, which is not a rate** | **Unmeasured until demonstrated** on more than one episode with independently established deadlines. |
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

At the second correction candidate (the head of `phase4-prediction`, PR #38), 2026-09-06:

| Suite | Result |
|---|---|
| Phase 4 acceptance, D1–D8 + M0 (`phase4-acceptance.test.ts`) | **15 / 15** |
| Codex-review probes, first pass, database/API (`phase4-corrections.test.ts`) | **14 / 14** |
| Codex-review probes, second pass, database/API (`phase4-corrections-2`, `-calendar`, `-historical`) | **7 / 7 · 6 / 6 · 2 / 2** — every one failed at `aec404c1` unless marked a control |
| Codex-review probes, service-level doubles (`test/unit/phase4-corrections*.test.ts`) | **2 / 2 + 3 / 3** |
| Service-level: backfill traversal, models, scores, parsers | **22 / 22** |
| Integration, everything (`test:int:all`) | **600 / 600** (27 files) |
| C18-era manifest (`test:int`, phases 1–4 excluded) | **297 / 297** — unchanged |
| Phase 0 acceptance (`test:accept`) | **58 / 58** |
| Unit + hermetic gate controls (api) | **2101 / 2101** + 9 — two C15 hermetic controls failed once in the batch run under load (18.8 s and 3.5 s) and pass alone (58 / 58); they are unrelated to this change |
| Post-C18 upgrade check (`0022`→`0031`) | **PASS** — pre-existing rows unchanged; roles +9, schema registry +17, ledger +10, exactly as declared; upgraded and virgin schema digests identical; later-phase suites on upgraded data **274 / 274** |
| Typecheck (api, web) · lint · module boundaries | clean · no violations (438 modules, 1,696 dependencies) |
| The demonstration, acts I–IV on a fresh database, with the live ECB activation (ECB registered with its attested business-day calendar; the replayed warning answered as of 2024-01-18) | see §12.3 |
| Browser: the Prediction screens and the warning ACTION PATHS as `n.eriksen` against that demonstration (`e2e/phase4-prediction.demo.spec.ts`, installed Chrome via Playwright) | see §12.3 |

Not run locally: the C15 supply-chain gate, because the pinned scanner binaries are not installed
on this machine (the gate refuses an unauthenticated executable, correctly). In CI it is **red on
the current image pins for 13 util-linux findings**; see §11 and PR #39.

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
* **T3 is unmeasured.** One replayed episode, timed in replay against one declared deadline, is
  not a rate; and a live episode has not yet occurred. The record says `timely: null` (T3
  unmeasured) on every branch declared without a decision deadline.
* **Historical-knowledge validation is impossible on a backfilled vintage.** A `historical`
  backtest gives every origin only the evidence recorded by the end of its own day; the ECB
  history was recorded on 2026-09-05, so every origin before that sees nothing and the verdict is
  `CANNOT VALIDATE (historical)`. The `retrospective` numbers above are exactly that, and the
  forecast's state says `validated_retrospective`, never `validated`.
* **No live outcome has been scored.** Calibration from outcomes starts when the first issued
  horizon elapses AND the target day has been observed; the outcome rule refuses anything
  earlier, and the screen labels the backtests as backtests.
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

* The Prediction workspace was exercised in a browser in the correction pass (§10.9), not in
  the first pass.
* Series assembly caches parsed rows per reader, purpose and evidence version for the life of
  the process. A governed deletion (tombstone) or withdrawal that lands AFTER a reader has
  warmed the cache is not seen by that reader until the entry is evicted or the process
  restarts; a reader that has not warmed it is refused. Reported, not changed in this pass.
* Controls of an evidence version the evaluator can no longer see (superseded before an owed
  warning is recovered) fold fail-closed: the warning is marked synthetic and restricted.
* The Model Gateway is not used; `narrative` is `null`.
* Scheduled continuation of a backfill relies on the source's cadence; Act IV triggers runs.
* Series assembly retrieves every evidence version once per process and caches parsed rows; the
  custody chain records the first read, not every in-memory reuse.
* UN Comtrade untouched; PortWatch in replay; nothing purchased.

## 10. The Codex review of `737ca81a` — one consolidated correction pass

Codex's evidence was implementation execution with dependency doubles plus SQL inspection.
Each finding was first REPRODUCED against the real database through the real ports, lifecycle
and controllers (`test/int/phase4-corrections.test.ts`, 14 probes, and
`test/unit/phase4-corrections.test.ts`, 2 probes). At `737ca81a` **9 database/API probes and 2
service probes failed**; the F3 probes could not be run at all until their scaffolding was
rewritten, because the first draft tried to UPDATE `objects.canonical_objects`, which is
append-only — the harness refused the shortcut. No downstream guard prevented any of the seven
consequences. All 16 probes pass at the candidate. Migration **`0030_prediction_corrections`**
is forward-only; 0028 and 0029 are untouched.

| # | Finding | Reproduced at 737ca81a (real DB) | Correction | Regression |
|---|---|---|---|---|
| **F1** Evidence permissions | `SeriesService.load` served cached rows before the reader's own `observation.evidence.retrieve` decision; an unreadable version was silently dropped | A `strategy_owner` with no evidence-retrieval authority read **1,095** cached points after a `forecast_owner` had warmed the cache; a governed-deleted (tombstoned) window vanished from the answer with `total` reduced and nothing said | Cache key carries principal and purpose; every reader retrieves, is authorised and enters custody in its own right; a policy denial is raised (403); withdrawn / tombstoned / integrity-failed versions are returned as `unreadable[]` with `complete:false` and an `INCOMPLETE` note; forecasts, backtests, outcomes and indicator evaluations REFUSE (409) an incomplete history | F1 ×2 |
| **F2** Selection and validation | explicit `method: holt-winters-additive` bypassed the leash with `t2_met=false`; a 46-observation forecast at origin 2021-02-15 became `validated` by a backtest whose window ended 2023-12-31; rolling origins trained on the latest revision | Reproduced as described; the "validated" record was bound to nothing (`backtest_id` did not exist) | `applicableBacktests()` — same series, horizon, `method_version`, `known_at ≤` the forecast's cut-off, `window_to ≤` its origin, ≥ MIN origins; the explicit request is subject to the same rule (422 otherwise); backtests carry `mode` (`retrospective` / `historical`), `known_at`, `observations`, and accept `observedThrough` so a record can be computed for exactly the history a forecast is fitted on; `historical` mode re-assembles the series per origin with `knownAt = end of the origin's own day`; states `validated` (historical only), `validated_retrospective`, `unvalidated`, `validation_impossible`; `issue_forecast` port re-checks the binding and refuses a validated state without an applicable record of the matching mode | F2 ×4 |
| **F3** Inherited controls | forecast header took `synthetic_state` from the caller's label and hard-coded `classification: 'internal'`; scenarios and warnings hard-coded non-synthetic internal headers | A restricted, synthetic contract version re-collected the series; the forecast issued as `live` was admitted **non-synthetic, internal**; scenario and warning likewise | `foldControls()` (fail-closed: unknown classification → restricted, unknown synthetic → synthetic; most-restrictive classification; rights / residency / retention / access joined) from every evidence version that contributed a point → forecast header and `forecasts_current.controls`; scenario folds its forecast's controls; warning folds the scenario's with the breaching evidence's; all three headers carry the fold | F3 ×2 (residency `EU; EU-only` when two vintages contribute is the fold telling the truth) |
| **F4** Lost warnings | the flip committed in one governed write; the warning was a second write; a failure between them left a flipped branch with no warning and nothing owed | Branch owner suspended: the flip committed, `warnings_current` had **0** rows, and a fresh evaluation raised nothing | `branches_current.warning_state` (`none` / `owed` / `raised`) set to `owed` by `evaluate_indicator` in the same transaction as the flip; `raise_warning` takes `flip_event_id` (unique partial index `wrn_one_per_flip`) and sets `raised`; `owedFlips()` is read on every evaluation and each owed flip is retried; a failed raise fails the call loudly (409) with the obligation named, never silently | F4 (recovered once, never twice) |
| **F5** T3 timing | the window opened at the audit clock: a January 2024 flip got a September 2026 window | Reproduced | `timing: 'live' \| 'replay'` on evaluation; `raised_as_of` (replay: the breaching observation's date), `raised_at` stays the audit clock; branch `decision_deadline` set by the declarer; window closes at the earlier of the branch window and the deadline; `timely` = `raised_as_of ≤ deadline`, **null when no deadline** — T3 unmeasured, said so on screen | F5 |
| **F6** Premature outcomes | the three-day stand-in scored a forecast before its target from an earlier observation | Origin 2023-12-02 → target 2024-01-01 with the series ending 2023-12-31 was **scored** from 2023-12-31 | The reader must be positioned after the target; only the target day's own observation, or — for a business-day series — the last published observation within three days before it, taken only once a LATER observation proves the calendar moved on; `observed_on` and `substitution` persisted (port `record_outcome` enforces the same rule; pre-0030 rows carry `observed_on = NULL`, documented) | F6 ×2 |
| **F7** Backfill | ECB `to: null` moved the upper bound daily and an overnight resume restarted from 1999; an ArcGIS HTTP 200 `{error}` envelope marked the range complete with zero history | Both reproduced at the connector (unit) | `backfillProgressOf` keeps the prior resolved `to` when strategy, `from` and contract version match; an error envelope or non-object page is `EgressRefused('transport_failure')`; items carry their `backfillCursor` and the lifecycle rewrites the checkpoint to the earliest quarantined cursor with `done:false, incomplete` | F7 ×2 (unit) + phase4-backfill 11 |

### 10.8 Corrected measurements

* ECB EUR/USD 30 d, **retrospective**: T1 85.0% / 85.0%, skill −1.6% (unchanged numbers,
  now labelled by mode). ECB 30 d, **historical**: `CANNOT VALIDATE (historical)` — 0 usable
  origins, 40 unknowable. The ECB forecast is `validated_retrospective`, never `validated`.
* Corridor: `validation_impossible`, unchanged.
* T3: **unmeasured** (§2).
* Suites at the candidate: §4 (updated).

### 10.9 Browser verification

Recorded in §4 and the handoff: the Prediction screens (overview, forecasts, scenarios,
warnings, calibration) were opened as `n.eriksen` against the fresh demo database after act IV,
and the corrected fields are rendered from the record: `VALIDATED RETROSPECTIVELY` and the
inherited controls on the forecast; `REPLAY · raised as of 2024-01-17 (recorded 2026-09-06)`
with the decision deadline and `timely` on the warning; the backtest `mode` column; the branch
deadline column with `T3 unmeasured` where none was declared.

## 11. The C15 gate and the September re-pin

The `supply-chain` check fails on PR #38 — and would fail on `main` today — for **13 ungoverned
HIGH util-linux findings** (CVE-2026-53612 family) in the exact pinned `postgres:18-alpine` and
`redis:8-alpine` digests. No published official image of either, in any variant, carries the
Alpine fix, so a re-pin to a patched image is not possible and no waiver was added. The
maintenance PR #39 makes the daily recheck watch these findings so the re-pin happens the day a
rebuild lands. This is unrelated to Phase 4's code and blocks nothing in it except the merge of a
branch whose required check is red for reasons outside the branch.

## 12. The Codex review of `aec404c1` — second bounded correction pass

Codex ran the TypeScript with dependency doubles (six residual reproductions, eight passing
controls) and inspected the database consequences in SQL. Each consequence was then established
through the real ports and controllers on a real database before it was corrected
(`phase4-corrections-2.test.ts`, `phase4-corrections-calendar.test.ts`,
`phase4-corrections-historical.test.ts`; service-level doubles in
`test/unit/phase4-corrections-2.test.ts` only for the two states a real database cannot stage).
Migration **`0031_prediction_timing_calendar`** is forward-only.

| # | Finding | Reproduced (real DB) | Correction | Regression |
|---|---|---|---|---|
| **F1** cached access survives revocation and deletion | the per-reader cache served parsed rows without re-asking | the same reader, its retrieval authority revoked after warming, read **1,095** cached points with `complete:true`; a tombstone after warming left the warm reader complete while a cold one was refused | **the cache is removed.** Every read is a governed retrieval — authorised, custody-recorded, integrity-checked — at the moment it is served; the cross-reader denial stays refused (403). A governed deletion is therefore permanent for every reader until the version is withdrawn, and every derivation refuses the incomplete history from then on | F1 ×2 (+ file 1's deletion probe, now last because the loss no longer hides) |
| **F2** historical origins ignored incomplete history | the loop took `then.points` without `then.complete`; the earlier probe (12 origins < 20) never reached the loop | on a series dated after its own recording (2026-10 → 2029-06) the historical loop fits and scores **24 origins**; after a governed deletion the outer assembly refuses (409) and nothing is recorded; a MIX (doubles: 6 of 30 incomplete with sufficient history) excludes exactly those and enforces the 20-origin minimum | incomplete origins are counted out (`incomplete` on the record and in the verdict), never fitted | historical ×2, doubles ×2 |
| **F3** recovery lost older evidence policies | `controlsFor` searched the current assembly, which after supersession holds only v2 | owed flip citing v1; the publisher restated the same windows under residency `EU-only` / licence `fixture-v2` (v2 of the cited objects); recovery from ANOTHER indicator's evaluation | controls are resolved from the **exact cited version** (`evidenceVersion` read) — residency `EU`, rights `fixture`, retention `24 months` on the recovered warning and its header; when they cannot be resolved the warning is **not admitted** and stays visibly owed (doubles: nothing admitted, nothing raised) | F3 ×1, doubles ×1 |
| **F5/F4** late warnings produced invalid windows; replay timing only at issuance | a January 24 live warning against a January 22 deadline closed before it opened (`wrn_window`); expiry and acknowledgement used the wall clock | reproduced: the raise failed and every retry would fail the same way | raised **at or after** the deadline is a **missed decision** (`decision_missed`, `timely=false`) with the branch's own window, valid; exactly at the deadline is missed too. Expiry runs on each warning's own clock (`expire_warnings(p_replay_as_of)`: live on the audit clock, replay only against the evaluating call's replay clock — the newest observation's day). Acknowledgement is **as of** an instant on that clock (`acknowledged_as_of`, required for replayed warnings), with `response_timely` recorded separately from issuance `timely`; the audit `acknowledged_at` stays beside it. An expired warning still refuses acknowledgement (preserved) | F4/F5 ×4 |
| **F6** a missing weekday read as a holiday | mean cadence plus a later observation justified a stand-in | a business-day fixture missing Thursday 2023-06-15 was scored from Wednesday | a stand-in is admissible only on the series' **attested publication calendar** (`publication_calendar` on the registry: `business-days` rule and/or listed closures, with the attesting authority) AND a later observation; a weekday the publisher did not publish stays unscored; without a calendar nothing is substituted. The before-target refusal is preserved | calendar ×6 |

### 12.1 The DEGRADED banner

`/readyz` said `{"status":"degraded","audit":"degraded","auditIncidents":4,"degradedSince":"2026-09-05T11:14:52Z"}`
and the API log said `restored DEGRADED audit state from the durable journal`. The journal
(`apps/api/.eye-local/degraded/audit-degraded.jsonl`) holds four `evidence_write_failed`
records on `prediction.outcome.record` from 2026-09-05 11:14–11:16 — the first pass's outcome
ledger UPDATE hitting the append-only trigger during the demonstration at `737ca81a`, the cause
0030 removed. Those incidents were recorded in a demonstration database that has since been
dropped and recreated, so `node dist/audit/reconcile-degraded.js` (the existing procedure)
finds nothing to reconcile and — correctly, by C9 — refuses to clear the flag without a governed
reconciliation. The journal is a property of the DEPLOYMENT: the demonstration now runs with its
own `EYE_DEGRADED_DIR`, the dev API keeps its journal, and `/readyz` on the demonstration reports
`ok` with `audit` not degraded — inspected by the browser check, not assumed from the banner.

### 12.2 Browser verification, action paths

`e2e/phase4-prediction.demo.spec.ts` now also **seeds** states through the governed API and
exercises the actions on screen: acknowledging a replayed warning as of an instant inside its
window (recorded in time, audit clock beside it), acknowledging after the window (recorded LATE,
issuance still timely), a window nobody answered expired by the replay clock with acknowledgement
refused, and a warning issued after its decision deadline shown as a missed decision with a valid
window. Results in §4.

### 12.3 The demonstration and the browser, at this candidate

* Acts I–IV on a fresh database, with the live ECB activation: **0 problems** in every act. One
  earlier run hit a transient egress timeout on the ECB endpoint at the 13th window; the
  activation script resumed from the checkpoint at 2011-01-13 on rerun and finished
  (28 windows) — F7's resume, exercised for real — and the whole demonstration was then rerun
  clean. ECB is registered with its attested business-day calendar (no closures listed); the
  replayed warning is answered as of 2024-01-18, inside its window, response timely, audit clock
  recorded.
* `/readyz` on the demonstration: `{"status":"ok","audit":"ok","auditIncidents":0}`.
* Browser, `e2e/phase4-prediction.demo.spec.ts` through the installed Chrome: **10 / 10** — the
  five screen checks, the readiness check (fails on any DEGRADED API), and four action-path
  checks that seed their own branches through the governed API: acknowledged in time as of
  2024-01-18 (recorded 2026-09-06); acknowledged LATE as of 2024-01-25 with issuance still in
  time; a six-hour replayed window expired as of 2024-01-17 23:59:59Z by the replay clock with
  acknowledgement refused; a warning issued after a 2024-01-10 deadline shown as a missed decision
  with its 2024-01-17 → 2024-01-19 window.
* Measurements unchanged from §10.8: ECB retrospective T1 85.0% / T2 skill −1.6%,
  `validated_retrospective`; historical `CANNOT VALIDATE` (0 of 40 origins, 0 incomplete);
  corridor `validation_impossible`; T3 unmeasured.

### 12.4 Follow-up from the Codex check of `843e2ccb`

* **Response timing on screen is three states.** `response_timely` is a nullable 0031 column and
  older acknowledgements carry NULL; the warnings screen read "not false" as "in time" and put a
  positive claim on records that made none. `apps/web/lib/warning-timing.ts` now yields
  `in_time` / `late` / `unknown`; a null or absent value renders "acknowledged — response timing
  unknown (not recorded)" in a muted tone, timestamps shown as recorded and nothing inferred from
  the audit clock. Focused check: `apps/web/lib/warning-timing.test.ts` (true, false, null,
  absent), run by `pnpm --filter @eye/web test` — the web package's first unit check, so its
  `test` script now runs vitest instead of an echo.
* The maintenance note and PR #39 no longer claim that pushes to PR #38 execute the extended
  recheck; PR #38's run 34029714842 skipped it, as its branch lacks the `ci.yml` change.

## 13. Disposition — the functional correction review is closed

Codex verified both follow-ups of §12.4. **The agreed functional correction review of Phase 4
is closed at PR #38 head `98e7d9e6f37135d3e9b603a00253baf338c366c8`** (2026-09-06). It stays
closed unless new evidence warrants reopening a specific finding. What remains open is not
functional: the C15 supply-chain gate is red on the pinned images for 13 ungoverned util-linux
findings (§11, PR #39), and both PRs stay unmerged until a verified patched official image
exists, the governed digest update and disposition reconciliation are made, and every required
gate — including the C16/C17 steps currently skipped behind C15 — runs green on the resulting
candidate. No waiver and no gate bypass is authorised. The source decisions, the forecast
limitations (§2, §6), the frozen T1–T4 / D1–D8 criteria and the deferred correction consumer
are unchanged.

