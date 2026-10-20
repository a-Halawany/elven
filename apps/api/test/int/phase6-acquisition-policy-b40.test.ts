/**
 * CP-6 B40 §AP (migration 0123 §AP; F-P1-04: L1-I02, V03-T-072, V03-T-073, V03-T-266, ES-31-007, V04-T-019, DP-10-005) — THE ACQUISITION-TIME
 * POLICY, on the real database through the real lifecycle, the real stages, the real Redis bucket (EYE_REDIS_PORT) and the real scheduler:
 *   AU  the AUTHORIZATION of an SRC@v4 run — recorded once, cited by the run, every block (rights + terms, licence, credential reference,
 *       rate, residency, window, robots, backoff); its refusals BEFORE any request (residency_refused, window_closed incl. a blackout,
 *       robots_disallowed, licence, rights, policy); a v1–v3 contract proceeds exactly as before with nothing recorded (D8);
 *   RQ  the rights RE-CHECKED BEFORE EVERY REQUEST (ES-31-007): terms withdrawn mid-run stop the next request;
 *   RB  the robots cache per contract version (fetched once, then served), RFC 9309's 4xx / 5xx answers;
 *   BK  the per-source BUCKET shared by every run (requests spaced by the contract's rate; a second run waits on the first's tokens; a rate
 *       the run cannot wait for → rate_limited with the contract's backoff);
 *   RL  the publisher's 429 + Retry-After on the SYNTHETIC replay set (D10): the interval recorded with the contract's backoff (honoured;
 *       not honoured; unparsed — F51), the hold refusing the next run before egress, attempts counted, exhausted, the third answer
 *       admitted and the intervals RESOLVED; the read (the coverage view) shows them; a v1–v3 contract's 429 stays a transport failure (D8);
 *   SC  the scheduler: the contract's retry enqueued at the end of the hold (attempts 1 — not BullMQ's generic schedule), an unavailable
 *       source and an execution fault backed off by the contract, a v1–v3 contract untouched;
 *   LB  D10: a LOOPBACK throttling publisher (TLS, self-signed for a .invalid name, on a port the act-target module refuses for the live
 *       addresses) through B14's one transport substitution (egressPinned) — the 429 recorded, the contract's retry run BY THE SCHEDULER'S
 *       WORKER after the hold, the interval resolved; the production egress refuses the same publisher (the vetting the substitution skips);
 *   IG  the ingress check (composed as the integrator folds it into the inspect stage): a response that changes shape is quarantined
 *       `response_anomaly`; a residency conflict recorded under `record` quarantines `residency_conflict`;
 *   RD  the read (observation.acquisition.read): metadata only, refused for the collection agent and outside the caller's domain;
 *   FI  the fault points F50 (bucket), F51 (Retry-After), F52 (robots), F53 (residency), each failing closed.
 * Everything here is SYNTHETIC. CONSTRUCTION evidence; the act's demonstration is separate; real acceptance — never claimed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { EgressRefused, egress as productionEgress, egressPinned, type EgressResult } from '../../src/observation/connectors/http-client.js';
import { resetReplayAttemptsForTests } from '../../src/observation/connectors/replay.js';
import * as fault from '../../src/observation/fault-injection.js';
import { RateBucket } from '../../src/observation/acquisition-policy/rate-bucket.js';
import { RobotsService } from '../../src/observation/acquisition-policy/robots.service.js';
import { ContractBackoffAp } from '../../src/observation/acquisition-policy/contract-backoff.service.js';
import { AcquisitionPolicyController } from '../../src/observation/acquisition-policy/acquisition-policy.controller.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { SchedulerService, type CollectionJobPayload } from '../../src/observation/scheduling/scheduler.service.js';
import { EvidenceB82Controller } from '../../src/observation/evidence-b82/evidence-b82.controller.js';
import type { Db } from '../../src/shared/db.js';
import { BASE, Phase4Harness, sdmxWindow } from './phase4-helpers.js';
import { evaluateForApproval, B40_HOSTS, B40_REPLAY_ROOT, v4Blocks } from './phase6-b40-fixtures.js';
import { assertSyntheticListener, ActTargetRefused } from '../../../../scripts/act-target.mjs';

const ENV_BEFORE = Object.fromEntries(['EYE_CONNECTOR_REPLAY_ROOT', 'EYE_SCHEDULER_ENABLED', 'EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'].map((k) => [k, process.env[k]]));
process.env['EYE_CONNECTOR_REPLAY_ROOT'] = B40_REPLAY_ROOT;   // the B40 replay sets (phase6-b40-fixtures)
process.env['EYE_SCHEDULER_ENABLED'] = 'true';                  // the contract's retry runs on the real queue (Redis EYE_REDIS_PORT)
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

type Row = Record<string, unknown>;
let h: Phase4Harness;
let sourceKey = '';
const one = async (q: ReturnType<typeof sql>, db: Db = h.su) => ((await q.execute(db)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>, db: Db = h.su) => (await q.execute(db)).rows as Row[];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  return { status: e instanceof HttpException ? e.getStatus() : null, message: e instanceof HttpException ? JSON.stringify(e.getResponse()) : (e as Error).message };
};
const app = <T>(cls: new (...a: never[]) => T): T => h.app.get(cls as never) as T;

/* ── the SRC@v4 contract versions of the fixture source ─────────────────────────────────────────────────────────────────────────────── */
type Policy = ReturnType<typeof v4Blocks>['acquisition_policy'];
const FAST = { requests: 1000, per_seconds: 1, burst: 1000 };
const policy = (over: Partial<Policy> = {}): Policy => ({ ...v4Blocks().acquisition_policy, rate: FAST, robots: { mode: 'evaluate', reason: null }, ...over });
async function v4(o: { ap?: Partial<Policy>; mode?: 'live' | 'replay'; endpoints?: string[]; replaySet?: string; residency?: string; purposes?: string[];
                       backfill?: { from: string; to: string; windowDays: number } } = {}): Promise<number> {
  const version = h.version + 1;
  const base = h.contract(sourceKey, { from: '2021-01-01', to: '2021-01-20', windowDays: 7, supersedes: h.version, version }) as Record<string, unknown>;
  const so = { ...(base['security_and_operations'] as Row), expected_schema: { media_types: ['application/json'], required_fields: [], drift_tolerance: 0 },
    budgets: { max_requests_per_run: 12, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 120_000, max_retries: 0 },
    ...(o.replaySet === undefined ? {} : { replay_set: o.replaySet }) } as Row;
  if (o.backfill === undefined) delete so['backfill'];
  else so['backfill'] = { strategy: 'period-range', endpoint: (o.endpoints ?? [BASE])[0], from: o.backfill.from, to: o.backfill.to, window_days: o.backfill.windowDays, start_param: 'startPeriod', end_param: 'endPeriod' };
  const contract = {
    ...base, acquisition_mode: o.mode ?? 'live', data_origin: 'synthetic',
    identity: { ...(base['identity'] as Row), endpoints: o.endpoints ?? [BASE] },
    authority_and_rights: { ...(base['authority_and_rights'] as Row), residency: o.residency ?? 'EU', purposes: o.purposes ?? ['observation', 'corridor monitoring'] },
    security_and_operations: so,
    ...v4Blocks({ acquisition_policy: policy(o.ap) }),
  };
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  await h.app.get(ObservationController).registerSource(
    h.req(h.registrar, 'observation.source.register', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId,
    { payload: { contract, sourceId: h.fx.sourceId } });
  const { ObservationCapability } = await import('../../src/observation/observation.capabilities.js');
  await evaluateForApproval(h, h.manager, { tenantId: h.fx.tenantId, domainId: h.fx.domainId, sourceId: h.fx.sourceId, contractVersion: version, label: 'B40 §AP fixture' });   // B40 integration: §RG's gate (D5)
  await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', h.fx.sourceId), h.manager,
    { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.source.approve', objectType: 'SRC', objectId: h.fx.sourceId },
    ObservationCapability.registry,
    async (cap) => {
      await cap.approveSource({ sourceId: h.fx.sourceId, contractVersion: version, tenantId: h.fx.tenantId, domainId: h.fx.domainId,
        decision: 'approve', reason: 'B40 §AP fixture (SYNTHETIC)', eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: h.fx.sourceId, targetVersion: String(version), outboxEvent: null };
    });
  await h.transition(h.version, 'superseded');
  await h.transition(version, 'active');
  h.version = version;
  await app(RateBucket).resetForTests(h.fx.sourceId);
  return version;
}

/* ── a synthetic publisher (a transport double): robots.txt, the forward endpoint, the backfill windows ────────────────────────────── */
function publisher(o: { robots?: { status: number; body?: string } | 'throw'; status?: (url: string, n: number) => number; body?: (url: string, n: number) => string;
                        headers?: (url: string, n: number) => Record<string, string>; onData?: (url: string, n: number) => Promise<void> } = {}) {
  const seen: string[] = []; const at: number[] = []; let n = 0;
  const egress = async ({ url }: { url: string }): Promise<EgressResult> => {
    seen.push(url); at.push(Date.now());
    const u = new URL(url);
    if (u.pathname === '/robots.txt') {
      if (o.robots === 'throw') throw new EgressRefused('timeout', 'request exceeded the contract timeout');
      const r = o.robots ?? { status: 200, body: 'User-agent: *\nAllow: /\nDisallow: /internal/\n' };
      return { status: r.status, headers: { 'content-type': 'text/plain' }, body: Buffer.from(r.body ?? '', 'utf8'), finalUrlRedacted: url, hops: [], tlsVerified: true,
               originAllowlisted: true, pinnedAddress: '203.0.113.9', retryAfterSeconds: null, requestSent: true };
    }
    n += 1;
    if (o.onData !== undefined) await o.onData(url, n);
    const start = u.searchParams.get('startPeriod');
    const body = o.body !== undefined ? o.body(url, n)
      : start !== null ? sdmxWindow(start, (() => { const d = new Date(`${u.searchParams.get('endPeriod')}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })())
      : JSON.stringify({ dataSets: [{ series: { '0:0': { observations: { '0': [n] } } } }], published: `poll ${n} (SYNTHETIC)`, note: 'x'.repeat(300) });
    return { status: o.status?.(url, n) ?? 200, headers: { 'content-type': 'application/json', ...(o.headers?.(url, n) ?? {}) }, body: Buffer.from(body, 'utf8'),
             finalUrlRedacted: url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.9',
             retryAfterSeconds: null, requestSent: true };
  };
  return { egress, seen, at, data: () => seen.filter((s) => new URL(s).pathname !== '/robots.txt') };
}
async function runWith(p: ReturnType<typeof publisher>) {
  app(RobotsService).useEgressForTests(p.egress);
  return h.runOnce(new RestConnector({ egress: p.egress }), h.version);
}
const authorizationOf = (runId: string) => one(sql`select * from observation.acquisition_authorizations where run_id = ${runId}::uuid`);
const rateLimitsOf = (version: number) => rows(sql`select * from observation.acquisition_rate_limits where source_id = ${h.fx.sourceId}::uuid and contract_version = ${version} order by declared_at`);
const events = (runId: string) => rows(sql`select event, details ->> 'reason' reason, details ->> 'reason_class' cls, details ->> 'authorization_id' auth
                                            from observation.collection_run_events where run_id = ${runId}::uuid order by occurred_at`);
const readPolicy = (principal = h.manager, domainId = h.fx.domainId) =>
  app(AcquisitionPolicyController).read(h.req(principal, 'observation.acquisition.read', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, domainId, h.fx.sourceId);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  sourceKey = String((await one(sql`select source_key from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid limit 1`))['source_key']);
}, 300_000);
afterEach(() => { fault.disarm(); vi.restoreAllMocks(); app(RobotsService).useEgressForTests(null); app(CollectionOrchestrator).useEgressForTests(null); });
afterAll(async () => {
  await app(SchedulerService).obliterateForTests(h.fx.tenantId, h.fx.domainId).catch(() => undefined);
  await h?.close();
  for (const [k, v] of Object.entries(ENV_BEFORE)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }   // this file's settings never outlive it
});

describe('AU · the acquisition authorization of an SRC@v4 run (V03-T-266, L1-I02, V03-T-072, V03-T-073, V04-T-019)', () => {
  it('POSITIVE: one authorization recorded and cited — rights, licence, credential reference, rate, residency, window, robots, backoff', async () => {
    const v = await v4();
    const p = publisher();
    const r = await runWith(p);
    expect(r.state, r.reason).toBe('finished');
    expect(r.admitted).toBeGreaterThan(0);
    const a = await authorizationOf(r.runId);
    expect(a).toMatchObject({ decision: 'proceed', refusal_class: null, contract_version: v, form: 'command', purpose_id: 'observation', credential_ref: null,
      agent_principal_id: (await one(sql`select agent_principal_id from observation.collection_runs_current where run_id = ${r.runId}::uuid`))['agent_principal_id'] });
    expect(a['rights']).toMatchObject({ contract_rights_state: 'confirmed', lifecycle_state: 'active', terms: null, verdict: 'in_force' });
    expect(a['licence']).toMatchObject({ ok: true, use_purposes: ['corridor monitoring'], acquisition_purpose: 'observation' });
    expect(a['rate']).toMatchObject({ ...FAST, bucket: 'reachable' });
    expect(a['residency']).toMatchObject({ verdict: 'match', contract: 'EU', profile: 'local-dev', regions: ['EU'], mode: 'enforce', profile_of: 'domain' });
    expect(a['collection_window']).toMatchObject({ open: true });
    expect(a['robots']).toMatchObject({ mode: 'evaluate', verdict: 'allowed', endpoints: [{ origin: 'https://backfill.example', allowed: true, from: 'fetched' }] });
    expect(a['backoff']).toMatchObject({ hold: null, declared: { schedule_seconds: [60, 300, 900], max_attempts: 4, honour_retry_after: true } });
    // the authorization is append-only and one per run
    expect((await refusal(sql`update observation.acquisition_authorizations set reason = 'x' where run_id = ${r.runId}::uuid`.execute(h.su))).message).toMatch(/append-only|prohibited/i);
  }, 120_000);

  it('D8: a v1–v3 contract proceeds exactly as before — no authorization, no robots fetch, no bucket', async () => {
    const v = await h.newVersion({ from: '2021-03-01', to: '2021-03-05', windowDays: 366 });
    const p = publisher();
    const r = await runWith(p);
    expect(r.state, r.reason).toBe('finished');
    expect(await authorizationOf(r.runId)).toEqual({});
    expect(p.seen.some((s) => s.endsWith('/robots.txt'))).toBe(false);
    expect(await rows(sql`select 1 from observation.acquisition_robots where contract_version = ${v.version} and source_id = ${h.fx.sourceId}::uuid`)).toHaveLength(0);
  }, 120_000);

  it('residency_refused BEFORE any request (enforce); the conflict recorded and the run going out under `record`', async () => {
    await v4({ residency: 'US' });
    const p = publisher();
    const r = await runWith(p);
    expect(r).toMatchObject({ state: 'cancelled', admitted: 0 });
    expect(r.reason).toMatch(/^acquisition not authorized \(residency_refused\): the contract declares residency US; the local-dev profile admits EU only/);
    expect(p.seen).toHaveLength(0);
    const a = await authorizationOf(r.runId);
    expect(a).toMatchObject({ decision: 'refuse', refusal_class: 'residency_refused' });
    expect(a['robots']).toMatchObject({ verdict: 'not_evaluated' });
    expect((await events(r.runId)).at(-1)).toMatchObject({ event: 'run.cancelled', cls: 'residency_refused', auth: a['authorization_id'] });

    await v4({ residency: 'US', ap: { residency_check: 'record' } });
    const p2 = publisher();
    const r2 = await runWith(p2);
    expect(r2.state, r2.reason).toBe('finished');
    expect((await authorizationOf(r2.runId))['residency']).toMatchObject({ verdict: 'conflict', refuse: false, mode: 'record' });
  }, 120_000);

  it('window_closed BEFORE any request: a day outside the window, and a blackout', async () => {
    const today = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getUTCDay()] as Policy['window']['days'][number];
    await v4({ ap: { window: { days: (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).filter((d) => d !== today), hours_utc: { from: 0, to: 24 }, blackout: [] } } });
    const p = publisher();
    const r = await runWith(p);
    expect(r.reason).toMatch(/^acquisition not authorized \(window_closed\): .* is not a collection day of this contract/);
    expect(p.seen).toHaveLength(0);
    await v4({ ap: { window: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], hours_utc: { from: 0, to: 24 },
      blackout: [{ from: new Date(Date.now() - 3_600_000).toISOString(), to: new Date(Date.now() + 3_600_000).toISOString(), reason: 'port authority maintenance (SYNTHETIC)' }] } } });
    const r2 = await runWith(p);
    expect(r2.reason).toMatch(/^acquisition not authorized \(window_closed\): inside the declared blackout .* \(port authority maintenance \(SYNTHETIC\)\)/);
    expect(p.seen).toHaveLength(0);
  }, 120_000);

  it('licence and rights from the rights terms in force (D4\'s second source): outside the purposes, prohibited, withdrawn', async () => {
    const terms = app(EvidenceB82Controller);
    const declare = async (version: number, purposes: string[], prohibitedUses: string[] = []) => (await terms.declareRights(
      h.req(h.manager, 'observation.rights.declare', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId,
      { payload: { sourceId: h.fx.sourceId, contractVersion: version, expectedVersion: 0, expiresAt: null, purposes, prohibitedUses, attribution: null,
                   reason: 'B40 §AP rights terms fixture (SYNTHETIC)' } }) as { terms: Row }).terms;
    let v = await v4();
    await declare(v, ['forecasting']);
    const p = publisher();
    let r = await runWith(p);
    expect(r.reason).toMatch(/^acquisition not authorized \(licence\): the rights terms v1 do not permit corridor monitoring \(permitted: forecasting\)/);
    expect(p.seen).toHaveLength(0);
    v = await v4();
    await declare(v, ['forecasting'], ['corridor monitoring']);
    r = await runWith(p);
    expect(r.reason).toMatch(/^acquisition not authorized \(licence\): the contract collects for corridor monitoring, which the rights terms v1 prohibit/);
    v = await v4();
    const t = await declare(v, ['corridor monitoring']);
    r = await runWith(p);
    expect(r.state, r.reason).toBe('finished');
    expect((await authorizationOf(r.runId))['rights']).toMatchObject({ terms: { version: 1, state: 'in_force' } });
    await terms.withdrawRights(h.req(h.manager, 'observation.rights.withdraw', 'RTT', String(t['terms_id']), 'observation'), h.fx.tenantId, h.fx.domainId,
      String(t['terms_id']), { payload: { expectedVersion: 1, reason: 'B40 §AP: the terms withdrawn (SYNTHETIC)' } });
    const seenBefore = p.seen.length;
    r = await runWith(p);
    expect(r.reason).toMatch(/^acquisition not authorized \(rights\): the rights terms v2 are withdrawn/);
    expect(p.seen).toHaveLength(seenBefore);
  }, 180_000);
});

describe('RQ · the rights re-checked before EVERY request (ES-31-007)', () => {
  it('terms withdrawn while the run walks its windows: the next request is not sent, the run fails closed `rights`', async () => {
    const terms = app(EvidenceB82Controller);
    const v = await v4({ backfill: { from: '2021-05-01', to: '2021-05-22', windowDays: 7 } });
    const t = (await terms.declareRights(h.req(h.manager, 'observation.rights.declare', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId,
      { payload: { sourceId: h.fx.sourceId, contractVersion: v, expectedVersion: 0, expiresAt: null, purposes: ['corridor monitoring'], prohibitedUses: [], attribution: null,
                   reason: 'B40 §AP rights terms fixture (SYNTHETIC)' } }) as { terms: Row }).terms;
    const p = publisher({ onData: async (_url, n) => {
      if (n === 1) await terms.withdrawRights(h.req(h.manager, 'observation.rights.withdraw', 'RTT', String(t['terms_id']), 'observation'), h.fx.tenantId, h.fx.domainId,
        String(t['terms_id']), { payload: { expectedVersion: 1, reason: 'B40 §AP: rights revoked during the run (SYNTHETIC)' } });
    } });
    const r = await runWith(p);
    expect(r.state).toBe('failed');
    expect(r.reason).toMatch(/^throttle refused \(rights\): the rights terms \(v2\) are withdrawn at this request — the request to https:\/\/backfill\.example\/series\?\[redacted\] was not sent/);
    expect(p.data()).toHaveLength(1);   // the first window went out before the withdrawal; the second never did
  }, 120_000);
});

describe('RB · robots.txt through the vetted client, cached per contract version', () => {
  it('fetched once per contract version and origin, then served from the cache; a disallowed path is refused before the request', async () => {
    const v = await v4();
    const p = publisher();
    await runWith(p); await runWith(p);
    expect(p.seen.filter((s) => s.endsWith('/robots.txt'))).toHaveLength(1);
    const cached = await rows(sql`select outcome, via, http_status, byte_length, jsonb_array_length(rules) g from observation.acquisition_robots
      where source_id = ${h.fx.sourceId}::uuid and contract_version = ${v}`);
    expect(cached).toEqual([{ outcome: 'fetched', via: 'live', http_status: 200, byte_length: 44, g: 1 }]);
    await v4({ endpoints: ['https://backfill.example/internal/series?format=jsondata'] });
    const p2 = publisher();
    const r = await runWith(p2);
    expect(r.reason).toMatch(/^acquisition not authorized \(robots_disallowed\): robots\.txt of https:\/\/backfill\.example disallows \/internal\/series\?format=jsondata \(Disallow: \/internal\/\) for every agent/);
    expect(p2.data()).toHaveLength(0);
  }, 120_000);
  it('RFC 9309: a 404 is no robots file (allowed); a 503 is unreachable (refused unavailable); not_applicable needs the contract\'s reason and fetches nothing', async () => {
    await v4();
    const r404 = await runWith(publisher({ robots: { status: 404 } }));
    expect(r404.state, r404.reason).toBe('finished');
    await v4();
    const p = publisher({ robots: { status: 503 } });
    const r503 = await runWith(p);
    expect(r503.reason).toMatch(/^acquisition not authorized \(unavailable\): robots\.txt for https:\/\/backfill\.example answered 503 — unreachable/);
    expect(p.data()).toHaveLength(0);
    await v4({ ap: { robots: { mode: 'not_applicable', reason: 'a statistical API, not a crawled site (SYNTHETIC)' } } });
    const p3 = publisher();
    const r = await runWith(p3);
    expect(r.state, r.reason).toBe('finished');
    expect(p3.seen.some((s) => s.endsWith('/robots.txt'))).toBe(false);
    expect((await authorizationOf(r.runId))['robots']).toMatchObject({ verdict: 'not_applicable', reason: expect.stringContaining('a statistical API') });
  }, 120_000);
});

describe('BK · the per-source token bucket (SRC@v4 rate), shared by every run', () => {
  it('requests are spaced by the contract\'s rate; a second run waits on the tokens the first spent', async () => {
    await v4({ ap: { rate: { requests: 1, per_seconds: 2, burst: 1 } }, backfill: { from: '2021-06-01', to: '2021-06-15', windowDays: 7 } });
    const p = publisher();
    const r = await runWith(p);
    expect(r.state, r.reason).toBe('finished');
    const t = p.at.filter((_, i) => !(p.seen[i] as string).endsWith('/robots.txt'));
    expect(t.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < t.length; i += 1) expect((t[i] as number) - (t[i - 1] as number)).toBeGreaterThanOrEqual(1_800);
    // the same bucket for the next run: its first request waits for the token the first run's last request spent
    const startedAt = Date.now();
    const r2 = await runWith(publisher());
    expect(r2.state, r2.reason).toBe('finished');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_500);
  }, 120_000);
  it('a rate the run cannot wait for: the request is not sent, the run fails `rate_limited`, the interval and the contract\'s backoff recorded, the next run held', async () => {
    const v = await v4({ ap: { rate: { requests: 1, per_seconds: 3600, burst: 1 } }, backfill: { from: '2021-07-01', to: '2021-07-15', windowDays: 7 } });
    const p = publisher();
    const r = await runWith(p);
    expect(r.state).toBe('failed');
    expect(r.reason).toMatch(/^throttle refused \(rate_limited\): the contract's rate \(1 per 3600 s, burst 1\) frees a token in \d+ s, beyond the run's wait of 30 s/);
    expect(p.data()).toHaveLength(1);
    const [rl] = await rateLimitsOf(v);
    expect(rl).toMatchObject({ origin: 'contract_rate', retry_after_state: 'own_bucket', attempt: 1, max_attempts: 4, schedule_delay_seconds: 60, exhausted: false, retry_planned: true, run_id: r.runId });
    expect(Number(rl!['applied_delay_seconds'])).toBeGreaterThanOrEqual(3500);
    const r2 = await runWith(p);
    expect(r2.state).toBe('cancelled');
    expect(r2.reason).toMatch(/^acquisition not authorized \(policy\): rate_limited: the contract's backoff holds collection until .* \(attempt 1 of 4, contract rate\)/);
    expect(p.data()).toHaveLength(1);
    expect(await rateLimitsOf(v)).toHaveLength(1);   // a held run records nothing new
  }, 120_000);
});

describe('RL · the publisher\'s 429 + Retry-After on the SYNTHETIC replay set (DP-10-005, D10)', () => {
  const replay = { mode: 'replay' as const, replaySet: 'djibouti-port-vessel-calls', endpoints: [B40_HOSTS.vesselCalls] };
  it('Retry-After HONOURED: the interval recorded with the contract\'s backoff, nothing admitted, the next run held before egress; the read shows the gap', async () => {
    resetReplayAttemptsForTests();
    const v = await v4(replay);
    const r = await runWith(publisher());
    expect(r.state).toBe('failed');
    expect(r.reason).toMatch(/^throttle refused \(rate_limited\): the publisher answered 429 Too Many Requests with Retry-After 60 s; the contract's backoff holds the source 60 s until .* \(attempt 1 of 4, a retry planned\)/);
    expect(r.admitted).toBe(0);
    const a = await authorizationOf(r.runId);
    expect(a['robots']).toMatchObject({ verdict: 'allowed', endpoints: [{ origin: 'https://api.port-djibouti.synthetic.example', allowed: true, matched: 'Allow: /v1/', from: 'fetched' }] });
    expect(await one(sql`select via, outcome from observation.acquisition_robots where source_id = ${h.fx.sourceId}::uuid and contract_version = ${v}`)).toEqual({ via: 'replay', outcome: 'fetched' });
    const [rl] = await rateLimitsOf(v);
    expect(rl).toMatchObject({ origin: 'publisher_429', http_status: 429, retry_after_raw: '60', retry_after_seconds: 60, retry_after_state: 'honoured', attempt: 1,
      schedule_delay_seconds: 60, applied_delay_seconds: 60, exhausted: false, retry_planned: true, endpoint: 'https://api.port-djibouti.synthetic.example/v1/vessel-calls?[redacted]' });
    expect(new Date(String(rl!['interval_to'])).getTime() - new Date(String(rl!['interval_from'])).getTime()).toBe(60_000);
    // the next run: refused BEFORE any request (the replay set's second answer is not consumed)
    const r2 = await runWith(publisher());
    expect(r2.reason).toMatch(/^acquisition not authorized \(policy\): rate_limited: the contract's backoff holds collection until/);
    // the coverage view: the rate-limited interval, holding — not a silent gap
    const read = (await readPolicy()).acquisition as Row;
    const gap = (read['rate_limited'] as Row[]).find((x) => x['rate_limit_id'] === rl!['rate_limit_id']);
    expect(gap).toMatchObject({ state: 'holding', origin: 'publisher_429', retry_after_seconds: 60, applied_delay_seconds: 60, resolved_by_run: null });
    expect(read['hold']).toMatchObject({ rate_limit_id: rl!['rate_limit_id'] });
    // SC: the scheduler's contract retry for that run — at the end of the hold, attempts 1 (not BullMQ's generic schedule)
    const payload = await jobPayload(v);
    const out = await app(ContractBackoffAp).afterOutcome(payload, { state: r.state, runId: r.runId, ...(r.reason === undefined ? {} : { reason: r.reason }) }, true);
    expect(out).toMatchObject({ action: 'retry_enqueued', delaySeconds: 60, rateLimitId: rl!['rate_limit_id'] });
    const job = await app(SchedulerService).contractRetryForTests(h.fx.tenantId, h.fx.domainId, String(rl!['rate_limit_id']));
    expect(job).toMatchObject({ state: 'delayed', delay: 60_000, data: { sourceId: h.fx.sourceId, contractVersion: v } });
    await app(SchedulerService).obliterateForTests(h.fx.tenantId, h.fx.domainId);
  }, 120_000);

  it('NOT honoured, attempts counted and EXHAUSTED; the third answer admitted; both intervals RESOLVED by it', async () => {
    resetReplayAttemptsForTests();
    const v = await v4({ ...replay, ap: { backoff: { schedule_seconds: [1, 2], max_attempts: 2, honour_retry_after: false } } });
    const r1 = await runWith(publisher());
    expect(r1.reason).toMatch(/Retry-After 60 s; the contract's backoff holds the source 1 s .* \(attempt 1 of 2, a retry planned\)/);
    await sleep(1_200);
    const r2 = await runWith(publisher());
    expect(r2.reason).toMatch(/Retry-After 120 s; the contract's backoff holds the source 2 s .* \(attempt 2 of 2, retries exhausted\)/);
    const [a1, a2] = await rateLimitsOf(v);
    expect(a1).toMatchObject({ attempt: 1, retry_after_state: 'not_honoured', retry_after_seconds: 60, applied_delay_seconds: 1, retry_planned: true });
    expect(a2).toMatchObject({ attempt: 2, retry_after_state: 'not_honoured', retry_after_seconds: 120, applied_delay_seconds: 2, exhausted: true, retry_planned: false });
    await sleep(2_200);
    const r3 = await runWith(publisher());
    expect(r3.state, r3.reason).toBe('finished');
    expect(r3.admitted).toBeGreaterThan(0);
    const read = (await readPolicy()).acquisition as Row;
    const mine = (read['rate_limited'] as Row[]).filter((x) => x['contract_version'] === v);
    expect(mine.map((x) => x['state'])).toEqual(['resolved', 'resolved']);
    expect(mine.every((x) => x['resolved_by_run'] === r3.runId)).toBe(true);
  }, 120_000);

  it('F51: an unreadable Retry-After is `unparsed` — the contract\'s schedule applies, never sooner', async () => {
    resetReplayAttemptsForTests();
    const v = await v4(replay);
    fault.arm(['f51.retry_after_parse'], 'test');
    const r = await runWith(publisher());
    expect(r.reason).toMatch(/^throttle refused \(rate_limited\): the publisher answered 429 Too Many Requests with an unreadable Retry-After \("60"\); the contract's backoff holds the source 60 s/);
    expect((await rateLimitsOf(v))[0]).toMatchObject({ retry_after_state: 'unparsed', retry_after_seconds: null, retry_after_raw: '60', applied_delay_seconds: 60 });
  }, 120_000);

  it('THE STREAM FORM: the 429 window and every later window of the run are explicit `rate_limited` ranges — no request sent during the hold', async () => {
    const v = await v4({ backfill: { from: '2021-10-01', to: '2021-10-29', windowDays: 7 } });
    const p = publisher({ status: (_u, n) => (n === 2 ? 429 : 200), headers: (_u, n): Record<string, string> => (n === 2 ? { 'retry-after': '120' } : {}) });
    app(RobotsService).useEgressForTests(p.egress);
    app(CollectionOrchestrator).useEgressForTests(p.egress);
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const out = await h.app.get(ObservationController).openStream(h.req(h.manager, 'observation.stream.open', 'AQS', null, 'observation'), h.fx.tenantId, h.fx.domainId,
      h.fx.sourceId, { payload: { contractVersion: v, partitionKey: `${sourceKey}:backfill`, credit: 1 } }) as unknown as { run: Row; stream: Row };
    expect(out.run['state'], String(out.run['reason'])).toBe('finished');
    expect(p.data()).toHaveLength(2);   // the first window, then the 429 — no later window was requested during the hold
    const ranges = await rows(sql`select reason_class, range_from, detail from observation.acquisition_incomplete_ranges where stream_id = ${String(out.stream['stream_id'])}::uuid order by range_from`);
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    expect(ranges.every((x) => x['reason_class'] === 'rate_limited')).toBe(true);
    expect(ranges[0]).toMatchObject({ range_from: '2021-10-08', detail: expect.stringMatching(/^throttle refused \(rate_limited\): the publisher answered 429 Too Many Requests with Retry-After 120 s/) });
    expect(ranges[1]!['detail']).toMatch(/held by the contract's backoff for the rest of this run \(the publisher's 429, attempt 1\)/);
    expect(out.stream['state']).toBe('closed_incomplete');
    expect(await rateLimitsOf(v)).toEqual([expect.objectContaining({ origin: 'publisher_429', retry_after_seconds: 120, applied_delay_seconds: 120, run_id: out.run['runId'] })]);
    const read = (await readPolicy()).acquisition as Row;
    expect((read['incomplete_ranges'] as Row[]).filter((x) => x['stream_id'] === out.stream['stream_id']).map((x) => x['reason_class'])).toEqual(ranges.map(() => 'rate_limited'));
  }, 120_000);

  it('D8: a v1–v3 contract\'s 429 stays the transport failure it always was — no interval, no hold', async () => {
    const v = await h.newVersion({ from: '2021-08-01', to: '2021-08-03', windowDays: 366 });
    const r = await runWith(publisher({ status: () => 429, headers: () => ({ 'retry-after': '60' }) }));
    expect(r).toMatchObject({ state: 'failed', reason: 'egress refused (transport_failure)' });
    expect(await rateLimitsOf(v.version)).toHaveLength(0);
  }, 120_000);
});

async function jobPayload(version: number): Promise<CollectionJobPayload> {
  const ag = await one(sql`select agent_id, agent_version, code_digest from observation.agents where agent_id = ${h.fx.agentId}::uuid`);
  return { tenantId: h.fx.tenantId, domainId: h.fx.domainId, sourceId: h.fx.sourceId, contractVersion: version, agentId: String(ag['agent_id']),
    agentVersion: String(ag['agent_version']), codeDigest: String(ag['code_digest']), connector: 'rest', correlationId: uuidv7(), budgets: {} };
}

describe('SC · the scheduler: the contract\'s backoff replaces the generic retry for an SRC@v4 source', () => {
  it('an UNAVAILABLE source: the interval recorded with the schedule\'s delay and a contract retry enqueued; an execution fault likewise; a v1–v3 contract untouched', async () => {
    const v = await v4();
    const p = publisher({ status: () => 200 });
    const down = async (a: { url: string }) => { if (new URL(a.url).pathname === '/robots.txt') return p.egress(a); throw new EgressRefused('timeout', 'request exceeded the contract timeout'); };
    app(RobotsService).useEgressForTests(p.egress);
    const r = await h.runOnce(new RestConnector({ egress: down }), v);
    expect(r).toMatchObject({ state: 'failed', reason: 'egress refused (timeout)' });
    const payload = await jobPayload(v);
    const out = await app(ContractBackoffAp).afterOutcome(payload, { state: r.state, runId: r.runId, reason: r.reason as string }, true);
    expect(out).toMatchObject({ action: 'retry_enqueued', delaySeconds: 60 });
    expect((await rateLimitsOf(v))[0]).toMatchObject({ origin: 'unavailable', run_id: r.runId, attempt: 1, schedule_delay_seconds: 60, applied_delay_seconds: 60, retry_after_state: 'absent' });
    expect(await app(SchedulerService).contractRetryForTests(h.fx.tenantId, h.fx.domainId, String(out.rateLimitId))).toMatchObject({ delay: 60_000 });
    // an execution fault: the contract's retry (attempt 2, the schedule's 300 s) — the caller then raises UnrecoverableError
    expect(await app(ContractBackoffAp).afterFault(payload, null, new Error('connection terminated (SYNTHETIC)'))).toBe(true);
    expect((await rateLimitsOf(v))[1]).toMatchObject({ origin: 'unavailable', run_id: null, attempt: 2, applied_delay_seconds: 300 });
    // a v1–v3 contract: untouched
    const v2 = await h.newVersion({ from: '2021-09-01', to: '2021-09-03', windowDays: 366 });
    const pv2 = await jobPayload(v2.version);
    expect(await app(ContractBackoffAp).afterFault(pv2, null, new Error('x'))).toBe(false);
    expect(await app(ContractBackoffAp).afterOutcome(pv2, { state: 'failed', runId: uuidv7(), reason: 'egress refused (timeout)' }, false)).toMatchObject({ action: 'none' });
    await app(SchedulerService).obliterateForTests(h.fx.tenantId, h.fx.domainId);
  }, 120_000);
});

describe('LB · D10: a LOOPBACK throttling publisher through B14\'s one transport substitution, the retry run by the scheduler\'s worker', () => {
  let server: Server | null = null; let dir = ''; let cert = ''; let port = 0;
  const HOST = 'throttle.b40.invalid';
  const answers: number[] = [];
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'eye-b40-ap-'));
    const made = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', join(dir, 'k.pem'),
      '-out', join(dir, 'c.pem'), '-days', '1', '-subj', `/CN=${HOST}`, '-addext', `subjectAltName=DNS:${HOST}`], { encoding: 'utf8' });
    if (made.status !== 0) throw new Error(`openssl: ${made.stderr}`);
    cert = readFileSync(join(dir, 'c.pem'), 'utf8');
    let data = 0;
    server = createServer({ cert, key: readFileSync(join(dir, 'k.pem')) }, (req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('User-agent: *\nAllow: /v1/\nDisallow: /internal/\n'); return; }
      data += 1;
      if (data === 1) { answers.push(429); res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' }); res.end('{"error":"too_many_requests","detail":"SYNTHETIC"}'); return; }
      answers.push(200);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ date: '2026-10-20', port: 'DJJIB', calls: [{ call_id: `VC-L${data}`, vessel: 'SYNTHETIC MV Loopback', state: 'arrived', synthetic: true }] }));
    });
    // the port is the kernel's — and the act-target module is asked BEFORE any request is sent to it (a live address is refused)
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    port = assertSyntheticListener((server.address() as AddressInfo).port);
  });
  afterAll(async () => { await new Promise<void>((r) => (server === null ? r() : server.close(() => r()))); if (dir !== '') rmSync(dir, { recursive: true, force: true }); });

  it('the act-target module refuses the live addresses for a synthetic listener', () => {
    for (const live of [3401, 3000, 3443]) expect(() => assertSyntheticListener(live)).toThrow(ActTargetRefused);
    expect(port).toBeGreaterThan(0);
  });

  it('429 + Retry-After over TLS → the interval recorded → the contract\'s retry enqueued and RUN BY THE WORKER after the hold → admitted, the interval resolved', async () => {
    const url = `https://${HOST}:${port}/v1/vessel-calls?date=2026-10-20`;
    const v = await v4({ endpoints: [url], ap: { backoff: { schedule_seconds: [1, 2, 4], max_attempts: 3, honour_retry_after: true } } });
    const pinned = (a: { url: string; headers: Record<string, string>; policy: Parameters<typeof egressPinned>[0]['policy'] }) =>
      egressPinned({ url: a.url, headers: a.headers, policy: { ...a.policy, trustAnchorPem: cert } }, '127.0.0.1');
    app(RobotsService).useEgressForTests(pinned);
    app(CollectionOrchestrator).useEgressForTests(pinned);
    const scheduler = app(SchedulerService);
    const payload = await jobPayload(v);
    // the first collection, queued as an operator's "collect now" is: the worker runs it, meets the 429, records the attempt, plans the retry
    await scheduler.enqueueOnce(h.fx.tenantId, h.fx.domainId, payload);
    const deadline = Date.now() + 45_000;
    let attempts: Row[] = [];
    while (Date.now() < deadline) {
      attempts = await rows(sql`select job_id, outcome, reason from observation.scheduled_attempts where source_id = ${h.fx.sourceId}::uuid and contract_version = ${v} order by started_at`);
      if (attempts.some((x) => String(x['job_id']).startsWith('ap-retry.') && x['outcome'] === 'finished')) break;
      await sleep(500);
    }
    expect(answers).toEqual([429, 200]);
    expect(attempts[0]).toMatchObject({ outcome: 'failed', reason: expect.stringMatching(/^throttle refused \(rate_limited\): the publisher answered 429 Too Many Requests with Retry-After 1 s; the contract's backoff holds the source 1 s/) });
    const [rl] = await rateLimitsOf(v);
    expect(rl).toMatchObject({ origin: 'publisher_429', retry_after_seconds: 1, retry_after_state: 'honoured', applied_delay_seconds: 1, retry_planned: true });
    expect(attempts.find((x) => x['job_id'] === `ap-retry.${String(rl!['rate_limit_id'])}`)).toMatchObject({ outcome: 'finished' });
    const read = (await readPolicy()).acquisition as Row;
    expect((read['rate_limited'] as Row[]).find((x) => x['rate_limit_id'] === rl!['rate_limit_id'])).toMatchObject({ state: 'resolved' });
    // the production transport refuses the same publisher: its .invalid name does not resolve, its loopback address is not public (what the substitution skips)
    const pol = { hostAllowlist: [HOST, '127.0.0.1'], schemeAllowlist: ['https'], maxRedirects: 0, timeoutMs: 2_000, maxResponseBytes: 1_000_000, maxDecompressedBytes: 1_000_000 };
    expect((await refusal(productionEgress({ url, policy: pol }))).message).toMatch(/could not be resolved|resolved to no addresses/);
    expect((await refusal(productionEgress({ url: `https://127.0.0.1:${port}/v1/vessel-calls`, policy: pol }))).message).toMatch(/not publicly routable/);
    await scheduler.obliterateForTests(h.fx.tenantId, h.fx.domainId);
  }, 120_000);
});

describe('IG · the ingress check, folded into the inspect stage (IntakeStages.inspect, ahead of §IN\'s engines) (DP-10-005, V03-T-072)', () => {
  // B40 integration: the check is FOLDED into IntakeStages.inspect ahead of §IN's engines (intake-stages.ts); the harness no longer composes it
  const compose = () => undefined;
  it('a response whose shape departs from the last consistent one is quarantined `response_anomaly`; the fingerprints recorded (never content)', async () => {
    compose();
    await v4();
    const consistent = (n: number) => JSON.stringify({ dataSets: [], published: `poll ${n} (SYNTHETIC)`, note: 'x'.repeat(300) });
    const r1 = await runWith(publisher({ body: (_u, n) => consistent(n) }));
    expect(r1).toMatchObject({ state: 'finished', quarantined: 0 });
    const r2 = await runWith(publisher({ body: (_u, n) => consistent(n + 10) }));
    expect(r2).toMatchObject({ state: 'finished', quarantined: 0 });
    // the publisher now answers a maintenance envelope under the same media type: the top-level fields changed
    const r3 = await runWith(publisher({ body: () => JSON.stringify({ error: 'maintenance', detail: 'Service notice (SYNTHETIC) '.repeat(12) }) }));
    expect(r3).toMatchObject({ state: 'finished', quarantined: 1, admitted: 0 });
    const q = await one(sql`select reason_class, reason from observation.quarantine_current where run_id = ${r3.runId}::uuid`);
    expect(q).toMatchObject({ reason_class: 'response_anomaly', reason: expect.stringContaining('keys_changed') });
    const fp = await rows(sql`select verdict, root_type, anomaly from observation.acquisition_response_fingerprints where source_id = ${h.fx.sourceId}::uuid and run_id in
      (${r1.runId}::uuid, ${r2.runId}::uuid, ${r3.runId}::uuid) order by observed_at`);
    // B40 integration: the check now runs on EVERY run of an SRC@v4 contract (folded into the inspect stage), so this harness's earlier runs
    // of the same poll already set the baseline — r1 reads `consistent` against it (or `baseline` when it is the first)
    expect(fp.map((x) => x['verdict'])).toEqual([expect.stringMatching(/^(baseline|consistent)$/), 'consistent', 'anomaly']);
    expect(fp[2]!['anomaly']).toEqual([expect.objectContaining({ code: 'keys_changed' })]);
  }, 120_000);
  it('a residency conflict recorded under `record`: what the run fetched is quarantined `residency_conflict` for a person to decide', async () => {
    compose();
    await v4({ residency: 'US', ap: { residency_check: 'record' } });
    const r = await runWith(publisher());
    expect(r).toMatchObject({ state: 'finished', admitted: 0 });
    expect(r.quarantined).toBeGreaterThan(0);
    expect(await one(sql`select reason_class from observation.quarantine_current where run_id = ${r.runId}::uuid limit 1`)).toEqual({ reason_class: 'residency_conflict' });
  }, 120_000);
});

describe('RD · the read (observation.acquisition.read): metadata only, the right readers only', () => {
  it('a collection manager reads the declaration per version, the authorizations, robots and intervals; the agent and another domain are refused', async () => {
    const out = await readPolicy();
    const a = out.acquisition as Row;
    expect(out.receipt.policyDecisionId).toMatch(/^[0-9a-f-]{36}$/);
    expect((a['versions'] as Row[])[0]).toMatchObject({ schema: 'SRC@v4', statement: expect.stringContaining('enforced before and during egress') });
    expect((a['versions'] as Row[]).find((x) => x['schema'] === 'SRC@v1–v3')).toMatchObject({ statement: expect.stringContaining('not declared before SRC@v4') });
    expect((a['authorizations'] as Row[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).not.toMatch(/User-agent|Disallow: \/internal\/\\n/);   // the robots TEXT is never returned (its parsed groups are)
    const agent = await h.sessions.openRunSession({ agentId: h.fx.agentId, tenantId: h.fx.tenantId, domainId: h.fx.domainId,
      agentVersion: new RestConnector().version, codeDigest: new RestConnector().codeDigest, correlationId: uuidv7() });
    expect((await refusal(readPolicy(agent))).status).toBe(403);
    expect((await refusal(readPolicy(h.manager, uuidv7()))).status).toBe(403);
  }, 120_000);
});

describe('FI · the fault points fail closed (D17)', () => {
  it('F53 residency lookup → refused unavailable before any request (recorded)', async () => {
    await v4();
    fault.arm(['f53.residency_lookup'], 'test');
    const p = publisher();
    const r = await runWith(p);
    expect(r.reason).toMatch(/^acquisition not authorized \(unavailable\): the residency profile could not be resolved/);
    expect(p.seen).toHaveLength(0);
    expect((await authorizationOf(r.runId))['residency']).toEqual({ verdict: 'unavailable' });
  }, 60_000);
  it('F52 robots fetch failure → refused unavailable, the failed fetch recorded and never cached', async () => {
    const v = await v4();
    fault.arm(['f52.robots_fetch_failure'], 'test');
    const p = publisher();
    const r = await runWith(p);
    expect(r.reason).toMatch(/^acquisition not authorized \(unavailable\): robots\.txt for https:\/\/backfill\.example could not be fetched/);
    expect(p.seen).toHaveLength(0);
    expect(await rows(sql`select outcome from observation.acquisition_robots where source_id = ${h.fx.sourceId}::uuid and contract_version = ${v}`)).toEqual([{ outcome: 'unavailable' }]);
    const r2 = await runWith(p);          // the next run fetches again (an unavailable fetch is not a cache entry)
    expect(r2.state, r2.reason).toBe('finished');
  }, 60_000);
  it('F50 the bucket unreachable → at the authorization (before egress) and at a request (the request not sent); a real unreachable Redis likewise', async () => {
    await v4();
    fault.arm(['f50.rate_bucket_unavailable'], 'test');
    const p = publisher();
    const r = await runWith(p);
    expect(r.reason).toMatch(/^acquisition not authorized \(unavailable\): the rate bucket could not be reached .* — no request goes out without its rate/);
    expect(p.seen).toHaveLength(0);
    fault.armNth('f50.rate_bucket_unavailable', 2, 'test');   // the authorization's check passes; the first request's take fails
    const r2 = await runWith(p);
    expect(r2.reason).toMatch(/^throttle refused \(unavailable\): the rate bucket could not be reached .* — the request was not sent/);
    expect(p.data()).toHaveLength(0);
    await app(RateBucket).useRedisPortForTests(9);           // nothing listens there
    try {
      const r3 = await runWith(p);
      expect(r3.reason).toMatch(/^acquisition not authorized \(unavailable\): the rate bucket could not be reached/);
      expect(p.data()).toHaveLength(0);
    } finally { await app(RateBucket).useRedisPortForTests(null); }
  }, 60_000);
});
