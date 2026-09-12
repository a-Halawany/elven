/**
 * The SUBSCRIPTION REGISTRY (CP-6 B6, 0063): registration creates the subscriber's principal on the identity
 * authority (kind agent, the kind's role) and the subscription on the commit authority — the two governed writes
 * every agent registration makes — then serves the domain. One live subscription per domain and consumer kind;
 * pause, resume and revocation are governed writes; a replay is a governed write that moves the cursor back and
 * re-drives the outbox rows after it to that subscription alone.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PrincipalsService } from '../../identity/principals.service.js';
import { PrincipalsCapability } from '../../shared/capabilities.js';
import { SchedulerService, redisName, subscriptionQueueNameFor } from '../../observation/scheduling/scheduler.service.js';
import { GraphCapability, type GraphReads } from '../graph.capabilities.js';
import { CONSUMER_KINDS, CONSUMER_ROLE, CONSUMER_VERSION, consumerCodeDigest, type ConsumerKind } from './graph-change.js';
import { SubscriptionDispatcherService } from './subscription-dispatcher.service.js';

export interface SubscriptionBudgets { max_items_per_event: number; max_elapsed_ms: number; backlog_policy: 'replay' | 'leave' }
const DEFAULT_BUDGETS: SubscriptionBudgets = { max_items_per_event: 200, max_elapsed_ms: 600_000, backlog_policy: 'leave' };
export interface RegisterSubscriptionIntake {
  consumerKind: ConsumerKind; ownerPrincipalId: string; eventTypes?: Array<'GraphChanged' | 'MemoryCorrected'>; filter?: { change_kinds?: string[] };
  backlog?: 'replay' | 'leave'; budgets?: Partial<Pick<SubscriptionBudgets, 'max_items_per_event' | 'max_elapsed_ms'>>;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly pipeline: PipelineService, private readonly principals: PrincipalsService,
    private readonly scheduler: SchedulerService, private readonly dispatcher: SubscriptionDispatcherService,
  ) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  async register(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, intake: RegisterSubscriptionIntake) {
    const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, m), 400); };
    if (!(CONSUMER_KINDS as readonly string[]).includes(intake.consumerKind)) bad(`consumerKind is one of ${CONSUMER_KINDS.join(', ')}`);
    if (typeof intake.ownerPrincipalId !== 'string' || intake.ownerPrincipalId.length < 8) bad('ownerPrincipalId (the accountable human) is required');
    const eventTypes = intake.eventTypes ?? ['GraphChanged', 'MemoryCorrected'];
    if (!Array.isArray(eventTypes) || eventTypes.length === 0 || eventTypes.some((t) => t !== 'GraphChanged' && t !== 'MemoryCorrected')) bad('eventTypes is a non-empty list of GraphChanged | MemoryCorrected');
    const backlog = intake.backlog ?? 'leave';
    if (backlog !== 'replay' && backlog !== 'leave') bad("backlog is 'replay' or 'leave'");
    const filter: Record<string, unknown> = {};
    if (intake.filter?.change_kinds !== undefined) {
      if (!Array.isArray(intake.filter.change_kinds) || intake.filter.change_kinds.some((k) => typeof k !== 'string')) bad('filter.change_kinds is a list of change kinds');
      filter['change_kinds'] = intake.filter.change_kinds;
    }
    const budgets: SubscriptionBudgets = {
      max_items_per_event: clamp(intake.budgets?.max_items_per_event, DEFAULT_BUDGETS.max_items_per_event),
      max_elapsed_ms: clamp(intake.budgets?.max_elapsed_ms, DEFAULT_BUDGETS.max_elapsed_ms),
      backlog_policy: backlog,
    };
    const kind = intake.consumerKind; const digest = consumerCodeDigest(kind);
    const principalId = newId(); const subscriptionId = newId();
    await this.pipeline.write({ ...envelope, action: 'identity.principal.create', message_id: newId() }, actor,
      { scope: 'DOMAIN', tenantId, domainId, action: 'identity.principal.create', objectType: 'PRN', objectId: principalId, authority: 'identity' }, PrincipalsCapability.write,
      async (cap) => {
        await this.principals.createPrincipal(cap, { principalId, correlationId: envelope.correlation_id, kind: 'agent', scope: 'DOMAIN', tenantId, domainId,
          displayName: `agent:graph.subscription.${kind}@${CONSUMER_VERSION} (${digest.slice(0, 12)})`,
          loginName: `agent-subscription-${kind}-${CONSUMER_VERSION}-${digest.slice(0, 12)}-${principalId.slice(-6)}`, roleCode: CONSUMER_ROLE[kind] });
        return { result: { principalId }, targetType: 'PRN', targetId: principalId, targetVersion: '1', outboxEvent: null };
      });
    const out = await this.pipeline.write({ ...envelope, action: 'graph.subscription.register', message_id: newId() }, actor,
      this.route(tenantId, domainId, 'graph.subscription.register', 'SUB', subscriptionId), GraphCapability.subscriptions,
      async (cap) => {
        const r = await cap.registerSubscription({ subscriptionId, tenantId, domainId, consumerKind: kind, eventTypes, filter, principalId, version: CONSUMER_VERSION, codeDigest: digest,
          owner: intake.ownerPrincipalId, budgets: { ...budgets }, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { subscriptionId, consumerKind: kind, principalId: r.principal_id, role: CONSUMER_ROLE[kind], consumer: { version: r.version, codeDigest: r.code_digest }, eventTypes, filter, budgets: r.budgets },
                 targetType: 'SUB', targetId: subscriptionId, targetVersion: '1', outboxEvent: null };
      });
    // Served from the subscription's own point (0064): 'leave' from its registration, 'replay' from the beginning —
    // the reconciliation re-drives each past row ONCE (0063 re-drove a replayed backlog twice: the replay's jobs and its own).
    const served = await this.dispatcher.reconcile('subscription registered', true);
    return { subscription: out.result, served: { workerRunning: served.workers.includes(redisName(subscriptionQueueNameFor(tenantId, domainId))), reDriven: served.reDriven.filter((e) => e.tenantId === tenantId && e.domainId === domainId).length },
             receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  async control(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, subscriptionId: string, to: 'active' | 'paused' | 'revoked', reason: string) {
    if (typeof reason !== 'string' || reason.trim().length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a subscription control states its reason (at least 8 characters)'), 400);
    const out = await this.pipeline.write(envelope, actor, this.route(tenantId, domainId, 'graph.subscription.control', 'SUB', subscriptionId), GraphCapability.subscriptions,
      async (cap) => {
        const s = await cap.setSubscriptionStatus({ subscriptionId, tenantId, domainId, to, reason, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { subscriptionId, status: s }, targetType: 'SUB', targetId: subscriptionId, targetVersion: '1', outboxEvent: null };
      });
    // A resume re-drives what was refused while paused; a revocation stops nothing in flight (the next item refuses).
    if (to === 'active') await this.dispatcher.reconcile('subscription resumed', true);
    return { subscription: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /**
   * Move the cursor back and re-drive this subscription's events after it; the outbox and every other subscription
   * untouched. The point is (fromCreatedAt, fromEventId), or a sequence in the declared partition (0064), or neither
   * for the beginning.
   */
  async replay(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, subscriptionId: string, a: { fromCreatedAt: string | null; fromEventId: string | null; fromSeq?: number | null; reason: string }) {
    if (typeof a.reason !== 'string' || a.reason.trim().length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a replay states its reason (at least 8 characters)'), 400);
    if ((a.fromCreatedAt === null) !== (a.fromEventId === null)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a replay point is (fromCreatedAt, fromEventId) together, a fromSeq, or none for the beginning'), 400);
    const fromSeq = a.fromSeq ?? null;
    if (fromSeq !== null && (a.fromCreatedAt !== null || !Number.isInteger(fromSeq) || fromSeq < 0)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'fromSeq is a non-negative integer and excludes (fromCreatedAt, fromEventId)'), 400);
    const out = await this.pipeline.write({ ...envelope, action: 'graph.subscription.replay', message_id: newId() }, actor, this.route(tenantId, domainId, 'graph.subscription.replay', 'SUB', subscriptionId), GraphCapability.subscriptions,
      async (cap) => {
        const rows = fromSeq !== null
          ? await cap.replaySubscriptionFromSeq({ subscriptionId, tenantId, domainId, fromSeq, reason: a.reason, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id })
          : await cap.replaySubscription({ subscriptionId, tenantId, domainId, fromCreatedAt: a.fromCreatedAt, fromEventId: a.fromEventId, reason: a.reason, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: rows, targetType: 'SUB', targetId: subscriptionId, targetVersion: '1', outboxEvent: null };
      });
    // The port reopened this subscription's deliveries after the point (and moved its cursor back); the reconciliation
    // re-drives them — and the rows it never received — as jobs scoped to this subscription alone (0064): one job kind,
    // no replay job racing a plain re-drive of the same event, no other subscription touched.
    const served = await this.dispatcher.reconcile('subscription replayed', true);
    const replayed = served.reDriven.filter((e) => e.tenantId === tenantId && e.domainId === domainId && e.subscriptionIds.includes(subscriptionId)).length;
    return { subscriptionId, replayed, events: out.result.map((r) => r.event_id), receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  async status(cap: GraphReads, tenantId: string, domainId: string) {
    const subscriptions = (await cap.readSubscriptions().selectAll().orderBy('created_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const deliveries = (await cap.readSubscriptionDeliveries().selectAll().orderBy('last_delivered_at' as never, 'desc').limit(100).execute()) as Array<Record<string, unknown>>;
    const checks = (await cap.readRetrievalChecks().selectAll().orderBy('checked_at' as never, 'desc').limit(20).execute()) as Array<Record<string, unknown>>;
    const proposals = (await cap.readMappingReconciliations().selectAll().orderBy('proposed_at' as never, 'desc').limit(100).execute()) as Array<Record<string, unknown>>;
    // Execution-state telemetry (AU-MEM-0041, 0064): the recent deliveries, and EVERY delivery in a failure state (its own query: an
    // open refusal never ages out of a window of the most recent rows).
    const telemetry = (await cap.readSubscriptionTelemetry().selectAll().orderBy('last_delivered_at' as never, 'desc').limit(100).execute()) as Array<Record<string, unknown>>;
    const open = (await cap.readSubscriptionTelemetry().selectAll().where('state' as never, 'in', ['unresolved', 'failed', 'refused'] as never).orderBy('last_delivered_at' as never, 'desc').limit(500).execute()) as Array<Record<string, unknown>>;
    const name = redisName(subscriptionQueueNameFor(tenantId, domainId));
    return {
      consumers: CONSUMER_KINDS.map((k) => ({ kind: k, version: CONSUMER_VERSION, codeDigest: consumerCodeDigest(k), registeredInThisProcess: this.dispatcher.registeredKinds().includes(k) })),
      subscriptions, deliveries, retrieval_checks: checks, mapping_reconciliations: proposals,
      telemetry: { deliveries: telemetry, open_failure_states: open.map((t) => ({ event_id: t['event_id'], consumer_kind: t['consumer_kind'], state: t['state'], failure_class: t['failure_class'], disposition: t['disposition'], unresolved_since: t['unresolved_since'], items_unresolved: t['items_unresolved'], retries: t['retries'] })) },
      runtime: { scheduler_enabled: this.scheduler.enabled, worker_running: this.scheduler.runningWorkers().includes(name), redis_queue: name,
                 last_reconciliation: this.dispatcher.lastReconciliation(), last_failure: this.dispatcher.lastFailureSeen() },
    };
  }
}

function clamp(v: unknown, dflt: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return dflt;
  return Math.min(Math.floor(v), dflt);
}
