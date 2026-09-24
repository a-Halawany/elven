/**
 * MaterialChangeRaised@v1 — CP-6 B23 (migration 0084; interface L10-I02: "Routes change to accountable roles based on consequence,
 * confidence, urgency, and attention policy"; reliability "At-least-once delivery; consumer deduplication and checkpoint"; failure
 * "Quarantine invalid event; reconcile committed publication").
 *
 * THE PRODUCER is the decisions subscriber: when a change reaches a package it cites and the exposure's class is `material_change` (a
 * cited forecast withdrawn or assessed unfit, a cited run invalidated, a recomputation at or beyond the declared materiality rule), and
 * the package note is NEW (decision.note_input_invalidated answered true — once per cause), the item's write returns this event and the
 * pipeline enqueues it in the SAME transaction as the note (0066 §2): the publication is committed with the note or not at all.
 *
 * THE TRANSPARENT DIMENSIONS (ES-47-002: no opaque score creates urgency), each with the rule that sets it:
 *   consequence      C3 when the decision was EXECUTED (committed, monitored, or reopened over a standing commitment — compensation or
 *                    a reopen is a consequential act on the world), C2 otherwise (an open decision's recommendation basis moved — a
 *                    decision-support review).
 *   confidence       how certain it is that the basis changed materially: 1 for a RECORDED categorical loss (withdrawn, invalidated) and
 *                    for a recomputation MEASURED at or beyond the rule; 0.8 for an assessment under the fitness rule (the forecast is
 *                    not withdrawn — the owner decides); 0.5 when the recomputation is unmeasurable (it cannot be shown immaterial,
 *                    nor shown material).
 *   hours_to_window  hours from publication to the decision deadline of the package's current version (negative when it has passed),
 *                    or null when the version names none.
 * The attention-policy version ACTIVE at publication rides the payload (null when the domain has none — the engine will abstain);
 * the consumer judges under the version active at DELIVERY, and the item names that one.
 *
 * THE CONTRACT the attention consumer reads (readMaterialChange): a payload that is not it is QUARANTINED (invalid_event →
 * human_review, 0083) — never applied, never dropped.
 */
import type { OutboxRow } from '../../graph/subscriptions/change-events.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONSEQUENCE = /^C[0-4]$/;

/** What moved: the lifecycle kinds (a categorical loss), the fitness kind (an assessment), a recomputation (measured, or not measurable). */
export type MaterialBasis = 'categorical_loss' | 'assessed_unfit' | 'measured' | 'unmeasurable';

/** The confidence a basis carries (the rule in the header — stated, never learned). */
export function materialConfidence(basis: MaterialBasis): number {
  switch (basis) {
    case 'categorical_loss': case 'measured': return 1;
    case 'assessed_unfit': return 0.8;
    default: return 0.5;
  }
}

/** Hours from `now` to a decision deadline (a date: its first instant, UTC), one decimal; null when there is none. */
export function hoursToDeadline(deadline: unknown, now: Date): number | null {
  if (typeof deadline !== 'string' || deadline.length < 10) return null;
  const at = new Date(`${deadline.slice(0, 10)}T00:00:00.000Z`).getTime();
  if (Number.isNaN(at)) return null;
  return Math.round(((at - now.getTime()) / 3_600_000) * 10) / 10;
}

export interface MaterialChangeInput {
  packageId: string; version: number | null; packageState: string; title: string; owner: string | null; executed: boolean; disposition: string;
  trigger: { eventId: string; eventType: string; changeKind: string; noteId: string | null; via: string[] };
  basis: MaterialBasis; deadline: string | null; policyVersion: number | null; note: string; actor: string; occurredAt: Date;
}

/** MaterialChangeRaised@v1 from the decisions subscriber's item write. */
export function materialChangeRaisedEvent(a: MaterialChangeInput): OutboxRow {
  return {
    eventType: 'MaterialChangeRaised',
    payload: {
      schema: 'MaterialChangeRaised', schema_version: 'v1',
      package_id: a.packageId, version: a.version, package_state: a.packageState, title: a.title, owner: a.owner,
      executed: a.executed, failure_class: 'material_change', disposition: a.disposition,
      trigger: { event_id: a.trigger.eventId, event_type: a.trigger.eventType, change_kind: a.trigger.changeKind, note_id: a.trigger.noteId, via: a.trigger.via.slice(0, 50) },
      dims: { consequence: a.executed ? 'C3' : 'C2', confidence: materialConfidence(a.basis), hours_to_window: a.deadline === null ? null : hoursToDeadline(a.deadline, a.occurredAt), basis: a.basis, decision_deadline: a.deadline },
      policy_version: a.policyVersion,
      note: a.note.slice(0, 2000),
      temporal: { known_at: a.occurredAt.toISOString() },
      cause: { action: 'decision.subscription.apply', actor: a.actor, target_type: 'DPK', target_id: a.packageId },
    },
  };
}

export interface MaterialChange {
  packageId: string; version: number | null; title: string; owner: string | null; executed: boolean; disposition: string; changeKind: string; triggerEventId: string | null;
  noteId: string | null; dims: { consequence: string; confidence: number; hours_to_window: number | null; basis: string | null }; policyVersion: number | null;
}

/** The contract of a MaterialChangeRaised payload, as the attention consumer reads it: a string says why it is not the contract. */
export function readMaterialChange(p: Row): MaterialChange | string {
  if (p['schema'] !== 'MaterialChangeRaised' || p['schema_version'] !== 'v1') return 'not a MaterialChangeRaised@v1 payload';
  if (typeof p['package_id'] !== 'string' || !UUID.test(p['package_id'])) return 'package_id is not a uuid';
  const d = p['dims'];
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return 'dims is not an object';
  const dims = d as Row;
  if (typeof dims['consequence'] !== 'string' || !CONSEQUENCE.test(dims['consequence'])) return 'dims.consequence is not C0..C4';
  if (typeof dims['confidence'] !== 'number' || dims['confidence'] < 0 || dims['confidence'] > 1) return 'dims.confidence is not a number in [0, 1]';
  if (dims['hours_to_window'] !== null && dims['hours_to_window'] !== undefined && typeof dims['hours_to_window'] !== 'number') return 'dims.hours_to_window is not a number or null';
  if (p['policy_version'] !== null && p['policy_version'] !== undefined && !Number.isInteger(p['policy_version'])) return 'policy_version is not an integer or null';
  if (p['owner'] !== null && p['owner'] !== undefined && (typeof p['owner'] !== 'string' || !UUID.test(p['owner']))) return 'owner is not a principal id';
  const t = (p['trigger'] ?? {}) as Row;
  return {
    packageId: p['package_id'], version: Number.isInteger(p['version']) ? Number(p['version']) : null, title: String(p['title'] ?? p['package_id']),
    owner: (p['owner'] as string | null | undefined) ?? null, executed: p['executed'] === true, disposition: String(p['disposition'] ?? 'human_review'),
    changeKind: String(t['change_kind'] ?? ''), triggerEventId: typeof t['event_id'] === 'string' ? t['event_id'] : null, noteId: typeof t['note_id'] === 'string' ? t['note_id'] : null,
    dims: { consequence: dims['consequence'], confidence: dims['confidence'], hours_to_window: typeof dims['hours_to_window'] === 'number' ? dims['hours_to_window'] : null, basis: typeof dims['basis'] === 'string' ? dims['basis'] : null },
    policyVersion: Number.isInteger(p['policy_version']) ? Number(p['policy_version']) : null,
  };
}
