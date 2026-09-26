/**
 * THE ATTENTION TICK (CP-6 B24, 0086 §0 — the prelude). The timer host (0086 §T) runs one tick per domain on a schedule, under
 * the attention agent's principal (role attention_agent, action executive.attention.tick). A tick is a list of STEPS, run in the
 * order they were registered, each in the tick's own governed write: the escalation of overdue items (§T), the planning and
 * draining of deliveries (§D), the rebalancing of an overloaded queue (§M). A section contributes a step by registering it at
 * module start (onModuleInit); the host never names a section. Each step answers a small record the tick's run keeps.
 */
import { Injectable } from '@nestjs/common';
import type { Tx } from '../../shared/db.js';

/** What a step is given: the tick's transaction (bound to executive.attention.tick), the scope, the agent's principal and the tick key. */
export interface AttentionTickContext {
  tx: Tx;
  tenantId: string;
  domainId: string;
  agentPrincipalId: string;
  /** floor(epoch seconds / cadence): the idempotency key of this tick in this domain. */
  tickKey: number;
  correlationId: string;
}

export interface AttentionTickStep {
  /** A stable name, recorded with its result (escalate, deliveries, rebalance, …). */
  readonly name: string;
  /** The order among steps (lower first): escalate 10, rebalance 20, deliveries 30 — so a delivery is planned for what the tick just escalated or elevated. */
  readonly order: number;
  run(ctx: AttentionTickContext): Promise<Record<string, unknown>>;
}

@Injectable()
export class AttentionTickRegistry {
  private readonly registered: AttentionTickStep[] = [];
  register(step: AttentionTickStep): void {
    if (this.registered.some((s) => s.name === step.name)) throw new Error(`attention tick step ${step.name} is registered twice`);
    this.registered.push(step);
  }
  steps(): readonly AttentionTickStep[] {
    return [...this.registered].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
}
