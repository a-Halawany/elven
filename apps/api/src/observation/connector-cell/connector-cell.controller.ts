/**
 * CP-6 B40 §CR (0123_b40_x_cr) — THE CONNECTORS AND THE EGRESS RECEIPTS: a further controller on the observation base path (inside the
 * existing api.observation unit — the B82 idiom), so ObservationController is untouched.
 *
 *   POST …/observation/connectors/read                              {}                                observation.connectors.read — packages,
 *        adapter contracts with their package in force, requalifications, credential bindings (references only)
 *   POST …/observation/egress/read                                  {sourceId?, runId?, limit?}       observation.egress.read — the transfer
 *        receipts (digests, sizes, destinations, decisions; never bytes — D9) and their counts
 *   POST …/observation/adapters/register                            {files: [{file, base64}], requestId?}   observation.adapter.register (human-gated)
 *   POST …/observation/adapters/:packageId/decide                   {decision, reason, expectedDigest, requestId?}  observation.adapter.approve (human-gated;
 *        the port refuses the registrant, an agent and an external collaborator — D12)
 *   POST …/observation/requalifications/:requalificationId/submit   {packageId?, reason, requestId?}  observation.connector.requalification.submit
 *        (human-gated) — the contract tests are RUN HERE in a cell (no publisher), then recorded with the submission
 *   POST …/observation/requalifications/:requalificationId/decide   {decision, reason, expectedDigest, requestId?}  observation.connector.requalification.approve
 *        (human-gated; a second person ≠ the submitter)
 *   POST …/observation/connectors/:sourceId/credential/rotate       {contractVersion, ref, header, reason, requestId?}
 *        observation.connector.credential.rotate (human-gated) — a REFERENCE, never a value
 *
 * Refusals answer in the server's words. The ports' nouns (adapter package, egress receipt, connector suspension, requalification,
 * credential rotation, connector cell) are mapped here by their class until the integrator maps them centrally (observation-errors.ts):
 * 403 actor|authority|separation_of_duties · 404 unknown_* · 409 state|stale|duplicate|held|expired · 422 otherwise.
 * CONSTRUCTION only.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { CellCapability } from './cell.capabilities.js';
import { ConnectorCellService } from './connector-cell.service.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOUNS = /^(adapter package|egress receipt|connector suspension|requalification|credential rotation|connector cell) rejected \(([a-z_]+)\)/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const unprocessable = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const pathId = (v: string, what: string, correlationId: string): string => {
  if (!UUID_RE.test(v)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${what} ${v} is not an id of this domain`), 404);
  return v.toLowerCase();
};
const requestIdOf = (p: Row): string => (typeof p['requestId'] === 'string' && UUID_RE.test(p['requestId']) ? (p['requestId'] as string).toLowerCase() : newId());

/** A port's class-form refusal → its status, in the server's words; anything else passes through unchanged. */
export function cellRefusal(e: unknown, correlationId: string): unknown {
  if (e instanceof HttpException) return e;
  const message = e instanceof Error ? e.message : '';
  const m = NOUNS.exec(message);
  if (m === null) return e;
  const cls = (m[2] ?? '').toLowerCase();
  if (['actor', 'authority', 'separation_of_duties'].includes(cls)) return new HttpException(errorBody('EYE_AUT_001', correlationId, message), 403);
  if (cls.startsWith('unknown_')) return new HttpException(errorBody('EYE_STA_001', correlationId, message), 404);
  if (['state', 'stale', 'duplicate', 'held', 'expired'].includes(cls)) return new HttpException(errorBody('EYE_STA_002', correlationId, message), 409);
  return new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422);
}
const mapped = async <T>(correlationId: string, p: Promise<T>): Promise<T> => p.catch((e: unknown) => { throw cellRefusal(e, correlationId); });

@Controller('/v1/tenants/:tenantId/domains/:domainId/observation')
export class ConnectorCellController {
  constructor(private readonly pipeline: PipelineService, private readonly cells: ConnectorCellService) {}

  @Post('/connectors/read')
  async readConnectors(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await mapped(envelope.correlation_id, this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.connectors.read', objectType: 'ADP', objectId: null },
      CellCapability.registerRead, async (cap) => cap.register({ tenantId, domainId })));
    return { connectors: out.result, receipt: receipt(out) };
  }

  @Post('/egress/read')
  async readEgress(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const corr = envelope.correlation_id;
    const sourceId = p['sourceId'] === undefined || p['sourceId'] === null ? null : typeof p['sourceId'] === 'string' && UUID_RE.test(p['sourceId']) ? (p['sourceId'] as string).toLowerCase() : unprocessable(corr, 'egress receipt rejected (request): sourceId is a source (a uuid) or absent');
    const runId = p['runId'] === undefined || p['runId'] === null ? null : typeof p['runId'] === 'string' && UUID_RE.test(p['runId']) ? (p['runId'] as string).toLowerCase() : unprocessable(corr, 'egress receipt rejected (request): runId is a run (a uuid) or absent');
    const limit = p['limit'] === undefined ? 200 : Number.isSafeInteger(p['limit']) && (p['limit'] as number) >= 1 && (p['limit'] as number) <= 1000 ? p['limit'] as number : unprocessable(corr, 'egress receipt rejected (request): limit is 1 to 1000');
    const out = await mapped(corr, this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.egress.read', objectType: 'EGR', objectId: runId ?? sourceId },
      CellCapability.receiptsRead, async (cap) => cap.receipts({ tenantId, domainId, sourceId, runId, limit })));
    return { egress: out.result, receipt: receipt(out) };
  }

  @Post('/adapters/register')
  async registerAdapter(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const corr = envelope.correlation_id;
    const raw = Array.isArray(p['files']) ? p['files'] as Row[] : unprocessable(corr, 'adapter package rejected (files): files is a list of { file, base64 }');
    const files = raw.map((f) => {
      if (typeof f !== 'object' || f === null || typeof f['file'] !== 'string' || typeof f['base64'] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(f['base64'])) {
        return unprocessable(corr, 'adapter package rejected (files): each file is { file, base64 }');
      }
      return { file: f['file'], bytes: Buffer.from(f['base64'], 'base64') };
    });
    const out = await mapped(corr, this.cells.registerPackage(envelope, principal, { tenantId, domainId }, { requestId: requestIdOf(p), files }));
    return { package: out.result, receipt: receipt(out) };
  }

  @Post('/adapters/:packageId/decide')
  async decideAdapter(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const packageId = pathId(packageIdRaw, 'adapter package', corr);
    const p = body?.payload ?? {};
    const decision = p['decision'] === 'approve' || p['decision'] === 'reject' ? p['decision'] : unprocessable(corr, 'adapter package rejected (decision): decision is approve or reject');
    const reason = typeof p['reason'] === 'string' ? p['reason'] : unprocessable(corr, 'adapter package rejected (reason): a decision states its reason');
    // the digest the decider REVIEWED: the port refuses a decision naming another (stale) — a server-enforced binding
    const expectedDigest = typeof p['expectedDigest'] === 'string' && /^[0-9a-f]{64}$/.test(p['expectedDigest']) ? p['expectedDigest'] : unprocessable(corr, 'adapter package rejected (digest): expectedDigest is the package digest you reviewed');
    const out = await mapped(corr, this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.adapter.approve', objectType: 'ADP', objectId: packageId },
      CellCapability.decide,
      async (cap) => {
        const r = await cap.decide({ requestId: requestIdOf(p), tenantId, domainId, packageId, decision, reason, expectedDigest, actor: principal.principalId, correlationId: corr });
        return { result: r, targetType: 'ADP', targetId: packageId, targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      }));
    return { package: out.result, receipt: receipt(out) };
  }

  @Post('/requalifications/:requalificationId/submit')
  async submitRequalification(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requalificationId') idRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const requalificationId = pathId(idRaw, 'requalification', corr);
    const p = body?.payload ?? {};
    const packageId = p['packageId'] === undefined || p['packageId'] === null ? null : typeof p['packageId'] === 'string' && UUID_RE.test(p['packageId']) ? (p['packageId'] as string).toLowerCase() : unprocessable(corr, 'requalification rejected (package): packageId is an adapter package (a uuid) or absent (the package in force)');
    const reason = typeof p['reason'] === 'string' ? p['reason'] : unprocessable(corr, 'requalification rejected (reason): a submission states what changed');
    const out = await mapped(corr, this.cells.submitRequalification(envelope, principal, { tenantId, domainId }, { requestId: requestIdOf(p), requalificationId, packageId, reason }));
    return { requalification: out.result, contractTests: out.contractTests, receipt: receipt(out) };
  }

  @Post('/requalifications/:requalificationId/decide')
  async decideRequalification(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requalificationId') idRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const requalificationId = pathId(idRaw, 'requalification', corr);
    const p = body?.payload ?? {};
    const decision = p['decision'] === 'approve' || p['decision'] === 'reject' ? p['decision'] : unprocessable(corr, 'requalification rejected (decision): decision is approve or reject');
    const reason = typeof p['reason'] === 'string' ? p['reason'] : unprocessable(corr, 'requalification rejected (reason): a decision states its reason');
    // the package digest the decider REVIEWED (with its contract tests): the port refuses a decision naming another (stale)
    const expectedDigest = typeof p['expectedDigest'] === 'string' && /^[0-9a-f]{64}$/.test(p['expectedDigest']) ? p['expectedDigest'] : unprocessable(corr, 'requalification rejected (digest): expectedDigest is the submitted package digest you reviewed');
    const out = await mapped(corr, this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.connector.requalification.approve', objectType: 'RQL', objectId: requalificationId },
      CellCapability.decideRequalification,
      async (cap) => {
        const r = await cap.decide({ requestId: requestIdOf(p), tenantId, domainId, requalificationId, decision, reason, expectedDigest, actor: principal.principalId, correlationId: corr });
        return { result: r, targetType: 'RQL', targetId: requalificationId, targetVersion: null, outboxEvent: null };
      }));
    return { requalification: out.result, receipt: receipt(out) };
  }

  @Post('/connectors/:sourceId/credential/rotate')
  async rotateCredential(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const sourceId = pathId(sourceIdRaw, 'source', corr);
    const p = body?.payload ?? {};
    const contractVersion = Number.isSafeInteger(p['contractVersion']) && (p['contractVersion'] as number) >= 1 ? p['contractVersion'] as number : unprocessable(corr, 'credential rotation rejected (request): contractVersion is the adapter contract version (an integer of 1 or more)');
    const ref = typeof p['ref'] === 'string' ? p['ref'] : unprocessable(corr, 'credential rotation rejected (reference): ref names the deployment reference EYE_SRC_<NAME>');
    const header = typeof p['header'] === 'string' ? p['header'] : 'authorization';
    const reason = typeof p['reason'] === 'string' ? p['reason'] : unprocessable(corr, 'credential rotation rejected (reason): a rotation states why');
    const out = await mapped(corr, this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.connector.credential.rotate', objectType: 'SRC', objectId: sourceId },
      CellCapability.rotate,
      async (cap) => {
        const r = await cap.rotate({ requestId: requestIdOf(p), tenantId, domainId, sourceId, contractVersion, ref, header, reason, actor: principal.principalId, correlationId: corr });
        return { result: r, targetType: 'SRC', targetId: sourceId, targetVersion: String(contractVersion),
          outboxEvent: r['suspended'] === true ? { eventType: 'SourceHealthChanged', payload: { schema_version: 'v1', source_id: sourceId, contract_version: contractVersion,
            state: 'suspended', reason: 'credential rotated — requalification required' } } : null };
      }));
    return { rotation: out.result, receipt: receipt(out) };
  }
}
