/**
 * The Weak-Signal Workbench client — CP-6 B28 (0088 §S; F-P4-10: WS-08, UX-33-001..006, OBJ-17/-18, CAP-FW-01/-02).
 *
 * Every response is returned VERBATIM (the Prediction client's rule): a signal's maturity, its independence verdicts, a held detection's
 * reason and a withheld row's reason are rendered exactly as the server recorded them. Two rules of this workbench are the server's and
 * the screen only shows them: a NOMINATION (a detector, the Weak Signal Agent, an analyst) is never a DISPOSITION (a named human's, never
 * the nominator's), and the MATURITY moves only by corroboration — no control on this screen sets it.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type Maturity = 'tentative' | 'corroborated' | 'invalid';
export type Disposition = 'confirm' | 'monitor' | 'dismiss' | 'escalate';
export type Independence = 'independent' | 'dependent' | 'unknown';
export interface Condition { text: string; kind: 'observation' | 'indicator' | 'source' | 'deadline'; indicator_id?: string; by?: string }

export interface SignalRow {
  signal_id: string; version: number; title?: string; statement?: string; subject_kind?: string; subject_id?: string | null;
  nominator_kind?: 'detector' | 'analyst' | 'agent'; nominated_by?: string; detector_key?: string | null; detector_version?: string | null; as_of?: string | null;
  observation?: Record<string, unknown>; baseline?: Record<string, unknown>; novelty_basis?: Record<string, unknown>; novelty?: number | string | null; measure?: number | string | null;
  confidence?: number | string | null; maturity: Maturity; corroboration_threshold?: number; independent_sources?: number; contradicting_sources?: number;
  disposition?: Disposition | null; disposition_by?: string | null; disposition_at?: string | null; disposition_note?: string | null;
  strengthen_conditions?: Condition[]; falsify_conditions?: Condition[]; review_by?: string | null; classification: string; synthetic_state?: boolean;
  candidate_id?: string | null; created_at?: string; updated_at?: string;
  /** Present when the reader's clearance does not cover the signal: the reason, nothing of the content. */
  withheld?: string;
}
export interface EvidenceRow {
  evidence_id: string; object_type: string; object_id: string; object_version: number; source_id: string | null; source_key: string | null; publisher: string | null;
  data_origin: string | null; content_digest: string | null; synthetic: boolean; stance: 'supporting' | 'contradicting'; role: 'basis' | 'corroboration';
  independence: Independence; independence_reasons: string[]; added_by: string; added_at: string; added_in_version: number;
}
export interface SignalDetail extends SignalRow {
  evidence?: EvidenceRow[]; events?: Array<{ event: string; signal_version: number; actor_principal_id: string; details: Record<string, unknown>; occurred_at: string }>;
  candidate?: { candidate_id: string; state: string; warning_id: string | null; origin_key: string; submitted_at: string } | null;
  detection?: Record<string, unknown> | null;
  independence?: { rule: string; counted_supporting: number; counted_contradicting: number; threshold: number; unknown: number; dependent: number };
}
export interface DetectionRow {
  detection_id: string; detector_key: string; detector_version: string; subject_kind: string; subject_id: string; as_of: string; measure: number | string | null;
  fired: boolean; held_reason: string | null; held_detail: string | null; trigger: 'agent' | 'operator'; run_id: string | null; recorded_at: string;
}
export interface Ranking { ranking_id: string; ranker_kind: 'agent' | 'analyst'; ranked_by: string; ranked_at: string; rule: string;
  ordering: Array<{ position: number; signal_id: string; title?: string; explanation?: string; withheld?: string }> }
export interface Queue { signals: SignalRow[]; ranking: Ranking | null; detections: DetectionRow[]; held: DetectionRow[];
  counts: { total: number; by_maturity: Record<string, number>; by_disposition: Record<string, number>; by_nominator: Record<string, number> } }
export interface DetectorRow { detector_key: string; detector_version: string; model_class: string; input_kind: string; status: 'available' | 'absent'; absent_reason: string | null;
  method: string; params: Record<string, unknown>; code_digest: string | null; current_digest: string | null; code_state: string }
export interface ControlRow { fixture: string; data_provenance: 'synthetic'; description: string; detector: string; expected: string; got: string; passed: boolean; measure: unknown; held_detail: string | null }
export interface IndicatorGovernanceRow {
  indicator_id: string; series_key?: string; description?: string; state: string; classification: string; expires_at?: string | null; review_every_days?: number;
  next_review_at?: string | null; lineage?: Record<string, unknown>; retired_at?: string | null; retire_reason?: string | null; expired?: boolean; review_overdue?: boolean;
  governance_state?: string; events?: Array<{ event: string; occurred_at: string; details: Record<string, unknown> }>; withheld?: string;
}

/* ───────────── what the screen says, in words (glyph + text, never colour alone) ───────────── */
export const MATURITY_LABEL: Record<Maturity, string> = {
  tentative: '○ tentative — not yet corroborated by independent sources',
  corroborated: '● corroborated — independent sources reached the threshold',
  invalid: '✕ invalid — independent contradicting sources outnumber the supporting',
};
export const INDEPENDENCE_LABEL: Record<Independence, string> = {
  independent: '● independent — counted',
  dependent: '◐ dependent — shares a source, publisher, digest or upstream; not counted',
  unknown: '? unknown — not verifiable from the records (synthetic, or no source); never counted',
};
export const DISPOSITION_LABEL: Record<Disposition, string> = {
  confirm: 'confirmed by', monitor: 'monitored by', dismiss: 'dismissed by', escalate: 'escalated by',
};
/** The nominator in words: who nominated is never who disposes. */
export function nominatorLabel(kind: string | undefined): string {
  return kind === 'agent' ? 'the Weak Signal Agent (nominates and ranks only)' : kind === 'detector' ? 'a detector run by a person' : kind === 'analyst' ? 'an analyst' : 'unknown';
}
/** The corroboration line: counted supporting of the threshold, contradicting, and what was not counted. */
export function corroborationLine(s: Pick<SignalRow, 'independent_sources' | 'contradicting_sources' | 'corroboration_threshold'>, uncounted = 0): string {
  const t = s.corroboration_threshold ?? 2;
  return `${s.independent_sources ?? 0} of ${t} independent supporting source(s) · ${s.contradicting_sources ?? 0} independent contradicting${uncounted > 0 ? ` · ${uncounted} not counted` : ''}`;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const signals = {
  queue: (s: Scope) => p<Queue & { receipt: Receipt }>(s, '/signals/list', 'prediction.read', 'SIG'),
  get: (s: Scope, id: string) => p<{ signal: SignalDetail; receipt: Receipt }>(s, `/signals/${id}/get`, 'prediction.read', 'SIG', {}, id),
  /** The detectors on a person's demand, as of an OBSERVATION day (event time); omitted → each subject's latest. */
  scan: (s: Scope, asOf?: string) => p<{ scan: Record<string, unknown>; receipt: Receipt }>(s, '/signals/scan', 'prediction.signal.nominate', 'SIG', asOf ? { asOf } : {}),
  nominate: (s: Scope, payload: { title: string; statement: string; evidence: Array<{ object_id: string; version?: number; stance?: string }>; observation: Record<string, unknown>;
                                   baseline: Record<string, unknown>; noveltyBasis: { basis: string }; confidence?: number; subjectKind?: string; subjectId?: string }) =>
    p<{ signal: Record<string, unknown>; receipt: Receipt }>(s, '/signals/nominate', 'prediction.signal.nominate', 'SIG', payload),
  rank: (s: Scope) => p<{ ranking: Ranking; receipt: Receipt }>(s, '/signals/rank', 'prediction.signal.rank', 'SIG'),
  addEvidence: (s: Scope, id: string, payload: { objectId: string; objectVersion?: number; stance: 'supporting' | 'contradicting'; expectedVersion: number }) =>
    p<{ corroboration: Record<string, unknown>; receipt: Receipt }>(s, `/signals/${id}/evidence`, 'prediction.signal.evidence.add', 'SIG', payload, id),
  testIndependence: (s: Scope, id: string) =>
    p<{ independence: { pairs: Array<{ a: string; b: string; verdict: Independence; reasons: string[] }>; summary: Record<string, number>; rule: string }; receipt: Receipt }>(
      s, `/signals/${id}/independence`, 'prediction.signal.independence.test', 'SIG', {}, id),
  dispose: (s: Scope, id: string, payload: { disposition: 'confirm' | 'monitor' | 'dismiss'; note: string; falsify?: Condition[]; reviewBy?: string; expectedVersion: number }) =>
    p<{ signal: SignalRow & { repeated: boolean }; receipt: Receipt }>(s, `/signals/${id}/disposition`, 'prediction.signal.dispose', 'SIG', payload, id),
  setConditions: (s: Scope, id: string, payload: { strengthen?: Condition[]; falsify?: Condition[]; expectedVersion: number }) =>
    p<{ signal: SignalRow; receipt: Receipt }>(s, `/signals/${id}/conditions`, 'prediction.signal.conditions.set', 'SIG', payload, id),
  /** Submits a warning CANDIDATE (the intake); the early-warning lifecycle clusters or raises it — this screen raises no warning. */
  escalate: (s: Scope, id: string, payload: { note: string; consequence: 'C1' | 'C2' | 'C3' | 'C4'; windowHours?: number; expectedVersion: number }) =>
    p<{ escalation: SignalRow & { candidate: Record<string, unknown>; repeated: boolean }; receipt: Receipt }>(s, `/signals/${id}/escalate`, 'prediction.signal.escalate', 'SIG', payload, id),
  detectors: (s: Scope) => p<{ detectors: DetectorRow[]; absent: Array<{ detector: string; reason: string }>; controls: ControlRow[]; model_class: string; receipt: Receipt }>(s, '/detectors/list', 'prediction.read', 'DET'),
  indicators: (s: Scope) => p<{ indicators: IndicatorGovernanceRow[]; as_of: string | null; receipt: Receipt }>(s, '/indicators/governance/list', 'prediction.read', 'IND'),
  govern: (s: Scope, id: string, payload: { classification?: string; expiresAt?: string; reviewEveryDays?: number; lineageNote?: string }) =>
    p<{ indicator: Record<string, unknown>; receipt: Receipt }>(s, `/indicators/${id}/govern`, 'prediction.indicator.govern', 'IND', payload, id),
  retire: (s: Scope, id: string, reason: string) => p<{ indicator: Record<string, unknown>; receipt: Receipt }>(s, `/indicators/${id}/retire`, 'prediction.indicator.retire', 'IND', { reason }, id),
  renew: (s: Scope, id: string, expiresAt: string, reason: string) => p<{ indicator: Record<string, unknown>; receipt: Receipt }>(s, `/indicators/${id}/renew`, 'prediction.indicator.renew', 'IND', { expiresAt, reason }, id),
};
