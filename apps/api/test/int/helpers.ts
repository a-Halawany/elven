/**
 * Shared integration-test infrastructure (Gate-2).
 *
 * Everything here exercises the REAL least-privilege roles, the REAL bound
 * context and the REAL definer ports — never reimplemented production logic.
 * Principals, credentials and sessions are created through the identity
 * authority; scope context is established exactly as the pipeline does, via the
 * OPERATION-SPECIFIC capability minters (Gate-2.1 §2) with proof of possession
 * of the session's context key. There is no universal system context to borrow:
 * a test that wants to publish must mint a publish capability, and that
 * capability cannot write business rows.
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
      // C18: the database NAME is environment-driven like host/port, so the same suites can
      // prove both governed histories on isolated per-run databases. Default unchanged.
      pool: new pg.Pool({ host: HOST, port: PORT, database: process.env['EYE_DB_NAME'] ?? 'eye', user, password, max }),
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
    await sql`select ctx.issue_identity_op('identity.session.create',
      ${principalId}::uuid, ${uuidv7()}::uuid, 60)`.execute(tx);
    await sql`select identity.session_open(
      ${sessionId}::uuid, ${principalId}::uuid, ${opts.assurance ?? 'password'},
      ${sha256(refreshToken)}, ${sha256(contextKey)},
      ${new Date(Date.now() + 3600_000)}, ${familyId}::uuid
    )`.execute(tx);
  });
  return { principalId, sessionId, loginName, refreshToken, contextKey, familyId };
}

/**
 * The capability a bound authority context carries (Gate-2.1 §2). Every field is
 * signed into the context and re-checked by each port, so a test cannot commit
 * evidence for one action while holding a capability for another.
 */
export interface CtxCapability {
  action: string;
  target: string;
  correlationId: string;
  policyDecisionId: string;
  bundleVersion: string;
  consequence: string;
}

export interface CtxOptions extends Partial<CtxCapability> {
  purpose?: string;
  ttlSeconds?: number;
}

export function capabilityFor(opts: CtxOptions = {}): CtxCapability {
  return {
    action: opts.action ?? 'test.action',
    target: opts.target ?? 'test:target',
    correlationId: opts.correlationId ?? uuidv7(),
    policyDecisionId: opts.policyDecisionId ?? uuidv7(),
    bundleVersion: opts.bundleVersion ?? 'bundle-v1', // the active bundle: POL rows carry a real FK
    consequence: opts.consequence ?? 'C1',
  };
}

/**
 * Run fn inside a transaction carrying a REAL bound COMMIT capability, minted
 * exactly as the pipeline mints it (proof of possession, live authority re-check,
 * action/target/correlation/policy-decision/bundle all bound).
 */
export async function withCtx<T>(
  db: AnyDb,
  p: TestPrincipal,
  scope: 'PLATFORM' | 'TENANT' | 'DOMAIN',
  tenantId: string | null,
  domainId: string | null,
  fn: (tx: Kysely<never>, cap: CtxCapability) => Promise<T>,
  opts: CtxOptions | string = {},
): Promise<T> {
  const o: CtxOptions = typeof opts === 'string' ? { purpose: opts } : opts;
  const cap = capabilityFor(o);
  return db.transaction().execute(async (tx) => {
    await sql`select ctx.issue_commit(
      ${p.sessionId}::uuid, ${p.contextKey}, ${scope}, ${tenantId}::uuid, ${domainId}::uuid,
      ${o.purpose ?? 'integration-test'}, ${cap.action}, ${cap.target}, ${cap.correlationId}::uuid,
      ${cap.policyDecisionId}::uuid, ${cap.bundleVersion}, ${cap.consequence}, ${o.ttlSeconds ?? 60}
    )`.execute(tx);
    return fn(tx as unknown as Kysely<never>, cap);
  });
}

/**
 * Run fn inside a transaction carrying a bound EVIDENCE capability. The route
 * scope is passed separately from the requested scope: the minter validates one
 * against the other and against the session's own subject.
 */
export async function withEvidenceCtx<T>(
  db: AnyDb,
  p: TestPrincipal,
  requested: { scope: string; tenantId: string | null; domainId: string | null },
  route: { scope: string; tenantId: string | null; domainId: string | null },
  fn: (tx: Kysely<never>, cap: CtxCapability) => Promise<T>,
  opts: CtxOptions = {},
): Promise<T> {
  const cap = capabilityFor(opts);
  return db.transaction().execute(async (tx) => {
    await sql`select ctx.issue_evidence(
      ${p.sessionId}::uuid, ${p.contextKey}, ${requested.scope},
      ${requested.tenantId}::uuid, ${requested.domainId}::uuid,
      ${opts.purpose ?? 'integration-test-evidence'}, ${cap.action},
      ${route.scope}, ${route.tenantId}::uuid, ${route.domainId}::uuid,
      ${cap.correlationId}::uuid, ${opts.ttlSeconds ?? 60}
    )`.execute(tx);
    return fn(tx as unknown as Kysely<never>, cap);
  });
}

/** One declared IDENTITY operation — cannot write business or canonical rows. */
export async function withIdentityOp<T>(
  db: AnyDb,
  operation: string,
  subject: string | null,
  fn: (tx: Kysely<never>, correlationId: string) => Promise<T>,
): Promise<T> {
  const correlationId = uuidv7();
  return db.transaction().execute(async (tx) => {
    await sql`select ctx.issue_identity_op(${operation}, ${subject}::uuid, ${correlationId}::uuid, 60)`.execute(tx);
    return fn(tx as unknown as Kysely<never>, correlationId);
  });
}

/** PUBLISH capability — outbox lease/ack only. */
export async function withPublishCtx<T>(
  db: AnyDb, eventId: string | null, fn: (tx: Kysely<never>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select ctx.issue_publish(${eventId}::uuid)`.execute(tx);
    return fn(tx as unknown as Kysely<never>);
  });
}

/** VERIFY capability — read/verify, or seal when explicitly requested. */
export async function withVerifyCtx<T>(
  db: AnyDb, partition: string, seal: boolean, fn: (tx: Kysely<never>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select ctx.issue_verify(${partition}, ${seal})`.execute(tx);
    return fn(tx as unknown as Kysely<never>);
  });
}

/**
 * Commit the POLICY decision that an audit event must reference. Kept as a
 * helper because the AUD↔POL linkage constraint (Gate-2.1 §3) makes an audit
 * event with an unmatched decision impossible to write.
 */
export async function commitDecision(
  tx: Kysely<never>,
  cap: CtxCapability,
  decision: 'allow' | 'allow_with_obligations' | 'deny' | 'indeterminate' = 'allow',
  objectType = 'test.object',
): Promise<string> {
  await sql`select policy.commit_decision(
    ${cap.policyDecisionId}::uuid, ${cap.action}, ${objectType}, ${uuidv7()}::uuid,
    ${cap.consequence}, ${decision}, '[]'::jsonb, ${sha256('test-input')},
    ${cap.bundleVersion}, null, null, 'none', 'integration test',
    ${cap.correlationId}::uuid, null, '{}'::jsonb
  )`.execute(tx);
  return cap.policyDecisionId;
}

/**
 * Gate-2.2 C1 — CLOSE the operation an authority context opened. When a fixture
 * writes a real business effect (a canonical object, an outbox row, a tenant,
 * …), the database now REQUIRES that effect to be inseparably linked to a
 * persisted allow decision and a matching success audit event before the
 * transaction may commit. This helper writes both, exactly as the request
 * pipeline does, bound to the same capability the effect was written under.
 *
 * Call it inside a `withCtx(...)` callback AFTER the effect, e.g.
 *   await withCtx(commit, p, 'DOMAIN', t, d, async (tx, cap) => {
 *     await sql`select objects.enqueue_event(...)`.execute(tx);
 *     await closeOperation(tx, cap);
 *   }, { action: 'objects.create' });
 */
export async function closeOperation(
  tx: Kysely<never>,
  cap: CtxCapability,
  target: { type?: string | null; id?: string | null; version?: string | null } = {},
): Promise<void> {
  await commitDecision(tx, cap);
  await sql`select audit.commit_event(
    'api.request', ${cap.action}, 'success', 'OK',
    ${target.type ?? null}, ${target.id ?? null}, ${target.version ?? null},
    ${cap.policyDecisionId}::uuid, ${cap.bundleVersion},
    ${cap.correlationId}::uuid, null::uuid, null, null, null, '{}'::jsonb
  )`.execute(tx);
}
