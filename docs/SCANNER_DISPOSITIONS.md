# Container-image vulnerability dispositions — Phase 0

**Controlled evidence document for `scripts/gate/scanner-exclusions.json`.**

This document exists because a governed disposition must point at evidence that actually
describes the findings it governs. It replaces the previous references to
`PHASE0_EVIDENCE.md`, which is a general gate-evidence summary: it did not identify these
findings, their digests, their platform or their scanner identity, so it could not be
reviewed as the basis for these decisions.

Each disposition record in `scripts/gate/scanner-exclusions.json` binds this file by its
exact SHA-256. Changing a single byte of this document invalidates every record that cites
it, and the gate recomputes the digest from these bytes on every run.

---

## 1. What was scanned

| Item | Value |
|---|---|
| Configured reference | `postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` |
| Reference kind | OCI image **index** (manifest list), 16 children — 8 runnable platforms + 8 buildkit attestations |
| Resolved platform | `linux/amd64` |
| Scanned child manifest | `sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b` |
| Index integrity check | SHA-256 of the raw returned index manifest is verified to equal the digest in the configured reference **before** any child digest is trusted |
| Upstream tag (informational) | `postgres:18-alpine` |
| Second pinned image | `redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241` → `linux/amd64` child `sha256:a6a88248ad5b0c724b7f2b380b7d21f46097db158b2b077ef85bcb97f90aee3a` — **clean at HIGH/CRITICAL, no dispositions** |

The `linux/amd64` child is the one that matters: CI runs on `ubuntu-latest` and the C16
target descriptor resolves `linux/x64/glibc`. A scanner given no `--platform` follows the
host, so an arm64 workstation would examine a different child with different layers and
different findings. Every disposition below is therefore scoped to `linux/amd64` and cannot
govern a finding on any other platform.

## 2. Scanner and database identity

| Item | Value |
|---|---|
| Scanner | `trivy` **0.73.0** |
| Executable authentication | The release archive digest **and** the extracted executable digest are verified at install; the runner re-digests the executable it resolves before scanning. Distribution rebuilds (e.g. Homebrew) report the same version with different bytes and are rejected. |
| Vulnerability DB | `mirror.gcr.io/aquasec/trivy-db:2`, schema version 2, bound by the byte digests of `<cache>/db/metadata.json` and `<cache>/db/trivy.db`. trivy 0.73 publishes no OCI digest for the vuln DB; that upstream limitation is recorded rather than papered over. |
| Freshness ceiling | 24 hours, computed against the scan timestamp; past-due, negative-age, malformed and absent all fail closed. |
| Misconfiguration checks bundle | `mirror.gcr.io/aquasec/trivy-checks:2`, OCI digest `sha256:1583562f8b90ed2a071b99f0e5ffff6b57e4ceb6ca3e4796577b4e6a339eb74c`, major version 2 |
| Scan mode | `--ignorefile /dev/null` — **no suppression**. The complete finding set is reconciled against the records below; trivy's own ignore mechanism is never relied upon. |
| Cache discipline | Authoritative scans run `--skip-db-update --skip-check-update` against a captured isolated cache whose byte-level fingerprint is proven unchanged afterwards. |
| Severity filter | `HIGH,CRITICAL` |

## 3. Findings and their dispositions

Sixteen findings on the `linux/amd64` postgres child, governed by three records.

### SCX-0001 — c-ares (OS package)

| Field | Value |
|---|---|
| Advisory | `CVE-2026-33630` |
| Severity | HIGH |
| Package | `c-ares` |
| PURL | `pkg:apk/alpine/c-ares@1.34.6-r0?arch=x86_64&distro=3.24.1` |
| Installed version | `1.34.6-r0` |
| Result target | `postgres@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b (alpine 3.24.1)` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-08-05 |
| Expires | 2026-11-05 |

**Reason.** `c-ares 1.34.6-r0` is an Alpine OS package inside `postgres:18-alpine`. The fix
(`1.34.8-r0`) is not present in any published `postgres:18-alpine` build, so there is no
patched official image to re-pin to. The finding is denial-of-service class against DNS
resolution.

**Compensating controls.**
1. PostgreSQL is bound to loopback only — `docker-compose.yml` publishes
   `127.0.0.1:5432:5432` — so the resolver is not reachable from off-host.
2. Phase 0 runs a LOCAL-ONLY development profile under `EXC-P0-004`.
3. ADR-P0-01 monthly patch cadence re-pins and re-scans as a blocking release gate.

### SCX-0002 — Go standard library in `gosu` (HIGH set)

| Field | Value |
|---|---|
| Advisories | `CVE-2025-61726`, `CVE-2025-61729`, `CVE-2026-25679`, `CVE-2026-27145`, `CVE-2026-32280`, `CVE-2026-32281`, `CVE-2026-32283`, `CVE-2026-33811`, `CVE-2026-33814`, `CVE-2026-39820`, `CVE-2026-39821`, `CVE-2026-39822`, `CVE-2026-39836`, `CVE-2026-42499`, `CVE-2026-42504`, `CVE-2026-46600` (16) |
| Severity | HIGH |
| Package | `stdlib` |
| PURL | `pkg:golang/stdlib@v1.24.6` |
| Installed version | `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-08-05 |
| Expires | 2026-11-05 |

**Reason.** Go standard-library advisories compiled into the upstream `gosu` 1.19 binary
shipped by every current official postgres image variant. `gosu` executes once at container
start to drop root privileges and then exits; the affected surfaces (`net/http`, `net/mail`,
crypto DoS classes) are not exercised by that use. No patched official postgres build
exists.

**Compensating controls.**
1. `gosu` runs once at container start; it is neither a long-lived process nor a network
   listener.
2. PostgreSQL itself is loopback-bound.
3. Phase 0 runs a LOCAL-ONLY development profile under `EXC-P0-004`.
4. ADR-P0-01 monthly patch cadence re-pins and re-scans as a blocking release gate.

**Amendment 2026-08-14 (C16-R3.4.4).** `CVE-2026-39821` and `CVE-2026-46600` were added to this
record. Both are HIGH Go standard-library advisories published upstream after 2026-08-05, both
resolve against the identical `pkg:golang/stdlib@v1.24.6` compiled into the same
`usr/local/bin/gosu` binary in the same digest-pinned postgres image, and neither has a patched
official postgres build. They were not "found" by any change in this round: the gate FAILED
CLOSED on them the first time it re-scanned after the trivy advisory database advanced, which is
the mechanism working. They are held under this record rather than a new one because every
identity field — image, platform, package, PURL, installed version, severity, result target — is
the one this record already governs, and the reasoning above applies unchanged. The expiry is
NOT extended: this record still lapses 2026-11-05 with the rest of the set.

**This amendment requires ratification.** It records that two newly published HIGH
vulnerabilities in a shipped image are accepted for Phase 0. It was made to unblock the R3.4.4
delivery under the same approval basis as the fourteen advisories already in the record, and it
should be reviewed on its own terms rather than inherited silently.

### SCX-0003 — Go standard library in `gosu` (the single CRITICAL)

| Field | Value |
|---|---|
| Advisory | `CVE-2025-68121` |
| Severity | **CRITICAL** |
| Package | `stdlib` |
| PURL | `pkg:golang/stdlib@v1.24.6` |
| Installed version | `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-08-05 |
| Expires | 2026-11-05 |

**Reason.** The same upstream `gosu` binary, but held as a **separate record on purpose**. A
disposition approved for HIGH must not silently absorb a CRITICAL that appears later under
the same package: the critical finding carries its own explicit approval and its own
single-value severity array, so a severity escalation cannot be inherited.

**Compensating controls.** As SCX-0002, plus: this disposition is explicitly invalid for any
external or customer-data use, and re-review is required before any such use regardless of
the expiry date.

## 4. Prohibited exposure

These dispositions are valid **only** for the Phase 0 LOCAL-ONLY development profile
(`EXC-P0-004`). The following are prohibited while any record here is in force:

* exposure of PostgreSQL or Redis on any non-loopback interface;
* processing of customer, production or personal data;
* any externally reachable deployment, demonstration or shared environment;
* carrying these dispositions into a Phase 1 or later profile without fresh review.

Before any such use the images must be re-pinned to patched builds and re-scanned as a
blocking release gate.

## 5. Review obligations

* Every record expires **2026-11-05** and is rejected by the gate from that date.
* ADR-P0-01 requires a monthly re-pin and re-scan; a re-pin that clears a finding must
  delete the corresponding record, because an unused record fails the gate as stale.
* Owner and approver must remain distinct parties; a record cannot approve itself.
* This document's SHA-256 is bound by every citing record. Editing it — even by one byte —
  invalidates those records until the digest is re-approved.
