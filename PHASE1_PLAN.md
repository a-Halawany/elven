# THE EYE — Phase 1 Plan: World Observation Layer (L1) — Revision 3

> Status: **AWAITING FINAL APPROVAL** — no Phase 1 application code until approval.
> Rev 3 applies gate-review corrections A–F (scope/isolation, admission protocol, coverage semantics, source contracts, acceptance coverage, exceptions/coverage claims). No architectural redesign; the frozen architecture, roadmap, and locked answers stand.
> Honest scope: Phase 1 delivers the **first connector cohort** of L1 — see [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md). It does not complete L1 or the source universe.

---

## 1. Objectives

1. Source Registry & Contracts (L1-C01) with full contract enforcement (§7).
2. Connector adapter SDK + cohort 1: file upload (PDF/DOCX/CSV), RSS/Atom, generic REST poller — hardened per §8.
3. Immutable raw preservation (L1-C05/C06): tenant-scoped evidence vault (§9), OBS/EVD canonical objects, full chain of custody.
4. Quarantine & intake validation (L1-C07) with the acquisition lifecycle of §5.
5. Source health & executable coverage model (L1-C08) per §6.
6. Correction & withdrawal intake (L1-C09) with honest propagation scope (§10).
7. Bounded collection agents — Observation / Crawler / Collection contracts (§11).
8. WS-02 Observation Operations UI with Playwright acceptance coverage (part of the standing regression gate).

## 2. Scope

**In:** objectives above; `observation` module; SRC/OBS/EVD schemas; `observation.*` policy rules + `collection_manager` role; BullMQ **Job Schedulers API** (`upsertJobScheduler`); outbox events `ObservationRecorded` / `SourceHealthChanged` / `CorrectionReceived`; WS-02 pages + Playwright specs; acceptance-suite extension (§13); Phase 1 Report.

**Out (honestly declared):** all source classes beyond cohort 1; semantic content extraction of any kind (Phase 2 — Phase 1 performs only transport framing and safety validation, always with method lineage); Model Gateway/LLM; event-streaming platform; malware **engine** (EXC-P1-001); production storage architecture (EXC-P1-002); complete downstream impact resolution for corrections (§10.2).

## 3. Architecture decisions (ADR-P1-01…10, recorded on approval)

P1-01 SRC/OBS/EVD as canonical objects via the existing commit pipeline · P1-02 tenant-scoped evidence vault (§9) · P1-03 quarantine-before-admission with the §5 lifecycle · P1-04 bounded collection agents (§11) · P1-05 event-sourced observation state (§4) · P1-06 correction cases with explicit unresolved-propagation scope (§10) · P1-07 connector hardening baseline (§8) · P1-08 parser resource-isolation policy (§8.3) · P1-09 BullMQ Job Schedulers with jitter/backoff/concurrency caps · P1-10 RSS transport framing with method lineage (§10.1).

## 4. Data model — event-sourced, scope-mandatory (correction A)

**Universal scope rule:** every event row, projection row, checkpoint, queue job, scheduler record, blob manifest, quarantine case, correction case, coverage measurement, and outbox envelope carries **immutable, non-null `scope` + `tenant_id` + `domain_id` fields as applicable to its scope class** (NOT NULL enforced by CHECK constraints mirroring the Phase 0 scope-consistency constraints). Scope values are populated **only from the authenticated principal + trusted routing** at the pipeline boundary — never from client payloads.

**Isolation independent of PostgreSQL RLS:**
- *Redis/BullMQ*: queue names and Job Scheduler ids are scope-prefixed (`obs:{tenant}:{domain}:…`); every job payload carries the scope triple, and **workers re-resolve and re-authorize scope from the job's agent principal + source-contract reference at execution time** — a replayed or tampered job whose payload scope disagrees with the contract's registered scope is rejected and quarantined (fail closed, audited). Queue payloads may carry **scoped opaque identifiers, the exact source-contract version, correlation id, idempotency key, and budgets — never credentials, secrets, or delegated authority** (credential references resolve server-side at execution under the agent's grant).
- *Filesystem blobs*: locator paths embed the tenant/domain segments (§9); the vault port validates the requester's resolved scope against the locator's scope segments on **every** read/write, independent of any database check.

Append-only tables never carry mutable completion state (pattern: immutable start records + append-only event/result records + rebuildable projections; projections are derived, mutable, reconstructable — with CI rebuild tests):

- `observation.collection_run_events` — append-only: event id, **scope triple**, run id, source object id, agent principal + version + code digest, connector + version, event (`run.started / item.fetched / item.quarantined / item.admitted / run.checkpointed / run.finished / run.failed / run.budget_exceeded / run.cancelled`), occurred_at, details, correlation id.
- `observation.collection_runs_current` — rebuildable projection.
- `observation.quarantine_events` / `observation.quarantine_current` — case lifecycle (`case.opened / check.completed / case.admitted / case.rejected / case.expired`).
- `observation.correction_events` / `observation.correction_current`.
- `observation.source_health_events` — append-only transitions (fields per §6).
- `observation.coverage_measurements` — append-only (§6).
- Blob manifests (§9); SRC/OBS/EVD in `objects.canonical_objects`.

**Cross-tenant/domain negative tests (mandatory):** API access; direct SQL under wrong/absent context (RLS); **worker execution** with a job whose payload scope was tampered; **replayed queue jobs** across tenants; outbox events (publisher never emits a row outside its scope; consumer-side scope check); **blob retrieval** with a foreign-scope locator; and **existence/timing disclosure** (foreign-scope probes return the same error shape and statistically indistinguishable timing vs. non-existent resources).

## 5. Acquisition lifecycle (correction B) — no external I/O inside DB transactions

1. **Authorize the scheduled collection attempt**: authenticate the agent principal (instance+version, §11); resolve scope; PDP evaluation.
2. **Persist POL/AUD authorization evidence** (own short transaction) + append `run.started`.
3. **Revalidate the exact active source-contract version** (again immediately before egress; non-active ⇒ abort + revoke queued work, §7).
4. **Bounded external acquisition** — outside any DB transaction; §8 controls; per-run budgets.
5. **Store exact original bytes in isolated quarantine storage** (quarantine volume; tenant-scoped opaque locator).
6. **Verify durable storage + content digest** (write, fsync, re-read, digest compare).
7. **Bounded validation/scanning** (type sniff, size/expansion limits, heuristics; parser resource isolation for feed framing).

**Admission (corrected §5.8 — the filesystem copy is NOT part of the database transaction; the cross-store operation is never described as atomic):**

8. **8a.** Create the **admitted candidate blob** in the admitted volume **outside the database transaction** (create-if-absent copy from quarantine).
   **8b.** `fsync` it, **re-read it, and verify its digest** against the quarantine original.
   **8c.** Open a **short database transaction**.
   **8d.** **Reauthorize and revalidate the exact source-contract version** (third contract check).
   **8e.** **Atomically commit** (single DB transaction): blob manifest row, OBS/EVD canonical versions, custody event, POL, AUD, and outbox record. The canonical record references only the already-durable, digest-verified candidate bytes — **the canonical record never references missing or non-durable bytes**.
   **8f.** After DB commit: append the finalized custody state and **tombstone the quarantine copy**.
   **8g.** If the DB transaction fails: the admitted candidate has no manifest row, is **inaccessible through every retrieval path** (retrieval resolves via the manifest only), and is reconciled as an orphan by the sweeper (§5.11).
9. **Advance the connector checkpoint only after the DB commit succeeds** (`run.checkpointed` appended post-commit).
10. **Publish asynchronously after commit** (existing outbox publisher).
11. **Reconcile orphans** (sweeper, agent-principal, audited): quarantine blobs/cases past TTL without terminal state → `case.expired`; admitted-candidate blobs without manifest rows → quarantined for investigation (never silently deleted); interrupted runs (`run.started` without terminal event past timeout) → `run.failed(reason=interrupted)`.
12. **Idempotency vs. evidence identity (separated):**
    - *Retry idempotency* — the acquisition-attempt key is `(source id, contract version, run id, item natural key)`. **Only an exact replay of the same acquisition attempt no-ops** (detected via the attempt key; audited as a no-op).
    - *Evidence identity* — **identical bytes observed at a later observation time constitute a NEW observation**: a new OBS with its own observation_time, referencing the same content digest (the vault may share the identical bytes **within the same tenant/domain only**, §9). Content digest is identity of *bytes*, never of *observations*.

**Crash/failure behavior per boundary:** before 2 → nothing persisted · 2–5 → `run.started` only; sweeper reconciles · 5–8a → quarantine blob + events; expire or admit · 8a–8c → orphan admitted-candidate; swept to investigation · during 8e → DB atomicity: all-or-nothing; candidate becomes orphan on abort (8g) · 8e–8f → manifest committed, quarantine tombstone pending; sweeper completes tombstone idempotently · 8f–9 → re-fetch hits the attempt key → no-op · 10 failure → outbox row stays pending (at-least-once).

## 6. Executable coverage model (correction C)

`observation.coverage_measurements` (append-only). **Every row carries:** scope triple · source object id · **immutable `evaluated_at`** (the stored evaluation instant — replay never computes state from an unstored *now*) · **evaluation window** (`window_start`, `window_end`) · **denominator** (expected-item/interval count with its derivation) · **`coverage_universe_version`** (the versioned declaration of what "full coverage" means for this source) · **`calc_method` + `calc_version`** · **evidence references** (run-event ids, admission ids) · **applicability state** · **confidence/assurance level**.

**Measurement states:** `measured / unknown / indeterminate / not_applicable / insufficient_evidence`. Rules: `not_applicable` requires a **contract-approved reason** recorded on the measurement; `unknown`, `indeterminate`, and `insufficient_evidence` **never map to a healthy display state** and set a decision-use constraint on downstream consumers of the source's evidence (freshness/quality state on subsequently admitted EVDs); a failed measurement run is itself recorded (`indeterminate` + error class), never skipped silently.

Dimensions (each a measurement row, states above apply per-dimension): expected_coverage · actual_coverage · freshness · completeness · latency · authenticity · correction_lag · blind_spots · degraded_regions.

**Authenticity is four separate, separately-recorded concepts (never conflated):**
1. *Transport-endpoint authentication* — TLS certificate verification of the endpoint we connected to.
2. *Byte integrity* — digest verification that stored bytes equal received bytes.
3. *Source-origin verification* — evidence that the endpoint is the contract's authorized origin (allowlist match, DNS/IP verification, signed feeds where available).
4. *Content authenticity* — whether the content genuinely originates from the claimed real-world source. **TLS + digest are NOT proof of content authenticity**; in cohort 1, content authenticity is recorded as `unknown` unless a contract-declared mechanism (e.g., publisher signature) exists.

Health transitions (`observation.source_health_events`) carry: prior→new state, `evaluated_at`, `calc_version`, `coverage_universe_version`, and the measurement-row evidence references. `SourceHealthChanged` outbox events embed the same. Health replay is deterministic: replaying the event stream + stored measurements reproduces the identical state timeline (CI test).

## 7. Source-contract enforcement (correction D)

SRC@v1 payload (validated at registration; all required unless contract-approved N/A):

- **Identity & topology:** explicit source identity (stable id + human name + publisher identity) · **endpoints** (exact URLs/hosts, scheme allowlist) · **schedule/cadence** (declared polling cadence, jitter tolerance) · **collection window** (permitted collection hours/days where the source restricts them).
- **Authority & rights:** owner · steward · authority + legal basis · rights/licence/robots policy + permitted use · purpose · data classification · residency/processing-location restrictions · retention + deletion obligations.
- **Security & operations:** credential **reference** (never the secret) · authentication + authenticity method (per the four §6 concepts) · rate/concurrency/volume/cost budgets · expected schema/content · freshness + coverage expectations (feeding the §6 denominator + universe version) · correction/withdrawal channel · approval + separation-of-duties evidence (registrar ≠ approver).
- **Lifecycle:** version + effective period · **lifecycle states**: `draft → approved → active → suspended → retired` (+ `superseded` when a new version activates).

**Fail-closed behavior (each case denies scheduling, egress, and admission, appends an immutable event, and is audited):** contract expiry (effective period passed) · revocation/retirement · incompatible contract version (job pinned to a version no longer active) · missing/withdrawn rights · purpose mismatch (envelope purpose ∉ contract purposes) · residency conflict (vault/processing location ∉ contract residency) · classification conflict (content classified above contract ceiling) · invalid/expired credentials (resolve failure ⇒ abort, never a retry storm) · schema drift (payload violates the contract's expected schema beyond tolerance ⇒ quarantine, not admission).

**Suspension/retirement semantics:** append immutable cancellation events (`run.cancelled` per active run, scheduler-entry removal event) · **abort active work where possible** (in-flight acquisition receives a cooperative cancel; past step 8c it completes or aborts atomically) · admission is blocked by the third contract check (8d) regardless · **checkpoints are preserved** (resumption after reactivation continues from the last committed checkpoint) · affected consumers are notified via `SourceHealthChanged(state=suspended)` with evidence refs.

Contract revalidation points: (a) before scheduling, (b) immediately before network egress, (c) at admission (step 8d).

## 8. Connector hardening (corrections F, G of the prior review — unchanged) 

### 8.1 Network controls
HTTPS only; per-contract scheme/host/port allowlist · resolve-then-connect with private/loopback/link-local/cloud-metadata IP blocking (every resolved address) · DNS-rebinding protection (pin the vetted IP) · redirects: max 3, each target revalidated (allowlist + IP rules) · **no credential forwarding across origins** (auth headers stripped on host change) · TLS certificate verification always on · registered egress only · request/response/decompressed-byte limits · timeouts, per-source circuit breaker, per-source + global concurrency caps · `Retry-After` honored; exponential backoff + jitter · bounded pagination/cursors · `ETag`/`If-Modified-Since` with checkpoint recovery · idempotent retries per §5.12 · secrets + URL query strings redacted in logs, events, audit metadata.

### 8.2 Content controls
ZIP/DOCX expansion limits (total/per-entry bytes, entry count) + path-traversal rejection (DOCX inspected as archive for safety only) · PDF stored opaque, never parsed/rendered; `active_content_risk` flag on JS/embedded-file markers · filename normalization · CSV encoding detection + formula-risk classification (never evaluated) · declared-vs-sniffed type recorded (`file-type` is a best-effort content hint only — not malware detection, not format validation, not proof of safety) · malicious-input fixture corpus in CI.

### 8.3 Parser policy (fast-xml-parser)
**Pinned exact version: `fast-xml-parser@5.10.1`** (latest patched ≥5.7.0 at plan time; pin re-resolved at implementation start under ADR-P0-01's policy, recorded in the lockfile). DTD + entity processing disabled; input size, depth, entity, and execution-time budgets. Parsing runs in a dedicated **worker thread with memory + timeout limits — this is RESOURCE isolation (kill on budget breach → item quarantined), NOT a security sandbox**: a worker thread shares the process privilege boundary, so the defense against hostile XML is the disabled DTD/entity processing, the input budgets, and the malicious-fixture corpus — not the thread boundary. Malicious XML fixtures (entity-expansion structures, deep nesting, huge attributes) in CI; SBOM + vulnerability gates remain blocking.

## 9. Evidence-vault isolation (correction H of the prior review + §5 alignment)

- Tenant/domain-scoped **opaque** locators: `<tenant>/<domain>/<vault-uuid>` (random uuid, not the digest) — no global digest namespace; **no cross-tenant deduplication or existence disclosure** (digest lookups scoped per domain only; §4 negative tests cover probe timing/shape).
- Separate named Docker volumes (local profile only — NOT the production storage architecture): `eye-quarantine` and `eye-evidence`.
- Atomic create-if-absent writes (temp + link/rename); digest verified before and after storage and on every read; the vault port validates requester scope against locator scope on every operation (independent of RLS).
- Every retrieval is a consequential read (POL/AUD durable before bytes); blob metadata carries classification/residency/retention/legal-hold from contract + admission.
- Governed deletion via tombstones; downloads attachment-only, sandboxed, never inline-rendered.

## 10. RSS framing & correction honesty (correction J of the prior review — unchanged)

**10.1** Raw responses preserved as parent EVDs; per-item EVDs are bounded transport framing with `method_ref = rss-framing@<parser version>`, exact byte/fragment reference, parent linkage, deterministic fixtures. No semantic interpretation performed or claimed.
**10.2** `CorrectionReceived` lists **directly known** affected objects + explicit `propagation_scope: { resolved: [...], unresolved: 'downstream consumers not yet present (KG/dependency graph arrives Phase 3)' }`. Tests: correction, withdrawal, supersession, case replay, spoofed-correction rejection, propagation-failure handling.

## 11. Agent contracts (correction K of the prior review — unchanged)

Observation / Crawler / Collection contracts as registered `agent`-kind principals; instance- and version-specific; tenant/domain-bound; accountable human owner; source-contract version + code digest on every `run.started`; **reauthorized at execution time**; revocable while queued; budgets (requests, bytes, cost, concurrency, timeout, retries) with breach ⇒ stop + escalate. Crawler contract defined, no instance in cohort 1.

## 12. Milestones

Unchanged from Rev 2 (P1-M1…M7), with §5/§6/§7 corrections folded into M2–M5 scope and the §13 matrix into M7. Estimate: **~2.5–3.5 weeks**.

## 13. Acceptance matrix (correction E — expanded)

| # | Criterion | Evidence type |
|---|---|---|
| A1 | Source contract: full §7 field set; registrar ≠ approver; 3-point revalidation; **each §7 fail-closed case exercised** (expiry, revocation, version incompatibility, rights, purpose, residency, classification, invalid credentials, schema drift) | API + integration |
| A2 | Chain of custody: source identity, method + connector version + agent identity/code digest, event/observation time, digest verified pre/post storage and on read; byte-identical retrieval; POL/AUD before retrieval | Integration + acceptance |
| A3 | **Four-time SRC/OBS/EVD conformance**: event/observation/valid/record time populated per type rules; **known-at queries** over OBS/EVD reproduce pre-correction knowledge states | Integration + acceptance |
| A4 | Acquisition lifecycle: no external I/O inside DB transactions (structural assertion); **crash tests at every §5 boundary** (before 2, 2–5, 5–8a, 8a–8c, during 8e, 8e–8f, 8f–9) leave no partial canonical state; orphan sweeper recovers each case; exact-replay no-op vs. **new-observation-at-later-time distinction** | Fault-injection integration |
| A5 | Isolation: cross-tenant/domain negatives across **API, direct SQL, worker execution with tampered job scope, replayed queue jobs, outbox events, blob retrieval, and existence/timing disclosure** | Isolation suite |
| A6 | Coverage/health: all dimensions with stored `evaluated_at`/window/denominator/universe-version/calc-version/evidence refs; `unknown`/`not_applicable`(+approved reason)/`insufficient_evidence` states honored; unknown never healthy; **deterministic health replay** from stored events + measurements | Unit + integration + UI |
| A7 | Vault: **missing-blob and corrupt-blob reads** fail closed with audited integrity errors; denied retrieval leaks nothing; quarantine/admitted separation | Integration |
| A8 | Corrections: correction, withdrawal, supersession, historical preservation (prior versions replayable), spoofed-correction rejection, propagation-failure handling | Integration + acceptance |
| A9 | Agents: per-run reauthorization; revocation while queued; budget breach stops + escalates; **agent instance mismatch** (job pinned to retired instance) and **code-digest mismatch** rejected; queue-replay rejection | Integration |
| A10 | Hostile input: SSRF corpus (private/loopback/metadata, rebinding, redirect escape), parser limits (hostile XML killed within budgets), **redirect/origin credential stripping**, secret + URL-query redaction verified in logs/events/audit | Malicious-fixture suite |
| A11 | Event-sourced state: all projections rebuild from events byte-equal | Integration |
| A12 | WS-02: Playwright journeys incl. **accessibility checks (keyboard, landmarks, labels), safe attachment-only downloads, and non-disclosure on denied views**; Phase 0 Playwright suite (10) stays green | Playwright in CI |
| A13 | Phase 0 regression: full suites green; no constitutional invariant weakened | Full CI |

## 14. Exceptions

EXC-P1-001 (heuristic-only quarantine scanning) and EXC-P1-002 (local-volume evidence vault) are now recorded **in the authoritative [EXCEPTIONS.md](EXCEPTIONS.md) with status `proposed`** — they become `open` only upon Phase 1 approval. Both carry exact canonical requirement IDs, a separate `related_architecture_ids` field, and prohibit external deployment, real customer data, production claims, and unqualified malware-safety or deployment-parity claims. EXCEPTIONS.md also lists the **inherited open Phase 0 exceptions** (EXC-P0-001…005) that Phase 1 operates under.

---

**Awaiting `APPROVED: PHASE 1`.**
