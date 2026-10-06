/**
 * CP-6 B91 §LE — THE LEDGER'S PURE RULES (no database, no clock: every instant is passed in). They are the specification the migration's
 * ports implement (0105 §LE: cle-variance@1, cle-anomaly@1, cle-boundary@1, cle-reconcile@1, the pricing in commercial.ledger_tick); the
 * unit tests pin them and the ledger harness proves the database's figures equal them.
 *
 *   rateInForce      the rate-card version in force at an instant: the latest effective_from at or before it (none → UNPRICED, never zero)
 *   priceUsage       usage × the rate in force at occurred_at; a domain usage is one DIRECT line, a tenant-level usage is ALLOCATED by the
 *                    key in force (one line per share, weights summing to 1) or kept UNALLOCATED
 *   periodBounds     the calendar month / quarter / year (UTC) containing an instant
 *   variance         spent − amount; pct; the linear run-rate forecast to period end (spent ÷ elapsed fraction)
 *   thresholdsReached the declared percentages a pct has reached
 *   anomaly          today's spend > k × the mean daily spend of the previous window_days days (the mean > 0; otherwise no baseline)
 *   energyEstimate   kWh = Σ quantity × coefficient — an ESTIMATE; lines with no coefficient are counted, never zero
 *   boundaryCheck    an optimisation's changes against the protected and adjustable control vocabularies
 *   reconcile        invoice lines against ledger totals per dimension, with the differences
 */

export const DIMENSIONS = ['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const PERIOD_KINDS = ['month', 'quarter', 'year'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/** The controls an optimisation may adjust, and the protected ones it may never change (0105 §LE cle_adjustable_controls / cle_protected_controls). */
export const ADJUSTABLE_CONTROLS = ['compute_schedule', 'batch_window', 'cache_tier', 'index_tier', 'instance_size', 'reservation', 'model_choice', 'sampling_rate', 'storage_compression', 'chunk_pace'] as const;
export const PROTECTED_CONTROLS = ['residency', 'region', 'isolation', 'tenancy', 'retention', 'recovery', 'backup', 'rpo', 'rto', 'sovereignty', 'provenance', 'audit', 'evidence',
  'human_authority', 'accessibility', 'quality', 'freshness', 'durability', 'resilience', 'replication', 'encryption'] as const;

const ms = (t: Date | string): number => (t instanceof Date ? t.getTime() : new Date(t).getTime());

export interface RateVersion { version: number; effectiveFrom: Date | string; pricePerUnit: number; currency: string; energyKwhPerUnit: number | null }
export function rateInForce<R extends RateVersion>(versions: readonly R[], at: Date | string): R | null {
  let best: R | null = null;
  for (const v of versions) {
    if (ms(v.effectiveFrom) <= ms(at) && (best === null || ms(v.effectiveFrom) > ms(best.effectiveFrom))) best = v;
  }
  return best;
}

export interface Share { domainId: string; productId?: string | null; consumerPrincipalId?: string | null; weight: number }
export interface AllocationVersion { version: number; effectiveFrom: Date | string; shares: Share[] }
export interface Usage { quantity: number; domainId: string | null; occurredAt: Date | string }
export interface PricedLine {
  line: number; domainId: string | null; productId: string | null; consumerPrincipalId: string | null; quantity: number; share: number;
  allocation: 'direct' | 'allocated' | 'unallocated'; allocationVersion: number | null; rateVersion: number; pricePerUnit: number; currency: string; amount: number; energyKwh: number | null;
}
export type Pricing = { priced: false; reason: string } | { priced: true; rate: RateVersion; lines: PricedLine[] };

/** The weights of an allocation sum to 1 (to 1e-9) and each is in (0, 1]: otherwise the allocation is unreliable and refused. */
export function allocationValid(shares: readonly Share[]): { ok: boolean; sum: number } {
  const sum = shares.reduce((a, s) => a + s.weight, 0);
  return { ok: shares.length >= 1 && shares.every((s) => s.weight > 0 && s.weight <= 1) && Math.abs(sum - 1) <= 1e-9, sum };
}

export function priceUsage(u: Usage, rates: readonly RateVersion[], allocations: readonly AllocationVersion[] = []): Pricing {
  const rate = rateInForce(rates, u.occurredAt);
  if (rate === null) return { priced: false, reason: 'no rate in force at occurred_at' };
  const line = (n: number, domainId: string | null, share: number, allocation: PricedLine['allocation'], allocationVersion: number | null, s?: Share): PricedLine => {
    const quantity = u.quantity * share;
    return { line: n, domainId, productId: s?.productId ?? null, consumerPrincipalId: s?.consumerPrincipalId ?? null, quantity, share, allocation, allocationVersion,
      rateVersion: rate.version, pricePerUnit: rate.pricePerUnit, currency: rate.currency, amount: quantity * rate.pricePerUnit,
      energyKwh: rate.energyKwhPerUnit === null ? null : quantity * rate.energyKwhPerUnit };
  };
  if (u.domainId !== null) return { priced: true, rate, lines: [line(0, u.domainId, 1, 'direct', null)] };
  const key = rateInForce(allocations.map((a) => ({ ...a, pricePerUnit: 0, currency: '', energyKwhPerUnit: null })), u.occurredAt);
  if (key === null) return { priced: true, rate, lines: [line(0, null, 1, 'unallocated', null)] };
  return { priced: true, rate, lines: key.shares.map((s, i) => line(i, s.domainId, s.weight, 'allocated', key.version, s)) };
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
/** The calendar period (UTC) containing an instant: [start, end) as dates. */
export function periodBounds(kind: PeriodKind, at: Date | string): { start: string; end: string; from: Date; to: Date } {
  const d = new Date(ms(at));
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  const [sy, sm, months] = kind === 'month' ? [y, m, 1] : kind === 'quarter' ? [y, m - (m % 3), 3] : [y, 0, 12];
  const from = new Date(Date.UTC(sy, sm, 1)); const to = new Date(Date.UTC(sy, sm + months, 1));
  return { start: iso(from), end: iso(to), from, to };
}

const round = (x: number, places: number): number => { const f = 10 ** places; return Math.round(x * f) / f; };

export interface Variance { spent: number; amount: number; variance: number; pct: number; elapsedFraction: number; forecast: number | null; forecastVariance: number | null; periodStart: string; periodEnd: string }
/** cle-variance@1: spent − amount (positive = over); pct; the linear run-rate forecast to period end. */
export function variance(a: { spent: number; amount: number; periodKind: PeriodKind; at: Date | string }): Variance {
  const p = periodBounds(a.periodKind, a.at);
  const t = Math.min(Math.max(ms(a.at), p.from.getTime()), p.to.getTime());
  const elapsed = (t - p.from.getTime()) / (p.to.getTime() - p.from.getTime());
  const forecast = elapsed > 0 ? a.spent / elapsed : null;
  return { spent: round(a.spent, 6), amount: a.amount, variance: round(a.spent - a.amount, 6), pct: round((a.spent / a.amount) * 100, 2), elapsedFraction: round(elapsed, 6),
    forecast: forecast === null ? null : round(forecast, 6), forecastVariance: forecast === null ? null : round(forecast - a.amount, 6), periodStart: p.start, periodEnd: p.end };
}

/** The declared thresholds (percent of the amount) a pct has reached, ascending. */
export function thresholdsReached(pct: number, thresholds: readonly number[]): number[] {
  return [...new Set(thresholds)].filter((t) => pct >= t).sort((a, b) => a - b);
}

export interface Anomaly { anomalous: boolean; basis: 'applied' | 'no_baseline'; todaySpend: number; trailingMean: number; ratio: number | null; k: number; windowDays: number }
/**
 * cle-anomaly@1: `trailingDaily` is the spend of each of the previous window_days days (zeros included; its length IS the window); the
 * rule applies when their mean is above 0, and today is anomalous when today's spend exceeds k × that mean. With no baseline the rule is
 * not applied (never inferred either way).
 */
export function anomaly(a: { todaySpend: number; trailingDaily: readonly number[]; k: number }): Anomaly {
  const w = a.trailingDaily.length;
  const mean = w === 0 ? 0 : a.trailingDaily.reduce((x, y) => x + y, 0) / w;
  if (!(mean > 0)) return { anomalous: false, basis: 'no_baseline', todaySpend: a.todaySpend, trailingMean: 0, ratio: null, k: a.k, windowDays: w };
  return { anomalous: a.todaySpend > a.k * mean, basis: 'applied', todaySpend: a.todaySpend, trailingMean: mean, ratio: a.todaySpend / mean, k: a.k, windowDays: w };
}

/** The energy ESTIMATE: Σ quantity × kWh-per-unit over the lines that carry a coefficient; the others counted, never as zero. */
export function energyEstimate(lines: ReadonlyArray<{ quantity: number; kwhPerUnit: number | null }>): { kwh: number; estimated: number; notEstimated: number; label: 'ESTIMATE' } {
  let kwh = 0; let estimated = 0; let notEstimated = 0;
  for (const l of lines) {
    if (l.kwhPerUnit === null) { notEstimated += 1; continue; }
    kwh += l.quantity * l.kwhPerUnit; estimated += 1;
  }
  return { kwh, estimated, notEstimated, label: 'ESTIMATE' };
}

/** cle-boundary@1: the protected controls a change touches (named as its control, or as a key anywhere in what it changes from or to) and the unknown controls. */
export function boundaryCheck(changes: ReadonlyArray<{ control: string; from?: unknown; to?: unknown }>): { touched: string[]; unknown: string[]; passed: boolean } {
  const prot = new Set<string>(PROTECTED_CONTROLS); const adj = new Set<string>(ADJUSTABLE_CONTROLS);
  const touched = new Set<string>(); const unknown = new Set<string>();
  const keys = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(keys); return; }
    if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) { if (prot.has(k.toLowerCase())) touched.add(k.toLowerCase()); keys(x); }
  };
  for (const c of changes) {
    const control = c.control.toLowerCase();
    if (prot.has(control)) touched.add(control); else if (!adj.has(control)) unknown.add(control);
    keys(c.from); keys(c.to);
  }
  return { touched: [...touched].sort(), unknown: [...unknown].sort(), passed: touched.size === 0 && unknown.size === 0 };
}

export interface ReconLine { dimension: string; invoiceQuantity: number; ledgerQuantity: number; invoiceAmount: number; ledgerAmount: number; amountDifference: number; quantityDifference: number; unpricedUsage: number; withinTolerance: boolean }
/** cle-reconcile@1: per dimension, the invoice against the ledger; matched only when every line is within tolerance with nothing unpriced and nothing in another currency. */
export function reconcile(a: {
  invoice: ReadonlyArray<{ dimension: string; quantity: number; amount: number }>; ledger: ReadonlyArray<{ dimension: string; quantity: number; amount: number }>;
  unpriced?: Readonly<Record<string, number>>; tolerance: number; otherCurrencyEntries?: number;
}): { lines: ReconLine[]; outcome: 'matched' | 'differences'; invoiceTotal: number; ledgerTotal: number } {
  const sum = (rows: ReadonlyArray<{ dimension: string; quantity: number; amount: number }>) => {
    const m = new Map<string, { q: number; a: number }>();
    for (const r of rows) { const x = m.get(r.dimension) ?? { q: 0, a: 0 }; x.q += r.quantity; x.a += r.amount; m.set(r.dimension, x); }
    return m;
  };
  const inv = sum(a.invoice); const led = sum(a.ledger); const unp = a.unpriced ?? {};
  const dims = [...new Set([...inv.keys(), ...led.keys(), ...Object.keys(unp).filter((d) => (unp[d] ?? 0) > 0)])].sort();
  const lines = dims.map((d) => {
    const i = inv.get(d) ?? { q: 0, a: 0 }; const l = led.get(d) ?? { q: 0, a: 0 }; const u = unp[d] ?? 0;
    return { dimension: d, invoiceQuantity: i.q, ledgerQuantity: l.q, invoiceAmount: i.a, ledgerAmount: round(l.a, 6), amountDifference: round(i.a - l.a, 6), quantityDifference: i.q - l.q,
      unpricedUsage: u, withinTolerance: Math.abs(i.a - l.a) <= a.tolerance && u === 0 };
  });
  const matched = (a.otherCurrencyEntries ?? 0) === 0 && lines.every((l) => l.withinTolerance);
  return { lines, outcome: matched ? 'matched' : 'differences', invoiceTotal: [...inv.values()].reduce((x, y) => x + y.a, 0), ledgerTotal: round([...led.values()].reduce((x, y) => x + y.a, 0), 6) };
}
