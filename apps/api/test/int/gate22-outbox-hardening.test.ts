/**
 * GATE-2.2 C7 — OUTBOX SUPPRESSION / PUBLISHING HARDENING.
 *
 * A publish capability may take a lease on a pending row, but it cannot suppress
 * delivery: the lease TTL is clamped, the retry budget is bounded and exhausted
 * rows are dead-lettered, and every acknowledgement is a compare-and-set tied to
 * the lease token. These tests exercise the REAL ports on the REAL publisher
 * authority against a real committed outbox row.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import {
  commitDb, identityDb, publisherDb, superDb, seedTenant, seedDomain,
  createPrincipalWithSession, withCtx, withPublishCtx, closeOperation,
  type AnyDb, type TestPrincipal,
} from './helpers.js';

let commit: AnyDb;
let identity: AnyDb;
let publisher: AnyDb;
let su: AnyDb;
let tenant = '';
let domainA = '';
let aAdmin: TestPrincipal;

async function enqueueClosed(eventType: string): Promise<string> {
  const id = uuidv7();
  await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
    await sql`select objects.enqueue_event(${id}::uuid, ${eventType}, '{}'::jsonb,
      ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
    await closeOperation(tx, cap, { type: 'outbox', id });
  }, { action: 'objects.create' });
  return id;
}

beforeAll(async () => {
  commit = commitDb(); identity = identityDb(); publisher = publisherDb(); su = superDb();
  tenant = await seedTenant(su, 'c7-t');
  domainA = await seedDomain(su, tenant, 'c7-a');
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'c7-a' });
});

afterAll(async () => {
  await Promise.all([commit, identity, publisher, su].map((d) => d.destroy()));
});

describe('C7 — the lease TTL is bounded', () => {
  it('an extreme requested lease duration is clamped to at most 300 seconds', async () => {
    const id = await enqueueClosed('c7.ttl');
    const leased = await withPublishCtx(publisher, null, async (tx) =>
      sql<{ id: string }>`select id from objects.outbox_lease(50, 1000000000)`.execute(tx));
    expect(leased.rows.map((r) => r.id)).toContain(id);
    const row = await sql<{ leased_until: string }>`select leased_until from objects.object_outbox where id = ${id}`.execute(su);
    const leaseMs = new Date(row.rows[0]!.leased_until).getTime() - Date.now();
    // Clamped to 300s (allow a little slack for round-trip latency).
    expect(leaseMs).toBeLessThanOrEqual(301_000);
    expect(leaseMs).toBeGreaterThan(0);
  });
});

describe('C7 — the retry budget bounds re-leasing and dead-letters poison rows', () => {
  it('a row leased 10 times without acknowledgement is dead-lettered, not re-leased forever', async () => {
    const id = await enqueueClosed('c7.poison');
    // Repeated lease → release cycles, entirely through governed ports: each
    // lease consumes one unit of the retry budget; release returns the row to
    // the pool for the next attempt. After the budget (10) is spent, the next
    // lease sweep dead-letters it instead of handing it out again.
    for (let i = 0; i < 11; i += 1) {
      const leased = await withPublishCtx(publisher, id, async (tx) =>
        sql<{ id: string; lease_id: string }>`select id, lease_id from objects.outbox_lease(50, 60)`.execute(tx));
      const mine = leased.rows.find((r) => r.id === id);
      if (mine === undefined) break; // dead-lettered: no longer leasable
      await withPublishCtx(publisher, id, async (tx) =>
        sql`select objects.outbox_release(${id}::uuid, ${mine.lease_id}::uuid)`.execute(tx));
    }
    const row = await sql<{ status: string; attempts: number }>`
      select status, attempts from objects.object_outbox where id = ${id}`.execute(su);
    expect(row.rows[0]!.status).toBe('dead_letter');
    // A dead-lettered row is never handed out again.
    const released = await withPublishCtx(publisher, null, async (tx) =>
      sql<{ id: string }>`select id from objects.outbox_lease(500, 60)`.execute(tx));
    expect(released.rows.map((r) => r.id)).not.toContain(id);
  });
});

describe('C7 — acknowledgement is lease-bound and transition-restricted', () => {
  it('a stale/invented lease cannot acknowledge; the current lease can, exactly once', async () => {
    const id = await enqueueClosed('c7.ack');
    const leased = await withPublishCtx(publisher, id, async (tx) =>
      sql<{ id: string; lease_id: string }>`select id, lease_id from objects.outbox_lease(50, 60)`.execute(tx));
    const mine = leased.rows.find((r) => r.id === id)!;

    // Invented lease → no-op.
    const forged = await withPublishCtx(publisher, id, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(${id}::uuid, ${uuidv7()}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(forged).toBe(false);

    // A disallowed terminal target is refused.
    await expect(
      withPublishCtx(publisher, id, async (tx) =>
        sql`select objects.outbox_ack_leased(${id}::uuid, ${mine.lease_id}::uuid, 'pending', 'archived')`.execute(tx)),
    ).rejects.toThrow(/not permitted/);

    // Correct lease + allowed transition → succeeds exactly once.
    const first = await withPublishCtx(publisher, id, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(${id}::uuid, ${mine.lease_id}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(first).toBe(true);
    const second = await withPublishCtx(publisher, id, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(${id}::uuid, ${mine.lease_id}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(second).toBe(false);
  });

  it('outbox_release returns a leased row to the pool for a bounded retry', async () => {
    const id = await enqueueClosed('c7.release');
    const leased = await withPublishCtx(publisher, id, async (tx) =>
      sql<{ id: string; lease_id: string }>`select id, lease_id from objects.outbox_lease(50, 60)`.execute(tx));
    const mine = leased.rows.find((r) => r.id === id)!;
    const released = await withPublishCtx(publisher, id, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_release(${id}::uuid, ${mine.lease_id}::uuid) as ok`.execute(tx)).rows[0]!.ok);
    expect(released).toBe(true);
    // Immediately leasable again (lease was cleared), still pending.
    const released2 = await withPublishCtx(publisher, null, async (tx) =>
      sql<{ id: string }>`select id from objects.outbox_lease(500, 60)`.execute(tx));
    expect(released2.rows.map((r) => r.id)).toContain(id);
  });
});

/* ═══════ 0057 · the publisher's capability is issued and consumed in ONE backend call ═══════ */

describe('0057 — the publish capability cannot expire between issuance and use', () => {
  /*
   * The demonstration's finding (2026-09-10): the API process ended on an unhandled
   * rejection from the outbox publisher — `capability denied: mode publish required
   * (context is none)` from objects.outbox_lease. The context had been issued in the
   * same transaction, one round trip earlier; its 60-second wall-clock expiry elapsed
   * in between while the process was busy with a multi-minute correction transaction.
   * The first case is that mechanism, reproduced at the database with a 61-second
   * pause in place of the stall; the rest is the correction.
   */
  it('REPRODUCTION: a publish context issued more than 60 s before it is used reads as NO context (the two-round-trip publisher was one stall away from this)', async () => {
    let refusal = 'ACCEPTED';
    try {
      await publisher.transaction().execute(async (tx) => {
        await sql`select ctx.issue_publish(null::uuid)`.execute(tx);
        await sql`select pg_sleep(61)`.execute(tx);
        await sql`select id from objects.outbox_lease(50, 60)`.execute(tx);
      });
    } catch (e) { refusal = (e as Error).message; }
    expect(refusal).toMatch(/mode publish required \(context is none\)/);
  }, 90_000);

  it('outbox_lease_as_publisher issues and leases in one call, under the publisher role alone, with nothing established beforehand', async () => {
    const id = await enqueueClosed('c7.one-call');
    const leased = await sql<{ id: string; lease_id: string }>`select id, lease_id from objects.outbox_lease_as_publisher(50, 60)`.execute(publisher);
    const mine = leased.rows.find((r) => r.id === id);
    expect(mine, 'the pending row was not leased by the single-call port').toBeDefined();
    // and acknowledged the same way — the compare-and-set is still bound to the lease
    const wrong = (await sql<{ ok: boolean }>`select objects.outbox_ack_as_publisher(${id}::uuid, ${uuidv7()}::uuid, 'pending', 'published') as ok`.execute(publisher)).rows[0]?.ok;
    expect(wrong, 'an invented lease acknowledged a row').toBe(false);
    const ok = (await sql<{ ok: boolean }>`select objects.outbox_ack_as_publisher(${id}::uuid, ${mine?.lease_id ?? ''}::uuid, 'pending', 'published') as ok`.execute(publisher)).rows[0]?.ok;
    expect(ok).toBe(true);
    const row = await sql<{ status: string }>`select status from objects.object_outbox where id = ${id}`.execute(su);
    expect(row.rows[0]?.status).toBe('published');
  });

  it('the single-call ports are the publisher role\'s alone: the commit role cannot execute them', async () => {
    let refusal = 'ACCEPTED';
    try { await sql`select * from objects.outbox_lease_as_publisher(50, 60)`.execute(commit); } catch (e) { refusal = (e as Error).message; }
    expect(refusal).toMatch(/permission denied/);
  });
});
