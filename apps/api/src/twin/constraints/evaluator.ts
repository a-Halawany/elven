/**
 * CP-6 B29 §D (0092) — THE CONSTRAINT EVALUATOR (F-P5-05 clause 3). PURE: no clock but the one it is handed, no I/O — the service loads
 * the set versions and records the verdict; this module validates constraints and judges a subject against them.
 *
 * Three kinds (stored exactly as validated here — snake_case, known fields only — so the port's digest is the declaration's):
 *
 *   topology      { sources, targets: {nodes: [..]} | {prefix}, avoid?: [site], required_edges?: [{from, to}], edge_kinds?: [kind] }
 *                 every target reachable from a source over the subject's edges, never through an avoided (retired) site; an edge that
 *                 touches an avoided site is itself a violation; every required edge present.
 *   conservation  { stocks: [key] | stock_prefix, tolerance, unit, non_negative? (default true) }
 *                 per stock key K and date: K.opening + K.inflow − K.outflow = K.closing within the tolerance (the §C balance keys);
 *                 dated groups carry — one day's closing is the next day's opening; no negative opening or closing.
 *   business_rule { quantity, op: <= | >= | between, value | min+max, unit, per: 'day' }
 *                 the day's total of the quantity within the bound, in the rule's unit.
 *
 * Every constraint may carry `applies_to` (plan | run_input | run_output; default all three) and a `title`.
 *
 * UNITS: a quantity that states a unit must state the rule's — a mismatch is a VIOLATION, never a conversion; a quantity that states none
 * (a method's series and balances carry no units — §C) is read in the rule's unit. A plan states its units (the route requires them).
 *
 * OUTCOME: violated when anything is violated (a found violation is real even when the evaluation stopped early); otherwise INDETERMINATE
 * when an input a constraint needs is missing or the evaluation ran over its time budget; otherwise satisfied. When NOTHING applies (no
 * live set, or none of its constraints applies to the subject's kind) the caller says what that means: checking EVERY live set of a domain
 * that declares nothing for this subject is VACUOUSLY satisfied (`vacuous: true` — the integrator's rule of 2026-09-29, so an ordinary run
 * in a domain without constraints is not held); checking NAMED sets of which none applies is indeterminate (nothing asked for was checked).
 */
import type { ConstraintKind, ConstraintOutcome, ConstraintSubject, ConstraintVerdict, ConstraintViolation } from '../methods/types.js';

export type SubjectKind = ConstraintSubject['kind'];
export const SUBJECT_KINDS: readonly SubjectKind[] = ['plan', 'run_input', 'run_output'];
export interface Selector { nodes?: string[]; prefix?: string }
interface Base { key: string; title?: string; applies_to?: SubjectKind[] }
export interface TopologyConstraint extends Base { kind: 'topology'; sources: Selector; targets: Selector; avoid?: string[]; required_edges?: Array<{ from: string; to: string }>; edge_kinds?: string[] }
export interface ConservationConstraint extends Base { kind: 'conservation'; stocks?: string[]; stock_prefix?: string; tolerance: number; unit: string; non_negative?: boolean }
export interface BusinessRuleConstraint extends Base { kind: 'business_rule'; quantity: string; op: '<=' | '>=' | 'between'; value?: number; min?: number; max?: number; unit: string; per: 'day' }
export type Constraint = TopologyConstraint | ConservationConstraint | BusinessRuleConstraint;

/** One declared set version as the engine evaluates it (the digest is the port's). */
export interface SetVersion { setId: string; setKey: string; version: number; digest: string; constraints: Constraint[] }
/** A violation as the engine records it: the frozen shape plus the set version it came from. */
export interface EngineViolation extends ConstraintViolation { setKey: string; setVersion: number }
export interface Evaluation {
  outcome: ConstraintOutcome;
  violations: EngineViolation[];
  /** Every reason an input was missing or the evaluation stopped; the outcome's reason when it is indeterminate. */
  indeterminate: string[];
  /** The constraints actually evaluated (applies_to filtered). */
  evaluated: number;
  /** Satisfied because nothing declared applies (never set with a violation or a missing input). */
  vacuous: boolean;
  /** The set versions with at least one constraint that applied to the subject (`<set_key> v<version>`), in evaluation order. */
  applied: string[];
  elapsedMs: number;
  /** The set versions the verdict rests on — the pins a check records. */
  pins: Array<{ set_id: string; set_key: string; version: number; digest: string }>;
}

export const MAX_CONSTRAINTS = 200;
const KEY = /^[a-z][a-z0-9_.:-]{1,80}$/;
const NODE = /^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,119}$/;
const QTY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;
const UNIT = /^[^\s].{0,39}$/;

// ── validation ─────────────────────────────────────────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strs = (v: unknown, re: RegExp, max: number): v is string[] => Array.isArray(v) && v.length >= 1 && v.length <= max && v.every((s) => typeof s === 'string' && re.test(s));

function selector(v: unknown, where: string, problems: string[]): Selector | null {
  if (!isObj(v)) { problems.push(`${where} must be { nodes: [site, …] } or { prefix: "…" }`); return null; }
  if (v['nodes'] !== undefined) {
    if (!strs(v['nodes'], NODE, 500)) { problems.push(`${where}.nodes must list 1–500 site names`); return null; }
    return { nodes: [...new Set(v['nodes'] as string[])] };
  }
  if (typeof v['prefix'] === 'string' && v['prefix'].length >= 1 && v['prefix'].length <= 120) return { prefix: v['prefix'] };
  problems.push(`${where} must be { nodes: [site, …] } or { prefix: "…" }`);
  return null;
}

/** Validates and NORMALISES a declaration: known fields only, in a fixed shape — every problem in words (an empty list is valid). */
export function validateConstraints(raw: unknown): { constraints: Constraint[]; problems: string[] } {
  const problems: string[] = [];
  const out: Constraint[] = [];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CONSTRAINTS) return { constraints: [], problems: [`constraints must be a list of 1–${MAX_CONSTRAINTS} constraints`] };
  const seen = new Set<string>();
  raw.forEach((c, i) => {
    const at = `constraints[${i}]`;
    if (!isObj(c)) { problems.push(`${at} must be an object`); return; }
    const key = c['key'];
    if (typeof key !== 'string' || !KEY.test(key)) { problems.push(`${at}.key must be 2–81 lower-case letters, digits, dots, colons, dashes or underscores`); return; }
    if (seen.has(key)) { problems.push(`${at}.key ${key} is declared twice`); return; }
    seen.add(key);
    const base: Base = { key };
    if (c['title'] !== undefined) {
      if (typeof c['title'] !== 'string' || c['title'].trim().length < 3 || c['title'].length > 200) problems.push(`${key}.title must be 3–200 characters`);
      else base.title = c['title'].trim();
    }
    if (c['applies_to'] !== undefined) {
      const a = c['applies_to'];
      if (!Array.isArray(a) || a.length === 0 || !a.every((k) => (SUBJECT_KINDS as readonly unknown[]).includes(k))) problems.push(`${key}.applies_to must list subject kinds (${SUBJECT_KINDS.join(', ')})`);
      else base.applies_to = SUBJECT_KINDS.filter((k) => a.includes(k));
    }
    const kind = c['kind'];
    if (kind === 'business_rule') {
      const q = c['quantity'], op = c['op'], unit = c['unit'], per = c['per'] ?? 'day';
      if (typeof q !== 'string' || !QTY_KEY.test(q)) { problems.push(`${key}.quantity must name the quantity key it bounds (e.g. warehouse:regensburg.pallets)`); return; }
      if (typeof unit !== 'string' || !UNIT.test(unit)) { problems.push(`${key}.unit must name the unit the bound is in (e.g. pallets)`); return; }
      if (per !== 'day') { problems.push(`${key}.per must be "day" (a business rule bounds a quantity per day)`); return; }
      if (op === 'between') {
        if (!num(c['min']) || !num(c['max']) || (c['min'] as number) > (c['max'] as number)) { problems.push(`${key}: between needs numbers min ≤ max`); return; }
        out.push({ ...base, kind, quantity: q, op, min: c['min'] as number, max: c['max'] as number, unit, per: 'day' });
      } else if (op === '<=' || op === '>=') {
        if (!num(c['value'])) { problems.push(`${key}: ${op} needs a number value`); return; }
        out.push({ ...base, kind, quantity: q, op, value: c['value'] as number, unit, per: 'day' });
      } else problems.push(`${key}.op must be <=, >= or between`);
    } else if (kind === 'conservation') {
      const unit = c['unit'], tol = c['tolerance'];
      if (typeof unit !== 'string' || !UNIT.test(unit)) { problems.push(`${key}.unit must name the stock's unit`); return; }
      if (!num(tol) || tol < 0) { problems.push(`${key}.tolerance must be a number ≥ 0 (in ${unit})`); return; }
      if (c['non_negative'] !== undefined && typeof c['non_negative'] !== 'boolean') { problems.push(`${key}.non_negative must be true or false`); return; }
      const r: ConservationConstraint = { ...base, kind, tolerance: tol, unit, non_negative: c['non_negative'] !== false };
      if (c['stocks'] !== undefined) {
        if (!strs(c['stocks'], QTY_KEY, 500)) { problems.push(`${key}.stocks must list 1–500 stock keys`); return; }
        r.stocks = [...new Set(c['stocks'] as string[])];
      } else if (typeof c['stock_prefix'] === 'string' && c['stock_prefix'].length >= 1 && c['stock_prefix'].length <= 120) {
        r.stock_prefix = c['stock_prefix'];
      } else { problems.push(`${key} must name its stocks (stocks: [key, …]) or a stock_prefix`); return; }
      out.push(r);
    } else if (kind === 'topology') {
      const sources = selector(c['sources'], `${key}.sources`, problems), targets = selector(c['targets'], `${key}.targets`, problems);
      if (sources === null || targets === null) return;
      const r: TopologyConstraint = { ...base, kind, sources, targets };
      if (c['avoid'] !== undefined) {
        if (!strs(c['avoid'], NODE, 500)) { problems.push(`${key}.avoid must list 1–500 site names (the retired sites no route may pass through)`); return; }
        r.avoid = [...new Set(c['avoid'] as string[])];
      }
      if (c['required_edges'] !== undefined) {
        const e = c['required_edges'];
        if (!Array.isArray(e) || e.length === 0 || e.length > 500 || !e.every((x) => isObj(x) && typeof x['from'] === 'string' && NODE.test(x['from']) && typeof x['to'] === 'string' && NODE.test(x['to']))) {
          problems.push(`${key}.required_edges must list 1–500 { from, to } site pairs`); return;
        }
        r.required_edges = (e as Array<{ from: string; to: string }>).map((x) => ({ from: x.from, to: x.to }));
      }
      if (c['edge_kinds'] !== undefined) {
        if (!strs(c['edge_kinds'], /^[a-z][a-z0-9_-]{0,40}$/, 20)) { problems.push(`${key}.edge_kinds must list 1–20 edge kinds`); return; }
        r.edge_kinds = [...new Set(c['edge_kinds'] as string[])];
      }
      out.push(r);
    } else problems.push(`${key}.kind must be topology, conservation or business_rule`);
  });
  return { constraints: out, problems };
}

// ── evaluation ─────────────────────────────────────────────────────────────────────
/** A number as a person reads it: integers bare, fractions to three places, no float noise. */
export function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}
const OPS = { '<=': '≤', '>=': '≥' } as const;
function boundText(r: BusinessRuleConstraint): string {
  return r.op === 'between' ? `between ${fmt(r.min as number)} and ${fmt(r.max as number)} ${r.unit} per day` : `${OPS[r.op]} ${fmt(r.value as number)} ${r.unit} per day`;
}
const on = (date: string | null) => (date === null ? '(undated)' : `on ${date}`);

class OverBudget extends Error {}

export interface EvaluateOptions {
  /** The time budget in milliseconds; 0 is a legal (degenerate) budget — nothing is evaluated and the outcome is indeterminate. */
  budgetMs: number;
  /** The clock (milliseconds); injected so the evaluation stays pure and a test can drive it. */
  now?: () => number;
  /** Nothing applicable is VACUOUSLY satisfied (every live set was asked for) rather than indeterminate (named sets were). Default false. */
  vacuousWhenUndeclared?: boolean;
}

export function evaluate(subject: ConstraintSubject, sets: SetVersion[], opts: EvaluateOptions): Evaluation {
  const now = opts.now ?? (() => Date.now());
  const start = now();
  let steps = 0;
  const tick = (force = false) => {
    steps += 1;
    if ((force || steps % 512 === 0) && now() - start >= opts.budgetMs) throw new OverBudget();
  };
  const violations: EngineViolation[] = [];
  const indeterminate: string[] = [];
  let evaluated = 0;
  const total = sets.reduce((n, s) => n + s.constraints.filter((c) => applies(c, subject.kind)).length, 0);
  try {
    for (const set of sets) {
      for (const c of set.constraints) {
        if (!applies(c, subject.kind)) continue;
        tick(true);
        const where = `${set.setKey} v${set.version} · ${c.key}`;
        const add = (v: ConstraintViolation) => violations.push({ ...v, setKey: set.setKey, setVersion: set.version });
        const missing = (why: string) => indeterminate.push(`${where}: ${why}`);
        if (c.kind === 'business_rule') businessRule(c, subject, add, missing, tick);
        else if (c.kind === 'conservation') conservation(c, subject, add, missing, tick);
        else topology(c, subject, add, missing, tick);
        evaluated += 1;
      }
    }
  } catch (e) {
    if (!(e instanceof OverBudget)) throw e;
    indeterminate.push(`the evaluation exceeded its time budget of ${opts.budgetMs} ms after ${evaluated} of ${total} constraints`);
  }
  const nothing = total === 0;
  if (nothing && opts.vacuousWhenUndeclared !== true) {
    indeterminate.push(sets.length === 0 ? 'no live constraint set applies — nothing was checked' : `no declared constraint applies to a ${subject.kind} subject — nothing was checked`);
  }
  const outcome: ConstraintOutcome = violations.length > 0 ? 'violated' : indeterminate.length > 0 ? 'indeterminate' : 'satisfied';
  return {
    outcome, violations, indeterminate, evaluated, vacuous: outcome === 'satisfied' && nothing,
    applied: sets.filter((s) => s.constraints.some((c) => applies(c, subject.kind))).map((s) => `${s.setKey} v${s.version}`),
    elapsedMs: Math.max(0, Math.round(now() - start)),
    pins: sets.map((s) => ({ set_id: s.setId, set_key: s.setKey, version: s.version, digest: s.digest })),
  };
}

function applies(c: Constraint, kind: SubjectKind): boolean {
  return c.applies_to === undefined || c.applies_to.includes(kind);
}

type Add = (v: ConstraintViolation) => void;
type Missing = (why: string) => void;
type Tick = () => void;

/** The rule's unit check: a stated unit that is not the rule's is a violation (and the entry is set aside). */
function unitOk(c: { key: string; unit: string; kind: ConstraintKind }, q: ConstraintSubject['quantities'][number], add: Add): boolean {
  if (q.unit === null || q.unit === c.unit) return true;
  add({ constraintKey: c.key, kind: c.kind, bound: `unit ${c.unit}`, observed: `${fmt(q.value)} ${q.unit} ${on(q.date)}`,
        message: `${q.key} is stated in ${q.unit}; ${c.key} is declared in ${c.unit} — a unit mismatch is refused, never converted` });
  return false;
}

function businessRule(c: BusinessRuleConstraint, s: ConstraintSubject, add: Add, missing: Missing, tick: Tick): void {
  const entries = s.quantities.filter((q) => q.key === c.quantity);
  if (entries.length === 0) { missing(`the subject has no quantity ${c.quantity}`); return; }
  const byDay = new Map<string, number>();
  let undated = 0;
  for (const q of entries) {
    tick();
    if (!unitOk(c, q, add)) continue;
    if (q.date === null) { undated += 1; continue; }
    byDay.set(q.date, (byDay.get(q.date) ?? 0) + q.value);
  }
  if (undated > 0) missing(`${undated} ${c.quantity} value(s) name no day — a per-day bound needs the day`);
  const label = c.title ?? c.key;
  for (const [date, v] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    tick();
    let over: string | null = null;
    if (c.op === '<=' && v > (c.value as number)) over = `exceeds the bound by ${fmt(v - (c.value as number))} ${c.unit}`;
    if (c.op === '>=' && v < (c.value as number)) over = `falls short of the bound by ${fmt((c.value as number) - v)} ${c.unit}`;
    if (c.op === 'between' && v < (c.min as number)) over = `falls short of the bound by ${fmt((c.min as number) - v)} ${c.unit}`;
    if (c.op === 'between' && v > (c.max as number)) over = `exceeds the bound by ${fmt(v - (c.max as number))} ${c.unit}`;
    if (over !== null) add({ constraintKey: c.key, kind: 'business_rule', bound: boundText(c), observed: `${fmt(v)} ${c.unit} on ${date}`, message: `${label}: ${c.quantity} ${over} on ${date}` });
  }
}

const FIELDS = ['opening', 'inflow', 'outflow', 'closing'] as const;
type Field = (typeof FIELDS)[number];

function conservation(c: ConservationConstraint, s: ConstraintSubject, add: Add, missing: Missing, tick: Tick): void {
  const split = (key: string): { stock: string; field: Field } | null => {
    const i = key.lastIndexOf('.');
    if (i <= 0) return null;
    const field = key.slice(i + 1);
    return (FIELDS as readonly string[]).includes(field) ? { stock: key.slice(0, i), field: field as Field } : null;
  };
  const stocks = c.stocks ?? [...new Set(s.quantities.map((q) => split(q.key)).filter((x) => x !== null && x.stock.startsWith(c.stock_prefix as string)).map((x) => (x as { stock: string }).stock))].sort();
  if (stocks.length === 0) { missing(`the subject has no stock under ${c.stock_prefix} (keys <stock>.opening|inflow|outflow|closing)`); return; }
  const label = c.title ?? c.key;
  const tol = c.tolerance;
  for (const stock of stocks) {
    const groups = new Map<string, Partial<Record<Field, number>>>();
    for (const q of s.quantities) {
      tick();
      const k = split(q.key);
      if (k === null || k.stock !== stock) continue;
      if (!unitOk(c, q, add)) continue;
      const g = groups.get(q.date ?? '') ?? {};
      g[k.field] = (g[k.field] ?? 0) + q.value;
      groups.set(q.date ?? '', g);
    }
    if (groups.size === 0) { missing(`the subject has no quantities of stock ${stock}`); continue; }
    const dated = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    let prior: { date: string; closing: number } | null = null;
    for (const [d, g] of dated) {
      tick();
      const date = d === '' ? null : d;
      const absent = FIELDS.filter((f) => g[f] === undefined);
      if (absent.length > 0) { missing(`stock ${stock} ${on(date)} lacks ${absent.map((f) => `${stock}.${f}`).join(', ')}`); prior = null; continue; }
      const o = g.opening as number, i = g.inflow as number, out = g.outflow as number, cl = g.closing as number;
      const residual = o + i - out - cl;
      if (Math.abs(residual) > tol) {
        add({ constraintKey: c.key, kind: 'conservation', bound: `opening + inflow − outflow = closing ± ${fmt(tol)} ${c.unit}`,
              observed: `${fmt(o)} + ${fmt(i)} − ${fmt(out)} = ${fmt(o + i - out)}, closing ${fmt(cl)} ${c.unit} ${on(date)}`,
              message: `${label}: stock ${stock} does not balance ${on(date)} — ${fmt(Math.abs(residual))} ${c.unit} ${residual > 0 ? 'unaccounted for' : 'appear from nowhere'}` });
      }
      if (c.non_negative !== false) {
        for (const [f, v] of [['opening', o], ['closing', cl]] as const) {
          if (v < 0) add({ constraintKey: c.key, kind: 'conservation', bound: `≥ 0 ${c.unit}`, observed: `${f} ${fmt(v)} ${c.unit} ${on(date)}`, message: `${label}: stock ${stock} is negative (${f}) ${on(date)}` });
        }
      }
      if (prior !== null && date !== null && Math.abs(prior.closing - o) > tol) {
        add({ constraintKey: c.key, kind: 'conservation', bound: `opening = the prior day's closing ± ${fmt(tol)} ${c.unit}`,
              observed: `closing ${fmt(prior.closing)} on ${prior.date}, opening ${fmt(o)} on ${date}`, message: `${label}: stock ${stock} does not carry from ${prior.date} to ${date}` });
      }
      prior = date === null ? null : { date, closing: cl };
    }
  }
}

function topology(c: TopologyConstraint, s: ConstraintSubject, add: Add, missing: Missing, tick: Tick): void {
  const all = s.edges ?? [];
  if (all.length === 0) { missing('the subject names no edges (a topology rule reads the network from → to)'); return; }
  const edges = c.edge_kinds === undefined ? all : all.filter((e) => (c.edge_kinds as string[]).includes(e.kind));
  const nodes = new Set<string>();
  for (const e of all) { nodes.add(e.from); nodes.add(e.to); }
  const resolve = (sel: Selector, what: string): string[] | null => {
    if (sel.nodes !== undefined) return sel.nodes;
    const got = [...nodes].filter((n) => n.startsWith(sel.prefix as string)).sort();
    if (got.length === 0) { missing(`the network has no ${what} site under ${sel.prefix}`); return null; }
    return got;
  };
  const sources = resolve(c.sources, 'source'), targets = resolve(c.targets, 'target');
  const avoid = new Set(c.avoid ?? []);
  const label = c.title ?? c.key;
  for (const e of edges) {
    tick();
    const through = avoid.has(e.from) ? e.from : avoid.has(e.to) ? e.to : null;
    if (through !== null) add({ constraintKey: c.key, kind: 'topology', bound: `no route through ${through} (retired)`, observed: `edge ${e.from} → ${e.to} (${e.kind})`, message: `${label}: the network routes through the retired site ${through}` });
  }
  for (const r of c.required_edges ?? []) {
    tick();
    if (!edges.some((e) => e.from === r.from && e.to === r.to)) add({ constraintKey: c.key, kind: 'topology', bound: `edge ${r.from} → ${r.to} present`, observed: 'absent', message: `${label}: the required edge ${r.from} → ${r.to} is missing` });
  }
  if (sources === null || targets === null) return;
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (avoid.has(e.from) || avoid.has(e.to)) continue;
    const l = out.get(e.from) ?? [];
    l.push(e.to);
    out.set(e.from, l);
  }
  const reached = new Set<string>(sources.filter((n) => !avoid.has(n)));
  const queue = [...reached];
  while (queue.length > 0) {
    tick();
    const n = queue.shift() as string;
    for (const m of out.get(n) ?? []) if (!reached.has(m)) { reached.add(m); queue.push(m); }
  }
  const from = sources.length <= 4 ? sources.join(', ') : `${sources.slice(0, 4).join(', ')} and ${sources.length - 4} more`;
  for (const t of targets) {
    tick();
    if (reached.has(t)) continue;
    add({ constraintKey: c.key, kind: 'topology', bound: `reachable from ${from}`, observed: nodes.has(t) ? `${t}: no route` : `${t}: not in the network`,
          message: `${label}: ${t} cannot be reached from any source${avoid.size > 0 ? ' without passing a retired site' : ''}` });
  }
}

/**
 * The frozen verdict (../methods/types.ts) of an evaluation: setId/setVersion name the FIRST set with a violation, else the ONE set whose
 * constraints applied to the subject, else null (none applied, or several did and none was violated — a plan check's record carries every pin).
 */
export function toVerdict(e: Evaluation): ConstraintVerdict {
  const first = e.violations[0];
  const only = e.applied.length === 1 ? e.applied[0] : undefined;
  const pin = first !== undefined ? e.pins.find((p) => p.set_key === first.setKey && p.version === first.setVersion)
    : only !== undefined ? e.pins.find((p) => `${p.set_key} v${p.version}` === only) : undefined;
  return {
    outcome: e.outcome, setId: pin?.set_id ?? null, setVersion: pin?.version ?? null,
    violations: e.violations.map((v) => ({ constraintKey: v.constraintKey, kind: v.kind, bound: v.bound, observed: v.observed, message: `[${v.setKey} v${v.setVersion}] ${v.message}` })),
    ...(e.outcome === 'indeterminate' ? { indeterminateReason: e.indeterminate.join('; ').slice(0, 2000) } : {}),
  };
}
