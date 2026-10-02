/**
 * SCENARIO EVENTS — CP-6 B21 (0081, L7-I04): ScenarioCoherenceFailed@v1, built PURE and published from the transaction
 * that ran the check (ES-19-001), at the four sites that check a scenario's coherence under the versioned rule
 * (`prediction.scenario_coherence_rule()`; the check itself is `prediction.check_scenario_coherence`):
 *
 *   declare        the end of the declaring write, after the branches are added (a failed scenario is ADMITTED failed,
 *                  never refused);
 *   review         a continuation or a promotion re-checks first (a failed scenario is not promoted — the port refuses);
 *   subscription   the scenario consumer's applyItem, beside its attention mark, in the item's own transaction;
 *   operator       a person's POST …/scenarios/:id/check-coherence;
 *   branch         (B23, 0084) the branching write, on the NEW version it admitted (POST …/scenarios/:id/branches).
 *
 * The event is published on a FAILED and CHANGED check only (the first failure, or a changed set of failing findings);
 * a pass rides the check row. It names the scenario, the check, what stood before, the findings (cut at
 * LIFECYCLE_EVENT_LIST_MAX with `truncated` said) and `routed_to` — the review roles that hold prediction.scenario.review
 * (pdp.service.ts) — so the accountable reviewer reads the scenarios page. The ScenarioReviewed@v1 payload stays inline
 * in scenarios.service.ts. No read, no service import: the write hands the builder what it holds.
 */
import { cutList, type OutboxRow } from '../../graph/subscriptions/change-events.js';

type Row = Record<string, unknown>;

/** B21 (0081, D9): the bound action of each check trigger — the cause a ScenarioCoherenceFailed names; B23 (0084) adds the branching write. */
export const SCENARIO_COHERENCE_TRIGGER_ACTION: Readonly<Record<'declare' | 'review' | 'subscription' | 'operator' | 'branch', string>> = Object.freeze({
  declare: 'prediction.scenario.declare', review: 'prediction.scenario.review', subscription: 'prediction.scenario.subscription.apply', operator: 'prediction.scenario.check',
  branch: 'prediction.scenario.branch',
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

/**
 * B23 (0084, L7-I02) ScenarioBranched@v1 — a branch ADDED to a declared scenario as a new version, built from the branching port's
 * answer (`prediction.branch_scenario`: the request, the branch, the version read and the version made, the scenario's title, owner
 * and forecast), the branch as offered, the coherence check the write ran on the new version (trigger `branch`) and the write's own
 * facts. Published from the accepting write only — a repeat under the same key publishes nothing (no second effect). NOT
 * subscribable (not in graph.subscribable_event_types): the scenarios page and the log read it.
 */
export function scenarioBranchedEvent(a: {
  answer: Row; branch: { indicator_id: string | null; owner: string; consequence_class: string | null; statement: string };
  idempotencyKey: string; requestDigest: string; coherence: Row; actor: string; occurredAt: string;
}): OutboxRow {
  const r = a.answer; const c = a.coherence;
  const scenarioId = String(r['scenario_id']);
  return { eventType: 'ScenarioBranched', payload: {
    schema: 'ScenarioBranched', schema_version: 'v1',
    scenario_id: scenarioId, title: r['title'] ?? null, owner: r['owner'] ?? null, forecast_id: r['forecast_id'] ?? null,
    base_version: r['base_version'] ?? null, version: r['version'] ?? null,
    branch: { branch_id: r['branch_id'] ?? null, name: r['name'] ?? null, kind: r['kind'] ?? null, kind_label: r['kind_label'] ?? null,
              statement: a.branch.statement, indicator_id: a.branch.indicator_id, owner: a.branch.owner, consequence_class: a.branch.consequence_class },
    request: { request_id: r['request_id'] ?? null, idempotency_key: a.idempotencyKey, request_digest: a.requestDigest },
    coherence: { check_id: c['check_id'] ?? null, outcome: c['outcome'] ?? null, changed: c['changed'] ?? null, rule_version: c['rule_version'] ?? null },
    temporal: { known_at: a.occurredAt },
    cause: { action: 'prediction.scenario.branch', actor: a.actor, target_type: 'SCN', target_id: scenarioId },
  } };
}
