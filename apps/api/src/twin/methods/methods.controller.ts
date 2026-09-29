/**
 * CP-6 B29 §C (0092) — THE METHOD FABRIC's HTTP surface, beside the twins' (a run itself is still POST …/twins/simulations/run, with
 * `modelRef` and `params`):
 *
 *   POST …/methods/list                 the portfolio: every registry row (family, adapter, containment, the pinned digest), whether this
 *                                       process carries the same implementation, the domain's adapter health (simulation.read)
 *   POST …/methods/bindings/list        a twin's bindings, or the domain's (simulation.read)
 *   POST …/methods/bind                 the twin's OWNER binds a method (simulation.method.bind; the port refuses a family outside the
 *                                       twin's approved uses)
 *   POST …/methods/unbind               the owner ends a binding, with a reason (simulation.method.unbind)
 *   POST …/methods/health               one adapter's health, ledger and probes (simulation.read)
 *   POST …/methods/probe                a METHOD STEWARD probes a contained adapter: its fixed probe input executed OUT OF PROCESS before
 *                                       the write, the answer recorded (simulation.adapter.probe); a failing probe is a fault
 *   POST …/methods/reinstate            a method steward reinstates a quarantined adapter (simulation.adapter.reinstate, human-gated; the
 *                                       port refuses without a passing probe after the last fault, and refuses the last faulted run's operator)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { SimulationCapability } from '../simulation.capabilities.js';
import { SimulationService } from '../simulations/simulation.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_REF = /^[a-z0-9-]+@[0-9]+$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/methods')
export class MethodsController {
  constructor(private readonly pipeline: PipelineService, private readonly simulations: SimulationService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private modelRef(v: unknown, correlationId: string): string {
    if (typeof v !== 'string' || !MODEL_REF.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'modelRef is a behaviour model reference like discrete-event@1'), 422);
    return v;
  }
  private twinId(v: unknown, correlationId: string): string {
    if (typeof v !== 'string' || !UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'twinId must be a twin id'), 422);
    return v;
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', null), SimulationCapability.read,
      async (cap) => this.simulations.listMethods(cap));
    return { methods: out.result, receipt: receipt(out) };
  }

  @Post('/bindings/list')
  async bindings(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { twinId?: string } }) {
    const { envelope, principal } = ctx(req);
    const twinId = body.payload?.twinId === undefined ? null : this.twinId(body.payload.twinId, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', null), SimulationCapability.read,
      async (cap) => this.simulations.listBindings(cap, twinId));
    return { bindings: out.result, receipt: receipt(out) };
  }

  @Post('/bind')
  async bind(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
             @Body() body: { payload?: { twinId?: string; modelRef?: string; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = this.twinId(p.twinId, envelope.correlation_id);
    const modelRef = this.modelRef(p.modelRef, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.method.bind', 'TWN', twinId), SimulationCapability.bind,
      async (cap, scope) => {
        const r = await this.simulations.bind(cap, scope, { twinId, modelRef, reason: typeof p.reason === 'string' ? p.reason : null }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: null, outboxEvent: null };
      });
    return { binding: out.result, receipt: receipt(out) };
  }

  @Post('/unbind')
  async unbind(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
               @Body() body: { payload?: { twinId?: string; modelRef?: string; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = this.twinId(p.twinId, envelope.correlation_id);
    const modelRef = this.modelRef(p.modelRef, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.method.unbind', 'TWN', twinId), SimulationCapability.bind,
      async (cap, scope) => {
        const r = await this.simulations.unbind(cap, scope, { twinId, modelRef, reason: typeof p.reason === 'string' ? p.reason : '' }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: null, outboxEvent: null };
      });
    return { binding: out.result, receipt: receipt(out) };
  }

  @Post('/health')
  async health(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { modelRef?: string } }) {
    const { envelope, principal } = ctx(req);
    const modelRef = this.modelRef(body.payload?.modelRef, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', null), SimulationCapability.read,
      async (cap) => this.simulations.adapterHealth(cap, modelRef));
    return { adapter: out.result, receipt: receipt(out) };
  }

  @Post('/probe')
  async probe(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { modelRef?: string } }) {
    const { envelope, principal } = ctx(req);
    const modelRef = this.modelRef(body.payload?.modelRef, envelope.correlation_id);
    // The registry row's containment, read first (simulation.read); the probe then executes OUTSIDE any write, out of process, and the write records its answer.
    const row = (await this.pipeline.consequentialRead(
      { ...envelope, action: 'simulation.read', side_effect_class: 'none', message_id: newId() } as Envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', null),
      SimulationCapability.read, async (cap) => (await cap.readBehaviourModels().selectAll().where('method_ref' as never, '=', modelRef as never).executeTakeFirst()) as Record<string, unknown> | undefined)).result;
    if (row === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `no behaviour model ${modelRef} is registered`), 404);
    const probe = await this.simulations.executeProbe(modelRef, row['containment'], envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.adapter.probe', 'SIM', null), SimulationCapability.probe,
      async (cap, scope) => {
        const r = await this.simulations.recordProbe(cap, scope, modelRef, probe, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'SIM', targetId: String(r['probe_id'] ?? ''), targetVersion: null, outboxEvent: null };
      });
    return { probe: out.result, receipt: receipt(out) };
  }

  @Post('/reinstate')
  async reinstate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { modelRef?: string; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const modelRef = this.modelRef(body.payload?.modelRef, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.adapter.reinstate', 'SIM', null), SimulationCapability.reinstate,
      async (cap, scope) => {
        const r = await this.simulations.reinstate(cap, scope, { modelRef, reason: typeof body.payload?.reason === 'string' ? body.payload.reason : '' }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'SIM', targetId: null, targetVersion: null, outboxEvent: null };
      });
    return { adapter: out.result, receipt: receipt(out) };
  }
}
