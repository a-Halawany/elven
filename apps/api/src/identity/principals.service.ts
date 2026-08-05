/**
 * Principal administration — create principals (human/workload/agent),
 * credentials, role bindings. Administration grants technical access only;
 * business decision authority is never acquired through administration
 * (PER-18, ES-50-004).
 *
 * Remediation R6: humans authenticate by a UNIQUE login_name (display_name is
 * display-only); password credentials are issued exclusively through the
 * identity.credential_issue definer port, which refuses non-human principals;
 * password policy is enforced on every creation path; role bindings are
 * constrained by DB FKs to the role's declared scope and the (tenant, domain)
 * consistency proofs.
 */
import { HttpException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import type { Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import type { Scope } from '@eye/contracts';
import { MIN_PASSWORD_LENGTH } from './identity.service.js';

export interface CreatePrincipalInput {
  kind: 'human' | 'workload' | 'agent';
  scope: Scope;
  tenantId: string | null;
  domainId: string | null;
  displayName: string;
  /** Unique login identifier — required for humans with a password. */
  loginName?: string;
  password?: string; // humans only (enforced here AND by the definer port)
  roleCode?: string;
}

@Injectable()
export class PrincipalsService {
  async createPrincipal(tx: Tx, input: CreatePrincipalInput): Promise<{ principalId: string }> {
    if (input.password !== undefined) {
      if (input.kind !== 'human') {
        throw new HttpException(
          errorBody('EYE_REQ_001', newId(), 'password credentials are restricted to human principals'),
          400,
        );
      }
      if (input.loginName === undefined || input.loginName.length < 3) {
        throw new HttpException(
          errorBody('EYE_REQ_001', newId(), 'a unique login_name (>=3 chars) is required for password principals'),
          400,
        );
      }
      if (input.password.length < MIN_PASSWORD_LENGTH) {
        throw new HttpException(
          errorBody('EYE_REQ_001', newId(), `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
          400,
        );
      }
    }

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
        login_name: input.kind === 'human' ? (input.loginName ?? null) : null,
        status: 'active',
      })
      .execute();

    if (input.password !== undefined) {
      const hash = await argon2.hash(input.password, { type: argon2.argon2id });
      // Definer port: human-only, status-checked; direct credential-table
      // access is revoked (R1c).
      await sql`select identity.credential_issue(
        ${newId()}::uuid, ${principalId}::uuid, ${hash}, 'active', null
      )`.execute(tx);
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
      .select(['id', 'kind', 'scope', 'tenant_id', 'domain_id', 'display_name', 'login_name', 'status', 'created_at'])
      .orderBy('created_at')
      .execute();
  }
}
