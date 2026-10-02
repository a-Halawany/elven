/**
 * The Risk and Opportunity API — CP-6 B32 (0089 §R; F-P4-13: WS-09, UX-35, PR-27/PR-28, OBJ-22/-23, JRN-08/-09). The Prediction API's own
 * prefix (…/prediction/exposures/*); a controller of its own in the prediction module so the stage's other parts' routes and these never
 * touch the same file.
 *
 * The rules of the Prediction API hold: a route returns the state the SERVER committed with its receipt; an absent or denied object answers
 * as absent; every answer that depends on an instant carries it. Three are this workspace's own:
 *   A RISK AND AN OPPORTUNITY ARE ONE OBJECT. The RSK is declared through the Strategy Graph (its rests_on are its drivers); this API
 *   registers it with its polarity, category and owner, and keeps its CHANGING ASSESSMENT beside it — the same routes for both polarities.
 *   AI ESTIMATES, A PERSON DECIDES. The owner accepts an assessment (the exact version, by its digest, after the consequence preview); an
 *   opportunity sponsor sponsors; the Risk and Opportunity Agents only propose — their attempts to accept or sponsor are refused at the PDP.
 *   AN EFFECT OUTSIDE THIS MODULE IS ITS OWN GOVERNED WRITE. The appetite breach is routed to the warning intake under
 *   prediction.exposure.route; the decision a response opens is a DEC declared under graph.strategy.declare and a package declared under
 *   decision.package.declare, each audited as itself; a step that fails leaves what committed standing and says how to resume.
 * NAMING: the audit rows carry objectType `RSK` — the retention signing-key routes use the same type string; the ACTION tells them apart.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { GraphCapability } from '../../graph/graph.capabilities.js';
import { StrategyService, validateStrategy } from '../../graph/strategy/strategy.service.js';
import { ImpactService } from '../../graph/strategy/impact.service.js';
import { graphChangedEvent } from '../../graph/subscriptions/change-events.js';
import { EMPTY_REACH, type ReachedObjects } from '../../graph/subscriptions/graph-change.js';
import { DecisionCapability } from '../../decision/decision.capabilities.js';
import { PackageService, validatePackageIntake } from '../../decision/packages/package.service.js';
import { ExposuresCapability } from './exposures.capabilities.js';
import {
  ExposuresService, validateAccept, validateAggregate, validateAppetite, validateAssess, validateClose, validateControl, validateCorrelation, validateHypothesis,
  validateOpenDecision, validateReason, validateRegister, validateSponsor, validateTaxonomy, type DecisionIntake,
} from './exposures.service.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
/** A path id that is not a uuid is an object that does not exist here (404), not a malformed request. */
const idOr404 = (id: string, what: string, correlationId: string): string => {
  if (!UUID.test(id)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `no such ${what} in this domain`), 404);
  return id.toLowerCase();
};
const versionOf = (v: string, correlationId: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such exposure version in this domain'), 404);
  return n;
};
const why = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : e instanceof Error ? e.message : String(e));

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction')
export class ExposuresController {
  constructor(private readonly pipeline: PipelineService, private readonly exposures: ExposuresService, private readonly strategy: StrategyService,
              private readonly impact: ImpactService, private readonly packages: PackageService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  /** A further governed write of the same request: its own action, message and target — audited as itself. */
  private chained(envelope: Envelope, action: string, objectType: string, objectId: string | null): Envelope {
    return { ...envelope, action, message_id: newId(), object_type: objectType, object_id: objectId } as Envelope;
  }

  // ───────────────────────── the static routes FIRST (a path id never shadows them) ─────────────────────────
  @Post('/exposures/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.read', 'RSK', null), ExposuresCapability.read,
      async (cap) => this.exposures.register(cap));
    return { ...out.result, at: new Date().toISOString(), receipt: receipt(out) };
  }

  @Post('/exposures/priority')
  async priority(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.read', 'RSK', null), ExposuresCapability.read,
      async (cap) => this.exposures.priority(cap));
    return { priority: out.result, at: new Date().toISOString(), receipt: receipt(out) };
  }

  /** The risk and opportunity branch of the health input contract (0089 §0), as of an instant (default now). */
  @Post('/exposures/health-inputs')
  async healthInputs(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { at?: string } }) {
    const { envelope, principal } = ctx(req);
    // B34 (0090 §I): no instant named → the DATABASE's now (read inside the call), never the host's clock
    const at = body.payload?.at ?? null;
    if (at !== null && Number.isNaN(new Date(at).getTime())) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'at is an instant'), 422);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.read', 'RSK', null), ExposuresCapability.read,
      async (cap, scope) => this.exposures.health(cap, scope.tenantId as string, scope.domainId as string, at === null ? await cap.dbNow() : new Date(at).toISOString()));
    return { health: out.result, receipt: receipt(out) };
  }

  @Post('/exposures/taxonomy/get')
  async getTaxonomy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.read', 'RSK', null), ExposuresCapability.read,
      async (cap) => this.exposures.taxonomy(cap));
    return { taxonomy: out.result, receipt: receipt(out) };
  }

  @Post('/exposures/taxonomy/publish')
  async publishTaxonomy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateTaxonomy(body.payload ?? {}, envelope.correlation_id);
    const taxonomyId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.taxonomy.publish', 'RSK', null), ExposuresCapability.taxonomy,
      async (cap, scope) => ({ result: await cap.publishTaxonomy({ taxonomyId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: null, targetVersion: null, outboxEvent: null }));
    return { taxonomy: out.result, receipt: receipt(out) };
  }

  @Post('/exposures/appetites/approve')
  async approveAppetite(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateAppetite(body.payload ?? {}, envelope.correlation_id);
    const appetiteId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.appetite.approve', 'RSK', null), ExposuresCapability.appetite,
      async (cap, scope) => ({ result: await cap.approveAppetite({ appetiteId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: null, targetVersion: null, outboxEvent: null }));
    return { appetite: out.result, receipt: receipt(out) };
  }

  @Post('/exposures/register')
  async register(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRegister(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.register', 'RSK', intake.exposureId), ExposuresCapability.register,
      async (cap, scope) => ({ result: await cap.register({ ...intake, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: intake.exposureId, targetVersion: '0', outboxEvent: null }));
    return { exposure: out.result, receipt: receipt(out) };
  }

  @Post('/exposures/correlations/declare')
  async declareCorrelation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateCorrelation(body.payload ?? {}, envelope.correlation_id);
    const rowId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.correlation.declare', 'RSK', intake.a), ExposuresCapability.correlation,
      async (cap, scope) => ({ result: await cap.declareCorrelation({ rowId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: intake.a, targetVersion: null, outboxEvent: null }));
    return { correlation: out.result, receipt: receipt(out) };
  }

  /** A roll-up: refused whole (409, every reason named) when a member is unowned, unaccepted, contested, stale or closed. */
  @Post('/exposures/aggregate')
  async aggregate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateAggregate(body.payload ?? {}, envelope.correlation_id);
    const aggregationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.aggregate', 'RSK', null), ExposuresCapability.aggregate,
      async (cap, scope) => ({ result: await cap.aggregate({ aggregationId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, members: intake.members, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: null, targetVersion: null, outboxEvent: null }));
    return { aggregation: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── one exposure ─────────────────────────
  @Post('/exposures/:exposureId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.read', 'RSK', id), ExposuresCapability.read,
      async (cap) => this.exposures.get(cap, id, envelope.correlation_id));
    return { ...out.result, at: new Date().toISOString(), receipt: receipt(out) };
  }

  @Post('/exposures/:exposureId/assess')
  async assess(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const intake = validateAssess(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.assess', 'RSK', id), ExposuresCapability.assess,
      async (cap, scope) => {
        const r = await cap.assess({ exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'RSK', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { assessment: out.result, receipt: receipt(out) };
  }

  /** OBJ-22's consequence preview: the version, its digest, the residual it would compute now, the appetite judged, what it would supersede. */
  @Post('/exposures/:exposureId/versions/:version/preview')
  async preview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Param('version') version: string) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.read', 'RSK', id), ExposuresCapability.read,
      async (cap) => this.exposures.preview(cap, id, v, envelope.correlation_id));
    return { preview: out.result, at: new Date().toISOString(), receipt: receipt(out) };
  }

  @Post('/exposures/:exposureId/versions/:version/contest')
  async contest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Param('version') version: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id, 'a challenge');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.contest', 'RSK', id), ExposuresCapability.contest,
      async (cap, scope) => ({ result: await cap.contest({ exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, version: v, reason, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: String(v), outboxEvent: null }));
    return { contest: out.result, receipt: receipt(out) };
  }

  /**
   * ACCEPT (OBJ-22): the owner accepts the EXACT version (its digest) — human-gated at the PDP, the owner checked by the port. When the
   * residual is outside appetite the breach is ROUTED in a second governed write (prediction.exposure.route → the warning intake); a routing
   * that fails leaves the acceptance standing and answers `routing: owed` with the reason — POST …/route routes it again.
   */
  @Post('/exposures/:exposureId/versions/:version/accept')
  async accept(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Param('version') version: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const intake = validateAccept(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.accept', 'RSK', id), ExposuresCapability.accept,
      async (cap, scope) => ({ result: await cap.accept({ exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, version: v, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: String(v), outboxEvent: null }));
    const routing = out.result['route_due'] === true ? await this.routeBreach(envelope, principal, tenantId, domainId, id) : { state: 'not_due' };
    return { acceptance: out.result, routing, receipt: receipt(out) };
  }

  @Post('/exposures/:exposureId/controls')
  async addControl(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const intake = validateControl(body.payload ?? {}, envelope.correlation_id);
    const controlId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.control.add', 'RSK', id), ExposuresCapability.control,
      async (cap, scope) => ({ result: await cap.addControl({ controlId, exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: null, outboxEvent: null }));
    const routing = out.result['route_due'] === true ? await this.routeBreach(envelope, principal, tenantId, domainId, id) : { state: 'not_due' };
    return { control: out.result, routing, receipt: receipt(out) };
  }

  /** ROUTE (again): the latest residual's breach submitted to the warning intake — idempotent on the residual (a repeat answers `repeated`). */
  @Post('/exposures/:exposureId/route')
  async route_(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.route', 'RSK', id), ExposuresCapability.route,
      async (cap, scope) => ({ result: await cap.route({ exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: null, outboxEvent: null }));
    return { routing: out.result, receipt: receipt(out) };
  }

  @Post('/exposures/:exposureId/hypotheses')
  async declareHypothesis(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const intake = validateHypothesis(body.payload ?? {}, envelope.correlation_id);
    const hypothesisId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.hypothesis.declare', 'RSK', id), ExposuresCapability.hypothesis,
      async (cap, scope) => ({ result: await cap.declareHypothesis({ hypothesisId, exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: null, outboxEvent: null }));
    return { hypothesis: out.result, receipt: receipt(out) };
  }

  /**
   * SPONSOR (OBJ-23): an opportunity sponsor sponsors the EXACT version (human-gated); the route then OPENS THE EVALUATION — a DEC resting on
   * the RSK (graph.strategy.declare), its package (decision.package.declare) and the response link (prediction.exposure.respond, kind
   * exploit), each its own governed write under the sponsor's session. An evaluation that cannot be opened leaves the sponsorship standing
   * and answers `evaluation: owed` with the reason and what to resume with (POST …/decisions/open).
   */
  @Post('/exposures/:exposureId/versions/:version/sponsor')
  async sponsor(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Param('version') version: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const title = await this.titleOf(envelope, principal, tenantId, domainId, id);
    const intake = validateSponsor(body.payload ?? {}, envelope.correlation_id, title);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.sponsor', 'RSK', id), ExposuresCapability.sponsor,
      async (cap, scope) => ({ result: await cap.sponsor({ exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, version: v, digest: intake.digest, terms: intake.terms, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: String(v), outboxEvent: null }));
    const objective = typeof intake.terms['objective_id'] === 'string' ? String(intake.terms['objective_id']) : null;
    let evaluation: Row;
    try {
      evaluation = { state: 'opened', ...(await this.openDecision(envelope, principal, tenantId, domainId, id, 'exploit', intake.decision, objective)) };
    } catch (e) {
      evaluation = { state: 'owed', reason: why(e), resume: (e as { resume?: Row }).resume ?? {}, how: 'POST …/exposures/:id/decisions/open with kind exploit and the ids already opened' };
    }
    return { sponsorship: out.result, evaluation, receipt: receipt(out) };
  }

  /**
   * OPEN A RESPONSE DECISION (JRN-08 mitigate / JRN-09 decide): a DEC resting on the RSK, its package, the link — three governed writes.
   * RESUME: a DEC or a package already opened is named in the payload (decision.decisionObjectId, decision.packageId) and not opened twice.
   * A step refused after an earlier one committed answers 409 naming what stands and how to resume.
   */
  @Post('/exposures/:exposureId/decisions/open')
  async openResponse(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const title = await this.titleOf(envelope, principal, tenantId, domainId, id);
    const intake = validateOpenDecision(body.payload ?? {}, envelope.correlation_id, title);
    try {
      return { response: await this.openDecision(envelope, principal, tenantId, domainId, id, intake.kind, intake.decision, null) };
    } catch (e) {
      const resume = (e as { resume?: Row }).resume;
      if (resume === undefined || Object.keys(resume).length === 0) throw e;
      throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id,
        `the response is partly opened (${Object.entries(resume).map(([k, x]) => `${k} ${String(x)}`).join(', ')} stand); the next step was refused: ${why(e)} — resume with decision.decisionObjectId / decision.packageId`), 409);
    }
  }

  @Post('/exposures/:exposureId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(exposureId, 'exposure', envelope.correlation_id);
    const intake = validateClose(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.exposure.close', 'RSK', id), ExposuresCapability.close,
      async (cap, scope) => ({ result: await cap.close({ exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: null, outboxEvent: null }));
    return { closure: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the chained writes ─────────────────────────
  private async titleOf(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, id: string): Promise<string> {
    const out = await this.pipeline.consequentialRead(this.chained({ ...envelope, side_effect_class: 'none' } as Envelope, 'prediction.exposure.read', 'RSK', id), principal,
      this.route(tenantId, domainId, 'prediction.exposure.read', 'RSK', id), ExposuresCapability.read,
      async (cap) => (await cap.readStrategy().select(['title'] as never).where('strategy_object_id' as never, '=', id as never).executeTakeFirst()) as { title: string } | undefined);
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no such exposure in this domain'), 404);
    return out.result.title;
  }

  /** The breach routed under prediction.exposure.route — its own write; a failure is answered as owed, never swallowed. */
  private async routeBreach(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, id: string): Promise<Row> {
    try {
      const r = await this.pipeline.write(this.chained(envelope, 'prediction.exposure.route', 'RSK', id), principal, this.route(tenantId, domainId, 'prediction.exposure.route', 'RSK', id), ExposuresCapability.route,
        async (cap, scope) => ({ result: await cap.route({ exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id }),
                                 targetType: 'RSK', targetId: id, targetVersion: null, outboxEvent: null }));
      return { state: 'routed', ...r.result, receipt: receipt(r) };
    } catch (e) {
      return { state: 'owed', reason: why(e), how: 'POST …/exposures/:id/route routes the breach again (idempotent on the residual)' };
    }
  }

  /** The DEC (resting on the RSK, and on the objective when one is named), its package, the response link — each its own governed write. */
  private async openDecision(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, exposureId: string, kind: string, d: DecisionIntake, objectiveId: string | null): Promise<Row> {
    const resume: Row = {};
    const fail = (e: unknown): never => { if (e !== null && typeof e === 'object') Object.assign(e, { resume: { ...resume } }); throw e; };
    let decisionObjectId = d.decisionObjectId; let packageId = d.packageId;
    const receipts: Row = {};
    if (decisionObjectId === null) {
      const decId = newId();
      const intake = validateStrategy({ objectType: 'DEC', title: d.title, statement: d.statement,
        restsOn: [{ kind: 'strategy', id: exposureId, rationale: `the decision answers the exposure (${kind})` },
                  ...(objectiveId === null ? [] : [{ kind: 'strategy' as const, id: objectiveId, rationale: 'the decision serves the objective the sponsor named' }])] } as never, envelope.correlation_id);
      try {
        const out = await this.pipeline.write(this.chained(envelope, 'graph.strategy.declare', 'DEC', decId), principal,
          { ...this.route(tenantId, domainId, 'graph.strategy.declare', 'DEC', decId), writableTargets: [decId] }, GraphCapability.strategy,
          async (cap, scope) => {
            const r = await this.strategy.declare(cap, scope, { objectId: decId, intake, owner: principal.principalId, actor: principal.principalId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'prediction' });
            // GraphChanged (B6) as the Strategy Graph's own declare route publishes it: the DEC is its own reach, its dependencies named.
            const own: ReachedObjects = { ...EMPTY_REACH, decisions: [decId] };
            const changed = await graphChangedEvent(cap, this.impact, {
              tenantId, domainId, kind: 'strategy.declared', identities: [],
              dependencies: intake.restsOn.map((x) => ({ dependent_object_id: decId, dependent_type: 'DEC', depends_on_kind: x.kind, depends_on_id: x.id })),
              reach: { reach: own }, cause: { action: 'graph.strategy.declare', actor: principal.principalId, target_type: 'DEC', target_id: decId },
            });
            return { result: r, targetType: 'DEC', targetId: decId, targetVersion: '1', outboxEvent: changed };
          });
        decisionObjectId = decId; resume['decisionObjectId'] = decId; receipts['decision'] = receipt(out);
      } catch (e) { fail(e); }
    } else resume['decisionObjectId'] = decisionObjectId;
    if (packageId === null) {
      const pkgId = newId();
      const intake = validatePackageIntake({ decisionObjectId: decisionObjectId as string, title: d.title, statement: d.statement, owner: principal.principalId }, envelope.correlation_id);
      try {
        const out = await this.pipeline.write(this.chained({ ...envelope, purpose_id: 'decision' } as Envelope, 'decision.package.declare', 'DPK', pkgId), principal,
          this.route(tenantId, domainId, 'decision.package.declare', 'DPK', pkgId), DecisionCapability.declare,
          async (cap, scope) => {
            const r = await this.packages.declare(cap, scope, intake, principal.principalId, envelope.correlation_id, pkgId);
            return { result: r, targetType: 'DPK', targetId: r.packageId, targetVersion: '0', outboxEvent: null };
          });
        packageId = pkgId; resume['packageId'] = pkgId; receipts['package'] = receipt(out);
      } catch (e) { fail(e); }
    } else resume['packageId'] = packageId;
    const responseId = newId();
    let link: Row = {};
    try {
      const out = await this.pipeline.write(this.chained(envelope, 'prediction.exposure.respond', 'RSK', exposureId), principal, this.route(tenantId, domainId, 'prediction.exposure.respond', 'RSK', exposureId), ExposuresCapability.respond,
        async (cap, scope) => ({ result: await cap.respond({ responseId, exposureId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, kind, decisionObjectId: decisionObjectId as string, packageId: packageId as string,
                                                              actor: principal.principalId, correlationId: envelope.correlation_id }),
                                 targetType: 'RSK', targetId: exposureId, targetVersion: null, outboxEvent: null }));
      link = out.result; receipts['response'] = receipt(out);
    } catch (e) { fail(e); }
    return { ...link, decision_object_id: decisionObjectId, package_id: packageId, receipts };
  }
}
