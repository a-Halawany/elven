import { describe, expect, it } from 'vitest';
import { approvalsLine, baselineLine, claimLine, collectionLine, consentLine, dayOf, fieldsLine, heldOn, intervalLine, measureValue, stateMark, verdictLine, type Baseline, type Definition } from './analytics-ux-b92';

/** CP-6 B92 §UX (0113_b92_x_ux): the experience workspace is WORDED, never computed on the client — consent, collection, measures and decisions are the server's. */
const b = (o: Partial<Baseline>): Pick<Baseline, 'state' | 'measure' | 'value' | 'uncertainty' | 'n' | 'floor_n' | 'k_min' | 'k_observed' | 'reasons' | 'suppressed'> => ({
  state: 'determinate', measure: 'task_success_rate', value: 0.75, uncertainty: { method: 'wilson', level: 0.95, lo: 0.531, hi: 0.888 }, n: 20, floor_n: 5, k_min: 5, k_observed: 5, reasons: [], suppressed: null, ...o,
});
describe('the experience workspace words what the server recorded', () => {
  it('states are visibly distinct — proposed, approved, retired, held, determinate, indeterminate, suppressed — never colour alone', () => {
    const texts = ['proposed', 'approved', 'rejected', 'superseded', 'retired', 'held', 'determinate', 'indeterminate', 'suppressed', 'invalidated', 'concluded', 'running'].map((s) => stateMark(s).text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(stateMark('proposed')).toMatchObject({ glyph: '◌', text: 'PROPOSED (awaiting a named human)' });
    expect(stateMark('held')).toMatchObject({ token: '--eye-color-critical', text: 'COLLECTION HELD' });
    expect(stateMark('odd').text).toBe('ODD');
  });
  it('a determinate baseline: the value in its unit, the interval with its method, n with the floor and k', () => {
    expect(baselineLine(b({})).text).toBe('75.0 % · 95 % 53.1 % – 88.8 % (Wilson) · n = 20 (floor 5, k ≥ 5)');
    expect(baselineLine(b({ measure: 'step_p50_ms', value: 8500, uncertainty: { method: 'order_statistics', lo: 4000, hi: 12000 } })).text).toBe('8.50 s · 95 % 4.00 s – 12.00 s (median, order statistics) · n = 20 (floor 5, k ≥ 5)');
  });
  it('an indeterminate baseline is said AS indeterminate with its reasons, n and the floor — never a zero or a bare dash', () => {
    const l = baselineLine(b({ state: 'indeterminate', value: null, uncertainty: null, n: 4, reasons: ['n = 4 is below the journey\'s floor 5'] }));
    expect(l.mark.text).toBe('INDETERMINATE');
    expect(l.text).toBe('INDETERMINATE (no value) — n = 4 is below the journey\'s floor 5 · n = 4, floor 5, k ≥ 5');
    expect(l.text).not.toMatch(/\b0(\.0)? %/);
  });
  it('a segment below k is SUPPRESSED: its n withheld, the reason said', () => {
    const l = baselineLine(b({ state: 'indeterminate', value: null, n: null, k_observed: null, reasons: ['below k'], suppressed: 'below k = 5 distinct pseudonyms: suppressed' }));
    expect(l.mark.text).toBe('SUPPRESSED (below k)');
    expect(l.text).toMatch(/^SUPPRESSED — below k = 5 distinct pseudonyms: suppressed; floor 5\./);
    expect(l.text).not.toMatch(/n = \d/);
  });
  it('an unbounded interval is said, not invented; measures in their units', () => {
    expect(intervalLine('step_p50_ms', { method: 'order_statistics', lo_rank: null, note: 'n < 6: the interval of the median is unbounded' })).toBe('n < 6: the interval of the median is unbounded');
    expect(intervalLine('task_success_rate', null)).toBe('no interval');
    expect(measureValue('step_p50_ms', 950)).toBe('950 ms');
    expect(measureValue('task_success_rate', null)).toBe('—');
  });
  it('consent: consented, not consented, and a changed purpose that needs a new consent', () => {
    expect(consentLine({ consented: true, version: 2, history: [], retention_days: 180 })).toMatch(/^CONSENTED to version 2 — .*kept 180 days$/);
    expect(consentLine({ consented: false, version: 2, history: [{ decision: 'granted', purpose_version: 1, recorded_at: 'x' }], retention_days: 180 })).toMatch(/^NOT CONSENTED — the purpose changed \(version 1 → 2\)/);
    expect(consentLine({ consented: false, version: 1, history: [], retention_days: 180 })).toMatch(/nothing of yours is collected/);
  });
  it('collection and the whitelist in words; a held journey is degraded', () => {
    expect(collectionLine({ state: 'approved', collection: 'held', hold_reason: 'a privacy question', retention_days: 180 }).text).toBe('COLLECTION HELD — a privacy question; events are refused and counted, never kept');
    expect(collectionLine({ state: 'proposed', collection: 'open', hold_reason: null, retention_days: null }).text).toMatch(/^PROPOSED — awaiting the privacy officer/);
    expect(fieldsLine({ view: { type: 'enum', values: ['list', 'detail'] }, k: { type: 'bool' }, rows: { type: 'int', min: 0, max: 50 } })).toBe('view: one of list | detail; k: a flag; rows: int 0–50');
    expect(fieldsLine({})).toMatch(/^no fields/);
    const d = (o: Partial<Definition>) => ({ definition_id: 'x', event_key: 'e', version: 1, journey_key: 'j', state: 'approved', collection: 'open', ...o }) as Definition;
    expect(heldOn([d({}), d({ collection: 'held' }), d({ collection: 'held', journey_key: 'other' }), d({ collection: 'held', state: 'superseded' })], 'j')).toHaveLength(1);
  });
  it('an experiment: its two approvals, its verdict, its claim (made only when the interval supports it)', () => {
    expect(approvalsLine({ approvals: [{ role: 'product_analytics_owner', decision: 'approve', reason: 'r', decided_at: 'x' }] })).toBe('product analytics owner: approved · privacy officer: awaited');
    expect(verdictLine({ verdict: 'invalid', reasons: ['sample-ratio mismatch'] }).text).toBe('INVALID — the experiment is invalidated: sample-ratio mismatch');
    expect(verdictLine({ verdict: 'insufficient', reasons: ['n below'] }).mark.text).toBe('INDETERMINATE');
    expect(claimLine({ arm: 'compact', difference: 0.4, interval: { lo: 0.2, hi: 0.57 }, claim: 'better' })).toBe('compact vs control: 40.0 pp (95 % 20.0 – 57.0 pp, Newcombe) — BETTER');
    expect(claimLine({ arm: 'b', median: 900, control_median: 1000, claim: 'no_claim (the intervals of the medians overlap)' })).toMatch(/NO_CLAIM \(THE INTERVALS OF THE MEDIANS OVERLAP\)$/);
  });
  it('a DATE is the day it names', () => {
    expect(dayOf('2026-09-01')).toBe('2026-09-01');
    expect(dayOf('2026-09-01T23:30:00-05:00')).toBe('2026-09-01');
    expect(dayOf(null)).toBe('—');
  });
});
