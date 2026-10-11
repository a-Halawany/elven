/**
 * The domain-package client — CP-6 B33 §PK (0111 §PK; F-P4-15 ch.31/36: the certified package framework, the geopolitical, technology,
 * cyber and financial packages, the Domain Intelligence workspace WS-10).
 *
 * Every response is returned VERBATIM: the package and its versions, the five sections and who approved each at which digest (and until
 * when), the conformance / health / acceptance runs with their checks as the server measured them, the gate's answer per function (a
 * disabled function with its reason, a conflict with its reason), the migrations routed, the assessments with their source diversity, the
 * watchlists, events, alerts and links. The helpers below only WORD what the record says; nothing here certifies, measures or decides.
 * BOUNDARY: signing / publisher identity → B77; all-layer namespaces → B78; marketplace → B112; parity → B111; signed acceptance → R2.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export const SECTIONS = ['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary'] as const;
export const FUNCTIONS = ['assess', 'event', 'watch', 'alert', 'forecast', 'scenario', 'exposure', 'indicator'] as const;
export type GateStateName = 'active' | 'not_installed' | 'uncertified' | 'disabled' | 'conflicted';
export interface GateState { state: GateStateName; package_key: string; function: string | null; package_id: string | null; package_version: number | null; semver: string | null; reason: string }
export interface Check { check: string; passed: boolean; severity: 'blocking' | 'advisory'; findings: string[]; measured?: Row }
export interface PackageRow {
  package_id: string; package_key: string; domain_kind: string; title: string; owner_principal_id: string; owner_name: string | null; state: 'declared' | 'retired';
  created_at: string; retired_at: string | null; retire_reason: string | null;
  active: (Row & { version: number; semver: string; state: string; disabled_functions: Row; conflict: Row | null; activated_at: string }) | null;
  latest: (Row & { version: number; semver: string; state: string }) | null;
  conformance: { run_id: string; mode: string; passed: boolean; ran_at: string; version: number } | null;
  health: { run_id: string; passed: boolean; ran_at: string; version: number } | null;
  open_migrations: number;
}
export interface VersionRow {
  package_id: string; version: number; semver: string; state: string; manifest: Row; manifest_digest: string; disabled_functions: Record<string, Row>; conflict: Row | null;
  object_version: number | null; proposed_by: string; proposed_at: string; certified_by: string | null; certified_at: string | null; activated_by: string | null; activated_at: string | null;
  superseded_at: string | null; retired_at: string | null; proposed_by_name: string | null; certified_by_name: string | null;
}
export interface SectionState { state: 'open' | 'approved' | 'rejected' | 'expired'; digest: string; approver?: string; decided_at?: string; expires_at?: string; reason?: string; ontology_version_id?: string | null }
export interface RunRow { run_id: string; version: number; mode: string; suite_version: string; checks: Check[]; passed: boolean; run_by: string; run_by_kind: string; run_by_name: string | null; ran_at: string; facts_read_at: string }
export interface MigrationRow { migration_id: string; from_version: number; reason: string; functions: string[]; conflict: boolean; plan: string; state: string; item_id: string | null; opened_at: string; to_version: number | null; closed_at: string | null; close_reason: string | null }
export interface AssessmentRow {
  assessment_id: string; version: number; package_key: string; template: string; subject_entities: string[]; subjects: Array<{ entity_id: string; name: string; type: string }>;
  statement: string; confidence: number; evidence: Row[]; source_diversity: Row; material: boolean; state: string; limited_reason: string | null;
  proposed_by: string; proposed_by_kind: string; proposed_by_name: string | null; proposed_at: string; decided_by: string | null; decided_by_name: string | null; decided_at: string | null;
  decision_note: string | null; limited_at: string | null; superseded_at: string | null; object_version: number | null;
}
export interface WatchlistRow { watchlist_id: string; version: number; title: string; owner_principal_id: string; owner_name: string | null; entities: string[]; rules: Row[]; freshness_days: number; state: string; last_covered_at: string | null; read_at: string }
export interface AlertRow {
  alert_id: string; watchlist_id: string; rule_key: string; cause_kind: string; cause_id: string; title: string; state: string; withheld_reason: string | null; item_id: string | null;
  item_state_now: string | null; item_route_roles: string[] | null; owner_name: string | null; adjudication: string | null; resolved_at: string | null; resolve_reason: string | null; raised_at: string;
}
export interface EventRow { event_id: string; kind: string; title: string; subject_entities: string[]; occurred_on: string; state: string; proposed_by_kind: string; decided_at: string | null; decision_note: string | null }
export interface LinkRow { link_id: string; link_kind: string; target_id: string; assessment_id: string | null; note: string; state: string; linked_at: string }
export interface ItemRow { item_id: string; signal_class: string; subject_kind: string; subject_id: string; title: string; state: string; route_roles: string[]; policy_version: number | null; created_at: string }
export interface LedgerRow { event_id: string; subject_kind: string; event: string; actor_name: string | null; occurred_at: string; version: number | null; details: Row }
export interface PackageView {
  package: Row & { package_id: string; package_key: string; domain_kind: string; title: string; state: string; owner_principal_id: string; owner_name: string | null };
  versions: VersionRow[]; sections: Record<string, Record<string, SectionState>>; gates: Record<string, GateState>; runs: RunRow[]; migrations: MigrationRow[]; ledger: LedgerRow[];
  links: LinkRow[]; assessments: AssessmentRow[]; watchlists: WatchlistRow[]; alerts: AlertRow[]; events: EventRow[]; items: ItemRow[]; read_at: string; boundary: string;
}
export interface Definition { key: string; kind: string; title: string; clause: string; focus: string; inputs: { real_public: string[]; synthetic: string[]; licensed_for_acceptance: string[] } | undefined }

/* ───────────── the words ───────────── */
/** A gate state as a glyph, a token and words — never colour alone; a disabled or conflicted function is never softened. */
export function gateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'active': return { glyph: '●', token: '--eye-color-success', text: 'ACTIVE' };
    case 'disabled': return { glyph: '⊘', token: '--eye-color-critical', text: 'DISABLED' };
    case 'conflicted': return { glyph: '⚑', token: '--eye-color-critical', text: 'CONFLICTED' };
    case 'uncertified': return { glyph: '◌', token: '--eye-color-warning', text: 'NOT CERTIFIED' };
    case 'not_installed': return { glyph: '○', token: '--eye-color-ink-muted', text: 'NOT INSTALLED' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** A version state in words. */
export function versionMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'active': return { glyph: '●', token: '--eye-color-success', text: 'ACTIVE' };
    case 'certified': return { glyph: '◉', token: '--eye-color-accent-strong', text: 'CERTIFIED (not yet active)' };
    case 'proposed': return { glyph: '◌', token: '--eye-color-warning', text: 'PROPOSED (certification pending)' };
    case 'superseded': return { glyph: '○', token: '--eye-color-ink-muted', text: 'SUPERSEDED' };
    case 'retired': return { glyph: '✕', token: '--eye-color-ink-muted', text: 'RETIRED' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** A run's verdict and its failing blocking checks, in one line. */
export function runLine(r: Pick<RunRow, 'mode' | 'passed' | 'checks' | 'run_by_kind'>): string {
  const failed = r.checks.filter((c) => c.severity === 'blocking' && !c.passed).map((c) => c.check);
  const head = `${r.mode.toUpperCase()} ${r.passed ? 'PASSED' : 'FAILED'}`;
  const by = r.run_by_kind === 'agent' ? ' — an agent\'s run (diagnostic; it certifies nothing)' : '';
  return failed.length === 0 ? `${head}${by}` : `${head}: ${failed.join(', ')}${by}`;
}
/** A section's standing decision in words (who, until when — an expired approval is said). */
export function sectionLine(name: string, s: SectionState | undefined): string {
  if (s === undefined || s.state === 'open') return `${name}: OPEN — awaiting a domain specialist`;
  const until = s.expires_at === undefined ? '' : ` until ${String(s.expires_at).slice(0, 10)}`;
  if (s.state === 'expired') return `${name}: EXPIRED (approved, the approval lapsed${until})`;
  return `${name}: ${s.state.toUpperCase()}${s.state === 'approved' ? until : ''}${s.ontology_version_id ? ' — with the steward\'s ontology version' : ''}`;
}
/** The source diversity an assessment rests on, in words (correlated and single-origin sources are said). */
export function diversityLine(d: Row | null | undefined): string {
  if (d === null || d === undefined) return '—';
  const corr = Array.isArray(d['correlated_publishers']) && (d['correlated_publishers'] as string[]).length > 0 ? `; correlated: ${(d['correlated_publishers'] as string[]).join(', ')}` : '';
  const single = d['single_origin'] === true ? '; single origin' : '';
  return `${String(d['publishers'] ?? 0)} publisher(s), ${String(d['contracts'] ?? 0)} contract(s), threshold ${String(d['threshold'] ?? '—')} — ${d['meets'] === true ? 'meets' : 'BELOW the threshold'}${corr}${single}`;
}
/** A watchlist's coverage: FRESH or STALE against its freshness (the read's instant, never the client's). */
export function coverageLine(w: Pick<WatchlistRow, 'last_covered_at' | 'freshness_days' | 'read_at'>): { stale: boolean; text: string } {
  if (w.last_covered_at === null) return { stale: true, text: 'NO COVERAGE — no approved assessment or confirmed event on its entities yet' };
  const days = Math.floor((Date.parse(w.read_at) - Date.parse(w.last_covered_at)) / 86_400_000);
  return days > w.freshness_days ? { stale: true, text: `STALE — last covered ${days} day(s) ago (freshness ${w.freshness_days} days)` } : { stale: false, text: `fresh — last covered ${days} day(s) ago (freshness ${w.freshness_days} days)` };
}
/** A measured value for display (numbers as they are; arrays counted; objects summarised). */
export function measuredLine(m: Row | undefined): string {
  if (m === undefined) return '';
  return Object.entries(m).filter(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v)).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v === null ? '—' : String(v)}`).join(' · ');
}
/** A DATE as the day it names (never shifted by the viewer's zone). */
export const dayOf = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—');

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/domain-packages`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'intelligence',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}
const R = 'domain.package.read';
export const packages = {
  list: (s: Scope) => p<{ packages: PackageRow[]; definitions: Definition[]; read_at: string; boundary: string; receipt: Receipt }>(s, '/list', R, 'DPG'),
  read: (s: Scope, id: string) => p<PackageView & { receipt: Receipt }>(s, `/${id}/read`, R, 'DPG', {}, id),
  facts: (s: Scope, id: string, version: number) => p<{ version: number; facts: Row; acceptance: Row }>(s, `/${id}/facts`, R, 'DPG', { version }, id),
  declare: (s: Scope, b: { key: string; kind: string; title: string; owner?: string }) => p<{ package: Row; receipt: Receipt }>(s, '/declare', 'domain.package.declare', 'DPG', b),
  propose: (s: Scope, id: string, semver: string, manifest: Row) => p<{ version: Row; receipt: Receipt }>(s, `/${id}/versions/propose`, 'domain.package.version', 'DPG', { semver, manifest }, id),
  approve: (s: Scope, id: string, b: { version: number; section: string; digest: string; decision: 'approved' | 'rejected'; reason: string; validDays?: number }) =>
    p<{ approval: Row; receipt: Receipt }>(s, `/${id}/sections/approve`, 'domain.package.approve', 'DPG', b, id),
  conformance: (s: Scope, id: string, version: number, mode: 'certification' | 'diagnostic') => p<{ run: RunRow; receipt: Receipt }>(s, `/${id}/conformance/run`, 'domain.package.conformance', 'DPG', { version, mode }, id),
  certify: (s: Scope, id: string, version: number, reason: string) => p<{ version: Row; receipt: Receipt }>(s, `/${id}/versions/${version}/certify`, 'domain.package.certify', 'DPG', { reason }, id),
  activate: (s: Scope, id: string, version: number) => p<{ version: Row; receipt: Receipt }>(s, `/${id}/versions/${version}/activate`, 'domain.package.activate', 'DPG', {}, id),
  withdraw: (s: Scope, id: string, version: number, reason: string) => p<{ version: Row; receipt: Receipt }>(s, `/${id}/versions/${version}/withdraw`, 'domain.package.withdraw', 'DPG', { reason }, id),
  retire: (s: Scope, id: string, reason: string) => p<{ package: Row; receipt: Receipt }>(s, `/${id}/retire`, 'domain.package.retire', 'DPG', { reason }, id),
  health: (s: Scope, id: string) => p<{ health: Row; receipt: Receipt }>(s, `/${id}/health/run`, 'domain.package.health', 'DPG', {}, id),
  enable: (s: Scope, id: string, version: number, b: { functions: string[]; clearConflict: boolean; reason: string }) => p<{ enabled: Row; receipt: Receipt }>(s, `/${id}/versions/${version}/enable`, 'domain.package.enable', 'DPG', b, id),
  acceptance: (s: Scope, id: string) => p<{ run: RunRow; receipt: Receipt }>(s, `/${id}/acceptance/run`, 'domain.package.acceptance', 'DPG', {}, id),
  proposeAssessment: (s: Scope, b: { packageKey: string; template: string; subjects: string[]; statement: string; confidence: number; evidence: Row[]; material?: boolean; assessmentId?: string }) =>
    p<{ assessment: Row; receipt: Receipt }>(s, '/assessments/propose', 'domain.assessment.propose', 'DAS', b),
  decideAssessment: (s: Scope, id: string, version: number, decision: 'approve' | 'reject', note: string) =>
    p<{ assessment: Row; receipt: Receipt }>(s, `/assessments/${id}/decide`, 'domain.assessment.approve', 'DAS', { version, decision, note }, id),
  limitAssessment: (s: Scope, id: string, reason: string) => p<{ assessment: Row; receipt: Receipt }>(s, `/assessments/${id}/limit`, 'domain.assessment.limit', 'DAS', { reason }, id),
  readAssessment: (s: Scope, id: string, asOf: string | null) => p<{ versions: Row[]; as_of: Row | null; read_at: string }>(s, `/assessments/${id}/read`, R, 'DAS', asOf === null ? {} : { asOf }, id),
  declareWatchlist: (s: Scope, b: Row) => p<{ watchlist: Row; receipt: Receipt }>(s, '/watchlists/declare', 'domain.watchlist.declare', 'DPG', b),
  retireWatchlist: (s: Scope, id: string, reason: string) => p<{ watchlist: Row; receipt: Receipt }>(s, `/watchlists/${id}/retire`, 'domain.watchlist.retire', 'DPG', { reason }),
  resolveAlerts: (s: Scope, watchlistId: string, reason: string) => p<{ resolution: Row; receipt: Receipt }>(s, `/watchlists/${watchlistId}/resolve`, 'domain.alert.resolve', 'DPG', { reason }),
  confirmEvent: (s: Scope, id: string, decision: 'confirm' | 'reject', note: string) => p<{ event: Row; receipt: Receipt }>(s, `/events/${id}/confirm`, 'domain.event.confirm', 'DPG', { decision, note }),
  adjudicate: (s: Scope, id: string, adjudication: 'true_positive' | 'false_positive', note: string) => p<{ alert: Row; receipt: Receipt }>(s, `/alerts/${id}/adjudicate`, 'domain.alert.adjudicate', 'DPG', { adjudication, note }),
  withdrawLink: (s: Scope, id: string, reason: string) => p<{ link: Row; receipt: Receipt }>(s, `/links/${id}/withdraw`, 'domain.link.withdraw', 'DPG', { reason }),
};
