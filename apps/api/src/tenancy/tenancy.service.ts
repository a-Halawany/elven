/**
 * Tenancy — CP-TEN-01 (ADR-P0-04; ES-08 governed domain lifecycle).
 * Tenant/domain creation is a governed workflow: draft → active, every
 * transition appends a lifecycle event (append-only) and is audited by the
 * commit pipeline. All queries run inside a transaction carrying the RLS
 * scope context (SET LOCAL from the resolved — never client-claimed — scope).
 */
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { APP_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import type { ScopeContext } from '../shared/scope.js';

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
  constructor(@Inject(APP_DB) private readonly db: Db) {}

  /** Apply the RLS scope context inside a transaction (fail closed when absent). */
  async withScope<T>(ctx: ScopeContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', ${ctx.scope}, true)`.execute(tx);
      await sql`select set_config('eye.tenant_id', ${ctx.tenantId ?? ''}, true)`.execute(tx);
      await sql`select set_config('eye.domain_id', ${ctx.domainId ?? ''}, true)`.execute(tx);
      return fn(tx);
    });
  }

  /** Governed creation: draft + activation in one reviewed admin action (Phase 0 profile). */
  async createTenant(tx: Tx, actor: string, name: string, residency: string): Promise<TenantRecord> {
    const id = newId();
    const now = new Date();
    await tx
      .insertInto('tenancy.tenants')
      .values({
        id,
        name,
        status: 'active',
        residency_profile: residency,
        retention_profile: 'default',
        activated_at: now,
      })
      .execute();
    await tx
      .insertInto('tenancy.lifecycle_events')
      .values({
        id: newId(),
        scope: 'TENANT',
        tenant_id: id,
        domain_id: null,
        event: 'tenant.created',
        actor,
        details: JSON.stringify({ name, residency_profile: residency }),
      })
      .execute();
    return (await tx
      .selectFrom('tenancy.tenants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()) as TenantRecord;
  }

  async createDomain(tx: Tx, actor: string, tenantId: string, name: string): Promise<{ id: string; name: string; status: string }> {
    const id = newId();
    await tx
      .insertInto('tenancy.domains')
      .values({ id, tenant_id: tenantId, name, status: 'active', activated_at: new Date() })
      .execute();
    await tx
      .insertInto('tenancy.lifecycle_events')
      .values({
        id: newId(),
        scope: 'DOMAIN',
        tenant_id: tenantId,
        domain_id: id,
        event: 'domain.created',
        actor,
        details: JSON.stringify({ name }),
      })
      .execute();
    return { id, name, status: 'active' };
  }

  async listTenants(tx: Tx): Promise<TenantRecord[]> {
    return (await tx.selectFrom('tenancy.tenants').selectAll().orderBy('created_at').execute()) as TenantRecord[];
  }

  async listDomains(tx: Tx, tenantId: string): Promise<unknown[]> {
    return tx.selectFrom('tenancy.domains').selectAll().where('tenant_id', '=', tenantId).orderBy('created_at').execute();
  }
}
