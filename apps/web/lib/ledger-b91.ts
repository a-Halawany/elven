/**
 * The cost and resource ledger client — CP-6 B91 part `ledger` (0105 §LE; F-P7-F-02).
 *
 * Every response is returned VERBATIM: the variance, the forecast, the thresholds, the anomaly, the reconciliation outcome and its
 * differences are the server's, AS OF the database instant the answer states. Nothing is priced or judged here. Money is a decimal STRING
 * with its ISO-4217 code, never a float, and is passed back as such. The energy figures are an ESTIMATE and say so; usage the ledger could
 * not price is shown as UNPRICED, never as zero. Invoices are SYNTHETIC in this build — a real billing account is the external prerequisite.
 * The acts are the person's own: the commercial authority sets rates, allocations, imports and reconciles invoices and records
 * optimisations; the tenant administrator declares a budget; its owner revises it. The server refuses anyone the policy or the port does
 * not name.
 */
import { call, type ApiResult } from './api';

export type Decimal = string | number;
export type LedgerScope = { scope: 'PLATFORM' } | { scope: 'TENANT'; tenantId: string } | { scope: 'DOMAIN'; tenantId: string; domainId: string };
export interface Receipt { policyDecisionId: string; auditSeq: number }

export interface RateCardRow { rate_card_id: string; rate_key: string; version: number; dimension: string; unit: string; price_per_unit: string; currency: string; energy_kwh_per_unit: string | null;
  energy_label: 'ESTIMATE' | null; energy_basis: string | null; effective_from: string; synthetic: boolean; reason: string; set_by: string; set_at: string }
export interface RateCards { current: Array<{ rate_key: string; in_force: RateCardRow | null; scheduled: RateCardRow[] }>; versions: RateCardRow[] }
export interface Variance { rule: string; budget_id: string; version: number; period_start: string; period_end: string; as_of: string; amount: Decimal; currency: string; spent: Decimal; variance: Decimal; pct: Decimal;
  elapsed_fraction: Decimal; forecast: Decimal | null; forecast_variance: Decimal | null; forecast_basis: string; unpriced_usage: number; other_currency_entries: number; complete: boolean; thresholds: number[] }
export interface BudgetEvent { event_id: string; budget_version: number; event: 'declared' | 'revised' | 'threshold' | 'anomaly'; period_start: string | null; threshold: number | null; day: string | null;
  attention_item_id: string | null; details: Record<string, unknown>; recorded_at: string }
export interface BudgetRow { budget_id: string; version: number; scope: 'TENANT' | 'DOMAIN'; tenant_id: string; domain_id: string | null; label: string; capability_key: string; period_kind: 'month' | 'quarter' | 'year';
  amount: string; currency: string; owner_principal_id: string; thresholds: number[]; anomaly_rule: { rule: string; k: number; window_days: number }; reason: string; set_by: string; set_at: string;
  variance: Variance | null; events: BudgetEvent[] }
export interface TotalRow { dimension: string; unit: string; currency: string; quantity: string; amount: string; entries: number; energy_kwh: string | null }
export interface UnitCostRow { asset_ref: string; tenant_id: string; profile: string; product_id: string | null; consumer_principal_id: string | null; dimension: string; unit: string; currency: string;
  quantity: string; amount: string; unit_cost: string | null; entries: number; window_from: string; window_to: string }
export interface EnergyRow { dimension: string; unit: string; quantity: string; energy_kwh: string | null; entries_estimated: number; entries_not_estimated: number; label: 'ESTIMATE'; bases: string[] | null }
export interface ReconLine { dimension: string; invoice_quantity: Decimal; ledger_quantity: Decimal; quantity_difference: Decimal; invoice_amount: Decimal; ledger_amount: Decimal; amount_difference: Decimal;
  unpriced_usage: number; on_invoice: boolean; in_ledger: boolean; within_tolerance: boolean }
export interface Reconciliation { reconciliation_id: string; version: number; tolerance: string; outcome: 'matched' | 'differences'; lines: ReconLine[]; totals: Record<string, unknown>; reconciled_by: string; reconciled_at: string }
export interface InvoiceRow { invoice_id: string; tenant_id: string; invoice_ref: string; period_start: string; period_end: string; currency: string; total: string; issuer: string; synthetic: boolean; digest: string;
  imported_at: string; lines: Array<{ line_no: number; dimension: string; unit: string; quantity: string; amount: string; description: string | null }>; reconciliations: Reconciliation[] }
export interface OptimisationRow { decision_id: string; scope: 'PLATFORM' | 'TENANT'; tenant_id: string | null; title: string; decision: 'adopt' | 'defer'; changes: Array<{ control: string; from?: unknown; to: unknown }>;
  tradeoffs: Array<{ dimension: string; effect: string }>; expected_saving: { amount: Decimal; currency: string } | null; rationale: string; boundary_check: Record<string, unknown>; decided_by: string; decided_at: string }
export interface LedgerView {
  tenant_id: string; as_of: string; window: { from: string; to: string }; rate_cards: RateCards; allocation_keys: Array<Record<string, unknown>>; budgets: BudgetRow[]; totals: TotalRow[];
  unpriced: Array<{ dimension: string; unit: string; usage_records: number }>; complete: boolean; unit_cost: UnitCostRow[]; energy: { label: 'ESTIMATE'; basis: string; rows: EnergyRow[] };
  invoices: InvoiceRow[]; optimisations: OptimisationRow[]; dimensions: string[];
}
export interface PlatformView { as_of: string; rate_cards: RateCards; tenants: Array<{ tenant_id: string; name: string }>; optimisations: OptimisationRow[]; tenant: LedgerView | null }

/** The words the page uses — the vocabularies are the migration's. */
export const DIMENSIONS = ['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'] as const;
export const ADJUSTABLE_CONTROLS = ['compute_schedule', 'batch_window', 'cache_tier', 'index_tier', 'instance_size', 'reservation', 'model_choice', 'sampling_rate', 'storage_compression', 'chunk_pace'] as const;
export const EVENT_LABEL: Record<BudgetEvent['event'], string> = {
  declared: 'declared by the tenant administrator',
  revised: 'revised (a new version)',
  threshold: 'threshold reached — raised to the owner',
  anomaly: 'spend anomaly — raised to the owner',
};

/** A money line: the server's decimal string and its currency, never re-rounded into a float. */
export function money(amount: Decimal | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return '—';
  return `${String(amount)} ${currency}`;
}
/** The variance line: spent of amount (pct), the forecast to period end, and — when not complete — WHY the spend is a floor. */
export function varianceLine(v: Variance): string {
  const head = `${String(v.spent)} of ${String(v.amount)} ${v.currency} (${String(v.pct)}%) · ${v.period_start} → ${v.period_end}`;
  const fc = v.forecast === null ? 'no forecast yet (no elapsed time in the period)' : `forecast ${String(v.forecast)} ${v.currency} by period end (${v.forecast_basis})`;
  const gaps: string[] = [];
  if (v.unpriced_usage > 0) gaps.push(`${v.unpriced_usage} usage record(s) UNPRICED — the spend is a floor`);
  if (v.other_currency_entries > 0) gaps.push(`${v.other_currency_entries} entr(ies) in another currency not counted`);
  return `${head} — ${fc}${gaps.length > 0 ? ` — ${gaps.join('; ')}` : ''}`;
}
/** The energy line: an ESTIMATE, with what it does not cover counted (never read as zero). */
export function energyLine(e: EnergyRow): string {
  const kwh = e.energy_kwh === null ? 'not estimated' : `${e.energy_kwh} kWh (ESTIMATE)`;
  return `${e.dimension} · ${kwh}${e.entries_not_estimated > 0 ? ` — ${e.entries_not_estimated} entr(ies) priced without a coefficient, not estimated` : ''}`;
}
/** A reconciliation's differences, worded per dimension. */
export function differencesOf(r: Reconciliation): string[] {
  return r.lines.filter((l) => !l.within_tolerance).map((l) => {
    const why = !l.on_invoice ? 'in the ledger, not on the invoice' : !l.in_ledger && l.unpriced_usage === 0 ? 'on the invoice, not in the ledger' : `amount difference ${String(l.amount_difference)}`;
    return `${l.dimension}: ${why}${l.unpriced_usage > 0 ? ` — ${l.unpriced_usage} usage record(s) unpriced` : ''}`;
  });
}

const base = (s: LedgerScope) => (s.scope === 'PLATFORM' ? '/v1/commercial/ledger' : s.scope === 'TENANT' ? `/v1/tenants/${s.tenantId}/commercial/ledger` : `/v1/tenants/${s.tenantId}/domains/${s.domainId}/commercial/ledger`);
const env = (s: LedgerScope, action: string, object_type: string, object_id: string | null = null, read = false) => ({
  scope: s.scope, tenant_id: s.scope === 'PLATFORM' ? null : s.tenantId, domain_id: s.scope === 'DOMAIN' ? s.domainId : null,
  action, object_type, object_id, purpose_id: 'commercial', consequence_class: 'C2' as const, side_effect_class: read ? ('none' as const) : ('reversible' as const),
});

export const ledger = {
  readPlatform: (payload: { tenantId?: string; from?: string; to?: string } = {}): Promise<ApiResult<{ ledger: PlatformView; receipt: Receipt }>> =>
    call('/v1/commercial/ledger/read', env({ scope: 'PLATFORM' }, 'commercial.ledger.read', 'CLG', null, true), payload),
  read: (s: Exclude<LedgerScope, { scope: 'PLATFORM' }>, payload: { from?: string; to?: string } = {}): Promise<ApiResult<{ ledger: LedgerView; receipt: Receipt }>> =>
    call(`${base(s)}/read`, env(s, 'commercial.ledger.read', 'CLG', null, true), payload),
  setRateCard: (payload: { dimension: string; unit: string; pricePerUnit: string; currency: string; energyKwhPerUnit?: string | null; energyBasis?: string | null; effectiveFrom: string; synthetic: boolean; reason: string }) =>
    call<{ rateCard: RateCardRow; receipt: Receipt }>('/v1/commercial/ledger/rate-cards/set', env({ scope: 'PLATFORM' }, 'commercial.rate.set', 'CRC'), payload),
  importInvoice: (payload: { tenantId: string; invoiceRef: string; periodStart: string; periodEnd: string; currency: string; total: string; issuer: string; synthetic: true; lines: Array<{ dimension: string; unit: string; quantity: number; amount: number; description?: string }> }) =>
    call<{ invoice: InvoiceRow; receipt: Receipt }>('/v1/commercial/ledger/invoices/import', env({ scope: 'PLATFORM' }, 'commercial.invoice.import', 'CIN'), payload),
  reconcile: (invoiceId: string, tolerance: string | null) =>
    call<{ reconciliation: Reconciliation; receipt: Receipt }>(`/v1/commercial/ledger/invoices/${invoiceId}/reconcile`, env({ scope: 'PLATFORM' }, 'commercial.invoice.reconcile', 'CIN', invoiceId), tolerance === null ? {} : { tolerance }),
  recordOptimisation: (payload: { tenantId: string | null; title: string; decision: 'adopt' | 'defer'; changes: Array<{ control: string; from?: unknown; to: unknown }>; tradeoffs: Array<{ dimension: string; effect: string }>; rationale: string }) =>
    call<{ optimisation: OptimisationRow; receipt: Receipt }>('/v1/commercial/ledger/optimisations/record', env({ scope: 'PLATFORM' }, 'commercial.optimisation.record', 'COP'), payload),
  setBudget: (s: Exclude<LedgerScope, { scope: 'PLATFORM' }>, payload: { budgetId?: string; expectedVersion?: number; domainId?: string | null; label: string; capabilityKey?: string; periodKind?: string; amount: string; currency: string;
    ownerPrincipalId: string; thresholds?: number[]; anomaly?: { k: number; window_days: number }; reason: string }) =>
    call<{ budget: BudgetRow; receipt: Receipt }>(`${base(s)}/budgets/set`, env(s, 'commercial.budget.set', 'CBG', payload.budgetId ?? null), payload),
};
