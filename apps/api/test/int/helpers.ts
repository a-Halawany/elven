/**
 * Shared integration-test infrastructure (remediation R10).
 *
 * Principals, credentials, sessions and role bindings are created through the
 * REAL definer ports on the system role (identity.credential_issue,
 * identity.session_create) — not through reimplemented copies. Scope context
 * inside app transactions is established through the REAL signed-context port
 * public.eye_set_context(session, scope, tenant, domain), exactly as the
 * commit pipeline does. The migrate superuser is used ONLY to seed
 * tenants/domains fixtures and to simulate out-of-band tampering.
 */
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, randomBytes } from 'node:crypto';

export const HOST = process.env['EYE_DB_HOST'] ?? 'localhost';
export const PORT = Number(process.env['EYE_DB_PORT'] ?? 5432);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set (generated .eye-local/env or caller-supplied)`);
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = Kysely<any>;

export function mkDb(user: string, password: string, max = 8): AnyDb {
  return new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ host: HOST, port: PORT, database: 'eye', user, password, max }),
    }),
  });
}

export function appDb(): AnyDb {
  return mkDb(process.env['EYE_DB_APP_USER'] ?? 'eye_app', required('EYE_DB_APP_PASSWORD'));
}
export function systemDb(): AnyDb {
  return mkDb(process.env['EYE_DB_SYSTEM_USER'] ?? 'eye_system', required('EYE_DB_SYSTEM_PASSWORD'));
}
export function superDb(): AnyDb {
  return mkDb(process.env['EYE_DB_MIGRATE_USER'] ?? 'eye', required('EYE_DB_MIGRATE_PASSWORD'));
}
export function allocatorDb(): AnyDb {
  return mkDb(process.env['EYE_DB_ALLOCATOR_USER'] ?? 'eye_audit_allocator', required('EYE_DB_ALLOCATOR_PASSWORD'));
}

export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** Fixture seeding (superuser): tenants/domains only. */
export async function seedTenant(su: AnyDb, label: string): Promise<string> {
  const id = uuidv7();
  await su.insertInto('tenancy.tenants').values({ id, name: `${label}-${id.slice(-12)}`, status: 'active' }).execute();
  return id;
}
export async function seedDomain(su: AnyDb, tenantId: string, label: string): Promise<string> {
  const id = uuidv7();
  await su.insertInto('tenancy.domains').values({ id, tenant_id: tenantId, name: `${label}-${id.slice(-8)}`, status: 'active' }).execute();
  return id;
}

export interface TestPrincipal {
  principalId: string;
  sessionId: string;
  loginName: string;
  refreshToken: string;
}

/**
 * Create an active principal + role binding + session via the REAL system
 * ports (system context; definer functions). Returns the session usable with
 * public.eye_set_context on the app pool.
 */
export async function createPrincipalWithSession(
  system: AnyDb,
  opts: {
    scope: 'PLATFORM' | 'TENANT' | 'DOMAIN';
    tenantId?: string | null;
    domainId?: string | null;
    roleCode: string;
    label?: string;
  },
): Promise<TestPrincipal> {
  const principalId = uuidv7();
  const loginName = `${opts.label ?? 'itest'}-${principalId.slice(-12)}`;
  const refreshToken = randomBytes(24).toString('hex');
  const sessionId = uuidv7();
  await system.transaction().execute(async (tx) => {
    await sql`select public.eye_set_system_context('integration-test principal seeding')`.execute(tx);
    await tx
      .insertInto('identity.principals')
      .values({
        id: principalId,
        kind: 'human',
        scope: opts.scope,
        tenant_id: opts.tenantId ?? null,
        domain_id: opts.domainId ?? null,
        display_name: loginName,
        login_name: loginName,
        status: 'active',
      })
      .execute();
    await tx
      .insertInto('identity.role_bindings')
      .values({
        id: uuidv7(),
        principal_id: principalId,
        role_code: opts.roleCode,
        scope: opts.scope,
        tenant_id: opts.tenantId ?? null,
        domain_id: opts.domainId ?? null,
      })
      .execute();
    await sql`select identity.session_create(
      ${sessionId}::uuid, ${principalId}::uuid, 'password', ${sha256(refreshToken)},
      ${new Date(Date.now() + 3600_000)}
    )`.execute(tx);
  });
  return { principalId, sessionId, loginName, refreshToken };
}

/** Run fn inside an app-pool transaction carrying a REAL signed scope context. */
export async function withCtx<T>(
  app: AnyDb,
  p: TestPrincipal,
  scope: 'PLATFORM' | 'TENANT' | 'DOMAIN',
  tenantId: string | null,
  domainId: string | null,
  fn: (tx: Kysely<never>) => Promise<T>,
): Promise<T> {
  return app.transaction().execute(async (tx) => {
    await sql`select public.eye_set_context(
      ${p.sessionId}::uuid, ${scope}, ${tenantId}::uuid, ${domainId}::uuid
    )`.execute(tx);
    return fn(tx as unknown as Kysely<never>);
  });
}
