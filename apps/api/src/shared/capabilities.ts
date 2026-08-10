/**
 * ACTION-SPECIFIC CAPABILITIES (Gate-2.2 C8).
 *
 * The Gate-2.1 `BoundedCapability` was an OMNIBUS object: it exposed
 * `read(relation)` over eleven relations spanning tenancy, identity, policy,
 * audit and objects, **plus** `enqueueOutbox`, to every handler regardless of
 * what that route was authorized to do. A read route could enqueue a domain
 * event; an objects route could read the audit ledger and identity tables. The
 * capability was bounded only in the sense that it was not a raw transaction.
 *
 * This replaces it with one capability per ACTION CLASS. Two properties make the
 * restriction real rather than advisory:
 *
 *  1. THE RELATION IS NO LONGER A PARAMETER. There is no `read(relation)` method
 *     anywhere. Each capability exposes only named, fixed readers for its own
 *     module's relations (`readCanonicalObjects()`, `readAuditEvents()`, …), so
 *     `objects.read` cannot *express* a query against audit, identity, policy or
 *     outbox tables — it is a compile-time type error, not a runtime check.
 *  2. THE TRANSACTION IS UNREACHABLE. It lives in a `#tx` private field on the
 *     core class. Subclasses reach it only through the core's own protected
 *     helpers, and handlers receive a narrow INTERFACE, so there is no Kysely or
 *     raw-SQL escape hatch to widen.
 *
 * Outbox creation is PIPELINE-PRIVATE (`OutboxCapability`): a handler returns a
 * described event as part of its effect and the pipeline enqueues it under the
 * same operation. No business handler can reach the outbox at all.
 *
 * This is defence in depth on top of the database boundary: migrations 0013–0019
 * bind every port to the context's mode, action, target and correlation, and
 * enforce POL/AUD/effect closure at commit. Both layers must agree.
 */
import { sql, type RawBuilder } from 'kysely';
import type { Tx } from './db.js';

/**
 * Holds the transaction PRIVATELY and exposes it to subclasses only through
 * narrow protected helpers. Nothing here is public.
 */
abstract class CapabilityCore {
  readonly #tx: Tx;
  readonly #action: string;

  protected constructor(tx: Tx, action: string) {
    this.#tx = tx;
    this.#action = action;
  }

  /** The action this capability was minted for (diagnostics only). */
  get action(): string {
    return this.#action;
  }

  /**
   * RLS-governed read of ONE fixed relation named by the calling subclass — never
   * by a caller. The builder is loosely typed on purpose: the security boundary is
   * that the relation is hard-coded at the call site, not Kysely's column typing.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }

  /** Execute a governed port. Subclasses build the fragment; only the core runs it. */
  protected async call<T>(fragment: RawBuilder<T>): Promise<T[]> {
    return (await fragment.execute(this.#tx)).rows;
  }
}

// ───────────────────────── tenancy ─────────────────────────

/** What a tenancy READ route may do. */
export interface TenancyReads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readTenants(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readDomains(): any;
  myTenant(): Promise<{ id: string; name: string; status: string } | undefined>;
}

/** What a tenancy WRITE route may do — reads PLUS the two creation ports. */
export interface TenancyWrites extends TenancyReads {
  createTenant(id: string, name: string, residency: string): Promise<void>;
  createDomain(id: string, tenantId: string, name: string): Promise<void>;
}

export class TenancyCapability extends CapabilityCore implements TenancyWrites {
  static read(tx: Tx, action: string): TenancyReads {
    return new TenancyCapability(tx, action);
  }
  static write(tx: Tx, action: string): TenancyWrites {
    return new TenancyCapability(tx, action);
  }
  private constructor(tx: Tx, action: string) {
    super(tx, action);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readTenants(): any {
    return this.from('tenancy.tenants');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readDomains(): any {
    return this.from('tenancy.domains');
  }
  async myTenant(): Promise<{ id: string; name: string; status: string } | undefined> {
    const rows = await this.call<{ id: string; name: string; status: string }>(
      sql`select * from tenancy.my_tenant()`,
    );
    return rows[0];
  }
  async createTenant(id: string, name: string, residency: string): Promise<void> {
    await this.call(sql`select tenancy.create_tenant(${id}::uuid, ${name}, ${residency})`);
  }
  async createDomain(id: string, tenantId: string, name: string): Promise<void> {
    await this.call(sql`select tenancy.create_domain(${id}::uuid, ${tenantId}::uuid, ${name})`);
  }
}

// ───────────────────────── objects ─────────────────────────

/** What an objects READ route may do. It cannot name any other module's tables. */
export interface ObjectReads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSchemaRegistry(): any;
}

/** What an objects WRITE route may do — reads PLUS admission. No outbox. */
export interface ObjectWrites extends ObjectReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
}

export class ObjectsCapability extends CapabilityCore implements ObjectWrites {
  static read(tx: Tx, action: string): ObjectReads {
    return new ObjectsCapability(tx, action);
  }
  static write(tx: Tx, action: string): ObjectWrites {
    return new ObjectsCapability(tx, action);
  }
  private constructor(tx: Tx, action: string) {
    super(tx, action);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any {
    return this.from('objects.canonical_objects');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSchemaRegistry(): any {
    return this.from('objects.schema_registry');
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(
      sql`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`,
    );
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }
}

// ───────────────────────── identity (principals) ─────────────────────────

export interface PrincipalReads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readPrincipals(): any;
}

export interface PrincipalWrites extends PrincipalReads {
  createPrincipal(p: {
    id: string; kind: string; scope: string; tenantId: string | null; domainId: string | null;
    displayName: string; loginName: string | null; secretHash: string | null; roleCode: string | null;
  }): Promise<void>;
}

export class PrincipalsCapability extends CapabilityCore implements PrincipalWrites {
  static read(tx: Tx, action: string): PrincipalReads {
    return new PrincipalsCapability(tx, action);
  }
  static write(tx: Tx, action: string): PrincipalWrites {
    return new PrincipalsCapability(tx, action);
  }
  private constructor(tx: Tx, action: string) {
    super(tx, action);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readPrincipals(): any {
    return this.from('identity.principals');
  }
  async createPrincipal(p: {
    id: string; kind: string; scope: string; tenantId: string | null; domainId: string | null;
    displayName: string; loginName: string | null; secretHash: string | null; roleCode: string | null;
  }): Promise<void> {
    await this.call(sql`select identity.create_principal(
      ${p.id}::uuid, ${p.kind}, ${p.scope}, ${p.tenantId}::uuid, ${p.domainId}::uuid,
      ${p.displayName}, ${p.loginName}, ${p.secretHash}, ${p.roleCode}
    )`);
  }
}

// ───────────────────────── audit (read only) ─────────────────────────

/**
 * Audit reads are read-only BY CONSTRUCTION: this capability exposes no mutator
 * at all, so no route holding it can append, seal or freeze anything. Masking and
 * purpose obligations are executed by the audit service on the rows this returns.
 */
export interface AuditReads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAuditEvents(): any;
}

export class AuditCapability extends CapabilityCore implements AuditReads {
  static read(tx: Tx, action: string): AuditReads {
    return new AuditCapability(tx, action);
  }
  private constructor(tx: Tx, action: string) {
    super(tx, action);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAuditEvents(): any {
    return this.from('audit.audit_events');
  }
}

// ───────────────────────── outbox (PIPELINE-PRIVATE) ─────────────────────────

/**
 * Outbox creation is reachable ONLY from the pipeline. A handler describes the
 * event it wants as part of its returned effect; the pipeline enqueues it under
 * the same governed operation. No business capability exposes this, so a read
 * route cannot enqueue an event even by mistake.
 */
export class OutboxCapability extends CapabilityCore {
  static forPipeline(tx: Tx, action: string): OutboxCapability {
    return new OutboxCapability(tx, action);
  }
  private constructor(tx: Tx, action: string) {
    super(tx, action);
  }

  async enqueue(
    id: string, eventType: string, payload: unknown, correlationId: string, causationId: string,
  ): Promise<void> {
    await this.call(sql`select objects.enqueue_event(
      ${id}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb,
      ${correlationId}::uuid, ${causationId}::uuid)`);
  }
}

/** Factory shape the pipeline uses to hand each route exactly its capability. */
export type CapabilityFactory<C> = (tx: Tx, action: string) => C;
