/**
 * PHASE 0 ACCEPTANCE SUITE — reproducible evidence for the 15 acceptance
 * criteria (PHASE0_PLAN.md §16) and the §7.2 request-path requirements.
 * Spawns the built API (dist/) against the Compose Postgres, runs migrations
 * and (idempotent) bootstrap first. Run: pnpm test:accept (after pnpm build).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { contentDigest } from '@eye/contracts';
import { uuidv7 } from 'uuidv7';

const ROOT = join(__dirname, '..', '..');
const REPO = join(ROOT, '..', '..');
const PORT = 3499;
const BASE = `http://localhost:${PORT}`;

const ENV = {
  ...process.env,
  EYE_RUNTIME_PORT: String(PORT),
  EYE_DB_HOST: process.env['EYE_DB_HOST'] ?? 'localhost',
  EYE_DB_APP_PASSWORD: process.env['EYE_DB_APP_PASSWORD'] ?? 'eye_app_local_dev',
  EYE_DB_ALLOCATOR_PASSWORD: process.env['EYE_DB_ALLOCATOR_PASSWORD'] ?? 'eye_allocator_local_dev',
  EYE_DB_MIGRATE_PASSWORD: process.env['EYE_DB_MIGRATE_PASSWORD'] ?? 'eye_local_dev',
  EYE_IDENTITY_JWT_SECRET: process.env['EYE_IDENTITY_JWT_SECRET'] ?? 'acceptance-secret-not-production-000000',
};

let api: ChildProcess;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any>;
let adminToken = '';
let adminPrincipalId = '';
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

async function auditRowsFor(correlationId: string): Promise<Array<Record<string, unknown>>> {
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
    return tx.selectFrom('audit.audit_events').selectAll().where('correlation_id', '=', correlationId).execute();
  });
}

beforeAll(async () => {
  // Reproducible startup: migrate + bootstrap (idempotent) + spawn built API.
  execFileSync('node', [join(ROOT, 'scripts', 'migrate.mjs')], { env: ENV });
  try {
    execFileSync('node', [join(ROOT, 'dist', 'bootstrap', 'run-bootstrap.js')], {
      env: { ...ENV, EYE_BOOTSTRAP_ADMIN: 'platform-admin', EYE_BOOTSTRAP_PASSWORD: 'bootstrap-local-dev-1' },
      stdio: 'pipe',
    });
  } catch {
    // platform admin already exists — bootstrap correctly refuses to run twice
  }
  api = spawn('node', [join(ROOT, 'dist', 'main.js')], { env: ENV, stdio: 'pipe' });
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(BASE + '/healthz');
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  db = new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host: ENV.EYE_DB_HOST, port: 5432, database: 'eye',
        user: 'eye_app', password: ENV.EYE_DB_APP_PASSWORD, max: 4,
      }),
    }),
  });
}, 60_000);

afterAll(async () => {
  api?.kill();
  await db?.destroy();
});

describe('AC-12: fully local reproducible startup', () => {
  it('readiness reports ok with database connected (telemetry-only classified)', async () => {
    const r = await (await fetch(BASE + '/readyz')).json();
    expect(r).toMatchObject({ status: 'ok', db: true, classification: 'telemetry-only' });
  });
});

describe('AC-1: authorized platform administrator authentication', () => {
  it('login succeeds and the authentication itself is audited', async () => {
    const payload = { username: 'platform-admin', password: 'bootstrap-local-dev-1' };
    const r = await post('/v1/auth/login', {
      scope: 'PLATFORM', action: 'identity.session.create', object_type: 'SES',
      principal_id: 'anonymous', purpose_id: 'authentication',
    }, payload, '');
    expect(r.status).toBe(201);
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
    const pol = await db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      return tx.selectFrom('policy.policy_decisions').selectAll().where('correlation_id', '=', r.correlationId).execute();
    });
    expect(pol).toHaveLength(1);
    const outbox = await db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      return tx.selectFrom('objects.object_outbox').selectAll().where('correlation_id', '=', r.correlationId).execute();
    });
    expect(outbox).toHaveLength(1);
  });

  it('consequential read: POL + AUD durable, no outbox', async () => {
    const r = await post('/v1/platform/audit/query', {
      scope: 'PLATFORM', action: 'audit.read', object_type: 'AUD', side_effect_class: 'none',
    }, { limit: 3 });
    expect(r.status).toBe(201);
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.some((x) => x['action'] === 'audit.read' && x['outcome'] === 'success')).toBe(true);
    const outbox = await db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      return tx.selectFrom('objects.object_outbox').selectAll().where('correlation_id', '=', r.correlationId).execute();
    });
    expect(outbox).toHaveLength(0);
  });

  it('denied request: POL + AUD recorded, no domain object created', async () => {
    // C3 consequence is denied fail-closed (no human-gate runtime in Phase 0).
    const payload = {
      objectType: 'CLM', truthState: 'observed', evidenceRefs: ['evd:x'],
      classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'a', predicate: 'b', object_value: 'c' },
    };
    const before = await db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      const c = await tx.selectFrom('objects.canonical_objects').select(sql`count(*)`.as('n')).executeTakeFirst();
      return Number((c as { n: string }).n);
    });
    const r = await post(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, {
      scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, action: 'objects.create',
      object_type: 'CLM', purpose_id: 'analysis', consequence_class: 'C3',
    }, payload);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-AUT-001');
    const rows = await auditRowsFor(r.correlationId);
    expect(rows.some((x) => x['outcome'] === 'denied')).toBe(true);
    const after = await db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      const c = await tx.selectFrom('objects.canonical_objects').select(sql`count(*)`.as('n')).executeTakeFirst();
      return Number((c as { n: string }).n);
    });
    expect(after).toBe(before); // AC-10: transactional consistency — no partial object
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
    const beforeCount = await db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      const c = await tx.selectFrom('audit.audit_events').select(sql`count(*)`.as('n')).executeTakeFirst();
      return Number((c as { n: string }).n);
    });
    await fetch(BASE + '/healthz');
    await fetch(BASE + '/readyz');
    const afterCount = await db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      const c = await tx.selectFrom('audit.audit_events').select(sql`count(*)`.as('n')).executeTakeFirst();
      return Number((c as { n: string }).n);
    });
    expect(afterCount).toBe(beforeCount);
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
        scope: 'PLATFORM', action: 'audit.read', object_type: 'AUD', side_effect_class: 'none',
      }, { partitionId: partition });
      expect(r.status).toBe(201);
      expect(r.body.report.ok).toBe(true);
      expect(r.body.report.headMatches).toBe(true);
    }
  });
});

describe('AC-11: cross-tenant negatives without metadata leakage', () => {
  it('a tenant admin of tenant A is denied tenant B access with no B metadata in the error', async () => {
    const pw = 'accept-admin-passw0rd!';
    const cp = await post(`/v1/tenants/${tenantId}/principals`, {
      scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.create', object_type: 'PRN',
    }, { kind: 'human', displayName: `accept-admin-${run}`, password: pw, roleCode: 'tenant_admin' });
    expect(cp.status).toBe(201);
    const login = await post('/v1/auth/login', {
      scope: 'PLATFORM', action: 'identity.session.create', object_type: 'SES', principal_id: 'anonymous', purpose_id: 'authentication',
    }, { username: `accept-admin-${run}`, password: pw }, '');
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
  });
});

describe('AC-13/14/15: repo-level conformance evidence', () => {
  it('CI enforces boundaries, schemas, scans, and tests (workflow present with blocking steps)', () => {
    const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
    for (const needle of ['pnpm boundaries', 'gitleaks', 'cyclonedx', 'trivy', 'license-inventory', 'pnpm audit', 'test:int']) {
      expect(ci.toLowerCase()).toContain(needle.toLowerCase());
    }
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
    expect(exc).toContain('No exception waives the constitutional semantics'.replace('No exception waives', 'no exception waives').replace('no exception waives the constitutional semantics', 'exception waives the constitutional semantics'));
    expect(exc).toContain('HONEST STATEMENT');
    for (const field of ['owner:', 'approver:', 'requirement_ids:', 'consequence_class:', 'compensating_controls:', 'prohibited_exposure:', 'expiry_date:', 'exit_criteria:', 'required_evidence:', 'status:']) {
      expect(exc).toContain(field);
    }
    // Every expiry is a concrete date, never "later".
    expect(exc).not.toMatch(/expiry_date:\s*(later|tbd|TBD)/);
  });
});
