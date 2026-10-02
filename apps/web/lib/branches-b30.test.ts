import { describe, expect, it } from 'vitest';
import { branchEventLine, confidenceLine, dependencyLine, divergingLine, freshnessBanner, instantOfLocal, mergeStateMark, resolutionLine, servedLine } from './branches-b30';

/** CP-6 B30 §BR (0103): the explorer WORDS the server's record — it never computes an age, judges staleness or decides a merge. SYNTHETIC. */
describe('the explorer is worded, never judged on the client', () => {
  it('the freshness banner says how many days stale, against which SLO — the scene\'s “5 days stale”', () => {
    const b = freshnessBanner({ version: 7, age_days: 5, state: 'stale', policy: { version: 1, max_age_days: 2, key_max_age: {}, near_expiry_hours: 24 }, stale_by_days: 3, basis: 'observed_through', reference_day: '2026-09-27' });
    expect(b).toMatchObject({ level: 'stale', glyph: '◍', token: '--eye-color-warning' });
    expect(b.text).toBe('STALE — the served snapshot v7 is 5 days stale: its state is observed through 2026-09-27; the freshness SLO is 2 days (v1), exceeded by 3 days');
    expect(freshnessBanner({ version: 8, age_days: 1, state: 'fresh', policy: { version: 1, max_age_days: 2, key_max_age: {}, near_expiry_hours: 24 }, stale_by_days: 0, basis: 'observed_through', reference_day: '2026-10-01' }).text)
      .toBe('FRESH — the served snapshot v8 is 1 day old: its state is observed through 2026-10-01; within the freshness SLO of 2 days');
    expect(freshnessBanner({ version: 3, age_days: 990, state: 'unknown', policy: null, stale_by_days: null, basis: 'observed_through', reference_day: '2024-01-17' }).text).toMatch(/^NO FRESHNESS SLO — the served snapshot v3 is 990 days old/);
    expect(freshnessBanner(null).level).toBe('unknown');
  });
  it('the served state: the head, or the frozen validated snapshot with its warning and expiry', () => {
    expect(servedLine({ twin_id: 't', as_of: 'x', mode: 'head', version: 9, branch_id: 'actual', head_version: 9, runs_allowed: true, freshness: null })).toBe('the head v9 of actual is served');
    expect(servedLine({ twin_id: 't', as_of: 'x', mode: 'frozen', version: 6, branch_id: 'actual', head_version: 9, runs_allowed: false, warning: 'the head is not validated', expires_at: '2026-10-03T00:00:00Z', expired: true, freshness: null }))
      .toBe('FROZEN — the validated snapshot v6 is served instead of the head v9: “the head is not validated” · EXPIRED at 2026-10-03T00:00:00Z — a run on it is refused');
    expect(servedLine(null)).toMatch(/nothing is served/);
  });
  it('a merge: refused until reconciliation while keys are unresolved; the diverging keys and the resolutions in words', () => {
    expect(mergeStateMark({ state: 'open', unresolved: ['a', 'b'], diverging: [{} as never, {} as never], merged_version: null }).text).toBe('OPEN — merging back is refused until reconciliation: 2 of 2 diverging key(s) unresolved');
    expect(mergeStateMark({ state: 'merged', unresolved: [], diverging: [], merged_version: 12 }).text).toBe('MERGED — admitted on actual as v12');
    expect(divergingLine({ key: 'shock.corridor_delay_days', change: 'changed', conflict: false, source: { kind: 'scenario', value: 45, unit: 'days' }, target: { kind: 'assumed', value: 14, unit: 'days' }, base: { kind: 'assumed', value: 14, unit: 'days' } }))
      .toBe('shock.corridor_delay_days: branch 45 days (scenario) · actual 14 days (assumed) · fork point 14 days (assumed)');
    expect(resolutionLine(undefined)).toBe('UNRESOLVED');
    expect(resolutionLine({ key: 'k', ordinal: 1, resolution: 'reconciled', kind: 'assumed', value: 23, unit: 'days', citations: [{}], note: 'per the terms', resolved_by: 'p', resolved_at: 'x' })).toBe('reconciled: 23 days (assumed, citing 1) — per the terms');
  });
  it('confidence: what is stated, never imputed; the dependency; the ledger', () => {
    expect(confidenceLine({ elements: 16, stated: 2, weakest: 0.4, mean: 0.5, coverage: 0.125, unhealthy: 0 })).toBe('weakest 0.4 · mean 0.5 · 2 of 16 stated (12.5%)');
    expect(confidenceLine({ elements: 2, stated: 0, weakest: null, mean: null, coverage: 0, unhealthy: 1 })).toBe('no stated confidence (0 of 2) · 1 unhealthy');
    expect(dependencyLine({ state: 'uncertain', rule: 'r', upstream: [{ twin_id: 'u', title: 'Ningbo port', link_id: 'l', head_version: 3, cited_version: 2, behind: true, verification_state: 'verified', freshness: 'stale', age_days: 3 }] }))
      .toBe('UNCERTAIN — Ningbo port v3 stale (this version cites v2)');
    expect(dependencyLine(undefined)).toMatch(/no upstream twin/);
    expect(branchEventLine({ event: 'checkpoint.restored', details: { from_version: 4, branch_id: 'blockade', draft_version: 7, reason: 'the estimate was withdrawn' } })).toBe('checkpoint v4 restored on blockade as draft v7 — the estimate was withdrawn');
  });
  it('a datetime-local value is an instant; anything else is not', () => {
    expect(instantOfLocal('2026-10-02T09:30')).toMatch(/^2026-10-0[12]T\d{2}:30:00\.000Z$/);
    expect(instantOfLocal('yesterday')).toBeNull();
  });
});
