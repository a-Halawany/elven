/**
 * The FORECAST consumer (AU-MEM-0030: "… consumers for … forecasts …"), registered by the prediction module into
 * the graph's dispatcher. What a change means for a forecast, in prediction's own terms (Phase 4): an ISSUED
 * forecast whose subject entity, assumption, dependency or evidence basis changed is MARKED FOR ATTENTION once
 * (prediction.mark_forecast_attention) — surfaced for a person, never re-issued by a subscriber. The walk's
 * `objects.forecasts` is a selection aid; the forecast's own columns and its dependency rows are read under the
 * prediction capability and RLS, so an unwalked event still resolves correctly.
 *
 * Items are forecast ids.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import { touchedIds } from '../../graph/subscriptions/change-events.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { PredictionCapability, type PredictionSubscriberWrites } from '../prediction.capabilities.js';

type Row = Record<string, unknown>;

@Injectable()
export class ForecastSubscriptionConsumer implements SubscriptionConsumer<PredictionSubscriberWrites>, OnModuleInit {
  readonly kind = 'forecasts' as const;
  readonly objectType = 'FCT';
  readonly purpose = 'prediction';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof PredictionCapability.subscriber>[0], action: string): PredictionSubscriberWrites { return PredictionCapability.subscriber(tx, action); }

  async resolveItems(cap: PredictionSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    const t = touchedIds(event);
    const basis = new Set<string>([...t.claims, ...t.evidence, ...t.entities, ...t.edges, ...t.strategy]);
    const issued = (await cap.readForecasts().selectAll().where('state' as never, '=', 'issued' as never).where('attention_state' as never, '=', 'none' as never).execute()) as Row[];
    if (issued.length === 0) return [];
    const deps = basis.size === 0 ? [] : (await cap.readDependencies().selectAll().where('state' as never, '=', 'active' as never)
      .where('dependent_type' as never, '=', 'FCT' as never).where('depends_on_id' as never, 'in', [...basis] as never).execute()) as Row[];
    const byDependency = new Set(deps.map((d) => String(d['dependent_object_id'])));
    const items = new Set<string>();
    for (const f of issued) {
      const id = String(f['forecast_id']);
      const subject = f['subject_entity_id'] == null ? null : String(f['subject_entity_id']);
      const assumptions = Array.isArray(f['assumptions']) ? (f['assumptions'] as unknown[]).map(String) : [];
      const refs = Array.isArray(f['evidence_refs']) ? (f['evidence_refs'] as unknown[]).map(String) : [];
      const evidenceCited = refs.some((r) => { const m = /^EVD:([0-9a-f-]{36})@/i.exec(r); return m !== null && t.evidence.has(m[1] as string); });
      if (t.forecasts.has(id) || byDependency.has(id) || (subject !== null && t.changedEntities.has(subject)) || assumptions.some((a) => t.strategy.has(a)) || evidenceCited) items.add(id);
    }
    return [...items].sort();
  }

  async applyItem(cap: PredictionSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string) {
    const reason = `${event.event_type}/${event.payload.change.kind} (outbox ${event.event_id}): the subject, an assumption or the evidence this forecast rests on changed`;
    const marked = await cap.markForecastAttention({ forecastId: item, tenantId: scope.tenantId, domainId: scope.domainId, reason, outboxEventId: event.event_id, subscriptionId, actor, correlationId });
    return marked ? { effect: 'forecast.attention', effectRef: item } : { effect: 'forecast.already_attending', effectRef: item };
  }
}
