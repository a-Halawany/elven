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
| **Historical depth** | A model that has seen one disruption has seen an anecdote. Corridor transit behaviour has a strong annual cycle (Lunar New Year, monsoon, holiday peaks) plus regime changes. | **≥ 3 years** of daily history per chokepoint for a 30/90-day horizon; **≥ 5 years** before a 1-year horizon is offered at all. **Measured available: 7.7 years — see §3a.** |
| **Granularity** | The decision is per-corridor per-day. Weekly aggregates cannot express a 72-hour collapse. | **Daily**, per `portid`, per vessel class (`n_container`, `n_tanker`, …) — PortWatch's native grain. |
| **Labels / ground truth** | A forecast is scoreable only against a recorded outcome. Today the platform has **no outcome objects at all**. | An `OUT` Strategy Graph object per resolved forecast, carrying the observed value, its evidence, and the instant it became known. |
| **Known-at discipline** | Backtesting on revised data is the classic way to invent skill that does not exist. | Every training and evaluation read must go through Phase 3's **known-at** path, so a hindcast sees only what was believed then. Phases 1–3 already make this possible; Phase 4 must be built to actually use it. |
| **Event annotation** | "Why was it low?" is a driver, not a mystery. | A small governed **event calendar** (holidays, closures, announced disruptions) as ordinary claims with sources — not a hard-coded table. |
| **Exogenous drivers** | Freight cost and demand move with FX and trade volumes. | EUR/USD daily; component trade volumes monthly. |

**The single largest gap is ground truth.** The platform can say what it observed and what it
believes; it has never once recorded *what happened to a thing it predicted*. Phase 4 is where that
starts, which means **its calibration numbers are worthless until the first horizon actually
elapses** — an honest limitation to design around rather than to discover later.

## 2a. The measurable target

A capability with no number to hit is a demo. These are the thresholds Phase 4 must clear **before
a forecast is shown to an operator at all** — they are targets to be met, not predictions that they
will be met, and the honest outcome if they are missed is a Calibration screen that says so rather
than a forecast that ships anyway.

| # | Target | Measured how |
|---|---|---|
| **T1 — Calibration** | The 10–90 interval contains the outcome **80% ± 5pp** | Interval coverage over all held-out windows, per horizon |
| **T2 — Skill** | **≥ 15% lower pinball loss than seasonal naïve** at the 30-day horizon | Both models scored on identical held-out windows, same known-at cut-offs |
| **T3 — Usefulness** | The warning fires **before the decision window closes** in **≥ 80%** of replayed disruption episodes | Warning instant vs. the recorded window close, per episode |
| **T4 — Honesty** | **100%** of shown forecasts carry distribution, drivers, assumptions and evidence; **0** shown without them | Schema-enforced at admission, asserted in acceptance |

**T1 is the one that matters most and the one most likely to fail first.** A model can beat a naïve
baseline on average and still be badly overconfident, and an overconfident band is worse than no
band: it invites an operator to act on a precision that is not there.

**T2's baseline is not a formality.** Seasonal naïve on daily chokepoint transits is genuinely hard
to beat at a 30-day horizon. If the learned model cannot clear it by 15%, the right product answer
is **to ship the seasonal baseline as the forecaster** and say so on screen — not to ship a heavier
model that is not better.

**None of these can be evaluated on the corridor replay** (§9). They require the multi-year history
in §3a and, for T3, more than one disruption episode.

## 3. Existing replay sources: adequate, and not

| Source | Replay coverage today | Adequate for Phase 4? |
|---|---|---|
| **S1 IMF PortWatch — chokepoints** | 3 chokepoints, **2023-12-01 → 2024-01-31** (~2 months) | **No — but the publisher holds 7.7 years** (§3a). The grain and fields are exactly right and the depth exists; what stands between us and it is the reuse question in §6, not availability. |
| **S2 PortWatch — ports** | Rotterdam, Ningbo, same window | **Same position as S1** — same publisher, same terms, same fix. |
| **S5 ECB EUR/USD** | Daily across the window | **No — depth**, and the cleanest position of any source: explicit free-reuse terms (§6), long-running series. **Start date now verified: 1999-01-04** (§3a). |
| **S6 World Bank indicators** | Annual series | **Adequate as context**, useless as a predictor at a 30-day horizon. Annual data cannot forecast a daily corridor. |
| **S7 UN Comtrade** | One uploaded export | **Partially.** Monthly trade by commodity is a genuine demand driver. Needs multi-year history. |
| **S3/S4 EU sanctions** | RSS + payload | **Adequate for its job** — a discrete event feed for the event calendar, not a time series. |
| **S8 GDELT** | Discovery sample | **Never a predictor.** Observational only, in every phase. Usable at most as an unlabelled attention signal, and only if it can never enter a forecast's evidence as authority. |
| **S9 synthetic company records** | 4 shipments, 5 inventory rows | **No, and not fixable by collecting more** — it is synthetic. It can carry the *decision* side of the demonstration; it can never validate forecast quality. |
| **S10 carrier advisories** | A few PDFs | **Adequate as event annotation**, operator-supplied. |

**Verdict: the replay sets are the right shape and roughly two orders of magnitude too short.** No
new *kind* of source is needed for a first forecasting capability — the existing free ones simply
have to be collected over their real history. **§3a establishes that the history exists.**

## 3a. What history actually exists — measured, not assumed

The first version of this plan said the depth requirement was unmet and left it there. That was an
assumption. It has now been checked against the publishers.

**IMF PortWatch — Daily Chokepoints Data.** Queried the live FeatureServer's own statistics
endpoint (anonymous, read-only, one metadata request; nothing ingested):

| Measured | Value |
|---|---|
| Earliest observation | **2019-01-01** |
| Latest observation | **2026-08-30** |
| Total rows | **78,372** |
| Chokepoints | 28 |
| Per chokepoint | ≈ 2,799 daily rows ≈ **7.7 years** |
| `maxRecordCount` | 1,000 · `capabilities`: `Query` (read-only) |

**This clears both bars in §2 with room to spare** — ≥3 years for a 30/90-day horizon and ≥5 years
before a 1-year horizon. The depth problem is therefore **not a data-availability problem**. It is a
collection problem and a **reuse-terms problem** (§6), and those are different things with different
fixes.

**ECB EUR/USD reference rate.** A first attempt at this probe returned `503`. Re-probed on
2026-09-05 with one anonymous five-day request (`startPeriod=1999-01-04&endPeriod=1999-01-08`,
3,634 bytes, nothing ingested): **the series' first observation is 1999-01-04** (1.1789), the API
answers `200`, and the SDMX-JSON shape matches the frozen replay set. That is **27.7 years** of
daily business-day observations — far beyond either bar in §2.

**UN Comtrade.** Not probed — doing so would mean using the held credential, and nothing in this
plan touches it.

## 4. Which connectors should go live, and in what order

All three are **anonymous, free, already contract-registered, and served by the existing governed
REST poller** — which today polls *forward* from a checkpoint and has **no closed-range backfill
mode** (§4a). Going live means adding that mode to the existing connector and running it over a
historical window instead of a frozen replay set — no new connector *kind*, no new credential, and
a **new contract version** for each activated source declaring the backfill it performs.

| Order | Source | Why first | What it needs |
|---|---|---|---|
| **1** | **S5 ECB EUR/USD** | **Promoted to first.** Its reuse terms are explicit and permissive (§6); PortWatch's are not. Activating the source whose licence is settled, while the harder question is answered, is the free move. | Activation, plus the backfill work in §4a. |
| **2** | **S1 PortWatch chokepoints** | The corridor signal the whole demonstration turns on, at exactly the needed grain, with 7.7 years available | §4a **and** a resolved answer to §6 — the IMF terms restrict *systematic* downloading, which is exactly what a backfill is. |
| **3** | **S2 PortWatch ports** | Port-level congestion, the second driver | Same as S1, same decision. |
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

## 4a. What a backfill actually requires to build

"Run the existing poller over more history" understates the work. The connector Phase 1 shipped
**polls forward from a checkpoint**; a historical backfill **walks backwards over a closed range**.
That is a different traversal, and it is the real implementation cost.

| Requirement | Detail |
|---|---|
| **Bounded backfill mode** | A new run mode on the existing REST poller: a closed `[from, to)` window, walked in deterministic pages, that terminates. Today's checkpoint semantics ("resume from the last cursor") have no end condition and no notion of walking into the past. |
| **Deterministic pagination** | ArcGIS pages via `resultOffset`/`resultRecordCount`, and **page order is undefined without an explicit `orderByFields`**. Without it a backfill can silently skip and duplicate rows. Must order by `date,portid` and record the ordering in the source contract. |
| **Request volume** | 78,372 rows ÷ 1,000 = **79 requests** for the entire global dataset; the 3 corridor chokepoints are ≈ 8,400 rows ≈ **9 requests**. The volume is trivial. |
| **Budget conflict — real** | The source contract's `max_requests_per_run` is **12**. A full 28-chokepoint backfill (79) exceeds it. Either the backfill runs as several checkpointed runs inside the existing budget, or the contract is amended through the governed approval path. **Do not raise the budget silently** — the budget is a control, and a backfill is exactly the workload it exists to bound. |
| **Idempotency** | A re-run must not admit duplicate evidence. The existing digest-comparison path handles this, but it has never been exercised over a range that overlaps an earlier run — that needs a focused test. |
| **Evidence volume** | ≈ 8,400 framed items for 3 chokepoints → ≈ 8,400 EVD objects, vault bytes and custody entries. Comfortably within current storage; worth stating rather than discovering. |
| **Publication lag** | PortWatch runs ≈ 7–10 days behind real time. A "today" forecast is really a "7–10 days ago" forecast, and the freshness indicator must carry that into the forecast object rather than leaving the operator to remember it. |
| **Revision handling** | PortWatch revises rows in place with no corrections feed. Over 7.7 years revisions are certain. Each is a **supersession**, and the known-at path (T2/D2) depends on them being recorded as such — untested at this scale. |

**Estimated: 3–4 days of connector work**, independent of the §6 decision. It is bounded, and it is
not free.

## 5. Free-first source strategy

1. **Anonymous free first.** PortWatch and ECB carry the corridor and the cost exposure between
   them. Both are already implemented and need only activation.
2. **Free-with-key second.** UN Comtrade, from the key already held, and only on evidence of need.
3. **Unresolved reuse terms stay in replay.** A source whose licence is `UNVERIFIED` keeps its
   frozen replay set and its `pending_confirmation` rights state. Phase 1 built that posture on
   purpose; Phase 4 does not get to relax it because it wants more data.
4. **Paid: nothing, pending your decision** (§7).

## 6. Reuse terms, read at the source

The first version of this plan said both were `UNVERIFIED` and that someone should read them. They
have now been read. **One is settled and favourable; the other has a condition that changes the
recommendation in §4.**

### ECB (S5) — settled, and permissive

The ESCB reuse policy states publicly available ESCB statistics may be reused free of charge on the
condition that **"the source is quoted (e.g. 'Source: ECB statistics.') and that the statistics
(including metadata) are not modified."**

| Condition | What it means for us |
|---|---|
| Quote the source | The source contract already carries publisher and attribution fields; the UI must render "Source: ECB statistics" wherever a rate is shown or exported. **Small, real UI work.** |
| Do not modify the statistics | We preserve original bytes with digests and never mutate evidence — Phase 1 already satisfies this by construction. **Derived** claims are ours and are marked `extracted`, not presented as ECB statistics. |
| Not third-party data | The EUR/USD reference rate is the ECB's own. Clear. |
| No continuity guarantee | Revisions and updates are expected; our supersession path already handles them. |
| Access may be restricted in exceptional circumstances | Our replay fallback means an ECB restriction degrades us to replay, not to nothing. |

**Position: activate.** This is the cleanest source in the portfolio and there is no reason it should
be sitting in replay. It is why §4 promotes it to first.

### IMF PortWatch (S1, S2) — a real condition, and it bites

The dataset's own ArcGIS item metadata carries **`licenseInfo: https://www.imf.org/external/terms.htm`**
— read first-hand from the `Daily_Chokepoints_Data` service item (`3da2b9ca97684916b75c4013f95d18ab`).
That is the **IMF's general Copyright and Usage terms, not an open-data licence.** The layer's own
`copyrightText` is empty and there is no CC or ODbL designation anywhere on the item.

The IMF general terms, as published on that page, permit free **non-systematic** downloading for
personal, non-commercial use; require attribution to the IMF as source when data is redistributed;
and **require permission to copy or download Content in any systematic way**, or to re-use or
disseminate a substantial amount beyond fair use.

> **The finding:** a multi-year automated backfill of an entire daily series is *systematic
> downloading* on any ordinary reading of that phrase, and 7.7 years × 28 chokepoints is
> *substantial*. **The §4 recommendation to backfill PortWatch runs directly into the one condition
> its licence actually imposes.**

I could not retrieve `imf.org/external/terms.htm` directly — **it returns `403` to automated
fetches**, which is itself consistent with a publisher that does not intend systematic machine
collection. The wording above is from the IMF's published Copyright and Usage terms as indexed;
**a person must open that page and read it before anyone relies on my summary of it.**

**Three honest options, and none of them is "proceed quietly":**

| Option | What it costs | What it gives |
|---|---|---|
| **A — Ask the IMF** | An email, and waiting. PortWatch is a public-policy platform built with Oxford, the World Bank and the WTO; a research/internal-analysis request is an ordinary one | The multi-year history, cleanly, with the permission recorded on the source contract as evidence |
| **B — Stay in replay** | The corridor forecast is built on ~2 months and **cannot meet T1/T2** | Zero licence risk; the capability is not really delivered |
| **C — Bounded non-systematic use** | Judgement call on where "non-systematic" ends | A middle path I do **not** recommend: the line is exactly the kind of thing that should not rest on our own reading of someone else's terms |

**My recommendation is A**, started now, because it is the long pole and it is free. **B is the
correct posture until A returns** — which is what Phase 1 already does, and it should not be relaxed
because Phase 4 wants more data.

**This is a licensing decision and it is yours.** It is the one thing in this plan I am not willing
to decide by inference.

### UN Comtrade (S7) — unchanged, and untouched

Attribution required; **redistribution restrictions apply**; recorded `UNVERIFIED — read the full
policy before any redistribution claim`. Not probed and not activated: doing either would mean
using the held credential. Internal analysis is the intended use and no redistribution is
contemplated, but the policy must be read before any output derived from it leaves the platform.

## 7. Optional paid source — capped, and not purchased

**No purchase or subscription will be made without your explicit approval.** One candidate is worth
naming so the option is costed rather than discovered later:

| Candidate | What it would add | Indicative cost |
|---|---|---|
| A commercial AIS or container-freight-rate feed (e.g. a vessel-position or freight-index API) | Vessel-level positions and freight rates — the two signals PortWatch's *derived* counts cannot give: it is a model over AIS, not a primary observation of our shipments | Entry tiers commonly **€100–500/month**; a bounded evaluation would sit inside the **€500 cap** |

**Recommendation: do not buy anything for Phase 4 — and §3a strengthened that considerably.** The
free source holds 7.7 years of exactly the signal the corridor decision turns on. The binding
constraint is **permission, not availability**, and no amount of money fixes a licence question
about a different publisher's data.

Build on free sources, get real T1/T2 numbers, and let those numbers say whether a paid signal would
improve them. Buying before the baseline exists means never knowing what the money bought. If the
backtests later show the free signal is the binding constraint, I will come back with the measured
gap and a specific proposal — **and still purchase nothing without your approval.**

## 8. APIs, UI and model approach

**Data model.** Forward migrations **starting at `0028`** — the correction passes on Phase 3 took
`0025`–`0027` — in the shape of `0022`–`0024`: forecast events +
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
| **P4-M0a** | **Bounded backfill mode** on the existing REST poller (§4a): closed-range traversal, deterministic ordering, idempotent re-run, checkpointed inside the existing request budget | 3–4 days *(not gated — build it regardless)* |
| **P4-M0b** | Activate **ECB** (terms settled, §6) and backfill it; add source attribution to the UI | 1–2 days |
| **P4-M0c** | **PortWatch backfill** — 7.7 years, 3 corridor chokepoints | **gated on your §6 decision, not on engineering** |
| **P4-M1** | Migration `0028`+ (the next unused number), forecast/scenario/warning/outcome objects, upgrade check extended by one line | 4–5 days |
| **P4-M2** | Baselines (seasonal naïve, ETS/ARIMA), the forecasting service, known-at-respecting feature assembly | 5–6 days |
| **P4-M3** | Scenario trees, indicators, threshold breach and branch flip | 4–5 days |
| **P4-M4** | Early warning: response windows, routing, acknowledgement | 3–4 days |
| **P4-M5** | Outcome ledger and calibration: coverage, pinball loss, the honest empty state | 4–5 days |
| **P4-M6** | Forecasts, Scenarios, Warnings and Calibration UI | 5–6 days |
| **P4-M7** | Act IV demonstration, D1–D8 acceptance, Phase 4 report | 3–4 days |

**Realistic duration: 5–6 weeks** of engineering, of which the backfill connector work (P4-M0a) is
3–4 days and is **not** blocked by anything.

**The critical path is not code — it is the PortWatch permission question in §6.** If the answer is
A and it takes three weeks to come back, that is three weeks in which every other milestone can
proceed and the forecaster is trained on ECB plus the existing replay. If the answer is B, Phase 4
still delivers the *machinery* — forecast objects, scenarios, warnings, propagation into the
Strategy Graph — and honestly reports that **T1 and T2 are unmet and no forecast is shown to an
operator.** That is a real and defensible outcome. It is not the one worth aiming for.

## 12. Decisions I need from you

Two of the four are now answered by reading the sources. Two remain, and the first is the whole
critical path.

1. **PortWatch — systematic collection.** *(Was: "read the reuse terms." Now: a decision.)* The
   dataset's licence points at the IMF general terms, which **require permission for systematic
   downloading**. A 7.7-year backfill is systematic. **Recommendation: option A — ask the IMF, start
   now, stay in replay until it returns.** I will not proceed on my own reading of someone else's
   terms.
2. **ECB — settled.** Free reuse conditional on quoting the source and not modifying the statistics.
   Both are things we already do or can do cheaply. **Recommendation: activate.** No decision needed
   unless you disagree.
3. **UN Comtrade** — activate the held free-tier key, or leave it untouched? **Recommendation: leave
   it** until the corridor signal shows a demand covariate is actually needed. Untouched either way
   until you say otherwise.
4. **Paid sources** — **recommendation: buy nothing.** §3a removed the argument for buying: the free
   source has 7.7 years of the exact signal, and the constraint is permission, not availability.
   Money would not fix a licence question. Nothing will be purchased without your explicit approval.

## 13. What changed in this revision

| Was | Now |
|---|---|
| "The replay sets are two orders of magnitude too short" — with no check of what the publisher holds | **Measured: PortWatch holds 7.7 years, 78,372 rows, 2019-01-01 → 2026-08-30.** The depth requirement is satisfiable |
| "Beat seasonal naïve" — no threshold | **T1–T4 in §2a**, with explicit numbers and a stated consequence for missing them |
| "Run the existing poller over more history" | **§4a**: the poller has no closed-range mode, ArcGIS pagination is undefined without explicit ordering, and a full backfill exceeds the contract's request budget — 3–4 days of real work |
| Both licences `UNVERIFIED`, "someone should read them" | **Both read.** ECB is settled and permissive. PortWatch points at the IMF general terms, which restrict systematic downloading — **which is what a backfill is** |
| PortWatch recommended first | **ECB promoted to first**; PortWatch gated on a permission question that is yours, not mine |


## 14. Decisions recorded — 2026-09-05

The owner settled the four §12 decisions as follows. Implementation proceeds on this basis.

| # | Decision | Effect on the work |
|---|---|---|
| **1** | **PortWatch:** pursue permission; retain the existing replay posture until collection rights are resolved. The permission request is prepared for the owner to send ([PHASE4_PORTWATCH_PERMISSION_REQUEST.md](PHASE4_PORTWATCH_PERMISSION_REQUEST.md)). | S1/S2 stay `replay` with `rights_state: pending`. Nothing is collected from the IMF. The backfill mode is built and tested against a transport double for the ArcGIS strategy, so it is ready the day permission arrives. **This does not block any other milestone.** |
| **2** | **ECB:** activate and backfill through the governed connector, preserving original evidence and attribution. | A `v2` contract for `ecb-eurusd`: `live`, `rights_state: confirmed` with the ESCB reuse policy recorded as evidence, the backfill declared in the contract, and "Source: ECB statistics." carried wherever a rate is shown or exported. |
| **3** | **UN Comtrade:** defer activation; leave the existing key untouched. | Not read, not bound, not activated. |
| **4** | **Paid sources:** buy nothing. | No purchase, no subscription, no evaluation account. |

**Migration numbering.** Phase 4 starts at the next unused number, `0028`, because the bounded
correction passes on Phase 3 took `0025`–`0027`.
