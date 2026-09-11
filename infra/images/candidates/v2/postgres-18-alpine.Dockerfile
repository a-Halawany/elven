# Candidate v3 patched image for the pinned postgres:18-alpine service image.
# (v3 = the v2 package recipe below, unchanged, plus the explicit USER at the end.)
# NOT yet pinned in docker-compose.yml; see ../README.md and PUBLICATION.md.
#
# Base:      postgres:18-alpine at the digest pinned by docker-compose.yml
#            (Alpine 3.24.1). Installed: libuuid-2.42.1-r0, libcrypto3-3.5.7-r0,
#            libssl3-3.5.7-r0, c-ares-1.34.6-r0.
# Change:    ONE apk transaction upgrading, in place, to the exact fixed versions
#            served by v3.24/main (verified with `apk policy` / `apk search -x`,
#            evidence/v2/verify-fixed-postgres-*.txt):
#              libuuid    2.42.1-r0 -> 2.42.3-r1  (util-linux: CVE-2026-53612, -53613,
#                                                  -53614, -76642, -78408, -78409, -78410)
#              libcrypto3 3.5.7-r0  -> 3.5.8-r0   (OpenSSL: CVE-2026-14456)
#              libssl3    3.5.7-r0  -> 3.5.8-r0   (OpenSSL: CVE-2026-14456; depends on
#                                                  libcrypto3=3.5.8-r0 exactly)
#              c-ares     1.34.6-r0 -> 1.34.8-r0  (CVE-2026-33630)
#            Each target depends only on musl (`apk info -R`), so the transaction
#            pulls nothing else. Nothing else is installed or upgraded.
# Not changed: /usr/local/bin/gosu (upstream gosu 1.19, Go 1.24.6). It is not an
#            apk package; its Go-stdlib advisories are governed by SCX-0002..0005.
# Note:      apk-tools 3.0.6 rejects `apk upgrade pkg=version`, so the exact versions
#            are pinned with apk's `add pkg=version` constraint (recorded in
#            /etc/apk/world). Every `apk list -I` assertion fails the build if the
#            index no longer serves exactly that version.
# USER:      The base image has no USER (its config User is ""); it starts as root and
#            docker-entrypoint.sh re-executes itself as `postgres` through gosu. The
#            repository gate runs `trivy fs --scanners ...,misconfig --severity HIGH,CRITICAL
#            --exit-code 1` over the whole tree, and trivy's Dockerfile check DS-0002
#            ("Specify at least 1 USER command in Dockerfile with non-root user") is HIGH,
#            so a recipe that only inherits the base's root start fails the gate. v3 runs
#            as the service user from the first instruction instead. This relies on the
#            upstream image's documented support for an arbitrary non-root user
#            (docker-library/postgres README, "Arbitrary --user Notes"): in
#            docker-entrypoint.sh, docker_create_db_directories() only runs its
#            `find ... -exec chown postgres` when `id -u` = 0, and _main() only does
#            `exec gosu postgres` when `id -u` = 0; as uid 70 it proceeds straight to
#            initdb / `exec postgres`. gosu is therefore never invoked in v3 (the binary
#            is still present and still scanned; SCX-0002..0005 are unchanged).
#            Consequences: the entrypoint can no longer chown a data directory that is
#            not already owned by uid 70, and `docker exec` runs as postgres by default
#            (operators use `docker exec -u root` for root). See ../README.md, "v3".
FROM postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
RUN apk add --no-cache libuuid=2.42.3-r1 libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 c-ares=1.34.8-r0 \
 && apk list -I libuuid    | grep -q '^libuuid-2.42.3-r1 ' \
 && apk list -I libcrypto3 | grep -q '^libcrypto3-3.5.8-r0 ' \
 && apk list -I libssl3    | grep -q '^libssl3-3.5.8-r0 ' \
 && apk list -I c-ares     | grep -q '^c-ares-1.34.8-r0 '
# Last instruction: run as the service user (postgres = uid 70 / gid 70 in this base).
USER postgres
