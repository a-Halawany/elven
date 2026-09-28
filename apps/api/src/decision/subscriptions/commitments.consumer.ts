/**
 * The COMMITMENTS consumer — CP-6 B34 part C (0090 §0 declares the kind `commitments`, its action decision.commitment.subscription.apply,
 * its role commitment_subscriber and its event GraphChanged; §C8 is its effect). Registered into the graph's dispatcher like the decisions
 * consumer, a NEW identity (graph-change.ts METHOD_REF — no existing subscription is re-registered, and no existing consumer's METHOD_REF
 * changes: `objective.changed` selects nothing in any of them — see graph-change.ts).
 *
 * What a graph change means here (V02-T-117): an OBJECTIVE CHANGED (GraphChanged/objective.changed — a revision, an owner transfer) →
 * every live commitment item resting on it is RE-TASKED (an objective_changed exception, state retask_required) and its reviewer
 * REASSIGNED when the reviewer's basis is the objective's owner and that owner moved (decision.apply_objective_change). Every other kind
 * selects nothing. A redelivered or replayed event re-tasks nothing twice (the exception is keyed by the event).
 *
 * Items are `item:<item_id>`; the effect announces CommitmentChanged item.retasked (and reviewer.reassigned) in the item's transaction.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { CommitmentCapability, type CommitmentSubscriberWrites } from '../commitments/commitment.capabilities.js';
import { commitmentChangedEvent } from '../commitment-events.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The objective an event is about, or null (only `objective.changed` names one, in its typed block). */
export function changedObjectiveOf(event: ChangeEvent): string | null {
  if (event.event_type !== 'GraphChanged' || event.payload.change.kind !== 'objective.changed') return null;
  const id = event.payload.objective?.objective_id ?? null;
  return id !== null && UUID.test(id) ? id.toLowerCase() : null;
}

@Injectable()
export class CommitmentsSubscriptionConsumer implements SubscriptionConsumer<CommitmentSubscriberWrites>, OnModuleInit {
  readonly kind = 'commitments' as const;
  readonly objectType = 'CMI';
  readonly purpose = 'decision';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof CommitmentCapability.subscriber>[0], action: string): CommitmentSubscriberWrites { return CommitmentCapability.subscriber(tx, action); }

  async resolveItems(cap: CommitmentSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    const objective = changedObjectiveOf(event);
    if (objective === null) return [];
    return (await cap.itemsRestingOn({ ...scope, objectiveId: objective })).map((i) => `item:${i}`).sort();
  }

  async applyItem(cap: CommitmentSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string) {
    const objective = changedObjectiveOf(event);
    const m = /^item:([0-9a-f-]{36})$/i.exec(item);
    if (objective === null || m === null) return { effect: 'not_an_objective_change', effectRef: null, details: { item } };
    const r = await cap.applyObjectiveChange({ ...scope, itemId: m[1] as string, objectiveId: objective, sourceEventId: event.event_id, actor, correlationId });
    const effect = String(r['effect']);
    const answer = (r['item'] ?? {}) as Row;
    const outboxEvents = [
      ...(r['retask_event_id'] ? [commitmentChangedEvent({ kind: 'item.retasked', eventId: String(r['retask_event_id']), item: answer, action: 'decision.commitment.subscription.apply', actor })] : []),
      ...(r['reassign_event_id'] ? [commitmentChangedEvent({ kind: 'reviewer.reassigned', eventId: String(r['reassign_event_id']), item: answer, action: 'decision.commitment.subscription.apply', actor })] : []),
    ];
    return { effect, effectRef: typeof r['exception_id'] === 'string' ? r['exception_id'] : null,
             details: { objective_id: objective, reviewer_from: r['reviewer_from'] ?? null, reviewer_to: r['reviewer_to'] ?? null, state: answer['state'] ?? null }, outboxEvents };
  }
}
