/*
 * CP-6 B23 (0084) part `attention` · the pure halves of L10-I02 MaterialChangeRaised, L10-I03 ReviewConvened and BRF@v2's attention
 * section: the event builders and the contracts the attention consumer reads (a payload that is not the contract is refused by the
 * reader — the consumer quarantines it), the confidence rule and the deadline arithmetic, the review's intake and digest, the
 * section's as-of reconstruction (state, policy version, bands, the material changes since the prior), the refusal rows of the two
 * review ports through the mapper (anchored; B9's order 403 → 404 → 409 → 422), the PDP's exact rules, and the consumer identities
 * that change with their methods (decisions, attention) — a new identity each, the other nine untouched.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { hoursToDeadline, materialChangeRaisedEvent, materialConfidence, readMaterialChange } from '../../src/decision/subscriptions/material-change.js';
import { readReviewConvened, reviewConvenedEvent, reviewDigest, validateConvene } from '../../src/executive/reviews/reviews.service.js';
import { attentionSection, confidenceBand, policyVersionAt, stateAsOf } from '../../src/executive/briefings/attention-section.js';
import { CONSUMER_EVENT_TYPES, CONSUMER_KINDS, FLAT_EVENT_TYPES, consumerCodeDigest } from '../../src/graph/subscriptions/graph-change.js';
import { SIGNAL_CLASSES } from '../../src/executive/attention/attention.service.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const PKG = '0190b1c2-d3e4-7000-8000-000000000101'; const OWNER = '0190b1c2-d3e4-7000-8000-000000000102'; const EVT = '0190b1c2-d3e4-7000-8000-000000000103';
const RVW = '0190b1c2-d3e4-7000-8000-000000000104'; const CHAIR = '0190b1c2-d3e4-7000-8000-000000000105'; const SUBJ = '0190b1c2-d3e4-7000-8000-000000000106';
const ACTOR = '0190b1c2-d3e4-7000-8000-000000000107'; const R1 = '0190b1c2-d3e4-7000-8000-000000000108'; const R2 = '0190b1c2-d3e4-7000-8000-000000000109';
const AT = new Date('2026-09-25T12:00:00.000Z');

const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  const b = r?.getResponse() as { code: string; message: string };
  expect(b.code, m).toBe(body);
  expect(b.message, m).toBe(m);
};

describe('B23 · MaterialChangeRaised@v1 — the builder and the contract', () => {
  const base = { packageId: PKG, version: 2, packageState: 'draft', title: 'Reroute', owner: OWNER, executed: false, disposition: 'human_review',
    trigger: { eventId: EVT, eventType: 'GraphChanged', changeKind: 'forecast.withdrawn', noteId: null, via: ['option x cites forecast y'] },
    basis: 'categorical_loss' as const, deadline: '2026-09-27', policyVersion: 3, note: 'forecast withdrawn', actor: ACTOR, occurredAt: AT };
  it('the dimensions follow the stated rules: C2 open / C3 executed, the confidence by basis, the hours to the deadline', () => {
    const e = materialChangeRaisedEvent(base);
    expect(e.eventType).toBe('MaterialChangeRaised');
    expect(e.payload).toMatchObject({ schema: 'MaterialChangeRaised', schema_version: 'v1', package_id: PKG, version: 2, owner: OWNER, executed: false, failure_class: 'material_change', disposition: 'human_review',
      dims: { consequence: 'C2', confidence: 1, hours_to_window: 36, basis: 'categorical_loss', decision_deadline: '2026-09-27' }, policy_version: 3,
      cause: { action: 'decision.subscription.apply', actor: ACTOR, target_type: 'DPK', target_id: PKG }, temporal: { known_at: AT.toISOString() } });
    expect(materialChangeRaisedEvent({ ...base, executed: true, disposition: 'compensation' }).payload['dims']).toMatchObject({ consequence: 'C3' });
    expect(materialChangeRaisedEvent({ ...base, deadline: null, policyVersion: null }).payload).toMatchObject({ dims: { hours_to_window: null }, policy_version: null });
    expect([materialConfidence('categorical_loss'), materialConfidence('measured'), materialConfidence('assessed_unfit'), materialConfidence('unmeasurable')]).toEqual([1, 1, 0.8, 0.5]);
    expect(hoursToDeadline('2026-09-24', AT)).toBe(-36);
    expect(hoursToDeadline('not a date', AT)).toBeNull();
  });
  it('the reader accepts the builder\'s payload and refuses what is not the contract (each reason named)', () => {
    const ok = readMaterialChange(materialChangeRaisedEvent(base).payload);
    expect(ok).toMatchObject({ packageId: PKG, owner: OWNER, executed: false, changeKind: 'forecast.withdrawn', triggerEventId: EVT, dims: { consequence: 'C2', confidence: 1, hours_to_window: 36 }, policyVersion: 3 });
    const p = materialChangeRaisedEvent(base).payload;
    expect(readMaterialChange({ ...p, schema: 'Other' })).toBe('not a MaterialChangeRaised@v1 payload');
    expect(readMaterialChange({ ...p, package_id: 'x' })).toBe('package_id is not a uuid');
    expect(readMaterialChange({ ...p, dims: null })).toBe('dims is not an object');
    expect(readMaterialChange({ ...p, dims: { consequence: 'C9', confidence: 1 } })).toBe('dims.consequence is not C0..C4');
    expect(readMaterialChange({ ...p, dims: { consequence: 'C2', confidence: 2 } })).toBe('dims.confidence is not a number in [0, 1]');
    expect(readMaterialChange({ ...p, policy_version: 'v3' })).toBe('policy_version is not an integer or null');
    expect(readMaterialChange({ ...p, owner: 'nobody' })).toBe('owner is not a principal id');
  });
});

describe('B23 · ReviewConvened@v1 — the intake, the digest, the builder and the contract', () => {
  const payload = { subject: { kind: 'decision', id: SUBJ, version: 2 }, question: 'Does the reroute still stand?', chair: CHAIR, reviewers: [R2, R1, R2], due_at: '2026-10-01T00:00:00Z', convene_key: 'k-1' };
  it('the intake normalises (reviewers sorted and de-duplicated) and refuses a malformed request (422)', () => {
    const i = validateConvene(payload, 'corr');
    expect(i).toMatchObject({ subjectKind: 'decision', subjectId: SUBJ, subjectVersion: 2, chair: CHAIR, reviewers: [R1, R2], dueAt: '2026-10-01T00:00:00.000Z', conveneKey: 'k-1', causeItemId: null, roomId: null });
    for (const bad of [{ ...payload, subject: { kind: 'forecast', id: SUBJ } }, { ...payload, subject: { kind: 'decision', id: 'x' } }, { ...payload, question: 'short' }, { ...payload, chair: 'nobody' },
      { ...payload, reviewers: ['x'] }, { ...payload, convene_key: '' }, { ...payload, due_at: 'tomorrow' }, { ...payload, subject: { kind: 'decision', id: SUBJ, version: 0 } }]) {
      let status = 0; try { validateConvene(bad as never, 'corr'); } catch (e) { status = (e as HttpException).getStatus(); }
      expect(status, JSON.stringify(bad)).toBe(422);
    }
  });
  it('the digest binds the content: the same review the same digest, any change another', () => {
    const d = reviewDigest(validateConvene(payload, 'corr'));
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(reviewDigest(validateConvene({ ...payload, reviewers: [R1, R2] }, 'corr'))).toBe(d);
    expect(reviewDigest(validateConvene({ ...payload, question: 'Does the reroute still stand now?' }, 'corr'))).not.toBe(d);
    expect(reviewDigest(validateConvene({ ...payload, convene_key: 'k-2' }, 'corr')), 'the key is not content').toBe(d);
  });
  it('the builder carries the port\'s answer; the reader refuses what is not the contract', () => {
    const review = { review_id: RVW, subject_kind: 'decision', subject_id: SUBJ, subject_version: 2, subject_title: 'Reroute', question: 'Does the reroute still stand?', chair: CHAIR, reviewers: [R1],
      due_at: new Date('2026-10-01T00:00:00Z'), convened_by: ACTOR, convened_at: AT, convene_key: 'k-1', request_digest: 'a'.repeat(64), cause_item_id: null, room_id: null };
    const e = reviewConvenedEvent({ review, actor: ACTOR });
    expect(e.payload).toMatchObject({ schema: 'ReviewConvened', schema_version: 'v1', review_id: RVW, subject: { kind: 'decision', id: SUBJ, version: 2, title: 'Reroute' }, chair: CHAIR, reviewers: [R1],
      due_at: '2026-10-01T00:00:00.000Z', cause: { action: 'executive.review.convene', actor: ACTOR, target_type: 'RVW', target_id: RVW } });
    expect(readReviewConvened(e.payload)).toMatchObject({ reviewId: RVW, subjectKind: 'decision', chair: CHAIR, dueAt: '2026-10-01T00:00:00.000Z' });
    expect(readReviewConvened({ ...e.payload, schema_version: 'v2' })).toBe('not a ReviewConvened@v1 payload');
    expect(readReviewConvened({ ...e.payload, subject: { kind: 'forecast', id: SUBJ } })).toBe('subject is not {kind, id} of a reviewable subject');
    expect(readReviewConvened({ ...e.payload, chair: 7 })).toBe('chair is not a principal id');
    expect(readReviewConvened({ ...e.payload, due_at: 'soon' })).toBe('due_at is not an instant or null');
  });
});

describe('B23 · BRF@v2 — the attention section as of known_at', () => {
  const ev = (item: string, event: string, at: string, details: Record<string, unknown> = {}, id = `${item}-${at}`) => ({ event_id: id, item_id: item, event, details, occurred_at: new Date(at) });
  it('the bands; the policy in force; the state after the log up to an instant', () => {
    expect([confidenceBand(0.95), confidenceBand(0.8), confidenceBand(0.5), confidenceBand(0.49), confidenceBand(null)]).toEqual(['high', 'high', 'medium', 'low', 'unknown']);
    const policies = [{ version: 1, effective_at: '2026-09-20T00:00:00Z', superseded_at: '2026-09-22T00:00:00Z' }, { version: 2, effective_at: '2026-09-22T00:00:00Z', superseded_at: null }];
    expect(policyVersionAt(policies, '2026-09-19T00:00:00.000Z')).toBeNull();
    expect(policyVersionAt(policies, '2026-09-21T00:00:00.000Z')).toBe(1);
    expect(policyVersionAt(policies, '2026-09-23T00:00:00.000Z')).toBe(2);
    const log = [ev('a', 'item.routed', '2026-09-24T10:00:00Z', { policy_version: 1 }), ev('a', 'item.acknowledged', '2026-09-24T11:00:00Z'), ev('a', 'item.suppressed', '2026-09-24T12:00:00Z'),
      ev('a', 'item.suppression_lapsed', '2026-09-24T13:00:00Z'), ev('a', 'item.reevaluated', '2026-09-24T14:00:00Z', { to_state: 'acknowledged', to_version: 2 }), ev('a', 'item.closed', '2026-09-24T15:00:00Z')];
    expect(stateAsOf(log, '2026-09-24T09:00:00.000Z')).toBeNull();
    expect(stateAsOf(log, '2026-09-24T10:30:00.000Z')).toEqual({ state: 'open', policy_version: 1, acknowledged: false });
    expect(stateAsOf(log, '2026-09-24T12:30:00.000Z')?.state).toBe('suppressed');
    expect(stateAsOf(log, '2026-09-24T13:30:00.000Z')?.state, 'a lapsed suppression of an acknowledged item returns it acknowledged').toBe('acknowledged');
    expect(stateAsOf(log, '2026-09-24T14:30:00.000Z')).toMatchObject({ state: 'acknowledged', policy_version: 2 });
    expect(stateAsOf(log, '2026-09-24T16:00:00.000Z')?.state).toBe('closed');
    expect(stateAsOf([ev('b', 'item.routed', '2026-09-24T10:00:00Z', { policy_version: 1 }), ev('b', 'item.escalated', '2026-09-24T11:00:00Z', { escalation: 1 }), ev('b', 'item.escalated', '2026-09-24T12:00:00Z', { exhausted: true })], '2026-09-24T13:00:00.000Z')?.state).toBe('escalated');
  });
  it('the section: live items with bands, every state counted, the material changes in (since, known_at] — deterministic', () => {
    const item = (id: string, cls: string, created: string, confidence: number | null) => ({ item_id: id, signal_class: cls, subject_kind: cls === 'decision.material_change' ? 'package' : 'review', subject_id: SUBJ, title: id, owner_principal_id: OWNER,
      evaluation: { dimensions: { consequence: 'C2', confidence, hours_to_window: 5 } }, created_at: new Date(created), cause_event_id: EVT });
    const items = [item('m1', 'decision.material_change', '2026-09-24T10:00:00Z', 1), item('m2', 'decision.material_change', '2026-09-24T12:00:00Z', 0.5), item('r1', 'review.convened', '2026-09-24T11:00:00Z', null)];
    const events = [ev('m1', 'item.routed', '2026-09-24T10:00:00Z', { policy_version: 1 }), ev('m1', 'item.closed', '2026-09-24T10:30:00Z'), ev('m2', 'item.routed', '2026-09-24T12:00:00Z', { policy_version: 1 }),
      ev('r1', 'item.deprioritized', '2026-09-24T11:00:00Z', { policy_version: 1 })];
    const s = attentionSection({ items, events, policies: [{ version: 1, effective_at: '2026-09-20T00:00:00Z', superseded_at: null }], knownAt: '2026-09-24T13:00:00.000Z', since: '2026-09-24T11:30:00.000Z' });
    expect(s.policy_version).toBe(1);
    expect(s.items.map((x) => [x['item_id'], x['state'], x['confidence_band']])).toEqual([['m2', 'open', 'medium']]);
    expect(s.counts).toMatchObject({ open: 1, closed: 1, deprioritized: 1 });
    expect(s.material_changes_since_prior.map((x) => x['item_id'])).toEqual(['m2']);
    const first = attentionSection({ items, events, policies: [], knownAt: '2026-09-24T13:00:00.000Z', since: null });
    expect(first.material_changes_since_prior.map((x) => [x['item_id'], x['state']])).toEqual([['m1', 'closed'], ['m2', 'open']]);
    expect(first.policy_version).toBeNull();
    expect(JSON.stringify(attentionSection({ items: [...items].reverse(), events: [...events].reverse(), policies: [], knownAt: '2026-09-24T13:00:00.000Z', since: null }))).toBe(JSON.stringify(first));
    const before = attentionSection({ items, events, policies: [], knownAt: '2026-09-24T10:15:00.000Z', since: null });
    expect(before.items.map((x) => [x['item_id'], x['state']]), 'm1 open then; m2 and r1 did not exist yet').toEqual([['m1', 'open']]);
  });
});

describe('B23 · the review ports\' refusals through the mapper (anchored; 403 → 404 → 409 → 422)', () => {
  it('the standing (403)', () => {
    for (const m of ['review convening rejected: convened by the acting principal', 'review convening rejected: a review is convened by a named human holding executive, strategy_owner, decision_owner, decision_authority, domain_admin, platform_admin',
      'review closure rejected: closed by the acting principal', `review closure rejected: a review is concluded by its chair (${CHAIR})`, `review closure rejected: a review is withdrawn by its convener (${ACTOR}) or its chair`]) answer('42501', m, 403, 'EYE-AUT-001');
  });
  it('the absences (404)', () => {
    for (const m of [`review convening rejected: no such decision ${SUBJ} in this domain`, `review convening rejected: no such outcome ${SUBJ} in this domain`, `review convening rejected: no such attention item ${SUBJ} in this domain`,
      `review convening rejected: no such room ${SUBJ} in this domain`, `review closure rejected: no such review ${RVW} in this domain`]) answer('23503', m, 404, 'EYE-STA-001');
  });
  it('the record\'s state (409)', () => {
    for (const m of ['review convening rejected: convene key k-1 was already used by this convener for a different review (digest aaaaaaaaaaaa recorded, bbbbbbbbbbbb offered); a new review takes a new key',
      `review convening rejected (stale_version): decision ${SUBJ} stands at version 3, the review names version 2`, `review closure rejected: review ${RVW} is withdrawn; only a convened review is concluded or withdrawn`]) answer('22023', m, 409, 'EYE-STA-002');
  });
  it('the caller\'s own request (422)', () => {
    for (const m of ['review convening rejected: the subject is an objective, decision, scenario, commitment or outcome (forecast)', 'review convening rejected: the question the review answers is 8–2000 characters',
      `review convening rejected: the chair ${CHAIR} is not an active human of this tenant`, `review convening rejected: reviewer ${R1} is not an active human of this tenant`, 'review convening rejected: the review is due after now and within a year',
      'review closure rejected: a closure carries a note of at least 8 characters (the conclusion, or why it is withdrawn)', 'review closure rejected: a review is concluded or withdrawn (archived)']) answer('22023', m, 422, 'EYE-REQ-001');
  });
});

describe('B23 · the vocabularies, the PDP rules and the consumer identities', () => {
  it('twelve subscribable types; the attention kind selects its six; seven signal classes', () => {
    expect(FLAT_EVENT_TYPES.slice(-2)).toEqual(['MaterialChangeRaised', 'ReviewConvened']);
    expect([...CONSUMER_EVENT_TYPES.attention]).toEqual(['ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged', 'MaterialChangeRaised', 'ReviewConvened']);
    expect([...CONSUMER_EVENT_TYPES.decisions]).toEqual(['GraphChanged', 'MemoryCorrected']);
    expect([...SIGNAL_CLASSES]).toEqual(['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened']);
  });
  it('the decisions and attention identities changed with their methods; all eleven distinct', () => {
    // the digests main (5165a97) serves — the B21/B22 unit file's pins (phase6-fitness-events-b21.test.ts DIGESTS_A2303FF.decisions)
    expect(consumerCodeDigest('decisions')).not.toBe('6e283700b3b7d74c0699e6c565a4da6c0558b015d749e6f8a6d56426b07b6e5f');
    expect(new Set(CONSUMER_KINDS.map((k) => consumerCodeDigest(k))).size).toBe(11);
  });
  it('the PDP: exact rules — convening human-gated for the six roles, an analyst refused, closing and reading open wider', () => {
    const pdp = new PdpService();
    const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
    const decide = (action: string, role: string) => pdp.evaluate({ action, principal: { principalId: ACTOR, kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] },
      delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive', consequenceClass: 'C2', objectType: 'RVW', objectId: null,
      environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
    for (const role of ['executive', 'strategy_owner', 'decision_owner', 'decision_authority', 'domain_admin']) {
      const d = decide('executive.review.convene', role);
      expect(d.decision, role).toBe('allow_with_obligations');
      expect(d.obligations, role).toEqual([{ type: 'human_gate' }]);
    }
    for (const role of ['domain_analyst', 'forecast_owner', 'decision_approver']) expect(decide('executive.review.convene', role).decision, role).toBe('deny');
    expect(decide('executive.review.close', 'forecast_owner').decision).toBe('allow_with_obligations');
    expect(decide('executive.review.read', 'domain_analyst').decision).toBe('allow');
    expect(decide('executive.review.other', 'executive').decision, 'no prefix rule swallows the namespace').toBe('indeterminate');
  });
});
