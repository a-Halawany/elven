# THE EYE — Progress Log

| Phase | Layers | Status | Notes |
|---|---|---|---|
| Phase 0 — Foundation & Governance Spine | Cross-cutting | **COMPLETE + INVARIANT-REMEDIATED 2026-08-05** | Report: [PHASE0_REPORT.md](PHASE0_REPORT.md). Plan: [PHASE0_PLAN.md](PHASE0_PLAN.md) (Rev 3). Remediation: [PHASE0_INVARIANT_REMEDIATION_PLAN.md](PHASE0_INVARIANT_REMEDIATION_PLAN.md) (R1–R10). Evidence: [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md). ADRs: [DECISIONS.md](DECISIONS.md). Exceptions: [EXCEPTIONS.md](EXCEPTIONS.md) (5 open P0 in-date; 2 P1 proposed). |

## Invariant-remediation gate (2026-08-05)

Candidate reviewed: `ce1ee0d`. Source inspection found invariant violations the green suite did not detect; the bounded remediation R1–R10 was authorized and executed. Final candidate: **`GATE_CANDIDATE_SHA`** (see `evidence/git-metadata.txt`). Migration range extended to **0001–0008** (0008 = signed request context + DOMAIN-aware FORCE-RLS matrix, PUBLIC-EXECUTE revocation + bounded append/seal/recovery ports, refresh-token rotation with reuse detection, identity integrity, temporal constraint). Suites at the final SHA: contracts **118**, tokens **3**, api unit **14**, integration **38** (domain-isolation, privileges, audit-chain incl. concurrent append-vs-verify/seal, refresh), acceptance **34** (15 criteria + §7.2 + R4/R10 #6/#7/#8), Playwright **10**. Supply chain: non-empty CycloneDX SBOM (280 components) + prod/dev license reconciliation; `pnpm audit` **0**; exact-image Trivy scans of the pinned postgres:18-alpine / redis:8-alpine digests **clean at HIGH/CRITICAL** under dated `.trivyignore` dispositions. No Phase 1/L1 application code written.

## Milestone log

| M | Status | Evidence |
|---|---|---|
| M1 Scaffold | **DONE 2026-08-03** (commit `dbb2e31`) | contracts 24 tests + tokens 3 tests green; golden audit-hash fixture frozen; boundaries clean (42 modules); API boots, `/healthz` + `/readyz` (db:true, telemetry-only classified); web builds; Compose (postgres:18+redis:8) healthy; migration 0001 applied (roles + schemas + append-only guard); CI with SBOM/audit/gitleaks/Trivy/license inventory. Deviation: API default port 3401 (3001 occupied locally). Risks: none new. Next: M2. |
| M2 Identity+tenancy | **DONE 2026-08-04** (commits `c619776`, `bc70bd6`) | Migrations 0002 (principals/credentials/sessions/roles/bindings/break-glass, tenants/domains/lifecycle-events, RLS fail-closed, SECURITY DEFINER auth lookups); login/refresh/verify with continuous session re-check; audited one-shot bootstrap on PLATFORM partition; governed tenant/domain creation; scope resolution from authenticated principal + trusted routing only. Tests: scope unit suite; RLS isolation integration suite (5 tests incl. cross-tenant INSERT rejection). |
| M3 Policy engine | **DONE 2026-08-04** (commit `bc70bd6`) | Envelope guard (validate before payload + digest check); EYE-XXX-NNN catalog wired; PDP 4-value decisions + enforced obligations (mask executed as sanitized projection); indeterminate→deny; C3+ fail-closed (no human-gate runtime); POL records with exception/expiry/revocation + input digest; PEP + RLS dual enforcement. Tests: 8 PDP decision-table cases. |
| M4 Audit ledger | **DONE 2026-08-04** (commit `bc70bd6`) | Partitioned chains; audit_chain_heads allocator (dedicated role, advance/commit SECURITY DEFINER pair, rebuild-from-ledger incl. RLS-context fix migration 0005); domain-separated SHA-256(JCS) + frozen golden fixtures; generated typed columns from canonical bytes; pre-incident seals; tamper→freeze+incident+no-reseal; sanitized rate-bounded security intake. Tests: 7 integration (privilege boundary incl. superuser-trigger block, 16-writer gap-free concurrency, rollback no-gap, allocator rebuild, tamper freeze). Smoke: end-to-end login→tenant→domain→principal→audit query (obligations applied)→denials→verify ok. Risks: EXC-P0-001 unchanged (shared failure domain, honest statement stands). Next: M5. |
| M5 Canonical objects | **DONE 2026-08-04** (commit `78d696b`) | Migration 0006 (typed 40-field header, four-axis temporal, DB CHECKs incl. minimum provenance, append-only, RLS, outbox, schema registry); create/correct/known-at/history; outbox → BullMQ post-commit. Tests: +2 integration (DB-level immutability, provenance CHECK). |
| M6 WS-19 shell | **DONE 2026-08-04** (commit `bf3a62f`) | Token-driven UI (light+dark, logical CSS/RTL-safe, 3-channel truth badges); login/tenants/principals/objects/audit pages; review-step creation; receipts from authoritative responses only; browser-verified end-to-end (chain verify: intact, head matches). |
| M7 Acceptance | **DONE 2026-08-04** | 21-test acceptance suite green (15 criteria + §7.2 request paths); wired into CI; demo script `scripts/demo.sh`; Phase Report published. Deviations documented in [PHASE0_REPORT.md](PHASE0_REPORT.md) §5. |
| Phase 1 — World Observation Layer | L1 | **PLAN Rev 4 (cumulative) — awaiting final approval; no P1 application code written** | Plan: [PHASE1_PLAN.md](PHASE1_PLAN.md) (Rev 4). Evidence: [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md). Coverage: [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md). P1 exceptions EXC-P1-001/002 remain `proposed` (not opened). |
| Phase 2 — Intelligence Layer | L2 | Not started | Model Gateway live; Cleaning/Classification/NER/Relationship agents |
| Phase 3 — Enterprise Memory & Knowledge Graph | L3–L4 | Not started | Graph/Memory/Reasoning agents; stewardship workflows |
| Phase 4 — Digital Twins & Prediction Engine | L5–L6 | Not started | Twin Reconciliation/Prediction agents |
| Phase 5 — Scenario Intelligence & Simulation Engine | L7–L8 | Not started | Scenario/Simulation agents |
| Phase 6 — Decision Intelligence & Executive OS | L9–L10 | Not started | Decision/Briefing/Reporting agents; Planner/Supervisor/Workflow completed |
| Phase 7 — System-wide agent governance, continuous learning, marketplaces, production hardening | Cross-cutting | Not started | Deepens existing controls; does not introduce them (C-006, C-035) |

Agents are introduced progressively with the layers they serve; the agent/workload principal model exists from Phase 0.

## Document authority model

Volume 0 (Constitution, highest) → Volume 3 (canonical system architecture) → Volume 4 (engineering contracts) → Volumes 5–7 (AI / infrastructure / data domains) → Volume 8 (product requirements) → Volume 9 (UI/UX requirements). Volumes 1–2 are explanatory/executive presentation layers and do not override normative architecture or engineering specifications. Volume 10 is investor/diligence material, not an engineering authority.

## Document review log

| Volume | Read | Notes |
|---|---|---|
| Volume 0 — Product Constitution v1.0 | 2026-08-02, full | 52 invariants C-001…C-052; frozen baseline |
| Volume 1 — Executive Vision Book v1.0 | 2026-08-02 | Explanatory narrative; inherits V0 |
| Volume 2 — Technical Presentation v1.1 | 2026-08-02, full (50 slides) | Explanatory presentation layer; no normative override |
| **Volume 3 — Technical Architecture v1.0** | **2026-08-03, full (122 pp.)** | Canonical architecture: ten layers, 94 components (Lx-Cyy), 50 interfaces, 24 canonical object codes, ADR-0001…0020, control planes, contract envelope, four-axis temporal model |
| Volume 4 — Engineering Specification v1.0 | 2026-08-02, full (195 pp.) | ~380 ES requirements; envelope field dictionary; EYE-XXX-NNN error catalog; SLOs; test suites |
| Volume 5 — AI Architecture v1.0 | 2026-08-02, full (199 pp.) | 360 AI requirements; model gateway; agent contracts; 24 AI-ADRs |
| Volume 6 — Infrastructure Architecture v1.0 | 2026-08-02, full (193 pp.) | 432 IA requirements; 24 IADRs; manifests; no technology mandates |
| Volume 7 — Data Platform v1.0 | 2026-08-02, full (195 pp.) | 432 DP requirements; 40-field canonical header (App. E); 24 DADRs |
| Volume 8 — PRD v1.0 | 2026-08-02, full (209 pp.) | 432 PR requirements; 24 personas; 108 capabilities; no internal release phasing |
| Volume 9 — UI/UX Design System v1.0 | 2026-08-02, full (195 pp.) | 432 UX requirements; token registry; 112 components; WCAG 2.2 AA release-blocking |
| Volume 10 — Investor Package v1.0 | 2026-08-03, full (164 pp.) | Investor/diligence material (at ~/Downloads); no dates, no stack, no delivery constraints; defers to Volumes 0–9; Appendix J defines six technical proof tracks |
| Master Build Prompt | 2026-08-02 | Build protocol; phase roadmap superseded by the corrected roadmap above where they differ (P4/P5 layer grouping, progressive agents) |

Key findings: **no volume mandates a specific technology** (verified by exhaustive search across Vols 2–7, 9, 10); constraints are semantic — four-axis temporal truth, append-only versioning, non-destructive correction, audit-on-commit-path, fail-closed ABAC with obligations, explicit tenant propagation, deployment semantic parity. Volume 3 explicitly names the governed outbox pattern and prohibits deferring cross-cutting controls to a later phase.
