/**
 * B94 (0114 §ON, §MG) — Gate-2.2 C6 for the two new tenancy ports: the draft-domain port (tenancy.create_domain_draft) and the activation
 * at cutover (tenancy.activate_domain) bind their TARGET exactly as tenancy.create_domain does (gate22-capability-binding.test.ts): a
 * capability minted for object A cannot act on object B. Kept out of the gate22 file because the 0022 upgrade proof replays the Phase 0
 * suite at 0021, where these ports do not exist; the authority matrix (C14) maps both ports here. Their governed flows are proved in
 * phase6-onboarding-b94 and phase6-migration-b94.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { commitDb, identityDb, superDb, seedTenant, seedDomain, createPrincipalWithSession, withCtx, type AnyDb, type TestPrincipal } from './helpers.js';

let commit: AnyDb; let identity: AnyDb; let su: AnyDb;
let tenant = ''; let domainA = ''; let aAdmin: TestPrincipal;

beforeAll(async () => {
  commit = commitDb(); identity = identityDb(); su = superDb();
  tenant = await seedTenant(su, 'b94-c6-t');
  domainA = await seedDomain(su, tenant, 'b94-c6-a');
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'b94-c6-a' });
});
afterAll(async () => { await Promise.all([commit, identity, su].map((d) => d.destroy())); });

describe('C6 (B94) — exact TARGET binding at the draft-domain and activation ports', () => {
  it('a domain-draft capability bound to A cannot draft domain B (B94 §ON)', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select tenancy.create_domain_draft(${uuidv7()}::uuid, ${tenant}::uuid, ${'c6-draft-' + uuidv7().slice(-12)}, ${uuidv7()}::uuid)`.execute(tx),
        { action: 'tenancy.domain.draft', target: uuidv7() }),
    ).rejects.toThrow(/target binding denied/);
  });

  it('an activation capability bound to domain A cannot activate domain B (B94 §MG)', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select tenancy.activate_domain(${uuidv7()}::uuid, ${tenant}::uuid, ${uuidv7()}::uuid, ${aAdmin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx),
        { action: 'tenancy.domain.activate', target: domainA }),
    ).rejects.toThrow(/target binding denied/);
  });

});
