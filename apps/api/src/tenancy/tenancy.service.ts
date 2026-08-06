/**
 * Tenancy — CP-TEN-01 (ADR-P0-04; ES-08 governed domain lifecycle; Gate-2 §1/§3).
 *
 * Tenant/domain creation is a governed workflow executed through SECURITY
 * DEFINER ports on the COMMIT authority: no runtime role holds INSERT on
 * tenancy tables. Domain creation is a TENANT-level act — the port refuses a
 * DOMAIN context outright, so a domain principal can never widen its reach.
 * Reads run under the bound context and the exact-match isolation matrix.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';

export interface TenantRecord {
  id: string;
  name: string;
  status: string;
  residency_profile: string;
  retention_profile: string;
  created_at: Date;
  activated_at: Date | null;
}

@Injectable()
export class TenancyService {
  // Scope context is established exclusively by the commit pipeline via the
  // bound ctx.issue() port; every method here takes the pipeline transaction.

  /** Governed creation: draft + activation in one reviewed admin action. */
  async createTenant(tx: Tx, actor: string, name: string, residency: string): Promise<TenantRecord> {
    const id = newId();
    await sql`select tenancy.create_tenant(${id}::uuid, ${name}, ${residency}, ${actor})`.execute(tx);
    return (await tx
      .selectFrom('tenancy.tenants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()) as TenantRecord;
  }

  async createDomain(
    tx: Tx,
    actor: string,
    tenantId: string,
    name: string,
  ): Promise<{ id: string; name: string; status: string }> {
    const id = newId();
    await sql`select tenancy.create_domain(${id}::uuid, ${tenantId}::uuid, ${name}, ${actor})`.execute(tx);
    return { id, name, status: 'active' };
  }

  async listTenants(tx: Tx): Promise<TenantRecord[]> {
    return (await tx.selectFrom('tenancy.tenants').selectAll().orderBy('created_at').execute()) as TenantRecord[];
  }

  async listDomains(tx: Tx, tenantId: string): Promise<unknown[]> {
    return tx.selectFrom('tenancy.domains').selectAll().where('tenant_id', '=', tenantId).orderBy('created_at').execute();
  }

  /**
   * Explicitly authorized read model (Gate-2 §3): a DOMAIN principal's own
   * tenant identity, exposed through a named port rather than through the
   * general row-visibility predicate.
   */
  async myTenant(tx: Tx): Promise<{ id: string; name: string; status: string } | undefined> {
    return (
      await sql<{ id: string; name: string; status: string }>`select * from tenancy.my_tenant()`.execute(tx)
    ).rows[0];
  }
}
