/**
 * GATE-2.2 C3 — DATABASE-ENFORCED, CAPABILITY-BOUND, SINGLE-USE BOOTSTRAP.
 *
 * The claim is bound to the bootstrap capability that won it: only that
 * capability (matching nonce) may complete it, exactly one racer can win, a
 * consumed claim cannot be reused, and no other role or context can claim at
 * all. Every attempt runs against the REAL ports on the REAL identity authority.
 */
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { appDb, identityDb, superDb, type AnyDb } from './helpers.js';

let app: AnyDb;
let identity: AnyDb;
let su: AnyDb;

/** Run fn under a fresh bootstrap capability (its correlation is the claim nonce). */
async function withBootstrap<T>(correlationId: string, fn: (tx: never) => Promise<T>): Promise<T> {
  return identity.transaction().execute(async (tx) => {
    await sql`select ctx.issue_bootstrap(${correlationId}::uuid)`.execute(tx);
    return fn(tx as never);
  });
}

beforeAll(async () => {
  app = appDb(); identity = identityDb(); su = superDb();
});
afterAll(async () => {
  await Promise.all([app, identity, su].map((d) => d.destroy()));
});

// Each test starts from a pristine, unclaimed bootstrap.
beforeEach(async () => {
  await sql`delete from identity.bootstrap_claim`.execute(su);
});
afterEach(async () => {
  await sql`delete from identity.bootstrap_claim`.execute(su);
});

describe('C3 — the claim requires the bootstrap capability', () => {
  it('the application role cannot claim at all', async () => {
    await expect(sql`select identity.claim_bootstrap()`.execute(app)).rejects.toThrow(/permission denied/);
  });

  it('a claim without a bootstrap context is refused (direct port call)', async () => {
    await expect(
      identity.transaction().execute(async (tx) =>
        sql`select identity.claim_bootstrap()`.execute(tx)),
    ).rejects.toThrow(/bootstrap capability required/);
  });

  it('completing the claim without a bootstrap context is refused', async () => {
    await expect(
      identity.transaction().execute(async (tx) =>
        sql`select identity.record_bootstrap_principal(${uuidv7()}::uuid)`.execute(tx)),
    ).rejects.toThrow(/bootstrap capability required/);
  });
});

describe('C3 — exactly one racer wins, and it is single-use', () => {
  it('two concurrent bootstrap claims: exactly one wins', async () => {
    const claim = () =>
      withBootstrap(uuidv7(), async (tx) =>
        (await sql<{ ok: boolean }>`select identity.claim_bootstrap() as ok`.execute(tx)).rows[0]!.ok,
      ).catch((e: Error) => e.message);
    const outcomes = await Promise.all([claim(), claim()]);
    expect(outcomes.filter((o) => o === true)).toHaveLength(1);
    expect(outcomes.filter((o) => o === false)).toHaveLength(1);
  });

  it('a second claim after one has been taken always loses', async () => {
    const first = await withBootstrap(uuidv7(), async (tx) =>
      (await sql<{ ok: boolean }>`select identity.claim_bootstrap() as ok`.execute(tx)).rows[0]!.ok);
    expect(first).toBe(true);
    const second = await withBootstrap(uuidv7(), async (tx) =>
      (await sql<{ ok: boolean }>`select identity.claim_bootstrap() as ok`.execute(tx)).rows[0]!.ok);
    expect(second).toBe(false);
  });
});

describe('C3 — completion is bound to the winning capability nonce', () => {
  it('a capability whose nonce does not match the claim cannot complete it (forged nonce)', async () => {
    // Capability A wins the claim…
    await withBootstrap(uuidv7(), async (tx) => {
      await sql`select identity.claim_bootstrap()`.execute(tx);
    });
    // …capability B (a different correlation) cannot complete it.
    await expect(
      withBootstrap(uuidv7(), async (tx) =>
        sql`select identity.record_bootstrap_principal(${uuidv7()}::uuid)`.execute(tx)),
    ).rejects.toThrow(/does not own the claim/);
  });

  it('the winning capability completes the claim, binding the target and consuming it', async () => {
    const correlationId = uuidv7();
    const principalId = uuidv7();
    await withBootstrap(correlationId, async (tx) => {
      const won = (await sql<{ ok: boolean }>`select identity.claim_bootstrap() as ok`.execute(tx)).rows[0]!.ok;
      expect(won).toBe(true);
      await sql`select identity.record_bootstrap_principal(${principalId}::uuid)`.execute(tx);
    });
    const claim = await sql<{ principal_id: string; consumed: boolean; nonce: string }>`
      select principal_id, consumed, nonce from identity.bootstrap_claim where id = 1`.execute(su);
    expect(claim.rows[0]!.principal_id).toBe(principalId);
    expect(claim.rows[0]!.consumed).toBe(true);
    expect(claim.rows[0]!.nonce).toBe(correlationId);
  });

  it('a consumed claim cannot be completed a second time', async () => {
    const correlationId = uuidv7();
    await withBootstrap(correlationId, async (tx) => {
      await sql`select identity.claim_bootstrap()`.execute(tx);
      await sql`select identity.record_bootstrap_principal(${uuidv7()}::uuid)`.execute(tx);
    });
    // The same capability nonce, but the claim is already consumed.
    await expect(
      withBootstrap(correlationId, async (tx) =>
        sql`select identity.record_bootstrap_principal(${uuidv7()}::uuid)`.execute(tx)),
    ).rejects.toThrow(/already consumed/);
  });
});

describe('C3 — structural eligibility comes from the database, not the caller', () => {
  it('bootstrap is refused when the runtime profile is not local/test', async () => {
    await sql`update config.runtime_profile set profile = 'production' where id = 1`.execute(su);
    try {
      // The capability itself is refused at issuance in production.
      await expect(
        identity.transaction().execute(async (tx) =>
          sql`select ctx.issue_bootstrap(${uuidv7()}::uuid)`.execute(tx)),
      ).rejects.toThrow(/runtime profile|not local\/test/);
    } finally {
      await sql`update config.runtime_profile set profile = 'local' where id = 1`.execute(su);
    }
  });
});
