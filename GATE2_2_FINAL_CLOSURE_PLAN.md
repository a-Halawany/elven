# GATE-2.2 — Final Consolidated Phase 0 Closure Plan (controlled execution record)

**Status:** IN EXECUTION. C1–C7 are CLOSED BY INTERNAL VERIFICATION (implementation
progress, not independent approval); C9 is IN PROGRESS (isolation done, substantive
fail-closed/recovery open). Migrations 0001–0019 are IMMUTABLE; corrections from 0020+. This is the live controlled record; the status ledger
at the end is updated as each area is implemented and verified.

**Review baseline (rejected):**
- `SOURCE_CANDIDATE_SHA   = 1e6b29b2f7ddbdc16520d0968d159fe0bab86f33`
- `EVIDENCE_ATTESTATION_SHA = 2ee3a2610e6044b097dd8d7647403d01a997b36b`

**Scope discipline:** Phase 0 only. No Phase 1 / L1 application code. `EXC-P1-001`
and `EXC-P1-002` remain *proposed* and are NOT activated.

---

## 0. Verified baseline of the rejected candidate (measured, not assumed)

Before planning corrections, the frozen candidate was rebuilt on a virgin
database and measured, so this plan corrects a *known* state:

| Suite | Result on virgin DB | Note |
|---|---|---|
| Integration (`vitest.int.config.ts`) | 147 / 147 | 4 files |
| Unit + contracts + tokens (`pnpm -r test`) | 198 / 198 | |
| Acceptance (`test:accept`) | 41 / 42 | the 1 failure is a **leftover degraded journal** from earlier stale-DB runs — an environment artifact that a truly-clean checkout does not carry; C9 rebuilds the reconciliation path regardless |
| `pnpm build`, clean-source typecheck | pass | |

So the candidate is functionally coherent; Gate-2.2 corrects **architecture**
(enforcement that is currently convention, authority that is currently broad,
evidence that is currently self-referential), not a broken build.

## 1. Migration & history rules (binding)

1. Governed forward migrations begin at **0013**.
2. `0001`–`0012` remain **byte-identical** (digest-immutability is enforced by
   `apps/api/scripts/migrate.mjs`).
3. No reset, rebaseline, destructive rewrite, or audit rehash.
4. Prove **both** paths every gate run: forward upgrade from a real `0001`–`0012`
   database, and virgin install through the final migration.
5. Preserve the existing source/evidence SHA separation.

---

## 2. Findings → confirmation sites → correction (all confirmed against real source)

### C1 — Database-enforced POL/AUD/effect atomicity  *(keystone)*
**Confirmed:** `apps/api/src/pipeline/pipeline.service.ts` commits effect + POL +
AUD in one transaction by **application convention**. `polId` is a caller-minted
`newId()`. `audit.commit_event` (0012) checks AUD↔POL linkage, but **nothing in
the database forces an effect (canonical/tenant/domain/principal/binding/outbox)
to be accompanied by a matching persisted allow-POL and success-AUD before
commit.** A handler that wrote an effect and skipped closure would still commit.
**Correction (0013):** an in-database **operation-closure protocol**:
`ctx.open_operation(...)` issues a DB-side operation id/nonce bound to
tx + runtime role + principal + session + tenant/domain + action + exact target +
correlation/causation + purpose + consequence + bundle + immutable decision id +
capability class + expected outcome, recorded in `ctx.operation`. Every
authoritative effect port stamps the current operation id onto a per-tx effect
ledger (`ctx.operation_effect`). A **DEFERRED CONSTRAINT TRIGGER** on the effect
ledger fires at commit and fails the transaction unless the operation has exactly
one persisted `allow`/`allow_with_obligations` POL, all obligations executed, one
matching success AUD for the exact action/actor/scope/target/correlation, and its
outbox rows are attributed to it. Deny/indeterminate → POL+AUD only, zero effect,
zero business outbox.

### C2 — Remove evidence-mode authority
**Confirmed:** evidence context still shares broad `SELECT`. Evidence mode must
read/write no business table, never elevate scope, never reach a consequential
port. **Correction:** revoke broad business `SELECT` from writer/evidence roles;
reads go through action-specific governed read ports/views; `eye_row_writable`
and each read port reject `evidence` mode; `ctx.issue_evidence` validated route
vs subject (already partially present — hardened + tested).

### C3 — Database-enforced single-use bootstrap
**Confirmed:** `identity.claim_bootstrap()` exists; bootstrap capability is
minted separately from the claim. **Correction:** bind the bootstrap capability
to the atomically-acquired claim + nonce + exact target; claim/admin-create/
credential-issue/consume/evidence succeed or roll back together; eligibility from
`config.runtime_profile`, never caller env.

### C4 — Govern every identity mutator
**Confirmed sites:** `identity.bump_epoch`, `session_open`,
`refresh_rotate_family`, `credential_issue`, `credential_revoke`,
`credential_rotate_v2`, `sessions_revoke_all_v2`, principal/binding mutations.
Several are currently reachable with only the role grant + any `identity_op`
context. **Correction:** each requires an operation-specific identity capability
bound to exact action + subject + target + session + scope + correlation; the
capability cannot mutate a *different* identity family (victim-takeover test).

### C5 — Govern verifier / seal / availability ports
**Sites:** `audit.open_integrity_incident`, `lock_head_for_seal`, `append_seal`,
`commit_integrity_event`, `record_availability_incident`,
`reconcile_availability_incident`, suppression/recovery. **Correction:** each
requires the correct verify/seal/incident/reconcile/recovery capability bound to
exact partition + expected head + computed head + result + correlation. Results
derive from the actual computation; no caller-declared success.

### C6 — Make every capability binding enforceable
**Confirmed:** action/target/correlation are signed but not fully re-checked at
every port. **Correction:** every authoritative port verifies mode+class, role,
live principal/session/binding, scope, exact action, exact target, exact
correlation/causation, decision+bundle, purpose+consequence, allowed outcome.
Target ids generated pre-issuance; lifecycle actor + audit correlation derived
server-side; canonical header audit-correlation bound to the operation.

### C7 — Close outbox suppression / publish bypasses
**Confirmed:** `objects.outbox_lease` bounds batch (`least(greatest(p,1),500)`)
but **lease TTL is unbounded**; no retry budget / dead-letter / stale-lease
recovery. **Correction:** bounded lease TTL, retry budget, retryable-vs-terminal,
governed dead-letter, stale-lease reclaim; target-bound lease token + ack (CAS);
no arbitrary permanent suppression.

### C8 — Replace the omnibus application capability
**Confirmed:** `apps/api/src/shared/capabilities.ts` `BoundedCapability` exposes
`read()` over 11 relations **and** `enqueueOutbox` to every handler.
**Correction:** action-specific capability interfaces; outbox creation is
pipeline-private; each read port restricts relations/columns/masking;
`objects.read` cannot touch audit/identity/policy/outbox; `audit.read` cannot
bypass masking; no raw-SQL escape. Compile-time + runtime negative tests.

### C9 — Complete fail-closed & degraded recovery
**Confirmed:** `apps/api/src/shared/degraded-store.ts` journals + reloads; the
DB-side reconciliation loop is incomplete. **Correction:** all deny/indeterminate
branches share the fail-closed path; governed 503 (never raw 500); fsynced
journal; `/readyz` degraded; zero mutation; restart restores journal; governed
reconciliation reconciles DB incident + writes recovered marker; healthy only
when DB and journal agree; ungoverned local clearing fails. Test: degrade →
restart → still degraded → reconcile → healthy → restart → still healthy.

### C10 — Complete audit.verify semantics
**Correction:** verify checks byte-canonical `event_jcs`, stored digest + chain
hash, sequence continuity, head consistency, seals, incidents, **orphan rows
beyond head**, duplicates. Every result retains the exact authorizing decision.
Integrity mutation + its governed evidence atomic. Tests: policy-denied verify,
noncanonical jcs, altered bytes, orphan-above-head, false success, outer failure
after verifier ran, wrong partition/target.

### C11 — Complete RFC 8785 / I-JSON conformance
**Confirmed:** `packages/contracts` JCS + corpus exist; strict rejection is
incomplete. **Correction:** TS + browser + SQL reject lone surrogates, `undefined`,
functions, symbols, sparse arrays, non-finite; do not coerce `undefined` array
elements to `null`. Positive + rejection corpora; byte-for-byte cross-impl.

### C12 — Correlation & error traceability
**Confirmed:** downstream validation mints fresh ids. **Correction:** every
authenticated failure returned to the caller uses the **envelope** correlation id;
returned id locates the exact POL/AUD evidence. Tests over invalid login /
password / workload-secret / principal-payload paths.

### C13 — Catalog-derived authority inventory
**Confirmed:** no catalog-derived gate exists. **Correction:**
`apps/api/scripts/authority-inventory.mjs` discovers every runtime-granted
SECURITY DEFINER function + every authoritative mutator from live catalogs; records
owner/grantees/tables/capability class/mode/action/target/correlation/live-auth/
role; the gate **fails on any unclassified mutator**; verifies zero PUBLIC EXECUTE,
zero unintended direct DML, RLS enabled+forced on every governed table, no legacy
mechanisms, recovery unloaded by app pools, verifier≠audit-writer, identity≠commit/
verifier, writer cannot self-mint.

### C14 — Complete runtime adversarial matrix
Executable tests (no source-string proofs) for every C1–C13 finding — full list
in the directive; added to `apps/api/test/int/`.

### C15 — Rebuild the supply-chain gate
Raw artifacts (cmd/tool/version/timestamp/SHA/exit code/output) for pnpm audit
(human+JSON), gitleaks (repo+history), Trivy fs, pinned-image scans, prod+dev
licence closures, official CycloneDX validation, SBOM/lockfile reconciliation.
One tracked top-level `scripts/gate/run-gate.sh`; pinned tools/actions/images;
no hosted-CI claim without a real artifact.

### C16 — Real target-specific SBOM closure
linux-x64 prod + dev closures vs target-resolved lockfile; bidirectional; every
lockfile identity included or governed-excluded (reason/target/evidence); stale
exclusions fail; correct npm PURLs + relationships + coverage report; no host-Mac
closure as prod evidence.

### C17 — Official CycloneDX validation + obligations
Pinned official CycloneDX 1.6 schema/validator; validate SBOM + negative
fixtures; third-party notices/obligations artifact (LGPL/CC-BY/attribution);
legal disposition separated from allowlist.

### C18 — Rebuild forward & virgin DB proof
Forward fixtures via **historical governed ports** where they existed; full
pre/post comparison (values, relationships, hashes, chain, policy linkage,
privileges, digests, canonical history, sessions/credentials where safe); full
applicable DB suites on both DBs; raw output (not tail-only); honest single-run
labelling for universal suites.

### C19 — Correct all controlled documents + NOLOGIN roles
Reconcile PHASE0_REPORT / PHASE0_EVIDENCE / PROGRESS / DECISIONS / PHASE0_PLAN /
EXCEPTIONS / this plan / PHASE1_PLAN refs / ops docs; remove stale Gate-2 counts,
privilege/bootstrap models, absent-file refs; label superseded plans historical;
document current role model/secret handoff/env vars/recovery/source-evidence
protocol; final SHAs live in an external ZIP-root manifest, never inside the
evidence commit. Make `eye_system` + other legacy roles **NOLOGIN**.

---

## 3. Freeze & evidence protocol (unchanged from directive; enforced at the end)

Freeze only when: app compiles; clean-source typecheck precedes build; all suites
+ new negatives pass; both DB paths pass; catalog authority gate passes;
supply-chain gate passes; controlled docs coherent. Then commit source →
isolated checkout at that SHA → virgin containers → run top-level gate runner →
record raw evidence → commit `evidence/**` only → prove attestation changes no
source → git bundle (both commits) → per-file SHA-256 manifest + archive digest →
final ZIP → verify from a second extraction. Final SHAs in the ZIP-root manifest,
not inside the evidence commit.

---

## 4. Status ledger (updated live)

| Area | State |
|---|---|
| Plan written | ✅ |
| C1 operation closure (0013) | ✅ **done & verified** — migration `0013_operation_closure.sql`: `ctx.operation` + `ctx.operation_effect` + deferred constraint trigger `assert_operation_closed`; `issue_commit` opens the operation; `AFTER INSERT` stamp triggers on all 6 business-effect tables. Proven by `test/int/gate22-operation-closure.test.ts` (8 tests: effect-only, partial-closure, unrelated-decision-id, tenant/canonical/outbox effects, positive control, deny-path-no-effect). Full suite green: 207 integration + 42 acceptance. |
| C2 evidence de-authorization | ✅ **done & verified** — migration `0014_evidence_deauthorization.sql`: RLS visibility (`eye_row_visible` + tenants/domains/principals/role_bindings policies) now requires a read-capable mode (`authority`/`verify`); evidence/identity_op/publish/bootstrap contexts see zero business rows. Fixed a real `issue_evidence` PLATFORM-elevation bug (authority check was skipped for PLATFORM scope) with a binding-parity scope check. Proven by `test/int/gate22-evidence-deauthorization.test.ts` (7 tests). Full suite green: 214 integration + 42 acceptance. |
| C3 bootstrap claim atomicity | ✅ **done & verified** — migration `0016_bootstrap_claim_binding.sql`: the claim is now bound to the bootstrap capability (mode required) and its correlation nonce; only the winning capability (matching nonce) may complete it, and a consumed claim cannot be reused. Atomicity/concurrency/DB-eligibility were already sound (0009). Proven by `test/int/gate22-bootstrap.test.ts` (9 tests) + the real bootstrap flow (acceptance AC-1). 227 integration + 42 acceptance green. |
| C4 identity mutators | ✅ **done & verified** — migration `0017_identity_mutator_governance.sql`: `assert_identity_capability(action,subject)` (strict) binds the externally-invoked mutators (`session_open`, `credential_rotate_v2`, `refresh_rotate_family`) to exact action + subject; `assert_identity_context()` (loose) governs the internal helpers (`bump_epoch`, `sessions_revoke_all_v2`, `credential_issue`, `credential_revoke`). Victim-takeover closed: a rotate capability bound to A cannot rotate B. Proven by `test/int/gate22-identity-mutators.test.ts` (6 tests) + the real login/refresh/rotate flow (acceptance). 233 integration + 42 acceptance + typecheck 0. |
| C5 verifier/seal/availability | ✅ **done & verified** — migration `0018_verifier_seal_governance.sql`: `assert_verify_capability(partition)` / `assert_seal_capability(partition)` bind `open_integrity_incident`, `lock_head_for_seal`, `append_seal` and `commit_integrity_event` to the exact partition (these had NO capability check — only a role grant). Seal head is re-derived under the lock. Proven by `test/int/gate22-verifier-seal.test.ts` (9 tests: no-capability freeze/seal, cross-partition freeze/seal/verdict, verify-cannot-seal, fabricated-head seal). 242 integration + typecheck 0. |
| C6 capability binding | ✅ **done & verified** — migration `0019_capability_binding_enforcement.sql`: `ctx.assert_bound_target()` enforced at `create_tenant`/`create_domain`/`create_principal`/`admit_version` (NO business port checked the bound target before); caller-supplied `p_actor` **removed from the signatures** and derived via `ctx.bound_actor()`; canonical header `audit_correlation_id` must equal the operation correlation; `ctx.bind_operation_causation()` + closure-trigger causation check. App: routes now pre-generate target ids before the capability is minted. Proven by `test/int/gate22-capability-binding.test.ts` (9 tests). |
| C7 outbox hardening | ✅ **done & verified** — migration `0015_outbox_hardening.sql`: lease TTL clamped to [1,300]s (was unbounded → extreme-lease suppression); retry budget of 10 with automatic governed `dead_letter`; ack restricted to `published`/`dead_letter` terminal targets tied to the lease token; new `outbox_release` for bounded retryable release. Proven by `test/int/gate22-outbox-hardening.test.ts` (4 tests). 218 integration + 42 acceptance green. |
| C8 action-specific capabilities | ✅ **CLOSED (internal verification)** — `shared/capabilities.ts` rewritten: the omnibus `BoundedCapability` (11-relation `read()` + `enqueueOutbox` for every route) is replaced by `TenancyCapability`/`ObjectsCapability`/`PrincipalsCapability`/`AuditCapability` with separate `.read`/`.write` faces. **The relation is no longer a parameter** — there is no `read(relation)` anywhere, so `objects.read` cannot express a query against audit/identity/policy/outbox (compile-time type error, proven by 48→0 error convergence). Outbox creation is pipeline-private (`OutboxCapability`). Transaction held in `#tx`, reachable only via the core's protected helpers. |
| C9 degraded recovery | ✅ **CLOSED (internal verification)** — migration `0020_governed_degraded_recovery.sql` + `src/audit/reconcile-degraded.ts`. Ungoverned reconcile port dropped; recovery capability bound to the exact incident; inseparable evidence; replay refused; governed-proof `markRecovered`; denial-during-outage → governed 503; full degrade→restart→reconcile→restart cycle proven. 9 dedicated tests + acceptance. |
| C10 audit.verify semantics | ✅ **CLOSED (internal verification)** — byte-canonical `event_jcs` comparison, orphan rows above head, exact POL retained for every result, inseparable integrity evidence, tampered chain never sealed. 5 tests + acceptance (44/44). |
| C11 RFC 8785 strictness | ✅ **CLOSED (internal verification)** — undefined-array-element coercion, sparse arrays, lone surrogates and non-plain objects all now REJECTED; 22 rejection cases; SQL rejection parity measured and recorded. |
| C12 correlation traceability | ✅ **CLOSED (internal verification)** — placeholder correlations removed; envelope correlation returned on every authenticated failure and proven to locate the evidence (7 paths × 2 assertions). Superseded note: was 🟡 partly done — `principals.service` no longer mints a fresh correlation in downstream validation; it uses the request envelope's correlation (3 sites). Remaining: sweep the auth/workload-secret paths and add the response↔evidence correlation-equality tests. |
| C13 catalog authority gate | ✅ **CLOSED (internal verification)** — catalog-derived inventory + failing gate; found and closed 3 surviving unbounded identity lookups and 2 unnecessary role logins. 63 classified ports, 0 PUBLIC EXECUTE, 0 RLS gaps. |
| C14 adversarial matrix | ✅ **CLOSED (internal verification)** — catalog-driven coverage gate + generic no-capability and cross-role probes + machine-classified non-mutators + inertness proofs for the 10 no-capability entrypoints + allocator/eye_system posture. Non-vacuity demonstrated by negative control. 15 tests. |
| C15 supply-chain gate | ✅ **CLOSED (internal verification)** — `scripts/gate/supply-chain.mjs`: pinned toolchain verified before any scan (pnpm 11.9.0, node v24.11.1, gitleaks 8.30.1, trivy 0.73.0) and fail-closed on mismatch; 8 steps / 6 blocking, with raw stdout+stderr written to disk and SHA-256 digested per step alongside exact argv, tool version, timestamps, exit code and source SHA. Real finding: **nanoid <3.3.17 / CVE-2026-67213 (HIGH)**, flagged independently by pnpm audit and trivy. Governed gitleaks config narrows scope but disables no rule; both path allowlists are proven untracked+ignored. **Carry-forward items closed under C16** (see C16 row): per-platform container digests, step-policy taxonomy, scanner-binary and vuln-DB provenance. |
| C16 target SBOM closure | ✅ **CLOSED (internal verification)** — see the C16 closure record below. Two deterministic target-resolved closures (linux/x64/glibc, prod and dev) built from `pnpm-lock.yaml` + `scripts/gate/target-descriptor.json`, reconciled **bidirectionally against the SBOM re-read from disk**. Production 195 components / 290 edges; development 292 / 443. Zero missing, zero extra, zero identity mismatches, zero dangling refs, zero orphans, in both targets and both directions. 31 non-vacuity controls + 16 C15 carry-forward controls. |
| C17 CycloneDX + obligations | ⏳ |
| C18 forward/virgin proof | ⏳ |
| C19 docs + NOLOGIN | ⏳ |
| Freeze + evidence + ZIP | ⏳ |
| Independent review | External independent review **pending** against the final frozen source + evidence package. Claude's own testing is verification, not independent review; Phase 0 stays unapproved until that external review. |

---

## 5. C16 closure record

### 5.1 The defect being corrected

Gate-2.1 reconciled the SBOM against a structure derived **from that same SBOM**, and
the licence inventory against the SBOM in turn. That is self-reconciliation: it cannot
fail, so it evidenced nothing. Separately, the "closure" was resolved on the host
(arm64 macOS), so it was not the closure of any deployable target.

### 5.2 Exact target definitions

Declared in `scripts/gate/target-descriptor.json`; neither target reads the host.

| | `linux-x64-glibc-prod` | `linux-x64-glibc-dev` |
|---|---|---|
| os / arch / libc | linux / x64 / glibc | linux / x64 / glibc |
| node | `>=24.0.0 <25`, pinned **24.11.1** | same |
| pnpm | pinned **11.9.0** | same |
| importer roots | `apps/api`, `apps/web`, `packages/contracts`, `packages/tokens` | the same four **plus** `.` (the workspace root) |
| dependency scopes | `dependencies`, `optionalDependencies` | `dependencies`, `devDependencies`, `optionalDependencies` |

Provenance for those values is recorded in the descriptor: CI `runs-on: ubuntu-latest`,
the `engines` and `packageManager` fields, and the `pnpm-workspace.yaml` package globs.
The descriptor also records honestly that **no Dockerfile or deployment artifact exists**
for `apps/api` or `apps/web`, so the deployment platform is derived from CI and
`engines` rather than from a runtime image.

Closure truth is the **lockfile plus the descriptor**. `closure_truth.forbidden_sources`
names what may never be used instead: node_modules on disk, `pnpm licenses list`, the
generated SBOM itself, and the host OS/architecture/libc.

Platform filtering follows the rule **missing metadata means include** — an
`optionalDependencies` entry is only dropped when its own `os`/`cpu`/`libc` metadata
positively excludes the target, and each drop records the field, the required value and
the parent that made it reachable.

### 5.3 Measured closures

| | production | development |
|---|---|---|
| components | **195** | **292** |
| edges | **290** | **443** |
| workspace components | 4 | 5 |
| registry components | 191 | 287 |
| peer-variant components | 10 | 16 |
| leaf components | 115 | 162 |
| platform-excluded | 36 | 60 |
| unresolved lockfile references | 0 | 0 |

Peer-resolved instances keep the peer context in their identity
(e.g. `@nestjs/common@11.1.28(reflect-metadata@0.2.2)(rxjs@7.8.2)`), so two different
resolutions of the same `name@version` remain two components rather than collapsing.

### 5.4 Reconciliation (independent provenance, both directions)

`scripts/gate/generate-closures.mjs` serializes each SBOM, **re-reads it from disk**,
and compares the lockfile-derived graph against the parsed-from-bytes graph. Nothing
from the in-memory document is consulted on the SBOM side.

Result, both targets: **0 missing nodes, 0 extra nodes, 0 missing edges, 0 extra edges,
0 identity mismatches, 0 dangling references, 0 components without a dependency entry,
0 orphan components.** Node and edge counts agree on both sides (195/195 and 290/290;
292/292 and 443/443) rather than merely having an empty difference. Missing and extra
are reported separately per target, never as one symmetric-difference count.

### 5.5 Determinism

Repeated generation into **separate directories at different times** is byte-identical:
`sbom-linux-x64-glibc-prod.cdx.json` → `ab2b38a5fff646bc74794a12524127ad613bb7c39e3c5e01a97c80466be9fb9f`,
`sbom-linux-x64-glibc-dev.cdx.json` → `22fc88e1b48a6103505d036ab4f7aafac431f8b7a8954e896fc718dc315b64a7`.
`metadata.timestamp` is deliberately omitted, the `serialNumber` is a SHA-256 of the
content shaped into a UUID (identical across runs), and every collection is sorted.

`node_modules` independence was proven three ways, not asserted: a ghost package
injected into `node_modules` left the output byte-identical and absent from the SBOM;
`node_modules` **deleted entirely** still produced byte-identical output and a passing
gate; and `npm_config_arch=arm64 npm_config_platform=darwin` changed nothing.

### 5.6 Governed exclusions

`scripts/gate/closure-exclusions.json` is fail-closed with 8 required fields and 5
rejection rules, all enforced in `scripts/gate/lib/reconcile.mjs` and each driven by a
control. The three rules that would otherwise collapse into one are separated by the
target-independent lockfile universe: `version_changed` (name present at another
version), `unused_never_applied` (version exists in the lockfile but not in this
target's closure), `stale_not_in_closure` (gone from the lockfile entirely). A rule that
can never fire is not a rule.

**The file declares zero exclusions.** Nothing is being suppressed, and that is the
honest state rather than a placeholder.

### 5.7 Exact override, replacing a floating range

The C15 finding (nanoid <3.3.17, CVE-2026-67213, HIGH) was remediated in C15 with the
**range** `nanoid: '>=3.3.17'`. A range is not a reviewed decision, and this one floated
the resolution to **nanoid@6.0.1** — two majors above the only consumer's declared
range (`postcss@8.5.25` requires `"nanoid": "^3.3.16"`, so 6.0.1 satisfied no declared
consumer and was reachable only because the override forced it), and engine-narrowed
(`^22 || ^24 || >=26`) against our own `>=24 <25`.

Corrected to the exact reviewed version **`nanoid: 3.3.18`**: the highest patch on the
3.x line, therefore above the `<3.3.17` vulnerable boundary; inside postcss's declared
`^3.3.16` range, so no forced semver-major break; carrying the `main: index.cjs` entry
and the `./non-secure` subpath export that `postcss/lib/input.js` actually requires; and
with engines that admit node 24.11.1. Integrity
`sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==`.

Residual proof: both closures resolve **only** `nanoid@3.3.18`, and `pnpm audit` reports
`{info: 0, low: 0, moderate: 0, high: 0, critical: 0}` for `--prod` and for the full dev
closure. The residual check is part of the gate, so a future floated override fails.

### 5.8 C15 carry-forward, closed here

1. **Per-platform container digests.** Both compose pins are OCI image **indexes** with
   16 children (8 runnable platforms, 8 buildkit attestations). "We scanned the
   digest-pinned image" was therefore ambiguous: a scanner with no `--platform` follows
   the **host**, so this arm64 workstation was scanning the arm64 child while CI and the
   C16 target run linux/amd64 — different layers, different findings. The gate now
   resolves each index to its exact `linux/amd64` child and scans **that** digest:
   * `postgres@sha256:9a8afca5…` → `sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b`
   * `redis@sha256:978f0e01…` → `sha256:a6a88248ad5b0c724b7f2b380b7d21f46097db158b2b077ef85bcb97f90aee3a`
   Every sibling platform is enumerated in the manifest, the SHA-256 of the raw index
   bytes is recorded (and equals the pinned digest, which independently confirms the
   bytes parsed were the pinned content), and a reference whose target-platform child
   cannot be resolved **fails the gate closed**.
2. **"Eight steps, six blocking" clarified and machine-checked.** The two non-blocking
   steps are `pnpm-audit-json` and `trivy-fs-json` — alternate output **formats** of
   `pnpm-audit-human` and `trivy-fs`, which already ran under a blocking policy with the
   same pinned tool. They exist to preserve the complete machine-readable finding set
   below the blocking severity threshold. No scan is permitted to fail. This is now
   enforced rather than claimed: every informational step must name the blocking step
   whose coverage it duplicates, and the gate fails if any non-blocking step introduces
   coverage nothing blocking also enforces. Five controls drive the failure paths.
3. **Scanner and database provenance.** A `--version` string is a claim a binary makes
   about itself, so the manifest now records the resolved path and SHA-256 of each
   scanner executable (pnpm, node, gitleaks, trivy, docker), plus trivy's vulnerability
   database identity and freshness: schema version, build time, next-update-due,
   download time, **computed** age at scan and a computed past-due flag (measured at
   this run: built `2026-08-11T07:08:26Z`, 6.7h old, not past due), and the
   misconfiguration check-bundle digest. Exact argv, per-step stdout/stderr digests,
   timestamps, exit codes and source SHA were already captured and remain.

### 5.9 Controls

`apps/api/test/gate/c16-closure-controls.test.ts` — **31 tests**. Twelve control
classes, each corrupting a real generated SBOM in one specific way and requiring the
reconciler to report that exact corruption: remove a real component; add a ghost
component; alter a recorded version; alter a PURL; rewrite the lock-key provenance
property; remove a real edge; add a fake edge between two real components; point an edge
at a nonexistent component; drop a component's dependency entry; collapse peer-context
instances; omit a target-compatible optional dependency; inject a platform-incompatible
dependency; ten exclusion-governance rejections; importer-roots and scope
load-bearingness; and environment independence. The version/PURL/lock-key controls
specifically leave the `bom-ref` set untouched, so a set-only comparison would call them
clean — they fail only because identity is checked too.

`apps/api/test/gate/c15-scanner-provenance.test.ts` — **16 tests** over the three
carry-forward items, including five failure-path controls for the step-policy audit.

### 5.10 Suites at C16

typecheck **0**; build **0**; boundaries **clean** (93 modules, 250 dependencies);
contracts **203/203**; tokens **3/3**; api gate+unit **109/109**; integration
**297/297**; acceptance **58/58**. C16 closure gate **PASS**; C15 supply-chain gate
**PASS** (8 steps, 6 blocking, 0 failures).

### 5.11 Evidence sequencing

All C16 outputs under `evidence/supply-chain/c16/` are **preliminary and untracked**
(gitignored). Only the generators, the target descriptor, the exclusion governance and
the controls are committed. Final outputs are regenerated from the future frozen SHA and
committed in the evidence-only child. The report itself carries a `status` field saying
so, so a stray copy cannot be mistaken for final evidence.

### 5.12 Still open after C16

C17 (vendored official CycloneDX 1.6 schema + referenced schemas with provenance and
SHA-256, AJV as a direct pinned devDependency, offline validation, negative fixtures
proving the old permissive subset cannot pass, licence inventory + third-party notices +
obligations), C18, C19, the freeze protocol and external independent review all remain
pending. The legacy `evidence/supply-chain/sbom.cdx.json` and `reconciliation.txt`
artifacts and their assertions still ship; the reconciliation assertion is now labelled
**superseded** in `supply-chain-artifacts.test.ts` because it was self-referential, and
C17 replaces those artifacts.
