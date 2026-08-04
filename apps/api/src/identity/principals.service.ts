/**
 * Principal administration — create principals (human/workload), credentials,
 * role bindings. Administration grants technical access only; business decision
 * authority is never acquired through administration (PER-18, ES-50-004).
 */
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import type { Scope } from '@eye/contracts';

export interface CreatePrincipalInput {
  kind: 'human' | 'workload' | 'agent';
  scope: Scope;
  tenantId: string | null;
  domainId: string | null;
  displayName: string;
  password?: string; // humans only in Phase 0
  roleCode?: string;
}

@Injectable()
export class PrincipalsService {
  async createPrincipal(tx: Tx, input: CreatePrincipalInput): Promise<{ principalId: string }> {
    const principalId = newId();
    await tx
      .insertInto('identity.principals')
      .values({
        id: principalId,
        kind: input.kind,
        scope: input.scope,
        tenant_id: input.tenantId,
        domain_id: input.domainId,
        display_name: input.displayName,
        status: 'active',
      })
      .execute();

    if (input.password !== undefined) {
      const hash = await argon2.hash(input.password, { type: argon2.argon2id });
      await tx
        .insertInto('identity.credentials')
        .values({ id: newId(), principal_id: principalId, type: 'password', secret_hash: hash, status: 'active' })
        .execute();
    }

    if (input.roleCode !== undefined) {
      await this.bindRole(tx, principalId, input.roleCode, input.scope, input.tenantId, input.domainId);
    }
    return { principalId };
  }

  async bindRole(
    tx: Tx,
    principalId: string,
    roleCode: string,
    scope: Scope,
    tenantId: string | null,
    domainId: string | null,
  ): Promise<{ bindingId: string }> {
    const bindingId = newId();
    await tx
      .insertInto('identity.role_bindings')
      .values({
        id: bindingId,
        principal_id: principalId,
        role_code: roleCode,
        scope,
        tenant_id: tenantId,
        domain_id: domainId,
      })
      .execute();
    return { bindingId };
  }

  async listPrincipals(tx: Tx): Promise<unknown[]> {
    return tx
      .selectFrom('identity.principals')
      .select(['id', 'kind', 'scope', 'tenant_id', 'domain_id', 'display_name', 'status', 'created_at'])
      .orderBy('created_at')
      .execute();
  }
}
