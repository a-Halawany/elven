/**
 * B82-F mt — THE DEFINITION AND COMPUTATION VERSIONS TOGETHER. A metric's DEFINITION (analytics.metric_definitions: its contract, version and
 * approval) and the COMPUTATION that computes it (analytics.computation_registry: one row per computation key — the function, its version, the
 * migration section that registered it and the body digest) are versioned apart: a computation re-declared by a migration (MET-010 v2, 0120 §CL)
 * moves on while the approved definition stays where it was. Every read that shows a definition or a computed result therefore carries:
 *   - `computation` / `computation_now` — the registry row the definition's computation key names NOW (the version a computation will run);
 *   - per result, the computation key, version and body digest the result RECORDED when it was computed (analytics.metric_results).
 * The registry keeps ONE row per key: where an EARLIER computation version was registered is not kept anywhere — a result computed on an
 * earlier version says so (its recorded version and digest), never an inferred registration. Nothing here computes or decides; reads only.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

type Row = Record<string, unknown>;

/** The registry row of a computation key as jsonb (NULL when the key names none): a SQL fragment over a column naming the key. */
export const REGISTRY_ROW = (keyColumn: string) => sql.raw(`(select jsonb_build_object('computation_key', g.computation_key, 'function_name', g.function_name, 'version', g.version,
    'kind', g.kind, 'registered_in', g.registered_in, 'registered_at', g.registered_at, 'body_digest', g.body_digest, 'description', g.description)
  from analytics.computation_registry g where g.computation_key = ${keyColumn})`);

/** The registry rows of the named computation keys, by key. */
export async function registryByKey(tx: Tx, keys: Array<string | null | undefined>): Promise<Map<string, Row>> {
  const wanted = [...new Set(keys.filter((k): k is string => typeof k === 'string' && k !== ''))];
  if (wanted.length === 0) return new Map();
  const rs = (await sql<{ r: Row }>`select ${REGISTRY_ROW('x.k')} as r from unnest(${wanted}::text[]) x(k)`.execute(tx)).rows;
  return new Map(rs.filter((x) => x.r !== null).map((x) => [String(x.r['computation_key']), x.r]));
}

/** What each named result RECORDED of its computation (key, version, body digest), by result id (under the caller's RLS). */
export async function recordedComputations(tx: Tx, resultIds: string[]): Promise<Map<string, Row>> {
  const ids = [...new Set(resultIds.filter((x) => typeof x === 'string' && x !== ''))];
  if (ids.length === 0) return new Map();
  const rs = (await sql<Row>`select r.result_id::text as result_id, r.computation_key, r.computation_version, r.computation_digest
    from analytics.metric_results r where r.result_id = any (${ids}::uuid[])`.execute(tx)).rows;
  return new Map(rs.map((x) => [String(x['result_id']), x]));
}

const obj = (v: unknown): Row | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : null);

/**
 * THE OPERATING REVIEW READ, decorated (the SQL read is unchanged — its digest is over the review's own record): per metric block the registry
 * row its definition's (else its result's) computation key names NOW (`computation_now`), and per computed period of its series the
 * computation the period's result recorded, with the distinct versions listed and a note when they differ. The series' `comparable` flag stays
 * the SQL read's (it compares DEFINITION versions); the computation versions are said beside it, never folded into it.
 */
export function decorateReview(review: Row | null, registry: Map<string, Row>, recorded: Map<string, Row>): Row | null {
  if (review === null) return null;
  const metrics = Array.isArray(review['metrics']) ? (review['metrics'] as Row[]) : [];
  return { ...review, metrics: metrics.map((m) => decorateBlock(m, registry, recorded)) };
}
function decorateBlock(m: Row, registry: Map<string, Row>, recorded: Map<string, Row>): Row {
  const key = obj(m['definition'])?.['computation_key'] ?? obj(m['result'])?.['computation_key'] ?? null;
  const series = obj(m['series']);
  return { ...m, computation_now: typeof key === 'string' ? (registry.get(key) ?? null) : null, ...(series === null ? {} : { series: decorateSeries(series, recorded) }) };
}
export function decorateSeries(series: Row, recorded: Map<string, Row>): Row {
  const periods = Array.isArray(series['periods']) ? (series['periods'] as Row[]) : [];
  const out = periods.map((p) => {
    const rec = typeof p['result_id'] === 'string' ? recorded.get(p['result_id']) : undefined;
    return rec === undefined ? p : { ...p, computation_key: rec['computation_key'] ?? null, computation_version: rec['computation_version'] ?? null, computation_digest: rec['computation_digest'] ?? null };
  });
  const versions = [...new Set(out.filter((p) => p['status'] === 'computed' && p['computation_version'] !== null && p['computation_version'] !== undefined).map((p) => Number(p['computation_version'])))].sort((a, b) => a - b);
  return { ...series, periods: out, computation_versions: versions,
           computation_note: versions.length > 1 ? `the computed periods ran different computation versions (${versions.map((v) => `v${v}`).join(', ')}): each period says the version it ran` : null };
}
/** The result ids a review read cites or lists in its series. */
export function reviewResultIds(review: Row | null): string[] {
  if (review === null) return [];
  const ids: string[] = [];
  for (const m of Array.isArray(review['metrics']) ? (review['metrics'] as Row[]) : []) {
    const r = obj(m['result']); if (r !== null && typeof r['result_id'] === 'string') ids.push(r['result_id']);
    for (const p of Array.isArray(obj(m['series'])?.['periods']) ? (obj(m['series'])!['periods'] as Row[]) : []) if (typeof p['result_id'] === 'string') ids.push(p['result_id']);
  }
  return ids;
}
/** The computation keys a review read's blocks name (definition first, else the cited result). */
export function reviewComputationKeys(review: Row | null): string[] {
  if (review === null) return [];
  return (Array.isArray(review['metrics']) ? (review['metrics'] as Row[]) : [])
    .map((m) => obj(m['definition'])?.['computation_key'] ?? obj(m['result'])?.['computation_key'] ?? null)
    .filter((k): k is string => typeof k === 'string');
}
