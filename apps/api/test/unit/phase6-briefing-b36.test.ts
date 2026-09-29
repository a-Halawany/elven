/*
 * CP-6 B36 (0094 §B) part `briefing` · the pure halves of BRF@v3: the uncertainty band per conclusion (computed, never asserted; unknown
 * when nothing carries it — no number invented), the suppression rule under a policy (the class's rule over the default; the measure is
 * the item's own basis), the urgent-state retention under an outage (the prior's urgent warnings with their ORIGINAL as-of, never
 * doubled), the audience contract (its shape in words; the reader's roles against it; a board audience), the defaults, and the refusal
 * rows of the section's ports through the mapper (anchored; B9's order 403 → 404 → 409 → 422).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DEFAULT_AUDIENCE, DEFAULT_AUDIENCE_ROLES, audienceProblem, bandOfConfidence, defaultExpiry, isBoardAudience, readerInAudience, ruleFor, suppressionOf, uncertaintyOf, urgentRetained,
         type BriefingPolicy } from '../../src/executive/briefings/uncertainty.js';

const KNOWN = '2026-09-30T12:00:00.000Z';
const pg = (message: string, code: string) => Object.assign(new Error(message), { code });
const mapped = (message: string, code: string): { status: number; code: string } => {
  const e = asObservationRefusal(pg(message, code), '0190b1c2-d3e4-7000-8000-000000000001');
  if (!(e instanceof HttpException)) throw new Error(`unmapped: ${message}`);
  return { status: e.getStatus(), code: String((e.getResponse() as { code?: string }).code) };
};

describe('B36 briefing · b1 the uncertainty band is computed from what the cited object carries', () => {
  it('a recorded confidence gives the band; without one the truth state does; nothing to rest on reads unknown — never a number invented', () => {
    expect([bandOfConfidence(0.95), bandOfConfidence(0.8), bandOfConfidence(0.5), bandOfConfidence(0.49)]).toEqual(['high', 'high', 'medium', 'low']);
    const rec = uncertaintyOf({ confidence: 0.9, freshnessHours: 2, sourceState: 'live', truthState: 'inferred' });
    expect(rec.band).toBe('high'); expect(rec.basis.confidence).toBe(0.9); expect(rec.basis.confidence_source).toBe('record'); expect(rec.basis.rules_applied[0]).toMatch(/recorded confidence 0.9 → high/);
    const asserted = uncertaintyOf({ confidence: null, freshnessHours: 2, sourceState: 'operator-upload', truthState: 'asserted' });
    expect(asserted.band).toBe('medium'); expect(asserted.basis.confidence).toBeNull(); expect(asserted.basis.confidence_source).toBe('none');
    expect(uncertaintyOf({ confidence: null, freshnessHours: 2, sourceState: 'internal', truthState: 'synthetic' }).band).toBe('low');
    expect(uncertaintyOf({ confidence: null, freshnessHours: 2, sourceState: 'internal', truthState: 'disputed' }).band).toBe('unknown');
    // a confidence outside 0..1 or not a number is NOT a confidence (no invention)
    expect(uncertaintyOf({ confidence: 'high', freshnessHours: 2, sourceState: 'live', truthState: 'observed' }).basis.confidence).toBeNull();
    expect(uncertaintyOf({ confidence: 7, freshnessHours: 2, sourceState: 'live', truthState: 'observed' }).basis.confidence).toBeNull();
  });
  it('staleness lowers one band; a degraded source lowers one band (unknown when nothing is recorded); independent sources raise one band; unknown never moves', () => {
    expect(uncertaintyOf({ confidence: 0.9, freshnessHours: 500, sourceState: 'live', truthState: 'observed' }).band).toBe('medium');
    expect(uncertaintyOf({ confidence: 0.9, freshnessHours: 500, freshnessBoundHours: 1000, sourceState: 'live', truthState: 'observed' }).band).toBe('high');
    expect(uncertaintyOf({ confidence: 0.9, freshnessHours: 2, sourceState: 'degraded', truthState: 'observed' }).band).toBe('medium');
    expect(uncertaintyOf({ confidence: null, freshnessHours: 2, sourceState: 'degraded', truthState: 'observed' }).band).toBe('unknown');
    expect(uncertaintyOf({ confidence: null, freshnessHours: 2, sourceState: 'blocked', truthState: 'observed' }).band).toBe('unknown');
    const two = uncertaintyOf({ confidence: null, freshnessHours: 2, sourceState: 'live', truthState: 'observed', corroborationRefs: ['x'] });
    expect(two.band).toBe('high'); expect(two.basis.independent_sources).toBe(2);
    expect(uncertaintyOf({ confidence: 0.9, freshnessHours: 2, sourceState: 'live', truthState: 'observed', corroborationRefs: ['x', 'y'] }).band).toBe('high');
    const unknown = uncertaintyOf({ confidence: null, freshnessHours: 5000, sourceState: 'degraded', truthState: 'withdrawn', corroborationRefs: ['x'] });
    expect(unknown.band).toBe('unknown'); expect(unknown.basis.rules_applied).toHaveLength(1);
    // the order of the rules is the order applied: the reader sees why
    expect(uncertaintyOf({ confidence: 0.9, freshnessHours: 500, sourceState: 'degraded', truthState: 'observed', corroborationRefs: ['x'] }).basis.rules_applied.map((r) => r.split(' → ')[0]))
      .toEqual(['recorded confidence 0.9', 'source degraded', '500 h old, beyond 168 h', '2 independent sources']);
  });
});

describe('B36 briefing · b4 the suppression rule under the policy in force', () => {
  const policy: BriefingPolicy = { version: 3, rules: { default: { min_sources: 1, max_staleness_hours: 168, min_confidence: null }, classes: { claim: { min_sources: 2, max_staleness_hours: 24 }, warning: { min_confidence: 0.6 } } } };
  it('the class rule sits over the default; no policy suppresses nothing', () => {
    expect(ruleFor(policy, 'claim')).toEqual({ min_sources: 2, max_staleness_hours: 24, min_confidence: null });
    expect(ruleFor(policy, 'warning')).toEqual({ min_sources: 1, max_staleness_hours: 168, min_confidence: 0.6 });
    expect(ruleFor(policy, 'evidence')).toEqual({ min_sources: 1, max_staleness_hours: 168, min_confidence: null });
    const u = uncertaintyOf({ confidence: null, freshnessHours: 40, sourceState: 'live', truthState: 'asserted' });
    expect(suppressionOf(null, { item_id: 'claim:c@1', kind: 'claim', uncertainty: u })).toBeNull();
  });
  it('a single-source stale claim is suppressed with the rule and the measure; a corroborated fresh one stands; a low-confidence warning is withheld', () => {
    const stale = uncertaintyOf({ confidence: null, freshnessHours: 40, sourceState: 'live', truthState: 'asserted' });
    const s = suppressionOf(policy, { item_id: 'claim:c@1', kind: 'claim', uncertainty: stale });
    expect(s).not.toBeNull();
    expect(s!.rule).toEqual({ min_sources: 2, max_staleness_hours: 24, min_confidence: null, class: 'claim', policy_version: 3 });
    expect(s!.measure).toEqual({ independent_sources: 1, freshness_hours: 40, confidence: null });
    expect(s!.because).toEqual(['1 independent source(s), the policy asks 2', '40 h old, the policy allows 24 h']);
    const fresh = uncertaintyOf({ confidence: null, freshnessHours: 3, sourceState: 'live', truthState: 'asserted', corroborationRefs: ['x'] });
    expect(suppressionOf(policy, { item_id: 'claim:d@1', kind: 'claim', uncertainty: fresh })).toBeNull();
    const weak = uncertaintyOf({ confidence: 0.4, freshnessHours: 3, sourceState: 'internal', truthState: 'inferred' });
    expect(suppressionOf(policy, { item_id: 'warning:w', kind: 'warning', uncertainty: weak })!.because).toEqual(['recorded confidence 0.4, the policy asks 0.6']);
    // a warning that records no confidence is not judged on confidence (nothing is invented to judge it by)
    const none = uncertaintyOf({ confidence: null, freshnessHours: 3, sourceState: 'internal', truthState: 'inferred' });
    expect(suppressionOf(policy, { item_id: 'warning:v', kind: 'warning', uncertainty: none })).toBeNull();
  });
});

describe('B36 briefing · b6 urgent-state retention under an outage', () => {
  const prior = [
    { item_id: 'warning:a', kind: 'warning', at: '2026-09-29T10:00:00.000Z', details: { state: 'raised', level: 'critical', response_window_closes_at: '2026-09-29T20:00:00.000Z' } },
    { item_id: 'warning:b', kind: 'warning', at: '2026-09-29T11:00:00.000Z', details: { state: 'raised', level: 'normal', response_window_closes_at: '2026-10-02T11:00:00.000Z' } },
    { item_id: 'warning:c', kind: 'warning', at: '2026-09-29T12:00:00.000Z', details: { state: 'raised', level: 'normal', response_window_closes_at: '2026-09-29T20:00:00.000Z' } },
    { item_id: 'warning:d', kind: 'warning', at: '2026-09-29T13:00:00.000Z', details: { state: 'acknowledged', level: 'normal', response_window_closes_at: '2026-10-02T11:00:00.000Z' } },
    { item_id: 'evidence:e@1', kind: 'evidence', at: '2026-09-29T14:00:00.000Z', details: {} },
  ];
  it('a critical warning and a warning still inside its window are retained with their ORIGINAL as-of; a closed window, an acknowledged one and a non-warning are not; one composed afresh is not doubled', () => {
    const r = urgentRetained({ priorBriefingId: 'P', priorKnownAt: '2026-09-29T15:00:00.000Z', priorItems: prior, knownAt: KNOWN, presentIds: new Set() });
    expect(r.map((x) => x['item_id'])).toEqual(['warning:a', 'warning:b']);
    expect(r[0]).toMatchObject({ at: '2026-09-29T10:00:00.000Z', retained_from: 'P', retained_as_of: '2026-09-29T15:00:00.000Z' });
    const again = urgentRetained({ priorBriefingId: 'P', priorKnownAt: '2026-09-29T15:00:00.000Z', priorItems: prior, knownAt: KNOWN, presentIds: new Set(['warning:a']) });
    expect(again.map((x) => x['item_id'])).toEqual(['warning:b']);
  });
});

describe('B36 briefing · b3 the audience contract, the defaults', () => {
  it('the contract\'s shape in words; the reader\'s roles against it; an administrator is admitted to every audience; a board audience', () => {
    expect(audienceProblem(DEFAULT_AUDIENCE)).toBeNull();
    expect(audienceProblem(null)).toMatch(/an object/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE, roles: [] })).toMatch(/roles/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE, locale: 'english' })).toMatch(/locale/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE, accessibility: { plain_language: 'yes', screen_reader: false } })).toMatch(/accessibility/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE, channels: ['pigeon'] })).toMatch(/channels/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE, exclude: ['attention'] })).toMatch(/exclude/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE, extra: 1 })).toMatch(/unknown key extra/);
    expect(readerInAudience(null, ['nobody'])).toBe(true);
    expect(readerInAudience({ ...DEFAULT_AUDIENCE, roles: ['executive'] }, ['decision_approver'])).toBe(false);
    expect(readerInAudience({ ...DEFAULT_AUDIENCE, roles: ['executive'] }, ['decision_approver', 'executive'])).toBe(true);
    expect(readerInAudience({ ...DEFAULT_AUDIENCE, roles: ['executive'] }, ['domain_admin'])).toBe(true);
    expect(isBoardAudience({ ...DEFAULT_AUDIENCE, roles: ['board_member'] })).toBe(true);
    expect(isBoardAudience({ ...DEFAULT_AUDIENCE, roles: ['board_member', 'executive'] })).toBe(false);
    expect(DEFAULT_AUDIENCE_ROLES).toContain('board_member'); expect(DEFAULT_AUDIENCE_ROLES).toContain('executive_operator');
    expect(defaultExpiry(KNOWN)).toBe('2026-10-07T12:00:00.000Z');
  });
});

describe('B36 briefing · the refusal rows through the mapper (anchored; 403 → 404 → 409 → 422)', () => {
  it('the family briefing rejected (<class>), briefing policy rejected (<class>), briefing expiry rejected (actor)', () => {
    expect(mapped('briefing rejected (audience): the edition is for the audience executive', '42501')).toEqual({ status: 403, code: 'EYE-AUT-001' });
    expect(mapped('briefing policy rejected (actor): set by the acting principal', '42501')).toEqual({ status: 403, code: 'EYE-AUT-001' });
    expect(mapped('briefing expiry rejected (actor): run by the acting principal', '42501')).toEqual({ status: 403, code: 'EYE-AUT-001' });
    expect(mapped('briefing rejected (unknown_policy): no briefing policy version 9 in this domain', '23503')).toEqual({ status: 404, code: 'EYE-STA-001' });
    expect(mapped('briefing rejected (undeclared_omission): the composition met an unavailable dependency', '22023')).toEqual({ status: 409, code: 'EYE-STA-002' });
    expect(mapped('briefing policy rejected (state): the rules are unchanged from version 1', '22023')).toEqual({ status: 409, code: 'EYE-STA-002' });
    expect(mapped('briefing rejected (uncertainty): item x carries no uncertainty band', '22023')).toEqual({ status: 422, code: 'EYE-REQ-001' });
    expect(mapped('briefing rejected (expiry): expires_at is an instant after the edition\'s known_at', '22023')).toEqual({ status: 422, code: 'EYE-REQ-001' });
    expect(mapped('briefing rejected (suppressed): item x is suppressed under policy and rendered at once', '22023')).toEqual({ status: 422, code: 'EYE-REQ-001' });
    expect(mapped('briefing policy rejected (rules): rules are { default: … }', '22023')).toEqual({ status: 422, code: 'EYE-REQ-001' });
    // 0044/0084's unclassed texts are not this family's: the mapper leaves them as they were (unmapped)
    expect(asObservationRefusal(pg('briefing rejected: a narrative cites the items it summarises', '22023'), '0190b1c2-d3e4-7000-8000-000000000001')).toBeNull();
  });
});
