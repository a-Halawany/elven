/**
 * CP-6 B91 §LE (0105 §LE) — THE LEDGER CAPABILITIES: one implementation, a narrow interface per port group (the constraint capabilities'
 * idiom). Every write is a SECURITY DEFINER port that asserts the caller's own bound action; every read runs on the request's transaction
 * under the tables' row security (the tenant's isolation; the commercial authority's PLATFORM read of the ledger and billing records).
 *
 *   commercial.rate.set            → commercial.set_rate_card          (the commercial authority)
 *   commercial.allocation.set      → commercial.set_allocation_key     (the commercial authority)
 *   commercial.budget.set          → commercial.set_budget             (the tenant administrator; a revision also the budget's owner)
 *   commercial.invoice.import      → commercial.import_invoice         (the commercial authority; SYNTHETIC invoices only)
 *   commercial.invoice.reconcile   → commercial.reconcile_invoice      (the commercial authority)
 *   commercial.optimisation.record → commercial.record_optimisation    (the commercial authority, human-gated; the boundary refusal)
 *   executive.attention.tick       → commercial.ledger_tick            (the tick step commercial-ledger; the domain's attention agent)
 *   commercial.ledger.read         → the reads below
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface LedgerReads {
  readonly action: string;
  now(): Promise<string>;
  rateCards(): Promise<Row[]>;
  allocationKeys(tenantId: string): Promise<Row[]>;
  budgets(tenantId: string): Promise<Row[]>;
  budgetVersions(budgetId: string): Promise<Row[]>;
  budgetEvents(budgetId: string, limit: number): Promise<Row[]>;
  variance(tenantId: string, budgetId: string): Promise<Row | null>;
  totals(tenantId: string, from: string, to: string): Promise<Row[]>;
  unpriced(tenantId: string, from: string, to: string): Promise<Row[]>;
  entries(tenantId: string, f: { from: string; to: string; dimension: string | null; limit: number }): Promise<Row[]>;
  unitCost(tenantId: string, from: string, to: string): Promise<Row[]>;
  energy(tenantId: string, from: string, to: string): Promise<Row[]>;
  invoices(tenantId: string): Promise<Row[]>;
  invoiceLines(invoiceId: string): Promise<Row[]>;
  reconciliations(invoiceId: string): Promise<Row[]>;
  optimisations(tenantId: string | null): Promise<Row[]>;
  tenants(): Promise<Row[]>;
}
interface Act { actor: string; correlationId: string }
export interface RateWrites extends LedgerReads {
  setRateCard(a: Act & { rateCardId: string; dimension: string; unit: string; price: string; currency: string; energyKwh: string | null; energyBasis: string | null; effectiveFrom: string; synthetic: boolean; reason: string }): Promise<Row>;
  setAllocationKey(a: Act & { keyId: string; tenantId: string; dimension: string; basis: string; shares: unknown[]; effectiveFrom: string; reason: string }): Promise<Row>;
}
export interface BudgetWrites extends LedgerReads {
  setBudget(a: Act & { budgetId: string; tenantId: string; domainId: string | null; label: string; capabilityKey: string; periodKind: string; amount: string; currency: string; owner: string;
    thresholds: number[] | null; anomaly: Row | null; expectedVersion: number | null; reason: string; eventId: string }): Promise<Row>;
}
export interface InvoiceWrites extends LedgerReads {
  importInvoice(a: Act & { invoiceId: string; tenantId: string; invoiceRef: string; periodStart: string; periodEnd: string; currency: string; total: string; issuer: string; synthetic: boolean; lines: unknown[] }): Promise<Row>;
  reconcileInvoice(a: Act & { reconciliationId: string; invoiceId: string; tolerance: string | null }): Promise<Row>;
}
export interface OptimisationWrites extends LedgerReads {
  recordOptimisation(a: Act & { decisionId: string; tenantId: string | null; title: string; decision: string; changes: unknown[]; tradeoffs: unknown[]; expectedSaving: Row | null; rationale: string }): Promise<Row>;
}
export interface LedgerTick {
  tick(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class LedgerCapabilityImpl implements RateWrites, BudgetWrites, InvoiceWrites, OptimisationWrites, LedgerTick {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async rows(q: ReturnType<typeof sql>): Promise<Row[]> { return (await q.execute(this.#tx)).rows as Row[]; }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row } | undefined)?.r) ?? {};
  }

  // ── reads (row security decides what is visible) ─────────────────────────────────
  /** The DATABASE's instant (never the host clock), as ISO text. */
  async now(): Promise<string> { return String((await this.rows(sql`select to_json(clock_timestamp()) #>> '{}' as t`))[0]?.['t']); }
  rateCards() { return this.rows(sql`select r.rate_card_id::text, r.rate_key, r.version, r.dimension, r.unit, r.price_per_unit::text, r.currency, r.energy_kwh_per_unit::text, r.energy_label, r.energy_basis,
    r.effective_from, r.synthetic, r.reason, r.set_by::text, r.set_at from commercial.rate_cards r order by r.rate_key, r.version desc`); }
  allocationKeys(tenantId: string) { return this.rows(sql`select k.allocation_key_id::text, k.tenant_id::text, k.dimension, k.version, k.basis, k.shares, k.effective_from, k.reason, k.set_by::text, k.set_at
    from commercial.allocation_keys k where k.tenant_id = ${tenantId}::uuid order by k.dimension, k.version desc`); }
  budgets(tenantId: string) { return this.rows(sql`select distinct on (b.budget_id) b.budget_id::text, b.version, b.scope, b.tenant_id::text, b.domain_id::text, b.label, b.capability_key, b.period_kind,
    b.amount::text, b.currency, b.owner_principal_id::text, b.thresholds, b.anomaly_rule, b.reason, b.set_by::text, b.set_at
    from commercial.budgets b where b.tenant_id = ${tenantId}::uuid order by b.budget_id, b.version desc`); }
  budgetVersions(budgetId: string) { return this.rows(sql`select b.budget_id::text, b.version, b.scope, b.tenant_id::text, b.domain_id::text, b.label, b.capability_key, b.period_kind, b.amount::text, b.currency,
    b.owner_principal_id::text, b.thresholds, b.anomaly_rule, b.reason, b.set_by::text, b.set_at from commercial.budgets b where b.budget_id = ${budgetId}::uuid order by b.version desc`); }
  budgetEvents(budgetId: string, limit: number) { return this.rows(sql`select e.event_id::text, e.budget_version, e.event, e.period_start, e.threshold, e.day, e.raised_in_domain::text, e.attention_item_id::text,
    e.details, e.actor_principal_id::text, e.recorded_at from commercial.budget_events e where e.budget_id = ${budgetId}::uuid order by e.recorded_at desc, e.event_id limit ${limit}`); }
  async variance(tenantId: string, budgetId: string) {
    const r = await this.rows(sql`select commercial.budget_variance(${tenantId}::uuid, ${budgetId}::uuid) as v`);
    return (r[0]?.['v'] as Row | null) ?? null;
  }
  totals(tenantId: string, from: string, to: string) { return this.rows(sql`select c.dimension, c.unit, c.currency, sum(c.quantity)::text as quantity, round(sum(c.amount), 6)::text as amount, count(*)::int as entries,
    round(sum(c.energy_kwh), 6)::text as energy_kwh from commercial.cost_entries c where c.tenant_id = ${tenantId}::uuid and c.occurred_at >= ${from}::timestamptz and c.occurred_at < ${to}::timestamptz
    group by c.dimension, c.unit, c.currency order by c.dimension, c.unit`); }
  unpriced(tenantId: string, from: string, to: string) { return this.rows(sql`select u.dimension, u.unit, count(*)::int as usage_records from commercial.usage_records u
    where u.tenant_id = ${tenantId}::uuid and u.occurred_at >= ${from}::timestamptz and u.occurred_at < ${to}::timestamptz
      and not exists (select 1 from commercial.cost_entries c where c.usage_id = u.usage_id) group by u.dimension, u.unit order by u.dimension, u.unit`); }
  entries(tenantId: string, f: { from: string; to: string; dimension: string | null; limit: number }) { return this.rows(sql`select c.entry_id::text, c.usage_id::text, c.line, c.scope, c.domain_id::text,
    c.product_id::text, c.consumer_principal_id::text, c.capability_key, c.dimension, c.unit, c.asset_ref, c.profile, c.quantity::text, c.share::text, c.allocation, c.allocation_version,
    c.rate_key, c.rate_version, c.price_per_unit::text, c.currency, c.amount::text, c.energy_kwh::text, c.energy_label, c.occurred_at, c.priced_at
    from commercial.cost_entries c where c.tenant_id = ${tenantId}::uuid and c.occurred_at >= ${f.from}::timestamptz and c.occurred_at < ${f.to}::timestamptz
      and (${f.dimension}::text is null or c.dimension = ${f.dimension}::text) order by c.occurred_at desc, c.usage_id, c.line limit ${f.limit}`); }
  unitCost(tenantId: string, from: string, to: string) { return this.rows(sql`select u.asset_ref, u.tenant_id::text, u.profile, u.product_id::text, u.consumer_principal_id::text, u.dimension, u.unit, u.currency,
    u.quantity::text, u.amount::text, u.unit_cost::text, u.entries::int, u.window_from, u.window_to from commercial.unit_data_cost(${tenantId}::uuid, ${from}::timestamptz, ${to}::timestamptz) u`); }
  energy(tenantId: string, from: string, to: string) { return this.rows(sql`select e.dimension, e.unit, e.quantity::text, e.energy_kwh::text, e.entries_estimated::int, e.entries_not_estimated::int, e.label, e.bases
    from commercial.energy_estimate(${tenantId}::uuid, ${from}::timestamptz, ${to}::timestamptz) e`); }
  invoices(tenantId: string) { return this.rows(sql`select i.invoice_id::text, i.tenant_id::text, i.invoice_ref, i.period_start, i.period_end, i.currency, i.total::text, i.issuer, i.synthetic, i.digest,
    i.imported_by::text, i.imported_at from commercial.invoices i where i.tenant_id = ${tenantId}::uuid order by i.period_start desc, i.invoice_ref`); }
  invoiceLines(invoiceId: string) { return this.rows(sql`select l.line_no, l.dimension, l.unit, l.quantity::text, l.amount::text, l.description from commercial.invoice_lines l where l.invoice_id = ${invoiceId}::uuid order by l.line_no`); }
  reconciliations(invoiceId: string) { return this.rows(sql`select r.reconciliation_id::text, r.version, r.tolerance::text, r.outcome, r.lines, r.totals, r.reconciled_by::text, r.reconciled_at
    from commercial.reconciliations r where r.invoice_id = ${invoiceId}::uuid order by r.version desc`); }
  optimisations(tenantId: string | null) { return this.rows(sql`select o.decision_id::text, o.scope, o.tenant_id::text, o.title, o.decision, o.changes, o.tradeoffs, o.expected_saving, o.rationale, o.boundary_check,
    o.decided_by::text, o.decided_at from commercial.optimisation_decisions o where o.tenant_id is null or o.tenant_id = ${tenantId}::uuid order by o.decided_at desc limit 100`); }
  tenants() { return this.rows(sql`select t.id::text as tenant_id, t.name from tenancy.tenants t where t.status = 'active' order by t.name limit 500`); }

  // ── writes (the definer ports) ───────────────────────────────────────────────────
  setRateCard(a: Parameters<RateWrites['setRateCard']>[0]) {
    return this.one(sql`select commercial.set_rate_card(${a.rateCardId}::uuid, ${a.dimension}, ${a.unit}, ${a.price}::numeric, ${a.currency}, ${a.energyKwh}::numeric, ${a.energyBasis},
      ${a.effectiveFrom}::timestamptz, ${a.synthetic}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  setAllocationKey(a: Parameters<RateWrites['setAllocationKey']>[0]) {
    return this.one(sql`select commercial.set_allocation_key(${a.keyId}::uuid, ${a.tenantId}::uuid, ${a.dimension}, ${a.basis}, ${JSON.stringify(a.shares)}::jsonb, ${a.effectiveFrom}::timestamptz,
      ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  setBudget(a: Parameters<BudgetWrites['setBudget']>[0]) {
    return this.one(sql`select commercial.set_budget(${a.budgetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.label}, ${a.capabilityKey}, ${a.periodKind}, ${a.amount}::numeric, ${a.currency},
      ${a.owner}::uuid, ${a.thresholds === null ? null : `{${a.thresholds.join(',')}}`}::int[], ${a.anomaly === null ? null : JSON.stringify(a.anomaly)}::jsonb, ${a.expectedVersion}::int, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  importInvoice(a: Parameters<InvoiceWrites['importInvoice']>[0]) {
    return this.one(sql`select commercial.import_invoice(${a.invoiceId}::uuid, ${a.tenantId}::uuid, ${a.invoiceRef}, ${a.periodStart}::date, ${a.periodEnd}::date, ${a.currency}, ${a.total}::numeric,
      ${a.issuer}, ${a.synthetic}, ${JSON.stringify(a.lines)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  reconcileInvoice(a: Parameters<InvoiceWrites['reconcileInvoice']>[0]) {
    return this.one(sql`select commercial.reconcile_invoice(${a.reconciliationId}::uuid, ${a.invoiceId}::uuid, ${a.tolerance}::numeric, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  recordOptimisation(a: Parameters<OptimisationWrites['recordOptimisation']>[0]) {
    return this.one(sql`select commercial.record_optimisation(${a.decisionId}::uuid, ${a.tenantId}::uuid, ${a.title}, ${a.decision}, ${JSON.stringify(a.changes)}::jsonb, ${JSON.stringify(a.tradeoffs)}::jsonb,
      ${a.expectedSaving === null ? null : JSON.stringify(a.expectedSaving)}::jsonb, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  tick(a: Parameters<LedgerTick['tick']>[0]) {
    return this.one(sql`select commercial.ledger_tick(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const LedgerCapability = {
  read(tx: Tx, action: string): LedgerReads { return new LedgerCapabilityImpl(tx, action); },
  rate(tx: Tx, action: string): RateWrites { return new LedgerCapabilityImpl(tx, action); },
  budget(tx: Tx, action: string): BudgetWrites { return new LedgerCapabilityImpl(tx, action); },
  invoice(tx: Tx, action: string): InvoiceWrites { return new LedgerCapabilityImpl(tx, action); },
  optimisation(tx: Tx, action: string): OptimisationWrites { return new LedgerCapabilityImpl(tx, action); },
  /** The tick step's capability, on the tick's own transaction (bound to executive.attention.tick). */
  tick(tx: Tx, action: string): LedgerTick { return new LedgerCapabilityImpl(tx, action); },
};
