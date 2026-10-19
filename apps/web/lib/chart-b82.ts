/**
 * CP-6 B82 §CF (F-P7-E-21: CMP-057…061, VIZ-01/02/03/04/08/09/22/23/24/25/26/36, GLB-07, UX-ADR-015, REL-17) — THE CHART GEOMETRY AND THE
 * GRAMMAR'S KIND RULES as PURE functions (DESIGN D3: no chart library — the components in components/chart.tsx draw hand-written SVG from
 * exactly these numbers; vitest covers them in node, no DOM).
 *
 *  - SCALES AND TICKS: linear scales with "nice" 1 / 2 / 5 × 10ⁿ ticks; time ticks on UTC days, months or years; a DATE is the day it names.
 *  - GAPS ARE GAPS (VIZ-01): a missing value or a missing interval (a step wider than the declared cadence) breaks the line and is drawn
 *    as a gap — a line is never interpolated across what was not observed.
 *  - BANDS, NOT LINES (VIZ-03): a forecast is drawn as its q10–q90 band with the median inside; never a single deterministic line.
 *  - IDENTITY WITHOUT COLOUR (D5): series are told apart by dash pattern, marker shape and direct label; a colour is only ever a token.
 *  - RESIDUALS SHOWN (VIZ-22/23): a waterfall or a variance bridge always draws what its components do not explain.
 *  - NO CAUSAL WORDS ON ASSOCIATION (VIZ-24); NO TRENDLINE WITHOUT A METHOD (VIZ-25); A THRESHOLD IS A RULE, NOT A CERTAINTY (VIZ-26).
 *  - THE TABLE ALTERNATIVE (VIZ-36): every kind's rows are derived here from the same input the drawing uses, so the table mirrors the
 *    drawing exactly; the tooltip text is the table row's text (CMP-059).
 *  - chartGrammar(spec, rows) = §0's assertGrammar (unchanged, first) + the KIND RULES below (additions only — a rule is never relaxed).
 *
 * The number formatting is the canonical English grammar (B80's formatNumber) at a magnitude-based precision; §TS's precision policy
 * (lib/numbers-b82.ts) replaces chartNumber at the fold. CONSTRUCTION only — nothing here is demonstrated or accepted.
 */
import { assertGrammar, type AlternativeColumn, type AlternativeColumnKind, type AlternativeRow, type ChartKind, type ChartSpec, type DashPattern, type MarkerShape } from './b82-seams';
import { formatNumber } from './format-b80';

export const CHART_RULES_VERSION = 'b82-cf-grammar-1';

/* ───────────────────────── numbers and instants ───────────────────────── */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** An instant in ms (UTC); a DATE (YYYY-MM-DD) is the UTC midnight of the day it names; anything else is null (never guessed). */
export function toInstant(v: string | null | undefined): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const s = v.trim();
  if (DATE_ONLY.test(s)) { const [y, m, d] = s.split('-').map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d); }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
/** The UTC day an instant falls on (YYYY-MM-DD). */
export const dayText = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** A number at a magnitude-based precision (the canonical value is kept by the table's own cell; this is the drawing's label). */
export function chartNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'unknown';
  const a = Math.abs(v);
  const digits = a === 0 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return formatNumber(v, { maxFractionDigits: digits }).text;
}
const round2 = (n: number): number => Math.round(n * 100) / 100;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* ───────────────────────── scales and ticks ───────────────────────── */

export type Scale = (v: number) => number;
/** A linear map from a domain to a range; a degenerate domain maps everything to the range's middle (never a division by zero). */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain; const [r0, r1] = range;
  if (!finite(d0) || !finite(d1) || d0 === d1) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}
/** The extent of the finite values, or null when there is none. */
export function extentOf(values: ReadonlyArray<number | null | undefined>): [number, number] | null {
  let lo = Infinity; let hi = -Infinity;
  for (const v of values) if (finite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return lo === Infinity ? null : [lo, hi];
}
/** A "nice" step (1, 2 or 5 × 10ⁿ) for about `count` intervals over [min, max]. */
export function niceStep(min: number, max: number, count = 5): number {
  const span = Math.abs(max - min);
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
/** A nice domain covering [min, max] and its ticks; a single value gets a symmetric pad; `includeZero` extends to 0. */
export function niceDomain(min: number, max: number, o: { count?: number; includeZero?: boolean } = {}): { min: number; max: number; step: number; ticks: number[] } {
  let lo = min; let hi = max;
  if (o.includeZero === true) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi) { const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1; lo -= pad; hi += pad; }
  const step = niceStep(lo, hi, o.count ?? 5);
  const nlo = Math.floor(lo / step + 1e-9) * step; const nhi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = nlo, i = 0; v <= nhi + step / 2 && i < 50; v += step, i += 1) ticks.push(Number(v.toPrecision(12)));
  return { min: nlo, max: nhi, step, ticks };
}
const DAY = 86_400_000;
/** Time ticks in UTC: days for a span under ~4 months, months under ~4 years, years beyond; each labelled as the day / month / year it names. */
export function timeTicks(t0: number, t1: number, max = 6): Array<{ at: number; label: string }> {
  if (!finite(t0) || !finite(t1) || t1 < t0) return [];
  if (t1 === t0) return [{ at: t0, label: dayText(t0) }];
  const span = t1 - t0; const out: Array<{ at: number; label: string }> = [];
  if (span <= 120 * DAY) {
    const steps = [1, 2, 7, 14, 30]; const step = (steps.find((s) => span / (s * DAY) <= max) ?? 30) * DAY;
    const start = Math.ceil(t0 / DAY) * DAY;
    for (let t = start; t <= t1 && out.length < 60; t += step) out.push({ at: t, label: dayText(t) });
  } else if (span <= 4 * 365 * DAY) {
    const months = span / (30 * DAY); const every = [1, 2, 3, 6, 12].find((m) => months / m <= max) ?? 12;
    const d = new Date(t0); let y = d.getUTCFullYear(); let m = d.getUTCMonth() + (d.getUTCDate() === 1 && d.getUTCHours() === 0 ? 0 : 1);
    while (m % every !== 0) m += 1;
    for (let i = 0; i < 60; i += 1) {
      const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1); if (t > t1) break;
      out.push({ at: t, label: new Date(t).toISOString().slice(0, 7) }); m += every;
    }
  } else {
    const years = span / (365 * DAY); const every = [1, 2, 5, 10, 20, 50].find((k) => years / k <= max) ?? 50;
    let y = new Date(t0).getUTCFullYear() + 1; while (y % every !== 0) y += 1;
    for (let i = 0; i < 60; i += 1) { const t = Date.UTC(y, 0, 1); if (t > t1) break; out.push({ at: t, label: String(y) }); y += every; }
  }
  return out;
}

/* ───────────────────────── the plot box ───────────────────────── */

export interface Box { width: number; height: number; top: number; right: number; bottom: number; left: number; innerWidth: number; innerHeight: number }
/** The drawing's coordinate box (the viewBox; the SVG scales to its container — no fixed pixel width reaches the page). */
export function plotBox(width = 640, height = 260, m: Partial<Pick<Box, 'top' | 'right' | 'bottom' | 'left'>> = {}): Box {
  const top = m.top ?? 16; const right = m.right ?? 24; const bottom = m.bottom ?? 40; const left = m.left ?? 64;
  return { width, height, top, right, bottom, left, innerWidth: Math.max(1, width - left - right), innerHeight: Math.max(1, height - top - bottom) };
}

/* ───────────────────────── paths, gaps, bands ───────────────────────── */

export interface XY { x: number; y: number }
/** One SVG path of several runs (each run its own `M`): a gap between runs is never bridged. */
export function pathOf(runs: ReadonlyArray<ReadonlyArray<XY>>): string {
  return runs.filter((r) => r.length > 0).map((r) => r.map((p, i) => `${i === 0 ? 'M' : 'L'}${round2(p.x)} ${round2(p.y)}`).join(' ')).join(' ');
}
/** A step path (the value holds until the next point) of several runs — for an ordinal state over time. */
export function stepPathOf(runs: ReadonlyArray<ReadonlyArray<XY>>, endX?: number): string {
  return runs.filter((r) => r.length > 0).map((r, ri, all) => {
    const parts: string[] = [`M${round2(r[0]!.x)} ${round2(r[0]!.y)}`];
    for (let i = 1; i < r.length; i += 1) parts.push(`H${round2(r[i]!.x)}`, `V${round2(r[i]!.y)}`);
    if (endX !== undefined && ri === all.length - 1) parts.push(`H${round2(endX)}`);
    return parts.join(' ');
  }).join(' ');
}
export type GapReason = 'missing_value' | 'missing_interval';
export interface Gap { from: number; to: number; reason: GapReason }
export interface TimedValue { t: number; v: number | null }
/**
 * Split a time-ordered series into RUNS of observed values and the GAPS between them. A null value is a missing value (the gap spans its
 * neighbours); with a declared cadence, two observed points further apart than 1.5 cadences leave a missing interval. Pure, total.
 */
export function runsAndGaps(points: ReadonlyArray<TimedValue>, cadenceMs: number | null): { runs: TimedValue[][]; gaps: Gap[] } {
  const pts = points.filter((p) => finite(p.t)).slice().sort((a, b) => a.t - b.t);
  const runs: TimedValue[][] = []; const gaps: Gap[] = [];
  let cur: TimedValue[] = []; let lastObserved: TimedValue | null = null; let pendingMissing: number | null = null;
  for (const p of pts) {
    if (!finite(p.v)) { if (pendingMissing === null) pendingMissing = p.t; if (cur.length > 0) { runs.push(cur); cur = []; } continue; }
    if (lastObserved !== null) {
      if (pendingMissing !== null) gaps.push({ from: lastObserved.t, to: p.t, reason: 'missing_value' });
      else if (cadenceMs !== null && cadenceMs > 0 && p.t - lastObserved.t > cadenceMs * 1.5) {
        if (cur.length > 0) { runs.push(cur); cur = []; }
        gaps.push({ from: lastObserved.t, to: p.t, reason: 'missing_interval' });
      }
    } else if (pendingMissing !== null) gaps.push({ from: pendingMissing, to: p.t, reason: 'missing_value' });
    pendingMissing = null;
    cur.push(p); lastObserved = p;
  }
  if (cur.length > 0) runs.push(cur);
  if (pendingMissing !== null && lastObserved !== null) gaps.push({ from: lastObserved.t, to: pts[pts.length - 1]!.t, reason: 'missing_value' });
  return { runs, gaps };
}
/** The OBSERVED cadence of a series: the median step between consecutive distinct times (ms), null under 3 points — a page that has no
 *  declared cadence states this one as its rule ("the median step"), so a missing interval is still drawn as a gap. */
export function medianStepMs(times: ReadonlyArray<string>): number | null {
  const t = [...new Set(times.map((x) => toInstant(x)).filter((x): x is number => x !== null))].sort((a, b) => a - b);
  if (t.length < 3) return null;
  const d = t.slice(1).map((x, i) => x - t[i]!).sort((a, b) => a - b);
  return d[Math.floor((d.length - 1) / 2)]!;
}
/** A closed band polygon (the upper edge forward, the lower edge back) per run; a run of one point is a vertical interval. */
export function bandPath(runs: ReadonlyArray<ReadonlyArray<{ x: number; lo: number; hi: number }>>): string {
  return runs.filter((r) => r.length > 0).map((r) => {
    if (r.length === 1) { const p = r[0]!; return `M${round2(p.x - 3)} ${round2(p.hi)} H${round2(p.x + 3)} V${round2(p.lo)} H${round2(p.x - 3)} Z`; }
    const up = r.map((p, i) => `${i === 0 ? 'M' : 'L'}${round2(p.x)} ${round2(p.hi)}`).join(' ');
    const down = [...r].reverse().map((p) => `L${round2(p.x)} ${round2(p.lo)}`).join(' ');
    return `${up} ${down} Z`;
  }).join(' ');
}

/* ───────────────────────── identity without colour (D5) ───────────────────────── */

/** The SVG stroke-dasharray of each dash pattern (solid: none). */
export const DASH_ARRAY: Readonly<Record<DashPattern, string | null>> = { solid: null, dashed: '6 4', dotted: '1.5 3', 'dash-dot': '8 3 1.5 3' };
/** The SVG path of a marker centred on (cx, cy) with radius r (≥ 4 → an 8 px mark). 'none' is an empty path. */
export function markerPath(shape: MarkerShape, cx: number, cy: number, r = 4): string {
  const x = round2(cx); const y = round2(cy); const k = round2(r);
  switch (shape) {
    case 'circle': return `M${round2(cx - r)} ${y} a${k} ${k} 0 1 0 ${round2(2 * r)} 0 a${k} ${k} 0 1 0 ${round2(-2 * r)} 0 Z`;
    case 'square': return `M${round2(cx - r)} ${round2(cy - r)} h${round2(2 * r)} v${round2(2 * r)} h${round2(-2 * r)} Z`;
    case 'triangle': return `M${x} ${round2(cy - r * 1.15)} L${round2(cx + r * 1.1)} ${round2(cy + r * 0.85)} L${round2(cx - r * 1.1)} ${round2(cy + r * 0.85)} Z`;
    case 'diamond': return `M${x} ${round2(cy - r * 1.25)} L${round2(cx + r * 1.25)} ${y} L${x} ${round2(cy + r * 1.25)} L${round2(cx - r * 1.25)} ${y} Z`;
    case 'cross': return `M${round2(cx - r)} ${round2(cy - r)} L${round2(cx + r)} ${round2(cy + r)} M${round2(cx + r)} ${round2(cy - r)} L${round2(cx - r)} ${round2(cy + r)}`;
    default: return '';
  }
}
/** A legend's identities in a fixed order for N series (never cycled past the set: a 7th series reuses nothing — it is refused by the grammar). */
export const SERIES_IDENTITIES: ReadonlyArray<{ dash: DashPattern; marker: MarkerShape }> = [
  { dash: 'solid', marker: 'circle' }, { dash: 'dashed', marker: 'square' }, { dash: 'dotted', marker: 'triangle' },
  { dash: 'dash-dot', marker: 'diamond' }, { dash: 'solid', marker: 'cross' }, { dash: 'dashed', marker: 'triangle' },
];

/* ───────────────────────── the keyboard path and the tooltip (CMP-059) ───────────────────────── */

/** The next focused point for a key (Arrow keys move one, Home / End to the ends; RTL mirrors left / right); null: not a point key. */
export function nextPointIndex(current: number, key: string, count: number, dir: 'ltr' | 'rtl' = 'ltr'): number | null {
  if (count <= 0) return null;
  const c = Math.min(Math.max(0, current), count - 1);
  const fwd = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'; const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  if (key === fwd || key === 'ArrowDown') return Math.min(count - 1, c + 1);
  if (key === back || key === 'ArrowUp') return Math.max(0, c - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
/** A table cell as text: unknown reads "unknown"; a number keeps its unit; a DATE is the day it names; an instant is stated in UTC. */
export function cellText(v: string | number | null | undefined, c: Pick<AlternativeColumn, 'kind' | 'unit'>): string {
  if (v === null || v === undefined || v === '') return 'unknown';
  if (c.kind === 'number') { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? `${chartNumber(n)}${c.unit ? ` ${c.unit}` : ''}` : String(v); }
  if (c.kind === 'date') return String(v).slice(0, 10);
  if (c.kind === 'instant') { const t = toInstant(String(v)); return t === null ? String(v) : `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`; }
  return String(v);
}
/** The tooltip's lines — EXACTLY the table row's cells, in the table's column order (the tooltip mirrors the row, CMP-059). */
export function rowLines(row: AlternativeRow, columns: ReadonlyArray<AlternativeColumn>): Array<{ label: string; value: string }> {
  return columns.map((c) => ({ label: c.label, value: cellText(row[c.key], c) }));
}
/** The row as one sentence (a point's accessible name). */
export const rowText = (row: AlternativeRow, columns: ReadonlyArray<AlternativeColumn>): string => rowLines(row, columns).map((l) => `${l.label}: ${l.value}`).join('; ');

/** Direct labels at the series' ends, pushed apart so no two are closer than `gap` (deterministic: sorted by y, then spread within bounds). */
export function spreadLabels(items: ReadonlyArray<{ key: string; y: number }>, gap: number, top: number, bottom: number): Map<string, number> {
  const s = items.slice().sort((a, b) => a.y - b.y || a.key.localeCompare(b.key)).map((x) => ({ ...x }));
  for (let i = 1; i < s.length; i += 1) if (s[i]!.y - s[i - 1]!.y < gap) s[i]!.y = s[i - 1]!.y + gap;
  const over = s.length === 0 ? 0 : s[s.length - 1]!.y - bottom;
  if (over > 0) for (const x of s) x.y -= over;
  for (let i = 0; i < s.length; i += 1) if (s[i]!.y < top + i * gap) s[i]!.y = top + i * gap;
  return new Map(s.map((x) => [x.key, round2(x.y)]));
}

/* ───────────────────────── TIME SERIES (CMP-060, VIZ-01) ───────────────────────── */

export interface SeriesIn { key: string; label: string; points: ReadonlyArray<{ at: string; value: number | null; /** what the record says of this point (a reason, a state) — a table column */ note?: string | null }> }
export const TIME_SERIES_COLUMNS = (unit: string, time: 'date' | 'instant' = 'date', levels = false, note: string | null = null): AlternativeColumn[] => [
  { key: 'series', label: 'Series', kind: 'text' }, { key: 'at', label: 'Time', kind: time },
  levels ? { key: 'value', label: 'State', kind: 'state' } : { key: 'value', label: 'Value', kind: 'number', unit },
  ...(note === null ? [] : [{ key: 'note', label: note, kind: 'text' as const }]),
];
/** The alternative's rows: one per (series, point), in time order; a missing value is a row with "unknown" (never dropped). */
export function timeSeriesRows(series: ReadonlyArray<SeriesIn>, levels?: ReadonlyArray<string>): AlternativeRow[] {
  const out: AlternativeRow[] = [];
  for (const s of series) {
    const pts = s.points.map((p) => ({ p, t: toInstant(p.at) })).filter((x) => x.t !== null).sort((a, b) => a.t! - b.t!);
    for (const { p } of pts) out.push({ series: s.label, at: p.at, value: p.value === null ? null : levels !== undefined ? (levels[p.value] ?? null) : p.value, ...(p.note === undefined ? {} : { note: p.note }) });
  }
  return out;
}
export interface TimeSeriesGeometry {
  box: Box; xTicks: Array<{ x: number; label: string }>; yTicks: Array<{ y: number; label: string }>;
  series: Array<{ key: string; d: string; points: Array<{ x: number; y: number; row: number }>; label: { x: number; y: number } | null }>;
  gaps: Array<{ x0: number; x1: number; reason: GapReason }>; empty: boolean;
}
/**
 * The time series' geometry: a shared time axis and one value axis (never two — one measure per chart); gaps drawn as gaps; `levels` makes
 * an ORDINAL series (a state over time, drawn as steps, its ticks the state words). `row` indexes timeSeriesRows' output.
 */
export function timeSeriesGeometry(series: ReadonlyArray<SeriesIn>, o: { cadenceMs?: number | null; levels?: ReadonlyArray<string>; includeZero?: boolean; box?: Box } = {}): TimeSeriesGeometry {
  const box = o.box ?? (series.length > 1 ? plotBox(640, 260, { right: 112 }) : plotBox());
  const all = series.flatMap((s) => s.points.map((p) => ({ t: toInstant(p.at), v: p.value })));
  const tx = extentOf(all.map((p) => p.t)); const vy = o.levels !== undefined ? [0, Math.max(0, o.levels.length - 1)] as [number, number] : extentOf(all.map((p) => p.v));
  if (tx === null || vy === null) return { box, xTicks: [], yTicks: [], series: series.map((s) => ({ key: s.key, d: '', points: [], label: null })), gaps: [], empty: true };
  const yd = o.levels !== undefined ? { min: vy[0] - 0.5, max: vy[1] + 0.5, ticks: o.levels.map((_, i) => i) } : niceDomain(vy[0], vy[1], { includeZero: o.includeZero ?? false });
  const x = linearScale(tx, [box.left, box.left + box.innerWidth]); const y = linearScale([yd.min, yd.max], [box.top + box.innerHeight, box.top]);
  let row = 0; const gaps: TimeSeriesGeometry['gaps'] = [];
  const out = series.map((s) => {
    const sorted = s.points.map((p) => ({ t: toInstant(p.at), v: p.value })).filter((p): p is TimedValue => p.t !== null).sort((a, b) => a.t - b.t);
    const { runs, gaps: g } = runsAndGaps(sorted, o.cadenceMs ?? null);
    for (const gap of g) gaps.push({ x0: round2(x(gap.from)), x1: round2(x(gap.to)), reason: gap.reason });
    const pts: Array<{ x: number; y: number; row: number }> = [];
    for (const p of sorted) { if (finite(p.v)) pts.push({ x: round2(x(p.t)), y: round2(y(p.v)), row }); row += 1; }
    const xyRuns = runs.map((r) => r.map((p) => ({ x: x(p.t), y: y(p.v as number) })));
    const last = pts[pts.length - 1];
    return { key: s.key, d: o.levels !== undefined ? stepPathOf(xyRuns) : pathOf(xyRuns), points: pts, label: last === undefined ? null : { x: last.x, y: last.y } };
  });
  /* direct labels in the right margin, at their series' last value, spread so they never overlap */
  const spread = spreadLabels(out.filter((s) => s.label !== null).map((s) => ({ key: s.key, y: s.label!.y + 4 })), 14, box.top + 8, box.top + box.innerHeight);
  for (const s of out) if (s.label !== null) s.label = { x: round2(box.left + box.innerWidth + 6), y: spread.get(s.key) ?? s.label.y };
  return {
    box, gaps, empty: false, series: out,
    xTicks: timeTicks(tx[0], tx[1]).map((t) => ({ x: round2(x(t.at)), label: t.label })),
    yTicks: yd.ticks.map((v) => ({ y: round2(y(v)), label: o.levels !== undefined ? (o.levels[v] ?? '') : chartNumber(v) })),
  };
}

/* ───────────────────────── EVENT TIMELINE (VIZ-02) ───────────────────────── */

export interface TimelineEventIn { key: string; at: string | null; label: string; actor: string | null; source: string | null; correction: string | null; recordedAt?: string | null }
export const EVENT_TIMELINE_COLUMNS = (time: 'date' | 'instant' = 'instant'): AlternativeColumn[] => [
  { key: 'at', label: 'Time', kind: time }, { key: 'event', label: 'Event', kind: 'text' }, { key: 'actor', label: 'Actor', kind: 'text' },
  { key: 'source', label: 'Source', kind: 'text' }, { key: 'correction', label: 'Correction', kind: 'text' }, { key: 'recorded', label: 'Recorded', kind: 'instant' },
];
/** The rows in time order; an event with no time on the chart's basis is listed LAST with its time "unknown" (not placed, never dropped). */
export function eventTimelineRows(events: ReadonlyArray<TimelineEventIn>): AlternativeRow[] {
  const placed = events.filter((e) => toInstant(e.at) !== null).slice().sort((a, b) => toInstant(a.at)! - toInstant(b.at)! || a.key.localeCompare(b.key));
  const unplaced = events.filter((e) => toInstant(e.at) === null);
  return [...placed, ...unplaced].map((e) => ({ at: e.at, event: e.label, actor: e.actor ?? null, source: e.source ?? null, correction: e.correction ?? 'none recorded', recorded: e.recordedAt ?? null }));
}
/** Event marks on one time axis, stacked into lanes so no two marks are closer than `minGap` px in a lane (deterministic, greedy). */
export function eventTimelineGeometry(events: ReadonlyArray<TimelineEventIn>, o: { box?: Box; minGap?: number; maxLanes?: number } = {}): {
  box: Box; xTicks: Array<{ x: number; label: string }>; marks: Array<{ key: string; x: number; lane: number; y: number; row: number; corrected: boolean }>; lanes: number; unplaced: number;
} {
  const placed = events.filter((e) => toInstant(e.at) !== null).slice().sort((a, b) => toInstant(a.at)! - toInstant(b.at)! || a.key.localeCompare(b.key));
  const minGap = o.minGap ?? 14; const maxLanes = Math.max(1, o.maxLanes ?? 6);
  const ts = extentOf(placed.map((e) => toInstant(e.at)));
  const lanesUsed = Math.max(1, Math.min(maxLanes, placed.length));
  const box = o.box ?? plotBox(640, 64 + lanesUsed * 22, { left: 16, right: 16, top: 12, bottom: 36 });
  if (ts === null) return { box, xTicks: [], marks: [], lanes: 0, unplaced: events.length };
  const x = linearScale(ts[0] === ts[1] ? [ts[0] - DAY, ts[1] + DAY] : ts, [box.left + 8, box.left + box.innerWidth - 8]);
  const laneEnd: number[] = [];
  const marks = placed.map((e, i) => {
    const px = x(toInstant(e.at)!);
    let lane = laneEnd.findIndex((end) => px - end >= minGap);
    if (lane < 0) lane = laneEnd.length < maxLanes ? laneEnd.length : laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[lane] = px;
    return { key: e.key, x: round2(px), lane, y: 0, row: i, corrected: e.correction !== null && e.correction !== '' };
  });
  const lanes = Math.max(1, laneEnd.length);
  const laneH = box.innerHeight / lanes;
  for (const m of marks) m.y = round2(box.top + laneH * (m.lane + 0.5));
  const t0 = ts[0] === ts[1] ? ts[0] - DAY : ts[0]; const t1 = ts[0] === ts[1] ? ts[1] + DAY : ts[1];
  return { box, marks, lanes, unplaced: events.length - placed.length, xTicks: timeTicks(t0, t1).map((t) => ({ x: round2(x(t.at)), label: t.label })) };
}

/* ───────────────────────── PROBABILITY BAND (CMP-061, VIZ-03) ───────────────────────── */

export interface BandPointIn { at: string; q10: number | null; q50: number | null; q90: number | null }
export const PROBABILITY_BAND_COLUMNS = (unit: string, time: 'date' | 'instant' = 'date'): AlternativeColumn[] => [
  { key: 'at', label: 'Target time', kind: time }, { key: 'q10', label: 'Lower (q10)', kind: 'number', unit },
  { key: 'q50', label: 'Median (q50)', kind: 'number', unit }, { key: 'q90', label: 'Upper (q90)', kind: 'number', unit },
];
/** A forecast path's points from its origin: step n is `origin + n × stepDays` (a forecast's path is stepped in days from its origin). */
export function pathPoints(originDay: string, path: ReadonlyArray<{ step: number; q10: number; q50: number; q90: number }>, stepDays = 1): BandPointIn[] {
  const o = toInstant(originDay);
  if (o === null) return [];
  return path.slice().sort((a, b) => a.step - b.step).map((p) => ({ at: dayText(o + p.step * stepDays * DAY), q10: finite(p.q10) ? p.q10 : null, q50: finite(p.q50) ? p.q50 : null, q90: finite(p.q90) ? p.q90 : null }));
}
export const probabilityBandRows = (points: ReadonlyArray<BandPointIn>): AlternativeRow[] =>
  points.filter((p) => toInstant(p.at) !== null).slice().sort((a, b) => toInstant(a.at)! - toInstant(b.at)!).map((p) => ({ at: p.at, q10: p.q10, q50: p.q50, q90: p.q90 }));
/** The band (q10–q90), the median line and the cutoff mark; a missing quantile breaks the band (a gap, never interpolated). */
export function probabilityBandGeometry(points: ReadonlyArray<BandPointIn>, o: { cutoff?: string | null; box?: Box; includeZero?: boolean } = {}): {
  box: Box; band: string; median: string; medianPoints: Array<{ x: number; y: number; row: number }>; cutoffX: number | null;
  xTicks: Array<{ x: number; label: string }>; yTicks: Array<{ y: number; label: string }>; empty: boolean; gaps: number;
} {
  const box = o.box ?? plotBox();
  const rows = points.filter((p) => toInstant(p.at) !== null).slice().sort((a, b) => toInstant(a.at)! - toInstant(b.at)!);
  const cut = toInstant(o.cutoff ?? null);
  const tx = extentOf([...rows.map((p) => toInstant(p.at)), cut]); const vy = extentOf(rows.flatMap((p) => [p.q10, p.q50, p.q90]));
  if (tx === null || vy === null || rows.length === 0) return { box, band: '', median: '', medianPoints: [], cutoffX: null, xTicks: [], yTicks: [], empty: true, gaps: 0 };
  const t = tx[0] === tx[1] ? [tx[0] - DAY, tx[1] + DAY] as [number, number] : tx;
  const yd = niceDomain(vy[0], vy[1], { includeZero: o.includeZero ?? false });
  const x = linearScale(t, [box.left, box.left + box.innerWidth]); const y = linearScale([yd.min, yd.max], [box.top + box.innerHeight, box.top]);
  const bandRuns: Array<Array<{ x: number; lo: number; hi: number }>> = [[]]; const medRuns: XY[][] = [[]]; const medianPoints: Array<{ x: number; y: number; row: number }> = [];
  let gaps = 0;
  rows.forEach((p, i) => {
    const px = x(toInstant(p.at)!);
    if (finite(p.q10) && finite(p.q90)) bandRuns[bandRuns.length - 1]!.push({ x: px, lo: y(p.q10), hi: y(p.q90) });
    else if (bandRuns[bandRuns.length - 1]!.length > 0) { bandRuns.push([]); gaps += 1; }
    if (finite(p.q50)) { medRuns[medRuns.length - 1]!.push({ x: px, y: y(p.q50) }); medianPoints.push({ x: round2(px), y: round2(y(p.q50)), row: i }); }
    else if (medRuns[medRuns.length - 1]!.length > 0) medRuns.push([]);
  });
  return {
    box, band: bandPath(bandRuns), median: pathOf(medRuns), medianPoints, cutoffX: cut === null ? null : round2(x(cut)), empty: false, gaps,
    xTicks: timeTicks(t[0], t[1]).map((k) => ({ x: round2(x(k.at)), label: k.label })), yTicks: yd.ticks.map((v) => ({ y: round2(y(v)), label: chartNumber(v) })),
  };
}

/* ───────────────────────── HORIZON MATRIX (VIZ-04) ───────────────────────── */

/** The six canonical horizons (0029: prediction.forecasts_current.horizon_code). */
export const CANONICAL_HORIZONS = ['30d', '90d', '180d', '1y', '3y', '5y'] as const;
export interface HorizonRowIn {
  horizon: string; target: string | null; q10: number | null; q50: number | null; q90: number | null; unit: string | null;
  method: string | null; score: string | null; use: string | null;
}
export const HORIZON_MATRIX_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'horizon', label: 'Horizon', kind: 'text' }, { key: 'target', label: 'Target', kind: 'text' },
  { key: 'q10', label: 'Lower (q10)', kind: 'number', unit }, { key: 'q50', label: 'Median (q50)', kind: 'number', unit }, { key: 'q90', label: 'Upper (q90)', kind: 'number', unit },
  { key: 'unit', label: 'Unit of the row', kind: 'text' }, { key: 'method', label: 'Method', kind: 'text' }, { key: 'score', label: 'Score', kind: 'text' }, { key: 'use', label: 'Permitted use', kind: 'text' },
];
/** Every canonical horizon gets a row, in canonical order (a horizon with nothing is stated as nothing — never hidden); extra horizons follow. */
export function horizonMatrixRows(rows: ReadonlyArray<HorizonRowIn>): AlternativeRow[] {
  const by = new Map(rows.map((r) => [r.horizon, r]));
  const order = [...CANONICAL_HORIZONS, ...rows.map((r) => r.horizon).filter((h) => !(CANONICAL_HORIZONS as readonly string[]).includes(h))];
  return order.map((h) => {
    const r = by.get(h);
    return r === undefined
      ? { horizon: h, target: null, q10: null, q50: null, q90: null, unit: null, method: null, score: 'nothing issued at this horizon', use: null }
      : { horizon: h, target: r.target, q10: r.q10, q50: r.q50, q90: r.q90, unit: r.unit, method: r.method, score: r.score, use: r.use };
  });
}
/** ONE DECLARED SCALE PER ROW (horizons are never compared on a hidden shared scale): each row's own nice domain and the band's x positions. */
export function horizonRowScale(r: Pick<HorizonRowIn, 'q10' | 'q50' | 'q90'>, width: number): { ticks: Array<{ x: number; label: string }>; lo: number | null; mid: number | null; hi: number | null } {
  const e = extentOf([r.q10, r.q50, r.q90]);
  if (e === null) return { ticks: [], lo: null, mid: null, hi: null };
  const d = niceDomain(e[0], e[1], { count: 2 });
  const x = linearScale([d.min, d.max], [4, width - 4]);
  return { ticks: [d.min, d.max].map((v) => ({ x: round2(x(v)), label: chartNumber(v) })), lo: finite(r.q10) ? round2(x(r.q10)) : null, mid: finite(r.q50) ? round2(x(r.q50)) : null, hi: finite(r.q90) ? round2(x(r.q90)) : null };
}

/* ───────────────────────── DISTRIBUTION (VIZ-08) ───────────────────────── */

/** The p-quantile of SORTED values by linear interpolation between order statistics (type 7); null for an empty sample. */
export function quantile(sorted: ReadonlyArray<number>, p: number): number | null {
  if (sorted.length === 0 || !(p >= 0 && p <= 1)) return null;
  const h = (sorted.length - 1) * p; const lo = Math.floor(h); const hi = Math.ceil(h);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (h - lo);
}
export interface Bin { from: number; to: number; count: number }
/**
 * A histogram over DECLARED bins: explicit edges, or `count` equal bins over the sample's range (the method is stated by the caller). The last
 * bin is closed on the right; values outside the edges are counted apart (never dropped silently). Never smoothed (VIZ-08).
 */
export function histogram(values: ReadonlyArray<number>, bins: { edges: ReadonlyArray<number> } | { count: number }): { bins: Bin[]; outside: number; n: number } {
  const v = values.filter(finite);
  let edges: number[];
  if ('edges' in bins) edges = [...bins.edges].filter(finite).sort((a, b) => a - b);
  else {
    const e = extentOf(v); const k = Math.max(1, Math.floor(bins.count));
    if (e === null) return { bins: [], outside: 0, n: 0 };
    const [lo, hi] = e[0] === e[1] ? [e[0] - 0.5, e[1] + 0.5] : e;
    edges = Array.from({ length: k + 1 }, (_, i) => lo + ((hi - lo) * i) / k);
  }
  if (edges.length < 2) return { bins: [], outside: v.length, n: v.length };
  const out: Bin[] = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1]!, count: 0 }));
  let outside = 0;
  for (const x of v) {
    const i = out.findIndex((b, j) => x >= b.from && (x < b.to || (j === out.length - 1 && x === b.to)));
    if (i < 0) outside += 1; else out[i]!.count += 1;
  }
  return { bins: out, outside, n: v.length };
}
export const DISTRIBUTION_BIN_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'from', label: 'From (inclusive)', kind: 'number', unit }, { key: 'to', label: 'To', kind: 'number', unit }, { key: 'count', label: 'Count', kind: 'number', unit: 'count' },
];
export const distributionBinRows = (bins: ReadonlyArray<Bin>): AlternativeRow[] => bins.map((b) => ({ from: b.from, to: b.to, count: b.count }));
export interface PercentileItemIn { key: string; label: string; p10: number | null; p50: number | null; p90: number | null; note?: string | null }
export const DISTRIBUTION_PERCENTILE_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'item', label: 'Distribution', kind: 'text' }, { key: 'p10', label: '10th percentile', kind: 'number', unit },
  { key: 'p50', label: 'Median', kind: 'number', unit }, { key: 'p90', label: '90th percentile', kind: 'number', unit }, { key: 'note', label: 'Note', kind: 'text' },
];
export const distributionPercentileRows = (items: ReadonlyArray<PercentileItemIn>): AlternativeRow[] =>
  items.map((i) => ({ item: i.label, p10: i.p10, p50: i.p50, p90: i.p90, note: i.note ?? null }));
/** Bars of a histogram on a value axis that starts at zero (a count axis is never truncated). */
export function histogramGeometry(bins: ReadonlyArray<Bin>, o: { box?: Box; marks?: ReadonlyArray<{ key: string; label: string; at: number }> } = {}): {
  box: Box; bars: Array<{ x: number; y: number; w: number; h: number; row: number }>; xTicks: Array<{ x: number; label: string }>; yTicks: Array<{ y: number; label: string }>;
  marks: Array<{ key: string; label: string; x: number }>; empty: boolean;
} {
  const box = o.box ?? plotBox();
  if (bins.length === 0) return { box, bars: [], xTicks: [], yTicks: [], marks: [], empty: true };
  const xd = extentOf([...bins.flatMap((b) => [b.from, b.to]), ...(o.marks ?? []).map((m) => m.at)])!;
  const yd = niceDomain(0, Math.max(1, ...bins.map((b) => b.count)), { includeZero: true, count: 4 });
  const x = linearScale(xd, [box.left, box.left + box.innerWidth]); const y = linearScale([0, yd.max], [box.top + box.innerHeight, box.top]);
  const xt = niceDomain(xd[0], xd[1], { count: 5 }).ticks.filter((v) => v >= xd[0] && v <= xd[1]);
  return {
    box, empty: false,
    bars: bins.map((b, i) => { const x0 = x(b.from); const x1 = x(b.to); return { x: round2(x0 + 1), y: round2(y(b.count)), w: round2(Math.max(1, x1 - x0 - 2)), h: round2(y(0) - y(b.count)), row: i }; }),
    xTicks: xt.map((v) => ({ x: round2(x(v)), label: chartNumber(v) })), yTicks: yd.ticks.map((v) => ({ y: round2(y(v)), label: chartNumber(v) })),
    marks: (o.marks ?? []).filter((m) => finite(m.at)).map((m) => ({ key: m.key, label: m.label, x: round2(x(m.at)) })),
  };
}
/** Interval strips (p10–p90 with the median) of several distributions on ONE shared value axis (one unit). */
export function percentileGeometry(items: ReadonlyArray<PercentileItemIn>, o: { box?: Box } = {}): {
  box: Box; strips: Array<{ key: string; y: number; lo: number | null; mid: number | null; hi: number | null; row: number }>; xTicks: Array<{ x: number; label: string }>; empty: boolean;
} {
  const box = o.box ?? plotBox(640, 40 + Math.max(1, items.length) * 28, { left: 16, right: 24, top: 8, bottom: 32 });
  const e = extentOf(items.flatMap((i) => [i.p10, i.p50, i.p90]));
  if (e === null) return { box, strips: [], xTicks: [], empty: true };
  const d = niceDomain(e[0], e[1]);
  const x = linearScale([d.min, d.max], [box.left, box.left + box.innerWidth]);
  const rowH = box.innerHeight / Math.max(1, items.length);
  return {
    box, empty: false, xTicks: d.ticks.map((v) => ({ x: round2(x(v)), label: chartNumber(v) })),
    strips: items.map((i, n) => ({ key: i.key, y: round2(box.top + rowH * (n + 0.5)), lo: finite(i.p10) ? round2(x(i.p10)) : null, mid: finite(i.p50) ? round2(x(i.p50)) : null, hi: finite(i.p90) ? round2(x(i.p90)) : null, row: n })),
  };
}

/* ───────────────────────── CALIBRATION PLOT (VIZ-09) ───────────────────────── */

/** The Wilson score interval of k successes in n trials at the z of the stated confidence (0.95 → 1.96); null for n = 0. */
export function wilson(k: number, n: number, confidence = 0.95): [number, number] | null {
  if (!(n > 0) || !finite(k)) return null;
  const z = confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : confidence >= 0.9 ? 1.645 : 1.282;
  const p = Math.min(1, Math.max(0, k / n)); const z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n); const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
export interface CalibrationPointIn { key: string; label: string; group: string; nominal: number; observed: number | null; n: number; period: string | null; /** further columns the page's table carried (pinball, targets met …) */ extra?: Readonly<Record<string, string | number | null>> }
export const CALIBRATION_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'family', label: 'Family', kind: 'text' }, { key: 'group', label: 'Method', kind: 'text' }, { key: 'nominal', label: 'Nominal coverage', kind: 'number', unit },
  { key: 'observed', label: 'Observed coverage', kind: 'number', unit }, { key: 'lo', label: 'Interval low (95 %)', kind: 'number', unit }, { key: 'hi', label: 'Interval high (95 %)', kind: 'number', unit },
  { key: 'n', label: 'Sample (outcomes)', kind: 'number', unit: 'count' }, { key: 'period', label: 'Period', kind: 'text' },
];
export function calibrationRows(points: ReadonlyArray<CalibrationPointIn>): AlternativeRow[] {
  return points.map((p) => {
    const w0 = p.observed === null ? null : wilson(Math.round(p.observed * p.n), p.n);
    const w = w0 === null ? null : ([Number(w0[0].toFixed(4)), Number(w0[1].toFixed(4))] as const);   /* a derived statistic, shown to 4 decimals */
    return { family: p.label, group: p.group, nominal: p.nominal, observed: p.observed, lo: w === null ? null : w[0], hi: w === null ? null : w[1], n: p.n, period: p.period, ...(p.extra ?? {}) };
  });
}
/**
 * The reliability geometry on [0, 1] × [0, 1]: `diagonal` (x = nominal; the line of perfect calibration) or `category` (one column per family,
 * the nominal drawn as each column's reference mark) — the latter when every point shares one nominal level. Each point carries its interval.
 */
export function calibrationGeometry(points: ReadonlyArray<CalibrationPointIn>, o: { layout?: 'diagonal' | 'category'; box?: Box } = {}): {
  box: Box; layout: 'diagonal' | 'category'; points: Array<{ key: string; group: string; x: number; y: number | null; lo: number | null; hi: number | null; ref: number; row: number }>;
  yTicks: Array<{ y: number; label: string }>; xTicks: Array<{ x: number; label: string }>; diagonal: string | null; empty: boolean;
} {
  const box = o.box ?? plotBox(640, 280);
  const layout = o.layout ?? (new Set(points.map((p) => p.nominal)).size <= 1 && points.length > 1 ? 'category' : 'diagonal');
  const y = linearScale([0, 1], [box.top + box.innerHeight, box.top]);
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const rows = calibrationRows(points);
  if (points.length === 0) return { box, layout, points: [], yTicks: ticks.map((v) => ({ y: round2(y(v)), label: chartNumber(v) })), xTicks: [], diagonal: null, empty: true };
  const x = layout === 'diagonal' ? linearScale([0, 1], [box.left, box.left + box.innerWidth]) : (i: number) => box.left + (box.innerWidth * (i + 0.5)) / points.length;
  return {
    box, layout, empty: false, yTicks: ticks.map((v) => ({ y: round2(y(v)), label: chartNumber(v) })),
    xTicks: layout === 'diagonal' ? ticks.map((v) => ({ x: round2(x(v)), label: chartNumber(v) })) : points.map((p, i) => ({ x: round2(x(i)), label: p.label })),
    diagonal: layout === 'diagonal' ? `M${round2(x(0))} ${round2(y(0))} L${round2(x(1))} ${round2(y(1))}` : null,
    points: points.map((p, i) => {
      const r = rows[i]!; const px = layout === 'diagonal' ? x(p.nominal) : x(i);
      return { key: p.key, group: p.group, x: round2(px), y: p.observed === null ? null : round2(y(p.observed)), lo: r['lo'] === null ? null : round2(y(r['lo'] as number)),
               hi: r['hi'] === null ? null : round2(y(r['hi'] as number)), ref: round2(y(p.nominal)), row: i };
    }),
  };
}

/* ───────────────────────── WATERFALL AND VARIANCE BRIDGE (VIZ-22, VIZ-23) ───────────────────────── */

export type StepKind = 'start' | 'increase' | 'decrease' | 'residual' | 'end';
export interface BridgeStep { key: string; label: string; kind: StepKind; delta: number | null; from: number; to: number; source: string | null }
/**
 * The steps from a start to an end: the start, each signed component in the order given, the RESIDUAL (end − start − Σ components — always
 * a step, even at 0, stated as "fully attributed"), the end. A component with an unknown delta is kept and counted in the residual.
 */
export function bridgeSteps(start: { label: string; value: number }, components: ReadonlyArray<{ key: string; label: string; delta: number | null; source?: string | null }>,
  end: { label: string; value: number }, residualLabel = 'Residual (not attributed to a component)'): BridgeStep[] {
  const out: BridgeStep[] = [{ key: 'start', label: start.label, kind: 'start', delta: null, from: 0, to: start.value, source: null }];
  let level = start.value;
  for (const c of components) {
    if (!finite(c.delta)) { out.push({ key: c.key, label: c.label, kind: 'increase', delta: null, from: level, to: level, source: c.source ?? null }); continue; }
    out.push({ key: c.key, label: c.label, kind: c.delta >= 0 ? 'increase' : 'decrease', delta: c.delta, from: level, to: level + c.delta, source: c.source ?? null });
    level += c.delta;
  }
  const residual = Number((end.value - level).toPrecision(12));
  out.push({ key: 'residual', label: residualLabel, kind: 'residual', delta: residual, from: level, to: end.value, source: null });
  out.push({ key: 'end', label: end.label, kind: 'end', delta: null, from: 0, to: end.value, source: null });
  return out;
}
export const BRIDGE_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'step', label: 'Step', kind: 'text' }, { key: 'kind', label: 'Kind', kind: 'state' }, { key: 'delta', label: 'Change', kind: 'number', unit },
  { key: 'level', label: 'Level after the step', kind: 'number', unit }, { key: 'source', label: 'Source', kind: 'text' },
];
export const bridgeRows = (steps: ReadonlyArray<BridgeStep>): AlternativeRow[] => steps.map((s) => ({
  step: s.label, kind: s.kind === 'residual' ? (s.delta === 0 ? 'residual — fully attributed' : 'residual') : s.kind, delta: s.delta, level: s.to, source: s.source,
}));
/** Bars for the steps (start / end from zero; components float from the running level); the value axis includes zero. */
export function bridgeGeometry(steps: ReadonlyArray<BridgeStep>, o: { box?: Box } = {}): {
  box: Box; bars: Array<{ key: string; kind: StepKind; x: number; y: number; w: number; h: number; row: number; zero: boolean }>; connectors: string; yTicks: Array<{ y: number; label: string }>;
  zeroY: number; empty: boolean;
} {
  const box = o.box ?? plotBox(640, 280, { bottom: 24 });
  if (steps.length === 0) return { box, bars: [], connectors: '', yTicks: [], zeroY: box.top + box.innerHeight, empty: true };
  const e = extentOf(steps.flatMap((s) => [s.from, s.to]))!;
  const d = niceDomain(e[0], e[1], { includeZero: true });
  const y = linearScale([d.min, d.max], [box.top + box.innerHeight, box.top]);
  const slot = box.innerWidth / steps.length; const w = Math.max(4, slot * 0.6);
  const bars = steps.map((s, i) => {
    const x0 = box.left + slot * i + (slot - w) / 2; const a = y(s.from); const b = y(s.to);
    return { key: s.key, kind: s.kind, x: round2(x0), y: round2(Math.min(a, b)), w: round2(w), h: round2(Math.max(1, Math.abs(a - b))), row: i, zero: s.from === s.to };
  });
  const connectors = steps.slice(0, -1).map((s, i) => { const yy = round2(y(s.to)); const xa = bars[i]!.x + bars[i]!.w; const xb = bars[i + 1]!.x; return `M${round2(xa)} ${yy} H${round2(xb)}`; }).join(' ');
  return { box, bars, connectors, zeroY: round2(y(0)), empty: false, yTicks: d.ticks.map((v) => ({ y: round2(y(v)), label: chartNumber(v) })) };
}

/* ───────────────────────── CORRELATION MATRIX (VIZ-24) ───────────────────────── */

/** Causal words a chart of ASSOCIATION never uses (VIZ-24) — matched as words, case-insensitive. */
export const CAUSAL_WORDS: readonly string[] = ['cause', 'causes', 'caused', 'causing', 'causal', 'causation', 'drives', 'driven by', 'driver of', 'leads to', 'results in', 'resulting in', 'because of', 'due to', 'effect of', 'impact of', 'determines', 'produces'];
export function causalWordsIn(text: string | null | undefined): string[] {
  if (typeof text !== 'string') return [];
  const t = text.toLowerCase();
  return CAUSAL_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}([^a-z]|$)`).test(t));
}
export interface CorrelationCellIn { a: string; b: string; coefficient: number | null; relation: string | null; n: number | null; basis: string | null; kind: string | null }
export const CORRELATION_COLUMNS = (unit: string): AlternativeColumn[] => [
  { key: 'a', label: 'Variable A', kind: 'text' }, { key: 'b', label: 'Variable B', kind: 'text' }, { key: 'relation', label: 'Relation', kind: 'text' },
  { key: 'coefficient', label: 'Coefficient', kind: 'number', unit }, { key: 'n', label: 'Sample', kind: 'number', unit: 'count' }, { key: 'kind', label: 'How it was set', kind: 'text' }, { key: 'basis', label: 'Basis', kind: 'text' },
];
/**
 * The matrix: the variables in the order given, the upper triangle's cells keyed by the unordered pair (the latest entry for a pair wins —
 * the caller passes them oldest first); a pair with nothing is MISSING (stated, never 0). Rows: one per declared pair, then the missing pairs.
 */
export function correlationMatrix(vars: ReadonlyArray<{ key: string; label: string }>, cells: ReadonlyArray<CorrelationCellIn>): {
  cells: Array<{ i: number; j: number; cell: CorrelationCellIn | null }>; rows: AlternativeRow[]; missing: number; pairs: number;
} {
  const idx = new Map(vars.map((v, i) => [v.key, i]));
  const by = new Map<string, CorrelationCellIn>();
  for (const c of cells) { const i = idx.get(c.a); const j = idx.get(c.b); if (i === undefined || j === undefined || i === j) continue; by.set(i < j ? `${i}|${j}` : `${j}|${i}`, c); }
  const out: Array<{ i: number; j: number; cell: CorrelationCellIn | null }> = []; const rows: AlternativeRow[] = []; const miss: AlternativeRow[] = [];
  for (let i = 0; i < vars.length; i += 1) for (let j = i + 1; j < vars.length; j += 1) {
    const c = by.get(`${i}|${j}`) ?? null; out.push({ i, j, cell: c });
    const r = { a: vars[i]!.label, b: vars[j]!.label, relation: c?.relation ?? (c === null ? 'missing — nothing declared' : null), coefficient: c?.coefficient ?? null, n: c?.n ?? null, kind: c?.kind ?? null, basis: c?.basis ?? null };
    (c === null ? miss : rows).push(r);
  }
  return { cells: out, rows: [...rows, ...miss], missing: miss.length, pairs: out.length };
}

/* ───────────────────────── SCATTER (VIZ-25) ───────────────────────── */

export interface ScatterPointIn { key: string; label: string | null; x: number | null; y: number | null; group: string }
export const SCATTER_COLUMNS = (xLabel: string, xUnit: string, yLabel: string, yUnit: string): AlternativeColumn[] => [
  { key: 'point', label: 'Point', kind: 'text' }, { key: 'group', label: 'Group', kind: 'text' },
  { key: 'x', label: xLabel, kind: 'number', unit: xUnit }, { key: 'y', label: yLabel, kind: 'number', unit: yUnit },
];
export const scatterRows = (pts: ReadonlyArray<ScatterPointIn>): AlternativeRow[] => pts.map((p) => ({ point: p.label ?? p.key, group: p.group, x: p.x, y: p.y }));
/** Ordinary least squares of y on x — the ONLY fit the scatter draws, and only when the page names it as the method; null under 3 points or no x spread. */
export function olsFit(pts: ReadonlyArray<{ x: number | null; y: number | null }>): { slope: number; intercept: number; n: number; r2: number } | null {
  const p = pts.filter((q): q is { x: number; y: number } => finite(q.x) && finite(q.y));
  if (p.length < 3) return null;
  const mx = p.reduce((s, q) => s + q.x, 0) / p.length; const my = p.reduce((s, q) => s + q.y, 0) / p.length;
  const sxx = p.reduce((s, q) => s + (q.x - mx) ** 2, 0); const sxy = p.reduce((s, q) => s + (q.x - mx) * (q.y - my), 0); const syy = p.reduce((s, q) => s + (q.y - my) ** 2, 0);
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, n: p.length, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}
export type ScatterLine = { kind: 'identity'; label: string } | { kind: 'fit'; method: 'ols'; label: string };
/** Points on two linear axes; an optional REFERENCE line (y = x, declared as a reference, not a fit) or the OLS fit (its method named). */
export function scatterGeometry(pts: ReadonlyArray<ScatterPointIn>, o: { box?: Box; line?: ScatterLine | null; sameScale?: boolean } = {}): {
  box: Box; points: Array<{ key: string; group: string; x: number; y: number; row: number }>; line: string | null; fit: ReturnType<typeof olsFit>;
  xTicks: Array<{ x: number; label: string }>; yTicks: Array<{ y: number; label: string }>; dropped: number; empty: boolean;
} {
  const box = o.box ?? plotBox(560, 320);
  const ok = pts.map((p, row) => ({ p, row })).filter(({ p }) => finite(p.x) && finite(p.y));
  const ex = extentOf(ok.map(({ p }) => p.x)); const ey = extentOf(ok.map(({ p }) => p.y));
  if (ex === null || ey === null) return { box, points: [], line: null, fit: null, xTicks: [], yTicks: [], dropped: pts.length, empty: true };
  const same = o.sameScale === true || o.line?.kind === 'identity';
  const xd = niceDomain(same ? Math.min(ex[0], ey[0]) : ex[0], same ? Math.max(ex[1], ey[1]) : ex[1]);
  const yd = same ? xd : niceDomain(ey[0], ey[1]);
  const x = linearScale([xd.min, xd.max], [box.left, box.left + box.innerWidth]); const y = linearScale([yd.min, yd.max], [box.top + box.innerHeight, box.top]);
  const fit = o.line?.kind === 'fit' ? olsFit(ok.map(({ p }) => p)) : null;
  let line: string | null = null;
  if (o.line?.kind === 'identity') { const lo = Math.max(xd.min, yd.min); const hi = Math.min(xd.max, yd.max); line = `M${round2(x(lo))} ${round2(y(lo))} L${round2(x(hi))} ${round2(y(hi))}`; }
  else if (fit !== null) line = `M${round2(x(xd.min))} ${round2(y(fit.intercept + fit.slope * xd.min))} L${round2(x(xd.max))} ${round2(y(fit.intercept + fit.slope * xd.max))}`;
  return {
    box, fit, line, dropped: pts.length - ok.length, empty: false,
    points: ok.map(({ p, row }) => ({ key: p.key, group: p.group, x: round2(x(p.x as number)), y: round2(y(p.y as number)), row })),
    xTicks: xd.ticks.map((v) => ({ x: round2(x(v)), label: chartNumber(v) })), yTicks: yd.ticks.map((v) => ({ y: round2(y(v)), label: chartNumber(v) })),
  };
}

/* ───────────────────────── CONTROL CHART (VIZ-26) ───────────────────────── */

export type Comparator = '>' | '>=' | '<' | '<=';
export interface ControlLimitIn { key: string; label: string; value: number; comparator: Comparator; basis: string; kind: 'rule' | 'statistical' }
/** The sample mean and the (n − 1) standard deviation; null under 2 values. */
export function meanSigma(values: ReadonlyArray<number | null>): { mean: number; sigma: number; n: number } | null {
  const v = values.filter(finite);
  if (v.length < 2) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return { mean, sigma: Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1)), n: v.length };
}
export const meets = (v: number, c: Comparator, t: number): boolean => (c === '>' ? v > t : c === '>=' ? v >= t : c === '<' ? v < t : v <= t);
export const CONTROL_COLUMNS = (unit: string, time: 'date' | 'instant' = 'date'): AlternativeColumn[] => [
  { key: 'at', label: 'Time', kind: time }, { key: 'value', label: 'Value', kind: 'number', unit }, { key: 'rules', label: 'Rules this point meets', kind: 'text' },
];
/** The rows: each point with the rules it MEETS (words: "meets <rule>" — a rule met is a signal to look, never a certainty). */
export function controlRows(points: ReadonlyArray<{ at: string; value: number | null }>, limits: ReadonlyArray<ControlLimitIn>): AlternativeRow[] {
  return points.filter((p) => toInstant(p.at) !== null).slice().sort((a, b) => toInstant(a.at)! - toInstant(b.at)!).map((p) => {
    const met = finite(p.value) ? limits.filter((l) => meets(p.value as number, l.comparator, l.value)).map((l) => l.label) : [];
    return { at: p.at, value: p.value, rules: finite(p.value) ? (met.length === 0 ? 'none' : met.join('; ')) : 'unknown — no value' };
  });
}

/* ───────────────────────── THE GRAMMAR'S KIND RULES (additions to §0's assertGrammar) ───────────────────────── */

const TIME_ORDERED: readonly ChartKind[] = ['time_series', 'event_timeline', 'control_chart'];
const QUANTIFIED: readonly string[] = ['band', 'interval', 'distribution'];
const definitionTerms = (s: ChartSpec): string[] => (Array.isArray(s.alternative?.definitions) ? s.alternative.definitions : []).map((d) => String(d?.term ?? '').toLowerCase());
/**
 * THE GRAMMAR (UX-ADR-015): §0's assertGrammar first, unchanged; then the kind rules (each `<field>: <problem>`); then, when rows are given,
 * the rows against the columns. Pure; never throws.
 *  time            a time-ordered kind (time series, event timeline, control chart) declares event, observation, valid or record time;
 *                  a horizon matrix declares the forecast horizon
 *  uncertainty     a probability band or a horizon matrix quantifies its uncertainty (band, interval or distribution) — never a single
 *                  deterministic line (VIZ-03); a distribution never states "not applicable"
 *  definitions     a correlation matrix defines its method, its sample and its missingness (VIZ-24); a calibration plot its method and its
 *                  period (VIZ-09); a control chart its baseline and its rules (VIZ-26)
 *  language        a correlation matrix uses no causal word in its title, basis, summary, uncertainty or definitions (VIZ-24)
 *  rows            each row names only declared columns; a number column's cell is a finite number or null (unknown)
 */
export function chartGrammar(spec: ChartSpec, rows?: ReadonlyArray<AlternativeRow>): string[] {
  const out = assertGrammar(spec);
  try {
    const s = (spec ?? {}) as Partial<ChartSpec>;
    const kind = s.kind as ChartKind | undefined;
    const basis = s.time?.basis;
    if (kind !== undefined && TIME_ORDERED.includes(kind) && basis !== undefined && !['event', 'observation', 'valid', 'record'].includes(basis)) out.push(`time: a ${kind.replace(/_/g, ' ')} is ordered by time — it declares event, observation, valid or record time, not "${basis}"`);
    if (kind === 'horizon_matrix' && basis !== undefined && basis !== 'horizon') out.push('time: a horizon matrix declares the forecast horizon as its time basis');
    const uk = s.uncertainty?.kind;
    if ((kind === 'probability_band' || kind === 'horizon_matrix') && uk !== undefined && !QUANTIFIED.includes(uk)) out.push('uncertainty: a probability band quantifies its uncertainty (band, interval or distribution) — never a single deterministic line');
    if (kind === 'distribution' && uk === 'not_applicable') out.push('uncertainty: a distribution is uncertainty — "not applicable" is not its statement');
    const terms = definitionTerms(s as ChartSpec);
    const need = (what: string[], label: string) => { for (const w of what) if (!terms.some((t) => t.startsWith(w))) out.push(`definitions: a ${label} defines its ${w}`); };
    if (kind === 'correlation_matrix') {
      need(['method', 'sample', 'missing'], 'correlation matrix');
      const texts = [s.title, s.basis, s.alternative?.summary, s.uncertainty?.statement, ...(s.alternative?.definitions ?? []).map((d) => d?.definition)];
      const found = [...new Set(texts.flatMap((t) => causalWordsIn(t as string | undefined)))];
      if (found.length > 0) out.push(`language: a correlation matrix shows association — it uses no causal word (${found.join(', ')})`);
    }
    if (kind === 'calibration_plot') need(['method', 'period'], 'calibration plot');
    if (kind === 'control_chart') need(['baseline', 'rule'], 'control chart');
    if (rows !== undefined && Array.isArray(s.alternative?.columns)) {
      const cols = new Map(s.alternative.columns.map((c) => [String(c?.key), c?.kind as AlternativeColumnKind]));
      rows.forEach((r, i) => {
        for (const [k, v] of Object.entries(r ?? {})) {
          if (!cols.has(k)) { out.push(`rows: row ${i + 1} names "${k}", which the alternative's columns do not declare`); continue; }
          if (cols.get(k) === 'number' && v !== null && !(typeof v === 'number' && Number.isFinite(v))) out.push(`rows: row ${i + 1}'s "${k}" is not a number (a number column holds a number or unknown)`);
        }
      });
    }
  } catch { out.push('spec: unreadable'); }
  return out;
}
