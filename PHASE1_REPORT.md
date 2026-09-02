# THE EYE — Phase 1 Report: L1 World Observation Layer

> Status: **IMPLEMENTED — awaiting owner review.** Built from `main` after the documentation-only Build Packet merged (PR #26), on branch `phase1-implementation`.
> Plan: [PHASE1_PLAN.md](PHASE1_PLAN.md) (Revision 5) · Packet: [PHASE1_BUILD_PACKET.md](PHASE1_BUILD_PACKET.md) · Scope register: [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md) · Exceptions: [EXCEPTIONS.md](EXCEPTIONS.md) · Log: [PROGRESS.md](PROGRESS.md)

Phase 1 makes the platform **observe the world and be able to prove what it observed**: where a fact came from, who authorised its collection, what bytes actually arrived, what has not been observed at all, and what the platform does *not* know. It does not interpret anything — extraction, entities, prediction and decisions are Phases 2–6, and this phase deliberately refuses to imply them.

---

## 1. What was built

| Area | Delivered |
|---|---|
| **Schema** | Migration `0022` (2,346 lines): source-contract events + `source_contracts_current`, agents, collection runs, acquisition attempts, blob manifests + tombstones, custody, quarantine, coverage/health, corrections, checkpoints/scheduler — every table with the scope triple NOT NULL, CHECK-constrained, under `FORCE ROW LEVEL SECURITY`, written **only** through SECURITY DEFINER ports that assert the caller's own action. PLATFORM authority deliberately cannot read observation state. |
| **Source contracts (§7)** | Full field set; registrar ≠ approver enforced by a table constraint, not by code; three revalidation points including the transactionally protected admission re-read under `FOR SHARE`; nine fail-closed refusals (expiry, revocation, version incompatibility, rights, purpose, residency, classification, invalid credentials, schema drift); HTTPS-only; a 60-second polling floor; framing declared all-or-nothing. |
| **Acquisition lifecycle (§5)** | The twelve steps, with **no external I/O inside any database transaction** (asserted structurally, not by review); the filesystem copy is never part of the transaction; step 12 separates *attempt idempotency* from *evidence identity* — a content digest is the identity of BYTES, never of an observation. |
| **Evidence vault (§9)** | Two separate, non-nested roots verified at service construction; opaque `<tenant>/<domain>/<uuid>` locators (never the digest, so the store is not an existence oracle); digest verified pre-store, post-store and on every read; retrieval resolves through the manifest only. |
| **Connectors (cohort 1)** | PDF/DOCX/CSV upload; RSS/Atom (worker-thread parser isolation with depth/byte/time budgets, DTD and entity processing disabled); governed generic REST poller with contract-declared framing. Network hardening: resolve-then-connect with the pinned address, private/loopback/link-local/metadata refusal, redirect-escape refusal, and **complete-origin** credential stripping (scheme **or** host **or** port). |
| **Agents (§11)** | Instance- and version-specific principals bound to a code digest and an accountable human owner; per-run reauthorization; revocable while queued; budgets that stop and escalate; instance-mismatch and digest-mismatch refusals. |
| **Coverage & health (§6)** | Nine dimensions with stored `evaluated_at`, window, denominator, universe version, calculation version and evidence refs; the states `measured / unknown / indeterminate / not_applicable / insufficient_evidence`; **`unknown` is never healthy**; publisher lag and collection failure are separate diagnoses; the health timeline replays deterministically from stored events. |
| **Quarantine, corrections, withdrawal (§10)** | Heuristic intake refusal with an audited two-operator release; correction and withdrawal that **supersede without overwriting**; a withdrawn object says so in its truth state, not only its lifecycle; every case records, in words, what it did **not** resolve. |
| **Operations UI (WS-02)** | Sources (register → approve → activate), evidence browser with custody and the four times, quarantine queue, corrections, and an overview — receipts only from authoritative responses, state never carried by colour alone, safe attachment-only retrieval, RTL-mirrored, keyboard-operable. |
| **Demonstration** | The locked *72-Hour Corridor Decision*: 10 source contracts, a synthetic manufacturer, and a frozen replay set driven entirely over the real HTTP API with real governed envelopes. |

## 2. How to run and demo

```bash
./scripts/demo.sh
```

Then, with the API on `:3401` and the shell on `:3000`:

```bash
node scripts/phase1/seed-demo.mjs
```

The seed is idempotent and has **no back door** — every step is a request an operator could make, so a green run is itself evidence that the operator journey works. Its final state:

```
sources 10 · active 10 · draft 0 · unconfirmed rights 3
evidence objects 105 · open quarantine 1 · open corrections 0
replay share: 100% by object · 100% by bytes
```

Sign in as **m.dvorak** (collection manager) or **a.hoffmann** (observation operator) and walk the journey the way the storyboard scripts it: register a source → have a *second* operator approve and activate it → collect → inspect the evidence, its custody chain and its four times → see the drifted row sitting in quarantine and release it with a reason → evaluate coverage and read the gap it refuses to round away → correct a row and watch the prior version stay retrievable → run a known-at query that reproduces what was known before the correction.

**No credentials were requested, purchased or registered for this phase.** Every connector was implemented and exercised against the frozen replay set and fixtures; no UN Comtrade account, LLM key, AIS subscription, cloud subscription or confidential company data was used, and expenditure is €0.

## 3. Test results

| Suite | Result |
|---|---|
| `packages/contracts` (canonicalization, envelope, header registry, audit digests) | 203/203 |
| `packages/tokens` | 3/3 |
| API hermetic (unit + gate + supply-chain runner behaviour) | 2034/2034 |
| **API integration** (Phase 0 isolation/adversarial/audit + **Phase 1 A1–A3, A5–A11**) | **470/470** |
| Phase 0 acceptance (15 criteria + §7.2 request paths) | 58/58 |
| **Browser (Playwright)** — Phase 0 ten + **Phase 1 A12 sixteen** | **26/26** |

The Phase 1 integration additions are three files: the acceptance matrix (46 tests), fault injection (43 tests, F01–F46 plus the structural no-I/O-in-transaction assertion) and hostile input (84 tests). The integration baseline entering this phase was 297.

Browser-verified live against the seeded demonstration: sign-in, overview, source registration and approval by a second operator, collection, evidence detail with custody, a quarantine release with its receipt, and the full coverage panel.

## 4. Acceptance matrix — evidence map

| # | Criterion | Evidence |
|---|---|---|
| A1 | Source contract: full §7 field set; registrar ≠ approver; 3-point revalidation; every fail-closed case | `phase1-acceptance` A1 (6) — the nine §7 refusals are table-driven, each asserting the *reason*, not merely a rejection |
| A2 | Chain of custody; digest pre/post/on-read; byte-identical retrieval | `phase1-acceptance` A2 (3) — every admission custody row carries source, method, connector version, agent identity and code digest |
| A3 | Four-time conformance; known-at over OBS/EVD | `phase1-acceptance` A2/A3 — framed children carry the publisher's own time; framing parents legitimately carry none; Phase 1 asserts no validity interval it cannot know |
| A4 | No external I/O inside a transaction; fault injection at **every** §5.13 step and durable sub-boundary; sweeper recovery; replay no-op vs. new-observation-at-later-time | `phase1-fault-injection` (43) — F01–F46 including 8e's seven individual durable writes, plus a structural assertion that no egress call can occur inside a transaction |
| A5 | Isolation across API, direct SQL, worker scope tampering, replayed jobs, outbox, blob retrieval, existence/timing | `phase1-acceptance` A5 (6) — RLS denies the application role under the wrong context, and refusals are worded identically whether the object is foreign or absent |
| A6 | Coverage/health with full measurement metadata; unknown never healthy; deterministic replay | `phase1-acceptance` A6 (6) + browser 5, 6 — the planted gap surfaces as *insufficient evidence*, not as a rounded percentage |
| A7 | Vault: missing and corrupt reads fail closed; denied retrieval leaks nothing; quarantine/admitted separation | `phase1-acceptance` A7 (6) |
| A8 | Correction, withdrawal, supersession, historical preservation, spoofed-correction rejection, propagation-failure handling | `phase1-acceptance` A8 (6) + browser 9, 10 — a spoofed claim over another domain's evidence resolves nothing and is refused in the same words as one that never existed |
| A9 | Agents: per-run reauthorization, revocation while queued, budget breach, instance and digest mismatch | `phase1-acceptance` A9 (6) |
| A10 | Hostile input: SSRF corpus, parser limits, complete-origin credential stripping, redaction | `phase1-hostile-input` (84) across eight groups incl. the ZIP central-directory reader itself |
| A11 | Every projection rebuilds from its events, byte-equal | `phase1-acceptance` A11 (2) + browser 15 |
| A12 | WS-02 journeys incl. accessibility, safe downloads, non-disclosure on denied views; Phase 0's ten stay green | `e2e/phase1-observation.spec.ts` (16) + Phase 0 (10) = 26/26 |
| A13 | Phase 0 regression; no constitutional invariant weakened | Full local CI-equivalent run: contracts 203, tokens 3, API hermetic 2034, integration 470, acceptance 58, browser 26 |

## 5. Defects found and fixed during implementation

Found by the suites and by driving the product, and fixed in place — the plan's instruction was to correct and continue rather than freeze a new review SHA per bug. The ones that changed behaviour:

**Governance and capability binding**
1. `objects.admit_version` admitted only `objects.create`/`objects.correct`; re-emitted with a table-driven action list that also pins object types per action (narrower than before, not wider).
2. Gate-2.2 C6 binds **one** writable target, but §5 step 8e must write OBS **and** EVD atomically. Resolved by a signed, bounded (≤32), all-UUID **declared target set** rather than by relaxing the binding.
3. Pre-flight reads issued outside a governed context returned nothing under RLS (they were invisible, not denied) — converted to consequential reads throughout the lifecycle, orchestrator and sweeper.
4. Deliberate port refusals surfaced as HTTP 500; SQLSTATE-gated mapping now gives honest answers, while unrecognised errors still fail as 500.
5. `agent_instance_unique` omitted `source_id`, so a second source with the same connector collided.
6. `collection_agent` could not read its own contract; granted `observation.read` while remaining excluded from `observation.evidence.retrieve`.
7. Agent provisioning needed tenant-admin authority; the seed provisions as platform admin while the accountable owner stays the operator.

**Vault and evidence**
8. `VaultService.contains()` had a clause that was always false, so every store refused with "vault integrity (scope)".
9. Vault and replay roots resolved against the process CWD instead of the workspace root.
10. The orphan sweeper read manifests without a context and reported 203 false orphans.

**Honesty of the measurements — the substantive ones**
11. Coverage bucketed by **record** time and pooled all series together. Rewritten to place observations by the publisher's own `event_time` and to measure `(series, interval)` pairs. This is what makes the planted gap visible as *"3 of 63 expected series-intervals carry no admitted evidence"* instead of a healthy-looking average.
12. Health could report healthy while completeness was unknown; the collection-dimension roll-up now constrains decision use.
13. Freshness was contaminated by framing parents (which carry no publisher time); it is now measured on publisher-timed items whenever any exist.
14. Unconfirmed rights blocked **replay** as well as live collection; refined to block live acquisition only, per the packet's own rationale.
15. Replay fixtures presented reconstructed days as verified figures; each row now carries its own `data_provenance` and the manifest says so.
16. A denominator derivation was displayed where there is no denominator.

**Connectors and correctness**
17. REST item keys collapsed endpoints differing only by query string, and framed children collided across chokepoints — the key now includes the hashed query and child keys are parent-prefixed.
18. Framing by re-serialise-and-search failed on indented JSON; replaced with a string/escape-aware `arrayElementSpans()` tokenizer.
19. `record_manifest` did not serve `observation.quarantine.review`, though releasing quarantine writes an evidence manifest.
20. `applyCorrection` wrote objects it had not declared; it now resolves in a prior governed read, declares, batches at 32, and closes the case only on the last batch.
21. The evidence list returned every version instead of the current one per object.
22. The schedule was not synced when an agent was registered after activation.
23. `/v1/me` was routed to commit authority instead of identity.
24. The registration form could not express framing (item path, key, time). Found only after tightening a loose browser assertion that had been passing on a run which admitted **zero** items — the test, not the product, was the first defect there.

**Gate**
25. `gitleaks` flagged the packet's own published FSF `token=` URL parameter. Allowlisted narrowly for that one literal, recorded in `governed_exclusions`, and shipped as a separate PR (#27) so the packet stayed documentation-only.

Test-side corrections (the test was wrong and the product right) are recorded in the suites themselves, each with the reason stated at the assertion.

## 6. Deviations from plan (with reasons)

| Plan | Delivered | Reason |
|---|---|---|
| Migration `0013` | Migration `0022` | 0011–0021 were consumed by the Gate-2.1/2.2 authority-boundary and C18 closures. Numbering only. |
| `fast-xml-parser@5.10.1` | `5.11.1` | 5.10.1 no longer resolves; the pin is exact and `PARSER_VERSION` is recorded in every RSS method ref. |
| C6 single writable target | Declared bounded target **set** (≤32, all-UUID, signed) | §5 step 8e must write OBS and EVD in one transaction. The single-target case is unchanged; the set is a strict, bounded extension rather than a relaxation. |
| A8 in the acceptance suite | Added during closing review | The suite's header claimed A8 while no A8 block existed; six tests were added to cover correction, withdrawal, supersession, preservation, spoofing and propagation failure. |

## 7. Carried risks and honest limits

* **Scope**: cohort 1 only — 1 source class substantially covered, 4 partially, 15 not implemented. C-013 architectural extensibility is designed for but **not yet demonstrated or accepted**. See [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md).
* **EXC-P1-001** (heuristic-only quarantine scanning; no malware engine) and **EXC-P1-002** (evidence vault on local Docker volumes) are now `open` in [EXCEPTIONS.md](EXCEPTIONS.md). Both prohibit external deployment, real customer data, production claims, and any unqualified malware-safety or deployment-parity claim.
* **Source reuse terms for PortWatch and ECB remain UNVERIFIED** and are marked as such in the manifests. Nothing in this phase represents those contracts as approved, and no data is redistributed beyond what verified terms permit.
* **Content authenticity is `unknown` for every source in this phase.** Transport authenticity, publisher identity, byte integrity and content authenticity are recorded as four separate concepts and never conflated.
* **Propagation is unresolved by construction**: Phase 1 has no dependency graph, so every correction case states *"downstream consumers not yet present (KG/dependency graph arrives Phase 3)"* rather than implying a propagation it cannot perform.
* The demonstration's decision clock is exactly **72 hours**; any wider January 11–15 series is supporting context only.

## 8. Interfaces preserved for later phases

Extraction (Phase 2) consumes OBS/EVD through the canonical object store and the outbox, not through connector internals; the connector SDK, source-contract model and evidence vault admit further cohorts without architectural rework; agent contracts, budgets and per-run reauthorization are already the shape Phase 7 needs. What is *not* claimed is that this has been demonstrated across materially different source classes — that is the C-013 evidence still outstanding.
