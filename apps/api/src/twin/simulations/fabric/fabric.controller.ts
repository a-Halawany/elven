/**
 * CP-6 B30 part `experiments` (0103 §EX) — THE METHOD FABRIC'S EXPERIMENT SURFACE: the checkpoint policy, the adapter quarantine on
 * demand, the retirement of runs and experiments, the envelope sweep and the benchmark validation. Base:
 * /v1/tenants/:tenantId/domains/:domainId/simulations/fabric (no route of the twin controller or of B31's orchestration is touched). Every
 * write is one governed write whose port asserts the route's own EXACT action (the B30 experiments PDP block); every read is
 * `simulation.fabric.read` (consequential, audited, under the caller's RLS). The chunked fabric experiment itself is declared, approved,
 * started and executed through B31's orchestration routes (simulation.experiment.*), which now admit the chunkable fabric methods.
 *
 *   POST /list                                 simulation.fabric.read            the methods (adapter health), experiments (policy, actions, retirement), retirements, sweeps, validations
 *   POST /runs/:runId/read                     simulation.fabric.read            a run's retirement, its reach as it stands, its sweeps and validations
 *   POST /experiments/:experimentId/policy     simulation.experiment.policy      { policy: stop | pause | none, reason }
 *   POST /adapters/quarantine                  simulation.adapter.quarantine     { modelRef, runId?, reason }
 *   POST /runs/:runId/retire                   simulation.retirement.run         { reason, supersededBy? }
 *   POST /experiments/:experimentId/retire     simulation.retirement.experiment  { reason }
 *   POST /runs/:runId/sweep                    simulation.sweep.run              { metric?, gridPoints? }
 *   POST /runs/:runId/benchmark                simulation.benchmark.validate     { measure, kind, values, basis, citations?, tolerance?, tailThreshold? }
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { requireCorrelation } from '../../../shared/correlation.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { FabricCapability } from './fabric.capabilities.js';
import { FabricService, uuidOrNull, validateBenchmarkIntake, validateSweepIntake } from './fabric.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const READ = 'simulation.fabric.read';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_REF = /^[a-z0-9-]+@[0-9]+$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const idOf = (v: string, noun: string, what: string, correlationId: string): string => {
  if (!UUID.test(v)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${noun} rejected (unknown_${what}): ${v} is not an id`), 404);
  return v;
};
const text = (p: Row, key: string): string => (typeof p[key] === 'string' ? (p[key] as string).trim() : '');

@Controller('/v1/tenants/:tenantId/domains/:domainId/simulations/fabric')
export class FabricController {
  constructor(private readonly pipeline: PipelineService, private readonly fabric: FabricService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private readStep(envelope: Envelope): Envelope {
    return { ...envelope, action: READ, side_effect_class: 'none', message_id: newId() } as Envelope;
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const limit = typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(200, Math.trunc(p['limit'] as number))) : 50;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SXP', null), FabricCapability.read,
      async (cap) => ({ at: await cap.now(), ...(await cap.overview(limit)) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/runs/:runId/read')
  async readRun(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    idOf(runId, 'retirement', 'run', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', runId), FabricCapability.read,
      async (cap) => ({ at: await cap.now(), run: await cap.runRetirement(runId) }));
    if (out.result.run === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `retirement rejected (unknown_run): ${runId} is not a simulation run of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE ON-UNSTABLE POLICY of a declared experiment (stop | pause | none), with its reason. */
  @Post('/experiments/:experimentId/policy')
  async policy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, 'experiment', 'experiment', envelope.correlation_id);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.policy', 'SXP', experimentId), FabricCapability.policy,
      async (cap) => ({ result: await cap.setPolicy({ experimentId, tenantId, domainId, policy: text(p, 'policy'), reason: text(p, 'reason'), actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: 'SXP', targetId: experimentId, targetVersion: null, outboxEvent: null }));
    return { experiment: out.result, receipt: receipt(out) };
  }

  /** A METHOD STEWARD'S QUARANTINE of a contained adapter in this domain, with the reason (and the run that showed it). */
  @Post('/adapters/quarantine')
  async quarantine(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const modelRef = text(p, 'modelRef');
    if (!MODEL_REF.test(modelRef)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'adapter quarantine rejected (model): modelRef is a behaviour model reference like discrete-event@1'), 422);
    const runId = uuidOrNull(p['runId'], 'adapter quarantine rejected (run): runId, when given, is a run id', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.adapter.quarantine', 'SIM', runId), FabricCapability.quarantine,
      async (cap) => ({ result: await cap.quarantine({ tenantId, domainId, modelRef, runId, reason: text(p, 'reason'), actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));
    return { adapter: out.result, receipt: receipt(out) };
  }

  /** RETIRE A RUN: the reason, the superseding run (optional), the reach recorded and the reached packages' owners told. */
  @Post('/runs/:runId/retire')
  async retireRun(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(runId, 'retirement', 'run', envelope.correlation_id);
    const p = body.payload ?? {};
    const supersededBy = uuidOrNull(p['supersededBy'], 'retirement rejected (superseded_by): supersededBy, when given, is a run id', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.retirement.run', 'SIM', runId), FabricCapability.retirement,
      async (cap) => ({ result: await cap.retireRun({ retirementId: newId(), tenantId, domainId, runId, reason: text(p, 'reason'), supersededBy, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));
    return { retirement: out.result, receipt: receipt(out) };
  }

  /** RETIRE AN EXPERIMENT (and its run): the reason; the reach recorded. */
  @Post('/experiments/:experimentId/retire')
  async retireExperiment(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, 'retirement', 'experiment', envelope.correlation_id);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.retirement.experiment', 'SXP', experimentId), FabricCapability.retirement,
      async (cap) => ({ result: await cap.retireExperiment({ retirementId: newId(), tenantId, domainId, experimentId, reason: text(p, 'reason'), actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: 'SXP', targetId: experimentId, targetVersion: null, outboxEvent: null }));
    return { retirement: out.result, receipt: receipt(out) };
  }

  /** THE ENVELOPE SWEEP: read the run and its model, sweep the stored contract across the envelope, record it through the port. */
  @Post('/runs/:runId/sweep')
  async sweep(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(runId, 'envelope sweep', 'run', envelope.correlation_id);
    const intake = validateSweepIntake(body.payload ?? {}, envelope.correlation_id);
    const read = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.route(tenantId, domainId, READ, 'SIM', runId), FabricCapability.read, async (cap) => {
      const run = await cap.run(runId);
      return { run, model: run === null ? null : await cap.model(String(run['model_ref'])) };
    });
    if (read.result.run === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `envelope sweep rejected (unknown_run): ${runId} is not a simulation run of this domain`), 404);
    const c = this.fabric.sweep(read.result.run, read.result.model, intake, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.sweep.run', 'SIM', runId), FabricCapability.sweep,
      async (cap) => ({ result: await cap.sweep({ sweepId: newId(), tenantId, domainId, runId, outputsDigest: c.outputsDigest, metric: intake.metric, gridPoints: intake.gridPoints, base: c.base,
                                                   factors: c.factors, interactions: c.interactions, digest: c.digest, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));
    return { sweep: out.result, receipt: receipt(out) };
  }

  /** THE BENCHMARK VALIDATION: read the run, compare its stored paths with the sample, record it through the port (which recomputes and decides the verdict). */
  @Post('/runs/:runId/benchmark')
  async benchmark(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(runId, 'benchmark validation', 'run', envelope.correlation_id);
    const intake = validateBenchmarkIntake(body.payload ?? {}, envelope.correlation_id);
    const read = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.route(tenantId, domainId, READ, 'SIM', runId), FabricCapability.read, async (cap) => ({ run: await cap.run(runId) }));
    if (read.result.run === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `benchmark validation rejected (unknown_run): ${runId} is not a simulation run of this domain`), 404);
    const c = this.fabric.benchmark(read.result.run, intake);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.benchmark.validate', 'SIM', runId), FabricCapability.benchmark,
      async (cap) => ({ result: await cap.validate({ validationId: newId(), tenantId, domainId, runId, outputsDigest: c.outputsDigest, measure: intake.measure, kind: intake.kind,
                                                      benchmark: { values: intake.values, basis: intake.basis, citations: intake.citations }, tolerance: intake.tolerance, tailThreshold: intake.tailThreshold,
                                                      discrepancy: c.discrepancy, tail: c.tail, convergence: c.convergence, digest: c.digest, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));
    return { validation: out.result, receipt: receipt(out) };
  }
}
