/**
 * Collection orchestration — the seam between the HTTP edge and the §5 lifecycle.
 *
 * It exists so the controller stays a controller. Three things happen here that
 * do not belong in either neighbour:
 *
 *  * CHOOSING THE CONNECTOR for a contract's declared kind, and refusing a kind
 *    outside cohort 1 rather than falling back to something that would silently
 *    produce differently-shaped evidence.
 *  * ACTING AS THE AGENT. A run is governed as the agent principal, not as the
 *    operator who pressed the button, because the evidence has to say which agent
 *    instance and which code digest produced it. The operator's identity is
 *    recorded as the trigger, in the run's own event.
 *  * SEQUENCING the multi-transaction operations (quarantine review, correction
 *    application, coverage evaluation) whose vault work must happen outside the
 *    transaction that records it.
 */
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import { errorBody } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { APP_DB, IDENTITY_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PrincipalsService } from '../../identity/principals.service.js';
import { PrincipalsCapability } from '../../shared/capabilities.js';
import { ObservationCapability, type AcquisitionWrites, type ObservationReads } from '../observation.capabilities.js';
import { AcquisitionLifecycle, type RunOutcome } from './lifecycle.service.js';
import { AgentSessionService } from '../agents/agent-session.service.js';
import { AgentsService, agentDisplayName, agentLoginName } from '../agents/agents.service.js';
import { SchedulerService, queueNameFor, schedulerIdFor, type CollectionJobPayload } from '../scheduling/scheduler.service.js';
import { QuarantineService } from '../quarantine/quarantine.service.js';
import { CorrectionsService, UNRESOLVED_PROPAGATION } from '../corrections/corrections.service.js';
import { CoverageService } from '../coverage/coverage.service.js';
import { CoverageFactsService } from '../coverage/facts.service.js';
import { RestConnector } from '../connectors/rest.connector.js';
import { RssConnector } from '../connectors/rss.connector.js';
import { UploadConnector, type UploadedFile } from '../connectors/upload.connector.js';
import type { Connector, RunBudgets } from '../connectors/sdk.js';

const EMPTY_PAYLOAD_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

/**
 * What applying a correction case commits: either the supersessions it produced,
 * or the rejection it recorded because no claimed object could be resolved to
 * evidence of this source. Both carry the claims that were rejected, so a
 * submitter always learns which of their ids were not accepted and why.
 */
interface CorrectionApplyResult {
  caseId: string;
  state: 'applied' | 'rejected';
  superseded?: Array<{ object_id: string; from: number; to: number }>;
  rejectedClaims: Array<{ object_id: string; reason: string }>;
  propagationScope?: { resolved: Array<{ object_id: string; from: number; to: number }>; unresolved: string };
}

interface ContractRow {
  source_id: string;
  contract_version: number;
  tenant_id: string;
  domain_id: string;
  source_key: string;
  connector_kind: string;
  authority_class: string;
  acquisition_mode: string;
  data_origin: string;
  lifecycle_state: string;
  classification_ceiling: string;
  residency: string;
  cadence_seconds: number | null;
  freshness_threshold_seconds: number | null;
  coverage_universe_version: string;
  contract: Record<string, unknown>;
  [k: string]: unknown;
}

@Injectable()
export class CollectionOrchestrator {
  private readonly log = new Logger('observation.orchestrator');

  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    @Inject(APP_DB) private readonly db: Db,
    @Inject(IDENTITY_DB) private readonly identityDb: Db,
    private readonly pipeline: PipelineService,
    private readonly lifecycle: AcquisitionLifecycle,
    private readonly agentSessions: AgentSessionService,
    private readonly agents: AgentsService,
    private readonly scheduler: SchedulerService,
    private readonly quarantine: QuarantineService,
    private readonly corrections: CorrectionsService,
    private readonly coverage: CoverageService,
    private readonly facts: CoverageFactsService,
    private readonly principals: PrincipalsService,
  ) {}

  /** Cohort 1 and nothing else. An unknown kind is refused, never approximated. */
  connectorFor(kind: string, files: UploadedFile[] = []): Connector {
    switch (kind) {
      case 'rest': return new RestConnector();
      case 'rss': return new RssConnector();
      case 'upload': return new UploadConnector(files);
      default:
        throw new HttpException(
          errorBody('EYE_REQ_001', newId(),
            `connector kind "${kind}" is outside Phase 1 cohort 1 (upload, rss, rest)`), 422);
    }
  }

  // ───────────────────────── running a collection ─────────────────────────

  async collectNow(a: {
    tenantId: string; domainId: string; sourceId: string; contractVersion: number;
    correlationId: string; purposeId: string; triggeredBy: string;
    files?: UploadedFile[];
  }): Promise<RunOutcome & { triggeredBy: string }> {
    const contract = await this.contract(a.sourceId, a.contractVersion);
    if (contract === null) {
      return {
        runId: 'none', state: 'failed', admitted: 0, quarantined: 0, noop: 0,
        reason: 'no authorized source contract matches', triggeredBy: a.triggeredBy,
      };
    }
    const connector = this.connectorFor(contract.connector_kind, a.files ?? []);
    const agent = await this.agentRowFor(a.sourceId, connector);
    if (agent === null) {
      return {
        runId: 'none', state: 'failed', admitted: 0, quarantined: 0, noop: 0,
        reason: 'no active agent is registered for this source and connector version',
        triggeredBy: a.triggeredBy,
      };
    }

    // The run acts as the AGENT. Its session is minted from the registry at this
    // moment, so a revocation that landed while this request was in flight stops it.
    const principal = await this.agentSessions.openRunSession({
      agentId: agent.agent_id, tenantId: a.tenantId, domainId: a.domainId,
      agentVersion: agent.agent_version, codeDigest: agent.code_digest,
      correlationId: a.correlationId,
    });

    const outcome = await this.lifecycle.run({
      sourceId: a.sourceId, contractVersion: a.contractVersion,
      agentId: agent.agent_id, agentVersion: agent.agent_version,
      connector, principal, correlationId: a.correlationId, purposeId: a.purposeId,
    });
    return { ...outcome, triggeredBy: a.triggeredBy };
  }

  /** The queue handler. Identical path to `collectNow`, driven by a scheduler tick. */
  async handleScheduledJob(payload: CollectionJobPayload): Promise<void> {
    await this.collectNow({
      tenantId: payload.tenantId, domainId: payload.domainId,
      sourceId: payload.sourceId, contractVersion: payload.contractVersion,
      correlationId: payload.correlationId, purposeId: 'observation',
      triggeredBy: `scheduler:${payload.agentId}`,
    });
  }

  // ───────────────────────── agents ─────────────────────────

  /**
   * Provision an agent for a source: create its principal on the identity
   * authority, bind the collection_agent role, and register the instance. Three
   * governed operations because they touch three authorities — folding them into
   * one would mean the identity authority could write observation state.
   */
  async provisionAgent(a: {
    envelope: Envelope; principal: AuthenticatedPrincipal;
    tenantId: string; domainId: string; sourceId: string; connector: string;
    ownerPrincipalId: string;
  }): Promise<{ agent: { agentId: string; principalId: string }; receipt: { policyDecisionId: string; auditSeq: number } }> {
    const contract = await this.contractLatest(a.sourceId);
    if (contract === null) {
      throw new HttpException(
        errorBody('EYE_STA_001', a.envelope.correlation_id, 'no authorized source contract matches'), 404);
    }
    const connector = this.connectorFor(a.connector);
    const agentPrincipalId = newId();
    const agentId = newId();

    // 1. the principal, on the IDENTITY authority
    await this.pipeline.write(
      { ...a.envelope, action: 'identity.principal.create', message_id: newId() },
      a.principal,
      {
        scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'identity.principal.create', objectType: 'PRN', objectId: agentPrincipalId,
        authority: 'identity',
      },
      PrincipalsCapability.write,
      async (cap) => {
        await this.principals.createPrincipal(cap, {
          principalId: agentPrincipalId,
          correlationId: a.envelope.correlation_id,
          kind: 'agent',
          scope: 'DOMAIN',
          tenantId: a.tenantId,
          domainId: a.domainId,
          // The VERSION IS IN THE NAME (§11): a new version is a new principal,
          // so an agent's identity can never quietly change under its evidence.
          displayName: agentDisplayName('observation', connector.name, connector.version),
          loginName: agentLoginName(connector.name, connector.version, connector.codeDigest),
          roleCode: 'collection_agent',
        });
        return {
          result: { principalId: agentPrincipalId }, targetType: 'PRN',
          targetId: agentPrincipalId, targetVersion: '1', outboxEvent: null,
        };
      });

    // 2. the agent registration, on the COMMIT authority
    const budgets = budgetsOf(contract);
    const out = await this.pipeline.write(
      { ...a.envelope, action: 'observation.agent.register', message_id: newId() },
      a.principal,
      {
        scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'observation.agent.register', objectType: 'AGT', objectId: agentId,
      },
      ObservationCapability.registry,
      async (cap, scope) => {
        const r = await this.agents.register(
          cap, scope, a.envelope.correlation_id, agentPrincipalId,
          {
            agentKind: connector.kind === 'upload' ? 'collection' : 'observation',
            connector: connector.name,
            agentVersion: connector.version,
            codeDigest: connector.codeDigest,
            ownerPrincipalId: a.ownerPrincipalId,
            sourceId: a.sourceId,
            budgets,
          },
          agentId);
        return { result: r, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });

    return { agent: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  private async agentRowFor(sourceId: string, connector: Connector): Promise<{
    agent_id: string; agent_version: string; code_digest: string; principal_id: string;
  } | null> {
    const row = (await this.db
      .selectFrom('observation.agents' as never)
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .where('connector' as never, '=', connector.name as never)
      .where('agent_version' as never, '=', connector.version as never)
      .where('code_digest' as never, '=', connector.codeDigest as never)
      .where('status' as never, '=', 'active' as never)
      .executeTakeFirst()) as { agent_id: string; agent_version: string; code_digest: string; principal_id: string } | undefined;
    return row ?? null;
  }

  // ───────────────────────── scheduling ─────────────────────────

  /**
   * Keep the scheduler in step with the contract lifecycle. Called inside the
   * transition's own transaction, so a source cannot end up active-but-unscheduled
   * or scheduled-but-suspended.
   */
  async syncSchedule(
    cap: { upsertSchedulerEntry: (a: {
      sourceId: string; tenantId: string; domainId: string; contractVersion: number;
      schedulerId: string; queueName: string; cadenceSeconds: number; jitterSeconds: number;
      status: 'scheduled' | 'removed';
    }) => Promise<void> },
    scope: { tenantId: string | null; domainId: string | null },
    sourceId: string,
    contractVersion: number,
    target: string,
  ): Promise<void> {
    const tenantId = scope.tenantId as string;
    const domainId = scope.domainId as string;
    const contract = await this.contract(sourceId, contractVersion);
    if (contract === null) return;
    // An upload source is never polled: it has no endpoints and no cadence.
    if (contract.connector_kind === 'upload') return;

    const cadence = contract.cadence_seconds ?? this.cfg['eye.scheduler.min_interval_seconds'];
    if (target === 'active') {
      const payload: CollectionJobPayload = {
        tenantId, domainId, sourceId, contractVersion,
        agentId: 'resolved-at-execution', agentVersion: 'resolved-at-execution',
        connector: contract.connector_kind,
        correlationId: newId(),
        // Budgets travel with the job for observability; the AUTHORITATIVE budgets
        // are re-read from the contract at execution. A tampered payload cannot
        // widen them.
        budgets: budgetsOf(contract) as unknown as Record<string, number>,
      };
      const applied = await this.scheduler.schedule(tenantId, domainId, payload, cadence, 5);
      await cap.upsertSchedulerEntry({
        sourceId, tenantId, domainId, contractVersion,
        schedulerId: applied.schedulerId, queueName: applied.queueName,
        cadenceSeconds: applied.cadenceSeconds, jitterSeconds: 5, status: 'scheduled',
      });
    } else {
      await this.scheduler.unschedule(tenantId, domainId, sourceId);
      await cap.upsertSchedulerEntry({
        sourceId, tenantId, domainId, contractVersion,
        schedulerId: schedulerIdFor(tenantId, domainId, sourceId),
        queueName: queueNameFor(tenantId, domainId),
        cadenceSeconds: Math.max(cadence, 60), jitterSeconds: 5, status: 'removed',
      });
    }
  }

  // ───────────────────────── quarantine review ─────────────────────────

  async reviewQuarantine(a: {
    envelope: Envelope; principal: AuthenticatedPrincipal;
    tenantId: string; domainId: string; caseId: string;
    decision: 'release' | 'discard'; reason: string;
  }): Promise<Record<string, unknown>> {
    const caseRow = (await this.db
      .selectFrom('observation.quarantine_current' as never)
      .selectAll()
      .where('case_id' as never, '=', a.caseId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
    if (caseRow === undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', a.envelope.correlation_id, 'no authorized quarantine case matches'), 404);
    }
    const contract = await this.contract(
      String(caseRow['source_id']), Number(caseRow['contract_version']));
    if (contract === null) {
      throw new HttpException(
        errorBody('EYE_STA_001', a.envelope.correlation_id, 'no authorized source contract matches'), 404);
    }

    const route = {
      scope: 'DOMAIN' as const, tenantId: a.tenantId, domainId: a.domainId,
      action: 'observation.quarantine.review', objectType: 'QAR', objectId: a.caseId,
    };

    if (a.decision === 'discard') {
      const out = await this.pipeline.write(
        a.envelope, a.principal, route, ObservationCapability.acquisition,
        async (cap, scope) => {
          const r = await this.quarantine.reject(cap, scope, a.envelope.correlation_id, a.caseId, a.reason);
          return { result: r, targetType: 'QAR', targetId: a.caseId, targetVersion: '1', outboxEvent: null };
        });
      return { case: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
    }

    // A RELEASE takes the same shape as an admission: the candidate bytes are
    // created and digest-verified OUTSIDE the transaction that records them.
    const manifest = (await this.db
      .selectFrom('observation.blob_manifests' as never)
      .selectAll()
      .where('manifest_id' as never, '=', caseRow['manifest_id'] as never)
      .executeTakeFirst()) as { locator: string } | undefined;
    if (manifest === undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', a.envelope.correlation_id, 'the quarantined bytes are no longer retrievable'), 409);
    }
    const candidate = await this.quarantine.prepareRelease(
      { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId },
      { ...caseRow, locator: manifest.locator } as never);

    const out = await this.pipeline.write(
      a.envelope, a.principal, route, ObservationCapability.acquisition,
      async (cap, scope) => {
        const r = await this.quarantine.release(
          cap, scope, `principal:${a.principal.principalId}`, a.envelope.correlation_id,
          { ...caseRow, locator: manifest.locator } as never,
          a.reason, a.envelope.purpose_id ?? 'observation', candidate,
          {
            classification_ceiling: contract.classification_ceiling,
            residency: contract.residency,
            acquisition_mode: contract.acquisition_mode,
            authority_class: contract.authority_class,
            source_key: contract.source_key,
            data_origin: contract.data_origin,
            contract: contract.contract,
          });
        return {
          result: r, targetType: 'EVD', targetId: r.evdObjectId, targetVersion: '1',
          outboxEvent: {
            eventType: 'ObservationRecorded',
            payload: {
              evd_object_id: r.evdObjectId, source_id: contract.source_id,
              released_from_quarantine_case: a.caseId,
            },
          },
        };
      });
    return { case: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  // ───────────────────────── corrections ─────────────────────────

  async applyCorrection(a: {
    envelope: Envelope; principal: AuthenticatedPrincipal;
    tenantId: string; domainId: string; caseId: string;
    decision: 'apply' | 'reject'; affectedEvdIds: string[]; reason: string;
  }): Promise<Record<string, unknown>> {
    const caseRow = (await this.db
      .selectFrom('observation.correction_current' as never)
      .selectAll()
      .where('case_id' as never, '=', a.caseId as never)
      .executeTakeFirst()) as { source_id: string; kind: string; reason: string } | undefined;
    if (caseRow === undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', a.envelope.correlation_id, 'no authorized correction case matches'), 404);
    }
    const route = {
      scope: 'DOMAIN' as const, tenantId: a.tenantId, domainId: a.domainId,
      action: 'observation.correction.apply', objectType: 'COR', objectId: a.caseId,
    };

    if (a.decision === 'reject') {
      const out = await this.pipeline.write(
        a.envelope, a.principal, route, ObservationCapability.acquisition,
        async (cap, scope) => {
          const r = await this.corrections.reject(cap, scope, a.envelope.correlation_id, a.caseId, a.reason);
          return { result: r, targetType: 'COR', targetId: a.caseId, targetVersion: '1', outboxEvent: null };
        });
      return { correction: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
    }

    const out = await this.pipeline.write<CorrectionApplyResult, AcquisitionWrites>(
      a.envelope, a.principal, route, ObservationCapability.acquisition,
      async (cap, scope) => {
        // The submitter's claim is VERIFIED against what this domain holds for
        // this source. A correction naming objects it has no relationship to is
        // the spoofed-correction case, and those ids are reported as rejected
        // rather than quietly ignored.
        const { resolved, rejected } = await this.corrections.resolveAffected(
          cap, caseRow.source_id, a.affectedEvdIds);

        if (resolved.length === 0) {
          const r = await this.corrections.reject(
            cap, scope, a.envelope.correlation_id, a.caseId,
            `no claimed object could be resolved to evidence of this source: ${rejected.map((x) => x.reason).join('; ')}`);
          return {
            result: { ...r, rejectedClaims: rejected },
            targetType: 'COR', targetId: a.caseId, targetVersion: '1', outboxEvent: null,
          };
        }

        const priorRows = (await cap
          .readCanonicalObjects()
          .selectAll()
          .where('object_id' as never, 'in', resolved.map((r) => r.object_id) as never)
          .execute()) as Array<Record<string, unknown>>;
        const latest = new Map<string, Record<string, unknown>>();
        for (const row of priorRows) {
          const id = String(row['object_id']);
          const prev = latest.get(id);
          if (prev === undefined || Number(row['object_version']) > Number(prev['object_version'])) {
            latest.set(id, row);
          }
        }

        const r = await this.corrections.apply(
          cap, scope, `principal:${a.principal.principalId}`, a.envelope.correlation_id,
          a.caseId, caseRow.kind as 'correction' | 'withdrawal' | 'supersession',
          a.reason.length > 0 ? a.reason : caseRow.reason,
          resolved, [...latest.values()], a.envelope.purpose_id ?? 'observation');

        return {
          result: {
            ...r, rejectedClaims: rejected,
            // §10.2 in the RESPONSE as well as the record: we state what we
            // resolved and, in words, what we did not.
            propagationScope: { resolved: r.superseded, unresolved: UNRESOLVED_PROPAGATION },
          },
          targetType: 'COR', targetId: a.caseId, targetVersion: '1',
          outboxEvent: {
            eventType: 'CorrectionReceived',
            payload: {
              case_id: a.caseId, source_id: caseRow.source_id, kind: caseRow.kind,
              propagation_scope: { resolved: r.superseded, unresolved: UNRESOLVED_PROPAGATION },
            },
          },
        };
      });
    return { correction: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  // ───────────────────────── coverage ─────────────────────────

  async evaluateCoverage(a: {
    envelope: Envelope; principal: AuthenticatedPrincipal;
    tenantId: string; domainId: string; sourceId: string;
    windowStart: string | null; windowEnd: string | null; evaluatedAt: string | null;
  }): Promise<Record<string, unknown>> {
    const contract = await this.contractLatest(a.sourceId);
    if (contract === null) {
      throw new HttpException(
        errorBody('EYE_STA_001', a.envelope.correlation_id, 'no authorized source contract matches'), 404);
    }
    const ce = (contract.contract as {
      security_and_operations?: {
        coverage_expectations?: {
          universe_version?: string; denominator_derivation?: string;
          expected_items_per_window?: number | null;
          not_applicable_dimensions?: string[]; not_applicable_reason?: string | null;
        };
        freshness_expectation?: { threshold_seconds?: number; expected_interval?: string };
      };
    }).security_and_operations;

    // The evaluation instant is supplied or taken once, here, and then STORED on
    // every row. Nothing downstream reads a clock.
    const evaluatedAt = a.evaluatedAt ?? new Date().toISOString();
    const windowEnd = a.windowEnd ?? evaluatedAt;
    const windowStart = a.windowStart
      ?? new Date(Date.parse(windowEnd) - 30 * 24 * 3600 * 1000).toISOString();
    const bucketSeconds = intervalSeconds(ce?.freshness_expectation?.expected_interval ?? 'daily');

    const out = await this.pipeline.write(
      { ...a.envelope, action: 'observation.coverage.measure', message_id: newId() },
      a.principal,
      {
        scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId,
        action: 'observation.coverage.measure', objectType: 'SRC', objectId: a.sourceId,
      },
      ObservationCapability.acquisition,
      async (cap, scope) => {
        const facts = await this.facts.gather(cap, a.sourceId, windowStart, windowEnd, bucketSeconds);
        const input = {
          sourceId: a.sourceId,
          evaluatedAt, windowStart, windowEnd,
          universeVersion: ce?.coverage_expectations?.universe_version ?? contract.coverage_universe_version,
          expectedItems: ce?.coverage_expectations?.expected_items_per_window ?? null,
          denominatorDerivation: ce?.coverage_expectations?.denominator_derivation ?? 'not declared',
          notApplicableDimensions: ce?.coverage_expectations?.not_applicable_dimensions ?? [],
          notApplicableReason: ce?.coverage_expectations?.not_applicable_reason ?? null,
          freshnessThresholdSeconds: contract.freshness_threshold_seconds
            ?? ce?.freshness_expectation?.threshold_seconds ?? 86400,
        };
        const dims = this.coverage.compute(input, facts);
        const health = this.coverage.deriveHealth(dims, facts, input);
        const prior = await this.coverage.currentHealth(cap, a.sourceId);
        await this.coverage.record(
          cap, scope, a.envelope.correlation_id, input, dims, health, prior, facts.evidenceRefs);
        return {
          result: { evaluatedAt, window: { start: windowStart, end: windowEnd }, dimensions: dims, health, prior },
          targetType: 'SRC', targetId: a.sourceId, targetVersion: String(contract.contract_version),
          outboxEvent: prior === health.state ? null : {
            eventType: 'SourceHealthChanged',
            payload: {
              source_id: a.sourceId, prior_state: prior, new_state: health.state,
              evaluated_at: evaluatedAt, reason: health.reason, lag_class: health.lagClass,
              calc_version: 'coverage-calc@1.1.0',
              coverage_universe_version: input.universeVersion,
              evidence_refs: facts.evidenceRefs.slice(0, 20),
            },
          },
        };
      });
    return { coverage: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  // ───────────────────────── read helpers for the UI ─────────────────────────

  async overview(cap: ObservationReads): Promise<Record<string, unknown>> {
    const sources = (await cap.readSourceContracts().selectAll().limit(500).execute()) as ContractRow[];
    const health = new Map<string, string>();
    for (const s of sources) {
      const h = await this.coverage.currentHealth(cap, s.source_id);
      if (h !== null) health.set(s.source_id, h);
    }
    const openCases = (await cap
      .readQuarantine().selectAll().where('state' as never, '=', 'open' as never).limit(200).execute()
    ) as Array<Record<string, unknown>>;
    const openCorrections = (await cap
      .readCorrections().selectAll().where('state' as never, 'in', ['received', 'validated'] as never).limit(200).execute()
    ) as Array<Record<string, unknown>>;
    const evidence = (await cap
      .readCanonicalObjects().selectAll().where('object_type' as never, '=', 'EVD' as never).limit(5000).execute()
    ) as Array<{ payload: { acquisition_mode?: string; byte_length?: number } }>;

    /*
     * THE REPLAY/LIVE RATIO, MEASURED FROM THE STORED EVIDENCE — not from
     * configuration, and never from an unstored `now`. Both figures are reported:
     * by-object is the headline, by-bytes is beside it because one 9 MB file would
     * otherwise dominate and flatter the number.
     */
    let replayObjects = 0;
    let replayBytes = 0;
    let totalBytes = 0;
    for (const e of evidence) {
      const bytes = Number(e.payload?.byte_length ?? 0);
      totalBytes += bytes;
      if (e.payload?.acquisition_mode === 'replay') { replayObjects += 1; replayBytes += bytes; }
    }

    return {
      sources: sources.map((s) => ({
        source_id: s.source_id,
        contract_version: s.contract_version,
        source_key: s.source_key,
        name: s['name'],
        authority_class: s.authority_class,
        acquisition_mode: s.acquisition_mode,
        data_origin: s.data_origin,
        lifecycle_state: s.lifecycle_state,
        rights_state: s['rights_state'],
        connector_kind: s.connector_kind,
        // `unknown` is a VALUE here, never an absent key: a source we have not
        // measured is a fact about our coverage, and the UI must render it.
        health_state: health.get(s.source_id) ?? 'unknown',
      })),
      counts: {
        sources: sources.length,
        active: sources.filter((s) => s.lifecycle_state === 'active').length,
        draft: sources.filter((s) => s.lifecycle_state === 'draft').length,
        suspended: sources.filter((s) => s.lifecycle_state === 'suspended').length,
        evidenceObjects: evidence.length,
        openQuarantineCases: openCases.length,
        openCorrections: openCorrections.length,
        unconfirmedRights: sources.filter((s) => s['rights_state'] !== 'confirmed').length,
      },
      replayRatio: {
        byObject: evidence.length === 0 ? null : round2((replayObjects / evidence.length) * 100),
        byBytes: totalBytes === 0 ? null : round2((replayBytes / totalBytes) * 100),
        measuredFrom: 'stored EVD objects — recomputing it by replaying the stream reproduces the same value',
      },
      attention: [
        ...(openCases.length > 0 ? [{ kind: 'quarantine', count: openCases.length }] : []),
        ...(openCorrections.length > 0 ? [{ kind: 'corrections', count: openCorrections.length }] : []),
        ...sources.filter((s) => s['rights_state'] !== 'confirmed').map((s) => ({
          kind: 'unconfirmed_rights', source_id: s.source_id, source_key: s.source_key,
        })),
      ],
    };
  }

  async recentRuns(cap: ObservationReads, sourceId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap
      .readRuns().selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .orderBy('started_at' as never, 'desc').limit(25).execute()) as Array<Record<string, unknown>>;
  }

  async scheduleFor(cap: ObservationReads, sourceId: string): Promise<Record<string, unknown> | null> {
    const row = (await cap
      .readSchedulerEntries().selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  async runDetail(cap: ObservationReads, runId: string): Promise<Record<string, unknown>> {
    const run = (await cap
      .readRuns().selectAll().where('run_id' as never, '=', runId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
    const events = (await cap
      .readRunEvents().selectAll().where('run_id' as never, '=', runId as never)
      .orderBy('occurred_at' as never).limit(500).execute()) as Array<Record<string, unknown>>;
    return { run: run ?? null, events };
  }

  // ───────────────────────── internals ─────────────────────────

  private async contract(sourceId: string, contractVersion: number): Promise<ContractRow | null> {
    const row = (await this.db
      .selectFrom('observation.source_contracts_current' as never)
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .where('contract_version' as never, '=', contractVersion as never)
      .executeTakeFirst()) as ContractRow | undefined;
    return row ?? null;
  }

  private async contractLatest(sourceId: string): Promise<ContractRow | null> {
    const row = (await this.db
      .selectFrom('observation.source_contracts_current' as never)
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .orderBy('contract_version' as never, 'desc')
      .limit(1)
      .executeTakeFirst()) as ContractRow | undefined;
    return row ?? null;
  }
}

function budgetsOf(contract: ContractRow): RunBudgets {
  const b = (contract.contract as {
    security_and_operations?: { budgets?: Record<string, number> };
  }).security_and_operations?.budgets ?? {};
  return {
    maxRequestsPerRun: b['max_requests_per_run'] ?? 20,
    maxBytesPerRun: b['max_bytes_per_run'] ?? 32 * 1024 * 1024,
    maxConcurrency: b['max_concurrency'] ?? 1,
    timeoutMs: b['timeout_ms'] ?? 60_000,
    maxRetries: b['max_retries'] ?? 2,
  };
}

/** The contract's declared interval, as the bucket width coverage measures in. */
function intervalSeconds(expected: string): number | null {
  const s = expected.toLowerCase();
  if (s.includes('hour')) return 3600;
  if (s.includes('daily') || s.includes('day')) return 86_400;
  if (s.includes('week')) return 604_800;
  if (s.includes('month')) return 2_592_000;
  // An interval we cannot interpret yields NO bucket structure, and completeness
  // is then reported `unknown` rather than measured against an invented width.
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export { EMPTY_PAYLOAD_DIGEST };
