/**
 * CP-6 B40 §CR — the connectors' routes, as a client (api.observation; ConnectorCellController): the two reads and the five human-gated acts.
 * Answers are rendered only from the server's receipts; nothing here predicts one (a refusal is returned in the server's words).
 */
import { call } from './api';

type Row = Record<string, unknown>;
export type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };
const env = (s: Scope, action: string, objectType: string, objectId: string | null, read: boolean) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'observation',
  side_effect_class: read ? ('none' as const) : ('reversible' as const), consequence_class: read ? ('C1' as const) : ('C2' as const),
});
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/observation`;

export const connectorsApi = {
  register: (s: Scope) => call<{ connectors: Row; receipt: Receipt }>(`${base(s)}/connectors/read`, env(s, 'observation.connectors.read', 'ADP', null, true), {}),
  receipts: (s: Scope, a: { sourceId?: string | null; runId?: string | null; limit?: number }) =>
    call<{ egress: Row; receipt: Receipt }>(`${base(s)}/egress/read`, env(s, 'observation.egress.read', 'EGR', a.runId ?? a.sourceId ?? null, true),
      { ...(a.sourceId ? { sourceId: a.sourceId } : {}), ...(a.runId ? { runId: a.runId } : {}), ...(a.limit ? { limit: a.limit } : {}) }),
  registerPackage: (s: Scope, a: { files: Array<{ file: string; base64: string }>; requestId: string }) =>
    call<{ package: Row; receipt: Receipt }>(`${base(s)}/adapters/register`, env(s, 'observation.adapter.register', 'ADP', null, false), a),
  decidePackage: (s: Scope, packageId: string, a: { decision: 'approve' | 'reject'; reason: string; expectedDigest: string; requestId: string }) =>
    call<{ package: Row; receipt: Receipt }>(`${base(s)}/adapters/${packageId}/decide`, env(s, 'observation.adapter.approve', 'ADP', packageId, false), a),
  submitRequalification: (s: Scope, id: string, a: { packageId: string | null; reason: string; requestId: string }) =>
    call<{ requalification: Row; contractTests: Row; receipt: Receipt }>(`${base(s)}/requalifications/${id}/submit`, env(s, 'observation.connector.requalification.submit', 'RQL', id, false), a),
  decideRequalification: (s: Scope, id: string, a: { decision: 'approve' | 'reject'; reason: string; expectedDigest: string; requestId: string }) =>
    call<{ requalification: Row; receipt: Receipt }>(`${base(s)}/requalifications/${id}/decide`, env(s, 'observation.connector.requalification.approve', 'RQL', id, false), a),
  rotateCredential: (s: Scope, sourceId: string, a: { contractVersion: number; ref: string; header: string; reason: string; requestId: string }) =>
    call<{ rotation: Row; receipt: Receipt }>(`${base(s)}/connectors/${sourceId}/credential/rotate`, env(s, 'observation.connector.credential.rotate', 'SRC', sourceId, false), a),
};
