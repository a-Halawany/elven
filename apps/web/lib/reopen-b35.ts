/**
 * The decision review client — CP-6 B35 part `reopen` (0101 §P; F-P6-06; the B35 pieces of F-P4-08 / F-P4-09; §B36.12 row 11).
 *
 * Every response is returned VERBATIM: a package's review (the changes of conditions recorded, the reversion requests with the scenario's
 * version then and now, the outcome assessments in their four separate fields, the review terms, the replays with their initiator and
 * reason, the lessons linked to governed memory records, this part's ledger) and its DECISION METRICS (completeness with the missing and
 * disputed evidence named, evidence coverage against the terms' standard, time-to-decision, reversibility, outcome linkage); a scenario
 * set's review cadence and its misses; the scenarios live packages cite outside every active set with their relevance. The acts are a named
 * person's own; the server refuses anyone else. The helpers below only word what the record says.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export const REOPEN_CAUSES = ['input_invalidated', 'condition_breach', 'policy_changed', 'challenge_upheld', 'appeal_upheld', 'conditions_changed'] as const;
export type ReopenCause = (typeof REOPEN_CAUSES)[number];
export const EVIDENCE_KINDS = ['warning', 'signal', 'indicator', 'forecast', 'scenario', 'run', 'claim', 'evidence'] as const;
export const INFERENCE_METHODS = ['attribution_rule', 'difference_in_differences', 'simulation_comparison', 'regression', 'expert_judgment'] as const;
export const EVIDENCE_STANDARDS = ['decision_grade', 'reviewed', 'indicative'] as const;
export const BASELINE_KINDS = ['run', 'outcome_criterion', 'stated'] as const;

export interface PackageRow { package_id: string; title: string; state: string; current_version: number | null; committed_version: number | null; owner: string; reopens: number; declared_at: string }
export interface ReversionRow {
  request_id: string; package_id: string; package_title: string; scenario_id: string; scenario_title: string | null; scenario_version_at_request: number; scenario_version_now: number | null;
  owner: string; state: 'open' | 'reversioned' | 'declined'; cause_kind: string; new_version: number; requested_at: string; resolved_at: string | null; resolution_note: string | null;
}
export interface SetRow { set_id: string; title: string; state: string; owner: string; due: { due_at: string; overdue: boolean; every_days: number; last_review_at: string | null; cadence_version: number } | null }
export interface CitedRow { scenario_id: string; title: string; cited_by: string[]; score: number | null; basis: Row | null; scored_at: string | null; trigger: string | null }
export interface Assessment {
  assessment_id: string; package_id: string; version: number; assessment_version: number; supersedes: string | null;
  observed: { outcomes: Array<{ outcome_id: string; criterion_key: string; observed_value: unknown; unit: string | null; target: number; comparator: string; met: boolean }>; statement: string };
  inferred: { statement: string; method: string; confidence: number; magnitude: number | null; unit: string | null };
  counterfactual: { claim: string; basis: { kind: 'run'; run_id: string } | { kind: 'stated_model'; model: string } };
  changed_conditions: Array<{ condition: string; effect: string | null; evidence: Row[] }>;
  digest: string; assessed_by: string; assessed_at: string;
}
export interface Terms { terms_id: string; version: number; terms_version: number; baseline: { kind: string; ref: string | null; statement: string }; replay_horizon_days: number; evidence_standard: string; evidence_note: string; set_by: string; set_at: string }
export interface Review {
  package_id: string; title: string; state: string; owner: string; current_version: number | null; committed_version: number | null; reopens: number; reopen_cause: Row | null;
  condition_changes: Array<{ change_id: string; title: string; statement: string; evidence: Array<{ kind: string; id: string; note: string | null }>; recorded_by: string; recorded_at: string; committed_version: number }>;
  reversion_requests: Array<ReversionRow & { via: Row[]; resolved_version: number | null }>;
  outcome_assessments: Assessment[]; review_terms: Terms[];
  replays: Array<{ replay_id: string; version: number; reader: string; replayed_at: string; content_digest: string; initiator: string | null; reason: string | null; within_horizon: boolean | null }>;
  lessons: Array<{ lesson_id: string; assessment_id: string; kind: string; memory_item_id: string; memory_version: number; title: string; linked_by: string; linked_at: string }>;
  events: Array<{ event: string; at: string; actor: string; details: Row }>;
}
export interface Criterion { key: string; met: boolean; detail: string }
export interface Metrics {
  package_id: string; state: string; version: number; committed_version: number | null; as_of: string;
  completeness: { score: number; met: number; of: number; criteria: Criterion[]; missing: Row[]; disputed: Array<{ option_key: string; kind: string; id: string; standing: string }>;
                  post_commitment_notes: Row[]; challenges: Row[]; appeals_open: number };
  evidence_coverage: { options: number; simulated: number; with_evidence: number; citations: number; standing: number; share: number | null; runs: number; decision_grade_runs: number; standard: string | null; meets_standard: boolean | null };
  time_to_decision: { declared_at: string; first_proposed_at: string | null; first_committed_at: string | null; last_committed_at: string | null; hours: number | null; open_hours: number | null; reopens: number };
  reversibility: { stated: string | null; options_stating: number; reopens: number; reopened_from_version: number | null; last_cause: string | null };
  outcome_linkage: { criteria: number; outcomes_recorded: number; share: number | null; assessments: number; lessons: number; linked: boolean };
  review_terms: Terms | null;
}
export interface SetStatus { set_id: string; title: string; state: string; owner: string; due: SetRow['due']; cadences: Row[]; misses: Array<{ miss_id: string; due_at: string; detected_at: string; met_at: string | null; item_id: string }> }

/* ───────────── the words ───────────── */
/** A reopen cause in words. */
export function causeWords(kind: string): string {
  switch (kind) {
    case 'input_invalidated': return 'an input was invalidated after the commitment';
    case 'condition_breach': return 'a monitored condition was breached';
    case 'policy_changed': return 'the attention policy changed';
    case 'challenge_upheld': return 'a challenge was upheld after the commitment';
    case 'appeal_upheld': return 'an appeal of the decided package was upheld';
    case 'conditions_changed': return 'the conditions changed';
    default: return kind.replace(/_/g, ' ');
  }
}
/** A reversion request's state as a glyph, a token and words — never colour alone. */
export function reversionMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'open': return { glyph: '⚑', token: '--eye-color-uncertain', text: 'RE-VERSION REQUESTED' };
    case 'reversioned': return { glyph: '●', token: '--eye-color-success', text: 'RE-VERSIONED' };
    case 'declined': return { glyph: '○', token: '--eye-color-ink-muted', text: 'DECLINED' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: state.toUpperCase() };
  }
}
/** A share as a percentage in words ("—" when undefined). */
export function shareWords(v: number | null | undefined): string {
  return typeof v === 'number' ? `${Math.round(v * 1000) / 10}%` : '—';
}
/** The completeness line: "7 of 11 criteria met; 2 missing; 1 disputed citation". */
export function completenessLine(c: Metrics['completeness']): string {
  const unmet = c.criteria.filter((x) => !x.met).length;
  return `${c.met} of ${c.of} criteria met; ${c.missing.length} missing (${unmet} criteria, ${c.missing.length - unmet} named items); ${c.disputed.length} disputed or withdrawn citation${c.disputed.length === 1 ? '' : 's'}`;
}
/** Hours in words: "36.5 h (1.5 d)". */
export function hoursWords(h: number | null | undefined): string {
  if (typeof h !== 'number') return '—';
  return h >= 48 ? `${h} h (${Math.round((h / 24) * 10) / 10} d)` : `${h} h`;
}
/** The four fields are separate statements: the first repetition found, or null (the server judges the same rule). */
export function separationProblem(a: { observed: string; inferred: string; counterfactual: string; changed: string[] }): string | null {
  const n = (s: string) => s.trim().toLowerCase();
  const three = [n(a.observed), n(a.inferred), n(a.counterfactual)];
  if (three[0] === three[1]) return 'the inferred contribution repeats the observed result';
  if (three[0] === three[2]) return 'the counterfactual claim repeats the observed result';
  if (three[1] === three[2]) return 'the counterfactual claim repeats the inferred contribution';
  const hit = a.changed.find((c) => three.includes(n(c)));
  return hit === undefined ? null : `the changed condition "${hit}" repeats another field`;
}
/** "kind:id note" lines → evidence items (a line without a colon is skipped; the server refuses what it cannot find). */
export function evidenceOf(text: string): Array<{ kind: string; id: string; note?: string }> {
  return text.split('\n').map((l) => l.trim()).filter((l) => l.includes(':')).map((l) => {
    const i = l.indexOf(':'); const kind = l.slice(0, i).trim(); const rest = l.slice(i + 1).trim();
    const sp = rest.search(/\s/);
    return sp < 0 ? { kind, id: rest } : { kind, id: rest.slice(0, sp), note: rest.slice(sp + 1).trim() };
  });
}
/** One condition per line → changed conditions ("condition — effect"). */
export function changedOf(text: string): Array<{ condition: string; effect?: string }> {
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '').map((l) => {
    const i = l.indexOf(' — ');
    return i < 0 ? { condition: l } : { condition: l.slice(0, i).trim(), effect: l.slice(i + 3).trim() };
  });
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/decisions/review`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read') || action.endsWith('.metrics');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: action.startsWith('prediction.') ? 'prediction' : 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const review = {
  index: (s: Scope) => p<{ at: string; packages: PackageRow[]; reversions: ReversionRow[]; sets: SetRow[]; cited: CitedRow[]; receipt: Receipt }>(s, '/index', 'decision.review.read', 'DPK'),
  get: (s: Scope, packageId: string) => p<{ review: Review; metrics: Metrics; receipt: Receipt }>(s, `/packages/${packageId}`, 'decision.review.read', 'DPK', {}, packageId),
  metrics: (s: Scope, packageId: string) => p<{ metrics: Metrics; receipt: Receipt }>(s, `/packages/${packageId}/metrics`, 'decision.review.metrics', 'DPK', {}, packageId),
  recordChange: (s: Scope, packageId: string, payload: { title: string; statement: string; evidence: Array<{ kind: string; id: string; note?: string }> }) =>
    p<{ change: Row; receipt: Receipt }>(s, `/packages/${packageId}/changes`, 'decision.review.change', 'DPK', payload as unknown as Row, packageId),
  reopen: (s: Scope, packageId: string, cause: { kind: ReopenCause; ref: string }) =>
    p<{ reopened: Row; receipt: Receipt }>(s, `/packages/${packageId}/reopen`, 'decision.package.reopen', 'DPK', { cause }, packageId),
  resolveReversion: (s: Scope, requestId: string, resolution: 'reversioned' | 'declined', note: string) =>
    p<{ reversion: Row; receipt: Receipt }>(s, `/reversions/${requestId}/resolve`, 'decision.review.reversion', 'SCN', { resolution, note }, requestId),
  assess: (s: Scope, packageId: string, version: number, payload: Row) =>
    p<{ assessment: Assessment; receipt: Receipt }>(s, `/packages/${packageId}/versions/${version}/outcome-assessments`, 'decision.review.outcome', 'DPK', payload, packageId),
  setTerms: (s: Scope, packageId: string, version: number, payload: Row) =>
    p<{ terms: Terms; receipt: Receipt }>(s, `/packages/${packageId}/versions/${version}/terms`, 'decision.review.terms', 'DPK', payload, packageId),
  replay: (s: Scope, packageId: string, version: number, reason: string) =>
    p<{ replay: Row; request: Row; receipt: Receipt }>(s, `/packages/${packageId}/versions/${version}/replay`, 'decision.replay', 'RPL', { reason }),
  linkLesson: (s: Scope, assessmentId: string, kind: 'hypothesis' | 'lesson', memoryItemId: string) =>
    p<{ lesson: Row; receipt: Receipt }>(s, `/assessments/${assessmentId}/lessons`, 'decision.review.lesson', 'MEM', { kind, memoryItemId }, memoryItemId),
  setStatus: (s: Scope, setId: string) => p<{ set: SetStatus; receipt: Receipt }>(s, `/sets/${setId}`, 'decision.review.read', 'SCS', {}, setId),
  setCadence: (s: Scope, setId: string, payload: { everyDays: number; anchorAt: string | null; rationale: string; expectedVersion: number | null }) =>
    p<{ cadence: Row; receipt: Receipt }>(s, `/sets/${setId}/cadence`, 'prediction.scenario.set.cadence', 'SCS', payload as unknown as Row, setId),
  sweep: (s: Scope) => p<{ sweep: Row; receipt: Receipt }>(s, '/cadence/sweep', 'prediction.scenario.set.cadence', 'SCS'),
  scoreCited: (s: Scope) => p<{ relevance: Row; receipt: Receipt }>(s, '/relevance/score', 'prediction.scenario.relevance.score', 'SCN'),
};
