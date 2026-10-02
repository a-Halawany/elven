/**
 * ExposureChanged@v1 — CP-6 B34 (0090 part `exposures`; F-P4-13's remainder, F-P6-07's opportunity class). The exposure routes DESCRIBE
 * the event in the SAME governed write as the port that changed the record (the pipeline enqueues it; never a trigger), with the prelude's
 * contract (apps/api/src/executive/attention/signal-contracts.ts). The payload is built from the record the port has just written, read in
 * that write's transaction under its RLS: the exposure row and the exposure.* event the port appended with THIS request's correlation.
 * No such event (a repeat the port answered idempotently — a second routing of the same residual) → no outbox row: an event says that
 * something changed, and nothing did.
 *
 *   kind                  the route                               the exposure.* event it carries
 *   assessment_accepted   …/versions/:v/accept                    exposure.assessment_accepted
 *   hypothesis_declared   …/hypotheses                            exposure.hypothesis_declared
 *   sponsored             …/versions/:v/sponsor                   exposure.sponsored
 *   appetite_breached     …/route (and the accept/control chain)  exposure.routed (the breach made actionable: submitted to the intake)
 *   contested             …/versions/:v/contest                   exposure.assessment_contested
 *   outcome_recorded      …/outcomes/review                       exposure.outcome_recorded
 *   closed                …/close                                 exposure.closed
 *
 * The consumer (the attention part) READS THE RECORD the event names; the payload is a hint and is never trusted for the item's facts.
 */
import type { ExposureChangeKind, ExposureChangedV1 } from '../../executive/attention/signal-contracts.js';
import type { ExposureReads } from './exposures.capabilities.js';

type Row = Record<string, unknown>;

export const EXPOSURE_EVENT_OF: Readonly<Record<ExposureChangeKind, string>> = Object.freeze({
  assessment_accepted: 'exposure.assessment_accepted',
  hypothesis_declared: 'exposure.hypothesis_declared',
  sponsored: 'exposure.sponsored',
  appetite_breached: 'exposure.routed',
  contested: 'exposure.assessment_contested',
  outcome_recorded: 'exposure.outcome_recorded',
  closed: 'exposure.closed',
});

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

/** The pure shape (unit-tested): the contract's fields from the exposure row, the event row and the objectives. */
export function exposureChangedPayload(x: Row, ev: Row, objectives: string[], kind: ExposureChangeKind, cause: { action: string; actor: string }): ExposureChangedV1 {
  const details = (ev['details'] ?? {}) as Row;
  const v = typeof details['version'] === 'number' ? details['version'] : (x['accepted_version'] ?? null);
  return {
    schema: 'ExposureChanged', schema_version: 1,
    temporal: { known_at: iso(ev['occurred_at']) },
    cause: { action: cause.action, actor: cause.actor, target_type: 'RSK', target_id: String(x['exposure_id']) },
    exposure_id: String(x['exposure_id']), polarity: x['polarity'] as 'risk' | 'opportunity', category_key: String(x['category_key']),
    version: v === null || v === undefined ? null : Number(v),
    change: { kind, event_id: String(ev['event_id']) },
    owner: String(x['owner_principal_id']), sponsor: x['sponsor_principal_id'] === null || x['sponsor_principal_id'] === undefined ? null : String(x['sponsor_principal_id']),
    state: String(x['state']), objectives,
  };
}

/** The outbox event of one exposure write, or null when the port appended no such event in this request. */
export async function exposureChangedEvent(cap: ExposureReads, a: { exposureId: string; kind: ExposureChangeKind; correlationId: string; action: string; actor: string }):
Promise<{ eventType: 'ExposureChanged'; payload: Record<string, unknown> } | null> {
  const ev = (await cap.readEvents().selectAll().where('exposure_id' as never, '=', a.exposureId as never).where('event' as never, '=', EXPOSURE_EVENT_OF[a.kind] as never)
    .where('correlation_id' as never, '=', a.correlationId as never).orderBy('occurred_at' as never, 'desc').orderBy('event_id' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
  if (ev === undefined) return null;
  const x = (await cap.readExposures().selectAll().where('exposure_id' as never, '=', a.exposureId as never).executeTakeFirst()) as Row | undefined;
  if (x === undefined) return null;
  const objectives = await cap.objectives(a.exposureId);
  return { eventType: 'ExposureChanged', payload: exposureChangedPayload(x, ev, objectives, a.kind, { action: a.action, actor: a.actor }) as unknown as Record<string, unknown> };
}
