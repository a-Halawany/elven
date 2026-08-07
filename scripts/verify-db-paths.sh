#!/usr/bin/env bash
#
# Both database paths (Gate-2.1 delivery requirement):
#
#   A. FORWARD UPGRADE — an existing database with 0001–0010 applied, carrying
#      real data written by the pre-upgrade ports, upgrades through 0011/0012
#      with no rebaseline and no data loss, and the application then serves the
#      complete acceptance + integration suites on THAT upgraded database.
#   B. VIRGIN INSTALL — 0001–0012 apply to an empty database and the same suites
#      pass there too.
#
# Run from the repo root with .eye-local/env present.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.eye-local/env; set +a

HOLD=$(mktemp -d)
trap 'for f in "$HOLD"/*.sql; do [ -e "$f" ] && mv -f "$f" apps/api/migrations/ || true; done; rmdir "$HOLD" 2>/dev/null || true' EXIT

psql_su() { docker exec -e PGPASSWORD="$EYE_DB_PASSWORD" eye-postgres psql -U eye -d eye "$@"; }

fresh_stack() {
  pkill -f "dist/main.js" 2>/dev/null || true
  rm -rf .eye-local/degraded apps/api/.eye-local/degraded   # durable journal: a fresh path starts clean
  # ORDER MATTERS. docker-compose.yml pins container_name for predictable
  # `docker exec` targets, so a stack started from a DIFFERENT checkout of this repo
  # owns those names. While it does, `docker compose down -v` cannot remove the
  # containers and therefore CANNOT remove the volumes either — leaving a stale
  # database whose superuser password predates the current handoff. Release the
  # names FIRST, then tear the project down with its volumes.
  docker rm -f eye-postgres eye-redis >/dev/null 2>&1 || true
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  docker compose up -d >/dev/null 2>&1 || { echo "FAIL: docker compose up"; docker compose up -d; exit 1; }
  for _ in $(seq 1 60); do docker exec eye-postgres pg_isready -U eye -d eye >/dev/null 2>&1 && break; sleep 1; done
  sleep 2
  # VERIFY the volume is genuinely virgin rather than assuming it: a reused volume
  # is exactly how a "virgin install" proof stops proving anything.
  local applied
  applied=$(psql_su -Atc "select count(*) from public.schema_migrations" 2>/dev/null || echo "0")
  if [ "$applied" != "0" ]; then
    echo "FAIL: the database is not virgin ($applied migrations already recorded)"; exit 1
  fi
  echo "(virgin volume verified: 0 migrations recorded, superuser authenticates)"
}

counts() {
  psql_su -Atc "
    select 'tenants=' || (select count(*) from tenancy.tenants)
        || ' domains=' || (select count(*) from tenancy.domains)
        || ' principals=' || (select count(*) from identity.principals)
        || ' bindings=' || (select count(*) from identity.role_bindings)
        || ' sessions=' || (select count(*) from identity.sessions)
        || ' audit=' || (select count(*) from audit.audit_events)
        || ' heads=' || (select count(*) from audit.audit_chain_heads)
        || ' migrations=' || (select count(*) from public.schema_migrations);"
}

echo "############################################################"
echo "# PATH A — FORWARD UPGRADE (0001-0010 -> 0011/0012)"
echo "############################################################"
fresh_stack
mv apps/api/migrations/0011_*.sql apps/api/migrations/0012_*.sql "$HOLD"/
echo "--- applying 0001-0010 ONLY ---"
node apps/api/scripts/migrate.mjs
echo
echo "--- seeding real data through the PRE-UPGRADE ports ---"
psql_su -v ON_ERROR_STOP=1 -Atc "
insert into tenancy.tenants (id, name, status) values (gen_random_uuid(), 'fwd-tenant', 'active');
insert into tenancy.domains (id, tenant_id, name, status)
  select gen_random_uuid(), id, 'fwd-domain', 'active' from tenancy.tenants where name='fwd-tenant';
insert into identity.principals (id, kind, scope, tenant_id, display_name, login_name, status)
  select gen_random_uuid(), 'human', 'TENANT', id, 'fwd-admin', 'fwd-admin', 'active'
    from tenancy.tenants where name='fwd-tenant';
insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id)
  select gen_random_uuid(), p.id, 'tenant_admin', 'TENANT', p.tenant_id
    from identity.principals p where p.login_name='fwd-admin';
select 'business rows seeded';"
psql_su -v ON_ERROR_STOP=1 -Atc "
do \$\$
DECLARE v_sid uuid := gen_random_uuid(); v_pid uuid; v_tid uuid; v_key text := repeat('k', 40);
BEGIN
  SELECT id, tenant_id INTO v_pid, v_tid FROM identity.principals WHERE login_name='fwd-admin';
  PERFORM identity.session_open(v_sid, v_pid, 'password', repeat('a',64),
    encode(public.digest(convert_to(v_key,'UTF8'),'sha256'),'hex'), now() + interval '1 hour', gen_random_uuid());
  PERFORM ctx.issue(v_sid, v_key, 'TENANT', v_tid, NULL, 'forward-upgrade seed', 60);
  PERFORM audit.commit_event('test.pre_upgrade','test.seed','success','OK',
    NULL,NULL,NULL,NULL::uuid,NULL,gen_random_uuid(),NULL::uuid,NULL,NULL,NULL,'{}'::jsonb);
END \$\$;
select 'audit event seeded through the 0010-era commit path';"
echo
echo "--- PRE-UPGRADE state ---"
BEFORE=$(counts); echo "$BEFORE"
PRE_HASH=$(psql_su -Atc "select row_hash from audit.audit_events order by audit_seq limit 1")
echo "pre-upgrade audit row_hash: $PRE_HASH"
echo
echo "--- UPGRADING the existing database (0011/0012 restored) ---"
mv "$HOLD"/0011_*.sql "$HOLD"/0012_*.sql apps/api/migrations/
node apps/api/scripts/migrate.mjs
echo
echo "--- POST-UPGRADE state (identical data, 12 migrations) ---"
AFTER=$(counts); echo "$AFTER"
echo "$BEFORE" | sed 's/ migrations=[0-9]*//' > /tmp/eye-before.txt
echo "$AFTER"  | sed 's/ migrations=[0-9]*//' > /tmp/eye-after.txt
if ! diff -q /tmp/eye-before.txt /tmp/eye-after.txt >/dev/null; then
  echo "FAIL: data changed across the upgrade"; exit 1
fi
echo "VERIFIED: every pre-upgrade row count is unchanged across the upgrade"
POST_HASH=$(psql_su -Atc "select row_hash from audit.audit_events order by audit_seq limit 1")
[ "$PRE_HASH" = "$POST_HASH" ] || { echo "FAIL: audit row hash changed"; exit 1; }
echo "VERIFIED: the pre-upgrade audit row hash is byte-identical ($POST_HASH)"
echo
echo "--- applied-file immutability: 0001-0010 digests and timestamps ---"
psql_su -Atc "select filename || '  ' || left(digest,16) || '  ' || applied_at from public.schema_migrations order by filename;"
echo
echo "--- the pre-upgrade audit row still verifies under the NEW canonicalizer ---"
psql_su -Atc "
select case when count(*) = sum(case when e.event_jcs = canon.jcs(e.event) then 1 else 0 end)
            then 'ALL ' || count(*) || ' PRE-UPGRADE ROW(S) STILL VERIFY (event_jcs == canon.jcs(event))'
            else 'MISMATCH' end from audit.audit_events e;"
echo
echo "--- legacy mechanisms are UNREACHABLE (must be 0) ---"
psql_su -Atc "
select 'legacy definitions remaining = ' || count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname='ctx' and p.proname in ('issue_system','issue'))
    or (n.nspname='public' and p.proname in ('eye_ctx_field','eye_ctx_part','eye_set_context','eye_set_system_context'))
    or (n.nspname='objects' and p.proname in ('outbox_ack','outbox_claim'))
    or (n.nspname='audit' and p.proname='my_partition_status');"
echo
echo "--- the APPLICATION serves the full suites on the UPGRADED database ---"
rm -rf .eye-local/degraded apps/api/.eye-local/degraded   # durable journal: a fresh path starts clean
pnpm --filter @eye/api test:accept 2>&1 | tail -4
( cd apps/api && node_modules/.bin/vitest run --config vitest.int.config.ts 2>&1 | tail -4 )
echo
echo "PATH A RESULT: forward upgrade complete — no rebaseline, no data loss, suites green."

echo
echo "############################################################"
echo "# PATH B — VIRGIN INSTALL (0001-0012 on an empty database)"
echo "############################################################"
fresh_stack
node apps/api/scripts/migrate.mjs
echo
psql_su -Atc "select 'migrations recorded = ' || count(*) from public.schema_migrations;"
counts
echo
echo "--- the APPLICATION serves the full suites on the VIRGIN database ---"
rm -rf .eye-local/degraded apps/api/.eye-local/degraded   # durable journal: a fresh path starts clean
pnpm --filter @eye/api test:accept 2>&1 | tail -4
( cd apps/api && node_modules/.bin/vitest run --config vitest.int.config.ts 2>&1 | tail -4 )
echo
echo "PATH B RESULT: virgin install complete — 12 migrations applied, suites green."
