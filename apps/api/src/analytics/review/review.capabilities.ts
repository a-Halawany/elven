/**
 * B92 §OR (0113_b92_x_or) — THE OPERATING REVIEW CAPABILITIES: thin bindings to the definer ports (open, assemble, hold, note, decide, close)
 * and the INVOKER reads (the review list, the review read, the series) under the caller's RLS. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface ReviewReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  list(q: { period: string | null; state: string | null; limit: number }): Promise<Row[]>;
  review(reviewId: string): Promise<Row | null>;
  series(a: { tenantId: string; domainId: string; metricKey: string; scopeKey: string | null; through: string | null; count: number }): Promise<Row>;
}
export interface ReviewWrites extends ReviewReads {
  open(a: { reviewId: string; tenantId: string; domainId: string; title: string; period: string; scopeKey: string | null; metricKeys: string[]; chair: string; participantRoles: string[]; actor: string; correlationId: string }): Promise<Row>;
  assemble(a: { reviewId: string; tenantId: string; domainId: string; pins: Record<string, string>; actor: string; correlationId: string }): Promise<Row>;
  hold(a: { reviewId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  note(a: { noteId: string; reviewId: string; tenantId: string; domainId: string; metricKey: string | null; body: string; actor: string; correlationId: string }): Promise<Row>;
  decide(a: { followupId: string; reviewId: string; tenantId: string; domainId: string; metricKey: string | null; kind: string; action: string | null; owner: string | null; dueOn: string | null; reason: string; actor: string; correlationId: string }): Promise<Row>;
  close(a: { reviewId: string; tenantId: string; domainId: string; digest: string; statement: string; actor: string; correlationId: string }): Promise<Row>;
}

const j = (v: unknown) => JSON.stringify(v ?? null);

class ReviewCapabilityImpl implements ReviewWrites {
  constructor(readonly tx: Tx, readonly action: string) {}
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }
  async list(q: { period: string | null; state: string | null; limit: number }): Promise<Row[]> {
    return this.rows(sql`select r.review_id::text, r.title, r.period_key, r.period_kind, r.window_from, r.window_to, r.scope_key, r.scope_version, r.metric_keys, r.chair_principal_id::text,
        (select p.display_name from identity.principals p where p.id = r.chair_principal_id) as chair_name, r.participant_roles, r.state, r.assembly, r.assembled_at, r.held_at,
        r.closed_at, r.close_digest, r.created_at,
        (select count(*)::int from analytics.review_citations c where c.review_id = r.review_id and c.assembly = r.assembly and c.status = 'not_computed') as not_computed,
        (select count(*)::int from analytics.review_followups f where f.review_id = r.review_id) as followthrough
      from analytics.operating_reviews r
      where (${q.period}::text is null or r.period_key = ${q.period}) and (${q.state}::text is null or r.state = ${q.state})
      order by r.created_at desc limit ${Math.min(Math.max(q.limit, 1), 200)}`);
  }
  async review(reviewId: string): Promise<Row | null> {
    return (await this.rows<{ r: Row | null }>(sql`select analytics.operating_review_read(${reviewId}::uuid) as r`))[0]?.r ?? null;
  }
  async series(a: Parameters<ReviewReads['series']>[0]): Promise<Row> {
    return this.one(sql`select analytics.review_series(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.metricKey}, ${a.scopeKey}, ${a.through}, ${a.count}::int) as r`, 'review_series');
  }
  async open(a: Parameters<ReviewWrites['open']>[0]): Promise<Row> {
    return this.one(sql`select analytics.open_operating_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.period}, ${a.scopeKey}, ${a.metricKeys}::text[],
      ${a.chair}::uuid, ${a.participantRoles}::text[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_operating_review');
  }
  async assemble(a: Parameters<ReviewWrites['assemble']>[0]): Promise<Row> {
    return this.one(sql`select analytics.assemble_operating_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${j(a.pins)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assemble_operating_review');
  }
  async hold(a: Parameters<ReviewWrites['hold']>[0]): Promise<Row> {
    return this.one(sql`select analytics.hold_operating_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'hold_operating_review');
  }
  async note(a: Parameters<ReviewWrites['note']>[0]): Promise<Row> {
    return this.one(sql`select analytics.note_operating_review(${a.noteId}::uuid, ${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.metricKey}, ${a.body}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'note_operating_review');
  }
  async decide(a: Parameters<ReviewWrites['decide']>[0]): Promise<Row> {
    return this.one(sql`select analytics.decide_operating_review(${a.followupId}::uuid, ${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.metricKey}, ${a.kind}, ${a.action},
      ${a.owner}::uuid, ${a.dueOn}::date, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_operating_review');
  }
  async close(a: Parameters<ReviewWrites['close']>[0]): Promise<Row> {
    return this.one(sql`select analytics.close_operating_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.digest}, ${a.statement}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'close_operating_review');
  }
}

export const ReviewCapability = {
  read(tx: Tx, action: string): ReviewReads { return new ReviewCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ReviewWrites { return new ReviewCapabilityImpl(tx, action); },
};
