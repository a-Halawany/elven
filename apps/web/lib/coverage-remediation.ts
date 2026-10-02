/**
 * CP-6 B28 client — THE REMEDIATION WORKFLOW ON SOURCE COVERAGE LOSS (migration 0088 §R; the B24 carryover (a)).
 *
 * A source.coverage_loss attention item is answered by a REMEDIATION: opened from the item by its owner or a collection manager, owned
 * by a named collection manager (or domain administrator), carrying the GAP (the loss window from the item's arrival, and the source's
 * blind-spot / degraded-region measurements — or their declared absence), the STEPS and the CLOSURE:
 *
 *   * fallback_source   an active, healthy source of the domain the loss falls back to (the owner or a collection manager);
 *   * recollect         NAMES a collection run of this source started since the opening — triggered through the existing collection
 *                       path (the source's page: Collect now); the remediation never starts or schedules a run itself;
 *   * accept_gap        a reason, recorded by a SECOND person — never the remediation's owner — holding collection_manager or
 *                       domain_admin (separation of duties).
 *
 * It closes RECOVERED only while the source is healthy (automatically when the source-health subscriber applies the recovery) or GAP
 * ACCEPTED only through a recorded accept_gap step; one remediation per source is open at a time. The server judges every rule and
 * refuses in its own words (`coverage remediation rejected (<class>): …`); the helpers here only word what it recorded.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

/** The remediation's states (observation.coverage_remediations CHECK); the first two are OPEN (one per source). */
export const REMEDIATION_STATES = ['open', 'in_progress', 'closed_recovered', 'closed_gap_accepted', 'withdrawn'] as const;
export const OPEN_STATES = ['open', 'in_progress'] as const;
export const STEP_KINDS = ['fallback_source', 'recollect', 'accept_gap'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const CLOSURE_KINDS = ['recovered', 'gap_accepted'] as const;
export type ClosureKind = (typeof CLOSURE_KINDS)[number];
/** The roles the server admits to accept a gap (the port re-checks; never the remediation's owner). */
export const GAP_ACCEPTOR_ROLES = ['collection_manager', 'domain_admin'] as const;

/** The source's health as the records stand, with what says so. */
export interface HealthNow { state: string; at: string | null; basis: string; ref: string | null }
export interface Step {
  step: number; kind: StepKind | string; reason: string; by: string; at: string; event_id: string;
  fallback_source_id?: string; fallback_source_key?: string; fallback_name?: string; fallback_health?: HealthNow;
  run_id?: string; run_state?: string; run_started_at?: string | null; run_finished_at?: string | null; items_admitted?: number; owner?: string;
}
export interface Measurement { state: string; reason?: string; measurement_id?: string; value_numeric?: number | null; value_text?: string | null; window_start?: string; window_end?: string; evaluated_at?: string }
export interface Closure { kind: 'recovered' | 'gap_accepted' | 'withdrawn' | string; by: string; at: string; automatic: boolean; health?: HealthNow; health_event?: string; accepted_by?: string; note?: string | null; reason?: string }
export interface Remediation {
  remediation_id: string; source_id: string; item_id: string; owner_principal_id: string; opened_by: string; state: string;
  health_at_opening: HealthNow; gap_from: string | null; gap_to: string | null;
  gap: { window?: { from: string | null; to: string | null }; measurements?: Record<string, Measurement>; health_state?: string; item_title?: string };
  steps: Step[]; closure: Closure | null; reason: string; opened_at: string | null; updated_at: string | null; closed_at: string | null;
  events: Array<{ event_id: string; event: string; actor_principal_id: string; details: Record<string, unknown>; occurred_at: string | null }>;
}
export interface SourceRemediations { source_id: string; source_name: string | null; source_key: string | null; health_now: HealthNow; remediations: Remediation[] }
/** What a write answers (the port's own jsonb). */
export type Answer = Record<string, unknown> & { remediation_id: string; state: string };

/** Open (open or in_progress): one per source. */
export const isOpen = (state: string): boolean => (OPEN_STATES as readonly string[]).includes(state);

/** A remediation state in three channels (glyph, word, colour token) — never colour alone. */
export function remediationMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'open': return { glyph: '◌', token: '--eye-color-warning', text: 'OPEN' };
    case 'in_progress': return { glyph: '◐', token: '--eye-color-warning', text: 'IN PROGRESS' };
    case 'closed_recovered': return { glyph: '●', token: '--eye-color-success', text: 'CLOSED — SOURCE RECOVERED' };
    case 'closed_gap_accepted': return { glyph: '■', token: '--eye-color-uncertain', text: 'CLOSED — GAP ACCEPTED' };
    case 'withdrawn': return { glyph: '○', token: '--eye-color-ink-muted', text: 'WITHDRAWN' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: state.toUpperCase() };
  }
}

/** One step, in words (the server's record). */
export function stepLine(s: Step): string {
  switch (s.kind) {
    case 'fallback_source': return `fallback to ${s.fallback_name ?? s.fallback_source_key ?? s.fallback_source_id ?? 'a source'}${s.fallback_health?.state === undefined ? '' : ` (${s.fallback_health.state})`}`;
    case 'recollect': return `re-collection run ${s.run_id ?? '—'}${s.run_state === undefined ? '' : ` (${s.run_state}${typeof s.items_admitted === 'number' ? `, ${s.items_admitted} admitted` : ''})`}`;
    case 'accept_gap': return 'gap accepted by a second person';
    default: return String(s.kind);
  }
}

/** A measured gap dimension in words: the measurement's state, or its declared absence. */
export function measurementLine(dim: string, m: Measurement | undefined): string {
  if (m === undefined) return `${dim}: not reported`;
  if (m.state === 'absent') return `${dim}: absent — ${m.reason ?? 'no measurement recorded'}`;
  const value = m.value_text ?? (m.value_numeric === null || m.value_numeric === undefined ? null : String(m.value_numeric));
  return `${dim}: ${m.state}${value === null ? '' : ` (${value})`}${m.window_start === undefined ? '' : ` over ${m.window_start} → ${m.window_end ?? '…'}`}`;
}

/** How it closed, in words. */
export function closureLine(c: Closure | null): string {
  if (c === null) return 'open';
  if (c.kind === 'recovered') return c.automatic ? 'closed automatically: the source-health subscriber applied the recovery' : `closed recovered by a person (the source ${c.health?.state ?? 'healthy'} per ${c.health?.basis ?? 'the records'})`;
  if (c.kind === 'gap_accepted') return 'closed on the gap accepted by a second person';
  if (c.kind === 'withdrawn') return `withdrawn — ${c.reason ?? ''}`.trim();
  return String(c.kind);
}

/** The open payload: only what is set; the owner defaults to the opener on the server. */
export function openPayload(itemId: string, owner: string, reason: string): Record<string, unknown> {
  const out: Record<string, unknown> = { itemId, reason: reason.trim() };
  if (owner.trim() !== '') out['owner'] = owner.trim();
  return out;
}
/** The step payload: the fields of the chosen kind only. */
export function stepPayload(kind: StepKind, reason: string, ref: string): Record<string, unknown> {
  const out: Record<string, unknown> = { kind, reason: reason.trim() };
  if (kind === 'fallback_source' && ref.trim() !== '') out['fallbackSourceId'] = ref.trim();
  if (kind === 'recollect' && ref.trim() !== '') out['runId'] = ref.trim();
  return out;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, sourceId: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'SRC', object_id: sourceId,
    purpose_id: 'observation', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const remediation = {
  /** The remediations of one source (the open one first), with their ledgers and the source's health now. An audited read. */
  list: (s: Scope, sourceId: string, state: string | null = null) =>
    p<SourceRemediations & { receipt: Receipt }>(s, `/observation/sources/${sourceId}/remediations/list`, 'observation.coverage_remediation.read', sourceId, state === null || state === '' ? {} : { state }),
  /** Human-gated: the item's owner or a collection manager; the server judges the item, the owner and the source's health. */
  open: (s: Scope, sourceId: string, itemId: string, owner: string, reason: string) =>
    p<{ remediation: Answer; receipt: Receipt }>(s, `/observation/sources/${sourceId}/remediations/open`, 'observation.coverage_remediation.open', sourceId, openPayload(itemId, owner, reason)),
  step: (s: Scope, sourceId: string, remediationId: string, kind: StepKind, reason: string, ref: string) =>
    p<{ remediation: Answer; receipt: Receipt }>(s, `/observation/sources/${sourceId}/remediations/${remediationId}/step`, 'observation.coverage_remediation.step', sourceId, stepPayload(kind, reason, ref)),
  close: (s: Scope, sourceId: string, remediationId: string, kind: ClosureKind, note: string) =>
    p<{ remediation: Answer; receipt: Receipt }>(s, `/observation/sources/${sourceId}/remediations/${remediationId}/close`, 'observation.coverage_remediation.close', sourceId, note.trim() === '' ? { kind } : { kind, note: note.trim() }),
  withdraw: (s: Scope, sourceId: string, remediationId: string, reason: string) =>
    p<{ remediation: Answer; receipt: Receipt }>(s, `/observation/sources/${sourceId}/remediations/${remediationId}/withdraw`, 'observation.coverage_remediation.withdraw', sourceId, { reason: reason.trim() }),
};
