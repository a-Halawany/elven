/**
 * CP-6 B32 (0089 §R, part `exposures`) · hermetic: risk and opportunity intelligence at the PDP (every act a named human's, human-gated;
 * acceptance the risk owner's alone, sponsorship the opportunity sponsor's alone; the estimate the two agents' only action; `agent.run`
 * admits the risk and opportunity agents; the register read names the owners), the refusal rows of the ports' texts (403 → 404 → 409 → 422 —
 * each text through the mapper, so no earlier unanchored row swallows one), the intakes, the gaps, and the registration of the two kinds
 * with this runtime's estimate.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { STOP_CONDITION_KINDS, validateRegisterAgent } from '../../src/executive/agents/agents.service.js';
import { OPPORTUNITY_AGENT_DIGEST, OPPORTUNITY_AGENT_VERSION, RISK_AGENT_DIGEST, RISK_AGENT_METHOD, RISK_AGENT_VERSION } from '../../src/prediction/exposures/exposure-agent-identity.js';
import { gapsOf, validateAccept, validateAggregate, validateAssess, validateControl, validateCorrelation, validateOpenDecision, validateRegister, validateSponsor } from '../../src/prediction/exposures/exposures.service.js';
import { ALL_WARNING_ORIGIN_KINDS } from '../../src/prediction/warnings/warning-origins.js';

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
  return r === null ? null : { status: r.getStatus(), code: (r.getResponse() as { code: string }).code, message: String((r.getResponse() as { message?: string }).message) };
};
const status = (f: () => unknown): { status: number; message: string } => {
  try { f(); return { status: 0, message: '' }; } catch (e) { return { status: (e as HttpException).getStatus(), message: String(((e as HttpException).getResponse() as { message?: string }).message) }; }
};

describe('B32 exposures · the PDP', () => {
  const pdp = new PdpService();
  const gated = (action: string, role: string) => {
    const r = pdp.evaluate(input(action, [role]));
    return r.decision === 'allow_with_obligations' && r.obligations.some((o) => o.type === 'human_gate');
  };
  it('acceptance is the risk owner\'s alone; sponsorship the opportunity sponsor\'s alone — both human-gated', () => {
    expect(gated('prediction.exposure.accept', 'risk_owner')).toBe(true);
    for (const role of ['domain_admin', 'executive', 'strategy_owner', 'opportunity_sponsor', 'domain_analyst']) expect(pdp.evaluate(input('prediction.exposure.accept', [role])).decision, role).toBe('deny');
    expect(gated('prediction.exposure.sponsor', 'opportunity_sponsor')).toBe(true);
    for (const role of ['risk_owner', 'executive', 'strategy_owner', 'domain_admin']) expect(pdp.evaluate(input('prediction.exposure.sponsor', [role])).decision, role).toBe('deny');
  });
  it('the agents: the estimate is their only action (no gate); accept, sponsor, assess refused; agent.run admits both kinds', () => {
    for (const role of ['risk_agent', 'opportunity_agent']) {
      expect(pdp.evaluate(input('prediction.exposure.estimate', [role], 'agent')).decision, role).toBe('allow');
      for (const action of ['prediction.exposure.accept', 'prediction.exposure.sponsor', 'prediction.exposure.assess', 'prediction.exposure.contest', 'prediction.exposure.correlation.declare'])
        expect(pdp.evaluate(input(action, [role], 'agent')).decision, `${action} ${role}`).toBe('deny');
      expect(pdp.evaluate(input('agent.run', [role], 'agent')).decision, role).toBe('allow');
    }
    expect(pdp.evaluate(input('prediction.exposure.estimate', ['risk_owner'])).decision).toBe('deny');
    // the earlier agents keep their run
    for (const role of ['decision_agent', 'briefing_agent', 'reporting_agent', 'attention_agent', 'weak_signal_agent']) expect(pdp.evaluate(input('agent.run', [role], 'agent')).decision, role).toBe('allow');
  });
  it('a PURE risk owner / sponsor (no other role) opens the shell, reads the foresight and acknowledges the warning routed to them (0089 §I)', () => {
    const ok = (d: string) => d === 'allow' || d === 'allow_with_obligations';
    for (const role of ['risk_owner', 'opportunity_sponsor', 'risk_agent', 'opportunity_agent'])
      expect(ok(pdp.evaluate(input('identity.self.read', [role], role.endsWith('_agent') ? 'agent' : 'human')).decision), role).toBe(true);
    for (const role of ['risk_owner', 'opportunity_sponsor']) expect(ok(pdp.evaluate(input('prediction.read', [role])).decision), role).toBe(true);
    expect(ok(pdp.evaluate(input('prediction.warning.acknowledge', ['risk_owner'])).decision)).toBe(true);
    expect(pdp.evaluate(input('prediction.warning.acknowledge', ['opportunity_sponsor'])).decision).toBe('deny');
  });
  it('every other act is a named human\'s, human-gated; the read names the risk owner and the sponsor; the roll-up is ungated', () => {
    for (const [action, role] of [['prediction.exposure.taxonomy.publish', 'executive'], ['prediction.exposure.appetite.approve', 'risk_owner'], ['prediction.exposure.register', 'domain_analyst'],
      ['prediction.exposure.assess', 'opportunity_sponsor'], ['prediction.exposure.contest', 'executive'], ['prediction.exposure.control.add', 'risk_owner'], ['prediction.exposure.route', 'risk_owner'],
      ['prediction.exposure.hypothesis.declare', 'opportunity_sponsor'], ['prediction.exposure.respond', 'risk_owner'], ['prediction.exposure.close', 'opportunity_sponsor'],
      ['prediction.exposure.correlation.declare', 'domain_analyst']] as const) expect(gated(action, role), `${action} ${role}`).toBe(true);
    expect(pdp.evaluate(input('prediction.exposure.taxonomy.publish', ['domain_analyst'])).decision).toBe('deny');
    for (const role of ['risk_owner', 'opportunity_sponsor', 'executive', 'decision_owner']) expect(pdp.evaluate(input('prediction.exposure.read', [role])).decision, role).not.toBe('deny');
    expect(pdp.evaluate(input('prediction.exposure.read', ['collection_manager'])).decision).toBe('deny');
    expect(pdp.evaluate(input('prediction.exposure.aggregate', ['domain_analyst'])).decision).toBe('allow');
  });
});

describe('B32 exposures · the refusal rows (each port text through the mapper)', () => {
  it('the standing 403, the absences 404, the record\'s state 409, the caller\'s request 422', () => {
    const rows: Array<[string, string, number]> = [
      ['42501', 'exposure rejected: recorded by the acting principal', 403],
      ['42501', 'exposure acceptance rejected: the assessment is accepted by the exposure\'s owner (x), a named, active human — never by another person or an agent', 403],
      ['42501', 'exposure assessment rejected: the assessor of version 1 does not contest it (a challenge is another person\'s)', 403],
      ['42501', 'exposure sponsorship rejected: an opportunity is sponsored by a named, active opportunity sponsor — never by an agent', 403],
      ['42501', 'exposure estimate rejected: an estimate is made by the risk agent in its own open run', 403],
      ['42501', 'risk appetite rejected: an appetite is approved by a named, active human — the executive, a domain administrator or a risk owner', 403],
      ['23503', `exposure rejected: no such RSK ${X} in this domain (declare it through the Strategy Graph first)`, 404],
      ['23503', 'exposure rejected: no category nope in taxonomy version 1', 404],
      ['23503', `exposure hypothesis rejected: no such capability ${X} in this domain (a CAP node of the Strategy Graph)`, 404],
      ['23503', `exposure assessment rejected: no such evidence object ${X} in this domain`, 404],
      ['23503', `exposure response rejected: no such package ${X} in this domain`, 404],
      ['23503', 'risk appetite rejected: no category unknown in taxonomy version 1', 404],
      ['22023', `exposure rejected (duplicate): RSK ${X} is registered already`, 409],
      ['22023', 'exposure assessment rejected (stale_version): the exposure stands at version 1, not 0', 409],
      ['22023', 'exposure acceptance rejected (stale_digest): the digest accepted is not version 1\'s (abc…) — preview the version again', 409],
      ['22023', 'exposure sponsorship rejected (agent_estimate): version 2 is the Opportunity Agent\'s unaccepted estimate', 409],
      ['22023', 'exposure routing rejected (no_breach): exposure x\'s latest residual is within appetite', 409],
      ['22023', 'exposure aggregation rejected (invalid_members): x contested — nothing is rolled up', 409],
      ['22023', 'risk taxonomy rejected (stale_version): the taxonomy stands at version 1, not 0', 409],
      ['23514', 'exposure assessment rejected: version 1 of exposure x is immutable; only its state changes', 409],
      ['22023', 'exposure rejected (owner): the owner x is not a named, active risk owner of this domain — a material risk or opportunity is never left unowned', 422],
      ['22023', 'exposure assessment rejected: the probability is a bracket {low, high} in [0, 1] (a point estimate is false precision — state a bracket)', 422],
      ['22023', 'exposure response rejected: exploit is not a response to this risk', 422],
      ['22023', 'exposure aggregation rejected: risks and opportunities are not rolled up together', 422],
      ['22023', 'risk taxonomy rejected: the category key market is named twice', 422],
    ];
    for (const [code, message, expected] of rows) {
      const a = answer(code, message);
      expect(a?.status, message).toBe(expected);
      expect(a?.message, message).toBe(message);   // the port's own sentence, never a fixed row's
    }
    // the intake's new origin kind reads as the caller's request, as before (0088 §I)
    expect(answer('22023', 'warning candidate rejected: origin_kind is one of stream_rule, weak_signal, graph_impact, forecast_revision, twin_degradation, exposure')?.status).toBe(422);
  });
});

describe('B32 exposures · the intakes and the gaps', () => {
  it('the intakes refuse a malformed request (422) before any port', () => {
    expect(status(() => validateRegister({ strategyObjectId: 'nope', polarity: 'risk', category: 'x', owner: X }, 'c')).status).toBe(422);
    expect(status(() => validateRegister({ strategyObjectId: X, polarity: 'threat', category: 'x', owner: X }, 'c')).message).toBe('polarity is risk or opportunity');
    expect(validateRegister({ strategyObjectId: X.toUpperCase(), polarity: 'opportunity', category: 'sourcing', owner: X }, 'c')).toMatchObject({ exposureId: X, reviewEveryDays: null });
    expect(status(() => validateAssess({ assessment: {} }, 'c')).message).toMatch(/expectedVersion/);
    expect(status(() => validateAccept({ digest: 'short', rationale: 'long enough rationale' }, 'c')).message).toMatch(/64-hex digest/);
    expect(status(() => validateControl({ title: 'A control', kind: 'magic', effectiveness: { low: 0, high: 1 }, owner: X }, 'c')).message).toBe('kind is preventive, detective or corrective');
    expect(status(() => validateCorrelation({ a: X, b: X, relation: 'related', basis: 'eight chars+' }, 'c')).message).toBe('relation is independent, correlated or comonotone');
    expect(status(() => validateAggregate({ members: [X] }, 'c')).message).toMatch(/2\.\.100/);
    expect(status(() => validateOpenDecision({ kind: 'ignore' }, 'c', 'T')).message).toMatch(/^kind is mitigate, exploit, accept, transfer, avoid/);
    expect(validateOpenDecision({ kind: 'mitigate' }, 'c', 'Corridor').decision).toEqual({ title: 'Mitigate: Corridor', statement: 'The mitigate decision on the exposure "Corridor"', decisionObjectId: null, packageId: null });
    expect(validateSponsor({ digest: 'a'.repeat(64), terms: { option_key: 'q' } }, 'c', 'Morocco').decision.title).toBe('Evaluate: Morocco');
  });
  it('the gaps — what keeps an exposure out of a roll-up, in words', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    expect(gapsOf({ state: 'identified', current_version: 0, accepted_version: null }, now)).toEqual(['unassessed']);
    expect(gapsOf({ state: 'assessed', current_version: 2, accepted_version: null, has_agent_proposal: true }, now)).toEqual(['unaccepted (an agent\'s estimate is a recommendation)']);
    expect(gapsOf({ state: 'contested', current_version: 1, accepted_version: 1, accepted_at: '2026-09-27T00:00:00Z', review_every_days: 30 }, now)).toEqual(['contested']);
    expect(gapsOf({ state: 'accepted', current_version: 1, accepted_version: 1, accepted_at: '2026-09-01T00:00:00Z', review_every_days: 7 }, now)).toEqual(['stale (review due 2026-09-08)']);
    expect(gapsOf({ state: 'accepted', current_version: 1, accepted_version: 1, accepted_at: '2026-09-27T00:00:00Z', review_every_days: null, breach: true, routed_candidate_id: null }, now)).toEqual(['outside appetite — not yet routed']);
    expect(gapsOf({ state: 'closed' }, now)).toEqual(['closed']);
    expect(gapsOf({ state: 'accepted', current_version: 1, accepted_version: 1, accepted_at: '2026-09-27T00:00:00Z', review_every_days: 30, breach: false }, now)).toEqual([]);
  });
  it('the warning origin vocabulary carries `exposure` (0088 §0 widened by 0089 §R1)', () => {
    expect([...ALL_WARNING_ORIGIN_KINDS]).toEqual(['indicator_breach', 'stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation', 'exposure']);
  });
});

describe('B32 exposures · the Risk and Opportunity Agents\' registration', () => {
  const base = { ownerPrincipalId: X, escalationPrincipalId: X, budgets: { max_reads: 1, max_gateway_calls: 0, max_elapsed_ms: 1000 }, stopConditions: [{ kind: 'max_items', value: 2 }] };
  it('registered with this runtime\'s estimate; a foreign digest refused; max_items enforced by their estimate', () => {
    expect(validateRegisterAgent({ kind: 'risk', version: RISK_AGENT_VERSION, codeDigest: RISK_AGENT_DIGEST, ...base }, 'c')).toMatchObject({ kind: 'risk' });
    expect(validateRegisterAgent({ kind: 'opportunity', version: OPPORTUNITY_AGENT_VERSION, codeDigest: OPPORTUNITY_AGENT_DIGEST, ...base }, 'c')).toMatchObject({ kind: 'opportunity' });
    expect(status(() => validateRegisterAgent({ kind: 'risk', version: RISK_AGENT_VERSION, codeDigest: 'b'.repeat(64), ...base }, 'c')).message).toMatch(new RegExp(`registered with this runtime's estimate.*${RISK_AGENT_METHOD}`));
    expect(status(() => validateRegisterAgent({ kind: 'opportunity', version: OPPORTUNITY_AGENT_VERSION, codeDigest: RISK_AGENT_DIGEST, ...base }, 'c')).status).toBe(422);
    expect(STOP_CONDITION_KINDS['max_items']).toEqual(expect.arrayContaining(['risk', 'opportunity']));
    expect(RISK_AGENT_DIGEST).not.toBe(OPPORTUNITY_AGENT_DIGEST);
    expect(RISK_AGENT_DIGEST).toMatch(/^[0-9a-f]{64}$/);
  });
});
