/**
 * CP-6 batch B1 — the `CorrectionApplied` CONSUMER through real Redis, the real outbox
 * publisher and the real database (migration 0060).
 *
 * The five properties the batch demonstrates, each on the shipping path:
 *   AUTOMATIC PROPAGATION — a correction applied through the route is published by the
 *     outbox tick, routed to the domain's propagation queue, walked by the registered
 *     propagation agent under its own session, and recorded by 0034's record_impact; the
 *     citing twin version goes UNVERIFIED with no operator act (AU-MEM-0108).
 *   DURABLE IDEMPOTENCY — a redelivery of the same event walks nothing twice; a process
 *     restart re-drives nothing for a finished event; a crash after the first root resumes
 *     from the checkpoint and walks only the second (AU-MEM-0109).
 *   FAILURE AND RETRY — an injected infrastructure fault is recorded on the attempt and
 *     the queue's bounded retry completes the walk; a revoked grant and a budget refusal
 *     are governance answers: recorded, not retried, the case visible with the reason, and
 *     the API process alive throughout (AU-MEM-0110).
 *   PARTIAL-WALK VISIBILITY — a chain longer than the traversal bound leaves the attempt
 *     and the case PARTIAL, the case stays listed with the truncation stated, a
 *     redelivery is a no-op, and the operator may re-walk (AU-DP-0043).
 *   THE GOVERNED PATH — the walker holds exactly `graph.impact.propagate`, its session
 *     port refuses a revoked grant, every new mutator port refuses without its
 *     capability, unrelated events are published untouched, a misrouted job fails closed,
 *     and the operator route is unchanged (AU-MEM-0111).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import pg from 'pg';
import { AppModule } from '../../src/app.module.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { SchedulerService, propagationQueueNameFor, redisName } from '../../src/observation/scheduling/scheduler.service.js';
import { PropagationConsumerService } from '../../src/graph/propagation/propagation-consumer.service.js';
import { PropagationAgentSessionService, PropagationGrantRefused } from '../../src/graph/propagation/propagation-agent-session.service.js';
import { PROPAGATION_WALKER } from '../../src/graph/strategy/impact.service.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import { RECORD_FILES, TERMS_CSV, observedInventory, observedShipments, assumedTerms } from './phase5-fixtures.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness;
let twins: TwinController; let graph: GraphController; let observation: ObservationController;
let scheduler: SchedulerService; let consumer: PropagationConsumerService;
let owner: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
let ownerId = ''; let twinId = ''; let v1 = 0;
let evdA: { id: string; version: number }; let evdB: { id: string; version: number };
let records: { inv: { id: string; version: number }; ship: { id: string; version: number }; terms: { id: string; version: number } };
let agent: { agentId: string; principalId: string };
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const elements = (shock: { id: string; version: number }) =>
  [...observedInventory(records.inv), ...observedShipments(records.ship, '2024-01-11', ['SYN-SHIP-4471', 'SYN-SHIP-4472']), ...assumedTerms(records.terms, shock)];

async function bind(app: Phase4Harness['app']): Promise<void> {
  const { TwinController: Tw } = await import('../../src/twin/twin.controller.js');
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  twins = app.get(Tw); graph = app.get(G); observation = app.get(O);
  scheduler = app.get(SchedulerService); consumer = app.get(PropagationConsumerService);
}

async function admitTwin(els: unknown[], branch: string): Promise<number> {
  const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: branch, knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements: els } });
  await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
  return o.version.version;
}

/** A correction of the given evidence, submitted and applied through the routes as the collection manager. */
async function applyCorrection(evdIds: string[], reason: string): Promise<string> {
  const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  const caseId = opened.correction.caseId;
  await observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId,
    { payload: { decision: 'apply', affectedEvdIds: evdIds, reason: `${reason}: verified against the publisher` } });
  return caseId;
}

type Attempt = { event_id: string; case_id: string; state: string; deliveries: number; attempts: number; agent_id: string | null; principal_id: string | null; roots: string[]; roots_walked: Array<{ root: string; invalidation_id: string; truncated: boolean }>; last_error: string | null };
const attemptsFor = async (caseId: string): Promise<Attempt[]> =>
  (await sql<Attempt>`select event_id::text, case_id::text, state, deliveries, attempts, agent_id::text, principal_id::text, roots, roots_walked, last_error
     from graph.propagation_attempts where case_id = ${caseId}::uuid order by last_delivered_at desc`.execute(h.su)).rows;
const attemptEvents = async (eventId: string): Promise<string[]> =>
  (await sql<{ event: string }>`select event from graph.propagation_attempt_events where outbox_event_id = ${eventId}::uuid order by occurred_at, event_id`.execute(h.su)).rows.map((r) => r.event);
const invalidationsFor = async (caseId: string) =>
  (await sql<{ invalidation_id: string; opened_by: string; trigger_kind: string; trigger_object_id: string; state: string; truncated: boolean }>`
     select invalidation_id::text, opened_by::text, trigger_kind, trigger_object_id::text, state, truncated from graph.invalidations_current where correction_case_id = ${caseId}::uuid order by opened_at`.execute(h.su)).rows;
const caseState = async (caseId: string) =>
  (await sql<{ state: string; propagation_state: string; propagation_unresolved: string }>`select state, propagation_state, propagation_unresolved from observation.correction_current where case_id = ${caseId}::uuid`.execute(h.su)).rows[0];
const outboxRow = async (caseId: string, eventType: string) =>
  (await sql<{ id: string; status: string; payload: Record<string, unknown> }>`select id::text, status, payload from objects.object_outbox where event_type = ${eventType} and payload ->> 'case_id' = ${caseId} order by created_at desc limit 1`.execute(h.su)).rows[0];
const awaiting = async (as = owner) => graph.awaitingPropagation(h.req(as, 'graph.read', 'COR', null, 'graph'), T(), D(), { payload: { limit: 200 } }) as Promise<{ awaiting: Array<Record<string, unknown> & { case_id: string; propagation_status: string; automatic: { state: string; last_error: string | null; deliveries: number } | null }>; total: number; note: string }>;
const statusOf = () => graph.propagationStatus(h.req(owner, 'graph.read', 'AGT', null, 'graph'), T(), D()) as Promise<{ propagation: { walker: { version: string; codeDigest: string }; agents: Array<Record<string, unknown>>; attempts: Array<Record<string, unknown>>; runtime: { worker_running: boolean; scheduler_enabled: boolean } } }>;
const register = (as: AuthenticatedPrincipal, payload: Record<string, unknown>) =>
  graph.registerPropagationAgent(h.req(as, 'graph.propagation.agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: { agentId: string; principalId: string; role: string; walker: { version: string; codeDigest: string } }; served: { workerRunning: boolean; reDriven: number } }>;
const revoke = (as: AuthenticatedPrincipal, agentId: string, reason: string) =>
  graph.revokePropagationAgent(h.req(as, 'graph.propagation.agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason } });

/** Wait until the predicate holds, polling; the failure names what was seen last. */
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 45_000): Promise<X> {
  const until = Date.now() + ms;
  let last: X | undefined;
  for (;;) {
    last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 600)}; consumer: ${JSON.stringify(consumer.lastFailureSeen())}; recent: ${JSON.stringify(consumer.recentDeliveries().slice(0, 3))}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await scheduler.propagationQueueCountsForTests(T(), D());
    if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
    if (Date.now() > until) throw new Error(`propagation queue did not settle: ${JSON.stringify(c)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  try { await p; return { status: null, code: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), code: null, message: String((e.getResponse() as { message?: string }).message ?? '') };
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message };
  }
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await bind(h.app);
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'simulation_operator'], 'twin-owner');
  manager = await h.principalWith(['collection_manager'], 'collection-manager');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  ownerId = owner.principalId;
  await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const evds = (await sql<{ id: string; version: number }>`select object_id::text id, object_version::int version from objects.canonical_objects
    where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at`.execute(h.su)).rows;
  evdA = evds[0] as typeof evdA;
  const up = await h.upload([...RECORD_FILES(), { filename: 'routes-and-terms-2024Q1-restated.csv', text: TERMS_CSV.replace('assumption', 'assumption (restated)'), documentTime: '2024-01-11T00:00:00Z' }]);
  records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  evdB = up[3] as typeof evdB;
  const entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [entityId], owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  v1 = await admitTwin(elements(evdB), 'actual');
}, 300_000);

afterAll(async () => {
  try { await scheduler.obliteratePropagationsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
});

describe('B1 · the propagation agent is a registered, revocable grant; the walker holds one decision', () => {
  it('registration is the tenant administrator\'s: the principal is created on the identity authority with the propagation_agent role, the grant on the commit authority, and the domain is served', async () => {
    expect((await failure(register(owner, { ownerPrincipalId: ownerId }))).status).toBe(403);
    expect((await failure(register(await h.humanWithSession(['domain_admin'], 'domain-admin'), { ownerPrincipalId: ownerId }))).status).toBe(403);
    expect((await failure(register(tenantAdmin, {}))).status).toBe(400);
    const r = await register(tenantAdmin, { ownerPrincipalId: ownerId });
    agent = r.agent;
    expect(r.agent.role).toBe('propagation_agent');
    expect(r.agent.walker).toEqual({ name: 'graph.propagation', version: PROPAGATION_WALKER.version, codeDigest: PROPAGATION_WALKER.codeDigest });
    expect(r.served.workerRunning, 'the domain queue is served from registration').toBe(true);
    expect(r.served.reDriven).toBe(0);
    const p = (await sql<{ kind: string; status: string; roles: string[] }>`select p.kind, p.status, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
      where p.id = ${agent.principalId}::uuid group by p.id`.execute(h.su)).rows[0];
    expect(p).toEqual({ kind: 'agent', status: 'active', roles: ['propagation_agent'] });
    const a = (await sql<{ status: string; agent_version: string; code_digest: string; budgets: Record<string, unknown> }>`select status, agent_version, code_digest, budgets from graph.propagation_agents where agent_id = ${agent.agentId}::uuid`.execute(h.su)).rows[0];
    expect(a?.status).toBe('active');
    expect(a?.code_digest).toBe(PROPAGATION_WALKER.codeDigest);
    expect(a?.budgets).toEqual({ max_roots_per_event: 64, max_elapsed_ms: 600_000, backlog_policy: 'leave' });
    expect(scheduler.runningWorkers()).toContain(redisName(propagationQueueNameFor(T(), D())));
    // One active agent per domain.
    const second = await failure(register(tenantAdmin, { ownerPrincipalId: ownerId }));
    expect(second.code).toBe('23505');
    const s = await statusOf();
    expect(s.propagation.agents.map((x) => x['status'])).toEqual(['active']);
    expect(s.propagation.runtime).toMatchObject({ worker_running: true, scheduler_enabled: true });
  }, 60_000);

  it('the agent session is the registry\'s: a foreign agent id, a wrong domain or a mismatched walker opens no session', async () => {
    const sessions = h.app.get(PropagationAgentSessionService);
    const ok = await sessions.openRunSession({ agentId: agent.agentId, tenantId: T(), domainId: D(), correlationId: uuidv7() });
    expect(ok.principalId).toBe(agent.principalId);
    expect(ok.kind).toBe('agent');
    await expect(sessions.openRunSession({ agentId: uuidv7(), tenantId: T(), domainId: D(), correlationId: uuidv7() })).rejects.toBeInstanceOf(PropagationGrantRefused);
    await expect(sessions.openRunSession({ agentId: agent.agentId, tenantId: T(), domainId: uuidv7(), correlationId: uuidv7() })).rejects.toBeInstanceOf(PropagationGrantRefused);
    // The walker's identity is checked by the port: a drifted digest is refused at the database.
    const identityDb = h.app.get<import('../../src/shared/db.js').Db>((await import('../../src/shared/shared.module.js')).IDENTITY_DB);
    const drift = await failure(identityDb.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op('identity.session.create', null::uuid, ${uuidv7()}::uuid, 60)`.execute(tx);
      await sql`select graph.propagation_agent_session_open(${uuidv7()}::uuid, ${agent.agentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${PROPAGATION_WALKER.version}, ${'f'.repeat(64)}, 'x', 'y', ${new Date(Date.now() + 60_000)}, ${uuidv7()}::uuid)`.execute(tx);
    }));
    expect(drift.code).toBe('42501');
    expect(drift.message).toMatch(/does not match the registration/);
  });
});

describe('B1 · automatic propagation, durable idempotency, failure and retry, partial walks, the governed path', () => {
  let caseId = ''; let eventId = '';

  it('AUTOMATIC: a correction applied through the route is walked by the agent with no operator act; the citing twin version goes UNVERIFIED; the impact names the agent (AU-MEM-0108)', async () => {
    const before = (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v1}`.execute(h.su)).rows[0];
    expect(before?.verification_state).toBe('verified');
    caseId = await applyCorrection([evdB.id], 'restated terms');
    // The real outbox tick publishes and routes the apply event.
    const row = await waitFor('the CorrectionApplied row published', () => outboxRow(caseId, 'CorrectionApplied'), (r) => r !== undefined && r.status === 'published');
    eventId = row.id;
    expect(row.payload['applied_by']).toBe(manager.principalId);
    const a = await waitFor('the automatic walk', () => attemptsFor(caseId), (rows) => rows[0]?.state === 'complete');
    expect(a.length).toBe(1);
    expect(a[0]).toMatchObject({ event_id: eventId, state: 'complete', deliveries: 1, attempts: 1, agent_id: agent.agentId, principal_id: agent.principalId, last_error: null });
    expect(a[0]?.roots).toEqual([evdB.id]);
    expect(a[0]?.roots_walked.length).toBe(1);
    const inv = await invalidationsFor(caseId);
    expect(inv.length).toBe(1);
    expect(inv[0]).toMatchObject({ opened_by: agent.principalId, trigger_kind: 'evidence_correction', trigger_object_id: evdB.id, state: 'assessed', truncated: false });
    expect(a[0]?.roots_walked[0]?.invalidation_id).toBe(inv[0]?.invalidation_id);
    expect((await caseState(caseId))?.propagation_state).toBe('complete');
    const v = (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v1}`.execute(h.su)).rows[0];
    expect(v?.verification_state, 'the citing version was not marked by the automatic walk').toBe('unverified');
    const ev = (await sql<{ details: Record<string, unknown> }>`select details from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows;
    expect(ev.length).toBe(1);
    expect(String(ev[0]?.details['invalidation_id'])).toBe(inv[0]?.invalidation_id);
    // The walk's own outbox event says who walked, and that it was automatic.
    const dep = (await sql<{ payload: Record<string, unknown> }>`select payload from objects.object_outbox where event_type = 'DependencyInvalidated' and payload ->> 'invalidation_id' = ${inv[0]?.invalidation_id ?? ''}`.execute(h.su)).rows[0];
    expect(dep?.payload).toMatchObject({ automatic: true, event_id: eventId, agent_id: agent.agentId, code_digest: PROPAGATION_WALKER.codeDigest });
    // The case is no longer awaiting; the twin no longer shows it pending.
    expect((await awaiting()).awaiting.map((c) => c.case_id)).not.toContain(caseId);
    const t = await twins.get(h.req(owner, 'twin.read', 'TWN', twinId), T(), D(), twinId) as { twin: { propagation_pending: Array<{ case_id: string }> } };
    expect(t.twin.propagation_pending.map((p) => p.case_id)).not.toContain(caseId);
    expect(await attemptEvents(eventId)).toEqual(['received', 'walking', 'root.walked', 'complete']);
    // The session followed the walk: opened for the agent, extended once per committed root.
    const sessions = (await sql<{ event_type: string }>`select event_type from audit.audit_events where actor = ${`principal:${agent.principalId}`}
      and event_type in ('identity.agent_session_opened', 'identity.agent_session_extended') order by partition_id, audit_seq`.execute(h.su)).rows.map((r) => r.event_type);
    expect(sessions).toContain('identity.agent_session_opened');
    expect(sessions).toContain('identity.agent_session_extended');
  }, 120_000);

  it('REDELIVERY: the same event delivered again walks nothing twice (AU-MEM-0109)', async () => {
    await settle();
    const re = await scheduler.enqueuePropagation(T(), D(), { event_id: eventId, event_type: 'CorrectionApplied', payload: { case_id: caseId }, correlation_id: uuidv7(), causation_id: uuidv7(), tenant_id: T(), domain_id: D() });
    expect(re).toEqual({ jobId: eventId, added: true, inFlight: null });
    const a = await waitFor('the redelivery received', () => attemptsFor(caseId), (rows) => (rows[0]?.deliveries ?? 0) >= 2);
    await settle();
    expect(a[0]).toMatchObject({ state: 'complete', deliveries: 2, attempts: 1 });
    expect((await invalidationsFor(caseId)).length).toBe(1);
    expect(Number((await sql<{ n: string }>`select count(*)::text n from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows[0]?.n)).toBe(1);
    expect(await attemptEvents(eventId)).toEqual(['received', 'walking', 'root.walked', 'complete', 'received']);
  }, 60_000);

  it('RESTART: the queue is lost and the process restarts; the domain is served again and the finished event is not re-driven (AU-MEM-0109)', async () => {
    await scheduler.obliteratePropagationsForTests(T(), D());
    await h.app.close();
    h.app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    h.pipeline = h.app.get((await import('../../src/pipeline/pipeline.service.js')).PipelineService);
    await bind(h.app);
    const report = consumer.lastReconciliation();
    expect(report, `startup reconciliation did not run: ${JSON.stringify(consumer.lastFailureSeen())}`).not.toBeNull();
    expect(report?.domains.some((d) => d.tenantId === T() && d.domainId === D() && d.agentId === agent.agentId)).toBe(true);
    expect(report?.reDriven.filter((e) => e.tenantId === T() && e.domainId === D())).toEqual([]);
    expect(scheduler.runningWorkers()).toContain(redisName(propagationQueueNameFor(T(), D())));
    expect((await attemptsFor(caseId))[0]).toMatchObject({ state: 'complete', deliveries: 2, attempts: 1 });
    expect((await invalidationsFor(caseId)).length).toBe(1);
  }, 180_000);

  it('CRASH MID-CASE: a two-root correction interrupted after its first root resumes from the checkpoint on the retry and walks only the second (AU-MEM-0109)', async () => {
    const up = await h.upload([
      { filename: 'terms-c.csv', text: TERMS_CSV.replace('assumption', 'assumption (c)'), documentTime: '2024-01-12T00:00:00Z' },
      { filename: 'terms-d.csv', text: TERMS_CSV.replace('assumption', 'assumption (d)'), documentTime: '2024-01-12T00:00:00Z' },
    ]);
    const evdC = up[0] as { id: string; version: number }; const evdD = up[1] as { id: string; version: number };
    await admitTwin([...elements(evdC), { key: 'terms.freight-d', kind: 'assumed', value: 1, unit: 'x', citations: [{ kind: 'evidence', id: evdD.id, version: evdD.version }] }], 'two-roots');
    consumer.armFaultForTests('after_first_root');
    const c2 = await applyCorrection([evdC.id, evdD.id], 'two documents restated');
    const a = await waitFor('the two-root walk completed after the retry', () => attemptsFor(c2), (rows) => rows[0]?.state === 'complete', 90_000);
    await settle();
    expect(a[0]).toMatchObject({ state: 'complete', deliveries: 2, attempts: 2 });
    expect(a[0]?.roots.length).toBe(2);
    expect(a[0]?.roots_walked.length).toBe(2);
    const inv = await invalidationsFor(c2);
    expect(inv.length, 'a root was walked twice across the crash').toBe(2);
    expect(new Set(inv.map((i) => i.trigger_object_id))).toEqual(new Set([evdC.id, evdD.id]));
    expect((await caseState(c2))?.propagation_state).toBe('complete');
    expect(await attemptEvents(a[0]?.event_id ?? '')).toEqual(['received', 'walking', 'root.walked', 'failed', 'received', 'walking', 'root.walked', 'complete']);
    const job = await scheduler.propagationJobStateForTests(T(), D(), a[0]?.event_id ?? '');
    expect(job?.attemptsMade).toBe(2);
  }, 180_000);

  /**
   * A REAL INTERRUPTION (Codex, 2026-09-12): the process stops dead — it records no failure, it acknowledges nothing —
   * and Redis is lost with it. What the handler had committed stays committed; the attempt is stranded in
   * 'received' or 'walking'. 0060's reconciliation re-drove only missing or failed attempts, so such an event was
   * never walked again. 0062 re-drives every non-terminal attempt at the next start.
   */
  const twinEventCount = async () => Number((await sql<{ n: string }>`select count(*)::text n from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows[0]?.n);
  const interruptedThenRestarted = async (label: string, fault: 'interrupt_after_receipt' | 'interrupt_after_first_root', evdIds: string[], reason: string) => {
    const twinEventsBefore = await twinEventCount();
    consumer.armFaultForTests(fault);
    const c = await applyCorrection(evdIds, reason);
    // The handler has stopped at the fault point: an attempt exists and no finish was ever recorded.
    const stranded = await waitFor(`${label}: the attempt received`, () => attemptsFor(c), (rows) => rows.length === 1 && (fault === 'interrupt_after_receipt' ? rows[0]?.state === 'received' : rows[0]?.roots_walked.length === 1), 60_000);
    await new Promise((r) => setTimeout(r, 1500)); // nothing more happens: the process is "dead" at this point
    const before = { attempt: (await attemptsFor(c))[0] as Attempt, invalidations: (await invalidationsFor(c)).length, events: await attemptEvents(stranded[0]?.event_id ?? ''),
      twinEvents: twinEventsBefore };
    expect(before.attempt.state).toBe(fault === 'interrupt_after_receipt' ? 'received' : 'walking');
    expect(before.events).not.toContain('failed');
    expect(before.events).not.toContain('complete');
    // The interruption: the worker abandoned without acknowledgement, the queue lost, the process restarted.
    expect(await scheduler.abandonPropagationWorkerForTests(T(), D())).toBe(true);
    await scheduler.obliteratePropagationsForTests(T(), D());
    expect(await scheduler.propagationJobStateForTests(T(), D(), before.attempt.event_id), 'the queue still holds the job after the loss').toBeNull();
    await h.app.close();
    h.app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    h.pipeline = h.app.get((await import('../../src/pipeline/pipeline.service.js')).PipelineService);
    await bind(h.app);
    const report = consumer.lastReconciliation();
    expect(report, `startup reconciliation did not run: ${JSON.stringify(consumer.lastFailureSeen())}`).not.toBeNull();
    const reDriven = report?.reDriven.find((e) => e.eventId === before.attempt.event_id);
    expect(reDriven, `the stranded event was not re-driven: ${JSON.stringify(report?.reDriven)}`).toBeDefined();
    expect(reDriven?.previous).toBe(before.attempt.state);
    const after = await waitFor(`${label}: the walk resumed and completed`, () => attemptsFor(c), (rows) => rows[0]?.state === 'complete', 90_000);
    await settle();
    return { c, before, after: after[0] as Attempt, events: await attemptEvents(before.attempt.event_id), invalidations: await invalidationsFor(c),
      twinEvents: await twinEventCount() };
  };

  it('INTERRUPTED AFTER RECEIPT, queue lost, process restarted: the stranded attempt is re-driven and every root walked once (AU-MEM-0109)', async () => {
    const up = await h.upload([{ filename: 'terms-j.csv', text: TERMS_CSV.replace('assumption', 'assumption (j)'), documentTime: '2024-01-18T00:00:00Z' }]);
    await admitTwin([...elements(evdB), { key: 'terms.freight-j', kind: 'assumed', value: 1, unit: 'x', citations: [{ kind: 'evidence', id: (up[0] as { id: string }).id, version: (up[0] as { version: number }).version }] }], 'interrupt-j');
    const r = await interruptedThenRestarted('after receipt', 'interrupt_after_receipt', [(up[0] as { id: string }).id], 'document j restated; the process dies after receipt');
    expect(r.before.attempt).toMatchObject({ state: 'received', deliveries: 1, attempts: 0 });
    expect(r.before.invalidations).toBe(0);
    expect(r.after).toMatchObject({ state: 'complete', deliveries: 2, attempts: 1 });
    expect(r.after.roots_walked.length).toBe(1);
    expect(r.invalidations.length, 'the root was walked more than once').toBe(1);
    expect(r.events).toEqual(['received', 'received', 'walking', 'root.walked', 'complete']);
    expect(r.twinEvents - r.before.twinEvents, 'twin events were duplicated').toBe(1);
    expect((await caseState(r.c))?.propagation_state).toBe('complete');
  }, 240_000);

  it('INTERRUPTED AFTER THE FIRST COMMITTED ROOT, queue lost, process restarted: the walk resumes at the second root; no duplicate impact or twin event (AU-MEM-0109)', async () => {
    const up = await h.upload([
      { filename: 'terms-k.csv', text: TERMS_CSV.replace('assumption', 'assumption (k)'), documentTime: '2024-01-19T00:00:00Z' },
      { filename: 'terms-l.csv', text: TERMS_CSV.replace('assumption', 'assumption (l)'), documentTime: '2024-01-19T00:00:00Z' },
    ]);
    const evdK = up[0] as { id: string; version: number }; const evdL = up[1] as { id: string; version: number };
    await admitTwin([...elements(evdK), { key: 'terms.freight-l', kind: 'assumed', value: 1, unit: 'x', citations: [{ kind: 'evidence', id: evdL.id, version: evdL.version }] }], 'interrupt-kl');
    const r = await interruptedThenRestarted('after the first root', 'interrupt_after_first_root', [evdK.id, evdL.id], 'documents k and l restated; the process dies after the first root');
    expect(r.before.attempt).toMatchObject({ state: 'walking', deliveries: 1, attempts: 1 });
    expect(r.before.attempt.roots_walked.length).toBe(1);
    expect(r.before.invalidations, 'the first root committed before the interruption').toBe(1);
    expect(r.after).toMatchObject({ state: 'complete', deliveries: 2, attempts: 2 });
    expect(r.after.roots_walked.length).toBe(2);
    expect(r.invalidations.length, 'a root was walked twice across the interruption').toBe(2);
    expect(new Set(r.invalidations.map((i) => i.trigger_object_id))).toEqual(new Set([evdK.id, evdL.id]));
    expect(r.events).toEqual(['received', 'walking', 'root.walked', 'received', 'walking', 'root.walked', 'complete']);
    // The one version citing documents k and l was marked by the first root (before the interruption) and NOT again by the second.
    expect(r.twinEvents - r.before.twinEvents, 'twin events were duplicated').toBe(1);
    expect((await caseState(r.c))?.propagation_state).toBe('complete');
  }, 240_000);

  it('NO CONFLICT WITH A LIVE WORKER: a reconciliation run while a walk is in flight leaves its job alone; the walk completes once', async () => {
    const up = await h.upload([{ filename: 'terms-m.csv', text: TERMS_CSV.replace('assumption', 'assumption (m)'), documentTime: '2024-01-20T00:00:00Z' }]);
    const evdM = up[0] as { id: string; version: number };
    await admitTwin([...elements(evdB), { key: 'terms.freight-m', kind: 'assumed', value: 1, unit: 'x', citations: [{ kind: 'evidence', id: evdM.id, version: evdM.version }] }], 'live-m');
    consumer.armFaultForTests('slow_before_root');
    const c = await applyCorrection([evdM.id], 'document m restated; the walk is slow');
    const live = await waitFor('the attempt received by the live worker', () => attemptsFor(c), (rows) => rows[0]?.state === 'received', 60_000);
    const eventId = live[0]?.event_id ?? '';
    // While the worker holds the job (active), a reconciliation finds the non-terminal attempt and leaves it to the worker.
    const report = await consumer.reconcile('control: reconciliation against a live worker');
    expect(report.reDriven.map((e) => e.eventId)).not.toContain(eventId);
    expect(report.inFlight.find((e) => e.eventId === eventId)).toMatchObject({ previous: 'received', jobState: 'active' });
    const done = await waitFor('the live walk completed', () => attemptsFor(c), (rows) => rows[0]?.state === 'complete', 90_000);
    await settle();
    expect(done[0]).toMatchObject({ deliveries: 1, attempts: 1 });
    expect((await invalidationsFor(c)).length).toBe(1);
    expect(await attemptEvents(eventId)).toEqual(['received', 'walking', 'root.walked', 'complete']);
  }, 180_000);

  it('TRANSIENT FAULT: an infrastructure fault before any root is recorded, retried by the queue and completed; the process is alive (AU-MEM-0110)', async () => {
    const up = await h.upload([{ filename: 'terms-e.csv', text: TERMS_CSV.replace('assumption', 'assumption (e)'), documentTime: '2024-01-13T00:00:00Z' }]);
    const evdE = up[0] as { id: string; version: number };
    consumer.armFaultForTests('before_root');
    const c3 = await applyCorrection([evdE.id], 'document e restated');
    const a = await waitFor('the walk after the fault', () => attemptsFor(c3), (rows) => rows[0]?.state === 'complete', 90_000);
    await settle();
    expect(a[0]).toMatchObject({ state: 'complete', deliveries: 2, attempts: 1 });
    expect(await attemptEvents(a[0]?.event_id ?? '')).toEqual(['received', 'failed', 'received', 'walking', 'root.walked', 'complete']);
    const first = consumer.recentDeliveries().find((d) => d.caseId === c3 && d.outcome === 'failed');
    expect(first?.reason).toMatch(/^fault: injected infrastructure fault/);
    expect((await invalidationsFor(c3)).length).toBe(1);
    // The failure was never fatal: the same process answers the next request.
    expect((await statusOf()).propagation.runtime.worker_running).toBe(true);
  }, 180_000);

  it('PARTIAL WALK: a chain past the traversal bound leaves the attempt and the case PARTIAL and VISIBLE; a redelivery is a no-op; the operator may re-walk (AU-DP-0043)', async () => {
    const up = await h.upload([{ filename: 'chain-root.csv', text: 'synthetic,record_id,kind,key,component_id,value,unit,note\ntrue,SYN-CH-1,assumption,chain,SYN-PART-MAG,1,x,root\n', documentTime: '2024-01-14T00:00:00Z' }]);
    const root = up[0] as { id: string; version: number };
    const trigger = uuidv7();
    await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
        confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${trigger}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${root.id}::uuid, ${sha256(root.id)}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const ids = Array.from({ length: 12 }, () => uuidv7());
    for (let i = 0; i < ids.length; i += 1) {
      await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
        values (${ids[i]}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'ASU', 1, ${`chain ${i}`}, 'a link in a long chain', 'active', 'verified', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    }
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${ids[0]}::uuid, 'ASU', 'claim', ${trigger}::uuid, 'the first link rests on the changed claim', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    for (let i = 1; i < ids.length; i += 1) {
      await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${ids[i]}::uuid, 'ASU', 'strategy', ${ids[i - 1]}::uuid, 'each link rests on the one before it', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    }
    const c4 = await applyCorrection([root.id], 'the chain root restated');
    const a = await waitFor('the truncated walk', () => attemptsFor(c4), (rows) => rows[0]?.state === 'partial', 90_000);
    await settle();
    expect(a[0]).toMatchObject({ state: 'partial', deliveries: 1, attempts: 1 });
    expect(a[0]?.roots_walked[0]?.truncated).toBe(true);
    expect(a[0]?.last_error).toMatch(/truncated|uncovered/);
    const inv = await invalidationsFor(c4);
    expect(inv.length).toBe(1);
    expect(inv[0]?.truncated).toBe(true);
    expect((await caseState(c4))?.propagation_state).toBe('partial');
    const listed = (await awaiting()).awaiting.find((c) => c.case_id === c4);
    expect(listed, 'a partially propagated case left the awaiting queue').toBeDefined();
    expect(listed?.propagation_status).toMatch(/traversal bound|truncated/);
    expect(listed?.automatic).toMatchObject({ state: 'partial', deliveries: 1 });
    // A redelivery reopens nothing.
    await scheduler.enqueuePropagation(T(), D(), { event_id: a[0]?.event_id ?? '', event_type: 'CorrectionApplied', payload: { case_id: c4 }, correlation_id: uuidv7(), causation_id: uuidv7(), tenant_id: T(), domain_id: D() });
    const again = await waitFor('the redelivery received', () => attemptsFor(c4), (rows) => (rows[0]?.deliveries ?? 0) >= 2);
    await settle();
    expect(again[0]).toMatchObject({ state: 'partial', deliveries: 2, attempts: 1 });
    expect((await invalidationsFor(c4)).length).toBe(1);
    // The operator route is unchanged and may re-walk the same root.
    const out = await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', root.id, 'graph'), T(), D(), { payload: { triggerKind: 'evidence_correction', triggerObjectId: root.id, correctionCaseId: c4 } }) as { impact: { invalidationId: string; truncated: boolean } };
    expect(out.impact.truncated).toBe(true);
    expect((await invalidationsFor(c4)).length).toBe(2);
  }, 180_000);

  it('UNRELATED EVENTS are published untouched: a submission alone and an entity write add nothing to the propagation queue', async () => {
    await settle();
    const counts0 = await scheduler.propagationQueueCountsForTests(T(), D());
    const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
      { payload: { sourceId: await h.uploadSource(), kind: 'correction', channel: 'operator re-upload', publisherRef: 'fixture submitted only', reason: 'a submission that is not applied', affectedEvdIds: [evdA.id] } }) as { correction: { caseId: string } };
    const resolver = await h.principalWith(['resolution_manager'], 'resolution-manager');
    await graph.registerSystem(h.req(resolver, 'graph.entity.create', 'IDS', null, 'graph'), T(), D(), { payload: { systemKey: `fixture-ids-${uuidv7().slice(-6)}`, authority: 'the fixture registry', isAuthoritative: false } });
    const received = await waitFor('the CorrectionReceived row published', () => outboxRow(opened.correction.caseId, 'CorrectionReceived'), (r) => r !== undefined && r.status === 'published');
    expect(received.status).toBe('published');
    await new Promise((r) => setTimeout(r, 1500));
    const counts1 = await scheduler.propagationQueueCountsForTests(T(), D());
    expect(counts1.completed + counts1.failed + counts1.waiting + counts1.active).toBe(counts0.completed + counts0.failed + counts0.waiting + counts0.active);
    expect((await attemptsFor(opened.correction.caseId)).length).toBe(0);
  }, 60_000);

  it('SCOPE FAILS CLOSED: a job on this domain\'s queue naming another domain is refused unrecoverably and records nothing', async () => {
    await settle();
    const stray = uuidv7();
    await scheduler.addPropagationJobForTests(T(), D(), { event_id: stray, event_type: 'CorrectionApplied', payload: { case_id: caseId }, correlation_id: uuidv7(), causation_id: uuidv7(), tenant_id: T(), domain_id: uuidv7() });
    await waitFor('the stray job settled', () => scheduler.propagationJobStateForTests(T(), D(), stray), (j) => j?.state === 'failed');
    // Unrecoverable: it stays failed and is never retried (BullMQ's attemptsMade counter reads 0 or 1 for an unrecoverable
    // failure and its failedReason lands a moment after the state, depending on when the job hash is read; the retry
    // budget of 5 is what must NOT have been spent).
    const later = await waitFor('the failure reason recorded', () => scheduler.propagationJobStateForTests(T(), D(), stray), (j) => j?.state === 'failed' && typeof j.failedReason === 'string' && j.failedReason.length > 0);
    expect(later?.failedReason ?? '').toMatch(/does not match the queue/);
    await new Promise((r) => setTimeout(r, 2500));
    const still = await scheduler.propagationJobStateForTests(T(), D(), stray);
    expect(still?.state).toBe('failed');
    expect(still?.attemptsMade ?? 0).toBeLessThanOrEqual(1);
    expect((await sql<{ n: string }>`select count(*)::text n from graph.propagation_attempts where event_id = ${stray}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
  }, 60_000);

  it('BUDGET: a case with more corrected objects than the grant allows is refused honestly, not retried, visible, and completed by the operator', async () => {
    await revoke(tenantAdmin, agent.agentId, 'replaced by a narrower grant for the budget case');
    const narrow = await register(tenantAdmin, { ownerPrincipalId: ownerId, budgets: { max_roots_per_event: 1 } });
    const up = await h.upload([
      { filename: 'terms-f.csv', text: TERMS_CSV.replace('assumption', 'assumption (f)'), documentTime: '2024-01-15T00:00:00Z' },
      { filename: 'terms-g.csv', text: TERMS_CSV.replace('assumption', 'assumption (g)'), documentTime: '2024-01-15T00:00:00Z' },
    ]);
    const f = up[0] as { id: string }; const g = up[1] as { id: string };
    const c5 = await applyCorrection([f.id, g.id], 'two documents beyond the budget');
    const a = await waitFor('the budget refusal', () => attemptsFor(c5), (rows) => rows[0]?.state === 'failed', 60_000);
    await settle();
    expect(a[0]?.last_error).toMatch(/max_roots_per_event 1/);
    expect(a[0]).toMatchObject({ attempts: 0, deliveries: 1, agent_id: narrow.agent.agentId });
    const job = await scheduler.propagationJobStateForTests(T(), D(), a[0]?.event_id ?? '');
    expect(job, 'a governance refusal is not retried').toMatchObject({ state: 'completed', attemptsMade: 1 });
    expect((await invalidationsFor(c5)).length).toBe(0);
    const listed = (await awaiting()).awaiting.find((c) => c.case_id === c5);
    expect(listed?.automatic).toMatchObject({ state: 'failed' });
    expect(listed?.propagation_status).toMatch(/automatic propagation failed: budget/);
    for (const r of [f.id, g.id]) await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', r, 'graph'), T(), D(), { payload: { triggerKind: 'evidence_correction', triggerObjectId: r, correctionCaseId: c5 } });
    expect((await caseState(c5))?.propagation_state).toBe('complete');
    expect((await awaiting()).awaiting.map((c) => c.case_id)).not.toContain(c5);
    await revoke(tenantAdmin, narrow.agent.agentId, 'the budget case is done; the standard grant returns');
    agent = (await register(tenantAdmin, { ownerPrincipalId: ownerId })).agent;
  }, 120_000);

  it('REVOKED GRANT: automatic walks stop, the case stays visible with the reason, the operator route still works, and a later registration re-drives nothing for a completed case (AU-MEM-0110/0111)', async () => {
    await revoke(tenantAdmin, agent.agentId, 'revoked for the revocation case');
    const sessions = h.app.get(PropagationAgentSessionService);
    await expect(sessions.openRunSession({ agentId: agent.agentId, tenantId: T(), domainId: D(), correlationId: uuidv7() })).rejects.toBeInstanceOf(PropagationGrantRefused);
    const up = await h.upload([{ filename: 'terms-h.csv', text: TERMS_CSV.replace('assumption', 'assumption (h)'), documentTime: '2024-01-16T00:00:00Z' }]);
    const evdH = up[0] as { id: string };
    const c6 = await applyCorrection([evdH.id], 'document h restated under no grant');
    const a = await waitFor('the refusal recorded', () => attemptsFor(c6), (rows) => rows[0]?.state === 'failed', 60_000);
    await settle();
    expect(a[0]?.last_error).toMatch(/no active propagation agent/);
    expect(a[0]?.attempts).toBe(0);
    expect((await invalidationsFor(c6)).length).toBe(0);
    const listed = (await awaiting()).awaiting.find((c) => c.case_id === c6);
    expect(listed?.automatic).toMatchObject({ state: 'failed' });
    expect(listed?.propagation_status).toMatch(/no active propagation agent/);
    expect(listed?.propagation_status).toMatch(/operator-initiated propagation remains available/);
    // The operator route is untouched and completes the case.
    await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', evdH.id, 'graph'), T(), D(), { payload: { triggerKind: 'evidence_correction', triggerObjectId: evdH.id, correctionCaseId: c6 } });
    expect((await caseState(c6))?.propagation_state).toBe('complete');
    // A new grant re-drives only what is still outstanding: the completed case is not walked again.
    const r = await register(tenantAdmin, { ownerPrincipalId: ownerId });
    agent = r.agent;
    expect(r.served.reDriven, `re-driven: ${JSON.stringify(consumer.lastReconciliation()?.reDriven)}`).toBe(0);
    await settle();
    expect((await invalidationsFor(c6)).length).toBe(1);
    expect((await attemptsFor(c6))[0]?.state).toBe('failed');
  }, 120_000);

  it('BACKLOG: a case applied while no grant existed is re-driven by a registration with backlog walk, and left alone by one with backlog leave', async () => {
    await revoke(tenantAdmin, agent.agentId, 'revoked to build a backlog');
    const up = await h.upload([{ filename: 'terms-i.csv', text: TERMS_CSV.replace('assumption', 'assumption (i)'), documentTime: '2024-01-17T00:00:00Z' }]);
    const evdI = up[0] as { id: string };
    const c7 = await applyCorrection([evdI.id], 'document i restated into the backlog');
    await waitFor('the refusal recorded', () => attemptsFor(c7), (rows) => rows[0]?.state === 'failed', 60_000);
    await settle();
    const leave = await register(tenantAdmin, { ownerPrincipalId: ownerId, backlog: 'leave' });
    // 'leave' re-drives a FAILED attempt of a CorrectionApplied event (it is not backlog: the event exists), so the case completes now;
    // the pre-0060 shape — a CorrectionReceived apply row — is what 'leave' leaves alone.
    expect(leave.served.reDriven).toBe(1);
    await waitFor('the backlog walk', () => attemptsFor(c7), (rows) => rows[0]?.state === 'complete', 60_000);
    await settle();
    expect((await caseState(c7))?.propagation_state).toBe('complete');
    // A pre-0060 apply row: an applied case whose latest apply event carries the submission's name.
    const legacy = uuidv7(); const legacyRoot = uuidv7(); const legacyEvent = uuidv7();
    await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end,
        confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${uuidv7()}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${legacyRoot}::uuid, ${sha256(legacyRoot)}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into observation.correction_current (case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at, channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
      values (${legacy}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${h.fx.sourceId}::uuid, 'correction', 'applied', now(), 'test', null, 'applied before the consumer existed',
        ${JSON.stringify([{ object_id: legacyRoot, from: 1, to: 2 }])}::jsonb, 'downstream consumers not yet present (KG/dependency graph arrives Phase 3)')`.execute(h.su);
    await sql`insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, status, published_at)
      values (${legacyEvent}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CorrectionReceived', ${JSON.stringify({ case_id: legacy, kind: 'correction', propagation_scope: { resolved: [{ object_id: legacyRoot, from: 1, to: 2 }], unresolved: 'x' } })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'published', now())`.execute(h.su);
    const left = await consumer.reconcile('backlog check under leave');
    expect(left.reDriven.map((e) => e.caseId)).not.toContain(legacy);
    expect((await attemptsFor(legacy)).length).toBe(0);
    await revoke(tenantAdmin, leave.agent.agentId, 'replaced by a grant that walks the backlog');
    const walk = await register(tenantAdmin, { ownerPrincipalId: ownerId, backlog: 'walk' });
    expect(walk.served.reDriven).toBe(1);
    const a = await waitFor('the backlog case walked', () => attemptsFor(legacy), (rows) => rows[0]?.state === 'complete', 60_000);
    await settle();
    expect(a[0]?.event_id).toBe(legacyEvent);
    expect((await caseState(legacy))?.propagation_state).toBe('complete');
    agent = walk.agent;
  }, 180_000);

  it('EVERY NEW MUTATOR PORT refuses without its capability (the C14 rule, applied by hand to the graph schema)', async () => {
    const pools = { commit: h.app.get<import('../../src/shared/db.js').Db>((await import('../../src/shared/shared.module.js')).COMMIT_DB), identity: h.app.get<import('../../src/shared/db.js').Db>((await import('../../src/shared/shared.module.js')).IDENTITY_DB) };
    const probes: Array<[string, 'commit' | 'identity', string]> = [
      ['graph.register_propagation_agent', 'commit', `select graph.register_propagation_agent(null,null,null,null,null,null,null,null,null,null,null)`],
      ['graph.revoke_propagation_agent', 'commit', `select graph.revoke_propagation_agent(null,null,null,null,null,null,null)`],
      ['graph.propagation_attempt_receive', 'commit', `select graph.propagation_attempt_receive(null,null,null,null,null)`],
      ['graph.propagation_attempt_finish', 'commit', `select graph.propagation_attempt_finish(null,null,null,null,null)`],
      ['graph.propagation_root_begin', 'commit', `select graph.propagation_root_begin(null,null,null,null)`],
      ['graph.propagation_root_done', 'commit', `select graph.propagation_root_done(null,null,null,null,null,null)`],
      ['graph.propagations_to_reconcile', 'commit', `select * from graph.propagations_to_reconcile()`],
      ['graph.propagation_domains_to_serve', 'commit', `select * from graph.propagation_domains_to_serve()`],
      ['graph.propagation_agent_session_open', 'identity', `select graph.propagation_agent_session_open(null,null,null,null,null,null,null,null,null,null)`],
      ['graph.propagation_agent_session_extend', 'identity', `select graph.propagation_agent_session_extend(null,null,null,null,null,null,null)`],
    ];
    for (const [name, pool, q] of probes) {
      const r = await failure(sql.raw(q).execute(pools[pool]));
      expect(r.code, `${name} ran with no capability`).toBe('42501');
      const other = pool === 'commit' ? 'identity' : 'commit';
      const denied = await failure(sql.raw(q).execute(pools[other]));
      expect(denied.code, `${name} is reachable by the ${other} authority`).toBe('42501');
      expect(denied.message).toMatch(/permission denied/);
    }
    // eye_app holds none of them.
    const app = new pg.Pool({ host: process.env['EYE_DB_HOST'] ?? '127.0.0.1', port: Number(process.env['EYE_DB_PORT'] ?? 5432), database: process.env['EYE_DB_NAME'] ?? 'eye', user: 'eye_app', password: process.env['EYE_DB_APP_PASSWORD'] ?? process.env['EYE_DB_PASSWORD'], max: 1 });
    try {
      const r = await app.query('select graph.propagation_root_begin(null,null,null,null)').then(() => null, (e: { code?: string }) => e.code ?? 'error');
      expect(r).toBe('42501');
    } finally { await app.end(); }
  });

  it('the four new graph tables are under FORCE row-level security and read-only for the application authorities', async () => {
    const rows = (await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'graph' and c.relkind = 'r' and c.relname in ('propagation_agents', 'propagation_agent_events', 'propagation_attempts', 'propagation_attempt_events') order by c.relname`.execute(h.su)).rows;
    expect(rows.map((r) => r.relname)).toEqual(['propagation_agent_events', 'propagation_agents', 'propagation_attempt_events', 'propagation_attempts']);
    expect(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
    const grants = (await sql<{ table_name: string; grantee: string; privilege_type: string }>`select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'graph' and table_name in ('propagation_agents', 'propagation_agent_events', 'propagation_attempts', 'propagation_attempt_events')
        and grantee in ('eye_app', 'eye_commit', 'eye_identity', 'eye_publisher') order by 1, 2, 3`.execute(h.su)).rows;
    expect(grants.every((g) => g.privilege_type === 'SELECT' && g.grantee !== 'eye_identity' && g.grantee !== 'eye_publisher')).toBe(true);
    expect(grants.length).toBe(8);
  });
});
