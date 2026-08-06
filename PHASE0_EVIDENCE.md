# THE EYE — Phase 0 Evidence Package (Gate-2 Closure)

> Assembled 2026-08-06 for the **Phase 0 Gate-2 closure**. This file references
> ONLY the binding evidence produced against the frozen source candidate.
> Superseded historical evidence is labeled as historical in §H.

## S — Declared SHAs (no self-reference)

Evidence can never be part of the artifact it describes, so the two are
separated explicitly:

| Name | Meaning |
|---|---|
| `SOURCE_CANDIDATE_SHA` | The frozen source commit under review. Contains **no** evidence generated from running it. |
| `EVIDENCE_ATTESTATION_SHA` | A separate, later commit containing ONLY the evidence produced by running the gate against `SOURCE_CANDIDATE_SHA`. It changes no tracked source. |

Both values are recorded in `evidence/git-metadata.txt` (and repeated in the
bundle root as `GATE2_SHAS.txt`). Every raw log line carries the source SHA it
was produced from.

Procedure actually followed:
1. Freeze `SOURCE_CANDIDATE_SHA` (source only; working tree clean).
2. Create a **fresh isolated checkout** of that exact SHA (`git worktree`, virgin
   Compose volumes, no reused `node_modules`, no pre-existing build artifacts).
3. Run the entire gate there **without modifying tracked source**.
4. Collect the evidence outside the source tree.
5. Record it in `EVIDENCE_ATTESTATION_SHA`, which touches `evidence/` only.

## A.1–A.5 — Controlled files

| # | File | Content |
|---|---|---|
| 1 | [PHASE0_REPORT.md](PHASE0_REPORT.md) | Deliverables, evidence map, deviations, carried risks |
| 2 | [PROGRESS.md](PROGRESS.md) | Phase + milestone log, Gate-2 closure entry, candidate SHAs |
| 3 | [DECISIONS.md](DECISIONS.md) | ADR-P0-01…17 |
| 4 | [EXCEPTIONS.md](EXCEPTIONS.md) | EXC-P0-001…005 (`open`) + SEC-P0-001 (`closed`) + EXC-P1-001/002 (`proposed`); pure resolvable ID arrays with separate `id_notes` |
| 5 | [PHASE0_INVARIANT_REMEDIATION_PLAN.md](PHASE0_INVARIANT_REMEDIATION_PLAN.md) | The first bounded remediation (R1–R10) |
| 6 | [PHASE0_GATE2_CLOSURE_PLAN.md](PHASE0_GATE2_CLOSURE_PLAN.md) | This gate's bounded closure (G1–G10), incl. the explicit migration approach |
| 7 | [PHASE1_PLAN.md](PHASE1_PLAN.md) | Revision 5 — cumulative; per-step fault injection F01–F36; P1 exceptions remain `proposed` |

## A.6 — Gate-2 adversarial matrix (the 17 mandated negative tests)

All exercise the real roles, policies, ports and services. None is satisfied by
source-string inspection or by reimplementing production logic, and no authority
was widened to make one pass.

| # | Requirement | Where |
|---|---|---|
| 1 | `eye_app` cannot retrieve credential hashes or invoke identity mutation | `int/adversarial.test.ts` §1 |
| 2 | cannot create a session for platform-admin nor establish another principal's context | §2 |
| 3 | context replay fails after revocation, binding removal, rotation, expiry | §3 |
| 4 | DOMAIN A cannot write tenant-null rows, DOMAIN B rows, tenant bindings | §4 |
| 5 | a DOMAIN principal cannot grant itself tenant administration | §5 |
| 6 | same-scope fabricated POL/AUD records are rejected | §6 |
| 7 | fabricated actors/actions and malformed scope combinations are rejected | §6–§7 |
| 8 | stored audit bytes equal the RFC 8785 JCS bytes used for hashing | §8 |
| 9 | audit heads, seals and incidents cannot leak across scopes | §9 |
| 10 | pre-handler validation failures produce durable evidence | `acceptance.test.ts` › R10 #6/#7 + `audit.verify` malformed path |
| 11 | audit-evidence failure ⇒ fail-closed + durable degraded state | `acceptance.test.ts` › R10 #8 (503 + `/readyz` degraded + incident count) |
| 12 | `audit.verify` success and failure are authorized and evidenced | `acceptance.test.ts` › AC-8/AC-9 (governed as `audit.verify`) |
| 13 | replay of refresh tokens n-2 and older revokes the active family | `int/adversarial.test.ts` §13 (n-2 and n-10) |
| 14 | direct canonical insertion with an invented digest is rejected | §14 |
| 15 | outbox payload rewriting and unauthorized publish ack are rejected | §15 |
| 16 | two concurrent bootstrap attempts ⇒ exactly one winner | §16 |
| 17 | clean-source typecheck passes without pre-existing build artifacts | `scripts/verify-clean-typecheck.sh` → `evidence/clean-typecheck.txt` |

Defects found **by** these tests and fixed before freezing: same-connection
context replay (context is now bound to the issuing transaction), a residual
canonical `INSERT` grant on the commit role (revoked — admission is the only
path), and bootstrap guard ordering (the claim is now the pure concurrency
guard).

## A.7 — Fresh command runs (isolated checkout of `SOURCE_CANDIDATE_SHA`)

Raw logs with command, tool version, timestamp, exact exit code and source SHA:
`evidence/test-runs.txt`.

| Command | Result |
|---|---|
| `scripts/verify-clean-typecheck.sh` (typecheck BEFORE build, no stale artifacts) | PASS |
| `pnpm boundaries` | ✔ no violations (86 modules, 222 dependencies) |
| `pnpm --filter @eye/contracts test` | **118/118** |
| `pnpm --filter @eye/tokens test` | **3/3** |
| `pnpm --filter @eye/api test` | **14/14** |
| `pnpm db:migrate` | migrations **0001–0010** applied on a virgin volume |
| `pnpm --filter @eye/api test:accept` | **34/34** |
| `pnpm --filter @eye/api test:int` | **70/70** |
| `pnpm exec playwright test` | **10/10** |
| `scripts/verify-demo.sh` (virgin demo + teardown) | PASS — usable governed login |
| `scripts/verify-images.sh` (exact pinned digests) | PASS |

Acceptance runs **before** integration by design: the acceptance suite relies on
the single-use bootstrap creating the reserved `platform-admin`, while the
integration suites deliberately create additional platform administrators. CI
encodes the same order.

## A.8 — Supply chain (all under `evidence/supply-chain/`)

- **SBOM**: CycloneDX 1.6 from the pinned, tracked generator → `sbom.cdx.json`
  (**non-empty**; generator fails on empty). Its metadata records the
  **`SOURCE_CANDIDATE_SHA`** — not any earlier commit — plus the lockfile SHA-256.
- **Identity-based reconciliation**: `reconciliation.txt` — every SBOM component
  matched to a lockfile identity, and SBOM = production inventory + development
  inventory.
- **Licence policy, both inventories**: `licenses-prod.json`, `licenses-dev.json`,
  allowlist-enforced by `scripts/license-inventory.mjs` (blocking, 0 violations).
- **Dependency audit**: `pnpm-audit-human.txt` / `pnpm-audit.json` / exit code.
- **Secret scan**: `gitleaks-report.json` / `gitleaks-stdout.txt`, run through the
  final source candidate.
- **Filesystem scan**: `trivy-fs.txt` (labeled a filesystem scan).
- **EXACT pinned-image scans**: `trivy-image-postgres18.txt`,
  `trivy-image-redis8.txt`, summary `verify-images.txt` — blocking at
  HIGH/CRITICAL, with dated CVE-level dispositions in `.trivyignore`.
- **CI statement**: `ci-statement.txt` — local-equivalent evidence for this
  local-only gate; hosted CI is **not** claimed.

## A.9 — Clean-checkout reproducibility (virgin volume, isolated worktree)

`evidence/clean-checkout-transcript.txt`: fresh `git worktree` at
`SOURCE_CANDIDATE_SHA` → virgin Compose volumes with digest-pinned images →
`pnpm install --frozen-lockfile` → clean-source typecheck → build →
`pnpm db:migrate` (0001–0010 on an empty database) → acceptance → integration ⇒
green with zero manual steps. Stack destroyed afterwards (`down -v`).

## A.10 — Migrations and the migration approach

Applied, digest-locked and immutable (modifying an applied file aborts the runner):
`0001_roles_and_schemas` · `0002_identity_tenancy` · `0003_policy` · `0004_audit` ·
`0005_audit_rebuild_rls_fix` · `0006_objects` · `0007_bootstrap_rotation` ·
`0008_invariant_remediation` · **`0009_privilege_separation_and_bound_context`** ·
**`0010_bound_evidence_and_admission_ports`**.

**Governed forward migration — no rebaseline.** `0009`/`0010` are additive.
`0001`–`0008` are byte-identical to the previously delivered candidate, so every
recorded digest stays valid. No destructive local-only rebaseline was chosen, so
no reset procedure is needed and no persistent or customer environment can depend
on changed digests (none exists — the profile is local-only under EXC-P0-004).

## A.11 — Bootstrap and secret handoff (actual procedure)

`./scripts/demo.sh` generates every secret into the **0600, gitignored**
`.eye-local/env` handoff (a caller-supplied environment value always wins), and
**repairs** the mode of a pre-existing handoff file/directory before reading it.
The one-time bootstrap secret has no default anywhere: it comes from
`EYE_BOOTSTRAP_PASSWORD` or the generated handoff value. Bootstrap is
database-enforced single-use (`identity.claim_bootstrap()`), structurally limited
to `local`/`test` by `config.runtime_profile` in the database rather than any
caller-supplied label, and returns honest exit codes (0 performed, 2 already
claimed, 1 real failure). First sign-in forces rotation; an unused credential
disables itself after 24 hours. `.env.example` contains blank placeholders only,
listing every currently required database, Redis, authority and test variable.

## A.12 — Browser regression gate

`e2e/phase0.spec.ts` (Playwright, Chrome stable; servers started by
`playwright.config.ts` with generated ephemeral secrets): 10 scenarios —
login · governed tenant+domain creation with review step · ambiguous scope fails
closed · cross-tenant denial without metadata leakage · v1→v2 correction history ·
known-at pre-correction state · policy denial + obligation evidence · audit viewer
with chain verification (now governed as `audit.verify`) · keyboard/a11y ·
light/dark + RTL. Result **10/10**.

## H — Historical evidence (superseded; traceability only)

Superseded candidates: `ce1ee0d` (pre-remediation) and
`562fffaf3d848dd730e7287771e3344b2e5b05b2` (the Gate-2 review target, archive
SHA-256 `505fed9ea836dfb1f63ddb6aa6b3c9e0840793b15e4d0cc0851271174039447a`).
Figures reported before this gate — 21/21 then 34/34 acceptance with 14/14 then
38/38 integration, the zero-component SBOM, the debian-image Trivy tables, and
any SBOM metadata naming `ce1ee0d` — are **historical** and are not the binding
evidence here. Milestone lineage: `dbb2e31` (M1) → `c619776`/`bc70bd6` (M2–M4) →
`78d696b` (M5) → `bf3a62f` (M6) → `8101479` (M7) → `37d0b49` → `27efe3e` →
`f589afd` → `ce1ee0d` → `75522e3` → `562fffa` → `SOURCE_CANDIDATE_SHA` →
`EVIDENCE_ATTESTATION_SHA`.
