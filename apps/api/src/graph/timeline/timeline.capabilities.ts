/**
 * CP-6 B50 §TL (0120_b50_x_tl) — THE TIMELINE CAPABILITIES: one per action class (the Phase 1 discipline: the relation is never a parameter,
 * the transaction unreachable, a handler receives a narrow interface). The reads (graph.timeline.read) get the timeline, the trace and the
 * scope list; the reconciliation (graph.timeline.reconcile) gets the one port that routes it. graph.timeline and graph.trace are SECURITY
 * INVOKER — they read under the caller's own RLS; the port re-checks the bound action, the scope, the acting principal and the role.
 * CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface TimelineAsk {
  tenantId: string; domainId: string;
  subjectType: string | null; subjectId: string | null; scopeKey: string | null;
  from: string; to: string; axis: string; asOf: string | null; clearance: string; limit: number;
}
export interface TraceAsk { tenantId: string; domainId: string; type: string; id: string; version: number; clearance: string }

/** The reads (graph.timeline.read): the timeline, the trace, the approved governed scopes a timeline may be drawn over. */
export interface TimelineReads {
  timeline(a: TimelineAsk): Promise<Row>;
  trace(a: TraceAsk): Promise<Row>;
  scopes(a: { tenantId: string; domainId: string }): Promise<Row[]>;
}
/** The reconciliation (graph.timeline.reconcile): an incomplete trace routed to its owner. */
export interface TraceReconcileWrites extends TimelineReads {
  reconcile(a: { itemId: string; tenantId: string; domainId: string; type: string; id: string; version: number; note: string; actor: string; correlationId: string }): Promise<Row>;
}

class TimelineCapabilityImpl implements TraceReconcileWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(fragment: { execute: (tx: Tx) => Promise<{ rows: Array<{ r: Row }> }> }): Promise<Row> {
    return ((await fragment.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  timeline(a: TimelineAsk): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.timeline(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subjectType}::text, ${a.subjectId}::uuid, ${a.scopeKey}::text,
      ${a.from}::timestamptz, ${a.to}::timestamptz, ${a.axis}, ${a.asOf}::timestamptz, ${a.clearance}, ${a.limit}::int) as r`);
  }
  trace(a: TraceAsk): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.trace(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int, ${a.clearance}) as r`);
  }
  async scopes(a: { tenantId: string; domainId: string }): Promise<Row[]> {
    const rows = await sql<Row>`select s.scope_key, s.version, s.title, s.description, cardinality(s.entity_ids) as entities, cardinality(s.objective_ids) as objectives,
        s.series_keys, s.geographies, s.digest, s.decided_at
      from analytics.scopes s where s.tenant_id = ${a.tenantId}::uuid and s.domain_id = ${a.domainId}::uuid and s.state = 'approved' order by s.scope_key`.execute(this.#tx);
    return rows.rows;
  }
  reconcile(a: { itemId: string; tenantId: string; domainId: string; type: string; id: string; version: number; note: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select graph.route_trace_reconciliation(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.type}, ${a.id}::uuid, ${a.version}::int,
      ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const TimelineCapability = {
  read(tx: Tx, action: string): TimelineReads { return new TimelineCapabilityImpl(tx, action); },
  reconcile(tx: Tx, action: string): TraceReconcileWrites { return new TimelineCapabilityImpl(tx, action); },
};
