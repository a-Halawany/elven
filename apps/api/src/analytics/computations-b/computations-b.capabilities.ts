/**
 * B92 §MCB (0113_b92_x_mcb.sql §MCB.1–§MCB.2) — thin bindings to the two definer ports this part owns (the temporal requirement a named
 * product analytics owner declares — MET-009's input; the search review a named analyst or owner records — MET-014's input) and their
 * INVOKER reads. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface McbReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  temporalRequirements(): Promise<Row>;
  searchReviews(limit: number): Promise<Row>;
}
export interface McbWrites extends McbReads {
  declareTemporal(a: { requirementId: string; tenantId: string; domainId: string; objectType: string; required: string[]; retire: boolean; reason: string; expectedVersion: number; actor: string; correlationId: string }): Promise<Row>;
  reviewSearch(a: { reviewId: string; tenantId: string; domainId: string; searchId: string; verdict: string; queryClass: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

class McbCapabilityImpl implements McbWrites {
  constructor(readonly tx: Tx, readonly action: string) {}
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }
  async temporalRequirements(): Promise<Row> { return this.one(sql`select analytics.temporal_requirements_read() as r`, 'temporal_requirements_read'); }
  async searchReviews(limit: number): Promise<Row> { return this.one(sql`select analytics.search_reviews_read(${limit}::int) as r`, 'search_reviews_read'); }
  async declareTemporal(a: Parameters<McbWrites['declareTemporal']>[0]): Promise<Row> {
    return this.one(sql`select analytics.declare_temporal_requirement(${a.requirementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectType}, ${a.required}::text[], ${a.retire},
      ${a.reason}, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_temporal_requirement');
  }
  async reviewSearch(a: Parameters<McbWrites['reviewSearch']>[0]): Promise<Row> {
    return this.one(sql`select analytics.review_search(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.searchId}::uuid, ${a.verdict}, ${a.queryClass}, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'review_search');
  }
}

export const McbCapability = {
  read(tx: Tx, action: string): McbReads { return new McbCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): McbWrites { return new McbCapabilityImpl(tx, action); },
};
