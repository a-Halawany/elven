/**
 * The customer control center client — CP-6 B94 §SA (0114_b94_x_sa; CAP-TR-12, IA-04-001..006, PR-69-003, PER-20): the responsibility
 * matrix and its accountable owners (gaps visible), support grants (pending / live / ended) with their approval preview, the access log,
 * customer-control drills, joint exercises and the admission record.
 *
 * Every response is returned VERBATIM: the server decides who owns what (service.owner_resolution, read live), whether a grant is live
 * (service.live_grant on the database clock), who may approve (the port's approver test) — the helpers below only WORD the record. Every
 * persona and record on a demonstration is SYNTHETIC; an admission record is construction evidence, never a production admission (R1).
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface Resolution { state: 'resolved' | 'unfilled' | 'ambiguous' | 'undeclared' | string; responsibility?: string; owner_role?: string; principals?: string[]; reason?: string | null; escalation_path?: string; owner_principal_id?: string | null }
export interface Grant {
  grant_id: string; case_id: string; case_ref: string; severity: string; case_title: string; engineer_principal_id: string; engineer_name: string | null; purpose: string;
  object_scope: { sources?: string[] }; action_scope: string[]; duration_minutes: number; state: string; requested_at: string; decided_by: string | null; decided_by_name?: string | null;
  decided_at: string | null; starts_at: string | null; expires_at: string | null; ended_at: string | null; end_reason: string | null; request_digest: string;
  preview: Row | null; reads_allowed?: number; reads_refused?: number; sources?: Array<{ source_id: string; name: string; source_key: string }>;
}
export interface ControlCenter {
  profile: string; matrices: Row[]; approved: Row | null; owners: Array<Row & { resolution: Resolution }>; support_access_owner: Resolution; reconciliations: Row[]; grants: Grant[];
  access_log: Row[]; drills: Row[]; exercises: Row[]; admissions: Row[]; items: Row[]; ledger: Row[]; cases: Row[]; residency: Row; read_at: string;
  links: { exports: { route: string; action: string; note: string }; signing_keys: { route: string; action: string; note: string }; executive_signer: { key_id?: string } | null };
  boundary: string; receipt: Receipt;
}
export interface Preview { grant: Grant; owner: Resolution; eligibility: { can_decide: boolean; reasons: string[] }; read_at: string; boundary: string; receipt: Receipt }

const ctx = (tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null = null) => ({
  scope: 'DOMAIN' as const, tenant_id: tenantId, domain_id: domainId, purpose_id: 'service', action, object_type: objectType, object_id: objectId,
  side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const,
});
const base = (t: string, d: string) => `/v1/tenants/${t}/domains/${d}/support`;

export const sa = {
  controlCenter: (t: string, d: string, profile = 'local-dev'): Promise<ApiResult<ControlCenter>> => call(`${base(t, d)}/control-center/read`, ctx(t, d, 'service.read', 'RSM'), { profile }),
  preview: (t: string, d: string, grantId: string): Promise<ApiResult<Preview>> => call(`${base(t, d)}/grants/${grantId}/preview`, ctx(t, d, 'service.read', 'SGR', grantId)),
  decideGrant: (t: string, d: string, grantId: string, p: { decision: 'approve' | 'deny'; digest: string; reason: string }): Promise<ApiResult<{ grant: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/grants/${grantId}/decide`, ctx(t, d, 'service.grant.decide', 'SGR', grantId), p),
  revokeGrant: (t: string, d: string, grantId: string, reason: string): Promise<ApiResult<{ grant: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/grants/${grantId}/revoke`, ctx(t, d, 'service.grant.revoke', 'SGR', grantId), { reason }),
  runDrill: (t: string, d: string, p: { kind: 'revoke_live_grant' | 'expired_grant_refused'; grantId: string; reason: string }): Promise<ApiResult<{ drill: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/drills/run`, ctx(t, d, 'service.drill.run', 'SGR', p.grantId), p),
  reconcile: (t: string, d: string, profile = 'local-dev'): Promise<ApiResult<{ reconciliation: Row; receipt: Receipt }>> => call(`${base(t, d)}/reconcile`, ctx(t, d, 'service.responsibility.reconcile', 'RSM'), { profile }),
  decideMatrix: (t: string, d: string, matrixId: string, p: { version: number; decision: 'approve' | 'reject'; digest: string; reason: string }): Promise<ApiResult<{ matrix: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/matrix/${matrixId}/decide`, ctx(t, d, 'service.matrix.decide', 'RSM', matrixId), p),
  decideAdmission: (t: string, d: string, admissionId: string, p: { version: number; decision: 'sign' | 'reject'; digest: string; reason: string }): Promise<ApiResult<{ admission: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/admission/${admissionId}/decide`, ctx(t, d, 'service.admission.decide', 'SAR', admissionId), p),
  /** The existing retention routes the control center links to (read-only here). */
  exports: (t: string, d: string): Promise<ApiResult<{ actions: Row[]; receipt: Receipt }>> =>
    call(`/v1/tenants/${t}/domains/${d}/retention/actions/list`, { ...ctx(t, d, 'retention.read', 'RTA'), purpose_id: 'retention' }, { limit: 20 }),
  signingKeys: (t: string, d: string): Promise<ApiResult<{ keys: Row[]; receipt: Receipt }>> =>
    call(`/v1/tenants/${t}/domains/${d}/retention/signing-keys/list`, { ...ctx(t, d, 'retention.read', 'RSK'), purpose_id: 'retention' }),
};

// ── wording (never judging) ──────────────────────────────────────────────────────────────────────
export type GrantView = 'pending' | 'live' | 'expired' | 'ended';
/** Which list a grant belongs to on the database's clock (the read's instant): an approved grant past its expiry is EXPIRED — refused
 *  already — even before the sweep marks it lapsed; it is never shown live. */
export function grantView(g: Pick<Grant, 'state' | 'expires_at'>, readAt: string): GrantView {
  if (g.state === 'requested') return 'pending';
  if (g.state === 'approved') return g.expires_at !== null && Date.parse(g.expires_at) <= Date.parse(readAt) ? 'expired' : 'live';
  return 'ended';
}
export function grantStateText(g: Pick<Grant, 'state' | 'expires_at' | 'end_reason'>, readAt: string): string {
  switch (grantView(g, readAt)) {
    case 'pending': return 'REQUESTED — awaiting the customer\'s decision (no access)';
    case 'live': return `LIVE until ${String(g.expires_at)} — every read is logged`;
    case 'expired': return `EXPIRED at ${String(g.expires_at)} — refused already; the sweep marks it lapsed`;
    default: return `${g.state.toUpperCase()}${g.end_reason !== null && g.end_reason !== undefined ? ` — ${g.end_reason}` : ''}`;
  }
}
/** Minutes left on the clock of the read (never negative; null when not live). */
export function minutesLeft(g: Pick<Grant, 'state' | 'expires_at'>, readAt: string): number | null {
  if (grantView(g, readAt) !== 'live' || g.expires_at === null) return null;
  return Math.max(0, Math.floor((Date.parse(g.expires_at) - Date.parse(readAt)) / 60_000));
}
const OWNER_TEXT: Record<string, string> = {
  resolved: '● resolved', unfilled: '⊘ UNFILLED — dependent acts stop', ambiguous: '◐ AMBIGUOUS — several hold the role and none is named; dependent acts stop',
  undeclared: '○ UNDECLARED — no approved matrix row; dependent acts stop',
};
export function ownerText(r: Resolution): string { return `${OWNER_TEXT[r.state] ?? r.state}${r.reason !== null && r.reason !== undefined && r.state !== 'resolved' ? ` (${r.reason})` : ''}`; }
export function isGap(r: Resolution): boolean { return r.state !== 'resolved'; }
/** The approval's consequence, in words (the server records the same preview on the grant). */
export function consequenceLines(g: Pick<Grant, 'case_ref' | 'purpose' | 'action_scope' | 'object_scope' | 'duration_minutes'>): string[] {
  const n = (g.object_scope.sources ?? []).length;
  const m = g.duration_minutes;
  const window = m >= 60 ? `${Math.floor(m / 60)} h${m % 60 === 0 ? '' : ` ${m % 60} min`}` : `${m} min`;
  return [
    `Case ${g.case_ref}: ${g.purpose}`,
    `Allows: ${g.action_scope.join(', ')} — on ${n} named source${n === 1 ? '' : 's'} only`,
    `For ${window} from your approval; then it lapses by itself (the session, the live-grant check in every read, the timer and the sweep)`,
    'Never: a write to your decisions, evidence, policy or source state; evidence content; another source',
    'Every read is logged with this grant; you can revoke it at any moment',
  ];
}
/** A DATE renders as the day it names (never shifted by a time zone). */
export function dayText(v: unknown): string { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; }
export function shortDigest(d: unknown): string { const s = String(d ?? ''); return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-4)}` : s; }
/** A matrix version's standing: a PROPOSAL is never worded like an approval. */
export function matrixStateText(m: Row): string {
  switch (m['state']) {
    case 'proposed': return 'PROPOSED — not in force; awaits the onboarding authority';
    case 'approved': return `APPROVED and SIGNED — in force${m['decided_at'] !== null && m['decided_at'] !== undefined ? ` since ${String(m['decided_at'])}` : ''}`;
    case 'superseded': return 'SUPERSEDED — kept, signed, no longer in force';
    case 'rejected': return 'REJECTED';
    default: return String(m['state']);
  }
}
/** Guards a page that loads by selection: only the newest request's answer is applied. */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, isLatest: (n: number) => n === seq };
}
