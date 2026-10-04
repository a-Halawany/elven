/**
 * The licence continuity client — CP-6 B91 part `grace` (0105 §GR; F-P7-F-01 clauses 4–5: FEX-30, PR-66-005/006, UX-67-001..006).
 *
 * Every response is returned VERBATIM: the tenant's standing (current entitlement, included capabilities, limits and usage, renewal and
 * continuity, grace), the rules §EN's gate reads, the banner's explanation, and the commercial authority's acts (renew, suspend, reinstate,
 * the grace policy, the offline token). The helpers below only WORD what the record says — nothing here decides availability, a term or a
 * grace. Every figure is SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';

type Row = Record<string, unknown>;
export type Receipt = { policyDecisionId: string; auditSeq: number };
export type LicenceState = 'uncontracted' | 'active' | 'grace' | 'suspended' | 'lapsed';

export interface LicenceView {
  licence_id: string; version: number; package_key: string; capabilities: string[]; limits: Record<string, unknown>;
  effective_from: string; effective_to: string | null; term_end: string | null; grace_until: string | null; state_changed_at: string; digest: string;
}
export interface Snapshot { licence_id?: string; version?: number; package_key?: string; capabilities?: string[]; limits?: Record<string, unknown>; term_end?: string | null; note?: string; none?: boolean }
export interface UsageLine { dimension: string; unit: string; quantity: string; records: number; first_at: string | null; last_at: string | null; limit: number | null; share: number | null }
export interface Transition {
  transition_id: string; licence_id: string; version: number; kind: string; cause: string; from_state: string; to_state: string; reason: string; actor_kind: string;
  actor_principal_id: string; term_end_before: string | null; term_end_after: string | null; renewed_until: string | null; grace_until: string | null; occurred_at: string; attention_items: string[];
}
export interface GracePolicy { source: 'declared' | 'default'; version: number | null; grace_days: number; allows: string[]; renewal_notice_days: number }
export interface Standing {
  tenant_id: string;
  current: { state: LicenceState; contracted: boolean; determinate: boolean; indeterminate: { cause: string; reason: string } | null; explanation: string; licence: LicenceView | null };
  included: { capabilities: string[]; available_now: string[]; always_available: string[] };
  limits_and_usage: { limits: Record<string, unknown>; usage: UsageLine[]; period: string; caps: { available: boolean; rows?: Row[]; note?: string }; budgets: { available: boolean; rows?: Row[]; note?: string } };
  renewal_and_continuity: { term_end: string | null; renewal_notice_days: number | null; last_notice: Transition | null; transitions: Transition[]; versions: Row[]; tokens: Row[] };
  grace: { policy: GracePolicy; policies: Row[]; rules: Row; grace_until: string | null; last_valid: Snapshot | null };
  as_of: string;
}
export interface Explanation {
  capability: string; contracted: boolean; state: LicenceState; licensed: boolean; available: boolean; reason: string | null;
  licence: { licence_id: string; version: number; package_key: string; capabilities: string[]; term_end: string | null; grace_until: string | null } | null;
  last_valid: Snapshot | null; explanation: string; always_available: string[]; as_of: string;
}

const P = (action: string, objectType = 'LIC', objectId: string | null = null, read = false) =>
  ({ scope: 'PLATFORM' as const, action, object_type: objectType, object_id: objectId, purpose_id: 'commercial', ...(read ? { side_effect_class: 'none' as const } : {}) });

export const grace = {
  /* the tenant (TENANT scope: the tenant administrator, the auditor) */
  standing: (tenantId: string): Promise<ApiResult<{ standing: Standing; receipt: Receipt }>> =>
    call(`/v1/tenants/${tenantId}/commercial/grace/standing`, { scope: 'TENANT', tenant_id: tenantId, action: 'commercial.grace.read', object_type: 'LIC', side_effect_class: 'none', purpose_id: 'commercial' }),
  /* the domain (the simulation workspace's banner) */
  explanation: (s: Scope, capability = 'simulation'): Promise<ApiResult<{ explanation: Explanation; receipt: Receipt }>> =>
    call(`/v1/tenants/${s.tenantId}/domains/${s.domainId}/commercial/grace/explanation`,
      { scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action: 'commercial.grace.read', object_type: 'LIC', side_effect_class: 'none', purpose_id: 'commercial' }, { capability }),
  /* the commercial authority (PLATFORM scope) */
  licences: (tenantId?: string): Promise<ApiResult<{ licences: Row[]; receipt: Receipt }>> =>
    call('/v1/commercial/grace/licences/list', P('commercial.grace.read', 'LIC', null, true), tenantId === undefined ? {} : { tenantId }),
  platformStanding: (tenantId: string): Promise<ApiResult<{ standing: Standing; receipt: Receipt }>> =>
    call('/v1/commercial/grace/standing', P('commercial.grace.read', 'LIC', null, true), { tenantId }),
  renew: (licenceId: string, body: { version: number; renewedUntil: string; reason: string; evidence?: Row }): Promise<ApiResult<{ transition: Row; receipt: Receipt }>> =>
    call(`/v1/commercial/grace/licences/${licenceId}/renew`, P('commercial.licence.renew', 'LIC', licenceId), body),
  suspend: (licenceId: string, body: { version: number; reason: string; evidence?: Row }): Promise<ApiResult<{ transition: Row; receipt: Receipt }>> =>
    call(`/v1/commercial/grace/licences/${licenceId}/suspend`, P('commercial.licence.suspend', 'LIC', licenceId), body),
  reinstate: (licenceId: string, body: { version: number; reason: string; evidence?: Row }): Promise<ApiResult<{ transition: Row; receipt: Receipt }>> =>
    call(`/v1/commercial/grace/licences/${licenceId}/reinstate`, P('commercial.licence.reinstate', 'LIC', licenceId), body),
  setPolicy: (body: { tenantId: string; expectedVersion: number; graceDays: number; allows: string[]; renewalNoticeDays: number; reason: string }): Promise<ApiResult<{ policy: Row; receipt: Receipt }>> =>
    call('/v1/commercial/grace/policies/set', P('commercial.grace.set', 'GRP'), body),
  issueToken: (licenceId: string, body: { version: number; profile: 'disconnected' | 'air-gapped'; expiresAt: string; keyRef: string; reason: string }): Promise<ApiResult<{ record: Row; token: Row; receipt: Receipt }>> =>
    call(`/v1/commercial/grace/licences/${licenceId}/offline-token`, P('commercial.offline_token.issue', 'LTK'), body),
};

/* ───────────── the words ───────────── */
/** A licence state as a label and the design token that colours it (never colour alone: the label carries the state). */
export function stateLabel(s: LicenceState | string): { text: string; token: string } {
  switch (s) {
    case 'active': return { text: 'ACTIVE', token: '--eye-color-success' };
    case 'grace': return { text: 'GRACE', token: '--eye-color-warning' };
    case 'suspended': return { text: 'SUSPENDED', token: '--eye-color-critical' };
    case 'lapsed': return { text: 'LAPSED', token: '--eye-color-critical' };
    case 'uncontracted': return { text: 'UNCONTRACTED — the availability gate does not apply', token: '--eye-color-ink-muted' };
    default: return { text: String(s).toUpperCase(), token: '--eye-color-ink-muted' };
  }
}
/** What grace allows, worded. */
export function allowsText(allows: string[]): string {
  const words: Record<string, string> = { read_and_preserve: 'read and preserve every record', finish_running_work: 'finish running work', new_work: 'start new work' };
  return allows.map((a) => words[a] ?? a).join('; ');
}
/** A transition as one line: what moved, why, by whom. */
export function transitionLine(t: Transition): string {
  const by = t.actor_kind === 'tick' ? 'the attention tick' : 'the commercial authority';
  const moved = t.kind === 'renewal_notice' ? 'renewal notice' : `${t.from_state} → ${t.to_state}`;
  return `v${t.version} ${t.kind.replace('_', ' ')} (${moved}; ${t.cause.replace(/_/g, ' ')}) by ${by} — ${t.reason}`;
}
/** A usage line against its limit, when the licence names one for the dimension. */
export function usageText(u: UsageLine): string {
  const q = Number(u.quantity).toLocaleString('en-GB');
  return u.limit === null ? `${q} ${u.unit} (${u.records} record${u.records === 1 ? '' : 's'}; no limit named for ${u.dimension})`
    : `${q} of ${u.limit.toLocaleString('en-GB')} ${u.unit} (${((u.share ?? 0) * 100).toFixed(1)}%)`;
}
