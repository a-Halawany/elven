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

## v2 (2026-09-10): util-linux + OpenSSL + c-ares

`v2/` holds the second candidate: the same base digests, ONE `apk add` pinning
`libuuid`/`setpriv` (as above) **plus** `libcrypto3`/`libssl3` 3.5.8-r0 (CVE-2026-14456) and,
on postgres, `c-ares` 1.34.8-r0 (CVE-2026-33630), each asserted with `apk list -I`. Scans:
postgres 32 → 25 (v1) → **22** (only the `gosu` Go-stdlib set, SCX-0002..0005, remains);
redis 8 → 2 → **0**. Config identical to the bases; TLS 1.3 verified through the patched
libssl; base-written data read by v2. Evidence in `evidence/v2/`; publication facts (names,
platforms, visibility, permissions, size, post-publication re-pin steps) in
`v2/PUBLICATION.md`. Still not pinned or published.

## v3 (2026-09-10): v2 + an explicit `USER` (trivy DS-0002)

`v2/*.Dockerfile` were edited **in place**: the v2 package recipe (the `FROM` digest, the single
`apk add`, every version pin and every `apk list -I` assertion) is byte-for-byte unchanged, and one
instruction was appended as the LAST one — `USER postgres` (uid 70 / gid 70) and `USER redis`
(uid 999 / gid 1000). Evidence in `evidence/v3/`.

### Why

The C15 gate runs `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL
--ignorefile /dev/null --exit-code 1` over the whole tree as a **blocking** step
(`scripts/gate/supply-chain.mjs`, "filesystem vulnerabilities"). trivy's Dockerfile check
**DS-0002** ("Specify at least 1 USER command in Dockerfile with non-root user as argument") is
HIGH, and a `FROM`-plus-`RUN` recipe that merely inherits the base's (empty) `User` fails it —
reproduced on the tree before the edit: 4 findings (v1 postgres, v1 redis, v2 postgres, v2 redis),
exit 1 (`evidence/v3/trivy-fs-candidates-before.txt`). No `.trivyignore`, inline ignore, gate change
or relocation was used; the recipe satisfies the check by actually running as the service user from
the first instruction.

After the edit (`evidence/v3/trivy-fs-exit-codes.txt`):

| `trivy fs` target | exit | HIGH/CRITICAL findings |
|---|---|---|
| `infra/images/candidates/v2` (the v3 recipes) | **0** | 0 |
| `infra/images/candidates` | 1 | 2 x DS-0002, both on the **v1** files `postgres-18-alpine.Dockerfile`, `redis-8-alpine.Dockerfile` (unchanged; to be removed) |
| `.` (repository root, exactly the gate's form) | 1 | the same 2 x DS-0002 on the v1 files; `pnpm-lock.yaml` 0; `v2/*` 0 |

### What the `USER` relies on (upstream, verified in the pinned bases' entrypoints)

* **postgres** (docker-library/postgres README, "Arbitrary `--user` Notes"): in
  `docker-entrypoint.sh`, `docker_create_db_directories()` runs its `find "$PGDATA" ! -user
  postgres -exec chown postgres` **only when `id -u` = 0** (comment: "allow the container to be
  started with `--user`"), and `_main()` does `exec gosu postgres "$BASH_SOURCE"` **only when
  `id -u` = 0**. Started as uid 70 it goes straight to initdb / `exec postgres`. `getent passwd 70`
  resolves (`postgres` is in `/etc/passwd`), so the nss_wrapper fallback is not needed.
* **redis** (`docker-entrypoint.sh` line 117): privileges are dropped
  (`fix_data_dir_perms` + `exec setpriv --reuid redis --regid redis --clear-groups --nnp
  --inh-caps=-all ...`) only if "our uid is 0 (container started without explicit --user)" and the
  process has `setuid`/`setgid` capabilities; otherwise it sets the umask and `exec`s
  `redis-server` directly.

`gosu` and `setpriv` are therefore **never executed** in v3, but both binaries remain in the image
(the recipe removes nothing); the 22 Go-stdlib findings on `usr/local/bin/gosu` and the SCX-0002..0005
records are unchanged.

### Build, config, scans (`evidence/v3/build-*.txt`, `inspect-config-diff.txt`, `scan-*`)

| Tag | Platform | Image Id | Layers added over the base |
|---|---|---|---|
| `eye-cand3-postgres:18-alpine-maint` | linux/arm64 | `sha256:ee4fc649fb6a1a09a7ecc44722e06e93fdefb976955e69d77a782fc7386fe338` | `RUN apk ...` 6.25 MB, `USER postgres` 0 B |
| `eye-cand3-postgres:amd64` | linux/amd64 | `sha256:7fbf192f83bd8ce6770dbcf1b7952b1bab4754dc487fcfd56e223f406ea51ab8` | 6.42 MB, 0 B |
| `eye-cand3-redis:8-alpine-maint` | linux/arm64 | `sha256:7edbdeac8859419f170f7059c57325d1517de7be8402d5ef0d827f7584b16ed2` | 5.96 MB, 0 B |
| `eye-cand3-redis:amd64` | linux/amd64 | `sha256:16ec77e6431c2d50ff394a8fb822be2c545394a7d4ecd306c754f0d73902e236` | 6.15 MB, 0 B |

Built with `--no-cache --pull=false` (`--platform linux/amd64` for the amd64 pair); the apk
transactions upgraded exactly the v2 packages. `docker image inspect` full `.Config` diff
(`jq -S`, every key) between each base child and its v3 image: **one added key**,
`"User": "postgres"` / `"User": "redis"`; `Entrypoint`, `Cmd`, `Env`, `ExposedPorts`, `Volumes`,
`WorkingDir`, `StopSignal`, labels, healthcheck all identical. (The v1/v2 statement "`USER` ... is
inherited, not redeclared" no longer holds for v3; everything else in it does.)

trivy 0.73.0 image scans with the v2 arguments (`vuln,secret,misconfig`, HIGH/CRITICAL,
`--ignorefile /dev/null`, both platforms): **finding sets identical to v2** — postgres 22 (all
`usr/local/bin/gosu`, `pkg:golang/stdlib@v1.24.6`; `evidence/v3/vulns-v3-postgres-*.tsv` diff
against `evidence/v2/vulns-v2-postgres-*.tsv` is empty), redis 0; 0 secrets, 0 misconfigurations
on all four (`evidence/v3/scan-summary.txt`). Installed versions read back from the scans:
`libuuid 2.42.3-r1`, `libcrypto3/libssl3 3.5.8-r0`, `c-ares 1.34.8-r0`, `setpriv 2.41.6-r1`.

### Observed compatibility with the `USER` change (`evidence/v3/compat-postgres.txt`, `compat-redis.txt`; throwaway passwords, never printed)

postgres (arm64 image; (a2) repeats the fresh-volume start on the amd64 image under emulation):

| Check | Result | Observed |
|---|---|---|
| (a) fresh named volume, compose env (`POSTGRES_USER=eye`, `POSTGRES_DB=eye`) | pass | container `Config.User=postgres`; PID 1 `Uid: 70` from the first instruction; initdb "files ... will be owned by user \"postgres\""; PostgreSQL 18.4; `uuid-ossp` v1/v4, `gen_random_uuid()`, `pgcrypto` digest/hmac/`gen_random_bytes` all ok; every file under `/var/lib/postgresql` owned by uid 70 |
| (b) data directory initialised by the **base** (root entrypoint, chown, gosu), then started by v3 | pass | base leaves `/var/lib/postgresql/18` **root-owned 0755** (its `mkdir -p` runs as root) and `18/docker` `70:0 0700`; v3 logs "Skipping initialization", reads the 3 base-written rows, INSERTs and CHECKPOINTs; no permission line in the log. This is the live `eye-pgdata` upgrade path |
| (c) `docker exec <c> psql` as the default user; `-u root` | pass | default exec user is `uid=70(postgres)`; `psql -U postgres` works (b); with the compose env the superuser is `eye`, so `-U postgres` reports "role does not exist" exactly as on the base; `docker exec -u root` gives uid 0 and can write `/root` |
| (d) `pg_dump -Fc` via `docker exec -e PGPASSWORD` (the `scripts/ops/backup.sh` form), `pg_dumpall --globals-only`, `pg_restore` round trip | pass | dump 3459 bytes, restored into a second database, 3 rows |
| (e) compose healthcheck `pg_isready -U eye -d eye` | pass | exit 0 as the default user; Docker `State.Health.Status=healthy` with the compose command as `--health-cmd` |
| (f) log free of "could not change permissions" / "chown" / "Permission denied" | pass on substance | none of those strings in any v3 log; the one `FATAL: role "postgres" does not exist` that the grep caught was produced by this suite's own (c) probe against the `eye` cluster (annotated in the transcript) |
| (g) `docker stop`/`start`, `docker restart` | pass | rows intact, "database system was shut down at ... / ready to accept connections" |
| (b2) limit case: PGDATA **not** owned by uid 70 (simulated `chown -R 0:0`) | documented | v3 exits 1: `initdb: error: could not access directory "/var/lib/postgresql/18/docker": Permission denied` (the base would have chowned it as root). Fix: one start with `--user root` (the entrypoint then runs its root path: chown to postgres, gosu), after which v3 as shipped starts; verified |

redis (arm64 image; (a2) repeats start/PONG/SAVE on the amd64 image under emulation):

| Check | Result | Observed |
|---|---|---|
| (a) fresh named volume, compose command `redis-server --requirepass <pw>` | pass | container `Config.User=redis`; PID 1 `Uid: 999 Gid: 1000` from the first instruction; log "Starting Redis Server"; `PONG`, SET/GET, `INFO server` redis_version 8.10.0; unauthenticated PING refused (`NOAUTH`) from inside and from the host port |
| (b) `dump.rdb` written by the **base** (root entrypoint + setpriv drop) in a named volume | pass | base-written volume: `/data` `999:1000 0755`, `dump.rdb` `999:1000 0600` (the base's setpriv path already ran redis as uid 999, so the files are the service user's); v3 loads it (`rdb_last_load_keys_loaded:4`, values `a b c d`) and **writes** it (`SAVE` -> OK, file rewritten as 999:1000) |
| (c) `SAVE`, `BGSAVE` | pass | `OK`, `rdb_last_bgsave_status:ok`, `dump.rdb` 999:1000 |
| (d) compose healthcheck `redis-cli -a "$REDIS_HEALTHCHECK_PASSWORD" ping \| grep -q PONG` | pass | exit 0 as the default user; `State.Health.Status=healthy`; `docker exec -u root` gives uid 0 |
| (e) `docker stop`/`start`, `docker restart` | pass | "DB loaded from disk", keys intact |
| (b2) limit case: `/data` and `dump.rdb` owned by root | documented | v3 exits 1: `Fatal error: can't open the RDB file dump.rdb for reading: Permission denied` / `Fatal error loading the DB ... Exiting.` (the base's `fix_data_dir_perms` would have chowned it). Fix: one start with `--user root` (entrypoint chowns `/data` to redis and drops through setpriv), after which v3 as shipped starts, DBSIZE 5, SAVE OK; verified. Note `docker-compose.yml` gives redis **no volume**, so `/data` is the image's own `999:1000` directory |

### Operator-facing differences (v3 vs the bases / v2)

* `docker exec <container> ...` runs as **`postgres` (uid 70) / `redis` (uid 999)** by default;
  root is available with **`docker exec -u root <container> ...`** (verified). `docker-compose.yml`
  needs no change for this: its healthchecks already run as whatever the image's user is.
* The entrypoints' root-only repair steps (`chown` of `$PGDATA`/`/var/run/postgresql`; redis
  `fix_data_dir_perms`) **do not run**. Data directories must already belong to uid 70 / uid 999.
  Every directory the base images ever initialised does (observed in (b)); a volume populated by
  other means is repaired by one start with `--user root`, which re-enables the base behaviour for
  that run, or by `docker run --rm -u root -v <vol>:/data <image> chown -R redis /data`.
* Process security posture. postgres: identical to the base (gosu changes only uid/gid; PID 1 shows
  `CapEff 0`, `CapBnd 00000000a80425fb`, `NoNewPrivs 0` on both). redis: the base's setpriv path
  additionally **cleared the capability bounding set and set no-new-privs**
  (`CapBnd 0000000000000000`, `NoNewPrivs 1`); v3 runs with Docker's defaults for a non-root user
  (`CapEff 0`, `CapBnd 00000000a80425fb`, `NoNewPrivs 0`). Equivalent hardening is available in
  compose (`cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`) and was **not** applied
  here; it is the owner's call at pin time.
* `--user root` at container start restores the bases' root path (chown, then gosu/setpriv) in
  full — the entrypoints are unchanged.

Still not pinned or published. Local `eye-cand3-*` containers and volumes were removed after the
run; the four image tags were kept.
