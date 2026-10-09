/**
 * CP-6 B33 §SC (0111) — the supply-intelligence routes. Base: /v1/tenants/:tenantId/domains/:domainId/twin-supply. Same envelope, capabilities
 * and receipts as the twin routes; reads `twin.supply.read` (consequential, audited); each write its own exact action (the B33 supply PDP rows):
 *
 *   POST /workspace                              twin.supply.read                  the networks, the live disruptions, the open inferences
 *   POST /networks/:twinId                       twin.supply.read                  a version's analysis and uncertainty, record sources, inferences
 *   POST /record-sources/declare                 twin.supply.records.declare       the twin's owner names (or retires) a record source
 *   POST /inferences/list | /inferences/:id/read twin.supply.read
 *   POST /inferences/draft                       twin.supply.inference.draft       the agent's write (its scan makes the same one); a person is refused
 *   POST /inferences/:id/decide                  twin.supply.inference.validate    a named domain analyst: validated | rejected (human-gated)
 *   POST /inferences/:id/apply                   twin.supply.inference.apply       the owner: open / ground / admit (each twin.* write its own) + the record
 *   POST /inferences/:id/revert                  twin.supply.inference.apply       the owner: a new version without the revoked supplier + the record
 *   POST /inferences/:id/record                  twin.supply.inference.apply       the record alone (the owner made the version through the twin routes)
 *   POST /disruptions/list | /disruptions/:id/read
 *   POST /disruptions/open                       twin.supply.disruption.open       a person (open) or the agent (proposed)
 *   POST /disruptions/:id/confirm                twin.supply.disruption.confirm    a person (human-gated)
 *   POST /disruptions/:id/close                  twin.supply.disruption.close      a person: closed | withdrawn (human-gated)
 *   POST /disruptions/:id/map                    twin.supply.disruption.map        the map, computed before the write
 *   POST /disruptions/:id/replay                 twin.supply.read                  a recorded map re-computed on its pinned versions
 *   POST /disruptions/:id/alternatives/evaluate  twin.supply.alternative.evaluate  a person: an option on its branch alt-<key>
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { SupplyIntelCapability, type SupplyIntelReads } from './supply-intel.capabilities.js';
import { SupplyIntelService } from './supply-intel.service.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INFERENCE_STATES = ['proposed', 'validated', 'rejected', 'superseded', 'withdrawn', 'applied', 'revoked', 'reverted'];
const DISRUPTION_STATES = ['proposed', 'open', 'mapped', 'closed', 'withdrawn'];

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function id(v: unknown, what: string, correlationId: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} must be an id`), 400);
  return v;
}
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/twin-supply')
export class SupplyIntelController {
  constructor(private readonly pipeline: PipelineService, private readonly supply: SupplyIntelService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private async readRoute<T>(req: EyeRequest, tenantId: string, domainId: string, objectType: string, objectId: string | null, fn: (cap: SupplyIntelReads) => Promise<T>) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.supply.read', objectType, objectId), SupplyIntelCapability.read, (cap) => fn(cap));
    return { result: out.result, receipt: receipt(out) };
  }

  @Post('/workspace')
  async workspace(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const out = await this.readRoute(req, tenantId, domainId, 'TWS', null, async (cap) => {
      const networks = await this.supply.networks(cap);
      return {
        networks, disruptions: await this.supply.listDisruptions(cap, null), inferences: await this.supply.listInferences(cap, { twinId: null, state: null }),
        now: await cap.now(),
        boundary: 'AI infers and proposes; a named domain analyst validates a supply relationship; the twin\'s owner applies it; the response (supplier, inventory, routing, contract) is a decision of the decision layer — this workspace evaluates options, it never decides',
      };
    });
    return { workspace: out.result, receipt: out.receipt };
  }

  @Post('/networks/:twinId')
  async network(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinIdRaw: string, @Body() body: { payload?: { version?: number } }) {
    const { envelope } = ctx(req);
    const twinId = id(twinIdRaw, 'twinId', envelope.correlation_id);
    const v = body.payload?.version;
    const out = await this.readRoute(req, tenantId, domainId, 'TWN', twinId, async (cap) => this.supply.networkView(cap, twinId, Number.isInteger(v) && (v as number) >= 1 ? (v as number) : null));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized twin matches'), 404);
    return { network: out.result, receipt: out.receipt };
  }

  @Post('/record-sources/declare')
  async declareRecordSource(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = id(p['twinId'], 'twinId', envelope.correlation_id);
    const sourceKey = text(p['sourceKey']);
    if (sourceKey === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'sourceKey names the source contract whose records are read'), 422);
    return this.supply.declareRecordSource(envelope, principal, tenantId, domainId, { twinId, sourceKey, note: text(p['note']), retire: p['retire'] === true, reason: text(p['reason']) });
  }

  @Post('/inferences/list')
  async listInferences(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope } = ctx(req);
    const p = body.payload ?? {};
    const twinId = p['twinId'] === undefined || p['twinId'] === null ? null : id(p['twinId'], 'twinId', envelope.correlation_id);
    const state = typeof p['state'] === 'string' && INFERENCE_STATES.includes(p['state']) ? p['state'] : null;
    const out = await this.readRoute(req, tenantId, domainId, 'TWS', null, async (cap) => this.supply.listInferences(cap, { twinId, state }));
    return { inferences: out.result, receipt: out.receipt };
  }

  @Post('/inferences/:inferenceId/read')
  async readInference(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('inferenceId') raw: string) {
    const { envelope } = ctx(req);
    const inferenceId = id(raw, 'inferenceId', envelope.correlation_id);
    const out = await this.readRoute(req, tenantId, domainId, 'TWS', inferenceId, async (cap) => this.supply.getInference(cap, inferenceId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `supply inference rejected (unknown_inference): ${inferenceId} is not an inference of this domain`), 404);
    return { inference: out.result, receipt: out.receipt };
  }

  /** The draft as a route: the agent's governed write (its scan makes the same one); anyone else is refused at the PDP, and at the port. */
  @Post('/inferences/draft')
  async draft(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = id(p['twinId'], 'twinId', envelope.correlation_id);
    const agentId = id(p['agentId'], 'agentId', envelope.correlation_id);
    const runId = id(p['runId'], 'runId', envelope.correlation_id);
    if (!Number.isInteger(p['version']) || Number(p['version']) < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'version is the admitted version the inference read'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.supply.inference.draft', 'TWN', twinId), SupplyIntelCapability.draft,
      async (cap, scope) => ({ result: await cap.draftInferences({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, twinId, version: Number(p['version']),
        reads: Array.isArray(p['reads']) ? p['reads'] : [], inferences: Array.isArray(p['inferences']) ? p['inferences'] : [], withdraw: Array.isArray(p['withdraw']) ? p['withdraw'] : [],
        agentId, runId, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'TWN', targetId: twinId, targetVersion: String(p['version']), outboxEvent: null }));
    return { draft: out.result, receipt: receipt(out) };
  }

  @Post('/inferences/:inferenceId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('inferenceId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const inferenceId = id(raw, 'inferenceId', envelope.correlation_id);
    const p = body.payload ?? {};
    if (p['decision'] !== 'validated' && p['decision'] !== 'rejected') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'supply inference rejected (decision): a decision is validated or rejected'), 422);
    const until = text(p['validUntil']);
    if (until !== null && Number.isNaN(Date.parse(until))) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'supply inference rejected (expiry): validUntil is an instant'), 422);
    return this.supply.decideInference(envelope, principal, tenantId, domainId, inferenceId,
      { decision: p['decision'], reason: text(p['reason']), digest: text(p['digest']), validUntil: until === null ? null : new Date(until).toISOString() });
  }

  @Post('/inferences/:inferenceId/apply')
  async apply(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('inferenceId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const inferenceId = id(raw, 'inferenceId', envelope.correlation_id);
    const p = body.payload ?? {};
    const entityId = p['entityId'] === undefined || p['entityId'] === null ? null : id(p['entityId'], 'entityId', envelope.correlation_id);
    const capacity = num(p['capacityPerDay']); const lead = num(p['leadDays']);
    if (p['capacityPerDay'] !== undefined && p['capacityPerDay'] !== null && (capacity === null || capacity < 0)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'supply inference rejected (capacity): capacityPerDay is a quantity per day, never negative'), 422);
    if (p['leadDays'] !== undefined && p['leadDays'] !== null && (lead === null || lead < 0 || lead > 365)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'supply inference rejected (shape): leadDays is a number of days in [0, 365]'), 422);
    return this.supply.applyInference(envelope, principal, tenantId, domainId, inferenceId, { capacityPerDay: capacity, leadDays: lead, entityId, allowIncomplete: p['allowIncomplete'] === true });
  }

  @Post('/inferences/:inferenceId/revert')
  async revert(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('inferenceId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const inferenceId = id(raw, 'inferenceId', envelope.correlation_id);
    return this.supply.revertInference(envelope, principal, tenantId, domainId, inferenceId, body.payload?.['allowIncomplete'] === true);
  }

  @Post('/inferences/:inferenceId/record')
  async record(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('inferenceId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const inferenceId = id(raw, 'inferenceId', envelope.correlation_id);
    const p = body.payload ?? {};
    if (p['mode'] !== 'apply' && p['mode'] !== 'revert') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'supply inference rejected (mode): the mode is apply or revert'), 422);
    if (!Number.isInteger(p['version']) || Number(p['version']) < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'supply inference rejected (application): version is the admitted version on actual'), 422);
    return this.supply.recordInference(envelope, principal, tenantId, domainId, inferenceId, p['mode'], Number(p['version']));
  }

  @Post('/disruptions/list')
  async listDisruptions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const s = body.payload?.['state'];
    const out = await this.readRoute(req, tenantId, domainId, 'TWS', null, async (cap) => this.supply.listDisruptions(cap, typeof s === 'string' && DISRUPTION_STATES.includes(s) ? s : null));
    return { disruptions: out.result, receipt: out.receipt };
  }

  @Post('/disruptions/:disruptionId/read')
  async readDisruption(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('disruptionId') raw: string) {
    const { envelope } = ctx(req);
    const disruptionId = id(raw, 'disruptionId', envelope.correlation_id);
    const out = await this.readRoute(req, tenantId, domainId, 'TWS', disruptionId, async (cap) => this.supply.getDisruption(cap, disruptionId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `supply disruption rejected (unknown_disruption): ${disruptionId} is not a disruption of this domain`), 404);
    return { disruption: out.result, receipt: out.receipt };
  }

  @Post('/disruptions/open')
  async open(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `supply disruption rejected (shape): ${m}`), 422); };
    const signal = typeof p['signal'] === 'object' && p['signal'] !== null && !Array.isArray(p['signal']) ? p['signal'] as Row : bad('signal is {kind, ref?, version?, note?}');
    const chokepoints = Array.isArray(p['chokepoints']) ? (p['chokepoints'] as unknown[]).filter((c): c is string => typeof c === 'string') : [];
    const places = Array.isArray(p['places']) ? (p['places'] as unknown[]).filter((x): x is Row => typeof x === 'object' && x !== null) : [];
    const derating = num(p['derating']) ?? bad('derating is the share of capacity an affected route loses, in (0, 1]');
    const telemetry = p['telemetryTwinId'] === undefined || p['telemetryTwinId'] === null ? null : id(p['telemetryTwinId'], 'telemetryTwinId', envelope.correlation_id);
    const agentId = p['agentId'] === undefined || p['agentId'] === null ? null : id(p['agentId'], 'agentId', envelope.correlation_id);
    const runId = p['runId'] === undefined || p['runId'] === null ? null : id(p['runId'], 'runId', envelope.correlation_id);
    return this.supply.openDisruption(envelope, principal, tenantId, domainId, { title: typeof p['title'] === 'string' ? p['title'] : '', signal, chokepoints, places, derating,
      durationDays: num(p['durationDays']), telemetryTwinId: telemetry, agentId, runId });
  }

  @Post('/disruptions/:disruptionId/confirm')
  async confirm(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('disruptionId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    return this.supply.settleDisruption(envelope, principal, tenantId, domainId, id(raw, 'disruptionId', envelope.correlation_id), 'open', text(body.payload?.['reason']));
  }

  @Post('/disruptions/:disruptionId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('disruptionId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const to = body.payload?.['to'];
    if (to !== 'closed' && to !== 'withdrawn') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'supply disruption rejected (shape): to is closed or withdrawn'), 422);
    return this.supply.settleDisruption(envelope, principal, tenantId, domainId, id(raw, 'disruptionId', envelope.correlation_id), to, text(body.payload?.['reason']));
  }

  @Post('/disruptions/:disruptionId/map')
  async map(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('disruptionId') raw: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.supply.map(envelope, principal, tenantId, domainId, id(raw, 'disruptionId', envelope.correlation_id), null);
    return { map: out.map, result: out.result, pinned: out.pinned, receipt: out.receipt };
  }

  @Post('/disruptions/:disruptionId/replay')
  async replay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('disruptionId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope } = ctx(req);
    const disruptionId = id(raw, 'disruptionId', envelope.correlation_id);
    const n = body.payload?.['mapNo'];
    const out = await this.readRoute(req, tenantId, domainId, 'TWS', disruptionId, async (cap) => this.supply.replay(cap, tenantId, disruptionId, Number.isInteger(n) ? Number(n) : null));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `supply disruption rejected (unknown_map): disruption ${disruptionId} has no such map`), 404);
    return { replay: out.result, receipt: out.receipt };
  }

  @Post('/disruptions/:disruptionId/alternatives/evaluate')
  async evaluate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('disruptionId') raw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const disruptionId = id(raw, 'disruptionId', envelope.correlation_id);
    const intake = SupplyIntelService.alternativeIntake(body.payload ?? {}, envelope.correlation_id);
    return this.supply.evaluate(envelope, principal, tenantId, domainId, disruptionId, intake);
  }
}
