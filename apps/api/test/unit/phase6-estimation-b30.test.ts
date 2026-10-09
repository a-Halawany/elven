/**
 * CP-6 B30 part `estimation` (0103 §ES) — the estimators' pure logic: each method's candidate (last observation, moving average, ratio to
 * baseline, the one-dimensional Kalman filter) and the common transform; the data-derived confidence (never narrative); the spread kept
 * among the candidates; the materiality against the head; the constraint subject — the estimate's quantity, the BALANCE a conservation set
 * checks (the proposal must account for the observed count), the head's quantities and its route edges for topology — run through the B29
 * evaluator; the declaration's intake; the Reconciliation Agent's identity; every refusal text of the four B30 families mapped to its status.
 * Every figure is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import {
  candidateOf, constraintSubjectOf, dispersionConfidence, estimatorProblems, kalman1d, materialityOf, spreadOf, transform, unreadableInWindow, widestWindow, type EstimatorDecl, type Point,
} from '../../src/twin/estimation/estimators.js';
import { SeriesService, readsInTail, tailFromDay } from '../../src/prediction/series/series.service.js';
import type { EvidenceVersionRow } from '../../src/prediction/prediction.capabilities.js';
import type { PipelineService } from '../../src/pipeline/pipeline.service.js';
import type { EvidenceService } from '../../src/observation/vault/evidence.service.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { evaluate, validateConstraints } from '../../src/twin/constraints/evaluator.js';
import { RECONCILIATION_AGENT_DIGEST, RECONCILIATION_AGENT_METHOD, RECONCILIATION_AGENT_VERSION } from '../../src/twin/estimation/reconciliation-agent.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

/** A week of corridor transits (SYNTHETIC), oldest first; each point read from one evidence version. */
const WEEK = [70, 72, 68, 66, 64, 62, 64.48].map((v, i) => ({ date: `2024-01-${String(11 + i).padStart(2, '0')}`, value: v, evidence: { id: `00000000-0000-4000-8000-00000000000${i}`, version: 1 } })) as Point[];
const decl = (over: Partial<EstimatorDecl> = {}): EstimatorDecl => ({
  estimator_id: '00000000-0000-4000-8000-0000000000aa', version: 1, name: 'portwatch-ratio', role: 'primary', method: 'ratio_to_baseline', parameters: { baseline: 104, scale: 100 },
  inputs: [{ kind: 'series', series_key: 'portwatch:chokepoint4:n_total', unit: 'transits/day', cadence_days: 1 }], unit: '%', bounds: { min: 0, max: 100 }, materiality: 0.05, ambiguity: 0.25,
  constraint_sets: [], ...over,
});

describe('the four methods and the transform', () => {
  it('ratio to baseline: the latest count against the baseline, in per cent — the corridor capacity 62 %', () => {
    const c = candidateOf(decl(), WEEK, null, null);
    expect(c).toMatchObject({ value: 62, raw: 64.48, window: { from: '2024-01-17', to: '2024-01-17', n: 1 }, last_point: { date: '2024-01-17', value: 64.48 }, excluded: null });
    expect(c.evidence).toEqual([{ id: '00000000-0000-4000-8000-000000000006', version: 1 }]);   // only the window's evidence is cited
    expect(transform(64.48, { baseline: 104, scale: 100 })).toBe(62);
    expect(transform(64.48, {})).toBe(64.48);
  });
  it('a moving average over its window; last observation; the window clipped to what the series holds', () => {
    const ma = candidateOf(decl({ method: 'moving_average', parameters: { window: 3, baseline: 104, scale: 100 } }), WEEK, null, null);
    expect(ma.raw).toBe(63.493333);
    expect(ma.value).toBe(Math.round((63.493333333 / 104) * 100 * 1000) / 1000);
    expect(ma.window).toEqual({ from: '2024-01-15', to: '2024-01-17', n: 3 });
    expect(ma.evidence).toHaveLength(3);
    expect(candidateOf(decl({ method: 'last_observation', parameters: {} }), WEEK, null, null).value).toBe(64.48);
    expect(candidateOf(decl({ method: 'moving_average', parameters: { window: 30 } }), WEEK, null, null)).toMatchObject({ excluded: 'moving_average needs at least 30 point(s); the series has 7', value: null });
  });
  it('the Kalman filter: the filtered state tracks the series; its confidence from its own variance', () => {
    const k = kalman1d([10, 10, 10, 10], 1, 4);
    expect(k.x).toBe(10);
    expect(k.p).toBeLessThan(4);
    const c = candidateOf(decl({ method: 'kalman_1d', parameters: { process_variance: 4, measurement_variance: 25, baseline: 104, scale: 100 } }), WEEK, null, null);
    expect(c.raw as number).toBeGreaterThan(62);
    expect(c.raw as number).toBeLessThan(72);
    expect(c.confidence as number).toBeGreaterThan(0);
    expect(c.confidence as number).toBeLessThanOrEqual(1);
    expect(candidateOf(decl({ method: 'kalman_1d', parameters: { process_variance: 1, measurement_variance: 1 } }), WEEK.slice(0, 2), null, null).excluded).toMatch(/needs at least 3/);
  });
  it('a disqualified input excludes the estimator with the reasons; an element input feeds only last_observation', () => {
    expect(candidateOf(decl(), WEEK, null, 'stale: the latest point 2023-12-31 …')).toMatchObject({ value: null, excluded: 'stale: the latest point 2023-12-31 …' });
    expect(candidateOf(decl({ method: 'last_observation', parameters: {} }), null, { value: 620, date: '2024-01-17' }, null)).toMatchObject({ value: 620, confidence: 1, last_point: { date: '2024-01-17', value: 620 } });
    expect(candidateOf(decl(), null, { value: 620, date: '2024-01-17' }, null).excluded).toMatch(/states no number/);
  });
  it('confidence is the data\'s dispersion, clamped — never a narrative figure', () => {
    expect(dispersionConfidence([5, 5, 5])).toBe(1);
    expect(dispersionConfidence([])).toBe(0);
    expect(dispersionConfidence([0, 0])).toBe(1);
    const c = dispersionConfidence(WEEK.map((p) => p.value));
    expect(c).toBeGreaterThan(0.9);
    expect(c).toBeLessThan(1);
  });
});

describe('disagreement retained, materiality', () => {
  it('the spread states the disagreement among every stated candidate', () => {
    const cs = [candidateOf(decl(), WEEK, null, null), candidateOf(decl({ name: 'ma', role: 'challenger', method: 'moving_average', parameters: { window: 7, baseline: 104, scale: 100 } }), WEEK, null, null),
                candidateOf(decl({ name: 'x', role: 'challenger' }), WEEK, null, 'unit mismatch')];
    const s = spreadOf(cs, 62);
    expect(s.n).toBe(2);
    expect(s.min).toBe(62);
    expect(s.max as number).toBeGreaterThan(62);
    expect(s.relative).toBe(Math.round((((s.max as number) - 62) / 62) * 1e6) / 1e6);
    expect(spreadOf([], 1)).toEqual({ n: 0, min: null, max: null, abs: null, relative: null });
  });
  it('material: no numeric head value, or the relative change at or above the threshold', () => {
    expect(materialityOf(62, null, 0.05)).toEqual({ material: true, delta_abs: null, delta_relative: null });
    expect(materialityOf(62, 100, 0.05)).toMatchObject({ material: true, delta_relative: 0.38 });
    expect(materialityOf(62, 62.5, 0.05)).toMatchObject({ material: false });
    expect(materialityOf(1, 0, 0.05)).toMatchObject({ material: true });
  });
});

describe('the constraint subject: validated before publish by the B29 evaluator', () => {
  const SETS = (tolerance = 0.5) => {
    const v = validateConstraints([{ key: 'transits-conserved', kind: 'conservation', stocks: ['corridor.capacity_share'], tolerance, unit: 'transits/day', applies_to: ['run_input'] },
                                    { key: 'share-at-most-100', kind: 'business_rule', quantity: 'corridor.capacity_share', op: '<=', value: 100, unit: '%', per: 'day', applies_to: ['run_input'] },
                                    { key: 'corridor-reaches-regensburg', kind: 'topology', sources: { nodes: ['ningbo'] }, targets: { nodes: ['regensburg'] }, applies_to: ['run_input'] }]);
    expect(v.problems).toEqual([]);
    return [{ setId: 's', setKey: 'corridor-transit-balance', version: 1, digest: 'd', constraints: v.constraints }];
  };
  const head = { observedThrough: '2024-01-17', elements: [{ key: 'inventory.on_hand:SYN-PART-MAG', value: 63400, unit: 'sets' },
    { key: 'route:sea', value: { from: 'ningbo', to: 'rotterdam' }, unit: null }, { key: 'route:rail', value: { from: 'rotterdam', to: 'regensburg' }, unit: null }] };
  it('the latest count accounted for: conservation, the business rule and the topology are satisfied', () => {
    const s = constraintSubjectOf({ ref: 'twin:t:estimate:k', key: 'corridor.capacity_share', value: 62, unit: '%', asOf: '2024-01-17', primary: decl(), lastRaw: 64.48, inputUnit: 'transits/day', head });
    expect(s.quantities).toEqual(expect.arrayContaining([
      { key: 'corridor.capacity_share', date: '2024-01-17', value: 62, unit: '%' },
      { key: 'corridor.capacity_share.opening', date: '2024-01-17', value: 104, unit: 'transits/day' },
      { key: 'corridor.capacity_share.inflow', date: '2024-01-17', value: 0, unit: 'transits/day' },
      { key: 'corridor.capacity_share.outflow', date: '2024-01-17', value: 39.52, unit: 'transits/day' },
      { key: 'corridor.capacity_share.closing', date: '2024-01-17', value: 64.48, unit: 'transits/day' },
      { key: 'inventory.on_hand:SYN-PART-MAG', date: '2024-01-17', value: 63400, unit: 'sets' }]));
    expect(s.edges).toEqual([{ from: 'ningbo', to: 'rotterdam', kind: 'route' }, { from: 'rotterdam', to: 'regensburg', kind: 'route' }]);
    expect(evaluate(s, SETS(), { budgetMs: 2000 })).toMatchObject({ outcome: 'satisfied', violations: [] });
  });
  it('refused: a proposal that does not account for the observed count (conservation), above 100 % (the rule), a cut route (topology)', () => {
    const smoothed = constraintSubjectOf({ ref: 'r', key: 'corridor.capacity_share', value: 66, unit: '%', asOf: '2024-01-17', primary: decl(), lastRaw: 64.48, inputUnit: 'transits/day', head });
    const e1 = evaluate(smoothed, SETS(), { budgetMs: 2000 });
    expect(e1.outcome).toBe('violated');
    expect(e1.violations.map((v) => v.constraintKey)).toEqual(['transits-conserved']);
    const over = constraintSubjectOf({ ref: 'r', key: 'corridor.capacity_share', value: 120, unit: '%', asOf: '2024-01-17', primary: decl(), lastRaw: 124.8, inputUnit: 'transits/day', head });
    expect(evaluate(over, SETS(), { budgetMs: 2000 }).violations.map((v) => v.constraintKey)).toEqual(['share-at-most-100']);
    const cut = constraintSubjectOf({ ref: 'r', key: 'corridor.capacity_share', value: 62, unit: '%', asOf: '2024-01-17', primary: decl(), lastRaw: 64.48, inputUnit: 'transits/day',
                                      head: { ...head, elements: head.elements.filter((x) => x.key !== 'route:rail') } });
    expect(evaluate(cut, SETS(), { budgetMs: 2000 }).violations.map((v) => v.constraintKey)).toEqual(['corridor-reaches-regensburg']);
    // recovered: the tolerance the set declares is what decides — the same smoothed proposal within a wide tolerance balances
    expect(evaluate(smoothed, SETS(5), { budgetMs: 2000 }).outcome).toBe('satisfied');
  });
  it('no baseline: no balance quantities (a conservation set over the key then reads them missing — indeterminate, never a pass)', () => {
    const s = constraintSubjectOf({ ref: 'r', key: 'corridor.capacity_share', value: 64.48, unit: '%', asOf: '2024-01-17', primary: decl({ method: 'last_observation', parameters: {} }), lastRaw: 64.48, inputUnit: 'transits/day', head: null });
    expect(s.quantities).toEqual([{ key: 'corridor.capacity_share', date: '2024-01-17', value: 64.48, unit: '%' }]);
    expect(evaluate(s, SETS(), { budgetMs: 2000 }).outcome).not.toBe('satisfied');
  });
});

describe('the declaration\'s intake and the agent\'s identity', () => {
  const ok = { twinId: '01a0fcc9-c168-719b-a339-e9d7be7f90da', key: 'corridor.capacity_share', name: 'portwatch-ratio', role: 'primary', method: 'ratio_to_baseline',
               parameters: { baseline: 104, scale: 100 }, inputs: [{ kind: 'series', series_key: 'portwatch:chokepoint4:n_total', unit: 'transits/day', cadence_days: 1 }],
               unit: '%', bounds: { min: 0, max: 100 }, materiality: 0.05, ambiguity: 0.25, note: 'corridor capacity (SYNTHETIC)' };
  it('a valid declaration has no problem; each refusal is worded', () => {
    expect(estimatorProblems(ok)).toEqual([]);
    expect(estimatorProblems({ ...ok, parameters: { scale: 100 } })).toEqual(['a ratio to baseline names its baseline']);
    expect(estimatorProblems({ ...ok, method: 'moving_average', parameters: { window: 1 } })).toEqual(['a moving average names its window (at least 2 points)']);
    expect(estimatorProblems({ ...ok, method: 'kalman_1d', parameters: {} })).toEqual(['a Kalman filter names process_variance and measurement_variance (both > 0)']);
    expect(estimatorProblems({ ...ok, bounds: { min: 5, max: 1 } })).toEqual(['bounds is { min?, max? } with min ≤ max']);
    expect(estimatorProblems({ ...ok, inputs: [{ kind: 'element', key: 'supply.capacity_per_day' }] })).toEqual(['the first input of this method is a series']);
    expect(estimatorProblems({ ...ok, materiality: 0 })).toEqual(['materiality is a relative threshold in (0, 10]']);
  });
  it('the Reconciliation Agent is registered with this runtime\'s scan: version, method and digest', () => {
    expect(RECONCILIATION_AGENT_VERSION).toBe('1.0.0');
    expect(RECONCILIATION_AGENT_METHOD).toBe('reconciliation-agent@1.0.0');
    expect(RECONCILIATION_AGENT_DIGEST).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the B30 estimation refusal families map by class', () => {
  const map = (message: string, code = '22023') => {
    const e = asObservationRefusal(Object.assign(new Error(message), { code }), 'c');
    return e instanceof HttpException ? e.getStatus() : null;
  };
  it.each([
    ['estimator rejected (ownership): an estimator of twin x is declared by the twin\'s owner', '42501', 403],
    ['estimate rejected (actor): recorded by the acting principal', '42501', 403],
    ['estimate rejected (separation_of_duties): the proposer of estimate x does not decide it', '42501', 403],
    ['estimation trigger rejected (authority): the triggers are queued by the domain\'s active attention agent', '42501', 403],
    ['estimate rejected (unknown_twin): x is not a twin of this domain', '23503', 404],
    ['observation request rejected (unknown_series): series x is not registered', '23503', 404],
    ['estimator rejected (duplicate): x is the primary estimator', '23505', 409],
    ['estimate rejected (state): estimate x is approved, not proposed', '22023', 409],
    ['estimate rejected (stale): estimate x was computed against v2 of the twin', '22023', 409],
    ['estimate rejected (unqualified): the primary estimator x has no qualified candidate', '22023', 422],
    ['estimate rejected (constraint): the constraint check before publish is violated', '22023', 422],
    ['estimate rejected (range): 120 % is outside the declared bounds', '22023', 422],
    ['observation request rejected (note): the request says what is missing', '22023', 422],
  ])('%s → %s', (message, code, status) => { expect(map(message, code)).toBe(status); });
});

describe('B30 act: unreadable evidence judged against the estimators\' window (unreadableInWindow)', () => {
  const MONTH = Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.UTC(2026, 7, 20 + i)).toISOString().slice(0, 10), value: 27, evidence: null })) as Point[];
  it('a version from years before (the retention of superseded seed evidence) is disclosed as outside, not counted', () => {
    expect(unreadableInWindow(MONTH, [decl()], 'portwatch:chokepoint4:n_total', [{ day: '2024-01-17' }])).toEqual({ counted: 0, outside: 1, windowFrom: '2026-09-22' });
  });
  it('the widest window decides: a 30-point Kalman challenger reaches back further than the ratio\'s confidence week', () => {
    const k = decl({ estimator_id: '00000000-0000-4000-8000-0000000000bb', name: 'portwatch-kalman', role: 'challenger', method: 'kalman_1d', parameters: { window: 30, process_variance: 4, measurement_variance: 25, baseline: 104, scale: 100 } });
    expect(unreadableInWindow(MONTH, [decl(), k], 'portwatch:chokepoint4:n_total', [{ day: '2026-09-10' }])).toEqual({ counted: 1, outside: 0, windowFrom: '2026-08-30' });
    expect(unreadableInWindow(MONTH, [decl()], 'portwatch:chokepoint4:n_total', [{ day: '2026-09-10' }])).toMatchObject({ counted: 0, outside: 1 });
  });
  it('a version inside the window, or with no day at all, counts (it might hold a point the estimators read)', () => {
    expect(unreadableInWindow(MONTH, [decl()], 'portwatch:chokepoint4:n_total', [{ day: '2026-09-28' }, { day: null }, { day: '2023-12-31' }])).toEqual({ counted: 2, outside: 1, windowFrom: '2026-09-22' });
  });
  it('an estimator of another series does not widen the window; nothing unreadable counts nothing', () => {
    const other = decl({ estimator_id: '00000000-0000-4000-8000-0000000000cc', name: 'other-kalman', role: 'challenger', method: 'kalman_1d', parameters: { window: 30, process_variance: 4, measurement_variance: 25 },
      inputs: [{ kind: 'series', series_key: 'ecb-eurusd', unit: 'USD', cadence_days: 1 }] });
    expect(unreadableInWindow(MONTH, [decl(), other], 'portwatch:chokepoint4:n_total', [{ day: '2026-09-10' }])).toMatchObject({ counted: 0, outside: 1 });
    expect(unreadableInWindow(MONTH, [decl()], 'portwatch:chokepoint4:n_total', [])).toEqual({ counted: 0, outside: 0, windowFrom: null });
  });
});

/*
 * B25-R (the demo regression of 2026-10-07): the reconcile scan read the corridor's WHOLE history — ~9,000 framed PortWatch fragments, each a
 * governed retrieval — twice per scan, and outlived its agent's session. The estimators read their declared windows; the series is now read
 * as a TAIL holding at least the widest of them. What a tail leaves out is only what cannot touch its rows: a framed fragment (one row of
 * its parent) dated before the tail. Every figure is SYNTHETIC.
 */
describe('B25-R: the scan reads the tail its estimators need (widestWindow, tailFromDay, readsInTail, SeriesService.assemble)', () => {
  const kalman = decl({ estimator_id: '00000000-0000-4000-8000-0000000000bb', name: 'portwatch-kalman', role: 'challenger', method: 'kalman_1d', parameters: { window: 30, process_variance: 4, measurement_variance: 25, baseline: 104, scale: 100 } });
  const ma = decl({ estimator_id: '00000000-0000-4000-8000-0000000000cc', name: 'portwatch-ma', role: 'challenger', method: 'moving_average', parameters: { window: 7, baseline: 104, scale: 100 } });
  it('the widest window over a series: the demo corridor\'s three estimators read at most 30 points; the ratio alone, the 7-point confidence week', () => {
    expect(widestWindow([decl(), ma, kalman], 'portwatch:chokepoint4:n_total')).toBe(30);
    expect(widestWindow([decl()], 'portwatch:chokepoint4:n_total')).toBe(7);
    expect(widestWindow([decl(), kalman], 'another:series')).toBe(7);
  });

  const row = (over: Partial<EvidenceVersionRow>): EvidenceVersionRow => ({ object_id: '', object_version: 1, recorded_at: '', content_digest: 'd', lifecycle_state: 'admitted', is_fragment: true, source_key: 'pw',
    event_time: null, synthetic_state: true, classification: 'internal', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null, ...over });
  it('the tail starts its span before the newest dated fragment (or the observed-through cut-off); nothing dated, or a span reaching the oldest, reads everything', () => {
    const vs = [row({ event_time: '2026-01-01' }), row({ event_time: '2026-10-04' }), row({ is_fragment: false, event_time: null })];
    expect(tailFromDay(vs, 44, null)).toBe('2026-08-21');
    expect(tailFromDay(vs, 44, '2026-09-30')).toBe('2026-08-17');
    expect(tailFromDay(vs, 400, null)).toBeNull();
    expect(tailFromDay([row({ is_fragment: false, event_time: '2026-10-04' })], 44, null)).toBeNull();
  });
  it('a tail reads every version but a framed fragment dated before it (a day\'s margin for the event time\'s zone)', () => {
    expect(readsInTail(row({ event_time: '2026-08-20' }), '2026-08-21')).toBe(true);
    expect(readsInTail(row({ event_time: '2026-08-19' }), '2026-08-21')).toBe(false);
    expect(readsInTail(row({ is_fragment: false, event_time: '2019-01-01' }), '2026-08-21')).toBe(true);
    expect(readsInTail(row({ event_time: null }), '2026-08-21')).toBe(true);
    expect(readsInTail(row({ event_time: '2019-01-01' }), null)).toBe(true);
  });

  /*
   * The assembly through fakes of the two governed paths it uses (the versions read, one retrieval per version): 200 days of three ports'
   * daily counts as framed fragments, a parent window (no day) holding early and late rows, and a later correction of a recent day. The
   * tail's latest points ARE the whole history's — newest version wins its day either way — at a fraction of the retrievals.
   */
  const DAYS = 200;
  const dayN = (i: number) => new Date(Date.UTC(2026, 2, 19 + i)).toISOString().slice(0, 10);
  const versions: EvidenceVersionRow[] = []; const bytes = new Map<string, string>();
  const add = (id: string, recorded: string, isFragment: boolean, eventTime: string | null, features: Array<{ portid: string; date: string; n_total: number }>) => {
    versions.push(row({ object_id: id, recorded_at: recorded, is_fragment: isFragment, event_time: eventTime }));
    bytes.set(id, JSON.stringify({ features: features.map((a) => ({ attributes: a })) }));
  };
  add('parent-0', '2026-03-01T00:00:00Z', false, null, [{ portid: 'chokepoint4', date: dayN(0), n_total: 1 }, { portid: 'chokepoint4', date: dayN(DAYS - 2), n_total: 999 }]);
  for (let i = 0; i < DAYS; i += 1) for (const port of ['chokepoint1', 'chokepoint4', 'chokepoint6']) {
    add(`f-${port}-${i}`, `${dayN(i)}T12:00:00Z`, true, dayN(i), [{ portid: port, date: dayN(i), n_total: 20 + (i % 9) + (port === 'chokepoint4' ? 7 : 0) }]);
  }
  add('fix-1', `${dayN(DAYS - 1)}T18:00:00Z`, true, dayN(DAYS - 5), [{ portid: 'chokepoint4', date: dayN(DAYS - 5), n_total: 55 }]);
  const service = (retrieved: string[]) => {
    const series = { series_key: 'pw:4', source_key: 'pw', parser_ref: 'arcgis-feature-attribute@1', value_field: 'n_total', selector: 'chokepoint4', unit: 'transits/day', seasonality_days: 7,
                     subject_entity_id: null, attribution: null, description: 'synthetic' };
    const cap = { readSeries: () => ({ selectAll: () => ({ where: () => ({ executeTakeFirst: async () => series }) }) }), evidenceVersionsKnownAt: async () => versions };
    const pipeline = {
      consequentialRead: async (_e: unknown, _p: unknown, _r: unknown, _c: unknown, fn: (c: unknown) => Promise<unknown>) => ({ result: await fn(cap) }),
      write: async (_e: unknown, _p: unknown, route: { objectId: string }) => { retrieved.push(route.objectId); return { result: { integrity: 'verified', base64: Buffer.from(bytes.get(route.objectId) ?? '{}').toString('base64'), label: null, message: null } }; },
    } as unknown as PipelineService;
    return new SeriesService(pipeline, {} as EvidenceService);
  };
  const reader = { principal: { principalId: 'p' } as AuthenticatedPrincipal, tenantId: 't', domainId: 'd', correlationId: 'c', purposeId: 'twin' };
  it('the tail\'s latest 30 points are the whole history\'s — the parent read, the correction winning its day — at about a quarter of the retrievals', async () => {
    const full: string[] = []; const tail: string[] = [];
    const a = await service(full).assemble(reader, 'pw:4', '2027-01-01T00:00:00Z', null);
    const b = await service(tail).assemble(reader, 'pw:4', '2027-01-01T00:00:00Z', null, { points: 30, spanDays: 30 + 14 });
    expect(a.points).toHaveLength(DAYS);
    expect(b.points.slice(-30)).toEqual(a.points.slice(-30));
    expect(b.points.find((p) => p.date === dayN(DAYS - 5))).toMatchObject({ value: 55, evidence_object_id: 'fix-1' });
    expect(b.points.find((p) => p.date === dayN(DAYS - 2))).toMatchObject({ evidence_object_id: 'f-chokepoint4-198' });   // the later fragment wins over the parent
    expect(b.readFrom).toBe(tailFromDay(versions, 44, null));
    expect(full).toHaveLength(versions.length);
    expect(tail.length).toBeLessThan(versions.length / 4);
    expect(tail).toContain('parent-0');
    expect(b.versionsLeftOut).toBe(versions.length - tail.length);
  });
  it('a tail too short for its points widens (each version still retrieved once); a span past the oldest fragment reads the whole history', async () => {
    const seen: string[] = [];
    const b = await service(seen).assemble(reader, 'pw:4', '2027-01-01T00:00:00Z', null, { points: 60, spanDays: 20 });
    expect(b.points.length).toBeGreaterThanOrEqual(60);
    expect(new Set(seen).size).toBe(seen.length);
    const all: string[] = [];
    const c = await service(all).assemble(reader, 'pw:4', '2027-01-01T00:00:00Z', null, { points: 30, spanDays: 400 });
    expect(c.readFrom).toBeNull();
    expect(all).toHaveLength(versions.length);
  });
});
