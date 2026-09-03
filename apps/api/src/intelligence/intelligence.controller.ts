/**
 * Intelligence API — the surface the Claims, Review, Methods and Gateway screens
 * render.
 *
 * Same two rules as Phase 1's controller, for the same reasons: a route returns
 * the state the SERVER committed with its receipt, never a prediction; and a
 * denied object answers exactly as an absent one does, so the API cannot be used
 * as an existence oracle.
 *
 * A third rule is Phase 2's own: EVERY response that describes extracted output
 * carries its `mode`. A reader must never have to infer whether a claim came from
 * a recorded response or from a model that actually executed.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { errorBody, jcsCanonicalize, type Envelope } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { IntelligenceCapability } from './intelligence.capabilities.js';
import { MethodsService, validateMethod } from './methods/methods.service.js';
import { ExtractionOrchestrator } from './extraction/orchestrator.service.js';
import { ReviewService, type ReviewDecision } from './review/review.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  }
  return { envelope, principal };
}

const digestOf = (v: unknown): string =>
  createHash('sha256').update(jcsCanonicalize(v), 'utf8').digest('hex');

const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({
  policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq,
});

/**
 * A read envelope derived from the request's own.
 *
 * The pipeline requires an envelope's action to equal its route's — a request that
 * says one thing and routes to another is exactly the confusion the check exists
 * to catch. So a route that must READ before it WRITES derives a second envelope
 * for the read rather than reusing the write's, keeping the correlation id (the
 * two are one operator action) and taking a fresh message id.
 */
function readEnvelope(e: Envelope, objectType: string, objectId: string | null): Envelope {
  return {
    ...e,
    message_id: newId(),
    action: 'intelligence.read',
    side_effect_class: 'none',
    object_type: objectType,
    object_id: objectId,
  } as Envelope;
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/intelligence')
export class IntelligenceController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly methods: MethodsService,
    private readonly extraction: ExtractionOrchestrator,
    private readonly review: ReviewService,
  ) {}

  // ───────────────────────── methods ─────────────────────────

  @Post('/methods/register')
  async registerMethod(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'intelligence.method.register', objectType: 'MTH', objectId: null,
    };
    const m = validateMethod((body.payload ?? {}) as never, envelope.correlation_id);
    const out = await this.pipeline.write(
      envelope, principal, route, IntelligenceCapability.methods,
      async (cap, scope) => {
        const r = await this.methods.register(
          cap, scope, envelope.correlation_id, principal.principalId, principal.principalId, m);
        return { result: r, targetType: 'MTH', targetId: r.methodId, targetVersion: '1',
                 outboxEvent: null };
      });
    return { method: out.result, receipt: receipt(out) };
  }

  @Post('/methods/:methodId/approve')
  async approveMethod(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('methodId') methodId: string,
    @Body() body: { payload?: { reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const reason = body.payload?.reason ?? '';
    if (reason.trim().length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'an approval needs a reason of at least 8 characters'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId,
        action: 'intelligence.method.approve', objectType: 'MTH', objectId: methodId },
      IntelligenceCapability.methods,
      async (cap, scope) => {
        const r = await this.methods.approve(
          cap, scope, envelope.correlation_id, methodId, principal.principalId, reason);
        return { result: r, targetType: 'MTH', targetId: methodId, targetVersion: '1',
                 outboxEvent: null };
      });
    return { method: out.result, receipt: receipt(out) };
  }

  @Post('/methods/:methodId/transition')
  async transitionMethod(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('methodId') methodId: string,
    @Body() body: { payload?: { target?: string; reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const target = body.payload?.target ?? '';
    const out = await this.pipeline.write(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId,
        action: 'intelligence.method.activate', objectType: 'MTH', objectId: methodId },
      IntelligenceCapability.methods,
      async (cap, scope) => {
        const r = await this.methods.transition(cap, scope, envelope.correlation_id,
          methodId, target, principal.principalId, body.payload?.reason ?? '');
        return { result: r, targetType: 'MTH', targetId: methodId, targetVersion: '1',
                 outboxEvent: null };
      });
    return { method: out.result, receipt: receipt(out) };
  }

  @Post('/methods/list')
  async listMethods(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'MTH', objectId: null },
      IntelligenceCapability.read,
      async (cap) => this.methods.list(cap, body.payload?.limit ?? 100));
    return { methods: out.result, receipt: receipt(out) };
  }

  @Post('/methods/:methodId/get')
  async getMethod(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('methodId') methodId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'MTH', objectId: methodId },
      IntelligenceCapability.read,
      async (cap) => ({
        method: await this.methods.get(cap, methodId),
        events: await this.methods.events(cap, methodId),
      }));
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── extraction ─────────────────────────

  @Post('/extract')
  async extract(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { methodId?: string; limit?: number; newAttempt?: boolean } },
  ) {
    const { envelope, principal } = ctx(req);
    const methodId = body.payload?.methodId;
    if (typeof methodId !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'methodId is required'), 400);
    }
    const outcome = await this.extraction.run({
      envelope, principal, tenantId, domainId, methodId,
      limit: Math.min(body.payload?.limit ?? 25, 200),
      // A NEW LIVE ATTEMPT IS DELIBERATE. Absent this flag a repeated extraction
      // identity is idempotent and the model is not called again.
      newAttempt: body.payload?.newAttempt === true,
    });
    return { extraction: outcome };
  }

  @Post('/runs/list')
  async listRuns(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'RUN', objectId: null },
      IntelligenceCapability.read,
      async (cap) => (await cap.readRuns().selectAll()
        .orderBy('started_at' as never, 'desc')
        .limit(Math.min(body.payload?.limit ?? 50, 200)).execute()) as unknown[]);
    return { runs: out.result, receipt: receipt(out) };
  }

  @Post('/gateway/calls')
  async gatewayCalls(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'GWC', objectId: null },
      IntelligenceCapability.read,
      async (cap) => ({
        calls: (await cap.readGatewayCalls().selectAll()
          .orderBy('occurred_at' as never, 'desc')
          .limit(Math.min(body.payload?.limit ?? 50, 200)).execute()) as unknown[],
        recorded: (await cap.readRecordedResponses()
          .select(['request_digest', 'response_digest', 'model_id', 'runtime_version',
                   'recorded_from', 'recorded_at'] as never)
          .orderBy('recorded_at' as never, 'desc').limit(50).execute()) as unknown[],
      }));
    return { ...out.result, receipt: receipt(out) };
  }

  /**
   * LOADING RECORDED RESPONSES.
   *
   * A recorded response is authored offline, keyed to the exact request digest it
   * answers, and loaded here under a governed action. It is stored with
   * `recorded_from: 'fixture'` and can never be mistaken for a live call: the
   * gateway records the MODE on every call, and a claim built from a recording
   * says `replay` in its own lineage.
   */
  @Post('/gateway/record')
  async recordResponses(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { recordings?: Array<{
      requestDigest?: string; response?: unknown; modelId?: string; runtimeVersion?: string;
    }> } },
  ) {
    const { envelope, principal } = ctx(req);
    const recordings = body.payload?.recordings ?? [];
    if (!Array.isArray(recordings) || recordings.length === 0 || recordings.length > 500) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'between 1 and 500 recordings are required'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.gateway.call',
        objectType: 'GWC', objectId: null },
      IntelligenceCapability.extraction,
      async (cap) => {
        let stored = 0; let existing = 0;
        for (const r of recordings) {
          if (typeof r.requestDigest !== 'string' || !/^[0-9a-f]{64}$/.test(r.requestDigest)
            || r.response === undefined || typeof r.modelId !== 'string'
            || typeof r.runtimeVersion !== 'string') {
            throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
              'each recording needs requestDigest, response, modelId and runtimeVersion'), 400);
          }
          const fresh = await cap.recordResponse({
            tenantId, domainId, requestDigest: r.requestDigest, response: r.response,
            responseDigest: digestOf(r.response), modelId: r.modelId,
            runtime: r.runtimeVersion, from: 'fixture',
            correlationId: envelope.correlation_id,
          });
          if (fresh) stored += 1; else existing += 1;
        }
        return { result: { stored, existing, total: recordings.length },
                 targetType: 'GWC', targetId: null, targetVersion: '1', outboxEvent: null };
      });
    return { recordings: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── claims ─────────────────────────

  @Post('/claims/list')
  async listClaims(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'CLM', objectId: null },
      IntelligenceCapability.read,
      async (cap) => {
        const rows = (await cap.readCanonicalObjects()
          .selectAll()
          .where('object_type' as never, 'in', ['ENT', 'EVT', 'CLM', 'REL', 'ASM'] as never)
          .orderBy('recorded_at' as never, 'desc')
          .limit(Math.min(body.payload?.limit ?? 100, 400))
          .execute()) as Array<Record<string, unknown>>;
        // CURRENT VERSION ONLY. A corrected claim shows once, at its latest
        // version; the prior version stays retrievable through known-at.
        const current = new Map<string, Record<string, unknown>>();
        for (const r of rows) {
          const id = String(r['object_id']);
          const prev = current.get(id);
          if (prev === undefined || Number(r['object_version']) > Number(prev['object_version'])) {
            current.set(id, r);
          }
        }
        return [...current.values()];
      });
    return { claims: out.result, receipt: receipt(out) };
  }

  @Post('/claims/:claimId/get')
  async getClaim(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('claimId') claimId: string,
    @Body() body: { payload?: { knownAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const knownAt = body.payload?.knownAt;
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'CLM', objectId: claimId },
      IntelligenceCapability.read,
      async (cap) => {
        let q = cap.readCanonicalObjects().selectAll()
          .where('object_id' as never, '=', claimId as never);
        // KNOWN-AT: no hindsight. The state as of an instant, not today's state.
        if (typeof knownAt === 'string') {
          q = q.where('recorded_at' as never, '<=', new Date(knownAt) as never);
        }
        const versions = (await q.orderBy('object_version' as never, 'asc')
          .execute()) as Array<Record<string, unknown>>;
        const lineage = (await cap.readLineage().selectAll()
          .where('claim_object_id' as never, '=', claimId as never)
          .orderBy('claim_version' as never, 'asc').execute()) as unknown[];
        const cases = (await cap.readReviewCases().selectAll()
          .where('claim_object_id' as never, '=', claimId as never).execute()) as unknown[];
        return { versions, current: versions[versions.length - 1] ?? null, lineage, cases };
      });
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── review ─────────────────────────

  @Post('/review/queue')
  async reviewQueue(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'REV', objectId: null },
      IntelligenceCapability.read,
      async (cap) => this.review.queue(cap, body.payload?.limit ?? 100));
    return { queue: out.result, receipt: receipt(out) };
  }

  @Post('/review/:caseId/decide')
  async decideReview(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('caseId') caseId: string,
    @Body() body: { payload?: {
      decision?: 'approve' | 'correct' | 'reject'; reason?: string;
      correctedValue?: Record<string, unknown>;
    } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (p.decision !== 'approve' && p.decision !== 'correct' && p.decision !== 'reject') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        "decision must be 'approve', 'correct' or 'reject'"), 400);
    }
    if (typeof p.reason !== 'string' || p.reason.trim().length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'a review decision needs a reason of at least 8 characters'), 400);
    }

    // THE OBJECT A CORRECTION WILL WRITE IS RESOLVED FIRST, in its own governed
    // read, so the write operation can DECLARE it. An id discovered inside the
    // handler could not have been declared, and the database refuses it.
    const resolved = await this.pipeline.consequentialRead(
      readEnvelope(envelope, 'REV', caseId), principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'REV', objectId: caseId },
      IntelligenceCapability.read,
      async (cap) => {
        const c = await this.review.get(cap, caseId);
        if (c === undefined) return { case: null, claim: null, lineage: null };
        const claimId = c['claim_object_id'] === null ? null : String(c['claim_object_id']);
        if (claimId === null) return { case: c, claim: null, lineage: null };
        const versions = (await cap.readCanonicalObjects().selectAll()
          .where('object_id' as never, '=', claimId as never)
          .orderBy('object_version' as never, 'desc').limit(1)
          .execute()) as Array<Record<string, unknown>>;
        const lineage = (await cap.readLineage().selectAll()
          .where('claim_object_id' as never, '=', claimId as never)
          .orderBy('claim_version' as never, 'desc').limit(1)
          .executeTakeFirst()) as Record<string, unknown> | undefined;
        return { case: c, claim: versions[0] ?? null, lineage: lineage ?? null };
      });
    if (resolved.result.case === null) {
      throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id,
        'no authorized review case matches'), 404);
    }

    const claimId = resolved.result.claim === null ? null : String(resolved.result.claim['object_id']);
    const out = await this.pipeline.write(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.review.decide',
        objectType: 'REV', objectId: caseId,
        ...(p.decision === 'correct' && claimId !== null ? { writableTargets: [claimId] } : {}) },
      IntelligenceCapability.review,
      async (cap, scope) => {
        const decision: ReviewDecision = {
          caseId, decision: p.decision as ReviewDecision['decision'], reason: p.reason as string,
          ...(p.correctedValue === undefined ? {}
            : { correctedValue: p.correctedValue as NonNullable<ReviewDecision['correctedValue']> }),
        };
        const r = await this.review.decide(cap, scope, {
          caseId, decision, decider: principal.principalId,
          correlationId: envelope.correlation_id,
          purposeId: envelope.purpose_id ?? 'intelligence',
          claim: resolved.result.claim, lineage: resolved.result.lineage,
        });
        return { result: r, targetType: 'REV', targetId: caseId, targetVersion: '1',
                 outboxEvent: { eventType: 'ClaimReviewed',
                                payload: { case_id: caseId, state: r.state,
                                           claim_object_id: claimId, new_version: r.newVersion } } };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── overview and projections ─────────────────────────

  @Post('/overview')
  async overview(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'CLM', objectId: null },
      IntelligenceCapability.read,
      async (cap) => {
        const methods = (await cap.readMethods().selectAll().execute()) as Array<Record<string, unknown>>;
        const runs = (await cap.readRuns().selectAll().execute()) as Array<Record<string, unknown>>;
        const cases = (await cap.readReviewCases().selectAll()) as unknown as Array<Record<string, unknown>>;
        const caseRows = (await cap.readReviewCases().selectAll().execute()) as Array<Record<string, unknown>>;
        void cases;
        const calls = (await cap.readGatewayCalls().selectAll().execute()) as Array<Record<string, unknown>>;
        const lineage = (await cap.readLineage().selectAll().execute()) as Array<Record<string, unknown>>;
        const byMode = (rows: Array<Record<string, unknown>>) => ({
          replay: rows.filter((r) => r['mode'] === 'replay').length,
          liveLocal: rows.filter((r) => r['mode'] === 'local-live').length,
        });
        return {
          methods: {
            total: methods.length,
            active: methods.filter((m) => m['lifecycle_state'] === 'active').length,
            draft: methods.filter((m) => m['lifecycle_state'] === 'draft').length,
          },
          runs: { total: runs.length, ...byMode(runs) },
          claims: { total: lineage.length, ...byMode(lineage) },
          review: {
            queued: caseRows.filter((c) => c['state'] === 'queued').length,
            abstentions: caseRows.filter((c) => c['queued_reason'] === 'abstained').length,
            decided: caseRows.filter((c) => c['state'] !== 'queued').length,
          },
          gateway: {
            calls: calls.length, ...byMode(calls),
            abstained: calls.filter((c) => c['outcome'] === 'abstained').length,
            refused: calls.filter((c) => c['outcome'] === 'refused').length,
            failed: calls.filter((c) => c['outcome'] === 'failed').length,
          },
        };
      });
    return { overview: out.result, receipt: receipt(out) };
  }

  @Post('/projections/verify')
  async verifyProjections(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'intelligence.read',
        objectType: 'CLM', objectId: null },
      IntelligenceCapability.read,
      async (cap) => cap.rebuildProjections());
    return { projections: out.result, receipt: receipt(out) };
  }
}
