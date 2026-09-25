/**
 * CP-6 B24 (migration 0086 §P, part `plan`) — THE SELECTED TRANSFORMATION PLAN EXECUTES (V03-T-291, AU-INT-0016; the B22 deferral "the
 * extraction run on ObservationRecorded"): the observations subscriber queues ONE pending execution per selected method and evidence version
 * in the delivery's own transaction; the EXTRACTION PLAN WORKER runs it under the domain's EXTRACTION AGENT's own session (never the
 * subscriber's) through the Phase 2 orchestrator with newAttempt = false, and records the outcome on the execution row — on a real database
 * with real Redis, the real outbox publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED at module top, the B6 rule), the
 * observations consumer registered in the harness's own domain, B24's own humans with sessions of their own.
 *
 *   X5 · NO_PLAN: an upload on a source no method reads → no_plan with its reason, nothing queued (the delivery names no execution).
 *   X3 · NO AGENT: an upload on the method's source → selected → ONE pending execution, VISIBLE in the status read with the reason it
 *   waits; the registration's refusals (403 the policy — a domain analyst, an extraction manager asking for a principal to be created;
 *   422 a human principal, budgets out of range, no owner); then the extraction manager registers the agent principal an administrator
 *   provisioned (PLANTED by the superuser, the harness's agent idiom — stated) → the drain runs at once → done, the run the agent's.
 *   X1 · THE PLAN EXECUTES: an upload → ObservationRecorded → selected → pending → the worker (the promote hook) runs it under the agent →
 *   done with the run id, the admitted claim resting on exactly that evidence; a second active agent refused (409).
 *   X2 · IDEMPOTENT: a REPLAY of the subscription → the selection repeated, no second execution, no second run; a SECOND producer's
 *   ObservationRecorded for the same evidence version (PLANTED — stated) → a new selection, the execution found, not queued; an outcome
 *   LOST between the run and its record (the superuser puts the row back to pending — stated) → the re-run is free: 0023's extraction
 *   identity answers, no model call, no claim twice.
 *   X4 · REVOKED: the agent revoked (404 twice, 422 without a reason) → its next drain is REFUSED by the session port and the refusal
 *   RECORDED on the execution, the drain removed; the revoked principal is not registered again (409); a tenant administrator registers
 *   a new agent (its principal created on the identity authority) → the refused execution re-queued and done.
 *   X6 · AUTHORITY: each new port refused without its capability and unreachable by the other authority; a drifted digest opens no session.
 *
 * EACH CASE LOGS ONE `B24 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { jcsCanonicalize } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { requestDigestOf } from '../../src/intelligence/gateway/model-gateway.service.js';
import { ExtractionPlanWorkerService } from '../../src/intelligence/plan/extraction-plan-worker.service.js';
import { PLAN_EXECUTOR } from '../../src/intelligence/plan/plan-executor.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker, the plan worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// C5 / Nit 8: this file's own vault roots.
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b24-plan-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number };
type OutboxRow = { id: string; status: string; event_type: string; payload: Row; partition_seq: number };
type Delivery = { event_id: string; consumer_kind: string; state: string; replay_seq: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }> };
type Execution = { execution_id: string; selection_id: string; method_id: string; method_version: number; evd_object_id: string; evd_version: number; state: string; run_id: string | null; agent_id: string | null;
  principal_id: string | null; attempts: number; last_error: string | null; outcome: Row; finished_at: Date | null };

const PLAN_LABEL = 'b24plan'; const OTHER_LABEL = 'b24other';
const METHOD = { key: 'b24-plan-' + 'extraction', modelId: 'b24-plan-model', promptText: 'Return {"claims":[...]} or {"abstain":true,"reason":"..."} and nothing else.', decoding: { temperature: 0, seed: 24 }, runtimeVersion: 'ollama/0.33.2' };

let h: Phase4Harness; let su: AnyDb; let graph: GraphController; let intelligence: IntelligenceController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let vault: VaultService; let worker: ExtractionPlanWorkerService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let extractionManager: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let subscription = { subscriptionId: '', principalId: '' };
let planSource = ''; let methodId = '';
/** What the cases leave one another (each named where it is made). */
let agentPrincipalA = ''; let agentA = ''; let E1: Evd; let E2: Evd; let E2event: OutboxRow; let E2claims: string[] = [];
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** A marker on the DATABASE clock (the B20 harness :156). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; drains: ${JSON.stringify(worker.recentDrains(T(), D()).slice(0, 3))}; worker failure: ${JSON.stringify(worker.lastFailureSeen())}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
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
/** The domain's plan drain has nothing in flight (none active or waiting; the repeatable's next job may be delayed). */
const drainsIdle = async (ms = 60_000): Promise<void> => {
  await waitFor('the plan drains idle', () => worker.queueCountsForTests(T(), D()), (c) => (c['active'] ?? 0) === 0 && (c['waiting'] ?? 0) === 0, ms);
};
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (asObservationRefusal — the B18/B20 idiom). */
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
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B24 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the outbox and the deliveries ───────────── */
const outboxRows = async (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, event_type, payload, partition_seq::int from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
const outboxEvent = (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow> =>
  waitFor(`the ${eventType} row published`, () => outboxRows(eventType, after, where), (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, consumer_kind, state, replay_seq, items, items_applied from graph.subscription_deliveries where event_id = ${eventId}::uuid order by replay_seq`.execute(su)).rows;
const observed = async (eventId: string, minReplay = 0): Promise<Delivery> => {
  const ds = await waitFor(`the observations delivery of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.some((d) => d.consumer_kind === 'observations' && d.state === 'applied' && d.replay_seq >= minReplay), 120_000);
  return ds.filter((d) => d.consumer_kind === 'observations' && d.state === 'applied' && d.replay_seq >= minReplay).at(-1)!;
};
/** A row PLANTED in the tenant's outbox partition the way 0064 places every row (the B22 harness idiom) — PENDING, so the real publisher routes it. */
async function plantOutbox(eventType: string, payload: Row): Promise<string> {
  const id = uuidv7(); const key = `tenant:${T()}`;
  await sql`with pk as (insert into objects.outbox_partitions (partition_key) values (${key}) on conflict (partition_key) do nothing),
                 seq as (update objects.outbox_partitions set next_seq = next_seq + 1 where partition_key = ${key} returning next_seq - 1 as n)
    insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, partition_key, partition_seq, schema_version)
    select ${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${key}, seq.n, 'v1' from seq`.execute(su);
  return id;
}

/* ───────────── the rows ───────────── */
const executionsOf = async (evdId: string): Promise<Execution[]> => (await sql<Execution>`select execution_id::text, selection_id::text, method_id::text, method_version, evd_object_id::text, evd_version, state, run_id::text, agent_id::text,
  principal_id::text, attempts, last_error, outcome, finished_at from intelligence.plan_executions where evd_object_id = ${evdId}::uuid order by queued_at`.execute(su)).rows;
const executionEvents = async (executionId: string) => (await sql<{ event: string; details: Row }>`select event, details from intelligence.plan_execution_events where execution_id = ${executionId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const selectionsOf = async (evdId: string) => (await sql<{ selection_id: string; outcome: string; reason: string; outbox_event_id: string }>`select selection_id::text, outcome, reason, outbox_event_id::text from intelligence.plan_selections where evd_object_id = ${evdId}::uuid order by selected_at`.execute(su)).rows;
const runsOfMethod = async () => (await sql<{ run_id: string; agent_principal_id: string; state: string; evidence_read: number; claims_admitted: number; idempotent_hits: number; calls_used: number }>`
  select run_id::text, agent_principal_id::text, state, evidence_read, claims_admitted, idempotent_hits, calls_used from intelligence.runs_current where method_id = ${methodId}::uuid order by started_at`.execute(su)).rows;
const claimsOn = async (evdId: string) => (await sql<{ claim_object_id: string; run_id: string }>`select claim_object_id::text, run_id::text from intelligence.claim_lineage where evidence_object_id = ${evdId}::uuid and method_id = ${methodId}::uuid order by claim_object_id`.execute(su)).rows;
const attemptsOn = async (evdId: string) => Number((await sql<{ n: number }>`select count(*)::int n from intelligence.extraction_attempts where evidence_object_id = ${evdId}::uuid and method_id = ${methodId}::uuid`.execute(su)).rows[0]!.n);
const gatewayCallsOfMethod = async () => Number((await sql<{ n: number }>`select count(*)::int n from intelligence.gateway_calls where method_id = ${methodId}::uuid`.execute(su)).rows[0]!.n);
const waitExecution = (evdId: string, state: string, ms = 90_000): Promise<Execution> =>
  waitFor(`the execution of ${evdId} ${state}`, () => executionsOf(evdId), (rows) => rows.length === 1 && rows[0]!.state === state, ms).then((rows) => rows[0]!);

/* ───────────── the routes ───────────── */
const register = (as: AuthenticatedPrincipal, payload: Row) => intelligence.registerExtractionAgent(h.req(as, 'intelligence.extraction.agent.register', 'AGT', null, 'intelligence'), T(), D(), { payload: payload as never }) as unknown as
  Promise<{ agent: { agentId: string; principalId: string; role: string; executor: Row; budgets: Row; owner: string; escalation: string; requeued: number; pending: number; principalCreated: boolean }; served: { drainScheduled: boolean; everySeconds: number; workerRunning: boolean }; receipt: Row }>;
const revoke = (as: AuthenticatedPrincipal, agentId: string, reason?: string) => intelligence.revokeExtractionAgent(h.req(as, 'intelligence.extraction.agent.revoke', 'AGT', agentId, 'intelligence'), T(), D(), agentId,
  { payload: reason === undefined ? {} : { reason } }) as unknown as Promise<{ agent: { agentId: string; status: string; pending: number } }>;
const status = (payload: Row = {}, as = extractionManager) => intelligence.planStatus(h.req(as, 'intelligence.read', 'PLX', null, 'intelligence'), T(), D(), { payload: payload as never }) as unknown as
  Promise<{ executor: Row; agent: Row | null; agents: Row[]; executions: Row[]; counts: Record<string, number>; note: string | null; runtime: Row; receipt: Row }>;
/** One upload on a source; the evidence it admitted. */
const uploadOn = async (label: string, filename: string, text: string): Promise<Evd> => {
  const [u] = await h.upload([{ filename, text, documentTime: '2024-01-15T00:00:00Z' }], 'internal', label);
  return { id: u!.id, version: u!.version };
};
/** The recorded model response for exactly the request the orchestrator will make for this evidence (the B9 harness :750 idiom). */
const recordFor = async (evd: Evd, claims: Row[]): Promise<void> => {
  const row = (await sql<{ payload: Row }>`select payload from objects.canonical_objects where object_id = ${evd.id}::uuid order by object_version desc limit 1`.execute(su)).rows[0]!;
  const locator = String(row.payload['locator']); const digest = String(row.payload['content_digest']);
  const bytes = await vault.read('evidence', { tenantId: T(), domainId: D() }, locator, digest);
  const req = { promptRef: `extract/${METHOD.key}`, promptVersion: 'v1', promptText: METHOD.promptText, promptDigest: sha256(METHOD.promptText), modelId: METHOD.modelId, weightsDigest: sha256(`${METHOD.key}-weights`), runtimeVersion: METHOD.runtimeVersion,
    decodingDigest: sha256(jcsCanonicalize(METHOD.decoding)), decodingOptions: METHOD.decoding,
    input: { instruction: `extract/${METHOD.key}`, target_types: ['CLM'], source_key: METHOD.key, item_key: locator, evidence_digest: digest, evidence: bytes.bytes.toString('utf8').slice(0, 8_000) } };
  await intelligence.recordResponses(h.req(extractionManager, 'intelligence.gateway.call', 'GWC', null, 'intelligence'), T(), D(),
    { payload: { recordings: [{ requestDigest: requestDigestOf(req), response: { claims }, modelId: METHOD.modelId, runtimeVersion: METHOD.runtimeVersion }] } });
};
const claimOf = (value: string): Row => ({ claim_kind: 'claim', subject: 'B24 Plan Terminal', predicate: 'throughput', object_value: value, confidence: 0.95, byte_start: 0, byte_end: 12 });
/** An agent principal as an administrator would provision it — PLANTED by the superuser (the harness's agent idiom, phase4-helpers :318): kind agent, extraction_agent here. */
async function provisionAgentPrincipal(label: string): Promise<string> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:${label}-${id.slice(-8)}`}, null, 'active')`.execute(su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${id}::uuid, 'extraction_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(su);
  return id;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { IntelligenceController: Ic } = await import('../../src/intelligence/intelligence.controller.js');
  graph = h.app.get(Gc); intelligence = h.app.get(Ic);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService); vault = h.app.get(VaultService); worker = h.app.get(ExtractionPlanWorkerService);
  // THE HUMANS of this file, each with a session of its own (the ports compare the acting principal).
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b24p-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b24p-domain-admin');
  extractionManager = await h.humanWithSession(['extraction_manager'], 'b24p-extraction-manager');
  analyst = await h.humanWithSession(['domain_analyst'], 'b24p-analyst');
  // THE SOURCES (each with its own upload agent) BEFORE the subscription, so their registrations' events are left behind.
  planSource = await h.uploadSource('internal', PLAN_LABEL);
  await h.uploadSource('internal', OTHER_LABEL);
  // THE METHOD, through the real routes: registered by an analyst, approved and activated by the extraction manager; it reads the plan source only.
  const m = await intelligence.registerMethod(h.req(analyst, 'intelligence.method.register', 'MTH', null, 'intelligence'), T(), D(), { payload: {
    methodKey: METHOD.key, name: 'B24 plan extraction', sourceId: planSource, targetTypes: ['CLM'], gatewayMode: 'replay', modelId: METHOD.modelId, modelWeightsDigest: sha256(`${METHOD.key}-weights`),
    runtimeVersion: METHOD.runtimeVersion, promptRef: `extract/${METHOD.key}`, promptVersion: 'v1', promptText: METHOD.promptText, decoding: METHOD.decoding,
    confidenceFloor: 0.3, reviewBelow: 0.5, budgetCalls: 20, budgetSeconds: 120 } as never }) as unknown as { method: { methodId: string } };
  methodId = m.method.methodId;
  await intelligence.approveMethod(h.req(extractionManager, 'intelligence.method.approve', 'MTH', methodId, 'intelligence'), T(), D(), methodId, { payload: { reason: 'B24 harness: reviewed' } } as never);
  await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodId, 'intelligence'), T(), D(), methodId, { payload: { target: 'active', reason: 'B24 harness: ready to extract' } } as never);
  await settle();
  // THE SUBSCRIPTION: the observations kind alone, registered by the tenant administrator with the backlog left.
  const r = await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
    { payload: { consumerKind: 'observations', ownerPrincipalId: extractionManager.principalId, backlog: 'leave' } as never }) as unknown as { subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } };
  subscription = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
  expect(r.served.workerRunning).toBe(true);
  await settle();
}, 300_000);

afterAll(async () => {
  try { await worker.obliterateDrainsForTests(T(), D()); } catch { /* the queue may not exist */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('CP-6 B24 (0086 §P): the selected transformation plan executes under the extraction agent', () => {
  it('X5 · NO_PLAN: an upload on a source no method reads → the selection is no_plan with its reason and NOTHING is queued (the delivery names no execution)', async () => {
    const t0 = await mark();
    const u = await uploadOn(OTHER_LABEL, 'b24p-other.csv', 'site,throughput\nB24 Other Quay,7\n');
    const ev = await outboxEvent('ObservationRecorded', t0, (p) => p['evd_object_id'] === u.id);
    const d = await observed(ev.id);
    expect(d.items_applied[0]).toMatchObject({ effect: 'plan.none', details: { outcome: 'no_plan', evd_object_id: u.id, executions: [] } });
    const s = await selectionsOf(u.id);
    expect(s).toEqual([expect.objectContaining({ outcome: 'no_plan', reason: 'no extraction method of this domain reads this source', outbox_event_id: ev.id })]);
    expect(await executionsOf(u.id)).toEqual([]);
    const st = await status({ evdObjectId: u.id });
    expect(st.executions).toEqual([]);
    sixEvidence('X5', { fault_trace: { upload: u.id, event: ev.id }, watermark: { selection: 'no_plan', executions: 0 }, consumer_behaviour: 'observations selected no_plan and queued nothing',
      operator_action: 'none', recovery: 'none', reconciliation: { reason: s[0]!.reason } });
  }, 180_000);

  it('X3 · NO AGENT: selected → ONE pending execution, VISIBLE with the reason it waits; the registration refused (403 ×2, 422 ×3); the extraction manager registers the provisioned agent principal → the drain runs at once → done under the agent', async () => {
    const t0 = await mark();
    E1 = await uploadOn(PLAN_LABEL, 'b24p-e1.csv', 'site,throughput\nB24 Plan Terminal,41\n');
    const ev = await outboxEvent('ObservationRecorded', t0, (p) => p['evd_object_id'] === E1.id);
    const d = await observed(ev.id);
    expect(d.items_applied[0]).toMatchObject({ effect: 'plan.selected', details: { outcome: 'selected', evd_object_id: E1.id } });
    const named = obj(d.items_applied[0]!.details)['executions'] as Row[];
    expect(named).toEqual([expect.objectContaining({ method_id: methodId, method_version: 1, evd_version: E1.version, state: 'pending', queued: true })]);
    const [x] = await executionsOf(E1.id);
    expect(x).toMatchObject({ execution_id: named[0]!['execution_id'], state: 'pending', attempts: 0, agent_id: null, run_id: null, evd_version: E1.version, method_id: methodId, method_version: 1 });
    expect((await executionEvents(x!.execution_id)).map((e) => e.event)).toEqual(['queued']);
    // VISIBLE, with the reason it waits — and still pending after the (absent) drain was nudged: nothing drops it.
    const st = await status();
    expect(st.agent).toBeNull();
    expect(st.note).toBe('no extraction agent is registered in this domain: 1 execution(s) wait, pending, until one is');
    expect(st.counts).toMatchObject({ pending: 1, done: 0 });
    expect(st.executions.map((e) => e['execution_id'])).toContain(x!.execution_id);
    expect(st.executor).toMatchObject({ name: PLAN_EXECUTOR.name, version: PLAN_EXECUTOR.version, codeDigest: PLAN_EXECUTOR.codeDigest });
    expect(await worker.promoteDelayedDrainsForTests(T(), D())).toBe(0);
    await sleep(1_500);
    expect((await executionsOf(E1.id))[0]!.state).toBe('pending');
    expect(await runsOfMethod()).toEqual([]);
    /* THE REGISTRATION'S REFUSALS */
    agentPrincipalA = await provisionAgentPrincipal('b24p-extraction-agent-a');
    await refused(register(analyst, { principalId: agentPrincipalA, ownerPrincipalId: extractionManager.principalId }), /./, 403);                 // the policy: not a registrar
    await refused(register(extractionManager, { ownerPrincipalId: extractionManager.principalId }), /./, 403);                                      // creating a principal is an administrator's
    await refused(register(extractionManager, { principalId: extractionManager.principalId, ownerPrincipalId: extractionManager.principalId }),
      /^extraction agent rejected: principal .* is not an active principal of kind agent in this tenant/, 422, 'EYE-REQ-001');
    await refused(register(extractionManager, { principalId: agentPrincipalA, ownerPrincipalId: extractionManager.principalId, budgets: { max_attempts: 9 } }),
      /^extraction agent rejected: budgets are \{max_executions_per_drain 1\.\.50, max_attempts 1\.\.5, drain_every_seconds 60\.\.86400\}/, 422, 'EYE-REQ-001');
    await refused(register(extractionManager, { principalId: agentPrincipalA }), /ownerPrincipalId \(the accountable human\) is required/, 422);
    expect(Number((await sql<{ n: number }>`select count(*)::int n from intelligence.extraction_agents where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0]!.n)).toBe(0);
    /* THE RECORDED RESPONSE, then THE REGISTRATION — the extraction manager names the principal an administrator provisioned. */
    await recordFor(E1, [claimOf('41 units')]);
    const reg = await register(extractionManager, { principalId: agentPrincipalA, ownerPrincipalId: extractionManager.principalId, escalationPrincipalId: dadmin.principalId });
    agentA = reg.agent.agentId;
    expect(reg.agent).toMatchObject({ principalId: agentPrincipalA, role: 'extraction_agent', owner: extractionManager.principalId, escalation: dadmin.principalId, requeued: 0, pending: 1, principalCreated: false,
      executor: { name: PLAN_EXECUTOR.name, version: PLAN_EXECUTOR.version, codeDigest: PLAN_EXECUTOR.codeDigest }, budgets: { max_executions_per_drain: 10, max_attempts: 3, drain_every_seconds: 60 } });
    expect(reg.served).toMatchObject({ drainScheduled: true, everySeconds: 60, workerRunning: true });
    expect(await worker.drainSchedulerForTests(T(), D())).toMatchObject({ agentId: agentA, every: 60_000 });
    // The scheduler's first job runs at once: the waiting execution is drained.
    const done = await waitExecution(E1.id, 'done');
    expect(done).toMatchObject({ agent_id: agentA, principal_id: agentPrincipalA, attempts: 1, last_error: null });
    expect(done.outcome).toMatchObject({ run_state: 'completed', mode: 'replay', evidence_read: 1, claims_admitted: 1, idempotent_hits: 0, method_key: METHOD.key });
    const runs = await runsOfMethod();
    expect(runs).toEqual([expect.objectContaining({ run_id: done.run_id, agent_principal_id: agentPrincipalA, state: 'completed', claims_admitted: 1 })]);
    // The run is the AGENT's — never the subscriber's (the subscriber only queued).
    expect(runs[0]!.agent_principal_id).not.toBe(subscription.principalId);
    expect((await sql<{ assurance: string }>`select assurance from identity.sessions where principal_id = ${agentPrincipalA}::uuid`.execute(su)).rows.map((r) => r.assurance)).toContain('agent_grant');
    expect((await executionEvents(done.execution_id)).map((e) => e.event)).toEqual(['queued', 'claimed', 'done']);
    const after = await status({ evdObjectId: E1.id });
    expect(after.agent).toMatchObject({ agent_id: agentA, status: 'active', principal_id: agentPrincipalA, escalation_principal_id: dadmin.principalId });
    expect(after.note).toBeNull();
    expect(after.executions).toEqual([expect.objectContaining({ execution_id: done.execution_id, state: 'done', run_id: done.run_id })]);
    await drainsIdle();
    sixEvidence('X3', { fault_trace: { upload: E1.id, event: ev.id, execution: done.execution_id }, watermark: { before: 'pending (no agent, visible, note stated)', after: 'done' },
      consumer_behaviour: 'observations queued one pending execution in the delivery transaction', operator_action: 'the extraction manager registered the provisioned agent principal (PLANTED by the superuser — stated)',
      recovery: 'the registration\'s drain ran at once and took the waiting execution', reconciliation: { run: done.run_id, agent: agentA, refusals: ['403 analyst', '403 principal create', '422 human principal', '422 budgets', '422 owner'] } });
  }, 240_000);

  it('X1 · THE PLAN EXECUTES: an upload → ObservationRecorded → selected → pending → the worker (the promote hook) runs it under the extraction agent → done with the run id and the admitted claim on exactly that evidence; a second active agent refused (409)', async () => {
    const t0 = await mark();
    E2 = await uploadOn(PLAN_LABEL, 'b24p-e2.csv', 'site,throughput\nB24 Plan Terminal,42\n');
    E2event = await outboxEvent('ObservationRecorded', t0, (p) => p['evd_object_id'] === E2.id);
    expect(E2event.payload).toMatchObject({ evd_object_id: E2.id, evd_version: E2.version, source_id: planSource });
    await observed(E2event.id);
    const pending = await waitExecution(E2.id, 'pending');
    await recordFor(E2, [claimOf('42 units')]);
    const before = (await runsOfMethod()).length;
    // THE WORKER, deterministically: the repeatable drain's next (delayed) job promoted — never a wait on BullMQ's 60-second floor.
    await waitFor('the next drain delayed', () => worker.queueCountsForTests(T(), D()), (c) => (c['delayed'] ?? 0) >= 1);
    expect(await worker.promoteDelayedDrainsForTests(T(), D())).toBeGreaterThanOrEqual(1);
    const done = await waitExecution(E2.id, 'done');
    expect(done).toMatchObject({ execution_id: pending.execution_id, agent_id: agentA, principal_id: agentPrincipalA, attempts: 1 });
    expect(done.outcome).toMatchObject({ run_state: 'completed', evidence_read: 1, claims_admitted: 1 });
    const runs = await runsOfMethod();
    expect(runs).toHaveLength(before + 1);
    expect(runs.at(-1)).toMatchObject({ run_id: done.run_id, agent_principal_id: agentPrincipalA, evidence_read: 1, claims_admitted: 1 });
    // The claim rests on exactly this evidence, from this run.
    const claims = await claimsOn(E2.id);
    expect(claims).toEqual([{ claim_object_id: (done.outcome['claims'] as string[])[0], run_id: done.run_id }]);
    E2claims = claims.map((c) => c.claim_object_id);
    // The run read E1? No: exactly its evidence (the orchestrator's filter) — E1's claims are still E1's one.
    expect(await claimsOn(E1.id)).toHaveLength(1);
    // One active agent per domain.
    const second = await provisionAgentPrincipal('b24p-extraction-agent-x');
    await refused(register(extractionManager, { principalId: second, ownerPrincipalId: extractionManager.principalId }), /^extraction agent rejected: this domain already has an active extraction agent/, 409, 'EYE-STA-002');
    await drainsIdle();
    sixEvidence('X1', { fault_trace: { upload: E2.id, event: E2event.id, execution: done.execution_id }, watermark: { selection: 'selected', execution: 'pending → done' },
      consumer_behaviour: 'queued in the delivery transaction; the worker ran it under the extraction agent', operator_action: 'none (the promote hook stands for the 60 s cadence)',
      recovery: 'none', reconciliation: { run: done.run_id, claims: E2claims, second_agent: '409' } });
  }, 240_000);

  it('X2 · IDEMPOTENT: a replay re-applies the selection (repeated) and queues nothing; a second producer\'s event for the same evidence version finds the execution; a LOST outcome re-run is free (0023\'s extraction identity) — no second claim, no model call', async () => {
    const [x] = await executionsOf(E2.id);
    const runsBefore = (await runsOfMethod()).length; const attemptsBefore = await attemptsOn(E2.id); const callsBefore = await gatewayCallsOfMethod();
    /* (a) THE REPLAY of the subscription from E2's event */
    const rp = await graph.replaySubscription(h.req(dadmin, 'graph.subscription.replay', 'SUB', subscription.subscriptionId, 'platform.administration'), T(), D(), subscription.subscriptionId,
      { payload: { fromSeq: E2event.partition_seq - 1, reason: 'B24 X2: re-drive the observation (harness)' } }) as unknown as { replayed: number; events: string[] };
    expect(rp.events).toContain(E2event.id);
    const re = await observed(E2event.id, 1);
    expect(re.items_applied[0]).toMatchObject({ effect: 'plan.selected', details: { repeated: true, executions: [expect.objectContaining({ execution_id: x!.execution_id, state: 'done', queued: false })] } });
    await settle();
    expect(await selectionsOf(E2.id)).toHaveLength(1);
    expect(await executionsOf(E2.id)).toHaveLength(1);
    /* (b) A SECOND PRODUCER's ObservationRecorded for the same evidence version (PLANTED — stated: the quarantine release / governed import shapes publish the same contract) */
    const planted = await plantOutbox('ObservationRecorded', { schema_version: 'v1', evd_object_id: E2.id, evd_version: E2.version, source_id: planSource, acquisition_mode: 'replay' });
    const d2 = await observed(planted);
    expect(d2.items_applied[0]).toMatchObject({ effect: 'plan.selected', details: { repeated: false, executions: [expect.objectContaining({ execution_id: x!.execution_id, state: 'done', queued: false })] } });
    expect(await selectionsOf(E2.id)).toHaveLength(2);
    expect(await executionsOf(E2.id)).toHaveLength(1);
    await worker.promoteDelayedDrainsForTests(T(), D());
    await drainsIdle();
    expect(await runsOfMethod()).toHaveLength(runsBefore);
    /* (c) AN OUTCOME LOST between the run and its record — the superuser puts the row back to pending (stated) — the re-run is FREE */
    await sql`update intelligence.plan_executions set state = 'pending', finished_at = null where execution_id = ${x!.execution_id}::uuid`.execute(su);
    await waitFor('the next drain delayed', () => worker.queueCountsForTests(T(), D()), (c) => (c['delayed'] ?? 0) >= 1);
    await worker.promoteDelayedDrainsForTests(T(), D());
    const again = await waitFor('the re-run recorded', () => executionsOf(E2.id), (rows) => rows[0]!.state === 'done' && rows[0]!.attempts === 2).then((rows) => rows[0]!);
    expect(again.run_id).not.toBe(x!.run_id);                                       // a new run was recorded …
    expect(again.outcome).toMatchObject({ run_state: 'completed', evidence_read: 1, claims_admitted: 0, idempotent_hits: 1, calls_used: 0 });   // … and it admitted nothing: the identity answered
    expect(await claimsOn(E2.id)).toEqual(E2claims.map((c) => ({ claim_object_id: c, run_id: x!.run_id })));
    expect(await attemptsOn(E2.id)).toBe(attemptsBefore);
    expect(await gatewayCallsOfMethod()).toBe(callsBefore);
    expect(await runsOfMethod()).toHaveLength(runsBefore + 1);
    await drainsIdle();
    sixEvidence('X2', { fault_trace: { replayed_event: E2event.id, planted_event: planted, lost_outcome: x!.execution_id }, watermark: { selections: 2, executions: 1, claims: E2claims.length },
      consumer_behaviour: 'a repeated selection queues nothing; a second event for the same version finds the execution', operator_action: 'a replay by the domain administrator',
      recovery: 'the lost outcome re-run is free (extraction identity: idempotent_hits 1, calls 0)', reconciliation: { runs: runsBefore + 1, attempts: attemptsBefore } });
  }, 300_000);

  it('X4 · REVOKED: the agent revoked → its next drain is REFUSED by the session port and the refusal RECORDED, the drain removed; a tenant administrator registers a new agent (its principal created) → the refused execution re-queued and done', async () => {
    await refused(revoke(dadmin, agentA), /a revocation states its reason/, 422);
    await refused(revoke(dadmin, uuidv7(), 'B24 X4: not an agent of this domain'), /^extraction agent revocation rejected: .* is not an active extraction agent of this domain/, 404, 'EYE-STA-001');
    await refused(revoke(analyst, agentA, 'B24 X4: an analyst may not revoke'), /./, 403);
    const rv = await revoke(dadmin, agentA, 'B24 X4: the agent is withdrawn for review (harness)');
    expect(rv.agent).toMatchObject({ agentId: agentA, status: 'revoked' });
    await refused(revoke(dadmin, agentA, 'B24 X4: revoked twice (harness)'), /^extraction agent revocation rejected: .* is not an active extraction agent of this domain/, 404, 'EYE-STA-001');
    // The drain is deliberately left (the grant, not the queue, is the authority).
    expect(await worker.drainSchedulerForTests(T(), D())).toMatchObject({ agentId: agentA });
    const t0 = await mark();
    const E3 = await uploadOn(PLAN_LABEL, 'b24p-e3.csv', 'site,throughput\nB24 Plan Terminal,43\n');
    const ev = await outboxEvent('ObservationRecorded', t0, (p) => p['evd_object_id'] === E3.id);
    await observed(ev.id);
    await waitExecution(E3.id, 'pending');
    await recordFor(E3, [claimOf('43 units')]);
    const st = await status();
    expect(st.agent).toBeNull();
    expect(st.note).toMatch(/^no extraction agent is registered in this domain: 1 execution\(s\) wait, pending, until one is$/);
    /* THE REVOKED AGENT'S NEXT DRAIN — refused by its session port, recorded */
    const runsBefore = (await runsOfMethod()).length;
    await waitFor('the next drain delayed', () => worker.queueCountsForTests(T(), D()), (c) => (c['delayed'] ?? 0) >= 1);
    await worker.promoteDelayedDrainsForTests(T(), D());
    const refusedRow = await waitExecution(E3.id, 'refused');
    expect(refusedRow).toMatchObject({ agent_id: agentA, attempts: 1, run_id: null });
    expect(refusedRow.last_error).toBe('the extraction agent\'s grant refused the run: extraction agent session denied: agent grant is revoked');
    expect((await executionEvents(refusedRow.execution_id)).map((e) => e.event)).toEqual(['queued', 'claimed', 'refused']);
    expect(await runsOfMethod()).toHaveLength(runsBefore);
    await drainsIdle();
    expect(await worker.drainSchedulerForTests(T(), D())).toBeNull();
    expect(worker.recentDrains(T(), D())[0]).toMatchObject({ agentId: agentA, claimed: 1, refused: 1, note: expect.stringMatching(/^grant refused .* drain removed$/) });
    // A revoked registration is not reused.
    await refused(register(extractionManager, { principalId: agentPrincipalA, ownerPrincipalId: extractionManager.principalId }), /^extraction agent rejected: principal .* was already registered/, 409, 'EYE-STA-002');
    /* RECOVERY: a tenant administrator registers a new agent, its principal CREATED on the identity authority */
    const reg = await register(tenantAdmin, { ownerPrincipalId: extractionManager.principalId });
    expect(reg.agent).toMatchObject({ role: 'extraction_agent', requeued: 1, pending: 1, principalCreated: true, escalation: extractionManager.principalId });
    const created = (await sql<{ kind: string; status: string; display_name: string }>`select kind, status, display_name from identity.principals where id = ${reg.agent.principalId}::uuid`.execute(su)).rows[0]!;
    expect(created).toMatchObject({ kind: 'agent', status: 'active', display_name: `agent:${PLAN_EXECUTOR.name}@${PLAN_EXECUTOR.version} (${PLAN_EXECUTOR.codeDigest.slice(0, 12)})` });
    const done = await waitExecution(E3.id, 'done');
    expect(done).toMatchObject({ agent_id: reg.agent.agentId, principal_id: reg.agent.principalId, attempts: 2, last_error: null });
    expect((await executionEvents(done.execution_id)).map((e) => e.event)).toEqual(['queued', 'claimed', 'refused', 'requeued', 'claimed', 'done']);
    expect((await runsOfMethod()).at(-1)).toMatchObject({ run_id: done.run_id, agent_principal_id: reg.agent.principalId, claims_admitted: 1 });
    await drainsIdle();
    sixEvidence('X4', { fault_trace: { revoked: agentA, upload: E3.id, execution: done.execution_id }, watermark: { after_revoke: 'refused (recorded)', after_register: 'done' },
      consumer_behaviour: 'queued as always; the revoked agent\'s drain was refused by its session port', operator_action: 'the domain administrator revoked; the tenant administrator registered a new agent (principal created)',
      recovery: 'the refused execution re-queued by the registration and run by the new agent', reconciliation: { refusals: ['422 no reason', '404 unknown', '403 analyst', '404 twice', '409 reused principal'], run: done.run_id } });
  }, 300_000);

  it('X6 · AUTHORITY: every new port refuses without its capability and is unreachable by the other authority (the C14 rule, by hand for 0086 §P); a drifted executor digest opens no session', async () => {
    const { COMMIT_DB, IDENTITY_DB } = await import('../../src/shared/shared.module.js');
    const pools = { commit: h.app.get<import('../../src/shared/db.js').Db>(COMMIT_DB), identity: h.app.get<import('../../src/shared/db.js').Db>(IDENTITY_DB) };
    const failure = async (p: Promise<unknown>): Promise<{ code: string | null; message: string }> => {
      try { await p; return { code: null, message: '' }; } catch (e) { return { code: (e as { code?: string }).code ?? null, message: (e as Error).message }; }
    };
    const probes: Array<[string, 'commit' | 'identity', string]> = [
      ['intelligence.register_extraction_agent', 'commit', 'select intelligence.register_extraction_agent(null,null,null,null,null,null,null,null,null,null,null,null)'],
      ['intelligence.revoke_extraction_agent', 'commit', 'select intelligence.revoke_extraction_agent(null,null,null,null,null,null,null)'],
      ['intelligence.select_transformation_plan', 'commit', 'select intelligence.select_transformation_plan(null,null,null,null,null,null,null,null,null)'],
      ['intelligence.claim_plan_executions', 'commit', 'select * from intelligence.claim_plan_executions(null,null,null,null,null)'],
      ['intelligence.record_plan_execution', 'commit', 'select intelligence.record_plan_execution(null,null,null,null,null,null,null)'],
      ['intelligence.plan_executions_to_reconcile', 'commit', 'select * from intelligence.plan_executions_to_reconcile()'],
      ['intelligence.extraction_agent_session_open', 'identity', 'select intelligence.extraction_agent_session_open(null,null,null,null,null,null,null,null,null,null)'],
      ['intelligence.extraction_agent_session_extend', 'identity', 'select intelligence.extraction_agent_session_extend(null,null,null,null,null,null,null)'],
    ];
    for (const [name, pool, q] of probes) {
      const r = await failure(sql.raw(q).execute(pools[pool]));
      expect(r.code, `${name} ran with no capability: ${r.message}`).toBe('42501');
      const other = pool === 'commit' ? 'identity' : 'commit';
      const denied = await failure(sql.raw(q).execute(pools[other]));
      expect(denied.code, `${name} is reachable by the ${other} authority`).toBe('42501');
      expect(denied.message).toMatch(/permission denied/);
    }
    // The executor's identity is the CODE's: a session asked for under another digest is refused by the port.
    const active = (await sql<{ agent_id: string }>`select agent_id::text from intelligence.extraction_agents where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'active'`.execute(su)).rows[0]!;
    const drift = await failure(pools.identity.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op('identity.session.create', null::uuid, ${uuidv7()}::uuid, 60)`.execute(tx);
      await sql`select intelligence.extraction_agent_session_open(${uuidv7()}::uuid, ${active.agent_id}::uuid, ${T()}::uuid, ${D()}::uuid, ${PLAN_EXECUTOR.version}, ${'f'.repeat(64)}, 'x', 'y', ${new Date(Date.now() + 60_000)}, ${uuidv7()}::uuid)`.execute(tx);
    }));
    expect(drift.code).toBe('42501');
    expect(drift.message).toMatch(/^extraction agent session denied: agent instance or code digest does not match the registration/);
    // The execution ledger is append-only.
    const [someEvent] = (await sql<{ event_id: string }>`select event_id::text from intelligence.plan_execution_events limit 1`.execute(su)).rows;
    expect(await failure(sql`update intelligence.plan_execution_events set details = '{}'::jsonb where event_id = ${someEvent!.event_id}::uuid`.execute(su)).then((r) => r.code)).not.toBeNull();
    sixEvidence('X6', { fault_trace: { probes: probes.map((p) => p[0]) }, watermark: { refused: probes.length * 2 }, consumer_behaviour: 'n/a', operator_action: 'none',
      recovery: 'none', reconciliation: { digest_drift: '42501', ledger: 'append-only' } });
  }, 120_000);
});
