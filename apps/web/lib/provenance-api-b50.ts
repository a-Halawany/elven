/**
 * B50 §PV — the provenance routes' client (apps/api/src/graph/provenance/provenance.controller.ts, inside api.graph): the reads under
 * graph.provenance.read; the acts (the fitness mark, the challenge acts) each under its own governed action, human-gated by the PDP. The
 * answers are rendered only from the server's receipts; nothing here predicts one. Envelopes from lib/api.ts.
 */
import { call, type ApiResult } from './api';
import type { Challenge, ExplainView, FitnessView } from './provenance-b50';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/graph/provenance`;
function p<T>(s: Scope, path: string, action: string, objectType: string, objectId: string | null, payload: Row = {}, read = false): Promise<ApiResult<T>> {
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'graph', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const provenanceApi = {
  explain: (s: Scope, type: string, id: string, version: number) =>
    p<{ explain: ExplainView; receipt: Receipt }>(s, '/explain', 'graph.provenance.read', type, id, { type, id, version }, true),
  diff: (s: Scope, type: string, id: string, from: number, to: number) =>
    p<{ diff: Row & { from: Row & { record: Row }; to: Row & { record: Row }; header: Row[]; payload: Row[]; chain: Row[]; impact: Row }; receipt: Receipt }>(s, '/diff', 'graph.provenance.read', type, id, { type, id, from, to }, true),
  fitness: (s: Scope, type: string, id: string, version: number) =>
    p<{ fitness: FitnessView; receipt: Receipt }>(s, '/fitness', 'graph.provenance.read', type, id, { type, id, version }, true),
  mark: (s: Scope, type: string, id: string, version: number, route: string | null, note: string, markId: string) =>
    p<{ mark: Row; receipt: Receipt }>(s, '/fitness/mark', 'graph.provenance.fitness.mark', type, id, { type, id, version, route, note, markId }),
  alignment: (s: Scope, kind: 'briefing' | 'publication' | 'export', id: string, version: number | null) =>
    p<{ alignment: Row & { verdict: string; summary: Record<string, number>; citations: Row[] }; receipt: Receipt }>(s, '/alignment', 'graph.provenance.read', kind === 'briefing' ? 'BRF' : kind === 'publication' ? 'PUB' : 'RTA', id, { kind, id, version }, true),
  challenges: (s: Scope, subjectId: string | null, state: string | null) =>
    p<{ challenges: { challenges: Array<Challenge & Row>; appeals: Row[] | null; routes: Row; as_of: string }; receipt: Receipt }>(s, '/challenges/list', 'graph.provenance.read', 'KCH', subjectId, { subjectId, state }, true),
  open: (s: Scope, a: { type: string; id: string; version: number; grounds: string; disputed: string[]; requestId: string }) =>
    p<{ challenge: Challenge & Row; receipt: Receipt }>(s, '/challenges', 'graph.provenance.challenge.open', 'KCH', null, a),
  review: (s: Scope, id: string) => p<{ challenge: Challenge & Row; receipt: Receipt }>(s, `/challenges/${id}/review`, 'graph.provenance.challenge.review', 'KCH', id),
  evidence: (s: Scope, id: string, ref: string, digest: string, note: string) =>
    p<{ challenge: Challenge & Row; receipt: Receipt }>(s, `/challenges/${id}/evidence`, 'graph.provenance.challenge.evidence', 'KCH', id, { ref, digest, note }),
  decide: (s: Scope, id: string, decision: 'upheld' | 'dismissed', note: string) =>
    p<{ challenge: Challenge & Row; receipt: Receipt }>(s, `/challenges/${id}/decide`, 'graph.provenance.challenge.decide', 'KCH', id, { decision, note }),
  withdraw: (s: Scope, id: string, reason: string) => p<{ challenge: Challenge & Row; receipt: Receipt }>(s, `/challenges/${id}/withdraw`, 'graph.provenance.challenge.withdraw', 'KCH', id, { reason }),
  escalate: (s: Scope, id: string) => p<{ challenge: Challenge & Row; receipt: Receipt }>(s, `/challenges/${id}/escalate`, 'graph.provenance.challenge.escalate', 'KCH', id),
};
