# Candidate patched service images (not yet pinned)

Local, reproducible-recipe candidates for the two service images pinned in
`docker-compose.yml`. **Nothing here is pinned, published or referenced by the
compose file or the gate.** Adopting a candidate means building it, pushing it
to a registry the gate can resolve, and replacing the compose digest in a
separate change; this directory only records the recipe and its evidence.

| Candidate | Base (pinned digest) | Alpine | Package changed | Advisories addressed |
|---|---|---|---|---|
| `postgres-18-alpine.Dockerfile` | `postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15` (postgres:18-alpine) | 3.24.1 | `libuuid` 2.42.1-r0 -> **2.42.3-r1** (v3.24/main) | CVE-2026-53612, -53613, -53614, -76642, -78408, -78409, -78410 |
| `redis-8-alpine.Dockerfile` | `redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241` (redis:8-alpine) | 3.23.5 | `setpriv` 2.41.4-r0 -> **2.41.6-r1** (v3.23/main) | CVE-2026-53612, -53613, -53614, -76642, -78408, -78410 (CVE-2026-78409 is not reported against setpriv) |

## Recipe

Each Dockerfile is `FROM <the exact pinned digest>` plus one `RUN` that upgrades
the single util-linux subpackage present in that base to the exact fixed
version, then asserts the installed version:

```
RUN apk add --no-cache libuuid=2.42.3-r1 && apk list -I libuuid | grep -q '^libuuid-2.42.3-r1 '
```

* `apk-tools` 3.0.6 (in both bases) rejects `apk upgrade pkg=version`
  ("Package 'libuuid=2.42.3-r1' not found"); `apk add pkg=version` is apk's
  version-constraint form and upgrades the already-installed package in place
  ("(1/1) Upgrading libuuid (2.42.1-r0 -> 2.42.3-r1)"). Side effect: the
  constraint is recorded in `/etc/apk/world` (`libuuid=2.42.3-r1`;
  `setpriv` -> `setpriv=2.41.6-r1`), which is the honest record of the pin.
* The trailing `apk list -I` assertion fails the build if the index no longer
  serves exactly that version, instead of silently building something else.
* Nothing else is installed or upgraded. The bases also have upgradable
  `openssl` (libcrypto3/libssl3 3.5.7-r0 -> 3.5.8-r0, CVE-2026-14456), and
  postgres has `c-ares` and a `gosu` binary built with Go 1.24.6 (22 stdlib
  advisories); those are deliberately out of scope of these candidates and
  remain HIGH/CRITICAL in the candidate scans.
* `USER`, `ENTRYPOINT`, `CMD`, `ENV`, `EXPOSE` and `VOLUME` are inherited, not
  redeclared; `docker image inspect` of each candidate shows a config identical
  to its base for all of those fields.

Build (context = this directory; no `docker login`, no push):

```
docker build --no-cache --pull=false -t eye-cand-postgres:18-alpine-util-linux -f infra/images/candidates/postgres-18-alpine.Dockerfile infra/images/candidates
docker build --no-cache --pull=false -t eye-cand-redis:8-alpine-util-linux     -f infra/images/candidates/redis-8-alpine.Dockerfile     infra/images/candidates
```

The gate scans the `linux/amd64` child manifest; on an arm64 host add
`--platform linux/amd64` to build the variant the gate would see (done once
locally as `eye-cand-*:amd64`; its finding set is identical to the arm64 one
because Alpine package versions are architecture-independent).

## Inputs that are pinned, and inputs that are not

Pinned: base image digest; Alpine branch (inherited from the base's
`/etc/apk/repositories`); package name and exact version; the Dockerfile.

Not pinned (limitations for bit-for-bit reproducibility):

1. **APKINDEX snapshot.** `apk add --no-cache` fetches the live index from
   `dl-cdn.alpinelinux.org` at build time (observed: v3.24/main index
   `v3.24.1-530-gfb317804d78`, v3.23/main `v3.23.5-194-g67c786fbc92`,
   2026-09-09). The version pin makes the *package content* deterministic while
   that version is served, but Alpine offers no dated index snapshot to pin, so
   a future build can fail (assertion) rather than drift.
2. **File mtimes and `/var/log/apk.log`.** apk stamps the files it writes
   (`/etc/apk/world`, `/lib/apk/db/{installed,scripts.tar.gz,triggers}`, the
   `libuuid.so.1` symlink, `/var/log/apk.log` and their directories) with the
   build wall-clock, and `apk.log` embeds "Running `apk add ...` at <time>".
   Two builds therefore produce different layer diffids even with
   `--build-arg SOURCE_DATE_EPOCH=0` (which only pins the image config's
   `Created`). The package payload (`libuuid.so.1.3.0`, `bin/setpriv`), the
   `installed` db and `world` were verified byte-identical across builds. A
   bit-reproducible variant would need BuildKit's
   `--output type=image,rewrite-timestamp=true` with `SOURCE_DATE_EPOCH` and a
   normalised or removed `apk.log`.

## Evidence

Scan/SBOM/compatibility evidence from the 2026-09-09 run was written to the
session scratchpad (`images/` directory), not to the repository. Headline:

* trivy 0.73.0 (DB 2026-09-09), `--ignorefile /dev/null`, HIGH/CRITICAL:
  postgres 32 -> 25 findings (the 7 libuuid advisories gone, nothing new);
  redis 8 -> 2 (the 6 setpriv advisories gone, nothing new). `vuln,secret,misconfig`
  scans of both candidates: 0 secrets, 0 misconfigurations.
* CycloneDX SBOM delta: exactly one component changed per image
  (`libuuid@2.42.1-r0 -> 2.42.3-r1`, BSD-3-Clause; `setpriv@2.41.4-r0 ->
  2.41.6-r1`, GPL-2.0-or-later). Licences unchanged.
* Compatibility: PostgreSQL 18.4 starts, `uuid-ossp`/`gen_random_uuid()` work,
  runs as uid 70 `postgres` with the same data-directory ownership as the base;
  a data directory initialised by the base is read by the candidate (3 rows).
  Redis 8.10.0 starts, the entrypoint drops privileges through the patched
  `setpriv` ("setpriv from util-linux 2.41.6"), runs as `redis`; a `dump.rdb`
  written by the base is loaded by the candidate (`rdb_last_load_keys_loaded:4`).
