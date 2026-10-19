/**
 * B50 §CL — the correction-closure routes' client (apps/api/src/graph/closure/closure.controller.ts, inside api.graph): the reads under
 * graph.read; each act under its own governed action (graph.closure.*), human-gated by the PDP. The answers are rendered only from the
 * server's receipts; nothing here predicts one. Envelopes from lib/api.ts.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/graph/closure`;
function p<T>(s: Scope, path: string, action: string, objectType: string, objectId: string | null, payload: Row = {}, read = false): Promise<ApiResult<T>> {
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'graph', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const seg = (v: string) => encodeURIComponent(v);

export const closureApi = {
  /** Every case of the domain with its closure state (an applied case reads open until its record closes). */
  list: (s: Scope) => p<{ cases: Row[]; receipt: Receipt }>(s, '/cases/list', 'graph.read', 'COR', null, { limit: 200 }, true),
  /** One case whole; `check` runs the projection reconciliation inside the (audited) read. */
  read: (s: Scope, caseId: string, check: boolean) => p<{ closure: Row; receipt: Receipt }>(s, `/cases/${seg(caseId)}`, 'graph.read', 'COR', caseId, { check }, true),
  /** The applied cases with no closure record — listed, never adopted by this read. */
  adoptable: (s: Scope) => p<{ cases: Row[]; receipt: Receipt }>(s, '/adoptable', 'graph.read', 'COR', null, {}, true),
  contract: (s: Scope) => p<{ contract: Row; receipt: Receipt }>(s, '/contract', 'graph.read', 'CCT', null, {}, true),
  acknowledge: (s: Scope, caseId: string, a: { consumerRef: string; state: 'acknowledged' | 'recomputed'; note: string; recomputeRef: string | null; ackId: string }) =>
    p<{ acknowledgement: Row; receipt: Receipt }>(s, `/cases/${seg(caseId)}/acknowledge`, 'graph.closure.acknowledge', 'COR', caseId, a),
  except: (s: Scope, caseId: string, a: { consumerRef: string; reason: string; expiresAt: string; ownerPrincipalId: string; ackId: string }) =>
    p<{ exception: Row; receipt: Receipt }>(s, `/cases/${seg(caseId)}/except`, 'graph.closure.except', 'COR', caseId, a),
  freeze: (s: Scope, caseId: string, consumerRef: string, reason: string) =>
    p<{ freeze: Row; receipt: Receipt }>(s, `/cases/${seg(caseId)}/freeze`, 'graph.closure.freeze', 'COR', caseId, { consumerRef, reason }),
  lift: (s: Scope, freezeId: string, reason: string) => p<{ freeze: Row; receipt: Receipt }>(s, `/freezes/${seg(freezeId)}/lift`, 'graph.closure.freeze.lift', 'CFZ', freezeId, { reason }),
  close: (s: Scope, caseId: string, statement: string) => p<{ closure: Row; receipt: Receipt }>(s, `/cases/${seg(caseId)}/close`, 'graph.closure.close', 'COR', caseId, { statement }),
  adopt: (s: Scope, caseId: string, reason: string) => p<{ closure: Row; receipt: Receipt }>(s, `/cases/${seg(caseId)}/adopt`, 'graph.closure.adopt', 'COR', caseId, { reason }),
  sweep: (s: Scope) => p<{ sweep: Row; receipt: Receipt }>(s, '/sweep', 'graph.closure.sweep', 'COR', null),
};
