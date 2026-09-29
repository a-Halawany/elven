/**
 * CP-6 B29 §C (0092) client — THE METHOD FABRIC: the method portfolio (the registry rows, whether this server carries the pinned
 * bytes, each adapter's health in the domain), a twin's method bindings, a method-fabric run (POST …/twins/simulations/run with
 * `modelRef` and `params`), and a method steward's probe and reinstatement of a quarantined adapter. Every act goes through the
 * governed envelope; the server decides and the screen shows its answer verbatim. Pure helpers below are unit-tested (methods.test.ts).
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export type MethodFamily = 'flow' | 'discrete-event' | 'system-dynamics' | 'agent-based' | 'optimisation' | 'war-gaming' | 'counterfactual';
export interface Containment { isolated: boolean; timeout_ms: number; max_old_space_mb: number; quarantine_after: number }
export interface AdapterHealth {
  state: 'healthy' | 'quarantined'; consecutive_faults: number; total_faults: number; last_fault?: { kind: string; message: string; run_id: string | null; probe_id: string | null; at: string } | null;
  last_fault_at?: string | null; quarantined_at?: string | null; last_probe_passed_at?: string | null; reinstated_at?: string | null; reinstated_by?: string | null;
}
export interface MethodRow {
  method_ref: string; name: string; family: MethodFamily; adapter: string; containment: Containment; required_inputs: string[];
  parameter_schema: Record<string, unknown>; operating_envelope: Record<string, unknown>; implementation_digest: string | null;
  /** whether this server carries an implementation of the model, and the same bytes the registry pins */
  carried: boolean; carried_digest_matches: boolean; health: AdapterHealth;
}
export interface Binding {
  binding_id: string; twin_id: string; model_ref: string; family: MethodFamily; state: 'active' | 'unbound'; reason: string | null;
  bound_by: string; bound_at: string; unbound_by: string | null; unbound_at: string | null; unbind_reason: string | null;
}
export interface GateVerdict { outcome: 'satisfied' | 'violated' | 'indeterminate'; setId: string | null; setVersion: number | null; violations: Array<Record<string, unknown>>; reason: string | null }
export interface MethodRunAnswer {
  runId: string; state: string; modelRef: string; implementationDigest: string; outputsDigest: string; summary: Record<string, string | number | boolean | null>;
  days: number; isolated: boolean; pid: number | null; constraint: GateVerdict | null; openingConstraint: GateVerdict | null;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'simulation', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const methods = {
  list: (s: Scope) => p<{ methods: MethodRow[]; receipt: Receipt }>(s, '/methods/list', 'simulation.read', 'SIM'),
  bindings: (s: Scope, twinId: string | null) => p<{ bindings: Binding[]; receipt: Receipt }>(s, '/methods/bindings/list', 'simulation.read', 'SIM', twinId === null ? {} : { twinId }),
  /** The twin's OWNER binds a method; the server refuses a family outside the twin's approved uses, a method bound already, another person. */
  bind: (s: Scope, twinId: string, modelRef: string, reason: string) =>
    p<{ binding: Binding; receipt: Receipt }>(s, '/methods/bind', 'simulation.method.bind', 'TWN', { twinId, modelRef, reason }, twinId),
  unbind: (s: Scope, twinId: string, modelRef: string, reason: string) =>
    p<{ binding: Binding; receipt: Receipt }>(s, '/methods/unbind', 'simulation.method.unbind', 'TWN', { twinId, modelRef, reason }, twinId),
  health: (s: Scope, modelRef: string) =>
    p<{ adapter: { model_ref: string; health: AdapterHealth; events: Array<Record<string, unknown>>; probes: Array<Record<string, unknown>> }; receipt: Receipt }>(s, '/methods/health', 'simulation.read', 'SIM', { modelRef }),
  /** A METHOD STEWARD probes a contained adapter on its fixed probe input (executed out of process); a failing probe is a fault. */
  probe: (s: Scope, modelRef: string) =>
    p<{ probe: { probe_id: string; passed: boolean; outputs_digest: string | null; state: string; fault: Record<string, unknown> | null }; receipt: Receipt }>(s, '/methods/probe', 'simulation.adapter.probe', 'SIM', { modelRef }),
  /** Human-gated: a method steward — never the operator of the last faulted run — reinstates after a probe passed since the last fault. */
  reinstate: (s: Scope, modelRef: string, reason: string) =>
    p<{ adapter: { model_ref: string; state: string; reinstated_at: string; probe_id: string }; receipt: Receipt }>(s, '/methods/reinstate', 'simulation.adapter.reinstate', 'SIM', { modelRef, reason }),
  /** A method-fabric run: a control run of a bound method with its parameters (the adapter judges them at opening). */
  run: (s: Scope, payload: Record<string, unknown>) => p<{ run: MethodRunAnswer; receipt: Receipt }>(s, '/twins/simulations/run', 'simulation.run', 'SIM', payload),
};

// ───────────────────────── pure helpers ─────────────────────────

const FAMILY_LABELS: Record<MethodFamily, string> = {
  'flow': 'flow (daily supply flow)', 'discrete-event': 'discrete-event', 'system-dynamics': 'system dynamics', 'agent-based': 'agent-based',
  'optimisation': 'optimisation', 'war-gaming': 'war-gaming', 'counterfactual': 'counterfactual',
};
export function familyLabel(f: string): string { return (FAMILY_LABELS as Record<string, string>)[f] ?? f; }

/** The containment in words: where and under what bounds the adapter runs, and how many consecutive faults quarantine it. */
export function containmentLine(c: Containment): string {
  return c.isolated
    ? `out of process · ${c.timeout_ms / 1000} s · ${c.max_old_space_mb} MB heap · quarantined after ${c.quarantine_after} consecutive faults`
    : 'in process (not contained)';
}

/** The adapter's health as the record states it — never a state derived here. */
export function healthLine(h: AdapterHealth): { text: string; token: string; glyph: string } {
  if (h.state === 'quarantined') {
    const kind = h.last_fault?.kind ?? 'unknown';
    return { text: `QUARANTINED after ${h.consecutive_faults} consecutive faults (last: ${kind}) — a method steward reinstates it after a passing probe`, token: '--eye-color-critical', glyph: '⛔' };
  }
  if (h.consecutive_faults > 0) return { text: `healthy · ${h.consecutive_faults} consecutive fault${h.consecutive_faults === 1 ? '' : 's'} (last: ${h.last_fault?.kind ?? 'unknown'})`, token: '--eye-color-warning', glyph: '△' };
  return { text: h.total_faults > 0 ? `healthy · ${h.total_faults} fault${h.total_faults === 1 ? '' : 's'} in its history` : 'healthy', token: '--eye-color-success', glyph: '●' };
}

/** §D's verdict on a run as the run records it: indeterminate is never shown as satisfied. */
export function verdictLine(v: GateVerdict | null | undefined): string {
  if (v === null || v === undefined) return 'no constraint verdict recorded';
  if (v.outcome === 'satisfied') return `constraints satisfied (${v.setId ?? 'no set named'}${v.setVersion === null ? '' : ` v${v.setVersion}`})`;
  if (v.outcome === 'violated') return `constraints VIOLATED: ${v.violations.map((x) => `${String(x['constraintKey'])} — bound ${String(x['bound'])}, observed ${String(x['observed'])}`).join('; ')}`;
  return `constraints INDETERMINATE — not a pass: ${v.reason ?? 'no reason given'}`;
}

/** The demonstration's parameters per method (the Regensburg line under the 21-day bearing shortage), as editable JSON. */
export function paramsTemplate(modelRef: string): string {
  const shortage = { start_day: 7, days: 21, fraction: 0.4 };
  const t: Record<string, Record<string, unknown>> = {
    'discrete-event@1': { start_date: '2026-10-05', shortage },
    'system-dynamics@1': { start_date: '2026-10-05', dt: 0.25, capacity_loss: shortage },
    'agent-based@1': { start_date: '2026-10-05', switch_threshold: 0.8, noise: 0.05, disruption: { supplier: 'schaeffler-like', ...shortage } },
    'optimisation@1': { start_date: '2026-10-05', shortage },
    'war-gaming@1': { turns: 6, adversary: 'greedy', tolerance: 900 },
    'counterfactual@1': { start_date: '2026-10-05', shortage, intervention: { variable: 'supply', value: 1600, from_day: 7, to_day: 28 } },
  };
  return JSON.stringify(t[modelRef] ?? {}, null, 2);
}

/** The operator's parameters: a JSON object, or the problem with it in words (the server judges the rest). */
export function parseParams(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; problem: string } {
  let v: unknown;
  try { v = JSON.parse(text.trim() === '' ? '{}' : text); } catch (e) { return { ok: false, problem: `the parameters are not JSON: ${e instanceof Error ? e.message : String(e)}` }; }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false, problem: 'the parameters are a JSON object' };
  return { ok: true, value: v as Record<string, unknown> };
}

/** A run's summary as label/value lines, in the method's own order. */
export function summaryLines(summary: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (summary === null || summary === undefined) return [];
  return Object.entries(summary).map(([k, v]) => [k.replace(/_/g, ' '), v === null ? '—' : String(v)]);
}
