/**
 * CP-6 B21 (Codex B20-F1; design D1.1, D1.4, D1.11): the withdrawn-mode memory reader's canonical statements under the
 * content-tier boundary, at the function boundary and without a database — Codex's query double made durable.
 *
 * The reader (fallback.ts memoryItemsFromLog) issues TWO canonical statements — S1 the derivation `memory.expected_items`
 * (its policy columns join the canonical table; on every withdrawn read) and S2 the absent rows' versions (only when the
 * log names a row the projection lacks) — around the metadata read M of the projection. Each runs under its own savepoint at
 * the fault point b21.memory_fallback_content_unavailable; a failure `contentFailureDetail` classifies (an injected fault; a
 * statement-level SQLSTATE that leaves the connection alive, 57014 here) raises ContentTierUnavailable naming the statement
 * after the savepoint rolled back; everything else (a connection-class failure, a port refusal) is rethrown raw; a canonical
 * read that answers and holds no version is `content_tier: 'absent'` — data, not silence. The ordinal `armNth` reaches the
 * second arrival exactly (Codex's row: S1 answered, "the actual lookup" cancelled); for a present row the second arrival never
 * comes (S2 is not issued) and the point stays armed. No database.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fault from '../../../src/observation/fault-injection.js';
import { InjectedFault, armNth } from '../../../src/observation/fault-injection.js';
import { memoryItemsFromLog, type ExpectedReads } from '../../../src/graph/projections/fallback.js';
import { ContentTierUnavailable, contentFailureDetail } from '../../../src/graph/projections/content-tier.js';

type Row = Record<string, unknown>;
const M = '0190b1c2-d3e4-7000-8000-00000000b21a';
const R = '0190b1c2-d3e4-7000-8000-00000000b21b';
const scope = { tenantId: '0190b1c2-d3e4-7000-8000-00000000000a', domainId: '0190b1c2-d3e4-7000-8000-00000000000b' };
const P = 'b21.memory_fallback_content_unavailable' as const;
const pgError = (code: string, message = 'a pg error'): Error & { code: string } => Object.assign(new Error(message), { code });
const pg57014 = () => pgError('57014', 'canceling statement due to statement timeout');

/** A kysely-shaped builder: selectAll/where chain, execute answers (or fails) as the double says. */
const builder = (rows: () => Promise<Row[]>) => { const b = { selectAll() { return b; }, where() { return b; }, execute: rows }; return b; };
const never = (name: string) => () => { throw new Error(`${name} is never called by the memory reader`); };
const canonicalRow: Row = {
  object_id: M, object_type: 'MEM', object_version: 1, classification: 'internal', accountable_owner: `principal:${R}`, recorded_at: new Date('2024-01-17T00:00:00Z'),
  payload: { record_class: 'institutional', title: 'B21 memory item', source: { kind: 'human', ref: null }, audience: { roles: [], purposes: ['memory'] }, validity: { from: '2024-01-01T00:00:00Z', to: null }, retention: { profile: 'standard', retain_until: null, basis: null }, related: {} },
};
const expectedRow: Row = { item_id: M, state: 'active', object_version: 1, attention_state: 'none', superseded_versions: 0, last_superseded_at: null, recorded_at: new Date('2024-01-17T00:00:00Z'), recorded_by: R, classification: 'internal' };

type Fake = ExpectedReads & { savepoints: string[]; rolledBack: string[]; canonicalCalls: number };
const fake = (opts: { projected: Row[]; canonical: () => Promise<Row[]>; expected?: () => Promise<Row[]> }): Fake => {
  const savepoints: string[] = []; const rolledBack: string[] = [];
  const f = {
    savepoints, rolledBack, canonicalCalls: 0,
    expected: opts.expected ?? (async () => [expectedRow]),
    readMemoryItems: () => builder(async () => opts.projected),
    readCanonicalObjects: () => { f.canonicalCalls += 1; return builder(opts.canonical); },
    readEntities: never('readEntities'), readEdges: never('readEdges'), readResolutions: never('readResolutions'), readStrategy: never('readStrategy'), readInvalidations: never('readInvalidations'),
    // The savepoint sequence recorded: entered (savepoints) and rolled back (rolledBack) — on a live double the rollback "succeeds".
    withSavepoint: async <T>(name: string, run: () => Promise<T>): Promise<T> => { savepoints.push(name); try { return await run(); } catch (e) { rolledBack.push(name); throw e; } },
  };
  return f as unknown as Fake;
};

describe('B21 · the withdrawn-mode memory reader\'s canonical statements under the content-tier boundary (Codex B20-F1; D1.1)', () => {
  afterEach(() => fault.disarm());

  it('1 · S2 57014 (Codex\'s row 4 at the function boundary): the absent row\'s canonical lookup cancelled → ContentTierUnavailable naming canonical_versions; both savepoints entered, the second rolled back', async () => {
    const cap = fake({ projected: [], canonical: () => Promise.reject(pg57014()) });
    const p = memoryItemsFromLog(cap, scope, { ids: [M] });
    await expect(p).rejects.toBeInstanceOf(ContentTierUnavailable);
    await expect(p).rejects.toMatchObject({ statement: 'canonical_versions', detail: '57014: canceling statement due to statement timeout' });
    expect(cap.savepoints).toEqual(['mem_fallback_expected', 'mem_fallback_canonical']);
    expect(cap.rolledBack).toEqual(['mem_fallback_canonical']);
  });

  it('2 · S1 57014: the derivation cancelled → ContentTierUnavailable naming memory.expected_items; one savepoint, rolled back; the canonical read never issued', async () => {
    const cap = fake({ projected: [], canonical: async () => [canonicalRow], expected: () => Promise.reject(pg57014()) });
    await expect(memoryItemsFromLog(cap, scope, { ids: [M] })).rejects.toMatchObject({ statement: 'memory.expected_items', detail: '57014: canceling statement due to statement timeout' });
    expect(cap.savepoints).toEqual(['mem_fallback_expected']);
    expect(cap.rolledBack).toEqual(['mem_fallback_expected']);
    expect(cap.canonicalCalls).toBe(0);
  });

  it('3 · the point, arrival 1 (arm): fires at S1 on a healthy double; the point consumed', async () => {
    const cap = fake({ projected: [], canonical: async () => [canonicalRow] });
    fault.arm([P], 'test');
    await expect(memoryItemsFromLog(cap, scope, { ids: [M] })).rejects.toMatchObject({ statement: 'memory.expected_items', detail: 'injected fault at b21.memory_fallback_content_unavailable' });
    expect(fault.isArmed(P)).toBe(false);
    expect(cap.savepoints).toEqual(['mem_fallback_expected']);
    expect(cap.rolledBack).toEqual(['mem_fallback_expected']);
  });

  it('4 · the point, arrival 2 (armNth 2): S1 answers, S2 fires — Codex\'s row exactly; both savepoints entered; the point consumed', async () => {
    const cap = fake({ projected: [], canonical: async () => [canonicalRow] });
    armNth(P, 2, 'test');
    await expect(memoryItemsFromLog(cap, scope, { ids: [M] })).rejects.toMatchObject({ statement: 'canonical_versions', detail: 'injected fault at b21.memory_fallback_content_unavailable' });
    expect(cap.savepoints).toEqual(['mem_fallback_expected', 'mem_fallback_canonical']);
    expect(cap.rolledBack).toEqual(['mem_fallback_canonical']);
    expect(fault.isArmed(P)).toBe(false);
  });

  it('5 · arrival 2 never comes for a PRESENT row: S2 is not issued, the row is served from the projection under the log\'s state, the point stays armed', async () => {
    const cap = fake({ projected: [{ item_id: M, state: 'active', object_version: 1, title: 't' }], canonical: never('readCanonicalObjects') as unknown as () => Promise<Row[]> });
    armNth(P, 2, 'test');
    const rows = await memoryItemsFromLog(cap, scope, { ids: [M] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ item_id: M, projected: true, from: 'projection', index_state: 'stale', title: 't', state: 'active', object_version: 1 });
    expect(rows[0]).not.toHaveProperty('drift');
    expect(cap.savepoints).toEqual(['mem_fallback_expected']);
    expect(cap.rolledBack).toEqual([]);
    expect(fault.isArmed(P), 'S2 is not issued for a present row; the second arrival never came').toBe(true);
    fault.disarm();
    expect(fault.isArmed(P)).toBe(false);
  });

  it('6 · a connection-class failure (08006) is rethrown RAW — not the content tier\'s silence; the savepoint\'s rollback was attempted (on a live double it succeeds; on a dead connection it would throw as before)', async () => {
    const cap = fake({ projected: [], canonical: () => Promise.reject(pgError('08006', 'connection failure')) });
    const p = memoryItemsFromLog(cap, scope, { ids: [M] });
    await expect(p).rejects.toMatchObject({ code: '08006' });
    await expect(p).rejects.not.toBeInstanceOf(ContentTierUnavailable);
    expect(cap.rolledBack).toEqual(['mem_fallback_canonical']);
  });

  it('7 · a port refusal (22023) is rethrown RAW — the same shape', async () => {
    const cap = fake({ projected: [], canonical: () => Promise.reject(pgError('22023', 'memory item rejected: the basis is not admitted')) });
    const p = memoryItemsFromLog(cap, scope, { ids: [M] });
    await expect(p).rejects.toMatchObject({ code: '22023', message: 'memory item rejected: the basis is not admitted' });
    await expect(p).rejects.not.toBeInstanceOf(ContentTierUnavailable);
    expect(cap.rolledBack).toEqual(['mem_fallback_canonical']);
  });

  it('8 · "absent" is not "did not answer": a canonical read that answers and holds no version the log names → the log\'s metadata alone (content_tier absent), no throw, nothing rolled back', async () => {
    const cap = fake({ projected: [], canonical: async () => [] });
    const rows = await memoryItemsFromLog(cap, scope, { ids: [M] });
    expect(rows).toEqual([expect.objectContaining({ item_id: M, projected: false, from: 'log', content_tier: 'absent', index_state: 'stale', state: 'active', object_version: 1 })]);
    expect(cap.savepoints).toEqual(['mem_fallback_expected', 'mem_fallback_canonical']);
    expect(cap.rolledBack).toEqual([]);
  });

  it('9 · contentFailureDetail: an injected fault names its point; a content-tier SQLSTATE names the code and the message cut at 120; a refusal and a plain Error are null (the caller rethrows)', () => {
    expect(contentFailureDetail(new InjectedFault(P))).toBe('injected fault at b21.memory_fallback_content_unavailable');
    expect(contentFailureDetail(pgError('57014', 'x'.repeat(200)))).toBe(`57014: ${'x'.repeat(120)}`);
    expect(contentFailureDetail(pgError('22023'))).toBeNull();
    expect(contentFailureDetail(new Error('no code'))).toBeNull();
    expect(contentFailureDetail(null)).toBeNull();
  });
});

describe('B21 · armNth (D1.4): the point fires on the nth arrival; arm() is the ordinal 1', () => {
  afterEach(() => fault.disarm());

  it('(i) armNth 1 fires on the first at(): as arm(); unarmed after', () => {
    armNth(P, 1, 'test');
    expect(fault.isArmed(P)).toBe(true);
    expect(() => fault.at(P)).toThrow(InjectedFault);
    expect(fault.isArmed(P)).toBe(false);
  });

  it('(ii) armNth 3: two arrivals return (the point stays armed), the third throws, then unarmed', () => {
    armNth(P, 3, 'test');
    expect(() => fault.at(P)).not.toThrow(); expect(fault.isArmed(P)).toBe(true);
    expect(() => fault.at(P)).not.toThrow(); expect(fault.isArmed(P)).toBe(true);
    expect(() => fault.at(P)).toThrow('injected fault at b21.memory_fallback_content_unavailable');
    expect(fault.isArmed(P)).toBe(false);
    expect(() => fault.at(P)).not.toThrow();
  });

  it('(iii) an ordinal names a positive arrival; the arming stays test-only', () => {
    expect(() => armNth(P, 0, 'test')).toThrow('an ordinal names a positive arrival');
    expect(() => armNth(P, 1.5, 'test')).toThrow('an ordinal names a positive arrival');
    expect(fault.isArmed(P)).toBe(false);
    expect(() => armNth(P, 2, 'production')).toThrow('fault injection may only be armed in the test runtime profile');
    expect(fault.isArmed(P)).toBe(false);
  });

  it('(iv) disarm() clears a countdown: a point armed for the second arrival, disarmed, returns on every arrival', () => {
    armNth(P, 2, 'test');
    fault.disarm();
    expect(fault.isArmed(P)).toBe(false);
    expect(() => fault.at(P)).not.toThrow();
    expect(() => fault.at(P)).not.toThrow();
    // and a fresh arm() after a cleared countdown is the ordinal 1 again (no stale countdown survives disarm)
    fault.arm([P], 'test');
    expect(() => fault.at(P)).toThrow(InjectedFault);
  });
});
