/**
 * CP-6 B40 §AP — the acquisition policy's pure view model (lib/acquisition-b40.ts): the declaration (or "not declared before SRC@v4"), the
 * authorizations in words, the coverage gaps stated — holding, open, resolved — never silent. SYNTHETIC rows in the read's shape.
 */
import { describe, expect, it } from 'vitest';
import { authorizationView, coverageGaps, declarationLines, durationText, toAcquisition } from './acquisition-b40';

const POLICY = {
  rate: { requests: 30, per_seconds: 60, burst: 5 },
  backoff: { schedule_seconds: [60, 300, 900], max_attempts: 4, honour_retry_after: true },
  robots: { mode: 'evaluate', reason: null },
  window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], hours_utc: { from: 6, to: 22 }, blackout: [] },
  residency_check: 'enforce',
};

describe('durations, exact', () => {
  it('whole seconds in words, never rounded into a shorter wait', () => {
    expect(durationText(45)).toBe('45 s');
    expect(durationText(60)).toBe('1 min');
    expect(durationText(3_725)).toBe('1 h 2 min 5 s');
    expect(durationText(90_061)).toBe('1 d 1 h 1 min');
    expect(durationText(null)).toBe('not stated');
    expect(durationText(-1)).toBe('not stated');
  });
});

describe('the declaration', () => {
  it('an SRC@v4 policy in words; an earlier version declares nothing', () => {
    const lines = declarationLines(POLICY);
    expect(lines.map((l) => l.term)).toEqual(['Rate', 'Backoff', 'Robots', 'Collection window (UTC)', 'Residency at ingress']);
    expect(lines[0]!.value).toBe('30 request(s) per 1 min, at most 5 at once — one bucket for the source, shared by every form');
    expect(lines[1]!.value).toBe('1 min → 5 min → 15 min (the last repeats); at most 4 attempt(s); Retry-After honoured — never retried sooner than the publisher asks');
    expect(lines[3]!.value).toBe('mon, tue, wed, thu, fri, 6:00–22:00; no blackout declared');
    expect(declarationLines({ ...POLICY, robots: { mode: 'not_applicable', reason: 'a statistical API (SYNTHETIC)' } })[2]!.value).toBe('not applicable — a statistical API (SYNTHETIC)');
    expect(declarationLines(null)).toEqual([]);
    const v = toAcquisition({ versions: [{ contract_version: 2, schema: 'SRC@v1–v3', acquisition_policy: null, statement: 'not declared before SRC@v4 — …' }] }).versions[0]!;
    expect(v).toMatchObject({ declared: false, lines: [], statement: 'not declared before SRC@v4 — …' });
  });
});

describe('the authorizations in words', () => {
  it('authorized, with each verdict; refused with its class in words; nothing blank', () => {
    const ok = authorizationView({ authorization_id: 'a1', run_id: 'r1', contract_version: 3, decision: 'proceed', refusal_class: null, reason: 'authorized: …',
      rights: { contract_rights_state: 'confirmed', terms: null }, licence: { reason: 'no rights terms declared for this contract version' }, credential_ref: null,
      rate: { requests: 30, per_seconds: 60, bucket: 'reachable' }, residency: { verdict: 'match', reason: 'EU admitted by local-dev' }, window: { reason: 'inside the window' },
      robots: { verdict: 'allowed' }, backoff: { hold: null } });
    expect(ok.decisionWords).toBe('Authorized');
    expect(ok.verdicts.map((v) => v.words)).toEqual(['contract confirmed; no rights terms declared', 'no rights terms declared for this contract version', 'none named',
      '30 per 1 min, bucket reachable', 'EU admitted by local-dev', 'inside the window', 'allowed', 'no hold in force']);
    const no = authorizationView({ decision: 'refuse', refusal_class: 'residency_refused', reason: 'the contract declares residency US …', robots: { verdict: 'not_evaluated' }, residency: { verdict: 'unavailable' } });
    expect(no.decisionWords).toBe('Refused — residency conflict');
    expect(no.verdicts.find((v) => v.facet === 'Robots')!.words).toBe('not fetched — the run was refused first');
    expect(no.verdicts.find((v) => v.facet === 'Residency')!.words).toBe('could not be resolved');
    expect(no.verdicts.find((v) => v.facet === 'Rights')!.words).toBe('not recorded');
  });
});

describe('the coverage gaps — stated, never silent (DP-10-005)', () => {
  const rl = (over: Record<string, unknown>) => ({ rate_limit_id: 'g', origin: 'publisher_429', http_status: 429, retry_after_state: 'honoured', retry_after_seconds: 60,
    attempt: 1, max_attempts: 4, schedule_delay_seconds: 60, applied_delay_seconds: 60, exhausted: false, retry_planned: true, interval_from: '2026-10-20T10:00:00Z',
    interval_to: '2026-10-20T10:01:00Z', state: 'holding', detail: 'attempt 1 of 4 …', ...over });
  it('a holding 429 interval with the contract\'s backoff; a resolved one; an exhausted one; a stream range', () => {
    const g = coverageGaps({ rate_limited: [rl({}), rl({ rate_limit_id: 'h', state: 'resolved', resolved_by_run: 'run-3', resolved_at: '2026-10-20T10:05:00Z' }),
      rl({ rate_limit_id: 'i', state: 'open', attempt: 4, exhausted: true, retry_planned: false, retry_after_state: 'unparsed', retry_after_raw: 'soon', retry_after_seconds: null })],
      incomplete_ranges: [{ range_id: 'r', range_from: '2026-10-01', range_to: '2026-10-02', reason_class: 'rate_limited', state: 'open', detail: 'held' }] });
    expect(g.counts).toEqual({ holding: 1, open: 2, resolved: 1 });
    expect(g.statement).toBe('4 recorded gap(s): 1 holding, 2 open, 1 resolved. Each is an explicit interval, never a silent gap.');
    expect(g.gaps[0]).toMatchObject({ stateWords: 'holding — no request before 2026-10-20T10:01:00Z', cause: 'the publisher answered 429 Too Many Requests (HTTP 429); Retry-After 1 min honoured',
      backoff: 'attempt 1 of 4 · schedule 1 min · held 1 min · a retry planned at the end of the hold' });
    expect(g.gaps[1]!.stateWords).toBe('resolved by run run-3 at 2026-10-20T10:05:00Z');
    expect(g.gaps[2]).toMatchObject({ cause: expect.stringContaining('Retry-After "soon" could not be read'), backoff: expect.stringContaining('retries exhausted') });
    expect(g.gaps[3]).toMatchObject({ kind: 'incomplete_range', cause: 'stream range rate limited', state: 'open' });
    expect(coverageGaps(null)).toEqual({ gaps: [], counts: { holding: 0, open: 0, resolved: 0 }, statement: 'No rate-limited interval or incomplete range is recorded for this source.' });
  });
});
