/**
 * The Weak-Signal Workbench API — CP-6 B28 (0088 §S; F-P4-10: WS-08, UX-33, OBJ-17/-18, CAP-FW-01/-02). The Prediction API's own prefix
 * (…/prediction/signals/*, …/prediction/detectors/list, …/prediction/indicators/governance/list and …/indicators/:id/govern|retire|renew);
 * a controller of its own in the prediction module so that the stage's other parts' routes and these never touch the same file.
 *
 * The rules of the Prediction API hold: a route returns the state the SERVER committed with its receipt; an absent or denied object
 * answers as absent; every answer that depends on an instant carries it. Two are this workbench's own:
 *   NOMINATION IS NOT DISPOSITION. A detector (run by a person), the Weak Signal Agent (under its own session) or an analyst nominates;
 *   only a named human, never the nominator, confirms, monitors, dismisses or escalates — the PDP's human gate and the port both say so.
 *   THE MATURITY MOVES ONLY BY CORROBORATION. No route sets it: an evidence item judged independent does, through the port's gate.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { SignalsCapability } from './signals.capabilities.js';
import { SignalsService, validateConditions, validateDisposition, validateEscalate, validateEvidence, validateGovern, validateNominate, validateReason, validateRenew, validateScan } from './signals.service.js';

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
  return id;
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction')
export class SignalsController {
  constructor(private readonly pipeline: PipelineService, private readonly signals: SignalsService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── the queue and one signal ─────────────────────────
  @Post('/signals/list')
  async listSignals(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'SIG', null), SignalsCapability.read,
      async (cap, scope) => this.signals.queue(cap, principal, { tenantId: scope.tenantId, domainId: scope.domainId }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/signals/:signalId/get')
  async getSignal(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('signalId') signalId: string) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(signalId, 'signal', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'SIG', id), SignalsCapability.read,
      async (cap, scope) => this.signals.get(cap, id, principal, { tenantId: scope.tenantId, domainId: scope.domainId }, envelope.correlation_id));
    return { signal: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── nomination (OBJ-17) and the rank ─────────────────────────
  /** The detectors run on a person's demand (nominator `detector`): the same port the Weak Signal Agent's run calls. */
  @Post('/signals/scan')
  async scan(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateScan(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.nominate', 'SIG', null), SignalsCapability.nominate,
      async (cap, scope) => ({ result: await cap.scan({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, asOf: intake.asOf, runId: null, maxItems: intake.maxItems, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'SIG', targetId: null, targetVersion: null, outboxEvent: null }));
    return { scan: out.result, receipt: receipt(out) };
  }

  @Post('/signals/nominate')
  async nominate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateNominate(body.payload ?? {}, envelope.correlation_id);
    const signalId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.nominate', 'SIG', signalId), SignalsCapability.nominate,
      async (cap, scope) => ({ result: await cap.nominate({ signalId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, title: intake.title, statement: intake.statement,
                                                           subjectKind: intake.subjectKind, subjectId: intake.subjectId, evidence: intake.evidence, observation: intake.observation, baseline: intake.baseline,
                                                           noveltyBasis: intake.noveltyBasis, confidence: intake.confidence, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'SIG', targetId: signalId, targetVersion: '1', outboxEvent: null }));
    return { signal: out.result, receipt: receipt(out) };
  }

  @Post('/signals/rank')
  async rank(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.rank', 'SIG', null), SignalsCapability.rank,
      async (cap, scope) => ({ result: await cap.rank({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, runId: null, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'SIG', targetId: null, targetVersion: null, outboxEvent: null }));
    return { ranking: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── a named human's acts (OBJ-18) ─────────────────────────
  @Post('/signals/:signalId/evidence')
  async addEvidence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('signalId') signalId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(signalId, 'signal', envelope.correlation_id);
    const intake = validateEvidence(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.evidence.add', 'SIG', id), SignalsCapability.evidence,
      async (cap, scope) => {
        const r = await cap.addEvidence({ signalId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIG', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { corroboration: out.result, receipt: receipt(out) };
  }

  @Post('/signals/:signalId/independence')
  async testIndependence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('signalId') signalId: string) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(signalId, 'signal', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.independence.test', 'SIG', id), SignalsCapability.independence,
      async (cap, scope) => {
        const r = await cap.testIndependence({ signalId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIG', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { independence: out.result, receipt: receipt(out) };
  }

  @Post('/signals/:signalId/disposition')
  async dispose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('signalId') signalId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(signalId, 'signal', envelope.correlation_id);
    const intake = validateDisposition(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.dispose', 'SIG', id), SignalsCapability.disposition,
      async (cap, scope) => {
        const r = await cap.dispose({ signalId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIG', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { signal: out.result, receipt: receipt(out) };
  }

  @Post('/signals/:signalId/conditions')
  async setConditions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('signalId') signalId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(signalId, 'signal', envelope.correlation_id);
    const intake = validateConditions(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.conditions.set', 'SIG', id), SignalsCapability.conditions,
      async (cap, scope) => {
        const r = await cap.setConditions({ signalId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIG', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { signal: out.result, receipt: receipt(out) };
  }

  /** The escalation SUBMITS a warning candidate (0088 §0 intake, origin weak_signal); the lifecycle part clusters or raises it — no warning here. */
  @Post('/signals/:signalId/escalate')
  async escalate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('signalId') signalId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(signalId, 'signal', envelope.correlation_id);
    const intake = validateEscalate(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.signal.escalate', 'SIG', id), SignalsCapability.escalate,
      async (cap, scope) => {
        const r = await cap.escalate({ signalId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIG', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { escalation: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the detectors and the indicator registry ─────────────────────────
  @Post('/detectors/list')
  async listDetectors(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'DET', null), SignalsCapability.read,
      async (cap) => this.signals.detectors(cap));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/indicators/governance/list')
  async listIndicatorGovernance(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'IND', null), SignalsCapability.read,
      async (cap, scope) => this.signals.indicators(cap, principal, { tenantId: scope.tenantId, domainId: scope.domainId }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/indicators/:indicatorId/govern')
  async governIndicator(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('indicatorId') indicatorId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(indicatorId, 'indicator', envelope.correlation_id);
    const intake = validateGovern(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.indicator.govern', 'IND', id), SignalsCapability.indicatorGovernance,
      async (cap, scope) => ({ result: await cap.govern({ indicatorId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'IND', targetId: id, targetVersion: null, outboxEvent: null }));
    return { indicator: out.result, receipt: receipt(out) };
  }

  @Post('/indicators/:indicatorId/retire')
  async retireIndicator(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('indicatorId') indicatorId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(indicatorId, 'indicator', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id, 'a retirement');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.indicator.retire', 'IND', id), SignalsCapability.indicatorGovernance,
      async (cap, scope) => ({ result: await cap.retire({ indicatorId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'IND', targetId: id, targetVersion: null, outboxEvent: null }));
    return { indicator: out.result, receipt: receipt(out) };
  }

  @Post('/indicators/:indicatorId/renew')
  async renewIndicator(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('indicatorId') indicatorId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const id = idOr404(indicatorId, 'indicator', envelope.correlation_id);
    const intake = validateRenew(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.indicator.renew', 'IND', id), SignalsCapability.indicatorGovernance,
      async (cap, scope) => ({ result: await cap.renew({ indicatorId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'IND', targetId: id, targetVersion: null, outboxEvent: null }));
    return { indicator: out.result, receipt: receipt(out) };
  }
}
