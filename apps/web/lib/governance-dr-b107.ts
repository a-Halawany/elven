/**
 * The data governance and ownership client — CP-6 B107 §DR (0115_b107_x_dr; F-P7D-25: V00-T-082, ES-04/-11, DP-01/-04/-55, DAT-GV-01..10,
 * PER-19; the B90 residuals DP-49-005/-006, DP-41-005). DOMAIN: the responsibility portal, the data authorities (resolved live), the
 * domain registry entry, the ownership gaps, the stewardship cases, the evidence records, the data product registry view. PLATFORM: the data
 * capability inventory, component ownership and its ratified transfers, the PLATFORM gaps, the owned-contract lint.
 *
 * Every response is returned VERBATIM: who owns what, whether a duty resolves, who may ratify or review, what is held — the SERVER's (the
 * ports re-check every rule). The helpers below only WORD the record. Every persona and record on a demonstration is SYNTHETIC; an
 * attested evidence record is demonstration evidence — production admission is R1.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface Duty { state: string; principal?: string | null; name?: string | null; role?: string; holders?: string[]; ref?: string; roles?: string[] }
export interface Resolution {
  authority_id: string; state: 'undeclared' | 'proposed' | 'resolved' | 'unresolved' | string; asset: Row; ratified: Row | null; proposal: Row | null;
  duties: Record<string, Duty>; unresolved: string[]; escalation_path: string | null; recertification: Row | null; catalog_agreement: Row | null; gaps: Row[]; holds: Row[];
}
export interface Portal {
  portal: { at: string; profile: string; domain: Row; customer_duties: { matrix: Row; responsibilities: Row[]; data_authorities: Row[] }; platform_duties: { components: Row[]; capabilities: Row[]; operator_rule: string };
            approvals: Row[]; evidence: Row[]; escalations: { gaps: Row[]; cases: Row[] } };
  cases: Row[]; gaps: Row[]; domain_entries: Row[]; evidence: Row[]; ledger: Row[]; read_at: string; boundary: string; receipt: Receipt;
}
export interface AssetRead { resolution: Resolution; versions: Row[]; holds: Row[]; ledger: Row[]; read_at: string; boundary: string; receipt: Receipt }
export interface CasePreview { case: Row; eligibility: { can_review: boolean; reasons: string[] }; holds: Row[]; read_at: string; receipt: Receipt }
export interface PlatformRead { capabilities: Row[]; components: Row[]; transfers: Row[]; gaps: Row[]; read_at: string; signer: string | null; boundary: string; receipt: Receipt }
export interface TransferPreview { transfer: Row; signatures: Row[]; eligibility: { can_ratify: boolean; can_accept: boolean; reasons: string[] }; read_at: string; receipt: Receipt }

const dctx = (t: string, d: string, action: string, objectType: string, objectId: string | null = null) => ({
  scope: 'DOMAIN' as const, tenant_id: t, domain_id: d, purpose_id: 'governance', action, object_type: objectType, object_id: objectId,
  side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const,
});
const pctx = (action: string, objectType: string, objectId: string | null = null) => ({
  scope: 'PLATFORM' as const, tenant_id: null, domain_id: null, purpose_id: 'governance', action, object_type: objectType, object_id: objectId,
  side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const,
});
const dbase = (t: string, d: string) => `/v1/tenants/${t}/domains/${d}/governance/ownership`;
const PBASE = '/v1/governance/ownership';
type W<K extends string> = Promise<ApiResult<Record<K, Row> & { receipt: Receipt }>>;

export const dr = {
  // ── DOMAIN ──
  portal: (t: string, d: string): Promise<ApiResult<Portal>> => call(`${dbase(t, d)}/portal/read`, dctx(t, d, 'governance.ownership.read', 'GDR'), {}),
  asset: (t: string, d: string, assetId: string): Promise<ApiResult<AssetRead>> => call(`${dbase(t, d)}/assets/${assetId}/read`, dctx(t, d, 'governance.ownership.read', 'GDA', assetId)),
  products: (t: string, d: string): Promise<ApiResult<{ products: Row[]; read_at: string; receipt: Receipt }>> => call(`${dbase(t, d)}/products/read`, dctx(t, d, 'governance.ownership.read', 'PDP')),
  casePreview: (t: string, d: string, caseId: string): Promise<ApiResult<CasePreview>> => call(`${dbase(t, d)}/cases/${caseId}/preview`, dctx(t, d, 'governance.ownership.read', 'STW', caseId)),
  acceptAuthority: (t: string, d: string, assetId: string, p: { version: number; digest: string }): W<'authority'> =>
    call(`${dbase(t, d)}/authorities/${assetId}/accept`, dctx(t, d, 'governance.ownership.authority.accept', 'GDA', assetId), p),
  decideAuthority: (t: string, d: string, assetId: string, p: { version: number; digest: string; decision: 'ratify' | 'reject'; reason: string }): W<'authority'> =>
    call(`${dbase(t, d)}/authorities/${assetId}/decide`, dctx(t, d, 'governance.ownership.authority.ratify', 'GDA', assetId), p),
  recertify: (t: string, d: string, assetId: string): W<'authority'> => call(`${dbase(t, d)}/authorities/${assetId}/recertify`, dctx(t, d, 'governance.ownership.authority.recertify', 'GDA', assetId)),
  decideDomain: (t: string, d: string, p: { version: number; digest: string; decision: 'ratify' | 'reject'; reason: string }): W<'entry'> =>
    call(`${dbase(t, d)}/domain/decide`, dctx(t, d, 'governance.ownership.domain.ratify', 'GDM', d), p),
  reconcile: (t: string, d: string): W<'reconciliation'> => call(`${dbase(t, d)}/reconcile`, dctx(t, d, 'governance.ownership.reconcile', 'GDR')),
  acceptGap: (t: string, d: string, gapId: string, p: { until: string; reason: string }): W<'gap'> => call(`${dbase(t, d)}/gaps/${gapId}/accept`, dctx(t, d, 'governance.ownership.gap.accept', 'GOG', gapId), p),
  reviewCase: (t: string, d: string, caseId: string, p: { digest: string; outcome: 'approve' | 'reject'; note: string; conditions: string[] | null; expiresAt: string | null }): W<'case'> =>
    call(`${dbase(t, d)}/cases/${caseId}/review`, dctx(t, d, 'governance.ownership.case.review', 'STW', caseId), p),
  closeCase: (t: string, d: string, caseId: string, p: { note: string; evidence: Row[] }): W<'case'> => call(`${dbase(t, d)}/cases/${caseId}/close`, dctx(t, d, 'governance.ownership.case.close', 'STW', caseId), p),
  attest: (t: string, d: string, recordId: string, p: { digest: string; decision: 'attest' | 'reject'; reason: string }): W<'record'> =>
    call(`${dbase(t, d)}/evidence/${recordId}/attest`, dctx(t, d, 'governance.ownership.evidence.attest', 'GRE', recordId), p),
  // ── PLATFORM ──
  platform: (): Promise<ApiResult<PlatformRead>> => call(`${PBASE}/read`, pctx('governance.ownership.read', 'GCO')),
  lint: (): Promise<ApiResult<{ lint: Row; owners: number; read_at: string; receipt: Receipt }>> => call(`${PBASE}/lint/read`, pctx('governance.ownership.read', 'GCO')),
  reconcileCapability: (id: string): W<'capability'> => call(`${PBASE}/capabilities/${id}/reconcile`, pctx('governance.ownership.capability.reconcile', 'GDC', id)),
  acceptCapability: (id: string, p: { version: number; digest: string }): W<'capability'> => call(`${PBASE}/capabilities/${id}/accept`, pctx('governance.ownership.capability.accept', 'GDC', id), p),
  admitCapability: (id: string, p: { version: number; digest: string; reason: string }): W<'capability'> => call(`${PBASE}/capabilities/${id}/admit`, pctx('governance.ownership.capability.admit', 'GDC', id), p),
  transferPreview: (id: string): Promise<ApiResult<TransferPreview>> => call(`${PBASE}/transfers/${id}/preview`, pctx('governance.ownership.read', 'GCT', id)),
  acceptTransfer: (id: string, digest: string): W<'transfer'> => call(`${PBASE}/transfers/${id}/accept`, pctx('governance.ownership.component.accept', 'GCT', id), { digest }),
  decideTransfer: (id: string, p: { digest: string; decision: 'ratify' | 'reject'; reason: string }): W<'transfer'> => call(`${PBASE}/transfers/${id}/decide`, pctx('governance.ownership.component.ratify', 'GCT', id), p),
  acceptPlatformGap: (gapId: string, p: { until: string; reason: string }): W<'gap'> => call(`${PBASE}/gaps/${gapId}/accept`, pctx('governance.ownership.platform_gap.accept', 'GOG', gapId), p),
};

// ── wording (never judging) ──────────────────────────────────────────────────────────────────────
const DUTY_TEXT: Record<string, string> = {
  resolved: '● resolved', declared: '● declared', lost: '⊘ LOST — no longer an active human of the tenant', unfilled: '⊘ UNFILLED — nobody holds the role',
  ambiguous: '◐ AMBIGUOUS — several hold the role and none is named',
};
export function dutyText(d: Duty | undefined): string {
  if (d === undefined) return '○ undeclared';
  const who = d.name ?? d.principal ?? d.ref ?? (d.role !== undefined ? `${d.role}${d.holders !== undefined ? ` (${d.holders.length} holder${d.holders.length === 1 ? '' : 's'})` : ''}` : '');
  return `${DUTY_TEXT[d.state] ?? d.state}${who !== '' ? ` · ${who}` : ''}`;
}
export function isGapDuty(d: Duty | undefined): boolean { return d === undefined || !['resolved', 'declared'].includes(d.state); }
/** An authority's standing: a PROPOSAL is never worded like a ratification. */
export function authorityStateText(state: unknown, ownerAccepted = false): string {
  switch (state) {
    case 'ratified': return 'RATIFIED — in force';
    case 'proposed': return ownerAccepted ? 'PROPOSED — the named owner ACCEPTED; awaits ratification by another named human' : 'PROPOSED — not in force; awaits the named owner\'s acceptance';
    case 'undeclared': return '○ UNDECLARED — no ratified authority (a material asset is an ownership gap)';
    case 'superseded': return 'SUPERSEDED — kept, no longer in force';
    case 'rejected': return 'REJECTED';
    default: return String(state ?? '');
  }
}
export function resolutionText(r: Pick<Resolution, 'state' | 'unresolved'>): string {
  switch (r.state) {
    case 'resolved': return '● every duty resolves';
    case 'unresolved': return `⊘ UNRESOLVED — ${r.unresolved.length > 0 ? r.unresolved.join(', ') : 'the registry and the catalog disagree'} (dependent acts stop; the gap is held)`;
    case 'proposed': return '◌ a proposal only — nothing is in force';
    default: return '○ undeclared — no authority';
  }
}
export function gapText(g: Row): string {
  const kind = String(g['gap_kind'] ?? '').replace(/_/g, ' ');
  switch (g['state']) {
    case 'open': return `OPEN · ${kind}${g['held'] === true ? ' · HELD (new consumption and authoritative changes stop)' : ' · listed (the domain observes)'}`;
    case 'escalated': return `ESCALATED (level ${String(g['escalations'] ?? 1)}) · ${kind}${g['held'] === true ? ' · HELD' : ''}`;
    case 'accepted': return `ACCEPTED until ${dayText(g['accepted_until'])} · ${kind} · residual accepted by ${String(g['accepted_by_name'] ?? g['accepted_by'] ?? '—')} — still listed`;
    case 'resolved': return `resolved · ${kind}`;
    default: return String(g['state'] ?? '');
  }
}
export function isLiveGap(g: Row): boolean { return g['state'] === 'open' || g['state'] === 'escalated'; }
/** A case's standing on the read's clock: an undecided case past its due instant is OVERDUE (the sweep escalates it). */
export function caseStateText(c: Row, readAt: string): string {
  const s = String(c['state'] ?? '');
  if ((s === 'open' || s === 'in_review') && typeof c['due_at'] === 'string' && Date.parse(c['due_at']) <= Date.parse(readAt)) return `OVERDUE since ${String(c['due_at'])} — escalates by consequence`;
  switch (s) {
    case 'open': return `OPEN — due ${String(c['due_at'] ?? '')}${c['owner_principal_id'] === null ? ' · NO ACCOUNTABLE OWNER (held; approval blocked)' : ''}`;
    case 'in_review': return `IN REVIEW — ${String(c['approvals'] ?? 0)} of ${String(c['reviewers_required'] ?? 1)} approvals`;
    case 'approved': return `APPROVED${c['expires_at'] !== null && c['expires_at'] !== undefined ? ` until ${String(c['expires_at'])}` : ''} — to be closed with evidence`;
    case 'expired': return `EXPIRED at ${String(c['expires_at'] ?? '')} — the subject is HELD until the case is closed`;
    case 'rejected': return 'REJECTED — to be closed';
    case 'closed': return 'CLOSED';
    case 'withdrawn': return 'WITHDRAWN';
    default: return s;
  }
}
/** What a reviewer's approval does, in words (the server decides). */
export function caseConsequenceLines(c: Row): string[] {
  const req = Number(c['reviewers_required'] ?? 1); const have = Number(c['approvals'] ?? 0);
  return [
    `${String(c['case_ref'] ?? '')} (${String(c['kind'] ?? '').replace(/_/g, ' ')}, ${String(c['consequence'] ?? '')}) on ${String(c['subject_label'] ?? '')}`,
    `Proposed action: ${String(c['proposed_action'] ?? '')}`,
    have + 1 >= req ? 'Your approval DECIDES the case (the SLA timer is cancelled, its holds lift)' : `Your approval is ${have + 1} of ${req} — another named reviewer decides`,
    String(c['kind']) === 'data_exception' ? 'A data exception EXPIRES: name its expiry (within 366 days); past it the subject is held until closure' : 'Conditions you state must each be evidenced at closure',
    'Never: the one who opened it; for access and exceptions, never the subject\'s owner',
  ];
}
/** What a ratification does, in words. */
export function transferConsequenceLines(t: Row): string[] {
  const p = (t['proposal'] ?? {}) as Row;
  const items = Object.keys((t['checklist'] ?? {}) as Row);
  return [
    `${String(t['component_key'] ?? '')}: ownership ${t['from_version'] === null || t['from_version'] === undefined ? 'assigned for the first time' : `v${String(t['from_version'])} → v${Number(t['from_version']) + 1}`} to ${String(p['owning_team'] ?? '')}`,
    `Contacts: primary and secondary named; operator role ${String(p['operator_role'] ?? '')} (content only under an approved support purpose)`,
    `Owned contracts: ${((p['owned_contracts'] ?? []) as string[]).join(', ')}`,
    `Handover checklist: ${items.length} of 9 items with references; open exceptions handed over: ${((t['open_exceptions'] ?? []) as Row[]).length}`,
    'Your ratification is SIGNED (Ed25519, by key reference) over the exact digest; never by the proposer or either party',
  ];
}
export function capabilityStateText(c: Row): string {
  const conf = String(c['conformance'] ?? 'unreconciled');
  const adm = c['admission'] === 'admitted' ? 'ADMITTED to the governed inventory' : 'not admitted';
  const held = ((c['holds'] ?? []) as Row[]).length;
  return `${conf.toUpperCase()} · ${adm}${held > 0 ? ` · HELD (${held})` : ''}`;
}
/** Conditions typed one per line; blank lines dropped. */
export function conditionsOf(text: string): string[] { return text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0); }
/** An instant N days after the read's clock (the acceptance date a residual is accepted until). */
export function daysAfter(readAt: string, days: number): string { return new Date(Date.parse(readAt) + days * 86_400_000).toISOString(); }
/** A DATE renders as the day it names (never shifted by a time zone). */
export function dayText(v: unknown): string { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; }
export function shortDigest(d: unknown): string { const s = String(d ?? ''); return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-4)}` : s; }
/** Guards a page that loads by selection: only the newest request's answer is applied. */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, isLatest: (n: number) => n === seq };
}
