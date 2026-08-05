# THE EYE — Phase 0 Evidence Package (Gate Closure, Instruction A)

> Assembled 2026-08-04. Raw command outputs: [evidence/test-runs.txt](evidence/test-runs.txt). SBOM: `evidence/sbom.cdx.json`. License inventory: `sbom/license-inventory.json` (generated per run).

## A.1–A.4 — Controlled files (actual, in-repo)

| # | File | Content |
|---|---|---|
| 1 | [PHASE0_REPORT.md](PHASE0_REPORT.md) | Deliverables, evidence map, deviations (5), carried risks |
| 2 | [PROGRESS.md](PROGRESS.md) | Phase + milestone log M1–M7, document review log, authority model |
| 3 | [DECISIONS.md](DECISIONS.md) | ADR-P0-01…17 (17 includes the bootstrap security correction) |
| 4 | [EXCEPTIONS.md](EXCEPTIONS.md) | EXC-P0-001…005 fully populated + SEC-P0-001 closed correction record |

## A.5 — 15-criterion acceptance matrix → test references

Matrix: [PHASE0_REPORT.md §4](PHASE0_REPORT.md). Test anchors (all in `apps/api/test/`):

| AC | Test reference |
|---|---|
| 1 | `acceptance.test.ts` › AC-1 (rotation-forced bootstrap login; sanitized intake on failure) |
| 2–3 | AC-2/AC-3 (governed creation; scope-mismatch `EYE-TEN-001`) |
| 4 | AC-4 suite (write / consequential-read / denied / failure / health paths) |
| 5 | AC-5 (obligations executed; purpose-missing deny) + `unit/pdp.test.ts` (8 decision-table cases) |
| 6–7 | AC-6/AC-7 (v1→v2 correction; known-at pre-correction; `EYE-PRV-001`) |
| 8 | AC-8 + `int/isolation.test.ts` (DB-level UPDATE/DELETE rejection incl. superuser trigger block) |
| 9 | AC-9 + `int/audit-chain.test.ts` (16-writer gap-free; tamper freeze + no-reseal; allocator rebuild; privilege boundary) |
| 10 | AC-4 denied-path object-count invariance + `int/audit-chain.test.ts` rollback-no-gap |
| 11 | AC-11 + `int/isolation.test.ts` (RLS negatives incl. cross-tenant INSERT rejection) |
| 12 | AC-12 + clean-clone run (A.9) |
| 13 | AC-13 (CI workflow content assertions) |
| 14 | AC-14 (catalog, ar/rtl, logical-CSS-only) + `e2e/phase0.spec.ts` scenarios 9–10 |
| 15 | AC-15 (honest exception posture; all required fields; no "later" expiries) |

## A.6 — Fresh command runs (2026-08-04, full log in evidence/test-runs.txt)

| Command | Result |
|---|---|
| `pnpm --filter @eye/contracts test` | **24/24** (3 files) |
| `pnpm --filter @eye/tokens test` | **3/3** |
| `pnpm --filter @eye/api test` | **14/14** (unit: PDP + scope) |
| `EYE_DB_*… pnpm --filter @eye/api test:int` | **14/14** (integration) |
| `pnpm --filter @eye/api test:accept` | **21/21** (incl. new forced-rotation AC-1) |
| `pnpm boundaries` | ✔ no violations (82 modules, 213 dependencies) |
| `pnpm exec playwright test` | **10/10** — see A.11 |

## A.7 — Supply-chain results

- **SBOM**: CycloneDX 1.6 generated → `evidence/sbom.cdx.json`.
- **Dependency scan** (`pnpm audit --audit-level high`): 5 findings (3 high, 2 moderate) — all in **devDependencies** of the toolchain (verified via `pnpm audit` paths: vitest/playwright transitive chains); zero findings in production dependency closure; CI gate remains blocking and these are tracked for the monthly review under ADR-P0-01's patching policy.
- **License inventory**: 184 packages recorded, allowlist-checked, 0 violations.
- **Secret scan**: gitleaks runs blocking in CI (supply-chain job); local pattern sweep found no hardcoded secrets (local-dev fixture literals excluded by design and documented in EXC-P0-005).
- **Container scan**: Trivy runs blocking (HIGH/CRITICAL) in CI.

## A.8 — Worktree evidence and commit reconciliation

**Authoritative verification target: `GATE_CANDIDATE_SHA`** — the single documentation-only gate-candidate commit, identified in the final gate bundle's `git-metadata.txt` (full 40-char SHA, ancestry, clean `git status`). All Rev-3 verification (A.6, A.9, A.11 and the raw transcripts in `evidence/`) ran against a clean checkout of that exact SHA.
Historical milestone commits for traceability only: `dc38fba` (docs baseline) → `dbb2e31` (M1) → `c619776`/`bc70bd6` (M2–M4) → `78d696b` (M5) → `bf3a62f` (M6) → `8101479` (M7) → `37d0b49` (Phase 1 plan Rev 1) → `27efe3e` (gate closure) → `f589afd` (progress) → GATE_CANDIDATE_SHA (Rev-3 corrections). Earlier fresh-run numbers recorded in this file were captured at `37d0b49`/`f589afd`-era worktrees; the **binding** results are the GATE_CANDIDATE_SHA clean-checkout transcripts.

## A.9 — Clean-clone reproducibility

Procedure first executed 2026-08-04 at `37d0b49`, re-executed against `GATE_CANDIDATE_SHA` for Rev 3 (raw transcript in the bundle): `git clone` → `docker compose -p eyeclean up -d` (**fresh volumes**) → `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm db:migrate` (0001–0006 applied on a virgin database) → `pnpm --filter @eye/api test:accept` ⇒ **21/21 passed with zero manual steps**. Stack then destroyed (`down -v`).

## A.10 — Migration status + demo

Applied migrations (digest-locked, immutable — modifying an applied file aborts the runner):
`0001_roles_and_schemas` · `0002_identity_tenancy` · `0003_policy` · `0004_audit` · `0005_audit_rebuild_rls_fix` · `0006_objects` · `0007_bootstrap_rotation`.
Reproducible demo: `./scripts/demo.sh` (compose → build → migrate → bootstrap with a generated one-time secret → API+shell → acceptance). First sign-in forces password rotation.

**Port note (accepted deviation):** API default port is **3401**, configuration-driven via `EYE_RUNTIME_PORT` / `eye.runtime.port` (zod-validated; documented in PHASE0_REPORT §5).

## A.11 — Browser regression gate (instruction B)

`e2e/phase0.spec.ts` (Playwright, chromium; API + web started by `playwright.config.ts` webServer; wired into CI as a blocking job):
1 platform-admin login (UI) · 2 governed tenant+domain creation with review step (UI) · 3 ambiguous scope fails closed (EYE-TEN-001) · 4 cross-tenant denial without metadata leakage · 5 object v1→v2 correction in UI history · 6 known-at returns pre-correction state (UI) · 7 policy denial (UI alert) + obligation evidence on audit view · 8 audit viewer + chain-integrity status · 9 keyboard navigation + landmarks + focus ring · 10 light/dark + RTL smoke.
Result: **10/10 passed** (run log in evidence/test-runs.txt).

## C — Bootstrap identity correction

Implemented per instruction C: environment-generated one-time secret (never committed/defaulted/logged; unique per environment), `must_rotate` + 24h unused-expiry (then permanently revoked), forced rotation on first use (bootstrap session denied all governed actions by the PDP until rotation; rotation revokes all sessions), structurally unable to run outside `local|test` runtime envs. Recorded in **ADR-P0-17** and **SEC-P0-001** (EXCEPTIONS.md); exposed credential `bootstrap-local-dev-1` revoked along with its binding and sessions; proven by acceptance AC-1.
