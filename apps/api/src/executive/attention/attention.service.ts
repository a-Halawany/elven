/**
 * THE ATTENTION POLICY AND THE QUEUE — CP-6 B22 (migration 0083; interface L10-I05 AttentionPolicyChanged; L10-C02 the engine).
 *
 * A domain's attention policy is a VERSIONED object set by a named human (PR-44-003: "humans set policy"): per signal class —
 * forecast.unfit (NOT-15), scenario.incoherent (the L7 degraded behaviour), warning.raised (NOT-06), source.coverage_loss
 * (NOT-10), proposal.review (NOT-09/14) — the materiality thresholds over TRANSPARENT dimensions (consequence, confidence, hours to
 * the response window; ES-47-002: no opaque score creates urgency), the accountable roles, the acknowledgement deadline, the
 * escalation roles and bound, the suppression rule and the channel (in_app). The port validates the rules whole, supersedes the
 * active version (never rewrites it) and computes what changed; AttentionPolicyChanged@v1 is published from that write.
 *
 * The QUEUE is fed by the consumers (attention, source-health, proposals): each signal becomes one item evaluated under the ACTIVE
 * version — routed to its owner and roles with a deadline, deprioritized (visible, never dropped) below the thresholds or when the
 * engine abstains (no policy, no rule for the class), unrouted and escalated at once when nobody holds its roles. The people act
 * on it: acknowledge (receipt, never agreement), suppress (reason, expiry within the class's maximum — visible, lapsing), close;
 * the overdue are escalated (the attention subscriber at every delivery; the escalate route on demand — no timer host).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { AttentionWrites, ExecutiveReads } from '../executive.capabilities.js';
import type { OutboxRow } from '../../graph/subscriptions/change-events.js';

type Row = Record<string, unknown>;
export const SIGNAL_CLASSES = ['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review',
  /* B23 (0084) attention: L10-I02 (MaterialChangeRaised) and L10-I03 (ReviewConvened) */ 'decision.material_change', 'review.convened' /* end B23 attention */] as const;
export type SignalClass = (typeof SIGNAL_CLASSES)[number];
export const ITEM_STATES = ['open', 'escalated', 'unrouted', 'acknowledged', 'suppressed', 'deprioritized', 'closed'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** AttentionPolicyChanged@v1 from the publish port's answer — the version, what it supersedes, what changed, who set it and why. */
export function attentionPolicyChangedEvent(a: { published: Row; actor: string }): OutboxRow {
  const r = a.published;
  return {
    eventType: 'AttentionPolicyChanged',
    payload: {
      schema: 'AttentionPolicyChanged', schema_version: 'v1',
      policy_id: String(r['policy_id']), version: Number(r['version']), supersedes: r['supersedes'] === null || r['supersedes'] === undefined ? null : Number(r['supersedes']),
      superseded_policy_id: (r['superseded_policy_id'] ?? null) as string | null, rules_digest: String(r['rules_digest']),
      changed_sections: strs(r['changed_sections']), changed_classes: strs(r['changed_classes']),
      effective_at: iso(r['effective_at']), set_by: String(r['set_by']), reason: String(r['reason'] ?? ''),
      temporal: { known_at: iso(r['effective_at']) },
      cause: { action: 'executive.attention.policy.publish', actor: a.actor, target_type: 'ATP', target_id: String(r['policy_id']) },
    },
  };
}

/** The contract of an AttentionPolicyChanged payload, as the attention consumer reads it (a payload that is not this is quarantined). */
export function readPolicyChanged(p: Row): { policyId: string; version: number; changedSections: string[]; changedClasses: string[] } | null {
  if (p['schema'] !== 'AttentionPolicyChanged' || typeof p['policy_id'] !== 'string' || !UUID.test(p['policy_id']) || !Number.isInteger(p['version'])) return null;
  return { policyId: p['policy_id'], version: Number(p['version']), changedSections: strs(p['changed_sections']), changedClasses: strs(p['changed_classes']) };
}

@Injectable()
export class AttentionService {
  /** The intake of a policy version: the rules object and the reason; the port validates the rules whole (22023 names the key). */
  validatePublish(p: Row, correlationId: string): { rules: Row; reason: string } {
    const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
    const rules = p['rules'];
    if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) bad('payload.rules is the policy object {classes: {<signal class>: {materiality, route_roles, ack_within_minutes, escalate_to_roles?, max_escalations?, suppression?, notify?}}, overload?}');
    const reason = typeof p['reason'] === 'string' ? p['reason'].trim() : '';
    if (reason.length < 8) bad('payload.reason says why the policy changes (at least 8 characters)');
    return { rules: rules as Row, reason };
  }

  async publish(cap: AttentionWrites, scope: { tenantId: string; domainId: string }, policyId: string, rules: Row, reason: string, actor: string, correlationId: string) {
    const published = await cap.publishPolicy({ policyId, tenantId: scope.tenantId, domainId: scope.domainId, rules, reason, actor, correlationId });
    return { published, event: attentionPolicyChangedEvent({ published, actor }) };
  }

  /** The active version and the history (newest first) — the rules read in full; who set each and why. */
  async policy(cap: ExecutiveReads): Promise<{ active: Row | null; history: Row[] }> {
    const rows = (await cap.readAttentionPolicies().selectAll().orderBy('version' as never, 'desc').limit(50).execute()) as Row[];
    const shape = (r: Row): Row => ({ policy_id: r['policy_id'], version: Number(r['version']), state: r['state'], rules: r['rules'], rules_digest: r['rules_digest'], supersedes: r['supersedes'],
      changed_sections: r['changed_sections'], changed_classes: r['changed_classes'], reason: r['reason'], set_by: r['set_by'], effective_at: iso(r['effective_at']), superseded_at: iso(r['superseded_at']) });
    const history = rows.map(shape);
    return { active: history.find((r) => r['state'] === 'active') ?? null, history };
  }

  /**
   * The QUEUE: every item by state (the deprioritized and the suppressed listed as they are — never hidden), overdue flagged, the
   * reasons and the version each was judged under; filters on state and class.
   */
  async list(cap: ExecutiveReads, p: { state?: unknown; signalClass?: unknown; limit?: unknown }, now: string): Promise<{ items: Row[]; counts: Record<string, number> }> {
    let q = cap.readAttentionItems().selectAll();
    if (typeof p.state === 'string' && (ITEM_STATES as readonly string[]).includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    if (typeof p.signalClass === 'string' && (SIGNAL_CLASSES as readonly string[]).includes(p.signalClass)) q = q.where('signal_class' as never, '=', p.signalClass as never);
    const limit = Math.min(Math.max(Number(p.limit ?? 200) || 200, 1), 500);
    const rows = (await q.orderBy('created_at' as never, 'desc').limit(limit).execute()) as Row[];
    const all = (await cap.readAttentionItems().select(['state'] as never).execute()) as Row[];
    const counts: Record<string, number> = Object.fromEntries(ITEM_STATES.map((s) => [s, 0]));
    for (const r of all) counts[String(r['state'])] = (counts[String(r['state'])] ?? 0) + 1;
    return { items: rows.map((r) => this.shape(r, now)), counts };
  }

  async get(cap: ExecutiveReads, itemId: string, now: string, correlationId: string): Promise<Row> {
    if (!UUID.test(itemId)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the item id is a uuid'), 422);
    const r = ((await cap.readAttentionItems().selectAll().where('item_id' as never, '=', itemId as never).execute()) as Row[])[0];
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized attention item matches'), 404);
    const events = (await cap.readAttentionItemEvents().selectAll().where('item_id' as never, '=', itemId as never).orderBy('occurred_at' as never, 'asc').execute()) as Row[];
    return { ...this.shape(r, now), events: events.map((e) => ({ event: e['event'], actor: e['actor_principal_id'], details: e['details'], occurred_at: iso(e['occurred_at']) })) };
  }

  private shape(r: Row, now: string): Row {
    const due = iso(r['due_at']);
    return {
      item_id: r['item_id'], signal_class: r['signal_class'], subject_kind: r['subject_kind'], subject_id: r['subject_id'], title: r['title'],
      outcome: r['outcome'], state: r['state'], owner_principal_id: r['owner_principal_id'], route_roles: r['route_roles'],
      policy_version: r['policy_version'], evaluation: r['evaluation'], details: r['details'],
      due_at: due, overdue: due !== null && ['open', 'escalated'].includes(String(r['state'])) && due <= now,
      escalations: Number(r['escalations'] ?? 0), suppressed_until: iso(r['suppressed_until']),
      acknowledged_at: iso(r['acknowledged_at']), acknowledged_by: r['acknowledged_by'], closed_at: iso(r['closed_at']), closed_by: r['closed_by'],
      cause_event_id: r['cause_event_id'], cause_event_type: r['cause_event_type'], created_at: iso(r['created_at']), updated_at: iso(r['updated_at']),
    };
  }
}
