/**
 * The usage meters client — CP-6 B91 part `meters` (0105 §ME; F-P7-F-02's meters and caps, B90's usage counters).
 *
 * Every response is returned VERBATIM: the meters per dimension and unit (today, this month, all time; per domain for a tenant read), the
 * caps with their standing (period, used, remaining, reached), the breaches (crossed / refused), the latest usage records, and the licence
 * that bounds the caps (or uncontracted). The helpers below only WORD what the record says — nothing here sums a meter, judges a cap or
 * computes a period. Every figure on the demonstration is SYNTHETIC.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export type Dimension = 'model_inference' | 'source_consumption' | 'storage' | 'simulation_compute' | 'product_consumption';
export const DIMENSIONS: Dimension[] = ['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'];
export const UNITS: Record<Dimension, string[]> = {
  model_inference: ['calls'], source_consumption: ['requests', 'bytes'], storage: ['bytes'], simulation_compute: ['wall_ms'], product_consumption: ['events', 'servings'],
};
/** Only simulation_compute has an admission point that enforces a stop (the server refuses a stop elsewhere; the form says so first). */
export const STOPPABLE: Dimension[] = ['simulation_compute'];

export interface Meter { dimension: Dimension; unit: string; capability: string; gauge: boolean; today: number; this_month: number; all_time: number; records: number; last_at: string | null }
export interface Cap {
  cap_id: string; version: number; scope: 'TENANT' | 'DOMAIN'; domain_id: string | null; dimension: Dimension; unit: string; period: 'day' | 'month'; limit: number; action: 'stop' | 'warn';
  state: string; licence: { licence_id: string; version: number; limit: number | null } | null; reason: string; set_by: string; set_at: string;
  period_start: string; used: number; remaining: number; reached: boolean; supersedes?: number | null; licence_bound?: string;
}
export interface Breach {
  breach_id: string; kind: 'crossed' | 'refused'; action: 'stop' | 'warn'; cap_id: string; cap_version: number; dimension: string; unit: string; period: string; period_start: string;
  limit: number; used: number; subject_kind: 'meter' | 'experiment' | 'envelope_sweep'; subject_id: string | null; domain_id: string | null; actor: string | null; occurred_at: string;
}
export interface UsageRecord { usage_id: string; domain_id: string | null; dimension: string; unit: string; quantity: number; capability: string; profile: string; source_kind: string; source_ref: string; details: Row; occurred_at: string }
export interface Usage {
  tenant_id: string; domain_id: string | null; at: string; day_start: string; month_start: string;
  meters: Meter[]; domains: Array<{ domain_id: string; domain: string | null; dimension: string; unit: string; this_month: number }> | null; caps: Cap[]; breaches: Breach[]; records: UsageRecord[];
  licence: { contracted: false; note: string } | { contracted: true; licence_id: string; version: number; state: string; package_key: string; limits: Row };
  not_metered: string[];
}
export interface Scope { tenantId: string; domainId: string | null }
export interface CapIntake { domainId?: string | null; dimension: Dimension; unit?: string | null; period: 'day' | 'month'; limit: number; action: 'stop' | 'warn'; reason: string }

const base = (s: Scope) => (s.domainId === null ? `/v1/tenants/${s.tenantId}/commercial/usage` : `/v1/tenants/${s.tenantId}/domains/${s.domainId}/commercial/usage`);
const over = (s: Scope, action: string, side: 'none' | 'reversible') => ({
  scope: (s.domainId === null ? 'TENANT' : 'DOMAIN') as 'TENANT' | 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'USG', side_effect_class: side,
  consequence_class: 'C2' as const, purpose_id: 'administration',
});

/** The meters, caps, breaches, latest records and the licence bound (a tenant read, or a domain's). */
export function readUsage(s: Scope, limit = 50): Promise<ApiResult<{ usage: Usage }>> {
  return call(`${base(s)}/read`, over(s, 'commercial.usage.read', 'none'), { limit });
}
/** The live caps on a dimension and the first reached STOP cap. */
export function capStatus(s: Scope, dimension: Dimension | null = null): Promise<ApiResult<{ status: { caps: Cap[]; stop: Cap | null } }>> {
  return call(`${base(s)}/caps/status`, over(s, 'commercial.usage.read', 'none'), dimension === null ? {} : { dimension });
}
/** SET A CAP — the tenant's administrator at the tenant's scope (human-gated; the server bounds it by the licence). */
export function setCap(tenantId: string, intake: CapIntake): Promise<ApiResult<{ cap: Cap; receipt: { policyDecisionId: string; auditSeq: number } }>> {
  return call(`/v1/tenants/${tenantId}/commercial/usage/caps`, over({ tenantId, domainId: null }, 'commercial.cap.set', 'reversible'), intake);
}

/* ───────────── wording (the record, said in words) ───────────── */
const N = new Intl.NumberFormat('en-GB');
export function quantity(q: number, unit: string): string {
  if (unit === 'bytes') return q >= 1_048_576 ? `${(q / 1_048_576).toFixed(1)} MiB` : q >= 1024 ? `${(q / 1024).toFixed(1)} KiB` : `${N.format(q)} B`;
  if (unit === 'wall_ms') return q >= 1000 ? `${(q / 1000).toFixed(1)} s` : `${N.format(q)} ms`;
  return `${N.format(q)} ${unit}`;
}
export function dimensionLabel(d: string): string {
  return ({ model_inference: 'Model inference', source_consumption: 'Source consumption', storage: 'Storage', simulation_compute: 'Simulation compute', product_consumption: 'Data product consumption' } as Record<string, string>)[d] ?? d;
}
export function capLine(c: Cap): string {
  return `${dimensionLabel(c.dimension)} · ${quantity(c.limit, c.unit)} per ${c.period} · ${c.action === 'stop' ? 'stops new work at admission' : 'warns only'}`
    + ` — ${quantity(c.used, c.unit)} used since ${c.period_start.slice(0, 16).replace('T', ' ')} UTC${c.reached ? ' · REACHED' : ` · ${quantity(c.remaining, c.unit)} left`}`;
}
export function breachLine(b: Breach): string {
  const what = b.kind === 'crossed' ? 'the meter reached the cap' : `new work stopped (${b.subject_kind.replace('_', ' ')}${b.subject_id === null ? '' : ` ${b.subject_id.slice(0, 8)}`}) — nothing was deleted`;
  return `${dimensionLabel(b.dimension)} ${b.action} cap v${b.cap_version}: ${what}; ${quantity(b.used, b.unit)} of ${quantity(b.limit, b.unit)} this ${b.period}`;
}
export function licenceLine(l: Usage['licence']): string {
  return l.contracted ? `Licence v${l.version} (${l.package_key}, ${l.state}) — caps are set within its limits` : 'Uncontracted — no licence limits apply; a cap is bounded by nothing but itself';
}
