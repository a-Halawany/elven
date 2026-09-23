/**
 * THE LAST VALID STATE (CP-6 B20, 0080; design §2.3, D6; corrections C15, N2).
 *
 * While a partition is WITHDRAWN (a failed retrieval check — drifted, missing or poisoned rows, an outdated representation
 * — or the operator's act) the listing and get routes serve the state the EVENT LOG derives, joined to the projection row
 * for the attributes the log does not carry:
 *
 *   * a row in both whose state differs is served with the LOG's state and `drift: { projected, log }`;
 *   * a row the log has and the projection lacks is served METADATA-ONLY (`projected: false`) — what the log carries, and
 *     nothing invented;
 *   * a row the projection has and the log does not know (POISONED) is never served — it is simply not in the expected set;
 *   * every served row says where it came from (`from: 'log'` for the log-derived shapes; `from: 'projection'` for a
 *     projection row whose STATE the log re-verified; `from_projection: [...]` lists the columns taken from the row).
 *
 * The expected rows come from the ONE derivation the check and the rebuild use (`graph.expected_*` / `memory.expected_items`,
 * 0080 §2), read as the CALLER under the event tables' forced RLS through the SAME capability and action the route holds:
 * nothing is widened by the fallback — a reader sees from the log exactly what it may see from the projection (policy
 * equivalence, IA-35-005). The structural `ExpectedReads` pick lets the executive capability (the briefing composer) use
 * the same functions.
 *
 * N2: the entity `updated_at` the log yields is `max(occurred_at)` over ALL the entity's events (`entity.identified`
 * included) — an approximation of the row's instant (only a split or a retirement touches the projection's `updated_at`,
 * 0024:1046, 0077:570) — never a state; the listing orders by it and says nothing more of it.
 */
import type { GraphReads } from '../graph.capabilities.js';
// No import from edges/edges.service.ts: that file imports edgesFromLog from here, and the boundaries gate (dependency-cruiser,
// no-circular, type-only imports counted) refuses the cycle — the edge row's shape (EdgesService's EdgeRow, byte for byte) is
// declared here; the service's EdgeRow is structurally the same type, so the two compose without a cast.
import type { ProjectionName } from './projection-state.js';

export type ExpectedReads = Pick<GraphReads, 'expected' | 'readEntities' | 'readEdges' | 'readResolutions' | 'readStrategy' | 'readInvalidations' | 'readMemoryItems' | 'readCanonicalObjects'>;
export interface Scope { tenantId: string; domainId: string }
type Row = Record<string, unknown>;
export interface Drift { projected: string; log: string }

const present = (v: unknown): boolean => v !== null && v !== undefined;
const instant = (v: unknown): number => (v instanceof Date ? v.getTime() : v === null || v === undefined ? Number.NaN : new Date(String(v)).getTime());
const newestFirst = (k: string) => (a: Row, b: Row): number => {
  const x = instant(a[k]); const y = instant(b[k]);
  if (Number.isNaN(x) && Number.isNaN(y)) return 0;
  if (Number.isNaN(x)) return 1;
  if (Number.isNaN(y)) return -1;
  return y - x;
};
/** The projection rows of exactly these ids (under RLS), keyed by the id column; nothing read for no ids. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rowsOf(q: () => any, column: string, ids: string[]): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  if (ids.length === 0) return out;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const rows = (await q().selectAll().where(column as never, 'in', ids as never).execute()) as Row[];
  for (const r of rows) out.set(String(r[column]), r);
  return out;
}

// ───────────────────────── entities ─────────────────────────

async function entityRows(cap: ExpectedReads, scope: Scope, ids: string[] | null): Promise<Row[]> {
  let expected = await cap.expected('entities_current', scope);
  if (ids !== null) { const wanted = new Set(ids); expected = expected.filter((e) => wanted.has(String(e['entity_id']))); }
  const projected = await rowsOf(() => cap.readEntities(), 'entity_id', expected.map((e) => String(e['entity_id'])));
  const out: Row[] = [];
  for (const e of expected) {
    const id = String(e['entity_id']); const p = projected.get(id); const state = String(e['state']);
    if (p === undefined) {
      // METADATA-ONLY: the log's state and whatever the log carries of the row (the entity.created details); nothing invented.
      const row: Row = { entity_id: id, lifecycle_state: state, projected: false, from: 'log' };
      for (const k of ['entity_type', 'canonical_name', 'normalized_name', 'split_from', 'superseded_by', 'created_at', 'updated_at', 'created_by', 'correlation_id']) if (present(e[k])) row[k] = e[k];
      out.push(row);
      continue;
    }
    const fromProjection: string[] = [];
    const row: Row = { ...p, lifecycle_state: state, projected: true, from: 'log' };
    for (const k of ['entity_type', 'canonical_name', 'normalized_name', 'split_from', 'created_at', 'updated_at', 'superseded_by']) {
      if (present(e[k])) row[k] = e[k]; else fromProjection.push(k);
    }
    if (fromProjection.length > 0) row['from_projection'] = fromProjection;
    if (String(p['lifecycle_state']) !== state) row['drift'] = { projected: String(p['lifecycle_state']), log: state } satisfies Drift;
    out.push(row);
  }
  return out;
}

/** The entities of the domain from the log, newest first, bounded (≤ 1000) — the shape of `EntitiesService.list` plus the provenance flags. */
export async function entitiesFromLog(cap: ExpectedReads, scope: Scope, limit = 200): Promise<Row[]> {
  const rows = await entityRows(cap, scope, null);
  return rows.sort(newestFirst('updated_at')).slice(0, Math.max(1, Math.min(limit, 1000)));
}

/** One entity from the log — `undefined` for an id the log does not know (a poisoned row answers as an absent one: the route's 404). */
export async function entityFromLog(cap: ExpectedReads, scope: Scope, entityId: string): Promise<Row | undefined> {
  return (await entityRows(cap, scope, [entityId]))[0];
}

// ───────────────────────── resolutions ─────────────────────────

/**
 * The resolutions from the log joined to their rows: the projection row's columns when present (`from: 'projection'` for
 * everything but `state`, which is the log's; `drift` when they differ), `projected: false` with `{ resolution_id, state,
 * entity_id, last_event }` when absent (the log carries neither the mention, the claim nor the evidence of a resolution —
 * the row is the proposer's record). The optional `entityId` filter uses the LOG's entity — a superseded row's is its
 * pre-move entity (the supersession event names it; 0024:1030) — falling back to the row's when the last event names none.
 */
export async function resolutionsFromLog(cap: ExpectedReads, scope: Scope, entityId?: string): Promise<Row[]> {
  const expected = await cap.expected('resolutions_current', scope);
  const projected = await rowsOf(() => cap.readResolutions(), 'resolution_id', expected.map((e) => String(e['resolution_id'])));
  const out: Row[] = [];
  for (const e of expected) {
    const id = String(e['resolution_id']); const p = projected.get(id); const state = String(e['state']);
    const entity = present(e['entity_id']) ? String(e['entity_id']) : p === undefined ? null : String(p['entity_id']);
    if (entityId !== undefined && entity !== entityId) continue;
    if (p === undefined) {
      out.push({ resolution_id: id, state, entity_id: entity, last_event: e['last_event'] ?? null, projected: false, from: 'log' });
      continue;
    }
    const row: Row = { ...p, state, projected: true, from: 'projection' };
    if (String(p['state']) !== state) row['drift'] = { projected: String(p['state']), log: state } satisfies Drift;
    out.push(row);
  }
  // The service's order (`proposed_at` ascending); a metadata-only row, which has no instant, sorts last.
  return out.sort((a, b) => {
    const x = instant(a['proposed_at']); const y = instant(b['proposed_at']);
    if (Number.isNaN(x) && Number.isNaN(y)) return 0;
    if (Number.isNaN(x)) return 1;
    if (Number.isNaN(y)) return -1;
    return x - y;
  });
}

/**
 * The mentions an entity held AT AN INSTANT over log-joined rows: the predicate of `EntitiesService.mentionsKnownAt` over
 * `accepted_at` / `superseded_at` — taken from the projection row when present; a metadata-only resolution has neither and
 * is excluded (nothing is inferred about when it was accepted).
 */
export function resolutionsKnownAt(rows: Row[], knownAt: string): Row[] {
  const t = new Date(knownAt).getTime();
  return rows.filter((r) => {
    const accepted = r['accepted_at'];
    if (accepted === null || accepted === undefined) return false;
    if (instant(accepted) > t) return false;
    const superseded = r['superseded_at'];
    if (superseded === null || superseded === undefined) return true;
    return instant(superseded) > t;
  });
}

// ───────────────────────── edges ─────────────────────────

/** The projection's edge row as EdgesService.EdgeRow declares it (kept equal by hand — the two files may not import each other). */
export interface EdgeRowShape {
  edge_id: string; subject_entity_id: string; predicate: string; object_entity_id: string;
  valid_from: string; valid_to: string | null; asserted_at: string; retracted_at: string | null;
  state: string; claim_object_id: string; claim_version: number;
  evidence_object_id: string; evidence_digest: string; mode: string; confidence: string;
  retraction_reason: string | null;
  superseded_at?: string | null;
}
export type LogEdgeRow = EdgeRowShape & { projected: boolean; from: 'log'; drift?: Drift; from_projection?: string[] };

/**
 * The edges from the log: the state and every instant `visibleAt` reads (`asserted_at`, `retracted_at`, `superseded_at`,
 * `valid_from`, `valid_to`) come from the events; the provenance the log does not carry (`evidence_object_id`,
 * `evidence_digest`, `confidence`, `method_id`, `run_id`) from the projection row (`from_projection`) or as nulls with
 * `projected: false`. The caller applies `visibleAt` and the bounds. A log row with no `edge.asserted` event (nothing to
 * derive ends or a predicate from) is skipped and counted in `omitted`.
 */
export async function edgesFromLog(cap: ExpectedReads, scope: Scope): Promise<{ edges: LogEdgeRow[]; omitted: number }> {
  const expected = await cap.expected('edges_current', scope);
  const projected = await rowsOf(() => cap.readEdges(), 'edge_id', expected.map((e) => String(e['edge_id'])));
  const edges: LogEdgeRow[] = []; let omitted = 0;
  for (const e of expected) {
    if (!present(e['subject_entity_id']) || !present(e['object_entity_id']) || !present(e['predicate']) || !present(e['valid_from'])) { omitted += 1; continue; }
    const id = String(e['edge_id']); const p = projected.get(id); const state = String(e['state']);
    const base = {
      edge_id: id, subject_entity_id: String(e['subject_entity_id']), predicate: String(e['predicate']), object_entity_id: String(e['object_entity_id']),
      valid_from: e['valid_from'] as string, valid_to: (e['valid_to'] ?? null) as string | null,
      asserted_at: e['asserted_at'] as string, retracted_at: (e['retracted_at'] ?? null) as string | null, superseded_at: (e['superseded_at'] ?? null) as string | null,
      state, claim_object_id: String(e['claim_object_id'] ?? ''), claim_version: Number(e['claim_version'] ?? 0), mode: String(e['mode'] ?? ''),
      retraction_reason: (e['retraction_reason'] ?? null) as string | null,
      asserted_by: e['asserted_by'] ?? null, retracted_by: e['retracted_by'] ?? null, superseded_by: e['superseded_by'] ?? null,
    };
    if (p === undefined) {
      edges.push({ ...base, evidence_object_id: null as unknown as string, evidence_digest: null as unknown as string, confidence: null as unknown as string,
                   method_id: null, run_id: null, projected: false, from: 'log' } as LogEdgeRow);
      continue;
    }
    const row = { ...base, evidence_object_id: p['evidence_object_id'] as string, evidence_digest: p['evidence_digest'] as string, confidence: p['confidence'] as string,
                  method_id: p['method_id'] ?? null, run_id: p['run_id'] ?? null, projected: true, from: 'log' as const,
                  from_projection: ['evidence_object_id', 'evidence_digest', 'confidence', 'method_id', 'run_id'] } as LogEdgeRow;
    if (String(p['state']) !== state) row.drift = { projected: String(p['state']), log: state };
    edges.push(row);
  }
  return { edges, omitted };
}

// ───────────────────────── strategy ─────────────────────────

async function strategyRows(cap: ExpectedReads, scope: Scope, ids: string[] | null): Promise<Row[]> {
  let expected = await cap.expected('strategy_current', scope);
  if (ids !== null) { const wanted = new Set(ids); expected = expected.filter((e) => wanted.has(String(e['strategy_object_id']))); }
  const projected = await rowsOf(() => cap.readStrategy(), 'strategy_object_id', expected.map((e) => String(e['strategy_object_id'])));
  const absent = expected.filter((e) => !projected.has(String(e['strategy_object_id']))).map((e) => String(e['strategy_object_id']));
  // The canonical object carries the statement of a row the projection lacks (the latest version by object_version).
  const statements = new Map<string, Row>();
  if (absent.length > 0) {
    const objects = (await cap.readCanonicalObjects().selectAll().where('object_id' as never, 'in', absent as never)
      .where('object_type' as never, 'in', ['OBJ', 'ASU', 'DEC', 'CMT', 'OUT'] as never).execute()) as Row[];
    for (const o of objects) {
      const id = String(o['object_id']); const prev = statements.get(id);
      if (prev === undefined || Number(o['object_version']) > Number(prev['object_version'])) statements.set(id, o);
    }
  }
  const out: Row[] = [];
  for (const e of expected) {
    const id = String(e['strategy_object_id']); const p = projected.get(id);
    const logState = present(e['state']) ? String(e['state']) : null;
    if (p === undefined) {
      const o = statements.get(id); const payload = (o?.['payload'] ?? {}) as Row;
      out.push({
        strategy_object_id: id, object_type: e['object_type'] ?? o?.['object_type'] ?? null, title: e['title'] ?? payload['title'] ?? null,
        object_version: e['object_version'] ?? o?.['object_version'] ?? null, status: e['status'] ?? payload['status'] ?? null,
        verification_state: logState ?? 'not_applicable', verification_reason: e['verification_reason'] ?? null, verified_at: e['verified_at'] ?? null,
        statement: payload['statement'] ?? null, declared_at: e['declared_at'] ?? null, owner_principal_id: e['declared_by'] ?? null,
        projected: false, from: 'log',
      });
      continue;
    }
    // The projection row, its VERIFICATION STATE re-verified by the log for an assumption (the only object whose log carries a state).
    const row: Row = { ...p, projected: true, from: 'projection' };
    if (String(p['object_type']) === 'ASU' && logState !== null) {
      row['verification_state'] = logState;
      if (String(p['verification_state']) !== logState) row['drift'] = { projected: String(p['verification_state']), log: logState } satisfies Drift;
    }
    out.push(row);
  }
  return out;
}

/** The strategy objects from the log, newest declaration first, bounded (≤ 1000). */
export async function strategyFromLog(cap: ExpectedReads, scope: Scope, limit = 200): Promise<Row[]> {
  const rows = await strategyRows(cap, scope, null);
  return rows.sort(newestFirst('declared_at')).slice(0, Math.max(1, Math.min(limit, 1000)));
}

/** One strategy object from the log — `undefined` for an id the log does not know. */
export async function strategyOneFromLog(cap: ExpectedReads, scope: Scope, objectId: string): Promise<Row | undefined> {
  return (await strategyRows(cap, scope, [objectId]))[0];
}

// ───────────────────────── invalidations ─────────────────────────

/** The invalidations from the log (the overview's counts): the log's state over the projection row when present. */
export async function invalidationsFromLog(cap: ExpectedReads, scope: Scope, limit = 1000): Promise<Row[]> {
  const expected = await cap.expected('invalidations_current', scope);
  const projected = await rowsOf(() => cap.readInvalidations(), 'invalidation_id', expected.map((e) => String(e['invalidation_id'])));
  const out: Row[] = [];
  for (const e of expected) {
    const id = String(e['invalidation_id']); const p = projected.get(id); const state = String(e['state']);
    if (p === undefined) {
      out.push({ invalidation_id: id, state, trigger_kind: e['trigger_kind'] ?? null, trigger_object_id: e['trigger_object_id'] ?? null, correction_case_id: e['correction_case_id'] ?? null,
                 opened_at: e['opened_at'] ?? null, opened_by: e['opened_by'] ?? null, projected: false, from: 'log' });
      continue;
    }
    const row: Row = { ...p, state, projected: true, from: 'projection' };
    if (String(p['state']) !== state) row['drift'] = { projected: String(p['state']), log: state } satisfies Drift;
    out.push(row);
  }
  return out.sort(newestFirst('opened_at')).slice(0, Math.max(1, Math.min(limit, 1000)));
}

// ───────────────────────── memory items ─────────────────────────

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const ownerOf = (accountable: unknown): string | null => {
  const s = String(accountable ?? '');
  return /^principal:[0-9a-f-]{36}$/.test(s) ? s.slice('principal:'.length) : null;
};

/**
 * The memory items from the log joined to their rows (C15): with `ids` EXACTLY those items (unbounded — the briefing's
 * candidates), with `limit` the newest `limit` by `recorded_at` (`/memory/list`). A present row keeps its content columns
 * (`from: 'projection'`) under the log's `state`, `object_version`, `attention_state`, `superseded_versions` and
 * `last_superseded_at` (`drift` when state or version differ — `state@version`, the rebuild's own idiom); an absent row is
 * built from the canonical MEM version the log names — its title, record class, source, classification, audience,
 * validity, retention, related objects, derivation and owner; NEVER its statement (a statement is a retrieval's, under a
 * purpose and an access record; `MemoryService.record` strips it anyway) — with `projected: false`. Every row carries
 * `index_state: 'stale'` (D22: the partition says what a per-row flag cannot).
 */
export async function memoryItemsFromLog(cap: ExpectedReads, scope: Scope, opts: { limit?: number; ids?: string[] } = {}): Promise<Row[]> {
  let expected = await cap.expected('memory_items_current', scope);
  if (opts.ids !== undefined) { const wanted = new Set(opts.ids); expected = expected.filter((e) => wanted.has(String(e['item_id']))); }
  const projected = await rowsOf(() => cap.readMemoryItems(), 'item_id', expected.map((e) => String(e['item_id'])));
  const absent = expected.filter((e) => !projected.has(String(e['item_id'])));
  const canonical = new Map<string, Row>();
  if (absent.length > 0) {
    const objects = (await cap.readCanonicalObjects().selectAll().where('object_id' as never, 'in', absent.map((e) => String(e['item_id'])) as never)
      .where('object_type' as never, '=', 'MEM' as never).execute()) as Row[];
    const named = new Map(absent.map((e) => [String(e['item_id']), Number(e['object_version'])]));
    for (const o of objects) if (Number(o['object_version']) === named.get(String(o['object_id']))) canonical.set(String(o['object_id']), o);
  }
  const out: Row[] = [];
  for (const e of expected) {
    const id = String(e['item_id']); const p = projected.get(id);
    const state = String(e['state']); const version = Number(e['object_version']);
    const fromLog: Row = {
      state, object_version: version, attention_state: e['attention_state'] ?? 'none', superseded_versions: Number(e['superseded_versions'] ?? 0),
      last_superseded_at: e['last_superseded_at'] ?? null, index_state: 'stale',
    };
    if (p === undefined) {
      const o = canonical.get(id);
      if (o === undefined) {
        // The content tier carries no version the log names: the log's metadata alone (the rebuild names such a row unrebuildable).
        out.push({ item_id: id, ...fromLog, recorded_at: e['recorded_at'] ?? null, recorded_by: e['recorded_by'] ?? null, projected: false, from: 'log', content_tier: 'absent' });
        continue;
      }
      const payload = (o['payload'] ?? {}) as Row;
      const source = (payload['source'] ?? {}) as Row; const audience = (payload['audience'] ?? {}) as Row;
      const validity = (payload['validity'] ?? {}) as Row; const retention = (payload['retention'] ?? {}) as Row; const related = (payload['related'] ?? {}) as Row;
      out.push({
        item_id: id, ...fromLog,
        record_class: payload['record_class'] ?? null, title: payload['title'] ?? null,
        source_kind: source['kind'] ?? null, source_ref: source['ref'] ?? null,
        classification: o['classification'] ?? e['classification'] ?? null, audience_roles: arr(audience['roles']), audience_purposes: arr(audience['purposes']),
        valid_from: validity['from'] ?? null, valid_to: validity['to'] ?? null,
        retention_profile: retention['profile'] ?? null, retain_until: retention['retain_until'] ?? null, retention_basis: retention['basis'] ?? null,
        related_decision_id: related['decision_id'] ?? null, related_objective_id: related['objective_id'] ?? null,
        derivation: payload['derivation'] ?? null, owner_principal_id: ownerOf(o['accountable_owner']) ?? e['owner_principal_id'] ?? e['recorded_by'] ?? null,
        recorded_at: e['recorded_at'] ?? o['recorded_at'] ?? null, recorded_by: e['recorded_by'] ?? null,
        projected: false, from: 'log',
      });
      continue;
    }
    const row: Row = { ...p, ...fromLog, projected: true, from: 'projection' };
    const projectedState = `${String(p['state'])}@${String(p['object_version'])}`; const logState = `${state}@${version}`;
    if (projectedState !== logState) row['drift'] = { projected: projectedState, log: logState } satisfies Drift;
    out.push(row);
  }
  const sorted = out.sort(newestFirst('recorded_at'));
  return opts.ids !== undefined ? sorted : sorted.slice(0, Math.max(1, Math.min(opts.limit ?? 200, 1000)));
}

/** One memory item from the log — `null` for an id the log does not know (a poisoned row answers as an absent one). */
export async function memoryItemFromLog(cap: ExpectedReads, scope: Scope, itemId: string): Promise<Row | null> {
  return (await memoryItemsFromLog(cap, scope, { ids: [itemId] }))[0] ?? null;
}

// ───────────────────────── the overview ─────────────────────────

const by = (rows: Row[], k: string, v: string): number => rows.filter((r) => String(r[k]) === v).length;

/**
 * The five overview sections — from the expected rows for the WITHDRAWN partitions (counts on the log's state), from the
 * projection otherwise (the bounds the overview always had); each section says where it came from. From the log, the
 * counts that need a column the log does not carry (an automatic acceptance's `decided_by`, a resolution's `method`) are
 * taken from the joined projection row where one exists — a metadata-only row contributes to the state counts alone.
 */
export async function overviewFromLog(cap: ExpectedReads, scope: Scope, withdrawn: ReadonlySet<ProjectionName>): Promise<Record<string, Row>> {
  const entities = withdrawn.has('entities_current') ? await entitiesFromLog(cap, scope, 5_000)
    : (await cap.readEntities().selectAll().limit(5_000).execute()) as Row[];
  const resolutions = withdrawn.has('resolutions_current') ? await resolutionsFromLog(cap, scope)
    : (await cap.readResolutions().selectAll().limit(20_000).execute()) as Row[];
  const edges = withdrawn.has('edges_current') ? (await edgesFromLog(cap, scope)).edges as unknown as Row[]
    : (await cap.readEdges().selectAll().limit(20_000).execute()) as Row[];
  const strategy = withdrawn.has('strategy_current') ? await strategyFromLog(cap, scope, 5_000)
    : (await cap.readStrategy().selectAll().limit(5_000).execute()) as Row[];
  const invalidations = withdrawn.has('invalidations_current') ? await invalidationsFromLog(cap, scope, 1_000)
    : (await cap.readInvalidations().selectAll().limit(1_000).execute()) as Row[];
  const from = (p: ProjectionName): 'log' | 'projection' => (withdrawn.has(p) ? 'log' : 'projection');
  return {
    entities: {
      total: entities.length,
      active: by(entities, 'lifecycle_state', 'active'),
      split: entities.filter((e) => e['split_from'] !== null && e['split_from'] !== undefined).length,
      from: from('entities_current'),
    },
    resolutions: {
      total: resolutions.length,
      accepted: by(resolutions, 'state', 'accepted'),
      queued: by(resolutions, 'state', 'proposed'),
      rejected: by(resolutions, 'state', 'rejected'),
      superseded: by(resolutions, 'state', 'superseded'),
      automatic: resolutions.filter((r) => r['state'] === 'accepted' && r['decided_by'] === null).length,
      modelAssisted: by(resolutions, 'method', 'model_assisted'),
      from: from('resolutions_current'),
    },
    edges: {
      total: edges.length,
      asserted: by(edges, 'state', 'asserted'),
      retracted: by(edges, 'state', 'retracted'),
      from: from('edges_current'),
    },
    strategy: {
      total: strategy.length,
      objectives: by(strategy, 'object_type', 'OBJ'),
      assumptions: by(strategy, 'object_type', 'ASU'),
      decisions: by(strategy, 'object_type', 'DEC'),
      commitments: by(strategy, 'object_type', 'CMT'),
      outcomes: by(strategy, 'object_type', 'OUT'),
      unverified: strategy.filter((s) => s['object_type'] === 'ASU' && s['verification_state'] === 'unverified').length,
      from: from('strategy_current'),
    },
    invalidations: {
      total: invalidations.length,
      assessed: by(invalidations, 'state', 'assessed'),
      from: from('invalidations_current'),
    },
  };
}
