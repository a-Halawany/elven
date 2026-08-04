# THE EYE — Phase 1 Plan: World Observation Layer (L1) — Revision 2

> Status: **AWAITING FINAL APPROVAL** — no Phase 1 application code until approval.
> Rev 2 incorporates gate-closure instructions D–L. Locked answers applied: named Docker volumes (quarantine + admitted separated); `fast-xml-parser` conditionally accepted under §8 controls; no semantic content extraction (transport framing with method lineage only); 60s scheduler floor with contract limits, jitter, concurrency caps, backoff, Retry-After.
> Honest scope: Phase 1 delivers the **first connector cohort** of the World Observation Layer — see [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md). It does not complete L1 or the source universe.

---

## 1. Objectives

1. Source Registry & Contracts (L1-C01) with full contract enforcement (§7).
2. Connector adapter SDK + cohort 1: file upload (PDF/DOCX/CSV), RSS/Atom, generic REST poller — hardened per §8.
3. Immutable raw preservation (L1-C05/C06): tenant-scoped evidence vault (§9), OBS/EVD canonical objects, full chain of custody.
4. Quarantine & intake validation (L1-C07) with the acquisition lifecycle of §5.
5. Source health & executable coverage model (L1-C08) per §6.
6. Correction & withdrawal intake (L1-C09) with honest propagation scope (§10).
7. Bounded collection agents — Observation / Crawler / Collection contracts (§11).
8. WS-02 Observation Operations UI **with Playwright acceptance coverage** (Playwright is in scope — it is now part of the standing regression gate).

## 2. Scope

**In:** objectives above; `observation` module; SRC/OBS/EVD schemas; `observation.*` policy rules + `collection_manager` role; BullMQ **Job Schedulers API** (`upsertJobScheduler` — not the deprecated repeatable-jobs API); outbox events `ObservationRecorded` / `SourceHealthChanged` / `CorrectionReceived`; WS-02 pages + Playwright specs; acceptance suite extension; Phase 1 Report.

**Out (honestly declared):** all source classes beyond cohort 1 (see coverage matrix); semantic content extraction of any kind (Phase 2 — Phase 1 performs only transport framing and safety validation, always with method lineage); Model Gateway/LLM; event-streaming platform; malware **engine** (EXC-P1-001); production storage architecture (EXC-P1-002); complete downstream impact resolution for corrections (graph/dependency consumers arrive Phase 3 — see §10).

## 3. Architecture decisions (ADR-P1-01…10, recorded on approval)

P1-01 SRC/OBS/EVD as canonical objects via the existing commit pipeline · P1-02 tenant-scoped evidence vault (§9) · P1-03 quarantine-before-admission with the §5 lifecycle · P1-04 bounded collection agents (§11) · P1-05 event-sourced observation state (§6) — immutable events + rebuildable projections · P1-06 correction cases with explicit unresolved-propagation scope (§10) · P1-07 connector hardening baseline (§8) · P1-08 parser isolation policy (§8.3) · P1-09 BullMQ Job Schedulers with jitter/backoff/concurrency caps · P1-10 RSS transport framing with method lineage (§10.1).

## 4. Data model (event-sourced — correction E)

Append-only tables never carry mutable completion state. Pattern: **immutable start records + append-only event/result records + rebuildable current-state projections** (projection tables are mutable, derived, and reconstructable from events — DADR-012).

- `observation.collection_run_events` — append-only: event id, run id, source object id, agent principal + version + code digest, connector + version, event (`run.started / item.fetched / item.quarantined / item.admitted / run.checkpointed / run.finished / run.failed / run.budget_exceeded / run.cancelled`), occurred_at, details (jsonb), correlation id. A run's start and finish are **separate events**.
- `observation.collection_runs_current` — mutable **projection** (status, counts, last checkpoint), rebuildable from events; rebuild test in CI.
- `observation.quarantine_events` — append-only case events (`case.opened / check.completed / case.admitted / case.rejected / case.expired`); `observation.quarantine_current` projection.
- `observation.correction_events` — append-only (`case.opened / authority.verified / versions.created / event.published / propagation.recorded / case.closed`); `observation.correction_current` projection.
- `observation.source_health_events` — append-only transitions with **calculation version + evidence references** (run events, coverage measurements) per transition; `observation.source_health_current` projection.
- `observation.coverage_measurements` — append-only executable coverage model (§6).
- Vault blobs per §9; SRC/OBS/EVD in `objects.canonical_objects`.

## 5. Acquisition lifecycle (correction D) — no external I/O inside DB transactions

1. **Authorize the scheduled collection attempt**: authenticate the agent principal (instance+version identity, §11); resolve scope; PDP evaluation.
2. **Persist POL/AUD authorization evidence** (own short transaction) + append `run.started`.
3. **Revalidate the exact active source-contract version** (again immediately before egress; suspended/retired ⇒ abort + revoke queued work).
4. **Bounded external acquisition** — outside any DB transaction; §8 network controls; per-run budgets enforced.
5. **Store exact original bytes in isolated quarantine storage** (quarantine volume; tenant-scoped opaque locator).
6. **Verify durable storage + content digest** (write, fsync, re-read, digest compare).
7. **Bounded validation/scanning** (type sniff, size/expansion limits, heuristics; parser isolation for feed framing).
8. **On admission: one atomic DB transaction** — copy-commit blob reference to admitted storage, OBS/EVD canonical versions + POL + AUD + outbox (`ObservationRecorded`).
9. **Advance the connector checkpoint only after commit succeeds** (checkpoint is a `run.checkpointed` event appended post-commit; a crash before this re-fetches — safe because admission is idempotent, step 12).
10. **Publish asynchronously after commit** (existing outbox publisher).
11. **Reconcile orphans**: a sweeper job (agent-principal, audited) finds quarantine blobs/cases older than TTL without admission or rejection and interrupted runs (`run.started` without terminal event beyond timeout) → appends `case.expired` / `run.failed(reason=interrupted)`; orphaned admitted-copy blobs without canonical rows are quarantined for investigation (never silently deleted).
12. **Idempotent retries**: acquisition idempotency key = (source id, contract version, item natural key or content digest); duplicate admission attempts detect the existing EVD by digest+source and no-op with an audit note; blob writes are create-if-absent.

**Crash/failure behavior per boundary:** before step 2 → nothing persisted; between 2–5 → run has `run.started` only, reconciled by sweeper; between 5–8 → quarantine blob + events exist, no canonical state; sweeper expires or an operator admits; during step 8 → transaction atomicity guarantees all-or-nothing; between 8–9 → re-fetch produces idempotent no-op; step 10 failure → outbox row stays pending (at-least-once).

## 6. Executable coverage model (correction E)

`observation.coverage_measurements` (append-only) computed per source per evaluation window by a versioned calculator (`coverage_calc_version`):

| Dimension | Definition |
|---|---|
| expected_coverage | Items/intervals promised by the contract cadence for the window |
| actual_coverage | Admitted evidence count / observed intervals |
| freshness | now − latest observation_time vs. contract freshness expectation |
| completeness | actual/expected ratio + missing-interval list |
| latency | acquisition→admission durations (p50/p95) |
| authenticity | share of items passing authenticity checks (TLS verification, digest, declared-source match) |
| correction_lag | correction case open→versions-created durations |
| blind_spots | declared contract scope minus observed scope (explicit list) |
| degraded_regions | regions/categories currently unavailable or degraded, with reason |

`SourceHealthChanged` events carry: prior→new state, `coverage_calc_version`, and **evidence references** (the coverage measurement ids + run event ids that justified the transition).

## 7. Source-contract enforcement (correction I)

SRC@v1 payload fields (all required unless N/A, validated at registration): scope + customer domain · owner · steward · authority + legal basis · rights/licence/robots policy + permitted use · purpose · data classification · residency/processing-location restrictions · retention + deletion obligations · **credential reference (never the secret)** · authentication + authenticity method · rate/concurrency/volume/cost budgets · expected schema/content · freshness + coverage expectations · correction/withdrawal channel · approval + separation-of-duties evidence (registrar ≠ approver) · version + effective period.

Enforcement points: the **exact contract version** is revalidated (a) before scheduling, (b) immediately before network egress, (c) at admission. Suspension/retirement immediately: removes the Job Scheduler entry, cancels queued jobs, revokes the agent capability grant rows for that source, and marks in-flight runs `run.cancelled`.

## 8. Connector hardening (corrections F, G)

### 8.1 Network controls (REST + RSS)
HTTPS only; per-contract scheme/host/port allowlist · resolve-then-connect with **private/loopback/link-local/cloud-metadata IP blocking** (checked against every resolved address) · DNS-rebinding protection (pin the vetted resolved IP for the connection) · redirects: max 3, each target revalidated against allowlist + IP rules · no credential forwarding across origins (auth headers stripped on host change) · TLS certificate verification always on · egress only through the connector runtime (registered egress; no generic internet access) · request/response/decompressed-byte limits (contract-bounded, hard caps) · timeouts, circuit breaker per source, per-source + global concurrency caps · `Retry-After` honored; exponential backoff + jitter · pagination/cursor handling bounded (max pages/run) · conditional requests (`ETag`, `If-Modified-Since`) with checkpoint recovery · idempotent retries per §5.12 · secrets + URL query strings redacted in logs, events, and audit metadata.

### 8.2 Content controls (upload + fetched payloads)
ZIP/DOCX expansion limits (total bytes, per-entry bytes, entry count) + **path-traversal rejection** (DOCX inspected as archive for safety only — no content extraction) · PDF: stored as opaque bytes; never parsed/rendered in Phase 1; flagged `active_content_risk` when JS/embedded-file markers are sniffed · filename normalization (strip paths, control chars, unicode confusables policy) · CSV: encoding detection recorded + **formula-risk classification** (`=`, `+`, `-`, `@` prefixes flagged; never evaluated) · declared vs sniffed type recorded (`file-type` is a **best-effort content hint only — not malware detection, not format validation, not proof of safety**) · malicious-input fixture corpus in CI (zip bombs, traversal names, oversized entries, spoofed types, formula CSVs, malformed feeds).

### 8.3 Parser policy (fast-xml-parser)
Exact latest patched version **≥ 5.7.0 pinned**; DTD + entity processing disabled; input size, depth, entity and execution-time budgets; parsing runs in an **isolated worker thread with memory + timeout limits** (kill on breach → item quarantined); malicious XML fixtures (billion-laughs-style structures, deep nesting, huge attributes) in CI; SBOM + vulnerability gates remain blocking for it.

## 9. Evidence-vault isolation (correction H)

- **Locators are tenant/domain-scoped and opaque**: `<tenant>/<domain>/<vault-uuid>` (vault-uuid random, not the digest) — no global digest namespace, **no cross-tenant deduplication, no existence disclosure** (digest lookups scoped per domain only).
- **Separate named Docker volumes** (local profile — explicitly NOT the production storage architecture): `eye-quarantine` and `eye-evidence`; admission copies quarantine→admitted then tombstones the quarantine entry.
- Atomic create-if-absent writes (temp file + `link`/rename, fail on exists); digest verified **before and after** storage and on every read.
- Every retrieval is a consequential read: POL/AUD durable **before** bytes are returned; authorization on each retrieval.
- Blob metadata carries classification, residency, retention, legal-hold fields (from the SRC contract + admission decision).
- Governed deletion: tombstone semantics via the canonical machinery; blob removal only through a governed lifecycle action producing `DeletionVerified`-style evidence (full workflow Phase 3; tombstone slots now).
- Downloads are attachment-only (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, sandboxed origin); untrusted originals are **never rendered inline**.

## 10. RSS framing & correction honesty (correction J)

### 10.1 Transport framing (not semantic extraction)
Each raw HTTP/feed response is preserved as an immutable EVD (the parent). Per-item EVDs are **bounded transport framing**, each carrying: `method_ref = rss-framing@<parser version>`, exact byte/fragment reference into the parent (offsets or canonical item index), `source_object_ids = [parent EVD]`, and deterministic framing fixtures in CI (same bytes ⇒ same frames). No semantic interpretation is performed or claimed.

### 10.2 Correction propagation honesty
`CorrectionReceived` events list **directly known** affected objects (the EVD/OBS versions derived from the corrected source items) and carry an explicit `propagation_scope: { resolved: [...], unresolved: 'downstream consumers not yet present (KG/dependency graph arrives Phase 3)' }`. No completeness claim is made. Tests cover: correction, withdrawal, supersession, replay of a correction case, **spoofed correction rejection** (authority check against the contract's correction channel), and propagation-failure handling (event publish failure ⇒ case stays open).

## 11. Agent contracts (correction K)

Three explicit contracts (not generic connector labels), each a registered `agent`-kind principal:

| Contract | Purpose | Phase 1 instances |
|---|---|---|
| **Observation Agent** | Scheduled acquisition from approved feed/API sources | `agent:observation.rss@<ver>`, `agent:observation.rest@<ver>` |
| **Crawler Agent** | Link-following acquisition | **Contract defined; no instance in Phase 1** (no crawling in cohort 1) |
| **Collection Agent** | Operator-initiated intake (uploads, manual imports) | `agent:collection.upload@<ver>` |

Each agent identity is: **instance- and version-specific** (principal display name embeds semver; new version ⇒ new principal), **tenant/domain-bound** (grant rows scoped per source contract), linked to an **accountable human owner** (owner principal id in the agent record), linked to **source-contract version + code digest** (recorded on every `run.started`), **reauthorized at execution time** (full pipeline auth per run — queued jobs carry no authority), **revocable while queued** (grant revocation checked at run start), and budgeted (**requests, bytes, cost units, concurrency, timeout, retries** per run + per window; breach ⇒ `run.budget_exceeded` + stop + escalation via `SourceHealthChanged`).

## 12. Milestones

| M | Deliverable |
|---|---|
| P1-M1 | Migration 0008 (observation event tables + projections + RLS), SRC schema + registry + contract enforcement, `collection_manager` role, policy rules |
| P1-M2 | Evidence vault (tenant-scoped, dual volumes, create-if-absent, digest verify) + quarantine lifecycle + upload connector + content controls (§8.2) |
| P1-M3 | Adapter SDK + RSS (framing §10.1, parser isolation §8.3) + REST poller + network hardening (§8.1) + Job Schedulers + agent contracts (§11) |
| P1-M4 | Coverage model + health events/projection + `SourceHealthChanged` + sweeper/reconciliation (§5.11) |
| P1-M5 | Correction intake (§10.2) + `CorrectionReceived` |
| P1-M6 | WS-02 UI + **Playwright specs** (register source w/ review; health view; evidence browser + safe download; correction intake; quarantine queue) |
| P1-M7 | Acceptance extension (matrix below) + malicious-input corpus + Phase 0 regression (API 21 + Playwright 10) + Phase 1 Report |

Estimated effort: **~2.5–3.5 weeks** (hardening + event-sourcing + Playwright added vs. Rev 1).

## 13. Acceptance matrix (revised)

| # | Criterion | Evidence type |
|---|---|---|
| A1 | Source registers under full contract (§7 fields); registrar ≠ approver enforced; unapproved/suspended source refuses scheduling, egress, and admission (3 enforcement points) | API + integration tests |
| A2 | Evidence carries full chain of custody: source identity, acquisition method + connector version + agent identity/code digest, event/observation time, digest verified pre/post storage; original bytes retrievable byte-identical; POL/AUD before retrieval | Integration + acceptance |
| A3 | Acquisition lifecycle: no external I/O inside DB transactions (asserted structurally); crash-boundary tests (kill between steps 5–8, 8–9) leave no partial canonical state; sweeper reconciles orphans; retries idempotent (no duplicate EVD) | Fault-injection integration |
| A4 | Coverage model executable: all 9 dimensions computed; `SourceHealthChanged` carries calc version + evidence refs; degraded never shown healthy | Unit + integration + UI |
| A5 | Correction: non-destructive versions, spoofed-correction rejection, explicit unresolved propagation scope, case replay | Integration + acceptance |
| A6 | Connector hardening: SSRF corpus (private/loopback/metadata IPs, rebinding, redirect escape) blocked; limits enforced (bytes, zip expansion, depth); parser isolation kills hostile XML; secrets redacted | Malicious-fixture suite |
| A7 | Agents: per-run reauthorization; revocation while queued honored; budget breach stops + escalates; agent identity + code digest in provenance | Integration |
| A8 | Event-sourced state: projections rebuild from events byte-equal | Integration |
| A9 | WS-02 journeys pass in **Playwright**; Phase 0 Playwright suite (10 scenarios) stays green | Playwright in CI |
| A10 | Phase 0 regression: 21-test acceptance + all unit/integration suites green; no constitutional invariant weakened | Full CI |

## 14. Exceptions — fully populated

### EXC-P1-001 — Heuristic-only quarantine scanning (no malware engine)

```yaml
exception_id:            EXC-P1-001
requirement_ids:         [Vol3 Ch.9 (malware inspection component L1-C07), IA-*-quarantine, DP-16-001]
invariant_ids:           []   # inspection capability deferred; no constitutional semantic waived
title:                   Quarantine performs structural/heuristic checks only; no AV/malware engine integrated in the local profile
owner:                   Founding engineer (this project)
approver:                Project owner (pending PHASE 1 approval)
reason:                  No AV engine is available in the local Compose profile; content is never executed, parsed semantically, or rendered in Phase 1.
risk:                    HONEST STATEMENT — malicious payloads may pass heuristic checks undetected and rest in the evidence vault. Bounded because Phase 1 never executes, extracts, or inline-renders content, and downloads are attachment-only from a sandboxed path.
consequence_class:       C2
affected_profiles:       [local-dev]
compensating_controls:
  - Strict type/size allowlists; declared-vs-sniffed type recording; expansion limits; path-traversal rejection
  - No content execution/extraction/inline rendering anywhere in Phase 1
  - Quarantine isolation volume; admission is an explicit audited decision
  - Malicious-input fixture corpus in CI
prohibited_exposure:     No external deployment; no real customer data; NO claim of malware safety; no production claims; no deployment-parity claims for scanning
expiry_date:             2026-12-31
expiry_milestone:        Before first external deployment
exit_criteria:           Pluggable scanning engine integrated + quarantine verdicts recorded as evidence
required_evidence:       Engine integration tests; verdict audit records; corpus pass results
status:                  proposed (opens on PHASE 1 approval)
```

### EXC-P1-002 — Evidence vault on local Docker volumes

```yaml
exception_id:            EXC-P1-002
requirement_ids:         [DP-28 (object/evidence storage), IA-33, SC-02/DZ-04 durability expectations]
invariant_ids:           [C-043 (durability risk bounded; semantics not waived)]
title:                   Evidence vault on local named Docker volumes (eye-quarantine + eye-evidence); no independent replicated object store
owner:                   Founding engineer (this project)
approver:                Project owner (pending PHASE 1 approval)
reason:                  Local-dev is the only profile; volumes explicitly do NOT define the production storage architecture.
risk:                    HONEST STATEMENT — evidence durability depends on a single host filesystem; loss of the volume loses raw evidence bytes (canonical metadata + digests survive in Postgres, proving what existed but not its content).
consequence_class:       C2
affected_profiles:       [local-dev]
compensating_controls:
  - Content digests recorded in canonical EVD rows; verification pre/post storage and on read
  - Tenant/domain-scoped opaque locators; no cross-tenant dedup/existence disclosure
  - Create-if-absent atomic writes; separate quarantine/admitted volumes
prohibited_exposure:     No external deployment; no real customer data; no production claims; no durability/deployment-parity claims
expiry_date:             2026-12-31
expiry_milestone:        First multi-profile milestone
exit_criteria:           EvidenceStore adapter for a replicated object store + restore/reconciliation exercise
required_evidence:       Cross-store round-trip + digest verification + recovery exercise records
status:                  proposed (opens on PHASE 1 approval)
```

## 15. Open items — none

All four previously open questions are closed by the locked answers. Playwright is **in scope** (removed from out-of-scope; WS-02 ships with browser acceptance).

---

**Awaiting `APPROVED: PHASE 1`.**
