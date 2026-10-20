/**
 * B82 §PX — the trust routes' client (api.graph, 0121_b82_x_px): the reads under `graph.trust.read` (the envelope, the provenance strength,
 * the Trust and Governance overview) and the four human-gated acts (verify again, attest, withdraw an attestation, open an investigation).
 * Answers are rendered only from the server's receipts; nothing here predicts one. A retry reuses its request id (PAT-20).
 */
import { call } from './api';

type Row = Record<string, unknown>;
export type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };
export interface Subject { type: string; id: string; version: number }

const env = (s: Scope, action: string, objectType: string, objectId: string | null, read: boolean) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'graph',
  side_effect_class: read ? ('none' as const) : ('reversible' as const), consequence_class: read ? ('C1' as const) : ('C2' as const),
});
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/graph/trust`;

export const trustApi = {
  envelope: (s: Scope, x: Subject) => call<{ envelope: Row; receipt: Receipt }>(`${base(s)}/envelope`, env(s, 'graph.trust.read', x.type, x.id, true), x),
  strength: (s: Scope, x: Subject) => call<{ strength: Row; receipt: Receipt }>(`${base(s)}/strength`, env(s, 'graph.trust.read', x.type, x.id, true), x),
  overview: (s: Scope, a: { types?: string[]; limit?: number; days?: number } = {}) => call<{ overview: Row; receipt: Receipt }>(`${base(s)}/overview`, env(s, 'graph.trust.read', 'TRS', null, true), a),
  verify: (s: Scope, x: Subject, facet: string, requestId: string) =>
    call<{ verification: Row; receipt: Receipt }>(`${base(s)}/verify`, env(s, 'graph.trust.verify', x.type, x.id, false), { ...x, facet, requestId }),
  attest: (s: Scope, x: Subject, a: { facets: string[]; statement: string; envelopeDigest: string; requestId: string }) =>
    call<{ attestation: Row; receipt: Receipt }>(`${base(s)}/attest`, env(s, 'graph.trust.attest', x.type, x.id, false), { ...x, ...a }),
  withdraw: (s: Scope, attestationId: string, a: { reason: string; requestId: string }) =>
    call<{ attestation: Row; receipt: Receipt }>(`${base(s)}/attestations/${attestationId}/withdraw`, env(s, 'graph.trust.withdraw', 'TAT', attestationId, false), a),
  investigate: (s: Scope, x: Subject, a: { facet: string | null; note: string; itemId: string }) =>
    call<{ investigation: Row; receipt: Receipt }>(`${base(s)}/investigate`, env(s, 'graph.trust.investigate', x.type, x.id, false), { ...x, ...a }),
};
