/**
 * CP-6 B25 part `context` (0108 §CX; F-P4-03, V03-T-196) — the calls of the grounding page and the information-set list, and the
 * WORDS they render (pure, unit-tested). Every answer is the server's, VERBATIM: the outcome of a replay (REPRODUCED | DIVERGED) is the
 * port's derivation, never the client's; an environment that differs is SAID; a coverage gap is named with its reason; an instant through
 * fmtInstant, a DATE as the day it names.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;

export interface Feature { key: string; source: string; digest: string; value?: string | number | boolean | null }
export interface Gap { key: string; required?: boolean; reason: string }
export interface Manifest {
  schema: string; assembler_version: string;
  request: { series_key: string; subject_entity_id: string | null; target_key: string | null; known_at: string; observed_through: string | null; assumptions: string[] };
  evidence: Row[];
  graph: { revision_head: number; known_at: string; subject: Row | null; edge_count: number; edges_digest: string; event_count: number; events_digest: string; neighbours: string[]; withdrawn_partitions: string[] };
  twin: { twin_id: string; version: number; branch_id: string | null; mode: string | null; state_set_digest: string; header_digest: string; known_at: string | null; admitted_at: string | null; synthetic: boolean; element_count: number } | null;
  features: Feature[]; assumptions: Row[]; policy: Row; coverage_gaps: Gap[];
}
export interface SetView {
  information_set_id: string; series_key: string; subject_entity_id: string | null; known_at: string; observed_through: string | null; manifest: Manifest; manifest_digest: string;
  assembler_version: string; revision_head: number; twin_id: string | null; twin_version: number | null; frozen_via: string; frozen_by: string; frozen_at: string;
  events: Row[]; forecasts: Row[];
}
export interface ReplayRow {
  replay_id: string; forecast_id: string; outcome: 'REPRODUCED' | 'DIVERGED'; original_manifest_digest: string; replayed_manifest_digest: string;
  original_output_digest: string; replayed_output_digest: string | null; original_environment_digest: string | null; replayed_environment_digest: string | null;
  environment_match: boolean; diverged: Array<{ what: string; note?: string }>; fresh: { known_at: string; revision_head: number; manifest_digest: string; differs: boolean; what: string[] } | null;
  detail: Row; replayed_by: string; replayed_at: string;
}
export interface GroundingView {
  grounded: boolean; note?: string;
  forecast: { forecast_id: string; series_key: string; horizon_code: string; method: string; method_version: string; state: string; validation_state: string; label: string; statement: string;
              known_at: string; origin_at: string | null; target_at: string | null; environment: Row | null; environment_digest: string | null; information_set_id: string | null;
              /* B25 completion: a routed forecast's reference, kind, target, outcome and horizon policy (absent on a legacy forecast) */
              method_ref?: string | null; forecast_kind?: string | null; target_key?: string | null; outcome?: Row | null; horizon_policy?: Row | null };
  set: SetView | null; replays: ReplayRow[];
}
export type SetListRow = Row & { information_set_id: string; series_key: string; known_at: string; manifest_digest: string; revision_head: number; twin_id: string | null; twin_version: number | null; frozen_at: string; coverage_gaps: Gap[] };
export interface ReplayAnswer extends Row {
  outcome: 'REPRODUCED' | 'DIVERGED'; diverged: Array<{ what: string; note?: string }>;
  environment: { original: string | null; replayed: string; match: boolean; differences: string[] };
  fresh: { known_at: string; revision_head: number; manifest_digest: string; differs: boolean; what: string[] };
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const context = {
  grounding: (s: Scope, forecastId: string) =>
    p<{ grounding: GroundingView; receipt: Receipt }>(s, `/forecasts/${forecastId}/grounding`, 'prediction.information_set.read', 'FCT', {}, forecastId),
  replay: (s: Scope, forecastId: string) =>
    p<{ replay: ReplayAnswer; receipt: Receipt }>(s, `/forecasts/${forecastId}/replay`, 'prediction.forecast.replay', 'FCT', {}, forecastId),
  listSets: (s: Scope, seriesKey: string | null = null) =>
    p<{ at: string; sets: SetListRow[]; receipt: Receipt }>(
      s, '/information-sets/list', 'prediction.information_set.read', 'INS', seriesKey === null ? {} : { seriesKey }),
  getSet: (s: Scope, setId: string) =>
    p<{ informationSet: SetView & { replays: ReplayRow[] }; receipt: Receipt }>(s, `/information-sets/${setId}/get`, 'prediction.information_set.read', 'INS', {}, setId),
  freeze: (s: Scope, payload: { seriesKey: string; knownAt?: string; observedThrough?: string | null; assumptions: string[] }) =>
    p<{ informationSet: Row & { informationSetId: string; manifestDigest: string }; receipt: Receipt }>(s, '/information-sets/freeze', 'prediction.information_set.freeze', 'INS', payload),
  issueGrounded: (s: Scope, payload: { seriesKey: string; horizon: string; assumptions: string[]; label: string; knownAt?: string; observedThrough?: string }) =>
    p<{ forecast: Row & { forecastId: string; informationSet: Row; environment: Row }; receipt: Receipt }>(s, '/forecasts/issue-grounded', 'prediction.forecast.issue', 'FCT', payload),
};

/* ───────────────────────── the words (pure) ───────────────────────── */

export const short = (v: unknown, n = 8): string => { const t = String(v ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** A replay's outcome — glyph, token and words; never colour alone. */
export function outcomeMark(outcome: string): { glyph: string; token: string; text: string } {
  if (outcome === 'REPRODUCED') return { glyph: '✓', token: '--eye-color-success', text: 'REPRODUCED — the pinned inputs re-read and the method re-run give the same manifest and the same distribution' };
  if (outcome === 'DIVERGED') return { glyph: '≠', token: '--eye-color-critical', text: 'DIVERGED — the replay did not reproduce the forecast; what diverged is named' };
  return { glyph: '?', token: '--eye-color-warning', text: `${outcome} — not a replay outcome this page knows` };
}

/** What diverged, in words. */
export function divergedLine(d: Array<{ what: string; note?: string }>): string {
  if (d.length === 0) return 'nothing diverged';
  return d.map((x) => (x.note === undefined || x.note === '' ? x.what : `${x.what} (${x.note})`)).join('; ');
}

/** The environment comparison — reported, never hidden. */
export function environmentLine(match: boolean, differences: string[]): string {
  return match ? 'the same environment (node, platform, architecture, method implementation, assembler)'
    : `a DIFFERENT environment: ${differences.length === 0 ? 'the environment' : differences.join(', ')} differ — the reproduction across environments is reported, not hidden`;
}

/** The fresh grounding beside a replay. */
export function freshLine(f: { revision_head: number; differs: boolean; what: string[] } | null, pinnedHead: number): string {
  if (f === null) return 'no fresh grounding was read';
  if (!f.differs) return `a grounding now (revision ${f.revision_head}) would pin the same inputs`;
  return `a grounding now would differ (revision ${f.revision_head} against the pinned ${pinnedHead}): ${f.what.join(', ')} — the replay is held to the pinned set, not to the graph as it stands`;
}

/** A coverage gap, named with its reason; a required one says so. */
export function gapLine(g: Gap): string { return `${g.key}${g.required === true ? ' (required)' : ''}: ${g.reason}`; }

/** A feature's value as text: a scalar as is, otherwise "structured (pinned by digest)". */
export function featureValue(f: Feature): string {
  if (f.value === undefined || f.value === null) return 'structured — pinned by its digest';
  return typeof f.value === 'number' ? (Number.isInteger(f.value) ? String(f.value) : f.value.toFixed(4).replace(/\.?0+$/, '')) : String(f.value);
}

/** The feature groups the page lists, in order (evidence, graph, twin, assumptions). */
export function featureGroup(key: string): 'evidence' | 'graph' | 'twin' | 'assumption' | 'other' {
  if (key.startsWith('evidence.')) return 'evidence';
  if (key.startsWith('graph.')) return 'graph';
  if (key.startsWith('twin.')) return 'twin';
  if (key.startsWith('assumption.')) return 'assumption';
  return 'other';
}

/** The environment's facts in one line. */
export function environmentFacts(env: Row | null): string {
  if (env === null) return 'no environment recorded (an ungrounded forecast)';
  const impl = env['implementation_digest'] === null || env['implementation_digest'] === undefined ? 'implementation unregistered' : `implementation ${short(env['implementation_digest'], 12)}`;
  return `node ${String(env['node'])} · ${String(env['platform'])}/${String(env['arch'])} · ${String(env['method_ref'])} · ${impl} · ${String(env['assembler_version'])}`;
}

/* ───────────── B25 completion — a ROUTED forecast's inputs used (G1), its long-horizon view (G6) and its pins (G7), as the server sent them ───────────── */

/** Each frozen feature the routed method computed with: its value, its digest, whether its condition held. */
export function usedFeatureLines(outcome: Row | null | undefined): string[] {
  const used = Array.isArray(outcome?.['features_used']) ? (outcome['features_used'] as Row[]) : [];
  return used.map((u) => `${String(u['key'])} = ${String(u['value'])} · digest ${short(u['digest'], 12)} · ${u['held'] === true ? 'condition HELD' : 'condition did not hold'}`);
}
/** The path-dependent view's own statement (scenario language), or null when the forecast carries none. */
export function pathViewLine(outcome: Row | null | undefined): string | null {
  const p = outcome?.['path_dependence'];
  return p !== null && typeof p === 'object' && typeof (p as Row)['statement'] === 'string' ? String((p as Row)['statement']) : null;
}
/** The declared options: each one's expected payoff and resilience, then the option value — or [] when none is declared. */
export function optionLines(outcome: Row | null | undefined): string[] {
  const o = outcome?.['options'];
  if (o === null || typeof o !== 'object') return [];
  const r = o as Row;
  const rows = (Array.isArray(r['options']) ? (r['options'] as Row[]) : []).map((x) => `${String(x['label'])}: expected ${String(x['expected'])}, resilience ${String(x['resilience'])} (worst regime ${String(x['worst_regime'])})`);
  return [...rows, `option value of flexibility ${String(r['option_value'])} · best single commitment ${String((r['best_commitment'] as Row | undefined)?.['key'] ?? '—')} · most resilient ${String((r['most_resilient'] as Row | undefined)?.['key'] ?? '—')}`];
}
/** The target version and the evaluation profile the forecast pins (G7). */
export function pinLines(f: { target_key?: string | null; outcome?: Row | null; horizon_policy?: Row | null }): string[] {
  const out: string[] = [];
  const t = f.outcome?.['target'];
  if (t !== null && typeof t === 'object') out.push(`target ${String((t as Row)['target_key'])} v${String((t as Row)['version'])} · definition ${short((t as Row)['definition_digest'], 12)}`);
  else if (f.target_key === null || f.target_key === undefined) out.push('no target — a series forecast');
  const p = f.horizon_policy?.['evaluation_profile'];
  if (p !== null && typeof p === 'object') {
    const e = p as Row; const pol = (e['policy'] ?? {}) as Row; const req = (e['validation_requirement'] ?? {}) as Row;
    out.push(`evaluation profile · ${pol['legacy'] === true || pol['policy_id'] === null ? 'the legacy rule' : `horizon policy ${String(pol['risk_class'] ?? '')} v${String(pol['version'])}`} · `
      + `${req['required'] === true ? `requires ${String(req['kind'])} ≥ ${String(req['min_origins'])} origins` : 'no validation required'} · ${e['validation_ref'] === null || e['validation_ref'] === undefined ? 'no applicable record' : `record ${short(((e['validation_ref'] as Row)['validation_id'] ?? (e['validation_ref'] as Row)['backtest_id']), 8)}`}`);
  }
  return out;
}
