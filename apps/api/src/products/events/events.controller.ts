/**
 * THE HTTP SURFACE OF EVENT PRODUCTS AND SUBSCRIPTIONS — CP-6 B90 part `events` (migration 0095 §E). The prelude's envelope, capabilities
 * and receipts: every write is one governed write whose port asserts the route's own action (an EXACT PDP rule, the B90 events block);
 * every read is a consequential read (the owner's views under products.product.read; the consumer's own events and subscription under
 * products.subscription.read). The routes live under /products/events/… of the domain (three or more segments below /products, so none
 * meets the registry's /:productId/<verb> routes). Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { EventCapability } from './events.capabilities.js';
import { assertUuid, validateConformance, validateEventDeclaration, validateReadWindow, validateReason, validateSequence, validateSubscriptionRegistration } from './events.service.js';

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

@Controller('/v1/tenants/:tenantId/domains/:domainId/products/events')
export class EventsController {
  constructor(private readonly pipeline: PipelineService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** DECLARE the event product (the owner's or a steward's act on a product of kind event): the schema, the subject, the ordering key, the retention, the replay policy, the SOURCE ledger. */
  @Post('/:productId/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(productId, 'product', envelope.correlation_id, 'event product');
    const declaration = validateEventDeclaration(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.event_product.declare', 'DPR', productId), EventCapability.write,
      async (cap) => {
        const r = await cap.declareEventProduct({ productId, tenantId, domainId, declaration, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPR', targetId: productId, targetVersion: String(r['declaration_version']), outboxEvent: null };
      });
    return { event_product: out.result, receipt: receipt(out) };
  }

  /** THE EVENT PRODUCT (the owner's view, under products.product.read): the declaration, the stream head, the retention floor, the subscriptions with their lag. */
  @Post('/:productId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('productId') productId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(productId, 'product', envelope.correlation_id, 'event product');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.product.read', 'DPR', productId), EventCapability.read,
      async (cap) => ({ at: await cap.now(), event_product: await cap.eventProduct(productId) }));
    if (out.result.event_product === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `event product rejected (unknown_product): ${productId} is not an event product of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.product.read', 'DPR', null), EventCapability.read,
      async (cap) => ({ at: await cap.now(), event_products: await cap.list({ state: typeof p['state'] === 'string' ? p['state'] : null, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** REGISTER a subscription (the consumer's own act, or a steward's for a named consumer) under the authority boundary. */
  @Post('/subscriptions/register')
  async register(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateSubscriptionRegistration(body.payload ?? {}, envelope.correlation_id);
    const subscriptionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.register', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => {
        const r = await cap.registerSubscription({ subscriptionId, productId: p.productId, tenantId, domainId, consumer: p.consumer ?? principal.principalId, purpose: p.purpose, granted: p.granted, filters: p.filters,
          schemaVersion: p.schemaVersion, lagPolicy: p.lagPolicy, handlesCorrections: p.handlesCorrections, handlesReplays: p.handlesReplays, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SUB', targetId: subscriptionId, targetVersion: '1', outboxEvent: null };
      });
    return { subscription: out.result, receipt: receipt(out) };
  }

  /** The subscriptions under the caller's RLS (mine, or a product's). */
  @Post('/subscriptions/list')
  async subscriptions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const productId = typeof p['productId'] === 'string' ? assertUuid(p['productId'], 'product', envelope.correlation_id) : null;
    const consumer = p['mine'] === true ? principal.principalId : (typeof p['consumerPrincipalId'] === 'string' ? assertUuid(p['consumerPrincipalId'], 'consumer', envelope.correlation_id) : null);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.subscription.read', 'SUB', null), EventCapability.read,
      async (cap) => ({ at: await cap.now(), subscriptions: await cap.subscriptions({ consumer, productId, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** A subscription (its product, head, lag, checkpoints and replays) under the caller's RLS. */
  @Post('/subscriptions/:subscriptionId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.subscription.read', 'SUB', subscriptionId), EventCapability.read,
      async (cap) => ({ at: await cap.now(), subscription: await cap.subscription(subscriptionId) }));
    if (out.result.subscription === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `subscription rejected (unknown_subscription): ${subscriptionId} is not a subscription of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** READ the events (the CONSUMER's own act): after the checkpoint (or afterSequence ≥ it), filtered, projected to the granted fields, within the window and the retention. */
  @Post('/subscriptions/:subscriptionId/read')
  async readEvents(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const w = validateReadWindow(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.subscription.read', 'SUB', subscriptionId), EventCapability.read,
      async (cap) => ({ at: await cap.now(), read: await cap.subscriptionEvents({ subscriptionId, tenantId, domainId, afterSequence: w.afterSequence, limit: w.limit, actor: principal.principalId, correlationId: envelope.correlation_id }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** AUTHORIZE (the owner or a steward): registered → active. */
  @Post('/subscriptions/:subscriptionId/authorize')
  async authorize(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.authorize', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.authorizeSubscription({ subscriptionId, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }), targetType: 'SUB', targetId: subscriptionId, targetVersion: null, outboxEvent: null }));
    return { subscription: out.result, receipt: receipt(out) };
  }

  /** ACKNOWLEDGE (the consumer): the checkpoint advances to a sequence — never back, never beyond the head. */
  /** B90-F1 (0096) THE CATCH-UP (the consumer, on a LAGGING subscription): its authorized backlog — frozen when the tick flagged the lag —
   *  served in bounded batches (≤ 100) under the ordinary read's projection, window, filters, retention and correction rules; each batch
   *  recorded. Ordinary delivery stays paused; the consumer acknowledges only what a catch-up served, then conforms; the owner resumes. */
  @Post('/subscriptions/:subscriptionId/catch-up')
  async catchUp(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const w = validateReadWindow(body.payload ?? {}, envelope.correlation_id);
    const catchupId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.catch_up', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.catchUp({ catchupId, subscriptionId, tenantId, domainId, afterSequence: w.afterSequence, limit: Math.min(w.limit, 100), actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
        targetType: 'SUB', targetId: subscriptionId, targetVersion: null, outboxEvent: null }));
    return { catchup: out.result, receipt: receipt(out) };
  }

  @Post('/subscriptions/:subscriptionId/checkpoint')
  async checkpoint(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const sequence = validateSequence(body.payload ?? {}, 'sequence', envelope.correlation_id);
    const checkpointId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.checkpoint', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.advanceCheckpoint({ checkpointId, subscriptionId, tenantId, domainId, sequence, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }), targetType: 'SUB', targetId: subscriptionId, targetVersion: String(sequence), outboxEvent: null }));
    return { subscription: out.result, receipt: receipt(out) };
  }

  /** PAUSE (the owner or a steward), with a reason; the offset preserved. */
  @Post('/subscriptions/:subscriptionId/pause')
  async pause(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id, 'pause');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.pause', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.pauseSubscription({ subscriptionId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }), targetType: 'SUB', targetId: subscriptionId, targetVersion: null, outboxEvent: null }));
    return { subscription: out.result, receipt: receipt(out) };
  }

  /** CONFORM (the consumer's declaration on a paused or lagging subscription): caught up, can process, the schema version now accepted. */
  @Post('/subscriptions/:subscriptionId/conform')
  async conform(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const declaration = validateConformance(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.conform', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.conformSubscription({ subscriptionId, tenantId, domainId, declaration, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }), targetType: 'SUB', targetId: subscriptionId, targetVersion: null, outboxEvent: null }));
    return { subscription: out.result, receipt: receipt(out) };
  }

  /** RESUME (the owner or a steward): refused before the consumer's conformance. */
  @Post('/subscriptions/:subscriptionId/resume')
  async resume(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.resume', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.resumeSubscription({ subscriptionId, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }), targetType: 'SUB', targetId: subscriptionId, targetVersion: null, outboxEvent: null }));
    return { subscription: out.result, receipt: receipt(out) };
  }

  /** REPLAY (the consumer): the checkpoint moves back to fromSequence, within retention, with a reason. */
  @Post('/subscriptions/:subscriptionId/replay')
  async replay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const p = body.payload ?? {};
    const fromSequence = validateSequence(p, 'fromSequence', envelope.correlation_id);
    const reason = validateReason(p, envelope.correlation_id, 'replay');
    const replayId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.replay', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.replaySubscription({ replayId, subscriptionId, tenantId, domainId, fromSequence, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }), targetType: 'SUB', targetId: subscriptionId, targetVersion: String(fromSequence), outboxEvent: null }));
    return { subscription: out.result, receipt: receipt(out) };
  }

  /** REVOKE (the owner or a steward), with a reason; the offsets preserved; terminal. */
  @Post('/subscriptions/:subscriptionId/revoke')
  async revoke(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(subscriptionId, 'subscription', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id, 'revocation');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.subscription.revoke', 'SUB', subscriptionId), EventCapability.write,
      async (cap) => ({ result: await cap.revokeSubscription({ subscriptionId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }), targetType: 'SUB', targetId: subscriptionId, targetVersion: null, outboxEvent: null }));
    return { subscription: out.result, receipt: receipt(out) };
  }
}
