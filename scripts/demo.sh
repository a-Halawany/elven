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
LOCAL_DIR=.eye-local
ENV_FILE="$LOCAL_DIR/env"
mkdir -p "$LOCAL_DIR" && chmod 700 "$LOCAL_DIR"
# Gate-2 §8: repair an EXISTING handoff file's mode before use (a permissive mode
# from an earlier run or a copy is corrected, never tolerated).
[[ -f "$ENV_FILE" ]] && chmod 600 "$ENV_FILE"

gen() { openssl rand -base64 24 | tr -d '/+=' ; }

if [[ ! -f "$ENV_FILE" ]]; then
  # Caller-supplied values are recorded as-is so the handoff file always
  # reflects the material actually in use; missing keys are generated.
  umask 177
  cat > "$ENV_FILE" << EOF
EYE_DB_PASSWORD=${EYE_DB_PASSWORD:-$(gen)}
EYE_DB_APP_PASSWORD=${EYE_DB_APP_PASSWORD:-$(gen)}
EYE_DB_ALLOCATOR_PASSWORD=${EYE_DB_ALLOCATOR_PASSWORD:-$(gen)}
EYE_DB_SYSTEM_PASSWORD=${EYE_DB_SYSTEM_PASSWORD:-$(gen)}
EYE_DB_COMMIT_PASSWORD=${EYE_DB_COMMIT_PASSWORD:-$(gen)}
EYE_DB_IDENTITY_PASSWORD=${EYE_DB_IDENTITY_PASSWORD:-$(gen)}
EYE_DB_PUBLISHER_PASSWORD=${EYE_DB_PUBLISHER_PASSWORD:-$(gen)}
EYE_DB_VERIFIER_PASSWORD=${EYE_DB_VERIFIER_PASSWORD:-$(gen)}
EYE_DB_RECOVERY_PASSWORD=${EYE_DB_RECOVERY_PASSWORD:-$(gen)}
EYE_REDIS_PASSWORD=${EYE_REDIS_PASSWORD:-$(gen)}
EYE_IDENTITY_JWT_SECRET=${EYE_IDENTITY_JWT_SECRET:-$(gen)$(gen)}
EYE_TEST_BOOTSTRAP_PASSWORD=${EYE_TEST_BOOTSTRAP_PASSWORD:-$(gen)}
EYE_TEST_ADMIN_PASSWORD=${EYE_TEST_ADMIN_PASSWORD:-$(gen)}
EOF
  umask 022
  echo "==> generated local secret material in $ENV_FILE (0600, gitignored)"
fi
# Caller-supplied environment values take precedence over the handoff file.
while IFS='=' read -r k v; do
  [[ -z "$k" || "$k" == \#* ]] && continue
  if [[ -z "${!k:-}" ]]; then printf -v "$k" '%s' "$v"; export "$k"; fi
done < "$ENV_FILE"
export EYE_DB_PASSWORD EYE_DB_APP_PASSWORD EYE_DB_ALLOCATOR_PASSWORD \
       EYE_DB_SYSTEM_PASSWORD EYE_DB_COMMIT_PASSWORD EYE_DB_IDENTITY_PASSWORD \
       EYE_DB_PUBLISHER_PASSWORD EYE_DB_VERIFIER_PASSWORD EYE_DB_RECOVERY_PASSWORD \
       EYE_REDIS_PASSWORD EYE_IDENTITY_JWT_SECRET \
       EYE_TEST_BOOTSTRAP_PASSWORD EYE_TEST_ADMIN_PASSWORD
export EYE_DB_MIGRATE_PASSWORD="${EYE_DB_MIGRATE_PASSWORD:-$EYE_DB_PASSWORD}"

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
