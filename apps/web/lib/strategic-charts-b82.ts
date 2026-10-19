/**
 * CP-6 B82 §SC (F-P7-E-21: CMP-062 / VIZ-05 ScenarioFan, VIZ-06 ScenarioComparison, VIZ-07 SensitivityTornado, VIZ-10 RiskMatrix, VIZ-11
 * OpportunityPortfolio, VIZ-12 HealthDecomposition, VIZ-27 RunComparison, VIZ-28 TwinStateDiff, VIZ-29 OptionMatrix, VIZ-30 EvidenceCoverage,
 * VIZ-33 StatusBoard, VIZ-34 AlertQueue, VIZ-35 AuditTimeline) — THE SCENARIO, DECISION, RISK AND OPERATIONS CHARTS as PURE functions: the
 * adapters from each existing read to a chart's input (they only reshape — nothing is filled, smoothed or ranked; an unknown stays null and
 * reads "unknown"), the table alternative's columns and rows (derived from the same input the drawing uses), the geometry (hand-written SVG
 * numbers — DESIGN D3, no chart library), the specs each page declares, and THE §SC KIND RULES added to the grammar (§CF's chartGrammar
 * first, unchanged — a rule is added, never relaxed). Vitest covers them in node (strategic-charts-b82.test.ts).
 *
 *  - NO SINGLE DESTINY (VIZ-05): every branch is drawn with the same weight; the baseline is a reference, not a prediction; destiny words are
 *    refused by the grammar.
 *  - UNEQUAL FRAMES ARE REFUSED (VIZ-06, VIZ-27): probabilities set by different methods are not drawn on one scale; runs on different twin
 *    versions, controls or models are not drawn side by side — the reason is said and the rows stay in the table.
 *  - NO CAUSAL CLAIM (VIZ-07): a swing is the model's response to a one-at-a-time move; the grammar refuses a causal word on a tornado.
 *  - NEVER COLOUR ALONE (VIZ-10, VIZ-33): states are marker shapes and words; a status board counts its unknowns.
 *  - NO OPAQUE COMPOSITE (VIZ-29): an option matrix carries no rank or score column; each criterion keeps its own scale and weight.
 *  - COUNT IS NOT QUALITY (VIZ-30); ORDER IS THE DECLARED POLICY'S (VIZ-34); THE AUDIT IS READ-ONLY (VIZ-35); OBSERVED AND SYNTHETIC ARE
 *    NEVER MIXED IN ONE PANEL (VIZ-28); THE GAUGE BECOMES ITS DECOMPOSITION (VIZ-12).
 *
 * CONSTRUCTION only — nothing here is demonstrated or accepted; every value a page passes is the server's (on a demonstration, SYNTHETIC).
 */
import type { AlternativeColumn, AlternativeRow, ChartKind, ChartSource, ChartSpec, ChartTime, DashPattern, LegendEntry, MarkerShape } from './b82-seams';
import { BRIDGE_COLUMNS, causalWordsIn, chartGrammar, chartNumber, extentOf, linearScale, niceDomain, plotBox, spreadLabels, timeTicks, toInstant, type Box } from './chart-b82';

export const SC_RULES_VERSION = 'b82-sc-grammar-1';

type Row = Record<string, unknown>;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** A number from a read's cell (a numeric string included); anything else is null — never guessed. */
export const numOf = (v: unknown): number | null => { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const words = (v: string): string => v.replace(/_/g, ' ');
/** A label shortened with an ellipsis for the drawing (the full text is in the table alternative). */
export const clipText = (t: string, n: number): string => (Array.from(t).length > n ? `${Array.from(t).slice(0, n - 1).join('')}…` : t);
/** An instant as ISO (a DATE is its UTC midnight); a missing or unreadable one is the given fallback (the read's own instant). */
export const isoOf = (v: string | null | undefined, fallback: string): string => { const t = toInstant(v ?? null); return t === null ? fallback : new Date(t).toISOString(); };
const shortId = (v: string | null | undefined): string => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : (v ?? 'unknown'));

/* ═════════════════════════════ THE §SC KIND RULES (additions to §CF's chartGrammar) ═════════════════════════════ */

/** The definitions each §SC kind carries in its table alternative (matched as the start of a definition's term, case-insensitive). */
export const SC_REQUIRED_DEFINITIONS: Readonly<Partial<Record<ChartKind, readonly string[]>>> = {
  scenario_fan: ['baseline', 'divergence', 'signpost'],
  scenario_comparison: ['common basis'],
  sensitivity_tornado: ['model', 'baseline', 'range'],
  risk_matrix: ['likelihood', 'impact', 'appetite'],
  opportunity_portfolio: ['value', 'timing', 'confidence', 'effort'],
  health_decomposition: ['formula', 'weight', 'coverage'],
  run_comparison: ['same basis'],
  twin_state_diff: ['parent', 'state class'],
  option_matrix: ['weight', 'dissent'],
  evidence_coverage: ['source class', 'omission'],
  status_board: ['slo', 'freshness', 'degraded contract'],
  alert_queue: ['order'],
  audit_timeline: ['read-only'],
};
/** Words that single out one future as THE future (VIZ-05: "one highlighted destiny"). */
export const DESTINY_WORDS: readonly string[] = ['most likely', 'expected future', 'the future', 'will happen', 'destined', 'inevitable', 'forecast path', 'what will'];
const hasPhrase = (text: unknown, phrase: string): boolean => typeof text === 'string' && new RegExp(`(^|[^a-z])${phrase.replace(/ /g, '\\s+')}([^a-z]|$)`, 'i').test(text);
/**
 * THE §SC GRAMMAR: §CF's chartGrammar (which runs §0's assertGrammar first) unchanged, then these additions — each `<field>: <problem>`:
 *  definitions   each §SC kind defines the terms SC_REQUIRED_DEFINITIONS names (baseline, divergence, signpost for a fan; the common basis of a
 *                comparison; the model, baseline and range of a tornado; likelihood, impact and appetite of a risk matrix …)
 *  language      a tornado uses no causal word (VIZ-07); a fan names no single destiny (VIZ-05); an evidence coverage never calls a count
 *                "quality" (VIZ-30)
 *  composite     an option matrix's alternative has no rank, score or composite column (VIZ-29: no opaque composite rank)
 *  order         an alert queue's alternative carries the declared order (a `position` column) — never a score alone (VIZ-34)
 *  identity      a risk matrix and a status board mark every legend entry with a shape (never colour alone: VIZ-10, VIZ-33)
 *  time          an audit timeline is ordered by record or event time (VIZ-35)
 * Pure; never throws.
 */
export function strategicGrammar(spec: ChartSpec, rows?: ReadonlyArray<AlternativeRow>): string[] {
  const out = chartGrammar(spec, rows);
  try {
    const s = (spec ?? {}) as Partial<ChartSpec>;
    const kind = s.kind as ChartKind | undefined;
    if (kind === undefined) return out;
    const terms = (Array.isArray(s.alternative?.definitions) ? s.alternative.definitions : []).map((d) => String(d?.term ?? '').toLowerCase());
    for (const w of SC_REQUIRED_DEFINITIONS[kind] ?? []) if (!terms.some((t) => t.startsWith(w))) out.push(`definitions: a ${words(kind)} defines its ${w}`);
    const texts = [s.title, s.basis, s.alternative?.summary, s.uncertainty?.statement, ...(s.alternative?.definitions ?? []).map((d) => d?.definition)];
    if (kind === 'sensitivity_tornado') {
      const found = [...new Set(texts.flatMap((t) => causalWordsIn(t as string | undefined)))];
      if (found.length > 0) out.push(`language: a sensitivity tornado shows a model's response — it makes no causal claim (${found.join(', ')})`);
    }
    if (kind === 'scenario_fan') {
      const found = DESTINY_WORDS.filter((w) => [s.title, s.basis, s.alternative?.summary].some((t) => hasPhrase(t, w)));
      if (found.length > 0) out.push(`language: a scenario fan shows plural futures — it names no single destiny (${found.join(', ')})`);
    }
    if (kind === 'evidence_coverage' && [s.title, s.basis, s.alternative?.summary].some((t) => hasPhrase(t, 'quality'))) out.push('language: an evidence coverage counts support and gaps — it never calls a count quality');
    const cols = Array.isArray(s.alternative?.columns) ? s.alternative.columns.map((c) => String(c?.key ?? '').toLowerCase()) : [];
    if (kind === 'option_matrix') for (const k of cols.filter((c) => ['rank', 'score', 'composite', 'overall'].includes(c))) out.push(`composite: an option matrix carries no "${k}" column — no opaque composite rank`);
    if (kind === 'alert_queue' && !cols.includes('position')) out.push('order: an alert queue states the declared order (a position column) — never a score alone');
    if ((kind === 'risk_matrix' || kind === 'status_board') && Array.isArray(s.legend) && s.legend.some((e) => e?.marker === 'none')) out.push(`identity: a ${words(kind)} marks every legend entry with a shape — never colour alone`);
    if (kind === 'audit_timeline' && s.time !== undefined && !['record', 'event'].includes(String(s.time?.basis))) out.push('time: an audit timeline is ordered by record or event time');
  } catch { out.push('spec: unreadable'); }
  return out;
}

/** The CSV label rides the page (lib/chart-specs-b82 readExport); a spec's sources are named reads or cited versions. */
const READ = (read: string, label: string): ChartSource[] => [{ read, label }];
const cutoffOf = (v: string | null | undefined, asOf: string, why: string): ChartTime['cutoff'] => {
  const t = toInstant(v ?? null); const a = toInstant(asOf);
  if (t === null) return { absent: why };
  return a !== null && t > a ? asOf : new Date(t).toISOString();
};

/* ═════════════════════════════ SCENARIO FAN (CMP-062, VIZ-05) ═════════════════════════════ */

export interface FanBranchIn {
  key: string; name: string; kind: string; state: string; live: boolean;
  /** the branch's quantified outcome as the read carries it (each null = not quantified) */ low: number | null; mid: number | null; high: number | null;
  /** how many records the outcome rests on (e.g. completed runs) */ n: number;
  divergence: string | null; assumptions: { total: number; critical: number; invalidated: number }; signpost: string | null;
}
/** Each scenario kind's identity: a dash pattern and a marker shape (distinct pairs — never colour, D5). */
export const FAN_KIND_IDENTITY: Readonly<Record<string, { dash: DashPattern; marker: MarkerShape }>> = {
  baseline: { dash: 'solid', marker: 'circle' }, upside: { dash: 'dashed', marker: 'triangle' }, downside: { dash: 'dotted', marker: 'square' },
  disruption: { dash: 'dash-dot', marker: 'diamond' }, stress: { dash: 'solid', marker: 'cross' }, adversarial: { dash: 'dashed', marker: 'cross' },
  counterfactual: { dash: 'dotted', marker: 'circle' }, 'user-defined': { dash: 'dash-dot', marker: 'triangle' },
};
export const fanIdentity = (kind: string): { dash: DashPattern; marker: MarkerShape } => FAN_KIND_IDENTITY[kind] ?? FAN_KIND_IDENTITY['user-defined']!;
export const FAN_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'branch', label: 'Branch', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'state' }, { key: 'state', label: 'State', kind: 'state' },
  { key: 'low', label: 'Lowest', kind: 'number', unit }, { key: 'mid', label: 'Median', kind: 'number', unit }, { key: 'high', label: 'Highest', kind: 'number', unit },
  { key: 'n', label: 'Records', kind: 'number', unit: 'count' }, { key: 'divergence', label: 'Divergence', kind: 'text' },
  { key: 'assumptions', label: 'Assumptions', kind: 'text' }, { key: 'signpost', label: 'Signpost', kind: 'text' },
];
export function fanRows(bs: readonly FanBranchIn[]): AlternativeRow[] {
  return bs.map((b) => ({
    branch: b.name, kind: b.kind, state: `${b.state}${b.live ? '' : ' — not live'}`, low: b.low, mid: b.mid, high: b.high, n: b.n,
    divergence: b.divergence ?? (b.kind === 'baseline' ? 'the baseline — a reference, not a prediction' : 'not stated'),
    assumptions: `${b.assumptions.total} linked (${b.assumptions.critical} critical, ${b.assumptions.invalidated} invalidated)`,
    signpost: b.signpost ?? 'none declared',
  }));
}
export interface FanGeometry {
  box: Box; empty: boolean; origin: { x: number; y: number } | null; yTicks: Array<{ y: number; label: string }>;
  branches: Array<{ key: string; row: number; dash: DashPattern; marker: MarkerShape; live: boolean; wedge: string | null; line: string | null; interval: { x: number; y0: number; y1: number } | null; end: { x: number; y: number } | null; label: { x: number; y: number } | null }>;
  unquantified: string[];
}
/**
 * The fan: from the ORIGIN (the as-of instant at the baseline's median, when the baseline is quantified) each quantified branch fans to its
 * interval at the horizon — a wedge to its lowest–highest, a line to its median — each branch with the same stroke weight (no destiny); the
 * ends spread so their intervals sit side by side; a branch with no quantified outcome is not drawn and is listed (`unquantified`).
 */
export function fanGeometry(bs: readonly FanBranchIn[], o: { box?: Box } = {}): FanGeometry {
  const box = o.box ?? plotBox(640, 300, { left: 64, right: 170, top: 16, bottom: 36 });
  const quantified = bs.map((b, row) => ({ b, row })).filter(({ b }) => finite(b.mid) || (finite(b.low) && finite(b.high)));
  const unquantified = bs.filter((b) => !(finite(b.mid) || (finite(b.low) && finite(b.high)))).map((b) => b.key);
  if (quantified.length === 0) return { box, empty: true, origin: null, yTicks: [], branches: [], unquantified };
  const base = quantified.find(({ b }) => b.kind === 'baseline' && finite(b.mid))?.b ?? null;
  const e = extentOf(quantified.flatMap(({ b }) => [b.low, b.mid, b.high]))!;
  const d = niceDomain(e[0], e[1], { includeZero: true });
  const y = linearScale([d.min, d.max], [box.top + box.innerHeight, box.top]);
  const x0 = box.left + 8; const xH = box.left + box.innerWidth;
  const origin = base === null ? null : { x: x0, y: r2(y(base.mid as number)) };
  const k = quantified.length;
  const ends = quantified.map(({ b, row }, i) => {
    const xe = r2(xH - 14 * (k - 1 - i));
    const lo = finite(b.low) ? b.low : finite(b.mid) ? b.mid : null; const hi = finite(b.high) ? b.high : finite(b.mid) ? b.mid : null;
    const id = fanIdentity(b.kind);
    const wedge = origin !== null && lo !== null && hi !== null && lo !== hi ? `M${origin.x} ${origin.y} L${xe} ${r2(y(hi))} L${xe} ${r2(y(lo))} Z` : null;
    const line = origin !== null && finite(b.mid) ? `M${origin.x} ${origin.y} L${xe} ${r2(y(b.mid))}` : null;
    return { key: b.key, row, dash: id.dash, marker: id.marker, live: b.live, wedge, line,
      interval: lo !== null && hi !== null ? { x: xe, y0: r2(y(lo)), y1: r2(y(hi)) } : null,
      end: finite(b.mid) ? { x: xe, y: r2(y(b.mid)) } : null, yLabel: r2(y(finite(b.mid) ? b.mid : ((lo as number) + (hi as number)) / 2)) };
  });
  const spread = spreadLabels(ends.map((x) => ({ key: x.key, y: x.yLabel })), 14, box.top + 4, box.top + box.innerHeight);
  return {
    box, empty: false, origin, unquantified, yTicks: d.ticks.map((v) => ({ y: r2(y(v)), label: chartNumber(v) })),
    branches: ends.map(({ yLabel, ...x }) => ({ ...x, label: { x: r2(xH + 8), y: spread.get(x.key) ?? yLabel } })),
  };
}

/** Per branch of a scenario: the spread of its COMPLETED, VALID runs' measure (lowest – median – highest of N runs) — not a probability interval. */
export function runSpread(values: ReadonlyArray<number | null>): { low: number | null; mid: number | null; high: number | null; n: number } {
  const v = values.filter(finite).slice().sort((a, b) => a - b);
  if (v.length === 0) return { low: null, mid: null, high: null, n: 0 };
  const m = v.length % 2 === 1 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
  return { low: v[0]!, mid: m, high: v[v.length - 1]!, n: v.length };
}
export function fanSpec(a: { scenario: string; measure: string; unit: string; asOf: string; branches: readonly FanBranchIn[]; read: string }): ChartSpec {
  const kinds = [...new Set(a.branches.map((b) => b.kind))];
  const q = a.branches.filter((b) => finite(b.mid) || (finite(b.low) && finite(b.high))).length;
  return {
    kind: 'scenario_fan', title: `Branches of “${a.scenario}” fanned on ${a.measure}`,
    basis: `the spread of the completed, valid simulation runs bound to each branch (lowest, median, highest) — SYNTHETIC model output on declared states, not observations and not probabilities`,
    time: { basis: 'horizon', cutoff: { absent: 'each run states its own knowledge cutoff (the run\'s page)' }, asOf: a.asOf },
    units: [{ measure: a.measure, unit: a.unit }, { measure: 'records', unit: 'count' }], sources: READ(a.read, 'the scenario\'s anatomy and the runs on its branches'),
    uncertainty: { kind: 'range', statement: 'each branch shows the lowest to highest of its runs — the spread of the runs, not a probability; a branch with no run is not quantified and is said so' },
    legend: kinds.map((k) => ({ key: k, label: words(k), ...fanIdentity(k), directLabel: true })),
    alternative: {
      summary: `${a.branches.length} branch(es) of the scenario, ${q} quantified by runs; every branch is drawn with the same weight — none is singled out.`,
      columns: FAN_COLUMNS(a.unit),
      definitions: [
        { term: 'Baseline', definition: 'the reference branch the others diverge from — a reference, not a prediction' },
        { term: 'Divergence', definition: 'how the branch departs from the baseline, as its owner stated it' },
        { term: 'Signpost', definition: 'the indicator that tells the branch is unfolding (its threshold and freshness are on the scenario\'s page)' },
        { term: 'Not live', definition: 'a suspended or closed branch — shown, never counted' },
      ],
    },
  };
}

/* ═════════════════════════════ SCENARIO COMPARISON (VIZ-06) ═════════════════════════════ */

export interface CompareItemIn {
  key: string; name: string; scenario: string; kind: string; state: string; live: boolean; notCounted: string | null;
  probability: { low: number | null; high: number | null; method: string | null } | null; consequenceClass: string | null; indicator: string | null; assumptions: number;
}
/** The common frame: probabilities set by DIFFERENT METHODS are not drawn on one scale (the unequal frame refused, with the reason). */
export function comparisonFrame(items: readonly CompareItemIn[]): { methods: string[]; problem: string | null } {
  const methods = [...new Set(items.filter((i) => i.probability !== null && (finite(i.probability.low) || finite(i.probability.high))).map((i) => i.probability!.method ?? 'method unstated'))].sort();
  return { methods, problem: methods.length > 1 ? `the governed probabilities were set by different methods (${methods.join(', ')}) — they are not drawn on one scale; each stays in the table` : null };
}
export const COMPARISON_COLUMNS: AlternativeColumn[] = [
  { key: 'branch', label: 'Branch', kind: 'text' }, { key: 'scenario', label: 'Scenario', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'state' },
  { key: 'counted', label: 'Counted', kind: 'state' }, { key: 'p_low', label: 'Probability low', kind: 'number', unit: 'probability (0–1)' },
  { key: 'p_high', label: 'Probability high', kind: 'number', unit: 'probability (0–1)' }, { key: 'method', label: 'Method', kind: 'text' },
  { key: 'consequence', label: 'Consequence class', kind: 'state' }, { key: 'indicator', label: 'Indicator', kind: 'text' },
  { key: 'assumptions', label: 'Assumptions', kind: 'number', unit: 'count' },
];
export function comparisonRows(items: readonly CompareItemIn[]): AlternativeRow[] {
  return items.map((i) => ({
    branch: i.name, scenario: i.scenario, kind: i.kind, counted: i.live ? 'counted (live)' : `not counted — ${i.notCounted ?? i.state}`,
    p_low: i.probability?.low ?? null, p_high: i.probability?.high ?? null, method: i.probability === null ? 'not set' : (i.probability.method ?? 'method unstated'),
    consequence: i.consequenceClass ?? 'not stated', indicator: i.indicator ?? 'none', assumptions: i.assumptions,
  }));
}
export function comparisonGeometry(items: readonly CompareItemIn[], o: { box?: Box; drawProbability?: boolean } = {}): {
  box: Box; rows: Array<{ key: string; row: number; y: number; live: boolean; interval: { x0: number; x1: number } | null; note: string }>; xTicks: Array<{ x: number; label: string }>;
} {
  const rowH = 30; const box = o.box ?? plotBox(640, 40 + items.length * rowH, { left: 170, right: 110, top: 10, bottom: 30 });
  const x = linearScale([0, 1], [box.left, box.left + box.innerWidth]);
  const draw = o.drawProbability !== false;
  return {
    box, xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => ({ x: r2(x(v)), label: chartNumber(v) })),
    rows: items.map((i, row) => {
      const lo = i.probability?.low ?? null; const hi = i.probability?.high ?? null;
      const has = draw && (finite(lo) || finite(hi));
      return { key: i.key, row, y: r2(box.top + rowH * (row + 0.5)), live: i.live,
        interval: has ? { x0: r2(x(finite(lo) ? lo : (hi as number))), x1: r2(x(finite(hi) ? hi : (lo as number))) } : null,
        note: `${i.consequenceClass ?? 'class not stated'}${i.live ? '' : ' · not counted'}${has ? '' : i.probability === null ? ' · probability not set' : ' · probability not drawn'}` };
    }),
  };
}
export function comparisonSpec(a: { set: string; asOf: string; items: readonly CompareItemIn[]; purpose: string | null }): ChartSpec {
  const f = comparisonFrame(a.items);
  const set = a.items.filter((i) => i.probability !== null).length;
  return {
    kind: 'scenario_comparison', title: `The branches of “${a.set}” on one probability scale`,
    basis: 'each branch\'s governed probability as set (low to high), its consequence class, whether it is counted, its indicator — the set\'s own read',
    time: { basis: 'none', cutoff: { absent: 'the governed probabilities as they stand at the read' }, asOf: a.asOf },
    units: [{ measure: 'governed probability', unit: 'probability (0–1)' }, { measure: 'assumptions', unit: 'count' }], sources: READ('prediction.scenario.read · /scenarios/sets/:id/compare', 'the set\'s branches side by side'),
    uncertainty: { kind: 'interval', statement: 'each probability is the interval its owner set (low to high) by the method named; an interval of a judgement, not a measured frequency', level: 0.8 },
    legend: [{ key: 'live', label: 'counted branch (solid)', dash: 'solid', marker: 'square' }, { key: 'not-live', label: 'not counted (dotted)', dash: 'dotted', marker: 'cross' }],
    alternative: {
      summary: `${a.items.length} branch(es); ${set} carry a governed probability${f.problem === null ? '' : ` — ${f.problem}`}.`,
      columns: COMPARISON_COLUMNS,
      definitions: [
        { term: 'Common basis', definition: `one set, one read, one scale (0–1)${a.purpose === null ? '' : `; the objective the set serves: ${a.purpose}`}; probabilities set by different methods are not drawn together` },
        { term: 'Counted', definition: 'a live branch counts toward plurality; a suspended or closed one is listed and not counted' },
      ],
    },
  };
}

/* ═════════════════════════════ SENSITIVITY TORNADO (VIZ-07) ═════════════════════════════ */

export interface TornadoIn {
  key: string; rank: number; kind: string; base: string; lowValue: string; highValue: string; lowDelta: number | null; highDelta: number | null;
  swing: number | null; nonlinear: boolean | null; outsideEnvelope: boolean;
}
/** The recorded factors in the server's rank order, verbatim (nothing ranked here). */
export function tornadoInput(factors: ReadonlyArray<{ key: string; kind: string; rank: number; base_value: unknown; low: { value: unknown }; high: { value: unknown }; delta_low: unknown; delta_high: unknown; swing: unknown; nonlinear?: boolean; outside_envelope?: boolean }>): TornadoIn[] {
  return [...factors].sort((a, b) => a.rank - b.rank).map((f) => ({
    key: f.key, rank: f.rank, kind: f.kind, base: String(f.base_value), lowValue: String(f.low.value), highValue: String(f.high.value),
    lowDelta: numOf(f.delta_low), highDelta: numOf(f.delta_high), swing: numOf(f.swing), nonlinear: f.nonlinear ?? null, outsideEnvelope: f.outside_envelope === true,
  }));
}
export const TORNADO_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'rank', label: 'Rank', kind: 'number', unit: 'rank' }, { key: 'factor', label: 'Factor', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'state' },
  { key: 'base', label: 'Base setting', kind: 'text' }, { key: 'low', label: 'Low setting', kind: 'text' }, { key: 'low_delta', label: 'Metric move at low', kind: 'number', unit },
  { key: 'high', label: 'High setting', kind: 'text' }, { key: 'high_delta', label: 'Metric move at high', kind: 'number', unit }, { key: 'swing', label: 'Swing', kind: 'number', unit },
  { key: 'response', label: 'Response shape', kind: 'text' },
];
export function tornadoRowsOf(items: readonly TornadoIn[]): AlternativeRow[] {
  return items.map((t) => ({
    rank: t.rank, factor: t.key, kind: t.kind, base: t.base, low: t.lowValue, low_delta: t.lowDelta, high: t.highValue, high_delta: t.highDelta, swing: t.swing,
    response: `${t.nonlinear === null ? 'not stated' : t.nonlinear ? 'NONLINEAR' : 'linear'}${t.outsideEnvelope ? ' · leaves the operating envelope' : ''}`,
  }));
}
export function tornadoGeometry(items: readonly TornadoIn[], o: { box?: Box } = {}): {
  box: Box; empty: boolean; zeroX: number; bars: Array<{ key: string; row: number; y: number; h: number; low: { x: number; w: number } | null; high: { x: number; w: number } | null }>; xTicks: Array<{ x: number; label: string }>;
} {
  const rowH = 26; const box = o.box ?? plotBox(640, 36 + Math.max(1, items.length) * rowH, { left: 170, right: 24, top: 8, bottom: 28 });
  const m = Math.max(0, ...items.flatMap((t) => [Math.abs(t.lowDelta ?? 0), Math.abs(t.highDelta ?? 0)]));
  if (items.length === 0 || m === 0) return { box, empty: items.length === 0, zeroX: r2(box.left + box.innerWidth / 2), bars: items.map((t, row) => ({ key: t.key, row, y: r2(box.top + rowH * row + 4), h: rowH - 8, low: null, high: null })), xTicks: [] };
  const d = niceDomain(-m, m, { includeZero: true });
  const lim = Math.max(Math.abs(d.min), Math.abs(d.max));
  const x = linearScale([-lim, lim], [box.left, box.left + box.innerWidth]);
  const seg = (v: number | null) => (v === null ? null : { x: r2(Math.min(x(0), x(v))), w: r2(Math.max(1, Math.abs(x(v) - x(0)))) });
  const ticks = niceDomain(-lim, lim).ticks;
  return {
    box, empty: false, zeroX: r2(x(0)), xTicks: ticks.map((v) => ({ x: r2(x(v)), label: chartNumber(v) })),
    bars: items.map((t, row) => ({ key: t.key, row, y: r2(box.top + rowH * row + 4), h: rowH - 8, low: seg(t.lowDelta), high: seg(t.highDelta) })),
  };
}
const METRIC_UNIT: Readonly<Record<string, string>> = { total_cost: 'EUR', line_stop_days: 'days', days_below_safety_stock: 'days' };
export const metricUnit = (metric: string): string => METRIC_UNIT[metric] ?? 'as the metric states';
export function tornadoSpec(a: { metric: string; relative: unknown; base: unknown; model: string; runId: string; analysisId: string; analysedAt: string; robustness: string; timingShiftDays: number | null; items: readonly TornadoIn[] }): ChartSpec {
  const unit = metricUnit(a.metric); const pct = numOf(a.relative);
  const step = pct === null ? 'the recorded step' : `±${chartNumber(pct * 100)} %`;
  return {
    kind: 'sensitivity_tornado', title: `tornado chart of ${words(a.metric)} — each factor moved ${step}`,
    basis: `the model's response (${a.model}) to moving one factor at a time from the run's stored contract — SYNTHETIC model output, recorded by the analysis`,
    time: { basis: 'none', cutoff: cutoffOf(a.analysedAt, a.analysedAt, 'the analysis records no instant'), asOf: a.analysedAt },
    units: [{ measure: `move in ${words(a.metric)}`, unit }, { measure: 'rank', unit: 'rank' }],
    sources: [{ read: `simulation.read · /impact/runs/${shortId(a.runId)}/read`, label: `the run's sensitivity analysis ${shortId(a.analysisId)}` }],
    uncertainty: { kind: 'not_quantified', statement: `one-at-a-time moves on one model; robustness across seeds: ${a.robustness}` },
    legend: [{ key: 'low', label: 'factor moved down (filled bar)', dash: 'solid', marker: 'square' }, { key: 'high', label: 'factor moved up (open, dashed bar)', dash: 'dashed', marker: 'square' }],
    alternative: {
      summary: a.items.length === 0 ? 'The analysis recorded no factor.' : `${a.items.length} factor(s) in the server's rank order; the widest swing is ${a.items[0]!.key} (${chartNumber(a.items[0]!.swing)} ${unit}).`,
      columns: TORNADO_COLUMNS(unit),
      definitions: [
        { term: 'Model', definition: `${a.model}, run ${shortId(a.runId)}; a swing is this model's response to a one-at-a-time move — it says nothing about the world beyond the model` },
        { term: 'Baseline', definition: `the run's ${words(a.metric)} at the base settings: ${String(a.base)} ${unit}; the vertical line is no move` },
        { term: 'Range', definition: `each parameter moved ${step} from its base${a.timingShiftDays ? `; each dated intervention moved ±${a.timingShiftDays} day(s)` : ''}` },
      ],
    },
  };
}

/* ═════════════════════════════ RISK MATRIX (VIZ-10) ═════════════════════════════ */

export interface RiskIn {
  key: string; title: string; category: string; state: string; probabilityHigh: number | null; plausibility: 'low' | 'medium' | 'high' | null;
  residualLow: number | null; residualHigh: number | null; unit: string | null; threshold: number | null; breach: boolean | null; owner: string | null; gaps: number;
}
/** From the register's rows (their accepted residual and their dimensions), verbatim. */
export function riskInput(rows: ReadonlyArray<{ exposure_id: string; title: string | null; category_key: string; state: string; owner_principal_id: string; gaps: string[]; residual?: object | null; dims?: object | null }>): RiskIn[] {
  return rows.map((r) => {
    const res = (r.residual ?? null) as Row | null; const dims = (r.dims ?? {}) as Row;
    const pl = String(dims['plausibility'] ?? '');
    return {
      key: r.exposure_id, title: r.title ?? shortId(r.exposure_id), category: r.category_key, state: r.state,
      probabilityHigh: numOf(dims['probability_high']), plausibility: pl === 'low' || pl === 'medium' || pl === 'high' ? pl : null,
      residualLow: numOf(res?.['residual_low']), residualHigh: numOf(res?.['residual_high']), unit: res === null ? (typeof dims['unit'] === 'string' ? dims['unit'] : null) : String(res['unit'] ?? ''),
      threshold: numOf(res?.['threshold']), breach: typeof res?.['breach'] === 'boolean' ? res['breach'] : null, owner: r.owner_principal_id, gaps: r.gaps.length,
    };
  });
}
/** The unit drawn: the one most exposures carry a residual in (ties: alphabetical); the others are listed, not drawn on a foreign scale. */
export function dominantUnit(units: ReadonlyArray<string | null>): string | null {
  const c = new Map<string, number>();
  for (const u of units) if (typeof u === 'string' && u !== '') c.set(u, (c.get(u) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}
export const RISK_STATE_IDENTITY: Readonly<Record<string, { dash: DashPattern; marker: MarkerShape }>> = {
  accepted: { dash: 'solid', marker: 'circle' }, assessed: { dash: 'dashed', marker: 'square' }, contested: { dash: 'dotted', marker: 'triangle' },
};
export const riskIdentity = (state: string): { dash: DashPattern; marker: MarkerShape } => RISK_STATE_IDENTITY[state] ?? { dash: 'dash-dot', marker: 'diamond' };
export const RISK_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'exposure', label: 'Exposure', kind: 'text' }, { key: 'category', label: 'Category', kind: 'text' }, { key: 'state', label: 'State', kind: 'state' },
  { key: 'likelihood', label: 'Likelihood as stated', kind: 'text' }, { key: 'p', label: 'Probability upper bound', kind: 'number', unit: 'probability (0–1)' },
  { key: 'low', label: 'Residual low', kind: 'number', unit }, { key: 'high', label: 'Residual high', kind: 'number', unit },
  { key: 'appetite', label: 'Appetite threshold', kind: 'number', unit }, { key: 'judgement', label: 'Appetite judgement', kind: 'state' },
  { key: 'owner', label: 'Owner', kind: 'text' }, { key: 'drawn', label: 'Drawn', kind: 'text' },
];
const likelihoodText = (r: RiskIn): string => (r.probabilityHigh !== null ? `probability up to ${chartNumber(r.probabilityHigh)}` : r.plausibility !== null ? `plausibility ${r.plausibility} (no probability stated)` : 'likelihood: no input');
export function riskRows(items: readonly RiskIn[], unit: string | null): AlternativeRow[] {
  return items.map((r) => {
    const same = unit !== null && r.unit === unit;
    return {
      exposure: r.title, category: r.category, state: r.state, likelihood: likelihoodText(r), p: r.probabilityHigh,
      low: same ? r.residualLow : null, high: same ? r.residualHigh : null, appetite: same ? r.threshold : null,
      judgement: r.breach === true ? 'OUTSIDE appetite' : r.breach === false ? 'within appetite' : 'not judged', owner: shortId(r.owner),
      drawn: r.residualHigh === null ? 'not drawn — no accepted residual' : !same ? `not drawn — residual in ${r.unit ?? 'no unit'} (another scale)` : r.probabilityHigh === null && r.plausibility === null ? 'not drawn — likelihood: no input' : 'drawn',
    };
  });
}
export const PLAUSIBILITY_SLOTS = ['low', 'medium', 'high'] as const;
export function riskGeometry(items: readonly RiskIn[], unit: string | null, o: { box?: Box } = {}): {
  box: Box; empty: boolean; lane: { x0: number; x1: number }; prob: { x0: number; x1: number };
  marks: Array<{ key: string; row: number; x: number; yLow: number; yHigh: number; dash: DashPattern; marker: MarkerShape; breach: boolean }>;
  thresholds: Array<{ y: number; label: string }>; xTicks: Array<{ x: number; label: string }>; slots: Array<{ x: number; label: string }>; yTicks: Array<{ y: number; label: string }>;
} {
  const box = o.box ?? plotBox(640, 320, { left: 70, right: 24, top: 16, bottom: 48 });
  const lane = { x0: box.left, x1: box.left + 120 }; const prob = { x0: box.left + 150, x1: box.left + box.innerWidth };
  const px = linearScale([0, 1], [prob.x0, prob.x1]);
  const slotX = (s: string) => lane.x0 + ((PLAUSIBILITY_SLOTS as readonly string[]).indexOf(s) + 0.5) * ((lane.x1 - lane.x0) / 3);
  const drawn = items.map((r, row) => ({ r, row })).filter(({ r }) => unit !== null && r.unit === unit && r.residualHigh !== null && (r.probabilityHigh !== null || r.plausibility !== null));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ x: r2(px(v)), label: chartNumber(v) }));
  const slots = PLAUSIBILITY_SLOTS.map((s) => ({ x: r2(slotX(s)), label: s }));
  if (drawn.length === 0) return { box, empty: true, lane, prob, marks: [], thresholds: [], xTicks, slots, yTicks: [] };
  const vals = drawn.flatMap(({ r }) => [r.residualLow, r.residualHigh, r.threshold]);
  const e = extentOf(vals)!; const d = niceDomain(e[0], e[1], { includeZero: true });
  const y = linearScale([d.min, d.max], [box.top + box.innerHeight, box.top]);
  const th = new Map<string, number>();
  for (const { r } of drawn) if (r.threshold !== null) { const k = `${r.category}|${r.threshold}`; if (!th.has(k)) th.set(k, r.threshold); }
  return {
    box, empty: false, lane, prob, xTicks, slots, yTicks: d.ticks.map((v) => ({ y: r2(y(v)), label: chartNumber(v) })),
    thresholds: [...th.entries()].map(([k, v]) => ({ y: r2(y(v)), label: `appetite (${k.split('|')[0]}) ${chartNumber(v)} ${unit}` })),
    marks: drawn.map(({ r, row }) => ({
      key: r.key, row, x: r2(r.probabilityHigh !== null ? px(Math.min(1, Math.max(0, r.probabilityHigh))) : slotX(r.plausibility as string)),
      yLow: r2(y(r.residualLow ?? r.residualHigh!)), yHigh: r2(y(r.residualHigh!)), ...riskIdentity(r.state), breach: r.breach === true,
    })),
  };
}
export function riskSpec(a: { items: readonly RiskIn[]; unit: string | null; asOf: string; rule: string | null }): ChartSpec {
  const unit = a.unit ?? 'no unit (nothing to draw)';
  const states = [...new Set(a.items.map((r) => r.state))];
  const outside = a.items.filter((r) => r.breach === true).length;
  return {
    kind: 'risk_matrix', title: 'Risks by likelihood and residual impact',
    basis: 'each risk\'s ACCEPTED assessment: the likelihood as its owner stated it (a probability upper bound, else a plausibility word) and the residual after its controls',
    time: { basis: 'none', cutoff: { absent: 'the accepted assessments as they stand at the read' }, asOf: a.asOf },
    units: [{ measure: 'likelihood (probability upper bound)', unit: 'probability (0–1)' }, { measure: 'residual impact', unit }],
    sources: READ('prediction.exposure.read · /exposures/list', 'the risk register'),
    uncertainty: { kind: 'range', statement: 'each risk is drawn as its residual range (low to high), never one number; a likelihood without a probability is placed by its plausibility word, apart from the probability scale' },
    legend: (states.length === 0 ? ['accepted'] : states).map((s) => ({ key: s, label: `${words(s)} (${riskIdentity(s).marker})`, ...riskIdentity(s), directLabel: true })),
    alternative: {
      summary: `${a.items.length} risk(s); ${a.items.filter((r) => r.residualHigh !== null).length} with an accepted residual; ${outside} OUTSIDE appetite (marked "!" on the drawing and in the Appetite judgement column).`,
      columns: RISK_COLUMNS(unit),
      definitions: [
        { term: 'Likelihood', definition: 'the upper bound of the probability the owner stated (0–1); a plausibility word is never turned into a probability — it sits in its own lane' },
        { term: 'Impact', definition: `the residual (low to high) in ${unit}; a risk in another unit is listed, not drawn on this scale` },
        { term: 'Appetite', definition: `the approved threshold of the risk's category (dashed lines); a residual above it is OUTSIDE appetite${a.rule ? `. ${a.rule}` : ''}` },
        { term: 'Owner', definition: 'the named risk owner who accepts the assessment' },
      ],
    },
  };
}

/* ═════════════════════════════ OPPORTUNITY PORTFOLIO (VIZ-11) ═════════════════════════════ */

export interface OpportunityIn {
  key: string; title: string; valueLow: number | null; valueHigh: number | null; unit: string | null; horizonDays: number | null; horizon: string | null;
  confidence: string | null; effort: string | null; objectives: number; owner: string | null; sponsor: string | null; evidence: number; state: string;
}
/** From one opportunity's detail: its accepted version (else the latest), the latest value hypothesis (else the residual), as recorded. */
export function opportunityFromDetail(d: {
  exposure: { exposure_id: string; title: string | null; state: string; owner_principal_id: string; sponsor_principal_id: string | null; accepted_version: number | null };
  objectives: string[]; versions: Array<{ version: number; horizon: string; confidence: unknown; options: Array<{ cost?: number | null }>; evidence: unknown[]; impact_low: unknown; impact_high: unknown; unit: string }>;
  residuals: Array<{ residual_low: unknown; residual_high: unknown; unit: string }>; hypotheses: Array<{ value_low: unknown; value_high: unknown; unit: string }>;
}, horizonDays: (h: string | null) => number | null): OpportunityIn {
  const x = d.exposure;
  const v = d.versions.find((y) => y.version === x.accepted_version) ?? d.versions[d.versions.length - 1] ?? null;
  const h = d.hypotheses[d.hypotheses.length - 1] ?? null; const res = d.residuals[d.residuals.length - 1] ?? null;
  const costs = (v?.options ?? []).map((o) => numOf(o.cost)).filter(finite);
  return {
    key: x.exposure_id, title: x.title ?? shortId(x.exposure_id),
    valueLow: h !== null ? numOf(h.value_low) : res !== null ? numOf(res.residual_low) : numOf(v?.impact_low), valueHigh: h !== null ? numOf(h.value_high) : res !== null ? numOf(res.residual_high) : numOf(v?.impact_high),
    unit: h?.unit ?? res?.unit ?? v?.unit ?? null, horizon: v?.horizon ?? null, horizonDays: horizonDays(v?.horizon ?? null),
    confidence: v === null || v.confidence === null || v.confidence === undefined ? null : String(v.confidence),
    effort: v === null ? null : costs.length === 0 ? `${v.options.length} option(s), no cost declared` : `${v.options.length} option(s), declared cost ${chartNumber(costs.reduce((a, b) => a + b, 0))}`,
    objectives: d.objectives.length, owner: x.owner_principal_id, sponsor: x.sponsor_principal_id, evidence: (v?.evidence ?? []).length, state: x.state,
  };
}
export const OPPORTUNITY_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'opportunity', label: 'Opportunity', kind: 'text' }, { key: 'low', label: 'Value low', kind: 'number', unit }, { key: 'high', label: 'Value high', kind: 'number', unit },
  { key: 'horizon', label: 'Timing (horizon)', kind: 'number', unit: 'days' }, { key: 'confidence', label: 'Confidence as stated', kind: 'text' }, { key: 'effort', label: 'Effort', kind: 'text' },
  { key: 'objectives', label: 'Objectives', kind: 'number', unit: 'count' }, { key: 'owner', label: 'Owner · sponsor', kind: 'text' },
  { key: 'evidence', label: 'Evidence cited', kind: 'number', unit: 'count' }, { key: 'state', label: 'State', kind: 'state' },
];
export function opportunityRows(items: readonly OpportunityIn[], unit: string | null): AlternativeRow[] {
  return items.map((o) => {
    const same = unit !== null && o.unit === unit;
    return {
      opportunity: same || o.valueHigh === null ? o.title : `${o.title} (value in ${o.unit ?? 'no unit'} — not drawn on this scale)`, low: same ? o.valueLow : null, high: same ? o.valueHigh : null,
      horizon: o.horizonDays, confidence: o.confidence ?? 'not stated', effort: o.effort ?? 'no input', objectives: o.objectives,
      owner: `${shortId(o.owner)}${o.sponsor === null ? ' · no sponsor' : ` · ${shortId(o.sponsor)}`}`, evidence: o.evidence, state: o.state,
    };
  });
}
export function opportunityGeometry(items: readonly OpportunityIn[], unit: string | null, o: { box?: Box } = {}): {
  box: Box; empty: boolean; strip: { x0: number; x1: number }; marks: Array<{ key: string; row: number; x: number; yLow: number; yHigh: number; label: string }>;
  xTicks: Array<{ x: number; label: string }>; yTicks: Array<{ y: number; label: string }>;
} {
  const box = o.box ?? plotBox(640, 300, { left: 70, right: 24, top: 16, bottom: 44 });
  const strip = { x0: box.left, x1: box.left + 70 };
  const drawn = items.map((x, row) => ({ x, row })).filter(({ x }) => unit !== null && x.unit === unit && (finite(x.valueLow) || finite(x.valueHigh)));
  if (drawn.length === 0) return { box, empty: true, strip, marks: [], xTicks: [], yTicks: [] };
  const hx = extentOf(drawn.map(({ x }) => x.horizonDays)); const dx = niceDomain(0, hx === null ? 90 : Math.max(1, hx[1]));
  const px = linearScale([dx.min, dx.max], [strip.x1 + 30, box.left + box.innerWidth]);
  const e = extentOf(drawn.flatMap(({ x }) => [x.valueLow, x.valueHigh]))!; const dy = niceDomain(e[0], e[1], { includeZero: true });
  const y = linearScale([dy.min, dy.max], [box.top + box.innerHeight, box.top]);
  return {
    box, empty: false, strip, xTicks: dx.ticks.map((v) => ({ x: r2(px(v)), label: `${chartNumber(v)} d` })), yTicks: dy.ticks.map((v) => ({ y: r2(y(v)), label: chartNumber(v) })),
    marks: drawn.map(({ x, row }) => {
      const lo = finite(x.valueLow) ? x.valueLow : (x.valueHigh as number); const hi = finite(x.valueHigh) ? x.valueHigh : lo;
      return { key: x.key, row, x: r2(x.horizonDays === null ? (strip.x0 + strip.x1) / 2 : px(x.horizonDays)), yLow: r2(y(lo)), yHigh: r2(y(hi)), label: `${clipText(x.title, 22)} · conf. ${x.confidence ?? 'n/s'}` };
    }),
  };
}
export function opportunitySpec(a: { items: readonly OpportunityIn[]; unit: string | null; asOf: string; unread: number }): ChartSpec {
  const unit = a.unit ?? 'no unit (nothing to draw)';
  return {
    kind: 'opportunity_portfolio', title: 'Opportunities by timing and value range',
    basis: 'each opportunity\'s latest value hypothesis (else its residual), the horizon and confidence of its accepted assessment, its options\' declared cost',
    time: { basis: 'horizon', cutoff: { absent: 'the assessments as they stand at the read' }, asOf: a.asOf },
    units: [{ measure: 'value', unit }, { measure: 'timing', unit: 'days' }, { measure: 'records', unit: 'count' }],
    sources: READ('prediction.exposure.read · /exposures/:id/get', 'each opportunity\'s record'),
    uncertainty: { kind: 'range', statement: 'each opportunity is its value range (low to high) — a labelled point and its range, never a bubble whose area is a value' },
    legend: [{ key: 'opp', label: 'opportunity: its value range at its horizon, labelled with its stated confidence', dash: 'solid', marker: 'triangle' }],
    alternative: {
      summary: `${a.items.length} opportunity(ies) read${a.unread > 0 ? `; ${a.unread} could not be read (said in the table's note)` : ''}; one without a horizon sits in the "timing: no input" strip.`,
      columns: OPPORTUNITY_COLUMNS(unit),
      definitions: [
        { term: 'Value', definition: `the latest value hypothesis (low to high) in ${unit}, else the residual; another unit is listed, not drawn` },
        { term: 'Timing', definition: 'the horizon of the accepted assessment in days; none stated: the left strip' },
        { term: 'Confidence', definition: 'as the assessment states it — never a size or a colour' },
        { term: 'Effort', definition: 'the options\' declared cost, summed as declared; "no cost declared" when none is' },
      ],
    },
  };
}

/* ═════════════════════════════ HEALTH DECOMPOSITION (VIZ-12) ═════════════════════════════ */

export interface HealthCompIn { key: string; label: string; weight: number; score: number | null; contribution: number | null; confidence: number | null; evidence: number; freshness: string; state: string; excluded: string | null; critical: boolean }
export interface HealthDimIn { key: string; label: string; value: number | null; status: string; coverage: number; weight: number; bands: ReadonlyArray<{ key: string; min: number }>; band: string | null }
export const HEALTH_COLUMNS: AlternativeColumn[] = [
  { key: 'component', label: 'Component', kind: 'text' }, { key: 'weight', label: 'Weight', kind: 'number', unit: 'weight (as defined)' },
  { key: 'score', label: 'Component score', kind: 'number', unit: 'score (0–100)' }, { key: 'contribution', label: 'Contribution', kind: 'number', unit: 'score (0–100)' },
  { key: 'confidence', label: 'Confidence', kind: 'number', unit: 'confidence (0–1)' }, { key: 'evidence', label: 'Evidence cited', kind: 'number', unit: 'count' },
  { key: 'freshness', label: 'Freshness', kind: 'text' }, { key: 'state', label: 'State', kind: 'state' }, { key: 'excluded', label: 'Why excluded', kind: 'text' },
];
export function healthRows(comps: readonly HealthCompIn[]): AlternativeRow[] {
  return comps.map((c) => ({ component: `${c.label}${c.critical ? ' (critical)' : ''}`, weight: c.weight, score: c.score, contribution: c.contribution, confidence: c.confidence,
    evidence: c.evidence, freshness: c.freshness, state: c.state, excluded: c.excluded ?? (c.score === null ? 'excluded — no reason recorded' : 'included') }));
}
/** The dimension's value as its components' contributions laid end to end on 0–100; what they do not add up to is a "not attributed" segment. */
export function healthGeometry(d: HealthDimIn, comps: readonly HealthCompIn[], o: { box?: Box } = {}): {
  box: Box; empty: boolean; segments: Array<{ key: string; row: number; x: number; w: number; label: string | null; alt: boolean }>; residual: { x: number; w: number; value: number } | null;
  valueX: number | null; bands: Array<{ x: number; label: string }>; xTicks: Array<{ x: number; label: string }>; barY: number; barH: number;
} {
  const box = o.box ?? plotBox(640, 96, { left: 16, right: 16, top: 22, bottom: 30 });
  const x = linearScale([0, 100], [box.left, box.left + box.innerWidth]);
  const xTicks = [0, 20, 40, 60, 80, 100].map((v) => ({ x: r2(x(v)), label: String(v) }));
  const bands = d.bands.filter((b) => b.min > 0 && b.min < 100).map((b) => ({ x: r2(x(b.min)), label: `${b.key} ≥ ${b.min}` }));
  const barY = box.top + 6; const barH = 24;
  if (d.status === 'indeterminate' || !finite(d.value)) return { box, empty: true, segments: [], residual: null, valueX: null, bands, xTicks, barY, barH };
  let acc = 0; const segments: Array<{ key: string; row: number; x: number; w: number; label: string | null; alt: boolean }> = [];
  comps.forEach((c, row) => {
    if (!finite(c.contribution) || c.contribution <= 0) return;
    const x0 = x(acc); const x1 = x(Math.min(100, acc + c.contribution)); acc += c.contribution;
    segments.push({ key: c.key, row, x: r2(x0), w: r2(Math.max(1, x1 - x0)), label: x1 - x0 > 60 ? clipText(c.label, Math.floor((x1 - x0) / 7)) : null, alt: segments.length % 2 === 1 });
  });
  const rest = Number((d.value - acc).toPrecision(10));
  const residual = Math.abs(rest) < 0.005 ? null : { x: r2(x(Math.min(acc, d.value))), w: r2(Math.max(1, Math.abs(x(d.value) - x(acc)))), value: rest };
  return { box, empty: false, segments, residual, valueX: r2(x(d.value)), bands, xTicks, barY, barH };
}
export function healthSpec(a: { dimension: HealthDimIn; comps: readonly HealthCompIn[]; formula: string; rule: string; at: string | null; asOf: string; snapshotId: string }): ChartSpec {
  const d = a.dimension; const included = a.comps.filter((c) => c.score !== null).length;
  return {
    kind: 'health_decomposition', title: `${d.label} — the score laid out as its components`,
    basis: `the server's decomposition of the dimension under the approved definition (${a.formula}): each component's contribution to the 0–100 value`,
    time: { basis: 'valid', cutoff: cutoffOf(a.at, a.asOf, 'the snapshot records no instant'), asOf: a.asOf },
    units: [{ measure: 'score', unit: 'score (0–100)' }, { measure: 'weight', unit: 'weight (as defined)' }, { measure: 'confidence', unit: 'confidence (0–1)' }, { measure: 'evidence', unit: 'count' }],
    sources: READ(`executive.health.read · /executive/health/snapshots/${shortId(a.snapshotId)}/get`, 'the health snapshot'),
    uncertainty: { kind: 'not_quantified', statement: `coverage ${chartNumber(d.coverage * 100)} % of the weight carries an input; ${a.comps.length - included} component(s) excluded (each with its reason); each component's confidence is in the table` },
    legend: [{ key: 'seg', label: 'a component\'s contribution (alternate segments hatched)', dash: 'solid', marker: 'square' }, { key: 'rest', label: 'not attributed to a component (dashed)', dash: 'dashed', marker: 'none' }],
    alternative: {
      summary: d.status === 'indeterminate' || !finite(d.value) ? `${d.label} is INDETERMINATE — no value is drawn; ${included} of ${a.comps.length} component(s) carry an input.`
        : `${d.label}: ${chartNumber(d.value)} of 100${d.band === null ? '' : ` (band ${d.band})`} from ${included} of ${a.comps.length} component(s); coverage ${chartNumber(d.coverage * 100)} %.`,
      columns: HEALTH_COLUMNS,
      definitions: [
        { term: 'Formula', definition: `${a.formula} — ${a.rule}` },
        { term: 'Weight', definition: 'each component\'s weight in the approved definition; a weight changes only by a new definition version two people approve' },
        { term: 'Coverage', definition: 'the share of the weight whose input is present and fresh; below the floor the value is indeterminate and nothing is drawn' },
        { term: 'Band floors', definition: d.bands.map((b) => `${b.key} ≥ ${b.min}`).join(', ') || 'none defined' },
      ],
    },
  };
}
/** §CF's Waterfall input for the score: from 0 through each dimension's value × its weight share (among the dimensions carrying a value) to the score; the residual is what this reading does not explain. */
export function healthWaterfallInput(dims: readonly HealthDimIn[], aggregate: number): { start: { label: string; value: number }; components: Array<{ key: string; label: string; delta: number | null; source: string }>; end: { label: string; value: number } } {
  const valued = dims.filter((d) => finite(d.value)); const total = valued.reduce((a, d) => a + d.weight, 0);
  return {
    start: { label: 'nothing (0)', value: 0 },
    components: dims.map((d) => ({ key: d.key, label: d.label, delta: finite(d.value) && total > 0 ? Number(((d.value * d.weight) / total).toPrecision(10)) : null, source: finite(d.value) ? `weight ${d.weight} of ${total}` : `no value (${d.status})` })),
    end: { label: 'the score', value: aggregate },
  };
}
/** §CF's VarianceBridge input for a comparison: the baseline's score, each dimension's change × its weight share, the snapshot's score. */
export function healthBridgeInput(cmp: { aggregate: { from: number | null; to: number | null }; dimensions: ReadonlyArray<{ key: string; label: string; delta: number | null }> }, weights: Readonly<Record<string, number>>): {
  drivers: Array<{ key: string; label: string; delta: number | null; source: string | null }>; from: number; to: number;
} | null {
  if (!finite(cmp.aggregate.from) || !finite(cmp.aggregate.to)) return null;
  const total = cmp.dimensions.reduce((a, d) => a + (weights[d.key] ?? 0), 0);
  return {
    from: cmp.aggregate.from, to: cmp.aggregate.to,
    drivers: cmp.dimensions.map((d) => ({ key: d.key, label: d.label, delta: finite(d.delta) && total > 0 && weights[d.key] !== undefined ? Number(((d.delta * weights[d.key]!) / total).toPrecision(10)) : null, source: weights[d.key] === undefined ? null : `weight ${weights[d.key]} of ${total}` })),
  };
}

/** §CF's Waterfall on /decisions/health: the score built from its dimensions (the reading's method declared; the residual always drawn). */
export function healthWaterfallSpec(a: { aggregate: number; dims: readonly HealthDimIn[]; formula: string; at: string | null; asOf: string; snapshotId: string }): ChartSpec {
  const valued = a.dims.filter((d) => finite(d.value)).length;
  return {
    kind: 'waterfall', title: `The score of ${chartNumber(a.aggregate)} built from its dimensions`,
    basis: `each dimension's value times its weight share among the dimensions that carry a value — a reading of the snapshot laid end to end; the server's formula (${a.formula}) is the score's, and the residual is what this reading does not explain`,
    time: { basis: 'valid', cutoff: cutoffOf(a.at, a.asOf, 'the snapshot records no instant'), asOf: a.asOf },
    units: [{ measure: 'score', unit: 'score (0–100)' }], sources: READ(`executive.health.read · /executive/health/snapshots/${shortId(a.snapshotId)}/get`, 'the health snapshot'),
    uncertainty: { kind: 'not_quantified', statement: 'the dimensions\' own coverage and confidence are in their decompositions below; a dimension without a value adds nothing and is said' },
    legend: [{ key: 'up', label: 'a dimension\'s share (open bar)', dash: 'solid', marker: 'square' }, { key: 'residual', label: 'residual (dashed) — not explained by this reading', dash: 'dashed', marker: 'none' }],
    alternative: {
      summary: `${valued} of ${a.dims.length} dimension(s) carry a value; from 0 to the score ${chartNumber(a.aggregate)}, the residual stated.`,
      columns: BRIDGE_COLUMNS('score (0–100)'),
      definitions: [{ term: 'Method', definition: 'value × weight ÷ the total weight of the dimensions with a value; the residual is the score minus their sum' }, { term: 'Residual', definition: 'shown always — "fully attributed" when it is zero' }],
    },
  };
}
/** §CF's VarianceBridge on /decisions/health: the baseline snapshot's score → this snapshot's, each dimension's change weighted, the unattributed delta drawn. */
export function healthBridgeSpec(a: { from: number; to: number; baselineAt: string | null; snapshotAt: string | null; asOf: string; formula: string }): ChartSpec {
  return {
    kind: 'variance_bridge', title: 'This snapshot against its baseline — the change by dimension',
    basis: `the comparison read of two snapshots of the same definition and formula (${a.formula}); each dimension's change times its weight share — the unattributed delta drawn as its own step`,
    time: { basis: 'valid', cutoff: cutoffOf(a.snapshotAt, a.asOf, 'the snapshot records no instant'), asOf: a.asOf },
    units: [{ measure: 'score', unit: 'score (0–100)' }], sources: READ('executive.health.read · /executive/health/compare', 'the comparison of the two snapshots'),
    uncertainty: { kind: 'not_quantified', statement: 'a withheld (indeterminate) side is never compared; a dimension without a change adds nothing and is said' },
    legend: [{ key: 'step', label: 'a dimension\'s weighted change (open: up, hatched: down)', dash: 'solid', marker: 'square' }, { key: 'unattributed', label: 'unattributed (dashed)', dash: 'dashed', marker: 'none' }],
    alternative: {
      summary: `From ${chartNumber(a.from)} (baseline${a.baselineAt === null ? '' : ` at ${a.baselineAt.slice(0, 10)}`}) to ${chartNumber(a.to)} (this snapshot${a.snapshotAt === null ? '' : ` at ${a.snapshotAt.slice(0, 10)}`}).`,
      columns: BRIDGE_COLUMNS('score (0–100)'),
      definitions: [{ term: 'Drivers', definition: 'each dimension\'s change in value × its weight ÷ the total weight — this reading, not the server\'s formula' }, { term: 'Unattributed', definition: 'actual − baseline − the drivers: shown, never hidden in a driver' }],
    },
  };
}
/** §CF's VarianceBridge on /decisions/review: an outcome criterion's committed target → its observed value; the decision's inferred
 *  contribution is measured against the counterfactual, NOT this target — so it is not drawn as a driver, and the whole gap is unattributed. */
export function outcomeBridgeSpec(a: { criterion: string; unit: string; target: number; observed: number; comparator: string; met: boolean; assessedAt: string; asOf: string; inferred: string }): ChartSpec {
  return {
    kind: 'variance_bridge', title: `${a.criterion}: the committed target against the observed outcome`,
    basis: 'the outcome assessment as recorded: the criterion\'s target (the commitment) and the observed value; the gap is unattributed on this read',
    time: { basis: 'record', cutoff: cutoffOf(a.assessedAt, a.asOf, 'the assessment records no instant'), asOf: a.asOf },
    units: [{ measure: a.criterion, unit: a.unit }], sources: READ('decision.read · /decisions/:id/review', 'the outcome assessment'),
    uncertainty: { kind: 'not_quantified', statement: 'the observed value as recorded; the inferred contribution carries its own method and confidence (not a driver here)' },
    legend: [{ key: 'gap', label: 'unattributed gap (dashed)', dash: 'dashed', marker: 'none' }, { key: 'level', label: 'target and observed (filled)', dash: 'solid', marker: 'square' }],
    alternative: {
      summary: `Target ${a.comparator} ${chartNumber(a.target)} ${a.unit}; observed ${chartNumber(a.observed)} ${a.unit} — ${a.met ? 'met' : 'NOT met'}.`,
      columns: BRIDGE_COLUMNS(a.unit),
      definitions: [{ term: 'Unattributed', definition: `the whole gap: the inferred contribution (${a.inferred}) is measured against the counterfactual, not this target, so it is not drawn as a driver` }],
    },
  };
}

/* ═════════════════════════════ RUN COMPARISON (VIZ-27) ═════════════════════════════ */

export interface RunMeasure { key: string; label: string; unit: string }
export interface RunIn {
  key: string; label: string; kind: string; twin: string | null; control: string | null; model: string | null; validity: string | null; seed: string | null; use: string | null;
  measures: Readonly<Record<string, number | null>>;
}
/** THE SAME BASIS (VIZ-27): one twin version, one control, one model — else the runs are not drawn side by side and the reason is said. */
export function runBasis(runs: readonly RunIn[]): string[] {
  const out: string[] = [];
  const distinct = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => x !== null))].sort();
  const twins = distinct(runs.map((r) => r.twin)); if (twins.length > 1) out.push(`the runs stand on different twin versions (${twins.join(', ')})`);
  const controls = distinct(runs.map((r) => r.control)); if (controls.length > 1) out.push(`the runs answer different controls (${controls.map(shortId).join(', ')})`);
  const models = distinct(runs.map((r) => r.model)); if (models.length > 1) out.push(`the runs use different models (${models.join(', ')})`);
  if (runs.length < 2) out.push('fewer than two runs — nothing to set side by side');
  return out;
}
export const RUN_COLUMNS = (measures: readonly RunMeasure[]): AlternativeColumn[] => [
  { key: 'run', label: 'Run', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'state' }, { key: 'basis', label: 'Twin and control', kind: 'text' },
  { key: 'model', label: 'Model', kind: 'text' }, { key: 'validity', label: 'Validity', kind: 'state' }, { key: 'seed', label: 'Seed', kind: 'text' }, { key: 'use', label: 'Decision use', kind: 'text' },
  ...measures.map((m) => ({ key: `m_${m.key}`, label: m.label, kind: 'number' as const, unit: m.unit })),
];
export function runRows(runs: readonly RunIn[], measures: readonly RunMeasure[]): AlternativeRow[] {
  return runs.map((r) => {
    const row: Record<string, string | number | null> = {
      run: r.label, kind: r.kind, basis: `${r.twin ?? 'twin not stated'} · control ${r.control === null ? (r.kind === 'control' ? 'itself' : 'not stated') : shortId(r.control)}`,
      model: r.model ?? 'not stated', validity: r.validity ?? 'not stated', seed: r.seed ?? 'deterministic or not stated', use: r.use ?? 'not stated',
    };
    for (const m of measures) row[`m_${m.key}`] = r.measures[m.key] ?? null;
    return row;
  });
}
/** The measures a twin comparison carries (the supply-flow totals). */
export const COMPARED_MEASURES: readonly RunMeasure[] = [
  { key: 'lsd', label: 'Line-stop days', unit: 'days' }, { key: 'dbs', label: 'Days below safety stock', unit: 'days' }, { key: 'cost', label: 'Total cost', unit: 'EUR' },
];
/** The runs of a comparison read (/simulations/compare) with their manifests from the run list — verbatim; a run missing from the list says "not stated". */
export function comparedRuns(compared: ReadonlyArray<{ run_id: string; run_kind: string; totals: { line_stop_days: unknown; days_below_safety_stock: unknown; cost: { total: unknown } } }>,
  runs: ReadonlyArray<{ run_id: string; twin_id: string; twin_version: number; control_run_id: string | null; model_ref: string; validity?: string; seed: number | null; decision_use?: { label: string } | null }>): RunIn[] {
  return compared.map((c) => {
    const r = runs.find((x) => x.run_id === c.run_id);
    return {
      key: c.run_id, label: `${c.run_id.slice(0, 8)}…${c.run_id.slice(-6)}`, kind: c.run_kind, twin: r === undefined ? null : `twin ${r.twin_id.slice(0, 8)}… v${r.twin_version}`, control: r?.control_run_id ?? null,
      model: r?.model_ref ?? null, validity: r?.validity ?? null, seed: r === undefined || r.seed === null ? null : String(r.seed), use: r?.decision_use?.label ?? null,
      measures: { lsd: numOf(c.totals.line_stop_days), dbs: numOf(c.totals.days_below_safety_stock), cost: numOf(c.totals.cost.total) },
    };
  });
}
export const runMarker = (r: Pick<RunIn, 'kind' | 'validity'>): MarkerShape => (r.validity === 'invalidated' ? 'cross' : r.kind === 'control' ? 'circle' : 'square');
export function runGeometry(runs: readonly RunIn[], measures: readonly RunMeasure[], o: { width?: number } = {}): {
  box: Box; panels: Array<{ key: string; label: string; y: number; ticks: Array<{ x: number; label: string }>; ref: number | null; marks: Array<{ key: string; row: number; x: number; y: number; marker: MarkerShape }> }>;
} {
  const panelH = 64; const box = plotBox(o.width ?? 640, Math.max(1, measures.length) * panelH + 12, { left: 170, right: 24, top: 8, bottom: 4 });
  return {
    box,
    panels: measures.map((m, i) => {
      const y0 = box.top + i * panelH + 30;
      const e = extentOf(runs.map((r) => r.measures[m.key] ?? null));
      const d = e === null ? niceDomain(0, 1) : niceDomain(e[0], e[1], { includeZero: true });
      const x = linearScale([d.min, d.max], [box.left, box.left + box.innerWidth]);
      const control = runs.find((r) => r.kind === 'control' && finite(r.measures[m.key]));
      const placed = runs.map((r, row) => ({ r, row })).filter(({ r }) => finite(r.measures[m.key]));
      return {
        key: m.key, label: `${m.label} (${m.unit})`, y: r2(y0), ticks: d.ticks.map((v) => ({ x: r2(x(v)), label: chartNumber(v) })),
        ref: control === undefined ? null : r2(x(control.measures[m.key] as number)),
        marks: placed.map(({ r, row }, k) => ({ key: r.key, row, x: r2(x(r.measures[m.key] as number)), y: r2(y0 - 6 - (k % 3) * 5), marker: runMarker(r) })),
      };
    }),
  };
}
export function runSpec(a: { title: string; runs: readonly RunIn[]; measures: readonly RunMeasure[]; asOf: string; read: string; readLabel: string }): ChartSpec {
  const problems = runBasis(a.runs);
  const units = a.measures.length === 0 ? [{ measure: 'runs', unit: 'count' }] : a.measures.map((m) => ({ measure: m.label, unit: m.unit }));
  return {
    kind: 'run_comparison', title: a.title,
    basis: 'each run\'s stored manifest (twin version, control, model, seed) and the totals the pinned model produced — SYNTHETIC model output, never observations',
    time: { basis: 'none', cutoff: { absent: 'each run states its own knowledge cutoff (the run\'s page)' }, asOf: a.asOf },
    units, sources: READ(a.read, a.readLabel),
    uncertainty: { kind: 'not_quantified', statement: 'each total is one run\'s output; the spread across seeds is the run\'s own sensitivity analysis (the impact page), not drawn here' },
    legend: [{ key: 'control', label: 'control run (circle)', dash: 'solid', marker: 'circle' }, { key: 'intervention', label: 'intervention run (square)', dash: 'dashed', marker: 'square' }, { key: 'invalidated', label: 'invalidated run (cross)', dash: 'dotted', marker: 'cross' }],
    alternative: {
      summary: `${a.runs.length} run(s)${problems.length === 0 ? ' on one basis' : ` — NOT drawn side by side: ${problems.join('; ')}`}.`,
      columns: RUN_COLUMNS(a.measures),
      definitions: [
        { term: 'Same basis', definition: 'one twin version, one control and one model; runs that differ in any of these are listed, never drawn side by side' },
        { term: 'Control', definition: 'the run without the interventions on the same initial state; its value is the dashed line in each panel' },
        { term: 'Decision use', definition: 'the server\'s label: decision-grade, diagnostic only, or refused' },
      ],
    },
  };
}

/* ═════════════════════════════ TWIN STATE DIFF (VIZ-28) ═════════════════════════════ */

export interface DiffKeyIn { key: string; change: string; classVersion: string | null; classActual: string | null; version: unknown; actual: unknown; unit: string | null }
export function diffInput(keys: ReadonlyArray<{ key: string; change: string; source: { kind: string; value: unknown; unit: string | null } | null; target: { kind: string; value: unknown; unit: string | null } | null }>): DiffKeyIn[] {
  return keys.map((k) => ({ key: k.key, change: k.change, classVersion: k.source?.kind ?? null, classActual: k.target?.kind ?? null, version: k.source?.value ?? null, actual: k.target?.value ?? null, unit: k.source?.unit ?? k.target?.unit ?? null }));
}
const valueText = (v: unknown): string => (v === null || v === undefined ? 'absent' : typeof v === 'string' ? v : JSON.stringify(v));
export const DIFF_COLUMNS: AlternativeColumn[] = [
  { key: 'key', label: 'Element', kind: 'text' }, { key: 'change', label: 'Change', kind: 'state' }, { key: 'class_version', label: 'State class (this version)', kind: 'state' },
  { key: 'class_actual', label: 'State class (actual)', kind: 'state' }, { key: 'actual', label: 'Actual\'s head', kind: 'text' }, { key: 'version', label: 'This version', kind: 'text' },
  { key: 'unit', label: 'Unit', kind: 'text' }, { key: 'drawn', label: 'Drawn', kind: 'text' },
];
export function diffRows(items: readonly DiffKeyIn[]): AlternativeRow[] {
  return items.map((k) => ({
    key: k.key, change: k.change, class_version: k.classVersion ?? 'absent', class_actual: k.classActual ?? 'absent', actual: valueText(k.actual), version: valueText(k.version), unit: k.unit ?? 'none',
    drawn: numOf(k.version) === null && numOf(k.actual) === null ? 'not drawn — not a number' : `in the ${k.classVersion ?? 'absent'} panel${k.classActual !== null && k.classVersion !== null && k.classActual !== k.classVersion ? ` (actual is ${k.classActual} — the classes differ)` : ''}`,
  }));
}
/** Panels by the version's state class (observed, synthetic, scenario …) — never two classes in one panel; each row its OWN scale (the ends printed). */
export function diffGeometry(items: readonly DiffKeyIn[], o: { width?: number } = {}): {
  box: Box; panels: Array<{ cls: string; y: number; rows: Array<{ key: string; row: number; y: number; lo: string; hi: string; actualX: number | null; versionX: number | null }> }>; height: number; skipped: number;
} {
  const width = o.width ?? 640; const left = 190; const right = 24; const rowH = 28; const headH = 22;
  const numeric = items.map((k, row) => ({ k, row, a: numOf(k.actual), v: numOf(k.version) })).filter((x) => x.a !== null || x.v !== null);
  const classes = [...new Set(numeric.map((x) => x.k.classVersion ?? 'absent'))].sort();
  let y = 8; const panels: Array<{ cls: string; y: number; rows: Array<{ key: string; row: number; y: number; lo: string; hi: string; actualX: number | null; versionX: number | null }> }> = [];
  for (const cls of classes) {
    const py = y; y += headH;
    const rows = numeric.filter((x) => (x.k.classVersion ?? 'absent') === cls).map((x) => {
      const lo0 = Math.min(...[x.a, x.v].filter(finite)); const hi0 = Math.max(...[x.a, x.v].filter(finite));
      const pad = lo0 === hi0 ? (lo0 === 0 ? 1 : Math.abs(lo0) * 0.1) : (hi0 - lo0) * 0.1;
      const s = linearScale([lo0 - pad, hi0 + pad], [left, width - right]);
      const ry = y + rowH / 2; y += rowH;
      return { key: x.k.key, row: x.row, y: r2(ry), lo: chartNumber(lo0 - pad), hi: chartNumber(hi0 + pad), actualX: x.a === null ? null : r2(s(x.a)), versionX: x.v === null ? null : r2(s(x.v)) };
    });
    panels.push({ cls, y: py, rows }); y += 6;
  }
  return { box: plotBox(width, Math.max(40, y + 8), { left, right, top: 8, bottom: 0 }), panels, height: Math.max(40, y + 8), skipped: items.length - numeric.length };
}
export function diffSpec(a: { twin: string; branch: string; version: string; asOf: string; verification: string; items: readonly DiffKeyIn[] }): ChartSpec {
  const classes = [...new Set(a.items.map((k) => k.classVersion ?? 'absent'))];
  return {
    kind: 'twin_state_diff', title: `${a.branch} at ${a.version} against actual's head — the changed elements by state class`,
    basis: `the server's element diff of the twin "${a.twin}": each changed element's value in this version and in actual's head, with each side's state class`,
    time: { basis: 'valid', cutoff: cutoffOf(a.asOf, a.asOf, 'no instant'), asOf: a.asOf },
    units: [{ measure: 'element value (each row on its own scale)', unit: 'the unit stated per row' }], sources: READ('twin.read · /twins/:id/versions/:v/diff', 'the twin version diff'),
    uncertainty: { kind: 'not_quantified', statement: `the elements' values as recorded; this version's verification: ${a.verification}` },
    legend: [{ key: 'actual', label: 'actual\'s head (circle)', dash: 'solid', marker: 'circle' }, { key: 'version', label: 'this version (square)', dash: 'dashed', marker: 'square' }],
    alternative: {
      summary: `${a.items.length} changed element(s) in ${classes.length} state class(es) (${classes.join(', ')}); each class is its own panel — observed and synthetic values are never drawn together.`,
      columns: DIFF_COLUMNS,
      definitions: [
        { term: 'Parent', definition: `actual's head — the branch forked from it; the diff reads this version against it at ${a.asOf}` },
        { term: 'State class', definition: 'what an element\'s value is (observed, synthetic, scenario, assumed …) as its record says; a panel holds one class only' },
        { term: 'Own scale', definition: 'each row has its own scale (its two ends printed) — rows are never compared by position' },
      ],
    },
  };
}

/** §GM's HierarchyTree over the B30 branch tree: each branch under the branch that owns the version it forked from (actual the root);
 *  a branch whose fork version is unknown is placed under actual and said so in its state. Pure; the tree's own checks run in HierarchyTree. */
export function branchTreeOf(branches: ReadonlyArray<{ branch_id: string; forked_from: number | null; head: number | null; draft: number | null; versions: number[] }>,
  versions: ReadonlyArray<{ version: number; branch_id: string }>): Array<{ id: string; parent: string | null; label: string; kind: string; version: number | null; state: string }> {
  const owner = new Map(versions.map((v) => [v.version, v.branch_id]));
  const root = branches.find((b) => b.branch_id === 'actual')?.branch_id ?? branches.find((b) => b.forked_from === null)?.branch_id ?? null;
  return branches.map((b) => {
    const from = b.forked_from === null ? null : owner.get(b.forked_from) ?? null;
    const parent = b.branch_id === root ? null : from !== null && from !== b.branch_id ? from : root;
    return { id: b.branch_id, parent, label: b.branch_id, kind: b.branch_id === root ? 'the actual branch' : `branch forked at v${b.forked_from ?? '?'}`, version: b.head,
      state: `${b.versions.length} version(s)${b.draft === null ? '' : `, draft v${b.draft} open`}${b.branch_id !== root && from === null ? ' — fork version not on this read (placed under actual)' : ''}` };
  });
}

/* ═════════════════════════════ OPTION MATRIX (VIZ-29) ═════════════════════════════ */

export interface OptionMatrixIn {
  options: Array<{ key: string; title: string }>; criteria: Array<{ key: string; title: string; weight: number | null; direction: 'max' | 'min'; unit: string }>;
  cells: Array<{ option: string; criterion: string; value: number | null; basis: string | null }>;
}
export function optionMatrixInput(a: { options: ReadonlyArray<{ key: string; title: string; values: Readonly<Record<string, unknown>>; bases: Readonly<Record<string, string>> }>; criteria: ReadonlyArray<{ key: string; title: string; weight: unknown; direction: 'max' | 'min'; unit: string }> }): OptionMatrixIn {
  return {
    options: a.options.map((o) => ({ key: o.key, title: o.title })),
    criteria: a.criteria.map((c) => ({ key: c.key, title: c.title, weight: numOf(c.weight), direction: c.direction, unit: c.unit })),
    cells: a.options.flatMap((o) => a.criteria.map((c) => ({ option: o.key, criterion: c.key, value: numOf(o.values[c.key]), basis: o.bases[c.key] ?? null }))),
  };
}
export const OPTION_COLUMNS: AlternativeColumn[] = [
  { key: 'option', label: 'Option', kind: 'text' }, { key: 'criterion', label: 'Criterion', kind: 'text' }, { key: 'weight', label: 'Weight', kind: 'number', unit: 'weight (as set)' },
  { key: 'direction', label: 'Better when', kind: 'state' }, { key: 'value', label: 'Value with its unit', kind: 'text' }, { key: 'basis', label: 'Basis', kind: 'text' },
];
export function optionRows(m: OptionMatrixIn): AlternativeRow[] {
  const ot = new Map(m.options.map((o) => [o.key, o.title])); const ct = new Map(m.criteria.map((c) => [c.key, c]));
  return m.cells.map((c) => { const k = ct.get(c.criterion)!; return { option: ot.get(c.option) ?? c.option, criterion: k.title, weight: k.weight, direction: k.direction === 'max' ? 'higher' : 'lower', value: c.value === null ? 'not assessed' : `${chartNumber(c.value)} ${k.unit}`, basis: c.basis ?? 'none recorded' }; });
}
/** A grid of options × criteria; each criterion's column has ITS OWN scale (the options' extent), a mark per assessed cell; no composite. */
export function optionGeometry(m: OptionMatrixIn, o: { width?: number } = {}): {
  box: Box; colW: number; rowH: number; cols: Array<{ key: string; x: number; title: string; lo: string; hi: string }>;
  marks: Array<{ option: string; criterion: string; row: number; x: number; y: number; missing: boolean }>; rowsY: Array<{ key: string; y: number; title: string }>;
} {
  const left = 150; const rowH = 34; const top = 54; const n = Math.max(1, m.criteria.length);
  const colW = Math.max(90, Math.min(160, ((o.width ?? 640) - left - 8) / n));
  const box = plotBox(left + colW * n + 8, top + rowH * Math.max(1, m.options.length) + 8, { left, right: 8, top, bottom: 8 });
  const scales = new Map(m.criteria.map((c, j) => {
    const e = extentOf(m.cells.filter((x) => x.criterion === c.key).map((x) => x.value));
    const lo = e === null ? 0 : e[0]; const hi = e === null ? 1 : e[1] === e[0] ? e[0] + 1 : e[1];
    const x0 = left + colW * j + 12; const x1 = left + colW * (j + 1) - 12;
    return [c.key, { s: linearScale(c.direction === 'max' ? [lo, hi] : [hi, lo], [x0, x1]), lo, hi }];
  }));
  const rowIndex = new Map<string, number>(); m.cells.forEach((c, i) => rowIndex.set(`${c.option}|${c.criterion}`, i));
  return {
    box, colW, rowH,
    cols: m.criteria.map((c, j) => ({ key: c.key, x: r2(left + colW * j), title: `${clipText(c.title, 16)} · w ${c.weight === null ? '?' : chartNumber(c.weight)}`, lo: chartNumber(c.direction === 'max' ? scales.get(c.key)!.lo : scales.get(c.key)!.hi), hi: chartNumber(c.direction === 'max' ? scales.get(c.key)!.hi : scales.get(c.key)!.lo) })),
    rowsY: m.options.map((op, i) => ({ key: op.key, y: r2(top + rowH * (i + 0.5)), title: clipText(op.title, 20) })),
    marks: m.options.flatMap((op, i) => m.criteria.map((c) => {
      const cell = m.cells.find((x) => x.option === op.key && x.criterion === c.key); const v = cell?.value ?? null;
      return { option: op.key, criterion: c.key, row: rowIndex.get(`${op.key}|${c.key}`) ?? 0, x: v === null ? r2(left + colW * m.criteria.indexOf(c) + colW / 2) : r2(scales.get(c.key)!.s(v)), y: r2(top + rowH * (i + 0.5)), missing: v === null };
    })),
  };
}
export function optionSpec(a: { pkg: string; version: number; m: OptionMatrixIn; dissent: ReadonlyArray<{ by: string; position: string; rationale: string }>; asOf: string; criteriaVersion: number | null }): ChartSpec {
  const assessed = a.m.cells.filter((c) => c.value !== null).length;
  return {
    kind: 'option_matrix', title: `Options against the criteria — ${a.pkg} v${a.version}`,
    basis: 'each option\'s assessed value per criterion as recorded (entered with a basis, or computed from a cited run, forecast or review); the weights as set by their value owner',
    time: { basis: 'none', cutoff: { absent: 'the assessments as they stand at the read' }, asOf: a.asOf },
    units: [{ measure: 'weight', unit: 'weight (as set)' }], sources: READ('decision.read · /decisions/:id/versions/:v/analysis', 'the package\'s decision analysis'),
    uncertainty: { kind: 'not_quantified', statement: 'each value is a point as assessed — no range is recorded for it; the weights are a value judgement, owned' },
    legend: [{ key: 'cell', label: 'the option on the criterion\'s own scale (right is better)', dash: 'solid', marker: 'diamond' }, { key: 'missing', label: 'not assessed (cross)', dash: 'dotted', marker: 'cross' }],
    alternative: {
      summary: `${a.m.options.length} option(s) × ${a.m.criteria.length} criteria${a.criteriaVersion === null ? '' : ` (criteria set v${a.criteriaVersion})`}; ${assessed} cell(s) assessed; ${a.dissent.length} dissent(s) recorded. No composite is drawn.`,
      columns: OPTION_COLUMNS,
      definitions: [
        { term: 'Weight', definition: 'as its value owner set it — a value judgement, shown beside each criterion, never folded into one number here' },
        { term: 'Own scale', definition: 'each criterion\'s column runs from its worst to its best option (the ends printed); positions are not comparable across columns' },
        { term: 'Dissent', definition: a.dissent.length === 0 ? 'none recorded on this package version' : a.dissent.map((d) => `${shortId(d.by)}: ${d.position} — ${d.rationale}`).join(' · ') },
      ],
    },
  };
}

/* ═════════════════════════════ EVIDENCE COVERAGE (VIZ-30) ═════════════════════════════ */

export interface CoveragePartIn { key: string; label: string; part: number | null; whole: number | null; note: string }
export function coverageInput(m: { evidence_coverage: { options: number; simulated: number; with_evidence: number; citations: number; standing: number; runs: number; decision_grade_runs: number } }): CoveragePartIn[] {
  const e = m.evidence_coverage;
  return [
    { key: 'citations', label: 'citations that stand', part: e.standing, whole: e.citations, note: 'a disputed or withdrawn citation does not stand' },
    { key: 'options', label: 'options citing evidence', part: e.with_evidence, whole: e.options, note: 'an option with no citation is an omission' },
    { key: 'simulated', label: 'options backed by a simulation', part: e.simulated, whole: e.options, note: 'a run cited by the option' },
    { key: 'runs', label: 'runs decision-grade', part: e.decision_grade_runs, whole: e.runs, note: 'the run\'s decision use (diagnostic or refused otherwise)' },
  ];
}
export const COVERAGE_COLUMNS: AlternativeColumn[] = [
  { key: 'measure', label: 'Measure', kind: 'text' }, { key: 'part', label: 'Counted', kind: 'number', unit: 'count' }, { key: 'whole', label: 'Of', kind: 'number', unit: 'count' },
  { key: 'gap', label: 'Gap', kind: 'number', unit: 'count' }, { key: 'note', label: 'What it counts', kind: 'text' },
];
export const coverageRows = (parts: readonly CoveragePartIn[]): AlternativeRow[] => parts.map((p) => ({
  measure: p.label, part: p.part, whole: p.whole, gap: finite(p.part) && finite(p.whole) ? p.whole - p.part : null, note: p.note,
}));
export function coverageGeometry(parts: readonly CoveragePartIn[], o: { box?: Box } = {}): { box: Box; bars: Array<{ key: string; row: number; y: number; wholeW: number; partW: number; x: number }>; max: number } {
  const rowH = 30; const box = o.box ?? plotBox(640, 16 + parts.length * rowH, { left: 230, right: 70, top: 8, bottom: 8 });
  const max = Math.max(1, ...parts.map((p) => (finite(p.whole) ? p.whole : 0)));
  const x = linearScale([0, max], [box.left, box.left + box.innerWidth]);
  return { box, max, bars: parts.map((p, row) => ({ key: p.key, row, y: r2(box.top + row * rowH + 6), x: box.left, wholeW: r2(finite(p.whole) ? x(p.whole) - box.left : 0), partW: r2(finite(p.part) ? x(p.part) - box.left : 0) })) };
}
export function coverageSpec(a: { pkg: string; asOf: string; standard: string | null; meets: boolean | null; disputed: number }): ChartSpec {
  return {
    kind: 'evidence_coverage', title: `Evidence coverage of “${a.pkg}” — support and gaps`,
    basis: 'the package\'s decision metrics: how many citations stand, how many options cite evidence or a simulation, how many runs are decision-grade — counts, each with its gap',
    time: { basis: 'none', cutoff: cutoffOf(a.asOf, a.asOf, 'no instant'), asOf: a.asOf },
    units: [{ measure: 'records', unit: 'count' }], sources: READ('decision.read · /decisions/:id/review', 'the package\'s decision metrics'),
    uncertainty: { kind: 'not_applicable', statement: 'counts of recorded citations and runs — exact; what they do not measure is stated under Omissions' },
    legend: [{ key: 'part', label: 'counted (filled)', dash: 'solid', marker: 'square' }, { key: 'whole', label: 'of the whole (outline; the open part is the gap)', dash: 'dashed', marker: 'none' }],
    alternative: {
      summary: `Counts of support and their gaps; ${a.disputed} citation(s) disputed or withdrawn; evidence standard ${a.standard ?? 'not set'}${a.meets === null ? '' : a.meets ? ' — met' : ' — NOT met'}. A count says how much is cited, not how good it is.`,
      columns: COVERAGE_COLUMNS,
      definitions: [
        { term: 'Source classes', definition: 'not on this read — the classes of the cited sources are on each evidence item\'s page' },
        { term: 'Omissions', definition: 'this read does not count source classes, rights, freshness or diversity of the cited evidence; an option that cites nothing is a gap, shown' },
      ],
    },
  };
}

/* ═════════════════════════════ STATUS BOARD (VIZ-33) ═════════════════════════════ */

export interface StatusIn { key: string; capability: string; state: string; slo: string | null; freshness: string | null; dependencies: string | null; degraded: string | null; owner: string | null }
const STATUS_ORDER = ['failed', 'gap', 'degraded', 'stale', 'suspended', 'unknown', 'healthy'];
export const STATUS_IDENTITY: Readonly<Record<string, { marker: MarkerShape; word: string }>> = {
  healthy: { marker: 'circle', word: 'HEALTHY' }, degraded: { marker: 'triangle', word: 'DEGRADED' }, stale: { marker: 'triangle', word: 'STALE' },
  unknown: { marker: 'diamond', word: 'UNKNOWN' }, failed: { marker: 'cross', word: 'FAILED' }, gap: { marker: 'cross', word: 'GAP' }, suspended: { marker: 'square', word: 'SUSPENDED' },
};
export const statusIdentity = (s: string): { marker: MarkerShape; word: string } => STATUS_IDENTITY[s] ?? { marker: 'diamond', word: s.toUpperCase() || 'UNKNOWN' };
/** Worst first (failed, gap, degraded, stale, suspended, unknown, healthy), then by capability — a stable board, never sorted green-first. */
export function statusOrder(items: readonly StatusIn[]): StatusIn[] {
  const rank = (s: string) => { const i = STATUS_ORDER.indexOf(s); return i < 0 ? STATUS_ORDER.indexOf('unknown') : i; };
  return [...items].sort((a, b) => rank(a.state) - rank(b.state) || a.capability.localeCompare(b.capability));
}
export const STATUS_COLUMNS: AlternativeColumn[] = [
  { key: 'capability', label: 'Capability', kind: 'text' }, { key: 'state', label: 'State', kind: 'state' }, { key: 'slo', label: 'Service level', kind: 'text' },
  { key: 'freshness', label: 'Freshness', kind: 'text' }, { key: 'dependencies', label: 'Dependencies', kind: 'text' }, { key: 'degraded', label: 'Degraded contract', kind: 'text' },
  { key: 'owner', label: 'Owner', kind: 'text' },
];
export const statusRows = (items: readonly StatusIn[]): AlternativeRow[] => items.map((s) => ({
  capability: s.capability, state: statusIdentity(s.state).word, slo: s.slo ?? 'none declared', freshness: s.freshness ?? 'not on this read', dependencies: s.dependencies ?? 'none listed',
  degraded: s.degraded ?? 'none declared', owner: s.owner ?? 'no owner on this read',
}));
export function statusCounts(items: readonly StatusIn[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const s of items) { const w = statusIdentity(s.state).word; c[w] = (c[w] ?? 0) + 1; }
  return c;
}
/** From B81's governed degraded-state read: each declared contract and each undeclared signal is a capability with its signal, contract and owner. */
export function statusFromDegraded(d: {
  contracts: ReadonlyArray<{ contract_id: string; dependency: { kind: string; key: string }; signal: { state: string; since: string | null }; max_duration_seconds: number; owner: { principal_id: string; name: string | null }; unavailable: ReadonlyArray<{ label: string }>; mode: string; in_force: boolean; overdue: boolean; version: number }>;
  undeclared: ReadonlyArray<{ dependency: { kind: string; key: string }; signal: { state: string; since: string | null } }>;
}): StatusIn[] {
  const st = (s: string) => (s === 'healthy' ? 'healthy' : s === 'degraded' ? 'degraded' : s === 'failed' ? 'failed' : 'unknown');
  return [
    ...d.contracts.map((c) => ({
      key: c.contract_id, capability: `${c.dependency.kind} · ${c.dependency.key}`, state: st(c.signal.state), slo: `degraded mode at most ${chartNumber(c.max_duration_seconds / 3600)} h (contract v${c.version})`,
      freshness: c.signal.since === null ? 'no signal instant' : `signal since ${c.signal.since}`, dependencies: c.unavailable.length === 0 ? 'no function withdrawn' : `withdrawn when degraded: ${c.unavailable.map((f) => f.label).join(', ')}`,
      degraded: `${c.mode}${c.in_force ? ' — in force' : ''}${c.overdue ? ' — OVERDUE' : ''}`, owner: c.owner.name ?? shortId(c.owner.principal_id),
    })),
    ...d.undeclared.map((u, i) => ({ key: `u${i}:${u.dependency.kind}:${u.dependency.key}`, capability: `${u.dependency.kind} · ${u.dependency.key}`, state: st(u.signal.state), slo: null,
      freshness: u.signal.since === null ? 'no signal instant' : `signal since ${u.signal.since}`, dependencies: null, degraded: 'no contract declared', owner: null })),
  ];
}
export function statusGeometry(items: readonly StatusIn[], o: { width?: number } = {}): { box: Box; rows: Array<{ key: string; row: number; y: number; marker: MarkerShape; word: string; label: string; detail: string }> } {
  const rowH = 26; const box = plotBox(o.width ?? 640, 12 + Math.max(1, items.length) * rowH, { left: 12, right: 12, top: 6, bottom: 6 });
  return { box, rows: items.map((s, row) => ({ key: s.key, row, y: r2(box.top + rowH * (row + 0.5)), ...statusIdentity(s.state), label: clipText(s.capability, 34), detail: clipText(`${s.slo ?? 'no service level declared'} · ${s.freshness ?? 'freshness not on this read'}`, 52) })) };
}
export function statusSpec(a: { title: string; items: readonly StatusIn[]; asOf: string; read: string; readLabel: string; sloWords: string }): ChartSpec {
  const c = statusCounts(a.items);
  return {
    kind: 'status_board', title: a.title,
    basis: 'each capability\'s state as the governing read evaluates it, with its service level, freshness, dependencies, degraded-mode contract and owner',
    time: { basis: 'none', cutoff: cutoffOf(a.asOf, a.asOf, 'no instant'), asOf: a.asOf },
    units: [{ measure: 'capabilities', unit: 'count' }], sources: READ(a.read, a.readLabel),
    uncertainty: { kind: 'ordinal', statement: 'states are words and shapes (healthy, degraded, unknown, failed …); UNKNOWN is a state, never a pass' },
    legend: ['healthy', 'degraded', 'unknown', 'failed'].map((s) => ({ key: s, label: `${statusIdentity(s).word} (${statusIdentity(s).marker})`, dash: 'solid' as DashPattern, marker: statusIdentity(s).marker, directLabel: true })),
    alternative: {
      summary: `${a.items.length} capability(ies): ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'} — worst first.`,
      columns: STATUS_COLUMNS,
      definitions: [
        { term: 'SLO', definition: a.sloWords },
        { term: 'Freshness', definition: 'the instant the state was last signalled or established, as the read gives it' },
        { term: 'Degraded contract', definition: 'the declared degraded mode (what stays available, for how long, who owns it); none declared is said' },
      ],
    },
  };
}

/* ═════════════════════════════ ALERT QUEUE (VIZ-34) ═════════════════════════════ */

export interface AlertIn {
  key: string; position: number; title: string; signalClass: string; severity: string | null; reason: string; ageHours: number | null; dueInHours: number | null;
  owner: string | null; acknowledged: boolean; suppressedUntil: string | null; state: string; overdue: boolean;
}
/** The queue in the SERVER'S order (the declared policy ranked it — position 1 first); ages and due times against the read's instant. */
export function alertInput<T extends { item_id: string; title: string; signal_class: string; state: string; owner_principal_id: string | null; created_at: string; due_at: string | null; overdue: boolean; suppressed_until: string | null; acknowledged_at: string | null; evaluation?: { dimensions?: object } | null }>(items: readonly T[], why: (i: T) => string, now: string): AlertIn[] {
  const t = toInstant(now);
  return items.map((it, i) => {
    const c = toInstant(it.created_at); const d = toInstant(it.due_at);
    const sev = (it.evaluation?.dimensions as Row | undefined)?.['consequence'];
    return {
      key: it.item_id, position: i + 1, title: it.title, signalClass: it.signal_class, severity: typeof sev === 'string' ? sev : null, reason: why(it),
      ageHours: t === null || c === null ? null : r2((t - c) / 3_600_000), dueInHours: t === null || d === null ? null : r2((d - t) / 3_600_000),
      owner: it.owner_principal_id, acknowledged: it.acknowledged_at !== null, suppressedUntil: it.suppressed_until, state: it.state, overdue: it.overdue,
    };
  });
}
export const ALERT_COLUMNS: AlternativeColumn[] = [
  { key: 'position', label: 'Position (declared order)', kind: 'number', unit: 'position' }, { key: 'item', label: 'Item', kind: 'text' }, { key: 'class', label: 'Class', kind: 'text' },
  { key: 'severity', label: 'Severity (consequence)', kind: 'state' }, { key: 'reason', label: 'Reason', kind: 'text' }, { key: 'age', label: 'Age', kind: 'number', unit: 'hours' },
  { key: 'due', label: 'Due in', kind: 'number', unit: 'hours' }, { key: 'owner', label: 'Owner', kind: 'text' }, { key: 'ack', label: 'Acknowledged', kind: 'state' },
  { key: 'suppressed', label: 'Suppressed until', kind: 'text' }, { key: 'state', label: 'State', kind: 'state' },
];
export const alertRows = (items: readonly AlertIn[]): AlternativeRow[] => items.map((a) => ({
  position: a.position, item: a.title, class: a.signalClass, severity: a.severity ?? 'not stated', reason: a.reason, age: a.ageHours, due: a.dueInHours,
  owner: a.owner === null ? 'no owner' : shortId(a.owner), ack: a.acknowledged ? 'acknowledged' : 'not acknowledged', suppressed: a.suppressedUntil ?? 'not suppressed', state: `${a.state}${a.overdue ? ' — OVERDUE' : ''}`,
}));
const SEVERITY_MARKER: Readonly<Record<string, MarkerShape>> = { C4: 'cross', C3: 'diamond', C2: 'triangle', C1: 'square', C0: 'circle' };
export const severityMarker = (s: string | null): MarkerShape => (s === null ? 'circle' : SEVERITY_MARKER[s] ?? 'circle');
export function alertGeometry(items: readonly AlertIn[], o: { width?: number } = {}): {
  box: Box; nowX: number; rows: Array<{ key: string; row: number; y: number; ageX0: number | null; dueX: number | null; marker: MarkerShape; label: string; suppressed: boolean; acknowledged: boolean }>; xTicks: Array<{ x: number; label: string }>;
} {
  const rowH = 24; const box = plotBox(o.width ?? 640, 36 + Math.max(1, items.length) * rowH, { left: 200, right: 24, top: 8, bottom: 28 });
  const e = extentOf([0, ...items.map((a) => (a.ageHours === null ? null : -a.ageHours)), ...items.map((a) => a.dueInHours)])!;
  const d = niceDomain(e[0], e[1]);
  const x = linearScale([d.min, d.max], [box.left, box.left + box.innerWidth]);
  return {
    box, nowX: r2(x(0)), xTicks: d.ticks.map((v) => ({ x: r2(x(v)), label: `${chartNumber(v)} h` })),
    rows: items.map((a, row) => ({ key: a.key, row, y: r2(box.top + rowH * (row + 0.5)), ageX0: a.ageHours === null ? null : r2(x(-a.ageHours)), dueX: a.dueInHours === null ? null : r2(x(a.dueInHours)),
      marker: severityMarker(a.severity), label: clipText(`${a.position}. ${a.title}`, 28), suppressed: a.suppressedUntil !== null, acknowledged: a.acknowledged })),
  };
}
export function alertSpec(a: { items: readonly AlertIn[]; asOf: string; policy: string }): ChartSpec {
  const overdue = a.items.filter((x) => x.overdue).length;
  return {
    kind: 'alert_queue', title: 'The attention items in the policy\'s order — age, due time and owner',
    basis: 'the attention queue as the server ranked it under the declared policy: each item\'s class, consequence, reason, owner, acknowledgement and suppression',
    time: { basis: 'record', cutoff: cutoffOf(a.asOf, a.asOf, 'no instant'), asOf: a.asOf },
    units: [{ measure: 'time relative to the read', unit: 'hours' }, { measure: 'queue position', unit: 'position' }],
    sources: READ('executive.attention.read · /attention/items/list', 'the attention queue'),
    uncertainty: { kind: 'not_applicable', statement: 'recorded instants and the server\'s order — no estimate is drawn' },
    legend: [{ key: 'age', label: 'age: created → now (solid line)', dash: 'solid', marker: 'none' }, { key: 'due', label: 'due time (marker shape = consequence class)', dash: 'dotted', marker: 'triangle' }],
    alternative: {
      summary: `${a.items.length} item(s) in the declared order; ${overdue} overdue; ${a.items.filter((x) => x.suppressedUntil !== null).length} suppressed (dashed row).`,
      columns: ALERT_COLUMNS,
      definitions: [
        { term: 'Order', definition: `the position the server gave each item under ${a.policy} — never re-sorted here by a score` },
        { term: 'Severity', definition: 'the consequence class (C0–C4) the evaluation recorded: circle C0, square C1, triangle C2, diamond C3, cross C4' },
      ],
    },
  };
}

/* ═════════════════════════════ AUDIT TIMELINE (VIZ-35) ═════════════════════════════ */

export interface AuditIn { key: string; seq: string; at: string; actor: string; action: string; type: string; outcome: string; result: string; partition: string; hash: string }
export const AUDIT_COLUMNS: AlternativeColumn[] = [
  { key: 'seq', label: 'Sequence', kind: 'text' }, { key: 'at', label: 'Occurred', kind: 'instant' }, { key: 'actor', label: 'Actor', kind: 'text' },
  { key: 'action', label: 'Action', kind: 'text' }, { key: 'object', label: 'Event', kind: 'text' }, { key: 'outcome', label: 'Outcome', kind: 'state' },
  { key: 'result', label: 'Result code', kind: 'text' }, { key: 'partition', label: 'Partition', kind: 'text' }, { key: 'hash', label: 'Chain hash', kind: 'text' },
];
export const auditRows = (events: readonly AuditIn[]): AlternativeRow[] => events.map((e) => ({
  seq: e.seq, at: e.at, actor: e.actor, action: e.action, object: e.type, outcome: e.outcome, result: e.result, partition: e.partition, hash: `${e.hash.slice(0, 10)}…`,
}));
export const AUDIT_LANES = ['success', 'denied', 'failure', 'indeterminate'] as const;
const AUDIT_MARKER: Readonly<Record<string, MarkerShape>> = { success: 'circle', denied: 'cross', failure: 'triangle', indeterminate: 'diamond' };
export const auditMarker = (o: string): MarkerShape => AUDIT_MARKER[o] ?? 'square';
export function auditGeometry(events: readonly AuditIn[], o: { box?: Box } = {}): {
  box: Box; empty: boolean; lanes: Array<{ key: string; y: number }>; marks: Array<{ key: string; row: number; x: number; y: number; marker: MarkerShape }>; xTicks: Array<{ x: number; label: string }>; unplaced: number;
} {
  const lanes = [...AUDIT_LANES, 'other'];
  const box = o.box ?? plotBox(640, 40 + lanes.length * 30, { left: 110, right: 24, top: 10, bottom: 30 });
  const laneY = (k: string) => r2(box.top + (lanes.indexOf(k) + 0.5) * (box.innerHeight / lanes.length));
  const placed = events.map((e, row) => ({ e, row, t: toInstant(e.at) })).filter((x) => x.t !== null);
  const lanesOut = lanes.map((k) => ({ key: k, y: laneY(k) }));
  if (placed.length === 0) return { box, empty: true, lanes: lanesOut, marks: [], xTicks: [], unplaced: events.length };
  const ex = extentOf(placed.map((p) => p.t))!; const t0 = ex[0] === ex[1] ? ex[0] - 60_000 : ex[0]; const t1 = ex[0] === ex[1] ? ex[1] + 60_000 : ex[1];
  const x = linearScale([t0, t1], [box.left, box.left + box.innerWidth]);
  const ticks = t1 - t0 < 2 * 86_400_000
    ? [0, 0.25, 0.5, 0.75, 1].map((f) => { const t = t0 + (t1 - t0) * f; return { x: r2(x(t)), label: new Date(t).toISOString().slice(11, 16) }; })
    : timeTicks(t0, t1).map((k) => ({ x: r2(x(k.at)), label: k.label }));
  return {
    box, empty: false, lanes: lanesOut, xTicks: ticks, unplaced: events.length - placed.length,
    marks: placed.map(({ e, row, t }) => ({ key: e.key, row, x: r2(x(t as number)), y: laneY((AUDIT_LANES as readonly string[]).includes(e.outcome) ? e.outcome : 'other'), marker: auditMarker(e.outcome) })),
  };
}
export function auditSpec(a: { events: readonly AuditIn[]; asOf: string; obligations: readonly string[] }): ChartSpec {
  const last = a.events.map((e) => e.at).filter((x) => toInstant(x) !== null).sort().pop() ?? null;
  return {
    kind: 'audit_timeline', title: 'The audit ledger\'s latest events on record time',
    basis: 'the sanitized projection of the audit ledger (the server masks secret metadata): actor, action, event, outcome, the chain hash — read-only',
    time: { basis: 'record', cutoff: cutoffOf(last, a.asOf, 'no event in the window'), asOf: a.asOf },
    units: [{ measure: 'events', unit: 'count' }], sources: READ('audit.read · /platform/audit/query', 'the audit ledger (the latest 50)'),
    uncertainty: { kind: 'not_applicable', statement: 'recorded events — exact; integrity is checked by verifying the hash chain (above), not inferred from this drawing' },
    legend: AUDIT_LANES.map((k) => ({ key: k, label: `${k} (${auditMarker(k)})`, dash: 'solid' as DashPattern, marker: auditMarker(k), directLabel: true })),
    alternative: {
      summary: `${a.events.length} event(s), by outcome lane; ${a.events.filter((e) => e.outcome === 'denied').length} denied.${a.obligations.length === 0 ? '' : ` Obligations on this view: ${a.obligations.join(', ')}.`}`,
      columns: AUDIT_COLUMNS,
      definitions: [
        { term: 'Read-only', definition: 'the ledger is append-only: nothing here edits, hides or reorders an event; a tampered partition is an incident, never re-sealed' },
        { term: 'Policy', definition: 'each event\'s policy decision is in the ledger itself; this projection carries its action and result code' },
        { term: 'Signature', definition: 'no per-event signature is on this read — the hash chain binds each event to the one before it' },
      ],
    },
  };
}
