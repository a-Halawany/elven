/**
 * SCENARIO EVENTS — CP-6 B21 (0081, L7-I04): ScenarioCoherenceFailed@v1, built PURE and published from the transaction
 * that ran the check (ES-19-001), at the four sites that check a scenario's coherence under the versioned rule
 * (`prediction.scenario_coherence_rule()`; the check itself is `prediction.check_scenario_coherence`):
 *
 *   declare        the end of the declaring write, after the branches are added (a failed scenario is ADMITTED failed,
 *                  never refused);
 *   review         a continuation or a promotion re-checks first (a failed scenario is not promoted — the port refuses);
 *   subscription   the scenario consumer's applyItem, beside its attention mark, in the item's own transaction;
 *   operator       a person's POST …/scenarios/:id/check-coherence.
 *
 * The event is published on a FAILED and CHANGED check only (the first failure, or a changed set of failing findings);
 * a pass rides the check row. It names the scenario, the check, what stood before, the findings (cut at
 * LIFECYCLE_EVENT_LIST_MAX with `truncated` said) and `routed_to` — the review roles that hold prediction.scenario.review
 * (pdp.service.ts) — so the accountable reviewer reads the scenarios page. The ScenarioReviewed@v1 payload stays inline
 * in scenarios.service.ts. No read, no service import: the write hands the builder what it holds.
 */
import { cutList, type OutboxRow } from '../../graph/subscriptions/change-events.js';

type Row = Record<string, unknown>;

/** B21 (0081, D9): the bound action of each check trigger — the cause a ScenarioCoherenceFailed names. */
export const SCENARIO_COHERENCE_TRIGGER_ACTION: Readonly<Record<'declare' | 'review' | 'subscription' | 'operator', string>> = Object.freeze({
  declare: 'prediction.scenario.declare', review: 'prediction.scenario.review', subscription: 'prediction.scenario.subscription.apply', operator: 'prediction.scenario.check',
});
export type ScenarioCoherenceTrigger = keyof typeof SCENARIO_COHERENCE_TRIGGER_ACTION;

/** The roles a failed check is routed to: the holders of prediction.scenario.review (pdp.service.ts, exact rule). */
export const SCENARIO_REVIEW_ROLES: readonly string[] = Object.freeze(['platform_admin', 'domain_admin', 'strategy_owner', 'forecast_owner']);

/**
 * ScenarioCoherenceFailed@v1 — built from the check port's answer (`prediction.check_scenario_coherence`: the scenario,
 * its canonical version, title, owner and forecast, the check id, what stood before, the findings in rule order, the rule
 * version) and the write's own facts (the trigger, the actor, the instant). The caller publishes it only on a failed and
 * changed check; the builder announces what it is handed with `outcome: 'failed'`.
 */
export function scenarioCoherenceFailedEvent(a: { check: Row; trigger: ScenarioCoherenceTrigger; actor: string; occurredAt: string }): OutboxRow {
  const c = a.check;
  const scenarioId = String(c['scenario_id']);
  const findings = cutList(Array.isArray(c['findings']) ? (c['findings'] as unknown[]) : []);
  return { eventType: 'ScenarioCoherenceFailed', payload: {
    schema: 'ScenarioCoherenceFailed', schema_version: 'v1',
    scenario_id: scenarioId, scenario_version: c['scenario_version'] ?? null, title: c['title'] ?? null, forecast_id: c['forecast_id'] ?? null, owner: c['owner'] ?? null,
    check_id: c['check_id'] ?? null, prior_state: c['prior_state'] ?? null, outcome: 'failed',
    findings: findings.list, truncated: findings.truncated,
    rule_version: c['rule_version'] ?? null, trigger: a.trigger,
    routed_to: [...SCENARIO_REVIEW_ROLES],
    temporal: { known_at: a.occurredAt },
    cause: { action: SCENARIO_COHERENCE_TRIGGER_ACTION[a.trigger], actor: a.actor, target_type: 'SCN', target_id: scenarioId },
  } };
}
