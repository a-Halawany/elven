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

/* 10. evidence custody and a safe download */
console.log('\n10. evidence custody');
const evidenceList = await call(obs('/evidence/list'),
  asOperator(dvorak, 'observation.read.evidence', 'EVD'), { limit: 500 }, dvorak.token);
let corridorEvd = null;
if (evidenceList.ok) {
  // The 14 January chokepoint row: the trough of the corridor collapse, and the
  // object the storyboard opens.
  for (const e of evidenceList.body.evidence ?? []) {
    const detail = await call(obs(`/evidence/${e.object_id}/get`),
      asOperator(dvorak, 'observation.read.evidence', 'EVD', e.object_id), {}, dvorak.token);
    if (!detail.ok) continue;
    const obsPayload = detail.body.observation?.payload;
    if (obsPayload?.item_key?.includes('features:2024-01-14') && obsPayload?.source_key === 'imf-portwatch-chokepoints') {
      // Three chokepoints publish 14 January. The storyboard opens BAB EL-MANDEB
      // — chokepoint4 — so the bytes are read to find it, exactly as an operator
      // would open the row and look at it.
      const dl = await call(obs(`/evidence/${e.object_id}/download`),
        asOperator(dvorak, 'observation.evidence.retrieve', 'EVD', e.object_id), {}, dvorak.token);
      if (!dl.ok) continue;
      const body = Buffer.from(dl.body.download.base64, 'base64').toString('utf8');
      if (!body.includes('chokepoint4')) continue;
      corridorEvd = { id: e.object_id, detail: detail.body };
      break;
    }
  }
}
if (corridorEvd !== null) {
  const d = corridorEvd.detail;
  console.log(`  ✓ EVD ${corridorEvd.id.slice(0, 8)}… — the 2024-01-14 chokepoint row`);
  console.log(`      custody entries: ${d.custody.length}`);
  console.log(`      four times: event ${fmt(d.fourTimes.event)} · observation ${fmt(d.fourTimes.observation)} · record ${fmt(d.fourTimes.record)}`);
  const a = d.evidence.payload.authenticity;
  console.log(`      authenticity: transport ${a.transport_endpoint} · bytes ${a.byte_integrity} · origin ${a.source_origin} · CONTENT ${a.content_authenticity}`);
  const dl = await call(obs(`/evidence/${corridorEvd.id}/download`),
    asOperator(dvorak, 'observation.evidence.retrieve', 'EVD', corridorEvd.id), {}, dvorak.token);
  if (dl.ok) {
    const bytes = Buffer.from(dl.body.download.base64, 'base64');
    console.log(`      download: ${dl.body.download.byteLength} B · ${dl.body.download.contentDisposition} · integrity ${dl.body.download.integrity}`);
    console.log(`      bytes: ${bytes.toString('utf8').replace(/\s+/g, ' ').slice(0, 90)}…`);
  } else {
    failures += 1;
    console.error(`  ✗ download refused: ${dl.status} ${dl.body?.message ?? ''}`);
  }
} else {
  console.log('  · the 2024-01-14 corridor row was not located in the evidence list');
}

/* 11. quarantine review — release requires a reason and a second operator */
console.log('\n11. quarantine review');
const qList = await call(obs('/quarantine/list'),
  asOperator(dvorak, 'observation.read.quarantine', 'QAR'), { state: 'open' }, dvorak.token);
const cases = qList.ok ? qList.body.cases ?? [] : [];
for (const c of cases) {
  console.log(`  · ${c.item_key.slice(0, 60)} — ${c.reason_class}: ${String(c.reason).slice(0, 90)}`);
}
const traversal = cases.find((c) => c.reason_class === 'path_traversal');
if (traversal !== undefined) {
  // A release without a reason must be refused, and an agent must not be able to
  // release its own quarantine.
  const noReason = await call(obs(`/quarantine/${traversal.case_id}/review`),
    asOperator(dvorak, 'observation.quarantine.review', 'QAR', traversal.case_id),
    { decision: 'discard', reason: 'no' }, dvorak.token);
  console.log(noReason.ok
    ? '  ✗ a review without an adequate reason was accepted'
    : `  ✓ review without an adequate reason refused (${noReason.status})`);
  if (noReason.ok) failures += 1;

  const byRegistrar = await call(obs(`/quarantine/${traversal.case_id}/review`),
    asOperator(hoffmann, 'observation.quarantine.review', 'QAR', traversal.case_id),
    { decision: 'discard', reason: 'attempting review without the collection_manager role' }, hoffmann.token);
  console.log(byRegistrar.ok
    ? '  ✗ an operator without collection_manager was able to review a quarantine case'
    : `  ✓ review refused to an operator without collection_manager (${byRegistrar.status})`);
  if (byRegistrar.ok) failures += 1;

  const discarded = note('discard the path-traversal archive', await call(
    obs(`/quarantine/${traversal.case_id}/review`),
    asOperator(dvorak, 'observation.quarantine.review', 'QAR', traversal.case_id),
    {
      decision: 'discard',
      reason: 'archive entry escapes the extraction root; the bytes are retained under their quarantine manifest for review',
    }, dvorak.token));
  void discarded;
}
const drift = cases.find((c) => c.reason_class === 'schema_drift');
if (drift !== undefined) {
  note('release the schema-drift row after review', await call(
    obs(`/quarantine/${drift.case_id}/review`),
    asOperator(dvorak, 'observation.quarantine.review', 'QAR', drift.case_id),
    {
      decision: 'release',
      reason: 'the publisher confirmed the row is genuine and that n_total was omitted upstream; admitting it with the gap recorded',
    }, dvorak.token));
}

/* 12. the world corrects itself */
console.log('\n12. correction and withdrawal');
const payloadSource = registered.find((s) => s.contract.source_key === 'eu-sanctions-payload');
if (payloadSource !== undefined) {
  const evidence = await call(obs('/evidence/list'),
    asOperator(dvorak, 'observation.read.evidence', 'EVD'),
    { sourceId: payloadSource.sourceId, limit: 50 }, dvorak.token);
  const affected = (evidence.ok ? evidence.body.evidence ?? [] : []).map((e) => e.object_id);

  const opened = must('publisher republication received', await call(obs('/corrections/submit'),
    asOperator(hoffmann, 'observation.correction.receive', 'COR'),
    {
      sourceId: payloadSource.sourceId, kind: 'correction', channel: 'rss-republication',
      publisherRef: 'fsf-csv-1.1 @ Sun, 14 Jan 2024 08:05:53 GMT',
      reason: 'the publisher republished the consolidated list; three rows differ from the version we hold',
      affectedEvdIds: affected,
    }, hoffmann.token));

  if (opened !== null) {
    // A SPOOFED correction: an object id that is not evidence of this source.
    const spoof = await call(obs(`/corrections/${opened.correction.caseId}/apply`),
      asOperator(dvorak, 'observation.correction.apply', 'COR', opened.correction.caseId),
      { decision: 'apply', affectedEvdIds: [randomUUID()], reason: 'spoofed claim' }, dvorak.token);
    const rejected = spoof.ok && spoof.body.correction?.state === 'rejected';
    console.log(rejected
      ? '  ✓ a correction naming evidence of no known source was rejected'
      : '  ✗ a spoofed correction claim was not rejected');
    if (!rejected) failures += 1;

    // The instant BEFORE the correction lands. A known-at query at this moment
    // must still reproduce exactly what an operator saw then.
    const beforeCorrection = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 50));

    const reopened = must('correction case reopened for the genuine claim', await call(obs('/corrections/submit'),
      asOperator(hoffmann, 'observation.correction.receive', 'COR'),
      {
        sourceId: payloadSource.sourceId, kind: 'correction', channel: 'rss-republication',
        publisherRef: 'fsf-csv-1.1 @ Sun, 14 Jan 2024 08:05:53 GMT',
        reason: 'the publisher republished the consolidated list; three rows differ from the version we hold',
        affectedEvdIds: affected,
      }, hoffmann.token));

    if (reopened !== null) {
      const applied = must('correction applied', await call(
        obs(`/corrections/${reopened.correction.caseId}/apply`),
        asOperator(dvorak, 'observation.correction.apply', 'COR', reopened.correction.caseId),
        { decision: 'apply', affectedEvdIds: affected, reason: 'publisher republication verified against the feed' },
        dvorak.token));
      if (applied !== null) {
        const c = applied.correction;
        console.log(`      superseded: ${(c.superseded ?? []).map((x) => `${x.object_id.slice(0, 8)}… v${x.from}→v${x.to}`).join(', ')}`);
        console.log(`      propagation resolved:  ${(c.propagationScope?.resolved ?? []).length} object(s)`);
        console.log(`      propagation unresolved: ${c.propagationScope?.unresolved}`);

        // KNOWN-AT: the pre-correction state is still reproducible.
        const target = (c.superseded ?? [])[0];
        if (target !== undefined) {
          const before = await call(obs(`/evidence/${target.object_id}/get`),
            asOperator(dvorak, 'observation.read.evidence', 'EVD', target.object_id),
            { knownAt: beforeCorrection }, dvorak.token);
          const now = await call(obs(`/evidence/${target.object_id}/get`),
            asOperator(dvorak, 'observation.read.evidence', 'EVD', target.object_id), {}, dvorak.token);
          const beforeV = before.ok ? Number(before.body.evidence.object_version) : null;
          const nowV = now.ok ? Number(now.body.evidence.object_version) : null;
          console.log(`      known-at reproduces v${beforeV}; current is v${nowV} — nothing was overwritten`);
          if (beforeV === null || nowV === null || beforeV >= nowV) {
            failures += 1;
            console.error('  ✗ the pre-correction state was not reproducible');
          }
        }
      }
    }
  }
}

// The withdrawal beat: DEF-09, the advisory the publisher later withdraws.
const advisorySource = registered.find((s) => s.contract.source_key === 'carrier-advisories');
if (advisorySource !== undefined) {
  const evidence = await call(obs('/evidence/list'),
    asOperator(dvorak, 'observation.read.evidence', 'EVD'),
    { sourceId: advisorySource.sourceId, limit: 50 }, dvorak.token);
  const withdrawn = (evidence.ok ? evidence.body.evidence ?? [] : [])
    .filter((e) => String(e.payload?.locator ?? '').length > 0)
    .slice(0, 1)
    .map((e) => e.object_id);
  if (withdrawn.length > 0) {
    const opened = must('withdrawal received', await call(obs('/corrections/submit'),
      asOperator(hoffmann, 'observation.correction.receive', 'COR'),
      {
        sourceId: advisorySource.sourceId, kind: 'withdrawal', channel: 'operator',
        publisherRef: 'withdrawn-capacity-notice-2024-01-16.pdf',
        reason: 'the publisher withdrew this capacity notice',
        affectedEvdIds: withdrawn,
      }, hoffmann.token));
    if (opened !== null) {
      const applied = must('withdrawal applied', await call(
        obs(`/corrections/${opened.correction.caseId}/apply`),
        asOperator(dvorak, 'observation.correction.apply', 'COR', opened.correction.caseId),
        { decision: 'apply', affectedEvdIds: withdrawn, reason: 'publisher withdrawal confirmed' },
        dvorak.token));
      if (applied !== null) {
        const target = withdrawn[0];
        const dl = await call(obs(`/evidence/${target}/download`),
          asOperator(dvorak, 'observation.evidence.retrieve', 'EVD', target), {}, dvorak.token);
        console.log(dl.ok
          ? '  ✗ withdrawn evidence still served its bytes'
          : `  ✓ withdrawn evidence no longer serves its bytes (${dl.status}); the record and its history remain`);
        if (dl.ok) failures += 1;
      }
    }
  }
}

/* 13. projections rebuild from the event log */
console.log('\n13. projection rebuild (A11)');
const rebuilt = await call(obs('/projections/verify'),
  asOperator(dvorak, 'observation.read.projections', 'SRC'), {}, dvorak.token);
if (rebuilt.ok) {
  for (const r of rebuilt.body.projections ?? []) {
    const drift = Number(r.mismatched_rows);
    console.log(`  ${drift === 0 ? '✓' : '✗'} ${r.projection}: live ${r.live_rows} · rebuilt ${r.rebuilt_rows} · mismatched ${r.mismatched_rows}`);
    if (drift !== 0) failures += 1;
  }
}

/* 14. deterministic health replay */
console.log('\n14. deterministic health replay (A6)');
for (const s of registered.filter((x) => x.state === 'active').slice(0, 3)) {
  const r = await call(obs(`/sources/${s.sourceId}/health/replay`),
    asOperator(dvorak, 'observation.read.health', 'SRC', s.sourceId), {}, dvorak.token);
  if (r.ok) {
    console.log(`  ${r.body.deterministic ? '✓' : '✗'} ${s.contract.source_key}: ${r.body.timeline.length} transition(s), deterministic=${r.body.deterministic}`);
    if (!r.body.deterministic) failures += 1;
  }
}

/* 15. orphan reconciliation */
console.log('\n15. sweeper');
const sweep = await call(obs('/sweep'), asOperator(dvorak, 'observation.sweeper.reconcile', 'RUN'), {}, dvorak.token);
if (sweep.ok) {
  const r = sweep.body.sweep;
  console.log(`  ✓ expired ${r.expiredCases} · failed runs ${r.failedRuns} · orphan candidates ${r.orphanCandidates} · tombstones completed ${r.pendingTombstones}`);
  for (const p of r.poisonItems ?? []) console.log(`      · ${p.kind} ${String(p.ref).slice(0, 40)}: ${p.reason.slice(0, 90)}`);
}

/* 16. summary */
console.log('\n16. overview');
const overview = await call(obs('/overview'), asOperator(dvorak, 'observation.read.overview', 'SRC'), {}, dvorak.token);
if (overview.ok) {
  const c = overview.body.counts;
  console.log(`  sources ${c.sources} · active ${c.active} · draft ${c.draft} · unconfirmed rights ${c.unconfirmedRights}`);
  console.log(`  evidence objects ${c.evidenceObjects} · open quarantine ${c.openQuarantineCases} · open corrections ${c.openCorrections}`);
  const rr = overview.body.replayRatio;
  console.log(`  replay share: ${rr.byObject ?? '—'}% by object · ${rr.byBytes ?? '—'}% by bytes`);
}

function fmt(v) {
  return v == null ? 'none recorded' : String(v).replace('T', ' ').replace('.000Z', 'Z');
}

console.log('\n=== seed complete ===');
console.log(`tenant ${tenantId}`);
console.log(`domain ${domainId}`);
console.log(`operators: a.hoffmann (registrar) · m.dvorak (collection manager)`);
if (failures > 0) {
  console.error(`\n${failures} step(s) failed.`);
  process.exit(1);
}
