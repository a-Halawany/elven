/**
 * CP-6 B25 completion (G2, F-P4-03) — THE REPLAY OF AN ENSEMBLE ROW. The choice, said: an ensemble is replayed by RECOMPUTING ITS
 * COMBINATION from its members' STORED distributions under its declared, versioned combination rule — not by re-fitting the members
 * (each member is a forecast of its own, pinned to the same frozen information set, and is replayed on its own: the legacy compute for a
 * builtin member, the registry replay for a registry member). Registered in the shared replayer register by the ensemble part's providers.
 *
 *   1. The ensemble package (FCT@v2 `ensemble`): the rule, the weighting used, the members in combination order with the distribution and
 *      weight each was combined with.
 *   2. Each member's STORED row: it must still carry the distribution the package says was combined (a member row that differs is a named
 *      divergence `member`), and its path.
 *   3. The weights: EQUAL weights are recomputed exactly (1/n); SKILL weights are the recorded ones (rounded to 6 places when recorded — the
 *      replay SAYS so; a difference it causes is reported as `output`, never hidden).
 *   4. combine() and combinePaths() of the declared rule, rounded as the issue rounded (4 places), digested by the same rule as a stored
 *      ensemble row (sha-256 over JCS of {quantiles, path}) against the row's own.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { canonicalDigest, type ForecastReplayer, type ReplayAnswer, type ReplayRequest } from '../../shared/forecast-environment.js';
import { COMBINATION_RULES, combine, combinePaths, weightsFor, type CombinationRule, type Quantiles } from './ensemble-math.js';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const round = (x: number, p = 4): number => Number(x.toFixed(p));
const q3 = (v: unknown): Quantiles => { const r = rec(v); return { q10: Number(r['q10']), q50: Number(r['q50']), q90: Number(r['q90']) }; };

export const ENSEMBLE_REPLAYER_NAME = 'ensemble-combination@1';
/** The stored output of an ensemble row, digested (the rule a legacy row's output is digested by: its quantiles and its path). */
const outputOf = (quantiles: unknown, path: unknown): string => canonicalDigest({ quantiles: quantiles ?? null, path: path ?? [] });

export const ENSEMBLE_COMBINATION_REPLAYER: ForecastReplayer = {
  name: ENSEMBLE_REPLAYER_NAME,
  handles(f: Row): boolean { return f['ensemble_role'] === 'ensemble'; },
  async replay(r: ReplayRequest): Promise<ReplayAnswer> {
    const tx = r.tx as Tx; const f = r.forecast;
    const original = outputOf(f['quantiles'], f['path']);
    const divergences: ReplayAnswer['divergences'] = [];
    const answer = (replayed: string | null, detail: Row): ReplayAnswer => ({ replayer: ENSEMBLE_REPLAYER_NAME, originalOutputDigest: original, replayedOutputDigest: replayed, divergences,
      detail: { replayer: ENSEMBLE_REPLAYER_NAME, approach: 'the combination recomputed from the members\' STORED distributions under the declared rule; each member is replayed on its own', ...detail } });
    const payload = rec(((await sql<Row>`select payload from objects.canonical_objects where object_type = 'FCT' and object_id = ${String(f['forecast_id'])}::uuid
      order by object_version desc limit 1`.execute(tx)).rows[0] ?? {})['payload']);
    const ens = rec(payload['ensemble']); const comb = rec(ens['combination']);
    const rule = String(comb['rule'] ?? '') as CombinationRule;
    if (!COMBINATION_RULES.includes(rule)) {
      divergences.push({ what: 'combination', note: `the ensemble package names no combination rule this build implements (${String(comb['rule'] ?? 'none')})` });
      return answer(null, {});
    }
    const declared = arr(ens['members']).map((m) => rec(m));
    const ids = declared.map((m) => String(m['forecast_id']));
    const stored = new Map(((await sql<Row>`select forecast_id::text, quantiles, path, method_ref, ensemble_id::text, ensemble_role from prediction.forecasts_current
      where forecast_id = any(${`{${ids.join(',')}}`}::uuid[])`.execute(tx)).rows).map((x) => [String(x['forecast_id']), x]));
    const members: Array<{ forecastId: string; methodRef: string; quantiles: Quantiles; path: Array<{ step: number } & Quantiles>; weight: number }> = [];
    for (const m of declared) {
      const row = stored.get(String(m['forecast_id']));
      if (row === undefined || row['ensemble_id'] !== f['forecast_id'] || row['ensemble_role'] !== 'member') {
        divergences.push({ what: 'member', note: `member ${String(m['forecast_id'])} (${String(m['method_ref'])}) is not readable as a member of this ensemble` });
        continue;
      }
      const q = q3(row['quantiles']);
      if (canonicalDigest(q) !== canonicalDigest(q3(m['distribution']))) divergences.push({ what: 'member', original: m['distribution'], replayed: q, note: `member ${String(m['method_ref'])}'s stored distribution is not the one combined` });
      members.push({ forecastId: String(m['forecast_id']), methodRef: String(m['method_ref']), quantiles: q, path: arr(row['path']) as Array<{ step: number } & Quantiles>, weight: Number(m['weight']) });
    }
    if (members.length < declared.length || members.length === 0) return answer(null, { rule, members: ids });
    const used = String(comb['weighting_used'] ?? 'equal');
    const weights = used === 'equal' ? weightsFor('equal', members.map(() => null)).weights : members.map((m) => m.weight);
    const cq = combine(rule, members.map((m) => m.quantiles), weights);
    const quantiles = { q10: round(cq.q10), q50: round(cq.q50), q90: round(cq.q90) };
    const path = combinePaths(rule, members.map((m) => m.path), weights).map((p) => ({ ...p, q10: round(p.q10), q50: round(p.q50), q90: round(p.q90) }));
    const replayed = outputOf(quantiles, path);
    if (replayed !== original) divergences.push({ what: 'output', original: f['quantiles'], replayed: quantiles, ...(used === 'equal' ? {} : { note: 'skill weights are replayed as recorded (6 places)' }) });
    return answer(replayed, { rule, weighting_used: used, weights: used === 'equal' ? 'recomputed (1/n)' : 'as recorded (6 places)',
      members: members.map((m) => ({ forecast_id: m.forecastId, method_ref: m.methodRef, distribution: m.quantiles })), replayed_quantiles: quantiles });
  },
};
