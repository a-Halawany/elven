# THE EYE — Exception Register

> Rigor rule: constitutional requirements are not waivable. Exceptions cover only bounded, inactive, or deferred capabilities. **No exception waives the constitutional semantics** (human authority, provenance, temporal truth, tenant isolation, append-only audit with tamper detection, fail-closed authorization, explainability). Specific resilience/assurance risks that remain open while an exception is active are stated honestly per entry and bounded by compensating controls and prohibited exposure. "Later" is not a valid expiry.

---

## EXC-P0-001 — Audit ledger shares the primary PostgreSQL failure domain

```yaml
exception_id:            EXC-P0-001
requirement_ids:         [INF-ST-03, DR-11, SC-08 (separate protection), IA-58-003]
invariant_ids:           [C-036 (semantics NOT waived), C-043 (resilience risk bounded)]
title:                   Audit chains live in the primary PostgreSQL cluster (separate schema + dedicated roles) instead of an independent audit store/failure domain
owner:                   Founding engineer (this project)
approver:                Project owner (Phase 0 approval, 2026-08-03)
reason:                  Phase 0 is local-development-only with a single Compose profile; an independent audit store adds operational surface before any deployment exists.
risk:                    HONEST STATEMENT — this exception touches audit resilience and integrity risk. The ledger shares the primary database failure domain; a cluster-level compromise, corruption, or loss affects both authoritative state and its evidence simultaneously. Append-only semantics, tamper detection, and fail-closed behavior are NOT waived — but independent survivability of evidence is reduced while this exception is open.
consequence_class:       C2
affected_profiles:       [local-dev]
compensating_controls:
  - Per-partition hash chains with domain-separated SHA-256 over JCS + golden fixtures
  - Pre-incident seals; verifier job; tamper response (freeze, incident, no re-sealing)
  - Exact DB privilege boundary (INSERT-only evidence; dedicated allocator role) with negative tests
  - Independently verified audit-schema backups
  - AnchorSink external-anchoring interface reserved
prohibited_exposure:     No production or customer deployment; no non-repudiation claims to external parties
expiry_date:             2026-10-31
expiry_milestone:        Before Phase 3 gate
exit_criteria:           Audit ledger replicated to an independent store/failure domain with integrity anchors; recovery exercise passes
required_evidence:       Restore + re-verification exercise record; anchor round-trip test; updated threat assessment
status:                  open
```

## EXC-P0-002 — Local credential IdP; no external federation; no MFA

```yaml
exception_id:            EXC-P0-002
requirement_ids:         [IA-49-002, IC-01, IC-13, ES-49-003 (workload attestation deferred)]
invariant_ids:           [C-039 (assurance risk bounded; fail-closed NOT waived)]
title:                   Local credential identity provider behind the federation port; external OIDC/SAML federation and MFA deferred
owner:                   Founding engineer (this project)
approver:                Project owner (Phase 0 approval, 2026-08-03)
reason:                  No external deployment or real users exist in Phase 0; the federation interface is designed in, adapters are deferred.
risk:                    HONEST STATEMENT — identity assurance is local-only: password-based authentication without MFA and without hardware-attested workload identity reduces resistance to credential compromise while open. Deny-by-default, session assurance recording, and break-glass audit are NOT waived.
consequence_class:       C2
affected_profiles:       [local-dev]
compensating_controls:
  - argon2id password hashing; short-lived JWT access + refresh rotation
  - Assurance level recorded per session and evaluated by policy
  - Break-glass grants time-bound, conspicuous, audited
  - Federation port (OIDC-shaped) defined so adapters bolt on without call-site changes
prohibited_exposure:     No external deployment; no real customer data; no internet-exposed instance
expiry_date:             2026-10-31
expiry_milestone:        Before first external deployment
exit_criteria:           External IdP adapter (OIDC) + MFA enforcement for consequential roles; workload identity rotation
required_evidence:       Federation + MFA test suite results; assurance-level policy fixtures
status:                  open
```

## EXC-P0-003 — No artifact signing / provenance attestation

```yaml
exception_id:            EXC-P0-003
requirement_ids:         [IC-14, IC-16, ES-68-001 (attestations), ES-56-001]
invariant_ids:           []   # supply-chain assurance deferred; no constitutional semantic waived
title:                   Build artifacts are digest-pinned but not signed/attested; SBOM + scanning ARE active in Phase 0 CI
owner:                   Founding engineer (this project)
approver:                Project owner (Phase 0 approval, 2026-08-03)
reason:                  Signing infrastructure (key custody, offline-verifiable scheme compatible with future air-gap) needs a deliberate design; deferring signature enforcement, not inventory or scanning.
risk:                    An artifact could be substituted between build and run without cryptographic detection while open; bounded by digest pinning and local-only exposure.
consequence_class:       C2
affected_profiles:       [local-dev]
compensating_controls:
  - Lockfile-pinned dependencies; images pinned by digest; CI provenance logs retained
  - SBOM (CycloneDX), dependency + container vulnerability scanning, secret scanning, license inventory — all blocking
prohibited_exposure:     No promotion of unsigned artifacts beyond local/dev
expiry_date:             2026-09-30
expiry_milestone:        Before Phase 2 gate
exit_criteria:           Signing + attestation in CI with offline-verifiable path; runtime digest/signature admission check
required_evidence:       Signed-artifact verification test; key-custody record
status:                  open
```

## EXC-P0-004 — Single deployment profile (local Compose)

```yaml
exception_id:            EXC-P0-004
requirement_ids:         [IA-03-006, ES-14 (parity fixtures across profiles), PR-*-004]
invariant_ids:           [C-042 (parity untested, not redefined)]
title:                   Only the local Docker Compose profile exists; parity fixtures are written profile-agnostically but exercised on one profile
owner:                   Founding engineer (this project)
approver:                Project owner (Phase 0 approval, 2026-08-03)
reason:                  Phase 0 is foundation-only; SaaS/Private-Cloud/On-Premise profiles do not exist yet.
risk:                    Undetected profile-specific assumptions could accumulate; bounded by writing all conformance fixtures deployment-agnostically and avoiding managed-cloud dependencies.
consequence_class:       C1
affected_profiles:       [local-dev]
compensating_controls:
  - Conformance fixtures written profile-agnostic from P0; no managed-service dependencies in the canonical path
prohibited_exposure:     No deployment-parity claims
expiry_date:             2026-12-31
expiry_milestone:        First multi-profile milestone
exit_criteria:           Same golden fixtures pass on a second profile
required_evidence:       Cross-profile fixture run records
status:                  open
```

## EXC-P0-005 — `.env` secrets for local development

```yaml
exception_id:            EXC-P0-005
requirement_ids:         [IA-52-003 (static shared credentials require a time-bounded exception), IC-13]
invariant_ids:           []
title:                   Static local development credentials in .env files (never committed)
owner:                   Founding engineer (this project)
approver:                Project owner (Phase 0 approval, 2026-08-03)
reason:                  No secret-issuance service exists in Phase 0; local Compose only.
risk:                    Local credential leakage via developer machine; bounded — no production credentials exist anywhere.
consequence_class:       C1
affected_profiles:       [local-dev]
compensating_controls:
  - Secret scanning blocking in CI; .env gitignored; example files contain placeholders only
prohibited_exposure:     Local development only; no production credentials may ever exist in .env form
expiry_date:             2026-10-31
expiry_milestone:        With EXC-P0-002 closure
exit_criteria:           Dynamic/short-lived secret issuance for non-local profiles
required_evidence:       Secret-scan history; issuance-service design record
status:                  open
```
