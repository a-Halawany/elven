/**
 * CP-6 B40 §AP — the acquisition-time policy's pure functions (src/observation/acquisition-policy/policy-model.ts): the window, robots.txt
 * (RFC 9309), the licence of the rights terms, residency, Retry-After, the contract's backoff (never sooner, bounded, exhausted), and the
 * response anomaly check. No database, no network. SYNTHETIC inputs.
 */
import { describe, expect, it } from 'vitest';
import { assertSyntheticListener, ActTargetRefused } from '../../../../scripts/act-target.mjs';
import {
  MAX_HOLD_SECONDS, contractBackoff, licenceVerdict, parseRetryAfter, parseRobots, residencyVerdict, responseAnomalies, responseFingerprint,
  robotsVerdict, windowVerdict,
} from '../../src/observation/acquisition-policy/policy-model.js';

const allWeek = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const window = (over: Partial<{ days: typeof allWeek[number][]; from: number; to: number; blackout: Array<{ from: string; to: string; reason: string }> }> = {}) =>
  ({ days: [...(over.days ?? allWeek)], hours_utc: { from: over.from ?? 0, to: over.to ?? 24 }, blackout: over.blackout ?? [] });

describe('the collection window (UTC)', () => {
  const tue10 = new Date('2026-10-20T10:30:00Z');   // a Tuesday
  it('open inside the days and hours; closed on another day, outside the hours, inside a blackout', () => {
    expect(windowVerdict(window(), tue10).open).toBe(true);
    expect(windowVerdict(window({ days: ['mon', 'wed'] }), tue10)).toMatchObject({ open: false, reason: expect.stringContaining('tue (UTC) is not a collection day') });
    expect(windowVerdict(window({ from: 12, to: 18 }), tue10)).toMatchObject({ open: false, reason: expect.stringContaining('outside the collection hours 12:00–18:00 UTC') });
    expect(windowVerdict(window({ from: 10, to: 11 }), tue10).open).toBe(true);
    const b = windowVerdict(window({ blackout: [{ from: '2026-10-20T10:00:00Z', to: '2026-10-20T11:00:00Z', reason: 'publisher maintenance (SYNTHETIC)' }] }), tue10);
    expect(b).toMatchObject({ open: false, blackout: { reason: 'publisher maintenance (SYNTHETIC)' } });
    // the blackout's end is exclusive
    expect(windowVerdict(window({ blackout: [{ from: '2026-10-20T09:00:00Z', to: '2026-10-20T10:30:00Z', reason: 'ended' }] }), tue10).open).toBe(true);
  });
});

describe('robots.txt (RFC 9309)', () => {
  const groups = parseRobots('# synthetic\nUser-agent: *\nAllow: /v1/\nDisallow: /internal/\n\nUser-agent: other-bot\nDisallow: /\n');
  it('groups by user agent; the longest rule wins, allow wins a tie, no match allows', () => {
    expect(groups).toEqual([{ agents: ['*'], rules: [{ allow: true, path: '/v1/' }, { allow: false, path: '/internal/' }] }, { agents: ['other-bot'], rules: [{ allow: false, path: '/' }] }]);
    expect(robotsVerdict(groups, 'https://x.example/v1/vessel-calls?date=2026-10-20')).toMatchObject({ allowed: true, group: '*', matched: 'Allow: /v1/' });
    expect(robotsVerdict(groups, 'https://x.example/internal/a')).toMatchObject({ allowed: false, matched: 'Disallow: /internal/' });
    expect(robotsVerdict(groups, 'https://x.example/other')).toMatchObject({ allowed: true, matched: null });
    expect(robotsVerdict(parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n'), 'https://x.example/a/b')).toMatchObject({ allowed: true });
    expect(robotsVerdict(parseRobots('User-agent: *\nDisallow: /*.pdf$\n'), 'https://x.example/doc.pdf').allowed).toBe(false);
    expect(robotsVerdict(parseRobots('User-agent: *\nDisallow: /*.pdf$\n'), 'https://x.example/doc.pdf?x=1').allowed).toBe(true);
  });
  it('a group naming the product agent replaces the * group; an empty disallow is no rule', () => {
    const g = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: the-eye-observation\nDisallow:\n');
    expect(robotsVerdict(g, 'https://x.example/anything')).toMatchObject({ allowed: true, group: 'the-eye-observation' });
    expect(robotsVerdict(parseRobots(''), 'https://x.example/anything').allowed).toBe(true);
  });
});

describe('the licence of the rights terms in force', () => {
  const terms = (over: Partial<{ state: string; purposes: string[]; prohibited_uses: string[] }>) =>
    ({ terms_id: 't', version: 2, state: over.state ?? 'in_force', expires_at: null, purposes: over.purposes ?? ['corridor monitoring'], prohibited_uses: over.prohibited_uses ?? [] });
  it('no terms: the contract stands alone; the acquisition purpose itself is not a use', () => {
    expect(licenceVerdict(['observation', 'corridor monitoring'], 'observation', null)).toMatchObject({ ok: true, usePurposes: ['corridor monitoring'] });
  });
  it('permitted / outside the purposes / prohibited / expired / withdrawn', () => {
    expect(licenceVerdict(['observation', 'corridor monitoring'], 'observation', terms({})).ok).toBe(true);
    expect(licenceVerdict(['observation', 'forecasting'], 'observation', terms({}))).toMatchObject({ ok: false, class: 'licence', reason: expect.stringContaining('do not permit forecasting') });
    expect(licenceVerdict(['observation', 'corridor monitoring'], 'observation', terms({ prohibited_uses: ['Corridor Monitoring'] }))).toMatchObject({ ok: false, class: 'licence', reason: expect.stringContaining('prohibit') });
    expect(licenceVerdict(['corridor monitoring'], 'observation', terms({ state: 'expired' }))).toMatchObject({ ok: false, class: 'licence' });
    expect(licenceVerdict(['corridor monitoring'], 'observation', terms({ state: 'withdrawn' }))).toMatchObject({ ok: false, class: 'rights' });
  });
});

describe('residency at ingress', () => {
  it('match, conflict (enforce refuses, record records), an undeclared profile admits nothing', () => {
    expect(residencyVerdict('EU', 'local-dev', ['EU'], 'enforce')).toMatchObject({ verdict: 'match', refuse: false });
    expect(residencyVerdict('US', 'local-dev', ['EU'], 'enforce')).toMatchObject({ verdict: 'conflict', refuse: true });
    expect(residencyVerdict('US', 'local-dev', ['EU'], 'record')).toMatchObject({ verdict: 'conflict', refuse: false, reason: expect.stringContaining('recorded only') });
    expect(residencyVerdict('EU', 'mystery', null, 'enforce')).toMatchObject({ verdict: 'undeclared_profile', refuse: true });
  });
});

describe('Retry-After and the contract\'s backoff', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const b = { schedule_seconds: [60, 300, 900], max_attempts: 4, honour_retry_after: true };
  it('Retry-After: delta-seconds, an HTTP-date, absent, unreadable', () => {
    expect(parseRetryAfter('60', now)).toEqual({ state: 'parsed', seconds: 60, raw: '60' });
    expect(parseRetryAfter('Tue, 20 Oct 2026 10:02:00 GMT', now)).toMatchObject({ state: 'parsed', seconds: 120 });
    expect(parseRetryAfter(null, now)).toEqual({ state: 'absent', seconds: null, raw: null });
    expect(parseRetryAfter('soon-ish', now)).toEqual({ state: 'unparsed', seconds: null, raw: 'soon-ish' });
    expect(parseRetryAfter('-5', now).state).toBe('unparsed');
  });
  it('honoured: never sooner than the publisher asked nor than the schedule; the last delay repeats; bounded; exhausted at max_attempts', () => {
    expect(contractBackoff(b, 1, parseRetryAfter('60', now))).toMatchObject({ scheduleDelaySeconds: 60, appliedDelaySeconds: 60, retryAfterState: 'honoured', retryPlanned: true });
    expect(contractBackoff(b, 2, parseRetryAfter('120', now))).toMatchObject({ scheduleDelaySeconds: 300, appliedDelaySeconds: 300 });
    expect(contractBackoff(b, 1, parseRetryAfter('600', now))).toMatchObject({ scheduleDelaySeconds: 60, appliedDelaySeconds: 600 });
    expect(contractBackoff(b, 7, null)).toMatchObject({ scheduleDelaySeconds: 900, exhausted: true, retryPlanned: false, retryAfterState: 'absent' });
    expect(contractBackoff(b, 4, null)).toMatchObject({ exhausted: true, retryPlanned: false });
    const huge = contractBackoff(b, 1, parseRetryAfter(String(10 * 86_400), now));
    expect(huge).toMatchObject({ appliedDelaySeconds: MAX_HOLD_SECONDS, capped: true, retryPlanned: false });
  });
  it('not honoured / unreadable: the schedule applies; the own bucket: at least its wait', () => {
    expect(contractBackoff({ ...b, honour_retry_after: false }, 1, parseRetryAfter('600', now))).toMatchObject({ appliedDelaySeconds: 60, retryAfterState: 'not_honoured' });
    expect(contractBackoff(b, 1, parseRetryAfter('later', now))).toMatchObject({ appliedDelaySeconds: 60, retryAfterState: 'unparsed' });
    expect(contractBackoff(b, 1, null, 3600)).toMatchObject({ appliedDelaySeconds: 3600, retryAfterState: 'own_bucket' });
  });
});

describe('a response\'s identity and shape (DP-10-005)', () => {
  const json = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8');
  const base = responseFingerprint(json({ date: '2026-10-20', port: 'DJJIB', calls: [{ call_id: 'VC-0001' }], note: 'x'.repeat(400) }), 'application/json');
  it('the first response is the baseline; the same shape is consistent', () => {
    expect(responseAnomalies(null, base)).toEqual([]);
    expect(responseAnomalies(base, responseFingerprint(json({ calls: [], port: 'DJJIB', date: '2026-10-21', note: 'y'.repeat(380) }), 'application/json; charset=utf-8'))).toEqual([]);
  });
  it('a media type, a root, a field set or a size that departs is an anomaly', () => {
    expect(responseAnomalies(base, responseFingerprint(Buffer.from('<html><body>maintenance</body></html>'), 'text/html')).map((a) => a.code)).toEqual(['media_type_changed', 'root_type_changed', 'size_collapsed']);
    expect(responseAnomalies(base, responseFingerprint(json({ error: 'x', detail: 'y'.repeat(400) }), 'application/json')).map((a) => a.code)).toEqual(['keys_changed']);
    expect(responseAnomalies(base, responseFingerprint(json([{ a: 1 }]), 'application/json')).map((a) => a.code)).toContain('root_type_changed');
  });
});

describe('the act-target module refuses a synthetic listener on a live address (D10)', () => {
  it('the live API, web, recipients and stores are refused; another port is accepted', () => {
    for (const p of [3401, 3000, 3411, 2525, 3443, 3446, 5432, 6379, 6392]) expect(() => assertSyntheticListener(p, {})).toThrow(ActTargetRefused);
    expect(() => assertSyntheticListener(4100, { EYE_LIVE_API: 'http://127.0.0.1:4100' })).toThrow(/live demonstration address/);
    expect(() => assertSyntheticListener(0, {})).toThrow(ActTargetRefused);
    expect(assertSyntheticListener(43_997, {})).toBe(43_997);
  });
});
