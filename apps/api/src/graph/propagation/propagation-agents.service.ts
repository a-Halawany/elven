/**
 * The PROPAGATION AGENT registry (CP-6 B1, migration 0060): registration creates the agent's
 * principal on the identity authority (kind agent, role propagation_agent) and its grant on
 * the commit authority — the two governed writes every agent registration makes (observation
 * 0022, executive 0046). One active agent per domain; revocation is a second governed write,
 * and a revoked grant refuses the next session and the next extension.
 *
 * The walker's identity — version and code digest — is the CODE's (`PROPAGATION_WALKER`),
 * never the request's: a registration binds the domain to this walk, and a changed walk is a
 * new registration.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PrincipalsService } from '../../identity/principals.service.js';
import { PrincipalsCapability } from '../../shared/capabilities.js';
import { GraphCapability, type GraphReads } from '../graph.capabilities.js';
import { PROPAGATION_WALKER } from '../strategy/impact.service.js';
import { SchedulerService, propagationQueueNameFor, redisName } from '../../observation/scheduling/scheduler.service.js';
import { PropagationConsumerService } from './propagation-consumer.service.js';

/** The consumer's bounds, declared at registration and recorded on the grant. */
export interface PropagationBudgets {
  /** A case with more corrected objects than this is refused, honestly, as operator work. */
  max_roots_per_event: number;
  /** The whole delivery's wall-clock bound; checked before every root. */
  max_elapsed_ms: number;
  /** Whether cases applied before the agent existed are re-driven at registration. */
  backlog_policy: 'walk' | 'leave';
}
const DEFAULT_BUDGETS: PropagationBudgets = { max_roots_per_event: 64, max_elapsed_ms: 600_000, backlog_policy: 'leave' };

export interface RegisterPropagationAgentIntake {
  ownerPrincipalId: string;
  backlog?: 'walk' | 'leave';
  /** Test-only narrowing of the bounds (never widened past the defaults). */
  budgets?: Partial<Pick<PropagationBudgets, 'max_roots_per_event' | 'max_elapsed_ms'>>;
}

@Injectable()
export class PropagationAgentsService {
  constructor(
    private readonly pipeline: PipelineService, private readonly principals: PrincipalsService,
    private readonly scheduler: SchedulerService, private readonly consumer: PropagationConsumerService,
  ) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** Register: the principal on the identity authority, then the grant on the commit authority; then serve the domain. */
  async register(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, intake: RegisterPropagationAgentIntake) {
    if (typeof intake.ownerPrincipalId !== 'string' || intake.ownerPrincipalId.length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'ownerPrincipalId (the accountable human) is required'), 400);
    }
    const backlog = intake.backlog ?? 'leave';
    if (backlog !== 'walk' && backlog !== 'leave') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, "backlog is 'walk' or 'leave'"), 400);
    }
    const budgets: PropagationBudgets = {
      max_roots_per_event: clampBudget(intake.budgets?.max_roots_per_event, DEFAULT_BUDGETS.max_roots_per_event),
      max_elapsed_ms: clampBudget(intake.budgets?.max_elapsed_ms, DEFAULT_BUDGETS.max_elapsed_ms),
      backlog_policy: backlog,
    };
    const W = PROPAGATION_WALKER;
    const principalId = newId(); const agentId = newId();
    await this.pipeline.write({ ...envelope, action: 'identity.principal.create', message_id: newId() }, actor,
      { scope: 'DOMAIN', tenantId, domainId, action: 'identity.principal.create', objectType: 'PRN', objectId: principalId, authority: 'identity' }, PrincipalsCapability.write,
      async (cap) => {
        await this.principals.createPrincipal(cap, { principalId, correlationId: envelope.correlation_id, kind: 'agent', scope: 'DOMAIN', tenantId, domainId,
          // The VERSION IS IN THE NAME: a new walker is a new principal, so its identity can never quietly change under its evidence.
          displayName: `agent:${W.name}@${W.version} (${W.codeDigest.slice(0, 12)})`,
          loginName: `agent-graph-propagation-${W.version}-${W.codeDigest.slice(0, 12)}-${principalId.slice(-6)}`, roleCode: 'propagation_agent' });
        return { result: { principalId }, targetType: 'PRN', targetId: principalId, targetVersion: '1', outboxEvent: null };
      });
    const out = await this.pipeline.write({ ...envelope, action: 'graph.propagation.agent.register', message_id: newId() }, actor,
      this.route(tenantId, domainId, 'graph.propagation.agent.register', 'AGT', agentId), GraphCapability.propagationAgents,
      async (cap) => {
        const r = await cap.registerPropagationAgent({ agentId, tenantId, domainId, principalId, version: W.version, codeDigest: W.codeDigest,
          owner: intake.ownerPrincipalId, budgets: { ...budgets }, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { agentId, principalId: r.principal_id, role: 'propagation_agent', walker: { name: W.name, version: r.version, codeDigest: r.code_digest }, budgets: r.budgets },
                 targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    // The domain is served from this moment: a worker for its queue, and the backlog re-driven where the policy says so.
    const served = await this.consumer.reconcile('propagation agent registered');
    return { agent: out.result, served: { workerRunning: served.workers.includes(redisName(propagationQueueNameFor(tenantId, domainId))), reDriven: served.reDriven.filter((e) => e.tenantId === tenantId && e.domainId === domainId).length },
             receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  async revoke(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, agentId: string, reason: string) {
    if (typeof reason !== 'string' || reason.trim().length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a revocation states its reason (at least 8 characters)'), 400);
    }
    const out = await this.pipeline.write(envelope, actor, this.route(tenantId, domainId, 'graph.propagation.agent.revoke', 'AGT', agentId), GraphCapability.propagationAgents,
      async (cap) => {
        await cap.revokePropagationAgent({ agentId, tenantId, domainId, reason, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { agentId, status: 'revoked' }, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    return { agent: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The registry, the recent attempts and whether THIS process serves the domain — a read under the reader's own scope. */
  async status(cap: GraphReads, tenantId: string, domainId: string) {
    const agents = (await cap.readPropagationAgents().selectAll().orderBy('created_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const attempts = (await cap.readPropagationAttempts().selectAll().orderBy('last_delivered_at' as never, 'desc').limit(50).execute()) as Array<Record<string, unknown>>;
    const name = redisName(propagationQueueNameFor(tenantId, domainId));
    return {
      walker: { ...PROPAGATION_WALKER },
      agents, attempts,
      runtime: { scheduler_enabled: this.scheduler.enabled, worker_running: this.scheduler.runningWorkers().includes(name), redis_queue: name,
                 last_reconciliation: this.consumer.lastReconciliation(), last_failure: this.consumer.lastFailureSeen() },
    };
  }
}

/** A budget may be NARROWED below the default, never widened past it. */
function clampBudget(v: unknown, dflt: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return dflt;
  return Math.min(Math.floor(v), dflt);
}
