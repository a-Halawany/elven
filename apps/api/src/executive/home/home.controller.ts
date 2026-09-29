/**
 * THE EXECUTIVE HOME's routes — CP-6 B36 part `home` (0094 §H; F-P6-11), under /v1/tenants/:tenantId/domains/:domainId/home.
 *
 * Every read is a consequential read under executive.home.read (the reader's clearance is the ceiling the home composes under; the §0
 * context may lower it); every act is its own governed write with its own PDP action — executive.context.set (§0's port, this part's only
 * route), executive.cadence.open / .reset, executive.room.open, executive.agenda.set, executive.escalation.raise / .answer,
 * executive.search (the read AND its access-ledger row), executive.metrics.read. The port decides the person, the record and the rule;
 * the controller shapes the intake and answers what the port answered, with the receipt.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { clearanceOf } from '../../decision/clearance.js';
import { HomeCapability } from './home.capabilities.js';
import { HomeService, validateAgenda, validateContext, validateEscalate, validatePeriod, validateSearch, validateSubjectRoom } from './home.service.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/home')
export class HomeController {
  constructor(private readonly pipeline: PipelineService, private readonly home: HomeService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** THE HOME (WS-01): the seven sections under the reader's context, each with its as-of, count and limitations. */
  @Post('/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.home.read', 'HOM', null), HomeCapability.read,
      async (cap, scope) => this.home.home(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, principalId: principal.principalId,
                                                 ceiling: clearanceOf(principal, { tenantId: scope.tenantId as string, domainId: scope.domainId as string }), limit: body.payload?.limit }));
    return { home: out.result, receipt: receipt(out) };
  }

  /** THE CONTEXT SWITCHER (§0's port; CAP-EO-02): the organisation is the route's domain; the objective, the horizon, the scenario, the ceiling, the effective instant. */
  @Post('/context/set')
  async setContext(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateContext(body.payload ?? {}, envelope.correlation_id);
    const contextId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.context.set', 'CTX', contextId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.setContext(cap, { contextId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'CTX', targetId: contextId, targetVersion: '1', outboxEvent: null }));
    return { context: out.result, receipt: receipt(out) };
  }

  /** The switcher's choices: the objectives and the scenarios with their staleness, the horizons, the ceilings, the reader's current context. */
  @Post('/context/choices')
  async contextChoices(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.home.read', 'CTX', null), HomeCapability.read,
      async (cap, scope) => this.home.choices(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, principalId: principal.principalId }));
    return { choices: out.result, receipt: receipt(out) };
  }

  /** THE CADENCE opened (JRN-19): weekly | monthly | quarterly; one open per period. */
  @Post('/cadence/open')
  async openCadence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const period = validatePeriod(body.payload ?? {}, envelope.correlation_id);
    const cadenceId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.cadence.open', 'CAD', cadenceId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.openCadence(cap, { cadenceId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, period, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'CAD', targetId: cadenceId, targetVersion: '1', outboxEvent: null }));
    return { cadence: out.result, receipt: receipt(out) };
  }

  /** THE LOOP RESET (JRN-19): the open cadence closed with its closing record, the next opened; open board-class decisions need the executive's confirmReason. */
  @Post('/cadence/reset')
  async resetCadence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const period = validatePeriod(body.payload ?? {}, envelope.correlation_id);
    const nextId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.cadence.reset', 'CAD', nextId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.resetCadence(cap, { nextId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, period, confirmReason: body.payload?.['confirmReason'], actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'CAD', targetId: nextId, targetVersion: '1', outboxEvent: null }));
    return { reset: out.result, receipt: receipt(out) };
  }

  @Post('/cadence/get')
  async getCadence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { period?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.home.read', 'CAD', null), HomeCapability.read,
      async (cap, scope) => this.home.cadence(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, period: body.payload?.period }));
    return { cadence: out.result, receipt: receipt(out) };
  }

  /** A SCENARIO ROOM or an OBJECTIVE REVIEW room (h3): bound to its subject, with a deadline; the objective's owner opens no review of it. */
  @Post('/rooms/open')
  async openRoom(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateSubjectRoom(body.payload ?? {}, envelope.correlation_id);
    const roomId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.room.open', 'DRM', roomId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.openRoom(cap, { roomId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, intake, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                               targetType: 'DRM', targetId: roomId, targetVersion: '1', outboxEvent: null }));
    return { room: out.result, receipt: receipt(out) };
  }

  /** THE COMMAND VIEWS (CAP-EO-02/-04): the views of the roles the reader holds; one view composed from the home's read. */
  @Post('/views/list')
  async listViews(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.home.read', 'CVW', null), HomeCapability.read,
      async (cap, scope) => this.home.views(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, principalId: principal.principalId }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/views/read')
  async readView(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { viewKey?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.home.read', 'CVW', null), HomeCapability.read,
      async (cap, scope) => this.home.commandView(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, principalId: principal.principalId,
                                                        ceiling: clearanceOf(principal, { tenantId: scope.tenantId as string, domainId: scope.domainId as string }), viewKey: body.payload?.viewKey, limit: body.payload?.limit }, envelope.correlation_id));
    return { view: out.result, receipt: receipt(out) };
  }

  /** THE EXECUTIVE SEARCH with explanation (h4): a governed act — the hits under the reader's scope AND one row on the access ledger. */
  @Post('/search')
  async search(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateSearch(body.payload ?? {}, envelope.correlation_id);
    const searchId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.search', 'SCH', searchId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.search(cap, { searchId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, q: intake.q, limit: intake.limit, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'SCH', targetId: searchId, targetVersion: null, outboxEvent: null }));
    return { search: out.result, receipt: receipt(out) };
  }

  /** THE AGENDA (PER-03, CAP-EO-01): the items of the open cycle in the operator's order, each linked to its object. */
  @Post('/agenda/set')
  async setAgenda(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateAgenda(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.agenda.set', 'AGD', intake.cadenceId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.setAgenda(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, cadenceId: intake.cadenceId, items: intake.items, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'AGD', targetId: intake.cadenceId, targetVersion: null, outboxEvent: null }));
    return { agenda: out.result, receipt: receipt(out) };
  }

  /** A GAP ESCALATED (PER-03): to a named executive, on their queue (class queue.governance). */
  @Post('/escalate')
  async escalate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateEscalate(body.payload ?? {}, envelope.correlation_id);
    const escalationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.escalation.raise', 'ESC', escalationId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.escalate(cap, { escalationId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ESC', targetId: escalationId, targetVersion: '1', outboxEvent: null }));
    return { escalation: out.result, receipt: receipt(out) };
  }

  @Post('/escalations/:escalationId/answer')
  async answerEscalation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('escalationId') escalationId: string, @Body() body: { payload?: { answer?: string } }) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(escalationId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'escalationId must be an escalation id'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.escalation.answer', 'ESC', escalationId), HomeCapability.write,
      async (cap, scope) => ({ result: await this.home.answer(cap, { escalationId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, answer: body.payload?.answer, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ESC', targetId: escalationId, targetVersion: '1', outboxEvent: null }));
    return { escalation: out.result, receipt: receipt(out) };
  }

  /** THE EXECUTIVE METRICS (h6): computed on read from the ledgers over [from, to); nothing stored. */
  @Post('/metrics')
  async metrics(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.metrics.read', 'MET', null), HomeCapability.read,
      async (cap, scope) => this.home.metrics(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, payload: body.payload ?? {} }, envelope.correlation_id));
    return { metrics: out.result, receipt: receipt(out) };
  }
}
