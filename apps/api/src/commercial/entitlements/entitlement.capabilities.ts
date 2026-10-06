/**
 * CP-6 B91 §EN (0105) — THE ENTITLEMENT CAPABILITIES: one implementation, narrow interfaces per port group (the
 * twin/constraints/constraint.capabilities.ts idiom). Every write is a SECURITY DEFINER port that asserts the caller's own bound action,
 * the PLATFORM scope and the acting principal; reads go through the tables' row security (the catalogue is readable by every reader; a
 * tenant's licences, contracts and ledger rows by the tenant and the PLATFORM scope) and the two guarded definer reads.
 *
 *   commercial.capability.declare → commercial.declare_capability   (the commercial authority; core rows immutable)
 *   commercial.offer.package      → commercial.declare_package
 *   commercial.offer.sku          → commercial.declare_sku
 *   commercial.offer.declare      → commercial.declare_offer
 *   commercial.licence.issue      → commercial.issue_licence        (v+1 of the tenant's licence; the previous version superseded)
 *   commercial.contract.declare   → commercial.declare_contract     (the contract scope, V10-T-015)
 *   commercial.read               → the catalogue tables, commercial.entitlement_summary(tenant), commercial.capability_available(tenant, action)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import type { Availability } from './entitlement-gate.js';

type Row = Record<string, unknown>;

export interface EntitlementReads {
  readonly action: string;
  capabilities(): Promise<Row[]>;
  packages(): Promise<Row[]>;
  skus(): Promise<Row[]>;
  offers(): Promise<Row[]>;
  catalogueEvents(limit: number): Promise<Row[]>;
  tenants(): Promise<Row[]>;
  summary(tenantId: string): Promise<Row>;
  available(tenantId: string, action: string): Promise<Availability>;
  tenantEvents(tenantId: string, limit: number): Promise<Row[]>;
}

interface Act { actor: string; eventId: string; correlationId: string; reason: string }
export interface CatalogueWrites extends EntitlementReads {
  declareCapability(a: Act & { key: string; expectedVersion: number; label: string; description: string; prefixes: string[]; includedIn: string | null;
    unit: string; tier: string; built: boolean; specRefs: string[]; cannotRemove: string; status: string }): Promise<Row>;
  declarePackage(a: Act & { key: string; expectedVersion: number; title: string; capabilities: string[]; limits: Record<string, unknown>; tier: string; status: string }): Promise<Row>;
  declareSku(a: Act & { code: string; expectedVersion: number; title: string; packageKey: string; termMonths: number; status: string }): Promise<Row>;
  declareOffer(a: Act & { key: string; expectedVersion: number; title: string; summary: string; skuCodes: string[]; effectiveFrom: string | null;
    effectiveTo: string | null; status: string }): Promise<Row>;
}
export interface LicenceWrites extends EntitlementReads {
  issueLicence(a: Act & { licenceId: string; tenantId: string; skuCode: string; limits: Record<string, unknown> | null; effectiveFrom: string | null;
    effectiveTo: string | null; orderRef: string }): Promise<Row>;
}
export interface ContractWrites extends EntitlementReads {
  declareContract(a: Act & { contractId: string; tenantId: string; expectedVersion: number; contractRef: string; scope: Record<string, unknown>;
    effectiveFrom: string | null; effectiveTo: string | null; status: string }): Promise<Row>;
}

class EntitlementCapabilityImpl implements CatalogueWrites, LicenceWrites, ContractWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async rows(q: ReturnType<typeof sql>): Promise<Row[]> { return (await q.execute(this.#tx)).rows as Row[]; }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row } | undefined)?.r) ?? {};
  }

  capabilities() { return this.rows(sql`select * from commercial.capabilities where status <> 'superseded' order by core desc, tier, capability_key`); }
  packages() { return this.rows(sql`select * from commercial.packages order by package_key, version desc`); }
  skus() { return this.rows(sql`select * from commercial.skus order by sku_code, version desc`); }
  offers() { return this.rows(sql`select * from commercial.offers order by offer_key, version desc`); }
  catalogueEvents(limit: number) {
    return this.rows(sql`select * from commercial.entitlement_events where tenant_id is null order by occurred_at desc, event_id limit ${limit}`);
  }
  /** The tenants with their live licence (PLATFORM: the vendor's matrix; under a tenant scope, row security leaves the tenant's own). */
  tenants() {
    return this.rows(sql`select t.id as tenant_id, t.name, t.status, l.licence_id, l.version, l.state, l.package_key, l.capabilities, l.effective_to, l.grace_until
      from tenancy.tenants t
      left join lateral (select x.* from commercial.licences x where x.tenant_id = t.id and x.state <> 'superseded' order by x.issued_at desc, x.version desc limit 1) l on true
      order by t.name`);
  }
  async summary(tenantId: string) { return this.one(sql`select commercial.entitlement_summary(${tenantId}::uuid) as r`); }
  async available(tenantId: string, action: string) { return (await this.one(sql`select commercial.capability_available(${tenantId}::uuid, ${action}, false) as r`)) as unknown as Availability; }
  tenantEvents(tenantId: string, limit: number) {
    return this.rows(sql`select * from commercial.entitlement_events where tenant_id = ${tenantId}::uuid order by occurred_at desc, event_id limit ${limit}`);
  }

  declareCapability(a: Parameters<CatalogueWrites['declareCapability']>[0]) {
    return this.one(sql`select commercial.declare_capability(${a.key}, ${a.expectedVersion}::int, ${a.label}, ${a.description}, ${a.prefixes}::text[], ${a.includedIn},
      ${a.unit}, ${a.tier}, ${a.built}, ${a.specRefs}::text[], ${a.cannotRemove}, ${a.status}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  declarePackage(a: Parameters<CatalogueWrites['declarePackage']>[0]) {
    return this.one(sql`select commercial.declare_package(${a.key}, ${a.expectedVersion}::int, ${a.title}, ${a.capabilities}::text[], ${JSON.stringify(a.limits)}::jsonb,
      ${a.tier}, ${a.status}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  declareSku(a: Parameters<CatalogueWrites['declareSku']>[0]) {
    return this.one(sql`select commercial.declare_sku(${a.code}, ${a.expectedVersion}::int, ${a.title}, ${a.packageKey}, ${a.termMonths}::int, ${a.status},
      ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  declareOffer(a: Parameters<CatalogueWrites['declareOffer']>[0]) {
    return this.one(sql`select commercial.declare_offer(${a.key}, ${a.expectedVersion}::int, ${a.title}, ${a.summary}, ${a.skuCodes}::text[], ${a.effectiveFrom}::timestamptz,
      ${a.effectiveTo}::timestamptz, ${a.status}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  issueLicence(a: Parameters<LicenceWrites['issueLicence']>[0]) {
    return this.one(sql`select commercial.issue_licence(${a.licenceId}::uuid, ${a.tenantId}::uuid, ${a.skuCode}, ${a.limits === null ? null : JSON.stringify(a.limits)}::jsonb,
      ${a.effectiveFrom}::timestamptz, ${a.effectiveTo}::timestamptz, ${a.orderRef}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  declareContract(a: Parameters<ContractWrites['declareContract']>[0]) {
    return this.one(sql`select commercial.declare_contract(${a.contractId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.contractRef}, ${JSON.stringify(a.scope)}::jsonb,
      ${a.effectiveFrom}::timestamptz, ${a.effectiveTo}::timestamptz, ${a.status}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const EntitlementCapability = {
  read(tx: Tx, action: string): EntitlementReads { return new EntitlementCapabilityImpl(tx, action); },
  catalogue(tx: Tx, action: string): CatalogueWrites { return new EntitlementCapabilityImpl(tx, action); },
  licence(tx: Tx, action: string): LicenceWrites { return new EntitlementCapabilityImpl(tx, action); },
  contract(tx: Tx, action: string): ContractWrites { return new EntitlementCapabilityImpl(tx, action); },
};
