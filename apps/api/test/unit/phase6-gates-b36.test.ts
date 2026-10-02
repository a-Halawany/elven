/**
 * CP-6 B36 · part G — the gate completion's refusal rows, PDP rules and intakes, without a database (0094 §G; F-P6-04 completes).
 *
 * The ports' texts answer through B9's order — 403 the standing (actor, ownership, authority, separation, class, context, a recused
 * approver), 404 the absence (unknown_*), 409 the record's state (state, stale_digest, a challenged commitment), 422 the caller's own
 * request — and no earlier row catches them (B9's `^challenge rejected` row is the review challenge's: the decision's noun is
 * `decision challenge`). Every B36 gate action is an EXACT, human-gated, C2 rule; the board member holds ONLY decision.board.*; the
 * service's intakes refuse the caller's own mistakes in the port's words.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { boardActOf, decisionMessage, validateDistributeIntake, validateFieldsIntake, validateGateStateIntake, validateReason, validateResolveIntake, validateSignIntake } from '../../src/decision/gates/gate-completion.service.js';

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
const HEX = 'a'.repeat(64);

describe('B36 gates · the refusal rows', () => {
  it('403 — the standing', () => {
    for (const m of ['signature rejected (actor): an approval is signed by its approver, never by another', 'signature rejected (actor): recorded by the acting principal',
      'recusal rejected (authority): principal x is neither an approver the policy admits nor one with a record on version 1', 'recusal rejected (actor): only a named, active member recuses',
      'decision challenge rejected (authority): principal x is neither a member of the package\'s room nor the tenant\'s auditor',
      'challenge resolution rejected (ownership): the package owner resolves a challenge on it', 'challenge resolution rejected (separation): the challenger never resolves their own challenge',
      'distribution rejected (authority): the package owner or a decision authority distributes the decision record', 'version fields rejected (ownership): the version\'s author or the package owner sets its fields',
      'board decision rejected (class): package x is a standard decision; a board member decides a board-class package only, through its gate', 'board decision rejected (authority): a named, active board member decides a board-class package',
      'pdp denial rejected (context): a denial is recorded under the evidence context of the refused request (mode authority)',
      'approval rejected (recused): principal x recused from version 1 of package y; a recused approver does not approve it', "decision record rejected: outside the caller's scope"]) {
      expectAnswer('42501', m, 403, 'EYE-AUT-001');
    }
  });
  it('404 — the absences', () => {
    for (const m of ['signature rejected (unknown_approval): no such approval x on version 1 of package y in this domain', 'signature rejected (unknown_signature): no signature x was recorded in this transaction',
      'recusal rejected (unknown_package): no such package in this domain', 'decision challenge rejected (unknown_version): no such version 2 of package x', 'challenge resolution rejected (unknown_challenge): no such challenge in this domain',
      'distribution rejected (unknown_delivery): no such distribution row in this domain', 'version fields rejected (unknown_version): no such version 2 of package x', 'board decision rejected (unknown_package): no such package in this domain',
      'gate state rejected (unknown_subject): no such subject is visible in this domain']) {
      expectAnswer('23503', m, 404, 'EYE-STA-001');
    }
  });
  it('409 — the record\'s state', () => {
    for (const m of ['signature rejected (stale_digest): the digest signed (x) is not the approval\'s digest now (y); read it again and sign what stands', 'signature rejected (state): version 1 is approved, not committed; a decision is signed after its commitment',
      'signature rejected (state): approval x/1 is already signed by this principal', 'recusal rejected (state): principal x is already recused from version 1', 'decision challenge rejected (state): challenge x is already open on version 1; it is resolved before another is raised',
      'challenge resolution rejected (state): challenge x was dismissed at y', 'distribution rejected (state): version 1 is approved, not committed; the decision record is distributed after its commitment',
      'version fields rejected (state): version 1 is proposed; the fields of a proposed version are immutable — a change is a new version',
      'commitment rejected (challenged): challenge x is open on version 1 of package y; the commitment is held until the owner resolves it']) {
      expectAnswer('22023', m, 409, 'EYE-STA-002');
    }
  });
  it('422 — the caller\'s own request', () => {
    for (const m of ['recusal rejected (reason): a recusal states its reason (8 to 2000 characters)', 'decision challenge rejected (reason): a challenge states its reason (8 to 4000 characters)',
      'challenge resolution rejected (resolution): a challenge is upheld or dismissed', 'distribution rejected (channel): carrier-pigeon is not a channel (in_app, and the SYNTHETIC email, sms, teams)',
      'distribution rejected (recipient): x is not a named, active member of this tenant (an external collaborator is never a recipient)', 'distribution rejected (recipients): no recipient — the package has no room with members and none is named',
      'version fields rejected (missing_information[0].what): says what is missing (4 to 400 characters)', 'version fields rejected (expected_effects[0].direction): up, down or flat',
      'board decision rejected (act): a board member approves, rejects or defers', 'pdp denial rejected (action): graph.strategy.declare is not a decision.* action', 'signature rejected (digest): a subject digest is 64 hex characters']) {
      expectAnswer('22023', m, 422, 'EYE-REQ-001');
    }
  });
  it('the older families answer as before: B9\'s review challenge, B34\'s gate and board reservation, the approval\'s other classes', () => {
    expect(answer('22023', 'challenge rejected: the review is closed')?.status).toBe(422);
    expect(answer('42501', 'gate rejected (authority): principal x is neither the package owner, an approver the policy admits, nor a decision authority')?.status).toBe(403);
    expect(answer('22023', 'board reservation rejected (reserved): package x is already reserved for the board')?.status).toBe(409);
    expect(answer('42501', 'approval rejected (board): a board decision\'s approval is never delegated')?.status).toBe(403);
    expect(answer('22023', 'approval rejected (delegation): your delegate already signed version 1 on your behalf')?.status).toBe(409);
  });
});

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (action: string, roles: string[], over: Partial<PolicyInput> & { kind?: 'human' | 'agent' } = {}): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: over.kind ?? 'human', assurance: 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope: roleCode === 'auditor' || roleCode === 'tenant_admin' ? 'TENANT' as const : 'DOMAIN' as const, tenantId: T, domainId: roleCode === 'auditor' || roleCode === 'tenant_admin' ? null : D })) },
  delegationId: null, action, objectType: 'DPK', objectId: null, purposeId: 'decision',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  ...over,
});

describe('B36 gates · the PDP rules are EXACT, human-gated and ≤ C2; the board member holds only decision.board.*', () => {
  const pdp = new PdpService();
  const allowed = (action: string, roles: string[]) => pdp.evaluate(input(action, roles)).decision;
  it('the holders', () => {
    expect(allowed('decision.sign.approval', ['decision_approver'])).toBe('allow_with_obligations');
    expect(allowed('decision.sign.approval', ['board_member'])).toBe('allow_with_obligations');
    expect(allowed('decision.sign.decision', ['decision_owner'])).toBe('allow_with_obligations');
    expect(allowed('decision.sign.decision', ['decision_authority'])).toBe('allow_with_obligations');
    expect(allowed('decision.recuse', ['decision_approver'])).toBe('allow_with_obligations');
    expect(allowed('decision.challenge', ['auditor'])).toBe('allow_with_obligations');
    expect(allowed('decision.challenge', ['domain_analyst'])).toBe('allow_with_obligations');
    expect(allowed('decision.challenge.resolve', ['decision_owner'])).toBe('allow_with_obligations');
    expect(allowed('decision.distribute', ['decision_authority'])).toBe('allow_with_obligations');
    for (const a of ['decision.board.approve', 'decision.board.reject', 'decision.board.defer']) expect(allowed(a, ['board_member']), a).toBe('allow_with_obligations');
    expect(allowed('decision.board.read', ['board_member'])).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('decision.board.read', ['board_member'])).obligations).toEqual([{ type: 'audit_access' }]);
    expect(pdp.evaluate(input('decision.board.approve', ['board_member'])).obligations).toEqual([{ type: 'human_gate' }]);
  });
  it('who does not hold them: a board member holds NO standard action (approve, the gate acts, commit); an approver holds no board act; the executive never signs a decision; the operator never decides', () => {
    for (const a of ['decision.approve', 'decision.gate.defer', 'decision.gate.reject', 'decision.commit', 'decision.distribute', 'decision.challenge.resolve']) expect(allowed(a, ['board_member']), a).toBe('deny');
    for (const a of ['decision.board.approve', 'decision.board.reject', 'decision.board.defer']) { expect(allowed(a, ['decision_approver']), a).toBe('deny'); expect(allowed(a, ['decision_authority']), a).toBe('deny'); expect(allowed(a, ['executive']), a).toBe('deny'); }
    expect(allowed('decision.sign.decision', ['executive'])).toBe('deny');
    expect(allowed('decision.sign.approval', ['decision_owner'])).toBe('deny');
    expect(allowed('decision.recuse', ['executive'])).toBe('deny');
    expect(allowed('decision.challenge.resolve', ['auditor'])).toBe('deny');
    for (const a of ['decision.board.approve', 'decision.sign.decision', 'decision.distribute', 'decision.recuse']) expect(allowed(a, ['executive_operator']), a).toBe('deny');
    expect(allowed('decision.board.read', ['domain_analyst'])).toBe('deny');
  });
  it('exact: a neighbouring name inherits nothing; nothing at C3; nothing without a purpose', () => {
    expect(allowed('decision.sign.approvals', ['decision_approver'])).toBe('indeterminate');
    expect(allowed('decision.board.approve.twice', ['board_member'])).toBe('indeterminate');
    expect(pdp.evaluate(input('decision.distribute', ['decision_owner'], { consequenceClass: 'C3' })).decision).toBe('deny');
    expect(pdp.evaluate(input('decision.recuse', ['decision_approver'], { purposeId: null })).decision).toBe('deny');
  });
});

describe('B36 gates · the intakes refuse the caller\'s own mistakes in the port\'s words', () => {
  const msg = (fn: () => unknown) => { try { fn(); return ''; } catch (e) { return String((e as { getResponse: () => { message: string } }).getResponse().message); } };
  it('the signature', () => {
    expect(validateSignIntake({ kind: 'approval', digest: HEX, approvalId: ID }, 'c')).toEqual({ kind: 'approval', digest: HEX, approvalId: ID });
    expect(validateSignIntake({ kind: 'decision', digest: HEX, approvalId: ID }, 'c').approvalId).toBeNull();
    expect(msg(() => validateSignIntake({ kind: 'publication', digest: HEX }, 'c'))).toMatch(/^signature rejected \(kind\)/);
    expect(msg(() => validateSignIntake({ kind: 'approval', digest: 'abc', approvalId: ID }, 'c'))).toMatch(/^signature rejected \(digest\)/);
    expect(msg(() => validateSignIntake({ kind: 'approval', digest: HEX }, 'c'))).toMatch(/^signature rejected \(approval\)/);
  });
  it('the reason, the resolution, the distribution, the fields, the board act, the gate state', () => {
    expect(msg(() => validateReason('recusal', { reason: 'short' }, 'c'))).toBe('recusal rejected (reason): states its reason (8+ characters)');
    expect(validateResolveIntake({ challengeId: ID, resolution: 'upheld', note: 'because it was right' }, 'c')).toMatchObject({ resolution: 'upheld' });
    expect(msg(() => validateResolveIntake({ challengeId: ID, resolution: 'sideways', note: 'because it was right' }, 'c'))).toMatch(/^challenge resolution rejected \(resolution\)/);
    expect(validateDistributeIntake({ channels: ['email', 'email'], recipients: [ID] }, 'c')).toEqual({ channels: ['in_app', 'email'], recipients: [ID] });
    expect(validateDistributeIntake({}, 'c')).toEqual({ channels: ['in_app'], recipients: [] });
    expect(msg(() => validateDistributeIntake({ channels: ['pigeon'] }, 'c'))).toMatch(/^distribution rejected \(channel\): pigeon/);
    expect(msg(() => validateDistributeIntake({ recipients: ['nobody'] }, 'c'))).toMatch(/^distribution rejected \(recipient\)/);
    expect(validateFieldsIntake({ missingInformation: [{ what: 'x' }] }, 'c')).toEqual({ missingInformation: [{ what: 'x' }], expectedEffects: [] });
    expect(msg(() => validateFieldsIntake({ expectedEffects: 'no' }, 'c'))).toMatch(/^version fields rejected \(expected_effects\)/);
    expect(boardActOf('defer', 'c')).toBe('defer');
    expect(msg(() => boardActOf('override', 'c'))).toMatch(/^board decision rejected \(act\): override is not a board act/);
    expect(validateGateStateIntake({ kind: 'source', id: ID }, 'c')).toEqual({ kind: 'source', id: ID, version: null });
    expect(msg(() => validateGateStateIntake({ kind: 'publication', id: ID }, 'c'))).toMatch(/^gate state rejected \(kind\)/);
    expect(msg(() => validateGateStateIntake({ kind: 'decision', id: ID, version: 0 }, 'c'))).toMatch(/^gate state rejected \(version\)/);
  });
  it('the SYNTHETIC channels\' message says so and carries the record digest', () => {
    const m = decisionMessage({ title: 'Reroute (SYNTHETIC)', version: 1, recordDigest: HEX, commitmentId: ID, signatures: 2, conditions: 1 });
    expect(m.subject).toBe('[decision record] Reroute (SYNTHETIC) — version 1 committed');
    expect(m.body).toMatch(/2 signature\(s\) beyond the audit chain; 1 approval condition\(s\)/);
    expect(m.body).toMatch(/SYNTHETIC — delivered to a LOCAL sink/);
    expect(m.body).toMatch(/its receipt is not your acknowledgement/);
  });
});
