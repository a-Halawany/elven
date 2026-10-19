/**
 * B50 §CI (migration 0120 §CI.5/§CI.8/§CI.9) — THE IMPACT TRIGGERS AND THEIR AUTOMATIC WALK; THE CLASSED PRODUCTS AS A READ.
 *
 * Seven things besides a correction can make a conclusion unsafe (V03-T-304, AI-29-005): a LEGAL REQUEST (privacy officer / record
 * authority), a MODEL INCIDENT (method steward), an ONTOLOGY CORRECTION (ontology steward), a DATA-QUALITY FINDING (data steward), a RIGHTS
 * CHANGE (a source's rights no longer confirmed), an INTEGRITY FAILURE (vault custody) and a HUMAN CHALLENGE. Each is the steward's act
 * through its own seeding port (graph.seed_<kind>: the role, the human, the object, the basis re-checked in the port) — and then THE WALK IS
 * THE DOMAIN'S PROPAGATION AGENT'S (0060), never an operator-only walk: right after the trigger commits, this service receives it under the
 * schedule capability, opens the agent's own session, and runs `graph.impact.propagate` through the ordinary pipeline as the agent —
 * ImpactService.propagate with the trigger's kind and object, the checkpoint (impact_trigger_begin / _done) inside the walk's transaction,
 * GraphChanged and DependencyInvalidated announced as the correction consumer announces them. A domain with no active agent, a refused grant
 * or a failed walk is RECORDED on the trigger with its reason (impact_trigger_fail) and stays visible; `reconcile` re-drives every unwalked
 * trigger (at startup when the scheduler runs, and on an operator's ask) — the walk itself is still the agent's.
 *
 * CONSTRUCTION. The trigger acts, the agent's walk and the reads are built and proven on fixtures (phase6-impact-b50); the demonstration's
 * data-quality finding is the act's (SYNTHETIC); nothing here is a real external integration.
 */
import { HttpException, Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody, type Envelope } from '@eye/contracts';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService, type WriteEffect } from '../../pipeline/pipeline.service.js';
import { SchedulerService } from '../../observation/scheduling/scheduler.service.js';
import { GraphCapability, type GraphReads, type ImpactTriggerKind } from '../graph.capabilities.js';
import { graphChangedEvent } from '../subscriptions/change-events.js';
import { B50_TRIGGER_KINDS, ImpactService, PROPAGATION_WALKER } from '../strategy/impact.service.js';
import { PropagationAgentSessionService, PropagationGrantRefused } from '../propagation/propagation-agent-session.service.js';

type Row = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each kind's object types and basis fields — the intake's early, plainly worded refusal; the port re-checks every one. */
export const TRIGGER_RULES: Record<ImpactTriggerKind, { types: string[]; basis: string[]; roles: string[] }> = {
  legal_request: { types: ['EVD', 'CLM'], basis: ['request_ref', 'legal_basis'], roles: ['privacy_officer', 'record_authority'] },
  model_incident: { types: ['FCT', 'SIM'], basis: ['method_ref', 'incident'], roles: ['method_steward'] },
  ontology_correction: { types: ['ENT', 'REL'], basis: ['ontology_version_id'], roles: ['ontology_steward'] },
  data_quality_finding: { types: ['EVD', 'CLM'], basis: ['dimension', 'finding'], roles: ['data_steward'] },
  rights_change: { types: ['EVD'], basis: ['source_id', 'rights_state'], roles: ['data_steward', 'privacy_officer', 'record_authority', 'collection_manager'] },
  integrity_failure: { types: ['EVD'], basis: ['manifest_id', 'failure'], roles: ['record_authority', 'data_steward'] },
  human_challenge: { types: ['CLM', 'ASM', 'WRN', 'FCT', 'ASU', 'EVT'], basis: ['statement'], roles: ['domain_admin', 'domain_analyst', 'domain_specialist', 'knowledge_owner', 'forecast_owner', 'risk_owner',
    'decision_owner', 'strategy_owner', 'data_steward', 'method_steward', 'ontology_steward', 'executive', 'collection_manager', 'extraction_manager', 'resolution_manager', 'record_authority', 'privacy_officer'] },
};

export interface TriggerIntake { objectType?: unknown; objectId?: unknown; reason?: unknown; basis?: unknown }
/** The intake, validated before anything is written (400 with the field named); the port is the boundary and checks it all again. */
export function validateTriggerIntake(kind: string, p: TriggerIntake): { kind: ImpactTriggerKind; objectType: string; objectId: string; reason: string; basis: Record<string, unknown> } | string {
  if (!(B50_TRIGGER_KINDS as readonly string[]).includes(kind)) return `${kind} is not an impact trigger kind (${B50_TRIGGER_KINDS.join(', ')})`;
  const rule = TRIGGER_RULES[kind as ImpactTriggerKind];
  if (typeof p.objectType !== 'string' || !rule.types.includes(p.objectType)) return `objectType: a ${kind.replace(/_/g, ' ')} names a ${rule.types.join(', ')}`;
  if (typeof p.objectId !== 'string' || !UUID_RE.test(p.objectId)) return 'objectId: the id of the object the trigger names';
  if (typeof p.reason !== 'string' || p.reason.trim().length < 8 || p.reason.length > 2000) return 'reason: a trigger states its reason (8 to 2000 characters)';
  if (p.basis === null || typeof p.basis !== 'object' || Array.isArray(p.basis)) return `basis: an object naming ${rule.basis.join(' and ')}`;
  const basis = p.basis as Record<string, unknown>;
  for (const k of rule.basis) if (typeof basis[k] !== 'string' || String(basis[k]).trim() === '') return `basis.${k} is required for a ${kind.replace(/_/g, ' ')}`;
  return { kind: kind as ImpactTriggerKind, objectType: p.objectType, objectId: p.objectId.toLowerCase(), reason: p.reason.trim(), basis };
}

export interface TriggerWalk {
  triggerId: string; state: 'walked' | 'failed' | 'skipped'; invalidationId: string | null; reason: string | null;
  agent: { agent_id: string; agent_version: string; code_digest: string } | null;
  truncated?: boolean; statement?: string;
}

/** The AffectedProduct contract (b50-seams) from a graph.affected_products / case_affected_products row. */
export function affectedProductOf(r: Row): Row {
  return {
    invalidationId: String(r['invalidation_id']), ref: String(r['product_ref']), objectType: String(r['object_type']), objectId: String(r['product_id']),
    version: r['product_version'] === null || r['product_version'] === undefined ? null : Number(r['product_version']),
    bucket: String(r['bucket']), class: String(r['class']), ruleVersion: String(r['rule_version']),
    owner: r['owner_principal_id'] === null || r['owner_principal_id'] === undefined ? null : String(r['owner_principal_id']),
    path: Array.isArray(r['path']) ? (r['path'] as unknown[]).map(String) : [],
    productKind: String(r['product_kind']), title: String(r['title']), reachedVia: String(r['reached_via']), hop: Number(r['hop']),
    facts: r['facts'] ?? {}, caseId: (r['case_id'] ?? r['correction_case_id'] ?? null) as string | null, recordedAt: r['recorded_at'] ?? null,
  };
}

@Injectable()
export class ImpactTriggersService implements OnApplicationBootstrap {
  private readonly log = new Logger('graph.impact-triggers');

  constructor(
    @Inject(COMMIT_DB) private readonly commitDb: Db,
    private readonly pipeline: PipelineService,
    private readonly scheduler: SchedulerService,
    private readonly impact: ImpactService,
    private readonly sessions: PropagationAgentSessionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.scheduler.enabled) return;   // the correction consumer's rule: no scheduler, no background walk (the trigger act still walks its own)
    try {
      const r = await this.reconcile();
      if (r.length > 0) this.log.log(`re-drove ${r.length} unwalked impact trigger(s)`);
    } catch (e) {
      this.log.error(`impact trigger reconciliation failed: ${((e as Error)?.message ?? String(e)).slice(0, 200)}`);
    }
  }

  /** The steward's act: the trigger recorded through its kind's port; then the agent walks it (the answer carries both). */
  async record(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, kind: string, intake: TriggerIntake) {
    const v = validateTriggerIntake(kind, intake);
    if (typeof v === 'string') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, v), 400);
    const triggerId = newId();
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: `graph.impact.trigger.${v.kind}`, objectType: 'ITR', objectId: triggerId }, GraphCapability.impactTrigger,
      async (cap): Promise<WriteEffect<Row>> => {
        const r = await cap.seedImpactTrigger({ kind: v.kind, triggerId, tenantId, domainId, objectType: v.objectType, objectId: v.objectId, reason: v.reason, basis: v.basis,
          actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'ITR', targetId: triggerId, targetVersion: '1', outboxEvent: null };
      });
    const walk = await this.walk(triggerId, tenantId, domainId);
    return { trigger: out.result, walk, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The deciding person closes a human challenge (never its opener; a knowledge owner or the domain administrator — the port's rule). */
  async close(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, triggerId: string, reason: unknown) {
    if (!UUID_RE.test(triggerId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'triggerId: the challenge to close'), 400);
    if (typeof reason !== 'string' || reason.trim().length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason: a closure states its reason (at least 8 characters)'), 400);
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'graph.impact.trigger.close', objectType: 'ITR', objectId: triggerId }, GraphCapability.impactTrigger,
      async (cap): Promise<WriteEffect<Row>> => ({ result: await cap.closeHumanChallenge({ triggerId, tenantId, domainId, reason: reason.trim(), actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                                                     targetType: 'ITR', targetId: triggerId, targetVersion: null, outboxEvent: null }));
    return { closed: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** Every unwalked trigger of a domain served by an agent, walked by that agent (a cold process's, or an operator's ask). */
  async reconcile(scope?: { tenantId: string; domainId: string }): Promise<TriggerWalk[]> {
    const due = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('impact trigger reconciliation', 60)`.execute(tx);
      return (await sql<{ trigger_id: string; tenant_id: string; domain_id: string }>`select trigger_id::text, tenant_id::text, domain_id::text from graph.impact_triggers_to_walk()`.execute(tx)).rows;
    });
    const out: TriggerWalk[] = [];
    for (const t of due) {
      if (scope !== undefined && (t.tenant_id !== scope.tenantId || t.domain_id !== scope.domainId)) continue;
      out.push(await this.walk(t.trigger_id, t.tenant_id, t.domain_id));
    }
    return out;
  }

  private async fail(triggerId: string, tenantId: string, domainId: string, reason: string, agent: TriggerWalk['agent']): Promise<TriggerWalk> {
    await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('impact trigger walk failed', 60)`.execute(tx);
      await sql`select graph.impact_trigger_fail(${triggerId}::uuid, ${tenantId}::uuid, ${domainId}::uuid, ${reason})`.execute(tx);
    });
    this.log.warn(`impact trigger ${triggerId.slice(0, 8)}: automatic walk failed: ${reason}`);
    return { triggerId, state: 'failed', invalidationId: null, reason, agent };
  }

  /** The envelope the agent's governed walk needs. Built server-side; never client-supplied (the correction consumer's). */
  private env(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, objectId: string, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`,
      purpose_id: 'graph', action: 'graph.impact.propagate', side_effect_class: 'reversible', consequence_class: 'C2',
      object_type: 'INV', object_id: objectId, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: 'graph-impact-trigger-walk',
    } as unknown as Envelope;
  }

  /** ONE trigger walked by the domain's propagation agent — recorded, never thrown: a governance answer or a fault both land on the trigger. */
  async walk(triggerId: string, tenantId: string, domainId: string): Promise<TriggerWalk> {
    const correlationId = newId();
    const rec = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('impact trigger received', 60)`.execute(tx);
      return (await sql<{ r: Row }>`select graph.impact_trigger_receive(${triggerId}::uuid, ${tenantId}::uuid, ${domainId}::uuid, ${correlationId}::uuid) as r`.execute(tx)).rows[0]?.r ?? {};
    });
    const agentRow = rec['agent'] as { agent_id: string; principal_id: string; agent_version: string; code_digest: string } | null;
    const agent = agentRow === null || agentRow === undefined ? null : { agent_id: agentRow.agent_id, agent_version: agentRow.agent_version, code_digest: agentRow.code_digest };
    if (rec['state'] === 'walked') return { triggerId, state: 'skipped', invalidationId: String(rec['invalidation_id']), reason: 'already walked', agent };
    if (agent === null) return this.fail(triggerId, tenantId, domainId, 'no active propagation agent is registered in this domain; the trigger waits and is walked when one is', null);
    if (agent.agent_version !== PROPAGATION_WALKER.version || agent.code_digest !== PROPAGATION_WALKER.codeDigest) {
      return this.fail(triggerId, tenantId, domainId, `the domain's propagation agent is registered for walker ${agent.agent_version} (${agent.code_digest.slice(0, 12)}…), not ${PROPAGATION_WALKER.version} (${PROPAGATION_WALKER.codeDigest.slice(0, 12)}…); re-register the agent`, agent);
    }
    let principal: AuthenticatedPrincipal;
    try {
      principal = await this.sessions.openRunSession({ agentId: agent.agent_id, tenantId, domainId, correlationId });
    } catch (e) {
      return this.fail(triggerId, tenantId, domainId, e instanceof PropagationGrantRefused ? e.message : `fault opening the agent session: ${((e as Error)?.message ?? String(e)).slice(0, 200)}`, agent);
    }
    const kind = String(rec['trigger_kind']); const objectId = String(rec['object_id']); const objectType = String(rec['object_type']);
    try {
      const out = await this.pipeline.write(this.env(principal, tenantId, domainId, objectId, correlationId), principal,
        { scope: 'DOMAIN', tenantId, domainId, action: 'graph.impact.propagate', objectType: 'INV', objectId }, GraphCapability.impact,
        async (cap, scope): Promise<WriteEffect<{ skipped: boolean; invalidationId: string | null; truncated: boolean; statement: string | null }>> => {
          const begun = await cap.impactTriggerBegin({ triggerId, tenantId, domainId });
          if (!begun) return { result: { skipped: true, invalidationId: null, truncated: false, statement: null }, targetType: 'INV', targetId: null, targetVersion: null, outboxEvent: null };
          const r = await this.impact.propagate(cap, scope, { triggerKind: kind, triggerObjectId: objectId, triggerObjectType: objectType, correctionCaseId: null, actor: principal.principalId, correlationId });
          await cap.impactTriggerDone({ triggerId, tenantId, domainId, invalidationId: r.invalidationId });
          const changed = await graphChangedEvent(cap, this.impact, {
            tenantId, domainId, kind: 'invalidation.assessed', identities: [], reach: { walked: r }, invalidationId: r.invalidationId, correctionCaseId: null,
            cause: { action: 'graph.impact.propagate', actor: principal.principalId, target_type: 'INV', target_id: r.invalidationId },
          });
          return { result: { skipped: false, invalidationId: r.invalidationId, truncated: r.truncated, statement: r.statement }, targetType: 'INV', targetId: r.invalidationId, targetVersion: '1',
                   outboxEvent: { eventType: 'DependencyInvalidated',
                                  payload: { schema_version: 'v1', invalidation_id: r.invalidationId, trigger: objectId, assumptions: r.assumptions.length, objectives: r.objectives.length,
                                             automatic: true, event_id: triggerId, agent_id: agent.agent_id, agent_version: agent.agent_version, code_digest: agent.code_digest } },
                   outboxEvents: [changed] };
        });
      if (out.result.skipped) return { triggerId, state: 'skipped', invalidationId: null, reason: 'already walked', agent };
      return { triggerId, state: 'walked', invalidationId: out.result.invalidationId, reason: null, agent, truncated: out.result.truncated, statement: out.result.statement ?? '' };
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) return this.fail(triggerId, tenantId, domainId, 'authority refused: the agent\'s grant does not cover this walk', agent);
      return this.fail(triggerId, tenantId, domainId, `fault: ${((e as Error)?.message ?? String(e)).slice(0, 200)}`, agent);
    }
  }

  // ───────────────────────── reads (graph.read; the caller's RLS) ─────────────────────────

  async triggers(cap: GraphReads, limit = 100): Promise<Row[]> {
    return (await cap.readImpactTriggers().selectAll().orderBy('recorded_at' as never, 'desc').limit(Math.min(Math.max(limit, 1), 500)).execute()) as Row[];
  }

  async triggerEvents(cap: GraphReads, triggerId: string): Promise<Row[]> {
    return (await cap.readImpactTriggerEvents().selectAll().where('trigger_id' as never, '=', triggerId as never).orderBy('occurred_at' as never).execute()) as Row[];
  }

  /**
   * The classed products: of ONE assessed walk (invalidationId) or of a correction CASE (caseId: the latest walk of each root —
   * graph.case_affected_products, the read §CL closes against). Each in the AffectedProduct contract with the counts per class.
   */
  async affected(cap: GraphReads, a: { invalidationId?: string; caseId?: string }): Promise<{ products: Row[]; classes: Record<string, number>; ruleVersion: string | null }> {
    const rows = a.caseId !== undefined
      ? (await cap.readCaseAffectedProducts().selectAll().where('case_id' as never, '=', a.caseId as never).orderBy('hop' as never).orderBy('product_ref' as never).execute()) as Row[]
      : (await cap.readAffectedProducts().selectAll().where('invalidation_id' as never, '=', a.invalidationId as never).orderBy('hop' as never).orderBy('product_ref' as never).execute()) as Row[];
    const classes: Record<string, number> = {};
    for (const r of rows) classes[String(r['class'])] = (classes[String(r['class'])] ?? 0) + 1;
    return { products: rows.map(affectedProductOf), classes, ruleVersion: rows.length === 0 ? null : String(rows[0]!['rule_version']) };
  }

  async rules(cap: GraphReads): Promise<Row[]> {
    return (await cap.readAffectedClassRules().selectAll().orderBy('declared_at' as never).execute()) as Row[];
  }
}
