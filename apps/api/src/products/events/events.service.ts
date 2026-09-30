/**
 * EVENT PRODUCTS AND SUBSCRIPTIONS — CP-6 B90 part `events` (migration 0095 §E; F-P7-F-09's event half; V7 ch43 DP-43-001..006;
 * DAT-SV-03; DPD-13; DZ-16).
 *
 *   THE OBJECTS     an EVENT PRODUCT is a product of kind event (the prelude's registry row) with an event declaration: a VERSIONED schema
 *                   (a registry reference or declared fields), the producer domain, the subject kind, the ordering key, pull delivery, the
 *                   retention, the replay policy and its SOURCE — one of a WHITELIST of the platform's own ledgers. Its STREAM is a dense
 *                   per-product sequence the tick's emitter writes from that ledger (the payload PROJECTED to the schema's fields).
 *   THE AUTHORITY   a consumer REGISTERS under the authority boundary (the data, purpose, time, tenant and consequence scope it needs); the
 *                   OWNER (or a steward) AUTHORIZES; reading and acknowledging are the consumer's own acts; pausing, resuming and revoking
 *                   the owner's; conformance the consumer's declaration before the owner's word resumes delivery (DP-43-006).
 *   THE TICK        `event-products` (order 61) emits every released event product's new source rows; `subscription-lag` (order 63)
 *                   measures every active subscription against its lag policy and the product's schema compatibility, pauses the ones
 *                   beyond it with the offset preserved, notifies the product owner (an attention item of class subscription.lag) and
 *                   observes lag_events / lag_seconds on the prelude's SLO ledger.
 *   This service validates what a route hands in, in plain words, and registers the two steps; the ports decide every rule.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { EventCapability } from './events.capabilities.js';

type Row = Record<string, unknown>;

export const EVENT_PRODUCTS_STEP = 'event-products';
export const EVENT_PRODUCTS_ORDER = 61;
export const SUBSCRIPTION_LAG_STEP = 'subscription-lag';
export const SUBSCRIPTION_LAG_ORDER = 63;
/** The whitelist (products.event_source_ledgers): the platform's own ledgers an event product may read. */
export const SOURCE_LEDGERS = ['prediction.warning_events', 'prediction.forecast_events', 'decision.package_events', 'prediction.exposure_events', 'graph.strategy_detections', 'executive.briefing_events', 'products.product_events'] as const;
export const EVENT_KINDS = ['change', 'signal', 'correction', 'lifecycle', 'quality', 'strategic'] as const;
export const SUBSCRIPTION_STATES = ['registered', 'active', 'paused', 'lagging', 'revoked'] as const;
export const CONSEQUENCE_CLASSES = ['C0', 'C1', 'C2', 'C3', 'C4'] as const;
const FILTER_KEYS = ['event_kinds', 'ordering_keys', 'subject_ids', 'subject_kinds'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'subscription'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}

/** The event declaration's SHAPE (the port judges its content: the registry, the whitelist, the fields). */
export function validateEventDeclaration(p: Row, correlationId: string): Row {
  const d = p['declaration'];
  if (!isObject(d)) refuse(correlationId, 'event product rejected (declaration): an event declaration is an object');
  const dd = d as Row;
  if (!isObject(dd['schema'])) refuse(correlationId, 'event product rejected (schema): an event declaration carries a schema object ({ref: {object_type, schema_version}} or {version, fields})');
  if (!isObject(dd['source']) || typeof (dd['source'] as Row)['ledger'] !== 'string') refuse(correlationId, 'event product rejected (source): an event declaration names its source ledger');
  if (!(SOURCE_LEDGERS as readonly string[]).includes(String((dd['source'] as Row)['ledger']))) {
    refuse(correlationId, `event product rejected (source): ${String((dd['source'] as Row)['ledger'])} is not one of the platform ledgers an event product may read (${SOURCE_LEDGERS.join(', ')})`);
  }
  if (typeof dd['subject_kind'] !== 'string') refuse(correlationId, 'event product rejected (subject): an event declaration names its subject kind');
  if (!whole(dd['retention_days']) || (dd['retention_days'] as number) < 1 || (dd['retention_days'] as number) > 3650) refuse(correlationId, 'event product rejected (retention): retention_days is a whole number of days in 1..3650');
  if (dd['compatibility'] !== undefined && dd['compatibility'] !== 'additive' && dd['compatibility'] !== 'breaking') refuse(correlationId, 'event product rejected (compatibility): compatibility is additive or breaking');
  return dd;
}

export interface SubscriptionRegistration {
  productId: string; consumer: string | null; purpose: string; granted: Row; filters: Row; schemaVersion: string; lagPolicy: Row; handlesCorrections: boolean; handlesReplays: boolean;
}
/** A subscription request's SHAPE (the port judges the grant against the schema, the purpose against the policy, the consumer against the tenant). */
export function validateSubscriptionRegistration(p: Row, correlationId: string): SubscriptionRegistration {
  const productId = assertUuid(p['productId'], 'product', correlationId);
  const consumer = p['consumerPrincipalId'] === undefined || p['consumerPrincipalId'] === null ? null : assertUuid(p['consumerPrincipalId'], 'consumer', correlationId);
  const purpose = str(p, 'purpose');
  if (purpose === null || purpose.trim().length < 2 || purpose.trim().length > 120) refuse(correlationId, 'subscription rejected (purpose): a subscription states its purpose (2–120 characters)');
  const granted = p['granted'];
  if (!isObject(granted) || !Array.isArray(granted['fields']) || granted['fields'].length === 0 || granted['fields'].some((f) => typeof f !== 'string')) {
    refuse(correlationId, 'subscription rejected (fields): the grant names the fields it needs (a non-empty array of the schema\'s field names)');
  }
  const g = granted as Row;
  if (!(CONSEQUENCE_CLASSES as readonly string[]).includes(String(g['consequence']))) refuse(correlationId, 'subscription rejected (consequence): the grant names the consequence class the consumer may act on (C0..C4)');
  for (const k of ['from', 'to']) {
    const v = g[k];
    if (v !== undefined && v !== null && (typeof v !== 'string' || Number.isNaN(Date.parse(v)))) refuse(correlationId, `subscription rejected (window): the time window's ${k} is an instant (ISO-8601) or null`);
  }
  const filters = p['filters'] === undefined ? {} : p['filters'];
  if (!isObject(filters)) refuse(correlationId, 'subscription rejected (filters): the filters are an object {event_kinds?, ordering_keys?, subject_ids?, subject_kinds?}');
  for (const k of Object.keys(filters as Row)) {
    if (!(FILTER_KEYS as readonly string[]).includes(k) || !Array.isArray((filters as Row)[k])) refuse(correlationId, `subscription rejected (filters): ${k} is not a filter (event_kinds, ordering_keys, subject_ids, subject_kinds — each an array)`);
  }
  const schemaVersion = str(p, 'schemaVersion');
  if (schemaVersion === null || schemaVersion.trim() === '') refuse(correlationId, 'subscription rejected (schema): a subscription names the schema version it accepts');
  const lagPolicy = p['lagPolicy'];
  if (!isObject(lagPolicy) || !whole(lagPolicy['max_lag_events']) || (lagPolicy['max_lag_events'] as number) < 1 || !whole(lagPolicy['max_lag_seconds']) || (lagPolicy['max_lag_seconds'] as number) < 1) {
    refuse(correlationId, 'subscription rejected (lag_policy): the lag policy names max_lag_events and max_lag_seconds (whole numbers ≥ 1)');
  }
  if (typeof p['handlesCorrections'] !== 'boolean' || typeof p['handlesReplays'] !== 'boolean') refuse(correlationId, 'subscription rejected (capability): a subscription declares whether it can process corrections and replays (handlesCorrections, handlesReplays)');
  return { productId, consumer, purpose: (purpose as string).trim(), granted: g, filters: filters as Row, schemaVersion: (schemaVersion as string).trim(), lagPolicy: lagPolicy as Row,
    handlesCorrections: p['handlesCorrections'] as boolean, handlesReplays: p['handlesReplays'] as boolean };
}

export function validateReason(p: Row, correlationId: string, what: string): string {
  const r = str(p, 'reason');
  if (r === null || r.trim().length < 8 || r.trim().length > 2000) refuse(correlationId, `subscription rejected (reason): a ${what} says why (8 to 2000 characters)`);
  return (r as string).trim();
}

export function validateSequence(p: Row, key: string, correlationId: string): number {
  const v = p[key];
  if (!whole(v) || (v as number) < 0) refuse(correlationId, `subscription rejected (sequence): ${key} is a whole number (a stream sequence)`);
  return v as number;
}

export function validateConformance(p: Row, correlationId: string): Row {
  const d = p['declaration'];
  if (!isObject(d) || typeof d['caught_up'] !== 'boolean' || typeof d['can_process'] !== 'boolean') {
    refuse(correlationId, 'subscription rejected (conformance): a conformance declares caught_up and can_process (booleans), optionally a note, the schema_version now accepted and handles_corrections');
  }
  const dd = d as Row;
  if (dd['schema_version'] !== undefined && typeof dd['schema_version'] !== 'string') refuse(correlationId, 'subscription rejected (conformance): schema_version is a string');
  if (dd['handles_corrections'] !== undefined && typeof dd['handles_corrections'] !== 'boolean') refuse(correlationId, 'subscription rejected (conformance): handles_corrections is a boolean');
  if (dd['note'] !== undefined && typeof dd['note'] !== 'string') refuse(correlationId, 'subscription rejected (conformance): a note is text');
  return dd;
}

/** The consumer's read window: after which sequence (null = the checkpoint), how many (1..500, default 100). */
export function validateReadWindow(p: Row, correlationId: string): { afterSequence: number | null; limit: number } {
  const after = p['afterSequence'];
  if (after !== undefined && after !== null && (!whole(after) || (after as number) < 0)) refuse(correlationId, 'subscription rejected (sequence): afterSequence is a whole number (a stream sequence) or null');
  const limit = p['limit'];
  if (limit !== undefined && (!whole(limit) || (limit as number) < 1 || (limit as number) > 500)) refuse(correlationId, 'subscription rejected (limit): limit is a whole number in [1, 500]');
  return { afterSequence: after === undefined || after === null ? null : (after as number), limit: limit === undefined ? 100 : (limit as number) };
}

/** A subscription's state in words (the page shows the server's state; this names what it means and who acts next). */
export function subscriptionStateLine(state: string, pausedReason: string | null): string {
  switch (state) {
    case 'registered': return 'registered — awaiting the owner\'s authorization';
    case 'active': return 'active — the consumer reads and acknowledges';
    case 'paused': return pausedReason === 'schema' ? 'paused (schema) — the product broke its schema; the consumer conforms to the new version, then the owner resumes'
      : 'paused (owner) — the consumer conforms, then the owner resumes';
    case 'lagging': return 'lagging — beyond the lag policy; delivery paused with the offset preserved; the consumer catches up and conforms, then the owner resumes';
    case 'revoked': return 'revoked — the offsets preserved; nothing is served';
    default: return state;
  }
}

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly log = new Logger('products.events');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The two tick steps (the planning service's idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: event products are not emitted and subscription lag is not evaluated'); return; }
    registry.register({ name: EVENT_PRODUCTS_STEP, order: EVENT_PRODUCTS_ORDER, run: async (c: AttentionTickContext) => this.emit(c) });
    registry.register({ name: SUBSCRIPTION_LAG_STEP, order: SUBSCRIPTION_LAG_ORDER, run: async (c: AttentionTickContext) => this.lag(c) });
  }
  /** `event-products`: every released event product of the domain streams its new source rows (each product its own port call, in registration order). */
  private async emit(c: AttentionTickContext): Promise<Row> {
    const cap = EventCapability.tick(c.tx, 'executive.attention.tick');
    const products = await cap.releasedEventProducts();
    const results: Row[] = [];
    let emitted = 0;
    for (const p of products) {
      const r = await cap.emitEvents({ productId: p.product_id, tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
      emitted += Number(r['emitted'] ?? 0);
      results.push(r);
    }
    return { products: products.length, emitted, results };
  }
  /** `subscription-lag`: the lag and the schema compatibility of every active subscription, judged by the port. */
  private async lag(c: AttentionTickContext): Promise<Row> {
    return EventCapability.tick(c.tx, 'executive.attention.tick').evaluateSubscriptionLag({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
}
