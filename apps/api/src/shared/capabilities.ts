/**
 * Bounded transactional capabilities (Gate-2.1 C2).
 *
 * A business handler never receives a Kysely transaction. It receives a
 * capability object whose surface is exactly the ports its route declared, so it
 * cannot reach an unrelated port, cannot issue raw SQL, and cannot reuse the
 * transaction for a second operation. The transaction is held in a private field
 * and is never exposed.
 *
 * This is defence in depth ON TOP of the database boundary: migrations 0011/0012
 * already bind every port to the context's action, so a smuggled call fails in
 * the database too. Both layers must agree before anything is written.
 */
import { sql } from 'kysely';
import type { Tx } from './db.js';

/** Read surface: RLS-governed SELECTs on an allowlisted set of relations. */
const READABLE = [
  'tenancy.tenants', 'tenancy.domains', 'tenancy.lifecycle_events',
  'identity.principals', 'identity.role_bindings', 'identity.roles',
  'policy.policy_decisions', 'audit.audit_events',
  'objects.canonical_objects', 'objects.object_outbox', 'objects.schema_registry',
] as const;
export type ReadableRelation = (typeof READABLE)[number];

export class BoundedCapability {
  /** The transaction is PRIVATE and never handed out. */
  readonly #tx: Tx;
  readonly #action: string;

  constructor(tx: Tx, action: string) {
    this.#tx = tx;
    this.#action = action;
  }

  get action(): string {
    return this.#action;
  }

  /**
   * RLS-governed read of an ALLOWLISTED relation. The returned builder is
   * intentionally loosely typed: the security boundary here is the relation
   * allowlist plus the total absence of a transaction or raw-SQL surface, not
   * Kysely's column typing. Anything outside READABLE throws immediately.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  read(relation: ReadableRelation): any {
    if (!READABLE.includes(relation)) {
      throw new Error(`capability: relation ${relation} is not readable through this capability`);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }

  // ===== governed ports (each is bound to the route's action in the database) =====

  /**
   * Gate-2.2 C6: no actor parameter exists. The lifecycle actor is DERIVED from
   * the bound principal inside the port (ctx.bound_actor()), so a caller cannot
   * express a false actor. The id must be the capability's bound target.
   */
  async createTenant(id: string, name: string, residency: string): Promise<void> {
    await sql`select tenancy.create_tenant(${id}::uuid, ${name}, ${residency})`.execute(this.#tx);
  }

  async createDomain(id: string, tenantId: string, name: string): Promise<void> {
    await sql`select tenancy.create_domain(${id}::uuid, ${tenantId}::uuid, ${name})`.execute(this.#tx);
  }

  async myTenant(): Promise<{ id: string; name: string; status: string } | undefined> {
    return (
      await sql<{ id: string; name: string; status: string }>`select * from tenancy.my_tenant()`.execute(this.#tx)
    ).rows[0];
  }

  async createPrincipal(p: {
    id: string; kind: string; scope: string; tenantId: string | null; domainId: string | null;
    displayName: string; loginName: string | null; secretHash: string | null; roleCode: string | null;
  }): Promise<void> {
    await sql`select identity.create_principal(
      ${p.id}::uuid, ${p.kind}, ${p.scope}, ${p.tenantId}::uuid, ${p.domainId}::uuid,
      ${p.displayName}, ${p.loginName}, ${p.secretHash}, ${p.roleCode}
    )`.execute(this.#tx);
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const r = (
      await sql<{ content_digest: string }>`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(this.#tx)
    ).rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async enqueueOutbox(id: string, eventType: string, payload: unknown, correlationId: string, causationId: string): Promise<void> {
    await sql`select objects.enqueue_event(
      ${id}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb,
      ${correlationId}::uuid, ${causationId}::uuid)`.execute(this.#tx);
  }

  /**
   * Escape hatch used ONLY by the pipeline itself (evidence ports), never handed
   * to a business handler: handlers receive the capability, the pipeline keeps
   * its own reference to the transaction.
   */
  static forPipeline(tx: Tx, action: string): BoundedCapability {
    return new BoundedCapability(tx, action);
  }
}
