/**
 * CP-6 B91 part `meters` (0105 §ME; F-P7-F-02's meters and caps, B90's usage counters) — THE METER SERVICE: the cap intake, the storage
 * tick step and the envelope sweep's admission check.
 *
 * THE TICK STEP `commercial-storage-sample` (order 80): on every attention tick the domain's EVIDENCE bytes are sampled by the port
 * (commercial.record_usage, source kind storage_sample — the port measures; the step names no figure), once per domain per hour of the
 * database's clock (a second tick in the hour records nothing). It writes commercial.usage_records only. The §LE ledger's pricing step
 * should run after it (a higher order) so a sample is priced in the tick that took it.
 *
 * THE BOUNDARY (ADR-022, IA-70-003): a cap makes NEW work unavailable, explained; it never deletes work, never removes a mandatory control
 * and is never set, raised or lifted by an agent (the port requires a named human tenant administrator).
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { MeterCapability } from './meters.capabilities.js';

type Row = Record<string, unknown>;
export const STORAGE_SAMPLE_STEP = 'commercial-storage-sample';
export const STORAGE_SAMPLE_ORDER = 80;
export const DIMENSIONS = ['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const UNITS: Record<Dimension, readonly string[]> = {
  model_inference: ['calls'], source_consumption: ['requests', 'bytes'], storage: ['bytes'], simulation_compute: ['wall_ms'], product_consumption: ['events', 'servings'],
};
/** Only simulation_compute has an admission point that enforces a stop (the experiment chunk claim, the envelope sweep route). */
export const STOPPABLE: readonly Dimension[] = ['simulation_compute'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (correlationId: string, message: string, status = 422): never => {
  throw new HttpException(errorBody(status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId, message), status);
};

export interface CapIntake { domainId: string | null; dimension: Dimension; unit: string | null; period: 'day' | 'month'; limit: number; action: 'stop' | 'warn'; reason: string }

/** The cap intake (the route's own refusals; the port re-checks every rule and adds the licence bound). Pure. */
export function validateCapIntake(p: Row, correlationId: string): CapIntake {
  const dimension = p['dimension'];
  if (typeof dimension !== 'string' || !(DIMENSIONS as readonly string[]).includes(dimension)) bad(correlationId, `usage cap rejected (dimension): the dimension is one of ${DIMENSIONS.join(', ')}`);
  const dim = dimension as Dimension;
  const unit = p['unit'] === undefined || p['unit'] === null || p['unit'] === '' ? null : p['unit'];
  if (unit !== null && (typeof unit !== 'string' || !UNITS[dim].includes(unit))) bad(correlationId, `usage cap rejected (unit): ${dim} is metered in ${UNITS[dim].join(', ')}`);
  const period = p['period'];
  if (period !== 'day' && period !== 'month') bad(correlationId, 'usage cap rejected (period): the period is day or month (the UTC calendar)');
  const limit = p['limit'];
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) bad(correlationId, 'usage cap rejected (limit): the limit is a positive number');
  const action = p['action'];
  if (action !== 'stop' && action !== 'warn') bad(correlationId, 'usage cap rejected (action): the action is stop or warn');
  if (action === 'stop' && !STOPPABLE.includes(dim)) {
    bad(correlationId, `usage cap rejected (action): a ${dim} cap is warn only — ${dim === 'model_inference' ? 'a stop at the gateway would refuse an extraction mid-run' : 'no admission point enforces a stop on it'}`);
  }
  const reason = typeof p['reason'] === 'string' ? (p['reason'] as string).trim() : '';
  if (reason.length < 8 || reason.length > 1000) bad(correlationId, 'usage cap rejected (reason): a cap states its reason (8 to 1000 characters)');
  const domainId = p['domainId'] === undefined || p['domainId'] === null || p['domainId'] === '' ? null : p['domainId'];
  if (domainId !== null && (typeof domainId !== 'string' || !UUID.test(domainId))) bad(correlationId, `usage cap rejected (unknown_domain): ${String(domainId)} is not a domain id`, 404);
  return { domainId: domainId as string | null, dimension: dim, unit: unit as string | null, period: period as 'day' | 'month', limit: limit as number, action: action as 'stop' | 'warn', reason };
}

/** The sweep route's refusal text when a stop cap is reached (the family `usage cap rejected (cap)`, 409). Pure. */
export function capRefusal(cap: Row): string {
  return `usage cap rejected (cap): the tenant's simulation_compute cap (${String(cap['limit'])} ${String(cap['unit'])} per ${String(cap['period'])}, stop) is reached — `
    + `${String(cap['used'])} used since ${String(cap['period_start'])}; the sweep did not run (the breach is recorded; nothing was deleted; the tenant administrator may raise the cap)`;
}

@Injectable()
export class MetersService implements OnModuleInit {
  private readonly log = new Logger(MetersService.name);
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the storage meter is not sampled'); return; }
    registry.register({ name: STORAGE_SAMPLE_STEP, order: STORAGE_SAMPLE_ORDER, run: async (c: AttentionTickContext) => this.sample(c) });
  }

  /** THE STORAGE SAMPLE (the tick step): the port measures the domain's evidence bytes; once per domain per hour. */
  async sample(c: AttentionTickContext): Promise<Row> {
    const cap = MeterCapability.usage(c.tx, 'executive.attention.tick');
    // a meter never fails the tick it rides on: the sample runs under a savepoint; a failure is answered on the step's record, the tick goes on
    await sql`savepoint cme_storage_sample`.execute(c.tx);
    try {
      const r = await cap.recordUsage({ tenantId: c.tenantId, domainId: c.domainId, sourceKind: 'storage_sample', sourceRef: null, quantity: null, details: {}, actor: c.agentPrincipalId, correlationId: c.correlationId });
      await sql`release savepoint cme_storage_sample`.execute(c.tx);
      return { recorded: r['recorded'] === true, bytes: r['quantity'] ?? null, hot_bytes: r['hot_bytes'] ?? null, archive_bytes: r['archive_bytes'] ?? null, source_ref: r['source_ref'] ?? null };
    } catch (e) {
      await sql`rollback to savepoint cme_storage_sample`.execute(c.tx);
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      this.log.warn(`storage sample of ${c.tenantId}/${c.domainId} not recorded: ${error}`);
      return { recorded: false, error };
    }
  }
}
