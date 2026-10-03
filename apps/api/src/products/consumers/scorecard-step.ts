/**
 * THE TICK STEP `product-scorecards` (order 64) — CP-6 B90 §R (0095 §R; DP-05-006, DP-41-005/-006): on every attention tick, one
 * scorecard per released or degraded product of the domain (products.compute_scorecard under executive.attention.tick), and a released
 * product whose SLO attainment has stayed under its declared floor for its declared grace (declaration.slo.grace_ticks, default 2)
 * consecutive scorecards since its last release or restoration is DEGRADED by the tick — never silently: the port raises an attention
 * item of class product.degradation to every accepted consumer. Registered on the AttentionTickRegistry the executive module exports
 * (the planning step's idiom); the host never names this section.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { newId } from '../../shared/ids.js';
import { ScorecardCapability } from './consumers.capabilities.js';
import { degradationReason } from './consumers.service.js';

export const PRODUCT_SCORECARDS_STEP = 'product-scorecards';
export const PRODUCT_SCORECARDS_ORDER = 64;
type Row = Record<string, unknown>;

@Injectable()
export class ScorecardStepService implements OnModuleInit {
  private readonly log = new Logger(ScorecardStepService.name);
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the product scorecards are not scheduled'); return; }
    registry.register({ name: PRODUCT_SCORECARDS_STEP, order: PRODUCT_SCORECARDS_ORDER, run: async (c: AttentionTickContext) => this.run(c) });
  }

  async run(c: AttentionTickContext): Promise<Row> {
    const cap = ScorecardCapability.tick(c.tx, 'executive.attention.tick');
    const products = await cap.productsToScore({ tenantId: c.tenantId, domainId: c.domainId });
    const scorecards: Row[] = []; const degraded: Row[] = [];
    for (const p of products) {
      const s = await cap.computeScorecard({ scorecardId: newId(), productId: p.product_id, tenantId: c.tenantId, domainId: c.domainId, windowDays: null, actor: c.agentPrincipalId, correlationId: c.correlationId });
      const consecutive = Number(s['consecutive_below_floor'] ?? 0); const grace = Number(s['grace_ticks'] ?? 2);
      scorecards.push({ product_id: p.product_id, product_key: p.product_key, state: p.state, overall: s['overall'], attainment_pct: s['attainment_pct'], floor_pct: s['floor_pct'], below_floor: s['below_floor'], consecutive_below_floor: consecutive, grace_ticks: grace });
      if (p.state === 'released' && s['below_floor'] === true && consecutive >= grace) {
        const reason = degradationReason({ attainmentPct: Number(s['attainment_pct']), floorPct: Number(s['floor_pct']), consecutive, windowDays: Number(s['window_days']) });
        const d = await cap.degrade({ productId: p.product_id, tenantId: c.tenantId, domainId: c.domainId, reason, actor: c.agentPrincipalId, eventId: newId(), correlationId: c.correlationId });
        degraded.push({ product_id: p.product_id, product_key: p.product_key, reason, notified: Array.isArray(d['notified']) ? (d['notified'] as unknown[]).length : 0 });
      }
    }
    return { computed: scorecards.length, scorecards, degraded };
  }
}
