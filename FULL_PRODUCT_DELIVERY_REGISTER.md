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
- **R-3 (revised, §4.2)** the owner's decision to publish the prepared candidates to GHCR from a repository-associated workflow (no personal token), and confirmation that the repository's package settings allow Actions to write packages; or the decision to wait for rebuilt official images.

No email is sent, no source activated and nothing purchased by this register.
