/**
 * CP-6 B30 §ES (0103) — THE ESTIMATORS (F-P5-02: declared estimators producing candidate state). PURE: no clock, no I/O — the service reads
 * the series and the twin, this module turns the points into each declared estimator's CANDIDATE, states the spread among the candidates
 * (disagreement retained, never averaged away), builds the constraint subject the engine checks before publish, and validates a declaration.
 *
 * Four methods, each over the FIRST input (a series, read through its cut-offs; an element for last_observation), then ONE common transform:
 *   last_observation    the latest point (or the element's value)
 *   moving_average      the mean of the latest `window` points (window ≥ 2)
 *   ratio_to_baseline   the mean of the latest `window` points (default 1) — the transform's baseline is required
 *   kalman_1d           a one-dimensional random-walk Kalman filter over the latest `window` points (default 30): process_variance q,
 *                       measurement_variance r, the state started at the first point with variance r; the filtered state is the estimate
 *   transform           value = raw / baseline × scale when a baseline is declared, else raw × scale (scale default 1): a ratio in per cent
 *                       is { baseline, scale: 100 }; the value is rounded to 3 decimals.
 * CONFIDENCE (from the data, never from narrative): the Kalman filter's 1 − √P / |x̂| (P its final variance); every other method's
 * 1 − (standard deviation / |mean|) over the latest max(window, 7) points — clamped to [0, 1], rounded to 3 decimals.
 */
import { createHash } from 'node:crypto';

export const ESTIMATOR_METHODS = ['last_observation', 'moving_average', 'ratio_to_baseline', 'kalman_1d'] as const;
export type EstimatorMethod = typeof ESTIMATOR_METHODS[number];
export const ESTIMATE_STATES = ['proposed', 'approved', 'declined', 'superseded'] as const;
export const REQUEST_STATES = ['open', 'fulfilled', 'cancelled'] as const;
export const REASON_CLASSES = ['missing', 'stale', 'disqualified'] as const;

export interface SeriesInput { kind: 'series'; series_key: string; unit: string; cadence_days: number; cadence_tolerance?: number; truth_states?: string[]; accept_degraded?: boolean }
export interface ElementInput { kind: 'element'; key: string; unit?: string; max_age_days?: number; kinds?: string[] }
export type EstimatorInput = SeriesInput | ElementInput;
export interface EstimatorParameters { window?: number; baseline?: number; scale?: number; process_variance?: number; measurement_variance?: number; balance_stock?: string }
export interface EstimatorDecl {
  estimator_id: string; version: number; name: string; role: 'primary' | 'challenger'; method: EstimatorMethod; parameters: EstimatorParameters;
  inputs: EstimatorInput[]; unit: string; bounds: { min?: number; max?: number }; materiality: number; ambiguity: number; constraint_sets: string[];
}
export interface Point { date: string; value: number; evidence: { id: string; version: number } | null }
export interface Candidate {
  estimator_id: string; version: number; name: string; role: 'primary' | 'challenger'; method: EstimatorMethod;
  value: number | null; raw: number | null; confidence: number | null;
  window: { from: string; to: string; n: number } | null; last_point: { date: string; value: number } | null;
  evidence: Array<{ id: string; version: number }>; excluded: string | null;
}

const round = (v: number, places = 3): number => { const f = 10 ** places; return Math.round(v * f) / f; };
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]): number => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

/** The dispersion confidence of a window: 1 − cv, clamped (a single point, or a zero mean, answers by what it can say: 1 for a constant window). */
export function dispersionConfidence(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  if (m === 0) return std(values) === 0 ? 1 : 0;
  return round(clamp01(1 - std(values) / Math.abs(m)));
}

/** The common transform: raw / baseline × scale with a baseline, else raw × scale. */
export function transform(raw: number, p: EstimatorParameters): number {
  const scale = p.scale ?? 1;
  return round(p.baseline !== undefined ? (raw / p.baseline) * scale : raw * scale);
}

/** A one-dimensional random-walk Kalman filter over the values: the filtered state and its variance. */
export function kalman1d(values: number[], q: number, r: number): { x: number; p: number } {
  if (values.length === 0) throw new Error('kalman_1d needs at least one point');
  let x = values[0] as number; let p = r;
  for (let i = 1; i < values.length; i += 1) {
    p += q;                              // predict (random walk)
    const k = p / (p + r);               // gain
    x += k * ((values[i] as number) - x);
    p *= 1 - k;
  }
  return { x, p };
}

/** The minimum points a method needs over its window. */
export function pointsNeeded(d: Pick<EstimatorDecl, 'method' | 'parameters'>): number {
  if (d.method === 'moving_average') return d.parameters.window ?? 2;
  if (d.method === 'kalman_1d') return 3;
  return 1;
}

/**
 * ONE estimator's candidate from the points of its first (series) input, oldest first — or from the element's value (last_observation on an
 * element input). The caller has already judged the inputs: `disqualified` (the qualification's reasons) excludes the estimator.
 */
export function candidateOf(d: EstimatorDecl, points: Point[] | null, element: { value: unknown; date: string | null } | null, disqualified: string | null): Candidate {
  const base: Candidate = { estimator_id: d.estimator_id, version: d.version, name: d.name, role: d.role, method: d.method, value: null, raw: null, confidence: null,
                            window: null, last_point: null, evidence: [], excluded: null };
  if (disqualified !== null) return { ...base, excluded: disqualified };
  if (points === null) {
    // an element input: only last_observation reads it
    if (d.method !== 'last_observation' || element === null || typeof element.value !== 'number' || !Number.isFinite(element.value)) {
      return { ...base, excluded: 'the input element states no number to estimate from' };
    }
    const raw = element.value;
    const date = element.date ?? '';
    return { ...base, raw, value: transform(raw, d.parameters), confidence: 1, window: date === '' ? null : { from: date, to: date, n: 1 },
             last_point: date === '' ? null : { date, value: raw } };
  }
  const sorted = [...points].filter((x) => Number.isFinite(x.value)).sort((a, b) => a.date.localeCompare(b.date));
  const need = pointsNeeded(d);
  if (sorted.length < need) return { ...base, excluded: `${d.method} needs at least ${need} point(s); the series has ${sorted.length}` };
  const last = sorted[sorted.length - 1] as Point;
  const windowN = d.method === 'kalman_1d' ? Math.min(sorted.length, d.parameters.window ?? 30)
    : d.method === 'last_observation' ? 1 : Math.min(sorted.length, d.parameters.window ?? (d.method === 'moving_average' ? 2 : 1));
  const win = sorted.slice(sorted.length - windowN);
  const values = win.map((x) => x.value);
  const confWin = sorted.slice(sorted.length - Math.min(sorted.length, Math.max(windowN, 7))).map((x) => x.value);
  let raw: number; let confidence: number;
  if (d.method === 'kalman_1d') {
    const k = kalman1d(values, d.parameters.process_variance as number, d.parameters.measurement_variance as number);
    raw = k.x;
    confidence = k.x === 0 ? 0 : round(clamp01(1 - Math.sqrt(k.p) / Math.abs(k.x)));
  } else {
    raw = d.method === 'last_observation' ? last.value : mean(values);
    confidence = dispersionConfidence(confWin);
  }
  const evidence = new Map<string, { id: string; version: number }>();
  for (const x of win) if (x.evidence !== null) evidence.set(`${x.evidence.id}@${x.evidence.version}`, x.evidence);
  return { ...base, raw: round(raw, 6), value: transform(raw, d.parameters), confidence,
           window: { from: (win[0] as Point).date, to: last.date, n: win.length }, last_point: { date: last.date, value: last.value }, evidence: [...evidence.values()] };
}

/**
 * B30 act (a defect the demonstration found): WHICH UNREADABLE EVIDENCE VERSIONS COUNT AGAINST A SERIES INPUT. A version whose bytes the
 * reader cannot read (governed-deleted, withdrawn, unavailable) counts only when it could hold a point the estimators read: its day (the
 * evidence's event time, else its valid-from) on or after the first day of the WIDEST window any estimator of this series reads — its
 * method's window and the 7-point confidence window — or when it states no day at all (it might hold anything). Before, ANY unreadable
 * version of the series' source disqualified the input for good: the routine retention of superseded evidence from years before left a
 * series unestimable forever (the demonstration's 2024 PortWatch seed version, tombstoned by a retention action). The rest are disclosed
 * (outside), never hidden.
 */
export function unreadableInWindow(points: Point[], decls: EstimatorDecl[], seriesKey: string, unreadable: Array<{ day: string | null }>): { counted: number; outside: number; windowFrom: string | null } {
  if (unreadable.length === 0 || points.length === 0) return { counted: unreadable.length, outside: 0, windowFrom: null };
  const widest = widestWindow(decls, seriesKey);
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const windowFrom = (sorted[Math.max(0, sorted.length - widest)] as Point).date;
  const counted = unreadable.filter((u) => u.day === null || u.day >= windowFrom).length;
  return { counted, outside: unreadable.length - counted, windowFrom };
}

/**
 * The WIDEST window the estimators read over one series: each method's window and the 7-point confidence window, over the estimators whose
 * first input is that series (the window rule above). B25-R: also how many latest points the scan's series read must hold — the TAIL it
 * reads instead of the whole history (estimation.service.ts compute; series.service.ts SeriesTail).
 */
export function widestWindow(decls: EstimatorDecl[], seriesKey: string): number {
  const reads = decls.filter((d) => d.inputs[0]?.kind === 'series' && (d.inputs[0] as SeriesInput).series_key === seriesKey);
  return Math.max(7, ...reads.map((d) => (d.method === 'kalman_1d' ? (d.parameters.window ?? 30) : d.method === 'moving_average' ? (d.parameters.window ?? 2)
    : d.method === 'ratio_to_baseline' ? (d.parameters.window ?? 1) : 1)));
}

/** The spread among the stated candidates — the disagreement, kept and stated (relative to the proposal). */
export function spreadOf(candidates: Candidate[], proposed: number): { n: number; min: number | null; max: number | null; abs: number | null; relative: number | null } {
  const vs = candidates.map((c) => c.value).filter((v): v is number => v !== null);
  if (vs.length === 0) return { n: 0, min: null, max: null, abs: null, relative: null };
  const min = Math.min(...vs); const max = Math.max(...vs);
  return { n: vs.length, min, max, abs: round(max - min, 6), relative: proposed === 0 ? null : round((max - min) / Math.abs(proposed), 6) };
}

/** Materiality as the port judges it: no numeric head value → material; else |Δ| / |head| ≥ the threshold. */
export function materialityOf(proposed: number, head: unknown, threshold: number): { material: boolean; delta_abs: number | null; delta_relative: number | null } {
  if (typeof head !== 'number' || !Number.isFinite(head)) return { material: true, delta_abs: null, delta_relative: null };
  const delta = Math.abs(proposed - head);
  if (head === 0) return { material: delta !== 0, delta_abs: round(delta, 6), delta_relative: null };
  const rel = delta / Math.abs(head);
  return { material: rel >= threshold, delta_abs: round(delta, 6), delta_relative: round(rel, 6) };
}

/**
 * The CONSTRAINT SUBJECT of an estimate (checked BEFORE publish, as a run_input subject — the engine's existing kind):
 *   the estimated quantity itself (key, value, unit, the as-of day) — business rules and declared ranges read it;
 *   with a baseline transform, the BALANCE of the measured flow under the stock `balance_stock` (default the key), in the input's unit:
 *     opening = the baseline, inflow = the excess over it, outflow = the shortfall under it (both of the LATEST point), closing = the
 *     proposal carried back to the input's unit (value / scale × baseline) — a conservation set over that stock holds exactly when the
 *     proposal accounts for the observed count within its tolerance, and never lets the closing go negative;
 *   the head's numeric elements (key, value, unit, the head's world cut-off) and its route elements as edges ({from, to}) — topology rules
 *     read the twin's own network.
 */
export function constraintSubjectOf(a: {
  ref: string; key: string; value: number; unit: string; asOf: string; primary: EstimatorDecl; lastRaw: number | null; inputUnit: string | null;
  head: { observedThrough: string | null; elements: Array<{ key: string; value: unknown; unit: string | null }> } | null;
}): { kind: 'run_input'; ref: string; quantities: Array<{ key: string; date: string | null; value: number; unit: string | null }>; edges?: Array<{ from: string; to: string; kind: string }> } {
  const quantities: Array<{ key: string; date: string | null; value: number; unit: string | null }> = [{ key: a.key, date: a.asOf, value: a.value, unit: a.unit }];
  const p = a.primary.parameters;
  if (p.baseline !== undefined && a.lastRaw !== null) {
    const stock = p.balance_stock ?? a.key;
    const scale = p.scale ?? 1;
    const unit = a.inputUnit;
    quantities.push({ key: `${stock}.opening`, date: a.asOf, value: p.baseline, unit },
                    { key: `${stock}.inflow`, date: a.asOf, value: round(Math.max(0, a.lastRaw - p.baseline), 6), unit },
                    { key: `${stock}.outflow`, date: a.asOf, value: round(Math.max(0, p.baseline - a.lastRaw), 6), unit },
                    { key: `${stock}.closing`, date: a.asOf, value: round((a.value / scale) * p.baseline, 6), unit });
  }
  const edges: Array<{ from: string; to: string; kind: string }> = [];
  for (const e of a.head?.elements ?? []) {
    if (e.key === a.key) continue;
    if (typeof e.value === 'number' && Number.isFinite(e.value)) quantities.push({ key: e.key, date: a.head?.observedThrough ?? null, value: e.value, unit: e.unit });
    else if (e.value !== null && typeof e.value === 'object' && typeof (e.value as Record<string, unknown>)['from'] === 'string' && typeof (e.value as Record<string, unknown>)['to'] === 'string') {
      const v = e.value as Record<string, unknown>;
      edges.push({ from: String(v['from']), to: String(v['to']), kind: typeof v['kind'] === 'string' ? String(v['kind']) : 'route' });
    }
  }
  return { kind: 'run_input', ref: a.ref, quantities, ...(edges.length === 0 ? {} : { edges }) };
}

// ── the declaration's intake (the route's; the port validates again) ─────────────────────────────────────────────────
export interface EstimatorIntake {
  twinId: string; key: string; name: string; role: 'primary' | 'challenger'; method: EstimatorMethod; parameters: EstimatorParameters; inputs: EstimatorInput[];
  unit: string; bounds: { min?: number; max?: number }; materiality: number; ambiguity: number; constraintSets: string[]; note: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Every problem in words (an empty list is a valid declaration). */
export function estimatorProblems(m: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof m['twinId'] !== 'string' || !UUID.test(m['twinId'])) out.push('twinId must be a twin id');
  if (typeof m['key'] !== 'string' || !KEY.test(m['key'])) out.push('key must name a twin element (like corridor.capacity_share)');
  if (typeof m['name'] !== 'string' || !/^[a-z][a-z0-9-]{1,60}$/.test(m['name'])) out.push('name must be 2–61 lower-case letters, digits and dashes');
  if (m['role'] !== 'primary' && m['role'] !== 'challenger') out.push('role is primary or challenger');
  if (!(ESTIMATOR_METHODS as readonly unknown[]).includes(m['method'])) out.push(`method is one of ${ESTIMATOR_METHODS.join(', ')}`);
  const p = (m['parameters'] ?? {}) as Record<string, unknown>;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) out.push('parameters is an object');
  else {
    if (p['window'] !== undefined && (!Number.isInteger(p['window']) || (p['window'] as number) < 1 || (p['window'] as number) > 365)) out.push('parameters.window is a whole number of points in [1, 365]');
    if (m['method'] === 'moving_average' && !(Number.isInteger(p['window']) && (p['window'] as number) >= 2)) out.push('a moving average names its window (at least 2 points)');
    if (p['baseline'] !== undefined && !(num(p['baseline']) && p['baseline'] > 0)) out.push('parameters.baseline is a positive number in the input\'s unit');
    if (m['method'] === 'ratio_to_baseline' && p['baseline'] === undefined) out.push('a ratio to baseline names its baseline');
    if (p['scale'] !== undefined && !(num(p['scale']) && p['scale'] > 0)) out.push('parameters.scale is a positive number');
    if (m['method'] === 'kalman_1d' && !(num(p['process_variance']) && p['process_variance'] > 0 && num(p['measurement_variance']) && p['measurement_variance'] > 0)) {
      out.push('a Kalman filter names process_variance and measurement_variance (both > 0)');
    }
  }
  const inputs = m['inputs'];
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 5) out.push('inputs lists 1 to 5 series or elements');
  else inputs.forEach((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    if (r['kind'] === 'series') {
      if (typeof r['series_key'] !== 'string' || r['series_key'].length < 1 || r['series_key'].length > 200) out.push(`inputs[${i}].series_key names a registered series`);
      if (typeof r['unit'] !== 'string' || r['unit'].trim() === '') out.push(`inputs[${i}].unit states the series' unit`);
      if (!(num(r['cadence_days']) && r['cadence_days'] > 0)) out.push(`inputs[${i}].cadence_days is the publication cadence in days (> 0)`);
    } else if (r['kind'] === 'element') {
      if (typeof r['key'] !== 'string' || !KEY.test(r['key'])) out.push(`inputs[${i}].key names a twin element`);
    } else out.push(`inputs[${i}] is { kind: series, … } or { kind: element, … }`);
  });
  if (Array.isArray(inputs) && inputs.length > 0 && (inputs[0] as Record<string, unknown>)?.['kind'] !== 'series' && m['method'] !== 'last_observation') {
    out.push('the first input of this method is a series');
  }
  if (typeof m['unit'] !== 'string' || m['unit'].trim() === '' || m['unit'].length > 40) out.push('unit states the estimated element\'s unit');
  const b = (m['bounds'] ?? {}) as Record<string, unknown>;
  if (typeof b !== 'object' || b === null || (b['min'] !== undefined && !num(b['min'])) || (b['max'] !== undefined && !num(b['max'])) || (num(b['min']) && num(b['max']) && b['min'] > b['max'])) {
    out.push('bounds is { min?, max? } with min ≤ max');
  }
  for (const k of ['materiality', 'ambiguity']) if (!(num(m[k]) && (m[k] as number) > 0 && (m[k] as number) <= 10)) out.push(`${k} is a relative threshold in (0, 10]`);
  const cs = m['constraintSets'];
  if (cs !== undefined && !(Array.isArray(cs) && cs.every((s) => typeof s === 'string' && /^[a-z][a-z0-9-]{2,60}$/.test(s)))) out.push('constraintSets lists constraint set keys');
  if (typeof m['note'] !== 'string' || m['note'].trim().length < 8 || m['note'].length > 2000) out.push('note says why the estimator is declared (8–2000 characters)');
  return out;
}

export function toIntake(m: Record<string, unknown>): EstimatorIntake {
  return { twinId: m['twinId'] as string, key: m['key'] as string, name: m['name'] as string, role: m['role'] as 'primary' | 'challenger', method: m['method'] as EstimatorMethod,
           parameters: (m['parameters'] ?? {}) as EstimatorParameters, inputs: m['inputs'] as EstimatorInput[], unit: (m['unit'] as string).trim(),
           bounds: (m['bounds'] ?? {}) as { min?: number; max?: number }, materiality: m['materiality'] as number, ambiguity: m['ambiguity'] as number,
           constraintSets: (m['constraintSets'] ?? []) as string[], note: (m['note'] as string).trim() };
}

/** The method's text and its digest — the Reconciliation Agent's identity is taken over its scan's text (agent identity rule). */
export const digestOf = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
