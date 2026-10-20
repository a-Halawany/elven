/**
 * B50 §TL — the timeline routes' client (apps/api/src/graph/timeline/timeline.controller.ts, inside api.graph): the reads under
 * graph.timeline.read (the timeline and as-of explorer, the trace, the governed scopes); the reconciliation under graph.timeline.reconcile,
 * human-gated by the PDP and re-checked by the port. The answers are rendered only from the server's receipts; nothing here predicts one.
 * Envelopes from lib/api.ts.
 */
import { call, type ApiResult } from './api';
import type { TimelineAsk, TimelineView, TraceView } from './timeline-b50';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/graph/timeline`;
function p<T>(s: Scope, path: string, action: string, objectType: string, objectId: string | null, payload: Row = {}, read = false): Promise<ApiResult<T>> {
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'graph', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const timelineApi = {
  read: (s: Scope, a: TimelineAsk, limit = 200) =>
    p<{ timeline: TimelineView; receipt: Receipt }>(s, '/read', 'graph.timeline.read', a.subjectType ?? 'TLN', a.subjectId,
      { subjectType: a.subjectType, subjectId: a.subjectId, scopeKey: a.scopeKey, axis: a.axis, from: a.from, to: a.to, asOf: a.asOf, limit }, true),
  trace: (s: Scope, type: string, id: string, version: number) =>
    p<{ trace: TraceView; receipt: Receipt }>(s, '/trace', 'graph.timeline.read', type, id, { type, id, version }, true),
  scopes: (s: Scope) =>
    p<{ scopes: Array<Row & { scope_key: string; title: string; version: number; entities: number; objectives: number }>; receipt: Receipt }>(s, '/scopes', 'graph.timeline.read', 'ASC', null, {}, true),
  reconcile: (s: Scope, type: string, id: string, version: number, note: string, itemId: string) =>
    p<{ reconciliation: Row & { item_id: string; repeated: boolean; state: string; owner: string | null; problems: Row[] }; receipt: Receipt }>(s, '/trace/reconcile', 'graph.timeline.reconcile', type, id,
      { type, id, version, note, itemId }),
};
