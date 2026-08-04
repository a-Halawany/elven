# THE EYE — Phase 0 Report: Foundation & Governance Spine

> Status: **COMPLETE — all 15 acceptance criteria pass with reproducible evidence** (21-test acceptance suite green, 2026-08-04).
> Plan: [PHASE0_PLAN.md](PHASE0_PLAN.md) (Rev 3) · ADRs: [DECISIONS.md](DECISIONS.md) · Exceptions: [EXCEPTIONS.md](EXCEPTIONS.md) · Log: [PROGRESS.md](PROGRESS.md)

---

## 1. What was built

| Area | Delivered |
|---|---|
| **Monorepo** | pnpm workspace: `apps/api` (NestJS 11, Node 24 LTS), `apps/web` (Next.js 16 / React 19.2), `packages/contracts`, `packages/tokens`; dependency-cruiser module boundaries as a blocking CI check |
| **Contracts** | RFC 8785 JCS canonicalization + golden fixtures; canonical envelope schema (scope-conditional rules); 40-field canonical header schema; `EYE-XXX-NNN` error catalog (28 codes); truth-state enum (Vol 7 App. E, 9 values) with fixture-tested cross-volume compatibility mappings; audit hash structure `SHA-256(JCS({version, partition_id, audit_seq, previous_hash, event}))` with frozen golden digests |
| **Identity & tenancy** | Principals (human/workload/agent), argon2id credentials, revocable sessions with continuous re-check, short-lived kid-rotatable JWTs; governed tenant/CID creation with append-only lifecycle evidence; PLATFORM/TENANT/DOMAIN scope model; audited one-shot conspicuous bootstrap; break-glass schema |
| **Policy** | ABAC PDP: `allow / deny / indeterminate / allow-with-obligations`; obligations executed at the enforcing boundary (audit mask → sanitized projection); indeterminate→deny; purpose required; C3+ denied fail-closed (no human-gate runtime yet); POL records carry exception/expiry/revocation + input digest; PEP + Postgres RLS as independent second enforcement |
| **Audit** | Per-(scope,tenant) hash chains; `audit_chain_heads` allocator (dedicated role, SECURITY DEFINER advance/commit pair, rebuild-from-ledger); typed columns GENERATED from canonical bytes (single authority); pre-incident seals; tamper response = freeze + incident + compare-to-trusted-seal + **no re-sealing**; sanitized rate-bounded security intake; `AnchorSink` reserved |
| **Request pipeline** | Corrected order (envelope → authenticate → scope from principal+routing → policy → validate → commit); five executable request paths (write / consequential read / denied / failure / health-telemetry-only); bounded internal append ports under `system.commit-pipeline`; ack only after commit |
| **Canonical objects** | Typed 40-field header as the authoritative representation; four-axis temporal model; DB-privilege-level append-only (+ CHECK constraints incl. minimum provenance); non-destructive correction with `correction_of`/`supersedes`; current / **known-at** (no hindsight contamination) / history retrieval; schema registry (DC-compatibility slots); transactional outbox → BullMQ post-commit publication |
| **WS-19 shell** | Vol 9 token-driven (semantic CSS variables, light+dark, logical properties/RTL-safe); login; governed tenant/domain creation with review step; principals; object browser (3-channel truth badges, version history, known-at query); audit viewer (sanitized projection, chain verify); receipts only from authoritative responses (no optimistic UI); i18n catalog (en, ar slot) |
| **CI / supply chain** | boundaries, typecheck, build, unit+conformance, migrations+integration, **acceptance suite**, SBOM (CycloneDX), pnpm audit, gitleaks, Trivy, license inventory — all blocking |

## 2. How to run and demo

```bash
./scripts/demo.sh
```

Compose up → build → migrate → audited bootstrap → API :3401 + shell :3000 → acceptance suite. Login `platform-admin` / `bootstrap-local-dev-1`. Walkthrough: Tenants (review-step create) → Users & Roles → Canonical Objects (create claim; empty evidence ⇒ `EYE-PRV-001`; open object ⇒ history + known-at) → Audit Ledger (Verify chain).

## 3. Test results

| Suite | Result |
|---|---|
| contracts unit + golden fixtures | 24/24 |
| tokens | 3/3 |
| API unit (PDP decision table, scope fail-closed) | 14/14 |
| API integration (privilege boundary, 16-writer gap-free concurrency, rollback no-gap, allocator rebuild, tamper freeze, RLS negatives, DB-level immutability) | 14/14 |
| **Acceptance (15 criteria + §7.2 request paths)** | **21/21** |

Browser-verified live: login → overview (health) → objects (v1/v2 history, badges) → audit (chain intact, head matches).

## 4. Acceptance criteria — evidence map

| # | Criterion | Evidence |
|---|---|---|
| 1 | Platform admin authentication | AC-1 tests (login audited; failures → sanitized intake, no credentials stored) |
| 2 | Governed tenant/domain creation | AC-2 (receipts with POL id + audit seq; lifecycle events) |
| 3 | Explicit scopes, fail closed | AC-3 (envelope/resolved scope mismatch → `EYE-TEN-001`); envelope schema scope rules |
| 4 | Every request audited via its path | AC-4 suite: write (POL+AUD+outbox atomic), read (evidence before data, no outbox), denied (POL+AUD, no object), failure (sanitized intake), health (zero audit rows) |
| 5 | 4-value ABAC + enforced obligations | AC-5 (mask executed — raw event bytes absent from response; purpose-missing → deny) + PDP unit table |
| 6 | Create/version/correct/as-of | AC-6 (correction_of link; stale `EYE-STA-002`; known-at returns v1 after correction) |
| 7 | Provenance rejection | AC-7 (`EYE-PRV-001`) + DB CHECK constraint test |
| 8 | DB-level UPDATE/DELETE rejection | AC-8 + integration (privilege + trigger, incl. superuser trigger block) |
| 9 | Concurrent chain integrity | Integration (16 parallel writers gap-free; tamper → freeze+incident+no-reseal; allocator rebuild) + AC-9 API verify ok |
| 10 | Transactional consistency | AC-4 denied-path object-count invariance; integration rollback-no-gap |
| 11 | Cross-tenant negatives, no leakage | AC-11 (denial carries no target-tenant metadata) + RLS integration suite |
| 12 | Reproducible local startup | demo.sh + CI service containers; AC-12 readyz db:true |
| 13 | CI enforcement | AC-13 (workflow content asserted) + the workflow itself |
| 14 | English UI, i18n/RTL-ready | AC-14 (catalog, ar/rtl support, logical-CSS-only check) + browser walkthrough |
| 15 | No invariant hidden in exceptions | AC-15 (honest-posture text, all required fields, no "later" expiries) |

## 5. Deviations from plan (with reasons)

1. **API default port 3401** (plan: 3001) — 3001 occupied by an unrelated local service.
2. **E2E via API-level acceptance suite + live browser walkthrough instead of Playwright** — deterministic, CI-runnable evidence for all criteria was achievable without adding a browser-automation dependency in Phase 0; the UI journey was verified live in-browser (screenshots in session). Playwright lands with Phase 1 hardening if desired.
3. **Edge controllers for identity-admin/audit live in the pipeline module** — avoids module cycles while services stay with their owning modules; documented in code (ES-04-004: controllers are access modes).
4. **Migration 0005** re-created `rebuild_chain_heads` with an explicit PLATFORM context (RLS blocked its ledger read) — caught by the allocator-rebuild integration test.
5. **`occurred_at` generated column is ISO-8601 text** (timestamptz cast is not IMMUTABLE in PG18 generated columns); lexicographic = chronological for Z-normalized strings.

## 6. Technical debt / carried risks

- EXC-P0-001…005 all open, within expiry (earliest: 2026-09-30 artifact signing).
- Human-gate runtime absent by design (Phase 6); C3+ consequence classes fail closed until then.
- Outbox consumer is publish-only (no downstream consumer yet — arrives with L1 in Phase 1).
- BullMQ 6 requires app-supplied `ioredis`; pinned in lockfile.
- Web `sessionStorage` token storage is local-dev-profile only; revisit with EXC-P0-002 closure.

## 7. Next: Phase 1 Plan (L1 — World Observation Layer)

Per the corrected roadmap: connector framework + source registry with source contracts (authority, rights, purpose, freshness, classification, correction behavior); three connectors (RSS/news, file upload PDF/DOCX/CSV, generic REST poller); immutable raw evidence preservation (`SRC`/`OBS`/`EVD` object types); source health + coverage views; correction intake propagating downstream; Observation/Crawler/Collection agent contracts (bounded). A Phase 1 Plan will be presented for approval before implementation, per protocol.
