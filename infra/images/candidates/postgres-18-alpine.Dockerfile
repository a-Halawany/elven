# Candidate patched image for the pinned postgres:18-alpine service image.
# NOT yet pinned in docker-compose.yml; see README.md in this directory.
#
# Base:      postgres:18-alpine at the digest pinned by docker-compose.yml
#            (Alpine 3.24.1; util-linux subpackage present: libuuid-2.42.1-r0)
# Change:    libuuid 2.42.1-r0 -> 2.42.3-r1 (v3.24/main), the only util-linux
#            subpackage installed in the base. Addresses the util-linux advisories
#            CVE-2026-53612, -53613, -53614, -76642, -78408, -78409, -78410.
# Note:      apk-tools 3.0.6 rejects `apk upgrade pkg=version` ("Package not found"),
#            so the exact version is pinned with apk's `add pkg=version` constraint,
#            which upgrades the already-installed package in place. The trailing
#            `apk list -I` assertion fails the build if the index no longer serves
#            exactly that version. Nothing else is installed or upgraded.
FROM postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
RUN apk add --no-cache libuuid=2.42.3-r1 \
 && apk list -I libuuid | grep -q '^libuuid-2.42.3-r1 '
