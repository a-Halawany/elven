# The 72-Hour Corridor Decision — Storyboard & Script

> The locked lighthouse demonstration. This document defines the full storyline **and** states
> precisely what Phase 1 shows — which is the evidence layer, and nothing above it.

---

## 1. The story

A European drive-unit manufacturer, **NORDWERK ANTRIEBSTECHNIK GmbH** *(synthetic)*, single-sources
its rare-earth rotor magnets from Ningbo. They travel by sea through Bab el-Mandeb and Suez to
Rotterdam: 42 days door to door.

Over 72 hours in January 2024, transits through Bab el-Mandeb fall from 55 a day to 27 — a 60 % fall
in cargo capacity — while traffic around the Cape of Good Hope rises. One NORDWERK shipment is
approaching the strait. Another is a week behind it. A third has not been booked.

The decision closing is not about the ship at sea. It is whether to book the *third* shipment the
long way round, at €1 850 a container, before the option stops being available.

**What makes this a governance story rather than a logistics one:** the operator will later have to
defend the decision. Which evidence did we hold? When did we hold it? Was the source entitled to be
believed? Did anything we relied on get corrected afterwards? Phase 1 is the layer that can answer
those questions — and it is worth nothing if it cannot.

---

## 2. Honest phase boundaries

| Phase | What the corridor demonstration gains |
|---|---|
| **1 — Observation (this phase)** | Sources registered under contract and approved by a second person. Corridor evidence collected, original bytes preserved with full custody. Bad inputs quarantined. Freshness, coverage and authenticity visible — including where they are *unknown*. A publisher correction handled and superseded without overwriting history. |
| 2 — Intelligence | Extraction turns those bytes into claims: "transits at chokepoint4 fell 51 % over 72h", each with method, model version, confidence and truth state, and a human review queue for low confidence. |
| 3 — Memory + Knowledge Graph | Entity resolution links chokepoint4, the route, the supplier and the component into one governed graph. Invalidating "the corridor is open" surfaces the objectives that assumed it. |
| 4 — Prediction + Scenarios | Forecasts across the canonical horizons with drivers and assumptions; a scenario tree whose branch flips when a transit-count indicator breaches threshold; an early warning routed to a named owner. |
| 5 — Digital Twins + Simulation | A twin of the Ningbo→Regensburg chain, grounded in that evidence. Reroute vs. air vs. draw-down simulated reproducibly, outputs marked synthetic. |
| 6 — Decision Intelligence | A decision package: options, consequences linked to simulations, uncertainty, dissent, approvers, monitoring conditions — and Decision Replay reconstructing what was known at the time, without hindsight. |
| 7 — Agents + Governed Learning | A monitoring agent watching the indicator inside budget, stopping and escalating at its limit; threshold changes shipped only through an approved release. |

**Phase 1 demonstrates the first row only.** No extraction, no graph, no twin, no forecast, no
recommendation, no autonomy — not stubbed, not mocked, not hinted at in the UI.

---

## 3. What is real and what is fiction

| Real | Synthetic |
|---|---|
| IMF PortWatch transit and capacity figures (captured live 2026-09-02) | NORDWERK, its plants, suppliers, shipments, inventory, costs |
| EU sanctions RSS feed and its republication behaviour | The operator personas |
| ECB and World Bank series | The decision itself |
| The January 2024 corridor collapse | |

Never blurred, and marked in the UI at object level.

---

## 4. Script — 12 minutes

### Act I · A source is not trusted because it is convenient (0:00–3:00)

**0:00** Overview. Nine sources, seven active, one degraded, one draft.
> "Everything here arrived under a contract that someone approved. Let me show you what registering
> a source actually costs."

**0:30** Register `IMF PortWatch — Chokepoints`. Step ② dwell:
> "Authoritative or observational — and this is enforced at admission, not a label in the UI. Rights
> state is *pending confirmation*: I have read the platform description but not the exact reuse
> notice, so the contract stays draft. The system will not let me quietly skip that."

**1:30** Submit. The registrar cannot approve.
> "I registered it, so I can't approve it. That is separation of duties, and it is a rule in the
> pipeline, not a disabled button."

**2:00** Switch operator. Approve. `draft → approved → active`.

**2:40** Show the GDELT contract, `observational`.
> "This one indexes what outlets published. Its top result this morning was a financial blog. It
> stays in the system — because pretending we don't see it is worse — but it can never be presented
> as factual authority."

### Act II · Collect, and preserve exactly what arrived (3:00–6:00)

**3:00** Trigger collection. Runs appear; evidence count climbs.

**3:40** Open `EVD-7c41…`, the 14 January chokepoint row. Custody chain top to bottom: contract
version, agent identity and code digest, run, endpoint, TLS, bytes, digest verified pre-store,
post-store and again on this read.

**4:30** Four times. Then the authenticity block:
> "Four separate things, never merged. Transport: verified. Bytes: verified. Origin: allowlisted.
> Content authenticity: **unknown** — this publisher offers no signature mechanism, and TLS plus a
> digest do not prove the content is genuinely theirs. Most systems would show a green padlock here.
> We show what we actually know."

**5:20** Download. Attachment-only, sandboxed, audited before the bytes move.

**5:40** The 72-hour view: 55 → 35 → 43 → **27**, against a December mean of 65; Cape of Good Hope
rising in the same days.
> "Two authoritative series. Phase 1 does not tell you what they mean — it guarantees they are what
> arrived, from whom, and when."

### Act III · Bad input does not get in (6:00–8:00)

**6:00** Upload the synthetic bill of materials pack. Three of five admit; two quarantine.

**6:30** Quarantine queue. `DEF-02`, the DOCX with `../` in the archive:
> "Rejected before expansion, bytes kept for review, never in the evidence volume. Quarantine and
> evidence are separate storage — not separate folders."

**7:00** `DEF-04`, schema drift on a chokepoint row.
> "The contract declares the expected schema with zero drift tolerance. A missing `n_total` is
> quarantined, not admitted-and-flagged. Silent admission is how a gap becomes a fact."

**7:30** Release requires a reason and a second operator.

### Act IV · Freshness, coverage, and the honesty of *unknown* (8:00–10:00)

**8:00** Health for PortWatch. Freshness degraded at 9 days.
> "Degraded — but look at the note: the last run succeeded four hours ago and returned the same
> latest row. This is publisher lag, not a collection failure. Conflating those two is how operators
> learn to ignore a panel."

**8:50** Coverage: 60 of 62 days measured; completeness `insufficient_evidence` for the two-day gap.
> "Not 96.8 % rounded to 'healthy'. Two days are missing and the system says so. `unknown` is a
> first-class state here and it never renders green."

**9:30** Replay the health timeline from stored events — identical.
> "Deterministic. It never computes state from an unstored *now*."

### Act V · The world corrects itself (10:00–12:00)

**10:00** The EU sanctions feed republishes; `CorrectionReceived`.

**10:30** Correction case: two directly-affected objects, v2 superseded by v3.

**11:00** Propagation scope:
> "Resolved: the two objects we know about. Unresolved: downstream consumers that do not exist yet —
> the dependency graph arrives in Phase 3. We are not claiming a propagation we cannot perform."

**11:30** Known-at query reproduces the pre-correction state.
> "The old version is still retrievable. Nothing was overwritten. If you decided something on
> Tuesday using v2, we can still show you exactly what you saw on Tuesday."

**11:50** Close on Overview.
> "No extraction, no graph, no forecast, no recommendation. One layer, built so that everything
> above it can be defended. That layer is Phase 1."

---

## 5. The frozen path

| Beat | Source | Mode |
|---|---|---|
| Register / approve | S1 PortWatch | contract only |
| Collect corridor | `S1-replay`, `S2-replay` | replay |
| Custody inspection | `S1-replay` EVD 2024-01-14 | replay |
| Quarantine | `DEF-02`, `DEF-04` | replay |
| Health / coverage | `S1-replay` + `DEF-08` | replay |
| Correction | `S3-replay`, `S4-replay`, `DEF-05` | replay |
| Live overlay (optional) | S1, S3, S5, S8 today | live |

**The demonstration runs with the network disconnected.** The overlay adds a "today" column and a
live `pubDate`; if it is unavailable the panel says so and the script is unaffected — which is
itself worth showing.

---

## 6. Personas

| Persona | Role | Does |
|---|---|---|
| A. Hoffmann | Observation operator | Registers sources, uploads, inspects |
| M. Dvořák | Collection manager | Approves, releases quarantine, reviews corrections |

Two people because separation of duties is a claim the demonstration has to *show*, not assert.

---

## 7. Failure choreography

| If | Then |
|---|---|
| Live overlay unavailable | Panel: `live overlay unavailable — replay unaffected`. Continue. |
| A replay digest mismatches | **Stop.** That is the fixture integrity check working; do not narrate past it. |
| Approval appears to hang | Wait. Pending is honest; there is no optimistic state to fall back on. |
