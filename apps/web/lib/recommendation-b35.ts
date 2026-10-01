/**
 * The recommendation client — CP-6 B35 part `recommendation` (0101 §R; F-P6-02; F-P4-09's and F-P5-06's B35 pieces; ES-37-008).
 *
 * Every response is returned VERBATIM: a package's recommendations SIDE BY SIDE (AI and human, each with what could make it wrong, the four
 * separated components, the flags and the decision coverage now, the reviews), a version's completeness (the gaps, the attestation, the
 * mode), the acts' answers. The acts are a named person's own (record; review — accept for consideration, decline, request changes; withdraw;
 * attest and acknowledge the human-led mode); the server refuses anyone else. The helpers below only word what the record says.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type AuthorKind = 'human' | 'agent';
export type RecommendationState = 'proposed' | 'accepted_for_consideration' | 'declined' | 'withdrawn' | 'superseded';
export type Verdict = 'accept_for_consideration' | 'decline' | 'request_changes';
export interface Sourced { statement: string; source: { kind: string; ref: string }; decision_use?: { use: string; label: string } }
export interface Flag { class: 'scenario_quality' | 'run_indicator'; indicator?: string; run_id?: string; scenario_id?: string; detail: string }
export interface OptionRun { run_id: string; use: string; label: string | null; reasons: Array<{ class: string; detail: string }>; scenario_id: string | null; scenario_branch_id: string | null }
export interface Coverage {
  basis: 'bound_set' | 'cited_scenarios' | 'none'; option_key: string; share: number | null; label: string;
  live_branches: Array<{ branch_id: string; name: string; kind: string }>; assessed: Array<{ branch_id: string; name: string; kind: string; how: string }>; unassessed: Array<{ branch_id: string; name: string; kind: string }>;
}
export interface Review { review_id: string; reviewer_principal_id: string; verdict: Verdict; rationale: string; override: string | null; flags_at_review: Flag[]; compared: number; reviewed_at: string }
export interface Recommendation {
  recommendation_id: string; package_id: string; version: number; option_key: string; option_title: string | null; what: string; for_whom: string; by_when: string;
  assumptions: Array<{ statement: string }>; what_could_make_it_wrong: Array<{ statement: string; signpost?: string }>; missing_evidence: Array<{ what: string; why?: string }>;
  components: { value_judgments: Sourced[]; policy_constraints: Sourced[]; analytical_assumptions: Sourced[]; model_outputs: Sourced[] };
  author_kind: AuthorKind; author_principal_id: string; state: RecommendationState; digest: string; recorded_at: string;
  flags_at_recording: Flag[]; flags: Flag[]; option_runs: OptionRun[]; coverage_at_recording: Coverage; coverage: Coverage;
  decided_by: string | null; decided_at: string | null; withdrawal_reason: string | null; superseded_reason: string | null; reviews: Review[];
}
export interface Gap { category: 'evidence' | 'uncertainty' | 'alternatives' | 'explanation'; key: string; detail: string }
export interface Attestation {
  attestation_id: string; version?: number; state: 'attested' | 'acknowledged' | 'superseded'; missing: Array<{ category: string; key: string; note: string | null }>; reason: string;
  attested_by: string; attested_at: string; acknowledged_by: string | null; acknowledged_at: string | null; acknowledgement_note: string | null; set_aside: Row[];
}
export interface Completeness {
  package_id: string; version: number; version_state: string; package_state: string; complete: boolean; gaps: Gap[]; not_assessed: Array<{ category: string; reason: string }>;
  live_recommendations: number; attestation: Attestation | null; covered: boolean; uncovered: Gap[]; mode: 'complete' | 'human_led' | 'attested' | 'incomplete'; label: string;
}
export interface PackageView {
  package_id: string; title: string; statement: string; owner_principal_id: string; state: string; current_version: number | null; committed_version: number | null;
  versions: Array<{ version: number; state: string; choice_option: string | null; options: Array<{ key: string; title: string; kind: string; simulated: boolean }> }>;
  recommendations: Recommendation[]; side_by_side: { version: number | null; agent: string[]; human: string[] }; completeness: Completeness | null; attestations: Attestation[];
  events: Array<{ event: string; version: number; recommendation_id: string | null; attestation_id: string | null; actor_principal_id: string; occurred_at: string }>;
}
export interface PackageRow { package_id: string; title: string; state: string; current_version: number | null; owner_principal_id: string; recommendations: number; live: number; agent: number; last_at: string }
export interface RecordPayload {
  optionKey: string; what: string; forWhom: string; byWhen: string; assumptions: Array<{ statement: string }>; whatCouldMakeItWrong: Array<{ statement: string }>;
  missingEvidence: Array<{ what: string }>; components: { valueJudgments: Sourced[]; policyConstraints: Sourced[]; analyticalAssumptions: Sourced[]; modelOutputs: Sourced[] };
}

/* ───────────── the words ───────────── */
/** An author as words and a glyph — the AI is always named as such. */
export function authorMark(kind: string): { glyph: string; text: string } {
  return kind === 'agent' ? { glyph: '⚙', text: 'DECISION AGENT (AI) — drafted, never decides' } : { glyph: '●', text: 'NAMED HUMAN' };
}
/** A state as a glyph, a token and words — never colour alone. */
export function stateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'proposed': return { glyph: '◌', token: '--eye-color-uncertain', text: 'AWAITING REVIEW' };
    case 'accepted_for_consideration': return { glyph: '●', token: '--eye-color-success', text: 'ACCEPTED FOR CONSIDERATION — not a decision' };
    case 'declined': return { glyph: '⊘', token: '--eye-color-critical', text: 'DECLINED' };
    case 'withdrawn': return { glyph: '⊘', token: '--eye-color-ink-muted', text: 'WITHDRAWN' };
    case 'superseded': return { glyph: '↷', token: '--eye-color-ink-muted', text: 'SUPERSEDED' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: state.toUpperCase() };
  }
}
export function flagWords(f: Flag): string {
  return f.class === 'scenario_quality' ? `SCENARIO QUALITY FAILED — ${f.detail}` : `INDICATOR ${String(f.indicator ?? '').replace(/_/g, ' ').toUpperCase()} — ${f.detail}`;
}
export function coverageWords(c: Coverage | null | undefined): string {
  if (c === null || c === undefined) return 'decision coverage not read';
  if (c.share === null) return c.label;
  const missing = c.unassessed.length === 0 ? 'every live branch assessed' : `not assessed on: ${c.unassessed.map((b) => b.name).join(', ')}`;
  return `${c.label} — ${missing}`;
}
export function completenessWords(c: Completeness | null | undefined): string {
  if (c === null || c === undefined) return 'completeness not read';
  const na = c.not_assessed.length === 0 ? '' : ` (not assessed: ${c.not_assessed.map((n) => n.category).join(', ')})`;
  return `${c.label}${na}`;
}
export const COMPONENT_LABELS: ReadonlyArray<[keyof Recommendation['components'], string]> = [
  ['value_judgments', 'Value judgments'], ['policy_constraints', 'Policy constraints'], ['analytical_assumptions', 'Analytical assumptions'], ['model_outputs', 'Model outputs'],
];
/** "kind:ref | statement" lines → sourced items (a line without "|" is a statement with a stated source). */
export function sourcedOf(text: string, defaultKind = 'stated'): Sourced[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '').map((l) => {
    const i = l.indexOf('|');
    if (i < 0) return { statement: l, source: { kind: defaultKind, ref: 'stated by the author' } };
    const head = l.slice(0, i).trim(); const statement = l.slice(i + 1).trim();
    const c = head.indexOf(':');
    return c < 0 ? { statement, source: { kind: head, ref: 'stated by the author' } } : { statement, source: { kind: head.slice(0, c).trim(), ref: head.slice(c + 1).trim() } };
  });
}
export function linesOf(text: string): string[] { return text.split('\n').map((l) => l.trim()).filter((l) => l !== ''); }

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/decisions/recommendations`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const recommendations = {
  list: (s: Scope) => p<{ at: string; packages: PackageRow[]; receipt: Receipt }>(s, '/list', 'decision.recommendation.read', 'DPK'),
  view: (s: Scope, packageId: string) => p<{ package: PackageView; receipt: Receipt }>(s, `/packages/${packageId}`, 'decision.recommendation.read', 'DPK', {}, packageId),
  completeness: (s: Scope, packageId: string, version: number) =>
    p<{ completeness: Completeness; receipt: Receipt }>(s, `/packages/${packageId}/versions/${version}/completeness`, 'decision.recommendation.read', 'DPK', {}, packageId),
  record: (s: Scope, packageId: string, version: number, payload: RecordPayload) =>
    p<{ recommendation: Row; receipt: Receipt }>(s, `/packages/${packageId}/versions/${version}/record`, 'decision.recommendation.record', 'DPK', payload as unknown as Row, packageId),
  review: (s: Scope, recommendationId: string, payload: { verdict: Verdict; rationale: string; override?: string | null; expectedDigest?: string | null }) =>
    p<{ review: Row; receipt: Receipt }>(s, `/${recommendationId}/review`, 'decision.recommendation.review', 'REC', payload as unknown as Row, recommendationId),
  withdraw: (s: Scope, recommendationId: string, reason: string) =>
    p<{ withdrawal: Row; receipt: Receipt }>(s, `/${recommendationId}/withdraw`, 'decision.recommendation.withdraw', 'REC', { reason }, recommendationId),
  attest: (s: Scope, packageId: string, version: number, payload: { missing: Array<{ key: string; category?: string; note?: string }>; reason: string }) =>
    p<{ attestation: Row; receipt: Receipt }>(s, `/packages/${packageId}/versions/${version}/attest`, 'decision.incomplete.attest', 'DPK', payload as unknown as Row, packageId),
  acknowledge: (s: Scope, attestationId: string, reason: string) =>
    p<{ attestation: Row; receipt: Receipt }>(s, `/attestations/${attestationId}/acknowledge`, 'decision.incomplete.attest', 'DPK', { reason }),
};
