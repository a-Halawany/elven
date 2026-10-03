/**
 * THE HTTP SURFACE OF THE ENVELOPE — CP-6 B30 part `envelope` (migration 0103 §EN; F-P5-04). The twin module's envelope, capabilities and
 * receipts: every write is one governed write whose port asserts the route's own action (an EXACT PDP rule, the B30 envelope block); every
 * read is a consequential read under twin.read, the AI context under twin.ai_context.read. The routes live under /twin-envelope/… of the
 * domain — never under /twins, so none meets TwinController's /:twinId/… routes. No outbox event: the lifecycle lives in twin.envelope_events.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { EnvelopeCapability } from './envelope.capabilities.js';
import { assertUuid, validateAdmission, validateCalibration, validateCompatibility, validateConcurrence, validateContext, validateModelState } from './envelope.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const READ = 'twin.read';
const uuidOrNull = (v: unknown, what: string, correlationId: string, noun: string): string | null => (v === undefined || v === null || v === '' ? null : assertUuid(v, what, correlationId, noun));

@Controller('/v1/tenants/:tenantId/domains/:domainId/twin-envelope')
export class EnvelopeController {
  constructor(private readonly pipeline: PipelineService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** THE RUNS OUTSIDE THE ENVELOPE (optionally one twin): each with its decision use (refused: outside_envelope) and its admission. */
  @Post('/runs/list')
  async listRuns(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const twinId = uuidOrNull((body.payload ?? {})['twinId'], 'twin', envelope.correlation_id, 'exploratory admission');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', null), EnvelopeCapability.read,
      async (cap) => ({ at: await cap.now(), runs: await cap.outsideRuns({ twinId, limit: 100 }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** ONE RUN's envelope view: the recorded check, the acknowledgement, the decision use, the admission and its concurrence. */
  @Post('/runs/:runId/read')
  async readRun(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(runId, 'run', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', runId), EnvelopeCapability.read, async (cap) => cap.run(runId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `exploratory admission rejected (unknown_run): ${runId} is not a run of this domain`), 404);
    return { run: out.result, receipt: receipt(out) };
  }

  /** ADMIT AS EXPLORATORY — a twin owner only; the run stays refused for decision use. */
  @Post('/runs/:runId/admit')
  async admit(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(runId, 'run', envelope.correlation_id);
    const a = validateAdmission(body.payload ?? {}, envelope.correlation_id);
    const admissionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.envelope.admit', 'SIM', runId), EnvelopeCapability.admission,
      async (cap) => {
        const r = await cap.admit({ admissionId, runId, tenantId, domainId, reason: a.reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null };
      });
    return { admission: out.result, receipt: receipt(out) };
  }

  /** CONCUR — a method steward, a second named human; the promotion may follow. */
  @Post('/runs/:runId/concur')
  async concur(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(runId, 'run', envelope.correlation_id);
    const c = validateConcurrence(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.envelope.concur', 'SIM', runId), EnvelopeCapability.admission,
      async (cap) => {
        const r = await cap.concur({ runId, tenantId, domainId, note: c.note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null };
      });
    return { concurrence: out.result, receipt: receipt(out) };
  }

  /** CALIBRATE a model on a twin for one key against a declared tolerance (the numbers are the port's). */
  @Post('/calibrations/run')
  async calibrate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const c = validateCalibration(body.payload ?? {}, envelope.correlation_id);
    const calibrationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.calibration.run', 'TWN', c.twinId), EnvelopeCapability.calibration,
      async (cap) => {
        const r = await cap.calibrate({ calibrationId, tenantId, domainId, twinId: c.twinId, modelRef: c.modelRef, key: c.key, tolerance: c.tolerance, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'TWN', targetId: c.twinId, targetVersion: String(r['seq']), outboxEvent: null };
      });
    return { calibration: out.result, receipt: receipt(out) };
  }

  /** THE CALIBRATIONS of a twin (optionally one model): the latest per key, the model-fitness roll-up, the history. */
  @Post('/calibrations/read')
  async calibrations(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = assertUuid(p['twinId'], 'twin', envelope.correlation_id, 'calibration');
    const modelRef = typeof p['modelRef'] === 'string' && p['modelRef'] !== '' ? p['modelRef'] : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'TWN', twinId), EnvelopeCapability.read,
      async (cap) => cap.calibrations(twinId, modelRef));
    return { calibrations: out.result, receipt: receipt(out) };
  }

  /** THE BEHAVIOUR MODELS with this domain's stewardship (none recorded = approved), their calibrations, the recent ledger. */
  @Post('/models/list')
  async models(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const modelRef = typeof p['modelRef'] === 'string' && p['modelRef'] !== '' ? p['modelRef'] : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'TWN', null), EnvelopeCapability.read,
      async (cap) => ({ at: await cap.now(), models: await cap.models(), events: await cap.events({ modelRef, twinId: null, limit: 50 }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** SET A MODEL'S LIFECYCLE STATE — a method steward. */
  @Post('/models/state')
  async setState(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const s = validateModelState(body.payload ?? {}, envelope.correlation_id);
    const lifecycleId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.model.lifecycle', 'TWN', null), EnvelopeCapability.lifecycle,
      async (cap) => {
        const r = await cap.setState({ lifecycleId, tenantId, domainId, modelRef: s.modelRef, state: s.state, reason: s.reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'TWN', targetId: null, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { lifecycle: out.result, receipt: receipt(out) };
  }

  /** DECLARE A MODEL'S COMPATIBILITY with a twin kind — a method steward. */
  @Post('/models/compatibility')
  async compatibility(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const c = validateCompatibility(body.payload ?? {}, envelope.correlation_id);
    const lifecycleId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.model.lifecycle', 'TWN', null), EnvelopeCapability.lifecycle,
      async (cap) => {
        const r = await cap.declareCompatibility({ lifecycleId, tenantId, domainId, modelRef: c.modelRef, kind: c.kind, compatible: c.compatible, note: c.note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'TWN', targetId: null, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { lifecycle: out.result, receipt: receipt(out) };
  }

  /** THE AI CONTEXT of a twin version (AI-28-004): the envelope, the stale variables, the sensitivity, the fitness — for AI consumers. */
  @Post('/ai-context')
  async aiContext(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const c = validateContext(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.ai_context.read', 'TWN', c.twinId), EnvelopeCapability.context,
      async (cap) => cap.aiContext({ tenantId, domainId, twinId: c.twinId, version: c.version }));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `twin context rejected (unknown_twin): ${c.twinId}${c.version !== null ? ` version ${c.version}` : ''} is not an admitted twin version of this domain`), 404);
    return { context: out.result, receipt: receipt(out) };
  }
}
