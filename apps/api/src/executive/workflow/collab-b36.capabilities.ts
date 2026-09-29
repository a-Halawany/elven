/**
 * THE B36 COLLABORATION CAPABILITIES — CP-6 B36 part `collab` (0094 §C1–§C3; F-P6-14 completes). One class per port group, the
 * workflow.capabilities.ts discipline: a route receives exactly the capability its action names; every write goes through a SECURITY
 * DEFINER port that asserts that action.
 *
 *   CollabSurfaceReads        executive.collab_grant_surface        (the external's bounded self read — under executive.collab.read)
 *   TaskDependencyWrites      executive.declare_task_dependency     (executive.task.dependency.declare) + the reads task_dependencies_of / task_unmet_dependencies
 *   InvitationDeliveryWrites  executive.deliver_invitation          (executive.collab.provision) + the read invitation_delivery_of
 *   InvitationPickupPort      executive.pickup_invitation           (NO bound action — the one port reached without a principal; the delivery
 *                                                                    service opens its own COMMIT transaction for it, outside the pipeline)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class B36Core {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface CollabSurfaceReads {
  readonly action: string;
  now(): Promise<string>;
  /** The grants that bound this principal — nothing of the tenant beyond (0094 §C1). */
  grantSurface(principalId: string): Promise<Row>;
}
export interface TaskDependencyWrites {
  readonly action: string;
  declareDependency(a: { dependencyId: string; tenantId: string; domainId: string; taskId: string; dependsOn: string; actor: string; correlationId: string }): Promise<Row>;
  dependenciesOf(taskId: string): Promise<Row>;
  unmetDependencies(taskId: string): Promise<Row[]>;
}
export interface InvitationDeliveryWrites {
  readonly action: string;
  deliver(a: { deliveryId: string; tenantId: string; domainId: string; grantId: string; codeHash: string; sealed: string; codeExpiresAt: string; actor: string; correlationId: string }): Promise<Row>;
  deliveryOf(grantId: string): Promise<Row | null>;
}
export interface InvitationPickupPort {
  pickup(a: { grantId: string; codeHash: string; from: string; correlationId: string }): Promise<Row>;
}

class CollabSurfaceImpl extends B36Core implements CollabSurfaceReads {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async grantSurface(principalId: string): Promise<Row> {
    return this.one(sql`select executive.collab_grant_surface(${principalId}::uuid) as r`, 'collab_grant_surface');
  }
}
class TaskDependencyImpl extends B36Core implements TaskDependencyWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async declareDependency(a: Parameters<TaskDependencyWrites['declareDependency']>[0]): Promise<Row> {
    return this.one(sql`select executive.declare_task_dependency(${a.dependencyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.taskId}::uuid, ${a.dependsOn}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'declare_task_dependency');
  }
  async dependenciesOf(taskId: string): Promise<Row> {
    return this.one(sql`select executive.task_dependencies_of(${taskId}::uuid) as r`, 'task_dependencies_of');
  }
  async unmetDependencies(taskId: string): Promise<Row[]> {
    return (await this.one(sql`select jsonb_build_object('unmet', executive.task_unmet_dependencies(${taskId}::uuid)) as r`, 'task_unmet_dependencies'))['unmet'] as Row[];
  }
}
class InvitationDeliveryImpl extends B36Core implements InvitationDeliveryWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async deliver(a: Parameters<InvitationDeliveryWrites['deliver']>[0]): Promise<Row> {
    return this.one(sql`select executive.deliver_invitation(${a.deliveryId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.grantId}::uuid, ${a.codeHash}, ${a.sealed}, ${a.codeExpiresAt}::timestamptz,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'deliver_invitation');
  }
  async deliveryOf(grantId: string): Promise<Row | null> {
    const r = await this.one(sql`select jsonb_build_object('d', executive.invitation_delivery_of(${grantId}::uuid)) as r`, 'invitation_delivery_of');
    return (r['d'] ?? null) as Row | null;
  }
}
class InvitationPickupImpl implements InvitationPickupPort {
  constructor(private readonly tx: Tx) {}
  async pickup(a: { grantId: string; codeHash: string; from: string; correlationId: string }): Promise<Row> {
    const r = await sql<{ r: Row }>`select executive.pickup_invitation(${a.grantId}::uuid, ${a.codeHash}, ${a.from}, ${a.correlationId}::uuid) as r`.execute(this.tx);
    const row = r.rows[0]?.r;
    if (row === undefined || row === null) throw new Error('pickup_invitation returned no row');
    return row;
  }
}

export const CollabB36Capability = {
  surface(tx: Tx, action: string): CollabSurfaceReads { return new CollabSurfaceImpl(tx, action); },
  dependency(tx: Tx, action: string): TaskDependencyWrites { return new TaskDependencyImpl(tx, action); },
  delivery(tx: Tx, action: string): InvitationDeliveryWrites { return new InvitationDeliveryImpl(tx, action); },
  /** Outside the pipeline (no principal): the delivery service's own COMMIT transaction. */
  pickup(tx: Tx): InvitationPickupPort { return new InvitationPickupImpl(tx); },
};
