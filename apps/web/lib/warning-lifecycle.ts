/**
 * CP-6 B28 client — THE EARLY-WARNING LIFECYCLE (migration 0088 §W; F-P4-12).
 *
 * A warning now has an ORIGIN (an indicator breach, a stream rule's window, an escalated weak signal, a graph impact, a forecast revision,
 * a twin degradation) and a CLUSTER: the reports of one incident folded into one warning — the lead, the duplicates, the storm members —
 * each with its STANCE (a contradicting report is shown, never dropped). The owner sets the CONTEXT (contradicting evidence, the affected
 * objectives, the falsification conditions, the verification or simulation PLAYBOOK) at the version read; a warning is CLOSED on a
 * criterion; a person gives FEEDBACK (false, late, missed, duplicated, useful); the executive EVALUATES the warnings (rates by origin, T3,
 * the acknowledgement), each measure abstaining below its sample floor. The COVERAGE GAPS are the active source-impact markers the
 * warning rests on.
 *
 * Nothing here decides or computes: the server does, in its own words. The helpers below only word what it recorded.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export const ORIGIN_KINDS = ['indicator_breach', 'stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation', /* B32 (0089) exposures */ 'exposure' /* end B32 exposures */] as const;
export const FEEDBACK_KINDS = ['false', 'late', 'missed', 'duplicated', 'useful'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const CLOSURE_CRITERIA = ['resolved', 'falsified', 'duplicate', 'no_longer_relevant'] as const;
/** The roles the server admits to evaluate the warnings (prediction.evaluate_warnings; the PDP rule names the same). */
export const EVALUATOR_ROLES = ['executive', 'domain_admin', 'platform_admin'] as const;

export interface ClusterMember {
  member_id: string; member_kind: 'lead' | 'duplicate' | 'storm' | string; stance: 'supporting' | 'contradicting' | string; candidate_id: string;
  origin_kind: string; origin_key: string; source_id: string | null; evidence: Array<Record<string, unknown>>; cause_key: string; dedup_key: string;
  objectives: string[]; geographies: string[]; horizon: string | null; title: string; confidence: number | null; joined_by: string; joined_at: string | null;
}
export interface CoverageMarker { marker_id: string; source_id: string; subject_kind: string; subject_id: string; health_state: string; reason: string | null; set_at: string; via: string }
export interface Playbook { kind: 'verification' | 'simulation' | string; scenario_id: string; branch_id?: string | null; run_id?: string | null; note?: string | null }
export interface Lifecycle {
  warning: Record<string, unknown>;
  origin: { kind: string; ref: Record<string, unknown> };
  cluster: { cluster_id: string; dedup_key: string; cause_key: string; storm_rule: Record<string, unknown>; created_at: string | null } | null;
  members: ClusterMember[];
  storm: { members: number; causes: string[]; rule: Record<string, unknown> | null; note: string } | null;
  contradicting: { context: Array<Record<string, unknown>>; members: Array<Record<string, unknown>>; count: number };
  affected: { objectives: Array<{ objective_id: string; title: string | null; status: string | null; owner: string | null }>; assets?: string[]; actors?: string[]; geographies?: string[]; horizon?: string | null };
  falsification: Array<{ condition: string; indicator_id?: string }>;
  playbook: Playbook | null; context_version: number;
  closure: Record<string, unknown> | null;
  feedback: Array<{ feedback_id: string; kind: string; note: string | null; warning_state: string; given_by: string; given_at: string | null }>;
  coverage_gaps: { markers: CoverageMarker[]; count: number; remediation: null; note: string };
  events: Array<{ event: string; details: Record<string, unknown>; occurred_at: string | null; actor_principal_id: string }>;
}
export interface Ratio { abstained: boolean; sample: number; value?: number; numerator?: number; reason?: string }
export interface OriginMeasures { raised: number; with_feedback: number; false_rate: Ratio; late_rate: Ratio; missed_rate: Ratio; duplicated_rate: Ratio; useful_rate: Ratio; counts: Record<string, number> }
export interface WarningEvaluation {
  evaluation_id: string; verdict: 'measured' | 'partial' | 'abstained' | string; reason: string; evaluated_by: string; evaluated_at: string | null;
  window_from?: string | null; window_to?: string | null; min_sample: number;
  measures?: { by_origin: Record<string, OriginMeasures>; t3: Ratio & { unmeasured: number; basis: string };
               acknowledgement: { abstained: boolean; sample: number; reason?: string; p50_seconds?: number; p90_seconds?: number; acknowledged_late: number; expired_unanswered: number };
               clusters: { duplicates_absorbed: number; storm_members: number; storm_leads: number; contradicting_reports: number } };
}
export interface Processing { passes: Array<Record<string, unknown>>; raised: Array<Record<string, unknown>> }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'WRN', object_id: objectId,
    purpose_id: 'prediction', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const warningLifecycle = {
  lifecycle: (s: Scope, warningId: string) => p<{ lifecycle: Lifecycle; receipt: Receipt }>(s, `/warnings/${warningId}/lifecycle`, 'prediction.read', {}, warningId),
  candidates: (s: Scope, state?: string) => p<{ candidates: Array<Record<string, unknown>>; receipt: Receipt }>(s, '/warnings/candidates/list', 'prediction.read', state ? { state } : {}),
  process: (s: Scope) => p<{ processing: Processing; receipt: Receipt | null }>(s, '/warnings/candidates/process', 'prediction.warning.candidates.process'),
  setContext: (s: Scope, warningId: string, payload: Record<string, unknown>) => p<{ context: Record<string, unknown>; receipt: Receipt }>(s, `/warnings/${warningId}/context`, 'prediction.warning.context.set', payload, warningId),
  close: (s: Scope, warningId: string, payload: Record<string, unknown>) => p<{ warning: Record<string, unknown>; receipt: Receipt }>(s, `/warnings/${warningId}/close`, 'prediction.warning.close', payload, warningId),
  feedback: (s: Scope, warningId: string, kind: FeedbackKind, note: string) => p<{ feedback: Record<string, unknown>; receipt: Receipt }>(s, `/warnings/${warningId}/feedback`, 'prediction.warning.feedback', note.trim() === '' ? { kind } : { kind, note: note.trim() }, warningId),
  evaluate: (s: Scope, payload: Record<string, unknown>) => p<{ evaluation: WarningEvaluation & WarningEvaluation['measures']; receipt: Receipt }>(s, '/warnings/evaluations/run', 'prediction.warning.evaluate', payload),
  evaluations: (s: Scope) => p<{ evaluations: WarningEvaluation[]; receipt: Receipt }>(s, '/warnings/evaluations/list', 'prediction.warning.evaluations.read'),
};

/* ───────────── the words (the server's record, worded; never judged here) ───────────── */

/** The origin in words — an indicator breach is every warning raised before B28. */
export function originWords(kind: unknown): string {
  switch (kind) {
    case 'indicator_breach': return 'indicator breach';
    case 'stream_rule': return 'stream rule (a fired event-time window)';
    case 'weak_signal': return 'escalated weak signal';
    case 'graph_impact': return 'graph impact on an objective';
    case 'forecast_revision': return 'forecast revision';
    case 'twin_degradation': return 'twin degradation';
    /* B32 (0089) exposures */ case 'exposure': return 'exposure outside appetite (routed to its owner)'; /* end B32 exposures */
    default: return kind === undefined || kind === null ? 'indicator breach' : String(kind);
  }
}
/** A member's kind and stance in three channels (glyph, token, text) — a contradicting report is never colour alone. */
export function memberMark(kind: string, stance: string): { glyph: string; token: string; text: string } {
  const k = kind === 'lead' ? 'LEAD' : kind === 'storm' ? 'STORM MEMBER' : 'DUPLICATE';
  return stance === 'contradicting'
    ? { glyph: '⊘', token: '--eye-color-critical', text: `${k} · CONTRADICTING` }
    : { glyph: '●', token: '--eye-color-ink-muted', text: `${k} · supporting` };
}
/** A measured ratio with its sample, or the server's reason for abstaining. */
export function ratioWords(r: Ratio | undefined): string {
  if (r === undefined || r === null) return 'not reported';
  return r.abstained ? `abstained — ${r.reason ?? `sample ${r.sample}`}` : `${Number(r.value).toFixed(4)} (n = ${r.sample})`;
}
export function verdictMark(v: string): { glyph: string; text: string } {
  return v === 'measured' ? { glyph: '●', text: 'MEASURED — every measure had its sample' }
    : v === 'partial' ? { glyph: '◐', text: 'PARTIAL — some measures abstained below the sample floor' }
    : { glyph: '○', text: 'ABSTAINED — no measure had its sample' };
}
/** The closure payload: only what is set (the condition for a falsified closure, the original for a duplicate), trimmed. */
export function closePayload(a: { criterion: string; reason: string; condition?: string; duplicateOf?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { criterion: a.criterion, reason: a.reason.trim() };
  if (a.criterion === 'falsified' && a.condition !== undefined && a.condition.trim() !== '') out['condition'] = Number(a.condition);
  if (a.criterion === 'duplicate' && a.duplicateOf !== undefined && a.duplicateOf.trim() !== '') out['duplicate_of'] = a.duplicateOf.trim();
  return out;
}
/** The evaluation payload: only what is set (the server defaults the window to the 30 days before now and the floor to 5). */
export function evaluatePayload(a: { from: string | null; to: string | null; minSample: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.from) out['window_from'] = a.from;
  if (a.to) out['window_to'] = a.to;
  if (a.minSample.trim() !== '') out['min_sample'] = Number(a.minSample.trim());
  return out;
}
