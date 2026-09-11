# `linux/arm64` gosu findings — the decision that is still the approver's to make

Prepared 2026-09-11 for the review at `461a2b56` (finding "Arm64 dispositions — matching is
evidenced; approval must be attributable"). This document does not approve anything. It states
what is authorised today, what is not, what was analysed on the artifact itself since the review,
and the one concrete decision that remains, in the form the approver can sign.

## 1. What is authorised, and by whom

| Decision | Authority | Where it is recorded |
|---|---|---|
| GHCR as a TEMPORARY maintenance route; publication of the derived images for `linux/amd64` **and** `linux/arm64`; re-issuance of the *applicable* SCX dispositions for the new artefacts under the governed process | the owner (2026-09-10, from the review at `59a2459`) | `docs/images/DERIVED_IMAGES_APPROVAL.md` |
| SCX-0002…0005 (`linux/amd64`, gosu stdlib set): RISK_ACCEPTED ×2, NOT_AFFECTED ×2, re-issued for the derived amd64 child | the closed Gate-2.2 security review (approved 2026-08-14/15; re-issued 2026-09-10 under the owner's re-issuance approval) | `scripts/gate/scanner-exclusions.json`, `docs/SCANNER_DISPOSITIONS.md` §3.1–3.5 |
| **SCX-0010 / SCX-0011 (`linux/arm64`, 21 HIGH + 1 CRITICAL, RISK_ACCEPTED, expiring 2026-11-05)** | **none attributable.** These are NEW acceptances (the arm64 child was never governed before), drafted by the author on 2026-09-10 under the owner's item "arm64 governance before live rollout". The owner asked for the platform to be governed; the owner did not decide to accept these 22 findings. The `approver` field names the review process (`gate-2.2-security-review`), not a person who made this decision. | `scripts/gate/scanner-exclusions.json` (SCX-0010/0011), `docs/SCANNER_DISPOSITIONS.md` §3.7–3.8 |

The gate's reconciliation passing on SCX-0010/0011 (44 findings, 6 records, 0 unmatched / unused /
out-of-scope / stale) proves that the records **match** the findings on the right platform. It does not
prove that anyone authorised accepting them. Until the decision below is made, SCX-0010/0011 are
provisional: the derived arm64 child must not be rolled into the live deployment on their strength,
which is why the governed live-container recreation on this arm64 host stays blocked on this item.

## 2. What was analysed on the arm64 artifact since the review (2026-09-11)

The review identified the missing resource precisely — a Go toolchain with `govulncheck` — and asked
for a free one. The analysis was run inside the official Go image, native `linux/arm64`, on the exact
binary the records govern. Nothing was carried across from the amd64 analysis.

| Item | Value |
|---|---|
| Binary | `/usr/local/bin/gosu` extracted from the published arm64 child `sha256:d3dd485bd0507df537c7a8f7fbdf7dcf9ba8fb2007ca75b12af5c362237a92cc` of `ghcr.io/a-halawany/elven/postgres@sha256:69a974ae…` (`docker create --platform linux/arm64`, `docker cp`, container removed) |
| Binary sha256 / size | `3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44` / 1,830,424 bytes — the same measurements SCX-0010/0011 record |
| Toolchain | `golang@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59` (`golang:1.25-alpine`, arm64), `govulncheck@v1.1.4`, Go vulnerability database `https://vuln.go.dev` updated 2026-09-10 14:48:42 UTC |
| Command | `govulncheck -mode binary /work/gosu` (text) and `-json` |
| Result | **"Your code is affected by 0 vulnerabilities."** 45 advisories are present in required modules / imported packages and **not called**; 3 of them at package level, 42 at module level. |
| The 22 governed advisories | **every one is present in the result and unreachable**: 21 at module level, CVE-2026-39822 (GO-2026-4970) at package level. 0 with a called vulnerable symbol. None absent. |
| Evidence files | `infra/images/published/20260910/gosu-arm64-3a8ef022.govulncheck.txt` (302 bytes) and `.json` (404,710 bytes, the full OSV entries and findings) |

For comparison, the amd64 analysis bound by SCX-0004/0005 (`docs/evidence/govulncheck-gosu-b6a16ed0.*`,
binary `52c8749d…`) reports the same shape: 0 called, 48 findings across 45 advisories, 168 OSV entries.
The two binaries are different files; the two analyses were performed separately; they agree.

## 3. The decision, in signable form

One decision, three options. It belongs to the owner (or an approver the owner names), who is not the
author of the records (`owner: founding-engineer`). No date is filled in here.

**Option A — accept SCX-0010 / SCX-0011 as they stand.** RISK_ACCEPTED on the operational argument
(gosu runs once at container start, drops privileges and exits; no listener; loopback-bound PostgreSQL;
local-only profile under EXC-P0-004), expiring 2026-11-05. The symbol analysis of §2 is additional
comfort but is not what the record claims. To sign: set `approver` on both records to the approver's
identity, set `approved_on` to the day of signature (not 2026-09-10), and re-bind
`docs/SCANNER_DISPOSITIONS.md`.

**Option B — re-issue as NOT_AFFECTED on the arm64 symbol analysis.** New records (SCX-0012 for the 21
HIGH, SCX-0013 for the CRITICAL — a HIGH record never absorbs a CRITICAL) classified
`NOT_AFFECTED (vulnerable_code_not_present)` on the strength of §2, with the two evidence files of §2
bound by sha256 alongside `postgres-arm64.trivy.txt` and `gosu-verification.txt`; SCX-0010/0011 retired
to `retired_records` with the reason "superseded by symbol analysis performed on this artifact". This
is the arm64 counterpart of what SCX-0004/0005 already are on amd64, on evidence produced the same way
on the artifact in question — and it is exactly the path `docs/SCANNER_DISPOSITIONS.md` §5 reserved:
"recorded as new evidence in a new record, never by editing these". To sign: the approver's identity
and the day of signature on the new records.

**Option C — refuse.** Then the arm64 child is not an approved artifact: the live deployment on this
arm64 host may not be recreated on the derived image (it must stay on the official image it runs today
until a compatible fixed official arm64 image qualifies, with the util-linux/OpenSSL/c-ares findings
that image carries governed instead), and `docker-compose.yml` must pin an image the gate accepts on
both platforms.

**What the author recommends:** Option B. The classification would then say what the evidence
says — the vulnerable code is present in the binary and not reachable from it — instead of accepting a
risk the analysis shows is not exercised. The recommendation is not the decision.

## 4. What this does not change

* SCX-0002…0005 keep their scope (`linux/amd64`), dates, expiry and evidence. Seven of the arm64
  advisories (CVE-2026-39821 under SCX-0004 and the six under SCX-0005, which include
  CVE-2026-33818) are NOT_AFFECTED on amd64; earlier prose that said "eight" counted CVE-2026-33818
  twice and has been corrected.
* The two-platform gate (`SCAN_PLATFORMS`, platform-qualified matching, OUT-OF-SCOPE for an unscanned
  platform) stays as it is; the review confirmed the matching.
* GHCR stays temporary; upstream monitoring stays; no purchase, no cadence or budget change, no
  request for the GHCR route to be approved again.
* The Go image used for the analysis is a scanning tool, pinned by digest above, pulled once for this
  purpose; it is not part of the product, not a service image and not a new pin.
