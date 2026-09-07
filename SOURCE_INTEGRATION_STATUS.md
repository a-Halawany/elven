# THE EYE — Source integration status (2026-09-07)

> The real-world source register: every connector the platform has, every source contract it holds,
> what each source **is** right now (live, replay, operator upload) and what stands between it and
> live collection. Verified against the code on `phase5-twins` at the closed Phase 5 head, the
> replay fixtures under `fixtures/phase1/replay`, the demonstration database, and the local
> deployment's environment **by variable name only — no secret value was read, printed or copied**.
> Nothing in this document activates a source, binds a credential, sends a request to a publisher or
> spends money.

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
| `eu-sanctions-rss` | European Commission, DG FISMA — Financial Sanctions Files | rss | v1 replay, active | confirmed — Commission Decision 2011/833/EU, reuse permitted with source acknowledgement | none required | **REPLAY** — rights resolved; live collection needs a **new source-use decision** (§4, proposal A) | 3 | A v2 live contract (drafted, §4), approved by a second operator, activated; hourly poll of the public feed |
| `eu-sanctions-payload` | European Commission, DG FISMA | rest | v1 replay, active | confirmed — Commission Decision 2011/833/EU | none required (a published URL parameter, not a credential; allow-listed for the secret scanner in #27) | **REPLAY** — as above | 4 | A v2 live contract (drafted, §4, proposal A), announced republications collected on the RSS signal |
| `worldbank-indicators` | The World Bank — Indicators API | rest | v1 replay, active | confirmed — CC-BY-4.0 | none required | **REPLAY** — rights resolved; live collection needs a **new source-use decision** (§4, proposal B); the readiness plan judged annual grain "adds nothing at a 30-day horizon" | 2 | A v2 live contract (drafted, §4), weekly poll; structural context, not a forecast driver |
| `gdelt-discovery` | The GDELT Project — DOC 2.0 | rest | v1 replay, active | recorded confirmed under "GDELT Project terms of use"; the readiness plan (§4) held it back for a lawful-collection and attention-signal design of its own | none required | **REPLAY** — held; not proposed for live collection now | 1 | A read of the terms by a person, a collection design, and a decision |
| `un-comtrade-upload` | UN Statistics Division — UN Comtrade | upload | v1 replay, active | confirmed for the manual export; automated use "UNVERIFIED — read the full policy before any redistribution claim" | the owner's free-tier key, **not configured here** | **OPERATOR UPLOAD**; automated access **deferred** by decision 3 of §14 | 1 | Only on the owner's decision: bind the key header-only through a credential path the product does not yet have (§6), then a v2 `rest` contract against the Comtrade Plus API; nothing is read, bound or activated by this document |
| `nordwerk-internal` | NORDWERK ANTRIEBSTECHNIK GmbH (**synthetic**) | upload | v1 replay, active | internal | operator session | **OPERATOR UPLOAD** — synthetic, marked at object level | 3 | not applicable |
| `carrier-advisories` | carriers and port authorities (**synthetic**) | upload | v1 replay, active | internal | operator session | **OPERATOR UPLOAD** — synthetic | 5 | not applicable |

**Paid sources: nothing is purchased, subscribed to or evaluated** (decision 4 of §14). A commercial
AIS or freight-rate feed remains a costed option in the readiness plan (§7), not a purchase.

**The forecast and synthetic-validation limitations are unchanged**: T1/T2 on ECB are retrospective,
T3 is unmeasured, the corridor replay cannot establish forecast quality, the twins are grounded on
synthetic records and say so, and the automatic CorrectionApplied consumer stays deferred.

## 4. New source-use decisions, made concrete — nothing activated

The owner's four decisions of 2026-09-05 (§14 of the readiness plan) cover PortWatch, ECB, UN
Comtrade and paid sources. **Two rights-confirmed public sources were never asked about**, because
the readiness plan concerned forecast drivers. Both are anonymous, free, contract-registered, served
by the connectors that exist, and carry terms a person has read. Going live with either is a change
of use — replay to systematic collection — and is put here as a proposal for the owner to decide,
with the exact contract that would be registered.

| # | Proposal | Terms, read at the source | What changes | What does not | Draft |
|---|---|---|---|---|---|
| **A** | **EU Financial Sanctions — live** (`eu-sanctions-rss` hourly, `eu-sanctions-payload` on the feed's republication signal) | Commission Decision 2011/833/EU: reuse permitted, source acknowledged; the publisher's own correction channel is the feed | v2 contracts declaring `live`, the forward endpoints, the attribution line, freshness 30 days; approved by a second operator; activated; the scheduler polls | No credential, no purchase, no new connector; the replay sets stay as fixtures; classification stays `internal` | `scripts/integrations/proposals/eu-sanctions-live.mjs` |
| **B** | **World Bank Indicators — live** (weekly) | CC-BY-4.0: attribution required; redistribution with attribution permitted | v2 contract declaring `live`, the same indicator endpoints, the CC-BY attribution line; weekly poll | Not a forecast driver (annual grain); structural context only; no credential | `scripts/integrations/proposals/worldbank-indicators-live.mjs` |
| — | GDELT | Held: the readiness plan asks for a lawful-collection and attention-signal design first | — | — | not proposed |
| — | UN Comtrade automated access | Decision 3: deferred, key untouched | — | — | not proposed; §6 states what it would take |
| — | PortWatch live | Decision 1: permission first; the request is drafted on #36 for the owner to send | — | — | not proposed until the IMF answers |

The drafts are validated by the product's own contract validator without being registered
(`node scripts/integrations/check-proposals.mjs`); registering, approving and activating them are
three governed acts by two operators, and none of them happens without the owner's decision.

## 5. What was implemented now, under the existing approvals

* **A readiness register** (`POST …/observation/sources/readiness`; `SourcesService.readiness`): every
  registered source with a verdict in the product's words — `live`, `live-unscheduled`, `replay`,
  `operator-upload`, `blocked-rights`, `blocked-credential`, `inactive` — the reason, the credential
  position, whether collection is scheduled and at what cadence, the last governed run (state, mode,
  finish time, admitted/quarantined/no-op counts, failure), the evidence objects held, and the
  latest recorded health verdict with its evaluation instant. Read from stored records alone; it
  activates nothing and consults no clock.
* **The Sources screen** shows the register: Status, Last governed run, Evidence and Health beside
  Mode and Rights, so an operator sees at list density what is real, what is replayed and what is
  blocked — and by what.
* **Regression**: `apps/api/test/int/phase5-source-readiness.test.ts` (a replay contract reads
  `replay`; a live contract with a scheduled agent reads `live`; an upload source reads
  `operator-upload`; a contract with `rights_state: pending` reads `blocked-rights`; the evidence
  count and the last run are the stored ones), and a browser check on the demonstration's register
  (`ecb-eurusd` LIVE, PortWatch BLOCKED — RIGHTS, the uploads OPERATOR UPLOAD).
* **The proposals** of §4 as validated draft contracts.

## 6. The implementation sequence from here

1. **Owner decisions on proposals A and B** (§4). On a yes: register v2 through the existing route,
   approve as the second operator, activate — three governed acts, each with its receipt; the
   scheduler polls; the register shows LIVE and the first governed run.
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
