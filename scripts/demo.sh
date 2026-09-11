#!/usr/bin/env bash
# THE EYE — Phase 0 demo (fully local, reproducible). Remediation R7:
#  - NO fixed default secrets: every secret is caller-supplied via the
#    environment or generated once into the 0600, gitignored handoff directory
#    .eye-local/ (a secret generated inside this script would be invisible to
#    the calling shell after exit — the handoff FILE is the supported channel).
#  - bootstrap failures are never hidden: exit 2 = already bootstrapped
#    (continue), anything else nonzero = abort.
set -euo pipefail
cd "$(dirname "$0")/.."

# --- 0. Secret material (caller env wins; else generated once, 0600) --------
#
# Gate-2.1 §9: the CANONICAL loader (scripts/local-env.mjs) is the single writer of
# the handoff file. This script used to keep its own bash copy of the generation
# logic, and the copy had drifted: it exported EYE_DB_MIGRATE_PASSWORD into its own
# process but never PERSISTED it, so any later process that merely sourced the file
# could not run migrations. One writer, one key list, no drift.
LOCAL_DIR=.eye-local
ENV_FILE="$LOCAL_DIR/env"

node -e "import('./scripts/local-env.mjs').then(m => m.loadLocalEnv()).catch(e => { console.error(String(e)); process.exit(1); })"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "demo: the canonical loader did not produce $ENV_FILE" >&2
  exit 1
fi
# Caller-supplied environment values already took precedence inside the loader;
# everything it generated or preserved is read back here.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
echo "==> local secret material ready in $ENV_FILE (0600, gitignored, canonical loader)"

# Every runtime authority the API loads must be present before anything starts.
for k in EYE_DB_PASSWORD EYE_DB_MIGRATE_PASSWORD EYE_DB_APP_PASSWORD EYE_DB_ALLOCATOR_PASSWORD \
         EYE_DB_COMMIT_PASSWORD EYE_DB_IDENTITY_PASSWORD EYE_DB_PUBLISHER_PASSWORD \
         EYE_DB_VERIFIER_PASSWORD EYE_DB_RECOVERY_PASSWORD EYE_REDIS_PASSWORD \
         EYE_IDENTITY_JWT_SECRET EYE_TEST_BOOTSTRAP_PASSWORD EYE_TEST_ADMIN_PASSWORD; do
  if [[ -z "${!k:-}" ]]; then echo "demo: $k missing from the secret handoff" >&2; exit 1; fi
done

echo "==> 1/6 docker compose up (postgres:18-alpine + redis:8-alpine, digest-pinned, loopback-only)"
docker compose up -d --wait

echo "==> 2/6 install + build"
pnpm install --frozen-lockfile
pnpm build

echo "==> 3/6 migrations"
pnpm db:migrate

echo "==> 4/6 audited bootstrap (one-shot; exit 2 = already bootstrapped)"
# One-time secret handoff (R7): caller-supplied EYE_BOOTSTRAP_PASSWORD wins;
# otherwise the generated EYE_TEST_BOOTSTRAP_PASSWORD from the 0600 handoff
# file is used, so the CALLING shell can read it after this script exits.
# First login FORCES rotation; the credential disables itself if unused for
# 24h (ADR-P0-17). On a fresh database the acceptance suite (step 6) performs
# that forced rotation itself — the resulting admin password is
# EYE_TEST_ADMIN_PASSWORD in $ENV_FILE.
export EYE_BOOTSTRAP_PASSWORD="${EYE_BOOTSTRAP_PASSWORD:-$EYE_TEST_BOOTSTRAP_PASSWORD}"
set +e
EYE_BOOTSTRAP_ADMIN="${EYE_BOOTSTRAP_ADMIN:-platform-admin}" node apps/api/dist/bootstrap/run-bootstrap.js
bootstrap_rc=$?
set -e
if [[ $bootstrap_rc -eq 2 ]]; then
  echo "    already bootstrapped — continuing"
elif [[ $bootstrap_rc -ne 0 ]]; then
  echo "    bootstrap FAILED (exit $bootstrap_rc) — aborting" >&2
  exit $bootstrap_rc
fi

echo "==> 5/6 start API (:3401) and web shell (:3000)"
# The demonstration is its OWN deployment: its degraded-audit journal must not be the dev API's,
# or incidents of a database that was dropped and recreated keep reporting the demo DEGRADED.
export EYE_DEGRADED_DIR="${EYE_DEGRADED_DIR:-$PWD/apps/api/.eye-local/degraded-demo}"
mkdir -p "$EYE_DEGRADED_DIR"
(cd apps/api && node dist/main.js &> /tmp/eye-api.log &)
(pnpm --filter @eye/web start &> /tmp/eye-web.log &)
for _ in $(seq 1 30); do
  curl -sf localhost:3401/readyz > /dev/null 2>&1 && break
  sleep 1
done
curl -sf localhost:3401/readyz && echo

echo "==> 6/6 acceptance suite (15 criteria + remediation paths, reproducible evidence)"
pnpm --filter @eye/api test:accept

cat << DONE

  Demo ready:
    WS-19 shell:  http://localhost:3000
                  user: platform-admin
                  password: EYE_TEST_ADMIN_PASSWORD in $ENV_FILE (0600)
                  (the acceptance suite exercised the forced first-login
                   rotation of the one-time bootstrap secret)
    API:          http://localhost:3401/readyz
  Walkthrough: login -> Tenants & Domains (governed create with review step)
    -> Users & Roles -> Canonical Objects (create claim; leave evidence empty
    to see EYE-PRV-001; open an object for version history + known-at query)
    -> Audit Ledger (sanitized projection; Verify chain).
DONE
