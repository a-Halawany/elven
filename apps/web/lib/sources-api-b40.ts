/**
 * CP-6 B40 §RG — the source registry routes' client (api.observation, RegistryB40Controller). Each call is one governed route under its own
 * EXACT action; answers are rendered only from the server's receipts — nothing here predicts one. A request id is minted per review (the same
 * request replays its recorded act, never a second one).
 */
import { call } from './api';

type Row = Record<string, unknown>;
export type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };

const env = (s: Scope, action: string, objectId: string | null, read: boolean, purpose = 'observation') => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'SRC', object_id: objectId, purpose_id: purpose,
  side_effect_class: read ? ('none' as const) : ('reversible' as const), consequence_class: read ? ('C1' as const) : ('C2' as const),
});
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/observation/registry`;

export const registryApi = {
  candidates: (s: Scope) => call<{ candidates: Row[]; asOf: string | null; receipt: Receipt }>(`${base(s)}/candidates/read`, env(s, 'observation.registry.read', null, true), {}),
  propose: (s: Scope, p: Row & { requestId: string }) => call<{ candidate: Row; receipt: Receipt }>(`${base(s)}/candidates/propose`, env(s, 'observation.source.discover', null, false), p),
  decline: (s: Scope, candidateId: string, reason: string) => call<{ candidate: Row; receipt: Receipt }>(`${base(s)}/candidates/${candidateId}/decline`, env(s, 'observation.source.discover', candidateId, false), { reason }),
  draft: (s: Scope, candidateId: string, kind: string) => call<{ draft: { candidateId: string; state: string; kind: string; contract: Row; missing: string[] }; receipt: Receipt }>(`${base(s)}/candidates/${candidateId}/draft`, env(s, 'observation.registry.read', candidateId, true), { kind }),
  promote: (s: Scope, candidateId: string, contract: Row) => call<{ source: { sourceId: string; contractVersion: number }; candidate: Row; receipt: Receipt }>(`${base(s)}/candidates/${candidateId}/promote`, env(s, 'observation.source.register', candidateId, false), { contract }),
  record: (s: Scope, sourceId: string) => call<{ registry: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/read`, env(s, 'observation.registry.read', sourceId, true), {}),
  evaluate: (s: Scope, sourceId: string, p: Row & { requestId: string }) => call<{ evaluation: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/evaluate`, env(s, 'observation.source.evaluate', sourceId, false), p),
  rights: (s: Scope, sourceId: string, p: Row & { requestId: string }) => call<{ change: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/rights`, env(s, 'observation.source.change_rights', sourceId, false), p),
  impact: (s: Scope, sourceId: string) => call<{ impact: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/impact`, env(s, 'observation.rights.impact.read', sourceId, true, 'decision'), {}),
  preview: (s: Scope, sourceId: string, change: Row) => call<{ preview: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/preview`, env(s, 'observation.source.change_impact.read', sourceId, true), { change }),
  customerApproval: (s: Scope, sourceId: string, p: Row & { requestId: string }) => call<{ approval: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/customer-approval`, env(s, 'observation.source.customer_approve', sourceId, false), p),
  stewardship: (s: Scope, sourceId: string, p: Row & { requestId: string }) => call<{ stewardship: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/stewardship`, env(s, 'observation.source.stewardship', sourceId, false), p),
  openIncident: (s: Scope, sourceId: string, p: Row & { requestId: string }) => call<{ incident: Row; receipt: Receipt }>(`${base(s)}/sources/${sourceId}/incidents/open`, env(s, 'observation.source.incident', sourceId, false), p),
  resolveIncident: (s: Scope, incidentId: string, resolution: string) => call<{ incident: Row; receipt: Receipt }>(`${base(s)}/incidents/${incidentId}/resolve`, env(s, 'observation.source.incident', incidentId, false), { resolution }),
};
