/**
 * The RETRIEVAL consumer (AU-MEM-0030: "… consumers for … retrieval"). Retrieval reads the graph's projections
 * (entities_current, edges_current, strategy_current — rebuilt from their event logs by graph.rebuild_projections,
 * 0024). After a graph or memory change this consumer RE-VERIFIES those projections against their logs and records
 * the check with what the change touched. A mismatch is OPERATOR WORK: the check is recorded (evidence), the item is
 * left UNRESOLVED — never checkpointed as applied — and the delivery ends `unresolved`; every re-drive makes a new
 * check, and only a check that passes applies the item (0064, Codex finding 3: before it the mismatched check was
 * checkpointed as applied and the re-drive cleared the failure without a second check). A subscriber never repairs
 * a projection; repair is the operator's act under the operator's authority.
 *
 * One item per event ("projections"): the check is one bounded effect and its record is the checkpoint.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { newId } from '../../../shared/ids.js';
import { GraphCapability, type GraphSubscriberWrites } from '../../graph.capabilities.js';
import { touchedIds } from '../change-events.js';
import type { ChangeEvent, SubscriptionConsumer } from '../graph-change.js';
import { SubscriptionDispatcherService } from '../subscription-dispatcher.service.js';

@Injectable()
export class RetrievalConsumer implements SubscriptionConsumer<GraphSubscriberWrites>, OnModuleInit {
  readonly kind = 'retrieval' as const;
  readonly objectType = 'RTC';
  readonly purpose = 'graph';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof GraphCapability.graphSubscriber>[0], action: string): GraphSubscriberWrites { return GraphCapability.graphSubscriber(tx, action); }

  async resolveItems(): Promise<string[]> { return ['projections']; }

  async applyItem(cap: GraphSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, _item: string, actor: string, correlationId: string, subscriptionId: string) {
    const t = touchedIds(event);
    const touched = {
      event_type: event.event_type, change_kind: event.payload.change.kind,
      entities: [...t.entities], edges: [...t.edges], claims: [...t.claims], evidence: [...t.evidence], strategy: [...t.strategy],
      walked: t.walked, truncated: t.truncated,
    };
    const checkId = newId();
    const r = await cap.recordRetrievalCheck({ checkId, eventId: event.event_id, subscriptionId, tenantId: scope.tenantId, domainId: scope.domainId, touched, actor, correlationId });
    const details = { projections: r.projections, mismatched: r.mismatched };
    if (r.mismatched > 0) {
      return { effect: 'projections.mismatched', effectRef: checkId, details, unresolved: `retrieval check ${checkId}: ${r.mismatched} projection row(s) differ from their event logs after ${event.event_type}/${event.payload.change.kind}; operator repair required` };
    }
    return { effect: 'projections.verified', effectRef: checkId, details };
  }
}
