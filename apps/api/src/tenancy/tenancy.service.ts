/**
 * Tenancy — CP-TEN-01 (ADR-P0-04; ES-08; Gate-2.1 C2).
 *
 * Every method takes a BoundedCapability, never a transaction: the capability
 * exposes only the ports this route declared, and the database additionally binds
 * each port to the context's action. No raw SQL is reachable from here.
 */
import { Injectable } from '@nestjs/common';
import type { BoundedCapability } from '../shared/capabilities.js';
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
  async createTenant(cap: BoundedCapability, actor: string, name: string, residency: string): Promise<TenantRecord> {
    const id = newId();
    await cap.createTenant(id, name, residency, actor);
    return (await cap.read('tenancy.tenants').selectAll().where('id', '=', id as never)
      .executeTakeFirstOrThrow()) as unknown as TenantRecord;
  }

  async createDomain(
    cap: BoundedCapability, actor: string, tenantId: string, name: string,
  ): Promise<{ id: string; name: string; status: string }> {
    const id = newId();
    await cap.createDomain(id, tenantId, name, actor);
    return { id, name, status: 'active' };
  }

  async listTenants(cap: BoundedCapability): Promise<TenantRecord[]> {
    return (await cap.read('tenancy.tenants').selectAll().orderBy('created_at' as never).execute()) as unknown as TenantRecord[];
  }

  async listDomains(cap: BoundedCapability, tenantId: string): Promise<unknown[]> {
    return cap.read('tenancy.domains').selectAll()
      .where('tenant_id', '=', tenantId as never).orderBy('created_at' as never).execute();
  }

  /** Explicitly authorized read model for a DOMAIN principal's own tenant. */
  async myTenant(cap: BoundedCapability): Promise<{ id: string; name: string; status: string } | undefined> {
    return cap.myTenant();
  }
}
