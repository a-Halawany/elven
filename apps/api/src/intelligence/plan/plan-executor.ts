/**
 * THE PLAN EXECUTOR'S IDENTITY (CP-6 B24, migration 0086 §P) — what a domain's extraction agent is bound to.
 *
 * A registration binds the domain to THIS executor's version and code digest (the propagation walker's rule, 0060): the digest is
 * computed from the executor's method statement, so a changed executor is a new registration, and a session opened for an agent
 * registered under another digest is refused by the database (intelligence.extraction_agent_session_open).
 */
import { createHash } from 'node:crypto';

/** What the executor does — the statement its code digest is computed from. Change the behaviour, change this text. */
export const PLAN_EXECUTOR_METHOD_REF = 'a pending plan execution (one per method version and evidence version, queued by the observations subscriber in the '
  + 'delivery\'s transaction) claimed FOR UPDATE SKIP LOCKED under the schedule capability, run by ExtractionOrchestrator.run under the extraction '
  + 'agent\'s own session for exactly that evidence with newAttempt = false (0023\'s extraction identity makes a repeat free), the outcome recorded '
  + 'on the execution row (done with the run, refused with the governance answer, failed with the fault); the session extended per recorded execution';

export const PLAN_EXECUTOR = Object.freeze({
  name: 'intelligence.plan-execution',
  version: '1.0.0',
  codeDigest: createHash('sha256').update(`intelligence.plan-execution@1.0.0:${PLAN_EXECUTOR_METHOD_REF}`, 'utf8').digest('hex'),
});

/** The agent's bounds, declared at registration and recorded on the grant (the port refuses anything outside them). */
export interface ExtractionAgentBudgets {
  /** How many executions one drain takes (1..50). */
  max_executions_per_drain: number;
  /** How many times a FAILED execution is taken again before it stays failed (1..5). */
  max_attempts: number;
  /** The drain's cadence; the scheduler's 60-second floor applies (60..86400). */
  drain_every_seconds: number;
}
export const DEFAULT_EXTRACTION_AGENT_BUDGETS: ExtractionAgentBudgets = Object.freeze({ max_executions_per_drain: 10, max_attempts: 3, drain_every_seconds: 60 });

/** The STORED, logical queue name of a domain's plan drain (scope-prefixed with ':'; the Redis name is derived by redisName). */
export function planQueueNameFor(tenantId: string, domainId: string): string { return `intel:${tenantId}:${domainId}:plan`; }
/** The logical id of a domain's repeatable drain — one per domain (one active agent per domain). */
export function planSchedulerIdFor(tenantId: string, domainId: string): string { return `intel:${tenantId}:${domainId}:plan-drain`; }

/** A drain job: scope and the agent it runs for. It carries no authority — the worker re-resolves everything and the agent's session decides. */
export interface PlanDrainJobPayload { tenantId: string; domainId: string; agentId: string; correlationId: string }
