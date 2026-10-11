/**
 * The supply-chain intelligence client — CP-6 B33 §SC (0111; F-P4-14: CAP-FW-07, JRN-11; F-P5-01: AI-53-003, V01-T-024, AG-026).
 *
 * Every response is returned VERBATIM: the network's analysis and UNCERTAINTY (declared / validated / inferred, the unknown parent, country,
 * contract, the unsourced vendor inputs), the Supply Chain Agent's INFERENCES (proposed → validated → applied, the evidence, the sensitivity,
 * the proposal digest the validator quotes), the DISRUPTIONS with their MAPS (the routes derated, the line's run rate, cover and line-stop days,
 * the excluded and isolated sites, the stale inputs) and the ALTERNATIVES with their VERDICTS (feasible / infeasible / indeterminate, the
 * reasons, the coverage limits). The helpers below only WORD what the record says: nothing here infers, maps, judges feasibility or decides a
 * response — the response is a decision of the decision layer. Every figure is SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;

export interface TierUncertainty { tier: number; sites: number; declared: number; validated: number; inferred: number; unknown_parent: number; unknown_country: number; unknown_contract: number; single_source: number; routes: number; covered: boolean }
export interface SiteView { id: string; tier: number; name: string; basis: 'declared' | 'inferred' | 'validated'; inference_id: string | null; country: string | null; city: string | null; entity_id: string | null;
  ownership: { parent: string | null; share: number | null; confidence: number } | null; contract: { ref: string; until: string | null; confidence: number } | null; geo_confidence: number | null; confidence: number | null; unknown: string[] }
export interface RouteView { id: string; from: string; to: string; material: string; mode: string | null; via: string[]; lead_days: number | null; confidence: number | null; unknown: string[] }
export interface Uncertainty {
  tiers: TierUncertainty[]; coverage: { sites: number; declared: number; validated: number; inferred: number; declared_share: number | null; validated_share: number | null; inferred_share: number | null };
  sites: SiteView[]; routes: RouteView[]; unsourced: Array<{ site: string; tier: number; material: string }>; rule: string;
}
export interface RecordSource { record_source_id: string; twin_id: string; source_key: string; note: string | null; state: 'live' | 'retired'; declared_by: string; declared_at: string; retire_reason: string | null }
export type InferenceState = 'proposed' | 'validated' | 'rejected' | 'superseded' | 'withdrawn' | 'applied' | 'revoked' | 'reverted';
export interface Inference {
  inference_id: string; twin_id: string; twin_version: number; behind_site: string; behind_tier: number; material: string; proposed_site: string; proposed_value: Row; proposed_route: Row;
  observed_flow_per_day: string | number | null; flow_unit: string | null; confidence: string | number; sensitive: boolean; sensitivity: string[]; basis: Row; evidence: Array<{ kind: string; id: string; version: number; digest: string }>;
  evidence_digest: string; proposal_digest: string; isolated: boolean; conflict: Row | null; rationale: string; state: InferenceState; agent_id: string; run_id: string; drafted_at: string;
  validated_by: string | null; validated_at: string | null; validation_reason: string | null; valid_until: string | null; rejected_by: string | null; rejection_reason: string | null;
  applied_by: string | null; applied_version: number | null; reverted_version: number | null; withdrawn_reason: string | null;
  events?: Array<{ event_id: string; event: string; actor_principal_id: string; details: Row; occurred_at: string }>; items?: Row[];
}
export interface NetworkView {
  twin_id: string; title: string; owner: string; family: string; version: number | null; state: string | null; freshness: string | null;
  analysis: Row | null; uncertainty: Uncertainty | null; record_sources: RecordSource[]; records_read: number; records_recognised: number; inferences: Inference[]; note?: string;
}
export interface LineImpact {
  twin_id: string; title: string; version: number | null; owner: string | null; lines: Array<{ line: string; capacity_per_day: number }>; line_capacity_per_day: number;
  supply_before_per_day: number | null; supply_after_per_day: number | null; run_rate_before_per_day: number | null; run_rate_after_per_day: number | null; shortfall_per_day: number | null;
  cover_days: number | null; cover_basis: Row[]; line_stop_days: number | null; utilisation_before: number | null; utilisation_after: number | null; stale: boolean;
}
export interface NetworkMap {
  twin_id: string; title: string; version: number; owner: string | null; terminal: string | null; unit: string | null;
  affected_routes: Array<{ route: string; from: string; to: string; material: string; via: string[]; passes: number; why: string[] }>;
  throughput_before_per_day: number | null; throughput_after_per_day: number | null; excluded: Array<{ site: string; reason: string }>; isolated: Array<{ sites: string[]; reason: string }>;
  lines: LineImpact[]; coverage: Row; confidence: number | null; stale: boolean; stale_reasons: string[];
}
export interface DisruptionMap { networks: NetworkMap[]; affected: boolean; stale: boolean; stale_reasons: string[]; summary: string; method: string; inputs?: Row }
export interface MapRow { map_id: string; map_no: number; pinned: Array<{ kind: string; id: string; version: number; digest: string }>; result: DisruptionMap; result_digest: string; affected: boolean; stale: boolean; agent_id: string | null; mapped_by: string; mapped_at: string }
export type Verdict = 'feasible' | 'infeasible' | 'indeterminate';
export interface Alternative {
  alternative_id: string; disruption_id: string; map_id: string; alt_key: string; kind: 'sourcing' | 'inventory' | 'routing'; title: string; params: Row; twin_id: string; branch_id: string; branch_version: number;
  evaluation: Row; verdict: Verdict; recommendable: boolean; reasons: string[]; coverage_limits: string[]; constraint_check: Row | null; cost: Row | null; state: 'evaluated' | 'superseded'; evaluated_by: string; evaluated_at: string;
}
export type DisruptionState = 'proposed' | 'open' | 'mapped' | 'closed' | 'withdrawn';
export interface Disruption {
  disruption_id: string; title: string; signal: Row; chokepoints: string[]; places: Array<{ country?: string; city?: string }>; derating: string | number; duration_days: string | number | null;
  telemetry_twin_id: string | null; state: DisruptionState; opened_by: string; opened_at: string; proposed_by_agent: string | null; confirmed_by: string | null; map_count: number; last_map_id: string | null;
  closed_by: string | null; close_reason: string | null;
  maps?: MapRow[]; latest_map?: MapRow | null; alternatives?: Alternative[]; events?: Array<{ event_id: string; event: string; actor_principal_id: string; details: Row; occurred_at: string }>; items?: Row[];
}
export interface Workspace { networks: Array<{ twin_id: string; title: string; owner: string; kind: string; head: number | null }>; disruptions: Disruption[]; inferences: Inference[]; now: string; boundary: string }

/* ───────────── the words ───────────── */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 10000) / 100} %`);

/** One tier of the network in words: what is declared, validated, inferred — and what is UNKNOWN (never imputed). */
export function tierLine(t: TierUncertainty): string {
  const unknown = [t.unknown_parent > 0 ? `${t.unknown_parent} unknown parent` : null, t.unknown_country > 0 ? `${t.unknown_country} unknown country` : null,
    t.unknown_contract > 0 ? `${t.unknown_contract} unknown contract` : null].filter((x) => x !== null);
  return `tier ${t.tier}: ${plural(t.sites, 'site')} (${t.declared} declared, ${t.validated} validated, ${t.inferred} inferred)`
    + (t.covered ? '' : ' — NOT COVERED (no route out of it)') + (t.single_source > 0 ? `; ${t.single_source} single source` : '') + (unknown.length === 0 ? '' : `; ${unknown.join(', ')}`);
}
/** The provenance of a site: declared, validated (naming its inference) or inferred (never mapped until validated). */
export function provenanceMark(s: Pick<SiteView, 'basis'>): { glyph: string; token: string; text: string } {
  if (s.basis === 'validated') return { glyph: '✓', token: '--eye-color-success', text: 'validated by a named analyst' };
  if (s.basis === 'inferred') return { glyph: '?', token: '--eye-color-warning', text: 'INFERRED — not validated, never mapped' };
  return { glyph: '●', token: '--eye-color-ink-muted', text: 'declared' };
}
export function siteLine(s: SiteView): string {
  const where = [s.city, s.country].filter((x) => x !== null).join(', ');
  return `${s.name} (${s.id}, tier ${s.tier})${where === '' ? '' : ` — ${where}`}`
    + (s.ownership === null ? '' : `; parent ${s.ownership.parent ?? 'UNKNOWN'} (confidence ${s.ownership.confidence})`)
    + (s.contract === null ? '' : `; contract ${s.contract.ref}${s.contract.until === null ? '' : ` until ${s.contract.until}`}`)
    + (s.unknown.length === 0 ? '' : `; unknown: ${s.unknown.join(', ')}`);
}
export function routeLine(r: RouteView): string {
  return `${r.id}: ${r.from} → ${r.to} (${r.material})${r.mode === null ? '' : ` by ${r.mode}`}${r.via.length === 0 ? ' — via UNKNOWN' : ` via ${r.via.join(' → ')}`}`
    + (r.lead_days === null ? '' : `, ${r.lead_days} days`);
}
export function coverageLine(u: Uncertainty | null | undefined): string {
  if (u === null || u === undefined) return 'no admitted version: nothing is mapped';
  const c = u.coverage;
  return `${plural(c.sites, 'supplier site')}: ${c.declared} declared (${pct(c.declared_share)}), ${c.validated} validated, ${c.inferred} inferred`
    + (u.unsourced.length === 0 ? '' : ` — UNSOURCED: ${u.unsourced.map((x) => `${x.site}'s ${x.material}`).join(', ')} (a hidden tier may stand behind it)`);
}

export function inferenceMark(state: InferenceState | string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'proposed': return { glyph: '◔', token: '--eye-color-warning', text: 'PROPOSED by the Supply Chain Agent — awaiting a named analyst' };
    case 'validated': return { glyph: '◑', token: '--eye-color-accent-strong', text: 'VALIDATED — awaiting the twin owner\'s application' };
    case 'applied': return { glyph: '●', token: '--eye-color-success', text: 'APPLIED to the network' };
    case 'rejected': return { glyph: '✕', token: '--eye-color-critical', text: 'REJECTED by a named analyst' };
    case 'revoked': return { glyph: '⊘', token: '--eye-color-critical', text: 'REVOKED after application — the owner reverts the network' };
    case 'reverted': return { glyph: '↺', token: '--eye-color-ink-muted', text: 'REVERTED from the network' };
    case 'superseded': return { glyph: '↷', token: '--eye-color-ink-muted', text: 'superseded by a changed inference' };
    case 'withdrawn': return { glyph: '–', token: '--eye-color-ink-muted', text: 'withdrawn — its basis is gone' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state) };
  }
}
export function inferenceLine(i: Inference): string {
  const v = i.proposed_value as { name?: string; tier?: number; city?: string; country?: string };
  const where = [v.city, v.country].filter((x) => x !== undefined && x !== null).join(', ');
  const flow = num(i.observed_flow_per_day);
  return `${v.name ?? i.proposed_site} (tier ${String(v.tier ?? i.behind_tier + 1)}${where === '' ? '' : `, ${where}`}) behind ${i.behind_site} for ${i.material}`
    + ` — confidence ${String(num(i.confidence) ?? '—')}${flow === null ? '' : `; observed flow ${flow} ${i.flow_unit ?? ''}`.trimEnd()}`
    + (i.sensitive ? `; SENSITIVE (${i.sensitivity.join(', ')})` : '') + (i.isolated ? ' — ISOLATED: identity conflict' : '');
}
export function inferenceEventLine(e: { event: string; details: Row }): string {
  const d = e.details;
  switch (e.event) {
    case 'inference.drafted': return `drafted by the agent (proposal digest ${String(d['proposal_digest'] ?? '').slice(0, 12)}…)`;
    case 'inference.validated': return `validated${d['renewed'] === true ? ' again' : ''} until ${String(d['valid_until'] ?? '—')}${d['reason'] ? ` — “${String(d['reason'])}”` : ''}`;
    case 'inference.rejected': return `rejected — “${String(d['reason'] ?? '')}”`;
    case 'inference.revoked': return `revoked after application — “${String(d['reason'] ?? '')}”`;
    case 'inference.applied': return `applied in version ${String(d['version'] ?? '?')}`;
    case 'inference.reverted': return `reverted in version ${String(d['version'] ?? '?')}`;
    case 'inference.superseded': return 'superseded by a changed inference';
    case 'inference.withdrawn': return `withdrawn — ${String(d['reason'] ?? '')}`;
    default: return e.event;
  }
}

export function disruptionMark(state: DisruptionState | string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'proposed': return { glyph: '◔', token: '--eye-color-warning', text: 'PROPOSED by the agent — a person confirms it' };
    case 'open': return { glyph: '◍', token: '--eye-color-warning', text: 'OPEN — not yet mapped' };
    case 'mapped': return { glyph: '◉', token: '--eye-color-accent-strong', text: 'MAPPED' };
    case 'closed': return { glyph: '●', token: '--eye-color-ink-muted', text: 'closed' };
    case 'withdrawn': return { glyph: '–', token: '--eye-color-ink-muted', text: 'withdrawn' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state) };
  }
}
export function signalLine(s: Row): string {
  const kind = String(s['kind'] ?? '');
  const ref = typeof s['ref'] === 'string' ? ` ${String(s['ref']).slice(0, 8)}…` : '';
  const note = typeof s['note'] === 'string' && s['note'] !== '' ? ` — ${String(s['note'])}` : '';
  return kind === 'person' ? `a person's report${note}` : kind === 'twin_change' ? `an admitted twin change${ref}${s['version'] === undefined ? '' : ` v${String(s['version'])}`}${note}`
    : `a ${kind}${ref}${note}`;
}
export function whereLine(d: Pick<Disruption, 'chokepoints' | 'places' | 'derating' | 'duration_days'>): string {
  const places = d.places.map((p) => [p.city, p.country].filter((x) => x !== undefined && x !== null).join(', '));
  const at = [...d.chokepoints, ...places].join(', ');
  const dur = num(d.duration_days);
  return `${at}: ${pct(num(d.derating))} of capacity lost on an affected route${dur === null ? ', duration not stated' : ` for ${dur} days`}`;
}
/** The STALE banner of a map: its inputs are not current — never shown as current and complete. */
export function staleBanner(m: Pick<DisruptionMap, 'stale' | 'stale_reasons'> | null | undefined): { level: 'stale' | 'current'; text: string } | null {
  if (m === null || m === undefined) return null;
  return m.stale ? { level: 'stale', text: `STALE INPUTS — ${m.stale_reasons.join('; ')}: the map is not current; every option is indeterminate` } : { level: 'current', text: 'the inputs are current by their freshness policies' };
}
export function lineImpactLine(l: LineImpact): string {
  const names = l.lines.map((x) => x.line).join(', ');
  const rate = l.run_rate_after_per_day === null ? 'cannot be computed' : `${l.run_rate_after_per_day} of ${String(l.run_rate_before_per_day)} per day`;
  const cover = l.shortfall_per_day === 0 ? 'no shortfall' : l.cover_days === null ? 'cover UNKNOWN' : `${l.cover_days} day(s) of cover`;
  const stop = l.line_stop_days === null ? '' : l.line_stop_days === 0 ? '; no line stop' : `; ${l.line_stop_days} day(s) of line stop`;
  return `${names} (${l.title}) runs at ${rate} — ${cover}${stop}${l.stale ? ' — STALE line state' : ''}`;
}
export function affectedRouteLine(r: NetworkMap['affected_routes'][number]): string {
  return `${r.route}: ${r.from} → ${r.to} (${r.material}) passes ${pct(r.passes)} — ${r.why.join(', ')}`;
}
export function verdictMark(v: Verdict | string): { glyph: string; token: string; text: string } {
  if (v === 'feasible') return { glyph: '✓', token: '--eye-color-success', text: 'FEASIBLE' };
  if (v === 'infeasible') return { glyph: '✕', token: '--eye-color-critical', text: 'INFEASIBLE — constrained, never recommended' };
  return { glyph: '?', token: '--eye-color-warning', text: 'INDETERMINATE — a coverage gap or stale input; never recommended' };
}
export function alternativeLine(a: Alternative): string {
  const e = a.evaluation as { restored_share?: number | null; effect_after_days?: number | null; cover_days?: number | null; cover_with_option_days?: number | null };
  const parts = [`${a.kind} on ${a.branch_id} v${a.branch_version}`];
  if (e.restored_share !== undefined && e.restored_share !== null) parts.push(`restores ${pct(e.restored_share)} of the run rate`);
  if (e.effect_after_days !== undefined && e.effect_after_days !== null && a.kind !== 'inventory') parts.push(`effect after ${e.effect_after_days} day(s)`);
  if (a.kind === 'inventory' && e.cover_with_option_days !== undefined && e.cover_with_option_days !== null) parts.push(`stock covers ${e.cover_with_option_days} day(s)`);
  const c = a.cost;
  if (c !== null && c['amount'] !== null && c['amount'] !== undefined) parts.push(`cost ${String(c['amount'])} ${String(c['currency'] ?? '')}`.trimEnd());
  return parts.join(' · ');
}

/** A datetime-local value (the browser's local wall time) as the instant it names, or null. */
export function instantOfLocal(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** Comma-separated keys as a list (trimmed, empties dropped). */
export const listOf = (v: string): string[] => v.split(',').map((x) => x.trim()).filter((x) => x !== '');

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twin-supply`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null, objectType = 'TWS'): Promise<ApiResult<T>> {
  const read = action === READ;
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'twin',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const READ = 'twin.supply.read';

export const supply = {
  workspace: (s: Scope) => p<{ workspace: Workspace; receipt: Receipt }>(s, '/workspace', READ),
  network: (s: Scope, twinId: string, version?: number) => p<{ network: NetworkView; receipt: Receipt }>(s, `/networks/${twinId}`, READ, version === undefined ? {} : { version }, twinId, 'TWN'),
  declareSource: (s: Scope, payload: { twinId: string; sourceKey: string; note?: string; retire?: boolean; reason?: string }) =>
    p<{ recordSource: Row; receipt: Receipt }>(s, '/record-sources/declare', 'twin.supply.records.declare', payload, payload.twinId, 'TWN'),
  inferences: (s: Scope, f: { twinId?: string; state?: string } = {}) => p<{ inferences: Inference[]; receipt: Receipt }>(s, '/inferences/list', READ, f),
  inference: (s: Scope, id: string) => p<{ inference: Inference; receipt: Receipt }>(s, `/inferences/${id}/read`, READ, {}, id),
  decide: (s: Scope, id: string, payload: { decision: 'validated' | 'rejected'; reason?: string; digest?: string; validUntil?: string }) =>
    p<{ decision: Row; receipt: Receipt }>(s, `/inferences/${id}/decide`, 'twin.supply.inference.validate', payload, id),
  apply: (s: Scope, id: string, payload: { capacityPerDay?: number; leadDays?: number; entityId?: string; allowIncomplete?: boolean }) =>
    p<{ applied: Row; version: number; capacity: Row; receipt: Receipt }>(s, `/inferences/${id}/apply`, 'twin.supply.inference.apply', payload, id),
  revert: (s: Scope, id: string, allowIncomplete = false) => p<{ reverted: Row; version: number; removed: string[]; receipt: Receipt }>(s, `/inferences/${id}/revert`, 'twin.supply.inference.apply', { allowIncomplete }, id),
  disruptions: (s: Scope, state?: string) => p<{ disruptions: Disruption[]; receipt: Receipt }>(s, '/disruptions/list', READ, state === undefined ? {} : { state }),
  disruption: (s: Scope, id: string) => p<{ disruption: Disruption; receipt: Receipt }>(s, `/disruptions/${id}/read`, READ, {}, id),
  open: (s: Scope, payload: { title: string; signal: Row; chokepoints: string[]; places: Row[]; derating: number; durationDays?: number; telemetryTwinId?: string }) =>
    p<{ disruption: Row; receipt: Receipt }>(s, '/disruptions/open', 'twin.supply.disruption.open', payload),
  confirm: (s: Scope, id: string) => p<{ disruption: Row; receipt: Receipt }>(s, `/disruptions/${id}/confirm`, 'twin.supply.disruption.confirm', {}, id),
  close: (s: Scope, id: string, to: 'closed' | 'withdrawn', reason: string) => p<{ disruption: Row; receipt: Receipt }>(s, `/disruptions/${id}/close`, 'twin.supply.disruption.close', { to, reason }, id),
  map: (s: Scope, id: string) => p<{ map: Row; result: DisruptionMap; pinned: Row[]; receipt: Receipt }>(s, `/disruptions/${id}/map`, 'twin.supply.disruption.map', {}, id),
  replay: (s: Scope, id: string, mapNo?: number) => p<{ replay: { identical: boolean; map_no: number; recorded_digest: string; replayed_digest: string }; receipt: Receipt }>(s, `/disruptions/${id}/replay`, READ, mapNo === undefined ? {} : { mapNo }, id),
  evaluate: (s: Scope, id: string, payload: { key: string; kind: string; title: string; twinId: string; branchVersion: number; constraintSets?: string[]; cost?: Row; costRef?: Row }) =>
    p<{ alternative: Row; evaluation: Row; receipt: Receipt }>(s, `/disruptions/${id}/alternatives/evaluate`, 'twin.supply.alternative.evaluate', payload, id),
};
