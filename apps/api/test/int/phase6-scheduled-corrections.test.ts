/**
 * The five findings of the independent review of PR #44 at 761584a6, reproduced through
 * the real database, controller, lifecycle and Redis harness BEFORE being corrected, and
 * kept as the regression afterwards. Each `it` states the corrected expectation; run
 * against the reviewed candidate the failures ARE the reproductions (recorded in
 * SCHEDULED_COLLECTION.md §5), and a case that passes before any change is a refutation
 * — a downstream guard already prevented the consequence — and is recorded as such.
 *
 *  1. UNAVAILABLE EVIDENCE CONFIRMED UNCHANGED — a poll identical to evidence that has
 *     been withdrawn, or whose bytes were governed-deleted, must be admitted as new
 *     evidence (and say what it could not reuse), never "confirmed" against bytes the
 *     platform no longer serves.
 *  2. FRAMED RESPONSES LOSE THEIR PARENT — on an identical repeat the parent no-ops and
 *     its children must no-op too; a child that has to be admitted while its parent is
 *     unchanged must link to the HELD parent's evidence.
 *  3. FRESHNESS — a replayed set is not a live confirmation; a live HTTP 304 IS one when
 *     the held evidence is available; a confirmation never overrides publisher time.
 *  4. READINESS — last success found independently of the newest attempts; counts over
 *     all attempts and said so; a Redis lookup failure is not "absent".
 *  5. FAULTS — an execution fault after run.started is recorded as a FAULT with the run
 *     it belongs to, not as a governance refusal; genuine refusals keep their no-retry.
 *
 * Controlled, and labelled so: synthetic publisher on the orchestrator's test hook and
 * on the harness's direct runs; the 60-second cadence floor; ticks promoted on demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { CollectionWorkerService } from '../../src/observation/scheduling/collection-worker.service.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { CorrectionsService } from '../../src/observation/corrections/corrections.service.js';
import { CoverageFactsService } from '../../src/observation/coverage/facts.service.js';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { EyeConfig } from '../../src/config/config.js';
import * as fault from '../../src/observation/fault-injection.js';
import { vi } from 'vitest';
import { Phase4Harness, SERIES_START, BASE, sdmxWindow } from './phase4-helpers.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness;
let observation: ObservationController;
let scheduler: SchedulerService;
let worker: CollectionWorkerService;
let orchestrator: CollectionOrchestrator;
let corrections: CorrectionsService;
let facts: CoverageFactsService;
let commitDb: Db;

/** The synthetic publisher for the forward endpoint; the backfill window is the Phase 4 synthetic series. */
const pub: { status: number; body: () => string; headers: Record<string, string> } = {
  status: 200, body: () => JSON.stringify({ dataSets: [{ v: 1 }] }), headers: {},
};
const egress = async ({ url }: { url: string }): Promise<EgressResult> => {
  const q = new URL(url).searchParams;
  const backfill = q.get('startPeriod') !== null;
  const status = backfill ? 200 : pub.status;
  const body = backfill ? sdmxWindow(q.get('startPeriod') as string, '2021-01-08') : (status === 304 ? '' : pub.body());
  return {
    status, headers: { 'content-type': 'application/json', ...(backfill ? {} : pub.headers) }, body: Buffer.from(body, 'utf8'),
    finalUrlRedacted: url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.9', retryAfterSeconds: null,
  };
};
const connector = () => new RestConnector({ egress });

/** The poll key the REST connector derives for the fixture's forward endpoint (host + path + a hash of the query). */
const POLL_KEY = (() => { const u = new URL(BASE); return `${u.hostname}${u.pathname}?${createHash('sha256').update(u.search).digest('hex').slice(0, 16)}`; })();

type Evd = { object_id: string; object_version: number; content_digest: string; parent_evd_id: string | null; manifest_id: string; lifecycle_state: string; item_key: string; recorded_at: Date };
/** Latest EVD version per object for the OBS whose item key equals `key` or starts with `key@`, newest first. */
const evidenceFor = async (key: string, exact = false): Promise<Evd[]> =>
  (await sql<Evd>`
    with obs as (select o.object_id, o.payload ->> 'item_key' as item_key from objects.canonical_objects o
                  where o.object_type = 'OBS' and o.payload ->> 'source_id' = ${h.fx.sourceId}
                    and o.payload ->> 'item_key' not like '%@backfill:%'
                    and (${exact} and o.payload ->> 'item_key' = ${key} or not ${exact} and (o.payload ->> 'item_key' = ${key} or regexp_replace(o.payload ->> 'item_key', '@[^#]*', '') = ${key})))
    select distinct on (e.object_id) e.object_id::text as object_id, e.object_version::int as object_version,
           e.payload ->> 'content_digest' as content_digest, e.payload ->> 'parent_evd_id' as parent_evd_id,
           e.payload ->> 'manifest_id' as manifest_id, e.lifecycle_state, obs.item_key, e.recorded_at
      from objects.canonical_objects e join obs on e.payload ->> 'obs_object_id' = obs.object_id::text
     where e.object_type = 'EVD'
     order by e.object_id, e.object_version desc`.execute(h.su)).rows.sort((a, b) => b.recorded_at.getTime() - a.recorded_at.getTime());
const runEvents = async (runId: string) =>
  (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from observation.collection_run_events where run_id = ${runId}::uuid order by occurred_at`.execute(h.su)).rows;
const evidenceCount = async (): Promise<number> =>
  Number((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`}`.execute(h.su)).rows[0]?.n);
const gather = async () => {
  const out = await h.pipeline.consequentialRead(
    h.env(h.manager, 'observation.read.coverage', 'SRC', h.fx.sourceId), h.manager,
    { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.read.coverage', objectType: 'SRC', objectId: h.fx.sourceId },
    ObservationCapability.read, async (cap) => facts.gather(cap, h.fx.sourceId, '2015-01-01T00:00:00Z', new Date(Date.now() + 60_000).toISOString(), null, null));
  return out.result as { lastAdmittedAt: string | null; lastObservedAt?: string | null; lastConfirmedAt?: string | null };
};
const withdraw = async (evdIds: string[], reason: string): Promise<void> => {
  const opened = await h.pipeline.write<{ caseId: string }, never>(
    h.env(h.manager, 'observation.correction.receive', 'COR', null), h.manager,
    { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.correction.receive', objectType: 'COR', objectId: null },
    ObservationCapability.acquisition,
    async (cap, scope) => {
      const r = await corrections.open(cap as never, scope, uuidv7(), { sourceId: h.fx.sourceId, kind: 'withdrawal', channel: 'operator', publisherRef: null, reason, affectedEvdIds: [] });
      return { result: r, targetType: 'COR', targetId: r.caseId, targetVersion: '1', outboxEvent: null };
    });
  await orchestrator.applyCorrection({
    envelope: h.env(h.manager, 'observation.correction.apply', 'COR', opened.result.caseId), principal: h.manager,
    tenantId: h.fx.tenantId, domainId: h.fx.domainId, caseId: opened.result.caseId, decision: 'apply', affectedEvdIds: evdIds, reason,
  });
};
const governedDelete = async (manifestId: string, evdId: string): Promise<void> => {
  await h.pipeline.write(h.env(h.manager, 'observation.quarantine.review', 'EVD', evdId), h.manager,
    { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.quarantine.review', objectType: 'EVD', objectId: evdId },
    ObservationCapability.acquisition,
    async (cap) => { await cap.tombstoneBlob({ tombstoneId: uuidv7(), tenantId: h.fx.tenantId, domainId: h.fx.domainId, manifestId, reason: 'phase 6 review: governed deletion of the held bytes', correlationId: uuidv7() }); return { result: {}, targetType: 'EVD', targetId: evdId, targetVersion: '1', outboxEvent: null }; });
};
/** Register, approve and activate the next live version with an optional expected_schema, through the ports (no schedule) or the route (schedule). */
async function nextVersion(over: { schema?: Record<string, unknown>; viaRoute?: boolean }): Promise<number> {
  const sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid limit 1`.execute(h.su)).rows[0]?.source_key ?? '';
  const version = h.version + 1;
  const base = h.contract(sourceKey, { from: SERIES_START, to: '2021-01-07', windowDays: 366, supersedes: h.version, version }) as Record<string, unknown>;
  const so = base['security_and_operations'] as Record<string, unknown>;
  const contract = over.schema === undefined ? base : { ...base, security_and_operations: { ...so, expected_schema: over.schema } };
  await observation.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { contract, sourceId: h.fx.sourceId } });
  await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', h.fx.sourceId), h.manager,
    { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.source.approve', objectType: 'SRC', objectId: h.fx.sourceId }, ObservationCapability.registry,
    async (cap) => { await cap.approveSource({ sourceId: h.fx.sourceId, contractVersion: version, tenantId: h.fx.tenantId, domainId: h.fx.domainId, decision: 'approve', reason: 'phase 6 corrections', eventId: uuidv7(), correlationId: uuidv7() }); return { result: {}, targetType: 'SRC', targetId: h.fx.sourceId, targetVersion: String(version), outboxEvent: null }; });
  await h.transition(h.version, 'superseded');
  if (over.viaRoute === true) {
    await observation.transitionSource(h.req(h.manager, 'observation.source.transition', 'SRC', h.fx.sourceId, 'observation'), h.fx.tenantId, h.fx.domainId, h.fx.sourceId,
      { payload: { contractVersion: version, target: 'active', reason: 'phase 6 corrections: scheduled' } });
  } else await h.transition(version, 'active');
  h.version = version;
  return version;
}
/** A new version's FIRST run walks its declared backfill and touches no forward endpoint (rest.connector); warm it up. */
const warmUp = async (): Promise<{ runId: string }> => { const r = await h.runOnce(connector()); if (r.state !== 'finished') throw new Error(`warm-up ${r.state}: ${r.reason ?? ''}`); return r; };
const BACKFILL_KEY = `${POLL_KEY}@backfill:2021-01-01..2021-01-07`;
type Attempt = { attempt_id: string; job_id: string; outcome: string; run_id: string | null; reason: string | null; started_at: Date };
const attempts = async (): Promise<Attempt[]> => (await sql<Attempt>`select * from observation.scheduled_attempts where source_id = ${h.fx.sourceId}::uuid order by started_at desc`.execute(h.su)).rows;
const readiness = async () => {
  const r = await observation.sourcesReadiness(h.req(h.manager, 'observation.read.sources', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId, { payload: { limit: 100 } }) as { sources: Array<{ source_id: string; contract_version: number; readiness: { automatic: { last_attempt: { outcome: string } | null; last_success: { outcome: string; run_id: string | null } | null; attempts: Record<string, unknown>; runtime: { redis_scheduler: Record<string, unknown> } } } }> };
  return r.sources.find((s) => s.source_id === h.fx.sourceId && s.contract_version === h.version);
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  observation = h.app.get(O);
  scheduler = h.app.get(SchedulerService);
  worker = h.app.get(CollectionWorkerService);
  orchestrator = h.app.get(CollectionOrchestrator);
  corrections = h.app.get(CorrectionsService);
  facts = h.app.get(CoverageFactsService);
  commitDb = h.app.get(COMMIT_DB);
  orchestrator.useEgressForTests(egress);
}, 300_000);

afterAll(async () => {
  fault.disarm();
  try { await scheduler?.obliterateForTests(h.fx.tenantId, h.fx.domainId); } catch { /* may be closed */ }
  await h?.close();
});

describe('3a · a REPLAYED set is not a live confirmation', () => {
  it('two replay runs of the same frozen set re-admit (Phase 1 §5.12) and leave freshness on the frozen dates, never on the clock', async () => {
    const a = await h.runOnce(new RestConnector(), 1);
    expect(a.state, a.reason).toBe('finished');
    const b = await h.runOnce(new RestConnector(), 1);
    expect(b.state, b.reason).toBe('finished');
    const ev = await runEvents(b.runId);
    const confirmations = ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true);
    const f0 = await gather();
    // a REPLAY keeps Phase 1's rule (§5.12): identical frozen bytes retrieved again are a new observation, and
    // nothing about a replay is a confirmation of the publisher today — freshness stays on the frozen set's dates
    expect(confirmations.length, 'a replay run emitted an unchanged confirmation').toBe(0);
    expect(b.admitted).toBeGreaterThan(0);
    expect(f0.lastConfirmedAt ?? null, 'a replay was counted as a live confirmation').toBeNull();
    const f = await gather();
    expect(f.lastAdmittedAt).not.toBeNull();
    const age = Date.now() - new Date(f.lastObservedAt ?? f.lastAdmittedAt ?? 0).getTime();
    expect(age, `replay confirmations (${confirmations.length}) made freshness report a live age of ${Math.round(age / 1000)} s`).toBeGreaterThan(86_400_000);
  }, 180_000);
});

describe('1 · unavailable evidence is never confirmed unchanged', () => {
  let heldEvd = '';
  it('setup: a live version admits the forward item', async () => {
    await nextVersion({});
    await warmUp();
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const held = await evidenceFor(POLL_KEY);
    expect(held.length).toBe(1);
    heldEvd = held[0]?.object_id as string;
  }, 180_000);

  it('a WITHDRAWN evidence object is not reused: identical bytes are admitted anew and the run says what it could not reuse', async () => {
    await withdraw([heldEvd], 'phase 6 review: the publisher withdrew this item');
    expect((await evidenceFor(POLL_KEY))[0]?.lifecycle_state).toBe('withdrawn');
    const before = await evidenceCount();
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    const confirmed = ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY);
    expect(confirmed, 'identical bytes were confirmed against WITHDRAWN evidence').toEqual([]);
    const admitted = ev.find((e) => e.event === 'item.admitted' && (e.details['item_key'] as string).startsWith(`${POLL_KEY}@`));
    expect(admitted, 'the bytes were not admitted as new evidence').toBeDefined();
    expect((admitted?.details['held_unavailable'] as { reason: string } | undefined)?.reason).toBe('withdrawn');
    expect(await evidenceCount()).toBe(before + 1);
    const latest = (await evidenceFor(POLL_KEY))[0];
    expect(latest?.object_id).not.toBe(heldEvd);
    expect(latest?.lifecycle_state).not.toBe('withdrawn');
  }, 180_000);

  it('GOVERNED-DELETED bytes are not reused either, and the deletion stands', async () => {
    pub.body = () => JSON.stringify({ dataSets: [{ v: 2 }] });
    const r1 = await h.runOnce(connector());
    expect(r1.state, r1.reason).toBe('finished');
    const held = (await evidenceFor(POLL_KEY))[0] as Evd;
    await governedDelete(held.manifest_id, held.object_id);
    const before = await evidenceCount();
    const r2 = await h.runOnce(connector());
    expect(r2.state, r2.reason).toBe('finished');
    const ev = await runEvents(r2.runId);
    expect(ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY), 'identical bytes were confirmed against GOVERNED-DELETED bytes').toEqual([]);
    const admitted = ev.find((e) => e.event === 'item.admitted' && (e.details['item_key'] as string).startsWith(`${POLL_KEY}@`));
    expect((admitted?.details['held_unavailable'] as { reason: string } | undefined)?.reason).toBe('governed-deleted');
    expect(await evidenceCount()).toBe(before + 1);
    // the tombstone is untouched: the deleted manifest stays deleted
    expect(Number((await sql<{ n: string }>`select count(*)::text n from observation.blob_tombstones where manifest_id = ${held.manifest_id}::uuid`.execute(h.su)).rows[0]?.n)).toBe(1);
  }, 180_000);

  it('positive control: available held evidence with identical bytes IS confirmed, once, and stores nothing', async () => {
    const before = await evidenceCount();
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    const confirmed = ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY);
    expect(confirmed.length).toBe(1);
    expect(confirmed[0]?.details['availability']).toBe('verified');
    expect(await evidenceCount()).toBe(before);
  }, 180_000);
});

describe('3b · a live HTTP 304 is a confirmation only when bound to available held evidence', () => {
  it('a 304 after a validator-bearing 200 confirms the held evidence; the source carries publisher time, so freshness stays on it while the confirmation is recorded', async () => {
    pub.body = () => JSON.stringify({ dataSets: [{ v: 3 }] });
    pub.headers = { etag: '"e3"' };
    const r1 = await h.runOnce(connector());
    expect(r1.state, r1.reason).toBe('finished');
    const held = (await evidenceFor(POLL_KEY))[0] as Evd;
    const f0 = await gather();
    pub.status = 304;
    const r2 = await h.runOnce(connector());
    pub.status = 200;
    expect(r2.state, r2.reason).toBe('finished');
    const ev = await runEvents(r2.runId);
    const confirmed = ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY);
    expect(confirmed.length, 'a live 304 produced no confirmation').toBe(1);
    expect(confirmed[0]?.details['revalidated']).toBe('http-304');
    expect(confirmed[0]?.details['evd_object_id']).toBe(held.object_id);
    expect(confirmed[0]?.details['bound']).toBe(true);
    const f1 = await gather();
    expect(new Date(f1.lastConfirmedAt as string).getTime(), 'the live 304 did not register as a confirmation').toBeGreaterThan(new Date(f0.lastConfirmedAt ?? 0).getTime());
    // publisher time preserved: the replayed items carry 2024 publisher dates, and a confirmation cannot make them newer
    expect(f1.lastObservedAt).toBe(f1.lastAdmittedAt);
    expect(new Date(f1.lastAdmittedAt as string).getUTCFullYear()).toBe(2024);
  }, 180_000);

  it('a 304 whose held evidence has been withdrawn is recorded as not-modified but UNBOUND, and is no confirmation', async () => {
    const held = (await evidenceFor(POLL_KEY))[0] as Evd;
    await withdraw([held.object_id], 'phase 6 review: withdrawn before a 304');
    const f0 = await gather();
    pub.status = 304;
    const r = await h.runOnce(connector());
    pub.status = 200;
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    expect(ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === POLL_KEY), 'a 304 was confirmed against withdrawn evidence').toEqual([]);
    const unbound = ev.find((e) => e.event === 'item.noop' && e.details['revalidated'] === 'http-304' && e.details['poll_key'] === POLL_KEY);
    expect(unbound, 'the not-modified answer left no record').toBeDefined();
    expect(unbound?.details['bound']).toBe(false);
    expect(unbound?.details['availability']).toBe('withdrawn');
    const f1 = await gather();
    expect(f1.lastConfirmedAt ?? null, 'an unbound not-modified answer was counted as a confirmation').toEqual(f0.lastConfirmedAt ?? null);
    pub.headers = {};
  }, 180_000);
});

describe('R1 · a 304 confirms the representation its validator names, not the newest held', () => {
  it('held A (ETag A, checkpointed) then B (ETag B, checkpoint lost to f28); the publisher returns to A and answers 304 to If-None-Match: A → A is confirmed, never B', async () => {
    // A, checkpointed
    pub.body = () => JSON.stringify({ dataSets: [{ rep: 'A' }] });
    pub.headers = { etag: '"rep-A"' };
    const rA = await h.runOnce(connector());
    expect(rA.state, rA.reason).toBe('finished');
    const heldA = (await evidenceFor(POLL_KEY))[0] as Evd;
    expect((await h.checkpoint())?.[BASE]).toEqual({ etag: '"rep-A"' });
    // B, admitted but the checkpoint append crashes: B is held, the checkpoint still names A
    pub.body = () => JSON.stringify({ dataSets: [{ rep: 'B' }] });
    pub.headers = { etag: '"rep-B"' };
    fault.arm(['f28.before_checkpoint_append'], 'test');
    const rB = await h.runOnce(connector());
    fault.disarm();
    expect(rB.state).toBe('failed');
    expect(rB.admitted).toBe(1);
    const heldB = (await evidenceFor(POLL_KEY))[0] as Evd;
    expect(heldB.object_id).not.toBe(heldA.object_id);
    expect((await h.checkpoint())?.[BASE]).toEqual({ etag: '"rep-A"' });
    // the publisher is back on A: the conditional request carries If-None-Match: A and is answered 304
    let sawIfNoneMatch: string | null = null;
    const egress304 = async (req: { url: string; headers: Record<string, string> }): Promise<EgressResult> => {
      if (new URL(req.url).searchParams.get('startPeriod') === null) { sawIfNoneMatch = req.headers['if-none-match'] ?? null; if (sawIfNoneMatch === '"rep-A"') return { status: 304, headers: {}, body: Buffer.alloc(0), finalUrlRedacted: req.url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.9', retryAfterSeconds: null }; }
      return egress(req);
    };
    const r = await h.runOnce(new RestConnector({ egress: egress304 }));
    expect(r.state, r.reason).toBe('finished');
    expect(sawIfNoneMatch).toBe('"rep-A"');
    const ev = await runEvents(r.runId);
    const rv = ev.filter((e) => e.event === 'item.noop' && e.details['revalidated'] === 'http-304' && e.details['poll_key'] === POLL_KEY);
    expect(rv.length).toBe(1);
    expect(rv[0]?.details['bound'], 'a 304 to If-None-Match: A was left unbound although A is held and available').toBe(true);
    expect(rv[0]?.details['evd_object_id'], 'a 304 to If-None-Match: A confirmed the newest held representation B').toBe(heldA.object_id);
    expect(rv[0]?.details['validator']).toEqual({ etag: '"rep-A"' });
    // control: the validator names a representation that is no longer available → unbound, no confirmation
    await withdraw([heldA.object_id], 'phase 6 residual: A withdrawn before its 304');
    const r2 = await h.runOnce(new RestConnector({ egress: egress304 }));
    expect(r2.state, r2.reason).toBe('finished');
    const rv2 = (await runEvents(r2.runId)).filter((e) => e.event === 'item.noop' && e.details['revalidated'] === 'http-304' && e.details['poll_key'] === POLL_KEY);
    expect(rv2[0]?.details['bound']).toBe(false);
    expect(rv2[0]?.details['availability']).toBe('withdrawn');
    // control: with the checkpoint back in step (B re-observed), a 304 to If-None-Match: B confirms B
    pub.headers = { etag: '"rep-B"' };
    const rB2 = await h.runOnce(connector());
    expect(rB2.state, rB2.reason).toBe('finished');
    expect((await h.checkpoint())?.[BASE]).toEqual({ etag: '"rep-B"' });
    const egress304B = async (req: { url: string; headers: Record<string, string> }): Promise<EgressResult> => (new URL(req.url).searchParams.get('startPeriod') === null && req.headers['if-none-match'] === '"rep-B"')
      ? { status: 304, headers: {}, body: Buffer.alloc(0), finalUrlRedacted: req.url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.9', retryAfterSeconds: null } : egress(req);
    const r3 = await h.runOnce(new RestConnector({ egress: egress304B }));
    const rv3 = (await runEvents(r3.runId)).filter((e) => e.event === 'item.noop' && e.details['revalidated'] === 'http-304' && e.details['poll_key'] === POLL_KEY);
    expect(rv3[0]?.details['bound']).toBe(true);
    expect(rv3[0]?.details['evd_object_id']).toBe((await evidenceFor(POLL_KEY)).find((e) => e.lifecycle_state !== 'withdrawn')?.object_id);
    pub.headers = {};
  }, 240_000);
});

describe('2 · framed responses keep their parent · 3c · confirmations never override publisher time', () => {
  const framedBody = (bv: number) => JSON.stringify({ features: [
    { attributes: { id: 'a', at: '2024-01-05T00:00:00Z', v: 1 } },
    { attributes: { id: 'b', at: '2024-01-06T00:00:00Z', v: bv } },
  ] });
  const CHILD = (id: string) => `${POLL_KEY}#features:${id}`;
  it('setup: a framed live version re-walks its backfill window — WITHDRAWN before, so admitted anew, not confirmed (finding 1 on the deterministic path) — then admits the parent and two children', async () => {
    const windowEvd = (await sql<{ object_id: string }>`select distinct e.object_id::text as object_id from objects.canonical_objects e join objects.canonical_objects o on o.object_type = 'OBS' and e.payload ->> 'obs_object_id' = o.object_id::text
      where e.object_type = 'EVD' and o.payload ->> 'source_id' = ${h.fx.sourceId} and o.payload ->> 'item_key' = ${BACKFILL_KEY}`.execute(h.su)).rows.map((r) => r.object_id);
    await withdraw(windowEvd, 'phase 6 review: the window withdrawn before a re-walk');
    await nextVersion({ schema: { media_types: ['application/json'], required_fields: [], drift_tolerance: 0, item_path: 'features', item_key_field: 'attributes.id', item_time_field: 'attributes.at' } });
    const w = await warmUp();
    const wev = await runEvents(w.runId);
    expect(wev.filter((e) => e.event === 'item.noop' && e.details['item_key'] === BACKFILL_KEY), 'a re-walked window was confirmed against WITHDRAWN evidence').toEqual([]);
    expect(wev.find((e) => e.event === 'item.admitted' && e.details['item_key'] === BACKFILL_KEY), 'the re-walked window was not admitted anew').toBeDefined();
    pub.body = () => framedBody(1);
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    expect(ev.filter((e) => e.event === 'item.admitted').length).toBe(3);
  }, 180_000);

  it('an identical repeat: the parent is confirmed and so are both children; nothing is admitted', async () => {
    const before = await evidenceCount();
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    const admittedChildren = ev.filter((e) => e.event === 'item.admitted' && String(e.details['item_key']).includes('#features:'));
    expect(admittedChildren, 'framed children were admitted again on an identical repeat').toEqual([]);
    expect(ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true).length).toBe(3);
    expect(await evidenceCount()).toBe(before);
    // 3c — the children carry publisher time (2024-01-05/06): the confirmation must not move freshness to now
    const f = await gather();
    expect(f.lastObservedAt, 'a confirmation overrode publisher time').toBe(f.lastAdmittedAt);
    expect(new Date(f.lastAdmittedAt as string).getUTCFullYear()).toBe(2024);
  }, 180_000);

  it('a child re-admitted under an unchanged parent links to the HELD parent (its own evidence was withdrawn)', async () => {
    const parentHeld = (await evidenceFor(POLL_KEY))[0] as Evd;
    const childA = (await evidenceFor(CHILD('a')))[0] as Evd;
    await withdraw([childA.object_id], 'phase 6 review: child a withdrawn');
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    const readmitted = ev.find((e) => e.event === 'item.admitted' && e.details['poll_key'] === CHILD('a'));
    expect(readmitted, 'the withdrawn child was not re-admitted').toBeDefined();
    const now = (await evidenceFor(CHILD('a'))).find((e) => e.lifecycle_state !== 'withdrawn') as Evd;
    expect(now.parent_evd_id, 'the re-admitted child lost its parent').toBe(parentHeld.object_id);
    expect(ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true).length).toBe(2);
  }, 180_000);

  it('positive control: a changed child is admitted under the new parent, the unchanged child is confirmed', async () => {
    pub.body = () => framedBody(2);
    const r = await h.runOnce(connector());
    expect(r.state, r.reason).toBe('finished');
    const ev = await runEvents(r.runId);
    const parent = ev.find((e) => e.event === 'item.admitted' && !String(e.details['item_key']).includes('#'));
    const b = ev.find((e) => e.event === 'item.admitted' && e.details['poll_key'] === CHILD('b'));
    expect(parent).toBeDefined(); expect(b).toBeDefined();
    expect((await evidenceFor(CHILD('b')))[0]?.parent_evd_id).toBe(parent?.details['evd_object_id']);
    expect(ev.filter((e) => e.event === 'item.noop' && e.details['unchanged'] === true && e.details['poll_key'] === CHILD('a')).length).toBe(1);
  }, 180_000);
});

describe('4 · readiness discloses what it counts and what it could not look up', () => {
  it('one success followed by fifty failures: last success is found independently and the counts say their scope', async () => {
    const runId = (await sql<{ run_id: string }>`select run_id from observation.collection_runs_current where source_id = ${h.fx.sourceId}::uuid and state = 'finished' limit 1`.execute(h.su)).rows[0]?.run_id as string;
    const insert = async (outcome: string, at: Date) => commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('phase 6 review', 60)`.execute(tx);
      await sql`select observation.record_scheduled_attempt(${uuidv7()}::uuid, ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${h.fx.sourceId}::uuid, ${h.version},
        ${`obs:${h.fx.tenantId}:${h.fx.domainId}:src:${h.fx.sourceId}`}, ${'job-' + uuidv7()}, ${at}, ${at}, ${outcome}, ${runId}::uuid, ${outcome === 'failed' ? 'synthetic failure' : null}, 0, 0, 0)`.execute(tx);
    });
    const t0 = Date.now() - 3_600_000;
    await insert('finished', new Date(t0));
    for (let i = 1; i <= 50; i += 1) await insert('failed', new Date(t0 + i * 1000));
    const reg = await readiness();
    expect(reg?.readiness.automatic.last_attempt?.outcome).toBe('failed');
    expect(reg?.readiness.automatic.last_success, 'one success behind fifty failures was reported as none').not.toBeNull();
    expect(reg?.readiness.automatic.last_success?.run_id).toBe(runId);
    const a = reg?.readiness.automatic.attempts as Record<string, unknown>;
    expect(a['finished']).toBe(1); expect(a['failed']).toBe(50);
    expect(a['scope'], 'the counts do not say what they cover').toBe('all');
  }, 120_000);

  it('a Redis lookup failure reads UNKNOWN, not "absent"', async () => {
    const cfg = h.app.get<EyeConfig>(EYE_CONFIG);
    const broken = new SchedulerService({ ...cfg, 'eye.redis.host': '127.0.0.1', 'eye.redis.port': 1 });
    const rt = await broken.describe(h.fx.tenantId, h.fx.domainId, h.fx.sourceId);
    await broken.onModuleDestroy().catch(() => undefined);
    expect((rt.redis_scheduler as { state?: string }).state, 'a lookup failure was reported as the scheduler being absent').toBe('unknown');
  }, 60_000);
});

describe('5 · an execution fault after run.started is a FAULT with its run, not a refusal', () => {
  it('F07 armed under a scheduled job: the attempt is recorded faulted with the opened run, and the bounded retry then finishes', async () => {
    pub.body = () => framedBodyPlain();
    await nextVersion({ viaRoute: true });
    await warmUp();
    const rt = await scheduler.describe(h.fx.tenantId, h.fx.domainId, h.fx.sourceId);
    expect(rt.worker_running).toBe(true);
    const n0 = (await attempts()).length;
    fault.arm(['f07.after_run_start_commit'], 'test');
    await scheduler.promoteDelayedForTests(h.fx.tenantId, h.fx.domainId);
    const until = Date.now() + 60_000;
    let rows: Attempt[] = [];
    while (Date.now() < until) { rows = await attempts(); if (rows.length >= n0 + 1) break; await new Promise((r) => setTimeout(r, 400)); }
    const faulted = rows.find((a) => a.reason?.includes('injected fault') || a.outcome === 'faulted');
    expect(faulted, `no attempt recorded the fault; worker: ${JSON.stringify(worker.lastFailureSeen())}`).toBeDefined();
    expect(faulted?.outcome, 'an execution fault was recorded as a governance refusal').toBe('faulted');
    expect(faulted?.run_id, 'the fault lost its run').not.toBeNull();
    const started = (await runEvents(faulted?.run_id as string)).find((e) => e.event === 'run.started');
    expect(started).toBeDefined();
    // BullMQ's bounded retry runs the job again (the fault fires once) and that attempt finishes
    const until2 = Date.now() + 60_000;
    let done: Attempt | undefined;
    while (Date.now() < until2) { done = (await attempts()).find((a) => a.job_id === faulted?.job_id && a.outcome === 'finished'); if (done) break; await new Promise((r) => setTimeout(r, 500)); }
    expect(done, 'the retried job did not finish').toBeDefined();
  }, 180_000);

  it('R2 · an INFRASTRUCTURE failure while opening the agent session is a FAULT (retried, recovered), not a refusal', async () => {
    const infra = Object.assign(new Error('connection terminated unexpectedly'), { code: '08006' });
    const spy = vi.spyOn(h.sessions, 'openRunSession').mockRejectedValueOnce(infra);
    const n0 = (await attempts()).length;
    await scheduler.promoteDelayedForTests(h.fx.tenantId, h.fx.domainId);
    const until = Date.now() + 60_000;
    let rows: Attempt[] = [];
    while (Date.now() < until) { rows = await attempts(); if (rows.length >= n0 + 1) break; await new Promise((r) => setTimeout(r, 400)); }
    const first = rows.find((a) => a.reason?.includes('connection terminated'));
    expect(first, `no attempt recorded the infrastructure failure; worker: ${JSON.stringify(worker.lastFailureSeen())}`).toBeDefined();
    expect(first?.outcome, 'a database connection failure was recorded as a governance refusal').toBe('faulted');
    expect(first?.run_id).toBeNull();
    // bounded retry: the next attempt on the same job opens a session normally and finishes
    const until2 = Date.now() + 60_000;
    let done: Attempt | undefined;
    while (Date.now() < until2) { done = (await attempts()).find((a) => a.job_id === first?.job_id && a.outcome === 'finished'); if (done) break; await new Promise((r) => setTimeout(r, 500)); }
    expect(done, 'the job was not retried after the infrastructure fault').toBeDefined();
    const job = await scheduler.jobStateForTests(h.fx.tenantId, h.fx.domainId, first?.job_id as string);
    expect(job?.attemptsMade).toBeGreaterThanOrEqual(2);
    spy.mockRestore();
  }, 180_000);

  it('a genuine refusal (agent revoked) is still recorded refused without a run and is not retried', async () => {
    await h.pipeline.write(h.env(h.manager, 'observation.agent.revoke', 'AGT', h.fx.agentId), h.manager,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'observation.agent.revoke', objectType: 'AGT', objectId: h.fx.agentId }, ObservationCapability.registry,
      async (cap) => { await cap.revokeAgent({ agentId: h.fx.agentId, tenantId: h.fx.tenantId, domainId: h.fx.domainId, reason: 'phase 6 review: refusal control', eventId: uuidv7(), correlationId: uuidv7() }); return { result: {}, targetType: 'AGT', targetId: h.fx.agentId, targetVersion: '1', outboxEvent: null }; });
    const n0 = (await attempts()).length;
    await scheduler.promoteDelayedForTests(h.fx.tenantId, h.fx.domainId);
    const until = Date.now() + 60_000;
    let rows: Attempt[] = [];
    while (Date.now() < until) { rows = await attempts(); if (rows.length >= n0 + 1) break; await new Promise((r) => setTimeout(r, 400)); }
    const a = rows[0] as Attempt;
    expect(a.outcome).toBe('refused'); expect(a.run_id).toBeNull();
    const job = await scheduler.jobStateForTests(h.fx.tenantId, h.fx.domainId, a.job_id);
    expect(job?.state).toBe('completed'); expect(job?.attemptsMade).toBe(1);
  }, 120_000);
});

function framedBodyPlain(): string { return JSON.stringify({ dataSets: [{ v: 9 }] }); }
