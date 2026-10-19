/**
 * B50 §CI — the calls of the /graph/impact page's new sections (the triggers, the classed products), on the graph's base path. Each read is
 * `graph.read`; a trigger is its kind's own action (`graph.impact.trigger.<kind>`, human-gated) and the close of a challenge is
 * `graph.impact.trigger.close`. The server decides everything; its refusal is returned as it says it.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;

async function g<T>(scope: Scope, path: string, action: string, objectType: string, payload: unknown = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  return call<T>(`/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/graph${path}`, {
    scope: 'DOMAIN', tenant_id: scope.tenantId, domain_id: scope.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'graph', side_effect_class: action === 'graph.read' ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export interface TriggerWalkAnswer { triggerId: string; state: 'walked' | 'failed' | 'skipped'; invalidationId: string | null; reason: string | null; agent: Row | null }

export const impactB50 = {
  /** The classed products of one assessed walk, or of a correction case (the latest walk of each root). */
  affected: (s: Scope, ref: { invalidationId: string } | { caseId: string }) =>
    g<{ products: Row[]; classes: Record<string, number>; ruleVersion: string | null; receipt: Receipt }>(s, '/impact/affected', 'graph.read', 'invalidationId' in ref ? 'INV' : 'COR', ref,
      'invalidationId' in ref ? ref.invalidationId : ref.caseId),
  /** The versioned classification rule(s). */
  classes: (s: Scope) => g<{ rules: Row[]; receipt: Receipt }>(s, '/impact/classes', 'graph.read', 'INV'),
  /** The domain's triggers with their walk state. */
  triggers: (s: Scope) => g<{ triggers: Row[]; receipt: Receipt }>(s, '/impact/triggers/list', 'graph.read', 'ITR', { limit: 100 }),
  /** The steward's trigger; the answer carries the agent's walk (walked, or failed with the server's reason). */
  record: (s: Scope, kind: string, payload: { objectType: string; objectId: string; reason: string; basis: Record<string, string> }) =>
    g<{ trigger: Row; walk: TriggerWalkAnswer; receipt: Receipt }>(s, `/impact/triggers/${encodeURIComponent(kind)}/record`, `graph.impact.trigger.${kind}`, 'ITR', payload),
  /** The deciding person closes a human challenge (never its opener — the server's rule). */
  close: (s: Scope, triggerId: string, reason: string) =>
    g<{ closed: Row; receipt: Receipt }>(s, `/impact/triggers/${encodeURIComponent(triggerId)}/close`, 'graph.impact.trigger.close', 'ITR', { reason }, triggerId),
};
