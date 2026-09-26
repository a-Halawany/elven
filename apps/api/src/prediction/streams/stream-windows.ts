/**
 * EVENT-TIME WINDOWS AND WATERMARKS — the pure model of CP-6 B28's stream engine (0088 §S, F-P4-11).
 *
 * THE DATABASE IS AUTHORITATIVE: prediction.stream_step and prediction.ingest_stream_input decide every window, label and signal
 * inside the consumer's governed write. This module is the same rules written once more, without a database, for three uses:
 *
 *   * VALIDATING a rule definition before the port (the route answers 422 in the product's words; the port re-checks everything);
 *   * the web page's arithmetic (which days a window spans, how late an input was) — `apps/web/lib/streams.ts` mirrors the helpers;
 *   * a DIFFERENTIAL CHECK: `simulate` replays a sequence of arrival batches through the same geometry, watermark, lateness,
 *     aggregation and emission rules, so a harness can compare what the database emitted with what the rules say it must.
 *
 * The rules, stated once:
 *   - EVENT TIME is a day (the series parsers yield days). The WATERMARK is the highest event time ingested minus the lag — never the
 *     wall clock. A window [origin + k·slide, … + length) FIRES only when watermark >= its end; it CLOSES when watermark >= end +
 *     allowed lateness.
 *   - An input's LATENESS is judged against the watermark at its arrival, by the windows containing its day: a closed (or past-allowance)
 *     window → late_beyond_allowance; a fired (or due) one → late_within_allowance; otherwise on_time. The worst of them is its label.
 *   - A window's value: per day the latest arrival's value; `hits` the days satisfying the comparator; the predicate HOLDS when hits >=
 *     min_hits, FAILS when even the missing days could not reach it, and is UNDETERMINED (null) otherwise.
 *   - A due window never fired whose every input arrived beyond the allowance is closed unevaluated (late_excluded); a gap (a due window
 *     with no observation) fires as the partial window it is; a fired window re-judged by a later input emits `revised` only when its
 *     value moved (a duplicate emits nothing).
 */

export type Comparator = 'lt' | 'le' | 'gt' | 'ge';
export interface Predicate { comparator: Comparator; threshold: number; min_hits: number }
export interface RuleGeometry {
  windowKind: 'tumbling' | 'sliding';
  windowDays: number;
  slideDays: number;
  /** The day windows align to (YYYY-MM-DD). */
  windowOrigin: string;
  allowedLatenessMs: number;
  watermarkLagMs: number;
  predicate: Predicate;
}
export type Lateness = 'on_time' | 'late_within_allowance' | 'late_beyond_allowance';
export type Disposition = 'new' | 'duplicate' | 'revision';
export type WindowStatus = 'open' | 'fired' | 'revised' | 'closed';
export type SignalLabel = 'on_time' | 'late_window' | 'partial_window';

export const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A day's instant (UTC midnight, ms) and back. */
export const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
export const msDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => msDay(dayMs(day) + n * DAY_MS);
const fdiv = (a: number, b: number): number => Math.floor(a / b);
const daysBetween = (from: string, to: string): number => Math.round((dayMs(to) - dayMs(from)) / DAY_MS);

/** The window with index k: [origin + k·slide, origin + k·slide + length). */
export function windowAt(g: Pick<RuleGeometry, 'windowOrigin' | 'windowDays' | 'slideDays'>, k: number): { start: string; end: string } {
  return { start: addDays(g.windowOrigin, k * g.slideDays), end: addDays(g.windowOrigin, k * g.slideDays + g.windowDays) };
}
/** The indices of the windows containing a day (one for tumbling, windowDays / slideDays for sliding). */
export function windowsContaining(g: Pick<RuleGeometry, 'windowOrigin' | 'windowDays' | 'slideDays'>, day: string): number[] {
  const di = daysBetween(g.windowOrigin, day);
  const lo = fdiv(di - g.windowDays + g.slideDays, g.slideDays);
  const hi = fdiv(di, g.slideDays);
  const out: number[] = [];
  for (let k = lo; k <= hi; k += 1) out.push(k);
  return out;
}
/** The watermark: the highest event time minus the lag (null before any input). */
export const watermarkOf = (maxEventMs: number | null, lagMs: number): number | null => (maxEventMs === null ? null : maxEventMs - lagMs);

/** The comparator. */
export function compare(v: number, c: Comparator, threshold: number): boolean {
  return c === 'lt' ? v < threshold : c === 'le' ? v <= threshold : c === 'gt' ? v > threshold : v >= threshold;
}

/** A window's value from its days' standing values. */
export function aggregate(days: ReadonlyMap<string, number>, windowDays: number, p: Predicate): { n: number; hits: number; holds: boolean | null } {
  const values = [...days.values()];
  const n = values.length;
  const hits = values.filter((v) => compare(v, p.comparator, p.threshold)).length;
  const holds = hits >= p.min_hits ? true : hits + (windowDays - n) < p.min_hits ? false : null;
  return { n, hits, holds };
}

/**
 * THE LATENESS of an input for a day at arrival: the windows containing it, their status at arrival (absent: judged by the watermark
 * alone), the watermark and the allowance — the worst of them.
 */
export function classifyLateness(g: Pick<RuleGeometry, 'windowOrigin' | 'windowDays' | 'slideDays' | 'allowedLatenessMs'>, day: string,
                                 statusOf: (windowStart: string) => WindowStatus | undefined, watermarkMs: number | null): Lateness {
  let worst = 0;
  for (const k of windowsContaining(g, day)) {
    const w = windowAt(g, k);
    const st = statusOf(w.start);
    if (st === 'closed') worst = Math.max(worst, 2);
    else if (st === 'fired' || st === 'revised') worst = Math.max(worst, 1);
    else if (watermarkMs !== null && dayMs(w.end) <= watermarkMs) worst = Math.max(worst, dayMs(w.end) + g.allowedLatenessMs <= watermarkMs ? 2 : 1);
  }
  return worst === 2 ? 'late_beyond_allowance' : worst === 1 ? 'late_within_allowance' : 'on_time';
}

/** What the route checks before the port (the port re-checks all of it): the product's own sentence, or null. */
export function ruleDefinitionProblem(p: Record<string, unknown>): string | null {
  if (typeof p['ruleKey'] !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(p['ruleKey'])) return 'ruleKey is 3..80 characters of a-z 0-9 . _ - (starting with a letter or digit)';
  if (typeof p['title'] !== 'string' || p['title'].trim().length < 3 || p['title'].trim().length > 300) return 'title is 3..300 characters';
  if (typeof p['seriesKey'] !== 'string' || p['seriesKey'].trim().length < 2) return 'seriesKey names a registered series';
  if (p['windowKind'] !== 'tumbling' && p['windowKind'] !== 'sliding') return "windowKind is 'tumbling' or 'sliding'";
  const wd = p['windowDays'];
  if (typeof wd !== 'number' || !Number.isInteger(wd) || wd < 1 || wd > 366) return 'windowDays is an integer 1..366';
  const sd = p['slideDays'] ?? (p['windowKind'] === 'tumbling' ? wd : undefined);
  if (typeof sd !== 'number' || !Number.isInteger(sd) || sd < 1 || sd > wd) return 'slideDays is an integer 1..windowDays';
  if (p['windowKind'] === 'tumbling' && sd !== wd) return 'a tumbling window slides by its own length (slideDays = windowDays)';
  if (typeof p['windowOrigin'] !== 'string' || !DAY_RE.test(p['windowOrigin']) || Number.isNaN(dayMs(p['windowOrigin']))) return 'windowOrigin is the day windows align to (YYYY-MM-DD)';
  for (const [k, lo, hi] of [['allowedLatenessHours', 0, 366 * 24], ['watermarkLagHours', 0, 366 * 24], ['stallAfterSeconds', 1, 30 * 86_400]] as const) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return `${k} is an integer ${lo}..${hi}`;
  }
  const pred = p['predicate'] as Record<string, unknown> | undefined;
  if (pred === undefined || pred === null || typeof pred !== 'object' || Array.isArray(pred)
      || !['lt', 'le', 'gt', 'ge'].includes(String(pred['comparator'])) || typeof pred['threshold'] !== 'number' || !Number.isFinite(pred['threshold'])
      || typeof pred['min_hits'] !== 'number' || !Number.isInteger(pred['min_hits']) || pred['min_hits'] < 1 || pred['min_hits'] > wd
      || Object.keys(pred).some((k) => !['comparator', 'threshold', 'min_hits'].includes(k))) {
    return 'predicate is {comparator: lt|le|gt|ge, threshold: number, min_hits: 1..windowDays} and nothing else';
  }
  if (!['C1', 'C2', 'C3', 'C4'].includes(String(p['consequenceClass']))) return 'consequenceClass is C1..C4';
  const rh = p['responseWindowHours'];
  if (rh !== undefined && rh !== null && (typeof rh !== 'number' || !Number.isInteger(rh) || rh < 1 || rh > 8760)) return 'responseWindowHours is an integer 1..8760';
  const ce = p['checkpointEvery'];
  if (ce !== undefined && (typeof ce !== 'number' || !Number.isInteger(ce) || ce < 1 || ce > 100)) return 'checkpointEvery is an integer 1..100';
  if (typeof p['ownerPrincipalId'] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p['ownerPrincipalId'])) return 'ownerPrincipalId is a principal id';
  return null;
}

/* ───────────────────────── the differential model ───────────────────────── */

export interface SimInput { key: string; day: string; value: number }
export interface SimEmission { windowStart: string; windowEnd: string; emission: 'fired' | 'revised'; revision: number; label: SignalLabel; n: number; hits: number; holds: boolean | null }
export interface SimResult {
  inputs: Array<{ key: string; day: string; lateness: Lateness; disposition: Disposition; watermarkAtArrival: string | null }>;
  emissions: SimEmission[];
  windows: Array<{ start: string; status: WindowStatus; lateExcluded: number; n: number; holds: boolean | null }>;
  watermark: string | null;
  repeated: number;
}

/**
 * Replay ARRIVAL BATCHES (one batch per ingest call: one evidence version's points) through the rules and answer what must have been
 * stored and emitted. `incomplete` lists the date ranges [from, to) declared incomplete (applied to every window they overlap).
 * The same key twice is a repeat (no input); a different value under the same key is the port's 409, which this model throws.
 */
export function simulate(g: RuleGeometry, batches: SimInput[][], incomplete: Array<{ from: string; to: string }> = []): SimResult {
  type Stored = { seq: number; key: string; day: string; value: number; lateness: Lateness };
  const stored: Stored[] = [];
  const byKey = new Map<string, number>();
  const out: SimResult = { inputs: [], emissions: [], windows: [], watermark: null, repeated: 0 };
  const windows = new Map<string, { status: WindowStatus; closedSeq: number; lateExcluded: number; n: number; holds: boolean | null; standing: string | null; revisions: number }>();
  let maxEvent: number | null = null; let watermark: number | null = null; let seq = 0;

  const aggUpTo = (start: string, end: string, upto: number) => {
    const days = new Map<string, number>();
    for (const s of stored) if (s.seq <= upto && s.day >= start && s.day < end) days.set(s.day, s.value); // arrival order: the latest wins
    const a = aggregate(days, g.windowDays, g.predicate);
    return { ...a, sig: JSON.stringify([...days.entries()].sort()) };
  };
  const partial = (start: string, end: string, n: number) => incomplete.some((r) => r.from < end && r.to > start) || n < g.windowDays;

  for (const batch of batches) {
    const since = seq;
    for (const i of batch) {
      const held = byKey.get(i.key);
      if (held !== undefined) {
        if (held !== i.value) throw new Error(`stream input rejected (value_conflict): ${i.key} is held with value ${held}, not ${i.value}`);
        out.repeated += 1;
        continue;
      }
      const prior = [...stored].reverse().find((s) => s.day === i.day);
      const lateness = classifyLateness(g, i.day, (ws) => windows.get(ws)?.status, watermark);
      seq += 1;
      stored.push({ seq, key: i.key, day: i.day, value: i.value, lateness });
      byKey.set(i.key, i.value);
      out.inputs.push({ key: i.key, day: i.day, lateness, disposition: prior === undefined ? 'new' : prior.value === i.value ? 'duplicate' : 'revision',
                        watermarkAtArrival: watermark === null ? null : new Date(watermark).toISOString() });
      maxEvent = maxEvent === null ? dayMs(i.day) : Math.max(maxEvent, dayMs(i.day));
    }
    if (seq === since) continue;
    // THE STEP
    const w = watermarkOf(maxEvent, g.watermarkLagMs);
    if (w !== null && (watermark === null || w > watermark)) watermark = w;
    if (watermark === null) continue;
    const W = watermark;
    const upto = seq;
    const live = stored.filter((s) => s.lateness !== 'late_beyond_allowance');
    const first = live.length === 0 ? null : Math.min(...live.map((s) => Math.min(...windowsContaining(g, s.day))));
    let dueHi = fdiv(daysBetween(g.windowOrigin, msDay(W)) - g.windowDays, g.slideDays);
    while (dayMs(windowAt(g, dueHi).end) > W) dueHi -= 1;
    while (dayMs(windowAt(g, dueHi + 1).end) <= W) dueHi += 1;
    const openHi = fdiv(daysBetween(g.windowOrigin, msDay(maxEvent as number)), g.slideDays);
    const ks = new Set<number>();
    for (const s of stored) if (s.seq > since) for (const k of windowsContaining(g, s.day)) ks.add(k);
    for (const [ws, st] of windows) if (st.status !== 'closed') ks.add(fdiv(daysBetween(g.windowOrigin, ws), g.slideDays));
    if (first !== null) for (let k = Math.max(first, dueHi - 366); k <= openHi; k += 1) if (windows.get(windowAt(g, k).start)?.status !== 'closed') ks.add(k);

    for (const k of [...ks].sort((a, b) => a - b)) {
      const { start, end } = windowAt(g, k);
      const row = windows.get(start);
      const touched = stored.some((s) => s.seq > since && s.day >= start && s.day < end);
      if (row?.status === 'closed') {
        row.lateExcluded = stored.filter((s) => s.day >= start && s.day < end && s.seq > row.closedSeq).length;
        continue;
      }
      if (row !== undefined && (row.status === 'fired' || row.status === 'revised') && !touched) {
        if (dayMs(end) + g.allowedLatenessMs <= W) { row.status = 'closed'; row.closedSeq = upto; }
        continue;
      }
      const a = aggUpTo(start, end, upto);
      const lateN = stored.filter((s) => s.day >= start && s.day < end && s.lateness !== 'on_time').length;
      if (dayMs(end) > W) {
        windows.set(start, { status: 'open', closedSeq: 0, lateExcluded: 0, n: a.n, holds: a.holds, standing: row?.standing ?? null, revisions: row?.revisions ?? 0 });
        continue;
      }
      if ((row === undefined || row.status === 'open') && dayMs(end) + g.allowedLatenessMs <= W) {
        const inW = stored.filter((s) => s.day >= start && s.day < end);
        if (inW.length > 0 && inW.every((s) => s.lateness === 'late_beyond_allowance')) {
          windows.set(start, { status: 'closed', closedSeq: 0, lateExcluded: inW.length, n: 0, holds: null, standing: null, revisions: 0 });
          continue;
        }
      }
      const standing = row?.standing ?? null;
      const cur = row ?? { status: 'open' as WindowStatus, closedSeq: 0, lateExcluded: 0, n: 0, holds: null, standing: null, revisions: 0 };
      cur.n = a.n; cur.holds = a.holds;
      if (standing !== null && standing === a.sig) {
        if (cur.status === 'open') cur.status = 'fired';
      } else {
        const label: SignalLabel = partial(start, end, a.n) ? 'partial_window' : lateN > 0 || standing !== null ? 'late_window' : 'on_time';
        const emission = cur.revisions > 0 ? 'revised' : 'fired';
        out.emissions.push({ windowStart: start, windowEnd: end, emission, revision: cur.revisions, label, n: a.n, hits: a.hits, holds: a.holds });
        cur.revisions += 1; cur.standing = a.sig; cur.status = emission === 'revised' ? 'revised' : 'fired';
      }
      if (dayMs(end) + g.allowedLatenessMs <= W) { cur.status = 'closed'; cur.closedSeq = upto; }
      windows.set(start, cur);
    }
  }
  out.watermark = watermark === null ? null : new Date(watermark).toISOString();
  out.windows = [...windows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, r]) => ({ start, status: r.status, lateExcluded: r.lateExcluded, n: r.n, holds: r.holds }));
  return out;
}
