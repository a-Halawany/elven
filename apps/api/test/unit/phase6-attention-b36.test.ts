/**
 * CP-6 B36 (0094 §A, part `attention`) — the pure parts: the intakes (accept-priority, the release, the recovery route, the forum), the
 * refusal rows of the section's families (`act resumption | settle failure | priority acceptance | queue hold | queue transition | queue
 * recovery | forum rejected`), the act service's synthetic fault as a one-shot, and the PDP rules (executive.attention.queue.read admits the
 * executive operator and the board member; every write human-gated; the release the executive's; the fixture an administrator's).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DEGRADED_STATES, ROUTE_OF, validateAcceptPriority, validateForum, validateLimit, validateRecover, validateRelease } from '../../src/executive/attention/attention-b36.service.js';
import { AttentionActService } from '../../src/executive/attention/act.service.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const A = '0190b1c2-d3e4-7000-8000-000000000501'; const B = '0190b1c2-d3e4-7000-8000-000000000502'; const T = '0190b1c2-d3e4-7000-8000-0000000005aa'; const D = '0190b1c2-d3e4-7000-8000-0000000005bb';
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  expect((r?.getResponse() as { code: string }).code, m).toBe(body);
};
const status422 = (f: () => unknown, re: RegExp): void => {
  try { f(); throw new Error('the intake should have refused'); } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(422);
    expect(String(((e as HttpException).getResponse() as { message?: string }).message)).toMatch(re);
  }
};

describe('B36 attention · the intakes', () => {
  it('accept-priority: an optional note, bounded', () => {
    expect(validateAcceptPriority({}, 'c')).toEqual({ note: null });
    expect(validateAcceptPriority({ note: '  I take it  ' }, 'c')).toEqual({ note: 'I take it' });
    expect(validateAcceptPriority({ note: '' }, 'c')).toEqual({ note: null });
    status422(() => validateAcceptPriority({ note: 'x'.repeat(1001) }, 'c'), /at most 1000/);
    status422(() => validateAcceptPriority({ note: 7 }, 'c'), /payload\.note is text/);
  });
  it('the release: a reason of eight characters or more', () => {
    expect(validateRelease({ reason: ' the ranking reviewed ' }, 'c')).toEqual({ reason: 'the ranking reviewed' });
    status422(() => validateRelease({ reason: 'short' }, 'c'), /payload\.reason says why the hold is released/);
    status422(() => validateRelease({}, 'c'), /payload\.reason/);
  });
  it('the recovery route: a degraded state of the five, each with its route; an optional note', () => {
    expect([...DEGRADED_STATES]).toEqual(['delivery_sink_down', 'tick_stalled', 'policy_invalid', 'evaluation_stale', 'hold']);
    expect(ROUTE_OF).toEqual({ delivery_sink_down: 're-deliver', tick_stalled: 're-tick', policy_invalid: 're-validate', evaluation_stale: 're-evaluate', hold: 'release' });
    expect(validateRecover({ state: 'tick_stalled' }, 'c')).toEqual({ state: 'tick_stalled', note: null });
    expect(validateRecover({ state: 'hold', note: ' why ' }, 'c')).toEqual({ state: 'hold', note: 'why' });
    status422(() => validateRecover({ state: 'sink_down' }, 'c'), /payload\.state is a degraded state: delivery_sink_down, tick_stalled, policy_invalid, evaluation_stale, hold/);
    status422(() => validateRecover({}, 'c'), /payload\.state/);
  });
  it('the limit: a whole number in [1, 500], 200 by default', () => {
    expect(validateLimit({})).toBe(200);
    expect(validateLimit({ limit: 5 })).toBe(5);
    expect(validateLimit({ limit: 9999 })).toBe(500);
    expect(validateLimit({ limit: 0 })).toBe(1);
    expect(validateLimit({ limit: 'many' })).toBe(200);
  });
  it('the forum: a title, named members (deduplicated), a period, a context with its horizon; the optional ids left null', () => {
    const f = validateForum({ title: ' Supply forum ', members: [A, A, B], period: 'monthly', context: { horizon: '90d', objective_id: '', classification: 'confidential' } }, 'c');
    expect(f).toEqual({ title: 'Supply forum', members: [A, B], period: 'monthly', context: { objective_id: null, horizon: '90d', scenario_id: null, classification: 'confidential' } });
    expect(validateForum({ title: 'Forum', members: [A], period: 'weekly', context: { horizon: '30d' } }, 'c').context).toMatchObject({ classification: 'internal' });
    status422(() => validateForum({ title: 'x', members: [A], period: 'weekly', context: { horizon: '30d' } }, 'c'), /payload\.title/);
    status422(() => validateForum({ title: 'Forum', members: [], period: 'weekly', context: { horizon: '30d' } }, 'c'), /payload\.members is a non-empty list of principal ids/);
    status422(() => validateForum({ title: 'Forum', members: ['nobody'], period: 'weekly', context: { horizon: '30d' } }, 'c'), /payload\.members/);
    status422(() => validateForum({ title: 'Forum', members: [A], period: 'daily', context: { horizon: '30d' } }, 'c'), /payload\.period is the cadence: weekly, monthly or quarterly/);
    status422(() => validateForum({ title: 'Forum', members: [A], period: 'weekly', context: { horizon: '7d' } }, 'c'), /payload\.context\.horizon is 30d, 90d, 12m or 36m/);
    status422(() => validateForum({ title: 'Forum', members: [A], period: 'weekly', context: { horizon: '30d', objective_id: 'x' } }, 'c'), /payload\.context\.objective_id/);
    status422(() => validateForum({ title: 'Forum', members: [A], period: 'weekly', context: { horizon: '30d', classification: 'secret' } }, 'c'), /payload\.context\.classification/);
    status422(() => validateForum({ title: 'Forum', members: [A], period: 'weekly' }, 'c'), /payload\.context is/);
  });
});

describe('B36 attention · the refusal rows (the section\'s families, anchored, classed)', () => {
  it('the standing 403: actor, accountable, authority, membership', () => {
    answer('42501', 'act resumption rejected (actor): act x is resumed by the member who launched it or by the executive operator', 403, 'EYE-AUT-001');
    answer('42501', 'priority acceptance rejected (accountable): item x is accountable to its owner y', 403, 'EYE-AUT-001');
    answer('42501', 'queue hold rejected (authority): a hold is released by a named human holding executive', 403, 'EYE-AUT-001');
    answer('42501', 'queue recovery rejected (authority): a recovery route is run by a named human', 403, 'EYE-AUT-001');
    answer('42501', 'forum rejected (membership): the acting principal is not a member of forum x', 403, 'EYE-AUT-001');
    answer('42501', 'settle failure rejected (actor): recorded by the acting principal', 403, 'EYE-AUT-001');
  });
  it('the absences 404: unknown_*', () => {
    answer('23503', 'act resumption rejected (unknown_act): act x is not an act of this domain', 404, 'EYE-STA-001');
    answer('23503', 'priority acceptance rejected (unknown_item): item x is not an item of this domain', 404, 'EYE-STA-001');
    answer('23503', 'queue hold rejected (unknown_hold): hold x is not a hold of this domain', 404, 'EYE-STA-001');
    answer('23503', 'queue hold rejected (unknown_evaluation): evaluation x is not an evaluation of this domain', 404, 'EYE-STA-001');
    answer('23503', 'forum rejected (unknown_forum): room x is not a forum of this domain', 404, 'EYE-STA-001');
  });
  it('the record\'s state 409: state, and the held queue\'s read-only guard', () => {
    answer('22023', 'act resumption rejected (state): act x is already acted (settled at t); nothing to resume', 409, 'EYE-STA-002');
    answer('22023', 'act resumption rejected (state): the governed action a of act x did not commit', 409, 'EYE-STA-002');
    answer('22023', 'priority acceptance rejected (state): the priority of item x was accepted by y at t; it is accepted once', 409, 'EYE-STA-002');
    answer('22023', 'queue hold rejected (state): hold x was released by y at t', 409, 'EYE-STA-002');
    answer('22023', 'forum rejected (state): room x already exists', 409, 'EYE-STA-002');
    answer('22023', 'queue transition rejected (held): the queue is held (hold x, fairness_below_floor) since t; its items are served read-only', 409, 'EYE-STA-002');
    answer('22023', 'settle failure rejected (state): act x is acted; only a launched act\'s settle fails', 409, 'EYE-STA-002');
    // the act's in-flight guard answers in 0090 §A4's family
    answer('22023', 'attention act rejected (in_flight): item x has an act settle_failed and not yet settled — the launcher or the executive operator resumes it', 409, 'EYE-STA-002');
  });
  it('the caller\'s own request 422: the rest of the classes', () => {
    answer('22023', 'priority acceptance rejected (note): a note is at most 1000 characters', 422, 'EYE-REQ-001');
    answer('22023', 'queue hold rejected (reason): a release says why (8+ characters)', 422, 'EYE-REQ-001');
    answer('22023', 'queue recovery rejected (vocabulary): x is not a degraded state', 422, 'EYE-REQ-001');
    answer('22023', 'queue recovery rejected (route): the hold\'s route is the executive\'s release', 422, 'EYE-REQ-001');
    answer('22023', 'forum rejected (members): member x is not a named, active human of this tenant', 422, 'EYE-REQ-001');
    answer('22023', 'forum rejected (context): horizon is 30d, 90d, 12m or 36m', 422, 'EYE-REQ-001');
    answer('22023', 'settle failure rejected (receipt): the committed action\'s receipt is {policyDecisionId, auditSeq}', 422, 'EYE-REQ-001');
  });
});

describe('B36 attention · the synthetic settle fault is a one-shot', () => {
  it('armed once, read once, cleared by the act that meets it', () => {
    const svc = new AttentionActService({} as never);
    expect(svc.settleFaultArmed()).toBeNull();
    expect(svc.armSettleFault({ by: A, at: '2026-09-30T00:00:00Z' })).toMatchObject({ armed: true, synthetic: true, by: A });
    expect(svc.settleFaultArmed()).toEqual({ by: A, at: '2026-09-30T00:00:00Z' });
  });
});

describe('B36 attention · the PDP rules', () => {
  const pdp = new PdpService();
  const decide = (action: string, role: string, kind = 'human') => pdp.evaluate({ action, principal: { principalId: A, kind, assurance: 'password',
    bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] }, delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive',
    consequenceClass: 'C2', objectType: 'ATI', objectId: null, environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
  it('the queue read admits the executive operator and the board member beside the queue\'s readers; the reads are audited', () => {
    for (const role of ['executive_operator', 'board_member', 'executive', 'domain_analyst', 'strategy_owner', 'decision_owner']) {
      const d = decide('executive.attention.queue.read', role);
      expect(d.decision, role).toBe('allow_with_obligations');
      expect(d.obligations, role).toEqual([{ type: 'audit_access' }]);
    }
    for (const role of ['attention_agent', 'attention_subscriber', 'external_collaborator']) expect(decide('executive.attention.queue.read', role).decision, role).toBe('deny');
  });
  it('every write is human-gated; the resume the operator\'s among the act roles; accept-priority the item roles\'; the release the executive\'s; the recovery and the forum the operator\'s; the fixture an administrator\'s', () => {
    const gated = (action: string, allowed: string[], denied: string[]) => {
      for (const role of allowed) { const d = decide(action, role); expect(d.decision, `${action} ${role}`).toBe('allow_with_obligations'); expect(d.obligations, role).toEqual([{ type: 'human_gate' }]); }
      for (const role of denied) expect(decide(action, role).decision, `${action} ${role}`).toBe('deny');
    };
    gated('executive.attention.item.act.resume', ['executive_operator', 'strategy_owner', 'domain_admin', 'executive'], ['board_member', 'attention_agent', 'auditor']);
    gated('executive.attention.item.accept_priority', ['strategy_owner', 'forecast_owner', 'decision_owner', 'executive', 'domain_analyst'], ['executive_operator', 'board_member', 'attention_agent']);
    gated('executive.attention.queue.release', ['executive', 'domain_admin'], ['executive_operator', 'domain_analyst', 'strategy_owner']);
    gated('executive.attention.queue.recover', ['executive', 'executive_operator', 'domain_admin'], ['domain_analyst', 'board_member', 'strategy_owner']);
    gated('executive.attention.fixture.arm', ['domain_admin', 'executive_operator'], ['executive', 'domain_analyst']);
    gated('executive.forum.convene', ['executive_operator', 'executive', 'domain_admin'], ['strategy_owner', 'board_member', 'domain_analyst']);
  });
  it('an agent principal never reaches a human-gated port (the gate is the obligation the pipeline enforces; the rule itself says human_gate)', () => {
    expect(decide('executive.attention.item.accept_priority', 'strategy_owner', 'agent').obligations).toEqual([{ type: 'human_gate' }]);
  });
});
