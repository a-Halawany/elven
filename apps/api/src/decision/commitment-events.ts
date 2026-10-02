/**
 * COMMITMENT EVENTS — CP-6 B34 part C (0090, F-P6-05): the builder of CommitmentChanged@v1 (the prelude's contract,
 * executive/attention/signal-contracts.ts), written by the OWNING route into the pipeline's `outboxEvents` in the same governed
 * write as the port that changed the item (never by a trigger): item.opened (the commit route's seeded root, a declared item),
 * exception.raised / exception.resolved, handoff.issued / handoff.partial, compensation.assigned, item.retasked /
 * reviewer.reassigned (the commitments consumer), closure.proposed / closure.cosigned — and, from the attention tick's after-tick
 * publication, item.due_soon / item.overdue / compensation.overdue. Built PURE from the port's answer: ids, instants and the
 * item's facts as the port read them; the consumer re-reads the item through decision.commitment_item_signal.
 */
import type { OutboxRow } from '../graph/subscriptions/change-events.js';
import { COMMITMENT_CHANGE_KINDS, type CommitmentChangeKind, type CommitmentChangedV1 } from '../executive/attention/signal-contracts.js';

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

/** The CommitmentChanged kind a ledger event maps to (the tracker's own vocabulary is wider: only these are announced). */
export function commitmentChangeKindOf(ledgerEvent: string): CommitmentChangeKind | null {
  return (COMMITMENT_CHANGE_KINDS as readonly string[]).includes(ledgerEvent) ? (ledgerEvent as CommitmentChangeKind) : null;
}

/**
 * One CommitmentChanged@v1. `item` is the port's item answer (decision._commitment_item_answer: item_id, commitment_id, package_id,
 * title, owner, reviewer, due_at, state); `severity` the signal's (C3 when overdue or holding an undisposed residual, else C2).
 */
export function commitmentChangedEvent(a: {
  kind: CommitmentChangeKind; eventId: string; item: Row; severity?: 'C1' | 'C2' | 'C3' | 'C4' | null; action: string; actor: string; occurredAt?: string;
  commitmentId?: string; packageId?: string;
}): OutboxRow {
  const i = a.item;
  const itemId = str(i['item_id']);
  const payload: CommitmentChangedV1 = {
    schema: 'CommitmentChanged', schema_version: 1,
    commitment_id: String(a.commitmentId ?? i['commitment_id']), package_id: String(a.packageId ?? i['package_id']), item_id: itemId,
    change: { kind: a.kind, event_id: a.eventId },
    owner: str(i['owner']), reviewer: str(i['reviewer']), due_at: str(i['due_at']),
    severity: a.severity ?? (a.kind === 'item.overdue' || a.kind === 'handoff.partial' || a.kind === 'compensation.overdue' ? 'C3' : 'C2'),
    title: String(i['title'] ?? ''), state: String(i['state'] ?? ''),
    temporal: { known_at: a.occurredAt ?? new Date().toISOString() },
    cause: { action: a.action, actor: a.actor, target_type: itemId === null ? 'CMT' : 'CMI', target_id: itemId ?? String(a.commitmentId ?? i['commitment_id']) },
  };
  return { eventType: 'CommitmentChanged', payload: payload as unknown as Row };
}
