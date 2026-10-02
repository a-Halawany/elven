/**
 * The WARNINGS consumer — CP-6 B28 (0088 §0 declares the kind `warnings`, its action prediction.warning.subscription.apply, its role
 * warning_subscriber and its event GraphChanged; §W is its effect). Registered by the prediction module into the graph's dispatcher
 * like the forecast and scenario consumers, a NEW identity (graph-change.ts METHOD_REF — no existing subscription is re-registered).
 *
 * What a graph change means here: an ORIGIN of a warning other than an indicator breach — a graph impact reaching an objective, a
 * forecast revision, a twin degradation (warning-origins.ts). Each item SUBMITS a warning candidate to the intake
 * (prediction.submit_warning_candidate, origin_key = the event id and the item) — never a warning: the lifecycle's processing
 * clusters or raises it. A redelivered or replayed event submits nothing twice (the intake answers `repeated`).
 *
 * Items are `<origin>:<id>`.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { WarningLifecycleCapability, type WarningSubscriberWrites } from './warning-lifecycle.capabilities.js';
import { candidateOf, readOriginItem, warningOriginItems, type OriginFacts } from './warning-origins.js';

type Row = Record<string, unknown>;

@Injectable()
export class WarningsSubscriptionConsumer implements SubscriptionConsumer<WarningSubscriberWrites>, OnModuleInit {
  readonly kind = 'warnings' as const;
  readonly objectType = 'WRN';
  readonly purpose = 'prediction';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof WarningLifecycleCapability.subscriber>[0], action: string): WarningSubscriberWrites { return WarningLifecycleCapability.subscriber(tx, action); }

  async resolveItems(_cap: WarningSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    return warningOriginItems(event);
  }

  async applyItem(cap: WarningSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string) {
    const it = readOriginItem(item);
    if (event.event_type !== 'GraphChanged' || it === null) return { effect: 'not_an_origin', effectRef: null, details: { item } };
    const facts = await this.facts(cap, it.origin, it.subjectId);
    const c = candidateOf(event, item, facts, subscriptionId);
    if (c === null) return { effect: 'not_an_origin', effectRef: null, details: { item } };
    const r = await cap.submitCandidate({ tenantId: scope.tenantId, domainId: scope.domainId, originKind: c.originKind, originKey: c.originKey, originRef: c.originRef, title: c.title,
      consequenceClass: c.consequenceClass, confidence: c.confidence, causeKey: c.causeKey, affected: c.affected, evidence: c.evidence, windowHours: c.windowHours, actor, correlationId });
    return { effect: r['repeated'] === true ? 'candidate.repeated' : 'candidate.submitted', effectRef: String(r['candidate_id']),
             details: { origin_kind: c.originKind, origin_key: c.originKey, cause_key: c.causeKey, state: r['state'] ?? null, warning_id: r['warning_id'] ?? null, repeated: r['repeated'] === true } };
  }

  /** The subject's label (and a forecast's horizon), read under the consumer's own capability and RLS; absent → the id stands in. */
  private async facts(cap: WarningSubscriberWrites, origin: string, id: string): Promise<OriginFacts> {
    if (origin === 'graph_impact') {
      const s = (await cap.readStrategy().select(['title'] as never).where('strategy_object_id' as never, '=', id as never).executeTakeFirst()) as Row | undefined;
      return { label: s === undefined ? null : String(s['title']), horizon: null };
    }
    if (origin === 'forecast_revision') {
      const f = (await cap.readForecasts().select(['series_key', 'horizon_code'] as never).where('forecast_id' as never, '=', id as never).executeTakeFirst()) as Row | undefined;
      return { label: f === undefined ? null : `${String(f['series_key'])} ${String(f['horizon_code'])}`, horizon: f === undefined ? null : String(f['horizon_code']) };
    }
    const t = (await cap.readTwins().select(['title'] as never).where('twin_id' as never, '=', id as never).executeTakeFirst()) as Row | undefined;
    return { label: t === undefined ? null : String(t['title']), horizon: null };
  }
}
