/**
 * CP-6 B82 §CF — THE SPECS of the charts placed on the product's pages (pure; each is checked against chartGrammar with its rows in
 * chart-specs-b82.test.ts). A spec states what the page's read IS — its basis, its time (basis, cutoff, as-of), its units, the read or the
 * cited version it came from, its uncertainty in the record's own words, the legend and the table alternative's summary and columns. Nothing
 * is claimed that the read does not carry: a forecast's validation state is quoted, never softened; a declared relation is "declared, not
 * estimated"; a rule met is a signal, not a certainty. `readAt` is the instant the page made its read (as-of); a cutoff is the record's own.
 */
import type { ChartSpec, LegendEntry } from './b82-seams';
import type { ExportLabel } from './table-b80';
import type { Scope } from './observation';
import type { ForecastRow } from './prediction';
import {
  CALIBRATION_COLUMNS, CONTROL_COLUMNS, CORRELATION_COLUMNS, DISTRIBUTION_BIN_COLUMNS, DISTRIBUTION_PERCENTILE_COLUMNS, EVENT_TIMELINE_COLUMNS,
  HORIZON_MATRIX_COLUMNS, PROBABILITY_BAND_COLUMNS, SCATTER_COLUMNS, TIME_SERIES_COLUMNS, chartNumber, toInstant,
  type BandPointIn, type CalibrationPointIn, type HorizonRowIn, type PercentileItemIn, type ScatterPointIn, type TimelineEventIn,
} from './chart-b82';

/** The CSV label of a page's read: the scope, the ceiling the read declares (or that it declares none), the as-of. */
export const readExport = (s: Scope, asOf: string, ceiling?: string | null): ExportLabel => ({
  scope: `tenant ${s.tenantId} / domain ${s.domainId}`, classificationCeiling: ceiling ?? 'the read declares none — the rows are those this principal was shown', asOf,
});
/** A cutoff no later than the as-of (the grammar's rule): the record's instant, else a declared absence. */
const cutoffOf = (v: string | null | undefined, asOf: string, why: string): ChartSpec['time']['cutoff'] => {
  const t = toInstant(v ?? null); const a = toInstant(asOf);
  if (t === null) return { absent: why };
  return a !== null && t > a ? asOf : new Date(t).toISOString();
};
const words = (v: string) => v.replace(/_/g, ' ');
const BAND_LEGEND: LegendEntry[] = [
  { key: 'q50', label: 'median (q50)', dash: 'solid', marker: 'circle' },
  { key: 'band', label: 'q10–q90 band', dash: 'dashed', marker: 'none', token: 'color.uncertain' },
];
const READ = (read: string, label: string) => [{ read, label }];

/* ── forecasts ── */
export function forecastBandSpec(f: ForecastRow, points: readonly BandPointIn[], readAt: string): ChartSpec {
  const unit = f.unit ?? 'as the series states'; const last = points[points.length - 1];
  return {
    kind: 'probability_band', title: `${f.series_key} · ${f.horizon_code} — the forecast band`,
    basis: `model forecast (${f.method}@${f.method_version}) — quantiles of its distribution, ${words(f.validation_state)}, ${f.label}`,
    time: { basis: 'horizon', cutoff: cutoffOf(f.known_at, readAt, 'the forecast records no knowledge cutoff'), asOf: readAt },
    units: [{ measure: f.series_key, unit }],
    sources: [{ citation: { kind: 'forecast', id: f.forecast_id, version: 1, digest: null }, label: 'the forecast (immutable; a revision is a new forecast)' }],
    uncertainty: { kind: 'band', statement: `q10–q90 of the forecast distribution; ${words(f.validation_state).toUpperCase()} — ${f.validation_note || 'no validation note recorded'}`, level: 0.8 },
    legend: BAND_LEGEND,
    alternative: {
      summary: last === undefined ? 'The forecast carries no quantile.' : `${points.length} point(s) from ${points[0]!.at} to ${last.at}; at ${last.at} the median is ${chartNumber(last.q50)} (q10 ${chartNumber(last.q10)} – q90 ${chartNumber(last.q90)}) ${unit}. ${words(f.validation_state)}.`,
      columns: PROBABILITY_BAND_COLUMNS(unit),
      definitions: [{ term: 'Cutoff', definition: 'the instant the forecast was allowed to know (its known-at); nothing recorded after it was read' }, { term: 'Band', definition: 'the 10th to the 90th percentile of the forecast distribution — not a range of certainty' }],
    },
  };
}
export function horizonSpec(seriesKey: string, rows: readonly HorizonRowIn[], readAt: string): ChartSpec {
  const issued = rows.filter((r) => r.q50 !== null).length;
  return {
    kind: 'horizon_matrix', title: `${seriesKey} — the six canonical horizons`, basis: 'model forecasts in force per horizon (issued, newest first; another state is said)',
    time: { basis: 'horizon', cutoff: { absent: 'each row carries its own forecast\'s knowledge cutoff (in the forecast\'s own page)' }, asOf: readAt },
    units: [{ measure: 'quantiles (one scale per row)', unit: 'the unit stated per row' }], sources: READ('prediction.read · /forecasts/list', 'the forecasts as known now'),
    uncertainty: { kind: 'interval', statement: 'q10–q90 per row, each on its own scale; the validation state is in the Score column', level: 0.8 },
    legend: [{ key: 'q', label: 'q10–q90 with the median', dash: 'solid', marker: 'circle', token: 'color.uncertain' }],
    alternative: { summary: `${issued} of the six canonical horizons carry a forecast for ${seriesKey}; a horizon with none says so.`, columns: HORIZON_MATRIX_COLUMNS('the unit stated per row') },
  };
}
export function seriesSpec(seriesKey: string, unit: string, n: number, knownAt: string, readAt: string, cadenceWords: string, attribution: string | null): ChartSpec {
  return {
    kind: 'time_series', title: `${seriesKey} — the observations the forecast could know`, basis: `observed values of the series, as recorded by ${knownAt.slice(0, 10)}${attribution ? ` — ${attribution}` : ''}`,
    time: { basis: 'observation', cutoff: cutoffOf(knownAt, readAt, 'no knowledge bound'), asOf: readAt },
    units: [{ measure: seriesKey, unit }], sources: READ('prediction.read · /series/:seriesKey/points', 'the series points, each from its evidence version'),
    uncertainty: { kind: 'not_quantified', statement: 'values as published by the source; no measurement error is stated' },
    legend: [{ key: seriesKey, label: seriesKey, dash: 'solid', marker: 'circle' }],
    alternative: { summary: `${n} observation(s) of ${seriesKey} known at ${knownAt.slice(0, 10)}; ${cadenceWords}.`, columns: TIME_SERIES_COLUMNS(unit) },
  };
}

/* ── calibration ── */
export function outcomesSpec(points: readonly CalibrationPointIn[], readAt: string): ChartSpec {
  return {
    kind: 'calibration_plot', title: 'Scored outcomes — observed coverage of the 80 % band', basis: 'live and replay outcomes scored against issued forecasts (each family labelled)',
    time: { basis: 'record', cutoff: { absent: 'the summary states no scoring cutoff — every outcome recorded so far' }, asOf: readAt },
    units: [{ measure: 'coverage', unit: 'share (0–1)' }, { measure: 'outcomes', unit: 'count' }, { measure: 'pinball loss', unit: 'series units' }],
    sources: READ('prediction.read · /calibration/summary', 'the calibration record'),
    uncertainty: { kind: 'interval', statement: '95 % Wilson interval from each family’s number of outcomes', level: 0.95 },
    legend: groupLegend(points),
    alternative: {
      summary: points.length === 0 ? 'Nothing has been scored against a real outcome yet.' : `${points.length} famil${points.length === 1 ? 'y' : 'ies'} scored; ${points.filter((p) => p.observed !== null && p.observed < 0.8).length} below the 80 % promise.`,
      columns: [...CALIBRATION_COLUMNS('share (0–1)'), { key: 'pinball', label: 'Pinball', kind: 'number', unit: 'series units' }, { key: 't1', label: 'T1', kind: 'state' }],
      definitions: [{ term: 'Method', definition: 'the share of outcomes inside the forecast’s q10–q90 band; Wilson score interval at 95 %' }, { term: 'Period', definition: 'every outcome scored so far for the family; its labels say live or replay' }, { term: 'Bins', definition: 'one per forecast family (series, horizon, method)' }],
    },
  };
}
export function backtestSpec(points: readonly CalibrationPointIn[], readAt: string): ChartSpec {
  return {
    kind: 'calibration_plot', title: 'Backtests on held-out history — the learned model against seasonal naive', basis: 'backtests on held-out history (each with its mode: historical or retrospective)',
    time: { basis: 'record', cutoff: { absent: 'each backtest states its own window (the Period column)' }, asOf: readAt },
    units: [{ measure: 'coverage', unit: 'share (0–1)' }, { measure: 'origins', unit: 'count' }, { measure: 'skill', unit: 'share (−1 to 1)' }],
    sources: READ('prediction.read · /calibration/summary (backtests)', 'the backtest record'),
    uncertainty: { kind: 'interval', statement: '95 % Wilson interval from the number of origins', level: 0.95 },
    legend: groupLegend(points),
    alternative: {
      summary: points.length === 0 ? 'No backtest has been run.' : `${points.length / 2} backtest(s), each the learned model beside seasonal naive.`,
      columns: [...CALIBRATION_COLUMNS('share (0–1)'), { key: 'skill', label: 'Skill vs baseline', kind: 'number', unit: 'share (−1 to 1)' }, { key: 'verdict', label: 'Verdict', kind: 'text' }],
      definitions: [{ term: 'Method', definition: 'the share of held-out outcomes inside the q10–q90 band of each origin’s forecast; Wilson interval at 95 % over the origins' }, { term: 'Period', definition: 'the backtest window and its mode (historical: each origin saw only what was recorded by then; retrospective: one vintage)' }],
    },
  };
}
function groupLegend(points: readonly CalibrationPointIn[]): LegendEntry[] {
  const shapes = ['circle', 'square', 'triangle', 'diamond', 'cross'] as const;
  const groups = [...new Set(points.map((p) => p.group))];
  return groups.length === 0 ? [{ key: 'none', label: 'no family scored', dash: 'solid', marker: 'circle' }]
    : groups.slice(0, shapes.length).map((g, i) => ({ key: g, label: g, dash: 'solid', marker: shapes[i]! }));
}

/* ── ensembles ── */
export function ensembleSpec(seriesKey: string, horizon: string, unit: string, items: readonly PercentileItemIn[], knownAt: string, readAt: string, rule: string): ChartSpec {
  return {
    kind: 'distribution', title: `${seriesKey} at ${horizon} — the members, the ensemble and the judgement`, basis: `member forecasts as issued, the ensemble under ${rule} (MODEL OUTPUT), a named owner’s overlay (JUDGEMENT)`,
    time: { basis: 'none', cutoff: cutoffOf(knownAt, readAt, 'the run records no cutoff'), asOf: readAt },
    units: [{ measure: seriesKey, unit: unit || 'as the series states' }], sources: READ('prediction.ensemble.read · /ensembles/:runId/read', 'the ensemble run'),
    uncertainty: { kind: 'distribution', statement: '10th–90th percentile of each distribution as issued; the disagreement is measured by the server and stated below' },
    legend: [{ key: 'p', label: '10th–90th percentile with the median', dash: 'solid', marker: 'diamond' }],
    alternative: { summary: `${items.length} distribution(s) on one axis: ${items.map((i) => `${i.label} median ${chartNumber(i.p50)}`).join('; ')}.`, columns: DISTRIBUTION_PERCENTILE_COLUMNS(unit || 'as the series states') },
  };
}

/* ── the stream ── */
export function streamSpec(title: string, unit: string, n: number, watermark: string | null, readAt: string, ruleWords: string, met: number): ChartSpec {
  return {
    kind: 'control_chart', title: `${title} — the sample against its rule`, basis: 'observed stream inputs in event time (the latest value per day; inputs late beyond the allowance are excluded, as the processor excludes them)',
    time: { basis: 'event', cutoff: cutoffOf(watermark, readAt, 'the processor has no watermark yet'), asOf: readAt },
    units: [{ measure: 'value', unit }], sources: READ('prediction.read · /streams/processors/:processorId/get', 'the stream processor'),
    uncertainty: { kind: 'not_quantified', statement: 'values as the inputs carry them; a rule met is a signal to look at, not a certainty about the process' },
    legend: [{ key: 'v', label: 'daily value', dash: 'solid', marker: 'circle' }, { key: 'm', label: 'a day that meets the rule', dash: 'solid', marker: 'square' }, { key: 'r', label: 'the rule’s threshold', dash: 'dashed', marker: 'none' }],
    alternative: {
      summary: `${n} day(s) in the sample; ${met} meet the rule (${ruleWords}).`, columns: CONTROL_COLUMNS(unit),
      definitions: [{ term: 'Baseline', definition: 'none drawn: the processor records no baseline, and none is computed here' }, { term: 'Rule', definition: ruleWords }, { term: 'Cutoff', definition: 'the watermark — the highest event time seen minus the rule’s lag, never the wall clock' }],
    },
  };
}

/* ── a source's health ── */
export function healthSpec(sourceLabel: string, n: number, readAt: string, deterministic: boolean): ChartSpec {
  return {
    kind: 'time_series', title: `${sourceLabel} — the health timeline`, basis: `health states derived from stored events and measurements alone (the replay${deterministic ? ' — identical on both runs' : ' — THE TWO RUNS DIFFERED'})`,
    time: { basis: 'record', cutoff: { absent: 'the replay covers every stored evaluation' }, asOf: readAt },
    units: [{ measure: 'health state', unit: 'ordinal state' }], sources: READ('observation.read.health · /sources/:sourceId/health/replay', 'the health replay'),
    uncertainty: { kind: 'ordinal', statement: 'states as the rule derives them; nothing lies between two states, and "unknown" is its own state' },
    legend: [{ key: 'health', label: 'health state', dash: 'solid', marker: 'circle' }],
    alternative: { summary: `${n} transition(s) replayed from stored events.`, columns: TIME_SERIES_COLUMNS('ordinal state', 'instant', true, 'Reason') },
  };
}

/* ── the timeline ── */
export function timelineSpec(subject: string, axis: string, events: readonly TimelineEventIn[], asOf: string, readAt: string, live: boolean): ChartSpec {
  const basis = (['event', 'observation', 'valid', 'record'] as const).find((a) => a === axis) ?? 'record';
  return {
    kind: 'event_timeline', title: `${subject} — the chronology on ${axis} time`, basis: `the versions${basis === 'record' ? ' and the ledger events' : ''} the timeline read placed in the window${live ? '' : `, as known at ${asOf.slice(0, 16).replace('T', ' ')} UTC`}`,
    time: { basis, cutoff: live ? { absent: 'the live read — nothing is excluded by an as-of instant' } : cutoffOf(asOf, readAt, 'no as-of instant'), asOf: readAt },
    units: [{ measure: 'event', unit: 'occurrence' }], sources: READ('graph.timeline.read · /timeline/read', 'the timeline read'),
    uncertainty: { kind: 'not_applicable', statement: 'recorded events; each version’s clock (trusted, degraded, unknown …) is stated in the versions table below' },
    legend: [{ key: 'e', label: 'event', dash: 'solid', marker: 'circle' }, { key: 'c', label: 'a version corrected later', dash: 'dotted', marker: 'diamond' }],
    alternative: { summary: `${events.length} event(s) and version(s); ${events.filter((e) => e.correction !== null).length} corrected later; ${events.filter((e) => toInstant(e.at) === null).length} without a time on this axis.`, columns: EVENT_TIMELINE_COLUMNS() },
  };
}

/* ── twins and the fabric ── */
export function pairsSpec(modelRef: string, points: readonly ScatterPointIn[], readAt: string): ChartSpec {
  const groups = [...new Set(points.map((p) => p.group))];
  const shapes = ['circle', 'triangle', 'square'] as const;
  return {
    kind: 'scatter', title: `${modelRef} — predicted against later observed`, basis: 'the calibration pairs the server formed (control runs inside the envelope, simulated or predicted elements, recorded reconciliations) — SYNTHETIC twins',
    time: { basis: 'none', cutoff: { absent: 'each pair names the instants it compares (the Point column)' }, asOf: readAt },
    units: [{ measure: 'the calibrated key', unit: 'the key’s unit' }], sources: READ('twin.read · /models/list', 'the behaviour models and their calibrations'),
    uncertainty: { kind: 'not_quantified', statement: 'each pair as recorded; the calibration’s MAE, MAPE and bias are stated beside the model' },
    legend: (groups.length === 0 ? ['none'] : groups).slice(0, 3).map((g, i) => ({ key: g, label: g === 'none' ? 'no pair' : `from a ${g}`, dash: 'solid' as const, marker: shapes[i]! })),
    alternative: { summary: `${points.length} pair(s); the dashed line is perfect agreement (a reference, not a fit).`, columns: SCATTER_COLUMNS('Predicted', 'the key’s unit', 'Observed', 'the key’s unit') },
  };
}
export function benchmarkSpec(measure: string, kind: string, n: number, readAt: string, rule: string, verdict: string, basis: string): ChartSpec {
  return {
    kind: 'distribution', title: `${measure} — the ${kind} sample the run was validated against`, basis: `${kind === 'observed' ? 'observed values (evidence cited)' : 'a benchmark sample'} — ${basis}`,
    time: { basis: 'none', cutoff: { absent: 'a validation sample has no time axis; it was recorded with the validation' }, asOf: readAt },
    units: [{ measure, unit: 'as the measure states' }, { measure: 'values', unit: 'count' }], sources: READ('simulation.fabric.read · /runs/:runId/read', 'the run’s validation'),
    uncertainty: { kind: 'distribution', statement: `the empirical sample (n ${n}); the run's discrepancy band is marked; verdict ${verdict}` },
    legend: [{ key: 'bins', label: 'values per bin', dash: 'solid', marker: 'square' }, { key: 'marks', label: 'the run mean, the benchmark mean and the band (labelled lines)', dash: 'solid', marker: 'none', directLabel: true }],
    alternative: { summary: `${n} value(s) binned; ${rule}.`, columns: DISTRIBUTION_BIN_COLUMNS('as the measure states') },
  };
}
/** The correlation matrix of the declared exposure correlations (§SC places it on /prediction/exposures). */
export function correlationSpec(pairs: number, missing: number, readAt: string, method: string): ChartSpec {
  return {
    kind: 'correlation_matrix', title: 'Exposure correlations — declared, not estimated', basis: 'declared categorical relations between exposures (independent, correlated, comonotone) with an optional coefficient',
    time: { basis: 'record', cutoff: { absent: 'every entry recorded so far; the latest per pair is drawn' }, asOf: readAt },
    units: [{ measure: 'coefficient', unit: 'coefficient (−1 to 1)' }, { measure: 'sample', unit: 'count' }], sources: READ('prediction.exposure.read · /exposures/correlations/list', 'the exposure correlations'),
    uncertainty: { kind: 'not_quantified', statement: 'declared by a person or proposed by an agent run — not estimated, no interval' },
    legend: [{ key: 'k', label: 'coefficient (square side = magnitude, sign written)', dash: 'solid', marker: 'square' }],
    alternative: {
      summary: `${pairs - missing} of ${pairs} pair(s) carry an entry; ${missing} are missing.`, columns: CORRELATION_COLUMNS('coefficient (−1 to 1)'),
      definitions: [{ term: 'Method', definition: method }, { term: 'Sample', definition: 'none: a declaration has no sample' }, { term: 'Missingness', definition: 'a pair with no entry is missing, never zero' }, { term: 'Caveat', definition: 'association only — no entry says one exposure moves another' }],
    },
  };
}
