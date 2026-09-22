/**
 * The rebuilt event at the function boundary (CP-6 B20; design §2.9; D8, D13): the PURE builder `projectionRebuiltEvent` pinned
 * key by key on uuid fixtures — NO identities, NO relationships, `objects` the EMPTY reach walked false, the typed `projection`
 * block carrying the rebuild port's report (outcome rebuilt | restored, the counts, the changed rows cut at the 200 ceiling with
 * `restored_truncated`, the re-check, the representation version, the withdrawal it closed) and the rebuild act as the cause —
 * what `touchedIds` makes of it (EVERY selection set empty: the D8 guarantee that no consumer selecting by identities,
 * relationships or objects is fed anything by a rebuild), the kind in GRAPH_CHANGE_KINDS, and the retrieval consumer's identity
 * CHANGED with its method (the symmetric check that withdraws; the B8 rule: a changed method is a new consumer, re-registered)
 * while the seven digests stay distinct. No database: what the B20 harness proves on a live chain (P2's six deliveries), this
 * holds on the builder.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONSUMER_KINDS, CONSUMER_VERSION, GRAPH_CHANGE_KINDS, consumerCodeDigest, type GraphChangedPayload } from '../../../src/graph/subscriptions/graph-change.js';
import { LIFECYCLE_EVENT_LIST_MAX, projectionRebuiltEvent, touchedIds } from '../../../src/graph/subscriptions/change-events.js';

let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190c2d3-e4f5-7000-8000-${h}`; };
const ACTOR = uid();
const AT = '2026-09-17T12:00:00.000Z';
const EMPTY_REACH_KEYS = { claims: [], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [], briefings: [], memoryItems: [] };
const payloadOf = (row: { payload: Record<string, unknown> }): GraphChangedPayload => row.payload as unknown as GraphChangedPayload;
const scope = () => ({ tenantId: uid(), domainId: uid() });
/** The port's report as graph.rebuild_projection answers it on success (§1.7): outcome, counts, the changed rows, the re-check, the withdrawal closed. */
const report = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  outcome: 'rebuilt', projection: 'entities_current', state: 'serving', rebuild_id: uid(), reason: 'the drift on E1 is the harness\'s own fault; rebuilding from the log',
  updated: 1, inserted: 0, removed: 0, restored: [{ id: uid(), change: 'updated', to: 'active' }], restored_truncated: false,
  check: { live_rows: 3, rebuilt_rows: 3, mismatched: 0, missing: 0, unexpected: 0, representation_ok: true }, representation_version: '1',
  withdrawn_since: '2026-09-17T11:58:00.000Z', withdrawn_reason: 'retrieval check x after outbox event y: mismatched 1, missing 0, unexpected 0, representation ok (current 1)', withdrawn_by_check: uid(), rebuilt_at: AT,
  ...over,
});

describe('B20 · the kind and the consumer identities', () => {
  it('GRAPH_CHANGE_KINDS carries projection.rebuilt (and keeps every earlier kind)', () => {
    expect(GRAPH_CHANGE_KINDS).toContain('projection.rebuilt');
    for (const k of ['entity.created', 'edge.asserted', 'forecast.superseded', 'import.admitted', 'import.revoked', 'twin.state_changed', 'forecast.withdrawn', 'simulation.invalidated']) expect(GRAPH_CHANGE_KINDS).toContain(k);
  });
  it('the retrieval consumer\'s method CHANGED (the symmetric check that withdraws, 0080): its digest is not the 0063 one; the seven digests are distinct 64-hex strings', () => {
    // The identity a live retrieval subscription registered before 0080 carries — the B8 rule: a changed method is a new consumer,
    // and every live retrieval subscription is re-registered (the harness registers fresh; the act revokes and registers anew).
    const before0080 = createHash('sha256').update(`graph.subscription.retrieval@${CONSUMER_VERSION}:graph.rebuild_projections verified → graph.record_retrieval_check`, 'utf8').digest('hex');
    expect(consumerCodeDigest('retrieval')).not.toBe(before0080);
    for (const kind of CONSUMER_KINDS) expect(consumerCodeDigest(kind)).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(CONSUMER_KINDS.map((k) => consumerCodeDigest(k))).size).toBe(CONSUMER_KINDS.length);
    expect(CONSUMER_KINDS.length).toBe(7);
  });
});

describe('B20 · projectionRebuiltEvent (D8)', () => {
  it('a partition REBUILT, pinned key by key: no identities, no relationships, the empty reach walked false, the projection block from the report, the rebuild act on the rebuild id (PRJ) as the cause', () => {
    const s = scope(); const r = report();
    const subscriptions = [{ subscription_id: uid(), consumer_kind: 'retrieval' }, { subscription_id: uid(), consumer_kind: 'twins' }];
    const row = projectionRebuiltEvent({ ...s, report: r, subscriptions, actor: ACTOR, occurredAt: AT });
    expect(row.eventType).toBe('GraphChanged');
    expect(payloadOf(row)).toEqual({
      schema: 'GraphChanged', schema_version: 'v1',
      change: { kind: 'projection.rebuilt', occurred_at: AT, graph_event_id: null, invalidation_id: null, correction_case_id: null },
      identities: [],
      relationships: { edges: [], resolutions: [], dependencies: [] },
      objects: { ...EMPTY_REACH_KEYS, truncated: false, walked: false },
      temporal: { known_at: AT },
      subscriptions,
      cause: { action: 'graph.projection.rebuild', actor: ACTOR, target_type: 'PRJ', target_id: r['rebuild_id'] },
      projection: {
        projection: 'entities_current', outcome: 'rebuilt', rebuild_id: r['rebuild_id'], updated: 1, inserted: 0, removed: 0,
        restored: r['restored'], restored_truncated: false, check: r['check'], representation_version: '1',
        withdrawn_since: r['withdrawn_since'], withdrawn_reason: r['withdrawn_reason'], withdrawn_by_check: r['withdrawn_by_check'],
      },
    });
  });
  it('a partition RESTORED (nothing to write — the demonstration\'s case): outcome restored, the counts 0, restored [], the block still names the withdrawal it closed; the instant defaults to now', () => {
    const before = Date.now();
    const p = payloadOf(projectionRebuiltEvent({ ...scope(), report: report({ outcome: 'restored', projection: 'edges_current', updated: 0, inserted: 0, removed: 0, restored: [] }), subscriptions: [], actor: ACTOR }));
    expect(p.projection?.outcome).toBe('restored');
    expect(p.projection?.projection).toBe('edges_current');
    expect([p.projection?.updated, p.projection?.inserted, p.projection?.removed]).toEqual([0, 0, 0]);
    expect(p.projection?.restored).toEqual([]);
    expect(p.projection?.restored_truncated).toBe(false);
    expect(p.projection?.withdrawn_reason).toMatch(/^retrieval check/);
    expect(p.identities).toEqual([]); expect(p.relationships).toEqual({ edges: [], resolutions: [], dependencies: [] }); expect(p.objects.walked).toBe(false);
    expect(Date.parse(p.change.occurred_at)).toBeGreaterThanOrEqual(before);
    expect(p.temporal.known_at).toBe(p.change.occurred_at);
  });
  it('the counts and the instants arrive as the port renders them (bigint counts as strings, a Date instant) and are normalised; a missing check reads null', () => {
    const p = payloadOf(projectionRebuiltEvent({ ...scope(), report: report({ updated: '2', inserted: '1', removed: '0', check: null, withdrawn_since: new Date('2026-09-17T11:00:00.000Z'), withdrawn_by_check: null }), subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect([p.projection?.updated, p.projection?.inserted, p.projection?.removed]).toEqual([2, 1, 0]);
    expect(p.projection?.check).toBeNull();
    expect(p.projection?.withdrawn_since).toBe('2026-09-17T11:00:00.000Z');
    expect(p.projection?.withdrawn_by_check).toBeNull();
  });
  it('the ceiling: 250 changed rows are cut to 200 with restored_truncated true; the port\'s own cut (restored_truncated on the report) is honoured too', () => {
    const restored = Array.from({ length: 250 }, (_, i) => ({ id: uid(), change: i % 2 === 0 ? 'updated' : 'removed', to: 'active' }));
    const p = payloadOf(projectionRebuiltEvent({ ...scope(), report: report({ updated: 125, removed: 125, restored }), subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(p.projection?.restored.length).toBe(LIFECYCLE_EVENT_LIST_MAX);
    expect(p.projection?.restored).toEqual(restored.slice(0, 200));
    expect(p.projection?.restored_truncated).toBe(true);
    // the port already cut its list at 200 and said so: the event says so too, even though the list it received is not over the ceiling
    const portCut = payloadOf(projectionRebuiltEvent({ ...scope(), report: report({ restored: restored.slice(0, 200), restored_truncated: true }), subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(portCut.projection?.restored.length).toBe(200);
    expect(portCut.projection?.restored_truncated).toBe(true);
    // objects stays the empty reach: the changed rows never ride identities, edges or objects (they would feed the forecast and scenario consumers' selection)
    expect(p.objects).toEqual({ ...EMPTY_REACH_KEYS, truncated: false, walked: false });
    expect(p.identities).toEqual([]);
  });
  it('touchedIds: EVERY selection set is empty (entities, changed entities, edges, claims, evidence, strategy, forecasts, scenarios, twins, runs, memory items), unwalked, not truncated — the D8 guarantee', () => {
    const p = payloadOf(projectionRebuiltEvent({ ...scope(), report: report({ restored: Array.from({ length: 5 }, () => ({ id: uid(), change: 'inserted', to: 'active' })) }), subscriptions: [], actor: ACTOR, occurredAt: AT }));
    const t = touchedIds({ event_type: 'GraphChanged', payload: p });
    for (const key of ['entities', 'changedEntities', 'edges', 'claims', 'evidence', 'strategy', 'forecasts', 'scenarios', 'twins', 'runs', 'memoryItems'] as const) expect(t[key].size, key).toBe(0);
    expect(t.walked).toBe(false); expect(t.truncated).toBe(false);
  });
  it('the typed blocks never coexist: the rebuilt event carries `projection` and no twin, forecast, simulation or import block', () => {
    const p = payloadOf(projectionRebuiltEvent({ ...scope(), report: report(), subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(Object.keys(p)).toContain('projection');
    for (const k of ['twin', 'forecast', 'simulation', 'import']) expect(Object.keys(p)).not.toContain(k);
  });
});
