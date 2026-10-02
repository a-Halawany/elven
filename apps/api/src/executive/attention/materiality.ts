/**
 * THE MATERIALITY COMPLETION — CP-6 B24 (migration 0086 §M; F-P6-07: V00-T-069, V03-T-262, PR-44-002/-005, UX-44-002/-005, ES-47-002).
 *
 * The engine (executive.evaluate_attention) judges the five further dimensions — probability, exposure, strategic relevance,
 * information value, irreversibility — only when a class's policy sets their thresholds, says so when a dimension has no input, and
 * abstains when a REQUIRED dimension has none; every evaluation carries a TRANSPARENT RANK (lexicographic: consequence, hours to the
 * window, confidence, exposure, strategic relevance — no weighted score). The OVERLOAD RULE is enforced at routing: an owner at the
 * cap (max_open_per_owner open + escalated items within window_hours) receives a non-exempt material item as DEPRIORITIZED — waiting,
 * visible, with its overload record (the cap, the load, the items holding the capacity); C3 and C4 are never held for capacity.
 *
 *   the rebalance   when capacity frees, the waiting items are ELEVATED in rank order (item.elevated with the explanation) — by the
 *                   attention tick (step `rebalance`, order 20, under executive.attention.tick) and by an operator's route
 *                   (executive.attention.rebalance, human-gated). A second call elevates nothing more.
 *   the view        the deprioritized view: the items waiting for capacity (ranked, each with its overload record), the items below
 *                   the thresholds or abstained on (ranked, each with the engine's reasons), and the recent elevations with their
 *                   explanations — nothing hidden. The legacy per-role cap is shown as stored and said to be unenforced.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { ExecutiveCapability, type ExecutiveReads } from '../executive.capabilities.js';
import { AttentionTickRegistry, type AttentionTickContext, type AttentionTickStep } from './tick.js';

type Row = Record<string, unknown>;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
/** The rank key in SQL (executive.attention_rank_key: ascending = first in the queue; a dimension with no input after one with). */
const RANK_ORDER = sql`executive.attention_rank_key(evaluation -> 'dimensions')`;

/** THE TICK STEP `rebalance` (order 20: after the escalation, before the deliveries — so a delivery is planned for what it elevated). */
@Injectable()
export class AttentionRebalanceStep implements AttentionTickStep, OnModuleInit {
  readonly name = 'rebalance';
  readonly order = 20;
  constructor(private readonly registry: AttentionTickRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async run(ctx: AttentionTickContext): Promise<Record<string, unknown>> {
    const r = await ExecutiveCapability.attention(ctx.tx, 'executive.attention.tick').rebalance({ tenantId: ctx.tenantId, domainId: ctx.domainId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
    const elevated = Array.isArray(r['elevated']) ? (r['elevated'] as Row[]) : [];
    const waiting = Array.isArray(r['waiting']) ? r['waiting'] : [];
    return { elevated: elevated.length, waiting: waiting.length, items: elevated.map((e) => e['item_id']).slice(0, 50) };
  }
}

@Injectable()
export class AttentionMaterialityService {
  /**
   * THE DEPRIORITIZED VIEW: the waiting (overload) and the below-threshold / abstained items in RANK order, each with the rank's
   * explanation and why it waits; the latest elevations with their explanations; the overload rule of the active version.
   */
  async deprioritized(cap: ExecutiveReads, now: string): Promise<{ waiting: Row[]; below: Row[]; elevated: Row[]; overload: Row | null; as_of: string }> {
    const cols = ['item_id', 'signal_class', 'subject_kind', 'subject_id', 'title', 'outcome', 'state', 'owner_principal_id', 'route_roles', 'policy_version', 'evaluation', 'created_at', 'updated_at'];
    const ranked = (await cap.readAttentionItems().select([...cols, sql`executive.attention_rank(evaluation -> 'dimensions')`.as('rank')] as never)
      .where('state' as never, '=', 'deprioritized' as never).orderBy(RANK_ORDER as never).orderBy('created_at' as never).orderBy('item_id' as never).limit(500).execute()) as Row[];
    const shape = (r: Row): Row => {
      const ev = obj(r['evaluation']);
      return {
        item_id: r['item_id'], signal_class: r['signal_class'], subject_kind: r['subject_kind'], subject_id: r['subject_id'], title: r['title'], outcome: r['outcome'], state: r['state'],
        owner_principal_id: r['owner_principal_id'], route_roles: r['route_roles'], policy_version: r['policy_version'],
        rank: r['rank'], reasons: Array.isArray(ev['reasons']) ? ev['reasons'] : [], dimensions: obj(ev['dimensions']), overload: ev['overload'] ?? null,
        waiting_since: iso(r['updated_at']), created_at: iso(r['created_at']),
      };
    };
    const waiting = ranked.filter((r) => r['outcome'] === 'material' && 'overload' in obj(r['evaluation'])).map(shape);
    const below = ranked.filter((r) => !(r['outcome'] === 'material' && 'overload' in obj(r['evaluation']))).map(shape);
    const events = (await cap.readAttentionItemEvents().select(['item_id', 'actor_principal_id', 'details', 'occurred_at'] as never)
      .where('event' as never, '=', 'item.elevated' as never).orderBy('occurred_at' as never, 'desc').orderBy('event_id' as never, 'desc').limit(50).execute()) as Row[];
    const ids = [...new Set(events.map((e) => String(e['item_id'])))];
    const items = ids.length === 0 ? [] : ((await cap.readAttentionItems().select(['item_id', 'title', 'signal_class', 'state', 'owner_principal_id'] as never).where('item_id' as never, 'in', ids as never).execute()) as Row[]);
    const byId = new Map(items.map((i) => [String(i['item_id']), i]));
    const elevated = events.map((e) => {
      const d = obj(e['details']); const i = byId.get(String(e['item_id'])) ?? {};
      return { item_id: e['item_id'], title: i['title'] ?? null, signal_class: i['signal_class'] ?? null, state_now: i['state'] ?? null, owner_principal_id: i['owner_principal_id'] ?? null,
               to_state: d['to_state'] ?? null, explanation: d['explanation'] ?? null, rank: d['rank'] ?? null, capacity: d['capacity'] ?? null, exempt: d['exempt'] === true,
               policy_version: d['policy_version'] ?? null, by: e['actor_principal_id'], occurred_at: iso(e['occurred_at']) };
    });
    const active = ((await cap.readAttentionPolicies().select(['version', 'rules'] as never).where('state' as never, '=', 'active' as never).execute()) as Row[])[0] ?? null;
    const rule = active === null ? null : obj(obj(active['rules'])['overload']);
    const overload = active === null ? null : {
      policy_version: Number(active['version']),
      max_open_per_owner: rule?.['max_open_per_owner'] ?? null, window_hours: rule?.['window_hours'] ?? null,
      exempt_min_consequence: rule?.['exempt_min_consequence'] ?? (rule?.['max_open_per_owner'] === undefined ? null : 'C3'),
      enforced: typeof rule?.['max_open_per_owner'] === 'number',
      legacy_max_open_per_role: rule?.['max_open_per_role'] ?? null,
      note: typeof rule?.['max_open_per_owner'] === 'number'
        ? 'enforced at routing: a non-exempt material item for an owner at the cap waits here until capacity frees; C3 and C4 are never held for capacity'
        : rule?.['max_open_per_role'] !== undefined
          ? 'this version names only the legacy max_open_per_role, which is not enforced (stored versions are immutable); a new version names max_open_per_owner'
          : 'this version names no overload rule: nothing waits for capacity',
    };
    return { waiting, below, elevated, overload, as_of: now };
  }
}
