# Phase 1 — Source & Data Manifest

> **Status: proposal for owner review. Nothing here is registered, collected, or purchased.**
> Supplements [PHASE1_PLAN.md](../../PHASE1_PLAN.md) Revision 5 and
> [L1_CONNECTOR_COVERAGE.md](../../L1_CONNECTOR_COVERAGE.md), both binding. Cohort 1 remains
> exactly three connectors: **file upload (PDF/DOCX/CSV)**, **RSS/Atom**, **generic governed REST
> polling**. No scraping, no crawler, no fourth connector type.

Every endpoint, licence, key requirement and quota below was checked against the publisher's own
documentation or a live response on **2026-09-02**. Where a fact could not be verified from primary
documentation it is marked `UNVERIFIED — confirm at registration` rather than asserted.

---

## 0. Selection rules applied

1. **Free and no-key first.** A source that needs a credential enters as *replay evidence*, never as
   a live keyed connector, unless the owner separately approves the registration.
2. **Authority is declared, not assumed.** Each source is classed `authoritative` or
   `observational`. An observational source may never be presented as factual authority — this is a
   registration-time contract field, enforced by §7 of the plan, not a UI convention.
3. **No commercial AIS.** PortWatch already publishes derived vessel-transit counts from an
   authoritative publisher. A paid AIS feed buys resolution the Phase 1 demonstration does not use.
4. **Streaming is out of cohort 1 architecturally**, not merely by budget: L1_CONNECTOR_COVERAGE
   places IoT/streaming at cohort 4+, and Phase 1 has no event-streaming component.

---

## 1. Portfolio at a glance

| # | Source | Class | Connector | Key? | Cost | Phase 1 role |
|---|---|---|---|---|---|---|
| S1 | IMF PortWatch — Daily Chokepoints | authoritative | REST poller | no | €0 | **Primary corridor signal** |
| S2 | IMF PortWatch — Daily Ports | authoritative | REST poller | no | €0 | Port-level context (Rotterdam, Ningbo) |
| S3 | EU Financial Sanctions (FSF) — RSS | authoritative | RSS/Atom | no | €0 | **Change notification**; correction/withdrawal demo |
| S4 | EU Financial Sanctions (FSF) — CSV/XML | authoritative | REST poller | no¹ | €0 | Payload behind S3 |
| S5 | ECB Data Portal — EUR/USD reference rate | authoritative | REST poller | no | €0 | Cost exposure series |
| S6 | World Bank Indicators | authoritative | REST poller | no | €0 | Structural trade context |
| S7 | UN Comtrade | authoritative | **upload (replay)** | yes² | €0 | Component trade baseline |
| S8 | GDELT DOC 2.0 | **observational only** | REST poller | no | €0 | Discovery signal — never authority |
| S9 | Synthetic company records | internal synthetic | upload | no | €0 | ERP/shipment/inventory facts |
| S10 | Carrier & port advisories (PDF) | authoritative (publisher) | upload | no | €0 | Operator-supplied evidence |

¹ The FSF download URLs carry a **published** `token=dG9rZW4tMjAxNw` query parameter (base64 of
`token-2017`). It is printed in the EU Open Data Portal distribution metadata and in the public RSS
feed. **It is not a secret and must not be stored as one.** It is a URL query parameter, so §8.1's
URL-query redaction applies to it in logs, events and audit metadata.

² Free tier, but registration + subscription key is mandatory. See §S7.

---

## 2. Source records

### S1 — IMF PortWatch, Daily Chokepoints Data ★ primary

| Field | Value |
|---|---|
| **Publisher** | International Monetary Fund, with the Environmental Change Institute (University of Oxford). Developed with ESRI, UN Global Platform, World Bank, WTO. |
| **Endpoint** | `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query` |
| **Discovery** | `https://portwatch.imf.org/api/search/v1/collections/dataset/items` (ArcGIS Hub dataset index) |
| **Authority** | **Authoritative** for *derived daily vessel-transit counts and cargo capacity at 28 maritime chokepoints*. It is **not** authoritative for vessel identity, ownership, cargo contents, or the cause of a change. It is a modelled derivation from satellite AIS, not a primary observation of our shipments. |
| **Connector** | Generic governed REST poller (JSON over HTTPS) |
| **Licence / permitted use** | ArcGIS Hub item licence recorded as `custom`; IMF PortWatch is published for public policy use. **`UNVERIFIED — confirm exact reuse terms at registration`**; the source contract records `rights_state: pending_confirmation` and the connector stays in `draft` until resolved. Replay fallback is unaffected. |
| **Access / registration** | None. Anonymous HTTPS. |
| **API key** | **No** |
| **Cost** | €0 |
| **Quotas / rate limits** | `maxRecordCount: 1000` per query; `capabilities: Query` (read-only). No published request-rate limit — **`UNVERIFIED`**; we self-limit to the §8.1 budgets and the 60 s scheduler floor. Planned cadence 6 h, far below any plausible limit. |
| **Cadence / freshness** | Daily rows; observed publication lag ≈ 7–10 days behind real time (on 2026-09-02 the latest row was `2026-08-23`). **This lag is the point of the freshness indicator, not a defect to hide.** |
| **Schema** | `date` (DateOnly), `year`, `month`, `day`, `portid`, `portname`, `n_container`, `n_dry_bulk`, `n_general_cargo`, `n_roro`, `n_tanker`, `n_cargo`, `n_total`, `capacity_*` (6 fields), `capacity`, `ObjectId` |
| **Sample payload** | `{"date":"2024-01-14","portid":"chokepoint4","portname":"Bab el-Mandeb Strait","n_total":27,"n_container":2,"capacity":826735}` — captured live 2026-09-02 |
| **Corrections channel** | No published corrections feed. Revisions arrive as changed values for an existing `date`+`portid`. Our detection is digest comparison against the prior admitted EVD for the same key — recorded as a **supersession**, not a silent overwrite. **`UNVERIFIED — no publisher corrections policy located`**; recorded as a known limitation on the contract. |
| **Retention constraints** | None imposed by publisher. Our retention follows the source contract. |
| **Availability risk** | Single ArcGIS tenancy; a service rename would break the pinned URL. Mitigated by the frozen replay set. |
| **Replay fallback** | `S1-replay` — full daily series for `chokepoint1` (Suez), `chokepoint4` (Bab el-Mandeb), `chokepoint7` (Cape of Good Hope), 2023-12-01 → 2024-01-31, captured once and frozen. |
| **Fields used by the demo** | `date`, `portid`, `portname`, `n_total`, `n_container`, `capacity` |

### S2 — IMF PortWatch, Daily Ports Data

Same publisher, licence, access and risk profile as S1.
**Endpoint** `…/services/Daily_Ports_Data/FeatureServer` · **Authority** authoritative for derived
daily port call counts/capacity · **Use** Rotterdam and Ningbo-Zhoushan context ·
**Replay fallback** `S2-replay`, same window.

### S3 — EU Consolidated Financial Sanctions, RSS ★ correction demo

| Field | Value |
|---|---|
| **Publisher** | European Commission, DG FISMA (Financial Stability, Financial Services and Capital Markets Union) |
| **Endpoint** | `https://webgate.ec.europa.eu/fsd/fsf/public/rss` |
| **Authority** | **Authoritative** for *which consolidated-list files the Commission currently publishes and when each was last regenerated*. It is **not** authoritative for whether a specific party is sanctioned — that requires the file itself (S4) and legal interpretation nobody in Phase 1 performs. |
| **Connector** | RSS/Atom (§10.1 transport framing only) |
| **Licence** | Distribution metadata records `COM_REUSE` (Commission reuse decision 2011/833/EU) and `CC_BYND_4_0` on one distribution. Attribution required; the ND distribution is not modified — we preserve bytes verbatim, which is all Phase 1 does anyway. |
| **Access / key / cost** | Anonymous · no key · €0 |
| **Quotas** | None published — **`UNVERIFIED`**; self-limited. Cadence 6 h. |
| **Cadence / freshness** | Irregular, event-driven. Live sample 2026-09-02: 5 items, latest `Wed, 05 Aug 2026 14:50:13 GMT`. `pubDate` is a genuine freshness signal. |
| **Sample item** | `<title>CSV - v1.1</title><pubDate>Wed, 05 Aug 2026 14:50:12 GMT</pubDate><link>https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw</link>` |
| **Corrections channel** | The feed **is** the corrections channel: a regenerated file republishes with a new `pubDate`. This is why it anchors the correction/withdrawal demonstration. |
| **Availability risk** | Low; long-lived EU endpoint. |
| **Replay fallback** | `S3-replay` — captured feed states before and after a republication. |
| **Fields used** | `title`, `pubDate`, `link`, `guid` |

### S4 — EU Consolidated Financial Sanctions, CSV/XML payload

**Endpoints** `…/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw` (CSV)
and `…/xmlFullSanctionsList_1_1/content?token=…` (XML) ·
**Connector** REST poller · **Authority** authoritative for the consolidated list contents ·
**Licence** as S3 · **Key** none (the token is published — see footnote 1) ·
**Note** ~ multi-MB; §8.1 response-byte limits apply and the contract declares the ceiling.

### S5 — ECB Data Portal, euro foreign-exchange reference rates

| Field | Value |
|---|---|
| **Publisher** | European Central Bank |
| **Endpoint** | `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=…&format=jsondata` |
| **Authority** | **Authoritative** for the ECB euro reference rate. Not authoritative for tradeable/market rates. |
| **Connector** | REST poller (SDMX-JSON) |
| **Licence** | ECB reuse policy, attribution required. **`UNVERIFIED — confirm exact notice at registration`** |
| **Key / cost** | No key · €0 |
| **Cadence** | Working days ~16:00 CET |
| **Verified** | Live 200 on 2026-09-02, `content-type: application/vnd.sdmx.data+json;version=1.0.0-wd` |
| **Corrections** | ECB republishes revised series; detected by digest comparison → supersession |
| **Replay fallback** | `S5-replay` — daily EUR/USD across the window |
| **Fields used** | Observation date, rate value |

### S6 — World Bank Indicators API

| Field | Value |
|---|---|
| **Publisher** | The World Bank Group |
| **Endpoint** | `https://api.worldbank.org/v2/country/{iso3}/indicator/{code}?format=json` |
| **Authority** | Authoritative for World Bank's own published indicator values. Annual, structural — **not** a corridor signal. |
| **Connector** | REST poller |
| **Licence** | **CC-BY 4.0** (verified on the World Bank Data Catalog licensing page, 2026-09-02). Attribution required. |
| **Key / cost** | No key · €0 |
| **Quotas** | Not published — **`UNVERIFIED`**; self-limited. Cadence: weekly is ample for annual data. |
| **Freshness** | Response carries `lastupdated` (observed `2026-07-13`) — used directly as the freshness signal. |
| **Sample** | `NE.IMP.GNFS.ZS` for `DEU` returned `{"page":1,"total":66,"lastupdated":"2026-07-13",…}` |
| **Replay fallback** | `S6-replay` |

### S7 — UN Comtrade ⚠ credential required

| Field | Value |
|---|---|
| **Publisher** | United Nations Statistics Division |
| **Endpoint** | `https://comtradeapi.un.org/data/v1/get/{typeCode}/{freqCode}/{clCode}` |
| **Authority** | Authoritative for reported international merchandise trade statistics. |
| **Access** | **Account required, and an API subscription key required even on the free tier** (verified on the UN Comtrade Help Center, 2026-09-02). Free "Basic Individual": registration free, **500 API calls/day**, 100 000 records per call. |
| **Phase 1 decision** | **Enters as uploaded replay evidence (S7-replay), not as a live connector.** This follows the packet rule that a source needing a credential does not become a keyed connector without separate owner approval, and the instruction to default to no-key sources. |
| **Credential-free fallback** | The UI bulk export the owner can download once, uploaded through the file-upload connector as ordinary evidence with full custody. |
| **If later approved** | Secret name `EYE_SRC_COMTRADE_KEY`, scope: single source contract, header-only. Not created now. |
| **Licence** | UN Comtrade policy on use and re-dissemination — attribution required; redistribution restrictions apply. **`UNVERIFIED — read the full policy before any redistribution claim`** |

### S8 — GDELT DOC 2.0 ⚠ observational only

| Field | Value |
|---|---|
| **Publisher** | The GDELT Project |
| **Endpoint** | `https://api.gdeltproject.org/api/v2/doc/doc?query=…&mode=artlist&format=json` |
| **Authority** | **Observational only. Never a factual authority, in any phase.** GDELT indexes what outlets published; it does not establish that anything happened. |
| **Evidence for that classification** | A live query for `"Bab el-Mandeb"` on 2026-09-02 returned, as its first result, an article from `zerohedge.com`. The connector cannot tell a wire service from a blog, so the contract must carry the limitation rather than the operator being expected to remember it. |
| **Contract enforcement** | `authority_class: observational`, `permitted_use: discovery_only`, and a UI treatment that never renders a GDELT item beside authoritative evidence without the classification visible. |
| **Connector / key / cost** | REST poller · no key · €0 |
| **Quotas** | Not formally published — **`UNVERIFIED`**; GDELT asks for reasonable use. Cadence 6 h, narrow query. |
| **Recommendation** | **Include, in the live overlay only, clearly marked.** It earns its place by demonstrating that the system can hold a low-authority source *without* letting it contaminate the record — which is a governance capability worth showing. |
| **Replay fallback** | `S8-replay` — one captured result set, marked observational |

### S9 — Synthetic company records

Publisher: this project. Every record marked `synthetic: true` with `SYN-` identifiers.
CSV/PDF/DOCX through the file-upload connector. €0, no key.
See [SYNTHETIC_COMPANY_SPEC.md](SYNTHETIC_COMPANY_SPEC.md).

### S10 — Carrier and port advisories (operator upload)

Real published advisories (carrier service updates, port authority notices) that have **no REST or
RSS interface we are entitled to poll**. Per the rule, these enter as **uploaded replay evidence**
with the publisher, retrieval URL and retrieval time recorded as custody metadata. No scraping.

---

## 3. Explicitly excluded for Phase 1

| Candidate | Why excluded |
|---|---|
| Commercial AIS (Spire, MarineTraffic, Kpler…) | Paid; PortWatch already supplies the corridor signal at the resolution used. |
| **AISStream.io** | Free but **key-required**, and WebSocket streaming — cohort 4+ architecturally (no event-streaming component in Phase 1). May be revisited later as a non-authoritative overlay. |
| Suez Canal Authority direct | No documented open REST/RSS. Would require scraping — prohibited. Enters as S10 upload if needed. |
| Lloyd's List / TradeWinds | Paid licence. |
| Any LLM provider | **Phase 1 needs no LLM key.** Semantic extraction is Phase 2. |

---

## 4. Replay / live ratio — exact measurement

**Definition.** For a demonstration run `R`, over all EVD objects admitted during `R`:

```
replay_share_by_object = count(EVD where acquisition_mode = 'replay') / count(EVD)
replay_share_by_bytes  = sum(bytes  where acquisition_mode = 'replay') / sum(bytes)
```

**How it is computed.** `acquisition_mode ∈ {replay, live}` is a **required field on the source
contract**, stamped onto every `run.started` event and copied onto each admitted EVD. The ratio is
therefore derived from the stored observation event log — not from configuration, and not from an
unstored `now`. It is recomputed by replaying the event stream and must reproduce identically
(consistent with §6's deterministic-replay requirement).

**Both figures are reported.** By-object is the headline; by-bytes is reported alongside because one
multi-MB sanctions file can dominate bytes while being a single object. Neither is presented alone.

**Targets.**

| Measure | Target | Hard rule |
|---|---|---|
| `replay_share_by_object` | **85–90 %** | The deterministic demonstration path is **100 % replay**. |
| Live overlay | 10–15 % | Additive only. |

**The rule that makes this honest:** the scripted demonstration must produce byte-identical evidence
with the network disconnected. The live overlay may add objects; it may never change, replace or
reorder a replay object. If the overlay is unavailable, the demonstration still passes — a live
source being down is a *freshness observation to display*, not a demo failure.

---

## 5. Frozen replay capture procedure

1. Capture each `S*-replay` set once, over the frozen window, using the same connector code.
2. Store under `fixtures/phase1/replay/<source-id>/` with a `MANIFEST.json` recording, per file:
   retrieval URL, retrieval instant, HTTP status, response headers retained, SHA-256, byte length.
3. The manifest digest is committed. A replay file that does not match its digest fails closed.
4. Replay is served by a local fixture responder honouring the same contract, so the connector under
   test is the connector that ships.

**Capture is not authorized by this packet.** It happens after approval, as P1-M2 work.
