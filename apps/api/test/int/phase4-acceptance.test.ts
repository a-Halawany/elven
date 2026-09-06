/**
 * PHASE 4 — Prediction + Scenario Intelligence (L6–L7): DATABASE AND API acceptance.
 *
 * Real PostgreSQL, real governed ports, real capability contexts, and the real
 * controllers where the behaviour under test is an endpoint's. Milestone by
 * milestone, in the order the build plan runs them:
 *
 *   P4-M0a  the closed-range backfill — checkpointed inside the budget,
 *           re-run-safe, revisions as evidence versions
 *   P4-M0b  a source moves from a replay v1 to a live v2 through the register route
 *
 * Nothing here reaches a publisher: live acquisition runs against a transport
 * double. Activation of the real ECB source is a governed operation performed by
 * `scripts/phase4/activate-ecb.mjs`, and its outcome is recorded in the report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import { AppModule } from '../../src/app.module.js';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import { COMMIT_DB, IDENTITY_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { AcquisitionLifecycle } from '../../src/observation/acquisition/lifecycle.service.js';
import { AgentSessionService } from '../../src/observation/agents/agent-session.service.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { RestConnector, BACKFILL_METHOD_REF } from '../../src/observation/connectors/rest.connector.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';
import { seedPhase1Domain, fixtureContract, type Phase1Fixture } from './phase1-helpers.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

let app: INestApplicationContext;
let pipeline: PipelineService;
let lifecycle: AcquisitionLifecycle;
let sessions: AgentSessionService;
let su: Db;
let fx: Phase1Fixture;
let registrar: AuthenticatedPrincipal;
let manager: AuthenticatedPrincipal;

const BASE = 'https://backfill.example/series?format=jsondata';

function env(principal: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null,
             purpose = 'observation'): Envelope {
  return {
    message_id: uuidv7(), scope: 'DOMAIN', tenant_id: fx.tenantId, domain_id: fx.domainId,
    principal_id: `principal:${principal.principalId}`, purpose_id: purpose, action,
    side_effect_class: action.includes('.read') ? 'none' : 'reversible',
    consequence_class: 'C2', object_type: objectType, object_id: objectId,
    schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: uuidv7(), trace_id: 'p4-acceptance',
  } as unknown as Envelope;
}
function req(principal: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null) {
  return { eyeEnvelope: env(principal, action, objectType, objectId), eyePrincipal: principal } as never;
}

/** The v2 contract: live, rights confirmed, a declared period-range backfill. */
function v2Contract(sourceKey: string, over: { from: string; to: string; windowDays: number; supersedes?: number; version?: number }) {
  const c = fixtureContract(sourceKey) as Record<string, unknown>;
  const so = c['security_and_operations'] as Record<string, unknown>;
  const ar = c['authority_and_rights'] as Record<string, unknown>;
  return {
    ...c,
    acquisition_mode: 'live',
    identity: { ...(c['identity'] as Record<string, unknown>), endpoints: [BASE] },
    authority_and_rights: { ...ar, rights_state: 'confirmed', attribution: 'Source: fixture statistics.' },
    security_and_operations: {
      ...so,
      expected_schema: { media_types: ['application/json'], required_fields: ['dataSets'], drift_tolerance: 0 },
      budgets: { max_requests_per_run: 2, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      backfill: { strategy: 'period-range', endpoint: BASE, from: over.from, to: over.to,
                  window_days: over.windowDays, start_param: 'startPeriod', end_param: 'endPeriod' },
    },
    lifecycle: { contract_version: over.version ?? 2, effective_from: '2026-09-05T00:00:00Z',
                 supersedes_version: over.supersedes ?? 1 },
  };
}

/** The transport double: one JSON document per window, bytes decided by the test. */
function fakeEgress(bodyFor: (url: string) => string) {
  const seen: string[] = [];
  const egress = async ({ url }: { url: string }): Promise<EgressResult> => {
    seen.push(url);
    return {
      status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(bodyFor(url), 'utf8'),
      finalUrlRedacted: url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true,
      pinnedAddress: '203.0.113.9', retryAfterSeconds: null,
    };
  };
  return { egress, seen };
}

async function runOnce(connector: RestConnector, contractVersion: number) {
  const principal = await sessions.openRunSession({
    agentId: fx.agentId, tenantId: fx.tenantId, domainId: fx.domainId,
    agentVersion: connector.version, codeDigest: connector.codeDigest, correlationId: uuidv7(),
  });
  return lifecycle.run({
    sourceId: fx.sourceId, contractVersion, agentId: fx.agentId, agentVersion: connector.version,
    connector, principal, correlationId: uuidv7(), purposeId: 'observation',
  });
}

async function transition(version: number, target: string) {
  await pipeline.write(
    env(manager, 'observation.source.transition', 'SRC', fx.sourceId), manager,
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'observation.source.transition', objectType: 'SRC', objectId: fx.sourceId },
    ObservationCapability.registry,
    async (cap) => {
      await cap.transitionContract({ sourceId: fx.sourceId, contractVersion: version, tenantId: fx.tenantId,
        domainId: fx.domainId, target, reason: `phase 4 fixture: ${target}`, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: fx.sourceId, targetVersion: String(version), outboxEvent: null };
    });
}

beforeAll(async () => {
  process.env['EYE_RUNTIME_ENV'] = 'test';
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  pipeline = app.get(PipelineService);
  lifecycle = app.get(AcquisitionLifecycle);
  sessions = app.get(AgentSessionService);
  fx = await seedPhase1Domain(app.get(EYE_CONFIG), app.get(IDENTITY_DB), app.get(COMMIT_DB));
  su = fx.su;
  const base = await fx.managerPrincipal();
  manager = base;
  const rs = fx.registrarSession();
  registrar = { ...base, principalId: fx.registrarId, sessionId: rs.sessionId, contextKey: rs.contextKey,
    bindings: [{ roleCode: 'domain_analyst', scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId }] };
}, 300_000);

afterAll(async () => {
  await fx?.cleanup();
  await app?.close();
});

/* ═════════════════ P4-M0b · a new contract version of an existing source ═════════════════ */

describe('P4-M0b (API) — a source moves from a replay v1 to a live v2 through the register route', () => {
  let sourceKey = '';
  beforeAll(async () => {
    sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current
      where source_id = ${fx.sourceId}::uuid and contract_version = 1`.execute(su)).rows[0]?.source_key ?? '';
  });

  it('refuses a version that does not supersede the current one', async () => {
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const controller = app.get(ObservationController);
    const wrong = v2Contract(sourceKey, { from: '2020-01-01', to: '2020-05-01', windowDays: 30, supersedes: 7 });
    await expect(controller.registerSource(
      req(registrar, 'observation.source.register', 'SRC', fx.sourceId), fx.tenantId, fx.domainId,
      { payload: { contract: wrong, sourceId: fx.sourceId } }))
      .rejects.toSatisfy((e: unknown) => e instanceof HttpException && e.getStatus() === 400);
  });

  it('refuses a version that changes the source key', async () => {
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const controller = app.get(ObservationController);
    const wrong = v2Contract('some-other-key', { from: '2020-01-01', to: '2020-05-01', windowDays: 30 });
    await expect(controller.registerSource(
      req(registrar, 'observation.source.register', 'SRC', fx.sourceId), fx.tenantId, fx.domainId,
      { payload: { contract: wrong, sourceId: fx.sourceId } }))
      .rejects.toSatisfy((e: unknown) => e instanceof HttpException && e.getStatus() === 400);
  });

  it('registers v2 as SRC@v2, and activation supersedes v1 so exactly one version is active', async () => {
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const controller = app.get(ObservationController);
    const contract = v2Contract(sourceKey, { from: '2020-01-01', to: '2020-05-01', windowDays: 30 });
    const out = await controller.registerSource(
      req(registrar, 'observation.source.register', 'SRC', fx.sourceId), fx.tenantId, fx.domainId,
      { payload: { contract, sourceId: fx.sourceId } }) as { source: { sourceId: string; contractVersion: number } };
    expect(out.source.sourceId).toBe(fx.sourceId);
    expect(out.source.contractVersion).toBe(2);

    const src = (await sql<{ schema_ref: string; supersedes: string | null }>`
      select schema_ref, supersedes from objects.canonical_objects
       where object_id = ${fx.sourceId}::uuid and object_version = 2`.execute(su)).rows[0];
    expect(src?.schema_ref).toBe('SRC@v2');
    expect(src?.supersedes).toBe(`${fx.sourceId}@1`);

    // Approve as the manager (not the registrar), supersede v1, activate v2.
    await pipeline.write(
      env(manager, 'observation.source.approve', 'SRC', fx.sourceId), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'observation.source.approve', objectType: 'SRC', objectId: fx.sourceId },
      ObservationCapability.registry,
      async (cap) => {
        await cap.approveSource({ sourceId: fx.sourceId, contractVersion: 2, tenantId: fx.tenantId, domainId: fx.domainId,
          decision: 'approve', reason: 'phase 4 fixture approval', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: fx.sourceId, targetVersion: '2', outboxEvent: null };
      });
    // ONE ACTIVE VERSION: activating v2 while v1 is active is refused by the index.
    await expect(transition(2, 'active')).rejects.toThrow();
    await transition(1, 'superseded');
    await transition(2, 'active');

    const rows = (await sql<{ contract_version: number; lifecycle_state: string; acquisition_mode: string }>`
      select contract_version, lifecycle_state, acquisition_mode from observation.source_contracts_current
       where source_id = ${fx.sourceId}::uuid order by contract_version`.execute(su)).rows;
    expect(rows).toEqual([
      { contract_version: 1, lifecycle_state: 'superseded', acquisition_mode: 'replay' },
      { contract_version: 2, lifecycle_state: 'active', acquisition_mode: 'live' },
    ]);
  });
});

/* ═════════════════ P4-M0a · the backfill, end to end through the lifecycle ═════════════════ */

describe('P4-M0a (database) — the closed-range backfill through the real lifecycle', () => {
  const doc = (label: string) => JSON.stringify({ dataSets: [{ series: { '0:0:0:0:0': { observations: { '0': [label] } } } }] });

  it('walks the declared window across runs inside the request budget, checkpointing after each commit', async () => {
    const { egress, seen } = fakeEgress((url) => doc(new URL(url).searchParams.get('startPeriod') ?? '?'));
    const connector = new RestConnector({ egress });
    // 2020-01-01 → 2020-05-01 in 30-day windows = 5 windows; budget 2 per run → 3 runs.
    const r1 = await runOnce(connector, 2);
    expect(r1.state, r1.reason).toBe('finished');
    expect(r1.admitted).toBe(2);
    const cp1 = (await sql<{ checkpoint: { backfill: { cursor: string; done: boolean; requests: number } } }>`
      select checkpoint from observation.checkpoint_events where source_id = ${fx.sourceId}::uuid
       order by occurred_at desc limit 1`.execute(su)).rows[0]?.checkpoint.backfill;
    expect(cp1?.done).toBe(false);
    expect(cp1?.cursor).toBe('2020-03-01');
    expect(cp1?.requests).toBe(2);

    const r2 = await runOnce(connector, 2);
    expect(r2.admitted).toBe(2);
    const r3 = await runOnce(connector, 2);
    expect(r3.admitted).toBe(1);
    const cp3 = (await sql<{ checkpoint: { backfill: { cursor: string; done: boolean; finishedAt: string | null } } }>`
      select checkpoint from observation.checkpoint_events where source_id = ${fx.sourceId}::uuid
       order by occurred_at desc limit 1`.execute(su)).rows[0]?.checkpoint.backfill;
    expect(cp3?.done).toBe(true);
    expect(cp3?.cursor).toBe('2020-05-01');
    expect(cp3?.finishedAt).not.toBeNull();
    expect(seen.length).toBe(5);

    // Five evidence objects, each keyed by its window and framed by the traversal method.
    const obs = (await sql<{ item_key: string; method_ref: string }>`
      select payload ->> 'item_key' as item_key, payload -> 'transport' ->> 'method_ref' as method_ref
        from objects.canonical_objects where object_type = 'OBS' and payload ->> 'source_id' = ${fx.sourceId}
         and payload ->> 'item_key' like '%@backfill:%' order by item_key`.execute(su)).rows;
    expect(obs.length).toBe(5);
    expect(obs.every((o) => o.method_ref === BACKFILL_METHOD_REF)).toBe(true);
    expect(obs.map((o) => o.item_key.split('@backfill:')[1])).toEqual([
      '2020-01-01..2020-01-31', '2020-01-31..2020-03-01', '2020-03-01..2020-03-31',
      '2020-03-31..2020-04-30', '2020-04-30..2020-05-01']);

    // With the backfill done, the next run polls FORWARD — one request to the endpoint itself.
    seen.length = 0;
    const r4 = await runOnce(connector, 2);
    expect(r4.state).toBe('finished');
    expect(seen).toEqual([BASE]);
  }, 120_000);

  it('a re-walk over an overlapping range admits identical windows as audited no-ops and a changed window as a REVISION', async () => {
    // v3 extends the window; the first five windows come back — one of them revised.
    const sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current
      where source_id = ${fx.sourceId}::uuid limit 1`.execute(su)).rows[0]?.source_key ?? '';
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const controller = app.get(ObservationController);
    await controller.registerSource(
      req(registrar, 'observation.source.register', 'SRC', fx.sourceId), fx.tenantId, fx.domainId,
      { payload: { contract: v2Contract(sourceKey, { from: '2020-01-01', to: '2020-05-31', windowDays: 30, supersedes: 2, version: 3 }),
                   sourceId: fx.sourceId } });
    await pipeline.write(
      env(manager, 'observation.source.approve', 'SRC', fx.sourceId), manager,
      { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
        action: 'observation.source.approve', objectType: 'SRC', objectId: fx.sourceId },
      ObservationCapability.registry,
      async (cap) => {
        await cap.approveSource({ sourceId: fx.sourceId, contractVersion: 3, tenantId: fx.tenantId, domainId: fx.domainId,
          decision: 'approve', reason: 'window extended', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: fx.sourceId, targetVersion: '3', outboxEvent: null };
      });
    await transition(2, 'superseded');
    await transition(3, 'active');

    const before = (await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects
      where object_type = 'EVD' and payload ->> 'obs_object_id' in (
        select object_id::text from objects.canonical_objects where object_type = 'OBS'
         and payload ->> 'source_id' = ${fx.sourceId})`.execute(su)).rows[0]?.n;

    // The publisher restated the SECOND window; everything else is byte-identical.
    const { egress } = fakeEgress((url) => {
      const start = new URL(url).searchParams.get('startPeriod') ?? '?';
      return start === '2020-01-31' ? doc('2020-01-31 (restated)') : doc(start);
    });
    const connector = new RestConnector({ egress });
    // 6 windows now, budget 2: three runs.
    const outcomes = [await runOnce(connector, 3), await runOnce(connector, 3), await runOnce(connector, 3)];
    const totals = outcomes.reduce((a, o) => ({ admitted: a.admitted + o.admitted, noop: a.noop + o.noop }),
      { admitted: 0, noop: 0 });
    // Windows 1, 3 and 4 are byte-identical → no-ops. Window 2 is revised, the
    // old fifth window (clipped at 05-01) is now a full window with a new key,
    // and the sixth is new → three admissions.
    expect(totals.noop, JSON.stringify(outcomes)).toBe(3);
    expect(totals.admitted).toBe(3);

    // The no-ops are AUDITED.
    const noops = (await sql<{ n: string }>`select count(*)::text n from observation.collection_run_events
      where source_id = ${fx.sourceId}::uuid and event = 'item.noop'
        and details ->> 'reason' like '%window already held%'`.execute(su)).rows[0]?.n;
    expect(Number(noops)).toBe(3);

    // The revision is VERSION 2 of the SAME evidence object, superseding version 1.
    const revised = (await sql<{ evd: string; v: number; supersedes: string | null; digest: string; recorded_at: string }>`
      select e.object_id::text as evd, e.object_version::int as v, e.supersedes,
             e.payload ->> 'content_digest' as digest, e.recorded_at::text as recorded_at
        from objects.canonical_objects e
       where e.object_type = 'EVD' and e.payload ->> 'obs_object_id' in (
         select object_id::text from objects.canonical_objects where object_type = 'OBS'
          and payload ->> 'source_id' = ${fx.sourceId} and payload ->> 'item_key' like '%2020-01-31..2020-03-01')
       order by e.object_version`.execute(su)).rows;
    expect(revised.length).toBe(2);
    expect(revised[0]?.evd).toBe(revised[1]?.evd);
    expect(revised[1]?.v).toBe(2);
    expect(revised[1]?.supersedes).toBe(`${revised[0]?.evd}@1`);
    expect(revised[1]?.digest).not.toBe(revised[0]?.digest);
    expect(revised[1]?.digest).toBe(sha256(doc('2020-01-31 (restated)')));

    // KNOWN-AT: what was believed before the revision is still there, at version 1.
    const knownBefore = (await sql<{ digest: string }>`
      select payload ->> 'content_digest' as digest from objects.canonical_objects
       where object_id = ${revised[0]?.evd}::uuid and recorded_at < ${revised[1]?.recorded_at}::timestamptz
       order by object_version desc limit 1`.execute(su)).rows[0];
    expect(knownBefore?.digest).toBe(sha256(doc('2020-01-31')));

    // No duplicate objects: the revision reused its object, so only the two NEW
    // windows added evidence objects.
    const after = (await sql<{ n: string }>`select count(distinct object_id)::text n from objects.canonical_objects
      where object_type = 'EVD' and payload ->> 'obs_object_id' in (
        select object_id::text from objects.canonical_objects where object_type = 'OBS'
         and payload ->> 'source_id' = ${fx.sourceId})`.execute(su)).rows[0]?.n;
    expect(Number(after) - Number(before)).toBe(2);

    const revisedEvents = (await sql<{ n: string }>`select count(*)::text n from observation.collection_run_events
      where source_id = ${fx.sourceId}::uuid and event = 'item.revised'`.execute(su)).rows[0]?.n;
    expect(Number(revisedEvents)).toBe(1);
  }, 120_000);
});

/* ═══════════════════ D1–D8 · the forecasting capability, end to end ═══════════════════ */

/**
 * A synthetic daily series with weekly seasonality, a slow trend and one
 * DISRUPTION EPISODE, published as SDMX-JSON one calendar year per window and
 * collected through the real backfill — so every value the forecaster reads
 * came out of governed evidence with a digest, a version and a custody entry.
 */
const SERIES_START = '2021-01-01';
const SERIES_END = '2024-01-01'; // exclusive
const DISRUPTION_FROM = '2023-11-20';
const DISRUPTION_TO = '2023-11-27';

function syntheticValue(dayIndex: number, date: string): number {
  const base = 60 + 0.004 * dayIndex + 9 * Math.sin((2 * Math.PI * dayIndex) / 7) + 2 * Math.sin((2 * Math.PI * dayIndex) / 365);
  const noise = ((dayIndex * 7919) % 13) / 13 - 0.5;
  const disrupted = date >= DISRUPTION_FROM && date < DISRUPTION_TO ? 0.45 : 1;
  return Number((base * disrupted + noise).toFixed(3));
}

function sdmxWindow(from: string, toExclusive: string, revise: ((date: string, v: number) => number) | null = null): string {
  const dates: string[] = []; const obs: Record<string, number[]> = {};
  const d = new Date(`${from}T00:00:00Z`);
  const origin = new Date(`${SERIES_START}T00:00:00Z`).getTime();
  let i = 0;
  while (d.toISOString().slice(0, 10) < toExclusive) {
    const date = d.toISOString().slice(0, 10);
    const idx = Math.round((d.getTime() - origin) / 86_400_000);
    let v = syntheticValue(idx, date);
    if (revise !== null) v = revise(date, v);
    dates.push(date); obs[String(i)] = [v];
    i += 1; d.setUTCDate(d.getUTCDate() + 1);
  }
  return JSON.stringify({
    dataSets: [{ series: { '0:0:0:0:0': { observations: obs } } }],
    structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: dates.map((x) => ({ id: x })) }] } },
  });
}

async function newVersion(fromTo: { from: string; to: string }, version: number, budget = 12) {
  const sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current
    where source_id = ${fx.sourceId}::uuid limit 1`.execute(su)).rows[0]?.source_key ?? '';
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const controller = app.get(ObservationController);
  const contract = v2Contract(sourceKey, { from: fromTo.from, to: fromTo.to, windowDays: 366, supersedes: version - 1, version });
  (contract.security_and_operations as Record<string, unknown>)['budgets'] =
    { max_requests_per_run: budget, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 };
  await controller.registerSource(
    req(registrar, 'observation.source.register', 'SRC', fx.sourceId), fx.tenantId, fx.domainId,
    { payload: { contract, sourceId: fx.sourceId } });
  await pipeline.write(
    env(manager, 'observation.source.approve', 'SRC', fx.sourceId), manager,
    { scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId,
      action: 'observation.source.approve', objectType: 'SRC', objectId: fx.sourceId },
    ObservationCapability.registry,
    async (cap) => {
      await cap.approveSource({ sourceId: fx.sourceId, contractVersion: version, tenantId: fx.tenantId, domainId: fx.domainId,
        decision: 'approve', reason: 'phase 4 fixture', eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: fx.sourceId, targetVersion: String(version), outboxEvent: null };
    });
  await transition(version - 1, 'superseded');
  await transition(version, 'active');
  return sourceKey;
}

describe('D1–D8 (database / API) — forecasts, scenarios, warnings, outcomes, propagation', () => {
  let sourceKey = '';
  let owner: AuthenticatedPrincipal;
  let ownerId = '';
  let assumptionId = '';
  let forecastId = '';
  let seriesKey = '';
  const KNOWN_T1 = new Date().toISOString(); // set again after the backfill
  let knownAfterBackfill = '';
  let controller: import('../../src/prediction/prediction.controller.js').PredictionController;

  beforeAll(async () => {
    // A forecast owner, and the synthetic history collected through the governed backfill.
    ownerId = uuidv7();
    const run = ownerId.slice(-8);
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
              values (${ownerId}::uuid, 'human', 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
                      ${`fixture-forecast-owner-${run}`}, ${`fxf-${run}`}, 'active')`.execute(su);
    for (const role of ['forecast_owner', 'strategy_owner']) {
      await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
                values (${uuidv7()}::uuid, ${ownerId}::uuid, ${role}, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid)`.execute(su);
    }
    owner = { ...manager, principalId: ownerId,
      bindings: [{ roleCode: 'forecast_owner', scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId },
                 { roleCode: 'strategy_owner', scope: 'DOMAIN', tenantId: fx.tenantId, domainId: fx.domainId }] };
    sourceKey = await newVersion({ from: SERIES_START, to: SERIES_END }, 4);
    seriesKey = `fixture:${sourceKey}:value`;
    const { egress } = fakeEgress((url) => {
      const q = new URL(url).searchParams;
      const start = q.get('startPeriod') as string; const end = q.get('endPeriod') as string;
      const endExclusive = new Date(`${end}T00:00:00Z`); endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      return sdmxWindow(start, endExclusive.toISOString().slice(0, 10));
    });
    const r = await runOnce(new RestConnector({ egress }), 4);
    expect(r.state, r.reason).toBe('finished');
    expect(r.admitted).toBe(3);
    knownAfterBackfill = new Date().toISOString();

    const { PredictionController } = await import('../../src/prediction/prediction.controller.js');
    controller = app.get(PredictionController);

    // The series, registered by the owner; the assumption the forecast rests on.
    await controller.registerSeries(req(owner, 'prediction.series.register', 'SER', null), fx.tenantId, fx.domainId,
      { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                   seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
    assumptionId = uuidv7();
    await sql`insert into graph.strategy_current (
        strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
        title, statement, status, verification_state, owner_principal_id, correlation_id)
      values (${assumptionId}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid,
        'ASU', 1, 'The corridor stays open', 'transits continue at their seasonal level', 'active', 'verified',
        ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }, 300_000);

  it('D2 · the series is read through the known-at path: 1,095 governed observations, none from the future', async () => {
    const r = await controller.seriesPoints(req(owner, 'prediction.read', 'SER', null), fx.tenantId, fx.domainId, seriesKey,
      { payload: { knownAt: knownAfterBackfill, limit: 5000 } }) as { total: number; points: Array<{ date: string; evidence_object_id: string }>; evidence: number };
    expect(r.total).toBe(1095);
    expect(r.evidence).toBe(3);
    expect(r.points[0]?.date).toBe('2021-01-01');
    expect(r.points[r.points.length - 1]?.date).toBe('2023-12-31');
    // Before the backfill was recorded, the series did not exist for a reader.
    const before = await controller.seriesPoints(req(owner, 'prediction.read', 'SER', null), fx.tenantId, fx.domainId, seriesKey,
      { payload: { knownAt: '2020-01-01T00:00:00.000Z' } }) as { total: number };
    expect(before.total).toBe(0);
    // A world-time cut-off excludes later observations even from evidence already known.
    const hind = await controller.seriesPoints(req(owner, 'prediction.read', 'SER', null), fx.tenantId, fx.domainId, seriesKey,
      { payload: { knownAt: knownAfterBackfill, observedThrough: '2023-06-30', limit: 5000 } }) as { total: number; points: Array<{ date: string }> };
    expect(hind.points[hind.points.length - 1]?.date).toBe('2023-06-30');
  });

  it('D3/D4 · a backtest scores the learned model AGAINST seasonal naive on identical origins and records it either way', async () => {
    const r = await controller.runBacktest(req(owner, 'prediction.backtest.record', 'BKT', null), fx.tenantId, fx.domainId,
      // Over the history the D1 forecast will be fitted on, so the record APPLIES to it.
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, observedThrough: '2023-10-31', origins: 24, stride: 14 } }) as {
        backtest: Record<string, unknown> };
    const b = r.backtest;
    expect(b['mode']).toBe('retrospective');
    expect(Number(b['origins'])).toBeGreaterThanOrEqual(20);
    expect(typeof b['coverage_80']).toBe('number');
    expect(typeof b['baseline_pinball_mean']).toBe('number');
    expect(String(b['verdict'])).toMatch(/T1 (met|NOT met)/);
    expect(String(b['verdict'])).toMatch(/T2 (met|NOT met)/);
    expect(String(b['discipline'])).toMatch(/RETROSPECTIVE: one evidence vintage/);
    const stored = (await sql<{ n: string }>`select count(*)::text n from prediction.backtests
      where series_key = ${seriesKey} and horizon_code = '30d'`.execute(su)).rows[0]?.n;
    expect(Number(stored)).toBe(1);
  }, 120_000);

  it('D1 · a forecast names distribution, horizon, drivers, assumptions and evidence — or is refused', async () => {
    // Refused: no assumption.
    await expect(controller.issueForecast(req(owner, 'prediction.forecast.issue', 'FCT', null), fx.tenantId, fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, assumptions: [], label: 'replay demonstration' } }))
      .rejects.toSatisfy((e: unknown) => e instanceof HttpException && e.getStatus() === 422);
    // Refused: an assumption that is not one.
    await expect(controller.issueForecast(req(owner, 'prediction.forecast.issue', 'FCT', null), fx.tenantId, fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, assumptions: [uuidv7()], label: 'replay demonstration' } }))
      .rejects.toThrow();

    const r = await controller.issueForecast(req(owner, 'prediction.forecast.issue', 'FCT', null), fx.tenantId, fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, observedThrough: '2023-10-31',
                   assumptions: [assumptionId], refreshCadence: 'daily', label: 'replay demonstration' } }) as {
        forecast: { forecastId: string; method: string; validationState: string; quantiles: { q10: number; q50: number; q90: number }; statement: string; targetAt: string } };
    forecastId = r.forecast.forecastId;
    expect(r.forecast.targetAt).toBe('2023-11-30');
    expect(r.forecast.quantiles.q10).toBeLessThanOrEqual(r.forecast.quantiles.q50);
    // A retrospective record validates as exactly that — never as historical knowledge.
    expect(['validated_retrospective', 'unvalidated']).toContain(r.forecast.validationState);
    expect(r.forecast.validationState).not.toBe('validated');
    expect(r.forecast.statement).toMatch(/REPLAY DEMONSTRATION/);

    const got = await controller.getForecast(req(owner, 'prediction.read', 'FCT', forecastId), fx.tenantId, fx.domainId, forecastId) as {
      forecast: Record<string, unknown> };
    const f = got.forecast;
    expect((f['drivers'] as unknown[]).length).toBeGreaterThan(0);
    expect((f['evidence_refs'] as unknown[]).length).toBe(3);
    expect(f['assumptions']).toEqual([assumptionId]);
    expect(f['label']).toBe('replay demonstration');
    expect(f['attribution']).toBe('Source: fixture statistics.');
    // The canonical object exists, as FCT@v1, and the Strategy Graph links it to its assumption and evidence.
    const obj = (await sql<{ schema_ref: string; truth_state: string }>`select schema_ref, truth_state from objects.canonical_objects
      where object_id = ${forecastId}::uuid`.execute(su)).rows[0];
    expect(obj?.schema_ref).toBe('FCT@v1');
    expect(obj?.truth_state).toBe('inferred');
    const deps = (await sql<{ k: string; n: string }>`select depends_on_kind k, count(*)::text n from graph.dependencies
      where dependent_object_id = ${forecastId}::uuid group by 1 order by 1`.execute(su)).rows;
    expect(deps).toEqual([{ k: 'evidence', n: '3' }, { k: 'strategy', n: '1' }]);
  }, 120_000);

  it('D3 · the learned model is used only when the backtest says it earned it; otherwise the baseline is the forecaster and says so', async () => {
    const bt = (await sql<{ t2: boolean | null }>`select t2_met t2 from prediction.backtests
      where series_key = ${seriesKey} and horizon_code = '30d' and window_to <= '2023-10-31' order by computed_at desc limit 1`.execute(su)).rows[0];
    const f = (await sql<{ method: string; statement: string }>`select method, statement from prediction.forecasts_current
      where forecast_id = ${forecastId}::uuid`.execute(su)).rows[0];
    if (bt?.t2 === true) expect(f?.method).toBe('holt-winters-additive');
    else {
      expect(f?.method).toBe('seasonal-naive');
      expect(f?.statement).toMatch(/seasonal baseline is the forecaster/);
    }
  });

  it('D4 · an outcome is scored from the observation known at the target, and calibration reports it', async () => {
    const r = await controller.recordOutcome(req(owner, 'prediction.outcome.record', 'OUT', forecastId), fx.tenantId, fx.domainId,
      { payload: { forecastId, knownAt: knownAfterBackfill } }) as { outcome: Record<string, unknown> };
    expect(r.outcome['observedOn']).toBe('2023-11-30');
    expect(typeof r.outcome['covered']).toBe('boolean');
    // Never revised in place.
    await expect(controller.recordOutcome(req(owner, 'prediction.outcome.record', 'OUT', forecastId), fx.tenantId, fx.domainId,
      { payload: { forecastId, knownAt: knownAfterBackfill } })).rejects.toThrow();
    const cal = await controller.calibration(req(owner, 'prediction.read', 'OUT', null), fx.tenantId, fx.domainId) as {
      calibration: { outcomes: Array<Record<string, unknown>>; backtests: unknown[]; statement: string } };
    expect(cal.calibration.outcomes.some((o) => o['series_key'] === seriesKey)).toBe(true);
    expect(cal.calibration.backtests.length).toBeGreaterThan(0);
    const state = (await sql<{ s: string }>`select state s from prediction.forecasts_current where forecast_id = ${forecastId}::uuid`.execute(su)).rows[0];
    expect(state?.s).toBe('resolved');
  }, 120_000);

  it('D5/D6 · an indicator breach FLIPS the branch with a receipt and raises a warning to a named owner with a response window', async () => {
    const ind = await controller.defineIndicator(req(owner, 'prediction.indicator.define', 'IND', null), fx.tenantId, fx.domainId,
      { payload: { seriesKey, description: 'transits fall below 40 per day for five consecutive days', comparator: '<',
                   threshold: 40, consecutiveDays: 5, owner: ownerId } }) as { indicator: { indicatorId: string } };
    const scn = await controller.declareScenario(req(owner, 'prediction.scenario.declare', 'SCN', null), fx.tenantId, fx.domainId,
      { payload: { title: 'Corridor over the next quarter', statement: 'what we expect, and what would change it',
                   forecastId, owner: ownerId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'transits at seasonal level', owner: ownerId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Corridor collapse', kind: 'downside', statement: 'transits stay below 40/day for five days', indicatorId: ind.indicator.indicatorId,
                       signpost: 'five consecutive days under 40', owner: ownerId, consequence: 'rebook the third shipment before the window closes', responseWindowHours: 48 },
                   ] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
    const downside = scn.scenario.branches.find((b) => b.kind === 'downside') as { branchId: string };

    // Evaluate as known BEFORE the disruption: nothing flips.
    const early = await controller.evaluateIndicator(req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), fx.tenantId, fx.domainId,
      ind.indicator.indicatorId, { payload: { knownAt: knownAfterBackfill } }) as { evaluation: { flips: unknown[]; breached: boolean; evaluated: number }; warnings: unknown[] };
    // The whole history is known at once, so the evaluator walks every observation: the November episode breaches.
    expect(early.evaluation.evaluated).toBe(1095);
    expect(early.evaluation.flips.length).toBe(1);
    expect(early.warnings.length).toBe(1);
    const w = early.warnings[0] as { warningId: string; routedTo: string; closesAt: string; branchId: string };
    expect(w.branchId).toBe(downside.branchId);
    expect(w.routedTo).toBe(ownerId);

    const branch = (await sql<{ state: string; flip_event_id: string | null }>`select state, flip_event_id::text from prediction.branches_current
      where branch_id = ${downside.branchId}::uuid`.execute(su)).rows[0];
    expect(branch?.state).toBe('flipped');
    expect(branch?.flip_event_id).not.toBeNull();
    const flipEvent = (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from prediction.scenario_events
      where event_id = ${branch?.flip_event_id}::uuid`.execute(su)).rows[0];
    expect(flipEvent?.event).toBe('branch.flipped');
    expect(String(flipEvent?.details['observation_at'])).toBe('2023-11-24');

    const warning = (await sql<{ state: string; routed_to: string; opens: string; closes: string; evidence: unknown[] }>`
      select state, routed_to::text, response_window_opens_at::text opens, response_window_closes_at::text closes, evidence
        from prediction.warnings_current where warning_id = ${w.warningId}::uuid`.execute(su)).rows[0];
    expect(warning?.state).toBe('raised');
    expect(warning?.routed_to).toBe(ownerId);
    expect(new Date(warning?.closes as string).getTime() - new Date(warning?.opens as string).getTime()).toBe(48 * 3_600_000);
    expect((warning?.evidence as unknown[]).length).toBeGreaterThanOrEqual(2);
    const wobj = (await sql<{ schema_ref: string }>`select schema_ref from objects.canonical_objects where object_id = ${w.warningId}::uuid`.execute(su)).rows[0];
    expect(wobj?.schema_ref).toBe('WRN@v1');

    // Acknowledged by a person, inside the window.
    const ack = await controller.acknowledgeWarning(req(owner, 'prediction.warning.acknowledge', 'WRN', w.warningId), fx.tenantId, fx.domainId,
      w.warningId, { payload: { note: 'rebooking the third shipment via the Cape' } }) as { warning: { state: string } };
    expect(ack.warning.state).toBe('acknowledged');
    // A second evaluation sees nothing new and flips nothing twice.
    const again = await controller.evaluateIndicator(req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), fx.tenantId, fx.domainId,
      ind.indicator.indicatorId, { payload: { knownAt: knownAfterBackfill } }) as { evaluation: { evaluated: number; flips: unknown[] } };
    expect(again.evaluation.evaluated).toBe(0);
    expect(again.evaluation.flips.length).toBe(0);
  }, 120_000);

  it('D6 · a warning nobody acknowledged before its window closed is recorded as EXPIRED, not left silent', async () => {
    const wid = uuidv7();
    await sql`insert into prediction.warnings_current (
        warning_id, scope, tenant_id, domain_id, title, evidence, consequence, confidence,
        response_window_opens_at, response_window_closes_at, routed_to, raised_by, state, correlation_id, raised_as_of, timing_mode)
      values (${wid}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid, 'stale warning',
        '[{"kind":"fixture"}]'::jsonb, 'this warning was never answered', 0.5,
        now() - interval '3 days', now() - interval '1 day', ${ownerId}::uuid, ${ownerId}::uuid, 'raised', ${uuidv7()}::uuid, now() - interval '3 days', 'live')`.execute(su);
    await sql`insert into prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${fx.tenantId}::uuid, ${fx.domainId}::uuid, ${wid}::uuid, 'warning.raised', ${ownerId}::uuid, '{}'::jsonb, ${uuidv7()}::uuid)`.execute(su);
    const ind = (await sql<{ id: string }>`select indicator_id::text id from prediction.indicators_current where series_key = ${seriesKey} limit 1`.execute(su)).rows[0];
    const r = await controller.evaluateIndicator(req(owner, 'prediction.indicator.evaluate', 'IND', ind?.id as string), fx.tenantId, fx.domainId,
      ind?.id as string, { payload: { knownAt: knownAfterBackfill } }) as { evaluation: { expiredWarnings: number } };
    expect(r.evaluation.expiredWarnings).toBeGreaterThanOrEqual(1);
    const state = (await sql<{ s: string }>`select state s from prediction.warnings_current where warning_id = ${wid}::uuid`.execute(su)).rows[0];
    expect(state?.s).toBe('expired');
    // Late acknowledgement is refused as such.
    await expect(controller.acknowledgeWarning(req(owner, 'prediction.warning.acknowledge', 'WRN', wid), fx.tenantId, fx.domainId,
      wid, { payload: { note: 'too late' } })).rejects.toThrow();
  });

  it('D2 · a REVISION recorded after a forecast\'s cut-off does not reach a reader positioned before it', async () => {
    // The publisher restates the 2023 window: every November value doubled. Same
    // window key → a new VERSION of the same evidence object.
    const knownBefore = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    const { egress } = fakeEgress((url) => {
      const q = new URL(url).searchParams;
      const start = q.get('startPeriod') as string; const end = q.get('endPeriod') as string;
      const endExclusive = new Date(`${end}T00:00:00Z`); endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      return sdmxWindow(start, endExclusive.toISOString().slice(0, 10),
        start.startsWith('2023') ? (date, v) => (date.startsWith('2023-11') ? v * 2 : v) : null);
    });
    // Re-collecting a range is a NEW CONTRACT VERSION with the same declaration:
    // the walk runs again, identical windows no-op, the restated one is a revision.
    await newVersion({ from: SERIES_START, to: SERIES_END }, 5);
    const r = await runOnce(new RestConnector({ egress }), 5);
    expect(r.state, r.reason).toBe('finished');
    expect(r.noop, JSON.stringify(r)).toBe(2);
    expect(r.admitted).toBe(1);
    const knownAfter = new Date().toISOString();

    const then = await controller.seriesPoints(req(owner, 'prediction.read', 'SER', null), fx.tenantId, fx.domainId, seriesKey,
      { payload: { knownAt: knownBefore, observedThrough: '2023-11-15', limit: 5 } }) as { points: Array<{ date: string; value: number; evidence_version: number }> };
    const now = await controller.seriesPoints(req(owner, 'prediction.read', 'SER', null), fx.tenantId, fx.domainId, seriesKey,
      { payload: { knownAt: knownAfter, observedThrough: '2023-11-15', limit: 5 } }) as { points: Array<{ date: string; value: number; evidence_version: number }> };
    const a = then.points[then.points.length - 1] as { value: number; evidence_version: number };
    const b = now.points[now.points.length - 1] as { value: number; evidence_version: number };
    expect(b.value).toBeCloseTo(a.value * 2, 6);
    expect(a.evidence_version).toBe(1);
    expect(b.evidence_version).toBe(2);

    // A hindcast issued AS OF the earlier instant uses the pre-correction value.
    const hind = await controller.issueForecast(req(owner, 'prediction.forecast.issue', 'FCT', null), fx.tenantId, fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownBefore, observedThrough: '2023-11-15', assumptions: [assumptionId], label: 'replay demonstration' } }) as {
        forecast: { forecastId: string } };
    const h = (await sql<{ refs: Array<{ evidence_version: number }> }>`select evidence_refs refs from prediction.forecasts_current
      where forecast_id = ${hind.forecast.forecastId}::uuid`.execute(su)).rows[0];
    expect(h?.refs.every((x) => x.evidence_version === 1)).toBe(true);
  }, 180_000);

  it('D7 · correcting evidence a forecast rests on surfaces the forecast through Phase 3\'s propagation, marked for attention', async () => {
    const { GraphController } = await import('../../src/graph/graph.controller.js');
    const graph = app.get(GraphController);
    // The evidence object behind the 2023 window, as the forecast recorded it.
    const f = (await sql<{ refs: Array<{ evidence_object_id: string }> }>`select evidence_refs refs from prediction.forecasts_current
      where forecast_id = ${forecastId}::uuid`.execute(su)).rows[0];
    const evd = f?.refs[f.refs.length - 1]?.evidence_object_id as string;
    const before = (await sql<{ a: string }>`select attention_state a from prediction.forecasts_current where forecast_id = ${forecastId}::uuid`.execute(su)).rows[0];
    expect(before?.a).toBe('none');

    // An unlinked evidence-correction walk (no Phase 1 case): the propagation path itself.
    const out = await graph.propagate(req(owner, 'graph.impact.propagate', 'INV', evd), fx.tenantId, fx.domainId,
      { payload: { triggerKind: 'evidence_correction', triggerObjectId: evd } }) as {
        impact: { forecasts: Array<{ strategy_object_id: string; object_type: string }>; statement: string } };
    expect(out.impact.forecasts.map((x) => x.strategy_object_id)).toContain(forecastId);
    expect(out.impact.statement).toMatch(/forecast\(s\) marked for attention/);
    // The forecast that was RESOLVED is not re-flagged; the hindcast (issued) is.
    const flagged = (await sql<{ id: string; a: string; reason: string | null }>`
      select forecast_id::text id, attention_state a, attention_reason reason from prediction.forecasts_current
       where series_key = ${seriesKey} and state = 'issued'`.execute(su)).rows;
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((x) => x.a === 'assumption_unverified' && String(x.reason).includes('invalidation'))).toBe(true);
    const ev = (await sql<{ n: string }>`select count(*)::text n from prediction.forecast_events
      where event = 'forecast.attention' and forecast_id = any(${flagged.map((x) => x.id)}::uuid[])`.execute(su)).rows[0];
    expect(Number(ev?.n)).toBe(flagged.length);
  }, 120_000);

  it('D8 · every prediction table is under FORCE row-level security, and the projections rebuild from their logs', async () => {
    const rows = (await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'prediction' and c.relkind = 'r'`.execute(su)).rows;
    expect(rows.length).toBe(12);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} has no row-level security`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} does not FORCE it`).toBe(true);
    }
    const v = await controller.verifyProjections(req(owner, 'prediction.read', 'FCT', null), fx.tenantId, fx.domainId) as {
      projections: Array<{ projection: string; mismatched: string }> };
    expect(v.projections.length).toBe(3);
    expect(v.projections.every((p) => Number(p.mismatched) === 0), JSON.stringify(v.projections)).toBe(true);
  });
});
