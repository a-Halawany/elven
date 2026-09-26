/**
 * Stream processors API client — CP-6 B28 (0088 §S, F-P4-11: event-time windows, watermarks, CEP rules).
 *
 * Every response is returned VERBATIM. The screen's one rule: LATENESS AND PARTIALITY ARE NEVER HIDDEN. A window's completeness and a
 * signal's label are rendered exactly as the server recorded them (a LATE badge for a window revised or excluded by late data, a
 * PARTIAL badge for a window over an incomplete range or with missing days), and a signal is presented as current only when the server
 * says so (`presented_as: 'current'` — its processor running, the standing emission of its window, not retracted).
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type ProcessorState = 'running' | 'suspended' | 'stalled' | 'corrupt' | 'recovering' | 'retired';
export type Completeness = 'complete' | 'partial_incomplete_range' | 'partial_missing_days' | 'late_revised' | 'late_excluded';
export type SignalLabel = 'on_time' | 'late_window' | 'partial_window' | 'recovered';

export interface StreamRule {
  rule_id: string; rule_key: string; version: number; title: string; series_key: string; source_key: string; partition: string | null;
  window_kind: 'tumbling' | 'sliding'; window_days: number; slide_days: number; window_origin: string;
  allowed_lateness: string | Record<string, number>; watermark_lag: string | Record<string, number>; stall_after: string | Record<string, number>;
  predicate: { comparator: 'lt' | 'le' | 'gt' | 'ge'; threshold: number; min_hits: number }; consequence_class: string; checkpoint_every: number;
  rule_digest: string; state: 'draft' | 'active' | 'superseded' | 'retired'; state_reason: string | null; owner_principal_id: string;
}
export interface StreamProcessor {
  processor_id: string; processor_identity: string; rule_id: string; rule_digest: string; topology_version: string; source_id: string; partition_key: string | null;
  state: ProcessorState; state_reason: string | null; state_since: string; watermark: string | null; max_event_time: string | null; input_seq: number; inputs: number;
  source_offsets: { streams?: Array<Record<string, unknown>>; missing?: Array<Record<string, unknown>>; diverged?: boolean; checked_at?: string };
  last_input_at: string | null; last_watermark_move_at: string | null; last_checkpoint_id: string | null; state_digest: string; started_at: string;
  outputs_current: boolean; rule?: StreamRule | null;
  counts?: { signals: Record<string, number>; labels: Record<string, number>; windows: Record<string, number>; completeness: Record<string, number> };
}
export interface WindowValue { n?: number; expected_days?: number; hits?: number; min?: number | null; max?: number | null; mean?: number | null; days?: Record<string, number>; holds?: boolean | null }
export interface StreamWindow {
  window_start: string; window_end: string; status: 'open' | 'fired' | 'revised' | 'closed'; completeness: Completeness; incomplete_range_ids: string[];
  value: WindowValue; holds: boolean | null; late_inputs: number; late_excluded: number; revision: number;
}
export interface StreamSignal {
  signal_id: string; signal_seq: number; window_start: string; window_end: string; revision: number; emission: 'fired' | 'revised' | 'retracted';
  label: SignalLabel; retracts: string | null; retraction_kind: 'state_corrupt' | 'operator' | null; value: WindowValue; holds: boolean | null; completeness: Completeness;
  incomplete_range_ids: string[]; lateness: { late_inputs?: number; max_lateness?: string | null; inputs?: Array<Record<string, unknown>> };
  watermark: string | null; reason: string | null; emitted_at: string;
  presented_as: string; current?: boolean; retraction?: { signal_id: string; reason: string; kind: string; at: string } | null;
  candidate?: { candidate_id: string; state: string; warning_id: string | null } | null;
}
export interface StreamInput {
  input_id: string; input_seq: number; event_key: string; evd_object_id: string; evd_version: number; event_time: string; value: number; arrived_at: string;
  watermark_at_arrival: string | null; lateness: 'on_time' | 'late_within_allowance' | 'late_beyond_allowance'; lateness_by: string | Record<string, number> | null;
  disposition: 'new' | 'duplicate' | 'revision'; prior_value: number | null;
}
export interface StreamDetail {
  processor: StreamProcessor; rule: StreamRule | null; windows: StreamWindow[]; signals: StreamSignal[];
  checkpoints: Array<{ checkpoint_id: string; checkpoint_seq: number; watermark: string | null; input_seq: number; signal_hw: number; state_digest: string; reason: string; taken_at: string }>;
  events: Array<{ event: string; occurred_at: string; details: Record<string, unknown> }>; inputs: StreamInput[];
  candidates: Array<{ candidate_id: string; origin_key: string; state: string; title: string; warning_id: string | null }>;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction/streams`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'SPR', object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const streams = {
  list: (s: Scope) => p<{ processors: StreamProcessor[]; rules: StreamRule[]; receipt: Receipt }>(s, '/processors/list', 'prediction.read'),
  get: (s: Scope, processorId: string) => p<{ stream: StreamDetail; receipt: Receipt }>(s, `/processors/${processorId}/get`, 'prediction.read', {}, processorId),
  start: (s: Scope, ruleId: string) => p<{ processor: StreamProcessor; receipt: Receipt }>(s, '/processors/start', 'prediction.stream.processor.start', { ruleId }),
  /** Human-gated: the newest compatible checkpoint restored, the stored inputs after it replayed. */
  recover: (s: Scope, processorId: string, reason: string) =>
    p<{ recovery: Record<string, unknown>; receipt: Receipt }>(s, `/processors/${processorId}/recover`, 'prediction.stream.processor.recover', { reason }, processorId),
  reconcile: (s: Scope, processorId: string) =>
    p<{ reconciliation: Record<string, unknown>; receipt: Receipt }>(s, `/processors/${processorId}/reconcile`, 'prediction.stream.processor.reconcile', {}, processorId),
  /** Human-gated: a retraction row of its own, the reason stated; nothing is submitted. */
  retract: (s: Scope, signalId: string, reason: string) =>
    p<{ retraction: Record<string, unknown>; receipt: Receipt }>(s, `/signals/${signalId}/retract`, 'prediction.stream.signal.retract', { reason }, signalId),
};

/* ───────────── the arithmetic the screen shows (the server decides; this only says it) ───────────── */

/** A window as days: [start, end) with its last day. */
export function windowDays(w: { window_start: string; window_end: string }): { from: string; through: string } {
  const from = w.window_start.slice(0, 10);
  const through = new Date(Date.parse(w.window_end) - 86_400_000).toISOString().slice(0, 10);
  return { from, through };
}
/** The badges of a window's completeness: LATE and PARTIAL are separate, and a late input counts even when the window is otherwise complete. */
export function completenessBadges(w: { completeness: Completeness; late_inputs?: number; late_excluded?: number }): Array<{ text: 'LATE' | 'PARTIAL'; why: string }> {
  const out: Array<{ text: 'LATE' | 'PARTIAL'; why: string }> = [];
  if (w.completeness === 'partial_incomplete_range') out.push({ text: 'PARTIAL', why: 'over an explicit incomplete range of the stream — never complete' });
  if (w.completeness === 'partial_missing_days') out.push({ text: 'PARTIAL', why: 'fewer observed days than the window spans' });
  if (w.completeness === 'late_revised' || (w.late_inputs ?? 0) > 0) out.push({ text: 'LATE', why: `${w.late_inputs ?? 0} input(s) arrived after the watermark passed; the window was revised` });
  if (w.completeness === 'late_excluded' || (w.late_excluded ?? 0) > 0) out.push({ text: 'LATE', why: `${w.late_excluded ?? 0} input(s) arrived beyond the allowed lateness: stored and shown, not evaluated` });
  return out.filter((b, i) => out.findIndex((x) => x.text === b.text && x.why === b.why) === i);
}
/** The predicate's answer in words: holds, does not hold, or undetermined (the missing days could decide it). */
export function holdsText(h: boolean | null | undefined): string {
  return h === true ? '✓ holds' : h === false ? '✕ does not hold' : '? undetermined — the missing days could decide it';
}
/** A Postgres interval as the driver hands it back ({days, hours, …} or a string) in plain words. */
export function intervalText(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, number>;
    const parts = (['years', 'months', 'days', 'hours', 'minutes', 'seconds'] as const).filter((k) => typeof o[k] === 'number' && o[k] !== 0).map((k) => `${o[k]} ${k}`);
    return parts.length === 0 ? '0' : parts.join(' ');
  }
  return String(v);
}
export const LABEL_TEXT: Record<SignalLabel, string> = {
  on_time: 'on time', late_window: 'LATE window — revised by data that arrived after it fired', partial_window: 'PARTIAL window — not complete', recovered: 'recovered — re-derived by a recovery replay',
};
