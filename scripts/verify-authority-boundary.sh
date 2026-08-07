#!/usr/bin/env bash
#
# Authority-boundary catalog (Gate-2.1 §1–§6): the LIVE state of the database,
# queried from the catalog rather than described from source. This is the evidence
# a reviewer can re-run to check the claims about grants, RLS and capabilities.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.eye-local/env; set +a
q() { docker exec -e PGPASSWORD="$EYE_DB_PASSWORD" eye-postgres psql -U eye -d eye -Atc "$1"; }

echo "=== 1. DIRECT DML on any governed table, by any runtime role (must be NONE) ==="
q "
select coalesce(string_agg(distinct g.grantee || ' -> ' || g.table_schema || '.' || g.table_name
                           || ' [' || g.privilege_type || ']', E'\n'), 'NONE')
  from information_schema.role_table_grants g
 where g.grantee in ('eye_app','eye_commit','eye_identity','eye_publisher','eye_verifier','eye_recovery','PUBLIC')
   and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
   and g.table_schema in ('identity','tenancy','policy','audit','objects','config','ctx');"

echo
echo "=== 2. EXECUTE on each authoritative port, per role ==="
q "
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')  ->  '
       || coalesce((select string_agg(r, ',' order by r)
                      from unnest(ARRAY['eye_app','eye_commit','eye_identity','eye_publisher','eye_verifier','eye_recovery']) r
                     where has_function_privilege(r, p.oid, 'EXECUTE')), '(none)')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'ctx' and p.proname like 'issue%'
 order by 1;"
q "
select n.nspname || '.' || p.proname || '  ->  '
       || coalesce((select string_agg(r, ',' order by r)
                      from unnest(ARRAY['eye_app','eye_commit','eye_identity','eye_publisher','eye_verifier','eye_recovery']) r
                     where has_function_privilege(r, p.oid, 'EXECUTE')), '(none)')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname='audit' and p.proname in ('commit_event','commit_identity_event','commit_integrity_event',
        'commit_intake_event','advance_chain_head','commit_chain_head','rebuild_chain_heads',
        'my_domain_integrity','my_partition_integrity'))
    or (n.nspname='objects' and p.proname in ('admit_version','enqueue_event','outbox_lease','outbox_ack_leased'))
    or (n.nspname='identity' and p.proname in ('create_principal','session_open','session_subject','session_bindings',
        'auth_lookup','auth_principal','auth_bindings','session_get_active','bootstrap_mark_one_time'))
    or (n.nspname='policy' and p.proname='commit_decision')
    or (n.nspname='tenancy' and p.proname in ('create_tenant','create_domain','my_tenant'))
 order by 1;"

echo
echo "=== 3. PUBLIC EXECUTE anywhere in the governed schemas (must be NONE) ==="
q "
select coalesce(string_agg(n.nspname || '.' || p.proname, ', '), 'NONE')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('identity','tenancy','policy','audit','objects','ctx','canon')
   and has_function_privilege('public', p.oid, 'EXECUTE');"

echo
echo "=== 4. RLS: enabled AND forced, with policy counts ==="
q "
select n.nspname || '.' || c.relname
       || '  rls=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity
       || ' policies=' || (select count(*) from pg_policies pp
                            where pp.schemaname = n.nspname and pp.tablename = c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind = 'r' and n.nspname in ('identity','tenancy','policy','audit','objects','config','ctx')
 order by 1;"

echo
echo "=== 5. Legacy mechanisms (every count must be 0) ==="
q "
select 'ctx.issue_system / ctx.issue / eye_ctx_field / eye_set_context / eye_set_system_context / outbox_ack / outbox_claim / my_partition_status = '
    || count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname='ctx' and p.proname in ('issue_system','issue'))
    or (n.nspname='public' and p.proname in ('eye_ctx_field','eye_ctx_part','eye_set_context','eye_set_system_context'))
    or (n.nspname='objects' and p.proname in ('outbox_ack','outbox_claim'))
    or (n.nspname='audit' and p.proname='my_partition_status');"

echo
echo "=== 6. Every authoritative port revalidates LIVE authority or capability ==="
# A port that writes governed state must call one of the boundary assertions.
q "
with ports(sig) as (
  select n.nspname || '.' || p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname='audit' and p.proname in ('commit_event','commit_identity_event','commit_integrity_event','commit_intake_event'))
      or (n.nspname='objects' and p.proname in ('admit_version','enqueue_event','outbox_lease','outbox_ack_leased'))
      or (n.nspname='identity' and p.proname in ('create_principal','bootstrap_mark_one_time'))
      or (n.nspname='policy' and p.proname='commit_decision')
      or (n.nspname='tenancy' and p.proname in ('create_tenant','create_domain'))
)
select ports.sig || '  ->  ' ||
       case when src like '%assert_live_authority%' or src like '%assert_capability%'
                 or src like '%assert_business_authority%' or src like '%eye_ctx_mode%'
            then 'REVALIDATES (' ||
                 trim(both ' ' from
                   case when src like '%assert_business_authority%' then 'assert_business_authority ' else '' end ||
                   case when src like '%assert_capability%' then 'assert_capability ' else '' end ||
                   case when src like '%assert_live_authority%' then 'assert_live_authority ' else '' end ||
                   case when src like '%eye_ctx_mode%' then 'mode-check' else '' end) || ')'
            else '*** NO REVALIDATION ***' end
  from ports
  join lateral (select string_agg(pg_get_functiondef(p.oid), ' ') as src
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname || '.' || p.proname = ports.sig) d on true
 order by 1;"

echo
echo "=== 7. Context secret and issuance ledger are unreachable (must be NONE) ==="
q "
select coalesce(string_agg(distinct grantee || ':' || privilege_type, ', '), 'NONE')
  from information_schema.role_table_grants
 where table_schema = 'ctx' and table_name in ('context_secret','issued')
   and grantee <> 'eye';"
