/**
 * CP-6 B40 §VA — the routes' client (0123_b40_x_va): the key register and its two acts, one evidence object's authenticity and attributes,
 * the attribute override, the inherited obligations, the transformation-rule register and its acts, and the per-tenant retention register
 * (TENANT). Answers are rendered only from the server's receipts; nothing here predicts one. The acts carry what the person REVIEWED: a key's
 * retirement its fingerprint, a rule's decision and retirement its digest — the ports bind them (stale otherwise).
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

export const authenticityApi = {
  keys: (s: Scope, sourceId: string | null) =>
    call<{ keys: Row; receipt: Receipt }>(`${base(s)}/authenticity/keys/read`, env(s, 'observation.authenticity.read', sourceId === null ? 'PBK' : 'SRC', sourceId, true), { sourceId }),
  declareKey: (s: Scope, a: { sourceId: string; keyRef: string; kind: string; publicKeyPem: string | null; pin: string | null; validFrom: string | null; validTo: string | null; rotatedFrom: string | null; reason: string; requestId: string }) =>
    call<{ key: Row; receipt: Receipt }>(`${base(s)}/authenticity/keys/declare`, env(s, 'observation.authenticity.key.declare', 'SRC', a.sourceId, false), a),
  retireKey: (s: Scope, keyId: string, a: { fingerprint: string; reason: string }) =>
    call<{ key: Row; receipt: Receipt }>(`${base(s)}/authenticity/keys/${keyId}/retire`, env(s, 'observation.authenticity.key.retire', 'PBK', keyId, false), a),
  evidence: (s: Scope, evdId: string) =>
    call<{ authenticity: Row; receipt: Receipt }>(`${base(s)}/authenticity/evidence/${evdId}/read`, env(s, 'observation.authenticity.read', 'EVD', evdId, true), {}),
  setAttribute: (s: Scope, evdId: string, a: { version: number; attribute: string; value: unknown; reason: string; requestId: string }) =>
    call<{ attribute: Row; receipt: Receipt }>(`${base(s)}/evidence/${evdId}/attributes/set`, env(s, 'observation.evidence.attribute.set', 'EVD', evdId, false), a),
  obligations: (s: Scope, a: { type: string; id: string; version: number }) =>
    call<{ obligations: Row; receipt: Receipt }>(`${base(s)}/obligations/read`, env(s, 'objects.obligations.read', a.type, a.id, true), a),
  rules: (s: Scope) =>
    call<{ rules: Row; receipt: Receipt }>(`${base(s)}/transformation-rules/read`, env(s, 'objects.obligations.read', 'TRR', null, true), {}),
  proposeRule: (s: Scope, a: { obligation: string; transformation: string; from: string; to: string; objectTypes: string[]; rationale: string; requestId: string }) =>
    call<{ rule: Row; receipt: Receipt }>(`${base(s)}/transformation-rules/propose`, env(s, 'objects.transformation_rule.propose', 'TRR', null, false), a),
  decideRule: (s: Scope, ruleId: string, a: { digest: string; decision: 'approve' | 'reject'; reason: string }) =>
    call<{ rule: Row; receipt: Receipt }>(`${base(s)}/transformation-rules/${ruleId}/decide`, env(s, 'objects.transformation_rule.decide', 'TRR', ruleId, false), a),
  retireRule: (s: Scope, ruleId: string, a: { digest: string; reason: string }) =>
    call<{ rule: Row; receipt: Receipt }>(`${base(s)}/transformation-rules/${ruleId}/retire`, env(s, 'objects.transformation_rule.retire', 'TRR', ruleId, false), a),
  /** TENANT: the per-tenant retention register (an auditor, the tenant administrator, the retention authority — a TENANT binding). */
  retentionRegister: (tenantId: string) =>
    call<{ register: Row; receipt: Receipt }>(`/v1/tenants/${tenantId}/observation/retention-register/read`,
      { scope: 'TENANT' as const, tenant_id: tenantId, domain_id: null, action: 'retention.register.read', object_type: 'RET', object_id: null, purpose_id: 'observation',
        side_effect_class: 'none' as const, consequence_class: 'C1' as const }, {}),
};
