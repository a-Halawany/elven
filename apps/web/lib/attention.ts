/**
 * CP-6 B22 client — the ATTENTION POLICY and the QUEUE (migration 0083; interface L10-I05 AttentionPolicyChanged).
 *
 * A domain's attention policy is a VERSIONED object a named human sets (PR-44-003: domain_admin, executive or
 * platform_admin — the server decides): per signal class, the materiality thresholds over TRANSPARENT dimensions
 * (consequence, confidence, hours to the response window — ES-47-002: no opaque score creates urgency), the accountable
 * roles, the acknowledgement deadline, the escalation roles and bound, the suppression rule and the channel (in_app).
 *
 * The QUEUE holds one item per (class, subject, cause), evaluated under the version that was active when it arrived: the
 * outcome, the REASONS and that version are the server's and are rendered verbatim. A deprioritized or suppressed item is
 * listed, never hidden. Acknowledge is RECEIPT, never agreement (OBJ-20); a suppression is reasoned, bounded and lapses.
 * Nothing here computes a verdict: the helpers below only word what the server recorded.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export const SIGNAL_CLASSES = ['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review',
  /* B23 (0084) attention: L10-I02 MaterialChangeRaised, L10-I03 ReviewConvened */ 'decision.material_change', 'review.convened' /* end B23 attention */] as const;
export type SignalClass = (typeof SIGNAL_CLASSES)[number];
export const ITEM_STATES = ['open', 'escalated', 'unrouted', 'acknowledged', 'suppressed', 'deprioritized', 'closed'] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export type Outcome = 'material' | 'below_threshold' | 'abstained';
export const CONSEQUENCES = ['C0', 'C1', 'C2', 'C3', 'C4'] as const;
/** The roles the server admits to publish a policy version (executive.publish_attention_policy; PR-44-003). */
export const POLICY_PUBLISHER_ROLES = ['domain_admin', 'executive', 'platform_admin'] as const;

/** One class's rule, as the port validates it (executive.validate_attention_rules). */
export interface ClassRule {
  materiality: { min_consequence: string; min_confidence: number; max_hours_to_window?: number | null };
  route_roles: string[];
  ack_within_minutes: number;
  escalate_to_roles?: string[];
  max_escalations?: number;
  suppression?: { allowed: boolean; max_hours?: number };
  notify?: 'in_app';
}
export interface PolicyRules { classes: Partial<Record<SignalClass, ClassRule>> & Record<string, ClassRule>; overload?: { max_open_per_role: number } }
/** A policy version as policy/get serves it (instants ISO). */
export interface PolicyVersion {
  policy_id: string; version: number; state: 'active' | 'superseded' | string; rules: PolicyRules; rules_digest: string; supersedes: number | null;
  changed_sections: string[]; changed_classes: string[]; reason: string; set_by: string; effective_at: string | null; superseded_at: string | null;
}
/** What the publish port answers — the event's material (AttentionPolicyChanged@v1). */
export interface PublishedPolicy {
  policy_id: string; version: number; supersedes: number | null; superseded_policy_id: string | null; rules_digest: string;
  changed_sections: string[]; changed_classes: string[]; effective_at: string; set_by: string; reason: string;
}
/** The engine's verdict (executive.evaluate_attention) with the version it was judged under. */
export interface Evaluation {
  outcome: Outcome; reasons: string[]; dimensions: { consequence?: string; confidence?: number; hours_to_window?: number | null; [k: string]: unknown };
  thresholds: ClassRule['materiality'] | null; policy_version?: number | null;
}
export interface ItemEvent { event: string; actor: string | null; details: Record<string, unknown> | null; occurred_at: string }
/** A queue item as the list and the get serve it; `overdue` is the server's reading against now. */
export interface AttentionItem {
  item_id: string; signal_class: SignalClass | string; subject_kind: string; subject_id: string; title: string;
  outcome: Outcome; state: ItemState; owner_principal_id: string | null; route_roles: string[];
  policy_version: number | null; evaluation: Evaluation; details: Record<string, unknown>;
  due_at: string | null; overdue: boolean; escalations: number; suppressed_until: string | null;
  acknowledged_at: string | null; acknowledged_by: string | null; closed_at: string | null; closed_by: string | null;
  cause_event_id: string; cause_event_type: string; created_at: string; updated_at: string;
  events?: ItemEvent[];
}
export type ItemCounts = Record<ItemState, number>;
export interface Acknowledged { item_id: string; state: 'acknowledged'; from_state: string; acknowledged_at: string; acknowledged_by: string; within_deadline: boolean }
export interface Suppressed { item_id: string; state: 'suppressed'; from_state: string; until: string; reason: string; by: string }
export interface Closed { item_id: string; state: 'closed'; from_state: string; closed_at: string; closed_by: string }
export interface Escalation { escalated: number; lapsed: number; exhausted: number; at: string }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
/** The executive routes are made under the purpose `decision` (the requests' idiom, lib/decisions.ts). */
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null, purpose = 'decision'): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: purpose, side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

/** The list's filter payload: only what is set is sent (the server ignores a word outside its vocabularies). */
export function listPayload(f: { state?: string | null; signalClass?: string | null; limit?: number } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { limit: f.limit ?? 200 };
  if (typeof f.state === 'string' && f.state !== '') out['state'] = f.state;
  if (typeof f.signalClass === 'string' && f.signalClass !== '') out['signalClass'] = f.signalClass;
  return out;
}

export const attention = {
  policy: (s: Scope) => p<{ policy: { active: PolicyVersion | null; history: PolicyVersion[] }; receipt: Receipt }>(s, '/executive/attention/policy/get', 'executive.attention.read', 'ATP'),
  /** Human-gated; a new VERSION superseding the active one (never a rewrite). The server refuses unchanged rules and a reason under 8 characters. */
  publish: (s: Scope, rules: Record<string, unknown>, reason: string) =>
    p<{ policy: PublishedPolicy; receipt: Receipt }>(s, '/executive/attention/policy/publish', 'executive.attention.policy.publish', 'ATP', { rules, reason }),
  items: (s: Scope, filter: { state?: string | null; signalClass?: string | null; limit?: number } = {}) =>
    p<{ items: AttentionItem[]; counts: ItemCounts; receipt: Receipt }>(s, '/executive/attention/items/list', 'executive.attention.read', 'ATI', listPayload(filter)),
  item: (s: Scope, id: string) => p<{ item: AttentionItem; receipt: Receipt }>(s, `/executive/attention/items/${id}/get`, 'executive.attention.read', 'ATI', {}, id),
  /** Receipt, never agreement: the owner or a holder of a routed role (domain_admin / platform_admin too). */
  acknowledge: (s: Scope, id: string, note: string | null) =>
    p<{ item: Acknowledged; receipt: Receipt }>(s, `/executive/attention/items/${id}/acknowledge`, 'executive.attention.item.acknowledge', 'ATI', note === null || note.trim() === '' ? {} : { note: note.trim() }, id),
  /** `until` is an ISO instant after now and within the class's maximum under the ITEM's policy version; a reason of 8+ characters. */
  suppress: (s: Scope, id: string, until: string, reason: string) =>
    p<{ item: Suppressed; receipt: Receipt }>(s, `/executive/attention/items/${id}/suppress`, 'executive.attention.item.suppress', 'ATI', { until, reason }, id),
  close: (s: Scope, id: string, note: string) =>
    p<{ item: Closed; receipt: Receipt }>(s, `/executive/attention/items/${id}/close`, 'executive.attention.item.close', 'ATI', { note }, id),
  /** The overdue escalated and the lapsed suppressions reopened, on demand (domain_admin / executive / platform_admin). */
  escalateDue: (s: Scope) => p<{ escalation: Escalation; receipt: Receipt }>(s, '/executive/attention/escalate-due', 'executive.attention.escalate', 'ATI'),
};

// ───────────────────────── the words (pure; tested in attention.test.ts) ─────────────────────────

/** A state, three channels: glyph, uppercase word, colour token. */
export function stateMark(state: string, overdue = false): { glyph: string; token: string; text: string } {
  if (overdue && (state === 'open' || state === 'escalated')) return { glyph: '⚑', token: '--eye-color-critical', text: `${state.toUpperCase()} — OVERDUE` };
  const m: Record<string, { glyph: string; token: string }> = {
    open: { glyph: '○', token: '--eye-color-uncertain' }, escalated: { glyph: '▲', token: '--eye-color-warning' },
    unrouted: { glyph: '?', token: '--eye-color-critical' }, acknowledged: { glyph: '✓', token: '--eye-color-success' },
    suppressed: { glyph: '◌', token: '--eye-color-ink-muted' }, deprioritized: { glyph: '▽', token: '--eye-color-ink-muted' },
    closed: { glyph: '■', token: '--eye-color-ink-muted' },
  };
  const s = m[state] ?? { glyph: '?', token: '--eye-color-ink-muted' };
  return { ...s, text: state.toUpperCase() };
}

/** Which acts the server can grant on a state (the interface OFFERS these; the server decides who). */
export const canAcknowledge = (state: string) => state === 'open' || state === 'escalated' || state === 'unrouted';
export const canSuppress = (state: string) => canAcknowledge(state) || state === 'acknowledged';
export const canClose = (state: string) => state !== 'closed';

/** Why an item is where it is, from the engine's own reasons — the "why deprioritized" line (never hidden, never invented). */
export function whyLine(item: Pick<AttentionItem, 'outcome' | 'state' | 'evaluation' | 'policy_version'>): string {
  const reasons = Array.isArray(item.evaluation?.reasons) ? item.evaluation.reasons.map(String) : [];
  const under = item.policy_version === null || item.policy_version === undefined ? 'no policy version' : `policy v${item.policy_version}`;
  const because = reasons.length === 0 ? 'no reason recorded' : reasons.join('; ');
  if (item.outcome === 'abstained') return `the engine abstained (${under}): ${because}`;
  if (item.outcome === 'below_threshold') return `below the thresholds of ${under}: ${because}`;
  return `material under ${under}: ${because}`;
}

/** A class rule in words: the thresholds, the roles, the deadline, the escalation, the suppression, the channel. */
export function ruleLines(r: ClassRule | null | undefined): { thresholds: string; routing: string; deadline: string; escalation: string; suppression: string; channel: string } {
  if (r === null || r === undefined) return { thresholds: 'no rule — the engine abstains for this class', routing: '—', deadline: '—', escalation: '—', suppression: '—', channel: '—' };
  const m = r.materiality ?? ({} as ClassRule['materiality']);
  const win = m.max_hours_to_window === undefined || m.max_hours_to_window === null ? 'no window threshold' : `within ${m.max_hours_to_window} h of the response window`;
  const roles = Array.isArray(r.route_roles) ? r.route_roles : [];
  const esc = Array.isArray(r.escalate_to_roles) ? r.escalate_to_roles : [];
  const max = typeof r.max_escalations === 'number' ? r.max_escalations : 0;
  return {
    thresholds: `consequence ≥ ${m.min_consequence ?? '—'} · confidence ≥ ${m.min_confidence ?? '—'} · ${win}`,
    routing: roles.length === 0 ? 'no role' : roles.join(', '),
    deadline: typeof r.ack_within_minutes === 'number' ? `acknowledge within ${r.ack_within_minutes} min` : '—',
    escalation: max === 0 || esc.length === 0 ? 'no escalation' : `to ${esc.join(', ')}, at most ${max} time(s)`,
    suppression: r.suppression === undefined ? 'not allowed (no rule)' : r.suppression.allowed ? `allowed, at most ${r.suppression.max_hours ?? '—'} h` : 'not allowed',
    channel: r.notify ?? 'in_app',
  };
}

/** The JSON textarea's content → the rules object, or the parse error in words (the server validates the rules whole). */
export function parseRules(text: string): { ok: true; rules: Record<string, unknown> } | { ok: false; message: string } {
  let v: unknown;
  try { v = JSON.parse(text); } catch (e) { return { ok: false, message: `not JSON — ${(e as Error).message}` }; }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false, message: 'the rules are an object {classes, overload?}' };
  return { ok: true, rules: v as Record<string, unknown> };
}

/**
 * A STARTING POINT for the domain's first version, shown only when no version is active — the person edits it before
 * publishing; the server validates every key and every role (a role that is not a human role of this product is refused).
 */
export const FIRST_POLICY_TEMPLATE: PolicyRules = {
  classes: {
    'forecast.unfit': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 72 }, notify: 'in_app' },
    'scenario.incoherent': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 72 }, notify: 'in_app' },
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.5, max_hours_to_window: 168 }, route_roles: ['executive'], ack_within_minutes: 240, escalate_to_roles: ['domain_admin'], max_escalations: 2, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
    'source.coverage_loss': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['collection_manager'], ack_within_minutes: 720, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: true, max_hours: 48 }, notify: 'in_app' },
    'proposal.review': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['knowledge_owner'], ack_within_minutes: 2880, suppression: { allowed: false }, notify: 'in_app' },
  },
};

/* B23 (0084) attention ───────────────────────── THE GOVERNED REVIEW (L10-I03 ReviewConvened) and BRF@v2's bands ─────────────────────────
 * A review is a NAMED HUMAN's act around a declared objective, decision, scenario, commitment or outcome (the server checks that
 * the subject is declared in the domain, at the version named or the current one, that the chair and reviewers are active humans,
 * and that the convener holds one of the convening roles). The convene_key is the convener's idempotency key: the same key with
 * the same review answers the recorded review (`repeated`); the same key with a different review is refused. The chair concludes;
 * the convener or the chair withdraws. Nothing here decides who may: the server does, in its own words.
 */
export const REVIEW_SUBJECT_KINDS = ['objective', 'decision', 'scenario', 'commitment', 'outcome'] as const;
export type ReviewSubjectKind = (typeof REVIEW_SUBJECT_KINDS)[number];
export const REVIEW_STATES = ['convened', 'concluded', 'withdrawn'] as const;
/** The roles the server admits to convene (executive.review_convening_roles; the PDP rule names the same). */
export const REVIEW_CONVENER_ROLES = ['executive', 'strategy_owner', 'decision_owner', 'decision_authority', 'domain_admin', 'platform_admin'] as const;
export interface Review {
  review_id: string; repeated: boolean; state: (typeof REVIEW_STATES)[number] | string; subject_kind: ReviewSubjectKind | string; subject_id: string; subject_version: number | null; subject_title: string | null;
  question: string; chair: string; reviewers: string[]; due_at: string | null; convened_by: string; convened_at: string; convene_key: string; request_digest: string;
  cause_item_id: string | null; room_id: string | null; closed_at: string | null; closed_by: string | null; closing_note: string | null;
  events?: ItemEvent[]; attention?: Array<{ item_id: string; signal_class: string; state: string; outcome: string; policy_version: number | null; owner_principal_id: string | null; due_at: string | null }>;
}
export interface ConveneForm { kind: string; subjectId: string; version: string; question: string; chair: string; reviewers: string; due: string | null; key: string; causeItemId: string | null; roomId?: string | null }

/** The convening payload from the form: only what is set is sent; the reviewers are split on commas and spaces (the server validates each). */
export function convenePayload(f: ConveneForm): Record<string, unknown> {
  const subject: Record<string, unknown> = { kind: f.kind, id: f.subjectId.trim() };
  if (f.version.trim() !== '') subject['version'] = Number(f.version.trim());
  const reviewers = f.reviewers.split(/[\s,]+/).map((x) => x.trim()).filter((x) => x !== '');
  const out: Record<string, unknown> = { subject, question: f.question.trim(), chair: f.chair.trim(), convene_key: f.key.trim() };
  if (reviewers.length > 0) out['reviewers'] = reviewers;
  if (f.due !== null && f.due !== '') out['due_at'] = f.due;
  if (f.causeItemId !== null && f.causeItemId !== '') out['cause_item_id'] = f.causeItemId;
  if (f.roomId !== undefined && f.roomId !== null && f.roomId !== '') out['room_id'] = f.roomId;
  return out;
}

/** The subject kind a queue item's subject reviews as (a material change's package is a decision), or null when it is not reviewable as itself. */
export function reviewSubjectOf(item: Pick<AttentionItem, 'subject_kind' | 'signal_class'>): ReviewSubjectKind | null {
  if (item.subject_kind === 'package') return 'decision';
  if (item.subject_kind === 'scenario') return 'scenario';
  return null;
}

/** A confidence band (BRF@v2's attention section), three channels: glyph, word, colour token. */
export function bandMark(band: string): { glyph: string; token: string; text: string } {
  switch (band) {
    case 'high': return { glyph: '●', token: '--eye-color-ink-default', text: 'HIGH CONFIDENCE' };
    case 'medium': return { glyph: '◐', token: '--eye-color-uncertain', text: 'MEDIUM CONFIDENCE' };
    case 'low': return { glyph: '○', token: '--eye-color-warning', text: 'LOW CONFIDENCE' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: 'CONFIDENCE UNKNOWN' };
  }
}

export const reviews = {
  list: (s: Scope, filter: { state?: string | null; subjectKind?: string | null; subjectId?: string | null } = {}) => {
    const payload: Record<string, unknown> = { limit: 200 };
    if (typeof filter.state === 'string' && filter.state !== '') payload['state'] = filter.state;
    if (typeof filter.subjectKind === 'string' && filter.subjectKind !== '') payload['subjectKind'] = filter.subjectKind;
    if (typeof filter.subjectId === 'string' && filter.subjectId !== '') payload['subjectId'] = filter.subjectId;
    return p<{ reviews: Review[]; receipt: Receipt }>(s, '/executive/reviews/list', 'executive.review.read', 'RVW', payload, null, 'executive');
  },
  get: (s: Scope, id: string) => p<{ review: Review; receipt: Receipt }>(s, `/executive/reviews/${id}/get`, 'executive.review.read', 'RVW', {}, id, 'executive'),
  /** Human-gated; exactly once on the convener's key. ReviewConvened@v1 is published from the write of a NEW review. */
  convene: (s: Scope, f: ConveneForm) => p<{ review: Review; receipt: Receipt }>(s, '/executive/reviews/convene', 'executive.review.convene', 'RVW', convenePayload(f), null, 'executive'),
  /** The chair concludes (a note of 8+ characters: the conclusion). */
  conclude: (s: Scope, id: string, note: string) => p<{ review: Review; receipt: Receipt }>(s, `/executive/reviews/${id}/conclude`, 'executive.review.close', 'RVW', { note }, id, 'executive'),
  /** The convener or the chair withdraws (a note of 8+ characters: why). */
  withdraw: (s: Scope, id: string, note: string) => p<{ review: Review; receipt: Receipt }>(s, `/executive/reviews/${id}/withdraw`, 'executive.review.close', 'RVW', { note }, id, 'executive'),
};
/* end B23 attention */
