# Candidate v2 service images — publication facts for the owner's approval

Status: **built and evaluated locally on 2026-09-10; NOT published, NOT pinned.** Nothing in
`docker-compose.yml`, `conformance.manifest.json` or `scripts/gate/scanner-exclusions.json`
references these images. This document states the facts the owner needs to approve
publication; it makes no decision.

**v3 amendment (2026-09-10, later the same day).** The two Dockerfiles in this directory now end
with `USER postgres` / `USER redis` (candidate "v3" = the v2 package recipe, unchanged, plus that
one instruction), because the gate's blocking `trivy fs ... --scanners vuln,secret,misconfig`
step fails trivy's Dockerfile check DS-0002 (HIGH) on any recipe without a non-root `USER`. The
package set, the base digests, the scan finding sets and every publication fact below are
unchanged; what changes is the image config (`User` is now set) and the runtime behaviour that
follows from it (the entrypoints' root-only chown/gosu/setpriv steps are skipped). Details,
evidence and the observed compatibility are in `../README.md` ("v3") and `../evidence/v3/`. The
v3 tags and image ids are listed in §1; scan facts in §2 apply to v3 verbatim (verified).

## 1. What v2 is

| Image | Recipe | Base (pinned digest, unchanged) | Packages upgraded in ONE apk transaction |
|---|---|---|---|
| postgres | `infra/images/candidates/v2/postgres-18-alpine.Dockerfile` | `postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` (postgres:18-alpine, Alpine 3.24.1) | `libuuid` 2.42.1-r0 → **2.42.3-r1**; `libcrypto3` 3.5.7-r0 → **3.5.8-r0**; `libssl3` 3.5.7-r0 → **3.5.8-r0**; `c-ares` 1.34.6-r0 → **1.34.8-r0** |
| redis | `infra/images/candidates/v2/redis-8-alpine.Dockerfile` | `redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241` (redis:8-alpine, Alpine 3.23.5) | `setpriv` 2.41.4-r0 → **2.41.6-r1**; `libcrypto3` 3.5.7-r0 → **3.5.8-r0**; `libssl3` 3.5.7-r0 → **3.5.8-r0** |

v2 = v1 (util-linux only) + the OpenSSL fix (CVE-2026-14456) + c-ares (CVE-2026-33630,
postgres only). Fixed versions were verified against the live Alpine index on both
architectures (`evidence/v2/verify-fixed-*.txt`): v3.24/main `v3.24.1-534-g0adb5f52202`,
v3.23/main `v3.23.5-195-g7d9b04ca29c`, identical for x86_64 and aarch64. Each target depends
only on musl (setpriv also on the already-installed libcap-ng); `libssl3` requires
`libcrypto3=3.5.8-r0` exactly, which is why both are pinned together. The simulated and real
transactions upgrade exactly the listed packages and nothing else. `gosu` is not touched.

Local artefacts (kept as `eye-cand2-*` tags; not the digests that will be pinned — see §4):

| Tag | Platform | Image Id | Uncompressed | Added layer (uncompressed / gzip -6) |
|---|---|---|---|---|
| `eye-cand2-postgres:amd64` | linux/amd64 | `sha256:b68f7839ccec47c5bb937ccf15fc39bd8c622f1a25c96e7581d0fdc509459339` | 295.6 MiB | 6.15 MiB / 2.40 MiB |
| `eye-cand2-postgres:18-alpine-maint` | linux/arm64 | `sha256:ccbbfa4403186d2e11f61f92a199796332a5c51be672c6ddd5f619695794e263` | 290.0 MiB | 5.98 MiB / 2.69 MiB |
| `eye-cand2-redis:amd64` | linux/amd64 | `sha256:35e9b763096bd0bd16155c8b20369c26131a72792e62e11e676b51bcd2852d51` | 118.9 MiB | 5.89 MiB / 2.29 MiB |
| `eye-cand2-redis:8-alpine-maint` | linux/arm64 | `sha256:180109ff191ec15103496d9f8515db45b2b446e1bf8bbc078c05b3ae51dcb075` | 118.5 MiB | 5.70 MiB / 2.57 MiB |

Config (`USER`, `ENTRYPOINT`, `CMD`, `ENV`, `EXPOSE`, `VOLUME`, `WORKDIR`, `STOPSIGNAL`,
labels, healthcheck) is identical to the base on all four (`evidence/v2/inspect-config-layers.txt`).

v3 local artefacts (the recipe as it now stands in this directory, i.e. v2 + `USER`; the four
`eye-cand2-*` tags above remain the record of the recipe without `USER`):

| Tag | Platform | Image Id | Added layers |
|---|---|---|---|
| `eye-cand3-postgres:amd64` | linux/amd64 | `sha256:7fbf192f83bd8ce6770dbcf1b7952b1bab4754dc487fcfd56e223f406ea51ab8` | `RUN apk ...` 6.42 MB + `USER postgres` 0 B |
| `eye-cand3-postgres:18-alpine-maint` | linux/arm64 | `sha256:ee4fc649fb6a1a09a7ecc44722e06e93fdefb976955e69d77a782fc7386fe338` | 6.25 MB + 0 B |
| `eye-cand3-redis:amd64` | linux/amd64 | `sha256:16ec77e6431c2d50ff394a8fb822be2c545394a7d4ecd306c754f0d73902e236` | 6.15 MB + 0 B |
| `eye-cand3-redis:8-alpine-maint` | linux/arm64 | `sha256:7edbdeac8859419f170f7059c57325d1517de7be8402d5ef0d827f7584b16ed2` | 5.96 MB + 0 B |

v3 config differs from the base in exactly one key, `User` (`"postgres"` / `"redis"`); every other
field is identical (`evidence/v3/inspect-config-diff.txt`, full `.Config` diff). The `USER` layer
is metadata only, so the registry sizes in §4 are unchanged.

## 2. Evidence headline (2026-09-10, trivy 0.73.0, DB 2026-09-09 13:11 UTC, `--ignorefile /dev/null`, HIGH/CRITICAL, `vuln,secret,misconfig`)

| Image | base | v1 | **v2** | Fixed by v2 (vs v1) | Remaining on v2 | New on v2 |
|---|---|---|---|---|---|---|
| postgres (amd64 = arm64) | 32 | 25 | **22** | CVE-2026-14456 ×2 (libcrypto3, libssl3), CVE-2026-33630 (c-ares) | 22 Go-stdlib advisories in `usr/local/bin/gosu` (SCX-0002..0005) | none |
| redis (amd64 = arm64) | 8 | 2 | **0** | CVE-2026-14456 ×2 (libcrypto3, libssl3) | none | none |

0 secrets, 0 misconfigurations on every v2 scan. Finding sets are identical on linux/amd64 and
linux/arm64. **v3** (same arguments, `evidence/v3/scan-summary.txt`, `vulns-v3-*.tsv`): finding sets
byte-identical to v2 on all four images (postgres 22, all `usr/local/bin/gosu`; redis 0; 0 secrets,
0 misconfigurations). The Dockerfiles themselves, scanned the way the gate scans the tree
(`trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --ignorefile /dev/null
--exit-code 1`), are clean: exit 0 over `infra/images/candidates/v2`
(`evidence/v3/trivy-fs-v2dir.txt`); over the repository root the only HIGH findings are DS-0002 on the
two **v1** files `infra/images/candidates/*.Dockerfile`, which are not part of this publication
(`evidence/v3/trivy-fs-repo-root.txt`, `trivy-fs-exit-codes.txt`). CycloneDX SBOM delta base→v2 is exactly the upgraded components (4 on postgres,
3 on redis); licences unchanged (Apache-2.0, MIT, BSD-3-Clause, GPL-2.0-or-later —
`evidence/v2/licence-delta.txt`).

`gosu` (`evidence/v2/gosu-verification.txt`): byte-identical to the base on each platform
(amd64 `52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0`, the binary
SCX-0004/0005 analysed with govulncheck; arm64 `3a8ef022…`), identical 22-finding set, and every
finding matches its current SCX record on purl, target, severity, installed version and package.

Compatibility (`evidence/v2/compat-*.txt`, passwords never printed): PostgreSQL 18.4 starts;
`uuid-ossp`/`gen_random_uuid()`/`pgcrypto` work; the image ships **no server certificate**
(`ssl=off`, `sslmode=prefer` negotiates plaintext); with a throwaway certificate mounted,
`sslmode=prefer`, `require` and `verify-full` all negotiate **TLSv1.3 / TLS_AES_256_GCM_SHA384**
through the patched libssl 3.5.8; a data directory initialised by the base is read by v2
(3 rows); no recovery messages. Redis 8.10.0 starts, drops privileges through setpriv 2.41.6,
`--tls-port` serves TLS and refuses plaintext, a base-written `dump.rdb` loads
(`rdb_last_load_keys_loaded:4`). Neither image has an `openssl` CLI; the library identity is
`OpenSSL 3.5.8 25 Aug 2026` (embedded string) and `apk list -I`.

Reproducibility (`evidence/v2/reproducibility-*.txt`): two builds differ only in apk-stamped
mtimes and `/var/log/apk.log` content; all payload files, `installed` and `world` are
byte-identical. Image Ids therefore differ per build; the registry digest is fixed by the push.

## 3. Proposed registry names

| Service | Mutable tag (proposed) | Immutable reference (known only after push) |
|---|---|---|
| postgres | `ghcr.io/a-halawany/elven/postgres:18-alpine-maint-20260910` | `ghcr.io/a-halawany/elven/postgres@sha256:<index-or-manifest digest reported by the push>` |
| redis | `ghcr.io/a-halawany/elven/redis:8-alpine-maint-20260910` | `ghcr.io/a-halawany/elven/redis@sha256:<…>` |

`YYYYMMDD` is the build date, which supports the ADR-P0-01 monthly cadence (each month a new
dated tag, each pinned by digest). `elven/` is a name segment of the package
(`elven/postgres`), not a repository link. The account `a-halawany` is the owner's handle as
given in the task; it was not verified here.

Obtain the immutable reference with `docker buildx imagetools inspect <tag>` (the `Digest:`
line) and pin **that** — never the tag — in the three places listed in §8.

## 4. Platforms and what each costs

| Choice | Registry (compressed) storage | Purpose |
|---|---|---|
| `linux/amd64` only — **required**: the gate scans this child; CI runs on `ubuntu-latest` | postgres ≈ 114.4 MiB base layers + 2.4 MiB new layer ≈ **117 MiB**; redis ≈ 37.2 + 2.3 ≈ **39.5 MiB**; total ≈ **156 MiB** | gate, CI |
| `linux/arm64` in addition — optional | postgres ≈ 112.3 + 2.7 ≈ **115 MiB**; redis ≈ 36.9 + 2.6 ≈ **39.5 MiB**; total ≈ **+155 MiB** (≈ 311 MiB for both platforms) | local development on Apple-silicon hosts. Without it, `docker compose` on an arm64 host pulls the amd64 child and runs PostgreSQL/Redis under emulation. The current official index provides both, so publishing both preserves today's developer experience. |

Figures are the sum of the base children's compressed layer sizes read from their OCI manifests
plus gzip -6 of the added layer (`evidence/v2/sizes.txt`); manifests and configs add a few KiB.
The base layers are not shared with docker.io — they are re-uploaded to GHCR — but identical
blobs within one GHCR repository are stored once, so a later monthly rebuild on the same base
adds only its new layer (≈ 2.5 MiB) plus manifests. Whether GitHub bills deduplicated or
logical bytes must be **verified on the billing page**.

A multi-platform push (`docker buildx build --platform linux/amd64,linux/arm64 --push`) creates
an OCI index; the gate's resolver (`scripts/gate/lib/scanner-provenance.mjs`) handles both an
index (scans the `linux/amd64` child, ignores buildkit attestation manifests) and a
single-platform manifest (scans the pinned digest itself). Add `--provenance=false --sbom=false`
if attestation manifests are not wanted in the index.

Publish either the locally evaluated images (retag and push; layers preserved) or a CI rebuild
from the Dockerfile (payload identical apart from mtimes, §2). Either way the authoritative scan
is the gate's own run against the pinned digest after publication (§8).

## 5. Visibility: public vs private

| | Public | Private |
|---|---|---|
| GitHub Packages storage/transfer charge | none — public packages are free (GitHub, "About billing for GitHub Packages") | counts against the account's Packages quota |
| Free-tier quota for a personal account (from GitHub's pricing/billing documentation as of this author's knowledge — **verify on the billing page**) | n/a | Free plan: 500 MB storage, 1 GB/month data transfer; Pro: 2 GB storage, 10 GB/month transfer. Overage (same source, verify): USD 0.008 per GB per day storage, USD 0.50 per GB transfer. Transfer initiated from GitHub Actions is not charged. |
| Fit of v2 in the Free plan quota | n/a | amd64 only ≈ 156 MiB fits; both platforms ≈ 311 MiB fits with little headroom; every additional monthly set adds ≈ 5 MiB if blobs are deduplicated, ≈ 156–311 MiB if billed logically (verify). |
| Gate / CI changes | none: `docker buildx imagetools inspect` and trivy read public images anonymously | `supply-chain` job in `.github/workflows/ci.yml` needs `packages: read` and a `docker login ghcr.io -u ${{ github.actor }} --password-stdin` with `GITHUB_TOKEN` before the gate (both `imagetools inspect` and trivy use the Docker credential store). `c15-patched-image-recheck.yml` asserts an EXACT `contents: read` permission map and resolves official docker.io tags only; it does not pull the derived image and needs no change. |
| Local development | `docker compose up` works unauthenticated | every developer needs `docker login ghcr.io` with a PAT carrying `read:packages` |
| Default on creation | — | new GHCR packages under a personal account are private by default; change under package → Package settings → Danger Zone → Change visibility |

The images contain only upstream open-source software (official postgres/redis Alpine images
plus Alpine packages); nothing in them is proprietary to this project.

## 6. Permissions the publishing workflow needs

```yaml
permissions:
  contents: read      # checkout
  packages: write     # push to ghcr.io
  # id-token: write   # ONLY if cosign keyless signing is added (as c19-anchor.yml does for its publish job)
```

Nothing else: no `contents: write`, no `attestations`. Login with
`docker login ghcr.io -u ${{ github.actor }} --password-stdin <<< "${{ secrets.GITHUB_TOKEN }}"`.
No personal access token is required for publication from the repository's own workflow.

## 7. Access checks to perform

1. Repository → Settings → Actions → General → **Workflow permissions**: the explicit
   `permissions:` block above overrides the default for `GITHUB_TOKEN`; confirm the repository
   does not restrict workflows from requesting `packages: write`.
2. After the first push from the workflow with `GITHUB_TOKEN`, the package is created and
   linked to the repository automatically. Package → Package settings → **Manage Actions
   access**: confirm the repository is listed with role **Write** (publishing) — the gate only
   needs Read. If the package were instead first pushed from a workstation with a PAT, add the
   repository there manually.
3. Package visibility (§5).
4. Optional linking label `org.opencontainers.image.source` was deliberately NOT added: it would
   change the image config, which differs from the base only in `User` (v3). Pushing from the
   repository's workflow links the package without it.

## 8. Post-publication steps (exact)

1. Resolve the immutable digests: `docker buildx imagetools inspect ghcr.io/a-halawany/elven/postgres:18-alpine-maint-20260910` (and redis); record `Digest:` and the `linux/amd64` child digest.
2. `docker-compose.yml`: replace both `image:` values with `ghcr.io/a-halawany/elven/<svc>@sha256:<digest>` (keep the human tag as a trailing comment; `pinnedImages()` in `scripts/gate/supply-chain.mjs` matches `image:\s*(\S+@sha256:[a-f0-9]{64})`, so a ghcr path is accepted). Nothing else in the compose file needs to change at re-pin time: the process protections (`user:`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]` on both services) were applied on 2026-09-10 and verified on the pinned bases and on v3 (`../README.md`, "Process protections restored in `docker-compose.yml`"; `evidence/v3/process-protections.txt`); the healthchecks run as the service user and were verified as `postgres`/`redis` (`evidence/v3/compat-*.txt`); the live `eye-pgdata` volume was initialised by the base, whose `$PGDATA` is owned by uid 70, which is the layout v3 was verified against; redis has no volume. Operators: `docker exec` runs as the service user; `docker exec -u root` is root without capabilities under `cap_drop: [ALL]`, so an ownership repair is a separate `docker run --rm -u root -v <vol>:/data <image> chown ...`.
3. `conformance.manifest.json` → `pinned_images.{postgres,redis}`: `human_tag`, `digest`, `pinned_at`. CI's "Pinned-digest consistency" step requires compose == manifest.
4. `scripts/gate/scanner-exclusions.json`, under the governed approval process (owner ≠ approver; `approved_on`/`reviewed_on` = the date the review actually happens):
   * **delete** SCX-0001 (c-ares), SCX-0006, SCX-0007 (postgres OpenSSL), SCX-0008, SCX-0009 (redis OpenSSL): their findings are fixed; an unused record fails the gate.
   * **re-issue** SCX-0002, SCX-0003, SCX-0004, SCX-0005 with `image` = the new pinned postgres reference. `result_target` (`usr/local/bin/gosu`), `package_purl` (`pkg:golang/stdlib@v1.24.6`), `installed_version`, `severities`, `scan_platform` all still match (`evidence/v2/gosu-verification.txt`). The NOT_AFFECTED basis of SCX-0004/0005 carries over because the analysed binary is byte-identical (sha256 `52c8749d…`); the govulncheck artefacts `docs/evidence/govulncheck-gosu-b6a16ed0.*` remain valid evidence for that binary, but their vuln-DB date (2026-08-14) does not move, and the set expires 2026-11-05 regardless.
   * `docs/SCANNER_DISPOSITIONS.md` must be updated (§1 scanned reference and child, §3 reconciliation: 22 findings, 4 records, redis clean); its SHA-256 changes, so every record's `evidence_sha256`/`evidence_files` must be re-bound.
5. `scripts/gate/check-patched-images.mjs` + `.github/workflows/c15-patched-image-recheck.yml` + `scripts/gate/lib/c19-patched-images.mjs`: their stated premise ("SCX-0006..0009 accept residual risk because no official image carries the fix") is retired by step 4. Run the recheck once (it still resolves the official `postgres:18-alpine`/`redis:8-alpine` tags); then the owner decides whether to keep it as the trigger for returning to an official image (reword its comments and failure text, which currently say "DELETE the corresponding SCX records") or retire it.
6. Run the full FINAL C16/C17 chain (`ci.yml` `supply-chain` job: C15 gate with `--final --expected-sha`, C16 closures, C17 finalisation) on the commit that re-pins; `evidence/supply-chain/*` is regenerated by it. Check `apps/api/test/gate/fixtures/c15-trace/trace.json`, which embeds the old digests, for any assertion against tracked source.
7. Update `infra/images/candidates/README.md` to state that v2 is published and pinned.
8. Calendar: the derived image inherits ADR-P0-01's monthly re-pin; each rebuild is a new dated tag, a new digest, and a repeat of steps 1–6.

## 9. Source revision binding

Dockerfiles: `infra/images/candidates/v2/postgres-18-alpine.Dockerfile`,
`infra/images/candidates/v2/redis-8-alpine.Dockerfile`, evaluated in the working tree of
branch `phase6-decisions` at commit `2e839458361b2accc457f5ae1b53d7a2263780ce` (the files are
not yet committed; the publishing commit's SHA is the binding to record alongside the digests).
The v3 edit (`USER` appended) was made and evaluated in the same working tree at the same HEAD.
Evidence: `infra/images/candidates/evidence/v2/` (v2) and `infra/images/candidates/evidence/v3/`
(v3: build logs, config diff, scan tables/TSVs, trivy fs outputs, compatibility transcripts);
full JSON reports and SBOMs in the session scratchpads `images-v2/` and `v3/`.
