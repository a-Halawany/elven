# THE EYE — Phase 0 Plan: Foundation & Governance Spine (Revision 2)

> Status: **REVISED — AWAITING FINAL APPROVAL**. No application code will be written until final approval is received.
> Revision 2 incorporates the 11 approval-blocking corrections issued on the Revision-1 review, and the complete reading of Volume 3 — Technical Architecture v1.0.

---

## 1. Document Authority Model (corrected)

| Rank | Volume | Authority |
|---|---|---|
| 1 | **Volume 0 — Product Constitution v1.0** | Highest authority. Constitutional invariants C-001…C-052. Frozen. |
| 2 | **Volume 3 — Technical Architecture v1.0** | Canonical system architecture: ten-layer model, logical components (`Lx-Cyy`), interfaces (`Lx-Iyy`), canonical object model, control planes, contract envelope, ADR-0001…ADR-0020. Where a downstream specification conflicts with Volume 3, Volume 3 controls. |
| 3 | **Volume 4 — Engineering Specification v1.0** | Engineering contracts and executable requirements (`ES-CC-NNN`), error models (`EYE-XXX-NNN`), SLOs, test suites. Refines Volume 3; does not redefine it. |
| 4 | **Volumes 5, 6, 7** | Authoritative within their domains: AI architecture (`AI-NN-NNN`), infrastructure (`IA-NN-NNN`), data platform (`DP-CC-NNN`). |
| 5 | **Volume 8 — PRD** | Product requirements (`PR-CC-NNN`), personas, capabilities, journeys. |
| 6 | **Volume 9 — UI/UX Design System** | UI/UX and interaction requirements (`UX-CC-NNN`), tokens, components, patterns. |
| — | **Volumes 1, 2** | Explanatory / executive presentation layers. They do **not** override normative architecture or engineering specifications. |
| — | **Volume 10 — Investor Package** | Investor and diligence material. Not an engineering authority. |

All eleven volumes plus the Master Build Prompt have been read in full (see PROGRESS.md review log).

**Change-control note (Vol 3 Ch.48):** any Phase 0 choice touching the canonical header, truth-state enum, envelope, or policy-decision model is a **cross-domain decision class**. In this project the approving authority role is the project owner; each such choice is recorded as a project ADR below and requires explicit approval — which this plan requests.

---

## 2. Objectives

Deliver the constitutional foundation every later layer builds on:

1. Repository scaffold (monorepo), CI with full supply-chain baseline, Docker Compose local dev.
2. Identity, authentication, tenancy (tenants + Customer Intelligence Domains) under an explicit **PLATFORM / TENANT / DOMAIN scope model**.
3. ABAC policy engine — four-value decision semantics with enforced obligations, fail-closed.
4. Immutable, hash-chained, concurrency-safe audit log on the authoritative commit path.
5. Canonical object base schema — single authoritative representation of the header, **four-axis temporal model** (event time, observation time, valid time, record time), database-enforced append-only behavior.
6. Canonical contract envelope + `EYE-XXX-NNN` error catalog (Volume 4 authority).
7. Transactional outbox for domain events.
8. Minimal admin UI shell (WS-19) — English content, i18n/RTL-ready foundations.

---

## 3. Implementation Roadmap (corrected — frozen layer order)

| Phase | Scope | Agents introduced |
|---|---|---|
| **Phase 0** | Foundation & governance spine (this plan) | None; agent/workload **principal model** exists from P0 (Vol 2 p25, Vol 3 Ch.23 identity requirements) |
| **Phase 1** | World Observation Layer — **L1** | Observation, Crawler, Collection agent contracts (bounded, with the connector framework they serve) |
| **Phase 2** | Intelligence Layer — **L2** (Model Gateway live) | Cleaning, Classification, Summarization, NER, Relationship agents |
| **Phase 3** | Enterprise Memory & Knowledge Graph — **L3–L4** | Knowledge Graph, Memory, Reasoning agents; entity stewardship workflows |
| **Phase 4** | Digital Twins & Prediction Engine — **L5–L6** | Twin Reconciliation, Prediction agents |
| **Phase 5** | Scenario Intelligence & Simulation Engine — **L7–L8** | Scenario, Simulation agents |
| **Phase 6** | Decision Intelligence & Executive OS — **L9–L10** | Decision, Executive Briefing, Reporting agents; Planner/Supervisor/Workflow orchestration completed |
| **Phase 7** | **System-wide agent governance, continuous learning, marketplaces, production hardening** | Governance, Learning, Red Team, Audit agents; marketplace packaging |

Two Volume 3 obligations shape this roadmap:

- **Agents are introduced progressively with the layers they serve.** The agent identity/permission substrate (principals, capability-grant schema, budgets, stop conditions) is established in Phase 0–1; Phase 7 governs and hardens an agent architecture that already exists — it is not its first appearance.
- **Cross-cutting controls are never deferred.** C-006 ("from its first production architecture") and C-035 ("not as a downstream compliance add-on") make deferral non-conformant. Every layer phase lands with its control obligations in place; Phase 7 *deepens* (red-teaming, sovereignty fixtures, deployment-parity certification, exit exercises) rather than *introduces*.
- **L3 dependency note (Vol 3 App. D):** Enterprise Memory is upstream of all layers. The Phase 0 canonical object service covers the required subset (object service, temporal record, version/correction ledger) so Phase 1 can persist evidence correctly; full L3 (retrieval, retention workflows, semantic index) remains Phase 3.

---

## 4. Technology Baseline (corrected) — ADR-P0-01

Greenfield 2026 build; no obsolete majors.

| Component | Baseline |
|---|---|
| Runtime | **Node.js 24 LTS** |
| Backend | **NestJS 11** (modular monolith — permitted by Vol 3 Ch.4 "a layer is a responsibility boundary, not a deployable unit"; ES-04-002; AI-08-005) |
| Frontend | **Next.js 16 (active LTS, fully patched)** + **React 19.2** |
| Database | **PostgreSQL 18**, latest security patch. A lower supported major may be substituted only if a documented compatibility test proves it necessary. |
| Data access | **Kysely + node-postgres**, explicit versioned SQL migrations. **No full ORM in Phase 0.** |
| Queue | Currently supported **Redis 8.x + BullMQ 5.x** combination (durable queue transport only — canonical/workflow state never lives only in Redis, per Vol 3 Ch.25/45) |
| Local dev | **Docker Compose only.** No Supabase, no Railway, no managed cloud dependencies. |
| CI | GitHub Actions |

**Version policy (recorded in DECISIONS.md):** exact dependency versions pinned via lockfile; container images pinned by digest; a documented upgrade cadence (monthly dependency review; security patches applied within the severity-appropriate window: critical ≤72h, high ≤7d, others at the monthly review); renovate-style PRs gated by the full CI suite; major-version upgrades require a compatibility test record.

---

## 5. Scope Model — PLATFORM / TENANT / DOMAIN (ADR-P0-04)

Volume 3 defines the Customer Intelligence Domain and the Shared Control Services split but no scope enum; the enum below is a Volume-4-level refinement consistent with Vol 3's constraint that platform scope may hold only routing/licensing/update/operational metadata — never customer intelligence content.

| Scope | Meaning | Constraints |
|---|---|---|
| `PLATFORM` | Shared control records: platform principals, tenant registry, policy bundle templates, platform configuration | Requires explicit **platform authority** and **system provenance**. May never contain customer intelligence content. |
| `TENANT` | Customer-level records: domains registry, tenant admins, tenant policy sets | `tenant_id` required; `domain_id` null. |
| `DOMAIN` | Customer Intelligence Domain records: all canonical intelligence objects, domain roles, domain policy | `tenant_id` + `domain_id` required. |

Rules:
- Every persisted row, message, and audit event carries an explicit `scope` plus the scope-appropriate identifiers. **Missing or ambiguous scope fails closed** (`EYE-TEN-001`).
- **Ambient tenant context is prohibited** (ES-51-002). `tenant_id`/`domain_id` are bound from the authenticated principal + routing, **never trusted from client-supplied values alone** (Vol 3 Ch.40 p.85).
- **Bootstrap:** the first platform administrator and first tenant are created by an audited, time-bound, conspicuous seed procedure running under an explicit `PLATFORM`-scoped system principal with system provenance — modeled on Vol 3's break-glass rules (time-bound, conspicuous, independently reviewable, never erases the audit path). Break-glass access is modeled from Phase 0.
- Cross-tenant and cross-domain operations are **denied by default** at both service and database level (RLS), per Vol 3 Ch.6/22.

---

## 6. Canonical Object Base Schema (corrected) — ADR-P0-05/06/07

### 6.1 Single authoritative representation
- The **authoritative representation is the typed relational row** in `objects.canonical_objects` — one column per canonical header field (Vol 7 App. E 40 fields ⊇ Vol 3 Ch.7's 8 groups / 37 fields; the delta is additive and documented in `packages/contracts`).
- Fields that are ergonomically JSON (e.g. `uncertainty`, `quality_state`) live in **typed JSONB columns validated against the registered JSON Schema on write** (CHECK constraint via validation trigger + application validation).
- **No dual authority:** there is no parallel full-header JSONB copy. Any denormalized/index projection (search docs, caches) is a **generated or constraint-verified derivation** — rebuildable, marked with source revision, never able to disagree with the authoritative row (Vol 3 App. D: projections are rebuildable views unless explicitly designated canonical).
- Every version row carries a **content digest** over the canonical byte serialization (see §8) — `object_version` is immutable and content-addressable (ES-24-002).

### 6.2 Four-axis temporal model (not "ordinary bitemporal")
Per Vol 3 Ch.20/54 the model has **four independent axes**, each with distinct semantics:

| Axis | Fields | Meaning |
|---|---|---|
| **Event time** | `event_time` | When the represented occurrence happened in the world |
| **Observation time** | `observation_time` | When a source or The Eye observed/acquired it (recorded separately — a source may report late) |
| **Valid time** | `valid_from`, `valid_to` | The world-time interval for which the assertion applies |
| **Record time** | `recorded_at` (+ system interval via version history) | When The Eye committed this version |

Plus `time_precision` and `source_clock_quality` (clock-quality context is a **required envelope family** — Vol 3 App. C p.113). Query API designed around Vol 3's five temporal modes: current / valid-at / **known-at (information boundary, no hindsight contamination)** / change-set between revisions / scenario-isolated.

### 6.3 Append-only enforced at the database level
- The application role has **INSERT + SELECT only** on canonical tables — **no UPDATE or DELETE privilege granted**, plus `BEFORE UPDATE OR DELETE` triggers that raise, as defense in depth. Verified by an automated negative test (attempt UPDATE/DELETE → rejected by the database, not the app).
- Corrections/withdrawals create new versions linked via `correction_of` / `supersedes` / `causation_id` (ADR-0005; DADR-007). Lawful deletion (retention/legal) is a governed workflow producing tombstones + `DeletionVerified` audit evidence — full implementation in Phase 3, schema slots now.

### 6.4 Truth-state enum (locked) and compatibility mappings — ADR-P0-06
**Canonical stored enum (Volume 7 Appendix E, approved):**
`observed, asserted, extracted, inferred, assessed, synthetic, decided, disputed, withdrawn`

Lifecycle state, correction state, and decision/display state are **separate dimensions** (never collapsed — Vol 9 STATE SEPARATION rule). Documented and **fixture-tested** compatibility mappings:

| Source vocabulary | Term | Canonical mapping |
|---|---|---|
| Vol 3 Ch.20 / Vol 4 Ch.27 | `claimed` | → `asserted` |
| Vol 3 / Vol 4 | `superseded` | → not a truth state; lifecycle + `supersedes` header field |
| Vol 3 App. F | `withdrawn` vs `superseded` (distinct tokens) | `withdrawn` → truth state `withdrawn`; `superseded` → lifecycle `superseded` + `supersedes` link |
| Vol 7 Ch.22 | `simulated` | → `synthetic` |
| Vol 7 Ch.22 | `corrected` | → not a truth state; new version + `correction_of` link (correction state) |
| Vol 8/Vol 9 display | `recommended` | → display state derived from object type (`Recommendation`) + truth state; not stored in `truth_state` |
| Vol 9 display | `corrected` (TS-08) | → display state derived from `correction_of` linkage |
| Vol 9 display | `indeterminate` (TS-10) | → display state when required truth state is unresolvable; storage keeps the object non-decision-active (quarantined/proposed lifecycle) |
| Vol 3 header | `synthetic_state` marker | Kept as a **separate boolean marker field** alongside `truth_state` (Vol 3 has both); consistency constraint: `truth_state = synthetic ⇒ synthetic_state = true`; fixture-tested |

Every mapping row above gets a conformance fixture in `packages/contracts` (TS-002 suite).

---

## 7. Authoritative Request Paths (non-recursive) — ADR-P0-08

### 7.1 Authoritative request sequence (corrected order)

1. **Parse and minimally validate the envelope** (structural parse; no payload processing — ES-20-002).
2. **Authenticate the principal and delegation** (human or workload; assurance level recorded).
3. **Resolve PLATFORM/TENANT/DOMAIN scope** using the **authenticated principal plus trusted routing information**. Client-supplied tenant/domain identifiers are never trusted independently (Vol 3 Ch.40); mismatch or ambiguity fails closed (`EYE-TEN-001`).
4. **Evaluate policy** (PDP; four-value decision + obligations; fail closed).
5. **Continue through full validation** (schema, provenance, temporal fields, consequence class — `EYE-PRV-001` / `EYE-TMP-001` / schema errors) **and the applicable commit path (§7.2)**.

Malformed and unauthenticated requests enter a **bounded security-audit intake**: a sanitized security event recording correlation id, failure class, and trustworthy request metadata (source, route, timestamp, envelope-shape diagnostics) — **never** credentials, tokens, untrusted payload content, or client-declared scope. The intake is rate-bounded so it cannot be used to flood the ledger.

### 7.2 Request-path taxonomy — every request has an executable audit path

| Path | Transaction contents | Outbox | Response |
|---|---|---|---|
| **Allowed command/write** | Canonical object version + `POL` + `AUD` + outbox insert in **one atomic transaction** | Yes — published asynchronously after commit | Ack only after commit |
| **Allowed consequential read/query** | `POL` + `AUD` **durable before protected data is returned**; no state change | No (unless the read itself creates an authoritative transition, in which case it is a write) | Data returned only after evidence commit |
| **Denied or indeterminate request** | `POL` + `AUD` appended atomically; **no domain object, no outbox event** | No | Policy-safe denial (`EYE-AUT-001`/`EYE-AUT-002`), no metadata leakage |
| **Authentication / envelope / validation failure** | Sanitized `AUD` security event (correlation, failure class, trustworthy metadata only) via the security-audit intake | No | Non-disclosing error (`EYE-IDN-*`, `EYE-REQ-*`) |
| **Non-consequential health/readiness endpoints** | Explicitly classified: no `POL`/`AUD` per request; served from operational telemetry; declared in the endpoint catalog as `telemetry-only` (no protected data, no state change, no scope resolution). This is a **documented classification, not a bypass**. | No | Health state incl. degraded markers |

### 7.3 Non-recursion design

`POL` and `AUD` are canonical objects (Vol 3 App. B) but their appends inside the paths above go through **bounded internal append ports** — internal module APIs exposed only to the commit pipeline, executed under an explicitly authorized **workload principal** (`system.commit-pipeline`), carrying the originating request's `correlation_id`/`causation_id`. They do **not** re-enter the public envelope→policy→audit pipeline (no policy evaluation *about* writing the policy record; no audit *of* the audit append). The internal ports enforce schema + scope + append-only invariants directly. Reads of `POL`/`AUD` through public APIs go through the full pipeline like any other object.

**Outbox rule:** *Insert the outbox record atomically in the same database transaction as the authoritative state change. Publish asynchronously only after the transaction commits.* (Vol 3 Ch.25 governed outbox; ES-17-005; ES-19-001 — events announce transitions that already committed.)

---

## 8. Audit Chain Specification — ADR-P0-09

| Concern | Specification |
|---|---|
| **Chain partitioning & scope** | One hash chain **per (scope, tenant_id) partition**: a `PLATFORM` chain plus one chain per tenant. Domain-level events chain within their tenant partition (keyed by `tenant_id`, tagged `domain_id`). Rationale: tenant isolation of verification + no cross-tenant write contention. |
| **Sequence allocation & allocator design** | Monotonic gap-free `audit_seq` per partition allocated inside the commit transaction from a **separate `audit_chain_heads` allocator table**. The allocator is **not canonical evidence**: it holds only `(partition_id, next_seq, head_hash)`, is mutable **only by a dedicated internal allocator role** (`eye_audit_allocator`), and is fully **reconstructable from the immutable ledger** (verified by a rebuild test). `audit_events` and completed `audit_seals` remain strictly INSERT-only. The privilege boundary is exact and tested: application role = INSERT on `audit_events` only; allocator role = UPDATE on `audit_chain_heads` only; no role holds UPDATE/DELETE on evidence tables. |
| **Serialization** | Transactional serialization via the per-partition `audit_chain_heads` row lock; concurrent writers to the same partition serialize on chain append only (canonical writes stay concurrent across partitions). |
| **Hash algorithm & version** | `SHA-256`, recorded per row as `hash_alg_version` (v1). Algorithm agility: new version ⇒ new sealed range boundary; verifier supports all versions. |
| **Chain formula (domain-separated, unambiguous framing)** | `row_hash = SHA-256(JCS({version, partition_id, audit_seq, previous_hash, event}))` where `version` = hash-structure version string (`"eye-audit-v1"`), `partition_id` = string, `audit_seq` = integer, `previous_hash` = lowercase hex (genesis: 64 zeros), `event` = the audit-event object per its registered JSON Schema. JCS = RFC 8785 canonical JSON, UTF-8. Field encodings for every field are defined in `packages/contracts` with **golden hash fixtures** (known input → known digest). No variable-length concatenation without framing. The same JCS canonicalization is used for object content digests. |
| **Concurrent-writer behavior** | Writers block briefly on the partition head-row lock; deadlock-free (single-lock ordering); lock wait bounded by transaction timeout; on timeout the whole transaction aborts (no partial append — the request-path transaction is atomic). |
| **Verification** | `audit verify` job + API: recompute the chain over any range against the immutable ledger and cross-check `audit_chain_heads`; scheduled full-partition verification in CI/ops; verification results are themselves audited (via internal port). |
| **Seals (pre-incident trusted checkpoints)** | Seals are created **periodically, before any incident**, as trusted checkpoints: per partition (daily and/or every N events), capturing `(range, head_hash, sealed_at, sealer identity)`. Completed seals are immutable. |
| **Tamper response** | If verification detects alteration, removal, reordering, or duplication: (1) **freeze/quarantine the affected partition** (suspend new appends for that partition; consequential operations relying on it are constrained), (2) **preserve all available copies**, (3) raise an **integrity incident** and prohibit reliance on the affected range (no non-repudiation claims), (4) **compare against the latest previously trusted seal or external anchor** to bound the damage, (5) recover through the **governed recovery procedure** (restore + re-verification + reconciliation), and (6) **never create a new "trusted" seal over a range after tampering has been detected** — the tampered range remains permanently marked; trust resumes only forward of the recovery boundary established by the governed procedure. |
| **Failure & recovery** | Audit append failure ⇒ transaction aborts ⇒ no state change, no ack (`EYE-AUD-001`, bounded retry). Restore/recovery must re-verify chain heads against the latest trusted seal records before reopening writes (`EYE-RCV-001`). `audit_chain_heads` is rebuilt from the ledger on recovery, never trusted from backup alone. |
| **DB-level immutability** | INSERT-only grants + raise-on-UPDATE/DELETE triggers on `audit_events` and `audit_seals`; `audit_chain_heads` is the sole mutable table, owned by the dedicated allocator role; separate DB roles per concern. |
| **External anchoring interface** | `AnchorSink` port (interface only in Phase 0): periodically exports `(partition, seal_head_hash)` to an external anchor (customer-side store, TSA, or transparency log later). Satisfies Vol 6 "integrity anchors" direction and Vol 3's dedicated audit-integrity key role without committing to a provider now. |

Audit event fields follow PR-62-002 / Vol 4 Ch.55: actor, delegation, action, target + versions, purpose, policy ref, result, time + clock quality, correlation/causation/trace, digest, custody, retention/legal-hold slots, plus chain fields.

---

## 9. Policy Engine — ADR-P0-10

- **Decision semantics (locked): `allow | deny | indeterminate | allow-with-obligations`** — obligations are **executed and evidenced by the enforcing boundary** (ES-13-004); `allow-with-obligations` ≡ Vol 3's "obligation" outcome; **`indeterminate` is treated as deny at the PEP** (fail-closed — Vol 3 Ch.45, ES-13-003).
- The `POL` record additionally carries Vol 3's outcome context: **exception reference, expiry, revocation state, purpose determination** — required for meaningful Decision Replay (Vol 3 Ch.22).
- **ABAC attribute model = Vol 3 Ch.22's six dimensions**: Principal (identity, role, workload/agent owner, assurance, session), Purpose (declared purpose, legal basis, expected outcome), Object (scope, owner, classification, residency, truth state, lifecycle), Action, Environment (deployment cell, network, time, threat state, operational mode), Obligation set. Consequence class (C0–C4, Vol 5 Ch.58) rides on Intent.
- PDP = `policy` module (versioned, signed-at-release policy bundles; v1 bundle = RBAC rules expressed in the ABAC model); PEP = global NestJS guard/interceptor at the API boundary **plus** database RLS as the independent second enforcement (Vol 3: "service and data boundaries independently enforce the same decision").
- Default deny on anything missing (ES-50-002). Cached decisions scope- and time-bounded and revocation-aware (ES-50-001).
- Separation of duties: platform administration ≠ business decision authority (PER-18 rule); admin access uses the same policy system with stronger assurance (ES-50-004).

---

## 10. Data Model (Phase 0 tables, by owning schema)

- **`identity`**: `principals` (kinds: human, workload, agent; scope-tagged), `credentials` (argon2id, short-lived tokens), `sessions`, `roles`, `role_bindings` (scope-tagged), `delegations` (schema), `break_glass_grants` (time-bound, conspicuous).
- **`tenancy`**: `tenants`, `domains` (CID: immutable id, lifecycle, residency/retention profile), `domain_lifecycle_events`.
- **`policy`**: `policy_bundles` (versioned, digest), `policy_decisions` (POL: full ABAC input digest, decision, obligations, exception/expiry/revocation, bundle version).
- **`audit`**: `audit_events` (hash-chained per partition), `audit_partitions` (sequence rows), `audit_seals`. INSERT-only role.
- **`objects`**: `canonical_objects` (typed 40-field header + validated JSONB payload + content digest; unique `(object_id, object_version)`), `object_outbox`, `schema_registry` (DC-01…16 compatibility enforcement).
- **`config`**: `config_revisions` (namespaced `eye.*`, schema-validated, versioned, approver).

All tables carry `scope` (+ `tenant_id`/`domain_id` per scope rules) and RLS policies. All canonical + audit tables are INSERT-only at the privilege level.

---

## 11. Module / File Structure

```
/apps
  /api                 # NestJS 11
    /src/modules
      /identity        # auth, principals (human+workload), sessions, federation port, break-glass
      /tenancy         # tenants, domains, governed lifecycle, scope resolution
      /policy          # PDP, bundles, POL records (public API + internal append port)
      /audit           # hash-chained ledger, seals, verifier, AnchorSink port (internal append port)
      /objects         # canonical object service, schema registry, outbox, commit pipeline
      /config          # namespaced validated config
      /shared          # envelope interceptor, error catalog, id issuer (UUIDv7), canonical JSON (JCS)
  /web                 # Next.js 16 admin shell (WS-19)
/packages
  /contracts           # JSON Schemas: envelope, header, errors, truth-state mappings; generated TS; golden fixtures
  /tokens              # Vol 9 design tokens → CSS vars + tailwind preset (light/dark)
/docs                  # spec volumes (0–10 + master prompt)
PROGRESS.md  DECISIONS.md  EXCEPTIONS.md  PHASE0_PLAN.md
docker-compose.yml  .github/workflows/ci.yml
```

Boundary rules enforced in CI (dependency-cruiser, blocking): `web → contracts/tokens only`; API modules integrate through declared module contracts only — never each other's persistence schemas; internal append ports importable only by the commit pipeline.

---

## 12. CI / Supply-Chain Baseline (Phase 0 — not deferred)

- Lint, typecheck, unit + conformance + e2e suites, module dependency-boundary check (ES-65-003).
- **SBOM generation** (CycloneDX) per build artifact.
- **Dependency vulnerability scanning** (audit + OSV) and **container image scanning** (Trivy or equivalent) — blocking at severity thresholds.
- **Secret scanning** (gitleaks or equivalent) — blocking.
- **License inventory** — generated per build, allowlist-checked.
- Lockfile-pinned dependencies; container images pinned by digest; no mutable tags (IA-68-003).
- Cross-tenant negative tests (TS-007), schema conformance fixtures (TS-002), policy fail-closed tests (TS-006), audit tamper + concurrency tests run in CI.
- Artifact **signing/attestation** remains a recorded exception (bounded, inactive capability — see EXCEPTIONS.md) with expiry before Phase 2; SBOM/scanning/secrets/licensing are **in** Phase 0.

---

## 13. Admin UI Shell (WS-19) — English + i18n/RTL foundations

- English content first. **Established in Phase 0:** i18n infrastructure (message catalog, no hardcoded strings), **logical CSS properties throughout** (no left/right physical properties), bidirectional layout support (`dir` attribute plumbing, RTL-safe components, icon mirroring policy), locale-aware number/date formatting with canonical instants stored. Arabic translation follows before external release (GLB-14).
- Design tokens from Vol 9 Appendix A as CSS variables (light + dark), Tailwind mapped to semantic aliases only, 4px scale, no arbitrary values (UX-ADR-010).
- **Optimistic UI prohibited for consequential state** (UX-ADR-017) — commands render from authoritative receipts (PAT-19).
- Screens: login; tenant & domain management (governed creation with impact preview); user/role management; canonical object browser (truth-state badges TS-01…10, version history, provenance trail, as-of view); audit event viewer (read-only, chain-verification status); policy decision panel (HX-17); health/degraded banner (fail closed on ambiguous tenant — WS-19 continuity rule).
- Server-side enforcement only — "a front-end visibility rule is not an access control" (Vol 3 Ch.22).

---

## 14. Final ADR List (to be recorded in DECISIONS.md on approval)

| ID | Title | Anchors |
|---|---|---|
| ADR-P0-01 | Technology baseline & version/patching policy (Node 24 LTS, NestJS 11, Next.js 16, React 19.2, PostgreSQL 18, Kysely, Redis/BullMQ supported combo; pinned versions + digests; upgrade cadence) | §4 |
| ADR-P0-02 | Modular monolith: one NestJS module per canonical layer/control-plane concern; contract-only integration; CI boundary enforcement | Vol 3 Ch.4; ES-04-002/003; ES-65-003 |
| ADR-P0-03 | Control-plane component namespace `CP-*` (identity/policy/audit/trust) as a Volume-4-level extension — Vol 3 allocates no control-plane component IDs | Vol 3 App. A gap |
| ADR-P0-04 | PLATFORM/TENANT/DOMAIN scope model; server-derived tenant binding; fail-closed ambiguity; audited bootstrap under system principal; break-glass modeled from P0 | §5; Vol 3 Ch.6/22/40 |
| ADR-P0-05 | Canonical header: single authoritative typed representation; Vol 7 App. E 40 fields as additive refinement of Vol 3's 8 groups; constraint-verified derivations only | §6.1 |
| ADR-P0-06 | Truth-state enum: Vol 7 App. E nine values; separate lifecycle/correction/display dimensions; documented + fixture-tested compatibility mappings incl. `synthetic_state` marker consistency | §6.4 |
| ADR-P0-07 | Four-axis temporal model (event/observation/valid/record time) + clock quality; five temporal query modes; DB-privilege-level append-only | §6.2–6.3; ADR-0004/0005 |
| ADR-P0-08 | Authoritative request paths: authenticate → resolve scope → policy order; five-path taxonomy (write / consequential read / denied / failure / health); bounded internal append ports for POL/AUD under `system.commit-pipeline`; sanitized security-audit intake | §7 |
| ADR-P0-09 | Audit chain: per-(scope,tenant) partitions; `audit_chain_heads` allocator table (dedicated mutable role, ledger-reconstructable, not evidence); domain-separated hash `SHA-256(JCS({version, partition_id, audit_seq, previous_hash, event}))` + golden fixtures; pre-incident seals; tamper response (freeze, preserve, incident, compare vs trusted seal, governed recovery, no re-sealing); AnchorSink interface | §8 |
| ADR-P0-10 | ABAC policy engine: four-value decisions + enforced obligations; indeterminate→deny at PEP; POL carries exception/expiry/revocation; Vol 3 six-dimension attribute model; RLS as independent second enforcement | §9 |
| ADR-P0-11 | Identifiers: UUIDv7 from central issuer module; non-semantic; namespaced; alias/merge history slots reserved | ES-25; DAT-SM-04 |
| ADR-P0-12 | Transactional outbox: atomic insert with state change; async publish post-commit; events immutable, corrections are new events via causation/supersession | §7; Vol 3 Ch.25/Ch.8 |
| ADR-P0-13 | Envelope + error catalog as `packages/contracts` (JSON Schema source of truth, JCS canonicalization, generated TS); Vol 4 owns error semantics | Vol 3 App. C; Vol 4 App. D/E |
| ADR-P0-14 | Design tokens as CSS variables from Vol 9 registry; semantic aliases only; no optimistic UI for consequential state; i18n/logical-CSS/RTL foundations in P0 | §13 |
| ADR-P0-15 | Config: schema-validated versioned `eye.*` namespaces; `.env` local-only (recorded exception) | ES-66; Vol 4 App. H |
| ADR-P0-16 | Supply-chain baseline in P0 CI (SBOM, dependency/container/secret scanning, license inventory); artifact signing deferred by bounded exception | §12 |

---

## 15. Milestones

| M | Deliverable | Demo |
|---|---|---|
| M1 | Scaffold: monorepo, CI incl. supply-chain baseline (§12), Compose (postgres 18 + redis), config module, tokens package, conformance manifest, boundary linting | `docker compose up` reproducible from clean clone; CI green |
| M2 | Identity + tenancy + scope model: principals (human/workload), sessions, JWT, bootstrap seed, governed tenant + domain creation, roles, break-glass schema | Bootstrap → platform admin login → create tenant → create domain → assign role; ambiguous scope fails closed |
| M3 | Envelope + errors + policy engine: interceptor validates before processing; PDP/PEP four-value semantics; obligations enforced; RLS active; decisions as POL records | Denied call returns `EYE-AUT-001` with policy explanation; indeterminate → deny; obligation (e.g. logging/redaction) demonstrably executed |
| M4 | Audit ledger: partitioned hash chains, `audit_chain_heads` allocator (dedicated role, ledger-reconstructable), domain-separated JCS hash + golden fixtures, pre-incident seals, verifier, tamper-response semantics, security-audit intake, concurrency tests | Every M2/M3 action in audit query per its request path (§7.2); tamper fixture → partition frozen, incident raised, comparison against last trusted seal, **no new trusted seal over the tampered range**; allocator rebuilt from ledger; concurrent-writer test proves gap-free chains |
| M5 | Canonical object service + commit pipeline: 12-step path, header validation, versioning, provenance rejection, correction linkage, as-of retrieval, outbox publish | Create → version → correct → as-of query at earlier record time; write w/o provenance rejected `EYE-PRV-001`; DB-level UPDATE/DELETE rejection demo |
| M6 | Admin UI shell: login, tenants/domains, users/roles, object browser (truth-state badges, version history, provenance, as-of), audit viewer + chain status, policy panel; i18n/RTL-ready | Full walkthrough, light + dark, keyboard-navigable |
| M7 | E2E acceptance suite covering §16, seeds, demo script, Phase Report | All 15 acceptance criteria pass end-to-end |

Estimated effort: **~3–4.5 weeks** focused build (supply-chain CI and audit concurrency work added vs. Revision 1).

---

## 16. Phase 0 Acceptance Criteria (final)

1. Authorized platform administrator authentication.
2. Governed tenant and domain creation.
3. Explicit PLATFORM/TENANT/DOMAIN scope on every persisted record and request; ambiguity fails closed.
4. Every successful, denied, and failed API request correlated and audited **through its defined executable request path (§7.2)** — including consequential reads (POL+AUD durable before data return), denials (POL+AUD, no object/outbox), failures (sanitized security intake), and classified health endpoints.
5. Four-value ABAC decision semantics with enforced obligations.
6. Canonical object creation, versioning, correction, and as-of retrieval (known-at semantics without hindsight contamination).
7. Rejection of writes without valid provenance.
8. Database-level rejection of canonical UPDATE/DELETE (privilege + trigger, proven by negative test).
9. Concurrent audit-chain integrity (gap-free monotonic sequences under concurrent writers; exact privilege boundary tested; tamper detection with freeze/quarantine + incident + no re-sealing of tampered ranges; allocator reconstructable from the ledger).
10. Transactional object + policy + audit + outbox consistency (all-or-nothing commit; ack only after commit; async publish after commit).
11. Cross-tenant negative tests pass without metadata leakage.
12. Fully local reproducible startup with Docker Compose.
13. CI enforces boundaries, schema conformance, security scans (SBOM, dependency, container, secrets, licenses), and all test suites.
14. English UI with i18n/logical-CSS/RTL-ready foundations.
15. No constitutional invariant hidden inside EXCEPTIONS.md (verified in review — see §17).

---

## 17. Exception Register — Schema and Phase 0 Entries

**Rigor rule (locked):** constitutional requirements are not waivable. Exceptions may only cover **bounded, inactive, or deferred capabilities** and must never weaken human authority, provenance, temporal truth, tenant isolation, audit integrity, fail-closed authorization, or explainability. "Later" is not a valid expiry.

### Schema (every entry in EXCEPTIONS.md)

```yaml
exception_id:            EXC-P0-NNN
requirement_ids:         [e.g. IA-52-003, IC-14]        # spec requirement IDs
invariant_ids:           [e.g. C-039]                   # constitutional invariants touched (must be none weakened)
title:
owner:                                                  # accountable person
approver:                                               # named approving authority
reason:
risk:                                                   # what could go wrong while the exception is open
consequence_class:       C0–C4
affected_profiles:       [local-dev | saas | private-cloud | on-premise]
compensating_controls:   []
prohibited_exposure:                                    # usage/exposure banned while open (e.g. "no external deployment")
expiry_date:             YYYY-MM-DD                     # exact date
expiry_milestone:                                       # bound milestone (e.g. "before Phase 2 gate")
exit_criteria:                                          # what closes it
required_evidence:                                      # proof needed at closure
status:                  open | mitigated | closed | expired
```

### Phase 0 entries (proposed)

| ID | Exception | Consequence class | Compensating controls | Prohibited exposure | Expiry |
|---|---|---|---|---|---|
| EXC-P0-001 | Audit chains in the primary PostgreSQL cluster (separate schema + INSERT-only role) instead of an independent audit store/failure domain (INF-ST-03, DR-11). **Honest risk statement: this exception touches audit resilience and integrity risk — the ledger shares the primary database failure domain, so a cluster-level compromise or loss affects both state and its evidence.** Append-only, tamper-detection, and fail-closed semantics are NOT waived. | C2 | Hash chains + pre-incident seals + verifier; separate DB roles with exact privilege boundary; independently verified audit-schema backups; AnchorSink interface reserved for external anchoring | No production/customer deployment | **2026-10-31** / before Phase 3 gate |
| EXC-P0-002 | Local credential IdP (no external OIDC/SAML federation, no MFA) — federation port defined, adapter deferred (IA-49, IC-01) | C2 | argon2id, short-lived tokens, session assurance recorded, break-glass audited | No external deployment; no real customer data | **2026-10-31** / before first external deployment |
| EXC-P0-003 | No artifact signing/provenance attestation (IC-14/16); SBOM + scanning ARE active | C2 | Digest-pinned images; lockfiles; CI provenance retained | No production promotion of unsigned artifacts beyond local/dev | **2026-09-30** / before Phase 2 gate |
| EXC-P0-004 | Single deployment profile (local Compose); parity fixtures harness built but exercised on one profile (IA-03-006) | C1 | Conformance fixtures written profile-agnostically from P0 | No parity claims | **2026-12-31** / first multi-profile milestone |
| EXC-P0-005 | `.env` secrets for local dev (IA-52-003 static-credential exception) | C1 | Secret scanning in CI; no production credentials exist; scratch env only | Local dev only | **2026-10-31** / with EXC-P0-002 |

**Exception posture statement (corrected):** no exception waives the constitutional semantics — human authority, provenance, temporal truth, tenant isolation, append-only audit with tamper detection, fail-closed authorization, and explainability remain fully enforced. Specific **resilience and assurance risks do remain open** while exceptions are active (notably EXC-P0-001's shared failure domain and EXC-P0-002's local-only identity assurance); each is bounded by its compensating controls and prohibited-exposure terms, and verified honest-as-stated in review (acceptance criterion 15). The fully-populated register lives in [EXCEPTIONS.md](EXCEPTIONS.md).

---

## 18. Test Strategy

- **Unit** (Vitest) per module; **golden conformance fixtures** for header, envelope, errors, truth-state mappings, JCS canonicalization (TS-001/TS-002).
- **Policy suite** (TS-006): decision-table coverage, fail-closed (PDP down → deny), indeterminate→deny, obligation enforcement, bundle versioning, RLS independent enforcement.
- **Tenant isolation** (TS-007): cross-tenant/cross-domain attempts through every path (API, object browser, audit query, outbox) — denied without metadata leakage (counts/errors/timing).
- **Audit**: durability-before-ack; golden hash fixtures (JCS structure, known input → known digest); tamper (alter/remove/reorder/duplicate → detected → partition frozen, incident, compare vs last trusted seal, no re-seal of tampered range); **concurrency** (parallel writers, gap-free monotonic sequences); privilege-boundary tests (app role cannot UPDATE heads; allocator role cannot touch evidence); allocator rebuild-from-ledger; recovery re-verification.
- **Request paths**: each §7.2 path exercised — consequential read evidence-before-data, denial without object/outbox, sanitized failure intake (proves no credentials/payload/client-scope retained), health-endpoint classification.
- **Temporal/immutability**: DB-level UPDATE/DELETE rejection; version monotonicity; as-of (known-at) correctness incl. correction non-contamination.
- **Commit path**: fault injection at every step 4–9 → full rollback, no partial state, no ack.
- **E2E** (Playwright): the 15 acceptance criteria as scripted journeys, keyboard-navigable, light+dark.
- A phase is not complete with failing tests.

---

**Awaiting final approval. No application code has been written.**
