'use client';
/**
 * CP-6 B82 §CF — the catalogue's section for THE CHART FRAME AND THE QUANTITATIVE CHARTS (F-P7-E-21; REL-17: every kind with its legend and
 * its alternative): ChartFrame in its states (rest, loading, error, withheld, empty, stale, refused), ChartLegend, DataTooltip (every chart's
 * points), AccessibleAlternative (every chart's table, the CSV offered on one), and the eleven quantitative kinds — each from a SYNTHETIC
 * specimen that says so (DESIGN D13), each spec passing the grammar, one spec deliberately missing its declarations to show the refusal. Nothing
 * here calls a server; the CSV labels a fixture. The walk e2e/phase6-b82-viz.demo.spec.ts reads each alternative through the accessibility
 * tree. Construction evidence only — not demonstrated operation, not acceptance.
 */
import { ChartFrame } from '../../../../../components/chart-frame';
import {
  CalibrationPlot, ControlChart, CorrelationMatrix, Distribution, EventTimeline, HorizonMatrix, ProbabilityBand, Scatter, TimeSeries, VarianceBridge, Waterfall,
} from '../../../../../components/chart';
import { Panel } from '../../../../../components/layers';
import type { ChartKind, ChartSpec, LegendEntry, AlternativeColumn } from '../../../../../lib/b82-seams';
import {
  BRIDGE_COLUMNS, CALIBRATION_COLUMNS, CONTROL_COLUMNS, CORRELATION_COLUMNS, DISTRIBUTION_BIN_COLUMNS, DISTRIBUTION_PERCENTILE_COLUMNS, EVENT_TIMELINE_COLUMNS,
  HORIZON_MATRIX_COLUMNS, PROBABILITY_BAND_COLUMNS, SCATTER_COLUMNS, TIME_SERIES_COLUMNS, pathPoints,
} from '../../../../../lib/chart-b82';

/** The names this section renders (the catalogue's RENDERED set). */
export const CF_RENDERED: readonly string[] = ['ChartFrame', 'ChartLegend', 'DataTooltip', 'AccessibleAlternative', 'TimeSeries', 'EventTimeline', 'ProbabilityBand', 'HorizonMatrix',
  'Distribution', 'CalibrationPlot', 'Waterfall', 'VarianceBridge', 'CorrelationMatrix', 'Scatter', 'ControlChart'];

const AS_OF = '2026-10-19T08:00:00Z';
const CUT = '2026-10-18T00:00:00Z';
const SPECIMEN = [{ specimen: 'SYNTHETIC catalogue values — no record, no read' }];
const FIXTURE_EXPORT = { scope: 'the design catalogue (SYNTHETIC fixture — no tenant, no domain)', classificationCeiling: 'none — a SYNTHETIC fixture', asOf: AS_OF };
const one = (key: string, label: string): LegendEntry[] => [{ key, label, dash: 'solid', marker: 'circle' }];
function spec(kind: ChartKind, title: string, o: { basis: string; time: ChartSpec['time']['basis']; unit: [string, string]; units?: ChartSpec['units']; unc: ChartSpec['uncertainty']; legend: LegendEntry[];
  summary: string; columns: AlternativeColumn[]; definitions?: Array<{ term: string; definition: string }> }): ChartSpec {
  return {
    kind, title: `${title} (SYNTHETIC)`, basis: o.basis, time: { basis: o.time, cutoff: CUT, asOf: AS_OF },
    units: o.units ?? [{ measure: o.unit[0], unit: o.unit[1] }], sources: SPECIMEN, uncertainty: o.unc, legend: o.legend,
    alternative: { summary: o.summary, columns: o.columns, ...(o.definitions === undefined ? {} : { definitions: o.definitions }) },
  };
}
const days = (n: number, from = '2026-09-20') => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
const TRANSITS = days(28).map((at, i) => ({ at, value: i === 9 || i === 10 ? null : Math.round(42 + 6 * Math.sin(i / 3) - (i > 20 ? 14 : 0)) }));

function Frames() {
  const s = spec('time_series', 'Chart frame — rest', { basis: 'specimen counts', time: 'observation', unit: ['vessels', 'vessels per day'], unc: { kind: 'not_quantified', statement: 'counts as given; no error stated' },
    legend: one('a', 'specimen series'), summary: 'A short specimen series for the frame states.', columns: TIME_SERIES_COLUMNS('vessels per day') });
  const rows = [{ series: 'specimen series', at: '2026-10-01', value: 3 }];
  const refused = { ...s, title: 'Chart frame — refused (a spec missing its declarations)', basis: '', units: [], uncertainty: undefined } as unknown as ChartSpec;
  return (
    <Panel title="Chart frame — every state (CMP-057)">
      <ChartFrame spec={s} rows={rows} exportAs={FIXTURE_EXPORT} />
      <ChartFrame spec={{ ...s, title: 'Chart frame — loading (SYNTHETIC)' }} rows={[]} status={{ state: 'loading' }} />
      <ChartFrame spec={{ ...s, title: 'Chart frame — error (SYNTHETIC)' }} rows={[]} status={{ state: 'error', error: { code: 'EYE_FIXTURE', message: 'a SYNTHETIC refusal shown in the server’s words; reload the page to read it again', correlationId: '00000000-0000-7000-8000-000000000000' } }} />
      <ChartFrame spec={{ ...s, title: 'Chart frame — withheld (SYNTHETIC)' }} rows={[]} status={{ state: 'withheld', statement: 'the read is above this fixture principal’s clearance' }} />
      <ChartFrame spec={{ ...s, title: 'Chart frame — empty (SYNTHETIC)' }} rows={[]} status={{ state: 'empty', statement: 'the read returned no value in the window' }} />
      <ChartFrame spec={{ ...s, title: 'Chart frame — stale (SYNTHETIC)' }} rows={rows} status={{ state: 'stale', statement: 'the projection lags its log by 3 events; values as of the cutoff' }} />
      <ChartFrame spec={refused} rows={rows} />
    </Panel>
  );
}

function Kinds() {
  const r4 = (x: number) => Number(x.toFixed(4));
  const band = pathPoints('2026-10-18', Array.from({ length: 30 }, (_, i) => ({ step: i + 1, q10: r4(0.28 - i * 0.001), q50: r4(0.343 + i * 0.0005), q90: r4(0.406 + i * 0.002) })));
  const twoSeries = [
    { key: 'cp4', label: 'chokepoint 4', points: TRANSITS },
    { key: 'cp7', label: 'chokepoint 7', points: TRANSITS.map((p, i) => ({ at: p.at, value: i === 14 ? null : 30 + (i % 5) })) },
  ];
  return (
    <Panel title="The quantitative charts — every kind with its legend and its table alternative (VIZ-01…26, VIZ-36)">
      <TimeSeries series={twoSeries} cadenceMs={86_400_000} exportAs={FIXTURE_EXPORT}
        spec={spec('time_series', 'Time series — daily transits with a gap', { basis: 'specimen daily transit counts', time: 'observation', unit: ['transits', 'vessels per day'],
          unc: { kind: 'not_quantified', statement: 'counts as published; no measurement error is stated' },
          legend: [{ key: 'cp4', label: 'chokepoint 4', dash: 'solid', marker: 'circle', directLabel: true }, { key: 'cp7', label: 'chokepoint 7', dash: 'dashed', marker: 'square', directLabel: true }],
          summary: 'Two specimen series of daily transits over 28 days; chokepoint 4 has two missing days (drawn as a gap) and falls by about 14 vessels a day after day 21.', columns: TIME_SERIES_COLUMNS('vessels per day') })} />
      <TimeSeries series={[{ key: 'h', label: 'source health', points: [{ at: '2026-10-01T06:00:00Z', value: 0 }, { at: '2026-10-03T06:00:00Z', value: 1 }, { at: '2026-10-04T06:00:00Z', value: 2 }, { at: '2026-10-06T06:00:00Z', value: 0 }] }]}
        levels={['healthy', 'degraded', 'failing']}
        spec={spec('time_series', 'Time series — an ordinal state over time', { basis: 'specimen health transitions', time: 'record', unit: ['health state', 'ordinal state'],
          unc: { kind: 'ordinal', statement: 'states as derived by the rule; no gradation between them' }, legend: one('h', 'health state'),
          summary: 'Healthy, then degraded on 3 October, failing on 4 October, healthy again on 6 October.', columns: TIME_SERIES_COLUMNS('ordinal state', 'instant', true) })} />
      <EventTimeline events={[
        { key: '1', at: '2026-10-01T09:00:00Z', label: 'claim extracted', actor: 'extraction agent', source: 'EVD specimen', correction: null, recordedAt: '2026-10-01T09:01:00Z' },
        { key: '2', at: '2026-10-02T13:00:00Z', label: 'claim challenged', actor: 'A. Hoffmann', source: 'review specimen', correction: null, recordedAt: '2026-10-02T13:00:00Z' },
        { key: '3', at: '2026-10-04T08:30:00Z', label: 'claim corrected', actor: 'K. Müller', source: 'review specimen', correction: 'v2 corrects v1 (the restated day)', recordedAt: '2026-10-04T08:31:00Z' },
        { key: '4', at: null, label: 'a version recorded before times were stated', actor: null, source: 'EVD specimen', correction: null, recordedAt: '2026-09-30T00:00:00Z' },
      ]} spec={spec('event_timeline', 'Event timeline — a claim’s chronology', { basis: 'specimen recorded events', time: 'event', unit: ['event', 'occurrence'], unc: { kind: 'not_applicable', statement: 'recorded events; their times are stated with their clocks' },
        legend: [{ key: 'e', label: 'event', dash: 'solid', marker: 'circle' }, { key: 'c', label: 'event with a correction', dash: 'dotted', marker: 'diamond' }],
        summary: 'Three placed events from extraction to correction, and one version without an event time listed last.', columns: EVENT_TIMELINE_COLUMNS() })} />
      <ProbabilityBand points={band} cutoff="2026-10-18" validation="UNVALIDATED — no applicable backtest has scored it"
        spec={spec('probability_band', 'Probability band — transit delay over 30 days', { basis: 'specimen model forecast quantiles', time: 'valid', unit: ['probability of a delay', 'probability (0–1)'],
          unc: { kind: 'band', statement: 'q10–q90 of the forecast distribution; unvalidated', level: 0.8 },
          legend: [{ key: 'q50', label: 'median (q50)', dash: 'solid', marker: 'circle' }, { key: 'band', label: 'q10–q90 band', dash: 'dashed', marker: 'none', token: 'color.uncertain' }],
          summary: 'The median rises from 0.344 to 0.358 over 30 days; the band widens from 0.28–0.41 to 0.25–0.46.', columns: PROBABILITY_BAND_COLUMNS('probability (0–1)') })} />
      <HorizonMatrix rows={[
        { horizon: '30d', target: 'transit delay', q10: 0.282, q50: 0.343, q90: 0.406, unit: 'probability', method: 'event_logit@1', score: 'unvalidated', use: 'probability language' },
        { horizon: '90d', target: 'transits', q10: 31, q50: 38, q90: 44, unit: 'vessels per day', method: 'holt_winters@1', score: 'skill 0.12 vs seasonal naive', use: 'quantity language' },
        { horizon: '5y', target: 'regime', q10: null, q50: null, q90: null, unit: null, method: 'scenario_regime@1', score: 'not validatable', use: 'scenario language only' },
      ]} spec={spec('horizon_matrix', 'Horizon matrix — six horizons, one scale per row', { basis: 'specimen forecasts by horizon', time: 'horizon', unit: ['quantile', 'the unit stated per row'],
        unc: { kind: 'interval', statement: 'q10–q90 per row, each on its own scale', level: 0.8 }, legend: [{ key: 'q', label: 'q10–q90 with the median', dash: 'solid', marker: 'circle' }],
        summary: 'Three of six canonical horizons carry a forecast; 180d, 1y and 3y carry none; 5y speaks scenario language only.', columns: HORIZON_MATRIX_COLUMNS('the unit stated per row') })} />
      <Distribution input={{ kind: 'bins', values: [3, 4, 4, 5, 5, 5, 6, 6, 7, 9, 12, 14], bins: { edges: [0, 3, 6, 9, 12, 15] }, marks: [{ key: 'p50', label: 'median 5.5', at: 5.5 }] }}
        spec={spec('distribution', 'Distribution — line-stop days over 12 runs', { basis: 'specimen simulated outcomes', time: 'none', unit: ['line-stop days', 'days'],
          units: [{ measure: 'line-stop days', unit: 'days' }, { measure: 'runs', unit: 'count' }],
          unc: { kind: 'distribution', statement: 'the empirical distribution of 12 specimen runs; bins declared at 3-day widths' }, legend: [{ key: 'bins', label: 'runs per bin', dash: 'solid', marker: 'square' }, { key: 'm', label: 'the median (labelled line)', dash: 'dashed', marker: 'none' }],
          summary: '12 runs; most stop the line for 3 to 6 days; two exceed 12 days.', columns: DISTRIBUTION_BIN_COLUMNS('days') })} />
      <Distribution input={{ kind: 'percentiles', items: [{ key: 'm1', label: 'seasonal naive', p10: 30, p50: 38, p90: 45 }, { key: 'm2', label: 'Holt-Winters', p10: 33, p50: 37, p90: 41 }, { key: 'e', label: 'ensemble (linear pool)', p10: 31, p50: 37.5, p90: 44, note: 'MODEL OUTPUT' }] }}
        spec={spec('distribution', 'Distribution — ensemble members and the pool', { basis: 'specimen member distributions', time: 'none', unit: ['transits', 'vessels per day'],
          unc: { kind: 'distribution', statement: '10th–90th percentile of each member as issued' }, legend: [{ key: 'p', label: '10th–90th percentile with the median', dash: 'solid', marker: 'diamond' }],
          summary: 'Two members and the pooled ensemble; the pool keeps the members’ spread (31–44).', columns: DISTRIBUTION_PERCENTILE_COLUMNS('vessels per day') })} />
      <CalibrationPlot points={[
        { key: 'a', label: 'cp4 30d', group: 'holt_winters@1', nominal: 0.8, observed: 0.71, n: 14, period: '2026-07 → 2026-10' },
        { key: 'b', label: 'cp4 90d', group: 'seasonal_naive@1', nominal: 0.8, observed: 0.86, n: 7, period: '2026-07 → 2026-10' },
        { key: 'c', label: 'ECB 1y', group: 'holt_winters@1', nominal: 0.8, observed: null, n: 0, period: null },
      ]} spec={spec('calibration_plot', 'Calibration — observed coverage of the 80 % band', { basis: 'specimen scored outcomes', time: 'record', unit: ['coverage', 'share (0–1)'],
        units: [{ measure: 'coverage', unit: 'share (0–1)' }, { measure: 'outcomes', unit: 'count' }],
        unc: { kind: 'interval', statement: '95 % Wilson interval from each family’s sample', level: 0.95 },
        legend: [{ key: 'holt_winters@1', label: 'holt_winters@1', dash: 'solid', marker: 'circle' }, { key: 'seasonal_naive@1', label: 'seasonal_naive@1', dash: 'solid', marker: 'square' }],
        summary: 'cp4 30d covers 71 % of 14 outcomes (promised 80 %); cp4 90d 86 % of 7; ECB 1y is unscored.', columns: CALIBRATION_COLUMNS('share (0–1)'),
        definitions: [{ term: 'Method', definition: 'share of outcomes inside the q10–q90 band; Wilson score interval at 95 %' }, { term: 'Period', definition: 'outcomes scored between the stated months' }, { term: 'Bins', definition: 'one bin per forecast family (series, horizon, method)' }] })} />
      <Waterfall start={{ label: 'Score Q2', value: 61 }} components={[{ key: 'o', label: 'objectives', delta: 6 }, { key: 'r', label: 'risks', delta: -9 }, { key: 'c', label: 'commitments', delta: 2 }]} end={{ label: 'Score Q3', value: 58 }}
        spec={spec('waterfall', 'Waterfall — a health score’s change', { basis: 'specimen score components', time: 'record', unit: ['score', 'points (0–100)'], unc: { kind: 'not_quantified', statement: 'component scores as computed; no interval is stated' },
          legend: [{ key: 'up', label: 'increase (open bar)', dash: 'solid', marker: 'none' }, { key: 'down', label: 'decrease (hatched bar)', dash: 'dashed', marker: 'none' }, { key: 'res', label: 'residual', dash: 'dotted', marker: 'none' }],
          summary: 'From 61 to 58: objectives +6, risks −9, commitments +2, residual −2 not attributed to a component.', columns: BRIDGE_COLUMNS('points (0–100)') })} />
      <VarianceBridge baseline={{ label: 'Planned cost', value: 120, period: 'Q3 plan' }} actual={{ label: 'Actual cost', value: 134, period: 'Q3' }}
        drivers={[{ key: 'f', label: 'freight', delta: 9, source: 'carrier invoices (specimen)' }, { key: 'd', label: 'demurrage', delta: 3, source: 'port statements (specimen)' }]}
        spec={spec('variance_bridge', 'Variance bridge — actual against plan', { basis: 'specimen cost records', time: 'record', unit: ['cost', 'EUR thousand'], unc: { kind: 'not_quantified', statement: 'booked amounts; no estimate' },
          legend: [{ key: 'd', label: 'attributed driver', dash: 'solid', marker: 'none' }, { key: 'u', label: 'unattributed', dash: 'dotted', marker: 'none' }],
          summary: 'Actual 134 against a plan of 120: freight +9, demurrage +3, unattributed +2.', columns: BRIDGE_COLUMNS('EUR thousand') })} />
      <CorrelationMatrix variables={[{ key: 'a', label: 'Red Sea closure' }, { key: 'b', label: 'Suez backlog' }, { key: 'c', label: 'Cape fuel cost' }]}
        cells={[{ a: 'a', b: 'b', coefficient: 0.6, relation: 'correlated', n: null, basis: 'declared by the risk owner (specimen)', kind: 'declared' }, { a: 'a', b: 'c', coefficient: null, relation: 'comonotone', n: null, basis: 'declared (specimen)', kind: 'declared' }]}
        spec={spec('correlation_matrix', 'Correlation matrix — declared exposure associations', { basis: 'specimen declared relations — declared, not estimated', time: 'record', unit: ['association', 'coefficient (−1 to 1)'],
          units: [{ measure: 'association', unit: 'coefficient (−1 to 1)' }, { measure: 'sample', unit: 'count' }],
          unc: { kind: 'not_quantified', statement: 'declared by a person; no estimate, no interval' }, legend: [{ key: 'k', label: 'coefficient (square side = magnitude)', dash: 'solid', marker: 'square' }],
          summary: 'Two of three pairs carry a declared relation; Suez backlog and Cape fuel cost have none.', columns: CORRELATION_COLUMNS('coefficient (−1 to 1)'),
          definitions: [{ term: 'Method', definition: 'declared by a named person — not estimated from data' }, { term: 'Sample', definition: 'none: a declaration has no sample' }, { term: 'Missingness', definition: 'a pair with no declaration is missing, never zero' }, { term: 'Caveat', definition: 'association only; nothing here says one exposure moves another' }] })} />
      <Scatter points={[{ key: '1', label: 'pair 1', x: 10, y: 12, group: 'reconciliation' }, { key: '2', label: 'pair 2', x: 14, y: 13, group: 'reconciliation' }, { key: '3', label: 'pair 3', x: 20, y: 24, group: 'run' }, { key: '4', label: 'pair 4', x: 25, y: null, group: 'run' }]}
        xLabel="predicted (days)" yLabel="observed (days)" line={{ kind: 'identity', label: 'perfect agreement (y = x)' }}
        spec={spec('scatter', 'Scatter — predicted against observed', { basis: 'specimen calibration pairs', time: 'none', unit: ['days', 'days'], unc: { kind: 'not_quantified', statement: 'each pair as recorded; no interval' },
          legend: [{ key: 'reconciliation', label: 'from a reconciliation', dash: 'solid', marker: 'circle' }, { key: 'run', label: 'from a run', dash: 'solid', marker: 'triangle' }],
          summary: 'Three pairs lie near the line of perfect agreement; one pair has no observed value.', columns: SCATTER_COLUMNS('Predicted', 'days', 'Observed', 'days') })} />
      <ControlChart points={TRANSITS} baseline={{ value: 41, label: 'baseline 41 (the sample mean of the first 14 days)' }}
        limits={[{ key: 'r', label: 'stream rule: transits ≤ 30', value: 30, comparator: '<=', basis: 'the B28 rule’s declared threshold (specimen)', kind: 'rule' }]}
        interventions={[{ at: '2026-10-11', label: 'reroute advisory' }]}
        spec={spec('control_chart', 'Control chart — transits against the stream rule', { basis: 'specimen observed transits', time: 'event', unit: ['transits', 'vessels per day'],
          unc: { kind: 'not_quantified', statement: 'counts as published; a rule met is a signal, not a certainty' }, legend: [{ key: 'v', label: 'daily value', dash: 'solid', marker: 'circle' }, { key: 'm', label: 'meets the rule', dash: 'solid', marker: 'square' }],
          summary: 'Transits hold near 41 until day 21, then fall after the reroute advisory; one day (17 October, 30 vessels) meets the stream rule.', columns: CONTROL_COLUMNS('vessels per day'),
          definitions: [{ term: 'Baseline', definition: 'the sample mean of the first 14 days' }, { term: 'Rule', definition: 'transits ≤ 30 vessels per day (the stream rule’s threshold)' }, { term: 'Sample', definition: '28 days, two missing' }] })} />
    </Panel>
  );
}

export function CfCatalogue() {
  return (
    <section aria-label="B82 — the chart frame and the quantitative charts">
      <Frames />
      <Kinds />
    </section>
  );
}
