# Supply-chain maintenance, 2026-09 — the re-pin that cannot yet be made

Under ADR-P0-01 the monthly cadence re-pins the two Compose images to patched builds within their
major versions and re-scans them as a blocking gate. This note records the September 2026 attempt:
**no patched official image exists for the findings that fail the gate**, so this PR does not
re-pin, adds no waiver, and instead makes the daily C15 recheck the thing that notices the rebuild.

## 1. What fails the gate today

The C15 supply-chain gate on `main` (last green run 2026-09-04) and on PR #38 (2026-09-05) fails
on **13 ungoverned HIGH findings** in the exact pinned digests, all util-linux
(CVE-2026-53612, -53613, -53614, -76642, -78408, -78409, -78410), published to the advisory
database after the last green run:

| Pinned image | Package | Installed | Alpine fix |
|---|---|---|---|
| `postgres@sha256:9a8afca5…` (`postgres:18-alpine`, Alpine 3.24.1) | `libuuid` | 2.42.1-r0 | 2.42.3-r0 (CVE-2026-78408: 2.42.3-r1) |
| `redis@sha256:978f0e01…` (`redis:8-alpine`, Alpine 3.23.5) | `setpriv` | 2.41.4-r0 | 2.41.6-r0 (CVE-2026-78408: 2.41.6-r1) |

## 2. What the registry offers (scanned 2026-09-06, trivy 0.73.0, linux/amd64)

| Tag | Index digest today | util-linux | OpenSSL | c-ares |
|---|---|---|---|---|
| `postgres:18-alpine` | `sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2` | `libuuid` **2.42.1-r0 — affected** | 3.5.7-r0 (SCX-0006/7 class) | 1.34.8 — the SCX-0001 finding is gone in this build |
| `redis:8-alpine` | `sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576` | `setpriv` **2.41.4-r0 — affected** | 3.5.7-r0 (SCX-0008/9 class) | — |
| `postgres:18-alpine3.22`, `postgres:18-alpine3.23`, `postgres:18.1-alpine`, `redis:8-alpine3.22`, `redis:8.4-alpine` | (2026-09-05 scans) | affected in every variant | affected | — |

Every published Postgres 18 and Redis 8 image variant ships util-linux below the Alpine fix.
Alpine published the fixed packages; the official images have not been rebuilt with them.

## 3. Why there is no re-pin in this PR

* **"Patched images rather than waivers"** is the instruction. There is no patched image, and a
  waiver is what a disposition record is. Neither is done here.
* Re-pinning `postgres:18-alpine` to today's `d3e1620b…` would retire the c-ares acceptance
  (SCX-0001) but leave the gate red on util-linux, and would require every other postgres record
  (SCX-0002…0007) to be re-bound to the new child digest — including the `gosu` NOT_AFFECTED
  symbol analyses (SCX-0004/0005), which are evidence about one exact binary and would have to be
  regenerated and re-approved. That is a security review, not a maintenance re-pin; it is the
  right thing to do **once**, when the util-linux rebuild lands, so that one re-pin and one
  re-approval close everything.

## 4. What this PR does instead

`scripts/gate/check-patched-images.mjs` — required in CI and scheduled daily — now watches the
util-linux findings alongside the OpenSSL acceptance:

* three specs (`openssl`, `util-linux/postgres`, `util-linux/redis`), one scan per image, every
  spec decided from the same report;
* Alpine **package** ranges, revision-aware: `2.42.3-r0` still fails CVE-2026-78408 and only
  `-r1` clears the set; an unknown revision reads as affected;
* on a rebuilt image the check FAILS and names the digest to re-pin to, and says whether SCX
  records must be deleted (OpenSSL) or that none exist and the re-pin is what turns the gate green
  (util-linux).

Digest consistency (`scripts/verify-images.sh`, `conformance.manifest.json` ⇄
`docker-compose.yml`) and the gate's record reconciliation are untouched. Nothing in
`docs/SCANNER_DISPOSITIONS.md` changes: its SHA-256 binds nine approved records and this PR
approves nothing.

## 5. When the recheck fires

1. Re-pin `docker-compose.yml` and `conformance.manifest.json` to the named digest(s),
   `pinned_at` = that day.
2. Re-scan under the gate; re-bind or delete the SCX records the new child digest invalidates —
   with the owner's approval, since the records carry `approved_on`.
3. If the OpenSSL rebuild lands in the same image, delete SCX-0006…0009 as the recheck says.
