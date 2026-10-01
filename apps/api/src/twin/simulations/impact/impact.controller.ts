/**
 * THE HTTP SURFACE OF IMPACT ANALYSIS — CP-6 B31 part `impact` (migration 0099 §I; F-P5-07; F-P4-08's comparator sensitivity). Its OWN
 * controller under /simulations/impact/… (twin.controller.ts' routes are never edited):
 *
 *   POST …/simulations/impact/list                         the newest sensitivity analyses of the domain (simulation.impact.read)
 *   POST …/simulations/impact/runs/:runId/read             the run's impact: its analyses, its newest second-order derivation, its probability
 *                                                          statements (simulation.impact.read)
 *   POST …/simulations/impact/runs/:runId/sensitivity      a SENSITIVITY ANALYSIS (one at a time, ranked by swing; robustness across ≥ 3
 *                                                          seeds; timing of the dated interventions) — read, executed, recorded
 *                                                          (simulation.impact.sensitivity)
 *   POST …/simulations/impact/runs/:runId/second-order     the SECOND-ORDER, distributional and timing effects over the live twin links
 *                                                          (simulation.impact.second_order)
 *   POST …/simulations/impact/runs/:runId/probability      the run's simulated frequency stated as a probability through an ACTIVE
 *                                                          frequency map (simulation.impact.probability; human-gated)
 *   POST …/simulations/impact/voi/assess                   a VALUE-OF-INFORMATION assessment computed by the port from governed records
 *                                                          (simulation.impact.voi; human-gated)
 *   POST …/simulations/impact/voi/list                     the assessments, by package and/or scenario (simulation.impact.read)
 *
 * A computed analysis is THREE steps (the B29 rule — a model executes outside any write): the consequential READ under
 * simulation.impact.read (its own message id), the EXECUTION here, the WRITE under the route's own action, whose port re-checks the run.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { requireCorrelation } from '../../../shared/correlation.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { ImpactCapability } from './impact.capabilities.js';
import { ImpactService, type SecondOrderInputs } from './impact.service.js';
import { validateSensitivity, validateVoi, type ChainTwin } from './impact-core.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ = 'simulation.impact.read';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const limitOf = (p: Row): number => (typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(200, Math.trunc(p['limit'] as number))) : 50);
const runIdOf = (v: string, correlationId: string): string => {
  if (!UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'impact analysis rejected (run): the run is named by its id'), 422);
  return v;
};
const unknownRun = (runId: string, correlationId: string): never => {
  throw new HttpException(errorBody('EYE_STA_001', correlationId, `impact analysis rejected (unknown_run): ${runId} is not a simulation run of this domain`), 404);
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/simulations/impact')
export class ImpactController {
  constructor(private readonly pipeline: PipelineService, private readonly impact: ImpactService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  /** The consequential read a computed analysis starts with: its own action and message id, the request's correlation. */
  private readStep(envelope: Envelope): Envelope {
    return { ...envelope, action: READ, side_effect_class: 'none', message_id: newId() } as Envelope;
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', null), ImpactCapability.read,
      async (cap) => ({ at: await cap.now(), analyses: await cap.analyses(limitOf(body.payload ?? {})) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/runs/:runId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    runIdOf(runId, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', runId), ImpactCapability.read,
      async (cap) => ({ impact: await cap.impact(runId) }));
    if (out.result.impact === null) unknownRun(runId, envelope.correlation_id);
    return { impact: out.result.impact, receipt: receipt(out) };
  }

  /** A SENSITIVITY ANALYSIS: read the run, execute the sweep (and the robustness), record it through the port. */
  @Post('/runs/:runId/sensitivity')
  async sensitivity(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    runIdOf(runId, envelope.correlation_id);
    const v = validateSensitivity(body.payload ?? {});
    if ('problem' in v) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, v.problem), 422);
    const read = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.route(tenantId, domainId, READ, 'SIM', runId), ImpactCapability.read, async (cap) => {
      const run = await cap.run(runId);
      return { run, model: run === null ? null : await cap.model(String(run['model_ref'])) };
    });
    if (read.result.run === null) unknownRun(runId, envelope.correlation_id);
    const computed = await this.impact.sensitivity({ run: read.result.run as Row, model: read.result.model }, v.ok, envelope.correlation_id);
    const analysisId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.impact.sensitivity', 'SIM', runId), ImpactCapability.write,
      async (cap) => ({ result: await cap.analyseSensitivity({ analysisId, tenantId, domainId, runId, outputsDigest: computed.outputsDigest, metric: computed.metric, relative: computed.relative,
                                                               base: computed.base, factors: computed.factors, seeds: computed.seeds, robustness: computed.robustness as unknown as Row,
                                                               timingShiftDays: computed.timingShiftDays, digest: computed.digest, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));
    return { analysis: out.result, receipt: receipt(out) };
  }

  /** THE SECOND-ORDER EFFECTS: read the run and the live links reachable from its twin (with the linked twins' admitted elements), derive, record. */
  @Post('/runs/:runId/second-order')
  async secondOrder(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    runIdOf(runId, envelope.correlation_id);
    const read = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.route(tenantId, domainId, READ, 'SIM', runId), ImpactCapability.read, async (cap) => {
      const run = await cap.run(runId);
      if (run === null) return null;
      const twinId = String(run['twin_id']);
      const links = await cap.reach(twinId);
      const twins = new Map<string, ChainTwin>();
      for (const id of new Set(links.map((l) => String(l['downstream_twin_id'])))) {
        const t = await cap.twinElements(id);
        if (t !== null) twins.set(id, { twinId: id, title: t.title, elements: t.elements });
      }
      return { run, twinTitle: (await cap.twinTitle(twinId)) ?? twinId, links, twins } satisfies SecondOrderInputs;
    });
    if (read.result === null) unknownRun(runId, envelope.correlation_id);
    const derived = this.impact.secondOrder(read.result as SecondOrderInputs, envelope.correlation_id);
    const derivationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.impact.second_order', 'SIM', runId), ImpactCapability.write,
      async (cap) => ({ result: await cap.deriveSecondOrder({ derivationId, tenantId, domainId, runId, outputsDigest: derived.outputsDigest, effects: derived.effects, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));
    return { secondOrder: out.result, receipt: receipt(out) };
  }

  /** A PROBABILITY STATEMENT: the run's simulated frequency of an event through an ACTIVE frequency map (the port counts and maps). */
  @Post('/runs/:runId/probability')
  async probability(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    runIdOf(runId, envelope.correlation_id);
    const p = body.payload ?? {};
    const mapId = p['mapId'] === undefined || p['mapId'] === null ? null : p['mapId'];
    if (mapId !== null && (typeof mapId !== 'string' || !UUID.test(mapId))) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'impact analysis rejected (frequency_map): mapId, when given, is a frequency map id'), 422);
    const event = typeof p['event'] === 'object' && p['event'] !== null && !Array.isArray(p['event']) ? (p['event'] as Row) : {};
    const statementId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.impact.probability', 'SIM', runId), ImpactCapability.write,
      async (cap) => ({ result: await cap.stateProbability({ statementId, tenantId, domainId, runId, mapId: mapId as string | null, event, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));
    return { statement: out.result, receipt: receipt(out) };
  }

  /** A VALUE-OF-INFORMATION ASSESSMENT (the port computes from the governed probabilities and the payoffs; a wait routed to the package owner). */
  @Post('/voi/assess')
  async assess(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const v = validateVoi(body.payload ?? {});
    if ('problem' in v) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, v.problem), 422);
    const a = v.ok;
    const assessmentId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.impact.voi', a.packageId === null ? 'SCN' : 'DPK', a.packageId ?? a.scenarioId), ImpactCapability.write,
      async (cap) => ({ result: await cap.assessVoi({ assessmentId, tenantId, domainId, packageId: a.packageId, scenarioId: a.scenarioId, branchIds: a.branchIds, reviewId: a.reviewId, options: a.options,
                                                      payoffs: a.payoffs, unit: a.unit, payoffBasis: a.payoffBasis, information: a.information, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: a.packageId === null ? 'SCN' : 'DPK', targetId: a.packageId ?? a.scenarioId, targetVersion: null, outboxEvent: null }));
    return { assessment: out.result, receipt: receipt(out) };
  }

  @Post('/voi/list')
  async voiList(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const idOf = (k: string): string | null => (typeof p[k] === 'string' && UUID.test(p[k] as string) ? (p[k] as string) : null);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'DPK', idOf('packageId')), ImpactCapability.read,
      async (cap) => ({ at: await cap.now(), assessments: await cap.assessments({ packageId: idOf('packageId'), scenarioId: idOf('scenarioId'), limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }
}
