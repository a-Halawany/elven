/**
 * CP-6 B35 part `explanation` (0101 §E) — the pure logic: the route validators (the subject, the rendering and its sentences, the case, the
 * assignment, the adjudication, the closure), the items counted per category, the tick step's name and order, EVERY refusal text of the
 * part (the ports' and the validators') through the observation-errors mapper — the B9 order (403 actor/authority/standing/separation,
 * 404 unknown_*, 409 state/stale/duplicate/unavailable, 422 the rest), no older row catching them — and the PDP's EXACT rules (no prefix
 * reaches them; the decision agent renders and generates, never opens, adjudicates or closes; nothing reaches C3).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import {
  APPEAL_DEADLINES_ORDER, APPEAL_DEADLINES_STEP, itemsByCategory, validateAdjudicate, validateAssign, validateClose, validateOpen, validateRender, validateSentences, validateSubject,
} from '../../src/decision/explanation/explanation.service.js';

const C = '00000000-0000-4000-8000-000000000001';
const U = '01a0f78e-7d30-7cea-9b84-1f614e716085';
const msg = (f: () => unknown): string => {
  try { f(); } catch (e) { if (e instanceof HttpException) return String((e.getResponse() as { message?: string }).message); throw e; }
  return '';
};
const status = (f: () => unknown): number => { try { f(); } catch (e) { if (e instanceof HttpException) return e.getStatus(); throw e; } return 0; };

describe('B35 explanation · the route validators', () => {
  it('the subject: one of six kinds, a uuid, the version required for a package version and an analysis', () => {
    expect(validateSubject({ subjectKind: 'forecast', subjectId: U }, C)).toEqual({ subjectKind: 'forecast', subjectId: U, subjectVersion: null });
    expect(validateSubject({ subjectKind: 'package_version', subjectId: U, subjectVersion: 2 }, C)).toEqual({ subjectKind: 'package_version', subjectId: U, subjectVersion: 2 });
    expect(msg(() => validateSubject({ subjectKind: 'scenario', subjectId: U }, C))).toMatch(/^explanation rejected \(subject_kind\)/);
    expect(msg(() => validateSubject({ subjectKind: 'run', subjectId: 'x' }, C))).toMatch(/^explanation rejected \(subject\): a uuid/);
    expect(msg(() => validateSubject({ subjectKind: 'analysis', subjectId: U }, C))).toMatch(/^explanation rejected \(version\): a analysis is explained at a named version/);
    expect(msg(() => validateSubject({ subjectKind: 'option', subjectId: U, subjectVersion: 0 }, C))).toMatch(/^explanation rejected \(version\)/);
  });
  it('the rendering: an audience (role, language, accessibility?) and 1–40 sentences each {text, cites: [I<n>]}', () => {
    const r = validateRender({ audience: { role: ' executive ', language: 'en' }, sentences: [{ text: 'The reroute keeps the line running.', cites: ['I1', 'I12'] }] }, C);
    expect(r).toEqual({ audience: { role: 'executive', language: 'en', accessibility: null }, sentences: [{ text: 'The reroute keeps the line running.', cites: ['I1', 'I12'] }] });
    expect(msg(() => validateRender({ audience: { role: 'x', language: 'en' }, sentences: [{ text: 'abcdefgh', cites: [] }] }, C))).toMatch(/^explanation rejected \(audience\)/);
    expect(msg(() => validateSentences([], C))).toMatch(/^explanation rejected \(sentences\): a rendering is 1 to 40/);
    expect(msg(() => validateSentences([{ text: 'cites a bad id', cites: ['X1'] }], C))).toMatch(/^explanation rejected \(sentences\): sentence 1/);
    expect(msg(() => validateSentences(Array.from({ length: 41 }, () => ({ text: 'abcdefgh', cites: ['I1'] })), C))).toMatch(/1 to 40/);
  });
  it('the case: kind, subject, scope (statement, fields, items, rendering), grounds 16–4000, evidence ≤ 20, an instant for the deadline', () => {
    const o = validateOpen({ subjectKind: 'source', subjectId: U, explanationId: U, scope: { statement: '  the source behind the forecast ', items: ['I3'] }, grounds: 'The source counts the strait, not the corridor.',
      evidence: [{ kind: 'note', statement: 'coverage note' }], deadlineAt: '2026-10-15T09:00:00Z' }, C);
    expect(o).toMatchObject({ subjectKind: 'source', subjectId: U, subjectVersion: null, explanationId: U, scope: { statement: 'the source behind the forecast', items: ['I3'] }, deadlineAt: '2026-10-15T09:00:00.000Z' });
    expect(validateOpen({ subjectKind: 'package', subjectId: U, scope: { statement: 'the decision' }, grounds: 'the decision rests on a closed corridor' }, C)).toMatchObject({ evidence: [], deadlineAt: null, explanationId: null });
    expect(msg(() => validateOpen({ subjectKind: 'run', subjectId: U, scope: { statement: 'the decision' }, grounds: 'the decision rests on a closed corridor' }, C))).toMatch(/^appeal rejected \(subject_kind\)/);
    expect(msg(() => validateOpen({ subjectKind: 'package', subjectId: U, scope: { statement: 'short' }, grounds: 'the decision rests on a closed corridor' }, C))).toMatch(/^appeal rejected \(scope\)/);
    expect(msg(() => validateOpen({ subjectKind: 'package', subjectId: U, scope: { statement: 'the decision', items: ['3'] }, grounds: 'the decision rests on a closed corridor' }, C))).toMatch(/^appeal rejected \(scope\): items/);
    expect(msg(() => validateOpen({ subjectKind: 'package', subjectId: U, scope: { statement: 'the decision' }, grounds: 'too short' }, C))).toMatch(/^appeal rejected \(grounds\)/);
    expect(msg(() => validateOpen({ subjectKind: 'package', subjectId: U, scope: { statement: 'the decision' }, grounds: 'the decision rests on a closed corridor', evidence: [{}] }, C))).toMatch(/^appeal rejected \(evidence\)/);
    expect(msg(() => validateOpen({ subjectKind: 'package', subjectId: U, scope: { statement: 'the decision' }, grounds: 'the decision rests on a closed corridor', deadlineAt: 'next week' }, C))).toMatch(/^appeal rejected \(deadline\)/);
  });
  it('the assignment, the adjudication (the correction required unless dismissed) and the closure', () => {
    expect(validateAssign({ adjudicator: U }, C)).toEqual({ adjudicator: U });
    expect(msg(() => validateAssign({ adjudicator: 'someone' }, C))).toMatch(/^appeal rejected \(adjudicator\)/);
    expect(validateAdjudicate({ outcome: 'dismissed', rationale: 'Nothing has changed since then.', correction: 'ignored' }, C)).toEqual({ outcome: 'dismissed', rationale: 'Nothing has changed since then.', correction: null });
    expect(validateAdjudicate({ outcome: 'partly_upheld', rationale: 'The scope is corrected, not the counts.', correction: ' observation layer restates ' }, C)).toMatchObject({ correction: 'observation layer restates' });
    expect(msg(() => validateAdjudicate({ outcome: 'accepted', rationale: 'Nothing has changed since then.' }, C))).toMatch(/^appeal rejected \(outcome\)/);
    expect(msg(() => validateAdjudicate({ outcome: 'upheld', rationale: 'short' }, C))).toMatch(/^appeal rejected \(rationale\)/);
    expect(msg(() => validateAdjudicate({ outcome: 'upheld', rationale: 'The routing no longer holds; reopen.' }, C))).toMatch(/^appeal rejected \(correction\)/);
    expect(validateClose({ note: ' answered and notified ' }, C)).toEqual({ note: 'answered and notified' });
    expect(msg(() => validateClose({ note: 'done' }, C))).toMatch(/^appeal rejected \(note\)/);
  });
  it('the items counted per category (every category present); the tick step is appeal-deadlines at 71', () => {
    expect(itemsByCategory([{ category: 'model_inference' }, { category: 'model_inference' }, { category: 'agent_judgment' }, { category: 'other' }, {}])).toEqual({
      source_evidence: 0, deterministic_transformation: 0, model_inference: 2, agent_judgment: 1, human_assessment: 0 });
    expect([APPEAL_DEADLINES_STEP, APPEAL_DEADLINES_ORDER]).toEqual(['appeal-deadlines', 71]);
  });
});

describe('B35 explanation · every refusal text through the mapper (B9 order; no older row catches them)', () => {
  const pg = (code: string, message: string) => asObservationRefusal(Object.assign(new Error(message), { code }), C);
  const cases: Array<[string, string, number]> = [
    ['42501', 'explanation rejected (actor): recorded by the acting principal', 403],
    ['42501', 'appeal rejected (actor): a contest is a named, active human\'s act — an agent never opens one', 403],
    ['42501', 'appeal rejected (authority): only the assigned adjudicator adjudicates case x', 403],
    ['42501', 'appeal rejected (standing): principal x has no standing to contest a package under standing v1', 403],
    ['42501', 'appeal rejected (separation): the adjudicator is neither the appellant nor an owner of the contested subject', 403],
    ['23503', 'explanation rejected (unknown_subject): forecast x is not visible in this domain', 404],
    ['23503', 'explanation rejected (unknown_explanation): x is not an explanation of this domain', 404],
    ['23503', 'appeal rejected (unknown_subject): package x is not visible in this domain', 404],
    ['23503', 'appeal rejected (unknown_case): x is not an appeal case of this domain', 404],
    ['22023', 'explanation rejected (state): explanation x (v1) is superseded by v2; render the current explanation', 409],
    ['22023', 'explanation rejected (stale): the subject of explanation x moved since it was generated', 409],
    ['22023', 'explanation rejected (unavailable): the recommendation part (§R, decision.recommendations) is not installed', 409],
    ['22023', 'appeal rejected (unavailable): the analysis part is not installed', 409],
    ['22023', 'appeal rejected (state): case x is closed', 409],
    ['22023', 'appeal rejected (duplicate): case x of yours on this package is still open', 409],
    ['22023', 'explanation rejected (unfaithful): the rendering fails the faithfulness check v1 — sentence 1 unsupported: the sentence cites no explanation item', 422],
    ['22023', 'explanation rejected (subject_kind): an explanation explains a package_version, recommendation, analysis, forecast, run or option', 422],
    ['22023', 'explanation rejected (version): a package_version is explained at a named version', 422],
    ['22023', 'explanation rejected (audience): the audience names a role', 422],
    ['22023', 'explanation rejected (sentences): a rendering is 1 to 40 sentences', 422],
    ['22023', 'explanation rejected (category): x is not an item category', 422],
    ['22023', 'explanation rejected (role): x is not an item role', 422],
    ['22023', 'appeal rejected (subject_kind): a case contests a package, forecast, source, claim, recommendation or explanation', 422],
    ['22023', 'appeal rejected (grounds): the grounds are stated (16 to 4000 characters)', 422],
    ['22023', 'appeal rejected (scope): the scope states what is contested', 422],
    ['22023', 'appeal rejected (evidence): the evidence is a list of at most 20', 422],
    ['22023', 'appeal rejected (deadline): the response deadline lies between one hour and 90 days ahead', 422],
    ['22023', 'appeal rejected (explanation): explanation x does not explain the contested subject', 422],
    ['22023', 'appeal rejected (adjudicator): the adjudicator is a named, active human of the bench — never an agent', 422],
    ['22023', 'appeal rejected (outcome): a case is upheld, dismissed or partly_upheld', 422],
    ['22023', 'appeal rejected (rationale): the adjudication states its rationale', 422],
    ['22023', 'appeal rejected (correction): an upheld or partly upheld case states the correction', 422],
    ['22023', 'appeal rejected (note): the closure says why', 422],
  ];
  it.each(cases)('%s %s → %s', (code, text, expected) => {
    const e = pg(code, text);
    expect(e, text).not.toBeNull();
    expect(e!.getStatus()).toBe(expected);
    expect(String((e!.getResponse() as { message?: string }).message)).toBe(text);
  });
  it('the validators answer 422 in the same family', () => {
    expect(status(() => validateSubject({ subjectKind: 'x', subjectId: U }, C))).toBe(422);
    expect(status(() => validateOpen({}, C))).toBe(422);
  });
});

describe('B35 explanation · the PDP: EXACT rules, before nothing they share', () => {
  const T = '0193a3d0-0000-7000-8000-000000000001';
  const D = '0193a3d0-0000-7000-8000-000000000002';
  const pdp = new PdpService();
  const at = (action: string, roles: string[], consequenceClass: PolicyInput['consequenceClass'] = 'C2') => pdp.evaluate({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password',
                 bindings: roles.map((roleCode) => ({ roleCode, scope: (roleCode === 'auditor' ? 'TENANT' : 'DOMAIN') as 'TENANT' | 'DOMAIN', tenantId: T, domainId: roleCode === 'auditor' ? null as unknown as string : D })) },
    delegationId: null, action, objectType: 'APL', objectId: null, purposeId: 'decision', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass,
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  }).decision;
  const allowed = (d: string) => d === 'allow' || d === 'allow_with_obligations';
  it('the decision agent generates and renders (renders only) — never opens, adjudicates or closes a case', () => {
    expect(allowed(at('decision.explanation.generate', ['decision_agent']))).toBe(true);
    expect(allowed(at('decision.explanation.render', ['decision_agent']))).toBe(true);
    expect(allowed(at('decision.explanation.read', ['decision_agent']))).toBe(true);
    for (const a of ['decision.appeal.open', 'decision.appeal.adjudicate', 'decision.appeal.close']) expect(allowed(at(a, ['decision_agent'])), a).toBe(false);
  });
  it('the bench adjudicates (authority, executive, domain admin); an opener without a bench role does not; a strategy owner opens', () => {
    for (const r of ['decision_authority', 'executive', 'domain_admin']) expect(allowed(at('decision.appeal.adjudicate', [r])), r).toBe(true);
    for (const r of ['strategy_owner', 'decision_owner', 'forecast_owner', 'domain_analyst']) expect(allowed(at('decision.appeal.adjudicate', [r])), r).toBe(false);
    for (const r of ['strategy_owner', 'forecast_owner', 'decision_owner', 'domain_analyst', 'risk_owner']) expect(allowed(at('decision.appeal.open', [r])), r).toBe(true);
    expect(allowed(at('decision.appeal.open', ['collection_manager']))).toBe(false);
  });
  it('matches EXACTLY: neighbouring names inherit nothing; nothing reaches C3', () => {
    for (const a of ['decision.appeal', 'decision.appeal.opened', 'decision.explanation', 'decision.explanation.renders', 'decision.appeals.open']) expect(allowed(at(a, ['decision_authority', 'executive', 'decision_agent'])), a).toBe(false);
    for (const a of ['decision.explanation.generate', 'decision.appeal.open', 'decision.appeal.adjudicate']) expect(allowed(at(a, ['decision_authority', 'executive', 'strategy_owner'], 'C3')), a).toBe(false);
  });
});
