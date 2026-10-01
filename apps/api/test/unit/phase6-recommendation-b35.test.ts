/**
 * CP-6 B35 part `recommendation` (0101 §R) — the pure logic: the route validators (the recommendation, the review, the reason, the
 * attestation, the day), the PROPOSAL GATE of FEX-15 (package.service propose's B35 block consults it), the words, EVERY refusal text of the
 * part (the ports', the gate's and the validators') through the observation-errors mapper — the B9 order (403 actor/authority/
 * separation_of_duties, 404 unknown_*, 409 state/stale/duplicate/quality_flagged/unattested, 422 the rest) with B27's `plurality` and its
 * catch-all untouched — and the PDP: exact rules, the Decision Agent records but never reviews, the human gate, no rule reaching C3.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { coverageLine, flagLine, isDay, proposalGate, validateAttest, validateReason, validateRecord, validateReview, versionOf } from '../../src/decision/recommendation/recommendation.service.js';

const C = '00000000-0000-4000-8000-000000000001';
const U = '01a0f78e-7d30-7cea-9b84-1f614e716085';
const msg = (f: () => unknown): string => {
  try { f(); } catch (e) { if (e instanceof HttpException) return String((e.getResponse() as { message?: string }).message); throw e; }
  return '';
};
const mapped = (message: string, code = '22023'): { status: number | null; message: string } => {
  const e = asObservationRefusal({ code, message }, C);
  return e === null ? { status: null, message } : { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) };
};
const REC = (over: Record<string, unknown> = {}) => ({ optionKey: 'reroute', what: 'Dual-source via Morocco', forWhom: 'the decision owner', byWhen: '2026-11-16',
  whatCouldMakeItWrong: [{ statement: 'customs takes longer' }], components: { modelOutputs: [{ statement: 'the run', source: { kind: 'run', ref: U } }] }, ...over });

describe('B35 recommendation · the route validators', () => {
  it('the recommendation: an option key, what 8–2000, for whom 2–512, by when a REAL day, what could make it wrong at least one, the lists ≤ 20 objects, the four components kept apart', () => {
    const r = validateRecord(REC({ what: '  Dual-source via Morocco  ' }), C);
    expect(r).toMatchObject({ optionKey: 'reroute', what: 'Dual-source via Morocco', forWhom: 'the decision owner', byWhen: '2026-11-16', assumptions: [], missingEvidence: [],
                              valueJudgments: [], policyConstraints: [], analyticalAssumptions: [], modelOutputs: [{ statement: 'the run', source: { kind: 'run', ref: U } }] });
    expect(msg(() => validateRecord(REC({ optionKey: 'Re Route' }), C))).toMatch(/^recommendation rejected \(option_key\)/);
    expect(msg(() => validateRecord(REC({ what: 'short' }), C))).toMatch(/^recommendation rejected \(what\)/);
    expect(msg(() => validateRecord(REC({ forWhom: '' }), C))).toMatch(/^recommendation rejected \(for_whom\)/);
    expect(msg(() => validateRecord(REC({ byWhen: '2026-02-30' }), C))).toMatch(/^recommendation rejected \(by_when\)/);
    expect(msg(() => validateRecord(REC({ byWhen: '2026-11-16T10:00:00Z' }), C))).toMatch(/^recommendation rejected \(by_when\)/);
    expect(msg(() => validateRecord(REC({ whatCouldMakeItWrong: [] }), C))).toMatch(/^recommendation rejected \(what_could_make_it_wrong\)/);
    expect(msg(() => validateRecord(REC({ whatCouldMakeItWrong: undefined }), C))).toMatch(/^recommendation rejected \(what_could_make_it_wrong\)/);
    expect(msg(() => validateRecord(REC({ missingEvidence: ['a string'] }), C))).toMatch(/^recommendation rejected \(missing_evidence\)/);
    expect(msg(() => validateRecord(REC({ components: { valueJudgments: Array.from({ length: 21 }, () => ({})) } }), C))).toMatch(/^recommendation rejected \(value_judgments\)/);
  });
  it('the day is the day it names', () => {
    expect(isDay('2024-02-29')).toBe(true);
    expect(isDay('2023-02-29')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay(20261116)).toBe(false);
  });
  it('the review: one of three verdicts, a rationale, an override 16–2000 or none, the digest read 64 hex or none', () => {
    expect(validateReview({ verdict: 'accept_for_consideration', rationale: 'worth weighing' }, C)).toEqual({ verdict: 'accept_for_consideration', rationale: 'worth weighing', override: null, expectedDigest: null });
    expect(validateReview({ verdict: 'decline', rationale: 'worth weighing', override: '  ', expectedDigest: 'a'.repeat(64) }, C)).toMatchObject({ override: null, expectedDigest: 'a'.repeat(64) });
    expect(msg(() => validateReview({ verdict: 'approve', rationale: 'worth weighing' }, C))).toMatch(/^recommendation rejected \(verdict\)/);
    expect(msg(() => validateReview({ verdict: 'decline', rationale: 'no' }, C))).toMatch(/^recommendation rejected \(rationale\)/);
    expect(msg(() => validateReview({ verdict: 'decline', rationale: 'worth weighing', override: 'too short' }, C))).toMatch(/^recommendation rejected \(override\)/);
    expect(msg(() => validateReview({ verdict: 'decline', rationale: 'worth weighing', expectedDigest: 'abc' }, C))).toMatch(/^recommendation rejected \(expected_digest\)/);
  });
  it('the reason, the version and the attestation (named keys 1–100, the reason 16–2000)', () => {
    expect(validateReason({ reason: ' re-scoped ' }, C)).toBe('re-scoped');
    expect(msg(() => validateReason({ reason: 'no' }, C))).toMatch(/^recommendation rejected \(reason\)/);
    expect(versionOf('2', C)).toBe(2);
    expect(msg(() => versionOf('0', C))).toMatch(/^recommendation rejected \(version\)/);
    expect(validateAttest({ missing: [{ key: 'alternatives', category: 'alternatives' }], reason: 'the customs window closes first' }, C))
      .toEqual({ missing: [{ key: 'alternatives', category: 'alternatives', note: null }], reason: 'the customs window closes first' });
    expect(msg(() => validateAttest({ missing: [], reason: 'the customs window closes first' }, C))).toMatch(/^incomplete package rejected \(missing\)/);
    expect(msg(() => validateAttest({ missing: [{ category: 'x' }], reason: 'the customs window closes first' }, C))).toMatch(/^incomplete package rejected \(missing\)/);
    expect(msg(() => validateAttest({ missing: [{ key: 'alternatives' }], reason: 'too short' }, C))).toMatch(/^incomplete package rejected \(reason\)/);
  });
});

describe('B35 recommendation · the proposal gate (FEX-15)', () => {
  const gap = { category: 'alternatives', key: 'alternatives', detail: '1 intervention(s) beside the status quo' };
  it('nothing new without recommendations, when complete, or when not visible', () => {
    expect(proposalGate(null, 1)).toEqual({ refuse: null, humanLed: null });
    expect(proposalGate({ complete: false, gaps: [gap], live_recommendations: 0, mode: 'incomplete', attestation: null }, 1)).toEqual({ refuse: null, humanLed: null });
    expect(proposalGate({ complete: true, gaps: [], live_recommendations: 2, mode: 'complete', attestation: null }, 1)).toEqual({ refuse: null, humanLed: null });
  });
  it('a version carrying recommendations that is incomplete is refused, naming the gaps (and the pending acknowledgement)', () => {
    expect(proposalGate({ complete: false, gaps: [gap], uncovered: [gap], live_recommendations: 1, mode: 'incomplete', attestation: null }, 3).refuse)
      .toMatch(/^incomplete package rejected \(unattested\): version 3 carries 1 live recommendation\(s\) and is incomplete — alternatives: 1 intervention\(s\) beside the status quo; complete the package/);
    expect(proposalGate({ complete: false, gaps: [gap], uncovered: [], live_recommendations: 1, mode: 'attested', attestation: { attestation_id: U, state: 'attested' } }, 1).refuse)
      .toMatch(/attestation .* awaits a second human's acknowledgement$/);
  });
  it('the human-led mode proposes, labelled with the attestation', () => {
    const g = proposalGate({ complete: false, gaps: [gap], live_recommendations: 0, mode: 'human_led', label: 'HUMAN-LED', attestation: { attestation_id: U, state: 'acknowledged', acknowledged_by: C } }, 1);
    expect(g).toEqual({ refuse: null, humanLed: { attestation_id: U, acknowledged_by: C, gaps: ['alternatives'], label: 'HUMAN-LED' } });
  });
  it('the words', () => {
    expect(flagLine([])).toBe('no flag stands');
    expect(flagLine([{ class: 'scenario_quality' }, { class: 'run_indicator', indicator: 'constraint_violated' }])).toBe('SCENARIO QUALITY FAILED, INDICATOR CONSTRAINT VIOLATED');
    expect(coverageLine({ share: null, label: 'DECISION COVERAGE not applicable: no scenario' })).toBe('DECISION COVERAGE not applicable: no scenario');
    expect(coverageLine({ share: 0.5, label: 'DECISION COVERAGE 1 of 2' })).toBe('DECISION COVERAGE 1 of 2');
  });
});

describe('B35 recommendation · every refusal text through the mapper (B9 order; B27\'s rows untouched)', () => {
  it('403: the acting principal, the authority, the separation of duties', () => {
    for (const [t, code] of [['recommendation rejected (actor): a recommendation is recorded by the acting principal', '42501'],
                             ['recommendation rejected (actor): a recommendation is reviewed by a named, active human — an agent records, it never reviews', '42501'],
                             ['recommendation rejected (separation_of_duties): the author of recommendation x does not review it', '42501'],
                             ['recommendation rejected (authority): recommendation x is withdrawn by its author or by the package owner', '42501'],
                             ['incomplete package rejected (actor): an attestation is the acting principal\'s own', '42501'],
                             ['incomplete package rejected (authority): the package owner attests the human-led mode of its own package', '42501'],
                             ['incomplete package rejected (separation_of_duties): the attester does not acknowledge its own attestation; a second human does', '42501']] as const) {
      expect(mapped(t, code)).toMatchObject({ status: 403, message: t });
    }
  });
  it('404: the absences', () => {
    for (const t of ['recommendation rejected (unknown_package): x is not a decision package of this domain', 'recommendation rejected (unknown_version): package x has no version 2',
                     'recommendation rejected (unknown_option): version 1 of package x has no option teleport', 'recommendation rejected (unknown_source): model_outputs[0] names run x, which is not a run of this domain',
                     'recommendation rejected (unknown_recommendation): x is not a recommendation of this domain', 'incomplete package rejected (unknown_attestation): x is not an attestation of this domain',
                     'incomplete package rejected (unknown_package): x', 'incomplete package rejected (unknown_version): package x has no version 3']) {
      expect(mapped(t, '23503')).toMatchObject({ status: 404, message: t });
    }
  });
  it('409: the record\'s state — and B27\'s plurality gate still 409', () => {
    for (const t of ['recommendation rejected (state): version 1 is committed (the package is committed); a recommendation is recorded on a version still being decided',
                     'recommendation rejected (state): version 1 is in the human-led incomplete-package mode (attestation x)', 'recommendation rejected (stale): the recommendation read (a) is not recommendation x now (b)',
                     'recommendation rejected (quality_flagged): recommendation x stands flagged — option hedge rests on run y; it is accepted for consideration only with the reviewer\'s stated override',
                     'incomplete package rejected (state): version 1 is complete — no gap stands; nothing to attest', 'incomplete package rejected (stale): version 1 moved since attestation x',
                     'incomplete package rejected (unattested): version 1 carries 1 live recommendation(s) and is incomplete',
                     'recommendation rejected (plurality): package p version 1 is bound to the scenario set "S" (s), whose plurality check fails']) {
      expect(mapped(t)).toMatchObject({ status: 409, message: t });
    }
  });
  it('422: the caller\'s own request — and B27\'s catch-all still 422 for an unknown class', () => {
    for (const t of ['recommendation rejected (what): says what is recommended (8 to 2000 characters)', 'recommendation rejected (what_could_make_it_wrong): a list of 1 to 20 items {statement}',
                     'recommendation rejected (value_judgments[0].source): each item names its source {kind: principal|objective|stated, ref}', 'recommendation rejected (components): a recommendation separates what it rests on',
                     'recommendation rejected (verdict): a review accepts for consideration, declines or requests changes (got approve)', 'recommendation rejected (override): an override states why',
                     'recommendation rejected (by_when): names the day', 'incomplete package rejected (coverage): the attestation names every gap — unnamed: ["alternatives"]',
                     'incomplete package rejected (missing): ["option:teleport"] is not a gap of version 1', 'incomplete package rejected (reason): the attestation states why', 'incomplete package rejected (act): attest or acknowledge (got x)',
                     'recommendation rejected (other): x']) {
      expect(mapped(t)).toMatchObject({ status: 422, message: t });
    }
  });
});

describe('B35 recommendation · the PDP (exact rules; the agent records, never reviews; the human gate; nothing reaches C3)', () => {
  const pdp = new PdpService();
  const T = '0193a3d0-0000-7000-8000-000000000001'; const D = '0193a3d0-0000-7000-8000-000000000002';
  const at = (action: string, roles: string[], kind: 'human' | 'agent' = 'human', consequenceClass: 'C1' | 'C2' | 'C3' = 'C2'): PolicyInput => ({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'agent' ? 'agent_grant' : 'password',
                 bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'DPK', objectId: null, purposeId: 'decision', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass,
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  } as PolicyInput);
  const allowed = (r: { decision: string }) => r.decision === 'allow' || r.decision === 'allow_with_obligations';
  it('record: the owner, an analyst, the Decision Agent (no human gate); not an approver', () => {
    for (const role of ['decision_owner', 'domain_analyst']) expect(allowed(pdp.evaluate(at('decision.recommendation.record', [role]))), role).toBe(true);
    const ag = pdp.evaluate(at('decision.recommendation.record', ['decision_agent'], 'agent'));
    expect(allowed(ag)).toBe(true);
    expect(ag.obligations.some((o) => o.type === 'human_gate')).toBe(false);
    expect(allowed(pdp.evaluate(at('decision.recommendation.record', ['decision_approver'])))).toBe(false);
  });
  it('review: the owner, the approvers, the authority, an executive, an analyst — human-gated; NEVER the Decision Agent', () => {
    for (const role of ['decision_owner', 'decision_approver', 'decision_authority', 'executive', 'domain_analyst']) {
      const r = pdp.evaluate(at('decision.recommendation.review', [role]));
      expect(allowed(r), role).toBe(true);
      expect(r.obligations).toContainEqual({ type: 'human_gate' });
    }
    expect(allowed(pdp.evaluate(at('decision.recommendation.review', ['decision_agent'], 'agent')))).toBe(false);
  });
  it('withdraw, attest, read: their holders; every rule exact; none at C3', () => {
    expect(allowed(pdp.evaluate(at('decision.recommendation.withdraw', ['decision_owner'])))).toBe(true);
    expect(allowed(pdp.evaluate(at('decision.recommendation.withdraw', ['decision_agent'], 'agent')))).toBe(false);
    for (const role of ['decision_owner', 'decision_approver', 'decision_authority', 'executive']) expect(allowed(pdp.evaluate(at('decision.incomplete.attest', [role]))), role).toBe(true);
    expect(allowed(pdp.evaluate(at('decision.incomplete.attest', ['domain_analyst'])))).toBe(false);
    for (const role of ['decision_agent', 'strategy_owner', 'decision_approver']) expect(allowed(pdp.evaluate(at('decision.recommendation.read', [role], role === 'decision_agent' ? 'agent' : 'human', 'C1'))), role).toBe(true);
    for (const action of ['decision.recommendation.record', 'decision.recommendation.review', 'decision.recommendation.withdraw', 'decision.incomplete.attest']) {
      expect(pdp.evaluate(at(action, ['decision_owner', 'decision_approver', 'decision_authority', 'platform_admin'], 'human', 'C3')).decision, action).toBe('deny');
      expect(allowed(pdp.evaluate(at(`${action}.more`, ['decision_owner', 'decision_approver', 'decision_authority'])))).toBe(false);
    }
  });
});
