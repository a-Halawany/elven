# THE EYE — Phase 0 Evidence Package (Gate-2.1 Closure)

> Assembled 2026-08-07 for the **Phase 0 Gate-2.1 closure — final
> authority-boundary closure**. This file references ONLY the binding evidence
> produced against the frozen Gate-2.1 source candidate. Superseded historical
> evidence, including the whole Gate-2 package, is labeled as historical in §H.

## S — Declared SHAs (no self-reference)

Evidence can never be part of the artifact it describes, so the two are
separated explicitly:

| Name | Meaning |
|---|---|
| `SOURCE_CANDIDATE_SHA` | The frozen source commit under review. Contains **no** evidence generated from running it. |
| `EVIDENCE_ATTESTATION_SHA` | A separate, later commit containing ONLY the evidence produced by running the gate against `SOURCE_CANDIDATE_SHA`. It changes no tracked source. |

Both values are recorded in `evidence/git-metadata.txt` (and repeated in the
bundle root as `GATE2_1_SHAS.txt`). Every raw log line carries the source SHA it
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
| 6 | [PHASE0_GATE2_CLOSURE_PLAN.md](PHASE0_GATE2_CLOSURE_PLAN.md) | The previous gate's bounded closure (G1–G10), incl. its migration approach |
| 7 | [GATE2_1_PLAN.md](GATE2_1_PLAN.md) | **This gate's** bounded closure (C1–C11), incl. the explicit migration decision for 0011/0012 |
| 8 | [PHASE1_PLAN.md](PHASE1_PLAN.md) | Revision 5 — cumulative; per-step **and per durable-write** fault injection F01–F46 through step 12; P1 exceptions remain `proposed` |

## A.6 — Gate-2.1 adversarial matrix (the 22 mandated regression tests)

All exercise the real roles, capability minters, definer ports and services. None
is satisfied by source-string inspection or by reimplementing production logic,
and no grant was widened, no scope check weakened and no invariant failure turned
into an exception to make one pass.

| # | Mandated test | Where it executes |
|---|---|---|
| 1 | every runtime role is denied every other role's operation | `gate21-adversarial.test.ts` › G21-1 (grant matrix derived from the live catalog + 21 cross-role call attempts) |
| 2 | commit/identity cannot insert AUD/POL directly nor manipulate chain heads | `gate21-adversarial.test.ts` › G21-2 |
| 3 | the verifier cannot append audit events | `gate21-adversarial.test.ts` › G21-3 |
| 4 | the publisher cannot directly update outbox status | `gate21-adversarial.test.ts` › G21-4 |
| 5 | commit cannot create a pre-published outbox row | `gate21-adversarial.test.ts` › G21-5 |
| 6 | evidence mode cannot create tenants, domains, principals or objects | `gate21-adversarial.test.ts` › G21-6 |
| 7 | evidence mode cannot record a fabricated allow or success | `gate21-adversarial.test.ts` › G21-7 (incl. the `evidence_only` linkage rule) |
| 8 | a capability for action A cannot perform action B | `gate21-adversarial.test.ts` › G21-8 (incl. role↔action minting bounds) |
| 9 | a one-second capability expires after real elapsed time in one transaction | `gate21-adversarial.test.ts` › G21-9 (proves the transaction clock did not move) |
| 10 | mint in A, revoke the session in B ⇒ A's write fails | `gate21-adversarial.test.ts` › G21-10 (two real concurrent connections) |
| 11 | the same for binding revocation and credential rotation | `gate21-adversarial.test.ts` › G21-11a/b/c (+ principal deactivation) |
| 12 | DOMAIN cannot read tenant-global partition state | `gate21-adversarial.test.ts` › G21-12 |
| 13 | application lookups cannot reach another tenant's identity metadata | `gate21-adversarial.test.ts` › G21-13 |
| 14 | a PDP-denied identity operation returns 403 with matching durable POL/AUD | `acceptance.test.ts` › G21-14 (end-to-end; asserts it is not a 503) |
| 15 | every malformed controller payload creates sanitized durable evidence | `acceptance.test.ts` › G21-15 (six controller edges + rotation, no payload echo) |
| 16 | degraded readiness survives a process restart | `acceptance.test.ts` › G21-16 (real restart; recovery only via governed reconciliation) |
| 17 | `audit.verify` success, denial, unknown-partition and tamper outcomes are evidenced accurately | `acceptance.test.ts` › G21-17 |
| 18 | full RFC 8785 cross-language conformance corpus passes | `rfc8785-crosslang.test.ts` (74 assertions) + `rfc8785-conformance.test.ts` (63) |
| 19 | correctly digested but semantically invalid canonical headers are rejected | `gate21-adversarial.test.ts` › G21-19 (16 semantic mutations, each correctly digested) |
| 20 | migration without `EYE_DB_MIGRATE_PASSWORD` fails before connection | `gate21-adversarial.test.ts` › G21-20 + `gate/supply-chain.test.ts` › G21-20 (unroutable host proves no connection) |
| 21 | production and development licence violations both block CI | `gate/supply-chain.test.ts` › G21-21 (drives the real `checkLicenses` gate) |
| 22 | SBOM schema and bidirectional reconciliation gates fail on controlled negative fixtures | `gate/supply-chain.test.ts` › G21-22a (14 schema mutations) / G21-22b (both directions + governed/stale exclusions) |

The Gate-2 matrix (17 tests) is retained and still green in `adversarial.test.ts`;
it is not re-tabulated here.

## A.6b — Authority-boundary catalog (live, re-runnable)

`evidence/authority-boundary.txt`, produced by `scripts/verify-authority-boundary.sh`,
queries the LIVE database catalog rather than describing source:

* direct INSERT/UPDATE/DELETE/TRUNCATE on any governed table by any runtime role: **NONE**
* PUBLIC EXECUTE anywhere in the governed schemas: **NONE**
* EXECUTE on every authoritative port, per role (one owner per port, listed in full)
* RLS `enabled` **and** `forced` on **every** table in the governed schemas, with policy counts
* legacy mechanisms (`ctx.issue_system`, `ctx.issue`, `eye_ctx_field`, `eye_set_context`,
  `eye_set_system_context`, `objects.outbox_ack`, `objects.outbox_claim`,
  `audit.my_partition_status`): **0 definitions**
* every one of the 13 authoritative ports shown to call a live-authority/capability
  assertion (`assert_business_authority`, `assert_capability`, `assert_live_authority`)
* `ctx.context_secret` and `ctx.issued` reachable by no role but the migrate superuser: **NONE**

## A.7 — Fresh command runs (isolated checkout of `SOURCE_CANDIDATE_SHA`)

Raw logs with command, tool version, timestamp, exact exit code and source SHA:
`evidence/test-runs.txt`.

| Command | Result |
|---|---|
| `scripts/verify-clean-typecheck.sh` (typecheck BEFORE build, no stale artifacts) | PASS |
| `pnpm boundaries` | ✔ no violations |
| `pnpm --filter @eye/contracts test` | **181/181** |
| `pnpm --filter @eye/tokens test` | **3/3** |
| `pnpm --filter @eye/api test` (unit + gate) | **57/57** (14 unit + 43 gate) |
| `pnpm db:migrate` | migrations **0001–0012** applied on a virgin volume |
| `pnpm --filter @eye/api test:accept` | **42/42** |
| `pnpm --filter @eye/api test:int` | **199/199** |
| `pnpm exec playwright test` | **10/10** |
| `scripts/verify-db-paths.sh` (forward upgrade **and** virgin install, each with the full suites) | PASS |
| `scripts/verify-authority-boundary.sh` (live grant/RLS/capability catalog) | PASS |
| `scripts/generate-sbom.mjs` (bidirectional reconciliation + CycloneDX 1.6 schema) | PASS |
| `scripts/license-inventory.mjs` (production **and** development closures) | PASS |
| `scripts/verify-demo.sh` (virgin demo + teardown) | PASS — usable governed login |
| `scripts/verify-images.sh` (exact pinned digests) | PASS |

**Total: 492 tests.** Every mandatory suite is green at the frozen candidate.

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
`pnpm db:migrate` (0001–0012 on an empty database) → acceptance → integration ⇒
green with zero manual steps. Stack destroyed afterwards (`down -v`). The file is
produced by the gate run itself; if it is absent, the gate did not complete.

## A.9b — Both database paths (Gate-2.1 delivery requirement)

`evidence/db-paths.txt`, produced by `scripts/verify-db-paths.sh`:

* **Path A — forward upgrade.** A database with 0001–0010 applied, carrying real
  data written through the **pre-upgrade** ports (tenant, domain, principal,
  binding, session and an audit event committed via the 0010-era `ctx.issue` +
  `audit.commit_event`), is upgraded through 0011/0012. Row counts are unchanged,
  the pre-upgrade audit `row_hash` is **byte-identical**, the pre-upgrade event
  still verifies under the NEW canonicalizer (`event_jcs == canon.jcs(event)`),
  0001–0010 digests and applied timestamps are untouched, and **0** legacy
  mechanism definitions remain. The full acceptance (42) and integration (199)
  suites then pass **on that upgraded database**.
* **Path B — virgin install.** 0001–0012 apply to an empty database; 12 migrations
  recorded; the same suites pass there too.

No rebaseline is performed on either path, so no reset procedure exists or is
required.

## A.10 — Migrations and the migration approach

Applied, digest-locked and immutable (modifying an applied file aborts the runner):
`0001_roles_and_schemas` · `0002_identity_tenancy` · `0003_policy` · `0004_audit` ·
`0005_audit_rebuild_rls_fix` · `0006_objects` · `0007_bootstrap_rotation` ·
`0008_invariant_remediation` · `0009_privilege_separation_and_bound_context` ·
`0010_bound_evidence_and_admission_ports` ·
**`0011_authority_boundary_closure`** · **`0012_evidence_capability_and_port_binding`**.

**Governed forward migration — no rebaseline.** `0011`/`0012` are additive.
`0001`–`0010` are byte-identical to the previously delivered candidate, so every
recorded digest stays valid — proven on a real upgraded database in §A.9b, where
the 0001–0010 rows keep their original digests and applied timestamps while 0011
and 0012 are appended. No destructive rebaseline was chosen, so no reset procedure
is needed and no persistent or customer environment can depend on changed digests
(none exists — the profile is local-only under EXC-P0-004).

What each new migration closes:

| Migration | Closes |
|---|---|
| `0011_authority_boundary_closure` | All direct authoritative DML revoked from every runtime role; the chain-head allocator pair unreachable from any request authority; catalog-driven PUBLIC sweep; RLS `ENABLE`+`FORCE` on every governed table with explicit policies where the boundary is role-plus-port; `ctx.issue_system`/`ctx.issue`/`eye_ctx_field` **dropped**; the v3 22-field bound-capability payload with `clock_timestamp()` expiry, backend-pid and transaction-id binding; six operation-specific minters with the action set bound to the minting role; `ctx.assert_live_authority` / `ctx.assert_capability`; outbox lease + lease-tied CAS replacing `outbox_ack`/`outbox_claim` |
| `0012_evidence_capability_and_port_binding` | `eye_row_writable` requires authority mode; `assert_business_authority` (mode + bound action + issuance-nonce liveness); every business port bound to its action; `policy.commit_decision` marks evidence-written decisions `evidence_only`; `audit.commit_event` enforces the AUD↔POL linkage and refuses a success referencing an `evidence_only` decision; the 12-argument `ctx.issue_evidence` validating requested scope against route and subject; typed denial ports with an allowlisted event type; caller-bound `identity.session_subject`/`session_bindings` (and withdrawal of the unbounded lookups); `audit.my_partition_status` dropped for domain-scoped projections; degraded-state reconciliation ports; full canonical header **semantics**; and the conformant RFC 8785 canonicalizer (`canon.number_es`, `canon.utf16_sortkey`, `canon.jcs`) |

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

Superseded candidates: `ce1ee0d` (pre-remediation),
`562fffaf3d848dd730e7287771e3344b2e5b05b2` (the Gate-2 review target, archive
SHA-256 `505fed9ea836dfb1f63ddb6aa6b3c9e0840793b15e4d0cc0851271174039447a`), and
`2deded44904e5a4ec264938085c2aaa93d9636b6` with evidence attestation
`09ab1144d04ada7dcd3a159c3ba03a7f94751c18` (the **Gate-2.1 review target**, archive
SHA-256 `b45025adedb1f8e97f34855ddfea4914537f3b3d1c25a444bd5ca90ce051e81d`).

Figures reported before this gate — 21/21 then 34/34 acceptance with 14/14 then
38/38 then 70/70 integration, contracts 118, the zero-component SBOM, the
debian-image Trivy tables, any SBOM metadata naming `ce1ee0d`, and every statement
describing `ctx.issue_system`, the ungated `objects.outbox_ack`,
`audit.my_partition_status`, the unbounded `identity.auth_principal`/
`auth_bindings`/`session_get_active` lookups, migration range 0001–0010 or
production-only licence checking — are **historical** and are not the binding
evidence here. The binding figures are in §A.7 and the binding mechanisms in §A.10.

Milestone lineage: `dbb2e31` (M1) → `c619776`/`bc70bd6` (M2–M4) → `78d696b` (M5) →
`bf3a62f` (M6) → `8101479` (M7) → `37d0b49` → `27efe3e` → `f589afd` → `ce1ee0d` →
`75522e3` → `562fffa` → `2deded4` → `09ab114` → `SOURCE_CANDIDATE_SHA` →
`EVIDENCE_ATTESTATION_SHA`.
