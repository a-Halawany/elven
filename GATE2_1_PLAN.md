# THE EYE — Phase 0 Gate-2.1 Plan: final authority-boundary closure

> **Scope:** bounded correction of the executable authority bypasses found by the
> independent review of `SOURCE_CANDIDATE_SHA=2deded44904e5a4ec264938085c2aaa93d9636b6`
> (`EVIDENCE_ATTESTATION_SHA=09ab1144d04ada7dcd3a159c3ba03a7f94751c18`,
> archive `b45025adedb1f8e97f34855ddfea4914537f3b3d1c25a444bd5ca90ce051e81e`).
>
> **Phase 1 remains unapproved. No Phase 1 application code.** EXC-P1-001/002 stay `proposed`.
>
> **Preserved as instructed:** the archive/bundle/source-evidence separation, the
> 144-file manifest, the source archive digest, the clean typecheck, the build,
> the unit suites and the dependency audit. Also preserved from Gate-2: the atomic
> commit path, verify/seal locking, the 43-field canonical digest binding, image
> digest pinning, and the cumulative Phase 1 plan.

---

## A. Findings acknowledged — verified in the source, with affected files

Each finding below was reproduced against the reviewed candidate before planning.
None is disputed.

| # | Finding | Confirmed at | Affected files |
|---|---|---|---|
| 1 | `eye_commit` (and publisher/verifier/identity/recovery) can call `ctx.issue_system` and obtain unrestricted PLATFORM authority from free text | `0009` L396 grant | `apps/api/migrations/0009_privilege_separation_and_bound_context.sql`; consumers: `src/pipeline/pipeline.service.ts`, `src/pipeline/auth.controller.ts`, `src/audit/audit.service.ts`, `src/objects/outbox.publisher.ts`, `src/bootstrap/run-bootstrap.ts`, `test/int/helpers.ts` |
| 2 | `eye_commit`/`eye_identity` retain direct `INSERT` on `audit.audit_events` and `policy.policy_decisions` and direct EXECUTE on `advance_chain_head`/`commit_chain_head` | `0010` L726–730 | `apps/api/migrations/0010_bound_evidence_and_admission_ports.sql` |
| 3 | `eye_verifier` can execute `audit.commit_event` (append arbitrary audit events) | `0010` L117 | `0010` |
| 4 | `eye_publisher` holds general `UPDATE` on `objects.object_outbox`, bypassing CAS | `0010` L738 | `0010`, `src/objects/outbox.publisher.ts` |
| 5 | Evidence mode reaches PLATFORM business mutations: business ports test `eye_scope()='PLATFORM'` directly instead of requiring `authority` mode | `0010` L329 (admission), L466 (`create_tenant`), L488 (`create_principal`) | `0010`, `0009` (`eye_row_writable`) |
| 6 | Context expiry uses transaction-stable `now()`, so a context never expires inside a long transaction | `0009` L199 accessor; L272/L372/L414 issuance | `0009` |
| 7 | A minted context stays usable after concurrent session revocation, binding removal or credential rotation — accessors verify only signature/PID/txid/expiry, with **0** session or epoch lookups | `0009` accessor body | `0009`, `0010` (ports must recheck) |
| 8 | Controller-edge validation still throws without durable evidence — **15** direct `HttpException` throws at the edge and **15** in-handler `bad()` throws | grep over controllers/services | `src/pipeline/admin.controllers.ts`, `src/objects/objects.controller.ts`, `src/tenancy/tenancy.controller.ts`, `src/pipeline/auth.controller.ts`, `src/pipeline/http.ts` (filter), `src/objects/objects.service.ts` |
| 9 | `canon.jcs` is **not** RFC 8785: it rejects non-integral numbers and non-ASCII keys by design, yet is labeled as the canonicalizer | `0009` L80, L100 | `0009`, `packages/contracts/src/jcs.ts`, `packages/contracts/test/` |
| 10 | Executable migration-password fallback `?? 'eye_local_dev'` still present | `apps/api/scripts/migrate.mjs` L21 | `apps/api/scripts/migrate.mjs` |

**Additional defects found while verifying (in scope for §9 of the instruction):**

| Extra | Defect | Location |
|---|---|---|
| E1 | Literal placeholder `GATE_CANDIDATE_SHA` still in a controlled record | `PROGRESS.md` L17 |
| E2 | Documented evidence file is absent from the attestation | `evidence/clean-checkout-transcript.txt` referenced by `PHASE0_EVIDENCE.md` §A.9 |
| E3 | Manifest reproduction command corrupted by absolute-path interpolation (`git show /Users/.../<sha>`) | `evidence/tracked-source-manifest.sha256` L2 |
| E4 | Licence allowlist checks production only (`pnpm licenses list --prod`) | `scripts/license-inventory.mjs` L17 |
| E5 | Playwright's inline secret loader omits the commit/identity/publisher/verifier/recovery authorities and duplicates the canonical loader | `playwright.config.ts` L14–15 |
| E6 | Controlled records still describe the superseded app-role INSERT model in places | `PHASE0_REPORT.md`, `PROGRESS.md`, `conformance.manifest.json` |

---

## B. Corrections (bounded work items)

Delivered as **governed forward migrations `0011` and `0012`**; `0001`–`0010` stay
byte-identical so every applied digest remains valid. No rebaseline.

### C1 — Remove direct authoritative privileges (findings 1–4)
* Revoke from `eye_commit`/`eye_identity`: `INSERT` on `audit.audit_events`,
  `policy.policy_decisions`; EXECUTE on `advance_chain_head`, `commit_chain_head`.
* Revoke `eye_commit` direct `INSERT` on `tenancy.*`, `objects.canonical_objects`,
  `objects.object_outbox`.
* Revoke `eye_identity` direct DML on `principals`, `role_bindings`,
  `credentials`, `sessions`, `refresh_tokens`.
* Revoke `audit.commit_event` from `eye_verifier`.
* Revoke general `UPDATE` on `object_outbox` from `eye_publisher`.
* `ENABLE` **and** `FORCE` RLS explicitly on every intended table (FORCE alone is
  inert where RLS was never enabled).
* Sweep `PUBLIC`, `eye_system` and every unrelated runtime role off all
  authoritative tables and functions.
* All runtime writes go through narrowly typed role-specific definer ports only.

### C2 — Bounded transactional capabilities (finding: raw tx handed to handlers)
* Replace the raw Kysely transaction passed to business handlers with **typed
  capability objects** exposing only the ports that route declares
  (`src/shared/capabilities.ts`), so a handler cannot reuse the transaction for
  unrelated ports or raw SQL.
* `src/pipeline/pipeline.service.ts`, `objects.controller.ts`,
  `tenancy.controller.ts`, `admin.controllers.ts` adopt the capability signature.

### C3 — Eliminate the universal system context (finding 1, §2)
* Delete `ctx.issue_system(reason)`. Replace with **operation-specific**
  capability minters, each grantable to exactly one role and each binding
  action + target + correlation + policy decision + bundle version + operation
  class + session/principal/scope + purpose + consequence class:
  `ctx.issue_publish`, `ctx.issue_verify`, `ctx.issue_identity_op`,
  `ctx.issue_commit` (bound to the authenticated request and PDP result),
  `ctx.issue_bootstrap` (single-use, claim-gated).
* Ports assert the bound action matches the operation being attempted: the same
  context cannot authorize a different operation inside the transaction.

### C4 — Genuinely capability-free evidence mode (§3)
* `ctx.issue_evidence` derives the subject from the live session, validates the
  requested scope against subject **and** attempted route, and rechecks session
  state, bound epoch and bootstrap assurance.
* Evidence mode may call only typed denial/failure evidence ports; `allow`/
  `success` evidence is rejected unless emitted by the corresponding completed
  governed operation.
* Every business port requires `eye_ctx_mode()='authority'` **plus** the bound
  action — including the PLATFORM shortcuts in tenant, domain, principal and
  canonical admission. System and evidence modes fail.
* New DB constraint/port check linking each request AUD row to its POL row by
  principal, action, scope, correlation, decision, outcome and bundle version.

### C5 — Correct expiry and revocation semantics (§4, findings 6–7)
* `clock_timestamp()` for issued-at and expiry everywhere.
* Every authoritative port revalidates at the write boundary: active session,
  session expiry, active principal, current revocation epoch, current qualifying
  binding, credential/session rotation state.
* Honest description: the context is **transaction-bound**; the nonce is only
  called single-use where the nonce row is actually consumed and consulted — this
  pass makes consumption real, or the claim is removed from every document.

### C6 — Close identity and metadata leakage (§5)
* `auth_principal`, `auth_bindings`, `session_get_active` bound to the verified
  caller/session or moved behind the identity authority; `eye_app` cannot probe
  arbitrary principal/binding/session UUIDs across tenants.
* `audit.my_partition_status` no longer exposes tenant-global head/count/seal/
  incident state to a DOMAIN principal; a domain-specific projection replaces it.
* Identity-route denial path returns the governed 403 **with** durable POL/AUD —
  it must not fail because the identity role cannot establish evidence context.

### C7 — Outbox CAS as the only transition (§6)
* Enqueue only through the governed port; publisher limited to a bounded
  claim/lease plus a CAS acknowledgement tied to that lease, plus explicitly
  permitted retry/failure transitions.
* Reject direct status changes, forged `published_at`, pre-published insertion,
  and acknowledgement without the expected current state.

### C8 — Complete request audit coverage (§7)
* Route **all** authenticated validation failures through
  `rejectAuthenticatedRequest`: tenant/domain creation, canonical create/correct,
  principal creation, credential rotation, refresh validation and every
  equivalent controller edge.
* The global exception filter must not return an authenticated rejection lacking
  durable evidence.
* `audit.verify` records requested partition, verified sequence/head, expected vs
  calculated head, `ok`, `headMatches`, broken sequence/incident reference,
  authorization decision and final result — an unknown or damaged partition must
  never yield a generic success record.
* Degraded journal: unreconciled records reload on startup; `/readyz` stays
  degraded across restart until governed reconciliation records recovery.

### C9 — Real RFC 8785 (§8, finding 9)
* Conformant canonicalization boundary supporting fractional numbers, exponent
  forms, negative zero, Unicode keys with UTF-16 ordering, multilingual values,
  control-character escaping and IEEE-754/I-JSON validity.
* One recognized conformance corpus executed against **both** the TypeScript and
  the authoritative database implementation.
* Canonical admission additionally enforces full header **semantics**: field
  enums, temporal constraints, structured quality/confidence values, schema
  references and authoritative `recorded_at` handling.

### C10 — Remaining gate controls (§9, finding 10, E1–E6)
* Delete the `?? 'eye_local_dev'` fallback — missing migration credentials fail
  before connecting.
* Licence allowlist over production **and** development dependencies.
* CycloneDX schema validation; **bidirectional** SBOM/lockfile reconciliation with
  recorded governed exclusions for legitimate optional/platform packages.
* Playwright reuses the canonical loader, covers every runtime authority, and
  repairs directory/file permissions before reading.
* Controlled documents corrected: no app-role INSERT model, no obsolete bootstrap
  handoff, no `GATE_CANDIDATE_SHA` placeholder, no references to absent evidence
  files, corrected manifest reproduction command.
* PHASE1_PLAN Rev 5 fault injection extended through **step 12** and split per
  individual durable write/fsync/rename/verification boundary — manifest, OBS,
  EVD, custody, POL, AUD and outbox writes each get their own case.

### C11 — Adversarial regression matrix (§10)
All 22 mandated tests, exercising real roles, ports and services. No test may be
made to pass by widening a grant, weakening a scope check, or converting an
invariant failure into an exception.

---

## C. Delivery protocol

1. Freeze a **new source-only** candidate SHA (evidence untracked at freeze time).
2. Run the entire gate from a fresh isolated checkout: virgin volumes, no build
   artifacts, clean environment.
3. Generate evidence outside the source candidate.
4. Commit evidence separately; confirm the evidence commit changes only `evidence/`.
5. Deliver both SHAs, the Git bundle, the per-file manifest and complete raw logs
   (command, tool version, timestamp, exact exit code, source SHA per step).
6. Package `THE_EYE_PHASE0_GATE2_1_<source-sha>.zip`.

**Migration approach:** governed forward migrations `0011`/`0012`. `0001`–`0010`
are untouched, so all recorded digests stay valid; no destructive rebaseline is
performed and therefore no reset procedure is required. The profile remains
local-only (EXC-P0-004), so no persistent or customer environment depends on any
migration digest.

---

## D. Execution status (recorded at the Gate-2.1 freeze)

| Item | Status | Where it is proven |
|---|---|---|
| C1 direct authoritative privileges removed; RLS ENABLE+FORCE; PUBLIC/legacy sweep; bounded capabilities instead of raw transactions | **DONE** | `0011`; `evidence/authority-boundary.txt` §1–§4; `gate21-adversarial` G21-1/2; `capabilities.ts` (private `#tx`) |
| C2 universal system context eliminated; operation-specific capabilities | **DONE** | `0011` (six minters, action bound to minting role); G21-2/8; `evidence/authority-boundary.txt` §5 |
| C3 evidence mode capability-free; typed denial ports; AUD↔POL constraint | **DONE** | `0012`; G21-6/7 |
| C4 `clock_timestamp()` expiry; revalidation at every port; honest context description | **DONE** | `0011`/`0012`; G21-9/10/11; `evidence/authority-boundary.txt` §6 |
| C5 identity/metadata leakage closed; identity-route denial path fixed | **DONE** | `0012`; G21-12/13; acceptance G21-14 |
| C6 outbox CAS as the only transition | **DONE** | `0011`; G21-4/5 |
| C7 complete request audit coverage; full `audit.verify` detail; degraded reload | **DONE** | controllers + `consequentialReadEvidenced` + `DegradedReconciliationService`; acceptance G21-15/16/17 |
| C8 complete RFC 8785 semantics + full header semantics | **DONE** | `0012`; `rfc8785-crosslang` (74) + `rfc8785-conformance` (63); G21-19 |
| C9 remaining gate controls | **DONE** | `migrate.mjs` guard; `lib/supply-chain.mjs`; `license-inventory.mjs`; `generate-sbom.mjs`; `playwright.config.ts` + `local-env.cjs`; gate suite G21-20/21/22 |
| C10 controlled documents | **DONE** | this file, `PROGRESS.md`, `PHASE0_EVIDENCE.md`, `conformance.manifest.json`, `PHASE1_PLAN.md` Rev 5 (F01–F46 through step 12) |
| C11 22 adversarial regression tests | **DONE** | `PHASE0_EVIDENCE.md` §A.6 maps each of the 22 to its executing test |

### Defects this work found in itself

Recorded because a remediation that only reports its successes is not evidence:

1. The RLS `ENABLE`+`FORCE` sweep deny-alled tables whose only writer is a definer
   function owned by `eye_audit_allocator` (not a superuser), and deny-alled the
   `objects.schema_registry` reference data — the latter surfacing as
   "no registered schema CLM@v1" on every canonical write. Fixed with policies that
   state the real boundary (role plus port) instead of silently widening grants.
2. `ctx.assert_live_authority()` demanded a session from the deliberately
   session-less `identity_op` capability, which silently disabled **all** intake
   evidence (a failed login recorded nothing). Fixed by making the session-less
   case explicit and documenting why the bound subject is metadata, not authority.
3. An authority refusal surfacing from a port was classified as an audit
   *availability* failure, answering 503 and filing an availability incident for
   what is a 403 denial. Fixed with a typed `CapabilityDeniedError` and a durable
   sanitized denial record.
4. Refusing allow-class decisions in evidence mode erased the true decision of a
   request that was allowed and then failed. Replaced with a strictly stronger
   invariant: the decision is recorded and marked `evidence_only`, and a success can
   never reference it — in that transaction or any later one.
5. The role↔action minting bound was written against `current_user`, which inside a
   `SECURITY DEFINER` function is the function owner, making the check vacuous.
   Fixed to `session_user` (the connected role) and covered by G21-8.
