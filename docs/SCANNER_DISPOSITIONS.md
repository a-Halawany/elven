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

> **The return to the official images, 2026-09-22 — IN PROGRESS, pending the owner's approval.**
> Since 2026-09-22 the two configured references are the OFFICIAL indexes
> `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` (`postgres:18-alpine`,
> 18.6-alpine3.24; children `d8703cd7…` `linux/amd64`, `89f74717…` `linux/arm64`) and
> `redis@sha256:ba6e394f6acc2a695ef1b6944f161b9ca813711739be68319fa0db3470673f1d` (`redis:8-alpine`,
> 8.10.2-alpine; children `2d3814be…` `linux/amd64`, `41a10b18…` `linux/arm64`) — the images the
> recheck (run `35728647457`) found rebuilt with every watched fix on both platforms
> (`docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md` §8). §§1–3.8 below describe the DERIVED artefacts that were
> pinned from 2026-09-10 to 2026-09-22 and the six records approved for them; those records stand in
> `scripts/gate/scanner-exclusions.json` byte for byte as approved and, because the pinned reference
> changed, match nothing until the owner re-issues them — the gate is red on exactly that, by design.
> The re-issues for the official children are DRAFTED in **§3.9**, with their approval dates left
> pending; nothing here is deleted, and no draft governs a finding.

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
| Resolved platforms | `linux/amd64` **and** `linux/arm64` — the gate scans BOTH children (see §3.7) | same |
| Scanned child manifest, `linux/amd64` | `sha256:bc90ce6bc094fae53df8d01b23e6c08160c7e7064f4c351fd3cff324aefcda7a` | `sha256:0c0a48ddfcea413916152bc64e91c665d0822053099d9bc385a4747d71609432` |
| Scanned child manifest, `linux/arm64` | `sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc` | `sha256:c11d75cace5d4effc9524e6baa11f559440f398e6f53899332557bf455ad56dc` |
| Index integrity check | SHA-256 of the raw returned index manifest is verified to equal the digest in the configured reference **before** any child digest is trusted (verified 2026-09-10 by anonymous fetch: 647 bytes each, digests equal) | same |
| Derived from (official index) | `postgres:18-alpine` `sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` (Alpine 3.24.1) | `redis:8-alpine` `sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241` (Alpine 3.23.5) |
| Packages changed by the derivation | `libuuid` 2.42.1-r0 → 2.42.3-r1; `libcrypto3`/`libssl3` 3.5.7-r0 → 3.5.8-r0; `c-ares` 1.34.6-r0 → 1.34.8-r0; `USER postgres` | `setpriv` 2.41.4-r0 → 2.41.6-r1; `libcrypto3`/`libssl3` 3.5.7-r0 → 3.5.8-r0; `USER redis` |
| HIGH/CRITICAL findings, `linux/amd64` child | **22**, all Go-stdlib rows in `usr/local/bin/gosu`, governed by SCX-0002…0005; OS packages: **0** | **0** |
| HIGH/CRITICAL findings, `linux/arm64` child | **22**, all Go-stdlib rows in `usr/local/bin/gosu`, governed by SCX-0010…0011 (§3.7); OS packages: **0** | **0** |

**Why both children are scanned, corrected 2026-09-10.** `linux/amd64` is the primary
deployment platform: CI runs on `ubuntu-latest` and the C16 target descriptor resolves
`linux/x64/glibc`. A scanner given no `--platform` follows the host, so the platform is named
explicitly and never inferred. But the `linux/arm64` child is not hypothetical — it is what the
local restore drill actually runs on an Apple-silicon workstation — and it is a **different
artifact**: different layers, and a different `gosu` binary (`3a8ef022…`, 1,830,424 bytes,
aarch64 ELF, against amd64's `52c8749d…`, 1,769,900 bytes). A disposition scoped to `linux/amd64`
cannot govern it, and until 2026-09-10 the gate could not have enforced one that tried: it
scanned a single child, so a correct arm64 record matched nothing and was failed as UNUSED —
indistinguishable from a rotten one.

The gate therefore scans **both** children of each configured index and reconciles each
platform's findings against the records that name that platform. Every rule is unchanged and
applies to each platform separately: an unmatched finding fails, a record that matched nothing
fails as stale, and — new — a record naming a platform the run did not scan fails too, so an
unscanned platform cannot become a place to park a disposition beyond review. The dispositions
below are scoped to `linux/amd64`; the `linux/arm64` records are **SCX-0010 and SCX-0011 in
§3.7**, and they rest on analysis performed on the arm64 artifact itself.

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

**§3.1–§3.6 are the `linux/amd64` children only.** The `linux/arm64` children are a separate
artifact with a separate finding set and separate records; they are §3.7. Nothing in §3.1–§3.6
governs, or may be read as governing, a finding on `linux/arm64`.

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

### 3.5 Current reconciliation, `linux/amd64` (2026-09-10)

The postgres image scan reports **22** findings and the redis image **0**, governed as:

| Record | Image | Classification | Findings |
|---|---|---|---|
| SCX-0002 | postgres | RISK_ACCEPTED | 14 — `stdlib` HIGH in `usr/local/bin/gosu` |
| SCX-0003 | postgres | RISK_ACCEPTED | 1 — `stdlib` CRITICAL in `usr/local/bin/gosu` |
| SCX-0004 | postgres | NOT_AFFECTED | 1 — `stdlib` HIGH in `usr/local/bin/gosu` |
| SCX-0005 | postgres | NOT_AFFECTED | 6 — `stdlib` HIGH in `usr/local/bin/gosu` |

14 + 1 + 1 + 6 = 22 on this platform, with 0 unmatched and 0 unused. The `linux/arm64` half of
the same run is reconciled in §3.7; the run total is 44 findings across 6 records. Redis is clean
again, and the postgres OS
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

### 3.7 `linux/arm64` — the second child, analysed on its own artifact (2026-09-10)

**What this section is.** SCX-0002…0005 scope themselves to `linux/amd64` and §1 says in terms
that they cannot govern another platform. The `linux/arm64` child of the same index is a
different artifact with its own 22 findings and its own binary, and the local restore drill runs
it. This section governs it, from analysis performed **on it** — not carried across from the
amd64 analysis.

| Item | postgres | redis |
|---|---|---|
| Configured reference (what the gate matches on) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` | `ghcr.io/a-halawany/elven/redis@sha256:1ad0ff24136a22ef4b2457aa3fde26c65c51bebe6c1f719158e21219f6ae3e15` |
| Scanned child manifest | `sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc` | `sha256:c11d75cace5d4effc9524e6baa11f559440f398e6f53899332557bf455ad56dc` |
| Image config architecture reported by the scanner | `arm64` | `arm64` |
| OS | alpine 3.24.1, 53 packages analysed | alpine 3.23.5, 22 packages analysed |
| OS-package HIGH/CRITICAL findings | **0** | **0** |
| Go-binary target | `usr/local/bin/gosu`, 4 packages (`github.com/tianon/gosu` v1.19.0 root, `stdlib` v1.24.6 direct, `github.com/moby/sys/user` v0.1.0, `golang.org/x/sys` v0.1.0) | none |
| HIGH/CRITICAL findings | **22** — 21 HIGH + 1 CRITICAL, every one `stdlib` `v1.24.6` in `usr/local/bin/gosu` | **0** at every severity |

The record fields the gate compares are therefore, for all 22 rows: `image` = the configured
**index** reference above (the gate reconciles against the reference from `docker-compose.yml`,
not the child digest — both children carry the same one, which is why `scan_platform` is what
separates them), `scan_platform` `linux/arm64`, `package_name` `stdlib`, `package_purl`
`pkg:golang/stdlib@v1.24.6`, `installed_version` `v1.24.6`, `result_target` `usr/local/bin/gosu`.

**The PURL carries no `arch` qualifier.** Trivy emits `arch=` on *apk* packages; these are
`gobinary` rows, and the arm64 PURL is `pkg:golang/stdlib@v1.24.6` — byte-for-byte the amd64
one. The finding sets are also identical row for row (advisory, severity, package, PURL,
installed version, result target) between the two children, verified by scanning both with the
same pinned scanner on 2026-09-10. That identity is a **result**, not the reason for these
records: the artifacts differ, so the platforms are governed separately even where they agree.

**The binary, measured on this artifact.** `/usr/local/bin/gosu` was extracted from the published
arm64 child (`docker create --platform linux/arm64` from `…@sha256:d3dd485b…`, `docker cp`, the
container removed) and measured directly:

| Property | Value |
|---|---|
| sha256 | `3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44` |
| Size | 1,830,424 bytes |
| Format | ELF 64-bit LSB executable, ARM aarch64, statically linked, not stripped |
| Go toolchain (build info) | `go1.24.6` |
| Module / version | `github.com/tianon/gosu` `v1.19.0` |
| Build settings | `-buildmode=exe`, `-compiler=gc`, `-trimpath=true`, `CGO_ENABLED=0`, `GOARCH=arm64` |

This is the digest `infra/images/candidates/evidence/v2/gosu-verification.txt` already records
for the arm64 candidate and base, re-measured here inside the **published** child. It is a
different file from the amd64 binary `52c8749d…` (1,769,900 bytes), which is the whole point.

**No symbol analysis was performed on this artifact, and none is claimed.** `govulncheck` is not
available on this host and neither is a Go toolchain to obtain it from, so no binary-mode
reachability analysis of `3a8ef022…` exists. The amd64 analysis
(`docs/evidence/govulncheck-gosu-b6a16ed0.*`) was run against `52c8749d…`; a call-graph result
for one compiled binary is not a result for a different one, and copying it across would be the
same substitution this document refuses everywhere else. **Every arm64 record is therefore
`RISK_ACCEPTED`, not `NOT_AFFECTED`** — including the seven advisories whose amd64 counterparts
are NOT_AFFECTED under SCX-0004 (one) and SCX-0005 (six). The acceptance rests on the operational argument
those records also carry, which *is* artifact-independent: `gosu` runs once at container start to
drop root privileges and exits; it is neither a long-lived process nor a network listener, and
the affected surfaces (`net/http`, `net/mail`, `crypto/tls`, `crypto/x509` DoS classes) are not
exercised by that use. When a Go toolchain and `govulncheck` are available, running the analysis
on `3a8ef022…` is what would let these advisories be reclassified — on evidence, in a new record.

**Recorded, not governed: severities below the gate's filter.** The gate blocks at
`HIGH,CRITICAL`, and these records cover exactly that. An all-severity pass of the same arm64
child on 2026-09-10 additionally reports 21 MEDIUM, 2 LOW and 1 UNKNOWN row in `gosu`, and 10
UNKNOWN-severity `libcurl` rows on the OS (CVE-2026-13608, -18924, -19931, -80229, -80230,
-80231, -80255, -80256, -82208, -82209). They are outside the governed severity scope and are
written down here so the difference between "no finding" and "no finding at this severity" is on
the record. The arm64 redis child reports **zero** rows at every severity.

#### SCX-0010 — Go standard library in the arm64 `gosu` (HIGH set)

| Field | Value |
|---|---|
| Advisories | `CVE-2025-61726`, `CVE-2025-61729`, `CVE-2026-25679`, `CVE-2026-27145`, `CVE-2026-32280`, `CVE-2026-32281`, `CVE-2026-32283`, `CVE-2026-33811`, `CVE-2026-33814`, `CVE-2026-33818`, `CVE-2026-39820`, `CVE-2026-39821`, `CVE-2026-39822`, `CVE-2026-39836`, `CVE-2026-42499`, `CVE-2026-42504`, `CVE-2026-56853`, `CVE-2026-56858`, `CVE-2026-56859`, `CVE-2026-56860`, `CVE-2026-56862` (21) |
| Severity | HIGH |
| Classification | **RISK_ACCEPTED** (no arm64 reachability analysis exists) |
| Image (index) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` |
| Scan platform | `linux/arm64` |
| Scanned child | `sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc` |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Analysed binary | `3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44` (aarch64, 1,830,424 bytes) |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved / reviewed | 2026-09-10 (first approval for this platform) |
| Expires | 2026-11-05 — the same date as the rest of the set, deliberately not later |

**Why one record for all 21.** They share a platform, a package, a PURL, an installed version, a
result target, a severity, a classification and a single review on one date, so splitting them
would record a distinction that does not exist. The CRITICAL is held separately (SCX-0011) for
the reason SCX-0003 exists: a disposition approved for HIGH must never absorb a CRITICAL.

#### SCX-0011 — the single CRITICAL in the arm64 `gosu`

| Field | Value |
|---|---|
| Advisory | `CVE-2025-68121` |
| Severity | **CRITICAL** |
| Classification | **RISK_ACCEPTED** (no arm64 reachability analysis exists) |
| Image (index) | `ghcr.io/a-halawany/elven/postgres@sha256:69a974aedbd80ff27ee670a6693445c47925bd69e11818a1cff39319f91ad4a7` |
| Scan platform | `linux/arm64` |
| Scanned child | `sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc` |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Analysed binary | `3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44` |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Approved / reviewed | 2026-09-10 (first approval for this platform) |
| Expires | 2026-11-05 |

`CVE-2025-68121` is an incorrect-certificate-validation defect in `crypto/tls` during session
resumption. `gosu` opens no TLS connection: it resolves a user, drops privileges and `exec`s the
real entrypoint. The acceptance is bounded by §4 exactly as the amd64 CRITICAL is.

**Compensating controls (both records).**
1. `gosu` runs once at container start; it is neither a long-lived process nor a network listener.
2. PostgreSQL itself is loopback-bound (127.0.0.1:5432 only).
3. Phase 0 is a LOCAL-ONLY development profile under `EXC-P0-004`; these dispositions are invalid
   for any external or customer-data use.
4. ADR-P0-01 monthly patch cadence re-pins and re-scans as a blocking release gate;
   `scripts/gate/check-patched-images.mjs` already checks BOTH platforms and reports when a fixed
   official image exists on each.

**Limits, stated.** These are acceptances, not exemptions. Nothing here claims the vulnerable
code is absent from `3a8ef022…`; what is claimed is that the code path is not exercised by the
one thing `gosu` does, under the Phase 0 exposure bounds of §4. That is a weaker claim than the
amd64 SCX-0004/0005 make, and it is deliberately weaker, because the analysis that would support
the stronger one has not been run on this binary.

**Approval (2026-09-11).** SCX-0010 and SCX-0011 were accepted by the product owner, as they stand and
within their scope and expiry, in the checkpoint directive following the review at `461a2b56`
(`docs/images/ARM64_RISK_DECISION.md` §5). The records' `approver` and dates say so. Owner acceptance,
not independent verification. A govulncheck binary-mode analysis of the arm64 binary now exists
(2026-09-11, `infra/images/published/20260910/gosu-arm64-3a8ef022.govulncheck.{txt,json}`: 0 called,
all 22 unreachable); it is bound as additional evidence and does not change the classification.

### 3.8 Current reconciliation, `linux/arm64` (2026-09-10)

| Record | Image | Classification | Findings |
|---|---|---|---|
| SCX-0010 | postgres | RISK_ACCEPTED | 21 — `stdlib` HIGH in `usr/local/bin/gosu` |
| SCX-0011 | postgres | RISK_ACCEPTED | 1 — `stdlib` CRITICAL in `usr/local/bin/gosu` |

21 + 1 = 22 on this platform, with 0 unmatched and 0 unused; redis contributes 0. Across both
scanned platforms the run reconciles 22 + 22 = **44** findings against **6** records
(SCX-0002…0005 on `linux/amd64`, SCX-0010…0011 on `linux/arm64`), 0 unmatched, 0 unused, and 0
records naming a platform the run did not scan.

### 3.9 The return to the official images (2026-09-22) — DRAFT re-issues, pending the owner's approval

**What this section is, and is not.** On 2026-09-22 the recheck found a compatible fixed OFFICIAL image
for both services on both platforms, and `docker-compose.yml` / `conformance.manifest.json` were
re-pinned to those official indexes the same day (`pinned_at` 2026-09-22). The documented process
(`docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md` §5) makes the next step the owner's: the records the new
child digests invalidate are re-bound "with the owner's approval, since the records carry `approved_on`".
This section prepares that approval. It states what was scanned, what the official children carry, why
each record's basis carries over, and the six re-issued records exactly as they would read — with the
approval and review dates left **PENDING** and a `Status` row (new in this document: there was no
precedent for a pending record, so the field is added and named for what it is). **No draft here
governs anything**: `scripts/gate/scanner-exclusions.json` keeps the six approved records of 2026-09-10
untouched in `records` (they now name an image the compose file no longer pins and therefore match
nothing, which the gate reports as such), and carries these drafts beside them under
`pending_reissues`, where the validator never reads them. The derived images, their receipts and the
records' text are not deleted.

**What was scanned (2026-09-22).**

| Item | postgres | redis |
|---|---|---|
| Configured reference (from 2026-09-22) | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` | `redis@sha256:ba6e394f6acc2a695ef1b6944f161b9ca813711739be68319fa0db3470673f1d` |
| Human tag (informational) | `postgres:18-alpine` = `18.6-alpine3.24` | `redis:8-alpine` = `8.10.2-alpine` |
| Reference kind | OCI image **index**, 8 runnable platforms + 8 attestation manifests (`unknown/unknown`, excluded by the resolver) | same |
| Scanned child manifest, `linux/amd64` | `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66` | `sha256:2d3814be5e9b06a30a0be54770b7e12052e7e79ec85271aefd34875c1f393b23` |
| Scanned child manifest, `linux/arm64` (`linux/arm64/v8` in the index) | `sha256:89f747171c4b0af0eacf5984550060be79786dbe286eb60cfa691d79d1e8b23f` | `sha256:41a10b18bd238fa7837b1615b2b5b113edff1654233238ac82d87e6fb5531f44` |
| Index integrity check | the raw index (10,293 bytes) hashes to the configured digest — `infra/images/official/20260922/index/postgres.index.raw.json` | the raw index (10,213 bytes) hashes to the configured digest — `…/redis.index.raw.json` |
| Source (image annotations = the Docker Official Images library entry) | `docker-library/postgres@e00e1bd34ec5c8a8e7ad89b273b3d42efaf6d5bc`, directory `18/alpine3.24`, built 2026-09-17 on `alpine:3.24` (Alpine 3.24.2) | `redis/docker-library-redis@8104e63b5910fda751bf7c038fa297b6fb19ff43`, directory `alpine`, built 2026-09-21 on `alpine:3.23` (Alpine 3.23.6) — `infra/images/official/20260922/source/SOURCE.txt` |
| Watched packages installed (both children) | `libuuid` 2.42.3-r1, `libcrypto3`/`libssl3` 3.5.8-r0, `c-ares` 1.34.8-r0 (53 packages) — `…/inventory/official-postgres-*.txt` | `setpriv` 2.41.6-r1, `libcrypto3`/`libssl3` 3.5.8-r0 (22 packages) — `…/inventory/official-redis-*.txt` |
| HIGH/CRITICAL findings, `linux/amd64` child | **22**, all Go-stdlib rows in `usr/local/bin/gosu` (`pkg:golang/stdlib@v1.24.6`); OS packages: **0** | **0** |
| HIGH/CRITICAL findings, `linux/arm64` child | **22**, the identical rows; OS packages: **0** | **0** |
| Below the gate's filter (recorded, not governed) | 21 MEDIUM, 2 LOW, 1 UNKNOWN, all in `gosu`; **no** OS-package row at any severity (the 10 UNKNOWN `libcurl` rows §3.7 recorded on the derived arm64 child are gone with Alpine 3.24.2) | none at any severity |
| Scanner for these figures | trivy 0.73.0 — the **Homebrew** build on the analysis host, `--scanners vuln,secret --ignorefile /dev/null`, DB of 2026-09-22 07:24 UTC; NOT the pinned release binary the gate authenticates, so these are evidence and the gate's own verdict is the hosted run's (`…/scans/`, `scan-summary.txt`) | same |

**The delta against the derived images, same scanner, same database, same day.** The derived children
(`bc90ce6b…`/`d3dd485b…`, `0c0a48dd…`/`c11d75ca…`) were re-scanned beside the official ones. At
HIGH/CRITICAL the postgres sets are identical row for row on each platform — 22 remain, 0 gone, 0 new —
and redis is 0 on both images and both platforms. So there is nothing to retire and nothing new to
govern: **every finding the six records govern remains, and only those.** Each record's advisory set is
present in full on the official child of its platform (SCX-0002 14/14, SCX-0003 1/1, SCX-0004 1/1,
SCX-0005 6/6 on `d8703cd7…`; SCX-0010 21/21, SCX-0011 1/1 on `89f74717…`), and no HIGH/CRITICAL `gosu`
advisory on either official child falls outside them.

**Why each basis carries over: the binary is the same file.** `/usr/local/bin/gosu` was extracted from
each official child (`docker create`, `docker cp`, the container removed) and measured
(`…/inventory/official-postgres-{amd64,arm64}.txt`): `linux/amd64`
`52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0`, 1,769,900 bytes, `1.19 (go1.24.6 on
linux/amd64; gc)`; `linux/arm64` `3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44`,
1,830,424 bytes, `1.19 (go1.24.6 on linux/arm64; gc)`. These are byte for byte the binaries of the
2026-08-05 base (`b6a16ed0…`) and of the derived children — the same identity on which the 2026-09-10
re-issue rested (`infra/images/candidates/evidence/v2/gosu-verification.txt`). The govulncheck
binary-mode analyses therefore still describe the bytes the gate scans: `docs/evidence/govulncheck-gosu-b6a16ed0.*`
for `52c8749d…` (SCX-0004/0005, NOT_AFFECTED) and
`infra/images/published/20260910/gosu-arm64-3a8ef022.govulncheck.txt` for `3a8ef022…` (bound as
additional evidence by SCX-0010/0011, which stay RISK_ACCEPTED as the owner accepted them on
2026-09-11 — a re-issue changes the image a record is scoped to, not its classification). Neither the
evidence dates nor the expiry, **2026-11-05**, are extended by this re-issue.

**Compatibility of the official images (`…/compat/`).** Under exactly the compose file's process
protections (`user: 70:70` / `999:1000`, `cap_drop: [ALL]`, `no-new-privileges:true`), on throwaway
containers and a throwaway volume: PID 1 runs as uid 70 / uid 999 with CapPrm = CapEff = CapBnd = 0 and
NoNewPrivs 1; PostgreSQL 18.6 initialised a fresh volume, applied migrations 0001–0078, `gen_random_uuid()`
works, a stop/start reloads the volume ("Skipping initialization", rows and 78 migrations intact); Redis
8.10.2 answered the repository's client (ioredis, `--requirepass`); the acceptance suite passed 58/58
against them and the `audit-chain` integration file 8/8. The host is `darwin/arm64`, so the containers
ran the `linux/arm64` children — the ones the compose file runs on this host; CI runs the amd64 children.

**The six re-issued records, as drafted.** The fields the gate compares are unchanged from the 2026-09-10
records except `image` (the official index) — `scan_platform`, `package_name` `stdlib`, `package_purl`
`pkg:golang/stdlib@v1.24.6`, `installed_version` `v1.24.6`, `severities`, `result_target`
`usr/local/bin/gosu`, the advisory sets, the classifications, the compensating controls, the prohibited
uses, the owner, the approver party and the expiry are the same. What changes with the re-issue: the
image, the evidence bound (this document at its new digest; the 2026-09-22 inventories and scans;
the byte-identity record; the govulncheck artefacts as before), and the approval, which is pending.

#### SCX-0002 — DRAFT re-issue for the official `linux/amd64` child (HIGH set)

| Field | Value |
|---|---|
| Status | **DRAFT — pending the owner's approval; governs nothing** |
| Advisories | `CVE-2025-61726`, `CVE-2025-61729`, `CVE-2026-25679`, `CVE-2026-27145`, `CVE-2026-32280`, `CVE-2026-32281`, `CVE-2026-32283`, `CVE-2026-33811`, `CVE-2026-33814`, `CVE-2026-39820`, `CVE-2026-39822`, `CVE-2026-39836`, `CVE-2026-42499`, `CVE-2026-42504` (14) |
| Severity | HIGH |
| Classification | RISK_ACCEPTED |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Image (index) | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` |
| Scan platform / scanned child | `linux/amd64` / `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66` |
| Analysed binary | `52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0` (identical in `b6a16ed0…`, `bc90ce6b…` and this child) |
| Owner | founding-engineer |
| Approver | gate-2.2-security-review |
| Originally approved | 2026-08-05, for `postgres@sha256:9a8afca5…`; re-issued 2026-09-10 for the derived image (§3) |
| Re-issued (approved / reviewed) | **PENDING — the owner's approval** |
| Expires | 2026-11-05 (unchanged) |

**Reason, compensating controls, prohibited use.** As the 2026-09-10 record (SCX-0002 above), with one
sentence retired: "no patched official postgres build exists" is no longer why the finding is accepted —
the official build now carries every OS fix, and `gosu` is the same upstream binary in every current
official postgres variant; the acceptance rests on the operational argument alone (`gosu` runs once at
container start and exits; PostgreSQL is loopback-bound; Phase 0 is LOCAL-ONLY under `EXC-P0-004`;
ADR-P0-01 re-pins and re-scans monthly).

#### SCX-0003 — DRAFT re-issue for the official `linux/amd64` child (the single CRITICAL)

| Field | Value |
|---|---|
| Status | **DRAFT — pending the owner's approval; governs nothing** |
| Advisory | `CVE-2025-68121` |
| Severity | **CRITICAL** |
| Classification | RISK_ACCEPTED |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Image (index) | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` |
| Scan platform / scanned child | `linux/amd64` / `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66` |
| Owner / Approver | founding-engineer / gate-2.2-security-review |
| Originally approved | 2026-08-05, for `postgres@sha256:9a8afca5…`; re-issued 2026-09-10 for the derived image |
| Re-issued (approved / reviewed) | **PENDING — the owner's approval** |
| Expires | 2026-11-05 (unchanged) |

Held separately for the reason SCX-0003 exists: a disposition approved for HIGH must not absorb a
CRITICAL. Reason and controls as SCX-0003 above, with the same retired sentence as SCX-0002.

#### SCX-0004 — DRAFT re-issue for the official `linux/amd64` child, NOT_AFFECTED by symbol analysis

| Field | Value |
|---|---|
| Status | **DRAFT — pending the owner's approval; governs nothing** |
| Advisories | `CVE-2026-39821` (1) |
| Severity | HIGH |
| Classification | **NOT_AFFECTED — vulnerable_code_not_present** |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Image (index) | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` |
| Scan platform / scanned child | `linux/amd64` / `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66` |
| Analysed on (evidence) | `52c8749d…` — the same bytes in this child (`…/inventory/official-postgres-amd64.txt`); `docs/evidence/govulncheck-gosu-b6a16ed0.{json,txt}`, Go vulnerability database as of 2026-08-14, 0 called vulnerable symbols |
| Owner / Approver | founding-engineer / gate-2.2-security-review |
| Originally approved | 2026-08-14, for `postgres@sha256:9a8afca5…`; re-issued 2026-09-10 for the derived image |
| Re-issued (approved / reviewed) | **PENDING — the owner's approval** |
| Expires | 2026-11-05 (unchanged; the evidence date does not move) |

#### SCX-0005 — DRAFT re-issue for the official `linux/amd64` child, NOT_AFFECTED by symbol analysis

| Field | Value |
|---|---|
| Status | **DRAFT — pending the owner's approval; governs nothing** |
| Advisories | `CVE-2026-33818`, `CVE-2026-56853`, `CVE-2026-56858`, `CVE-2026-56859`, `CVE-2026-56860`, `CVE-2026-56862` (6) |
| Severity | HIGH |
| Classification | **NOT_AFFECTED — vulnerable_code_not_present** |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Image (index) | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` |
| Scan platform / scanned child | `linux/amd64` / `sha256:d8703cd7fba306b9fec9268ecedfa8a966846c053036a60e3635791957eb2f66` |
| Analysed on (evidence) | as SCX-0004: `52c8749d…`, the same two govulncheck artefacts, each of the six present and unreachable |
| Owner / Approver | founding-engineer / gate-2.2-security-review |
| Originally approved / reviewed | 2026-08-15, for `postgres@sha256:9a8afca5…`; re-issued 2026-09-10 for the derived image |
| Re-issued (approved / reviewed) | **PENDING — the owner's approval** |
| Expires | 2026-11-05 (unchanged) |

#### SCX-0010 — DRAFT re-issue for the official `linux/arm64` child (HIGH set)

| Field | Value |
|---|---|
| Status | **DRAFT — pending the owner's approval; governs nothing** |
| Advisories | the 21 HIGH ids of SCX-0010 (§3.7), unchanged |
| Severity | HIGH |
| Classification | **RISK_ACCEPTED** (as accepted by the owner on 2026-09-11; the arm64 govulncheck analysis of `3a8ef022…` — 0 called, all 22 unreachable — is bound as additional evidence and does not change the classification) |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Image (index) | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` |
| Scan platform / scanned child | `linux/arm64` / `sha256:89f747171c4b0af0eacf5984550060be79786dbe286eb60cfa691d79d1e8b23f` |
| Analysed binary | `3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44` (aarch64, 1,830,424 bytes; identical in `d3dd485b…` and this child — `…/inventory/official-postgres-arm64.txt`) |
| Owner / Approver | founding-engineer / product-owner (the 2026-09-11 acceptance, `docs/images/ARM64_RISK_DECISION.md` §5); the re-issue's approver is whoever approves it |
| Originally approved / reviewed | 2026-09-11 (first approval for this platform, on the derived child) |
| Re-issued (approved / reviewed) | **PENDING — the owner's approval** |
| Expires | 2026-11-05 (unchanged) |

#### SCX-0011 — DRAFT re-issue for the official `linux/arm64` child (the single CRITICAL)

| Field | Value |
|---|---|
| Status | **DRAFT — pending the owner's approval; governs nothing** |
| Advisory | `CVE-2025-68121` |
| Severity | **CRITICAL** |
| Classification | **RISK_ACCEPTED** (as SCX-0010) |
| Package / PURL / version | `stdlib` / `pkg:golang/stdlib@v1.24.6` / `v1.24.6` |
| Result target | `usr/local/bin/gosu` |
| Image (index) | `postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` |
| Scan platform / scanned child | `linux/arm64` / `sha256:89f747171c4b0af0eacf5984550060be79786dbe286eb60cfa691d79d1e8b23f` |
| Analysed binary | `3a8ef022…` (as SCX-0010) |
| Owner / Approver | founding-engineer / product-owner (as SCX-0010) |
| Originally approved / reviewed | 2026-09-11 |
| Re-issued (approved / reviewed) | **PENDING — the owner's approval** |
| Expires | 2026-11-05 (unchanged) |

**Compensating controls, prohibited use and limits (all six).** Unchanged from the records above (§3
and §3.7), with the one retired sentence noted under SCX-0002: the operational argument, the loopback
binding, the LOCAL-ONLY profile under `EXC-P0-004`, ADR-P0-01's monthly cadence; §4's prohibited
exposure applies in full. The records stay weaker on `linux/arm64` than on `linux/amd64` on purpose,
exactly as §5 states.

**Evidence bound by the drafts (tracked, digests recomputed by the gate once the records are live).**

| Artifact | sha256 |
|---|---|
| `infra/images/official/20260922/inventory/official-postgres-amd64.txt` | `143d02e50a77e35806f4259d8e49b24c655eeb6b7c84ae169c4b61b771d3c942` |
| `infra/images/official/20260922/inventory/official-postgres-arm64.txt` | `9762a9301c23bfc75894afbe859f5cf5a8f5e782d5638fa3e762e9c510e60733` |
| `infra/images/official/20260922/scans/official-postgres-amd64.trivy.txt` | `b09157f29476eb775e72c9ef553825ee4262379a22aa5226669056cabe7fb6e7` |
| `infra/images/official/20260922/scans/official-postgres-arm64.trivy.txt` | `651c5de0c188cbeace49715b5d36c1e14a797526365062f933bd73a079a1316e` |
| `infra/images/official/20260922/scans/scan-summary.txt` | `939d2f54536fd6fcf328a4f38236c57eae18ac93ee0173b285e313bda7965fb9` |
| `infra/images/candidates/evidence/v2/gosu-verification.txt` (the byte-identity record) | `e0f901da541867530146e9869337d17b1ac880c0d2f2312240f9d857bc830359` |
| `docs/evidence/govulncheck-gosu-b6a16ed0.json` / `.txt` (SCX-0004/0005) | `e7d06bcc9da3181c417f1287b1bfc14bc0446a167a82733464e3fa619553be26` / `cdcd7ff7fe62a6b19677b19a23db04c406f473920e2663b13c7a51232743fbab` |
| `infra/images/published/20260910/gosu-arm64-3a8ef022.govulncheck.txt` (SCX-0010/0011, additional) | `cdcd7ff7fe62a6b19677b19a23db04c406f473920e2663b13c7a51232743fbab` |
| `docs/images/ARM64_RISK_DECISION.md` (SCX-0010/0011) | `6b6518d03ddc01c86deb7644fa638a6a2cea149bcba6987f14352e18ae513aca` |

**What the gate says while this is pending, and what the approval consists of.** With the compose file
on the official indexes and `records` still naming the derived one, the C15 gate refuses at the
disposition validation — "6 records, 12 rejected": each approved record's `evidence_sha256` and its
`evidence_files` entry for this document name the digest of 2026-09-10, and this document changed with
this section — and stops there, before any image is scanned (hosted run 35776435696 on PR #57 says
exactly this). Re-binding the six records to this digest alone would not turn it green: they would then
reach reconciliation naming an image the compose file no longer pins, and the 22 `gosu` rows on each
official postgres child would be UNGOVERNED (44) with the six records UNUSED, until the records name the
official image. The recheck step, by its own design, fails too, because a compatible fixed official
image "now exists" — it is the one pinned. The owner's approval is: review §3.9; in
`scripts/gate/scanner-exclusions.json` replace each of the six records in `records` with its draft from
`pending_reissues`, deleting the `status` key and setting `approved_on` and `reviewed_on` to the day of
the review (never earlier); in this section replace each "PENDING" with that date and the approver; then
recompute this document's SHA-256 (`shasum -a 256 docs/SCANNER_DISPOSITIONS.md`) into every record's
`evidence_sha256` and its `docs/SCANNER_DISPOSITIONS.md` entry in `evidence_files`; re-record the C15
trace fixture and `real-image-results.json` from a real run with the pinned scanners; run the FINAL
chain. Whether the recheck then stays as the trigger for a NEWER official build under ADR-P0-01's
cadence, or is retired, is the owner's decision (`infra/images/candidates/v2/PUBLICATION.md` §8.5).

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
* **A record governs one platform, and every platform is scanned.** A record names one
  `scan_platform` and can match only findings from the scan of that child. The gate scans every
  platform in its tracked list (`SCAN_PLATFORMS` in `scripts/gate/lib/scanner-provenance.mjs`,
  read by both the runner and the final-manifest verifier) and reconciles each separately, so
  adding a platform to that list without adding records for what it finds fails the gate as
  UNGOVERNED, and a record naming a platform that is not in the list fails as out of scope. An
  arm64 disposition may not be justified by amd64 evidence, or the reverse: SCX-0010 and
  SCX-0011 exist precisely because SCX-0002…0005 cannot reach the arm64 artifact.
* **SCX-0010 and SCX-0011 are weaker than their amd64 counterparts on purpose.** Seven advisories
  are NOT_AFFECTED on `linux/amd64` (one under SCX-0004, six under SCX-0005) and only RISK_ACCEPTED on `linux/arm64`,
  because the govulncheck binary-mode analysis exists for `52c8749d…` and not for `3a8ef022…`.
  Running that analysis on the arm64 binary is the work that would justify reclassifying them,
  and it must be recorded as new evidence in a new record, never by editing these.
* Owner and approver must remain distinct parties; a record cannot approve itself.
* This document's SHA-256 is bound by every citing record. Editing it — even by one byte —
  invalidates those records until the digest is re-approved.
