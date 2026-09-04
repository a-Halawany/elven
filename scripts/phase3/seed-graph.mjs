/**
 * The corridor demonstration, act III — claims become a governed memory.
 *
 * Phase 2 ended with attributable claims. They were still strings: two claims
 * about "Bab el-Mandeb Strait" were two unrelated statements, nothing connected
 * the chokepoint to the shipment or the shipment to the component, and nothing
 * noticed when a corrected claim undermined something a person was relying on.
 *
 * This drives the REAL API over HTTP, with real governed envelopes:
 *
 *   1. a second extraction method over NORDWERK's own uploads, producing the
 *      RELATIONSHIPS the chokepoint rows never state
 *   2. register the PortWatch identifier system as authoritative — the only thing
 *      that may ever resolve an entity automatically
 *   3. resolve: identifiers resolve on their own; names reach a queue
 *   4. a person decides the queue, including redirecting one mention onto the
 *      corridor entity the resolver could not have known it meant
 *   5. build edges — provenance-bound, with world time and record time apart
 *   6. explore the graph, and ask it what we knew BEFORE we knew it
 *   7. declare the Strategy Graph the corridor decision actually rests on
 *   8. correct the evidence, and watch the assumption go unverified and the
 *      objective and commitment above it be reported
 *
 * Idempotent, and there is no back door: every step is a request an operator
 * could make.
 */
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { SUPPLY_METHOD, buildFixtures, requestDigest } from './build-graph-fixtures.mjs';

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
    purpose_id: over.purposeId ?? 'graph',
    action: over.action,
    side_effect_class: over.sideEffect ?? 'reversible',
    consequence_class: over.consequence ?? 'C2',
    object_type: over.objectType,
    object_id: over.objectId ?? null,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: randomUUID(),
    trace_id: 'phase3-seed',
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

async function login(username, password) {
  const r = await call('/v1/auth/login', {
    scope: 'PLATFORM', action: 'identity.session.create', objectType: 'SES',
    principalId: 'anonymous', purposeId: 'authentication', consequence: 'C1',
  }, { username, password });
  if (r.status >= 400) throw new Error(`login failed for ${username}: ${r.status}`);
  return { token: r.body.tokens.accessToken, principalId: r.body.principalId };
}

console.log('\n=== The 72-Hour Corridor Decision, act III — claims become a governed memory ===\n');

const admin = await login('platform-admin', env.EYE_TEST_ADMIN_PASSWORD);
const tenants = await call('/v1/platform/tenants/list', {
  scope: 'PLATFORM', action: 'tenancy.tenant.list', objectType: 'TEN',
  purposeId: 'platform.administration', sideEffect: 'none', consequence: 'C1',
  principalId: `principal:${admin.principalId}`,
}, {}, admin.token);
const tenant = (tenants.body.tenants ?? []).find((t) => (t.name ?? '').includes('NORDWERK'))
  ?? (tenants.body.tenants ?? [])[0];
if (tenant === undefined) { console.error('no tenant found — run the Phase 1 and 2 seeds first'); process.exit(1); }
const domains = await call(`/v1/tenants/${tenant.id}/domains/list`, {
  scope: 'TENANT', tenantId: tenant.id, action: 'tenancy.domain.list', objectType: 'CID',
  purposeId: 'platform.administration', sideEffect: 'none', consequence: 'C1',
  principalId: `principal:${admin.principalId}`,
}, {}, admin.token);
const domain = (domains.body.domains ?? [])[0];
if (domain === undefined) { console.error('no domain found — run the Phase 1 seed first'); process.exit(1); }
const T = tenant.id; const D = domain.id;
console.log(`tenant ${T}\ndomain ${D}\n`);

const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;

/*
 * PHASE 3 BRINGS THREE MORE PEOPLE, and the split between them is the point.
 *
 *   K. Adeyemi   resolution_agent   — runs the resolver, proposes candidates
 *   S. Larsen    resolution_manager — decides the queue, splits wrong merges
 *   J. Weber     strategy_owner     — declares what the business intends
 *
 * The agent may not decide a resolution, split an entity or retract an edge. The
 * database refuses a decision by the principal that proposed it, and the policy
 * bundle grants the deciding actions to no agent role at all — two independent
 * boundaries, as everywhere else.
 */
console.log('0. the Phase 3 operators');
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
    kind: 'human', displayName, loginName, password: OPERATOR_PASSWORD, roleCode, domainId: D,
  }, admin.token);
  if (r.status < 400) ok(`created ${displayName} (${roleCode})`);
  else note(`${displayName}: ${r.status} — ${(r.body.message ?? '').slice(0, 80)}`);
}

await ensureOperator('k.adeyemi', 'K. Adeyemi — resolution agent', 'resolution_agent');
await ensureOperator('s.larsen', 'S. Larsen — resolution manager', 'resolution_manager');
await ensureOperator('j.weber', 'J. Weber — strategy owner', 'strategy_owner');
console.log('');

const operator = await login('a.hoffmann', OPERATOR_PASSWORD);
const extractionManager = await login('l.ferreira', OPERATOR_PASSWORD);
const extractionAgent = await login('r.okafor', OPERATOR_PASSWORD);
const collectionManager = await login('m.dvorak', OPERATOR_PASSWORD);
const resolutionAgent = await login('k.adeyemi', OPERATOR_PASSWORD);
const resolutionManager = await login('s.larsen', OPERATOR_PASSWORD);
const strategyOwner = await login('j.weber', OPERATOR_PASSWORD);

const base = { tenantId: T, domainId: D };
const as = (who, o) => ({ ...base, ...o, principalId: `principal:${who.principalId}` });
const G = `/v1/tenants/${T}/domains/${D}/graph`;
const I = `/v1/tenants/${T}/domains/${D}/intelligence`;
const O = `/v1/tenants/${T}/domains/${D}/observation`;

/* ── 1. a second extraction method, over NORDWERK's own records ──────────── */
console.log('1. a supply-chain extraction method (registered by a.hoffmann, approved by l.ferreira)');
const sourcesList = await call(`${O}/sources/list`, as(collectionManager, {
  action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none', consequence: 'C1',
  purposeId: 'observation',
}), { limit: 50 }, collectionManager.token);
const supplySource = (sourcesList.body.sources ?? []).find((x) => x.source_key === 'nordwerk-internal');
if (supplySource === undefined) {
  console.error('the nordwerk-internal source is not registered — run the Phase 1 seed first');
  process.exit(1);
}
note(`reads ${supplySource.source_key} (${supplySource.source_id.slice(0, 8)}…)`);

let supplyMethodId = null;
const methodList = await call(`${I}/methods/list`, as(operator, {
  action: 'intelligence.read', objectType: 'MTH', sideEffect: 'none', consequence: 'C1',
  purposeId: 'intelligence',
}), {}, operator.token);
const existingMethod = (methodList.body.methods ?? [])
  .find((m) => m.method_key === SUPPLY_METHOD.methodKey);
if (existingMethod !== undefined) {
  supplyMethodId = existingMethod.method_id;
  ok(`method already registered (${existingMethod.lifecycle_state})`);
} else {
  const reg = await call(`${I}/methods/register`, as(operator, {
    action: 'intelligence.method.register', objectType: 'MTH', purposeId: 'intelligence',
  }), {
    methodKey: SUPPLY_METHOD.methodKey, name: SUPPLY_METHOD.name,
    sourceId: supplySource.source_id, targetTypes: SUPPLY_METHOD.targetTypes,
    gatewayMode: 'replay',
    modelId: SUPPLY_METHOD.modelId, modelWeightsDigest: SUPPLY_METHOD.modelWeightsDigest,
    runtimeVersion: SUPPLY_METHOD.runtimeVersion, promptRef: SUPPLY_METHOD.promptRef,
    promptVersion: SUPPLY_METHOD.promptVersion, promptText: SUPPLY_METHOD.promptText,
    decoding: SUPPLY_METHOD.decoding,
    confidenceFloor: SUPPLY_METHOD.confidenceFloor, reviewBelow: SUPPLY_METHOD.reviewBelow,
    budgetCalls: SUPPLY_METHOD.budgetCalls, budgetSeconds: SUPPLY_METHOD.budgetSeconds,
  }, operator.token);
  if (reg.status < 400) { supplyMethodId = reg.body.method.methodId; ok('registered'); }
  else bad(`registration refused (${reg.status}) ${JSON.stringify(reg.body).slice(0, 200)}`);
}
if (supplyMethodId !== null) {
  for (const [path, action, payload, label] of [
    [`${I}/methods/${supplyMethodId}/approve`, 'intelligence.method.approve',
     { reason: 'the pin is complete and the source is the right one' }, 'approved'],
    [`${I}/methods/${supplyMethodId}/transition`, 'intelligence.method.activate',
     { target: 'active', reason: 'ready to extract the supply relationships' }, 'activated'],
  ]) {
    const r = await call(path, as(extractionManager, {
      action, objectType: 'MTH', objectId: supplyMethodId, purposeId: 'intelligence',
    }), payload, extractionManager.token);
    if (r.status < 400) ok(label); else note(`${label}: ${r.status}`);
  }
}

/* ── 2. record the supply-chain responses, then extract ──────────────────── */
console.log('\n2. record the responses and extract the relationships');
const supplyEvidence = await call(`${O}/evidence/list`, as(collectionManager, {
  action: 'observation.read.evidence', objectType: 'EVD', sideEffect: 'none', consequence: 'C1',
  purposeId: 'observation',
}), { sourceId: supplySource.source_id, limit: 100 }, collectionManager.token);
const units = [];
for (const e of (supplyEvidence.body.evidence ?? []).slice(0, 40)) {
  const got = await call(`${O}/evidence/${e.object_id}/download`, as(collectionManager, {
    action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: e.object_id,
    purposeId: 'observation',
  }), {}, collectionManager.token);
  const b64 = got.body?.download?.base64 ?? null;
  if (typeof b64 !== 'string') continue;
  units.push({
    itemKey: String(e.payload?.locator ?? e.object_id),
    contentDigest: String(e.payload?.content_digest ?? ''),
    excerpt: Buffer.from(b64, 'base64').toString('utf8').slice(0, 8000),
  });
}
note(`${units.length} supply-chain evidence unit(s)`);
const fixtures = buildFixtures(units);
if (fixtures.length > 0) {
  const rec = await call(`${I}/gateway/record`, as(extractionManager, {
    action: 'intelligence.gateway.call', objectType: 'GWC', purposeId: 'intelligence',
  }), { recordings: fixtures.map((f) => ({
    requestDigest: f.request_digest, response: f.response,
    modelId: f.model_id, runtimeVersion: f.runtime_version,
  })) }, extractionManager.token);
  if (rec.status < 400) {
    ok(`${rec.body.recordings.stored} recorded, ${rec.body.recordings.existing} already present`);
  } else bad(`recording refused (${rec.status}) ${JSON.stringify(rec.body).slice(0, 200)}`);
}
if (supplyMethodId !== null) {
  const run = await call(`${I}/extract`, as(extractionAgent, {
    action: 'intelligence.claim.admit', objectType: 'CLM', purposeId: 'intelligence',
  }), { methodId: supplyMethodId, limit: 40 }, extractionAgent.token);
  if (run.status < 400) {
    const x = run.body.extraction;
    ok(`run ${x.runId.slice(0, 8)}… mode=${x.mode} state=${x.state}`);
    console.log(`      evidence read ${x.evidenceRead} · claims ${x.claimsAdmitted} · abstentions ${x.abstentions} · idempotent ${x.idempotentHits}`);
  } else bad(`extraction refused (${run.status}) ${JSON.stringify(run.body).slice(0, 250)}`);
}

/* ── 3. the identifier system ────────────────────────────────────────────── */
console.log('\n3. register the PortWatch identifier system as authoritative (as s.larsen)');
const sys = await call(`${G}/entities/identifier-systems/register`, as(resolutionManager, {
  action: 'graph.entity.create', objectType: 'IDS',
}), {
  systemKey: 'imf_portwatch',
  authority: 'International Monetary Fund — PortWatch',
  description: 'PortWatch chokepoint identifiers, printed in the publisher’s own rows',
  isAuthoritative: true,
}, resolutionManager.token);
if (sys.status < 400) {
  ok('imf_portwatch registered — an exact match on it is the ONLY automatic resolution');
} else bad(`registration refused (${sys.status}) ${JSON.stringify(sys.body).slice(0, 200)}`);

/* ── 4. resolve ──────────────────────────────────────────────────────────── */
console.log('\n4. resolve mentions to entities (as k.adeyemi, the agent)');
const resolveRun = await call(`${G}/entities/resolve`, as(resolutionAgent, {
  action: 'graph.resolution.propose', objectType: 'RES',
}), { limit: 300, methodId: null }, resolutionAgent.token);
if (resolveRun.status < 400) {
  const x = resolveRun.body.resolution;
  ok(`run ${x.runId.slice(0, 8)}… read ${x.mentionsRead} mention(s)`);
  console.log(`      resolved automatically ${x.autoResolved} (authoritative identifier only)`);
  console.log(`      sent to a person      ${x.proposed}`);
  console.log(`      entities created      ${x.entitiesCreated}`);
  console.log(`      left unresolved       ${x.unresolved.length}`);
  for (const u of x.unresolved.slice(0, 3)) note(`unresolved "${u.mention}": ${u.reason}`);
  if (x.autoResolved === 0) bad('nothing resolved on an identifier — the corridor claims carry none');
} else bad(`resolver refused (${resolveRun.status}) ${JSON.stringify(resolveRun.body).slice(0, 250)}`);

/* ── 5. a person decides the queue ───────────────────────────────────────── */
console.log('\n5. a person decides the queue (as s.larsen, who did not propose any of it)');
const entitiesNow = await call(`${G}/entities/list`, as(resolutionManager, {
  action: 'graph.read', objectType: 'ENT', sideEffect: 'none', consequence: 'C1',
}), {}, resolutionManager.token);
const allEntities = entitiesNow.body.entities ?? [];
/*
 * THE CORRIDOR ENTITY, CHOSEN FROM THE DATA RATHER THAN NAMED IN ADVANCE.
 *
 * It is the place the PortWatch identifier resolved automatically and that the
 * most mentions landed on. Hard-coding a name here would make the demonstration
 * depend on which chokepoints the frozen replay set happens to cover, which is a
 * property of the fixture rather than of the product.
 */
const corridorEntity = allEntities
  .filter((e) => e.entity_type === 'place' && Number(e.mention_count ?? 0) > 0)
  .sort((a, b) => Number(b.mention_count ?? 0) - Number(a.mention_count ?? 0))[0];
if (corridorEntity === undefined) bad('no corridor entity resolved automatically');
else ok(`corridor entity: ${corridorEntity.canonical_name} (${corridorEntity.mention_count} mention(s) from the publisher's own rows)`);

const queue = await call(`${G}/resolutions/queue`, as(resolutionManager, {
  action: 'graph.read', objectType: 'RES', sideEffect: 'none', consequence: 'C1',
}), {}, resolutionManager.token);
const pending = queue.body.queue ?? [];
note(`${pending.length} candidate(s) waiting`);

// THE AGENT MAY NOT DO WHAT THE MANAGER IS ABOUT TO DO. Probed first, while
// there is still something in the queue to attempt it on.
const probe = pending[0];
if (probe !== undefined) {
  const refused = await call(`${G}/resolutions/${probe.resolution_id}/decide`, as(resolutionAgent, {
    action: 'graph.resolution.decide', objectType: 'RES', objectId: probe.resolution_id,
  }), { decision: 'accept', reason: 'an agent trying to clear its own work' },
  resolutionAgent.token);
  if (refused.status >= 400) ok('the resolution agent was refused the decision (policy bundle)');
  else bad('an agent decided a resolution — the separation is not holding');
}

let retargeted = 0; let accepted = 0;
for (const q of pending) {
  /*
   * THE REDIRECTION THE RESOLVER COULD NOT MAKE.
   *
   * The manifest writes "Suez"; the publisher writes "Suez Canal". No string
   * comparison was ever going to join those, and rule 2 forbids guessing. A
   * person who knows the domain says they are the same corridor — and the record
   * then says a PERSON said so, with their reason, keeping the resolver's own
   * proposal alongside it.
   */
  const mention = String(q.mention_text).toLowerCase();
  const corridorName = String(corridorEntity?.canonical_name ?? '').toLowerCase();
  const retarget = corridorEntity !== undefined && mention.length >= 3
    && corridorName.startsWith(mention) && mention !== corridorName
    && q.entity_id !== corridorEntity.entity_id;
  const r = await call(`${G}/resolutions/${q.resolution_id}/decide`, as(resolutionManager, {
    action: 'graph.resolution.decide', objectType: 'RES', objectId: q.resolution_id,
  }), {
    decision: 'accept',
    reason: retarget
      ? `the shipping manifest's "${q.mention_text}" is the corridor the PortWatch source `
        + `already tracks as "${corridorEntity.canonical_name}"`
      : 'the mention and the proposed entity are the same thing; checked against the record',
    ...(retarget ? { targetEntityId: corridorEntity.entity_id } : {}),
  }, resolutionManager.token);
  if (r.status < 400) { accepted += 1; if (retarget) retargeted += 1; }
  else note(`refused for "${q.mention_text}": ${r.status}`);
}
ok(`${accepted} accepted by a person, ${retargeted} of them redirected onto a different entity`);


/* ── 6. build the edges ──────────────────────────────────────────────────── */
console.log('\n6. build edges from the relationship claims (as k.adeyemi)');
const edgeRun = await call(`${G}/edges/build`, as(resolutionAgent, {
  action: 'graph.edge.assert', objectType: 'EDG',
}), { limit: 300 }, resolutionAgent.token);
if (edgeRun.status < 400) {
  const x = edgeRun.body.edgeBuild;
  ok(`${x.edgesAsserted} edge(s) from ${x.relClaimsRead} relationship claim(s)`);
  for (const s of x.skipped.slice(0, 3)) note(`skipped: ${s.reason}`);
} else bad(`edge build refused (${edgeRun.status}) ${JSON.stringify(edgeRun.body).slice(0, 250)}`);

/* ── 7. explore, and ask what we knew BEFORE we knew it ──────────────────── */
console.log('\n7. the graph, and the graph as it stood');
const nowEdges = await call(`${G}/edges/list`, as(resolutionManager, {
  action: 'graph.read', objectType: 'EDG', sideEffect: 'none', consequence: 'C1',
}), {}, resolutionManager.token);
const visibleNow = (nowEdges.body.edges ?? []).length;
ok(`${visibleNow} edge(s) visible now (known at ${nowEdges.body.asOf?.knownAt})`);
const beforeAnything = '2024-01-01T00:00:00.000Z';
const thenEdges = await call(`${G}/edges/list`, as(resolutionManager, {
  action: 'graph.read', objectType: 'EDG', sideEffect: 'none', consequence: 'C1',
}), { knownAt: beforeAnything, validAt: beforeAnything }, resolutionManager.token);
const visibleThen = (thenEdges.body.edges ?? []).length;
if (visibleThen === 0) ok('and 0 edge(s) visible at 1 January 2024 — no hindsight');
else bad(`${visibleThen} edge(s) were visible before they were asserted`);

if (corridorEntity !== undefined) {
  const nb = await call(`${G}/neighbourhood`, as(resolutionManager, {
    action: 'graph.read', objectType: 'EDG', sideEffect: 'none', consequence: 'C1',
  }), { entityId: corridorEntity.entity_id, depth: 4 }, resolutionManager.token);
  if (nb.status < 400) {
    const n = nb.body.neighbourhood;
    ok(`from the corridor, ${n.entities.length} entity(ies) within 4 hops`);
    console.log(`      ${n.entities.map((e) => e.canonical_name).join(' · ')}`);
  }
}

/* ── 8. the Strategy Graph ───────────────────────────────────────────────── */
console.log('\n8. declare what the corridor decision rests on (as j.weber)');
const existingStrategy = await call(`${G}/strategy/list`, as(strategyOwner, {
  action: 'graph.read', objectType: 'OBJ', sideEffect: 'none', consequence: 'C1',
}), {}, strategyOwner.token);
const already = existingStrategy.body.strategy ?? [];
const findByTitle = (t) => already.find((x) => x.title === t);

async function declare(payload) {
  const found = findByTitle(payload.title);
  if (found !== undefined) { ok(`${payload.objectType} "${payload.title}" already declared`); return found.strategy_object_id; }
  const r = await call(`${G}/strategy/declare`, as(strategyOwner, {
    action: 'graph.strategy.declare', objectType: payload.objectType,
  }), payload, strategyOwner.token);
  if (r.status < 400) { ok(`${payload.objectType} "${payload.title}"`); return r.body.strategy.objectId; }
  bad(`${payload.objectType} refused (${r.status}) ${JSON.stringify(r.body).slice(0, 200)}`);
  return null;
}

let objectiveId = null; let assumptionId = null; let commitmentId = null;
if (corridorEntity !== undefined) {
  const corridor = corridorEntity.canonical_name;
  objectiveId = await declare({
    objectType: 'OBJ',
    title: 'Keep the Regensburg line supplied through Q1',
    statement: 'No production stoppage at Regensburg before 31 March 2024.',
    status: 'active',
    restsOn: [{ kind: 'entity', id: corridorEntity.entity_id,
                rationale: `the ${corridor} corridor every inbound shipment passes through` }],
  });
  if (objectiveId !== null) {
    assumptionId = await declare({
      objectType: 'ASU',
      title: `The ${corridor} corridor stays open`,
      statement: `Transits through ${corridor} continue at a level that clears our bookings.`,
      status: 'active',
      restsOn: [
        { kind: 'entity', id: corridorEntity.entity_id,
          rationale: 'this assumption is about the corridor entity itself' },
        { kind: 'strategy', id: objectiveId,
          rationale: 'the assumption is held in service of the supply objective' },
      ],
    });
  }
  if (assumptionId !== null) {
    commitmentId = await declare({
      objectType: 'CMT',
      title: 'Hold the booked routing for the third shipment',
      statement: 'Do not book the third shipment the long way round before 20 January 2024.',
      status: 'active',
      restsOn: [{ kind: 'strategy', id: assumptionId,
                  rationale: 'the commitment is only sound while the corridor assumption holds' }],
    });
  }
}

/* ── 9. correct the evidence, and see what it reaches ────────────────────── */
console.log('\n9. the publisher corrects the corridor series — and the graph says what that touches');
const corridorSource = (sourcesList.body.sources ?? [])
  .find((x) => x.source_key === 'imf-portwatch-chokepoints');
let caseId = null;
if (corridorSource !== undefined) {
  const corridorEvidence = await call(`${O}/evidence/list`, as(collectionManager, {
    action: 'observation.read.evidence', objectType: 'EVD', sideEffect: 'none', consequence: 'C1',
    purposeId: 'observation',
  }), { sourceId: corridorSource.source_id, limit: 20 }, collectionManager.token);
  const affected = (corridorEvidence.body.evidence ?? []).slice(0, 3).map((e) => e.object_id);
  const opened = await call(`${O}/corrections/submit`, as(operator, {
    action: 'observation.correction.receive', objectType: 'COR', purposeId: 'observation',
  }), {
    sourceId: corridorSource.source_id, kind: 'correction', channel: 'publisher re-publication',
    publisherRef: 'PortWatch chokepoints @ restated series',
    reason: 'the publisher restated the transit series for the corridor window',
    affectedEvdIds: affected,
  }, operator.token);
  if (opened.status < 400) {
    caseId = opened.body.correction.caseId;
    ok(`correction case ${caseId.slice(0, 8)}… opened`);
    const applied = await call(`${O}/corrections/${caseId}/apply`, as(collectionManager, {
      action: 'observation.correction.apply', objectType: 'COR', objectId: caseId,
      purposeId: 'observation',
    }), { decision: 'apply', affectedEvdIds: affected,
          reason: 'restatement verified against the publisher' }, collectionManager.token);
    if (applied.status < 400) {
      const c = applied.body.correction;
      ok(`applied — ${(c.superseded ?? []).length} object(s) superseded`);
      note(`Phase 1 still says: "${c.propagationScope?.unresolved}"`);
    } else bad(`apply refused (${applied.status}) ${JSON.stringify(applied.body).slice(0, 200)}`);
  } else bad(`correction refused (${opened.status}) ${JSON.stringify(opened.body).slice(0, 200)}`);
}

// The claim the assumption rests on, through the entity it resolved to.
let triggerClaim = null;
if (corridorEntity !== undefined) {
  const ent = await call(`${G}/entities/${corridorEntity.entity_id}/get`, as(resolutionManager, {
    action: 'graph.read', objectType: 'ENT', objectId: corridorEntity.entity_id,
    sideEffect: 'none', consequence: 'C1',
  }), {}, resolutionManager.token);
  triggerClaim = (ent.body.mentions ?? [])[0]?.claim_object_id ?? null;
}

if (triggerClaim !== null) {
  const preview = await call(`${G}/impact/preview`, as(strategyOwner, {
    action: 'graph.read', objectType: 'INV', objectId: triggerClaim,
    sideEffect: 'none', consequence: 'C1',
  }), { triggerObjectId: triggerClaim, triggerKind: 'claim_correction' }, strategyOwner.token);
  if (preview.status < 400) {
    const p = preview.body.impact;
    ok(`preview: ${p.assumptions.length} assumption(s), ${p.objectives.length} objective(s), ${p.commitments.length} commitment(s)`);
  }
  const prop = await call(`${G}/impact/propagate`, as(strategyOwner, {
    action: 'graph.impact.propagate', objectType: 'INV', objectId: triggerClaim,
  }), {
    triggerObjectId: triggerClaim, triggerKind: 'claim_correction', correctionCaseId: caseId,
  }, strategyOwner.token);
  if (prop.status < 400) {
    const p = prop.body.impact;
    ok(`propagated — ${p.statement}`);
    for (const a of p.assumptions) console.log(`      assumption unverified: ${a.title} (${a.reached_via})`);
    for (const o of p.objectives) console.log(`      objective reported:    ${o.title}`);
    for (const c of p.commitments) console.log(`      commitment reported:   ${c.title}`);
    if (p.assumptions.length === 0) bad('nothing was reported — the dependency graph did not connect');
  } else bad(`propagation refused (${prop.status}) ${JSON.stringify(prop.body).slice(0, 250)}`);
}

/* ── 10. the sentence Phase 1 could not write ────────────────────────────── */
if (caseId !== null) {
  console.log('\n10. what the correction case says now');
  const got = await call(`${O}/corrections/${caseId}/get`, as(collectionManager, {
    action: 'observation.read.corrections', objectType: 'COR', objectId: caseId,
    sideEffect: 'none', consequence: 'C1', purposeId: 'observation',
  }), {}, collectionManager.token);
  const stored = got.body?.case ?? null;
  const sentence = stored === null ? null : String(stored.propagation_unresolved ?? '');
  if (sentence !== null && !sentence.includes('not yet present')) {
    ok(`"${sentence}"`);
  } else if (sentence !== null) {
    bad(`the case still says "${sentence}"`);
  } else note('the correction case could not be read back');
}

/* ── 11. projections ─────────────────────────────────────────────────────── */
console.log('\n11. every graph projection is derivable from its event log');
const proj = await call(`${G}/projections/verify`, as(resolutionManager, {
  action: 'graph.read', objectType: 'ENT', sideEffect: 'none', consequence: 'C1',
}), {}, resolutionManager.token);
if (proj.status < 400) {
  for (const p of proj.body.projections) {
    const drift = Number(p.mismatched);
    if (drift === 0) ok(`${p.projection}: ${p.live_rows} row(s), no drift`);
    else bad(`${p.projection}: ${drift} row(s) drifted from the event log`);
  }
} else bad(`projection verification refused (${proj.status})`);

console.log(`\n=== act III complete — ${failures} problem(s) ===\n`);
process.exit(failures === 0 ? 0 : 1);
