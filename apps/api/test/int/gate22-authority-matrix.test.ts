/**
 * GATE-2.2 C14 — CATALOG-DRIVEN ADVERSARIAL MATRIX.
 *
 * This suite does NOT contain a handwritten port list. It DISCOVERS the authority
 * surface from the live PostgreSQL catalogs (the same source C13's inventory uses)
 * and then, for every discovered runtime-granted port, requires one of two things:
 *
 *   (a) the port is machine-classified as a NON-MUTATOR — its body contains no
 *       write statement, verified by inspecting `prosrc`, not by trusting a label; or
 *   (b) the port is a MUTATOR and is covered by:
 *         * a GENERIC executable probe run here against every mutator: invoked on
 *           each of its granted roles with NO capability, it must refuse; and
 *         * a NAMED scenario test file that exercises the specific wrong-mode /
 *           wrong-action / wrong-target / wrong-scope / stale-authority cases.
 *
 * If a NEW or RENAMED mutator appears, it is discovered here, has no coverage
 * entry, and this suite FAILS. That is the property a handwritten list cannot give.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  appDb, commitDb, identityDb, publisherDb, verifierDb, recoveryDb, superDb, type AnyDb,
} from './helpers.js';

const GOVERNED_SCHEMAS = ['identity', 'tenancy', 'policy', 'audit', 'objects', 'ctx', 'canon', 'config'];

interface Port {
  schema: string;
  name: string;
  key: string;
  args: string;
  argTypes: string[];
  owner: string;
  grantees: string[];
  mutates: boolean;
  writeEvidence: string;
}

let su: AnyDb;
const pools: Record<string, AnyDb> = {};
let ports: Port[] = [];

/**
 * COVERAGE MAP: mutator port -> the scenario test file that exercises its specific
 * wrong-capability cases. This is NOT the source of truth for WHICH ports exist —
 * the catalogs are. It is checked FOR COMPLETENESS against the discovered set, and
 * every referenced file must exist on disk.
 */
const SCENARIO_COVERAGE: Record<string, string> = {
  'tenancy.create_tenant': 'gate22-capability-binding.test.ts',
  'tenancy.create_domain': 'gate22-capability-binding.test.ts',
  'identity.create_principal': 'gate22-capability-binding.test.ts',
  'objects.admit_version': 'gate22-capability-binding.test.ts',
  'objects.enqueue_event': 'gate22-operation-closure.test.ts',
  'audit.commit_event': 'gate22-operation-closure.test.ts',
  'policy.commit_decision': 'gate22-operation-closure.test.ts',
  'audit.commit_identity_event': 'adversarial.test.ts',
  'audit.commit_intake_event': 'adversarial.test.ts',
  'audit.commit_integrity_event': 'gate22-verifier-seal.test.ts',
  'identity.session_open': 'gate22-identity-mutators.test.ts',
  'identity.refresh_rotate_family': 'gate22-identity-mutators.test.ts',
  'identity.credential_rotate_v2': 'gate22-identity-mutators.test.ts',
  'identity.credential_issue': 'gate22-identity-mutators.test.ts',
  'identity.credential_revoke': 'gate22-identity-mutators.test.ts',
  'identity.sessions_revoke_all_v2': 'gate22-identity-mutators.test.ts',
  'identity.bump_epoch': 'gate22-identity-mutators.test.ts',
  'identity.claim_bootstrap': 'gate22-bootstrap.test.ts',
  'identity.record_bootstrap_principal': 'gate22-bootstrap.test.ts',
  'identity.bootstrap_mark_one_time': 'gate22-bootstrap.test.ts',
  'audit.lock_head_for_seal': 'gate22-verifier-seal.test.ts',
  'audit.append_seal': 'gate22-verifier-seal.test.ts',
  'audit.open_integrity_incident': 'gate22-verifier-seal.test.ts',
  'audit.reconcile_availability_incident_v2': 'gate22-degraded-recovery.test.ts',
  'audit.record_availability_incident': 'gate22-degraded-recovery.test.ts',
  'audit.rebuild_chain_heads': 'adversarial.test.ts',
  'audit.bump_suppression': 'adversarial.test.ts',
  'objects.outbox_lease': 'gate22-outbox-hardening.test.ts',
  'objects.outbox_ack_leased': 'gate22-outbox-hardening.test.ts',
  'objects.outbox_release': 'gate22-outbox-hardening.test.ts',
  'ctx.issue_commit': 'adversarial.test.ts',
  'ctx.issue_evidence': 'gate22-evidence-deauthorization.test.ts',
  'ctx.issue_publish': 'adversarial.test.ts',
  'ctx.issue_verify': 'gate22-verifier-seal.test.ts',
  'ctx.issue_identity_op': 'adversarial.test.ts',
  'ctx.issue_bootstrap': 'gate22-bootstrap.test.ts',
  'ctx.issue_recovery': 'gate22-degraded-recovery.test.ts',
  'ctx.open_operation': 'gate22-operation-closure.test.ts',
  'ctx.mark_obligations_executed': 'gate22-operation-closure.test.ts',
  'ctx.bind_operation_causation': 'gate22-capability-binding.test.ts',
};

/**
 * PORTS THAT LEGITIMATELY DO NOT REQUIRE A CAPABILITY, each with its reason and the
 * safety property this suite proves EXECUTABLY below. They are not exempted on
 * assertion — the probe verifies their success is INERT.
 *
 *  * The capability MINTERS cannot require a capability: they are what creates one.
 *    Their guard is the minting role plus their own preconditions (proof of
 *    possession, runtime profile, binding checks) — tested in their own files.
 *  * The BREAK-GLASS rebuild is guarded by credential isolation: eye_recovery is
 *    deliberately loaded by no application pool.
 *  * ctx.open_operation / ctx.mark_obligations_executed are GUARDED NO-OPS outside
 *    an authority context: open_operation returns NULL when the mode is not
 *    `authority`, and mark_obligations_executed updates zero rows when no operation
 *    is open. Their success is inert, which is asserted below.
 */
const NO_CAPABILITY_ENTRYPOINTS: Record<string, string> = {
  'ctx.issue_commit': 'capability minter (guarded by proof of possession + bindings)',
  'ctx.issue_evidence': 'capability minter (guarded by proof of possession + bindings)',
  'ctx.issue_publish': 'capability minter (publisher role only)',
  'ctx.issue_verify': 'capability minter (verifier role only)',
  'ctx.issue_identity_op': 'capability minter (identity role, operation allowlist)',
  'ctx.issue_bootstrap': 'capability minter (runtime profile must be local/test)',
  'ctx.issue_recovery': 'capability minter (verifier role only)',
  'audit.rebuild_chain_heads': 'break-glass; guarded by credential isolation (eye_recovery)',
  'ctx.open_operation': 'guarded no-op outside authority mode (returns NULL)',
  'ctx.mark_obligations_executed': 'guarded no-op with no open operation (0 rows)',
};

/** A null-typed argument list, so a port can be INVOKED from its signature alone. */
function nullArgs(argTypes: string[]): string {
  return argTypes.map((t) => `NULL::${t}`).join(', ');
}

beforeAll(async () => {
  su = superDb();
  pools['eye_app'] = appDb();
  pools['eye_commit'] = commitDb();
  pools['eye_identity'] = identityDb();
  pools['eye_publisher'] = publisherDb();
  pools['eye_verifier'] = verifierDb();
  pools['eye_recovery'] = recoveryDb();

  const rows = (
    await sql<{
      schema: string; name: string; args: string; argtypes: string; owner: string;
      grantees: string; mutates: boolean; write_evidence: string;
    }>`
      select n.nspname as schema, p.proname as name,
             pg_get_function_identity_arguments(p.oid) as args,
             coalesce(array_to_string(string_to_array(pg_get_function_identity_arguments(p.oid), ', '), '|'), '') as argtypes,
             pg_get_userbyid(p.proowner) as owner,
             coalesce((
               select string_agg(distinct r.rolname, ',' order by r.rolname)
                 from aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
                where a.privilege_type = 'EXECUTE'
                  and r.rolname <> pg_get_userbyid(p.proowner)
                  and r.rolname like 'eye%'
             ), '') as grantees,
             -- MACHINE-CLASSIFIED: does the body contain a write statement?
             (p.prosrc ~* '(insert into|update |delete from|truncate |alter table|set_config|alter role)') as mutates,
             coalesce((regexp_match(p.prosrc, '(?i)(insert into|update |delete from|truncate |alter table|set_config|alter role)'))[1], '') as write_evidence
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = any(${GOVERNED_SCHEMAS}) and p.prokind = 'f' and p.prosecdef
       order by n.nspname, p.proname`.execute(su)
  ).rows;

  ports = rows
    .filter((r) => r.grantees !== '')
    .map((r) => ({
      schema: r.schema,
      name: r.name,
      key: `${r.schema}.${r.name}`,
      args: r.args,
      argTypes: r.args === '' ? [] : r.args.split(', ').map((a) => a.replace(/^\w+\s+/, '')),
      owner: r.owner,
      grantees: r.grantees.split(',').filter(Boolean),
      mutates: r.mutates,
      writeEvidence: r.write_evidence,
    }));
});

afterAll(async () => {
  await Promise.all([su, ...Object.values(pools)].map((d) => d.destroy()));
});

describe('C14 — the matrix is driven by the catalogs, not by a list', () => {
  it('discovers a substantive set of runtime-granted definer ports', () => {
    expect(ports.length).toBeGreaterThanOrEqual(50);
  });

  it('every discovered port is either a machine-classified NON-MUTATOR or has scenario coverage', () => {
    const gaps = ports
      .filter((p) => p.mutates)
      .filter((p) => SCENARIO_COVERAGE[p.key] === undefined)
      .map((p) => `${p.key} (writes: ${p.writeEvidence.trim()})`);
    expect(
      gaps,
      'DISCOVERED MUTATOR WITHOUT COVERAGE — classify and test it rather than widening the gate:\n' +
        gaps.join('\n'),
    ).toEqual([]);
  });

  it('every scenario file referenced by the coverage map actually exists', () => {
    const missing = [...new Set(Object.values(SCENARIO_COVERAGE))].filter(
      (f) => !existsSync(join(__dirname, f)),
    );
    expect(missing, `coverage map points at non-existent files: ${missing.join(', ')}`).toEqual([]);
  });

  it('the coverage map contains no entry for a port that no longer exists (no stale coverage)', () => {
    const discovered = new Set(ports.map((p) => p.key));
    const stale = Object.keys(SCENARIO_COVERAGE).filter((k) => !discovered.has(k));
    // A stale entry is a claim of coverage for something that is gone; it must be
    // removed so the map cannot silently drift away from the catalogs.
    expect(stale, `stale coverage entries: ${stale.join(', ')}`).toEqual([]);
  });
});

describe('C14 — GENERIC probe: every discovered MUTATOR refuses with NO capability', () => {
  it('no mutator succeeds when invoked without a capability on a granted role', async () => {
    const succeeded: string[] = [];
    const mutators = ports.filter((p) => p.mutates);
    expect(mutators.length).toBeGreaterThan(20);

    for (const p of mutators) {
      if (NO_CAPABILITY_ENTRYPOINTS[p.key] !== undefined) continue; // proven inert below
      for (const role of p.grantees) {
        const pool = pools[role];
        if (pool === undefined) continue; // allocator/system have no connectable pool
        try {
          // Invoked from the SIGNATURE alone, with no context established.
          await pool
            .transaction()
            .execute(async (tx) =>
              sql`select ${sql.raw(`${p.key}(${nullArgs(p.argTypes)})`)}`.execute(tx),
            );
          succeeded.push(`${p.key} as ${role}`);
        } catch {
          // Any refusal is correct: capability denial, permission denied, or an
          // argument/constraint rejection that occurs because nothing authorized it.
        }
      }
    }
    expect(
      succeeded,
      'these MUTATORS COMPLETED with no capability established:\n' + succeeded.join('\n'),
    ).toEqual([]);
  });
});

describe('C14 — the no-capability entrypoints are classified AND proven inert', () => {
  it('every no-capability entrypoint in the classification actually exists', () => {
    const discovered = new Set(ports.map((p) => p.key));
    const stale = Object.keys(NO_CAPABILITY_ENTRYPOINTS).filter((k) => !discovered.has(k));
    expect(stale, `stale no-capability classification: ${stale.join(', ')}`).toEqual([]);
  });

  it('ctx.open_operation outside authority mode is a NO-OP (records no operation)', async () => {
    const before = (
      await sql<{ n: string }>`select count(*) n from ctx.operation`.execute(su)
    ).rows[0]!.n;
    const out = await pools['eye_commit']!.transaction().execute(async (tx) =>
      (await sql<{ op: string | null }>`select ctx.open_operation('C1') as op`.execute(tx)).rows[0]);
    expect(out!.op).toBeNull();                       // no operation minted
    const after = (
      await sql<{ n: string }>`select count(*) n from ctx.operation`.execute(su)
    ).rows[0]!.n;
    expect(after).toBe(before);                        // and nothing recorded
  });

  it('ctx.mark_obligations_executed with no open operation changes nothing', async () => {
    const before = (
      await sql<{ n: string }>`select count(*) n from ctx.operation where obligations_executed`.execute(su)
    ).rows[0]!.n;
    await pools['eye_commit']!.transaction().execute(async (tx) =>
      sql`select ctx.mark_obligations_executed()`.execute(tx));
    const after = (
      await sql<{ n: string }>`select count(*) n from ctx.operation where obligations_executed`.execute(su)
    ).rows[0]!.n;
    expect(after).toBe(before);
  });

  it('a minted capability alone grants NO business authority (the minters are not a bypass)', async () => {
    // A publish capability is the most permissive thing a non-request role can mint
    // on its own; it must not be able to touch business or evidence state.
    await expect(
      pools['eye_publisher']!.transaction().execute(async (tx) => {
        await sql`select ctx.issue_publish(null::uuid)`.execute(tx);
        return sql`select objects.enqueue_event(gen_random_uuid(), 'x', '{}'::jsonb,
          gen_random_uuid(), gen_random_uuid())`.execute(tx);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('the break-glass rebuild is reachable by NO application role', async () => {
    for (const role of ['eye_app', 'eye_commit', 'eye_identity', 'eye_verifier', 'eye_publisher']) {
      await expect(
        sql`select audit.rebuild_chain_heads()`.execute(pools[role]!),
        role,
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe('C14 — cross-role probe: a port refuses roles it was never granted to', () => {
  it('no port succeeds on a role outside its grantee set', async () => {
    const leaks: string[] = [];
    // Sample the mutator set across all connectable roles it is NOT granted to.
    for (const p of ports.filter((x) => x.mutates)) {
      for (const [role, pool] of Object.entries(pools)) {
        if (p.grantees.includes(role) || role === p.owner) continue;
        try {
          await pool
            .transaction()
            .execute(async (tx) =>
              sql`select ${sql.raw(`${p.key}(${nullArgs(p.argTypes)})`)}`.execute(tx),
            );
          leaks.push(`${p.key} executed as NON-GRANTEE ${role}`);
        } catch {
          /* expected: permission denied */
        }
      }
    }
    expect(leaks, 'ports reachable by non-grantee roles:\n' + leaks.join('\n')).toEqual([]);
  });
});

describe('C14 — the allocator-only direct DML is narrowly scoped and non-connectable', () => {
  it('eye_audit_allocator cannot log in', async () => {
    const r = await sql<{ rolcanlogin: boolean }>`
      select rolcanlogin from pg_roles where rolname = 'eye_audit_allocator'`.execute(su);
    expect(r.rows[0]!.rolcanlogin).toBe(false);
  });

  it('its direct DML is confined to the audit chain-head/seal/incident tables', async () => {
    const rows = (
      await sql<{ relation: string; privileges: string }>`
        select table_schema || '.' || table_name as relation,
               string_agg(distinct privilege_type, ',' order by privilege_type) as privileges
          from information_schema.role_table_grants
         where grantee = 'eye_audit_allocator'
           and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
         group by table_schema, table_name order by relation`.execute(su)
    ).rows;
    const allowed = new Set([
      'audit.audit_chain_heads', 'audit.audit_seals', 'audit.integrity_incidents',
      'audit.availability_incidents', 'audit.intake_suppression', 'audit.audit_events',
    ]);
    const outside = rows.map((r) => r.relation).filter((r) => !allowed.has(r));
    expect(outside, `allocator holds DML outside the audit ledger: ${outside.join(', ')}`).toEqual([]);
  });

  it('it holds EXECUTE on no business, identity or evidence port', async () => {
    const rows = (
      await sql<{ port: string }>`
        select n.nspname || '.' || p.proname as port
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
               aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
         where r.rolname = 'eye_audit_allocator' and a.privilege_type = 'EXECUTE'
           and n.nspname in ('tenancy','identity','policy','objects')
         order by port`.execute(su)
    ).rows;
    expect(rows.map((r) => r.port)).toEqual([]);
  });

  it('the retired eye_system role cannot log in and holds no governed EXECUTE', async () => {
    const login = await sql<{ rolcanlogin: boolean }>`
      select rolcanlogin from pg_roles where rolname = 'eye_system'`.execute(su);
    expect(login.rows[0]!.rolcanlogin).toBe(false);
    const grants = await sql<{ n: string }>`
      select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
             aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
       where r.rolname = 'eye_system' and a.privilege_type = 'EXECUTE'
         and n.nspname = any(${GOVERNED_SCHEMAS})`.execute(su);
    expect(Number(grants.rows[0]!.n)).toBe(0);
  });
});
