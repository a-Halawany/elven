/**
 * THE HTTP SURFACE OF THE SEMANTIC LAYER — CP-6 B90 §M (migration 0095 §M; F-P7-F-10). The prelude's envelope, capabilities and
 * receipts: every write is one governed write whose port asserts the route's own action (EXACT PDP rules, the `B90 metrics` block); every
 * read is a consequential read under products.metric.read. The routes live under /products/metrics/… of the domain, beside the registry's
 * (their shapes never collide with the prelude's /:productId/{declare,reviews,release,slo,read}: this controller's second segment is a
 * model id or a metric key and its third a verb of its own). Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { MetricCapability } from './metrics.capabilities.js';
import { MetricsService, assertUuid, instantOf, reasonOf, validateCertify, validateDefinition, validateServe } from './metrics.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const limitOf = (p: Row): number => (typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(500, Math.trunc(p['limit'] as number))) : 200);
const KEY = /^[a-z0-9][a-z0-9.-]{1,63}$/;

@Controller('/v1/tenants/:tenantId/domains/:domainId/products/metrics')
export class MetricsController {
  constructor(private readonly pipeline: PipelineService, private readonly metrics: MetricsService) {}
  private route(tenantId: string, domainId: string, action: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: 'MET', objectId };
  }

  /** The models of the domain (state optional) with their standing. */
  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.metric.read', null), MetricCapability.read,
      async (cap) => ({ at: await cap.now(), metrics: await cap.list({ state: typeof p['state'] === 'string' ? p['state'] : null, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** The measure whitelist: the names, sources, grains, dimensions and aggregations a definition may use. */
  @Post('/catalog')
  async catalog(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.metric.read', null), MetricCapability.read,
      async (cap) => ({ at: await cap.now(), measures: await cap.catalog() }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/:modelId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('modelId') modelId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(modelId, 'model', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.metric.read', modelId), MetricCapability.read,
      async (cap) => ({ at: await cap.now(), metric: await cap.model(modelId) }));
    if (out.result.metric === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `metric rejected (unknown_metric): ${modelId} is not a semantic model of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** DEFINE (declare or re-declare) the model of a product of kind metric: the owner's or a steward's act; the next version. */
  @Post('/:modelId/define')
  async define(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('modelId') modelId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(modelId, 'model', envelope.correlation_id);
    const d = validateDefinition(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.metric.declare', modelId), MetricCapability.write,
      async (cap) => {
        // the title defaults to the product's (read under the caller's RLS; the port refuses an unknown product itself)
        const { title: given, ...definition } = d;
        const title: string = given ?? await cap.call<{ t: string }>(sqlTitle(modelId)).then((r) => r[0]?.t ?? 'metric');
        const r = await cap.declareMetric({ modelId, tenantId, domainId, ...definition, title, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'MET', targetId: modelId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { metric: out.result, receipt: receipt(out) };
  }

  /** CERTIFY (the owner): the signature, the MET object, then the port's rules. */
  @Post('/:modelId/certify')
  async certify(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('modelId') modelId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(modelId, 'model', envelope.correlation_id);
    const p = validateCertify(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.metric.certify', modelId), MetricCapability.write,
      async (cap) => {
        const r = await this.metrics.certify(cap, { tenantId, domainId }, principal, envelope.purpose_id ?? 'executive', modelId, p.version, p.expiresAt, envelope.correlation_id);
        return { result: r, targetType: 'MET', targetId: modelId, targetVersion: String(p.version), outboxEvent: null };
      });
    return { metric: out.result, receipt: receipt(out) };
  }

  /** WITHDRAW the active certification (the owner or a steward), with a reason; the servings since exposed. */
  @Post('/:modelId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('modelId') modelId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(modelId, 'model', envelope.correlation_id);
    const reason = reasonOf(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.metric.withdraw_certification', modelId), MetricCapability.write,
      async (cap) => {
        const r = await cap.withdrawCertification({ modelId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'MET', targetId: modelId, targetVersion: null, outboxEvent: null };
      });
    return { metric: out.result, receipt: receipt(out) };
  }

  /** SERVE a metric by key in the executive or the analyst view: the value(s) per grain key with the grain, the version, the source revision. */
  @Post('/:key/serve')
  async serve(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('key') key: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    if (!KEY.test(key)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'metric rejected (key): a metric key is 2–64 lower-case letters, digits, dots and dashes'), 422);
    const p = validateServe(body.payload ?? {}, envelope.correlation_id);
    const servingId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.metric.serve', null), MetricCapability.write,
      async (cap) => {
        const r = await cap.serveMetric({ servingId, tenantId, domainId, metricKey: key, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'MET', targetId: String(r['model_id']), targetVersion: String(r['version']), outboxEvent: null };
      });
    return { serving: out.result, receipt: receipt(out) };
  }

  /** RECALCULATE at a past instant (the owner or a steward): the source revision compared with the serving's; a mismatch withdraws. */
  @Post('/:modelId/recalculate')
  async recalculate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('modelId') modelId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(modelId, 'model', envelope.correlation_id);
    const asOf = instantOf((body.payload ?? {})['asOf'], 'as_of', envelope.correlation_id);
    if (asOf === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'metric rejected (as_of): a recalculation names the past instant to reproduce'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.metric.recalculate', modelId), MetricCapability.write,
      async (cap) => {
        const r = await cap.recalculateMetric({ modelId, tenantId, domainId, asOf, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'MET', targetId: modelId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { recalculation: out.result, receipt: receipt(out) };
  }
}

/** The product's title (the model's default title on its first definition). */
function sqlTitle(modelId: string) { return sql`select title as t from products.products_current where product_id = ${modelId}::uuid`; }
