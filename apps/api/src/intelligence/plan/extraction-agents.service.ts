/**
 * The EXTRACTION AGENT registry (CP-6 B24, migration 0086 §P) — the shape of the propagation agent's (0060): registration is a named
 * human's governed act (intelligence.extraction.agent.register, human-gated: the domain administrator or the extraction manager, and the
 * tenant or platform administrator), revocation is a second one (…revoke), and a revoked grant refuses the next session.
 *
 * THE AGENT'S PRINCIPAL. A registration either NAMES an existing agent principal — kind agent, active, holding a live extraction_agent
 * binding in the domain (the port verifies all three) — or has one CREATED on the identity authority, exactly as the propagation and
 * collection registrations do (identity.principal.create, which the policy admits for the tenant and platform administrators only). So
 * an extraction manager or a domain administrator registers the principal an administrator provisioned; a tenant administrator may do
 * both in one act. Two governed writes on two authorities, never one that lets the identity authority write intelligence state.
 *
 * The executor's identity — version and code digest — is the CODE's (`PLAN_EXECUTOR`), never the request's.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PrincipalsService } from '../../identity/principals.service.js';
import { PrincipalsCapability } from '../../shared/capabilities.js';
import { IntelligenceCapability, type IntelligenceReads } from '../intelligence.capabilities.js';
import { DEFAULT_EXTRACTION_AGENT_BUDGETS, PLAN_EXECUTOR, type ExtractionAgentBudgets } from './plan-executor.js';
import { ExtractionPlanWorkerService } from './extraction-plan-worker.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RegisterExtractionAgentIntake {
  /** The agent principal an administrator provisioned; absent → one is created on the identity authority (a tenant administrator's act). */
  principalId?: string;
  /** The accountable human. */
  ownerPrincipalId: string;
  /** The human an exhausted or refused execution is escalated to; the owner when absent. */
  escalationPrincipalId?: string;
  /** Narrowed or widened within the port's bounds; the defaults otherwise. */
  budgets?: Partial<ExtractionAgentBudgets>;
}

@Injectable()
export class ExtractionAgentsService {
  constructor(private readonly pipeline: PipelineService, private readonly principals: PrincipalsService, private readonly worker: ExtractionPlanWorkerService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** Register: the principal (named, or created on the identity authority), then the grant on the commit authority; then serve the domain. */
  async register(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, intake: RegisterExtractionAgentIntake) {
    const bad = (m: string) => new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, m), 422);
    if (typeof intake.ownerPrincipalId !== 'string' || !UUID.test(intake.ownerPrincipalId)) throw bad('ownerPrincipalId (the accountable human) is required');
    if (intake.escalationPrincipalId !== undefined && (typeof intake.escalationPrincipalId !== 'string' || !UUID.test(intake.escalationPrincipalId))) throw bad('escalationPrincipalId is a principal id');
    if (intake.principalId !== undefined && (typeof intake.principalId !== 'string' || !UUID.test(intake.principalId))) throw bad('principalId is the id of an agent principal');
    // The budgets reach the port as given (merged over the defaults): the port states the bounds and refuses anything outside them.
    const budgets = { ...DEFAULT_EXTRACTION_AGENT_BUDGETS, ...(intake.budgets ?? {}) };
    const E = PLAN_EXECUTOR;
    const agentId = newId();
    let principalId = intake.principalId;
    if (principalId === undefined) {
      const created = newId();
      await this.pipeline.write({ ...envelope, action: 'identity.principal.create', message_id: newId() }, actor,
        { scope: 'DOMAIN', tenantId, domainId, action: 'identity.principal.create', objectType: 'PRN', objectId: created, authority: 'identity' }, PrincipalsCapability.write,
        async (cap) => {
          await this.principals.createPrincipal(cap, { principalId: created, correlationId: envelope.correlation_id, kind: 'agent', scope: 'DOMAIN', tenantId, domainId,
            // The VERSION IS IN THE NAME: a new executor is a new principal, so its identity can never quietly change under its claims.
            displayName: `agent:${E.name}@${E.version} (${E.codeDigest.slice(0, 12)})`,
            loginName: `agent-intelligence-plan-${E.version}-${E.codeDigest.slice(0, 12)}-${created.slice(-6)}`, roleCode: 'extraction_agent' });
          return { result: { principalId: created }, targetType: 'PRN', targetId: created, targetVersion: '1', outboxEvent: null };
        });
      principalId = created;
    }
    const agentPrincipal = principalId;
    const out = await this.pipeline.write({ ...envelope, action: 'intelligence.extraction.agent.register', message_id: newId() }, actor,
      this.route(tenantId, domainId, 'intelligence.extraction.agent.register', 'AGT', agentId), IntelligenceCapability.extractionAgents,
      async (cap) => {
        const r = await cap.registerExtractionAgent({ agentId, tenantId, domainId, principalId: agentPrincipal, version: E.version, codeDigest: E.codeDigest,
          owner: intake.ownerPrincipalId, escalation: intake.escalationPrincipalId ?? intake.ownerPrincipalId, budgets: { ...budgets },
          actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { agentId, principalId: r.principal_id, role: 'extraction_agent', executor: { name: E.name, version: r.version, codeDigest: r.code_digest },
                           budgets: r.budgets, owner: r.owner, escalation: r.escalation, requeued: r.requeued, pending: Number(r.pending), principalCreated: intake.principalId === undefined },
                 targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    // The domain is served from this moment: its drain (whose first job runs at once) takes what was waiting.
    const every = await this.worker.schedule(tenantId, domainId, agentId, Number(budgets.drain_every_seconds));
    return { agent: out.result, served: { drainScheduled: this.worker.enabled, everySeconds: every, workerRunning: this.worker.runtime(tenantId, domainId).worker_running },
             receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /**
   * Revoke: a second governed write. The drain is deliberately LEFT (the grant, not the queue, is the authority — the propagation
   * precedent): the revoked agent's next drain is refused by its session port, records the refusal on what it claimed and removes itself.
   */
  async revoke(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, agentId: string, reason: string) {
    if (typeof reason !== 'string' || reason.trim().length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a revocation states its reason (at least 8 characters)'), 422);
    }
    const out = await this.pipeline.write(envelope, actor, this.route(tenantId, domainId, 'intelligence.extraction.agent.revoke', 'AGT', agentId), IntelligenceCapability.extractionAgents,
      async (cap) => {
        const r = await cap.revokeExtractionAgent({ agentId, tenantId, domainId, reason, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { agentId, status: r.status, pending: Number(r.pending) }, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    return { agent: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /**
   * The status read: the executor, the domain's agents (the active one, or none — and then WHY the pending executions wait), the
   * executions newest first (optionally one evidence's, or one state), the counts by state, and whether THIS process serves the domain.
   */
  async status(cap: IntelligenceReads, tenantId: string, domainId: string, filter: { evdObjectId?: string; state?: string; limit?: number }) {
    const agents = (await cap.readExtractionAgents().selectAll().orderBy('created_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    let q = cap.readPlanExecutions().selectAll();
    if (filter.evdObjectId !== undefined) q = q.where('evd_object_id' as never, '=', filter.evdObjectId as never);
    if (filter.state !== undefined) q = q.where('state' as never, '=', filter.state as never);
    const executions = (await q.orderBy('queued_at' as never, 'desc').limit(Math.max(1, Math.min(filter.limit ?? 100, 500))).execute()) as Array<Record<string, unknown>>;
    const all = (await cap.readPlanExecutions().select(['state' as never]).execute()) as Array<{ state: string }>;
    const counts: Record<string, number> = { pending: 0, running: 0, done: 0, refused: 0, failed: 0 };
    for (const r of all) counts[r.state] = (counts[r.state] ?? 0) + 1;
    const active = agents.find((a) => a['status'] === 'active') ?? null;
    const waiting = counts['pending'] ?? 0;
    const note = active === null
      ? (waiting > 0 ? `no extraction agent is registered in this domain: ${waiting} execution(s) wait, pending, until one is` : 'no extraction agent is registered in this domain')
      : null;
    return { executor: { ...PLAN_EXECUTOR }, agent: active, agents, executions, counts, note, runtime: this.worker.runtime(tenantId, domainId) };
  }
}
