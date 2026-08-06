/**
 * Shared integration-test infrastructure (Gate-2).
 *
 * Everything here exercises the REAL least-privilege roles, the REAL bound
 * context and the REAL definer ports — never reimplemented production logic.
 * Principals, credentials and sessions are created through the identity
 * authority; scope context is established exactly as the pipeline does, via
 * ctx.issue() with proof of possession of the session's context key.
 * The migrate superuser is used ONLY to seed tenant/domain fixtures and to
 * simulate out-of-band tampering.
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

/** One pool per AUTHORITY — mirrors src/shared/db.ts exactly. */
export const appDb = (): AnyDb => mkDb(process.env['EYE_DB_APP_USER'] ?? 'eye_app', required('EYE_DB_APP_PASSWORD'));
export const commitDb = (): AnyDb => mkDb(process.env['EYE_DB_COMMIT_USER'] ?? 'eye_commit', required('EYE_DB_COMMIT_PASSWORD'));
export const identityDb = (): AnyDb => mkDb(process.env['EYE_DB_IDENTITY_USER'] ?? 'eye_identity', required('EYE_DB_IDENTITY_PASSWORD'));
export const publisherDb = (): AnyDb => mkDb(process.env['EYE_DB_PUBLISHER_USER'] ?? 'eye_publisher', required('EYE_DB_PUBLISHER_PASSWORD'));
export const verifierDb = (): AnyDb => mkDb(process.env['EYE_DB_VERIFIER_USER'] ?? 'eye_verifier', required('EYE_DB_VERIFIER_PASSWORD'));
export const recoveryDb = (): AnyDb => mkDb(process.env['EYE_DB_RECOVERY_USER'] ?? 'eye_recovery', required('EYE_DB_RECOVERY_PASSWORD'));
export const superDb = (): AnyDb => mkDb(process.env['EYE_DB_MIGRATE_USER'] ?? 'eye', required('EYE_DB_MIGRATE_PASSWORD'));
export const allocatorDb = (): AnyDb => mkDb(process.env['EYE_DB_ALLOCATOR_USER'] ?? 'eye_audit_allocator', required('EYE_DB_ALLOCATOR_PASSWORD'));

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
  /** Proof-of-possession key — the plaintext the access token would carry. */
  contextKey: string;
  familyId: string;
}

/**
 * Create an active principal + role binding + session through the REAL identity
 * authority and its definer ports (identity.create_principal, session_open).
 */
export async function createPrincipalWithSession(
  identity: AnyDb,
  su: AnyDb,
  opts: {
    scope: 'PLATFORM' | 'TENANT' | 'DOMAIN';
    tenantId?: string | null;
    domainId?: string | null;
    roleCode: string;
    label?: string;
    assurance?: 'password' | 'bootstrap_rotation';
  },
): Promise<TestPrincipal> {
  const principalId = uuidv7();
  const loginName = `${opts.label ?? 'itest'}-${principalId.slice(-12)}`;
  const refreshToken = randomBytes(24).toString('hex');
  const contextKey = randomBytes(32).toString('base64url');
  const sessionId = uuidv7();
  const familyId = uuidv7();

  // Fixture principals are seeded with the superuser (RLS-exempt) so the test
  // does not need a pre-existing administrator; the SESSION is opened through
  // the real identity port so the context proof is genuine.
  await su
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
  await su
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
  await identity.transaction().execute(async (tx) => {
    await sql`select ctx.issue_system('integration-test session seeding')`.execute(tx);
    await sql`select identity.session_open(
      ${sessionId}::uuid, ${principalId}::uuid, ${opts.assurance ?? 'password'},
      ${sha256(refreshToken)}, ${sha256(contextKey)},
      ${new Date(Date.now() + 3600_000)}, ${familyId}::uuid
    )`.execute(tx);
  });
  return { principalId, sessionId, loginName, refreshToken, contextKey, familyId };
}

/**
 * Run fn inside a transaction carrying a REAL bound context, issued exactly as
 * the pipeline issues it (proof of possession + live authority re-check).
 */
export async function withCtx<T>(
  db: AnyDb,
  p: TestPrincipal,
  scope: 'PLATFORM' | 'TENANT' | 'DOMAIN',
  tenantId: string | null,
  domainId: string | null,
  fn: (tx: Kysely<never>) => Promise<T>,
  purpose = 'integration-test',
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select ctx.issue(
      ${p.sessionId}::uuid, ${p.contextKey}, ${scope},
      ${tenantId}::uuid, ${domainId}::uuid, ${purpose}, 60
    )`.execute(tx);
    return fn(tx as unknown as Kysely<never>);
  });
}

/** System context (bounded system paths). */
export async function withSystemCtx<T>(
  db: AnyDb,
  reason: string,
  fn: (tx: Kysely<never>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select ctx.issue_system(${reason})`.execute(tx);
    return fn(tx as unknown as Kysely<never>);
  });
}
