/**
 * The semantic metrics client — CP-6 B90 part `metrics` (0095 §M; F-P7-F-10; DAT-SV-04).
 *
 * Every response is returned VERBATIM (the Graph client's rule): a model's state, its certification (by whom, until when, signed), a
 * serving's values with their grain, the definition version and digest, the SOURCE REVISION and the certification standing — rendered
 * exactly as the server computed them AS OF the instant the answer states. A value is the server's numeric (or null when the source
 * withholds it — an indeterminate score, a stale component) and is never computed here. The executive view's refusal of an uncertified
 * model is the server's refusal, shown as such: dashboards are access modes, never a parallel truth.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type MetricState = 'declared' | 'certified' | 'withdrawn' | 'expired';
export type MetricView = 'executive' | 'analyst';
export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'last' | 'count';

export interface MeasureSpec { source: string; description: string; grains: string[]; dimensions: string[]; aggregations: Aggregation[] }
export interface MetricVersionRow { version: number; digest: string; definition: Record<string, unknown>; effective_from: string; declared_by: string; declared_at: string }
export interface SignatureRow { signature_id: string; signer: string; key_id: string; signed_at: string; bound_action: string }
export interface CertificationRow {
  certification_id: string; version: number; certified_by: string; certified_at: string; expires_at: string; signature_id: string; met_object_version: number;
  state: 'active' | 'withdrawn' | 'expired'; withdrawn_at: string | null; withdrawn_by: string | null; withdrawal_reason: string | null; signatures?: SignatureRow[];
}
export interface DiffRow { diff_id: string; from_version: number; to_version: number; changed: Array<{ key: string; from: unknown; to: unknown }>; recorded_by: string; recorded_at: string }
export interface ServingRow { serving_id: string; version: number; view: MetricView | 'recalculation'; grain: string; filters: Record<string, unknown>; as_of: string; certified: boolean; source_revision: string; source_rows: number; value_digest: string; served_to: string; served_at: string }
export interface MetricRow {
  model_id: string; metric_key: string; title: string; owner_principal_id: string; measure: string; unit: string; aggregation: Aggregation; grain: string; dimensions: string[]; filters: Record<string, unknown>;
  effective_from: string; current_version: number; certified_version: number | null; last_valid_version: number | null; state: MetricState; declared_at: string; updated_at: string;
  product_key: string; product_state: string; product_kind: string; released_version: number | null; measure_spec: MeasureSpec | null;
  versions: MetricVersionRow[]; certifications: CertificationRow[]; active_certification: CertificationRow | null; diffs: DiffRow[]; servings: ServingRow[];
  events: Array<{ event: string; occurred_at: string; actor: string | null; details: Record<string, unknown> }>;
}
export interface ServingAnswer {
  serving_id: string; model_id: string; metric_key: string; title: string; view: MetricView; version: number; digest: string; effective_from: string; measure: string; unit: string; aggregation: Aggregation;
  grain: string; filters: Record<string, unknown>; as_of: string; served_at: string; certified: boolean; certification_standing: string; certification: CertificationRow | null; last_valid_version: number | null;
  source: string; source_revision: string; source_rows: number; source_newest_at: string | null; freshness_seconds: number | null; values: Array<{ grain_key: string; value: number | null }>; value_digest: string; note: string;
}
export interface ProductRow { product_id: string; product_key: string; title: string; kind: string; state: string; owner_principal_id: string }

/* ───────────── what the screen says, in words (glyph + text, never colour alone) ───────────── */
export const STATE_LABEL: Record<MetricState, string> = {
  declared: '○ declared — uncertified: the analyst view serves it marked, the executive view refuses it',
  certified: '● certified — served in the executive view until its expiry',
  withdrawn: '✕ certification withdrawn — the last valid version is frozen; the executive view refuses it until the owner re-certifies',
  expired: '⌛ certification expired — the executive view refuses it until the owner re-certifies',
};
export const VIEW_LABEL: Record<MetricView, string> = {
  executive: 'Executive view — certified metrics only (dashboards are access modes)',
  analyst: 'Analyst view — an uncertified model is served, MARKED',
};
/** The longest certification the port admits (DP-44-005): 366 days. */
export const MAX_CERTIFICATION_DAYS = 366;

/** The certification in words: by whom, since when, until when, signed (the key) — or the withdrawal with its reason. */
export function certificationLine(c: CertificationRow | null): string {
  if (c === null) return 'not certified';
  const who = `certified by ${c.certified_by.slice(0, 8)}… at ${c.certified_at} until ${c.expires_at}`;
  const signed = (c.signatures ?? []).length === 0 ? 'UNSIGNED' : (c.signatures ?? []).map((s) => `signed by ${s.signer.slice(0, 8)}… (${s.key_id}) at ${s.signed_at}`).join('; ');
  if (c.state === 'active') return `${who} — ${signed}`;
  return `${c.state.toUpperCase()} at ${c.withdrawn_at ?? '—'}: ${c.withdrawal_reason ?? '—'} (was ${who}; ${signed})`;
}
/** A served value in words: the grain key, the value as the server gave it (null = withheld), the unit. */
export function valueLine(v: { grain_key: string; value: number | null }, unit: string): string {
  return `${v.grain_key}: ${v.value === null ? 'withheld (no value at the instant)' : `${v.value} ${unit}`}`;
}
/** A definition diff in words: the keys that changed, from → to. */
export function diffLine(d: DiffRow): string {
  return `v${d.from_version} → v${d.to_version}: ${d.changed.map((c) => `${c.key} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join('; ') || 'nothing differs'}`;
}
/** Whether an expiry the person typed lies in the window the port admits (after now, within 366 days) — a courtesy check; the port decides. */
export function expiryWithinLimit(expiresAt: string, now: Date): boolean {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t > now.getTime() && t <= now.getTime() + MAX_CERTIFICATION_DAYS * 86_400_000;
}
/** A datetime-local value → the ISO instant it names in the browser's zone; '' → null. */
export function instantOfLocal(local: string): string | null {
  if (local === '') return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** Filter lines `dimension=value` → the object the server takes (a blank line ignored). */
export function filtersOfLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim();
    if (k !== '' && v !== '') out[k] = v;
  }
  return out;
}
/** A DATE or instant renders as the day it names (no timezone shift). */
export function dayOf(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m === null ? v : m[1]!;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/products`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null, objectType = 'MET'): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'executive',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export const metrics = {
  list: (s: Scope, state?: MetricState) => p<{ at: string; metrics: MetricRow[]; receipt: Receipt }>(s, '/metrics/list', 'products.metric.read', state ? { state } : {}),
  catalog: (s: Scope) => p<{ at: string; measures: Record<string, MeasureSpec>; receipt: Receipt }>(s, '/metrics/catalog', 'products.metric.read'),
  get: (s: Scope, modelId: string) => p<{ at: string; metric: MetricRow; receipt: Receipt }>(s, `/metrics/${modelId}/get`, 'products.metric.read', {}, modelId),
  /** The products of kind metric (the registry's list, §0) — the ones a model can be defined on. */
  products: (s: Scope) => p<{ at: string; products: ProductRow[]; receipt: Receipt }>(s, '/list', 'products.product.read', { kind: 'metric' }, null, 'DPR'),
  define: (s: Scope, modelId: string, d: { title?: string; measure: string; unit: string; aggregation: Aggregation; grain: string; dimensions: string[]; filters: Record<string, unknown>; effectiveFrom?: string | null }) =>
    p<{ metric: MetricRow & { version: number; digest: string; withdrawal: Record<string, unknown> | null }; receipt: Receipt }>(s, `/metrics/${modelId}/define`, 'products.metric.declare', d, modelId),
  certify: (s: Scope, modelId: string, version: number, expiresAt: string) => p<{ metric: MetricRow; receipt: Receipt }>(s, `/metrics/${modelId}/certify`, 'products.metric.certify', { version, expiresAt }, modelId),
  withdraw: (s: Scope, modelId: string, reason: string) => p<{ metric: MetricRow; receipt: Receipt }>(s, `/metrics/${modelId}/withdraw`, 'products.metric.withdraw_certification', { reason }, modelId),
  serve: (s: Scope, key: string, q: { grain?: string | null; filters?: Record<string, unknown> | null; asOf?: string | null; view: MetricView }) =>
    p<{ serving: ServingAnswer; receipt: Receipt }>(s, `/metrics/${key}/serve`, 'products.metric.serve', q),
  recalculate: (s: Scope, modelId: string, asOf: string) => p<{ recalculation: Record<string, unknown>; receipt: Receipt }>(s, `/metrics/${modelId}/recalculate`, 'products.metric.recalculate', { asOf }, modelId),
};
