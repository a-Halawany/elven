# THE EYE — Progress Log

| Phase | Layers | Status | Notes |
|---|---|---|---|
| Phase 0 — Foundation & Governance Spine | Cross-cutting | **COMPLETE + GATE-2.1 CLOSURE SUBMITTED 2026-08-07** | Report: [PHASE0_REPORT.md](PHASE0_REPORT.md). Plan: [PHASE0_PLAN.md](PHASE0_PLAN.md) (Rev 3). Remediation: [PHASE0_INVARIANT_REMEDIATION_PLAN.md](PHASE0_INVARIANT_REMEDIATION_PLAN.md) (R1–R10) then [PHASE0_GATE2_CLOSURE_PLAN.md](PHASE0_GATE2_CLOSURE_PLAN.md) (G1–G10), then [GATE2_1_PLAN.md](GATE2_1_PLAN.md) (C1–C11). Evidence: [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md). ADRs: [DECISIONS.md](DECISIONS.md). Exceptions: [EXCEPTIONS.md](EXCEPTIONS.md) (5 open P0 in-date; 2 P1 proposed). |

## Gate-2.2 — final consolidated Phase 0 closure (IN PROGRESS, started 2026-08-08)

Gate-2.1 (`1e6b29b` source / `2ee3a26` evidence) was **rejected**; Gate-2.2 is the
final consolidated correction pass (C1–C19). Controlled record:
[GATE2_2_FINAL_CLOSURE_PLAN.md](GATE2_2_FINAL_CLOSURE_PLAN.md). Governed forward
migrations from **0013**; 0001–0012 byte-identical (no rebaseline/rehash).

**Measured baseline of the rejected candidate** (rebuilt virgin before any change):
integration 147/147, unit+contracts+tokens 198/198, acceptance 41/42 (the one
failure was a *leftover degraded journal* from earlier stale-DB runs, not a code
regression — confirmed by a clean run at 42/42). So Gate-2.2 corrects architecture,
not a broken build.

**Status discipline:** C1–C7 are **CLOSED BY INTERNAL VERIFICATION** — that is
implementation progress, *not* independent approval. C9 is **IN PROGRESS**: its
execution-environment isolation is complete, but the substantive fail-closed and
governed-recovery requirements remain open. Migrations **0001–0019 are IMMUTABLE**
from this point; further database corrections use forward migrations **0020+**.

**Resumption ledger (safe to resume across sessions):**

| Area | Migration / files | State |
|---|---|---|
| C1 operation closure | `0013_operation_closure.sql`, `test/int/gate22-operation-closure.test.ts` | ✅ CLOSED (internal verification), committed `bf9f039` |
| C2 evidence de-authorization | `0014_evidence_deauthorization.sql`, `test/int/gate22-evidence-deauthorization.test.ts` | ✅ CLOSED (internal verification) (RLS visibility gated on read-capable mode; `issue_evidence` PLATFORM-elevation bug fixed with authority-parity binding check) |
| C3 single-use bootstrap | `0016_bootstrap_claim_binding.sql`, `test/int/gate22-bootstrap.test.ts` | ✅ CLOSED (internal verification) — claim bound to bootstrap capability + correlation nonce; only the winning capability completes it; consumed-claim reuse refused (9 tests + real AC-1 flow) |
| C4 identity mutators | `0017_identity_mutator_governance.sql`, `test/int/gate22-identity-mutators.test.ts` | ✅ CLOSED (internal verification) — subject/action-bound capability on external mutators; victim-takeover blocked (rotate cap for A cannot rotate B); 6 tests + real auth flow |
| C5 verifier/seal/availability | `0018_verifier_seal_governance.sql`, `test/int/gate22-verifier-seal.test.ts` | ✅ CLOSED (internal verification) — partition-bound verify/seal capabilities on all four seal/integrity ports (9 tests). `reconcile_availability_incident` governance folded into C9. |
| C6 capability binding | `0019_capability_binding_enforcement.sql`, `test/int/gate22-capability-binding.test.ts` | ✅ CLOSED (internal verification) — exact target binding at every business port, server-derived lifecycle actor (actor param removed), header↔operation correlation binding, causation bound + checked at closure (9 tests) |
| C7 outbox hardening | `0015_outbox_hardening.sql`, `test/int/gate22-outbox-hardening.test.ts` | ✅ CLOSED (internal verification) — lease TTL clamped [1,300]s, retry budget 10 → governed dead_letter, lease-bound terminal ack, `outbox_release` |
| C9 fail-closed + governed recovery | `0020_governed_degraded_recovery.sql`, `src/audit/reconcile-degraded.ts`, `src/audit/audit.service.ts`, `src/shared/degraded-store.ts`, `test/int/gate22-degraded-recovery.test.ts` | ✅ CLOSED (internal verification) — isolation: each isolated gate run gets its OWN controlled degraded-journal dir (`EYE_DEGRADED_DIR`, mkdtemp), initial state asserted empty, restart persistence still exercised explicitly (AC-11), recorded teardown that removes only this run's dir and never a real unreconciled journal. Acceptance now **44/44** with no manual cleanup. Substantive C9 now closed: PDP denial whose evidence cannot persist fails through the SAME governed path (503 + fsynced journal + availability incident, never raw 500) with zero business effect; the ungoverned `reconcile_availability_incident` port is **dropped**; reconciliation requires a recovery capability bound to the exact incident and writes inseparable integrity evidence in the same transaction; replay refused; `markRecovered` refuses without governed proof (empty proof or non-zero remaining); production caller `dist/audit/reconcile-degraded.js`. Full cycle proven in acceptance: degrade → restart → still degraded → governed reconciliation → healthy → restart → **still healthy**. |
| C8 action-specific capabilities | `shared/capabilities.ts` + all services/controllers | ✅ CLOSED (internal verification) — per-action capabilities; relation is not a parameter (compile-time restriction); outbox pipeline-private; no raw tx/SQL escape |
| Deterministic suite isolation | `test/acceptance/acceptance.test.ts` | ✅ CLOSED — acceptance owns a per-run database (`eye_accept_<pid>`, created fresh, dropped at teardown) + pristine-state precondition proof + per-run journal dir. **Proven order-independent both ways** (integration→acceptance and acceptance→integration, no reset) with no leftover databases. Removes the manually-consumed-bootstrap and stale-journal classes of failure. |
| C10 audit.verify completeness | `src/audit/audit.service.ts`, `src/pipeline/pipeline.service.ts`, `test/int/gate22-audit-verify.test.ts` | ✅ CLOSED (internal verification) — **byte-for-byte `event_jcs` vs canonical JCS** (the row hash was recomputed from the GENERATED `event` column, so a byte rewrite that preserved the parsed JSON passed verification); **orphan-row detection above the head** (rows > head were excluded from verification entirely); every result now RETAINS its exact authorizing policy decision (C10 supersedes the Gate-2.1 null-on-failure rule; outcome/decision-class agreement still enforced by `audit.commit_event`); the integrity mutation writes its OWN inseparable `integrity.incident_opened` evidence in the verifier transaction. 5 dedicated tests + acceptance. |
| C11 strict RFC 8785 / I-JSON | `packages/contracts/src/jcs.ts`, `packages/contracts/test/rfc8785-rejection.test.ts`, `apps/api/test/int/rfc8785-crosslang.test.ts` | ✅ CLOSED (internal verification) — three real defects fixed: **`undefined` array elements were coerced to `null`** (so `[undefined]` and `[null]` shared bytes), **sparse arrays emitted syntactically INVALID JSON** (`[1,,3]`) with no error, and **lone UTF-16 surrogates were accepted** in keys and values. Non-plain objects (Date/Map/Set/RegExp) also rejected — a `Date` previously enumerated to `{}`. 22 rejection cases + SQL parity: Postgres rejects the `\ud800` escape form at the jsonb boundary, and a raw lone surrogate cannot survive UTF-8 transmission (arrives as U+FFFD) — measured and recorded, which is exactly why the TS boundary must refuse it first. |
| C12 correlation traceability | `src/shared/correlation.ts`, auth/tenancy/objects/admin controllers, `principals.service.ts`, acceptance C12 block | ✅ CLOSED (internal verification) — swept every authenticated failure path. Removed the `?? 'unknown'` **placeholder** correlations (a placeholder satisfies the response shape and locates nothing); replaced with `requireCorrelation(req)`, which returns the request's own envelope correlation and raises a wiring defect rather than inventing one. No downstream service mints a replacement. Proven by 14 acceptance assertions over 7 failure paths (unknown user, wrong password, garbage refresh token, short-password rotation, workload-with-password principal validation, tenant-name validation, malformed verify): the returned `correlationId` **equals the envelope correlation**, is never a placeholder or fresh uuid, and **locates the durable POL/AUD evidence** (which always records a refusal, never a success). |
| C13 catalog authority gate | `apps/api/scripts/authority-inventory.mjs`, `0021_authority_surface_closure.sql` | ✅ CLOSED (internal verification) — inventory **generated from live pg catalogs, no handwritten port list**; fails on any unclassified/new/renamed port, any PUBLIC EXECUTE, unintended direct DML, RLS gap, or retired role that can log in. Current run: **89 functions, 81 SECURITY DEFINER, 63 runtime-granted ports all classified, 0 PUBLIC EXECUTE, 0 RLS gaps (28 relations), direct DML allocator-only** → exit 0. **The gate found real surface a handwritten list had kept passing:** `identity.auth_principal` / `auth_bindings` / `session_get_active` still existed and were still granted to `eye_identity` (unbounded lookup by arbitrary UUID) → **dropped** in 0021; retired `eye_system` could still log in and `eye_audit_allocator` had a live login it never needs → both **NOLOGIN**. |
| C14 full state-integrity inertness | `test/int/gate22-inertness-integrity.test.ts` | ✅ CLOSED — row-count-only inertness **replaced** by a deterministic state digest over every dynamically-discovered governed relation: column identity, ordered PK, **logical** row-value digest, **physical (xmin)** digest so a delete+reinsert of identical values is still caught, row counts reported separately, plus all sequence last_values, the migration registry and a catalog digest (function bodies+ACLs, policies, RLS flags, role attributes). **4 negative controls prove non-vacuity** — in-place UPDATE (count blind, physical detects), delete+reinsert with identical values (logical AND count blind, only physical detects), sequence advance, and a write to an unexpected new relation (detected as `relation APPEARED` + catalog change) — **each isolated in a transaction and rolled back**, with a follow-up test proving the database is left exactly as found. The 8 statically-uncertain guards are then proven inert against this full digest. 9 tests. |
| C14 closure audit (reconciled) | `apps/api/scripts/gate/authority-matrix-report.mjs`, `evidence/authority-matrix.json` | ✅ CLOSED — **exact reconciled arithmetic**: 63 discovered runtime-granted ports = **43 mutators + 20 non-mutators**; mutators = **7 minters + 1 break-glass + 2 guarded no-ops + 33 capability-required**; both reconcile `true`. **7-vs-10 RESOLVED**: 10 classified no-capability entrypoints = 7 expected-success + **3 null-arg refusers** (`issue_commit` needs a ≥20-char context key, `issue_evidence` needs action+correlation, `issue_verify` needs a partition) — no port changed behaviour, the earlier report just didn't publish the split. Classification strengthened beyond keywords: write DML (**fixed a real regex bug — `update\s+\w\b` can never match `UPDATE identity`, which had hidden `bump_epoch`/`sessions_revoke_all_v2`/`outbox_ack_leased` as non-mutators**), TRUNCATE, DDL, dynamic EXECUTE, writable CTE, `set_config`, row locks, plus **transitive mutation to a fixpoint (2 rounds)**; overloads no longer collapsed (keyed by full signature). **8 statically-uncertain guards now carry an EXECUTABLE inertness proof** (zero row-count delta across all 28 governed tables); `uncertain_classification: 0`, fail-closed otherwise. |
| C14 catalog-driven adversarial matrix | `test/int/gate22-authority-matrix.test.ts` | ✅ CLOSED (internal verification) — **discovers the surface from the catalogs, no handwritten list as source of truth**. Every discovered runtime-granted port is either machine-classified a NON-MUTATOR (body inspected via `prosrc` for write statements — not a trusted label) or a MUTATOR with (a) a generic executable probe proving it refuses with NO capability on each granted role, (b) a generic cross-role probe proving non-grantees cannot reach it, and (c) a named scenario file (existence-checked; **stale entries fail**). The 10 legitimate no-capability entrypoints (7 minters, break-glass rebuild, 2 guarded no-ops) are classified with reasons and **proven INERT executably** (open_operation returns NULL and records nothing; mark_obligations changes nothing; a minted publish capability still cannot enqueue; break-glass unreachable by every app role). Allocator confirmed **NOLOGIN, DML confined to the audit ledger, zero business/identity/policy/objects EXECUTE**; retired `eye_system` NOLOGIN with zero governed EXECUTE. **Negative control run: deleting one coverage entry fails the gate** with the port name and its write evidence. 15 tests. |
| **C15 supply-chain runner** | `scripts/gate/supply-chain.mjs`, `.gitleaks.toml`, `pnpm-workspace.yaml` | ✅ CLOSED (internal verification) — pinned runner (pnpm 11.9.0, node v24.11.1, gitleaks 8.30.1, trivy 0.73.0) that **verifies every pin BEFORE scanning and fails closed on mismatch**. 8 steps, 6 blocking: pnpm audit (human+JSON), gitleaks **worktree AND full history** (`--all --full-history`), trivy fs (vuln+secret+misconfig) table+JSON, and trivy against **both digest-pinned images read from docker-compose.yml**. Every step records argv, tool+version, source SHA, start/finish, exit code, and the **SHA-256 of raw stdout/stderr** written to disk. **REAL FINDINGS FIXED: `nanoid <3.3.17` (CVE-2026-67213, HIGH) flagged independently by BOTH pnpm audit and trivy → overridden to `>=3.3.17` (resolved 3.3.16 → 6.0.1)** in `pnpm-workspace.yaml` (pnpm 11 no longer reads `package.json` overrides). Governed exclusions only: `.eye-local/` and `apps/web/.next/` (each **proven untracked AND ignored by the gate every run**), plus one narrow `condition=AND` match-exclusion for `context_key_hash` — a **SQL column name** in migration SELECT lists, not a credential. **Non-vacuity proven twice**: a planted RSA private key fails the gate, and a mis-pinned scanner fails it before any scan runs. |
| C16–C17 SBOM / CycloneDX | existing: `scripts/generate-sbom.mjs`, `scripts/license-inventory.mjs`, `scripts/verify-images.sh` | ⏳ **NEXT.** Toolchain verified present on this host (no install blocker): **gitleaks 8.30.1, trivy 0.73.0, pnpm 11.9.0, docker 28.5.1**. `syft`/`grype`/`cyclonedx` CLIs are NOT installed — plan: use `pnpm audit --json`, `gitleaks detect` (working tree) + `gitleaks detect --log-opts=--all` (full history), `trivy fs` + `trivy image` against the digest-pinned images in `docker-compose.yml`, `pnpm deploy --filter`/`--prod` resolution for the linux-x64 production closure vs a dev closure, bidirectional lockfile↔SBOM reconciliation with governed exclusions (stale exclusion ⇒ fail), and CycloneDX **1.6 official schema pinned as a vendored JSON** validated with `ajv` (already a transitive dependency) rather than an uninstalled CLI. Every run must capture command + tool version + timestamp + source SHA + exit code + raw stdout/stderr. |
| C18 forward/virgin proof | — | ⏳ |
| C19 docs + NOLOGIN roles | — | ⏳ (`eye_system` + legacy roles still LOGIN) |
| **Evidence sequencing (applied)** | `.gitignore` | ✅ `evidence/authority-matrix.json` and the `evidence/supply-chain/`, `evidence/db-paths/` output dirs are **untracked**: generated gate OUTPUTS are regenerated from the FROZEN source during the isolated run and committed only in the evidence-only attestation child commit. The GENERATORS (`scripts/authority-inventory.mjs`, `scripts/gate/authority-matrix-report.mjs`) remain in source. The matrix generated at `caac521` was **preliminary** and is not final evidence. |
| Freeze + external-review handoff + ZIP | — | ⏳ |

**Environment notes for resumption:** virgin rebuild via
`scratchpad/virgin.sh` (force-removes `eye-redis`/`eye-postgres`, `down -v`, `up`,
`pnpm db:migrate`). Integration suite: `cd apps/api && node_modules/.bin/vitest run
--config vitest.int.config.ts`. Full integration currently **297/297**, acceptance **58/58** (per-run journal isolation closed; no manual cleanup). Migrations now **0001–0021** (0001–0020 immutable; 0021 = C13 surface closure). **Both DB paths proven at 0019**: forward upgrade from a real 0001–0012 database seeded through the historical bootstrap port (19 migrations, zero data loss, pre-existing rows/hashes/chain/digests byte-identical, chain verifies with no rehash, full suite 251/251 on the upgraded DB) and virgin install 0001–0019 (251/251 + acceptance 44/44). **External independent
review is pending against the final frozen source and evidence package** — Claude's
own in-place testing is verification, not independent review, and Phase 0 remains
unapproved until that external final review. The 52 MB `evidence/the-eye-source.bundle`
is now **untracked** (kept on disk) and `evidence/*.bundle` + `*.zip` are gitignored
per the approved packaging decision.

## Gate-2.1 closure — final authority-boundary closure (2026-08-07)

Source candidate reviewed: `2deded44904e5a4ec264938085c2aaa93d9636b6` (evidence attestation
`09ab1144d04ada7dcd3a159c3ba03a7f94751c18`, archive SHA-256 `b45025ad…1e81d`). An independent review
identified ten executable attack paths that the green 70-test suite did not exercise. The bounded
correction C1–C11 was authorized and executed as **governed forward migrations 0011 + 0012**
(0001–0010 untouched, every previously applied digest still valid — **no rebaseline**). Migration
range is now **0001–0012**.

Delivered:

* **No direct authoritative privilege anywhere.** Direct INSERT/UPDATE/DELETE on every governed
  table is revoked from every runtime role; the chain-head allocator pair is callable by no request
  authority; PUBLIC holds EXECUTE on nothing in the governed schemas. RLS is `ENABLE`d **and**
  `FORCE`d on every table in those schemas (`FORCE` alone was inert where RLS had never been enabled),
  with policies that state the boundary explicitly for allocator-owned and reference tables.
* **The universal system context is gone.** `ctx.issue_system(reason)` — unrestricted PLATFORM
  authority on the strength of free text — is dropped, replaced by six **operation-specific
  capability minters** (`issue_commit`, `issue_evidence`, `issue_publish`, `issue_verify`,
  `issue_identity_op`, `issue_bootstrap`). A capability binds action, target, correlation id,
  policy-decision id, bundle version, operation class, session, principal, scope, purpose and
  consequence class, and the **mintable action set is bound to the minting role** (identity.* to the
  identity authority, everything else to the commit authority).
* **Business handlers never receive a transaction.** They receive a `BoundedCapability` whose surface
  is the ports their route declared; the Kysely transaction is a private field that is never exposed.
* **Evidence mode cannot fabricate an allow or a success.** A decision records how it was written
  (`evidence_only`), and a success may never reference such a decision — in that transaction or any
  later one. Every request AUD is linked to its POL on principal, action, scope, tenant, domain,
  correlation and bundle, and outcome class must agree with decision class.
* **Expiry and revocation are wall-clock and re-checked at every port.** `clock_timestamp()` replaces
  `now()`, so a capability lapses inside a long transaction; session, expiry, principal, epoch,
  binding and rotation are revalidated at each authoritative boundary — a capability minted in one
  transaction stops working the moment another revokes the authority behind it.
* **Identity and metadata leakage closed.** `auth_principal`/`auth_bindings`/`session_get_active` are
  withdrawn from the application role and replaced by caller-bound lookups requiring proof of
  possession of that session; `audit.my_partition_status` (tenant-global head state for DOMAIN
  callers) is dropped in favour of a domain-scoped projection; a PDP-denied identity operation now
  returns the governed 403 with matching durable POL/AUD instead of failing 503.
* **Outbox transitions are lease-tied compare-and-set only.** `outbox_ack`/`outbox_claim` are gone;
  publication requires a live lease, the permitted transition and the expected current state.
* **Complete request audit coverage.** Every authenticated controller edge routes through the
  centralized durable rejection path; `audit.verify` records requested partition, verified head,
  expected vs calculated head, ok/headMatches, broken sequence and incident — an unknown or damaged
  partition is evidenced as a failure, never as a generic success; the degraded journal is reloaded on
  startup and `/readyz` stays degraded across a restart until governed reconciliation records recovery.
* **Real RFC 8785.** The in-database canonicalizer now implements ECMAScript `Number::toString`
  (fractions, exponent forms, negative zero), UTF-16 code-unit key ordering, Unicode keys,
  multilingual values, control-character escaping and IEEE-754/I-JSON validity. One conformance
  corpus runs against both TypeScript and the database. Canonical admission enforces full header
  **semantics** — enums, temporal constraints, structured confidence/quality, schema-reference shape
  and authoritative `recorded_at` — not merely key presence and digest.
* **Gate controls corrected.** No executable credential default in the migration runner; the licence
  allowlist covers production **and** development closures; CycloneDX 1.6 schema validation;
  bidirectional SBOM↔closure reconciliation with governed exclusions; the browser gate loads every
  runtime authority through the canonical loader with permission repair.

Suites at the Gate-2.1 candidate: contracts **181**, tokens **3**, api unit **14**, api gate
**43** (supply-chain negative fixtures, shipped-artifact gates, loader/handoff invariants), integration **199** (Gate-2.1 adversarial
matrix 52 + RFC 8785 cross-language 74 + domain isolation 16 + audit chain 8 + Gate-2 adversarial 49),
acceptance **42** (15 criteria + §7.2 + R4/R10 + Gate-2.1 tests 14–17), Playwright **10** — **492
tests**. All 22 mandated Gate-2.1 adversarial tests are present and green. Both database paths are
proven: forward upgrade of an existing 0001–0010 database carrying real pre-upgrade data through
0011/0012 with byte-identical audit hashes and no rebaseline, and a virgin install of 0001–0012 — the
complete suites pass on **both**. Supply chain: CycloneDX 1.6 SBOM (280 components, schema-valid),
bidirectional reconciliation with 0 unmatched identities, licence gate green over both scopes.

Five real defects were found *by* this work and fixed: an RLS sweep that deny-alled the allocator's
own tables and the schema-registry reference data; a live-authority check that demanded a session from
the deliberately session-less identity capability (which silently disabled all intake evidence); an
authority refusal misreported as a 503 availability incident instead of a 403 denial; an evidence-mode
rule that erased the true decision of an allowed-then-failed request; and a role-binding check written
against `current_user`, which is the owner inside a `SECURITY DEFINER` function and therefore vacuous.

## Gate-2 closure (2026-08-06)

Source candidate reviewed: `562fffaf3d848dd730e7287771e3344b2e5b05b2` (archive SHA-256 `505fed9e…9447a`). Source inspection found remaining constitutional gaps; the bounded closure G1–G10 was authorized and executed as **governed forward migrations 0009 + 0010** (0001–0008 untouched, all previously applied digests still valid — no rebaseline). Migration range is now **0001–0010**.

Delivered: six least-privilege runtime roles (app / commit / identity / publisher / verifier / recovery, the last never loaded by any application pool); a bound, single-use, transaction-and-connection-bound context requiring proof of possession of the session context key, invalidated by revocation, binding removal, credential rotation, expiry and replay; exact-match DOMAIN isolation with no tenant-wide fallback plus an authorized tenant read model and a binding-authority trigger; unforgeable POL/AUD built inside the trusted boundary with an **in-database RFC 8785 implementation** (stored `event_jcs` is exactly the hashed bytes — verified byte-for-byte against the TypeScript reference); canonical admission as the only object write path with server-side digest recomputation; immutable outbox events with a compare-and-set publish acknowledgement; complete audited request coverage with fail-closed 503 + an independent fsynced degraded journal + degraded `/readyz`; restart-durable suppression accounting; `audit.verify` as its own governed action; an append-only refresh-token family ledger detecting replay of any older generation; database-enforced single-use bootstrap with structural local/test eligibility; and a clean-source typecheck gate wired into CI.

Suites at the closure candidate: contracts **118**, tokens **3**, api unit **14**, acceptance **34**, integration **70** (adversarial matrix + domain isolation + audit chain), Playwright **10**. Boundaries clean (86 modules, 222 dependencies). Three real defects were found *by* the new adversarial tests and fixed: same-connection context replay, a residual canonical INSERT grant, and bootstrap guard ordering.

## Invariant-remediation gate (2026-08-05)

Candidate reviewed: `ce1ee0d`. Source inspection found invariant violations the green suite did not detect; the bounded remediation R1–R10 was authorized and executed. Final candidate: **`75522e3`** (`75522e3` — the R1–R10 remediation commit; submitted for review as `562fffaf3d848dd730e7287771e3344b2e5b05b2` after the bundle-only metadata correction). See `evidence/git-metadata.txt` in that gate's package. Migration range extended to **0001–0008** (0008 = signed request context + DOMAIN-aware FORCE-RLS matrix, PUBLIC-EXECUTE revocation + bounded append/seal/recovery ports, refresh-token rotation with reuse detection, identity integrity, temporal constraint). Suites at the final SHA: contracts **118**, tokens **3**, api unit **14**, integration **38** (domain-isolation, privileges, audit-chain incl. concurrent append-vs-verify/seal, refresh), acceptance **34** (15 criteria + §7.2 + R4/R10 #6/#7/#8), Playwright **10**. Supply chain: non-empty CycloneDX SBOM (280 components) + prod/dev license reconciliation; `pnpm audit` **0**; exact-image Trivy scans of the pinned postgres:18-alpine / redis:8-alpine digests **clean at HIGH/CRITICAL** under dated `.trivyignore` dispositions. No Phase 1/L1 application code written.

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
| Phase 1 — World Observation Layer | L1 | **PLAN Rev 5 (cumulative) — awaiting final approval; no P1 application code written** | Plan: [PHASE1_PLAN.md](PHASE1_PLAN.md) (Rev 5). Evidence: [PHASE0_EVIDENCE.md](PHASE0_EVIDENCE.md). Coverage: [L1_CONNECTOR_COVERAGE.md](L1_CONNECTOR_COVERAGE.md). P1 exceptions EXC-P1-001/002 remain `proposed` (not opened). |
| Phase 2 — Intelligence Layer | L2 | Not started | Model Gateway live; Cleaning/Classification/NER/Relationship agents |
| Phase 3 — Enterprise Memory & Knowledge Graph | L3–L4 | Not started | Graph/Memory/Reasoning agents; stewardship workflows |
| Phase 4 — Digital Twins & Prediction Engine | L5–L6 | Not started | Twin Reconciliation/Prediction agents |
| Phase 5 — Scenario Intelligence & Simulation Engine | L7–L8 | Not started | Scenario/Simulation agents |
| Phase 6 — Decision Intelligence & Executive OS | L9–L10 | Not started | Decision/Briefing/Reporting agents; Planner/Supervisor/Workflow completed |
| Phase 7 — System-wide agent governance, continuous learning, marketplaces, production hardening | Cross-cutting | Not started | Deepens existing controls; does not introduce them (C-006, C-035) |

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
