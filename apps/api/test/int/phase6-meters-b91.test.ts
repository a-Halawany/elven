/**
 * CP-6 B91 part `meters` (0105 §ME) — USAGE METERS PER TENANT, CAPABILITY AND PROFILE, CAPS AND B90's USAGE COUNTERS (F-P7-F-02: V10-T-016,
 * IA-70-001's meter half, DP-70-001, DP-70-005; B90's carryover §B90.9 #2), through the real database and controllers. Every figure is
 * SYNTHETIC (NORDWERK's data is the demonstration's): the decision world of phase6-fixtures (its collection run, its four completed runs),
 * the corridor twin's experiment executed by the domain's ATTENTION AGENT (its after-tick hook, the chunk executor a separate process from
 * the built tree), a metric product and an event product of the B90 registry.
 *
 *   M1 · THE RECORDING POINTS: the collection run (source_consumption: requests and bytes), the completed runs (simulation_compute), a
 *        gateway call through the gateway's own recording port (model_inference: one call, its latency; NO TOKENS EXIST — stated in the
 *        record), the storage sample of the tick step (the evidence bytes measured by the port) — and the refusals: a caller's storage figure,
 *        an unknown sweep, a source under the wrong action, the ledger append-only; RECOVERY: the second sample of the hour records nothing,
 *        a fired point never records twice.
 *   M2 · CAPS: an UNCONTRACTED tenant's cap is bounded by nothing but itself; a licence (a stated superuser move: §EN's issue_licence is
 *        another part's port) bounds the next cap — above it refused, within it set; model_inference is WARN only (a stop at the gateway
 *        would refuse an extraction mid-run); the warn cap CROSSED once per period (commercial.usage to the administrator); the policy
 *        (another role, another scope) and the port (scope, unchanged, unknown domain) refuse; RECOVERY: the cap raised as version 2.
 *   M3 · ENFORCEMENT AT ADMISSION: no cap → the envelope sweep runs and its wall ms is metered; a STOP cap on simulation_compute reached
 *        → the attention agent's next claim stops the running experiment PARTIAL (reason tenant_cap; the existing budget_exceeded event
 *        with the cap; a refused breach; commercial.usage raised) — the completed chunk KEPT; the sweep route refuses `usage cap rejected
 *        (cap)` (409) before running, the breach recorded, no sweep written; RECOVERY: the cap raised, the sweep runs and is metered.
 *   M4 · B90's CARRYOVER: a real metric SERVING and a real subscription READ and CATCH-UP increment products.product_consumers.usage of
 *        the consumer's live registration (and meter product_consumption); a serving to a principal with no registration is metered and
 *        counts nothing; RECOVERY: the second serving counts 2.
 *   M5 · THE READS AND THE BOUNDARY: the administrator's tenant read (every dimension, the caps, the breaches, the licence), the auditor's,
 *        the domain read; another domain sees none of this domain's records; an outsider and a domain role on the tenant route refused.
 *
 * Stated superuser moves: a licence row planted (the prelude's table; §EN's port issues it in the integration); a second domain seeded
 * (fixture scaffolding). The demonstration's scene (the corridor sweep's compute against the tenant cap) is the act's (scripts/phase6/act-b91.mjs).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ProductsController } from '../../src/products/products.controller.js';
import type { EventsController } from '../../src/products/events/events.controller.js';
import type { MetricsController } from '../../src/products/metrics/metrics.controller.js';
import type { ConsumersController } from '../../src/products/consumers/consumers.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { OrchestrationController } from '../../src/twin/simulations/orchestration/orchestration.controller.js';
import { OrchestrationService, productExecutor } from '../../src/twin/simulations/orchestration/orchestration.service.js';
import { FabricController } from '../../src/twin/simulations/fabric/fabric.controller.js';
import { MetersController } from '../../src/commercial/meters/meters.controller.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';

// this file's own vault roots (h.upload uploads through the governed path)
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b91-meters-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let commitDb: Db;
let meters: MetersController; let orch: OrchestrationController; let svc: OrchestrationService; let fabric: FabricController; let timer: AttentionTimerService; let scheduler: SchedulerService;
let products: ProductsController; let events: EventsController; let metrics: MetricsController; let consumers: ConsumersController;
/** Nakamura (twin owner, run operator), Weber (approves budgets), the tenant administrator (caps), the domain administrator, the executive
 *  (agent owner, product reviewer), the steward, the owner (forecasts, metrics), the analyst (the consumer), the auditor, an outsider. */
let nakamura: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let execOwner: AuthenticatedPrincipal;
let steward: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let elsewhere: AuthenticatedPrincipal;
let agentId = ''; let day = 0; let D2 = '';
let FIRST_SAMPLE: Row = {}; let MI_CAP = ''; let EXP = ''; let EXP_RUN = ''; let SIM_CAP = '';
let P_MET = ''; let P_EVT = ''; let SUB = ''; let MSR = ''; let EFF = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const dbInstant = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(h.su)).rows[0]!.t.toISOString();
const JITTER = { '0': 0.5, '3': 0.3, '7': 0.2 };

/* ───────────── refusals (the B18/B20 idiom) ───────────── */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
/** A TENANT-scoped request (the usage surface's tenant routes): the envelope names the tenant and no domain. */
const TR = (as: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: { ...(h.env(as, action, 'USG', null, 'administration') as unknown as Row), scope: 'TENANT', domain_id: null }, eyePrincipal: as }) as never;
const DR = (as: AuthenticatedPrincipal, action: string, domainId = D()) => ({ eyeEnvelope: { ...(h.env(as, action, 'USG', null, 'administration') as unknown as Row), domain_id: domainId }, eyePrincipal: as }) as never;
const tenantRead = (as = tenantAdmin, payload: Row = {}) => meters.tenantRead(TR(as, 'commercial.usage.read'), T(), { payload }).then((r) => r.usage as Row);
const tenantStatus = (payload: Row, as = tenantAdmin) => meters.tenantStatus(TR(as, 'commercial.usage.read'), T(), { payload }).then((r) => r.status as Row);
const setCap = (payload: Row, as = tenantAdmin) => meters.setCap(TR(as, 'commercial.cap.set'), T(), { payload }).then((r) => r.cap as Row);
const domainRead = (as = dadmin, domainId = D()) => meters.domainRead(DR(as, 'commercial.usage.read', domainId), T(), domainId, { payload: {} }).then((r) => r.usage as Row);
const domainStatus = (dimension: string, as = nakamura) => meters.domainStatus(DR(as, 'commercial.usage.read'), T(), D(), { payload: { dimension } }).then((r) => r.status as Row);
const X = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'simulation');
const declareExp = (payload: Row, as = nakamura) => orch.declare(X(as, 'simulation.experiment.declare', 'SXP'), T(), D(), { payload }) as Promise<{ experiment: Row }>;
const approveExp = (id: string, budgetDigest: string, as = weber) => orch.approve(X(as, 'simulation.experiment.approve', 'SXP', id), T(), D(), id, { payload: { budgetDigest, note: 'proportionate for the metering study (SYNTHETIC)' } }) as Promise<{ experiment: Row }>;
const startExp = (id: string, as = nakamura) => orch.start(X(as, 'simulation.experiment.start', 'SXP', id), T(), D(), id) as Promise<{ experiment: Row }>;
const readExp = (id: string, as = nakamura) => orch.read(X(as, 'simulation.experiment.read', 'SXP', id), T(), D(), id).then((r) => (r as unknown as { experiment: Row }).experiment);
const sweep = (runId: string, payload: Row = {}, as = nakamura) => fabric.sweep(X(as, 'simulation.sweep.run', 'SIM', runId), T(), D(), runId, { payload }) as Promise<{ sweep: Row }>;
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'executive');
const register = (as: AuthenticatedPrincipal, payload: Row) => products.register(E(as, 'products.product.register', 'DPR'), T(), D(), { payload }) as Promise<{ product: Row }>;
const declareProduct = (as: AuthenticatedPrincipal, id: string, declaration: unknown) => products.declare(E(as, 'products.product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } as Row }) as Promise<{ product: Row }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.review(E(as, 'products.product.review', 'DPR', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const release = (as: AuthenticatedPrincipal, id: string, version: number) => products.release(E(as, 'products.product.release', 'DPR', id), T(), D(), id, { payload: { version } }) as Promise<{ product: Row }>;
const regConsumer = (as: AuthenticatedPrincipal, id: string, payload: Row) => consumers.registerConsumer(E(as, 'products.consumer.register', 'DPR', id), T(), D(), id, { payload }) as Promise<{ consumer: Row }>;
const acceptConsumer = (as: AuthenticatedPrincipal, id: string, cid: string, version: number) => consumers.accept(E(as, 'products.consumer.accept', 'DPR', id), T(), D(), id, cid, { payload: { version } as Row }) as Promise<{ consumer: Row }>;
const define = (as: AuthenticatedPrincipal, id: string, payload: Row) => metrics.define(E(as, 'products.metric.declare', 'MET', id), T(), D(), id, { payload }) as Promise<{ metric: Row }>;
const serve = (as: AuthenticatedPrincipal, key: string, payload: Row) => metrics.serve(E(as, 'products.metric.serve', 'MET'), T(), D(), key, { payload }) as Promise<{ serving: Row }>;
const declareEvent = (as: AuthenticatedPrincipal, id: string, declaration: Row) => events.declare(E(as, 'products.event_product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } }) as Promise<{ event_product: Row }>;
const subscribe = (as: AuthenticatedPrincipal, payload: Row) => events.register(E(as, 'products.subscription.register', 'SUB'), T(), D(), { payload }) as Promise<{ subscription: Row }>;
const authorize = (as: AuthenticatedPrincipal, id: string) => events.authorize(E(as, 'products.subscription.authorize', 'SUB', id), T(), D(), id) as Promise<{ subscription: Row }>;
const readEvents = (as: AuthenticatedPrincipal, id: string, payload: Row = {}) => events.readEvents(E(as, 'products.subscription.read', 'SUB', id), T(), D(), id, { payload }) as Promise<{ read: Row }>;
const catchUp = (as: AuthenticatedPrincipal, id: string, payload: Row = {}) => events.catchUp(E(as, 'products.subscription.catch_up', 'SUB', id), T(), D(), id, { payload }) as Promise<{ catchup: Row }>;

/* ───────────── the rows (every count scoped to THIS harness's tenant: the hosted run shares one database across files) ───────────── */
const usage = async (dimension: string, sourceKind: string | null = null) => rows(sql`select usage_id::text, domain_id::text, capability_key, unit, quantity::numeric as quantity, profile, source_kind, source_ref, details
  from commercial.usage_records where tenant_id = ${T()}::uuid and dimension = ${dimension} and (${sourceKind}::text is null or source_kind = ${sourceKind}) order by occurred_at, recorded_at, usage_id`);
const usedToday = async (dimension: string, unit: string): Promise<number> => Number((await rows(sql`select commercial.cme_used(${T()}::uuid, null, ${dimension}, ${unit}, commercial.cme_period_start('day', clock_timestamp())) as n`))[0]!['n']);
const breaches = async (capId: string) => rows(sql`select breach_id::text, kind, action, subject_kind, subject_id::text, used::numeric as used, cap_limit::numeric as cap_limit, cap_version, details
  from commercial.cap_breaches where tenant_id = ${T()}::uuid and cap_id = ${capId}::uuid order by occurred_at, breach_id`);
const meterItems = async (capId: string) => rows(sql`select item_id::text, signal_class, subject_kind, owner_principal_id::text as owner, route_roles, state, title, cause_event_type, details
  from executive.attention_items where tenant_id = ${T()}::uuid and signal_class = 'commercial.usage' and subject_id = ${capId}::uuid order by created_at`);
const expEvents = async (id: string) => rows(sql`select event, details from simulation.experiment_events where experiment_id = ${id}::uuid order by occurred_at, event_id`);
const consumerUsage = async (productId: string, principalId: string) => obj((await rows(sql`select usage from products.product_consumers where product_id = ${productId}::uuid and consumer_principal_id = ${principalId}::uuid and state in ('registered', 'accepted')`))[0]?.['usage']);
/** One attention tick (its own day): the storage step's record and the experiment drain. */
const tick = async (): Promise<{ steps: Row; drain: Row }> => {
  day += 1;
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2038, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const outputs = obj(t.run?.outputs);
  return { steps: obj(outputs['steps'] ?? outputs), drain: obj(obj(outputs['after'])['simulation-experiments']) };
};
/** The gateway's own recording port (intelligence.record_gateway_call, under intelligence.gateway.call) — a REPLAYED call (SYNTHETIC digests). */
const gatewayCall = async (latencyMs: number): Promise<string> => {
  const callId = uuidv7();
  await inCommitContext(commitDb, { sessionId: nakamura.sessionId as string, contextKey: nakamura.contextKey as string }, { tenantId: T(), domainId: D() }, 'intelligence.gateway.call', callId,
    async (tx) => sql`select intelligence.record_gateway_call(${callId}::uuid, ${T()}::uuid, ${D()}::uuid, null::uuid, ${uuidv7()}::uuid, 'replay', ${sha('b91-request-' + callId)}, ${sha('b91-response-' + callId)},
      'synthetic-extractor', ${sha('weights')}, 'replay-runtime@1', 'prompt@1', ${sha('decoding')}, 'completed', ${latencyMs}::int, '{"synthetic":true}'::jsonb, ${uuidv7()}::uuid)`.execute(tx as never));
  return callId;
};
/** A port called directly in a commit context bound to an action (the port's own refusals, past the policy). */
const portAs = (as: AuthenticatedPrincipal, action: string, q: ReturnType<typeof sql>) => inCommitContext(commitDb, { sessionId: as.sessionId as string, contextKey: as.contextKey as string },
  { tenantId: T(), domainId: D() }, action, uuidv7(), async (tx) => (await q.execute(tx as never)).rows[0] as Row);

/* SYNTHETIC declarations (the B90 harnesses' shapes) */
const DECL = (servingModes: string[]): Row => ({
  contract: { schema: [{ object_type: 'WRN', schema_version: 'v2' }] }, serving_modes: servingModes,
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }], outputs: [{ kind: 'object_type', ref: 'WRN', authority: false }],
  slo: { lag_events: 2 }, policy: { purposes: ['executive', 'procurement'], data_classes: ['internal'] }, cost: { basis: 'compute-minutes' }, quality: { completeness: 'declared' },
});
const EVENT_DECL: Row = {
  schema: { version: 'v1', fields: [{ name: 'title', type: 'string' }, { name: 'consequence_class', type: 'string' }, { name: 'confidence', type: 'number' }, { name: 'closes_at', type: 'instant' }, { name: 'routed_to', type: 'uuid' }] },
  subject_kind: 'warning', ordering_key: 'subject_id', delivery: 'pull', retention_days: 30, replay_policy: { allowed: true },
  source: { ledger: 'prediction.warning_events', kinds: ['warning.raised', 'warning.retracted'] },
};
const releasedProduct = async (key: string, title: string, kind: string, before: (id: string) => Promise<unknown>, servingModes: string[]): Promise<string> => {
  const id = String((await register(steward, { key, title, kind, purpose: `${title} — a SYNTHETIC product of the B91 meters harness`, ownerPrincipalId: owner.principalId })).product['product_id']);
  await before(id);
  await declareProduct(owner, id, DECL(servingModes));
  await review(execOwner, id, { version: 1, kind: 'admission', outcome: 'accepted', notes: `admission of ${key} v1 reviewed (B91 meters harness)` });
  expect((await release(owner, id, 1)).product).toMatchObject({ state: 'released', released_version: 1 });
  return id;
};
/** Raise n SYNTHETIC corridor warnings through the B28 route (the intake, then the owner's processing). */
const raise = async (n: number, label: string): Promise<void> => {
  for (let i = 0; i < n; i++) {
    await inCommitContext(commitDb, { sessionId: owner.sessionId as string, contextKey: owner.contextKey as string }, { tenantId: T(), domainId: D() }, 'prediction.warning.raise', uuidv7(),
      async (tx) => sql`select prediction.submit_warning_candidate(${T()}::uuid, ${D()}::uuid, 'weak_signal', ${'b91m-' + uuidv7().slice(-10)}, ${JSON.stringify({ synthetic: true })}::jsonb,
        ${`Bab el-Mandeb: SYNTHETIC ${label} ${i + 1} (B91 meters harness)`}, 'C2', 0.7::numeric, ${'b91m-cause-' + uuidv7().slice(-8)}, ${JSON.stringify({ geographies: ['BAB-EL-MANDEB'], horizon: '30d' })}::jsonb, '[]'::jsonb,
        null::int, ${owner.principalId}::uuid, ${uuidv7()}::uuid) as r`.execute(tx as never));
  }
  const p = await w.prediction.processWarningCandidates(h.req(owner, 'prediction.warning.candidates.process', 'WRN', null), T(), D(), { payload: {} } as never) as unknown as { processing: { raised: Row[] } };
  expect(p.processing.raised.filter((r) => r['decision'] === 'raised').length, JSON.stringify(p.processing.raised)).toBe(n);
};
const evidence = (id: string, e: Row) => { console.log(`B91-ME EVIDENCE ${id} ${JSON.stringify(e)}`); };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  commitDb = h.app.get<Db>(COMMIT_DB);
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  const { EventsController: EC } = await import('../../src/products/events/events.controller.js');
  const { MetricsController: MC } = await import('../../src/products/metrics/metrics.controller.js');
  const { ConsumersController: CC } = await import('../../src/products/consumers/consumers.controller.js');
  products = h.app.get(PC); events = h.app.get(EC); metrics = h.app.get(MC); consumers = h.app.get(CC);
  meters = h.app.get(MetersController); orch = h.app.get(OrchestrationController); svc = h.app.get(OrchestrationService); fabric = h.app.get(FabricController);
  timer = h.app.get(AttentionTimerService); scheduler = h.app.get(SchedulerService);
  // THE WORLD (SYNTHETIC): its collection run and its four completed runs are the first records the meters hold
  w = await bootDecisionWorld(h);
  nakamura = await h.humanWithSession(['twin_owner', 'simulation_operator'], 'b91m-nakamura');
  weber = await h.humanWithSession(['strategy_owner'], 'b91m-weber');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b91m-tenant-admin', 'TENANT');
  auditor = await h.humanWithSession(['auditor'], 'b91m-auditor', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b91m-dadmin');
  execOwner = await h.humanWithSession(['executive'], 'b91m-executive');
  steward = await h.humanWithSession(['data_steward'], 'b91m-steward');
  owner = await h.humanWithSession(['forecast_owner', 'strategy_owner', 'data_steward'], 'b91m-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b91m-analyst');
  outsider = await h.humanWithSession(['collection_manager'], 'b91m-outsider');
  // ANOTHER DOMAIN of the tenant (fixture scaffolding) and its administrator
  D2 = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T()}::uuid, ${'b91m-elsewhere-' + D2.slice(-8)}, 'active', clock_timestamp())`.execute(h.su);
  elsewhere = await h.humanWithSession(['domain_admin'], 'b91m-elsewhere', 'DOMAIN', { domainId: D2 });
  // THE ATTENTION AGENT: the tick's host and the experiments' background worker (its timer unscheduled; the ticks are the harness's own)
  const r = await w.exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: execOwner.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  svc.useExecutorForTests(productExecutor);
}, 900_000);

afterAll(async () => {
  try { svc?.useExecutorForTests(null); } catch { /* none */ }
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B91 meters · M1 the recording points (usage_records only; idempotent)', () => {
  it('M1 · POSITIVE: the collection run (requests and bytes), the four completed runs, a gateway call (one call, its latency, no tokens) and the tick\'s storage sample (the evidence bytes measured by the port)', async () => {
    // source_consumption: the world's collection run (run.finished with its spent budget)
    const req = await usage('source_consumption', 'collection_run');
    const bytes = await usage('source_consumption', 'collection_run_bytes');
    expect(req.length).toBeGreaterThanOrEqual(1);
    expect(bytes.map((b) => b['source_ref'])).toEqual(req.map((x) => x['source_ref']));
    const run = (await rows(sql`select details from observation.collection_run_events where run_id = ${String(req[0]!['source_ref'])}::uuid and event = 'run.finished'`))[0]!;
    expect(Number(req[0]!['quantity'])).toBe(Number(obj(obj(run['details'])['budget_spent'])['requests']));
    expect(Number(bytes[0]!['quantity'])).toBe(Number(obj(obj(run['details'])['budget_spent'])['bytes']));
    expect(req[0]).toMatchObject({ unit: 'requests', capability_key: 'observation', profile: 'local-dev', domain_id: D() });
    // simulation_compute: the four completed runs, each once, its resource's elapsed ms
    const sims = await usage('simulation_compute', 'simulation_run');
    expect(sims.map((s) => s['source_ref']).sort()).toEqual([w.controlId, w.rerouteId, w.airId, w.control2Id].sort());
    for (const s of sims) {
      const rr = (await rows(sql`select resource from simulation.runs_current where run_id = ${String(s['source_ref'])}::uuid`))[0]!;
      expect(Number(s['quantity'])).toBe(Math.round(Number(obj(rr['resource'])['elapsed_ms'])));
      expect(s).toMatchObject({ unit: 'wall_ms', capability_key: 'simulation' });
    }
    // model_inference: the gateway's recording port → one call; latency in the details; no token count exists (said so)
    const callId = await gatewayCall(140);
    const mi = await usage('model_inference');
    expect(mi).toHaveLength(1);
    expect(mi[0]).toMatchObject({ source_kind: 'gateway_call', source_ref: callId, unit: 'calls', capability_key: 'model_portfolio' });
    expect(Number(mi[0]!['quantity'])).toBe(1);
    expect(obj(mi[0]!['details'])).toMatchObject({ latency_ms: 140, mode: 'replay', outcome: 'completed', tokens: null, tokens_note: 'the gateway records no token counts; inference is metered in calls' });
    // storage: the tick step samples the domain's evidence bytes (the port measures; hot + archive of the evidence vault, no tombstones)
    const { steps } = await tick();
    FIRST_SAMPLE = obj(steps['commercial-storage-sample']);
    expect(FIRST_SAMPLE['recorded'], JSON.stringify(FIRST_SAMPLE)).toBe(true);
    const ev = Number((await rows(sql`select coalesce(sum(m.byte_length), 0)::bigint as b from observation.blob_manifests m where m.tenant_id = ${T()}::uuid and m.domain_id = ${D()}::uuid and m.vault = 'evidence'
      and not exists (select 1 from observation.blob_tombstones x where x.manifest_id = m.manifest_id)`))[0]!['b']);
    expect(ev).toBeGreaterThan(0);
    expect(Number(FIRST_SAMPLE['bytes'])).toBe(ev);
    const st = await usage('storage');
    expect(st).toHaveLength(1);
    expect(st[0]).toMatchObject({ source_kind: 'storage_sample', unit: 'bytes', domain_id: D() });
    expect(obj(st[0]!['details'])).toMatchObject({ vault: 'evidence', gauge: true });
    evidence('M1+', { collection_run: req[0]!['source_ref'], requests: req[0]!['quantity'], bytes: bytes[0]!['quantity'], runs: sims.length, gateway_call: callId, storage_bytes: ev });
  }, 600_000);

  it('M1 · REFUSAL: a caller\'s storage figure, an unknown sweep, a source under the wrong action; the ledger is append-only', async () => {
    await refused(portAs(nakamura, 'executive.attention.tick', sql`select commercial.record_usage(${T()}::uuid, ${D()}::uuid, 'storage_sample', null, 5::numeric, '{}'::jsonb, ${nakamura.principalId}::uuid, ${uuidv7()}::uuid) as r`),
      /^usage record rejected \(quantity\): a storage sample is measured by the port/, 422);
    await refused(portAs(nakamura, 'simulation.sweep.run', sql`select commercial.record_usage(${T()}::uuid, ${D()}::uuid, 'envelope_sweep', ${uuidv7()}, 12::numeric, '{}'::jsonb, ${nakamura.principalId}::uuid, ${uuidv7()}::uuid) as r`),
      /^usage record rejected \(unknown_sweep\)/, 404);
    await refused(portAs(nakamura, 'simulation.sweep.run', sql`select commercial.record_usage(${T()}::uuid, ${D()}::uuid, 'storage_sample', null, null::numeric, '{}'::jsonb, ${nakamura.principalId}::uuid, ${uuidv7()}::uuid) as r`),
      /^usage record rejected \(source\)/, 422);
    await refused(portAs(nakamura, 'simulation.sweep.run', sql`select commercial.record_usage(${T()}::uuid, ${D()}::uuid, 'envelope_sweep', ${uuidv7()}, 12::numeric, '{}'::jsonb, ${weber.principalId}::uuid, ${uuidv7()}::uuid) as r`),
      /^usage record rejected \(actor\)/, 403);
    const one = String((await usage('model_inference'))[0]!['usage_id']);
    await expect(sql`update commercial.usage_records set quantity = 0 where usage_id = ${one}::uuid`.execute(h.su)).rejects.toThrow(/append-only/i);
    await expect(sql`delete from commercial.usage_records where usage_id = ${one}::uuid`.execute(h.su)).rejects.toThrow(/append-only/i);
    expect(await usage('storage')).toHaveLength(1);
  }, 120_000);

  it('M1 · RECOVERY: the second sample of the hour records nothing (one per domain per hour); a recording point never records a source twice', async () => {
    const { steps } = await tick();
    const second = obj(steps['commercial-storage-sample']);
    expect(second['recorded']).toBe(second['source_ref'] !== FIRST_SAMPLE['source_ref']);
    expect((await usage('storage')).length).toBe(second['recorded'] === true ? 2 : 1);
    // the run-completion point re-fired by nothing new: the four runs still recorded once each
    const refs = (await usage('simulation_compute', 'simulation_run')).map((s) => s['source_ref']);
    expect(new Set(refs).size).toBe(refs.length);
  }, 300_000);
});

describe('B91 meters · M2 caps (tenant/domain × dimension × period, stop|warn, within the licence)', () => {
  it('M2 · POSITIVE: UNCONTRACTED — a cap bounded by nothing but itself; a licence bounds the next; the model_inference WARN cap crossed once per period (commercial.usage to the administrator)', async () => {
    const big = await setCap({ dimension: 'source_consumption', unit: 'bytes', period: 'month', limit: 1e15, action: 'warn', reason: 'the source egress watched for the month (SYNTHETIC)' });
    expect(big).toMatchObject({ version: 1, scope: 'TENANT', dimension: 'source_consumption', unit: 'bytes', action: 'warn', state: 'active', licence: null, reached: false });
    expect(String(big['licence_bound'])).toMatch(/^uncontracted: no licence limit applies; the cap is bounded by nothing but itself/);
    // THE LICENCE (a stated superuser move — §EN's issue_licence is another part's port): 1,000 calls of inference, 100,000,000 ms of compute
    await sql`insert into commercial.licences (licence_id, version, tenant_id, package_key, capabilities, limits, effective_from, provenance, digest, issued_by, correlation_id)
      values (${uuidv7()}::uuid, 1, ${T()}::uuid, 'b91-harness-package', array['foresight', 'decision', 'simulation', 'observation', 'knowledge_memory', 'model_portfolio', 'agent_platform', 'advanced_integration'] /* integration: a licence turns §EN's gate on — the fixture licenses what this harness's later steps write */, ${JSON.stringify({ model_inference: 1000, simulation_compute: { wall_ms: 100_000_000 } })}::jsonb,
              clock_timestamp() - interval '1 day', '{"synthetic": true, "planted_by": "the B91 meters harness"}'::jsonb, ${sha('b91-licence')}, ${tenantAdmin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const used = await usedToday('model_inference', 'calls');
    expect(used).toBe(1);
    const c = await setCap({ dimension: 'model_inference', period: 'day', limit: 2, action: 'warn', reason: 'inference watched per day: a warning, never a stop (SYNTHETIC)' });
    MI_CAP = String(c['cap_id']);
    expect(c).toMatchObject({ version: 1, unit: 'calls', limit: 2, used: 1, remaining: 1, reached: false, licence: { version: 1, limit: 1000 } });
    expect(String(c['licence_bound'])).toBe('within the licence v1 limit 1000 calls');
    // the second call of the day reaches it: CROSSED once, the notice to the administrator (owner) and the tenant's administrators
    await gatewayCall(90);
    const b = await breaches(MI_CAP);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ kind: 'crossed', action: 'warn', subject_kind: 'meter', cap_version: 1 });
    expect(Number(b[0]!['used'])).toBe(2);
    const it1 = await meterItems(MI_CAP);
    expect(it1).toHaveLength(1);
    expect(it1[0]).toMatchObject({ signal_class: 'commercial.usage', subject_kind: 'meter', owner: tenantAdmin.principalId, route_roles: ['tenant_admin'], state: 'open', cause_event_type: 'usage.cap_crossed' });
    expect(String(it1[0]!['title'])).toMatch(/^Usage cap reached: model_inference 2 calls of 2 this day \(a warning; nothing is stopped\)/);
    // a third call: metered (a warn cap stops nothing), no second crossing in the period
    await gatewayCall(70);
    expect(await usedToday('model_inference', 'calls')).toBe(3);
    expect(await breaches(MI_CAP)).toHaveLength(1);
    expect(await meterItems(MI_CAP)).toHaveLength(1);
    const s = await tenantStatus({ dimension: 'model_inference' });
    expect(arr(s['caps'])[0]).toMatchObject({ cap_id: MI_CAP, reached: true, used: 3, remaining: 0 });
    evidence('M2+', { uncontracted_cap: big['cap_id'], inference_cap: MI_CAP, crossed: b[0]!['breach_id'], item: it1[0]!['item_id'] });
  }, 300_000);

  it('M2 · REFUSAL: above the licence; a stop on model_inference (warn only — the gateway); an unknown dimension; unchanged; an unknown domain; another role and a domain scope (the policy); the port\'s own scope', async () => {
    await refused(setCap({ dimension: 'model_inference', period: 'day', limit: 5000, action: 'warn', reason: 'more inference than the licence (SYNTHETIC)' }),
      /^usage cap rejected \(licence\): the cap 5000 calls per day exceeds the licence v1 limit 1000 calls/, 422);
    await refused(setCap({ dimension: 'model_inference', period: 'day', limit: 3, action: 'stop', reason: 'stop the gateway (SYNTHETIC)' }),
      /^usage cap rejected \(action\): a model_inference cap is warn only — a stop at the gateway would refuse an extraction mid-run/, 422);
    await refused(setCap({ dimension: 'tokens', period: 'day', limit: 3, action: 'warn', reason: 'an unmetered dimension (SYNTHETIC)' }), /^usage cap rejected \(dimension\)/, 422);
    await refused(setCap({ dimension: 'model_inference', period: 'day', limit: 2, action: 'warn', reason: 'the same cap again (SYNTHETIC)' }), /^usage cap rejected \(unchanged\)/, 409);
    await refused(setCap({ dimension: 'storage', period: 'month', limit: 10, action: 'warn', reason: 'a domain of another tenant (SYNTHETIC)', domainId: uuidv7() }), /^usage cap rejected \(unknown_domain\)/, 404);
    await refused(setCap({ dimension: 'storage', period: 'month', limit: 10, action: 'warn', reason: 'a domain administrator sets a cap (SYNTHETIC)' }, dadmin), /./, 403);
    await refused(setCap({ dimension: 'storage', period: 'month', limit: 10, action: 'warn', reason: 'an analyst sets a cap (SYNTHETIC)' }, analyst), /./, 403);
    // the port's own refusal past the policy: a tenant administrator bound at a DOMAIN scope
    await refused(portAs(tenantAdmin, 'commercial.cap.set', sql`select commercial.set_cap(${T()}::uuid, null::uuid, 'storage', null, 'month', 10::numeric, 'warn', 'a cap set from a domain context', ${tenantAdmin.principalId}::uuid, ${uuidv7()}::uuid) as r`),
      /^usage cap rejected \(scope\)/, 403);
    expect((await rows(sql`select count(*)::int n from commercial.caps where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(2);
  }, 120_000);

  it('M2 · RECOVERY: the administrator raises the inference cap within the licence — version 2 supersedes version 1 (never edited, never deleted); the cap no longer reached', async () => {
    const c = await setCap({ dimension: 'model_inference', period: 'day', limit: 900, action: 'warn', reason: 'inference raised for the corridor study (SYNTHETIC)' });
    expect(c).toMatchObject({ cap_id: MI_CAP, version: 2, supersedes: 1, limit: 900, reached: false, used: 3 });
    const v = await rows(sql`select version, state, cap_limit::numeric as l from commercial.caps where cap_id = ${MI_CAP}::uuid order by version`);
    expect(v.map((x) => [x['version'], x['state'], Number(x['l'])])).toEqual([[1, 'superseded', 2], [2, 'active', 900]]);
    await expect(sql`update commercial.caps set cap_limit = 1 where cap_id = ${MI_CAP}::uuid and version = 2`.execute(h.su)).rejects.toThrow(/usage cap rejected \(state\)/);
    await expect(sql`delete from commercial.caps where cap_id = ${MI_CAP}::uuid`.execute(h.su)).rejects.toThrow(/never deleted/);
  }, 120_000);
});

describe('B91 meters · M4 B90\'s carryover: the consumer register\'s usage counters (metric servings, subscription reads, catch-ups)', () => {
  it('M4 · POSITIVE: a real metric SERVING and a real subscription READ and CATCH-UP increment the consumer\'s live registration and meter product_consumption', async () => {
    // THE METRIC (SYNTHETIC): an MSR in EUR with a reading, the metric product declared over it, released; the analyst registers and accepts
    MSR = ((await w.graph.declare(h.req(owner, 'graph.strategy.declare', 'MSR', null, 'graph'), T(), D(), { payload: { objectType: 'MSR', title: 'Corridor exposure (EUR at risk)', statement: 'Corridor exposure (B91 meters harness, SYNTHETIC)', status: 'active',
      restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the measure is about the corridor through this strait (B91 harness)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
    await w.graph.defineMeasure(h.req(owner, 'graph.measure.define', 'MSR', MSR, 'graph'), T(), D(), MSR, { payload: { objectiveId: w.objectiveId, unit: 'EUR', direction: 'lower_better', targetValue: 500000, targetDate: '2027-06-30', freshnessDays: 60 } });
    await w.graph.observeMeasure(h.req(owner, 'graph.measure.observe', 'MSR', MSR, 'graph'), T(), D(), MSR, { payload: { value: 420000, observedAt: await dbInstant('10 days'), source: { kind: 'evidence', id: w.evd.id } } });
    EFF = await dbInstant('40 days');
    P_MET = await releasedProduct('b91-corridor-exposure', 'Corridor exposure (EUR at risk) (SYNTHETIC)', 'metric', async (id) => define(owner, id,
      { measure: 'measure_observations', unit: 'EUR', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: { measure_id: MSR }, effectiveFrom: EFF }), ['query']);
    const mc = (await regConsumer(analyst, P_MET, { purpose: 'procurement reads the corridor exposure each month', impact: 'the exposure is not reviewed when the metric breaks' })).consumer;
    await acceptConsumer(analyst, P_MET, String(mc['consumer_id']), 1);
    expect(await consumerUsage(P_MET, analyst.principalId)).toEqual({});
    const s1 = (await serve(analyst, 'b91-corridor-exposure', { view: 'analyst' })).serving;
    const u1 = await consumerUsage(P_MET, analyst.principalId);
    expect(u1).toMatchObject({ metric_servings: 1, metered_by: 'B91 §ME (0105)' });
    const pc = await usage('product_consumption', 'metric_serving');
    expect(pc).toHaveLength(1);
    expect(pc[0]).toMatchObject({ unit: 'servings', source_ref: String(s1['serving_id']), capability_key: 'advanced_integration' });
    expect(obj(pc[0]!['details'])).toMatchObject({ product_id: P_MET, consumer_principal_id: analyst.principalId, view: 'analyst' });
    // THE EVENT PRODUCT: the corridor warning stream, the analyst subscribed (authorized by the owner) and registered as its consumer
    await w.exec.publishAttentionPolicy(h.req(execOwner, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the corridor warnings routed to the forecast owner (B91 meters harness)', rules: { classes: {
      'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.4 }, route_roles: ['forecast_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 2, suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' } } } } as never });
    P_EVT = await releasedProduct('b91-corridor-' + 'warnings', 'Corridor warnings (SYNTHETIC)', 'event', async (id) => declareEvent(owner, id, EVENT_DECL), ['event']);
    const ec = (await regConsumer(analyst, P_EVT, { purpose: 'procurement reads the corridor warnings to re-route orders', impact: 'purchase orders are not re-routed when the stream breaks' })).consumer;
    await acceptConsumer(analyst, P_EVT, String(ec['consumer_id']), 1);
    SUB = String((await subscribe(analyst, { productId: P_EVT, purpose: 'procurement', granted: { fields: ['title', 'consequence_class', 'closes_at'], consequence: 'C2', from: null, to: null }, filters: {},
      schemaVersion: 'v1', lagPolicy: { max_lag_events: 2, max_lag_seconds: 86_400 }, handlesCorrections: true, handlesReplays: true })).subscription['subscription_id']);
    await authorize(owner, SUB);
    await raise(1, 'attack near Perim');
    await tick();
    const r1 = (await readEvents(analyst, SUB)).read;
    expect(r1['served']).toBe(1);
    expect(await consumerUsage(P_EVT, analyst.principalId)).toMatchObject({ subscription_reads: 1, events_served: 1 });
    // three more; the tick flags the subscription LAGGING (4 > 2 from checkpoint 0); the backlog served by the catch-up route
    await raise(3, 'convoy diverted');
    await tick();
    expect((await rows(sql`select state from products.event_subscriptions where subscription_id = ${SUB}::uuid`))[0]!['state']).toBe('lagging');
    const cu = (await catchUp(analyst, SUB, { limit: 2 })).catchup;
    expect(cu['served']).toBe(2);
    expect(await consumerUsage(P_EVT, analyst.principalId)).toMatchObject({ subscription_reads: 1, catch_ups: 1, events_served: 3 });
    const ev = await usage('product_consumption');
    expect(ev.filter((x) => x['source_kind'] === 'subscription_read').map((x) => Number(x['quantity']))).toEqual([1]);
    expect(ev.filter((x) => x['source_kind'] === 'catch_up').map((x) => Number(x['quantity']))).toEqual([2]);
    evidence('M4+', { metric: P_MET, serving: s1['serving_id'], event_product: P_EVT, subscription: SUB, counters: { metric: u1, event: await consumerUsage(P_EVT, analyst.principalId) } });
  }, 900_000);

  it('M4 · REFUSAL: a serving to a principal with no registration is metered and counts on no register row; a refused read counts nothing', async () => {
    const before = (await usage('product_consumption', 'metric_serving')).length;
    await serve(execOwner, 'b91-corridor-exposure', { view: 'analyst' });
    expect((await usage('product_consumption', 'metric_serving')).length).toBe(before + 1);
    expect((await rows(sql`select count(*)::int n from products.product_consumers where product_id = ${P_MET}::uuid and consumer_principal_id = ${execOwner.principalId}::uuid`))[0]!['n']).toBe(0);
    // the lagging subscription's ordinary read is refused (its state) — the refusal rolls back: nothing metered, nothing counted
    const reads = (await usage('product_consumption', 'subscription_read')).length;
    await refused(readEvents(analyst, SUB), /subscription rejected \(state\)/, 409);
    expect((await usage('product_consumption', 'subscription_read')).length).toBe(reads);
    expect(await consumerUsage(P_EVT, analyst.principalId)).toMatchObject({ subscription_reads: 1 });
  }, 120_000);

  it('M4 · RECOVERY: the second serving counts 2 (the counter accumulates; never reset)', async () => {
    await serve(analyst, 'b91-corridor-exposure', { view: 'analyst' });
    expect(await consumerUsage(P_MET, analyst.principalId)).toMatchObject({ metric_servings: 2 });
  }, 120_000);
});

describe('B91 meters · M3 enforcement at admission (simulation_compute: the experiment claim and the envelope sweep)', () => {
  it('M3 · POSITIVE: no simulation cap → the sweep runs and is metered; the experiment\'s first chunk metered; the STOP cap reached → the attention agent\'s next claim stops the experiment PARTIAL (tenant_cap), the completed chunk kept', async () => {
    // no cap on simulation_compute yet: the sweep runs as before and its wall ms is metered (the route measures, the port records)
    const s0 = (await sweep(w.controlId, { metric: 'total_cost', gridPoints: 5 })).sweep;
    const sw = await usage('simulation_compute', 'envelope_sweep');
    expect(sw).toHaveLength(1);
    expect(sw[0]).toMatchObject({ source_ref: String(s0['sweep_id']), unit: 'wall_ms' });
    expect(obj(sw[0]!['details'])).toMatchObject({ run_id: w.controlId, metric: 'total_cost', grid_points: 5, measured_by: 'the sweep route' });
    // THE EXPERIMENT (SYNTHETIC): 1,000 paths in chunks of 250, one chunk per tick, under the attention agent
    const d = (await declareExp({ title: 'Corridor closure — metered (SYNTHETIC)', question: 'How much compute does the corridor study take?',
      run: { twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90 },
      paths: 1000, chunkSize: 250, seed: 91, jitter: JITTER, measures: ['total_cost', 'line_stop_days'], budget: { max_paths: 1000, max_wall_seconds: 600, max_chunks: 12 } })).experiment;
    EXP = String(d['experiment_id']);
    await approveExp(EXP, String(d['budget_digest']));
    EXP_RUN = String((await startExp(EXP)).experiment['run_id']);
    const t1 = await tick();
    expect(t1.drain['error'], String(t1.drain['error'])).toBeUndefined();
    expect(obj((await readExp(EXP))['progress'])['chunks_done']).toBe(1);
    const chunks = await usage('simulation_compute', 'experiment_chunk');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!['source_ref']).toBe(`${EXP}:0:1`);
    expect(obj(chunks[0]!['details'])).toMatchObject({ experiment_id: EXP, chunk_index: 0, attempt: 1, paths: 250, outcome: 'done' });
    // THE CAP (the administrator, within the licence): stop at exactly what the tenant used today — reached now
    const used = await usedToday('simulation_compute', 'wall_ms');
    expect(used).toBeGreaterThan(0);
    const c = await setCap({ dimension: 'simulation_compute', period: 'day', limit: used, action: 'stop', reason: 'the corridor study stops at today\'s compute (SYNTHETIC)' });
    SIM_CAP = String(c['cap_id']);
    expect(c).toMatchObject({ action: 'stop', reached: true, remaining: 0, licence: { version: 1, limit: 100_000_000 } });
    expect(obj((await domainStatus('simulation_compute'))['stop'])).toMatchObject({ cap_id: SIM_CAP, reached: true });
    // the next tick: the claim refuses the next chunk — stop_pending partial (tenant_cap), the worker ends the run partial over the chunk done
    const t2 = await tick();
    expect(t2.drain['error'], String(t2.drain['error'])).toBeUndefined();
    const e = await readExp(EXP);
    expect(e['state']).toBe('partial');
    expect(obj(e['outcome'])).toMatchObject({ outcome: 'partial', reason: 'tenant_cap', completed_paths: 250, declared_paths: 1000 });
    const ev = await expEvents(EXP);
    const bx = ev.filter((x) => x['event'] === 'budget_exceeded');
    expect(bx).toHaveLength(1);
    expect(obj(bx[0]!['details'])).toMatchObject({ budget: 'tenant_cap', cap: { cap_id: SIM_CAP, action: 'stop', reached: true } });
    expect(ev.map((x) => x['event'])).toEqual(['declared', 'approved', 'started', 'run_opened', 'checkpointed', 'budget_exceeded', 'partial']);
    // NEVER DELETING WORK: the completed chunk stays done with its digest; the run is partial over its 250 paths
    const ck = await rows(sql`select chunk_index, state, digest from simulation.experiment_chunks where experiment_id = ${EXP}::uuid order by chunk_index`);
    expect(ck.map((x) => x['state'])).toEqual(['done', 'failed', 'failed', 'failed']);
    expect(String(ck[0]!['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const run = (await rows(sql`select state, partial from simulation.runs_current where run_id = ${EXP_RUN}::uuid`))[0]!;
    expect(run['state']).toBe('partial');
    expect(obj(run['partial'])).toMatchObject({ reason: 'tenant_cap', completed_paths: 250, declared_paths: 1000 });
    // the breach (refused, the experiment) and the notice
    const b = (await breaches(SIM_CAP)).filter((x) => x['kind'] === 'refused');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ action: 'stop', subject_kind: 'experiment', subject_id: EXP });
    const its = (await meterItems(SIM_CAP)).filter((x) => x['cause_event_type'] === 'usage.cap_refused');
    expect(its).toHaveLength(1);
    expect(its[0]).toMatchObject({ owner: tenantAdmin.principalId, state: 'open' });
    expect(String(its[0]!['title'])).toMatch(/^Usage cap stopped new work: simulation_compute .* the experiment was not continued/);
    evidence('M3+', { sweep: s0['sweep_id'], experiment: EXP, run: EXP_RUN, cap: SIM_CAP, used, breach: b[0]!['breach_id'] });
  }, 900_000);

  it('M3 · REFUSAL: the sweep route refuses `usage cap rejected (cap)` (409) before running — the breach recorded, no sweep written, nothing metered', async () => {
    const sweeps = (await rows(sql`select count(*)::int n from simulation.envelope_sweeps where run_id = ${w.controlId}::uuid`))[0]!['n'];
    const metered = (await usage('simulation_compute', 'envelope_sweep')).length;
    await refused(sweep(w.controlId, { metric: 'total_cost', gridPoints: 5 }), /^usage cap rejected \(cap\): the tenant's simulation_compute cap \(\d+ wall_ms per day, stop\) is reached — .* the sweep did not run/, 409);
    expect((await rows(sql`select count(*)::int n from simulation.envelope_sweeps where run_id = ${w.controlId}::uuid`))[0]!['n']).toBe(sweeps);
    expect((await usage('simulation_compute', 'envelope_sweep')).length).toBe(metered);
    const b = (await breaches(SIM_CAP)).filter((x) => x['subject_kind'] === 'envelope_sweep');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ kind: 'refused', action: 'stop' });
    expect(obj(b[0]!['details'])).toMatchObject({ run_id: w.controlId });
    // the breach port refuses when nothing is reached for that dimension (a breach is never recorded for admissible work): a source mismatch
    await refused(portAs(nakamura, 'simulation.sweep.run', sql`select commercial.record_cap_breach(${T()}::uuid, ${D()}::uuid, 'model_inference', 'envelope_sweep', null::uuid, '{}'::jsonb, ${nakamura.principalId}::uuid, ${uuidv7()}::uuid) as r`),
      /^usage cap rejected \(source\)/, 422);
    // the policy: an outsider never reaches the route
    await refused(sweep(w.controlId, {}, outsider), /./, 403);
  }, 300_000);

  it('M3 · RECOVERY: the administrator raises the cap (version 2) — the sweep runs again and is metered; the stopped experiment\'s work is still there', async () => {
    const used = await usedToday('simulation_compute', 'wall_ms');
    const c = await setCap({ dimension: 'simulation_compute', period: 'day', limit: used + 10_000_000, action: 'stop', reason: 'the corridor study resumes with a larger daily compute (SYNTHETIC)' });
    expect(c).toMatchObject({ cap_id: SIM_CAP, version: 2, reached: false });
    const before = (await usage('simulation_compute', 'envelope_sweep')).length;
    const s = (await sweep(w.controlId, { metric: 'line_stop_days', gridPoints: 5 })).sweep;
    const sw = await usage('simulation_compute', 'envelope_sweep');
    expect(sw.length).toBe(before + 1);
    expect(sw.at(-1)!['source_ref']).toBe(String(s['sweep_id']));
    expect((await rows(sql`select state from simulation.experiment_chunks where experiment_id = ${EXP}::uuid and chunk_index = 0`))[0]!['state']).toBe('done');
    // above the licence (100,000,000 ms) the cap is refused
    await refused(setCap({ dimension: 'simulation_compute', period: 'day', limit: 200_000_000, action: 'stop', reason: 'beyond the licence (SYNTHETIC)' }), /^usage cap rejected \(licence\)/, 422);
  }, 300_000);
});

describe('B91 meters · M5 the reads and the boundary', () => {
  it('M5 · POSITIVE: the administrator\'s tenant read — every dimension metered, the caps with their standing, the breaches, the licence; the auditor\'s; the domain read', async () => {
    const u = await tenantRead();
    const dims = new Set(arr(u['meters']).map((m) => `${String(m['dimension'])}/${String(m['unit'])}`));
    for (const k of ['model_inference/calls', 'source_consumption/requests', 'source_consumption/bytes', 'simulation_compute/wall_ms', 'storage/bytes', 'product_consumption/servings', 'product_consumption/events']) expect(dims.has(k), k).toBe(true);
    expect(arr(u['meters']).find((m) => m['dimension'] === 'model_inference')).toMatchObject({ today: 3, capability: 'model_portfolio' });
    expect(arr(u['caps']).map((c) => c['dimension']).sort()).toEqual(['model_inference', 'simulation_compute', 'source_consumption']);
    expect(arr(u['breaches']).map((b) => b['kind']).sort()).toEqual(['crossed', 'refused', 'refused']);
    expect(obj(u['licence'])).toMatchObject({ contracted: true, version: 1, package_key: 'b91-harness-package' });
    expect(arr(u['not_metered'])[0]).toMatch(/TOKENS: the gateway records none/);
    expect(arr(u['domains']).some((d) => d['domain_id'] === D())).toBe(true);
    expect(arr((await tenantRead(auditor))['meters']).length).toBe(arr(u['meters']).length);
    const dr = await domainRead();
    expect(arr(dr['meters']).length).toBe(arr(u['meters']).length);
    expect(dr['domains']).toBeNull();
  }, 120_000);

  it('M5 · REFUSAL: an outsider, a domain role on the tenant route, a domain reader of another domain on this one', async () => {
    await refused(tenantRead(outsider), /./, 403);
    await refused(tenantRead(dadmin), /./, 403);
    await refused(domainRead(elsewhere, D()), /./, 403);
  }, 120_000);

  it('M5 · RECOVERY (isolation): another domain\'s administrator reads its own domain — none of this domain\'s records, only the tenant\'s caps', async () => {
    const other = await domainRead(elsewhere, D2);
    expect(arr(other['records'])).toEqual([]);
    expect(arr(other['meters'])).toEqual([]);
    expect(arr(other['caps']).every((c) => c['scope'] === 'TENANT')).toBe(true);
    // the tenant's ledgers stand: nothing was deleted by any cap (the experiment, its run, the products and the subscription are all there)
    expect((await rows(sql`select count(*)::int n from simulation.experiments where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(1);
    expect((await rows(sql`select count(*)::int n from products.event_subscriptions where tenant_id = ${T()}::uuid`))[0]!['n']).toBe(1);
  }, 120_000);
});
