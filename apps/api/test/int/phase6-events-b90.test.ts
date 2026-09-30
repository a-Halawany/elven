/**
 * CP-6 B90 §E (0095) — EVENT PRODUCTS AND SUBSCRIPTIONS (F-P7-F-09's event half; V7 ch43 DP-43-001..006), through the real database and
 * controllers, on the prelude's registry (§0: register → declare → review → release):
 *
 *   a THE EVENT PRODUCT: the corridor warning stream (kind event) gains its event declaration over the whitelisted ledger
 *     prediction.warning_events (declared fields, versioned; the subject, the ordering key, pull, the retention, the replay policy); a ledger
 *     outside the whitelist, a product of another kind, a non-owner analyst refused.
 *   b THE STREAM AND THE EMITTER: warnings raised through the B28 route (the intake + the owner's processing) become stream rows on the
 *     tick step `event-products` (61) — a DENSE sequence, kind signal by name, the payload PROJECTED to the schema's fields, the source row
 *     once; `events.emitted` with the count.
 *   c SUBSCRIPTIONS under the authority boundary: the procurement analyst registers (purpose, fields, window, consequence, filters, the
 *     schema version, the lag policy, the capabilities); a consumer of ANOTHER TENANT, fields outside the schema, a purpose outside the
 *     policy refused; the owner authorizes (a non-owner refused by the port; a consumer that cannot process corrections refused on a
 *     correcting source); the consumer's own read serves after the checkpoint, projected to the granted fields.
 *   d CHECKPOINTS, LAG, PAUSE, CONFORMANCE: acknowledge forward only, never beyond the head; the tick step `subscription-lag` (63) flags the
 *     subscription lagging (3 > 2) with the offset preserved, the owner's attention item (class subscription.lag) and the SLO observation
 *     lag_events met false; the read refused; resumption refused before conformance and while still behind; conformance, catch-up, the
 *     owner's resumption; the next tick observes lag_events met true.
 *   e SCHEMA COMPATIBILITY: a breaking re-declaration pauses the subscription (reason schema) on the next tick, the owner notified;
 *     conformance to the new version, resumption; an additive re-declaration pauses nothing.
 *   f REPLAY AND CORRECTIONS: a replay moves the checkpoint back within retention (recorded); a correction row (stated superuser move: a
 *     `warning.retracted` row on the SOURCE ledger — no port emits that name yet) reaches the consumer that handles corrections and is
 *     WITHHELD and counted for the one that declared it cannot; revocation preserves the offsets and refuses every later read.
 *   g ISOLATION AND THE READS: another domain of the tenant lists nothing; an outsider is refused by the policy; the owner's and the
 *     consumer's reads; the ledgers append-only.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). Stated superuser
 * moves: a second domain and a foreign tenant are seeded directly (fixture scaffolding); one `warning.retracted` row is written on the
 * warning ledger (the source), never on the part's own tables.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ProductsController } from '../../src/products/products.controller.js';
import type { EventsController } from '../../src/products/events/events.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let commitDb: Db;
let products: ProductsController; let events: EventsController; let prediction: PredictionController; let exec: ExecutiveController;
let scheduler: SchedulerService; let timer: AttentionTimerService;
/** The steward, the owner (forecast_owner: registers, releases, raises the warnings), the reviewer (executive), the procurement consumer, a second consumer, an analyst of another domain, the administrators, an outsider. */
let steward: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let consumer: AuthenticatedPrincipal; let consumer2: AuthenticatedPrincipal;
let elsewhere: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let agentId = ''; let D2 = ''; let FOREIGN = ''; let WRN_A = '';
let P1 = ''; let P2 = ''; let SUB = ''; let SUB2 = ''; let SUB_NEW = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});

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
/** The same envelope for ANOTHER DOMAIN of the tenant (the isolation read). */
const E2 = (as: AuthenticatedPrincipal, action: string, type: string) => ({ eyeEnvelope: { ...(h.env(as, action, type, null, 'executive') as unknown as Row), domain_id: D2 }, eyePrincipal: as }) as never;
const register = (as: AuthenticatedPrincipal, payload: Row) => products.register(E(as, 'products.product.register', 'DPR'), T(), D(), { payload }) as Promise<{ product: Row }>;
const declare = (as: AuthenticatedPrincipal, id: string, declaration: unknown) => products.declare(E(as, 'products.product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } as Row }) as Promise<{ product: Row }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.review(E(as, 'products.product.review', 'DPR', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const release = (as: AuthenticatedPrincipal, id: string, version: number) => products.release(E(as, 'products.product.release', 'DPR', id), T(), D(), id, { payload: { version } }) as Promise<{ product: Row }>;
const declareEvent = (as: AuthenticatedPrincipal, id: string, declaration: Row) => events.declare(E(as, 'products.event_product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } }) as Promise<{ event_product: Row }>;
const readProduct = (as: AuthenticatedPrincipal, id: string) => events.read(E(as, 'products.product.read', 'DPR', id), T(), D(), id) as Promise<{ at: string; event_product: Row }>;
const listProducts = (as: AuthenticatedPrincipal) => events.list(E(as, 'products.product.read', 'DPR'), T(), D(), { payload: {} }) as Promise<{ event_products: Row[] }>;
const subscribe = (as: AuthenticatedPrincipal, payload: Row) => events.register(E(as, 'products.subscription.register', 'SUB'), T(), D(), { payload }) as Promise<{ subscription: Row }>;
const authorize = (as: AuthenticatedPrincipal, id: string) => events.authorize(E(as, 'products.subscription.authorize', 'SUB', id), T(), D(), id) as Promise<{ subscription: Row }>;
const readEvents = (as: AuthenticatedPrincipal, id: string, payload: Row = {}) => events.readEvents(E(as, 'products.subscription.read', 'SUB', id), T(), D(), id, { payload }) as Promise<{ read: Row }>;
const getSub = (as: AuthenticatedPrincipal, id: string) => events.get(E(as, 'products.subscription.read', 'SUB', id), T(), D(), id) as Promise<{ subscription: Row }>;
const mine = (as: AuthenticatedPrincipal, productId: string) => events.subscriptions(E(as, 'products.subscription.read', 'SUB'), T(), D(), { payload: { mine: true, productId } }) as Promise<{ subscriptions: Row[] }>;
const ack = (as: AuthenticatedPrincipal, id: string, sequence: unknown) => events.checkpoint(E(as, 'products.subscription.checkpoint', 'SUB', id), T(), D(), id, { payload: { sequence } as Row }) as Promise<{ subscription: Row }>;
const pause = (as: AuthenticatedPrincipal, id: string, reason: string) => events.pause(E(as, 'products.subscription.pause', 'SUB', id), T(), D(), id, { payload: { reason } }) as Promise<{ subscription: Row }>;
const conform = (as: AuthenticatedPrincipal, id: string, declaration: Row) => events.conform(E(as, 'products.subscription.conform', 'SUB', id), T(), D(), id, { payload: { declaration } }) as Promise<{ subscription: Row }>;
const resume = (as: AuthenticatedPrincipal, id: string) => events.resume(E(as, 'products.subscription.resume', 'SUB', id), T(), D(), id) as Promise<{ subscription: Row }>;
const replay = (as: AuthenticatedPrincipal, id: string, fromSequence: number, reason: string) => events.replay(E(as, 'products.subscription.replay', 'SUB', id), T(), D(), id, { payload: { fromSequence, reason } }) as Promise<{ subscription: Row }>;
const revoke = (as: AuthenticatedPrincipal, id: string, reason: string) => events.revoke(E(as, 'products.subscription.revoke', 'SUB', id), T(), D(), id, { payload: { reason } }) as Promise<{ subscription: Row }>;

/* ───────────── the warnings (the B28 route: the intake under prediction.warning.raise, then the owner's processing) ───────────── */
const submit = (title: string) => inCommitContext(commitDb, { sessionId: owner.sessionId as string, contextKey: owner.contextKey as string }, { tenantId: T(), domainId: D() },
  'prediction.warning.raise', uuidv7(), async (tx) => (await sql<{ r: Row }>`select prediction.submit_warning_candidate(${T()}::uuid, ${D()}::uuid, 'weak_signal', ${'b90e-' + uuidv7().slice(-10)},
    ${JSON.stringify({ synthetic: true })}::jsonb, ${title}, 'C2', 0.7::numeric, ${'b90e-cause-' + uuidv7().slice(-8)}, ${JSON.stringify({ geographies: ['BAB-EL-MANDEB'], horizon: '30d' })}::jsonb, '[]'::jsonb,
    null::int, ${owner.principalId}::uuid, ${uuidv7()}::uuid) as r`.execute(tx as never)).rows[0]!.r);
const processNow = () => prediction.processWarningCandidates(h.req(owner, 'prediction.warning.candidates.process', 'WRN', null), T(), D(), { payload: {} } as never) as unknown as Promise<{ processing: { raised: Row[] } }>;
/** Raise n SYNTHETIC corridor warnings; answers their ids. */
const raise = async (n: number, label: string): Promise<string[]> => {
  for (let i = 0; i < n; i++) await submit(`Bab el-Mandeb: SYNTHETIC ${label} ${i + 1} (B90 events harness)`);
  const p = await processNow();
  const ids = p.processing.raised.filter((r) => r['decision'] === 'raised').map((r) => String(r['warning_id']));
  expect(ids.length, JSON.stringify(p.processing.raised)).toBe(n);
  return ids;
};

/* ───────────── the tick and the rows ───────────── */
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2036, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const outputs = obj(t.run?.outputs);
  const steps = obj(outputs['steps'] ?? outputs);
  return { t, emit: obj(steps['event-products']), lag: obj(steps['subscription-lag']) };
};
const stream = async (productId: string) => rows(sql`select sequence::int as sequence, event_kind, source_event, subject_id::text as subject_id, ordering_key, payload, schema_version from products.event_stream where product_id = ${productId}::uuid order by sequence`);
const subRow = async (id: string) => (await rows(sql`select state, paused_reason, pause_note, checkpoint_sequence::int as checkpoint, conformed_at, revoked_at, schema_version, handles_corrections from products.event_subscriptions where subscription_id = ${id}::uuid`))[0]!;
const productEvents = async (productId: string) => (await rows(sql`select event, details from products.product_events where product_id = ${productId}::uuid order by occurred_at, event_id`)).map((e) => String(e['event']));
const items = async (subscriptionId: string) => rows(sql`select item_id::text as item_id, signal_class, subject_kind, owner_principal_id::text as owner, state, title, details, cause_event_type from executive.attention_items where signal_class = 'subscription.lag' and subject_id = ${subscriptionId}::uuid order by created_at`);
const slo = async (productId: string, measure: string) => rows(sql`select value::numeric as value, threshold::numeric as threshold, met, source, details from products.slo_observations where product_id = ${productId}::uuid and measure = ${measure} order by observed_at`);

/** The SYNTHETIC event declaration over the warning ledger: declared fields (a subset of what warning.raised writes), narrowed to the raise and the retraction. */
const EVENT_DECL = (over: Row = {}): Row => ({
  schema: { version: 'v1', fields: [{ name: 'title', type: 'string' }, { name: 'consequence_class', type: 'string' }, { name: 'confidence', type: 'number' }, { name: 'closes_at', type: 'instant' }, { name: 'routed_to', type: 'uuid' }] },
  subject_kind: 'warning', ordering_key: 'subject_id', delivery: 'pull', retention_days: 30, replay_policy: { allowed: true },
  source: { ledger: 'prediction.warning_events', kinds: ['warning.raised', 'warning.retracted'] },
  ...over,
});
/** The prelude's SYNTHETIC declaration (the contract by the WRN schema row; the purposes name the procurement consumer's). */
const DECL = (over: Row = {}): Row => ({
  contract: { schema: [{ object_type: 'WRN', schema_version: 'v2' }] }, serving_modes: ['event'],
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }], outputs: [{ kind: 'object_type', ref: 'WRN', authority: false }],
  slo: { lag_events: 2 }, policy: { purposes: ['executive', 'procurement'], data_classes: ['internal'] }, cost: { basis: 'compute-minutes' }, quality: { completeness: 'declared' },
  ...over,
});
const SUBSCRIPTION = (over: Row = {}): Row => ({
  productId: P1, purpose: 'procurement', granted: { fields: ['title', 'consequence_class', 'closes_at'], consequence: 'C2', from: null, to: null }, filters: {},
  schemaVersion: 'v1', lagPolicy: { max_lag_events: 2, max_lag_seconds: 86_400 }, handlesCorrections: true, handlesReplays: true, ...over,
});
/** Register (the steward) → event-declare (the owner) → declare (the owner) → review (the reviewer) → release (the owner): a released event product. */
const releasedEventProduct = async (key: string, title: string, eventDecl: Row): Promise<string> => {
  const id = String((await register(steward, { key, title, kind: 'event', purpose: 'the corridor early warnings as a subscribable event product (SYNTHETIC)', ownerPrincipalId: owner.principalId })).product['product_id']);
  await declareEvent(owner, id, eventDecl);
  await declare(owner, id, DECL());
  await review(reviewer, id, { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the event contract, its SLO and its purposes reviewed (B90 events harness)' });
  const p = (await release(owner, id, 1)).product;
  expect(p).toMatchObject({ state: 'released', released_version: 1 });
  return id;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  commitDb = h.app.get<Db>(COMMIT_DB);
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  const { EventsController: EC } = await import('../../src/products/events/events.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  products = h.app.get(PC); events = h.app.get(EC); prediction = h.app.get(Pc); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  // THE HUMANS, each with a session of its own (the ports compare the acting principal)
  steward = await h.humanWithSession(['data_steward'], 'b90e-steward');
  owner = await h.humanWithSession(['forecast_owner'], 'b90e-owner');
  reviewer = await h.humanWithSession(['executive'], 'b90e-reviewer');
  consumer = await h.humanWithSession(['domain_analyst'], 'b90e-procurement');
  consumer2 = await h.humanWithSession(['domain_analyst'], 'b90e-consumer-2');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b90e-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b90e-dadmin');
  outsider = await h.humanWithSession(['collection_manager'], 'b90e-outsider');
  // ANOTHER DOMAIN of the tenant (fixture scaffolding) and an analyst who lives there
  D2 = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T()}::uuid, ${'b90e-elsewhere-' + D2.slice(-8)}, 'active', clock_timestamp())`.execute(su);
  elsewhere = await h.humanWithSession(['domain_analyst'], 'b90e-elsewhere', 'DOMAIN', { domainId: D2 });
  // A FOREIGN TENANT's human (fixture scaffolding; no session — the authority boundary refuses the grant, not the login)
  const ft = uuidv7(); const fd = uuidv7(); FOREIGN = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${ft}::uuid, ${'b90e-foreign-' + ft.slice(-8)}, 'active', 'EU', 'default', clock_timestamp())`.execute(su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${fd}::uuid, ${ft}::uuid, ${'b90e-foreign-domain-' + fd.slice(-8)}, 'active', clock_timestamp())`.execute(su);
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status) values (${FOREIGN}::uuid, 'human', 'DOMAIN', ${ft}::uuid, ${fd}::uuid, ${'b90e-foreign-consumer-' + FOREIGN.slice(-8)}, ${'fx-frgn-' + FOREIGN.slice(-8)}, 'active')`.execute(su);
  // THE ATTENTION AGENT: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: reviewer.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // THE ATTENTION POLICY the warning route needs (B28's shape: warning.raised routed to the forecast owner)
  await exec.publishAttentionPolicy(h.req(reviewer, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the corridor warnings routed to the forecast owner (B90 events harness)', rules: { classes: {
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.4 }, route_roles: ['forecast_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 2, suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' } } } } as never });
}, 400_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B90 §E · a THE EVENT PRODUCT', () => {
  it('a · POSITIVE: the corridor warning stream (kind event) is registered, event-declared over the warning ledger, declared, reviewed and released; a second stream narrowed to the raise alone', async () => {
    P1 = await releasedEventProduct('corridor-' + 'warning-stream', 'Corridor warning stream (SYNTHETIC)', EVENT_DECL());
    const v = (await readProduct(owner, P1)).event_product;
    expect(obj(v['event'])).toMatchObject({ declaration_version: 1, schema_version: 'v1', schema_fields: ['closes_at', 'confidence', 'consequence_class', 'routed_to', 'title'], compatibility: 'additive', subject_kind: 'warning', ordering_key: 'subject_id', delivery: 'pull', retention_days: 30, producer_domain_id: D() });
    expect(obj(obj(v['event'])['source'])).toMatchObject({ ledger: 'prediction.warning_events', kinds: ['warning.raised', 'warning.retracted'] });
    expect(v).toMatchObject({ state: 'released', head: 0, emits_corrections: true, subscriptions: [] });
    P2 = await releasedEventProduct('corridor-' + 'warning-raised-only', 'Corridor warnings raised (SYNTHETIC)', EVENT_DECL({ source: { ledger: 'prediction.warning_events', kinds: ['warning.raised'] } }));
    expect((await readProduct(owner, P2)).event_product['emits_corrections']).toBe(false);
    expect((await listProducts(steward)).event_products.map((x) => x['product_key']).sort()).toEqual(['corridor-' + 'warning-raised-only', 'corridor-' + 'warning-stream']);
    expect(await productEvents(P1)).toEqual(['product.registered', 'event_product.declared', 'product.declared', 'product.reviewed', 'product.released']);
  });
  it('a · REFUSAL: a ledger outside the whitelist (the route and the port), a product of another kind, a non-owner analyst, a schema without fields, a push delivery', async () => {
    await refused(declareEvent(owner, P1, EVENT_DECL({ source: { ledger: 'identity.principals' } })), /event product rejected \(source\): identity\.principals is not one of the platform ledgers/, 422);
    const m = String((await register(steward, { key: 'x-metric', title: 'A metric product (SYNTHETIC)', kind: 'metric', purpose: 'a metric product takes no event declaration', ownerPrincipalId: owner.principalId })).product['product_id']);
    await refused(declareEvent(owner, m, EVENT_DECL()), /event product rejected \(kind\): product x-metric is of kind metric/, 422);
    await refused(declareEvent(consumer, P1, EVENT_DECL()), /event product rejected \(authority\)/, 403); // domain_analyst passes the policy; the port judges the owner
    await refused(declareEvent(owner, P1, EVENT_DECL({ schema: { version: 'v9', fields: [] } })), /event product rejected \(schema\)/, 422);
    await refused(declareEvent(owner, P1, EVENT_DECL({ delivery: 'push' })), /event product rejected \(delivery\): an event product is served by pull/, 422);
    await refused(declareEvent(outsider, P1, EVENT_DECL()), /./, 403);
    expect(obj((await readProduct(owner, P1)).event_product['event'])['declaration_version'], 'a refused declaration changes nothing').toBe(1);
  });
});

describe('B90 §E · b THE STREAM AND THE EMITTER', () => {
  it('b · POSITIVE: one warning raised through the B28 route; the tick step event-products streams it — sequence 1, kind signal, the payload projected to the five fields, the source row once; events.emitted with the count', async () => {
    [WRN_A] = await raise(1, 'attack near Perim');
    const { emit } = await tick(1);
    expect(emit).toMatchObject({ products: 2, emitted: 2 }); // P1 and P2 each streamed the raise
    const s = await stream(P1);
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({ sequence: 1, event_kind: 'signal', source_event: 'warning.raised', subject_id: WRN_A, ordering_key: WRN_A, schema_version: 'v1' });
    expect(Object.keys(obj(s[0]!['payload'])).sort()).toEqual(['closes_at', 'confidence', 'consequence_class', 'routed_to', 'title']); // never the whole row (no flip_event_id, no timing_mode)
    expect(obj(s[0]!['payload'])).toMatchObject({ consequence_class: 'C2', title: expect.stringMatching(/^Bab el-Mandeb: SYNTHETIC attack near Perim 1/) });
    const ev = await rows(sql`select details from products.product_events where product_id = ${P1}::uuid and event = 'events.emitted'`);
    expect(ev.length).toBe(1);
    expect(obj(ev[0]!['details'])).toMatchObject({ count: 1, from_sequence: 1, to_sequence: 1, ledger: 'prediction.warning_events' });
    expect((await readProduct(owner, P1)).event_product).toMatchObject({ head: 1, stream: { rows: 1, within_retention: 1, by_kind: { signal: 1 } } });
  });
  it('b · REFUSAL and RECOVERY: a second tick emits nothing twice (the source row once, the sequence dense); the stream is append-only', async () => {
    const { emit } = await tick(2);
    expect(emit).toMatchObject({ emitted: 0 });
    expect((await stream(P1)).map((x) => x['sequence'])).toEqual([1]);
    await expect(sql`update products.event_stream set payload = '{}'::jsonb where product_id = ${P1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.event_stream where product_id = ${P1}::uuid`.execute(su)).rejects.toThrow(/append-only/);
  });
});

describe('B90 §E · c SUBSCRIPTIONS UNDER THE AUTHORITY BOUNDARY', () => {
  it('c · POSITIVE: the procurement analyst registers (purpose, three fields, consequence C2, the lag policy 2 / 86400); the owner authorizes; the consumer\'s own read serves the one event projected to the granted fields', async () => {
    const s = (await subscribe(consumer, SUBSCRIPTION())).subscription;
    SUB = String(s['subscription_id']);
    expect(s).toMatchObject({ product_id: P1, consumer_principal_id: consumer.principalId, purpose: 'procurement', state: 'registered', checkpoint_sequence: 0, schema_version: 'v1', handles_corrections: true, handles_replays: true,
      granted: { fields: ['title', 'consequence_class', 'closes_at'], consequence: 'C2', from: null, to: null }, lag_policy: { max_lag_events: 2, max_lag_seconds: 86_400 } });
    await refused(readEvents(consumer, SUB), /subscription rejected \(state\): .* registered and not yet authorized/, 409);
    const a = (await authorize(owner, SUB)).subscription;
    expect(a).toMatchObject({ state: 'active', authorized_by: owner.principalId });
    const r = (await readEvents(consumer, SUB)).read;
    expect(r).toMatchObject({ after: 0, next_after: 1, head: 1, checkpoint: 0, served: 1, omitted: { corrections: 0 } });
    const e = (r['events'] as Row[])[0]!;
    expect(e).toMatchObject({ sequence: 1, event_kind: 'signal', source_event: 'warning.raised', subject_id: WRN_A, subject_kind: 'warning', schema_version: 'v1' });
    expect(Object.keys(obj(e['payload'])).sort()).toEqual(['closes_at', 'consequence_class', 'title']); // the GRANTED fields, not the schema's five
    expect((await mine(consumer, P1)).subscriptions.map((x) => x['subscription_id'])).toEqual([SUB]);
  });
  it('c · REFUSAL: a consumer of another tenant (the authority boundary), fields outside the schema, a purpose outside the policy, a stale schema version, a bad lag policy, an outsider (the policy); a non-owner authorizing (the port), a consumer that cannot process corrections authorized on a correcting source (capability); another principal reading', async () => {
    await refused(subscribe(steward, SUBSCRIPTION({ consumerPrincipalId: FOREIGN })), /subscription rejected \(authority\): the authority boundary/, 403);
    await refused(subscribe(consumer, SUBSCRIPTION({ granted: { fields: ['title', 'flip_event_id'], consequence: 'C2' } })), /subscription rejected \(fields\): "flip_event_id" is not a field of schema v1/, 422);
    await refused(subscribe(consumer, SUBSCRIPTION({ purpose: 'marketing' })), /subscription rejected \(purpose\): purpose marketing is outside the product's policy purposes \(executive, procurement\)/, 422);
    await refused(subscribe(consumer, SUBSCRIPTION({ schemaVersion: 'v0' })), /subscription rejected \(schema\): product corridor-warning-stream serves schema version v1/, 422);
    await refused(subscribe(consumer, SUBSCRIPTION({ lagPolicy: { max_lag_events: 0, max_lag_seconds: 10 } })), /subscription rejected \(lag_policy\)/, 422);
    await refused(subscribe(consumer, SUBSCRIPTION({ granted: { fields: ['title'], consequence: 'C2', from: '2030-01-02T00:00:00Z', to: '2030-01-01T00:00:00Z' } })), /subscription rejected \(window\)/, 422);
    await refused(subscribe(outsider, SUBSCRIPTION()), /./, 403);
    // consumer 2 cannot process corrections: registered on the correcting stream, its authorization is refused; on the narrowed stream it is authorized
    const s2 = (await subscribe(consumer2, SUBSCRIPTION({ handlesCorrections: false, handlesReplays: false }))).subscription;
    await refused(authorize(consumer2, String(s2['subscription_id'])), /subscription rejected \(authority\): a subscription is authorized by the product's owner/, 403); // domain_analyst passes the policy; the port judges the owner
    await refused(authorize(owner, String(s2['subscription_id'])), /subscription rejected \(capability\): the source ledger prediction\.warning_events of product corridor-warning-stream carries correction events/, 422);
    expect((await subRow(String(s2['subscription_id']))).state).toBe('registered');
    SUB2 = String((await subscribe(consumer2, SUBSCRIPTION({ productId: P2, handlesCorrections: false, handlesReplays: false }))).subscription['subscription_id']);
    expect((await authorize(owner, SUB2)).subscription).toMatchObject({ state: 'active' });
    await refused(readEvents(consumer2, SUB), /subscription rejected \(not_consumer\)/, 403);
    await refused(getSub(outsider, SUB), /./, 403);
  });
  it('c · RECOVERY: a steward registers for a named consumer of this tenant; the consumer may read it once the owner authorizes; a subject-kind filter that excludes the product serves nothing and says so', async () => {
    const s = (await subscribe(steward, SUBSCRIPTION({ consumerPrincipalId: consumer2.principalId, filters: { subject_kinds: ['forecast'] } }))).subscription;
    expect(s).toMatchObject({ consumer_principal_id: consumer2.principalId, registered_by: steward.principalId, state: 'registered' });
    await authorize(steward, String(s['subscription_id']));
    const r = (await readEvents(consumer2, String(s['subscription_id']))).read;
    expect(r).toMatchObject({ served: 0, note: expect.stringMatching(/subject kind filter excludes/) });
    await revoke(steward, String(s['subscription_id']), 'the filter names another subject kind; registered in error (B90 events harness)');
  });
});

describe('B90 §E · d CHECKPOINTS, LAG, PAUSE AND CONFORMANCE', () => {
  it('d · POSITIVE: the consumer acknowledges through 1; three more warnings; the tick flags the subscription LAGGING (3 > 2) with the offset preserved, the owner\'s item, subscription.lagging, the SLO observation lag_events met false', async () => {
    expect((await ack(consumer, SUB, 1)).subscription).toMatchObject({ checkpoint_sequence: 1, state: 'active', head: 1, lag_events: 0 });
    await raise(3, 'a second incident');
    const { emit, lag } = await tick(3);
    expect(emit).toMatchObject({ emitted: 6 }); // three rows on each of the two streams
    expect(lag).toMatchObject({ evaluated: 2, lagging: 2, healthy: 0, paused_schema: 0 }); // consumer 2 never acknowledged on P2: 4 > 2 there as well
    expect(await subRow(SUB)).toMatchObject({ state: 'lagging', paused_reason: 'lag', checkpoint: 1 });
    const its = await items(SUB);
    expect(its.length).toBe(1);
    expect(its[0]).toMatchObject({ signal_class: 'subscription.lag', subject_kind: 'subscription', owner: owner.principalId, state: 'open', cause_event_type: 'subscription.lagging' });
    expect(obj(its[0]!['details'])).toMatchObject({ reason: 'lag', lag_events: 3, max_lag_events: 2, product_key: 'corridor-' + 'warning-stream', consumer: consumer.principalId, checkpoint: 1 });
    expect(String(its[0]!['title'])).toMatch(/^Subscription lagging beyond policy: Corridor warning stream/);
    const o = await slo(P1, 'lag_events');
    expect(o.map((x) => [Number(x['value']), Number(x['threshold']), x['met']])).toEqual([[3, 2, false]]);
    expect(obj(o[0]!['details'])).toMatchObject({ subscription_id: SUB, head: 4, checkpoint: 1 });
    expect((await slo(P1, 'lag_seconds')).length).toBe(1);
    expect((await slo(P2, 'lag_events')).map((x) => x['met'])).toEqual([false]); // consumer 2 never acknowledged: 4 > 2 on P2 as well
    expect(await productEvents(P1)).toContain('subscription.lagging');
  });
  it('d · REFUSAL: the read is refused while lagging (the reason named); acknowledging backwards, beyond the head, by another principal; resumption before conformance, and after conformance while still behind; conformance by the owner; a pause of a lagging subscription', async () => {
    await refused(readEvents(consumer, SUB), /subscription rejected \(state\): .* is lagging \(lag\); delivery is paused with the checkpoint 1 preserved/, 409);
    await refused(ack(consumer, SUB, 1), /subscription rejected \(sequence\): a checkpoint advances; 1 is not beyond the checkpoint 1/, 422);
    await refused(ack(consumer, SUB, 9), /subscription rejected \(head\): sequence 9 is beyond the stream head 4/, 422);
    await refused(ack(consumer, SUB, 'two'), /subscription rejected \(sequence\)/, 422);
    await refused(ack(owner, SUB, 2), /subscription rejected \(not_consumer\)/, 403);
    await refused(resume(owner, SUB), /subscription rejected \(state\): .* has not declared conformance since the pause/, 409);
    await refused(conform(owner, SUB, { caught_up: true, can_process: true }), /subscription rejected \(not_consumer\)/, 403);
    await refused(conform(consumer, SUB, { caught_up: false, can_process: true }), /subscription rejected \(conformance\): a consumer that has not caught up/, 422);
    expect((await conform(consumer, SUB, { caught_up: true, can_process: true, note: 'the backlog processed (B90 events harness)' })).subscription).toMatchObject({ state: 'lagging' });
    await refused(resume(owner, SUB), /subscription rejected \(lag\): .* still 3 events behind the head \(policy 2\)/, 409);
    await refused(resume(consumer, SUB), /subscription rejected \(authority\)/, 403);
    await refused(pause(owner, SUB, 'a lagging subscription is already paused (B90 events harness)'), /subscription rejected \(state\): .* only an active subscription is paused/, 409);
  });
  it('d · RECOVERY: the consumer catches up (acknowledges through 4 while lagging — not resumed on its own); the owner resumes; the next tick observes lag_events met true and raises nothing twice', async () => {
    expect((await ack(consumer, SUB, 4)).subscription).toMatchObject({ checkpoint_sequence: 4, state: 'lagging', lag_events: 0 });
    expect((await resume(owner, SUB)).subscription).toMatchObject({ state: 'active', paused_reason: null, checkpoint_sequence: 4 });
    const { lag } = await tick(4);
    expect(lag).toMatchObject({ lagging: 0, healthy: 1 }); // consumer 2's P2 subscription is already lagging (not evaluated again)
    expect((await slo(P1, 'lag_events')).map((x) => [Number(x['value']), x['met']])).toEqual([[3, false], [0, true]]);
    expect((await items(SUB)).length).toBe(1);
    expect((await readEvents(consumer, SUB)).read).toMatchObject({ served: 0, after: 4, head: 4 });
    const ck = await rows(sql`select kind, from_sequence::int as f, to_sequence::int as t from products.subscription_checkpoints where subscription_id = ${SUB}::uuid order by acknowledged_at`);
    expect(ck).toEqual([{ kind: 'advance', f: 0, t: 1 }, { kind: 'advance', f: 1, t: 4 }]);
  });
});

describe('B90 §E · e SCHEMA COMPATIBILITY', () => {
  it('e · POSITIVE: the owner re-declares the event product with schema v2 BREAKING; the next tick pauses the subscription (reason schema) and notifies the owner once', async () => {
    const d = (await declareEvent(owner, P1, EVENT_DECL({ schema: { version: 'v2', fields: [{ name: 'title', type: 'string' }, { name: 'consequence_class', type: 'string' }, { name: 'closes_at', type: 'instant' }] }, compatibility: 'breaking' }))).event_product;
    expect(d).toMatchObject({ declaration_version: 2, schema_version: 'v2', compatibility: 'breaking' });
    const { lag } = await tick(5);
    expect(lag).toMatchObject({ paused_schema: 1 });
    expect(await subRow(SUB)).toMatchObject({ state: 'paused', paused_reason: 'schema', checkpoint: 4, schema_version: 'v1' });
    const its = await items(SUB);
    expect(its.length).toBe(2);
    expect(obj(its[1]!['details'])).toMatchObject({ reason: 'schema', current_schema: 'v2', accepted_schema: 'v1' });
    expect(its[1]).toMatchObject({ cause_event_type: 'subscription.paused', owner: owner.principalId, state: 'open' });
  });
  it('e · REFUSAL: the read while paused; resumption before conformance; a conformance naming a version the product does not serve; a conformance without the version leaves the schema pending', async () => {
    await refused(readEvents(consumer, SUB), /subscription rejected \(state\): .* is paused \(schema\)/, 409);
    await refused(resume(owner, SUB), /subscription rejected \(state\): .* has not declared conformance since the pause/, 409);
    await refused(conform(consumer, SUB, { caught_up: true, can_process: true, schema_version: 'v3' }), /subscription rejected \(schema\): the product serves schema version v2/, 422);
    await conform(consumer, SUB, { caught_up: true, can_process: true });
    await refused(resume(owner, SUB), /subscription rejected \(schema_pending\): .* still accepts schema v1 while the product serves v2/, 409);
  });
  it('e · RECOVERY: conformance to v2, the owner resumes; an ADDITIVE re-declaration (v3) pauses nothing on the next tick; a new subscription must name the current version', async () => {
    expect((await conform(consumer, SUB, { caught_up: true, can_process: true, schema_version: 'v2' })).subscription).toMatchObject({ schema_version: 'v2', state: 'paused' });
    expect((await resume(owner, SUB)).subscription).toMatchObject({ state: 'active', schema_version: 'v2', checkpoint_sequence: 4 });
    await declareEvent(owner, P1, EVENT_DECL({ schema: { version: 'v3', fields: [{ name: 'title', type: 'string' }, { name: 'consequence_class', type: 'string' }, { name: 'closes_at', type: 'instant' }, { name: 'level', type: 'string' }] }, compatibility: 'additive' }));
    const { lag } = await tick(6);
    expect(lag).toMatchObject({ paused_schema: 0, healthy: 1 });
    expect((await subRow(SUB)).state).toBe('active');
    await refused(subscribe(consumer, SUBSCRIPTION({ schemaVersion: 'v2' })), /subscription rejected \(schema\): product corridor-warning-stream serves schema version v3/, 422);
  });
});

describe('B90 §E · f REPLAY, CORRECTIONS AND REVOCATION', () => {
  it('f · POSITIVE: a correction row (stated superuser move on the SOURCE ledger: warning.retracted on warning A) is emitted as kind correction with schema v3 and served to the consumer that handles corrections; a replay from 1 moves the checkpoint back and re-serves 2..5', async () => {
    // STATED SUPERUSER MOVE: no port emits warning.retracted yet (0088: the name is reserved); the row is written on the ledger the product reads, as that port would write it
    await sql`insert into prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${WRN_A}::uuid, 'warning.retracted', ${owner.principalId}::uuid,
                      ${JSON.stringify({ title: 'Bab el-Mandeb: the attack report retracted (SYNTHETIC)', consequence_class: 'C2', reason: 'the report was withdrawn by its source', synthetic: true })}::jsonb, ${uuidv7()}::uuid)`.execute(su);
    // the narrowed stream (P2) now also names the retraction: the owner re-declares its kinds (consumer 2, which cannot process corrections, stays active — the read's filter is the defence)
    await declareEvent(owner, P2, EVENT_DECL({ source: { ledger: 'prediction.warning_events', kinds: ['warning.raised', 'warning.retracted'] } }));
    const { emit } = await tick(7);
    expect(emit).toMatchObject({ emitted: 2 });
    const s = await stream(P1);
    expect(s[4]).toMatchObject({ sequence: 5, event_kind: 'correction', source_event: 'warning.retracted', subject_id: WRN_A, schema_version: 'v3' });
    expect(Object.keys(obj(s[4]!['payload'])).sort()).toEqual(['consequence_class', 'title']); // projected to v3's fields; `reason` and `synthetic` are not among them
    const r = (await readEvents(consumer, SUB)).read;
    expect(r).toMatchObject({ after: 4, next_after: 5, served: 1, omitted: { corrections: 0 } });
    expect((r['events'] as Row[])[0]).toMatchObject({ sequence: 5, event_kind: 'correction' });
    expect((await ack(consumer, SUB, 5)).subscription).toMatchObject({ checkpoint_sequence: 5 });
    const rp = (await replay(consumer, SUB, 1, 'the procurement ledger lost the March batch; re-reading from the first warning (B90 events harness)')).subscription;
    expect(rp).toMatchObject({ checkpoint_sequence: 1, replayed_from: 5, state: 'active' });
    const again = (await readEvents(consumer, SUB)).read;
    expect((again['events'] as Row[]).map((e) => e['sequence'])).toEqual([2, 3, 4, 5]);
    const rr = await rows(sql`select from_sequence::int as f, to_sequence::int as t, reason, requested_by::text as by from products.subscription_replays where subscription_id = ${SUB}::uuid`);
    expect(rr).toEqual([{ f: 5, t: 1, reason: expect.stringMatching(/lost the March batch/), by: consumer.principalId }]);
    expect(await productEvents(P1)).toContain('events.replayed');
  });
  it('f · REFUSAL: consumer 2 (cannot process corrections) reads P2 and the correction is WITHHELD and counted; a replay by a consumer that cannot process replays, from at or beyond the checkpoint, without a reason; reading before the checkpoint', async () => {
    // consumer 2 is lagging on P2 (never acknowledged): it conforms and catches up, the owner resumes, then reads
    await conform(consumer2, SUB2, { caught_up: true, can_process: true });
    await ack(consumer2, SUB2, 4);
    await resume(owner, SUB2);
    const r = (await readEvents(consumer2, SUB2)).read;
    expect(r).toMatchObject({ after: 4, next_after: 5, served: 0, omitted: { corrections: 1, reason: expect.stringMatching(/cannot process corrections; the correction rows are withheld and counted/) } });
    expect(r['events']).toEqual([]);
    await ack(consumer2, SUB2, 5);
    await refused(replay(consumer2, SUB2, 1, 'consumer 2 asks a replay it cannot process (B90 events harness)'), /subscription rejected \(capability\): .* cannot process replays/, 422);
    await refused(replay(consumer, SUB, 1, 'a replay to the checkpoint itself (B90 events harness)'), /subscription rejected \(sequence\): a replay moves the checkpoint back; 1 is not before the checkpoint 1/, 422);
    await refused(replay(consumer, SUB, 0, 'why'), /subscription rejected \(reason\)/, 422);
    await refused(readEvents(consumer, SUB, { afterSequence: 0 }), /subscription rejected \(window\): reading from sequence 0 is before the checkpoint 1/, 422);
    expect((await readEvents(consumer, SUB, { afterSequence: 3 })).read).toMatchObject({ after: 3, served: 2 }); // at or after the checkpoint is the consumer's to choose
  });
  it('f · RECOVERY: the owner revokes the subscription with a reason — the offsets preserved, every later read refused, a second revocation refused; the consumer registers anew and, once authorized, reads from a fresh checkpoint', async () => {
    const v = (await revoke(owner, SUB, 'procurement moved to the nightly package; the stream is no longer read (B90 events harness)')).subscription;
    expect(v).toMatchObject({ state: 'revoked', revoked_by: owner.principalId, checkpoint_sequence: 1 });
    await refused(readEvents(consumer, SUB), /subscription rejected \(state\): .* was revoked at .* \(procurement moved to the nightly package.*\); nothing is served \(the checkpoint 1 is preserved\)/, 409);
    await refused(revoke(owner, SUB, 'revoked twice (B90 events harness)'), /subscription rejected \(state\): .* was revoked at/, 409);
    await refused(ack(consumer, SUB, 2), /subscription rejected \(state\)/, 409);
    expect(await subRow(SUB)).toMatchObject({ state: 'revoked', checkpoint: 1 });
    SUB_NEW = String((await subscribe(consumer, SUBSCRIPTION({ schemaVersion: 'v3', granted: { fields: ['title', 'level'], consequence: 'C1' } }))).subscription['subscription_id']);
    await authorize(owner, SUB_NEW);
    const r = (await readEvents(consumer, SUB_NEW)).read;
    expect(r).toMatchObject({ after: 0, served: 5, head: 5 });
    expect(Object.keys(obj((r['events'] as Row[])[0]!['payload'])).sort()).toEqual(['title']); // `level` is granted but was not among v1's projected fields on the early rows
  });
});

describe('B90 §E · g ISOLATION AND THE READS', () => {
  it('g · POSITIVE: the owner\'s read lists the subscriptions with their lag and the latest lag observations; the consumer\'s read of its subscription names the product, the head, the checkpoints and the replays', async () => {
    const v = (await readProduct(owner, P1)).event_product;
    expect(v).toMatchObject({ head: 5, emits_corrections: true, stream: { rows: 5, by_kind: { signal: 4, correction: 1 } } });
    const subs = v['subscriptions'] as Row[];
    expect(subs.length).toBe(4); // SUB, consumer 2's refused registration, the steward's revoked one, SUB_NEW — every row stays (never deleted)
    expect(subs.map((s) => s['subscription_id'])).toEqual(expect.arrayContaining([SUB, SUB_NEW]));
    expect(subs.find((s) => s['subscription_id'] === SUB)).toMatchObject({ state: 'revoked', checkpoint_sequence: 1, lag_events: 4 });
    expect(subs.find((s) => s['subscription_id'] === SUB_NEW)).toMatchObject({ state: 'active', checkpoint_sequence: 0, lag_events: 5 });
    expect(obj(v['slo'])['lag_events']).toMatchObject({ met: true, source: 'subscription-lag tick' });
    const s = (await getSub(consumer, SUB)).subscription;
    expect(s).toMatchObject({ state: 'revoked', head: 5, lag_events: 4, product: { product_key: 'corridor-' + 'warning-stream', schema_version: 'v3', emits_corrections: true } });
    expect((s['replays'] as Row[]).length).toBe(1);
    expect((s['checkpoints'] as Row[]).map((c) => c['kind'])).toEqual(['replay', 'advance', 'advance', 'advance']);
  });
  it('g · REFUSAL: an analyst of another domain of the tenant lists NO event product and sees no subscription (RLS); an outsider is refused by the policy; a read outside the caller\'s scope answers unknown', async () => {
    expect((await (events.list(E2(elsewhere, 'products.product.read', 'DPR'), T(), D2, { payload: {} }) as Promise<{ event_products: Row[] }>)).event_products).toEqual([]);
    expect((await (events.subscriptions(E2(elsewhere, 'products.subscription.read', 'SUB'), T(), D2, { payload: {} }) as Promise<{ subscriptions: Row[] }>)).subscriptions).toEqual([]);
    await refused(events.read(E2(elsewhere, 'products.product.read', 'DPR', P1), T(), D2, P1) as Promise<unknown>, /event product rejected \(unknown_product\)/, 404);
    await refused(readProduct(outsider, P1), /./, 403);
    await refused(listProducts(outsider), /./, 403);
  });
  it('g · RECOVERY: the ledgers are append-only and the rows are never deleted (superuser moves refused by the triggers)', async () => {
    await expect(sql`delete from products.event_subscriptions where subscription_id = ${SUB}::uuid`.execute(su)).rejects.toThrow(/never deleted/);
    await expect(sql`delete from products.event_products where product_id = ${P2}::uuid`.execute(su)).rejects.toThrow(/never deleted/);
    await expect(sql`update products.subscription_checkpoints set to_sequence = 99 where subscription_id = ${SUB}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from products.subscription_replays where subscription_id = ${SUB}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    const evs = await productEvents(P1);
    for (const e of ['event_product.declared', 'events.emitted', 'subscription.registered', 'subscription.authorized', 'checkpoint.advanced', 'subscription.lagging', 'subscription.conformed', 'subscription.resumed', 'subscription.paused', 'events.replayed', 'subscription.revoked']) expect(evs).toContain(e);
  });
});
