/**
 * The Risk and Opportunity client — CP-6 B32 (0089 §R; F-P4-13: WS-09, UX-35-001..006, OBJ-22/-23, JRN-08/-09, CAP-FW-04/-05).
 *
 * Every response is returned VERBATIM (the Prediction client's rule): an assessment's brackets, a residual's computation, an appetite's
 * judgement, an aggregation's method and basis, a refusal's reason are rendered exactly as the server recorded them. Three rules are the
 * server's and the screen only shows them: a risk and an opportunity are the SAME object with a polarity (shown side by side, worded the
 * same way); an AI estimate is a proposal (the owner accepts — the exact version, by its digest, after the preview; a sponsor sponsors); an
 * exposure with a GAP is incomplete and a roll-up that includes it is refused — no control on this screen hides a gap or rolls one up.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export const POLARITIES = ['risk', 'opportunity'] as const;
export type Polarity = (typeof POLARITIES)[number];
/** prediction.exposure_current's state CHECK (0089 §R4). */
export const EXPOSURE_STATES = ['identified', 'assessed', 'accepted', 'contested', 'sponsored', 'closed'] as const;
export type ExposureState = (typeof EXPOSURE_STATES)[number];
/** prediction.exposure_versions' state CHECK. */
export const VERSION_STATES = ['proposed', 'accepted', 'superseded', 'contested'] as const;
/** prediction.exposure_responses' kind CHECK. */
export const RESPONSE_KINDS = ['mitigate', 'exploit', 'accept', 'transfer', 'avoid'] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];
/** The aggregation methods (prediction.exposure_aggregations.method). */
export const AGGREGATION_METHODS = ['max', 'sum', 'bounded'] as const;

export interface Residual {
  residual_id: string; version: number; inherent_low: number | string; inherent_high: number | string; residual_low: number | string; residual_high: number | string; unit: string;
  computation: string; breach: boolean | null; threshold: number | string | null; appetite_version: number | null; computed_at: string; cause: 'acceptance' | 'control';
}
export interface ExposureRow {
  exposure_id: string; polarity: Polarity; category_key: string; taxonomy_version: number; owner_principal_id: string; sponsor_principal_id: string | null;
  review_every_days: number | null; state: ExposureState; current_version: number; accepted_version: number | null; accepted_at: string | null; routed_candidate_id: string | null;
  title: string | null; statement: string | null; residual?: Residual | null; breach: boolean | null; gaps: string[]; has_agent_proposal: boolean;
  dims?: Record<string, unknown>; priority?: { key: unknown[]; explanation: string; rule: string } | null; closure?: Record<string, unknown> | null;
}
export interface VersionRow {
  version: number; mechanism: string; probability_low: string | number | null; probability_high: string | number | null; plausibility: 'low' | 'medium' | 'high' | null;
  impact_low: string | number; impact_high: string | number; unit: string; horizon: string; response_window_hours: number | null; velocity: string | null; reversibility: string | null;
  controllability: string | null; options: Array<{ key: string; label: string; kind: string; cost?: number | null }>; evidence: Array<{ object_id: string; version?: number }>;
  confidence: string | number | null; digest: string; assessed_by: string; assessed_kind: 'human' | 'agent'; agent_run_id: string | null; estimate_rule: string | null;
  assessed_at: string; state: (typeof VERSION_STATES)[number]; state_reason: string | null;
}
export interface Register {
  risks: ExposureRow[]; opportunities: ExposureRow[]; taxonomy: { version: number; categories: Array<{ key: string; label: string; polarity: string; parent?: string }> } | null;
  appetites: Array<{ category_key: string; version: number; threshold: string | number; unit: string; statement: string; approved_by: string; approved_at: string }>;
  aggregations: Aggregation[]; counts: { risks: number; opportunities: number; with_gaps: number; outside_appetite: number }; rule: string; at: string;
}
export interface Aggregation {
  aggregation_id: string; polarity: Polarity; unit: string; method: (typeof AGGREGATION_METHODS)[number]; total_low?: string | number; total_high?: string | number;
  total?: { low: string | number; high: string | number }; naive_sum_high: string | number; basis: string;
  clusters: Array<{ members: string[]; low: number; high: number; members_sum_high: number; shared_drivers: Array<{ kind: string; id: string }>; rule: string }>;
  agent_estimates_not_used: Array<Record<string, unknown>>;
}
export interface ExposureDetail {
  exposure: ExposureRow; objectives: string[]; versions: VersionRow[]; events: Array<{ event: string; occurred_at: string; actor_principal_id: string; details: Record<string, unknown> }>;
  drivers: Array<{ driver_kind: string; driver_id: string; source: string; note: string | null }>;
  controls: Array<{ control_id: string; title: string; control_kind: string; effectiveness_low: string | number; effectiveness_high: string | number; owner_principal_id: string }>;
  residuals: Residual[]; hypotheses: Array<{ version: number; statement: string; falsifier: string; value_low: string | number; value_high: string | number; unit: string; timing: Record<string, unknown>; required_capabilities: string[] }>;
  correlations: { declared: Array<Record<string, unknown>>; estimated: Array<Record<string, unknown>> };
  responses: Array<{ response_id: string; response_kind: ResponseKind; decision_object_id: string; package_id: string; package: Record<string, unknown> | null; outcomes: Array<Record<string, unknown>> }>;
  candidate: Record<string, unknown> | null; warning: Record<string, unknown> | null; at: string;
}
export interface Preview {
  version: number; digest: string; state: string; assessed_kind: 'human' | 'agent'; acceptable: boolean; would_supersede: number[]; residual: Residual & { appetite: Record<string, unknown> | null };
  consequence: string; eligible: { owner: string; rule: string };
}

/* ───────────── what the screen says, in words (glyph + text, never colour alone) ───────────── */
export const POLARITY_LABEL: Record<Polarity, string> = { risk: '▼ risk — what the change can damage', opportunity: '▲ opportunity — what the change can enable' };
export const STATE_LABEL: Record<ExposureState, string> = {
  identified: '○ identified — not yet assessed', assessed: '◐ assessed — awaiting the owner\'s acceptance', accepted: '● accepted by its owner',
  contested: '⚠ contested — a challenge is open; not rolled up', sponsored: '★ sponsored — an evaluation is owned', closed: '✕ closed',
};
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const fmt = (v: number): string => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10_000) / 10_000));
/** A range in words — never collapsed to a single number (false precision is the server's refusal; the screen does not reintroduce it). */
export function rangeLine(low: unknown, high: unknown, unit: string | null | undefined): string {
  const a = n(low); const b = n(high);
  if (a === null || b === null) return 'no input';
  return `${fmt(a)} – ${fmt(b)}${unit ? ` ${unit}` : ''}`;
}
/** The likelihood as it was stated: a probability bracket, or a plausibility — never a probability invented from a plausibility. */
export function likelihoodLine(v: Pick<VersionRow, 'probability_low' | 'probability_high' | 'plausibility'>): string {
  if (n(v.probability_low) !== null && n(v.probability_high) !== null) return `probability ${rangeLine(v.probability_low, v.probability_high, null)}`;
  return v.plausibility ? `plausibility ${v.plausibility} (no probability stated)` : 'likelihood: no input';
}
/** The residual with its appetite judgement in words. */
export function residualLine(r: Residual | null | undefined): string {
  if (r === null || r === undefined) return 'no residual — no accepted assessment';
  const judged = r.breach === true ? `OUTSIDE appetite (threshold ${fmt(Number(r.threshold))} ${r.unit})` : r.breach === false ? `within appetite (threshold ${fmt(Number(r.threshold))} ${r.unit})` : 'appetite not judged';
  return `${rangeLine(r.residual_low, r.residual_high, r.unit)} · ${judged}`;
}
/** The gaps: none is "complete"; each one keeps the exposure out of a roll-up (the server refuses it). */
export function gapLine(gaps: string[] | undefined): string {
  return gaps === undefined || gaps.length === 0 ? '● complete — admissible to a roll-up' : `⚠ INCOMPLETE — ${gaps.join(' · ')}`;
}
/** Who assessed a version, in words: an agent's version is an estimate awaiting the owner. */
export function assessorLine(v: Pick<VersionRow, 'assessed_kind' | 'estimate_rule' | 'state'>): string {
  return v.assessed_kind === 'agent' ? `an agent's ESTIMATE (${v.estimate_rule ?? 'rule unstated'}) — ${v.state === 'accepted' ? 'accepted by the owner' : 'a recommendation, never an input until the owner accepts it'}` : `a person's assessment — ${v.state}`;
}
/** An aggregation's method in words. */
export function methodLine(a: Pick<Aggregation, 'method' | 'unit'> & { total?: { low: unknown; high: unknown }; total_low?: unknown; total_high?: unknown; naive_sum_high: unknown }): string {
  const lo = a.total?.low ?? a.total_low; const hi = a.total?.high ?? a.total_high;
  const naive = ` (the naive sum would say ${fmt(Number(a.naive_sum_high))} ${a.unit})`;
  switch (a.method) {
    case 'max': return `one shared driver: counted ONCE — ${fmt(Number(hi))} ${a.unit}${naive}`;
    case 'sum': return `independence declared by a person: ${rangeLine(lo, hi, a.unit)}`;
    default: return `dependence not declared: BOUNDED ${rangeLine(lo, hi, a.unit)} — not a single number${naive}`;
  }
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'RSK', object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const exposures = {
  list: (s: Scope) => p<Register & { receipt: Receipt }>(s, '/exposures/list', 'prediction.exposure.read'),
  get: (s: Scope, id: string) => p<ExposureDetail & { receipt: Receipt }>(s, `/exposures/${id}/get`, 'prediction.exposure.read', {}, id),
  priority: (s: Scope) => p<{ priority: { rule: string; groups: Array<{ group: string; items: Array<ExposureRow & { position: number }> }> }; receipt: Receipt }>(s, '/exposures/priority', 'prediction.exposure.read'),
  taxonomy: (s: Scope) => p<{ taxonomy: { current: Register['taxonomy']; versions: unknown[]; appetites: Register['appetites'] }; receipt: Receipt }>(s, '/exposures/taxonomy/get', 'prediction.exposure.read'),
  register: (s: Scope, payload: { strategyObjectId: string; polarity: Polarity; category: string; owner: string; reviewEveryDays?: number }) =>
    p<{ exposure: Record<string, unknown>; receipt: Receipt }>(s, '/exposures/register', 'prediction.exposure.register', payload, payload.strategyObjectId),
  assess: (s: Scope, id: string, expectedVersion: number, assessment: Record<string, unknown>) =>
    p<{ assessment: Record<string, unknown>; receipt: Receipt }>(s, `/exposures/${id}/assess`, 'prediction.exposure.assess', { expectedVersion, assessment }, id),
  /** OBJ-22's consequence preview — read BEFORE the acceptance; the digest it returns is what the owner accepts. */
  preview: (s: Scope, id: string, version: number) => p<{ preview: Preview; receipt: Receipt }>(s, `/exposures/${id}/versions/${version}/preview`, 'prediction.exposure.read', {}, id),
  accept: (s: Scope, id: string, version: number, digest: string, rationale: string) =>
    p<{ acceptance: Record<string, unknown>; routing: Record<string, unknown>; receipt: Receipt }>(s, `/exposures/${id}/versions/${version}/accept`, 'prediction.exposure.accept', { digest, rationale }, id),
  contest: (s: Scope, id: string, version: number, reason: string) =>
    p<{ contest: Record<string, unknown>; receipt: Receipt }>(s, `/exposures/${id}/versions/${version}/contest`, 'prediction.exposure.contest', { reason }, id),
  addControl: (s: Scope, id: string, payload: { title: string; kind: 'preventive' | 'detective' | 'corrective'; effectiveness: { low: number; high: number }; owner: string }) =>
    p<{ control: Record<string, unknown>; routing: Record<string, unknown>; receipt: Receipt }>(s, `/exposures/${id}/controls`, 'prediction.exposure.control.add', payload, id),
  route: (s: Scope, id: string) => p<{ routing: Record<string, unknown>; receipt: Receipt }>(s, `/exposures/${id}/route`, 'prediction.exposure.route', {}, id),
  sponsor: (s: Scope, id: string, version: number, digest: string, terms: { option_key: string; rationale: string; conditions: string[]; budget?: { amount: number; unit: string }; objective_id?: string }) =>
    p<{ sponsorship: Record<string, unknown>; evaluation: Record<string, unknown>; receipt: Receipt }>(s, `/exposures/${id}/versions/${version}/sponsor`, 'prediction.exposure.sponsor', { digest, terms }, id),
  openDecision: (s: Scope, id: string, kind: ResponseKind, decision: { title?: string; statement?: string; decisionObjectId?: string; packageId?: string } = {}) =>
    p<{ response: Record<string, unknown> }>(s, `/exposures/${id}/decisions/open`, 'prediction.exposure.respond', { kind, decision }, id),
  close: (s: Scope, id: string, criterion: string, reason: string) =>
    p<{ closure: Record<string, unknown>; receipt: Receipt }>(s, `/exposures/${id}/close`, 'prediction.exposure.close', { criterion, reason }, id),
  aggregate: (s: Scope, members: string[]) => p<{ aggregation: Aggregation; receipt: Receipt }>(s, '/exposures/aggregate', 'prediction.exposure.aggregate', { members }),
};
