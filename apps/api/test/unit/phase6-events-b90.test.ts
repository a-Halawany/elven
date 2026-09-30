/**
 * CP-6 B90 §E (0095) — the pure logic of the events part: the validators word a request's fault before any port is reached; the refusal
 * families `event product rejected (<class>)` and `subscription rejected (<class>)` map to honest answers through the observation mapper;
 * 0063's unclassed `subscription rejected: …` texts keep their behaviour (no row of this part reads them).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { EVENT_KINDS, EVENT_PRODUCTS_ORDER, EVENT_PRODUCTS_STEP, SOURCE_LEDGERS, SUBSCRIPTION_LAG_ORDER, SUBSCRIPTION_LAG_STEP, SUBSCRIPTION_STATES, subscriptionStateLine,
  validateConformance, validateEventDeclaration, validateReadWindow, validateReason, validateSequence, validateSubscriptionRegistration } from '../../src/products/events/events.service.js';

const C = '0190b1c2-d3e4-7000-8000-0000000000c0';
const status = (f: () => unknown): { status: number; message: string } => {
  try { f(); } catch (e) { if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) }; throw e; }
  throw new Error('the validator should have refused');
};
const mapped = (message: string, code = '22023'): { status: number | null; message: string } => {
  const e = asObservationRefusal({ code, message }, C);
  return e === null ? { status: null, message } : { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) };
};
const DECL = (over: Record<string, unknown> = {}) => ({ schema: { version: 'v1', fields: [{ name: 'title', type: 'string' }] }, subject_kind: 'warning', retention_days: 30, source: { ledger: 'prediction.warning_events' }, ...over });
const SUB = (over: Record<string, unknown> = {}) => ({ productId: '0190b1c2-d3e4-7000-8000-0000000000aa', purpose: 'procurement', granted: { fields: ['title'], consequence: 'C2' }, schemaVersion: 'v1',
  lagPolicy: { max_lag_events: 2, max_lag_seconds: 86_400 }, handlesCorrections: true, handlesReplays: true, ...over });

describe('the vocabularies and the steps are the migration\'s', () => {
  it('the seven whitelisted ledgers, the six event kinds, the five subscription states; the steps event-products (61) and subscription-lag (63)', () => {
    expect([...SOURCE_LEDGERS]).toEqual(['prediction.warning_events', 'prediction.forecast_events', 'decision.package_events', 'prediction.exposure_events', 'graph.strategy_detections', 'executive.briefing_events', 'products.product_events']);
    expect([...EVENT_KINDS]).toEqual(['change', 'signal', 'correction', 'lifecycle', 'quality', 'strategic']);
    expect([...SUBSCRIPTION_STATES]).toEqual(['registered', 'active', 'paused', 'lagging', 'revoked']);
    expect([EVENT_PRODUCTS_STEP, EVENT_PRODUCTS_ORDER, SUBSCRIPTION_LAG_STEP, SUBSCRIPTION_LAG_ORDER]).toEqual(['event-products', 61, 'subscription-lag', 63]);
  });
  it('a state in words names who acts next: the owner authorizes, the consumer reads, conformance then the owner resumes, revocation preserves the offsets', () => {
    expect(subscriptionStateLine('registered', null)).toMatch(/owner's authorization/);
    expect(subscriptionStateLine('active', null)).toMatch(/consumer reads and acknowledges/);
    expect(subscriptionStateLine('paused', 'schema')).toMatch(/broke its schema.*then the owner resumes/);
    expect(subscriptionStateLine('lagging', 'lag')).toMatch(/offset preserved.*then the owner resumes/);
    expect(subscriptionStateLine('revoked', null)).toMatch(/offsets preserved/);
  });
});

describe('the validators word the request\'s fault (422) before any port is reached', () => {
  it('an event declaration: an object with a schema, a whitelisted source, a subject kind, a retention in days, a compatibility', () => {
    expect(validateEventDeclaration({ declaration: DECL() }, C)).toMatchObject({ subject_kind: 'warning', retention_days: 30 });
    expect(status(() => validateEventDeclaration({}, C))).toMatchObject({ status: 422, message: expect.stringMatching(/^event product rejected \(declaration\)/) });
    expect(status(() => validateEventDeclaration({ declaration: DECL({ schema: 'v1' }) }, C)).message).toMatch(/^event product rejected \(schema\)/);
    expect(status(() => validateEventDeclaration({ declaration: DECL({ source: { ledger: 'identity.principals' } }) }, C)).message).toMatch(/^event product rejected \(source\): identity\.principals is not one of the platform ledgers/);
    expect(status(() => validateEventDeclaration({ declaration: DECL({ retention_days: 0 }) }, C)).message).toMatch(/^event product rejected \(retention\)/);
    expect(status(() => validateEventDeclaration({ declaration: DECL({ retention_days: 1.5 }) }, C)).message).toMatch(/^event product rejected \(retention\)/);
    expect(status(() => validateEventDeclaration({ declaration: DECL({ compatibility: 'loose' }) }, C)).message).toMatch(/^event product rejected \(compatibility\)/);
  });
  it('a subscription request: the product, the purpose, the grant (fields, consequence, window), the filters, the schema version, the lag policy, the capabilities; a steward may name the consumer', () => {
    expect(validateSubscriptionRegistration(SUB(), C)).toMatchObject({ consumer: null, purpose: 'procurement', schemaVersion: 'v1', filters: {}, handlesCorrections: true });
    expect(validateSubscriptionRegistration(SUB({ consumerPrincipalId: '0190b1c2-d3e4-7000-8000-0000000000bb', filters: { event_kinds: ['signal'] } }), C)).toMatchObject({ consumer: '0190b1c2-d3e4-7000-8000-0000000000bb', filters: { event_kinds: ['signal'] } });
    expect(status(() => validateSubscriptionRegistration(SUB({ productId: 'x' }), C)).message).toMatch(/^subscription rejected \(product\)/);
    expect(status(() => validateSubscriptionRegistration(SUB({ purpose: 'p' }), C)).message).toMatch(/^subscription rejected \(purpose\)/);
    expect(status(() => validateSubscriptionRegistration(SUB({ granted: { fields: [], consequence: 'C2' } }), C)).message).toMatch(/^subscription rejected \(fields\)/);
    expect(status(() => validateSubscriptionRegistration(SUB({ granted: { fields: ['title'], consequence: 'C9' } }), C)).message).toMatch(/^subscription rejected \(consequence\)/);
    expect(status(() => validateSubscriptionRegistration(SUB({ granted: { fields: ['title'], consequence: 'C2', from: 'yesterday' } }), C)).message).toMatch(/^subscription rejected \(window\)/);
    expect(status(() => validateSubscriptionRegistration(SUB({ filters: { colour: ['red'] } }), C)).message).toMatch(/^subscription rejected \(filters\): colour is not a filter/);
    expect(status(() => validateSubscriptionRegistration(SUB({ schemaVersion: '' }), C)).message).toMatch(/^subscription rejected \(schema\)/);
    expect(status(() => validateSubscriptionRegistration(SUB({ lagPolicy: { max_lag_events: 2 } }), C)).message).toMatch(/^subscription rejected \(lag_policy\)/);
    expect(status(() => validateSubscriptionRegistration(SUB({ handlesReplays: 'yes' }), C)).message).toMatch(/^subscription rejected \(capability\)/);
  });
  it('a reason (8 to 2000 characters), a sequence (a whole number), a read window (afterSequence or null; limit 1..500, default 100), a conformance (caught_up and can_process booleans)', () => {
    expect(validateReason({ reason: '  the nightly package replaces the stream  ' }, C, 'revocation')).toBe('the nightly package replaces the stream');
    expect(status(() => validateReason({ reason: 'why' }, C, 'pause')).message).toMatch(/^subscription rejected \(reason\): a pause says why/);
    expect(validateSequence({ sequence: 4 }, 'sequence', C)).toBe(4);
    expect(status(() => validateSequence({ sequence: -1 }, 'sequence', C)).message).toMatch(/^subscription rejected \(sequence\)/);
    expect(status(() => validateSequence({ fromSequence: 1.5 }, 'fromSequence', C)).message).toMatch(/^subscription rejected \(sequence\): fromSequence/);
    expect(validateReadWindow({}, C)).toEqual({ afterSequence: null, limit: 100 });
    expect(validateReadWindow({ afterSequence: 3, limit: 5 }, C)).toEqual({ afterSequence: 3, limit: 5 });
    expect(status(() => validateReadWindow({ limit: 0 }, C)).message).toMatch(/^subscription rejected \(limit\)/);
    expect(status(() => validateReadWindow({ afterSequence: 'x' }, C)).message).toMatch(/^subscription rejected \(sequence\)/);
    expect(validateConformance({ declaration: { caught_up: true, can_process: true, schema_version: 'v2' } }, C)).toMatchObject({ schema_version: 'v2' });
    expect(status(() => validateConformance({ declaration: { caught_up: true } }, C)).message).toMatch(/^subscription rejected \(conformance\)/);
    expect(status(() => validateConformance({ declaration: { caught_up: true, can_process: true, handles_corrections: 'no' } }, C)).message).toMatch(/^subscription rejected \(conformance\): handles_corrections is a boolean/);
  });
});

describe('the refusal families through the observation mapper (the B90 events rows)', () => {
  it('the standing 403, the absences 404, the record\'s state 409, the caller\'s own 422 — for both nouns', () => {
    expect(mapped('event product rejected (actor): declared by the acting principal', '42501').status).toBe(403);
    expect(mapped('event product rejected (authority): an event product is declared by the product\'s owner or by a data steward', '42501').status).toBe(403);
    expect(mapped('subscription rejected (not_consumer): the events of a subscription are read by its consumer', '42501').status).toBe(403);
    expect(mapped('subscription rejected (authority): the authority boundary (DP-43-002) — a subscription is granted to a named, active human of this tenant', '42501').status).toBe(403);
    expect(mapped('event product rejected (unknown_product): x is not a product of this domain').status).toBe(404);
    expect(mapped('subscription rejected (unknown_subscription): x is not a subscription of this domain').status).toBe(404);
    expect(mapped('subscription rejected (unknown_consumer): x is not a principal').status).toBe(404);
    expect(mapped('event product rejected (state): product x is withdrawn').status).toBe(409);
    expect(mapped('subscription rejected (state): subscription x is lagging (lag); delivery is paused').status).toBe(409);
    expect(mapped('subscription rejected (lag): subscription x is still 3 events behind the head (policy 2)').status).toBe(409);
    expect(mapped('subscription rejected (schema_pending): subscription x still accepts schema v1 while the product serves v2 (breaking)').status).toBe(409);
    for (const t of ['event product rejected (source): identity.principals is not one of the platform ledgers', 'event product rejected (schema): schema v9 names no fields to project', 'event product rejected (kind): product x is of kind metric',
      'subscription rejected (fields): "x" is not a field of schema v1', 'subscription rejected (purpose): purpose marketing is outside', 'subscription rejected (schema): product x serves schema version v1',
      'subscription rejected (window): reading from sequence 0 is before the checkpoint 1', 'subscription rejected (capability): the source ledger carries correction events', 'subscription rejected (head): sequence 9 is beyond the stream head 4',
      'subscription rejected (sequence): a checkpoint advances', 'subscription rejected (retention): sequence 1 is older', 'subscription rejected (replay_policy): not allowed', 'subscription rejected (conformance): a consumer that has not caught up', 'subscription rejected (reason): a pause says why']) {
      expect(mapped(t).status, t).toBe(422);
    }
  });
  it('0063\'s unclassed `subscription rejected: …` texts are untouched: no row of this part reads them (a 22023 stays unmapped; a 23514 keeps the generic conflict)', () => {
    expect(mapped('subscription rejected: this domain already has a live attention subscription', '22023').status).toBeNull();
    expect(mapped('subscription rejected: the principal must be an active principal', '23514')).toEqual({ status: 409, message: 'the request conflicts with a rule this record enforces.' });
  });
});
