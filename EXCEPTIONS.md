# THE EYE — Exception Register

> Rigor rule: constitutional requirements are not waivable. Exceptions cover only bounded, inactive, or deferred capabilities. **No exception waives the constitutional semantics** (human authority, provenance, temporal truth, tenant isolation, append-only audit with tamper detection, fail-closed authorization, explainability). Specific resilience/assurance risks that remain open while an exception is active are stated honestly per entry and bounded by compensating controls and prohibited exposure. "Later" is not a valid expiry.

---

## EXC-P0-001 — Audit ledger shares the primary PostgreSQL failure domain

```yaml
exception_id:            EXC-P0-001
requirement_ids:         [IA-58-003]
related_architecture_ids: [INF-ST-03, DR-11, SC-08 (separate protection)]   # Volume 3/6 architecture identifiers, kept separate from requirement IDs
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
  - AnchorSink external-anchoring interface reserved
  # CORRECTED (gate review): "independently verified audit-schema backups" was
  # previously listed as a control but no backup-verification mechanism exists
  # yet — no evidence can be produced, so the claim is REMOVED. Implementing and
  # verifying independent audit backups is part of the exit criteria below.
prohibited_exposure:     No production or customer deployment; no non-repudiation claims to external parties
expiry_date:             2026-10-31
expiry_milestone:        Before Phase 3 gate
exit_criteria:           Audit ledger replicated to an independent store/failure domain with integrity anchors; independently verified audit backups implemented; recovery exercise passes
required_evidence:       Restore + re-verification exercise record; anchor round-trip test; updated threat assessment
status:                  open
```

## Security correction record — exposed bootstrap credential (closed)

```yaml
correction_id:           SEC-P0-001
title:                   Shared documented bootstrap credential treated as exposed and replaced
detected:                2026-08-04 (gate-closure review, instruction C)
disposition:             CLOSED 2026-08-04
action:                  Exposed credential + platform_admin binding revoked; all active sessions revoked; one-time environment-generated bootstrap secret with forced first-use rotation and 24h unused-expiry implemented (ADR-P0-17, migration 0007); production/customer-data operation structurally impossible (runtime env restricted to local|test)
evidence:                Acceptance AC-1 (rotation forced; old secret and old session dead after rotation); audit events identity.credential_rotated on the platform partition
residual_risk:           None beyond EXC-P0-002 (local IdP assurance), which remains open and unchanged
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
# CORRECTED (invariant-remediation gate): wildcard "PR-*-004" and chapter-family
# "ES-14" replaced with exact identifiers. The -004 parity requirement exists
# once per Volume 8 capability chapter; the family is enumerated exhaustively.
requirement_ids:         [IA-03-006, ES-14-001, ES-14-005, PR-01-004, PR-02-004, PR-03-004, PR-04-004, PR-05-004, PR-06-004, PR-07-004, PR-08-004, PR-09-004, PR-10-004, PR-11-004, PR-12-004, PR-13-004, PR-14-004, PR-15-004, PR-16-004, PR-17-004, PR-18-004, PR-19-004, PR-20-004, PR-21-004, PR-22-004, PR-23-004, PR-24-004, PR-25-004, PR-26-004, PR-27-004, PR-28-004, PR-29-004, PR-30-004, PR-31-004, PR-32-004, PR-33-004, PR-34-004, PR-35-004, PR-36-004, PR-37-004, PR-38-004, PR-39-004, PR-40-004, PR-41-004, PR-42-004, PR-43-004, PR-44-004, PR-45-004, PR-46-004, PR-47-004, PR-48-004, PR-49-004, PR-50-004, PR-51-004, PR-52-004, PR-53-004, PR-54-004, PR-55-004, PR-56-004, PR-57-004, PR-58-004, PR-59-004, PR-60-004, PR-61-004, PR-62-004, PR-63-004, PR-64-004, PR-65-004, PR-66-004, PR-67-004, PR-68-004, PR-69-004, PR-70-004, PR-71-004, PR-72-004]
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

---

## Inherited open Phase 0 exceptions (Phase 1 operates under these)

EXC-P0-001 (audit ledger shares primary DB failure domain) · EXC-P0-002 (local credential IdP, no external federation/MFA) · EXC-P0-003 (no artifact signing/attestation) · EXC-P0-004 (single deployment profile) · EXC-P0-005 (.env secrets, local dev). All open, in-date; earliest expiry 2026-09-30 (EXC-P0-003).

## EXC-P1-001 — Heuristic-only quarantine scanning (no malware engine) — PROPOSED

```yaml
exception_id:            EXC-P1-001
requirement_ids:         [DP-16-001, DP-16-005, DP-12-002]   # intake validation/quarantine + document ingestion (Vol 7 Ch.16/12)
related_architecture_ids: [L1-C07 (Quarantine and Malware Inspection), DZ-03 (Transfer quarantine)]
invariant_ids:           []   # inspection capability deferred; no constitutional semantic waived
title:                   Quarantine performs structural/heuristic checks only; no AV/malware engine integrated in the local profile
owner:                   Founding engineer (this project)
approver:                Project owner (pending PHASE 1 approval)
reason:                  No AV engine is available in the local Compose profile; content is never executed, semantically parsed, or inline-rendered in Phase 1.
risk:                    HONEST STATEMENT — malicious payloads may pass heuristic checks undetected and rest in the evidence vault. Bounded because Phase 1 never executes, extracts, or inline-renders content, and downloads are attachment-only from a sandboxed path.
consequence_class:       C2
affected_profiles:       [local-dev]
compensating_controls:
  - Strict type/size allowlists; declared-vs-sniffed type recording; expansion limits; path-traversal rejection
  - No content execution/extraction/inline rendering anywhere in Phase 1
  - Quarantine isolation volume; admission is an explicit audited decision
  - Malicious-input fixture corpus in CI
prohibited_exposure:     No external deployment; no real customer data; no production claims; NO unqualified malware-safety claims; no deployment-parity claims for scanning
expiry_date:             2026-12-31
expiry_milestone:        Before first external deployment
exit_criteria:           Pluggable scanning engine integrated + quarantine verdicts recorded as evidence
required_evidence:       Engine integration tests; verdict audit records; corpus pass results
status:                  proposed   # controlled enum {proposed, open, closed, expired}; becomes open only upon PHASE 1 approval
```

## EXC-P1-002 — Evidence vault on local Docker volumes — PROPOSED

```yaml
exception_id:            EXC-P1-002
requirement_ids:         [DP-28-001, DP-28-002, IA-33-002, IA-62-003]   # object/evidence storage + backup coverage (Vol 7 Ch.28, Vol 6 Ch.33/62)
related_architecture_ids: [L1-C05 (Raw Preservation and Evidence Vault), DZ-04 (Raw evidence tier), INF-ST-02 (evidence object store), SC-02]
invariant_ids:           [C-043 (durability risk bounded; semantics not waived)]
title:                   Evidence vault on local named Docker volumes (eye-quarantine + eye-evidence); no independent replicated object store
owner:                   Founding engineer (this project)
approver:                Project owner (pending PHASE 1 approval)
reason:                  Local-dev is the only profile; the volumes explicitly do NOT define the production storage architecture.
risk:                    HONEST STATEMENT — evidence durability depends on a single host filesystem; loss of the volume loses raw evidence bytes (canonical metadata + digests in Postgres prove what existed but not its content).
consequence_class:       C2
affected_profiles:       [local-dev]
compensating_controls:
  - Content digests recorded in canonical EVD rows; verification pre/post storage and on every read
  - Tenant/domain-scoped opaque locators; no cross-tenant dedup/existence disclosure
  - Create-if-absent atomic writes; separate quarantine/admitted volumes
prohibited_exposure:     No external deployment; no real customer data; no production claims; no durability or deployment-parity claims
expiry_date:             2026-12-31
expiry_milestone:        First multi-profile milestone
exit_criteria:           EvidenceStore adapter for a replicated object store + restore/reconciliation exercise
required_evidence:       Cross-store round-trip + digest verification + recovery exercise records
status:                  proposed   # controlled enum {proposed, open, closed, expired}; becomes open only upon PHASE 1 approval
```
