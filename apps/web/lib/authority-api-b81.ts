/**
 * B81 §HA — the two decision routes the authority patterns needed a client for (the decisions page carried no propose or withdraw control):
 * the PROPOSAL (PAT-04: submit for review — freezes the version and its digest; it approves nothing) and the WITHDRAWAL (PAT-11: the
 * package withdrawn with its reason — nothing erased). Both are the existing governed routes (decision.controller.ts propose :171,
 * withdraw :217), human-gated by the PDP; the answers rendered only from the server's receipts. Envelopes from lib/api.ts.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
type Receipt = { policyDecisionId: string; auditSeq: number };

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
function p<T>(s: Scope, path: string, action: string, objectId: string, payload: Row = {}): Promise<ApiResult<T>> {
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'DPK', object_id: objectId,
    purpose_id: 'decision', side_effect_class: 'reversible', consequence_class: 'C2',
  }, payload);
}

export const authorityApi = {
  /** PAT-04: the version proposed — the server binds its version digest and opens the approvers' gate task. */
  propose: (s: Scope, pkg: string, version: number) =>
    p<{ proposal: Row & { versionDigest?: string }; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${version}/propose`, 'decision.package.propose', pkg),
  /** PAT-11: the package withdrawn with its reason (the server supersedes its open versions and cancels their gate tasks). */
  withdraw: (s: Scope, pkg: string, reason: string) =>
    p<{ package: Row; receipt: Receipt }>(s, `/decisions/${pkg}/withdraw`, 'decision.package.withdraw', pkg, { reason }),
};
