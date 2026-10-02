/*
 * CP-6 B24 (0086 §M) part `materiality` · the pure halves: BRF@v2's as-of reconstruction of the two new item events (held for capacity,
 * elevated), the section's line carrying the further dimensions ONLY for an item judged with them (an earlier item composes exactly as
 * before — the same digest on recomposition), the rebalance port's refusal rows through the mapper (anchored; the B22 rows unchanged),
 * the PDP's exact rule for the operator's rebalance, the tick step's name and order, and the three consumer identities that change with
 * their methods (attention, source-health, proposals).
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { FURTHER_DIMENSIONS, attentionSection, stateAsOf } from '../../src/executive/briefings/attention-section.js';
import { CONSUMER_KINDS, consumerCodeDigest } from '../../src/graph/subscriptions/graph-change.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { AttentionRebalanceStep } from '../../src/executive/attention/materiality.js';

const OWNER = '0190b1c2-d3e4-7000-8000-000000000202'; const EVT = '0190b1c2-d3e4-7000-8000-000000000203'; const SUBJ = '0190b1c2-d3e4-7000-8000-000000000206';
const ACTOR = '0190b1c2-d3e4-7000-8000-000000000207';
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  expect((r?.getResponse() as { code: string }).code, m).toBe(body);
};
const ev = (item: string, event: string, at: string, details: Record<string, unknown> = {}, id = `${item}-${at}`) => ({ event_id: id, item_id: item, event, details, occurred_at: new Date(at) });

describe('B24 · BRF@v2 reads the overload events as of known_at', () => {
  it('held for capacity → deprioritized under its version; re-evaluated while waiting; elevated → the state the elevation names', () => {
    const log = [ev('a', 'item.overload_deprioritized', '2026-09-25T10:00:00Z', { outcome: 'material', policy_version: 1, overload: { cap: 2, open: 2 } }),
      ev('a', 'item.reevaluated', '2026-09-25T11:00:00Z', { from_state: 'deprioritized', to_state: 'deprioritized', to_version: 2 }),
      ev('a', 'item.elevated', '2026-09-25T12:00:00Z', { from_state: 'deprioritized', to_state: 'open', policy_version: 2 }), ev('a', 'item.acknowledged', '2026-09-25T13:00:00Z')];
    expect(stateAsOf(log, '2026-09-25T09:00:00.000Z')).toBeNull();
    expect(stateAsOf(log, '2026-09-25T10:30:00.000Z')).toEqual({ state: 'deprioritized', policy_version: 1, acknowledged: false });
    expect(stateAsOf(log, '2026-09-25T11:30:00.000Z')).toEqual({ state: 'deprioritized', policy_version: 2, acknowledged: false });
    expect(stateAsOf(log, '2026-09-25T12:30:00.000Z')).toEqual({ state: 'open', policy_version: 2, acknowledged: false });
    expect(stateAsOf(log, '2026-09-25T13:30:00.000Z')).toMatchObject({ state: 'acknowledged', acknowledged: true });
    // an elevation to an owner who left (unrouted) or a routing failure escalated names that state
    expect(stateAsOf([ev('b', 'item.overload_deprioritized', '2026-09-25T10:00:00Z', { policy_version: 1 }), ev('b', 'item.elevated', '2026-09-25T11:00:00Z', { to_state: 'escalated', policy_version: 1 })], '2026-09-25T12:00:00.000Z')?.state).toBe('escalated');
  });
  it('the line carries the further dimensions only for an item judged with them — an earlier item composes exactly as before', () => {
    const item = (id: string, dims: Record<string, unknown>) => ({ item_id: id, signal_class: 'warning.raised', subject_kind: 'warning', subject_id: SUBJ, title: id, owner_principal_id: OWNER,
      evaluation: { dimensions: dims }, created_at: new Date('2026-09-25T10:00:00Z'), cause_event_id: EVT });
    const old = item('o', { consequence: 'C2', confidence: 0.8, hours_to_window: 5 });
    const now = item('n', { consequence: 'C2', confidence: 0.8, hours_to_window: 5, probability: 0.5, exposure: null, strategic_relevance: null, information_value: null, irreversibility: null, dimension_basis: {} });
    const events = [ev('o', 'item.routed', '2026-09-25T10:00:00Z', { policy_version: 1 }), ev('n', 'item.routed', '2026-09-25T10:00:00Z', { policy_version: 1 })];
    const s = attentionSection({ items: [old, now], events, policies: [], knownAt: '2026-09-25T11:00:00.000Z', since: null });
    const lo = s.items.find((x) => x['item_id'] === 'o')!; const ln = s.items.find((x) => x['item_id'] === 'n')!;
    expect(Object.keys(lo)).toEqual(['item_id', 'signal_class', 'subject_kind', 'subject_id', 'title', 'state', 'policy_version', 'owner', 'consequence', 'confidence', 'confidence_band', 'hours_to_window', 'created_at', 'cause_event_id']);
    expect(Object.keys(ln)).toEqual([...Object.keys(lo), ...FURTHER_DIMENSIONS]);
    expect(ln).toMatchObject({ probability: 0.5, exposure: null, irreversibility: null });
    expect(ln['dimension_basis'], 'the basis stays in the item, not the edition').toBeUndefined();
  });
});

describe('B24 · the rebalance port\'s refusals through the mapper (anchored; the B22 rows unchanged)', () => {
  it('the standing (403) and the caller\'s own request (422)', () => {
    answer('42501', 'attention rebalance rejected: rebalanced by the acting principal', 403, 'EYE-AUT-001');
    answer('22023', 'attention rebalance rejected: something else about the request', 422, 'EYE-REQ-001');
  });
  it('the B22 queue rows keep their answers (a held item is not acknowledged: 409)', () => {
    answer('22023', `attention item rejected: item ${SUBJ} is deprioritized; only an open, escalated or unrouted item is acknowledged`, 409, 'EYE-STA-002');
    answer('42501', `attention item rejected: item ${SUBJ} is routed to collection_manager (owner ${OWNER}); the acting principal is neither`, 403, 'EYE-AUT-001');
  });
});

describe('B24 · the PDP rule, the tick step, the consumer identities', () => {
  it('the operator\'s rebalance: exact, human-gated, the executive and the domain administrator only', () => {
    const pdp = new PdpService();
    const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
    const decide = (action: string, role: string) => pdp.evaluate({ action, principal: { principalId: ACTOR, kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] },
      delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive', consequenceClass: 'C2', objectType: 'ATI', objectId: null,
      environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
    for (const role of ['executive', 'domain_admin']) {
      const d = decide('executive.attention.rebalance', role);
      expect(d.decision, role).toBe('allow_with_obligations');
      expect(d.obligations, role).toEqual([{ type: 'human_gate' }]);
    }
    for (const role of ['domain_analyst', 'collection_manager', 'decision_owner', 'attention_agent']) expect(decide('executive.attention.rebalance', role).decision, role).toBe('deny');
    expect(decide('executive.attention.read', 'domain_analyst').decision, 'the view is the queue\'s read').toBe('allow');
  });
  it('the tick step: `rebalance`, order 20, registered once at module start', () => {
    const registry = new AttentionTickRegistry();
    const step = new AttentionRebalanceStep(registry);
    step.onModuleInit();
    expect(registry.steps().map((s) => [s.name, s.order])).toEqual([['rebalance', 20]]);
    expect(() => step.onModuleInit()).toThrow(/registered twice/);
  });
  it('eleven distinct consumer identities (attention, source-health and proposals changed with their methods — re-registered on the demo)', () => {
    expect(new Set(CONSUMER_KINDS.map((k) => consumerCodeDigest(k))).size).toBe(11);
  });
});
