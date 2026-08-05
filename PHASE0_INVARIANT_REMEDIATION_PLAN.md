# THE EYE — Phase 0 Invariant Remediation Plan

> Authorized bounded remediation (review of candidate `ce1ee0d`). Scope is fixed by the authorization; no separate planning approval required; **no Phase 1/L1 functionality**. Non-waivable items (isolation semantics, digest integrity) are implemented, not excepted.

## R1 — Database scope & isolation
- New signed-context mechanism: RLS reads context ONLY through `public.eye_scope()/eye_tenant()/eye_domain()` (SECURITY DEFINER) which verify an HMAC-style signature over `scope|tenant|domain` computed with a secret held in a definer-only table — `eye_app` **cannot mint a valid context by setting GUCs directly**. Context is established exclusively via `public.eye_set_context(session_id, scope, tenant, domain)` (SECURITY DEFINER): validates the **active authenticated session**, the principal's **bindings**, and the requested (trusted-routing) target, then signs and sets the context. System paths (bootstrap/publisher/verifier/tests) use `eye_set_system_context()` — EXECUTE granted to the migrate/recovery role only, plus a narrow commit-writer grant where the pipeline itself needs platform context (outbox publisher), with an audited reason argument.
- DOMAIN context matches **both** tenant_id and domain_id: RLS on every scoped table (canonical_objects, object_outbox, policy_decisions, audit_events, tenancy.lifecycle_events, identity.principals, identity.role_bindings) becomes: PLATFORM-ctx → all; TENANT-ctx → own tenant; DOMAIN-ctx → own tenant AND (row.domain_id = ctx.domain OR row.domain_id IS NULL). Domain A can never read/write/count domain B rows. `FORCE ROW LEVEL SECURITY` on all of them.
- Credentials, sessions, break-glass: **all direct `eye_app` table privileges revoked**; access only through narrow SECURITY DEFINER functions (auth_lookup, session_create/validate/revoke_all, refresh_rotate, create_principal_with_password, rotate_credential).
- Scope/identifier consistency CHECKs added to object_outbox (and already present on canonical/principals/bindings).

## R2 — Audit & policy privilege boundary
- `REVOKE ALL … FROM PUBLIC` on **every** SECURITY DEFINER function; explicit per-role grants only.
- `eye_app` loses direct INSERT on `policy_decisions` and `audit_events`; appends go through definer ports `policy.append_decision(jsonb…)` / `audit.append_event(event, prev_hash, row_hash)` which enforce partition/scope/tenant/domain consistency between the row and the event contents (forging cross-scope or inconsistent evidence is structurally rejected).
- `freeze_partition` and `rebuild_chain_heads` EXECUTE revoked from `eye_app`; tamper handling goes through `audit.open_integrity_incident(...)` which atomically freezes **and** records the incident (no silent freeze); rebuild is recovery-role/migrate only. Allocator role reduced to exactly heads-table ownership.
- Verify/seal concurrency: `sealPartition` now locks the head first (definer `audit.lock_head_for_seal`), verifies **up to exactly the locked head** in the same transaction, and seals precisely that head — intervening appends cannot enter a seal unverified. `verifyPartition` runs in REPEATABLE READ against a stable snapshot. Concurrency tests exercise the real `AuditService.verifyPartition()/sealPartition()` under an append storm.

## R3 — Complete audit-on-commit
- Scope/route/envelope-action mismatches now record durable sanitized denial evidence before throwing.
- Handler failures (validation/provenance/version) roll back the business tx, then record a separate sanitized failure event; same for consequential-read handler failures (evidence of the failure survives the rollback).
- Login = one atomic tx (session + AUD); rotation = one atomic tx (all mutations + AUD); refresh success/rejection/reuse audited in the same tx as the token-state mutation. If the audit append fails, the mutation rolls back.
- Security-intake rate limiting aggregates: each admitted intake event carries `suppressed_since_last`; drops are counted, never erased.
- Health/readiness stay telemetry-only (unchanged, documented).

## R4 — Refresh-token rotation
- Every successful refresh issues a new refresh token and atomically invalidates the old (single conditional UPDATE, definer fn); previous hash retained for reuse detection; reuse ⇒ session revoked + audited `identity.refresh_reuse_detected`; concurrent-refresh and replay tests included.

## R5 — Canonical header & digest
- Contracts publish an explicit registry: **40 authoritative Vol 7 App. E fields + 3 governed extensions (`scope` per ADR-P0-04, `synthetic_state` per Vol 3 App. B, `human_refs` per Vol 3 App. B) = 43 stored fields**; no more "40-field" description of a 43-column schema.
- Production writes validate the **complete** header via the contracts schema; `content_digest = SHA-256(JCS({header: <all 43 fields>, payload}))`; storage round-trip re-reads the row, rebuilds the header, and re-verifies the digest inside the same tx; parameterized tests prove every digest-bound field mutation changes the digest; `valid_to > valid_from` CHECK added.

## R6 — Identity integrity
- Unique `login_name` for authentication (display_name is display-only); composite FKs prove domain∈tenant on principals/role_bindings/domains; role_bindings constrained to the role's declared scope; password policy enforced in the definer creation/rotation paths; workload/agent principals refuse password credentials; auth helpers permission-bounded; credential/refresh hashes unreachable cross-tenant (no direct table access at all).

## R7 — Bootstrap, secrets, infra
- Role passwords removed from migration SQL (env-substituted placeholders; runner refuses when unset and re-applies `ALTER ROLE` passwords from env each run — env values are **actually applied** to PostgreSQL).
- demo.sh: secret handoff via caller-supplied env or a 0600 local handoff file (`.eye-local/bootstrap-secret`, gitignored); no unconditional `|| true` — bootstrap exit codes distinguish "already bootstrapped" (continue) from real failure (abort).
- Acceptance/e2e use **generated ephemeral secrets** shared through a 0600 gitignored handoff file, not fixed literals.
- Compose binds 127.0.0.1 only; Redis requires auth; postgres/redis pinned by immutable digest (alpine variants chosen for a clean HIGH/CRITICAL baseline), digests recorded in the conformance manifest.

## R8 — Supply-chain truthfulness
- CI scans the **exact pinned images** with `trivy image` (blocking at HIGH/CRITICAL) in addition to the fs scan (correctly labeled); SBOM generator pinned & tracked; CI fails on empty SBOM; SBOM↔lockfile↔license reconciliation in CI; stale tracked evidence (zero-component SBOM, outdated test-run summaries) removed; hosted-CI never claimed.

## R9 — Controlled documents
- PHASE1_PLAN.md Revision 4: cumulative and self-contained (full P1-M1…M7 table, all locked answers incl. the 60s local scheduler floor, full fault-injection enumeration incl. checkpoint/publication/sweeper sub-boundaries, origin = scheme+host+port wording, transactionally-protected final contract revalidation at admission).
- PHASE0_EVIDENCE.md rewritten to reference only the new binding evidence; PROGRESS/EXCEPTIONS/CI-statement corrections (exact requirement IDs, controlled status enums, real job counts, migration range, package/vuln totals); historical evidence labeled or removed. P1 exceptions remain `proposed`.

## R10 — Mandated tests (real services/policies, no source-string tests)
The 14 mandated test groups are implemented across `test/int/domain-isolation`, `test/int/privileges`, `test/int/audit-consistency`, `test/int/refresh`, contracts digest-parameterized tests, extended acceptance, a scripted virgin `demo.sh` login-flow check in the verification harness, and image-digest/scan verification — plus full Phase 0 regression.

Deliverable: `THE_EYE_PHASE0_INVARIANT_REMEDIATION_GATE_<sha>.zip` with clean final SHA, virgin-volume transcripts, raw logs incl. tool versions, old+new results, supply-chain outputs, and a tracked-source snapshot tied to the final SHA.
