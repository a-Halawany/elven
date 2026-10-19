/**
 * B82 §GM — the geographic-reference routes' client (apps/api/src/graph/geo/geo.controller.ts, inside api.graph): the layer under
 * graph.geo.read (audited); a declaration, a revision and a retirement each under its own governed action (graph.geo.declare /
 * graph.geo.retire — a named data steward, human-gated by the PDP and re-checked by the port). The answers are rendered only from the
 * server's receipts; nothing here predicts one, and a refusal is shown in the server's words. Envelopes from lib/api.ts.
 */
import { call, type ApiResult } from './api';
import type { GeoGeometry } from './b82-seams';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
export type Receipt = { policyDecisionId: string; auditSeq: number };
export interface GeoLayerRead { crs: 'EPSG:4326'; references: Row[]; history: Row[] | null; bounds: [number, number, number, number] | null; counts: { returned: number; active: number; retired: number }; rule_version: string; as_of: string; statement: string }
export interface GeoDeclareIntake {
  requestId: string; expectedVersion: number; key: string; label: string; kind: 'chokepoint' | 'port' | 'site' | 'route' | 'area'; geometry: GeoGeometry; crs: 'EPSG:4326';
  uncertaintyM: number; sourceStatement: string; licenceStatement: string; linked: { type: string; id: string } | null; chokepointKey: string | null; reason: string;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/graph/geo`;
function p<T>(s: Scope, path: string, action: string, objectId: string | null, payload: Row, read = false): Promise<ApiResult<T>> {
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'GEO', object_id: objectId,
    purpose_id: 'graph', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const seg = (v: string) => encodeURIComponent(v);

export const geoApi = {
  /** The layer: the current references (kinds / keys narrow it), one reference's history, the retired ones on request. */
  layer: (s: Scope, q: { keys?: string[]; kinds?: string[]; referenceId?: string; includeRetired?: boolean } = {}) =>
    p<{ layer: GeoLayerRead; receipt: Receipt }>(s, '/layer', 'graph.geo.read', q.referenceId ?? null, q as Row, true),
  declare: (s: Scope, a: GeoDeclareIntake) => p<{ reference: Row; receipt: Receipt }>(s, '/references', 'graph.geo.declare', null, a as unknown as Row),
  revise: (s: Scope, referenceId: string, a: GeoDeclareIntake) => p<{ reference: Row; receipt: Receipt }>(s, `/references/${seg(referenceId)}/revise`, 'graph.geo.declare', referenceId, a as unknown as Row),
  retire: (s: Scope, referenceId: string, a: { requestId: string; expectedVersion: number; reason: string }) =>
    p<{ reference: Row; receipt: Receipt }>(s, `/references/${seg(referenceId)}/retire`, 'graph.geo.retire', referenceId, a),
};
