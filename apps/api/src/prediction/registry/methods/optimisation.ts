/**
 * CP-6 B25 §MR (0108) — THE OPTIMISATION FAMILY (`optimisation-lp`; MC-015): a FEASIBILITY CHECK and the OPTIMALITY GAP of a DECLARED
 * linear objective under DECLARED linear constraints — the objective and the constraints are HUMAN-APPROVED in the registry entry (the
 * method steward's approval of the entry is the approval of both), never chosen by the method.
 *
 *   The declaration: decision variables with bounds; an objective (minimise | maximise) whose coefficients and constant are numbers, a
 *   declared PARAMETER (a band low / mid / high, e.g. the corridor's disruption probability) times a factor plus an offset, or an INPUT read
 *   from the series (the recent mean over a declared window, e.g. the transits a reroute must absorb) times a factor; linear constraints
 *   (≤, ≥, =) built the same way.
 *   The solver: every basic solution of the (≤ 4-variable) system is enumerated — the LP optimum lies on a vertex — each checked against
 *   every constraint and bound; INFEASIBLE when none is feasible. The IMPLEMENTABLE plan is the best feasible point of a grid of the declared
 *   step (a share in steps of 5%, say); the OPTIMALITY GAP is its objective's distance from the LP optimum, relative to |LP optimum|.
 *   The forecast it issues: the objective's value at the implementable plan under the parameter's low, mid and high (sorted into the 10/50/90
 *   slots) — a SCENARIO BAND over the declared parameter band, not a statistical interval, and the forecast says so.
 */
import { mean, round, solve, type Band, type Point } from './stats.js';

export const OPTIMISATION_LP_REF = 'optimisation-lp';

export type Coefficient = number | { param: string; times?: number; plus?: number } | { input: string; times?: number; plus?: number };
export interface OptimisationDeclarations {
  variables: Array<{ name: string; lo: number; hi: number; step: number }>;
  objective: { sense: 'minimise' | 'maximise'; coefficients: Coefficient[]; constant: Coefficient; unit: string; statement: string };
  constraints: Array<{ label: string; coefficients: Coefficient[]; comparator: '<=' | '>=' | '='; rhs: Coefficient }>;
  parameters: Record<string, { low: number; mid: number; high: number; source: string }>;
  inputs: Record<string, { kind: 'series_recent_mean'; window_days: number }>;
}

type Env = { params: Record<string, number>; inputs: Record<string, number> };

export function coefficient(c: Coefficient, env: Env): number {
  if (typeof c === 'number') return c;
  if ('param' in c) {
    const v = env.params[c.param];
    if (v === undefined) throw new Error(`optimisation-lp: parameter ${c.param} is not declared`);
    return v * (c.times ?? 1) + (c.plus ?? 0);
  }
  const v = env.inputs[c.input];
  if (v === undefined) throw new Error(`optimisation-lp: input ${c.input} is not declared`);
  return v * (c.times ?? 1) + (c.plus ?? 0);
}

/** The inputs a declaration reads from the series (the recent mean over each declared window). */
export function resolveInputs(points: readonly Point[], d: OptimisationDeclarations): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(d.inputs)) {
    const recent = points.slice(-Math.max(1, spec.window_days));
    if (recent.length === 0) throw new Error(`optimisation-lp: no observation to read input ${name}`);
    out[name] = round(mean(recent.map((p) => p.value)), 6);
  }
  return out;
}

interface Row { label: string; a: number[]; b: number }

function rowsOf(d: OptimisationDeclarations, env: Env): { le: Row[]; eq: Row[] } {
  const n = d.variables.length; const le: Row[] = []; const eq: Row[] = [];
  for (const c of d.constraints) {
    if (c.coefficients.length !== n) throw new Error(`optimisation-lp: constraint ${c.label} has ${c.coefficients.length} coefficient(s) for ${n} variable(s)`);
    const a = c.coefficients.map((x) => coefficient(x, env)); const b = coefficient(c.rhs, env);
    if (c.comparator === '<=') le.push({ label: c.label, a, b });
    else if (c.comparator === '>=') le.push({ label: c.label, a: a.map((x) => -x), b: -b });
    else eq.push({ label: c.label, a, b });
  }
  d.variables.forEach((v, i) => {
    const e = new Array<number>(n).fill(0); e[i] = 1;
    le.push({ label: `${v.name} ≤ ${v.hi}`, a: e, b: v.hi });
    le.push({ label: `${v.name} ≥ ${v.lo}`, a: e.map((x) => -x), b: -v.lo });
  });
  return { le, eq };
}

const TOL = 1e-9;
const feasible = (x: number[], le: Row[], eq: Row[]): boolean =>
  le.every((r) => r.a.reduce((s, v, i) => s + v * x[i]!, 0) <= r.b + 1e-7) && eq.every((r) => Math.abs(r.a.reduce((s, v, i) => s + v * x[i]!, 0) - r.b) <= 1e-7);

function combinations(m: number, k: number): number[][] {
  const out: number[][] = []; const cur: number[] = [];
  const rec = (start: number): void => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i < m; i += 1) { cur.push(i); rec(i + 1); cur.pop(); }
  };
  rec(0);
  return out;
}

export interface LpSolution { status: 'optimal' | 'infeasible'; x: number[] | null; value: number | null; active: string[] }

export function solveLp(d: OptimisationDeclarations, env: Env): LpSolution {
  const n = d.variables.length;
  if (n < 1 || n > 4) throw new Error('optimisation-lp: one to four decision variables are declared');
  const { le, eq } = rowsOf(d, env);
  const c = d.objective.coefficients.map((x) => coefficient(x, env));
  const k = coefficient(d.objective.constant, env);
  const sign = d.objective.sense === 'minimise' ? 1 : -1;
  let best: LpSolution = { status: 'infeasible', x: null, value: null, active: [] };
  // every vertex: the equalities plus (n − #eq) of the inequalities held tight
  const need = n - eq.length;
  if (need < 0) throw new Error('optimisation-lp: more equality constraints than variables');
  for (const pick of combinations(le.length, need)) {
    const rows = [...eq, ...pick.map((i) => le[i]!)];
    const x = solve(rows.map((r) => r.a), rows.map((r) => r.b));
    if (x === null || !feasible(x, le, eq)) continue;
    const value = c.reduce((s, v, i) => s + v * x[i]!, 0) + k;
    if (best.value === null || sign * value < sign * best.value - TOL) best = { status: 'optimal', x: x.map((v) => round(v, 6)), value: round(value, 6), active: rows.map((r) => r.label) };
  }
  return best;
}

/** The best feasible point of the declared grid (each variable from lo to hi in its step). */
export function solveGrid(d: OptimisationDeclarations, env: Env): { x: number[] | null; value: number | null; points: number } {
  const { le, eq } = rowsOf(d, env);
  const c = d.objective.coefficients.map((x) => coefficient(x, env)); const k = coefficient(d.objective.constant, env);
  const sign = d.objective.sense === 'minimise' ? 1 : -1;
  const axes = d.variables.map((v) => {
    if (!(v.step > 0)) throw new Error(`optimisation-lp: variable ${v.name} declares no positive grid step`);
    const xs: number[] = []; for (let x = v.lo; x <= v.hi + 1e-9; x = round(x + v.step, 9)) xs.push(round(x, 9));
    return xs;
  });
  let best: { x: number[] | null; value: number | null } = { x: null, value: null }; let count = 0;
  const rec = (i: number, cur: number[]): void => {
    if (i === axes.length) {
      count += 1;
      if (!feasible(cur, le, eq)) return;
      const value = c.reduce((s, v, j) => s + v * cur[j]!, 0) + k;
      if (best.value === null || sign * value < sign * best.value - TOL) best = { x: [...cur], value: round(value, 6) };
      return;
    }
    for (const x of axes[i]!) { cur.push(x); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return { ...best, points: count };
}

export interface OptimisationOutput {
  status: 'optimal' | 'infeasible';
  lp: LpSolution; implementable: { x: number[] | null; value: number | null; grid_points: number };
  gap: number | null; feasibility: Array<{ label: string; lhs: number; comparator: string; rhs: number; slack: number; satisfied: boolean }>;
  band: Band | null; inputs: Record<string, number>; parameters: Record<string, { low: number; mid: number; high: number; source: string }>;
  variables: string[]; objective: { sense: string; unit: string; statement: string };
}

export function optimise(points: readonly Point[], d: OptimisationDeclarations): OptimisationOutput {
  const inputs = resolveInputs(points, d);
  const mid = Object.fromEntries(Object.entries(d.parameters).map(([k, v]) => [k, v.mid]));
  const env: Env = { params: mid, inputs };
  const lp = solveLp(d, env);
  const grid = solveGrid(d, env);
  const base = { inputs, parameters: d.parameters, variables: d.variables.map((v) => v.name), objective: { sense: d.objective.sense, unit: d.objective.unit, statement: d.objective.statement } };
  if (lp.status === 'infeasible' || grid.x === null) {
    const probe = lp.x ?? d.variables.map((v) => v.lo);
    return { status: 'infeasible', lp, implementable: { x: null, value: null, grid_points: grid.points }, gap: null, feasibility: report(d, env, probe), band: null, ...base };
  }
  const gap = lp.value === null || grid.value === null ? null : round(Math.abs(grid.value - lp.value) / Math.max(Math.abs(lp.value), 1e-9), 6);
  const valueAt = (params: Record<string, number>): number => {
    const e: Env = { params, inputs };
    return d.objective.coefficients.reduce<number>((s, c, i) => s + coefficient(c, e) * grid.x![i]!, 0) + coefficient(d.objective.constant, e);
  };
  const scen = ['low', 'mid', 'high'].map((which) => valueAt(Object.fromEntries(Object.entries(d.parameters).map(([k, v]) => [k, v[which as 'low' | 'mid' | 'high']])))).sort((a, b) => a - b);
  return { status: 'optimal', lp, implementable: { x: grid.x, value: grid.value, grid_points: grid.points }, gap, feasibility: report(d, env, grid.x),
           band: { q10: round(scen[0]!, 4), q50: round(scen[1]!, 4), q90: round(scen[2]!, 4) }, ...base };
}

function report(d: OptimisationDeclarations, env: Env, x: number[]): OptimisationOutput['feasibility'] {
  return d.constraints.map((c) => {
    const lhs = c.coefficients.reduce<number>((s, v, i) => s + coefficient(v, env) * (x[i] ?? 0), 0); const rhs = coefficient(c.rhs, env);
    const slack = c.comparator === '<=' ? rhs - lhs : c.comparator === '>=' ? lhs - rhs : -Math.abs(lhs - rhs);
    return { label: c.label, lhs: round(lhs, 6), comparator: c.comparator, rhs: round(rhs, 6), slack: round(slack, 6), satisfied: c.comparator === '=' ? Math.abs(lhs - rhs) <= 1e-7 : slack >= -1e-7 };
  });
}
