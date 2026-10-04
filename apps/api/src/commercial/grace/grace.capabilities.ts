/**
 * CP-6 B91 §GR (0105 §GR) — THE GRACE CAPABILITIES: one implementation, narrow interfaces per port group (the constraint.capabilities.ts
 * idiom); every write is a SECURITY DEFINER port that asserts the caller's own bound action. Reads go through the tables' row security
 * (the tenant's own licence rows; every tenant's for the PLATFORM commercial authority).
 *
 *   commercial.licence.renew       → commercial.renew_licence        (the commercial authority, human-gated)
 *   commercial.licence.suspend     → commercial.suspend_licence      (the same)
 *   commercial.licence.reinstate   → commercial.reinstate_licence    (the same)
 *   commercial.grace.set           → commercial.set_grace_policy     (the same)
 *   commercial.offline_token.issue → commercial.issue_offline_token  (the same)
 *   executive.attention.tick       → commercial.lapse_licences       (the tick step commercial-licence-lapse, in the tick's own write)
 *   commercial.grace.read          → the reads, commercial.grace_rules (guarded) and commercial.cgr_token_basis
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GraceReads {
  readonly action: string;
  readLicences(): any;
  readPolicies(): any;
  readTransitions(): any;
  readTokens(): any;
  readUsage(): any;
  graceRules(tenantId: string): Promise<Record<string, unknown>>;
  tokenBasis(licenceId: string, version: number): Promise<Record<string, unknown> | null>;
  /** The database's instant, in the token's text form (UTC, microseconds, 'Z'). */
  dbInstant(): Promise<string>;
  /** An instant in the token's text form (the database normalises it). */
  instantText(at: string): Promise<string | null>;
  /** Whether a relation exists and this session may read it (the §ME / §LE seams). */
  readable(relation: string): Promise<boolean>;
  /** The tenant's metered usage this calendar month (the database's month), per dimension and unit — §ME's records, read under their row security. */
  usageThisMonth(tenantId: string): Promise<Array<{ dimension: string; unit: string; quantity: string; records: number; first_at: string | null; last_at: string | null }>>;
  /** §EN's availability gate, when it exists in this build (the integrator's seam): commercial.capability_available(tenant, action) as jsonb; null when absent. */
  gate(tenantId: string, action: string): Promise<Record<string, unknown> | null>;
  /** The tenant's rows of a seam relation (fixed identifiers only). */
  seamRows(relation: 'commercial.caps' | 'commercial.budgets', tenantId: string): Promise<Array<Record<string, unknown>>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Act { transitionId: string; licenceId: string; version: number; reason: string; evidence: Record<string, unknown>; actor: string; correlationId: string }
export interface TransitionWrites extends GraceReads {
  renew(a: Act & { renewedUntil: string }): Promise<Record<string, unknown>>;
  suspend(a: Act): Promise<Record<string, unknown>>;
  reinstate(a: Act): Promise<Record<string, unknown>>;
}
export interface PolicyWrites extends GraceReads {
  setPolicy(a: { policyId: string; tenantId: string; expectedVersion: number; graceDays: number; allows: string[]; renewalNoticeDays: number; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}
export interface TokenWrites extends GraceReads {
  issueToken(a: { tokenId: string; licenceId: string; version: number; profile: string; payloadText: string; payloadDigest: string; signature: string; keyRef: string;
                  keyId: string; publicKeyPem: string; expiresAt: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}
export interface LapseWrites {
  lapse(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class GraceCapabilityImpl implements TransitionWrites, PolicyWrites, TokenWrites, LapseWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Record<string, unknown> } | undefined)?.r) ?? {};
  }

  readLicences(): any { return this.from('commercial.licences'); }
  readPolicies(): any { return this.from('commercial.grace_policies'); }
  readTransitions(): any { return this.from('commercial.licence_transitions'); }
  readTokens(): any { return this.from('commercial.offline_tokens'); }
  readUsage(): any { return this.from('commercial.usage_records'); }
  async graceRules(tenantId: string) { return this.one(sql`select commercial.grace_rules(${tenantId}::uuid) as r`); }
  async tokenBasis(licenceId: string, version: number) {
    const r = await sql<{ r: Record<string, unknown> | null }>`select commercial.cgr_token_basis(${licenceId}::uuid, ${version}::int) as r`.execute(this.#tx);
    return r.rows[0]?.r ?? null;
  }
  async dbInstant() { return (await sql<{ t: string }>`select commercial.cgr_instant(clock_timestamp()) as t`.execute(this.#tx)).rows[0]!.t; }
  async instantText(at: string) {
    try { return (await sql<{ t: string | null }>`select commercial.cgr_instant(${at}::timestamptz) as t`.execute(this.#tx)).rows[0]?.t ?? null; }
    catch { return null; }
  }
  async readable(relation: string) {
    const r = await sql<{ ok: boolean }>`select case when to_regclass(${relation}) is null then false else has_table_privilege(to_regclass(${relation}), 'SELECT') end as ok`.execute(this.#tx);
    return r.rows[0]?.ok === true;
  }
  async usageThisMonth(tenantId: string) {
    const r = await sql<{ dimension: string; unit: string; quantity: string; records: number; first_at: string | null; last_at: string | null }>`
      select u.dimension, u.unit, sum(u.quantity)::text as quantity, count(*)::int as records,
             commercial.cgr_instant(min(u.occurred_at)) as first_at, commercial.cgr_instant(max(u.occurred_at)) as last_at
        from commercial.usage_records u
       where u.tenant_id = ${tenantId}::uuid and u.occurred_at >= date_trunc('month', clock_timestamp())
       group by u.dimension, u.unit order by u.dimension, u.unit`.execute(this.#tx);
    return r.rows;
  }
  async gate(tenantId: string, action: string) {
    const exists = await sql<{ ok: boolean }>`select to_regprocedure('commercial.capability_available(uuid,text)') is not null as ok`.execute(this.#tx);
    if (exists.rows[0]?.ok !== true) return null;
    const r = await sql<{ r: Record<string, unknown> | null }>`select to_jsonb(commercial.capability_available(${tenantId}::uuid, ${action})) as r`.execute(this.#tx);
    return r.rows[0]?.r ?? null;
  }
  async seamRows(relation: 'commercial.caps' | 'commercial.budgets', tenantId: string) {
    return (await this.from(relation).selectAll().where('tenant_id' as never, '=', tenantId as never).limit(200).execute()) as Array<Record<string, unknown>>;
  }

  async renew(a: Act & { renewedUntil: string }) {
    return this.one(sql`select commercial.renew_licence(${a.transitionId}::uuid, ${a.licenceId}::uuid, ${a.version}::int, ${a.renewedUntil}::timestamptz, ${a.reason},
      ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async suspend(a: Act) {
    return this.one(sql`select commercial.suspend_licence(${a.transitionId}::uuid, ${a.licenceId}::uuid, ${a.version}::int, ${a.reason}, ${JSON.stringify(a.evidence)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async reinstate(a: Act) {
    return this.one(sql`select commercial.reinstate_licence(${a.transitionId}::uuid, ${a.licenceId}::uuid, ${a.version}::int, ${a.reason}, ${JSON.stringify(a.evidence)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async setPolicy(a: Parameters<PolicyWrites['setPolicy']>[0]) {
    return this.one(sql`select commercial.set_grace_policy(${a.policyId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.graceDays}::int, ${a.allows}::text[],
      ${a.renewalNoticeDays}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async issueToken(a: Parameters<TokenWrites['issueToken']>[0]) {
    return this.one(sql`select commercial.issue_offline_token(${a.tokenId}::uuid, ${a.licenceId}::uuid, ${a.version}::int, ${a.profile}, ${a.payloadText}, ${a.payloadDigest},
      ${a.signature}, ${a.keyRef}, ${a.keyId}, ${a.publicKeyPem}, ${a.expiresAt}::timestamptz, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async lapse(a: { tenantId: string; domainId: string; actor: string; correlationId: string }) {
    return this.one(sql`select commercial.lapse_licences(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const GraceCapability = {
  read(tx: Tx, action: string): GraceReads { return new GraceCapabilityImpl(tx, action); },
  transition(tx: Tx, action: string): TransitionWrites { return new GraceCapabilityImpl(tx, action); },
  policy(tx: Tx, action: string): PolicyWrites { return new GraceCapabilityImpl(tx, action); },
  token(tx: Tx, action: string): TokenWrites { return new GraceCapabilityImpl(tx, action); },
  /** The tick step's: the tick's own transaction, bound to executive.attention.tick. */
  tick(tx: Tx, action: string): LapseWrites { return new GraceCapabilityImpl(tx, action); },
};
