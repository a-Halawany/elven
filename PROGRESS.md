# THE EYE — Progress Log

## Current phase status — verified 2026-09-07 against `main` and the open implementation branches

`main` is `4491c7f5a77ae8a4e0744821c3a45fef6bd152a6`. Four states are used and nothing else: **MERGED**
(on `main`), **IMPLEMENTED — UNMERGED** (complete on a branch, held behind a named blocker),
**PLANNED** (an approved plan, no implementation) and **UNSTARTED**. An implemented phase is never
shown as unstarted.

| Phase | Layers | State | Delivery on record | Blocker |
|---|---|---|---|---|
| **Phase 0** — Foundation & Governance Spine | cross-cutting | **MERGED** | Implemented through Gate-2.2 C1–C19; C19 approved at `b6ac246` and merged in [#21](https://github.com/a-Halawany/elven/pull/21) (`82e90858`), corrected in [#25](https://github.com/a-Halawany/elven/pull/25) (`e3599648`); tag `phase0-v1.0.0` at `a792cd9a`. Acceptance record reconciled in [#29](https://github.com/a-Halawany/elven/pull/29) (`12f6e80`): **ready for post-merge independent acceptance review, not formally closed** (process exception PEX-P0-001, [PHASE0_ACCEPTANCE_RECONCILIATION.md](PHASE0_ACCEPTANCE_RECONCILIATION.md)). Report [PHASE0_REPORT.md](PHASE0_REPORT.md), evidence [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md). | none for the code; the formal acceptance review is the owner's |
| **Phase 1** — World Observation Layer | L1 | **MERGED** | [#28](https://github.com/a-Halawany/elven/pull/28) (`045ee030`); handoff [#31](https://github.com/a-Halawany/elven/pull/31) (`cd1d080`); build packet [#26](https://github.com/a-Halawany/elven/pull/26). Report [PHASE1_REPORT.md](PHASE1_REPORT.md), handoff [PHASE1_PRODUCT_HANDOFF.md](PHASE1_PRODUCT_HANDOFF.md), coverage [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md). | — |
| **Phase 2** — Intelligence Layer | L2 | **MERGED** | [#32](https://github.com/a-Halawany/elven/pull/32) (`6b4b22d6`). Report [PHASE2_REPORT.md](PHASE2_REPORT.md), plan [PHASE2_BUILD_PLAN.md](PHASE2_BUILD_PLAN.md). | — |
| **Phase 3** — Enterprise Memory & Knowledge Graph | L3–L4 | **MERGED** | [#34](https://github.com/a-Halawany/elven/pull/34) (`6914af03`) and the bounded correction of the Codex review of `6914af03`, [#37](https://github.com/a-Halawany/elven/pull/37) (`4491c7f5`); plan [#33](https://github.com/a-Halawany/elven/pull/33). Report [PHASE3_REPORT.md](PHASE3_REPORT.md), handoff [PHASE3_PRODUCT_HANDOFF.md](PHASE3_PRODUCT_HANDOFF.md). The earlier label "awaiting owner review" was the state before #37; the review happened and its corrections are merged. | — |
| **Phase 4** — Prediction + Scenario Intelligence | L6–L7 | **IMPLEMENTED — UNMERGED** | [#38](https://github.com/a-Halawany/elven/pull/38) `phase4-prediction` head `879ce2d8`; functional correction review **closed at `98e7d9e6`** (2026-09-06) after two bounded passes (migrations 0028–0031). Plan and readiness record: [#36](https://github.com/a-Halawany/elven/pull/36) `phase4-readiness-plan` head `63a6c9f7` (documentation only; carries `PHASE4_DATA_READINESS_PLAN.md` and the PortWatch permission request, which the Phase 4 report links to). Report and handoff live on the branch: `PHASE4_REPORT.md`, `PHASE4_PRODUCT_HANDOFF.md`. | C15 (below); merge order #39 → #36 → #38 |
| **Phase 5** — Digital Twins + Simulation | L5, L8 | **IMPLEMENTED — UNMERGED** | [#41](https://github.com/a-Halawany/elven/pull/41) `phase5-twins`, stacked on #38; code head `48f43bed`, closure record `f527446c`; functional correction review **closed at `48f43bed`** (2026-09-07) after three bounded passes (migrations 0035–0037). Plan: [#40](https://github.com/a-Halawany/elven/pull/40) `phase5-plan` head `9e33e97b` (E1–E8 frozen). Report and plan live on the branch: `PHASE5_REPORT.md`, `PHASE5_BUILD_PLAN.md`. | C15; merge order #38 → #40 → #41 → #43 |
| **Phase 6** — Decision Intelligence & Executive OS | L9–L10 | **APPROVED PLAN — IN CONSTRUCTION** on `phase6-decisions` (from PR #44 at `c5460465`); plan [#45](https://github.com/a-Halawany/elven/pull/45) with the owner's five corrections and decisions of 2026-09-08 | Decision packages, human-gated approval and commitment, executive briefings and rooms, Decision Replay, the Decision / Executive Briefing / Reporting agents with Planner/Supervisor/Workflow completed. Runnable checks on the construction branch are reported per run; FINAL C16/C17 stay skipped behind the red C15 gate and are reported separately, never as green. | [PHASE6_BUILD_PLAN.md](https://github.com/a-Halawany/elven/blob/phase6-plan/PHASE6_BUILD_PLAN.md) (on #45) |
| **Phase 7** — System-wide agent governance, continuous learning, marketplaces, production hardening | cross-cutting | **UNSTARTED** | No plan, no branch. Deepens existing controls; introduces none (C-006, C-035). | — |

### The one merge blocker, and what it is not

**C15 (supply-chain gate) is red** on every branch that carries the pinned `postgres:18-alpine` and
`redis:8-alpine` images: 13 ungoverned HIGH `util-linux` findings (CVE-2026-53612, -53613, -53614,
-76642, -78408, -78409, -78410; `libuuid` 2.42.1-r0, `setpriv` 2.41.4-r0). **No published image
variant carries the fix yet.** [#39](https://github.com/a-Halawany/elven/pull/39)
`maintenance/c15-image-recheck-2026-09` (draft, head `70c34083`) watches util-linux in the
patched-image recheck; on-demand recheck runs
[34029030389](https://github.com/a-Halawany/elven/actions/runs/34029030389) and
[34040106936](https://github.com/a-Halawany/elven/actions/runs/34040106936) reported AFFECTED for both
images. While C15 is red its downstream FINAL C16/C17 steps are skipped, so the eventual merge
candidate of every stacked PR must pass the complete required chain once a patched image exists.
**The owner rejects waivers; there is no bypass.** Record: [docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md](https://github.com/a-Halawany/elven/blob/maintenance/c15-image-recheck-2026-09/docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md) (on #39).

C15 is not a functional finding against Phases 4 or 5: their correction reviews are closed, and
`build-test`, `browser-regression` and `C19 lifecycle` are green at their heads. `main` carries no
branch protection; the required checks are enforced by the workflow verdicts and by this record.

### Open pull requests, in merge order

| PR | Branch (head) | What it is | Base |
|---|---|---|---|
| [#39](https://github.com/a-Halawany/elven/pull/39) draft | `maintenance/c15-image-recheck-2026-09` (`70c34083`) | C15 maintenance: watch util-linux in the recheck; no patched image to re-pin to yet | `main` |
| [#36](https://github.com/a-Halawany/elven/pull/36) | `phase4-readiness-plan` (`63a6c9f7`) | Phase 4 data and product readiness plan; the four recorded source decisions (§14); the PortWatch permission request, ready to send | `main` |
| [#38](https://github.com/a-Halawany/elven/pull/38) | `phase4-prediction` (`879ce2d8`) | Phase 4 implementation, review closed at `98e7d9e6` | `main` |
| [#40](https://github.com/a-Halawany/elven/pull/40) | `phase5-plan` (`9e33e97b`) | Phase 5 build plan, E1–E8 frozen | `main` |
| [#41](https://github.com/a-Halawany/elven/pull/41) | `phase5-twins` (`f527446c`) | Phase 5 implementation, review closed at `48f43bed` | `phase4-prediction` |
| [#43](https://github.com/a-Halawany/elven/pull/43) | `integrations/source-readiness-2026-09` | Source readiness register (live / replay / operator upload / blocked, unbound credential first), connector and credential inventory (`SOURCE_INTEGRATION_STATUS.md`); proposals A (EU Financial Sanctions) and B (World Bank Indicators) activated on the demonstration deployment 2026-09-07 through the governed path (register → second-operator approval → rights evidence → activation → operator-triggered live runs); schedule entries recorded, no scheduler runs in that deployment; no credential, nothing purchased; the three follow-ups of the independent review closed at `91263061` (`SOURCE_INTEGRATION_STATUS.md` §8) | `phase5-twins` |
| [#44](https://github.com/a-Halawany/elven/pull/44) | `scheduling/automatic-collection-2026-09` (stacked on #43) | Scheduled collection for the four approved live sources: collection workers with startup reconciliation, the BullMQ 6.0.6 queue-name fix (derived Redis identity, stored names unchanged), unchanged-poll confirmation without a second stored copy, readiness keeping configured schedule / runtime / observed attempts apart; migration 0038 (`SCHEDULED_COLLECTION.md`). Demonstrated with real Redis (7/7) and on the demonstration deployment; functional correction review closed at `e0d69060` (`SCHEDULED_COLLECTION.md` §6) |
| [#45](https://github.com/a-Halawany/elven/pull/45) | `phase6-plan` (from `main`, documentation only) | Phase 6 build plan — Decision Intelligence + Executive OS (L9–L10): decision packages, human-gated approval and commitment, briefings and rooms, Decision Replay without hindsight, the three assigned agents; F1–F8 proposed for freeze; owner decisions open (`PHASE6_BUILD_PLAN.md` §10) |

### Labels reconciled

* **Phase 4 and Phase 5 were regrouped.** The master build prompt grouped Phase 4 as "Digital Twins
  & Prediction Engine (L5–L6)" and Phase 5 as "Scenario Intelligence & Simulation Engine (L7–L8)";
  the earlier table here still showed that grouping with both phases "Not started". The approved
  readiness plan (#36, §14) and the Phase 5 plan (#40) regrouped them so that prediction and scenario
  intelligence ship together (L6–L7) and twins and simulation ship together (L5, L8). Every layer
  L1–L8 is covered exactly once; the roadmap line "phase roadmap superseded by the corrected roadmap
  where they differ" in the authority model refers to this.
* **Phase 3** read "IMPLEMENTED — awaiting owner review" after it had been merged (#34) and its review
  corrections merged (#37). It is MERGED.
* **Phase 0** read "COMPLETE + GATE-2.1 CLOSURE SUBMITTED". Gate-2.1 was rejected and Gate-2.2 C1–C19
  closed it; the code is merged, and the formal acceptance state is the reconciliation's: not formally
  closed. Both halves are now stated.
* **PRs #24 and #25 are both MERGED (2026-09-01), not open.** #25 supersedes #24 and says #24 should
  not be merged; #25's branch was built on top of #24's two commits, so when #25 merged (merge commit
  `e3599648`) #24's head `0cdf7fb3` became reachable from `main` and GitHub marked #24 merged too
  (its "merge commit" is its own head; there is no separate merge of #24). Nothing from #24 reached
  `main` except through #25, which corrected it. No pull request or issue numbered 24 or 25 is open.
* **Documents that live only on unmerged branches**: `PHASE4_DATA_READINESS_PLAN.md` and
  `PHASE4_PORTWATCH_PERMISSION_REQUEST.md` (#36); `PHASE4_REPORT.md` and `PHASE4_PRODUCT_HANDOFF.md`
  (#38); `PHASE5_BUILD_PLAN.md` and `PHASE5_REPORT.md` (#41). Links to them from `main` resolve only
  after those PRs merge; the table above links the PRs instead.
* **Historical narratives** (Gate-2, Gate-2.1, Gate-2.2, the C17/C18 provenance series, the Phase 1
  implementation record and the Phase 0 acceptance reconciliation summary) are moved verbatim to
  [PROGRESS_ARCHIVE_2026-08.md](PROGRESS_ARCHIVE_2026-08.md). Nothing was edited or dropped; each
  section keeps its dates and its own superseded-by markers.

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


## Archive

The dated narratives that preceded this record — the invariant-remediation gate, Gate-2, Gate-2.1,
Gate-2.2 and its C17/C18 provenance series, the Phase 1 implementation record and the Phase 0
acceptance-record reconciliation summary — are preserved verbatim in
[PROGRESS_ARCHIVE_2026-08.md](PROGRESS_ARCHIVE_2026-08.md). They are history, not current status;
where a statement in them is no longer true, the table above is the correction.
