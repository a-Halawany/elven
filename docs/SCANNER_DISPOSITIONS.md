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
| Second pinned image | `redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241` → `linux/amd64` child `sha256:a6a88248ad5b0c724b7f2b380b7d21f46097db158b2b077ef85bcb97f90aee3a` — **2 HIGH findings, governed by SCX-0008 and SCX-0009** |

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

Twenty-seven findings across the two `linux/amd64` children — twenty-five on postgres and two on
redis — governed by nine records.

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
2026-08-14, and the gate failed closed on the difference rather than absorbing it. (That count is
the postgres image as of this amendment; CVE-2026-14456 later added two more, and §3's
reconciliation table carries the current figures.)

`CVE-2026-46600` is **no longer reported** for this image. It was governed here and became a STALE
record — an approval covering nothing — which the gate rejects. It is removed. That is a
DATABASE-STATE change, not a remediation: the advisory left the scanner's data, the binary did not
change, and if it returns it must be reviewed again on its merits.

Six new HIGH `stdlib` advisories appeared. C17.1 added them to THIS record while leaving
`approved_on` at 2026-08-14 — approving, on paper, advisories that did not exist in our evidence
until the following day. That is a backdated approval and it is corrected here: the six are held by
**SCX-0005**, approved and reviewed on 2026-08-15, the date the review actually happened. This
record keeps its original single advisory and its actual 2026-08-14 approval.

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

**Current reconciliation.** The postgres image scan reports **25** findings and the redis image
reports **2**, for 27 in total, governed as:

| Record | Image | Findings |
|---|---|---|
| SCX-0001 | postgres | 1 — `c-ares` |
| SCX-0002 | postgres | 14 — `stdlib`, risk-accepted |
| SCX-0003 | postgres | 1 — `stdlib`, CRITICAL |
| SCX-0004 | postgres | 1 — `stdlib`, NOT_AFFECTED |
| SCX-0005 | postgres | 6 — `stdlib`, NOT_AFFECTED, approved 2026-08-15 |
| SCX-0006 | postgres | 1 — `libcrypto3`, CVE-2026-14456 |
| SCX-0007 | postgres | 1 — `libssl3`, CVE-2026-14456 |
| SCX-0008 | redis | 1 — `libcrypto3`, CVE-2026-14456 |
| SCX-0009 | redis | 1 — `libssl3`, CVE-2026-14456 |

25 + 2 = 27, with 0 unmatched and 0 unused. Redis is no longer clean: it acquired two findings
when CVE-2026-14456 was published, and the summary above says so.



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
were first seen by this project on 2026-08-15. SCX-0004 was created and approved on 2026-08-14
for the advisory its evidence then contained. Adding these six to that record on the following
day — which C17.1 did — made the earlier approval appear to cover evidence it had never reviewed.
A record's approval date is a claim about the reviewed scope, not a reusable timestamp. So the
six are approved here, on the date their review happened, and SCX-0004 keeps its own chronology.

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

**Current reconciliation.** 27 findings: SCX-0001 (1) + SCX-0002 (14) + SCX-0003 (1) +
SCX-0004 (1) + SCX-0005 (6) + SCX-0006 (1) + SCX-0007 (1) + SCX-0008 (1) + SCX-0009 (1) = 27, with
0 unmatched and 0 unused.


### SCX-0006 — OpenSSL `libcrypto3` in postgres (QUIC listener DoS)

| Field | Value |
|---|---|
| Advisory | `CVE-2026-14456` |
| Severity (scanner) | HIGH |
| Severity (vendor) | **Low** — OpenSSL's own severity rating for this advisory |
| CVSS | 7.5 `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` (Red Hat) — availability only |
| Package | `libcrypto3` |
| PURL | `pkg:apk/alpine/libcrypto3@3.5.7-r0?arch=x86_64&distro=3.24.1` |
| Installed version | `3.5.7-r0` |
| Fixed version | `3.5.8-r0` |
| Result target | `postgres@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b (alpine 3.24.1)` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-09-01 |
| Expires | 2026-11-05 |

### SCX-0007 — OpenSSL `libssl3` in postgres (QUIC listener DoS)

| Field | Value |
|---|---|
| Advisory | `CVE-2026-14456` |
| Severity (scanner) | HIGH |
| Severity (vendor) | **Low** |
| Package | `libssl3` |
| PURL | `pkg:apk/alpine/libssl3@3.5.7-r0?arch=x86_64&distro=3.24.1` |
| Installed version | `3.5.7-r0` |
| Fixed version | `3.5.8-r0` |
| Result target | `postgres@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b (alpine 3.24.1)` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-09-01 |
| Expires | 2026-11-05 |

### SCX-0008 — OpenSSL `libcrypto3` in redis (QUIC listener DoS)

| Field | Value |
|---|---|
| Advisory | `CVE-2026-14456` |
| Severity (scanner) | HIGH |
| Severity (vendor) | **Low** |
| Package | `libcrypto3` |
| PURL | `pkg:apk/alpine/libcrypto3@3.5.7-r0?arch=x86_64&distro=3.23.5` |
| Installed version | `3.5.7-r0` |
| Fixed version | `3.5.8-r0` |
| Result target | `redis@sha256:a6a88248ad5b0c724b7f2b380b7d21f46097db158b2b077ef85bcb97f90aee3a (alpine 3.23.5)` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-09-01 |
| Expires | 2026-11-05 |

### SCX-0009 — OpenSSL `libssl3` in redis (QUIC listener DoS)

| Field | Value |
|---|---|
| Advisory | `CVE-2026-14456` |
| Severity (scanner) | HIGH |
| Severity (vendor) | **Low** |
| Package | `libssl3` |
| PURL | `pkg:apk/alpine/libssl3@3.5.7-r0?arch=x86_64&distro=3.23.5` |
| Installed version | `3.5.7-r0` |
| Fixed version | `3.5.8-r0` |
| Result target | `redis@sha256:a6a88248ad5b0c724b7f2b380b7d21f46097db158b2b077ef85bcb97f90aee3a (alpine 3.23.5)` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved | 2026-09-01 |
| Expires | 2026-11-05 |

**Classification: `RISK_ACCEPTED`, for all four.**

Not `NOT_AFFECTED`. The affected OpenSSL code is installed in both images. The absence of any QUIC
server listener is a strong reachability limitation and is recorded below as the primary
compensating control, but it is not proof that the vulnerable code is absent, and the disposition
does not claim to be.

**Reason.** The defect is unbounded memory growth in an OpenSSL **QUIC server listener**: when a
`Listener` SSL object processes valid QUIC Initial packets for unknown destination connection IDs,
it queues new incoming channels without any limit, so a peer that sends Initial packets faster than
the application accepts connections can exhaust memory. Reaching it requires the application to
create a QUIC Listener SSL object.

`3.5.8-r0` carries the fix and Alpine published that package on 2026-08-25, but **no official
`postgres:18-alpine` or `redis:8-alpine` image has been rebuilt with it.** Re-resolved against live
registry data on 2026-09-01 with a Trivy database updated the same day:

| Tag | Current official digest | OpenSSL |
|---|---|---|
| `postgres:18-alpine` | `sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2` | `3.5.7-r0` |
| `redis:8-alpine` | `sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576` | `3.5.7-r0` |

Re-pinning to those digests would not clear the finding. The Debian-based variants are far worse —
`postgres:18` carries 109 HIGH/CRITICAL findings and `redis:8` carries 53, both including their own
OpenSSL findings — so they are not a remediation either. There is therefore no patched official
image to re-pin to, which is why these are dispositions rather than an upgrade.

**Compensating controls.**
1. **Neither service runs a QUIC listener.** PostgreSQL serves its wire protocol over TCP and Redis
   serves RESP over TCP; this repository contains no QUIC configuration for either. The vulnerable
   entry point is not exercised.
2. Redis in this profile runs without TLS at all — `docker-compose.yml` starts it with
   `redis-server --requirepass` and no TLS port.
3. Both services are bound to loopback only: `127.0.0.1:5432:5432` and `127.0.0.1:6379:6379`.
4. The advisory is availability-only (`C:N/I:N/A:H`); OpenSSL's own vendor rating is **Low**.
5. ADR-P0-01 monthly patch cadence re-pins and re-scans as a blocking release gate.

**Automatic recheck.** `scripts/gate/check-patched-images.mjs` resolves the current official
`postgres:18-alpine` and `redis:8-alpine` digests and scans them for this advisory. When a patched
official digest appears it fails, naming the digest to re-pin to; these four records must then be
deleted, because the gate rejects a record that matches nothing.

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

* Every record expires **2026-11-05** and is rejected by the gate **on** that date — the comparison
  is `expires_on <= runDate`, so the record is not in force during its stated expiry day. That
  expiry IS the mandatory re-review deadline for SCX-0006 to SCX-0009; a separate
  `mandatory_rereview_by` field was removed because it duplicated `expires_on` and nothing
  validated it, which made it look like a second control while being none.
* ADR-P0-01 requires a monthly re-pin and re-scan; a re-pin that clears a finding must
  delete the corresponding record, because an unused record fails the gate as stale.
* Owner and approver must remain distinct parties; a record cannot approve itself.
* This document's SHA-256 is bound by every citing record. Editing it — even by one byte —
  invalidates those records until the digest is re-approved.
