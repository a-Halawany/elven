/**
 * THE PROJECTION STATE OF A READ (CP-6 B20, 0080; design §2.2, D1, D5; corrections C1, C2, C10).
 *
 * There is no lexical or vector index in this product: the index tier IS the six derived projections a domain's reads
 * serve from (`graph.entities_current`, `graph.resolutions_current`, `graph.edges_current`, `graph.strategy_current`,
 * `graph.invalidations_current`, `memory.items_current`). `graph.projection_state()` answers six rows — the partition's
 * state (serving | withdrawn) and the DERIVED watermark: the domain's latest GraphChanged/MemoryCorrected sequence (the
 * revision), the sequence the retrieval subscriber has VERIFIED through (the live contiguous applied prefix of its
 * deliveries — C2; the dispatcher's stored cursor is answered beside it as `checkpoint_seq`), the lag, the unresolved
 * deliveries, the subscription that verifies. Every one of the twelve exploration and memory read routes calls
 * `projectionStateOf` FIRST in its transaction and answers this block beside its rows: a stale, lagging or unverified
 * projection never appears current (AU-MEM-0068).
 *
 * THE FLAG IS `condition` / `degraded`; THE LABEL IS THE WORDING. A screen renders from the flag and uses the label as
 * the text — never the other way round. The per-partition condition is the port's: withdrawn (the row) > unverified (no
 * live retrieval subscription, or one that has applied no check yet — C1) > lagging (a change the subscriber has not
 * verified yet) > current. Lag is VERIFICATION lag, never data lag: the ports write a projection and its log in one
 * transaction; the label says so.
 *
 * `EYE-DEG-001` (the catalogue's capability_degraded) is DECLARED as the code of a served-but-constrained 200 answer and
 * as the evidenced retrieval's audit result code — never as an HTTP refusal here (the one refusal B20 adds to a read is
 * the memory retrieval's 503 while its partition is withdrawn AND the content tier does not answer, C7, in the memory
 * service). A client mapping codes to statuses reads the status, not the code.
 *
 * Under READ COMMITTED the rows a read serves after this call can be NEWER than the stated revision, never older — the
 * state is read first in the same transaction (§9.6); nothing here claims otherwise.
 */
// No import from graph.capabilities.ts: that file imports ProjectionName from here, and the boundaries gate (dependency-cruiser,
// no-circular, type-only imports counted) refuses the cycle — the one read this helper needs is typed structurally instead.
/** The one read the helper needs: `graph.projection_state()` under the established context (GraphReads.projectionState). */
export interface ProjectionStateReads { projectionState(): Promise<Array<Record<string, unknown>>> }

export const PROJECTIONS = ['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current'] as const;
export type ProjectionName = (typeof PROJECTIONS)[number];
export type Condition = 'current' | 'lagging' | 'unverified' | 'withdrawn';
export const CONDITION_RANK: Readonly<Record<Condition, number>> = Object.freeze({ current: 0, lagging: 1, unverified: 2, withdrawn: 3 });

/** The partitions each read route depends on — the block names them and the worst decides. */
export const ROUTE_PARTITIONS = Object.freeze({
  search: ['entities_current'], entitiesList: ['entities_current', 'resolutions_current'], entityGet: ['entities_current', 'resolutions_current'],
  edgesList: ['edges_current'], neighbourhood: ['edges_current', 'entities_current'], path: ['edges_current', 'entities_current'],
  strategyList: ['strategy_current'], strategyGet: ['strategy_current'], overview: [...PROJECTIONS],
  memoryList: ['memory_items_current'], memoryGet: ['memory_items_current'], memoryRetrieve: ['memory_items_current'],
} as const satisfies Record<string, readonly ProjectionName[]>);

/* B23 (0084) context */
/**
 * The partitions the CONTEXT query (L3-I02, POST …/graph/memory/context) depends on: the memory items it serves and the entity
 * and edge rows its explanation links resolve against. Kept OUTSIDE ROUTE_PARTITIONS on purpose: that object is the TWELVE B20
 * routes (its keys are iterated as the twelve by the B20 harness and the unit test), and B23 changes none of them.
 */
export const CONTEXT_PARTITIONS = Object.freeze(['memory_items_current', 'edges_current', 'entities_current'] as const satisfies readonly ProjectionName[]);
/* end B23 context */

/** The way back to service, named in every withdrawn label (a literal the harness regexes — copy, never retype). */
export const REBUILD_ROUTE = (projection: ProjectionName): string => `POST …/graph/projections/${projection}/rebuild (graph.projection.rebuild)`;

/** C10: the operator's verify route reports and withdraws nothing — said on its answer. */
export const VERIFY_NOTE = 'this route verifies and withdraws nothing: a failed row here is withdrawn by the operator (graph.projection.withdraw) or by the retrieval subscriber at the domain\'s next GraphChanged/MemoryCorrected event';

export interface PartitionState {
  projection: ProjectionName; state: 'serving' | 'withdrawn'; condition: Condition;
  withdrawn_since: string | null; reason: string | null; withdrawn_by_check: string | null;
  representation_version: string; representation_current: string; representation_ok: boolean;
  last_rebuild_id: string | null; rebuilt_at: string | null; last_check: Record<string, unknown> | null;
}

export interface ProjectionBlock {
  /** The domain's latest GraphChanged/MemoryCorrected partition sequence — null before the first change. */
  revision: number | null;
  /** The sequence the retrieval subscriber verified through (the live contiguous applied prefix, C2) — null until its first check applies (C1). */
  verified_seq: number | null;
  verified_at: string | null;
  verified_check_id: string | null;
  /** The dispatcher's stored cursor, answered beside the prefix (C2). */
  checkpoint_seq: number | null;
  lag_events: number;
  unresolved_deliveries: number;
  subscription: { subscription_id: string | null; status: string | null };
  /** The ROUTE's partitions, in the route's order. */
  partitions: PartitionState[];
  /** The worst condition among the route's partitions. */
  condition: Condition;
  /** True iff `condition === 'withdrawn'`: the answer is served from the log, labelled and constrained. */
  degraded: boolean;
  code: 'EYE-DEG-001' | null;
  label: string | null;
  /** The route's withdrawn partitions. */
  withdrawn: ProjectionName[];
  /** Every withdrawn partition of the DOMAIN, whatever the route reads (C2 — the held form of the lagging label names them). */
  domain_withdrawn: ProjectionName[];
}

type Row = Record<string, unknown>;

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
};
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const isCondition = (v: unknown): v is Condition => v === 'current' || v === 'lagging' || v === 'unverified' || v === 'withdrawn';
const isProjection = (v: unknown): v is ProjectionName => (PROJECTIONS as readonly string[]).includes(String(v));

/** The worst condition among the route's partitions (withdrawn > unverified > lagging > current); `unverified` for no partition at all. */
export function worstOf(conditions: Condition[]): Condition {
  if (conditions.length === 0) return 'unverified';
  let worst: Condition = 'current';
  for (const c of conditions) if (CONDITION_RANK[c] > CONDITION_RANK[worst]) worst = c;
  return worst;
}

const LAG_TAIL = ' — the ports write a projection and its log in one transaction, so this is verification lag, not data lag';

/**
 * The DOMAIN's sentence (C1, C2): the unverified form (no subscription; a subscription that has verified nothing yet), the
 * lagging form (plain; held by unresolved deliveries — a failed check, its partitions still withdrawn or since rebuilt),
 * or nothing when the domain is verified through its latest revision. Computed from the domain's values, never from the
 * route's partitions.
 */
function domainSentence(b: Omit<ProjectionBlock, 'label'>): string | null {
  if (b.subscription.subscription_id === null) return 'no live retrieval subscription verifies this domain\'s projections; the projection watermark is unknown';
  if (b.verified_seq === null) return 'a retrieval subscription is registered and has verified nothing yet (no check applied); the projection watermark is unknown until its first check applies';
  if (b.lag_events > 0) {
    if (b.unresolved_deliveries === 0) {
      return `verified through revision ${b.verified_seq} (at ${b.verified_at}); ${b.lag_events} change(s) since are not yet verified by the retrieval subscriber${LAG_TAIL}`;
    }
    const held = b.domain_withdrawn.length > 0
      ? `(a failed check: partition(s) ${b.domain_withdrawn.join(', ')} withdrawn until rebuilt)`
      : '(a failed check whose partition(s) have since been rebuilt; the delivery clears at its re-drive)';
    return `verified through revision ${b.verified_seq} (at ${b.verified_at}); the retrieval subscriber's checkpoint is held there by ${b.unresolved_deliveries} unresolved delivery(ies) ${held}; ${b.lag_events} change(s) since are checked as they arrive but not checkpointed${LAG_TAIL}`;
  }
  return null;
}

/** The wording — a label is never the flag; the flag is `condition` / `degraded`. */
export function labelOf(b: Omit<ProjectionBlock, 'label'>): string | null {
  if (b.condition === 'current') return null;
  const domain = domainSentence(b);
  if (b.condition !== 'withdrawn') return domain;
  const withdrawn = b.partitions.filter((p) => p.condition === 'withdrawn')
    .map((p) => `the ${p.projection} projection of this domain is withdrawn since ${p.withdrawn_since} (${p.reason}); this answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt (${REBUILD_ROUTE(p.projection)})`)
    .join('; ');
  return domain === null ? withdrawn : `${withdrawn} — ${domain}`;
}

/**
 * The six rows of graph.projection_state() as the block: pure and TOTAL. Zero rows (a context without a domain — none of
 * the twelve routes, which are all DOMAIN-scoped) yields no partitions, `unverified` and its label, never a throw.
 */
export function blockOf(rows: Row[], partitions: readonly ProjectionName[]): ProjectionBlock {
  const byName = new Map<string, Row>();
  for (const r of rows) byName.set(String(r['projection']), r);
  const first = rows[0];
  const domainWithdrawn = rows.filter((r) => r['state'] === 'withdrawn').map((r) => r['projection']).filter(isProjection);
  const states: PartitionState[] = [];
  for (const name of partitions) {
    const r = byName.get(name);
    if (r === undefined) continue;
    const condition = isCondition(r['condition']) ? r['condition'] : 'unverified';
    states.push({
      projection: name, state: r['state'] === 'withdrawn' ? 'withdrawn' : 'serving', condition,
      withdrawn_since: iso(r['withdrawn_at']), reason: str(r['withdrawn_reason']), withdrawn_by_check: str(r['withdrawn_by_check']),
      representation_version: String(r['representation_version'] ?? ''), representation_current: String(r['representation_current'] ?? ''),
      representation_ok: r['representation_ok'] === true,
      last_rebuild_id: str(r['last_rebuild_id']), rebuilt_at: iso(r['rebuilt_at']),
      last_check: (r['last_check'] ?? null) as Record<string, unknown> | null,
    });
  }
  const condition = worstOf(states.map((p) => p.condition));
  const degraded = condition === 'withdrawn';
  const withoutLabel: Omit<ProjectionBlock, 'label'> = {
    revision: num(first?.['revision_seq']), verified_seq: num(first?.['verified_seq']), verified_at: iso(first?.['verified_at']),
    verified_check_id: str(first?.['verified_check_id']), checkpoint_seq: num(first?.['checkpoint_seq']),
    lag_events: num(first?.['lag_events']) ?? 0, unresolved_deliveries: num(first?.['unresolved_deliveries']) ?? 0,
    subscription: { subscription_id: str(first?.['subscription_id']), status: str(first?.['subscription_status']) },
    partitions: states, condition, degraded, code: degraded ? 'EYE-DEG-001' : null,
    withdrawn: states.filter((p) => p.condition === 'withdrawn').map((p) => p.projection),
    domain_withdrawn: domainWithdrawn,
  };
  return { ...withoutLabel, label: labelOf(withoutLabel) };
}

/**
 * ONE call, FIRST in the read's transaction, so the rows read after it are never OLDER than the stated revision (they can
 * be newer under READ COMMITTED — said here, never claimed otherwise).
 */
export async function projectionStateOf(cap: ProjectionStateReads, partitions: readonly ProjectionName[]): Promise<ProjectionBlock> {
  return blockOf(await cap.projectionState(), partitions);
}
