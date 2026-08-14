# THE EYE — Exception Register

> Rigor rule: constitutional requirements are not waivable. Exceptions cover only bounded, inactive, or deferred capabilities. **No exception waives the constitutional semantics** (human authority, provenance, temporal truth, tenant isolation, append-only audit with tamper detection, fail-closed authorization, explainability). Specific resilience/assurance risks that remain open while an exception is active are stated honestly per entry and bounded by compensating controls and prohibited exposure. "Later" is not a valid expiry.

---

## EXC-P0-001 — Audit ledger shares the primary PostgreSQL failure domain

```yaml
exception_id:            EXC-P0-001
requirement_ids:         [IA-58-003]
related_architecture_ids: [INF-ST-03, DR-11, SC-08]
invariant_ids:           [C-036, C-043]
id_notes:                "SC-08 is cited for its separate-protection clause. C-036 semantics are NOT waived; C-043 resilience risk is bounded by the compensating controls below." 
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
requirement_ids:         [IA-49-002, IC-01, IC-13, ES-49-003]
invariant_ids:           [C-039]
id_notes:                "ES-49-003 is cited for deferred workload attestation. C-039 assurance risk is bounded; fail-closed authorization is NOT waived." 
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
requirement_ids:         [IC-14, IC-16, ES-68-001, ES-56-001]
invariant_ids:           []
id_notes:                "ES-68-001 is cited for attestations. No constitutional semantic is waived; supply-chain assurance depth is deferred." 
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
invariant_ids:           [C-042]
id_notes:                "C-042 parity is untested on a second profile, never redefined. The -004 parity requirement recurs once per Volume 8 capability chapter (PR-01-004 … PR-72-004), enumerated in full above." 
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
requirement_ids:         [IA-52-003, IC-13]
invariant_ids:           []
id_notes:                "IA-52-003 is cited because static shared credentials require a time-bounded exception." 
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
requirement_ids:         [DP-16-001, DP-16-005, DP-12-002]
related_architecture_ids: [L1-C07, DZ-03]
invariant_ids:           []
id_notes:                "DP-16-001/005 cover intake validation and quarantine; DP-12-002 covers document ingestion (Vol 7 Ch.16/12). L1-C07 is Quarantine and Malware Inspection; DZ-03 is Transfer quarantine. Inspection capability is deferred; no constitutional semantic is waived." 
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
requirement_ids:         [DP-28-001, DP-28-002, IA-33-002, IA-62-003]
related_architecture_ids: [L1-C05, DZ-04, INF-ST-02, SC-02]
invariant_ids:           [C-043]
id_notes:                "DP-28-001/002 cover object/evidence storage; IA-33-002 and IA-62-003 cover backup coverage (Vol 7 Ch.28, Vol 6 Ch.33/62). L1-C05 is Raw Preservation and Evidence Vault; DZ-04 is the raw evidence tier; INF-ST-02 is the evidence object store. C-043 durability risk is bounded; semantics are not waived." 
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

---

## Security correction record — C16-R3.4 (§G)

Two corrections landed before any further public CI logs were produced, plus one working-tree
incident recorded because it changed a governed document.

### G1 — ephemeral CI credentials appeared in the public Actions log (closed)

The workflow generated thirteen per-run credentials with `openssl rand` and appended them
straight to `$GITHUB_ENV`. The runner echoes an `env:` group before every `run:` step, so each
value appeared in **plaintext**, once per subsequent step. Directly observable in the logs of
runs `31644258092` and `31644806581`.

*Exposure.* Values are generated per run and die with the runner and its database, so nothing
durable was exposed and no reusable credential existed at any point. A public log should still
never carry them.

*Correction.* `scripts/ci/generate-run-secrets.sh` — one tracked script used by both database
jobs — emits `::add-mask::` for every value **before** exporting it, so the runner redacts that
exact string everywhere thereafter, including the `env:` groups. Six controls in
`apps/api/test/gate/ci-security.test.ts` execute the real script with an injected generator and
assert: the full credential set is exported, every exported value has a mask line, no value
appears outside its mask line, real values are distinct and high-entropy, and the script refuses
to run without `$GITHUB_ENV` rather than printing to stdout.

*Status.* closed.

### G2 — the documented scanner-acquisition bound was false (closed)

The installer's retry window was documented as "roughly five and a half minutes". That was
wrong: `curl --max-time` bounds one transfer attempt, and curl's own `--retry 3` starts fresh
ones, so six outer attempts put the real ceiling in the region of hours. A bound that holds only
when nothing goes wrong is not a bound.

*Correction.* ONE absolute deadline (`EYE_SCANNER_ACQUIRE_DEADLINE_SECONDS`, default 600s per
tool) computed before the first attempt. Every attempt — retried or not — receives only the
REMAINING budget as its `--max-time`, and backoff never sleeps past the deadline. CI adds an
independent `timeout-minutes: 25` backstop on the step, so the step is bounded even if the
script is bypassed. Seven controls drive the real script with an injected failing downloader and
a fake clock, asserting the announced deadline, strictly shrinking per-attempt budgets, abort on
the deadline with attempts remaining, abort on the attempt cap with budget remaining, backoff
never exceeding the printed remaining budget, and a transient failure inside the deadline still
proceeding.

*Status.* closed.

### G3 — tests wrote tracked files; every path is now eliminated (closed at R3.4.1)

`scripts/gate/scanner-exclusions.json` was found modified in the working tree, once with the
`SCX-0001` record deleted and once with `scan_platform` changed to `linux/arm64`.

**Cause.** `withReplacedFile()` in `apps/api/test/gate/c15-runner-behaviour.test.ts` overwrote
the real tracked document in place and restored it in a `finally`, which a kill skips. Each of
the 44 behavioural controls spawned a full live C15 gate — one file took 491.66 s — so the
harness killed the run repeatedly, and each kill left the governed document holding whatever
defect the interrupted control had written. Later runs failed with
`UNGOVERNED image finding: CVE-2026-33630` for reasons unrelated to the change under test. This
was not an upstream outage; a separate mirror 404 occurred later and is a different matter.

**Correction of the previous record.** The R3.4 entry stated that no test writes tracked
governance files. **That was false when written.** R3.4 introduced an injection seam for the
disposition document only; independent review then found the generic in-place path still live
and still used for:

| tracked path | was written by | now |
|---|---|---|
| `scripts/gate/scanner-exclusions.json` | 12 disposition controls | temporary injected document (`EYE_GATE_EXCLUSIONS_PATH`) |
| `scripts/gate/scanner-pins.json` | malformed-document control | disposable repository copy |
| `docs/SCANNER_DISPOSITIONS.md` | one-byte evidence-tamper control | disposable repository copy |
| `.trivyignore` (repository root) | two legacy-ignore controls | disposable repository copy |

**Closure at R3.4.1.**
1. `withReplacedFile()` is **deleted**. Its replacement, `withInjectedDocument()`, serves the
   one path that has an injection seam and **throws** for anything else, naming
   `disposableRepo()` as the alternative — so a future control cannot silently reintroduce a
   repository write.
2. Inputs the gate locates by repository root are exercised in a throwaway copy built from
   `git ls-files`, running that copy's own runner.
3. `--final` refuses every seam before staging, acquisition or any scan.
4. SIGKILL controls per injected-input class prove all eight governed digests and
   `git status --porcelain` are byte-identical across a killed mutation, and that no
   `.trivyignore`, cache or staged scanner is left in the repository.
5. Restoration hooks remain only as defence in depth; the tracked file is never opened for
   writing, so they are not the mechanism.

**Residual.** None for the corruption path. The committed state of the governed document was
never altered; every occurrence was working-tree only and was restored from `HEAD`.

*Status.* closed.

### G4 — the "complete 44-test poison proof" was claimed before it existed (closed at R3.4.3)

The R3.4.2 delivery report stated that the whole behavioural suite had been proved to pass with
every external tool replaced by a refusing stub. **That was false when written.**

**What was actually committed at R3.4.2.** `apps/api/test/gate/hermetic-isolation.test.ts` ran
ONE representative gate invocation under shims for `curl`, `wget`, `docker`, `skopeo` and
`crane`. `trivy` and `gitleaks` were not poisoned in that control at all, and no control
executed the 44-test file as a unit under the full set. The file's own header compounded the
error by listing `trivy` and `gitleaks` among the poisoned tools.

**Why the underlying claim was nevertheless true.** Independent review confirmed the suite does
pass under all seven shims. The defect was in the evidence, not in the hermeticity: an
unproved true statement is still an unproved statement, and it was reported as proved.

**Closure at R3.4.3.**
1. `apps/api/test/gate/hermetic-suite-meta.test.ts` spawns a child vitest over the entire
   `c15-runner-behaviour.test.ts` with `curl`, `wget`, `docker`, `skopeo`, `crane`, `trivy` and
   `gitleaks` all poisoned, and asserts the child reports **exactly** 44 passed and 0 failed —
   not "at least", so a suite that silently shrinks fails the control.
2. The marker log is asserted **empty** for that child run.
3. Each of the seven shims is invoked separately and must exit 97, record the attempt and print
   its refusal — without which an empty log would be indistinguishable from inert stubs.
4. The `hermetic-isolation.test.ts` header no longer claims a scanner poison it does not apply,
   and names the file that carries the larger claim.

*Status.* closed.

### G5 — the verifier sampled five packages and the closure count was overstated (closed at R3.4.4)

Two separate defects in the same delivery, both recorded here because both were reported as
stronger than they were.

**G5a — `PACKAGE_SAMPLE`.** R3.4.3 introduced a shared trivy `Results` validator and the
delivery report described it as requiring "nonempty `Packages`" with "valid identity fields".
What it actually did was validate the **first five packages** of each result and accept any
nonempty string as a PURL. The constant was named `PACKAGE_SAMPLE = 5` and carried a comment
justifying the sample on the grounds that a fabricated array "fails on its first entries".
**That reasoning was wrong.** It assumes a forger who corrupts from the beginning. Truncating a
genuine 229-package result to five passed, as did truncating it to one, as did corrupting every
package from index five onward. A sample cannot establish a property of a set.

**Closure.** The sample is deleted. Every package in every filesystem and image result is
validated, each PURL is parsed with the same exact-pinned `packageurl-js@2.0.1` the C16 closure
uses, and the reported set is measured in both directions against source: every reported
package must exist in the lockfile universe derived from `pnpm-lock.yaml`, and every production
registry package the deterministic C16 closure derives must appear in the report. Neither bound
is written down as a number — both are derived per run and reported as measured.

**G5b — the R3.4.3 §F arithmetic.** The delivery report stated that
`final-receipt-semantics.test.ts` contained "17 closures plus one recorded case". The file
contains 18 tests, and the correct decomposition is **1 positive baseline + 16 reproduced
R3.4.2 false-pass closures + 1 already-caught case**. The baseline was double-counted as a
closure. The file header now states the arithmetic so a future report cannot restate it wrongly.

**Also corrected at R3.4.4, for the record.** Four frozen verifier fixtures shipped with frozen
COPIES of the shared argv contract. That was a mistake in kind: the contract is tracked source
that the producer and every verifier must read identically, so freezing it makes an unrelated
producer change look like a verifier disagreement. The R3.4.1, R3.4.2 and R3.4.3 fixtures now
read the live contract. The R3.4 copy is retained, because it exists to freeze the pre-R3.4.1
absolute-path argv convention that its controls exercise, and it carries a note saying so.

*Status.* closed.

### Deferred to C19 (explicitly NOT in this patch)

* Replace Node-20 actions.
* Protect `main` with required checks.
* Signed immutable release tag / signed provenance attestation.
* Publish final evidence at a durable, anonymously downloadable location, removing the
  dependency on expiring authenticated GitHub Actions artifact downloads.
