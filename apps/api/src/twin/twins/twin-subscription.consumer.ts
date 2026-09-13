/**
 * The TWIN consumer (AU-MEM-0030: "… consumers for twins …"), registered by the twin module into the graph's
 * dispatcher — the graph never imports the twin module. What a change means for a twin, in the twin's own terms
 * (P5-M5): an ADMITTED, VERIFIED version whose state elements cite what changed (a claim, the evidence behind it,
 * a forecast, a run) or whose boundary names a CHANGED entity (created, split, resolved, an end of a changed edge —
 * not one a declaration merely rests on) is UNVERIFIED — by event, once per cause, through
 * twin.apply_subscription_mark; nothing is re-grounded and no run is re-issued. The walk's `objects.twins` is a
 * selection aid; the citations are read under the twin's own capability and RLS, so an unwalked event still
 * resolves correctly.
 *
 * Items are `<twin_id>@<version>`.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import { touchedIds } from '../../graph/subscriptions/change-events.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { TwinCapability, type TwinSubscriberWrites } from '../twin.capabilities.js';

type Row = Record<string, unknown>;

@Injectable()
export class TwinSubscriptionConsumer implements SubscriptionConsumer<TwinSubscriberWrites>, OnModuleInit {
  readonly kind = 'twins' as const;
  readonly objectType = 'TWN';
  readonly purpose = 'twin';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof TwinCapability.subscriber>[0], action: string): TwinSubscriberWrites { return TwinCapability.subscriber(tx, action); }

  async resolveItems(cap: TwinSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    const t = touchedIds(event);
    const cited = new Set<string>([...t.claims, ...t.evidence, ...t.forecasts, ...t.runs, ...t.strategy]);
    const versions = (await cap.readVersions().selectAll()
      .where('state' as never, '=', 'admitted' as never).where('verification_state' as never, '=', 'verified' as never).execute()) as Row[];
    if (versions.length === 0) return [];
    const twinIds = [...new Set(versions.map((v) => String(v['twin_id'])))];
    const twins = (await cap.readTwins().selectAll().where('twin_id' as never, 'in', twinIds as never).execute()) as Row[];
    const boundaryHit = new Set<string>();
    for (const tw of twins) {
      const boundary = Array.isArray(tw['boundary']) ? (tw['boundary'] as unknown[]).map(String) : [];
      if (boundary.some((b) => t.changedEntities.has(b))) boundaryHit.add(String(tw['twin_id']));
    }
    const items = new Set<string>();
    for (const v of versions) {
      const twinId = String(v['twin_id']); const version = Number(v['version']);
      if (boundaryHit.has(twinId) || t.twins.has(twinId)) { items.add(`${twinId}@${version}`); continue; }
      if (cited.size === 0) continue;
      const els = (await cap.readElements().select(['citations'] as never).where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).execute()) as Row[];
      const cites = els.some((e) => (Array.isArray(e['citations']) ? (e['citations'] as Array<{ id?: unknown }>) : []).some((c) => cited.has(String(c.id ?? ''))));
      if (cites) items.add(`${twinId}@${version}`);
    }
    return [...items].sort();
  }

  async applyItem(cap: TwinSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string) {
    const at = item.lastIndexOf('@');
    const twinId = item.slice(0, at); const version = Number(item.slice(at + 1));
    const reason = `${event.event_type}/${event.payload.change.kind} (outbox ${event.event_id}): a cited object or a boundary entity changed; the version must be re-verified`;
    const marked = await cap.applySubscriptionMark({ twinId, tenantId: scope.tenantId, domainId: scope.domainId, version, reason, outboxEventId: event.event_id, subscriptionId, actor, correlationId });
    return marked
      ? { effect: 'version.unverified', effectRef: twinId, details: { version } }
      : { effect: 'version.already_unverified', effectRef: twinId, details: { version } };
  }
}
