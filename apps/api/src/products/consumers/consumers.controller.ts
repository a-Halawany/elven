/**
 * THE HTTP SURFACE OF THE PRODUCT REGISTRY COMPLETED — CP-6 B90 §R (migration 0095 §R; F-P7-F-09's product half): the consumers, the
 * contract tests, the scorecards, the cost, the lifecycle. Same envelope, same capabilities, same receipts as the prelude's controller:
 * every write is one governed write whose port asserts the route's own action (an EXACT PDP rule, the B90 products block); every read is
 * a consequential read under products.product.read. The routes live under /products/… of the domain beside the prelude's. Nothing here
 * decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ConsumerCapability, LifecycleCapability, ScorecardCapability } from './consumers.capabilities.js';
import { ConsumersService, reasonOf, uuidOf, validateConsumerRegister, validateContractTest, validateCost, validateWindow, versionOf } from './consumers.service.js';

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
const NOUN = 'data product';

@Controller('/v1/tenants/:tenantId/domains/:domainId/products')
export class ConsumersController {
  constructor(private readonly pipeline: PipelineService, private readonly consumers: ConsumersService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /* ───────────── a. the consumers ───────────── */
  /** REGISTER a consumer of a released product: the consumer's own act (no consumerPrincipalId), or a steward's for a named consumer. */
  @Post('/:productId/consumers/register')
  async registerConsumer(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const p = validateConsumerRegister(body.payload ?? {}, principal.principalId, envelope.correlation_id);
    const consumerId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.consumer.register', 'DPR', productId), ConsumerCapability.write,
      async (cap) => {
        const r = await cap.registerConsumer({ consumerId, productId, tenantId, domainId, ...p, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(r['contract_version']), outboxEvent: null };
      });
    return { consumer: out.result, receipt: receipt(out) };
  }

  /** ACCEPT the contract (DP-05-006): THE CONSUMER's own act, naming the released version it accepts. */
  @Post('/:productId/consumers/:consumerId/accept')
  async accept(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Param('consumerId') consumerId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id); uuidOf(consumerId, `${NOUN} consumer`, 'consumer', envelope.correlation_id);
    const version = versionOf((body.payload ?? {})['version'], `${NOUN} consumer`, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.consumer.accept', 'DPR', productId), ConsumerCapability.write,
      async (cap) => {
        const r = await cap.acceptContract({ consumerId, productId, tenantId, domainId, version, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(version), outboxEvent: null };
      });
    return { consumer: out.result, receipt: receipt(out) };
  }

  /** REVOKE a consumer (the owner, the consumer itself, or a steward) with a reason. */
  @Post('/:productId/consumers/:consumerId/revoke')
  async revoke(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Param('consumerId') consumerId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id); uuidOf(consumerId, `${NOUN} consumer`, 'consumer', envelope.correlation_id);
    const reason = reasonOf((body.payload ?? {})['reason'], `${NOUN} consumer`, 'reason', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.consumer.revoke', 'DPR', productId), ConsumerCapability.write,
      async (cap) => {
        const r = await cap.revokeConsumer({ consumerId, productId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(r['contract_version']), outboxEvent: null };
      });
    return { consumer: out.result, receipt: receipt(out) };
  }

  /** MIGRATE (the consumer's own act) to the newer released version — a passing contract test of this consumer on it is required. */
  @Post('/:productId/consumers/:consumerId/migrate')
  async migrate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Param('consumerId') consumerId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id); uuidOf(consumerId, `${NOUN} consumer`, 'consumer', envelope.correlation_id);
    const version = versionOf((body.payload ?? {})['version'], `${NOUN} consumer`, envelope.correlation_id);
    const newConsumerId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.consumer.migrate', 'DPR', productId), ConsumerCapability.write,
      async (cap) => {
        const r = await cap.migrateConsumer({ consumerId, newConsumerId, productId, tenantId, domainId, version, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(version), outboxEvent: null };
      });
    return { consumer: out.result, receipt: receipt(out) };
  }

  /* ───────────── b. the contract tests ───────────── */
  /** RECORD a consumer's contract test of a declared version (pass | fail, evidence) — it also lands in the one SLO ledger as contract_test_pass. */
  @Post('/:productId/consumers/:consumerId/contract-tests')
  async contractTest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Param('consumerId') consumerId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id); uuidOf(consumerId, 'contract test', 'consumer', envelope.correlation_id);
    const p = validateContractTest(body.payload ?? {}, envelope.correlation_id);
    const testId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.contract_test', 'DPR', productId), ConsumerCapability.write,
      async (cap) => {
        const r = await cap.recordContractTest({ testId, productId, consumerId, tenantId, domainId, ...p, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(p.version), outboxEvent: null };
      });
    return { test: out.result, receipt: receipt(out) };
  }

  /* ───────────── c. the scorecard, d. the cost ───────────── */
  /** COMPUTE the scorecard on demand (the owner or a steward; the tick computes one per tick). */
  @Post('/:productId/scorecard/compute')
  async compute(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const windowDays = validateWindow(body.payload ?? {}, envelope.correlation_id);
    const scorecardId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.scorecard.compute', 'DPR', productId), ScorecardCapability.write,
      async (cap) => {
        const r = await cap.computeScorecard({ scorecardId, productId, tenantId, domainId, windowDays, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: r['released_version'] === null ? null : String(r['released_version']), outboxEvent: null };
      });
    return { scorecard: out.result, receipt: receipt(out) };
  }

  /** ATTRIBUTE a period's cost (the owner or a steward): a period once, an amount with its basis. */
  @Post('/:productId/cost')
  async cost(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const p = validateCost(body.payload ?? {}, envelope.correlation_id);
    const attributionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.cost.attribute', 'DPR', productId), ScorecardCapability.write,
      async (cap) => {
        const r = await cap.attributeCost({ attributionId, productId, tenantId, domainId, ...p, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: null, outboxEvent: null };
      });
    return { attribution: out.result, receipt: receipt(out) };
  }

  /** THE PRODUCT VIEW (a read): §0's product read and this part's scorecard read — the latest scorecard, the consumers, the tests, the cost, the observations, the events. */
  @Post('/:productId/scorecard')
  async view(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.product.read', 'DPR', productId), ScorecardCapability.read,
      async (cap) => ({ at: await cap.now(), product: await cap.product(productId), scorecard: await cap.scorecard(productId) }));
    if (out.result.product === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `data product rejected (unknown_product): ${productId} is not a product of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE REGISTRY WITH VERDICTS (a read): every product with its latest scorecard's overall (the list page). */
  @Post('/scorecards/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.product.read', 'DPR', null), ScorecardCapability.read,
      async (cap) => ({ at: await cap.now(), products: await cap.listWithScorecards({ state: typeof p['state'] === 'string' ? p['state'] : null, kind: typeof p['kind'] === 'string' ? p['kind'] : null, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /* ───────────── e. the lifecycle ───────────── */
  /** DEGRADE (the owner or a steward) with a reason — every accepted consumer notified. */
  @Post('/:productId/degrade')
  async degrade(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const reason = reasonOf((body.payload ?? {})['reason'], NOUN, 'reason', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.degrade', 'DPR', productId), LifecycleCapability.write,
      async (cap) => {
        const r = await cap.degrade({ productId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(r['released_version']), outboxEvent: null };
      });
    return { product: out.result, receipt: receipt(out) };
  }

  /** RESTORE (the owner): through a scorecard that reads ok or a domain review newer than the degradation. */
  @Post('/:productId/restore')
  async restore(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const noteRaw = (body.payload ?? {})['note'];
    const note = noteRaw === undefined || noteRaw === null ? null : reasonOf(noteRaw, NOUN, 'note', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.restore', 'DPR', productId), LifecycleCapability.write,
      async (cap) => {
        const r = await cap.restore({ productId, tenantId, domainId, note, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(r['released_version']), outboxEvent: null };
      });
    return { product: out.result, receipt: receipt(out) };
  }

  /** WITHDRAW (the owner) with a reason: the DPR's withdrawn version admitted, the released version kept as the last valid one, the consumers notified. */
  @Post('/:productId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const reason = reasonOf((body.payload ?? {})['reason'], NOUN, 'reason', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.withdraw', 'DPR', productId), LifecycleCapability.write,
      async (cap) => {
        const r = await this.consumers.withdraw(cap, { tenantId, domainId }, principal, envelope.purpose_id ?? 'executive', productId, reason, envelope.correlation_id);
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(r['released_version']), outboxEvent: null };
      });
    return { product: out.result, receipt: receipt(out) };
  }

  /** RETIRE (the owner): no accepted consumer, an accepted retirement review, the DPR's archived version admitted. */
  @Post('/:productId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string) {
    const { envelope, principal } = ctx(req);
    uuidOf(productId, NOUN, 'product', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.product.retire', 'DPR', productId), LifecycleCapability.write,
      async (cap) => {
        const r = await this.consumers.retire(cap, { tenantId, domainId }, principal, envelope.purpose_id ?? 'executive', productId, envelope.correlation_id);
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: r['released_version'] === null ? null : String(r['released_version']), outboxEvent: null };
      });
    return { product: out.result, receipt: receipt(out) };
  }
}
