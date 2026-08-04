# THE EYE — Phase 1 Plan: World Observation Layer (L1)

> Status: **AWAITING APPROVAL** — no code will be written until `APPROVED: PHASE 1` is received.
> Authority: Vol 0 → Vol 3 Ch.9/App.A (L1-C01…C09, L1-I01…I05) → Vol 4 Ch.31 → Vol 7 Ch.9–16 (ingestion, quarantine, raw preservation) → Vol 8 Ch.9/10/16 (WS-02) → corrected roadmap (agents introduced progressively).
> Foundation: everything rides the Phase 0 spine — commit pipeline, ABAC+POL, audit chains, canonical objects, outbox. No new path bypasses it.

---

## 1. Objectives

Give The Eye a measurable, governed field of view (Vol 3 Ch.9):

1. **Source Registry & Contracts** (L1-C01): sources register under explicit contracts — authority, rights, purpose, endpoint, schedule, freshness expectations, classification, correction behavior — with a governed lifecycle `draft → approved → active → suspended → retired` (SRC object type, Vol 4 App.C).
2. **Connector framework + three connectors** (L1-C02/C04): adapter SDK interface; **file upload** (PDF/DOCX/CSV), **RSS/news**, **generic REST poller**.
3. **Immutable raw preservation** (L1-C05/C06): content-addressed evidence vault behind an `EvidenceStore` port; OBS/EVD canonical objects with full chain of custody (source identity, acquisition method + connector version, event/observation time, content hash); original bytes never overwritten by anything downstream (DADR-003).
4. **Quarantine & intake validation** (L1-C07, DZ-03): collected content is untrusted until validated and admitted; fail closed.
5. **Source health & coverage** (L1-C08): freshness watermarks vs. contract, failure counts, coverage gaps; degraded sources visibly marked; `SourceHealthChanged` events.
6. **Correction & withdrawal intake** (L1-C09): source corrections create non-destructive new versions, an impact list, and a `CorrectionReceived` outbox event downstream.
7. **Bounded collection agents (progressive introduction)**: scheduler/poller runs execute under **agent workload principals** with declared capability grants, budgets, stop conditions, and escalation (Vol 3 Ch.23 contract subset — no models/LLM yet; Model Gateway is Phase 2). Agent identity appears in provenance and audit.
8. **WS-02 Observation Operations UI** (minimal): source registry with review-step registration, source-health view, evidence browser (custody + original payload retrieval), correction intake.

**Phase 1 acceptance (Master Build Prompt):** sources register under contract; evidence carries full chain of custody; a source correction emits a correction event downstream; a source-health view shows freshness and coverage.

## 2. Scope

**In:** the eight objectives above; `observation` module in the monolith; SRC/OBS/EVD payload schemas registered; new policy rules (`observation.*` actions) + `collection_manager` role (PER-11); BullMQ repeatable scheduling; outbox events `ObservationRecorded` / `SourceHealthChanged` / `CorrectionReceived` (L1-I03/I04/I05); acceptance suite extension + Phase Report.

**Out (later phases / exceptions):** L2 extraction & parsing of content (PDF/DOCX text extraction is Phase 2 — Phase 1 preserves raw bytes + metadata only); Model Gateway & any LLM use; satellite/social/CDC/streaming connectors; event streaming platform (BullMQ stays queue transport); malware **engine** integration (heuristic checks + quarantine only — recorded exception EXC-P1-001); Playwright UI automation.

## 3. Architecture decisions (proposed ADR-P1-01…06)

| # | Decision |
|---|---|
| P1-01 | **SRC/OBS/EVD as canonical objects** through the existing object service + commit pipeline; payload schemas registered in `objects.schema_registry` (SRC@v1: contract fields per Vol 7 Ch.9; OBS@v1: acquisition record per Vol 7 Ch.10; EVD@v1: custody + content metadata per Vol 7 Ch.12/28). Truth state `observed`; provenance = source contract ref + connector version. |
| P1-02 | **EvidenceStore port**: content-addressed blob store (path = `sha256/<digest>`), local filesystem volume in the local-dev profile; S3-compatible adapter slot for later profiles. Blob digest recorded in EVD `content_ref` + verified on read. Blobs are write-once (no overwrite API exists on the port). |
| P1-03 | **Quarantine before admission** (DZ-03→DZ-04): uploads/fetches land in `quarantine_items` (size/type/shape checks, heuristic scans); only explicit admission creates OBS+EVD via the pipeline; rejection preserves the intake case + sanitized audit. Fail closed on validator failure. |
| P1-04 | **Collection agents as workload principals**: `agent:observation.rss`, `agent:observation.rest`, registered as `agent`-kind principals with a `capability_grants` record (allowed source ids, max requests/run, max bytes/run, timeout, stop-on-N-failures, escalation → suspend source + SourceHealthChanged). Scheduler jobs authenticate as the agent principal through the standard pipeline — no ambient authority. Budget breach ⇒ stop + escalate (C-028). |
| P1-05 | **Source health as declared operational state** (not canonical evidence): `source_health` mutable table + append-only `collection_runs`; freshness computed against the SRC contract's declared cadence; states `healthy / stale / degraded / failed / suspended`, never silently healthy (ADR-0018). |
| P1-06 | **Corrections are cases + new versions**: `correction_cases` (intake, authority check, target versions, reason) → new EVD/OBS versions via `correction_of` + `CorrectionReceived` outbox event carrying the affected-object list (forward impact per Vol 3 Ch.21). |

## 4. Data model (new `observation` schema + registry entries)

- `observation.collection_runs` — append-only: run id, source object id, agent principal, connector + version, started/finished, status, items collected, bytes, checkpoint, error class, correlation id.
- `observation.source_health` — mutable operational state: source object id, state, last_success_at, last_error_at, consecutive_failures, freshness_deadline, updated_at (RLS tenant-scoped).
- `observation.quarantine_items` — intake cases: id, tenant/domain, source ref, filename/url, declared + sniffed content type, size, digest, checks (jsonb), status `pending/admitted/rejected`, reason.
- `observation.correction_cases` — id, source ref, target object versions, reason, authority, status, impact (jsonb), created/closed.
- Evidence blobs on the `eye-evidence` Docker volume (local profile).
- Canonical objects: SRC/OBS/EVD rows in `objects.canonical_objects` (existing machinery; no schema change).

## 5. Module structure

```
apps/api/src/observation/        # L1 module (imports pipeline only, per boundary matrix)
  sources.service.ts             # L1-C01 registry + lifecycle
  connectors/                    # L1-C02 adapter SDK + rss / rest-poller / upload adapters
  scheduler.service.ts           # L1-C03 BullMQ repeatable jobs as agent principals
  evidence.service.ts            # L1-C05/C06 vault port + custody
  quarantine.service.ts          # L1-C07 intake validation
  health.service.ts              # L1-C08 freshness/coverage
  corrections.service.ts         # L1-C09 correction intake + impact
  observation.controller.ts      # WS-02 endpoints (all via pipeline)
apps/web/app/admin/observation/  # WS-02 pages: sources, health, evidence, corrections
```

Boundary update: `observation: ['pipeline']` in the dependency-cruiser matrix.

## 6. New dependencies (proposed)

`fast-xml-parser` (RSS/Atom parsing — parse-only, feed metadata; content stays raw), `file-type` (content sniffing for quarantine checks). Both pinned; nothing else.

## 7. Milestones

| M | Deliverable | Demo |
|---|---|---|
| P1-M1 | Migration 0007 + SRC schema + source registry service/endpoints + `collection_manager` role + `observation.*` policy rules | Register source (draft→approved→active) with receipts; unapproved source refuses collection |
| P1-M2 | Evidence vault + quarantine + upload connector (PDF/DOCX/CSV) | Upload file → quarantine checks → admit → OBS+EVD with custody + digest; original bytes retrievable; reject path audited |
| P1-M3 | Adapter SDK + RSS + REST poller + scheduler under bounded agent principals | Feed poll creates evidence per item; budget breach stops the run + escalates |
| P1-M4 | Source health & coverage + `SourceHealthChanged` | Health view shows stale/failed sources vs contract cadence; suspension visible |
| P1-M5 | Correction intake + impact + `CorrectionReceived` | Source correction → new EVD version + downstream event with impact list |
| P1-M6 | WS-02 UI (sources, health, evidence browser, corrections) | Browser walkthrough |
| P1-M7 | Acceptance suite extension + seeds + Phase 1 Report | All Phase 1 criteria + Phase 0 regression green |

Estimated effort: **~1.5–2.5 weeks** focused build.

## 8. Test strategy

Unit (contract validation, freshness computation, adapter parsing with golden feed fixtures); integration (quarantine fail-closed, blob write-once, custody digest verification, agent budget enforcement, RLS on new tables); acceptance additions: the four master-prompt criteria + agent-bounded-execution evidence + Phase 0 regression (existing 21 must stay green).

## 9. Exceptions (proposed, full register entries on approval)

| ID | Exception | Expiry |
|---|---|---|
| EXC-P1-001 | Heuristic-only quarantine scanning (no AV/malware engine in local profile); compensating: strict type/size allowlists, no execution of content, quarantine isolation | 2026-12-31 / before first external deployment |
| EXC-P1-002 | Evidence vault on local filesystem volume (no independent object store); compensating: content-addressing + digest verification on read, write-once port | 2026-12-31 / with first multi-profile milestone |

## 10. Open questions (recommendations inline)

1. **Evidence volume location**: Docker named volume `eye-evidence` mounted into the API container (recommended) vs. bind mount `./data/evidence`?
2. **RSS parsing**: `fast-xml-parser` (recommended, small + pinned) acceptable as the first external parsing dependency?
3. Confirm **no content extraction** in Phase 1 (PDF/DOCX/CSV stored raw; text extraction starts Phase 2 with method lineage).
4. **Scheduler floor**: minimum polling interval 60s in local profile (recommended) — contracts may declare slower cadences only.

---

**Reply `APPROVED: PHASE 1` to begin building, or give corrections.**
