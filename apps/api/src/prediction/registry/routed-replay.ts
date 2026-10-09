/**
 * CP-6 B25 completion (G2, F-P4-03 "replay of the frozen set") — THE REPLAY OF A ROUTED REGISTRY FORECAST. Registered in the shared
 * replayer register (shared/forecast-environment.ts) by the registry's providers, so the context part's replay reaches it without
 * importing this part. Before it, every routed event, regime, bayesian, causal or optimisation forecast replayed DIVERGED ("no registered
 * deterministic compute"); now it is RECOMPUTED deterministically:
 *
 *   1. THE PINNED ENTRY — the registry entry the row names (method_ref = key@version), read as approved: family, implementation reference and
 *      its pinned implementation digest, parameters, declarations. Its digest must be THIS build's (codeDigestOf): an entry approved for other
 *      bytes is a named divergence `implementation` and is not re-run (the build cannot reproduce what it does not carry).
 *   2. THE PINNED TARGET — by version: the forecast's own pin (outcome_spec.target, G7), else the route the forecast was bound to (its plan's
 *      target), else the highest version approved by the time it was issued (said so). A pinned definition digest that no longer matches is
 *      a named divergence `target.definition` — and so is a pinned version that can no longer be read (B25-F1: never a later version instead).
 *      B25-F1: an ensemble MEMBER pins its target version too (outcome_spec.target, from its run's persisted plan) and the method entry it ran
 *      (outcome_spec.method: the implementation digest, the parameters' and declarations' digests) — a registry row that no longer matches
 *      them is a named divergence (`implementation`, `method.parameters`, `method.declarations`).
 *   3. THE FAMILY RE-RUN — runFamily on the replayed points (the pinned evidence versions, re-read by the context replay) with the FROZEN
 *      features of the information set (never re-read: a later twin version or graph change does not reach the replay).
 *   4. THE COMPARISON — one canonical digest (sha-256 over JCS) of the stored output and of the recomputed one: for a routed forecast its
 *      quantiles, its package's distribution and its outcome (the family's section of outcome_spec, without the issue's own annotations); for an
 *      ensemble MEMBER its quantiles and path (what the member row stores).
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { canonicalDigest, type ForecastReplayer, type ReplayAnswer, type ReplayRequest } from '../../shared/forecast-environment.js';
import { FamilyRefusal, codeDigestOf, runFamily, type Family, type ForecastKind, type PlannedEntry, type TargetRow } from './families.js';
import { addDays } from './methods/stats.js';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;
const day = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const round4 = (x: number): number => Number(x.toFixed(4));

/** The keys the routed issue adds to the family's outcome in outcome_spec (its annotations, not the family's computation). */
export const ISSUE_OUTCOME_KEYS: readonly string[] = ['target_key', 'family', 'language', 'target'];
const familyPart = (o: unknown): Row => Object.fromEntries(Object.entries(rec(o)).filter(([k]) => !ISSUE_OUTCOME_KEYS.includes(k)));

/** The legacy models' names: their rows are replayed by the per-method compute (forecast-environment's register), not here. */
const LEGACY_METHODS = new Set(['seasonal-naive', 'holt-winters-additive']);

export const ROUTED_REPLAYER_NAME = 'registry-family@1';

async function rows(tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> { return (await q.execute(tx)).rows as Row[]; }

/** The target version a routed forecast was computed against (and how it was resolved). */
async function pinnedTarget(tx: Tx, f: Row): Promise<{ target: TargetRow | null; version: number | null; resolvedBy: string; pinnedDigest: string | null }> {
  const key = typeof f['target_key'] === 'string' ? f['target_key'] : null;
  if (key === null) return { target: null, version: null, resolvedBy: 'no target (a series forecast)', pinnedDigest: null };
  const pin = rec(rec(f['outcome_spec'])['target']);
  let version: number | null = typeof pin['version'] === 'number' ? pin['version'] : null; let resolvedBy = 'the forecast\'s own pin (outcome_spec.target)';
  if (version === null) {
    const route = (await rows(tx, sql`select plan from prediction.forecast_routes where forecast_id = ${String(f['forecast_id'])}::uuid and outcome = 'issued' limit 1`))[0];
    const v = rec(rec(route?.['plan'])['target'])['version'];
    if (typeof v === 'number') { version = v; resolvedBy = 'the route the forecast was bound to (its plan\'s target)'; }
  }
  if (version === null) {
    const v = (await rows(tx, sql`select max(version)::int v from prediction.forecast_targets where target_key = ${key} and state in ('approved', 'retired')
      and decided_at <= ${f['issued_at'] as string}::timestamptz`))[0]?.['v'];
    if (typeof v === 'number') { version = v; resolvedBy = 'the highest version approved by the time the forecast was issued (no pin recorded)'; }
  }
  if (version === null) return { target: null, version: null, resolvedBy: 'unresolved', pinnedDigest: null };
  const t = (await rows(tx, sql`select target_key, version, kind, unit, title, definition, sources, subject_entity_id::text, risk_class from prediction.forecast_targets
    where target_key = ${key} and version = ${version}`))[0];
  return { target: t === undefined ? null : (t as unknown as TargetRow), version, resolvedBy, pinnedDigest: typeof pin['definition_digest'] === 'string' ? pin['definition_digest'] : null };
}

export const ROUTED_FAMILY_REPLAYER: ForecastReplayer = {
  name: ROUTED_REPLAYER_NAME,
  handles(f: Row): boolean {
    return typeof f['method_ref'] === 'string' && f['ensemble_role'] !== 'ensemble' && !String(f['method_ref']).startsWith('ensemble:') && !LEGACY_METHODS.has(String(f['method']));
  },
  async replay(r: ReplayRequest): Promise<ReplayAnswer> {
    const tx = r.tx as Tx; const f = r.forecast;
    const member = f['ensemble_role'] === 'member';
    const methodRef = String(f['method_ref']);
    const divergences: ReplayAnswer['divergences'] = [];
    const payload = member ? null : rec((await rows(tx, sql`select payload from objects.canonical_objects where object_type = 'FCT' and object_id = ${String(f['forecast_id'])}::uuid
      order by object_version desc limit 1`))[0]?.['payload']);
    const stored = member ? { quantiles: f['quantiles'] ?? null, path: f['path'] ?? [] }
      : { quantiles: f['quantiles'] ?? null, distribution: payload?.['distribution'] ?? null, outcome: familyPart(f['outcome_spec']) };
    const original = canonicalDigest(stored);
    const answer = (replayed: string | null, detail: Row): ReplayAnswer => ({ replayer: ROUTED_REPLAYER_NAME, originalOutputDigest: original, replayedOutputDigest: replayed, divergences, detail: { replayer: ROUTED_REPLAYER_NAME, method_ref: methodRef, ...detail } });

    // 1. THE PINNED ENTRY, and its implementation against this build's
    const e = (await rows(tx, sql`select method_ref, method_key, version, family, implementation_ref, implementation_digest, parameters, declarations, state
      from prediction.forecast_methods where tenant_id = ${String(f['tenant_id'])}::uuid and domain_id = ${String(f['domain_id'])}::uuid and method_ref = ${methodRef}`))[0];
    if (e === undefined) {
      divergences.push({ what: 'method', note: `the registry entry ${methodRef} is not readable in this domain; nothing pins what computed the forecast` });
      return answer(null, {});
    }
    const code = codeDigestOf(String(e['implementation_ref']));
    const implementation = { ref: e['implementation_ref'], pinned: e['implementation_digest'], build: code ?? null, match: code === e['implementation_digest'] };
    if (!implementation.match) {
      divergences.push({ what: 'implementation', original: e['implementation_digest'], replayed: code ?? null,
        note: `${methodRef} was approved for ${String(e['implementation_ref'])} ${String(e['implementation_digest']).slice(0, 12)}…; this build carries ${code === undefined ? 'no such implementation' : `${code.slice(0, 12)}…`} — not re-run (a steward approves a version for this build)` });
      return answer(null, { implementation });
    }
    // B25-F1: the method as the forecast PINNED it (a member's outcome_spec.method) must be the registry entry read now
    const mpin = rec(rec(f['outcome_spec'])['method']);
    if (mpin['pinned'] === true) {
      const checks: Array<[string, unknown, string]> = [['implementation', mpin['implementation_digest'], String(e['implementation_digest'])],
        ['method.parameters', mpin['parameters_digest'], canonicalDigest(rec(e['parameters']))], ['method.declarations', mpin['declarations_digest'], canonicalDigest(rec(e['declarations']))]];
      for (const [what, pinned, now] of checks) if (pinned !== now) divergences.push({ what, original: pinned, replayed: now, note: `${methodRef}'s registry row no longer matches what the forecast pinned (${what})` });
      if (divergences.length > 0) return answer(null, { implementation });
    }
    const entry: PlannedEntry = { method_ref: methodRef, method_key: String(e['method_key']), version: Number(e['version']), family: String(e['family']) as Family,
      implementation_ref: String(e['implementation_ref']), implementation_digest: String(e['implementation_digest']), parameters: rec(e['parameters']), declarations: rec(e['declarations']),
      confidence_language: String(rec(f['horizon_policy'])['confidence_language'] ?? '') };

    // 2. THE PINNED TARGET, by version
    const t = await pinnedTarget(tx, f);
    const targetDetail = { target_key: f['target_key'] ?? null, version: t.version, resolved_by: t.resolvedBy, definition_digest: t.target === null ? null : canonicalDigest(t.target.definition ?? {}) };
    if (f['target_key'] !== null && f['target_key'] !== undefined && t.target === null) {
      // B25-F1: a PINNED definition that cannot be read is the pinned definition diverging — never replaced by another version
      divergences.push({ what: t.pinnedDigest !== null ? 'target.definition' : 'target', ...(t.pinnedDigest !== null ? { original: t.pinnedDigest, replayed: null } : {}),
                         note: `target ${String(f['target_key'])} version ${t.version ?? '?'} could not be read (${t.resolvedBy})` });
      return answer(null, { implementation, target: targetDetail });
    }
    if (t.pinnedDigest !== null && t.pinnedDigest !== targetDetail.definition_digest) {
      divergences.push({ what: 'target.definition', original: t.pinnedDigest, replayed: targetDetail.definition_digest, note: 'the target version\'s definition no longer digests as pinned' });
    }

    // 3. THE FAMILY, re-run on the replayed points with the FROZEN features
    if (r.points.length < 8) {
      divergences.push({ what: 'output', note: `only ${r.points.length} observation(s) were readable at the pinned cut-offs; the family was not re-run` });
      return answer(null, { implementation, target: targetDetail });
    }
    const originAt = r.points[r.points.length - 1]!.date;
    const horizonDays = Number(f['horizon_days']);
    let result;
    try {
      result = runFamily(entry, { points: r.points, seriesKey: r.series.series_key, seriesUnit: r.series.unit, seasonality: Number(r.series.seasonality_days), horizonCode: String(f['horizon_code']),
        horizonDays, originAt, targetAt: addDays(originAt, horizonDays), kind: String(f['forecast_kind']) as ForecastKind,
        target: t.target, features: r.features, subjectEntityId: r.series.subject_entity_id });
    } catch (x) {
      divergences.push({ what: 'output', note: x instanceof FamilyRefusal ? `the family refused on the replayed inputs: ${x.message}` : `the family failed on the replayed inputs: ${(x as Error).message}` });
      return answer(null, { implementation, target: targetDetail });
    }

    // 4. THE COMPARISON, by the same canonical rule
    const q = json(result.quantiles) as Row;
    const recomputed = member
      ? { quantiles: { q10: round4(Number(q['q10'])), q50: round4(Number(q['q50'])), q90: round4(Number(q['q90'])) }, path: [] }
      : { quantiles: q, distribution: json(result.distribution), outcome: familyPart(json(result.outcome)) };
    const replayed = canonicalDigest(recomputed);
    if (replayed !== original) {
      divergences.push({ what: 'output', original: member ? stored.quantiles : { quantiles: stored.quantiles, distribution: (stored as Row)['distribution'] },
                         replayed: member ? recomputed.quantiles : { quantiles: q, distribution: result.distribution } });
    }
    const used = rec(result.outcome)['features_used'];
    return answer(replayed, { implementation, target: targetDetail, family: entry.family, origin_at: originAt, ensemble_member: member, replayed_quantiles: recomputed.quantiles,
      features: { frozen: r.features.length, used: Array.isArray(used) ? used : [] } });
  },
};
