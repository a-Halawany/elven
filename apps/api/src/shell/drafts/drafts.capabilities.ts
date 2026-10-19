/**
 * B80 §CL-F (0118_b80_x_clf; PAT-03, UX-21-002/-003) — THE FORM DRAFT CAPABILITY: one class over the pipeline's transaction. Each write is a
 * thin binding to a SECURITY DEFINER port of shell.* that asserts the route's own action, the scope of the established context and the acting
 * principal (a named human, re-checked in the port); the read is the guarded definer read; the LIST is a plain select under the caller's RLS
 * (a principal sees its own drafts only — the policy, not this code, decides that). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface DraftSave {
  tenantId: string; domainId: string; formKey: string; subjectKey: string; schemaVersion: string | null; payload: Row;
  summary: string | null; step: number | null; expectedVersion: number | null; ttlSeconds: number | null; correlationId: string;
}
export interface DraftDiscard { tenantId: string; domainId: string; draftId: string; expectedVersion: number | null; reason: string | null; correlationId: string }
export interface DraftReads {
  read(a: { tenantId: string; domainId: string; formKey: string | null; subjectKey: string | null; draftId: string | null }): Promise<Row>;
  list(a: { formKey: string | null }): Promise<Row[]>;
}
export interface DraftWrites { save(a: DraftSave): Promise<Row>; discard(a: DraftDiscard): Promise<Row> }

class DraftCapabilityImpl implements DraftReads, DraftWrites {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }

  async read(a: { tenantId: string; domainId: string; formKey: string | null; subjectKey: string | null; draftId: string | null }): Promise<Row> {
    return this.one(sql`select shell.draft_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.formKey}, ${a.subjectKey}, ${a.draftId}::uuid) as r`, 'draft_read');
  }
  /** The caller's drafts in the bound tenant/domain — the LATEST row of each draft, discarded ones left out — under RLS; no payload. */
  async list(a: { formKey: string | null }): Promise<Row[]> {
    const r = await sql<Row>`select x.draft_id::text, x.version, x.form_key, x.subject_key, x.schema_version, x.summary, x.step, x.payload_digest, x.saved_at, x.expires_at,
        case when x.expires_at <= clock_timestamp() then 'expired' else 'live' end as state
      from (select distinct on (d.draft_id) d.* from shell.drafts d where (${a.formKey}::text is null or d.form_key = ${a.formKey}) order by d.draft_id, d.version desc) x
      where x.kind = 'saved' order by x.saved_at desc limit 200`.execute(this.#tx);
    return r.rows;
  }
  async save(a: DraftSave): Promise<Row> {
    return this.one(sql`select shell.draft_save(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.formKey}, ${a.subjectKey}, ${a.schemaVersion}, ${JSON.stringify(a.payload)}::jsonb,
      ${a.summary}, ${a.step}::int, ${a.expectedVersion}::int, ${a.ttlSeconds}::int, ${a.correlationId}::uuid) as r`, 'draft_save');
  }
  async discard(a: DraftDiscard): Promise<Row> {
    return this.one(sql`select shell.draft_discard(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.draftId}::uuid, ${a.expectedVersion}::int, ${a.reason}, ${a.correlationId}::uuid) as r`, 'draft_discard');
  }
}

export const DraftCapability = {
  read(tx: Tx, action: string): DraftReads { return new DraftCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): DraftWrites { return new DraftCapabilityImpl(tx, action); },
};
