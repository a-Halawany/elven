/**
 * The acceptance-records client — CP-6 B107 §AR (0115_b107_x_ar; F-R0-04, ES-71-*, IA/DP-71-*, PAT-48, OBJ-40, JRN-24, FEX-31): the domain's
 * scope-specific acceptance records (every version), the evidence vault with currency, the accepted-scope answer per subject (accepted /
 * constrained / suspended / lapsed / proposed only / NOT ACCEPTED), the JRN-24 journey, OBJ-40's attestation preview (eligibility, the exact
 * digest, the consequence), the review triggers and expansion holds, and the vendor's enforce_acceptance register.
 *
 * Every response is returned VERBATIM: the server decides who may attest, what is current, what is in force and what is held; the helpers
 * below only WORD the record. Every record is claim = demonstration; the attesters on a demonstration are SYNTHETIC personas; real acceptance
 * by named independent and customer authorities is R2 and is never shown here.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface RecordVersion {
  record_id: string; version: number; kind: string; title: string; subject_key: string; subject_digest: string; scope_tuple: Row; obligations: string[]; evidence: Row[];
  conditions: Row[]; exceptions: Row[]; operational: Row | null; digest: string; state: string; effective_scope: Row | null; constrained_reasons: Row[]; claim: string;
  real_acceptance: string; proposed_by: string; proposed_by_name: string | null; proposed_at: string; accepted_at: string | null; constrained_at: string | null; ended_at: string | null;
  end_reason: string | null; attestations: Row[]; verification: Row | null; conditions_met: Row[]; signatures: Row[];
}
export interface ScopeAnswer {
  subject: string; state: string; record: Row | null; accepted_scope: Row | null; effective_scope: Row | null; removed: Row | null; evidence: Row[] | null;
  proposal: { record_id: string; version: number; digest: string; unmet: string[] } | null; expansion_held: boolean; enforcement: Row | null; read_at: string; boundary: string;
}
export interface Workspace {
  records: RecordVersion[]; journeys: Record<string, Row | null>; scopes: ScopeAnswer[]; evidence: Row[]; triggers: Row[]; holds: Row[]; enforcement: Row[]; subjects: Row[];
  exceptions: Row[]; items: Row[]; tasks: Row[]; ledger: Row[]; read_at: string; signer: { key_id?: string } | null; boundary: string; receipt: Receipt;
}
export interface Eligibility { record_id: string; version: number; digest: string; can_verify: boolean; obligations: Array<{ obligation: string; roles: string[]; can_attest: boolean; reasons: string[]; attested: Row | null }> }
export interface Preview { record: RecordVersion; eligibility: Eligibility; journey: Row | null; findings: Row[]; consequence: string[]; read_at: string; boundary: string; receipt: Receipt }

const ctx = (tenantId: string, domainId: string, action: string, objectId: string | null = null) => ({
  scope: 'DOMAIN' as const, tenant_id: tenantId, domain_id: domainId, purpose_id: 'governance', action, object_type: 'ACR', object_id: objectId,
  side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const, consequence_class: 'C2' as const,
});
const base = (t: string, d: string) => `/v1/tenants/${t}/domains/${d}/governance/acceptance`;

export const ar = {
  workspace: (t: string, d: string): Promise<ApiResult<Workspace>> => call(`${base(t, d)}/read`, ctx(t, d, 'governance.acceptance.read')),
  scope: (t: string, d: string, subjectKey: string): Promise<ApiResult<{ scope: ScopeAnswer; receipt: Receipt }>> => call(`${base(t, d)}/scope/read`, ctx(t, d, 'governance.acceptance.read'), { subjectKey }),
  preview: (t: string, d: string, recordId: string, version: number): Promise<ApiResult<Preview>> =>
    call(`${base(t, d)}/records/${recordId}/preview`, ctx(t, d, 'governance.acceptance.read', recordId), { version }),
  history: (t: string, d: string, recordId: string): Promise<ApiResult<{ events: Row[]; receipt: Receipt }>> =>
    call(`${base(t, d)}/records/${recordId}/history`, ctx(t, d, 'governance.acceptance.read', recordId)),
  verify: (t: string, d: string, recordId: string, p: { version: number; digest: string; outcome: 'verified' | 'not_verified'; findings: string }): Promise<ApiResult<{ verification: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/records/${recordId}/verify`, ctx(t, d, 'governance.acceptance.verify', recordId), p),
  attest: (t: string, d: string, recordId: string, p: { version: number; obligation: string; decision: 'attest' | 'withhold'; digest: string; reason: string }): Promise<ApiResult<{ attestation: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/records/${recordId}/attest`, ctx(t, d, 'governance.acceptance.attest', recordId), p),
  withdraw: (t: string, d: string, recordId: string, reason: string): Promise<ApiResult<{ record: Row; receipt: Receipt }>> =>
    call(`${base(t, d)}/records/${recordId}/withdraw`, ctx(t, d, 'governance.acceptance.withdraw', recordId), { reason }),
  sweep: (t: string, d: string): Promise<ApiResult<{ sweep: Row; receipt: Receipt }>> => call(`${base(t, d)}/sweep`, ctx(t, d, 'governance.acceptance.sweep')),
  enforcement: (): Promise<ApiResult<{ enforcement: Row[]; subjects: Row[]; read_at: string; receipt: Receipt }>> =>
    call('/v1/platform/governance/acceptance/enforcement/read', { scope: 'PLATFORM', action: 'governance.acceptance.read', object_type: 'CAP', purpose_id: 'governance', side_effect_class: 'none' }),
};

// ── wording (never judging) ──────────────────────────────────────────────────────────────────────
/** A version's standing in words: a PROPOSAL is never worded like an acceptance; constrained and suspended say what is still in force. */
export function stateText(r: Pick<RecordVersion, 'state' | 'accepted_at' | 'end_reason'>): string {
  switch (r.state) {
    case 'proposed': return 'PROPOSED — not accepted; awaits every obligation\'s named attester';
    case 'accepted': return `ACCEPTED for its exact scope${r.accepted_at ? ` since ${r.accepted_at}` : ''} (claim: demonstration)`;
    case 'constrained': return 'CONSTRAINED — in force only within the previously accepted, unaffected scope; expansion held until re-acceptance';
    case 'suspended': return 'SUSPENDED — nothing of it is in force';
    case 'lapsed': return 'LAPSED — its period ended; nothing of it is in force';
    case 'withheld': return `WITHHELD — an obligation was withheld${r.end_reason ? `: ${r.end_reason}` : ''}`;
    case 'withdrawn': return `WITHDRAWN${r.end_reason ? ` — ${r.end_reason}` : ''}`;
    case 'superseded': return 'SUPERSEDED — kept, no longer in force';
    default: return r.state.toUpperCase();
  }
}
/** The accepted-scope answer in words (FEX-31): nothing is shown accepted by inference — no record in force reads NOT ACCEPTED. */
export function scopeText(s: Pick<ScopeAnswer, 'state' | 'expansion_held'>): string {
  const held = s.expansion_held ? ' · expansion held in this tenant' : '';
  switch (s.state) {
    case 'accepted': return `accepted here${held}`;
    case 'constrained': return `CONSTRAINED here — the unaffected scope only${held}`;
    case 'suspended': return `SUSPENDED here${held}`;
    case 'lapsed': return `LAPSED here${held}`;
    case 'proposed_only': return `NOT ACCEPTED — a proposal awaits attestation${held}`;
    default: return `NOT ACCEPTED in this domain${held}`;
  }
}
export type Tone = 'in_force' | 'restricted' | 'none' | 'proposal';
export function tone(state: string): Tone {
  if (state === 'accepted') return 'in_force';
  if (state === 'constrained') return 'restricted';
  if (state === 'proposed' || state === 'proposed_only') return 'proposal';
  return 'none';
}
/** An evidence item's validity on the read's clock: current, expiring within the window, expired, failed or renewed. */
export function evidenceText(e: { valid_until: string; outcome?: string; renewed_by?: string | null }, readAt: string, soonMs = 7 * 86_400_000): string {
  if (e.outcome === 'failed') return 'FAILED — remediate and retest';
  if (e.renewed_by) return 'RENEWED by a later item';
  const left = Date.parse(e.valid_until) - Date.parse(readAt);
  if (left <= 0) return `EXPIRED at ${e.valid_until}`;
  if (left <= soonMs) return `expires soon — ${Math.max(1, Math.round(left / 3_600_000))} h left`;
  return `current until ${e.valid_until}`;
}
/** The obligations still unattested on a version (partial attestation is visible as such). */
export function unmet(r: Pick<RecordVersion, 'obligations' | 'attestations'>): string[] {
  const done = new Set(r.attestations.filter((a) => a['decision'] === 'attest').map((a) => String(a['obligation'])));
  return r.obligations.filter((o) => !done.has(o));
}
/** The newest version of every record, newest first (the workspace's list), and the older versions behind it. */
export function latestVersions(rs: RecordVersion[]): RecordVersion[] {
  const seen = new Map<string, RecordVersion>();
  for (const r of rs) { const cur = seen.get(r.record_id); if (cur === undefined || r.version > cur.version) seen.set(r.record_id, r); }
  return [...seen.values()].sort((a, b) => (a.proposed_at < b.proposed_at ? 1 : -1));
}
/** The in-force version of a record (accepted / constrained / suspended / lapsed), if any — it may sit beside a newer PROPOSED version. */
export function inForce(rs: RecordVersion[], recordId: string): RecordVersion | null {
  return rs.find((r) => r.record_id === recordId && ['accepted', 'constrained', 'suspended', 'lapsed'].includes(r.state)) ?? null;
}
/** OBJ-40's deliberate action: the attester types the first 8 characters of the digest it was shown. */
export function confirmsDigest(typed: string, digest: string): boolean { return typed.trim().length >= 8 && digest.startsWith(typed.trim().toLowerCase()); }
/** A DATE renders as the day it names (never shifted by a time zone). */
export function dayText(v: unknown): string { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; }
export function shortDigest(d: unknown): string { const s = String(d ?? ''); return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-4)}` : s; }
export function list(v: unknown): string { return Array.isArray(v) ? v.map(String).join(', ') : '—'; }
/** Guards a page that loads by selection: only the newest request's answer is applied. */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, isLatest: (n: number) => n === seq };
}
