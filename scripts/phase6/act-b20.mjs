#!/usr/bin/env node
/**
 * CP-6 batch B20 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): INDEX-TIER
 * DEGRADATION — migration 0080. There is no lexical or vector index in this product: the index tier IS the six derived projections a
 * domain's reads serve from (entities, resolutions, edges, strategy, invalidations, memory items), each now a PARTITION with a state
 * (serving | withdrawn), a DERIVED watermark (the domain's latest GraphChanged/MemoryCorrected sequence — the revision; the sequence the
 * retrieval subscriber has VERIFIED through — the live contiguous applied prefix of its deliveries; the dispatcher's stored cursor beside
 * it; the lag; the unresolved deliveries) and a representation version. The retrieval check is SYMMETRIC (drifted, missing and poisoned
 * rows, an outdated representation) and WITHDRAWS every partition it fails; the operator withdraws on suspicion and REBUILDS — the only
 * way back to serving; every graph and memory read carries the projection block and, while a partition is withdrawn, serves the LAST
 * VALID STATE from the event log, labelled and constrained; a deletion whose safe scope reads a withdrawn partition PAUSES at execution;
 * a briefing over a withdrawn memory projection says degraded — exercised by the personas through the REAL HTTP path, each scene stating
 * the effect it produced in the ledgers and the outbox, and where nothing happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME by
 * SQL against the database the act is pointed at: no id is hard-coded.
 *
 *   0. THE STATE: the register through the route (36 bound / 14 partial / 0 unbound; L3-I02's bound_to names B20 (0080)); the strict check
 *      (/projections/verify) in the origin and the mirror printed as SEVEN columns per row — every row must read mismatched 0, missing 0,
 *      unexpected 0, representation_ok true (the design-time probe re-checked on the live database; a failing row STOPS the act before
 *      any withdrawal — C6: a policy drift found here is a finding to record, never an act); the six partitions of each domain.
 *   1. THE WATERMARK: the RETRIEVAL subscription of the origin and of the mirror checked against this process's consumer digest — the
 *      method changed in B20 (the symmetric check that withdraws), so the live one is REVOKED and the kind registered anew by the
 *      administrator with the same owner, the replacement REPLAYING FROM THE REVOKED CURSOR'S OWN EVENT (C1: a replay re-drives rows
 *      strictly after the point; a caught-up domain would replay nothing and leave the replacement with no applied check — unverified);
 *      the six other kinds LEFT (no method changed); the replayed deliveries settled; A. Hoffmann's search for NORDWERK and the explore
 *      neighbourhood of the NORDWERK entity print projection.condition current, the revision equal to the verified sequence, the
 *      checkpoint beside it, lag 0; the search's completeness flags; the mirror's entity listing by the administrator current.
 *   2. THE OPERATOR WITHDRAWS: the administrator (the platform-admin session acting in the origin — the demonstration has no
 *      domain_admin persona; no new persona) withdraws edges_current with the reason "representation review before the ontology
 *      proposal"; the neighbourhood (depth 4 asked) prints withdrawn, degraded, EYE-DEG-001, the label, bound.projection true,
 *      searchedDepth 2, depthClamped true; /edges/list prints its rows from the log (projected true, no drift — nothing drifted on the
 *      demonstration, said); /path bound.projection true; /overview edges from the log; the search stays current (the block names only
 *      the route's partitions — the search does not read edges, said); a second withdrawal is idempotent (a second reason recorded, no
 *      state change). THE DELETION: a deletable hot manifest looked up at run time, P. Novák's deletion opened, resolved and approved by
 *      H. Bergmann — the execution REFUSED (projection_withdrawn), the action PAUSED unresolved_dependency → human review, attempts 0,
 *      the approvals revoked. THE BRIEFING: S. Okafor continues the domain's newest briefing in its room — NOT degraded (the memory
 *      projection is serving: an edges withdrawal degrades no briefing, said), its projection block printed; L. Brandt's memory
 *      retrieval unaffected (index projected, current).
 *   3. THE REBUILD: the administrator rebuilds edges_current → RESTORED (updated 0, inserted 0, removed 0 — honest: nothing drifted),
 *      the check printed, representation 1; the ledger rows since the withdrawal; ONE GraphChanged/projection.rebuilt (no identities,
 *      no walk) and its deliveries settled (retrieval verified; the five others applied with nothing; the relationships subscriber
 *      selects MemoryCorrected/claim.corrected and receives no GraphChanged); the paused deletion resolved again and WITHDRAWN — never
 *      executed by the act; A. Hoffmann's reads current with the new verified sequence, the bound lifted.
 *   4. THE STATE: the partitions of both domains; the register; what the act leaves; the stated limits.
 *
 * EACH RUN re-registers the retrieval subscriptions of both domains only when their consumer identity is outdated (idempotent), withdraws
 * and restores edges_current of the origin once (three ledger rows), leaves one projection.rebuilt outbox row with its deliveries, one
 * deletion action withdrawn and one briefing. NO new persona. Nothing is retired. Nothing here prints a credential.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, as, ok, bad, note, failureCount, domainByName } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const R = `${X}/retention`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 8)}…`);
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
/** An instant from the DATABASE clock (the ledgers' occurred_at is the write transaction's clock; the act's own clock is not the record's). */
const mark = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
const tStart = Date.now();
// THE PERSONAS (D25): every one existing; no new persona. The administrator of the act is the platform-admin session acting in the origin
// (the demonstration has no domain_admin persona — a platform_admin@PLATFORM holder of graph.projection.withdraw / rebuild).
const hoffmann = await who('a.hoffmann'); const novak = await who('p.novak'); const bergmann = await who('h.bergmann'); const okafor = await who('s.okafor'); const brandt = await who('l.brandt');
const P_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ah = P_(hoffmann, 'graph'); const pn = P_(novak, 'retention'); const so = P_(okafor, 'briefing'); const lb = P_(brandt, 'memory');
const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
/** The administrator's envelope in a domain of the tenant (the origin by default; the mirror by domainId). */
const ad = (over) => as(admin, { ...scope, domainId: over.domainId ?? D }, { purposeId: 'platform.administration', ...over });
// The seven subscriber kinds (B6; the relationships subscriber of B9) and the demonstration's selection for the seventh (register-subscriptions.mjs).
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'];
const SELECTION = { relationships: { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } };
const BROAD = KINDS.filter((k) => SELECTION[k] === undefined);
let liveBroad = BROAD.length;   // the broad subscriptions found active in the origin — what a GraphChanged row is delivered to
const SIX = ['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current'];

/* ── the outbox, the deliveries, the ledgers ─────────────────────────────── */
/** The newest published GraphChanged row of a kind caused by a target after a mark (the B17 idiom). */
async function waitOutbox(domainId, kind, targetId, notBefore, seconds = 30) {
  for (let i = 0; i < seconds; i += 1) {
    const row = (await q(`select id::text, status, partition_key, partition_seq::int, correlation_id::text, payload from objects.object_outbox
        where event_type = 'GraphChanged' and tenant_id = $1 and domain_id = $2 and payload #>> '{change,kind}' = $3 and payload #>> '{cause,target_id}' = $4 and created_at >= $5
        order by created_at desc limit 1`, [T, domainId, kind, targetId, new Date(notBefore - 1000)]))[0] ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
const deliveriesOf = (eventId) => q(`select subscription_id::text, consumer_kind, state, items, items_applied, items_unresolved, attempts, deliveries::int deliveries, last_error, failure_class, disposition from graph.subscription_deliveries where event_id = $1 order by consumer_kind`, [eventId]);
/** Wait for every delivery of an event to be terminal (the B16 loop). */
async function settled(eventId, expected = liveBroad, seconds = 90, subscriptionId = null) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    // a replayed event carries the REVOKED subscription's earlier delivery too: the replacement's is the one that settles here
    ds = (await deliveriesOf(eventId)).filter((d) => subscriptionId === null || d.subscription_id === subscriptionId);
    if (ds.length >= expected && ds.every((d) => ['applied', 'failed', 'refused', 'unresolved'].includes(d.state))) { await sleep(1500); return ds; }
    await sleep(1000);
  }
  return ds;
}
const effectsOf = (d) => [...new Set((d.items_applied ?? []).map((x) => x.effect))].join(', ');
const deliveryLine = (ds) => ds.map((d) => `${d.consumer_kind} ${d.state}${(d.items ?? []).length > 0 ? ` (${(d.items ?? []).length} item(s): ${effectsOf(d) || 'no effect recorded'})` : ' (no items)'}${d.last_error ? ` — ${String(d.last_error).slice(0, 120)}` : ''}`).join('; ');
const byKind = (ds, k) => ds.find((d) => d.consumer_kind === k) ?? null;
const retrievalCheck = async (eventId, subscriptionId = null) => (await q(`select check_id::text, mismatched::int, projections from graph.retrieval_checks where outbox_event_id = $1 and ($2::uuid is null or subscription_id = $2::uuid) order by checked_at desc limit 1`, [eventId, subscriptionId]))[0] ?? null;
const checkLine = (chk) => (chk === null ? 'no check' : `check ${short(chk.check_id)} mismatched ${chk.mismatched}: ${(chk.projections ?? []).map((p) => `${p.projection} ${p.live_rows}/${p.rebuilt_rows} m${p.mismatched} mi${p.missing} u${p.unexpected} r${p.representation_ok ? 'ok' : 'OUTDATED'}${p.failed ? ' FAILED' : ''}`).join(', ')}`);
const actionRow = async (id) => (await q(`select state, failure_class, disposition, failure_reason, attempts::int from retention.actions_current where action_id = $1`, [id]))[0] ?? null;
const approvalsRevoked = async (id) => (await q(`select count(*) filter (where revoked_at is not null)::int revoked, count(*) filter (where revoked_at is null)::int live from retention.approvals where action_id = $1`, [id]))[0];

/* ── the routes ──────────────────────────────────────────────────────────── */
const subscriptionStatus = async (domainId, label) => {
  const r = await call(`/v1/tenants/${T}/domains/${domainId}/graph/subscriptions/status`, ad({ domainId, action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, admin.token);
  if (!r.ok) { fail(`subscriptions/status (${label})`, r); return null; }
  return r.body.subscriptions;
};
/** The six partitions of a domain as graph.projection_state() answers them (the status route's `projections`). */
const stateOf = async (domainId, label) => (await subscriptionStatus(domainId, label))?.projections ?? null;
const stateLine = (rows) => (rows ?? []).map((p) => `${p.projection} ${p.state}/${p.condition} r${p.representation_version}${p.state === 'withdrawn' ? ` (since ${iso(p.withdrawn_at)}: ${p.withdrawn_reason})` : ''}${p.last_rebuild_id ? ` [rebuilt ${short(p.last_rebuild_id)} at ${iso(p.rebuilt_at)}]` : ''}`).join('; ');
const verifyIn = (domainId, build, session) => call(`/v1/tenants/${T}/domains/${domainId}/graph/projections/verify`, build({ action: 'graph.read', objectType: 'ENT', sideEffect: 'none' }), {}, session.token);
const withdraw = (projection, reason, domainId = D) => call(`/v1/tenants/${T}/domains/${domainId}/graph/projections/${projection}/withdraw`, ad({ action: 'graph.projection.withdraw', objectType: 'PRJ', consequence: 'C2', domainId }), { reason }, admin.token);
const rebuild = (projection, reason, domainId = D) => call(`/v1/tenants/${T}/domains/${domainId}/graph/projections/${projection}/rebuild`, ad({ action: 'graph.projection.rebuild', objectType: 'PRJ', consequence: 'C2', domainId }), { reason }, admin.token);
const search = (query) => call(`${G}/search`, ah({ action: 'graph.read', objectType: 'SRC', sideEffect: 'none' }), { query, limit: 50 }, hoffmann.token);
const neighbourhood = (entityId, depth) => call(`${G}/neighbourhood`, ah({ action: 'graph.read', objectType: 'EDG', objectId: entityId, sideEffect: 'none' }), { entityId, depth }, hoffmann.token);
const path = (from, to) => call(`${G}/path`, ah({ action: 'graph.read', objectType: 'EDG', sideEffect: 'none' }), { from, to }, hoffmann.token);
const edgesList = () => call(`${G}/edges/list`, ah({ action: 'graph.read', objectType: 'EDG', sideEffect: 'none' }), {}, hoffmann.token);
const overview = () => call(`${G}/overview`, ah({ action: 'graph.read', objectType: 'ENT', sideEffect: 'none' }), {}, hoffmann.token);
const entitiesIn = (domainId) => call(`/v1/tenants/${T}/domains/${domainId}/graph/entities/list`, ad({ domainId, action: 'graph.read', objectType: 'ENT', sideEffect: 'none' }), { limit: 50 }, admin.token);
const retrieve = (id, purpose) => call(`${G}/memory/${id}/retrieve`, lb({ purposeId: purpose, action: 'memory.item.retrieve', objectType: 'MEM', objectId: id, sideEffect: 'none' }), {}, brandt.token);
const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const withdrawAction = (id, reason) => call(`${R}/actions/${id}/withdraw`, pn({ action: 'retention.action.withdraw', objectType: 'RTA', objectId: id }), { reason }, novak.token);
/** The projection block of an answer, printed whole: the flag, the watermark (the verified sequence and the dispatcher's cursor beside it — C2), the withdrawn partitions, the label. */
function showBlock(label, p) {
  if (p === null || p === undefined) { bad(`${label}: the answer carries no projection block`); return; }
  note(`${label}: condition ${p.condition}${p.degraded ? ` (degraded, code ${p.code})` : ''}; revision ${p.revision}; verified_seq ${p.verified_seq} (check ${short(p.verified_check_id)} at ${p.verified_at ?? '—'}); checkpoint_seq ${p.checkpoint_seq}; lag ${p.lag_events}; unresolved ${p.unresolved_deliveries}; subscription ${short(p.subscription?.subscription_id)} ${p.subscription?.status ?? '—'}; partitions ${(p.partitions ?? []).map((x) => `${x.projection} ${x.condition}`).join(', ')}; withdrawn [${(p.withdrawn ?? []).join(', ')}]${p.label ? `\n      label: ${p.label}` : ''}`);
}
const isCurrent = (p) => p !== null && p !== undefined && p.condition === 'current' && p.revision !== null && p.revision === p.verified_seq && Number(p.lag_events) === 0;
/** A read retried up to 150 s (the dispatcher's reconcile tick is 60 s — two ticks and a margin) while the replayed delivery settles (a lagging / unverified read meanwhile is printed with the reason, never retried into ok). */
async function untilCurrent(label, fetch, blockOf) {
  let r = null; let p = null;
  for (let i = 0; i < 150; i += 1) {
    r = await fetch();
    if (!r.ok) { fail(label, r); return null; }
    p = blockOf(r.body);
    if (isCurrent(p)) break;
    if (i === 0) note(`${label}: condition ${p?.condition ?? '—'} (revision ${p?.revision}, verified_seq ${p?.verified_seq}, lag ${p?.lag_events}) — the replayed delivery may still be settling (the reconcile tick is 60 s); retried up to 150 s`);
    await sleep(1000);
  }
  showBlock(label, p);
  if (isCurrent(p)) ok(`${label}: projection current — the revision ${p.revision} is the verified sequence, lag 0 (verified by check ${short(p.verified_check_id)})`);
  else bad(`${label}: the read did not reach current (condition ${p?.condition ?? '—'}: ${p?.label ?? 'no label'})`);
  return r;
}

console.log(`THE EYE — CP-6 B20 on the demonstration: index-tier degradation (migration 0080) — the projection partitions with a derived watermark, the symmetric check that withdraws, the operator's withdrawal and rebuild, the labelled and constrained reads, the deletion pause, the briefing's flag`);
console.log(`target ${API} · database ${env.EYE_DB_NAME ?? 'eye_demo'} · tenant ${short(T)} · origin domain ${short(D)} · ${new Date().toISOString()}`);
console.log('each run re-registers the retrieval subscriptions only where their consumer identity is outdated, withdraws and restores edges_current of the origin once, and leaves one deletion action withdrawn and one briefing; no persona is created; nothing is retired');

/* ── the mirror (B16/B17's), read only ──────────────────────────────────── */
const D2_NAME = 'NORDWERK Exchange Mirror (SYNTHETIC)';
let D2 = null;
try { const d = await domainByName(admin, T, D2_NAME); D2 = d === null ? null : d.id; } catch (e) { bad(`the mirror domain: ${e.message}`); }
if (D2 === null) note('the mirror is not prepared (domain ABSENT): the mirror lines of scenes 0, 1 and 4 are skipped, said');
const domains = [[D, 'the origin'], ...(D2 === null ? [] : [[D2, 'the mirror']])];

/* ── 0. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n0. THE STATE — the register through the route (L3-I02 names B20); the strict check in the origin and the mirror (seven columns; every row must pass — the act stops before any withdrawal otherwise); the six partitions of each domain');
const registerLine = async (label) => {
  const ir = await call(`${G}/interfaces`, ah({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, hoffmann.token);
  if (!ir.ok) { fail(`graph/interfaces (a.hoffmann, ${label})`, ir); return; }
  const all = ir.body.interfaces ?? [];
  const count = (s) => all.filter((i) => i.binding_state === s).length;
  const l3 = all.find((i) => i.interface_id === 'L3-I02') ?? null;
  const names = l3 !== null && /B20 \(0080\)/.test(String(l3.bound_to ?? ''));
  if (all.length === 50 && count('bound') === 36 && count('partial') === 14 && count('unbound') === 0 && names && l3.binding_state === 'partial') ok(`the interface register (A. Hoffmann, ${label}): ${all.length} rows — ${count('bound')} bound / ${count('partial')} partial / ${count('unbound')} unbound; L3-I02 ${l3.name}@${l3.schema_version} ${l3.binding_state}, its bound_to names B20 (0080) — every graph and memory read declares its product state; the row stays partial (the purpose-bound context query is owed); no row moved`);
  else bad(`the register (${label}): ${all.length} rows, ${count('bound')}/${count('partial')}/${count('unbound')}; L3-I02 ${l3 === null ? 'MISSING' : `${l3.binding_state}, bound_to ${names ? 'names' : 'DOES NOT name'} B20 (0080)`}`);
};
await registerLine('before');
let clean = true;
for (const [domainId, label] of domains) {
  const v = domainId === D ? await verifyIn(D, ah, hoffmann) : await verifyIn(domainId, (over) => ad({ domainId, ...over }), admin);
  if (!v.ok) { fail(`projections/verify (${label})`, v); clean = false; continue; }
  const rows = v.body.projections ?? [];
  const failed = rows.filter((r) => Number(r.mismatched) !== 0 || Number(r.missing) !== 0 || Number(r.unexpected) !== 0 || r.representation_ok !== true);
  note(`${label}: ${rows.map((r) => `${r.projection} live ${r.live_rows} log ${r.rebuilt_rows} mismatched ${r.mismatched} missing ${r.missing} unexpected ${r.unexpected} representation ${r.representation_ok ? 'ok' : 'OUTDATED'}`).join('; ')}${v.body.note ? `\n      ${v.body.note}` : ''}`);
  if (rows.length === 6 && failed.length === 0) ok(`${label}: the strict check passes on every one of the six partitions — the symmetric comparison (mismatched + missing + unexpected) and the representation version; nothing here withdraws (the route reports)`);
  else { clean = false; bad(`${label}: the strict check FAILS on ${failed.map((r) => r.projection).join(', ') || 'a missing row'} — a finding to record, never an act: the act stops before any withdrawal`); }
  const st = await stateOf(domainId, label);
  if (st === null) { clean = false; continue; }
  const serving = st.filter((p) => p.state === 'serving' && p.representation_version === '1').length;
  if (st.length === 6 && serving === 6) ok(`${label}: six partitions serving under representation 1 — ${stateLine(st)}`); else { clean = false; bad(`${label}: the partitions: ${stateLine(st)}`); }
}
if (!clean) note('THE ACT STOPS HERE (C6): scenes 1–3 are not run on a database whose strict check fails or whose partitions are not all serving; the state is printed in scene 4');

/* ── 1. THE WATERMARK ────────────────────────────────────────────────────── */
let NORDWERK = null; let STRAIT = null;
if (clean) {
  console.log('\n1. THE WATERMARK — the retrieval subscription of each domain revoked and registered anew (its method changed in B20), the replacement replaying from the revoked cursor\'s own event; A. Hoffmann\'s search and neighbourhood print current with the revision, the verified sequence and the checkpoint');
  for (const [domainId, label] of domains) {
    const Gd = `/v1/tenants/${T}/domains/${domainId}/graph`;
    const st = await subscriptionStatus(domainId, label);
    if (st === null) continue;
    if (domainId === D) liveBroad = (st.subscriptions ?? []).filter((s) => s.status === 'active' && BROAD.includes(s.consumer_kind)).length;
    const live = (st.subscriptions ?? []).find((s) => s.consumer_kind === 'retrieval' && s.status === 'active') ?? null;
    const current = (st.consumers ?? []).find((c) => c.kind === 'retrieval') ?? null;
    const others = KINDS.filter((k) => k !== 'retrieval').map((k) => `${k} ${(st.subscriptions ?? []).some((s) => s.consumer_kind === k && s.status === 'active') ? 'active' : 'NONE'}`).join(', ');
    note(`${label}: the six other kinds LEFT (no method changed in B20): ${others}`);
    if (current === null) { bad(`${label}: this process has no retrieval consumer`); continue; }
    if (live !== null && live.code_digest === current.codeDigest && live.consumer_version === current.version) {
      ok(`${label}: retrieval: subscription ${short(live.subscription_id)} already carries this process's consumer identity (${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…) — left as it is (an earlier run re-registered it)`);
      continue;
    }
    if (live !== null) {
      const rv = await call(`${Gd}/subscriptions/${live.subscription_id}/revoke`, ad({ domainId, action: 'graph.subscription.control', objectType: 'SUB', objectId: live.subscription_id, consequence: 'C2' }),
        { reason: 'B20: the retrieval consumer\'s method changed (the symmetric check that withdraws)' }, admin.token);
      if (!rv.ok) { fail(`${label}: revoke the outdated retrieval subscription`, rv); continue; }
      note(`${label}: retrieval: subscription ${short(live.subscription_id)} was registered for consumer ${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…; this process's is ${current.version} ${String(current.codeDigest).slice(0, 12)}… — REVOKED (cursor ${live.checkpoint_seq ?? 'none'}), registered anew (a changed method is a new consumer)`);
    } else { bad(`${label}: no active retrieval subscription stands — the act registers nothing where nothing stood (run scripts/phase6/register-subscriptions.mjs first; the reads below print whatever condition they find)`); continue; }
    const r = await call(`${Gd}/subscriptions/register`, ad({ domainId, action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }),
      { consumerKind: 'retrieval', ownerPrincipalId: live.owner_principal_id, backlog: 'leave' }, admin.token);
    if (!r.ok) { fail(`${label}: register the retrieval subscription`, r); continue; }
    const s = r.body.subscription;
    ok(`${label}: retrieval: registered subscription ${short(s.subscriptionId)}, principal ${short(s.principalId)} (role ${s.role}), consumer ${s.consumer.version} ${String(s.consumer.codeDigest).slice(0, 12)}…, owner ${short(live.owner_principal_id)} (the revoked subscription's accountable human); worker running ${r.body.served.workerRunning}`);
    {
      // B20 (C1): a replay re-drives rows strictly AFTER the point (0065); a caught-up domain would replay nothing and leave the
      // replacement with no applied check (unverified). The revoked cursor's OWN event is re-driven: its check applies again.
      const from = live.checkpoint_seq === null || live.checkpoint_seq === undefined ? {} : { fromSeq: Number(live.checkpoint_seq) - 1 };
      const rp = await call(`${Gd}/subscriptions/${s.subscriptionId}/replay`, ad({ domainId, action: 'graph.subscription.replay', objectType: 'SUB', objectId: s.subscriptionId, consequence: 'C2' }),
        { ...from, reason: 'B20: the retrieval consumer changed; the replacement replays from the revoked cursor\'s own event' }, admin.token);
      if (!rp.ok) bad(`${label}: the replacement's replay was refused (${refusalLine(rp)}) — the reads below print whatever condition they find`);
      else {
        note(`${label}: retrieval: replayed ${rp.body.replayed} event(s) to the replacement from ${from.fromSeq === undefined ? 'the retained beginning' : `sequence ${from.fromSeq} (the revoked cursor's own event ${Number(live.checkpoint_seq)} re-verified)`}`);
        if (from.fromSeq !== undefined && Number(rp.body.replayed) >= 1) ok(`${label}: at least one event re-driven to the replacement — its first check applies and the domain reads current (C1)`);
        else if (from.fromSeq !== undefined) bad(`${label}: the replay re-drove nothing — the replacement has no applied check and the domain reads unverified`);
        for (const eventId of rp.body.events ?? []) {
          // the replacement's delivery is applied by the dispatcher's reconcile tick (60 s): the wait covers two ticks
          const ds = await settled(eventId, 1, 150, s.subscriptionId);
          const rtv = (ds ?? []).find((d) => d.consumer_kind === 'retrieval') ?? null;
          const chk = await retrievalCheck(eventId, s.subscriptionId);
          note(`${label}: replayed event ${short(eventId)}: retrieval ${rtv?.state ?? 'NO DELIVERY'}${rtv ? ` (${effectsOf(rtv) || 'no effect'})` : ''}; ${checkLine(chk)}`);
        }
      }
    }
  }
  // THE READS of the origin: the NORDWERK entity and the strait looked up at run time.
  NORDWERK = (await q(`select entity_id::text id, canonical_name from graph.entities_current where domain_id = $1 and normalized_name like 'nordwerk%' order by created_at limit 1`, [D]))[0] ?? null;
  STRAIT = (await q(`select entity_id::text id, canonical_name from graph.entities_current where domain_id = $1 and normalized_name like 'bab el-mandeb%' order by created_at limit 1`, [D]))[0] ?? null;
  if (NORDWERK === null) bad('no NORDWERK entity in the origin (normalized_name like nordwerk%) — run the Phase 3 graph seed first; the graph reads of scenes 1–3 are skipped');
  else {
    note(`the NORDWERK entity ${short(NORDWERK.id)} "${NORDWERK.canonical_name}"; the strait ${STRAIT === null ? 'NOT found by name (the path uses a neighbour from the walk)' : `${short(STRAIT.id)} "${STRAIT.canonical_name}"`}`);
    const sr = await untilCurrent('A. Hoffmann /search NORDWERK', () => search('NORDWERK'), (b) => b.search?.projection);
    if (sr !== null) { const s = sr.body.search; note(`the search: ${s.entities?.length ?? 0} entity hit(s), ${s.claims?.length ?? 0} claim(s), ${s.evidence?.length ?? 0} evidence; complete ${JSON.stringify(s.complete)}; bounds ${JSON.stringify(s.bounds)}${s.note ? `; note: ${s.note}` : ''}`); }
    const nr = await untilCurrent(`A. Hoffmann /neighbourhood of ${short(NORDWERK.id)} depth 2`, () => neighbourhood(NORDWERK.id, 2), (b) => b.projection);
    if (nr !== null) {
      const n = nr.body;
      note(`the neighbourhood: ${n.neighbourhood?.edges?.length ?? 0} edge(s), ${n.neighbourhood?.entities?.length ?? 0} entities; searchedDepth ${n.searchedDepth}; depthClamped ${n.neighbourhood?.depthClamped}; bound.projection ${n.bound?.projection ?? n.neighbourhood?.bound?.projection ?? '—'}`);
      if (STRAIT === null) { const other = (n.neighbourhood?.entities ?? []).find((e) => e.entity_id !== NORDWERK.id) ?? null; if (other !== null) { STRAIT = { id: other.entity_id, canonical_name: other.canonical_name }; note(`the path's far end: the neighbour ${short(STRAIT.id)} "${STRAIT.canonical_name}" (from the walk's own answer)`); } }
    }
  }
  if (D2 !== null) {
    const er = await untilCurrent('the administrator /entities/list in the mirror', () => entitiesIn(D2), (b) => b.projection);
    if (er !== null) note(`the mirror lists ${(er.body.entities ?? []).length} entit(y|ies)`);
  }
}

/* ── 2. THE OPERATOR WITHDRAWS ───────────────────────────────────────────── */
let t0 = null; let t0ms = 0; let DEL = null; let BRIEF = null;
if (clean) {
  console.log('\n2. THE OPERATOR WITHDRAWS — the administrator withdraws edges_current of the origin; the reads print the label and the constrained walk; a second withdrawal is idempotent; P. Novák\'s approved deletion PAUSES at execution; S. Okafor\'s briefing is not degraded; L. Brandt\'s memory retrieval unaffected');
  t0 = await mark(); t0ms = Date.now();
  const w = await withdraw('edges_current', 'representation review before the ontology proposal');
  if (!w.ok) fail('projections/edges_current/withdraw (the administrator)', w);
  else {
    const p = w.body.projection;
    if (p.changed === true && p.state === 'withdrawn' && p.reason === 'representation review before the ontology proposal') ok(`the administrator WITHDREW edges_current: ${JSON.stringify({ projection: p.projection, state: p.state, changed: p.changed, event_id: p.event_id, withdrawn_since: p.withdrawn_since, reason: p.reason, withdrawn_by_check: p.withdrawn_by_check })}`);
    else bad(`the withdrawal's answer: ${JSON.stringify(p).slice(0, 400)}`);
    const st = await stateOf(D, 'the origin');
    if (st !== null) {
      const e = st.find((x) => x.projection === 'edges_current');
      if (e?.state === 'withdrawn' && st.filter((x) => x.projection !== 'edges_current').every((x) => x.state === 'serving')) ok(`the partitions: edges_current withdrawn (since ${iso(e.withdrawn_at)}); the five others serving — ${stateLine(st)}`);
      else bad(`the partitions after the withdrawal: ${stateLine(st)}`);
    }
    if (NORDWERK !== null) {
      // THE SEARCH stays current: the block names only the route's partitions (entities_current) — the search does not read edges.
      const sr = await search('NORDWERK');
      if (!sr.ok) fail('search (a.hoffmann)', sr);
      else { showBlock('A. Hoffmann /search NORDWERK', sr.body.search?.projection); if (sr.body.search?.projection?.condition === 'current' && (sr.body.search?.projection?.withdrawn ?? []).length === 0 && (sr.body.search?.projection?.domain_withdrawn ?? []).includes('edges_current')) ok('the search stays CURRENT: the block names only the route\'s partitions (entities_current) — the search does not read edges; the domain\'s withdrawal is named in domain_withdrawn'); else bad(`the search's block while edges_current is withdrawn: ${JSON.stringify(sr.body.search?.projection).slice(0, 300)}`); }
      // THE NEIGHBOURHOOD (depth 4 asked): withdrawn, degraded, the code, the label, constrained to 2.
      const nr = await neighbourhood(NORDWERK.id, 4);
      if (!nr.ok) fail('neighbourhood (a.hoffmann)', nr);
      else {
        const n = nr.body; const p2 = n.projection; showBlock(`A. Hoffmann /neighbourhood of ${short(NORDWERK.id)} depth 4`, p2);
        const bound = n.bound?.projection ?? n.neighbourhood?.bound?.projection;
        if (p2?.condition === 'withdrawn' && p2?.degraded === true && p2?.code === 'EYE-DEG-001' && bound === true && Number(n.searchedDepth) === 2 && n.neighbourhood?.depthClamped === true) ok(`the neighbourhood is CONSTRAINED: condition withdrawn, degraded, code EYE-DEG-001, bound.projection true, searchedDepth ${n.searchedDepth} (4 asked; depthClamped ${n.neighbourhood.depthClamped}); ${n.neighbourhood.edges?.length ?? 0} edge(s) from the log; note: ${String(n.note).slice(0, 200)}…`);
        else bad(`the neighbourhood while withdrawn: ${JSON.stringify({ condition: p2?.condition, degraded: p2?.degraded, code: p2?.code, bound, searchedDepth: n.searchedDepth, depthClamped: n.neighbourhood?.depthClamped }).slice(0, 300)}`);
      }
      const er = await edgesList();
      if (!er.ok) fail('edges/list (a.hoffmann)', er);
      else {
        const e = er.body; const rows = e.edges ?? []; showBlock('A. Hoffmann /edges/list', e.projection);
        const fromLog = rows.filter((x) => x.from === 'log').length; const projected = rows.filter((x) => x.projected === true).length; const drifted = rows.filter((x) => x.drift !== undefined && x.drift !== null).length; const only = rows.filter((x) => x.projected === false).length;
        if (e.projection?.condition === 'withdrawn' && e.from === 'log' && rows.length > 0 && fromLog === rows.length && drifted === 0 && only === 0) ok(`/edges/list served from the LOG: ${rows.length} edge(s) (of ${e.total} eligible), every one from 'log' and projected true; no drift and no metadata-only row — nothing drifted on the demonstration (said)`);
        else bad(`/edges/list while withdrawn: ${JSON.stringify({ condition: e.projection?.condition, from: e.from, rows: rows.length, fromLog, projected, drifted, only }).slice(0, 300)}`);
      }
      if (STRAIT !== null) {
        const pr = await path(NORDWERK.id, STRAIT.id);
        if (!pr.ok) fail('path (a.hoffmann)', pr);
        else { showBlock(`A. Hoffmann /path ${short(NORDWERK.id)} → ${short(STRAIT.id)}`, pr.body.projection); if (pr.body.bound?.projection === true && pr.body.projection?.condition === 'withdrawn') ok(`/path bound ${JSON.stringify(pr.body.bound)}: ${pr.body.path === null ? 'no path found' : `a path of ${pr.body.path.length} hop(s)`} — ${pr.body.note ?? 'no note'}`); else bad(`/path while withdrawn: ${JSON.stringify({ bound: pr.body.bound, condition: pr.body.projection?.condition }).slice(0, 300)}`); }
      }
      const ov = await overview();
      if (!ov.ok) fail('overview (a.hoffmann)', ov);
      else { const o = ov.body.overview; if (o.edges?.from === 'log' && (o.projection?.withdrawn ?? []).includes('edges_current')) ok(`/overview: edges from the log (${o.edges.total} total, ${o.edges.asserted} asserted); projection.withdrawn ${JSON.stringify(o.projection.withdrawn)}; the five other sections from the projection`); else bad(`/overview while withdrawn: ${JSON.stringify({ edges: o.edges, withdrawn: o.projection?.withdrawn }).slice(0, 300)}`); }
    }
    // IDEMPOTENT: a second withdrawal records a second reason and changes nothing.
    const w2 = await withdraw('edges_current', 'a second reason on the same partition (idempotent)');
    if (w2.ok && w2.body.projection.changed === false && w2.body.projection.reason === 'representation review before the ontology proposal' && w2.body.projection.second_reason === 'a second reason on the same partition (idempotent)') ok(`a second withdrawal: changed false, the earlier reason kept ("${w2.body.projection.reason}"), second_reason "${w2.body.projection.second_reason}" — a second ledger row, no state change`);
    else bad(`the second withdrawal: ${w2.ok ? JSON.stringify(w2.body.projection).slice(0, 300) : refusalLine(w2)}`);
  }
  // THE DELETION: a deletable hot manifest of the origin looked up at run time (its object's latest version corrected / withdrawn / superseded, hot, not tombstoned, not held).
  const cands = await q(`select o.object_id::text evd, (o.payload ->> 'manifest_id') manifest, o.retention_profile, o.lifecycle_state, o.object_version::int v, o.recorded_at
      from objects.canonical_objects o
     where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state in ('corrected', 'withdrawn', 'superseded')
       and not exists (select 1 from objects.canonical_objects x where x.object_id = o.object_id and x.object_version > o.object_version)
       and (o.payload ->> 'manifest_id') is not null
       and observation.manifest_tier((o.payload ->> 'manifest_id')::uuid) = 'hot'
       and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = (o.payload ->> 'manifest_id')::uuid)
       and not exists (select 1 from observation.legal_holds h where h.manifest_id = (o.payload ->> 'manifest_id')::uuid and h.lifted_at is null)
     order by o.recorded_at desc limit 8`, [T, D]);
  note(`${cands.length} candidate manifest(s) for the deletion scene (the object's latest version corrected/withdrawn/superseded, hot, not tombstoned, not held); each is opened and resolved by P. Novák — the first that resolves executable is taken, the others withdrawn`);
  let taken = null;
  for (const cnd of cands) {
    const o = await open({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: cnd.manifest }, retentionProfile: cnd.retention_profile ?? null, reason: 'B20 demonstration: the pause at execution is shown; nothing is retired' });
    if (!o.ok) { note(`  candidate ${short(cnd.manifest)} (EVD ${short(cnd.evd)}@${cnd.v} ${cnd.lifecycle_state}): open refused — ${refusalLine(o)}`); continue; }
    const id = o.body.action.actionId;
    const rs = await resolve(id);
    const sc = rs.ok ? rs.body.scope : null;
    if (sc !== null && sc.state === 'scope_resolved' && Number(sc.execute) >= 1) { taken = { id, digest: sc.scope_digest, manifest: cnd.manifest, evd: cnd.evd, execute: sc.execute }; note(`  candidate ${short(cnd.manifest)} (EVD ${short(cnd.evd)}@${cnd.v} ${cnd.lifecycle_state}): deletion ${short(id)} resolved ${sc.state}, ${sc.execute} to execute — TAKEN`); break; }
    note(`  candidate ${short(cnd.manifest)} (EVD ${short(cnd.evd)}@${cnd.v} ${cnd.lifecycle_state}): deletion ${short(id)} resolved ${sc === null ? `refused (${refusalLine(rs)})` : `${sc.state} (execute ${sc.execute}, blocking ${sc.blocking ?? 0})`} — withdrawn, the next tried`);
    await withdrawAction(id, 'not a candidate for the B20 scene');
  }
  if (taken === null) bad('no deletable manifest resolved executable in the origin — the deletion pause is not shown on this target (the harness carries P7)');
  else {
    DEL = taken.id;
    const ap = await approve(DEL, taken.digest, 'the scope as resolved (the B20 demonstration)');
    if (!ap.ok) fail('actions/approve (h.bergmann)', ap);
    else {
      ok(`H. Bergmann approved deletion ${short(DEL)} of manifest ${short(taken.manifest)} on the scope digest ${String(taken.digest).slice(0, 12)}…`);
      const ex = await execute(DEL);
      const ar = await actionRow(DEL); const apr = await approvalsRevoked(DEL);
      if (ex.status === 409 && ex.body?.code === 'EYE-STA-002' && /^the execution was rolled back and the action paused: retention execution rejected \(projection_withdrawn\): the safe referential scope reads a projection that is withdrawn — edges_current \(since .*: representation review before the ontology proposal\); the scope cannot be proven until it is rebuilt \(graph\.projection\.rebuild\); the action pauses for human review/.test(String(ex.body?.message ?? ''))
          && ar?.state === 'paused' && ar?.failure_class === 'unresolved_dependency' && ar?.disposition === 'human_review' && Number(ar?.attempts) === 0 && apr.live === 0 && apr.revoked >= 1) {
        ok(`P. Novák's execution REFUSED and the action PAUSED: ${refusalLine(ex)}`);
        ok(`the action ${short(DEL)}: state ${ar.state}, ${ar.failure_class} → ${ar.disposition}, attempts ${ar.attempts} (no attempt counted — refused before the state moved); approvals revoked ${apr.revoked}, live ${apr.live}; nothing retired`);
      } else bad(`the execution while edges_current is withdrawn: ${ex.ok ? `EXECUTED ${JSON.stringify(ex.body.execution)}` : refusalLine(ex)}; action ${JSON.stringify(ar)}; approvals ${JSON.stringify(apr)}`);
    }
  }
  // THE BRIEFING: S. Okafor continues the domain's newest briefing in its room (the B19 act's idiom) — not degraded by an edges withdrawal.
  {
    const priorRows = await q(`select briefing_id::text, room_id::text from executive.briefings where tenant_id = $1 and domain_id = $2 order by known_at desc limit 1`, [T, D]);
    const priorBriefingId = priorRows[0]?.briefing_id ?? null; const roomId = priorRows[0]?.room_id ?? null;
    note(priorBriefingId === null ? 'no earlier briefing in the domain: the composition covers the whole history' : `the composition continues the domain's newest briefing ${short(priorBriefingId)}${roomId === null ? ' (a domain briefing)' : ` in its room ${short(roomId)}`}`);
    const b = await call(`${X}/briefings/compose`, so({ action: 'briefing.compose', objectType: 'BRF', consequence: 'C2' }), { roomId, knownAt: new Date().toISOString(), priorBriefingId }, okafor.token);
    if (!b.ok) fail('briefings/compose (s.okafor)', b);
    else {
      const br = b.body.briefing; BRIEF = br.briefingId;
      const mem = br.projection?.partitions?.[0] ?? null;
      // the STATE rides the content's watermark (BRF@v1 admits no top-level key it does not name — briefing.service.ts)
      const content = (await q(`select payload -> 'watermark' -> 'projection' as p from objects.canonical_objects where object_id = $1 order by object_version desc limit 1`, [BRIEF]))[0]?.p ?? null;
      note(`S. Okafor composed briefing ${short(BRIEF)} (${(br.items ?? []).length} item(s), ${(br.items ?? []).filter((i) => i.kind === 'memory').length} of kind memory): degraded ${br.degraded}; projection.partitions[0] ${JSON.stringify(mem === null ? null : { projection: mem.projection, condition: mem.condition, state: mem.state })}; the content's watermark.projection block ${JSON.stringify(content)}`);
      // The briefing's `degraded` folds TWO causes (briefing.service.ts): a source the briefing rests on degraded or blocked (B10) OR the memory
      // projection withdrawn (B20). On the demonstration the sources' own states decide it (the scheduled collections that failed by known_at);
      // the B20 claim is narrower and is what this scene pins: an EDGES withdrawal leaves the memory partition serving, the content's watermark
      // says `memory: serving`, and whatever `degraded` reads is the sources' — named here, never attributed to the projection.
      const degradedSources = (br.sourceStates ?? []).filter((x) => x.state === 'degraded' || x.state === 'blocked');
      if (mem?.projection === 'memory_items_current' && mem?.state === 'serving' && content?.memory === 'serving') ok(`the briefing is not degraded BY THE PROJECTION — memory_items_current is serving (an edges withdrawal does not reach the memory projection); the content's watermark carries projection.memory serving (the STATE only, so its digest is stable); degraded ${br.degraded}${br.degraded ? ` — the sources' (B10): ${degradedSources.length} source state(s) degraded or blocked${degradedSources.length > 0 ? `: ${degradedSources.slice(0, 3).map((x) => `${short(x.source_id)} ${x.state} (${x.reason ?? 'no reason'})`).join('; ')}${degradedSources.length > 3 ? '; …' : ''}` : ''}` : ''}`);
      else bad(`the briefing's degradation: degraded ${br.degraded}, partitions[0] ${JSON.stringify(mem)}, content projection ${JSON.stringify(content)}`);
    }
  }
  // L. Brandt's memory retrieval: unaffected by an edges withdrawal.
  {
    const item = (await q(`select item_id::text id, title, classification from memory.items_current where tenant_id = $1 and domain_id = $2 and state = 'active' and classification = 'internal' and 'memory' = any(audience_purposes) order by recorded_at desc limit 1`, [T, D]))[0] ?? null;
    if (item === null) note('no active internal memory item admitting the purpose memory in the origin: L. Brandt\'s retrieval is skipped, said');
    else {
      const rt = await retrieve(item.id, 'memory');
      if (!rt.ok) fail(`memory/retrieve (l.brandt, ${short(item.id)})`, rt);
      else {
        const m = rt.body.memory; showBlock(`L. Brandt /memory/${short(item.id)}/retrieve`, m.projection);
        if (m.availability?.index_state === 'projected' && m.projection?.condition === 'current' && m.versionServed !== null && m.content === undefined) ok(`L. Brandt retrieved "${item.title}" (${short(item.id)}) under memory: version ${m.versionServed} served, index_state ${m.availability.index_state}, projection current — the memory reads are unaffected by the edges withdrawal (said)`);
        else bad(`the memory retrieval while edges_current is withdrawn: ${JSON.stringify({ index_state: m.availability?.index_state, condition: m.projection?.condition, versionServed: m.versionServed, content: m.content ?? null }).slice(0, 300)}`);
      }
    }
  }
}

/* ── 3. THE REBUILD ──────────────────────────────────────────────────────── */
if (clean) {
  console.log('\n3. THE REBUILD — the administrator rebuilds edges_current (restored: nothing drifted); the ledger; the projection.rebuilt event and its deliveries; the paused deletion resolved again and withdrawn; the reads current with the new verified sequence');
  const rb = await rebuild('edges_current', 'the representation review is complete; the partition returns to service');
  if (!rb.ok) fail('projections/edges_current/rebuild (the administrator)', rb);
  else {
    const r = rb.body.rebuild;
    note(`the rebuild's report: ${JSON.stringify({ outcome: r.outcome, state: r.state, rebuild_id: r.rebuild_id, updated: r.updated, inserted: r.inserted, removed: r.removed, restored: r.restored, check: r.check, representation_version: r.representation_version, withdrawn_since: r.withdrawn_since, withdrawn_reason: r.withdrawn_reason, dangling: r.dangling })}`);
    if (r.outcome === 'restored' && r.state === 'serving' && Number(r.updated) === 0 && Number(r.inserted) === 0 && Number(r.removed) === 0 && r.representation_version === '1' && Number(r.check?.mismatched) === 0 && Number(r.check?.missing) === 0 && Number(r.check?.unexpected) === 0 && r.check?.representation_ok === true && r.withdrawn_reason === 'representation review before the ontology proposal') ok(`the administrator REBUILT edges_current → ${r.outcome}: updated 0, inserted 0, removed 0 — honest: nothing drifted on the demonstration; the re-check mismatched 0 / missing 0 / unexpected 0 / representation ok; representation ${r.representation_version}; the withdrawal it closed: since ${r.withdrawn_since} (${r.withdrawn_reason})`);
    else bad(`the rebuild's outcome: ${JSON.stringify({ outcome: r.outcome, state: r.state, updated: r.updated, inserted: r.inserted, removed: r.removed, check: r.check, representation_version: r.representation_version, refusal: r.refusal ?? null }).slice(0, 400)}`);
    const st = await stateOf(D, 'the origin');
    if (st !== null) {
      const e = st.find((x) => x.projection === 'edges_current');
      if (e?.state === 'serving' && e?.last_rebuild_id === r.rebuild_id && e?.rebuilt_at) ok(`the partition edges_current: serving, last_rebuild_id ${short(e.last_rebuild_id)}, rebuilt_at ${iso(e.rebuilt_at)}; representation ${e.representation_version}`); else bad(`the partition after the rebuild: ${stateLine(st)}`);
    }
    const ledger = await q(`select event, details ->> 'by' as by, details ->> 'changed' as changed from graph.projection_events where tenant_id = $1 and domain_id = $2 and projection = 'edges_current' and occurred_at >= $3 order by occurred_at, event_id`, [T, D, t0]);
    const life = ledger.map((e) => `${e.event}${e.by ? ` ${e.by}` : ''}`);
    if (JSON.stringify(life) === JSON.stringify(['projection.withdrawn operator', 'projection.withdrawn operator', 'projection.restored'])) ok(`the ledger since the withdrawal: ${life.join(' → ')} (changed ${ledger.map((e) => e.changed ?? '—').join('/')})`);
    else bad(`the ledger since the withdrawal: ${life.join(' → ')}`);
    // THE EVENT and its deliveries (C4): one GraphChanged/projection.rebuilt — no identities, no relationships, no walk — six deliveries.
    const row = await waitOutbox(D, 'projection.rebuilt', r.rebuild_id, t0ms);
    if (row === null) bad('no published GraphChanged/projection.rebuilt for the rebuild within 30 s');
    else {
      const p = row.payload;
      if ((p.identities ?? []).length === 0 && (p.relationships?.edges ?? []).length === 0 && p.objects?.walked === false && p.projection?.outcome === 'restored' && p.cause?.action === 'graph.projection.rebuild' && p.cause?.target_type === 'PRJ') ok(`GraphChanged/projection.rebuilt ${short(row.id)} (partition ${row.partition_key} seq ${row.partition_seq}): identities [], relationships.edges [], objects.walked false; the typed block ${JSON.stringify({ projection: p.projection.projection, outcome: p.projection.outcome, updated: p.projection.updated, inserted: p.projection.inserted, removed: p.projection.removed, representation_version: p.projection.representation_version })}; cause ${p.cause.action} by ${short(p.cause.actor)} on ${p.cause.target_type} ${short(p.cause.target_id)}`);
      else bad(`the projection.rebuilt row: ${JSON.stringify({ identities: p.identities, edges: p.relationships?.edges, walked: p.objects?.walked, projection: p.projection, cause: p.cause }).slice(0, 500)}`);
      const ds = await settled(row.id);
      const rtv = byKind(ds, 'retrieval'); const chk = await retrievalCheck(row.id);
      const others = ds.filter((d) => d.consumer_kind !== 'retrieval');
      if (ds.length >= liveBroad && rtv !== null && rtv.state === 'applied' && effectsOf(rtv).includes('projections.verified') && chk?.mismatched === 0 && others.every((d) => d.state === 'applied' && (d.items ?? []).length === 0)) ok(`the deliveries (${ds.length} of ${liveBroad} live broad subscriptions): ${deliveryLine(ds)} — retrieval verified; the ${others.length} others applied with nothing (a rebuild changes no fact of the world); the relationships subscriber is selected on MemoryCorrected/claim.corrected and receives no GraphChanged`);
      else bad(`the deliveries of projection.rebuilt: ${deliveryLine(ds) || 'none'}; ${checkLine(chk)}`);
      note(`the retrieval ${checkLine(chk)}`);
    }
  }
  // THE DELETION resolved again and WITHDRAWN — never executed by the act.
  if (DEL !== null) {
    const rs = await resolve(DEL);
    if (!rs.ok) fail('actions/resolve again (p.novak)', rs);
    else {
      const sc = rs.body.scope;
      if (sc.state === 'scope_resolved' && Number(sc.execute) >= 1) ok(`P. Novák resolved the paused deletion ${short(DEL)} again: ${sc.state}, ${sc.execute} to execute, ${sc.blocking ?? 0} blocking (the scope proven over the rebuilt projection; a new approval would be needed to execute — none is given)`);
      else bad(`the re-resolution: ${JSON.stringify(sc).slice(0, 300)}`);
      const wd = await withdrawAction(DEL, 'the pause was shown; nothing is retired by the act');
      if (wd.ok && (await actionRow(DEL))?.state === 'withdrawn') ok(`P. Novák WITHDREW the deletion ${short(DEL)}: the manifest, its bytes and every record stand as they were`); else fail('actions/withdraw (p.novak)', wd);
    }
  }
  // THE READS current again with the new verified sequence; the bound lifted.
  if (NORDWERK !== null) {
    const nr = await untilCurrent(`A. Hoffmann /neighbourhood of ${short(NORDWERK.id)} depth 2`, () => neighbourhood(NORDWERK.id, 2), (b) => b.projection);
    if (nr !== null) { const n = nr.body; const bound = n.bound?.projection ?? n.neighbourhood?.bound?.projection; if (bound === false && Number(n.searchedDepth) === 2 && n.neighbourhood?.depthClamped === false) ok(`the neighbourhood's bound lifted: bound.projection false, searchedDepth ${n.searchedDepth} as asked, depthClamped false`); else bad(`the neighbourhood after the rebuild: ${JSON.stringify({ bound, searchedDepth: n.searchedDepth, depthClamped: n.neighbourhood?.depthClamped })}`); }
    const er = await untilCurrent('A. Hoffmann /edges/list', () => edgesList(), (b) => b.projection);
    if (er !== null) { const rows = er.body.edges ?? []; if (er.body.from === undefined && rows.every((x) => x.from === undefined && x.drift === undefined)) ok(`/edges/list from the projection again: ${rows.length} edge(s), no 'from', no drift`); else bad(`/edges/list after the rebuild: from ${er.body.from}, rows with from ${rows.filter((x) => x.from !== undefined).length}`); }
    if (STRAIT !== null) { const pr = await untilCurrent(`A. Hoffmann /path ${short(NORDWERK.id)} → ${short(STRAIT.id)}`, () => path(NORDWERK.id, STRAIT.id), (b) => b.projection); if (pr !== null) { if (pr.body.bound?.projection === false) ok(`/path bound ${JSON.stringify(pr.body.bound)}`); else bad(`/path after the rebuild: bound ${JSON.stringify(pr.body.bound)}`); } }
  }
}

/* ── 4. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n4. THE STATE — the partitions of both domains; the register; what the act leaves; the stated limits');
for (const [domainId, label] of domains) { const st = await stateOf(domainId, label); if (st !== null) note(`${label}: ${stateLine(st)}`); }
await registerLine('after');
{
  const ledger = t0 === null ? [] : await q(`select event, details ->> 'by' as by from graph.projection_events where tenant_id = $1 and domain_id = $2 and occurred_at >= $3 order by occurred_at`, [T, D, t0]);
  const subsNow = await Promise.all(domains.map(async ([domainId, label]) => { const rows = await q(`select consumer_kind, status, checkpoint_seq::int cs from graph.subscriptions where tenant_id = $1 and domain_id = $2 and consumer_kind = 'retrieval' order by created_at`, [T, domainId]); return `${label}: retrieval subscriptions ${rows.map((r) => `${r.status}${r.cs === null ? '' : `@${r.cs}`}`).join(', ')}`; }));
  note(`WHAT THE ACT LEAVES: ${subsNow.join('; ')}; the origin's edges_current ledger rows of this run ${ledger.length} (${ledger.map((e) => `${e.event}${e.by ? ` ${e.by}` : ''}`).join(', ') || 'none'}); the deletion action ${short(DEL)} ${DEL === null ? '(none opened)' : (await actionRow(DEL))?.state}; the briefing ${short(BRIEF)}; nothing retired; no persona created`);
}
note('STATED: the demonstration cannot exhibit a real drift, a poisoned or a missing row without corrupting the copy — the harness carries drift / poison / missing / representation (phase6-graph-projections-b20 P2–P5) and the demonstration\'s rebuild is a RESTORATION (updated 0, inserted 0, removed 0), said honestly; a real representation change arrives with a migration that bumps graph.projection_representation_version(); the memory content-tier fault is the harness\'s (a fault point is armable in the test profile only); the search\'s bound cannot be exceeded on the demonstration\'s entities (P8); lag is VERIFICATION lag — the ports write a projection and its log in one transaction; a withdrawal blocks no write; a held poisoned row is a person\'s decision; the evidence bytes\' unavailability stays the vault\'s 409 (D10); no persona is new (the administrator of the act is the platform-admin session — the demonstration has no domain_admin persona)');
note('STATED: only the RETRIEVAL consumer\'s method changed in B20 — its subscriptions were re-registered where outdated and the six other kinds were listed and left');

console.log(`\nWHAT THE DEMONSTRATION SHOWED: the index tier of this product is the projection set, and from 0080 every graph and memory read declares its product state — the revision, the sequence the retrieval subscriber verified through, the dispatcher's cursor beside it, the lag, each partition's condition; the administrator WITHDREW the edges projection on a representation review and the explore walk was served from the event log, labelled EYE-DEG-001 and constrained to two hops while the search and the memory reads stayed current; P. Novák's approved deletion PAUSED at execution because the safe scope reads a withdrawn projection; S. Okafor's briefing stayed undegraded and said which projection it rests on; the REBUILD restored the partition honestly (nothing to write), announced itself once to the six subscribers with no identity and no walk, and the retrieval subscriber verified it; the paused deletion was resolved again and withdrawn, nothing retired; the register at 36 bound with L3-I02's clause.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-graph-projections-b20 on a fresh database): the watermark on all twelve routes through paused / resumed / revoked / re-registered; a drifted row withdrawn by the check and served from the log with its drift named; a poisoned row named where the JOIN-only check read 0, removed by the rebuild, and REFUSED where a derived row holds it (the two poison shapes told apart); missing rows re-inserted from the log, the canonical record and the claim's lineage — or named unrebuildable; the representation version; the memory content tier answering metadata-only with no access row and its own ledger row; the deletion paused and executed after the rebuild; the briefing agent stopping on on_degraded.`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
