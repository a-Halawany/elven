/**
 * CP-6 B34 (0090, part `exposures`) · hermetic: the remainder's PDP rules (the activation, the scenario link, the outcome review, the
 * owner resolution — each human-gated, each its named roles), the refusal rows of the new ports' texts and of the re-declared ports'
 * B32-phrased refusals (403 → 404 → 409 → 422 — each text through the mapper, so no earlier row swallows one), the intakes, the
 * ExposureChanged@v1 payload, the response monitor, the gaps a detection adds, and the RSK polarity on the strategy intake.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { EXPOSURE_CHANGE_KINDS } from '../../src/executive/attention/signal-contracts.js';
import { EXPOSURE_EVENT_OF, exposureChangedPayload } from '../../src/prediction/exposures/exposure-events.js';
import { gapsOf, responseMonitor, validateActivate, validateOutcomeReview, validateOwnerResolve, validateScenarioLink } from '../../src/prediction/exposures/exposures.service.js';
import { validateStrategy } from '../../src/graph/strategy/strategy.service.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const X = '0193a3d0-0000-7000-8000-0000000000cc';
const input = (action: string, roles: string[], kind: 'human' | 'agent' = 'human'): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'agent' ? 'agent_grant' : 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action, objectType: 'RSK', objectId: null, purposeId: 'prediction',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
} as PolicyInput);
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), message: String((r.getResponse() as { message?: string }).message) };
};
const status = (f: () => unknown): number => { try { f(); return 0; } catch (e) { return (e as HttpException).getStatus(); } };

describe('B34 exposures · the PDP', () => {
  const pdp = new PdpService();
  const gated = (action: string, role: string) => {
    const r = pdp.evaluate(input(action, [role]));
    return r.decision === 'allow_with_obligations' && r.obligations.some((o) => o.type === 'human_gate');
  };
  it('the activation: the executive, a domain administrator — human-gated; the analyst, a risk owner and an agent denied', () => {
    for (const role of ['executive', 'domain_admin']) expect(gated('prediction.exposure.taxonomy.activate', role), role).toBe(true);
    for (const role of ['domain_analyst', 'risk_owner', 'opportunity_sponsor']) expect(pdp.evaluate(input('prediction.exposure.taxonomy.activate', [role])).decision, role).toBe('deny');
    expect(pdp.evaluate(input('prediction.exposure.taxonomy.activate', ['risk_agent'], 'agent')).decision).toBe('deny');
  });
  it('the outcome review is the risk owner\'s or the sponsor\'s; the owner resolution a domain administrator\'s; the scenario link an analyst\'s or an owner\'s', () => {
    for (const role of ['risk_owner', 'opportunity_sponsor']) expect(gated('prediction.exposure.outcome.review', role), role).toBe(true);
    for (const role of ['domain_admin', 'executive', 'domain_analyst']) expect(pdp.evaluate(input('prediction.exposure.outcome.review', [role])).decision, role).toBe('deny');
    expect(gated('prediction.exposure.owner.resolve', 'domain_admin')).toBe(true);
    for (const role of ['risk_owner', 'executive', 'domain_analyst']) expect(pdp.evaluate(input('prediction.exposure.owner.resolve', [role])).decision, role).toBe('deny');
    for (const role of ['domain_analyst', 'risk_owner', 'opportunity_sponsor', 'strategy_owner']) expect(gated('prediction.exposure.scenario.link', role), role).toBe(true);
    expect(pdp.evaluate(input('prediction.exposure.scenario.link', ['collection_manager'])).decision).toBe('deny');
    for (const action of ['prediction.exposure.outcome.review', 'prediction.exposure.owner.resolve', 'prediction.exposure.scenario.link'])
      expect(pdp.evaluate(input(action, ['risk_agent', 'opportunity_agent'], 'agent')).decision, action).toBe('deny');
  });
});

describe('B34 exposures · the refusal rows', () => {
  it('the new ports\' texts and the re-declared ports\' B32 phrases: 403 → 404 → 409 → 422', () => {
    const rows: Array<[string, string, number]> = [
      ['42501', 'risk taxonomy activation rejected: recorded by the acting principal', 403],
      ['42501', 'risk taxonomy activation rejected: a taxonomy is activated by a named, active member', 403],
      ['42501', 'risk taxonomy activation rejected (separation): the publisher of version 2 does not activate it — a second named human does', 403],
      ['42501', 'exposure scenario link rejected: a link is a named, active member\'s act', 403],
      ['42501', 'exposure outcome review rejected: an outcome is reviewed by the exposure\'s owner (x) or its sponsor, a named, active member', 403],
      ['42501', 'exposure owner resolution rejected: an owner is resolved by a named, active domain administrator', 403],
      ['23503', 'risk taxonomy activation rejected: no such taxonomy version 9 in this domain', 404],
      ['23503', `exposure scenario link rejected: no such scenario ${X} in this domain`, 404],
      ['23503', `exposure outcome review rejected: no such response ${X} of exposure ${X}`, 404],
      ['23503', `exposure owner resolution rejected: no such exposure ${X} in this domain`, 404],
      ['22023', 'risk taxonomy activation rejected (already_active): version 2 is in force; version 2 is the one in force', 409],
      ['22023', 'risk taxonomy activation rejected (superseded): version 2 is in force; version 1 is older', 409],
      ['22023', `exposure scenario link rejected (duplicate): scenario ${X} is linked to exposure ${X} already`, 409],
      ['22023', `exposure scenario link rejected (closed): exposure ${X} was closed at now`, 409],
      ['22023', 'exposure outcome review rejected (no_outcome): the response\'s decision (package x) has recorded no outcome', 409],
      ['22023', 'exposure outcome review rejected (already_reviewed): every outcome of the response\'s decision is reviewed already', 409],
      ['22023', 'exposure owner resolution rejected (not_needed): the owner x is a named, active risk owner', 409],
      ['22023', `exposure acceptance rejected (state): exposure ${X} is HELD — it rests on ASU x (invalidated)`, 409],
      ['22023', `exposure sponsorship rejected (state): exposure ${X} is HELD — it rests on ASU x (invalidated)`, 409],
      ['22023', 'exposure owner resolution rejected (owner): x is not a named, active risk owner of this domain', 422],
      ['22023', 'exposure outcome review rejected: a review records its lesson (16+ characters)', 422],
      ['22023', 'risk taxonomy activation rejected: an activation states its reason (8+ characters)', 422],
      ['22023', `exposure rejected (polarity): RSK ${X} is declared a opportunity on its canonical object; it is not registered as a risk`, 422],
      ['22023', 'exposure assessment rejected: the triangular likelihood contradicts the bracket [0.3, 0.6]', 422],
      ['23503', `exposure assessment rejected: no such exposure ${X} in this domain (a second-order effect names another exposure)`, 404],
      ['22023', 'exposure rejected (no_taxonomy): this domain has no risk taxonomy in force; an exposure is filed under a category of an activated version', 409],
    ];
    for (const [code, message, want] of rows) expect(answer(code, message)?.status, message).toBe(want);
  });
});

describe('B34 exposures · the intakes', () => {
  it('refuse a malformed request (422) before any port', () => {
    expect(status(() => validateActivate({ version: 0, reason: 'a reason here' }, 'c'))).toBe(422);
    expect(status(() => validateActivate({ version: 2, reason: 'short' }, 'c'))).toBe(422);
    expect(validateActivate({ version: 2, reason: 'reviewed and needed' }, 'c')).toEqual({ version: 2, reason: 'reviewed and needed' });
    expect(status(() => validateScenarioLink({ scenarioId: X, relation: 'causes', rationale: 'a rationale' }, 'c'))).toBe(422);
    expect(validateScenarioLink({ scenarioId: X, relation: 'stresses', rationale: 'a rationale' }, 'c').relation).toBe('stresses');
    expect(status(() => validateOutcomeReview({ responseId: X, effect: 'effective', residualVerdict: 'maybe', lesson: 'a sixteen-char lesson' }, 'c'))).toBe(422);
    expect(status(() => validateOutcomeReview({ responseId: X, effect: 'effective', residualVerdict: 'stands', lesson: 'too short' }, 'c'))).toBe(422);
    expect(status(() => validateOwnerResolve({ owner: 'nope', reason: 'a reason here' }, 'c'))).toBe(422);
  });
  it('the RSK polarity: stated on an RSK only, risk or opportunity; written only when stated', () => {
    const base = { objectType: 'RSK', title: 'A risk', statement: 'A statement', restsOn: [{ kind: 'strategy', id: X, rationale: 'the reason it rests' }] };
    expect(validateStrategy({ ...base, polarity: 'opportunity' } as never, 'c').polarity).toBe('opportunity');
    expect('polarity' in validateStrategy(base as never, 'c')).toBe(false);
    expect(status(() => validateStrategy({ ...base, objectType: 'OBJ', polarity: 'risk' } as never, 'c'))).toBe(422);
    expect(status(() => validateStrategy({ ...base, polarity: 'both' } as never, 'c'))).toBe(422);
  });
});

describe('B34 exposures · the event, the monitor, the gaps', () => {
  it('ExposureChanged@v1: every kind of the contract maps to an exposure.* event; the payload is the contract\'s', () => {
    expect(Object.keys(EXPOSURE_EVENT_OF).sort()).toEqual([...EXPOSURE_CHANGE_KINDS].sort());
    const p = exposureChangedPayload({ exposure_id: X, polarity: 'risk', category_key: 'supply_chain', owner_principal_id: T, sponsor_principal_id: null, state: 'accepted', accepted_version: 3 },
      { event_id: D, occurred_at: '2026-09-28T10:00:00.000Z', details: { version: 2 } }, [T], 'assessment_accepted', { action: 'prediction.exposure.accept', actor: T });
    expect(p).toEqual({ schema: 'ExposureChanged', schema_version: 1, temporal: { known_at: '2026-09-28T10:00:00.000Z' },
      cause: { action: 'prediction.exposure.accept', actor: T, target_type: 'RSK', target_id: X }, exposure_id: X, polarity: 'risk', category_key: 'supply_chain', version: 2,
      change: { kind: 'assessment_accepted', event_id: D }, owner: T, sponsor: null, state: 'accepted', objectives: [T] });
    expect(exposureChangedPayload({ exposure_id: X, polarity: 'risk', category_key: 'k', owner_principal_id: T, state: 'closed', accepted_version: null },
      { event_id: D, occurred_at: new Date(0), details: {} }, [], 'closed', { action: 'a', actor: T }).version).toBeNull();
  });
  it('the response monitor says where the decision stands and what is owed', () => {
    expect(responseMonitor('draft', 0, 0).state).toBe('decision_open');
    expect(responseMonitor('committed', 0, 0).state).toBe('monitoring');
    expect(responseMonitor('monitoring', 2, 1)).toMatchObject({ state: 'outcome_recorded' });
    expect(responseMonitor('closed', 1, 1)).toEqual({ state: 'reviewed', owed: null });
    expect(responseMonitor('closed', 0, 0).state).toBe('closed_without_outcome');
  });
  it('a hold, an unresolved owner and an unreviewed outcome are gaps; false precision and unclassified options are not', () => {
    const base = { state: 'accepted', accepted_version: 1, current_version: 1, accepted_at: new Date().toISOString(), review_every_days: null };
    expect(gapsOf({ ...base, detections: [{ kind: 'false_precision' }, { kind: 'options_unclassified' }] })).toEqual([]);
    expect(gapsOf({ ...base, detections: [{ kind: 'held' }, { kind: 'owner_unresolved' }, { kind: 'outcome_unreviewed' }] }))
      .toEqual(['held (an invalidated dependency)', 'owner unresolved (routed to a domain administrator)', 'an outcome recorded, not yet reviewed']);
  });
});
