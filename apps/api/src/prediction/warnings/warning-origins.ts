/**
 * THE WARNINGS CONSUMER'S READING OF A GRAPH CHANGE — CP-6 B28 (0088 §W; F-P4-12), the pure half (unit-tested).
 *
 * A GraphChanged event names what changed and what the walk reached (graph-change.ts). Three of its readings are ORIGINS of a warning
 * other than an indicator breach — each becomes a warning CANDIDATE (0088 §0's intake), never a warning:
 *
 *   graph_impact       an invalidation, a retracted edge, a revoked import or a split entity whose walk REACHED an objective — one item per
 *                      objective reached (the cause: the invalidation, else the event); the objective is the affected one.
 *   forecast_revision  a forecast superseded, withdrawn or assessed unfit — one item per forecast named (the cause: the forecast; a later
 *                      revision of the same forecast folds into the warning its first one raised).
 *   twin_degradation   a twin's version admitted (twin.state_changed: the superseded version's runs stand on a basis that moved) or a twin
 *                      the walk reached (its cited inputs changed; the twins consumer marks it unverified) — one item per twin.
 *
 * The item key is `<origin>:<id>`; the candidate's origin_key is `<event id>:<item>`, so a redelivered or replayed event submits
 * nothing twice (the intake is idempotent on it).
 */
import type { ChangeEvent, GraphChangedPayload } from '../../graph/subscriptions/graph-change.js';

export type WarningOrigin = 'graph_impact' | 'forecast_revision' | 'twin_degradation';
export const WARNING_ORIGINS: readonly WarningOrigin[] = ['graph_impact', 'forecast_revision', 'twin_degradation'];
/* B32 (0089) exposures: EVERY origin a warning can carry — the CHECKs of prediction.warnings_current / warning_candidates (0088 §0, widened by
   0089 §R1): an indicator breach (every warning before B28), the B28 origins, and `exposure` — an exposure's residual outside its appetite,
   submitted by prediction.route_exposure under prediction.exposure.route and routed by the preflight to the EXPOSURE'S OWNER (PER-10). This
   consumer makes only the three above; the list is the vocabulary the reads and the page word. */
export const ALL_WARNING_ORIGIN_KINDS = ['indicator_breach', 'stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation', 'exposure'] as const;
export type AnyWarningOrigin = (typeof ALL_WARNING_ORIGIN_KINDS)[number];
/* end B32 exposures */

/** The change kinds whose walk reaching an objective is a graph impact. */
export const GRAPH_IMPACT_KINDS = ['invalidation.assessed', 'edge.retracted', 'import.revoked', 'entity.split'] as const;
/** The change kinds that revise a forecast. */
export const FORECAST_REVISION_KINDS = ['forecast.superseded', 'forecast.withdrawn', 'forecast.fitness_changed'] as const;
/** The kinds whose reached twins are NOT a degradation: a revision of a forecast is read as itself; a projection rebuild changes no fact. */
const NOT_TWIN_DEGRADATION = new Set<string>(['projection.rebuilt', 'forecast.fitness_changed']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID.test(x)).map((x) => x.toLowerCase()) : []);

/** The items a GraphChanged means for the warnings consumer, sorted and unique. A MemoryCorrected (not selected by this kind) means nothing. */
export function warningOriginItems(event: ChangeEvent): string[] {
  if (event.event_type !== 'GraphChanged') return [];
  const p = event.payload as Partial<GraphChangedPayload>;
  const kind = String(p.change?.kind ?? '');
  const o = (p.objects ?? {}) as Partial<GraphChangedPayload['objects']>;
  const items = new Set<string>();
  if ((GRAPH_IMPACT_KINDS as readonly string[]).includes(kind)) for (const id of ids(o.objectives)) items.add(`graph_impact:${id}`);
  if ((FORECAST_REVISION_KINDS as readonly string[]).includes(kind)) {
    for (const id of ids(o.forecasts)) items.add(`forecast_revision:${id}`);
    const typed = kind === 'forecast.withdrawn' ? p.forecast?.forecast_id : kind === 'forecast.fitness_changed' ? p.forecast_fitness?.forecast_id : undefined;
    for (const id of ids([typed])) items.add(`forecast_revision:${id}`);
  }
  if (kind === 'twin.state_changed') for (const id of ids([p.twin?.twin_id, ...(o.twins ?? [])])) items.add(`twin_degradation:${id}`);
  else if (!NOT_TWIN_DEGRADATION.has(kind)) for (const id of ids(o.twins)) items.add(`twin_degradation:${id}`);
  return [...items].sort();
}

/** An item read back: its origin and the subject it names, or null for a key this consumer never makes. */
export function readOriginItem(item: string): { origin: WarningOrigin; subjectId: string } | null {
  const m = /^(graph_impact|forecast_revision|twin_degradation):([0-9a-f-]{36})$/i.exec(item);
  return m === null || !UUID.test(m[2] as string) ? null : { origin: m[1] as WarningOrigin, subjectId: (m[2] as string).toLowerCase() };
}

/** What the consumer knows of the subject when it builds the candidate (read under its own capability). */
export interface OriginFacts {
  /** graph_impact: the objective's title; forecast_revision: the forecast's series and horizon; twin_degradation: the twin's title. */
  label: string | null;
  horizon: string | null;
}

export interface CandidateIntake {
  originKind: WarningOrigin; originKey: string; originRef: Record<string, unknown>; title: string; consequenceClass: 'C2'; confidence: null;
  causeKey: string; affected: { objectives: string[]; assets: string[]; actors: string[]; geographies: string[]; horizon: string | null };
  evidence: Array<Record<string, unknown>>; windowHours: null;
}

/**
 * THE CANDIDATE of one item. The consequence class is C2 for the three origins (the consumer's declared rule: a graph impact, a forecast
 * revision or a twin degradation is decision support — it decides nothing by itself); the CONFIDENCE is not stated (null — the origin is a
 * recorded change, not an estimate; the raise records the neutral value and says so); the window is the raise's default.
 */
export function candidateOf(event: ChangeEvent & { event_type: 'GraphChanged' }, item: string, facts: OriginFacts, subscriptionId: string): CandidateIntake | null {
  const it = readOriginItem(item);
  if (it === null) return null;
  const p = event.payload;
  const kind = String(p.change?.kind ?? '');
  const reachedObjectives = ids(p.objects?.objectives).sort();
  const base = { event_id: event.event_id, change_kind: kind, item, subscription_id: subscriptionId, cause: p.cause ?? null, occurred_at: p.change?.occurred_at ?? null, synthetic: false };
  const label = facts.label ?? `${it.subjectId.slice(0, 8)}…`;
  if (it.origin === 'graph_impact') {
    const cause = typeof p.change?.invalidation_id === 'string' && p.change.invalidation_id !== '' ? p.change.invalidation_id : event.event_id;
    return {
      originKind: 'graph_impact', originKey: `${event.event_id}:${item}`, originRef: { ...base, objective_id: it.subjectId, invalidation_id: p.change?.invalidation_id ?? null },
      title: `Graph impact on objective "${label.slice(0, 200)}" (${kind})`, consequenceClass: 'C2', confidence: null,
      causeKey: `graph:${cause}`, affected: { objectives: [it.subjectId], assets: [], actors: [], geographies: [], horizon: null },
      evidence: [{ object_id: it.subjectId, stance: 'supporting', kind: 'objective_reached' }], windowHours: null,
    };
  }
  if (it.origin === 'forecast_revision') {
    return {
      originKind: 'forecast_revision', originKey: `${event.event_id}:${item}`, originRef: { ...base, forecast_id: it.subjectId },
      title: `Forecast ${label.slice(0, 200)} revised (${kind})`, consequenceClass: 'C2', confidence: null,
      causeKey: `forecast:${it.subjectId}`, affected: { objectives: reachedObjectives, assets: [], actors: [], geographies: [], horizon: facts.horizon },
      evidence: [{ object_id: it.subjectId, stance: 'supporting', kind: 'forecast_revised' }], windowHours: null,
    };
  }
  return {
    originKind: 'twin_degradation', originKey: `${event.event_id}:${item}`,
    originRef: { ...base, twin_id: it.subjectId, twin_version: kind === 'twin.state_changed' ? (p.twin?.version ?? null) : null, runs_of_superseded: kind === 'twin.state_changed' ? (p.twin?.runs_of_superseded ?? null) : null },
    title: `Twin "${label.slice(0, 200)}" degraded (${kind})`, consequenceClass: 'C2', confidence: null,
    causeKey: `twin:${it.subjectId}`, affected: { objectives: reachedObjectives, assets: [it.subjectId], actors: [], geographies: [], horizon: null },
    evidence: [{ object_id: it.subjectId, stance: 'supporting', kind: 'twin_degraded' }], windowHours: null,
  };
}
