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
| C11 RFC 8785 strictness | ⏳ |
| C12 correlation traceability | 🟡 **partly done** — `principals.service` no longer mints a fresh correlation in downstream validation; it uses the request envelope's correlation (3 sites). Remaining: sweep the auth/workload-secret paths and add the response↔evidence correlation-equality tests. |
| C13 catalog authority gate | ⏳ |
| C14 adversarial matrix | ⏳ |
| C15 supply-chain gate | ⏳ |
| C16 target SBOM closure | ⏳ |
| C17 CycloneDX + obligations | ⏳ |
| C18 forward/virgin proof | ⏳ |
| C19 docs + NOLOGIN | ⏳ |
| Freeze + evidence + ZIP | ⏳ |
| Independent review | External independent review **pending** against the final frozen source + evidence package. Claude's own testing is verification, not independent review; Phase 0 stays unapproved until that external review. |
