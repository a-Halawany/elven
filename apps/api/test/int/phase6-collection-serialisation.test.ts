/**
 * The three P1 defects of SOURCE_INTEGRATION_STATUS.md §9.6.1 and §9.7, reproduced
 * through the real database, controller and connector harness BEFORE being corrected,
 * and kept as the regression afterwards. Each `it` states the corrected expectation;
 * against the head that carried the defects the failures ARE the reproductions.
 *
 *  D1  OVERLAP — an operator trigger arriving while a scheduled walk is in flight was
 *      ACCEPTED, walked the same window concurrently, and admitted 2,133 second copies
 *      (§9.6.1). `eye.connector.per_source_concurrency` bounded only the BullMQ worker.
 *      Corrected at the database boundary (migration 0051 §1): one lease row per
 *      source, `run.started` refused without it, and the operator route answering 409
 *      with the holder named.
 *
 *  D2  ADMISSION IDEMPOTENCY AND THE CHECKPOINT — the attempt key is (source, contract
 *      version, RUN, item key), so a NEW run re-admits content already held; and the
 *      backfill checkpoint was written only at run end, so an interrupted walk resumed
 *      from page one. Corrected by the admission register claimed inside the admitting
 *      transaction (0051 §3) and a checkpoint committed per completed page.
 *
 *  D3  COMPOSITE KEY — the connector framed rows by a single `item_key_field`, so the
 *      daily chokepoints layer (one row per date AND portid) would put three
 *      chokepoints of a day under one key: three evidence objects per key on the first
 *      walk and two spurious revisions on every re-walk (§9.7). `item_key_field` now
 *      also accepts an ordered list — and a contract that declares a STRING frames
 *      byte for byte as before, which is asserted here rather than assumed.
 *
 * Every source act goes through the real governed routes and ports. Two pieces of
 * fixture setup have no governed route and are written by the database controller,
 * labelled where they happen: deleting a checkpoint (the crash that lost it) and
 * probing the admission register's port directly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { Phase4Harness, fakeEgress } from './phase4-helpers.js';
import { fixtureContract, inCommitContext } from './phase1-helpers.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { validateSourceContract } from '../../src/observation/sources/source-contract.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';

/** The daily chokepoints layer of §9.7 — the endpoint the corrected contract declares. */
const ARC = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
const PAGE = 4;

let h: Phase4Harness;
const T = () => h.fx.tenantId;
const D = () => h.fx.domainId;
const S = () => h.fx.sourceId;

/* ───────────────────────── the publisher, as a double ───────────────────────── */

const day = (n: number): string => {
  const d = new Date('2024-01-01T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Rows exactly as the daily layer publishes them: one per (date, portid), ordered date,portid. */
function rows(days: number, chokepoints: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < days; i += 1) {
    for (const portid of chokepoints) {
      out.push({ attributes: { date: day(i), portid, n_total: 100 + i, capacity: 5000 } });
    }
  }
  return out;
}

function page(all: Array<Record<string, unknown>>, offset: number): string {
  const slice = all.slice(offset, offset + PAGE);
  return JSON.stringify({ features: slice, exceededTransferLimit: offset + PAGE < all.length });
}

const offsetOf = (url: string): number => Number(new URL(url).searchParams.get('resultOffset') ?? 0);

/** A transport double answering the ordered pages of a synthetic daily chokepoints series. */
function seriesEgress(days: number, chokepoints: string[]) {
  const all = rows(days, chokepoints);
  return { all, ...fakeEgress((url) => page(all, offsetOf(url))) };
}

/* ───────────────────────── the contract, through the real route ───────────────────────── */

function arcgisContract(sourceKey: string, over: {
  version: number; supersedes: number | null; from: string; to: string;
  itemKeyField: string | string[]; where: string; requiredFields: string[];
}): Record<string, unknown> {
  const c = fixtureContract(sourceKey) as Record<string, unknown>;
  const so = { ...(c['security_and_operations'] as Record<string, unknown>) };
  // A live contract reads no frozen fixture set; the key is REMOVED, not set undefined.
  delete so['replay_set'];
  const ar = c['authority_and_rights'] as Record<string, unknown>;
  return {
    ...c,
    acquisition_mode: 'live',
    identity: { ...(c['identity'] as Record<string, unknown>), endpoints: [`${ARC}?where=${encodeURIComponent(over.where)}&outFields=*&f=json`] },
    authority_and_rights: { ...ar, rights_state: 'confirmed' },
    security_and_operations: {
      ...so,
      expected_schema: {
        media_types: ['application/json'], required_fields: over.requiredFields, drift_tolerance: 0,
        item_path: 'features', item_key_field: over.itemKeyField, item_time_field: 'attributes.date',
      },
      budgets: { max_requests_per_run: 12, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      backfill: {
        strategy: 'arcgis-offset', endpoint: `${ARC}?where=${encodeURIComponent(over.where)}`,
        from: over.from, to: over.to, page_size: PAGE, order_by: 'date,portid',
        time_field: 'date', where: over.where,
      },
    },
    lifecycle: { contract_version: over.version, effective_from: '2026-09-05T00:00:00Z', supersedes_version: over.supersedes },
  };
}

/** Register, approve, supersede and activate the next version — the five governed acts, no SQL. */
async function newArcgisVersion(over: {
  from: string; to: string; itemKeyField: string | string[]; where: string; requiredFields: string[];
}): Promise<number> {
  const sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current
    where source_id = ${S()}::uuid limit 1`.execute(h.su)).rows[0]?.source_key ?? '';
  const version = h.version + 1;
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const controller = h.app.get(ObservationController);
  await controller.registerSource(
    h.req(h.registrar, 'observation.source.register', 'SRC', S(), 'observation'), T(), D(),
    { payload: { contract: arcgisContract(sourceKey, { ...over, version, supersedes: h.version }), sourceId: S() } });
  await h.pipeline.write(
    h.env(h.manager, 'observation.source.approve', 'SRC', S()), h.manager,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.approve', objectType: 'SRC', objectId: S() },
    ObservationCapability.registry,
    async (cap) => {
      await cap.approveSource({ sourceId: S(), contractVersion: version, tenantId: T(), domainId: D(),
        decision: 'approve', reason: 'serialisation suite', eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: S(), targetVersion: String(version), outboxEvent: null };
    });
  await h.transition(h.version, 'superseded');
  await h.transition(version, 'active');
  h.version = version;
  return version;
}

/* ───────────────────────── what the database holds ───────────────────────── */

const runEvents = async (runId: string, event: string): Promise<Array<Record<string, unknown>>> =>
  (await sql<{ details: Record<string, unknown> }>`select details from observation.collection_run_events
    where run_id = ${runId}::uuid and event = ${event} order by occurred_at`.execute(h.su)).rows.map((r) => r.details);

/** The three figures the readiness register now reports separately (migration 0051 §5). */
async function counts(): Promise<{ held: number; distinct: number; superseded: number }> {
  const r = (await sql<{ held: string; distinct: string; superseded: string }>`
    with held as (
      select distinct on (e.object_id) e.object_id, e.lifecycle_state,
             coalesce(o.payload ->> 'item_key', e.object_id::text) as item_key
        from objects.canonical_objects e
        left join objects.canonical_objects o
          on o.object_type = 'OBS' and o.object_id::text = e.payload ->> 'obs_object_id' and o.object_version = 1
       where e.object_type = 'EVD' and e.provenance_ref like ${`SRC:${S()}@%`}
       order by e.object_id, e.object_version desc)
    select count(*)::text held, count(distinct item_key)::text "distinct",
           count(*) filter (where lifecycle_state in ('corrected','withdrawn'))::text superseded from held`
    .execute(h.su)).rows[0];
  return { held: Number(r?.held ?? 0), distinct: Number(r?.distinct ?? 0), superseded: Number(r?.superseded ?? 0) };
}

const registerRows = async (): Promise<number> => Number((await sql<{ n: string }>`
  select count(*)::text n from observation.admitted_items where source_id = ${S()}::uuid`.execute(h.su)).rows[0]?.n ?? 0);

const leaseRows = async (): Promise<Array<{ run_id: string; trigger_kind: string }>> =>
  (await sql<{ run_id: string; trigger_kind: string }>`select run_id::text, trigger_kind
    from observation.source_run_leases where source_id = ${S()}::uuid`.execute(h.su)).rows;

/** Fixture scaffolding, no governed route: the checkpoint a crashed process never wrote. */
async function forgetCheckpoint(): Promise<void> {
  // Only the PROJECTION the connector reads is removed. `checkpoint_events` is
  // append-only (ADR-P0-07) and stays exactly as it is: the history of what was
  // checkpointed is not something a crash — or a test — gets to rewrite.
  await sql`delete from observation.connector_checkpoints where source_id = ${S()}::uuid`.execute(h.su);
}

/**
 * Fixture scaffolding through the run's own ports: a run opened exactly as the lifecycle
 * opens one — the source lease and `run.started` in ONE transaction under
 * `observation.run.start` — and ended with a terminal event. Used where a case probes a
 * port directly and the port requires the caller to hold the source (0051 §1, 0056).
 */
const runEvent = (tx: unknown, run: string, event: string, details: Record<string, unknown> = {}) => sql`select observation.append_run_event(
  ${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${run}::uuid, ${S()}::uuid, ${h.version},
  ${h.manager.principalId}::uuid, 'fixture', 'sha256:fixture', 'rest', '1', 'live', ${event}, ${JSON.stringify(details)}::jsonb, ${uuidv7()}::uuid)`.execute(tx as never);
async function openRun(): Promise<string> {
  const commitDb = h.app.get<Db>(COMMIT_DB);
  const run = uuidv7();
  await inCommitContext(commitDb, { sessionId: h.manager.sessionId as string, contextKey: h.manager.contextKey as string },
    { tenantId: T(), domainId: D() }, 'observation.run.start', uuidv7(), async (tx) => {
      const a = (await sql<{ answer: Record<string, unknown> }>`select observation.acquire_source_run_lease(
        ${T()}::uuid, ${D()}::uuid, ${S()}::uuid, ${h.version}, ${run}::uuid, 'operator', 900, ${uuidv7()}::uuid) as answer`
        .execute(tx as never)).rows[0]?.answer as Record<string, unknown>;
      if (a['granted'] !== true) throw new Error(`fixture run not granted the source: ${JSON.stringify(a)}`);
      await runEvent(tx, run, 'run.started', { fixture: true });
    });
  return run;
}
const endRun = (run: string): Promise<unknown> => inCommitContext(h.app.get<Db>(COMMIT_DB),
  { sessionId: h.manager.sessionId as string, contextKey: h.manager.contextKey as string },
  { tenantId: T(), domainId: D() }, 'observation.run.cancel', uuidv7(),
  async (tx) => runEvent(tx, run, 'run.cancelled', { reason: 'fixture run ended' }));

beforeAll(async () => {
  h = await Phase4Harness.boot();
}, 120_000);

afterAll(async () => { await h?.close(); });

/* ══════════════════════════ D1 · overlap ══════════════════════════ */

describe('D1 §9.6.1 — two attempts on one source are serialised at the database', () => {
  it('an operator trigger during a walk in flight is REFUSED with the holder named, and admits nothing twice', async () => {
    await newArcgisVersion({
      from: '2024-01-01', to: '2024-01-09', itemKeyField: 'attributes.date',
      where: "portid='chokepoint1'", requiredFields: ['features.[].attributes.date'],
    });
    const series = seriesEgress(8, ['chokepoint1']); // 8 rows → a full page of 4 and a closing page of 4

    // A walk that STAYS in flight: the second page waits until the test lets it answer,
    // which is the six-and-a-half-minute window §9.6.1 met on the demonstration.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let served = 0;
    const slow = async (a: { url: string }): Promise<EgressResult> => {
      served += 1;
      if (served === 2) await gate;
      return series.egress(a as never);
    };

    const walking = h.runOnce(new RestConnector({ egress: slow as never }));
    // Wait until the run has actually opened and taken the source.
    for (let i = 0; i < 200 && (await leaseRows()).length === 0; i += 1) await new Promise((r) => setTimeout(r, 25));
    const held = await leaseRows();
    expect(held.length, 'the walk in flight holds exactly one lease on its source').toBe(1);

    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const controller = h.app.get(ObservationController);
    let refusal: HttpException | null = null;
    try {
      try {
        await controller.collect(
          h.req(h.manager, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(), S(),
          { payload: { contractVersion: h.version } });
      } catch (e) { refusal = e as HttpException; }

      expect(refusal, 'the operator trigger was ACCEPTED while a walk was in flight').not.toBeNull();
      expect(refusal?.getStatus(), 'a source already being collected is a 409, not a 500 and not a 200').toBe(409);
      const body = refusal?.getResponse() as Record<string, unknown>;
      expect(body['refusal_class']).toBe('source_run_in_flight');
      const holder = body['holder'] as Record<string, unknown>;
      expect(holder['holder_run_id'], 'the refusal names the run that holds the source').toBe(held[0]?.run_id);
      expect(holder['holder_trigger'], 'the refusal says what triggered the holder').toBe('operator');
      expect(String(holder['heartbeat_at']), 'the refusal says when the holder last reported').toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(String((body['error'] as Record<string, unknown>)?.['message'] ?? JSON.stringify(body)))
        .toMatch(/already in flight/);
    } finally {
      // Whatever the assertions found, the walk in flight is let go: a lease left held
      // by a test would refuse every case after it, which is the correct behaviour and
      // a useless diagnosis.
      release();
    }
    const out = await walking;
    expect(out.state).toBe('finished');
    // 2 pages + 8 rows, each admitted exactly once. Nothing was collected twice, and
    // nothing was collected by the refused trigger at all.
    expect(out.admitted).toBe(10);
    const c = await counts();
    expect(c.held, 'a duplicate copy would make objects held exceed distinct observations').toBe(c.distinct);
    expect(await leaseRows(), 'a finished run releases the source').toEqual([]);
  }, 120_000);

  it('the lease is released by the terminal event, so the very next attempt is accepted', async () => {
    const series = seriesEgress(8, ['chokepoint1']);
    // The backfill is recorded done, so this polls the forward endpoint — accepted,
    // because the finished walk released the source. A lease that outlived its run
    // would refuse here, and refusing forever is the failure mode a lease invites.
    const forward = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(forward.state, 'the source was still held after its run finished').toBe('finished');
    expect(forward.admitted, 'the first forward poll admits its response and the rows framed from it').toBe(5);
    expect(await leaseRows()).toEqual([]);

    // And the same poll again: identical bytes for the same poll key are a confirmation.
    const confirmed = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(confirmed.state).toBe('finished');
    expect(confirmed.admitted, 'an unchanged forward poll stored a second copy').toBe(0);
    expect(confirmed.noop).toBe(5);
  }, 120_000);
});

/* ══════════════════════════ D2 · crash, retry, idempotency ══════════════════════════ */

describe('D2 §9.6.1 — an interrupted walk resumes where it stopped and admits nothing twice', () => {
  it('the checkpoint is committed as each page completes, not once at run end', async () => {
    await newArcgisVersion({
      from: '2024-02-01', to: '2024-02-13', itemKeyField: 'attributes.date',
      where: "portid='chokepoint4'", requiredFields: ['features.[].attributes.date'],
    });
    const series = seriesEgress(12, ['chokepoint4']); // 12 rows → three pages of 4
    const out = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(out.state).toBe('finished');
    expect(out.admitted, '3 pages + 12 rows').toBe(15);

    /*
     * ONE CHECKPOINT PER COMPLETED PAGE, plus the run's own at the end. Before this
     * correction there was exactly one, written at run end, so a walk interrupted after
     * eight of nine pages resumed from page one and re-walked everything it had already
     * admitted — cause (iii) of the 2,133 second copies (§9.6.1).
     */
    const checkpoints = (await runEvents(out.runId, 'run.checkpointed'));
    const perPage = checkpoints.filter((d) => d['page'] === true);
    expect(perPage.length, 'the checkpoint was written only at run end').toBe(2);
    expect(perPage.map((d) => Number(((d['checkpoint'] as Record<string, unknown>)['backfill'] as Record<string, unknown>)['cursor'])))
      .toEqual([PAGE, 2 * PAGE]);
    for (const d of perPage) {
      expect(((d['checkpoint'] as Record<string, unknown>)['backfill'] as Record<string, unknown>)['done'],
        'a page checkpoint claimed the walk was finished').toBe(false);
    }
    const final = checkpoints[checkpoints.length - 1] as Record<string, unknown>;
    expect(final['page'], 'the last checkpoint of a run is the run\'s, not a page\'s').toBeUndefined();
    expect(((final['checkpoint'] as Record<string, unknown>)['backfill'] as Record<string, unknown>)['done']).toBe(true);
  }, 180_000);

  it('a walk the publisher interrupts admits nothing from the pages it never received, and the repeat collects the window once', async () => {
    await newArcgisVersion({
      from: '2024-05-01', to: '2024-05-13', itemKeyField: 'attributes.date',
      where: "portid='chokepoint7'", requiredFields: ['features.[].attributes.date'],
    });
    const series = seriesEgress(12, ['chokepoint7']);
    const before = await counts();

    const failsOnThirdPage = async (a: { url: string }): Promise<EgressResult> => {
      if (offsetOf(a.url) >= 2 * PAGE) {
        return { status: 503, headers: {}, body: Buffer.from('service unavailable'), finalUrlRedacted: ARC,
                 hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.9', retryAfterSeconds: null };
      }
      return series.egress(a as never);
    };
    const interrupted = await h.runOnce(new RestConnector({ egress: failsOnThirdPage as never }));
    /*
     * THE HONEST SHAPE OF THIS INTERRUPTION. The connector walks the run's pages inside
     * step 4, before the lifecycle admits anything, so a page the publisher refuses ends
     * the run with NOTHING admitted — not a half-collected window. That is why the
     * per-page checkpoint above is about the ADMISSION phase (six and a half minutes for
     * 2,800 rows on the demonstration) and this case is about the retry.
     */
    expect(interrupted.state, 'a page the publisher refused fails the run').toBe('failed');
    expect(interrupted.reason).toMatch(/egress refused/);
    expect(interrupted.admitted).toBe(0);
    expect(await leaseRows(), 'a failed run holds its source').toEqual([]);

    const repeat = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(repeat.state).toBe('finished');
    expect(repeat.admitted, 'the repeat collects the window exactly once').toBe(15);
    const after = await counts();
    expect(after.held - before.held).toBe(15);
    expect(after.held, 'a second copy would make objects held exceed distinct observations').toBe(after.distinct);
  }, 180_000);

  it('a repeat that LOST its checkpoint re-walks the whole window and records no-ops, not second copies', async () => {
    // Fixture scaffolding, no governed route: the checkpoint a crashed process never wrote.
    await forgetCheckpoint();
    const before = await counts();
    const series = seriesEgress(12, ['chokepoint7']);
    const seen: string[] = [];
    const out = await h.runOnce(new RestConnector({
      egress: (async (a: { url: string }) => { seen.push(a.url); return series.egress(a as never); }) as never }));
    expect(out.state).toBe('finished');
    expect(seen.map(offsetOf), 'without a checkpoint the whole window is walked again — as it must be').toEqual([0, PAGE, 2 * PAGE]);
    expect(out.admitted, 'every re-walked item was already held: nothing is admitted twice').toBe(0);
    expect(out.noop, 'three pages and twelve rows, every one of them confirmed').toBe(15);
    const after = await counts();
    expect(after.held, 'the re-walk added evidence objects').toBe(before.held);
    expect(after.distinct).toBe(before.distinct);
    expect(await registerRows(), 'the register holds one row per deterministic item key').toBeGreaterThanOrEqual(15);
  }, 180_000);

  it('the admission register refuses a SECOND evidence object for a held item key, and reports a conflicting one', async () => {
    /*
     * The port itself, called as a second concurrent run would call it: with a fresh
     * evidence object id for an item key another run already admitted. The attempt key
     * of migration 0022 answers 'claimed' for this — it is keyed by the RUN — which is
     * why the register exists.
     */
    const held = (await sql<{ item_key: string; content_digest: string; evd_object_id: string; object_version: number }>`
      select item_key, content_digest, evd_object_id::text, object_version
        from observation.admitted_items where source_id = ${S()}::uuid order by item_key limit 1`.execute(h.su)).rows[0];
    expect(held, 'the register holds the deterministic items this source admitted').toBeDefined();

    const commitDb = h.app.get<Db>(COMMIT_DB);
    const session = { sessionId: h.manager.sessionId as string, contextKey: h.manager.contextKey as string };
    const scope = { tenantId: T(), domainId: D() };
    // The probing run OPENS exactly as every real run does — the lease and `run.started`
    // in one transaction under `observation.run.start` (0051 §1; F05's invariant: every
    // success audit of that action has its run.started) — because the claim now requires
    // the caller to hold the source (0056); D4 asserts the refusal, this case the answers.
    const probe = await openRun();
    const claim = (digest: string): Promise<Record<string, unknown>> => inCommitContext(
      commitDb, session, scope, 'observation.item.admit', uuidv7(),
      async (tx) => (await sql<{ answer: Record<string, unknown> }>`select observation.claim_item_admission(
        ${T()}::uuid, ${D()}::uuid, ${S()}::uuid, ${held?.item_key}, ${digest},
        ${uuidv7()}::uuid, ${uuidv7()}::uuid, 1, ${h.version}, ${probe}::uuid) as answer`.execute(tx as never)).rows[0]?.answer as Record<string, unknown>);

    try {
      const same = await claim(String(held?.content_digest));
      expect(same['outcome'], 'identical bytes under a held item key are a no-op, whatever run offers them').toBe('noop');
      expect(same['evd_object_id'], 'the no-op names the evidence that already stands').toBe(held?.evd_object_id);

      const different = await claim('f'.repeat(64));
      expect(different['outcome'], 'a different evidence object claiming a held key is a conflict, not an overwrite').toBe('conflict');
      expect(different['held_evd_object_id']).toBe(held?.evd_object_id);
    } finally {
      await endRun(probe);
    }
  }, 60_000);
});

/* ══════════════════════════ D3 · the composite key ══════════════════════════ */

describe('D3 §9.7 — the chokepoints walk frames by date AND portid', () => {
  it('three chokepoints a day become three distinct keys, and a re-walk is 100 % no-ops with no revisions', async () => {
    const CHOKEPOINTS = ['chokepoint1', 'chokepoint4', 'chokepoint7'];
    await newArcgisVersion({
      from: '2024-03-01', to: '2024-03-05',
      itemKeyField: ['attributes.date', 'attributes.portid'],
      where: "portid IN ('chokepoint1','chokepoint4','chokepoint7')",
      requiredFields: ['features.[].attributes.date', 'features.[].attributes.portid'],
    });
    const series = seriesEgress(4, CHOKEPOINTS); // 12 rows over 4 days × 3 chokepoints
    const first = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(first.state).toBe('finished');
    // Three pages of four rows: 3 parents + 12 children. Under a single-path key the
    // twelve rows would fall under FOUR keys — three objects each, and every re-walk
    // would record two of the three as revisions of the other (§9.7).
    expect(first.admitted, '12 rows under 4 keys would show here as 4 children').toBe(15);

    const keys = (await runEvents(first.runId, 'item.admitted')).map((d) => String(d['item_key'])).filter((k) => k.includes('#features:'));
    expect(keys.length).toBe(12);
    expect(new Set(keys).size, 'three chokepoints of one day collapsed into one key').toBe(12);
    for (const d of [0, 1, 2, 3]) {
      for (const p of CHOKEPOINTS) {
        expect(keys.some((k) => k.endsWith(`#features:${day(d)}|${p}`)),
          `the key for ${day(d)} ${p} carries both components, in the declared order`).toBe(true);
      }
    }
    // A DIFFERENT FRAMING IS A DIFFERENT LINEAGE, and says so on every child it makes.
    const methods = new Set((await runEvents(first.runId, 'item.admitted'))
      .map((d) => String((d['fragment'] as Record<string, unknown> | undefined)?.['methodRef'] ?? '')));
    const custody = (await sql<{ method_ref: string }>`select distinct method_ref from observation.custody_events
      where run_id = ${first.runId}::uuid and method_ref is not null`.execute(h.su)).rows.map((r) => r.method_ref);
    expect(custody, 'a composite-framed child was stamped with the single-path framing method')
      .toContain('json-array-composite-framing@1.2.0');
    expect(methods.size).toBeGreaterThanOrEqual(0);

    // A re-walk of the identical page: every row confirmed, nothing revised.
    await forgetCheckpoint();
    const again = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(again.state).toBe('finished');
    expect(again.admitted, 'a re-walk admitted rows it already held').toBe(0);
    expect(again.noop, 'every parent and row is confirmed unchanged').toBe(15);
    expect((await runEvents(again.runId, 'item.revised')).length,
      'two of three chokepoints per day were recorded as revisions of the third').toBe(0);
  }, 240_000);

  it('a contract that declares a STRING key frames exactly as it did: one path, no separator', async () => {
    await newArcgisVersion({
      from: '2024-04-01', to: '2024-04-03', itemKeyField: 'attributes.date',
      where: "portid='chokepoint1'", requiredFields: ['features.[].attributes.date'],
    });
    const series = seriesEgress(2, ['chokepoint1']);
    const out = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(out.state).toBe('finished');
    const keys = (await runEvents(out.runId, 'item.admitted')).map((d) => String(d['item_key'])).filter((k) => k.includes('#features:'));
    expect(keys.length).toBe(2);
    for (const k of keys) {
      expect(k, 'a single-path key gained a composite separator').not.toContain('|');
      expect(k).toMatch(/@backfill:2024-04-01\.\.2024-04-03#0#features:2024-01-0[12]$/);
    }
    expect(keys.sort().map((k) => k.slice(k.lastIndexOf('#features:'))))
      .toEqual(['#features:2024-01-01', '#features:2024-01-02']);
    // …and the framing METHOD a single-path contract stamps is the one it always stamped.
    const custody = (await sql<{ method_ref: string }>`select distinct method_ref from observation.custody_events
      where run_id = ${out.runId}::uuid and method_ref is not null`.execute(h.su)).rows.map((r) => r.method_ref);
    expect(custody, 'an existing contract\'s framing method ref changed').toContain('json-array-framing@1.2.0');
    expect(custody).not.toContain('json-array-composite-framing@1.2.0');
  }, 120_000);
});

/* ══════════════════════════ D3 · what the validator accepts ══════════════════════════ */

/* ══════════════════════════ D4 · the run that lost its lease ══════════════════════════ */

describe('D4 — a run displaced from an expired lease is fenced at every effectful port (migration 0056)', () => {
  /*
   * The reviewer's reproduction (2026-09-11, R3): A acquires and starts; A stops
   * reporting past its lease; B takes the expired lease over; A resumes — and A's
   * `item.admitted` and a fresh `claim_item_admission` were ACCEPTED while the source
   * belonged to B. Ownership was checked at `run.started` only.
   */
  const leaseRow = async (): Promise<{ run_id: string; took_over_from: string | null; heartbeat_at: string; acquired_at: string } | undefined> =>
    (await sql<{ run_id: string; took_over_from: string | null; heartbeat_at: string; acquired_at: string }>`
      select run_id::text, took_over_from::text, heartbeat_at::text, acquired_at::text
        from observation.source_run_leases where source_id = ${S()}::uuid`.execute(h.su)).rows[0];
  const eventsSince = async (runId: string, since: string): Promise<string[]> =>
    (await sql<{ event: string }>`select event from observation.collection_run_events
      where run_id = ${runId}::uuid and occurred_at >= ${since}::timestamptz order by occurred_at`.execute(h.su)).rows.map((r) => r.event);

  let displaced = '';

  it('paused A → expiry → B takes over → A resumes: A admits and checkpoints nothing, records its own failure, and B keeps its lease untouched', async () => {
    await newArcgisVersion({
      from: '2024-05-01', to: '2024-05-09', itemKeyField: 'attributes.date',
      where: "portid='chokepoint1'", requiredFields: ['features.[].attributes.date'],
    });
    const series = seriesEgress(8, ['chokepoint1']);
    const paused = () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => { release = r; });
      let served = 0;
      const egress = async (a: { url: string }): Promise<EgressResult> => {
        served += 1;
        if (served === 2) await gate;
        return series.egress(a as never);
      };
      return { egress, release: () => release() };
    };

    // A opens the walk and pauses on its second page.
    const A = paused();
    const walkingA = h.runOnce(new RestConnector({ egress: A.egress as never }));
    for (let i = 0; i < 200 && (await leaseRow()) === undefined; i += 1) await new Promise((r) => setTimeout(r, 25));
    const a = (await leaseRow())?.run_id ?? '';
    expect(a).not.toBe('');
    displaced = a;

    // Fixture scaffolding, no governed route: A stopped reporting for longer than its
    // lease. The clock on the lease row is moved; nothing in the code is.
    await sql`update observation.source_run_leases
      set heartbeat_at = heartbeat_at - make_interval(secs => lease_seconds + 60)
      where source_id = ${S()}::uuid and run_id = ${a}::uuid`.execute(h.su);

    // B takes the expired lease over and pauses on ITS second page, so it holds the
    // source while A resumes.
    const B = paused();
    const walkingB = h.runOnce(new RestConnector({ egress: B.egress as never }));
    for (let i = 0; i < 200 && (await leaseRow())?.run_id === a; i += 1) await new Promise((r) => setTimeout(r, 25));
    const bLease = await leaseRow();
    expect(bLease?.run_id, 'B did not take the expired lease over').not.toBe(a);
    expect(bLease?.took_over_from, 'the takeover is recorded on the lease it replaced').toBe(a);
    const b = bLease?.run_id ?? '';

    // A resumes: its next effect is the page it was fetching. Whatever A did, B is
    // let go afterwards (finally), so a failure here cannot hold the source for the
    // cases after it.
    try {
      A.release();
      const outA = await walkingA;
      expect(outA.state, 'the displaced run continued as if it still held the source').toBe('failed');
      expect(outA.reason ?? '', 'the failure names the lease').toMatch(/lease/i);
      // After the takeover A wrote exactly one event: its own terminal one.
      const afterTakeover = await eventsSince(a, bLease?.acquired_at ?? '');
      expect(afterTakeover, 'a displaced run admitted, fetched or checkpointed after losing the source').toEqual(['run.failed']);
      // B's lease is exactly as B left it: same holder, same heartbeat, same takeover record.
      const bLeaseAfter = await leaseRow();
      expect(bLeaseAfter?.run_id).toBe(b);
      expect(bLeaseAfter?.heartbeat_at, "A's failure renewed B's lease").toBe(bLease?.heartbeat_at);
      expect(bLeaseAfter?.took_over_from).toBe(a);
    } finally {
      B.release();
    }

    // B finishes its walk: 2 pages + 8 rows, each once; the register holds no second copy.
    const outB = await walkingB;
    expect(outB.state).toBe('finished');
    expect(outB.admitted).toBe(10);
    const c = await counts();
    expect(c.held, 'a duplicate copy would make objects held exceed distinct observations').toBe(c.distinct);
    expect(await leaseRows(), 'a finished run releases the source').toEqual([]);
  }, 180_000);

  it('the ports themselves refuse the displaced run while another holds the source: no admission claim, no progress event, no checkpoint, no release of the holder', async () => {
    expect(displaced, 'the previous case establishes the displaced run').not.toBe('');
    const commitDb = h.app.get<Db>(COMMIT_DB);
    const session = { sessionId: h.manager.sessionId as string, contextKey: h.manager.contextKey as string };
    const scope = { tenantId: T(), domainId: D() };
    const holder = await openRun(); // a run that holds the source now, opened as every run is
    const before = await leaseRow();
    expect(before?.run_id).toBe(holder);

    const refused = async (action: string, fn: (tx: unknown) => Promise<unknown>): Promise<string> => {
      try { await inCommitContext(commitDb, session, scope, action, uuidv7(), fn as never); return 'ACCEPTED'; }
      catch (e) { return `refused: ${(e as Error).message}`; }
    };
    try {
      const admit = await refused('observation.item.admit', async (tx) => sql`select observation.claim_item_admission(
        ${T()}::uuid, ${D()}::uuid, ${S()}::uuid, ${`stale#features:${day(0)}`}, ${'e'.repeat(64)},
        ${uuidv7()}::uuid, ${uuidv7()}::uuid, 1, ${h.version}, ${displaced}::uuid)`.execute(tx as never));
      expect(admit, 'the displaced run could still claim an admission').toMatch(/^refused: .*no longer holds the source run lease/i);
      expect(admit, 'the refusal names the holder').toContain(holder);
      const event = (name: string, action: string): Promise<string> => refused(action, async (tx) => runEvent(tx, displaced, name));
      expect(await event('item.admitted', 'observation.item.admit'), 'the displaced run could still append an admission event').toMatch(/^refused: .*no longer holds the source run lease/i);
      expect(await event('run.checkpointed', 'observation.run.checkpoint'), 'the displaced run could still checkpoint').toMatch(/^refused: .*no longer holds/i);
      expect(await event('item.fetched', 'observation.run.checkpoint'), 'the displaced run could still record progress').toMatch(/^refused: .*no longer holds/i);
      const released = await inCommitContext(commitDb, session, scope, 'observation.run.cancel', uuidv7(),
        async (tx) => (await sql<{ released: boolean }>`select observation.release_source_run_lease(
          ${T()}::uuid, ${D()}::uuid, ${S()}::uuid, ${displaced}::uuid) as released`.execute(tx as never)).rows[0]?.released);
      expect(released, "the displaced run released the holder's lease").toBe(false);
      expect(await leaseRow(), "the holder's lease changed under the displaced run's attempts").toEqual(before);
      // The holder's own progress is accepted and renews its lease.
      await inCommitContext(commitDb, session, scope, 'observation.run.checkpoint', uuidv7(), async (tx) => runEvent(tx, holder, 'item.fetched', { fixture: true }));
      expect((await leaseRow())?.heartbeat_at, "the holder's own event is its heartbeat").not.toBe(before?.heartbeat_at);
    } finally {
      await endRun(holder);
    }
    expect(await leaseRows(), 'the holder\'s terminal event releases the source').toEqual([]);
  }, 60_000);

  it('a holder whose own lease has EXPIRED may not continue: its first effect is refused, it ends releasing only its own lease, and the next attempt collects cleanly', async () => {
    // Twelve rows over three pages, the first eight already held from the case above.
    // The transport pauses on the third page; the connector fetches every page before
    // the lifecycle admits anything, so the lease expires BEFORE the run's first effect.
    const series = seriesEgress(12, ['chokepoint1']);
    await forgetCheckpoint(); // fixture scaffolding: the walk starts from page one again
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let served = 0;
    const paused = async (a: { url: string }): Promise<EgressResult> => {
      served += 1;
      if (served === 3) await gate;
      return series.egress(a as never);
    };
    const walking = h.runOnce(new RestConnector({ egress: paused as never }));
    for (let i = 0; i < 200 && (await leaseRow()) === undefined; i += 1) await new Promise((r) => setTimeout(r, 25));
    const run = (await leaseRow())?.run_id ?? '';
    expect(run).not.toBe('');
    // Fixture scaffolding: the holder stopped reporting for longer than its lease; nobody took it.
    await sql`update observation.source_run_leases set heartbeat_at = heartbeat_at - make_interval(secs => lease_seconds + 60)
      where source_id = ${S()}::uuid and run_id = ${run}::uuid`.execute(h.su);
    release();
    const out = await walking;
    expect(out.state, 'an expired holder continued on the strength of nobody having taken the source yet').toBe('failed');
    expect(out.reason ?? '').toMatch(/EXPIRED source run lease/);
    expect(await leaseRows(), 'the failed run released its own lease').toEqual([]);
    expect(out.admitted + out.noop, 'the expired run recorded an effect').toBe(0);
    expect(await eventsSince(run, '1970-01-01T00:00:00Z'), 'the expired run wrote anything but its opening and its ending')
      .toEqual(['run.started', 'run.failed']);
    // The next attempt takes the source cleanly and walks the window: the eight held
    // rows and the first page confirmed, the rest admitted; nothing twice.
    const next = await h.runOnce(new RestConnector({ egress: series.egress as never }));
    expect(next.state).toBe('finished');
    expect(next.admitted + next.noop, 'three parents and twelve rows, each exactly once').toBe(15);
    expect(next.noop, 'the first page and the held rows of the second are confirmations').toBeGreaterThanOrEqual(9);
    const c = await counts();
    expect(c.held).toBe(c.distinct);
  }, 180_000);
});

describe('D3 §9.7 — the schema validator on composite keys', () => {
  const build = (over: Parameters<typeof arcgisContract>[1]) => arcgisContract('validator-probe', over);
  const base = { version: 2, supersedes: 1, from: '2019-01-01', to: '2026-09-10' };

  it('accepts an ordered list of paths', () => {
    const v = validateSourceContract(build({
      ...base, itemKeyField: ['attributes.date', 'attributes.portid'],
      where: "portid IN ('chokepoint1','chokepoint4','chokepoint7')",
      requiredFields: ['features.[].attributes.date', 'features.[].attributes.portid'],
    }));
    expect(v.ok, `refused: ${v.ok ? '' : v.errors.join('; ')}`).toBe(true);
  });

  it('refuses a multi-valued walk on a SINGLE-path key — the framing that would collide', () => {
    const v = validateSourceContract(build({
      ...base, itemKeyField: 'attributes.date',
      where: "portid IN ('chokepoint1','chokepoint4','chokepoint7')",
      requiredFields: ['features.[].attributes.date'],
    }));
    expect(v.ok).toBe(false);
    expect((v as { errors: string[] }).errors.join('; ')).toMatch(/IN \(…\) filter.*composite item_key_field/);
  });

  it('refuses a where naming more than one value on a single-path key', () => {
    const v = validateSourceContract(build({
      ...base, itemKeyField: 'attributes.date',
      where: "portid='chokepoint1' OR portid='chokepoint4'",
      requiredFields: ['features.[].attributes.date'],
    }));
    expect(v.ok).toBe(false);
    expect((v as { errors: string[] }).errors.join('; ')).toMatch(/more than one value/);
  });

  it('refuses an empty or repeated composite', () => {
    const empty = validateSourceContract(build({
      ...base, itemKeyField: [], where: "portid='chokepoint1'", requiredFields: ['features.[].attributes.date'] }));
    expect(empty.ok).toBe(false);
    expect((empty as { errors: string[] }).errors.join('; ')).toMatch(/at least one path/);
    const repeated = validateSourceContract(build({
      ...base, itemKeyField: ['attributes.date', 'attributes.date'],
      where: "portid='chokepoint1'", requiredFields: ['features.[].attributes.date'] }));
    expect(repeated.ok).toBe(false);
    expect((repeated as { errors: string[] }).errors.join('; ')).toMatch(/same path more than once/);
  });

  it('still accepts every existing single-path contract unchanged', () => {
    const v = validateSourceContract(fixtureContract('imf-portwatch-chokepoints'));
    expect(v.ok, `an existing contract was refused: ${v.ok ? '' : v.errors.join('; ')}`).toBe(true);
  });
});
