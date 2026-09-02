/**
 * Seed the Phase 1 demonstration — the 72-Hour Corridor Decision.
 *
 * This drives the REAL API over HTTP with real governed envelopes. There is no
 * back door: every step below is a request an operator could make, which is the
 * point — a seed script that wrote rows directly would prove nothing about the
 * product.
 *
 * The two personas are the ones the storyboard names, and they exist because
 * separation of duties is something the demonstration has to SHOW:
 *   A. Hoffmann  — observation operator (domain_analyst): registers, uploads
 *   M. Dvořák    — collection manager: approves, releases quarantine, corrects
 *
 * Idempotent: re-running it reuses the tenant, domain and principals it finds.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { SOURCE_CONTRACTS } from './source-contracts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const API = process.env.EYE_API ?? 'http://localhost:3401';
const FIXTURES = join(ROOT, 'fixtures', 'phase1', 'replay');

/* ── canonical JSON + digest, matching packages/contracts ─────────────────── */
function jcs(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(',')}}`;
  }
  return 'null';
}
const digest = (v) => createHash('sha256').update(jcs(v ?? {}), 'utf8').digest('hex');

/* ── governed request helper ──────────────────────────────────────────────── */
let failures = 0;

async function call(path, over, payload = {}, token = null) {
  const envelope = {
    message_id: randomUUID(),
    scope: over.scope,
    tenant_id: over.tenantId ?? null,
    domain_id: over.domainId ?? null,
    principal_id: over.principalId ?? 'anonymous',
    purpose_id: over.purposeId ?? 'observation',
    action: over.action,
    side_effect_class: over.sideEffect ?? 'reversible',
    consequence_class: over.consequence ?? 'C1',
    object_type: over.objectType,
    object_id: over.objectId ?? null,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: randomUUID(),
    trace_id: 'phase1-seed',
    payload_digest: digest(payload),
  };
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify({ envelope, payload }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, body, correlationId: envelope.correlation_id };
  }
  return { ok: true, status: res.status, body };
}

function must(label, r) {
  if (!r.ok) {
    failures += 1;
    console.error(`  ✗ ${label}: ${r.status} ${r.body?.code ?? ''} ${r.body?.message ?? ''}`);
    return null;
  }
  console.log(`  ✓ ${label}`);
  return r.body;
}

function note(label, r) {
  if (!r.ok) {
    console.log(`  · ${label}: refused (${r.status} ${r.body?.code ?? ''}) — ${r.body?.message ?? ''}`);
    return null;
  }
  console.log(`  ✓ ${label}`);
  return r.body;
}

/* ── authentication ───────────────────────────────────────────────────────── */
async function login(username, password) {
  const r = await call('/v1/auth/login', {
    scope: 'PLATFORM', action: 'identity.session.create', objectType: 'SES',
    principalId: 'anonymous', purposeId: 'authentication',
  }, { username, password });
  if (!r.ok) return null;
  return { token: r.body.tokens.accessToken, principalId: r.body.principalId, rotationRequired: r.body.rotationRequired };
}

async function adminSession() {
  // The bootstrap credential FORCES rotation on first use. On a fresh database
  // that rotation has not happened yet; on a re-run it has.
  const rotated = await login(env.EYE_BOOTSTRAP_ADMIN ?? 'platform-admin', env.EYE_TEST_ADMIN_PASSWORD);
  if (rotated !== null && !rotated.rotationRequired) return rotated;

  const boot = await login(env.EYE_BOOTSTRAP_ADMIN ?? 'platform-admin', env.EYE_TEST_BOOTSTRAP_PASSWORD);
  if (boot === null) throw new Error('cannot authenticate: neither the rotated nor the bootstrap credential was accepted');
  if (boot.rotationRequired) {
    const r = await call('/v1/auth/rotate', {
      scope: 'PLATFORM', action: 'identity.credential.rotate', objectType: 'CRD',
      principalId: `principal:${boot.principalId}`, purposeId: 'authentication',
    }, { currentPassword: env.EYE_TEST_BOOTSTRAP_PASSWORD, newPassword: env.EYE_TEST_ADMIN_PASSWORD }, boot.token);
    if (!r.ok) throw new Error(`forced credential rotation failed: ${JSON.stringify(r.body)}`);
    const after = await login(env.EYE_BOOTSTRAP_ADMIN ?? 'platform-admin', env.EYE_TEST_ADMIN_PASSWORD);
    if (after === null) throw new Error('rotation succeeded but the new credential was not accepted');
    return after;
  }
  return boot;
}

/* ── main ─────────────────────────────────────────────────────────────────── */
const TENANT_NAME = 'NORDWERK ANTRIEBSTECHNIK GmbH (SYNTHETIC)';
const DOMAIN_NAME = 'Supply Corridor Intelligence';
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

console.log('\n=== Phase 1 demonstration seed — The 72-Hour Corridor Decision ===\n');

const admin = await adminSession();
console.log(`platform admin authenticated (${admin.principalId})\n`);

/* 1. tenant + domain */
console.log('1. tenancy');
const tenantsList = await call('/v1/platform/tenants/list', {
  scope: 'PLATFORM', action: 'tenancy.tenant.list', objectType: 'TEN',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
}, {}, admin.token);
let tenant = tenantsList.ok ? (tenantsList.body.tenants ?? []).find((t) => t.name === TENANT_NAME) : undefined;
if (tenant === undefined) {
  const r = must('create tenant', await call('/v1/platform/tenants', {
    scope: 'PLATFORM', action: 'tenancy.tenant.create', objectType: 'TEN',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, { name: TENANT_NAME, residencyProfile: 'EU' }, admin.token));
  tenant = r?.tenant;
} else {
  console.log('  ✓ tenant already present');
}
const tenantId = tenant.id;

const domainsList = await call(`/v1/tenants/${tenantId}/domains/list`, {
  scope: 'TENANT', tenantId, action: 'tenancy.domain.list', objectType: 'CID',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
}, {}, admin.token);
let domain = domainsList.ok ? (domainsList.body.domains ?? []).find((d) => d.name === DOMAIN_NAME) : undefined;
if (domain === undefined) {
  const r = must('create domain', await call(`/v1/tenants/${tenantId}/domains`, {
    scope: 'TENANT', tenantId, action: 'tenancy.domain.create', objectType: 'CID',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, { name: DOMAIN_NAME }, admin.token));
  domain = r?.domain;
} else {
  console.log('  ✓ domain already present');
}
const domainId = domain.id;
console.log(`  tenant ${tenantId}\n  domain ${domainId}\n`);

/* 2. the two operators */
console.log('2. operators (separation of duties is a rule, not a disabled button)');
const principalsList = await call(`/v1/tenants/${tenantId}/principals/list`, {
  scope: 'TENANT', tenantId, action: 'identity.principal.list', objectType: 'PRN',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
}, {}, admin.token);
if (!principalsList.ok) {
  console.log(`  · principal listing unavailable (${principalsList.status} ${principalsList.body?.code ?? ''}) — falling back to create-then-login`);
}
const existing = principalsList.ok ? (principalsList.body.principals ?? []) : [];

async function ensureOperator(loginName, displayName, roleCode) {
  const found = existing.find((p) => p.login_name === loginName);
  if (found !== undefined) {
    console.log(`  ✓ ${displayName} already present (${roleCode})`);
    return found.id;
  }
  const r = note(`create ${displayName} (${roleCode})`, await call(`/v1/tenants/${tenantId}/principals`, {
    scope: 'TENANT', tenantId, action: 'identity.principal.create', objectType: 'PRN',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, {
    kind: 'human', displayName, loginName, password: OPERATOR_PASSWORD, roleCode, domainId,
  }, admin.token));
  return r?.principal?.principalId;
}

await ensureOperator('a.hoffmann', 'A. Hoffmann — observation operator', 'domain_analyst');
await ensureOperator('m.dvorak', 'M. Dvorak — collection manager', 'collection_manager');

const hoffmann = await login('a.hoffmann', OPERATOR_PASSWORD);
const dvorak = await login('m.dvorak', OPERATOR_PASSWORD);
if (hoffmann === null || dvorak === null) {
  console.error('  ✗ operator authentication failed');
  process.exit(1);
}
console.log(`  registrar  a.hoffmann  ${hoffmann.principalId}`);
console.log(`  approver   m.dvorak    ${dvorak.principalId}\n`);

const obs = (path) => `/v1/tenants/${tenantId}/domains/${domainId}/observation${path}`;
const asOperator = (session, action, objectType, objectId = null) => ({
  scope: 'DOMAIN', tenantId, domainId, action, objectType, objectId,
  principalId: `principal:${session.principalId}`, purposeId: 'observation',
});

/* 3. register the ten sources as the REGISTRAR */
console.log('3. source registration (as a.hoffmann)');
const existingSources = await call(obs('/sources/list'), asOperator(hoffmann, 'observation.read.sources', 'SRC'), {}, hoffmann.token);
const known = new Map(
  (existingSources.ok ? existingSources.body.sources ?? [] : []).map((s) => [s.source_key, s]),
);

const registered = [];
for (const contract of SOURCE_CONTRACTS) {
  const already = known.get(contract.source_key);
  if (already !== undefined) {
    console.log(`  ✓ ${contract.source_key} already registered (${already.lifecycle_state})`);
    registered.push({ contract, sourceId: already.source_id, state: already.lifecycle_state });
    continue;
  }
  const r = must(`register ${contract.source_key}`, await call(
    obs('/sources/register'),
    asOperator(hoffmann, 'observation.source.register', 'SRC'),
    { contract }, hoffmann.token));
  if (r !== null) registered.push({ contract, sourceId: r.source.sourceId, state: 'draft' });
}

/* 4. the registrar tries to approve their own registration — it must be refused */
console.log('\n4. separation of duties');
const own = registered.find((s) => s.state === 'draft');
if (own !== undefined) {
  const r = await call(
    obs(`/sources/${own.sourceId}/approve`),
    asOperator(hoffmann, 'observation.source.approve', 'SRC', own.sourceId),
    { contractVersion: 1, decision: 'approve', reason: 'self-approval attempt' }, hoffmann.token);
  if (r.ok) {
    failures += 1;
    console.error('  ✗ THE REGISTRAR WAS ABLE TO APPROVE THEIR OWN REGISTRATION — this must never succeed');
  } else {
    console.log(`  ✓ registrar refused approval of their own registration (${r.status} ${r.body?.code ?? ''})`);
  }
}

/* 5. approve as the COLLECTION MANAGER */
console.log('\n5. approval (as m.dvorak)');
for (const s of registered) {
  if (s.state !== 'draft') continue;
  const r = note(`approve ${s.contract.source_key}`, await call(
    obs(`/sources/${s.sourceId}/approve`),
    asOperator(dvorak, 'observation.source.approve', 'SRC', s.sourceId),
    { contractVersion: 1, decision: 'approve', reason: 'contract reviewed against the publisher terms on record' },
    dvorak.token));
  if (r !== null) s.state = 'approved';
}

/* 6. activate — and watch the unconfirmed-rights sources refuse */
console.log('\n6. activation (a contract with unconfirmed rights cannot be activated)');
for (const s of registered) {
  if (s.state !== 'approved') continue;
  // Unconfirmed rights block LIVE acquisition. These contracts acquire from the
  // frozen replay set, so they activate — and stay visibly unconfirmed, which is
  // what the overview's attention list is for.
  const rightsPending =
    s.contract.authority_and_rights.rights_state !== 'confirmed' &&
    s.contract.acquisition_mode === 'live';
  const r = await call(
    obs(`/sources/${s.sourceId}/transition`),
    asOperator(dvorak, 'observation.source.transition', 'SRC', s.sourceId),
    { contractVersion: 1, target: 'active', reason: 'approved for collection' }, dvorak.token);
  if (r.ok) {
    s.state = 'active';
    console.log(`  ✓ ${s.contract.source_key} → active`);
  } else if (rightsPending) {
    console.log(`  · ${s.contract.source_key} stays approved: rights are UNVERIFIED and activation is refused`);
  } else {
    failures += 1;
    console.error(`  ✗ ${s.contract.source_key} activation failed unexpectedly: ${r.body?.message ?? r.status}`);
  }
}

/* 7. provision one agent per active source */
console.log('\n7. collection agents (instance- and version-specific, owned, revocable)');
for (const s of registered) {
  if (s.state !== 'active') continue;
  // Provisioning an agent CREATES A PRINCIPAL, which is a tenant-level identity
  // operation. A domain collection_manager cannot mint identities and is refused
  // — correctly — so this step runs as the platform administrator while the
  // accountable OWNER of the agent stays the operator who will answer for it.
  const r = note(`agent for ${s.contract.source_key}`, await call(
    obs('/agents/register'),
    {
      scope: 'DOMAIN', tenantId, domainId,
      action: 'observation.agent.register', objectType: 'AGT', objectId: null,
      principalId: `principal:${admin.principalId}`, purposeId: 'observation',
    },
    { sourceId: s.sourceId, connector: s.contract.connector_kind, ownerPrincipalId: hoffmann.principalId },
    admin.token));
  if (r !== null) s.agentId = r.agent?.agentId;
}

/* 8. collect */
console.log('\n8. collection');
async function fixtureFiles(setName) {
  const dir = join(FIXTURES, setName);
  const manifest = JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8'));
  const out = [];
  for (const e of manifest.entries) {
    const bytes = await readFile(join(dir, e.file));
    out.push({
      filename: e.file,
      mediaType: e.retained_headers['content-type'] ?? null,
      base64: bytes.toString('base64'),
      documentTime: null,
    });
  }
  return out;
}

for (const s of registered) {
  if (s.state !== 'active') continue;
  if (s.contract.connector_kind === 'upload') {
    const setName = s.contract.source_key === 'nordwerk-internal' ? 'nordwerk-uploads'
      : s.contract.source_key === 'carrier-advisories' ? 'carrier-advisories'
      : 'un-comtrade-upload';
    const files = await fixtureFiles(setName);
    const r = note(`upload ${s.contract.source_key} (${files.length} files)`, await call(
      obs('/upload'),
      asOperator(hoffmann, 'observation.run.trigger', 'RUN', null),
      { sourceId: s.sourceId, contractVersion: 1, files }, hoffmann.token));
    if (r?.run !== undefined) {
      console.log(`      admitted ${r.run.admitted} · quarantined ${r.run.quarantined} · no-op ${r.run.noop}${r.run.reason ? ` · ${r.run.reason}` : ''}`);
    }
  } else {
    const r = note(`collect ${s.contract.source_key}`, await call(
      obs(`/sources/${s.sourceId}/collect`),
      asOperator(hoffmann, 'observation.run.trigger', 'RUN', null),
      { contractVersion: 1 }, hoffmann.token));
    if (r?.run !== undefined) {
      console.log(`      admitted ${r.run.admitted} · quarantined ${r.run.quarantined} · no-op ${r.run.noop}${r.run.reason ? ` · ${r.run.reason}` : ''}`);
    }
  }
}

/* 9. evaluate coverage and health */
console.log('\n9. coverage and health');
for (const s of registered) {
  if (s.state !== 'active') continue;
  const r = note(`evaluate ${s.contract.source_key}`, await call(
    obs(`/sources/${s.sourceId}/evaluate`),
    asOperator(dvorak, 'observation.coverage.measure', 'SRC', s.sourceId),
    {
      // The band the frozen fixtures ACTUALLY cover (their manifests' covered_band).
      // Measuring against a wider window would manufacture a gap out of data that
      // was never claimed to exist.
      windowStart: '2023-12-28T00:00:00Z',
      windowEnd: '2024-01-18T00:00:00Z',
      evaluatedAt: '2024-01-18T00:00:00Z',
    }, dvorak.token));
  if (r?.coverage !== undefined) {
    const h = r.coverage.health;
    console.log(`      health ${h.state} (${h.lagClass}) — ${h.reason}`);
  }
}

/* 10. summary */
console.log('\n10. overview');
const overview = await call(obs('/overview'), asOperator(dvorak, 'observation.read.overview', 'SRC'), {}, dvorak.token);
if (overview.ok) {
  const c = overview.body.counts;
  console.log(`  sources ${c.sources} · active ${c.active} · draft ${c.draft} · unconfirmed rights ${c.unconfirmedRights}`);
  console.log(`  evidence objects ${c.evidenceObjects} · open quarantine ${c.openQuarantineCases} · open corrections ${c.openCorrections}`);
  const rr = overview.body.replayRatio;
  console.log(`  replay share: ${rr.byObject ?? '—'}% by object · ${rr.byBytes ?? '—'}% by bytes`);
}

console.log('\n=== seed complete ===');
console.log(`tenant ${tenantId}`);
console.log(`domain ${domainId}`);
console.log(`operators: a.hoffmann (registrar) · m.dvorak (collection manager)`);
if (failures > 0) {
  console.error(`\n${failures} step(s) failed.`);
  process.exit(1);
}
