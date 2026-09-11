# Candidate v3 patched image for the pinned redis:8-alpine service image.
# (v3 = the v2 package recipe below, unchanged, plus the explicit USER at the end.)
# NOT yet pinned in docker-compose.yml; see ../README.md and PUBLICATION.md.
#
# Base:      redis:8-alpine at the digest pinned by docker-compose.yml
#            (Alpine 3.23.5). Installed: setpriv-2.41.4-r0, libcrypto3-3.5.7-r0,
#            libssl3-3.5.7-r0. (c-ares is not installed in this base.)
# Change:    ONE apk transaction upgrading, in place, to the exact fixed versions
#            served by v3.23/main (verified with `apk policy` / `apk search -x`,
#            evidence/v2/verify-fixed-redis-*.txt):
#              setpriv    2.41.4-r0 -> 2.41.6-r1  (util-linux: CVE-2026-53612, -53613,
#                                                  -53614, -76642, -78408, -78410;
#                                                  CVE-2026-78409 is not reported
#                                                  against setpriv)
#              libcrypto3 3.5.7-r0  -> 3.5.8-r0   (OpenSSL: CVE-2026-14456)
#              libssl3    3.5.7-r0  -> 3.5.8-r0   (OpenSSL: CVE-2026-14456; depends on
#                                                  libcrypto3=3.5.8-r0 exactly)
#            setpriv depends on musl and libcap-ng (already installed, unchanged);
#            the OpenSSL libraries depend only on musl (`apk info -R`), so the
#            transaction pulls nothing else. Nothing else is installed or upgraded.
# Note:      apk-tools 3.0.6 rejects `apk upgrade pkg=version`, so the exact versions
#            are pinned with apk's `add pkg=version` constraint (recorded in
#            /etc/apk/world). Every `apk list -I` assertion fails the build if the
#            index no longer serves exactly that version.
# USER:      The base image has no USER (its config User is ""); it starts as root and
#            docker-entrypoint.sh drops to `redis` through setpriv. The repository gate
#            runs `trivy fs --scanners ...,misconfig --severity HIGH,CRITICAL --exit-code 1`
#            over the whole tree, and trivy's Dockerfile check DS-0002 ("Specify at least
#            1 USER command in Dockerfile with non-root user") is HIGH, so a recipe that
#            only inherits the base's root start fails the gate. v3 runs as the service
#            user from the first instruction instead. This relies on the upstream
#            entrypoint's documented non-root path: docker-entrypoint.sh drops privileges
#            (fix_data_dir_perms + `exec setpriv --reuid redis ...`) only if
#            "our uid is 0 (container started without explicit --user)"; otherwise it
#            sets the umask and `exec`s redis-server directly. setpriv is therefore never
#            invoked in v3 (the patched binary is still present and still scanned).
#            Consequences: the entrypoint can no longer chown a /data that is not already
#            writable by uid 999, and `docker exec` runs as redis by default (operators
#            use `docker exec -u root` for root). See ../README.md, "v3".
FROM redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241
RUN apk add --no-cache setpriv=2.41.6-r1 libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 \
 && apk list -I setpriv    | grep -q '^setpriv-2.41.6-r1 ' \
 && apk list -I libcrypto3 | grep -q '^libcrypto3-3.5.8-r0 ' \
 && apk list -I libssl3    | grep -q '^libssl3-3.5.8-r0 '
# Last instruction: run as the service user (redis = uid 999 / gid 1000 in this base).
USER redis
