/**
 * B50 §LC (0120_b50_x_lc) — THE WORK-OBJECT LIFECYCLE CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a
 * SECURITY DEFINER port of objects.* that asserts the route's own action, the scope of the established context and the acting principal (a
 * named human, re-checked in the port with the owner / reviewer / approver rule and the separation of duties); the reads are the guarded
 * definer reads. Nothing here decides a rule a port decides: a transition's acceptance, rejection or compensation is the PORT's answer.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface AuthorIntake {
  tenantId: string; domainId: string; objectType: string; objectId: string; title: string; statement: string; body: Row; evidenceRefs: string[];
  classification: string; purposeScope: string; synthetic: boolean; idempotencyKey: string; actor: string; correlationId: string;
}
export interface TransitionIntake {
  tenantId: string; domainId: string; objectType: string; objectId: string; expectedVersion: number; action: string; to: string | null; reason: string | null;
  idempotencyKey: string; causationId: string | null; correlationRef: string | null; reentryReason: string | null; changes: Row; actor: string; correlationId: string;
}
export interface ProposeIntake {
  requestId: string; tenantId: string; domainId: string; objectType: string; objectId: string; baseVersion: number; action: string; reason: string;
  via: string; reentryReason: string | null; causationId: string | null; actor: string; correlationId: string;
}
export interface DecideIntake {
  requestId: string; tenantId: string; domainId: string; objectId: string; proposalId: string; decision: string; reason: string; expectedVersion: number | null;
  idempotencyKey: string | null; actor: string; correlationId: string;
}
export interface LifecycleReads {
  profiles(): Promise<Row[]>;
  objects(a: { tenantId: string; domainId: string; objectType: string; limit: number }): Promise<Row[]>;
  history(a: { tenantId: string; domainId: string; objectId: string }): Promise<Row>;
  replay(a: { tenantId: string; domainId: string; objectId: string; asOf: string }): Promise<Row>;
  reconcile(a: { tenantId: string; domainId: string }): Promise<Row>;
  exportDoc(a: { tenantId: string; domainId: string; objectId: string }): Promise<Row>;
  verifyExport(doc: Row): Promise<Row>;
}
export interface LifecycleWrites {
  author(a: AuthorIntake): Promise<Row>;
  transition(a: TransitionIntake): Promise<Row>;
  propose(a: ProposeIntake): Promise<Row>;
  decide(a: DecideIntake): Promise<Row>;
}

class LifecycleCapabilityImpl implements LifecycleReads, LifecycleWrites {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  private async list(q: ReturnType<typeof sql>, what: string): Promise<Row[]> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row[] | null }>)[0]?.r;
    if (r === undefined) throw new Error(`${what} returned no row`);
    return r ?? [];
  }

  profiles(): Promise<Row[]> { return this.list(sql`select objects.lifecycle_profiles_read() as r`, 'lifecycle_profiles_read'); }
  objects(a: { tenantId: string; domainId: string; objectType: string; limit: number }): Promise<Row[]> {
    return this.list(sql`select objects.lifecycle_objects(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectType}, ${a.limit}::int) as r`, 'lifecycle_objects');
  }
  history(a: { tenantId: string; domainId: string; objectId: string }): Promise<Row> {
    return this.one(sql`select objects.lifecycle_history(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectId}::uuid) as r`, 'lifecycle_history');
  }
  replay(a: { tenantId: string; domainId: string; objectId: string; asOf: string }): Promise<Row> {
    return this.one(sql`select objects.lifecycle_replay(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectId}::uuid, ${a.asOf}::timestamptz) as r`, 'lifecycle_replay');
  }
  reconcile(a: { tenantId: string; domainId: string }): Promise<Row> {
    return this.one(sql`select objects.lifecycle_reconcile(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`, 'lifecycle_reconcile');
  }
  exportDoc(a: { tenantId: string; domainId: string; objectId: string }): Promise<Row> {
    return this.one(sql`select objects.lifecycle_export(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectId}::uuid) as r`, 'lifecycle_export');
  }
  verifyExport(doc: Row): Promise<Row> { return this.one(sql`select objects.lifecycle_verify_export(${JSON.stringify(doc)}::jsonb) as r`, 'lifecycle_verify_export'); }

  author(a: AuthorIntake): Promise<Row> {
    return this.one(sql`select objects.author_work_object(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectType}, ${a.objectId}::uuid, ${a.title}, ${a.statement},
      ${JSON.stringify(a.body)}::jsonb, ${JSON.stringify(a.evidenceRefs)}::jsonb, ${a.classification}, ${a.purposeScope}, ${a.synthetic}, ${a.idempotencyKey},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'author_work_object');
  }
  transition(a: TransitionIntake): Promise<Row> {
    return this.one(sql`select objects.transition_lifecycle(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectType}, ${a.objectId}::uuid, ${a.expectedVersion}::int, ${a.action},
      ${a.to}, ${a.reason}, ${a.idempotencyKey}, ${a.causationId}::uuid, ${a.correlationRef}, ${a.reentryReason}, ${JSON.stringify(a.changes)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'transition_lifecycle');
  }
  propose(a: ProposeIntake): Promise<Row> {
    return this.one(sql`select objects.propose_lifecycle(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectType}, ${a.objectId}::uuid, ${a.baseVersion}::int,
      ${a.action}, ${a.reason}, ${a.via}, ${a.reentryReason}, ${a.causationId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_lifecycle');
  }
  decide(a: DecideIntake): Promise<Row> {
    return this.one(sql`select objects.decide_lifecycle_proposal(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectId}::uuid, ${a.proposalId}::uuid, ${a.decision},
      ${a.reason}, ${a.expectedVersion}::int, ${a.idempotencyKey}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_lifecycle_proposal');
  }
}

export const LifecycleCapability = {
  read(tx: Tx, action: string): LifecycleReads { return new LifecycleCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): LifecycleWrites { return new LifecycleCapabilityImpl(tx, action); },
};
