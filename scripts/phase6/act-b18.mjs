#!/usr/bin/env node
/**
 * CP-6 batch B18 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): THE LIFECYCLE
 * ANNOUNCED — ten register rows bound to the events the product now publishes in the transaction that makes each transition — and the
 * WITHDRAWAL → INVALIDATION → REOPEN chain (a forecast withdrawn as unfit, the run resting on it invalidated by its own reproduction,
 * the committed decision reopened on the recorded note and re-committed; the first commitment immutable) — migration 0078 — exercised
 * by the personas through the REAL HTTP path, each scene stating the effect it produced in the ledgers and the outbox, and where
 * nothing happened, saying so. B18.1 (the Codex B17-F1 correction) is shown on the mirror's standing revoked import.
 *
 *   0. THE SUBSCRIBERS: the seven subscriptions of BOTH domains checked against this process's consumers — the twins and decisions
 *      methods changed in B18 (the twins consumer announces its mark and leaves a twin's own admission alone; the decisions consumer
 *      exposes a withdrawal or an invalidation as a categorical loss and notes a twin's admission without exposure), so their live
 *      subscriptions are REVOKED and registered anew, the replacements replaying from the revoked cursors (the B8 doctrine); the
 *      other five left.
 *   1. B18.1 ON THE DEMONSTRATION: M. Keller revokes the mirror's standing REVOKED import again (B17's scene 3, or the previous run's)
 *      through the import route with source origin → `retried`, every byte list empty — nothing to remove, said so; the mirror's one
 *      LIVE import (E4's) read and printed and NOT touched.
 *   2. K. VOGEL'S TWIN VERSION (the mirror): the mirror twin's next version on branch actual (no carry), ONE estimated element citing
 *      the standing import's record, admitted → TwinStateChanged/version.admitted read from the outbox (supersedes, the changed
 *      variables as added/removed/changed, no dependency impacts: the mirror runs nothing) beside GraphChanged/twin.state_changed and
 *      its six deliveries: every selector empty, retrieval verified.
 *   3. THE ORIGIN'S FORECAST, SCENARIO, TWIN VERSION, RUNS AND PACKAGE: N. Eriksen issues ecb-eurusd at 90 days (weekly cadence, live)
 *      → ForecastIssued@v2 (the expiry from the cadence, the validation, the outbox row's schema_version column) and declares a
 *      scenario on it; T. Nakamura versions the demo twin (the carry of the current actual version plus a predicted element citing the
 *      forecast; the PRECONDITION that the version's cited records are hot is checked — re-archived records are restored first through
 *      the governed restore and said so) → TwinStateChanged with the superseded version's runs as the dependency impacts, the
 *      twin.state_changed deliveries printed honestly (the decisions consumer notes whatever package cites those runs, without
 *      exposure), then runs a control and a reroute on the new version → SimulationStarted/SimulationCompleted ×2 with the resource
 *      evidence; L. Brandt declares a package on the demo DEC, opens the room, cards the status quo (the control) and the reroute (the
 *      intervention + the forecast), sets the terms and the choice, proposes → DecisionPackageReady; S. Okafor approves; L. Brandt
 *      commits → DecisionCommitted (C3).
 *   4. THE CHAIN: N. Eriksen WITHDRAWS the forecast → ForecastWithdrawn (the dependants: the scenario, the twin version, the two runs,
 *      the package) and the forecast.withdrawn deliveries (the scenario marked, the package noted material_change/compensation, the
 *      twin version unverified with its own TwinStateChanged/version.unverified, retrieval verified); T. Nakamura REPRODUCES the
 *      reroute run → unreproducible on the withdrawn forecast → SimulationInvalidated (trigger reproduction) and the
 *      simulation.invalidated deliveries (the package noted again); L. Brandt REOPENS the package on the first note after the
 *      commitment → DecisionReopened (both options dropped and named: the reroute invalidated, the status quo resting on the withdrawn
 *      forecast), the room OPEN again; the second cycle — the status quo on act V's control, an unsimulated wait, the choice, the
 *      proposal (DecisionPackageReady with reopened_from), S. Okafor's approval, the SECOND commitment (DecisionCommitted naming the
 *      first; two commitment rows, the first unchanged); S. Okafor replays version 1 → its decided layer closes at the FIRST
 *      commitment's instant, version 2 at the second.
 *   5. A. HOFFMANN'S CHALLENGE: L. Ferreira decides the standing queued case on the demo claim (the previous run's challenge), then
 *      A. Hoffmann challenges it again → ReviewRequested (queued_reason challenged, routed to the reviewer roles); the extraction's
 *      own ReviewRequested rows since 0078 counted.
 *   6. THE STATE: every B18 event row of this run from the outbox with its partition, sequence, schema version and status; the register
 *      through the route by J. Weber (36 bound / 14 partial / 0 unbound, the ten rows bound in 0078); what the act leaves; the stated
 *      limits.
 *
 * EACH RUN re-issues the 90-day forecast (the previous run's is withdrawn — no supersession), versions both twins once more, declares a
 * new package with its room, decides the previous run's challenge and challenges again; the January package and acts I–V are never
 * reopened, withdrawn or invalidated. NO new persona. Nothing is cleaned. Nothing here prints a credential.
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
const X = `/v1/tenants/${T}/domains/${D}`; const R = `${X}/retention`; const P = `${X}/prediction`; const W = `${X}/twins`; const DC = `${X}/decisions`; const G = `${X}/graph`; const I = `${X}/intelligence`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 8)}…`);
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const maybe = async (l) => login(l, PW);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const TODAY = new Date().toISOString().slice(0, 10);
const tStart = Date.now();
// THE PERSONAS (D19): every one existing; no new persona. The mirror's two are B16/B17's (a missing mirror skips scenes 1–2, said).
const eriksen = await who('n.eriksen'); const nakamura = await who('t.nakamura'); const brandt = await who('l.brandt'); const okafor = await who('s.okafor');
const hoffmann = await who('a.hoffmann'); const ferreira = await who('l.ferreira'); const weber = await who('j.weber'); const novak = await who('p.novak'); const bergmann = await who('h.bergmann');
const keller = await maybe('m.keller'); const vogel = await maybe('k.vogel');
const P_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ne = P_(eriksen, 'prediction'); const tn = P_(nakamura, 'twin'); const sm = P_(nakamura, 'simulation'); const lb = P_(brandt, 'decision'); const so = P_(okafor, 'decision');
const ah = P_(hoffmann, 'intelligence'); const lf = P_(ferreira, 'intelligence'); const jw = P_(weber, 'graph'); const pn = P_(novak, 'retention'); const hb = P_(bergmann, 'retention');
// The seven subscriber kinds (B6; the relationships subscriber of B9) and the demonstration's selection for the seventh (register-subscriptions.mjs).
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'];
const SELECTION = { relationships: { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } };
const BROAD = KINDS.filter((k) => SELECTION[k] === undefined);
/** The ten event types 0078 binds (scene 6 lists this run's rows of them). */
const B18_EVENTS = ['TwinStateChanged', 'SimulationStarted', 'SimulationCompleted', 'DecisionPackageReady', 'DecisionCommitted', 'ReviewRequested', 'ForecastIssued', 'ForecastWithdrawn', 'SimulationInvalidated', 'DecisionReopened'];
const BOUND_IN_0078 = ['L2-I04', 'L5-I04', 'L6-I02', 'L6-I05', 'L8-I02', 'L8-I03', 'L8-I05', 'L9-I02', 'L9-I04', 'L9-I05'];

/* ── the outbox, the deliveries, the ledgers ─────────────────────────────── */
/** The newest published row of an event type in a domain since a mark, matched on top-level payload keys (the keys are this file's literals). */
async function waitEvent(domainId, eventType, where, notBefore, seconds = 30) {
  const keys = Object.keys(where);
  const conds = keys.map((k, i) => `and payload ->> '${k}' = $${i + 4}`).join(' ');
  for (let i = 0; i < seconds; i += 1) {
    const row = (await q(`select id::text, event_type, status, partition_key, partition_seq::int, schema_version, correlation_id::text, payload, created_at from objects.object_outbox
        where event_type = $1 and tenant_id = $2 and domain_id = $3 ${conds} and created_at >= $${keys.length + 4} order by created_at desc limit 1`, [eventType, T, domainId, ...keys.map((k) => String(where[k])), new Date(notBefore - 1000)]))[0] ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
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
const eventLine = (r) => `${r.event_type}@${r.schema_version ?? '—'} ${short(r.id)} (partition ${r.partition_key} seq ${r.partition_seq}, ${r.status})`;
const deliveriesOf = (eventId) => q(`select consumer_kind, state, items, items_applied, attempts, last_error from graph.subscription_deliveries where event_id = $1 order by consumer_kind`, [eventId]);
/** Wait for every delivery of an event to be terminal (the B16 loop). */
async function settled(eventId, expected = BROAD.length, seconds = 90) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = await deliveriesOf(eventId);
    if (ds.length >= expected && ds.every((d) => ['applied', 'failed', 'refused'].includes(d.state))) { await sleep(1500); return ds; }
    await sleep(1000);
  }
  return ds;
}
const effectsOf = (d) => [...new Set((d.items_applied ?? []).map((x) => x.effect))].join(', ');
const deliveryLine = (ds) => ds.map((d) => `${d.consumer_kind} ${d.state}${(d.items ?? []).length > 0 ? ` (${(d.items ?? []).length} item(s): ${effectsOf(d) || 'no effect recorded'})` : ' (no items)'}${d.last_error ? ` — ${String(d.last_error).slice(0, 120)}` : ''}`).join('; ');
const byKind = (ds, k) => ds.find((d) => d.consumer_kind === k) ?? null;
const retrievalCheck = async (eventId) => (await q(`select mismatched::int, touched from graph.retrieval_checks where outbox_event_id = $1 order by checked_at desc limit 1`, [eventId]))[0] ?? null;
/** N-k: the changed variables as the event lists them — added, removed, changed — by key. */
const variablesLine = (changed) => {
  const of = (c) => (changed ?? []).filter((v) => v.change === c).map((v) => v.key);
  const parts = [['added', of('added')], ['removed', of('removed')], ['changed', of('changed')]].filter(([, ks]) => ks.length > 0).map(([c, ks]) => `${c} ${ks.join(', ')}`);
  return parts.length === 0 ? 'none (the values stand; only citations moved)' : parts.join('; ');
};
const packageNotes = (pkg) => q(`select event_id::text, occurred_at, details from decision.package_events where package_id = $1 and event = 'input.invalidated' order by occurred_at`, [pkg]);
const commitmentRows = (pkg) => q(`select commitment_id::text, version::int, committed_at, decision.iso(committed_at) committed_at_iso, committed_by::text, version_digest from decision.commitments where package_id = $1 order by committed_at`, [pkg]);
const twinVersionRow = (twinId, version) => q(`select state, verification_state, completeness, observed_through from twin.twin_versions where twin_id = $1 and version = $2`, [twinId, version]).then((r) => r[0] ?? null);

/* ── the subscriptions (the B17 closure: a changed method is a new consumer) ── */
const subscriptionStatus = async (domainId, label) => {
  const r = await call(`/v1/tenants/${T}/domains/${domainId}/graph/subscriptions/status`, { scope: 'DOMAIN', tenantId: T, domainId, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }, {}, admin.token);
  if (!r.ok) { fail(`subscriptions/status (${label})`, r); return null; }
  return r.body.subscriptions;
};
/**
 * The subscribers of a domain, IDEMPOTENT by kind — a kind with an active subscription whose consumer identity (version, code digest)
 * is this process's is left; one registered for a consumer whose METHOD has since changed is REVOKED and the kind registered anew, the
 * replacement replaying from the revoked subscription's cursor (B8: a changed method is a new consumer; B18 changed twins and decisions);
 * a kind without one is registered — the administrator registers, the owner is the accountable human of the domain.
 */
async function ensureSubscriptions(domainId, ownerPrincipalId, label) {
  const GS = `/v1/tenants/${T}/domains/${domainId}/graph`;
  const ad = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', ...over });
  let st = await subscriptionStatus(domainId, label);
  if (st === null) return null;
  for (const kind of KINDS) {
    const live = (st.subscriptions ?? []).find((s) => s.consumer_kind === kind && s.status === 'active');
    const current = (st.consumers ?? []).find((c) => c.kind === kind);
    if (live !== undefined && current !== undefined && (live.code_digest !== current.codeDigest || live.consumer_version !== current.version)) {
      const rv = await call(`${GS}/subscriptions/${live.subscription_id}/revoke`, ad({ action: 'graph.subscription.control', objectType: 'SUB', objectId: live.subscription_id, consequence: 'C2' }),
        { reason: `B18: the ${kind} consumer's method changed (${String(live.code_digest).slice(0, 12)}… → ${String(current.codeDigest).slice(0, 12)}…); a changed method is a new consumer` }, admin.token);
      if (!rv.ok) { bad(`${label}: ${kind}: the outdated subscription could not be revoked (${rv.status}) ${rv.body?.message ?? ''}`); continue; }
      note(`${label}: ${kind}: subscription ${short(live.subscription_id)} was registered for consumer ${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…; this process's ${kind} consumer is ${current.version} ${String(current.codeDigest).slice(0, 12)}… — REVOKED, registered anew (a changed method is a new consumer)`);
    } else if (live !== undefined) { ok(`${label}: ${kind}: subscription ${short(live.subscription_id)} already active (consumer ${live.consumer_version} ${String(live.code_digest).slice(0, 12)}…)`); continue; }
    const r = await call(`${GS}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }),
      { consumerKind: kind, ownerPrincipalId, backlog: 'leave', ...(SELECTION[kind] ?? {}) }, admin.token);
    if (!r.ok) { bad(`${label}: ${kind}: registration refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`); continue; }
    const s = r.body.subscription;
    ok(`${label}: ${kind}: registered subscription ${short(s.subscriptionId)}, principal ${short(s.principalId)} (role ${s.role}), consumer ${s.consumer.version} ${String(s.consumer.codeDigest).slice(0, 12)}…${SELECTION[kind] ? `, selection ${JSON.stringify(SELECTION[kind])}` : ''}; worker running ${r.body.served.workerRunning}`);
    if (live !== undefined) {
      const from = live.checkpoint_seq === null || live.checkpoint_seq === undefined ? {} : { fromSeq: Number(live.checkpoint_seq) };
      const rp = await call(`${GS}/subscriptions/${s.subscriptionId}/replay`, ad({ action: 'graph.subscription.replay', objectType: 'SUB', objectId: s.subscriptionId, consequence: 'C2' }),
        { ...from, reason: `B18: the ${kind} consumer changed; the replacement replays from the revoked subscription's cursor` }, admin.token);
      if (!rp.ok) bad(`${label}: ${kind}: the replacement's replay was refused (${rp.status}) ${rp.body?.message ?? ''}`);
      else note(`${label}: ${kind}: replayed ${rp.body.replayed} event(s) to the replacement from ${from.fromSeq === undefined ? 'the retained beginning' : `sequence ${from.fromSeq}`}`);
    }
  }
  st = await subscriptionStatus(domainId, label);
  return st;
}

/* ── the governed retention acts of the origin (the restore precondition, N-g) ── */
const open = (payload) => call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), payload, novak.token);
const resolve = (id) => call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
const approve = (id, digest, rationale) => call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale }, bergmann.token);
const execute = (id) => call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
const verify = (id) => call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
/**
 * N-g: a run needs the version's required inputs HOT — B12 may have re-archived the NORDWERK records the demo twin cites. The records
 * the current version cites are read with their tier; the cold ones are RESTORED through the governed restore (P. Novák opens, H.
 * Bergmann approves on the scope digest, P. Novák executes and verifies) before the new version is opened, and the act says so.
 */
async function ensureHotInputs(twinId, version) {
  const cited = await q(`select distinct (c ->> 'id') id from twin.state_elements e, jsonb_array_elements(e.citations) c where e.twin_id = $1 and e.version = $2 and (c ->> 'kind') = 'evidence'`, [twinId, version]);
  const rows = cited.length === 0 ? [] : await q(`select o.object_id::text id, (array_agg(o.payload ->> 'manifest_id' order by o.object_version desc))[1] manifest_id, (array_agg(o.retention_profile order by o.object_version desc))[1] retention_profile
      from objects.canonical_objects o where o.object_type = 'EVD' and o.object_id = any($1::uuid[]) group by o.object_id`, [cited.map((c) => c.id)]);
  const tiers = [];
  for (const r of rows) tiers.push({ ...r, tier: r.manifest_id === null ? 'unknown' : (await q('select observation.manifest_tier($1::uuid) t', [r.manifest_id]))[0].t });
  const cold = tiers.filter((t) => t.tier === 'archive');
  if (tiers.length === 0) { note(`precondition: version ${version} cites no evidence record (nothing to keep hot)`); return true; }
  if (cold.length === 0) { ok(`precondition: the ${tiers.length} record(s) the twin's version ${version} cites are HOT (${[...new Set(tiers.map((t) => t.tier))].join(', ')}) — a run on the new version may read them`); return true; }
  note(`precondition: ${cold.length} of the ${tiers.length} cited record(s) are in the ARCHIVE tier (B12 re-archived them) — restored first through the governed restore, so that the runs of scene 3 can read their bytes`);
  const o = await open({ kind: 'restore', targetKind: 'evidence', selector: { manifestIds: cold.map((c) => c.manifest_id) }, retentionProfile: cold[0].retention_profile ?? null, reason: 'the demo twin\'s required inputs are wanted hot for the B18 runs; the bytes come back from the cold tier' });
  if (!o.ok) { fail('open restore (p.novak)', o); return false; }
  const id = o.body.action.actionId;
  const rs = await resolve(id);
  const ap = rs.ok ? await approve(id, rs.body.scope.scope_digest, 'the records return to the hot tier for the B18 demonstration; the manifests and their digests are kept') : null;
  if (!rs.ok || ap === null || !ap.ok) { fail('resolve/approve restore', rs.ok ? ap : rs); return false; }
  const ex = await execute(id);
  if (!ex.ok) { fail('execute restore (p.novak)', ex); return false; }
  const vf = await verify(id);
  if (vf.ok && vf.body.verification.verified === true) { ok(`the restore ${short(id)}: ${ex.body.execution.executed} record(s) restored (refused ${ex.body.execution.refused}), verified — P. Novák opened and executed, H. Bergmann approved on the scope digest`); return true; }
  bad(`the restore ${short(id)} did not verify: ${JSON.stringify(vf.body?.verification ?? vf.body).slice(0, 300)}`); return false;
}

console.log(`THE EYE — CP-6 B18 on the demonstration: the lifecycle announced (ten register rows bound); the withdrawal → invalidation → reopen chain; B18.1 on the mirror (migration 0078)`);
console.log(`target ${API} · database ${env.EYE_DB_NAME ?? 'eye_demo'} · tenant ${short(T)} · origin domain ${short(D)} · ${new Date().toISOString()}`);
console.log('each run re-issues the 90-day forecast, versions both twins once more, declares a new package with its room, decides the previous run\'s challenge and challenges again; acts I–V are never rewritten');

/* ── the mirror (B16/B17's), read only ──────────────────────────────────── */
const D2_NAME = 'NORDWERK Exchange Mirror (SYNTHETIC)';
let D2 = null;
try { const d = await domainByName(admin, T, D2_NAME); D2 = d === null ? null : d.id; } catch (e) { bad(`the mirror domain: ${e.message}`); }
const mirrorReady = D2 !== null && keller !== null && vogel !== null;
if (!mirrorReady) bad(`the mirror is not prepared (domain ${D2 === null ? 'ABSENT' : 'present'}; m.keller ${keller === null ? 'NOT available' : 'ok'}; k.vogel ${vogel === null ? 'NOT available' : 'ok'}) — run scripts/phase6/act-b16.mjs and act-b17.mjs first; scenes 1–2 are skipped`);
const X2 = () => `/v1/tenants/${T}/domains/${D2}`;
const mk = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${keller.principalId}`, purposeId: 'retention', ...over });
const kv = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D2, principalId: `principal:${vogel.principalId}`, purposeId: 'twin', ...over });

/* ── 0. THE SUBSCRIBERS ──────────────────────────────────────────────────── */
console.log('\n0. THE SUBSCRIBERS — the seven subscriptions of both domains checked against this process\'s consumers (twins and decisions changed in B18: revoked, registered anew, replayed); the other five left');
await ensureSubscriptions(D, weber.principalId, 'the origin');
if (mirrorReady) await ensureSubscriptions(D2, keller.principalId, 'the mirror');

/* ── 1. B18.1 ON THE DEMONSTRATION ───────────────────────────────────────── */
console.log('\n1. B18.1 ON THE DEMONSTRATION — M. Keller revokes the mirror\'s standing REVOKED import again: retried, nothing to remove, said so; the mirror\'s live import untouched');
if (mirrorReady) {
  const revoked = (await q(`select import_id::text, revoked_at, revocation_attempts::int, revocation from retention.imports where tenant_id = $1 and domain_id = $2 and state = 'revoked' order by revoked_at desc limit 1`, [T, D2]))[0] ?? null;
  const live = await q(`select import_id::text, admitted_at, counts, origin from retention.imports where tenant_id = $1 and domain_id = $2 and state = 'admitted' order by admitted_at desc`, [T, D2]);
  if (revoked === null) note('no revoked import in the mirror: B18.1\'s retry has nothing to answer on this demonstration (B17\'s scene 3 leaves one)');
  else {
    const rr = await call(`${X2()}/retention/imports/${revoked.import_id}/revoke`, mk({ action: 'retention.import.revoke', objectType: 'RIM', objectId: revoked.import_id, consequence: 'C2' }), { source: { kind: 'origin' } }, keller.token);
    if (!rr.ok) fail('imports/revoke (m.keller, the revoked import)', rr);
    else {
      const rv = rr.body.revocation ?? {}; const bytes = rv.bytes ?? {};
      const lists = ['residual', 'removed', 'failed', 'remaining'].map((k) => `${k} ${JSON.stringify(bytes[k] ?? [])}`).join(', ');
      if (rv.state === 'retried' && (bytes.removed ?? []).length === 0 && (bytes.failed ?? []).length === 0 && (bytes.remaining ?? []).length === 0 && (rv.receipt ?? null) === null) ok(`the revoked import ${short(revoked.import_id)} (revoked ${iso(revoked.revoked_at)} after ${revoked.revocation_attempts} attempt(s)) revoked again by M. Keller: state ${rv.state}, attempt ${rv.attempt ?? '?'}; bytes { ${lists} } — nothing to remove, said so; no receipt, no new event (B18.1: a redelivery of a completed revocation adds no lifecycle effect)`);
      else bad(`the retry on the revoked import: ${JSON.stringify({ state: rv.state, bytes, receipt: rv.receipt, answered: rv.answered }).slice(0, 500)}`);
      const after = (await q(`select state, revocation_attempts::int from retention.imports where import_id = $1`, [revoked.import_id]))[0];
      note(`the import row after the retry: state ${after.state}, revocation_attempts ${after.revocation_attempts}`);
    }
  }
  if (live.length === 1) ok(`the mirror's ONE live import ${short(live[0].import_id)} (admitted ${iso(live[0].admitted_at)}, origin action ${short(live[0].origin?.action_id)}, counts ${JSON.stringify(live[0].counts ?? {})}) — read, NOT touched: K. Vogel's twin cites its record`);
  else bad(`admitted imports in the mirror: ${live.length} (expected the one E4 left)`);
}

/* ── 2. K. VOGEL'S TWIN VERSION (the mirror) ─────────────────────────────── */
console.log('\n2. K. VOGEL\'S TWIN VERSION — the mirror twin\'s next version on branch actual, one estimated element citing the standing import\'s record, admitted: TwinStateChanged/version.admitted, GraphChanged/twin.state_changed and its six deliveries (every selector empty)');
if (mirrorReady) {
  const tl = await call(`${X2()}/twins/list`, kv({ action: 'twin.read', objectType: 'TWN', sideEffect: 'none' }), {}, vogel.token);
  const TW2 = tl.ok ? ((tl.body.twins ?? []).find((t) => /^NORDWERK — the imported corridor \(mirror/.test(String(t.title))) ?? null) : null;
  const standing = (await q(`select import_id::text from retention.imports where tenant_id = $1 and domain_id = $2 and state = 'admitted' order by admitted_at desc limit 1`, [T, D2]))[0] ?? null;
  if (!tl.ok) fail('twins/list (k.vogel)', tl);
  else if (TW2 === null) bad('the mirror twin "NORDWERK — the imported corridor (mirror)" is absent: B17\'s scene 2 has not run');
  else if (standing === null) bad('no admitted import in the mirror: nothing for the new version to cite');
  else {
    const ig = await call(`${X2()}/retention/imports/${standing.import_id}/get`, mk({ action: 'retention.read', objectType: 'RIM', objectId: standing.import_id, sideEffect: 'none' }), {}, keller.token);
    const recordItem = ig.ok ? ((ig.body.items ?? []).find((it) => it.kind === 'record' && (it.disposition === 'admitted' || it.disposition === 'reused') && it.admitted?.object_id) ?? null) : null;
    const tg = await call(`${X2()}/twins/${TW2.twin_id}/get`, kv({ action: 'twin.read', objectType: 'TWN', objectId: TW2.twin_id, sideEffect: 'none' }), {}, vogel.token);
    const versions = tg.ok ? (tg.body.twin?.versions ?? []) : [];
    const currentN = versions.filter((v) => v.branch_id === 'actual' && v.state === 'admitted').map((v) => Number(v.version)).sort((a, b) => b - a)[0] ?? null;
    if (recordItem === null) bad(`the standing import ${short(standing.import_id)} carries no admitted record item to cite`);
    else if (currentN === null) bad(`the mirror twin ${short(TW2.twin_id)} has no admitted version on branch actual`);
    else {
      const record = { id: recordItem.admitted.object_id, version: Number(recordItem.admitted.object_version ?? 1) };
      note(`the mirror twin ${short(TW2.twin_id)}: current admitted version ${currentN} on branch actual (${(await twinVersionRow(TW2.twin_id, currentN))?.verification_state ?? '?'}); the standing import ${short(standing.import_id)}'s record ${short(record.id)}@${record.version} is the citation`);
      const t0 = Date.now();
      const o = await call(`${X2()}/twins/${TW2.twin_id}/versions/open`, kv({ action: 'twin.version', objectType: 'TWN', objectId: TW2.twin_id }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: null }, vogel.token);
      if (!o.ok) fail('twins/versions/open (k.vogel)', o);
      else {
        const v = o.body.version.version;
        const g = await call(`${X2()}/twins/${TW2.twin_id}/versions/${v}/ground`, kv({ action: 'twin.ground', objectType: 'TWN', objectId: TW2.twin_id }), { elements: [
          { key: 'route.cape_transit_days', kind: 'estimated', value: 12 + v, unit: 'days', citations: [{ kind: 'evidence', id: record.id, version: record.version }] },
        ] }, vogel.token);
        if (!g.ok) fail('twins/versions/ground (k.vogel)', g);
        else {
          const a = await call(`${X2()}/twins/${TW2.twin_id}/versions/${v}/admit`, kv({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW2.twin_id }), { allowIncomplete: true }, vogel.token);
          if (!a.ok) fail('twins/versions/admit (k.vogel)', a);
          else {
            ok(`K. Vogel opened version ${v} (no carry: the previous version's element is not copied), grounded route.cape_transit_days = ${12 + v} days citing the imported record ${short(record.id)}@${record.version}, admitted as ${a.body.admitted.completeness} (${(a.body.admitted.missingKeys ?? []).length} required input(s) not grounded; no run may use it)`);
            const ev = await waitEvent(D2, 'TwinStateChanged', { twin_id: TW2.twin_id, change: 'version.admitted' }, t0);
            if (ev === null) bad('no published TwinStateChanged/version.admitted for the mirror twin within 30 s');
            else {
              const p = ev.payload;
              const runsN = (p.dependency_impacts?.runs ?? []).length;
              if (Number(p.version) === v && p.change === 'version.admitted' && p.verification_state === 'verified' && Number(p.supersedes) === currentN && runsN === 0 && p.cause?.action === 'twin.version.admit') ok(`${eventLine(ev)}: version ${p.version} supersedes ${p.supersedes} (branch ${p.branch_id}); changed_variables: ${variablesLine(p.changed_variables)}; freshness { known_at ${iso(p.freshness?.known_at)}, observed_through ${p.freshness?.observed_through ?? 'none'}, completeness ${p.freshness?.completeness} }; dependency_impacts.runs ${runsN} (the mirror runs nothing); cause ${p.cause.action} by ${short(p.cause.actor)}`);
              else bad(`the TwinStateChanged payload: ${JSON.stringify({ version: p.version, supersedes: p.supersedes, change: p.change, verification_state: p.verification_state, runs: runsN, cause: p.cause }).slice(0, 400)}`);
            }
            const gc = await waitOutbox(D2, 'twin.state_changed', TW2.twin_id, t0);
            if (gc === null) bad('no published GraphChanged/twin.state_changed for the mirror twin within 30 s');
            else {
              const objs = gc.payload.objects ?? {};
              const ds = await settled(gc.id);
              const rt = byKind(ds, 'retrieval'); const check = await retrievalCheck(gc.id);
              const selectorsEmpty = ['twins', 'forecasts', 'scenarios', 'decisions', 'memory-mappings'].every((k) => byKind(ds, k)?.state === 'applied' && (byKind(ds, k)?.items ?? []).length === 0);
              if (ds.length === BROAD.length && selectorsEmpty && rt?.state === 'applied' && effectsOf(rt).includes('projections.verified') && check?.mismatched === 0) ok(`GraphChanged/twin.state_changed ${short(gc.id)} (objects.twins [${short(objs.twins?.[0])}], objects.simulations ${(objs.simulations ?? []).length}, walked ${objs.walked}); deliveries: ${deliveryLine(ds)} — every selector empty (a twin's own admission marks nothing; nothing of the mirror cites its runs), retrieval verified with ${check.mismatched} mismatched`);
              else bad(`the deliveries of twin.state_changed: ${deliveryLine(ds) || 'none'}; retrieval check ${JSON.stringify(check)}`);
              const vr = await twinVersionRow(TW2.twin_id, v); const prev = await twinVersionRow(TW2.twin_id, currentN);
              note(`the mirror twin now: version ${v} ${vr?.state} ${vr?.verification_state}; version ${currentN} ${prev?.state} ${prev?.verification_state} (a twin's own admission leaves its predecessor as it was)`);
            }
          }
        }
      }
    }
  }
}

/* ── 3. THE ORIGIN'S FORECAST, SCENARIO, TWIN VERSION, RUNS AND PACKAGE ──── */
console.log('\n3. THE ORIGIN — N. Eriksen\'s 90-day forecast (ForecastIssued@v2) and scenario; T. Nakamura\'s twin version citing it (TwinStateChanged) and two runs (SimulationStarted/Completed); L. Brandt\'s package on the demo DEC, proposed (DecisionPackageReady), approved by S. Okafor, committed (DecisionCommitted)');
let F = null; let SCN = null; let TW = null; let currentV = null; let newV = null; let control = null; let reroute = null; let PKG = null; let ROOM = null; let cm1 = null; let cmRow1 = null; let digest1 = null;
let fxAsu = null; let corridorAsu = null; let objective = null; let DEC = null; let transitIndicator = null;
{
  const sl = await call(`${G}/strategy/list`, jw({ action: 'graph.read', objectType: 'ASU', sideEffect: 'none' }), { limit: 300 }, weber.token);
  const rows = sl.ok ? (sl.body.strategy ?? []) : [];
  fxAsu = rows.find((x) => x.object_type === 'ASU' && /EUR\/USD/i.test(x.title)) ?? null;
  corridorAsu = rows.find((x) => x.object_type === 'ASU' && /corridor stays open/i.test(x.title)) ?? null;
  objective = rows.find((x) => x.object_type === 'OBJ' && /Regensburg line supplied/i.test(x.title)) ?? null;
  if (!sl.ok) fail('graph/strategy/list (j.weber)', sl);
  if (fxAsu === null) bad('act IV\'s fx assumption "EUR/USD stays within its recent regime" is absent'); if (corridorAsu === null) bad('act III\'s corridor assumption is absent'); if (objective === null) bad('act III\'s objective is absent');
  const pl = await call(`${DC}/list`, lb({ action: 'decision.read', objectType: 'DPK', sideEffect: 'none' }), {}, brandt.token);
  const january = pl.ok ? ((pl.body.packages ?? []).find((p) => p.title === 'January corridor collapse — Regensburg line') ?? null) : null;
  DEC = january?.decision_object_id ?? rows.find((x) => x.object_type === 'DEC' && x.title === 'January corridor collapse — response')?.strategy_object_id ?? null;
  if (DEC === null) bad('the demo DEC (the January package\'s decision object) is absent — run scripts/phase6/seed-decisions.mjs first');
  else note(`the demo DEC ${short(DEC)}${january ? ` (the January package ${short(january.package_id)}, ${january.state})` : ''}; the fx assumption ${short(fxAsu?.strategy_object_id)}; the corridor assumption ${short(corridorAsu?.strategy_object_id)}; the objective ${short(objective?.strategy_object_id)}`);
  const il = await call(`${P}/indicators/list`, ne({ action: 'prediction.read', objectType: 'IND', sideEffect: 'none' }), {}, eriksen.token);
  transitIndicator = il.ok ? ((il.body.indicators ?? []).find((i) => /chokepoint4/.test(String(i.series_key))) ?? null) : null;
}
// (a) THE FORECAST: ecb-eurusd at 90 days, weekly cadence, live — a previous run's 90-day forecast is withdrawn, so nothing is superseded.
if (fxAsu !== null) {
  const previous = await q(`select forecast_id::text, state from prediction.forecasts_current where tenant_id = $1 and domain_id = $2 and series_key = 'ecb-eurusd' and horizon_code = '90d' order by issued_at desc limit 3`, [T, D]);
  const tIssue = Date.now();
  const r = await call(`${P}/forecasts/issue`, ne({ action: 'prediction.forecast.issue', objectType: 'FCT' }), { seriesKey: 'ecb-eurusd', horizon: '90d', assumptions: [fxAsu.strategy_object_id], refreshCadence: 'weekly', label: 'live' }, eriksen.token);
  if (!r.ok) fail('forecasts/issue ecb-eurusd 90d (n.eriksen)', r);
  else {
    F = r.body.forecast.forecastId;
    ok(`N. Eriksen issued ecb-eurusd at 90 days [${r.body.forecast.validationState}] ${short(F)}, weekly cadence, live; superseded_forecast_id ${r.body.forecast.supersededForecastId === null ? 'null — ' + (previous.length === 0 ? 'no earlier 90-day forecast' : `the earlier 90-day forecast(s) are ${[...new Set(previous.map((p) => p.state))].join('/')}, not issued`) : short(r.body.forecast.supersededForecastId) + ' (an issued 90-day forecast stood; superseded)'}`);
    const ev = await waitEvent(D, 'ForecastIssued', { forecast_id: F }, tIssue);
    if (ev === null) bad('no published ForecastIssued for the new forecast within 30 s');
    else {
      const p = ev.payload;
      if (p.schema === 'ForecastIssued' && p.schema_version === 'v2' && ev.schema_version === 'v2' && p.expiry?.basis === 'weekly' && typeof p.expiry?.expires_at === 'string' && p.cause?.action === 'prediction.forecast.issue') ok(`${eventLine(ev)}: schema ${p.schema}@${p.schema_version} (the outbox row's schema_version column ${ev.schema_version}); the v1 keys kept (forecast_id, series_key ${p.series_key}, horizon ${p.horizon}, method ${p.method}, validation_state ${p.validation_state}, label ${p.label}, superseded_forecast_id ${p.superseded_forecast_id ?? 'null'}); expiry { expires_at ${p.expiry.expires_at}, basis ${p.expiry.basis} }; validation { state ${p.validation?.state}, backtest ${p.validation?.backtest_id ?? 'none'} }; distribution { q10 ${p.distribution?.q10}, q50 ${p.distribution?.q50}, q90 ${p.distribution?.q90} }; calibration.skill ${p.calibration?.skill === null ? 'null' : 'recorded'}; drivers ${p.drivers?.count}; lineage { assumptions ${(p.lineage?.assumptions ?? []).length}, evidence_refs ${p.lineage?.evidence_refs} }; cause by ${short(p.cause.actor)}`);
      else bad(`the ForecastIssued payload: ${JSON.stringify({ schema: p.schema, schema_version: p.schema_version, column: ev.schema_version, expiry: p.expiry, cause: p.cause }).slice(0, 400)}`);
    }
  }
}
// (b) THE SCENARIO on the forecast: a baseline and, when the corridor transit indicator exists, a downside branch it flips.
if (F !== null) {
  const branches = [
    { name: 'Baseline', kind: 'baseline', statement: 'the euro stays within its recent regime against the dollar; the corridor costs are settled as budgeted', owner: eriksen.principalId, consequence: 'keep the booked routing and the dollar budget', responseWindowHours: 72 },
    ...(transitIndicator === null ? [] : [{ name: 'Corridor collapse under a weak euro', kind: 'downside', statement: 'the corridor collapses while the euro weakens: the reroute premium is paid in expensive dollars', indicatorId: transitIndicator.indicator_id, owner: eriksen.principalId, consequence: 'rebook the shipment before the premium widens', responseWindowHours: 48 }]),
  ];
  const r = await call(`${P}/scenarios/declare`, ne({ action: 'prediction.scenario.declare', objectType: 'SCN' }), { title: `EUR/USD over the next 90 days (B18, ${TODAY})`, statement: 'what the dollar cost of the corridor routing does over the forecast horizon (the B18 demonstration)', forecastId: F, owner: eriksen.principalId, reviewCadence: 'weekly', branches }, eriksen.token);
  if (!r.ok) fail('scenarios/declare (n.eriksen)', r);
  else { SCN = r.body.scenario.scenarioId; ok(`N. Eriksen declared the scenario ${short(SCN)} on the forecast with ${branches.length} branch(es)${transitIndicator === null ? ' — baseline only: no corridor transit indicator (chokepoint4) is defined in this domain, said' : ` (the downside flipped by the corridor transit indicator ${short(transitIndicator.indicator_id)})`}`); }
}
// (c) THE TWIN VERSION: the demo twin's current actual version carried, plus a predicted element citing the forecast.
{
  const tl = await call(`${W}/list`, tn({ action: 'twin.read', objectType: 'TWN', sideEffect: 'none' }), {}, nakamura.token);
  const twin = tl.ok ? ((tl.body.twins ?? []).find((t) => String(t.title).startsWith('NORDWERK') && !/\(mirror/.test(String(t.title))) ?? null) : null;
  if (!tl.ok) fail('twins/list (t.nakamura)', tl);
  else if (twin === null) bad('the NORDWERK twin is missing — run act V first');
  else {
    TW = twin.twin_id;
    const tg = await call(`${W}/${TW}/get`, tn({ action: 'twin.read', objectType: 'TWN', objectId: TW, sideEffect: 'none' }), {}, nakamura.token);
    const versions = tg.ok ? (tg.body.twin?.versions ?? []) : [];
    currentV = versions.filter((v) => v.branch_id === 'actual' && v.state === 'admitted').map((v) => Number(v.version)).sort((a, b) => b - a)[0] ?? null;
    if (currentV === null) bad('the demo twin has no admitted version on branch actual');
    else if (F === null) bad('no forecast to cite: the twin version is not opened');
    else {
      const cur = await twinVersionRow(TW, currentV);
      const runsOfCurrent = await q(`select run_id::text, run_kind, state, validity from simulation.runs_current where twin_id = $1 and twin_version = $2 order by opened_at`, [TW, currentV]);
      note(`the demo twin ${short(TW)} "${twin.title}": current admitted version ${currentV} on branch actual (${cur?.verification_state}, ${cur?.completeness}, observed through ${cur?.observed_through ?? 'none'}); ${runsOfCurrent.length} run(s) rest on it`);
      const hot = await ensureHotInputs(TW, currentV);
      // The new version keeps the CURRENT version's world cut-off (a DATE column: the day it names, by local getters — a pg date is a local-midnight
      // instant): the corridor scenario's downside branch flipped on an observation of 2024-01-27 (act IV), and a run's shock binds to a flipped branch
      // only when the flip's observation lies within the run's cut-offs — the rehearsal's first run, opened with the seed's 2024-01-17, was refused exactly so.
      const dayOf = (v) => { if (v === null || v === undefined) return '2024-01-17'; const d = v instanceof Date ? v : new Date(String(v)); if (Number.isNaN(d.getTime())) return String(v).slice(0, 10); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
      const observedThrough = dayOf(cur?.observed_through);
      const tTwin = Date.now();
      const o = await call(`${W}/${TW}/versions/open`, tn({ action: 'twin.version', objectType: 'TWN', objectId: TW }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough, carryFrom: currentV, except: ['context.fx_forecast'] }, nakamura.token);
      if (!o.ok) fail('twins/versions/open (t.nakamura)', o);
      else {
        newV = o.body.version.version;
        const g = await call(`${W}/${TW}/versions/${newV}/ground`, tn({ action: 'twin.ground', objectType: 'TWN', objectId: TW }), { elements: [{ key: 'context.fx_forecast', kind: 'predicted', value: { horizon: '90d', forecast_id: F }, citations: [{ kind: 'forecast', id: F }] }] }, nakamura.token);
        if (!g.ok) fail('twins/versions/ground (t.nakamura)', g);
        else {
          // Admitted as it stands (allowIncomplete: a carried element outside the model's required inputs may be incomplete — act VI's simulated element); the runs below prove the required inputs.
          const a = await call(`${W}/${TW}/versions/${newV}/admit`, tn({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW }), { allowIncomplete: true }, nakamura.token);
          if (!a.ok) { fail('twins/versions/admit (t.nakamura)', a); newV = null; }
          else {
            ok(`T. Nakamura opened version ${newV} (carried from ${currentV}, observed through ${observedThrough} — the current version's cut-off, so the flipped branch's observation of act IV lies within it, the previous fx element left out), grounded context.fx_forecast (predicted, citing the 90-day forecast ${short(F)}), admitted as ${a.body.admitted.completeness}${(a.body.admitted.missingKeys ?? []).length > 0 ? ` (missing ${a.body.admitted.missingKeys.join(', ')})` : ''}${hot ? '' : ' — the cited records were NOT all restored: the runs below may be refused'}`);
            const ev = await waitEvent(D, 'TwinStateChanged', { twin_id: TW, change: 'version.admitted' }, tTwin);
            if (ev === null) bad('no published TwinStateChanged/version.admitted for the demo twin within 30 s');
            else {
              const p = ev.payload; const runs = p.dependency_impacts?.runs ?? [];
              if (Number(p.version) === newV && Number(p.supersedes) === currentV && p.verification_state === 'verified' && runs.length === runsOfCurrent.length) ok(`${eventLine(ev)}: version ${p.version} supersedes ${p.supersedes}; changed_variables: ${variablesLine(p.changed_variables)}; confidence ${JSON.stringify(p.confidence ?? [])}; freshness { known_at ${iso(p.freshness?.known_at)}, observed_through ${p.freshness?.observed_through}, completeness ${p.freshness?.completeness}, missing ${(p.freshness?.missing_keys ?? []).length} }; dependency_impacts: ${runs.length} run(s) of the superseded version ${runs.map((r) => `${short(r.run_id)} ${r.state}/${r.validity}`).join(', ') || '(none)'}, truncated ${p.dependency_impacts?.truncated}`);
              else bad(`the TwinStateChanged payload: ${JSON.stringify({ version: p.version, supersedes: p.supersedes, runs: runs.length, expected: runsOfCurrent.length }).slice(0, 300)}`);
            }
            const gc = await waitOutbox(D, 'twin.state_changed', TW, tTwin);
            if (gc === null) bad('no published GraphChanged/twin.state_changed for the demo twin within 30 s');
            else {
              const ds = await settled(gc.id);
              const dec = byKind(ds, 'decisions'); const rt = byKind(ds, 'retrieval'); const check = await retrievalCheck(gc.id);
              const noted = dec?.items ?? [];
              if (ds.length === BROAD.length && ds.every((d) => d.state === 'applied') && (byKind(ds, 'twins')?.items ?? []).length === 0 && rt !== null && effectsOf(rt).includes('projections.verified') && check?.mismatched === 0) ok(`GraphChanged/twin.state_changed ${short(gc.id)} (objects.simulations ${(gc.payload.objects?.simulations ?? []).length} run(s) of version ${currentV}, walked ${gc.payload.objects?.walked}); deliveries: ${deliveryLine(ds)} — the twins consumer marks nothing (both versions verified), retrieval verified`);
              else bad(`the deliveries of twin.state_changed: ${deliveryLine(ds) || 'none'}; retrieval check ${JSON.stringify(check)}`);
              if (noted.length === 0) note(`the decisions consumer noted NO package: none whose current version cites the ${runsOfCurrent.length} run(s) of version ${currentV}${runsOfCurrent.length === 0 ? ' (version ' + currentV + ' has none: act VI\'s simulated version carries no run)' : ''} — printed honestly`);
              else {
                for (const pkgId of noted) {
                  const n = (await packageNotes(pkgId)).filter((x) => x.details?.change_kind === 'twin.state_changed').at(-1) ?? null;
                  note(`the decisions consumer noted package ${short(pkgId)}: input.invalidated with NO exposure (failure_class ${n?.details?.failure_class ?? 'none'}, disposition ${n?.details?.disposition ?? 'none'}) — "${String(n?.details?.note ?? '').slice(0, 140)}…" (C13: the cited runs stand; the owner judges whether to re-simulate)`);
                }
              }
            }
          }
        }
      }
    }
  }
}
// (d) THE RUNS on the new version: a control and a reroute, on the corridor scenario's flipped branch when it stands (act IV), else the hypothetical shock.
if (TW !== null && newV !== null) {
  const scl = await call(`${P}/scenarios/list`, ne({ action: 'prediction.read', objectType: 'SCN', sideEffect: 'none' }), {}, eriksen.token);
  const corridor = scl.ok ? ((scl.body.scenarios ?? []).find((s) => /bab el-mandeb/i.test(String(s.title))) ?? null) : null;
  const branch = corridor?.branches?.find((b) => b.kind === 'downside') ?? null;
  const onBranch = branch !== null && branch.state === 'flipped' ? { scenarioId: corridor.scenario_id, scenarioBranchId: branch.branch_id } : {};
  note(branch !== null && branch.state === 'flipped' ? `the corridor scenario's downside branch "${branch.name}" is FLIPPED (act IV): the shock rests on it` : 'no flipped corridor branch stands: the shock is hypothetical, said');
  const runOnce = async (label, payload) => {
    const tR = Date.now();
    const r = await call(`${W}/simulations/run`, sm({ action: 'simulation.run', objectType: 'SIM' }), { twinId: TW, twinVersion: newV, component: 'SYN-PART-MAG', horizonDays: 90, stochastic: { mode: 'deterministic' }, ...onBranch, ...payload }, nakamura.token);
    if (!r.ok) { fail(`${label} (t.nakamura)`, r); return null; }
    const run = r.body.run; const t = run.totals;
    ok(`${label}: run ${short(run.runId)} ${run.state} — ${t.line_stop_days} line-stop day(s), ${t.days_below_safety_stock} day(s) below safety stock, cost €${t.cost?.total} — SYNTHETIC`);
    const st = await waitEvent(D, 'SimulationStarted', { run_id: run.runId }, tR);
    const cp = await waitEvent(D, 'SimulationCompleted', { run_id: run.runId }, tR);
    if (st === null || cp === null) bad(`the run's events: SimulationStarted ${st === null ? 'MISSING' : 'published'}, SimulationCompleted ${cp === null ? 'MISSING' : 'published'}`);
    else {
      const s = st.payload; const c = cp.payload; const re = c.resource_evidence ?? {};
      const row = (await q(`select resource from simulation.runs_current where run_id = $1`, [run.runId]))[0] ?? null;
      const resourceOnRow = row !== null && JSON.stringify(row.resource) === JSON.stringify(re);
      if (s.state === 'opened' && c.state === 'completed' && st.partition_seq < cp.partition_seq && typeof re.elapsed_ms === 'number' && resourceOnRow) ok(`${eventLine(st)}: twin ${short(s.twin?.twin_id)}@${s.twin?.version} branch ${s.twin?.branch_id}, ${s.run_kind}, scenario ${s.scenario === null ? 'none' : `${short(s.scenario.scenario_id)}@${s.scenario.version} branch ${short(s.scenario.branch_id)} ${s.scenario.branch_state}`}, shock ${s.shock} (${s.shock_basis}), model ${s.model?.ref} ${String(s.model?.implementation_digest).slice(0, 12)}…, environment { node ${s.environment?.node}, ${s.environment?.platform}/${s.environment?.arch}, digest ${String(s.environment?.digest).slice(0, 12)}… }, stochastic ${s.stochastic?.mode}, cut-offs { known_at ${iso(s.cutoffs?.known_at)}, observed_through ${s.cutoffs?.observed_through} }, operator ${short(s.execution_identity?.operator)} (${s.execution_identity?.verification_state}); then ${eventLine(cp)}: outputs ${String(c.outputs_digest).slice(0, 12)}…, totals.line_stop_days ${c.totals?.line_stop_days}, impacts ${c.impacts?.compared_to === null ? 'none (a control)' : `vs ${short(c.impacts.compared_to)}: Δ line_stop_days ${c.impacts.deltas?.line_stop_days}, Δ total_cost ${c.impacts.deltas?.total_cost}`}, sensitivity { relative ${c.sensitivity?.relative}, outside_envelope ${c.sensitivity?.outside_envelope}, factors ${c.sensitivity?.factors} }, validation ${c.validation?.validation_status}, RESOURCE EVIDENCE { elapsed ${re.elapsed_ms} ms, samples ${re.samples_run}, ${re.process?.node} ${re.process?.platform}/${re.process?.arch}, rss ${re.memory_rss_bytes} bytes } — on the row too; sim_object ${short(c.sim_object?.object_id)}@${c.sim_object?.version}`);
      else bad(`the run's events: ${JSON.stringify({ started: s.state, completed: c.state, order: [st.partition_seq, cp.partition_seq], resource: re, onRow: resourceOnRow }).slice(0, 400)}`);
    }
    return run;
  };
  control = await runOnce('CONTROL (none, shock)', { runKind: 'control', controlRunId: null, shock: true, interventions: [{ type: 'none' }] });
  if (control !== null) reroute = await runOnce('reroute SYN-SHIP-4472 via the Cape', { runKind: 'intervention', controlRunId: control.runId, shock: true, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] });
}
// (e) THE PACKAGE on the demo DEC: the status quo (the control), the reroute (the intervention + the forecast), the terms, the choice; the room; proposed, approved, committed.
if (DEC !== null && control !== null && reroute !== null && F !== null && objective !== null) {
  const d = await call(`${DC}/declare`, lb({ action: 'decision.package.declare', objectType: 'DPK' }), { decisionObjectId: DEC, title: `B18 — corridor decision on the 90d FX forecast (${TODAY})`, statement: 'whether to reroute the second magnet shipment now that the dollar cost of the corridor is forecast over 90 days (the B18 demonstration; synthetic)', owner: brandt.principalId }, brandt.token);
  if (!d.ok) fail('decisions/declare (l.brandt)', d);
  else {
    PKG = d.body.package.packageId;
    const o = await call(`${DC}/${PKG}/versions/open`, lb({ action: 'decision.package.version', objectType: 'DPK', objectId: PKG }), { knownAt: new Date().toISOString(), observedThrough: null }, brandt.token);
    if (!o.ok) fail('decisions/versions/open (l.brandt)', o);
    else {
      const v1 = o.body.version.version;
      const o1 = await call(`${DC}/${PKG}/versions/${v1}/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: PKG }), { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: control.runId, version: 1 }], risks: [], opportunities: [] }, brandt.token);
      const o2 = await call(`${DC}/${PKG}/versions/${v1}/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: PKG }), { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: reroute.runId, version: 1 }, { kind: 'forecast', id: F, version: 1 }], risks: ['the Cape premium is paid in dollars'], opportunities: [] }, brandt.token);
      const terms = await call(`${DC}/${PKG}/versions/${v1}/terms`, lb({ action: 'decision.package.terms', objectType: 'DPK', objectId: PKG }), {
        objectives: [objective.strategy_object_id], constraints: ['no air freight above 60 t/week'],
        approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 },
        monitoringConditions: [...(transitIndicator === null ? [] : [{ kind: 'indicator', indicator_id: transitIndicator.indicator_id, owner: brandt.principalId, note: 'the corridor transit indicator' }]), { kind: 'review', every_days: 7, owner: brandt.principalId }],
        reversibility: 'the reroute is reversible until the vessel passes Suez', informationValue: 'a week of observation would not change the ranking of the options',
      }, brandt.token);
      const choice = await call(`${DC}/${PKG}/versions/${v1}/choice`, lb({ action: 'decision.package.choice', objectType: 'DPK', objectId: PKG }), {
        option_key: 'reroute', rationale: 'The reroute keeps the line running; the dollar premium is acceptable against a line stop while the forecast holds.', decision_deadline: '2024-01-19', accepted_trade_offs: ['+14 days of transit', 'the Cape premium in dollars'], action_owner: nakamura.principalId,
        outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: TW, period: { from: '2024-01-11', to: '2024-04-10' } }],
      }, brandt.token);
      if (!o1.ok || !o2.ok || !terms.ok || !choice.ok) fail('the draft (l.brandt)', [o1, o2, terms, choice].find((x) => !x.ok));
      else {
        ok(`L. Brandt declared the package ${short(PKG)} on the DEC, opened version ${v1} (no world cut-off: the forecast's target lies in the future), carded status-quo (the control ${short(control.runId)}) and reroute (the intervention ${short(reroute.runId)} + the forecast ${short(F)}@1), set the terms (S. Okafor, quorum 1; ${transitIndicator === null ? 'a 7-day review' : 'the transit indicator and a 7-day review'}) and the choice reroute`);
        const rm = await call(`${X}/rooms/open`, lb({ action: 'room.open', objectType: 'DRM' }), { packageId: PKG, title: `B18 — corridor decision on the 90d FX forecast (${TODAY})`, reviewEveryDays: 7 }, brandt.token);
        if (!rm.ok) fail('rooms/open (l.brandt)', rm);
        else {
          ROOM = rm.body.room.roomId;
          const mb = await call(`${X}/rooms/${ROOM}/membership`, lb({ action: 'room.membership', objectType: 'DRM', objectId: ROOM }), { principal: okafor.principalId, role: 'approver', op: 'add' }, brandt.token);
          if (!mb.ok) fail('rooms/membership (l.brandt)', mb); else ok(`the room ${short(ROOM)} opened on the package (weekly review); S. Okafor added as approver`);
        }
        const tP = Date.now();
        const pr = await call(`${DC}/${PKG}/versions/${v1}/propose`, lb({ action: 'decision.package.propose', objectType: 'DPK', objectId: PKG }), {}, brandt.token);
        if (!pr.ok) fail('decisions/propose (l.brandt)', pr);
        else {
          digest1 = pr.body.proposal.versionDigest;
          ok(`version ${v1} PROPOSED — digest ${digest1.slice(0, 16)}…, baseline ${short(pr.body.proposal.baselineRunId)}, SYNTHETIC`);
          const ev = await waitEvent(D, 'DecisionPackageReady', { package_id: PKG }, tP);
          if (ev === null) bad('no published DecisionPackageReady within 30 s');
          else {
            const p = ev.payload;
            if (p.version === v1 && p.version_digest === digest1 && (p.options ?? []).length === 2 && p.choice?.option_key === 'reroute' && p.reopened_from === null && p.cause?.action === 'decision.package.propose') ok(`${eventLine(ev)}: version ${p.version} (digest ${String(p.version_digest).slice(0, 12)}…, header ${String(p.header_digest).slice(0, 12)}…), decision ${short(p.decision_object_id)}, objectives ${p.objectives?.count}, options ${p.options.map((x) => `${x.key} (${x.kind}, ${x.simulated ? 'simulated' : 'unsimulated'}, cites ${x.cited}, uncertainty { citations ${x.uncertainty?.citations}, synthetic ${x.uncertainty?.synthetic_inputs}, unvalidated runs ${x.uncertainty?.unvalidated_runs} })`).join('; ')}, choice ${p.choice.option_key} by ${short(p.choice.action_owner)} (deadline ${p.choice.decision_deadline}), dissent ${p.dissent?.count}, provenance ${(p.provenance ?? []).length} citation(s), approver policy { quorum ${p.approver_policy?.quorum}, principals ${p.approver_policy?.principals} }, monitoring conditions ${p.monitoring_conditions?.count} (${(p.monitoring_conditions?.kinds ?? []).join(', ')}), baseline ${short(p.baseline_run_id)}, synthetic ${p.synthetic_state}, reopened_from null`);
            else bad(`the DecisionPackageReady payload: ${JSON.stringify({ version: p.version, digest: p.version_digest, options: (p.options ?? []).length, choice: p.choice, reopened_from: p.reopened_from }).slice(0, 400)}`);
          }
          const ap = await call(`${DC}/${PKG}/versions/${v1}/approve`, so({ action: 'decision.approve', objectType: 'APR' }), { decision: 'approve', versionDigest: digest1, rationale: 'The reroute keeps the line running; the dollar premium is acceptable.' }, okafor.token);
          if (!ap.ok) fail('decisions/approve (s.okafor)', ap);
          else {
            ok(`S. Okafor approved version ${v1} — ${ap.body.approval.state}, expires ${String(ap.body.approval.expiresAt).slice(0, 10)}`);
            const tC = Date.now();
            const cm = await call(`${DC}/${PKG}/versions/${v1}/commit`, lb({ action: 'decision.commit', objectType: 'CMT' }), { versionDigest: digest1 }, brandt.token);
            if (!cm.ok) fail('decisions/commit (l.brandt)', cm);
            else {
              cm1 = cm.body.commitment; cmRow1 = (await commitmentRows(PKG))[0] ?? null;
              ok(`L. Brandt COMMITTED version ${v1} under decision.commit at class ${cm1.opClass} — decided at ${cm1.decidedAt}; the CMT ${short(cm1.commitmentId)}`);
              const ev = await waitEvent(D, 'DecisionCommitted', { package_id: PKG }, tC);
              if (ev === null) bad('no published DecisionCommitted within 30 s');
              else {
                const p = ev.payload; const rest = p.commitments?.[0]?.rests_on ?? {};
                if (p.commitment_id === cm1.commitmentId && p.op_class === 'C3' && p.bound_action === 'decision.commit' && (p.approvals ?? []).length === 1 && p.reopened_from === null && p.cause?.target_id === cm1.commitmentId) ok(`${eventLine(ev)}: commitment ${short(p.commitment_id)} by ${short(p.committed_by)}, approvals ${p.approvals.map((x) => short(x.approver)).join(', ')}, ${p.op_class} ${p.bound_action} (policy decision ${short(p.policy_decision_id)}), decided_at ${p.decided_at}; the CMT rests on decision ${short(rest.decision)}, objectives ${(rest.objectives ?? []).length}, runs ${(rest.runs ?? []).map(short).join(', ')}, baseline ${short(rest.baseline_run_id)}; monitoring conditions ${(p.monitoring_conditions ?? []).map((c) => c.kind).join(', ')}; execution handoff: "${p.execution_handoff?.statement}"; replay snapshot { as_of ${p.replay_snapshot?.as_of}, version digest ${String(p.replay_snapshot?.version_digest).slice(0, 12)}…, cmt header ${String(p.replay_snapshot?.cmt_header_digest).slice(0, 12)}… }; reopened_from null`);
                else bad(`the DecisionCommitted payload: ${JSON.stringify({ commitment_id: p.commitment_id, op_class: p.op_class, approvals: (p.approvals ?? []).length, reopened_from: p.reopened_from, cause: p.cause }).slice(0, 400)}`);
              }
            }
          }
        }
      }
    }
  }
}

/* ── 4. THE CHAIN ────────────────────────────────────────────────────────── */
console.log('\n4. THE CHAIN — N. Eriksen withdraws the forecast (ForecastWithdrawn, the dependants marked and noted); T. Nakamura reproduces the reroute (unreproducible → SimulationInvalidated); L. Brandt reopens the package (DecisionReopened, the room open again), re-decides it (the second commitment); S. Okafor replays version 1 at the first commitment\'s instant');
let cm2 = null;
if (F !== null && cm1 !== null && TW !== null && newV !== null) {
  // (a) THE WITHDRAWAL.
  const tW = Date.now();
  const wd = await call(`${P}/forecasts/${F}/withdraw`, ne({ action: 'prediction.forecast.withdraw', objectType: 'FCT', objectId: F, consequence: 'C2' }), { reason: 'the euro left its recent regime after the issue; the fit no longer holds (the B18 demonstration)', unfitClass: 'data_shift' }, eriksen.token);
  if (!wd.ok) fail('forecasts/withdraw (n.eriksen)', wd);
  else {
    const w = wd.body.withdrawal; const dep = w.withdrawn?.dependants ?? {};
    const names = (xs, k) => (xs ?? []).map((x) => short(x[k])).join(', ') || 'none';
    if (w.withdrawnVersion === 2 && (dep.scenarios ?? []).some((s) => s.scenario_id === SCN) && (dep.twins ?? []).some((t) => t.twin_id === TW && Number(t.version) === newV) && (dep.simulations ?? []).length === 2 && (dep.packages ?? []).some((p) => p.package_id === PKG)) ok(`N. Eriksen WITHDREW the forecast ${short(F)} as unfit (data_shift): the withdrawn FCT version ${w.withdrawnVersion}; the dependants named — scenarios ${names(dep.scenarios, 'scenario_id')}, warnings ${names(dep.warnings, 'warning_id')}, twins ${(dep.twins ?? []).map((t) => `${short(t.twin_id)}@${t.version} ${t.verification_state}`).join(', ')}, simulations ${(dep.simulations ?? []).map((r) => `${short(r.run_id)} ${r.validity}`).join(', ')} (named, never altered), packages ${(dep.packages ?? []).map((p) => `${short(p.package_id)} v${p.version} ${p.state} ${p.committed ? 'committed' : ''} [${(p.option_keys ?? []).join(', ')}]`).join('; ')}`);
    else bad(`the withdrawal's answer: ${JSON.stringify({ version: w.withdrawnVersion, dependants: dep }).slice(0, 500)}`);
    const fw = await waitEvent(D, 'ForecastWithdrawn', { forecast_id: F }, tW);
    const gw = await waitOutbox(D, 'forecast.withdrawn', F, tW);
    if (fw === null || gw === null) bad(`the withdrawal's events: ForecastWithdrawn ${fw === null ? 'MISSING' : 'published'}, GraphChanged/forecast.withdrawn ${gw === null ? 'MISSING' : 'published'}`);
    else {
      const p = fw.payload;
      ok(`${eventLine(fw)}: forecast ${short(p.forecast_id)} ${p.series_key} ${p.horizon}, reason "${String(p.reason).slice(0, 60)}…", unfit_class ${p.unfit_class}, withdrawn_version ${p.withdrawn_version}, prior { issued ${iso(p.prior?.issued_at)}, ${p.prior?.validation_state}, label ${p.prior?.label} }; then GraphChanged/forecast.withdrawn ${short(gw.id)} (seq ${gw.partition_seq} > ${fw.partition_seq}) with the typed forecast block and ${(gw.payload.subscriptions ?? []).length} subscriptions`);
      const ds = await settled(gw.id);
      const scn = SCN === null ? null : (await q(`select attention_state, state from prediction.scenarios_current where scenario_id = $1`, [SCN]))[0] ?? null;
      const pkgNote = PKG === null ? null : (await packageNotes(PKG)).filter((n) => n.details?.change_kind === 'forecast.withdrawn').at(-1) ?? null;
      const tv = await twinVersionRow(TW, newV);
      const tu = await waitEvent(D, 'TwinStateChanged', { twin_id: TW, change: 'version.unverified' }, tW);
      const check = await retrievalCheck(gw.id);
      const sc = byKind(ds, 'scenarios'); const dc = byKind(ds, 'decisions'); const tw = byKind(ds, 'twins');
      if (ds.length === BROAD.length && ds.every((d) => d.state === 'applied')) ok(`forecast.withdrawn deliveries: ${deliveryLine(ds)}`); else bad(`the deliveries of forecast.withdrawn: ${deliveryLine(ds) || 'none'}`);
      if (SCN !== null && (sc?.items ?? []).includes(SCN) && scn?.attention_state === 'input_unverified') ok(`the scenario ${short(SCN)}: MARKED input_unverified by the scenarios subscriber (scenario.attention)`); else bad(`the scenario after the withdrawal: items ${JSON.stringify(sc?.items)}, attention ${scn?.attention_state}`);
      if (PKG !== null && (dc?.items ?? []).includes(PKG) && pkgNote?.details?.failure_class === 'material_change' && pkgNote?.details?.disposition === 'compensation' && pkgNote?.details?.lifecycle?.kind === 'forecast.withdrawn') ok(`the package ${short(PKG)}: NOTED input.invalidated with failure_class material_change, disposition compensation (the decision was executed), lifecycle { forecast.withdrawn, ${pkgNote.details.lifecycle.unfit_class} } — "${String(pkgNote.details.note).slice(0, 120)}…"`); else bad(`the package's note after the withdrawal: items ${JSON.stringify(dc?.items)}, note ${JSON.stringify(pkgNote?.details ?? null).slice(0, 300)}`);
      if ((tw?.items ?? []).includes(`${TW}@${newV}`) && tv?.verification_state === 'unverified' && tu !== null && tu.payload.caused_by?.outbox_event_id === gw.id) ok(`the twin version ${short(TW)}@${newV}: UNVERIFIED by the twins subscriber (version.unverified), announced from the item's transaction — ${eventLine(tu)}: change ${tu.payload.change}, verification_state ${tu.payload.verification_state}, changed_variables ${(tu.payload.changed_variables ?? []).length}, caused_by ${short(tu.payload.caused_by.outbox_event_id)} (${tu.payload.caused_by.change_kind}); version ${currentV} stays ${(await twinVersionRow(TW, currentV))?.verification_state}`); else bad(`the twin after the withdrawal: items ${JSON.stringify(tw?.items)}, verification ${tv?.verification_state}, TwinStateChanged/version.unverified ${tu === null ? 'MISSING' : 'published'}`);
      if (check?.mismatched === 0 && (byKind(ds, 'forecasts')?.items ?? []).length === 0 && (byKind(ds, 'memory-mappings')?.items ?? []).length === 0) ok(`retrieval verified (${check.mismatched} mismatched); forecasts and memory-mappings applied with no items`); else bad(`retrieval/forecasts/memory-mappings: ${JSON.stringify({ check, forecasts: byKind(ds, 'forecasts')?.items, mappings: byKind(ds, 'memory-mappings')?.items })}`);
    }
  }
  // (b) THE AUTOMATIC INVALIDATION: the reroute run's reproduction.
  if (reroute !== null) {
    const tR = Date.now();
    const rp = await call(`${W}/simulations/${reroute.runId}/reproduce`, sm({ action: 'simulation.reproduce', objectType: 'SIM', objectId: reroute.runId }), {}, nakamura.token);
    if (!rp.ok) fail('simulations/reproduce (t.nakamura)', rp);
    else {
      const r = rp.body.reproduction;
      const runRow = (await q(`select validity, invalidated_at, invalidation from simulation.runs_current where run_id = $1`, [reroute.runId]))[0] ?? null;
      if (r.verdict === 'unreproducible' && (r.unavailable ?? []).some((u) => /forecast .* withdrawn at version 2/.test(String(u))) && r.invalidation?.withdrawn_version === 2 && r.invalidation?.cause === 'lifecycle' && runRow?.validity === 'invalidated' && runRow.invalidation?.trigger === 'reproduction') ok(`T. Nakamura reproduced the reroute run ${short(reroute.runId)}: verdict ${r.verdict} — ${(r.unavailable ?? []).join('; ')}; the run INVALIDATED in the same write (cause ${r.invalidation.cause}, withdrawn SIM version ${r.invalidation.withdrawn_version}; trigger ${runRow.invalidation.trigger}, reproduction ${short(runRow.invalidation.trigger_ref)}); dependants: packages ${(runRow.invalidation.dependants?.packages ?? []).map((p) => short(p.package_id)).join(', ') || 'none'}, commitments ${(runRow.invalidation.dependants?.commitments ?? []).map(short).join(', ') || 'none'}, decisions ${(runRow.invalidation.dependants?.decisions ?? []).map(short).join(', ') || 'none'}`);
      else bad(`the reproduction: ${JSON.stringify({ verdict: r.verdict, unavailable: r.unavailable, invalidation: r.invalidation, withheld: r.invalidation_withheld, row: runRow }).slice(0, 500)}`);
      const si = await waitEvent(D, 'SimulationInvalidated', { run_id: reroute.runId }, tR);
      const gi = await waitOutbox(D, 'simulation.invalidated', reroute.runId, tR);
      if (si === null || gi === null) bad(`the invalidation's events: SimulationInvalidated ${si === null ? 'MISSING' : 'published'}, GraphChanged/simulation.invalidated ${gi === null ? 'MISSING' : 'published'}`);
      else {
        const p = si.payload;
        ok(`${eventLine(si)}: run ${short(p.run_id)} trigger ${p.trigger} (reproduction ${short(p.trigger_ref)}), withdrawn_version ${p.withdrawn_version}, cause ${p.cause?.action} by ${short(p.cause?.actor)}; then GraphChanged/simulation.invalidated ${short(gi.id)} with the typed simulation block`);
        const ds = await settled(gi.id);
        const dc = byKind(ds, 'decisions');
        const notes = PKG === null ? [] : (await packageNotes(PKG)).filter((n) => n.details?.change_kind === 'simulation.invalidated');
        if (ds.length === BROAD.length && ds.every((d) => d.state === 'applied') && PKG !== null && (dc?.items ?? []).includes(PKG) && notes.at(-1)?.details?.failure_class === 'material_change') ok(`simulation.invalidated deliveries: ${deliveryLine(ds)} — the package ${short(PKG)} noted AGAIN (material_change/compensation, lifecycle simulation.invalidated by ${notes.at(-1).details.lifecycle?.trigger})`);
        else bad(`the deliveries of simulation.invalidated: ${deliveryLine(ds) || 'none'}; the package's notes ${notes.length}`);
      }
    }
  }
  note('STATED: the OPERATOR\'S invalidation (POST …/twins/simulations/:runId/invalidate) is the harness\'s S2(c) — the control run stays valid here, so nothing of the act is invalidated by hand');
  // (c) THE REOPEN on the first note recorded after the commitment; the room's state; the second cycle.
  if (PKG !== null) {
    const cause = (await q(`select e.event_id::text, e.occurred_at, e.details ->> 'change_kind' change_kind from decision.package_events e where e.package_id = $1 and e.event = 'input.invalidated'
        and e.occurred_at > (select c.committed_at from decision.commitments c where c.package_id = $1 and c.version = 1) order by e.occurred_at limit 1`, [PKG]))[0] ?? null;
    if (cause === null) bad('no input.invalidated note on the package after its commitment: nothing to reopen on');
    else {
      const tO = Date.now();
      const ro = await call(`${DC}/${PKG}/reopen`, lb({ action: 'decision.package.reopen', objectType: 'DPK', objectId: PKG, consequence: 'C2' }), { cause: { kind: 'input_invalidated', ref: cause.event_id } }, brandt.token);
      if (!ro.ok) fail('decisions/reopen (l.brandt)', ro);
      else {
        const r = ro.body.reopened;
        const dropped = (r.options_dropped ?? []).map((d) => `${d.key} — "${String(d.reason).replace(/^reopen: carried option [^:]+: /, '').slice(0, 110)}…"`);
        if (r.committed_version === 1 && r.commitment_id === cm1.commitmentId && r.new_version === 2 && (r.options_carried ?? []).length === 0 && (r.options_dropped ?? []).length === 2) ok(`L. Brandt REOPENED the package on the note ${short(cause.event_id)} (${cause.change_kind}, recorded ${iso(cause.occurred_at)} — after the commitment): state reopened, committed_version ${r.committed_version} (commitment ${short(r.commitment_id)} stands), new draft version ${r.new_version}; options_carried ${JSON.stringify(r.options_carried)}; options_dropped and NAMED: ${dropped.join('; ')} (the reroute invalidated; the status quo rests on the withdrawn forecast — C12); exposed_inputs ${JSON.stringify(r.exposed_inputs ?? [])}; reopens ${r.reopens}`);
        else bad(`the reopen's answer: ${JSON.stringify({ committed_version: r.committed_version, commitment_id: r.commitment_id, new_version: r.new_version, carried: r.options_carried, dropped: r.options_dropped }).slice(0, 500)}`);
        const dr = await waitEvent(D, 'DecisionReopened', { package_id: PKG }, tO);
        if (dr === null) bad('no published DecisionReopened within 30 s');
        else ok(`${eventLine(dr)}: committed_version ${dr.payload.committed_version}, commitment ${short(dr.payload.commitment_id)}, new_version ${dr.payload.new_version}, recorded_cause { ${dr.payload.recorded_cause?.kind}, ${dr.payload.recorded_cause?.change_kind}, ${dr.payload.recorded_cause?.failure_class} }, options_dropped ${(dr.payload.options_dropped ?? []).map((d) => d.key).join(', ')}, cause ${dr.payload.cause?.action} by ${short(dr.payload.cause?.actor)}`);
        // C10: the room of a reopened package is OPEN again.
        if (ROOM !== null) {
          const rg = await call(`${X}/rooms/${ROOM}/get`, lb({ action: 'room.read', objectType: 'DRM', objectId: ROOM, sideEffect: 'none' }), {}, brandt.token);
          if (!rg.ok) fail('rooms/get (l.brandt)', rg);
          else if (rg.body.room?.state === 'open' && rg.body.room?.package_state === 'reopened') ok(`the room ${short(ROOM)} after the reopen: state ${rg.body.room.state} (package_state ${rg.body.room.package_state}) — a reopened decision is being re-decided, not closed (C10)`);
          else bad(`the room after the reopen: ${JSON.stringify({ state: rg.body.room?.state, package_state: rg.body.room?.package_state })}`);
        }
        // THE SECOND CYCLE: the status quo on act V's control (it rests on no forecast), an unsimulated wait, the choice, the proposal, the approval, the second commitment.
        const rl = await call(`${W}/simulations/list`, sm({ action: 'simulation.read', objectType: 'SIM', sideEffect: 'none' }), { twinId: TW }, nakamura.token);
        const runs = rl.ok ? (rl.body.runs ?? []) : [];
        const baseControl = runs.filter((x) => x.state === 'completed' && x.branch_id === 'actual' && x.run_kind === 'control' && x.shock === true && x.run_id !== control?.runId && (x.validity ?? 'valid') === 'valid').sort((a, b) => String(a.opened_at).localeCompare(String(b.opened_at)))[0] ?? null;
        if (baseControl === null) bad('no earlier valid shocked control run on branch actual (act V\'s) for the reopened draft\'s status quo');
        else {
          const s1 = await call(`${DC}/${PKG}/versions/2/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: PKG }), { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: baseControl.run_id, version: 1 }], risks: [], opportunities: [] }, brandt.token);
          const s2 = await call(`${DC}/${PKG}/versions/2/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: PKG }), { key: 'wait', title: 'Wait for a re-simulation on a re-issued forecast', kind: 'intervention', consequences: corridorAsu === null ? [] : [{ kind: 'assumption', id: corridorAsu.strategy_object_id }], unsimulatedReason: 'the reroute run was invalidated; a re-simulation on a re-issued forecast is pending', risks: ['the February build stops'], opportunities: [] }, brandt.token);
          const ch = await call(`${DC}/${PKG}/versions/2/choice`, lb({ action: 'decision.package.choice', objectType: 'DPK', objectId: PKG }), {
            option_key: 'status-quo', rationale: 'With the reroute simulation invalidated and the forecast withdrawn, the status quo stands until the corridor is re-forecast.', decision_deadline: '2024-01-19', accepted_trade_offs: ['the line runs on the safety stock'], action_owner: nakamura.principalId,
            outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: TW, period: { from: '2024-01-11', to: '2024-04-10' } }],
          }, brandt.token);
          if (!s1.ok || !s2.ok || !ch.ok) fail('the reopened draft (l.brandt)', [s1, s2, ch].find((x) => !x.ok));
          else {
            const tP2 = Date.now();
            const pr2 = await call(`${DC}/${PKG}/versions/2/propose`, lb({ action: 'decision.package.propose', objectType: 'DPK', objectId: PKG }), {}, brandt.token);
            if (!pr2.ok) fail('decisions/propose v2 (l.brandt)', pr2);
            else {
              const digest2 = pr2.body.proposal.versionDigest;
              ok(`the reopened draft: status-quo on act V's control ${short(baseControl.run_id)} (valid; it rests on no forecast), wait (UNSIMULATED, citing the corridor assumption), the choice status-quo; version 2 PROPOSED — digest ${digest2.slice(0, 16)}…`);
              const ev = await waitEvent(D, 'DecisionPackageReady', { package_id: PKG, version: '2' }, tP2);
              if (ev === null) bad('no published DecisionPackageReady for version 2 within 30 s');
              else if (ev.payload.supersedes === 1 && ev.payload.reopened_from?.version === 1 && ev.payload.reopened_from?.commitment_id === cm1.commitmentId) ok(`${eventLine(ev)}: version 2 supersedes 1, reopened_from { version 1, commitment ${short(ev.payload.reopened_from.commitment_id)} }, options ${(ev.payload.options ?? []).map((x) => `${x.key} (${x.simulated ? 'simulated' : 'unsimulated'})`).join(', ')}, choice ${ev.payload.choice?.option_key}`);
              else bad(`the second DecisionPackageReady: ${JSON.stringify({ supersedes: ev.payload.supersedes, reopened_from: ev.payload.reopened_from }).slice(0, 300)}`);
              const ap2 = await call(`${DC}/${PKG}/versions/2/approve`, so({ action: 'decision.approve', objectType: 'APR' }), { decision: 'approve', versionDigest: digest2, rationale: 'The status quo stands until the corridor is re-forecast; the premium is not spent on an invalidated result.' }, okafor.token);
              if (!ap2.ok) fail('decisions/approve v2 (s.okafor)', ap2);
              else {
                const tC2 = Date.now();
                const cmr = await call(`${DC}/${PKG}/versions/2/commit`, lb({ action: 'decision.commit', objectType: 'CMT' }), { versionDigest: digest2 }, brandt.token);
                if (!cmr.ok) fail('decisions/commit v2 (l.brandt)', cmr);
                else {
                  cm2 = cmr.body.commitment;
                  const rows = await commitmentRows(PKG);
                  const firstUnchanged = rows.length === 2 && rows[0].commitment_id === cmRow1?.commitment_id && iso(rows[0].committed_at) === iso(cmRow1?.committed_at) && rows[0].version_digest === cmRow1?.version_digest;
                  if (firstUnchanged && rows[1].commitment_id === cm2.commitmentId && rows[1].version === 2) ok(`S. Okafor approved; L. Brandt COMMITTED version 2 — the SECOND commitment ${short(cm2.commitmentId)} decided at ${cm2.decidedAt}; the two commitment rows: ${rows.map((r) => `v${r.version} ${short(r.commitment_id)} at ${iso(r.committed_at)}`).join('; ')} — the first byte for byte as before (one commitment per committed version; the earlier decision is history)`);
                  else bad(`the commitment rows after the re-commit: ${JSON.stringify(rows.map((r) => [r.version, short(r.commitment_id), iso(r.committed_at)]))}`);
                  const ev2 = await waitEvent(D, 'DecisionCommitted', { package_id: PKG, version: '2' }, tC2);
                  if (ev2 === null) bad('no published DecisionCommitted for version 2 within 30 s');
                  else if (ev2.payload.commitment_id === cm2.commitmentId && ev2.payload.reopened_from?.version === 1) ok(`${eventLine(ev2)}: commitment ${short(ev2.payload.commitment_id)}, reopened_from { version ${ev2.payload.reopened_from.version}, reopens ${ev2.payload.reopened_from.reopens} } — a re-commit after a reopen names the earlier commitment`);
                  else bad(`the second DecisionCommitted: ${JSON.stringify({ commitment_id: ev2.payload.commitment_id, reopened_from: ev2.payload.reopened_from }).slice(0, 300)}`);
                  const pk = (await q(`select state, committed_version::int, current_version::int, reopens::int, reopened_from_version::int from decision.packages_current where package_id = $1`, [PKG]))[0];
                  note(`the package row: state ${pk.state}, committed_version ${pk.committed_version}, current_version ${pk.current_version}, reopened_from_version ${pk.reopened_from_version}, reopens ${pk.reopens}`);
                  // THE REPLAY of version 1 by S. Okafor (a member of the room): its decided layer closes at the FIRST commitment's instant, version 2's at the second (D13).
                  const rp1 = await call(`${DC}/${PKG}/versions/1/replay`, so({ action: 'decision.replay', objectType: 'RPL' }), {}, okafor.token);
                  const rp2 = await call(`${DC}/${PKG}/versions/2/replay`, so({ action: 'decision.replay', objectType: 'RPL' }), {}, okafor.token);
                  if (!rp1.ok || !rp2.ok) fail('decisions/replay (s.okafor)', rp1.ok ? rp2 : rp1);
                  else if (rp1.body.replay.cutoffs?.decided_at === rows[0].committed_at_iso && rp2.body.replay.cutoffs?.decided_at === rows[1].committed_at_iso) ok(`S. Okafor replayed version 1: cutoffs.decided_at ${rp1.body.replay.cutoffs.decided_at} = the FIRST commitment's instant; version 2: ${rp2.body.replay.cutoffs.decided_at} = the second's — the earlier approval is never rewritten (D13)`);
                  else bad(`the replays' decided instants: v1 ${rp1.body.replay.cutoffs?.decided_at} vs ${rows[0].committed_at_iso}; v2 ${rp2.body.replay.cutoffs?.decided_at} vs ${rows[1].committed_at_iso}`);
                }
              }
            }
          }
        }
      }
    }
  }
}

/* ── 5. A. HOFFMANN'S CHALLENGE ──────────────────────────────────────────── */
console.log('\n5. A. HOFFMANN\'S CHALLENGE — L. Ferreira decides the standing queued case on the demo claim (the previous run\'s), then A. Hoffmann challenges it again: ReviewRequested');
{
  const claim = (await q(`select o.object_id::text id, o.object_type, o.object_version::int version, l.run_id::text, l.method_id::text
      from objects.canonical_objects o join intelligence.claim_lineage l on l.claim_object_id = o.object_id and l.claim_version = o.object_version
      where o.tenant_id = $1 and o.domain_id = $2 and o.object_type in ('CLM', 'REL', 'ENT') and jsonb_typeof(o.payload -> 'imported_from') is distinct from 'object'
        and not exists (select 1 from objects.canonical_objects x where x.object_id = o.object_id and x.object_version > o.object_version)
        and o.object_version = 1
      order by (o.object_type = 'CLM') desc, o.recorded_at, o.object_id limit 1`, [T, D]))[0] ?? null;
  if (claim === null) bad('no single-version native claim with lineage in the origin domain to challenge');
  else {
    const queued = await q(`select case_id::text, queued_reason, opened_at from intelligence.review_current where claim_object_id = $1 and claim_version = $2 and state = 'queued' order by opened_at`, [claim.id, claim.version]);
    for (const c of queued) {
      const dec = await call(`${I}/review/${c.case_id}/decide`, lf({ action: 'intelligence.review.decide', objectType: 'REV', objectId: c.case_id, consequence: 'C2' }), { decision: 'approve', reason: `the claim stands as extracted; the ${c.queued_reason} case is closed so the claim can be challenged again (the B18 demonstration)` }, ferreira.token);
      if (!dec.ok) fail(`review/decide ${short(c.case_id)} (l.ferreira)`, dec); else ok(`L. Ferreira decided the standing ${c.queued_reason} case ${short(c.case_id)} on the claim ${short(claim.id)}@${claim.version} (opened ${iso(c.opened_at)}): ${dec.body.review.state}`);
    }
    if (queued.length === 0) note(`no queued case stands on the claim ${short(claim.id)}@${claim.version} (${claim.object_type}) — the first run: nothing to decide first`);
    const tCh = Date.now();
    const ch = await call(`${I}/review/request`, ah({ action: 'intelligence.review.request', objectType: 'REV' }), { claimObjectId: claim.id, claimVersion: claim.version, reason: 'the value contradicts the restated terms of the January records; the claim is challenged for review (the B18 demonstration)' }, hoffmann.token);
    if (!ch.ok) fail('review/request (a.hoffmann)', ch);
    else {
      const caseId = ch.body.review.caseId;
      ok(`A. Hoffmann challenged the ${claim.object_type} claim ${short(claim.id)}@${claim.version}: review case ${short(caseId)} queued (${ch.body.review.reason})`);
      const ev = await waitEvent(D, 'ReviewRequested', { case_id: caseId }, tCh);
      if (ev === null) bad('no published ReviewRequested for the challenge within 30 s');
      else {
        const p = ev.payload;
        if (p.queued_reason === 'challenged' && p.claim?.object_id === claim.id && p.run_id === claim.run_id && p.method_id === claim.method_id && Array.isArray(p.routed_to?.roles) && p.routed_to.roles.includes('extraction_manager') && p.cause?.action === 'intelligence.review.request') ok(`${eventLine(ev)}: case ${short(p.case_id)}, claim ${short(p.claim.object_id)}@${p.claim.version} (${p.claim.type}), run ${short(p.run_id)}, method ${short(p.method_id)}, queued_reason ${p.queued_reason}, confidence ${p.confidence}, routed_to { roles ${p.routed_to.roles.join(', ')}, excluded_principal ${p.routed_to.excluded_principal ?? 'none'} — "${p.routed_to.rule}" }, decided_by ${p.decided_by}; cause by ${short(p.cause.actor)}`);
        else bad(`the ReviewRequested payload: ${JSON.stringify({ queued_reason: p.queued_reason, claim: p.claim, run_id: p.run_id, routed_to: p.routed_to, cause: p.cause }).slice(0, 400)}`);
      }
    }
    const since = (await q(`select applied_at from public.schema_migrations where filename like '0078%' order by applied_at limit 1`))[0]?.applied_at ?? null;
    const extraction = since === null ? null : (await q(`select count(*)::int n from objects.object_outbox where event_type = 'ReviewRequested' and tenant_id = $1 and domain_id = $2 and payload ->> 'queued_reason' <> 'challenged' and created_at >= $3`, [T, D, since]))[0].n;
    note(`the extraction's own ReviewRequested rows (abstained, below threshold, contradiction) since 0078 was applied${since === null ? '' : ` (${iso(since)})`}: ${extraction ?? 'unknown'} — ${extraction === 0 ? 'zero: no extraction ran after the migration; the two extraction sites are the unit test\'s' : 'an extraction ran after the migration'}`);
  }
}

/* ── 6. THE STATE AND THE REGISTER ───────────────────────────────────────── */
console.log('\n6. THE STATE — every B18 event row of this run from the outbox; the register through the route; what the act leaves; the stated limits');
{
  const domains = [D, ...(D2 === null ? [] : [D2])];
  const rows = await q(`select event_type, id::text, domain_id::text, partition_key, partition_seq::int, schema_version, status from objects.object_outbox where tenant_id = $1 and domain_id = any($2::uuid[]) and event_type = any($3::text[]) and created_at >= $4 order by partition_seq`, [T, domains, B18_EVENTS, new Date(tStart - 1000)]);
  const unpublished = rows.filter((r) => r.status !== 'published');
  const byType = Object.fromEntries(B18_EVENTS.map((t) => [t, rows.filter((r) => r.event_type === t).length]));
  if (rows.length > 0 && unpublished.length === 0) ok(`${rows.length} B18 event row(s) of this run, every one published: ${Object.entries(byType).map(([t, n]) => `${t} ×${n}`).join(', ')}`); else bad(`the B18 event rows of this run: ${rows.length}, unpublished ${unpublished.length}`);
  for (const r of rows) note(`${r.event_type}@${r.schema_version ?? '—'} ${short(r.id)} — ${r.domain_id === D ? 'origin' : 'mirror'} · partition ${r.partition_key} seq ${r.partition_seq} · ${r.status}`);
  const ir = await call(`${G}/interfaces`, jw({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
  if (!ir.ok) fail('graph/interfaces (j.weber)', ir);
  else {
    const all = ir.body.interfaces ?? [];
    const count = (s) => all.filter((i) => i.binding_state === s).length;
    const ten = BOUND_IN_0078.map((id) => all.find((i) => i.interface_id === id) ?? null);
    if (all.length === 50 && count('bound') === 36 && count('partial') === 14 && count('unbound') === 0 && ten.every((r) => r !== null && r.binding_state === 'bound' && r.bound_in === '0078')) ok(`the interface register (J. Weber): ${all.length} rows — ${count('bound')} bound / ${count('partial')} partial / ${count('unbound')} unbound; the ten bound in 0078: ${ten.map((r) => `${r.interface_id} ${r.name}@${r.schema_version}`).join(', ')}`);
    else bad(`the register: ${all.length} rows, ${count('bound')}/${count('partial')}/${count('unbound')}; the ten: ${ten.map((r) => (r === null ? 'MISSING' : `${r.interface_id} ${r.binding_state} ${r.bound_in ?? '—'}`)).join(', ')}`);
    note(`still partial (14): ${all.filter((i) => i.binding_state === 'partial').map((i) => i.interface_id).sort().join(', ')}`);
  }
  const fRow = F === null ? null : (await q(`select state, withdrawn_at from prediction.forecasts_current where forecast_id = $1`, [F]))[0] ?? null;
  const pk = PKG === null ? null : (await q(`select state, committed_version::int, reopens::int, (select count(*)::int from decision.commitments c where c.package_id = p.package_id) commitments from decision.packages_current p where package_id = $1`, [PKG]))[0] ?? null;
  const tv = TW === null || newV === null ? null : await twinVersionRow(TW, newV);
  note(`WHAT THE ACT LEAVES: the 90-day forecast ${short(F)} ${fRow?.state ?? '?'}${fRow?.withdrawn_at ? ` (withdrawn ${iso(fRow.withdrawn_at)})` : ''}; the scenario ${short(SCN)} on it (marked); the origin twin ${short(TW)} at version ${newV ?? '?'} (${tv?.verification_state ?? '?'}); the two runs (the reroute invalidated by its reproduction, the control valid); the package ${short(PKG)} ${pk?.state ?? '?'} at version ${pk?.committed_version ?? '?'} with ${pk?.commitments ?? '?'} commitment(s) (reopens ${pk?.reopens ?? '?'}) and its room; the challenge case queued; the mirror's live import untouched and K. Vogel's twin one version further (verified)`);
}
note('STATED: the FAILED state of SimulationCompleted is unit-tested only (every run here completes); the operator\'s invalidation is the harness\'s; a policy change has no recorded cause on a package (L10-I05 is B20); a closed decision is not reopened; the reopen leaves the standing commitment monitored until the re-commit; the extraction\'s ReviewRequested sites are exercised by the unit test and by the demonstration\'s extraction (none ran here)');
note('STATED: the reopen carries no option whose run was invalidated or rests on a withdrawn forecast (the status quo on the withdrawn forecast\'s control is dropped too — C12); the reopened draft cited act V\'s valid control instead; the January package and acts I–V were neither reopened, withdrawn nor invalidated');

console.log(`\nWHAT THE DEMONSTRATION SHOWED: ten lifecycle transitions announced from their own transactions — a twin admitted (both domains), two runs started and completed with their resource evidence, a package proposed and committed, a claim challenged, a forecast issued at v2 — then the chain: the forecast withdrawn as unfit with its dependants named and the consumers marked (the scenario, the twin version with its own announcement, the package noted as a material loss), the run resting on it invalidated by its own reproduction, the decision reopened on the recorded note with the stale options dropped and named, re-decided under a second commitment while the first stands byte for byte, and replayed at each commitment's own instant; the register at 36 bound.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-interfaces-b18 on a fresh database): the operator's invalidation and its empty reach; the negative of the automatic invalidation (a changed implementation withholds it); every refusal by family and status; the citation gate at set_option and at the proposal; the withdrawal of a package whose commitment stands; the second commit over a standing commitment; a reopened package still hearing of its inputs.`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`}`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
