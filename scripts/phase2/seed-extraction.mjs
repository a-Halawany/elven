/**
 * The corridor demonstration, second act — evidence becomes claims.
 *
 * Phase 1 ended with preserved bytes and an operator who could prove where they
 * came from. This drives the REAL API over HTTP, with real governed envelopes, to
 * turn those bytes into attributable claims:
 *
 *   1. register an extraction method, pinned end to end
 *   2. have a DIFFERENT operator approve it, then activate it
 *   3. load the recorded model responses, keyed to the real evidence
 *   4. extract — claims admitted with lineage down to the byte span
 *   5. show that repeating the same extraction is idempotent, not a second call
 *   6. review the low-confidence output; correct one without overwriting it
 *   7. read the corrected claim back at a known-at instant before the correction
 *
 * Idempotent, and there is no back door: every step is a request an operator
 * could make.
 */
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { CORRIDOR_METHOD, buildFixtures, requestDigest } from './build-extraction-fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const API = process.env.EYE_API ?? 'http://localhost:3401';

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

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const note = (m) => console.log(`  · ${m}`);
const bad = (m) => { failures += 1; console.log(`  ✗ ${m}`); };

async function call(path, over, payload = {}, token = null) {
  const envelope = {
    message_id: randomUUID(),
    scope: over.scope ?? 'DOMAIN',
    tenant_id: over.tenantId ?? null,
    domain_id: over.domainId ?? null,
    principal_id: over.principalId ?? 'anonymous',
    purpose_id: over.purposeId ?? 'intelligence',
    action: over.action,
    side_effect_class: over.sideEffect ?? 'reversible',
    consequence_class: over.consequence ?? 'C2',
    object_type: over.objectType,
    object_id: over.objectId ?? null,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: randomUUID(),
    trace_id: 'phase2-seed',
    payload_digest: digest(payload),
  };
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const r = await fetch(API + path, {
    method: 'POST', headers, body: JSON.stringify({ envelope, payload }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

/* Authentication goes through the governed envelope path, exactly as the Phase 1
   seed does — there is no side door for this script either. */
async function login(username, password) {
  const r = await call('/v1/auth/login', {
    scope: 'PLATFORM', action: 'identity.session.create', objectType: 'SES',
    principalId: 'anonymous', purposeId: 'authentication', consequence: 'C1',
  }, { username, password });
  if (r.status >= 400) throw new Error(`login failed for ${username}: ${r.status}`);
  return { token: r.body.tokens.accessToken, principalId: r.body.principalId };
}

console.log('\n=== The 72-Hour Corridor Decision, act II — evidence becomes claims ===\n');

// The Phase 1 demonstration's own tenant, domain and operators.
const admin = await login('platform-admin', env.EYE_TEST_ADMIN_PASSWORD);
const tenants = await call('/v1/platform/tenants/list', {
  scope: 'PLATFORM', action: 'tenancy.tenant.list', objectType: 'TEN',
  purposeId: 'platform.administration', sideEffect: 'none', consequence: 'C1',
  principalId: `principal:${admin.principalId}`,
}, {}, admin.token);
const tenant = (tenants.body.tenants ?? []).find((t) => (t.name ?? '').includes('NORDWERK'))
  ?? (tenants.body.tenants ?? [])[0];
if (tenant === undefined) { console.error('no tenant found — run the Phase 1 seed first'); process.exit(1); }
const domains = await call(`/v1/tenants/${tenant.id}/domains/list`, {
  scope: 'TENANT', tenantId: tenant.id, action: 'tenancy.domain.list', objectType: 'CID',
  purposeId: 'platform.administration', sideEffect: 'none', consequence: 'C1',
  principalId: `principal:${admin.principalId}`,
}, {}, admin.token);
const domain = (domains.body.domains ?? [])[0];
if (domain === undefined) { console.error('no domain found — run the Phase 1 seed first'); process.exit(1); }
const T = tenant.id; const D = domain.id;
console.log(`tenant ${T}\ndomain ${D}\n`);

// The Phase 1 seed created its operators with this credential, from the same 0600
// handoff file. It reaches every authenticated call through the ENVIRONMENT only
// and is never printed.
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

/*
 * PHASE 2 BRINGS TWO NEW PEOPLE, and the split between them is the point.
 *
 *   R. Okafor    extraction_agent   — runs methods, admits claims
 *   L. Ferreira  extraction_manager — approves methods, decides review cases
 *
 * The agent may not approve the method it runs, and the database additionally
 * refuses a review decision taken by the agent that produced the output. One
 * person doing both would make the queue decorative, so the demonstration uses
 * two, exactly as a real deployment would have to.
 */
console.log('0. the Phase 2 operators');
const principals = await call(`/v1/tenants/${T}/principals/list`, {
  scope: 'TENANT', tenantId: T, action: 'identity.principal.list', objectType: 'PRN',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  sideEffect: 'none', consequence: 'C1',
}, {}, admin.token);
const known = principals.body.principals ?? [];

async function ensureOperator(loginName, displayName, roleCode) {
  const found = known.find((p) => p.login_name === loginName);
  if (found !== undefined) { ok(`${displayName} already present (${roleCode})`); return; }
  const r = await call(`/v1/tenants/${T}/principals`, {
    scope: 'TENANT', tenantId: T, action: 'identity.principal.create', objectType: 'PRN',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, {
    kind: 'human', displayName, loginName, password: OPERATOR_PASSWORD,
    roleCode, domainId: D,
  }, admin.token);
  if (r.status < 400) ok(`created ${displayName} (${roleCode})`);
  else note(`${displayName}: ${r.status} — ${(r.body.message ?? '').slice(0, 80)}`);
}

await ensureOperator('r.okafor', 'R. Okafor — extraction agent', 'extraction_agent');
await ensureOperator('l.ferreira', 'L. Ferreira — extraction manager', 'extraction_manager');
console.log('');

const operator = await login('a.hoffmann', OPERATOR_PASSWORD);
const agent = await login('r.okafor', OPERATOR_PASSWORD);
const manager = await login('l.ferreira', OPERATOR_PASSWORD);
// Reading the original bytes stays a PHASE 1 authority. The Phase 2 manager
// approves methods and decides review cases; it does not gain evidence retrieval
// by being new, so the seed reads evidence as the collection manager who already
// had that right.
const collectionManager = await login('m.dvorak', OPERATOR_PASSWORD);
const base = { tenantId: T, domainId: D };
const asOperator = (o) => ({ ...base, ...o, principalId: `principal:${operator.principalId}` });
const asManager = (o) => ({ ...base, ...o, principalId: `principal:${manager.principalId}` });
const asAgent = (o) => ({ ...base, ...o, principalId: `principal:${agent.principalId}` });
const P = `/v1/tenants/${T}/domains/${D}/intelligence`;

/* ── 1. register ─────────────────────────────────────────────────────────── */
console.log('1. register the extraction method (as a.hoffmann)');
// THE METHOD DECLARES WHAT IT READS. Scoping it to the chokepoint source is not a
// convenience: a method that reads everything abstains on most of it, and an
// abstention that only means "this was never my evidence" tells a reviewer nothing.
const sourcesList = await call(`/v1/tenants/${T}/domains/${D}/observation/sources/list`, {
  ...base, action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none',
  consequence: 'C1', purposeId: 'observation',
  principalId: `principal:${collectionManager.principalId}`,
}, { limit: 50 }, collectionManager.token);
const corridorSource = (sourcesList.body.sources ?? [])
  .find((x) => x.source_key === 'imf-portwatch-chokepoints');
if (corridorSource === undefined) {
  console.error('the imf-portwatch-chokepoints source is not registered — run the Phase 1 seed first');
  process.exit(1);
}
note(`reads ${corridorSource.source_key} (${corridorSource.source_id.slice(0, 8)}…)`);
let methodId = null;
const existing = await call(`${P}/methods/list`, asOperator({
  action: 'intelligence.read', objectType: 'MTH', sideEffect: 'none', consequence: 'C1',
}), {}, operator.token);
const found = (existing.body.methods ?? []).find((m) => m.method_key === CORRIDOR_METHOD.methodKey);
if (found !== undefined) {
  methodId = found.method_id;
  ok(`method already registered (${found.lifecycle_state})`);
} else {
  const reg = await call(`${P}/methods/register`, asOperator({
    action: 'intelligence.method.register', objectType: 'MTH',
  }), {
    methodKey: CORRIDOR_METHOD.methodKey, name: CORRIDOR_METHOD.name,
    sourceId: corridorSource.source_id, targetTypes: CORRIDOR_METHOD.targetTypes,
    gatewayMode: 'replay',
    modelId: CORRIDOR_METHOD.modelId, modelWeightsDigest: CORRIDOR_METHOD.modelWeightsDigest,
    runtimeVersion: CORRIDOR_METHOD.runtimeVersion, promptRef: CORRIDOR_METHOD.promptRef,
    promptVersion: CORRIDOR_METHOD.promptVersion, promptText: CORRIDOR_METHOD.promptText,
    decoding: CORRIDOR_METHOD.decoding,
    confidenceFloor: CORRIDOR_METHOD.confidenceFloor, reviewBelow: CORRIDOR_METHOD.reviewBelow,
    budgetCalls: CORRIDOR_METHOD.budgetCalls, budgetSeconds: CORRIDOR_METHOD.budgetSeconds,
  }, operator.token);
  if (reg.status < 400) { methodId = reg.body.method.methodId; ok(`registered ${methodId}`); }
  else bad(`registration refused (${reg.status}) ${JSON.stringify(reg.body).slice(0, 200)}`);
}
console.log(`  model ${CORRIDOR_METHOD.modelId} · weights ${CORRIDOR_METHOD.modelWeightsDigest.slice(0, 16)}…`);
console.log(`  prompt ${CORRIDOR_METHOD.promptRef}@${CORRIDOR_METHOD.promptVersion} · decoding ${CORRIDOR_METHOD.decodingDigest.slice(0, 16)}…`);

/* ── 2. separation of duties, approval, activation ───────────────────────── */
console.log('\n2. approval by a DIFFERENT operator');
const state = found?.lifecycle_state ?? 'draft';
const selfApprove = await call(`${P}/methods/${methodId}/approve`, asOperator({
  action: 'intelligence.method.approve', objectType: 'MTH', objectId: methodId,
}), { reason: 'approving the method I registered' }, operator.token);
if (selfApprove.status >= 400) ok(`the registrar cannot approve their own method (${selfApprove.status})`);
else bad('a registrar approved their own method');

const approve = await call(`${P}/methods/${methodId}/approve`, asManager({
  action: 'intelligence.method.approve', objectType: 'MTH', objectId: methodId,
}), { reason: 'prompt, model pin and thresholds reviewed against the corridor evidence' }, manager.token);
if (approve.status < 400) ok('approved by L. Ferreira');
else if (state !== 'draft') ok(`already approved (${approve.status}: ${(approve.body.message ?? '').slice(0, 60)})`);
else bad(`approval: ${approve.status} — ${(approve.body.message ?? '').slice(0, 90)}`);

const activate = await call(`${P}/methods/${methodId}/transition`, asManager({
  action: 'intelligence.method.activate', objectType: 'MTH', objectId: methodId,
}), { target: 'active', reason: 'ready to extract against the frozen replay evidence' }, manager.token);
if (activate.status < 400) ok('activated');
else if (state === 'active') ok(`already active (${activate.status})`);
else bad(`activation: ${activate.status} — ${(activate.body.message ?? '').slice(0, 90)}`);

/* ── 3. load the recorded responses ──────────────────────────────────────── */
console.log('\n3. load the recorded model responses (mode: replay)');
const evidenceList = await call(`/v1/tenants/${T}/domains/${D}/observation/evidence/list`, ({
  ...base, principalId: `principal:${collectionManager.principalId}`,
  action: 'observation.read.evidence', objectType: 'EVD', sideEffect: 'none', consequence: 'C1',
  purposeId: 'observation',
}), { sourceId: corridorSource.source_id, limit: 200 }, collectionManager.token);
const evidence = (evidenceList.body.evidence ?? []).slice(0, 60);
note(`${evidence.length} evidence object(s) visible to the method`);

const units = [];
for (const e of evidence) {
  const got = await call(`/v1/tenants/${T}/domains/${D}/observation/evidence/${e.object_id}/download`, {
    ...base, action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: e.object_id,
    purposeId: 'observation', consequence: 'C2',
    principalId: `principal:${collectionManager.principalId}`,
  }, {}, collectionManager.token);
  const b64 = got.body?.download?.base64 ?? null;
  if (typeof b64 !== 'string') continue;
  const excerpt = Buffer.from(b64, 'base64').toString('utf8').slice(0, 8000);
  const m = /"portname"\s*:\s*"([^"]+)"/.exec(excerpt);
  const t = /"n_total(?:_transit)?"\s*:\s*([0-9.]+)/.exec(excerpt) ?? /"transits"\s*:\s*([0-9.]+)/.exec(excerpt);
  const d = /"date"\s*:\s*"([^"]+)"/.exec(excerpt) ?? /(\d{4}-\d{2}-\d{2})/.exec(excerpt);
  // The locator and the content digest live in the EVD PAYLOAD, which is what the
  // extraction reads too — so the request digest the fixture is keyed by is the
  // one the gateway will compute.
  units.push({
    itemKey: String(e.payload?.locator ?? e.object_id),
    contentDigest: String(e.payload?.content_digest ?? ''),
    excerpt,
    portname: m === null ? 'the corridor' : m[1],
    transits: t === null ? null : Math.round(Number(t[1])),
    date: d === null ? 'the observed day' : d[1],
  });
}
const fixtures = buildFixtures(units);
if (fixtures.length > 0) {
  const rec = await call(`${P}/gateway/record`, asManager({
    action: 'intelligence.gateway.call', objectType: 'GWC',
  }), { recordings: fixtures.map((f) => ({
    requestDigest: f.request_digest, response: f.response,
    modelId: f.model_id, runtimeVersion: f.runtime_version,
  })) }, manager.token);
  if (rec.status < 400) {
    ok(`${rec.body.recordings.stored} recorded, ${rec.body.recordings.existing} already present`);
  } else bad(`recording refused (${rec.status}) ${JSON.stringify(rec.body).slice(0, 200)}`);
} else {
  bad('no evidence bytes were readable, so no responses could be recorded');
}

/* ── 4. extract ──────────────────────────────────────────────────────────── */
console.log('\n4. extract — claims with lineage to the evidence bytes');
const run1 = await call(`${P}/extract`, asAgent({
  action: 'intelligence.claim.admit', objectType: 'CLM',
}), { methodId, limit: 40 }, agent.token);
if (run1.status < 400) {
  const x = run1.body.extraction;
  ok(`run ${x.runId.slice(0, 8)}… mode=${x.mode} state=${x.state}`);
  console.log(`      evidence read ${x.evidenceRead} · claims ${x.claimsAdmitted} · abstentions ${x.abstentions} · queued for review ${x.queuedForReview} · calls ${x.callsUsed}`);
} else bad(`extraction refused (${run1.status}) ${JSON.stringify(run1.body).slice(0, 250)}`);

/* ── 5. idempotency ──────────────────────────────────────────────────────── */
console.log('\n5. the same extraction again — idempotent, not a second call');
const run2 = await call(`${P}/extract`, asAgent({
  action: 'intelligence.claim.admit', objectType: 'CLM',
}), { methodId, limit: 40 }, agent.token);
if (run2.status < 400) {
  const x = run2.body.extraction;
  if (x.idempotentHits > 0 && x.callsUsed === 0) {
    ok(`${x.idempotentHits} identity/identities returned their recorded result; 0 model calls`);
  } else {
    bad(`expected idempotent hits and no calls, got hits=${x.idempotentHits} calls=${x.callsUsed}`);
  }
} else bad(`second run refused (${run2.status})`);

/* ── 6. review ───────────────────────────────────────────────────────────── */
console.log('\n6. the review queue — low confidence and abstentions cannot bypass it');
const queue = await call(`${P}/review/queue`, asManager({
  action: 'intelligence.read', objectType: 'REV', sideEffect: 'none', consequence: 'C1',
}), { limit: 50 }, manager.token);
const cases = queue.body.queue ?? [];
note(`${cases.length} case(s) queued`);
for (const c of cases.slice(0, 3)) {
  console.log(`      ${c.queued_reason.padEnd(24)} confidence ${c.confidence ?? '—'}`);
}
const withClaim = cases.find((c) => c.claim_object_id !== null);
const abstention = cases.find((c) => c.queued_reason === 'abstained');
if (abstention !== undefined) ok('an abstention is queued as an abstention, with no claim attached');

if (withClaim !== undefined) {
  const noReason = await call(`${P}/review/${withClaim.case_id}/decide`, asManager({
    action: 'intelligence.review.decide', objectType: 'REV', objectId: withClaim.case_id,
  }), { decision: 'correct', reason: 'no' }, manager.token);
  if (noReason.status >= 400) ok('a decision without an adequate reason is refused');
  else bad('a decision without a reason was accepted');

  // The instant to ask about is the one just BEFORE the correction — that is where
  // v1 is the whole truth. Sixty seconds ago would predate the claim itself and
  // prove only that nothing existed yet.
  await new Promise((r) => setTimeout(r, 1100));
  const beforeCorrection = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 1100));

  const corrected = await call(`${P}/review/${withClaim.case_id}/decide`, asManager({
    action: 'intelligence.review.decide', objectType: 'REV', objectId: withClaim.case_id,
  }), {
    decision: 'correct',
    reason: 'the percentage is right but the wording overstated it; restating against the prior day only',
    correctedValue: { object_value: 'fell against the prior day; magnitude restated after review', confidence: 0.9 },
  }, manager.token);
  if (corrected.status < 400) {
    ok(`corrected → version ${corrected.body.review.newVersion} (the prior version is untouched)`);

    /* ── 7. known-at ───────────────────────────────────────────────────── */
    console.log('\n7. known-at — what was known before the correction');
    const before = beforeCorrection;
    const asOf = await call(`${P}/claims/${withClaim.claim_object_id}/get`, asManager({
      action: 'intelligence.read', objectType: 'CLM', objectId: withClaim.claim_object_id,
      sideEffect: 'none', consequence: 'C1',
    }), { knownAt: before }, manager.token);
    const now = await call(`${P}/claims/${withClaim.claim_object_id}/get`, asManager({
      action: 'intelligence.read', objectType: 'CLM', objectId: withClaim.claim_object_id,
      sideEffect: 'none', consequence: 'C1',
    }), {}, manager.token);
    const asOfV = asOf.body.current?.object_version ?? null;
    const nowV = now.body.current?.object_version ?? null;
    if (Number(nowV) > Number(asOfV)) {
      ok(`known-at ${before.slice(11, 19)} sees v${asOfV}; current is v${nowV} — no hindsight`);
    } else bad(`known-at returned v${asOfV} and current v${nowV}`);
  } else bad(`correction refused (${corrected.status}) ${JSON.stringify(corrected.body).slice(0, 200)}`);
}

/* ── 8. projections and the overview ─────────────────────────────────────── */
console.log('\n8. projections rebuild from the event log');
const proj = await call(`${P}/projections/verify`, asManager({
  action: 'intelligence.read', objectType: 'CLM', sideEffect: 'none', consequence: 'C1',
}), {}, manager.token);
for (const p of proj.body.projections ?? []) {
  const line = `${p.projection}: live ${p.live_rows} · rebuilt ${p.rebuilt_rows} · mismatched ${p.mismatched}`;
  if (Number(p.mismatched) === 0) ok(line); else bad(line);
}

console.log('\n9. overview');
const ov = await call(`${P}/overview`, asManager({
  action: 'intelligence.read', objectType: 'CLM', sideEffect: 'none', consequence: 'C1',
}), {}, manager.token);
const o = ov.body.overview;
if (o !== undefined) {
  console.log(`  methods ${o.methods.total} · active ${o.methods.active}`);
  console.log(`  claims ${o.claims.total} — replay ${o.claims.replay} · local-live ${o.claims.liveLocal}`);
  console.log(`  gateway calls ${o.gateway.calls} — abstained ${o.gateway.abstained} · refused ${o.gateway.refused} · failed ${o.gateway.failed}`);
  console.log(`  review — queued ${o.review.queued} · abstentions ${o.review.abstentions} · decided ${o.review.decided}`);
}

console.log(`\n=== ${failures === 0 ? 'act II complete' : `act II finished with ${failures} problem(s)`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
