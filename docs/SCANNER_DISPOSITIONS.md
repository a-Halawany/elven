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

Twenty-three findings on the `linux/amd64` postgres child, governed by five records.

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
| Advisories | `CVE-2025-61726`, `CVE-2025-61729`, `CVE-2026-25679`, `CVE-2026-27145`, `CVE-2026-32280`, `CVE-2026-32281`, `CVE-2026-32283`, `CVE-2026-33811`, `CVE-2026-33814`, `CVE-2026-39820`, `CVE-2026-39822`, `CVE-2026-39836`, `CVE-2026-42499`, `CVE-2026-42504` (14) |
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


### SCX-0004 — Go standard library in `gosu`, NOT_AFFECTED by symbol analysis

| Field | Value |
|---|---|
| Advisories | `CVE-2026-39821` (1) |
| Severity | HIGH |
| Classification | **NOT_AFFECTED — vulnerable_code_not_present** (version-only match) |
| Image (index) | `postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` |
| Scanned child | `postgres@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b` |
| Platform | `linux/amd64` |
| Package | `stdlib` |
| PURL | `pkg:golang/stdlib@v1.24.6` |
| Installed version | `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Binary sha256 | `52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-08-14 |
| Expires | 2026-11-05 |

**Publication timeline — correcting the R3.4.4 record.** The C16-R3.4.4 amendment stated these
two advisories were "published upstream after 2026-08-05". **That was false.** Their NVD
publication dates, read from the scan output itself, are:

| Advisory | Published | Last modified |
|---|---|---|
| `CVE-2026-39821` | 2026-05-22 | 2026-08-13 |
| `CVE-2026-46600` | 2026-07-21 | 2026-08-13 | *(withdrawn from the scanner database, see below)* |

Both predate the 2026-08-05 approval of SCX-0002. What changed on 2026-08-13 was the **scanner
advisory database**, which ingested them; the gate then failed closed on the next run. The
distinction matters: it means these were not governed by SCX-0002's review because that review
never saw them, not because they did not exist.

**Why a separate record, and why not SCX-0002.** SCX-0002 is a *risk-accepted* disposition: it
records that reachable-but-unexercised HIGH advisories in `gosu` are tolerated for Phase 0 on
operational grounds. These two are a different KIND of claim — the vulnerable code is not
present in the binary at all — and that claim carries its own separate approval and its own
evidence, under the same 2026-11-05 expiry as the rest of the set. Folding them into SCX-0002 (as R3.4.4 did) conflated "we accept this risk" with
"this risk does not apply", which is precisely the collapse SCX-0003 was split out to avoid.

**Amendment 2026-08-15 — the advisory database moved, and the six new advisories were NOT
backdated into this record.**

The image reference is digest-pinned and its bytes have not changed. The trivy advisory database
has: a scan of the identical child manifest reports **23** findings where it reported 18 on
2026-08-14, and the gate failed closed on the difference rather than absorbing it.

`CVE-2026-46600` is **no longer reported** for this image. It was governed here and became a STALE
record — an approval covering nothing — which the gate rejects. It is removed. That is a
DATABASE-STATE change, not a remediation: the advisory left the scanner's data, the binary did not
change, and if it returns it must be reviewed again on its merits.

Six new HIGH `stdlib` advisories appeared. C17.1 added them to THIS record while leaving
`approved_on` at 2026-08-14 — approving, on paper, advisories that did not exist in our evidence
until the following day. That is a backdated approval and it is corrected here: the six are held by
**SCX-0005**, approved and reviewed on 2026-08-15, the date the review actually happened. This
record keeps its original single advisory and its original 2026-08-05 approval.

**Basis — symbol-aware analysis of the exact binary.** `govulncheck` was run in binary mode
against `/usr/local/bin/gosu` extracted from the exact `linux/amd64` child manifest scanned by
the gate. It performs call-graph reachability from the binary's symbol table, not version
matching. Verdict:

```
=== Symbol Results ===

No vulnerabilities found.

Your code is affected by 0 vulnerabilities.
This scan also found 3 vulnerabilities in packages you import and 42
vulnerabilities in modules you require, but your code doesn't appear to call
these vulnerabilities.
```

Both advisories appear in that "modules you require" tail and in neither of the reachable sets:

| Advisory | Go advisory | Vulnerable symbol called? |
|---|---|---|
| `CVE-2026-39821` | `GO-2026-5026` | no |
| `CVE-2026-46600` | `GO-2026-5942` | no |

`govulncheck` reported **0** called vulnerable symbols across all 48 findings and 168 advisories
it considered. Trivy's finding is therefore a version-only match against the Go toolchain
stamped in the binary, with no corresponding reachable code.

**Bound evidence artifacts** (tracked, and bound transitively by this document's own digest):

| Artifact | sha256 |
|---|---|
| `docs/evidence/govulncheck-gosu-b6a16ed0.json` | `e7d06bcc9da3181c417f1287b1bfc14bc0446a167a82733464e3fa619553be26` |
| `docs/evidence/govulncheck-gosu-b6a16ed0.txt` | `cdcd7ff7fe62a6b19677b19a23db04c406f473920e2663b13c7a51232743fbab` |

The JSON artifact carries the scanner configuration (govulncheck `v1.7.0`, Go `go1.25.13`,
`https://vuln.go.dev` as of 2026-08-14), the binary's identity and digest, every advisory
considered with its aliases and affected ranges, and every finding with its complete call
trace. Advisory prose is the only thing omitted.

**Compensating controls.** The NOT_AFFECTED classification is the primary basis; SCX-0002's
operational controls apply as defence in depth (`gosu` runs once at container start and exits;
PostgreSQL is loopback-bound; Phase 0 is a LOCAL-ONLY profile under `EXC-P0-004`; ADR-P0-01
re-pins and re-scans monthly as a blocking gate).

**Limits, stated.** `govulncheck` reachability is a static over-approximation of what a binary
can call; it does not prove unreachability under reflection or dynamic dispatch. It also
reflects the Go vulnerability database as of the run date. This record therefore expires with
the rest of the set on **2026-11-05** and is not extended by its stronger basis.

**Current reconciliation.** The postgres image scan reports **23** findings, governed as:
SCX-0001 (1, `c-ares`) + SCX-0002 (14, `stdlib` risk-accepted) + SCX-0003 (1, `stdlib`
CRITICAL) + SCX-0004 (1, `stdlib` NOT_AFFECTED) + SCX-0005 (6, `stdlib` NOT_AFFECTED, approved
2026-08-15) = 23, with 0 unmatched and 0 unused.



### SCX-0005 — six later Go stdlib advisories in `gosu`, NOT_AFFECTED by symbol analysis

| Field | Value |
|---|---|
| Advisories | `CVE-2026-33818`, `CVE-2026-56853`, `CVE-2026-56858`, `CVE-2026-56859`, `CVE-2026-56860`, `CVE-2026-56862` (6) |
| Severity | HIGH |
| Classification | **NOT_AFFECTED — vulnerable_code_not_present** (version-only match) |
| Image (index) | `postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` |
| Scanned child | `postgres@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b` |
| Platform | `linux/amd64` |
| Package | `stdlib` |
| PURL | `pkg:golang/stdlib@v1.24.6` |
| Installed version | `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-08-15 |
| Reviewed | 2026-08-15 |
| Expires | 2026-11-05 |

**Why a separate record.** These six advisories entered the scanner's database on 2026-08-14 and
were first seen by this project on 2026-08-15. SCX-0004 was approved on 2026-08-05 and amended on
2026-08-14. Adding them to SCX-0004 — which C17.1 did — meant an approval dated before the
advisories were known covered them anyway. A record's approval date is a claim about when a human
looked; it cannot precede the thing being looked at. So the six are approved here, on the date the
review happened, and SCX-0004 keeps its own chronology.

**Basis.** `govulncheck` binary-mode symbol analysis of the exact `gosu` binary (sha256
`52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0`, extracted from the
`linux/amd64` child), with the Go vulnerability database as of 2026-08-14, reports **0 called
vulnerable symbols** across 48 findings and 168 advisories. Each of the six is present in that
analysis and unreachable:

| Advisory | Go advisory | Vulnerable symbol called? |
|---|---|---|
| `CVE-2026-33818` | `GO-2026-5972` | no |
| `CVE-2026-56853` | `GO-2026-6089` | no |
| `CVE-2026-56858` | `GO-2026-6091` | no |
| `CVE-2026-56859` | `GO-2026-6088` | no |
| `CVE-2026-56860` | `GO-2026-6218` | no |
| `CVE-2026-56862` | `GO-2026-6090` | no |

**Bound evidence.** The same two artifacts SCX-0004 binds, `docs/evidence/govulncheck-gosu-b6a16ed0.json`
and `.txt`, whose digests are recorded in both records and recomputed by the gate each run.

**Compensating controls and limits.** As SCX-0004: `gosu` runs once at container start and exits;
PostgreSQL is loopback-bound; Phase 0 is LOCAL-ONLY under `EXC-P0-004`; ADR-P0-01 re-pins and
re-scans monthly as a blocking gate. Reachability analysis is a static over-approximation and does
not cover reflection or dynamic dispatch, so the operational controls still apply. Expiry is
**2026-11-05**, no later than the rest of the set.

**Current reconciliation.** 23 findings: SCX-0001 (1) + SCX-0002 (14) + SCX-0003 (1) +
SCX-0004 (1) + SCX-0005 (6) = 23, with 0 unmatched and 0 unused.


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
