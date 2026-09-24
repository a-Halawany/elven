/**
 * TWINS — the HTTP surface. Same envelope, same capabilities, same receipts as
 * every other workspace; reading and writing stay separate decisions.
 *
 * CP-6 B21 (0081): the VALIDATION of an admitted version (POST …/:twinId/versions/:version/validate, `twin.version.validate`,
 * human-gated → ValidateTwin@v1), the CHALLENGE routes on a run — open (POST …/simulations/:runId/challenge), the list
 * (POST …/simulations/challenges/list), and the re-run request, the withdrawal and the decision NESTED under the run
 * (POST …/simulations/:runId/challenges/:challengeId/{rerun,withdraw,decide}: the pipeline binds the capability and the
 * AUD target to the RUN — C6 — and the port refuses a challenge that is not the run's; an upheld decision publishes
 * ChallengeSimulation@v1 beside SimulationInvalidated@v1 and GraphChanged/simulation.invalidated) — and the PROMOTION
 * (POST …/simulations/:runId/promote, `simulation.result.promote`, human-gated; no outbox event). The run route's answer
 * and SimulationStarted carry the run's twin_fitness, its own envelope check, the acknowledgement and the challenge answered.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import type { Reader } from '../prediction/series/series.service.js';
import { twinStateChangedGraphEvent } from '../graph/subscriptions/change-events.js';
import { TwinCapability } from './twin.capabilities.js';
import { TwinService, validateElementIntake, validateTwinIntake, validateValidationIntake } from './twins/twin.service.js';
import { twinStateChangedEvent } from './twins/twin-events.js';
import { SimulationCapability } from './simulation.capabilities.js';
import { SimulationService, environmentOf, validateRunIntake } from './simulations/simulation.service.js';
import { simulationCompletedEvent, simulationStartedEvent } from './simulations/simulation-events.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  }
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function instant(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/twins')
export class TwinController {
  constructor(private readonly pipeline: PipelineService, private readonly twins: TwinService, private readonly simulations: SimulationService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private reader(req: EyeRequest, tenantId: string, domainId: string): Reader {
    const { envelope, principal } = ctx(req);
    return { principal, tenantId, domainId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'twin' };
  }

  @Post('/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateTwinIntake((body.payload ?? {}) as never, envelope.correlation_id);
    const twinId = newId();
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'twin.declare', 'TWN', twinId), TwinCapability.declare,
      async (cap, scope) => {
        const r = await this.twins.declare(cap, scope, intake, principal.principalId, envelope.correlation_id, twinId);
        return { result: r, targetType: 'TWN', targetId: r.twinId, targetVersion: '0', outboxEvent: null };
      });
    return { twin: out.result, receipt: receipt(out) };
  }

  @Post('/:twinId/versions/open')
  async openVersion(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Body() body: { payload?: { branchId?: string; forkedFromVersion?: number | null; knownAt?: string; observedThrough?: string | null; carryFrom?: number | null; except?: string[] } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'twin.version', 'TWN', twinId), TwinCapability.version,
      async (cap, scope) => {
        const r = await this.twins.openVersion(cap, scope, twinId, {
          branchId: typeof p.branchId === 'string' ? p.branchId : 'actual',
          forkedFromVersion: Number.isInteger(p.forkedFromVersion) ? (p.forkedFromVersion as number) : null,
          knownAt: instant(p.knownAt, new Date().toISOString()), observedThrough: day(p.observedThrough),
          carryFrom: Number.isInteger(p.carryFrom) ? (p.carryFrom as number) : null,
          except: Array.isArray(p.except) ? p.except.filter((k): k is string => typeof k === 'string') : [],
        }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(r.version), outboxEvent: null };
      });
    return { version: out.result, receipt: receipt(out) };
  }

  @Post('/:twinId/versions/:version/ground')
  async ground(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Param('version') versionRaw: string, @Body() body: { payload?: { elements?: unknown[] } },
  ) {
    const { envelope, principal } = ctx(req);
    const version = Number(versionRaw);
    if (!Number.isInteger(version) || version < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'version must be a positive integer'), 400);
    const raw = body.payload?.elements;
    if (!Array.isArray(raw) || raw.length === 0) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'elements must be a non-empty array'), 400);
    const elements = raw.map((e) => validateElementIntake(e as never, envelope.correlation_id));
    const reader = this.reader(req, tenantId, domainId);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'twin.ground', 'TWN', twinId), TwinCapability.ground,
      async (cap, scope) => {
        const r = await this.twins.ground(cap, scope, reader, twinId, version, elements, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(version), outboxEvent: null };
      });
    return { grounded: out.result, receipt: receipt(out) };
  }

  @Post('/:twinId/versions/:version/ground-series')
  async groundSeries(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Param('version') versionRaw: string, @Body() body: { payload?: { seriesKey?: string; key?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const version = Number(versionRaw);
    const p = body.payload ?? {};
    if (!Number.isInteger(version) || version < 1 || typeof p.seriesKey !== 'string' || typeof p.key !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'version, seriesKey and key are required'), 400);
    }
    const reader = this.reader(req, tenantId, domainId);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'twin.ground', 'TWN', twinId), TwinCapability.ground,
      async (cap, scope) => {
        const r = await this.twins.groundFromSeries(cap, scope, reader, twinId, version, p.seriesKey as string, p.key as string, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(version), outboxEvent: null };
      });
    return { grounded: out.result, receipt: receipt(out) };
  }

  /**
   * ADMIT — and ANNOUNCE (B18, 0078, L5-I04): the admitting transaction publishes TwinStateChanged/version.admitted
   * (the version, the variables that changed, the freshness, the runs resting on the superseded version) and a
   * GraphChanged/twin.state_changed that names the twin and the superseded version's runs for the consumers — the
   * decisions consumer notes the packages citing them; the twins consumer leaves a twin's own admission alone.
   */
  @Post('/:twinId/versions/:version/admit')
  async admit(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Param('version') versionRaw: string, @Body() body: { payload?: { allowIncomplete?: boolean } },
  ) {
    const { envelope, principal } = ctx(req);
    const version = Number(versionRaw);
    if (!Number.isInteger(version) || version < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'version must be a positive integer'), 400);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'twin.version.admit', 'TWN', twinId), TwinCapability.admit,
      async (cap, scope) => {
        const { runs, ...r } = await this.twins.admit(cap, scope, twinId, version, body.payload?.allowIncomplete === true, envelope.purpose_id ?? 'twin',
          principal.principalId, envelope.correlation_id);
        const now = new Date().toISOString();
        return {
          result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(version),
          outboxEvent: twinStateChangedEvent({
            twinId, version, branchId: r.branchId, supersedes: r.supersedes, forkedFromVersion: r.forkedFrom, change: 'version.admitted',
            stateSetDigest: r.stateSetDigest, headerDigest: r.headerDigest, completeness: r.completeness, missingKeys: r.missingKeys, syntheticState: r.syntheticState,
            knownAt: r.knownAt, observedThrough: r.observedThrough, verificationState: 'verified', changedVariables: r.changedVariables, dependencyImpacts: r.dependencyImpacts,
            reason: null, causedBy: null, action: 'twin.version.admit', actor: principal.principalId, occurredAt: now,
          }),
          outboxEvents: [twinStateChangedGraphEvent({
            twinId, version, supersedes: r.supersedes, branchId: r.branchId, changedVariables: r.changedVariables.length, runs,
            subscriptions: await cap.changeSubscriptions({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, changeKind: 'twin.state_changed' }),
            actor: principal.principalId, occurredAt: now,
          })],
        };
      });
    return { admitted: out.result, receipt: receipt(out) };
  }

  /**
   * B21 (0081, L5-I05): VALIDATE an admitted version — a person other than the twin's owner records a verdict (fit | unfit |
   * indeterminate) over the envelope check and the calibration history the port computes; human-gated. The write publishes
   * ValidateTwin@v1; no GraphChanged (a validation changes no fact). An unfit version opens no run from now on (the port).
   */
  @Post('/:twinId/versions/:version/validate')
  async validate(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Param('version') versionRaw: string, @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const version = Number(versionRaw);
    if (!Number.isInteger(version) || version < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'version must be a positive integer'), 400);
    const intake = validateValidationIntake(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'twin.version.validate', 'TWN', twinId), TwinCapability.validate,
      async (cap, scope) => {
        const r = await this.twins.validate(cap, scope, twinId, version, intake, principal.principalId, envelope.correlation_id);
        return { result: r.validation, targetType: 'TWN', targetId: twinId, targetVersion: String(version), outboxEvent: r.event };
      });
    return { validation: out.result, receipt: receipt(out) };
  }

  @Post('/:twinId/reconcile')
  async reconcile(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Body() body: { payload?: { key?: string; fromVersion?: number; againstVersion?: number; note?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.key !== 'string' || !Number.isInteger(p.fromVersion) || !Number.isInteger(p.againstVersion) || typeof p.note !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'key, fromVersion, againstVersion and note are required'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'twin.ground', 'TWN', twinId), TwinCapability.ground,
      async (cap, scope) => {
        const r = await this.twins.reconcile(cap, scope, twinId, { key: p.key as string, fromVersion: p.fromVersion as number, againstVersion: p.againstVersion as number, note: p.note as string }, principal.principalId, envelope.correlation_id);
        return { result: { difference: r }, targetType: 'TWN', targetId: twinId, targetVersion: String(p.againstVersion), outboxEvent: null };
      });
    return { reconciliation: out.result, receipt: receipt(out) };
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', null),
      TwinCapability.read, async (cap) => this.twins.list(cap));
    return { twins: out.result, receipt: receipt(out) };
  }

  @Post('/behaviour-models/list')
  async behaviourModels(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', null),
      TwinCapability.read, async (cap) => ({
        models: await cap.readBehaviourModels().selectAll().execute(), kinds: await cap.readKindSchemas().selectAll().execute() }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/:twinId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      TwinCapability.read, async (cap) => this.twins.get(cap, twinId));
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized twin matches'), 404);
    return { twin: out.result, receipt: receipt(out) };
  }

  @Post('/:twinId/as-of')
  async asOf(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Body() body: { payload?: { branchId?: string; instant?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const branchId = typeof body.payload?.branchId === 'string' ? body.payload.branchId : 'actual';
    const at = instant(body.payload?.instant, new Date().toISOString());
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      TwinCapability.read, async (cap) => this.twins.asOf(cap, twinId, branchId, at));
    return { asOf: at, branchId, version: out.result ?? null, receipt: receipt(out) };
  }

  /**
   * RUN: two governed writes. `simulation.run` binds the contract and snapshots the
   * initial state; `simulation.run.complete` executes from that snapshot, admits the
   * SIM object (synthetic) and binds the outputs. A completion that fails leaves the
   * run visibly `failed`, never silently absent. B18 (0078): the opening write
   * publishes SimulationStarted (L8-I02), the completing write SimulationCompleted
   * `completed` with the resource evidence, the failing write SimulationCompleted
   * `failed` with the outputs declared missing (L8-I03) — each in its own transaction.
   */
  @Post('/simulations/run')
  async run(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRunIntake(body.payload ?? {}, envelope.correlation_id);
    const reader = this.reader(req, tenantId, domainId);
    const runId = newId();
    // THE EVIDENCE AVAILABILITY FIRST, OUTSIDE THE WRITE (EvidenceAvailability — the B21 rehearsal's wedge): the citations the port selects
    // for the component, read under simulation.read; each evidence citation retrieved through the reader as the governed write it is
    // (policy, custody, audit), in sequence; the opening write then judges lifecycle under its own snapshot and consults these answers
    // for the bytes. A retrieval INSIDE the opening write ran on a second connection whose capability context waited on the run's
    // transaction (ctx.build's sweep of expired nonces) while the run's handler waited on it — a deadlock that queued every login.
    const citations = (await this.pipeline.consequentialRead(
      { ...envelope, action: 'simulation.read', side_effect_class: 'none', message_id: newId() } as Envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', null), SimulationCapability.read,
      async (cap) => this.simulations.citationsForRun(cap, intake))).result;
    const evidence = await this.simulations.retrieveEvidence(reader, citations, 'simulation.run', { twin_id: intake.twinId, version: String(intake.twinVersion), component: intake.component });
    const opened = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.run', 'SIM', runId), SimulationCapability.run,
      async (cap, scope) => {
        const r = await this.simulations.open(cap, scope, evidence, intake, principal.principalId, envelope.correlation_id, runId);
        return { result: { runId: r.runId, initialStateDigest: r.opened.initial_state_digest, knownAt: r.opened.known_at, observedThrough: r.opened.observed_through,
                           // B21 (0081): the fitness and envelope contract the port bound at opening
                           twinFitness: r.twinFitness, envelope: r.envelope, envelopeAck: r.envelopeAck, challengeId: r.challengeId },
                 targetType: 'SIM', targetId: runId, targetVersion: '0',
                 outboxEvent: simulationStartedEvent({
                   runId, opened: r.opened, intake, scenario: r.scenario, shockBasis: r.shockBasis, modelRef: r.modelRef, implementationDigest: r.implementationDigest,
                   environmentDigest: r.environmentDigest, environment: r.environment, inputsDigest: r.inputsDigest, rng: r.rng,
                   twinFitness: r.twinFitness, envelope: r.envelope, envelopeAck: r.envelopeAck, challengeId: r.challengeId,
                   operator: principal.principalId, occurredAt: new Date().toISOString(),
                 }) };
      });
    // The elapsed time until a FAILURE is measured here (the service measures a completion around its own execution).
    const t0 = Date.now();
    try {
      const done = await this.pipeline.write(
        { ...envelope, action: 'simulation.run.complete', message_id: newId() }, principal,
        this.route(tenantId, domainId, 'simulation.run.complete', 'SIM', runId), SimulationCapability.complete,
        async (cap, scope) => {
          const { event, ...r } = await this.simulations.complete(cap, scope, runId, envelope.purpose_id ?? 'simulation', principal.principalId, envelope.correlation_id);
          return { result: r, targetType: 'SIM', targetId: runId, targetVersion: '1', outboxEvent: event };
        });
      return { run: { ...opened.result, ...done.result, state: 'completed' }, receipt: receipt(done) };
    } catch (e) {
      const failure = e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e));
      await this.pipeline.write(
        { ...envelope, action: 'simulation.run.complete', message_id: newId() }, principal,
        this.route(tenantId, domainId, 'simulation.run.complete', 'SIM', runId), SimulationCapability.complete,
        async (cap, scope) => {
          await cap.failRun({ runId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, failure: failure.slice(0, 500), actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
          // The failed state, announced: no outputs, all of them declared missing; the resource evidence is what the failure took.
          const row = ((await cap.readRuns().selectAll().where('run_id' as never, '=', runId as never).executeTakeFirst()) as Record<string, unknown> | undefined) ?? { twin_id: intake.twinId, twin_version: intake.twinVersion, run_kind: intake.runKind, control_run_id: intake.controlRunId, component: intake.component };
          const env = environmentOf();
          return { result: {}, targetType: 'SIM', targetId: runId, targetVersion: '0',
                   outboxEvent: simulationCompletedEvent({
                     runId, state: 'failed', run: row, outputsDigest: null, totals: null, impacts: { control_run_id: intake.controlRunId, deltas: null }, sensitivity: null,
                     validation: { validation_status: row['validation_status'] === null || row['validation_status'] === undefined ? null : String(row['validation_status']), inherited_validation: [], outside_envelope: false },
                     resource: { elapsed_ms: Date.now() - t0, samples_run: 0, process: { node: env.node, platform: env.platform, arch: env.arch }, memory_rss_bytes: process.memoryUsage().rss },
                     simObject: null, failure: failure.slice(0, 500), actor: principal.principalId, occurredAt: new Date().toISOString(),
                   }) };
        }).catch(() => undefined);
      throw e;
    }
  }

  /**
   * REPRODUCE. The request carries no attestation: the product establishes availability
   * to this reader and executes the stored contract in a separate process itself; a
   * `cold` flag in the payload is ignored, never recorded. B18 (0078, L8-I05): an
   * unreproducible verdict caused by a withdrawn or retired input invalidates the run
   * in this same write (SimulationInvalidated beside GraphChanged/simulation.invalidated);
   * the answer names the invalidation, or which cause withheld it.
   */
  @Post('/simulations/:runId/reproduce')
  async reproduce(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                  @Body() _body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const reader = this.reader(req, tenantId, domainId);
    // The availability of the snapshot's evidence to this reader is established BEFORE the write (the run route's rule, EvidenceAvailability):
    // the citations of the completed run's immutable snapshot read under simulation.read, each evidence citation retrieved as its own governed write.
    const citations = (await this.pipeline.consequentialRead(
      { ...envelope, action: 'simulation.read', side_effect_class: 'none', message_id: newId() } as Envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', runId), SimulationCapability.read,
      async (cap) => this.simulations.citationsForReproduction(cap, runId))).result;
    const evidence = await this.simulations.retrieveEvidence(reader, citations, 'simulation.reproduce', { run_id: runId });
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.reproduce', 'SIM', runId), SimulationCapability.reproduce,
      async (cap, scope) => {
        const { events, ...r } = await this.simulations.reproduce(cap, scope, evidence, runId, principal.principalId, envelope.correlation_id, envelope.purpose_id ?? 'simulation');
        return { result: r, targetType: 'SIM', targetId: runId, targetVersion: '1', outboxEvent: events.outboxEvent, outboxEvents: events.outboxEvents };
      });
    return { reproduction: out.result, receipt: receipt(out) };
  }

  /**
   * B18 (0078, L8-I05): a PERSON invalidates a completed run's result (the twin owner, the operator or the administrator;
   * human-gated) — the withdrawn SIM version admitted, the dependants named, the citing packages noted through
   * GraphChanged/simulation.invalidated; decision.derive_option refuses the run from now on. The reproduce route does the
   * same itself on an unreproducible verdict caused by a withdrawn or retired input.
   */
  @Post('/simulations/:runId/invalidate')
  async invalidateRun(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                      @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runId must be a run id'), 422);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.run.invalidate', 'SIM', runId), SimulationCapability.invalidate,
      async (cap, scope) => {
        const r = await this.simulations.invalidate(cap, scope, runId, { reason: String(body.payload?.reason ?? ''), trigger: 'operator', triggerRef: null },
          principal.principalId, envelope.correlation_id, envelope.purpose_id ?? 'simulation');
        return { result: { runId, invalidated: r.invalidated, withdrawnVersion: r.withdrawnVersion }, targetType: 'SIM', targetId: runId, targetVersion: String(r.withdrawnVersion),
                 outboxEvent: r.event, outboxEvents: [r.changed] };
      });
    return { invalidation: out.result, receipt: receipt(out) };
  }

  @Post('/simulations/compare')
  async compareRuns(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { runIds?: unknown } }) {
    const { envelope, principal } = ctx(req);
    const ids = body.payload?.runIds;
    if (!Array.isArray(ids) || ids.length < 2 || !ids.every((x) => typeof x === 'string')) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runIds must list at least two runs'), 400);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', null),
      SimulationCapability.read, async (cap) => this.simulations.compare(cap, ids as string[], envelope.correlation_id));
    return { comparison: out.result, receipt: receipt(out) };
  }

  @Post('/simulations/list')
  async listRuns(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { twinId?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', null),
      SimulationCapability.read, async (cap) => this.simulations.list(cap, typeof body.payload?.twinId === 'string' ? body.payload.twinId : null));
    return { runs: out.result, receipt: receipt(out) };
  }

  @Post('/simulations/:runId/get')
  async getRun(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', runId),
      SimulationCapability.read, async (cap) => this.simulations.get(cap, runId));
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized run matches'), 404);
    return { run: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── B21 (0081): the challenge and the promotion ─────────────────────────
  // Every route here is declared BEFORE `/:twinId/compare` (the static-before-param rule) and the static
  // `/simulations/challenges/list` before the parameterised `/simulations/:runId/…` routes (C6).

  @Post('/simulations/challenges/list')
  async listChallenges(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { runId?: string } }) {
    const { envelope, principal } = ctx(req);
    const runId = typeof body.payload?.runId === 'string' ? body.payload.runId : null;
    if (runId !== null && !UUID.test(runId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runId must be a run id'), 422);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.read', 'SIM', runId),
      SimulationCapability.read, async (cap) => this.simulations.listChallenges(cap, runId));
    return { challenges: out.result, receipt: receipt(out) };
  }

  /** OPEN a challenge — a person's typed dispute of a completed valid run's result (assumptions | model | constraints | interpretation); the port judges the rest. */
  @Post('/simulations/:runId/challenge')
  async openChallenge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                      @Body() body: { payload?: { kind?: string; statement?: string; disputed?: unknown } }) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(runId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runId must be a run id'), 422);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.challenge.open', 'SIM', runId), SimulationCapability.challenge,
      async (cap, scope) => {
        const r = await this.simulations.openChallenge(cap, scope, runId, { kind: String(p.kind ?? ''), statement: String(p.statement ?? ''), disputed: p.disputed === undefined ? null : p.disputed },
          principal.principalId, envelope.correlation_id);
        return { result: r.challenge, targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: r.event };
      });
    return { challenge: out.result, receipt: receipt(out) };
  }

  /** REQUEST a re-run of the challenged run: the re-run is an ordinary governed run naming correctsRunId and challengeId, bound by the opening port. */
  @Post('/simulations/:runId/challenges/:challengeId/rerun')
  async requestRerun(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                     @Param('challengeId') challengeId: string, @Body() body: { payload?: { note?: string } }) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(runId) || !UUID.test(challengeId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runId and challengeId must be ids'), 422);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.challenge.rerun', 'SIM', runId), SimulationCapability.challenge,
      async (cap, scope) => {
        const r = await this.simulations.requestRerun(cap, scope, runId, challengeId, typeof body.payload?.note === 'string' ? body.payload.note : null, principal.principalId, envelope.correlation_id);
        return { result: r.challenge, targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: r.event };
      });
    return { challenge: out.result, receipt: receipt(out) };
  }

  /** WITHDRAW a live challenge — its opener's act (the port refuses anyone else). */
  @Post('/simulations/:runId/challenges/:challengeId/withdraw')
  async withdrawChallenge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                          @Param('challengeId') challengeId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(runId) || !UUID.test(challengeId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runId and challengeId must be ids'), 422);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.challenge.withdraw', 'SIM', runId), SimulationCapability.challenge,
      async (cap, scope) => {
        const r = await this.simulations.withdrawChallenge(cap, scope, runId, challengeId, String(body.payload?.reason ?? ''), principal.principalId, envelope.correlation_id);
        return { result: r.challenge, targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: r.event };
      });
    return { challenge: out.result, receipt: receipt(out) };
  }

  /**
   * DECIDE a live challenge (human-gated; the port refuses the opener and the run's operator). UPHELD invalidates the run in
   * this same write — three outbox rows: ChallengeSimulation, SimulationInvalidated and GraphChanged/simulation.invalidated —
   * unless the run was invalidated already (then `invalidation` is null and `invalidation_withheld` says why).
   */
  @Post('/simulations/:runId/challenges/:challengeId/decide')
  async decideChallenge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                        @Param('challengeId') challengeId: string, @Body() body: { payload?: { decision?: string; note?: string } }) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(runId) || !UUID.test(challengeId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runId and challengeId must be ids'), 422);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.challenge.decide', 'SIM', runId), SimulationCapability.challenge,
      async (cap, scope) => {
        const r = await this.simulations.decideChallenge(cap, scope, runId, challengeId, { decision: String(p.decision ?? ''), note: String(p.note ?? '') },
          principal.principalId, envelope.correlation_id, envelope.purpose_id ?? 'simulation');
        return { result: { challenge: r.challenge,
                           invalidation: r.invalidation === null ? null : { runId, withdrawnVersion: r.invalidation.withdrawnVersion, invalidatedAt: r.invalidation.invalidatedAt },
                           invalidation_withheld: r.invalidation_withheld },
                 targetType: 'SIM', targetId: runId, targetVersion: r.invalidation === null ? null : String(r.invalidation.withdrawnVersion),
                 outboxEvent: r.event, outboxEvents: r.invalidation === null ? [] : [r.invalidation.event, r.invalidation.changed] };
      });
    return { ...out.result, receipt: receipt(out) };
  }

  /** PROMOTE a completed, valid, undisputed result as fit for a stated use (OBJ-29; human-gated; the port refuses the operator). No outbox event. */
  @Post('/simulations/:runId/promote')
  async promote(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                @Body() body: { payload?: { promotedFor?: string; limitations?: unknown; note?: string } }) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(runId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'runId must be a run id'), 422);
    const p = body.payload ?? {};
    const limitations = Array.isArray(p.limitations) ? p.limitations.filter((x): x is string => typeof x === 'string') : [];
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.result.promote', 'SIM', runId), SimulationCapability.promote,
      async (cap, scope) => {
        const r = await this.simulations.promote(cap, scope, runId, { promotedFor: String(p.promotedFor ?? ''), limitations, note: String(p.note ?? '') }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'SIM', targetId: runId, targetVersion: '1', outboxEvent: null };
      });
    return { promotion: out.result, receipt: receipt(out) };
  }

  /*
   * Declared after the static `/simulations/compare` route on purpose: Express matches
   * routes in declaration order, and `:twinId` would otherwise capture `simulations`.
   */
  @Post('/:twinId/compare')
  async compare(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
    @Body() body: { payload?: { a?: number; b?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const a = Number(body.payload?.a); const b = Number(body.payload?.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a and b must be version numbers'), 400);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      TwinCapability.read, async (cap) => this.twins.compare(cap, twinId, a, b));
    return { comparison: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── simulations ─────────────────────────
}
