#!/usr/bin/env bash
# THE EYE — Phase 0 demo (fully local, reproducible).
set -euo pipefail
cd "$(dirname "$0")/.."

export EYE_DB_APP_PASSWORD=${EYE_DB_APP_PASSWORD:-eye_app_local_dev}
export EYE_DB_ALLOCATOR_PASSWORD=${EYE_DB_ALLOCATOR_PASSWORD:-eye_allocator_local_dev}
export EYE_DB_MIGRATE_PASSWORD=${EYE_DB_MIGRATE_PASSWORD:-eye_local_dev}
export EYE_IDENTITY_JWT_SECRET=${EYE_IDENTITY_JWT_SECRET:-local-dev-secret-change-me-0000000000000000}

echo "==> 1/6 docker compose up (postgres:18 + redis:8)"
docker compose up -d --wait

echo "==> 2/6 install + build"
pnpm install --frozen-lockfile
pnpm build

echo "==> 3/6 migrations"
pnpm db:migrate

echo "==> 4/6 audited bootstrap (one-shot; skipped if platform admin exists)"
EYE_BOOTSTRAP_ADMIN=platform-admin EYE_BOOTSTRAP_PASSWORD=bootstrap-local-dev-1 \
  node apps/api/dist/bootstrap/run-bootstrap.js || true

echo "==> 5/6 start API (:3401) and web shell (:3000)"
(cd apps/api && node dist/main.js &> /tmp/eye-api.log &)
(pnpm --filter @eye/web start &> /tmp/eye-web.log &)
sleep 3
curl -sf localhost:3401/readyz && echo

echo "==> 6/6 acceptance suite (15 criteria, reproducible evidence)"
pnpm --filter @eye/api test:accept

cat << 'DONE'

  Demo ready:
    WS-19 shell:  http://localhost:3000   (platform-admin / bootstrap-local-dev-1)
    API:          http://localhost:3401/readyz
  Walkthrough: login -> Tenants & Domains (governed create with review step)
    -> Users & Roles -> Canonical Objects (create claim; leave evidence empty
    to see EYE-PRV-001; open an object for version history + known-at query)
    -> Audit Ledger (sanitized projection; Verify chain).
DONE
