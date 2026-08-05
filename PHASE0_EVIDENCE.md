# THE EYE — Phase 0 Evidence Package (Invariant-Remediation Gate)

> Assembled 2026-08-05 for the **Phase 0 invariant-remediation gate**. This file references ONLY the new binding evidence produced against the final remediation SHA (`GATE_CANDIDATE_SHA` in `evidence/git-metadata.txt`). Superseded historical evidence is labeled as historical in §H or removed.
>
> Raw command/timestamp/tool-version/exit-code logs: [evidence/test-runs.txt](evidence/test-runs.txt). SBOM: `evidence/supply-chain/sbom.cdx.json`. License inventories: `evidence/supply-chain/licenses-prod.json` + `licenses-dev.json`. SBOM↔lockfile↔license reconciliation: `evidence/supply-chain/reconciliation.txt`.

## A.1–A.4 — Controlled files (actual, in-repo)

| # | File | Content |
|---|---|---|
| 1 | [PHASE0_REPORT.md](PHASE0_REPORT.md) | Deliverables, evidence map, deviations, carried risks |
| 2 | [PROGRESS.md](PROGRESS.md) | Phase + milestone log, invariant-remediation entry, candidate SHA |
| 3 | [DECISIONS.md](DECISIONS.md) | ADR-P0-01…17 |
| 4 | [EXCEPTIONS.md](EXCEPTIONS.md) | EXC-P0-001…005 (open) + SEC-P0-001 (closed) + EXC-P1-001/002 (proposed); exact requirement IDs; controlled status enum |
| 5 | [PHASE0_INVARIANT_REMEDIATION_PLAN.md](PHASE0_INVARIANT_REMEDIATION_PLAN.md) | The authorized bounded remediation (R1–R10) executed by this gate |

## A.5 — Mandated remediation tests (R10) → executable references

All exercise the REAL services, database policies, and privilege boundaries (no source-string inspection, no reimplemented production logic).

| R10 | Requirement | Test reference |
|---|---|---|
| 1 | Domain A vs domain B isolation in one tenant | `int/domain-isolation.test.ts` |
| 2 | Read/write isolation for every scoped table | `int/domain-isolation.test.ts` |
| 3 | App role cannot self-elevate via custom GUCs | `int/privileges.test.ts` |
| 4 | Credentials/sessions/break-glass not directly readable | `int/privileges.test.ts` |
| 5 | App role cannot forge POL/AUD or invoke governed recovery | `int/privileges.test.ts` |
| 6 | Scope/action mismatch → durable sanitized failure evidence | `acceptance.test.ts` › R10 #6 |
| 7 | Validation/provenance/version/read failures → durable evidence | `acceptance.test.ts` › R10 #7 |
| 8 | Login/session, rotation, refresh roll back if audit commit fails | `acceptance.test.ts` › R10 #8 |
| 9 | Refresh rotation, replay detection, concurrent refresh | `int/refresh.test.ts` + `acceptance.test.ts` › R4 |
| 10 | Concurrent audit append vs REAL verify/seal | `int/audit-chain.test.ts` › mandated 10 |
| 11 | Every canonical header field validated + digest-bound | `packages/contracts/test/header-registry.test.ts` |
| 12 | Virgin `./scripts/demo.sh` → usable login flow | `scripts/verify-demo.sh` → `evidence/demo-virgin-transcript.txt` |
| 13 | Exact image-digest + blocking image scan | `scripts/verify-images.sh` → `evidence/supply-chain/verify-images.txt` |
| 14 | All existing Phase 0 suites remain green | §A.6 |

## A.6 — Fresh command runs (2026-08-05; full log with timestamps, tool versions, exit codes in evidence/test-runs.txt)

| Command | Result |
|---|---|
| `pnpm --filter @eye/contracts test` | **118/118** (4 files, incl. header-registry) |
| `pnpm --filter @eye/tokens test` | **3/3** |
| `pnpm --filter @eye/api test` | **14/14** (unit: PDP + scope) |
| `pnpm --filter @eye/api test:int` | **38/38** (domain-isolation, privileges, audit-chain, refresh) |
| `pnpm --filter @eye/api test:accept` | **34/34** (15 criteria + §7.2 paths + R4/R10 #6/#7/#8) |
| `pnpm boundaries` | ✔ no violations (85 modules, 222 dependencies) |
| `pnpm typecheck` | ✔ all 4 workspaces |
| `pnpm exec playwright test` | **10/10** — see §A.11 |

## A.7 — Supply-chain results (new binding evidence, all under evidence/supply-chain/)

- **SBOM**: CycloneDX 1.6 via the pinned, tracked generator `scripts/generate-sbom.mjs` → `sbom.cdx.json` (**280 components**, non-empty; the generator fails CI on an empty SBOM). Old zero-component `evidence/sbom.cdx.json` **removed**.
- **Reconciliation**: `reconciliation.txt` — SBOM components == production inventory + development inventory, and ≤ lockfile resolution entries (invariants enforced by the generator).
- **License inventories**: `licenses-prod.json` + `licenses-dev.json`; allowlist-checked by `scripts/license-inventory.mjs`, 0 violations.
- **Dependency scan** (`pnpm audit --audit-level high`): **0 known vulnerabilities** after the sharp≥0.35.0 / postcss≥8.5.23 workspace overrides (`pnpm-audit-human.txt`, `pnpm-audit.json`, exit in `pnpm-audit-exit.txt`).
- **Filesystem scan** (`trivy fs`, labeled as a filesystem scan): `trivy-fs.txt`.
- **EXACT container-image scans** (`trivy image` of the pinned digests, blocking HIGH/CRITICAL, dated CVE dispositions in `.trivyignore`): `trivy-image-postgres18.txt`, `trivy-image-redis8.txt`, summary `verify-images.txt` — postgres:18-alpine and redis:8-alpine both **exit 0**.
- **Secret scan** (gitleaks): `gitleaks-report.json` + `gitleaks-stdout.txt`.
- **CI statement**: `ci-statement.txt` — local-equivalent evidence for this local-only gate; hosted CI is **not** claimed.

## A.8 — Worktree evidence and commit reconciliation

**Authoritative verification target: `GATE_CANDIDATE_SHA`** — the final remediation commit, identified in `evidence/git-metadata.txt` (full 40-char SHA, ancestry, clean `git status`). All §A.6, §A.9, §A.11 results and the raw transcripts in `evidence/` ran against a clean checkout of that exact SHA. The tracked-source snapshot (`evidence/tracked-source.sha256` + the bundle's manifest) is tied cryptographically to that SHA.

## A.9 — Clean-checkout reproducibility (virgin volume)

Executed 2026-08-05 against `GATE_CANDIDATE_SHA` (raw transcript: `evidence/clean-checkout-transcript.txt`): fresh `git worktree` from the exact SHA → `docker compose up -d --wait` (**fresh volumes**, digest-pinned images) → `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm db:migrate` (0001–0008 applied on a virgin database) → integration + acceptance suites ⇒ **green with zero manual steps**. The virgin `./scripts/demo.sh` login-flow proof (`evidence/demo-virgin-transcript.txt`) is the R10 #12 evidence. Stack then destroyed (`down -v`).

## A.10 — Migration status + demo

Applied migrations (digest-locked, immutable — modifying an applied file aborts the runner):
`0001_roles_and_schemas` · `0002_identity_tenancy` · `0003_policy` · `0004_audit` · `0005_audit_rebuild_rls_fix` · `0006_objects` · `0007_bootstrap_rotation` · **`0008_invariant_remediation`** (signed-context ports, DOMAIN-aware FORCE-RLS matrix, privilege boundary, bounded append/seal ports, refresh rotation, identity integrity, temporal constraint).
Reproducible demo: `./scripts/demo.sh` (compose → build → migrate → bootstrap with a generated one-time secret via the 0600 `.eye-local/` handoff → API+shell → acceptance). Bootstrap exit codes are honest (2 = already bootstrapped, continue; other nonzero = abort). First sign-in forces password rotation.

**Port note (accepted deviation):** API default port is **3401**, configuration-driven via `EYE_RUNTIME_PORT` / `eye.runtime.port` (zod-validated; documented in PHASE0_REPORT §5).

## A.11 — Browser regression gate (instruction B)

`e2e/phase0.spec.ts` (Playwright, Chrome stable; API + web started by `playwright.config.ts` webServer with generated ephemeral secrets; wired into CI as a blocking job):
1 platform-admin login (UI) · 2 governed tenant+domain creation with review step (UI) · 3 ambiguous scope fails closed (EYE-TEN-001) · 4 cross-tenant denial without metadata leakage · 5 object v1→v2 correction in UI history · 6 known-at returns pre-correction state (UI) · 7 policy denial (UI alert) + obligation evidence on audit view · 8 audit viewer + chain-integrity status · 9 keyboard navigation + landmarks + focus ring · 10 light/dark + RTL smoke.
Result: **10/10 passed** (run log in evidence/test-runs.txt).

## H — Historical evidence (superseded; retained for traceability only)

The pre-remediation gate candidate was `ce1ee0d`. Numbers reported before this gate (e.g. "21/21 acceptance", "14/14 integration", the zero-component `evidence/sbom.cdx.json`, and the debian-image Trivy tables showing HIGH/CRITICAL) are **historical** and are **not** the binding evidence for this gate. They are superseded by §A.6–A.9 above. Milestone commit lineage (traceability only): `dbb2e31` (M1) → `c619776`/`bc70bd6` (M2–M4) → `78d696b` (M5) → `bf3a62f` (M6) → `8101479` (M7) → `37d0b49` (Phase 1 plan Rev 1) → `27efe3e` (gate closure) → `f589afd` (progress) → `ce1ee0d` (prior candidate) → `GATE_CANDIDATE_SHA` (invariant remediation).
