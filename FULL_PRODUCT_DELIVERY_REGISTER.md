# THE EYE — Full-Product Delivery Register

**Authority.** This register is the single record of what the agreed product (Volumes 0–10 and the
owner's decisions) requires, what is delivered, and with what evidence. The target is **100% of the
agreed product**. A requirement stays open — `missing`, `partial`, `blocked`, `unverified` or
`branch-only` — until it is satisfied with evidence of the class it needs; a phase review closing
does not close a requirement, and no completion percentage is claimed here.

**Provenance of this file.** The owner's full delivery register of 9 September 2026
(`The_Eye_Full_Product_Delivery_Register_2026-09-09.md`) reached this repository with the review at
`07edd9dc` and is preserved verbatim at `audit/The_Eye_Full_Product_Delivery_Register_2026-09-09.md`
(sha256 `2bb24dfc…`), together with the two review texts under `audit/reviews/`. That file carries the
mandate, the 220 historical requirement-family snapshots (an audit seed, never a denominator), the
delivery packages R0/P1–P7-F, the completion rules and the resource rules; this file is the current-status
record reconciled to it: every family keeps its identifier and its historical snapshot there, and §5
maps each family to the atomic rows that fall under it. Where the two disagree, the owner's register
states the obligation and this file states the evidence. Resource request R-1 is resolved.

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

All eleven volumes are in the repository at `docs/` (the review pinned their blob identities at
`07edd9dc`; each was re-verified by blob id and size before extraction — see `audit/AUDIT_METHOD.md`).
Volume 2 has no text layer; its 50 slides were transcribed from rendered images. Resource request R-2
is resolved.

| Volume | Requirements | Blob at `07edd9dc` | Atomic audit (§5) |
|---|---|---|---|
| 0 — Product Constitution v1.0 | 52 invariants C-001…C-052 + chapter contracts | `f0790670…` | `audit/requirements/v00-v01.csv` |
| 1 — Executive Vision Book v1.0 | explanatory; normative commitments per chapter | `cb6de42b…` | `audit/requirements/v00-v01.csv` |
| 2 — Technical Presentation v1.1 | 50 slides, the controlled technical baseline | `62925dd0…` | `audit/requirements/v02.csv` |
| 3 — Technical Architecture v1.0 | 92 components, 50 interfaces, 24 object codes, ADR-0001…0020 | `dab24084…` | `audit/requirements/v03.csv` |
| 4 — Engineering Specification v1.0 | 410 ES, SLO-001…022, TS-01…20, EYE error codes | `08efeffb…` | `audit/requirements/v04.csv` |
| 5 — AI Architecture v1.0 | 360 AI, AI-ADR-001…024, AG/MC/TC/EM/AR catalogues | `cc97ed45…` | `audit/requirements/v05.csv` |
| 6 — Infrastructure Architecture v1.0 | 432 IA, IADR-001…024, 16 catalogues | `9a33d822…` | `audit/requirements/v06.csv` |
| 7 — Data Platform v1.0 | 432 DP, DADR-001…024, 18 catalogues | `81a6cc01…` | `audit/requirements/v07.csv` |
| 8 — PRD v1.0 | 432 PR, 108 capabilities, 72 AT, 24 personas/journeys | `d1a704b1…` | `audit/requirements/v08.csv` |
| 9 — UI/UX Design System v1.0 | 432 UX, 112 components, 48 patterns, UX-ADR-001…024 | `657c9509…` | `audit/requirements/v09.csv` |
| 10 — Investor Package v1.0 | 240 IR, six proof tracks, claim-control appendices | `152de591…` | `audit/requirements/v10.csv` |

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

### 4.1 Dependency remediation (maintenance track) — DONE at the head this register is committed with

Applied as its own commit on `phase6-decisions` after the residual correction pass, verified by the
same checks and the hosted C15 job:

| Change | Reviewed decision |
|---|---|
| `next` 16.2.12 → 16.3.3 (`apps/web`) | the first version carrying both RCE fixes; React 19.2.8 stays within its peer range |
| `sharp` override `'>=0.35.0'` → exact `0.35.4` (`pnpm-workspace.yaml`) | the first version carrying the libheif fix; a range is not a reviewed decision |
| `multer` override exact `2.3.0` (`pnpm-workspace.yaml`) | the first version carrying all three DoS fixes; `@nestjs/platform-express` still declares 2.2.0 through 12.0.1 |
| `vitest` 4.1.10 → 4.1.11 (all four workspaces) | GHSA-82fw-gwwq-j7x9 (moderate, development only); the audit receipt is exactly clean |
| C17 bundled native stack: `@img/sharp-libvips-linux-x64` 1.3.2 → 1.3.3 | the sharp fix ships libvips 8.18.6 with 13 re-versioned bundled libraries; the code-owned contract, the legal-file table, the manifest (`scripts/gate/bundled-components.json`, re-pinned by digest), the vendored texts (`vendor/sharp-libvips/1.3.3/legal`, libffi's 2026 text re-fetched at v3.8.0, the rest byte-identical) and the source-offer record (build recipe v1.3.3 at commit `6e5971d3…`) were moved together; no disposition was added or weakened |

Local receipts on the remediated closure: `pnpm audit --audit-level high` — no known vulnerabilities;
`trivy fs` (HIGH,CRITICAL, no ignore file) — 0 findings in `pnpm-lock.yaml`; the C17 licence gate —
PASS (203 production / 320 development components classified, 0 unresolved). What C15 still names
after this is the image finding of §4 alone (R-3). Confirmed by the hosted gate at `07edd9dc` (run
34390716808): every dependency, secret and filesystem step `[ok]`; 13 UNGOVERNED util-linux rows.

### 4.2 The image findings — a local patched-image candidate exists (prepared and scanned; not published, not pinned)

R-3 is split as the review asked: preparation needs no registry access and is DONE; publishing is a
proposal for the owner. Recipes: `infra/images/candidates/{postgres-18-alpine,redis-8-alpine}.Dockerfile`
with `README.md`; evidence: `infra/images/candidates/evidence/` (scans, SBOM and package deltas, build logs,
reproducibility record, redacted compatibility log). Nothing was pushed, logged in, committed to a
registry or referenced by the compose file or the gate.

| Item | postgres candidate | redis candidate |
|---|---|---|
| Base | `postgres@sha256:9a8afca5…` (postgres:18-alpine, Alpine 3.24.1) | `redis@sha256:978f0e01…` (redis:8-alpine, Alpine 3.23.5) |
| Fixed package verified in the branch index | `libuuid` 2.42.1-r0 → **2.42.3-r1** (v3.24/main; index `v3.24.1-530-gfb317804d78`) — the only util-linux subpackage in the base | `setpriv` 2.41.4-r0 → **2.41.6-r1** (v3.23/main; index `v3.23.5-194-g67c786fbc92`) — the only util-linux subpackage in the base |
| Recipe | `FROM <pinned digest>` + one `RUN apk add --no-cache libuuid=2.42.3-r1` with an installed-version assertion (apk-tools 3.0.6 rejects `apk upgrade pkg=version`) | same shape with `setpriv=2.41.6-r1` |
| Local image | `eye-cand-postgres:18-alpine-util-linux` = `sha256:e7f664f7307a4bad72661c0ce0354f99903f814962c29819e069c4abaacf9b11`; one new layer, +155,395 bytes; config (USER, ENTRYPOINT, CMD, ENV, EXPOSE, VOLUME) identical to the base | `eye-cand-redis:8-alpine-util-linux` = `sha256:2c26668e3f65bb26ea3edd97bbb0f2add85d7c040db96ce687f764a8a74e8542`; +128,815 bytes; config identical |
| trivy 0.73.0, DB 2026-09-09, HIGH/CRITICAL, no ignore file | base 32 → candidate 25: **all seven util-linux advisories gone** (CVE-2026-53612/53613/53614/76642/78408/78409/78410); nothing new; 0 secrets, 0 misconfigurations | base 8 → candidate 2: **all six setpriv advisories gone** (the base never reported -78409 against setpriv); nothing new; 0 secrets, 0 misconfigurations |
| What remains in the scan (all governed by existing dispositions SCX-0001…0009 in `scripts/gate/scanner-exclusions.json`; unchanged by this candidate) | `c-ares` 1.34.6-r0 (CVE-2026-33630), `libcrypto3`/`libssl3` 3.5.7-r0 (CVE-2026-14456), 22 Go-stdlib advisories in `/usr/local/bin/gosu` | `libcrypto3`/`libssl3` 3.5.7-r0 (CVE-2026-14456) |
| SBOM / licence delta (CycloneDX) | exactly one component changed; BSD-3-Clause unchanged | exactly one component changed; GPL-2.0-or-later unchanged |
| Compatibility | PostgreSQL 18.4 starts; `uuid-ossp` and `gen_random_uuid()` work (links the patched `libuuid.so.1`); runs as uid 70 with the base's data-directory ownership; a data directory initialised by the BASE is read by the candidate | Redis 8.10.0 starts; the entrypoint drops privileges through the patched `setpriv`; a `dump.rdb` written by the base loads in the candidate |
| Reproducibility | recipe-reproducible, NOT bit-identical: rebuilds differ only in apk-stamped mtimes and `/var/log/apk.log`; the package payload, `installed` db and `world` are byte-identical across builds; Alpine offers no dated index snapshot, so the version assertion makes drift fail loudly. A bit-identical variant needs BuildKit `rewrite-timestamp` + `SOURCE_DATE_EPOCH` and a normalised `apk.log` | same |
| Architecture | arm64 primary; a `linux/amd64` variant (the platform the gate scans) built and scanned with the identical finding set | same |

**Two further upgrades are available on both branches and deliberately NOT in the candidates** (they are
governed findings, not current gate failures): `libcrypto3`/`libssl3` 3.5.7-r0 → 3.5.8-r0 (CVE-2026-14456)
and, on postgres, `c-ares` 1.34.6-r0 → 1.34.8-r0. Adding them is one line each in the same recipe; the
decision whether a derived image should also carry them (and retire SCX dispositions) is the owner's.
`gosu` needs a newer official postgres build.

**Proposed publishing path (a proposal, not a record of approval):** GHCR under the repository owner's
namespace, `ghcr.io/a-halawany/elven/postgres:18-alpine-util-linux-<date>` and `…/redis:8-alpine-util-linux-<date>`,
published by a repository-associated Actions workflow (`infra/images/publish-candidates.yml`, to be added)
with a job-scoped `GITHUB_TOKEN` granted `packages: write` — GitHub's documented path
(https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry,
https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images); no personal token,
nothing pasted or committed. Access actually needed: (1) the owner's decision to publish; (2) the
repository's package settings allowing Actions to write packages (an organisation policy may block it —
verified on the first run, not assumed); (3) after publication, the digest is re-pinned in
`docker-compose.yml` and `scripts/gate/scanner-exclusions.json` through the governed maintenance path,
the C15 patched-image recheck runs against the real digest, and the full FINAL C16/C17 chain runs before
any merge. No waiver, no `.trivyignore`, no weakened assertion.

## 5. Atomic requirements audit (Volumes 0–10) — STARTED; first complete pass recorded

The register is `audit/requirements/vNN.csv`, one row per requirement identifier (and one tracking row
`Vnn-T-nnn` per normative clause without an identifier), with the fields the owner's register requires:
identity (id, volume, chapter, page, the clause verbatim), the family seed, capability area,
implementation status, verification status with its evidence class, release status, phase origin
(`phase0`…`phase6`, `phase7` as the master build prompt scheduled it, or `omission` for an obligation no
phase scheduled), the owning delivery package, evidence pointers, remaining work and notes. The method,
its limits and the extraction record are in `audit/AUDIT_METHOD.md`; `audit/SUMMARY.md` is generated
by `node audit/summarise.mjs` and is the only place counts appear. Rows are never removed; a satisfied
row keeps its evidence pointer. No completion percentage is stated anywhere.

What this first pass is and is not: every identifier of every volume has a row with its clause; the
statuses come from a code/test/CI survey at this head, so `implemented` means a concrete pointer was
found and `passed:*` means a named test or job exercises it — an `implemented` + `unverified` row is
code without evidence of the required class, not a claim. The pass was produced by one auditor per
volume from the extracted text; figures and tables were read where the text was insufficient (Volume 2
entirely). It is a first pass: the second pass reconciles duplicates across volumes (the same obligation
stated in Volumes 0, 3, 4 and 8), verifies the `partial` rows' remaining-work statements against the code
one by one, and attaches the acceptance unit per row. That second pass is scheduled in §9.

### 5.1 Rows by volume (from `audit/SUMMARY.md`; counts, not a completion measure)

| Volume | Rows | missing | partial | implemented | not-applicable | verified (passed:*) | unverified | branch-only | merged | phase7 | omission | phase0–6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V0 | 177 | 22 | 128 | 27 | 16 | 140 | 21 | 43 | 112 | 19 | 28 | 128 |
| V1 | 47 | 8 | 38 | 1 | 12 | 27 | 8 | 12 | 27 | 8 | 7 | 26 |
| V2 | 223 | 32 | 90 | 101 | 10 | 173 | 40 | 53 | 138 | 19 | 14 | 180 |
| V3 | 673 | 172 | 267 | 234 | 20 | 487 | 166 | 250 | 246 | 60 | 112 | 496 |
| V4 | 538 | 154 | 276 | 108 | 9 | 321 | 208 | 37 | 319 | 129 | 42 | 367 |
| V5 | 609 | 205 | 280 | 124 | 20 | 346 | 243 | 95 | 308 | 142 | 63 | 403 |
| V6 | 769 | 498 | 240 | 31 | 2 | 237 | 530 | 32 | 239 | 35 | 461 | 271 |
| V7 | 794 | 319 | 296 | 179 | 0 | 375 | 419 | 23 | 452 | 250 | 69 | 475 |
| V8 | 904 | 359 | 488 | 57 | 1 | 382 | 521 | 145 | 400 | 140 | 309 | 454 |
| V9 | 1089 | 470 | 520 | 99 | 0 | 355 | 734 | 68 | 551 | 94 | 309 | 686 |
| V10 | 441 | 341 | 98 | 2 | 329 | 99 | 13 | 63 | 37 | 100 | 0 | 12 |
| **all** | 6264 | 2580 | 2721 | 963 | 419 | 2942 | 2903 | 821 | 2829 | 996 | 1414 | 3498 |

### 5.2 Open rows by delivery package (missing, partial, or implemented without evidence)

| Package | open rows | missing | partial | implemented-unverified | volumes |
|---|---|---|---|---|---|
| P1 | 220 | 91 | 129 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 |
| P2 | 225 | 50 | 175 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 |
| P3 | 339 | 90 | 249 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P4 | 277 | 130 | 147 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P5 | 95 | 6 | 89 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 |
| P6 | 265 | 86 | 179 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V8 V9 |
| P7-A | 334 | 165 | 169 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V8 V9 |
| P7-B | 251 | 114 | 137 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P7-C | 95 | 51 | 44 | 0 | V0 V1 V10 V2 V3 V4 V7 V8 V9 |
| P7-D | 1648 | 917 | 731 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P7-E | 855 | 311 | 540 | 4 | V0 V1 V10 V2 V3 V5 V8 V9 |
| P7-F | 644 | 561 | 82 | 1 | V0 V1 V10 V3 V4 V6 V7 V8 V9 |
| R0 | 49 | 6 | 43 | 0 | V0 V1 V10 V3 V5 V6 V8 |
| done | 68 | 2 | 7 | 59 | V2 V4 V5 V6 V7 V9 |

### 5.3 Reconciliation with the owner's 220 families

Every family of the owner's register maps to atomic rows by chapter (`family_seed`): 220 families, 0 without a row. The per-family table is in `audit/SUMMARY.md` §"Historical family seeds → atomic rows"; the families' historical snapshots stay in the owner's file untouched. The 220 count is the seed; the 6264 atomic rows are the working denominator of nothing — each row is closed on its own evidence.

### 5.4 The missing capabilities the auditors ranked first (one line each; the rows carry the detail)

- **Deployment profiles and production trust (P7-D):** one local Docker Compose profile only; no SaaS/private-cloud/on-premise packaging or parity fixtures; no HA, backup/PITR/restore, DR, KMS, TLS, SSO/MFA, sandboxing, SLOs, metrics or traces; no application image, IaC or rollback (V3, V4, V6, V8, V10).
- **Agent runtime (P7-A):** no planner/supervisor/workflow runtime, task graphs, checkpoints, tool sandbox or capability-grant catalogue; three bounded decision-side agents and the collection agents exist (V2, V4, V5, V8, V9).
- **Governed learning and fitness (P7-B):** no evaluation→approval→release→rollback pipeline, drift or slice evaluation, model registry for prediction; lessons are free text (V0 C-044, V4, V5).
- **Marketplaces and domain packages (P7-C):** no signed packages, admission, catalogue or revocation; no domain packs (V0 C-046, V8, V10).
- **Source universe (P1):** connector families upload/RSS/REST only (1 of 20 Volume 0 source classes substantially covered); no credential binding, CDC, streams/IoT, collection plans or watchlists (V0 C-013, V7, V8).
- **Intelligence (P2):** no document/media parsing or OCR, multilingual extraction, contradiction detection, hosted-provider adapters, routing or fallback (V5, V8).
- **Memory and graph (P3):** no embeddings or hybrid retrieval, no ontology governance (`ontology_ref` always null), no export/exit path, retention and legal hold stored but never enforced (V0 C-016, V4, V7).
- **Prediction (P4):** no weak-signal, risk or opportunity products; three branch kinds (no disruption/user); no severity, dedup or escalation on warnings; two model families (V0, V4, V8).
- **Decisions and Executive OS (P6):** conditional approvals stored but not evaluated; case-bound agent simulation selection; Strategic Health Score, priorities/attention routing and notification transport absent; VOI/second-order nominal (V0 C-034, V4, V8, V9).
- **UX (P7-E):** no Arabic catalogue/locale negotiation, mobile/offline profile, dialogs/tabs/command palette, charts, notifications, theming controls, accessibility certification; Executive OS, risk/opportunity and agent workspaces absent (V9).
- **Commercial (P7-F):** no entitlements, licensing, metering, onboarding, product-baseline registry or traceability service (V8, V10).


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

- **R-1 — resolved**: the owner's register is preserved at `audit/The_Eye_Full_Product_Delivery_Register_2026-09-09.md` and reconciled in §5.
- **R-2 — resolved**: all eleven volumes are in `docs/` at `07edd9dc`; the audit's first pass is complete (§5).
- **R-4 (new, for step S4 of §9)** the owner's decisions on the ambiguities the auditors flagged: the truth-state vocabulary of migration 0006 versus Volume 0 Appendix A; the CAP-* capability ids Volume 9 cites but Volume 8 defines; whether the PR `-004` parity and `-006` acceptance rows are judged per deployment profile now or after P7-D.
- **R-5 (new, for step S5)** representative domain data and accountable experts, and source permissions, per the resource register in the owner's file — requested per row when its implementation starts, not before.
- **R-3 (revised, §4.2)** the owner's decision to publish the prepared candidates to GHCR from a repository-associated workflow (no personal token), and confirmation that the repository's package settings allow Actions to write packages; or the decision to wait for rebuilt official images.

## 9. Integrated delivery schedule (one sequence, dependencies stated, no phase-complete claims)

The schedule below turns the owner's packages into an ordered plan against the atomic register. Each
step names its entry condition, its work (with the register rows it closes, by package), its exit
evidence and what it must not do. Effort figures are deliberately absent: they need the second audit
pass (§5) and actual resources; the order and the dependencies are what this schedule fixes.

| Step | Entry condition | Work (package · rows) | Exit evidence | Dependencies / holds |
|---|---|---|---|---|
| S0 · Correction review of PR #46 to closure | now | the reviewer's next pass at `561dd3c`+ (this pass reproduced and corrected R3–R7 at the harness); any further path handled the same way (reproduce at the real harness, forward migration, controls preserved) | the review recorded closed by the reviewer, not by the author | none |
| S1 · Release maintenance to green (R0) | S0 | the util-linux image candidates published and re-pinned (§4.2) through the governed maintenance path; the C15 patched-image recheck against the real digests; FINAL C16/C17 chain; the C19 lifecycle/anchor chain; unit gate probes on the committed tree; the timing-dependent tests fixed without weakening (done for the 80 ms case) | one exact head where every required check executed and passed | the owner's publishing decision (R-3); no waiver |
| S2 · Protect the development data (R0 · P7-D rows on backup/restore) | parallel with S1 | backup and restore of the local vault, the degraded journal, `eye`/`eye_demo`; a demonstrated coherent restore; isolated test/demo environments so verification never shares a working tree or database with a build | a restore drill recorded with digests before/after | none; unblocks every later environment change |
| S3 · Integrate the reviewed branches in order | S1, S2 | #39 → #36 → #38 → #40 → #41 → #43 → #44 → #45 → #46, each at its reviewed exact head, each behind C15 and FINAL C16/C17; validate the combined release on `main` (test:int:all, upgrade check from 0001, browser suites) | `main` at one head carrying Phases 0–6 with the full evidence set | S1 green; the recorded merge order is not an authorisation to merge unchecked heads |
| S4 · Second audit pass and acceptance units (§5) | S3 (can start during S1–S3 for read-only work) | cross-volume duplicate reconciliation; verify every `partial` row's remaining work; attach one acceptance unit per row; resolve the ambiguities the auditors flagged (truth-state vocabulary vs Appendix A; CAP-* ids defined in Volume 8; PR `-004` parity and `-006` acceptance rows) with the owner | `audit/requirements/*.csv` at pass 2, every row with an acceptance unit; owner decisions recorded | owner decisions on ambiguities (resource: product/domain choices) |
| S5 · Earlier-phase omissions in dependency order (P1 → P2 → P3 → P4 → P5 → P6) | S3, S4 | the `omission` rows of each package, in this order: P1 source universe (connector families beyond upload/RSS/REST; credential binding; rights/purpose lifecycle; collection plans and watchlists), P2 intelligence (document/media parsing, OCR, multilingual extraction, contradiction detection, provider adapters with routing/fallback, bounded inference), P3 memory (embeddings and hybrid retrieval, ontology governance, export/exit, lawful lifecycle incl. retention and legal hold), P4 prediction (weak signals, risk/opportunity products, disruption and user branches, coherence constraints, severity/dedup/escalation of warnings, model registry), P5 twins (further twin families, scenario element kind, queued simulation execution), P6 decisions (conditional approvals, case-bound agent simulation selection, Strategic Health Score, priorities/attention routing, notification transport, planning, second-order/VOI engines) | per row: harness evidence at the real boundary, browser evidence where the row is a screen, CI; the `CorrectionApplied` consumer designed and delivered as its own governed implementation | representative data and domain experts for validation rows (resource register); source permissions for new source families (holds stay until the owner lifts them) |
| S6 · Phase 7 portfolio (P7-A … P7-F) | S5 for the parts that depend on stable P1–P6; P7-D infrastructure work starts with S2 | P7-A planner/supervisor/workflow runtime with task graphs, checkpoints, sandboxed tools, hard budgets; P7-B governed learning (benchmarks, calibration/drift/safety evaluations, promotion, canary, rollback); P7-C signed marketplaces; P7-D three deployment profiles, IAM/SSO/MFA, KMS, TLS, HA/PITR/DR, observability planes, error budgets, capacity, rollback; P7-E complete UX (workspaces, accessibility certification, localisation incl. Arabic, mobile/offline, theming); P7-F entitlements/metering, onboarding, export/exit, support, analytics | profile-specific acceptance evidence for the exact release on each supported profile | deployment infrastructure, compute/model access and engineering capacity (resource register) |
| S7 · Full-product acceptance | S5, S6 | every row of every volume at `implemented` with evidence of its class on the released artefact; the eleven-volume trace in the product itself (Volume 8 PR-01/PR-08/PR-72) | the register with no open row, or each open row carrying an owner, a dependency and a date | — |

Rules that bind every step: forward-only migrations; corrections reproduced at the real harness before a
change; no waiver of C15/C16/C17/C18/C19; no source activation, credential use, purchase or permission
email without the owner's instruction; PortWatch and Comtrade holds unchanged until revisited
deliberately; evidence classes kept apart in every report.

No email is sent, no source activated and nothing purchased by this register.
