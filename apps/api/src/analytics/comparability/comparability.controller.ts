/**
 * B92 §CO (0113 §CO) — THE COMPARABILITY SURFACE. Base `/v1/tenants/:t/domains/:d/analytics` (beside the prelude's compute surface).
 *
 *   comparisons/run                       analytics.comparison.run — {a, b} each {resultId} or {period, scopeKey?, cohort? | cohortObjectId?, asOf?}
 *                                         (+ metricKey when a side is asked for by period; cohortObjectA/B naming a certified cohort for a resultId side)
 *   comparisons/list · comparisons/:id/read   analytics.read
 *   reconciliations/run                   analytics.reconciliation.run — {period, tolerance?}
 *   reconciliations/list · costs/list     analytics.read — the reconciliations; the meter's rows (period?)
 *   semantic-objects/declare              products.semantic.declare (human-gated) — {objectId?, key, kind, title, definition, owner}
 *   semantic-objects/list · semantic-objects/:id/read   products.semantic.read
 *   semantic-objects/:id/certify          products.semantic.certify (human-gated) — {version, digest, expiresAt, reason}
 *   semantic-objects/:id/withdraw         products.semantic.withdraw (human-gated) — {reason}
 *
 * The semantic objects are B90's layer (products.*) but live under this base: `/products/semantic-objects/<verb>` would collide with B90's
 * `/products/:productId/<verb>` routes (stated for the integrator). Refusals in the server's words (`cohort comparison rejected (<class>)`,
 * `cost reconciliation rejected (<class>)`, `semantic object rejected (<class>)`); a route refuses only its caller's own malformed request.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { PERIOD_RE, PERSON_DIMENSIONS, refuseAnalytics, type AnalyticsNoun } from '../seams.js';
import { ComparabilityService, type Side } from './comparability.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$/;
const KINDS = ['cohort', 'relationship', 'analytical_model'];

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const optStr = (p: Row, k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);
const limitOf = (p: Row, dflt: number): number => (typeof p['limit'] === 'number' && Number.isInteger(p['limit']) ? Number(p['limit']) : dflt);
function idOf(v: unknown, what: string, noun: AnalyticsNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseAnalytics(noun, 'request', `${what} is an id`, cid);
  return v;
}
function optId(v: unknown, what: string, noun: AnalyticsNoun, cid: string): string | null { return v === undefined || v === null ? null : idOf(v, what, noun, cid); }

/** One side of a comparison, validated: a result id, or a period with an optional scope, cohort (never a person) or cohort object. */
export function parseSide(v: unknown, label: string, cid: string): Side {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw refuseAnalytics('cohort comparison', 'request', `payload.${label} is {resultId} or {period, scopeKey?, cohort?, cohortObjectId?}`, cid);
  const s = v as Row;
  if (s['resultId'] !== undefined) return { resultId: idOf(s['resultId'], `payload.${label}.resultId`, 'cohort comparison', cid) };
  const period = optStr(s, 'period');
  if (period === null || !PERIOD_RE.test(period)) throw refuseAnalytics('cohort comparison', 'period', `payload.${label}.period is 2026-Q3, 2026-09 or R90@2026-10-12`, cid);
  const cohort = s['cohort'] ?? null;
  if (cohort !== null && (typeof cohort !== 'object' || Array.isArray(cohort))) throw refuseAnalytics('cohort comparison', 'request', `payload.${label}.cohort is an object {dimension: value}`, cid);
  const person = Object.keys((cohort ?? {}) as Row).filter((k) => (PERSON_DIMENSIONS as readonly string[]).includes(k));
  if (person.length > 0) throw refuseAnalytics('cohort comparison', 'person', `a cohort is never a person-grained group (${person.join(', ')}): no employee-performance inference`, cid, 403);
  const cohortObjectId = optId(s['cohortObjectId'], `payload.${label}.cohortObjectId`, 'cohort comparison', cid);
  if (cohortObjectId !== null && cohort !== null && Object.keys(cohort as Row).length > 0) {
    throw refuseAnalytics('cohort comparison', 'request', `payload.${label} names a cohort object OR a cohort, not both (the object's criteria are the cohort)`, cid);
  }
  const asOf = optStr(s, 'asOf');
  if (asOf !== null && Number.isNaN(Date.parse(asOf))) throw refuseAnalytics('cohort comparison', 'request', `payload.${label}.asOf is an instant`, cid);
  return { period, scopeKey: optStr(s, 'scopeKey'), cohort: (cohort ?? null) as Row | null, cohortObjectId, asOf };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics')
export class ComparabilityController {
  constructor(private readonly svc: ComparabilityService) {}

  // ── the cohort comparison ──
  @Post('/comparisons/run')
  async runComparison(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const metricKey = optStr(p, 'metricKey');
    if (metricKey !== null && !KEY.test(metricKey)) throw refuseAnalytics('cohort comparison', 'request', 'payload.metricKey names a metric (e.g. MET-022)', cid);
    const a = parseSide(p['a'], 'a', cid); const b = parseSide(p['b'], 'b', cid);
    return this.svc.runComparison(envelope, principal, t, d, { metricKey, a, b,
      cohortObjectA: optId(p['cohortObjectA'], 'payload.cohortObjectA', 'cohort comparison', cid), cohortObjectB: optId(p['cohortObjectB'], 'payload.cohortObjectB', 'cohort comparison', cid) });
  }
  @Post('/comparisons/list')
  async comparisons(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    return this.svc.comparisons(envelope, principal, t, d, optStr(p, 'metricKey'), limitOf(p, 50));
  }
  @Post('/comparisons/:comparisonId/read')
  async comparison(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('comparisonId') id: string) {
    const { envelope, principal } = ctx(req);
    idOf(id, 'the comparison', 'cohort comparison', envelope.correlation_id);
    const out = await this.svc.comparison(envelope, principal, t, d, id);
    if (out.comparison === null) throw refuseAnalytics('cohort comparison', 'unknown_comparison', `${id} is not a comparison of this domain`, envelope.correlation_id, 404);
    return out;
  }

  // ── the cost reconciliation ──
  @Post('/reconciliations/run')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const period = optStr(p, 'period');
    if (period === null || !PERIOD_RE.test(period)) throw refuseAnalytics('cost reconciliation', 'period', 'payload.period is 2026-Q3, 2026-09 or R90@2026-10-12', cid);
    const tol = p['tolerance'];
    if (tol !== undefined && tol !== null && (typeof tol !== 'number' || tol < 0 || tol > 1)) throw refuseAnalytics('cost reconciliation', 'tolerance', 'payload.tolerance is a share between 0 and 1', cid);
    return this.svc.reconcile(envelope, principal, t, d, { period, tolerance: typeof tol === 'number' ? tol : null });
  }
  @Post('/reconciliations/list')
  async reconciliations(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.reconciliations(envelope, principal, t, d, limitOf(body.payload ?? {}, 50));
  }
  @Post('/costs/list')
  async costs(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const period = optStr(p, 'period');
    if (period !== null && !PERIOD_RE.test(period)) throw refuseAnalytics('cost reconciliation', 'period', 'payload.period is 2026-Q3, 2026-09 or R90@2026-10-12', envelope.correlation_id);
    return this.svc.costs(envelope, principal, t, d, period, limitOf(p, 100));
  }

  // ── DP-44-001: the governed semantic objects ──
  @Post('/semantic-objects/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const key = optStr(p, 'key'); const kind = optStr(p, 'kind'); const title = optStr(p, 'title');
    if (key === null || title === null) throw refuseAnalytics('semantic object', 'request', 'payload.key and payload.title are stated', cid);
    if (kind === null || !KINDS.includes(kind)) throw refuseAnalytics('semantic object', 'kind', `payload.kind is ${KINDS.join(', ')}`, cid);
    const def = p['definition'];
    if (typeof def !== 'object' || def === null || Array.isArray(def)) throw refuseAnalytics('semantic object', 'definition', 'payload.definition is an object', cid);
    return this.svc.declare(envelope, principal, t, d, { objectId: optId(p['objectId'], 'payload.objectId', 'semantic object', cid), key, kind, title, definition: def as Row,
      owner: idOf(p['owner'], 'payload.owner', 'semantic object', cid) });
  }
  @Post('/semantic-objects/list')
  async objects(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const kind = optStr(p, 'kind');
    if (kind !== null && !KINDS.includes(kind)) throw refuseAnalytics('semantic object', 'kind', `payload.kind is ${KINDS.join(', ')}`, envelope.correlation_id);
    return this.svc.semanticObjects(envelope, principal, t, d, kind);
  }
  @Post('/semantic-objects/:objectId/read')
  async object(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('objectId') id: string) {
    const { envelope, principal } = ctx(req);
    idOf(id, 'the semantic object', 'semantic object', envelope.correlation_id);
    const out = await this.svc.semanticObject(envelope, principal, t, d, id);
    if (out.object === null) throw refuseAnalytics('semantic object', 'unknown_semantic_object', `${id} is not a semantic object of this domain`, envelope.correlation_id, 404);
    return out;
  }
  @Post('/semantic-objects/:objectId/certify')
  async certify(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('objectId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    idOf(id, 'the semantic object', 'semantic object', cid);
    const version = p['version'];
    if (typeof version !== 'number' || !Number.isInteger(version)) throw refuseAnalytics('semantic object', 'request', 'payload.version is the version read', cid);
    const digest = optStr(p, 'digest'); const expiresAt = optStr(p, 'expiresAt'); const reason = optStr(p, 'reason') ?? '';
    if (digest === null || !/^[0-9a-f]{64}$/.test(digest)) throw refuseAnalytics('semantic object', 'request', 'payload.digest is the version digest the owner read', cid);
    if (expiresAt === null || Number.isNaN(Date.parse(expiresAt))) throw refuseAnalytics('semantic object', 'expiry', 'payload.expiresAt is an instant', cid);
    if (reason.length < 8) throw refuseAnalytics('semantic object', 'reason', 'a certification says why (8+ characters)', cid);
    return this.svc.certify(envelope, principal, t, d, id, { version, digest, expiresAt, reason });
  }
  @Post('/semantic-objects/:objectId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('objectId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    idOf(id, 'the semantic object', 'semantic object', cid);
    const reason = optStr(p, 'reason') ?? '';
    if (reason.length < 8) throw refuseAnalytics('semantic object', 'reason', 'a withdrawal says why (8+ characters)', cid);
    return this.svc.withdraw(envelope, principal, t, d, id, reason);
  }
}
