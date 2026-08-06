# THE EYE — Phase 0 Gate-2 Closure Plan (executed)

> Authorized bounded closure of the remaining Phase 0 constitutional invariants
> (review of source candidate `562fffaf3d848dd730e7287771e3344b2e5b05b2`,
> archive SHA-256 `505fed9ea836dfb1f63ddb6aa6b3c9e0840793b15e4d0cc0851271174039447a`).
> **No Phase 1 application code.** Phase 1 remains unapproved; EXC-P1-001/002
> remain `proposed`.
>
> Preserved from the previous pass, as instructed: the corrected atomic commit
> path, audit verify/seal locking, full 43-field canonical digest binding, image
> digest pinning, and the cumulative Phase 1 plan.
>
> Delivered as **governed forward migrations 0009 and 0010** — migrations 0001–0008
> are untouched and every previously applied digest stays valid. No destructive
> rebaseline was performed (see §Migration approach).

## G1 — Real database privilege separation

Six least-privilege runtime roles, each with its own credential:

| Role | Authority | Cannot |
|---|---|---|
| `eye_app` | RLS-governed SELECT only | write anything authoritative; read credential/session/refresh material; mutate identity; call evidence ports; verify/seal; acknowledge publication; reach recovery |
| `eye_commit` | governed business writes + bound POL/AUD ports + canonical admission + outbox enqueue | mutate identity; acknowledge publication; verify/seal; rebuild chain heads; INSERT canonical rows directly |
| `eye_identity` | identity/credential/session mutation + identity-flow evidence | write canonical objects; create tenants/domains; verify/seal; recovery |
| `eye_publisher` | `objects.outbox_claim` + `objects.outbox_ack` only | enqueue events; rewrite events; read business state |
| `eye_verifier` | verification, sealing, tamper evidence | rebuild chain heads; mutate identity; write business state |
| `eye_recovery` | chain-head rebuild (break-glass) | write evidence; mutate identity; **no application pool loads this credential** |

`PUBLIC` EXECUTE is revoked from every SECURITY DEFINER function; each has a
fixed `search_path`, explicit caller checks, target-authority checks and exact
scope validation. `eye_system` is retired as an authority.

## G2 — The reusable signed context is replaced

`ctx.issue()` mints a context bound to **session, principal, tenant, domain,
scope, assurance, purpose, issued-at, expiry, single-use nonce, revocation epoch,
issuing backend PID and issuing transaction id**. It requires **proof of
possession** of the session's context key, which travels only inside the verified
access token (`ctxk` claim) — so the application credential alone cannot mint
another principal's authority. A context is refused when the signature fails, the
expiry passes, the backend differs, **the transaction differs** (replay), the
session is revoked, a binding is removed, the credential rotates (revocation
epoch), or the assurance is `bootstrap_rotation`. `ctx.issue_evidence()` grants
permission to RECORD a denial about the principal and carries no capability at
all. A valid signature is never sufficient.

## G3 — DOMAIN→TENANT escalation closed

Every legacy permissive policy is dropped and rebuilt. DOMAIN requires an exact
`(tenant_id, domain_id)` match; a NULL `domain_id` is never an implicit
tenant-wide fallback. `eye_row_writable()` additionally refuses tenant-level rows
from a DOMAIN context and refuses any capability in `evidence` mode. Shared
tenant information reaches a domain only through the explicitly authorized read
model `tenancy.my_tenant()`. A trigger proves role-binding authority against the
principal's own scope **and** the grantor's authority, not merely a matching role
label.

## G4 — POL and AUD are unforgeable

The application submits a *request to commit*, never evidence.
`audit.commit_event` / `audit.commit_identity_event` / `policy.commit_decision`
derive scope, tenant, domain, actor, session and purpose from the validated
context, build the record inside the trusted boundary, canonicalize it with the
**in-database RFC 8785 implementation** (`canon.jcs`) and compute the chain hash
there (`canon.audit_row_hash`). `event_jcs` therefore stores exactly the bytes
that were hashed — never `jsonb::text`. Exact scope equality is required and
malformed PLATFORM/TENANT/DOMAIN identifier combinations are refused. Global
application visibility into heads/seals/incidents is removed and replaced by the
scoped read model `audit.my_partition_status()`.

## G5 — Canonical and outbox bypasses closed

`objects.admit_version` is the only canonical write path: no runtime role holds
INSERT on `objects.canonical_objects`. It requires the complete 40 authoritative
+ 3 governed-extension field registry (`objects.canonical_field_registry`),
refuses unregistered fields, and **recomputes** the header+payload digest,
accepting a supplied digest only as a check. Outbox event identity and content
are immutable by trigger; the publisher's entire surface is a compare-and-set
acknowledgement over permitted status transitions.

## G6 — Every governed request path is audited; fail-closed

Pre-handler validation failures on authenticated requests go through the
centralized durable rejection path. Scope/route/envelope mismatches, policy
denials, handler failures and consequential-read failures all record sanitized
evidence. Evidence-path failures are never swallowed: they are written to an
**independent, fsynced, append-only degraded journal**, mark the process
degraded (surfaced by `/readyz`), and the request **fails closed with 503**.
Rate-limit suppression accounting is restart-durable in
`audit.intake_suppression`. Chain verification is governed as its own action
`audit.verify` with the partition, decision and result recorded.

## G7 — Complete refresh-token-family reuse detection

`identity.refresh_tokens` is an append-only family ledger. Replay of **any**
previously invalidated generation (n-1, n-2, n-10, older) is detected, revokes
the whole family, bumps the principal's revocation epoch (killing outstanding
contexts) and produces evidence. Only hashes are stored.

## G8 — Bootstrap hardening

`identity.claim_bootstrap()` is the database-enforced single-use guard: the
single-row primary key serializes concurrent attempts so exactly one can win.
Eligibility is structural — read from `config.runtime_profile` in the database,
never from a caller-supplied label. `identity.platform_admin_exists()` is a
belt-and-braces block. No secret defaults remain on any executable path,
including the migration-password fallback; `.env.example` carries blank
placeholders and every currently required variable.

## G9 — Adversarial tests

The 17 mandated negative tests live in
`apps/api/test/int/adversarial.test.ts` (1–9, 13–16 and the recovery-authority
checks), the acceptance suite (10–12) and `scripts/verify-clean-typecheck.sh`
(17). No invariant was weakened and no authority widened to make a test pass;
three real defects were found and fixed by these tests (same-connection context
replay, a residual canonical INSERT grant, and the bootstrap guard ordering).

## G10 — CI and evidence binding

Clean-source typecheck now passes with no pre-existing `dist`/`.next`/
`*.tsbuildinfo`: workspace packages expose their sources through a
`development` export condition and the typecheck configs opt in via
`customConditions`; builds still consume emitted declarations. CI runs
`scripts/verify-clean-typecheck.sh` (typecheck **before** build) as a blocking
step.

Evidence is bound without self-reference: a frozen `SOURCE_CANDIDATE_SHA` is
verified in a fresh isolated checkout, and the evidence produced from that run is
recorded in a separate declared `EVIDENCE_ATTESTATION_SHA` — see
`PHASE0_EVIDENCE.md`.

## Migration approach (explicit)

**Governed forward migration — no rebaseline.** `0009` and `0010` are additive
forward migrations. Migrations `0001`–`0008` are byte-identical to the previously
delivered candidate, so every recorded digest remains valid and the immutability
check in `apps/api/scripts/migrate.mjs` continues to hold. No destructive
local-only rebaseline was chosen, so no reset procedure is required and no
persistent or customer environment could depend on changed digests (none exists:
the profile is local-only under EXC-P0-004).
