/**
 * CP-6 B24 (0086, part `timer`) · hermetic: the attention tick at the PDP (exact, the attention agent alone, no human gate; the human
 * escalate route keeps its gate; `agent.run` admits the attention agent beside the three P6-M6 agents), the refusal rows of the tick's
 * and the delivery port's texts (403 → 404 → 409 → 422, and the 0046 run row still reading the re-declared open_agent_run's texts), the
 * timer's queue identity under the pinned BullMQ naming, the timer's identity and cadence, the registration intake of the attention
 * kind, and the message a delivery carries (deterministic; the SYNTHETIC note on the demo mailbox).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { attentionQueueNameFor, attentionSchedulerIdFor, redisName } from '../../src/observation/scheduling/scheduler.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_METHOD, ATTENTION_TIMER_VERSION, DEFAULT_TICK_SECONDS, cadenceOf } from '../../src/executive/attention/timer-identity.js';
import { validateRegisterAgent } from '../../src/executive/agents/agents.service.js';
import { attentionMessage, SYNTHETIC_NOTE } from '../../src/executive/attention/delivery/delivery.service.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (action: string, roles: string[], kind: 'human' | 'agent' = 'agent'): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'agent' ? 'agent_grant' : 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action, objectType: 'ATI', objectId: null, purposeId: 'executive',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C1',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
} as PolicyInput);
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), code: (r.getResponse() as { code: string }).code };
};
const DEL = '0190b1c2-d3e4-7000-8000-000000000001'; const AGT = '0190b1c2-d3e4-7000-8000-000000000002';

describe('B24 timer · the PDP', () => {
  const pdp = new PdpService();
  it('executive.attention.tick is EXACT, the attention agent\'s alone, with no human gate, at most C2', () => {
    const ok = pdp.evaluate(input('executive.attention.tick', ['attention_agent']));
    expect(ok.decision).toBe('allow');
    expect(ok.obligations).toEqual([]);
    for (const role of ['executive', 'domain_admin', 'platform_admin', 'briefing_agent', 'attention_subscriber', 'strategy_owner']) {
      expect(pdp.evaluate(input('executive.attention.tick', [role])).decision, role).toBe('deny');
    }
    expect(pdp.evaluate({ ...input('executive.attention.tick', ['attention_agent']), consequenceClass: 'C3' }).decision).toBe('deny');
    for (const action of ['executive.attention.tick.now', 'executive.attention.tic', 'executive.attention.ticks']) {
      expect(pdp.evaluate(input(action, ['attention_agent'])).decision, action).not.toBe('allow');
    }
  });
  it('the human escalate route keeps its human gate and is not the agent\'s; the agent holds no human act', () => {
    const human = pdp.evaluate(input('executive.attention.escalate', ['executive'], 'human'));
    expect(human.decision).toBe('allow_with_obligations');
    expect(human.obligations).toEqual([{ type: 'human_gate' }]);
    for (const action of ['executive.attention.escalate', 'executive.attention.item.acknowledge', 'executive.attention.item.suppress', 'executive.attention.item.close', 'executive.attention.policy.publish', 'agent.register', 'agent.trigger']) {
      expect(pdp.evaluate(input(action, ['attention_agent'])).decision, action).toBe('deny');
    }
  });
  it('agent.run admits the attention agent and the three P6-M6 agents, and no human role', () => {
    for (const role of ['attention_agent', 'decision_agent', 'briefing_agent', 'reporting_agent']) expect(pdp.evaluate(input('agent.run', [role])).decision, role).toBe('allow');
    for (const role of ['executive', 'domain_admin', 'attention_subscriber']) expect(pdp.evaluate(input('agent.run', [role])).decision, role).toBe('deny');
  });
});

describe('B24 timer · the refusal rows', () => {
  it('the tick\'s and the delivery port\'s texts answer 403 → 404 → 409 → 422', () => {
    expect(answer('42501', 'attention tick rejected: the tick is run by an active attention agent of this domain, under its own session')).toEqual({ status: 403, code: 'EYE-AUT-001' });
    expect(answer('23503', `attention tick rejected: no such agent ${AGT} in this domain`)).toEqual({ status: 404, code: 'EYE-STA-001' });
    expect(answer('23503', `attention delivery rejected: no such delivery ${DEL} in this domain`)).toEqual({ status: 404, code: 'EYE-STA-001' });
    expect(answer('22023', `attention delivery rejected (not_queued): delivery ${DEL} is abandoned; only a queued delivery is attempted`)).toEqual({ status: 409, code: 'EYE-STA-002' });
    expect(answer('22023', `attention delivery rejected (not_queued): delivery ${DEL} is delivered; only a queued delivery is placed`)).toEqual({ status: 409, code: 'EYE-STA-002' });
    expect(answer('22023', 'attention delivery rejected: a placement carries the channel\'s receipt (an object)')).toEqual({ status: 422, code: 'EYE-REQ-001' });
    expect(answer('22023', 'attention delivery rejected: the outcome of an attempt is sent, delivered or failed')).toEqual({ status: 422, code: 'EYE-REQ-001' });
    expect(answer('22023', `attention delivery rejected: delivery ${DEL} is on the channel in_app, not demo-mailbox`)).toEqual({ status: 422, code: 'EYE-REQ-001' });
    expect(answer('22023', 'attention tick rejected: the cadence is a whole number of seconds in [1, 86400]')).toEqual({ status: 422, code: 'EYE-REQ-001' });
    expect(answer('22023', `attention tick rejected: agent ${AGT} is a briefing agent; the timer runs an attention agent`)).toEqual({ status: 422, code: 'EYE-REQ-001' });
  });
  it('the re-declared open_agent_run\'s texts still land on the 0046 run row (403)', () => {
    expect(answer('22023', 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent)')).toEqual({ status: 403, code: 'EYE-AUT-001' });
    expect(answer('42501', 'run rejected: a attention agent does not run the task draft')).toEqual({ status: 403, code: 'EYE-AUT-001' });
    expect(answer('42501', 'run rejected: a briefing agent does not run the task attention_tick')).toEqual({ status: 403, code: 'EYE-AUT-001' });
  });
  it('the prelude\'s D6 refusal of a real-provider channel stays a 422 of the attention policy', () => {
    expect(answer('22023', 'attention policy rejected: class warning.raised notify.channels are in_app and demo-mailbox (synthetic); email needs a delivery provider (owner decision D6)')).toEqual({ status: 422, code: 'EYE-REQ-001' });
  });
});

describe('B24 timer · the queue, the identity, the intake, the message', () => {
  it('the timer\'s queue and scheduler ids are scope-prefixed and map to Redis names without ":"', () => {
    expect(attentionQueueNameFor(T, D)).toBe(`exec:${T}:${D}:attention`);
    expect(attentionSchedulerIdFor(T, D)).toBe(`exec:${T}:${D}:attention-timer`);
    expect(redisName(attentionQueueNameFor(T, D))).toBe(`exec.${T}.${D}.attention`);
    expect(redisName(attentionSchedulerIdFor(T, D)).includes(':')).toBe(false);
  });
  it('the timer\'s identity is stable and its cadence bounded', () => {
    expect(ATTENTION_TIMER_METHOD).toBe(`attention-timer@${ATTENTION_TIMER_VERSION}`);
    expect(ATTENTION_TIMER_DIGEST).toMatch(/^[0-9a-f]{64}$/);
    expect(cadenceOf({ tick_every_seconds: 60 })).toBe(60);
    expect(cadenceOf({ tick_every_seconds: 59 })).toBe(DEFAULT_TICK_SECONDS);
    expect(cadenceOf({})).toBe(DEFAULT_TICK_SECONDS);
    expect(cadenceOf(null)).toBe(DEFAULT_TICK_SECONDS);
  });
  it('the registration intake: the attention kind with this runtime\'s timer identity, its cadence on no other kind', () => {
    const base = { version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: AGT, escalationPrincipalId: AGT, budgets: { max_reads: 1, max_gateway_calls: 0, max_elapsed_ms: 1000, tick_every_seconds: 120 }, stopConditions: [] };
    expect(validateRegisterAgent({ kind: 'attention', ...base }, 'c').budgets).toMatchObject({ tick_every_seconds: 120, clearance: 'internal' });
    const status = (f: () => unknown): { status: number; message: string } => { try { f(); return { status: 0, message: '' }; } catch (e) { return { status: (e as HttpException).getStatus(), message: String(((e as HttpException).getResponse() as { message?: string }).message) }; } };
    expect(status(() => validateRegisterAgent({ kind: 'attention', ...base, codeDigest: 'a'.repeat(64) }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/registered with this runtime's timer/) });
    expect(status(() => validateRegisterAgent({ kind: 'attention', ...base, budgets: { ...base.budgets, tick_every_seconds: 30 } }, 'c'))).toMatchObject({ status: 422 });
    expect(status(() => validateRegisterAgent({ kind: 'briefing', ...base, codeDigest: 'a'.repeat(64) }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/only an attention agent carries it/) });
    expect(status(() => validateRegisterAgent({ kind: 'oracle' as never, ...base }, 'c'))).toMatchObject({ status: 422, message: 'kind is decision, briefing, reporting or attention' });
  });
  it('the message a delivery carries is deterministic; the demo mailbox\'s says SYNTHETIC and that no email was sent', () => {
    const c = { item_id: DEL, signal_class: 'warning.raised', title: 'Bab el-Mandeb transits fell', item_event: 'item.escalated', item_state: 'escalated', due_at: '2026-09-25T10:00:00Z',
                subject_kind: 'warning', subject_id: AGT, policy_version: 2, attempt: 1, max_attempts: 3, channel: 'demo-mailbox' };
    const a = attentionMessage(c); const b = attentionMessage({ ...c });
    expect(a).toEqual(b);
    expect(a.subject).toBe('[attention · warning.raised] Bab el-Mandeb transits fell — ESCALATED');
    expect(a.body).toContain(SYNTHETIC_NOTE);
    expect(a.body).toMatch(/its receipt is not your acknowledgement/);
    expect(attentionMessage({ ...c, channel: 'in_app', item_event: 'item.routed' }).body.includes('SYNTHETIC')).toBe(false);
  });
});
