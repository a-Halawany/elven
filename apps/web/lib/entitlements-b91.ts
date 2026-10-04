/**
 * The entitlements client — CP-6 B91 part `entitlements` (0105 §EN; F-P7-F-01: the capability catalogue, packages, SKUs and offers, a
 * tenant's licence versions, the contract scope, and the availability gate's explanations).
 *
 * Every response is returned VERBATIM. The helpers below only WORD what the record says — the server decides what is licensed, what is
 * available and why (commercial.capability_available); nothing here computes availability. Every offer, package, SKU and order reference
 * is SYNTHETIC. BOUNDARY (ADR-022): an entitlement makes a capability unavailable, explained — it never removes a mandatory control (audit,
 * warnings and their acknowledgement, corrections and withdrawals, export, identity) or a human decision.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }

export interface Capability {
  capability_key: string; version: number; label: string; description: string; action_prefixes: string[]; included_in: string | null; core: boolean;
  entitlement_unit: string; tier: string; built: boolean; spec_refs: string[]; cannot_remove: string; status: string;
}
export interface Package { package_key: string; version: number; title: string; capabilities: string[]; limits: Row; tier: string; status: string; digest: string }
export interface Sku { sku_code: string; version: number; title: string; package_key: string; package_version: number; term_months: number; status: string }
export interface Offer { offer_key: string; version: number; title: string; summary: string; sku_codes: string[]; status: string; effective_from: string; effective_to: string | null }
export type Cell = 'core' | 'licensed' | 'unlicensed' | 'uncontracted' | 'grace' | 'suspended' | 'lapsed' | string;
export interface MatrixRow { tenant_id: string; name: string; licence_version: number | null; state: string; package_key: string | null; cells: Record<string, Cell> }
export interface Catalog { capabilities: Capability[]; packages: Package[]; skus: Sku[]; offers: Offer[]; events: Row[]; matrix: MatrixRow[] }
export interface Availability {
  available: boolean; action: string; contracted: boolean; exemption: string | null; capability: { key: string; label: string; core: boolean } | null;
  licence: { licence_id: string; version: number; state: string; package_key: string } | null; state: string; reason: string; stays_available: string;
  grace: { in_grace: boolean; grace_until: string | null; last_valid: Row | null; rules_source?: string };
}

const PLATFORM = { scope: 'PLATFORM' as const, purpose_id: 'commercial' };

export function readCatalog(): Promise<ApiResult<{ catalog: Catalog; receipt: Receipt }>> {
  return call('/v1/commercial/catalog/read', { ...PLATFORM, action: 'commercial.read', object_type: 'CAP', side_effect_class: 'none' });
}
export function readTenantEntitlement(tenantId: string): Promise<ApiResult<{ entitlement: Row; receipt: Receipt }>> {
  return call(`/v1/commercial/tenants/${tenantId}/read`, { ...PLATFORM, action: 'commercial.read', object_type: 'LIC', object_id: tenantId, side_effect_class: 'none' });
}
export function issueLicence(tenantId: string, payload: { skuCode: string; orderRef: string; reason: string; effectiveTo?: string | null }): Promise<ApiResult<{ licence: Row; receipt: Receipt }>> {
  return call(`/v1/commercial/tenants/${tenantId}/licences/issue`, { ...PLATFORM, action: 'commercial.licence.issue', object_type: 'LIC', object_id: tenantId }, payload);
}
export function declarePackage(payload: { key: string; expectedVersion: number; title: string; capabilities: string[]; limits?: Row; tier?: string; status?: string; reason: string }): Promise<ApiResult<{ package: Package; receipt: Receipt }>> {
  return call('/v1/commercial/packages/declare', { ...PLATFORM, action: 'commercial.offer.package', object_type: 'PKG' }, payload);
}
export function declareSku(payload: { code: string; expectedVersion: number; title: string; packageKey: string; termMonths: number; status?: string; reason: string }): Promise<ApiResult<{ sku: Sku; receipt: Receipt }>> {
  return call('/v1/commercial/skus/declare', { ...PLATFORM, action: 'commercial.offer.sku', object_type: 'SKU' }, payload);
}
/** The tenant's own entitlement (TENANT: the tenant administrator, the auditor) or a domain's (DOMAIN: the domain readers). */
export function readOwnEntitlement(tenantId: string, domainId: string | null): Promise<ApiResult<{ entitlement: Row; receipt: Receipt }>> {
  const base = domainId === null ? `/v1/tenants/${tenantId}` : `/v1/tenants/${tenantId}/domains/${domainId}`;
  return call(`${base}/commercial/entitlement/read`, { scope: domainId === null ? 'TENANT' : 'DOMAIN', tenant_id: tenantId, domain_id: domainId, purpose_id: 'commercial',
    action: 'commercial.read', object_type: 'LIC', side_effect_class: 'none' });
}
/** Each action's availability, explained by the server (the banner of an unavailable capability reads this). */
export function readAvailability(tenantId: string, domainId: string | null, actions: string[]): Promise<ApiResult<{ availability: Availability[]; receipt: Receipt }>> {
  const base = domainId === null ? `/v1/tenants/${tenantId}` : `/v1/tenants/${tenantId}/domains/${domainId}`;
  return call(`${base}/commercial/entitlement/availability`, { scope: domainId === null ? 'TENANT' : 'DOMAIN', tenant_id: tenantId, domain_id: domainId, purpose_id: 'commercial',
    action: 'commercial.read', object_type: 'LIC', side_effect_class: 'none' }, { actions });
}

// ── wording (never judging) ────────────────────────────────────────────────────────────
const CELL_TEXT: Record<string, string> = {
  core: '● core — cannot be removed', licensed: '● licensed', unlicensed: '○ not licensed', uncontracted: '◇ uncontracted — not gated',
  grace: '◐ grace — read and preserve', suspended: '⊘ suspended', lapsed: '⊘ lapsed',
};
export function cellText(c: Cell): string { return CELL_TEXT[c] ?? c; }

export function capabilityLine(c: Capability): string {
  const scope = c.included_in !== null ? `licensed with ${c.included_in}` : c.action_prefixes.length > 0 ? c.action_prefixes.map((p) => `${p}*`).join(', ') : 'no action of its own';
  return `${c.core ? 'CORE' : c.tier.replace('_', ' ')} · ${scope}${c.built ? '' : ' · not built yet'} · unit: ${c.entitlement_unit}`;
}

export function limitsLine(limits: Row | null | undefined): string {
  const entries = Object.entries(limits ?? {});
  if (entries.length === 0) return 'no limits declared';
  return entries.map(([k, v]) => {
    if (typeof v === 'number') return `${k.replace(/_/g, ' ')} ${v}`;
    const o = (v ?? {}) as Row;
    return `${k.replace(/_/g, ' ')} ${String(o['quantity'] ?? '?')}${o['unit'] !== undefined ? ` ${String(o['unit'])}` : ''}${o['period'] !== undefined ? ` per ${String(o['period'])}` : ''}`;
  }).join(' · ');
}

/** The server's explanation of an availability, as one line: AVAILABLE / UNAVAILABLE — the reason (verbatim). */
export function availabilityLine(a: Availability): string {
  return `${a.available ? 'AVAILABLE' : 'UNAVAILABLE'} — ${a.reason}`;
}

/** The licence version as the record says it. */
export function licenceLine(l: Row | null | undefined): string {
  if (l === null || l === undefined) return 'uncontracted — no licence; the availability gate does not apply';
  const to = l['effective_to'] === null || l['effective_to'] === undefined ? 'open-ended' : `until ${String(l['effective_to'])}`;
  return `licence v${String(l['version'])} · ${String(l['state'])} · package ${String(l['package_key'])} · ${to}`;
}
