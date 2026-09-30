import { describe, expect, it } from 'vitest';
import { eventLine, grantLine, kindGlyph, lagLine, omittedLine, retentionLine, subscriptionStateMark } from './events-b90';

/** CP-6 B90 §E (0095): the event products page is worded, never judged on the client (the states, the head, the lag and the served rows are the server's). */
describe('the event products page is worded, never scored on the client', () => {
  it('a subscription state is a glyph, a token and words naming who acts next — never colour alone', () => {
    expect(subscriptionStateMark('registered', null)).toMatchObject({ glyph: '◌', text: expect.stringMatching(/owner's authorization/) });
    expect(subscriptionStateMark('active', null)).toMatchObject({ glyph: '●', token: '--eye-color-success' });
    expect(subscriptionStateMark('paused', 'schema').text).toMatch(/PAUSED \(schema\).*conform to the new version, then the owner resumes/);
    expect(subscriptionStateMark('paused', 'owner').text).toMatch(/PAUSED \(owner\)/);
    expect(subscriptionStateMark('lagging', 'lag')).toMatchObject({ glyph: '⚑', token: '--eye-color-critical', text: expect.stringMatching(/offset preserved.*then the owner resumes/) });
    expect(subscriptionStateMark('revoked', null).text).toMatch(/offsets preserved; nothing is served/);
    expect(subscriptionStateMark('odd', null).text).toBe('ODD');
  });
  it('the lag line keeps the server\'s checkpoint, head and lag against the policy — BEYOND POLICY only past it, never a percentage', () => {
    const fine = lagLine({ checkpoint_sequence: 4, head: 5, lag_events: 1, lag_policy: { max_lag_events: 2, max_lag_seconds: 86400 } });
    expect(fine).toBe('checkpoint 4 of head 5 — 1 event(s) behind (policy 2 events / 86400 s)');
    const over = lagLine({ checkpoint_sequence: 1, head: 4, lag_events: 3, lag_policy: { max_lag_events: 2, max_lag_seconds: 86400 } });
    expect(over).toMatch(/BEYOND POLICY$/);
    expect(over).not.toMatch(/%/);
  });
  it('the retention, the grant, an event and the omitted count in words', () => {
    expect(retentionLine(30, '2026-08-31 10:00')).toBe('30 day(s) — rows before 2026-08-31 10:00 are not served');
    expect(grantLine({ fields: ['title', 'closes_at'], consequence: 'C2', from: null, to: null })).toBe('title, closes_at · consequence C2 · no time window');
    expect(grantLine({ fields: ['title'], consequence: 'C1', from: '2026-09-01T00:00:00Z', to: null })).toMatch(/from 2026-09-01T00:00:00Z to open$/);
    expect(eventLine({ sequence: 5, event_kind: 'correction', source_event: 'warning.retracted', occurred_at: '2026-09-30T12:00:00Z' })).toBe('#5 ↺ correction · warning.retracted · 2026-09-30T12:00:00Z');
    expect(omittedLine({ omitted: { corrections: 0 } })).toBeNull();
    expect(omittedLine({ omitted: { corrections: 2 } })).toMatch(/^2 correction row\(s\) withheld/);
    expect(['change', 'signal', 'correction', 'lifecycle', 'quality', 'strategic'].map(kindGlyph)).toEqual(['Δ', '⚠', '↺', '⟳', '◈', '◇']);
  });
});
