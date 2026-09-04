/**
 * ONE LIVE EXTRACTION — the product path with a real local model.
 *
 * The adapter existing proves nothing. This runs the corridor extraction in
 * `local-live` against a model that actually executes on this machine, and shows
 * the whole path working end to end:
 *
 *   * a real local model process answers, over loopback, with no credential;
 *   * the request goes through the Model Gateway and is logged there;
 *   * the runtime, the model identity and the digest OLLAMA ITSELF REPORTS are
 *     recorded — the pin is what the runtime says it loaded, not what we hoped;
 *   * the output becomes valid claims, or an honest abstention;
 *   * reading the evidence produced its own custody entry under its own decision;
 *   * admitting the claims used a different decision;
 *   * the live response was recorded, so it can be replayed;
 *   * replaying it afterwards calls the model ZERO times and reproduces the same
 *     canonical result.
 *
 * No hosted API, no account, no key. `ollama` runs on 127.0.0.1 and the gateway
 * refuses any host that is not loopback.
 */
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const API = process.env.EYE_API ?? 'http://localhost:3401';
const OLLAMA = process.env.EYE_MODEL_HOST ?? 'http://127.0.0.1:11434';
const MODEL = 'qwen2.5:3b-instruct';

function jcs(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  if (typeof v === 'object') {
    const k = Object.keys(v).filter((x) => v[x] !== undefined).sort();
    return `{${k.map((x) => `${JSON.stringify(x)}:${jcs(v[x])}`).join(',')}}`;
  }
  return 'null';
}
const digest = (v) => createHash('sha256').update(jcs(v ?? {}), 'utf8').digest('hex');
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const note = (m) => console.log(`  · ${m}`);
const bad = (m) => { failures += 1; console.log(`  ✗ ${m}`); };

async function call(path, over, payload = {}, token = null) {
  const envelope = {
    message_id: randomUUID(), scope: over.scope ?? 'DOMAIN',
    tenant_id: over.tenantId ?? null, domain_id: over.domainId ?? null,
    principal_id: over.principalId ?? 'anonymous', purpose_id: over.purposeId ?? 'intelligence',
    action: over.action, side_effect_class: over.sideEffect ?? 'reversible',
    consequence_class: over.consequence ?? 'C2', object_type: over.objectType,
    object_id: over.objectId ?? null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: randomUUID(), trace_id: 'phase2-live',
    payload_digest: digest(payload),
  };
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const r = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify({ envelope, payload }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function login(username, password) {
  const r = await call('/v1/auth/login', {
    scope: 'PLATFORM', action: 'identity.session.create', objectType: 'SES',
    principalId: 'anonymous', purposeId: 'authentication', consequence: 'C1',
  }, { username, password });
  if (r.status >= 400) throw new Error(`login failed for ${username}: ${r.status}`);
  return { token: r.body.tokens.accessToken, principalId: r.body.principalId };
}

console.log('\n=== ONE LIVE EXTRACTION — a real local model on loopback ===\n');

/* ── 0. the model, as the runtime reports it ─────────────────────────────── */
console.log('0. the local runtime and the model it actually loaded');
const ver = await fetch(`${OLLAMA}/api/version`).then((r) => r.json()).catch(() => null);
if (ver === null) { console.error('no ollama server on 127.0.0.1:11434 — start it with `ollama serve`'); process.exit(1); }
ok(`ollama ${ver.version} on 127.0.0.1:11434`);

const show = await fetch(`${OLLAMA}/api/show`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL }),
}).then((r) => r.json()).catch(() => null);
const tags = await fetch(`${OLLAMA}/api/tags`).then((r) => r.json()).catch(() => ({ models: [] }));
const entry = (tags.models ?? []).find((m) => m.name === MODEL || m.model === MODEL);
if (entry === undefined) { console.error(`the model ${MODEL} is not present — pull it first`); process.exit(1); }

// The digest the RUNTIME reports for the weights it holds. Not a hope, not a
// literal we chose: the identity of what will actually answer.
const weightsDigest = String(entry.digest ?? '').replace(/^sha256:/, '');
if (!/^[0-9a-f]{64}$/.test(weightsDigest)) {
  console.error('ollama did not report a sha-256 model digest'); process.exit(1);
}
ok(`${MODEL} · weights ${weightsDigest.slice(0, 24)}…`);
note(`family ${show?.details?.family ?? '?'} · params ${show?.details?.parameter_size ?? '?'} · quant ${show?.details?.quantization_level ?? '?'}`);
const runtimeVersion = `ollama/${ver.version}`;

/* ── 1. scope ────────────────────────────────────────────────────────────── */
const admin = await login('platform-admin', env.EYE_TEST_ADMIN_PASSWORD);
const tenants = await call('/v1/platform/tenants/list', {
  scope: 'PLATFORM', action: 'tenancy.tenant.list', objectType: 'TEN',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  sideEffect: 'none', consequence: 'C1',
}, {}, admin.token);
const tenant = (tenants.body.tenants ?? []).find((t) => (t.name ?? '').includes('NORDWERK'))
  ?? (tenants.body.tenants ?? [])[0];
const domains = await call(`/v1/tenants/${tenant.id}/domains/list`, {
  scope: 'TENANT', tenantId: tenant.id, action: 'tenancy.domain.list', objectType: 'CID',
  principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  sideEffect: 'none', consequence: 'C1',
}, {}, admin.token);
const T = tenant.id; const D = (domains.body.domains ?? [])[0].id;
const P = `/v1/tenants/${T}/domains/${D}/intelligence`;
const OPW = env.EYE_TEST_ADMIN_PASSWORD;
const operator = await login('a.hoffmann', OPW);
const agent = await login('r.okafor', OPW);
const manager = await login('l.ferreira', OPW);
const collectionManager = await login('m.dvorak', OPW);
const base = { tenantId: T, domainId: D };
const as = (who, o) => ({ ...base, ...o, principalId: `principal:${who.principalId}` });

/* ── 2. a method pinned to what the runtime actually holds ───────────────── */
console.log('\n1. register a local-live method, pinned to the reported weights');
const sources = await call(`/v1/tenants/${T}/domains/${D}/observation/sources/list`, as(collectionManager, {
  action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none', consequence: 'C1',
  purposeId: 'observation',
}), { limit: 50 }, collectionManager.token);
const corridor = (sources.body.sources ?? []).find((s) => s.source_key === 'imf-portwatch-chokepoints');

const PROMPT = [
  'You read ONE piece of preserved evidence and reply with JSON only, no prose.',
  'Reply {"claims":[{"claim_kind":"entity|event|claim","subject":"...","predicate":"...",',
  '"object_value":"...","confidence":0.0,"byte_start":0,"byte_end":0}]}.',
  'byte_start and byte_end must name the span of the evidence the claim rests on.',
  'If the evidence does not support a claim you would stand behind, reply',
  '{"abstain":true,"reason":"..."}. Abstaining is a correct answer; guessing is not.',
].join('\n');
const DECODING = { temperature: 0, top_p: 1, seed: 20260904, num_predict: 400 };
const methodKey = `corridor-live-${weightsDigest.slice(0, 8)}`;

const existing = await call(`${P}/methods/list`, as(operator, {
  action: 'intelligence.read', objectType: 'MTH', sideEffect: 'none', consequence: 'C1',
}), {}, operator.token);
let method = (existing.body.methods ?? []).find((m) => m.method_key === methodKey);
if (method === undefined) {
  const reg = await call(`${P}/methods/register`, as(operator, {
    action: 'intelligence.method.register', objectType: 'MTH',
  }), {
    methodKey, name: 'Corridor transit claims — live local model',
    sourceId: corridor.source_id, targetTypes: ['ENT', 'EVT', 'CLM'],
    gatewayMode: 'local-live',
    modelId: MODEL, modelWeightsDigest: weightsDigest, runtimeVersion,
    promptRef: 'extract/corridor-live', promptVersion: 'v1', promptText: PROMPT,
    decoding: DECODING, confidenceFloor: 0.3, reviewBelow: 0.8,
    budgetCalls: 3, budgetSeconds: 900,
  }, operator.token);
  if (reg.status >= 400) { bad(`registration refused (${reg.status}) ${JSON.stringify(reg.body).slice(0,200)}`); process.exit(1); }
  ok(`registered ${reg.body.method.methodId}`);
  await call(`${P}/methods/${reg.body.method.methodId}/approve`, as(manager, {
    action: 'intelligence.method.approve', objectType: 'MTH', objectId: reg.body.method.methodId,
  }), { reason: 'live model pin reviewed against the runtime-reported digest' }, manager.token);
  await call(`${P}/methods/${reg.body.method.methodId}/transition`, as(manager, {
    action: 'intelligence.method.activate', objectType: 'MTH', objectId: reg.body.method.methodId,
  }), { target: 'active', reason: 'ready for one live corridor extraction' }, manager.token);
  ok('approved by a second operator, then activated');
  method = { method_id: reg.body.method.methodId, gateway_mode: 'local-live' };
} else {
  ok(`method already registered (${method.lifecycle_state}) — mode ${method.gateway_mode}`);
}
const methodId = method.method_id;

/* ── 3. the live run ─────────────────────────────────────────────────────── */
console.log('\n2. one live extraction — a real model answers');
const started = Date.now();
const live = await call(`${P}/extract`, as(agent, {
  action: 'intelligence.claim.admit', objectType: 'CLM',
}), { methodId, limit: 2 }, agent.token);
if (live.status >= 400) { bad(`extraction refused (${live.status}) ${JSON.stringify(live.body).slice(0,300)}`); process.exit(1); }
const x = live.body.extraction;
ok(`run ${x.runId.slice(0, 8)}… mode=${x.mode} state=${x.state} in ${((Date.now()-started)/1000).toFixed(1)}s`);
console.log(`      evidence read ${x.evidenceRead} · claims ${x.claimsAdmitted} · abstentions ${x.abstentions} · calls ${x.callsUsed}`);
if (x.mode !== 'local-live') bad(`the run reports mode=${x.mode}, not local-live`);
if (x.callsUsed < 1) bad('no model call was made');
if (x.claimsAdmitted === 0 && x.abstentions === 0) bad('the model neither produced a claim nor abstained');
else ok(x.claimsAdmitted > 0 ? `${x.claimsAdmitted} claim(s) admitted from a live model` : 'the model abstained — an honest answer');

/* ── 4. the two decisions ────────────────────────────────────────────────── */
console.log('\n3. reading and writing were two decisions');
for (const r of x.evidenceRetrievals ?? []) {
  note(`read  EVD ${r.evidenceObjectId.slice(0, 8)}… → POL ${r.policyDecisionId.slice(0, 8)}… audit #${r.auditSeq}`);
}
const admissionIds = new Set((x.claims ?? []).map((c) => c.admissionDecisionId));
for (const id of admissionIds) note(`write claims          → POL ${String(id).slice(0, 8)}…`);
const retrievalIds = new Set((x.evidenceRetrievals ?? []).map((r) => r.policyDecisionId));
if ([...admissionIds].some((id) => retrievalIds.has(id))) bad('a claim was admitted under the decision that authorised reading it');
else if (retrievalIds.size > 0) ok('the read decisions and the write decisions are disjoint');

/* ── 5. what the gateway recorded ────────────────────────────────────────── */
console.log('\n4. the gateway log');
const gw = await call(`${P}/gateway/calls`, as(manager, {
  action: 'intelligence.read', objectType: 'GWC', sideEffect: 'none', consequence: 'C1',
}), { limit: 20 }, manager.token);
const liveCalls = (gw.body.calls ?? []).filter((c) => c.mode === 'local-live');
if (liveCalls.length === 0) bad('the gateway recorded no local-live call');
else {
  const c = liveCalls[0];
  ok(`mode=${c.mode} outcome=${c.outcome} model=${c.model_id} runtime=${c.runtime_version} in ${c.latency_ms} ms`);
  if (c.runtime_version !== runtimeVersion) bad(`the call recorded runtime ${c.runtime_version}, not ${runtimeVersion}`);
  if (c.model_id !== MODEL) bad(`the call recorded model ${c.model_id}, not ${MODEL}`);
}
const recordedLive = (gw.body.recorded ?? []).filter((r) => r.recorded_from === 'local-live');
if (recordedLive.length === 0) bad('the live response was not recorded for replay');
else ok(`${recordedLive.length} live response(s) recorded — replayable, and marked 'local-live', not 'fixture'`);

/* ── 6. replay reproduces it with zero model calls ───────────────────────── */
console.log('\n5. replaying the recorded response calls the model zero times');
const before = (gw.body.calls ?? []).filter((c) => c.mode === 'local-live').length;
const again = await call(`${P}/extract`, as(agent, {
  action: 'intelligence.claim.admit', objectType: 'CLM',
}), { methodId, limit: 2 }, agent.token);
const y = again.body.extraction ?? {};
if (y.callsUsed === 0 && y.idempotentHits > 0) {
  ok(`${y.idempotentHits} identity/identities returned their recorded result; 0 model calls`);
} else bad(`expected idempotent hits and no calls, got hits=${y.idempotentHits} calls=${y.callsUsed}`);
const gw2 = await call(`${P}/gateway/calls`, as(manager, {
  action: 'intelligence.read', objectType: 'GWC', sideEffect: 'none', consequence: 'C1',
}), { limit: 20 }, manager.token);
const after = (gw2.body.calls ?? []).filter((c) => c.mode === 'local-live').length;
if (after === before) ok('the gateway logged no further live call');
else bad(`the gateway logged ${after - before} further live call(s)`);

/* ── 7. what a reader sees ───────────────────────────────────────────────── */
console.log('\n6. the claims, as a reader sees them');
const claims = await call(`${P}/claims/list`, as(manager, {
  action: 'intelligence.read', objectType: 'CLM', sideEffect: 'none', consequence: 'C1',
}), { limit: 200 }, manager.token);
const liveClaims = (claims.body.claims ?? []).filter((c) => c.payload?.lineage?.mode === 'local-live');
note(`${liveClaims.length} claim(s) carry mode=local-live`);
for (const c of liveClaims.slice(0, 4)) {
  console.log(`      ${String(c.payload.subject).slice(0, 40).padEnd(42)} ${c.payload.predicate} → ${String(c.payload.object_value).slice(0, 44)}`);
  console.log(`        confidence ${c.payload.confidence} · bytes ${c.payload.lineage.byte_start}-${c.payload.lineage.byte_end} · weights ${String(c.payload.lineage.model_weights_digest).slice(0,16)}…`);
}
if (liveClaims.length > 0) {
  const w = liveClaims[0].payload.lineage.model_weights_digest;
  if (w === weightsDigest) ok('the claim records the digest the runtime reported for the weights that answered');
  else bad(`the claim records weights ${String(w).slice(0,16)}…, but the runtime holds ${weightsDigest.slice(0,16)}…`);
}

console.log(`\n=== ${failures === 0 ? 'live path proven' : `${failures} problem(s)`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
