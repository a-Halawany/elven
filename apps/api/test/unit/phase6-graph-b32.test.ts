/**
 * CP-6 B32 (0089 §G, part `graph`) · hermetic: the alignment workspace at the PDP (exact rules; the planning acts and the authority act
 * human-gated; no agent anywhere; the read adds the executive and the decision roles), the refusal rows of the four ports' texts (403 →
 * 404 → 409 → 422 — each text through the mapper, so no earlier unanchored row swallows one), the route intakes, and the impact walk's
 * new buckets as the GraphChanged objects carry them (present only when reached — every earlier payload shape unchanged).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { validateAlignment, validateAuthority, validateMeasure, validateObservation, validateOwner, atOf, SUBJECT_OF, AUTHORITY_ACTS } from '../../src/graph/strategy/alignment.service.js';
import { strategyNodesOf } from '../../src/graph/strategy/impact.service.js';
import { reachOf } from '../../src/graph/subscriptions/change-events.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const X = '0193a3d0-0000-7000-8000-0000000000cc';
const Y = '0193a3d0-0000-7000-8000-0000000000dd';
const input = (action: string, roles: string[], kind: 'human' | 'agent' = 'human'): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'agent' ? 'agent_grant' : 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action, objectType: 'ALN', objectId: null, purposeId: 'graph',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
} as PolicyInput);
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), code: (r.getResponse() as { code: string }).code, message: String((r.getResponse() as { message?: string }).message) };
};
const status = (f: () => unknown): { status: number; message: string } => {
  try { f(); return { status: 0, message: '' }; } catch (e) { return { status: (e as HttpException).getStatus(), message: String(((e as HttpException).getResponse() as { message?: string }).message) }; }
};

describe('B32 graph · the PDP', () => {
  const pdp = new PdpService();
  it('the planning acts (alignment declare / retire, measure define, owner transfer): strategy owners and administrators, exact, human-gated, never an agent', () => {
    for (const action of ['graph.alignment.declare', 'graph.alignment.retire', 'graph.measure.define', 'graph.strategy.owner.assign']) {
      for (const role of ['strategy_owner', 'domain_admin']) {
        const r = pdp.evaluate(input(action, [role]));
        expect(r.decision, `${action} ${role}`).toBe('allow_with_obligations');
        expect(r.obligations, action).toEqual([{ type: 'human_gate' }]);
      }
      for (const role of ['executive', 'domain_analyst', 'decision_owner', 'collection_manager']) expect(pdp.evaluate(input(action, [role])).decision, `${action} ${role}`).toBe('deny');
      for (const role of ['decision_agent', 'risk_agent', 'attention_agent']) expect(pdp.evaluate(input(action, [role], 'agent')).decision, `${action} ${role}`).toBe('deny');
      expect(pdp.evaluate({ ...input(action, ['strategy_owner']), consequenceClass: 'C3' }).decision).toBe('deny');
      expect(pdp.evaluate(input(`${action}.x`, ['strategy_owner'])).decision, 'exact').not.toBe('allow_with_obligations');
    }
  });
  it('the authority act (PR-37-003): the executive, the decision authority, the administrator, the strategy owner — human-gated; no agent', () => {
    for (const role of ['executive', 'decision_authority', 'domain_admin', 'strategy_owner']) {
      expect(pdp.evaluate(input('graph.strategy.authority.act', [role])).obligations, role).toEqual([{ type: 'human_gate' }]);
    }
    for (const role of ['domain_analyst', 'decision_owner', 'decision_approver', 'forecast_owner']) expect(pdp.evaluate(input('graph.strategy.authority.act', [role])).decision, role).toBe('deny');
    for (const role of ['decision_agent', 'risk_agent', 'opportunity_agent', 'weak_signal_agent']) expect(pdp.evaluate(input('graph.strategy.authority.act', [role], 'agent')).decision, role).toBe('deny');
  });
  it('the observation is data entry (no gate) for the planning roles and the analysts; the read adds the executive and the decision roles, audited', () => {
    for (const role of ['strategy_owner', 'domain_admin', 'domain_analyst']) expect(pdp.evaluate(input('graph.measure.observe', [role])).decision, role).toBe('allow');
    expect(pdp.evaluate(input('graph.measure.observe', ['executive'])).decision).toBe('deny');
    for (const role of ['executive', 'decision_owner', 'decision_authority', 'decision_approver', 'strategy_owner', 'domain_analyst', 'forecast_owner']) {
      const r = pdp.evaluate(input('graph.strategy.alignment.read', [role]));
      expect(r.decision, role).toBe('allow_with_obligations');
      expect(r.obligations).toEqual([{ type: 'audit_access' }]);
    }
    expect(pdp.evaluate(input('graph.strategy.alignment.read', ['collection_manager'])).decision).toBe('deny');
  });
  it('the existing graph rules are untouched: graph.read, graph.strategy.declare and .link are still their prefix rules', () => {
    expect(pdp.evaluate(input('graph.strategy.declare', ['strategy_owner'])).decision).toBe('allow');
    expect(pdp.evaluate(input('graph.strategy.link', ['strategy_owner'])).decision).toBe('allow');
    expect(pdp.evaluate(input('graph.read', ['strategy_owner'])).obligations).toEqual([{ type: 'audit_access' }]);
    expect(pdp.evaluate(input('graph.read', ['executive'])).decision).toBe('deny');
  });
});

describe('B32 graph · the refusal rows (every port text through the mapper)', () => {
  const cases: Array<[string, string, number, string]> = [
    ['42501', 'strategy alignment rejected: recorded by the acting principal, never on behalf of another', 403, 'EYE-AUT-001'],
    ['42501', 'strategy measure rejected: a named, active human acts on the Strategy Graph\'s alignment, measures and authority', 403, 'EYE-AUT-001'],
    ['42501', `strategy authority rejected (not_eligible): principal ${X} holds none of executive, decision_authority, domain_admin, strategy_owner in this domain`, 403, 'EYE-AUT-001'],
    ['42501', `strategy authority rejected (separation): principal ${X} declared ${Y}; the declarer never records the authority act on it`, 403, 'EYE-AUT-001'],
    ['42501', `strategy owner rejected (not_authority): principal ${X} is neither the owner of ${Y} nor a strategy owner or domain administrator of this domain`, 403, 'EYE-AUT-001'],
    ['23503', `strategy alignment rejected (unknown_object): no strategy object ${X} in this domain`, 404, 'EYE-STA-001'],
    ['23503', `strategy alignment rejected (unknown_evidence): no claim ${X} in this domain`, 404, 'EYE-STA-001'],
    ['23503', `strategy alignment rejected (unknown_alignment): no alignment ${X} in this domain`, 404, 'EYE-STA-001'],
    ['23503', `strategy measure rejected (unknown_measure): no measure is defined for ${X} in this domain`, 404, 'EYE-STA-001'],
    ['23503', `strategy measure rejected (unknown_source): no evidence ${X} in this domain`, 404, 'EYE-STA-001'],
    ['23503', `strategy authority rejected (unknown_subject): no strategy ${X} in this domain`, 404, 'EYE-STA-001'],
    ['23503', `strategy owner rejected (unknown_object): no strategy object ${X} in this domain`, 404, 'EYE-STA-001'],
    ['22023', `strategy alignment rejected (inactive): ${X} is active and ${Y} is closed; only active strategy objects are aligned`, 409, 'EYE-STA-002'],
    ['22023', `strategy alignment rejected (duplicate): alignment ${X} already records this supports alignment; retire it before declaring another`, 409, 'EYE-STA-002'],
    ['22023', `strategy alignment rejected (retired): alignment ${X} was retired at 2026-09-28`, 409, 'EYE-STA-002'],
    ['22023', `strategy measure rejected (value_conflict): observation ${X} already records 94 for this instant and source; a different value is a correction of the source, not a second observation`, 409, 'EYE-STA-002'],
    ['22023', `strategy measure rejected (source_withdrawn): claim ${X} is withdrawn; a withdrawn object is no source for a measure`, 409, 'EYE-STA-002'],
    ['22023', `strategy authority rejected (missing_owner): ${X} has no active human owner; an owner is assigned first (graph.assign_strategy_owner)`, 409, 'EYE-STA-002'],
    ['22023', `strategy authority rejected (stale_digest): the approver read ${'a'.repeat(64)}; ${X} is now version 2 (${'b'.repeat(64)})`, 409, 'EYE-STA-002'],
    ['22023', `strategy authority rejected (duplicate): act ${X} already records this approver's set_objective on this version`, 409, 'EYE-STA-002'],
    ['22023', `strategy owner rejected (unchanged): ${X} already owns ${Y}`, 409, 'EYE-STA-002'],
    ['22023', `strategy measure rejected (inactive): measure ${X} is closed; an inactive measure is not observed`, 409, 'EYE-STA-002'],
    ['22023', 'strategy alignment rejected (kind): aligns is not an alignment kind (supports, builds, resources, measures, affects, conflicts_with)', 422, 'EYE-REQ-001'],
    ['22023', `strategy alignment rejected (endpoint): a supports alignment runs from an objective (OBJ) to the capability (CAP) it needs; ${X} is INI and ${Y} is CAP`, 422, 'EYE-REQ-001'],
    ['22023', `strategy measure rejected (not_a_measure): ${X} is CAP; a measure is defined on an MSR object`, 422, 'EYE-REQ-001'],
    ['22023', 'strategy measure rejected (observed_at): an observation names the instant it was observed, never a future one', 422, 'EYE-REQ-001'],
    ['22023', `strategy authority rejected (subject): set_objective names ${X} (a CAP); set_objective names an objective, approve_tradeoff a conflicts_with alignment, allocate_resource a resources alignment`, 422, 'EYE-REQ-001'],
    ['22023', 'strategy authority rejected (expiry): an act expires after now and within 366 days', 422, 'EYE-REQ-001'],
    ['22023', `strategy owner rejected (owner): ${X} is not an active human holding strategy_owner, domain_admin, executive, decision_owner or decision_authority in this domain`, 422, 'EYE-REQ-001'],
  ];
  it('403 → 404 → 409 → 422, each text answered by its own row with the port\'s own words', () => {
    for (const [code, message, st, c] of cases) {
      const a = answer(code, message);
      expect(a, message).not.toBeNull();
      expect(a!.status, message).toBe(st);
      expect(a!.code, message).toBe(c);
      expect(a!.message, message).toBe(message);
    }
  });
});

describe('B32 graph · the route intakes', () => {
  it('an alignment: kind, ends, strength, rationale, evidence', () => {
    expect(validateAlignment({ kind: 'supports', from: X, to: Y, rationale: 'the objective needs it', evidence: [{ kind: 'claim', id: X }] }, 'c'))
      .toEqual({ kind: 'supports', from: X, to: Y, strength: 'moderate', rationale: 'the objective needs it', evidence: [{ kind: 'claim', id: X }] });
    expect(status(() => validateAlignment({ kind: 'aligns', from: X, to: Y, rationale: 'the objective needs it' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^kind must be one of/) });
    expect(status(() => validateAlignment({ kind: 'supports', from: 'x', to: Y, rationale: 'the objective needs it' }, 'c')).status).toBe(422);
    expect(status(() => validateAlignment({ kind: 'supports', from: X, to: Y, rationale: 'short' }, 'c')).status).toBe(422);
    expect(status(() => validateAlignment({ kind: 'supports', from: X, to: Y, rationale: 'the objective needs it', evidence: [{ kind: 'entity', id: X }] }, 'c')).status).toBe(422);
  });
  it('a measure, an observation, an authority act, an owner transfer, an instant', () => {
    expect(validateMeasure({ objectiveId: X, unit: 'percent', direction: 'higher_better', targetValue: 95, freshnessDays: 7 }, 'c')).toMatchObject({ targetDate: null, freshnessDays: 7 });
    expect(status(() => validateMeasure({ objectiveId: X, unit: 'percent', direction: 'up', targetValue: 95, freshnessDays: 7 }, 'c')).status).toBe(422);
    expect(status(() => validateMeasure({ objectiveId: X, unit: 'percent', direction: 'higher_better', targetValue: 95, freshnessDays: 0 }, 'c')).status).toBe(422);
    expect(validateObservation({ value: '93.5', observedAt: '2026-09-27T10:00:00Z', source: { kind: 'claim', id: X } }, 'c')).toMatchObject({ value: 93.5, sourceKind: 'claim' });
    expect(status(() => validateObservation({ value: 93.5, observedAt: 'yesterday', source: { kind: 'claim', id: X } }, 'c')).status).toBe(422);
    expect(status(() => validateObservation({ value: 93.5, observedAt: '2026-09-27T10:00:00Z' }, 'c')).message).toMatch(/an observation names its source/);
    const digest = 'a'.repeat(64);
    expect(validateAuthority({ actKind: 'set_objective', subjectDigest: digest, rationale: 'the board set it', expiresAt: '2027-01-01T00:00:00Z' }, 'c')).toMatchObject({ decision: 'approve' });
    expect(validateAuthority({ subjectDigest: digest, rationale: 'the board set it', expiresAt: '2027-01-01T00:00:00Z' }, 'c', 'approve_measure').actKind).toBe('approve_measure');
    expect(status(() => validateAuthority({ actKind: 'commit', subjectDigest: digest, rationale: 'the board set it', expiresAt: '2027-01-01T00:00:00Z' }, 'c')).status).toBe(422);
    expect(status(() => validateAuthority({ actKind: 'set_objective', subjectDigest: 'x', rationale: 'the board set it', expiresAt: '2027-01-01T00:00:00Z' }, 'c')).status).toBe(422);
    expect(Object.keys(SUBJECT_OF)).toEqual([...AUTHORITY_ACTS]);
    expect(validateOwner({ ownerPrincipalId: X, reason: 'the planner takes it' }, 'c')).toEqual({ owner: X, reason: 'the planner takes it' });
    expect(status(() => validateOwner({ ownerPrincipalId: X, reason: 'short' }, 'c')).status).toBe(422);
    expect(atOf('2026-09-28T10:00:00+02:00', 'c')).toBe('2026-09-28T08:00:00.000Z');
    expect(status(() => atOf('soon', 'c')).status).toBe(422);
  });
});

describe('B32 graph · the new buckets of the walk and of GraphChanged', () => {
  const o = (id: string, t: string) => ({ strategy_object_id: id, object_type: t, title: t, reached_via: 'v', hop: 1 });
  const walked = { assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], reachedClaims: ['c'], truncated: false };
  it('an empty bucket is ABSENT from the event (every earlier payload shape unchanged); a reached one is present', () => {
    expect(Object.keys(reachOf(walked)).sort()).toEqual(['assumptions', 'briefings', 'claims', 'commitments', 'decisions', 'evidence', 'forecasts', 'memoryItems', 'objectives', 'scenarios', 'simulations', 'truncated', 'twins', 'walked', 'warnings']);
    expect(reachOf({ ...walked, capabilities: [], initiatives: [] })).not.toHaveProperty('capabilities');
    const r = reachOf({ ...walked, capabilities: [o(X, 'CAP')], exposures: [o(Y, 'RSK')] });
    expect(r.capabilities).toEqual([X]);
    expect(r.exposures).toEqual([Y]);
    expect(r).not.toHaveProperty('initiatives');
  });
  it('strategyNodesOf lists the six types for graph.record_impact, each with its type', () => {
    expect(strategyNodesOf({ capabilities: [o(X, 'CAP')], measures: [o(Y, 'MSR')] }).map((x) => x.object_type)).toEqual(['CAP', 'MSR']);
    expect(strategyNodesOf({})).toEqual([]);
  });
});
