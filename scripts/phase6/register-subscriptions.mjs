#!/usr/bin/env node
/**
 * CP-6 batch B6 on the demonstration (NORDWERK, eye_demo): GraphChanged / MemoryCorrected subscriptions.
 *
 *   1. the platform administrator registers the domain's SIX SUBSCRIBERS — twins, forecasts, scenarios,
 *      decisions, retrieval, memory mappings — each an agent principal of its own role, a revocable
 *      subscription owned by the strategy owner (backlog left: past events are not replayed here);
 *   2. the live act: the publisher restates one more piece of evidence the corridor forecast rests on,
 *      submitted by the operator and applied by the collection manager through the governed route — and
 *      NOBODY marks a twin, a forecast, a scenario or a decision;
 *   3. within the publisher's tick the apply's MemoryCorrected event is delivered to every subscriber,
 *      each under its own session and action: the delivery ledger shows six applied deliveries with their
 *      items and effects, the retrieval check is recorded, any mapping whose basis moved is PROPOSED;
 *   4. a graph change: the strategy owner retracts an edge the graph rests on — GraphChanged is delivered
 *      the same way, and its payload carries the identities, the edge with its intervals, the reach, the
 *      temporal scope, the subscriptions live at publication and the cause;
 *   5. the ledger, the proposals and the checks are read back through the governed status route.
 *
 * Nothing is purchased, collected or changed in any contract, cadence or budget. Idempotent on the
 * registrations (a second run reuses the active subscriptions).
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
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings'];

const status = async () => (await call(`${G}/subscriptions/status`, so({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, strategyOwner.token)).body.subscriptions;
const deliveryOf = async (eventId) => (await call(`${G}/subscriptions/deliveries/${eventId}/get`, so({ action: 'graph.read', objectType: 'SUB', objectId: eventId, sideEffect: 'none' }), {}, strategyOwner.token)).body;
const showDeliveries = (ds) => { for (const d of ds) note(`${d.consumer_kind.padEnd(16)} ${d.state.padEnd(9)} deliveries ${d.deliveries}, attempts ${d.attempts}, items ${JSON.stringify(d.items)} → ${(d.items_applied ?? []).map((x) => x.effect).join(', ') || '(nothing to do)'}${d.last_error ? ` — ${d.last_error}` : ''}`); };
/** Wait for every delivery of an event to be terminal. */
async function settled(eventId, seconds = 90) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = (await deliveryOf(eventId)).deliveries ?? [];
    if (ds.length === 6 && ds.every((d) => ['applied', 'failed', 'refused'].includes(d.state))) return ds;
    await sleep(1000);
  }
  return ds;
}
/** The newest published outbox row of a type and change kind after a mark, through the status route's recent deliveries. */
async function newestEvent(eventType, changeKind, notBefore) {
  for (let i = 0; i < 90; i += 1) {
    const s = await status();
    const d = (s.deliveries ?? []).find((x) => x.event_type === eventType && x.change_kind === changeKind && new Date(x.outbox_created_at).getTime() >= notBefore);
    if (d !== undefined) return d.event_id;
    await sleep(1000);
  }
  return null;
}

console.log('\n=== CP-6 batch B6 · GraphChanged / MemoryCorrected subscriptions on the demonstration ===\n');

/* ── 1. the six subscribers ─────────────────────────────────────────────── */
console.log('1. the subscribers');
let st = await status();
for (const kind of KINDS) {
  const live = (st.subscriptions ?? []).find((s) => s.consumer_kind === kind && s.status === 'active');
  if (live !== undefined) { ok(`${kind}: subscription ${short(live.subscription_id)} already active (consumer ${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…)`); continue; }
  const r = await call(`${G}/subscriptions/register`, adm({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }),
    { consumerKind: kind, ownerPrincipalId: strategyOwner.principalId, backlog: 'leave' }, admin.token);
  if (!r.ok) { bad(`${kind}: registration refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`); continue; }
  const s = r.body.subscription;
  ok(`${kind}: registered subscription ${short(s.subscriptionId)}, principal ${short(s.principalId)} (role ${s.role}), consumer ${s.consumer.version} ${s.consumer.codeDigest.slice(0, 12)}…, budgets ${JSON.stringify(s.budgets)}; worker running ${r.body.served.workerRunning}`);
}
st = await status();
const consumers = (st.consumers ?? []).filter((c) => c.registeredInThisProcess).map((c) => c.kind);
if (consumers.length === 6) ok('all six consumers are registered into the dispatcher by their own modules'); else bad(`consumers registered in this process: ${consumers.join(', ')}`);
if (st.runtime.worker_running) ok(`the domain queue ${st.runtime.redis_queue} is served by this process`); else bad('this process runs no worker for the domain subscription queue');

/* ── 2. the live act: a fresh correction applied through the route ───────── */
console.log('\n2. the live act — the publisher restates evidence the corridor forecast rests on');
const forecasts = await call(`${P}/forecasts/list`, fo({ action: 'prediction.read', objectType: 'FCT', sideEffect: 'none' }), {}, forecastOwner.token);
const corridor = (forecasts.body.forecasts ?? []).find((f) => f.series_key === 'portwatch:chokepoint4:n_total');
if (corridor === undefined) { bad('no corridor forecast on the demonstration'); process.exit(1); }
const f = await call(`${P}/forecasts/${corridor.forecast_id}/get`, fo({ action: 'prediction.read', objectType: 'FCT', objectId: corridor.forecast_id, sideEffect: 'none' }), {}, forecastOwner.token);
const refs = f.body.forecast?.evidence_refs ?? [];
const evd = refs[Math.max(0, refs.length - 2)]?.evidence_object_id ?? refs[refs.length - 1]?.evidence_object_id;
if (evd === undefined) { bad('the forecast names no evidence'); process.exit(1); }
const sources = await call(`${O}/sources/list`, cm({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, collectionManager.token);
const src = (sources.body.sources ?? []).find((s) => s.source_key === 'imf-portwatch-chokepoints');
const t0 = Date.now();
const opened = await call(`${O}/corrections/submit`, op({ action: 'observation.correction.receive', objectType: 'COR' }), {
  sourceId: src.source_id, kind: 'correction', channel: 'publisher re-publication', publisherRef: 'PortWatch chokepoints @ restated transit count (B6 act)',
  reason: 'the publisher restated one more day of the corridor series the forecast was fitted on', affectedEvdIds: [evd],
}, operator.token);
if (!opened.ok) { bad(`correction refused (${opened.status}) ${opened.body?.message ?? ''}`); process.exit(1); }
const caseId = opened.body.correction.caseId;
const applied = await call(`${O}/corrections/${caseId}/apply`, cm({ action: 'observation.correction.apply', objectType: 'COR', objectId: caseId }),
  { decision: 'apply', affectedEvdIds: [evd], reason: 'restatement verified against the publisher' }, collectionManager.token);
if (!applied.ok) { bad(`apply refused (${applied.status}) ${applied.body?.message ?? ''}`); process.exit(1); }
ok(`correction case ${short(caseId)} applied by the collection manager: evidence ${short(evd)} superseded — nobody marks anything`);

/* ── 3. MemoryCorrected delivered to the six ──────────────────────────────── */
console.log('\n3. MemoryCorrected — delivered to every subscriber within the publisher\'s tick');
const mc = await newestEvent('MemoryCorrected', 'evidence.corrected', t0 - 5000);
if (mc === null) bad('no MemoryCorrected delivery was recorded for the apply');
else {
  const ds = await settled(mc);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (ds.length === 6 && ds.every((d) => d.state === 'applied')) ok(`event ${short(mc)}: six deliveries applied ${secs}s after the apply`); else bad(`event ${short(mc)}: ${ds.map((d) => `${d.consumer_kind}:${d.state}`).join(', ')}`);
  showDeliveries(ds);
  const ev = (await deliveryOf(mc)).events ?? [];
  note(`ledger events: ${ev.map((e) => e.event).join(' → ')}`);
  const fa = await call(`${P}/forecasts/${corridor.forecast_id}/get`, fo({ action: 'prediction.read', objectType: 'FCT', objectId: corridor.forecast_id, sideEffect: 'none' }), {}, forecastOwner.token);
  const a = fa.body.forecast;
  if (a?.attention_state === 'assumption_unverified') ok(`the corridor forecast says: ${a.attention_reason}`); else note(`the forecast's attention state is ${a?.attention_state} (the forecast consumer marks only an issued forecast whose basis this evidence is)`);
}

/* ── 4. a graph change: an edge retracted ─────────────────────────────────── */
console.log('\n4. GraphChanged — the strategy owner retracts an edge');
const edges = await call(`${G}/edges/list`, so({ action: 'graph.read', objectType: 'EDG', sideEffect: 'none' }), { limit: 50 }, strategyOwner.token);
const edge = (edges.body.edges ?? []).find((e) => e.state === 'asserted');
if (edge === undefined) note('no asserted edge on the demonstration to retract; the GraphChanged act is skipped');
else {
  const t1 = Date.now();
  const r = await call(`${G}/edges/${edge.edge_id}/retract`, so({ action: 'graph.edge.retract', objectType: 'EDG', objectId: edge.edge_id }),
    { reason: 'B6 act: the relationship is retracted to show the graph change reaching every subscriber' }, strategyOwner.token);
  if (!r.ok) bad(`retraction refused (${r.status}) ${r.body?.message ?? ''}`);
  else {
    ok(`edge ${short(edge.edge_id)} (${edge.predicate}) retracted`);
    const gc = await newestEvent('GraphChanged', 'edge.retracted', t1 - 5000);
    if (gc === null) bad('no GraphChanged delivery was recorded for the retraction');
    else {
      const ds = await settled(gc);
      if (ds.length === 6 && ds.every((d) => d.state === 'applied')) ok(`event ${short(gc)}: six deliveries applied ${((Date.now() - t1) / 1000).toFixed(1)}s after the retraction`); else bad(`event ${short(gc)}: ${ds.map((d) => `${d.consumer_kind}:${d.state}`).join(', ')}`);
      showDeliveries(ds);
    }
  }
}

/* ── 5. the ledger, read back ─────────────────────────────────────────────── */
console.log('\n5. the status route');
st = await status();
note(`${(st.subscriptions ?? []).length} subscription(s); ${(st.deliveries ?? []).length} recent deliveries; ${(st.retrieval_checks ?? []).length} retrieval check(s) (mismatched: ${(st.retrieval_checks ?? []).map((c) => c.mismatched).join(',') || '—'}); ${(st.mapping_reconciliations ?? []).length} mapping reconciliation(s) proposed`);
for (const m of (st.mapping_reconciliations ?? []).slice(0, 5)) note(`proposal ${short(m.reconciliation_id)} (${m.subject_kind} ${short(m.subject_id)}, ${m.state}): ${m.basis}`);
if (st.runtime.last_failure) note(`last dispatcher failure: ${st.runtime.last_failure.where} — ${st.runtime.last_failure.message}`);
process.exit(failureCount() === 0 ? 0 : 1);
