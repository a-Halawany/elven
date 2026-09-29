/**
 * THE STRATEGY GRAPH COMPLETED — CP-6 B36 part `strategy` (migration 0094 §S6–§S8; F-P6-09 (b)(c)(d)).
 *
 *   REVOCATION   an authority act (set_objective, approve_measure, approve_tradeoff, allocate_resource) is REVOKED by its issuer or a
 *                domain administrator with a reason; a lapsed act is not revoked (409). Every read that judges an act "in force" —
 *                the measure's approval, the gap view, the read-time detections — sees the revocation at once (0094 §S6 re-declares
 *                each with the revocation predicate). The route announces GraphChanged/strategy.measure_changed or
 *                strategy.alignment_changed.
 *   DETECTIONS   raised ON A SCHEDULE, not computed on read: the attention tick's step `strategy-detections` (order 50, after the
 *                commitment sweep) calls graph.raise_strategy_detections under executive.attention.tick — stale_measure, gamed_measure
 *                (an owner edit flagged on a favourable score change, 0094 §S5), lost_linkage, owner_missing — each once per cause,
 *                each ROUTED in the same call as an attention item of class strategy.detection to the object's owner under the active
 *                policy. The 0089 read (graph.strategy_detections(…)) stays the page's "as of this read" view; the ROUTED ones are the
 *                schedule's, and a harness proves an item exists without anyone reading the page.
 *   PLAN LINKS   the initiatives Part P declares against an objective, read only when executive.initiatives exists (to_regclass) —
 *                never declared here.
 *
 * The rules are the ports'. The validation here refuses a malformed request early, in plain words (422), and decides no rule a port
 * decides.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import type { ScopeContext } from '../../shared/scope.js';
import { GraphCapability, type StrategyCompletionReads, type StrategyRevocationWrites } from '../graph.capabilities.js';

export const STRATEGY_DETECTIONS_STEP = 'strategy-detections';
export const STRATEGY_DETECTIONS_ORDER = 50;
export const DETECTION_KINDS = ['stale_measure', 'gamed_measure', 'lost_linkage', 'owner_missing'] as const;
export type DetectionKind = (typeof DETECTION_KINDS)[number];
/** The change kind a revocation announces, by the act's subject. */
export const REVOCATION_CHANGE_KIND: Readonly<Record<string, 'strategy.measure_changed' | 'strategy.alignment_changed' | null>> = Object.freeze({ measure: 'strategy.measure_changed', alignment: 'strategy.alignment_changed', strategy: null });

type Row = Record<string, unknown>;
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function validateRevocation(p: Row, correlationId: string): { reason: string } {
  const reason = text(p['reason']);
  if (reason.length < 8 || reason.length > 2000) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'reason is 8 to 2000 characters: a revocation says why'), 422);
  return { reason };
}

@Injectable()
export class StrategyDetectionsService implements OnModuleInit {
  private readonly log = new Logger('graph.strategy.detections');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The tick step (the commitment service's idiom: the registry found when the executive module is loaded; a bare graph module runs none). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the strategy detections are not scheduled'); return; }
    registry.register({ name: STRATEGY_DETECTIONS_STEP, order: STRATEGY_DETECTIONS_ORDER, run: async (c: AttentionTickContext) => this.raise(c) });
  }

  private async raise(c: AttentionTickContext): Promise<Row> {
    return GraphCapability.strategyTick(c.tx, 'executive.attention.tick').raiseStrategyDetections({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }

  async revoke(cap: StrategyRevocationWrites, ctx: ScopeContext, a: { actId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return cap.revokeAuthorityAct({ actId: a.actId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, reason: a.reason, actor: a.actor, correlationId: a.correlationId });
  }

  /** The detections RAISED by the schedule (newest first), each with the attention item it was routed as; optionally one kind or one subject. */
  async raised(cap: StrategyCompletionReads, a: { kind: string | null; subjectId: string | null; limit: number }): Promise<Row[]> {
    let q = cap.readStrategyDetectionsRaised().selectAll();
    if (a.kind !== null && (DETECTION_KINDS as readonly string[]).includes(a.kind)) q = q.where('kind' as never, '=', a.kind as never);
    if (a.subjectId !== null) q = q.where('subject_id' as never, '=', a.subjectId as never);
    return (await q.orderBy('raised_at' as never, 'desc').limit(Math.min(Math.max(a.limit, 1), 500)).execute()) as Row[];
  }

  async planLinks(cap: StrategyCompletionReads, ctx: ScopeContext, a: { objectiveId: string | null }): Promise<Row> {
    return cap.planLinks({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, objectiveId: a.objectiveId });
  }
}
