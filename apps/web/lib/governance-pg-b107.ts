/**
 * The product-governance workspace client — CP-6 B107 §PG (0115_b107_x_pg; F-P7-F-12 and F-P7D-25's exception service, conflict register,
 * change control and governance registry). Every route is PLATFORM (the vendor's registries): `{scope: 'PLATFORM', purpose_id: 'governance'}`.
 *
 * Every response is returned VERBATIM. The helpers below only WORD what the record says — the server decides who may approve, whether an
 * exception is in force, whether a release is held, whether a dimension conforms (the ports re-check every rule). A PROPOSAL is never worded
 * like an approval; an approved exception past its expiry is never shown in force; a dimension with nothing declared reads UNKNOWN, never
 * conformant. THREE CLAIMS: a signed baseline here is construction / demonstration (SYNTHETIC personas); the real executive attestation and
 * the independent release authorities are H3 — never claimed. EXCEPTIONS.md and the C15 SCX dispositions are shown READ ONLY.
 */
import { call, type ApiResult } from './api';

export type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface Eligibility { can_decide: boolean; reasons: string[] }
export interface Preview { subject: Row; digest: string; signature_kind: string | null; consequence: string; eligibility: Eligibility; awaiting?: string[]; boundary: string; receipt: Receipt }
export interface Hold { hold_id: string; subject_artifact: string; subject_kind: string | null; subject_key: string | null; subject_title: string | null; reason_kind: string; source_artifact: string | null;
  source_kind: string | null; source_key: string | null; reason: string; opened_at: string; lifted_at: string | null; lifted_by_name: string | null; lift_reason: string | null }
export interface Dimension { state: 'conformant' | 'non_conformant' | 'unknown' | string; [k: string]: unknown }
export interface RegisterRead { source: string; available: boolean; digest: string | null; entries: Row[]; note: string }
export interface Workspace {
  inventory: { capabilities: Row[]; domains: Row[]; orphans: string[]; lapsed: string[]; duplicates: Row[]; count: number };
  owners: Row[]; baselines: Row[]; rights: Row[]; exceptions: Row[]; ageing: { rows: Row[]; totals: Row; buckets: Record<string, number>; read_at: string };
  reviews: Row[]; conflicts: Row[]; changes: Row[]; records: Row[]; posture: { dimensions: Record<string, Dimension>; summary: Record<string, number>; rule: string; read_at: string };
  snapshots: Row[]; holds: Hold[]; release_candidates: Row[]; ledger: Row[]; caller: { principal: string; roles: string[]; human: boolean }; read_at: string;
  repository_registers: { engineering: RegisterRead; supply_chain: RegisterRead; read_on: string };
  signer: { bound: boolean; key_id?: string; note?: string }; boundary: string; receipt: Receipt;
}
export type DecisionKind = 'exception' | 'change' | 'baseline' | 'rights' | 'record' | 'conflict';

const PLATFORM = { scope: 'PLATFORM' as const, purpose_id: 'governance' };
const BASE = '/v1/governance/workspace';
type R<T> = Promise<ApiResult<T>>;

export const pg = {
  read: (): R<Workspace> => call(`${BASE}/read`, { ...PLATFORM, action: 'governance.read', object_type: 'GWS', side_effect_class: 'none' }),
  preview: (kind: DecisionKind, id: string, version: number): R<Preview> =>
    call(`${BASE}/preview`, { ...PLATFORM, action: 'governance.read', object_type: 'GWS', object_id: id, side_effect_class: 'none' }, { kind, id, version }),
  impact: (subjects: string[]): R<{ impact: Row; subjects: Row[]; receipt: Receipt }> =>
    call(`${BASE}/impact`, { ...PLATFORM, action: 'governance.read', object_type: 'GCP', side_effect_class: 'none' }, { subjects }),
  decide: (kind: Exclude<DecisionKind, 'conflict'>, id: string, payload: { version: number; decision: string; digest: string; reason: string }): R<Row & { receipt: Receipt }> => {
    const route = { exception: ['exceptions', 'governance.exception.decide', 'GEX'], change: ['changes', 'governance.change.decide', 'GCP'], baseline: ['baseline', 'governance.baseline.decide', 'PBL'],
                    rights: ['rights', 'governance.rights.decide', 'PDR'], record: ['records', 'governance.record.decide', 'GDR'] }[kind] as [string, string, string];
    return call(`${BASE}/${route[0]}/${id}/decide`, { ...PLATFORM, action: route[1], object_type: route[2], object_id: id }, payload);
  },
  resolveConflict: (id: string, payload: { mode: 'closure' | 'amendment'; prevailing: string; changeProposal?: string; rationale: string; digest: string }): R<{ conflict: Row; receipt: Receipt }> =>
    call(`${BASE}/conflicts/${id}/resolve`, { ...PLATFORM, action: 'governance.conflict.resolve', object_type: 'GCF', object_id: id }, payload),
  decideReview: (id: string, payload: { decision: 'remediation' | 'change_review'; plan?: string; owner?: string; dueOn?: string; changeProposal?: string; reason: string }): R<{ review: Row; receipt: Receipt }> =>
    call(`${BASE}/reviews/${id}/decide`, { ...PLATFORM, action: 'governance.remediation.decide', object_type: 'GRR', object_id: id }, payload),
  sweep: (): R<{ sweep: Row; receipt: Receipt }> => call(`${BASE}/exceptions/sweep`, { ...PLATFORM, action: 'governance.exception.sweep', object_type: 'GEX' }),
  recordPosture: (): R<{ posture: Row; receipt: Receipt }> => call(`${BASE}/posture/record`, { ...PLATFORM, action: 'governance.posture.record', object_type: 'GPS' }),
};

// ── wording (never judging) ────────────────────────────────────────────────────────────
export function dayText(v: unknown): string { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; }
export function shortDigest(d: unknown): string { const s = String(d ?? ''); return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-4)}` : s; }
/** Only the newest answer of a selection-driven load is applied (a stale response never shows another subject's digest). */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, isLatest: (n: number) => n === seq };
}

/** The visible family of a state: a proposal, in force, held / expired, ended. */
export type Tone = 'proposal' | 'in_force' | 'held' | 'ended';
export function toneOf(state: string): Tone {
  if (state === 'proposed' || state === 'open') return 'proposal';
  if (state === 'approved' || state === 'signed' || state === 'active') return 'in_force';
  if (state.startsWith('expired') || state === 'held') return 'held';
  return 'ended';
}

/** An exception's state, worded on the record's own effective state (an approved exception past its expiry is never in force). */
export function exceptionStateText(e: Row): string {
  const s = String(e['effective_state'] ?? e['state']);
  switch (s) {
    case 'proposed': return `PROPOSED — not in force; awaits ${((e['approver_roles'] ?? []) as string[]).join(' or ')} (never its owner or proposer)`;
    case 'approved': return `IN FORCE until ${String(e['expires_at'])} — approved by ${String(e['decided_by_name'] ?? e['decided_by'] ?? '')} (${String(e['decided_role'] ?? '')})`;
    case 'expired (sweep pending)': return `EXPIRED at ${String(e['expires_at'])} — no longer in force; the sweep will hold the affected promotion`;
    case 'expired': return `EXPIRED at ${String(e['expires_at'])} — the affected promotion is HELD until a renewal with current evidence`;
    case 'superseded': return 'SUPERSEDED by a renewal';
    case 'closed': return 'CLOSED on its exit criteria';
    case 'rejected': return 'REJECTED';
    case 'withdrawn': return 'WITHDRAWN';
    default: return s;
  }
}

/** A baseline / matrix / record / change version's standing; a proposal never reads like an approval. */
export function versionStateText(kind: 'baseline' | 'rights' | 'record' | 'change', r: Row): string {
  const s = String(r['state']);
  if (s === 'proposed') {
    if (kind === 'change') {
      const missing = (r['missing_plans'] ?? []) as string[];
      return missing.length > 0 ? `PROPOSED — NOT approvable: plans missing (${missing.join(', ')})` : `PROPOSED — awaits ${((r['required_roles'] ?? []) as string[]).join(' and ')}`;
    }
    if (kind === 'baseline' && ((r['gaps'] ?? []) as unknown[]).length > 0) return `PROPOSED — HELD: authority unresolved (${((r['gaps'] ?? []) as Row[]).map((g) => String(g['gap'])).join(', ')})`;
    return 'PROPOSED — not in force';
  }
  if (s === 'signed') return `SIGNED — the controlled baseline (${String(r['claim'] ?? 'demonstration')}; the real executive attestation is H3)`;
  if (s === 'approved') return kind === 'change' ? 'APPROVED (every required role signed)' : 'APPROVED and SIGNED — in force';
  if (s === 'active') return `ACTIVE — next review ${dayText(r['next_review_due'])}${r['review_overdue'] === true ? ' (OVERDUE)' : ''}`;
  return s.toUpperCase();
}

const REASON_TEXT: Record<string, string> = {
  exception_expired: 'an exception expired', conflict: 'a conformance conflict', evidence_stale: 'stale evidence', evidence_missing: 'missing evidence',
  acceptance_constrained: 'a constrained acceptance', conformance_drift: 'conformance drift', ownership_gap: 'an ownership gap',
};
/** A hold, as the record says it: what is held, why, by what — or lifted, by whom, why. */
export function holdText(h: Hold): string {
  const what = `${h.subject_key ?? h.subject_artifact}${h.subject_kind !== null ? ` (${h.subject_kind.replace('_', ' ')})` : ''}`;
  const why = `${REASON_TEXT[h.reason_kind] ?? h.reason_kind}${h.source_key !== null ? ` — ${h.source_key}` : ''}`;
  return h.lifted_at === null ? `HELD: ${what} by ${why}` : `LIFTED: ${what} (${why}) — ${h.lift_reason ?? ''}${h.lifted_by_name !== null ? ` · by ${h.lifted_by_name}` : ''}`;
}

/** A posture dimension: CONFORMANT only on a declaration and an observation that agree; UNKNOWN where nothing is declared. */
export function dimensionText(name: string, d: Dimension): string {
  const label = name.replace('_', ' ');
  if (d.state === 'unknown') return `${label}: UNKNOWN — nothing declared (never inferred conformant)`;
  return `${label}: ${d.state === 'conformant' ? 'CONFORMANT' : d.state === 'non_conformant' ? 'NON-CONFORMANT' : d.state}`;
}

/** The ageing buckets in their natural order (the server's object keys are unordered). */
export const BUCKETS = ['0-30', '31-90', '91-180', '>180'] as const;
export function bucketLine(b: Record<string, number> | undefined): string {
  return BUCKETS.map((k) => `${k} days: ${b?.[k] ?? 0}`).join(' · ');
}

/** A capability's ownership standing. */
export function standingText(c: Row): string {
  switch (c['standing']) {
    case 'owned': return `owned by ${String(c['owner_name'] ?? c['owner'])} (${String(c['owner_role'])})`;
    case 'lapsed': return `LAPSED — ${String(c['owner_name'] ?? c['owner'])} no longer holds ${String(c['owner_role'])}`;
    case 'orphan': return 'ORPHAN — no accountable owner';
    default: return String(c['standing']);
  }
}

/** A decision-rights row. */
export function rightsRowText(r: Row): string {
  const who = typeof r['principal'] === 'string' ? `${String(r['role'])} (named)` : String(r['role']);
  const d = r['delegate'] as Row | null | undefined;
  return `${String(r['subject'])} · ${String(r['duty'])} · ${who}${d !== null && d !== undefined ? ` · delegated until ${String(d['until'])}` : ''}`;
}

/** The read-only registers: an engineering entry past its expiry is REPORTED; a supply-chain disposition is SHOWN — neither is governed here. */
export function engineeringLine(e: Row): string {
  return e['expired'] === true
    ? `${String(e['id'])} — EXPIRED ${String(e['expiry_date'])} (${String(e['days_past_expiry'])} days) and still ${String(e['status'])} — REPORTED; the owner renews or closes it in EXCEPTIONS.md`
    : `${String(e['id'])} — ${String(e['status'])}, expires ${String(e['expiry_date'] ?? 'never stated')}`;
}
export function supplyChainLine(d: Row): string {
  return `${String(d['id'])} — ${String(d['package'])} ${String(d['installed_version'])} (${((d['severities'] ?? []) as string[]).join('/')}) in ${String(d['image'])} · expires ${String(d['expires_on'] ?? '—')}${d['expired'] === true ? ' (past — the C15 gate decides, not this workspace)' : ''}`;
}

/** The decisions a kind offers (a baseline is signed; the rest approve). */
export function decisionsOf(kind: DecisionKind): Array<{ decision: string; label: string; critical: boolean }> {
  if (kind === 'baseline') return [{ decision: 'sign', label: 'Sign the baseline', critical: false }, { decision: 'reject', label: 'Reject', critical: true }];
  if (kind === 'conflict') return [{ decision: 'closure', label: 'Resolve: the highest authority prevails', critical: false }];
  return [{ decision: 'approve', label: kind === 'record' ? 'Approve' : 'Approve and sign', critical: false }, { decision: 'reject', label: 'Reject', critical: true }];
}
