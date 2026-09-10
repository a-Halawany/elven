# THE EYE — Source integration status (2026-09-07)

> The real-world source register: every connector the platform has, every source contract it holds,
> what each source **is** right now (live, replay, operator upload) and what stands between it and
> live collection. Verified against the code on `phase5-twins` at the closed Phase 5 head, the
> replay fixtures under `fixtures/phase1/replay`, the demonstration database, and the local
> deployment's environment **by variable name only — no secret value was read, printed or copied**.
> §1–§6 describe the register as it stood before the owner's decision of 2026-09-07; §7 records what
> that decision changed on the demonstration deployment, act by act, with receipts. No credential was
> bound, nothing was purchased, and no request went to a publisher other than the governed
> collections §7 lists and the endpoint and terms verification it names. **§9 (2026-09-10)** records
> the owner-reported IMF PortWatch permission, the governed acts performed on it, the one live run and
> its exact refusal, and what the grant text still has to settle; the PortWatch rows of §3, §4 and §6
> are brought to that state with their 2026-09-07 wording kept beside it.

## 1. Connectors the platform has

| Connector | Kind | What it does | Live-capable | Where |
|---|---|---|---|---|
| Governed REST poller | `rest` | Polls a contract's endpoints under a budget, frames items by the contract's schema, verifies bytes pre- and post-store; forward polling from a checkpoint, and since Phase 4 a **closed-range backfill** (`period-range`, deterministic windows, resumable from the checkpoint) | yes | `apps/api/src/observation/connectors/rest.connector.ts` |
| RSS/Atom | `rss` | Polls a feed; a republished guid with a new date is the publisher's correction signal | yes | `rss.connector.ts` |
| Operator upload | `upload` | Files supplied by an authenticated operator take the same framing and custody path as a polled response; never polled | not applicable | `upload.connector.ts` |
| Replay | — | The frozen fixture sets, replayed through the same connectors so that a contract in `replay` mode is exercised by the real code | — | `replay.ts`, `fixtures/phase1/replay/` |

Every connector runs only under a registered, approved, activated source contract, as a registered
agent, with the contract's host allowlist pinned at connect time, TLS verified, and every byte
digest-verified in the vault. **No connector carries a credential today**: the HTTP client can put an
`authorization` header on the wire, but nothing in the product resolves a contract's
`credential_ref` into one. `credential_ref` is validated as a *reference* (a value that looks like a
secret is refused at registration) and is `null` on every contract the platform holds.

## 2. Credentials — configured references, by name only

| Where | What is there | Finding |
|---|---|---|
| `.eye-local/env` (this deployment) | `EYE_DB_*` role passwords, `EYE_REDIS_PASSWORD`, `EYE_IDENTITY_JWT_SECRET`, `EYE_TEST_*` passwords, `EYE_DB_MIGRATE_PASSWORD` | Platform secrets only. **No source credential is configured**, and no variable named for a publisher exists. |
| Source contracts (10) | `security_and_operations.credential_ref` | `null` on all ten |
| The repository | grep for publisher key names and `EYE_SRC_*` | None. The identifiers `UN_ID`, `UN_LABEL`, `UN_CHAIN_VAR` and `UN_ATTEMPT` that a search for "UN" finds are the C18 verifier's own variable names, unrelated to any United Nations service. |
| The Phase 4 readiness plan (#36, §4) | "the UN Comtrade free-tier key already exists in secret storage, unused", to be bound as `EYE_SRC_COMTRADE_KEY` | That key is **held by the owner outside this repository and this deployment**. It is not configured here, and the decision recorded in §14 (2026-09-05) is: **defer; leave the key untouched.** This document does not change that. |

**UN services the register refers to.** One: **UN Comtrade** (United Nations Statistics Division,
the Comtrade Plus API for trade statistics), represented today by `un-comtrade-upload` — an
operator-supplied export of HS 8505 (permanent magnets) replayed from the fixtures, with no
automated access. IMF PortWatch and the World Bank Indicators API belong to the IMF and the World
Bank Group respectively (UN specialised agencies with their own terms), and are recorded under
those publishers' terms, not the UN's.

## 3. The register — what is live, what is replayed, what is blocked

Read from the demonstration database after acts I–V (contract versions and lifecycle states) and from
the contracts themselves (rights, terms, credentials). The Sources screen now shows the same verdicts
per source (§5).

| Source | Publisher | Connector | Contract | Rights / terms | Credential | **Status** | Evidence held | What live collection would need |
|---|---|---|---|---|---|---|---|---|
| `ecb-eurusd` | European Central Bank — Data Portal | rest | **v2 live**, active (v1 replay superseded) | confirmed — ESCB reuse policy: quote "Source: ECB statistics.", do not modify the statistics | none required | **LIVE** — backfilled 1999-01-04 → today in 366-day windows, forward endpoint (last 30 observations) polled daily; attribution rendered where rates are shown | 58 evidence objects (demo) | — (the owner's decision 2 of §14, done in Phase 4) |
| `imf-portwatch-chokepoints` | IMF PortWatch (with Oxford, World Bank, WTO) | rest | v1 replay, active (**rights confirmed 2026-09-10**; no v2 — §9.3) | **confirmed** — permission GRANTED (owner-reported 2026-09-10; grant text and conditions to be attached at `docs/sources/portwatch-grant.md` when supplied). *Until 2026-09-10:* pending — the dataset's ArcGIS item points to the IMF general Copyright and Usage terms, which require permission for *systematic* downloading | none required | **REPLAY** — the register reads "rights confirmed and no credential needed: live collection needs a new contract version declaring it". *Until 2026-09-10:* BLOCKED — RIGHTS | 132 (demo, 2026-09-10) | **Two things before a v2 (§9.3, §9.4):** (i) the v1 endpoints name `PortWatch_chokepoints_database/FeatureServer/0`, a layer with no `date` and no `n_total`; the daily series is `Daily_Chokepoints_Data/FeatureServer/0` (the ArcGIS item the request names), so the endpoints must be re-declared, which is a new contract version reviewed and approved on its own; (ii) §4a's ordered walk over three chokepoints (`orderByFields=date,portid`) needs a composite framing key (date + portid) the contract schema and connector do not have — a single `item_key_field` collides three rows per day under one deterministic key. Then the §4a backfill (8,418 rows → 9 pages of 1,000 inside the 12-request budget), publication-lag freshness, in-place revisions as supersessions. *History:* the request was prepared 2026-09-05 (#36), redrafted 2026-09-08 (`PORTWATCH_PERMISSION_REQUEST_2026-09.md`); permission owner-reported 2026-09-10. |
| `imf-portwatch-ports` | IMF PortWatch | rest | **v2 live, active** (registered, approved, activated 2026-09-10; v1 replay superseded) | **confirmed** — same owner-reported permission, same pending grant text (evidence on v1 and v2) | none required | **LIVE — every run fails at the publisher** (§9.2): the declared layer answers the §4a page-0 query with an error envelope, `'Invalid field: date' parameter is invalid`; automatic and operator runs both `failed · egress refused (transport_failure)`, 0 admitted, no bytes stored | 44 (unchanged) | The v1/v2 endpoint names `PortWatch_chokepoints_database/FeatureServer/0`, which holds **0 rows for `port1114`** and no `date`; the daily port series is `Daily_Ports_Data/FeatureServer/0` (2,804 rows for port 1114 → 3 pages). A corrected contract version must declare it — a new registration, approval and activation. Until then the daily schedule entry fires one failing 139-byte request per day; suspending v2 (`active → suspended`, reversible) is the owner's one-act option (§9.5). |
| `eu-sanctions-rss` | European Commission, DG FISMA — Financial Sanctions Files | rss | **v2 live**, active (v1 replay superseded, 2026-09-07) | confirmed — European Commission reuse notice, Commission Decision 2011/833/EU; dataset record on data.europa.eu, distribution "Sanctions List" under COM_REUSE, access PUBLIC | none required | **LIVE** — schedule entry hourly; runs operator-triggered in this deployment (§7) | 15 (9 replay + 6 per live poll) | nothing further; the scheduler is a deployment setting (§7.4) |
| `eu-sanctions-payload` | European Commission, DG FISMA | rest | **v2 live**, active (v1 replay superseded, 2026-09-07) | confirmed — same notice; distribution "Consolidated Financial Sanctions File 1.1" (CSV) under COM_REUSE, access PUBLIC | none required (a published URL parameter, not a credential; allow-listed for the secret scanner in #27) | **LIVE** — schedule entry every six hours; the one verified endpoint (the `version=2` duplicate dropped); runs operator-triggered (§7) | 6 (4 replay + 1 per live poll, 25,166,172 bytes each) | as above |
| `worldbank-indicators` | The World Bank — Indicators API | rest | **v2 live**, active (v1 replay superseded, 2026-09-07) | confirmed — CC-BY-4.0 under the World Bank Dataset Terms; attribution "The World Bank: Dataset name: Data source"; **WTO named as provider of TX.VAL.MRCH.CD.WT** | none required | **LIVE** — schedule entry weekly; structural context only, not a forecast driver; runs operator-triggered (§7) | 4 (2 replay + 2 live) | as above |
| `gdelt-discovery` | The GDELT Project — DOC 2.0 | rest | v1 replay, active | recorded confirmed under "GDELT Project terms of use"; the readiness plan (§4) held it back for a lawful-collection and attention-signal design of its own | none required | **REPLAY** — held; not proposed for live collection now | 1 | A read of the terms by a person, a collection design, and a decision |
| `un-comtrade-upload` | UN Statistics Division — UN Comtrade | upload | v1 replay, active | confirmed for the manual export; automated use "UNVERIFIED — read the full policy before any redistribution claim" | the owner's free-tier key, **not configured here** | **OPERATOR UPLOAD**; automated access **deferred** by decision 3 of §14 | 1 | Only on the owner's decision: bind the key header-only through a credential path the product does not yet have (§6), then a v2 `rest` contract against the Comtrade Plus API; nothing is read, bound or activated by this document |
| `nordwerk-internal` | NORDWERK ANTRIEBSTECHNIK GmbH (**synthetic**) | upload | v1 replay, active | internal | operator session | **OPERATOR UPLOAD** — synthetic, marked at object level | 3 | not applicable |
| `carrier-advisories` | carriers and port authorities (**synthetic**) | upload | v1 replay, active | internal | operator session | **OPERATOR UPLOAD** — synthetic | 5 | not applicable |

**Paid sources: nothing is purchased, subscribed to or evaluated** (decision 4 of §14). A commercial
AIS or freight-rate feed remains a costed option in the readiness plan (§7), not a purchase.

**The forecast and synthetic-validation limitations are unchanged**: T1/T2 on ECB are retrospective,
T3 is unmeasured, the corridor replay cannot establish forecast quality, the twins are grounded on
synthetic records and say so, and the automatic CorrectionApplied consumer stays deferred.

## 4. New source-use decisions, made concrete — decided 2026-09-07, activated (§7)

The owner's four decisions of 2026-09-05 (§14 of the readiness plan) cover PortWatch, ECB, UN
Comtrade and paid sources. **Two rights-confirmed public sources were never asked about**, because
the readiness plan concerned forecast drivers. Both are anonymous, free, contract-registered, served
by the connectors that exist, and carry terms a person has read. Going live with either is a change
of use — replay to systematic collection. Both were put to the owner as proposals with the exact
contract that would be registered; the owner decided YES on 2026-09-07 after the independent review
of `68d650f5`, on three bounded corrections that are now in the drafts and in the register: the
credential blocker outranks the live verdicts (§5), the EU collection promise matches the poller
(two independent pollers, hourly feed and six-hour payload — the feed does **not** trigger the
payload), and the World Bank attribution names the WTO as provider of the merchandise-export series.

| # | Proposal | Terms, read at the source | What changes | What does not | Draft |
|---|---|---|---|---|---|
| **A** | **EU Financial Sanctions — live** (`eu-sanctions-rss` polled hourly; `eu-sanctions-payload` polled every six hours, independently — the RSS connector follows no link and the scheduler schedules each source on its own) | European Commission reuse notice, Commission Decision 2011/833/EU (reuse permitted, source acknowledged); the dataset record on data.europa.eu lists the RSS and the CSV 1.1 distributions under COM_REUSE, access PUBLIC — read 2026-09-07; the feed is the publisher's own correction channel | v2 contracts declaring `live`, the verified endpoints (feed 200 text/xml; CSV 1.1 200 **text/plain**, 25,166,172 bytes; `…&version=2` verified byte-identical, sha256 `049cb95c…`, and dropped), media types and byte cap as observed, the attribution line; approved by a second operator; activated | No credential, no purchase, no new connector; the replay sets stay as fixtures; classification stays `internal` | `scripts/integrations/proposals/eu-sanctions-live.mjs` |
| **B** | **World Bank Indicators — live** (weekly) | CC-BY-4.0 under the World Bank Dataset Terms (read 2026-09-07): attribution to the Bank **and its data providers** as "The World Bank: Dataset name: Data source (if known)"; the indicator metadata names the **World Trade Organization (WTO)** as source organisation of TX.VAL.MRCH.CD.WT, and both indicator pages show CC BY-4.0 | v2 contract declaring `live`, the same two indicator endpoints (both 200 application/json), the attribution line naming the WTO for merchandise exports and national sources for NE.IMP.GNFS.ZS; weekly poll | Not a forecast driver (annual grain); structural context only — no forecast promise, no blanket backfill; no credential | `scripts/integrations/proposals/worldbank-indicators-live.mjs` |
| — | GDELT | Held: the readiness plan asks for a lawful-collection and attention-signal design first | — | — | not proposed |
| — | UN Comtrade automated access | Decision 3: deferred, key untouched | — | — | not proposed; §6 states what it would take |
| — | PortWatch live | Decision 1: permission first; the request is drafted on #36 for the owner to send. **2026-09-10: permission owner-reported as GRANTED** (grant text pending at `docs/sources/portwatch-grant.md`); rights confirmed on both contracts, `imf-portwatch-ports` v2 registered, approved and activated, the chokepoints v2 stopped before registration — §9 | — | — | `scripts/integrations/activate-portwatch.mjs` (§9) |

The drafts are validated by the product's own contract validator (`node scripts/integrations/check-proposals.mjs`);
registering, approving and activating them are three governed acts by two operators, performed on
the owner's decision by `scripts/integrations/activate-proposals.mjs` and recorded in §7.

## 5. What was implemented now, under the existing approvals

* **A readiness register** (`POST …/observation/sources/readiness`; `SourcesService.readiness`): every
  registered source with a verdict in the product's words — `live`, `live-unscheduled`, `replay`,
  `operator-upload`, `blocked-rights`, `blocked-credential`, `inactive` — the reason, the credential
  position, whether collection is scheduled and at what cadence, the last governed run (state, mode,
  finish time, admitted/quarantined/no-op counts, failure), the evidence objects held, and the
  latest recorded health verdict with its evaluation instant. Read from stored records alone; it
  activates nothing and consults no clock.
* **Correction after the independent review of `68d650f5` (P2)** — reproduced through the real
  database and controller harness first: an active live contract naming a credential this deployment
  does not bind read `live` (with a schedule entry) or `live-unscheduled` (without), because the
  live branch was consulted before the credential branch. The credential blocker now outranks both
  live verdicts; public live sources and superseded versions are unchanged; schedule and run facts
  are carried separately whatever the verdict. No credential-binding subsystem was built.
* **A schedule is an intention, a run is a fact.** The register now carries `scheduler_enabled` —
  whether this deployment executes schedule entries at all — and words the LIVE reason accordingly:
  "schedule entry every N s (this deployment runs no scheduler: runs are operator-triggered)". The
  run record does not persist its trigger, so the register does not claim any run was scheduled.
* **The Sources screen** shows the register: Status, Last governed run, Evidence and Health beside
  Mode and Rights, so an operator sees at list density what is real, what is replayed and what is
  blocked — and by what.
* **Regression**: `apps/api/test/int/phase5-source-readiness.test.ts` (a replay contract reads
  `replay`; a live contract with a scheduled agent reads `live`; an upload source reads
  `operator-upload`; a contract with `rights_state: pending` reads `blocked-rights`; the evidence
  count and the last run are the stored ones), and a browser check on the demonstration's register
  (`ecb-eurusd` LIVE, PortWatch BLOCKED — RIGHTS, the uploads OPERATOR UPLOAD).
* **The proposals** of §4 as validated contracts, and their activation (§7).

## 6. The implementation sequence from here

1. **Proposals A and B — done** (§7): v2 registered through the existing route, approved by the
   second operator, rights evidence recorded, activated; the register shows LIVE with the first
   governed runs. **What remains is a deployment decision, not a source decision**: the scheduler is
   disabled here (`EYE_SCHEDULER_ENABLED` unset → `false`), and no code starts a collection worker
   even when it is enabled (`SchedulerService.startWorker` has no caller), so schedule entries are
   recorded and nothing polls unattended. Scheduled execution needs that wiring, reviewed on its own.
2. **PortWatch**: the owner sends the prepared request. On permission: the v2 live contract with the
   §4a backfill (ordered pages, budget, idempotent re-walk, publication-lag freshness, in-place
   revisions recorded as supersessions) — the same path ECB took. **2026-09-10 (§9):** permission
   owner-reported; the path was taken for `imf-portwatch-ports` and stopped at the publisher, because
   the endpoints every PortWatch contract has carried since Phase 1 name the chokepoints *master*
   layer, not the daily series. What activation requires next, in order: (a) the grant text attached
   at `docs/sources/portwatch-grant.md` and its conditions read into the contracts; (b) a contract
   version per source declaring the daily layers (`Daily_Chokepoints_Data`, `Daily_Ports_Data`)
   as its endpoints and backfill endpoint — registered, approved by a second operator, activated;
   (c) for the chokepoints, a composite framing key (date + portid) in the contract schema and the
   connector's `frame()` before the three-chokepoint walk of §4a can be recorded without key
   collisions — connector work with its own review; (d) then the backfill, several runs inside the
   unchanged 12-request budget.
3. **A governed credential path**, only when a source needs one (UN Comtrade would be the first):
   a contract's `credential_ref` resolved at run time from the deployment's secret store into a
   header-only credential the HTTP client already knows how to carry and never logs; the reference,
   never the value, in the contract, the run record and the audit. This is a design with its own
   review; it is not started here, because no approved source needs it.
4. **UN Comtrade**: after 3, and only on the owner's decision to activate the key.
5. **GDELT**: a person reads the terms; a lawful-collection and attention-signal design; a decision.

Everything above stays behind the same gates as the rest of the platform: C15 blocks every merge
until a patched image exists, and no waiver or bypass is on the table.

## 7. Activation results — 2026-09-07, demonstration deployment (`eye_demo`)

Performed by `scripts/integrations/activate-proposals.mjs` on the owner's decision, through the same
governed path ECB took: register (a.hoffmann) → the registrar's own approval refused (403) → approve
(m.dvorak) → rights evidence recorded → v1 superseded, v2 activated (which records the schedule
entry) → agent for the current connector version confirmed → one operator-triggered collection.
Receipts are policy decisions in the audit chain.

### 7.1 Governed receipts

| Source | v2 register (policy decision · audit seq) | approve | rights | activate |
|---|---|---|---|---|
| `eu-sanctions-rss` | `01a07ce9-1fb2…` · 4352 | `01a07ce9-1fdc…` · 4354 | `01a07ce9-1fe4…` · 4355 | `01a07ce9-1ff8…` · 4357 |
| `eu-sanctions-payload` | `01a07ce9-2680…` · 4389 | `01a07ce9-268e…` · 4391 | `01a07ce9-2694…` · 4392 | `01a07ce9-26a3…` · 4394 |
| `worldbank-indicators` | `01a07ce9-3254…` · 4411 | `01a07ce9-3262…` · 4413 | `01a07ce9-3267…` · 4414 | `01a07ce9-3274…` · 4416 |

### 7.2 Live collection — first pass (operator-triggered by m.dvorak, `observation.run.trigger`)

| Source | Run | State | Mode | Requests | Admitted | Bytes | What was admitted |
|---|---|---|---|---|---|---|---|
| `eu-sanctions-rss` v2 | `01a07ce9-2023…` | finished | live | 1 | 6 | 7,294 | the feed (3,934 B, declared text/xml, sniffed application/xml) as parent, and its five items as byte-range fragments (`rss-framing@5.11.1`), each keyed guid + pubDate |
| `eu-sanctions-payload` v2 | `01a07ce9-26c6…` | finished | live | 1 | 1 | 25,166,172 | the consolidated CSV 1.1, declared and sniffed text/plain, sha256 `049cb95cf55c…` — the same digest the pre-registration verification recorded |
| `worldbank-indicators` v2 | `01a07ce9-3292…` | finished | live | 2 | 2 | 22,679 | the two indicator responses (11,089 and 11,590 B, application/json) |

Every object: transport endpoint verified, source origin verified (host pinned from the contract),
byte integrity verified pre-store, post-store and on read; content authenticity `unknown` (no
publisher signature) — exactly as the contracts declare.

### 7.3 Second pass (idempotency, same script re-run)

| Source | Admitted | No-op | Requests | Bytes | Meaning |
|---|---|---|---|---|---|
| `eu-sanctions-rss` | 6 | 0 | 1 | 3,934 + fragments | the publisher answers unconditionally; the same feed bytes (identical digests) are stored again as a new observation — each poll is an observation, and the equal digest is what says "no revision" |
| `eu-sanctions-payload` | 1 | 0 | 1 | 25,166,172 | same: an unconditional publisher, identical digest, stored again |
| `worldbank-indicators` | 0 | 0 | 2 | 0 | conditional requests from the checkpoint's `Last-Modified`; the publisher answered not-modified, nothing transferred |

**Consequence to know before enabling a scheduler here**: the vault stores each poll under a fresh
locator and does not de-duplicate identical bytes, so the six-hour payload poll would store about
100 MB per day of identical CSV while the Commission publishes nothing new. Within the contract's
per-run budget (64 MiB), but a retention or same-digest no-op rule is the right next design — it is
not built here.

### 7.4 Schedules vs. observed scheduled runs

| Source | Schedule entry recorded | Cadence | Scheduler in this deployment | Scheduled run observed |
|---|---|---|---|---|
| `ecb-eurusd` v2 | yes | 86,400 s | disabled | **none** — every ECB run was operator-triggered |
| `eu-sanctions-rss` v2 | yes | 3,600 s | disabled | **none** |
| `eu-sanctions-payload` v2 | yes | 21,600 s | disabled | **none** |
| `worldbank-indicators` v2 | yes | 604,800 s | disabled | **none** |

The register says this on every LIVE row. An observed scheduled run needs the deployment to enable
the scheduler **and** to start a collection worker; the second does not exist in the code today.

### 7.5 Attribution carried on the contracts (read back from the register)

* EU: "Source: European Commission, Financial Sanctions Files — consolidated list of persons, groups
  and entities subject to EU financial sanctions (reuse under Commission Decision 2011/833/EU)."
* World Bank: "The World Bank: World Development Indicators: Merchandise exports, current US$
  (TX.VAL.MRCH.CD.WT) — data source World Trade Organization (WTO); Imports of goods and services,
  % of GDP (NE.IMP.GNFS.ZS) — data source national statistical offices, central banks and World Bank
  staff estimates. Licence CC BY-4.0."

### 7.6 Register as rendered (browser check `12-sources-register`, as the collection manager)

LIVE: `worldbank-indicators@v2`, `eu-sanctions-payload@v2`, `eu-sanctions-rss@v2`, `ecb-eurusd@v2`
(each with "schedule entry every N s (this deployment runs no scheduler: runs are operator-triggered)");
BLOCKED — RIGHTS: both PortWatch contracts; OPERATOR UPLOAD: the three uploads; REPLAY:
`gdelt-discovery@v1`; INACTIVE: the four superseded v1 contracts. The evidence column counts per
source across versions (`SRC:<id>@…`), so a v1 row and its v2 row show the same total.

### 7.7 Unchanged

PortWatch in replay pending written permission (the request is on #36 for the owner to send —
*as of 2026-09-07; superseded by §9 on 2026-09-10*); UN
Comtrade deferred, key untouched; purchases zero; the automatic CorrectionApplied consumer deferred;
Phase 4 and Phase 5 functional reviews closed; C15 and the required downstream checks remain the
merge gates for #41, #42 and #43.

## 8. Closure record — the three bounded follow-ups, closed at `91263061`

The independent review of `68d650f5` (2026-09-07) raised one reproduced service-level defect and
two proposal details. All three are closed at `91263061a5f103722d3dbd9b96bfde6476b496d8` and
confirmed by the reviewer's own execution of the candidate's service and validator (5/5 credential
and control cases; all three corrected contracts valid):

| # | Follow-up | Closed by | Evidence |
|---|---|---|---|
| 1 | Unbound credential must outrank LIVE / LIVE — UNSCHEDULED | reproduced at the real DB/controller harness, then the verdict order corrected in `SourcesService.readiness` | `phase5-source-readiness.test.ts` 5/5; §5 |
| 2 | EU RSS and payload are independent hourly / six-hour pollers; the duplicate payload endpoint removed; endpoints and dataset terms verified before registration | proposal A drafts and §4 | `049cb95c…` byte-identical check; data.europa.eu record; §4, §7 |
| 3 | WTO named as provider of the World Bank merchandise-export series | proposal B draft and §4 | the Bank's indicator metadata and Dataset Terms; §7.5 |

Phase 4 and Phase 5 functional reviews remain closed. The next increment — functioning automatic
collection for the four approved live sources, including the BullMQ 6.0.6 queue-name incompatibility
the reviewer identified (`queueNameFor()` yields `obs:<tenant>:<domain>:collection`, which the
pinned `QueueBase` refuses with "Queue name cannot contain :") — is a separate PR stacked on this
one, with its own scope record (`SCHEDULED_COLLECTION.md`). C15 and the required downstream checks
remain the merge gates.


## 9. IMF PortWatch — owner-reported permission, 2026-09-10 (demonstration deployment, `eye_demo`)

**What the owner reported.** On 2026-09-10 the owner reported that IMF PortWatch permission is
**GRANTED** and authorised progressing activation within the approved rights, cadence and budget.
**The grant text and its conditions were not supplied.** They attach at
`docs/sources/portwatch-grant.md` (created today as the placeholder record: the owner-reported
approval, the date, and what is pending — the text, permitted uses, attribution wording, any rate or
scope conditions). No condition is asserted here that the IMF has or has not set; every contract
field a grant could condition (permitted use, budgets, cadence, retention) stays at its v1 value.
UN Comtrade stays deferred and its key untouched; nothing was purchased; no cadence or budget
changed; no credential was created or bound.

All acts below went through the product's own governed routes as the demonstration's operators
(a.hoffmann registers; m.dvorak, the collection manager, approves, records rights, transitions and
triggers), by `scripts/integrations/activate-portwatch.mjs`; no SQL. Receipts are policy decisions
in the audit chain (prefix · audit seq). API at the candidate build of `59a2459`, scheduler enabled
with a worker running (SCHEDULED_COLLECTION.md §3.3).

### 9.1 Rights — updated: yes, on both sources

| Source | Version | Route | Evidence recorded | Receipt |
|---|---|---|---|---|
| `imf-portwatch-chokepoints` | v1 (replay, active) | `/sources/:id/rights` → `confirmed` | `owner-reported IMF permission, 2026-09-10; grant text pending at docs/sources/portwatch-grant.md` | `01a08c13…` · 4479 |
| `imf-portwatch-ports` | v1 (replay, active at the time) | same | same | `01a08c13…` · 4481 |
| `imf-portwatch-ports` | v2 (below) | same | same | `01a08c13…` · 4485 |

The register's verdict for the chokepoints moved from BLOCKED — RIGHTS to **REPLAY** ("rights
confirmed and no credential needed: live collection needs a new contract version declaring it,
approved and activated by a second operator"). The same rights change on ports v1 is superseded by
v2 below.

### 9.2 `imf-portwatch-ports` — v2 registered: yes; approved: yes; activated: yes; the run: failed at the publisher

**The v2 contract**, built from v1 as read back from the register: `acquisition_mode: live`;
**cadence 86,400 s and budgets (12 requests, 32 MiB per run, 60 s timeout, 2 retries, concurrency 2)
carried verbatim from v1**; `rights_state: confirmed` with the licence text naming the owner-reported
permission and the pending grant record; the request's provisional attribution ("Source: IMF PortWatch
(IMF / Oxford), portwatch.imf.org", marked provisional); `permitted_use` unchanged (`internal
analysis`); the §4a backfill declared — `arcgis-offset`, endpoint the v1 layer's `/query`, from
`2019-01-01` to the day the walk starts, `page_size 1000`, `order_by date,portid`, `time_field date`,
`where portid='port1114'`; publication-lag freshness (§4a: PortWatch publishes 7–10 days behind, so
the threshold is 14 days on a daily interval, where v1's 3 days would read stale by design); the
correction channel restated as in-place revisions recorded as supersessions on re-walk; the forward
endpoint is the v1 resource and filter with the newest 30 rows in date order (as the permission
request's "new rows once per day", and as ECB v2's `lastNObservations=30`), because unbounded the
service answers its first 1,000 rows in an undefined order. `replay_set` dropped (live).

| Act | Actor | Result | Receipt |
|---|---|---|---|
| register v2 | a.hoffmann | `draft`, validator accepted the backfill declaration | `01a08c13…` · 4483 |
| approve | m.dvorak | approved | `01a08c13…` · 4484 |
| rights on v2 | m.dvorak | confirmed (9.1) | `01a08c13…` · 4485 |
| v1 → superseded | m.dvorak | done | `01a08c13…` · 4486 |
| v2 → active | m.dvorak | active; the schedule entry recorded (every 86,400 s, v1's cadence) and materialised in Redis; the worker serves it | `01a08c13…` · 4487 |

**Runs.** Activation upserts the BullMQ scheduler, which fires once immediately (§3.3 of
SCHEDULED_COLLECTION.md), so an automatic run preceded the operator run:

| Trigger | Run | State | Admitted / unchanged / quarantined | Budget spent | Reason recorded |
|---|---|---|---|---|---|
| scheduler (job `repeat:…:1789056482205`), 16:08:02 UTC | `01a08c13-7baa…` | **failed** | 0 / 0 / 0 | 1 request (page 0 of the backfill), 139 bytes transferred, 0 stored | `egress refused (transport_failure)` |
| operator m.dvorak, `observation.run.trigger`, 16:08:07 UTC | `01a08c13-9202…` | **failed** | 0 / 0 / 0 | same | same |

The agent for connector `observation.rest` 1.2.0 (`01a084f5…`, active) matched the process; no agent
was provisioned. Evidence for the source is unchanged at 44 objects.

**The exact refusal.** The run record keeps only the refusal class; the connector's message is
discarded by `lifecycle.service.ts` (`egress refused (${e.refusalClass})`) and the API logs nothing
for it — a product observability gap, noted. To name the refusal, the page-0 URL the connector
constructs (`nextRequest`, `arcgis-offset`) was requested once from the shell — a diagnostic
verification of a now-permitted endpoint, of the kind §4 recorded before the EU and World Bank
registrations, not a collection; nothing from it was stored:

```
where=(portid='port1114') AND (date >= TIMESTAMP '2019-01-01 00:00:00' AND date < TIMESTAMP '2026-09-10 00:00:00')
      &outFields=*&orderByFields=date,portid&resultOffset=0&resultRecordCount=1000&f=json
HTTP 200, application/json, 139 bytes:
{"error":{"code":400,"message":"Cannot perform query. Invalid query parameters.",
          "details":["'Invalid field: date' parameter is invalid"]}}
```

That is the error envelope `errorEnvelope()` detects, raised as
`EgressRefused('transport_failure', 'backfill page is an error envelope: service error: Cannot
perform query. Invalid query parameters.')`. It is not a transport fault: DNS resolved, TCP connected,
the run took under a second.

### 9.3 Finding — the contracts name the wrong layer; the chokepoints walk needs a composite key

1. **Wrong layer, since Phase 1.** Both PortWatch contracts (v1 and the ports v2 derived from it)
   declare `PortWatch_chokepoints_database/FeatureServer/0`. Its layer metadata (one request,
   20,296 bytes) shows the chokepoints **master** table: `portid, portname, country, ISO3, lat, lon,
   vessel_count_total (Double) …, ObjectId` — **no `date`, no `n_total`**; and a count-only query for
   `portid='port1114'` on it answers **`{"count":0}`**. The daily series the permission request names
   (ArcGIS item `3da2b9ca97684916b75c4013f95d18ab`, owner `IMF-portwatch_imf_dataviz`, licence link
   `imf.org/external/terms.htm`) is **`Daily_Chokepoints_Data/FeatureServer/0`** (`date: DateOnly,
   portid, n_total, n_container, n_tanker, …, capacity, ObjectId`; `maxRecordCount 1000`;
   pagination and orderBy supported): **8,418 rows** for chokepoints 1, 4 and 7 — 9 pages of 1,000,
   inside the 12-request budget, as §4a estimated. The ports series is
   **`Daily_Ports_Data/FeatureServer/0`** (`date: DateOnly, portid, portcalls…, import…, export…`):
   **2,804 rows** for `port1114` — 3 pages. Consequently the replay manifests' URLs
   (`fixtures/phase1/replay/imf-portwatch-*/MANIFEST.json`) name a layer that cannot have served the
   rows they hold; the fixture bytes are unchanged and remain the frozen replay set, and this is
   recorded as a finding for the fixture record, not corrected here. A contract version declaring the
   daily layers is a **new endpoint** and therefore a new registration, approval and activation — not
   performed under today's scope ("only the contract's declared endpoints"). These lookups (two layer
   metadata reads, two count-only queries, one portal item read, one portal search) were the only
   requests outside the governed runs; none was stored.
2. **Composite framing key.** §4a's ordered walk over the three chokepoints
   (`orderByFields=date,portid`, one declaration per contract) frames each page by
   `expected_schema.item_key_field` — a single path, `attributes.date` — and `frame()` keys a child as
   `<parent key>#features:<date>`. A page carrying three chokepoints per day therefore yields three
   deterministic children under **one** item key: the first walk admits three evidence objects per
   key, and every idempotent re-walk (`latestEvidenceByItemKeys`) compares each against only the
   latest of them and records the other two as revisions. Registering that v2 would have been accepted
   by the routes and mis-recorded by the run, so the chokepoints v2 was **stopped before
   registration** — not forced, not narrowed to one chokepoint (a different plan than §4a). It needs a
   composite key (date + portid) in the contract schema and the connector, reviewed on its own.
3. **Observed in passing, out of scope.** The two PortWatch v1 replay schedule entries fired
   automatically today at 07:00 UTC and both attempts read `failed · header semantics: recorded_at is
   in the future` (the run records show `finished_at` 06:32 against `started_at` 07:00 — the database
   and application clocks disagree by about 28 minutes on this machine). Not touched.

### 9.4 What still needs the grant text

* The grant text itself, verbatim, at `docs/sources/portwatch-grant.md` §2, and recorded as rights
  evidence on the contracts in place of the owner-reported string.
* Permitted uses beyond `internal analysis` (commercial deployment; customer-facing derived analyses).
* The attribution wording the IMF requires (the contracts carry the request's provisional wording).
* Any rate, volume, scope, retention, granularity or latency condition; any fee or agreement.
* Whether the IMF names a preferred endpoint or bulk download for history instead of paging.

### 9.5 State left on the demonstration, and the next acts

| Source | Left as | Next |
|---|---|---|
| `imf-portwatch-chokepoints` | v1 replay, active, rights confirmed; REPLAY | grant text (9.4); a contract version declaring `Daily_Chokepoints_Data` (9.3.1); composite framing key (9.3.2); then the §4a backfill |
| `imf-portwatch-ports` | **v2 live, active**, rights confirmed; the daily schedule entry will fire one failing 139-byte page-0 request per day until corrected; v1 superseded | grant text; a contract version declaring `Daily_Ports_Data` (9.3.1) — its backfill is representable today (one port, one key per day). If the owner prefers no failing request to the IMF meanwhile: `v2 → suspended` through `/sources/:id/transition` (reversible, `suspended → active` is permitted by migration 0022) — not done here, being outside today's scope. |

Unchanged: UN Comtrade deferred, key untouched; purchases zero; cadences and budgets as before;
GDELT held; the four live sources of §7 untouched; C15 and the required checks remain the merge gates.

### 9.6 `imf-portwatch-ports` v3 — the daily layer declared; registered, approved, activated; the walk collected — 2026-09-10, 16:35–16:45 UTC

**Addition of 2026-09-10 (afternoon), after §9.5.** The owner authorised activation within the
approved rights, the existing cadence (86,400 s) and budgets (12 requests, 32 MiB per run).
Declaring the layer that carries the series is part of activating: v3 is v2 with the endpoint
layer corrected and nothing else. Governed routes only, no SQL; a.hoffmann registers, m.dvorak
approves, records rights, transitions and triggers; the acts were made by a one-off script in the
session scratchpad (not added to the repository), with the same envelope discipline as
`scripts/integrations/activate-portwatch.mjs`.

**The v3 contract**, built from v2 as read back from the register. A field-by-field comparison
before registration showed exactly four differences: `identity.endpoints[0]` and
`security_and_operations.backfill.endpoint` — `PortWatch_chokepoints_database/FeatureServer/0`
→ **`Daily_Ports_Data/FeatureServer/0`** (the query string of the forward endpoint unchanged:
`where=portid='port1114'&outFields=*&orderByFields=date DESC&resultRecordCount=30&f=json`);
`lifecycle.contract_version` 2 → 3; `lifecycle.supersedes_version` 1 → 2. Everything else is v2's,
verbatim: cadence 86,400 s, jitter 300 s, budgets (12 requests, 32 MiB, 60 s timeout, 2 retries,
concurrency 2), the §4a backfill (`arcgis-offset`, from `2019-01-01`, `page_size 1000`,
`order_by date,portid`, `time_field date`, `where portid='port1114'`), the 14-day freshness
threshold, `expected_schema` (`item_path features`, `item_key_field attributes.date`,
`item_time_field attributes.date`, `required_fields features.[].attributes.date`), rights
`confirmed` with the owner-reported licence text, the provisional attribution, `permitted_use`
`internal analysis`. **No metadata request was made and no declared field was changed**: the layer
metadata read on 2026-09-10 morning (§9.3.1) already showed `date` (DateOnly) and `portid` on
`Daily_Ports_Data`, which are the only fields the connector's ArcGIS parameters and the framing
name.

| Act | Actor | Result | Receipt (policy decision `01a08c2c…`) |
|---|---|---|---|
| register v3 | a.hoffmann | `draft`; validator accepted | audit seq 4516 |
| approve v3 | m.dvorak | approved | 4517 |
| rights on v3 | m.dvorak | `confirmed`, evidence `owner-reported IMF permission, 2026-09-10; grant text pending at docs/sources/portwatch-grant.md` | 4518 |
| v2 → superseded | m.dvorak | done | 4519 |
| v3 → active | m.dvorak | active at 16:35:30 UTC; the source's single scheduler (`obs:…:src:01a084f5-76b9…`) re-upserted for v3 | 4520 |

No refusal on any of the five acts. `docs/sources/portwatch-grant.md` §1 lists the rights evidence
as recorded on v1 and v2; v3 now carries the same string (not edited there today — that file is
outside this addition's scope; the row is to be extended when the grant text is attached).

**Runs.** Activation upserts the BullMQ scheduler, which fires once immediately (SCHEDULED_COLLECTION.md
§3.3); the automatic attempt therefore preceded the operator run — and, this time, overlapped it
(§9.6.1):

| Trigger | Run | State | Requests · bytes transferred | Fetched | Admitted / unchanged / quarantined |
|---|---|---|---|---|---|
| scheduler (job `repeat:…:1789058130331`), started 16:35:30.355, finished 16:41:59.748 UTC | `01a08c2c-a1a3…` | **finished** | 3 · **1,796,674** (pages at offsets 0, 1000, 2000: 640,766 + 640,810 + 515,098 bytes, HTTP 200 each) | 2,807 = 3 pages + **2,804 rows** | **2,807 / 0 / 0** |
| operator m.dvorak, `observation.run.trigger`, started 16:39:02.083, finished 16:44:51 UTC | `01a08c2f-dcaf…` | **finished** | 3 · 1,796,674 (the same three pages, byte-identical) | 2,807 | **2,133 / 674 / 0** |

* The walk is exactly what §4a and §9.3.1 estimated: 2,804 rows for `port1114` in
  `[2019-01-01, 2026-09-10)`, three pages, the third short (804 rows), so the connector recorded the
  window done; 3 of 12 requests and 1.8 of 32 MiB spent per walk. No refusal class was recorded on
  either run. Rows are stored as byte-range fragments of their page
  (`fragment.byte_start/byte_end`, `json-array-framing@1.2.0`); the page bytes are the stored bytes.
* The agent for connector `observation.rest` 1.2.0 (`01a084f5-783f…`, active) matched; none was provisioned.
* **Evidence for the source: 44 before → 4,984 after** (= 44 + 2,807 + 2,133).
* The operator's `/sources/:id/collect` call holds its HTTP response for the run's duration; the
  triggering script's client (undici, 5-minute headers timeout) gave up at 16:44:02 while the run
  continued and finished server-side at 16:44:51. The run was read back through
  `/sources/:id/get` and `/runs/:id/get`.

#### 9.6.1 Finding — an operator run triggered while the scheduled attempt was in flight was accepted, walked the same window concurrently, and admitted 2,133 second copies

The operator run was triggered at 16:39:02 after a three-minute wait for the automatic attempt to
finish (the §9.2 attempts took under a second; a 2,800-item walk takes six and a half minutes
here). The product accepted the trigger and ran both walks at once. What followed, read from the
run events:

* The operator run's page 0 (offset 0) and 673 of its 1,000 rows were **confirmed unchanged**
  (`item.noop`, "identical bytes for a window already held; a backfill re-run admits nothing twice")
  against what the automatic run had admitted by then. Its pages at offsets 1000 and 2000 and the
  remaining **2,131 rows were admitted again** — 2,133 fresh evidence objects (`supersedes: null`,
  `correction_of: null`, `object_version 1`) under item keys the automatic run had also admitted
  (the automatic run admitted the whole walk, 2,807 objects; so every one of the operator run's
  2,133 admissions is a second copy of a key already held).
* Causes, in the code as built: (i) `eye.connector.per_source_concurrency` (1 on this deployment)
  is a BullMQ worker setting (`scheduler.service.ts`, the worker's `concurrency`); the operator
  route runs the governed path in the API process and neither refuses, queues nor serialises
  against a scheduled attempt for the same source. (ii) `loadPriorEvidence`
  (`lifecycle.service.ts`, "read once per run") reads `latestEvidenceByItemKeys` for a page's
  items before that page is admitted; admissions the other run commits between that read and the
  commit are unseen, and nothing at admission enforces one object per (source, item key, digest).
  (iii) The backfill checkpoint is persisted at run end (16:41:59 for the automatic run); a run
  starting before that walks from offset 0.
* Consequence for the held evidence: re-walks compare each key against its **latest** object, so
  of each duplicate pair the earlier copy is unreachable through the idempotent path; the counts
  the register shows for this source (4,984) overstate distinct observations by 2,133. Nothing was
  withdrawn, deleted or forced here; no SQL. The duplicates are the product's to resolve through a
  governed act (a withdrawal of the operator run's admissions, or a dedup rule), reviewed on its own.
* **Routed as P1 (product):** serialise operator and scheduled attempts per source through the
  governed route (a per-source lease; a trigger during an in-flight attempt refused with a named
  refusal class, or queued behind it), and make the prior-evidence check hold at admission (per
  item key, in the admitting transaction, or a uniqueness rule per source, item key and digest).
* Observability gaps met on the way, noted: `/runs/:id/get` returns the first 250 events without
  paging, so a walk's `run.finished` (with its requests/bytes) and `run.checkpointed` events are not
  readable through the route; `/evidence/list` summaries carry no item key and cap at 500, so
  duplicate keys cannot be counted through the routes (the arithmetic above is from the run rows).

#### 9.6.2 Scheduler state after the acts

| Version | Lifecycle | Schedule entry | Redis scheduler | Attempts |
|---|---|---|---|---|
| v3 | **active**, live, rights confirmed, verdict LIVE ("live under contract version 3; schedule entry every 86400 s; a worker serves it here") | scheduled, every 86,400 s | present, every 86,400 s, **`next_at 2026-09-11T16:35:30.331Z`** (24 h after activation — within the existing cadence) | 1 total, 1 finished, 0 failed; `last_success` = the 16:35:30 attempt (2,807 admitted) |
| v2 | superseded, inactive | none | (the source's one scheduler now serves v3) | the two failed v2 attempts of §9.2 remain in history; no further v2 tick will fire |
| v1 | superseded, inactive | none | — | — |

The next tick finds the backfill recorded done (both runs ended on the short third page; the
checkpoint itself is exposed by no read route and is verified at that tick, not here) and, by the
connector's rule, walks no window and polls the forward endpoint once: newest 30 rows of
`Daily_Ports_Data` for `port1114` (1 request, well inside the budgets); identical bytes to the
held poll are a confirmation, different bytes a new observation naming what it changed from.

### 9.7 `imf-portwatch-chokepoints` — not registered live; the required change, as a P1 acceptance item

Not registered (§9.3.2 stands): §4a's ordered walk over the three chokepoints frames every row by
`expected_schema.item_key_field`, a single path (`attributes.date`), so a page carrying
chokepoints 1, 4 and 7 for the same day yields three deterministic children under one item key —
the first walk admits three objects per key and every re-walk compares each against only the latest
of them and records the other two as revisions. Today's §9.6.1 shows what a key collision does to the
held evidence at scale; registering the chokepoints walk on a single key would build that in by design.

**P1 acceptance item — composite item key for the chokepoints walk.**

| | Required |
|---|---|
| Contract schema (`source-contract.ts`) | `expected_schema.item_key_field` accepts a composite — an ordered list of paths (e.g. `["attributes.date", "attributes.portid"]`) alongside the single path; `required_fields` lists both; the validator refuses a `backfill.where` that names more than one `portid` value (or an `IN (…)`) on a single-path key. |
| Connector (`rest.connector.ts`, `frame()`) | the child key is the parent key plus each component's value in declared order, with a separator no ArcGIS value contains (`<parent>#features:<date>\|<portid>`); `item_time_field` stays `attributes.date`; `latestEvidenceByItemKeys` is unchanged (keys remain strings). Unit coverage in `phase4-backfill.test.ts`: three rows per day framed to three distinct keys; a re-walk of an identical page yields 100 % no-ops and zero revisions. |
| The contract to register | layer **`Daily_Chokepoints_Data/FeatureServer/0`** (`date: DateOnly, portid, n_total, n_container, n_tanker, …, capacity, ObjectId`; `maxRecordCount 1000`; pagination and `orderByFields` supported — §9.3.1); backfill `arcgis-offset`, from `2019-01-01`, `page_size 1000`, `order_by date,portid`, `time_field date`, `where portid IN ('chokepoint1','chokepoint4','chokepoint7')`; forward endpoint the same filter with `orderByFields=date DESC&resultRecordCount=90` (30 days × 3 chokepoints); cadence 86,400 s and budgets as v1 (12 requests, 32 MiB); rights `confirmed` with the same evidence string; `coverage_expectations.expected_items_per_window` 3. |
| Expected volume | **8,418 rows** → **9 pages** of ≤ 1,000 (§9.3.1's count), about 9 × 0.6 MB ≈ 5.5 MB at the ports pages' density — 9 of 12 requests and ≈ 6 of 32 MiB, so **one run completes the walk**; thereafter one request per day. |
| Acceptance | the v2 registration is accepted by the validator with the composite key and refused without it; one governed run (with no concurrent attempt — §9.6.1's P1 first, or the trigger made only after the scheduler's attempt is read back finished) admits 9 pages + 8,418 rows with **8,418 distinct row keys**; a second run under the same contract records the walk done and polls forward, admitting nothing twice; the readiness register shows LIVE with the daily entry. |

### 9.8 Observed, not fixed — the database and host clocks

The two PortWatch v1 replay ticks of 07:00 UTC today (§9.3.3) failed with `header semantics:
recorded_at is in the future`. Their records show the disagreement exactly: the attempt (host
clock, BullMQ) `started_at 07:00:38`, while the run rows (database `now()`) read
`started_at 06:32:22.999` and `finished_at 06:32:23.059` — the database **28 min 15 s behind** the
host at that moment. Measured again at 16:35:15 UTC today: host `date -u` →
`2026-09-10T16:35:15Z`; `select now()` on `eye_demo` (read-only, through `psql` in the
`eye-postgres` container) → `2026-09-10T16:35:15Z`; the container's own `date -u` → the same.
**Skew now: 0 s.** The morning's skew is no longer present; its cause was not investigated (the
database runs in the Docker Desktop Linux VM, whose clock is resynchronised by Docker Desktop, not
by the host's NTP); nothing was changed. The health routes (`/healthz`, `/readyz`) expose no
database time, so the measurement needed the read-only query. The v1 replay entries are gone with
the ports v1 supersession (§9.2); the chokepoints v1 replay entry still fires daily and will fail
again on any future drift larger than the header tolerance — a product observation for the
scheduler (a replay tick that fails on clock semantics should say so in the readiness register,
which today shows it as a plain failed attempt).

### 9.9 What still depends on the grant text (§9.4 stands; added today)

* The whole `[2019-01-01, 2026-09-10)` window for `port1114` is now **held** (2,804 rows, twice) under
  the owner-reported permission. If the grant text limits historical depth, scope (which ports),
  retention or granularity, the held evidence outside the grant is withdrawn through the governed
  route and the backfill declaration narrowed on a v4 — not re-collected.
* The forward daily poll (30 rows, one request per day) is inside the permission request's own
  description ("new rows once per day"); any rate or volume condition in the grant is checked against
  it before the first tick after the text arrives.
* Attribution wording, permitted uses beyond `internal analysis`, any fee or agreement, and a
  preferred bulk endpoint for history: as §9.4; the chokepoints registration (§9.7) waits for the
  composite key, not for the grant text, since the same permission covers it.

### 9.10 State left on the demonstration after §9.6

| Source | Left as | Next |
|---|---|---|
| `imf-portwatch-ports` | **v3 live, active**, rights confirmed, LIVE; v1 and v2 superseded; the 2019→present walk held (with 2,133 second copies, §9.6.1); next tick 2026-09-11 16:35:30 UTC, a forward poll | the §9.6.1 P1 (serialised attempts; admission-time prior check) and a governed resolution of the duplicates; the grant text (§9.9) |
| `imf-portwatch-chokepoints` | v1 replay, active, rights confirmed; REPLAY; its daily replay tick fires at 06:57 UTC | the §9.7 acceptance item, then a v2 registration, approval and activation on `Daily_Chokepoints_Data` |

Unchanged: UN Comtrade deferred, key untouched; purchases zero; cadences and budgets as before; no
credential created or bound; GDELT held; the four live sources of §7 untouched; C15 and the required
checks remain the merge gates. No file other than this one was edited in this addition; nothing was
committed.
