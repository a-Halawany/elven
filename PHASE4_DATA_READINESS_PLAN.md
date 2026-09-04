# THE EYE — Phase 4 Data and Product Readiness Plan: Prediction + Scenario Intelligence (L6–L7)

> **Nothing here is implemented, and nothing here is a request to buy anything.** This plan answers
> one question before Phase 4 starts: *do we have the data to build a forecasting capability that
> is worth an operator's trust, and if not, exactly what is missing?*
>
> Scope comes from the frozen roadmap (`docs/the-eye-master-build-prompt.md`, Phase 4). Phases 0–3
> are closed and are not reopened. Source position follows the owner's standing direction:
> **activate anonymous free sources first, treat the existing UN Comtrade key as available, keep
> sources with unresolved reuse terms in replay, purchase nothing.**

---

## 1. The capability an operator gains

Phase 3 gave the operator a memory that knows when the world changed under it. Phase 4 gives them
a memory that says **what it expects to happen next, and how wrong it has been before.**

**Forecasts.** A forecast object over one of the canonical horizons (30/90/180 days, 1/3/5 years)
declaring its distribution — not a point number — its drivers, the assumptions it rests on, its
refresh cadence, and the evidence underneath every one of those. It is a Strategy Graph citizen:
when a corrected claim invalidates an assumption, the forecast resting on it is surfaced by the
propagation Phase 3 already built.

**Scenarios.** A tree with a baseline and named branch points, each branch carrying indicators,
signposts, an owner and a review cadence. A branch **flips when its indicator threshold is
breached** — the flip is an event with a receipt, not a re-render.

**Early warning.** Evidence + consequence + confidence + a **response window**, routed to a named
owner. The window is the product: a warning that arrives after the option closed is a report.

**Calibration.** Every forecast is scored against what actually happened, and the operator can see
the platform's own track record by horizon and by driver. This is the feature that makes the rest
defensible — and the one most systems omit because it is the one that can embarrass them.

**The corridor question Phase 4 finally answers:** *"Given transits fell 51% over 72 hours, what is
the distribution of arrival delay for shipment SYN-SHIP-4468, what would have to be true for the
downside branch, and how well have we called this before?"*

## 2. What forecasting actually requires from the data

This is the part that decides whether Phase 4 is buildable, so it is stated in measurements rather
than adjectives.

| Requirement | Why | What "enough" means |
|---|---|---|
| **Historical depth** | A model that has seen one disruption has seen an anecdote. Corridor transit behaviour has a strong annual cycle (Lunar New Year, monsoon, holiday peaks) plus regime changes. | **≥ 3 years** of daily history per chokepoint for a 30/90-day horizon; **≥ 5 years** before a 1-year horizon is offered at all. |
| **Granularity** | The decision is per-corridor per-day. Weekly aggregates cannot express a 72-hour collapse. | **Daily**, per `portid`, per vessel class (`n_container`, `n_tanker`, …) — PortWatch's native grain. |
| **Labels / ground truth** | A forecast is scoreable only against a recorded outcome. Today the platform has **no outcome objects at all**. | An `OUT` Strategy Graph object per resolved forecast, carrying the observed value, its evidence, and the instant it became known. |
| **Known-at discipline** | Backtesting on revised data is the classic way to invent skill that does not exist. | Every training and evaluation read must go through Phase 3's **known-at** path, so a hindcast sees only what was believed then. Phases 1–3 already make this possible; Phase 4 must be built to actually use it. |
| **Event annotation** | "Why was it low?" is a driver, not a mystery. | A small governed **event calendar** (holidays, closures, announced disruptions) as ordinary claims with sources — not a hard-coded table. |
| **Exogenous drivers** | Freight cost and demand move with FX and trade volumes. | EUR/USD daily; component trade volumes monthly. |

**The single largest gap is ground truth.** The platform can say what it observed and what it
believes; it has never once recorded *what happened to a thing it predicted*. Phase 4 is where that
starts, which means **its calibration numbers are worthless until the first horizon actually
elapses** — an honest limitation to design around rather than to discover later.

## 3. Existing replay sources: adequate, and not

| Source | Replay coverage today | Adequate for Phase 4? |
|---|---|---|
| **S1 IMF PortWatch — chokepoints** | 3 chokepoints, **2023-12-01 → 2024-01-31** (~2 months) | **No — depth.** The grain and fields are exactly right; the window is ~2 months against a ≥3-year requirement. This is the one source where going live matters most, and it is free and anonymous. |
| **S2 PortWatch — ports** | Rotterdam, Ningbo, same window | **No — same depth problem**, same fix. |
| **S5 ECB EUR/USD** | Daily across the window | **No — depth**, trivially fixable: the ECB API serves the full historical series anonymously in one call. |
| **S6 World Bank indicators** | Annual series | **Adequate as context**, useless as a predictor at a 30-day horizon. Annual data cannot forecast a daily corridor. |
| **S7 UN Comtrade** | One uploaded export | **Partially.** Monthly trade by commodity is a genuine demand driver. Needs multi-year history. |
| **S3/S4 EU sanctions** | RSS + payload | **Adequate for its job** — a discrete event feed for the event calendar, not a time series. |
| **S8 GDELT** | Discovery sample | **Never a predictor.** Observational only, in every phase. Usable at most as an unlabelled attention signal, and only if it can never enter a forecast's evidence as authority. |
| **S9 synthetic company records** | 4 shipments, 5 inventory rows | **No, and not fixable by collecting more** — it is synthetic. It can carry the *decision* side of the demonstration; it can never validate forecast quality. |
| **S10 carrier advisories** | A few PDFs | **Adequate as event annotation**, operator-supplied. |

**Verdict: the replay sets are the right shape and roughly two orders of magnitude too short.** No
new *kind* of source is needed for a first forecasting capability — the existing free ones simply
have to be collected over their real history.

## 4. Which connectors should go live, and in what order

All three are **anonymous, free, already implemented, and already contract-registered**. Going live
means running the existing governed REST poller over a historical backfill window instead of a
frozen replay set — no new connector kind, no new credential.

| Order | Source | Why first | What it needs |
|---|---|---|---|
| **1** | **S1 PortWatch chokepoints** | The corridor signal the whole demonstration turns on, at exactly the needed grain | A backfill run over ≥3 years, paginated at the published `maxRecordCount: 1000`, inside the existing §8.1 budgets. Rights state must be resolved first — see §6. |
| **2** | **S5 ECB EUR/USD** | Cleanest licence position of any source, one call for the full series | Nothing beyond activation. |
| **3** | **S2 PortWatch ports** | Port-level congestion, the second driver | Same as S1, same rights decision. |
| **Not yet** | S6 World Bank | Annual grain adds nothing at a 30-day horizon | — |
| **Not yet** | S8 GDELT | Observational; would need a lawful-collection and attention-signal design of its own | — |

**UN Comtrade (S7).** The free-tier key **already exists in secret storage, unused**. It is worth
activating for Phase 4 *if* monthly component-trade history proves to be a driver — the free tier's
500 calls/day is ample for a monthly backfill. Activating it means binding
`EYE_SRC_COMTRADE_KEY` to that single source contract, header-only, through the existing credential
path. **The key is not read, printed, copied or committed by this plan, and nothing activates it
without owner approval.** Recommendation: activate it in Phase 4 **only after** S1 and S5 have
shown whether the corridor signal needs a demand covariate at all — buying complexity before
evidence of need is how forecasting projects get heavy.

## 5. Free-first source strategy

1. **Anonymous free first.** PortWatch and ECB carry the corridor and the cost exposure between
   them. Both are already implemented and need only activation.
2. **Free-with-key second.** UN Comtrade, from the key already held, and only on evidence of need.
3. **Unresolved reuse terms stay in replay.** A source whose licence is `UNVERIFIED` keeps its
   frozen replay set and its `pending_confirmation` rights state. Phase 1 built that posture on
   purpose; Phase 4 does not get to relax it because it wants more data.
4. **Paid: nothing, pending your decision** (§7).

## 6. Rights and licensing status, as recorded

Both are recorded `UNVERIFIED` in `docs/phase1/SOURCE_DATA_MANIFEST.md`, and both are **decisions
for you, not for me** — they are the difference between a live connector and a replay set.

**IMF PortWatch (S1, S2).** The ArcGIS Hub item licence is recorded as `custom`; PortWatch is
published for public policy use, developed by the IMF with Oxford's Environmental Change Institute,
ESRI, the UN Global Platform, the World Bank and the WTO. The source contract carries
`rights_state: pending_confirmation` and the connector stays in `draft` until that is resolved.
**What is needed:** someone reads the exact reuse notice on the PortWatch portal and records the
finding through the existing rights-confirmation route. **Until then S1/S2 stay in replay** — which
is precisely the depth problem in §3, so this is the single highest-value unblocking action in the
whole plan and it costs nothing but a careful read.

**ECB (S5).** ECB reuse policy with **attribution required**; recorded `UNVERIFIED — confirm exact
notice at registration`. This is the least ambiguous position of any source: the ECB publishes its
reference rates for reuse with attribution, and the platform already carries attribution fields on
every source contract. **Expected outcome: confirmable, low risk** — still yours to confirm, not
mine to assume.

**UN Comtrade (S7).** Attribution required; **redistribution restrictions apply**, recorded
`UNVERIFIED — read the full policy before any redistribution claim`. Internal analysis is the
intended use here and no redistribution is contemplated, but the policy must be read before any
output derived from it leaves the platform.

## 7. Optional paid source — capped, and not purchased

**No purchase or subscription will be made without your explicit approval.** One candidate is worth
naming so the option is costed rather than discovered later:

| Candidate | What it would add | Indicative cost |
|---|---|---|
| A commercial AIS or container-freight-rate feed (e.g. a vessel-position or freight-index API) | Vessel-level positions and freight rates — the two signals PortWatch's *derived* counts cannot give: it is a model over AIS, not a primary observation of our shipments | Entry tiers commonly **€100–500/month**; a bounded evaluation would sit inside the **€500 cap** |

**Recommendation: do not buy anything for Phase 4.** Build the forecasting capability on free
sources, get real backtest numbers, and let those numbers say whether a paid signal would actually
improve them. Buying before the baseline exists means never knowing what the money bought. If the
backtests later show the free signal is the binding constraint, I will come back with the measured
gap and a specific proposal — **and still purchase nothing without your approval.**

## 8. APIs, UI and model approach

**Data model.** One forward migration `0025` in the shape of `0022`–`0024`: forecast events +
projection, scenario trees and branch points, indicator definitions and threshold breaches, warning
records, and the outcome/calibration ledger. Scope triple NOT NULL, `FORCE ROW LEVEL SECURITY`,
SECURITY DEFINER ports asserting the caller's own bound action. Forecast, scenario and warning
objects are **canonical objects** (`FCT`, `SCN`, `WRN`) with the 43-column header, joining the
Strategy Graph as things assumptions and objectives can rest on. It extends the existing post-C18
upgrade check by one line — **not a new gate.**

**API.** The same surface, same envelope, same capabilities, same receipts: `forecasts/*`
(declare, list, get, known-at, score), `scenarios/*` (tree, branch, flip), `indicators/*`
(define, evaluate), `warnings/*` (raise, route, acknowledge), `calibration/*`.

**Model approach — statistics first, and the model on a leash.**
* **Baselines that must be beaten:** seasonal naïve and a simple seasonal-ARIMA/ETS on the daily
  transit series. A learned model that cannot beat seasonal naïve is not a capability, and the UI
  should say so.
* **Distributions, not points.** Quantile forecasts (10/50/90) so the operator sees the spread. A
  point estimate hides exactly the uncertainty a corridor decision turns on.
* **The Model Gateway, reused as built.** Phases 2 and 3 have one governed egress with two modes;
  Phase 4 adds no second one. The gateway's role is **narrative and driver attribution** — putting
  the "why" into words a person can check against evidence — not producing the number. A model that
  invented the number could not be calibrated against anything.
* **No hosted API, no new credential, no new model provider.**

**UI.** A fourth workspace: Forecasts (with distribution, drivers, assumptions and the evidence
under each), Scenarios (tree with branch state and the indicator that would flip it), Warnings
(with the response window and its named owner), and **Calibration** — the track record, shown by
horizon, including where the platform has been wrong. Same rules: receipts only from authoritative
responses, state never by colour alone, keyboard-operable, RTL-mirrored.

## 9. Hindcast and backtest criteria that measure something useful

Criteria measure **product usefulness**, not model vanity. Frozen before implementation, as in
every prior phase.

| # | Criterion |
|---|---|
| **D1** | Every forecast names its distribution, horizon, drivers and assumptions, and every driver resolves to evidence. A forecast that cannot say what it rests on is refused at admission. |
| **D2** | A hindcast reads **only** through the known-at path. Given a cut-off, the pipeline provably cannot see a value recorded after it — asserted by replaying a corrected series and showing the forecast used the pre-correction value. |
| **D3** | The learned forecaster is scored against **seasonal naïve** on the same windows. The comparison is reported whether or not it is flattering, and the UI shows it. |
| **D4** | Calibration is measured, not asserted: interval coverage (does the 10–90 band contain the outcome ~80% of the time?) and pinball loss by horizon. |
| **D5** | A scenario branch **flips** when its indicator breaches its threshold, the flip is an event with a receipt, and the branch owner is named. |
| **D6** | A warning carries a **response window**, routes to a named owner, and is recorded as acknowledged or not. A warning nobody received is a failure, and the record must show it as one. |
| **D7** | Correcting a claim a forecast rests on marks the forecast's assumption unverified and surfaces the forecast — the Phase 3 propagation path, extended to forecasts and asserted end to end. |
| **D8** | Phase 0–3 regression: full CI green, no constitutional invariant weakened, C18 still frozen at 0021, and the Phase 1–3 operator journeys unchanged. |

### The corridor replay cannot establish forecast quality — stated plainly

**The five-day frozen corridor window (2024-01-11 → 2024-01-15, and the ~2-month replay set around
it) CANNOT establish forecast quality, and no number derived from it will be presented as though it
could.** It is a single disruption, on three chokepoints, with no held-out period and no repeated
events to average over. Any accuracy figure computed on it would be a description of one week, not
evidence of skill — and reporting it as skill would be the most damaging thing this phase could do
to the platform's credibility.

The corridor replay's honest role in Phase 4 is **mechanical**: proving the pipeline runs, that
known-at is respected, that a branch flips, that a warning routes, and that propagation reaches a
forecast. **Forecast quality requires the multi-year live history in §4**, and the first calibration
numbers are only meaningful once a real horizon has elapsed against real outcomes. Until then the
Calibration screen should say, in words, that it has nothing to report yet.

## 10. The next end-to-end demonstration

**Act IV of the 72-Hour Corridor Decision — "what happens next, and how wrong have we been?"**

The operator opens the corridor entity Phase 3 resolved, and sees a **30-day transit forecast** with
its 10/50/90 band, its drivers and the evidence beneath them. A **scenario tree** carries a branch
point — *"transits stay below 35/day for five consecutive days"* — with an indicator, a signpost
and an owner. The replayed January collapse **breaches that threshold**, the branch **flips** with a
receipt, and an **early warning** routes to the named owner with a response window that closes
before the third shipment must be booked. Then the publisher's correction lands: the assumption goes
unverified, and **the forecast that rested on it is surfaced beside the objective and the
commitment** — Phase 3's propagation, now reaching the prediction layer. Finally the **Calibration**
screen is opened and honestly reports that it has nothing to score yet, and why.

## 11. Estimated implementation time

| M | Deliverable | Est. |
|---|---|---|
| **P4-M0** | Rights confirmation for PortWatch and ECB; live backfill of S1, S2, S5 over ≥3 years through the existing governed poller | 3–4 days *(gated on §6, which is a decision, not work)* |
| **P4-M1** | Migration `0025`, forecast/scenario/warning/outcome objects, upgrade check extended by one line | 4–5 days |
| **P4-M2** | Baselines (seasonal naïve, ETS/ARIMA), the forecasting service, known-at-respecting feature assembly | 5–6 days |
| **P4-M3** | Scenario trees, indicators, threshold breach and branch flip | 4–5 days |
| **P4-M4** | Early warning: response windows, routing, acknowledgement | 3–4 days |
| **P4-M5** | Outcome ledger and calibration: coverage, pinball loss, the honest empty state | 4–5 days |
| **P4-M6** | Forecasts, Scenarios, Warnings and Calibration UI | 5–6 days |
| **P4-M7** | Act IV demonstration, D1–D8 acceptance, Phase 4 report | 3–4 days |

**Realistic duration: 5–6 weeks**, plus whatever the backfill takes in wall-clock time once the
rights question in §6 is answered. That answer is the critical path — not the code.

## 12. Decisions I need from you

1. **PortWatch reuse terms** (§6) — the single unblocking action; without it S1/S2 stay in replay
   and the depth problem in §3 stands.
2. **ECB reuse notice** (§6) — expected to be straightforward, still yours to confirm.
3. **UN Comtrade** — activate the existing free-tier key in Phase 4, or leave it untouched until
   the corridor signal shows it is needed? My recommendation is the latter.
4. **Paid sources** — my recommendation is to buy nothing now and revisit with measured backtest
   numbers. Confirm, and nothing will be purchased.
