/**
 * Principal administration — create principals (human/workload/agent),
 * credentials, role bindings. Administration grants technical access only;
 * business decision authority is never acquired through administration
 * (PER-18, ES-50-004).
 *
 * Gate-2 §1/§3: every mutation goes through identity.create_principal on the
 * IDENTITY authority. The port derives the grantor from the bound context and
 * the database trigger then enforces that (a) the binding never exceeds the
 * principal's own scope and (b) the grantor's authority dominates the binding —
 * so a DOMAIN principal can neither create tenant-level principals nor grant
 * itself tenant administration.
 */
import { HttpException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { errorBody } from '@eye/contracts';
import type { BoundedCapability } from '../shared/capabilities.js';
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
  async createPrincipal(cap: BoundedCapability, input: CreatePrincipalInput): Promise<{ principalId: string }> {
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
    const secretHash =
      input.password === undefined ? null : await argon2.hash(input.password, { type: argon2.argon2id });
    await cap.createPrincipal({
      id: principalId,
      kind: input.kind,
      scope: input.scope,
      tenantId: input.tenantId,
      domainId: input.domainId,
      displayName: input.displayName,
      loginName: input.loginName ?? null,
      secretHash,
      roleCode: input.roleCode ?? null,
    });
    return { principalId };
  }

  async listPrincipals(cap: BoundedCapability): Promise<unknown[]> {
    return cap
      .read('identity.principals')
      .select(['id', 'kind', 'scope', 'tenant_id', 'domain_id', 'display_name', 'login_name', 'status', 'created_at'])
      .orderBy('created_at' as never)
      .execute();
  }
}
