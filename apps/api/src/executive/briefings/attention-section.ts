/**
 * BRF@v2's ATTENTION SECTION — CP-6 B23 (migration 0084).
 *
 * The routed attention items AS OF the edition's known_at, and the material changes since the prior edition — composed from stored
 * records alone, under the briefing's own rule (briefing.service.ts, review of PR #46): every mutable state is read AS OF known_at
 * from the record's own events, so a later acknowledgement, escalation, suppression, re-evaluation or closure never rewrites an earlier
 * edition's digest. An item's state at known_at is the state its log (executive.attention_item_events, occurred_at ≤ known_at) leaves
 * it in; an item with no event by then did not exist yet. The section rides INSIDE the content, so the content digest covers it.
 *
 *   items                          the items ROUTED at known_at — open, escalated, unrouted, acknowledged, suppressed — each with the
 *                                  policy version it stood under then, its transparent dimensions and its CONFIDENCE BAND (high ≥ 0.8,
 *                                  medium ≥ 0.5, low below, unknown when the signal carried none); ordered by creation, then id.
 *   counts                         every state at known_at, the deprioritized and the closed included (nothing hidden).
 *   material_changes_since_prior   the decision.material_change items created in (prior known_at, known_at] (≤ known_at with no
 *                                  prior), whatever their state now — each with its state at known_at.
 *   policy_version                 the attention-policy version in force at known_at (effective by then, not superseded by then), or null.
 */
type Row = Record<string, unknown>;

/* B24 (0086) materiality: the further dimensions a line carries when its item was judged with them (in this order). */
export const FURTHER_DIMENSIONS = ['probability', 'exposure', 'strategic_relevance', 'information_value', 'irreversibility'] as const;
/* end B24 materiality */
export const LIVE_AT_STATES = ['open', 'escalated', 'unrouted', 'acknowledged', 'suppressed'] as const;
export const ALL_ITEM_STATES = ['open', 'escalated', 'unrouted', 'acknowledged', 'suppressed', 'deprioritized', 'closed'] as const;
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

/** The band of a confidence (the rule in the header). */
export function confidenceBand(c: unknown): ConfidenceBand {
  if (typeof c !== 'number' || !Number.isFinite(c)) return 'unknown';
  return c >= 0.8 ? 'high' : c >= 0.5 ? 'medium' : 'low';
}

/** An item's state and policy version after its log up to an instant; null when the item had no event by then (it did not exist yet). */
export function stateAsOf(events: Array<{ event: string; details: Row | null; occurred_at: unknown }>, at: string): { state: string; policy_version: number | null; acknowledged: boolean } | null {
  let state: string | null = null; let version: number | null = null; let acknowledged = false;
  for (const e of events) {
    if (iso(e.occurred_at) > at) break;
    const d = e.details ?? {};
    switch (e.event) {
      case 'item.routed': state = 'open'; version = typeof d['policy_version'] === 'number' ? d['policy_version'] : version; break;
      case 'item.deprioritized': state = 'deprioritized'; version = typeof d['policy_version'] === 'number' ? d['policy_version'] : version; break;
      case 'item.unrouted': state = 'unrouted'; version = typeof d['policy_version'] === 'number' ? d['policy_version'] : version; break;
      // an exhausted chain is recorded as an escalation event but leaves the state where it stood
      case 'item.escalated': if (d['exhausted'] !== true) state = 'escalated'; if (typeof d['policy_version'] === 'number') version = d['policy_version']; break;
      case 'item.acknowledged': state = 'acknowledged'; acknowledged = true; break;
      case 'item.suppressed': state = 'suppressed'; break;
      case 'item.suppression_lapsed': state = acknowledged ? 'acknowledged' : 'open'; break;
      case 'item.reevaluated': state = typeof d['to_state'] === 'string' ? d['to_state'] : state; version = typeof d['to_version'] === 'number' ? d['to_version'] : version; break;
      case 'item.closed': state = 'closed'; break;
      /* B24 (0086) materiality: held for capacity at routing (the overload rule), and elevated from there when capacity frees */
      case 'item.overload_deprioritized': state = 'deprioritized'; version = typeof d['policy_version'] === 'number' ? d['policy_version'] : version; break;
      case 'item.elevated': state = typeof d['to_state'] === 'string' ? d['to_state'] : 'open'; version = typeof d['policy_version'] === 'number' ? d['policy_version'] : version; break;
      /* end B24 materiality */
      default: break; // item.repeated: no change
    }
  }
  return state === null ? null : { state, policy_version: version, acknowledged };
}

/** The policy version in force at an instant: effective by then and not superseded by then. */
export function policyVersionAt(policies: Array<{ version: unknown; effective_at: unknown; superseded_at: unknown }>, at: string): number | null {
  const inForce = policies.filter((p) => iso(p.effective_at) <= at && (p.superseded_at === null || p.superseded_at === undefined || iso(p.superseded_at) > at));
  if (inForce.length === 0) return null;
  return Math.max(...inForce.map((p) => Number(p.version)));
}

export interface AttentionSection {
  as_of: string; since: string | null; policy_version: number | null;
  items: Row[]; counts: Record<string, number>; material_changes_since_prior: Row[];
}

/** The section from the queue's rows, their logs and the policy versions — deterministic for the same records and instants. */
export function attentionSection(a: { items: Row[]; events: Array<Row & { item_id: unknown; event: string; details: Row | null; occurred_at: unknown }>; policies: Array<{ version: unknown; effective_at: unknown; superseded_at: unknown }>; knownAt: string; since: string | null }): AttentionSection {
  const byItem = new Map<string, Array<{ event: string; details: Row | null; occurred_at: unknown; event_id: string }>>();
  for (const e of a.events) {
    const k = String(e.item_id);
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k)!.push({ event: e.event, details: e.details, occurred_at: e.occurred_at, event_id: String(e['event_id'] ?? '') });
  }
  for (const list of byItem.values()) list.sort((x, y) => (iso(x.occurred_at) < iso(y.occurred_at) ? -1 : iso(x.occurred_at) > iso(y.occurred_at) ? 1 : x.event_id < y.event_id ? -1 : x.event_id > y.event_id ? 1 : 0));
  const ordered = [...a.items].sort((x, y) => (iso(x['created_at']) < iso(y['created_at']) ? -1 : iso(x['created_at']) > iso(y['created_at']) ? 1 : String(x['item_id']) < String(y['item_id']) ? -1 : 1));
  const counts: Record<string, number> = Object.fromEntries(ALL_ITEM_STATES.map((s) => [s, 0]));
  const items: Row[] = []; const changes: Row[] = [];
  for (const x of ordered) {
    const at = stateAsOf(byItem.get(String(x['item_id'])) ?? [], a.knownAt);
    if (at === null) continue;
    counts[at.state] = (counts[at.state] ?? 0) + 1;
    const dims = ((x['evaluation'] as Row | null)?.['dimensions'] ?? {}) as Row;
    const confidence = typeof dims['confidence'] === 'number' ? dims['confidence'] : null;
    const line: Row = {
      item_id: String(x['item_id']), signal_class: String(x['signal_class']), subject_kind: String(x['subject_kind']), subject_id: String(x['subject_id']), title: String(x['title'] ?? ''),
      state: at.state, policy_version: at.policy_version, owner: (x['owner_principal_id'] ?? null) as string | null,
      consequence: typeof dims['consequence'] === 'string' ? dims['consequence'] : null, confidence, confidence_band: confidenceBand(confidence),
      hours_to_window: typeof dims['hours_to_window'] === 'number' ? dims['hours_to_window'] : null, created_at: iso(x['created_at']), cause_event_id: String(x['cause_event_id'] ?? ''),
    };
    /* B24 (0086) materiality: the further dimensions ADDED after the line's keys (never reordered), and only on an item judged with them —
       an item recorded before 0086 composes exactly as it did, so an earlier edition recomposes to the same digest. */
    for (const k of FURTHER_DIMENSIONS) if (k in dims) line[k] = dims[k] ?? null;
    /* end B24 materiality */
    if ((LIVE_AT_STATES as readonly string[]).includes(at.state)) items.push(line);
    const created = iso(x['created_at']);
    if (x['signal_class'] === 'decision.material_change' && (a.since === null || created > a.since) && created <= a.knownAt) changes.push(line);
  }
  return { as_of: a.knownAt, since: a.since, policy_version: policyVersionAt(a.policies, a.knownAt), items, counts, material_changes_since_prior: changes };
}
