# THE EYE — Phase 0 Report: Foundation & Governance Spine

> Status: **COMPLETE + GATE-2 CLOSED** — all 15 acceptance criteria pass with reproducible evidence (34-test acceptance suite plus the 17-test Gate-2 adversarial matrix; see [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md) for `SOURCE_CANDIDATE_SHA`, `EVIDENCE_ATTESTATION_SHA` and the isolated clean-checkout transcript).
> Plan: [PHASE0_PLAN.md](PHASE0_PLAN.md) (Rev 3) · ADRs: [DECISIONS.md](DECISIONS.md) · Exceptions: [EXCEPTIONS.md](EXCEPTIONS.md) · Log: [PROGRESS.md](PROGRESS.md)

---

## 1. What was built

| Area | Delivered |
|---|---|
| **Monorepo** | pnpm workspace: `apps/api` (NestJS 11, Node 24 LTS), `apps/web` (Next.js 16 / React 19.2), `packages/contracts`, `packages/tokens`; dependency-cruiser module boundaries as a blocking CI check |
| **Contracts** | RFC 8785 JCS canonicalization + golden fixtures (with a byte-for-byte equivalent in-database implementation, Gate-2 G4); canonical envelope schema (scope-conditional rules); explicit canonical header registry — **40 authoritative Volume 7 Appendix E fields + 3 governed extensions = 43 stored fields**; `EYE-XXX-NNN` error catalog (28 codes); truth-state enum (Vol 7 App. E, 9 values) with fixture-tested cross-volume compatibility mappings; audit hash structure `SHA-256(JCS({version, partition_id, audit_seq, previous_hash, event}))` with frozen golden digests |
| **Identity & tenancy** | Principals (human/workload/agent) with unique login identifiers, argon2id credentials, revocable sessions with continuous re-check, short-lived kid-rotatable JWTs carrying the session context key, append-only refresh-token family ledger; governed tenant/CID creation; exact-match PLATFORM/TENANT/DOMAIN isolation; database-enforced single-use audited bootstrap; break-glass schema |
| **Policy** | ABAC PDP: `allow / deny / indeterminate / allow-with-obligations`; obligations executed at the enforcing boundary (audit mask → sanitized projection); indeterminate→deny; purpose required; C3+ denied fail-closed (no human-gate runtime yet); POL records carry exception/expiry/revocation + input digest; PEP + Postgres RLS as independent second enforcement |
| **Audit** | Per-(scope,tenant) hash chains; `audit_chain_heads` allocator (dedicated role, SECURITY DEFINER advance/commit pair, rebuild-from-ledger); typed columns GENERATED from canonical bytes (single authority); pre-incident seals; tamper response = freeze + incident + compare-to-trusted-seal + **no re-sealing**; sanitized rate-bounded security intake; `AnchorSink` reserved |
| **Request pipeline** | Corrected order (envelope → authenticate → **bound context** → policy → validate → commit) across six least-privilege authorities; five executable request paths (write / consequential read / denied / failure / health-telemetry-only) plus a centralized durable rejection path; POL/AUD built inside the database trusted boundary; **fail-closed 503 + independent fsynced degraded journal + degraded `/readyz`** when audit persistence is unavailable; ack only after commit |
| **Canonical objects** | Typed 43-column header (40 authoritative + 3 governed) as the authoritative representation, written ONLY through `objects.admit_version` with server-side digest recomputation; four-axis temporal model; DB-privilege-level append-only (+ CHECK constraints incl. minimum provenance); non-destructive correction with `correction_of`/`supersedes`; current / **known-at** (no hindsight contamination) / history retrieval; schema registry (DC-compatibility slots); transactional outbox → BullMQ post-commit publication |
| **WS-19 shell** | Vol 9 token-driven (semantic CSS variables, light+dark, logical properties/RTL-safe); login; governed tenant/domain creation with review step; principals; object browser (3-channel truth badges, version history, known-at query); audit viewer (sanitized projection, chain verify); receipts only from authoritative responses (no optimistic UI); i18n catalog (en, ar slot) |
| **CI / supply chain** | Three jobs (`build-test`, `browser-regression`, `supply-chain`): boundaries, clean-source typecheck **before** build (blocking, no stale artifacts), unit+conformance, migrations+integration, **acceptance suite**, Playwright browser gate, SBOM (CycloneDX, fails on empty), pnpm audit, gitleaks, license inventory, `trivy fs` (labeled) + `trivy image` of the exact pinned digests (blocking HIGH/CRITICAL) — all blocking. Local-equivalent evidence for this local-only gate; hosted CI is not claimed. |

## 2. How to run and demo

```bash
./scripts/demo.sh
```

Compose up → build → migrate → audited bootstrap → API :3401 + shell :3000 → acceptance suite.

**Bootstrap identity (ADR-P0-17):** the bootstrap secret is **environment-generated and one-time** — `demo.sh` generates it via `openssl rand -base64 24` into `$EYE_BOOTSTRAP_PASSWORD` (this shell only; never committed, never logged, unique per environment). The credential is created `must_rotate` with a 24-hour unused-expiry (then permanently revoked); the **first sign-in forces rotation** — the bootstrap session is denied every governed action by the PDP until a new password is set, and rotation revokes all sessions. The bootstrap path is structurally restricted to `local|test` runtime environments and cannot operate against production or real customer data.
Sign in as `platform-admin` with `$EYE_BOOTSTRAP_PASSWORD`, complete the forced rotation, then walk through: Tenants (review-step create) → Users & Roles → Canonical Objects (create claim; empty evidence ⇒ `EYE-PRV-001`; open object ⇒ history + known-at) → Audit Ledger (Verify chain).

> Historical note: the original Phase 0 demo used a documented shared credential (`bootstrap-local-dev-1`). During gate closure it was **treated as exposed and revoked** (credential, binding, and sessions), and the one-time mechanism above replaced it — see ADR-P0-17 and SEC-P0-001 in [EXCEPTIONS.md](EXCEPTIONS.md). The literal appears here only as historical evidence of the remediated exposure.

## 3. Test results

| Suite | Result |
|---|---|
| contracts unit + golden fixtures + header registry/digest binding | 118/118 |
| tokens | 3/3 |
| API unit (PDP decision table, scope fail-closed) | 14/14 |
| API integration (Gate-2 adversarial matrix, domain-isolation matrix, audit-chain concurrency + tamper, recovery-authority separation) | 70/70 |
| **Acceptance (15 criteria + §7.2 request paths + R4/R10 #6/#7/#8)** | **34/34** |

> Test counts above are the **post-Gate-2** figures (SOURCE_CANDIDATE_SHA in `evidence/git-metadata.txt`). Earlier figures (24/24 contracts, 14/14 then 38/38 integration, 21/21 acceptance) are historical — see [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md) §H.

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
2. **Playwright deferral — historical deviation, remediated during gate closure.** Phase 0 initially shipped an API-level acceptance suite plus a live browser walkthrough instead of the planned Playwright suite. During gate closure the gap was closed: `e2e/phase0.spec.ts` covers ten scenarios (login, governed creation with review step, ambiguous-scope fail-closed, cross-tenant denial without leakage, v1→v2 correction, known-at pre-correction, policy denial + obligation evidence, audit viewer + chain integrity, keyboard/a11y, light/dark + RTL) and runs as a blocking `browser-regression` CI job. It is now part of the standing Phase 0 regression gate.
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
