import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_CHANNELS, AUDIENCE_ROLES, DEFAULT_AUDIENCE_FORM, DEFAULT_POLICY_FORM, ITEM_KINDS, audiencePayload, audienceProblem, bandMark, defaultExpiryLocal, disputedLine, expiryLine,
  fromDatetimeLocal, isBoardAudience, omissionLine, omissionsCount, policyLines, policyRulesPayload, suppressionLine, toDatetimeLocal, uncertaintyLine,
} from './briefings';

/** CP-6 B36 (0094 §B): the studio words what the server says; it judges no band, omission or expiry of its own. */
describe('BRF@v3 is worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (briefing_audience_ok, briefing_policy_rules_ok)', () => {
    expect([...AUDIENCE_CHANNELS]).toEqual(['in-app', 'demo-mailbox', 'email', 'sms', 'teams']);
    expect([...ITEM_KINDS]).toEqual(['evidence', 'claim', 'run', 'branch', 'warning', 'warning-acknowledged', 'memory', 'package', 'dissent', 'disputed', 'indicator']);
    expect(AUDIENCE_ROLES).toContain('board_member'); expect(AUDIENCE_ROLES).toContain('executive_operator');
  });
  it('the audience contract: the form → the server\'s shape; a problem said in words; a board audience recognised', () => {
    const a = audiencePayload({ ...DEFAULT_AUDIENCE_FORM, roles: ['executive', 'board_member'], locale: 'de-DE', plainLanguage: true, screenReader: false, channels: ['in-app', 'demo-mailbox'], exclude: ['indicator'] });
    expect(a).toEqual({ roles: ['executive', 'board_member'], locale: 'de-DE', accessibility: { plain_language: true, screen_reader: false }, channels: ['in-app', 'demo-mailbox'], exclude: ['indicator'] });
    expect('exclude' in audiencePayload(DEFAULT_AUDIENCE_FORM)).toBe(false);
    expect(audienceProblem(DEFAULT_AUDIENCE_FORM)).toBeNull();
    expect(audienceProblem({ ...DEFAULT_AUDIENCE_FORM, roles: [] })).toMatch(/at least one audience role/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE_FORM, locale: 'english' })).toMatch(/language tag/);
    expect(audienceProblem({ ...DEFAULT_AUDIENCE_FORM, channels: [] })).toMatch(/at least one channel/);
    expect(isBoardAudience(['board_member'])).toBe(true);
    expect(isBoardAudience(['board_member', 'executive'])).toBe(false);
    expect(isBoardAudience([])).toBe(false);
  });
  it('the expiry: datetime-local ↔ an instant, round-tripped at minute precision; the default is the cadence after now', () => {
    const iso = '2026-10-07T09:30:00.000Z';
    const local = toDatetimeLocal(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDatetimeLocal(local)).toBe(iso);
    expect(fromDatetimeLocal('')).toBeNull();
    expect(fromDatetimeLocal('not a time')).toBeNull();
    const now = Date.UTC(2026, 8, 30, 12, 0, 0);
    expect(fromDatetimeLocal(defaultExpiryLocal(now))).toBe(new Date(now + 7 * 86_400_000).toISOString());
  });
  it('the band and the ledgers are the server\'s words', () => {
    expect(bandMark('high')).toEqual({ glyph: '●', token: '--eye-color-ink-default', text: 'HIGH' });
    expect(bandMark('nonsense').text).toBe('UNKNOWN');
    expect(uncertaintyLine(undefined)).toMatch(/before BRF@v3/);
    expect(uncertaintyLine({ band: 'low', basis: { confidence: null, confidence_source: 'none', freshness_hours: 300, freshness_bound_hours: 168, source_state: 'live', truth_state: 'inferred', independent_sources: 1, rules_applied: ['no recorded confidence; truth state inferred → low'] } }))
      .toBe('LOW: no recorded confidence; truth state inferred → low · 1 source(s) · 300 h old (bound 168 h) · source live');
    expect(omissionLine({ kind: 'source_degraded', object: null, source: 'SRC:abc@1', reason: 'the latest health verdict is degraded' })).toBe('source degraded — SRC:abc@1: the latest health verdict is degraded');
    expect(omissionLine({ kind: 'outage', object: 'BRF:x', source: null, reason: 'retained' })).toMatch(/^outage — urgent items retained — BRF:x: retained$/);
    expect(suppressionLine({ item_id: 'claim:1@1', kind: 'claim', rule: { class: 'claim', policy_version: 2, min_sources: 2, max_staleness_hours: 24, min_confidence: null }, measure: { independent_sources: 1, freshness_hours: 40, confidence: null }, because: ['1 independent source(s), the policy asks 2', '40 h old, the policy allows 24 h'] }))
      .toBe('claim:1@1 (claim) withheld under policy v2: 1 independent source(s), the policy asks 2; 40 h old, the policy allows 24 h');
    expect(disputedLine({ item_id: 'disputed:d1', basis: 'dissent', as_of: '2026-09-30T10:00:00.000Z', subject: 'DPK:p@1', owner_note: null })).toBe('dissent on DPK:p@1 as of 2026-09-30T10:00:00.000Z');
    expect(disputedLine({ item_id: 'disputed:d1', basis: 'challenge', as_of: 't', subject: null, owner_note: 'answered in the room' })).toBe('challenge as of t — owner\'s note: answered in the room');
    expect([omissionsCount(0), omissionsCount(1), omissionsCount(2)]).toEqual(['no omission declared', '1 omission declared', '2 omissions declared']);
    const fmt = (v: unknown) => String(v);
    expect(expiryLine({}, fmt)).toMatch(/before BRF@v3/);
    expect(expiryLine({ expires_at: 'E', expired: false }, fmt)).toBe('expires E');
    expect(expiryLine({ expires_at: 'E', expired: true, expired_at: null }, fmt)).toBe('EXPIRED — expired E; not yet recorded by the tick');
    expect(expiryLine({ expires_at: 'E', expired: true, expired_at: 'T' }, fmt)).toBe('EXPIRED — expired E; recorded by the tick T');
  });
  it('the suppression policy: the form → the rules, each problem in words; the policy in force as lines', () => {
    expect(policyRulesPayload(DEFAULT_POLICY_FORM)).toEqual({ rules: { default: { min_sources: 1, max_staleness_hours: 168, min_confidence: null } } });
    expect(policyRulesPayload({ ...DEFAULT_POLICY_FORM, minSources: '0' })).toEqual({ problem: expect.stringMatching(/at least 1/) });
    expect(policyRulesPayload({ ...DEFAULT_POLICY_FORM, minConfidence: '1.5' })).toEqual({ problem: expect.stringMatching(/between 0 and 1/) });
    expect(policyRulesPayload({ ...DEFAULT_POLICY_FORM, classOverrides: [{ kind: 'claim', minSources: '2', maxStalenessHours: '24', minConfidence: '' }] }))
      .toEqual({ rules: { default: { min_sources: 1, max_staleness_hours: 168, min_confidence: null }, classes: { claim: { min_sources: 2, max_staleness_hours: 24 } } } });
    expect(policyRulesPayload({ ...DEFAULT_POLICY_FORM, classOverrides: [{ kind: 'nonsense', minSources: '2', maxStalenessHours: '', minConfidence: '' }] })).toEqual({ problem: expect.stringMatching(/not an item kind/) });
    expect(policyRulesPayload({ ...DEFAULT_POLICY_FORM, classOverrides: [{ kind: 'claim', minSources: '', maxStalenessHours: '', minConfidence: '' }] })).toEqual({ problem: expect.stringMatching(/at least one of the three/) });
    expect(policyLines(null)).toEqual(['no suppression policy is published: nothing is withheld']);
    expect(policyLines({ policy_id: 'p', version: 2, rules: { default: { min_sources: 1, max_staleness_hours: 168, min_confidence: 0.4 }, classes: { claim: { min_sources: 2, max_staleness_hours: 24 } } }, reason: 'r', set_by: 's', effective_at: 'e', superseded_at: null }))
      .toEqual(['v2 · default: ≥ 1 source(s), ≤ 168 h old, confidence ≥ 0.4', 'claim: ≥ 2 source(s), ≤ 24 h old']);
  });
});
