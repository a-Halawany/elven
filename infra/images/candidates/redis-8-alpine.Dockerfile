# Candidate patched image for the pinned redis:8-alpine service image.
# NOT yet pinned in docker-compose.yml; see README.md in this directory.
#
# Base:      redis:8-alpine at the digest pinned by docker-compose.yml
#            (Alpine 3.23.5; util-linux subpackage present: setpriv-2.41.4-r0)
# Change:    setpriv 2.41.4-r0 -> 2.41.6-r1 (v3.23/main), the only util-linux
#            subpackage installed in the base. Addresses the util-linux advisories
#            reported against setpriv (CVE-2026-53612, -53613, -53614, -76642,
#            -78408, -78410; CVE-2026-78409 is not reported against this package).
# Note:      apk-tools 3.0.6 rejects `apk upgrade pkg=version` ("Package not found"),
#            so the exact version is pinned with apk's `add pkg=version` constraint,
#            which upgrades the already-installed package in place. The trailing
#            `apk list -I` assertion fails the build if the index no longer serves
#            exactly that version. Nothing else is installed or upgraded.
FROM redis@sha256:978f0e01593e65eed801f2402944efcd936d43b5027e4908a7897baf88ed6241
RUN apk add --no-cache setpriv=2.41.6-r1 \
 && apk list -I setpriv | grep -q '^setpriv-2.41.6-r1 '
