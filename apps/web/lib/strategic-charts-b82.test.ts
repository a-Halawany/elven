/**
 * CP-6 B82 §SC — the scenario, decision, risk and operations charts' pure layer (strategic-charts-b82.ts): every spec a page declares passes
 * the §SC grammar WITH its rows; the §SC kind rules refuse what each anti-pattern names (a single destiny, a causal tornado, an opaque
 * composite, count as quality, a queue without its declared order, colour-only identity, an audit off record time); unequal frames are
 * refused with the reason; the geometry is deterministic and draws only what the read carries. Fixtures are SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { CHART_KINDS, type ChartSpec } from './b82-seams';
import { bridgeRows, bridgeSteps } from './chart-b82';
import {
  ALERT_COLUMNS, SC_REQUIRED_DEFINITIONS, alertGeometry, alertInput, alertRows, alertSpec, auditGeometry, auditRows, auditSpec, comparisonFrame, comparisonGeometry,
  comparisonRows, comparisonSpec, coverageGeometry, coverageInput, coverageRows, coverageSpec, diffGeometry, diffInput, diffRows, diffSpec, dominantUnit, fanGeometry,
  fanIdentity, fanRows, fanSpec, FAN_KIND_IDENTITY, healthBridgeInput, healthBridgeSpec, healthWaterfallSpec, outcomeBridgeSpec, healthGeometry, healthRows, healthSpec, healthWaterfallInput, isoOf, numOf, opportunityFromDetail,
  opportunityGeometry, opportunityRows, opportunitySpec, optionGeometry, optionMatrixInput, optionRows, optionSpec, riskGeometry, riskInput, riskRows, riskSpec, runBasis,
  runGeometry, runRows, runSpec, runSpread, statusCounts, statusFromDegraded, statusGeometry, statusOrder, statusRows, statusSpec, strategicGrammar, tornadoGeometry,
  tornadoInput, tornadoRowsOf, tornadoSpec, type AuditIn, type CompareItemIn, type FanBranchIn, type HealthCompIn, type HealthDimIn, type RunIn, type StatusIn,
} from './strategic-charts-b82';

const AS_OF = '2026-10-19T09:00:00.000Z';
const ok = (spec: ChartSpec, rows: ReadonlyArray<Record<string, string | number | null>>) => expect(strategicGrammar(spec, rows)).toEqual([]);

/* ── fixtures (SYNTHETIC) ── */
const branch = (key: string, kind: string, v: [number | null, number | null, number | null], live = true): FanBranchIn => ({
  key, name: `${kind} branch`, kind, state: live ? 'open' : 'suspended', live, low: v[0], mid: v[1], high: v[2], n: v[1] === null ? 0 : 3, divergence: kind === 'baseline' ? null : `${kind} departs`,
  assumptions: { total: 2, critical: 1, invalidated: live ? 0 : 1 }, signpost: kind === 'baseline' ? null : `${kind} indicator`,
});
const FAN = [branch('b0', 'baseline', [2, 3, 4]), branch('b1', 'downside', [6, 9, 14]), branch('b2', 'stress', [null, null, null]), branch('b3', 'adversarial', [10, 12, 20], false)];

describe('§SC grammar — chartGrammar first, then the kind rules (additions only)', () => {
  it('every §SC kind is a library kind and names the definitions it requires', () => {
    for (const k of Object.keys(SC_REQUIRED_DEFINITIONS)) expect((CHART_KINDS as readonly string[]).includes(k)).toBe(true);
  });
  it('a missing definition, a causal tornado, a destiny fan, a composite column, a queue without its order are each refused', () => {
    const fan = fanSpec({ scenario: 'Corridor', measure: 'line-stop days', unit: 'days', asOf: AS_OF, branches: FAN, read: 'r' });
    expect(strategicGrammar({ ...fan, title: 'The most likely path of the corridor' }, fanRows(FAN))).toContain('language: a scenario fan shows plural futures — it names no single destiny (most likely)');
    expect(strategicGrammar({ ...fan, alternative: { ...fan.alternative, definitions: [] } }, fanRows(FAN))).toEqual(expect.arrayContaining(['definitions: a scenario fan defines its baseline', 'definitions: a scenario fan defines its signpost']));
    const t = tornadoSpec({ metric: 'total_cost', relative: 0.2, base: 100, model: 'supply-flow@1', runId: 'r', analysisId: 'a', analysedAt: AS_OF, robustness: 'ROBUST', timingShiftDays: null, items: [] });
    expect(strategicGrammar({ ...t, basis: 'what drives the cost' }, [])).toContain('language: a sensitivity tornado shows a model\'s response — it makes no causal claim (drives)');
    const m = optionMatrixInput({ options: [{ key: 'a', title: 'A', values: { c: 1 }, bases: {} }], criteria: [{ key: 'c', title: 'Cost', weight: 1, direction: 'min', unit: 'EUR' }] });
    const o = optionSpec({ pkg: 'P', version: 1, m, dissent: [], asOf: AS_OF, criteriaVersion: 1 });
    expect(strategicGrammar({ ...o, alternative: { ...o.alternative, columns: [...o.alternative.columns, { key: 'score', label: 'Score', kind: 'text' }] } }, optionRows(m))).toContain('composite: an option matrix carries no "score" column — no opaque composite rank');
    const q = alertSpec({ items: [], asOf: AS_OF, policy: 'policy v1' });
    expect(strategicGrammar({ ...q, alternative: { ...q.alternative, columns: ALERT_COLUMNS.filter((c) => c.key !== 'position') } }, [])).toContain('order: an alert queue states the declared order (a position column) — never a score alone');
    const c = coverageSpec({ pkg: 'P', asOf: AS_OF, standard: null, meets: null, disputed: 0 });
    expect(strategicGrammar({ ...c, title: 'Evidence quality' }, [])).toContain('language: an evidence coverage counts support and gaps — it never calls a count quality');
    const s = statusSpec({ title: 'Board', items: [], asOf: AS_OF, read: 'r', readLabel: 'l', sloWords: 'w' });
    expect(strategicGrammar({ ...s, legend: [{ key: 'x', label: 'x', dash: 'solid', marker: 'none' }] }, [])).toContain('identity: a status board marks every legend entry with a shape — never colour alone');
    const a = auditSpec({ events: [], asOf: AS_OF, obligations: [] });
    expect(strategicGrammar({ ...a, time: { ...a.time, basis: 'valid' } }, [])).toContain('time: an audit timeline is ordered by record or event time');
  });
  it('§CF\'s own grammar still runs first — a spec without a title or with a stray row key is refused', () => {
    const fan = fanSpec({ scenario: 'C', measure: 'm', unit: 'days', asOf: AS_OF, branches: FAN, read: 'r' });
    expect(strategicGrammar({ ...fan, title: '' }, fanRows(FAN))).toContain('title: missing — a chart states what it shows');
    expect(strategicGrammar(fan, [{ stray: 1 }])).toContain('rows: row 1 names "stray", which the alternative\'s columns do not declare');
  });
});

describe('ScenarioFan (CMP-062, VIZ-05)', () => {
  it('the spec passes with its rows; every kind has a distinct identity; the baseline is a reference', () => {
    ok(fanSpec({ scenario: 'Bab el-Mandeb over the next quarter', measure: 'line-stop days', unit: 'days', asOf: AS_OF, branches: FAN, read: 'twin.read' }), fanRows(FAN));
    const pairs = Object.values(FAN_KIND_IDENTITY).map((x) => `${x.dash}+${x.marker}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(fanIdentity('unheard-of')).toEqual(FAN_KIND_IDENTITY['user-defined']);
    expect(fanRows(FAN)[0]!['divergence']).toBe('the baseline — a reference, not a prediction');
    expect(fanRows(FAN)[3]!['state']).toBe('suspended — not live');
  });
  it('fans every quantified branch from the baseline\'s origin; an unquantified branch is listed, never drawn', () => {
    const g = fanGeometry(FAN);
    expect(g.empty).toBe(false); expect(g.unquantified).toEqual(['b2']); expect(g.branches.map((b) => b.key)).toEqual(['b0', 'b1', 'b3']);
    expect(g.origin).not.toBeNull();
    const b1 = g.branches.find((b) => b.key === 'b1')!;
    expect(b1.wedge).toMatch(/^M\S+ \S+ L/); expect(b1.line).not.toBeNull(); expect(b1.interval!.y0).toBeGreaterThan(b1.interval!.y1);
    expect(g.branches.find((b) => b.key === 'b3')!.live).toBe(false);
    expect(fanGeometry(FAN)).toEqual(g);
  });
  it('without a quantified baseline no origin is invented — the branches are intervals only', () => {
    const g = fanGeometry(FAN.filter((b) => b.kind !== 'baseline'));
    expect(g.origin).toBeNull(); expect(g.branches.every((b) => b.wedge === null && b.line === null)).toBe(true);
    expect(fanGeometry([branch('x', 'stress', [null, null, null])]).empty).toBe(true);
  });
  it('runSpread: lowest, median, highest of the finite values — n counted', () => {
    expect(runSpread([3, null, 1, 2])).toEqual({ low: 1, mid: 2, high: 3, n: 3 });
    expect(runSpread([4, 2])).toEqual({ low: 2, mid: 3, high: 4, n: 2 });
    expect(runSpread([null])).toEqual({ low: null, mid: null, high: null, n: 0 });
  });
});

const CMP: CompareItemIn[] = [
  { key: 'a', name: 'Baseline', scenario: 'S', kind: 'baseline', state: 'open', live: true, notCounted: null, probability: { low: 0.55, high: 0.65, method: 'elicited' }, consequenceClass: 'C2', indicator: 'fresh', assumptions: 2 },
  { key: 'b', name: 'Downside', scenario: 'S', kind: 'downside', state: 'suspended', live: false, notCounted: 'suspended', probability: { low: 0.3, high: 0.4, method: 'elicited' }, consequenceClass: null, indicator: null, assumptions: 1 },
  { key: 'c', name: 'Stress', scenario: 'S', kind: 'stress', state: 'open', live: true, notCounted: null, probability: null, consequenceClass: 'C4', indicator: 'stale', assumptions: 0 },
];
describe('ScenarioComparison (VIZ-06)', () => {
  it('one method: one scale; the spec passes; a branch without a probability is said', () => {
    expect(comparisonFrame(CMP)).toEqual({ methods: ['elicited'], problem: null });
    ok(comparisonSpec({ set: 'Set', asOf: AS_OF, items: CMP, purpose: 'the corridor decision' }), comparisonRows(CMP));
    const g = comparisonGeometry(CMP);
    expect(g.rows[0]!.interval!.x1).toBeGreaterThan(g.rows[0]!.interval!.x0); expect(g.rows[2]!.interval).toBeNull(); expect(g.rows[2]!.note).toMatch(/probability not set/);
    expect(comparisonRows(CMP)[1]!['counted']).toBe('not counted — suspended');
  });
  it('different methods are an unequal frame — refused with the reason; nothing is drawn on one scale', () => {
    const mixed = [...CMP.slice(0, 1), { ...CMP[1]!, probability: { low: 0.3, high: 0.4, method: 'model' } }];
    expect(comparisonFrame(mixed).problem).toMatch(/different methods \(elicited, model\)/);
    expect(comparisonGeometry(mixed, { drawProbability: false }).rows.every((r) => r.interval === null)).toBe(true);
    expect(comparisonSpec({ set: 'Set', asOf: AS_OF, items: mixed, purpose: null }).alternative.summary).toMatch(/not drawn on one scale/);
  });
});

describe('SensitivityTornado (VIZ-07)', () => {
  const factors = [
    { key: 'lead_time', kind: 'parameter', rank: 2, base_value: 10, low: { value: 8 }, high: { value: 12 }, delta_low: -20, delta_high: 40, swing: 60, nonlinear: true },
    { key: 'stock', kind: 'parameter', rank: 1, base_value: 100, low: { value: 80 }, high: { value: 120 }, delta_low: 90, delta_high: -70, swing: 160, outside_envelope: true },
  ];
  it('keeps the server\'s rank order and words; the spec passes; no causal word', () => {
    const items = tornadoInput(factors);
    expect(items.map((i) => i.key)).toEqual(['stock', 'lead_time']);
    const rows = tornadoRowsOf(items);
    expect(rows[0]!['response']).toBe('not stated · leaves the operating envelope'); expect(rows[1]!['response']).toBe('NONLINEAR');
    const spec = tornadoSpec({ metric: 'total_cost', relative: 0.2, base: '1000', model: 'supply-flow@1', runId: '01a0aaaa-bbbb', analysisId: '01a0cccc-dddd', analysedAt: AS_OF, robustness: 'ROBUST', timingShiftDays: 7, items });
    ok(spec, rows);
    expect(spec.title).toMatch(/^tornado chart of total cost/);
  });
  it('bars are drawn from the zero line on a symmetric scale; no swing draws no bar', () => {
    const g = tornadoGeometry(tornadoInput(factors));
    expect(g.bars[0]!.low!.x).toBe(g.zeroX); expect(g.bars[0]!.high!.x + g.bars[0]!.high!.w).toBeCloseTo(g.zeroX, 1);
    expect(g.xTicks.length).toBeGreaterThan(2);
    const flat = tornadoGeometry(tornadoInput([{ ...factors[0]!, delta_low: 0, delta_high: 0, swing: 0 }]));
    expect(flat.bars[0]!.low).toBeNull(); expect(tornadoGeometry([]).empty).toBe(true);
  });
});

describe('RiskMatrix (VIZ-10) and OpportunityPortfolio (VIZ-11)', () => {
  const reg = [
    { exposure_id: 'r1', title: 'Corridor closure', category_key: 'supply_chain', state: 'accepted', owner_principal_id: 'p1', gaps: [], residual: { residual_low: 100, residual_high: 400, unit: 'EUR k', threshold: 300, breach: true }, dims: { probability_high: 0.4 } },
    { exposure_id: 'r2', title: 'Port strike', category_key: 'supply_chain', state: 'contested', owner_principal_id: 'p2', gaps: [], residual: { residual_low: '10', residual_high: '50', unit: 'EUR k', threshold: null, breach: null }, dims: { plausibility: 'medium' } },
    { exposure_id: 'r3', title: 'FX', category_key: 'finance', state: 'identified', owner_principal_id: 'p3', gaps: ['assessment'], residual: null, dims: {} },
    { exposure_id: 'r4', title: 'Tariff', category_key: 'finance', state: 'accepted', owner_principal_id: 'p4', gaps: [], residual: { residual_low: 1, residual_high: 2, unit: 'USD m', threshold: null, breach: false }, dims: { probability_high: 0.1 } },
  ];
  it('reads the register verbatim; draws one unit; a plausibility sits in its own lane; nothing invented', () => {
    const items = riskInput(reg);
    expect(items[1]!.residualHigh).toBe(50); expect(items[1]!.plausibility).toBe('medium'); expect(items[2]!.residualHigh).toBeNull();
    const unit = dominantUnit(items.map((i) => i.unit)); expect(unit).toBe('EUR k');
    const rows = riskRows(items, unit);
    expect(rows.map((r) => r['drawn'])).toEqual(['drawn', 'drawn', 'not drawn — no accepted residual', 'not drawn — residual in USD m (another scale)']);
    ok(riskSpec({ items, unit, asOf: AS_OF, rule: null }), rows);
    const g = riskGeometry(items, unit);
    expect(g.marks.map((m) => m.key)).toEqual(['r1', 'r2']); expect(g.marks[0]!.breach).toBe(true);
    expect(g.marks[1]!.x).toBeLessThan(g.lane.x1); expect(g.marks[0]!.x).toBeGreaterThanOrEqual(g.prob.x0);
    expect(g.thresholds).toEqual([{ y: expect.any(Number), label: 'appetite (supply_chain) 300 EUR k' }]);
    expect(riskGeometry([], null).empty).toBe(true);
  });
  it('an opportunity from its record: the hypothesis value, the horizon in days, the declared cost', () => {
    const d = { exposure: { exposure_id: 'o1', title: 'Morocco sourcing', state: 'sponsored', owner_principal_id: 'p1', sponsor_principal_id: 'p2', accepted_version: 1 }, objectives: ['x'],
      versions: [{ version: 1, horizon: '90d', confidence: '0.6', options: [{ cost: 50 }, { cost: 25 }], evidence: [{}, {}], impact_low: 1, impact_high: 2, unit: 'EUR k' }],
      residuals: [], hypotheses: [{ value_low: 200, value_high: 500, unit: 'EUR k' }] };
    const o = opportunityFromDetail(d, (h) => (h === '90d' ? 90 : null));
    expect(o).toMatchObject({ valueLow: 200, valueHigh: 500, horizonDays: 90, confidence: '0.6', effort: '2 option(s), declared cost 75', evidence: 2, objectives: 1 });
    const none = opportunityFromDetail({ ...d, versions: [{ ...d.versions[0]!, horizon: 'soon', options: [] }], hypotheses: [] }, () => null);
    expect(none).toMatchObject({ valueLow: 1, valueHigh: 2, horizonDays: null, effort: '0 option(s), no cost declared' });
    const rows = opportunityRows([o, none], 'EUR k');
    ok(opportunitySpec({ items: [o, none], unit: 'EUR k', asOf: AS_OF, unread: 0 }), rows);
    const g = opportunityGeometry([o, none], 'EUR k');
    expect(g.marks.find((m) => m.key === 'o1')!.x).toBeGreaterThan(g.strip.x1);
  });
});

describe('HealthDecomposition (VIZ-12) and the health bridges', () => {
  const dim: HealthDimIn = { key: 'exec', label: 'Execution', value: 62, status: 'computed', coverage: 0.8, weight: 2, bands: [{ key: 'red', min: 0 }, { key: 'amber', min: 40 }, { key: 'green', min: 70 }], band: 'amber' };
  const comps: HealthCompIn[] = [
    { key: 'a', label: 'On-time delivery', weight: 1, score: 80, contribution: 40, confidence: 0.9, evidence: 2, freshness: 'fresh', state: 'ok', excluded: null, critical: true },
    { key: 'b', label: 'Capability coverage', weight: 1, score: 40, contribution: 20, confidence: null, evidence: 0, freshness: '9 d stale', state: 'stale', excluded: null, critical: false },
    { key: 'c', label: 'Budget', weight: 1, score: null, contribution: null, confidence: null, evidence: 0, freshness: 'missing', state: 'missing', excluded: 'no input', critical: false },
  ];
  it('the gauge becomes its decomposition: the segments, the residual "not attributed", the band floors; the spec passes', () => {
    const g = healthGeometry(dim, comps);
    expect(g.segments.map((s) => s.key)).toEqual(['a', 'b']); expect(g.residual!.value).toBe(2); expect(g.bands.map((b) => b.label)).toEqual(['amber ≥ 40', 'green ≥ 70']);
    ok(healthSpec({ dimension: dim, comps, formula: 'weighted-mean@1', rule: 'the mean of the covered components, weighted', at: AS_OF, asOf: AS_OF, snapshotId: '01a0ffff-0000' }), healthRows(comps));
    expect(healthRows(comps)[2]!['excluded']).toBe('no input');
  });
  it('an indeterminate dimension draws nothing', () => {
    expect(healthGeometry({ ...dim, status: 'indeterminate', value: null }, comps).empty).toBe(true);
    expect(healthSpec({ dimension: { ...dim, status: 'indeterminate', value: null }, comps, formula: 'f', rule: 'r', at: null, asOf: AS_OF, snapshotId: 's' }).alternative.summary).toMatch(/INDETERMINATE — no value is drawn/);
  });
  it('the waterfall\'s components are the weight shares of the valued dimensions; the bridge weights each change', () => {
    const w = healthWaterfallInput([dim, { ...dim, key: 'k2', label: 'Strategy', value: 50, weight: 1 }, { ...dim, key: 'k3', label: 'Risk', value: null, weight: 1, status: 'indeterminate' }], 58);
    expect(w.components.map((c) => c.delta)).toEqual([expect.closeTo(41.333, 2), expect.closeTo(16.667, 2), null]);
    const b = healthBridgeInput({ aggregate: { from: 50, to: 58 }, dimensions: [{ key: 'exec', label: 'Execution', delta: 6 }, { key: 'k2', label: 'Strategy', delta: 3 }] }, { exec: 2, k2: 1 });
    expect(b!.drivers.map((d) => d.delta)).toEqual([4, 1]);
    expect(healthBridgeInput({ aggregate: { from: null, to: 1 }, dimensions: [] }, {})).toBeNull();
  });
});

describe('§CF\'s Waterfall and VarianceBridge as §SC places them (health, review)', () => {
  const dims: HealthDimIn[] = [{ key: 'a', label: 'Execution', value: 60, status: 'computed', coverage: 1, weight: 1, bands: [], band: null }, { key: 'b', label: 'Strategy', value: 40, status: 'computed', coverage: 1, weight: 1, bands: [], band: null }];
  it('the score\'s waterfall and the comparison\'s bridge pass the grammar with the rows the components derive', () => {
    const w = healthWaterfallInput(dims, 52);
    ok(healthWaterfallSpec({ aggregate: 52, dims, formula: 'weighted-mean@1', at: AS_OF, asOf: AS_OF, snapshotId: 's' }), bridgeRows(bridgeSteps(w.start, w.components, w.end)));
    const b = healthBridgeInput({ aggregate: { from: 48, to: 52 }, dimensions: [{ key: 'a', label: 'Execution', delta: 6 }, { key: 'b', label: 'Strategy', delta: 0 }] }, { a: 1, b: 1 })!;
    ok(healthBridgeSpec({ from: 48, to: 52, baselineAt: AS_OF, snapshotAt: AS_OF, asOf: AS_OF, formula: 'f' }), bridgeRows(bridgeSteps({ label: 'baseline', value: b.from }, b.drivers, { label: 'actual', value: b.to }, 'Unattributed')));
    ok(outcomeBridgeSpec({ criterion: 'on-time share', unit: '%', target: 95, observed: 91, comparator: '>=', met: false, assessedAt: AS_OF, asOf: AS_OF, inferred: 'difference-in-differences, confidence 0.6' }),
      bridgeRows(bridgeSteps({ label: 'target', value: 95 }, [], { label: 'observed', value: 91 }, 'Unattributed')));
  });
});

describe('RunComparison (VIZ-27)', () => {
  const run = (key: string, kind: string, twin = 'twin@v14', control: string | null = 'ctl', v: number | null = 3): RunIn => ({ key, label: key, kind, twin, control, model: 'supply-flow@1', validity: 'valid', seed: null, use: 'decision-grade', measures: { lsd: v, cost: v === null ? null : v * 10 } });
  const M = [{ key: 'lsd', label: 'Line-stop days', unit: 'days' }, { key: 'cost', label: 'Total cost', unit: 'EUR' }];
  it('one basis: drawn per measure with the control as the reference; the spec passes', () => {
    const runs = [run('ctl', 'control', 'twin@v14', null, 5), run('i1', 'intervention', 'twin@v14', 'ctl', 2), { ...run('i2', 'intervention', 'twin@v14', 'ctl', 1), validity: 'invalidated' }];
    expect(runBasis(runs)).toEqual([]);
    ok(runSpec({ title: 'Runs side by side', runs, measures: M, asOf: AS_OF, read: 'simulation.read', readLabel: 'the runs' }), runRows(runs, M));
    const g = runGeometry(runs, M);
    expect(g.panels).toHaveLength(2); expect(g.panels[0]!.ref).not.toBeNull(); expect(g.panels[0]!.marks.map((m) => m.marker)).toEqual(['circle', 'square', 'cross']);
  });
  it('incompatible runs (another twin version, control or model) are named — never drawn side by side', () => {
    const p = runBasis([run('a', 'intervention', 'twin@v14', 'c1'), run('b', 'intervention', 'twin@v13', 'c2'), { ...run('c', 'intervention'), model: 'other@2' }]);
    expect(p).toEqual([expect.stringMatching(/different twin versions \(twin@v13, twin@v14\)/), expect.stringMatching(/different controls/), expect.stringMatching(/different models/)]);
    expect(runBasis([run('a', 'control')])).toEqual(['fewer than two runs — nothing to set side by side']);
  });
});

describe('TwinStateDiff (VIZ-28)', () => {
  const keys = diffInput([
    { key: 'stock.on_hand', change: 'changed', source: { kind: 'scenario', value: 40, unit: 'units' }, target: { kind: 'observed', value: 100, unit: 'units' } },
    { key: 'lead_time', change: 'changed', source: { kind: 'observed', value: 12, unit: 'days' }, target: { kind: 'observed', value: 10, unit: 'days' } },
    { key: 'route', change: 'changed', source: { kind: 'observed', value: 'cape', unit: null }, target: { kind: 'observed', value: 'suez', unit: null } },
    { key: 'new_key', change: 'added', source: { kind: 'synthetic', value: 3, unit: null }, target: null },
  ]);
  it('one panel per state class — observed and synthetic never mixed; each row its own scale; text values listed only', () => {
    const g = diffGeometry(keys);
    expect(g.panels.map((p) => p.cls)).toEqual(['observed', 'scenario', 'synthetic']); expect(g.skipped).toBe(1);
    expect(g.panels[2]!.rows[0]!.actualX).toBeNull(); expect(g.panels[2]!.rows[0]!.versionX).not.toBeNull();
    const rows = diffRows(keys);
    expect(rows[0]!['drawn']).toBe('in the scenario panel (actual is observed — the classes differ)'); expect(rows[2]!['drawn']).toBe('not drawn — not a number');
    ok(diffSpec({ twin: 'Regensburg line', branch: 'what-if', version: 'v3', asOf: AS_OF, verification: 'verified', items: keys }), rows);
  });
});

describe('OptionMatrix (VIZ-29)', () => {
  const m = optionMatrixInput({
    options: [{ key: 'reroute', title: 'Reroute via the Cape', values: { cost: '120', days: 4 }, bases: { cost: 'run 01a0' } }, { key: 'wait', title: 'Status quo', values: { cost: 80 }, bases: {} }],
    criteria: [{ key: 'cost', title: 'Cost', weight: '0.6', direction: 'min', unit: 'EUR k' }, { key: 'days', title: 'Line-stop days', weight: 0.4, direction: 'min', unit: 'days' }],
  });
  it('options × criteria on each criterion\'s own scale (right is better); a missing cell is marked; no composite column', () => {
    const g = optionGeometry(m);
    const c = g.marks.filter((x) => x.criterion === 'cost');
    expect(c.find((x) => x.option === 'wait')!.x).toBeGreaterThan(c.find((x) => x.option === 'reroute')!.x);
    expect(g.marks.find((x) => x.option === 'wait' && x.criterion === 'days')!.missing).toBe(true);
    const rows = optionRows(m);
    expect(rows.map((r) => r['value'])).toEqual(['120 EUR k', '4 days', '80 EUR k', 'not assessed']);
    const spec = optionSpec({ pkg: 'Regensburg routing', version: 1, m, dissent: [{ by: '01a0dddd-eeee', position: 'against', rationale: 'the Cape adds 12 days' }], asOf: AS_OF, criteriaVersion: 2 });
    ok(spec, rows);
    expect(spec.alternative.columns.map((x) => x.key)).not.toContain('rank');
  });
});

describe('EvidenceCoverage (VIZ-30)', () => {
  it('counts with their gaps; never quality; the omissions stated', () => {
    const parts = coverageInput({ evidence_coverage: { options: 3, simulated: 1, with_evidence: 2, citations: 10, standing: 8, runs: 2, decision_grade_runs: 1 } });
    const rows = coverageRows(parts);
    expect(rows[0]).toMatchObject({ part: 8, whole: 10, gap: 2 });
    const spec = coverageSpec({ pkg: 'P', asOf: AS_OF, standard: 'two_sources', meets: false, disputed: 2 });
    ok(spec, rows);
    expect(spec.alternative.definitions!.map((d) => d.term)).toEqual(['Source classes', 'Omissions']);
    const g = coverageGeometry(parts);
    expect(g.bars[0]!.partW).toBeLessThan(g.bars[0]!.wholeW);
  });
});

describe('StatusBoard (VIZ-33)', () => {
  const degraded = {
    contracts: [{ contract_id: 'c1', dependency: { kind: 'source', key: 'portwatch' }, signal: { state: 'degraded', since: AS_OF }, max_duration_seconds: 7200, owner: { principal_id: '01a0aaaa-0000', name: 'F. Aydın' },
      unavailable: [{ label: 'issue a forecast' }], mode: 'active', in_force: true, overdue: false, version: 2 }],
    undeclared: [{ dependency: { kind: 'audit', key: 'journal' }, signal: { state: 'unknown', since: null } }, { dependency: { kind: 'partition', key: 'edges_current' }, signal: { state: 'healthy', since: AS_OF } }],
  };
  it('from the governed degraded read: worst first, unknown counted as a state, never green-only', () => {
    const items = statusOrder(statusFromDegraded(degraded));
    expect(items.map((s) => s.state)).toEqual(['degraded', 'unknown', 'healthy']);
    expect(items[0]).toMatchObject({ slo: 'degraded mode at most 2 h (contract v2)', owner: 'F. Aydın', degraded: 'active — in force' });
    expect(statusCounts(items)).toEqual({ DEGRADED: 1, UNKNOWN: 1, HEALTHY: 1 });
    const rows = statusRows(items);
    expect(rows[1]).toMatchObject({ slo: 'none declared', degraded: 'no contract declared', owner: 'no owner on this read' });
    const spec = statusSpec({ title: 'Capabilities and their state', items, asOf: AS_OF, read: 'shell.degraded.read', readLabel: 'the degraded state', sloWords: 'the contract\'s maximum degraded duration' });
    ok(spec, rows);
    expect(spec.alternative.summary).toBe('3 capability(ies): 1 DEGRADED, 1 UNKNOWN, 1 HEALTHY — worst first.');
    expect(statusGeometry(items).rows.map((r) => r.marker)).toEqual(['triangle', 'diamond', 'circle']);
  });
  it('an unlisted state reads as itself, shaped as unknown', () => {
    const s: StatusIn = { key: 'x', capability: 'X', state: 'gap', slo: null, freshness: null, dependencies: null, degraded: null, owner: null };
    expect(statusRows([s])[0]!['state']).toBe('GAP'); expect(statusOrder([{ ...s, state: 'healthy', key: 'y' }, s])[0]!.key).toBe('x');
  });
});

describe('AlertQueue (VIZ-34)', () => {
  const items = [
    { item_id: 'i1', title: 'Corridor warning', signal_class: 'prediction.warning', state: 'open', owner_principal_id: 'p1', created_at: '2026-10-19T06:00:00Z', due_at: '2026-10-19T12:00:00Z', overdue: false, suppressed_until: null, acknowledged_at: null, evaluation: { dimensions: { consequence: 'C3' } } },
    { item_id: 'i2', title: 'Late outcome', signal_class: 'decision.outcome', state: 'acknowledged', owner_principal_id: null, created_at: '2026-10-18T09:00:00Z', due_at: '2026-10-19T08:00:00Z', overdue: true, suppressed_until: '2026-10-20T00:00:00Z', acknowledged_at: '2026-10-18T10:00:00Z', evaluation: null },
  ];
  it('keeps the server\'s order as the position; ages and due times against the read\'s instant; the spec passes', () => {
    const q = alertInput(items, (i) => `why ${i.item_id}`, AS_OF);
    expect(q.map((x) => [x.position, x.ageHours, x.dueInHours, x.severity])).toEqual([[1, 3, 3, 'C3'], [2, 24, -1, null]]);
    const rows = alertRows(q);
    expect(rows[1]).toMatchObject({ owner: 'no owner', ack: 'acknowledged', state: 'acknowledged — OVERDUE' });
    ok(alertSpec({ items: q, asOf: AS_OF, policy: 'policy v2' }), rows);
    const g = alertGeometry(q);
    expect(g.rows[0]!.ageX0).toBeLessThan(g.nowX); expect(g.rows[1]!.dueX).toBeLessThan(g.nowX); expect(g.rows[0]!.marker).toBe('diamond');
  });
});

describe('AuditTimeline (VIZ-35)', () => {
  const ev: AuditIn[] = [
    { key: 'p:1', seq: '1', at: '2026-10-19T08:00:00Z', actor: 'principal:a', action: 'audit.read', type: 'policy.decision', outcome: 'success', result: 'ok', partition: 'platform', hash: 'abcdef0123456789' },
    { key: 'p:2', seq: '2', at: '2026-10-19T08:30:00Z', actor: 'principal:b', action: 'x.y', type: 'policy.decision', outcome: 'denied', result: 'denied', partition: 'platform', hash: '0123456789abcdef' },
    { key: 'p:3', seq: '3', at: 'not a time', actor: 'principal:b', action: 'x.y', type: 'e', outcome: 'odd', result: 'r', partition: 'platform', hash: 'ffff' },
  ];
  it('on record time, by outcome lane, read-only; an event without a time is counted, not placed', () => {
    const g = auditGeometry(ev);
    expect(g.marks.map((m) => m.marker)).toEqual(['circle', 'cross']); expect(g.unplaced).toBe(1); expect(g.xTicks[0]!.label).toBe('08:00');
    const rows = auditRows(ev);
    expect(rows[0]!['hash']).toBe('abcdef0123…');
    ok(auditSpec({ events: ev, asOf: AS_OF, obligations: ['mask_secret_metadata'] }), rows);
    expect(auditGeometry([]).empty).toBe(true);
  });
});

describe('the small helpers', () => {
  it('numOf and isoOf never guess', () => {
    expect(numOf('12.5')).toBe(12.5); expect(numOf('x')).toBeNull(); expect(numOf(true)).toBeNull(); expect(numOf('')).toBeNull();
    expect(isoOf('2026-10-19', AS_OF)).toBe('2026-10-19T00:00:00.000Z'); expect(isoOf(null, AS_OF)).toBe(AS_OF);
  });
});
