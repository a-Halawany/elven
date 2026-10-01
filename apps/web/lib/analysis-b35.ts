/**
 * The decision-analysis client — CP-6 B35 part `analysis` (0101 §A; F-P6-01: criteria with EXPOSED weights and the value-judgment owner
 * named, inspectable scoring, the WEIGHT SENSITIVITY, the trade-offs, constraints and stakeholder obligations evaluated per option, option
 * candidates, the package's inputs assembled; F-P5-07: the adversarial-response sensitivity and the value of information on the decision
 * page; F-P4-08: reversibility and option value across futures).
 *
 * Every response is returned VERBATIM: the scores, ranks, flips, dominance, obligation results, candidates and rank changes are the
 * SERVER's (decision.package_analysis and the ports). The helpers below only WORD and LAY OUT what the record says; nothing here scores,
 * ranks or evaluates. Every figure on the demonstration is SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;

export interface Criterion { key: string; title: string; objective_id: string; direction: 'max' | 'min'; weight: number | string; share: number | string; scale: string; unit: string; value_owner: string }
export interface ScoredOption { key: string; title: string; kind: string; values: Record<string, number | string>; normalised: Record<string, number | string>; bases: Record<string, string>; missing: string[]; score: number | string | null; rank: number | null }
export interface Flip { weight: number | string; to: string; change_pct: number | string }
export interface CriterionSensitivity { key: string; title: string; weight: number | string; leader: string; flip_up: Flip | null; flip_down: Flip | null;
  order_up: { weight: number | string; between: [string, string] } | null; order_down: { weight: number | string; between: [string, string] } | null }
export interface Sensitivity { leader: string | null; criteria: CriterionSensitivity[]; most_sensitive: string | null; most_sensitive_change_pct: number | string | null; method?: string; note?: string }
export interface Tradeoffs { dominance: Array<{ dominant: string; dominated: string }>; non_dominated: string[]; leader: string | null;
  given_up: Array<{ option: string; criteria: Array<{ criterion: string; title: string; unit: string; direction: string; leader_value: number | string; other_value: number | string }> }> }
export interface ObligationState { obligation_id: string; key: string; kind: 'constraint' | 'obligation'; stakeholder: string | null; stakeholder_ref: string | null; statement: string; test: Row; owner: string;
  evaluations: Record<string, { result: 'satisfied' | 'violated' | 'unknown'; basis: Row; evaluated_by: string | null; evaluated_at: string | null }> }
export interface Candidate { candidate_id: string; generation_id: string; posture: string; key: string; title: string; rationale: string; rule: string; basis: Row; generated_by: string; generated_at: string;
  adopted_as: string | null; adopted_by: string | null; adopted_at: string | null; adopted_version: number | null }
export interface AssemblyItem { kind: string; id: string; version: number | null; title: string; state: string; why: string[] }
export interface Adversarial { assessment_id: string; option: string; actor: string; actor_element_id: string; agency: string; scenario_id: string; response: string; effects: Array<{ criterion: string; op: string; value: number }>;
  basis: string; base_score: number | string; base_rank: number; response_score: number | string; response_rank: number; rank_change: number; ranking_under_response: string[]; assessed_by: string; assessed_at: string }
export interface Voi { assessment_id: string; package_version: number | null; information: string; delay_days: number; evpi: number | string; evsi: number | string; delay_cost: number | string; net_value: number | string;
  payoff_unit: string; prior_best: string[]; recommendation: 'wait' | 'act'; recorded_at: string }
export interface SecondOrder { option: string; run_id: string; run_state: string; validity: string; validated: boolean; derivation_id: string | null; reason: string | null;
  effects: Array<{ depth: number; entity: string; metric: string; unit: string; values: { p10: number; p50: number; p90: number }; timing: Row }> }
export interface Futures { review: { review_id: string; set_id: string; reviewed_at: string; payoff_unit: string; most_robust: string[]; least_regret: string[]; branches: number } | null;
  options: Array<{ key: string; title: string; kind: string; reversibility: string | null; robustness: number | string | null; regret: number | string | null; most_robust: boolean; least_regret: boolean }>;
  reversibility: string | null; option_value: { net_value_of_waiting: number | string; evsi: number | string; recommendation: string; payoff_unit: string; information: string } | null }
export interface PackageAnalysis {
  package: { package_id: string; title: string; state: string; owner: string; current_version: number | null; synthetic_state: boolean };
  version: { version: number; state: string; objectives: unknown[]; reversibility: string | null };
  criteria_version: number | null; criteria: Criterion[]; criteria_history: Array<{ criteria_version: number; set_by: string; set_at: string; value_owner: string; rationale: string; weights: Record<string, number> }>;
  assessments: Array<{ option: string; criterion: string; value: number | string; basis_kind: 'computed' | 'entered'; basis: string; cited: Row | null }>;
  options: ScoredOption[]; ranking: string[]; method: string; sensitivity: Sensitivity; tradeoffs: Tradeoffs; obligations: ObligationState[];
  violations: Array<{ obligation: string; kind: string; stakeholder: string | null; statement: string; option: string }>;
  value_of_information: Voi[]; second_order: SecondOrder[]; futures: Futures; adversarial: Adversarial[]; candidates: Candidate[];
  assembly: { assembly_id: string; items: AssemblyItem[]; counts: Record<string, number>; assembled_at: string } | null;
}
export interface Actor { element_id: string; name: string; agency: string; scenario_title: string; why: string }
export interface PackageRow { package_id: string; title: string; state: string; current_version: number | null; criteria_version: number | null; options: number }

/* ───────────── the wording (what the record says, in words) ───────────── */
export const POSTURES: Record<string, string> = { defer: 'Defer', stage: 'Stage', pilot: 'Pilot', hedge: 'Hedge', acquire_information: 'Acquire information', exit: 'Exit' };

/** A weight flip in words: "at weight 4.2 (+40%) supplier-b overtakes", or that no weight changes the lead. */
export function flipWords(f: Flip | null, direction: 'up' | 'down'): string {
  if (f === null) return direction === 'up' ? 'no higher weight changes the lead' : 'no lower weight (above 0) changes the lead';
  const pct = Number(f.change_pct);
  return `at weight ${f.weight} (${pct > 0 ? '+' : ''}${pct}%) ${f.to} takes the lead`;
}
/** An obligation result as glyph, token and word. */
export function resultMark(r: 'satisfied' | 'violated' | 'unknown' | undefined): { glyph: string; token: string; text: string } {
  if (r === 'satisfied') return { glyph: '✓', token: '--eye-color-success', text: 'satisfied' };
  if (r === 'violated') return { glyph: '✕', token: '--eye-color-critical', text: 'violated' };
  return { glyph: '?', token: '--eye-color-warning', text: 'unknown' };
}
/** A rank change in words: "falls from 1st to 3rd" / "rises" / "keeps its rank". */
export function rankChangeWords(base: number, under: number): string {
  const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  if (under > base) return `falls from ${ord(base)} to ${ord(under)}`;
  if (under < base) return `rises from ${ord(base)} to ${ord(under)}`;
  return `keeps its rank (${ord(base)})`;
}
/** A test in words: "dual_lead_time ≤ 30" or "the owner's judgment". */
export function testWords(t: Row): string {
  if (t['kind'] === 'threshold') return `${String(t['criterion'])} ${String(t['op']).replace('>=', '≥').replace('<=', '≤')} ${String(t['value'])}`;
  return 'its owner\'s judgment';
}
/** The weights typed in the editor, merged over the current set (blank = unchanged); null when a typed weight is not a positive number. */
export function mergedWeights(criteria: Criterion[], typed: Record<string, string>): Array<Row> | null {
  const out: Array<Row> = [];
  for (const c of criteria) {
    const t = (typed[c.key] ?? '').trim();
    const w = t === '' ? Number(c.weight) : Number(t);
    if (!Number.isFinite(w) || w <= 0) return null;
    out.push({ key: c.key, title: c.title, objectiveId: c.objective_id, direction: c.direction, weight: w, scale: c.scale, unit: c.unit });
  }
  return out;
}

/* ───────────── the calls ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/decisions/analysis`;
const READ = 'decision.analysis.read';
async function p<T>(s: Scope, path: string, action: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'DPK', object_id: objectId,
    purpose_id: 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const pv = (pkg: string, v: number) => `/packages/${pkg}/versions/${v}`;

export const analysisApi = {
  list: (s: Scope) => p<{ at: string; packages: PackageRow[]; receipt: Receipt }>(s, '/list', READ),
  read: (s: Scope, pkg: string, version: number | null = null) => p<{ analysis: PackageAnalysis; actors: Actor[]; receipt: Receipt }>(s, `/packages/${pkg}/read`, READ, version === null ? {} : { version }, pkg),
  criteria: (s: Scope, pkg: string, v: number, payload: { criteria: Row[]; valueOwner: string; rationale: string; expectedVersion: number | null }) =>
    p<{ criteria: Row & { ranking_before: string[]; ranking_after: string[]; ranking_changed: boolean; criteria_version: number }; receipt: Receipt }>(s, `${pv(pkg, v)}/criteria`, 'decision.analysis.criteria', payload as unknown as Row, pkg),
  assess: (s: Scope, pkg: string, v: number, payload: { option: string; criterion: string; value?: number | null; cited?: { kind: string; id: string; measure: string } | null; basis?: string | null }) =>
    p<{ assessment: Row; receipt: Receipt }>(s, `${pv(pkg, v)}/assess`, 'decision.analysis.assess', payload as unknown as Row, pkg),
  obligation: (s: Scope, pkg: string, payload: { key: string; kind: string; stakeholder: string | null; stakeholderRef?: string | null; statement: string; test: Row; owner: string }) =>
    p<{ obligation: Row; receipt: Receipt }>(s, `/packages/${pkg}/obligations`, 'decision.analysis.obligation', payload as unknown as Row, pkg),
  evaluate: (s: Scope, pkg: string, v: number, judgments: Array<{ obligation: string; option: string; result: string; basis: string }> = []) =>
    p<{ evaluation: Row & { violated: Row[] }; receipt: Receipt }>(s, `${pv(pkg, v)}/evaluate`, 'decision.analysis.evaluate', { judgments }, pkg),
  generate: (s: Scope, pkg: string, v: number) => p<{ generation: Row & { candidates: Candidate[] }; receipt: Receipt }>(s, `${pv(pkg, v)}/generate`, 'decision.analysis.generate', {}, pkg),
  assemble: (s: Scope, pkg: string, v: number) => p<{ assembly: Row & { items: AssemblyItem[] }; receipt: Receipt }>(s, `${pv(pkg, v)}/assemble`, 'decision.analysis.assemble', {}, pkg),
  adversarial: (s: Scope, pkg: string, v: number, payload: { option: string; actorElementId: string; response: string; effects: Array<{ criterion: string; op: string; value: number }>; basis: string }) =>
    p<{ adversarial: Row; receipt: Receipt }>(s, `${pv(pkg, v)}/adversarial`, 'decision.analysis.adversarial', payload as unknown as Row, pkg),
};
