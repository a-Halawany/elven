/**
 * CP-6 B22.1 (migration 0082) — THE CAPABILITY-NONCE SWEEP NEVER WAITS.
 *
 * Every capability context (ctx.build, under issue_commit / issue_identity_op / issue_publish / issue_schedule_capability) first removes
 * the nonces expired for more than an hour. Until 0082 that was an unconditional DELETE: the rows one transaction's sweep removed stayed
 * row-locked until it ended, and a capability issued on ANOTHER connection meanwhile waited on them. A governed write that awaits another
 * governed operation inside its own transaction (a nested pipeline.write) therefore waited on itself across two connections — the B21
 * rehearsal's wedge — and every login queued behind. 0082 takes the sweep's victims FOR UPDATE SKIP LOCKED, at most 500 per issuance.
 *
 *   N1 · TWO CONNECTIONS: an outer transaction holds its sweep (idle in transaction, as the nested write's outer is); the pre-0082
 *        statement, run on a second connection, WAITS (lock_timeout → 55P03 — the defect reproduced); a capability issued on a second
 *        connection does NOT wait and sweeps rows the outer does not hold; a login (the identity port's session open) completes meanwhile;
 *        the outer commits; the backlog drains in steps of at most 500 (the xmax of each issuance's victims counted from outside).
 *   N2 · THE AUTHORITY IS UNCHANGED: an expired context (wall clock), a context carried into another transaction, a context whose nonce
 *        row has passed its expiry but is not yet swept (the bounded backlog) and a context whose row was swept are all refused.
 *   N3 · THE RESIDUAL NESTED PATHS with aged nonces crossing the sweep line every 10 ms: twin grounding (an observed element read from its
 *        record), forecast issue, backtest and outcome record — each completes, and no backend waits on a lock held by a transaction that is
 *        idle in transaction (the wedge's signature; a holder seen for 3 s is terminated and the case fails naming both). THE CONTROL
 *        (B22_CONTROL=1, a scratch database whose ctx.build is put back to its 0038 body) runs N3 alone and requires each path to wedge.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import pg from 'pg';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import { completeElements } from './phase5-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
const SENTINEL = '00000000-0000-0000-0000-000000000000';
const BATCH = 500; // 0082's bound (the migration's LIMIT)
/** The control run (scratch runner: a database through 0082 with ctx.build put back to its 0038 body) — N3 only. */
const CONTROL = process.env['B22_CONTROL'] === '1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let prediction: PredictionController; let twins: TwinController; let forecastOwner: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

/** A dedicated connection (never the pool): the two-connection proof needs to know which backend holds what. */
async function connect(role: 'publisher' | 'super'): Promise<pg.Client> {
  const user = role === 'publisher' ? (process.env['EYE_DB_PUBLISHER_USER'] ?? 'eye_publisher') : (process.env['EYE_DB_MIGRATE_USER'] ?? 'eye');
  const password = role === 'publisher' ? process.env['EYE_DB_PUBLISHER_PASSWORD'] : process.env['EYE_DB_MIGRATE_PASSWORD'];
  const c = new pg.Client({ host: process.env['EYE_DB_HOST'] ?? 'localhost', port: Number(process.env['EYE_DB_PORT'] ?? 5432), database: process.env['EYE_DB_NAME'] ?? 'eye', user, password });
  await c.connect();
  return c;
}
/** Plants `n` sessionless outbox nonces marked by one issued_at, expiring `firstAgoMs` before now and then one per `stepMs` — a stream crossing the sweep line when the first lies within the hour. */
async function plant(n: number, expiresFrom: string, stepMs: number): Promise<Date> {
  const marker = (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
  await sql`insert into ctx.issued (nonce, session_id, issued_at, expires_at, op_class, bound_action)
            select gen_random_uuid(), ${SENTINEL}::uuid, ${marker}::timestamptz, (${expiresFrom})::timestamptz + (i * make_interval(secs => ${stepMs / 1000}::double precision)), 'outbox', 'objects.outbox.publish'
              from generate_series(1, ${n}) i`.execute(su);
  return marker;
}
const planted = async (marker: Date): Promise<number> => (await sql<{ n: number }>`select count(*)::int n from ctx.issued where issued_at = ${marker}::timestamptz and session_id = ${SENTINEL}::uuid`.execute(su)).rows[0]!.n;
const unplant = (marker: Date) => sql`delete from ctx.issued where issued_at = ${marker}::timestamptz and session_id = ${SENTINEL}::uuid`.execute(su);
/** The planted rows a still-open transaction has deleted, counted from OUTSIDE it (its victims carry its xid as xmax). */
const victimsOf = async (outside: pg.Client, marker: Date, xid: string): Promise<number> =>
  Number((await outside.query(`select count(*)::int n from ctx.issued where issued_at = $1::timestamptz and session_id = $2::uuid and xmax::text = $3`, [marker, SENTINEL, xid])).rows[0].n);

/**
 * THE WATCHDOG: the wedge's signature — a backend waiting on a lock whose holder is IDLE IN TRANSACTION (the outer write awaiting its
 * nested operation). A pair seen for 3 s is the wedge (an ordinary conflict clears in milliseconds): the holder is terminated so the pool
 * and the suite survive, and the case fails naming both.
 */
function watchdog(): { stop: () => Promise<Row | null> } {
  let halt = false; let wedge: Row | null = null;
  const seen = new Map<string, number>();
  const loop = (async () => {
    while (!halt) {
      const rows = (await sql<Row>`select w.pid as waiter_pid, w.wait_event_type as wait_type, w.wait_event, left(w.query, 80) as waiter, r.pid as holder_pid, r.state as holder_state, left(r.query, 100) as holder_query
                                     from pg_stat_activity w join pg_stat_activity r on r.pid = any(pg_blocking_pids(w.pid))
                                    where w.datname = current_database() and w.wait_event_type = 'Lock' and r.state = 'idle in transaction'`.execute(su)).rows;
      const now = Date.now(); const live = new Set<string>();
      for (const r of rows) {
        const key = `${String(r['waiter_pid'])}:${String(r['holder_pid'])}`; live.add(key);
        const since = seen.get(key) ?? now; seen.set(key, since);
        if (now - since >= 3000) { wedge = r; await sql`select pg_terminate_backend(${Number(r['holder_pid'])}::int)`.execute(su); halt = true; break; }
      }
      for (const k of [...seen.keys()]) if (!live.has(k)) seen.delete(k);
      await sleep(200);
    }
  })();
  return { stop: async () => { halt = true; await loop; return wedge; } };
}
/** Runs one nested path under a crossing stream and the watchdog; returns what the path answered. */
async function underStream<X>(what: string, call: () => Promise<X>): Promise<X> {
  // 9,000 nonces crossing the line one per 10 ms from now: every capability issued during the next 90 s finds rows to sweep.
  const marker = await plant(9000, new Date(Date.now() - 3600_000).toISOString(), 10);
  const dog = watchdog();
  let out: X | undefined; let failure: unknown = null;
  try { out = await call(); } catch (e) { failure = e; }
  const wedge = await dog.stop();
  await unplant(marker);
  if (CONTROL) {
    // THE CONTROL (the pre-0082 body restored by the runner): the wedge MUST be seen — the path nests a governed operation in its write.
    expect(wedge, `${what}: the control expected the nested-write wedge on the pre-0082 sweep`).not.toBeNull();
    console.log(`B22.1 CONTROL ${what}: WEDGED on the pre-0082 sweep — ${JSON.stringify(wedge)}`);
    return undefined as X;
  }
  expect(wedge, `${what}: a backend waited on an idle-in-transaction holder (the nested-write wedge): ${JSON.stringify(wedge)}`).toBeNull();
  expect(failure, `${what} did not complete: ${String((failure as { message?: string } | null)?.message ?? failure)}`).toBeNull();
  console.log(`B22.1 EVIDENCE ${what}: completed under 9000 crossing nonces; no idle-in-transaction holder blocked a waiter`);
  return out as X;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  w = await bootDecisionWorld(h);
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  prediction = h.app.get(Pc); twins = h.app.get(Tc);
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b22-forecast-owner');
}, 300_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B22.1 · the capability-nonce sweep never waits (0082)', () => {
  it('N1 · two connections: the pre-0082 sweep waits on an outer transaction\'s victims; the 0082 minter does not, sweeps others, a login completes meanwhile; each later issuance takes one batch of the backlog', async () => {
    // 100,000 nonces expired two hours ago: past the line from the start. The running process's own publisher sweeps them too (one
    // capability per outbox event, a batch each), so the backlog is made far larger than anything it can take during the case.
    const marker = await plant(100_000, new Date(Date.now() - 2 * 3600_000).toISOString(), 1);
    const outer = await connect('publisher'); const inner = await connect('publisher'); const old = await connect('super'); const outside = await connect('super');
    try {
      /* THE OUTER: a transaction whose capability swept, left open (idle in transaction) — the nested write's outer awaiting its inner. */
      await outer.query('begin');
      await outer.query('select ctx.issue_publish(null)');
      const outerXid = String((await outer.query('select pg_current_xact_id()::text x')).rows[0].x);
      const held = await victimsOf(outside, marker, outerXid);
      expect(held, 'the outer issuance swept exactly one batch').toBe(BATCH);

      /* THE DEFECT REPRODUCED: the pre-0082 statement on a second connection waits on the outer's victims (bounded here by lock_timeout). */
      await old.query('begin');
      await old.query(`set local lock_timeout = '1500ms'`);
      const before = Date.now();
      const refused = await old.query(`delete from ctx.issued where expires_at < clock_timestamp() - interval '1 hour'`).then(() => null, (e: { code?: string }) => e.code ?? String(e));
      const waited = Date.now() - before;
      await old.query('rollback');
      expect(refused, 'the unconditional pre-0082 sweep waits on rows another transaction deleted').toBe('55P03');
      expect(waited).toBeGreaterThanOrEqual(1400);

      /* THE REMEDY: a capability issued on a second connection meanwhile returns at once and sweeps rows the outer does not hold. */
      await inner.query('begin');
      await inner.query(`set local lock_timeout = '1500ms'`);
      const t0 = Date.now();
      await inner.query('select ctx.issue_publish(null)');
      const took = Date.now() - t0;
      const innerXid = String((await inner.query('select pg_current_xact_id()::text x')).rows[0].x);
      const innerSwept = await victimsOf(outside, marker, innerXid);
      expect(took, 'the inner issuance did not wait').toBeLessThan(1000);
      expect(innerSwept, 'the inner issuance swept a batch of rows the outer does not hold').toBe(BATCH);
      expect(await victimsOf(outside, marker, outerXid), 'the outer still holds its own').toBe(BATCH);
      await inner.query('commit');

      /* A LOGIN meanwhile: the identity port opens a session (issue_identity_op → ctx.build) while the outer still holds its victims. */
      const t1 = Date.now();
      const person = await h.humanWithSession(['domain_analyst'], 'b22-login-under-held-sweep');
      const loginMs = Date.now() - t1;
      expect(person.sessionId).toBeTruthy();
      expect(loginMs, 'the login did not queue behind the held sweep').toBeLessThan(5000);

      /* THE OUTER ENDS; each later issuance takes the oldest batch of what is left — never more. */
      await outer.query('commit');
      const steps: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        await inner.query('begin');
        await inner.query('select ctx.issue_publish(null)');
        const xid = String((await inner.query('select pg_current_xact_id()::text x')).rows[0].x);
        steps.push(await victimsOf(outside, marker, xid));
        await inner.query('commit');
      }
      expect(steps, 'one issuance sweeps exactly one batch while the backlog lasts').toEqual([BATCH, BATCH, BATCH]);
      const left = await planted(marker);
      expect(left, 'the backlog shrinks by batches').toBeLessThanOrEqual(100_000 - 5 * BATCH);
      console.log(`B22.1 EVIDENCE N1: ${JSON.stringify({ planted: 100_000, outer_held: held, pre_0082_statement: refused, pre_0082_waited_ms: waited, inner_ms: took, inner_swept: innerSwept, login_ms: loginMs, later_steps: steps, left })}`);
    } finally {
      for (const c of [outer, inner, old, outside]) { try { await c.query('rollback'); } catch { /* not in a transaction */ } await c.end(); }
      await unplant(marker);
    }
  }, 120_000);

  it('N2 · the authority is unchanged: an expired context, a context carried into another transaction, an expired-but-unswept nonce and a swept nonce are all refused', async () => {
    const c = await connect('super');
    const build = (ttl: number) => `select set_config('eye.ctx3', ctx.build(null, null, 'PLATFORM', null, null, 'machine', 'harness', 0, 'authority', 'C1', 'tenancy.tenant.create', '', null, null, null, ${ttl}), true) as raw`;
    const denied = async (): Promise<string> => c.query(`select ctx.assert_business_authority('tenancy.tenant.create')`).then(() => 'admitted', (e: { message?: string }) => String(e.message));
    try {
      /* the wall-clock expiry: a one-second context is dead one second later inside the same transaction */
      await c.query('begin');
      await c.query(build(1));
      expect(String((await c.query('select public.eye_ctx_mode() m')).rows[0].m)).toBe('authority');
      await sleep(1200);
      expect(String((await c.query('select public.eye_ctx_mode() m')).rows[0].m)).toBe('none');
      expect(await denied()).toMatch(/authority mode required/);
      await c.query('rollback');
      /* a context carried into another transaction (the txid binding) */
      await c.query('begin');
      const raw = String((await c.query(build(300))).rows[0].raw);
      await c.query('commit');
      await c.query('begin');
      await c.query(`select set_config('eye.ctx3', $1, true)`, [raw]);
      expect(String((await c.query('select public.eye_ctx_mode() m')).rows[0].m), 'another transaction reads no context').toBe('none');
      expect(await denied()).toMatch(/authority mode required/);
      await c.query('rollback');
      /* a live signed context whose nonce row has passed its expiry but is not yet swept (what the bounded sweep leaves behind) */
      await c.query('begin');
      await c.query(build(300));
      await c.query(`update ctx.issued set expires_at = clock_timestamp() - interval '2 hours' where nonce = public.eye_ctx_nonce()`);
      expect(await denied()).toMatch(/context nonce is unknown or expired/);
      await c.query('rollback');
      /* a live signed context whose nonce row was swept */
      await c.query('begin');
      await c.query(build(300));
      await c.query(`delete from ctx.issued where nonce = public.eye_ctx_nonce()`);
      expect(await denied()).toMatch(/context nonce is unknown or expired/);
      await c.query('rollback');
      /* and the unchanged control: a live context with its row passes the nonce check and reaches the live-authority check (which, for a
         context with no subject, refuses on its own ground) */
      await c.query('begin');
      await c.query(build(300));
      expect(await denied()).toMatch(/authority revoked: context carries no subject/);
      await c.query('rollback');
    } finally { try { await c.query('rollback'); } catch { /* none */ } await c.end(); }
  }, 60_000);

  /*
   * N3 — THE RESIDUAL NESTED PATHS, each its own case (the control re-runs them one by one against the pre-0082 body: B22_CONTROL=1 turns
   * each case's expectation around — the wedge MUST be seen — and the record names which path wedged; see evidence/cp6/b22-1-nonce-sweep.txt).
   */
  const issueAt = (label: string) => prediction.issueForecast(h.req(forecastOwner, 'prediction.forecast.issue', 'FCT', null, 'prediction'), T(), D(),
    { payload: { seriesKey: w.seriesKey, horizon: '30d', observedThrough: '2023-06-01', knownAt: new Date().toISOString(), assumptions: [w.assumptionId], label } }) as unknown as Promise<{ forecast: { forecastId: string } }>;

  it('N3.a · twin grounding under a crossing stream: an observed element is established from its record (series.retrieveBytes inside the grounding write) — no wait on its own outer transaction', async () => {
    const twin = (await twins.declare(h.req(w.twinOwner, 'twin.declare', 'TWN', null, 'twin'), T(), D(), { payload: { kind: 'supply-chain', title: 'B22 twin (harness)', statement: 'the magnet chain (B22 nonce-sweep harness)',
      boundary: [w.entityId], owner: w.twinOwner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as unknown as { twin: { twinId: string } }).twin.twinId;
    const version = (await twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', twin, 'twin'), T(), D(), twin, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as unknown as { version: { version: number } }).version.version;
    const elements = completeElements(w.records);
    expect(elements.some((e) => (e as Row)['kind'] === 'observed' && ((e as Row)['citations'] as Row[]).some((c) => c['kind'] === 'evidence')), 'the grounding reads at least one record').toBe(true);
    const mark = (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
    const grounded = await underStream('N3.ground', () => twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', twin, 'twin'), T(), D(), twin, String(version), { payload: { elements } }) as Promise<unknown>);
    if (CONTROL) return;
    expect(grounded).toBeTruthy();
    const retrieved = (await sql<{ n: number }>`select count(*)::int n from audit.audit_events where domain_id = ${D()}::uuid and action = 'observation.evidence.retrieve' and created_at >= ${mark}`.execute(su)).rows[0]!.n;
    expect(retrieved, 'the grounding retrieved its records through the governed read').toBeGreaterThan(0);
  }, 300_000);

  it('N3.b · forecast issue under a crossing stream: the series assembled inside the issuing write (one governed retrieval per evidence version)', async () => {
    const issued = await underStream('N3.issue', () => issueAt('b22 nonce sweep (issue)'));
    if (CONTROL) return;
    expect(issued.forecast.forecastId).toMatch(/^[0-9a-f-]{36}$/);
  }, 300_000);

  it('N3.c · backtest under a crossing stream: the series assembled inside the recording write', async () => {
    const bt = await underStream('N3.backtest', () => prediction.runBacktest(h.req(forecastOwner, 'prediction.backtest.record', 'BKT', null, 'prediction'), T(), D(),
      { payload: { seriesKey: w.seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough: '2023-06-01', origins: 3 } }) as unknown as Promise<{ backtest: Row }>);
    if (CONTROL) return;
    expect(bt.backtest['backtestId']).toBeTruthy();
  }, 300_000);

  it('N3.d · outcome record under a crossing stream: the actuals assembled inside the recording write (the forecast issued outside the stream; its 30 days lie inside the series)', async () => {
    const forecastId = (await issueAt('b22 nonce sweep (outcome)')).forecast.forecastId;
    const outcome = await underStream('N3.outcome', () => prediction.recordOutcome(h.req(forecastOwner, 'prediction.outcome.record', 'OUT', null, 'prediction'), T(), D(),
      { payload: { forecastId, knownAt: new Date().toISOString() } }) as unknown as Promise<{ outcome: Row }>);
    if (CONTROL) return;
    expect(outcome.outcome).toBeTruthy();
  }, 300_000);
});
