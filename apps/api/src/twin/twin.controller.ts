/**
 * TWINS — the HTTP surface. Same envelope, same capabilities, same receipts as
 * every other workspace; reading and writing stay separate decisions.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import type { Reader } from '../prediction/series/series.service.js';
import { TwinCapability } from './twin.capabilities.js';
import { TwinService, validateElementIntake, validateTwinIntake } from './twins/twin.service.js';
import { SimulationCapability } from './simulation.capabilities.js';
import { SimulationService, validateRunIntake } from './simulations/simulation.service.js';

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
        const r = await this.twins.admit(cap, scope, twinId, version, body.payload?.allowIncomplete === true, envelope.purpose_id ?? 'twin',
          principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(version), outboxEvent: null };
      });
    return { admitted: out.result, receipt: receipt(out) };
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
   * run visibly `failed`, never silently absent.
   */
  @Post('/simulations/run')
  async run(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRunIntake(body.payload ?? {}, envelope.correlation_id);
    const runId = newId();
    const opened = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.run', 'SIM', runId), SimulationCapability.run,
      async (cap, scope) => {
        const r = await this.simulations.open(cap, scope, intake, principal.principalId, envelope.correlation_id, runId);
        return { result: { runId: r.runId, initialStateDigest: r.opened.initial_state_digest, knownAt: r.opened.known_at, observedThrough: r.opened.observed_through },
                 targetType: 'SIM', targetId: runId, targetVersion: '0', outboxEvent: null };
      });
    try {
      const done = await this.pipeline.write(
        { ...envelope, action: 'simulation.run.complete', message_id: newId() }, principal,
        this.route(tenantId, domainId, 'simulation.run.complete', 'SIM', runId), SimulationCapability.complete,
        async (cap, scope) => {
          const r = await this.simulations.complete(cap, scope, runId, envelope.purpose_id ?? 'simulation', principal.principalId, envelope.correlation_id);
          return { result: r, targetType: 'SIM', targetId: runId, targetVersion: '1', outboxEvent: null };
        });
      return { run: { ...opened.result, ...done.result, state: 'completed' }, receipt: receipt(done) };
    } catch (e) {
      const failure = e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e));
      await this.pipeline.write(
        { ...envelope, action: 'simulation.run.complete', message_id: newId() }, principal,
        this.route(tenantId, domainId, 'simulation.run.complete', 'SIM', runId), SimulationCapability.complete,
        async (cap, scope) => {
          await cap.failRun({ runId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, failure: failure.slice(0, 500), actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
          return { result: {}, targetType: 'SIM', targetId: runId, targetVersion: '0', outboxEvent: null };
        }).catch(() => undefined);
      throw e;
    }
  }

  /**
   * REPRODUCE. The request carries no attestation: the product establishes availability
   * to this reader and executes the stored contract in a separate process itself; a
   * `cold` flag in the payload is ignored, never recorded.
   */
  @Post('/simulations/:runId/reproduce')
  async reproduce(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string,
                  @Body() _body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const reader = this.reader(req, tenantId, domainId);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'simulation.reproduce', 'SIM', runId), SimulationCapability.reproduce,
      async (cap, scope) => {
        const r = await this.simulations.reproduce(cap, scope, reader, runId, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'SIM', targetId: runId, targetVersion: '1', outboxEvent: null };
      });
    return { reproduction: out.result, receipt: receipt(out) };
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
