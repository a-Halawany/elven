# THE EYE — Phase 1 Plan: World Observation Layer (L1) — Revision 5

> Status: **AWAITING FINAL APPROVAL** — no Phase 1 application code until approval.
> Revision 5 is **cumulative and self-contained**, preserving Revision 4 in full (locked decisions, the complete P1-M1…M7 milestone table, corrections A–F and the prior review's F–K, complete-origin credential semantics, transactionally protected final contract revalidation) and adding the Gate-2 closure requirement: fault injection is enumerated **separately at every numbered acquisition step and every durable sub-boundary** — no grouped ranges such as "between steps 2 and 5" — covering POL/AUD-plus-`run.started` atomicity and every write, fsync, rename, verification, transaction, outbox and checkpoint boundary (§5.13). No architectural redesign; the frozen architecture, roadmap, and locked answers stand.
>
> **Gate-2.1 correction (§9).** The table now runs to **step 12** (idempotency vs.
> evidence identity), and the step 8e commit is decomposed into **one row per
> individual durable write** — manifest, OBS, EVD, custody, POL, AUD, outbox —
> instead of a single generic "before commit" case that asserted the seven writes
> only collectively. Rows F23a–F23g and F37–F46 are new; F01–F22, F24–F36 are
> unchanged.
> Honest scope: Phase 1 delivers the **first connector cohort** of L1 — see [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md). It does not complete L1 or the source universe.

---

## 0. Locked decisions (restated in full — binding)

1. **Evidence storage (local profile):** separate named Docker volumes — `eye-quarantine` and `eye-evidence` — quarantine and admitted bytes never share a volume. This is the LOCAL profile only, not the production storage architecture (EXC-P1-002, proposed).
2. **Feed parsing:** `fast-xml-parser` is **conditionally accepted** under the §8.3 controls (exact pin `fast-xml-parser@5.10.1` at plan time, re-resolved at implementation start under ADR-P0-01 and recorded in the lockfile; DTD/entity processing disabled; budgets; malicious-fixture corpus; worker-thread resource isolation that is explicitly NOT a security sandbox).
3. **No semantic content extraction in Phase 1:** connectors perform transport framing and safety validation only, always with method lineage (`method_ref`); semantic interpretation is Phase 2.
4. **Scheduler floor:** the local scheduler enforces a **60-second minimum polling interval** (no contract may schedule more frequently in the local profile), combined with per-contract cadence limits, jitter, per-source + global concurrency caps, exponential backoff, and `Retry-After` honoring.
5. **Playwright is in scope:** WS-02 ships with browser acceptance specs, and the Phase 0 Playwright suite (10 scenarios) remains a standing blocking regression gate.
6. **BullMQ Job Schedulers API** (`upsertJobScheduler`) is the scheduling mechanism; queue payloads carry scoped opaque identifiers and never credentials or delegated authority.
7. **Agents:** Observation / Crawler / Collection contracts as registered `agent`-kind principals (instance- and version-specific, tenant/domain-bound, accountable human owner, reauthorized at execution time, revocable while queued, budgeted). The Crawler contract is defined but has no cohort-1 instance.

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

P1-01 SRC/OBS/EVD as canonical objects via the existing commit pipeline · P1-02 tenant-scoped evidence vault (§9) · P1-03 quarantine-before-admission with the §5 lifecycle · P1-04 bounded collection agents (§11) · P1-05 event-sourced observation state (§4) · P1-06 correction cases with explicit unresolved-propagation scope (§10) · P1-07 connector hardening baseline (§8) · P1-08 parser resource-isolation policy (§8.3) · P1-09 BullMQ Job Schedulers with the 60s floor, jitter/backoff/concurrency caps · P1-10 RSS transport framing with method lineage (§10.1).

## 4. Data model — event-sourced, scope-mandatory (correction A)

**Universal scope rule:** every event row, projection row, checkpoint, queue job, scheduler record, blob manifest, quarantine case, correction case, coverage measurement, and outbox envelope carries **immutable, non-null `scope` + `tenant_id` + `domain_id` fields as applicable to its scope class** (NOT NULL enforced by CHECK constraints mirroring the Phase 0 scope-consistency constraints). Scope values are populated **only from the authenticated principal + trusted routing** at the pipeline boundary — never from client payloads. Scope context in the database is established exclusively through the Phase 0 **operation-specific capability minters** (`ctx.issue_commit` / `ctx.issue_evidence` / `ctx.issue_publish` / `ctx.issue_verify` / `ctx.issue_identity_op` / `ctx.issue_bootstrap`, migrations 0009–0012) — raw GUCs are inert. `ctx.issue` and `ctx.issue_system` **no longer exist** (dropped in 0011: a universal system context granted unrestricted PLATFORM authority on the strength of free text), so no Phase 1 code may assume them. A capability is bound to session + principal + tenant + domain + scope + assurance + purpose + issued-at + wall-clock expiry (`clock_timestamp()`) + issuance nonce + revocation epoch + issuing backend + issuing transaction **and** to its permitted operation class, action, target, correlation id, policy-decision id, bundle version and consequence class; the mintable action set is additionally bound to the minting database role. Every Phase 1 authoritative port must therefore declare its action and revalidate live authority at its own write boundary, exactly as the Phase 0 ports do.

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

**Admission (the filesystem copy is NOT part of the database transaction; the cross-store operation is never described as atomic):**

8. **8a.** Create the **admitted candidate blob** in the admitted volume **outside the database transaction** (create-if-absent copy from quarantine).
   **8b.** `fsync` it, **re-read it, and verify its digest** against the quarantine original.
   **8c.** Open a **short database transaction**.
   **8d.** **Transactionally protected final source-contract revalidation** (third contract check): INSIDE the 8c transaction, the contract row is re-read **with a row-level lock** (`SELECT … FOR SHARE` on the exact contract version) and its lifecycle state re-verified as `active`; a concurrent suspension/retirement/supersession either commits before this lock (⇒ admission aborts here) or blocks until this admission commits (⇒ the cancellation path then revokes future runs). Admission can never commit against a contract whose deactivation committed first.
   **8e.** **Atomically commit** (the same single DB transaction as 8c/8d): blob manifest row, OBS/EVD canonical versions, custody event, POL, AUD, and outbox record. The canonical record references only the already-durable, digest-verified candidate bytes — **the canonical record never references missing or non-durable bytes**.
   **8f.** After DB commit: append the finalized custody state and **tombstone the quarantine copy**.
   **8g.** If the DB transaction fails: the admitted candidate has no manifest row, is **inaccessible through every retrieval path** (retrieval resolves via the manifest only), and is reconciled as an orphan by the sweeper (§5.11).
9. **Advance the connector checkpoint only after the DB commit succeeds** (`run.checkpointed` appended post-commit).
10. **Publish asynchronously after commit** (existing outbox publisher).
11. **Reconcile orphans** (sweeper, agent-principal, audited): quarantine blobs/cases past TTL without terminal state → `case.expired`; admitted-candidate blobs without manifest rows → quarantined for investigation (never silently deleted); interrupted runs (`run.started` without terminal event past timeout) → `run.failed(reason=interrupted)`.
12. **Idempotency vs. evidence identity (separated):**
    - *Retry idempotency* — the acquisition-attempt key is `(source id, contract version, run id, item natural key)`. **Only an exact replay of the same acquisition attempt no-ops** (detected via the attempt key; audited as a no-op).
    - *Evidence identity* — **identical bytes observed at a later observation time constitute a NEW observation**: a new OBS with its own observation_time, referencing the same content digest (the vault may share the identical bytes **within the same tenant/domain only**, §9). Content digest is identity of *bytes*, never of *observations*.

### 5.13 Fault injection — enumerated per NUMBERED STEP and per DURABLE SUB-BOUNDARY

Each row is one executable fault-injection test. Rows are keyed to a single step
or a single durable sub-boundary — **no grouped ranges**. "Durable sub-boundary"
means any point where the observable state of a store changes: a write, an
fsync, a rename/link, a digest verification, a transaction begin/commit/abort, an
outbox insert, a queue add, or a checkpoint append.

| # | Injection point (exact) | Required behavior |
|---|---|---|
| F01 | before step 1 (nothing attempted) | nothing persisted anywhere |
| F02 | inside step 1, after agent authentication, before scope resolution | nothing persisted; no run row |
| F03 | inside step 1, after scope resolution, before PDP evaluation | nothing persisted |
| F04 | inside step 1, after PDP decision, before step 2 opens its transaction | decision not persisted; no run row; retry is clean |
| F05 | step 2, inside the POL/AUD transaction, BEFORE commit | atomic abort: no POL, no AUD, no `run.started` — all three are in ONE transaction |
| F06 | step 2, at commit (crash during commit) | all-or-nothing: either POL+AUD+`run.started` are all present, or none are |
| F07 | step 2, immediately AFTER commit, before step 3 | `run.started` present with POL/AUD; sweeper marks `run.failed(reason=interrupted)` after timeout |
| F08 | step 3, contract revalidation returns non-active | abort before egress; cancellation event appended; no external I/O performed |
| F09 | step 3, crash after revalidation, before egress | no egress; sweeper reconciles the started run |
| F10 | step 4, during external acquisition (mid-stream) | no bytes admitted; partial buffer discarded; budgets released; sweeper reconciles |
| F11 | step 4, after acquisition completes, before step 5 opens the file | nothing in quarantine; retry re-acquires |
| F12 | step 5, quarantine WRITE partially completed (no fsync) | unverified quarantine blob; never admitted; case expires via sweeper |
| F13 | step 5, after write, before rename/link into the quarantine locator | orphan temp file; sweeper removes; nothing referenced |
| F14 | step 6, after fsync, before digest re-read | blob durable but unverified; must be re-verified or expired; never admitted |
| F15 | step 6, digest re-read MISMATCHES | quarantine case rejected with an integrity event; blob never admitted |
| F16 | step 7, during bounded validation/scanning | item quarantined with the validation verdict recorded; no admission |
| F17 | step 8a, admitted-candidate copy partially written | orphan candidate; no manifest row; unreachable via every retrieval path; swept to investigation |
| F18 | step 8b, after candidate fsync, before candidate digest re-read | orphan candidate; swept to investigation |
| F19 | step 8b, candidate digest MISMATCHES the quarantine original | admission aborts; candidate deleted/quarantined; integrity event recorded |
| F20 | step 8c, crash after opening the transaction, before 8d | transaction aborts; candidate orphaned (8g) |
| F21 | step 8d, contract deactivated concurrently (lock contention resolved against us) | admission aborts inside the transaction; candidate orphaned; cancellation events appended |
| F22 | step 8d, crash while holding the contract row lock | lock released by abort; admission aborts; candidate orphaned |
| F23 | step 8e, crash after the BLOB MANIFEST insert, before the OBS insert | atomic abort: the manifest row is not observable; candidate orphaned (8g) |
| F23a | step 8e, crash after the OBS canonical version insert, before the EVD insert | atomic abort: no OBS, no EVD; nothing references the candidate |
| F23b | step 8e, crash after the EVD canonical version insert, before the custody event | atomic abort: no EVD; no custody chain entry |
| F23c | step 8e, crash after the CUSTODY event append, before the POL insert | atomic abort: custody chain unchanged; no authorization record |
| F23d | step 8e, crash after the POL insert, before the AUD insert | atomic abort: a decision may never be durable without its audit record |
| F23e | step 8e, crash after the AUD insert, before the OUTBOX insert | atomic abort: no audit record survives without the effect it describes |
| F23f | step 8e, crash after the OUTBOX insert, before commit | atomic abort: no outbox row, therefore no publication of an uncommitted effect |
| F23g | step 8e, statement-level failure on ANY ONE of the seven writes (constraint/RLS/port rejection) | the whole transaction aborts; no partial subset is ever durable; the rejection is recorded on the retry path |
| F24 | step 8e, crash AT commit | all-or-nothing across manifest + OBS/EVD + custody + POL + AUD + outbox |
| F25 | step 8e, crash immediately AFTER commit, before 8f | manifest committed and authoritative; quarantine tombstone pending; sweeper completes it idempotently |
| F26 | step 8f, crash after appending the finalized custody state, before the quarantine tombstone | sweeper completes the tombstone; no double-admission |
| F27 | step 8f, crash during the quarantine tombstone write | tombstone is idempotent; sweeper re-runs it to completion |
| F28 | step 9, crash BEFORE the checkpoint append | re-fetch hits the attempt key → audited no-op; checkpoint advances on the retry |
| F29 | step 9, crash DURING the checkpoint append | single-row append: either present or absent, never torn; same recovery as F28 |
| F30 | step 9, crash AFTER the checkpoint append, before step 10 | checkpoint durable; publication retried by the outbox sweep |
| F31 | step 10, queue add fails (transport down) | outbox row stays `pending`; at-least-once retry; no data loss |
| F32 | step 10, crash AFTER queue add, BEFORE the publish acknowledgement | duplicate publish dedupes on the idempotent job id; consumers observe one event |
| F33 | step 10, publish acknowledgement compare-and-set loses the race | exactly one acknowledgement wins; status transitions once |
| F34 | step 11, crash DURING sweeper reconciliation of one item | sweeper operations are idempotent; the half-processed item is re-processed, never dropped |
| F35 | step 11, sweeper fails on one item (poison item) | audited sweeper failure event; remaining items unaffected; item retried next sweep |
| F36 | step 11, sweeper crashes between classifying and acting on an orphan | classification is re-derived on the next sweep; no orphan is silently deleted |
| F37 | step 12, crash after computing the attempt key, before the idempotency lookup | nothing persisted; the retry recomputes the same key and behaves identically |
| F38 | step 12, crash DURING the idempotency lookup (attempt key read) | read-only: nothing persisted; retry re-reads |
| F39 | step 12, exact replay detected, crash BEFORE the audited no-op event is appended | no duplicate admission; the no-op is re-derived and appended on the retry |
| F40 | step 12, exact replay detected, crash DURING the no-op event append | single-row append: present or absent, never torn; re-appended idempotently |
| F41 | step 12, exact replay detected, crash AFTER the no-op event, before responding | the no-op is durable; the caller retries and observes the same no-op |
| F42 | step 12, NEW observation of identical bytes at a later observation_time, crash before the new OBS insert | no new OBS; the earlier observation is untouched; retry creates the new observation |
| F43 | step 12, new observation, crash after the new OBS insert, before its EVD link | atomic abort inside the 8e transaction: no OBS without its evidence link |
| F44 | step 12, new observation, crash after the shared-digest vault reference is resolved, before commit | atomic abort: no manifest reference to shared bytes; the existing blob is untouched and never orphaned by the abort |
| F45 | step 12, concurrent exact replay and new observation for the same natural key | serialized by the attempt key + contract lock: exactly one no-op and one new observation, never two admissions of the same attempt |
| F46 | step 12, attempt-key uniqueness violation raised at commit | admission aborts; the no-op path is taken on the retry; no duplicate evidence identity |

**Atomicity assertions carried by these tests:** (a) POL + AUD + `run.started`
share ONE transaction (F05/F06); (b) manifest + OBS/EVD + custody + POL + AUD +
outbox share ONE transaction — asserted **per individual write** (F23, F23a–F23g)
rather than as a single generic "before commit" case, so a partial subset can be
shown to be impossible at every one of the seven boundaries, and F24 covers the
crash AT commit; (c) no external I/O occurs inside any database transaction
(structural assertion, A4); (d) the filesystem copy is never described as part of
the database transaction (§5 8a–8b); (e) idempotency and evidence identity are
independently fault-injected through step 12 (F37–F46), including the distinction
between an exact replay (audited no-op) and identical bytes observed later (a NEW
observation).

**Enumeration completeness:** the table covers numbered steps 1–12 with no gaps
and no grouped ranges. Every row names one step (or one lettered sub-step) and one
durable boundary within it: a write, an fsync, a rename/link, a digest
verification, a transaction begin/commit/abort, an individual row insert, an
outbox insert, a queue add, or a checkpoint append.

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

- **Identity & topology:** explicit source identity (stable id + human name + publisher identity) · **endpoints** (exact URLs/hosts, scheme allowlist) · **schedule/cadence** (declared polling cadence — never below the 60s local floor — jitter tolerance) · **collection window** (permitted collection hours/days where the source restricts them).
- **Authority & rights:** owner · steward · authority + legal basis · rights/licence/robots policy + permitted use · purpose · data classification · residency/processing-location restrictions · retention + deletion obligations.
- **Security & operations:** credential **reference** (never the secret) · authentication + authenticity method (per the four §6 concepts) · rate/concurrency/volume/cost budgets · expected schema/content · freshness + coverage expectations (feeding the §6 denominator + universe version) · correction/withdrawal channel · approval + separation-of-duties evidence (registrar ≠ approver).
- **Lifecycle:** version + effective period · **lifecycle states**: `draft → approved → active → suspended → retired` (+ `superseded` when a new version activates).

**Fail-closed behavior (each case denies scheduling, egress, and admission, appends an immutable event, and is audited):** contract expiry (effective period passed) · revocation/retirement · incompatible contract version (job pinned to a version no longer active) · missing/withdrawn rights · purpose mismatch (envelope purpose ∉ contract purposes) · residency conflict (vault/processing location ∉ contract residency) · classification conflict (content classified above contract ceiling) · invalid/expired credentials (resolve failure ⇒ abort, never a retry storm) · schema drift (payload violates the contract's expected schema beyond tolerance ⇒ quarantine, not admission).

**Suspension/retirement semantics:** append immutable cancellation events (`run.cancelled` per active run, scheduler-entry removal event) · **abort active work where possible** (in-flight acquisition receives a cooperative cancel; past 8c the admission transaction's locked contract re-read (8d) decides atomically) · admission is blocked by the transactionally protected third contract check (8d) regardless · **checkpoints are preserved** (resumption after reactivation continues from the last committed checkpoint) · affected consumers are notified via `SourceHealthChanged(state=suspended)` with evidence refs.

Contract revalidation points: (a) before scheduling, (b) immediately before network egress, (c) at admission — inside the admission transaction under a row lock (§5 8d).

## 8. Connector hardening (corrections F, G of the prior review)

### 8.1 Network controls
HTTPS only; per-contract scheme/host/port allowlist · resolve-then-connect with private/loopback/link-local/cloud-metadata IP blocking (every resolved address) · DNS-rebinding protection (pin the vetted IP) · redirects: max 3, each target revalidated (allowlist + IP rules) · **no credential forwarding across origins, with COMPLETE origin semantics: credentials (Authorization and Cookie headers, URL userinfo) are stripped whenever ANY component of the origin triple `(scheme, host, port)` changes between the request and the redirect target** — a scheme downgrade, a host change, or a port change each constitutes a new origin · TLS certificate verification always on · registered egress only · request/response/decompressed-byte limits · timeouts, per-source circuit breaker, per-source + global concurrency caps · `Retry-After` honored; exponential backoff + jitter · bounded pagination/cursors · `ETag`/`If-Modified-Since` with checkpoint recovery · idempotent retries per §5.12 · secrets + URL query strings redacted in logs, events, audit metadata.

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

## 10. RSS framing & correction honesty (correction J of the prior review)

**10.1** Raw responses preserved as parent EVDs; per-item EVDs are bounded transport framing with `method_ref = rss-framing@<parser version>`, exact byte/fragment reference, parent linkage, deterministic fixtures. No semantic interpretation performed or claimed.
**10.2** `CorrectionReceived` lists **directly known** affected objects + explicit `propagation_scope: { resolved: [...], unresolved: 'downstream consumers not yet present (KG/dependency graph arrives Phase 3)' }`. Tests: correction, withdrawal, supersession, case replay, spoofed-correction rejection, propagation-failure handling.

## 11. Agent contracts (correction K of the prior review)

| Contract | Purpose | Identity pattern |
|---|---|---|
| **Observation Agent** | Scheduled polling acquisition (RSS, REST) | `agent:observation.<connector>@<ver>` |
| **Crawler Agent** | Bounded crawl acquisition (defined; **no cohort-1 instance**) | `agent:crawler.<profile>@<ver>` |
| **Collection Agent** | Operator-initiated intake (uploads, manual imports) | `agent:collection.upload@<ver>` |

Each agent identity is: **instance- and version-specific** (principal display name embeds semver; new version ⇒ new principal), **tenant/domain-bound** (grant rows scoped per source contract), linked to an **accountable human owner** (owner principal id in the agent record), linked to **source-contract version + code digest** (recorded on every `run.started`), **reauthorized at execution time** (full pipeline auth per run — queued jobs carry no authority), **revocable while queued** (grant revocation checked at run start), and budgeted (**requests, bytes, cost units, concurrency, timeout, retries** per run + per window; breach ⇒ `run.budget_exceeded` + stop + escalation via `SourceHealthChanged`).

## 12. Milestones (P1-M1 … P1-M7, restored in full)

| M | Deliverable |
|---|---|
| P1-M1 | Migration **0013** (observation event tables + projections + RLS under the capability ports; 0011/0012 are taken by the Gate-2.1 authority-boundary closure), SRC schema + registry + contract enforcement, `collection_manager` role, policy rules |
| P1-M2 | Evidence vault (tenant-scoped, dual volumes, create-if-absent, digest verify) + quarantine lifecycle + upload connector + content controls (§8.2) |
| P1-M3 | Adapter SDK + RSS (framing §10.1, parser isolation §8.3) + REST poller + network hardening (§8.1, complete-origin credential stripping) + Job Schedulers (60s floor) + agent contracts (§11) |
| P1-M4 | Coverage model + health events/projection + `SourceHealthChanged` + sweeper/reconciliation (§5.11) |
| P1-M5 | Correction intake (§10.2) + `CorrectionReceived` |
| P1-M6 | WS-02 UI + **Playwright specs** (register source w/ review; health view; evidence browser + safe download; correction intake; quarantine queue) |
| P1-M7 | Acceptance extension (§13 matrix incl. the §5.13 per-step fault-injection table F01–F46 (incl. F23a–F23g)) + malicious-input corpus + Phase 0 regression (full API acceptance + Playwright 10) + Phase 1 Report |

Estimate: **~2.5–3.5 weeks**.

## 13. Acceptance matrix (correction E — expanded)

| # | Criterion | Evidence type |
|---|---|---|
| A1 | Source contract: full §7 field set; registrar ≠ approver; 3-point revalidation incl. the transactionally protected admission check (8d); **each §7 fail-closed case exercised** (expiry, revocation, version incompatibility, rights, purpose, residency, classification, invalid credentials, schema drift) | API + integration |
| A2 | Chain of custody: source identity, method + connector version + agent identity/code digest, event/observation time, digest verified pre/post storage and on read; byte-identical retrieval; POL/AUD before retrieval | Integration + acceptance |
| A3 | **Four-time SRC/OBS/EVD conformance**: event/observation/valid/record time populated per type rules; **known-at queries** over OBS/EVD reproduce pre-correction knowledge states | Integration + acceptance |
| A4 | Acquisition lifecycle: no external I/O inside DB transactions (structural assertion); **fault injection at EVERY §5.13 numbered step and durable sub-boundary (F01–F46 (incl. F23a–F23g), incl. every write/fsync/rename/verification/transaction/outbox/checkpoint boundary and sweeper recovery)** leaves no partial canonical state; orphan sweeper recovers each case; exact-replay no-op vs. **new-observation-at-later-time distinction** | Fault-injection integration |
| A5 | Isolation: cross-tenant/domain negatives across **API, direct SQL, worker execution with tampered job scope, replayed queue jobs, outbox events, blob retrieval, and existence/timing disclosure** | Isolation suite |
| A6 | Coverage/health: all dimensions with stored `evaluated_at`/window/denominator/universe-version/calc-version/evidence refs; `unknown`/`not_applicable`(+approved reason)/`insufficient_evidence` states honored; unknown never healthy; **deterministic health replay** from stored events + measurements | Unit + integration + UI |
| A7 | Vault: **missing-blob and corrupt-blob reads** fail closed with audited integrity errors; denied retrieval leaks nothing; quarantine/admitted separation | Integration |
| A8 | Corrections: correction, withdrawal, supersession, historical preservation (prior versions replayable), spoofed-correction rejection, propagation-failure handling | Integration + acceptance |
| A9 | Agents: per-run reauthorization; revocation while queued; budget breach stops + escalates; **agent instance mismatch** (job pinned to retired instance) and **code-digest mismatch** rejected; queue-replay rejection | Integration |
| A10 | Hostile input: SSRF corpus (private/loopback/metadata, rebinding, redirect escape), parser limits (hostile XML killed within budgets), **complete-origin credential stripping (scheme OR host OR port change)**, secret + URL-query redaction verified in logs/events/audit | Malicious-fixture suite |
| A11 | Event-sourced state: all projections rebuild from events byte-equal | Integration |
| A12 | WS-02: Playwright journeys incl. **accessibility checks (keyboard, landmarks, labels), safe attachment-only downloads, and non-disclosure on denied views**; Phase 0 Playwright suite (10) stays green | Playwright in CI |
| A13 | Phase 0 regression: full suites green (unit, integration incl. the invariant-remediation suites, acceptance, Playwright); no constitutional invariant weakened | Full CI |

## 14. Exceptions

EXC-P1-001 (heuristic-only quarantine scanning) and EXC-P1-002 (local-volume evidence vault) are recorded **in the authoritative [EXCEPTIONS.md](EXCEPTIONS.md) with status `proposed`** — they become `open` only upon Phase 1 approval. Both carry exact canonical requirement IDs, a separate `related_architecture_ids` field, and prohibit external deployment, real customer data, production claims, and unqualified malware-safety or deployment-parity claims. EXCEPTIONS.md also lists the **inherited open Phase 0 exceptions** (EXC-P0-001…005) that Phase 1 operates under.

---

**Awaiting `APPROVED: PHASE 1`.**
