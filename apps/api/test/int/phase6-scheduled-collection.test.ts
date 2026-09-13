/**
 * SCHEDULED COLLECTION through real Redis and the real database — the controlled
 * demonstration of SCHEDULED_COLLECTION.md §1.5.
 *
 * CONTROLLED, and labelled so: the publisher is a synthetic egress installed on the
 * orchestrator in the test runtime (no network), the contract's cadence is the
 * 60-second floor, and each tick is PROMOTED on demand (`promoteDelayedForTests`)
 * rather than waited for. Everything else is the shipping path: the activation
 * route records the schedule entry and materializes the BullMQ job scheduler under
 * the derived Redis name; the worker started by CollectionWorkerService receives
 * the job; CollectionOrchestrator.handleScheduledJob mints the agent's session from
 * the registry; AcquisitionLifecycle.run re-verifies agent, contract version and
 * lifecycle, acquires, admits or confirms, and records; the worker records the
 * attempt through the scheduler's own bounded capability.
 *
 * What is shown, in order: an automatic run (trigger: scheduler, attempt finished);
 * an UNCHANGED response (confirmed, not stored again: bytes transferred > 0, bytes
 * stored 0, freshness advanced); a CHANGED response (admitted, naming what it
 * changed from); RESTART RECOVERY (the Redis scheduler removed, the process
 * restarted, the persisted entry reconciled, a run served again); a FAILED run (the
 * publisher answers 500: a run opened and recorded failed); a REFUSED run (the agent
 * revoked: no run opened, the attempt recorded refused, not retried).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { SchedulerService, redisName, queueNameFor, schedulerIdFor } from '../../src/observation/scheduling/scheduler.service.js';
import { CollectionWorkerService } from '../../src/observation/scheduling/collection-worker.service.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { SourcesService } from '../../src/observation/sources/sources.service.js';
import { Phase4Harness, SERIES_START, sdmxWindow } from './phase4-helpers.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
// One job at a time on the domain queue: a promoted tick must not overlap the natural
// 60-second tick of the same source (the operator's knob, set to 1 for the demonstration too).
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness;
let observation: ObservationController;
let scheduler: SchedulerService;
let worker: CollectionWorkerService;
let orchestrator: CollectionOrchestrator;
let sources: SourcesService;

/** The synthetic publisher: a forward endpoint whose body and status the test controls; the backfill window is the Phase 4 synthetic series. */
const publisher = { version: 1, status: 200 };
const forwardBody = () => JSON.stringify({ dataSets: [{ series: { '0:0:0:0:0': { observations: { '0': [1.25 + publisher.version / 100] } } } }], published: `v${publisher.version}` });
const egress = async ({ url }: { url: string }): Promise<EgressResult> => {
  const q = new URL(url).searchParams;
  const backfill = q.get('startPeriod') !== null;
  const body = backfill ? sdmxWindow(q.get('startPeriod') as string, '2021-01-08') : forwardBody();
  return {
    status: backfill ? 200 : publisher.status, headers: { 'content-type': 'application/json' }, body: Buffer.from(body, 'utf8'),
    finalUrlRedacted: url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.9', retryAfterSeconds: null,
  };
};

type Attempt = { attempt_id: string; job_id: string; outcome: string; run_id: string | null; reason: string | null; items_admitted: number; items_noop: number; items_quarantined: number; started_at: Date };
const attempts = async (): Promise<Attempt[]> =>
  (await sql<Attempt>`select * from observation.scheduled_attempts where source_id = ${h.fx.sourceId}::uuid order by started_at desc`.execute(h.su)).rows;
const waitForAttempts = async (n: number, ms = 45_000): Promise<Attempt[]> => {
  const until = Date.now() + ms;
  for (;;) {
    const rows = await attempts();
    if (rows.length >= n) return rows;
    if (Date.now() > until) throw new Error(`only ${rows.length}/${n} scheduled attempt(s) after ${ms} ms; worker: ${JSON.stringify(worker.lastFailureSeen())}; runs: ${JSON.stringify((await sql<{ state: string; failure_reason: string | null }>`select state, failure_reason from observation.collection_runs_current where source_id = ${h.fx.sourceId}::uuid order by started_at desc limit 3`.execute(h.su)).rows)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
};
const runEvents = async (runId: string) =>
  (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from observation.collection_run_events where run_id = ${runId}::uuid order by occurred_at`.execute(h.su)).rows;
const evidenceCount = async (): Promise<number> =>
  Number((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`}`.execute(h.su)).rows[0]?.n);
/** Wait until nothing is active or waiting on the domain queue (the natural cadence tick may fire at any time). */
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await scheduler.queueCountsForTests(h.fx.tenantId, h.fx.domainId);
    if (c.active === 0 && c.waiting === 0) return;
    if (Date.now() > until) throw new Error(`queue did not settle: ${JSON.stringify(c)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};
/** One controlled tick: settle, promote the delayed job, wait for one more attempt, settle again; return the latest attempt. */
const tick = async (): Promise<Attempt> => {
  await settle();
  const n0 = (await attempts()).length;
  await scheduler.promoteDelayedForTests(h.fx.tenantId, h.fx.domainId);
  const rows = await waitForAttempts(n0 + 1);
  await settle();
  return (await attempts())[0] ?? rows[0] as Attempt;
};
const readiness = async () => {
  const r = await observation.sourcesReadiness(h.req(h.manager, 'observation.read.sources', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { limit: 100 } }) as { sources: Array<{ source_id: string; contract_version: number; readiness: { verdict: string; reason: string; automatic: { schedule_entry: { cadence_seconds: number } | null; runtime: { scheduler_enabled: boolean; worker_running: boolean; redis_scheduler: { present: boolean; next_at: string | null } }; last_attempt: { outcome: string; run_id: string | null } | null; last_success: { outcome: string } | null; attempts: Record<string, number> } } }> };
  return r.sources.find((s) => s.source_id === h.fx.sourceId && s.contract_version === h.version);
};

async function bind(app: Phase4Harness['app']): Promise<void> {
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  observation = app.get(O);
  scheduler = app.get(SchedulerService);
  worker = app.get(CollectionWorkerService);
  orchestrator = app.get(CollectionOrchestrator);
  sources = app.get(SourcesService);
  orchestrator.useEgressForTests(egress);
}

/** Register, approve and ACTIVATE THROUGH THE ROUTE (the activation records the schedule and materializes it). */
async function activateLiveVersion(windowDays = 366): Promise<number> {
  const sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid limit 1`.execute(h.su)).rows[0]?.source_key ?? '';
  const version = h.version + 1;
  await observation.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId,
    { payload: { contract: h.contract(sourceKey, { from: SERIES_START, to: '2021-01-07', windowDays, supersedes: h.version, version }), sourceId: h.fx.sourceId } });
  await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', h.fx.sourceId), h.manager,
    { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.source.approve', objectType: 'SRC', objectId: h.fx.sourceId }, ObservationCapability.registry,
    async (cap) => { await cap.approveSource({ sourceId: h.fx.sourceId, contractVersion: version, tenantId: h.fx.tenantId, domainId: h.fx.domainId, decision: 'approve', reason: 'phase 6 fixture', eventId: uuidv7(), correlationId: uuidv7() }); return { result: {}, targetType: 'SRC', targetId: h.fx.sourceId, targetVersion: String(version), outboxEvent: null }; });
  await h.transition(h.version, 'superseded');
  await observation.transitionSource(h.req(h.manager, 'observation.source.transition', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId, h.fx.sourceId,
    { payload: { contractVersion: version, target: 'active', reason: 'phase 6: activated through the route so the schedule is recorded and served' } });
  h.version = version;
  return version;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await bind(h.app);
}, 300_000);

afterAll(async () => {
  try { await scheduler?.obliterateForTests(h.fx.tenantId, h.fx.domainId); } catch { /* the queue may already be closed */ }
  await h?.close();
});

describe('scheduled collection through real Redis (controlled: synthetic publisher, promoted ticks)', () => {
  let firstRunId = '';

  it('activation records the schedule entry AND materializes the Redis scheduler under the derived name; a worker serves the domain', async () => {
    const v = await activateLiveVersion();
    const entry = (await sql<{ status: string; queue_name: string; scheduler_id: string; cadence_seconds: number }>`select status, queue_name, scheduler_id, cadence_seconds from observation.scheduler_entries where source_id = ${h.fx.sourceId}::uuid`.execute(h.su)).rows[0];
    expect(entry?.status).toBe('scheduled');
    // the STORED identities keep their ':' (migration 0022's constraint); Redis gets the derived names
    expect(entry?.queue_name).toBe(queueNameFor(h.fx.tenantId, h.fx.domainId));
    expect(entry?.scheduler_id).toBe(schedulerIdFor(h.fx.tenantId, h.fx.domainId, h.fx.sourceId));
    const rt = await scheduler.describe(h.fx.tenantId, h.fx.domainId, h.fx.sourceId);
    expect(rt.scheduler_enabled).toBe(true);
    expect(rt.worker_running, 'no worker was started for the domain on activation').toBe(true);
    expect(rt.redis_scheduler.present, 'the Redis job scheduler was not materialized').toBe(true);
    expect(rt.redis_scheduler.every_seconds).toBe(entry?.cadence_seconds);
    expect(rt.redis_names.queue).toBe(redisName(queueNameFor(h.fx.tenantId, h.fx.domainId)));
    expect(rt.redis_names.queue.includes(':')).toBe(false);
    const reg = await readiness();
    expect(reg?.contract_version).toBe(v);
    expect(reg?.readiness.verdict).toBe('live');
    expect(reg?.readiness.reason).toMatch(/a worker serves it here/);
    expect(reg?.readiness.automatic.last_attempt).toBeNull();
  }, 120_000);

  it('a promoted tick runs through the worker and the governed path: the run is triggered by the scheduler and the attempt is recorded finished', async () => {
    const a = await tick();
    expect(a.outcome, a.reason ?? '').toBe('finished');
    expect(a.run_id).not.toBeNull();
    const first = (await attempts()).at(-1) as Attempt;
    expect(first.items_admitted).toBeGreaterThan(0);
    firstRunId = first.run_id as string;
    const ev = await runEvents(firstRunId);
    const started = ev.find((e) => e.event === 'run.started');
    expect((started?.details['trigger'] as { kind: string; jobId: string }).kind).toBe('scheduler');
    expect((started?.details['trigger'] as { kind: string; jobId: string }).jobId).toBe(first.job_id);
    const finished = ev.find((e) => e.event === 'run.finished');
    expect(Number(finished?.details['bytes_transferred'])).toBeGreaterThan(0);
    expect(Number(finished?.details['bytes_stored'])).toBeGreaterThan(0);
    const reg = await readiness();
    expect(reg?.readiness.automatic.last_attempt?.outcome).toBe('finished');
    expect(reg?.readiness.automatic.last_success?.outcome).toBe('finished');
    expect(reg?.readiness.automatic.attempts['finished']).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it('an UNCHANGED response is confirmed, not stored again: bytes transferred, nothing stored, freshness advanced', async () => {
    await settle();
    const before = await evidenceCount();
    const a = await tick();
    expect(a.outcome, a.reason ?? '').toBe('finished');
    expect(a.items_admitted).toBe(0);
    expect(a.items_noop).toBeGreaterThan(0);
    expect(await evidenceCount()).toBe(before);
    const ev = await runEvents(a.run_id as string);
    const unchanged = ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true);
    expect(unchanged.length).toBeGreaterThan(0);
    expect(typeof unchanged[0]?.details['evd_object_id']).toBe('string');
    expect(typeof unchanged[0]?.details['digest']).toBe('string');
    const finished = ev.find((e) => e.event === 'run.finished');
    expect(Number(finished?.details['bytes_transferred'])).toBeGreaterThan(0);
    expect(Number(finished?.details['bytes_stored'])).toBe(0);
    // freshness: the source was seen current NOW, though nothing new was admitted
    const facts = await h.pipeline.consequentialRead(
      h.env(h.manager, 'observation.read.coverage', 'SRC', h.fx.sourceId), h.manager,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.read.coverage', objectType: 'SRC', objectId: h.fx.sourceId },
      ObservationCapability.read, async (cap) => h.app.get((await import('../../src/observation/coverage/facts.service.js')).CoverageFactsService).gather(cap, h.fx.sourceId, new Date(Date.now() - 86_400_000).toISOString(), new Date().toISOString(), null, null));
    const f = facts.result as { lastAdmittedAt: string | null; lastObservedAt: string | null };
    expect(f.lastObservedAt).not.toBeNull();
    expect(new Date(f.lastObservedAt as string).getTime()).toBeGreaterThan(new Date(f.lastAdmittedAt as string).getTime());
  }, 120_000);

  it('a CHANGED response is admitted as a new observation that names what it changed from', async () => {
    await settle();
    publisher.version = 2;
    const before = await evidenceCount();
    const a = await tick();
    expect(a.outcome, a.reason ?? '').toBe('finished');
    expect(a.items_admitted).toBe(1);
    expect(await evidenceCount()).toBe(before + 1);
    const ev = await runEvents(a.run_id as string);
    const admitted = ev.find((e) => e.event === 'item.admitted' && e.details['changed_from'] !== undefined);
    expect(admitted, 'the changed poll did not name the evidence it changed from').toBeDefined();
    expect(typeof (admitted?.details['changed_from'] as { digest: string }).digest).toBe('string');
  }, 120_000);

  it('RESTART RECOVERY: the Redis scheduler is lost, the process restarts, the persisted entry is reconciled and served again', async () => {
    await scheduler.unschedule(h.fx.tenantId, h.fx.domainId, h.fx.sourceId);
    expect((await scheduler.describe(h.fx.tenantId, h.fx.domainId, h.fx.sourceId)).redis_scheduler.present).toBe(false);
    await h.app.close();
    h.app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    h.pipeline = h.app.get((await import('../../src/pipeline/pipeline.service.js')).PipelineService);
    await bind(h.app);
    const report = worker.lastReconciliation();
    expect(report, `startup reconciliation did not run: ${JSON.stringify(worker.lastFailureSeen())}`).not.toBeNull();
    expect(report?.scheduled.some((s) => s.sourceId === h.fx.sourceId && s.contractVersion === h.version), 'the persisted schedule was not restored').toBe(true);
    const rt = await scheduler.describe(h.fx.tenantId, h.fx.domainId, h.fx.sourceId);
    expect(rt.redis_scheduler.present).toBe(true);
    expect(rt.worker_running).toBe(true);
    const a = await tick();
    expect(a.outcome, a.reason ?? '').toBe('finished');
  }, 180_000);

  /* ═══════════ the run's authority follows its progress (migration 0057) ═══════════ */

  const agentPrincipalId = async (): Promise<string> =>
    (await sql<{ principal_id: string }>`select principal_id::text from observation.agents where agent_id = ${h.fx.agentId}::uuid`.execute(h.su)).rows[0]?.principal_id ?? '';
  const runSessions = async (): Promise<Array<{ id: string; created_at: Date; expires_at: Date; status: string }>> =>
    (await sql<{ id: string; created_at: Date; expires_at: Date; status: string }>`select id::text, issued_at as created_at, expires_at, status from identity.sessions
      where principal_id = ${await agentPrincipalId()}::uuid and assurance = 'agent_grant' order by issued_at desc`.execute(h.su)).rows;
  const extensions = async (sessionId: string): Promise<Array<Record<string, unknown>>> =>
    (await sql<{ metadata: Record<string, unknown> }>`select event -> 'metadata' as metadata from audit.audit_events
      where event_type = 'identity.agent_session_extended' and event ->> 'target_id' = ${sessionId} order by occurred_at`.execute(h.su)).rows.map((r) => r.metadata);

  it('the run session opens with a bounded expiry and is EXTENDED by each committed page: a walk keeps its authority as long as it keeps walking', async () => {
    /*
     * The demonstration's finding (2026-09-10): a 12,856-event walk outlived its session's fixed
     * 15-minute expiry; every admission after 900 s was refused as "authority insufficient"
     * and the run read as a stall. Here a new version opens a backfill window of several
     * pages; each page checkpoint extends the session through identity.agent_session_extend.
     */
    await activateLiveVersion(2); // the same seven-day window in two-day pages: several page checkpoints
    const a = await tick(); // a new contract version walks its window from the beginning
    expect(a.outcome, a.reason ?? '').toBe('finished');
    const events = await runEvents(a.run_id as string);
    const pages = events.filter((e) => e.event === 'run.checkpointed' && e.details['page'] === true).length;
    expect(pages, `the backfill window did not produce page checkpoints; nothing to extend on (events: ${events.map((e) => e.event).join(',')})`).toBeGreaterThanOrEqual(1);
    const session = (await runSessions())[0];
    expect(session).toBeDefined();
    const ext = await extensions(session?.id ?? '');
    expect(ext.length, 'no extension was recorded for the run session').toBe(pages);
    expect(ext.every((m) => m['extended_by'] === 'run progress (page checkpoint)' && m['agent_id'] === h.fx.agentId), 'an extension names its cause and the agent').toBe(true);
    // The session's expiry is the LAST extension's, past the opening expiry.
    const opened = new Date(session?.created_at as Date).getTime();
    const expires = new Date(session?.expires_at as Date).getTime();
    const lastExt = new Date(String(ext[ext.length - 1]?.['expires_at'])).getTime();
    expect(Math.abs(expires - lastExt), 'the session does not carry the expiry the last extension recorded').toBeLessThan(2_000);
    expect(expires - opened, 'the extension did not move the expiry past the opening bound').toBeGreaterThan(900_000);
  }, 180_000);

  it('a run whose session EXPIRED mid-walk is refused at its next effect, ends failed, and the attempt says the terminal event could not be recorded — nothing reads as a stall', async () => {
    await settle();
    // The transport pauses on its first request, so the run has OPENED (run.started committed,
    // the session minted) and is waiting on the publisher when its session is expired
    // underneath it — fixture scaffolding on identity.sessions, labelled as such.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let served = 0;
    orchestrator.useEgressForTests(async (a) => { served += 1; if (served === 1) await gate; return egress(a); });
    const n0 = (await attempts()).length;
    const runsBefore = (await sql<{ run_id: string }>`select run_id::text from observation.collection_runs_current where source_id = ${h.fx.sourceId}::uuid`.execute(h.su)).rows.map((r) => r.run_id);
    await scheduler.promoteDelayedForTests(h.fx.tenantId, h.fx.domainId);
    let opened: { run_id: string; state: string } | undefined;
    for (let i = 0; i < 400 && opened === undefined; i += 1) {
      opened = (await sql<{ run_id: string; state: string }>`select run_id::text, state from observation.collection_runs_current
        where source_id = ${h.fx.sourceId}::uuid and state = 'started'`.execute(h.su)).rows.find((r) => !runsBefore.includes(r.run_id));
      if (opened === undefined) await new Promise((r) => setTimeout(r, 100));
    }
    expect(opened, 'the run did not open').toBeDefined();
    const session = (await runSessions())[0];
    await sql`update identity.sessions set expires_at = clock_timestamp() - interval '1 second' where id = ${session?.id ?? ''}::uuid`.execute(h.su);
    try {
      release();
      const rows = await waitForAttempts(n0 + 1, 120_000);
      await settle();
      const a = rows.find((r) => r.run_id === opened?.run_id) ?? (await attempts())[0] as Attempt;
      expect(a.outcome).toBe('failed');
      expect(a.reason ?? '', 'the attempt names the refusal').toMatch(/authority insufficient/);
      expect(a.reason ?? '', 'the attempt says the terminal event could not be recorded, and what follows').toMatch(/terminal event NOT recorded/);
      const ev = (await runEvents(opened?.run_id as string)).map((e) => e.event);
      expect(ev, 'a run without authority admitted something').not.toContain('item.admitted');
      expect(ev.filter((e) => /^run\.(finished|failed|cancelled|budget_exceeded)$/.test(e)), 'a terminal event was written without authority').toEqual([]);
      const row = (await sql<{ state: string }>`select state from observation.collection_runs_current where run_id = ${opened?.run_id as string}::uuid`.execute(h.su)).rows[0];
      expect(row?.state, "the projection stays 'started' — the sweeper's to reconcile, and the attempt row says so").toBe('started');
    } finally {
      orchestrator.useEgressForTests(egress);
      // Fixture scaffolding, no governed route: the source lease the displaced run still holds
      // is aged past its expiry so the next attempt takes it over (0051's takeover path) instead
      // of waiting 900 s; the run row is left for the sweeper, as it would be in the field.
      await sql`update observation.source_run_leases set heartbeat_at = heartbeat_at - make_interval(secs => lease_seconds + 60)
        where source_id = ${h.fx.sourceId}::uuid`.execute(h.su);
    }
    const next = await tick();
    expect(next.outcome, `the next attempt did not take the expired lease over: ${next.reason ?? ''}`).toBe('finished');
    const started = (await runEvents(next.run_id as string)).find((e) => e.event === 'run.started');
    expect((started?.details['lease'] as Record<string, unknown> | undefined)?.['took_over_from_run'], 'the takeover of the displaced run is recorded on the next run').toBe(opened?.run_id);
  }, 240_000);

  it('a FAILED run: the publisher answers 500; a run is opened, ends failed, and the attempt says so', async () => {
    await settle();
    publisher.status = 500;
    const a = await tick();
    publisher.status = 200;
    expect(a.outcome).toBe('failed');
    expect(a.run_id).not.toBeNull();
    expect(a.reason).toMatch(/transport_failure|500/);
    const ev = await runEvents(a.run_id as string);
    expect(ev.some((e) => e.event === 'run.failed')).toBe(true);
    expect(String(ev.find((e) => e.event === 'run.failed')?.details['reason'])).toMatch(/transport_failure/);
    const reg = await readiness();
    expect(reg?.readiness.automatic.last_attempt?.outcome).toBe('failed');
    expect(reg?.readiness.automatic.last_success?.outcome).toBe('finished');
  }, 120_000);

  it('a REFUSED run: the agent is revoked; no run is opened, the attempt is recorded refused and not retried', async () => {
    await h.pipeline.write(h.env(h.manager, 'observation.agent.revoke', 'AGT', h.fx.agentId), h.manager,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.agent.revoke', objectType: 'AGT', objectId: h.fx.agentId }, ObservationCapability.registry,
      async (cap) => { await cap.revokeAgent({ agentId: h.fx.agentId, tenantId: h.fx.tenantId, domainId: h.fx.domainId, reason: 'phase 6: refused-run demonstration', eventId: uuidv7(), correlationId: uuidv7() }); return { result: {}, targetType: 'AGT', targetId: h.fx.agentId, targetVersion: '1', outboxEvent: null }; });
    await settle();
    const runsBefore = Number((await sql<{ n: string }>`select count(*)::text n from observation.collection_runs_current where source_id = ${h.fx.sourceId}::uuid`.execute(h.su)).rows[0]?.n);
    const a = await tick();
    expect(a.outcome, a.reason ?? '').toBe('refused');
    expect(a.run_id).toBeNull();
    expect(a.reason).toBeTruthy();
    const runsAfter = Number((await sql<{ n: string }>`select count(*)::text n from observation.collection_runs_current where source_id = ${h.fx.sourceId}::uuid`.execute(h.su)).rows[0]?.n);
    expect(runsAfter).toBe(runsBefore);
    // not retried: BullMQ completed the job on the first attempt — a refusal is an answer, not a transient fault
    const job = await scheduler.jobStateForTests(h.fx.tenantId, h.fx.domainId, a.job_id);
    expect(job?.state).toBe('completed');
    expect(job?.attemptsMade).toBe(1);
    const reg = await readiness();
    expect(reg?.readiness.automatic.attempts['refused']).toBeGreaterThanOrEqual(1);
    expect(reg?.readiness.automatic.last_attempt?.outcome).toBe('refused');
  }, 120_000);
});
