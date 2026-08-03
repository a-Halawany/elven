# THE EYE — Architecture Decision Records (Project)

> Project-level ADRs. They refine, and may never contradict, Volume 0 (C-001…C-052) and Volume 3 (ADR-0001…ADR-0020).
> Status values: Proposed | Accepted | Superseded.

| ID | Title | Status | Date |
|---|---|---|---|
| ADR-P0-01 | Technology baseline & version policy | Accepted | 2026-08-03 |
| ADR-P0-02 | Modular monolith with contract-only module boundaries | Accepted | 2026-08-03 |
| ADR-P0-03 | Control-plane component namespace `CP-*` | Accepted | 2026-08-03 |
| ADR-P0-04 | PLATFORM/TENANT/DOMAIN scope model & audited bootstrap | Accepted | 2026-08-03 |
| ADR-P0-05 | Canonical header: single authoritative typed representation | Accepted | 2026-08-03 |
| ADR-P0-06 | Truth-state enum (Vol 7 App. E) & compatibility mappings | Accepted | 2026-08-03 |
| ADR-P0-07 | Four-axis temporal model & DB-level append-only | Accepted | 2026-08-03 |
| ADR-P0-08 | Authoritative request paths (non-recursive) | Accepted | 2026-08-03 |
| ADR-P0-09 | Audit chain design | Accepted | 2026-08-03 |
| ADR-P0-10 | ABAC policy engine | Accepted | 2026-08-03 |
| ADR-P0-11 | UUIDv7 identifiers from central issuer | Accepted | 2026-08-03 |
| ADR-P0-12 | Transactional outbox | Accepted | 2026-08-03 |
| ADR-P0-13 | Contracts package (JSON Schema + JCS + generated TS) | Accepted | 2026-08-03 |
| ADR-P0-14 | Design tokens, no optimistic consequential UI, i18n/RTL foundations | Accepted | 2026-08-03 |
| ADR-P0-15 | Schema-validated versioned `eye.*` configuration | Accepted | 2026-08-03 |
| ADR-P0-16 | Supply-chain baseline in Phase 0 CI | Accepted | 2026-08-03 |

---

## ADR-P0-01 — Technology baseline & version policy
**Decision:** Node.js 24 LTS · NestJS 11 · Next.js 16 (active LTS, patched) · React 19.2 · PostgreSQL 18 (latest security patch; a lower supported major only with a documented compatibility-test record) · Kysely + node-postgres with explicit versioned SQL migrations (no full ORM in Phase 0) · currently supported Redis + BullMQ combination · Docker Compose for local dev · GitHub Actions CI.
**Version policy:** exact dependency versions pinned via lockfile; container images pinned by digest; monthly dependency review; security patches: critical ≤72h, high ≤7d, others at monthly review; major upgrades require a compatibility-test record. No obsolete majors frozen for a greenfield 2026 build.
**Anchors:** no volume mandates technologies (verified Vols 2–7, 9, 10); IA-68-003 (no mutable tags).

## ADR-P0-02 — Modular monolith with contract-only module boundaries
One NestJS module per canonical-layer/control-plane concern (`identity`, `tenancy`, `policy`, `audit`, `objects`, `config`, `shared`). Modules integrate only through declared contracts; no cross-module persistence access; one Postgres schema per owning module; boundaries enforced by dependency-cruiser as a blocking CI check.
**Anchors:** Vol 3 Ch.4 ("a layer is a responsibility boundary, not a deployable unit"); ES-04-002/003; ES-11-003; ES-65-003; IA-31-003.

## ADR-P0-03 — Control-plane component namespace `CP-*`
Volume 3 Appendix A allocates component IDs only for L1–L10. Control-plane components are unallocated; this project defines `CP-IAM-*`, `CP-TEN-*`, `CP-POL-*`, `CP-AUD-*`, `CP-OBJ-*`, `CP-CFG-*` as a Volume-4-level extension. Flagged as a documented gap, not a Volume 3 reference.

## ADR-P0-04 — PLATFORM/TENANT/DOMAIN scope model & audited bootstrap
Explicit `scope` enum on every persisted record, message, and audit event: `PLATFORM` (shared control records; requires platform authority + system provenance; never customer intelligence content), `TENANT` (`tenant_id`, no `domain_id`), `DOMAIN` (`tenant_id` + `domain_id`). Missing/ambiguous scope fails closed (`EYE-TEN-001`). Ambient tenant context prohibited; `tenant_id`/`domain_id` bound from the **authenticated principal + trusted routing**, never client-supplied values alone. Bootstrap = audited, time-bound, conspicuous seed procedure under a `PLATFORM`-scoped system principal with system provenance, modeled on break-glass rules. Cross-tenant/domain denied by default at service **and** database (RLS) levels.
**Anchors:** Vol 3 Ch.6/22/40; ES-51-002/003; ADR-0006.

## ADR-P0-05 — Canonical header: single authoritative typed representation
The authoritative representation of the 40-field canonical header (Vol 7 App. E, additive refinement of Vol 3 Ch.7's 8 groups) is the typed relational row. Structured sub-fields live in typed JSONB columns schema-validated on write. **No parallel full-header JSONB copy exists.** All derived/index representations are generated or constraint-verified from the authoritative row and can never disagree with it. Every version row carries a content digest (JCS canonical bytes).
**Anchors:** ADR-0003; ES-24-002; DADR-004/007; correction instruction #8 (Rev-2 review).

## ADR-P0-06 — Truth-state enum & compatibility mappings
Canonical stored enum (9 values, Vol 7 App. E): `observed, asserted, extracted, inferred, assessed, synthetic, decided, disputed, withdrawn`. Lifecycle state, correction state, and decision/display state are separate dimensions. Documented, fixture-tested mappings: Vol3/Vol4 `claimed`→`asserted`; `superseded`→lifecycle + `supersedes` link; Vol7 Ch22 `simulated`→`synthetic`, `corrected`→`correction_of` link; Vol8/9 display states (`recommended`, `corrected`, `indeterminate`) derived, never stored in `truth_state`. `synthetic_state` boolean marker kept alongside with constraint `truth_state='synthetic' ⇒ synthetic_state=true`.

## ADR-P0-07 — Four-axis temporal model & DB-level append-only
Four independent axes: **event time, observation time, valid time (`valid_from`/`valid_to`), record time (`recorded_at`)** + `time_precision` + `source_clock_quality`. Not reducible to ordinary bitemporal terminology. Five temporal query modes (current / valid-at / known-at / change-set / scenario-isolated). Append-only enforced at database privilege level (INSERT+SELECT-only app role, no UPDATE/DELETE grants) plus raise-on-UPDATE/DELETE triggers; corrections create new versions via `correction_of`/`supersedes`/`causation_id`.
**Anchors:** ADR-0004/0005; C-011; Vol 3 Ch.20/54.

## ADR-P0-08 — Authoritative request paths (non-recursive)
**Order:** (1) parse + minimally validate envelope → (2) authenticate principal + delegation → (3) resolve PLATFORM/TENANT/DOMAIN scope from authenticated principal + trusted routing → (4) evaluate policy → (5) full validation + applicable commit path. Scope is never resolved before authentication; client-supplied tenant/domain identifiers never trusted independently.
**Five request paths, each with an executable audit path:** allowed write (object+POL+AUD+outbox in one atomic transaction; async publish post-commit) · allowed consequential read (POL+AUD durable **before** protected data returns; no outbox unless a transition occurs) · denied/indeterminate (POL+AUD atomic; no object, no outbox) · auth/envelope/validation failure (sanitized security-audit intake: correlation, failure class, trustworthy metadata only — never credentials, tokens, untrusted payloads, or client-declared scope; rate-bounded) · health/readiness (explicitly classified `telemetry-only`; documented, not a bypass).
**Non-recursion:** POL/AUD appends via bounded internal append ports under workload principal `system.commit-pipeline`, preserving correlation/causation, never re-entering the public pipeline.
**Anchors:** Vol 3 Ch.5/22/25; ES-20-002; ES-55-002; correction instructions #1/#2/#5 (approval message).

## ADR-P0-09 — Audit chain design
- **Partitioning:** one chain per (scope, tenant_id): a PLATFORM chain + one per tenant; domain events chain within their tenant partition tagged `domain_id`.
- **Allocator:** separate `audit_chain_heads` table `(partition_id, next_seq, head_hash)` — mutable **only** by dedicated role `eye_audit_allocator`; **not canonical evidence**; reconstructable from the immutable ledger (rebuild test in CI). `audit_events` and completed `audit_seals` are strictly INSERT-only. Exact privilege boundary tested: app role INSERT-only on evidence; allocator role UPDATE-only on heads; no role can UPDATE/DELETE evidence.
- **Hash:** `row_hash = SHA-256(JCS({version:"eye-audit-v1", partition_id:string, audit_seq:integer, previous_hash:lowercase-hex (genesis 64×"0"), event:object-per-schema}))`, RFC 8785 canonicalization, UTF-8; per-row `hash_alg_version`; golden hash fixtures in `packages/contracts`; no unframed concatenation.
- **Seals:** periodic **pre-incident** trusted checkpoints per partition (daily and/or every N events); completed seals immutable.
- **Tamper response:** freeze/quarantine the affected partition → preserve all copies → integrity incident + prohibit reliance on the range → compare against latest previously trusted seal or external anchor → governed recovery → **never re-seal a tampered range as trusted**; trust resumes only forward of the recovery boundary.
- **Recovery:** heads rebuilt from ledger, never trusted from backup alone; re-verification before reopening writes (`EYE-RCV-001`).
- **External anchoring:** `AnchorSink` port (interface only in Phase 0) exporting `(partition, seal_head_hash)`.
**Anchors:** C-036; Vol 4 Ch.55; Vol 6 SC-08/IC-22; correction instructions #3/#4.

## ADR-P0-10 — ABAC policy engine
Four-value decisions: `allow | deny | indeterminate | allow-with-obligations`; obligations executed and evidenced at the enforcing boundary; `indeterminate` treated as deny at the PEP (fail-closed). POL records carry Vol 3 outcome context: exception ref, expiry, revocation state, purpose determination. Attribute model = Vol 3 Ch.22 six dimensions (Principal, Purpose, Object, Action, Environment, Obligation) + consequence class C0–C4. PDP = `policy` module with versioned bundles (v1 = RBAC rules in ABAC form); PEP = global guard/interceptor + Postgres RLS as independent second enforcement. Default deny; cached decisions scope/time-bounded and revocation-aware; separation of duties (administration ≠ business authority).
**Anchors:** Vol 3 Ch.22/45; ES-13/ES-50; PR-59-005.

## ADR-P0-11 — UUIDv7 identifiers from central issuer
UUIDv7 issued by the shared id-issuer module; non-semantic (no region/env/name embedded — ES-25-001); namespaced; alias/merge history slots reserved for Phase 3 entity stewardship.

## ADR-P0-12 — Transactional outbox
Outbox record inserted atomically in the same database transaction as the authoritative state change; published asynchronously only after commit. Events are immutable facts; corrections are new events linked by causation/supersession.
**Anchors:** Vol 3 Ch.25 (governed outbox, named); ES-17-005; ES-19-001/005.

## ADR-P0-13 — Contracts package
`packages/contracts` holds the language-neutral source of truth: JSON Schemas for envelope, canonical header, audit event, errors (`EYE-XXX-NNN`), truth-state mappings; JCS canonicalization reference implementation + golden fixtures (envelope equivalence, hash fixtures); TypeScript types generated from schemas. Volume 4 owns error semantics; Volume 3 owns envelope semantics.

## ADR-P0-14 — Design tokens, consequential UI, i18n/RTL foundations
Vol 9 Appendix A tokens emitted as CSS variables (light + dark); Tailwind maps semantic aliases only; no raw values; 4px scale. Optimistic UI prohibited for consequential state (UX-ADR-017) — authoritative receipts only (PAT-19). Phase 0 establishes i18n infrastructure (message catalog, no hardcoded strings), logical CSS properties exclusively, bidirectional layout support, RTL-safe components; English content first, Arabic before external release.

## ADR-P0-15 — Schema-validated versioned configuration
Configuration in versioned, schema-validated documents under `eye.*` namespaces (Vol 4 App. H); deterministic precedence; no unowned free-form keys; `.env` restricted to local development secrets (EXC-P0-005).

## ADR-P0-16 — Supply-chain baseline in Phase 0 CI
Phase 0 CI includes SBOM generation (CycloneDX), dependency vulnerability scanning (OSV/audit), container image scanning, secret scanning, and license inventory — all blocking at declared thresholds. Artifact signing/attestation deferred by bounded exception EXC-P0-003 (expiry 2026-09-30).
