/**
 * B34 (0090 part `attention`) — THE THREE NEW SIGNALS as the attention consumer reads them, and HealthScoreChanged@v1 as the health
 * compute route builds it. The contracts are the prelude's (signal-contracts.ts); a payload that is not the contract answers a reason
 * (the consumer QUARANTINES it — invalid_event → human_review). The payload is a HINT: the consumer reads the record it names.
 *
 *   ExposureChanged@v1     emitted by the exposure routes (the exposures part)       → opportunity.raised (an opportunity; a risk arrives as warning.raised)
 *   HealthScoreChanged@v1  emitted by POST …/executive/health/compute (THIS part)    → health.change (review, never action)
 *   CommitmentChanged@v1   emitted by the commitment routes (the commitments part)   → commitment.due | commitment.breach, the item read ONLY through
 *                                                                                      decision.commitment_item_signal (the prelude's contract)
 */
import type { OutboxRow } from '../../graph/subscriptions/change-events.js';
import { COMMITMENT_CHANGE_KINDS, EXPOSURE_CHANGE_KINDS, type HealthScoreChangedV1 } from './signal-contracts.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export type ExposureSignal = { exposureId: string; polarity: string; change: string; eventId: string };
export type HealthSignal = { changeId: string; snapshotId: string; subject: string };
export type CommitmentSignal = { commitmentId: string; itemId: string | null; change: string; eventId: string };

/** ExposureChanged@v1: the exposure, its polarity and the change (the kind one of the contract's). */
export function readExposureChanged(p: Row): ExposureSignal | string {
  if (p['schema'] !== 'ExposureChanged') return 'not an ExposureChanged@v1 payload';
  if (!isUuid(p['exposure_id'])) return 'exposure_id is not a uuid';
  if (p['polarity'] !== 'risk' && p['polarity'] !== 'opportunity') return 'polarity is neither risk nor opportunity';
  const c = (p['change'] ?? {}) as Row;
  if (typeof c['kind'] !== 'string' || !(EXPOSURE_CHANGE_KINDS as readonly string[]).includes(c['kind'])) return 'change.kind is not an exposure change kind';
  if (!isUuid(c['event_id'])) return 'change.event_id is not a uuid';
  return { exposureId: p['exposure_id'], polarity: p['polarity'], change: c['kind'], eventId: c['event_id'] };
}

/** HealthScoreChanged@v1: the change and its snapshot. */
export function readHealthScoreChanged(p: Row): HealthSignal | string {
  if (p['schema'] !== 'HealthScoreChanged') return 'not a HealthScoreChanged@v1 payload';
  if (!isUuid(p['change_id']) || !isUuid(p['snapshot_id'])) return 'change_id / snapshot_id is not a uuid';
  if (typeof p['subject'] !== 'string' || p['subject'] === '') return 'subject is missing';
  return { changeId: p['change_id'], snapshotId: p['snapshot_id'], subject: p['subject'] };
}

/** CommitmentChanged@v1: the commitment, the item (null: the commitment itself) and the change. */
export function readCommitmentChanged(p: Row): CommitmentSignal | string {
  if (p['schema'] !== 'CommitmentChanged') return 'not a CommitmentChanged@v1 payload';
  if (!isUuid(p['commitment_id'])) return 'commitment_id is not a uuid';
  if (p['item_id'] !== null && p['item_id'] !== undefined && !isUuid(p['item_id'])) return 'item_id is not a uuid';
  const c = (p['change'] ?? {}) as Row;
  if (typeof c['kind'] !== 'string' || !(COMMITMENT_CHANGE_KINDS as readonly string[]).includes(c['kind'])) return 'change.kind is not a commitment change kind';
  if (!isUuid(c['event_id'])) return 'change.event_id is not a uuid';
  return { commitmentId: p['commitment_id'], itemId: (p['item_id'] as string | null | undefined) ?? null, change: c['kind'], eventId: c['event_id'] };
}

/** The commitment item's class from the SIGNAL CONTRACT's answer: breach (overdue, an open exception, in exception or re-tasking), due (open or in progress with a deadline), or none (settled). */
export function commitmentClassOf(sig: Row): 'commitment.breach' | 'commitment.due' | null {
  const state = String(sig['state'] ?? '');
  if (['done', 'waived', 'cancelled'].includes(state)) return null;
  if (sig['overdue'] === true || Number(sig['open_exceptions'] ?? 0) > 0 || state === 'exception' || state === 'retask_required') return 'commitment.breach';
  if ((state === 'open' || state === 'in_progress') && sig['due_at'] !== null && sig['due_at'] !== undefined) return 'commitment.due';
  return null;
}

/**
 * THE HEALTH CHANGE's transparent dimensions: consequence C3 for an UNFAVOURABLE band crossing of the aggregate, C2 for any other
 * unfavourable change, C1 for a favourable or a determinacy change; confidence = the snapshot's coverage (the share of the model its
 * inputs covered — a number the snapshot recorded).
 */
export function healthConsequence(change: Row): 'C1' | 'C2' | 'C3' {
  const triggers = Array.isArray(change['triggers']) ? (change['triggers'] as unknown[]).map(String) : [];
  if (change['direction'] !== 'unfavourable') return 'C1';
  return change['subject'] === 'aggregate' && triggers.includes('band_crossing') ? 'C3' : 'C2';
}

/** HealthScoreChanged@v1 — one per change the compute RAISED, built from the port's answer (the snapshot and its changes), in the same write. */
export function healthScoreChangedEvents(snapshot: Row, actor: string): OutboxRow[] {
  const changes = Array.isArray(snapshot['changes']) ? (snapshot['changes'] as Row[]) : [];
  return changes.map((c) => {
    const payload: HealthScoreChangedV1 = {
      schema: 'HealthScoreChanged', schema_version: 1,
      temporal: { known_at: iso(c['raised_at'] ?? snapshot['computed_at']) ?? new Date(0).toISOString() },
      cause: { action: 'executive.health.compute', actor, target_type: 'HSS', target_id: String(snapshot['snapshot_id']) },
      change_id: String(c['change_id']), snapshot_id: String(c['snapshot_id'] ?? snapshot['snapshot_id']), prior_snapshot_id: (c['prior_snapshot_id'] as string | null | undefined) ?? null,
      definition_id: String(c['definition_id'] ?? snapshot['definition_id']), definition_version: Number(c['definition_version'] ?? snapshot['definition_version']),
      subject: String(c['subject']), from_value: num(c['from_value']), to_value: num(c['to_value']), delta: num(c['delta']),
      from_band: (c['from_band'] as string | null | undefined) ?? null, to_band: (c['to_band'] as string | null | undefined) ?? null,
      triggers: Array.isArray(c['triggers']) ? (c['triggers'] as unknown[]).map(String) : [], direction: (c['direction'] as string | null | undefined) ?? null, state: String(c['state'] ?? 'raised'),
    };
    return { eventType: 'HealthScoreChanged', payload: payload as unknown as Record<string, unknown> };
  });
}
