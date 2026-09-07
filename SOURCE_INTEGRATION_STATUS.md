# THE EYE — Source integration status (2026-09-07)

> The real-world source register: every connector the platform has, every source contract it holds,
> what each source **is** right now (live, replay, operator upload) and what stands between it and
> live collection. Verified against the code on `phase5-twins` at the closed Phase 5 head, the
> replay fixtures under `fixtures/phase1/replay`, the demonstration database, and the local
> deployment's environment **by variable name only — no secret value was read, printed or copied**.
> §1–§6 describe the register as it stood before the owner's decision of 2026-09-07; §7 records what
> that decision changed on the demonstration deployment, act by act, with receipts. No credential was
> bound, nothing was purchased, and no request went to a publisher other than the governed
> collections §7 lists and the endpoint and terms verification it names.

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
| `imf-portwatch-chokepoints` | IMF PortWatch (with Oxford, World Bank, WTO) | rest | v1 replay, active | **pending** — the dataset's ArcGIS item points to the IMF general Copyright and Usage terms, which require permission for *systematic* downloading | none required | **BLOCKED — RIGHTS**: replay until the IMF answers | 69 (demo) | The owner sends `PHASE4_PORTWATCH_PERMISSION_REQUEST.md` (on #36, ready, **not sent**); on permission, a v2 live contract with the backfill the plan specifies (§4a: ordered pages, budget, idempotent re-walk, publication-lag freshness, in-place revisions as supersessions). Decision 1 of §14 stands. |
| `imf-portwatch-ports` | IMF PortWatch | rest | v1 replay, active | pending (same terms) | none required | **BLOCKED — RIGHTS** | 22 | Same request, same decision |
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
| — | PortWatch live | Decision 1: permission first; the request is drafted on #36 for the owner to send | — | — | not proposed until the IMF answers |

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
   revisions recorded as supersessions) — the same path ECB took.
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

PortWatch in replay pending written permission (the request is on #36 for the owner to send); UN
Comtrade deferred, key untouched; purchases zero; the automatic CorrectionApplied consumer deferred;
Phase 4 and Phase 5 functional reviews closed; C15 and the required downstream checks remain the
merge gates for #41, #42 and #43.
