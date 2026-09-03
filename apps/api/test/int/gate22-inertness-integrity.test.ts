/**
 * GATE-2.2 C14 (final strengthening) — FULL STATE-INTEGRITY INERTNESS PROOF.
 *
 * The earlier inertness proof compared ROW COUNTS. That is too weak: an in-place
 * UPDATE, a delete-and-reinsert, a sequence advance and a write to a brand-new
 * relation are all invisible to a count. This replaces it with a deterministic
 * STATE DIGEST covering, for every relation in the governed schemas (discovered
 * dynamically, so a NEW relation is included automatically):
 *
 *   * column identity — ordered name:type list;
 *   * the ordered PRIMARY KEY definition;
 *   * a LOGICAL digest of every row value;
 *   * a PHYSICAL digest including each row's xmin, so a delete+reinsert of the SAME
 *     values is still detected (the logical digest alone cannot see it);
 *   * the row count, reported separately;
 *
 * plus, outside the relations: every sequence / identity generator's last_value,
 * the migration registry, and a catalog-object digest (functions, policies, RLS
 * flags, role attributes) so a persistent configuration or catalog change is caught.
 *
 * NEGATIVE CONTROLS prove the gate is not vacuous: four fixtures each mutate state
 * in a way ROW COUNT CANNOT SEE, the gate is required to detect each one, and every
 * fixture is rolled back so the database is left exactly as found.
 *
 * THIS SUITE REQUIRES AN OTHERWISE-IDLE DATABASE. It compares the whole governed
 * state before and after, so anything else writing concurrently — a locally running
 * API, whose outbox publisher issues a capability on every poll tick — is reported
 * as a mutation. That is the gate working, not a flake; stop the local API first.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import {
  appDb, commitDb, identityDb, publisherDb, verifierDb, superDb, type AnyDb,
} from './helpers.js';

const GOVERNED_SCHEMAS = ['identity', 'tenancy', 'policy', 'audit', 'objects', 'ctx', 'canon', 'config'];

/** The 8 guards whose inertness static analysis cannot establish. */
const GUARDS = [
  'ctx.assert_bound_target', 'ctx.assert_identity_capability', 'ctx.assert_identity_context',
  'ctx.assert_integrity_evidence_capability', 'ctx.assert_recovery_capability',
  'ctx.assert_seal_capability', 'ctx.assert_verify_capability', 'objects.assert_header_binding',
];

interface StateDigest {
  relations: Record<string, { columns: string; pk: string; rows: string; logical: string; physical: string }>;
  sequences: Record<string, string>;
  migrations: string;
  catalog: string;
}

let su: AnyDb;
const pools: Record<string, AnyDb> = {};
let guardArgs: Record<string, string[]> = {};

/**
 * A deterministic digest of governed state. Uses query_to_xml so each relation is
 * digested by a dynamically-built query — relations are DISCOVERED, never listed.
 * Executed on a caller-supplied connection so a negative control can observe its own
 * uncommitted mutation and then roll it back.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stateDigest(conn: any): Promise<StateDigest> {
  const relRows = await sql<{
      relation: string; columns: string; pk: string; rows: string; logical: string; physical: string;
    }>`
      select n.nspname || '.' || c.relname as relation,
             coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
                         from pg_attribute a
                        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '') as columns,
             coalesce((select string_agg(a2.attname, ',' order by k.ord)
                         from pg_index i
                         cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
                         join pg_attribute a2 on a2.attrelid = c.oid and a2.attnum = k.attnum
                        where i.indrelid = c.oid and i.indisprimary), '') as pk,
             (xpath('/row/v/text()', query_to_xml(
                format('select count(*) as v from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text as rows,
             (xpath('/row/v/text()', query_to_xml(
                format('select coalesce(md5(string_agg(x.r, ''|'' order by x.r)), ''empty'') as v
                          from (select (t.*)::text as r from %I.%I t) x', n.nspname, c.relname),
                false, true, '')))[1]::text as logical,
             (xpath('/row/v/text()', query_to_xml(
                format('select coalesce(md5(string_agg(x.r, ''|'' order by x.r)), ''empty'') as v
                          from (select (t.xmin::text || ''#'' || (t.*)::text) as r from %I.%I t) x',
                       n.nspname, c.relname),
                false, true, '')))[1]::text as physical
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname = any(${GOVERNED_SCHEMAS})
       order by relation`.execute(conn);

  const seqRows = await sql<{ seq: string; last_value: string }>`
      select schemaname || '.' || sequencename as seq,
             coalesce(last_value::text, 'unset') as last_value
        from pg_sequences order by seq`.execute(conn);

  const migRows = await sql<{ d: string }>`
      select coalesce(md5(string_agg(filename || ':' || digest, '|' order by filename)), 'none') as d
        from public.schema_migrations`.execute(conn);

  // Catalog objects: function bodies+grants, policies, RLS flags, role attributes.
  const catRows = await sql<{ d: string }>`
      select md5(
        coalesce((select string_agg(n.nspname || '.' || p.proname || ':' || md5(p.prosrc) || ':' ||
                                    coalesce(array_to_string(p.proacl::text[], ','), ''), '|'
                                    order by n.nspname, p.proname, p.oid)
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = any(${GOVERNED_SCHEMAS})), '')
        || coalesce((select string_agg(schemaname || '.' || tablename || '.' || policyname || ':' ||
                                      coalesce(qual, '') || ':' || coalesce(with_check, ''), '|'
                                      order by schemaname, tablename, policyname)
                       from pg_policies where schemaname = any(${GOVERNED_SCHEMAS})), '')
        || coalesce((select string_agg(n.nspname || '.' || c.relname || ':' || c.relrowsecurity ||
                                       ':' || c.relforcerowsecurity, '|' order by n.nspname, c.relname)
                       from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where c.relkind = 'r' and n.nspname = any(${GOVERNED_SCHEMAS})), '')
        || coalesce((select string_agg(rolname || ':' || rolcanlogin || ':' || rolsuper ||
                                       ':' || rolbypassrls, '|' order by rolname)
                       from pg_roles where rolname like 'eye%'), '')
      ) as d`.execute(conn);

  return {
    relations: Object.fromEntries(
      relRows.rows.map((r) => [r.relation, {
        columns: r.columns, pk: r.pk, rows: r.rows, logical: r.logical, physical: r.physical,
      }]),
    ),
    sequences: Object.fromEntries(seqRows.rows.map((r) => [r.seq, r.last_value])),
    migrations: migRows.rows[0]!.d,
    catalog: catRows.rows[0]!.d,
  };
}

/** Every difference between two digests, as human-readable findings. */
function diff(a: StateDigest, b: StateDigest): string[] {
  const out: string[] = [];
  const rels = new Set([...Object.keys(a.relations), ...Object.keys(b.relations)]);
  for (const rel of [...rels].sort()) {
    const x = a.relations[rel];
    const y = b.relations[rel];
    if (x === undefined) { out.push(`relation APPEARED: ${rel}`); continue; }
    if (y === undefined) { out.push(`relation DISAPPEARED: ${rel}`); continue; }
    if (x.columns !== y.columns) out.push(`${rel}: column identity changed`);
    if (x.pk !== y.pk) out.push(`${rel}: primary key changed`);
    if (x.rows !== y.rows) out.push(`${rel}: row count ${x.rows} -> ${y.rows}`);
    if (x.logical !== y.logical) out.push(`${rel}: LOGICAL row values changed`);
    if (x.physical !== y.physical) out.push(`${rel}: PHYSICAL rows changed (rewrite/reinsert)`);
  }
  const seqs = new Set([...Object.keys(a.sequences), ...Object.keys(b.sequences)]);
  for (const s of [...seqs].sort()) {
    if (a.sequences[s] !== b.sequences[s]) {
      out.push(`sequence ${s}: ${a.sequences[s] ?? 'absent'} -> ${b.sequences[s] ?? 'absent'}`);
    }
  }
  if (a.migrations !== b.migrations) out.push('migration registry changed');
  if (a.catalog !== b.catalog) out.push('catalog objects / roles / policies changed');
  return out;
}

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

  const rows = (
    await sql<{ key: string; args: string; grantees: string }>`
      select n.nspname || '.' || p.proname as key,
             pg_get_function_identity_arguments(p.oid) as args,
             coalesce((select string_agg(distinct r.rolname, ',' order by r.rolname)
                         from aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
                        where a.privilege_type = 'EXECUTE' and r.rolname like 'eye%'), '') as grantees
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = any(${GOVERNED_SCHEMAS}) and p.prokind = 'f'`.execute(su)
  ).rows;
  guardArgs = Object.fromEntries(
    rows.filter((r) => GUARDS.includes(r.key)).map((r) => [
      r.key, r.args === '' ? [] : r.args.split(', ').map((a) => a.replace(/^\w+\s+/, '')),
    ]),
  );
});

afterAll(async () => {
  await Promise.all([su, ...Object.values(pools)].map((d) => d.destroy()));
});

describe('C14 — the state digest is complete and covers what a row count cannot', () => {
  it('covers every governed relation, with columns, PK, counts and both digests', async () => {
    const d = await stateDigest(su);
    const rels = Object.keys(d.relations);
    expect(rels.length).toBeGreaterThanOrEqual(28);
    for (const [rel, v] of Object.entries(d.relations)) {
      expect(v.columns, `${rel} column identity`).not.toBe('');
      expect(v.logical, `${rel} logical digest`).toMatch(/^[0-9a-f]{32}$|^empty$/);
      expect(v.physical, `${rel} physical digest`).toMatch(/^[0-9a-f]{32}$|^empty$/);
      expect(v.rows, `${rel} row count`).toMatch(/^\d+$/);
    }
    expect(Object.keys(d.sequences).length).toBeGreaterThan(0);
    expect(d.migrations).toMatch(/^[0-9a-f]{32}$/);
    expect(d.catalog).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable across two consecutive reads (no spurious drift)', async () => {
    const a = await stateDigest(su);
    const b = await stateDigest(su);
    expect(diff(a, b)).toEqual([]);
  });
});

describe('C14 — NEGATIVE CONTROLS: the gate detects mutations a row count cannot see', () => {
  it('detects an in-place UPDATE that leaves the row count unchanged', async () => {
    const findings = await su.transaction().execute(async (tx) => {
      const before = await stateDigest(tx);
      await sql`update config.runtime_profile set profile = profile where id = 1`.execute(tx);
      const after = await stateDigest(tx);
      const f = diff(before, after);
      await sql`select 1`.execute(tx);
      throw Object.assign(new Error('rollback'), { findings: f });
    }).catch((e: Error & { findings?: string[] }) => e.findings ?? []);

    expect(findings.some((f) => f.includes('config.runtime_profile'))).toBe(true);
    expect(findings.some((f) => f.includes('PHYSICAL'))).toBe(true);
    expect(findings.some((f) => f.includes('row count'))).toBe(false); // count blind to it
  });

  it('detects a DELETE + REINSERT of the same values (identical logical values)', async () => {
    const findings = await su.transaction().execute(async (tx) => {
      const before = await stateDigest(tx);
      await sql`create temporary table _ctl as select * from config.runtime_profile where id = 1`.execute(tx);
      await sql`delete from config.runtime_profile where id = 1`.execute(tx);
      await sql`insert into config.runtime_profile select * from _ctl`.execute(tx);
      const after = await stateDigest(tx);
      const f = diff(before, after);
      throw Object.assign(new Error('rollback'), { findings: f });
    }).catch((e: Error & { findings?: string[] }) => e.findings ?? []);

    // Values are identical, so the LOGICAL digest and the count both match — only the
    // PHYSICAL (xmin) digest can see the rewrite. That is why it exists.
    expect(findings.some((f) => f.includes('config.runtime_profile: PHYSICAL'))).toBe(true);
  });

  it('detects a SEQUENCE advance', async () => {
    const findings = await su.transaction().execute(async (tx) => {
      await sql`create sequence audit._ctl_seq`.execute(tx);
      const before = await stateDigest(tx);
      await sql`select nextval('audit._ctl_seq')`.execute(tx);
      await sql`select nextval('audit._ctl_seq')`.execute(tx);
      const after = await stateDigest(tx);
      const f = diff(before, after);
      throw Object.assign(new Error('rollback'), { findings: f });
    }).catch((e: Error & { findings?: string[] }) => e.findings ?? []);

    expect(findings.some((f) => f.startsWith('sequence audit._ctl_seq'))).toBe(true);
  });

  it('detects a write to an UNEXPECTED relation outside the known set', async () => {
    const findings = await su.transaction().execute(async (tx) => {
      const before = await stateDigest(tx);
      await sql`create table audit._ctl_rogue (id int primary key, v text)`.execute(tx);
      await sql`insert into audit._ctl_rogue values (1, 'smuggled')`.execute(tx);
      const after = await stateDigest(tx);
      const f = diff(before, after);
      throw Object.assign(new Error('rollback'), { findings: f });
    }).catch((e: Error & { findings?: string[] }) => e.findings ?? []);

    expect(findings.some((f) => f === 'relation APPEARED: audit._ctl_rogue')).toBe(true);
    expect(findings.some((f) => f.includes('catalog objects'))).toBe(true);
  });

  it('every negative-control fixture was ROLLED BACK — the database is as found', async () => {
    const rogue = await sql<{ n: string }>`
      select count(*) n from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
       where n2.nspname = 'audit' and c.relname in ('_ctl_rogue', '_ctl_seq')`.execute(su);
    expect(Number(rogue.rows[0]!.n)).toBe(0);
    const profile = await sql<{ n: string }>`select count(*) n from config.runtime_profile`.execute(su);
    expect(Number(profile.rows[0]!.n)).toBe(1);
  });
});

describe('C14 — the 8 statically-uncertain guards are PROVEN INERT against full state', () => {
  it('all 8 guards were discovered in the catalogs', () => {
    expect(Object.keys(guardArgs).sort()).toEqual([...GUARDS].sort());
  });

  it('invoking every guard on every granted role changes NO governed state at all', async () => {
    const before = await stateDigest(su);
    for (const [guard, argTypes] of Object.entries(guardArgs)) {
      for (const pool of Object.values(pools)) {
        try {
          await pool.transaction().execute(async (tx) =>
            sql`select ${sql.raw(`${guard}(${nullArgs(argTypes)})`)}`.execute(tx));
        } catch {
          /* raising is the expected, inert behaviour of a guard */
        }
      }
    }
    const after = await stateDigest(su);
    expect(
      diff(before, after),
      'a guard mutated governed state — it is NOT inert',
    ).toEqual([]);
  });
});
