/**
 * CP-6 B80 §CL-D (F-P7-E-05: CMP-051…056, PAT-28) — HIGH-DENSITY INSPECTION as pure functions: Metric, StatisticalSummary, ComparisonMatrix,
 * DiffViewer and the empty-state statement. Every function WORDS a value it was given; none infers one:
 *  - a metric carries its basis, its time and its uncertainty; an unknown value is UNKNOWN (never 0, never a dash that reads as zero);
 *  - a summary states n and what it could not compute (spread needs n ≥ 2, quartiles n ≥ 4); missing values are counted, not dropped silently;
 *  - a comparison compares only on a COMMON BASIS — a criterion whose cells differ in basis or unit is flagged and never ranked; a missing cell
 *    is "not assessed"; dissent is shown with the value, not behind it;
 *  - a diff aligns field by field with the provenance and authority of BOTH sides; an unchanged field is counted when hidden;
 *  - an empty state names the scope, the evidence status, the permission and a safe next step — it never implies a zero world.
 *
 * Numbers are formatted with Intl for the active locale (B85 owns the locale corpus); tabular numerals are the token's (§TK).
 */
import { jcsCanonicalize } from './jcs';

export type ValueState = 'measured' | 'estimated' | 'unknown' | 'not_applicable' | 'withheld';
export interface MetricInput {
  label: string;
  value: number | null;
  unit?: string | null;
  state: ValueState;
  basis: string | null;
  asOf: string | null;
  uncertainty?: { low: number; high: number; level?: string } | { text: string } | null;
  locale?: string;
  digits?: number;
}
export interface MetricText { value: string; unit: string; basis: string; asOf: string; uncertainty: string; state: string; ariaLabel: string }
export function fmtNumber(n: number, locale = 'en', digits?: number): string {
  return new Intl.NumberFormat(locale, digits === undefined ? { maximumFractionDigits: 6 } : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}
const STATE_WORD: Record<ValueState, string> = { measured: 'MEASURED', estimated: 'ESTIMATED', unknown: 'UNKNOWN', not_applicable: 'NOT APPLICABLE', withheld: 'WITHHELD' };
export function metricText(m: MetricInput): MetricText {
  const loc = m.locale ?? 'en';
  const known = m.value !== null && Number.isFinite(m.value) && (m.state === 'measured' || m.state === 'estimated');
  const value = known ? fmtNumber(m.value as number, loc, m.digits) : STATE_WORD[m.state === 'measured' || m.state === 'estimated' ? 'unknown' : m.state];
  const u = m.uncertainty ?? null;
  const uncertainty = u === null ? 'uncertainty not stated'
    : 'text' in u ? u.text
    : `${fmtNumber(u.low, loc, m.digits)} – ${fmtNumber(u.high, loc, m.digits)}${u.level !== undefined ? ` (${u.level})` : ''}`;
  const basis = m.basis === null || m.basis.trim() === '' ? 'basis not stated' : m.basis;
  const asOf = m.asOf === null ? 'time not stated' : m.asOf;
  const unit = m.unit ?? '';
  const state = known ? STATE_WORD[m.state] : value;
  return { value, unit, basis, asOf, uncertainty, state, ariaLabel: `${m.label}: ${value}${known && unit !== '' ? ` ${unit}` : ''}, ${state.toLowerCase()}, ${basis}, as of ${asOf}, ${uncertainty}` };
}

/* ───────────────────────── statistical summary ───────────────────────── */

export interface Summary { n: number; missing: number; min: number | null; q1: number | null; median: number | null; mean: number | null; q3: number | null; max: number | null; sd: number | null; notes: string[] }
/** Quantile by linear interpolation between closest ranks (type 7). */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const h = (sorted.length - 1) * p; const lo = Math.floor(h); const hi = Math.ceil(h);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}
export function summarize(values: ReadonlyArray<number | null | undefined>): Summary {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  const missing = values.length - xs.length;
  const notes: string[] = [];
  if (missing > 0) notes.push(`${missing} value(s) missing — counted, not imputed`);
  if (xs.length === 0) { notes.push('no value to summarise'); return { n: 0, missing, min: null, q1: null, median: null, mean: null, q3: null, max: null, sd: null, notes }; }
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = xs.length >= 2 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)) : null;
  if (sd === null) notes.push('spread not computed (n < 2)');
  const quart = xs.length >= 4;
  if (!quart) notes.push('quartiles not computed (n < 4)');
  return { n: xs.length, missing, min: xs[0]!, q1: quart ? quantile(xs, 0.25) : null, median: quantile(xs, 0.5), mean, q3: quart ? quantile(xs, 0.75) : null, max: xs[xs.length - 1]!, sd, notes };
}

/* ───────────────────────── comparison matrix ───────────────────────── */

export interface MatrixCell { value: number | string | null; basis?: string | null; unit?: string | null; uncertainty?: string | null; dissent?: string | null }
export interface Criterion { key: string; label: string; better?: 'higher' | 'lower' | null }
export interface MatrixCellView { text: string; uncertainty: string; dissent: string | null; best: boolean; assessed: boolean }
export interface MatrixView { rows: Array<{ criterion: Criterion; common: boolean; basisNote: string; cells: Record<string, MatrixCellView> }> }
/**
 * Build the matrix view. A criterion is on a COMMON BASIS only when every assessed cell names the same basis and unit; only then — and only
 * when the criterion declares which direction is better and every cell is numeric — is a best cell marked. Otherwise nothing is ranked.
 */
export function comparisonView(options: ReadonlyArray<{ id: string }>, criteria: readonly Criterion[], cells: Record<string, Record<string, MatrixCell | undefined>>, locale = 'en'): MatrixView {
  return {
    rows: criteria.map((c) => {
      const present = options.map((o) => ({ id: o.id, cell: cells[o.id]?.[c.key] })).filter((x) => x.cell !== undefined && x.cell.value !== null) as Array<{ id: string; cell: MatrixCell }>;
      const bases = new Set(present.map((x) => `${x.cell.basis ?? '∅'}|${x.cell.unit ?? '∅'}`));
      const common = present.length > 0 && bases.size === 1;
      const numeric = present.every((x) => typeof x.cell.value === 'number');
      let bestId: string | null = null;
      if (common && numeric && c.better !== undefined && c.better !== null && present.length > 1) {
        const vals = present.map((x) => x.cell.value as number);
        const target = c.better === 'higher' ? Math.max(...vals) : Math.min(...vals);
        const winners = present.filter((x) => x.cell.value === target);
        bestId = winners.length === 1 ? winners[0]!.id : null; // a tie marks no single best
      }
      const view: Record<string, MatrixCellView> = {};
      for (const o of options) {
        const cell = cells[o.id]?.[c.key];
        if (cell === undefined || cell.value === null) { view[o.id] = { text: 'not assessed', uncertainty: '', dissent: cell?.dissent ?? null, best: false, assessed: false }; continue; }
        const v = typeof cell.value === 'number' ? fmtNumber(cell.value, locale) : cell.value;
        view[o.id] = { text: `${v}${cell.unit ? ` ${cell.unit}` : ''}`, uncertainty: cell.uncertainty ?? 'uncertainty not stated', dissent: cell.dissent ?? null, best: o.id === bestId, assessed: true };
      }
      const basisNote = present.length === 0 ? 'no option assessed' : common ? `common basis: ${present[0]!.cell.basis ?? 'not stated'}` : 'NOT ON A COMMON BASIS — the cells use different bases or units; not ranked';
      return { criterion: c, common, basisNote, cells: view };
    }),
  };
}

/* ───────────────────────── diff ───────────────────────── */

export type ChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';
export interface DiffRow { key: string; label: string; before: string; after: string; kind: ChangeKind }
const show = (v: unknown): string => (v === undefined ? '' : v === null ? 'null' : typeof v === 'string' ? v : jcsCanonicalize(v));
/** Align two records field by field (the declared fields first, in their order; then any other key, sorted). Equality is canonical (JCS). */
export function diffRecords(before: Record<string, unknown> | null, after: Record<string, unknown> | null, fields: ReadonlyArray<{ key: string; label: string }> = []): DiffRow[] {
  const b = before ?? {}; const a = after ?? {};
  const declared = fields.map((f) => f.key);
  const others = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !declared.includes(k)).sort();
  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  return [...declared, ...others].map((k) => {
    const inB = Object.prototype.hasOwnProperty.call(b, k); const inA = Object.prototype.hasOwnProperty.call(a, k);
    const kind: ChangeKind = !inB && inA ? 'added' : inB && !inA ? 'removed' : !inB && !inA ? 'unchanged' : jcsCanonicalize(b[k] ?? null) === jcsCanonicalize(a[k] ?? null) ? 'unchanged' : 'changed';
    return { key: k, label: labelOf(k), before: inB ? show(b[k]) : '—', after: inA ? show(a[k]) : '—', kind };
  });
}
export function diffCounts(rows: readonly DiffRow[]): Record<ChangeKind, number> {
  const c: Record<ChangeKind, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const r of rows) c[r.kind] += 1;
  return c;
}
export const CHANGE_MARK: Record<ChangeKind, { glyph: string; word: string }> = {
  added: { glyph: '+', word: 'ADDED' }, removed: { glyph: '−', word: 'REMOVED' }, changed: { glyph: '±', word: 'CHANGED' }, unchanged: { glyph: '=', word: 'UNCHANGED' },
};

/* ───────────────────────── the empty state (PAT-28) ───────────────────────── */

export interface EmptyInput { scope: string; evidence: 'none_recorded' | 'not_collected' | 'filtered_out' | 'unknown'; permission: 'full' | 'partial' | 'none'; nextStep: string | null; hiddenByFilter?: number }
/** What an empty view says: what was searched, what is known about the evidence, what the principal may see, and a safe next step. */
export function emptyStatement(e: EmptyInput): string[] {
  const evidence = {
    none_recorded: 'No record is held for this scope.',
    not_collected: 'Nothing has been collected for this scope yet — absence of records is not absence of events.',
    filtered_out: `Records exist but the current filter hides ${e.hiddenByFilter ?? 'all'} of them.`,
    unknown: 'Whether records exist is UNKNOWN — the read did not complete.',
  }[e.evidence];
  const permission = { full: 'You can see every record in this scope.', partial: 'Some records in this scope may be outside what you are authorized to see.', none: 'You are not authorized to see records in this scope.' }[e.permission];
  return [`Scope: ${e.scope}.`, evidence, permission, e.nextStep === null ? 'No action is available here.' : `Next: ${e.nextStep}`];
}
