/**
 * The governed import's two GraphChanged events at the function boundary (CP-6 B17; design §2.2, §2.5; D2, D3, D16; C6, C13):
 * the PURE admission builder pinned key by key on a small fixture, the truncation arithmetic (300 identities / 250 edges / 201 claims
 * → 200 each, `objects.truncated`), what `touchedIds` makes of the roles (created and retired are CHANGED identities, reached is not),
 * and the revocation builder on a stub walker and Kysely-shaped stub reads: the seed ceiling (40 seeds → 32 walks, truncated said),
 * the merge (one entry per reached object, the routes united; the reach sets deduplicated), a claim seed walked as a withdrawal, and
 * the import block carrying the notice. No database: what the B17 harness proves on a live import, this holds on the builders.
 */
import { describe, expect, it } from 'vitest';
import { GRAPH_CHANGE_KINDS, consumerCodeDigest, type GraphChangedPayload } from '../../../src/graph/subscriptions/graph-change.js';
import { IMPORT_EVENT_LIST_MAX, IMPORT_WALK_SEEDS_MAX, importAdmittedEvent, importRevokedEvent, touchedIds, type ChangeReads, type ImportChangeFacts, type ImportWalkSeed } from '../../../src/graph/subscriptions/change-events.js';
import type { ImpactService } from '../../../src/graph/strategy/impact.service.js';

type Row = Record<string, unknown>;
let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190b1c2-d3e4-7000-8000-${h}`; };
const T = uid(); const D = uid(); const IMPORT = uid(); const ACTOR = uid();
const ORIGIN = { tenant_id: uid(), domain_id: uid(), action_id: uid(), package_digest: 'a'.repeat(64) };
const AT = '2026-09-16T10:00:00.000Z';

const facts = (over: Partial<ImportChangeFacts> = {}): ImportChangeFacts => ({
  tenantId: T, domainId: D, importId: IMPORT, partnerKey: 'nordwerk-origin', origin: ORIGIN,
  counts: { records: 1, claims: 2, entities: 2, edges: 1, reused: 1 },
  identities: [], edges: [], claims: [], evidence: [], actor: ACTOR, occurredAt: AT, ...over,
});
const payloadOf = (row: { payload: Record<string, unknown> }): GraphChangedPayload => row.payload as unknown as GraphChangedPayload;

/** A Kysely-shaped read that answers a fixed list whatever the chain (selectAll / select / where / orderBy → execute). */
function stubQuery(rows: Row[] = []) {
  const q: Record<string, unknown> = {};
  for (const m of ['selectAll', 'select', 'where', 'orderBy', 'limit']) q[m] = () => q;
  q['execute'] = async () => rows;
  q['executeTakeFirst'] = async () => rows[0];
  return q;
}
function stubReads(a: { entities?: Row[]; edges?: Row[]; dependencies?: Row[]; subscriptions?: Array<{ subscription_id: string; consumer_kind: string }> } = {}): ChangeReads & { calls: string[] } {
  const calls: string[] = [];
  const reads = {
    calls,
    readEntities: () => { calls.push('readEntities'); return stubQuery(a.entities); },
    readEdges: () => { calls.push('readEdges'); return stubQuery(a.edges); },
    readDependencies: () => { calls.push('readDependencies'); return stubQuery(a.dependencies); },
    subscriptionsMatching: async (x: { changeKind: string }) => { calls.push(`subscriptionsMatching:${x.changeKind}`); return a.subscriptions ?? []; },
    readStrategy: () => stubQuery(), readForecasts: () => stubQuery(), readScenarios: () => stubQuery(), readWarnings: () => stubQuery(), readTwins: () => stubQuery(), readRuns: () => stubQuery(),
    readBriefings: () => stubQuery(), readMemoryItems: () => stubQuery(), readClaimLineage: () => stubQuery(), readResolutions: () => stubQuery(),
  };
  return reads as unknown as ChangeReads & { calls: string[] };
}
type Walked = Awaited<ReturnType<ImpactService['walk']>>;
const emptyWalk = (trigger: { triggerKind: string; triggerObjectId: string }, over: Partial<Walked> = {}): Walked => ({
  ...trigger, assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], briefings: [], memoryItems: [],
  reachedEntities: [], reachedEdges: [], reachedClaims: [], truncated: false, unexplored: [], ...over,
});
/** A walker that answers what the fixture says per seed and records every trigger it was asked. */
function stubImpact(answer: (t: { triggerKind: string; triggerObjectId: string }) => Walked): ImpactService & { walks: Array<{ triggerKind: string; triggerObjectId: string }> } {
  const walks: Array<{ triggerKind: string; triggerObjectId: string }> = [];
  return { walks, walk: async (_cap: unknown, t: { triggerKind: string; triggerObjectId: string }) => { walks.push(t); return answer(t); } } as unknown as ImpactService & { walks: typeof walks };
}

describe('B17 · the kinds and the consumer identity', () => {
  it('GRAPH_CHANGE_KINDS carries import.admitted and import.revoked; the memory-mappings method changed, so its digest did (D10)', () => {
    expect(GRAPH_CHANGE_KINDS).toContain('import.admitted');
    expect(GRAPH_CHANGE_KINDS).toContain('import.revoked');
    // The B8 precedent: a changed method is a new consumer identity — the live subscriptions are re-registered. Pinned so a silent revert is caught.
    expect(consumerCodeDigest('memory-mappings')).not.toBe(consumerCodeDigest('twins'));
    expect(consumerCodeDigest('memory-mappings')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('the ceilings are the design\'s', () => {
    expect(IMPORT_EVENT_LIST_MAX).toBe(200);
    expect(IMPORT_WALK_SEEDS_MAX).toBe(32);
  });
});

describe('B17 · importAdmittedEvent (D1, D16; C13)', () => {
  it('the ONE event of an admission, pinned key by key on a two-identity fixture: created and reached identities, the edge as recorded, the claims and records, walked false, the import block', () => {
    const created = uid(); const reused = uid(); const edge = uid(); const c1 = uid(); const c2 = uid(); const r1 = uid();
    const subscriptions = [{ subscription_id: uid(), consumer_kind: 'twins' }, { subscription_id: uid(), consumer_kind: 'retrieval' }];
    const row = importAdmittedEvent({ ...facts({
      identities: [{ entity_id: created, role: 'created', canonical_name: 'NORDWERK ANTRIEBSTECHNIK GmbH', lifecycle_state: 'active' }, { entity_id: reused, role: 'reached' }],
      edges: [{ edge_id: edge, state: 'asserted', predicate: 'procures', subject_entity_id: created, object_entity_id: reused, valid_from: '2026-01-01T00:00:00.000Z', valid_to: null, asserted_at: AT, retracted_at: null, claim_object_id: c1 }],
      claims: [c1, c2], evidence: [r1],
    }), subscriptions });
    expect(row.eventType).toBe('GraphChanged');
    const p = payloadOf(row);
    expect(p).toEqual({
      schema: 'GraphChanged', schema_version: 'v1',
      change: { kind: 'import.admitted', occurred_at: AT, graph_event_id: null, invalidation_id: null, correction_case_id: null },
      identities: [
        { entity_id: created, role: 'created', canonical_name: 'NORDWERK ANTRIEBSTECHNIK GmbH', lifecycle_state: 'active', split_from: null },
        { entity_id: reused, role: 'reached', canonical_name: null, lifecycle_state: null, split_from: null },
      ],
      relationships: { edges: [{ edge_id: edge, state: 'asserted', predicate: 'procures', subject_entity_id: created, object_entity_id: reused, valid_from: '2026-01-01T00:00:00.000Z', valid_to: null, asserted_at: AT, retracted_at: null, claim_object_id: c1 }], resolutions: [], dependencies: [] },
      objects: { claims: [c1, c2], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [r1], briefings: [], memoryItems: [], truncated: false, walked: false },
      temporal: { known_at: AT },
      subscriptions,
      cause: { action: 'retention.import.admit', actor: ACTOR, target_type: 'RIM', target_id: IMPORT },
      import: { import_id: IMPORT, partner_key: 'nordwerk-origin', origin: ORIGIN, counts: { records: 1, claims: 2, entities: 2, edges: 1, reused: 1 } },
    });
    // C13: reused is counted, never announced in objects (nothing changed for a reused claim or record); the reused entity is `reached`.
    expect(p.import?.counts['reused']).toBe(1);
  });
  it('the ceiling: 300 identities, 250 edges and 201 claims are cut to 200 each with objects.truncated true; a list under it is whole and does not truncate on its own', () => {
    const identities = Array.from({ length: 300 }, () => ({ entity_id: uid(), role: 'created' as const }));
    const edges = Array.from({ length: 250 }, () => ({ edge_id: uid(), state: 'asserted' }));
    const claims = Array.from({ length: 201 }, () => uid());
    const evidence = Array.from({ length: 7 }, () => uid());
    const p = payloadOf(importAdmittedEvent({ ...facts({ identities, edges, claims, evidence }), subscriptions: [] }));
    expect(p.identities.length).toBe(200);
    expect(p.identities.map((i) => i.entity_id)).toEqual(identities.slice(0, 200).map((i) => i.entity_id));
    expect(p.relationships.edges.length).toBe(200);
    expect(p.objects.claims.length).toBe(200);
    expect(p.objects.evidence).toEqual(evidence);
    expect(p.objects.truncated).toBe(true);
    expect(p.objects.walked).toBe(false);
    const small = payloadOf(importAdmittedEvent({ ...facts({ identities: identities.slice(0, 200), edges: edges.slice(0, 200), claims: claims.slice(0, 200), evidence }), subscriptions: [] }));
    expect(small.objects.truncated).toBe(false);
  });
  it('touchedIds: the created ids are CHANGED identities, a reached one is touched but not changed, a retired one IS changed (D2)', () => {
    const created = uid(); const reached = uid(); const retired = uid();
    const p = payloadOf(importAdmittedEvent({ ...facts({ identities: [{ entity_id: created, role: 'created' }, { entity_id: reached, role: 'reached' }, { entity_id: retired, role: 'retired' }], claims: [uid()], evidence: [uid()] }), subscriptions: [] }));
    const t = touchedIds({ event_type: 'GraphChanged', payload: p });
    expect(t.entities).toEqual(new Set([created, reached, retired]));
    expect(t.changedEntities).toEqual(new Set([created, retired]));
    expect(t.changedEntities.has(reached)).toBe(false);
    expect(t.claims.size).toBe(1); expect(t.evidence.size).toBe(1);
    expect(t.walked).toBe(false);
  });
});

describe('B17 · importRevokedEvent (D3; C6)', () => {
  const notice = { notice_id: uid(), source: 'origin' as const, revoked_at: AT, reason: 'the origin withdrew the package' };

  it('40 seeds → 32 walks (the first 32, in order), truncated said; the rest stay listed in objects unwalked; the notice is carried in the import block', async () => {
    const records = Array.from({ length: 40 }, () => uid());
    const impact = stubImpact((t) => emptyWalk(t));
    const cap = stubReads({ subscriptions: [{ subscription_id: uid(), consumer_kind: 'twins' }] });
    const row = await importRevokedEvent(cap, impact, { ...facts({ evidence: records }), walkSeeds: records.map((id): ImportWalkSeed => ({ kind: 'evidence', id })), notice });
    expect(impact.walks.length).toBe(IMPORT_WALK_SEEDS_MAX);
    expect(impact.walks.map((w) => w.triggerObjectId)).toEqual(records.slice(0, 32));
    expect(impact.walks.every((w) => w.triggerKind === 'evidence_correction')).toBe(true);
    const p = payloadOf(row);
    expect(p.change.kind).toBe('import.revoked');
    expect(p.change.occurred_at).toBe(AT);
    expect(p.objects.walked).toBe(true);
    expect(p.objects.truncated).toBe(true);
    expect(p.objects.evidence).toEqual(records);
    expect(p.cause).toEqual({ action: 'retention.import.revoke', actor: ACTOR, target_type: 'RIM', target_id: IMPORT });
    expect(p.subscriptions).toEqual([{ subscription_id: expect.any(String), consumer_kind: 'twins' }]);
    expect(cap.calls).toContain('subscriptionsMatching:import.revoked');
    expect(p.import).toEqual({ import_id: IMPORT, partner_key: 'nordwerk-origin', origin: ORIGIN, counts: facts().counts, notice });
  });

  it('the merge: one entry per reached object with the routes united, the reach sets deduplicated, the withdrawn claims united into objects.claims; under the ceiling nothing is truncated', async () => {
    const r1 = uid(); const r2 = uid(); const c1 = uid(); const c2 = uid(); const e1 = uid(); const g1 = uid(); const twin = uid(); const asu = uid();
    const impact = stubImpact((t) => emptyWalk(t, {
      twins: [{ strategy_object_id: twin, object_type: 'TWN', title: 'twin', reached_via: 'rests on a claim derived from the corrected evidence', hop: 1, via_id: t.triggerObjectId === r1 ? c1 : c2, via_ids: [t.triggerObjectId === r1 ? c1 : c2] }],
      assumptions: t.triggerObjectId === r1 ? [{ strategy_object_id: asu, object_type: 'ASU', title: 'asu', reached_via: 'rests on the changed claim directly', hop: 2 }] : [],
      reachedEntities: [e1], reachedEdges: [g1], reachedClaims: t.triggerObjectId === r1 ? [c1] : [c2],
    }));
    const retiredEntity = uid(); const retractedEdge = uid(); const c3 = uid();
    // The rows the builder reads back under RLS: the retired entity as the earlier write of the attempt left it, the walk's entity and edge as they stand.
    const cap = stubReads({
      entities: [{ entity_id: e1, canonical_name: 'E1', lifecycle_state: 'active', split_from: null }, { entity_id: retiredEntity, canonical_name: 'R', lifecycle_state: 'retired', split_from: null }],
      edges: [{ edge_id: g1, state: 'asserted', predicate: 'procures', subject_entity_id: e1, object_entity_id: e1, valid_from: null, valid_to: null, asserted_at: AT, retracted_at: null, claim_object_id: c1 }],
    });
    const p = payloadOf(await importRevokedEvent(cap, impact, {
      ...facts({ identities: [{ entity_id: retiredEntity, role: 'retired', canonical_name: 'R', lifecycle_state: 'retired' }], edges: [{ edge_id: retractedEdge, state: 'retracted', predicate: 'procures', subject_entity_id: retiredEntity, object_entity_id: e1, claim_object_id: c1 }], claims: [c1, c3], evidence: [r1, r2] }),
      walkSeeds: [{ kind: 'evidence', id: r1 }, { kind: 'evidence', id: r2 }], notice,
    }));
    expect(impact.walks.length).toBe(2);
    expect(p.objects.twins).toEqual([twin]);
    expect(p.objects.assumptions).toEqual([asu]);
    expect(p.objects.claims).toEqual([c1, c3, c2]);
    expect(p.objects.evidence).toEqual([r1, r2]);
    expect(p.objects.truncated).toBe(false);
    // The retired entity given, the walk's entity reached (enriched from its row); the retracted edge given, the walk's edge reached with its current state.
    expect(p.identities).toEqual([
      { entity_id: retiredEntity, role: 'retired', canonical_name: 'R', lifecycle_state: 'retired', split_from: null },
      { entity_id: e1, role: 'reached', canonical_name: 'E1', lifecycle_state: 'active', split_from: null },
    ]);
    expect(p.relationships.edges.map((e) => [e.edge_id, e.state])).toEqual([[retractedEdge, 'retracted'], [g1, 'asserted']]);
    const t = touchedIds({ event_type: 'GraphChanged', payload: p });
    expect(t.changedEntities).toEqual(new Set([retiredEntity]));
    expect(t.twins).toEqual(new Set([twin]));
  });

  it('a claim seed without a record seed is walked as a claim withdrawal (C6) — a trigger the walker knows', async () => {
    const c1 = uid();
    const impact = stubImpact((t) => emptyWalk(t, { reachedClaims: [c1] }));
    const p = payloadOf(await importRevokedEvent(stubReads(), impact, { ...facts({ claims: [c1] }), walkSeeds: [{ kind: 'claim', id: c1 }], notice: { ...notice, source: 'station', notice_id: null } }));
    expect(impact.walks).toEqual([{ triggerKind: 'claim_withdrawal', triggerObjectId: c1 }]);
    expect(p.objects.claims).toEqual([c1]);
    expect(p.objects.evidence).toEqual([]);
    expect(p.objects.truncated).toBe(false);
    expect(p.import?.notice).toEqual({ ...notice, source: 'station', notice_id: null });
  });

  it('a walk that stopped at its bound makes the event truncated even under the seed ceiling; the frontiers are concatenated into the merge', async () => {
    const r1 = uid(); const r2 = uid();
    const impact = stubImpact((t) => emptyWalk(t, { truncated: t.triggerObjectId === r2, unexplored: t.triggerObjectId === r2 ? [{ kind: 'strategy', id: uid(), via: 'rests on …' }] : [] }));
    const p = payloadOf(await importRevokedEvent(stubReads(), impact, { ...facts({ evidence: [r1, r2] }), walkSeeds: [{ kind: 'evidence', id: r1 }, { kind: 'evidence', id: r2 }], notice }));
    expect(p.objects.truncated).toBe(true);
    expect(p.objects.walked).toBe(true);
  });

  it('no seed at all (nothing tombstoned, nothing withdrawn beyond the graph) still publishes the event with an empty, walked reach', async () => {
    const retired = uid();
    const impact = stubImpact((t) => emptyWalk(t));
    const p = payloadOf(await importRevokedEvent(stubReads(), impact, { ...facts({ identities: [{ entity_id: retired, role: 'retired' }] }), walkSeeds: [], notice }));
    expect(impact.walks.length).toBe(0);
    expect(p.objects.walked).toBe(true);
    expect(p.objects.truncated).toBe(false);
    expect(p.identities).toEqual([{ entity_id: retired, role: 'retired' }]);
  });
});
