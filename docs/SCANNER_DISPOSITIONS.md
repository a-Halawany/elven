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

**Re-pin of 2026-09-10 (TEMPORARY, owner-approved — `docs/images/DERIVED_IMAGES_APPROVAL.md`).**
The two configured references are the derived maintenance images published by
`.github/workflows/publish-derived-images.yml` (run `34502081248`, bound to the approved recipes of
`59a2459`, receipts under `infra/images/published/20260910/`) from `infra/images/candidates/v2/`:
the previously pinned official indexes plus the util-linux, OpenSSL and c-ares fixes and an
explicit non-root `USER`. Sections 1 and 3 describe THESE artefacts; the official images they
were derived from, and the records that governed their findings, are recorded in §3.6.

| Item | postgres | redis |
|---|---|---|
| Configured reference | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` | `ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15` |
| Human tag (informational) | `ghcr.io/a-halawany/elven/postgres:18-alpine-maint-20260910` | `ghcr.io/a-halawany/elven/redis:8-alpine-maint-20260910` |
| Reference kind | OCI image **index**, 2 children, both runnable platforms, no attestation manifests | same |
| Resolved platform | `linux/amd64` | `linux/amd64` |
| Scanned child manifest | `sha256:bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a` | `sha256:0c0a48ddfcea413916152bc64e91c665d0822053099d9bc385a4747d71609432` |
| Other child (not scanned by the gate) | `linux/arm64` `sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc` | `linux/arm64` `sha256:c11d75cace5d4effc9524e6baa11f559440f398e6f53899332557bf455ad56dc` |
| Index integrity check | SHA-256 of the raw returned index manifest is verified to equal the digest in the configured reference **before** any child digest is trusted (verified 2026-09-10 by anonymous fetch: 647 bytes each, digests equal) | same |
| Derived from (official index) | `postgres:18-alpine` `sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` (Alpine 3.24.1) | `redis:8-alpine` `sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241` (Alpine 3.23.5) |
| Packages changed by the derivation | `libuuid` 2.42.1-r0 → 2.42.3-r1; `libcrypto3`/`libssl3` 3.5.7-r0 → 3.5.8-r0; `c-ares` 1.34.6-r0 → 1.34.8-r0; `USER postgres` | `setpriv` 2.41.4-r0 → 2.41.6-r1; `libcrypto3`/`libssl3` 3.5.7-r0 → 3.5.8-r0; `USER redis` |
| HIGH/CRITICAL findings on the scanned child | **22**, all Go-stdlib rows in `usr/local/bin/gosu` (unchanged binary), governed by SCX-0002…0005; OS packages: **0** | **0** |

The `linux/amd64` child is the one that matters: CI runs on `ubuntu-latest` and the C16
target descriptor resolves `linux/x64/glibc`. A scanner given no `--platform` follows the
host, so an arm64 workstation would examine a different child with different layers and
different findings. Every disposition below is therefore scoped to `linux/amd64` and cannot
govern a finding on any other platform. (The `linux/arm64` children were scanned by the
publisher with the same scanner and carry the identical 22-row `gosu` set and 0 OS findings —
`infra/images/published/20260910/postgres-arm64.trivy.txt` — but that scan is not the gate's.)

## 2. Scanner and database identity

| Item | Value |
|---|---|
| Scanner | `trivy` **0.73.0** |
| Executable authentication | The release archive digest **and** the extracted executable digest are verified at install; the runner re-digests the executable it resolves before scanning. Distribution rebuilds (e.g. Homebrew) report the same version with different bytes and are rejected. |
| Vulnerability DB | `mirror.gcr.io/aquasec/trivy-db:2`, schema version 2, bound by the byte digests of `<cache>/db/metadata.json` and `<cache>/db/trivy.db`. trivy 0.73 publishes no OCI digest for the vuln DB; that upstream limitation is recorded rather than papered over. |
| Freshness ceiling | 24 hours, computed against the scan timestamp; past-due, negative-age, malformed and absent all fail closed. |
| Misconfiguration checks bundle | `mirror.gcr.io/aquasec/trivy-checks:2`, major version 2; the OCI digest is captured per run in the evidence manifest (`sha256:1583562f8b90ed2a071b99f0e5ffff6b57e4ceb6ca3e4796577b4e6a339eb74c` at the 2026-08-13 run that first produced this document) |
| Scan mode | `--ignorefile /dev/null` — **no suppression**. The complete finding set is reconciled against the records below; trivy's own ignore mechanism is never relied upon. |
| Cache discipline | Authoritative scans run `--skip-db-update --skip-check-update` against a captured isolated cache whose byte-level fingerprint is proven unchanged afterwards. |
| Severity filter | `HIGH,CRITICAL` |

## 3. Findings and their dispositions

Twenty-two findings across the two `linux/amd64` children — twenty-two on postgres, all in the
`gosu` binary, and none on redis — governed by four records (SCX-0002…0005), every one of them
**re-issued on 2026-09-10** for the derived image. The five records that governed findings of the
official images and now match nothing (SCX-0001, SCX-0006…0009) are retired in §3.6.

**What a re-issue is, and is not.** A record is scoped to an exact image digest. The image digest
changed, so each surviving record was re-approved for the new scope on 2026-09-10 (`approved_on`
and `reviewed_on` say so — an approval date is a claim about when a human looked at THIS scope,
and the repository has already corrected one backdated approval, see SCX-0004). What did NOT
change: the advisories, package, PURL, installed version, severities and result target; the
evidence and its dates (the govulncheck analysis of 2026-08-14, Go vulnerability database as of
2026-08-14); and the expiry, 2026-11-05, which is not extended by the re-issue. The basis for
carrying the analysis over is byte identity: `/usr/local/bin/gosu` in the derived image is the
same file as in the base on each platform — `linux/amd64`
`52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0` (1,769,900 bytes,
`1.19 (go1.24.6 on linux/amd64; gc)`), `linux/arm64`
`3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44` — recorded in
`infra/images/candidates/evidence/v2/gosu-verification.txt` (bound by every record, sha256
`e0f901da541867530146e9869337d17b1ac880c0d2f2312240f9d857bc830359`) and re-measured on
2026-09-10 inside the PUBLISHED children (`sha256sum /usr/local/bin/gosu` in
`ghcr.io/…/postgres@sha256:bc90ce6b…` and `@sha256:d3dd485b…`, same digests, same sizes, same
toolchain stamp). The unsuppressed scan of the published `linux/amd64` child reports the identical
22 rows (same advisories, `pkg:golang/stdlib@v1.24.6`, target `usr/local/bin/gosu`).


### SCX-0002 — Go standard library in `gosu` (HIGH set)

| Field | Value |
|---|---|
| Advisories | `CVE-2025-61726`, `CVE-2025-61729`, `CVE-2026-25679`, `CVE-2026-27145`, `CVE-2026-32280`, `CVE-2026-32281`, `CVE-2026-32283`, `CVE-2026-33811`, `CVE-2026-33814`, `CVE-2026-39820`, `CVE-2026-39822`, `CVE-2026-39836`, `CVE-2026-42499`, `CVE-2026-42504` (14) |
| Severity | HIGH |
| Package | `stdlib` |
| PURL | `pkg:golang/stdlib@v1.24.6` |
| Installed version | `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Image (index) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` |
| Scanned child | `sha256:bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a` (`linux/amd64`) |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Originally approved | 2026-08-05, for `postgres@sha256:9a8afca5…` (child `b6a16ed0…`) |
| Re-issued (approved / reviewed) | 2026-09-10, for the derived image above |
| Expires | 2026-11-05 (unchanged) |

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
| Image (index) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` |
| Scanned child | `sha256:bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a` (`linux/amd64`) |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Originally approved | 2026-08-05, for `postgres@sha256:9a8afca5…` (child `b6a16ed0…`) |
| Re-issued (approved / reviewed) | 2026-09-10, for the derived image above |
| Expires | 2026-11-05 (unchanged) |

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
| Image (index) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` |
| Scanned child | `sha256:bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a` |
| Analysed on (evidence) | `postgres@sha256:9a8afca5…`, child `b6a16ed0…` — the same `gosu` bytes, see the re-issue note below |
| Platform | `linux/amd64` |
| Package | `stdlib` |
| PURL | `pkg:golang/stdlib@v1.24.6` |
| Installed version | `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Binary sha256 | `52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0` (identical in the base child `b6a16ed0…` and the derived child `bc90ce6b…`) |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Originally approved | 2026-08-14, for `postgres@sha256:9a8afca5…` |
| Re-issued (approved / reviewed) | 2026-09-10, for the derived image above |
| Expires | 2026-11-05 (unchanged) |

**Re-issue note, 2026-09-10.** The image reference changed; the analysed binary did not. The
derived image's recipe (`infra/images/candidates/v2/postgres-18-alpine.Dockerfile`) touches four apk
packages and the config `USER` and never `/usr/local/bin/gosu`; `infra/images/candidates/evidence/v2/gosu-verification.txt`
records the binary's sha256, size, mtime and toolchain stamp as identical between the base child
and the candidate on both platforms, and the same measurement was repeated inside the published
children on 2026-09-10 (§3, opening). The govulncheck evidence bound below therefore describes the
binary the gate now scans, and neither its date (2026-08-14) nor the expiry is extended.

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

**Current reconciliation.** See §3.5.



### SCX-0005 — six later Go stdlib advisories in `gosu`, NOT_AFFECTED by symbol analysis

| Field | Value |
|---|---|
| Advisories | `CVE-2026-33818`, `CVE-2026-56853`, `CVE-2026-56858`, `CVE-2026-56859`, `CVE-2026-56860`, `CVE-2026-56862` (6) |
| Severity | HIGH |
| Classification | **NOT_AFFECTED — vulnerable_code_not_present** (version-only match) |
| Image (index) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` |
| Scanned child | `sha256:bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a` |
| Analysed on (evidence) | `postgres@sha256:9a8afca5…`, child `b6a16ed0…` — the same `gosu` bytes (SCX-0004, re-issue note) |
| Platform | `linux/amd64` |
| Package | `stdlib` |
| PURL | `pkg:golang/stdlib@v1.24.6` |
| Installed version | `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Originally approved / reviewed | 2026-08-15, for `postgres@sha256:9a8afca5…` |
| Re-issued (approved / reviewed) | 2026-09-10, for the derived image above |
| Expires | 2026-11-05 (unchanged) |

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

**Current reconciliation.** See §3.5.

### 3.5 Current reconciliation (2026-09-10)

The postgres image scan reports **22** findings and the redis image **0**, governed as:

| Record | Image | Classification | Findings |
|---|---|---|---|
| SCX-0002 | postgres | RISK_ACCEPTED | 14 — `stdlib` HIGH in `usr/local/bin/gosu` |
| SCX-0003 | postgres | RISK_ACCEPTED | 1 — `stdlib` CRITICAL in `usr/local/bin/gosu` |
| SCX-0004 | postgres | NOT_AFFECTED | 1 — `stdlib` HIGH in `usr/local/bin/gosu` |
| SCX-0005 | postgres | NOT_AFFECTED | 6 — `stdlib` HIGH in `usr/local/bin/gosu` |

14 + 1 + 1 + 6 = 22, with 0 unmatched and 0 unused. Redis is clean again, and the postgres OS
package set is clean for the first time since the util-linux advisories entered the scanner
database on 2026-09-06 (those seven HIGH findings — CVE-2026-53612, -53613, -53614, -76642,
-78408, -78409, -78410 against `libuuid` — were never governed by a record; the gate stayed red on
them by design until a rebuilt image existed, and the derived image is that rebuild).

### 3.6 Retired records (2026-09-10)

The following records governed findings of the previously pinned OFFICIAL images. In the derived
images pinned on 2026-09-10 those findings no longer exist — the derived image fixes them — so each
record would match nothing, and the gate rejects a record that matches nothing as stale. They were
therefore REMOVED from `scripts/gate/scanner-exclusions.json` on 2026-09-10 (their ids are listed
in that file's `retired_records`); their complete text, evidence and compensating controls remain in
git history (last present at commit `b30242f`) and in the history of this document. Retiring a
record deletes no evidence: the scans of the official children (`b6a16ed0…`, `a6a88248…`) are
unchanged in the delivered evidence packages.

| Record | Governed (official image, `linux/amd64` child) | Package | Advisory | Fixed in the derived image by | Verified |
|---|---|---|---|---|---|
| SCX-0001 | `postgres@sha256:9a8afca5…` / `b6a16ed0…` | `c-ares` 1.34.6-r0 | CVE-2026-33630 (HIGH) | `c-ares` 1.34.8-r0 (`apk add c-ares=1.34.8-r0`) | unsuppressed scan of `bc90ce6b…`: 0 OS-package findings; `c-ares` 1.34.8-r0 installed |
| SCX-0006 | `postgres@sha256:9a8afca5…` / `b6a16ed0…` | `libcrypto3` 3.5.7-r0 | CVE-2026-14456 (HIGH) | `libcrypto3` 3.5.8-r0 | same scan; `libcrypto3` 3.5.8-r0 installed |
| SCX-0007 | `postgres@sha256:9a8afca5…` / `b6a16ed0…` | `libssl3` 3.5.7-r0 | CVE-2026-14456 (HIGH) | `libssl3` 3.5.8-r0 | same scan; `libssl3` 3.5.8-r0 installed |
| SCX-0008 | `redis@sha256:978f0e01…` / `a6a88248…` | `libcrypto3` 3.5.7-r0 | CVE-2026-14456 (HIGH) | `libcrypto3` 3.5.8-r0 | unsuppressed scan of `0c0a48dd…`: 0 findings; `libcrypto3` 3.5.8-r0 installed |
| SCX-0009 | `redis@sha256:978f0e01…` / `a6a88248…` | `libssl3` 3.5.7-r0 | CVE-2026-14456 (HIGH) | `libssl3` 3.5.8-r0 | same scan; `libssl3` 3.5.8-r0 installed |

The reason each of these was accepted rather than remediated was the same: no official
`postgres:18-alpine` or `redis:8-alpine` build carried the fixed package. That reason has been
replaced, not refuted — the derived images are a TEMPORARY route (§5), and the official images are
still watched for the day they carry the fixes themselves.

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
  is `expires_on <= runDate`, so the record is not in force during its stated expiry day. The
  2026-09-10 re-issue did not move that date: a re-issue changes the image a record is scoped to,
  not how long its analysis is trusted.
* ADR-P0-01 requires a monthly re-pin and re-scan; a re-pin that clears a finding must
  delete the corresponding record, because an unused record fails the gate as stale (§3.6 is the
  first instance).
* **The derived images are temporary.** `scripts/gate/check-patched-images.mjs`
  (`.github/workflows/c15-patched-image-recheck.yml`, daily at 07:20 UTC, read-only, and the
  required CI job) resolves the current official `postgres:18-alpine` and `redis:8-alpine`
  indexes and scans BOTH `linux/amd64` and `linux/arm64` children for the util-linux, OpenSSL and
  c-ares fixed versions. It REPORTS — it re-pins nothing and deletes no evidence — and it fails on
  purpose when a compatible fixed official image exists for a service on both platforms, because
  that is the event that must interrupt someone: the service then returns to the official image
  through the digest/disposition/release process (re-pin, re-issue or retire the records that
  name the image, regenerate evidence, FINAL chain), never by an automatic re-pin.
* Owner and approver must remain distinct parties; a record cannot approve itself.
* This document's SHA-256 is bound by every citing record. Editing it — even by one byte —
  invalidates those records until the digest is re-approved.
