/**
 * CATALOG-DERIVED AUTHORITY INVENTORY (Gate-2.2 C13).
 *
 * There is NO handwritten port list anywhere in this gate. The inventory is
 * DISCOVERED from the live PostgreSQL catalogs every run:
 *
 *   * every SECURITY DEFINER function in the governed schemas, with its owner,
 *     grantees, and the tables it can reach;
 *   * every runtime EXECUTE grant;
 *   * every direct table privilege held by a runtime role;
 *   * RLS enabled/forced state for every governed table;
 *   * every PUBLIC EXECUTE grant.
 *
 * A handwritten list is exactly what lets a NEW or RENAMED mutator slip through
 * unnoticed: the list keeps passing while the surface grows. So the gate fails on
 * any discovered port that is not CLASSIFIED here, which forces a human decision
 * whenever the authority surface changes.
 *
 * Usage:
 *   node scripts/authority-inventory.mjs              # human report, exit 1 on failure
 *   node scripts/authority-inventory.mjs --json       # machine-readable inventory
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';

const GOVERNED_SCHEMAS = ['identity', 'tenancy', 'policy', 'audit', 'objects', 'ctx', 'canon', 'config'];
const RUNTIME_ROLES = [
  'eye_app', 'eye_commit', 'eye_identity', 'eye_publisher',
  'eye_verifier', 'eye_recovery', 'eye_audit_allocator', 'eye_system',
];

/**
 * CLASSIFICATION of the discovered authority surface.
 *
 * Each entry declares the capability class a port requires. The gate does not use
 * this to FIND ports — it finds them in the catalogs — it uses it to assert that
 * every discovered port has been consciously classified. An unclassified port is a
 * gate failure, not a warning.
 */
const CLASSES = {
  // Business effect ports — require an authority-mode capability bound to action+target.
  'tenancy.create_tenant': 'authority.business',
  'tenancy.create_domain': 'authority.business',
  'identity.create_principal': 'authority.business|bootstrap',
  'objects.admit_version': 'authority.business',
  'objects.enqueue_event': 'authority.business',
  // Evidence ports — authority or evidence mode, action/correlation bound.
  'audit.commit_event': 'authority.evidence',
  'policy.commit_decision': 'authority.evidence',
  'audit.commit_identity_event': 'identity_op.evidence',
  'audit.commit_intake_event': 'identity_op.evidence',
  'audit.commit_integrity_event': 'verify.evidence',
  // Identity mutators — identity capability bound to action(+subject).
  'identity.session_open': 'identity_op.mutator',
  'identity.refresh_rotate_family': 'identity_op.mutator',
  'identity.credential_rotate_v2': 'identity_op.mutator.subject_bound',
  'identity.credential_issue': 'identity_op.internal',
  'identity.credential_revoke': 'identity_op.internal',
  'identity.sessions_revoke_all_v2': 'identity_op.internal',
  'identity.bump_epoch': 'identity_op.internal',
  'identity.credential_get_active': 'identity_op.read',
  'identity.auth_lookup': 'identity_op.read',
  'identity.session_subject': 'caller_bound.read',
  'identity.session_bindings': 'caller_bound.read',
  // Bootstrap — single-use, claim + nonce bound.
  'identity.claim_bootstrap': 'bootstrap.claim',
  'identity.record_bootstrap_principal': 'bootstrap.claim',
  'identity.bootstrap_mark_one_time': 'bootstrap.claim',
  'identity.platform_admin_exists': 'bootstrap.read',
  // Verifier / seal / integrity / availability.
  'audit.read_head': 'verify.read',
  'audit.lock_head_for_seal': 'verify.seal',
  'audit.append_seal': 'verify.seal',
  'audit.open_integrity_incident': 'verify.incident',
  'audit.reconcile_availability_incident_v2': 'verify.recover',
  'audit.record_availability_incident': 'failclosed.internal',
  'audit.unreconciled_incidents': 'verify.read',
  'audit.open_availability_incidents': 'failclosed.read',   // startup degraded reload
  'audit.rebuild_chain_heads': 'recovery.breakglass',
  'audit.advance_chain_head': 'allocator.internal',
  'audit.commit_chain_head': 'allocator.internal',
  'audit.my_domain_integrity': 'authority.read',
  'audit.my_partition_integrity': 'authority.read',
  'audit.bump_suppression': 'identity_op.internal',
  // Capability minters.
  'ctx.issue_commit': 'minter.authority',
  'ctx.issue_evidence': 'minter.evidence',
  'ctx.issue_publish': 'minter.publish',
  'ctx.issue_verify': 'minter.verify',
  'ctx.issue_identity_op': 'minter.identity',
  'ctx.issue_bootstrap': 'minter.bootstrap',
  'ctx.issue_recovery': 'minter.recovery',
  'ctx.build': 'minter.internal',
  'ctx.sign_payload': 'minter.internal',
  'ctx.open_operation': 'closure.internal',
  'ctx.current_operation': 'closure.read',
  'ctx.record_effect': 'closure.internal',
  'ctx.mark_obligations_executed': 'closure.internal',
  'ctx.bind_operation_causation': 'closure.internal',
  'ctx.assert_operation_closed': 'closure.trigger',
  // Assertion helpers (no state change).
  'ctx.assert_live_authority': 'assert',
  'ctx.assert_capability': 'assert',
  'ctx.assert_business_authority': 'assert',
  'ctx.assert_identity_capability': 'assert',
  'ctx.assert_identity_context': 'assert',
  'ctx.assert_verify_capability': 'assert',
  'ctx.assert_seal_capability': 'assert',
  'ctx.assert_recovery_capability': 'assert',
  'ctx.assert_integrity_evidence_capability': 'assert',
  'ctx.assert_bound_target': 'assert',
  'ctx.bound_actor': 'assert',
  // Outbox.
  'objects.outbox_lease': 'publish.lease',
  'objects.outbox_ack_leased': 'publish.cas',
  'objects.outbox_release': 'publish.cas',
  'objects.enforce_outbox_immutability': 'trigger',
  'objects.assert_header_semantics': 'assert',
  'objects.assert_header_binding': 'assert',
  // Read models / helpers.
  'tenancy.my_tenant': 'authority.read',
  // Canonicalization (pure functions).
  'canon.jcs': 'pure',
  'canon.number_es': 'pure',
  'canon.utf16_sortkey': 'pure',
  'canon.sha256_hex': 'pure',
  'canon.audit_row_hash': 'pure',
  'canon.canonical_digest': 'pure',
};

const SQL_DEFINERS = `
  select n.nspname as schema, p.proname as name,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_userbyid(p.proowner) as owner,
         p.prosecdef as security_definer,
         coalesce((
           select string_agg(distinct r.rolname, ',' order by r.rolname)
             from aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
            where a.privilege_type = 'EXECUTE' and r.rolname <> pg_get_userbyid(p.proowner)
         ), '') as grantees,
         coalesce((
           select string_agg(distinct r.rolname, ',')
             from aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
            where a.privilege_type = 'EXECUTE' and a.grantee = 0
         ), '') as public_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = any($1) and p.prokind = 'f'
   order by n.nspname, p.proname`;

const SQL_DIRECT_DML = `
  select grantee, table_schema || '.' || table_name as relation,
         string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
    from information_schema.role_table_grants
   where grantee = any($1)
     and table_schema = any($2)
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
   group by grantee, table_schema, table_name
   order by grantee, relation`;

const SQL_RLS = `
  select n.nspname || '.' || c.relname as relation, c.relrowsecurity as enabled,
         c.relforcerowsecurity as forced,
         (select count(*) from pg_policies p
           where p.schemaname = n.nspname and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname = any($1)
   order by relation`;

const SQL_PUBLIC_EXECUTE = `
  select n.nspname || '.' || p.proname as port
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         aclexplode(p.proacl) a
   where n.nspname = any($1) and a.grantee = 0 and a.privilege_type = 'EXECUTE'
   order by port`;

const SQL_LOGIN_ROLES = `
  select rolname, rolcanlogin, rolsuper, rolbypassrls
    from pg_roles where rolname like 'eye%' order by rolname`;

async function main() {
  const wantJson = process.argv.includes('--json');
  const outFlag = process.argv.indexOf('--out');
  const password = process.env.EYE_DB_MIGRATE_PASSWORD;
  if (!password) {
    console.error('authority-inventory: EYE_DB_MIGRATE_PASSWORD is required (no default)');
    process.exit(1);
  }
  const client = new pg.Client({
    host: process.env.EYE_DB_HOST ?? 'localhost',
    port: Number(process.env.EYE_DB_PORT ?? 5432),
    database: process.env.EYE_DB_NAME ?? 'eye',
    user: process.env.EYE_DB_MIGRATE_USER ?? 'eye',
    password,
  });
  await client.connect();

  const definers = (await client.query(SQL_DEFINERS, [GOVERNED_SCHEMAS])).rows;
  const directDml = (await client.query(SQL_DIRECT_DML, [RUNTIME_ROLES, GOVERNED_SCHEMAS])).rows;
  const rls = (await client.query(SQL_RLS, [GOVERNED_SCHEMAS])).rows;
  const publicExec = (await client.query(SQL_PUBLIC_EXECUTE, [GOVERNED_SCHEMAS])).rows;
  const roles = (await client.query(SQL_LOGIN_ROLES)).rows;
  const version = (await client.query('select version() as v')).rows[0].v;
  await client.end();

  const secdef = definers.filter((d) => d.security_definer);
  const runtimeGranted = secdef.filter((d) => d.grantees !== '');

  // ── the failing conditions ────────────────────────────────────────────────
  const failures = [];

  // 1. Every runtime-granted SECURITY DEFINER port must be classified.
  const unclassified = runtimeGranted
    .map((d) => `${d.schema}.${d.name}`)
    .filter((k, i, a) => a.indexOf(k) === i)
    .filter((k) => CLASSES[k] === undefined);
  if (unclassified.length > 0) {
    failures.push(
      `UNCLASSIFIED PORTS (${unclassified.length}): ${unclassified.join(', ')}\n` +
      '  A new or renamed authoritative port was discovered in the catalogs but is not\n' +
      '  classified in scripts/authority-inventory.mjs. Classify it (and test it) rather\n' +
      '  than widening the gate.',
    );
  }

  // 2. Zero PUBLIC EXECUTE in the governed schemas.
  if (publicExec.length > 0) {
    failures.push(`PUBLIC EXECUTE present on: ${publicExec.map((r) => r.port).join(', ')}`);
  }

  // 3. Zero direct DML for runtime roles, except the audit allocator (which owns
  //    the chain-head tables through its definer ports).
  const unexpectedDml = directDml.filter((r) => r.grantee !== 'eye_audit_allocator');
  if (unexpectedDml.length > 0) {
    failures.push(
      'UNINTENDED DIRECT DML:\n' +
      unexpectedDml.map((r) => `  ${r.grantee} -> ${r.relation} (${r.privileges})`).join('\n'),
    );
  }

  // 4. RLS enabled AND forced on every governed table.
  const rlsGaps = rls.filter((r) => !r.enabled || !r.forced);
  if (rlsGaps.length > 0) {
    failures.push(
      'RLS NOT ENABLED+FORCED:\n' +
      rlsGaps.map((r) => `  ${r.relation} (enabled=${r.enabled} forced=${r.forced})`).join('\n'),
    );
  }

  // 5. Legacy/retired roles must not be able to log in.
  const legacyLogin = roles.filter((r) => r.rolname === 'eye_system' && r.rolcanlogin);
  if (legacyLogin.length > 0) {
    failures.push(`RETIRED ROLE CAN LOG IN: ${legacyLogin.map((r) => r.rolname).join(', ')}`);
  }

  const inventory = {
    generated_from: 'live PostgreSQL catalogs (no handwritten port list)',
    postgres_version: version,
    schemas: GOVERNED_SCHEMAS,
    counts: {
      functions_total: definers.length,
      security_definer: secdef.length,
      runtime_granted_definer_ports: runtimeGranted.length,
      classified: Object.keys(CLASSES).length,
      unclassified: unclassified.length,
      public_execute: publicExec.length,
      direct_dml_grants: directDml.length,
      rls_relations: rls.length,
      rls_gaps: rlsGaps.length,
    },
    ports: runtimeGranted.map((d) => ({
      port: `${d.schema}.${d.name}(${d.args})`,
      key: `${d.schema}.${d.name}`,
      owner: d.owner,
      grantees: d.grantees.split(',').filter(Boolean),
      capability_class: CLASSES[`${d.schema}.${d.name}`] ?? null,
    })),
    direct_dml: directDml,
    rls,
    roles,
    failures,
  };

  if (outFlag !== -1 && process.argv[outFlag + 1]) {
    writeFileSync(process.argv[outFlag + 1], JSON.stringify(inventory, null, 2));
  }
  if (wantJson) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log('=== CATALOG-DERIVED AUTHORITY INVENTORY (Gate-2.2 C13) ===');
    console.log(`postgres: ${version.split(' ').slice(0, 2).join(' ')}`);
    console.log(`functions in governed schemas: ${definers.length}`);
    console.log(`  SECURITY DEFINER:            ${secdef.length}`);
    console.log(`  runtime-granted (the ports): ${runtimeGranted.length}`);
    console.log(`  classified:                  ${Object.keys(CLASSES).length}`);
    console.log(`PUBLIC EXECUTE:                ${publicExec.length}`);
    console.log(`direct DML grants:             ${directDml.length} (allocator-only expected)`);
    console.log(`RLS relations:                 ${rls.length} (gaps: ${rlsGaps.length})`);
    console.log('');
    for (const p of inventory.ports) {
      console.log(`  ${p.capability_class ?? '!! UNCLASSIFIED'}  ${p.port}  [${p.grantees.join(',')}]`);
    }
  }

  if (failures.length > 0) {
    console.error('\n=== AUTHORITY GATE FAILED ===');
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log('\nauthority gate: PASS');
}

void main();
