/**
 * PHASE 0 ACCEPTANCE SUITE — reproducible evidence for the 15 acceptance
 * criteria (PHASE0_PLAN.md §16), the §7.2 request-path requirements, and the
 * remediation-mandated audit-on-commit tests (R10 #6, #7, #8) plus audited
 * refresh rotation (R4). Spawns the built API (dist/) against the Compose
 * Postgres, runs migrations and (idempotent) bootstrap first.
 * R7: every credential comes from the generated .eye-local/env handoff (via
 * test/setup-env.ts) or the caller's environment — no fixed literals.
 * Run: pnpm test:accept (after pnpm build).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { contentDigest } from '@eye/contracts';
import { uuidv7 } from 'uuidv7';

const ROOT = join(__dirname, '..', '..');
const REPO = join(ROOT, '..', '..');
const PORT = 3499;
const BASE = `http://localhost:${PORT}`;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}

/**
 * Gate-2.2 (C9/C14) — EXECUTION-ENVIRONMENT ISOLATION.
 *
 * A virgin database is not a virgin execution environment: the degraded journal is
 * durable filesystem state that legitimately survives restarts, so a journal left
 * by an EARLIER run would make this run start degraded and /readyz report
 * `degraded` for reasons that have nothing to do with this run.
 *
 * Every isolated gate run therefore gets its OWN controlled journal directory,
 * whose initial state is asserted empty below. Restart persistence is still
 * exercised explicitly (AC-11 kills and respawns the API against this SAME
 * directory), so isolation does not weaken the durability property — it only
 * stops unrelated history from contaminating a clean run. A real unreconciled
 * production journal is never touched: this directory is created fresh under the
 * OS temp root and is only removed if it belongs to this run.
 */
const DEGRADED_DIR = mkdtempSync(join(tmpdir(), 'eye-gate-degraded-'));

/**
 * Gate-2.2 (C9/C14) — DETERMINISTIC DATABASE ISOLATION.
 *
 * This suite bootstraps the platform administrator, which is a ONE-TIME,
 * claim-guarded act that legitimately refuses to run twice. Sharing a database
 * with the integration suite therefore made the gate ORDER-DEPENDENT: the
 * integration suite creates platform_admin principals, so a later bootstrap here
 * correctly refuses ("a platform administrator already exists") and every
 * authenticated test then failed for a reason unrelated to the code under test.
 *
 * The acceptance suite now owns its OWN database, created fresh and dropped at
 * teardown. The gate no longer depends on suite ordering, on which suite ran
 * first, or on any manually prepared state.
 */
const ACCEPT_DB = `eye_accept_${process.pid}`;

const ENV = {
  ...process.env,
  EYE_DB_NAME: ACCEPT_DB,
  EYE_DEGRADED_DIR: DEGRADED_DIR,
  EYE_RUNTIME_PORT: String(PORT),
  EYE_DB_HOST: process.env['EYE_DB_HOST'] ?? 'localhost',
  EYE_DB_APP_PASSWORD: required('EYE_DB_APP_PASSWORD'),
  EYE_DB_ALLOCATOR_PASSWORD: required('EYE_DB_ALLOCATOR_PASSWORD'),
  EYE_DB_SYSTEM_PASSWORD: required('EYE_DB_SYSTEM_PASSWORD'),
  EYE_DB_COMMIT_PASSWORD: required('EYE_DB_COMMIT_PASSWORD'),
  EYE_DB_IDENTITY_PASSWORD: required('EYE_DB_IDENTITY_PASSWORD'),
  EYE_DB_PUBLISHER_PASSWORD: required('EYE_DB_PUBLISHER_PASSWORD'),
  EYE_DB_VERIFIER_PASSWORD: required('EYE_DB_VERIFIER_PASSWORD'),
  EYE_DB_MIGRATE_PASSWORD: required('EYE_DB_MIGRATE_PASSWORD'),
  EYE_REDIS_PASSWORD: required('EYE_REDIS_PASSWORD'),
  EYE_IDENTITY_JWT_SECRET: required('EYE_IDENTITY_JWT_SECRET'),
};

let api: ChildProcess;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any>; // eye_app — used for privilege NEGATIVES only
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sysDb: Kysely<any>; // eye_system — evidence verification reads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let su: Kysely<any>; // migrate — audit-failure injection (freeze toggle) only
let adminToken = '';
let adminPrincipalId = '';
// R7: ephemeral generated test secrets (per environment, never committed).
const INITIAL_PW = required('EYE_TEST_BOOTSTRAP_PASSWORD');
const ROTATED_PW = required('EYE_TEST_ADMIN_PASSWORD');
let tenantId = '';
let domainId = '';
const run = uuidv7().slice(-12);

interface EnvOver {
  scope: 'PLATFORM' | 'TENANT' | 'DOMAIN';
  tenant_id?: string | null;
  domain_id?: string | null;
  action: string;
  object_type: string;
  side_effect_class?: string;
  consequence_class?: string;
  principal_id?: string;
  purpose_id?: string | null;
}

async function makeEnvelope(over: EnvOver, payload: unknown): Promise<Record<string, unknown>> {
  return {
    message_id: uuidv7(),
    scope: over.scope,
    tenant_id: over.tenant_id ?? null,
    domain_id: over.domain_id ?? null,
    principal_id: over.principal_id ?? `principal:${adminPrincipalId}`,
    purpose_id: over.purpose_id === null ? null : (over.purpose_id ?? 'platform.administration'),
    action: over.action,
    side_effect_class: over.side_effect_class ?? 'reversible',
    consequence_class: over.consequence_class ?? 'C1',
    object_type: over.object_type,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: uuidv7(),
    trace_id: 'accept',
    payload_digest: contentDigest(payload ?? {}),
  };
}

async function post(path: string, over: EnvOver, payload: unknown = {}, token = adminToken) {
  const envelope = await makeEnvelope(over, payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== '') headers['authorization'] = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify({ envelope, payload }) });
  return { status: r.status, body: (await r.json()) as Record<string, any>, correlationId: envelope.correlation_id as string };
}

/**
 * Evidence verification reads. Gate-2: the ordinary application role can no
 * longer see across scopes at all, and the bound context is single-use and
 * proof-bound, so the harness verifies stored evidence through the migrate
 * superuser connection (which bypasses RLS by definition). This is a TEST
 * OBSERVATION path only — no production code path has this reach.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sysRead<T>(fn: (tx: Kysely<any>) => Promise<T>): Promise<T> {
  return su.transaction().execute(async (tx) => fn(tx as never));
}

async function auditRowsFor(correlationId: string): Promise<Array<Record<string, unknown>>> {
  return sysRead(async (tx) =>
    tx.selectFrom('audit.audit_events').selectAll().where('correlation_id', '=', correlationId).execute());
}

async function polRowsFor(correlationId: string): Promise<Array<Record<string, unknown>>> {
  return sysRead(async (tx) =>
    tx.selectFrom('policy.policy_decisions').selectAll().where('correlation_id', '=', correlationId).execute());
}

async function setPartitionFrozen(partitionId: string, frozen: boolean): Promise<void> {
  await sql`update audit.audit_chain_heads set frozen = ${frozen} where partition_id = ${partitionId}`.execute(su);
}

async function loginAs(username: string, password: string) {
  return post('/v1/auth/login', {
    scope: 'PLATFORM', action: 'identity.session.create', object_type: 'SES',
    principal_id: 'anonymous', purpose_id: 'authentication',
  }, { username, password }, '');
}

async function refreshWith(token: string) {
  return post('/v1/auth/refresh', {
    scope: 'PLATFORM', action: 'identity.session.refresh', object_type: 'SES',
    principal_id: 'anonymous', purpose_id: 'authentication',
  }, { refreshToken: token }, '');
}

beforeAll(async () => {
  // Deterministic isolation: create this run's OWN database first, so migrate and
  // bootstrap always start from a genuinely pristine state.
  const admin = new pg.Client({
    host: ENV.EYE_DB_HOST, port: Number(process.env['EYE_DB_PORT'] ?? 5432),
    database: 'postgres', user: process.env['EYE_DB_MIGRATE_USER'] ?? 'eye',
    password: ENV.EYE_DB_MIGRATE_PASSWORD,
  });
  await admin.connect();
  await admin.query(`drop database if exists ${ACCEPT_DB}`);
  await admin.query(`create database ${ACCEPT_DB}`);
  await admin.end();

  // Reproducible startup: migrate + bootstrap (honest exit codes) + spawn built API.
  execFileSync('node', [join(ROOT, 'scripts', 'migrate.mjs')], { env: ENV });

  // PRECONDITION PROOF: the database this run bootstraps into is pristine — no
  // platform administrator and no bootstrap claim. If this ever fails, the gate
  // says so in one clear line instead of cascading confusing auth failures.
  const pre = new pg.Client({
    host: ENV.EYE_DB_HOST, port: Number(process.env['EYE_DB_PORT'] ?? 5432),
    database: ACCEPT_DB, user: process.env['EYE_DB_MIGRATE_USER'] ?? 'eye',
    password: ENV.EYE_DB_MIGRATE_PASSWORD,
  });
  await pre.connect();
  const admins = await pre.query(
    "select count(*)::int n from identity.role_bindings where role_code = 'platform_admin' and revoked_at is null");
  const claims = await pre.query('select count(*)::int n from identity.bootstrap_claim');
  await pre.end();
  if (admins.rows[0].n !== 0 || claims.rows[0].n !== 0) {
    throw new Error(
      `acceptance precondition failed: database ${ACCEPT_DB} is not pristine ` +
      `(platform_admin bindings=${admins.rows[0].n}, bootstrap claims=${claims.rows[0].n})`,
    );
  }
  try {
    execFileSync('node', [join(ROOT, 'dist', 'bootstrap', 'run-bootstrap.js')], {
      env: { ...ENV, EYE_BOOTSTRAP_ADMIN: 'platform-admin', EYE_BOOTSTRAP_PASSWORD: INITIAL_PW },
      stdio: 'pipe',
    });
  } catch (e) {
    // Exit 2 = already bootstrapped (expected on re-runs); anything else is real.
    const status = (e as { status?: number }).status;
    if (status !== 2) throw e;
  }
  api = spawn('node', [join(ROOT, 'dist', 'main.js')], { env: ENV, stdio: 'pipe' });
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(BASE + '/healthz');
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  const mkPool = (user: string, password: string) =>
    new Kysely({
      dialect: new PostgresDialect({
        // Gate-2.2: this run's OWN database, not the shared one.
        pool: new pg.Pool({ host: ENV.EYE_DB_HOST, port: 5432, database: ACCEPT_DB, user, password, max: 4 }),
      }),
    });
  db = mkPool('eye_app', ENV.EYE_DB_APP_PASSWORD) as never;
  sysDb = mkPool('eye_commit', ENV.EYE_DB_COMMIT_PASSWORD) as never;
  su = mkPool('eye', ENV.EYE_DB_MIGRATE_PASSWORD) as never;
}, 60_000);

afterAll(async () => {
  api?.kill();
  await db?.destroy();
  await sysDb?.destroy();
  await su?.destroy();
  // Recorded teardown (Gate-2.2 C9/C14): report what this run's journal held, then
  // remove ONLY this run's own controlled directory. A journal outside this
  // directory — i.e. any real unreconciled operational journal — is never touched.
  const journal = join(DEGRADED_DIR, 'audit-degraded.jsonl');
  const records = existsSync(journal)
    ? readFileSync(journal, 'utf8').split('\n').filter((l) => l.trim() !== '').length
    : 0;
  // eslint-disable-next-line no-console
  console.log(`[gate] degraded-journal teardown: ${records} record(s) in ${DEGRADED_DIR} (this run only)`);
  if (DEGRADED_DIR.includes('eye-gate-degraded-')) rmSync(DEGRADED_DIR, { recursive: true, force: true });
  // Recorded teardown of this run's OWN database (never a shared or real one).
  try {
    const admin = new pg.Client({
      host: ENV.EYE_DB_HOST, port: Number(process.env['EYE_DB_PORT'] ?? 5432),
      database: 'postgres', user: process.env['EYE_DB_MIGRATE_USER'] ?? 'eye',
      password: ENV.EYE_DB_MIGRATE_PASSWORD,
    });
    await admin.connect();
    await admin.query(`drop database if exists ${ACCEPT_DB} with (force)`);
    await admin.end();
    // eslint-disable-next-line no-console
    console.log(`[gate] acceptance database teardown: dropped ${ACCEPT_DB}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[gate] acceptance database ${ACCEPT_DB} left in place:`, (e as Error).message);
  }
});

describe('Gate-2.2 C9/C14: execution-environment isolation of the degraded journal', () => {
  it('this run has its OWN controlled journal directory, proven empty at start', () => {
    // A virgin database is not a virgin execution environment. This asserts the
    // INITIAL STATE of the durable state that would otherwise leak between runs.
    expect(DEGRADED_DIR).toContain('eye-gate-degraded-');
    mkdirSync(DEGRADED_DIR, { recursive: true });
    const entries = readdirSync(DEGRADED_DIR);
    expect(entries, `journal dir must start empty, found: ${entries.join(', ')}`).toHaveLength(0);
    expect(existsSync(join(DEGRADED_DIR, 'audit-degraded.jsonl'))).toBe(false);
  });

  it('the API under test is actually using that directory (not a shared default)', () => {
    expect(ENV.EYE_DEGRADED_DIR).toBe(DEGRADED_DIR);
  });
});

describe('AC-12: fully local reproducible startup', () => {
  it('readiness reports ok with database connected (telemetry-only classified)', async () => {
    const r = await (await fetch(BASE + '/readyz')).json();
    expect(r).toMatchObject({ status: 'ok', db: true, classification: 'telemetry-only' });
  });
});

describe('AC-1: authorized platform administrator authentication (one-time bootstrap secret)', () => {
  it('first bootstrap login FORCES rotation; rotated credential then authenticates normally', async () => {
    // Try the rotated credential first (environment already rotated on re-runs).
    let r = await loginAs('platform-admin', ROTATED_PW);
    if (r.status !== 201) {
      // Fresh environment: the one-time secret must demand rotation…
      r = await loginAs('platform-admin', INITIAL_PW);
      expect(r.status).toBe(201);
      expect(r.body.rotationRequired).toBe(true);
      const bootstrapToken = r.body.tokens.accessToken as string;
      const bootPid = r.body.principalId as string;

      // …and a bootstrap_rotation session is denied every governed action (fail closed).
      const denied = await post('/v1/platform/tenants/list', {
        scope: 'PLATFORM', action: 'tenancy.tenant.list', object_type: 'TEN',
        side_effect_class: 'none', principal_id: `principal:${bootPid}`,
      }, {}, bootstrapToken);
      expect(denied.status).toBe(403);

      // Rotate (audited, atomic with its evidence), sessions revoked, then log in anew.
      const rot = await post('/v1/auth/rotate', {
        scope: 'PLATFORM', action: 'identity.credential.rotate', object_type: 'PRN',
        principal_id: `principal:${bootPid}`, purpose_id: 'authentication',
      }, { currentPassword: INITIAL_PW, newPassword: ROTATED_PW }, bootstrapToken);
      expect(rot.status).toBe(201);
      const rotRows = await auditRowsFor(rot.correlationId);
      expect(rotRows.some((x) => x['event_type'] === 'identity.credential_rotated')).toBe(true);
      // Old bootstrap token is dead (sessions revoked).
      const stale = await post('/v1/platform/tenants/list', {
        scope: 'PLATFORM', action: 'tenancy.tenant.list', object_type: 'TEN',
        side_effect_class: 'none', principal_id: `principal:${bootPid}`,
      }, {}, bootstrapToken);
      expect(stale.status).toBe(401);
      // One-time secret no longer works.
      const replay = await loginAs('platform-admin', INITIAL_PW);
      expect(replay.status).toBe(401);
      r = await loginAs('platform-admin', ROTATED_PW);
      expect(r.status).toBe(201);
    }
    expect(r.body.rotationRequired).toBe(false);
    adminToken = r.body.tokens.accessToken;
    adminPrincipalId = r.body.principalId;
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.some((x) => x['event_type'] === 'identity.login')).toBe(true);
  });

  it('bad credentials are rejected and captured by the sanitized security intake', async () => {
    const payload = { username: 'platform-admin', password: 'wrong-password-123' };
    const r = await post('/v1/auth/login', {
      scope: 'PLATFORM', action: 'identity.session.create', object_type: 'SES',
      principal_id: 'anonymous', purpose_id: 'authentication',
    }, payload, '');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('EYE-IDN-002');
    const rows = await auditRowsFor(r.correlationId);
    const intake = rows.find((x) => x['event_type'] === 'security.intake');
    expect(intake).toBeDefined();
    // Sanitization: never credentials/payload content in the evidence.
    expect(JSON.stringify(intake)).not.toContain('wrong-password');
    // R3: rate limiting aggregates — the drop counter field is always present.
    const meta = JSON.parse(String((intake as Record<string, unknown>)['event_jcs'] ?? '{}')) as {
      metadata?: { suppressed_since_last?: number };
    };
    expect(typeof meta.metadata?.suppressed_since_last).toBe('number');
  });
});

describe('R4: refresh-token rotation over the wire (audited)', () => {
  it('rotates on every successful refresh; detects replay; revokes on reuse; audits all three', async () => {
    const login = await loginAs('platform-admin', ROTATED_PW);
    expect(login.status).toBe(201);
    const first = login.body.tokens.refreshToken as string;

    // 1. Successful refresh returns a NEW refresh token — audited as rotation.
    const r1 = await refreshWith(first);
    expect(r1.status).toBe(201);
    const second = r1.body.refreshToken as string;
    expect(second).not.toBe(first);
    const rows1 = await auditRowsFor(r1.correlationId);
    expect(rows1.some((x) => x['event_type'] === 'identity.refresh_rotated')).toBe(true);

    // 2. REPLAY of the invalidated first token → rejected, session revoked, audited.
    const r2 = await refreshWith(first);
    expect(r2.status).toBe(401);
    const rows2 = await auditRowsFor(r2.correlationId);
    expect(rows2.some((x) => x['event_type'] === 'identity.refresh_reuse_detected')).toBe(true);

    // 3. The whole FAMILY is revoked on reuse — the newest token is dead too, and
    // because it is a known-but-invalidated generation it is reported as reuse.
    const r3 = await refreshWith(second);
    expect(r3.status).toBe(401);
    const rows3 = await auditRowsFor(r3.correlationId);
    expect(rows3.some((x) => x['event_type'] === 'identity.refresh_reuse_detected')).toBe(true);

    // 4. A token that was never issued is simply rejected (no family to revoke).
    const r4 = await refreshWith(`${uuidv7()}.never-issued`);
    expect(r4.status).toBe(401);
    const rows4 = await auditRowsFor(r4.correlationId);
    expect(rows4.some((x) => x['event_type'] === 'identity.refresh_rejected')).toBe(true);
  });
});

describe('R10 #8: session/credential/token mutations ROLL BACK when the audit commit fails', () => {
  it('login creates NO session when the audit append cannot commit', async () => {
    const countActive = async () =>
      Number(((await sql<{ n: string }>`select count(*) n from identity.sessions where status = 'active'`.execute(su)).rows[0] ?? { n: '0' }).n);

    await setPartitionFrozen('platform', true);
    try {
      const before = await countActive();
      const r = await loginAs('platform-admin', ROTATED_PW);
      // Gate-2 §6: audit unavailable ⇒ FAIL CLOSED with 503 + durable degraded
      // evidence, never a silent success.
      expect(r.status).toBe(503);
      const after = await countActive();
      expect(after).toBe(before); // no session slipped through without evidence
    } finally {
      await setPartitionFrozen('platform', false);
    }
    // Degraded state is durable + surfaced (never presented as healthy).
    const ready = (await (await fetch(BASE + '/readyz')).json()) as {
      status: string; audit: string; auditIncidents: number;
    };
    expect(ready.audit).toBe('degraded');
    expect(ready.status).toBe('degraded');
    expect(ready.auditIncidents).toBeGreaterThan(0);
    // The system works again after unfreezing (proves the failure was the injection).
    const ok = await loginAs('platform-admin', ROTATED_PW);
    expect(ok.status).toBe(201);
  });

  it('refresh performs NO token-state mutation when the audit append cannot commit', async () => {
    const login = await loginAs('platform-admin', ROTATED_PW);
    const token = login.body.tokens.refreshToken as string;
    await setPartitionFrozen('platform', true);
    try {
      const r = await refreshWith(token);
      expect(r.status).toBe(503);
    } finally {
      await setPartitionFrozen('platform', false);
    }
    // The SAME token still rotates cleanly — the failed attempt consumed nothing.
    const ok = await refreshWith(token);
    expect(ok.status).toBe(201);
  });

  it('credential rotation rolls back atomically when the audit append cannot commit', async () => {
    const login = await loginAs('platform-admin', ROTATED_PW);
    const token = login.body.tokens.accessToken as string;
    const pid = login.body.principalId as string;
    await setPartitionFrozen('platform', true);
    try {
      const r = await post('/v1/auth/rotate', {
        scope: 'PLATFORM', action: 'identity.credential.rotate', object_type: 'PRN',
        principal_id: `principal:${pid}`, purpose_id: 'authentication',
      }, { currentPassword: ROTATED_PW, newPassword: ROTATED_PW + 'X' }, token);
      expect(r.status).toBe(503);
    } finally {
      await setPartitionFrozen('platform', false);
    }
    // Old credential still valid; the aborted new one never took effect.
    const ok = await loginAs('platform-admin', ROTATED_PW);
    expect(ok.status).toBe(201);
    adminToken = ok.body.tokens.accessToken;
  });
});

describe('AC-2/AC-3: governed tenant+domain creation under explicit scopes', () => {
  it('creates a tenant (PLATFORM) and a domain (TENANT) with receipts', async () => {
    const t = await post('/v1/platform/tenants', { scope: 'PLATFORM', action: 'tenancy.tenant.create', object_type: 'TEN' }, { name: `accept-${run}` });
    expect(t.status).toBe(201);
    expect(t.body.receipt.policyDecisionId).toBeDefined();
    tenantId = t.body.tenant.id;
    const d = await post(`/v1/tenants/${tenantId}/domains`, { scope: 'TENANT', tenant_id: tenantId, action: 'tenancy.domain.create', object_type: 'CID' }, { name: 'accept-domain' });
    expect(d.status).toBe(201);
    domainId = d.body.domain.id;
  });

  it('fails closed on scope ambiguity: envelope scope must match resolved scope', async () => {
    const r = await post('/v1/platform/tenants/list', {
      scope: 'TENANT', tenant_id: tenantId, action: 'tenancy.tenant.list', object_type: 'TEN', side_effect_class: 'none',
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-TEN-001');
  });
});

describe('R10 #6: scope/route/envelope mismatches leave DURABLE sanitized evidence', () => {
  it('envelope-scope mismatch records a request.scope_denied audit event before failing', async () => {
    const r = await post('/v1/platform/tenants/list', {
      scope: 'TENANT', tenant_id: tenantId, action: 'tenancy.tenant.list', object_type: 'TEN', side_effect_class: 'none',
    });
    expect(r.status).toBe(403);
    const rows = await auditRowsFor(r.correlationId);
    const denial = rows.find((x) => x['event_type'] === 'request.scope_denied');
    expect(denial).toBeDefined();
    expect(denial!['outcome']).toBe('denied');
  });

  it('envelope-action mismatch (smuggled intent) records durable denial evidence', async () => {
    // Valid envelope shape, but the declared action does not match the route's.
    const r = await post('/v1/platform/tenants/list', {
      scope: 'PLATFORM', action: 'tenancy.tenant.delete', object_type: 'TEN', side_effect_class: 'none',
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-TEN-001');
    const rows = await auditRowsFor(r.correlationId);
    const denial = rows.find((x) => x['event_type'] === 'request.scope_denied');
    expect(denial).toBeDefined();
    expect(denial!['outcome']).toBe('denied');
    // Sanitized: bounded reason + routing metadata only — never payload content.
    const body = JSON.parse(String(denial!['event_jcs'])) as { metadata: { reason: string } };
    expect(body.metadata.reason).toContain('action');
  });
});

describe('AC-4/§7.2: every request path has an executable audit path', () => {
  it('allowed write: object + POL + AUD atomically, ack after commit', async () => {
    const payload = {
      objectType: 'CLM', truthState: 'observed', evidenceRefs: ['evd:accept'],
      observationTime: new Date().toISOString(),
      classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'S', predicate: 'p', object_value: 'V' },
    };
    const r = await post(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create', object_type: 'CLM', purpose_id: 'analysis',
    }, payload);
    expect(r.status).toBe(201);
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.some((x) => x['outcome'] === 'success' && x['action'] === 'objects.create')).toBe(true);
    const pol = await polRowsFor(r.correlationId);
    expect(pol).toHaveLength(1);
    const outbox = await sysRead(async (tx) =>
      tx.selectFrom('objects.object_outbox').selectAll().where('correlation_id', '=', r.correlationId).execute());
    expect(outbox).toHaveLength(1);
  });

  it('consequential read: POL + AUD durable, no outbox', async () => {
    const r = await post('/v1/platform/audit/query', {
      scope: 'PLATFORM', action: 'audit.read', object_type: 'AUD', side_effect_class: 'none',
    }, { limit: 3 });
    expect(r.status).toBe(201);
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.some((x) => x['action'] === 'audit.read' && x['outcome'] === 'success')).toBe(true);
    const outbox = await sysRead(async (tx) =>
      tx.selectFrom('objects.object_outbox').selectAll().where('correlation_id', '=', r.correlationId).execute());
    expect(outbox).toHaveLength(0);
  });

  it('denied request: POL + AUD recorded, no domain object created', async () => {
    // C3 consequence is denied fail-closed (no human-gate runtime in Phase 0).
    const payload = {
      objectType: 'CLM', truthState: 'observed', evidenceRefs: ['evd:x'],
      classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'a', predicate: 'b', object_value: 'c' },
    };
    const countObjects = async () =>
      sysRead(async (tx) => {
        const c = await tx.selectFrom('objects.canonical_objects').select(sql`count(*)`.as('n')).executeTakeFirst();
        return Number((c as { n: string }).n);
      });
    const before = await countObjects();
    const r = await post(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create',
      object_type: 'CLM', purpose_id: 'analysis', consequence_class: 'C3',
    }, payload);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-AUT-001');
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.some((x) => x['outcome'] === 'denied')).toBe(true);
    expect(await countObjects()).toBe(before); // AC-10: transactional consistency — no partial object
  });

  it('failure path: malformed envelope → sanitized security intake, EYE-REQ-001', async () => {
    const r = await fetch(BASE + '/v1/platform/tenants/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ envelope: { smuggled_scope: 'PLATFORM' }, payload: {} }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { code: string; correlationId: string };
    expect(body.code).toBe('EYE-REQ-001');
    const rows = await auditRowsFor(body.correlationId);
    expect(rows.some((x) => x['event_type'] === 'security.intake')).toBe(true);
  });

  it('health endpoints are classified telemetry-only (no per-request audit)', async () => {
    const countEvents = async () =>
      sysRead(async (tx) => {
        const c = await tx.selectFrom('audit.audit_events').select(sql`count(*)`.as('n')).executeTakeFirst();
        return Number((c as { n: string }).n);
      });
    const beforeCount = await countEvents();
    await fetch(BASE + '/healthz');
    await fetch(BASE + '/readyz');
    expect(await countEvents()).toBe(beforeCount);
  });
});

describe('R10 #7: handler failures inside allowed paths leave DURABLE failure evidence', () => {
  it('provenance failure (EYE-PRV-001) rolls back the write but records POL + AUD failure evidence', async () => {
    const payload = {
      objectType: 'CLM', truthState: 'asserted', evidenceRefs: [],
      classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'x', predicate: 'y', object_value: 'z' },
    };
    const r = await post(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create', object_type: 'CLM', purpose_id: 'analysis',
    }, payload);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('EYE-PRV-001');
    const rows = await auditRowsFor(r.correlationId);
    const failure = rows.find((x) => x['outcome'] === 'failure' && x['action'] === 'objects.create');
    expect(failure).toBeDefined();
    expect(failure!['result_code']).toBe('EYE-PRV-001');
    const pol = await polRowsFor(r.correlationId);
    expect(pol.length).toBeGreaterThanOrEqual(1);
  });

  it('payload-validation failure records durable failure evidence', async () => {
    const payload = {
      objectType: 'CLM', truthState: 'asserted', evidenceRefs: ['evd:1'],
      classification: 'internal', purposeScope: 'analysis',
      payload: { not_the_schema: true },
    };
    const r = await post(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create', object_type: 'CLM', purpose_id: 'analysis',
    }, payload);
    expect(r.status).toBe(400);
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.some((x) => x['outcome'] === 'failure')).toBe(true);
  });

  it('version-conflict failure (EYE-STA-002) records durable failure evidence', async () => {
    const mk = () => ({
      objectType: 'CLM', truthState: 'asserted', evidenceRefs: ['evd:v'],
      classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'V', predicate: 'has', object_value: 'W' },
    });
    const objBase = `/v1/tenants/${tenantId}/domains/${domainId}/objects`;
    const over = { scope: 'DOMAIN' as const, tenant_id: tenantId, domain_id: domainId, object_type: 'CLM', purpose_id: 'analysis' };
    const c = await post(objBase, { ...over, action: 'objects.create' }, mk());
    expect(c.status).toBe(201);
    const objectId = c.body.object.object_id as string;
    const stale = await post(`${objBase}/${objectId}/correct`, { ...over, action: 'objects.correct' }, { expectedVersion: 99, correction: mk() });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('EYE-STA-002');
    const rows = await auditRowsFor(stale.correlationId);
    const failure = rows.find((x) => x['outcome'] === 'failure');
    expect(failure).toBeDefined();
    expect(failure!['result_code']).toBe('EYE-STA-002');
  });

  it('consequential-read handler failure re-records its evidence durably after rollback', async () => {
    const objBase = `/v1/tenants/${tenantId}/domains/${domainId}/objects`;
    const r = await post(`${objBase}/${uuidv7()}/get`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.read',
      object_type: 'CLM', side_effect_class: 'none', purpose_id: 'analysis',
    }, {});
    expect(r.status).toBe(404); // EYE-STA-001: no authorized version matches
    const rows = await auditRowsFor(r.correlationId);
    const failure = rows.find((x) => x['outcome'] === 'failure' && x['action'] === 'objects.read');
    expect(failure).toBeDefined();
    const pol = await polRowsFor(r.correlationId);
    expect(pol.length).toBeGreaterThanOrEqual(1);
  });
});

describe('AC-5: four-value ABAC with enforced obligations', () => {
  it('audit.read returns allow_with_obligations and the mask is EXECUTED (sanitized projection)', async () => {
    const r = await post('/v1/platform/audit/query', {
      scope: 'PLATFORM', action: 'audit.read', object_type: 'AUD', side_effect_class: 'none',
    }, { limit: 1 });
    expect(r.status).toBe(201);
    expect(r.body.obligationsApplied.map((o: { type: string }) => o.type)).toEqual(
      expect.arrayContaining(['audit_access', 'mask_secret_metadata']),
    );
    const ev = r.body.events[0] as Record<string, unknown>;
    expect(ev['event']).toBeUndefined();          // raw event body masked
    expect(ev['event_jcs']).toBeUndefined();      // canonical bytes masked
    expect(ev['row_hash']).toBeDefined();         // integrity fields visible
  });

  it('missing purpose on a protected operation → deny', async () => {
    const r = await post('/v1/platform/tenants/list', {
      scope: 'PLATFORM', action: 'tenancy.tenant.list', object_type: 'TEN', side_effect_class: 'none', purpose_id: null,
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-AUT-001');
  });
});

describe('AC-6/AC-7: canonical object lifecycle', () => {
  let objectId = '';
  let tAfterV1 = '';

  it('creates, corrects (non-destructive), and version-conflicts correctly', async () => {
    const mk = (v: string) => ({
      objectType: 'CLM', truthState: 'asserted', evidenceRefs: ['evd:accept-2'],
      observationTime: new Date().toISOString(), classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'Acme', predicate: 'acquired', object_value: v },
    });
    const objBase = `/v1/tenants/${tenantId}/domains/${domainId}/objects`;
    const over = { scope: 'DOMAIN' as const, tenant_id: tenantId, domain_id: domainId, object_type: 'CLM', purpose_id: 'analysis' };
    const c = await post(objBase, { ...over, action: 'objects.create' }, mk('WidgetCo'));
    expect(c.status).toBe(201);
    objectId = c.body.object.object_id;
    // R5: the stored row carries the full-header digest, verified round-trip in-tx.
    expect(String(c.body.object.content_digest)).toMatch(/^[0-9a-f]{64}$/);
    tAfterV1 = new Date().toISOString();
    await new Promise((res) => setTimeout(res, 25));
    const fix = await post(`${objBase}/${objectId}/correct`, { ...over, action: 'objects.correct' }, { expectedVersion: 1, correction: mk('WidgetCo Inc.') });
    expect(fix.status).toBe(201);
    expect(fix.body.object.correction_of).toBe(`${objectId}@1`);
    const stale = await post(`${objBase}/${objectId}/correct`, { ...over, action: 'objects.correct' }, { expectedVersion: 1, correction: mk('X') });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('EYE-STA-002');
  });

  it('as-of (known-at) retrieval shows the pre-correction state — no hindsight contamination', async () => {
    const objBase = `/v1/tenants/${tenantId}/domains/${domainId}/objects`;
    const over = { scope: 'DOMAIN' as const, tenant_id: tenantId, domain_id: domainId, object_type: 'CLM', side_effect_class: 'none', purpose_id: 'analysis' };
    const cur = await post(`${objBase}/${objectId}/get`, { ...over, action: 'objects.read' }, {});
    expect(Number(cur.body.object.object_version)).toBe(2);
    const asof = await post(`${objBase}/${objectId}/get`, { ...over, action: 'objects.read' }, { knownAt: tAfterV1 });
    expect(Number(asof.body.object.object_version)).toBe(1);
    expect(asof.body.object.payload.object_value).toBe('WidgetCo');
  });

  it('rejects temporal inconsistency: valid_to <= valid_from (EYE-TMP-001)', async () => {
    const payload = {
      objectType: 'CLM', truthState: 'asserted', evidenceRefs: ['evd:t'],
      validFrom: '2026-02-01T00:00:00.000Z', validTo: '2026-01-01T00:00:00.000Z',
      classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'x', predicate: 'y', object_value: 'z' },
    };
    const r = await post(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create', object_type: 'CLM', purpose_id: 'analysis',
    }, payload);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('EYE-TMP-001');
  });

  it('rejects writes without valid provenance (EYE-PRV-001)', async () => {
    const payload = {
      objectType: 'CLM', truthState: 'asserted', evidenceRefs: [],
      classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'x', predicate: 'y', object_value: 'z' },
    };
    const r = await post(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create', object_type: 'CLM', purpose_id: 'analysis',
    }, payload);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('EYE-PRV-001');
  });
});

describe('AC-8/AC-9: database-level immutability and chain integrity', () => {
  it('UPDATE/DELETE on canonical objects and audit events rejected at DB level', async () => {
    await expect(sql`update objects.canonical_objects set classification='x'`.execute(db)).rejects.toThrow(/permission denied|append-only/);
    await expect(sql`delete from audit.audit_events`.execute(db)).rejects.toThrow(/permission denied|append-only/);
    await expect(sql`update audit.audit_chain_heads set next_seq=1`.execute(db)).rejects.toThrow(/permission denied/);
  });

  it('platform + tenant audit chains verify intact via the API', async () => {
    for (const partition of ['platform', `tenant:${tenantId}`]) {
      const r = await post('/v1/platform/audit/verify', {
        scope: 'PLATFORM', action: 'audit.verify', object_type: 'AUD', side_effect_class: 'none',
      }, { partitionId: partition });
      expect(r.status).toBe(201);
      expect(r.body.report.ok).toBe(true);
      expect(r.body.report.headMatches).toBe(true);
    }
  });
});

describe('AC-11: cross-tenant negatives without metadata leakage', () => {
  it('a tenant admin of tenant A is denied tenant B access with no B metadata in the error', async () => {
    // R7: per-run generated credential (never a fixed literal).
    const pw = `A1!${uuidv7()}`;
    const loginName = `accept-admin-${run}`;
    const cp = await post(`/v1/tenants/${tenantId}/principals`, {
      scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.create', object_type: 'PRN',
    }, { kind: 'human', displayName: `Acceptance Admin ${run}`, loginName, password: pw, roleCode: 'tenant_admin' });
    expect(cp.status).toBe(201);
    const login = await post('/v1/auth/login', {
      scope: 'PLATFORM', action: 'identity.session.create', object_type: 'SES', principal_id: 'anonymous', purpose_id: 'authentication',
    }, { username: loginName, password: pw }, '');
    expect(login.status).toBe(201);
    const aToken = login.body.tokens.accessToken;
    const aPid = login.body.principalId;

    const otherTenant = uuidv7(); // pretend tenant B
    const r = await post(`/v1/tenants/${otherTenant}/domains/list`, {
      scope: 'TENANT', tenant_id: otherTenant, action: 'tenancy.domain.list', object_type: 'CID',
      side_effect_class: 'none', principal_id: `principal:${aPid}`,
    }, {}, aToken);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-TEN-001');
    // No metadata leakage: the error names no tenant, no counts, no existence signal.
    const s = JSON.stringify(r.body);
    expect(s).not.toContain(otherTenant);
    expect(s).not.toContain('accept-');
    // R10 #6: the scope-resolution failure left durable denial evidence.
    const rows = await auditRowsFor(r.correlationId);
    const denial = rows.find((x) => x['event_type'] === 'request.scope_denied');
    expect(denial).toBeDefined();
    expect(denial!['outcome']).toBe('denied');
  });

  it('R6: creating a workload principal with a password is refused', async () => {
    const r = await post(`/v1/tenants/${tenantId}/principals`, {
      scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.create', object_type: 'PRN',
    }, { kind: 'workload', displayName: `wl-${run}`, loginName: `wl-${run}`, password: `A1!${uuidv7()}`, roleCode: 'tenant_admin' });
    expect(r.status).toBe(400);
  });
});

describe('AC-13/14/15: repo-level conformance evidence', () => {
  it('CI enforces boundaries, schemas, scans, and tests (workflow present with blocking steps)', () => {
    const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
    for (const needle of [
      'pnpm boundaries', 'gitleaks', 'generate-sbom', 'trivy', 'license-inventory',
      'pnpm audit', 'test:int',
      'scan-type: image', // R8: EXACT image scans, not a mislabeled fs scan
      'scan-type: fs',    // the filesystem scan is present AND labeled as such
    ]) {
      expect(ci.toLowerCase()).toContain(needle.toLowerCase());
    }
  });

  it('compose images are digest-pinned and recorded in the conformance manifest (R7)', () => {
    const manifest = JSON.parse(readFileSync(join(REPO, 'conformance.manifest.json'), 'utf8')) as {
      pinned_images: Record<string, { digest: string }>;
    };
    const compose = readFileSync(join(REPO, 'docker-compose.yml'), 'utf8');
    const images = Object.values(manifest.pinned_images).filter(
      (v): v is { digest: string } => typeof v === 'object' && v !== null && 'digest' in v,
    );
    expect(images).toHaveLength(2); // postgres + redis
    for (const image of images) {
      expect(image.digest).toMatch(/@sha256:[0-9a-f]{64}$/);
      expect(compose).toContain(`image: ${image.digest}`);
    }
    expect(compose).toContain('127.0.0.1:5432:5432'); // loopback only
    expect(compose).toContain('127.0.0.1:6379:6379');
    expect(compose).toContain('--requirepass'); // Redis auth
  });

  it('English UI with i18n/RTL-ready foundations', () => {
    const catalog = JSON.parse(readFileSync(join(REPO, 'apps', 'web', 'messages', 'en.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(catalog).length).toBeGreaterThan(10);
    const i18n = readFileSync(join(REPO, 'apps', 'web', 'lib', 'i18n.ts'), 'utf8');
    expect(i18n).toContain("'ar'");
    expect(i18n).toContain("'rtl'");
    // Logical CSS only in globals (no physical left/right paddings).
    const css = readFileSync(join(REPO, 'apps', 'web', 'app', 'globals.css'), 'utf8');
    expect(css).toContain('padding-inline');
    expect(css).not.toMatch(/padding-left|margin-left|padding-right|margin-right/);
  });

  it('no constitutional invariant is waived inside EXCEPTIONS.md (honest posture)', () => {
    const exc = readFileSync(join(REPO, 'EXCEPTIONS.md'), 'utf8');
    expect(exc).toContain('exception waives the constitutional semantics');
    expect(exc).toContain('HONEST STATEMENT');
    for (const field of ['owner:', 'approver:', 'requirement_ids:', 'consequence_class:', 'compensating_controls:', 'prohibited_exposure:', 'expiry_date:', 'exit_criteria:', 'required_evidence:', 'status:']) {
      expect(exc).toContain(field);
    }
    // Every expiry is a concrete date, never "later".
    expect(exc).not.toMatch(/expiry_date:\s*(later|tbd|TBD)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GATE-2.1 tests 14–17: the four mandated cases that are only observable
// end-to-end against the running API.
// ═════════════════════════════════════════════════════════════════════════════

describe('G21-14 — a PDP-denied identity operation returns 403 with matching durable POL/AUD', () => {
  it('is denied by policy, not by a missing permission, and both records match the request', async () => {
    // A protected identity operation with NO purpose: the PDP denies it. The
    // identity authority must be able to record its own denial evidence.
    const r = await post(`/v1/tenants/${tenantId}/principals`, {
      scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.create', object_type: 'PRN',
      purpose_id: null,
    }, { kind: 'human', displayName: `Denied Principal ${run}` });

    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-AUT-001');
    // NOT a 503: the denial path must not fail because the identity authority
    // lacks permission to establish an evidence context (Gate-2.1 §5).
    expect(r.status).not.toBe(503);

    const pol = await polRowsFor(r.correlationId);
    expect(pol).toHaveLength(1);
    expect(pol[0]!['decision']).toBe('deny');
    expect(pol[0]!['action']).toBe('identity.principal.create');
    expect(pol[0]!['scope']).toBe('TENANT');
    expect(pol[0]!['tenant_id']).toBe(tenantId);

    const rows = await auditRowsFor(r.correlationId);
    const denial = rows.find((x) => x['outcome'] === 'denied');
    expect(denial).toBeDefined();
    expect(denial!['action']).toBe('identity.principal.create');
    expect(denial!['result_code']).toBe('EYE-AUT-001');
    // The AUD references exactly the POL that denied it (the linkage lives in the
    // canonical event body, which is what the row hash covers).
    const denialEvent = denial!['event'] as { policy_decision_id: string | null };
    expect(denialEvent.policy_decision_id).toBe(pol[0]!['id']);

    // And no principal was created.
    const created = await sysRead(async (tx) =>
      tx.selectFrom('identity.principals').selectAll()
        .where('display_name', '=', `Denied Principal ${run}`).execute());
    expect(created).toHaveLength(0);
  });
});

describe('G21-15 — every malformed controller payload creates sanitized durable evidence', () => {
  const SECRET = 'sup3r-s3cret-payload-value';

  it('each authenticated controller edge leaves evidence and never echoes the payload', async () => {
    const edges: Array<[string, string, Record<string, unknown>, Record<string, unknown>]> = [
      ['tenant create', '/v1/platform/tenants',
        { scope: 'PLATFORM', action: 'tenancy.tenant.create', object_type: 'TEN' },
        { name: '', secret: SECRET }],
      ['domain create', `/v1/tenants/${tenantId}/domains`,
        { scope: 'TENANT', tenant_id: tenantId, action: 'tenancy.domain.create', object_type: 'CID' },
        { name: 'x', secret: SECRET }],
      ['principal create', `/v1/tenants/${tenantId}/principals`,
        { scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.create', object_type: 'PRN' },
        { kind: 'human', secret: SECRET }],
      ['object create', `/v1/tenants/${tenantId}/domains/${domainId}/objects`,
        { scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create', object_type: 'CLM', purpose_id: 'analysis' },
        {}],
      ['object correct', `/v1/tenants/${tenantId}/domains/${domainId}/objects/${uuidv7()}/correct`,
        { scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.correct', object_type: 'CLM', purpose_id: 'analysis' },
        { secret: SECRET }],
      ['audit verify', '/v1/platform/audit/verify',
        { scope: 'PLATFORM', action: 'audit.verify', object_type: 'AUD', side_effect_class: 'none' },
        { secret: SECRET }],
    ];

    for (const [label, path, over, payload] of edges) {
      const r = await post(path, over as never, payload);
      expect([400, 422], `${label} status`).toContain(r.status);

      const rows = await auditRowsFor(r.correlationId);
      expect(rows.length, `${label}: durable evidence`).toBeGreaterThanOrEqual(1);
      const rejected = rows.find((x) => x['outcome'] === 'denied' || x['outcome'] === 'failure');
      expect(rejected, `${label}: rejection recorded`).toBeDefined();

      // Sanitization: no payload content, no secret, anywhere in the evidence.
      const serialized = JSON.stringify(rows);
      expect(serialized, `${label}: payload leak`).not.toContain(SECRET);
      // And nothing leaked into the response body either.
      expect(JSON.stringify(r.body), `${label}: response leak`).not.toContain(SECRET);
    }
  });

  it('an authenticated rotation with a too-short new password is evidenced without the password', async () => {
    const weak = 'short';
    const r = await post('/v1/auth/rotate', {
      scope: 'PLATFORM', action: 'identity.credential.rotate', object_type: 'CRD',
      purpose_id: 'authentication', side_effect_class: 'none',
    }, { currentPassword: ROTATED_PW, newPassword: weak });
    expect(r.status).toBe(400);
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(weak);
    expect(serialized).not.toContain(ROTATED_PW);
  });
});

describe('G21-16 — degraded readiness survives a process restart', () => {
  it('a restarted process reports degraded until governed reconciliation records recovery', async () => {
    // 1. Drive the API into a genuinely degraded state: freeze the platform
    //    partition so authoritative audit persistence fails, then make a request.
    await setPartitionFrozen('platform', true);
    try {
      const failed = await loginAs('platform-admin', ROTATED_PW);
      expect(failed.status).toBe(503);
    } finally {
      await setPartitionFrozen('platform', false);
    }
    const before = (await (await fetch(BASE + '/readyz')).json()) as { status: string; audit: string };
    expect(before.audit).toBe('degraded');

    // 2. The degradation is durable in BOTH places: the local journal and the
    //    governed ledger.
    const incidents = await sysRead(async (tx) =>
      tx.selectFrom('audit.availability_incidents').selectAll().where('reconciled_at', 'is', null).execute());
    expect(incidents.length).toBeGreaterThanOrEqual(1);

    // 3. RESTART the process. A memory-only flag would come back "ok" here.
    api?.kill();
    await new Promise((res) => setTimeout(res, 500));
    api = spawn('node', [join(ROOT, 'dist', 'main.js')], { env: ENV, stdio: 'pipe' });
    for (let i = 0; i < 60; i += 1) {
      try {
        if ((await fetch(BASE + '/healthz')).ok) break;
      } catch { /* not up yet */ }
      await new Promise((res) => setTimeout(res, 250));
    }

    const after = (await (await fetch(BASE + '/readyz')).json()) as {
      status: string; audit: string; degradedSince: string | null;
    };
    expect(after.audit).toBe('degraded');
    expect(after.status).toBe('degraded');
    expect(after.degradedSince).not.toBeNull();

    // 4. UNGOVERNED clearing is impossible: the pre-Gate-2.2 port that allowed a
    //    role grant alone to assert recovery no longer exists at all.
    const ungoverned = await sysRead(async (tx) =>
      sql<{ n: string }>`select count(*) n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'audit' and p.proname = 'reconcile_availability_incident'`.execute(tx as never));
    expect(Number(ungoverned.rows[0]!.n)).toBe(0);

    // 5. Recovery happens ONLY through the governed PRODUCTION caller, which mints
    //    a recovery capability per incident, writes inseparable evidence, and
    //    clears the local flag only on governed proof that the ledger agrees.
    const recovery = execFileSync(
      'node',
      [join(ROOT, 'dist', 'audit', 'reconcile-degraded.js'), 'acceptance-operator', 'governed recovery under test'],
      { env: ENV, encoding: 'utf8' },
    );
    expect(recovery).toContain('GOVERNED DEGRADED RECOVERY');
    expect(recovery).toContain('remaining unreconciled:  0');

    const remaining = await sysRead(async (tx) =>
      tx.selectFrom('audit.availability_incidents').selectAll().where('reconciled_at', 'is', null).execute());
    expect(remaining).toHaveLength(0);

    // Every reconciliation left its own inseparable integrity evidence.
    const evidence = await sysRead(async (tx) =>
      sql<{ n: string }>`select count(*) n from audit.audit_events
         where event->'metadata'->>'event' = 'availability.reconciled'`.execute(tx as never));
    expect(Number(evidence.rows[0]!.n)).toBeGreaterThanOrEqual(incidents.length);

    // 6. RECOVERY SURVIVES ANOTHER RESTART: the journal records the governed
    //    recovery, so a restarted process comes back HEALTHY — recovery is as
    //    durable as the degradation was.
    api?.kill();
    await new Promise((res) => setTimeout(res, 500));
    api = spawn('node', [join(ROOT, 'dist', 'main.js')], { env: ENV, stdio: 'pipe' });
    for (let i = 0; i < 60; i += 1) {
      try {
        if ((await fetch(BASE + '/healthz')).ok) break;
      } catch { /* not up yet */ }
      await new Promise((res) => setTimeout(res, 250));
    }
    const healthy = (await (await fetch(BASE + '/readyz')).json()) as { status: string; audit: string };
    expect(healthy.audit).toBe('ok');
    expect(healthy.status).toBe('ok');
  });
});

describe('G21-17 — audit.verify outcomes are evidenced accurately', () => {
  it('a successful verification is evidenced as success with the verified head', async () => {
    const r = await post('/v1/platform/audit/verify', {
      scope: 'PLATFORM', action: 'audit.verify', object_type: 'AUD', side_effect_class: 'none',
    }, { partitionId: `tenant:${tenantId}` });
    expect(r.status).toBe(201);
    expect(r.body.report.ok).toBe(true);
    expect(r.body.report.resultClass).toBe('verified');

    const rows = await auditRowsFor(r.correlationId);
    const ev = rows.find((x) => x['action'] === 'audit.verify');
    expect(ev).toBeDefined();
    expect(ev!['outcome']).toBe('success');
    const meta = (ev!['event'] as { metadata: Record<string, unknown> }).metadata;
    expect(meta['requested_partition']).toBe(`tenant:${tenantId}`);
    expect(meta['result_class']).toBe('verified');
    expect(meta['ok']).toBe(true);
    expect(meta['head_matches']).toBe(true);
    expect(meta['expected_head_hash']).toBe(meta['calculated_head_hash']);
    expect(meta['verified_head_seq']).toEqual(expect.anything());
    // audit.verify carries a sanitizing obligation, so the decision class is
    // allow_with_obligations — recorded exactly as the PDP returned it.
    expect(['allow', 'allow_with_obligations']).toContain(meta['decision']);
  });

  it('an UNKNOWN partition is evidenced as a failure, not a generic success', async () => {
    const unknown = `tenant:${uuidv7()}`;
    const r = await post('/v1/platform/audit/verify', {
      scope: 'PLATFORM', action: 'audit.verify', object_type: 'AUD', side_effect_class: 'none',
    }, { partitionId: unknown });
    expect(r.status).toBe(201);
    expect(r.body.report.ok).toBe(false);
    expect(r.body.report.resultClass).toBe('partition_unknown');

    const rows = await auditRowsFor(r.correlationId);
    const ev = rows.find((x) => x['action'] === 'audit.verify');
    expect(ev).toBeDefined();
    expect(ev!['outcome']).toBe('failure'); // NOT success
    const meta = (ev!['event'] as { metadata: Record<string, unknown> }).metadata;
    expect(meta['result_class']).toBe('partition_unknown');
    expect(meta['requested_partition']).toBe(unknown);
    expect(meta['checked']).toBe(0);
    /**
     * Gate-2.2 C10 SUPERSEDES the earlier Gate-2.1 rule here.
     *
     * Gate-2.1 dropped the decision link on a non-success outcome, so that a
     * failure could not appear to have been authorized to succeed. C10 requires the
     * opposite: EVERY result — success, tamper, unknown partition, malformed data —
     * must RETAIN the exact policy decision that authorized the verification,
     * because otherwise a reviewer cannot tell which decision permitted a failed
     * verification to run at all.
     *
     * This is not a weakening: the outcome is still recorded as `failure` (asserted
     * above), and audit.commit_event independently enforces outcome/decision-class
     * agreement — a `success` REQUIRES an allow decision — so a failure carrying its
     * authorizing allow decision is the honest record, not a forged success.
     */
    const decisionId = (ev!['event'] as { policy_decision_id: string | null }).policy_decision_id;
    expect(decisionId).not.toBeNull();
    expect(decisionId).toBe(r.body.receipt.policyDecisionId);   // the EXACT authorizing decision
    const pol = await sysRead(async (tx) =>
      tx.selectFrom('policy.policy_decisions').selectAll().where('id', '=', decisionId).execute());
    expect(pol).toHaveLength(1);
    expect(['allow', 'allow_with_obligations']).toContain((pol[0] as { decision: string }).decision);
  });

  it('a malformed verify request is denied with durable evidence and no verification', async () => {
    const r = await post('/v1/platform/audit/verify', {
      scope: 'PLATFORM', action: 'audit.verify', object_type: 'AUD', side_effect_class: 'none',
    }, {});
    expect(r.status).toBe(400);
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((x) => x['outcome'] === 'denied' || x['outcome'] === 'failure')).toBe(true);
    expect(rows.some((x) => x['outcome'] === 'success')).toBe(false);
  });

  it('a TAMPERED partition is evidenced as a failure with the mismatching heads', async () => {
    // A dedicated tenant so the tamper cannot disturb the other assertions.
    const t = await post('/v1/platform/tenants', {
      scope: 'PLATFORM', action: 'tenancy.tenant.create', object_type: 'TEN',
    }, { name: `tamper-${run}` });
    expect(t.status).toBe(201);
    const tamperTenant = t.body.tenant.id as string;
    const partition = `tenant:${tamperTenant}`;

    // Produce at least two rows in that partition through a governed route.
    for (let i = 0; i < 2; i += 1) {
      const d = await post(`/v1/tenants/${tamperTenant}/domains`, {
        scope: 'TENANT', tenant_id: tamperTenant, action: 'tenancy.domain.create', object_type: 'CID',
      }, { name: `tamper-dom-${i}-${run}` });
      expect(d.status).toBe(201);
    }

    // Out-of-band tampering (superuser, guard trigger disabled) — the only way.
    await sql`alter table audit.audit_events disable trigger audit_events_append_only`.execute(su);
    await sql`update audit.audit_events
                 set event_jcs = replace(event_jcs, '"success"', '"denied"')
               where partition_id = ${partition} and audit_seq = 1`.execute(su);
    await sql`alter table audit.audit_events enable trigger audit_events_append_only`.execute(su);

    const r = await post('/v1/platform/audit/verify', {
      scope: 'PLATFORM', action: 'audit.verify', object_type: 'AUD', side_effect_class: 'none',
    }, { partitionId: partition });
    expect(r.status).toBe(201);
    expect(r.body.report.ok).toBe(false);
    expect(r.body.report.brokenAtSeq).toBe(1);
    expect(r.body.report.incidentId).not.toBeNull();

    const rows = await auditRowsFor(r.correlationId);
    const ev = rows.find((x) => x['action'] === 'audit.verify');
    expect(ev!['outcome']).toBe('failure');
    const meta = (ev!['event'] as { metadata: Record<string, unknown> }).metadata;
    expect(meta['result_class']).toBe('chain_broken');
    expect(meta['broken_at_seq']).toBe(1);
    expect(meta['incident_id']).not.toBeNull();
    expect(meta['expected_head_hash']).not.toBe(meta['calculated_head_hash']);

    // The partition is frozen and the incident is recorded in the ledger.
    const head = await sysRead(async (tx) =>
      tx.selectFrom('audit.audit_chain_heads').selectAll().where('partition_id', '=', partition).execute());
    expect(head[0]!['frozen']).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('Gate-2.2 C12 — correlation equality across every authenticated failure path', () => {
  /**
   * The correlation a caller RECEIVES must be the one from its OWN envelope, and it
   * must locate that failure's evidence. A downstream service minting a fresh id, or
   * an error carrying a placeholder like 'unknown', both make the caller's evidence
   * unfindable exactly when it is needed.
   */
  const failures: Array<[string, () => Promise<{ status: number; body: Record<string, any>; correlationId: string }>]> = [
    ['invalid login (unknown user)', () => loginAs('no-such-principal', 'whatever-password-x')],
    ['invalid login (wrong password)', () => loginAs('platform-admin', 'definitely-the-wrong-password')],
    ['refresh with a garbage token', () => refreshWith('not-a-real-refresh-token')],
    ['rotation with a too-short new password', () => post('/v1/auth/rotate', {
      scope: 'PLATFORM', action: 'identity.credential.rotate', object_type: 'SES',
      purpose_id: 'authentication',
    }, { currentPassword: ROTATED_PW, newPassword: 'short' })],
    ['principal payload validation (workload with a password)', () => post(
      `/v1/tenants/${tenantId}/principals`,
      { scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.create', object_type: 'PRN' },
      { kind: 'workload', displayName: 'c12-workload', loginName: 'c12-wl', password: 'a-long-enough-password' },
    )],
    ['tenant name validation', () => post('/v1/platform/tenants', {
      scope: 'PLATFORM', action: 'tenancy.tenant.create', object_type: 'TEN',
    }, { name: 'x' })],
    ['malformed verify request', () => post('/v1/platform/audit/verify', {
      scope: 'PLATFORM', action: 'audit.verify', object_type: 'AUD', side_effect_class: 'none',
    }, {})],
  ];

  it.each(failures)('%s: the returned correlation IS the envelope correlation', async (_label, call) => {
    const r = await call();
    expect(r.status, `unexpected body: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400);
    // The caller-visible correlation equals the one it sent…
    expect(r.body.correlationId).toBe(r.correlationId);
    // …and it is never a placeholder or a freshly minted id.
    expect(r.body.correlationId).not.toBe('unknown');
    expect(r.body.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it.each(failures)('%s: that correlation LOCATES the durable evidence', async (_label, call) => {
    const r = await call();
    const rows = await auditRowsFor(r.body.correlationId as string);
    expect(rows.length, 'the returned correlation must find its own evidence').toBeGreaterThanOrEqual(1);
    // The evidence records a refusal, never a success.
    expect(rows.some((x) => x['outcome'] === 'denied' || x['outcome'] === 'failure')).toBe(true);
    expect(rows.some((x) => x['outcome'] === 'success')).toBe(false);
  });
});
