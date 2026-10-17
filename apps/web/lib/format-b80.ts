/**
 * B80 §TK (F-P7-E-03: UX-18-001…005) — NUMBERS, UNITS, INSTANTS AND LONG VALUES as pure functions (the text roles of components/text.tsx
 * render exactly these). A number is formatted with Intl for the ACTIVE locale, tabular in its role, its UNIT KEPT (never converted or
 * dropped) and its CANONICAL value kept for copying (copy fidelity: a copy is the canonical value, never the display text); an extreme or
 * non-finite value is stated, never rounded into a plausible one; an instant shows its time zone explicitly; a DATE renders as the day it
 * names; a long identifier or digest is shortened in the MIDDLE with the full value always accessible and copied in full. The localisation
 * corpus (locale negotiation, bidi corpora) is B85's.
 */

export interface FormattedNumber { text: string; canonical: string; unit: string | null; state: 'value' | 'not_a_number' | 'infinite'; note: string | null }

/** Format a number for the locale; `fractionDigits` fixes the precision shown (the canonical keeps every digit given). */
export function formatNumber(value: number | string | null | undefined, o: { locale?: string; unit?: string | null; fractionDigits?: number; maxFractionDigits?: number } = {}): FormattedNumber {
  const unit = o.unit === undefined || o.unit === null || o.unit.trim() === '' ? null : o.unit.trim();
  const canonical = value === null || value === undefined ? '' : String(value).trim();
  const n = typeof value === 'number' ? value : Number(canonical);
  if (canonical === '' || Number.isNaN(n)) return { text: '—', canonical, unit, state: 'not_a_number', note: canonical === '' ? 'no value was given' : `"${canonical}" is not a number` };
  if (!Number.isFinite(n)) return { text: n > 0 ? '+∞' : '−∞', canonical, unit, state: 'infinite', note: 'an infinite value — stated, never rounded into a plausible one' };
  const digits = o.fractionDigits;
  const fmt = new Intl.NumberFormat(o.locale ?? 'en', digits === undefined
    ? { maximumFractionDigits: o.maxFractionDigits ?? 6, useGrouping: true }
    : { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true });
  const rounded = digits !== undefined && Number(n.toFixed(digits)) !== n;
  return { text: fmt.format(n), canonical, unit, state: 'value', note: rounded ? `shown to ${digits} decimal place${digits === 1 ? '' : 's'}; the exact value is ${canonical}` : null };
}

/** The copy of a value: its canonical text with its unit — never the formatted display. */
export function copyText(f: Pick<FormattedNumber, 'canonical' | 'unit'>): string { return f.unit === null ? f.canonical : `${f.canonical} ${f.unit}`; }

export interface Shortened { shown: string; full: string; truncated: boolean }
/** MIDDLE ellipsis (UX-18-005): the start and the end of a long identifier stay visible; the full value is the accessible name and the copy. */
export function middleEllipsis(value: string, max = 24): Shortened {
  const full = value;
  const chars = Array.from(full);
  if (chars.length <= max || max < 7) return { shown: full, full, truncated: false };
  const keep = max - 1; const head = Math.ceil(keep / 2); const tail = Math.floor(keep / 2);
  return { shown: `${chars.slice(0, head).join('')}…${chars.slice(chars.length - tail).join('')}`, full, truncated: true };
}

/** An INSTANT with its time zone stated (UTC unless the caller names one); a DATE (YYYY-MM-DD) renders as the day it names, never shifted. */
export function formatInstant(value: string | null | undefined, o: { locale?: string; timeZone?: string } = {}): { text: string; canonical: string; zone: string | null } {
  if (value === null || value === undefined || value.trim() === '') return { text: '—', canonical: '', zone: null };
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { text: v, canonical: v, zone: null };
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return { text: v, canonical: v, zone: null };
  const zone = o.timeZone ?? 'UTC';
  const text = new Intl.DateTimeFormat(o.locale ?? 'en', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: zone }).format(new Date(t));
  return { text: `${text} ${zone}`, canonical: new Date(t).toISOString(), zone };
}

export type StatementRole = 'fact' | 'recommendation' | 'decision';
/** UX-18-004: the three statement roles — their class and the words that keep them apart (a recommendation is never styled or worded as a
 *  fact or an approval; a decision names its actor). */
export function statementView(role: StatementRole, actor?: string | null): { className: string; prefix: string | null; problem: string | null } {
  if (role === 'recommendation') return { className: 'eye-text-recommendation', prefix: 'RECOMMENDED — advisory, not a decision', problem: null };
  if (role === 'decision') {
    const who = actor === undefined || actor === null || actor.trim() === '' ? null : actor.trim();
    return { className: 'eye-text-decision', prefix: who === null ? null : `DECIDED by ${who}`, problem: who === null ? 'a decision names its actor — without one it is not shown as decided' : null };
  }
  return { className: 'eye-text-fact', prefix: null, problem: null };
}
