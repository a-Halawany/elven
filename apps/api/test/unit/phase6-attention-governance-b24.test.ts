/*
 * CP-6 B24 (0086 §G) part `governance` · the pure halves of the attention queue's governance: the intakes of a suppression decision, a
 * delegation, a disposition and an evaluation (422 on a malformed request — the ports decide the people, the items and the states), the
 * delegation's digest (what the request key is bound to), the refusal rows of the four port families through the mapper (anchored; B9's
 * order 403 → 404 → 409 → 422; B22's `attention item rejected` rows untouched), the PDP's four exact rules, and the tick step the section
 * registers (suppression-expiry, before the escalation).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AttentionGovernanceService, DISPOSITIONS, SUPPRESSION_EXPIRY_STEP, delegationDigest, validateDecide, validateDelegate, validateDisposition, validateEvaluate } from '../../src/executive/attention/governance.service.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const K1 = ['k', '1'].join('-');
const ITEM = '0190b1c2-d3e4-7000-8000-000000000201'; const TO = '0190b1c2-D3E4-7000-8000-000000000202';
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

describe('B24 governance · the intakes', () => {
  it('a decision is approve or refuse with a reason of 8+ characters', () => {
    expect(validateDecide({ decision: 'approve', reason: '  the vendor answers tomorrow  ' }, 'c')).toEqual({ decision: 'approve', reason: 'the vendor answers tomorrow' });
    status422(() => validateDecide({ decision: 'maybe', reason: 'a long enough reason' }, 'c'), /decision is approve or refuse/);
    status422(() => validateDecide({ decision: 'refuse', reason: 'short' }, 'c'), /at least 8 characters/);
  });
  it('a delegation names a principal id, a reason, an instant and a key; the id is normalised, the instant ISO', () => {
    const i = validateDelegate({ to: TO, reason: 'covering the queue this afternoon', until: '2026-09-25T18:00:00+02:00', request_key: ` ${K1} ` }, 'c');
    expect(i).toEqual({ to: TO.toLowerCase(), reason: 'covering the queue this afternoon', until: '2026-09-25T16:00:00.000Z', requestKey: K1 });
    status422(() => validateDelegate({ to: 'nobody', reason: 'covering the queue', until: '2026-09-25T18:00:00Z', request_key: K1 }, 'c'), /payload\.to is the principal id/);
    status422(() => validateDelegate({ to: TO, reason: 'short', until: '2026-09-25T18:00:00Z', request_key: K1 }, 'c'), /reason says why/);
    status422(() => validateDelegate({ to: TO, reason: 'covering the queue', request_key: K1 }, 'c'), /until is the instant/);
    status422(() => validateDelegate({ to: TO, reason: 'covering the queue', until: 'soon', request_key: K1 }, 'c'), /until must be an instant/);
    status422(() => validateDelegate({ to: TO, reason: 'covering the queue', until: '2026-09-25T18:00:00Z' }, 'c'), /request_key/);
  });
  it('the delegation digest binds the item, the delegate, the reason and the end — the same content the same digest', () => {
    const base = validateDelegate({ to: TO, reason: 'covering the queue this afternoon', until: '2026-09-25T16:00:00Z', request_key: K1 }, 'c');
    const d = delegationDigest(ITEM, base);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(delegationDigest(ITEM.toUpperCase(), { ...base, requestKey: [K1, 'other'].join('-') }), 'the key is not part of the content').toBe(d);
    expect(delegationDigest(ITEM, { ...base, reason: 'another reason entirely' })).not.toBe(d);
    expect(delegationDigest(ITEM, { ...base, until: '2026-09-25T17:00:00.000Z' })).not.toBe(d);
    expect(delegationDigest('0190b1c2-d3e4-7000-8000-000000000299', base)).not.toBe(d);
  });
  it('a disposition is one of five, with an optional note', () => {
    expect([...DISPOSITIONS]).toEqual(['actioned', 'not_material', 'duplicate', 'late', 'missed']);
    expect(validateDisposition({ disposition: 'missed', note: '  it mattered  ' }, 'c')).toEqual({ disposition: 'missed', note: 'it mattered' });
    expect(validateDisposition({ disposition: 'actioned', note: '   ' }, 'c')).toEqual({ disposition: 'actioned', note: null });
    status422(() => validateDisposition({ disposition: 'forgotten' }, 'c'), /disposition is one of/);
    status422(() => validateDisposition({ disposition: 'late', note: 'x'.repeat(2001) }, 'c'), /at most 2000/);
  });
  it('an evaluation window is ordered, the sample floor a whole number in [1, 10000] (default 5)', () => {
    expect(validateEvaluate({}, 'c')).toEqual({ windowFrom: null, windowTo: null, minSample: 5 });
    expect(validateEvaluate({ window_from: '2026-09-01T00:00:00Z', window_to: '2026-09-25T00:00:00Z', min_sample: 20 }, 'c'))
      .toEqual({ windowFrom: '2026-09-01T00:00:00.000Z', windowTo: '2026-09-25T00:00:00.000Z', minSample: 20 });
    status422(() => validateEvaluate({ window_from: '2026-09-25T00:00:00Z', window_to: '2026-09-01T00:00:00Z' }, 'c'), /window_to is at or after window_from/);
    status422(() => validateEvaluate({ min_sample: 0 }, 'c'), /min_sample/);
    status422(() => validateEvaluate({ min_sample: 2.5 }, 'c'), /min_sample/);
  });
});

describe('B24 governance · the refusal rows (anchored; 403 → 404 → 409 → 422)', () => {
  it('suppression approval', () => {
    answer('42501', 'attention suppression rejected: decided by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'attention suppression rejected: the requester does not decide their own request (separation of duties); a holder of executive decides it', 403, 'EYE-AUT-001');
    answer('42501', 'attention suppression rejected: the decider holds none of the approver roles executive (policy version 1)', 403, 'EYE-AUT-001');
    answer('23503', 'attention suppression rejected: no such suppression request in this domain', 404, 'EYE-STA-001');
    answer('22023', `attention suppression rejected: request ${ITEM} is approved; only a pending request is decided`, 409, 'EYE-STA-002');
    answer('22023', `attention suppression rejected: request ${ITEM} lapsed at 2026-09-25 10:00:00+00, before it was decided; the expiry sweep records it expired`, 409, 'EYE-STA-002');
    answer('23505', `attention suppression rejected: item ${ITEM} already has a pending suppression request ${ITEM} (until 2026-09-25 12:00:00+00); it is decided or expires first`, 409, 'EYE-STA-002');
    answer('22023', `attention suppression rejected: item ${ITEM} is closed; only a live item is suppressed`, 409, 'EYE-STA-002');
    answer('22023', 'attention suppression rejected: policy version 2 no longer allows suppressing warning.raised', 409, 'EYE-STA-002');
    answer('22023', 'attention suppression rejected: the decision is approve or refuse', 422, 'EYE-REQ-001');
    answer('22023', 'attention suppression rejected: a decision carries a reason of at least 8 characters', 422, 'EYE-REQ-001');
  });
  it('delegation', () => {
    answer('42501', 'attention delegation rejected: recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'attention delegation rejected: ended by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', `attention delegation rejected: item ${ITEM} is routed to forecast_owner (owner none); the delegator acts on it in their own right (a delegate does not delegate further)`, 403, 'EYE-AUT-001');
    answer('42501', 'attention delegation rejected: a delegation is ended by its delegator, its delegate, the item\'s owner or an administrator', 403, 'EYE-AUT-001');
    answer('23503', 'attention delegation rejected: no such item in this domain', 404, 'EYE-STA-001');
    answer('23503', 'attention delegation rejected: no such delegation in this domain', 404, 'EYE-STA-001');
    answer('23505', 'attention delegation rejected: request key k-1 was already used by this principal for a different delegation (digest 0123456789ab recorded, ba9876543210 offered); a new delegation takes a new key', 409, 'EYE-STA-002');
    answer('22023', `attention delegation rejected: item ${ITEM} is closed; only a live item is delegated`, 409, 'EYE-STA-002');
    answer('23505', `attention delegation rejected: item ${ITEM} is already delegated to ${ITEM}; end that delegation first`, 409, 'EYE-STA-002');
    answer('22023', `attention delegation rejected: delegation ${ITEM} already ended at 2026-09-25 12:00:00+00`, 409, 'EYE-STA-002');
    answer('22023', 'attention delegation rejected: the delegate must be an active human principal of this tenant (an agent is never a delegate)', 422, 'EYE-REQ-001');
    answer('22023', 'attention delegation rejected: the delegate holds none of the acknowledgement roles in this domain (platform_admin, domain_admin)', 422, 'EYE-REQ-001');
    answer('22023', 'attention delegation rejected: a delegation ends after now and within 720 hours', 422, 'EYE-REQ-001');
  });
  it('disposition and evaluation', () => {
    answer('42501', 'attention disposition rejected: recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', `attention disposition rejected: item ${ITEM} is routed to forecast_owner (owner none); the acting principal is neither (nor its delegate)`, 403, 'EYE-AUT-001');
    answer('23503', 'attention disposition rejected: no such item in this domain', 404, 'EYE-STA-001');
    answer('22023', `attention disposition rejected: item ${ITEM} was judged material when it arrived; \`missed\` records an item the engine judged below its thresholds or abstained on`, 409, 'EYE-STA-002');
    answer('22023', 'attention disposition rejected: the disposition is actioned, not_material, duplicate, late or missed', 422, 'EYE-REQ-001');
    answer('42501', 'attention queue evaluation rejected: recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'attention queue evaluation rejected: the queue is evaluated by a named human holding executive, domain_admin or platform_admin', 403, 'EYE-AUT-001');
    answer('22023', 'attention queue evaluation rejected: the window ends before it begins', 422, 'EYE-REQ-001');
  });
  it('B22\'s own rows answer as before (the suppression port keeps its texts)', () => {
    answer('42501', `attention item rejected: item ${ITEM} is routed to forecast_owner (owner none); the acting principal is neither`, 403, 'EYE-AUT-001');
    answer('22023', 'attention item rejected: policy version 1 does not allow suppressing forecast.unfit', 409, 'EYE-STA-002');
    answer('22023', 'attention item rejected: a suppression expires after now and within 12 hours (policy version 1)', 422, 'EYE-REQ-001');
  });
});

describe('B24 governance · the PDP and the tick step', () => {
  it('four exact rules: decide / delegate / disposition open to the acknowledgement roles (human-gated), evaluation to executive and domain_admin', () => {
    const pdp = new PdpService();
    const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
    const decide = (action: string, role: string) => pdp.evaluate({ action, principal: { principalId: ITEM, kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] },
      delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive', consequenceClass: 'C2', objectType: 'ATI', objectId: null,
      environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
    for (const action of ['executive.attention.suppression.decide', 'executive.attention.item.delegate', 'executive.attention.disposition.record']) {
      for (const role of ['executive', 'domain_admin', 'forecast_owner', 'domain_analyst', 'decision_owner']) {
        const d = decide(action, role);
        expect(d.decision, `${action} ${role}`).toBe('allow_with_obligations');
        expect(d.obligations, `${action} ${role}`).toEqual([{ type: 'human_gate' }]);
      }
      for (const role of ['auditor', 'attention_agent', 'attention_subscriber']) expect(decide(action, role).decision, `${action} ${role}`).toBe('deny');
    }
    for (const role of ['executive', 'domain_admin']) expect(decide('executive.attention.queue.evaluate', role).decision, role).toBe('allow_with_obligations');
    for (const role of ['forecast_owner', 'domain_analyst', 'decision_owner']) expect(decide('executive.attention.queue.evaluate', role).decision, role).toBe('deny');
    expect(decide('executive.attention.item.delegated', 'executive').decision, 'exact: no prefix match').toBe('indeterminate');
  });
  it('the section registers suppression-expiry before the escalation (order 5 < 10)', () => {
    const reg = new AttentionTickRegistry();
    new AttentionGovernanceService(reg).onModuleInit();
    expect(reg.steps().map((s) => [s.name, s.order])).toEqual([[SUPPRESSION_EXPIRY_STEP, 5]]);
    expect(() => new AttentionGovernanceService(reg).onModuleInit()).toThrow(/registered twice/);
  });
});
