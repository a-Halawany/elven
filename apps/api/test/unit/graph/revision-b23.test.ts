/**
 * CP-6 B23 (0084, L4-I02 CommitGraphRevision) at the function boundary: the PURE GraphChanged/revision.committed builder pinned key by
 * key (created nodes and the existing ends as changed identities, asserted and superseded edges, the claims and evidence, walked false,
 * the typed `revision` block, the GRV cause) and its cut at LIFECYCLE_EVENT_LIST_MAX; the intake (the three fields typed, a node's
 * normalised name filled by the resolver's normaliser and nothing else touched); the PDP rule (exact; the four roles; nothing near it
 * inherits it); the refusal family's statuses in the 403 → 404 → 409 → 422 order. No database: the harness proves the port.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { GRAPH_CHANGE_KINDS, type GraphChangedPayload } from '../../../src/graph/subscriptions/graph-change.js';
import { LIFECYCLE_EVENT_LIST_MAX, revisionCommittedEvent, touchedIds } from '../../../src/graph/subscriptions/change-events.js';
import { validateRevisionIntake } from '../../../src/graph/revisions/revision.service.js';
import { normalizeName } from '../../../src/graph/entities/resolver.service.js';
import { PdpService, type PolicyInput } from '../../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../../src/observation/observation-errors.js';

type Row = Record<string, unknown>;
let counter = 0;
const uid = (): string => { counter += 1; return `0190b1c2-d3e4-7000-8000-${counter.toString(16).padStart(12, '0')}`; };
const T = uid(); const D = uid(); const ACTOR = uid(); const REV = uid();
const SUPPLIER = uid(); const PORT = uid(); const ROUTE = uid(); const EXISTING = uid();
const C_ENT1 = uid(); const C_ENT2 = uid(); const C_REL1 = uid(); const C_REL2 = uid(); const EVD1 = uid(); const EVD2 = uid();
const E1 = uid(); const E2 = uid(); const OLD = uid();
const AT = '2026-09-25T10:00:00.000Z';
const payloadOf = (row: { payload: Record<string, unknown> }): GraphChangedPayload => row.payload as unknown as GraphChangedPayload;

/** The port's answer for the supplier → port → route change set (two new nodes, one existing end, two edges, one superseded). */
const answer = (over: Row = {}): Row => ({
  revision_id: REV, revision: 8, expected: 7, idempotency_key: 'k-mueller-2026-09-25-1', request_digest: 'b'.repeat(64), ontology_version_id: null,
  counts: { nodes: 2, identifiers: 1, identifiers_already: 0, edges: 2, superseded: 1 },
  node_ids: [
    { ordinal: 1, ref: 'supplier', entity_id: SUPPLIER, entity_type: 'organization', canonical_name: 'NORDWERK Antriebstechnik GmbH', claim_object_id: C_ENT1, claim_version: 1 },
    { ordinal: 2, ref: 'port', entity_id: PORT, entity_type: 'place', canonical_name: 'Port of Hamburg', claim_object_id: C_ENT2, claim_version: 1 },
  ],
  identifier_ids: [{ ordinal: 1, identifier_id: uid(), entity_id: SUPPLIER, system_key: 'lei', value: '5299000000000000NW01', state: 'identified' }],
  edge_ids: [
    { ordinal: 1, edge_id: E1, predicate: 'ships_through', subject_entity_id: SUPPLIER, object_entity_id: PORT, subject_ref: 'supplier', object_ref: 'port', valid_from: '2024-01-01T00:00:00+00:00', valid_to: null, claim_object_id: C_REL1, claim_version: 1, evidence_object_id: EVD1 },
    { ordinal: 2, edge_id: E2, predicate: 'served_by', subject_entity_id: PORT, object_entity_id: EXISTING, subject_ref: 'port', object_ref: null, valid_from: '2024-01-01T00:00:00+00:00', valid_to: '2025-01-01T00:00:00+00:00', claim_object_id: C_REL2, claim_version: 2, evidence_object_id: EVD2 },
  ],
  superseded_edges: [{ edge_id: OLD, superseded_by: E2, claim_object_id: C_REL2 }],
  committed_at: AT, committed_by: ACTOR, repeated: false, ...over,
});

describe('B23 · GraphChanged/revision.committed — pure, many facts in ONE event', () => {
  it('the kind is appended to GRAPH_CHANGE_KINDS (nineteen; revision.committed last)', () => {
    expect(GRAPH_CHANGE_KINDS[GRAPH_CHANGE_KINDS.length - 1]).toBe('revision.committed');
    expect(GRAPH_CHANGE_KINDS).toHaveLength(19);
  });

  it('pins the payload key by key: created nodes, the existing end, asserted + superseded edges, claims, evidence, the revision block, the GRV cause', () => {
    const subscriptions = [{ subscription_id: uid(), consumer_kind: 'retrieval' }];
    const p = payloadOf(revisionCommittedEvent({ revision: answer(), subscriptions, actor: ACTOR }));
    expect(p.schema).toBe('GraphChanged'); expect(p.schema_version).toBe('v1');
    expect(p.change).toEqual({ kind: 'revision.committed', occurred_at: AT, graph_event_id: null, invalidation_id: null, correction_case_id: null });
    expect(p.identities).toEqual([
      { entity_id: SUPPLIER, role: 'created', canonical_name: 'NORDWERK Antriebstechnik GmbH', lifecycle_state: 'active', split_from: null },
      { entity_id: PORT, role: 'created', canonical_name: 'Port of Hamburg', lifecycle_state: 'active', split_from: null },
      { entity_id: EXISTING, role: 'object' },
    ]);
    expect(p.relationships.edges).toEqual([
      { edge_id: E1, state: 'asserted', predicate: 'ships_through', subject_entity_id: SUPPLIER, object_entity_id: PORT, valid_from: '2024-01-01T00:00:00+00:00', valid_to: null, claim_object_id: C_REL1 },
      { edge_id: E2, state: 'asserted', predicate: 'served_by', subject_entity_id: PORT, object_entity_id: EXISTING, valid_from: '2024-01-01T00:00:00+00:00', valid_to: '2025-01-01T00:00:00+00:00', claim_object_id: C_REL2 },
      { edge_id: OLD, state: 'superseded', superseded_at: AT, claim_object_id: C_REL2 },
    ]);
    expect(p.relationships.resolutions).toEqual([]); expect(p.relationships.dependencies).toEqual([]);
    expect(p.objects.claims).toEqual([C_ENT1, C_ENT2, C_REL1, C_REL2]);
    expect(p.objects.evidence).toEqual([EVD1, EVD2]);
    expect(p.objects.walked).toBe(false); expect(p.objects.truncated).toBe(false);
    expect(p.objects.forecasts).toEqual([]); expect(p.objects.twins).toEqual([]);
    expect(p.temporal).toEqual({ known_at: AT });
    expect(p.subscriptions).toEqual(subscriptions);
    expect(p.cause).toEqual({ action: 'graph.revision.commit', actor: ACTOR, target_type: 'GRV', target_id: REV });
    expect(p.revision).toEqual({ revision_id: REV, revision: 8, expected: 7, idempotency_key: 'k-mueller-2026-09-25-1', request_digest: 'b'.repeat(64), ontology_version_id: null,
      counts: { nodes: 2, identifiers: 1, identifiers_already: 0, edges: 2, superseded: 1 } });
    // no block of another kind rides along
    for (const k of ['import', 'twin', 'forecast', 'simulation', 'forecast_fitness', 'projection'] as const) expect(p[k]).toBeUndefined();
  });

  it('touchedIds: the created nodes and the edges\' ends are CHANGED identities; the edges and claims are keys', () => {
    const t = touchedIds({ event_type: 'GraphChanged', payload: payloadOf(revisionCommittedEvent({ revision: answer(), subscriptions: [], actor: ACTOR })) });
    expect([...t.changedEntities].sort()).toEqual([SUPPLIER, PORT, EXISTING].sort());
    expect([...t.edges].sort()).toEqual([E1, E2, OLD].sort());
    expect(t.claims.has(C_REL1) && t.claims.has(C_ENT1)).toBe(true);
    expect(t.walked).toBe(false);
  });

  it('cuts every list at the ceiling and says so', () => {
    const nodes = Array.from({ length: 250 }, (_, i) => ({ ordinal: i + 1, ref: `n${i}`, entity_id: uid(), entity_type: 'place', canonical_name: `Place ${i}`, claim_object_id: uid(), claim_version: 1 }));
    const p = payloadOf(revisionCommittedEvent({ revision: answer({ node_ids: nodes, edge_ids: [], superseded_edges: [] }), subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(p.identities).toHaveLength(LIFECYCLE_EVENT_LIST_MAX);
    expect(p.objects.claims).toHaveLength(LIFECYCLE_EVENT_LIST_MAX);
    expect(p.objects.truncated).toBe(true);
  });
});

describe('B23 · the intake: three fields typed, the normalised name filled, nothing else touched', () => {
  const ok = { idempotency_key: 'k1', expected_revision: 0, change_set: { ontology: { version_id: null }, nodes: [{ ref: 'a', entity_type: 'organization', canonical_name: 'NORDWERK Antriebstechnik GmbH', provenance: { claim_object_id: C_ENT1, claim_version: 1 } }] } };
  const status = (p: Row): number | null => { try { validateRevisionIntake(p, 'c'); return null; } catch (e) { return e instanceof HttpException ? e.getStatus() : -1; } };
  it('fills normalized_name by the resolver\'s normaliser, deterministically; a stated one is kept', () => {
    const a = validateRevisionIntake(ok, 'c'); const b = validateRevisionIntake(ok, 'c');
    expect(JSON.stringify(a.changeSet)).toBe(JSON.stringify(b.changeSet));
    expect(((a.changeSet['nodes'] as Row[])[0] as Row)['normalized_name']).toBe(normalizeName('NORDWERK Antriebstechnik GmbH'));
    expect(((a.changeSet['nodes'] as Row[])[0] as Row)['normalized_name']).toBe('nordwerk antriebstechnik');
    const kept = validateRevisionIntake({ ...ok, change_set: { nodes: [{ ref: 'a', canonical_name: 'X', normalized_name: 'stated' }] } }, 'c');
    expect(((kept.changeSet['nodes'] as Row[])[0] as Row)['normalized_name']).toBe('stated');
    expect(a).toMatchObject({ idempotencyKey: 'k1', expectedRevision: 0 });
  });
  it('refuses a missing or mistyped field with 422', () => {
    expect(status(ok)).toBeNull();
    expect(status({ ...ok, idempotency_key: '' })).toBe(422);
    expect(status({ ...ok, idempotency_key: 'x'.repeat(201) })).toBe(422);
    expect(status({ ...ok, expected_revision: -1 })).toBe(422);
    expect(status({ ...ok, expected_revision: 1.5 })).toBe(422);
    expect(status({ ...ok, expected_revision: '3' })).toBe(422);
    expect(status({ ...ok, change_set: [] })).toBe(422);
    expect(status({ ...ok, change_set: { edges: {} } })).toBe(422);
  });
});

describe('B23 · the PDP rule: exact, four roles', () => {
  const pdp = new PdpService();
  const input = (action: string, roles: string[]): PolicyInput => ({
    principal: { principalId: ACTOR, kind: 'human', assurance: 'password', bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'GRV', objectId: null, purposeId: 'graph', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  it('allows the knowledge owner, the resolution manager and the domain administrator; denies the analyst, the ontology steward and the agents', () => {
    for (const role of ['knowledge_owner', 'resolution_manager', 'domain_admin']) expect(pdp.evaluate(input('graph.revision.commit', [role])).decision, role).toBe('allow');
    for (const role of ['domain_analyst', 'ontology_steward', 'resolution_agent', 'strategy_owner', 'record_authority']) expect(pdp.evaluate(input('graph.revision.commit', [role])).decision, role).toBe('deny');
  });
  it('matches EXACTLY: a neighbouring action inherits nothing', () => {
    for (const action of ['graph.revision.commit.now', 'graph.revision', 'graph.revisions.commit']) expect(pdp.evaluate(input(action, ['knowledge_owner'])).decision, action).toBe('indeterminate');
  });
});

describe('B23 · the refusal family in the 403 → 404 → 409 → 422 order', () => {
  const mapped = (message: string, code = '22023'): { status: number; code: string } | null => {
    const r = asObservationRefusal(Object.assign(new Error(message), { code }), 'c');
    return r === null ? null : { status: r.getStatus(), code: String((r.getResponse() as { code?: string }).code) };
  };
  it('maps each class to its status and keeps the port\'s text', () => {
    expect(mapped('graph revision rejected: recorded by the acting principal', '42501')).toEqual({ status: 403, code: 'EYE-AUT-001' });
    expect(mapped(`graph revision rejected (dependency): edge 3 object names entity ${EXISTING}, which is not an entity of this domain`, '23503')?.status).toBe(404);
    expect(mapped('graph revision rejected (conflict): the domain stands at revision 8, the change set expects 7')?.status).toBe(409);
    expect(mapped('graph revision rejected: idempotency key k1 was already used for a different change set (revision 8, digest abc)')?.status).toBe(409);
    expect(mapped(`graph revision rejected (claim_state): edge 1 rests on claim ${C_REL1}@1, which is queued for review; a claim a person has not decided is not promoted into the graph`)?.status).toBe(409);
    expect(mapped('graph revision rejected (identifier): identifier 1 — lei X already identifies a different entity (e)', '23505')?.status).toBe(409);
    expect(mapped('graph revision rejected (entity_state): edge 1 subject names entity e, which is retired; only an active entity gains a fact')?.status).toBe(409);
    expect(mapped('graph revision rejected (ontology): node 1 (a) has entity type vessel, which ontology version v (v1) does not declare (it declares place)')?.status).toBe(422);
    expect(mapped('graph revision rejected (provenance): edge 3 names evidence e, but claim c@1 rests on evidence f (its lineage); the evidence is the lineage\'s')?.status).toBe(422);
    expect(mapped('graph revision rejected: edge 3 relates entity e to itself; a self-edge is not a relationship')?.status).toBe(422);
    // an internal inconsistency is never dressed up as a business rule
    expect(mapped('graph revision failed: the head moved from 1 to 3 inside one transaction', 'XX000')).toBeNull();
  });
});
