/**
 * THE HTTP SURFACE OF THE DATA PRODUCT REGISTRY — CP-6 B90 §0 (migration 0095; F-P7-F-09/-10/-11's shared core). Same envelope, same
 * capabilities, same receipts as the executive controllers: every write is one governed write whose port asserts the route's own action
 * (an EXACT PDP rule, the B90 prelude block); every read is a consequential read under products.product.read. The routes live under
 * /products/… of the domain; the parts add their own controllers beside this one (§R consumers, §E events, §M metrics, §K catalog).
 * Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { ProductCapability } from './products.capabilities.js';
import { ProductsService, assertUuid, validateDeclaration, validateObservation, validateRegister, validateReview, validateVersion } from './products.service.js';

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

@Controller('/v1/tenants/:tenantId/domains/:domainId/products')
export class ProductsController {
  constructor(private readonly pipeline: PipelineService, private readonly products: ProductsService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** REGISTER a product (the owner's or a steward's act): the identity, the kind, the purpose, the OWNER. */
  @Post('/register')
  async register(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateRegister(body.payload ?? {}, envelope.correlation_id);
    const productId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.register', 'DPR', productId), ProductCapability.write,
      async (cap) => {
        const r = await cap.registerProduct({ productId, tenantId, domainId, ...p, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: '0', outboxEvent: null };
      });
    return { product: out.result, receipt: receipt(out) };
  }

  /** DECLARE a version: the contract, the serving modes, the inputs and outputs, the SLO, the policy, the cost, the quality. */
  @Post('/:productId/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(productId, 'product', envelope.correlation_id);
    const declaration = validateDeclaration(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.declare', 'DPR', productId), ProductCapability.write,
      async (cap) => {
        const r = await cap.declareVersion({ productId, tenantId, domainId, declaration, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { product: out.result, receipt: receipt(out) };
  }

  /** RECORD a review (admission / domain / retirement) of a declared version — a named human other than the owner. */
  @Post('/:productId/reviews')
  async review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(productId, 'product', envelope.correlation_id);
    const p = validateReview(body.payload ?? {}, envelope.correlation_id);
    const reviewId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.review', 'DPR', productId), ProductCapability.write,
      async (cap) => {
        const r = await cap.recordReview({ reviewId, productId, tenantId, domainId, ...p, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(p.version), outboxEvent: null };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  /** RELEASE a version (the owner): the DPR admitted, then the port's publication denial rules. */
  @Post('/:productId/release')
  async release(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(productId, 'product', envelope.correlation_id);
    const version = validateVersion(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.release', 'DPR', productId), ProductCapability.write,
      async (cap) => {
        const r = await this.products.release(cap, { tenantId, domainId }, principal, envelope.purpose_id ?? 'executive', productId, version, envelope.correlation_id);
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(version), outboxEvent: null };
      });
    return { product: out.result, receipt: receipt(out) };
  }

  /** OBSERVE an SLO measure on a product (a human's or a probe's own observation; the parts' steps observe under their own actions). */
  @Post('/:productId/slo')
  async observe(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(productId, 'product', envelope.correlation_id);
    const p = validateObservation(body.payload ?? {}, envelope.correlation_id);
    const observationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.slo.observe', 'DPR', productId), ProductCapability.write,
      async (cap) => {
        const r = await cap.observeSlo({ observationId, productId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: null, outboxEvent: null };
      });
    return { observation: out.result, receipt: receipt(out) };
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.product.read', 'DPR', null), ProductCapability.read,
      async (cap) => ({ at: await cap.now(), products: await cap.list({ state: typeof p['state'] === 'string' ? p['state'] : null, kind: typeof p['kind'] === 'string' ? p['kind'] : null, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/:productId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(productId, 'product', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.product.read', 'DPR', productId), ProductCapability.read,
      async (cap) => ({ at: await cap.now(), product: await cap.product(productId) }));
    if (out.result.product === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `data product rejected (unknown_product): ${productId} is not a product of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }
}
