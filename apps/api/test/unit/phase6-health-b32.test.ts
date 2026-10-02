/*
 * CP-6 B32 (0089 §H) part `health` · the pure halves of the decomposable Strategic Health Score: the intakes (422 on a malformed request —
 * the ports decide the people, the model and the states), the refusal rows of the three port families through the mapper (anchored; B9's
 * order 403 → 404 → 409 → 422; no earlier row answers for them), and the PDP's seven exact rules (who proposes, who approves — a second
 * person, human-gated —, who computes, who acknowledges, challenges and decides).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { CHALLENGE_KINDS, CHANGE_STATES, INPUT_KINDS, PEER_ABSENT, validateAcknowledge, validateApprove, validateChallenge, validateCompute, validateDecideChange, validatePropose,
  validateRefuse, validateWithdraw } from '../../src/executive/health/health.service.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const ID = '0190b1c2-d3e4-7000-8000-000000000301';
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

describe('B32 health · the vocabularies and the intakes', () => {
  it('the vocabularies are the migration\'s (the CHECKs of 0089 §H and the contract\'s input kinds)', () => {
    /* B36 (0094 §S2): the contract's kinds gain capability, execution, outcome and quality (executive.health_input_kinds re-declared) */
    expect([...INPUT_KINDS]).toEqual(['indicator', 'measure', 'risk', 'opportunity', 'capability', 'execution', 'outcome', 'quality']);
    expect([...CHANGE_STATES]).toEqual(['raised', 'acknowledged', 'challenged', 'upheld', 'dismissed', 'withdrawn']);
    expect([...CHALLENGE_KINDS]).toEqual(['input', 'weight', 'threshold', 'formula', 'interpretation']);
    expect(PEER_ABSENT).toEqual({ peer: null, reason: 'no peer input in this product' });
  });
  it('a proposal is a model object and a reason; an approval a note (the anti-gaming review optional here — the port decides)', () => {
    expect(validatePropose({ model: { dimensions: [] }, reason: '  the first definition  ' }, 'c')).toEqual({ model: { dimensions: [] }, reason: 'the first definition' });
    status422(() => validatePropose({ model: [], reason: 'the first definition' }, 'c'), /payload\.model is the score model/);
    status422(() => validatePropose({ model: {}, reason: 'short' }, 'c'), /payload\.reason says why/);
    expect(validateApprove({ note: ' two people agree ', gaming_review: '  ' }, 'c')).toEqual({ note: 'two people agree', gamingReview: null });
    expect(validateApprove({ note: 'two people agree', gaming_review: ' weights moved for the corridor ' }, 'c').gamingReview).toBe('weights moved for the corridor');
    status422(() => validateApprove({ note: 'no' }, 'c'), /payload\.note says why/);
    expect(validateRefuse({ reason: ' the bands are too loose ' }, 'c')).toEqual({ reason: 'the bands are too loose' });
    status422(() => validateRefuse({}, 'c'), /payload\.reason/);
  });
  it('a computation takes an optional instant; a change is acknowledged, challenged, decided or withdrawn with its words', () => {
    expect(validateCompute({}, 'c')).toEqual({ at: null });
    expect(validateCompute({ at: '2026-09-25T12:00:00+02:00' }, 'c')).toEqual({ at: '2026-09-25T10:00:00.000Z' });
    status422(() => validateCompute({ at: 'yesterday' }, 'c'), /payload\.at is an instant/);
    expect(validateAcknowledge({ note: '  ' }, 'c')).toEqual({ note: null });
    expect(validateChallenge({ kind: 'input', statement: ' the corridor reading is one-sided ' }, 'c')).toEqual({ kind: 'input', statement: 'the corridor reading is one-sided' });
    status422(() => validateChallenge({ kind: 'mood', statement: 'the corridor reading is one-sided' }, 'c'), /payload\.kind is one of input, weight/);
    status422(() => validateChallenge({ kind: 'weight', statement: 'no' }, 'c'), /payload\.statement/);
    expect(validateDecideChange({ decision: 'upheld', note: ' the restatement was unexplained ' }, 'c')).toEqual({ decision: 'upheld', note: 'the restatement was unexplained' });
    status422(() => validateDecideChange({ decision: 'maybe', note: 'long enough note' }, 'c'), /upheld or dismissed/);
    status422(() => validateWithdraw({ reason: 'x' }, 'c'), /payload\.reason says why the challenge is withdrawn/);
  });
});

describe('B32 health · the refusal rows (anchored; 403 → 404 → 409 → 422)', () => {
  it('the definition', () => {
    answer('42501', 'health definition rejected: proposed by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'health definition rejected: decided by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'health definition rejected: a definition is proposed by a named human holding executive, domain_admin, strategy_owner or platform_admin (PR-43-003)', 403, 'EYE-AUT-001');
    answer('42501', 'health definition rejected: a definition is approved by a named human holding executive, domain_admin or platform_admin (PR-43-003)', 403, 'EYE-AUT-001');
    answer('42501', 'health definition rejected (separation): the proposer does not approve their own definition; a second person holding executive, domain_admin or platform_admin approves it', 403, 'EYE-AUT-001');
    answer('42501', 'health definition rejected (separation): the proposer does not refuse their own definition; a second person decides it', 403, 'EYE-AUT-001');
    answer('23503', 'health definition rejected: no such definition in this domain', 404, 'EYE-STA-001');
    answer('23503', `health definition rejected: no such objective ${ID} in this domain (a dimension names active OBJ objects)`, 404, 'EYE-STA-001');
    answer('23505', `health definition rejected (pending): proposal ${ID} (version 2) awaits a decision; it is approved or refused first`, 409, 'EYE-STA-002');
    answer('22023', 'health definition rejected (unchanged): the model is unchanged from the active version 1; a version records a change', 409, 'EYE-STA-002');
    answer('22023', `health definition rejected (not_proposed): definition ${ID} (version 1) is active; only a proposal is approved or refused`, 409, 'EYE-STA-002');
    answer('22023', 'health definition rejected (stale_basis): version 3 was proposed against version 1, and version 2 is active now; it is proposed again', 409, 'EYE-STA-002');
    answer('22023', 'health definition rejected (gaming_review): version 2 moves corridor_risk weight_move beyond the anti-gaming policy; the approver records the anti-gaming review (at least 8 characters)', 422, 'EYE-REQ-001');
    answer('22023', 'health definition rejected: the dimension weights sum to 0.9 — they sum to 1', 422, 'EYE-REQ-001');
    answer('22023', 'health definition rejected: unknown key colour (the model carries dimensions, components, min_coverage, change_points and optionally min_confidence)', 422, 'EYE-REQ-001');
  });
  it('the score and the changes', () => {
    answer('42501', 'health score rejected: computed by the acting principal', 403, 'EYE-AUT-001');
    answer('22023', 'health score rejected (no_definition): no approved definition is active in this domain; one person proposes a definition and another approves it', 409, 'EYE-STA-002');
    answer('22023', 'health score rejected: the instant 2027-01-01 00:00:00+00 is after now; a score is computed at or before now', 422, 'EYE-REQ-001');
    answer('42501', 'health change rejected: recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'health change rejected: decided by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'health change rejected: a score change is acknowledged or challenged by a named human of the domain\'s strategy and decision roles', 403, 'EYE-AUT-001');
    answer('42501', 'health change rejected: a challenge is withdrawn by its challenger', 403, 'EYE-AUT-001');
    answer('42501', 'health change rejected: a challenge is decided by a named human holding executive, domain_admin or platform_admin', 403, 'EYE-AUT-001');
    answer('42501', 'health change rejected (separation): the challenger does not decide their own challenge', 403, 'EYE-AUT-001');
    answer('42501', 'health change rejected (separation): the approver of definition version 1 does not decide a challenge to the scores it produced', 403, 'EYE-AUT-001');
    answer('23503', 'health change rejected: no such change in this domain', 404, 'EYE-STA-001');
    answer('22023', `health change rejected (not_raised): change ${ID} is acknowledged; a change is acknowledged while raised`, 409, 'EYE-STA-002');
    answer('22023', `health change rejected (not_open): change ${ID} is challenged; a change carries one challenge`, 409, 'EYE-STA-002');
    answer('22023', `health change rejected (not_challenged): change ${ID} is dismissed; only a live challenge is withdrawn or decided`, 409, 'EYE-STA-002');
    answer('22023', 'health change rejected: a challenge disputes an input, a weight, a threshold, the formula or the interpretation', 422, 'EYE-REQ-001');
    answer('22023', 'health change rejected: a decision states its note (at least 8 characters)', 422, 'EYE-REQ-001');
  });
});

describe('B32 health · the PDP', () => {
  const pdp = new PdpService();
  const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
  const decide = (action: string, role: string, scope: 'DOMAIN' | 'TENANT' = 'DOMAIN') => pdp.evaluate({ action, principal: { principalId: ID, kind: 'human', assurance: 'password',
    bindings: [{ roleCode: role, scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null }] }, delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive',
    consequenceClass: 'C2', objectType: 'HSD', objectId: null, environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
  it('propose: the executive, the domain administrator and the strategy owner, human-gated; approve: a second executive or administrator, human-gated', () => {
    for (const role of ['executive', 'domain_admin', 'strategy_owner']) {
      const d = decide('executive.health.definition.propose', role);
      expect(d.decision, role).toBe('allow_with_obligations');
      expect(d.obligations, role).toEqual([{ type: 'human_gate' }]);
    }
    for (const role of ['domain_analyst', 'risk_agent', 'opportunity_agent', 'decision_owner']) expect(decide('executive.health.definition.propose', role).decision, role).toBe('deny');
    for (const role of ['executive', 'domain_admin']) expect(decide('executive.health.definition.approve', role).obligations, role).toEqual([{ type: 'human_gate' }]);
    for (const role of ['strategy_owner', 'domain_analyst', 'risk_agent']) expect(decide('executive.health.definition.approve', role).decision, role).toBe('deny');
  });
  it('compute is no decision (not human-gated); the change acts are human-gated; deciding a challenge is the executive\'s or the administrator\'s', () => {
    for (const role of ['executive', 'domain_admin', 'strategy_owner', 'domain_analyst']) {
      const d = decide('executive.health.compute', role);
      expect(d.decision, role).toBe('allow');
    }
    expect(decide('executive.health.compute', 'decision_owner').decision).toBe('deny');
    for (const action of ['executive.health.change.acknowledge', 'executive.health.change.challenge']) {
      for (const role of ['executive', 'strategy_owner', 'decision_owner', 'risk_owner', 'domain_analyst']) expect(decide(action, role).obligations, `${action} ${role}`).toEqual([{ type: 'human_gate' }]);
      for (const role of ['auditor', 'risk_agent', 'attention_agent']) expect(decide(action, role).decision, `${action} ${role}`).toBe('deny');
    }
    for (const role of ['executive', 'domain_admin']) expect(decide('executive.health.change.decide', role).obligations, role).toEqual([{ type: 'human_gate' }]);
    for (const role of ['strategy_owner', 'domain_analyst', 'risk_owner']) expect(decide('executive.health.change.decide', role).decision, role).toBe('deny');
    expect(decide('executive.health.read', 'auditor', 'TENANT').decision).toBe('allow');
    expect(decide('executive.health.read', 'domain_analyst').decision).toBe('allow');
    expect(decide('executive.health.readable', 'executive').decision, 'exact: no prefix match').toBe('indeterminate');
  });
});
