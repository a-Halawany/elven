# THE EYE — Phase 4 Product Handoff

> **Prediction + Scenario Intelligence (L6–L7).** What a person can now do that they could not
> before Phase 4, how to run it, and what is honestly not finished.
>
> This is a product handoff, not a claim of independent code review. Report:
> [PHASE4_REPORT.md](PHASE4_REPORT.md). Plan, targets and frozen criteria:
> [PHASE4_DATA_READINESS_PLAN.md](PHASE4_DATA_READINESS_PLAN.md) (§2a T1–T4, §9 D1–D8, §14 the
> owner's four source decisions of 2026-09-05).

---

## 1. What an operator can now do, end to end

**As a forecast owner**

* **Register a series** — a number read out of evidence by a *named, deterministic, version-pinned
  parser* (`sdmx-json-observations@1`, `arcgis-feature-attribute@1`). There is no model between the
  bytes and the number, and nothing is forecast that is not registered.
* **Read the series as it was known at an instant.** Every point names the evidence object, its
  version and its digest; a version recorded after the instant does not exist for the reader, and a
  world-time cut-off excludes later observations even from evidence already held.
* **Run a backtest** at a horizon: the learned model (additive Holt-Winters) against **seasonal
  naive** on identical rolling origins with identical cut-offs. The verdict names T1 and T2 and is
  stored whether or not it flatters the model.
* **Issue a forecast** — a 10/50/90 band, never a point — that must name the assumption it rests
  on, its drivers, and the evidence under them, or it is **refused at admission**. The method is
  chosen by the backtest record: the learned model only when it beat seasonal naive by 15%;
  otherwise the seasonal baseline is the forecaster **and the forecast says so**.
* **See what a forecast is allowed to claim** before its number: `validated`, `unvalidated`, or
  `validation_impossible`, with the note that says why; and `live` or `REPLAY DEMONSTRATION`.
* **Declare a scenario tree** on a forecast: a baseline and branches, each with the **indicator**
  that flips it, a signpost, a **named owner**, a review cadence, a response window and a
  consequence.
* **Evaluate an indicator.** A run of consecutive published observations past the threshold
  **flips the branch** — an event with a receipt — and raises a **warning** to the branch owner
  with the window in the same governed operation. A flip without a warning cannot exist.
* **Acknowledge a warning**, and say what was done. A warning nobody acknowledged before its window
  closed is recorded as **expired**: a failure the record shows.
* **Score an outcome** once the target day has been observed. The score is never revised in place.
* **Read the calibration record** — coverage and pinball loss by series, horizon and method, from
  outcomes and from backtests separately — or read, in words, that there is nothing to score yet.

**As a strategy owner** — declare the assumptions forecasts rest on; declare scenario trees; and
when a correction lands, run **Impact** and see the forecasts it reached **marked for attention**
beside the assumptions, objectives and commitments Phase 3 already reported.

**As a collection manager** — the ECB EUR/USD source is now **live**: contract v2, rights confirmed
against the ESCB reuse policy with the policy quoted as evidence, a declared closed-range backfill
from 1999-01-04, and the attribution *"Source: ECB statistics."* on every rate shown.

## 2. The exact reproducible run

Nothing below needs a paid service, a hosted model or a new credential. The ECB step reaches the
ECB Data Portal anonymously, as the owner decided; PortWatch stays in replay.

```bash
scripts/demo.sh                                # Phase 0: migrate (0001–0030), bootstrap, API on :3401
node scripts/phase1/seed-demo.mjs              # act I   — sources, replay collection
node scripts/phase2/seed-extraction.mjs        # act II  — claims with lineage
node scripts/phase3/seed-graph.mjs             # act III — entities, graph, strategy, impact
node scripts/phase4/activate-ecb.mjs           # P4-M0b — ECB v2: approve, rights, activate, backfill (3 runs)
node scripts/phase4/seed-prediction.mjs        # act IV  — series, backtests, forecasts, scenario, flip, warning, correction, calibration
```

The web shell at `http://localhost:3000/prediction` renders the same records: Overview, Forecasts,
Scenarios, Warnings, Calibration. Sign in as `n.eriksen` (forecast owner) or `j.weber` (strategy
owner) with the operator password from `.eye-local/env`.

To look at the Prediction screens in a browser against that demonstration (API on :3401, web on
:3000 from `pnpm --filter @eye/web start`), sign in as `n.eriksen` — or run the same walk-through
Playwright does, through the installed Chrome:

```bash
npx playwright test -c playwright.demo.config.ts
```

It opens the overview, a forecast (the badge says `VALIDATED RETROSPECTIVELY` and lists the
inherited controls), the calibration table (backtest `Mode`), the scenario tree (the branch's
decision deadline, `T3 unmeasured` where none was declared) and the replayed warning (`REPLAY ·
raised as of 2024-01-17 (recorded 2026-…)`, timely against the 2024-01-22 deadline).

## 3. What the demonstration shows

Act IV, on a database carrying acts I–III and the ECB backfill:

1. Four series registered: `ecb-eurusd` (live, 7,086 observations from 28 evidence versions,
   1999-01-04 → today) and the three PortWatch chokepoints the replay covers (19–21 observations
   each). Each point names its evidence. The corridor for the act is **chosen from the data** — the
   chokepoint with the deepest drawdown against its median (Bab el-Mandeb, 50%) — not named in
   advance, and the indicator threshold is 75% of that median.
2. All four backtested at 30 days against seasonal naive. The ECB backtest records real T1/T2
   numbers: the learned model's band covers 85% (T1 met, at the edge) and its pinball loss is
   **1.6% worse** than seasonal naive (T2 NOT met) — so the **seasonal baseline is the forecaster**,
   and the forecast says so. The corridor backtests record **CANNOT VALIDATE** — ~20 observations,
   0 usable origins — and no accuracy is claimed.
3. A forecast that rests on nothing is refused. The ECB forecast is issued as `live` and
   `validated`; the corridor forecast is issued as of 2024-01-11 from 15 observations, labelled
   **REPLAY DEMONSTRATION** with `validation_impossible`, its band explicitly **approximated** from
   shorter-step errors, and its statement says all of it. A reader positioned on 2024-01-01 sees no
   forecast at all.
4. A scenario tree on the corridor forecast: Baseline, and *Corridor collapse* — "transits below
   41/day for five consecutive published observations", owner N. Eriksen, 48-hour response window,
   consequence "rebook SYN-SHIP-4468 via the Cape".
5. The replayed January collapse is evaluated: the branch **flips on 2024-01-17** with a receipt, a
   warning routes to N. Eriksen with the window, and it is acknowledged inside it.
6. The publisher corrects one evidence object the forecast was fitted on. Phase 3's propagation
   reaches the forecast and **marks it for attention**; the forecast screen says why.
7. Calibration reports that **no outcome has been scored** — no horizon has elapsed — and shows the
   backtests as backtests. Scoring the corridor forecast before its target day is refused.

## 4. What is not finished — stated, not implied

* **No forecast in this phase has been validated on the corridor signal.** The plan said the
  five-day corridor replay cannot establish forecast quality; it cannot, and the corridor forecast
  carries `validation_impossible` in its own record. Validation needs the multi-year PortWatch
  history, which waits on the IMF's answer to the permission request
  ([PHASE4_PORTWATCH_PERMISSION_REQUEST.md](PHASE4_PORTWATCH_PERMISSION_REQUEST.md)). The backfill
  mode that will collect it is built and tested against a transport double.
* **T3 (usefulness) is unmeasured.** The first pass timed the replayed January 2024 flip by the
  2026 audit clock. Now a warning records `raised_as_of` (in replay, the breaching observation)
  separately from `raised_at` (audit), and `timely` against a decision deadline the declarer
  sets; without a deadline it is `null` and the screen says "T3 unmeasured". The replay holds
  one episode; the ≥80% target needs more than one, and the record does not claim it.
* **Validation on the backfilled ECB vintage is retrospective, never historical.** A
  `historical` backtest gives each origin only what was recorded by its own day, and the whole
  ECB history was recorded on 2026-09-05 — so it cannot validate, and says so. The forecast's
  state is `validated_retrospective`, and the badge says what that means.
* **Live outcomes: none yet.** Calibration from real outcomes starts when the first issued horizon
  elapses; until then the screen says so and shows backtests, labelled as backtests.
* **The Model Gateway is not used for narrative.** Driver attribution is deterministic (the series
  and its evidence); no prose is generated. `narrative` is `null` on every forecast rather than a
  replay transcript that would have no recording to replay.
* **Backfilled history is the series as published now.** For ECB the evidence was recorded on
  2026-09-05; publisher revisions made before collection cannot be distinguished. The known-at
  discipline is enforced on every revision from now on, and the backtest record states this.
* **UN Comtrade** untouched; **PortWatch** replay; **nothing purchased**.

## 5. Credentials and services

No hosted API, no new credential, no paid service. The UN Comtrade key was not read. The ECB
activation used the anonymous public endpoint; the reuse terms and attribution are on the
contract.

## 6. Migrations `0028`–`0030` — upgrade evidence

`0028` adds `SRC@v2` (backfill declaration, attribution notice) and the `item.revised` run event.
`0029` adds the `prediction` schema — twelve tables under FORCE row-level security, eleven ports,
three canonical schemas (FCT, SCN, WRN), two roles — and teaches the Strategy Graph three
dependents and two target kinds. `0030` (the correction pass) adds backtest modes and knowledge
cut-offs, the validation binding on `issue_forecast`, inherited controls on forecasts, scenarios
and warnings, the owed-warning obligation on branches (one warning per flip), replay timing and
decision deadlines on warnings, and the observed-on / substitution record on outcomes — all
forward-only, with `record_outcome` refusing a score before the target day. The post-C18 upgrade
check applies all three to a 0021 database
carrying Phase 0 data and previously assessed correction cases, matches the schema against a virgin
0001–0030 database, and runs every later-phase suite on the upgraded data.
