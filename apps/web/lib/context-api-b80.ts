/**
 * B80 §CB — the operating context bar's API client (0118 §CB routes): the bar's read and the impact preview under executive.context.read
 * (consequential reads, audited), the deliberate commit under executive.context.set (a governed write, human-gated). Envelopes from
 * lib/api.ts; the answers rendered only from the server's receipts.
 */
import { call, type ApiResult } from './api';
import type { BarRead, ImpactRead, ProposedContext } from './context-b80';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
type Receipt = { policyDecisionId: string; auditSeq: number };

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/context`;
function p<T>(s: Scope, path: string, action: string, payload: Row = {}): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'CTX', object_id: null,
    purpose_id: 'shell.context', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const contextApi = {
  read: (s: Scope) => p<{ bar: BarRead; receipt: Receipt }>(s, '/read', 'executive.context.read'),
  impact: (s: Scope, proposed: ProposedContext) => p<{ impact: ImpactRead; receipt: Receipt }>(s, '/impact', 'executive.context.read', { ...proposed }),
  commit: (s: Scope, payload: Row) => p<{ context: Row & { context_id: string; digest: string; version: number }; receipt: Receipt }>(s, '/commit', 'executive.context.set', payload),
};
