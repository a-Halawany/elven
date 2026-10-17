/**
 * B80 §TK (0118_b80_x_tk) — THE THEME CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of governance.theme_* that asserts the route's own action, the TENANT scope and the acting principal (and re-checks the
 * human, the role and the separation of duties); each read is a plain select under the caller's RLS (a theme is the tenant's; a PLATFORM
 * context — the Design System Authority's certification queue — reads every tenant's). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class ThemeCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): ThemeCapability { return new ThemeCapability(tx, action); }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  /** One SQL statement under the pipeline's bound action (the signer's capability — the port asserts the action). */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return this.rows<T>(q); }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  // ───────────────────────── reads (the caller's RLS) ─────────────────────────
  async themes(tenant: string | null): Promise<Row[]> {
    return this.rows(sql`select t.theme_id::text, t.version, t.tenant_id::text, t.theme_key, t.title, t.base, t.mapping, governance.theme_resolve(t.mapping) as resolved, t.schema_version, t.state,
        t.digest, t.claim, t.proposed_by::text, governance.dg_principal_name(t.proposed_by) as proposed_by_name, t.proposed_at, t.retired_by::text, t.retired_at, t.retire_reason,
        (select to_jsonb(c) - 'matrix' - 'scope' - 'domain_id' || jsonb_build_object('certifier_name', governance.dg_principal_name(c.certifier))
           from governance.theme_certifications c where c.theme_id = t.theme_id and c.theme_version = t.version) as certification
      from governance.design_themes t where (${tenant}::uuid is null or t.tenant_id = ${tenant}::uuid) order by t.tenant_id, t.theme_key, t.version desc`);
  }
  async theme(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select t.theme_id::text, t.version, t.tenant_id::text, t.theme_key, t.state, t.digest, t.proposed_by::text from governance.design_themes t
      where t.theme_id = ${id}::uuid and t.version = ${version}::int`))[0] ?? null;
  }
  async certification(id: string): Promise<Row | null> {
    const r = (await this.rows<{ r: Row | null }>(sql`select to_jsonb(c) - 'scope' - 'domain_id' || jsonb_build_object('certifier_name', governance.dg_principal_name(c.certifier)) as r
      from governance.theme_certifications c where c.certification_id = ${id}::uuid`))[0]?.r;
    return r ?? null;
  }
  async activations(tenant: string): Promise<Row[]> {
    return this.rows(sql`select a.activation_id::text, a.seq, a.act, a.theme_id::text, a.theme_version, a.theme_digest, a.certification_id::text, a.restores_to::text, a.supersedes::text, a.fell_back,
        a.reason, a.actor::text, governance.dg_principal_name(a.actor) as actor_name, a.activated_at, a.claim,
        (select t.theme_key from governance.design_themes t where t.theme_id = a.theme_id and t.version = a.theme_version) as theme_key
      from governance.theme_activations a where a.tenant_id = ${tenant}::uuid order by a.seq desc`);
  }
  async inForce(tenant: string): Promise<Row> { return this.one(sql`select governance.theme_in_force(${tenant}::uuid) as r`, 'theme_in_force'); }
  async preview(id: string, version: number): Promise<Row | null> {
    const r = (await this.rows<{ r: Row | null }>(sql`select governance.theme_preview(${id}::uuid, ${version}::int) as r`))[0]?.r;
    return r ?? null;
  }
  async coreMatrix(): Promise<Row> { return this.one(sql`select governance.theme_matrix(null) as r`, 'theme_matrix'); }
  async ledger(tenant: string | null, limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.scope, e.tenant_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text,
        governance.dg_principal_name(e.actor_principal_id) as actor_name, e.details, e.occurred_at
      from governance.events e where e.subject_kind = 'design_theme' and (${tenant}::uuid is null or e.tenant_id = ${tenant}::uuid) order by e.occurred_at desc, e.event_id limit ${limit}`);
  }
  async signature(id: string): Promise<Row | null> {
    return (await this.rows(sql`select s.signature_id::text, s.subject_kind, s.subject_id::text, s.subject_version, s.subject_digest, s.signer::text, s.signer_role, s.key_id, s.signature, s.bound_action, s.signed_at
      from governance.signatures s where s.signature_id = ${id}::uuid`))[0] ?? null;
  }

  // ───────────────────────── the ports ─────────────────────────
  propose(a: { themeId: string | null; tenant: string; key: string; expectedVersion: number; title: string; mapping: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.theme_propose(${a.themeId}::uuid, ${a.tenant}::uuid, ${a.key}, ${a.expectedVersion}::int, ${a.title}, ${j(a.mapping)}::jsonb, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'theme_propose');
  }
  certify(a: { themeId: string; version: number; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.theme_certify(${a.themeId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'theme_certify');
  }
  activate(a: { themeId: string; version: number; digest: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.theme_activate(${a.themeId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'theme_activate');
  }
  rollback(a: { tenant: string; expectedActivation: string | null; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.theme_rollback(${a.tenant}::uuid, ${a.expectedActivation}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'theme_rollback');
  }
  retire(a: { themeId: string; version: number; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.theme_retire(${a.themeId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'theme_retire');
  }
}

export const ThemeCap = (tx: Tx, action: string): ThemeCapability => ThemeCapability.of(tx, action);
