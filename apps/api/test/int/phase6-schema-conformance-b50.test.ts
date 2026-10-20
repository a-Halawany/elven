/**
 * CP-6 B50 §HD (migration 0120 §HD; DP-19-006, ADR-0003 V4) — THE CONSOLIDATED PER-TYPE SCHEMA-CONFORMANCE FIXTURES: every registered
 * object type and schema version (objects.schema_registry) × its header profile, a builder-made header that validates and whose digest the
 * store recomputes identically, the lifecycle vocabulary, cross-type and cross-version references, policy (control) propagation recorded on
 * the side ledger, and correction replay (as-of at every recorded instant returns the version recorded then). The COMPREHENSIVE schema-
 * conformance verification is H1's (F-P3-01's verify stage); the deployment-profile binding is B106's → R1. SYNTHETIC fixtures only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { canonicalHeaderDigest, validateHeader } from '@eye/contracts';
import { HEADER_PROFILES, buildHeader } from '../../src/objects/header-builder.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld } from './phase6-fixtures.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let started: Date;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const LIFECYCLE = ['proposed', 'admitted', 'active', 'disputed', 'corrected', 'withdrawn', 'superseded', 'archived', 'deleted'];

beforeAll(async () => {
  h = await Phase4Harness.boot();
  started = new Date();
  await bootDecisionWorld(h);
}, 600_000);
afterAll(async () => { await h?.close(); });

describe('every registered type and schema version', () => {
  it('has an active header profile, and a builder-made header for it validates and binds the same digest in the store', async () => {
    const schemas = await rows(sql`select object_type, schema_version from objects.schema_registry order by 1, 2`);
    expect(schemas.length).toBeGreaterThanOrEqual(53);
    const profiled = new Set((await rows(sql`select object_type from objects.header_profiles where state = 'active'`)).map((r) => String(r['object_type'])));
    const failures: string[] = [];
    for (const s of schemas) {
      const type = String(s['object_type']); const v = String(s['schema_version']);
      if (!profiled.has(type) || HEADER_PROFILES[type] === undefined) { failures.push(`${type}@${v}: no header profile`); continue; }
      const header = buildHeader({
        objectId: '01900000-0000-7000-8000-00000000c0de', objectType: type, tenantId: T(), domainId: D(), scope: 'DOMAIN', objectVersion: 1, lifecycleState: 'active',
        owningComponent: HEADER_PROFILES[type].issuingAuthority, accountableOwner: 'principal:synthetic', recordedAt: new Date().toISOString(),
        truthState: 'asserted', syntheticState: true, methodRef: 'synthetic-conformance@1', classification: 'internal', purposeScope: 'conformance',
        schemaRef: `${type}@${v}`, auditCorrelationId: '01900000-0000-7000-8000-00000000c0df',
      });
      const ok = validateHeader(header);
      if (!ok.ok) { failures.push(`${type}@${v}: ${(ok.errors ?? []).join('; ')}`); continue; }
      const payload = { synthetic: true, type, v };
      const stored = (await rows(sql`select canon.sha256_hex(canon.jcs(jsonb_build_object('header', ${JSON.stringify(header)}::jsonb, 'payload', ${JSON.stringify(payload)}::jsonb))) d`))[0]?.['d'];
      if (stored !== canonicalHeaderDigest(header, payload)) failures.push(`${type}@${v}: the store's digest differs from the contract's`);
      try { await sql`select objects.assert_header_semantics(${JSON.stringify(header)}::jsonb)`.execute(h.su); } catch (e) { failures.push(`${type}@${v}: ${String((e as Error).message)}`); }
    }
    expect(failures).toEqual([]);
  });
});

describe('the versions the product wrote here', () => {
  it('lifecycle: every recorded state is canonical; every correction_of / supersedes names a recorded earlier version of the same object', async () => {
    const bad = await rows(sql`select object_type, lifecycle_state from objects.canonical_objects where tenant_id = ${T()}::uuid and lifecycle_state <> all (${LIFECYCLE}::text[])`);
    expect(bad).toEqual([]);
    const refs = await rows(sql`select o.object_type, o.object_id::text id, o.object_version v, x.ref from objects.canonical_objects o,
        lateral (select unnest(array[o.correction_of, o.supersedes]) ref) x
      where o.tenant_id = ${T()}::uuid and o.recorded_at >= ${started} and x.ref is not null`);
    const unresolved: string[] = [];
    for (const r of refs) {
      const m = /([0-9a-f]{8}-[0-9a-f-]{27})@([0-9]+)$/.exec(String(r['ref']));
      if (m === null) { unresolved.push(`${String(r['object_type'])} ${String(r['id'])}: ${String(r['ref'])} is not <id>@<version>`); continue; }
      // (a source contract's earlier version may be the fixture's seeded contract record — observation.source_contracts_current — not a canonical SRC)
      const found = (await rows(sql`select 1 from objects.canonical_objects where object_id = ${m[1]}::uuid and object_version = ${Number(m[2])}
        union all select 1 from observation.source_contracts_current where ${String(r['object_type'])} = 'SRC' and source_id = ${m[1]}::uuid and contract_version = ${Number(m[2])}`)).length;
      if (found === 0) unresolved.push(`${String(r['object_type'])} ${String(r['id'])}: ${String(r['ref'])} is not recorded`);
    }
    expect(unresolved).toEqual([]);
  });
  it('cross-type references: every <TYPE>:<id>@<version> a header cites names a recorded version of that type', async () => {
    const refs = await rows(sql`select o.object_type, r ref from objects.canonical_objects o, jsonb_array_elements_text(o.source_object_ids || o.evidence_refs) r
      where o.tenant_id = ${T()}::uuid and o.recorded_at >= ${started} and r ~ '^[A-Z]{3}:[0-9a-f-]{36}@[0-9]+$'`);
    expect(refs.length).toBeGreaterThan(0);
    const unresolved = await rows(sql`select o.object_type, r ref from objects.canonical_objects o, jsonb_array_elements_text(o.source_object_ids || o.evidence_refs) r
      where o.tenant_id = ${T()}::uuid and o.recorded_at >= ${started} and r ~ '^[A-Z]{3}:[0-9a-f-]{36}@[0-9]+$'
        and left(r, 3) in (select object_type from objects.schema_registry)
        and not exists (select 1 from objects.canonical_objects c where c.object_type = left(r, 3) and c.object_id = substr(r, 5, 36)::uuid and c.object_version = split_part(r, '@', 2)::bigint)`);
    expect(unresolved).toEqual([]);
  });
  it('policy propagation: every version records where each control profile came from (source contract, evidence, parent, domain, declared, none)', async () => {
    const b = await rows(sql`select o.object_type, v.header_basis -> 'controls' c from objects.version_operations v join objects.canonical_objects o using (object_id, object_version)
      where o.tenant_id = ${T()}::uuid and o.recorded_at >= ${started}`);
    expect(b.length).toBeGreaterThan(0);
    const froms = new Set<string>();
    for (const r of b) for (const f of ['rights_profile', 'residency_profile', 'retention_profile', 'access_policy_ref']) {
      const x = (r['c'] as Row)[f] as Row;
      expect(['source_contract', 'evidence', 'parent', 'domain', 'declared', 'none'], `${String(r['object_type'])}.${f}`).toContain(x['from']);
      froms.add(String(x['from']));
    }
    expect([...froms]).toEqual(expect.arrayContaining(['source_contract', 'none']));
  });
  it('correction replay: as of each version\'s record time, the as-of read returns exactly that version', async () => {
    const multi = await rows(sql`select object_id::text id from objects.canonical_objects where tenant_id = ${T()}::uuid and recorded_at >= ${started} group by object_id having count(*) > 1 limit 20`);
    for (const m of multi) {
      const vs = await rows(sql`select object_version::int v, recorded_at from objects.canonical_objects where object_id = ${String(m['id'])}::uuid order by object_version`);
      for (const v of vs) {
        const asOf = await rows(sql`select object_version::int v from objects.canonical_objects where object_id = ${String(m['id'])}::uuid and recorded_at <= ${v['recorded_at'] as Date} order by object_version desc limit 1`);
        expect(asOf[0]?.['v'], `${String(m['id'])} as of v${String(v['v'])}`).toBe(v['v']);
      }
    }
  });
});
