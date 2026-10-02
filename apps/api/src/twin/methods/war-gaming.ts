/**
 * war-gaming@1 — CP-6 B29 §C (0092): a TURN-BASED game of an ADVERSARY's moves against the PLAN's responses, scored
 * (F-P5-05 clause 2, family `war-gaming`).
 *
 * The adversary's repertoire is the twin's threats (`threat.impact:<move>` = { target, impact }): each move strikes one target (a
 * supply, a route, a capacity …) for an impact in the twin's unit of damage. The plan's repertoire is its responses
 * (`plan.response:<id>` = { counters: target, strength 0..1, cost, uses }): a response mitigates `strength` of a move on the target
 * it counters and can be used `uses` times. Each turn the adversary moves — GREEDY (the move whose damage the plan can mitigate
 * least, given the responses it has left; ties by move key) or RANDOM (drawn uniformly by a seeded xoshiro128**; an unseeded random
 * adversary is refused) — and the plan answers with the strongest response it still holds for that target (ties: cheaper, then by
 * id), or none. The residual damage is impact × (1 − strength). The game's SCORE is the share of the adversary's total impact the
 * plan mitigated; its VERDICT is `plan holds` when the residual stays within `params.tolerance`, else `plan breached` at the turn it
 * crossed it. Reported per turn (move, response, impact, mitigated, residual, cost), the summary, and the BALANCE of each response's
 * uses (opening − used = closing) for §D. PURE; the pinned digest (war-gaming.digest.ts) is this file's sha256.
 */
import type { MethodAdapter, MethodInput, MethodOutput } from './types.js';
import { roundHalfEven, xoshiro128ss } from '../models/supply-flow.js';
import { WAR_GAMING_IMPLEMENTATION_DIGEST } from './war-gaming.digest.js';

export const WAR_GAMING_METHOD_REF = 'war-gaming@1';
export const WAR_GAMING_REQUIRED_INPUTS: readonly string[] = Object.freeze(['threat.impact', 'plan.response']);

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Threat { move: string; target: string; impact: number }
interface Response { id: string; counters: string; strength: number; cost: number; uses: number }
interface Game { threats: Threat[]; responses: Response[]; turns: number; adversary: 'greedy' | 'random'; tolerance: number }

function readGame(input: MethodInput): { game: Game | null; problems: string[] } {
  const problems: string[] = [];
  const p = input.params ?? {};
  const turns = num(p['turns']);
  if (!Number.isInteger(turns) || turns < 1 || turns > 50) problems.push('params.turns is an integer in [1, 50]');
  const adversary = p['adversary'] ?? 'greedy';
  if (adversary !== 'greedy' && adversary !== 'random') problems.push("params.adversary is 'greedy' or 'random'");
  if (adversary === 'random' && input.seed === null) problems.push('a random adversary is seeded (stochastic.mode seeded); an unseeded draw is refused');
  const tolerance = num(p['tolerance']);
  if (!(tolerance >= 0)) problems.push('params.tolerance is the residual damage the plan may absorb (≥ 0)');
  const threats: Threat[] = [];
  for (const e of input.elements.filter((x) => x.key.startsWith('threat.impact:'))) {
    const v = (e.value ?? {}) as Record<string, unknown>;
    const impact = num(v['impact']);
    if (typeof v['target'] !== 'string' || v['target'].length === 0 || !(impact >= 0)) { problems.push(`${e.key} is { target, impact (≥ 0) }`); continue; }
    threats.push({ move: e.key.slice('threat.impact:'.length), target: v['target'], impact });
  }
  const responses: Response[] = [];
  for (const e of input.elements.filter((x) => x.key.startsWith('plan.response:'))) {
    const v = (e.value ?? {}) as Record<string, unknown>;
    const strength = num(v['strength']); const cost = num(v['cost']); const uses = num(v['uses']);
    if (typeof v['counters'] !== 'string' || !(strength >= 0 && strength <= 1) || !(cost >= 0) || !Number.isInteger(uses) || uses < 1) {
      problems.push(`${e.key} is { counters (a target), strength (0..1), cost (≥ 0), uses (integer ≥ 1) }`); continue;
    }
    responses.push({ id: e.key.slice('plan.response:'.length), counters: v['counters'], strength, cost, uses });
  }
  if (threats.length === 0) problems.push('the adversary has no move (threat.impact:<move>)');
  if (problems.length > 0) return { game: null, problems };
  threats.sort((a, b) => cmp(a.move, b.move)); responses.sort((a, b) => cmp(a.id, b.id));
  return { game: { threats, responses, turns, adversary: adversary as 'greedy' | 'random', tolerance }, problems };
}

export function playGame(input: MethodInput): MethodOutput {
  const { game: g, problems } = readGame(input);
  if (g === null) throw new Error(`${WAR_GAMING_METHOD_REF} input invalid: ${problems.join('; ')}`);
  const rng = input.seed === null ? null : xoshiro128ss(input.seed >>> 0);
  const left = new Map(g.responses.map((r) => [r.id, r.uses]));
  const best = (target: string): Response | null => g.responses.filter((r) => r.counters === target && left.get(r.id)! > 0)
    .sort((a, b) => b.strength - a.strength || a.cost - b.cost || cmp(a.id, b.id))[0] ?? null;
  const series: MethodOutput['series'] = [];
  let impact = 0; let mitigated = 0; let residual = 0; let cost = 0; let breachedAt: number | null = null;
  for (let t = 1; t <= g.turns; t++) {
    const move = g.adversary === 'random'
      ? g.threats[Math.min(g.threats.length - 1, Math.floor(rng!() * g.threats.length))]!
      : [...g.threats].sort((a, b) => b.impact * (1 - (best(b.target)?.strength ?? 0)) - a.impact * (1 - (best(a.target)?.strength ?? 0)) || cmp(a.move, b.move))[0]!;
    const r = best(move.target);
    if (r !== null) left.set(r.id, left.get(r.id)! - 1);
    const m = move.impact * (r?.strength ?? 0); const res = move.impact - m;
    impact += move.impact; mitigated += m; residual += res; cost += r?.cost ?? 0;
    if (breachedAt === null && residual > g.tolerance) breachedAt = t;
    series.push({ turn: t, move: move.move, target: move.target, response: r?.id ?? null, strength: r === null ? null : roundHalfEven(r.strength, 4),
                  impact: roundHalfEven(move.impact, 3), mitigated: roundHalfEven(m, 3), residual: roundHalfEven(res, 3), cumulative_residual: roundHalfEven(residual, 3),
                  response_cost: roundHalfEven(r?.cost ?? 0, 2) });
  }
  return {
    series,
    summary: { turns: g.turns, adversary: g.adversary, total_impact: roundHalfEven(impact, 3), total_mitigated: roundHalfEven(mitigated, 3), total_residual: roundHalfEven(residual, 3),
               response_cost: roundHalfEven(cost, 2), score: roundHalfEven(impact === 0 ? 1 : mitigated / impact, 4), tolerance: roundHalfEven(g.tolerance, 3),
               verdict: breachedAt === null ? 'plan holds' : 'plan breached', breached_at_turn: breachedAt },
    balances: g.responses.map((r) => ({ key: `plan.response:${r.id}`, opening: r.uses, inflow: 0, outflow: r.uses - left.get(r.id)!, closing: left.get(r.id)! })),
  };
}

export const WAR_GAMING_PROBE: MethodInput = {
  modelRef: WAR_GAMING_METHOD_REF, params: { turns: 3, adversary: 'greedy', tolerance: 50 },
  elements: [{ key: 'threat.impact:port-closure', value: { target: 'route', impact: 40 }, unit: 'k€' }, { key: 'threat.impact:supplier-outage', value: { target: 'supply', impact: 60 }, unit: 'k€' },
             { key: 'plan.response:reroute', value: { counters: 'route', strength: 0.5, cost: 5, uses: 1 }, unit: null },
             { key: 'plan.response:second-source', value: { counters: 'supply', strength: 0.75, cost: 12, uses: 2 }, unit: null }],
  horizonDays: 1, seed: null,
};

export const warGamingAdapter: MethodAdapter = {
  modelRef: WAR_GAMING_METHOD_REF, family: 'war-gaming', digest: WAR_GAMING_IMPLEMENTATION_DIGEST, requiredInputs: WAR_GAMING_REQUIRED_INPUTS,
  validate: (input) => readGame(input).problems,
  run: playGame,
};
