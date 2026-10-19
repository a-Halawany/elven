/**
 * CP-6 B82 §CF — THE READS the charts are placed on, and THE ADAPTERS from each existing read's rows to a chart's input (pure, tested). A
 * page passes exactly what its existing read returned; an adapter only reshapes (it never fills, smooths or ranks): an unknown stays null and
 * reads "unknown" in the table. One new read only — the exposure correlations beside /correlations/declare (prediction.exposure.read, the
 * existing action; VIZ-24). Every other chart sits on a read that already exists.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';
import type { Calibration, ForecastRow } from './prediction';
import type { EnsemblePackage } from './ensembles-b25';
import type { StreamDetail } from './streams';
import type { Calibration as TwinCalibration } from './envelope-b30';
import type { Validation } from './experiments-b30';
import type { TimelineView } from './timeline-b50';
import {
  CANONICAL_HORIZONS, pathPoints, toInstant, type BandPointIn, type CalibrationPointIn, type ControlLimitIn, type CorrelationCellIn, type HorizonRowIn,
  type PercentileItemIn, type ScatterPointIn, type TimelineEventIn,
} from './chart-b82';

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/* ───────────────────────── the correlation read (VIZ-24) ───────────────────────── */

export interface CorrelationRead {
  variables: Array<{ exposure_id: string; polarity: string; category_key: string; state: string; title: string | null }>;
  entries: Row[]; latest: Row[]; counts: { entries: number; pairs: number; declared: number; proposed_by_agent: number }; method: string; at: string;
}
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
export const chartReads = {
  /** POST …/prediction/exposures/correlations/list (prediction.exposure.read) — the domain's declared exposure correlations, verbatim. */
  correlations: (s: Scope): Promise<ApiResult<{ correlations: CorrelationRead; receipt: Receipt }>> => call(`${base(s)}/exposures/correlations/list`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action: 'prediction.exposure.read', object_type: 'RSK', object_id: null, purpose_id: 'prediction',
    side_effect_class: 'none', consequence_class: 'C1',
  }, {}),
};
/** The matrix input: the exposures that appear in an entry (titled, else their short id), the entries oldest first (the latest per pair wins). */
export function correlationInput(r: CorrelationRead): { variables: Array<{ key: string; label: string }>; cells: CorrelationCellIn[] } {
  return {
    variables: r.variables.map((v) => ({ key: v.exposure_id, label: v.title ?? `${v.polarity} ${v.exposure_id.slice(0, 8)}…` })),
    cells: r.entries.map((e) => ({ a: String(e['exposure_a']), b: String(e['exposure_b']), coefficient: num(e['coefficient']), relation: e['relation'] === undefined ? null : String(e['relation']),
      n: null, basis: e['basis'] === undefined ? null : String(e['basis']), kind: e['estimated_kind'] === 'agent' ? 'proposed by an agent run' : 'declared by a person' })),
  };
}

/* ───────────────────────── forecasts (CMP-061, VIZ-03, VIZ-04) ───────────────────────── */

/** A forecast's band: its stepped horizon path (days from its origin), else its one interval at its target day. */
export function forecastBand(f: Pick<ForecastRow, 'origin_at' | 'target_at' | 'path' | 'quantiles'>): BandPointIn[] {
  const path = Array.isArray(f.path) ? f.path : [];
  if (path.length > 0) return pathPoints(String(f.origin_at).slice(0, 10), path);
  return [{ at: String(f.target_at).slice(0, 10), q10: num(f.quantiles?.q10), q50: num(f.quantiles?.q50), q90: num(f.quantiles?.q90) }];
}
/** The horizon matrix of one series: per canonical horizon the forecast in force (issued, newest by issue) — else the newest of any state, said so. */
export function forecastHorizonRows(forecasts: readonly ForecastRow[], seriesKey: string): HorizonRowIn[] {
  const mine = forecasts.filter((f) => f.series_key === seriesKey);
  return CANONICAL_HORIZONS.flatMap((h) => {
    const at = mine.filter((f) => f.horizon_code === h).sort((a, b) => String(b.issued_at).localeCompare(String(a.issued_at)));
    const f = at.find((x) => x.state === 'issued') ?? at[0];
    if (f === undefined) return [];
    const skill = f.skill === null ? null : num(f.skill['skill_vs_baseline']);
    return [{
      horizon: h, target: `${f.series_key} by ${String(f.target_at).slice(0, 10)}${f.state === 'issued' ? '' : ` (${f.state})`}`, q10: num(f.quantiles.q10), q50: num(f.quantiles.q50), q90: num(f.quantiles.q90),
      unit: f.unit ?? null, method: `${f.method}@${f.method_version}`, score: `${f.validation_state.replace(/_/g, ' ')}${skill === null ? '' : ` · skill vs ${f.baseline_method} ${skill.toFixed(3)}`}`,
      use: f.label === 'live' ? 'live' : 'replay demonstration',
    }];
  });
}

/* ───────────────────────── calibration (VIZ-09) ───────────────────────── */

/** Scored outcomes: each family's observed 80 % coverage against its promise, its sample the outcomes scored. */
export function outcomePoints(c: Pick<Calibration, 'outcomes'>): CalibrationPointIn[] {
  return c.outcomes.map((o) => ({ key: `${o.series_key}|${o.horizon_code}|${o.method}`, label: `${o.series_key} · ${o.horizon_code}`, group: o.method, nominal: 0.8,
    observed: num(o.coverage_80), n: Number(o.outcomes) || 0, period: o.labels.length === 0 ? null : `labels: ${o.labels.join(', ')}` }));
}
/** Backtests: the learned model's and the seasonal-naive baseline's coverage per backtest, the sample its origins, the period its window. */
export function backtestPoints(c: Pick<Calibration, 'backtests'>): CalibrationPointIn[] {
  return c.backtests.flatMap((b) => {
    const period = `${String(b.window_from).slice(0, 10)} → ${String(b.window_to).slice(0, 10)} (${b.mode ?? 'retrospective'})`;
    const n = Number(b.origins) || 0; const label = `${b.series_key} · ${b.horizon_code}`;
    return [
      { key: `${b.backtest_id}|model`, label: `${label} (model)`, group: 'learned model', nominal: 0.8, observed: num(b.coverage_80), n, period },
      { key: `${b.backtest_id}|naive`, label: `${label} (naive)`, group: 'seasonal naive', nominal: 0.8, observed: num(b.baseline_coverage_80), n, period },
    ];
  });
}

/* ───────────────────────── ensembles (VIZ-08) ───────────────────────── */

/** Each issued member's distribution, the ensemble (MODEL OUTPUT) and the standing judgement overlay (JUDGEMENT) — on one axis, one unit. */
export function ensembleItems(pkg: Pick<EnsemblePackage, 'members' | 'ensemble' | 'standing_overlay'>): PercentileItemIn[] {
  const out: PercentileItemIn[] = pkg.members.filter((m) => m.state === 'issued' && m.quantiles !== null).map((m) => ({
    key: `m${m.ordinal}`, label: `#${m.ordinal} ${m.method_ref}`, p10: num(m.quantiles!.q10), p50: num(m.quantiles!.q50), p90: num(m.quantiles!.q90), note: `member; weight ${m.weight === null ? 'not set' : m.weight}`,
  }));
  if (pkg.ensemble !== null) out.push({ key: 'ensemble', label: 'the ensemble', p10: num(pkg.ensemble.quantiles.q10), p50: num(pkg.ensemble.quantiles.q50), p90: num(pkg.ensemble.quantiles.q90), note: 'MODEL OUTPUT' });
  const o = pkg.standing_overlay;
  if (o !== null && o.adjustment.kind === 'quantiles') out.push({ key: 'overlay', label: `judgement v${o.version}`, p10: num(o.adjustment['q10']), p50: num(o.adjustment['q50']), p90: num(o.adjustment['q90']), note: 'JUDGEMENT — beside the model output, never in its place' });
  return out;
}

/* ───────────────────────── the stream (VIZ-26) ───────────────────────── */

const COMPARATOR: Readonly<Record<string, ControlLimitIn['comparator']>> = { lt: '<', le: '<=', gt: '>', ge: '>=' };
/** The stream's inputs as a sample (the LATEST value per event day — a revision replaces), its rule as the declared limit, its retractions
 *  and recoveries as interventions. The baseline is NOT computed here: the page states one only when the record carries one. */
export function streamControl(d: Pick<StreamDetail, 'inputs' | 'rule' | 'signals' | 'checkpoints'>): {
  points: Array<{ at: string; value: number | null }>; limits: ControlLimitIn[]; interventions: Array<{ at: string; label: string }>;
} {
  const byDay = new Map<string, { value: number; seq: number }>();
  for (const i of d.inputs) {
    if (i.lateness === 'late_beyond_allowance' || i.disposition === 'duplicate') continue;
    const day = String(i.event_time).slice(0, 10); const prev = byDay.get(day);
    if (prev === undefined || i.input_seq > prev.seq) byDay.set(day, { value: i.value, seq: i.input_seq });
  }
  const points = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([at, v]) => ({ at, value: num(v.value) }));
  const r = d.rule;
  const limits: ControlLimitIn[] = r === null || COMPARATOR[r.predicate.comparator] === undefined ? [] : [{
    key: r.rule_key, label: `${r.title} (v${r.version}): a day ${COMPARATOR[r.predicate.comparator]} ${r.predicate.threshold}`, value: r.predicate.threshold, comparator: COMPARATOR[r.predicate.comparator]!,
    basis: `the stream rule's declared threshold; a window fires when at least ${r.predicate.min_hits} day(s) meet it`, kind: 'rule',
  }];
  const interventions = [
    ...d.signals.filter((s) => s.emission === 'retracted').map((s) => ({ at: String(s.emitted_at), label: `signal retracted (${s.retraction_kind ?? 'by a person'})` })),
    ...d.checkpoints.filter((c) => /recover/i.test(c.reason)).map((c) => ({ at: String(c.taken_at), label: `recovery: ${c.reason}` })),
  ].filter((x) => toInstant(x.at) !== null);
  return { points, limits, interventions };
}

/* ───────────────────────── a source's health (CMP-060) ───────────────────────── */

/** The health states as an ordinal scale (best first); `unknown` is its own level, last — never placed between two known states. */
export const HEALTH_LEVELS = ['healthy', 'degraded', 'suspended', 'failed', 'unknown'] as const;
export function healthSeries(timeline: ReadonlyArray<Row>): Array<{ at: string; value: number | null; note: string | null }> {
  return timeline.map((t) => {
    const i = (HEALTH_LEVELS as readonly string[]).indexOf(String(t['state']));
    return { at: String(t['evaluated_at'] ?? ''), value: i < 0 ? HEALTH_LEVELS.length - 1 : i, note: t['reason'] === undefined || t['reason'] === null ? null : String(t['reason']) };
  }).filter((p) => toInstant(p.at) !== null);
}

/* ───────────────────────── the timeline (VIZ-02) ───────────────────────── */

const AXIS_FIELD: Readonly<Record<string, 'eventTime' | 'observedAt' | 'validFrom' | 'recordedAt'>> = { event: 'eventTime', observation: 'observedAt', valid: 'validFrom', record: 'recordedAt' };
/** The versions placed on the read's own axis (a version with no time on it is listed, not placed) and the ledger events (record time). */
export function timelineEvents(v: Pick<TimelineView, 'items' | 'events' | 'window'>): TimelineEventIn[] {
  const field = AXIS_FIELD[v.window.axis] ?? 'recordedAt';
  const items = v.items.map((i) => ({
    key: `v:${i.ref}`, at: (i[field] as string | null) ?? null, label: `${i.title} (${i.ref})`, actor: null, source: i.objectType,
    correction: i.correctedLater === null ? null : `corrected on ${String(i.correctedLater.at).slice(0, 10)} by ${i.correctedLater.by}`, recordedAt: i.recordedAt,
  }));
  const events = v.window.axis === 'record' ? v.events.map((e, n) => ({
    key: `e:${n}`, at: e['at'] === undefined ? null : String(e['at']), label: `${String(e['ledger'])}: ${String(e['event'])}`, actor: e['actor'] === undefined || e['actor'] === null ? null : String(e['actor']),
    source: e['ref'] === undefined ? null : String(e['ref']), correction: null, recordedAt: e['at'] === undefined ? null : String(e['at']),
  })) : [];
  return [...items, ...events];
}

/* ───────────────────────── twins (VIZ-25) and the fabric (VIZ-08) ───────────────────────── */

/** A model's calibration pairs (predicted against later observed) across its calibrations; a calibration without pairs adds none. */
export function calibrationPairs(cals: readonly TwinCalibration[]): ScatterPointIn[] {
  return cals.flatMap((c) => (c.pairs ?? []).map((p, i) => ({ key: `${c.calibration_id ?? `${c.key}#${c.seq}`}:${i}`, label: `${c.twin_title === undefined ? '' : `${c.twin_title} · `}${c.key} (calibration ${c.seq}) pair ${i + 1}: ${p.from} → ${p.against}`, x: num(p.predicted), y: num(p.observed), group: p.source })));
}
/** A validation's benchmark sample binned (Sturges' rule — stated), with the run mean, the benchmark mean and the band as marks. */
export function benchmarkInput(v: Pick<Validation, 'benchmark' | 'discrepancy'>): { values: number[]; bins: { count: number }; marks: Array<{ key: string; label: string; at: number }>; rule: string } {
  const values = (v.benchmark.values ?? []).filter((x) => Number.isFinite(x));
  const count = Math.max(1, Math.ceil(Math.log2(Math.max(1, values.length)) + 1));
  const d = v.discrepancy;
  const marks = [
    { key: 'run', label: 'run mean', at: Number(d.run_mean) }, { key: 'bench', label: 'benchmark mean', at: Number(d.benchmark_mean) },
    { key: 'lo', label: 'band low', at: Number(d.band?.[0]) }, { key: 'hi', label: 'band high', at: Number(d.band?.[1]) },
  ].filter((m) => Number.isFinite(m.at));
  return { values, bins: { count }, marks, rule: `${count} equal-width bins over the sample's range (Sturges' rule: ⌈log₂ n⌉ + 1, n = ${values.length})` };
}
