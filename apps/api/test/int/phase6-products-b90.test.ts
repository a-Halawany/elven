/**
 * CP-6 B90 §R (0095 §R) — THE DATA PRODUCT REGISTRY COMPLETED, through the real database and controllers (the prelude's ports used, never
 * re-declared): a. THE CONSUMERS (registration, THE CONSUMER's own acceptance, revocation, re-registration), b. THE CONTRACT TESTS (the
 * breaking release denied over accepted consumers without a passing test, the tests in the one SLO ledger, the migration), f. THE
 * PLATFORM'S OWN PRODUCTS (two of the nine registered the same way — the typed object API, the briefing — with owner and SLO, their
 * scorecards), c. THE SCORECARD (on demand; the tick step product-scorecards; the DEGRADATION BY THE TICK after grace_ticks consecutive
 * below-floor scorecards, the consumers' attention items; the restoration through a domain review; no re-degradation after it),
 * d. THE COST (a period once), e. THE LIFECYCLE (withdrawal with the DPR's withdrawn version and the last valid version kept, the
 * consumers notified; retirement refused over an accepted consumer and without a retirement review, then the DPR's archived version; a
 * never-released product retired without one). Per clause POSITIVE / REFUSAL / RECOVERY. The tick is driven explicitly (tickNow); the
 * attention agent is registered through the executive route and its timer unscheduled. SYNTHETIC throughout (NORDWERK's data is the
 * demonstration's); a synthetic consumer closes no clause that needs a real external integration.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ProductsController } from '../../src/products/products.controller.js';
import type { ConsumersController } from '../../src/products/consumers/consumers.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let products: ProductsController; let consumers: ConsumersController; let exec: ExecutiveController; let scheduler: SchedulerService; let timer: AttentionTimerService;
let steward: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let consumerA: AuthenticatedPrincipal; let consumerB: AuthenticatedPrincipal;
let other: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let agentId = ''; let agentPrincipalId = '';
let P1 = ''; let P2 = ''; let P3 = ''; let P4 = ''; let P5 = '';
let CA = ''; let CB = ''; let CB2 = ''; let CA2 = ''; let CB3 = ''; let CA_P2 = '';
let OBS_V = 'v1'; let BRF_V = 'v3';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'executive');
const register = (as: AuthenticatedPrincipal, payload: Row) => products.register(E(as, 'products.product.register', 'DPR'), T(), D(), { payload }) as Promise<{ product: Row }>;
const declare = (as: AuthenticatedPrincipal, id: string, declaration: unknown) => products.declare(E(as, 'products.product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } as Row }) as Promise<{ product: Row }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.review(E(as, 'products.product.review', 'DPR', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const release = (as: AuthenticatedPrincipal, id: string, version: number) => products.release(E(as, 'products.product.release', 'DPR', id), T(), D(), id, { payload: { version } }) as Promise<{ product: Row }>;
const observe = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.observe(E(as, 'products.slo.observe', 'DPR', id), T(), D(), id, { payload }) as Promise<{ observation: Row }>;
const read = (as: AuthenticatedPrincipal, id: string) => products.read(E(as, 'products.product.read', 'DPR', id), T(), D(), id) as Promise<{ product: Row }>;
const regConsumer = (as: AuthenticatedPrincipal, id: string, payload: Row) => consumers.registerConsumer(E(as, 'products.consumer.register', 'DPR', id), T(), D(), id, { payload }) as Promise<{ consumer: Row }>;
const accept = (as: AuthenticatedPrincipal, id: string, cid: string, version: unknown) => consumers.accept(E(as, 'products.consumer.accept', 'DPR', id), T(), D(), id, cid, { payload: { version } as Row }) as Promise<{ consumer: Row }>;
const revoke = (as: AuthenticatedPrincipal, id: string, cid: string, reason: string) => consumers.revoke(E(as, 'products.consumer.revoke', 'DPR', id), T(), D(), id, cid, { payload: { reason } }) as Promise<{ consumer: Row }>;
const migrate = (as: AuthenticatedPrincipal, id: string, cid: string, version: number) => consumers.migrate(E(as, 'products.consumer.migrate', 'DPR', id), T(), D(), id, cid, { payload: { version } }) as Promise<{ consumer: Row }>;
const contractTest = (as: AuthenticatedPrincipal, id: string, cid: string, payload: Row) => consumers.contractTest(E(as, 'products.product.contract_test', 'DPR', id), T(), D(), id, cid, { payload }) as Promise<{ test: Row }>;
const cost = (as: AuthenticatedPrincipal, id: string, payload: Row) => consumers.cost(E(as, 'products.product.cost.attribute', 'DPR', id), T(), D(), id, { payload }) as Promise<{ attribution: Row }>;
const compute = (as: AuthenticatedPrincipal, id: string, payload: Row = {}) => consumers.compute(E(as, 'products.product.scorecard.compute', 'DPR', id), T(), D(), id, { payload }) as Promise<{ scorecard: Row }>;
const view = (as: AuthenticatedPrincipal, id: string) => consumers.view(E(as, 'products.product.read', 'DPR', id), T(), D(), id) as Promise<{ product: Row; scorecard: Row }>;
const listCards = (as: AuthenticatedPrincipal, payload: Row = {}) => consumers.list(E(as, 'products.product.read', 'DPR'), T(), D(), { payload }) as Promise<{ products: Row[] }>;
const degrade = (as: AuthenticatedPrincipal, id: string, reason: string) => consumers.degrade(E(as, 'products.product.degrade', 'DPR', id), T(), D(), id, { payload: { reason } }) as Promise<{ product: Row }>;
const restore = (as: AuthenticatedPrincipal, id: string, note: string | null = null) => consumers.restore(E(as, 'products.product.restore', 'DPR', id), T(), D(), id, { payload: note === null ? {} : { note } }) as Promise<{ product: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string, reason: string) => consumers.withdraw(E(as, 'products.product.withdraw', 'DPR', id), T(), D(), id, { payload: { reason } }) as Promise<{ product: Row }>;
const retire = (as: AuthenticatedPrincipal, id: string) => consumers.retire(E(as, 'products.product.retire', 'DPR', id), T(), D(), id) as Promise<{ product: Row }>;
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};
const items = (productId: string) => rows(sql`select item_id::text, signal_class, subject_kind, subject_id::text, cause_event_type, owner_principal_id::text as owner, state, title, details
  from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = 'product.degradation' and subject_id = ${productId}::uuid order by created_at`);
const cards = (productId: string) => rows(sql`select scorecard_id::text, computed_by::text as computed_by, overall, attainment_pct, floor_pct, below_floor, state_at from products.scorecards where product_id = ${productId}::uuid order by computed_at`);
const events = async (productId: string) => (await rows(sql`select event from products.product_events where product_id = ${productId}::uuid order by occurred_at`)).map((e) => e['event']);

/** A SYNTHETIC declaration: a contract by registered schema, an authoritative output, an SLO with its floor and grace, a closed policy. */
const DECL = (over: Row = {}): Row => ({
  contract: { schema: [{ object_type: 'OBS', schema_version: OBS_V }] },
  serving_modes: ['event', 'api'],
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }],
  outputs: [{ kind: 'object_type', ref: 'WRN', authority: true }],
  slo: { availability_pct: 99, lag_events: 2, attainment_floor_pct: 95, grace_ticks: 2 },
  policy: { purposes: ['executive'], data_classes: ['internal'] },
  cost: { basis: 'compute-minutes', monthly_estimate: 12 },
  quality: { completeness: 'declared' },
  ...over,
});
/** register → declare → review by someone else → release: a released product with one version (the prelude's route, as every part does it). */
const released = async (key: string, title: string, kind: string, decl: Row): Promise<string> => {
  const id = String((await register(steward, { key, title, kind, purpose: `${title} — a SYNTHETIC product of the B90 products harness`, ownerPrincipalId: owner.principalId })).product['product_id']);
  await declare(owner, id, decl);
  await review(reviewer, id, { version: 1, kind: 'admission', outcome: 'accepted', notes: `admission of ${key} v1 reviewed (B90 products harness)` });
  const p = (await release(owner, id, 1)).product;
  expect(p).toMatchObject({ state: 'released', released_version: 1 });
  return id;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  const { ConsumersController: CC } = await import('../../src/products/consumers/consumers.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  products = h.app.get(PC); consumers = h.app.get(CC); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  const reg = await rows(sql`select object_type, max(schema_version) as v from objects.schema_registry where object_type in ('OBS', 'BRF') group by object_type`);
  for (const r of reg) { if (r['object_type'] === 'OBS') OBS_V = String(r['v']); if (r['object_type'] === 'BRF') BRF_V = String(r['v']); }
  steward = await h.humanWithSession(['data_steward'], 'b90r-steward');
  owner = await h.humanWithSession(['domain_analyst', 'data_steward'], 'b90r-owner'); // holds the review role too: the ports' owner rules are reachable past the PDP
  reviewer = await h.humanWithSession(['executive'], 'b90r-reviewer');
  consumerA = await h.humanWithSession(['risk_owner'], 'b90r-consumer-a');       // "procurement": a human consumer of the corridor stream (SYNTHETIC)
  consumerB = await h.humanWithSession(['decision_owner'], 'b90r-consumer-b');
  other = await h.humanWithSession(['domain_analyst'], 'b90r-other');
  outsider = await h.humanWithSession(['collection_manager'], 'b90r-outsider');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b90r-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b90r-dadmin');
  // the attention agent: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: reviewer.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string; principalId: string } };
  agentId = r.agent.agentId; agentPrincipalId = r.agent.principalId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // the attention policy names the class (the routing's roles when the consumer is not an active human)
  await exec.publishAttentionPolicy(h.req(reviewer, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the product degradation class for the products harness', rules: { classes: {
    'product.degradation': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['data_steward'], ack_within_minutes: 240 } } } } as never });
}, 400_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  await h?.close();
});

describe('B90 §R · a. THE CONSUMERS (DAT-SV-10; DP-05-006 the consumer\'s own acceptance)', () => {
  it('POSITIVE: on a released product a consumer registers itself and ACCEPTS the released version; the steward registers a named consumer', async () => {
    P1 = await released('corridor-warning-stream', 'Corridor warning stream (SYNTHETIC)', 'event', DECL());
    P2 = String((await register(steward, { key: 'corridor-exposure-eur', title: 'Corridor exposure (EUR at risk) (SYNTHETIC)', kind: 'metric', purpose: 'the exposure metric — the lifecycle clause\'s product', ownerPrincipalId: owner.principalId })).product['product_id']);
    const a = (await regConsumer(consumerA, P1, { purpose: 'procurement reads the corridor warnings to re-route orders', impact: 'purchase orders are not re-routed when the stream breaks' })).consumer;
    CA = String(a['consumer_id']);
    expect(a).toMatchObject({ product_id: P1, consumer_principal_id: consumerA.principalId, state: 'registered', contract_version: 1, registered_by: consumerA.principalId, accepted_at: null });
    const acc = (await accept(consumerA, P1, CA, 1)).consumer;
    expect(acc).toMatchObject({ consumer_id: CA, state: 'accepted', contract_version: 1, accepted_by: consumerA.principalId });
    expect(acc['accepted_at']).not.toBeNull();
    const b = (await regConsumer(steward, P1, { consumerPrincipalId: consumerB.principalId, purpose: 'the decision desk cites the warnings in packages' })).consumer;
    CB = String(b['consumer_id']);
    expect(b).toMatchObject({ consumer_principal_id: consumerB.principalId, state: 'registered', registered_by: steward.principalId });
    expect(await events(P1)).toEqual(['product.registered', 'product.declared', 'product.reviewed', 'product.released', 'consumer.registered', 'consumer.accepted', 'consumer.registered']);
  });
  it('REFUSAL: a product not released (state), an outsider (the policy), an analyst registering another principal (authority), the OWNER accepting for the consumer (not_consumer), a version that is not the released one, a duplicate live registration, an unknown consumer, a second acceptance', async () => {
    await refused(regConsumer(consumerA, P2, { purpose: 'a product nobody released yet' }), /data product consumer rejected \(state\): product corridor-exposure-eur is registered/, 409);
    await refused(regConsumer(outsider, P1, { purpose: 'an outsider registers on the stream' }), /./, 403);
    await refused(regConsumer(other, P1, { consumerPrincipalId: consumerB.principalId, purpose: 'an analyst registers someone else' }), /data product consumer rejected \(authority\)/, 403);
    await refused(accept(owner, P1, CB, 1), /data product consumer rejected \(not_consumer\): a contract is accepted by the consumer itself/, 403);
    await refused(accept(consumerB, P1, CB, 7), /data product consumer rejected \(version\): the accepted contract version is the released one — version 1/, 422);
    await refused(accept(consumerB, P1, CB, 'one'), /data product consumer rejected \(version\)/, 422);
    await refused(regConsumer(consumerA, P1, { purpose: 'procurement registers a second time' }), /data product consumer rejected \(duplicate\)/, 409);
    await refused(regConsumer(steward, P1, { consumerPrincipalId: '0190b1c2-d3e4-7000-8000-0000000000aa', purpose: 'a consumer nobody knows' }), /data product consumer rejected \(unknown_consumer\)/, 404);
    await refused(accept(consumerA, P1, CA, 1), /data product consumer rejected \(state\): consumer .* is accepted/, 409);
    await refused(regConsumer(consumerA, P1, { purpose: 'short' }), /data product consumer rejected \(purpose\)/, 422);
  });
  it('RECOVERY: the named consumer accepts; the owner REVOKES it with a reason; it registers again (a new row) and accepts', async () => {
    expect((await accept(consumerB, P1, CB, 1)).consumer).toMatchObject({ state: 'accepted', accepted_by: consumerB.principalId });
    const rv = (await revoke(owner, P1, CB, 'the decision desk moved to the exposure product (B90 harness)')).consumer;
    expect(rv).toMatchObject({ consumer_id: CB, state: 'revoked', revoked_by: owner.principalId, revocation_reason: 'the decision desk moved to the exposure product (B90 harness)' });
    await refused(revoke(owner, P1, CB, 'revoked a second time'), /data product consumer rejected \(state\): consumer .* is already revoked/, 409);
    await refused(revoke(other, P1, CA, 'an analyst revokes procurement'), /data product consumer rejected \(authority\)/, 403);
    const b2 = (await regConsumer(consumerB, P1, { purpose: 'the decision desk returns to the corridor stream' })).consumer;
    CB2 = String(b2['consumer_id']);
    expect(b2).toMatchObject({ state: 'registered', consumer_principal_id: consumerB.principalId });
    expect((await accept(consumerB, P1, CB2, 1)).consumer).toMatchObject({ consumer_id: CB2, state: 'accepted' });
    const v = (await view(reviewer, P1)).scorecard;
    expect((v['consumers'] as Row[]).map((c) => [c['consumer_id'], c['state']])).toEqual([[CA, 'accepted'], [CB, 'revoked'], [CB2, 'accepted']]);
  });
});

describe('B90 §R · b. THE CONTRACT TESTS (DP-41-006): the breaking release denied, the tests in the one ledger, the migration', () => {
  it('REFUSAL → POSITIVE: a BREAKING v2 is denied over the accepted consumers without a passing test (each NAMED); their passing tests admit it; a failing test lands in the ledger too', async () => {
    await declare(owner, P1, DECL({ contract: { schema: [{ object_type: 'OBS', schema_version: OBS_V }], compatibility: 'breaking' } }));
    await review(reviewer, P1, { version: 2, kind: 'admission', outcome: 'accepted', notes: 'the breaking v2 reviewed for admission (B90 harness)' });
    const r1 = await refused(release(owner, P1, 2), /data product rejected \(contract_tests\): publication denied — version 2 of product corridor-warning-stream is BREAKING and accepted consumer\(s\) .* hold no passing contract test/, 409);
    expect(r1.message).toContain(CA); expect(r1.message).toContain(CB2);
    const tA = (await contractTest(consumerA, P1, CA, { version: 2, outcome: 'pass', evidence: { suite: 'procurement-contract', cases: 12 } })).test;
    expect(tA).toMatchObject({ product_id: P1, consumer_id: CA, version: 2, outcome: 'pass', recorded_by: consumerA.principalId });
    expect(tA['observation']).toMatchObject({ measure: 'contract_test_pass', met: true });
    const r2 = await refused(release(owner, P1, 2), /data product rejected \(contract_tests\)/, 409);
    expect(r2.message).not.toContain(CA); expect(r2.message).toContain(CB2);
    expect((await contractTest(consumerB, P1, CB2, { version: 2, outcome: 'fail', evidence: { suite: 'decision-desk', failed: ['warning.level'] } })).test).toMatchObject({ outcome: 'fail' });
    await refused(release(owner, P1, 2), /data product rejected \(contract_tests\)/, 409);
    expect((await contractTest(steward, P1, CB2, { version: 2, outcome: 'pass', evidence: { suite: 'decision-desk', rerun: true } })).test).toMatchObject({ outcome: 'pass', recorded_by: steward.principalId });
    const p = (await release(owner, P1, 2)).product;
    expect(p).toMatchObject({ state: 'released', released_version: 2 });
    const ledger = await rows(sql`select value::int as value, met, details ->> 'consumer_id' as consumer from products.slo_observations where product_id = ${P1}::uuid and measure = 'contract_test_pass' order by observed_at`);
    expect(ledger).toEqual([{ value: 1, met: true, consumer: CA }, { value: 0, met: false, consumer: CB2 }, { value: 1, met: true, consumer: CB2 }]);
  });
  it('REFUSAL: an outcome outside pass | fail, an unknown version, an analyst who is neither consumer nor owner nor steward, an outsider, a revoked consumer', async () => {
    await refused(contractTest(consumerA, P1, CA, { version: 2, outcome: 'maybe' }), /contract test rejected \(outcome\)/, 422);
    await refused(contractTest(consumerA, P1, CA, { version: 9, outcome: 'pass' }), /contract test rejected \(unknown_version\)/, 404);
    await refused(contractTest(other, P1, CA, { version: 2, outcome: 'pass' }), /contract test rejected \(authority\)/, 403);
    await refused(contractTest(outsider, P1, CA, { version: 2, outcome: 'pass' }), /./, 403);
    await refused(contractTest(consumerB, P1, CB, { version: 2, outcome: 'pass' }), /contract test rejected \(state\): consumer .* is revoked/, 409);
  });
  it('THE MIGRATION (the consumer\'s own act): to the newer released version with a passing test; refused by the owner (not_consumer), to an older version, without a test; RECOVERY — a compatible v3 releases without tests', async () => {
    const a2 = (await migrate(consumerA, P1, CA, 2)).consumer;
    CA2 = String(a2['consumer_id']);
    expect(a2).toMatchObject({ state: 'accepted', contract_version: 2, migrated_from: CA, consumer_principal_id: consumerA.principalId, migrated_from_version: 1 });
    const old = (await rows(sql`select state, migrated_to::text as migrated_to from products.product_consumers where consumer_id = ${CA}::uuid`))[0];
    expect(old).toEqual({ state: 'migrated', migrated_to: CA2 });
    await refused(migrate(owner, P1, CB2, 2), /data product consumer rejected \(not_consumer\)/, 403);
    await refused(migrate(consumerB, P1, CB2, 1), /data product consumer rejected \(version\): a migration moves to the newer released version/, 422);
    await refused(migrate(consumerA, P1, CA, 2), /data product consumer rejected \(state\): consumer .* is migrated/, 409);
    // a consumer without a passing test on the target: the steward registers a third consumer (dadmin) who accepts v2 — v3 below is compatible, so its release needs no test; its migration does
    const c3 = (await regConsumer(steward, P1, { consumerPrincipalId: dadmin.principalId, purpose: 'the domain administrator audits the stream' })).consumer;
    CB3 = String(c3['consumer_id']);
    await accept(dadmin, P1, CB3, 2);
    await declare(owner, P1, DECL({ slo: { availability_pct: 99, lag_events: 3, attainment_floor_pct: 95, grace_ticks: 2 } }));
    await review(reviewer, P1, { version: 3, kind: 'admission', outcome: 'accepted', notes: 'the compatible v3 reviewed for admission (B90 harness)' });
    expect((await release(owner, P1, 3)).product).toMatchObject({ state: 'released', released_version: 3 });
    await refused(migrate(dadmin, P1, CB3, 3), /data product consumer rejected \(contract_tests\): consumer .* holds no passing contract test on version 3/, 409);
    await contractTest(dadmin, P1, CB3, { version: 3, outcome: 'pass' });
    expect((await migrate(dadmin, P1, CB3, 3)).consumer).toMatchObject({ state: 'accepted', contract_version: 3 });
  });
});

describe('B90 §R · f. THE PLATFORM\'S OWN PRODUCTS (DPD-01..11; DZ-16): two of the nine registered through the real routes with an owner and an SLO', () => {
  it('POSITIVE: the typed object API and the briefing — registered by the steward, declared and released by their owner, observed, scored ok', async () => {
    P3 = await released('platform.object-api', 'The typed object API (SYNTHETIC registration)', 'object', DECL({
      contract: { schema: [{ object_type: 'OBS', schema_version: OBS_V }] }, serving_modes: ['api'], inputs: [{ kind: 'object_type', ref: 'OBS' }, { kind: 'object_type', ref: 'EVD' }],
      outputs: [{ kind: 'external', ref: '/v1/objects' }], slo: { availability_pct: 99.5, attainment_floor_pct: 95, grace_ticks: 2 } }));
    P4 = await released('platform.briefing', 'The briefing (SYNTHETIC registration)', 'briefing', DECL({
      contract: { schema: [{ object_type: 'BRF', schema_version: BRF_V }] }, serving_modes: ['api', 'package'], inputs: [{ kind: 'object_type', ref: 'DPK' }, { kind: 'object_type', ref: 'WRN' }],
      outputs: [{ kind: 'object_type', ref: 'BRF', authority: true }], slo: { freshness_seconds: 3600, attainment_floor_pct: 90 } }));
    for (const id of [P3, P4]) await observe(owner, id, { measure: 'availability_pct', value: 99.9, threshold: 99.5, met: true, source: 'synthetic availability probe (B90 harness)' });
    const s3 = (await compute(owner, P3)).scorecard;
    expect(s3).toMatchObject({ product_id: P3, overall: 'ok', below_floor: false, lineage_closed: true, policy_closed: true, state_at: 'released', released_version: 1, consecutive_below_floor: 0, grace_ticks: 2 });
    expect(Number(s3['attainment_pct'])).toBe(100); expect(Number(s3['floor_pct'])).toBe(95);
    expect(s3['slo']).toMatchObject({ availability_pct: { observations: 1, met: 1 } });
    expect(s3['reviews']).toMatchObject({ admission: { outcome: 'accepted', version: 1 } });
    expect(s3['consumers']).toEqual({ registered: 0, accepted: 0, revoked: 0, migrated: 0 });
    expect(s3['contract_tests']).toEqual({ pass: 0, fail: 0, version: 1 });
    expect(s3['reasons']).toEqual([]);
    const s4 = (await compute(steward, P4)).scorecard;
    expect(s4).toMatchObject({ overall: 'ok', below_floor: false });
    expect(Number(s4['floor_pct'])).toBe(90);
    const l = (await listCards(reviewer)).products;
    expect(l.find((x) => x['product_id'] === P3)?.['scorecard']).toMatchObject({ overall: 'ok' });
    expect(l.find((x) => x['product_id'] === P2)?.['scorecard']).toBeNull();
  });
});

describe('B90 §R · c. THE SCORECARD (DP-05-006, DP-41-006): on demand, by the tick, the degradation by the tick, the restoration', () => {
  it('POSITIVE (on demand): the corridor stream\'s scorecard reads FAILING (the contract tests\' attainment under the floor), its reasons in words; on demand never degrades', async () => {
    const s = (await compute(owner, P1)).scorecard;
    expect(s).toMatchObject({ overall: 'failing', below_floor: true, state_at: 'released', released_version: 3, consecutive_below_floor: 1 });
    expect(s['slo']).toMatchObject({ contract_test_pass: { observations: 4, met: 3 } });
    expect(Number(s['attainment_pct'])).toBe(75);
    expect((s['reasons'] as string[]).some((r) => /SLO attainment 75(\.00)?% is under the floor 95%/.test(r))).toBe(true);
    expect(s['consumers']).toEqual({ registered: 0, accepted: 3, revoked: 1, migrated: 2 });
    expect(s['contract_tests']).toEqual({ pass: 1, fail: 0, version: 3 });
    expect(String(s['digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect((await read(owner, P1)).product['state']).toBe('released');
  });
  it('REFUSAL: a product never released (state), an outsider (the policy), an analyst who is neither owner nor steward (authority), a window outside 1–366', async () => {
    await refused(compute(owner, P2), /product scorecard rejected \(state\): product corridor-exposure-eur is registered/, 409);
    await refused(compute(outsider, P1), /./, 403);
    await refused(compute(other, P1), /product scorecard rejected \(authority\)/, 403);
    await refused(compute(owner, P1, { windowDays: 0 }), /product scorecard rejected \(window\)/, 422);
  });
  it('THE TICK: the step product-scorecards computes one scorecard per released or degraded product; the corridor stream — a second consecutive below-floor scorecard (grace 2) — is DEGRADED by the tick and every ACCEPTED consumer gets a product.degradation item', async () => {
    await tick(1);
    const c1 = await cards(P1);
    expect(c1.length).toBe(2);
    expect(c1[1]).toMatchObject({ computed_by: agentPrincipalId, overall: 'failing', below_floor: true, state_at: 'released' });
    const p = (await read(owner, P1)).product;
    expect(p['state']).toBe('degraded');
    expect(String(p['degraded_reason'])).toMatch(/^SLO attainment 75(\.00)?% under the floor 95% on 2 consecutive scorecard\(s\) over 30 day\(s\) — degraded by the attention tick step product-scorecards$/);
    const it1 = await items(P1);
    // the consumers in their registration order: B's re-registration (a. RECOVERY), A's migrated row, the administrator's migrated row (b.)
    expect(it1.map((i) => [i['owner'], i['cause_event_type'], i['state']])).toEqual([[consumerB.principalId, 'ProductDegraded', 'open'], [consumerA.principalId, 'ProductDegraded', 'open'], [dadmin.principalId, 'ProductDegraded', 'open']]);
    const itA = it1.find((i) => i['owner'] === consumerA.principalId)!;
    expect(itA).toMatchObject({ signal_class: 'product.degradation', subject_kind: 'product', subject_id: P1 });
    expect(String(itA['title'])).toMatch(/^Product corridor-warning-stream DEGRADED: SLO attainment/);
    expect(itA['details']).toMatchObject({ consumer_id: CA2, contract_version: 2, impact: 'purchase orders are not re-routed when the stream breaks', last_valid_version: 3 });
    expect(it1[0]['details']).toMatchObject({ consumer_id: CB2, contract_version: 1 });
    const ev = await rows(sql`select details from products.product_events where product_id = ${P1}::uuid and event = 'product.degraded'`);
    expect((ev[0]!['details'] as Row)['by']).toBe('tick');
    expect(((ev[0]!['details'] as Row)['notified'] as unknown[]).length).toBe(3);
    // the platform products were scored by the same tick, ok; the registered product was not scored
    expect((await cards(P3)).map((c) => c['overall'])).toEqual(['ok', 'ok']);
    expect((await cards(P4)).length).toBe(2);
    expect((await cards(P2)).length).toBe(0);
  });
  it('THE GRACE: one below-floor scorecard does not degrade (the object API, availability missed once); the second consecutive one does', async () => {
    await observe(owner, P3, { measure: 'availability_pct', value: 90, threshold: 99.5, met: false, source: 'synthetic availability probe (B90 harness)' });
    await tick(2);
    expect((await cards(P3)).slice(-1)[0]).toMatchObject({ overall: 'failing', below_floor: true, state_at: 'released' });
    expect((await read(owner, P3)).product['state']).toBe('released');
    await observe(owner, P3, { measure: 'availability_pct', value: 88, threshold: 99.5, met: false, source: 'synthetic availability probe (B90 harness)' });
    await tick(3);
    const p3 = (await read(owner, P3)).product;
    expect(p3['state']).toBe('degraded');
    expect(String(p3['degraded_reason'])).toMatch(/on 2 consecutive scorecard\(s\)/);
    expect((await items(P3)).length).toBe(0); // no accepted consumer: nobody to notify — the event says so
    expect(((await rows(sql`select details from products.product_events where product_id = ${P3}::uuid and event = 'product.degraded'`))[0]!['details'] as Row)['notified']).toEqual([]);
    expect((await read(owner, P4)).product['state']).toBe('released');
  });
  it('RECOVERY (the restoration): refused while the latest scorecard reads failing and no domain review is newer than the degradation; an accepted DOMAIN review restores; the next tick does not re-degrade (the count restarts at the restoration)', async () => {
    await refused(restore(owner, P1), /data product rejected \(review\): product corridor-warning-stream stays degraded — the latest scorecard reads failing and no accepted domain review is newer/, 409);
    await refused(restore(steward, P1), /data product rejected \(not_owner\)/, 403);
    await refused(restore(owner, P4), /data product rejected \(state\): product platform.briefing is released; a degraded product is restored/, 409);
    await review(reviewer, P1, { version: 3, kind: 'domain', outcome: 'accepted', notes: 'the corridor stream reviewed for the domain after its degradation: the consumers re-tested (B90 harness)' });
    const p = (await restore(owner, P1, 'restored after the domain review (B90 harness)')).product;
    expect(p).toMatchObject({ state: 'released', degraded_reason: null, degraded_at: null, released_version: 3, restored_on: 'domain_review' });
    await tick(4);
    expect((await read(owner, P1)).product['state']).toBe('released');
    const last = (await cards(P1)).slice(-1)[0];
    expect(last).toMatchObject({ computed_by: agentPrincipalId, below_floor: true, state_at: 'released' });
    expect((await events(P1)).filter((e) => e === 'product.degraded').length).toBe(1);
  });
});

describe('B90 §R · d. THE COST (DP-41-006): a period once, with its basis', () => {
  it('POSITIVE: the owner attributes January, the steward February — decimal strings, an ISO-4217 code, the basis', async () => {
    const jan = (await cost(owner, P1, { periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: '1250.00', currency: 'EUR', basis: 'compute-minutes × the corridor stream\'s share (SYNTHETIC)' })).attribution;
    expect(jan).toMatchObject({ product_id: P1, period_start: '2026-01-01', period_end: '2026-02-01', currency: 'EUR', attributed_by: owner.principalId });
    expect(String(jan['amount'])).toBe('1250.00');
    expect((await cost(steward, P1, { periodStart: '2026-02-01', periodEnd: '2026-03-01', amount: 1310, currency: 'eur', basis: 'compute-minutes (SYNTHETIC)' })).attribution).toMatchObject({ currency: 'EUR', attributed_by: steward.principalId });
  });
  it('REFUSAL: the same period twice (duplicate), an end before the start, a float, a negative amount, a code that is not ISO-4217, an analyst who is neither owner nor steward, a retired product later', async () => {
    await refused(cost(owner, P1, { periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: '1.00', currency: 'EUR', basis: 'again' }), /product cost rejected \(duplicate\): the period 2026-01-01 – 2026-02-01 of product corridor-warning-stream is already attributed/, 409);
    await refused(cost(owner, P1, { periodStart: '2026-04-01', periodEnd: '2026-03-01', amount: '1.00', currency: 'EUR', basis: 'backwards' }), /product cost rejected \(period\)/, 422);
    await refused(cost(owner, P1, { periodStart: '2026-04-01', periodEnd: '2026-05-01', amount: 12.5, currency: 'EUR', basis: 'a float' }), /product cost rejected \(amount\)/, 422);
    await refused(cost(owner, P1, { periodStart: '2026-04-01', periodEnd: '2026-05-01', amount: '-5.00', currency: 'EUR', basis: 'negative' }), /product cost rejected \(amount\)/, 422);
    await refused(cost(owner, P1, { periodStart: '2026-04-01', periodEnd: '2026-05-01', amount: '5.00', currency: 'E1', basis: 'a code' }), /product cost rejected \(currency\)/, 422);
    await refused(cost(other, P1, { periodStart: '2026-04-01', periodEnd: '2026-05-01', amount: '5.00', currency: 'EUR', basis: 'an analyst' }), /product cost rejected \(authority\)/, 403);
  });
  it('RECOVERY: after the refused duplicate, March is attributed; the scorecard carries the latest period', async () => {
    await cost(owner, P1, { periodStart: '2026-03-01', periodEnd: '2026-04-01', amount: '1190.40', currency: 'EUR', basis: 'compute-minutes (SYNTHETIC)' });
    const s = (await compute(owner, P1)).scorecard;
    expect(s['cost']).toMatchObject({ period_start: '2026-03-01', period_end: '2026-04-01', currency: 'EUR' });
    expect(String((s['cost'] as Row)['amount'])).toBe('1190.40');
    const v = (await view(reviewer, P1)).scorecard;
    expect((v['cost'] as Row[]).map((c) => c['period_start'])).toEqual(['2026-03-01', '2026-02-01', '2026-01-01']);
    await refused(view(outsider, P1), /./, 403);
  });
});

describe('B90 §R · e. THE LIFECYCLE (DP-41-005, DP-05-006 "retirement evidence"): withdrawal with the last valid version kept, retirement', () => {
  it('POSITIVE (withdrawal): the owner withdraws with a reason — the DPR\'s WITHDRAWN version admitted (the same object, the next object_version), the released version stays the last valid one, the accepted consumer notified', async () => {
    await declare(owner, P2, DECL({ serving_modes: ['query'], inputs: [{ kind: 'product', ref: P1 }], outputs: [{ kind: 'object_type', ref: 'WRN', authority: false }] }));
    await review(reviewer, P2, { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the exposure metric reviewed for admission (B90 harness)' });
    expect((await release(owner, P2, 1)).product).toMatchObject({ state: 'released', released_version: 1 });
    CA_P2 = String((await regConsumer(consumerA, P2, { purpose: 'procurement reads the exposure to size the hedge', impact: 'the hedge is sized on stale exposure' })).consumer['consumer_id']);
    await accept(consumerA, P2, CA_P2, 1);
    const p = (await withdraw(owner, P2, 'the exposure metric moves to the certified semantic layer (B90 harness)')).product;
    expect(p).toMatchObject({ state: 'withdrawn', released_version: 1, withdrawn_by: owner.principalId, withdrawal_reason: 'the exposure metric moves to the certified semantic layer (B90 harness)' });
    expect(p['dpr']).toMatchObject({ object_version: 2, lifecycle_state: 'withdrawn', schema_ref: 'DPR@v1' });
    expect((p['notified'] as Row[]).map((n) => n['consumer_principal_id'])).toEqual([consumerA.principalId]);
    const c = await rows(sql`select object_version::int as v, lifecycle_state, truth_state, withdrawal_reason, correction_of, supersedes, payload ->> 'state' as state from objects.canonical_objects where object_id = ${P2}::uuid and object_type = 'DPR' order by object_version`);
    expect(c).toEqual([
      { v: 1, lifecycle_state: 'active', truth_state: 'asserted', withdrawal_reason: null, correction_of: null, supersedes: null, state: 'released' },
      { v: 2, lifecycle_state: 'withdrawn', truth_state: 'withdrawn', withdrawal_reason: 'the exposure metric moves to the certified semantic layer (B90 harness)', correction_of: `DPR:${P2}@1`, supersedes: `DPR:${P2}@1`, state: 'withdrawn' },
    ]);
    const it2 = await items(P2);
    expect(it2.map((i) => [i['owner'], i['cause_event_type'], i['state']])).toEqual([[consumerA.principalId, 'ProductWithdrawn', 'open']]);
    expect(String(it2[0]['title'])).toMatch(/^Product corridor-exposure-eur WITHDRAWN: .* \(last valid version 1\)$/);
    // the last valid version stays readable
    const r = (await read(consumerA, P2)).product;
    expect(r).toMatchObject({ state: 'withdrawn', released_version: 1 });
    expect((r['versions'] as Row[])[0]).toMatchObject({ version: 1, released_by: owner.principalId });
    expect((r['declaration'] as Row)['serving_modes']).toEqual(['query']);
  });
  it('REFUSAL: a non-owner withdrawing (not_owner), a new version on a withdrawn product (the prelude), a second withdrawal, a degradation and a restoration of a withdrawn product, a retirement over an ACCEPTED consumer (consumers), a withdrawal of a registered product', async () => {
    await refused(withdraw(other, P2, 'an analyst withdraws the metric'), /data product rejected \(not_owner\)/, 403);
    await refused(declare(owner, P2, DECL()), /data product rejected \(state\): product corridor-exposure-eur is withdrawn/, 409);
    await refused(withdraw(owner, P2, 'withdrawn a second time'), /data product rejected \(state\): product corridor-exposure-eur is withdrawn/, 409);
    await refused(degrade(steward, P2, 'degrading a withdrawn product'), /data product rejected \(state\)/, 409);
    await refused(restore(owner, P2), /data product rejected \(state\)/, 409);
    await refused(retire(owner, P2), /data product rejected \(consumers\): product corridor-exposure-eur still has 1 accepted consumer\(s\)/, 409);
    await refused(withdraw(owner, P5 === '' ? (P5 = String((await register(owner, { key: 'x-never-released', title: 'A product never released (SYNTHETIC)', kind: 'dataset', purpose: 'registered, declared, never released — retired without a DPR', ownerPrincipalId: owner.principalId })).product['product_id'])) : P5, 'withdrawing a registered product'),
      /data product rejected \(state\): product x-never-released is registered/, 409);
    await refused(withdraw(owner, P2, 'short'), /data product rejected \(reason\)/, 422);
  });
  it('RECOVERY (the retirement): the consumer revokes itself; refused without an accepted RETIREMENT review (review); the reviewer records it; retired — the DPR\'s ARCHIVED version admitted, nothing observed on it after, the last valid version still readable; a never-released product retires without a DPR', async () => {
    expect((await revoke(consumerA, P2, CA_P2, 'procurement moves to the certified metric (B90 harness)')).consumer).toMatchObject({ state: 'revoked', revoked_by: consumerA.principalId });
    await refused(retire(owner, P2), /data product rejected \(review\): product corridor-exposure-eur has no accepted retirement review/, 409);
    await refused(review(owner, P2, { version: 1, kind: 'retirement', outcome: 'accepted', notes: 'the owner reviews their own retirement' }), /data product rejected \(separation\)/, 403);
    await review(reviewer, P2, { version: 1, kind: 'retirement', outcome: 'accepted', notes: 'retirement reviewed: no consumer remains, the semantic layer serves the metric (B90 harness)' });
    await refused(retire(steward, P2), /data product rejected \(not_owner\)/, 403);
    const p = (await retire(owner, P2)).product;
    expect(p).toMatchObject({ state: 'retired', retired_by: owner.principalId, released_version: 1, withdrawal_reason: 'the exposure metric moves to the certified semantic layer (B90 harness)' });
    expect(p['dpr']).toMatchObject({ object_version: 3, lifecycle_state: 'archived' });
    const c = await rows(sql`select object_version::int as v, lifecycle_state, truth_state, payload ->> 'state' as state, supersedes from objects.canonical_objects where object_id = ${P2}::uuid and object_type = 'DPR' and object_version = 3`);
    expect(c).toEqual([{ v: 3, lifecycle_state: 'archived', truth_state: 'withdrawn', state: 'retired', supersedes: `DPR:${P2}@2` }]);
    await refused(observe(steward, P2, { measure: 'availability_pct', value: 1, met: true, source: 'a probe on a retired product' }), /data product rejected \(state\): product corridor-exposure-eur is retired/, 409);
    await refused(cost(owner, P2, { periodStart: '2026-05-01', periodEnd: '2026-06-01', amount: '1.00', currency: 'EUR', basis: 'a retired product' }), /product cost rejected \(state\)/, 409);
    await refused(retire(owner, P2), /data product rejected \(state\): product corridor-exposure-eur is already retired/, 409);
    expect(((await read(reviewer, P2)).product['versions'] as Row[])[0]!['released_at']).not.toBeNull();
    expect(await events(P2)).toEqual(['product.registered', 'product.declared', 'product.reviewed', 'product.released', 'consumer.registered', 'consumer.accepted', 'product.withdrawn', 'consumer.revoked', 'product.reviewed', 'product.retired']);
    // the never-released product: a declared version, a retirement review, retired — no DPR to archive
    await declare(owner, P5, DECL());
    await review(reviewer, P5, { version: 1, kind: 'retirement', outcome: 'accepted', notes: 'never released; retired before any consumer (B90 harness)' });
    const p5 = (await retire(owner, P5)).product;
    expect(p5).toMatchObject({ state: 'retired', released_version: null, dpr: null });
    expect((await rows(sql`select count(*)::int as n from objects.canonical_objects where object_id = ${P5}::uuid`))[0]).toEqual({ n: 0 });
  });
  it('the manual degradation by the steward with a reason (the human path) and the ledgers: consumers never deleted; contract tests, scorecards and cost append-only', async () => {
    const p = (await degrade(steward, P4, 'the briefing renderer is being replaced; served from the last edition (B90 harness)')).product;
    expect(p).toMatchObject({ state: 'degraded', degraded_reason: 'the briefing renderer is being replaced; served from the last edition (B90 harness)', notified: [] });
    await refused(degrade(other, P1, 'an analyst degrades the stream'), /data product rejected \(authority\)/, 403);
    await refused(degrade(steward, P4, 'degraded a second time'), /data product rejected \(state\): product platform.briefing is degraded/, 409);
    await expect(sql`delete from products.product_consumers where consumer_id = ${CB}::uuid`.execute(su)).rejects.toThrow(/never deleted/);
    await expect(sql`update products.contract_tests set outcome = 'pass' where product_id = ${P1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.scorecards where product_id = ${P1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`update products.cost_attributions set amount = 0 where product_id = ${P1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
  });
});
