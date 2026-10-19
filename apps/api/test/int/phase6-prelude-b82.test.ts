/**
 * CP-6 B82 §0 (migration 0121 §0) — THE PRELUDE: graph.provenance_strength exists as the documented INERT STUB — a guarded read (STABLE,
 * SECURITY DEFINER, a fixed search path, REVOKE ALL FROM PUBLIC, EXECUTE to eye_app and eye_commit) that answers `unknown` with the reason
 * `not_computed` for any subject of the right shape (it never looks: an unknown id answers the same), refuses a malformed subject in the
 * class form (`provenance rejected (subject)` → 422) and a caller outside its bound scope (`read rejected (scope)`), and writes nothing.
 * §TS calls it; §PX replaces it WHOLE (apps/api/src/graph/b82-seams.ts). Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { B82_READS, PROVENANCE_STRENGTH_STUB_VERSION, PROVENANCE_STRENGTHS, type ProvenanceStrengthRow } from '../../src/graph/b82-seams.js';
import { APP_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: ReturnType<typeof sql>, db: Db = h.su) => ((await q.execute(db)).rows[0] ?? {}) as Row;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  const message = e instanceof Error ? e.message : String(e);
  return { status: mapped === null ? null : mapped.getStatus(), message };
};
const strength = (type: string, id: string, version: number, db: Db = h.su) =>
  one(sql`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, ${type}, ${id}::uuid, ${version}::int) as s`, db).then((r) => r['s'] as ProvenanceStrengthRow);

beforeAll(async () => { h = await Phase4Harness.boot(); }, 300_000);
afterAll(async () => { await h?.close(); });

describe('§0.1 · the stub is declared and granted as documented', () => {
  it('one function with the seams\' signature: STABLE, SECURITY DEFINER, the fixed search path, jsonb; EXECUTE to eye_app and eye_commit, not PUBLIC', async () => {
    const r = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, pg_get_function_result(p.oid) res,
      pg_get_function_identity_arguments(p.oid) args,
      has_function_privilege('public', p.oid, 'EXECUTE') pub, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt
      from pg_proc p where p.oid = ${B82_READS.provenanceStrength.fn}::regprocedure`);
    expect(r).toMatchObject({ v: 's', d: true, cfg: 'search_path=graph, objects, observation, pg_catalog, pg_temp', res: 'jsonb', pub: false, app: true, cmt: true });
    expect(r['args']).toBe('p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version integer');
    const n = await one(sql`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'graph' and p.proname = 'provenance_strength'`);
    expect(n['n']).toBe(1);
  });
  it('the reads §TS, §EV, §GM and §PX add are not declared by the prelude (each part declares its own; §PX replaces the stub)', async () => {
    for (const [k, v] of Object.entries(B82_READS)) {
      const r = await one(sql`select to_regprocedure(${v.fn}) is not null as present`);
      expect(r['present'], k).toBe(v.stub);
    }
  });
});

describe('§0.1 · the stub is inert', () => {
  it('any subject of the right shape answers unknown / not_computed under the stub\'s rule version — an unknown id the same (it never looks)', async () => {
    const id = uuidv7();
    for (const [type, v] of [['EVD', 1], ['CLM', 3], ['DPK', 2]] as const) {
      const s = await strength(type, id, v);
      expect(s).toMatchObject({ ref: `${type}:${id}@${v}`, strength: 'unknown', rule_version: PROVENANCE_STRENGTH_STUB_VERSION });
      expect(s.reasons).toEqual([{ code: 'not_computed', detail: expect.stringMatching(/not computed yet/) }]);
      expect(Number.isFinite(Date.parse(s.as_of))).toBe(true);
      expect(PROVENANCE_STRENGTHS).toContain(s.strength);
    }
  });
  it('it writes nothing (a read-only transaction answers it)', async () => {
    const id = uuidv7();
    const s = await h.su.transaction().setAccessMode('read only').execute(async (tx) =>
      (await sql<{ s: ProvenanceStrengthRow }>`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, 'FCT', ${id}::uuid, 1) as s`.execute(tx)).rows[0]!.s);
    expect(s.strength).toBe('unknown');
  });
  it('a malformed subject is refused in the class form (422)', async () => {
    for (const [type, v] of [['evd', 1], ['EVDX', 1], ['EVD', 0]] as const) {
      const r = await refusal(sql`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, ${type}, ${uuidv7()}::uuid, ${v}::int)`.execute(h.su));
      expect(r.message).toMatch(/^provenance rejected \(subject\): a provenance-strength read names a recorded product/);
      expect(r.status).toBe(422);
    }
  });
  it('the runtime role with no bound scope is refused before anything is answered (read rejected (scope))', async () => {
    const app = h.app.get<Db>(APP_DB);
    const r = await refusal(sql`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, 'EVD', ${uuidv7()}::uuid, 1)`.execute(app));
    expect(r.message).toMatch(/^read rejected \(scope\): the provenance strength of a product is read only within the caller's bound tenant and domain/);
  });
});
