/**
 * CP-6 B91 part `meters` (0105 §ME) — THE METER CAPABILITIES: one implementation, narrow interfaces per port group (the twin constraint
 * capability's idiom); every write a SECURITY DEFINER port that asserts the caller's own bound action. The recording points themselves are
 * AFTER triggers (no route, no capability): these are the ports a route or the tick calls.
 *
 *   commercial.cap.set           → commercial.set_cap            (the tenant's administrator, human-gated; within the licence's limits)
 *   simulation.sweep.run         → commercial.record_usage        (the envelope sweep's wall ms, measured by its route)
 *                                → commercial.record_cap_breach   (the sweep refused before running: a reached stop cap)
 *   executive.attention.tick     → commercial.record_usage        (the storage sample: the port measures the evidence bytes)
 *   commercial.usage.read        → commercial.usage_summary / commercial.cap_status (guarded definer reads)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface MeterReads {
  readonly action: string;
  /** The meters, caps, breaches, latest records and the licence bound (domainId null: the whole tenant). */
  summary(a: { tenantId: string; domainId: string | null; limit: number }): Promise<Row>;
  /** The live caps bounding a dimension (null: every dimension) and the first reached STOP cap. */
  capStatus(a: { tenantId: string; domainId: string | null; dimension: string | null }): Promise<Row>;
}
export interface CapWrites extends MeterReads {
  setCap(a: { tenantId: string; domainId: string | null; dimension: string; unit: string | null; period: string; limit: number; action: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface UsageWrites extends MeterReads {
  recordUsage(a: { tenantId: string; domainId: string; sourceKind: 'envelope_sweep' | 'storage_sample'; sourceRef: string | null; quantity: number | null; details: Row; actor: string; correlationId: string }): Promise<Row>;
  recordCapBreach(a: { tenantId: string; domainId: string; dimension: string; subjectKind: string; subjectId: string | null; details: Row; actor: string; correlationId: string }): Promise<Row>;
}

class MeterCapabilityImpl implements CapWrites, UsageWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row } | undefined)?.r) ?? {};
  }

  async summary(a: Parameters<MeterReads['summary']>[0]) {
    return this.one(sql`select commercial.usage_summary(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.limit}::int) as r`);
  }
  async capStatus(a: Parameters<MeterReads['capStatus']>[0]) {
    return this.one(sql`select commercial.cap_status(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.dimension}::text) as r`);
  }
  async setCap(a: Parameters<CapWrites['setCap']>[0]) {
    return this.one(sql`select commercial.set_cap(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.dimension}, ${a.unit}::text, ${a.period}, ${a.limit}::numeric, ${a.action}, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recordUsage(a: Parameters<UsageWrites['recordUsage']>[0]) {
    return this.one(sql`select commercial.record_usage(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceKind}, ${a.sourceRef}::text, ${a.quantity}::numeric, ${JSON.stringify(a.details)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recordCapBreach(a: Parameters<UsageWrites['recordCapBreach']>[0]) {
    return this.one(sql`select commercial.record_cap_breach(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.dimension}, ${a.subjectKind}, ${a.subjectId}::uuid, ${JSON.stringify(a.details)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const MeterCapability = {
  read(tx: Tx, action: string): MeterReads { return new MeterCapabilityImpl(tx, action); },
  caps(tx: Tx, action: string): CapWrites { return new MeterCapabilityImpl(tx, action); },
  usage(tx: Tx, action: string): UsageWrites { return new MeterCapabilityImpl(tx, action); },
};

/**
 * THE SWEEP ROUTE'S SEAM (B30's fabric controller calls these inside its `/* B91 meters *\/` blocks): the route's own capability with the
 * meter capability beside it, so the cap is read in the route's read and the usage (or the breach) is recorded in the route's own write —
 * no extra governed step, no other stage's port touched.
 */
export function withMeterReads<C extends object>(make: (tx: Tx, action: string) => C): (tx: Tx, action: string) => C & { meters: MeterReads } {
  return (tx, action) => Object.assign(make(tx, action), { meters: MeterCapability.read(tx, action) });
}
export function withMeterUsage<C extends object>(make: (tx: Tx, action: string) => C): (tx: Tx, action: string) => C & { meters: UsageWrites } {
  return (tx, action) => Object.assign(make(tx, action), { meters: MeterCapability.usage(tx, action) });
}
