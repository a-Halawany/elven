/**
 * The projection block at the function boundary (CP-6 B20; design §2.2, D5; corrections C1, C2, C10): the PURE part of the
 * twelve reads' product state — `worstOf` (withdrawn > unverified > lagging > current), `blockOf` over the six rows of
 * graph.projection_state() (the domain's values, the ROUTE's partitions, `checkpoint_seq` beside `verified_seq`, the route's
 * `withdrawn` beside the domain's `domain_withdrawn`, the code, total over zero rows), `labelOf` BYTE FOR BYTE for every
 * form the harness and the walks regex (current; lagging plain; lagging held with a partition withdrawn elsewhere; lagging
 * held with nothing withdrawn any more; unverified with no subscription; unverified with a subscription that verified
 * nothing; withdrawn + lagging held; withdrawn + unverified), `ROUTE_PARTITIONS` (twelve routes, every name one of the six),
 * `REBUILD_ROUTE` and `VERIFY_NOTE`. No database: what the B20 harness proves on live rows, this holds on the pure functions.
 */
import { describe, expect, it } from 'vitest';
import {
  CONDITION_RANK, PROJECTIONS, REBUILD_ROUTE, ROUTE_PARTITIONS, VERIFY_NOTE, blockOf, labelOf, worstOf,
  type Condition, type ProjectionBlock, type ProjectionName,
} from '../../../src/graph/projections/projection-state.js';

const SUB = '0190b1c2-d3e4-7000-8000-000000000001';
const CHECK = '0190b1c2-d3e4-7000-8000-000000000002';
const REBUILD = '0190b1c2-d3e4-7000-8000-000000000003';
const AT = new Date('2026-09-17T09:00:00.000Z');
const SINCE = new Date('2026-09-17T08:30:00.000Z');

/** A row of graph.projection_state() as pg hands it to the capability: bigint as text, timestamptz as Date, jsonb as an object. */
function row(projection: ProjectionName, over: Record<string, unknown> = {}, domain: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projection, state: 'serving', condition: 'current',
    revision_seq: '120', verified_seq: '120', verified_at: AT, verified_check_id: CHECK, checkpoint_seq: '120',
    lag_events: '0', unresolved_deliveries: '0', subscription_id: SUB, subscription_status: 'active',
    withdrawn_at: null, withdrawn_by: null, withdrawn_reason: null, withdrawn_by_check: null,
    representation_version: '1', representation_current: '1', representation_ok: true, last_rebuild_id: null, rebuilt_at: null,
    last_check_id: CHECK, last_check_at: AT, last_check: { projection, mismatched: 0, missing: 0, unexpected: 0, representation_ok: true, failed: false },
    ...domain, ...over,
  };
}
const six = (domain: Record<string, unknown> = {}, per: Partial<Record<ProjectionName, Record<string, unknown>>> = {}) =>
  PROJECTIONS.map((p) => row(p, per[p] ?? {}, domain));
const withdrawnRow = { state: 'withdrawn', condition: 'withdrawn', withdrawn_at: SINCE, withdrawn_by: SUB, withdrawn_reason: 'retrieval check x: mismatched 1, missing 0, unexpected 0, representation ok (current 1)', withdrawn_by_check: CHECK };

const LAG_TAIL = ' — the ports write a projection and its log in one transaction, so this is verification lag, not data lag';
const UNVERIFIED_1 = 'no live retrieval subscription verifies this domain\'s projections; the projection watermark is unknown';
const UNVERIFIED_2 = 'a retrieval subscription is registered and has verified nothing yet (no check applied); the projection watermark is unknown until its first check applies';
const WITHDRAWN_ENTITIES = `the entities_current projection of this domain is withdrawn since ${SINCE.toISOString()} (${withdrawnRow.withdrawn_reason}); this answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt (POST …/graph/projections/entities_current/rebuild (graph.projection.rebuild))`;

/** A block without its label, for `labelOf` alone. */
function bare(over: Partial<ProjectionBlock>): Omit<ProjectionBlock, 'label'> {
  const { label: _l, ...rest } = blockOf(six(), ['entities_current']);
  return { ...rest, ...over };
}

describe('B20 · worstOf and the rank', () => {
  it('withdrawn > unverified > lagging > current; nothing at all is unverified', () => {
    expect(CONDITION_RANK).toEqual({ current: 0, lagging: 1, unverified: 2, withdrawn: 3 });
    expect(worstOf([])).toBe('unverified');
    expect(worstOf(['current'])).toBe('current');
    expect(worstOf(['current', 'lagging'])).toBe('lagging');
    expect(worstOf(['lagging', 'unverified', 'current'])).toBe('unverified');
    expect(worstOf(['unverified', 'withdrawn', 'lagging'])).toBe('withdrawn');
    expect(worstOf(['withdrawn', 'current'])).toBe('withdrawn');
  });
});

describe('B20 · ROUTE_PARTITIONS, REBUILD_ROUTE, VERIFY_NOTE', () => {
  it('twelve routes, every partition one of the six, the overview all six', () => {
    const keys = Object.keys(ROUTE_PARTITIONS);
    expect(keys.sort()).toEqual(['edgesList', 'entitiesList', 'entityGet', 'memoryGet', 'memoryList', 'memoryRetrieve', 'neighbourhood', 'overview', 'path', 'search', 'strategyGet', 'strategyList']);
    for (const k of keys) {
      const names = (ROUTE_PARTITIONS as Record<string, readonly string[]>)[k]!;
      expect(names.length, k).toBeGreaterThan(0);
      for (const n of names) expect(PROJECTIONS as readonly string[], `${k}: ${n}`).toContain(n);
      expect(new Set(names).size, k).toBe(names.length);
    }
    expect([...ROUTE_PARTITIONS.overview]).toEqual([...PROJECTIONS]);
    expect([...ROUTE_PARTITIONS.neighbourhood]).toEqual(['edges_current', 'entities_current']);
    expect([...ROUTE_PARTITIONS.path]).toEqual(['edges_current', 'entities_current']);
    expect([...ROUTE_PARTITIONS.search]).toEqual(['entities_current']);
    expect([...ROUTE_PARTITIONS.edgesList]).toEqual(['edges_current']);
    expect([...ROUTE_PARTITIONS.memoryRetrieve]).toEqual(['memory_items_current']);
  });
  it('the rebuild route and the verify note are the literals the harness regexes', () => {
    expect(REBUILD_ROUTE('edges_current')).toBe('POST …/graph/projections/edges_current/rebuild (graph.projection.rebuild)');
    expect(VERIFY_NOTE).toBe('this route verifies and withdraws nothing: a failed row here is withdrawn by the operator (graph.projection.withdraw) or by the retrieval subscriber at the domain\'s next GraphChanged/MemoryCorrected event');
  });
});

describe('B20 · labelOf, byte for byte (C1, C2)', () => {
  it('1 · current → no label', () => {
    expect(labelOf(bare({ condition: 'current' }))).toBeNull();
  });
  it('2 · lagging, plain: the checkpoint is not held', () => {
    const b = bare({ condition: 'lagging', verified_seq: 118, lag_events: 2, unresolved_deliveries: 0 });
    expect(labelOf(b)).toBe(`verified through revision 118 (at ${AT.toISOString()}); 2 change(s) since are not yet verified by the retrieval subscriber${LAG_TAIL}`);
  });
  it('3 · lagging, held by an unresolved delivery with a partition withdrawn elsewhere in the domain (the route\'s own partition serving)', () => {
    const b = bare({ condition: 'lagging', verified_seq: 118, lag_events: 1, unresolved_deliveries: 1, withdrawn: [], domain_withdrawn: ['entities_current'] });
    expect(labelOf(b)).toBe(`verified through revision 118 (at ${AT.toISOString()}); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery(ies) (a failed check: partition(s) entities_current withdrawn until rebuilt); 1 change(s) since are checked as they arrive but not checkpointed${LAG_TAIL}`);
  });
  it('4 · lagging, held with nothing withdrawn any more (the window between a rebuild and the re-drive)', () => {
    const b = bare({ condition: 'lagging', verified_seq: 118, lag_events: 2, unresolved_deliveries: 1, withdrawn: [], domain_withdrawn: [] });
    expect(labelOf(b)).toBe(`verified through revision 118 (at ${AT.toISOString()}); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery(ies) (a failed check whose partition(s) have since been rebuilt; the delivery clears at its re-drive); 2 change(s) since are checked as they arrive but not checkpointed${LAG_TAIL}`);
  });
  it('5 · unverified, no live retrieval subscription', () => {
    const b = bare({ condition: 'unverified', verified_seq: null, verified_at: null, verified_check_id: null, checkpoint_seq: null, lag_events: 0, subscription: { subscription_id: null, status: null } });
    expect(labelOf(b)).toBe(UNVERIFIED_1);
  });
  it('6 · unverified, a subscription registered that has verified nothing yet (C1)', () => {
    const b = bare({ condition: 'unverified', verified_seq: null, verified_at: null, verified_check_id: null, checkpoint_seq: null, lag_events: 3, subscription: { subscription_id: SUB, status: 'active' } });
    expect(labelOf(b)).toBe(UNVERIFIED_2);
  });
  it('7 · withdrawn + lagging held: the withdrawn text first, the domain\'s held sentence appended after " — "', () => {
    const b = blockOf(six({ condition: 'lagging', verified_seq: '118', checkpoint_seq: '118', lag_events: '1', unresolved_deliveries: '1' }, { entities_current: withdrawnRow }), ['entities_current', 'resolutions_current']);
    const { label: _l, ...rest } = b;
    expect(labelOf(rest)).toBe(`${WITHDRAWN_ENTITIES} — verified through revision 118 (at ${AT.toISOString()}); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery(ies) (a failed check: partition(s) entities_current withdrawn until rebuilt); 1 change(s) since are checked as they arrive but not checkpointed${LAG_TAIL}`);
    expect(b.label).toBe(labelOf(rest));
  });
  it('8 · withdrawn + unverified (a subscription that verified nothing): the withdrawn text first, then form 2', () => {
    const domain = { condition: 'unverified', verified_seq: null, verified_at: null, verified_check_id: null, checkpoint_seq: null, lag_events: '2', unresolved_deliveries: '0' };
    const b = blockOf(six(domain, { entities_current: withdrawnRow }), ['entities_current']);
    expect(b.label).toBe(`${WITHDRAWN_ENTITIES} — ${UNVERIFIED_2}`);
  });
  it('the withdrawn text alone when the domain is verified through its revision; two withdrawn partitions joined by "; " in the route\'s order', () => {
    const b = blockOf(six({}, { entities_current: withdrawnRow, edges_current: { ...withdrawnRow, withdrawn_reason: 'representation review before the ontology proposal' } }), ['edges_current', 'entities_current']);
    expect(b.label).toBe(`the edges_current projection of this domain is withdrawn since ${SINCE.toISOString()} (representation review before the ontology proposal); this answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt (POST …/graph/projections/edges_current/rebuild (graph.projection.rebuild)); ${WITHDRAWN_ENTITIES}`);
    // The harness's regexes over the two forms.
    expect(b.label).toMatch(/^the edges_current projection of this domain is withdrawn since .* \(representation review before the ontology proposal\); this answer is derived from the event log/);
    expect(labelOf({ ...b, partitions: b.partitions.filter((p) => p.projection === 'entities_current'), withdrawn: ['entities_current'] })).toMatch(/^the entities_current projection of this domain is withdrawn since .* \(retrieval check .*\); this answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt \(POST …\/graph\/projections\/entities_current\/rebuild \(graph\.projection\.rebuild\)\)$/);
  });
});

describe('B20 · blockOf over the six rows', () => {
  it('current: the domain\'s values as numbers and instants, the route\'s partitions in the route\'s order, no code, no label', () => {
    const b = blockOf(six(), ['edges_current', 'entities_current']);
    expect(b).toMatchObject({
      revision: 120, verified_seq: 120, verified_at: AT.toISOString(), verified_check_id: CHECK, checkpoint_seq: 120,
      lag_events: 0, unresolved_deliveries: 0, subscription: { subscription_id: SUB, status: 'active' },
      condition: 'current', degraded: false, code: null, label: null, withdrawn: [], domain_withdrawn: [],
    });
    expect(b.partitions.map((p) => p.projection)).toEqual(['edges_current', 'entities_current']);
    expect(b.partitions[0]).toEqual({
      projection: 'edges_current', state: 'serving', condition: 'current', withdrawn_since: null, reason: null, withdrawn_by_check: null,
      representation_version: '1', representation_current: '1', representation_ok: true, last_rebuild_id: null, rebuilt_at: null,
      last_check: { projection: 'edges_current', mismatched: 0, missing: 0, unexpected: 0, representation_ok: true, failed: false },
    });
  });
  it('a withdrawn edges_current with a lagging domain (C2): the route reading it is withdrawn with the code; a route reading only entities_current is lagging, its `withdrawn` empty and `domain_withdrawn` naming edges_current; `checkpoint_seq` beside `verified_seq`', () => {
    const rows = six({ condition: 'lagging', verified_seq: '118', checkpoint_seq: '117', lag_events: '2', unresolved_deliveries: '1' },
      { edges_current: { ...withdrawnRow, last_rebuild_id: REBUILD, rebuilt_at: AT } });
    const edges = blockOf(rows, ['edges_current', 'entities_current']);
    expect(edges.condition).toBe('withdrawn');
    expect(edges.degraded).toBe(true);
    expect(edges.code).toBe('EYE-DEG-001');
    expect(edges.withdrawn).toEqual(['edges_current']);
    expect(edges.domain_withdrawn).toEqual(['edges_current']);
    expect(edges.verified_seq).toBe(118);
    expect(edges.checkpoint_seq).toBe(117);
    expect(edges.partitions.find((p) => p.projection === 'edges_current')).toMatchObject({
      state: 'withdrawn', condition: 'withdrawn', withdrawn_since: SINCE.toISOString(), reason: withdrawnRow.withdrawn_reason, withdrawn_by_check: CHECK, last_rebuild_id: REBUILD, rebuilt_at: AT.toISOString(),
    });
    expect(edges.label).toMatch(/^the edges_current projection of this domain is withdrawn since .* — verified through revision 118 \(at .*\); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery\(ies\) \(a failed check: partition\(s\) edges_current withdrawn until rebuilt\); 2 change\(s\) since/);
    const entities = blockOf(rows, ['entities_current']);
    expect(entities.condition).toBe('lagging');
    expect(entities.degraded).toBe(false);
    expect(entities.code).toBeNull();
    expect(entities.withdrawn).toEqual([]);
    expect(entities.domain_withdrawn).toEqual(['edges_current']);
    expect(entities.label).toBe(`verified through revision 118 (at ${AT.toISOString()}); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery(ies) (a failed check: partition(s) edges_current withdrawn until rebuilt); 2 change(s) since are checked as they arrive but not checkpointed${LAG_TAIL}`);
  });
  it('an outdated representation on a partition is carried as the row says (representation_version / representation_current / representation_ok)', () => {
    const b = blockOf(six({}, { edges_current: { ...withdrawnRow, representation_version: '0', representation_ok: false } }), ['edges_current']);
    expect(b.partitions[0]).toMatchObject({ representation_version: '0', representation_current: '1', representation_ok: false, condition: 'withdrawn' });
  });
  it('unverified with no subscription: the domain\'s nulls, the first form', () => {
    const b = blockOf(six({ condition: 'unverified', verified_seq: null, verified_at: null, verified_check_id: null, checkpoint_seq: null, subscription_id: null, subscription_status: null, lag_events: '4' }), ['memory_items_current']);
    expect(b).toMatchObject({ condition: 'unverified', degraded: false, code: null, verified_seq: null, verified_at: null, checkpoint_seq: null, lag_events: 4, subscription: { subscription_id: null, status: null }, label: UNVERIFIED_1 });
  });
  it('is TOTAL: zero rows (no domain in the context) yields no partitions, unverified and its label, never a throw', () => {
    const b = blockOf([], ['entities_current', 'resolutions_current']);
    expect(b).toEqual({
      revision: null, verified_seq: null, verified_at: null, verified_check_id: null, checkpoint_seq: null, lag_events: 0, unresolved_deliveries: 0,
      subscription: { subscription_id: null, status: null }, partitions: [], condition: 'unverified', degraded: false, code: null,
      label: UNVERIFIED_1, withdrawn: [], domain_withdrawn: [],
    });
  });
  it('the block never invents a partition the rows lack, and the worst decides even when the route names it last', () => {
    const rows = six({}, { memory_items_current: withdrawnRow });
    const b = blockOf(rows, ['strategy_current', 'memory_items_current']);
    expect(b.partitions.map((p) => [p.projection, p.condition])).toEqual([['strategy_current', 'current'], ['memory_items_current', 'withdrawn']]);
    expect(b.condition).toBe('withdrawn');
    const only = blockOf(rows.filter((r) => r['projection'] !== 'strategy_current'), ['strategy_current']);
    expect(only.partitions).toEqual([]);
    expect(only.condition).toBe('unverified');
  });
  it('the condition vocabulary is closed', () => {
    const all: Condition[] = ['current', 'lagging', 'unverified', 'withdrawn'];
    expect(Object.keys(CONDITION_RANK).sort()).toEqual([...all].sort());
  });
});
