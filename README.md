# THE EYE

A governed intelligence platform built layer by layer under its Product Constitution (Volume 0):
a governance spine, a world-observation layer with source contracts and evidence custody, an
intelligence layer with human-reviewed extraction, an enterprise memory and knowledge graph,
prediction and scenario intelligence, digital twins and simulation. Every write is a governed
operation with a policy decision and an audit record; every derived object cites the exact
evidence versions it rests on.

This file is the entry point. **[PROGRESS.md](PROGRESS.md) is the authoritative status record**; the
table below is the same table, kept identical, so a reader of either sees the current state.

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
| **Phase 6** — Decision Intelligence & Executive OS | L9–L10 | **UNSTARTED** | No plan, no branch. Its roadmap entry: decision packages, briefings and reporting; the Planner/Supervisor/Workflow agents complete here. | — |
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
| [#43](https://github.com/a-Halawany/elven/pull/43) | `integrations/source-readiness-2026-09` | Source readiness register (live / replay / operator upload / blocked, unbound credential first), connector and credential inventory (`SOURCE_INTEGRATION_STATUS.md`); proposals A (EU Financial Sanctions) and B (World Bank Indicators) activated on the demonstration deployment 2026-09-07 through the governed path (register → second-operator approval → rights evidence → activation → operator-triggered live runs); schedule entries recorded, no scheduler runs in that deployment; no credential, nothing purchased | `phase5-twins` |

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

## Where things are

| Need | Go to |
|---|---|
| The current state of every phase, the blockers and the merge order | [PROGRESS.md](PROGRESS.md) (this table, plus the milestone log and the document authority model) |
| A phase's plan, report and product handoff | `PHASE<n>_*.md` at the repository root; Phase 4 and 5 documents are on their branches until merged (see the table) |
| Architecture decisions and exceptions | [DECISIONS.md](DECISIONS.md), [EXCEPTIONS.md](EXCEPTIONS.md) |
| The Phase 0 acceptance record and its process exception | [PHASE0_ACCEPTANCE_RECONCILIATION.md](PHASE0_ACCEPTANCE_RECONCILIATION.md) |
| Source connector coverage against the constitutional source universe | [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md) |
| Scanner dispositions and the supply-chain gate | [docs/SCANNER_DISPOSITIONS.md](docs/SCANNER_DISPOSITIONS.md); C15 maintenance on [#39](https://github.com/a-Halawany/elven/pull/39) |
| The historical build narratives (Gate-2.x, C17/C18 provenance, Phase 1 record) | [PROGRESS_ARCHIVE_2026-08.md](PROGRESS_ARCHIVE_2026-08.md) |
| The constitutional volumes (0–10) | `docs/` |

## Repository layout

* `apps/api` — the NestJS API: governed pipeline, ports (SECURITY DEFINER), capabilities, modules per layer (`observation`, `intelligence`, `graph`, `prediction`, `twin`); migrations in `apps/api/migrations` (forward-only, digest-ledgered).
* `apps/web` — the Next.js operator workspace (Observation, Intelligence, Graph, Prediction, Twins).
* `packages/contracts`, `packages/tokens` — the canonical header, envelope and error contracts; the design tokens.
* `scripts/` — the demonstration (acts I–V), the gate and maintenance scripts; `fixtures/` — the frozen replay sets.
* `e2e/` — browser regressions; `evidence/` — gate evidence produced by running the frozen source.

## How status is maintained

The table is verified against `main` and the open implementation branches by reading the PR heads
and the merge commits, not from memory. A phase moves to MERGED only on its merge commit; a phase is
IMPLEMENTED — UNMERGED from the moment its branch is complete and stays so until its PR merges, with
the blocker named. Closed reviews are recorded in the phase report at the exact code SHA. This
record does not restate the constitutional criteria and does not reopen closed reviews.
