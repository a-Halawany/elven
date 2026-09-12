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
| Phase 6 — L9 Decision Intelligence & Executive OS (#46) | `branch-only`; the bounded correction review **closed at `2e83945`** (PHASE6_REPORT.md §13.6) | `phase6-decisions` | harness (25 + 19 + 10 review cases), browser 3/3, deployment, CI (build-test, browser, C19 green; C15 red) | merge gated (C15, FINAL C16/C17); Phase 6 completeness is NOT established by the closure — §6 items and the P6 rows of the audit stay open |

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

**Arm64 governance (2026-09-11).** The four re-issued records are `linux/amd64` only, so the PUBLISHED arm64
postgres child (`sha256:d3dd485b…`, the image the restore drill actually runs) was ungoverned. Its own artefact was
analysed: the binary extracted from that exact child is `gosu` sha256 `3a8ef022…`, Go `go1.24.6`, `GOARCH=arm64`,
and its 22 findings are all `stdlib` rows on `usr/local/bin/gosu` (0 of 53 OS packages); the arm64 redis child is
clean at every severity. **`govulncheck` and a Go toolchain are absent on this host, so no symbol analysis of the
arm64 binary exists: all 22 are RISK_ACCEPTED under the new SCX-0010 (21 HIGH) and SCX-0011 (1 CRITICAL) — including
the seven that are NOT_AFFECTED on amd64 (one under SCX-0004, six under SCX-0005; "eight" earlier double-counted CVE-2026-33818). The amd64 analysis was NOT carried across**, and the amd64 records keep
their scope, dates and expiry untouched. Obtaining `govulncheck` for arm64 would let those seven be re-classified on
their own evidence; until then the honest classification is acceptance. The gate now scans BOTH children of each
index (`SCAN_PLATFORMS` owned in one place so the runner and the final verifier cannot drift) and reconciles a
record against the FINDING's platform rather than a run-wide constant — strictly narrower; a record naming a platform
the run did not scan fails as OUT-OF-SCOPE rather than being silently counted unused. Local gate on the re-pinned
tree: PASS, 44 findings (22 + 22), 6 records, 0 unmatched, 0 unused, 0 out-of-scope, 0 stale.

**Candidate v2 (2026-09-10) adds the OpenSSL and c-ares fixes** (`infra/images/candidates/v2/`, evidence
`infra/images/candidates/evidence/v2/`, facts for approval in `infra/images/candidates/v2/PUBLICATION.md`):
`libcrypto3`/`libssl3` 3.5.7-r0 → 3.5.8-r0 on both images and `c-ares` 1.34.6-r0 → 1.34.8-r0 on postgres,
each verified in the live branch indexes on both architectures and pulling nothing else. Scans
(trivy 0.73.0, no ignore file, `vuln,secret,misconfig`): postgres base 32 → v1 25 → **v2 22** (only the
22 Go-stdlib rows in the byte-identical `gosu` binary remain, governed by SCX-0002…0005 whose
NOT_AFFECTED analysis carries over to the identical binary but whose `image` field must be re-issued
for a new digest, while SCX-0001/0006–0009 would match nothing and must be retired under the governed
process); redis base 8 → v1 2 → **v2 0**; nothing new; SBOM delta exactly the upgraded components,
licences unchanged; TLS 1.3 through the patched libssl verified with a mounted certificate; base-written
data read by v2; reproducible up to apk timestamps. **v3 adds an explicit non-root `USER`**: the gate's raw
`trivy-fs` step is blocking and trivy's DS-0002 fails any Dockerfile without one, so the recipe runs the
service user from the first instruction (both upstream images document this); its compatibility drill on
base-initialised volumes is recorded in `infra/images/candidates/evidence/v3/` (postgres 28/29 checks with the one
"failure" an annotated probe of the wrong cluster; redis 19/19; the limit case — a data directory not owned by the
service user — needs one start with `--user root`, documented). With v3 the gate-form filesystem scan of the whole
tree exits 0; the v1 recipe files that tripped DS-0002 are removed from the tree (their evidence and recipe text
stay under `infra/images/candidates/`). The operator-facing differences (default exec user) are in the README. **Redis's process protections are
RESTORED, not optional** (T4 of the review at `59a2459`): with `USER redis` the upstream setpriv path no longer runs,
so `docker-compose.yml` now carries `user:`, `cap_drop: [ALL]` and `security_opt: [no-new-privileges:true]` on both
services, measured on the v3 images and the bases (`infra/images/candidates/evidence/v3/process-protections.txt`,
37/37 checks): redis v3 CapBnd=0, CapEff=0, NoNewPrivs=1 — equal to the base; postgres v3 all masks 0, NoNewPrivs=1 —
stricter than the base; no capability added back; the live containers are recreated at the next governed
recreation (a separate recorded operation). `user:` is required because the bases' entrypoints decide the privilege
drop by capability and fail under `cap_drop` alone. The earlier
note below is kept as history.

**Earlier note (v1): two further upgrades are available on both branches and deliberately NOT in the candidates** (they are
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

### 5.1 Rows by volume (from `audit/SUMMARY.md`, after the second pass; counts, not a completion measure)

| Volume | Rows | missing | partial | implemented | not-applicable (impl) | verified (passed:*) | unverified | branch-only | merged | phase7 | omission | phase0–6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V0 | 177 | 22 | 128 | 26 | 1 | 71 | 90 | 96 | 55 | 19 | 28 | 128 |
| V1 | 47 | 8 | 38 | 0 | 1 | 9 | 26 | 16 | 12 | 8 | 7 | 26 |
| V2 | 223 | 32 | 90 | 91 | 10 | 155 | 58 | 128 | 54 | 19 | 14 | 180 |
| V3 | 673 | 168 | 275 | 223 | 7 | 305 | 345 | 279 | 226 | 70 | 98 | 498 |
| V4 | 538 | 154 | 276 | 105 | 3 | 316 | 213 | 122 | 262 | 129 | 42 | 367 |
| V5 | 609 | 204 | 280 | 122 | 3 | 300 | 289 | 223 | 180 | 142 | 63 | 403 |
| V6 | 769 | 497 | 240 | 31 | 1 | 158 | 609 | 55 | 204 | 35 | 461 | 271 |
| V7 | 794 | 319 | 296 | 179 | 0 | 358 | 436 | 220 | 253 | 250 | 69 | 475 |
| V8 | 904 | 359 | 488 | 57 | 0 | 357 | 546 | 305 | 240 | 140 | 309 | 454 |
| V9 | 1089 | 470 | 520 | 99 | 0 | 342 | 747 | 195 | 416 | 94 | 309 | 686 |
| V10 | 441 | 341 | 98 | 2 | 0 | 95 | 17 | 82 | 18 | 100 | 0 | 12 |
| **all** | 6264 | 2574 | 2729 | 935 | 26 | 2466 | 3376 | 1721 | 1920 | 1006 | 1400 | 3500 |

### 5.2 Open rows by delivery package (missing, partial, or implemented without evidence)

| Package | open rows | missing | partial | implemented-unverified | volumes |
|---|---|---|---|---|---|
| P1 | 223 | 90 | 129 | 4 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 |
| P2 | 232 | 54 | 174 | 4 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 |
| P3 | 351 | 82 | 249 | 20 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P4 | 278 | 127 | 147 | 4 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P5 | 123 | 13 | 98 | 12 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 |
| P6 | 268 | 83 | 184 | 1 | V0 V1 V10 V2 V3 V4 V5 V6 V8 V9 |
| P7-A | 315 | 167 | 148 | 0 | V0 V1 V10 V2 V3 V4 V5 V6 V8 V9 |
| P7-B | 255 | 118 | 134 | 3 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P7-C | 97 | 53 | 44 | 0 | V0 V1 V10 V2 V3 V4 V7 V8 V9 |
| P7-D | 1684 | 919 | 752 | 13 | V0 V1 V10 V2 V3 V4 V5 V6 V7 V8 V9 |
| P7-E | 901 | 312 | 542 | 47 | V0 V1 V10 V2 V3 V5 V8 V9 |
| P7-F | 647 | 551 | 93 | 3 | V0 V1 V10 V3 V4 V6 V7 V8 V9 |
| R0 | 42 | 5 | 35 | 2 | V0 V1 V10 V3 V5 V6 V8 |

### 5.2a Acceptance units (from `audit/acceptance-units/`, generated by `audit/summarise-units.mjs`)

Units: 3899. Source rows referenced: 6264 (6264 resolve to register rows of 6264). **Mandatory units UNFINISHED for full-profile acceptance: 3550** = 3197 in status open + 338 verified on the author's harness only (verified:local) + 15 verified on the hosted chain only (verified:ci); 0 of them carry at least one accepted profile leg (each with a validated evidence reference). Mandatory units verified on every leg they apply to (verified:all, every leg's evidence validated): 0. (S7: a unit is finished only when every leg of its profile vector carries its own signed evidence; a harness run on any machine is not a leg.) Mandatory units classified not-applicable (reconciled individually, see audit/UNIT_REPAIRS.md): 0. CAP bindings of Volume 9: 89 = 71 defined in Volume 8 Appendix A + 18 resolved by alias (18 alias rows in audit/CAP_ALIASES.md); unresolved 0. Problems: 0.

| Status | units |
|---|---|
| not-applicable | 233 |
| open | 3307 |
| verified:ci | 15 |
| verified:local | 344 |

| Package | unfinished mandatory units | open | verified:local | verified:ci | with ≥ 1 accepted leg |
|---|---|---|---|---|---|
| P1 | 124 | 124 | 0 | 0 | 0 |
| P2 | 118 | 118 | 0 | 0 | 0 |
| P3 | 153 | 142 | 1 | 10 | 0 |
| P4 | 94 | 90 | 0 | 4 | 0 |
| P5 | 37 | 37 | 0 | 0 | 0 |
| P6 | 171 | 171 | 0 | 0 | 0 |
| P7-A | 123 | 123 | 0 | 0 | 0 |
| P7-B | 126 | 126 | 0 | 0 | 0 |
| P7-C | 39 | 39 | 0 | 0 | 0 |
| P7-D | 1512 | 1248 | 264 | 0 | 0 |
| P7-E | 747 | 742 | 5 | 0 | 0 |
| P7-F | 210 | 209 | 1 | 0 | 0 |
| R0 | 96 | 28 | 67 | 1 | 0 |

| Profiles (leg vector) | units | mandatory |
|---|---|---|
| n/a | 308 | 0 |
| onprem | 4 | 4 |
| onprem\|disconnected\|air-gapped | 8 | 8 |
| private | 5 | 5 |
| saas | 6 | 6 |
| saas\|private\|onprem | 3496 | 3455 |
| saas\|private\|onprem\|disconnected\|air-gapped | 72 | 72 |

| Leg | mandatory units applying | accepted (leg evidence) |
|---|---|---|
| saas | 3533 | 0 |
| private | 3532 | 0 |
| onprem | 3539 | 0 |
| disconnected | 80 | 0 |
| air-gapped | 80 | 0 |

S7 in the accounting: `audit/summarise-units.mjs` counts a mandatory unit as UNFINISHED unless it is verified on every leg of its profile vector — the units in status `open` PLUS the units verified on one artefact only (`verified:local`, the author's harness; `verified:ci`, the hosted chain on a fresh database), neither of which is a deployment leg; single-profile progress is shown apart and is never accepted cross-profile. Since batch B4 the profile column is the LEG VECTOR (saas | private | onprem, plus disconnected | air-gapped for the 80 capabilities with an offline obligation; 23 units that name one profile carry one leg) and `legs_verified` records, per leg, the pointer to the signed per-leg result; `verified:all` is refused unless every leg is accepted, and an accepted leg on an open unit is refused. Since the Codex finding of 2026-09-12 the summariser VALIDATES each accepted leg's evidence reference (a non-empty pointer to a file in the repository on a path that names the leg), derives completion from validated evidence alone, and fails closed — any problem exits 1 and leaves the previous valid summary untouched (`audit/summarise-units.controls.mjs`, a blocking CI step). No leg of any unit is accepted at this head.

Reading the unit table: 3899 units decompose the 6264 rows (every row referenced). Mandatory units unfinished for full-profile acceptance: 3550 = 3197 in status open + 338 verified on the author's harness only + 15 verified on the hosted chain only (AU-PRD-0021 at `1a99784`; six of the seven CP-6 B1/B2 units at `5118376`, ci run 34647461349; AU-MEM-0109 at `94d66f8`, ci run 34655152733; the six CP-6 B6 units AU-MEM-0112 to AU-MEM-0117 and AU-MEM-0029 — reconciled from verified:local, every named case running on the hosted chain — at `fcbdefc`, ci run 34663012651, 852/852 in 49 files on a fresh database). The two CP-6 B7 units (AU-MEM-0118 unresolved work, AU-MEM-0119 backlog once and replay by sequence) are open until the hosted run at their head is green — the total rose from 3,548 to 3,550 by allocation, not by regression. No leg of any unit is accepted; nothing here is an acceptance.

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
| Scenario branch kinds (Volume 0 ch. 14: "shall support baseline, upside, downside, disruption, stress, adversarial, counterfactual, and user-defined scenarios"; C-022) | `missing` for five of eight kinds | migration 0029 admits `baseline`, `upside`, `downside` only — non-conforming; a forward migration and the scenario service must admit all eight with their coherence rules (P4); family V00-F022 names all eight |
| Truth-state and lifecycle vocabularies (`audit/CROSS_REFERENCES.md` §1, TSM-1/LSM-1) | `partial` | stored values stay; add the `predicted` and `approved` aliases to `TRUTH_STATE_COMPAT` (code), admit lifecycle `retired` by forward migration; Volume 9 Appendix B lacks a label for `extracted` (a Volume 9 amendment, not code) |

## 7. Operations items (open)

| Item | Status | Note |
|---|---|---|
| Durable deployment recovery (the `.eye-local` loss of 2026-09-09; vault and journal backup/restore) | `partial` — coherent, ENCRYPTED backup/restore demonstrated on the local profile with the build checkout unavailable (fifth drill, 2026-09-11; CP-4), not yet on any other profile | `scripts/ops/backup.sh` (one bundle: both database dumps with `pg_dump -Fc`, role globals, the vault and journal tars, a byte copy of the configuration, a manifest with every digest, migration ledger, object and audit-chain heads and image digests) and `scripts/ops/restore.sh --into-isolated` (a NEW container from the same pinned digest on a new volume, restore, then 36 coherence checks: ledger, counts, the audit chain re-computed with the contracts' own hash over every unfrozen partition, every live evidence blob of the demonstration present with its recorded sha256, a second API instance serving a governed read from the restored state). Drill record `docs/ops/evidence/restore-drill-20260910T075051Z.md`; runbook `docs/ops/BACKUP_RESTORE.md` (RPO = the backup interval; RTO measured 16 s to a proven governed read). Limitations recorded: the harness database `eye` was never a coherent evidence store (per-test vault roots); the bundle holds secret material unencrypted and must not leave the host; the journal directories were empty during the drill; the live volume was never touched |
| ECB live backfill (`activate-ecb.mjs`) | `blocked` | the publisher's data API timed out from this machine on every attempt on 2026-09-09; no waiver |
| Database/host clock skew | `open` (observed, cause not investigated; `eu-sanctions-rss` ticks still fail intermittently with "recorded_at is in the future" — four times on 2026-09-11 before the recreation) | on 2026-09-10 the database container's clock ran 28 min 15 s behind the host during the morning (replay ticks failed with "recorded_at is in the future"); measured 0 s at 16:35 UTC; a P7-D operations item: clock discipline and a health signal exposing database time |
| IMF PortWatch | permission **GRANTED** (owner-reported 2026-09-10; grant text and conditions to be attached at `docs/sources/portwatch-grant.md`) — activation in progress within the approved rights, the EXISTING cadence and budget (no change authorised) | `SOURCE_INTEGRATION_STATUS.md` §9 (2026-09-10): rights `confirmed` on both sources with the owner-reported evidence through the governed rights route; `imf-portwatch-ports` **v3 LIVE and active** (the v2 attempt found every PortWatch contract since Phase 1 declared the chokepoints MASTER layer, which has no daily series — v3 declares `Daily_Ports_Data/FeatureServer/0`; same cadence 86,400 s, same budgets 12 requests / 32 MiB, §4a backfill): the first governed walk admitted 2,804 rows in 3 requests (1.8 MB), the scheduler's next tick within cadence; `imf-portwatch-chokepoints` stays REPLAY with rights confirmed until the connector carries a composite item key (date + portid) — a P1 acceptance item (§9.7). **Product defect found and routed to P1 (§9.6.1), not forced:** an operator trigger accepted while the scheduled walk was still running admitted 2,133 second copies of already-held rows — the operator route is not serialised against in-flight attempts and the checkpoint is persisted only at run end. Depends on the grant text: scope/retention of the 2019→present window, attribution, permitted uses, rate conditions. The replay-only hold is superseded |
| UN Comtrade | `blocked` (hold) | deferred; the key untouched — unchanged |
| A scheduled walk that "stalled" mid-page (observed 2026-09-10, `SOURCE_INTEGRATION_STATUS.md` §9.11.7 item 3) | **diagnosed and corrected 2026-09-11** (migration 0057) | the walk did not stall: its agent run session had a fixed 15-minute expiry and the 12,856-event walk outlived it — the attempt row records `failed`, "authority insufficient for this operation", finished exactly 900 s after opening; the terminal event was refused for the same reason and swallowed. Corrected: the run session is extended by each committed page checkpoint (`identity.agent_session_extend`, audited), and a terminal event that cannot be written is said in the attempt's reason. Regression: `phase6-scheduled-collection` (extension per page; an expired session refused at its first effect, the attempt naming it, the next attempt taking the lease over). |
| The outbox publisher ended the API process during a correction (`capability denied: mode publish required (context is none)` from `outbox_lease`, §9.11.7 item 2) | **diagnosed and corrected 2026-09-11** (migration 0057) | the publish context expires 60 s after issuance by wall clock and the publisher issued it one round trip before using it; a process stalled in between (the correction was one multi-minute transaction) reached the lease with an expired context, read as none, and the interval callback's uncaught rejection ended the process. Corrected: `objects.outbox_lease_as_publisher` / `outbox_ack_as_publisher` issue and consume the capability in one backend call; a failed tick is reported and retried, never fatal. Regression: `phase6-outbox-publisher` (the mechanism reproduced with a 61 s pause; the one-call ports; role isolation) and a unit test driving the interval with a rejecting tick. |
| `phase5-twins`: three cases refuse `consumption.weekly` as stale (E3: a new version that supersedes; an alternative branch; verification by event) | `open` — characterised 2026-09-11 (owner P5): a **re-run sensitivity**, not load and not the long-lived database as such | On a fresh, separately named database (`eye_verify_20260911`) the FIRST full-suite run passes 809/809 and a second fresh database at the corrected head passes 814/814; the SECOND full-suite run on the same database fails exactly these three; the same file alone on that database (third run) passes 15/15. So the failure needs prior suite data in the database AND the full-suite ordering — CI (always a first run) and isolation never show it. The F05/F06 contamination was fixture-side and is resolved (fixture runs carry their correlation id; fresh databases clean). Next step for P5: find which earlier suite's rows the E3 fixture's carried-forward `consumption.weekly` element resolves against on a re-run. |
| The C19 delivery-chain dry run's publication-fixture lookup (`scripts/gate/c19-fixture.mjs`) | `open` — observed 2026-09-11 (owner P7-D) | three of nine concurrent C19 runs reported "no main commit has an intact chain with an unexpired artifact" within the same minute six others resolved the fixture; all three passed on re-run. Fails closed as designed; the resolver's behaviour under concurrent runs is to be characterised. |
| The connector code digest (§9.11.7 item 4) | **resolved 2026-09-11** through its governed act (§9.11.10) | the digest now covers the framing methods; six new REST agents registered, six revoked, schedules re-resolved, one run finished under the new digest. |

## 8. Resource requests (specific, each tied to the next concrete task)

- **R-1 — resolved**: the owner's register is preserved at `audit/The_Eye_Full_Product_Delivery_Register_2026-09-09.md` and reconciled in §5.
- **R-2 — resolved**: all eleven volumes are in `docs/` at `07edd9dc`; the audit's first pass is complete (§5).
- **R-4 — DECIDED by the owner (2026-09-10)**, subject to the reviewer's conditions, and scheduled: (1) four warning levels (low/normal/high/critical) with a VERSIONED derivation stating impact and response urgency, confidence and the C0–C4 operation/authority class kept explicit and distinct (a label never changes decision authority) — P4; (2) three deployment-mode acceptance legs (SaaS, private cloud, on-premises), with disconnected and air-gapped evidence carried COMPLETELY per applicable capability on their own rows (never used to omit cross-capability offline evidence) — P7-D; (3) SLO baselines: safety/durability/provenance semantics and floors preserved without weakening, with expressly declared and justified operational variance where the controlling clauses permit it, mapped for the ENTIRE catalogue — P7-D; (4) versioned, subject-based CAP aliases (CAP-PD-11 → CAP-AU-08 + CAP-DL-12 among them) with lossless mapping of every obligation and historical ids kept resolvable; no capability requirement deleted to preserve a count — audit CP-6. The eight scenario kinds of Volume 0 ch. 14 are P4 full-product completion work (schedule S5), not a reopened correction. **Implemented on `phase6-decisions` (2026-09-11):** (1) as batch B2, migration 0061 — derivation v1 in `prediction.warning_level_versions`/`warning_level_derivations`, the level derived and verified by the raise port, the operation's class recorded beside it (AU-PRD-0061–0063); (2) as batch B4 — the leg vector and `legs_verified` on every unit (3,542 mandatory units × three legs; 80 × five), no leg accepted; (3) as batch B4 — `audit/SLO_CATALOGUE.md` v1 (22 objectives: 12 floors, 5 value-variance, 5 population targets, each with its clause; the 22 units cite their class); (4) as batch B5 — `audit/CAP_ALIASES.md` v1 (89 = 71 defined + 18 alias-v1) and the `cap_alias` column of the requirement CSVs, resolved by `audit/second-pass.mjs` and checked by `audit/summarise-units.mjs`. The eight kinds were B3 (0058) and their demonstration was corrected at this checkpoint (0059).
- **R-4 (history) — resolved to four genuine choices** (`audit/CROSS_REFERENCES.md`, exact clauses quoted, versioned mappings TSM-1/LSM-1/CAP): the truth-state vocabulary needs NO owner decision (an 18-row mapping; two compat aliases to add in code, one lifecycle value `retired` by forward migration); the CAP ids resolve by Volume 8 Appendix A (71 defined, 18 aliases); the `-004`/`-006` rows are judged per agreed profile, scheduled with P7-D, never passed on a local demonstration. The choices that remain the owner's, each with a recommendation: (1) the warning severity scale and its derivation (no volume defines one; recommended: four levels derived from consequence class by a versioned rule); (2) three or five acceptance legs per profile row (SaaS/private/on-premises, or also disconnected and air-gapped; recommended: three, with disconnected/air-gapped carried by their own rows); (3) SLO baseline values as floors or with per-profile variance (recommended: floors for semantics-bearing SLOs, declared variance for latency/availability); (4) four Volume 9 capability ids without a Volume 8 definition (recommended: alias by subject; fold CAP-PD-11 into AU-08 + DL-12 rather than add a 109th capability).
- **R-5 (new, for step S5)** representative domain data and accountable experts, and source permissions, per the resource register in the owner's file — requested per row when its implementation starts, not before.
- **R-3 — publication approval requested, with the exact facts** (`infra/images/candidates/v2/PUBLICATION.md`; workflow `.github/workflows/publish-derived-images.yml`, manual dispatch only):
  - *Artefacts:* `ghcr.io/a-halawany/elven/postgres:18-alpine-maint-20260910` and `ghcr.io/a-halawany/elven/redis:8-alpine-maint-20260910`, built by the workflow from `infra/images/candidates/v2/{postgres-18-alpine,redis-8-alpine}.Dockerfile` at the commit the run names; the immutable reference is the digest the push reports, and only that is pinned afterwards. Recipe: the pinned upstream digest + one apk transaction (postgres: libuuid 2.42.3-r1, libcrypto3/libssl3 3.5.8-r0, c-ares 1.34.8-r0; redis: setpriv 2.41.6-r1, libcrypto3/libssl3 3.5.8-r0) + `USER postgres`/`USER redis`.
  - *Platforms:* `linux/amd64` (required; the gate scans it; ≈156 MiB compressed for both) — and, recommended, `linux/arm64` for the local profile on Apple silicon (+≈155 MiB).
  - *Visibility:* the recommendation is **public** (the images contain only upstream open-source software; public packages are free; the CI gate and local development pull anonymously). Private would count against the account's Packages quota (Free plan figures per GitHub's billing documentation: 500 MB storage, 1 GB/month transfer — verify on the billing page), require `packages: read` plus a `docker login` in the `supply-chain` job, and a personal token for every developer.
  - *Permissions:* the workflow runs with `contents: read` and `packages: write` on the job-scoped `GITHUB_TOKEN`; no personal token; `id-token: write` only if signing is added later. New GHCR packages under a personal account are private by default and unlinked; the first run creates them, after which the owner links each package to the repository and sets the visibility (checks listed in PUBLICATION.md §7). If the account or organisation policy blocks Actions from writing packages, the run fails at login and the exact setting is reported — no personal token is asked for unless that failure demonstrates the need.
  - *Cost:* none for public packages; nothing else is purchased.
  - *After approval:* run the workflow with the approval reference; verify the registry and platform digests and the raw scan/SBOM of what was pushed; re-issue SCX-0002…0005 for the new `image` and retire SCX-0001/0006–0009 under the governed disposition process; re-pin `docker-compose.yml`, `conformance.manifest.json` and the scanner targets; run the C15 patched-image recheck and the full FINAL C16/C17 chain before any merge. Every stacked PR is re-checked; no commit hash is transplanted.
  - *PUBLISHED (2026-09-10, run 34502081248, bound to the approved recipes of `59a2459`; receipts in `infra/images/published/20260910/`):* `ghcr.io/a-halawany/elven/postgres:18-alpine-maint-20260910@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` (index; linux/amd64 `bc90ce6b…`, linux/arm64 `d3dd485b…`) and `ghcr.io/a-halawany/elven/redis:8-alpine-maint-20260910@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15` (index; amd64 `0c0a48dd…`, arm64 `c11d75ca…`). Both built natively on their platforms and pushed by digest; both packages `public` and linked to the repository (package API 200; anonymous manifest fetch 200 for each). Scans of the pushed children (trivy 0.73.0, HIGH/CRITICAL, no ignore file): postgres 22 rows, all Go-stdlib advisories in the byte-identical `gosu` binary (governed, re-issued for the new artefact); redis **0**. SBOMs of all four children retained. The derived images are TEMPORARY: upstream monitoring continues and each service returns to a verified official image through the governed process.
  - *Decided:* GHCR is APPROVED as a temporary maintenance route (`docs/images/DERIVED_IMAGES_APPROVAL.md`); publication proceeds within that approval through `publish-derived-images.yml` (bootstrapped by a `publish/derived-images/<date>` branch, never through `main`; structured inputs from `infra/images/candidates/v2/PUBLISH.json`; the run bound to the approved source revision; both platforms built natively and pushed by digest, one index; per-platform scans and SBOMs; receipts uploaded on every path; package write authority and public readability verified, not inferred). Upstream monitoring stays and each service returns to a verified official image through the governed process; the derived images are not permanent.

## 8a. Current delivery checkpoint (the review closed at `2e83945`; three tracks running together)

The owner's revised register (`audit/The_Eye_Full_Product_Delivery_Register_2026-09-09_rev2.md`, sha256
`3a8287aa…`) records the closure and sets the checkpoint: (1) the audit's second pass — acceptance units,
lossless source spans, duplicate mappings, corrected release states, resolvable evidence, the `done`
rows reassigned, extraction and transcription artefacts persisted (`audit/extraction/`); (2) coherent
backup/restore demonstrated before further destructive environment work (`scripts/ops/`,
`docs/ops/BACKUP_RESTORE.md`); (3) the final derived-image candidate with the compatible OpenSSL and
c-ares fixes, a repository publication workflow, exact names/visibility/platforms/permissions/cost, and
the owner's approval requested only after preparation. CI wording at this checkpoint: the final unmatched
set is 13 image rows; at `2e83945` the raw `trivy-fs` step reported FAIL (the candidate Dockerfiles' `DS-0002`,
§4.2 — resolved by v3 and the removal of the v1 files: `trivy-fs` ok at `5f84fe2`); at `5f84fe2` the raw
`gitleaks-worktree`/`gitleaks-history` steps reported FAIL on ONE false positive — the digest prefix of the public
OpenSSL engine library `capi.so` in a v2 layer listing, matched because the engine name contains the letters
`api` — corrected in the working tree (digest column first) and, for the two historical commits that carry the
old layout, governed by a commit-, file- and literal-pinned allowlist entry in `.gitleaks.toml` with its record
in the runner, the same form as the three earlier entries; every other rule and match stays in scope. The
checkout is the synthetic merge of the candidate onto the base. Browser: Phase 6 3/3;
Phase 4/5 one ECB-dependent failure and twelve not run.

## 8b. The next delivery checkpoint — acceptance units, dependencies, exit evidence

The checkpoint is "S1 green, S2 done, S4 complete" (schedule §9). Its units, each with the evidence that closes it:

| Unit | Depends on | Exit evidence |
|---|---|---|
| CP-1 · Derived images published and pinned — **DONE 2026-09-10** | — | run 34502081248: index and both platform digests recorded (`infra/images/published/20260910/`), raw scans and SBOMs of the pushed children, public and repository-linked; pins updated (`c9d3d68`); SCX-0002…0005 re-issued, 0001/0006–0009 retired; the recheck re-purposed and green |
| CP-2 · C15 green at one exact head — **reached at `ea8edb2` for the supply-chain job** (every raw step ok, 0 UNGOVERNED, FINAL C16 and the manifest assertion, licence inventory, C17 validation and obligations green; the C17 archive packaging step runs on push events only by the workflow's condition — it executes after the merge in the recorded order); **reached in full at `d4730f2`** (run 34515658422: `build-test`, `browser-regression`, `supply-chain` all green; run 34515658380 C19 green) | CP-1 | recorded; the C17 archive packaging step executes on the push event after the merge (workflow condition) |
| CP-3 · C19 chain and FINAL evidence archive at that head | CP-2 | C19 lifecycle and anchor runs green; the evidence archive verified by `package-c17-evidence.mjs verify` |
| CP-4 · Coherent recovery — **the review at `461a2b56` reproduced two defects in the fourth drill's additions (R1 cleanup ownership, R2 path binding) and found the restore fallback unbound (R4); corrected and re-drilled 2026-09-11** (`docs/ops/evidence/restore-drill-20260911T112927Z.md`, E1 61/61, E2 76/76, every return code 0; guards 69/69; runbook §22) | none | R1: a directory is owned by CREATING it (`ops_run_create_dir`, inode-bound cleanup set), the builder verifies a pre-created root is empty; R2: format `eye-bundle-crypto/2` — aad ≡ path, canonical paths, authenticated file map, physical containment, format /1 refused; R4: `runtime-workspace.tar` in every bundle, the fallback installs from it with a frozen lockfile or refuses before launch, the artifact's migration ledger recorded and checked against the restored schema, the reconstructed tick's OUTCOME its own check. The fifth drill restored E2 **without the build checkout**, recovered the non-empty journal, enumerated the boundary, rebuilt the scheduler and **completed one scheduled collection** (`eu-sanctions-rss`, finished), and passed the governed read the fourth drill failed. The fourth drill's record stands unchanged. |
| CP-4a · The live containers' recreation onto the pinned images — **DONE 2026-09-11** (`docs/ops/evidence/live-recreation-20260911T153804Z.md`; runbook §23) | CP-4 (done); the arm64 disposition (owner-accepted 2026-09-11) | Rollback bundle `20260911T153804Z` taken from the live deployment and verified by an isolated restore (61/61) before anything was recreated; `docker compose up -d --force-recreate --wait` on the pinned derived images with the data volume reused; both containers healthy (the Redis healthcheck streak of 5,656 failures ended), running as `70:70`/`999:1000` with all capabilities dropped and `NoNewPrivs 1`; image digests recorded (postgres index `69a974ae…`, arm64 child `d3dd485b…`; redis `1ad0ff24…`); the same data at 0057; `/readyz` ok; 12/12 principals log in; schedules reconciled 6/6; five scheduled collections finished within a minute (World Bank timed out upstream). |
| CP-5 · Isolated verification environments | CP-4 | every verification run (harness, browser, upgrade check) on an environment restored from a bundle, never on a shared working tree or the live databases; recorded per run. One structural limit found: migration 0038 requires `acquisition_mode = 'live'` for a scheduled entry, so a zero-egress replay tick is impossible by construction — an isolated verification that must not reach the network either uses an upload source or accepts that live entries do not tick |
| CP-6 · Audit second pass complete — **batches defined 2026-09-11 (`audit/CP6_BATCHES.md`); B3 (the eight scenario kinds, 0058; demonstration corrected, 0059), B1 (the `CorrectionApplied` consumer, 0060), B2 (warning levels, 0061) implemented and exercised on the demonstration; B4 (profile legs, SLO catalogue) and B5 (CAP aliases) applied to the audit; the seven B1/B2 units `verified:ci` at `5118376`; Codex's two findings (recovery of interrupted attempts, 0062; evidence-backed S7 accounting) corrected and hosted green at `94d66f8`; B6 (the `GraphChanged`/`MemoryCorrected` subscriptions and their six consumers, 0063, AU-MEM-0112–0117) implemented, exercised on the demonstration and `verified:ci` at `fcbdefc` (ci 34663012651, 852/852 on a fresh database); Codex's third finding (a retrieval retry cleared a mismatch without a second check) reproduced at the database/queue boundary and corrected by B7 (0064: unresolved work stays unresolved; the declared partition and sequence; failure classes; telemetry; legal holds; AU-MEM-0118/-0119), its units open until its hosted run is green; no deployment leg accepted** | none (read-only) | acceptance units for every capability group (`audit/acceptance-units/`), every `partial` row's remaining work verified against the code, the owner's four choices (R-4) recorded, `audit/SUMMARY.md` regenerated; no completion percentage |
| CP-7 · Integrated baseline on `main` (S3) — **stack PREPARED 2026-09-11, not merged** (`docs/ops/STACK_INTEGRATION_PLAN.md` §7) | CP-2, CP-3, CP-5; the owner's explicit merge instruction | Every head in the recorded order carries its predecessors and the maintenance set (#39 `a2cb0d8` → #36 `d458b36` → #38 `1ed69ed` → #40 `fb18c1f` → #41 `9f18468` → #43 `34969e8` → #44 `41eaa04` → #45 `da47bd3` → #46); eight of nine hosted `ci` runs green at those heads (the ninth, #46's, is the run at the head this register is committed with — see PHASE6_REPORT.md §17.1); the three `PROGRESS.md` conflicts and the `ci.yml` guard resolved by hand; lockfiles regenerated per tree. Merging waits for the owner's instruction, one head at a time in this order, each followed by the push-only C17 archive on `main`; `test:int:all`, the upgrade check from 0001 and the browser suites on `main` after the last. |

Holds as they now stand: no waiver, no unchecked merge, no purchase, no cadence or budget change, no email; PortWatch activation proceeds within its granted permission; UN Comtrade stays deferred with its key untouched; the deferred `CorrectionApplied` consumer remains required full-product work (P3).

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
| S7 · Full-product acceptance | S5, S6 | nothing new: the state in which no mandatory acceptance unit remains open | **Full-product acceptance requires every applicable mandatory acceptance unit to be implemented and verified on the applicable released artefact and on every agreed deployment profile, with its required integrations and operational evidence. An open, partial, unverified, failed or blocked mandatory unit prevents acceptance. An owner, a dependency and a date schedule unfinished work; they do not close it. Explanatory and non-applicable source rows carry a documented applicability rationale, never a fabricated test.** | — |

Rules that bind every step: forward-only migrations; corrections reproduced at the real harness before a
change; no waiver of C15/C16/C17/C18/C19; no purchase, no cadence or budget change, no permission email
without the owner's instruction; PortWatch proceeds within its granted permission and recorded conditions;
UN Comtrade deferred with its key untouched; evidence classes kept apart in every report.

No email is sent, no source activated and nothing purchased by this register.
