/**
 * CP-6 B40 §AP — the acquisition policy read's client (api.observation, observation.acquisition.read — exact, metadata only). The answer is
 * the server's with its receipt; nothing here predicts one. CONSTRUCTION only.
 */
import { call } from './api';

type Row = Record<string, unknown>;
export type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };

export const acquisitionApi = {
  read: (s: Scope, sourceId: string) =>
    call<{ acquisition: Row; receipt: Receipt }>(`/v1/tenants/${s.tenantId}/domains/${s.domainId}/observation/acquisition/${sourceId}/read`, {
      scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action: 'observation.acquisition.read', object_type: 'SRC', object_id: sourceId,
      purpose_id: 'observation', side_effect_class: 'none', consequence_class: 'C1',
    }, {}),
};
