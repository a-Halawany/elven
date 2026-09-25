/**
 * THE CONTEXT QUERY'S PRODUCT STATE (CP-6 B23, 0084; L3-I02 RetrieveContext — "Returns policy-filtered memory and explanation
 * links for an explicit purpose"; reliability "No state change; consistency and staleness explicit"; failure "Return
 * partial/stale only with declared product state").
 *
 * Pure: the words and the decision, no database. The route (graph.controller.ts `/memory/context`) reads the projection block
 * FIRST, runs the STABLE query (memory.retrieve_context), applies clearance and audience roles, records the access rows, and
 * asks this module what the answer IS:
 *
 *   partial   — something the answer depends on was LEFT OUT and is NAMED in `omitted` (the projection or tier, the reason, the
 *               rows): explanation links resting on a withdrawn edges_current / entities_current partition (counted over the SERVED
 *               items); versions the content tier does not hold, of items the reader may read (B23-F1); the whole item set when
 *               the content tier did not answer (200 partial — never the 503 a single retrieval answers).
 *   stale     — nothing left out, and the condition of the context's partitions is lagging, unverified or withdrawn (served
 *               from the log, labelled): the answer is whole for the state the subscriber verified, not for the latest revision.
 *   complete  — otherwise.
 *
 * partial and stale carry EYE-DEG-001 (the answer's `code` and the audit row's result code); complete carries none (audit OK).
 * The FLAG is `product_state`; the LABEL is the wording — a screen renders from the flag (the B20 rule).
 *
 * What the POLICY withholds (the purpose, the clearance, the audience roles) is NEVER an omission: it is neither counted nor
 * mentioned (B10's rule) — the answer states only that policy filtering applied (CONTEXT_POLICY_NOTE).
 *
 * B23-F1 (0085): the DIAGNOSTICS obey the same policy. The query takes the reader's clearance, roles and administrator flag, so its
 * content-absent count and its scan-bound flag are over the AUTHORIZED set; a content-absent item is counted only while
 * memory_items_current serves and its own row admits the reader (while it is withdrawn nothing trustworthy authorizes an absent
 * version: nothing is counted). Rows the log cannot vouch for (the projection's rows the log does not know, while memory_items_current
 * is withdrawn) carry untrusted policy metadata by definition: never served, never counted, never mentioned — a log-sourced answer
 * says so once, in words that depend on no record (CONTEXT_LOG_NOTE), beside its stale/withdrawn label.
 */
import type { PartitionState, ProjectionBlock, ProjectionName } from '../projections/projection-state.js';
import { REBUILD_ROUTE } from '../projections/projection-state.js';

export type ContextProductState = 'complete' | 'stale' | 'partial';
/** A left-out part of the answer: the projection (or the content tier) it rests on, why, and how many rows (null: unknown — nothing was read to count). */
export interface ContextOmission { projection: ProjectionName | 'content_tier'; reason: string; rows: number | null }

/** Said on every answer: the policy applied, and what it withholds is not said (literal — the harness and the page pin it). */
export const CONTEXT_POLICY_NOTE = 'policy-filtered: the declared purpose, the reader\'s clearance in this domain and the audience roles were applied to every item; what the policy withholds is neither counted nor mentioned';
/* B23-F1 (0085) */
/** Said on every answer served from the LOG (memory_items_current withdrawn) — constant: it counts nothing and names no record (literal — the harness and the page pin it). */
export const CONTEXT_LOG_NOTE = 'served from the event log: memory rows the log cannot vouch for are never served and are not counted';
/* end B23-F1 */
/** Said on every answer: the consistency rule (the B20 wording). */
export const CONTEXT_CONSISTENCY_NOTE = 'the projection state was read first in this transaction (read committed): the rows served may be newer than the stated revision, never older';
/** The route's own bound on the items it serves; the port's scan bound is separate (CONTEXT_SCAN_BOUND). */
export const CONTEXT_LIMIT_MAX = 200;
/** The port's bound on the purpose-admitted candidates it reads (memory.retrieve_context p_limit, 1..500). */
export const CONTEXT_SCAN_BOUND = 500;

const since = (p: PartitionState | undefined): string => `since ${String(p?.withdrawn_since ?? 'an unknown instant')} (${String(p?.reason ?? 'no reason recorded')})`;

/** Explanation links left out because the partition they resolve against is withdrawn. */
export function withheldLinksReason(projection: 'edges_current' | 'entities_current', p: PartitionState | undefined, n: number): string {
  const what = projection === 'edges_current' ? 'graph edges' : 'graph entities';
  return `${n} explanation link(s) to ${what} are left out: the ${projection} projection of this domain is withdrawn ${since(p)} and cannot vouch for them until it is rebuilt (${REBUILD_ROUTE(projection)})`;
}
/** Linked items the reader may read whose current version (as the metadata tier names it) the content tier does not hold (B23-F1: counted by the query over the authorized set only). */
export function contentAbsentReason(n: number): string {
  return `${n} memory item(s) linked to this subject are not served: the content tier holds no version the metadata tier names — an item is served with its version or not at all`;
}
/** The content tier did not answer: the item set is left out whole (200 partial, never the single retrieval's 503). */
export function contentUnavailableReason(detail: string, memoryWithdrawn: boolean): string {
  return `the memory items are not served: the content tier did not answer (${detail})${memoryWithdrawn ? ' while the memory_items_current projection of this domain is withdrawn' : ''}; an item is served with its version or not at all — retry when the content tier answers`;
}

/**
 * The omissions of a served answer: the withheld links summed over the items SERVED (after the policy filter — a withheld item's
 * links are never counted), the versions the content tier does not hold of items the reader may read (the query's authorized count).
 * B23-F1 (0085): no unverified branch — rows the log cannot vouch for are neither counted nor mentioned.
 */
export function omissionsOf(block: ProjectionBlock, served: Array<{ withheld_links?: unknown }>, raw: { content_absent_rows?: unknown }): ContextOmission[] {
  const part = (name: ProjectionName) => block.partitions.find((p) => p.projection === name);
  const sum = (key: 'edges_current' | 'entities_current') => served.reduce((n, it) => n + Number(((it.withheld_links ?? {}) as Record<string, unknown>)[key] ?? 0), 0);
  const out: ContextOmission[] = [];
  const absent = Number(raw.content_absent_rows ?? 0);
  if (absent > 0) out.push({ projection: 'content_tier', reason: contentAbsentReason(absent), rows: absent });
  for (const key of ['edges_current', 'entities_current'] as const) {
    const n = sum(key);
    if (n > 0) out.push({ projection: key, reason: withheldLinksReason(key, part(key), n), rows: n });
  }
  return out;
}

/** The product state, its code and its label — from the flags (the omissions, the block's condition), never from a label. */
export function productStateOf(block: ProjectionBlock, omitted: ContextOmission[]): { product_state: ContextProductState; code: 'EYE-DEG-001' | null; label: string | null } {
  if (omitted.length > 0) {
    const tail = block.label === null ? '' : ` — ${block.label}`;
    return { product_state: 'partial', code: 'EYE-DEG-001', label: `partial: ${omitted.map((o) => o.reason).join('; ')}${tail}` };
  }
  if (block.condition !== 'current') {
    return { product_state: 'stale', code: 'EYE-DEG-001', label: `stale: ${block.label ?? 'the projection state is not current'}` };
  }
  return { product_state: 'complete', code: null, label: null };
}
