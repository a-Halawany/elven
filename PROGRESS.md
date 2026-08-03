# THE EYE — Progress Log

| Phase | Layers | Status | Notes |
|---|---|---|---|
| Phase 0 — Foundation & Governance Spine | Cross-cutting | **APPROVED 2026-08-03 — IN PROGRESS (M1)** | Plan: [PHASE0_PLAN.md](PHASE0_PLAN.md) (Rev 3: pre-code corrections applied — request order, request-path taxonomy, audit allocator/hash/seal semantics, honest exception posture). ADRs: [DECISIONS.md](DECISIONS.md). Exceptions: [EXCEPTIONS.md](EXCEPTIONS.md). |
| Phase 1 — World Observation Layer | L1 | Not started | Observation/Crawler/Collection agent contracts introduced here |
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
