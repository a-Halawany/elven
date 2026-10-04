/**
 * THE TICK STEP `commercial-ledger` (order 82) — CP-6 B91 §LE (0105 §LE; IA-70-002/-005, DP-70-002/-005, V10-T-016): on every attention
 * tick of a domain, commercial.ledger_tick under executive.attention.tick — PRICE the tenant's new usage (this domain's and the tenant-level
 * records §ME metered) at the rate-card version in force at each record's occurred_at, idempotently; record each BUDGET THRESHOLD reached
 * (80 % / 100 % by default) and each ANOMALY (cle-anomaly@1), and RAISE them as commercial.usage items to the budget's owner. A budget
 * raises; it never stops, deletes or hides work. Default-off: with no usage, no rate card and no budget the step writes nothing.
 * Registered on the AttentionTickRegistry the executive module exports (the scorecard step's idiom); the host never names this section.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { LedgerCapability } from './ledger.capabilities.js';

export const COMMERCIAL_LEDGER_STEP = 'commercial-ledger';
export const COMMERCIAL_LEDGER_ORDER = 82;

@Injectable()
export class LedgerStepService implements OnModuleInit {
  private readonly log = new Logger(LedgerStepService.name);
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the commercial ledger is not priced'); return; }
    registry.register({ name: COMMERCIAL_LEDGER_STEP, order: COMMERCIAL_LEDGER_ORDER, run: async (c: AttentionTickContext) => this.run(c) });
  }

  async run(c: AttentionTickContext): Promise<Record<string, unknown>> {
    return LedgerCapability.tick(c.tx, 'executive.attention.tick').tick({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
}
