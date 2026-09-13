/**
 * 0057 · The outbox publisher's capability is issued and consumed in ONE backend call.
 *
 * The demonstration's finding (2026-09-10): the API process ended on an unhandled rejection
 * from the outbox publisher — `capability denied: mode publish required (context is none)`
 * from objects.outbox_lease. The context had been issued in the same transaction, one round
 * trip earlier; its 60-second wall-clock expiry elapsed in between while the process was busy
 * with a multi-minute correction transaction. The first case is that mechanism, reproduced at
 * the database with a 61-second pause in place of the stall; the rest is the correction.
 *
 * A Phase 6 file, not a Phase 0 one: the single-call ports exist from migration 0057, and the
 * Phase 0 suite is also run at the 0021 ceiling by scripts/phase1/verify-0022-upgrade.mjs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import {
  commitDb, identityDb, publisherDb, superDb, seedTenant, seedDomain,
  createPrincipalWithSession, withCtx, closeOperation,
  type AnyDb, type TestPrincipal,
} from './helpers.js';

let commit: AnyDb; let identity: AnyDb; let publisher: AnyDb; let su: AnyDb;
let tenant = ''; let domainA = ''; let aAdmin: TestPrincipal;

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
  tenant = await seedTenant(su, 'p6ob-t');
  domainA = await seedDomain(su, tenant, 'p6ob-a');
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'p6ob-a' });
});

afterAll(async () => {
  await Promise.all([commit, identity, publisher, su].map((d) => d.destroy()));
});

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
