/**
 * B92 §MD (0113_b92_x_md) — THE METRIC CATALOG'S HTTP SURFACE. Base `/v1/tenants/:t/domains/:d/analytics` (beside the prelude's compute routes).
 *
 *   purposes/list                       analytics.read — the purpose register (every version, its state, who proposed and decided it)
 *   purposes/propose                    analytics.purpose.propose — {key, title, kind, description, retentionDays}
 *   purposes/:id/decide                 analytics.purpose.decide (human-gated; a privacy officer ≠ proposer) — {decision: approve|reject, digest, reason}
 *   purposes/:id/retire                 analytics.purpose.retire (human-gated; the privacy officer) — {reason}
 *   scopes/list · scopes/propose        analytics.read · analytics.scope.propose — {key, title, entityIds[], objectiveIds[], seriesKeys[], geographies[], description}
 *   scopes/:id/decide · :id/retire      analytics.scope.decide / .retire (human-gated; a product analytics owner ≠ proposer)
 *   definitions/list                    analytics.read — the latest version per key, the registry, App M's owner-role map
 *   definitions/diff                    analytics.read — {from, to}: the field-level diff of two versions
 *   definitions/propose                 analytics.definition.propose (a named human — never an agent) — {contract (MetricContract | snake_case), ownerPrincipalId}
 *   definitions/:id/decide              analytics.definition.decide (human-gated; the owner ≠ proposer) — {decision, digest, reason}
 *   definitions/:id/retire              analytics.definition.retire (human-gated) — {reason}; the answer lists the uses
 *   definitions/:metricKey/read         analytics.read — the contract card: versions, diff, results by period, uses, ledger, items
 *   uses/record · uses/list             analytics.use.record — {resultId, usedInKind, usedInId, note?, qualified?} · analytics.read
 *   serving-uses/record · /list         products.metric.use — {servingId, usedInKind, usedInId, note?} (DP-44-005) · analytics.read
 *   catalog/read                        analytics.read — the catalog (CAP-DL-11): every key's current definition with its latest results per period
 *
 * Refusals in the server's words: `analytics purpose | analytics scope | metric definition | metric use rejected (<class>): …`.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseAnalytics, type AnalyticsNoun } from '../seams.js';
import { AnalyticsDefinitionsService } from './definitions.service.js';
import { SERVING_USE_KINDS, USED_IN_KINDS, contractOfRequest } from './contract-payload.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
const optStr = (p: Row, k: string): string | null => { const v = str(p, k); return v === '' ? null : v; };
function id(v: unknown, what: string, noun: AnalyticsNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseAnalytics(noun, 'request', `${what} is an id`, cid);
  return v;
}
function list(v: unknown, what: string, noun: AnalyticsNoun, cid: string, uuids: boolean): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && (!uuids || UUID.test(x)))) throw refuseAnalytics(noun, 'request', `${what} is a list of ${uuids ? 'ids' : 'names'}`, cid);
  return [...new Set(v as string[])];
}
function decision(p: Row, noun: AnalyticsNoun, cid: string): { decision: string; digest: string; reason: string } {
  const d = str(p, 'decision');
  if (d !== 'approve' && d !== 'reject') throw refuseAnalytics(noun, 'decision', 'payload.decision is approve or reject', cid);
  const digest = str(p, 'digest');
  if (!/^[0-9a-f]{64}$/.test(digest)) throw refuseAnalytics(noun, 'request', 'payload.digest is the digest the decider read (64 hex)', cid);
  return { decision: d, digest, reason: str(p, 'reason') };
}
const limitOf = (p: Row, dflt: number) => (typeof p['limit'] === 'number' && Number.isInteger(p['limit']) ? Number(p['limit']) : dflt);

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics')
export class AnalyticsDefinitionsController {
  constructor(private readonly svc: AnalyticsDefinitionsService) {}

  /* ───────────── purposes ───────────── */
  @Post('/purposes/list')
  async purposes(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.purposes(envelope, principal, t, d);
  }
  @Post('/purposes/propose')
  async proposePurpose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const retention = p['retentionDays'];
    if (typeof retention !== 'number' || !Number.isInteger(retention)) throw refuseAnalytics('analytics purpose', 'request', 'payload.retentionDays is a whole number of days', envelope.correlation_id);
    return this.svc.proposePurpose(envelope, principal, t, d, { key: str(p, 'key'), title: str(p, 'title'), kind: str(p, 'kind'), description: str(p, 'description'), retentionDays: retention });
  }
  @Post('/purposes/:purposeId/decide')
  async decidePurpose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('purposeId') purposeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.decidePurpose(envelope, principal, t, d, id(purposeId, 'the purpose', 'analytics purpose', cid), decision(body.payload ?? {}, 'analytics purpose', cid));
  }
  @Post('/purposes/:purposeId/retire')
  async retirePurpose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('purposeId') purposeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.retirePurpose(envelope, principal, t, d, id(purposeId, 'the purpose', 'analytics purpose', cid), str(body.payload ?? {}, 'reason'));
  }

  /* ───────────── scopes ───────────── */
  @Post('/scopes/list')
  async scopes(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.scopes(envelope, principal, t, d);
  }
  @Post('/scopes/propose')
  async proposeScope(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.proposeScope(envelope, principal, t, d, {
      key: str(p, 'key'), title: str(p, 'title'), description: str(p, 'description'),
      entityIds: list(p['entityIds'], 'payload.entityIds', 'analytics scope', cid, true), objectiveIds: list(p['objectiveIds'], 'payload.objectiveIds', 'analytics scope', cid, true),
      seriesKeys: list(p['seriesKeys'], 'payload.seriesKeys', 'analytics scope', cid, false), geographies: list(p['geographies'], 'payload.geographies', 'analytics scope', cid, false),
    });
  }
  @Post('/scopes/:scopeId/decide')
  async decideScope(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('scopeId') scopeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.decideScope(envelope, principal, t, d, id(scopeId, 'the scope', 'analytics scope', cid), decision(body.payload ?? {}, 'analytics scope', cid));
  }
  @Post('/scopes/:scopeId/retire')
  async retireScope(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('scopeId') scopeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.retireScope(envelope, principal, t, d, id(scopeId, 'the scope', 'analytics scope', cid), str(body.payload ?? {}, 'reason'));
  }

  /* ───────────── definitions ───────────── */
  @Post('/definitions/list')
  async definitions(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.definitions(envelope, principal, t, d);
  }
  @Post('/definitions/diff')
  async diff(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.diff(envelope, principal, t, d, id(p['from'], 'payload.from', 'metric definition', cid), id(p['to'], 'payload.to', 'metric definition', cid));
  }
  @Post('/definitions/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const owner = optStr(p, 'ownerPrincipalId');
    if (owner !== null && !UUID.test(owner)) throw refuseAnalytics('metric definition', 'request', 'payload.ownerPrincipalId is an id', cid);
    const c = contractOfRequest(p['contract'], owner);
    if ('problem' in c) throw refuseAnalytics('metric definition', 'request', c.problem, cid);
    return this.svc.proposeDefinition(envelope, principal, t, d, c.contract);
  }
  @Post('/definitions/:definitionId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('definitionId') definitionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.decideDefinition(envelope, principal, t, d, id(definitionId, 'the definition', 'metric definition', cid), decision(body.payload ?? {}, 'metric definition', cid));
  }
  @Post('/definitions/:definitionId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('definitionId') definitionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.retireDefinition(envelope, principal, t, d, id(definitionId, 'the definition', 'metric definition', cid), str(body.payload ?? {}, 'reason'));
  }
  @Post('/definitions/:metricKey/read')
  async definition(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('metricKey') metricKey: string) {
    const { envelope, principal } = ctx(req);
    if (!KEY.test(metricKey)) throw refuseAnalytics('metric definition', 'request', 'the metric key is of the form MET-001', envelope.correlation_id);
    return this.svc.definition(envelope, principal, t, d, metricKey);
  }

  /* ───────────── uses (MD4) and B90 serving uses (MD5, DP-44-005) ───────────── */
  @Post('/uses/record')
  async recordUse(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'usedInKind');
    if (!(USED_IN_KINDS as readonly string[]).includes(kind)) throw refuseAnalytics('metric use', 'kind', `payload.usedInKind is one of ${USED_IN_KINDS.join(', ')}`, cid);
    if (p['qualified'] !== undefined && typeof p['qualified'] !== 'boolean') throw refuseAnalytics('metric use', 'request', 'payload.qualified is true or false', cid);
    return this.svc.recordUse(envelope, principal, t, d, { resultId: id(p['resultId'], 'payload.resultId', 'metric use', cid), kind, usedInId: id(p['usedInId'], 'payload.usedInId', 'metric use', cid),
      note: optStr(p, 'note'), qualified: p['qualified'] === true });
  }
  @Post('/uses/list')
  async uses(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const resultId = optStr(p, 'resultId');
    if (resultId !== null && !UUID.test(resultId)) throw refuseAnalytics('metric use', 'request', 'payload.resultId is an id', cid);
    return this.svc.uses(envelope, principal, t, d, { metricKey: optStr(p, 'metricKey'), resultId, limit: limitOf(p, 200) });
  }
  @Post('/serving-uses/record')
  async recordServingUse(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'usedInKind');
    if (!(SERVING_USE_KINDS as readonly string[]).includes(kind)) throw refuseAnalytics('metric use', 'kind', `payload.usedInKind is one of ${SERVING_USE_KINDS.join(', ')}`, cid);
    return this.svc.recordServingUse(envelope, principal, t, d, { servingId: id(p['servingId'], 'payload.servingId', 'metric use', cid), kind, usedInId: id(p['usedInId'], 'payload.usedInId', 'metric use', cid), note: optStr(p, 'note') });
  }
  @Post('/serving-uses/list')
  async servingUses(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const modelId = optStr(p, 'modelId'); const servingId = optStr(p, 'servingId');
    if ((modelId !== null && !UUID.test(modelId)) || (servingId !== null && !UUID.test(servingId))) throw refuseAnalytics('metric use', 'request', 'payload.modelId / servingId are ids', cid);
    return this.svc.servingUses(envelope, principal, t, d, { modelId, servingId, limit: limitOf(p, 200) });
  }

  /* ───────────── the catalog (CAP-DL-11) ───────────── */
  @Post('/catalog/read')
  async catalog(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.catalog(envelope, principal, t, d);
  }
}
