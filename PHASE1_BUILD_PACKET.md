# THE EYE — Phase 1 Build Packet

> **⚠️ STATUS SUPERSEDED.** The line below is the packet's original status and is kept as the
> historical record. What actually happened: the packet was **approved and merged** (PR #26,
> `a792cd9a`, 2026-09-02T09:27:18Z); **Phase 1 implementation began** in PR #28 on
> 2026-09-02T12:08:08Z; and Phase 1 is now **paused, with PR #28 unmerged and frozen, pending
> formal Phase 0 closure**. Approval of this packet was Phase 1 scope approval and is **not**
> independent Phase 0 acceptance — see
> [PHASE0_ACCEPTANCE_RECONCILIATION.md](PHASE0_ACCEPTANCE_RECONCILIATION.md) §6.
>
> **Status: awaiting one consolidated owner review.** Documentation only. No migration, no
> dependency, no workflow change, no application code has been written, and none will be until
> `APPROVED: PHASE 1 BUILD PACKET AND IMPLEMENTATION`.
>
> **Branch** `phase1-build-packet`, cut from main at **`e35996483a6b827603e04cac4d52101d27ca5269`**
> — the commit at which Phase 0 closed.
>
> **CORRECTED.** `e3599648` is the commit at which the C19 implementation was completed and
> published. It is **not** a commit at which Phase 0 was independently accepted: no pull request in
> this repository has been reviewed by a second party. See
> [PHASE0_ACCEPTANCE_RECONCILIATION.md](PHASE0_ACCEPTANCE_RECONCILIATION.md) §2 and §6. Approval or
> merging of this packet is Phase 1 scope approval and is **not** Phase 0 acceptance.

---

## 0. What this packet is, and what it is not

It **supplements** two binding documents and overrides neither:

* [PHASE1_PLAN.md](PHASE1_PLAN.md) — Revision 5. Its §13 acceptance matrix (A1–A13) and its §5.13
  fault-injection list (F01–F46) are the **maximum** Phase 1 gate.
* [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md) — the honest-scope register.

It **does not**: redesign Phase 0 · reopen C1–C19 · introduce another security phase · add testing
infrastructure · create a second acceptance matrix · expand cohort 1 beyond **file upload
(PDF/DOCX/CSV)**, **RSS/Atom**, and **generic governed REST polling**.

New ordinary findings during Phase 1 go to the post-phase backlog unless they demonstrate a present
constitutional violation.

### Documents

| Document | Contents |
|---|---|
| **This packet** | The flagship demonstration, decisions, and how the parts fit |
| [Source & Data Manifest](docs/phase1/SOURCE_DATA_MANIFEST.md) | Ten sources, each fully documented; replay/live ratio definition |
| [Credentials & Budget Matrix](docs/phase1/CREDENTIALS_BUDGET_MATRIX.md) | Credentials, subscriptions, €500 ceiling ledger |
| [Synthetic Company Spec](docs/phase1/SYNTHETIC_COMPANY_SPEC.md) | NORDWERK — every fact synthetic and marked |
| [Replay Data Manifest](docs/phase1/REPLAY_DATA_MANIFEST.md) | Frozen window, replay sets, ten planted defects |
| [UX Screen Map](docs/phase1/UX_SCREEN_MAP.md) | Screens, wireframes, journeys, accessibility, RTL |
| [Demo Storyboard](docs/phase1/DEMO_STORYBOARD.md) | The 12-minute script |
| [Milestone & Acceptance Mapping](docs/phase1/MILESTONE_ACCEPTANCE_MAPPING.md) | P1-M1…M7, time budget, owner decisions |
| [Capability Preservation Map](docs/phase1/CAPABILITY_PRESERVATION_MAP.md) | Where Phases 2–7 capabilities enter |

---

## 1. The flagship demonstration — locked

### **The 72-Hour Corridor Decision**

A European drive-unit manufacturer single-sources rare-earth rotor magnets from Ningbo. They travel
by sea through **Bab el-Mandeb** and **Suez** to Rotterdam — 42 days door to door.

Over 72 hours in January 2024, daily transits through Bab el-Mandeb fall from **55 to 27**, cargo
capacity drops **60 %**, and traffic around the **Cape of Good Hope** rises as ships reroute. One
shipment is approaching the strait. Another is a week behind. A third has not been booked.

The decision closing is not the ship at sea — it is whether to book the third shipment the long way
round, at €1 850 a container, before that option stops being available.

**Why this, and why it is a governance story.** The operator will later have to defend the decision:
which evidence did we hold, when, from whom, was the source entitled to be believed, and did anything
we relied on get corrected afterwards. Phase 1 is the layer that answers those questions — and it is
worth nothing if it cannot.

### What Phase 1 actually demonstrates

Only this, and it is stated plainly in the script:

1. Source registration and approval (registrar ≠ approver)
2. Governed acquisition under contract
3. Preservation of original evidence with full chain of custody
4. Quarantine
5. Source freshness, health and coverage — including honest `unknown`
6. Correction and withdrawal handling
7. The Observation Operations interface

**Not demonstrated, not stubbed, not hinted at:** semantic extraction, knowledge graph, digital
twins, predictions, simulations, recommendations, autonomous decisions. Those extend the *same*
demonstration in Phases 2–7 — mapped in the
[Capability Preservation Map](docs/phase1/CAPABILITY_PRESERVATION_MAP.md).

### Real vs. synthetic

| Real, verified live on 2026-09-02 | Synthetic, marked `SYN-` |
|---|---|
| IMF PortWatch transit and capacity figures | NORDWERK, its plants, suppliers, shipments, inventory, costs |
| EU sanctions RSS feed and its republication behaviour | The operator personas and the decision itself |
| ECB and World Bank series | |

Never blurred, and marked at object level in the UI. A system whose purpose is provenance cannot be
casual about which of its own facts are invented.

---

## 2. Data strategy

| Element | Decision |
|---|---|
| Frozen replay | **85–90 %** by object count; the deterministic path is **100 % replay** |
| Live overlay | 10–15 %, **additive only** |
| Synthetic internal data | NORDWERK, every record marked |
| Source preference | Free, authoritative, legally collectible first |
| Connector budget | **€500 ceiling — €0 planned, €0 committed** |

**Replay/live ratio, measured exactly.** `acquisition_mode ∈ {replay, live}` is a required source-
contract field, stamped onto every `run.started` and copied to each admitted EVD. Then:

```
replay_share_by_object = count(EVD where acquisition_mode='replay') / count(EVD)
replay_share_by_bytes  = sum(bytes where acquisition_mode='replay') / sum(bytes)
```

Derived from the stored event log — not from configuration, and never from an unstored `now`.
Recomputing it by replaying the stream must reproduce the same value. **Both figures are reported**:
by-object is the headline; by-bytes is shown beside it because one 9 MB sanctions file would
otherwise dominate and flatter the number.

Projected: **≈ 88.4 % by object**, ≈ 97 % by bytes.

**The rule that keeps it honest:** the scripted demonstration produces byte-identical evidence with
the network disconnected. A live source being unavailable is a freshness observation to display —
not a demo failure.

---

## 3. Source portfolio

Ten sources, all free, **zero credentials required**. Full records in the
[Source & Data Manifest](docs/phase1/SOURCE_DATA_MANIFEST.md).

| # | Source | Authority | Connector | Key | Role |
|---|---|---|---|---|---|
| S1 | IMF PortWatch — Chokepoints | authoritative | REST | no | **primary corridor signal** |
| S2 | IMF PortWatch — Ports | authoritative | REST | no | port context |
| S3 | EU Financial Sanctions — RSS | authoritative | RSS | no | **change notification / correction demo** |
| S4 | EU Financial Sanctions — CSV/XML | authoritative | REST | no¹ | payload |
| S5 | ECB EUR/USD reference rate | authoritative | REST | no | cost exposure |
| S6 | World Bank Indicators | authoritative | REST | no | structural context |
| S7 | UN Comtrade | authoritative | **upload (replay)** | **key required** | trade baseline |
| S8 | GDELT DOC 2.0 | **observational only** | REST | no | discovery, never authority |
| S9 | Synthetic company records | internal synthetic | upload | no | ERP/shipment facts |
| S10 | Carrier & port advisories | authoritative (publisher) | upload | no | operator evidence |

¹ The FSF URL carries a **published** `token=dG9rZW4tMjAxNw` parameter, printed in the EU Open Data
Portal metadata and in the public feed. It is **not a secret**, is never stored as one, and §8.1's
URL-query redaction covers it in logs.

**Three findings worth the owner's attention.**

* **UN Comtrade requires a key even on its free tier** (verified on the UN Comtrade Help Center:
  free registration, 500 API calls/day). It therefore enters as **uploaded replay evidence** rather
  than becoming the system's only credential.
* **The EU sanctions feed publishes a real RSS change-notification stream** with genuine `pubDate`
  values. It anchors the correction demonstration with a real publisher's real behaviour, not a
  simulated one.
* **GDELT's first live result for "Bab el-Mandeb" was a zerohedge.com article.** That is the
  argument for the `observational` class being enforced at admission rather than left to an
  operator's memory.

**No commercial AIS.** PortWatch already publishes the derived corridor signal at the resolution the
demonstration uses. **AISStream is excluded** — it needs a key *and* WebSocket streaming, which is
cohort 4+ architecturally, not merely a budget question.

---

## 4. The frozen window

**`2024-01-12T00:00:00Z` → `2024-01-15T00:00:00Z`.** Verified live against PortWatch on 2026-09-02:

| Date | Bab el-Mandeb transits | capacity | Suez | Cape of Good Hope |
|---|---|---|---|---|
| 2024-01-11 | 55 | 2 048 432 | 50 | 74 |
| 2024-01-12 | 35 | 1 470 236 | 36 | 83 |
| 2024-01-13 | 43 | 1 717 684 | 47 | 82 |
| 2024-01-14 | **27** | **826 735** | 49 | 52 |
| 2024-01-15 | 29 | 1 498 065 | 53 | 73 |

December 2023 mean **65** transits/day; January 2024 mean **39**. Historical and closed, so it cannot
move under the demonstration. Context band `2023-12-01 → 2024-01-31` gives the baseline.

**Ten defects are planted deliberately** in the frozen set — path traversal, schema drift, a formula
cell, a coverage gap, a supersession, an observational item contradicting an authoritative one — so
that quarantine, coverage and correction are *shown working* rather than asserted. Each is listed in
the [Replay Data Manifest](docs/phase1/REPLAY_DATA_MANIFEST.md) so no reviewer mistakes one for an
accident.

---

## 5. Product experience

Full detail in the [UX Screen Map](docs/phase1/UX_SCREEN_MAP.md). Three principles shape it:

1. **Calm by default, loud only on change.** Ambient motion would train the eye to ignore movement —
   the one thing this interface cannot afford.
2. **Provenance is not a detail view.** Source, authority class, acquisition mode and freshness ride
   at list density. Nobody should have to click to discover they are reading an observational source.
3. **Governed actions never look done before they are.** No optimistic UI on register, approve,
   correct, withdraw or download. In a provenance product, an optimistic control is a lie in the
   interface.

`unknown` is a first-class state with the same visual weight as a value — never blank, never green.
Publisher lag is displayed *distinctly from* collection failure; conflating them is how operators
learn to ignore a panel.

**The frozen end-to-end demonstration** — and the A12 Playwright journey:

```
register a source → approve it (second operator) → collect evidence →
inspect original bytes and chain of custody → view health, freshness and coverage →
inspect quarantine → submit a correction or withdrawal
```

Accessibility (keyboard, landmarks, labels, contrast, reduced motion) is an acceptance criterion, not
a polish item. RTL is **readiness** — the layout mirrors and does not break; no localisation is
claimed.

---

## 6. Delivery

Mapped onto the existing P1-M1…M7 with no new milestone.
Detail in the [Milestone & Acceptance Mapping](docs/phase1/MILESTONE_ACCEPTANCE_MAPPING.md).

| M | Product output | Build | Verify | Acceptance |
|---|---|---|---|---|
| M1 | Registry, §7 contracts, policy, migration 0013 | 2.5 d | 1.0 d | A1, A3, A11 |
| M2 | Evidence vault, quarantine, upload connector, replay capture | 3.0 d | 1.5 d | A2, A5, A7 |
| M3 | Adapter SDK, RSS, REST poller, hardening, scheduling, agents | 4.0 d | 2.0 d | A4 (F01–F46), A9, A10 |
| M4 | Coverage model, health events, sweeper | 2.5 d | 1.5 d | A6 |
| M5 | Correction & withdrawal intake | 1.5 d | 1.0 d | A8 |
| M6 | Observation Operations UI + Playwright | 4.0 d | 1.5 d | A12 |
| M7 | Acceptance extension, hostile corpus, regression, report | 0.5 d | 3.5 d | A13 |
| | **Total** | **18.0 d** | **12.0 d** | **≈ 4.0 weeks** |

Build and verification time are tracked separately — conflating them is how a phase quietly becomes
a test project. **If four weeks is threatened, optional functionality is deferred** (GDELT overlay
first, then the whole live overlay, then World Bank, ECB, port-level context) — never a gate, never
an acceptance criterion, and never a connector *type*.

---

## 7. Owner decisions

Every one has a recommendation. **Silence means the recommendation stands** — none of these needs a
reply for work to start.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Authority taxonomy | Two classes only: `authoritative` / `observational` |
| D2 | Block activation on unconfirmed rights? | **Yes** — contract stays `draft`; costs nothing because replay is unaffected |
| D3 | Replay window | **2024-01-12 → 2024-01-15**, verified |
| D4 | Planted defect set | The ten listed |
| D5 | GDELT overlay | **Include, marked observational** |
| D6 | UN Comtrade | **Replay upload, no key** |
| D7 | Freshness thresholds | PortWatch 3 d · sanctions RSS 30 d · ECB 3 d · World Bank 90 d |
| D8 | Coverage universe versioning | Version per contract; a changed denominator is a new version |
| D9 | Correction detection | Digest comparison → supersession |
| D10 | Visual direction | Calm neutral ground, one accent, semantic colour reserved for state |
| D11 | RTL | Readiness only |
| C1 | Register a free Comtrade key? | **No** |
| C2 | GDELT live overlay? | **Yes**, marked |
| C3 | Evaluate AISStream? | **No** — key *and* streaming; cohort 4+ |
| C4 | Confirm PortWatch/ECB reuse terms before go-live? | **Yes** |

### Genuinely requiring your decision

Only these three, and only if you disagree with the recommendation:

1. **C1 / D6 — UN Comtrade key.** Creating one is a free registration that accepts terms of service
   on the project's behalf. I have not done it and will not without you.
2. **C4 / D2 — rights confirmation for PortWatch and ECB.** I could not locate an unambiguous reuse
   notice for either from primary documentation. Both are marked `UNVERIFIED` and their contracts
   stay `draft`. If you would rather activate on the platform's general terms, say so.
3. **D3 — the replay window.** It fixes the demonstration's ground truth for the life of the
   project. It is verified and I recommend it, but it is the one choice that is expensive to revisit.

Nothing else here needs you. **No payment, no credential, no legal commitment is requested.**

---

## 8. Budget

| Line | Planned | Committed |
|---|---|---|
| Data sources | €0 | €0 |
| API subscriptions | €0 | €0 |
| Infrastructure | €0 | €0 (local Docker profile, EXC-P1-002) |
| LLM / model access | €0 | €0 (**Phase 1 requires no LLM key**) |
| **Total against the €500 ceiling** | **€0** | **€0** |

The ceiling is not authorization. Work stops for explicit approval before any payment, or any
registration creating a contractual obligation. This packet reaches neither.

---

## 9. Scope honesty

Phase 1 is **cohort 1 of 20 constitutional source classes** — 1 substantially covered, 4 partially,
15 not implemented. The ten sources above are *instances* of the three permitted connector types, not
new types. **C-013 architectural extensibility remains designed-for but not demonstrated**: proving
it needs fixtures across streaming/IoT, enterprise integration, licensed market data and geospatial
classes, none of which exist yet. Ten sources across three connector types is not that evidence, and
this packet does not claim it is.

Three things Phase 1 could fake and will not: a world-warning banner, a dependency graph drawn from
synthetic data, and a "recommended action" panel. The corridor story has an obvious answer;
presenting it would skip Phases 2–6 and every guarantee they add. **The demonstration ends where the
evidence ends, and that ending is the product.**

---

**Awaiting `APPROVED: PHASE 1 BUILD PACKET AND IMPLEMENTATION`.**
No migrations, dependencies, workflow changes or application code until then.
