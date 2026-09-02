# Phase 1 — Credentials, Subscriptions & Budget Matrix

> **No secret is requested, created, displayed or stored by this packet.** No registration has been
> performed. No payment is authorized. The €500 figure is a **ceiling**, not spending authority.
>
> **Phase 1 requires no OpenAI, Anthropic or other LLM key.** Semantic extraction is Phase 2.

---

## 1. The short answer

**Phase 1 can be built and demonstrated end to end for €0, with zero credentials.**

Every source on the deterministic demonstration path is anonymous HTTPS or an operator upload. The
one source that requires a key (UN Comtrade) enters as uploaded replay evidence instead, which costs
nothing and needs nothing.

| Bucket | Count | Cost |
|---|---|---|
| Required now | **0 credentials** | **€0** |
| Optional later, free registration | 1 (UN Comtrade) | €0 |
| Paid subscription | **0** | €0 |
| **Phase 1 total** | | **€0 of the €500 ceiling** |

---

## 2. Matrix

| Source | Status | Registration | Key | Cost | Secret name & scope | Owner action | Credential-free fallback |
|---|---|---|---|---|---|---|---|
| IMF PortWatch (S1, S2) | **Required now** | none | none | €0 | — | none | n/a — already keyless |
| EU sanctions RSS (S3) | **Required now** | none | none | €0 | — | none | n/a |
| EU sanctions CSV/XML (S4) | **Required now** | none | none¹ | €0 | — | none | n/a |
| ECB Data Portal (S5) | **Required now** | none | none | €0 | — | none | n/a |
| World Bank Indicators (S6) | **Required now** | none | none | €0 | — | none | n/a |
| GDELT DOC 2.0 (S8) | Optional (overlay) | none | none | €0 | — | none | drop the overlay |
| Synthetic company (S9) | **Required now** | none | none | €0 | — | none | n/a |
| Carrier/port advisories (S10) | **Required now** | none | none | €0 | — | owner supplies files | n/a |
| **UN Comtrade (S7)** | **Optional later** | free account | **yes** | €0 | `EYE_SRC_COMTRADE_KEY`, scoped to one source contract, header-only, never logged | *Only if you choose to*: create a free account, subscribe to "Free APIs", place the key in GitHub environment secrets. **Not needed for Phase 1.** | **Uploaded replay evidence (S7-replay)** — the recommended path |
| AISStream.io | **Not in Phase 1** | free account | yes | €0 | — | none | excluded: WebSocket streaming is cohort 4+ |
| Commercial AIS | **Not in Phase 1** | contract | yes | €€€ | — | none | excluded: PortWatch suffices |
| LLM providers | **Not in Phase 1** | — | — | — | — | **none** | n/a |

¹ The FSF download URL carries a **published** `token=dG9rZW4tMjAxNw` parameter, printed in the EU
Open Data Portal metadata and in the public RSS feed. It is **not a secret**: it is not issued to us,
not unique to us, and cannot be revoked for us. It is stored as part of the contract's endpoint URL,
never in the secret store — and because it is a URL query parameter, §8.1's URL-query redaction
covers it in logs, events and audit metadata.

---

## 3. Secret handling rules (restated, binding)

1. **No secret in chat, documentation, source files, or committed environment files.** This document
   contains no secret and no placeholder that looks like one.
2. If a source is later approved that needs a key, it is supplied **only** through the approved
   GitHub/environment secret mechanism, and the source contract stores a **credential reference**,
   never the value (PHASE1_PLAN §7, "credential reference (never the secret)").
3. Credential resolution failure is **fail-closed**: abort the run, never retry-storm (§7).
4. Secrets and URL query strings are redacted in logs, events and audit metadata (§8.1).
5. Phase 0's practice carries forward: credentials reach a process through the **environment only**,
   never argv.

---

## 4. Budget ledger against the €500 ceiling

| Line | Planned | Committed | Note |
|---|---|---|---|
| Data sources | €0 | €0 | All Phase 1 sources are free |
| API subscriptions | €0 | €0 | None |
| Infrastructure | €0 | €0 | Local Docker profile (EXC-P1-002) |
| LLM / model access | €0 | €0 | Not used in Phase 1 |
| **Total** | **€0** | **€0** | **€500 ceiling untouched** |

**Stop conditions.** Before *any* payment, or any registration creating a contractual obligation
(including free registrations that require accepting terms of service on the project's behalf), work
stops for explicit owner approval. This packet reaches none of those conditions.

---

## 5. Owner decisions on credentials

| # | Decision | Recommendation | If you disagree |
|---|---|---|---|
| C1 | Register a free UN Comtrade key for Phase 1? | **No.** Use `S7-replay` upload. Trade baselines are annual/monthly; a live poller adds nothing the demonstration uses, and it would put the only credential in the system for no gain. | Say so and I add it as a keyed contract with `EYE_SRC_COMTRADE_KEY`; you create the key, I never see it. |
| C2 | Include GDELT as a live overlay? | **Yes, marked observational.** It demonstrates that a low-authority source can be held without contaminating the record. | Drop it; the deterministic path is unaffected. |
| C3 | Evaluate AISStream as an overlay? | **No, not in Phase 1.** It needs a key *and* streaming ingestion that Phase 1 has no component for. Revisit at cohort 4. | Defer to backlog either way. |
| C4 | Confirm PortWatch and ECB reuse terms before go-live? | **Yes.** Both contracts stay `draft` with `rights_state: pending_confirmation` until the exact notice is read. Replay is unaffected. | — |
