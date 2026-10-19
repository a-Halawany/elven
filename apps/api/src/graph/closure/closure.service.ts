/**
 * CP-6 B50 §CL (0120_b50_x_cl) — CORRECTION-PROPAGATION CLOSURE: the intake of the closure acts and the SWEEP's attention-tick step.
 *
 *   THE STEP   `correction-closure` (order 29: after the escalations and the workflow timers, before the deliveries at 30 — so a stall raised
 *              by this tick is planned for delivery by the same tick) calls graph.sweep_correction_closures under executive.attention.tick,
 *              the attention agent's principal the actor: on the DATABASE clock, a consumer past its window or a failed delivery stalls its
 *              case, the case's open products freeze and each stalled consumer is routed to its owner (DESIGN D8).
 *   THE INTAKE refuses a malformed request early and in plain words (422); every rule (who, when, what closes) is the port's.
 *
 * CONSTRUCTION; the act's demonstration is SYNTHETIC; real acceptance is never claimed here.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { ClosureCapability } from './closure.capabilities.js';

export const CORRECTION_CLOSURE_STEP = 'correction-closure';
export const CORRECTION_CLOSURE_ORDER = 29;
/** The consumer classes a closure contract names a window for (seconds). */
export const CONSUMER_CLASSES = ['stale', 'challenged', 'withdrawn', 'recompute', 'human_review', 'subscription'] as const;
export type ConsumerClass = (typeof CONSUMER_CLASSES)[number];

type Row = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };

export function text(p: Row, key: string, min: number, max: number, correlationId: string, what: string): string {
  const v = p[key];
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) bad(correlationId, `${key} is ${what} (${min} to ${max} characters)`);
  return (v as string).trim();
}
export function uuid(p: Row, key: string, correlationId: string, what: string): string {
  const v = p[key];
  if (typeof v !== 'string' || !UUID_RE.test(v)) bad(correlationId, `${key} is ${what} (a uuid)`);
  return (v as string).toLowerCase();
}
export function optionalUuid(p: Row, key: string, correlationId: string): string | null {
  const v = p[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) bad(correlationId, `${key}, when given, is a uuid`);
  return (v as string).toLowerCase();
}
/** A consumer reference as the case's read names it: `TYPE:<id>[@version]` (a product) or `SUB:<subscription id>`. */
export function consumerRef(p: Row, correlationId: string): string {
  const v = p['consumerRef'];
  if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z_]{1,40}:[0-9a-f-]{36}(@[0-9]{1,9})?$/i.test(v)) bad(correlationId, 'consumerRef is a consumer of the case as its read names it (TYPE:<id>@<version> or SUB:<subscription id>)');
  return v as string;
}

export function contractIntake(p: Row, correlationId: string): { windows: Record<string, number>; exceptionMaxDays: number; synthetic: boolean; statement: string } {
  const w = p['windows'];
  if (w === null || typeof w !== 'object' || Array.isArray(w)) bad(correlationId, `windows is an object: the acknowledgement window in seconds per consumer class (${CONSUMER_CLASSES.join(', ')})`);
  const windows: Record<string, number> = {};
  for (const [k, v] of Object.entries(w as Row)) {
    if (typeof v !== 'number' || !Number.isInteger(v)) bad(correlationId, `windows.${k} is a whole number of seconds`);
    windows[k] = v as number;
  }
  const days = p['exceptionMaxDays'];
  if (typeof days !== 'number' || !Number.isInteger(days)) bad(correlationId, 'exceptionMaxDays is a whole number of days (1 to 365)');
  const synthetic = p['synthetic'];
  if (typeof synthetic !== 'boolean') bad(correlationId, 'synthetic says whether this is a demonstration contract (true or false)');
  return { windows, exceptionMaxDays: days as number, synthetic: synthetic as boolean, statement: text(p, 'statement', 16, 2000, correlationId, 'the contract\'s basis') };
}

export function acknowledgeIntake(p: Row, correlationId: string): { consumerRef: string; state: 'acknowledged' | 'recomputed'; note: string; recomputeRef: string | null; ackId: string | null } {
  const state = p['state'] ?? 'acknowledged';
  if (state !== 'acknowledged' && state !== 'recomputed') bad(correlationId, 'state is acknowledged or recomputed (a bounded exception is its own act)');
  const ref = p['recomputeRef'];
  if (state === 'recomputed' && (typeof ref !== 'string' || ref.trim() === '')) bad(correlationId, 'recomputeRef names the re-run record (TYPE:<id>@<version>, or export_package | backtest | method_validation | information_set:<id>)');
  return { consumerRef: consumerRef(p, correlationId), state: state as 'acknowledged' | 'recomputed', note: text(p, 'note', 8, 2000, correlationId, 'what was reviewed'),
           recomputeRef: state === 'recomputed' ? (ref as string).trim() : null, ackId: optionalUuid(p, 'ackId', correlationId) };
}

export function exceptIntake(p: Row, correlationId: string): { consumerRef: string; reason: string; expiresAt: string; owner: string; ackId: string | null } {
  const e = p['expiresAt'];
  if (typeof e !== 'string' || Number.isNaN(Date.parse(e)) || !/[zZ]|[+-]\d\d:\d\d$/.test(e)) bad(correlationId, 'expiresAt is an instant with its offset (ISO 8601) — when the exception lapses');
  return { consumerRef: consumerRef(p, correlationId), reason: text(p, 'reason', 16, 2000, correlationId, 'the reason the consumer cannot close now'), expiresAt: e as string,
           owner: uuid(p, 'ownerPrincipalId', correlationId, 'the person who answers for the exception'), ackId: optionalUuid(p, 'ackId', correlationId) };
}

@Injectable()
export class ClosureService implements OnModuleInit {
  private readonly log = new Logger('graph.closure');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The tick step (the strategy detections' idiom: the registry found when the executive module is loaded; a bare graph module runs none). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the correction-closure sweep runs only by a person\'s route'); return; }
    registry.register({ name: CORRECTION_CLOSURE_STEP, order: CORRECTION_CLOSURE_ORDER, run: async (c: AttentionTickContext) => this.tick(c) });
  }

  private async tick(c: AttentionTickContext): Promise<Row> {
    return ClosureCapability.sweep(c.tx, 'executive.attention.tick').sweep({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
}
