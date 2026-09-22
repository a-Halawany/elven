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
 * 0078 (B18, D3/D4). A twin's OWN admission (GraphChanged/twin.state_changed, whose objects.twins names the twin)
 * marks nothing: the new version is verified by admission and its predecessor is a valid snapshot as of its own
 * cut-offs — the consumer answers no items for that kind before any read; the runs of the superseded version reach the
 * decisions consumer through objects.simulations. And the mark this consumer makes is ANNOUNCED: the item's write
 * returns a TwinStateChanged/version.unverified built from the version row (its header, cut-offs and completeness as
 * admitted; no variables changed — the state stands, its verification does not), caused by the outbox event that
 * reached it, enqueued by the pipeline in the item's own transaction (0066 §2) — published only if the mark commits.
 * The walk's own unverification (graph.record_impact → twin.mark_unverified) is announced by the walk's
 * GraphChanged/invalidation.assessed, not here (the layering: the graph never imports a twin builder).
 *
 * Items are `<twin_id>@<version>`.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import { touchedIds } from '../../graph/subscriptions/change-events.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { TwinCapability, type TwinSubscriberWrites } from '../twin.capabilities.js';
import { twinStateChangedEvent } from './twin-events.js';

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
/** A DATE column names a day (the driver hands it back at LOCAL midnight): rendered as the day it names, the twin service's rule. */
const dayOf = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

@Injectable()
export class TwinSubscriptionConsumer implements SubscriptionConsumer<TwinSubscriberWrites>, OnModuleInit {
  readonly kind = 'twins' as const;
  readonly objectType = 'TWN';
  readonly purpose = 'twin';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof TwinCapability.subscriber>[0], action: string): TwinSubscriberWrites { return TwinCapability.subscriber(tx, action); }

  async resolveItems(cap: TwinSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    // 0078 (D3): a twin's own admission — the new version is verified by admission, its predecessor a valid snapshot as of its
    // cut-offs; the runs of the superseded version reach the decisions consumer through objects.simulations. Nothing to mark.
    if (event.event_type === 'GraphChanged' && event.payload.change.kind === 'twin.state_changed') return [];
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
    if (!marked) return { effect: 'version.already_unverified', effectRef: twinId, details: { version } };
    // 0078 (D4): the mark is announced from the version row as admitted — the header and cut-offs are immutable, only the
    // verification state moved. The row was just marked under this capability, so its absence is a fault, never a silent omission.
    const v = (await cap.readVersions().selectAll().where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Row | undefined;
    if (v === undefined) throw new Error(`twin version ${twinId}@${version} was marked unverified but its row could not be read back`);
    const missingKeys = Array.isArray(v['missing_keys']) ? (v['missing_keys'] as unknown[]).map(String) : [];
    const announced = twinStateChangedEvent({
      twinId, version, branchId: String(v['branch_id']), supersedes: v['supersedes'] == null ? null : Number(v['supersedes']),
      forkedFromVersion: v['forked_from_version'] == null ? null : Number(v['forked_from_version']),
      change: 'version.unverified', stateSetDigest: str(v['state_set_digest']), headerDigest: str(v['header_digest']),
      completeness: str(v['completeness']), missingKeys, syntheticState: v['synthetic_state'] === true,
      knownAt: str(v['known_at']) ?? new Date().toISOString(), observedThrough: dayOf(v['observed_through']),
      verificationState: 'unverified', changedVariables: [], dependencyImpacts: null, reason,
      causedBy: { outbox_event_id: event.event_id, change_kind: event.payload.change.kind },
      action: 'twin.subscription.apply', actor, occurredAt: new Date().toISOString(),
    });
    return { effect: 'version.unverified', effectRef: twinId, details: { version }, outboxEvents: [announced] };
  }
}
