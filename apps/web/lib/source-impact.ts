/**
 * CP-6 B24 client — SOURCE-IMPACT MARKERS (migration 0086 §markers; F-P6-07, V03-T-077 "no UI shows markers").
 *
 * When a source a product rests on is degraded, failed, suspended or of unknown health, the server MARKS the products derived
 * from it — the issued forecasts of its series, the open warnings on them, the scenarios declared on them, the runs bound to
 * those scenarios, and the decision packages whose current version cites one of those forecasts or runs — and clears the marks
 * when the source recovers. Two uses are CONSTRAINED by the server, never here:
 *
 *   * a package version is not COMMITTED while an active marker bearing on it (on the package, or on what that version cites)
 *     has not been acknowledged FOR THAT VERSION by a decision authority — a new version needs its own acknowledgement;
 *   * a scenario run is not OPENED on a failed or suspended source; on a degraded or unknown one it is admitted with the
 *     source impact declared on the run.
 *
 * The acknowledgement is the DECISION AUTHORITY's act (the role that commits; the server decides and refuses in its own words):
 * it names the markers and says why the decision may rest on the degraded source. Nothing here computes a marker, a bearing or a
 * gate: the helpers only word what the server recorded.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

/** The health states a marker carries (observation.source_impact_markers.health_state), worst first. */
export const IMPACT_STATES = ['failed', 'suspended', 'degraded', 'unknown'] as const;
/** The products a marker sits on (the CHECK 0086 re-declares). */
export const IMPACT_SUBJECT_KINDS = ['forecast', 'warning', 'scenario', 'run', 'package'] as const;
/** The role the server admits to acknowledge (the exact PDP rule `decision.source_impact.acknowledge`; the port re-checks it). */
export const ACKNOWLEDGER_ROLE = 'decision_authority';

/** One marker as the list serves it: the product it sits on, named by the server. */
export interface MarkerView {
  marker_id: string; source_id: string; subject_kind: string; subject_id: string; subject_title: string; health_state: string; reason: string | null;
  state: 'active' | 'cleared' | string; set_at: string | null; set_by_event: string; cleared_at: string | null; cleared_state: string | null;
}
/** A source and its markers; `worst_state` is the worst among its ACTIVE markers (`cleared` when none is). */
export interface SourceGroup { source_id: string; source_name: string | null; source_key: string | null; worst_state: string; markers: MarkerView[]; counts: Record<string, number> }
/** One marker bearing on a package version, with the acknowledgement recorded for THAT version (if any). */
export interface BearingMarker {
  marker_id: string; source_id: string; subject_kind: string; subject_id: string; subject_title: string; health_state: string; reason: string | null; set_at: string;
  bearing: string | null; acknowledged: boolean; acknowledged_by: string | null; acknowledged_at: string | null; acknowledgement_id: string | null;
}
export interface PackageBearing {
  package_id: string; title: string; state: string; version: number; current_version: number | null; committed_version: number | null;
  markers: BearingMarker[]; outstanding: number; gate: 'clear' | 'blocked';
}
/** What the acknowledgement answers: what was recorded now, what already was, what is still outstanding for the version. */
export interface Acknowledgement {
  acknowledgement_id: string | null; package_id: string; version: number; repeated: boolean; acknowledged: string[]; already_acknowledged: string[];
  outstanding: Array<{ marker_id: string; subject_kind: string; subject_id: string; health_state: string }>; acknowledged_by: string; acknowledged_at: string | null; reason: string;
}

/** A health state in three channels (glyph, word, colour token) — never colour alone. */
export function healthMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'failed': return { glyph: '✕', token: '--eye-color-critical', text: 'SOURCE FAILED' };
    case 'suspended': return { glyph: '■', token: '--eye-color-critical', text: 'SOURCE SUSPENDED' };
    case 'degraded': return { glyph: '◐', token: '--eye-color-warning', text: 'SOURCE DEGRADED' };
    case 'unknown': return { glyph: '?', token: '--eye-color-uncertain', text: 'SOURCE HEALTH UNKNOWN' };
    case 'cleared': return { glyph: '○', token: '--eye-color-ink-muted', text: 'CLEARED' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: state.toUpperCase() };
  }
}

/** What the marker constrains, in words (the server's rules, stated — the server enforces them). */
export function constraintLine(kind: string, state: string): string {
  const blocksRuns = state === 'failed' || state === 'suspended';
  switch (kind) {
    case 'forecast':
    case 'scenario':
      return blocksRuns ? 'a run on a scenario resting on it is refused until the source recovers' : 'a run on a scenario resting on it is admitted with the source impact declared';
    case 'run':
    case 'package':
      return 'a package version resting on it commits only once a decision authority acknowledges the impact for that version';
    case 'warning':
      return 'the warning rests on a forecast of the degraded source';
    default:
      return 'rests on the degraded source';
  }
}

/** The commitment gate of one version, in words. */
export function gateLine(b: Pick<PackageBearing, 'gate' | 'outstanding' | 'version' | 'markers'>): string {
  if (b.markers.length === 0) return `no active source-impact marker bears on version ${b.version}`;
  if (b.gate === 'clear') return `every marker bearing on version ${b.version} is acknowledged for it — the commitment is not held by the source impact`;
  return `${b.outstanding} marker(s) bearing on version ${b.version} not acknowledged for it — the commitment is refused until a decision authority acknowledges them`;
}

/** The acknowledgement payload: the version, the selected marker ids (deduplicated, in order), the reason trimmed. */
export function acknowledgePayload(version: number, markerIds: string[], reason: string): { version: number; markerIds: string[]; reason: string } {
  return { version, markerIds: [...new Set(markerIds.filter((x) => x.trim() !== ''))], reason: reason.trim() };
}

/** The markers list filter: only what is set is sent. */
export function markersPayload(f: { state?: string | null; sourceId?: string | null } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof f.state === 'string' && f.state !== '') out['state'] = f.state;
  if (typeof f.sourceId === 'string' && f.sourceId !== '') out['sourceId'] = f.sourceId;
  return out;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null, purpose = 'decision'): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: purpose, side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const sourceImpact = {
  /** The domain's markers grouped by source (active by default; `cleared` or `all` on request). An audited read. */
  markers: (s: Scope, filter: { state?: string | null; sourceId?: string | null } = {}) =>
    p<{ sources: SourceGroup[]; total: number; receipt: Receipt }>(s, '/observation/source-impact/markers', 'observation.source_impact.read', 'SRC', markersPayload(filter)),
  /** The markers bearing on ONE version of a package (its current version when none is named), with their acknowledgements and the gate. */
  bearing: (s: Scope, packageId: string, version: number | null) =>
    p<{ package: PackageBearing; receipt: Receipt }>(s, '/observation/source-impact/markers', 'observation.source_impact.read', 'SRC', version === null ? { packageId } : { packageId, version }),
  /** Human-gated; the decision authority's. The server judges the person, the markers and the version. */
  acknowledge: (s: Scope, packageId: string, version: number, markerIds: string[], reason: string) =>
    p<{ acknowledgement: Acknowledgement; receipt: Receipt }>(s, `/decisions/${packageId}/source-impact/acknowledge`, 'decision.source_impact.acknowledge', 'DPK', { ...acknowledgePayload(version, markerIds, reason) }, packageId),
};
