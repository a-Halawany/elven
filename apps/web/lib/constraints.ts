/**
 * CP-6 B29 §D (0092) client — THE CONSTRAINT ENGINE: the domain's constraint sets (topology, conservation, business rules — declared,
 * versioned and retired by their steward), the PLAN CHECK (a plan's quantities per key per day, each in a stated unit, against the
 * current set versions: satisfied 200, violated 422 — the plan refused —, indeterminate 409 — never a pass), the recorded checks and
 * their reproduction against the set versions they pinned. Every act goes through the governed envelope; the server decides and the
 * screen shows its answer verbatim. Pure helpers below are unit-tested (constraints.test.ts).
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export type ConstraintKind = 'topology' | 'conservation' | 'business_rule';
export type Outcome = 'satisfied' | 'violated' | 'indeterminate';
export interface Constraint {
  key: string; kind: ConstraintKind; title?: string; applies_to?: Array<'plan' | 'run_input' | 'run_output'>;
  /* business_rule */ quantity?: string; op?: '<=' | '>=' | 'between'; value?: number; min?: number; max?: number; unit?: string; per?: 'day';
  /* conservation */ stocks?: string[]; stock_prefix?: string; tolerance?: number; non_negative?: boolean;
  /* topology */ sources?: { nodes?: string[]; prefix?: string }; targets?: { nodes?: string[]; prefix?: string }; avoid?: string[]; required_edges?: Array<{ from: string; to: string }>; edge_kinds?: string[];
}
export interface SetRow {
  set_id: string; set_key: string; title: string; steward_principal_id: string; state: 'live' | 'retired'; current_version: number;
  declared_by: string; declared_at: string; retired_at: string | null; retire_reason: string | null;
  current: { version: number; digest: string; constraints: Constraint[]; note: string; declared_by: string; declared_at: string } | null;
}
export interface Violation { constraintKey: string; kind: ConstraintKind; bound: string; observed: string; message: string; setKey?: string; setVersion?: number }
export interface Verdict { outcome: Outcome; setId: string | null; setVersion: number | null; violations: Violation[]; indeterminateReason?: string }
export interface CheckRow {
  check_id: string; subject_kind: 'plan' | 'run_input' | 'run_output'; subject_ref: string; subject_digest: string;
  sets: Array<{ set_id: string; set_key: string; version: number; digest: string }>; outcome: Outcome; violations: Violation[];
  indeterminate_reason: string | null; budget_ms: number; elapsed_ms: number; checked_via: 'route' | 'gate'; checked_by: string | null; checked_at: string;
}
export interface PlanQuantity { key: string; date: string; value: number; unit: string }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/constraints`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'simulation', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const constraints = {
  sets: (s: Scope, state: 'live' | 'retired' | null = null) => p<{ sets: SetRow[]; receipt: Receipt }>(s, '/sets/list', 'simulation.constraint.read', 'CST', state === null ? {} : { state }),
  /** A constraint steward declares a set they steward (a domain administrator may name another steward). */
  declare: (s: Scope, payload: { setKey: string; title: string; constraints: Constraint[]; note: string; steward?: string }) =>
    p<{ set: Record<string, unknown>; receipt: Receipt }>(s, '/sets/declare', 'simulation.constraint.declare', 'CST', payload),
  /** The set's own steward (or a domain administrator) versions it on its CURRENT version; another steward is refused. */
  version: (s: Scope, setId: string, payload: { expectedVersion: number; constraints: Constraint[]; note: string }) =>
    p<{ set: Record<string, unknown>; receipt: Receipt }>(s, `/sets/${setId}/version`, 'simulation.constraint.version', 'CST', payload, setId),
  retire: (s: Scope, setId: string, reason: string) =>
    p<{ set: Record<string, unknown>; receipt: Receipt }>(s, `/sets/${setId}/retire`, 'simulation.constraint.retire', 'CST', { reason }, setId),
  /** The plan check: 200 satisfied; 422 the plan refused (the message names every violation); 409 indeterminate (never a pass). */
  check: (s: Scope, payload: { planKey: string; quantities: PlanQuantity[]; edges?: Array<{ from: string; to: string; kind: string }>; setKeys?: string[] }) =>
    p<{ check: CheckRow; verdict: Verdict; receipt: Receipt }>(s, '/plans/check', 'simulation.plan.check', 'CCK', payload),
  checks: (s: Scope, f: { subjectRef?: string; outcome?: Outcome; limit?: number } = {}) =>
    p<{ checks: CheckRow[]; receipt: Receipt }>(s, '/checks/list', 'simulation.constraint.read', 'CCK', { subjectKind: 'plan', ...f }),
  reproduce: (s: Scope, checkId: string) =>
    p<{ reproduction: { reproducible: boolean; matches?: boolean; reason?: string; note?: string; rederived?: { outcome: Outcome; sets: CheckRow['sets'] };
                        current_versions?: Array<{ set_key: string; version: number; digest: string }> }; receipt: Receipt }>(s, `/checks/${checkId}/reproduce`, 'simulation.constraint.read', 'CCK', {}, checkId),
};

// ───────────────────────── pure helpers ─────────────────────────

const OPS: Record<string, string> = { '<=': '≤', '>=': '≥' };
/** A constraint in one line, as a person reads it. */
export function constraintLine(c: Constraint): string {
  const label = c.title ?? c.key;
  if (c.kind === 'business_rule') {
    const bound = c.op === 'between' ? `between ${c.min} and ${c.max}` : `${OPS[c.op ?? '<='] ?? c.op} ${c.value}`;
    return `${label}: ${c.quantity} ${bound} ${c.unit} per day`;
  }
  if (c.kind === 'conservation') {
    const stocks = c.stocks !== undefined ? c.stocks.join(', ') : `every stock under ${c.stock_prefix}`;
    return `${label}: ${stocks} — opening + inflow − outflow = closing ± ${c.tolerance} ${c.unit}${c.non_negative === false ? '' : ', never negative'}`;
  }
  const sel = (x?: { nodes?: string[]; prefix?: string }) => (x?.nodes !== undefined ? x.nodes.join(', ') : `every site under ${x?.prefix ?? '?'}`);
  return `${label}: ${sel(c.targets)} reachable from ${sel(c.sources)}${c.avoid !== undefined && c.avoid.length > 0 ? `, never through ${c.avoid.join(', ')}` : ''}`;
}

/** Which subjects a constraint applies to, in words. */
export function appliesLine(c: Constraint): string {
  const a = c.applies_to ?? ['plan', 'run_input', 'run_output'];
  return a.map((k) => (k === 'plan' ? 'plans' : k === 'run_input' ? "runs' inputs" : "runs' outputs")).join(' · ');
}

/**
 * The plan editor's text: one quantity per line, `date, value` (the key and unit given once) or `key, date, value, unit`. Every
 * problem in words; nothing is guessed (a missing unit is a problem — a plan states its units).
 */
export function parsePlan(text: string, defaults: { key: string; unit: string }): { ok: true; quantities: PlanQuantity[] } | { ok: false; problem: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  if (lines.length === 0) return { ok: false, problem: 'the plan has no quantities' };
  const out: PlanQuantity[] = [];
  for (const [i, line] of lines.entries()) {
    const f = line.split(',').map((x) => x.trim());
    const [key, date, raw, unit] = f.length === 2 ? [defaults.key, f[0], f[1], defaults.unit] : f.length === 4 ? f : [];
    if (key === undefined || date === undefined || raw === undefined || unit === undefined) return { ok: false, problem: `line ${i + 1}: write "date, value" or "key, date, value, unit"` };
    if (key === '') return { ok: false, problem: `line ${i + 1}: the quantity key is missing` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, problem: `line ${i + 1}: ${date || '(nothing)'} is not a day (YYYY-MM-DD)` };
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) return { ok: false, problem: `line ${i + 1}: ${raw || '(nothing)'} is not a number` };
    if (unit === '') return { ok: false, problem: `line ${i + 1}: the unit is missing — a plan states its units` };
    out.push({ key, date, value, unit });
  }
  return { ok: true, quantities: out };
}

/** A daily total per day of the plan's quantities of one key — what a per-day business rule reads. */
export function dailyTotals(q: PlanQuantity[], key: string): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const x of q) if (x.key === key) m.set(x.date, (m.get(x.date) ?? 0) + x.value);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** The verdict as the server gave it: violated names every violation; indeterminate is never shown as a pass. */
export function outcomeLine(o: { outcome: Outcome; violations: Violation[]; indeterminate_reason?: string | null; indeterminateReason?: string }): { text: string; token: string; glyph: string } {
  if (o.outcome === 'satisfied') return { text: 'satisfied — the plan is within every constraint checked', token: '--eye-color-success', glyph: '✓' };
  if (o.outcome === 'violated') {
    return { text: `REFUSED — ${o.violations.length} violation${o.violations.length === 1 ? '' : 's'}: ${o.violations.map((v) => `${v.constraintKey} (bound ${v.bound}, observed ${v.observed})`).join('; ')}`,
             token: '--eye-color-critical', glyph: '✕' };
  }
  return { text: `INDETERMINATE — not a pass: ${o.indeterminate_reason ?? o.indeterminateReason ?? 'no reason given'}`, token: '--eye-color-warning', glyph: '?' };
}

/** The pins of a check, as `key vN` (the versions the verdict rests on). */
export function pinsLine(sets: CheckRow['sets']): string {
  return sets.length === 0 ? 'no set declared — nothing to check' : sets.map((s) => `${s.set_key} v${s.version}`).join(', ');
}

/** The constraints editor's JSON: a list of constraints, or the problem in words (the server validates the rest). */
export function parseConstraints(text: string): { ok: true; value: Constraint[] } | { ok: false; problem: string } {
  let v: unknown;
  try { v = JSON.parse(text); } catch (e) { return { ok: false, problem: `the constraints are not JSON: ${e instanceof Error ? e.message : String(e)}` }; }
  if (!Array.isArray(v) || v.length === 0) return { ok: false, problem: 'the constraints are a non-empty JSON list' };
  if (!v.every((c) => c !== null && typeof c === 'object' && typeof (c as { key?: unknown }).key === 'string' && typeof (c as { kind?: unknown }).kind === 'string')) {
    return { ok: false, problem: 'each constraint is an object with a key and a kind (topology, conservation or business_rule)' };
  }
  return { ok: true, value: v as Constraint[] };
}

/** The demonstration's Regensburg warehouse capacity, as an editable template. */
export const CAPACITY_TEMPLATE: Constraint[] = [
  { key: 'regensburg-pallets', kind: 'business_rule', title: 'Regensburg warehouse capacity', quantity: 'warehouse:regensburg.pallets', op: '<=', value: 1800, unit: 'pallets', applies_to: ['plan'] },
];
