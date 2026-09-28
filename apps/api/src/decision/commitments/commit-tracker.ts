/**
 * B34 (0090 §C2) commitments: the commit route's view of the tracker. The ROOT item is seeded by decision.commitments' AFTER INSERT
 * trigger inside decision.commit_package (which this part does not touch); the commit route announces it — CommitmentChanged
 * item.opened in the same C3 transaction — reading the seeded row and its ledger event through the tracker's read.
 */
import type { Tx } from '../../shared/db.js';
import { DecisionCapability, type CommitWrites } from '../decision.capabilities.js';
import { CommitmentCapability, type CommitmentReads } from './commitment.capabilities.js';
import { commitmentChangedEvent } from '../commitment-events.js';
import { itemAnswerOf } from './commitment.service.js';

type Row = Record<string, unknown>;
export type CommitWithTracker = CommitWrites & { tracker: CommitmentReads };

export function commitWithTracker(tx: Tx, action: string): CommitWithTracker {
  return Object.assign(DecisionCapability.commit(tx, action), { tracker: CommitmentCapability.read(tx, action) });
}

export async function rootOpenedEvents(cap: CommitWithTracker, commitmentId: string, actor: string): Promise<Array<{ eventType: string; payload: Row }>> {
  const root = (await cap.tracker.readItems().selectAll().where('commitment_id' as never, '=', commitmentId as never).where('parent_item_id' as never, 'is', null as never).executeTakeFirst()) as Row | undefined;
  if (root === undefined) return [];
  const ev = (await cap.tracker.readEvents().select(['event_id'] as never).where('item_id' as never, '=', String(root['item_id']) as never).where('event' as never, '=', 'item.opened' as never).executeTakeFirst()) as Row | undefined;
  return ev === undefined ? [] : [commitmentChangedEvent({ kind: 'item.opened', eventId: String(ev['event_id']), item: itemAnswerOf(root), action: 'decision.commit', actor })];
}
