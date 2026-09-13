/**
 * The SCENARIO consumer (AU-MEM-0030: "… consumers for … scenarios …"), registered by the prediction module. An
 * ACTIVE scenario whose subject entity or forecast changed — or whose forecast the forecast consumer would mark
 * for the same change — is MARKED FOR ATTENTION once (prediction.mark_scenario_attention); its branches, its
 * indicators and its as-of binding are untouched: what to do with the tree is the owner's review.
 *
 * Items are scenario ids.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import { touchedIds } from '../../graph/subscriptions/change-events.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { PredictionCapability, type PredictionSubscriberWrites } from '../prediction.capabilities.js';

type Row = Record<string, unknown>;

@Injectable()
export class ScenarioSubscriptionConsumer implements SubscriptionConsumer<PredictionSubscriberWrites>, OnModuleInit {
  readonly kind = 'scenarios' as const;
  readonly objectType = 'SCN';
  readonly purpose = 'prediction';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof PredictionCapability.subscriber>[0], action: string): PredictionSubscriberWrites { return PredictionCapability.subscriber(tx, action); }

  async resolveItems(cap: PredictionSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    const t = touchedIds(event);
    const active = (await cap.readScenarios().selectAll().where('state' as never, '=', 'active' as never).where('attention_state' as never, '=', 'none' as never).execute()) as Row[];
    if (active.length === 0) return [];
    // Forecasts the same change reaches through their own basis (subject, assumption, dependency, evidence).
    const basis = new Set<string>([...t.claims, ...t.evidence, ...t.entities, ...t.edges, ...t.strategy]);
    const deps = basis.size === 0 ? [] : (await cap.readDependencies().selectAll().where('state' as never, '=', 'active' as never)
      .where('dependent_type' as never, 'in', ['FCT', 'SCN'] as never).where('depends_on_id' as never, 'in', [...basis] as never).execute()) as Row[];
    const forecastsHit = new Set<string>(t.forecasts); const scenariosHit = new Set<string>(t.scenarios);
    for (const d of deps) (String(d['dependent_type']) === 'FCT' ? forecastsHit : scenariosHit).add(String(d['dependent_object_id']));
    const forecastIds = [...new Set(active.map((s) => (s['forecast_id'] == null ? null : String(s['forecast_id']))).filter((x): x is string => x !== null))];
    if (forecastIds.length > 0) {
      const fcts = (await cap.readForecasts().select(['forecast_id', 'subject_entity_id', 'assumptions'] as never).where('forecast_id' as never, 'in', forecastIds as never).execute()) as Row[];
      for (const f of fcts) {
        const subject = f['subject_entity_id'] == null ? null : String(f['subject_entity_id']);
        const assumptions = Array.isArray(f['assumptions']) ? (f['assumptions'] as unknown[]).map(String) : [];
        if ((subject !== null && t.changedEntities.has(subject)) || assumptions.some((a) => t.strategy.has(a))) forecastsHit.add(String(f['forecast_id']));
      }
    }
    const items = new Set<string>();
    for (const s of active) {
      const id = String(s['scenario_id']);
      const subject = s['subject_entity_id'] == null ? null : String(s['subject_entity_id']);
      const forecast = s['forecast_id'] == null ? null : String(s['forecast_id']);
      if (scenariosHit.has(id) || (subject !== null && t.changedEntities.has(subject)) || (forecast !== null && forecastsHit.has(forecast))) items.add(id);
    }
    return [...items].sort();
  }

  async applyItem(cap: PredictionSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string) {
    const reason = `${event.event_type}/${event.payload.change.kind} (outbox ${event.event_id}): the subject or the forecast this scenario rests on changed`;
    const marked = await cap.markScenarioAttention({ scenarioId: item, tenantId: scope.tenantId, domainId: scope.domainId, reason, outboxEventId: event.event_id, subscriptionId, actor, correlationId });
    return marked ? { effect: 'scenario.attention', effectRef: item } : { effect: 'scenario.already_attending', effectRef: item };
  }
}
