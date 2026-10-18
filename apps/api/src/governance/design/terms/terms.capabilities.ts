/**
 * B81 §CT (0119_b81_x_ct) — THE TERM CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of governance.term_* that asserts the route's own action, the PLATFORM scope and the acting principal (and re-checks the
 * human, the role and the separation of duties); each read is a plain select under the caller's RLS (the PUBLISHED language is every
 * context's; drafts and reviews are the vendor's — a PLATFORM context). B90's domain glossary is READ beside a term (products.glossary_terms
 * under the caller's own RLS — a domain sees its own glossary), never merged into it. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class TermCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): TermCapability { return new TermCapability(tx, action); }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  // ───────────────────────── reads (the caller's RLS) ─────────────────────────
  async terms(key: string | null): Promise<Row[]> {
    return this.rows(sql`select t.term_id::text, t.version, t.term_key, t.locale, t.category, t.label, t.definition, t.explanations, t.protected_words, t.synonyms, t.example,
        t.conditions, t.cites, t.glossary_keys, t.reading_levels, t.translated_from::text, t.translated_from_version, t.translation_method, t.corrects_version, t.correction,
        t.state, t.rules_version, t.digest, t.claim, t.proposed_by::text, governance.dg_principal_name(t.proposed_by) as proposed_by_name, t.proposed_at,
        t.approved_by::text, governance.dg_principal_name(t.approved_by) as approved_by_name, t.approved_at, t.published_by::text, governance.dg_principal_name(t.published_by) as published_by_name,
        t.published_at, t.superseded_at, t.retired_by::text, t.retired_at, t.retire_reason,
        (select to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' || jsonb_build_object('reviewer_name', governance.dg_principal_name(r.reviewer))
           from governance.term_reviews r where r.term_id = t.term_id and r.term_version = t.version) as review
      from governance.terms t where (${key}::text is null or t.term_key = ${key}::text) order by t.term_key, t.locale, t.version desc`);
  }
  async term(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select t.term_id::text, t.version, t.term_key, t.locale, t.state, t.digest, t.proposed_by::text, t.translated_from::text,
        exists (select 1 from governance.terms p where p.term_id = t.term_id and p.state = 'published') as has_published,
        governance.term_checks(t) as checks, t.reading_levels, t.correction, t.corrects_version
      from governance.terms t where t.term_id = ${id}::uuid and t.version = ${version}::int`))[0] ?? null;
  }
  async catalogue(locale: string): Promise<Row> { return this.one(sql`select governance.term_catalogue(${locale}) as r`, 'term_catalogue'); }
  /** B90's domain glossary entries whose key a published term links (the caller's own RLS: a DOMAIN context reads its domain's glossary). */
  async glossary(keys: string[]): Promise<Row[]> {
    if (keys.length === 0) return [];
    return this.rows(sql`select g.term_id::text, g.term, g.term_key, g.definition, g.version, g.owner_principal_id::text, g.updated_at
      from products.glossary_terms g where g.term_key = any(${keys}::text[]) order by g.term_key`);
  }
  async ledger(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, governance.dg_principal_name(e.actor_principal_id) as actor_name,
        e.details, e.occurred_at from governance.events e where e.subject_kind = 'design_term' order by e.occurred_at desc, e.event_id limit ${limit}`);
  }
  async artifact(id: string): Promise<Row | null> {
    return (await this.rows(sql`select a.artifact_id::text, a.version, a.kind, a.external_key, a.lifecycle, a.attributes from governance.artifacts a
      where a.artifact_id = ${id}::uuid and a.superseded_at is null`))[0] ?? null;
  }

  // ───────────────────────── the ports ─────────────────────────
  propose(a: { termId: string | null; key: string; locale: string; expectedVersion: number; entry: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.term_propose(${a.termId}::uuid, ${a.key}, ${a.locale}, ${a.expectedVersion}::int, ${j(a.entry)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'term_propose');
  }
  correct(a: { termId: string; expectedVersion: number; entry: Row; impact: string; action: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.term_correct(${a.termId}::uuid, ${a.expectedVersion}::int, ${j(a.entry)}::jsonb, ${a.impact}, ${a.action}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'term_correct');
  }
  review(a: { termId: string; version: number; digest: string; outcome: string; notes: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.term_review(${a.termId}::uuid, ${a.version}::int, ${a.digest}, ${a.outcome}, ${a.notes}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'term_review');
  }
  approve(a: { termId: string; version: number; digest: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.term_approve(${a.termId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'term_approve');
  }
  publish(a: { termId: string; version: number; digest: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.term_publish(${a.termId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'term_publish');
  }
  retire(a: { termId: string; version: number; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.term_retire(${a.termId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'term_retire');
  }
}

export const TermCap = (tx: Tx, action: string): TermCapability => TermCapability.of(tx, action);
