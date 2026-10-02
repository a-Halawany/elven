/**
 * The reconciliation client — CP-6 B30 part `estimation` (0103 §ES; F-P5-02: state estimation and continuous reconciliation).
 *
 * Every response is returned VERBATIM: an estimate's proposed value and confidence, every estimator's candidate (the disagreement kept, the
 * excluded with the reason), the input qualification the server recorded (source health, cadence, unit, truth state), the constraint check
 * before publish, the range and the materiality, the routing to the owner, and — once the owner approves — the snapshot it opened. The
 * helpers below only WORD what the record says — nothing here estimates, qualifies, checks or decides. Every figure is SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type EstimateState = 'proposed' | 'approved' | 'declined' | 'superseded';

export interface Candidate {
  estimator_id: string; version: number; name: string; role: 'primary' | 'challenger'; method: string; value: number | null; raw: number | null; confidence: number | null;
  window: { from: string; to: string; n: number } | null; last_point: { date: string; value: number } | null; evidence: Array<{ id: string; version: number }>;
  qualified?: boolean; excluded: string | null;
}
export interface Qualification {
  qualification_id?: string; estimator_id: string; estimator_version?: number; input_index?: number; index?: number; input: Row; source_id: string | null;
  source_health: { state: string; basis?: string | null }; cadence: Row; unit_check: Row; truth_state: Row; verdict: 'qualified' | 'disqualified'; reasons: string[];
}
export interface Estimate {
  estimate_id: string; twin_id: string; key: string; head_version: number | null; head_value: unknown; head_unit: string | null; as_of: string;
  proposed_value: string | number; unit: string; confidence: string | number; primary_estimator: { estimator_id: string; version: number; name: string; method: string };
  candidates: Candidate[]; spread: { n: number; min: number | null; max: number | null; abs: number | null; relative: number | null; ambiguity_threshold?: number };
  qualification: { qualified_estimators: number; disqualified_estimators: number };
  constraint_check: { outcome: string; pins: Array<{ set_key: string; version: number }>; violations: Array<{ message?: string; constraintKey?: string }>; applied?: string[]; vacuous?: boolean; reason?: string | null };
  constraint_outcome: 'satisfied' | 'violated' | 'indeterminate'; range_check: { min?: number | null; max?: number | null; value: number; verdict: 'inside' | 'outside' };
  materiality: { head_version: number | null; head_value: unknown; delta_abs: number | null; delta_relative: number | null; threshold: number; material: boolean; basis: string };
  material: boolean; ambiguous: boolean; ambiguity_reasons: string[]; routed: boolean; attention_item_id: string | null; state: EstimateState;
  proposed_by: string; proposer_kind: 'human' | 'agent'; agent_id: string | null; run_id: string | null; proposed_at: string;
  decided_by: string | null; decided_at: string | null; decision_note: string | null; applied_version: number | null; superseded_by: string | null;
  qualifications?: Qualification[]; events?: Array<{ event_id: string; event: string; actor_principal_id: string | null; details: Row; occurred_at: string }>;
  attention_item?: { item_id: string; signal_class: string; state: string; owner_principal_id: string | null; title: string } | null;
}
export interface Estimator {
  estimator_id: string; version: number; twin_id: string; key: string; name: string; role: 'primary' | 'challenger'; method: string; parameters: Row; inputs: Row[]; unit: string;
  bounds: { min?: number; max?: number }; materiality: string | number; ambiguity: string | number; constraint_sets: string[]; state: string; declared_at: string; note: string;
}
export interface ObservationRequest {
  request_id: string; twin_id: string; key: string | null; input: Row; input_ref: string; reason_class: string; note: string; via: 'scheduler' | 'attention';
  scheduler: Row | null; attention_item_id: string | null; state: 'open' | 'fulfilled' | 'cancelled'; requester_kind: 'human' | 'agent'; requested_at: string; closed_at: string | null; closure: Row | null;
}
export interface Overview {
  twin: { twin_id: string; title: string; kind: string; owner_principal_id: string };
  head: { version: number; observed_through: string | null; known_at: string; admitted_at: string; completeness: string } | null;
  head_elements: Array<{ key: string; kind: string; value: unknown; unit: string | null; health: string; valid_from: string | null; valid_to: string | null; confidence: string | null }>;
  estimators: Estimator[]; estimates: Estimate[]; requests: ObservationRequest[]; pending: Array<{ twin_id: string; key: string; triggers: number; kinds: string[]; oldest: string }>;
}

/* ───────────── the words ───────────── */
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const fmt = (v: unknown): string => { const x = n(v); return x === null ? '—' : String(Math.round(x * 1000) / 1000); };

/** An estimate's state as a glyph, a token and words — never colour alone. */
export function estimateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'proposed': return { glyph: '◍', token: '--eye-color-accent-default', text: 'PROPOSED — candidate state; the active snapshot is unchanged until the twin owner decides' };
    case 'approved': return { glyph: '●', token: '--eye-color-success', text: 'APPROVED — published into a new snapshot' };
    case 'declined': return { glyph: '✕', token: '--eye-color-ink-muted', text: 'DECLINED by the twin owner' };
    case 'superseded': return { glyph: '◌', token: '--eye-color-ink-muted', text: 'SUPERSEDED by a later proposal' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() || 'UNKNOWN' };
  }
}

/** The proposal in words: the value, the unit, the confidence, against the head. */
export function proposalLine(e: Pick<Estimate, 'key' | 'proposed_value' | 'unit' | 'confidence' | 'head_value' | 'head_unit' | 'head_version' | 'as_of'>): string {
  const head = e.head_version === null ? 'no head on actual' : e.head_value === null || e.head_value === undefined ? `head v${e.head_version} holds no value` : `head v${e.head_version}: ${fmt(e.head_value)} ${e.head_unit ?? ''}`.trim();
  return `${e.key} = ${fmt(e.proposed_value)} ${e.unit} (confidence ${fmt(e.confidence)}; as of ${e.as_of}) — ${head}`;
}

/** One candidate as the server kept it: its value, or why it has none. */
export function candidateLine(c: Candidate): string {
  const who = `${c.name} (${c.role}, ${c.method})`;
  if (c.value === null) return `${who}: no candidate — ${c.excluded ?? 'excluded'}`;
  const win = c.window === null ? '' : ` over ${c.window.n} point(s) ${c.window.from}…${c.window.to}`;
  return `${who}: ${fmt(c.value)}${c.confidence === null ? '' : ` (confidence ${fmt(c.confidence)})`}${win}`;
}

/** The disagreement among the candidates, as the server stated it. */
export function spreadLine(s: Estimate['spread']): string {
  if (s.n === 0 || s.min === null || s.max === null) return 'no candidate value';
  if (s.n === 1) return 'one candidate — nothing to disagree with';
  const rel = s.relative === null ? '' : ` (${(s.relative * 100).toFixed(1)}% of the proposal${s.ambiguity_threshold === undefined ? '' : `; ambiguous above ${(Number(s.ambiguity_threshold) * 100).toFixed(1)}%`})`;
  return `${s.n} candidates from ${fmt(s.min)} to ${fmt(s.max)} — spread ${fmt(s.abs)}${rel}`;
}

/** One input's qualification verdict in words. */
export function qualificationLine(q: Qualification): string {
  const inp = q.input ?? {};
  const name = inp['kind'] === 'series' ? `series ${String(inp['series_key'])}` : `element ${String(inp['key'])}`;
  if (q.verdict === 'qualified') {
    const c = q.cadence ?? {};
    const last = c['last_point'] ?? c['valid_through'];
    return `${name}: QUALIFIED — health ${q.source_health?.state ?? 'n/a'}, ${last ? `latest ${String(last)}` : 'no date'}, unit ${String((q.unit_check ?? {})['verdict'] ?? 'n/a')}, truth ${String((q.truth_state ?? {})['verdict'] ?? 'n/a')}`;
  }
  return `${name}: DISQUALIFIED — ${(q.reasons ?? []).join('; ')}`;
}

/** The constraint check before publish, as recorded. */
export function constraintLine(c: Estimate['constraint_check'] | undefined, outcome: string): string {
  const pins = (c?.pins ?? []).map((p) => `${p.set_key} v${p.version}`).join(', ');
  if (outcome === 'satisfied') return c?.vacuous ? 'SATISFIED — no live constraint applies to this estimate (vacuous)' : `SATISFIED — ${pins || 'the applicable sets'}`;
  if (outcome === 'violated') return `VIOLATED — ${(c?.violations ?? []).map((v) => v.message ?? v.constraintKey ?? 'a constraint').join('; ')}`;
  return `INDETERMINATE — ${c?.reason ?? 'the check could not decide'}`;
}

/** Materiality and routing, as the server judged them. */
export function materialityLine(e: Pick<Estimate, 'materiality' | 'material' | 'ambiguous' | 'ambiguity_reasons' | 'routed'>): string {
  const m = e.materiality;
  const delta = m.delta_relative === null ? m.basis : `change ${(m.delta_relative * 100).toFixed(1)}% against the head (threshold ${(Number(m.threshold) * 100).toFixed(1)}%)`;
  const flags = [e.material ? 'MATERIAL' : 'not material', e.ambiguous ? `AMBIGUOUS (${e.ambiguity_reasons.join('; ')})` : null].filter((x) => x !== null).join(' · ');
  return `${flags} — ${delta}${e.routed ? ' · routed to the twin owner for review' : ''}`;
}

/** A request for new observations, in words. */
export function requestLine(r: Pick<ObservationRequest, 'input_ref' | 'reason_class' | 'via' | 'scheduler' | 'state' | 'requester_kind'>): string {
  const via = r.via === 'scheduler' ? `through the collection scheduler (${String((r.scheduler ?? {})['scheduler_id'] ?? '')}, every ${String((r.scheduler ?? {})['cadence_seconds'] ?? '?')} s)` : 'to the source\'s steward or the twin owner (an attention item)';
  return `${r.input_ref} is ${r.reason_class} — ${r.state.toUpperCase()}, requested by ${r.requester_kind === 'agent' ? 'the Reconciliation Agent' : 'a person'} ${via}`;
}

/** A ledger row in words. */
export function eventLine(e: { event: string; details: Row }): string {
  const d = e.details ?? {};
  switch (e.event) {
    case 'estimate.proposed': return `proposed ${fmt(d['value'])} ${String(d['unit'] ?? '')} by ${d['proposer_kind'] === 'agent' ? 'the Reconciliation Agent' : 'a person'} — constraint ${String(d['constraint'] ?? '')}`;
    case 'estimate.routed': return 'routed to the twin owner (twin.reconciliation)';
    case 'estimate.approved': return `approved — snapshot v${String(d['applied_version'] ?? '?')}`;
    case 'estimate.declined': return `declined — ${String(d['note'] ?? '')}`;
    case 'trigger.telemetry': return `trigger: a new observation of ${String(d['series_key'] ?? 'a series')}`;
    case 'trigger.internal_change': return `trigger: upstream twin v${String(d['version'] ?? '?')} admitted`;
    case 'trigger.ontology_revision': return `trigger: ontology v${String(d['ontology_version'] ?? '?')} activated`;
    case 'trigger.consumed': return `${((d['triggers'] ?? []) as unknown[]).length} trigger(s) answered by a proposal`;
    default: return e.event.replace('.', ' ');
  }
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twin-estimation`;
const READ = 'twin.estimation.read';
async function p<T>(s: Scope, path: string, action: string, payload: Row = {}, objectType = 'TWN', objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'twin',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const estimation = {
  overview: (s: Scope, twinId: string) => p<{ overview: Overview; receipt: Receipt }>(s, '/overview', READ, { twinId }, 'TWN', twinId),
  estimators: (s: Scope, twinId?: string) => p<{ estimators: Estimator[]; receipt: Receipt }>(s, '/estimators/list', READ, twinId ? { twinId } : {}),
  declareEstimator: (s: Scope, payload: Row) => p<{ estimator: Row; receipt: Receipt }>(s, '/estimators/declare', 'twin.estimator.declare', payload, 'TWN', String(payload['twinId'] ?? '')),
  retireEstimator: (s: Scope, estimatorId: string, reason: string) => p<{ estimator: Row; receipt: Receipt }>(s, `/estimators/${estimatorId}/retire`, 'twin.estimator.declare', { reason }, 'TWX', estimatorId),
  propose: (s: Scope, twinId: string, key: string) => p<{ estimate: Row; receipt: Receipt }>(s, '/estimates/propose', 'twin.estimate.propose', { twinId, key }, 'TWE'),
  list: (s: Scope, twinId?: string, state?: EstimateState) => p<{ estimates: Estimate[]; receipt: Receipt }>(s, '/estimates/list', READ, { ...(twinId ? { twinId } : {}), ...(state ? { state } : {}) }),
  read: (s: Scope, estimateId: string) => p<{ estimate: Estimate; receipt: Receipt }>(s, `/estimates/${estimateId}/read`, READ, {}, 'TWE', estimateId),
  decide: (s: Scope, estimateId: string, decision: 'approved' | 'declined', note: string | null, allowIncomplete = false) =>
    p<{ decision: Row; snapshot: Row | null; receipt: Receipt }>(s, `/estimates/${estimateId}/decide`, 'twin.estimate.decide', { decision, ...(note ? { note } : {}), allowIncomplete }, 'TWE', estimateId),
  requests: (s: Scope, twinId?: string) => p<{ requests: ObservationRequest[]; receipt: Receipt }>(s, '/requests/list', READ, twinId ? { twinId } : {}),
  request: (s: Scope, payload: Row) => p<{ request: Row; receipt: Receipt }>(s, '/requests/create', 'twin.observation.request', payload, 'TWQ'),
  cancelRequest: (s: Scope, requestId: string, reason: string) => p<{ request: Row; receipt: Receipt }>(s, `/requests/${requestId}/cancel`, 'twin.observation.request', { reason }, 'TWQ', requestId),
  ledger: (s: Scope, twinId?: string) => p<{ events: Array<{ event_id: string; event: string; key: string | null; actor_principal_id: string | null; details: Row; occurred_at: string }>; receipt: Receipt }>(s, '/ledger', READ, twinId ? { twinId } : {}),
};
