/**
 * Observation Operations API — the surface WS-02 renders.
 *
 * Every route runs the full governed pipeline: envelope, authentication, scope
 * resolution, PDP, and POL+AUD durable before any effect or any byte leaves. The
 * two rules that shape the shapes below:
 *
 *  * NO OPTIMISTIC RESPONSES. A route returns the state the SERVER committed,
 *    with its receipt (policy decision id + audit sequence). The UI renders that
 *    and nothing it predicted.
 *  * DENIED AND ABSENT LOOK THE SAME. A source, case or evidence object in
 *    another scope answers exactly as a non-existent one does, so a caller
 *    cannot use the API as an existence oracle.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../shared/correlation.js';
import { newId } from '../shared/ids.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { ObservationCapability } from './observation.capabilities.js';
import { SourcesService } from './sources/sources.service.js';
import { QuarantineService } from './quarantine/quarantine.service.js';
import { CorrectionsService, UNRESOLVED_PROPAGATION } from './corrections/corrections.service.js';
import { CoverageService } from './coverage/coverage.service.js';
import { CoverageFactsService } from './coverage/facts.service.js';
import { EvidenceService } from './vault/evidence.service.js';
import { AgentsService } from './agents/agents.service.js';
import { CollectionOrchestrator } from './acquisition/orchestrator.service.js';
import { SweeperService } from './sweeper/sweeper.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  }
  return { envelope, principal };
}

const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({
  policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq,
});

@Controller('/v1/tenants/:tenantId/domains/:domainId/observation')
export class ObservationController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly sources: SourcesService,
    private readonly quarantine: QuarantineService,
    private readonly corrections: CorrectionsService,
    private readonly coverage: CoverageService,
    private readonly facts: CoverageFactsService,
    private readonly evidence: EvidenceService,
    private readonly agents: AgentsService,
    private readonly orchestrator: CollectionOrchestrator,
    private readonly sweeper: SweeperService,
  ) {}

  // ───────────────────────── sources ─────────────────────────

  @Post('/sources/register')
  async registerSource(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { contract?: unknown; sourceId?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    /*
     * A NEW CONTRACT VERSION OF AN EXISTING SOURCE names the source it versions.
     *
     * Phase 1 minted a fresh source id on every registration, so a source could
     * never carry a second version through this route. Phase 4 needs exactly that
     * — ECB moves from a replay v1 to a live v2 with a declared backfill — and
     * the contract must say which version it supersedes. The port keeps one
     * active version per source; activating v2 requires superseding v1 first.
     */
    const versioning = typeof body.payload?.sourceId === 'string';
    const sourceId = versioning ? (body.payload?.sourceId as string) : newId();
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.source.register', objectType: 'SRC', objectId: sourceId,
    };
    if (body.payload?.contract === undefined) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'a source contract is required', 400);
    }
    if (versioning) {
      const c = body.payload?.contract as { source_key?: string; lifecycle?: { contract_version?: number; supersedes_version?: number | null } };
      const current = await this.pipeline.consequentialRead(
        { ...envelope, action: 'observation.read.sources', message_id: newId() }, principal,
        { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.sources', objectType: 'SRC', objectId: sourceId },
        ObservationCapability.read,
        async (cap) => (await cap.readSourceContracts().selectAll()
          .where('source_id' as never, '=', sourceId as never)
          .orderBy('contract_version' as never, 'desc')
          .executeTakeFirst()) as { source_key: string; contract_version: number } | undefined);
      const row = current.result;
      if (row === undefined) {
        await this.pipeline.rejectAuthenticatedRequest(
          envelope, principal, route, 'EYE-STA-001', 'no such source to version', 404);
      } else if (row.source_key !== c.source_key) {
        await this.pipeline.rejectAuthenticatedRequest(
          envelope, principal, route, 'EYE-REQ-001',
          'a new contract version must keep the source key of the source it versions', 400);
      } else if (c.lifecycle?.supersedes_version !== row.contract_version
                 || typeof c.lifecycle?.contract_version !== 'number'
                 || c.lifecycle.contract_version <= row.contract_version) {
        await this.pipeline.rejectAuthenticatedRequest(
          envelope, principal, route, 'EYE-REQ-001',
          `a new contract version must supersede the current version ${row.contract_version} and carry a higher contract_version`, 400);
      }
    }
    const out = await this.pipeline.write(
      envelope, principal, route, ObservationCapability.registry,
      async (cap, scope) => {
        const r = await this.sources.register(
          cap, scope, `principal:${principal.principalId}`, envelope.correlation_id,
          body.payload?.contract, sourceId);
        return {
          result: r, targetType: 'SRC', targetId: sourceId, targetVersion: String(r.contractVersion),
          outboxEvent: null,
        };
      });
    return { source: out.result, receipt: receipt(out) };
  }

  @Post('/sources/:sourceId/approve')
  async approveSource(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: { payload?: { contractVersion?: number; decision?: 'approve' | 'reject'; reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId,
    };
    const p = body.payload;
    if (typeof p?.contractVersion !== 'number' || (p.decision !== 'approve' && p.decision !== 'reject')) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'contractVersion and decision are required', 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, route, ObservationCapability.registry,
      async (cap, scope) => {
        const r = await this.sources.approve(
          cap, scope, envelope.correlation_id, sourceId,
          p?.contractVersion as number, p?.decision as 'approve' | 'reject', p?.reason ?? '');
        return {
          result: r, targetType: 'SRC', targetId: sourceId,
          targetVersion: String(p?.contractVersion), outboxEvent: null,
        };
      });
    return { source: out.result, receipt: receipt(out) };
  }

  @Post('/sources/:sourceId/transition')
  async transitionSource(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: { payload?: { contractVersion?: number; target?: string; reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId,
    };
    const p = body.payload;
    if (typeof p?.contractVersion !== 'number' || typeof p.target !== 'string') {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'contractVersion and target are required', 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, route, ObservationCapability.registry,
      async (cap, scope) => {
        const r = await this.sources.transition(
          cap, scope, envelope.correlation_id, sourceId,
          p?.contractVersion as number, p?.target as string, p?.reason ?? '');
        // Activation and suspension are exactly when the schedule changes. Doing it
        // inside the same governed operation means a source can never be active
        // without a schedule, or scheduled without being active.
        await this.orchestrator.syncSchedule(cap, scope, sourceId, p?.contractVersion as number, p?.target as string);
        return {
          result: r, targetType: 'SRC', targetId: sourceId,
          targetVersion: String(p?.contractVersion), outboxEvent: {
            eventType: 'SourceHealthChanged',
            payload: {
              source_id: sourceId, contract_version: p?.contractVersion,
              state: p?.target === 'suspended' ? 'suspended' : p?.target,
              reason: p?.reason ?? '',
            },
          },
        };
      });
    return { source: out.result, receipt: receipt(out) };
  }

  @Post('/sources/:sourceId/rights')
  async setRights(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: { payload?: { contractVersion?: number; rightsState?: string; evidence?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.source.rights', objectType: 'SRC', objectId: sourceId,
    };
    const p = body.payload;
    if (typeof p?.contractVersion !== 'number' || typeof p.rightsState !== 'string') {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'contractVersion and rightsState are required', 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, route, ObservationCapability.registry,
      async (cap, scope) => {
        const r = await this.sources.setRights(
          cap, scope, envelope.correlation_id, sourceId,
          p?.contractVersion as number, p?.rightsState as string, p?.evidence ?? '');
        return {
          result: r, targetType: 'SRC', targetId: sourceId,
          targetVersion: String(p?.contractVersion), outboxEvent: null,
        };
      });
    return { source: out.result, receipt: receipt(out) };
  }

  @Post('/sources/list')
  async listSources(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.sources', objectType: 'SRC', objectId: null },
      ObservationCapability.read,
      async (cap) => this.sources.list(cap, body.payload?.limit ?? 100));
    return { sources: out.result, receipt: receipt(out) };
  }

  @Post('/sources/:sourceId/get')
  async getSource(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('sourceId') sourceId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.sources', objectType: 'SRC', objectId: sourceId },
      ObservationCapability.read,
      async (cap) => ({
        source: await this.sources.get(cap, sourceId, envelope.correlation_id),
        approvalTrail: await this.sources.approvalTrail(cap, sourceId),
        agents: await this.agents.list(cap, sourceId),
        health: {
          state: await this.coverage.currentHealth(cap, sourceId),
          measurements: await this.coverage.latestMeasurements(cap, sourceId),
        },
        runs: await this.orchestrator.recentRuns(cap, sourceId),
        schedule: await this.orchestrator.scheduleFor(cap, sourceId),
      }));
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  // ───────────────────────── collection ─────────────────────────

  @Post('/sources/:sourceId/collect')
  async collect(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: { payload?: { contractVersion?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.run.trigger', objectType: 'RUN', objectId: null,
    };
    if (typeof body.payload?.contractVersion !== 'number') {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'contractVersion is required', 400);
    }
    // The RUN itself is governed as the AGENT, not as the operator who triggered
    // it: the evidence has to say which agent instance produced it.
    const outcome = await this.orchestrator.collectNow({
      tenantId, domainId, sourceId,
      contractVersion: body.payload?.contractVersion as number,
      correlationId: envelope.correlation_id,
      purposeId: envelope.purpose_id ?? 'observation',
      triggeredBy: `principal:${principal.principalId}`,
      triggerPrincipal: principal,
    });
    return { run: outcome };
  }

  @Post('/runs/:runId/get')
  async getRun(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('runId') runId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.runs', objectType: 'RUN', objectId: runId },
      ObservationCapability.read,
      async (cap) => this.orchestrator.runDetail(cap, runId));
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  // ───────────────────────── evidence ─────────────────────────

  @Post('/evidence/list')
  async listEvidence(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { sourceId?: string; limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.evidence', objectType: 'EVD', objectId: null },
      ObservationCapability.read,
      async (cap) => this.evidence.list(cap, body.payload?.sourceId ?? null, body.payload?.limit ?? 100));
    return { evidence: out.result, receipt: receipt(out) };
  }

  @Post('/evidence/:evdId/get')
  async getEvidence(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('evdId') evdId: string,
    @Body() body: { payload?: { knownAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.evidence', objectType: 'EVD', objectId: evdId },
      ObservationCapability.read,
      async (cap) => this.evidence.detail(cap, evdId, body.payload?.knownAt ?? null, envelope.correlation_id));
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  /**
   * Retrieve the ORIGINAL BYTES. A consequential read in the strongest sense:
   * POL and AUD are durable before a byte moves, the digest is re-verified on
   * this read, and the response is attachment-only — never inline-rendered.
   */
  @Post('/evidence/:evdId/download')
  async downloadEvidence(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('evdId') evdId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialReadEvidenced(
      envelope, principal,
      {
        scope: 'DOMAIN', tenantId, domainId,
        action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: evdId,
      },
      ObservationCapability.acquisition,
      async (cap, scope) => this.evidence.retrieve(
        cap, scope, `principal:${principal.principalId}`, evdId, envelope.correlation_id),
      // The AUDIT RECORD IS DERIVED FROM WHAT THE READ ACTUALLY FOUND, so a
      // corrupt or missing blob is recorded as the integrity failure it is rather
      // than as a successful request that happened to return an error body.
      (r) => ({
        outcome: r.integrity === 'verified' ? 'success' : 'failure',
        resultCode: r.integrity === 'verified' ? 'OK' : 'EYE-INT-001',
        metadata: { integrity: r.integrity, byte_length: r.byteLength, digest_verified: r.integrity === 'verified' },
      }));
    return {
      download: {
        filename: (out.result as { filename: string }).filename,
        contentType: 'application/octet-stream',
        contentDisposition: 'attachment',
        contentDigest: (out.result as { contentDigest: string }).contentDigest,
        byteLength: (out.result as { byteLength: number }).byteLength,
        base64: (out.result as { base64: string }).base64,
        integrity: (out.result as { integrity: string }).integrity,
      },
      receipt: receipt(out),
    };
  }

  // ───────────────────────── quarantine ─────────────────────────

  @Post('/quarantine/list')
  async listQuarantine(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { state?: string; limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.quarantine', objectType: 'QAR', objectId: null },
      ObservationCapability.read,
      async (cap) => this.quarantine.list(cap, body.payload?.state ?? null, body.payload?.limit ?? 100));
    return { cases: out.result, receipt: receipt(out) };
  }

  @Post('/quarantine/:caseId/get')
  async getQuarantineCase(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('caseId') caseId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.quarantine', objectType: 'QAR', objectId: caseId },
      ObservationCapability.read,
      async (cap) => ({
        case: await this.quarantine.get(cap, caseId),
        events: await this.quarantine.events(cap, caseId),
      }));
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  @Post('/quarantine/:caseId/review')
  async reviewQuarantine(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('caseId') caseId: string,
    @Body() body: { payload?: { decision?: 'release' | 'discard'; reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.quarantine.review', objectType: 'QAR', objectId: caseId,
    };
    const p = body.payload;
    if ((p?.decision !== 'release' && p?.decision !== 'discard') || typeof p.reason !== 'string' || p.reason.trim().length < 8) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001',
        'a decision (release | discard) and a reason of at least 8 characters are required', 400);
    }
    const result = await this.orchestrator.reviewQuarantine({
      envelope, principal, tenantId, domainId, caseId,
      decision: p?.decision as 'release' | 'discard',
      reason: p?.reason as string,
    });
    return result;
  }

  // ───────────────────────── health & coverage ─────────────────────────

  @Post('/sources/:sourceId/evaluate')
  async evaluateCoverage(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: { payload?: { windowStart?: string; windowEnd?: string; evaluatedAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.orchestrator.evaluateCoverage({
      envelope, principal, tenantId, domainId, sourceId,
      windowStart: body.payload?.windowStart ?? null,
      windowEnd: body.payload?.windowEnd ?? null,
      evaluatedAt: body.payload?.evaluatedAt ?? null,
    });
    return out;
  }

  @Post('/sources/:sourceId/health/replay')
  async replayHealth(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('sourceId') sourceId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.health', objectType: 'SRC', objectId: sourceId },
      ObservationCapability.read,
      async (cap) => {
        // Run the replay TWICE and compare. A timeline that differs between two
        // reads of the same stored stream is not deterministic, and saying so is
        // more useful than quietly returning the first answer.
        const a = await cap.replayHealth(tenantId, domainId, sourceId);
        const b = await cap.replayHealth(tenantId, domainId, sourceId);
        return { timeline: a, deterministic: JSON.stringify(a) === JSON.stringify(b) };
      });
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  // ───────────────────────── corrections ─────────────────────────

  @Post('/corrections/submit')
  async submitCorrection(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: {
      payload?: {
        sourceId?: string; kind?: 'correction' | 'withdrawal' | 'supersession';
        channel?: string; publisherRef?: string; reason?: string; affectedEvdIds?: string[];
      };
    },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.correction.receive', objectType: 'COR', objectId: null,
    };
    const p = body.payload;
    if (typeof p?.sourceId !== 'string' || typeof p.kind !== 'string' || typeof p.reason !== 'string') {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'sourceId, kind and reason are required', 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, route, ObservationCapability.acquisition,
      async (cap, scope) => {
        const r = await this.corrections.open(cap, scope, envelope.correlation_id, {
          sourceId: p?.sourceId as string,
          kind: p?.kind as 'correction' | 'withdrawal' | 'supersession',
          channel: p?.channel ?? 'operator',
          publisherRef: p?.publisherRef ?? null,
          reason: p?.reason as string,
          affectedEvdIds: p?.affectedEvdIds ?? [],
        });
        return {
          result: { ...r, propagationScope: { resolved: [], unresolved: UNRESOLVED_PROPAGATION } },
          targetType: 'COR', targetId: r.caseId, targetVersion: '1',
          outboxEvent: {
            eventType: 'CorrectionReceived',
            payload: {
              case_id: r.caseId, source_id: p?.sourceId, kind: p?.kind,
              propagation_scope: { resolved: [], unresolved: UNRESOLVED_PROPAGATION },
            },
          },
        };
      });
    return { correction: out.result, receipt: receipt(out) };
  }

  @Post('/corrections/:caseId/apply')
  async applyCorrection(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('caseId') caseId: string,
    @Body() body: { payload?: { decision?: 'apply' | 'reject'; affectedEvdIds?: string[]; reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.correction.apply', objectType: 'COR', objectId: caseId,
    };
    const p = body.payload;
    if (p?.decision !== 'apply' && p?.decision !== 'reject') {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'decision (apply | reject) is required', 400);
    }
    return this.orchestrator.applyCorrection({
      envelope, principal, tenantId, domainId, caseId,
      decision: p?.decision as 'apply' | 'reject',
      affectedEvdIds: p?.affectedEvdIds ?? [],
      reason: p?.reason ?? '',
    });
  }

  @Post('/corrections/list')
  async listCorrections(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.corrections', objectType: 'COR', objectId: null },
      ObservationCapability.read,
      async (cap) => this.corrections.list(cap, body.payload?.limit ?? 100));
    return { corrections: out.result, receipt: receipt(out) };
  }

  @Post('/corrections/:caseId/get')
  async getCorrection(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('caseId') caseId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.corrections', objectType: 'COR', objectId: caseId },
      ObservationCapability.read,
      async (cap) => ({
        case: await this.corrections.get(cap, caseId),
        events: await this.corrections.events(cap, caseId),
      }));
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  // ───────────────────────── overview, agents, operations ─────────────────────────

  @Post('/overview')
  async overview(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.overview', objectType: 'SRC', objectId: null },
      ObservationCapability.read,
      async (cap) => this.orchestrator.overview(cap));
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  @Post('/agents/register')
  async registerAgent(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { sourceId?: string; connector?: string; ownerPrincipalId?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.agent.register', objectType: 'AGT', objectId: null,
    };
    const p = body.payload;
    if (typeof p?.sourceId !== 'string' || typeof p.connector !== 'string') {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'sourceId and connector are required', 400);
    }
    return this.orchestrator.provisionAgent({
      envelope, principal, tenantId, domainId,
      sourceId: p?.sourceId as string, connector: p?.connector as string,
      ownerPrincipalId: p?.ownerPrincipalId ?? principal.principalId,
    });
  }

  @Post('/agents/:agentId/revoke')
  async revokeAgent(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('agentId') agentId: string,
    @Body() body: { payload?: { reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.agent.revoke', objectType: 'AGT', objectId: agentId },
      ObservationCapability.registry,
      async (cap, scope) => {
        const r = await this.agents.revoke(cap, scope, envelope.correlation_id, agentId, body.payload?.reason ?? '');
        return { result: r, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    return { agent: out.result, receipt: receipt(out) };
  }

  /** Orphan reconciliation, on demand. The scheduled sweep runs the same code. */
  @Post('/sweep')
  async sweep(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const report = await this.sweeper.sweep(
      principal, tenantId, domainId, envelope.correlation_id, envelope.purpose_id ?? 'observation');
    return { sweep: report };
  }

  /** A11: rebuild every projection from the event log and report any drift. */
  @Post('/projections/verify')
  async verifyProjections(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.projections', objectType: 'SRC', objectId: null },
      ObservationCapability.read,
      async (cap) => cap.rebuildProjections(tenantId, domainId));
    return { projections: out.result, receipt: receipt(out) };
  }
}
