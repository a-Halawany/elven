import { describe, expect, it } from 'vitest';
import { EXPERIENCE_PAGE, OPERATING_REVIEW, Tracker, admissible, deviceClassOf, durationMs, languageOf, whitelisted, type Catalogue, type Sender } from './telemetry-b92';

/** CP-6 B92 §UX (D12): the client sends an event only for an APPROVED, open definition and only under the person's CURRENT consent — never queued, never content. */
const cat = (consented: boolean): Catalogue => ({
  purposes: [{ purpose_key: 'experience-telemetry', version: 1, title: 't', kind: 'product_improvement', description: 'd', retention_days: 180, consented, history: [] }],
  definitions: [
    { event_key: 'operating-review.open', version: 1, purpose_key: 'experience-telemetry', journey_key: 'operating-review', step_key: 'open', fields: { view: { type: 'enum', values: ['list', 'detail'] } } },
    { event_key: 'operating-review.drill_down', version: 1, purpose_key: 'experience-telemetry', journey_key: 'operating-review', step_key: 'drill_down', fields: {} },
    { event_key: 'operating-review.done', version: 1, purpose_key: 'experience-telemetry', journey_key: 'operating-review', step_key: 'done', fields: { rows: { type: 'int', min: 0, max: 100 }, kb: { type: 'bool' } } },
  ],
  experiments: [],
});
function recorder() {
  const sent: Array<Record<string, unknown>> = [];
  const send: Sender = async (p) => { sent.push(p as Record<string, unknown>); return { ok: true, collected: true }; };
  return { sent, send };
}

describe('the client decides from the server\'s catalogue and consent — and never queues', () => {
  it('admissible only for an approved, open definition whose purpose the person consented to NOW', () => {
    expect(admissible(null, 'operating-review.open')).toEqual({ ok: false, reason: 'not_loaded' });
    expect(admissible(cat(true), 'operating-review.unknown')).toEqual({ ok: false, reason: 'not_defined' });
    expect(admissible(cat(false), 'operating-review.open')).toEqual({ ok: false, reason: 'not_consented' });
    expect(admissible(cat(true), 'operating-review.open').ok).toBe(true);
  });
  it('without consent, or before the catalogue answered, NOTHING is sent — and nothing waits to be sent later', async () => {
    const r = recorder(); const t = new Tracker(r.send);
    expect(await t.track('operating-review.open', 'started')).toBe('not_loaded');
    t.load(cat(false));
    expect(await t.start(OPERATING_REVIEW, 'open')).toBe('not_consented');
    t.load(cat(true));
    expect(r.sent).toHaveLength(0);   // the earlier attempts were dropped, not queued
  });
  it('the journey open → drill down → done: outcomes and durations only; a field outside the whitelist is dropped; a value outside it too', async () => {
    let now = 1_000; const r = recorder(); const t = new Tracker(r.send, () => now, { deviceClass: 'desktop', locale: 'en' });
    t.load(cat(true));
    expect(await t.start(OPERATING_REVIEW, 'open', { view: 'list', query: 'free text never travels' })).toBe('sent');
    now = 3_400; expect(await t.end(OPERATING_REVIEW, 'drill_down', 'success')).toBe('sent');
    now = 5_000; expect(await t.end(OPERATING_REVIEW, 'done', 'success', { rows: 12, kb: true, view: 'list', note: 'x' })).toBe('sent');
    expect(r.sent).toEqual([
      { eventKey: 'operating-review.open', outcome: 'started', durationMs: undefined, fields: { view: 'list' }, deviceClass: 'desktop', locale: 'en', experimentId: null },
      { eventKey: 'operating-review.drill_down', outcome: 'success', durationMs: 2_400, fields: {}, deviceClass: 'desktop', locale: 'en', experimentId: null },
      { eventKey: 'operating-review.done', outcome: 'success', durationMs: 4_000, fields: { rows: 12, kb: true }, deviceClass: 'desktop', locale: 'en', experimentId: null },
    ]);
    expect(JSON.stringify(r.sent)).not.toMatch(/free text|note/);
  });
  it('the server\'s answer is the answer: a refusal is not retried; not collected is reported as such; a network failure is dropped', async () => {
    const t1 = new Tracker(async () => ({ ok: false })); t1.load(cat(true));
    expect(await t1.track('operating-review.open', 'started')).toBe('refused');
    const t2 = new Tracker(async () => ({ ok: true, collected: false })); t2.load(cat(true));
    expect(await t2.track('operating-review.open', 'started')).toBe('not_consented');
    const t3 = new Tracker(async () => { throw new Error('offline'); }); t3.load(cat(true));
    expect(await t3.track('operating-review.open', 'started')).toBe('failed');
  });
  it('whitelisting keeps only declared fields with admissible values', () => {
    const spec = { view: { type: 'enum', values: ['list'] }, rows: { type: 'int', min: 0, max: 10 }, kb: { type: 'bool' }, t: { type: 'duration_ms', min: 0, max: 1000 } };
    expect(whitelisted(spec, { view: 'detail', rows: 11, kb: 'yes', t: 500, extra: 1 })).toEqual({ t: 500 });
    expect(whitelisted(spec, { view: 'list', rows: 3, kb: false })).toEqual({ view: 'list', rows: 3, kb: false });
    expect(whitelisted(spec, undefined)).toEqual({});
  });
  it('the context is coarse: a device class from the width, a two-letter language, a bounded duration', () => {
    expect([deviceClassOf(1440), deviceClassOf(800), deviceClassOf(390)]).toEqual(['desktop', 'tablet', 'mobile']);
    expect([languageOf('en-GB'), languageOf('de'), languageOf(''), languageOf(undefined)]).toEqual(['en', 'de', null, null]);
    expect([durationMs(10, 5), durationMs(0, 1.6), durationMs(0, 1e12)]).toEqual([0, 2, 86_400_000]);
    expect(EXPERIENCE_PAGE.steps).toEqual(['open', 'act']);
  });
});
