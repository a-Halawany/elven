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
| C15 supply-chain gate | ✅ **CLOSED (internal verification)** — `scripts/gate/supply-chain.mjs`: pinned toolchain verified before any scan (pnpm 11.9.0, node v24.11.1, gitleaks 8.30.1, trivy 0.73.0) and fail-closed on mismatch; 8 steps / 6 blocking, with raw stdout+stderr written to disk and SHA-256 digested per step alongside exact argv, tool version, timestamps, exit code and source SHA. Real finding: **nanoid <3.3.17 / CVE-2026-67213 (HIGH)**, flagged independently by pnpm audit and trivy. Governed gitleaks config narrows scope but disables no rule; both path allowlists are proven untracked+ignored. **Carry-forward items closed under C16** (see C16 row): per-platform container digests, step-policy taxonomy, scanner-binary and vuln-DB provenance. **After independent review**, DB provenance is now ENFORCED rather than merely recorded (fail-closed on unavailable / malformed / stale / past-due, 24h ceiling), and a `--final` mode refuses to produce evidence from a dirty worktree. |
| C16 target SBOM closure | ✅ **CLOSED** — closed by bounded independent review at `d63318e099a152cef18682e97d84ea7e1a70abd9` after five remediation rounds (R3.1–R3.4.5). Hosted run `31806239862`, all three jobs green. Evidence archive sha256 `27ba79b0681b855e710c8b82e0d95c39ff971dc7770bee601d08fe7858027e04`. Measured at closure: gate **587**, API unit + gate **601** (587 + 14), integration **297**, acceptance **58**, contracts **203**, tokens **3**, Playwright **10** on a virgin database. The verifier compares complete canonical PURLs against source-derived sets, resolves every result through one total (Class, Type) contract, requires the exact source-owned filesystem result set, and pins the pnpm audit document to a closed schema. Container findings reconcile at **18** across **4** governed records. |
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

Corrected to the exact reviewed version **`nanoid: 3.3.18`** — the governed version is exactly 3.3.18, and every reference to 6.0.1 in this document describes only the superseded range behaviour: the highest patch on the
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

### 5.13 SUPERSEDED NUMBERS

The counts in §5.3–§5.5 above are those measured at `e3a0b1f`, before the independent
review. They are retained as the historical record. The authoritative post-remediation
figures are in §6.3.

### 5.12 Still open after C16

C17 (vendored official CycloneDX 1.6 schema + referenced schemas with provenance and
SHA-256, AJV as a direct pinned devDependency, offline validation, negative fixtures
proving the old permissive subset cannot pass, licence inventory + third-party notices +
obligations), C18, C19, the freeze protocol and external independent review all remain
pending. The legacy `evidence/supply-chain/sbom.cdx.json` and `reconciliation.txt`
artifacts and their assertions still ship; the reconciliation assertion is now labelled
**superseded** in `supply-chain-artifacts.test.ts` because it was self-referential, and
C17 replaces those artifacts.

---

## 6. C16 REMEDIATION RECORD — after independent source review of `e3a0b1f`

`e3a0b1f` was independently reviewed. The finding: **the component counts reproduced,
but the gate could still certify semantically incorrect or incomplete SBOMs.** C16 was
returned to PENDING REMEDIATION. Twelve defects were identified and all are corrected
below. This section is authoritative where it conflicts with §5.

### 6.1 What was actually wrong

| # | Defect at `e3a0b1f` | Why it mattered |
|---|---|---|
| 1 | Scoped PURLs emitted as `pkg:npm/%40scope%2Fname@version` | Not a spelling variant. That string parses as a **namespace-less** package literally named `@scope/name`; the canonical `%40scope/name` carries namespace `@scope` + name `name`. Every consumer matching on namespace saw a different package. |
| 2 | Workspace components used path basenames and a hardcoded `0.0.0` | `packages/contracts` was reported as `contracts@0.0.0` when the package is `@eye/contracts@0.0.1`. First-party identity was fabricated. |
| 3 | Bespoke partial YAML reader | Silently mishandled constructs it did not model; each was a way to lose real closure data with no error. |
| 4a | `link:` resolved by fuzzy `endsWith` matching | Not resolution. A link could bind to the wrong importer. |
| 4b | A linked workspace was never expanded unless separately a target root | Its transitive runtime dependencies were **absent from the closure while genuinely required**. |
| 4c | Unresolved OPTIONAL references `continue`d silently | An incomplete closure could certify itself complete. |
| 4d | `visit()` returned early on an already-seen node | Scope membership never reached a fixed point: **61 of 289 development components carried incomplete scope provenance**, and which one was measured depended on traversal order. |
| 4e | Platform check evaluated negations **or** positives | Mixed metadata such as `os: ['!win32','darwin']` was mis-evaluated. |
| 5 | Metadata subject `eye:target:<id>` had no dependency entry | The declared subject was attached to nothing: a consumer walking from the subject reached **zero** components. |
| 6 | Reconciliation compared Maps/Sets over four fields | Duplicates collapsed on read; name, type, integrity, patch hash, peer context, target id, scope, os/cpu/libc, workspace identity and subject edges could all be removed or rewritten and still reconcile "clean". |
| 7 | Exclusions were validated and then never applied | A "valid" exclusion had no effect and could never be observed to work. |
| 8 | Controls asserted source strings | Proves a line exists, not that it works. |
| 9 | CI ran the legacy Gate-2.1 generator; tests read a gitignored path | A local run passed on leftover preliminary files while a clean checkout failed. |
| 10 | Trivy DB identity recorded but not enforced | A scan against an absent or stale database still reports "ok" — it simply finds nothing. |
| 11 | SBOMs bound no source SHA or generator digest | A serialized SBOM could be separated from the inputs that produced it. |

### 6.2 Corrections

**Canonical Package URLs.** `packageurl-js@2.0.1` is now an **exact-pinned direct
devDependency** and is the only producer of a PURL; the bespoke encoder is gone. The
runner verifies the pin before generating and fails closed on a mismatch — a canonical
PURL from an unknown encoder is not canonical. Positive vectors cover scoped, unscoped
and escape-requiring names with round-trip parsing; negatives prove the old form parses
to a different identity and that malformed values throw.

**First-party identity.** `workspaceIdentity()` reads each importer's own
`package.json`, refuses a missing manifest or a manifest with no name/version, and binds
the identity to the manifest's SHA-256. The manifest supplies **identity only**: a
control feeds two repos differing solely in their manifests' dependency lists and
requires identical node sets, so identity metadata can never alter membership.

**Lockfile parsing.** `yaml@2.9.0`, exact-pinned and verified. Synthetic fixtures cover
importers/packages/snapshots, flow mappings, quoted keys, block sequences, aliases,
workspace/link references, patch hashes, peer suffixes and optional dependencies.

**Traversal.** Rewritten as two explicit phases. Phase 1 discovers structure via a
cycle-safe worklist and **fails closed on every unresolved reference, required or
optional**, and on a platform-incompatible *required* dependency. Links resolve with
`posix.normalize` relative to the importing workspace, and a linked workspace is
expanded recursively through its **runtime** scopes even when it is not a declared root
(its devDependencies are not consumed through a link). Phase 2 propagates scope to a
**fixed point** with one narrowing rule: a `devDependencies` edge out of a workspace
never inherits an inbound runtime scope — without it, `apps/api --dependencies-->
@eye/contracts` marks contracts' dev toolchain (typescript, vitest) as production. A
declared root carries the target's declared scopes directly and never propagates them.
Platform constraints now apply negations **and** positives: an explicit negation always
excludes, and positives act as an allowlist when present.

**Subject connectivity.** The subject carries a dependency entry naming every declared
importer root. The reconciler **requires** those edges — roots are not exempt from the
orphan check, because exempting them is what hid the disconnected graph.

**Full-field multiset reconciliation.** `extractFromSbom` returns multiplicity counts,
never deduplicating Sets. The reconciler rejects duplicate components, duplicate
dependency entries, repeated `dependsOn` values and duplicate required properties, and
compares name, version, type, canonical PURL (including namespace/name/version parts),
lock key, integrity hashes, patch hash, peer context, target id, scope membership,
os/cpu/libc, workspace identity + manifest digest, subject identity and every provenance
binding, in both directions.

**Operational exclusions.** One documented semantic: a valid exclusion **removes** the
exact node and every incident edge and records it in a separate `excluded` set;
reconciliation then runs against the reduced closure. Schema v2.0.0 requires eleven
fields including `approver` (which must differ from `owner`), `evidence_sha256`,
`approved_on` and `expires_on`. Nine rejection rules are enforced, including `expired`,
`unapproved`, `wrong_target` and `wrong_parent`. The file declares **zero** exclusions.

**C15 enforcement.** `enforceTrivyDatabase()` fails the gate closed when the database is
unavailable, malformed, beyond a 24h freshness ceiling, past its next-update time, or
reports a negative age — checked **before the first scan**. A `--final` mode on both
runners refuses to produce evidence from a dirty worktree.

**Provenance binding.** Every SBOM binds `eye:source-sha`, `eye:lockfile-sha256`,
`eye:descriptor-sha256`, `eye:generator-sha256` (a digest over the runner and all three
libraries), `eye:target-id`, and the pinned PURL/YAML implementation versions. The
report binds each serialized SBOM's exact SHA-256.

**CI.** Node pinned to exactly `24.11.1` in all three jobs. The legacy self-reconciling
generator is removed from the active gate. gitleaks 8.30.1 and trivy 0.73.0 are
installed and version-verified, the vulnerability DB is downloaded, and both tracked
runners are **blocking**, writing into explicit per-run temporary directories. The C16
artifact gate now **invokes the runner itself** into a fresh temp dir, so it depends on
no ignored state.

### 6.3 Authoritative post-remediation measurements

| | production | development |
|---|---|---|
| components | **195** | **294** |
| graph edges | **290** | **446** |
| subject → root edges | **4** | **5** |
| total edges reconciled | **294** | **451** |
| workspace / registry | 4 / 191 | 5 / 289 |
| peer-variant | 10 | 16 |
| leaves | 115 | 164 |
| platform-excluded | 36 | 60 |
| unresolved references | 0 | 0 |
| components with no scope | 0 | 0 |

Workspace identities, read from manifests: `@eye/api@0.0.1`, `@eye/web@0.0.1`,
`@eye/contracts@0.0.1`, `@eye/tokens@0.0.1`, plus `the-eye@0.0.1` for the dev root.

Scope membership — production `{dependencies+optionalDependencies: 4, dependencies: 191}`;
development `{dependencies+devDependencies+optionalDependencies: 5,
dependencies+devDependencies: 23, dependencies: 168, devDependencies: 98}`. The fixed
point moved 61 components' provenance and raised genuinely-shared components from 11
to 23.

Reconciliation is clean over all **16** failure dimensions in both directions for both
targets, with node and edge counts agreeing on both sides (195/195, 294/294; 294/294,
451/451).

Determinism: byte-identical across separate directories at different times —
prod `94651e12ae6aa8afea0192950204ee976e7151304034f4f8bd727f6ec4b15783`,
dev `718b666534c271de96d664720d39ccdaa4367889adaf111e1b08061d2031f90b`.

### 6.4 Controls

| Suite | Tests | What it drives |
|---|---|---|
| `c16-closure-controls.test.ts` | **75** | Corrupts real generated SBOMs; every reconciler dimension including duplicates, hashes, subject edges, bindings, and a POSITIVE valid-exclusion-applied fixture |
| `c16-lockfile-fixtures.test.ts` | **33** | Synthetic lockfiles: PURL vectors, flow maps, quoted keys, aliases, patch hashes, peer suffixes, recursive/relative/cyclic links, fail-closed unresolved refs, scope fixed point, mixed platform constraints, identity-vs-membership |
| `c15-scanner-provenance.test.ts` | **23** | Multi-arch resolution, step-policy taxonomy failure paths, and behavioural `enforceTrivyDatabase` controls |
| `supply-chain-artifacts.test.ts` | **10** | Invokes the shipped runner into a temp dir and asserts the produced report |

None of the C16 controls asserts a source string.

### 6.5 Clean-checkout equivalence

A pristine tree was exported from the staged index (no `.git`, no `node_modules`, no
preliminary C16 outputs), then `pnpm install --frozen-lockfile`, `node
scripts/license-inventory.mjs` and `node scripts/gate/generate-closures.mjs --out
$(mktemp -d)` were run exactly as CI does. Result: licence gate PASS (282 packages,
192 prod / 90 dev-only), C16 closure gate **PASS** with the same component and edge
counts, and `pnpm test` **400/400** (contracts 203, tokens 3, api 194). The SBOM digests
differ from the working-tree run **because** `eye:source-sha` binds and a `.git`-less
export has no commit — the binding demonstrating itself.

### 6.6 Verification at this commit

Migrations `0001`–`0021` byte-identical to `e3a0b1f` (0 files changed; tree digest
`fee665027eaa0dbfc7553ff326f1cab2305771d93377a87c92ae267fb3aa2e4b` on both). Clean-source
typecheck **0**; build **0**; boundaries clean (93 modules, 250 dependencies); contracts
**203/203**; tokens **3/3**; api gate+unit **194/194**; integration **297/297**;
acceptance **58/58**; C15 gate **PASS** (8 steps, 6 blocking, DB 13.1h old within the
24h ceiling); C16 gate **PASS**.

### 6.7 Still open

C17, C18, C19, the freeze protocol and external independent review remain pending. The
tracked Gate-2.1 artifacts under `evidence/supply-chain/` (`sbom.cdx.json`,
`reconciliation.txt`, `licenses-*.json`) are now **inert** — no gate step and no test
reads them — and C17 replaces them. Phase 0 remains unapproved.


---

## 7. C16-R2 REMEDIATION RECORD — after hosted-CI verification of `e120b21`

`e120b21` was independently reviewed against the **hosted** Actions run. C16 was returned
to PENDING REMEDIATION a second time. This section is authoritative where it conflicts
with §5 or §6.

### 7.1 The finding that mattered most

**No hosted CI run in this repository had ever been green.** All four runs in the
repository's history are red, back to the Gate-2.1 evidence attestation. Every previous
"CI enforces…" claim in these controlled documents rested on local-equivalent execution
only. Run `31532067899` was the first one actually read end to end.

### 7.2 Diagnosed root causes (from the logs, not guessed)

| Job | Failure | Root cause |
|---|---|---|
| `supply-chain` | `trivy misconfiguration check bundle reports no digest (malformed metadata)` | CI prefetched only the vulnerability DB. trivy 0.73 has **no `--download-check-only`**; the misconfiguration checks bundle is fetched lazily by the first misconfig scan. My own enforcement therefore demanded an input the workflow never acquired. It passed locally only because an earlier `trivy fs --scanners misconfig` had warmed the **default** cache — and the provenance probe read that default cache rather than the one the scans used. |
| `browser-regression` | `password authentication failed for user "eye_publisher"` | The job **never ran `pnpm db:migrate`**, so the least-privilege roles were never created with the run's ephemeral passwords. Pre-existing since the original monorepo scaffold; unrelated to C16. |
| `supply-chain` artifact upload | `No files were found with the provided path` | The runner exited before writing anything, so a red run left nothing auditable. |

Neither failure is environmental. Both have executable corrections below.

### 7.3 Trivy cold-cache, provenance capture and enforcement

`scripts/gate/lib/trivy-cache.mjs`. Facts established by probe, not assumption:
`trivy version --format json` reports a section **only** when that artifact exists in the
cache it reads — with an empty `--cache-dir` it prints `{"Version":"…"}` and nothing else.
The vuln DB lands in `<cache>/db/{metadata.json,trivy.db}`, the checks bundle in
`<cache>/policy/metadata.json`.

The runner now: acquires **both** artifacts into one explicit isolated cache (the bundle
via a single throwaway misconfig scan over an empty directory, the only supported way);
captures the trivy path + SHA-256, version + installation provenance, DB metadata + byte
digests, checks-bundle **OCI digest**, download timestamps, computed freshness and the
exact target platform, all from **that same cache**; enforces fail-closed on missing
NextUpdate, missing digest, malformed or absent bundle metadata, absent cache files,
staleness beyond 24h, past-due, negative age, version mismatch, and cache-vs-tool digest
disagreement; runs every authoritative scan with `--skip-db-update --skip-check-update`;
and proves the cache **fingerprint is unchanged** afterwards.

trivy 0.73 records no OCI digest for the vulnerability DB, so the DB is bound by the byte
digests of its cache artifacts. That is an upstream limitation, recorded rather than
papered over.

### 7.4 Scanner policy and target-specific dispositions

`.trivyignore` is **deleted**. It listed 16 bare CVE ids with prose governance: a bare id
suppresses that advisory in **every** image and package, so a genuinely new occurrence
elsewhere would be hidden, and expiry lived in a comment that nothing enforced.

Replaced by `scripts/gate/scanner-exclusions.json` + `lib/scanner-exclusions.mjs`. The
gate scans with **no suppression** (`--ignorefile /dev/null`), obtains the complete
finding set, and reconciles it against governed records. Trivy's ignore mechanism is never
relied upon, so suppression cannot occur without a matching record. An **unmatched**
finding fails the gate; an **unused** record fails it as stale. Each record names the exact
image digest, scan platform, package and PURL prefix, plus owner, approver (≠ owner),
reason, evidence, approval/expiry dates and compensating controls. Measured: **16 findings
on the linux/amd64 postgres child — 1 c-ares (apk) + 15 golang stdlib (gosu) — all
governed by 2 records (SUPERSEDED: 3 records since C16-R3.1 — see §9.3), 0 unmatched, 0 unused.**

**Coverage normalisation.** The JSON filesystem capture previously omitted `--severity`,
silently adding LOW/MEDIUM coverage nothing enforced. Both filesystem steps now share one
argument list, and both `pnpm audit` steps one audit level, so only `--format` differs —
and the runner **compares the coverage descriptors** of any step pair claiming
equivalence, failing if they diverge.

### 7.5 Exclusion governance is code-owned

`EXCLUSION_REQUIRED_FIELDS` and `EXCLUSION_SCHEMA_VERSIONS` live in
`lib/reconcile.mjs`; the document's own `required_fields` list is **cross-checked against
the code-owned set and rejected on any disagreement**, so the data cannot weaken its own
validation. Now enforced: unique ids, duplicate entries (rejected even when only one node
would be removed), owner ≠ approver, date chronology including future approval,
repository-relative + tracked + existing evidence whose **SHA-256 must match the actual
bytes**, `parent_edge` that is a real edge **and terminates at the excluded component**, a
scope the node **actually holds**, and exact cardinality agreement
(`declared == valid + rejected`, `valid == applied`, `removed == applied + cascaded`).

**Descendant semantics, chosen and documented:** a valid exclusion removes the node, every
incident edge, and every descendant the removal makes **unreachable from the subject
roots** — each cascade recorded individually. Deterministic, because reachability from a
fixed root set is a function of the graph. The reduced graph must contain no orphan and no
dangling reference, verified independently by the reconciler.

### 7.6 Reconciliation is now literal

Component properties are compared as an **exact set** — missing, unknown, duplicated or
altered all fail; previously a subset check let a rewritten scope or an invented property
pass. Integrity is an **exact multiset** of alg:digest pairs, so a fabricated extra hash
fails as a missing one does, and a registry component with no verifiable digest is
rejected outright. The metadata subject is reconciled field by field (bom-ref, name,
version, type, PURL). All sixteen metadata bindings are required, and
`requireExactBindings` rejects any unknown metadata property. A dependency entry for a
reference that is not a component fails **even when its `dependsOn` is empty**.

**Governed first-party types.** `apps/api` and `apps/web` are `application`;
`packages/contracts` and `packages/tokens` are `library`. An unmapped importer is an error,
not a default — mapping every workspace to `application` misrepresents libraries as
deployable units.

### 7.7 Traversal corrections

* **Optional ancestry** propagates: crossing an `optionalDependencies` edge adds that
  scope to the subtree. Production membership changed from a flat
  `dependencies: 191` to `dependencies+optionalDependencies: 146, dependencies: 49` —
  the previous labelling overstated what is mandatory.
* **A defect found in my own C16 fix:** `expandImporter` seeded non-link children
  unconditionally, so a linked workspace's runtime dependencies were seeded as production
  regardless of how the workspace was reached. Only a declared root seeds scope now; a
  dev-only linked workspace keeps its transitive runtime deps in development scope.
* **Patch hash is not peer context.** The suffix is split into balanced groups and
  classified, so `foo@1.0.0(patch_hash=...)` is no longer labelled a peer variant.
* **Integrity required and validated** for registry packages (algorithm, base64, digest
  length), with missing `packages:` metadata rejected and a governed `integrity_rules`
  escape hatch that records every use.
* **lockfileVersion is validated exactly** (`9.0`); a future or unknown format is a hard
  failure rather than a confident mis-parse.

### 7.8 Final-source semantics

Both runners now require, in `--final` mode: an explicit `--expected-sha`, HEAD equal to
it, a clean worktree, and a real git worktree. A gitless export stamped
`(not a git worktree)` is **preliminary equivalence evidence only**. The C15 runner also
records which git-dependent proofs it could not perform in such a tree rather than faking
them.

### 7.9 Defects found during this remediation

1. `enforceTrivyDatabase` demanded a checks-bundle digest that CI never acquired — my own
   defect, and the direct cause of the red hosted run.
2. The provenance probe read the **default** trivy cache, not the scans' cache.
3. `scripts/gate/lib/sbom.mjs` contained two **literal NUL bytes** in the property
   comparator; replaced with an escaped U+0000 representation.
4. The C15 runner crashed on a gitless export via an unguarded `git rev-parse` **before**
   writing any manifest. Fixed, plus a top-level handler so even an unexpected exception
   leaves a `CRASH` manifest and raw diagnostic.
5. `haveGit` was used before initialisation after the first fix — caught by the pristine
   run, not by reasoning.
6. My own scope-seeding bug (§7.7).
7. The behavioural negative-control test embedded a **literal PEM private key**, which the
   real gate correctly flagged as a planted secret in tracked source. The fixture is now
   synthesised at runtime, so no secret-shaped literal exists in the repository.
8. Local Playwright failed on shared-database contamination from the suites run before it;
   10/10 on a virgin database. CI always has virgin containers, so the correction is the
   missing `db:migrate`, not a test change.

### 7.10 Measurements at this commit

| | production | development |
|---|---|---|
| components | **195** | **294** |
| graph edges | **290** | **446** |
| subject to root edges | **4** | **5** |
| total edges reconciled | **294** | **451** |
| peer-variant / patched | 10 / 0 | 16 / 0 |
| platform-excluded | 36 | 60 |
| unresolved references | 0 | 0 |

Scope membership — production
`{dependencies+optionalDependencies: 146, dependencies: 49}`; development
`{dependencies+devDependencies+optionalDependencies: 28, dependencies+optionalDependencies: 123, dependencies: 45, devDependencies+optionalDependencies: 17, devDependencies: 81}`.

C15: 8 steps / 6 blocking in a git worktree, 16 image findings all governed, 0 unmatched,
0 unused, trivy cache **unchanged** across the authoritative scans.

### 7.11 Controls

| Suite | Tests |
|---|---|
| `c16-closure-controls.test.ts` | **84** |
| `c16-lockfile-fixtures.test.ts` | **49** |
| `c15-runner-behaviour.test.ts` | **12** (each SPAWNS the real runner) |
| `c15-scanner-provenance.test.ts` | **34** |
| `supply-chain-artifacts.test.ts` | **10** |
| `supply-chain.test.ts` | **39** |

The behavioural suite executes the gate against a planted secret, a bad tool pin, an
expired disposition, a widened disposition, fake evidence, a self-approved disposition, a
removed disposition (ungoverned finding), an unused disposition, a resurrected
`.trivyignore`, and both final-source violations — plus a positive run asserting 8 steps,
6 blocking, cache unchanged.

### 7.12 Still open

C17, C18, C19, the freeze protocol and external independent review remain pending. Phase 0
remains unapproved. No independent approval, frozen status or final readiness is claimed.


---

## 8. C16-R3 REMEDIATION RECORD — final fail-closed C15/C16 closure

Hosted run `31544091029` (all three jobs green) is retained as valid preliminary evidence
and none of its fixes were discarded. Independent adversarial testing then found remaining
**false-PASS and false-FAIL paths**. This section is authoritative where it conflicts with
§5, §6 or §7.

### 8.1 The defect that made final evidence impossible

`safeGit()` returned `git rev-parse HEAD` **including its trailing newline**, so the
recorded source SHA was `"<sha>\n"` while `--expected-sha` was `"<sha>"`. The correct SHA
therefore compared **unequal to itself** and final mode could never succeed — a false FAIL
that silently blocked every final-evidence run while looking like a legitimate refusal:

```
--expected-sha 6324d0a99cf353a19bd6cb40f875c859e9cca511 does not match HEAD 6324d0a99cf353a19bd6cb40f875c859e9cca511
```

Both runners now normalise git output at the single point where it enters the program.
Trimming per call site is how one gets missed.

### 8.2 A nonzero scanner exit always blocks

The image step carried an unconditional `rec.failed = false`, justified as "findings are
expected". But the image command deliberately omits `--exit-code`, so findings alone return
zero — which means **every** nonzero status was a scanner failure, and all of them were
being discarded. A crashed or partially-written scan looked like a clean pass as long as
its stdout happened to parse. Parseable output is not evidence that a scan completed.

Now: any nonzero exit is a blocking failure, findings from that run are **not ingested**,
and the raw stdout, stderr and exit status are preserved and digested. Proven by a fake
trivy that reports the correct version, emits syntactically valid JSON and exits 3.

### 8.3 Checks-bundle byte integrity

The fingerprint hashed only the checks-bundle **file count and total bytes**, so replacing
a rego check with different bytes of the same length was invisible. It is now a
deterministic recursive manifest — cache-relative path, size and SHA-256 for every file,
sorted, then hashed. Measured on the real cache: **641 files individually digested**.

Controls prove an equal-length edit, a swap of two files, and an equal-length
vulnerability-DB edit each change the fingerprint and fail before/after equality.

Acquisition also hardened: a nonzero vulnerability-DB or checks-bundle acquisition is now
fatal **even when an older cache exists** (otherwise the scan runs against whatever stale
data happens to be present), and complete stdout/stderr are written and digested rather
than a four-line tail.

### 8.4 Exact governed dispositions

A record must now match **every** consequence-relevant field: advisory id, exact configured
image digest, exact resolved platform, package name, exact canonical PURL, installed
version, severity and trivy result target. `package_purl_prefix` is rejected outright — a
prefix can match a different installed version, which is a different finding.

`HIGH_AND_CRITICAL` is gone. `severities` is an explicit governed array, and the single
CRITICAL advisory (`CVE-2025-68121`) now carries **its own record** (`SCX-0003`) so a
disposition approved for HIGH cannot absorb a CRITICAL. Measured: **16 findings governed by
3 records, 0 unmatched, 0 unused.** Near-miss detail is recorded so a reviewer sees *why* a
record failed to govern a finding.

Controls prove rejection of: platform mismatch (a `linux/arm64` record cannot govern a
`linux/amd64` finding), severity escalation, result-target mismatch, installed-version
mismatch, an ambiguous composite severity label, missing/changed evidence, and unknown,
duplicate, expired, stale, unused or overbroad records.

### 8.5 Always-written failure evidence

There was **no** working top-level handler: the R2 edit's anchor silently failed to match,
leaving a bare `main();`. So `--trivy-cache` with no value threw `ERR_INVALID_ARG_TYPE`
before any output directory existed and the run produced **nothing at all**.

Now: validated argument parsing (`parseArgs`) rejects unknown flags, valueless flags and a
malformed `--expected-sha`; governed JSON is read through a precise, catchable reader; and
an outermost boundary always attempts to write `supply-chain-manifest.json` and
`RESULT-FAIL.txt` carrying the sanitized exception type and message, the available source
SHA, the exact arguments, a timestamp and any diagnostics already collected. Every step on
that path is individually guarded so a secondary fault cannot destroy the primary
diagnosis.

### 8.6 Executed-binary authentication

A `--version` string is a claim a binary makes about itself. The pins now carry, per tool
and platform, both the release **archive** digest and the **extracted executable** digest;
the installer verifies both; and the runner independently digests the executable it
actually resolves on PATH and refuses to scan on any mismatch.

This is not theoretical: the Homebrew builds of trivy and gitleaks report the correct
versions with **different bytes** and are correctly rejected. Running the gate requires the
authenticated upstream artifacts (`scripts/gate/install-scanners.sh`).

For OCI resolution, the SHA-256 of the raw returned index manifest is verified to equal the
digest in the configured reference **before any child digest is trusted**. Confirmed on
both images: `raw index digest MATCHES the pinned reference`.

### 8.7 Exact metadata reconciliation

`Object.fromEntries` collapsed `metadata.properties`, keeping only the last occurrence — so
a duplicate binding simply disappeared. Properties are now preserved as a **multiset**:
identical duplicates, conflicting duplicates inserted before *or* after the legitimate
value, missing bindings and unknown bindings are all rejected, with dedicated controls for
duplicate `eye:source-sha`, `eye:lockfile-sha256`, `eye:descriptor-sha256` and
`eye:generator-sha256`.

Top-level document identity is now reconciled too: `bomFormat`, `specVersion`, document
`version`, the deterministic `serialNumber`, the absence of `metadata.timestamp`, and the
subject's `bom-ref`, name, version, type, PURL and description.

### 8.8 Governed component types are validated

The descriptor declared an `allowed_types` list that nothing enforced; the builder checked
only that a mapping existed. The allowed set is now **code-owned**
(`ALLOWED_COMPONENT_TYPES`) and passed into closure construction, so a mapped value outside
it fails **before serialization**. A control uses `not-a-cyclonedx-type`.

### 8.9 Optional-dependency accuracy — and a corrected count

The previous control asserted `toContain('optionalDependencies')`, which passes even when
the component *also* wrongly claims `dependencies`. Scope is now modelled as a **channel**
(production or development) plus an **optionality bit**, propagated as a token to a fixed
point:

| path | scope set |
|---|---|
| production, mandatory | `dependencies` |
| production, optional | `optionalDependencies` **only** |
| development, mandatory | `devDependencies` |
| development, optional | `devDependencies` + `optionalDependencies` |

Optionality is contributed by an `optionalDependencies` edge **or** by the child snapshot's
own `optional: true` marker — **79 snapshots in this lockfile carry that flag** and it was
being ignored entirely. Every assertion is now exact set equality, with fixtures for
optional-only child and grandchild, a mandatory+optional dual path, a development-only
linked workspace, a snapshot marked `optional: true`, and an optional native subtree.

**Truthfully changed counts.** Production scope membership went from
`{dependencies+optionalDependencies: 146, dependencies: 49}` to
`{dependencies+optionalDependencies: 131, dependencies: 49, optionalDependencies: 15}` —
15 production components were previously mislabelled as mandatory. Development gained
9 optional-only components. Component and edge totals are unchanged.

### 8.10 Evidence completeness

Every raw artifact is bound into the manifest by relative path, size and SHA-256: gitleaks
JSON reports, trivy table/JSON reports, scanner-acquisition logs, image findings, and the
result files. Measured: **23 artifacts bound** in a local run. The isolated trivy cache is
excluded by design — its identity is already bound by the byte-level cache fingerprint.

### 8.11 Defects discovered during this correction

1. `safeGit()` newline — final mode could never succeed (§8.1).
2. Unconditional `rec.failed = false` discarded every image-scan failure (§8.2).
3. The checks-bundle fingerprint was count-and-size, blind to equal-length edits (§8.3).
4. `HIGH_AND_CRITICAL` let a HIGH approval absorb a CRITICAL (§8.4).
5. **The R2 top-level handler never existed**: the string anchor silently failed to match,
   leaving a bare `main();`. A lesson about unasserted replacements — the R2 pass used
   `str.replace` without verifying the anchor.
6. Executable digests were parameterised but never supplied, so binary authentication was
   dead code (§8.6).
7. `Object.fromEntries` collapsed duplicate metadata bindings (§8.7).
8. `allowed_types` was declared but unenforced (§8.8).
9. Snapshot-level `optional: true` was ignored on 79 snapshots (§8.9).
10. **My own new bug, caught by running it:** the binary-authentication check read
    `actual.sha256` while `scannerBinaries()` returns `binary_sha256`, so it always
    reported "(unreadable)" and always failed — a false FAIL that would have blocked every
    run. Found by executing the gate, not by reading the diff.
11. Local Playwright fails when the DB suites run first and consume the one-shot bootstrap;
    10/10 on a virgin database. CI always has virgin containers.

### 8.12 Measurements at this commit

| | production | development |
|---|---|---|
| components | **195** | **294** |
| graph edges | **290** | **446** |
| subject to root edges | **4** | **5** |
| total edges reconciled | **294** | **451** |
| platform-excluded | 36 | 60 |
| unresolved references | 0 | 0 |

Scope membership — production
`{dependencies+optionalDependencies: 131, dependencies: 49, optionalDependencies: 15}`;
development `{dependencies+devDependencies+optionalDependencies: 22,
dependencies+optionalDependencies: 114, dependencies: 45,
devDependencies+optionalDependencies: 23, devDependencies: 81, optionalDependencies: 9}`.

C15: 8 steps / 6 blocking, 16 findings governed by 3 records (0 unmatched, 0 unused), raw
index digests match both pinned references, executable bytes authenticated for both
scanners, trivy cache unchanged across the authoritative scans, 641 checks files digested.

### 8.13 Controls

| Suite | Tests |
|---|---|
| `c16-closure-controls.test.ts` | **109** |
| `c16-lockfile-fixtures.test.ts` | **54** |
| `c15-runner-behaviour.test.ts` | **28** (each SPAWNS the real runner) |
| `c15-scanner-provenance.test.ts` | **45** |
| `supply-chain-artifacts.test.ts` | **10** |
| `supply-chain.test.ts` | **39** |

### 8.14 Still open

C17, C18, C19, the freeze protocol and external independent review remain pending. Phase 0
remains unapproved. No independent approval, frozen-product status or Phase 0 completion is
claimed, and C17 does not begin until this correction has been independently reviewed.


---

## 9. C16-R3.1 REMEDIATION RECORD — bounded fail-closed corrections

Hosted run `31578753090` (3/3 green, both runners in final mode) is retained as valid
preliminary evidence. Independent adversarial testing then found the remaining bypasses
below. This section is authoritative where it conflicts with §5–§8.

### 9.1 Closure map

| # | Finding | Correction | Proof |
|---|---|---|---|
| 1 | `name in bindings` consults the PROTOTYPE CHAIN, so `toString`, `constructor` and `__proto__` all answered true and passed as governed metadata | null-prototype governed map + `Object.hasOwn()` for metadata AND component properties | 6 mutation controls (3 names × metadata/component) |
| 2 | A DIRECT importer dependency whose snapshot carries `optional: true` was seeded MANDATORY, and if platform-incompatible failed as required | optionality is determined BEFORE scope seeding and platform handling; `optional_source` records whether the edge or the snapshot flag applied | 4 fixtures: compatible, incompatible-optional, incompatible-required, edge-declared |
| 3 | The final-manifest assertion accepted any status *beginning* with `FINAL`, an EMPTY C16 target set and an EMPTY authenticated-tool set | exact code-owned constants; target set DERIVED from the descriptor; tool set DERIVED from the pins; every required report/artifact/reconciliation/binding required by name | 13 controls incl. forged status, missing/extra/empty target, empty/partial tool set, missing artifact |
| 4 | Dispositions had no byte-level evidence binding, and the matcher was TYPE-GATED so a string `severities` or numeric `result_target` skipped matching | mandatory `evidence_sha256` (lowercase 64-hex, recomputed from tracked bytes); code-owned `FIELD_TYPES` for all 17 fields, wrong type is FATAL; matching is unconditional and FAILS CLOSED on a wrong type | 11 behavioural + 7 unit controls |
| 5 | `evidence_sha256: 123` skipped both format validation and the recompute | strict `typeof === 'string'` + lowercase-hex format + UNCONDITIONAL recompute | 6 controls incl. one-byte change |
| 6 | C16 could fail before writing ANY evidence — gitless final mode left the output directory empty | validated argument parsing + outermost boundary; every failure path writes a structured manifest and `RESULT-FAIL.txt` with source/expected SHA, mode, phase, error category, timestamp and bound artifacts | verified for gitless final mode, wrong SHA, dirty tree, malformed args |
| 7 | The runner probed `--version` and warmed the cache — both of which EXECUTE the binary — BEFORE authenticating its bytes | resolve → digest → compare → STAGE a private per-run copy; every later invocation uses that absolute path; re-verified after all scanning; worktree cleanliness re-checked as a DELTA | a same-version wrong binary is rejected with its execution marker absent and `steps: []` |
| 8 | Artifact bindings were computed BEFORE the result receipt was written, so `RESULT-PASS/FAIL.txt` was never bound | receipt FIRST, then inventory, then manifest — on the success, governed-failure and crash paths | 3 controls asserting only `supply-chain-manifest.json` is unbound |

### 9.2 The severity bypass that survived the first fix

Removing the `Array.isArray` guard was not enough. `'HIGH'.includes('HIGH')` is **true** for
a string, so a wrong-typed `severities` still matched. The comparison now fails closed on a
non-array rather than coercing — caught by running the unit control, not by reading the
diff.

### 9.3 Dedicated disposition evidence

`docs/SCANNER_DISPOSITIONS.md` replaces the generic `PHASE0_EVIDENCE.md` citations. It
identifies, for every governed finding: the configured reference, the index kind and child
count, the resolved platform, the scanned child digest, the index-integrity check, the
scanner and vulnerability-database identity with freshness ceiling, the checks-bundle OCI
digest, the scan mode, and per-record advisory ids, package, PURL, installed version,
severity, result target, reason, compensating controls, owner, approver, approval and
expiry — plus an explicit prohibited-exposure section. Every record binds it by SHA-256 and
the gate recomputes that digest from the tracked bytes on each run.

The three records are now `SCX-0001` (c-ares HIGH), `SCX-0002` (14 Go stdlib HIGH) and
`SCX-0003` (the single Go stdlib CRITICAL, held separately so a HIGH approval cannot absorb
a CRITICAL). Earlier sections state **two** records; three is correct.

### 9.4 Corrected stale statements

* `.trivyignore` is deleted; §7.4 already says so, and the acceptance gate asserts its
  absence.
* "governed by 2 records (SUPERSEDED: 3 records since C16-R3.1 — see §9.3)" in §7.4 and §8.4 → **3 records** (the CRITICAL was split out).
* Scope counts in §5.3/§6.3/§7.10 are superseded by §8.12; C16-R3.1 leaves them unchanged
  (production 195/290+4, development 294/446+5; production membership
  `{dependencies+optionalDependencies: 131, dependencies: 49, optionalDependencies: 15}`).
* Disposition evidence references `PHASE0_EVIDENCE.md` → `docs/SCANNER_DISPOSITIONS.md`.

Full C19 document reconciliation remains in C19.

### 9.5 Suites at this commit

typecheck **0**; build **0**; boundaries clean (93 modules, 250 dependencies); contracts
**203/203**; tokens **3/3**; api gate+unit **364/364** (gate suites alone **350**);
integration **297/297**; acceptance **58/58**; Playwright **10/10** on a virgin database.

Migrations `0001`–`0021` byte-identical to `e3a0b1f`, proven directly rather than by a
digest whose construction a reviewer would have to guess:
`git diff --name-only e3a0b1f HEAD -- apps/api/migrations` returns **0** files over all 21.
The earlier sections quote a "tree digest" without stating how it was built; where a digest
is wanted, the reproducible form is
`git ls-tree -r HEAD apps/api/migrations | shasum -a 256` =
`47a651c95228429a5f10c497dfbd5b4a3588bce7256af65f0c90554bf3b5baca`.

C15 and C16 were then re-run in `--final --expected-sha` mode from a fresh clone with all
outputs written **outside** the repository, against a cold trivy cache; the clone's worktree
was clean afterwards and `assert-final-manifests.mjs` accepted both manifests.

### 9.6 The evidence package had to verify before it could be evidence

The first fully green hosted run at `2abd959` published a ZIP whose own `SHA256SUMS.txt`
listed **itself**. The manifest was produced by redirecting `find` output straight into the
bundle, so the empty file existed before `find` walked the tree and the manifest recorded
the digest of its own zero-byte self. Every reviewer running `sha256sum -c SHA256SUMS.txt`
therefore got `SHA256SUMS.txt: FAILED`, and an evidence manifest that always fails cannot
be distinguished from corrupted evidence — which defeats the only purpose the package has.

The packaging logic moved out of the workflow into the tracked
`scripts/gate/package-evidence.sh`, for the same reason `install-scanners.sh` did: shell
that only ever executes on a hosted runner cannot be exercised by a behavioural control,
and asserting anything about the YAML would have been a source-string assertion. The script
builds the manifest outside the bundle, excludes it from its own listing, and **refuses to
produce a ZIP whose manifest does not verify**. The workflow additionally unpacks the exact
archive it is about to upload and re-verifies it, so the digest in the run summary describes
an archive a reviewer can check rather than one that merely got written.

Seven controls in `supply-chain-artifacts.test.ts` execute that script directly: name and
digest binding, no self-entry, bidirectional manifest completeness, a real `sha256sum -c`
run with no `FAILED` line, cache/staged-binary exclusion, a one-byte tamper that must fail,
and refusal of a malformed source SHA. Reverting the script to the defective form turns
three of them red, so they reproduce the actual defect rather than describing it.

## 10. C16-R3.2 REMEDIATION RECORD — the verifier had to read the bytes

Items 1, 2 and 4–8 of C16-R3.1 independently pass and are not reopened. One defect
remained, and it was in the verifier itself.

### 10.1 The defect

`assert-final-manifests.mjs` validated CLAIMS ABOUT hashes without ever opening the files
those claims describe. An independent reviewer replaced every required C15 artifact and both
C16 SBOMs with the word `TAMPERED`, left the fabricated 64-character digests and byte counts
in the manifests, added an extra unbound output, and `assertFinalManifests()` returned **no
problems**. A verifier that trusts the manifest it is verifying is a transcription check.

Two further vacuous passes came from deriving an expectation from a source the same party
controls: the expected target set was read from the descriptor and compared to the report, so
a descriptor with **zero** targets matched a report with zero targets; and the
authenticated-scanner set was a hardcoded pair rather than the pinned set, so a third scanner
could be pinned — and therefore executed — with no authentication evidence at all.

### 10.2 Closure map

| # | Required | Correction | Proof |
|---|---|---|---|
| 1 | Re-read every bound C15/C16 artifact from disk | `verifyBindings()` opens each binding and recomputes it | 29 controls; the untampered fixture still passes both verifiers |
| 2 | Path safety, regular file, exists, length, digest | 5 checks per binding: `pathProblem()` (relative, normalized, no `..`, no absolute, no `~`, no NUL), `lstat` symlink and regular-file test, existence, exact byte length, recomputed SHA-256 | symlink, 4 traversal forms, missing file, wrong size, wrong digest, same-length tamper |
| 3 | Reject duplicates, phantoms, missing, extra unbound, altered receipts / raw outputs / SBOMs | duplicate-path set; phantom detection via `lstat`; `walkFiles()` inventory comparison including nested directories | one control each, plus the reviewer's combined scenario |
| 3 | Only the documented root manifest, cache and staged-scanner dir may be excluded | `C15_UNBOUND_ALLOWED` / `C16_UNBOUND_ALLOWED` as frozen code-owned lists | a file added inside the cache dir stays excluded while a nested output is caught |
| 4 | Per target: recompute the SBOM digest, require equality with `sbom_sha256` **and** its binding, require receipt and SBOM bound | three independent comparisons against the same recomputed digest | modified SBOM bytes reported against both claims; a correct-but-unbound SBOM fails |
| 5 | Exact nonempty `{production, development}` in descriptor **and** report | `PHASE0_TARGET_IDS` owned by the verifier; the descriptor is checked against it, not used as it | empty descriptor, partial set, additional target |
| 6 | Scanner set from `Object.keys(pins.tools)`, nonempty, includes gitleaks and trivy, all authenticated-before-execution | `pinnedScannerNames()` + `MANDATORY_SCANNERS` + per-tool `authenticated_before_first_execution` | added unauthenticated pin, dropped mandatory scanner, empty pin set, authentication-after-execution |
| 7 | `tree_clean_after_scanning`, `worktree_unchanged_by_scanning`, staged post-scan digests, before/after cache digests agree | four explicit requirements; the cache digests are compared directly rather than trusting `trivy_cache_unchanged` | one control each, including a manifest whose boolean claims unchanged while the digests disagree |
| 8 | Executable mutation controls, each failing against the defective behaviour | `apps/api/test/gate/final-manifest-verifier.test.ts`, 29 controls | see 10.3 |
| 9 | `PROGRESS.md` api gate+unit count | corrected to the measured figure | 10.4 |

### 10.3 Why the controls are not decorative

Every mutation control executes **two** verifiers: the corrected one, and
`apps/api/test/gate/fixtures/assert-final-manifests.r31-frozen.mjs` — a byte copy of the
R3.1 verifier with only its CLI guard removed. Each control asserts that the corrected
verifier rejects the mutation *and* that the frozen defective verifier accepts it. A control
that only showed the new code rejecting something could not distinguish a closed defect from
a check that already existed.

One control reproduces the reviewer's scenario in full — every required artifact and both
SBOMs replaced with `TAMPERED`, fabricated claims retained, an extra unbound output added —
and asserts the frozen verifier returns `[]` before asserting the corrected one names every
tampered file individually.

The R3.1 control suite's own "POSITIVE: a fully correct pair passes" fixture claimed
`sha256: 'cccc…'` for every artifact while writing the single byte `x`, and the old assertion
called that fully correct. That fixture now generates its bytes first and derives every
digest and length from them, so a control that mutates a claim mutates it away from bytes
that genuinely exist.

### 10.4 Suites at this commit

typecheck **0**; build **0**; boundaries clean (94 modules, 253 dependencies); contracts
**203/203**; tokens **3/3**; api gate+unit **393/393** (gate suites alone **379**);
integration **297/297**; acceptance **58/58**; Playwright **10/10** on a virgin database.

`PROGRESS.md` said api gate+unit **354/354**. The review named 364/364, which was the
verified figure at `28b60e8`; this correction adds 29 verifier controls, so the count measured
at this commit is **393/393** and that is what the document now records — the measured number,
not the quoted one.

Migrations `0001`–`0021` byte-identical to `e3a0b1f`:
`git diff --name-only e3a0b1f HEAD -- apps/api/migrations` returns 0 files.

## 11. C16-R3.3 REMEDIATION RECORD — FINAL ASSERTION CLOSURE

Independent review confirmed the R3.2 evidence package at `32adf4f` is healthy: outer digest
matches, ZIP structure safe, internal checksums 29/29, all delivered artifacts verify, hosted
CI green at the exact SHA, migrations `0001`–`0021` unchanged. Items 1, 2 and 4–8 of R3.1 are
not reopened.

Six coordinated false passes remained in the verifier. All six shared one shape: R3.2
verified the bytes behind every *binding* and then trusted every *other* statement the
manifest made about itself.

### 11.1 Closure map

| # | False pass R3.2 permitted | Correction | Where |
|---|---|---|---|
| 1 | Step receipts were never read. A raw file and its binding could both be deleted while a step still referenced it; a tampered file whose binding was updated left a stale step hash nobody looked at; the step set was unconstrained, so a step could be missing, duplicated, renamed, demoted or added | exact normal-step set (6 named + one `trivy-image-<i>` per pinned image, validated as `name@sha256:<64hex>`), exact acquisition set, multiset comparison so a duplicate is distinct from an extra, per-step tool/policy/exit/signal/source-SHA, and a **three-way** stream check: bytes on disk = step receipt = artifact binding | `verifyStepClosure`, `verifyStepStreams` |
| 2 | The required inventory was ten hardcoded names, so any output not on that list could vanish | inventory **derived** from the step contract × 2 streams + acquisition contract × 2 streams + the image set + the governed reports — 24 entries for a 2-image run, matching the 24 a real run binds | `expectedC15Inventory` in `lib/final-assertion-contracts.mjs` |
| 3 | Scanner digests were compared pairwise, so forging `sha256_after` and `expected` together passed | one six-link chain — tracked pin → authenticated actual → authenticated expected → staged pre-execution → staged post-scan expected → staged post-scan actual — with **every link compared to the tracked pin**, never to its neighbour | `verifyScannerChain` |
| 4 | `trivy_cache_unchanged` and a caller-supplied top digest decided the cache question, so corrupt entry data behind an untouched digest passed | the fingerprint is **recomputed** exactly as `trivy-cache.mjs fingerprint()` builds it: per-entry validity, `checks_content.files`/`bytes`/`manifest_sha256`, the top-level digest, and canonical before/after identity | `recomputeFingerprint`, `verifyCacheProvenance` |
| 5 | Each SBOM was digested but never parsed or tied to the descriptor, so swapping the production and development records, or pointing both targets at the production SBOM, passed | target map key must own the descriptor identity; every declared field compared canonically; SBOM filenames unique per target; the SBOM is **parsed** and its `serialNumber`, subject `bom-ref`, description and nine `eye:*` properties checked against the descriptor and the expected source SHA | `verifyTargetIdentity` |
| 6 | Nothing lstat-ed the output roots or the two root manifests, so the whole package could be a symlink | `rootPathProblems` runs **first** and returns immediately; `readMember` lstats every intermediate directory inside the package and requires the resolved real path to stay within the resolved root | `rootPathProblems`, `readMember` |

### 11.2 What the controls actually prove — exact numbers

Two frozen byte copies of previous verifiers are tracked as fixtures, each with only its CLI
guard removed: `assert-final-manifests.r31-frozen.mjs` and `assert-final-manifests.r32-frozen.mjs`.
Both are given the real repository root explicitly, because their own `ROOT` resolves relative
to the fixtures directory and they would otherwise throw `ENOENT` and appear to reject
everything — which would have made every control look successful while proving nothing.

| suite | cases | exercise a frozen verifier | corrected-verifier only |
|---|---|---|---|
| `final-assertion-closure.test.ts` (R3.3) | 43 | **37** | 6 |
| `final-manifest-verifier.test.ts` (R3.2) | 29 | **22** | 7 |

Of the 37 in the R3.3 suite, **34 assert the frozen R3.2 accepted the mutation**. The other
three are recorded honestly rather than counted as fresh catches:

* the extra-unbound-output control — R3.2 already caught it;
* the before/after cache-difference control — R3.2 already compared the two *claimed* digests
  (the mutation it genuinely missed is the corrupted-entry case, where the claimed digests
  still agreed);
* the symlinked-intermediate-directory control — R3.2 rejects it for the **wrong reason** and
  with a misleading message (`reports is present but UNBOUND`), never identifying the symlink;
  the control asserts R3.2 does *not* mention SYMLINK, which is the gap being closed.

The 6 + 7 corrected-only cases assert properties of the contracts themselves (the derived
inventory's contents, malformed pinned-image lists, the code-owned Phase 0 set, pin-set
requirements) where there is no meaningful "frozen accepted it" claim to make.

### 11.3 Two fixtures that were themselves untrue

`c16-closure-controls.test.ts` and `final-manifest-verifier.test.ts` each built their own
partial manifests — no steps, no cache fingerprint, no descriptor identity — because the
verifier of the day looked at none of those. Both now mutate one **shared** fixture
(`test/gate/helpers/evidence-fixture.ts`) that satisfies the full R3.3 contract with every
digest computed from bytes it writes and every identity read from the real tracked descriptor
and pins. This is the same defect class as R3.2's `sha256: 'cccc…'` fixture, found in two more
places.

### 11.4 Honest limits, stated not hidden

* **Cache bytes are not shipped.** The trivy DB alone exceeds a gigabyte, so per-entry hashes
  cannot be recomputed from cache bytes inside the evidence package. Every aggregate the
  manifest derives from those entries *is* recomputed, which is what closes the false pass.
* **Ancestors above the output root are not symlink-checked.** The caller names the root, and
  on macOS `/tmp` and `/var` are themselves symlinks, so walking to the filesystem root would
  reject every legitimate run. Containment is enforced instead: each artifact's resolved real
  path must lie inside the root's resolved real path.
* **One target-record key is allowed without being declared per target.**
  `generate-closures.mjs` legitimately merges the descriptor's top-level `integrity_rules`
  into each record; `TARGET_RECORD_MERGED_KEYS` names it and nothing else, and an undeclared
  field is refused.

### 11.5 Suites at this commit

typecheck **0**; build **0**; boundaries clean (96 modules, 260 dependencies); contracts
**203/203**; tokens **3/3**; api gate+unit **436/436** (gate suites alone **422**);
integration **297/297**; acceptance **58/58**; Playwright **10/10** on a virgin database.

Migrations `0001`–`0021` byte-identical to `e3a0b1f`:
`git diff --name-only e3a0b1f HEAD -- apps/api/migrations` returns 0 files.

The evidence archive is now named `c16-r33-final-evidence-<sha>.zip` — R3.2's archive was
still named `r31`, which misdescribed what it certified.

### 11.6 Deferred to the C19 / freeze ledger

Recorded here so they are not lost, and explicitly NOT part of this patch: protecting `main`
with required checks; a signed immutable release tag or signed provenance attestation;
publishing final evidence at a durable, anonymously downloadable location; and removing the
dependency on expiring authenticated GitHub Actions artifact downloads.

### 11.7 Still open

C17, C18, C19, the freeze protocol and external independent review remain pending. Phase 0
remains unapproved; the source is not frozen; no independent approval is claimed.

---

### 10.5 Still open

C17, C18, C19, the freeze protocol and external independent review remain pending. Phase 0
remains unapproved; the source is not frozen; no independent approval is claimed.

---

### 9.7 Still open

C17, C18, C19, the freeze protocol and external independent review remain pending. Phase 0
remains unapproved; the source is not frozen; no independent approval is claimed.

---

## 12. C16-R3.4 — SOURCE-ANCHORED EVIDENCE RECONSTRUCTION (delivered)

**Candidate `dab1e12335df455a912e0a73bc42c3d5bcc672dd`** · hosted run `31729347279` (3/3 green)
· archive `c16-r34-final-evidence-dab1e12335df455a912e0a73bc42c3d5bcc672dd.zip`,
215,561 bytes, SHA-256 `bccea23696f100b9f03e05a23be44911f5a2857a548f6714f3b31e193ccbe5ae`.

**The rule.** No evidence value may define the expectation used to validate itself. Images come
from `docker-compose.yml` cross-checked against `conformance.manifest.json`; the step set from
the source image count; argv from a tracked normalized contract; cache paths from a code-owned
set with every aggregate recomputed; the inventory derived and required to EQUAL the bindings;
C15 findings reconstructed from the delivered raw trivy bytes; C16 closures re-derived from
`pnpm-lock.yaml` by the same pure function the generator calls, with SBOMs compared byte for byte.

**Hermetic harness.** Every external effect crosses `lib/execution-adapter.mjs`. The 44 C15
behavioural controls replay a recorded real trace: 492 s live → 169 s offline, 44/44. `--final`
refuses every test seam before staging or any scan. Hermeticity is proved by a poison PATH, not
by grep: `live_network_calls = 0`, `live_scanner_processes = 0`, with a control firing a shim to
prove the shims are armed.

**Two defects found by this round's own process, both corrected.**
1. A test overwrote the tracked `scanner-exclusions.json` and was killed before its `finally`;
   the governed file stayed corrupted and reddened later runs. No test now writes a tracked
   governance file, proved by SIGKILLing a mutation child and showing all eight governed digests
   unchanged. Recorded in full in `EXCEPTIONS.md` G3 — the earlier "cause unknown" is corrected.
2. `<REPO_ROOT>` was tokenized from the verifier's own root, so the delivered hosted package
   failed when verified from a different checkout — the reviewer case. The producer's repository
   root is now derived by shape and cross-checked across steps.

**Suites.** gate 494/494 offline in 172 s; api gate+unit 508/508; contracts 203/203; tokens 3/3;
integration 297/297; acceptance 58/58; Playwright 10/10 on a virgin database; typecheck 0;
build 0; boundaries clean. Migrations `0001`–`0021` byte-identical to `e3a0b1f` (0 files).

**Still open.** C17, C18, C19, the freeze protocol and external independent review. Node-20
action replacement, branch protection, signed freeze provenance and durable public artifact
hosting remain C19. Phase 0 is not approved; the source is not frozen.
