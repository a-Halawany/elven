/**
 * CP-6 B28 (0088 §S, part `signals`) · hermetic: the weak-signal workbench at the PDP (nominate and rank: the analysts and the Weak Signal
 * Agent; every other act a named human's, human-gated; `agent.run` admits the weak_signal agent; the agent is refused a disposition), the
 * refusal rows of the ports' texts (403 → 404 → 409 → 422 — each text through the mapper, so no earlier unanchored row swallows one),
 * the intakes, the registration of the weak_signal kind with this runtime's scan, and the SYNTHETIC detector fixtures.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { validateRegisterAgent } from '../../src/executive/agents/agents.service.js';
import { WEAK_SIGNAL_AGENT_DIGEST, WEAK_SIGNAL_AGENT_METHOD, WEAK_SIGNAL_AGENT_VERSION } from '../../src/prediction/signals/signal-agent-identity.js';
import { DETECTOR_FIXTURES, answerOf } from '../../src/prediction/signals/detector-fixtures.js';
import { validateConditions, validateDisposition, validateEscalate, validateEvidence, validateGovern, validateNominate, validateRenew, validateScan } from '../../src/prediction/signals/signals.service.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const X = '0193a3d0-0000-7000-8000-0000000000cc';
const input = (action: string, roles: string[], kind: 'human' | 'agent' = 'human'): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'agent' ? 'agent_grant' : 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action, objectType: 'SIG', objectId: null, purposeId: 'prediction',
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

describe('B28 signals · the PDP', () => {
  const pdp = new PdpService();
  it('nominate and rank: the analysts, the owners and the Weak Signal Agent — exact, no human gate, at most C2', () => {
    for (const action of ['prediction.signal.nominate', 'prediction.signal.rank']) {
      for (const role of ['domain_analyst', 'forecast_owner', 'strategy_owner', 'domain_admin']) expect(pdp.evaluate(input(action, [role])).decision, `${action} ${role}`).toBe('allow');
      expect(pdp.evaluate(input(action, ['weak_signal_agent'], 'agent')).decision, action).toBe('allow');
      for (const role of ['executive', 'decision_owner', 'attention_agent', 'collection_manager']) expect(pdp.evaluate(input(action, [role])).decision, `${action} ${role}`).toBe('deny');
      expect(pdp.evaluate({ ...input(action, ['domain_analyst']), consequenceClass: 'C3' }).decision).toBe('deny');
      expect(pdp.evaluate(input(`${action}.x`, ['domain_analyst'])).decision, 'exact').not.toBe('allow');
    }
  });
  it('every other act is a named human\'s (human_gate) and never the agent\'s; the registry\'s governance is a steward\'s', () => {
    for (const action of ['prediction.signal.evidence.add', 'prediction.signal.independence.test', 'prediction.signal.dispose', 'prediction.signal.conditions.set', 'prediction.signal.escalate']) {
      const r = pdp.evaluate(input(action, ['domain_analyst']));
      expect(r.decision, action).toBe('allow_with_obligations');
      expect(r.obligations, action).toEqual([{ type: 'human_gate' }]);
      expect(pdp.evaluate(input(action, ['weak_signal_agent'], 'agent')).decision, action).toBe('deny');
    }
    for (const action of ['prediction.indicator.govern', 'prediction.indicator.retire', 'prediction.indicator.renew']) {
      expect(pdp.evaluate(input(action, ['strategy_owner'])).obligations, action).toEqual([{ type: 'human_gate' }]);
      expect(pdp.evaluate(input(action, ['domain_analyst'])).decision, action).toBe('deny');
      expect(pdp.evaluate(input(action, ['weak_signal_agent'], 'agent')).decision, action).toBe('deny');
    }
    // the existing indicator rules are untouched: define and evaluate are still their prefix rules
    expect(pdp.evaluate(input('prediction.indicator.define', ['strategy_owner'])).decision).toBe('allow');
    expect(pdp.evaluate(input('prediction.indicator.evaluate', ['forecast_agent'], 'agent')).decision).toBe('allow');
  });
  it('agent.run admits the weak_signal agent beside the four earlier agents, and no human role; the agent reads nothing it was not given', () => {
    for (const role of ['weak_signal_agent', 'attention_agent', 'decision_agent', 'briefing_agent', 'reporting_agent']) expect(pdp.evaluate(input('agent.run', [role], 'agent')).decision, role).toBe('allow');
    for (const role of ['executive', 'domain_analyst']) expect(pdp.evaluate(input('agent.run', [role])).decision, role).toBe('deny');
    expect(pdp.evaluate(input('agent.trigger', ['weak_signal_agent'], 'agent')).decision).toBe('deny');
    expect(pdp.evaluate(input('executive.attention.tick', ['weak_signal_agent'], 'agent')).decision).toBe('deny');
  });
});

describe('B28 signals · the refusal rows', () => {
  it('each port text lands on its B28 row with the port\'s own sentence (403 → 404 → 409 → 422)', () => {
    const cases: Array<[string, string, number]> = [
      ['42501', 'signal rejected: recorded by the acting principal', 403],
      ['42501', 'signal rejected: the detectors are run by a named human or by the domain\'s active Weak Signal Agent', 403],
      ['42501', 'signal rejected: an analyst\'s nomination is a named human\'s act (the Weak Signal Agent nominates through its detectors)', 403],
      ['42501', 'signal rejected: a disposition is a named human\'s act; the Weak Signal Agent nominates and ranks only', 403],
      ['42501', `signal rejected: the nominator of signal ${X} does not dispose of it; a second person decides`, 403],
      ['42501', 'signal rejected: the signals are ranked by a named human or by the domain\'s active Weak Signal Agent', 403],
      ['23503', `signal rejected: no such signal ${X} in this domain`, 404],
      ['23503', `signal rejected (evidence): no evidence or claim ${X}@latest in this domain`, 404],
      ['23503', `signal rejected (subject): no indicator ${X} in this domain`, 404],
      ['23503', `signal rejected (condition): no indicator ${X} in this domain`, 404],
      ['23514', `signal rejected (stale_version): signal ${X} is at version 3, not 2; read it again`, 409],
      ['23514', `signal rejected (maturity): signal ${X} is invalid — its independent contradicting sources outnumber the supporting; it is not escalated`, 409],
      ['23514', `signal rejected (maturity_gate): the maturity of signal ${X} changes only by a signal.corroborated event of version 4 naming an independent evidence row added in it`, 409],
      ['23514', `signal rejected (evidence_state): ${X}@2 is withdrawn; withdrawn evidence supports nothing`, 409],
      ['23505', `signal rejected (duplicate_evidence): ${X}@1 is already evidence of signal ${X}`, 409],
      ['22023', 'signal rejected: `monitor` names what would falsify the signal (a falsify condition)', 422],
      ['22023', 'signal rejected: the disposition is confirm, monitor or dismiss (escalate is its own act)', 422],
      ['22023', 'signal rejected: max_items is 0..1000', 422],
      ['42501', 'indicator governance rejected: recorded by the acting principal', 403],
      ['42501', 'indicator governance rejected: the registry is governed by a named, active human', 403],
      ['23503', `indicator governance rejected: no such indicator ${X} in this domain`, 404],
      ['23514', `indicator governance rejected (retired): indicator ${X} was retired at 2026-09-26 10:00:00+00; a retired indicator is not evaluated`, 409],
      ['23514', `indicator governance rejected (expired): indicator ${X} expired at 2026-09-26 10:00:00+00; an expired indicator is not evaluated until it is renewed`, 409],
      ['22023', 'indicator governance rejected: a renewal extends the expiry beyond 2026-10-01 00:00:00+00', 422],
      ['22023', 'indicator governance rejected: an expiry is a future instant', 422],
    ];
    for (const [code, message, want] of cases) {
      const a = answer(code, message);
      expect(a, message).not.toBeNull();
      expect(a!.status, message).toBe(want);
      // the port's own sentence: no earlier row replaced it with its own words
      expect(a!.message, message).toBe(message);
    }
  });
  it('the re-declared open_agent_run and register_agent texts still land where they did (the 0046 run row, 403)', () => {
    expect(answer('22023', 'run rejected: task is draft, briefing, report or monitor (or attention_tick for an attention agent, signal_scan for a weak_signal agent)')?.status).toBe(403);
    expect(answer('42501', 'run rejected: a weak_signal agent does not run the task briefing')?.status).toBe(403);
  });
});

describe('B28 signals · the intakes', () => {
  const ok = { title: 'Red Sea insurers withdrawing cover', statement: 'Three low-confidence reports say war-risk insurers are withdrawing cover.', subjectKind: 'none',
               evidence: [{ object_id: X }], observation: { reports: 3 }, baseline: { reports_per_month: 0 }, noveltyBasis: { basis: 'no withdrawal reported in the prior quarter' } };
  it('the nomination: the evidence, the objects, the basis in words', () => {
    expect(validateNominate(ok, 'c')).toMatchObject({ subjectKind: 'none', subjectId: null, confidence: null });
    expect(status(() => validateNominate({ ...ok, evidence: [] }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/1\.\.50 items/) });
    expect(status(() => validateNominate({ ...ok, noveltyBasis: { basis: 'new' } }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/says what is new/) });
    expect(status(() => validateNominate({ ...ok, subjectKind: 'indicator' }, 'c'))).toMatchObject({ status: 422 });
    expect(status(() => validateNominate({ ...ok, confidence: 2 }, 'c'))).toMatchObject({ status: 422 });
  });
  it('the scan reads in event time; the evidence, the disposition, the conditions, the escalation, the governance', () => {
    expect(validateScan({ asOf: '2023-11-24', maxItems: 3 }, 'c')).toEqual({ asOf: '2023-11-24', maxItems: 3 });
    expect(status(() => validateScan({ asOf: '2023-11-24T10:00:00Z' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/event time/) });
    expect(status(() => validateEvidence({ objectId: 'x' }, 'c'))).toMatchObject({ status: 422 });
    expect(validateEvidence({ objectId: X, stance: 'contradicting' }, 'c')).toMatchObject({ stance: 'contradicting', objectVersion: null });
    expect(status(() => validateDisposition({ disposition: 'escalate', note: 'escalating now please' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/its own act/) });
    expect(status(() => validateDisposition({ disposition: 'monitor', note: 'short' }, 'c'))).toMatchObject({ status: 422 });
    expect(validateDisposition({ disposition: 'monitor', note: 'watch for a second insurer', falsify: [{ text: 'no second insurer withdraws within 30 days', kind: 'observation' }] }, 'c').falsify).toHaveLength(1);
    expect(status(() => validateConditions({}, 'c'))).toMatchObject({ status: 422 });
    expect(status(() => validateConditions({ falsify: [{ text: 'x', kind: 'observation' }] }, 'c'))).toMatchObject({ status: 422 });
    expect(status(() => validateEscalate({ note: 'corroborated twice now', consequence: 'C5' }, 'c'))).toMatchObject({ status: 422 });
    expect(validateEscalate({ note: 'corroborated twice now', consequence: 'C3', windowHours: 48 }, 'c')).toMatchObject({ consequence: 'C3', windowHours: 48 });
    expect(status(() => validateGovern({}, 'c'))).toMatchObject({ status: 422 });
    expect(status(() => validateGovern({ classification: 'secret' }, 'c'))).toMatchObject({ status: 422 });
    expect(status(() => validateRenew({ reason: 'extend for Q1 review' }, 'c'))).toMatchObject({ status: 422 });
  });
  it('the weak_signal kind registers with THIS runtime\'s scan (version and digest), max_items allowed', () => {
    const base = { kind: 'weak_signal' as const, version: WEAK_SIGNAL_AGENT_VERSION, codeDigest: WEAK_SIGNAL_AGENT_DIGEST, ownerPrincipalId: X, escalationPrincipalId: X,
                   budgets: { max_reads: 10, max_gateway_calls: 0, max_elapsed_ms: 60_000 }, stopConditions: [{ kind: 'max_items', value: 5 }] };
    expect(validateRegisterAgent(base, 'c')).toMatchObject({ kind: 'weak_signal' });
    expect(WEAK_SIGNAL_AGENT_METHOD).toBe('weak-signal-agent@1.0.0');
    expect(status(() => validateRegisterAgent({ ...base, codeDigest: 'a'.repeat(64) }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/registered with this runtime's scan/) });
    expect(status(() => validateRegisterAgent({ ...base, stopConditions: [{ kind: 'on_degraded' }] }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/not enforced by a weak_signal agent/) });
  });
});

describe('B28 signals · the SYNTHETIC detector fixtures', () => {
  it('four fixtures, each labelled synthetic, each with an answer for every series detector; the answers read as the fixtures\' vocabulary', () => {
    expect(DETECTOR_FIXTURES.map((f) => f.key)).toEqual(['seeded', 'null', 'drift', 'source_gap']);
    for (const f of DETECTOR_FIXTURES) {
      expect(f.data_provenance).toBe('synthetic');
      expect(f.description).toMatch(/^SYNTHETIC — /);
      expect(Object.keys(f.expect).sort()).toEqual(['acceleration', 'change_point', 'novelty']);
    }
    expect(DETECTOR_FIXTURES.find((f) => f.key === 'source_gap')!.points.some((p) => p.d === '2024-03-30')).toBe(false);
    expect(answerOf({ fired: true, held: null })).toBe('fire');
    expect(answerOf({ fired: false, held: null })).toBe('quiet');
    expect(answerOf({ fired: false, held: 'source_gap' })).toBe('held:source_gap');
  });
});
