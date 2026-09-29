/**
 * THE BRIEFING EXPIRY as a step of the attention tick — CP-6 B36 part `briefing` (0094 §B.6; B.md b3).
 *
 * Order 60 (after escalate 10, rebalance 20, deliveries 30, the stream sweep 40, the strategy detections 50 and the plan variance 55):
 * inside the tick's write (bound to executive.attention.tick, under the attention agent's principal) the port executive.expire_briefings
 * writes ONE briefing.expired event for every BRF@v3 edition whose expires_at has passed and that carries none yet. The tick, not the
 * read, records the expiry: a read is a read. The edition row is immutable; the read renders `expired: true` from the clock and the ledger.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ExecutiveCapability } from '../executive.capabilities.js';
import { AttentionTickRegistry, type AttentionTickContext, type AttentionTickStep } from '../attention/tick.js';

export const BRIEFING_EXPIRY_STEP = 'briefing-expiry';

@Injectable()
export class BriefingExpiryStep implements AttentionTickStep, OnModuleInit {
  readonly name = BRIEFING_EXPIRY_STEP;
  readonly order = 60;
  constructor(private readonly registry: AttentionTickRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  async run(ctx: AttentionTickContext): Promise<Record<string, unknown>> {
    const r = await ExecutiveCapability.briefingExpiry(ctx.tx, 'executive.attention.tick').expireBriefings({ tenantId: ctx.tenantId, domainId: ctx.domainId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
    const ids = Array.isArray(r['briefing_ids']) ? (r['briefing_ids'] as string[]) : [];
    return { expired: ids.length, briefing_ids: ids.slice(0, 50), at: r['at'] ?? null };
  }
}
