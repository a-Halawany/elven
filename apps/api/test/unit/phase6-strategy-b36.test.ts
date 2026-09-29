/**
 * CP-6 B36 (0094 §S, part `strategy`) — the PURE parts: the refusal families mapped (every text of the four families through the mapper,
 * B9's order), the PDP rows (exact, human-gated, the roles), the three GraphChanged kinds and the event built pure from a port's answer,
 * the intakes' plain-word refusals, the tick step's place (after the commitment sweep), the widened input kinds.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { GRAPH_CHANGE_KINDS } from '../../src/graph/subscriptions/graph-change.js';
import { strategyChangedEvent } from '../../src/graph/subscriptions/change-events.js';
import { DETECTION_KINDS, REVOCATION_CHANGE_KIND, STRATEGY_DETECTIONS_ORDER, STRATEGY_DETECTIONS_STEP, validateRevocation } from '../../src/graph/strategy/detections.service.js';
import { COMMITMENT_DEADLINES_STEP } from '../../src/decision/commitments/commitment.service.js';
import { INPUT_KINDS } from '../../src/executive/health/health.service.js';
import { EXCEPTION_KINDS, HEALTH_SNAPSHOT_SIGNATURE_KIND, validateExceptionDecision, validateExceptionRequest, validateSetInput, validateSnapshotApproval } from '../../src/executive/health/health-inputs.service.js';

const ID = '0190b1c2-d3e4-7000-8000-000000000361';
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  const b = r?.getResponse() as { code: string; message: string };
  expect(b.code, m).toBe(body);
  expect(b.message, m).toBe(m);
};
const status422 = (f: () => unknown, re: RegExp): void => {
  try { f(); throw new Error('the intake should have refused'); } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(422);
    expect(String(((e as HttpException).getResponse() as { message?: string }).message)).toMatch(re);
  }
};

describe('B36 strategy · the refusal families (0094 §S) through the mapper, B9\'s order', () => {
  it('the standing 403: the acting principal, the ownership, the separation, the revocation\'s authority', () => {
    answer('42501', 'health input rejected (actor): recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'health input rejected (ownership): component on_time is restated by the owner of its input only (the owner of MSR "x"); principal y is not', 403, 'EYE-AUT-001');
    answer('42501', 'health exception rejected (separation): the requester does not decide their own exception', 403, 'EYE-AUT-001');
    answer('42501', 'health approval rejected (actor): recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'strategy revocation rejected: recorded by the acting principal, never on behalf of another', 403, 'EYE-AUT-001');
    answer('42501', 'strategy revocation rejected (not_authority): act a was recorded by b; its issuer or a domain administrator revokes it', 403, 'EYE-AUT-001');
  });
  it('the absences 404', () => {
    answer('23503', 'health input rejected (unknown_component): the active definition (version 1) has no component z', 404, 'EYE-STA-001');
    answer('23503', 'health exception rejected (unknown_exception): no exception x in this domain', 404, 'EYE-STA-001');
    answer('23503', 'health approval rejected (unknown_snapshot): no snapshot x in this domain', 404, 'EYE-STA-001');
    answer('23503', 'strategy revocation rejected (unknown_act): no authority act x in this domain', 404, 'EYE-STA-001');
  });
  it('the record\'s state 409', () => {
    answer('22023', 'health input rejected (no_definition): no approved definition is active in this domain; an input belongs to a component of the active definition', 409, 'EYE-STA-002');
    answer('22023', 'health exception rejected (pending): a exclude exception for component x awaits a decision', 409, 'EYE-STA-002');
    answer('22023', 'health exception rejected (state): exception x is approved; only a requested exception is decided', 409, 'EYE-STA-002');
    answer('22023', 'health exception rejected (expired): exception x expired at t before it was decided', 409, 'EYE-STA-002');
    answer('22023', 'health approval rejected (stale_digest): the approver previewed a; snapshot s records b', 409, 'EYE-STA-002');
    answer('22023', 'health approval rejected (state): snapshot s is an as_of replay; only a current snapshot is accepted', 409, 'EYE-STA-002');
    answer('22023', 'health approval rejected (duplicate): snapshot s is already accepted by this principal', 409, 'EYE-STA-002');
    answer('22023', 'strategy revocation rejected (revoked): act a was revoked at t by b', 409, 'EYE-STA-002');
    answer('22023', 'strategy revocation rejected (lapsed): act a expired at t; a lapsed act is not revoked', 409, 'EYE-STA-002');
  });
  it('the caller\'s own request 422 — and the B32 families are untouched by the new rows', () => {
    answer('22023', 'health input rejected (reason): a reason of 8 to 2000 characters says why the reading is restated', 422, 'EYE-REQ-001');
    answer('22023', 'health input rejected (value): a finite number', 422, 'EYE-REQ-001');
    answer('22023', 'health exception rejected (kind): exclude (the component left out for the period) or relax_bound (its freshness bound relaxed)', 422, 'EYE-REQ-001');
    answer('22023', 'health exception rejected (expiry): an exception expires after now and within 366 days', 422, 'EYE-REQ-001');
    answer('22023', 'health approval rejected (digest): the approval names the result digest previewed (64 hex)', 422, 'EYE-REQ-001');
    answer('22023', 'strategy revocation rejected (reason): a reason of 8 to 2000 characters says why the act is revoked', 422, 'EYE-REQ-001');
    // B32's rows still answer their own families (no new row is a prefix of them)
    answer('22023', 'health score rejected (no_definition): no approved definition is active in this domain; one person proposes a definition and another approves it', 409, 'EYE-STA-002');
    answer('22023', 'strategy authority rejected (stale_digest): the approver read a; b is now version 2 (c)', 409, 'EYE-STA-002');
  });
});

describe('B36 strategy · the PDP rows: exact, human-gated, the roles', () => {
  const pdp = new PdpService();
  const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
  const decide = (action: string, role: string, scope: 'DOMAIN' | 'TENANT' = 'DOMAIN') => pdp.evaluate({ action, principal: { principalId: ID, kind: 'human', assurance: 'password',
    bindings: [{ roleCode: role, scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null }] }, delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive',
    consequenceClass: 'C2', objectType: 'HSD', objectId: null, environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
  it('setting an input: the owning roles, human-gated; agents and auditors denied (the PORT admits the derived owner alone)', () => {
    for (const role of ['executive', 'domain_admin', 'strategy_owner', 'decision_owner', 'risk_owner', 'domain_analyst']) expect(decide('executive.health.input.set', role).obligations, role).toEqual([{ type: 'human_gate' }]);
    for (const role of ['auditor', 'risk_agent', 'attention_agent', 'executive_operator', 'board_member']) expect(decide('executive.health.input.set', role).decision, role).toBe('deny');
  });
  it('an exception: requested by the domain\'s people, decided by the executive\'s authority; a snapshot accepted by the executive', () => {
    for (const role of ['executive', 'strategy_owner', 'risk_owner']) expect(decide('executive.health.exception.request', role).obligations, role).toEqual([{ type: 'human_gate' }]);
    for (const role of ['executive', 'domain_admin']) expect(decide('executive.health.exception.approve', role).obligations, role).toEqual([{ type: 'human_gate' }]);
    for (const role of ['strategy_owner', 'domain_analyst', 'decision_owner', 'executive_operator']) expect(decide('executive.health.exception.approve', role).decision, role).toBe('deny');
    expect(decide('executive.health.snapshot.approve', 'executive').obligations).toEqual([{ type: 'human_gate' }]);
    for (const role of ['domain_admin', 'strategy_owner', 'executive_operator', 'board_member', 'attention_agent']) expect(decide('executive.health.snapshot.approve', role).decision, role).toBe('deny');
  });
  it('revoking an authority act: the planning authority, human-gated; the act rule of B32 unchanged', () => {
    for (const role of ['executive', 'decision_authority', 'domain_admin', 'strategy_owner']) expect(decide('graph.strategy.authority.revoke', role).obligations, role).toEqual([{ type: 'human_gate' }]);
    for (const role of ['domain_analyst', 'decision_owner', 'attention_agent', 'executive_operator']) expect(decide('graph.strategy.authority.revoke', role).decision, role).toBe('deny');
    expect(decide('graph.strategy.authority.act', 'executive').obligations).toEqual([{ type: 'human_gate' }]);
    expect(decide('executive.attention.tick', 'attention_agent').decision).toBe('allow');
  });
});

describe('B36 strategy · GraphChanged on strategy changes; the tick step; the vocabularies', () => {
  it('the three kinds are subscribable change kinds; the event is built pure, no walk, the typed block', () => {
    for (const k of ['strategy.alignment_changed', 'strategy.measure_changed', 'strategy.owner_changed']) expect(GRAPH_CHANGE_KINDS as readonly string[]).toContain(k);
    const ev = strategyChangedEvent({ kind: 'strategy.alignment_changed', subjectKind: 'alignment', subjectId: ID, subjectType: 'supports', change: 'alignment.declared', objectiveIds: ['o1', 'o1', 'o2', ''],
      subscriptions: [{ subscription_id: 's', consumer_kind: 'commitments' }], actor: 'p', action: 'graph.alignment.declare', targetType: 'ALN', occurredAt: '2026-09-30T00:00:00.000Z' });
    expect(ev.eventType).toBe('GraphChanged');
    expect(ev.payload).toMatchObject({ schema: 'GraphChanged', change: { kind: 'strategy.alignment_changed', occurred_at: '2026-09-30T00:00:00.000Z' }, identities: [], objects: { objectives: ['o1', 'o2'], walked: false },
      cause: { action: 'graph.alignment.declare', actor: 'p', target_type: 'ALN', target_id: ID }, strategy: { subject_kind: 'alignment', subject_id: ID, subject_type: 'supports', change: 'alignment.declared', objective_ids: ['o1', 'o2'], act_id: null, owner_from: null, owner_to: null, reason: null } });
    const ow = strategyChangedEvent({ kind: 'strategy.owner_changed', subjectKind: 'strategy_object', subjectId: ID, subjectType: 'CAP', change: 'owner.assigned', objectiveIds: [], ownerFrom: 'a', ownerTo: 'b', reason: 'why', subscriptions: [], actor: 'p', action: 'graph.strategy.owner.assign', targetType: 'OBJ' });
    expect((ow.payload as { strategy: Record<string, unknown> }).strategy).toMatchObject({ owner_from: 'a', owner_to: 'b', reason: 'why' });
  });
  it('a revocation announces by the act\'s subject; set_objective announces nothing', () => {
    expect(REVOCATION_CHANGE_KIND['measure']).toBe('strategy.measure_changed');
    expect(REVOCATION_CHANGE_KIND['alignment']).toBe('strategy.alignment_changed');
    expect(REVOCATION_CHANGE_KIND['strategy']).toBeNull();
  });
  it('the tick step runs after the commitment sweep (order 45); the four detection kinds; the eight input kinds; the signature kind', () => {
    expect(STRATEGY_DETECTIONS_STEP).toBe('strategy-detections');
    expect(STRATEGY_DETECTIONS_ORDER).toBe(50);
    expect(COMMITMENT_DEADLINES_STEP).toBe('commitment-deadlines');
    expect([...DETECTION_KINDS]).toEqual(['stale_measure', 'gamed_measure', 'lost_linkage', 'owner_missing']);
    expect([...INPUT_KINDS]).toEqual(['indicator', 'measure', 'risk', 'opportunity', 'capability', 'execution', 'outcome', 'quality']);
    expect([...EXCEPTION_KINDS]).toEqual(['exclude', 'relax_bound']);
    expect(HEALTH_SNAPSHOT_SIGNATURE_KIND).toBe('health_snapshot');
  });
  it('the intakes refuse a malformed request in plain words (422) and decide no rule a port decides', () => {
    status422(() => validateSetInput({ component_key: 'On Time', value: 1, reason: 'a reason of length' }, 'c'), /component_key names a component/);
    status422(() => validateSetInput({ component_key: 'on_time', value: 'many', reason: 'a reason of length' }, 'c'), /value is the restated reading/);
    status422(() => validateSetInput({ component_key: 'on_time', value: 1, reason: 'short' }, 'c'), /reason says why/);
    expect(validateSetInput({ component_key: 'on_time', value: '96', reason: ' the Q3 figure restated ' }, 'c')).toEqual({ componentKey: 'on_time', value: 96, reason: 'the Q3 figure restated' });
    status422(() => validateExceptionRequest({ component_key: 'on_time', kind: 'skip', reason: 'a reason of length', expires_at: '2027-01-01T00:00:00Z' }, 'c'), /kind is one of exclude, relax_bound/);
    status422(() => validateExceptionRequest({ component_key: 'on_time', kind: 'exclude', relaxed_stale_after_days: 3, reason: 'a reason of length', expires_at: '2027-01-01T00:00:00Z' }, 'c'), /exclude names none/);
    status422(() => validateExceptionRequest({ component_key: 'on_time', kind: 'relax_bound', reason: 'a reason of length', expires_at: '2027-01-01T00:00:00Z' }, 'c'), /relax_bound names payload\.relaxed_stale_after_days/);
    status422(() => validateExceptionRequest({ component_key: 'on_time', kind: 'exclude', reason: 'a reason of length', expires_at: 'soon' }, 'c'), /expires_at is the instant/);
    expect(validateExceptionRequest({ component_key: 'on_time', kind: 'relax_bound', relaxed_stale_after_days: '30', reason: 'a reason of length', expires_at: '2027-01-01T00:00:00Z' }, 'c')).toMatchObject({ kind: 'relax_bound', relaxedDays: 30, expiresAt: '2027-01-01T00:00:00.000Z' });
    status422(() => validateExceptionDecision({ decision: 'maybe', note: 'a note of length' }, 'c'), /decision is approve or refuse/);
    status422(() => validateSnapshotApproval({ result_digest: 'abc', note: 'a note of length' }, 'c'), /result_digest is the result digest/);
    expect(validateSnapshotApproval({ result_digest: 'A'.repeat(64), note: 'accepted for the review' }, 'c')).toEqual({ digest: 'a'.repeat(64), note: 'accepted for the review' });
    status422(() => validateRevocation({ reason: 'short' }, 'c'), /reason is 8 to 2000 characters/);
    expect(validateRevocation({ reason: '  the authority no longer stands ' }, 'c')).toEqual({ reason: 'the authority no longer stands' });
  });
});
