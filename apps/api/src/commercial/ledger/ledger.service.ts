/**
 * CP-6 B91 §LE (0105 §LE) — THE LEDGER SERVICE: the intake shapes (types only: what a value MEANS is the port's to judge, in the refusal
 * family `<noun> rejected (<class>): …`) and the composed reads — the ledger view of a tenant (rate cards, budgets with their variance and
 * forecast, the period's totals, the unpriced usage, unit data cost, the energy ESTIMATE, the invoices with their reconciliations, the
 * optimisation decisions) under the reader's own row security, at the DATABASE's instant.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { BudgetWrites, InvoiceWrites, LedgerReads, OptimisationWrites, RateWrites } from './ledger.capabilities.js';
import { DIMENSIONS, periodBounds } from './ledger-math.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL = /^-?\d{1,16}(\.\d{1,12})?$/;
const no = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };

/** A decimal as exact text (a number is accepted and written as its decimal form; never a float through the port). */
export function decimalOf(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && DECIMAL.test(v.trim())) return v.trim();
  return null;
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const instantOf = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const dateOf = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const uuidOrNull = (v: unknown): string | null | undefined => (v === undefined || v === null || v === '' ? null : typeof v === 'string' && UUID.test(v) ? v : undefined);

export interface RateIntake { dimension: string; unit: string; price: string; currency: string; energyKwh: string | null; energyBasis: string | null; effectiveFrom: string; synthetic: boolean; reason: string }
export function validateRateIntake(m: Row, cid: string): RateIntake {
  const price = decimalOf(m['pricePerUnit']);
  if (price === null) no(cid, 'rate card rejected (price): pricePerUnit is a decimal number');
  const energyKwh = m['energyKwhPerUnit'] === undefined || m['energyKwhPerUnit'] === null ? null : decimalOf(m['energyKwhPerUnit']);
  if (energyKwh === null && m['energyKwhPerUnit'] !== undefined && m['energyKwhPerUnit'] !== null) no(cid, 'rate card rejected (energy): energyKwhPerUnit is a decimal number (kWh per unit, an ESTIMATE)');
  const effectiveFrom = instantOf(m['effectiveFrom']);
  if (effectiveFrom === null) no(cid, 'rate card rejected (effective_from): effectiveFrom is an instant');
  if (typeof m['synthetic'] !== 'boolean') no(cid, 'rate card rejected (synthetic): synthetic says whether the price is SYNTHETIC (true/false)');
  return { dimension: str(m['dimension']), unit: str(m['unit']), price: price as string, currency: str(m['currency']), energyKwh, energyBasis: typeof m['energyBasis'] === 'string' ? m['energyBasis'] : null,
    effectiveFrom: effectiveFrom as string, synthetic: m['synthetic'] as boolean, reason: str(m['reason']) };
}

export interface AllocationIntake { tenantId: string; dimension: string; basis: string; shares: unknown[]; effectiveFrom: string; reason: string }
export function validateAllocationIntake(m: Row, cid: string): AllocationIntake {
  if (typeof m['tenantId'] !== 'string' || !UUID.test(m['tenantId'])) no(cid, 'allocation key rejected (unknown_tenant): tenantId is a tenant id');
  if (!Array.isArray(m['shares'])) no(cid, 'allocation key rejected (shares): shares is a list of { domainId, weight, productId?, consumerPrincipalId? }');
  const shares = (m['shares'] as unknown[]).map((s) => {
    const o = (s ?? {}) as Row;
    return { domain_id: o['domainId'] ?? o['domain_id'] ?? null, weight: o['weight'], product_id: o['productId'] ?? o['product_id'] ?? null, consumer_principal_id: o['consumerPrincipalId'] ?? o['consumer_principal_id'] ?? null };
  });
  const effectiveFrom = instantOf(m['effectiveFrom']);
  if (effectiveFrom === null) no(cid, 'allocation key rejected (effective_from): effectiveFrom is an instant');
  return { tenantId: m['tenantId'] as string, dimension: str(m['dimension']), basis: str(m['basis']), shares, effectiveFrom: effectiveFrom as string, reason: str(m['reason']) };
}

export interface BudgetIntake { budgetId: string | null; domainId: string | null; label: string; capabilityKey: string; periodKind: string; amount: string; currency: string; owner: string;
  thresholds: number[] | null; anomaly: Row | null; expectedVersion: number | null; reason: string }
export function validateBudgetIntake(m: Row, cid: string): BudgetIntake {
  const amount = decimalOf(m['amount']);
  if (amount === null) no(cid, 'budget rejected (amount): amount is a decimal number');
  const budgetId = uuidOrNull(m['budgetId']); const domainId = uuidOrNull(m['domainId']); const owner = uuidOrNull(m['ownerPrincipalId']);
  if (budgetId === undefined) no(cid, 'budget rejected (unknown_budget): budgetId is a budget id');
  if (domainId === undefined) no(cid, 'budget rejected (unknown_domain): domainId is a domain id (omit it for a tenant budget)');
  if (owner === undefined || owner === null) no(cid, 'budget rejected (owner): ownerPrincipalId names the budget\'s owner, a named human of the tenant');
  const ev = m['expectedVersion'];
  if (ev !== undefined && ev !== null && (!Number.isInteger(ev) || (ev as number) < 1)) no(cid, 'budget rejected (stale): expectedVersion is the budget\'s current version (omit it to declare a budget)');
  if ((ev === undefined || ev === null) !== (budgetId === null)) no(cid, 'budget rejected (stale): a revision names budgetId and expectedVersion; a declaration names neither');
  const th = m['thresholds'];
  if (th !== undefined && th !== null && (!Array.isArray(th) || !th.every((x) => Number.isInteger(x)))) no(cid, 'budget rejected (thresholds): thresholds is a list of whole percentages');
  const an = m['anomaly'];
  if (an !== undefined && an !== null && (typeof an !== 'object' || Array.isArray(an))) no(cid, 'budget rejected (anomaly): anomaly is { k, window_days }');
  const anomaly = an === undefined || an === null ? null : { k: (an as Row)['k'], window_days: (an as Row)['window_days'] ?? (an as Row)['windowDays'] };
  return { budgetId: budgetId as string | null, domainId: domainId as string | null, label: str(m['label']), capabilityKey: str(m['capabilityKey'] ?? 'all') || 'all', periodKind: str(m['periodKind'] ?? 'month') || 'month',
    amount: amount as string, currency: str(m['currency']), owner: owner as string, thresholds: (th ?? null) as number[] | null, anomaly, expectedVersion: (ev ?? null) as number | null, reason: str(m['reason']) };
}

export interface InvoiceIntake { tenantId: string; invoiceRef: string; periodStart: string; periodEnd: string; currency: string; total: string; issuer: string; synthetic: boolean; lines: unknown[] }
export function validateInvoiceIntake(m: Row, cid: string): InvoiceIntake {
  if (typeof m['tenantId'] !== 'string' || !UUID.test(m['tenantId'])) no(cid, 'invoice rejected (unknown_tenant): tenantId is a tenant id');
  const periodStart = dateOf(m['periodStart']); const periodEnd = dateOf(m['periodEnd']);
  if (periodStart === null || periodEnd === null) no(cid, 'invoice rejected (period): periodStart and periodEnd are dates (YYYY-MM-DD)');
  const total = decimalOf(m['total']);
  if (total === null) no(cid, 'invoice rejected (total): total is a decimal number');
  if (!Array.isArray(m['lines'])) no(cid, 'invoice rejected (lines): lines is a list of { dimension, unit, quantity, amount, description? }');
  return { tenantId: m['tenantId'] as string, invoiceRef: str(m['invoiceRef']), periodStart: periodStart as string, periodEnd: periodEnd as string, currency: str(m['currency']), total: total as string,
    issuer: str(m['issuer']), synthetic: m['synthetic'] === true, lines: m['lines'] as unknown[] };
}

export interface OptimisationIntake { tenantId: string | null; title: string; decision: string; changes: unknown[]; tradeoffs: unknown[]; expectedSaving: Row | null; rationale: string }
export function validateOptimisationIntake(m: Row, cid: string): OptimisationIntake {
  const tenantId = uuidOrNull(m['tenantId']);
  if (tenantId === undefined) no(cid, 'optimisation rejected (unknown_tenant): tenantId is a tenant id (omit it for a platform-wide optimisation)');
  if (!Array.isArray(m['changes'])) no(cid, 'optimisation rejected (changes): changes is a list of { control, from, to }');
  if (!Array.isArray(m['tradeoffs'])) no(cid, 'optimisation rejected (tradeoffs): tradeoffs is a list of { dimension, effect }');
  const es = m['expectedSaving'];
  return { tenantId: tenantId as string | null, title: str(m['title']), decision: str(m['decision'] ?? 'adopt'), changes: m['changes'] as unknown[], tradeoffs: m['tradeoffs'] as unknown[],
    expectedSaving: es !== null && typeof es === 'object' && !Array.isArray(es) ? (es as Row) : null, rationale: str(m['rationale']) };
}

/** The read window: an explicit [from, to), or the current calendar month at the database's instant. */
export function windowOf(m: Row, nowIso: string, cid: string): { from: string; to: string } {
  const from = m['from']; const to = m['to'];
  if (from === undefined && to === undefined) { const p = periodBounds('month', nowIso); return { from: p.from.toISOString(), to: p.to.toISOString() }; }
  const f = instantOf(from); const t = instantOf(to);
  if (f === null || t === null || Date.parse(f) >= Date.parse(t)) no(cid, 'the window is from < to, two instants (or omit both for the current month)');
  return { from: f as string, to: t as string };
}

@Injectable()
export class LedgerService {
  // ── writes ─────────────────────────────────────────────────────────────────────────
  setRateCard(cap: RateWrites, i: RateIntake, actor: string, correlationId: string) {
    return cap.setRateCard({ rateCardId: newId(), ...i, actor, correlationId });
  }
  setAllocationKey(cap: RateWrites, i: AllocationIntake, actor: string, correlationId: string) {
    return cap.setAllocationKey({ keyId: newId(), ...i, actor, correlationId });
  }
  setBudget(cap: BudgetWrites, tenantId: string, i: BudgetIntake, actor: string, correlationId: string) {
    return cap.setBudget({ ...i, budgetId: i.budgetId ?? newId(), tenantId, eventId: newId(), actor, correlationId });
  }
  importInvoice(cap: InvoiceWrites, i: InvoiceIntake, actor: string, correlationId: string) {
    return cap.importInvoice({ invoiceId: newId(), ...i, actor, correlationId });
  }
  reconcileInvoice(cap: InvoiceWrites, invoiceId: string, tolerance: string | null, actor: string, correlationId: string) {
    return cap.reconcileInvoice({ reconciliationId: newId(), invoiceId, tolerance, actor, correlationId });
  }
  recordOptimisation(cap: OptimisationWrites, i: OptimisationIntake, actor: string, correlationId: string) {
    return cap.recordOptimisation({ decisionId: newId(), ...i, actor, correlationId });
  }

  // ── reads ──────────────────────────────────────────────────────────────────────────
  /** The rate cards: the version in force NOW per card (by the database's instant), and every version. */
  async rateCards(cap: LedgerReads, nowIso: string) {
    const all = await cap.rateCards();
    const now = Date.parse(nowIso);
    const current: Row[] = [];
    for (const key of [...new Set(all.map((r) => String(r['rate_key'])))]) {
      const inForce = all.filter((r) => r['rate_key'] === key && Date.parse(String(r['effective_from'] instanceof Date ? (r['effective_from'] as Date).toISOString() : r['effective_from'])) <= now)
        .sort((a, b) => Number(b['version']) - Number(a['version']))[0];
      const scheduled = all.filter((r) => r['rate_key'] === key && Date.parse(String(r['effective_from'] instanceof Date ? (r['effective_from'] as Date).toISOString() : r['effective_from'])) > now);
      current.push({ rate_key: key, in_force: inForce ?? null, scheduled });
    }
    return { current, versions: all };
  }

  /** One budget: its versions, its events, its variance (the guarded read). */
  async budget(cap: LedgerReads, tenantId: string, budgetId: string) {
    const versions = await cap.budgetVersions(budgetId);
    if (versions.length === 0 || versions[0]!['tenant_id'] !== tenantId) return null;
    return { ...versions[0], versions, events: await cap.budgetEvents(budgetId, 200), variance: await cap.variance(tenantId, budgetId) };
  }

  /** THE LEDGER VIEW of a tenant, under the reader's row security, at the database's instant. */
  async view(cap: LedgerReads, tenantId: string, m: Row, cid: string, vendor = false) {
    const now = await cap.now();
    const w = windowOf(m, now, cid);
    const budgets = await cap.budgets(tenantId);
    const withVariance = [];
    for (const b of budgets) withVariance.push({ ...b, variance: await cap.variance(tenantId, String(b['budget_id'])), events: await cap.budgetEvents(String(b['budget_id']), 10) });
    const invoices = [];
    for (const i of await cap.invoices(tenantId)) invoices.push({ ...i, lines: await cap.invoiceLines(String(i['invoice_id'])), reconciliations: await cap.reconciliations(String(i['invoice_id'])) });
    const unpriced = vendor ? await cap.unpricedForVendor(tenantId, w.from, w.to) : await cap.unpriced(tenantId, w.from, w.to);
    return {
      tenant_id: tenantId, as_of: now, window: w,
      rate_cards: await this.rateCards(cap, now),
      allocation_keys: await cap.allocationKeys(tenantId),
      budgets: withVariance,
      totals: await cap.totals(tenantId, w.from, w.to),
      unpriced, complete: unpriced.length === 0,
      unit_cost: await cap.unitCost(tenantId, w.from, w.to),
      energy: { label: 'ESTIMATE', basis: 'the rate cards\' kWh-per-unit coefficients (estimates, not metered energy); carbon is not estimated (no grid-intensity source)', rows: await cap.energy(tenantId, w.from, w.to) },
      invoices,
      optimisations: await cap.optimisations(tenantId),
      dimensions: DIMENSIONS,
    };
  }

  /** The commercial authority's view: the rate cards, the platform-wide optimisations, the tenants — and one tenant's ledger when named. */
  async platformView(cap: LedgerReads, m: Row, cid: string) {
    const now = await cap.now();
    const tenantId = typeof m['tenantId'] === 'string' && UUID.test(m['tenantId']) ? m['tenantId'] : null;
    if (m['tenantId'] !== undefined && m['tenantId'] !== null && tenantId === null) no(cid, 'tenantId is a tenant id');
    return { as_of: now, rate_cards: await this.rateCards(cap, now), tenants: await cap.tenants(), optimisations: await cap.optimisations(tenantId),
      tenant: tenantId === null ? null : await this.view(cap, tenantId, m, cid, true) };
  }

  async entries(cap: LedgerReads, tenantId: string, m: Row, cid: string) {
    const now = await cap.now();
    const w = windowOf(m, now, cid);
    const dimension = typeof m['dimension'] === 'string' && (DIMENSIONS as readonly string[]).includes(m['dimension']) ? m['dimension'] : null;
    const limit = Number.isInteger(m['limit']) && (m['limit'] as number) >= 1 && (m['limit'] as number) <= 500 ? (m['limit'] as number) : 100;
    return { window: w, entries: await cap.entries(tenantId, { ...w, dimension, limit }) };
  }
}
