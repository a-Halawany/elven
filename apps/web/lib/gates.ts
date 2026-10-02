/**
 * CP-6 B34 (0090 §G) — the HUMAN GATE client (F-P6-04). Every act is a separate governed write with its own PDP action (HX-12); the
 * server evaluates the approval conditions, judges the independence of a decision-ready, the separation of an override and the
 * delegator's own authority, and records a HOLD before a commitment is tried. The helpers below only word what the record says and
 * shape what is sent; nothing here decides whether a gate is open.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

/** The typed condition vocabulary (decision.approval_condition_kinds()). */
export const CONDITION_KINDS = ['assumption_holds', 'indicator_state', 'claim_truth', 'warning_absent', 'date_before'] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];
export const CONDITION_STAGES = ['commit', 'monitor'] as const;
export interface TypedCondition { kind: ConditionKind; ref?: string; expected?: string; label: string; stages: Array<(typeof CONDITION_STAGES)[number]> }
/** The seven distinct gate acts: the route segment and the PDP action each is. */
export const GATE_ACTS = { review: 'decision.gate.review', acknowledge: 'decision.gate.acknowledge', ready: 'decision.gate.ready', defer: 'decision.gate.defer',
  reject: 'decision.gate.reject', 'request-information': 'decision.gate.request_information', resume: 'decision.gate.resume' } as const;
export type GateSegment = keyof typeof GATE_ACTS;
/** How long a preview's digest carries a commit (the server's 30 minutes). */
export const PREVIEW_VALID_MINUTES = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The condition builder: a typed condition, or the reason it is not one yet (the server re-validates and refuses in its own words). */
export function buildCondition(f: { kind: string; ref?: string; expected?: string; label: string; stages?: string[] }): TypedCondition | string {
  if (!(CONDITION_KINDS as readonly string[]).includes(f.kind)) return `the kind is one of ${CONDITION_KINDS.join(', ')}`;
  const label = f.label.trim();
  if (label.length < 4) return 'the condition names its label in words (4+ characters)';
  const stages = (f.stages ?? ['commit', 'monitor']).filter((s) => (CONDITION_STAGES as readonly string[]).includes(s)) as TypedCondition['stages'];
  if (stages.length === 0) return 'the condition is evaluated at commitment, in monitoring, or both';
  const kind = f.kind as ConditionKind;
  if (kind === 'date_before') {
    const at = f.expected === undefined ? NaN : new Date(f.expected).getTime();
    if (Number.isNaN(at)) return 'a date_before condition names the instant it must precede';
    return { kind, expected: new Date(at).toISOString(), label, stages };
  }
  const ref = (f.ref ?? '').trim();
  if (!UUID.test(ref)) return `a ${kind} condition names the id it is about`;
  if (kind === 'indicator_state') return { kind, ref, expected: f.expected === 'breached' ? 'breached' : 'clear', label, stages };
  if (kind === 'claim_truth') {
    if ((f.expected ?? '').trim().length < 3) return 'a claim_truth condition names the truth state expected';
    return { kind, ref, expected: (f.expected as string).trim(), label, stages };
  }
  return { kind, ref, label, stages };
}

/** One condition in words, with what the server evaluated (holds, waived, observed). */
export function conditionLine(c: Row): string {
  const what = c['kind'] === 'date_before' ? `before ${String(c['expected'])}` : `${String(c['kind'])} ${String(c['ref'] ?? '').slice(0, 8)}…${c['expected'] ? ` = ${String(c['expected'])}` : ''}`;
  const state = c['waived_by'] ? '◇ WAIVED by an override' : c['holds'] === true ? '● HOLDS' : c['holds'] === false ? '✕ DOES NOT HOLD' : '○ not evaluated';
  return `“${String(c['label'])}” (${what}) — ${state}`;
}

/** The held banner's sentence (the server's failed conditions, never a client judgement). */
export function heldLine(held: { failed?: Row[] } | null | undefined): string | null {
  if (held === null || held === undefined) return null;
  const f = held.failed ?? [];
  return `COMMITMENT HELD — ${f.length} approval condition(s) do not hold: ${f.map((x) => `“${String(x['label'])}”`).join('; ') || 'see the conditions'}. Defer with a next review, or resume when they hold.`;
}

/** Minutes a recorded preview still carries a commit (0 when it no longer does). */
export function previewMinutesLeft(previewedAt: string, now: Date = new Date()): number {
  const t = new Date(previewedAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t + PREVIEW_VALID_MINUTES * 60_000 - now.getTime()) / 60_000));
}

/** Which acts the page OFFERS for a version state (the server still decides; a refusal is shown in its words). */
export function actsFor(state: string): GateSegment[] {
  if (state === 'deferred' || state === 'information_requested') return ['review', 'acknowledge', 'resume', 'reject'];
  if (['proposed', 'under_review', 'approved'].includes(state)) return ['review', 'acknowledge', 'ready', 'defer', 'request-information', 'reject'];
  return [];
}

/** What a gate act sends: the rationale, and the next review (defer, request-information), the request (request-information) or the digest read (ready). */
export function gatePayload(segment: GateSegment, f: { rationale: string; nextReviewAt?: string; infoRequest?: string; informationPackageDigest?: string }): Row {
  const out: Row = { rationale: f.rationale };
  if ((segment === 'defer' || segment === 'request-information') && f.nextReviewAt) out['nextReviewAt'] = new Date(f.nextReviewAt).toISOString();
  if (segment === 'request-information' && f.infoRequest) out['infoRequest'] = f.infoRequest;
  if (segment === 'ready' && f.informationPackageDigest) out['informationPackageDigest'] = f.informationPackageDigest;
  return out;
}

export interface GateStatus {
  package_id: string; version: number; state: string; decision_class: 'standard' | 'board'; board: Row | null; requires_ready: boolean; information_package_digest: string;
  conditions: { stage: string; conditions: Row[]; failed: number; held: boolean; evaluated_at: string };
  actions: Row[]; overrides: Row[]; delegations: Row[]; previews: Row[]; holds: Row[]; tasks: Row[];
}
export interface Preview { preview_id: string; preview_digest: string; preview: Row; valid_until: string }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const gates = {
  status: (s: Scope, pkg: string, v: number) => p<{ gate: GateStatus; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/gate/status`, 'decision.read', 'DPK', {}, pkg),
  act: (s: Scope, pkg: string, v: number, segment: GateSegment, payload: Row) =>
    p<{ gate: Row; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/gate/${segment}`, GATE_ACTS[segment], 'DPK', payload, pkg),
  preview: (s: Scope, pkg: string, v: number, versionDigest: string) => p<{ preview: Preview; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/preview`, 'decision.commit.preview', 'DPK', { versionDigest }, pkg),
  /** The commit (the route pins C3) carries the preview's digest; a failing condition answers `{commitment: null, held}` — recorded. */
  commit: (s: Scope, pkg: string, v: number, versionDigest: string, previewDigest: string) =>
    p<{ commitment: Row | null; held?: { failed: Row[]; conditions: Row[] }; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/commit`, 'decision.commit', 'CMT', { versionDigest, previewDigest }),
  override: (s: Scope, pkg: string, v: number, kind: 'normal' | 'emergency', rationale: string) =>
    p<{ override: Row; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/override`, 'decision.override.grant', 'DPK', { kind, rationale }, pkg),
  reviewOverride: (s: Scope, pkg: string, overrideId: string, outcome: 'upheld' | 'contested', note: string) =>
    p<{ review: Row; receipt: Receipt }>(s, `/decisions/${pkg}/overrides/${overrideId}/review`, 'decision.override.review', 'DPK', { outcome, note }, pkg),
  delegate: (s: Scope, pkg: string, delegate: string, expiresAt: string, reason: string) =>
    p<{ delegation: Row; receipt: Receipt }>(s, `/decisions/${pkg}/delegations`, 'decision.delegation.grant', 'DPK', { delegate, expiresAt: new Date(expiresAt).toISOString(), reason }, pkg),
  endDelegation: (s: Scope, pkg: string, delegationId: string, reason: string, reassignTo: string | null) =>
    p<{ delegation: Row; receipt: Receipt }>(s, `/decisions/${pkg}/delegations/${delegationId}/end`, 'decision.delegation.end', 'DPK', reassignTo === null ? { reason } : { reason, reassignTo }, pkg),
  reserveBoard: (s: Scope, pkg: string, charter: string, quorum: number, rationale: string) =>
    p<{ board: Row; receipt: Receipt }>(s, `/decisions/${pkg}/board/reserve`, 'decision.board.reserve', 'DPK', { board: { charter, quorum }, rationale }, pkg),
  recordControl: (s: Scope, payload: { kind: 'policy_revision' | 'control_decision'; controlKey: string; body: Row; rationale: string; packageId?: string }) =>
    p<{ control: Row; receipt: Receipt }>(s, '/decisions/controls', 'decision.control.record', 'DPK', payload),
  controlsAsOf: (s: Scope, at: string | null) => p<{ at: string; controls: Row[]; receipt: Receipt }>(s, '/decisions/controls/as-of', 'decision.read', 'DPK', at === null ? {} : { at }),
};
