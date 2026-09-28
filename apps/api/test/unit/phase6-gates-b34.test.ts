/**
 * CP-6 B34 · part G — the gate's refusal rows and PDP rules, without a database (0090 §G; F-P6-04).
 *
 * The ports' texts answer through B9's order — 403 the standing, 404 the absence, 409 the record's state, 422 the caller's request —
 * and no earlier row catches them; the older decision texts answer exactly as before. Every gate action is an EXACT, human-gated,
 * C2 rule; no near-name matches it; the gate service's intake refuses the caller's own mistakes in the port's words.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { gateActOf, validateControlIntake, validateDelegationIntake, validateGateIntake, validateOverrideIntake } from '../../src/decision/gates/gate.service.js';

const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), body: r.getResponse() as { code: string; message: string } };
};
const expectAnswer = (code: string, m: string, status: number, body: string): void => {
  const a = answer(code, m);
  expect(a?.status, m).toBe(status);
  expect(a?.body.code, m).toBe(body);
  expect(a?.body.message, m).toBe(m);
};
const ID = '0190b1c2-d3e4-7000-8000-000000000001';

describe('B34 gates · the refusal rows', () => {
  it('403 — the standing', () => {
    for (const m of ['gate rejected (independence): the reviewer who marks a version decision-ready is independent — not its author',
      'gate rejected (authority): principal x is neither the package owner, an approver the policy admits, nor a decision authority',
      "gate rejected: a gate act is the acting principal's own, never on behalf of another", 'override rejected (board): a board decision\'s gate is never overridden',
      'override rejected (separation): the author, proposer, owner, action owner and approvers of a version never override its gate',
      'override review rejected (separation): the grantor never reviews their own override', 'delegation rejected (board): a board decision\'s reserved authority is never delegated',
      'delegation end rejected: only the delegator ends or reassigns their delegation', 'preview rejected (authority): the consequence preview is read by a named, active decision authority',
      'commitment rejected (override_self): the committing authority granted an override on this version', 'commitment rejected (board_quorum): a board decision needs 2 live approvals of the board; 1 stand now',
      'approval rejected (board): a board decision\'s approval is never delegated', "approval conditions rejected: outside the caller's scope"]) {
      expectAnswer('42501', m, 403, 'EYE-AUT-001');
    }
  });
  it('404 — the absences', () => {
    for (const m of ['gate rejected: no such package in this domain', `override review rejected: no such override in this domain`, 'delegation end rejected: no such delegation in this domain',
      `approval rejected (condition_ref): condition 0 names no indicator of this domain (${ID})`, 'preview rejected: no such version 2 of package x', 'control rejected: no such package in this domain']) {
      expectAnswer('23503', m, 404, 'EYE-STA-001');
    }
  });
  it('409 — the record\'s state', () => {
    for (const m of ['gate rejected (state): version 1 is committed', 'gate rejected (stale_package): the information package read (x) is not the package now (y)',
      'override rejected (nothing_to_override): version 1 has no failing condition', 'override review rejected (reviewed): override x was reviewed at y',
      'delegation rejected (duplicate): principal x already delegates', 'delegation end rejected (ended): delegation x ended at y', 'board reservation rejected (reserved): package x is already reserved',
      'preview rejected (state): version 1 is deferred', 'preview rejected: the digest previewed (x) is not the digest of version 1 (y)',
      'commitment rejected (conditions_hold): 1 approval condition(s) do not hold at commitment — only if customs pre-clearance holds (assumption_holds x)',
      'commitment rejected (not_ready): no independent reviewer has marked version 1 decision-ready', 'commitment rejected (no_preview): the commitment carries the digest of a consequence preview',
      'approval rejected (delegation): your delegate already signed version 1 on your behalf']) {
      expectAnswer(m.includes('duplicate') ? '23505' : '22023', m, 409, 'EYE-STA-002');
    }
  });
  it('422 — the caller\'s own request', () => {
    for (const m of ['gate rejected (next_review): a defer names its next review', 'gate rejected (rationale): a gate act states its rationale (8 to 4000 characters)',
      'override rejected (rationale): an override states its rationale', 'delegation rejected (expiry): a delegation expires in the future and within 30 days',
      'board reservation rejected (board): the board names its charter (8+ characters) and a whole quorum of at least 2', 'control rejected (backdated): a control takes effect now or later',
      'approval rejected (conditions): condition 0 kind gut_feeling is not one of assumption_holds']) {
      expectAnswer('22023', m, 422, 'EYE-REQ-001');
    }
  });
  it('the older decision texts answer as before (B24\'s markers 409; 0042\'s sentences unmapped)', () => {
    expectAnswer('22023', 'commitment rejected (source_impact): 1 active source-impact marker(s) bear on version 1', 409, 'EYE-STA-002');
    expect(answer('42501', 'commitment rejected: quorum is 2 distinct eligible humans; 1 live approval(s) stand now')).toBeNull();
    expect(answer('22023', 'approval rejected: the digest approved (x) is not the digest of version 1 (y)')).toBeNull();
  });
});

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (action: string, roles: string[], over: Partial<PolicyInput> = {}): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password', bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action, objectType: 'DPK', objectId: null, purposeId: 'decision', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' }, ...over,
});

describe('B34 gates · the PDP rules', () => {
  const pdp = new PdpService();
  const RULES: Array<[string, string[], string[]]> = [
    ['decision.gate.review', ['decision_owner', 'decision_approver', 'decision_authority', 'executive', 'domain_analyst'], ['decision_agent', 'domain_admin']],
    ['decision.gate.acknowledge', ['decision_owner', 'decision_approver', 'executive'], ['decision_agent', 'briefing_agent']],
    ['decision.gate.ready', ['decision_approver', 'decision_authority', 'executive', 'domain_analyst'], ['decision_owner', 'decision_agent']],
    ['decision.gate.defer', ['decision_owner', 'decision_approver', 'decision_authority'], ['executive', 'decision_agent']],
    ['decision.gate.reject', ['decision_owner', 'decision_approver', 'decision_authority'], ['executive', 'domain_analyst']],
    ['decision.gate.request_information', ['decision_owner', 'decision_approver', 'decision_authority'], ['executive', 'decision_agent']],
    ['decision.gate.resume', ['decision_owner', 'decision_approver', 'decision_authority'], ['executive', 'decision_agent']],
    ['decision.commit.preview', ['decision_authority'], ['decision_owner', 'decision_approver', 'executive']],
    ['decision.override.grant', ['decision_authority', 'executive'], ['decision_owner', 'decision_approver']],
    ['decision.override.review', ['decision_authority', 'executive'], ['decision_owner', 'decision_approver']],
    ['decision.delegation.grant', ['decision_approver'], ['decision_owner', 'decision_authority', 'executive', 'decision_agent']],
    ['decision.delegation.end', ['decision_approver'], ['decision_owner', 'executive']],
    ['decision.board.reserve', ['executive'], ['decision_owner', 'decision_authority', 'platform_admin']],
    ['decision.control.record', ['executive', 'decision_authority', 'domain_admin'], ['decision_owner', 'decision_approver']],
  ];
  it('each action: its roles allowed with the human gate at C2; others denied; C3 denied; a near-name indeterminate', () => {
    for (const [action, allowed, denied] of RULES) {
      for (const role of allowed) {
        const r = pdp.evaluate(input(action, [role]));
        expect(r.decision, `${action} ${role}`).toBe('allow_with_obligations');
        expect(r.obligations, action).toEqual([{ type: 'human_gate' }]);
      }
      for (const role of denied) expect(pdp.evaluate(input(action, [role])).decision, `${action} ${role}`).toBe('deny');
      expect(pdp.evaluate(input(action, [allowed[0] as string], { consequenceClass: 'C3' })).decision, action).toBe('deny');
      expect(pdp.evaluate(input(`${action}.all`, [allowed[0] as string])).decision, `${action}.all`).toBe('indeterminate');
    }
    // the commit stays exact and C3; its preview is a different action
    expect(pdp.evaluate(input('decision.commit', ['decision_authority'], { consequenceClass: 'C3' })).decision).toBe('allow_with_obligations');
  });
});

describe('B34 gates · the intake', () => {
  const refusedWith = (fn: () => unknown, re: RegExp) => {
    try { fn(); } catch (e) { expect(e).toBeInstanceOf(HttpException); expect((e as HttpException).getStatus()).toBe(422); expect(String(((e as HttpException).getResponse() as { message: string }).message)).toMatch(re); return; }
    throw new Error('expected a 422');
  };
  it('the act segment, the next review, the ready digest', () => {
    expect(gateActOf('request-information', 'c')).toBe('request_information');
    refusedWith(() => gateActOf('postpone', 'c'), /^gate rejected \(action\)/);
    refusedWith(() => validateGateIntake('defer', { rationale: 'no next review given' }, 'c'), /^gate rejected \(next_review\)/);
    refusedWith(() => validateGateIntake('defer', { rationale: 'a bad instant', nextReviewAt: 'soon' }, 'c'), /nextReviewAt must be an ISO instant/);
    refusedWith(() => validateGateIntake('ready', { rationale: 'no digest' }, 'c'), /^gate rejected \(stale_package\)/);
    expect(validateGateIntake('review', { rationale: 'read it all', nextReviewAt: '2030-01-01T00:00:00Z' }, 'c')).toEqual({ rationale: 'read it all', nextReviewAt: null, infoRequest: null, packageDigest: null });
  });
  it('the override, the delegation, the control', () => {
    refusedWith(() => validateOverrideIntake({ kind: 'forever', rationale: 'x' }, 'c'), /^override rejected \(kind\)/);
    refusedWith(() => validateDelegationIntake({ delegate: 'someone', expiresAt: '2030-01-01T00:00:00Z', reason: 'away' }, 'c'), /^delegation rejected \(delegate\)/);
    refusedWith(() => validateDelegationIntake({ delegate: ID, reason: 'away' }, 'c'), /^delegation rejected \(expiry\)/);
    refusedWith(() => validateControlIntake({ kind: 'policy_revision', controlKey: 'k.k', body: [], rationale: 'x' }, 'c'), /^control rejected \(body\)/);
    expect(validateControlIntake({ kind: 'control_decision', controlKey: 'b34.cap', body: { a: 1 }, rationale: 'the cap' }, 'c')).toMatchObject({ effectiveFrom: null, packageId: null });
  });
});
