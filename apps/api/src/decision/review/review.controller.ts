/**
 * THE HTTP SURFACE OF DECISION REVIEW — CP-6 B35 part `reopen` (migration 0101 §P). The decision module's envelope, capabilities and
 * receipts under /decisions/review/… of the domain (never DecisionController's routes): every write one governed write whose port asserts the
 * route's own action (EXACT PDP rules, the B35 reopen block; the reopen reuses decision.package.reopen and the replay decision.replay); every
 * read a consequential read under decision.review.read (the metrics under decision.review.metrics). The reopen announces DecisionReopened
 * from its own transaction, built by the same function the B18 route uses (the payload unchanged). Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ReplayService } from '../replay/replay.service.js';
import { decisionReopenedEvent } from '../decision-events.js';
import { ReviewCapability } from './review.capabilities.js';
import { assertUuid, validateCadence, validateCause, validateChange, validateLesson, validateOutcome, validateReplay, validateResolution, validateTerms, versionOf } from './review.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const READ = 'decision.review.read';
const notFound = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_STA_001', correlationId, text), 404); };
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const instantOrNull = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/decisions/review')
export class DecisionReviewController {
  constructor(private readonly pipeline: PipelineService, private readonly replays: ReplayService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** The domain's packages, its open reversion requests, its scenario sets with their review due — the page's index. */
  @Post('/index')
  async index(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'DPK', null), ReviewCapability.read,
      async (cap) => ({ at: await cap.now(), packages: await cap.packages(100), reversions: await cap.reversions({ state: null, limit: 100 }), sets: await cap.sets(100),
                        cited: await cap.citedRelevance({ tenantId, domainId }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** A PACKAGE's review: changes, reversion requests, assessments, terms, replays with their reasons, lessons, the ledger — and its metrics. */
  @Post('/packages/:packageId')
  async review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'DPK', packageId), ReviewCapability.read,
      async (cap) => ({ review: await cap.review(packageId), metrics: await cap.metrics(packageId) }));
    if (out.result.review === null) notFound(envelope.correlation_id, `review rejected (unknown_package): ${packageId} is not a package of this domain`);
    return { review: out.result.review, metrics: out.result.metrics, receipt: receipt(out) };
  }

  /** THE DECISION METRICS (ES-39-008) alone. */
  @Post('/packages/:packageId/metrics')
  async metrics(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.review.metrics', 'DPK', packageId), ReviewCapability.read,
      async (cap) => cap.metrics(packageId));
    if (out.result === null) notFound(envelope.correlation_id, `review rejected (unknown_package): ${packageId} is not a package of this domain`);
    return { metrics: out.result, receipt: receipt(out) };
  }

  /** RECORD A CHANGE OF CONDITIONS on a committed decision (a named change with its evidence). */
  @Post('/packages/:packageId/changes')
  async recordChange(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const ch = validateChange(body.payload ?? {}, envelope.correlation_id);
    const changeId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.review.change', 'DPK', packageId), ReviewCapability.change,
      async (cap) => {
        const r = await cap.recordChange({ changeId, tenantId, domainId, packageId, ...ch, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(r['committed_version']), outboxEvent: null };
      });
    return { change: out.result, receipt: receipt(out) };
  }

  /** REOPEN on a recorded cause — the six kinds (the B18 route keeps its three); DecisionReopened from this transaction, its payload unchanged. */
  @Post('/packages/:packageId/reopen')
  async reopen(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id, 'reopen');
    const p = body.payload ?? {};
    const cause = validateCause(p['cause'], envelope.correlation_id);
    const now = new Date().toISOString();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.package.reopen', 'DPK', packageId), ReviewCapability.reopen,
      async (cap) => {
        const head = await cap.packageHead(packageId);
        if (head === null) notFound(envelope.correlation_id, 'no authorized package matches');
        const r = await cap.reopen({ packageId, tenantId, domainId, cause, knownAt: instantOrNull(p['knownAt']), observedThrough: day(p['observedThrough']),
                                     actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(r['new_version']),
                 outboxEvent: decisionReopenedEvent({ reopened: r, packageId, decisionObjectId: head!.decision_object_id, actor: principal.principalId, occurredAt: now }) };
      });
    return { reopened: out.result, receipt: receipt(out) };
  }

  /** THE REVERSION REQUESTS of the domain (open first; optionally one state). */
  @Post('/reversions/list')
  async reversions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const s = body.payload?.['state'];
    const state = s === 'open' || s === 'reversioned' || s === 'declined' ? s : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SCN', null), ReviewCapability.read,
      async (cap) => cap.reversions({ state, limit: 200 }));
    return { reversions: out.result, receipt: receipt(out) };
  }

  /** RESOLVE a reversion request — the scenario's owner: reversioned (the scenario re-versioned) or declined with a reason. */
  @Post('/reversions/:requestId/resolve')
  async resolveReversion(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requestId') requestId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(requestId, 'request', envelope.correlation_id);
    const r0 = validateResolution(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.review.reversion', 'SCN', requestId), ReviewCapability.reversion,
      async (cap) => {
        const r = await cap.resolveReversion({ requestId, tenantId, domainId, ...r0, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCN', targetId: String(r['scenario_id']), targetVersion: r['resolved_version'] === null ? null : String(r['resolved_version']), outboxEvent: null };
      });
    return { reversion: out.result, receipt: receipt(out) };
  }

  /** ASSESS the outcome of a committed version (four separate fields; a revision names the assessment it read). */
  @Post('/packages/:packageId/versions/:version/outcome-assessments')
  async assess(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const a0 = validateOutcome(body.payload ?? {}, envelope.correlation_id);
    const assessmentId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.review.outcome', 'DPK', packageId), ReviewCapability.outcome,
      async (cap) => {
        const r = await cap.assessOutcome({ assessmentId, tenantId, domainId, packageId, version: v, ...a0, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { assessment: out.result, receipt: receipt(out) };
  }

  /** SET the review terms of a version (the owner): baseline, replay horizon, evidence standard. */
  @Post('/packages/:packageId/versions/:version/terms')
  async terms(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const t0 = validateTerms(body.payload ?? {}, envelope.correlation_id);
    const termsId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.review.terms', 'DPK', packageId), ReviewCapability.terms,
      async (cap) => {
        const r = await cap.setTerms({ termsId, tenantId, domainId, packageId, version: v, ...t0, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { terms: out.result, receipt: receipt(out) };
  }

  /** REPLAY a committed version WITH its reason: the decision replay (decision.replay, the replay service unchanged) and the initiator and reason
   *  beside it — one transaction. */
  @Post('/packages/:packageId/versions/:version/replay')
  async replay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const r0 = validateReplay(body.payload ?? {}, envelope.correlation_id);
    const replayId = newId();
    const out = await this.pipeline.write(envelope, principal, { ...this.route(tenantId, domainId, 'decision.replay', 'RPL', replayId), writableTargets: [replayId] }, ReviewCapability.replay,
      async (cap, scope) => {
        const rp = await this.replays.replay(cap.replay, scope, packageId, v, r0.asOf, principal, envelope.purpose_id ?? 'decision', envelope.correlation_id, replayId);
        const rq = await cap.recordReplayRequest({ replayId, tenantId, domainId, reason: r0.reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { replay: rp, request: rq }, targetType: 'RPL', targetId: replayId, targetVersion: '1', outboxEvent: null };
      });
    return { replay: out.result.replay, request: out.result.request, receipt: receipt(out) };
  }

  /** LINK a hypothesis or lesson — a memory record (memory.item.record) naming the decision — to an outcome assessment. */
  @Post('/assessments/:assessmentId/lessons')
  async lesson(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('assessmentId') assessmentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(assessmentId, 'assessment', envelope.correlation_id);
    const l0 = validateLesson(body.payload ?? {}, envelope.correlation_id);
    const lessonId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.review.lesson', 'MEM', l0.memoryItemId), ReviewCapability.lesson,
      async (cap) => {
        const r = await cap.linkLesson({ lessonId, tenantId, domainId, assessmentId, ...l0, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: String(r['package_id']), targetVersion: null, outboxEvent: null };
      });
    return { lesson: out.result, receipt: receipt(out) };
  }

  /** A SCENARIO SET's review status (the cadence, the due instant, the misses). */
  @Post('/sets/:setId')
  async setStatus(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SCS', setId), ReviewCapability.read, async (cap) => cap.setStatus(setId));
    if (out.result === null) notFound(envelope.correlation_id, `review rejected (unknown_set): ${setId} is not a scenario set of this domain`);
    return { set: out.result, receipt: receipt(out) };
  }

  /** SET a scenario set's review cadence (its owner or an administrator). */
  @Post('/sets/:setId/cadence')
  async setCadence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const c0 = validateCadence(body.payload ?? {}, envelope.correlation_id);
    const cadenceId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.cadence', 'SCS', setId), ReviewCapability.cadence,
      async (cap) => {
        const r = await cap.setCadence({ cadenceId, tenantId, domainId, setId, ...c0, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCS', targetId: setId, targetVersion: String(r['cadence_version']), outboxEvent: null };
      });
    return { cadence: out.result, receipt: receipt(out) };
  }

  /** CHECK the domain's set review cadences now (an operator's act beside the tick step `review-cadence`). */
  @Post('/cadence/sweep')
  async sweep(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.cadence', 'SCS', null), ReviewCapability.cadence,
      async (cap) => ({ result: await cap.sweep({ tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'SCS', targetId: null, targetVersion: null, outboxEvent: null }));
    return { sweep: out.result, receipt: receipt(out) };
  }

  /** SCORE the scenarios live packages cite outside every active set now (an operator's act beside the tick step `cited-scenario-relevance`). */
  @Post('/relevance/score')
  async score(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.relevance.score', 'SCN', null), ReviewCapability.relevance,
      async (cap) => ({ result: await cap.scoreCited({ tenantId, domainId, trigger: 'operator', actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'SCN', targetId: null, targetVersion: null, outboxEvent: null }));
    return { relevance: out.result, receipt: receipt(out) };
  }
}
