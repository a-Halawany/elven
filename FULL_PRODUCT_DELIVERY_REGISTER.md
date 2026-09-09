# THE EYE — Full-Product Delivery Register

**Authority.** This register is the single record of what the agreed product (Volumes 0–10 and the
owner's decisions) requires, what is delivered, and with what evidence. The target is **100% of the
agreed product**. A requirement stays open — `missing`, `partial`, `blocked`, `unverified` or
`branch-only` — until it is satisfied with evidence of the class it needs; a phase review closing
does not close a requirement, and no completion percentage is claimed here.

**Provenance of this file.** The independent residual review of PR #46 (9 September 2026) refers to
`The_Eye_Full_Product_Delivery_Register_2026-09-09.md`. That file is not present in this repository,
in the owner's Downloads folder, or anywhere else on this machine (searched 2026-09-09). This
document is opened in its place from the repository's own records (`PROGRESS.md`, the phase reports,
the review closures) and is the register from now on. **Resource request R-1:** the referenced
register file, if it exists, so its rows can be reconciled into this one rather than re-derived.

## 1. Status vocabulary

| Status | Meaning |
|---|---|
| `delivered` | on `main`, with evidence of the required class (harness, browser, deployment, CI) |
| `branch-only` | implemented and verified on an unmerged branch (the merge is gated) |
| `partial` | some of the requirement's obligations are met; the rest is named |
| `blocked` | cannot proceed without a named external dependency or resource |
| `unverified` | implemented; the evidence of the required class has not been produced |
| `missing` | not implemented |

## 2. The source documents

The atomic audit (§5) maps every numbered requirement of every volume to code, UI, API, integration
and operational evidence. It needs the volumes themselves. On this machine only two are present as
files; the others were read in full on 2026-08-02/03 (the review log in `PROGRESS.md`) but their
requirement text is not in the repository.

| Volume | Requirements | Local copy | Atomic audit |
|---|---|---|---|
| 0 — Product Constitution v1.0 | 52 invariants C-001…C-052 | not on this machine | not started |
| 1 — Executive Vision Book v1.0 | explanatory | not on this machine | not applicable (inherits V0) |
| 2 — Technical Presentation v1.1 | explanatory | not on this machine | not applicable |
| 3 — Technical Architecture v1.0 | 94 components, 50 interfaces, 24 object codes, ADR-0001…0020 | not on this machine | not started |
| 4 — Engineering Specification v1.0 | ~380 ES requirements | not on this machine | not started |
| 5 — AI Architecture v1.0 | 360 AI requirements, 24 AI-ADRs | not on this machine | not started |
| 6 — Infrastructure Architecture v1.0 | 432 IA requirements, 24 IADRs | `~/Downloads/The_Eye_Volume_6_Infrastructure_Architecture_v1.0 elvin .pdf` | not started |
| 7 — Data Platform v1.0 | 432 DP requirements, 24 DADRs | not on this machine | not started |
| 8 — PRD v1.0 | 432 PR requirements, 24 personas, 108 capabilities | not on this machine | not started |
| 9 — UI/UX Design System v1.0 | 432 UX requirements, 112 components, WCAG 2.2 AA | not on this machine | not started |
| 10 — Investor Package v1.0 | six technical proof tracks (Appendix J) | `~/Downloads/The_Eye_Volume_10_Investor_Package_v1.0 elvin.pdf` | not started |

**Resource request R-2:** Volumes 0, 3, 4, 5, 7, 8 and 9 as files (PDF or text), so the atomic audit
can cite requirement identifiers verbatim. Without them the audit cannot begin honestly; it will not
be reconstructed from memory.

## 3. Delivery by layer (the coarse view — not a completion measure)

| Layer / phase | Status | Head / branch | Evidence classes present | Named gaps |
|---|---|---|---|---|
| Phase 0 — Foundation & Governance Spine | `delivered` (Gate-2.2 closed; C18 closed at `a8d34c4`; C19 lifecycle green) | `main` | harness, acceptance 58/58, CI | release FINAL C16/C17 chain not run (blocked by C15, §4) |
| Phase 1 — L1 World Observation | `delivered` | `main` | harness, browser, CI | ECB live backfill unverified today (publisher unreachable) |
| Phase 2 — L2 Intelligence Extraction | `delivered` | `main` | harness, CI | — |
| Phase 3 — L3 Knowledge Graph / strategy | `delivered` | `main` | harness, CI | — |
| Phase 4 — L4 Prediction | `delivered` (review closed at `843e2ccb`) | `main` | harness, browser 11/12, CI | ECB retrospective validation case unverified |
| Phase 5 — L5 Digital Twins & Simulation | `delivered` (review closed at `48f43bed`; follow-ups #43 at `91263061`) | `main` | harness, browser, CI | — |
| Scheduled collection (#44) | `branch-only` (review closed at `e0d69060`) | `scheduling/automatic-collection-2026-09` | harness, Redis, CI | merge gated (C15) |
| Phase 6 — L9 Decision Intelligence & Executive OS (#46) | `branch-only`, review **open** | `phase6-decisions` | harness (25 + 19 review cases), browser 3/3, deployment, CI (runnable jobs) | the residual review's six paths corrected at 0049 (PHASE6_REPORT.md §12); merge gated (C15); §6 open items |

Merge order recorded: #39 → #36 → #38 → #40 → #41 → #43 → #44 → #45 → #46, each behind C15 and FINAL C16/C17.

## 4. Security maintenance track (C15 — every current finding)

State at head `9aaf0311` (run 34343317671, job 102438951209, artifact `supply-chain-gate-evidence-a1`):

| Finding | Where | Fixed in | Disposition |
|---|---|---|---|
| CVE-2026-75604, GHSA-2xp9-vwfh-vxw4 (CRITICAL) — Next.js RCE | `apps/web` → `next@16.2.12` | `next@16.3.3` | remediable now by upgrade (§4.1) |
| GHSA-rgj7-g3m4-5g8c (HIGH) — sharp / libheif | `next` → `sharp@0.35.3` (optional dependency `^0.35.3`) | `sharp@0.35.4` | remediable now by upgrade / override (§4.1) |
| CVE-2026-77037, -77078, -82333 (HIGH) — multer DoS | `@nestjs/platform-express@11.1.28` → `multer@2.2.0` | `multer@2.3.0` | upstream `@nestjs/platform-express` still declares `multer@2.2.0` through `12.0.1`; remediable by a governed override (§4.1) |
| CVE-2026-53612/53613/53614/76642/78408/78409/78410 (HIGH) — util-linux (`libuuid`, `setpriv`) | pinned `postgres@sha256:9a8afca…` (alpine 3.24.1, util-linux 2.42.1-r0) and `redis@sha256:978f0e0…` (alpine 3.23.5, util-linux 2.41.4-r0) | Alpine `2.42.3-r1` / `2.41.6-r1` | **not remediable by re-pinning today**: the registry's current `postgres:18-alpine` (`sha256:d3e1620b…`) and `redis:8-alpine` (`sha256:becdda6c…`) still carry the same versions (scanned locally with trivy 0.73.0 on 2026-09-09, evidence in the PR #46 record). Two ways forward, both needing a resource: (a) the official images are rebuilt against the patched packages — nothing to do but recheck; (b) derived images (`FROM <pin>` + `apk upgrade util-linux`) published to a registry the gate can resolve by digest. **Resource request R-3:** a container registry namespace and a push credential for (b), or the decision to wait for (a). No waiver, no weakened assertion, no `.trivyignore`. |

### 4.1 Dependency remediation (maintenance track)

Planned as its own commit on `phase6-decisions` after the correction pass, verified by the same
checks (unit, `test:int:all`, upgrade check, web build, browser specs) and the hosted C15 job:
`next` 16.2.12 → 16.3.3 (React 19.2.8 stays within its peer range); `sharp` pinned to 0.35.4
through a pnpm override on the optional dependency; `multer` pinned to 2.3.0 through a pnpm override
(the Nest packages still declare 2.2.0). Overrides are governed dispositions recorded here, not
suppressions. If C15 stays red after this, only the image findings remain (§4, R-3).

## 5. Atomic requirements audit (Volumes 0–10)

Not started: it needs the volumes (R-2). Its shape, so it can begin the day they arrive: one row per
requirement identifier (C-nnn, ES-nnn, AI-nnn, IA-nnn, DP-nnn, PR-nnn, UX-nnn, the Volume 3
components/interfaces/ADRs, the Volume 10 proof tracks), columns `code`, `UI`, `API`, `integration
evidence`, `operational evidence`, `status`, `evidence pointer`. The status vocabulary of §1 applies.
Rows are never removed; a satisfied row keeps its evidence pointer.

## 6. Decision-completeness items (open, from the broader review)

| Item | Status | Note |
|---|---|---|
| Conditional-approval handling (an approval carrying conditions that bind the commitment) | `missing` | conditions are recorded on the approval (`decision.approvals.conditions`); nothing evaluates them at commitment or monitoring |
| Case-bound decision-agent simulation selection (the decision agent picks the runs a case names, not the first control with interventions) | `partial` | the agent drafts from the first control that has interventions; no case binding |
| Historical approver eligibility in briefings | `delivered` at 0049 (`decision.live_approvals_as_of`) — `branch-only` | — |
| Historical contract state in briefings | `delivered` at 0049 (contract event history) — `branch-only` | — |
| Model Gateway narrative | `partial` | the narrative contract exists (labelled, cites items, outside the digest); no gateway call |

## 7. Operations items (open)

| Item | Status | Note |
|---|---|---|
| Durable deployment recovery (the `.eye-local` loss of 2026-09-09; vault and journal backup/restore) | `partial` | `.gitignore` guards the symlink; the demonstration was rebuilt virgin; no backup/restore procedure for the local vault and degraded journal exists |
| ECB live backfill (`activate-ecb.mjs`) | `blocked` | the publisher's data API timed out from this machine on every attempt on 2026-09-09; no waiver |
| PortWatch / UN Comtrade | `blocked` (holds) | permission request pending / key untouched — unchanged by decision |

## 8. Resource requests (specific, each tied to the next concrete task)

- **R-1** the referenced register file `The_Eye_Full_Product_Delivery_Register_2026-09-09.md` (reconciliation).
- **R-2** Volumes 0, 3, 4, 5, 7, 8, 9 as files (the atomic audit, §5).
- **R-3** a container registry namespace + push credential, or the decision to wait for rebuilt official images (the util-linux findings, §4).

No email is sent, no source activated and nothing purchased by this register.
