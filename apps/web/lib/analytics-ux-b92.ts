/**
 * The experience-quality client — CP-6 B92 §UX (0113_b92_x_ux; UX-70-001..006, CAP-PD-09).
 *
 * Every response is returned VERBATIM: the person's own consent, the telemetry definitions with their privacy review, hold and retirement,
 * the collection tallies, the journeys with their four-part anatomy (objective → metric and lineage → segment and uncertainty → decision and
 * follow-through), the baselines (an indeterminate one with its reasons, n, the floor and k; a segment below k SUPPRESSED), the thresholds,
 * the experiments with their two approvals, analyses and conclusion, the findings and the actions a named owner decided against the
 * consequence preview, the purges and the exports. The helpers below only WORD what the record says; nothing here collects, measures,
 * approves or decides. BOUNDARY: software capability; the demo is SYNTHETIC; the signed acceptance (UX-70-006) → R2 / B107.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type Mark = { glyph: string; token: string; text: string };

export interface Baseline {
  baseline_id: string; journey_key: string; measure: string; step_key: string | null; segment_key: string | null; segment: { dimension: string; value: string } | null;
  period_key: string; window_from: string; window_to: string; state: 'determinate' | 'indeterminate'; value: number | string | null; numerator: number | null; denominator: number | null;
  n: number | null; k_observed: number | null; k_min: number; floor_n: number; distribution: Row | null; uncertainty: Row | null; reasons: string[]; definitions_used: Row[];
  source_revision: string; crossings: Row[]; recorded_at: string; suppressed: string | null;
}
export interface Definition {
  definition_id: string; event_key: string; version: number; title: string; purpose_key: string; journey_key: string; step_key: string; fields: Record<string, Row>;
  retention_days: number | null; state: string; collection: 'open' | 'held'; hold_reason: string | null; held_at: string | null; digest: string; proposed_by: string;
  decided_by: string | null; decided_at: string | null; decision_reason: string | null; retired_at: string | null; retire_reason: string | null;
}
export interface Experiment {
  experiment_id: string; journey_key: string; title: string; hypothesis: string; primary_measure: string; step_key: string | null; variants: Array<{ key: string; kind: string; description: string }>;
  min_sample_per_arm: number; state: string; digest: string; proposed_by: string; started_at: string | null; invalidation: Row | null; conclusion: Row | null;
  approvals: Array<{ role: string; decision: string; reason: string; decided_at: string }>; analyses: Analysis[];
}
export interface Analysis { analysis_id: string; verdict: 'valid' | 'invalid' | 'insufficient'; arms: Row[]; comparisons: Row[]; srm: Row; checks: Row[]; reasons: string[]; digest: string; analysed_at: string; analysed_by_kind: string }
export interface Finding {
  finding_id: string; origin_kind: string; origin_id: string; journey_key: string | null; statement: string; evidence: Row; state: string; digest: string; proposed_by: string;
  proposed_by_kind: string; proposed_at: string; action: (Row & { decision: string; kind: string | null; effect: Row; reason: string; decided_at: string; preview: Row }) | null;
}
export interface Threshold { threshold_id: string; journey_key: string; measure: string; step_key: string | null; segment_key: string | null; bound: 'min' | 'max'; value: number | string; rationale: string; state: string; digest: string; proposed_by: string }
export interface JourneyView {
  journey: Row & { journey_id: string; journey_key: string; version: number; title: string; steps: string[]; floor_n: number; purpose_key: string };
  objective: { statement: string; objective_ids: string[]; purpose_key: string };
  metrics: Baseline[]; segments: Baseline[]; thresholds: Threshold[]; findings: Finding[]; experiments: Experiment[];
}
export interface Workspace {
  journeys: JourneyView[]; findings_unattached: Finding[]; definitions: Definition[]; collection: Record<string, { stored: number; days: number; not_collected: Record<string, number>; purged: number }>;
  purposes: Row[]; segments: Row[]; purges: Row[]; exports: Row[]; consent_counts: Array<{ purpose_key: string; consenting_now: number; withdrawals_recorded: number }>;
  items: Array<{ item_id: string; signal_class: string; subject_kind: string; subject_id: string; title: string; state: string; route_roles: string[]; created_at: string }>;
  ledger: Row[]; read_at: string; boundary: string; receipt: Receipt;
}
export interface SelfPurpose { purpose_key: string; version: number; title: string; kind: string; description: string; retention_days: number; consented: boolean; history: Array<{ decision: string; purpose_version: number; recorded_at: string }> }
export interface SelfState { purposes: SelfPurpose[]; definitions: Array<{ event_key: string; version: number; purpose_key: string; journey_key: string; step_key: string; fields: Record<string, Row> }>; experiments: Array<{ experiment_id: string; journey_key: string; title: string; arms: string[] }>; read_at: string }

/* ───────────── the words ───────────── */
/** A lifecycle state as a glyph, a token and words — visibly distinct (draft / proposed / approved / retired …), never colour alone. */
export function stateMark(state: string): Mark {
  switch (state) {
    case 'approved': case 'active': case 'running': return { glyph: '●', token: '--eye-color-success', text: state === 'running' ? 'RUNNING' : state.toUpperCase() };
    case 'proposed': return { glyph: '◌', token: '--eye-color-warning', text: 'PROPOSED (awaiting a named human)' };
    case 'rejected': return { glyph: '✕', token: '--eye-color-critical', text: 'REJECTED' };
    case 'superseded': return { glyph: '○', token: '--eye-color-ink-muted', text: 'SUPERSEDED' };
    case 'retired': return { glyph: '⊘', token: '--eye-color-ink-muted', text: 'RETIRED' };
    case 'invalidated': return { glyph: '⚑', token: '--eye-color-critical', text: 'INVALIDATED' };
    case 'concluded': return { glyph: '◉', token: '--eye-color-accent-strong', text: 'CONCLUDED' };
    case 'actioned': return { glyph: '◉', token: '--eye-color-accent-strong', text: 'ACTIONED' };
    case 'dismissed': return { glyph: '○', token: '--eye-color-ink-muted', text: 'DISMISSED' };
    case 'held': return { glyph: '⏸', token: '--eye-color-critical', text: 'COLLECTION HELD' };
    case 'determinate': return { glyph: '●', token: '--eye-color-success', text: 'DETERMINATE' };
    case 'indeterminate': return { glyph: '◐', token: '--eye-color-warning', text: 'INDETERMINATE' };
    case 'suppressed': return { glyph: '▒', token: '--eye-color-ink-muted', text: 'SUPPRESSED (below k)' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
const pct = (v: unknown) => `${(Number(v) * 100).toFixed(1)} %`;
const ms = (v: unknown) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} s` : `${Number(v)} ms`);
/** The value a measure names, in its unit: a rate as a percentage, a latency in ms / s. */
export function measureValue(measure: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return measure === 'step_p50_ms' ? ms(v) : pct(v);
}
/** The interval in words (Wilson for a rate, the median's order statistics for a latency; an unbounded one is SAID). */
export function intervalLine(measure: string, u: Row | null | undefined): string {
  if (u === null || u === undefined) return 'no interval';
  if (u['lo'] === undefined || u['lo'] === null) return String(u['note'] ?? 'the interval is unbounded at this n');
  const method = u['method'] === 'wilson' ? 'Wilson' : u['method'] === 'order_statistics' ? 'median, order statistics' : String(u['method']);
  return `95 % ${measureValue(measure, u['lo'])} – ${measureValue(measure, u['hi'])} (${method})`;
}
/**
 * A baseline in ONE line: the value with its interval and n — or the EXPLAINED indeterminate (its reasons, n, the floor, k) — or SUPPRESSED
 * (below k: n withheld). Never a zero or a dash that reads like zero.
 */
export function baselineLine(b: Pick<Baseline, 'state' | 'measure' | 'value' | 'uncertainty' | 'n' | 'floor_n' | 'k_min' | 'k_observed' | 'reasons' | 'suppressed'>): { mark: Mark; text: string } {
  if (b.suppressed !== null && b.suppressed !== undefined) {
    return { mark: stateMark('suppressed'), text: `SUPPRESSED — ${b.suppressed}; floor ${b.floor_n}. ${b.reasons.join(' · ')}` };
  }
  if (b.state === 'determinate') {
    return { mark: stateMark('determinate'), text: `${measureValue(b.measure, b.value)} · ${intervalLine(b.measure, b.uncertainty)} · n = ${b.n ?? '—'} (floor ${b.floor_n}, k ≥ ${b.k_min})` };
  }
  return { mark: stateMark('indeterminate'), text: `INDETERMINATE (no value) — ${b.reasons.join(' · ')} · n = ${b.n ?? 'withheld'}, floor ${b.floor_n}, k ≥ ${b.k_min}` };
}
/** A consent in words: the person's own state for a purpose, its version, and what not consenting means. */
export function consentLine(p: Pick<SelfPurpose, 'consented' | 'version' | 'history' | 'retention_days'>): string {
  if (p.consented) return `CONSENTED to version ${p.version} — your events are collected pseudonymously (a daily pseudonym, never your identity), kept ${p.retention_days} days`;
  const last = p.history[p.history.length - 1];
  if (last !== undefined && last.decision === 'granted' && last.purpose_version !== p.version) return `NOT CONSENTED — the purpose changed (version ${last.purpose_version} → ${p.version}); your earlier consent does not carry over`;
  return 'NOT CONSENTED — nothing of yours is collected under this purpose, and experiments always show you the current design';
}
/** A definition's collection state in words (held with its reason; retired; awaiting the privacy review). */
export function collectionLine(d: Pick<Definition, 'state' | 'collection' | 'hold_reason' | 'retention_days'>): { mark: Mark; text: string } {
  if (d.state === 'retired') return { mark: stateMark('retired'), text: 'RETIRED — nothing is collected; what was collected stays readable until the purge' };
  if (d.state === 'proposed') return { mark: stateMark('proposed'), text: 'PROPOSED — awaiting the privacy officer\'s review; nothing is collected' };
  if (d.state !== 'approved') return { mark: stateMark(d.state), text: `${d.state.toUpperCase()} — nothing is collected under this version` };
  if (d.collection === 'held') return { mark: stateMark('held'), text: `COLLECTION HELD — ${d.hold_reason ?? ''}; events are refused and counted, never kept` };
  return { mark: stateMark('approved'), text: `COLLECTING under consent — kept ${d.retention_days ?? '—'} days` };
}
/** A field whitelist, in words (the type and its admitted values or bounds — never anything else). */
export function fieldsLine(fields: Record<string, Row>): string {
  const keys = Object.keys(fields);
  if (keys.length === 0) return 'no fields — the step, its outcome and its duration only';
  return keys.map((k) => {
    const s = fields[k] ?? {};
    const t = String(s['type']);
    return t === 'enum' ? `${k}: one of ${(s['values'] as string[]).join(' | ')}` : t === 'bool' ? `${k}: a flag` : `${k}: ${t} ${String(s['min'])}–${String(s['max'])}`;
  }).join('; ');
}
/** A comparison's claim, in words; a claim is made only when the interval supports it. */
export function claimLine(c: Row): string {
  const claim = String(c['claim'] ?? '');
  const iv = c['interval'] as Row | undefined;
  if (c['difference'] !== undefined) {
    return `${String(c['arm'])} vs control: ${(Number(c['difference']) * 100).toFixed(1)} pp (95 % ${iv ? `${(Number(iv['lo']) * 100).toFixed(1)} – ${(Number(iv['hi']) * 100).toFixed(1)} pp, Newcombe` : '—'}) — ${claim === 'better' ? 'BETTER' : claim === 'worse' ? 'WORSE' : claim.toUpperCase()}`;
  }
  return `${String(c['arm'])} vs control: median ${String(c['median'] ?? '—')} ms vs ${String(c['control_median'] ?? '—')} ms — ${claim === 'better' ? 'FASTER' : claim === 'worse' ? 'SLOWER' : claim.toUpperCase()}`;
}
/** An analysis verdict, in words. */
export function verdictLine(a: Pick<Analysis, 'verdict' | 'reasons'>): { mark: Mark; text: string } {
  if (a.verdict === 'valid') return { mark: stateMark('determinate'), text: 'VALID — the comparison below may be claimed as stated' };
  if (a.verdict === 'insufficient') return { mark: stateMark('indeterminate'), text: `INSUFFICIENT — no claim: ${a.reasons.join(' · ')}` };
  return { mark: stateMark('invalidated'), text: `INVALID — the experiment is invalidated: ${a.reasons.join(' · ')}` };
}
/** Whether both approvals are given (the owner's and the privacy officer's — two people). */
export function approvalsLine(e: Pick<Experiment, 'approvals'>): string {
  const of = (role: string) => e.approvals.find((a) => a.role === role);
  const say = (role: string, label: string) => { const a = of(role); return a === undefined ? `${label}: awaited` : `${label}: ${a.decision === 'approve' ? 'approved' : 'REJECTED'}`; };
  return `${say('product_analytics_owner', 'product analytics owner')} · ${say('privacy_officer', 'privacy officer')}`;
}
/** A DATE (a UTC day) as the day it names (never shifted by the viewer's zone). */
export const dayOf = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—');
/** The definitions of a journey that are held right now (the degraded state: measures qualified, unsafe acts disabled). */
export function heldOn(defs: Definition[], journeyKey: string): Definition[] {
  return defs.filter((d) => d.journey_key === journeyKey && d.state === 'approved' && d.collection === 'held');
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/analytics/experience`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'intelligence',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}
const R = 'analytics.read';
type W<K extends string> = Promise<ApiResult<{ [P in K]: Row } & { receipt: Receipt }>>;
export const experience = {
  self: (s: Scope) => p<SelfState & { receipt: Receipt }>(s, '/self/read', 'analytics.consent.read', 'ACN'),
  grant: (s: Scope, purposeKey: string) => p(s, '/consent/grant', 'analytics.consent.grant', 'ACN', { purposeKey }) as W<'consent'>,
  withdraw: (s: Scope, purposeKey: string) => p(s, '/consent/withdraw', 'analytics.consent.withdraw', 'ACN', { purposeKey }) as W<'consent'>,
  workspace: (s: Scope) => p<Workspace>(s, '/workspace', R, 'AJN'),
  /** the telemetry RECORD (202): the server decides — `{collected: false, reason: 'not_consented'}` is an answer, never an error */
  record: (s: Scope, b: { eventKey: string; outcome: string; durationMs?: number; fields?: Row; deviceClass?: string | null; locale?: string | null; experimentId?: string | null }) =>
    p<{ telemetry: Row; receipt: Receipt }>(s, '/telemetry/record', 'analytics.telemetry.record', 'ATE', b),
  define: (s: Scope, b: { eventKey: string; title: string; journeyKey: string; stepKey: string; fields: Row }) => p(s, '/telemetry/define', 'analytics.telemetry.define', 'ATD', b) as W<'definition'>,
  review: (s: Scope, id: string, b: { decision: 'approve' | 'reject'; reason: string; digest: string }) => p(s, `/telemetry/${id}/review`, 'analytics.telemetry.review', 'ATD', b, id) as W<'definition'>,
  hold: (s: Scope, id: string, reason: string) => p(s, `/telemetry/${id}/hold`, 'analytics.telemetry.hold', 'ATD', { reason }, id) as W<'definition'>,
  release: (s: Scope, id: string, reason: string) => p(s, `/telemetry/${id}/release`, 'analytics.telemetry.release', 'ATD', { reason }, id) as W<'definition'>,
  retire: (s: Scope, id: string, reason: string) => p(s, `/telemetry/${id}/retire`, 'analytics.telemetry.retire', 'ATD', { reason }, id) as W<'definition'>,
  purge: (s: Scope, reason: string) => p(s, '/telemetry/purge', 'analytics.telemetry.purge', 'APG', { reason }) as W<'purge'>,
  baseline: (s: Scope, b: { journeyKey: string; measure: string; stepKey?: string | null; segmentKey?: string | null; period: string }) => p(s, '/baselines/record', 'analytics.experience.baseline.record', 'ABL', b) as W<'baseline'>,
  proposeThreshold: (s: Scope, b: Row) => p(s, '/thresholds/propose', 'analytics.experience.threshold.propose', 'ATH', b) as W<'threshold'>,
  decideThreshold: (s: Scope, id: string, b: { decision: 'approve' | 'reject' | 'retire'; reason: string; digest?: string }) =>
    p(s, `/thresholds/${id}/decide`, b.decision === 'retire' ? 'analytics.experience.threshold.retire' : 'analytics.experience.threshold.decide', 'ATH', b, id) as W<'threshold'>,
  approveExperiment: (s: Scope, id: string, b: { role: 'product_analytics_owner' | 'privacy_officer'; decision: 'approve' | 'reject'; reason: string; digest: string }) =>
    p(s, `/experiments/${id}/approve`, 'analytics.experiment.approve', 'AEX', b, id) as W<'experiment'>,
  analyse: (s: Scope, id: string) => p(s, `/experiments/${id}/analyse`, 'analytics.experiment.analyse', 'AEX', {}, id) as W<'analysis'>,
  conclude: (s: Scope, id: string, b: { conclusion: 'adopt' | 'no_change' | 'inconclusive'; arm?: string | null; analysisId: string; analysisDigest: string; reason: string }) =>
    p(s, `/experiments/${id}/conclude`, 'analytics.experiment.conclude', 'AEX', b, id) as W<'experiment'>,
  assignment: (s: Scope, id: string) => p<{ assignment: Row; receipt: Receipt }>(s, `/experiments/${id}/assignment`, 'analytics.experiment.assignment.read', 'AEX', {}, id),
  proposeFinding: (s: Scope, b: { originKind: string; originId: string; journeyKey?: string | null; statement: string }) => p(s, '/findings/propose', 'analytics.experience.finding.propose', 'AFI', b) as W<'finding'>,
  preview: (s: Scope, id: string, kind: string | null, targetId: string | null) => p<{ preview: Row; receipt: Receipt }>(s, `/findings/${id}/preview`, R, 'AFI', { kind, targetId }, id),
  decide: (s: Scope, id: string, b: { decision: 'act' | 'dismiss'; kind?: string | null; targetId?: string | null; reason: string; findingDigest: string; previewDigest: string }) =>
    p(s, `/findings/${id}/decide`, 'analytics.experience.action.decide', 'AAC', b, id) as W<'action'>,
  exportCreate: (s: Scope, title: string) => p(s, '/exports/create', 'analytics.export.create', 'AXP', { title }) as W<'export'>,
  exportDownload: (s: Scope, id: string) => p<{ export: Row; receipt: Receipt }>(s, `/exports/${id}/download`, R, 'AXP', {}, id),
};
