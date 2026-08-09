/**
 * GATE-2.2 C4 — GOVERN EVERY IDENTITY MUTATOR; CLOSE VICTIM-ACCOUNT TAKEOVER.
 *
 * Every identity mutator now asserts an identity capability. The subject-taking
 * ones are bound to the capability's exact action AND subject, so a capability
 * minted to act on principal A cannot mutate the victim principal B, and a
 * capability minted for one operation cannot drive another. All attempts run on
 * the REAL identity authority against the REAL ports.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import {
  appDb, identityDb, superDb, seedTenant, createPrincipalWithSession, withIdentityOp,
  type AnyDb, type TestPrincipal,
} from './helpers.js';

let app: AnyDb;
let identity: AnyDb;
let su: AnyDb;
let tenant = '';
let attacker: TestPrincipal;
let victim: TestPrincipal;

/** Issue an active credential for a principal under a governed identity capability. */
async function giveCredential(principalId: string): Promise<string> {
  const credId = uuidv7();
  await withIdentityOp(identity, 'identity.credential.rotate', principalId, async (tx) => {
    await sql`select identity.credential_issue(${credId}::uuid, ${principalId}::uuid, 'hash', 'active', null)`.execute(tx);
  });
  return credId;
}

beforeAll(async () => {
  app = appDb(); identity = identityDb(); su = superDb();
  tenant = await seedTenant(su, 'c4-t');
  attacker = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'c4-atk' });
  victim = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'c4-vic' });
});

afterAll(async () => {
  await Promise.all([app, identity, su].map((d) => d.destroy()));
});

describe('C4 — the application role can invoke no identity mutator', () => {
  it('every mutator is refused to eye_app', async () => {
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ['session_open', () => sql`select identity.session_open(${uuidv7()}::uuid, ${victim.principalId}::uuid, 'password', 'h', 'k', now() + interval '1 hour', ${uuidv7()}::uuid)`.execute(app)],
      ['credential_rotate_v2', () => sql`select identity.credential_rotate_v2(${victim.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'h')`.execute(app)],
      ['sessions_revoke_all_v2', () => sql`select identity.sessions_revoke_all_v2(${victim.principalId}::uuid)`.execute(app)],
      ['bump_epoch', () => sql`select identity.bump_epoch(${victim.principalId}::uuid)`.execute(app)],
      ['credential_issue', () => sql`select identity.credential_issue(${uuidv7()}::uuid, ${victim.principalId}::uuid, 'h', 'active', null)`.execute(app)],
      ['credential_revoke', () => sql`select identity.credential_revoke(${uuidv7()}::uuid)`.execute(app)],
      ['refresh_rotate_family', () => sql`select * from identity.refresh_rotate_family('a','b','c')`.execute(app)],
    ];
    for (const [name, attempt] of attempts) {
      await expect(attempt(), name).rejects.toThrow(/permission denied/);
    }
  });
});

describe('C4 — a mutator with no identity context is refused', () => {
  it('credential_rotate_v2 without a capability is refused', async () => {
    await expect(
      identity.transaction().execute(async (tx) =>
        sql`select identity.credential_rotate_v2(${victim.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'h')`.execute(tx)),
    ).rejects.toThrow(/identity_op mode required|identity capability denied/);
  });

  it('sessions_revoke_all_v2 without a capability is refused', async () => {
    await expect(
      identity.transaction().execute(async (tx) =>
        sql`select identity.sessions_revoke_all_v2(${victim.principalId}::uuid)`.execute(tx)),
    ).rejects.toThrow(/live identity or bootstrap capability/);
  });
});

describe('C4 — victim-account takeover is blocked', () => {
  it('a rotate capability bound to the ATTACKER cannot rotate the VICTIM', async () => {
    const victimCred = await giveCredential(victim.principalId);
    // The attacker holds a legitimately-minted rotate capability for THEIR OWN
    // principal, and tries to rotate the victim's credential with it.
    await expect(
      withIdentityOp(identity, 'identity.credential.rotate', attacker.principalId, async (tx) =>
        sql`select identity.credential_rotate_v2(${victim.principalId}::uuid, ${victimCred}::uuid, ${uuidv7()}::uuid, 'attacker-chosen')`.execute(tx)),
    ).rejects.toThrow(/bound to a different subject \(victim-takeover blocked\)/);

    // The victim's credential is untouched.
    const cred = await sql<{ status: string }>`select status from identity.credentials where id = ${victimCred}`.execute(su);
    expect(cred.rows[0]!.status).toBe('active');
  });

  it('a session.create capability cannot be used to rotate a credential (action mismatch)', async () => {
    await expect(
      withIdentityOp(identity, 'identity.session.create', attacker.principalId, async (tx) =>
        sql`select identity.credential_rotate_v2(${attacker.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'x')`.execute(tx)),
    ).rejects.toThrow(/bound to action identity\.session\.create, not identity\.credential\.rotate/);
  });
});

describe('C4 — the correctly-bound capability works', () => {
  it('a rotate capability bound to the principal rotates its OWN credential', async () => {
    const cred = await giveCredential(attacker.principalId);
    await withIdentityOp(identity, 'identity.credential.rotate', attacker.principalId, async (tx) => {
      await sql`select identity.credential_rotate_v2(${attacker.principalId}::uuid, ${cred}::uuid, ${uuidv7()}::uuid, 'newhash')`.execute(tx);
    });
    const rotated = await sql<{ status: string }>`select status from identity.credentials where id = ${cred}`.execute(su);
    expect(rotated.rows[0]!.status).toBe('rotated');
  });
});
