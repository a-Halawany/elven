/**
 * CP-6 B23 (migration 0084, part `attention`) — MATERIAL CHANGES AND GOVERNED REVIEWS AS EVENTS; THE BRIEFING'S ATTENTION SECTION:
 * L10-I02 MaterialChangeRaised@v1 (published by the decisions subscriber in the note's own transaction, routed by the attention
 * subscriber as decision.material_change), L10-I03 ReviewConvened@v1 (a governed review convened by a named human around a declared
 * objective | decision | scenario | commitment | outcome, routed to its chair as review.convened) and BRF@v2 (the executive briefing's
 * attention section as of known_at) — on a real database with real Redis, the real outbox publisher and the real subscription
 * dispatcher (EYE_SCHEDULER_ENABLED at module top, the B6 rule), the decisions and attention subscriptions registered in the harness's
 * own domain, the world of `bootDecisionWorld` and B23's own humans with sessions of their own (the ports compare the acting principal).
 *
 *   E1 · VOCABULARY + POLICY: the attention kind selects its six types (the two new ones by default); twelve subscribable types; a
 *   policy with rules for decision.material_change and review.convened admitted by the port, an unknown class refused (422); the two
 *   register rows bound in 0084 (this part's rows only — no global count is pinned here).
 *   E2 · MATERIAL CHANGE (positive): a forecast cited by a DRAFT and a COMMITTED package withdrawn through the route → the decisions
 *   subscriber notes both packages and publishes MaterialChangeRaised@v1 for each IN THE NOTE'S TRANSACTION (the same correlation,
 *   a later sequence) with consequence C2 / C3, confidence 1, hours to the decision deadline and the active policy version → the
 *   attention subscriber routes decision.material_change to the package owner (material, open, the deadline, the reasons).
 *   E3 · AT-LEAST-ONCE + DE-DUPLICATION + CHECKPOINT: the same event redelivered (deliveries 2, no second item), the attention
 *   subscription replayed (the route answers `repeated`, still one item per cause), the upstream GraphChanged re-driven to the decisions
 *   subscription (input.already_noted — no second MaterialChangeRaised).
 *   E4 · QUARANTINE: PLANTED rows of both types whose payloads are not the contract → unresolved invalid_event / human_review,
 *   event.quarantined; nothing routed; the rows stay published.
 *   E5 · CONVENE (positive, idempotent): the executive convenes a review of the committed decision (chair, reviewers, due in 48 h, from
 *   the material-change item) → the review at the package's version, ReviewConvened@v1 from the write, review.convened routed to the
 *   chair with hours_to_window; the same key and content → the recorded review, repeated, no second event; the other four kinds
 *   (objective, scenario, commitment, a PLANTED outcome — stated) convened.
 *   E6 · CONVENE refusals: the PDP (an analyst, a forecast owner: 403), the port (a different review under the key 409, a stale version
 *   409, an unknown subject 404, an agent as chair 422, a due instant in the past 422), the intake (a kind that is not reviewable 422).
 *   E7 · CLOSE + NO LONGER STANDS: a non-chair's conclusion refused (403), the convener withdraws a review, the chair concludes one
 *   (twice → 409; a short note 422; an unknown review 404); the package withdrawn; a replay of the attention subscription → both the
 *   material change on the withdrawn package and the concluded review recorded signal.no_longer_stands, nothing routed again.
 *   E8 · RECONCILE THE COMMITTED PUBLICATION: the domain's worker stopped, a review convened (its ReviewConvened row PUBLISHED), the
 *   queue LOST (obliterated — stated) before any delivery → no delivery row; the dispatcher's reconciliation re-drives the published
 *   row → applied once, one item.
 *   E9 · BRF@v2: a domain briefing composed → schema_version v2, the header BRF@v2, the stored payload valid against BRF@v2 (and not
 *   BRF@v1: the section is a top-level key), the section as of known_at (the routed items with confidence bands, every state counted,
 *   the material changes since no prior); recomposed under the same known_at → the same digest; an item acknowledged AFTER an edition
 *   leaves the edition's section as it was; a later edition (prior bound) carries only the material change raised since; a v1 edition
 *   (PLANTED — stated) read as v1 with no section; the CHECK binds the version to the section (23514).
 *
 * EACH CASE LOGS ONE `B23 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_EVENT_TYPES, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b23-attention-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type OutboxRow = { id: string; status: string; event_type: string; schema_version: string | null; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }>;
  items_unresolved: Array<{ item: string; effect: string; effect_ref: string | null; reason: string }>; last_error: string | null; failure_class: string | null; disposition: string | null; replay_seq: number };
type Item = { item_id: string; signal_class: string; subject_kind: string; subject_id: string; cause_event_id: string; cause_event_type: string; title: string; outcome: string; state: string; owner_principal_id: string | null;
  route_roles: string[]; policy_version: number | null; evaluation: Row; details: Row; due_at: Date | null; created_at: Date };
const KINDS: ConsumerKind[] = ['decisions', 'attention'];

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let graph: GraphController; let prediction: PredictionController; let exec: ExecutiveController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let strategyOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
/** What the cases leave one another (each named where it is made). */
let sourceKey = ''; let S = ''; let F = ''; let P1 = ''; let P2 = { pkg: '', v: 0, commitmentId: '' };
let gcWithdrawn: OutboxRow | null = null; let mcr1: OutboxRow | null = null; let mcr2: OutboxRow | null = null; let item1 = ''; let item2 = '';
let R1 = ''; let rc1: OutboxRow | null = null; let reviewItem = ''; let RObj = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}; recent: ${JSON.stringify(dispatcher.recentDeliveries().slice(0, 4))}`);
    await sleep(300);
  }
}
const settle = async (ms = 90_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), D());
    const pending = Number((await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'pending'`.execute(su)).rows[0]!.n);
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0 && pending === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(q)}; pending outbox rows ${pending}`);
    await sleep(300);
  }
};
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20/B22 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string): Promise<{ status: number | null; code: string | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sqlstate = async (p: Promise<unknown>): Promise<string | null> => { try { await p; return null; } catch (e) { return String((e as { code?: string }).code ?? 'unknown'); } };
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B23 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the outbox and the deliveries ───────────── */
const outboxRows = async (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, event_type, schema_version, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
const published = (eventType: string, after: Date, where: (p: Row) => boolean = () => true, n = 1): Promise<OutboxRow[]> =>
  waitFor(`${n} ${eventType} row(s) published`, () => outboxRows(eventType, after, where), (rows) => rows.length >= n && rows.every((r) => r.status === 'published'));
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, items_unresolved, last_error, failure_class, disposition, replay_seq from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
const delivered = async (eventId: string, kind: ConsumerKind, state: 'applied' | 'unresolved' = 'applied', ok: (d: Delivery) => boolean = () => true): Promise<Delivery> =>
  (await waitFor(`the ${kind} delivery of ${eventId} ${state}`, () => deliveriesFor(eventId), (rows) => rows.some((d) => d.consumer_kind === kind && d.state === state && ok(d)), 120_000)).find((d) => d.consumer_kind === kind)!;
/** A row PLANTED in the tenant's outbox partition the way 0064 places every row (the B22 plantOutbox idiom) — PENDING, so the real publisher leases and routes it. */
async function plantOutbox(eventType: string, payload: Row): Promise<string> {
  const id = uuidv7(); const key = `tenant:${T()}`;
  await sql`with pk as (insert into objects.outbox_partitions (partition_key) values (${key}) on conflict (partition_key) do nothing),
                 seq as (update objects.outbox_partitions set next_seq = next_seq + 1 where partition_key = ${key} returning next_seq - 1 as n)
    insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, partition_key, partition_seq, schema_version)
    select ${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${key}, seq.n, 'v1' from seq`.execute(su);
  return id;
}

/* ───────────── the rows ───────────── */
const itemsOf = async (signalClass: string, subjectId: string): Promise<Item[]> => (await sql<Item>`select item_id::text, signal_class, subject_kind, subject_id::text, cause_event_id::text, cause_event_type, title, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, details, due_at, created_at from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${signalClass} and subject_id = ${subjectId}::uuid order by created_at`.execute(su)).rows;
const itemsCausedBy = async (eventId: string) => (await sql<{ n: number }>`select count(*)::int n from executive.attention_items where cause_event_id = ${eventId}::uuid`.execute(su)).rows[0]!.n;
const packageEvents = async (pkg: string, event: string) => (await sql<{ event_id: string; details: Row; correlation_id: string; occurred_at: Date }>`select event_id::text, details, correlation_id::text, occurred_at from decision.package_events where package_id = ${pkg}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const reviewRow = async (id: string) => (await sql<Row>`select review_id::text, state, subject_kind, subject_id::text, subject_version, subject_title, chair_principal_id::text chair, reviewers, due_at, convened_by::text, convene_key, request_digest, cause_item_id::text, closed_by::text, closing_note from executive.reviews where review_id = ${id}::uuid`.execute(su)).rows[0];
const reviewEvents = async (id: string) => (await sql<{ event: string; actor: string; details: Row }>`select event, actor_principal_id::text actor, details from executive.review_events where review_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;

/* ───────────── the routes (in process) ───────────── */
const register = (kind: ConsumerKind) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;
const replay = (subscriptionId: string, fromSeq: number, reason: string) => graph.replaySubscription(h.req(dadmin, 'graph.subscription.replay', 'SUB', subscriptionId, 'platform.administration'), T(), D(), subscriptionId,
  { payload: { fromSeq, reason } }) as unknown as Promise<{ replayed: number; events: string[] }>;
const publish = (as: AuthenticatedPrincipal, rules: unknown, reason: string) => exec.publishAttentionPolicy(h.req(as, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string, note?: string) => exec.acknowledgeAttentionItem(h.req(as, 'executive.attention.item.acknowledge', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: note === undefined ? {} : { note } }) as unknown as Promise<{ item: Row }>;
type Convened = { review: Row & { review_id: string; repeated: boolean } };
const convene = (as: AuthenticatedPrincipal, payload: Row) => exec.conveneReview(h.req(as, 'executive.review.convene', 'RVW', null, 'executive'), T(), D(), { payload }) as unknown as Promise<Convened>;
const conclude = (as: AuthenticatedPrincipal, id: string, note: string) => exec.concludeReview(h.req(as, 'executive.review.close', 'RVW', id, 'executive'), T(), D(), id, { payload: { note } }) as unknown as Promise<{ review: Row }>;
const withdrawReview = (as: AuthenticatedPrincipal, id: string, note: string) => exec.withdrawReview(h.req(as, 'executive.review.close', 'RVW', id, 'executive'), T(), D(), id, { payload: { note } }) as unknown as Promise<{ review: Row }>;
const listReviews = (as: AuthenticatedPrincipal, payload: Row = {}) => exec.listReviews(h.req(as, 'executive.review.read', 'RVW', null, 'executive'), T(), D(), { payload: payload as never }) as unknown as Promise<{ reviews: Row[] }>;
const getReview = (as: AuthenticatedPrincipal, id: string) => exec.getReview(h.req(as, 'executive.review.read', 'RVW', id, 'executive'), T(), D(), id) as unknown as Promise<{ review: Row & { events: Row[]; attention: Row[] } }>;
const registerSeries = (seriesKey: string) => prediction.registerSeries(h.req(w.twinOwner, 'prediction.series.register', 'SER', null, 'prediction'), T(), D(),
  { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits (B23 attention)' } });
const issueOn = (seriesKey: string, origin: string) => prediction.issueForecast(h.req(forecastOwner, 'prediction.forecast.issue', 'FCT', null, 'prediction'), T(), D(),
  { payload: { seriesKey, horizon: '30d', observedThrough: origin, knownAt: new Date().toISOString(), assumptions: [w.assumptionId], label: 'live', refreshCadence: 'daily' } }) as unknown as Promise<{ forecast: { forecastId: string } }>;
const withdrawForecast = (forecastId: string, reason: string) => prediction.withdrawForecast(h.req(forecastOwner, 'prediction.forecast.withdraw', 'FCT', forecastId, 'prediction'), T(), D(), forecastId,
  { payload: { reason, unfitClass: 'owner_judgement' } }) as unknown as Promise<{ withdrawal: Row }>;
/** A draft package citing a forecast (the fixture's full draft and an option on the forecast). */
const draftCiting = async (forecastId: string): Promise<{ pkg: string; v: number }> => {
  const d = await c.fullDraft();
  await c.option(d.pkg, d.v, { key: 'on-forecast', title: 'Act on the B23 forecast', kind: 'intervention', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'forecast', id: forecastId, version: 1 }] });
  return d;
};

/* ───────────── the policy ───────────── */
const RULES = (): Row => ({
  classes: {
    'decision.material_change': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
    'review.convened': { materiality: { min_consequence: 'C2', min_confidence: 0.5, max_hours_to_window: 720 }, route_roles: ['strategy_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
  },
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  graph = h.app.get(Gc); prediction = h.app.get(Pc); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b23a-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b23a-domain-admin');
  executive = await h.humanWithSession(['executive'], 'b23a-executive');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b23a-forecast-owner');
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b23a-strategy-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b23a-analyst');
  // THE WORLD (booted BEFORE the subscriptions: its own events are left behind by the 'leave' backlog).
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid limit 1`.execute(su)).rows[0]!.source_key;
  await settle();
  for (const kind of KINDS) {
    const r = await register(kind);
    subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
    expect(r.served.workerRunning, `${kind}: the domain's queue is served from registration`).toBe(true);
  }
  await settle();
}, 300_000);

afterAll(async () => {
  try { dispatcher.pauseRenewalsForTests(false); } catch { /* not paused */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B23 · material changes and governed reviews as events; the briefing\'s attention section (0084; L10-I02, L10-I03, BRF@v2)', () => {
  it('E1 · VOCABULARY + POLICY: the attention kind selects its six types; twelve subscribable types; a policy with the two new classes admitted, an unknown class refused (422); L10-I02 and L10-I03 bound in 0084', async () => {
    const rows = (await sql<{ consumer_kind: string; event_types: string[] }>`select consumer_kind, event_types from graph.subscriptions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'active' order by consumer_kind`.execute(su)).rows;
    expect(rows.find((r) => r.consumer_kind === 'attention')!.event_types).toEqual([...CONSUMER_EVENT_TYPES.attention]);
    expect(rows.find((r) => r.consumer_kind === 'attention')!.event_types.slice(-2)).toEqual(['MaterialChangeRaised', 'ReviewConvened']);
    const vocab = (await sql<{ event_type: string; interface: string; since: string }>`select event_type, interface, since from graph.subscribable_event_types order by event_type`.execute(su)).rows;
    expect(vocab).toHaveLength(12);
    expect(vocab.filter((v) => v.since === '0084')).toEqual([{ event_type: 'MaterialChangeRaised', interface: 'L10-I02', since: '0084' }, { event_type: 'ReviewConvened', interface: 'L10-I03', since: '0084' }]);
    const kindTypes = (await sql<{ event_type: string }>`select event_type from graph.subscription_consumer_events where consumer_kind = 'attention' order by event_type`.execute(su)).rows.map((r) => r.event_type);
    expect(kindTypes).toEqual(expect.arrayContaining(['MaterialChangeRaised', 'ReviewConvened']));
    // the decisions kind may NOT select the new types (the port's own vocabulary per kind)
    expect((await sql<{ n: number }>`select count(*)::int n from graph.subscription_consumer_events where consumer_kind = 'decisions' and event_type in ('MaterialChangeRaised', 'ReviewConvened')`.execute(su)).rows[0]!.n).toBe(0);
    /* THE POLICY: the two classes are real classes to the port; an unknown one is not. */
    const bad = { classes: { ...(RULES()['classes'] as Row), 'decision.bogus': (RULES()['classes'] as Row)['decision.material_change'] } };
    await refused(publish(executive, bad, 'an unknown class beside the two new ones (harness)'), /^attention policy rejected: decision\.bogus is not a signal class \(.*decision\.material_change, review\.convened\)/, 422, 'EYE-REQ-001');
    const p1 = (await publish(executive, RULES(), 'the material-change and review classes of the corridor domain (harness)')).policy;
    expect(p1).toMatchObject({ version: 1, changed_classes: ['decision.material_change', 'review.convened'] });
    /* THE REGISTER: this part's two rows only. */
    const reg = (await sql<{ interface_id: string; binding_state: string; bound_in: string; schema_version: string; bound_to: string; bound_at: Date | null }>`select interface_id, binding_state, bound_in, schema_version, bound_to, bound_at from objects.interface_register where interface_id in ('L10-I02', 'L10-I03') order by interface_id`.execute(su)).rows;
    expect(reg.map((r) => [r.interface_id, r.binding_state, r.bound_in, r.schema_version])).toEqual([['L10-I02', 'bound', '0084', 'v1'], ['L10-I03', 'bound', '0084', 'v1']]);
    expect(reg[0]!.bound_to).toMatch(/^MaterialChangeRaised@v1 published by the decisions subscriber/);
    expect(reg[1]!.bound_to).toMatch(/^ReviewConvened@v1 from POST …\/executive\/reviews\/convene/);
    for (const r of reg) expect(r.bound_at, r.interface_id).not.toBeNull();
    await settle();
    sixEvidence('E1', { fault_trace: { refused: '422 decision.bogus' }, watermark: { vocabulary: vocab.length, policy_version: p1['version'] }, consumer_behaviour: { attention_types: rows.find((r) => r.consumer_kind === 'attention')!.event_types },
      operator_action: 'the executive publishes v1 with the two classes', recovery: 'none needed', reconciliation: { register: reg.map((r) => `${r.interface_id}:${r.binding_state}@${r.bound_in}`) } });
  }, 120_000);

  it('E2 · MATERIAL CHANGE: a forecast cited by a draft and a committed package WITHDRAWN → both packages noted and MaterialChangeRaised@v1 published in each note\'s transaction (C2 / C3, confidence 1, hours to the deadline, policy v1) → decision.material_change routed to the package owner', async () => {
    S = `${w.seriesKey}-b23a`;
    await registerSeries(S);
    F = (await issueOn(S, '2023-11-24')).forecast.forecastId;
    P1 = (await draftCiting(F)).pkg;
    const d2 = await draftCiting(F);
    const prop = await c.propose(d2.pkg, d2.v);
    await c.approve(d2.pkg, d2.v, { decision: 'approve', versionDigest: prop.proposal.versionDigest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    const cm = await c.commit(d2.pkg, d2.v, prop.proposal.versionDigest, w.authority);
    P2 = { pkg: d2.pkg, v: d2.v, commitmentId: cm.commitment.commitmentId };
    await settle();
    const t0 = await mark();
    await withdrawForecast(F, 'B23 E2: the forecast is withdrawn by its owner (harness)');
    [gcWithdrawn] = await published('GraphChanged', t0, (p) => obj(p['change'])['kind'] === 'forecast.withdrawn');
    const dd = await delivered(gcWithdrawn!.id, 'decisions');
    expect(dd.items).toEqual([P1, P2.pkg].sort());
    for (const x of dd.items_applied) {
      expect(x, x.item).toMatchObject({ effect: 'input.invalidated', details: { exposure: { failureClass: 'material_change', disposition: x.item === P2.pkg ? 'compensation' : 'human_review' },
        material_change_raised: { dims: { consequence: x.item === P2.pkg ? 'C3' : 'C2', confidence: 1, basis: 'categorical_loss' }, policy_version: 1 } } });
    }
    const mcrs = await published('MaterialChangeRaised', t0, () => true, 2);
    expect(mcrs).toHaveLength(2);
    mcr1 = mcrs.find((r) => r.payload['package_id'] === P1)!; mcr2 = mcrs.find((r) => r.payload['package_id'] === P2.pkg)!;
    for (const [m, pkg, executed] of [[mcr1, P1, false], [mcr2, P2.pkg, true]] as Array<[OutboxRow, string, boolean]>) {
      const note = (await packageEvents(pkg, 'input.invalidated')).find((e) => e.details['outbox_event_id'] === gcWithdrawn!.id)!;
      expect(m.schema_version).toBe('v1');
      expect(m.payload, pkg).toMatchObject({ schema: 'MaterialChangeRaised', schema_version: 'v1', package_id: pkg, owner: w.owner.principalId, executed, failure_class: 'material_change', disposition: executed ? 'compensation' : 'human_review',
        trigger: { event_id: gcWithdrawn!.id, event_type: 'GraphChanged', change_kind: 'forecast.withdrawn', note_id: note.event_id },
        dims: { consequence: executed ? 'C3' : 'C2', confidence: 1, basis: 'categorical_loss', decision_deadline: '2024-01-19' }, policy_version: 1,
        cause: { action: 'decision.subscription.apply', actor: subs['decisions']!.principalId, target_type: 'DPK', target_id: pkg } });
      // hours to the (past) decision deadline, at publication — negative, never a guess
      expect(Number(obj(m.payload['dims'])['hours_to_window'])).toBeLessThan(0);
      // TRANSACTIONAL: the event and the note it follows were written by the same governed write (one correlation), after the upstream event
      expect(m.correlation_id, 'the event rides the note\'s own write').toBe(note.correlation_id);
      expect(m.partition_seq).toBeGreaterThan(gcWithdrawn!.partition_seq);
    }
    /* THE ROUTE: decision.material_change to the package owner under v1. */
    for (const [m, pkg, cons] of [[mcr1, P1, 'C2'], [mcr2, P2.pkg, 'C3']] as Array<[OutboxRow, string, string]>) {
      const d = await delivered(m.id, 'attention');
      expect(d.items).toEqual([`package:${pkg}`]);
      expect(d.items_applied[0]).toMatchObject({ item: `package:${pkg}`, effect: 'attention.routed', details: { signal: 'decision.material_change', outcome: 'material', state: 'open', policy_version: 1, repeated: false } });
      const [it1] = await itemsOf('decision.material_change', pkg);
      expect(it1).toMatchObject({ subject_kind: 'package', cause_event_id: m.id, cause_event_type: 'MaterialChangeRaised', outcome: 'material', state: 'open', owner_principal_id: w.owner.principalId, route_roles: ['decision_owner'], policy_version: 1 });
      expect(obj(it1!.evaluation)).toMatchObject({ outcome: 'material', dimensions: { consequence: cons, confidence: 1, executed: pkg === P2.pkg, change_kind: 'forecast.withdrawn' } });
      expect(it1!.evaluation['reasons']).toEqual([`consequence ${cons} at or above C2`, 'confidence 1 at or above 0.5']);
      expect(it1!.title).toMatch(/a cited input changed materially \(forecast\.withdrawn/);
      expect((it1!.due_at!.getTime() - it1!.created_at.getTime()) / 60_000).toBeCloseTo(240, 0);
      if (pkg === P1) item1 = it1!.item_id; else item2 = it1!.item_id;
    }
    await settle();
    sixEvidence('E2', { fault_trace: { withdrawn: F, graph_changed: gcWithdrawn!.id }, watermark: { mcr: [mcr1!.id, mcr2!.id], seqs: [gcWithdrawn!.partition_seq, mcr1!.partition_seq, mcr2!.partition_seq] },
      consumer_behaviour: { decisions: dd.items_applied.map((x) => x.effect), attention: 'attention.routed ×2' }, operator_action: 'the forecast owner withdraws the forecast',
      recovery: 'none needed', reconciliation: { items: [item1, item2], consequences: ['C2', 'C3'] } });
  }, 300_000);

  it('E3 · AT-LEAST-ONCE: the same MaterialChangeRaised redelivered (no second item), the attention subscription replayed (the route answers repeated), the upstream GraphChanged re-driven (input.already_noted — no second event)', async () => {
    await settle();
    /* REDELIVERY: the ledger's checkpoint makes the second delivery a durable no-op. */
    const re = await scheduler.enqueueSubscriptionDelivery(T(), D(), { event_id: mcr1!.id, event_type: 'MaterialChangeRaised', payload: {}, correlation_id: uuidv7(), causation_id: uuidv7(), tenant_id: T(), domain_id: D(), replay: null } as never);
    expect(re.added).toBe(true);
    const again = await delivered(mcr1!.id, 'attention', 'applied', (d) => d.deliveries >= 2);
    expect(again).toMatchObject({ state: 'applied', deliveries: 2, attempts: 1 });
    expect(await itemsOf('decision.material_change', P1)).toHaveLength(1);
    await settle();
    /* REPLAY: the item is re-applied from the replay point — the route finds the item it made (repeated), no second item. */
    const rp = await replay(subs['attention']!.subscriptionId, mcr1!.partition_seq - 1, 'B23 E3: re-drive the material changes (harness)');
    expect(rp.events).toEqual(expect.arrayContaining([mcr1!.id, mcr2!.id]));
    const rd = await delivered(mcr1!.id, 'attention', 'applied', (d) => d.replay_seq >= 1);
    expect(rd.items_applied[0]).toMatchObject({ item: `package:${P1}`, effect: 'attention.routed', details: { repeated: true, item_id: item1 } });
    await delivered(mcr2!.id, 'attention', 'applied', (d) => d.replay_seq >= 1);
    await settle();
    expect(await itemsCausedBy(mcr1!.id)).toBe(1);
    expect(await itemsCausedBy(mcr2!.id)).toBe(1);
    /* UPSTREAM: the GraphChanged re-driven to the decisions subscription — the notes stand, nothing is published twice. */
    const t0 = await mark();
    const rp2 = await replay(subs['decisions']!.subscriptionId, gcWithdrawn!.partition_seq - 1, 'B23 E3: re-drive the withdrawal to the decisions subscriber (harness)');
    expect(rp2.events).toContain(gcWithdrawn!.id);
    const dd = await delivered(gcWithdrawn!.id, 'decisions', 'applied', (d) => d.replay_seq >= 1);
    expect(dd.items_applied.map((x) => x.effect)).toEqual(['input.already_noted', 'input.already_noted']);
    await settle();
    expect(await outboxRows('MaterialChangeRaised', t0), 'no second MaterialChangeRaised for a cause already noted').toEqual([]);
    for (const p of [P1, P2.pkg]) expect((await packageEvents(p, 'input.invalidated')).filter((e) => e.details['outbox_event_id'] === gcWithdrawn!.id), p).toHaveLength(1);
    sixEvidence('E3', { fault_trace: { redelivered: mcr1!.id, replayed: rp.events.length, upstream_replayed: gcWithdrawn!.id }, watermark: { deliveries: again.deliveries, replay_seq: rd.replay_seq },
      consumer_behaviour: { redelivery: 'applied no-op', replay: 'repeated', upstream: dd.items_applied.map((x) => x.effect) }, operator_action: 'the domain administrator replays both subscriptions',
      recovery: 'the checkpoint and the (class, subject, cause) key absorb every re-delivery', reconciliation: { items_per_cause: 1, mcr_after_replay: 0 } });
  }, 240_000);

  it('E4 · QUARANTINE: PLANTED MaterialChangeRaised and ReviewConvened rows whose payloads are not the contract → unresolved invalid_event / human_review (event.quarantined); nothing routed; the rows stay published', async () => {
    await settle();
    const good = mcr1!.payload;
    const bad1 = await plantOutbox('MaterialChangeRaised', { ...good, schema: 'SomethingElse' });
    const bad2 = await plantOutbox('MaterialChangeRaised', { ...good, dims: { consequence: 'C2', confidence: 7 } });
    const bad3 = await plantOutbox('ReviewConvened', { schema: 'ReviewConvened', schema_version: 'v1', review_id: uuidv7(), subject: { kind: 'decision', id: P2.pkg }, question: 'no chair named (harness)' });
    const reasons: string[] = [];
    for (const id of [bad1, bad2, bad3]) {
      const d = await delivered(id, 'attention', 'unresolved');
      expect(d, id).toMatchObject({ state: 'unresolved', failure_class: 'invalid_event', disposition: 'human_review', items: [`event:${id}`], items_applied: [] });
      expect(d.items_unresolved[0]).toMatchObject({ item: `event:${id}`, effect: 'event.quarantined' });
      expect(d.items_unresolved[0]!.reason).toMatch(/^invalid event: (MaterialChangeRaised|ReviewConvened) .* is not the contract \(.*\); quarantined for a person$/);
      expect(await itemsCausedBy(id), 'nothing routed').toBe(0);
      reasons.push(d.items_unresolved[0]!.reason);
    }
    expect(reasons[0]).toContain('not a MaterialChangeRaised@v1 payload');
    expect(reasons[1]).toContain('dims.confidence is not a number in [0, 1]');
    expect(reasons[2]).toContain('chair is not a principal id');
    expect((await sql<{ status: string }>`select status from objects.object_outbox where id = any(${[bad1, bad2, bad3]}::uuid[])`.execute(su)).rows.map((r) => r.status)).toEqual(['published', 'published', 'published']);
    await settle();
    sixEvidence('E4', { fault_trace: { planted: [bad1, bad2, bad3] }, watermark: 'unresolved (invalid_event → human_review)', consumer_behaviour: reasons, operator_action: 'none: a person reviews the quarantined events',
      recovery: 'the rows stay published; a corrected event would be a new row', reconciliation: { routed: 0 } });
  }, 180_000);

  it('E5 · CONVENE: the executive convenes a review of the committed decision (chair, reviewers, due in 48 h, from its material-change item) → ReviewConvened@v1 from the write, review.convened routed to the chair; the same key and content → repeated, no second event; objective, scenario, commitment and a PLANTED outcome convened too', async () => {
    await settle();
    const due = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const payload = { subject: { kind: 'decision', id: P2.pkg }, question: 'Does the committed reroute still stand without its forecast?', chair: strategyOwner.principalId, reviewers: [w.approver.principalId, w.authority.principalId],
      due_at: due, convene_key: 'b23a-' + 'e5-decision', cause_item_id: item2 };
    const t0 = await mark();
    const r = (await convene(executive, payload)).review;
    R1 = r.review_id;
    expect(r).toMatchObject({ repeated: false, state: 'convened', subject_kind: 'decision', subject_id: P2.pkg, subject_version: P2.v, chair: strategyOwner.principalId, convened_by: executive.principalId, cause_item_id: item2, convene_key: 'b23a-' + 'e5-decision' });
    expect(r['reviewers']).toEqual([w.approver.principalId, w.authority.principalId].sort());
    expect(String(r['subject_title'])).toMatch(/Reroute SYN-SHIP-4472/);
    expect(await reviewRow(R1)).toMatchObject({ state: 'convened', subject_version: P2.v, chair: strategyOwner.principalId });
    [rc1] = await published('ReviewConvened', t0, (p) => p['review_id'] === R1);
    expect(rc1!.payload).toMatchObject({ schema: 'ReviewConvened', schema_version: 'v1', review_id: R1, subject: { kind: 'decision', id: P2.pkg, version: P2.v }, chair: strategyOwner.principalId,
      convened_by: executive.principalId, cause_item_id: item2, request_digest: r['request_digest'], cause: { action: 'executive.review.convene', actor: executive.principalId, target_type: 'RVW', target_id: R1 } });
    const d = await delivered(rc1!.id, 'attention');
    expect(d.items).toEqual([`review:${R1}`]);
    const [ri] = await itemsOf('review.convened', R1);
    reviewItem = ri!.item_id;
    expect(ri).toMatchObject({ subject_kind: 'review', cause_event_type: 'ReviewConvened', outcome: 'material', state: 'open', owner_principal_id: strategyOwner.principalId, route_roles: ['strategy_owner'], policy_version: 1 });
    expect(Number(obj(obj(ri!.evaluation)['dimensions'])['hours_to_window'])).toBeGreaterThan(46);
    expect(Number(obj(obj(ri!.evaluation)['dimensions'])['hours_to_window'])).toBeLessThanOrEqual(48);
    expect((ri!.evaluation['reasons'] as string[]).at(-1)).toMatch(/hours to the response window, within 720$/);
    /* IDEMPOTENT: the same key and content → the recorded review, repeated; no second review, no second event. */
    await settle();
    const t1 = await mark();
    const again = (await convene(executive, payload)).review;
    expect(again).toMatchObject({ review_id: R1, repeated: true, state: 'convened' });
    await sleep(1500);
    expect(await outboxRows('ReviewConvened', t1), 'a repeat publishes nothing').toEqual([]);
    expect((await reviewEvents(R1)).map((e) => e.event)).toEqual(['review.convened', 'review.repeated']);
    /* THE OTHER FOUR SUBJECT KINDS. An outcome is PLANTED (stated: recording one needs a twin reconciliation this world does not run; the port reads decision.outcomes). */
    const outcomeId = uuidv7();
    await sql`insert into decision.outcomes (outcome_id, scope, tenant_id, domain_id, package_id, version, criterion_key, criterion, observed_value, unit, target, comparator, met, observed_on, simulated, reconciliation_id, header_digest, recorded_by, recorded_at, correlation_id)
      values (${outcomeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${P2.pkg}::uuid, ${P2.v}, 'line_stop_days', '{"quantity":"line stop days"}'::jsonb, '3'::jsonb, 'days', 0, '<=', false, '{"twin":"fixture"}'::jsonb, null, null, ${'b'.repeat(64)}, ${w.owner.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid)`.execute(su);
    const kinds: Array<[string, string, AuthenticatedPrincipal]> = [['objective', w.objectiveId, strategyOwner], ['scenario', w.scenarioId, executive], ['commitment', P2.commitmentId, w.owner], ['outcome', outcomeId, w.owner]];
    const others: Row[] = [];
    for (const [kind, id, as] of kinds) {
      const x = (await convene(as, { subject: { kind, id }, question: `What does the ${kind} review conclude? (harness)`, chair: as.principalId, convene_key: `b23a-e5-${kind}` })).review;
      expect(x, kind).toMatchObject({ repeated: false, state: 'convened', subject_kind: kind, subject_id: id, chair: as.principalId, convened_by: as.principalId, due_at: null });
      expect(x['subject_version'], kind).not.toBeNull();
      others.push(x);
    }
    RObj = String(others[0]!['review_id']);
    expect(others.find((x) => x['subject_kind'] === 'commitment')!['subject_version']).toBe(P2.v);
    await published('ReviewConvened', t1, (p) => others.some((x) => x['review_id'] === p['review_id']), 4);
    await settle();
    // the list and the get (the reviews and the queue's answer beside the record)
    const listed = (await listReviews(analyst, { subjectKind: 'decision' })).reviews;
    expect(listed.map((x) => x['review_id'])).toContain(R1);
    const got = (await getReview(analyst, R1)).review;
    expect(got.events.map((e) => e['event'])).toEqual(['review.convened', 'review.repeated']);
    expect(got.attention).toEqual([expect.objectContaining({ item_id: reviewItem, signal_class: 'review.convened', state: 'open' })]);
    sixEvidence('E5', { fault_trace: { review: R1, event: rc1!.id }, watermark: { subject_version: P2.v, due }, consumer_behaviour: { item: reviewItem, others: others.map((x) => `${String(x['subject_kind'])}:${String(x['review_id'])}`) },
      operator_action: 'the executive convenes; the strategy owner, the executive and the owner convene the other four', recovery: 'the repeat answers the recorded review', reconciliation: { repeated_events: 0 } });
  }, 240_000);

  it('E6 · CONVENE refusals: the PDP (an analyst, a forecast owner: 403), the port (a different review under the key 409, a stale version 409, an unknown subject 404, an agent as chair 422, a past due instant 422), the intake (a kind that is not reviewable 422)', async () => {
    const base = { subject: { kind: 'decision', id: P2.pkg }, question: 'Refusals of the convening (harness)', chair: strategyOwner.principalId, convene_key: 'b23a-e6' };
    await refused(convene(analyst, base), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(convene(forecastOwner, base), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(convene(executive, { ...base, convene_key: 'b23a-' + 'e5-decision' }), /^review convening rejected: convene key b23a-e5-decision was already used by this convener for a different review/, 409, 'EYE-STA-002');
    await refused(convene(executive, { ...base, subject: { kind: 'decision', id: P2.pkg, version: P2.v + 5 } }), /^review convening rejected \(stale_version\): decision .* stands at version \d+, the review names version \d+/, 409, 'EYE-STA-002');
    await refused(convene(executive, { ...base, subject: { kind: 'scenario', id: uuidv7() } }), /^review convening rejected: no such scenario .* in this domain/, 404, 'EYE-STA-001');
    await refused(convene(executive, { ...base, subject: { kind: 'outcome', id: uuidv7() } }), /^review convening rejected: no such outcome .* in this domain/, 404, 'EYE-STA-001');
    await refused(convene(executive, { ...base, cause_item_id: uuidv7() }), /^review convening rejected: no such attention item .* in this domain/, 404, 'EYE-STA-001');
    await refused(convene(executive, { ...base, chair: w.machinePrincipalId }), /^review convening rejected: the chair .* is not an active human of this tenant/, 422, 'EYE-REQ-001');
    await refused(convene(executive, { ...base, reviewers: [w.machinePrincipalId] }), /^review convening rejected: reviewer .* is not an active human of this tenant/, 422, 'EYE-REQ-001');
    await refused(convene(executive, { ...base, due_at: new Date(Date.now() - 3_600_000).toISOString() }), /^review convening rejected: the review is due after now and within a year/, 422, 'EYE-REQ-001');
    await refused(convene(executive, { ...base, subject: { kind: 'forecast', id: F } }), /subject\.kind is one of objective, decision, scenario, commitment, outcome/, 422, 'EYE-REQ-001');
    expect((await sql<{ n: number }>`select count(*)::int n from executive.reviews where convene_key = 'b23a-e6'`.execute(su)).rows[0]!.n, 'no refused review was written').toBe(0);
    sixEvidence('E6', { fault_trace: { refused: ['403 analyst', '403 forecast_owner', '409 key reuse', '409 stale_version', '404 scenario', '404 outcome', '404 cause item', '422 agent chair', '422 agent reviewer', '422 past due', '422 kind'] },
      watermark: { reviews_written: 0 }, consumer_behaviour: 'none: nothing was convened', operator_action: 'the refused conveners', recovery: 'a corrected request with a new key', reconciliation: { key_reuse: 'refused, the recorded review unchanged' } });
  }, 120_000);

  it('E7 · CLOSE + NO LONGER STANDS: a non-chair\'s conclusion refused (403), the convener withdraws, the chair concludes (twice 409, a short note 422, unknown 404); the draft package withdrawn; a replay → signal.no_longer_stands for the withdrawn package\'s material change and the concluded review', async () => {
    await refused(conclude(executive, R1, 'the executive is not the chair (harness)'), /^review closure rejected: a review is concluded by its chair/, 403, 'EYE-AUT-001');
    await refused(withdrawReview(analyst, R1, 'the analyst convened nothing (harness)'), /^review closure rejected: a review is withdrawn by its convener/, 403, 'EYE-AUT-001');
    await refused(conclude(strategyOwner, R1, 'short'), /^review closure rejected: a closure carries a note of at least 8 characters/, 422, 'EYE-REQ-001');
    await refused(conclude(strategyOwner, uuidv7(), 'no such review exists (harness)'), /^review closure rejected: no such review .* in this domain/, 404, 'EYE-STA-001');
    const wd = (await withdrawReview(strategyOwner, RObj, 'the objective is reviewed in its own cadence (harness)')).review;
    expect(wd).toMatchObject({ review_id: RObj, state: 'withdrawn', closed_by: strategyOwner.principalId });
    const cc = (await conclude(strategyOwner, R1, 'the reroute stands on the remaining inputs; no reopen (harness)')).review;
    expect(cc).toMatchObject({ review_id: R1, state: 'concluded', closed_by: strategyOwner.principalId, closing_note: 'the reroute stands on the remaining inputs; no reopen (harness)' });
    await refused(conclude(strategyOwner, R1, 'concluded a second time (harness)'), /^review closure rejected: review .* is concluded; only a convened review is concluded or withdrawn/, 409, 'EYE-STA-002');
    expect((await reviewEvents(R1)).map((e) => e.event)).toEqual(['review.convened', 'review.repeated', 'review.concluded']);
    // a review is immutable but for its closure (55000)
    expect(await sqlstate(sql`update executive.reviews set question = 'rewritten by the superuser (harness)' where review_id = ${R1}::uuid`.execute(su))).toBe('55000');
    expect(await sqlstate(sql`delete from executive.reviews where review_id = ${R1}::uuid`.execute(su))).toBe('55000');
    /* NO LONGER STANDS: the draft package withdrawn; the attention subscription replayed from the first material change. */
    await c.withdraw(P1, 'B23 E7: the draft is withdrawn after its forecast (harness)');
    await settle();
    const rp = await replay(subs['attention']!.subscriptionId, mcr1!.partition_seq - 1, 'B23 E7: re-drive after the closures (harness)');
    expect(rp.events).toEqual(expect.arrayContaining([mcr1!.id, rc1!.id]));
    const d1 = await delivered(mcr1!.id, 'attention', 'applied', (d) => d.replay_seq >= 2);
    expect(d1.items_applied[0]).toMatchObject({ item: `package:${P1}`, effect: 'signal.no_longer_stands', details: { package_id: P1, state: 'withdrawn' } });
    const d2 = await delivered(rc1!.id, 'attention', 'applied', (d) => d.replay_seq >= 2);
    expect(d2.items_applied[0]).toMatchObject({ item: `review:${R1}`, effect: 'signal.no_longer_stands', details: { review_id: R1, state: 'concluded' } });
    await settle();
    expect(await itemsCausedBy(mcr1!.id)).toBe(1);
    expect(await itemsCausedBy(rc1!.id)).toBe(1);
    sixEvidence('E7', { fault_trace: { refused: ['403 non-chair', '403 non-convener', '422 note', '404 review', '409 twice'], package_withdrawn: P1 }, watermark: { concluded: R1, withdrawn: RObj },
      consumer_behaviour: { replay: [d1.items_applied[0]!.effect, d2.items_applied[0]!.effect] }, operator_action: 'the chair concludes, the convener withdraws, the owner withdraws the draft',
      recovery: 'a late or replayed signal is recorded, never routed', reconciliation: { items_per_cause: 1 } });
  }, 240_000);

  it('E8 · RECONCILE: the worker stopped, a review convened (its ReviewConvened row PUBLISHED), the queue LOST before any delivery → no delivery row; the reconciliation re-drives the committed publication → applied once, one item', async () => {
    await settle();
    dispatcher.pauseRenewalsForTests(true);
    try {
      expect(await scheduler.stopSubscriptionWorker(T(), D())).toBe(true);
      const t0 = await mark();
      const r = (await convene(executive, { subject: { kind: 'scenario', id: w.scenarioId }, question: 'Does the corridor scenario still hold its branches? (harness)', chair: strategyOwner.principalId,
        due_at: new Date(Date.now() + 72 * 3_600_000).toISOString(), convene_key: 'b23a-e8' })).review;
      const [row] = await published('ReviewConvened', t0, (p) => p['review_id'] === r.review_id);
      expect(await scheduler.subscriptionJobStateForTests(T(), D(), row!.id), 'the publisher routed it to the domain\'s queue').not.toBeNull();
      // THE LOSS (stated): Redis loses the job after the outbox row was acknowledged published.
      await scheduler.obliterateSubscriptionsForTests(T(), D());
      expect(await scheduler.subscriptionJobStateForTests(T(), D(), row!.id)).toBeNull();
      await sleep(1000);
      expect(await deliveriesFor(row!.id), 'nothing was delivered').toEqual([]);
      expect((await sql<{ status: string }>`select status from objects.object_outbox where id = ${row!.id}::uuid`.execute(su)).rows[0]!.status, 'the committed publication').toBe('published');
      const report = await dispatcher.reconcile('B23 E8: reconcile the committed publication (harness)', false);
      expect(report.reDriven.find((e) => e.eventId === row!.id), JSON.stringify(report.reDriven)).toBeDefined();
      const d = await delivered(row!.id, 'attention');
      expect(d).toMatchObject({ deliveries: 1, attempts: 1, items: [`review:${r.review_id}`] });
      await settle();
      const items = await itemsOf('review.convened', r.review_id);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ cause_event_id: row!.id, owner_principal_id: strategyOwner.principalId, state: 'open' });
      sixEvidence('E8', { fault_trace: { lost_job: row!.id, worker: 'stopped', queue: 'obliterated' }, watermark: { outbox: 'published', deliveries_before: 0 }, consumer_behaviour: { after: d.state, items: 1 },
        operator_action: 'none: the dispatcher reconciles', recovery: 'the reconciliation re-drove the published row (no delivery row)', reconciliation: { re_driven: report.reDriven.length } });
    } finally {
      dispatcher.pauseRenewalsForTests(false);
    }
  }, 180_000);

  it('E9 · BRF@v2: the attention section as of known_at (routed items with bands, every state counted, the material changes since the prior), in the digest; deterministic; an acknowledgement after the edition leaves it as it was; a later edition carries only what is new; a v1 edition read as v1', async () => {
    await settle();
    const k1 = new Date().toISOString();
    const b1 = (await c.compose({ roomId: null, knownAt: k1, priorBriefingId: null })).briefing as unknown as Row & { briefingId: string; contentDigest: string; attention: Row; schemaVersion: string };
    expect(b1.schemaVersion).toBe('v2');
    const a1 = b1.attention as { as_of: string; since: string | null; policy_version: number | null; items: Row[]; counts: Record<string, number>; material_changes_since_prior: Row[] };
    expect(a1).toMatchObject({ as_of: k1, since: null, policy_version: 1 });
    const live = a1.items.map((x) => x['item_id']);
    expect(live).toEqual(expect.arrayContaining([item1, item2, reviewItem]));
    const i2 = a1.items.find((x) => x['item_id'] === item2)!;
    expect(i2).toMatchObject({ signal_class: 'decision.material_change', subject_kind: 'package', subject_id: P2.pkg, state: 'open', policy_version: 1, consequence: 'C3', confidence: 1, confidence_band: 'high', owner: w.owner.principalId });
    expect(a1.material_changes_since_prior.map((x) => x['item_id']).sort()).toEqual([item1, item2].sort());
    const total = (await sql<{ n: number }>`select count(*)::int n from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at <= ${k1}::timestamptz`.execute(su)).rows[0]!.n;
    expect(Object.values(a1.counts).reduce((s, n) => s + n, 0), 'every item counted, whatever its state').toBe(total);
    /* THE RECORD: v2 on the row, BRF@v2 on the header, the stored payload valid against BRF@v2 — and not against BRF@v1. */
    const row = (await sql<{ schema_version: string; attention: Row }>`select schema_version, attention from executive.briefings where briefing_id = ${b1.briefingId}::uuid`.execute(su)).rows[0]!;
    expect(row.schema_version).toBe('v2');
    expect(row.attention).toEqual(JSON.parse(JSON.stringify(a1)));
    const canon = (await sql<{ schema_ref: string; payload: Row }>`select schema_ref, payload from objects.canonical_objects where object_id = ${b1.briefingId}::uuid`.execute(su)).rows[0]!;
    expect(canon.schema_ref).toBe('BRF@v2');
    const schemas = Object.fromEntries((await sql<{ schema_version: string; json_schema: object }>`select schema_version, json_schema from objects.schema_registry where object_type = 'BRF'`.execute(su)).rows.map((r) => [r.schema_version, r.json_schema]));
    const ajv = new Ajv2020({ strict: false });
    const v2 = ajv.compile(schemas['v2']!); const v1 = ajv.compile(schemas['v1']!);
    expect(v2(canon.payload), JSON.stringify(v2.errors)).toBe(true);
    expect(v1(canon.payload), 'BRF@v1 forbids the section (additionalProperties false)').toBe(false);
    /* DETERMINISTIC: the same known_at and the same (no) prior → the same digest. */
    const b1b = (await c.compose({ roomId: null, knownAt: k1, priorBriefingId: null })).briefing;
    expect(b1b.contentDigest).toBe(b1.contentDigest);
    /* AS OF known_at: the item acknowledged AFTER the edition — the edition keeps what it knew; a recomposition at k1 too. */
    await acknowledge(w.owner, item2, 'seen: the committed reroute is under review (harness)');
    const got1 = (await c.getBriefing(b1.briefingId)).briefing;
    expect(got1['schema_version']).toBe('v2');
    expect((obj(got1['attention'])['items'] as Row[]).find((x) => x['item_id'] === item2)!['state']).toBe('open');
    const b1c = (await c.compose({ roomId: null, knownAt: k1, priorBriefingId: null })).briefing;
    expect(b1c.contentDigest, 'a later acknowledgement never rewrites an earlier known_at').toBe(b1.contentDigest);
    /* A LATER EDITION (prior b1): a new material change after b1 → the section's changes are that one alone; item2 acknowledged. */
    const F2 = (await issueOn(S, '2023-11-25')).forecast.forecastId;
    const P3 = (await draftCiting(F2)).pkg;
    await settle();
    const t0 = await mark();
    await withdrawForecast(F2, 'B23 E9: a second forecast withdrawn after the first edition (harness)');
    const [mcr3] = await published('MaterialChangeRaised', t0, (p) => p['package_id'] === P3);
    await delivered(mcr3!.id, 'attention');
    await settle();
    const [item3] = await itemsOf('decision.material_change', P3);
    const b2 = (await c.compose({ roomId: null, knownAt: new Date().toISOString(), priorBriefingId: b1.briefingId })).briefing as unknown as Row & { attention: Row; contentDigest: string };
    const a2 = b2.attention as { since: string | null; items: Row[]; material_changes_since_prior: Row[] };
    expect(a2.since).toBe(k1);
    expect(a2.material_changes_since_prior.map((x) => x['item_id'])).toEqual([item3!.item_id]);
    expect(a2.items.find((x) => x['item_id'] === item2)!['state']).toBe('acknowledged');
    expect(b2.contentDigest).not.toBe(b1.contentDigest);
    /* A v1 EDITION (PLANTED — stated: every edition composed before 0084 is v1; a fresh database has none): read as v1, no section, by the same reader. */
    const v1Id = uuidv7();
    await sql`insert into executive.briefings (briefing_id, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, prior_briefing_id, watermark, sources, items, windows, source_states, degraded, narrative, narrative_cites, content_digest, header_digest, controls, correlation_id, memory_accesses)
      select ${v1Id}::uuid, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, null, watermark || jsonb_build_object('prior_briefing_id', null), sources, items, windows, source_states, degraded, narrative, narrative_cites, content_digest, header_digest, controls, correlation_id, memory_accesses
        from executive.briefings where briefing_id = ${b1.briefingId}::uuid`.execute(su);
    const gv1 = (await c.getBriefing(v1Id, tenantAdmin)).briefing;
    expect(gv1).toMatchObject({ briefing_id: v1Id, schema_version: 'v1', attention: null });
    const listed = (await c.listBriefings(null, tenantAdmin)).briefings;
    expect(listed.find((x) => x['briefing_id'] === v1Id)!['schema_version']).toBe('v1');
    expect(listed.find((x) => x['briefing_id'] === b1.briefingId)!['schema_version']).toBe('v2');
    /* THE CHECK binds the version to the section (23514), both ways. */
    expect(await sqlstate(sql`insert into executive.briefings (briefing_id, scope, tenant_id, domain_id, composed_by, composed_via, known_at, watermark, sources, items, windows, content_digest, header_digest, correlation_id, schema_version)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${executive.principalId}::uuid, 'human', clock_timestamp(), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${'c'.repeat(64)}, ${'c'.repeat(64)}, ${uuidv7()}::uuid, 'v2')`.execute(su))).toBe('23514');
    expect(await sqlstate(sql`insert into executive.briefings (briefing_id, scope, tenant_id, domain_id, composed_by, composed_via, known_at, watermark, sources, items, windows, content_digest, header_digest, correlation_id, attention)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${executive.principalId}::uuid, 'human', clock_timestamp(), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${'c'.repeat(64)}, ${'c'.repeat(64)}, ${uuidv7()}::uuid, '{}'::jsonb)`.execute(su))).toBe('23514');
    await settle();
    sixEvidence('E9', { fault_trace: { acknowledged_after: item2, new_change: item3!.item_id }, watermark: { k1, b1: b1.briefingId, b2_since: a2.since, digest_stable: true },
      consumer_behaviour: { b1_items: live.length, b1_changes: a1.material_changes_since_prior.length, b2_changes: a2.material_changes_since_prior.length }, operator_action: 'the executive composes; the owner acknowledges',
      recovery: 'none needed', reconciliation: { schema: 'BRF@v2 valid, BRF@v1 invalid', v1_edition: 'schema_version v1, attention null' } });
  }, 300_000);
});
