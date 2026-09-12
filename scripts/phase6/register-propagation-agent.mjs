#!/usr/bin/env node
/**
 * CP-6 batch B1 on the demonstration (NORDWERK, eye_demo): the CorrectionApplied consumer.
 *
 *   1. the awaiting queue as it stands — applied corrections nothing has propagated;
 *   2. the platform administrator registers the domain's PROPAGATION AGENT (an agent principal
 *      with the propagation_agent role, a revocable grant owned by the strategy owner), with the
 *      backlog policy 'walk' so the outstanding cases are re-driven at once — the 2,133-object
 *      supersession is refused by the agent's budget and stays operator work, honestly labelled;
 *   3. the live act: the publisher corrects one more piece of evidence the corridor forecast rests
 *      on, submitted by the operator and applied by the collection manager through the governed
 *      route — and NOBODY calls /impact/propagate;
 *   4. within the publisher's tick the agent walks it: the invalidation is opened by the agent's
 *      principal, the case is complete, the forecast is marked for attention, the attempt names
 *      the agent instance;
 *   5. the operator route is unchanged: the strategy owner walks the same root again.
 *
 * Nothing is purchased, collected or changed in any contract, cadence or budget. Idempotent on the
 * registration (a second run reuses the active agent).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const strategyOwner = await login('j.weber', PW);
const collectionManager = await login('m.dvorak', PW);
const operator = await login('a.hoffmann', PW);
const forecastOwner = await login('n.eriksen', PW);
if (!strategyOwner || !collectionManager || !operator || !forecastOwner) { console.error('operator authentication failed'); process.exit(1); }
const G = `/v1/tenants/${T}/domains/${D}/graph`;
const O = `/v1/tenants/${T}/domains/${D}/observation`;
const P = `/v1/tenants/${T}/domains/${D}/prediction`;
const adm = (over) => as(admin, scope, { purposeId: 'platform.administration', ...over });
const so = (over) => as(strategyOwner, scope, { purposeId: 'graph', ...over });
const cm = (over) => as(collectionManager, scope, { purposeId: 'observation', ...over });
const op = (over) => as(operator, scope, { purposeId: 'observation', ...over });
const fo = (over) => as(forecastOwner, scope, { purposeId: 'prediction', ...over });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => `${String(id).slice(0, 8)}…`;

const awaiting = async () => (await call(`${G}/impact/awaiting`, so({ action: 'graph.read', objectType: 'COR', sideEffect: 'none' }), { limit: 200 }, strategyOwner.token)).body;
const status = async () => (await call(`${G}/impact/propagation/status`, so({ action: 'graph.read', objectType: 'AGT', sideEffect: 'none' }), {}, strategyOwner.token)).body.propagation;

console.log('\n=== CP-6 batch B1 · the CorrectionApplied consumer on the demonstration ===\n');

/* ── 1. the queue before ─────────────────────────────────────────────────── */
console.log('1. applied corrections whose propagation is not complete');
const before = await awaiting();
note(`${before.total} outstanding; note: ${before.note}`);
for (const c of before.awaiting ?? []) {
  const roots = Array.isArray(c.affected_resolved) ? c.affected_resolved.length : '?';
  note(`case ${short(c.case_id)} (${c.kind}, ${roots} corrected object(s)) — ${c.propagation_state}; automatic: ${c.automatic === null ? 'never seen by the consumer' : `${c.automatic.state}${c.automatic.last_error ? ` — ${c.automatic.last_error}` : ''}`}`);
}

/* ── 2. the agent ────────────────────────────────────────────────────────── */
console.log('\n2. the propagation agent');
let st = await status();
let agent = (st?.agents ?? []).find((a) => a.status === 'active') ?? null;
if (agent !== null) ok(`propagation agent already active (${short(agent.agent_id)}, walker ${st.walker.version} ${st.walker.codeDigest.slice(0, 12)}…)`);
else {
  const r = await call(`${G}/impact/propagation/agents/register`, adm({ action: 'graph.propagation.agent.register', objectType: 'AGT', consequence: 'C2' }),
    { ownerPrincipalId: strategyOwner.principalId, backlog: 'walk' }, admin.token);
  if (!r.ok) { bad(`registration refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`); process.exit(1); }
  const a = r.body.agent;
  ok(`registered: agent ${short(a.agentId)}, principal ${short(a.principalId)} (role ${a.role}), walker ${a.walker.name}@${a.walker.version} ${a.walker.codeDigest.slice(0, 12)}…, budgets ${JSON.stringify(a.budgets)}`);
  note(`served at once: worker running ${r.body.served.workerRunning}; ${r.body.served.reDriven} outstanding event(s) re-driven from the backlog`);
  st = await status();
  agent = (st.agents ?? []).find((x) => x.status === 'active');
}
if (!st.runtime.worker_running) bad('this process runs no worker for the domain queue');
else ok(`the domain queue ${st.runtime.redis_queue} is served by this process (scheduler enabled: ${st.runtime.scheduler_enabled})`);

// The backlog: wait for the re-driven attempts to finish (the budget refusal is immediate; a walk takes seconds per root).
let attempts = [];
for (let i = 0; i < 120; i += 1) {
  attempts = (await status()).attempts ?? [];
  if (attempts.length > 0 && attempts.every((a) => ['complete', 'partial', 'failed'].includes(a.state))) break;
  await sleep(1000);
}
console.log('\n   the backlog, as the consumer left it:');
for (const a of attempts) note(`case ${short(a.case_id)} event ${short(a.event_id)}: ${a.state} after ${a.deliveries} delivery(ies), ${a.attempts} walk(s); roots ${Array.isArray(a.roots) ? a.roots.length : '?'}, walked ${Array.isArray(a.roots_walked) ? a.roots_walked.length : '?'}${a.last_error ? ` — ${a.last_error}` : ''}`);
const budgetRefused = attempts.filter((a) => a.state === 'failed' && /max_roots_per_event/.test(a.last_error ?? ''));
if (budgetRefused.length > 0) ok(`${budgetRefused.length} case(s) refused by the agent's budget and left, labelled, for operator-initiated propagation`);
const mid = await awaiting();
note(`${mid.total} outstanding after the backlog; each carries its automatic state`);

/* ── 3. the live act: a fresh correction, applied through the route, no propagate call ── */
console.log('\n3. the live act — the publisher restates evidence the corridor forecast rests on');
const forecasts = await call(`${P}/forecasts/list`, fo({ action: 'prediction.read', objectType: 'FCT', sideEffect: 'none' }), {}, forecastOwner.token);
const corridor = (forecasts.body.forecasts ?? []).find((f) => f.series_key === 'portwatch:chokepoint4:n_total');
if (corridor === undefined) { bad('no corridor forecast on the demonstration'); process.exit(1); }
const f = await call(`${P}/forecasts/${corridor.forecast_id}/get`, fo({ action: 'prediction.read', objectType: 'FCT', objectId: corridor.forecast_id, sideEffect: 'none' }), {}, forecastOwner.token);
const refs = f.body.forecast?.evidence_refs ?? [];
const evd = refs[refs.length - 1]?.evidence_object_id;
if (evd === undefined) { bad('the forecast names no evidence'); process.exit(1); }
const sources = await call(`${O}/sources/list`, cm({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, collectionManager.token);
const src = (sources.body.sources ?? []).find((s) => s.source_key === 'imf-portwatch-chokepoints');
const opened = await call(`${O}/corrections/submit`, op({ action: 'observation.correction.receive', objectType: 'COR' }), {
  sourceId: src.source_id, kind: 'correction', channel: 'publisher re-publication', publisherRef: 'PortWatch chokepoints @ restated transit count (B1 act)',
  reason: 'the publisher restated one more day of the corridor series the forecast was fitted on', affectedEvdIds: [evd],
}, operator.token);
if (!opened.ok) { bad(`correction refused (${opened.status}) ${opened.body?.message ?? ''}`); process.exit(1); }
const caseId = opened.body.correction.caseId;
const t0 = Date.now();
const applied = await call(`${O}/corrections/${caseId}/apply`, cm({ action: 'observation.correction.apply', objectType: 'COR', objectId: caseId }),
  { decision: 'apply', affectedEvdIds: [evd], reason: 'restatement verified against the publisher' }, collectionManager.token);
if (!applied.ok) { bad(`apply refused (${applied.status}) ${applied.body?.message ?? ''}`); process.exit(1); }
ok(`correction case ${short(caseId)} applied by the collection manager: evidence ${short(evd)} superseded — nobody calls /impact/propagate`);

/* ── 4. the agent walks it ───────────────────────────────────────────────── */
console.log('\n4. the automatic walk');
let attempt = null;
for (let i = 0; i < 90; i += 1) {
  attempt = ((await status()).attempts ?? []).find((a) => a.case_id === caseId) ?? null;
  if (attempt !== null && ['complete', 'partial', 'failed'].includes(attempt.state)) break;
  await sleep(1000);
}
if (attempt === null) bad('the consumer never received the CorrectionApplied event');
else {
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (attempt.state === 'complete') ok(`walked automatically ${secs}s after the apply: attempt ${attempt.state}, ${attempt.deliveries} delivery, ${attempt.attempts} walk, agent ${short(attempt.agent_id)} (principal ${short(attempt.principal_id)})`);
  else bad(`attempt ${attempt.state}: ${attempt.last_error ?? ''}`);
  const walked = Array.isArray(attempt.roots_walked) ? attempt.roots_walked : [];
  const invId = walked[0]?.invalidation_id;
  const inv = await call(`${G}/impact/list`, so({ action: 'graph.read', objectType: 'INV', sideEffect: 'none' }), { limit: 50 }, strategyOwner.token);
  const row = (inv.body.invalidations ?? []).find((x) => x.invalidation_id === invId);
  if (row === undefined) bad('the attempt names no invalidation on the impact list');
  else {
    if (row.opened_by === attempt.principal_id && row.correction_case_id === caseId && row.trigger_kind === 'evidence_correction' && row.state === 'assessed') ok(`invalidation ${short(invId)} opened by the AGENT's principal, linked to the case, assessed: ${row.statement}`);
    else bad(`invalidation ${short(invId)}: opened_by ${short(row.opened_by)}, case ${short(row.correction_case_id)}, ${row.trigger_kind}, ${row.state}`);
    const reached = (row.affected_forecasts ?? []).map((x) => x.forecast_id);
    if (reached.includes(corridor.forecast_id)) ok('the corridor forecast was reached and marked for attention'); else note(`forecasts reached: ${reached.length}`);
  }
  const c = await call(`${O}/corrections/${caseId}/get`, cm({ action: 'observation.read.corrections', objectType: 'COR', objectId: caseId, sideEffect: 'none' }), {}, collectionManager.token);
  const cs = c.body.case ?? c.body.correction ?? c.body;
  if (cs?.propagation_state === 'complete') ok(`the case reads propagation complete: ${cs.propagation_unresolved}`); else bad(`the case reads propagation ${cs?.propagation_state}`);
  const after = await awaiting();
  if (!(after.awaiting ?? []).some((x) => x.case_id === caseId)) ok('the case is no longer in the awaiting queue'); else bad('the case is still listed as awaiting');
  const fa = await call(`${P}/forecasts/${corridor.forecast_id}/get`, fo({ action: 'prediction.read', objectType: 'FCT', objectId: corridor.forecast_id, sideEffect: 'none' }), {}, forecastOwner.token);
  const a = fa.body.forecast;
  if (a?.attention_state === 'assumption_unverified') ok(`the forecast says: ${a.attention_reason}`); else bad(`the forecast's attention state is ${a?.attention_state}`);
}

/* ── 5. the operator route is unchanged ──────────────────────────────────── */
console.log('\n5. the operator route');
const prop = await call(`${G}/impact/propagate`, so({ action: 'graph.impact.propagate', objectType: 'INV', objectId: evd }),
  { triggerObjectId: evd, triggerKind: 'evidence_correction', correctionCaseId: caseId }, strategyOwner.token);
if (!prop.ok) bad(`the operator's walk was refused (${prop.status}) ${prop.body?.message ?? ''}`);
else {
  ok(`the strategy owner may still walk the same root: invalidation ${short(prop.body.impact.invalidationId)} — ${prop.body.impact.statement}`);
  const c = await call(`${O}/corrections/${caseId}/get`, cm({ action: 'observation.read.corrections', objectType: 'COR', objectId: caseId, sideEffect: 'none' }), {}, collectionManager.token);
  const cs = c.body.case ?? c.body.correction ?? c.body;
  if (cs?.propagation_state === 'complete') ok('the case stays complete'); else bad(`the case reads ${cs?.propagation_state} after the operator's walk`);
}
const fin = await awaiting();
note(`${fin.total} case(s) remain outstanding, each labelled with its automatic state; the operator route remains available for them`);
process.exit(failureCount() === 0 ? 0 : 1);
