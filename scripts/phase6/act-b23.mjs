#!/usr/bin/env node
/**
 * CP-6 batch B23 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): THE SIX PARTIAL
 * INTERFACES BOUND AND THE BRIEFING'S ATTENTION SECTION (migration 0084), exercised by the personas through the REAL HTTP path, each
 * scene stating the effect it produced in the ledgers and the outbox — and where nothing happened, saying so. EVERY OBJECT IS LOOKED
 * UP AT RUN TIME by SQL against the database the act is pointed at: no id is hard-coded.
 *
 *   B23-0 THE STATE: the register through the route (50 bound / 0 partial / 0 unbound — L10-I02, L10-I03, L1-I02, L3-I02, L4-I02,
 *         L7-I02 bound in 0084); the subscriptions whose consumer METHOD changed in B23 (decisions: MaterialChangeRaised from the note's
 *         write; attention: the two new classes and event types) REVOKED and registered anew by the administrator — a changed method
 *         is a new consumer — with the backlog LEFT; the attention policy VERSION 3 published by M. Dvořák with rules for the two new
 *         classes (decision.material_change, review.convened) beside version 2's five.
 *   B23-1 L10-I02 MaterialChangeRaised: T. Nakamura (twin owner) INVALIDATES a run the MONITORED package cites (an option that is not
 *         the chosen one; never the reopened B18 package's draft) → GraphChanged/simulation.invalidated → the decisions subscriber's
 *         package note and MaterialChangeRaised@v1 in the SAME transaction (the same correlation id) → the attention subscriber routes
 *         decision.material_change to the package owner, with its dimensions and the policy version; the attention subscription
 *         REPLAYED and the upstream GraphChanged RE-DRIVEN to the decisions subscription → no second item, no second event.
 *         A planted malformed MaterialChangeRaised is NOT staged on a demonstration: quarantine is proven by the harness (E4).
 *   B23-2 L10-I03 ReviewConvened: L. Brandt (decision owner) CONVENES a governed review of the monitored decision from the material-change
 *         item, J. Weber in the chair → ReviewConvened@v1 from the write → review.convened routed to the chair; the same convene key and
 *         content → the recorded review (repeated, no second event); the key with another question → 409; A. Hoffmann refused 403.
 *   B23-3 L1-I02 the STREAM form of Acquire: the synthetic corridor stream source registered (A. Hoffmann), approved and activated
 *         (M. Dvořák), its agent provisioned (the administrator) — through the routes; M. Dvořák OPENS partition chokepoint4 with credit 1
 *         and a pull limit of 2 (backpressure signalled and relieved; the stream pauses at its cursor); A. Hoffmann INTERRUPTS the idle
 *         stream; M. Dvořák RESUMES from the cursor with credit 2 → to the end of the range, the planted publisher gap (DEF-S1) an
 *         explicit incomplete range, closed_incomplete; a closed stream not resumed (409); N. Eriksen refused (403); the COMMAND form
 *         (collect now) on the same source and contract admits as before and touches no stream.
 *   B23-4 L3-I02 RetrieveContext: K. Müller records a memory item about the Cape of Good Hope corridor for the purpose 'sourcing decision';
 *         A. Hoffmann's context query under that purpose → complete, with its explanation links; under another purpose the item is not
 *         mentioned; the administrator WITHDRAWS edges_current → a declared PARTIAL answer naming the omission; REBUILT → complete again.
 *   B23-5 L4-I02 CommitGraphRevision: K. Müller commits ONE change set (the relationships the corridor claims support: a vessel through
 *         the corridor, what it carries, what the supplier depends on) → head + 1, one GraphChanged/revision.committed delivered to the
 *         graph consumers; the retry under the same key → the first result (repeated); a stale expected revision → 409; an invalid change
 *         set → 422 and nothing applied (the head unchanged); A. Hoffmann refused 403.
 *   B23-6 L7-I02 BranchScenario: N. Eriksen adds a user-defined 'insurer withdrawal' branch on another indicator to the corridor scenario
 *         that already carries the 'regional blockade' branch → v(n) → v(n+1); the same key and body → repeated; a stale version → 409;
 *         a second 'regional blockade' branch → 409 (refused, never admitted as a failing branch).
 *   B23-7 BRF@v2: M. Dvořák composes the monitored package's room briefing → schema_version v2 with the attention section (the routed
 *         items as of known_at with confidence bands, the material change since the prior edition); an earlier v1 edition still reads v1.
 *   B23-8 THE STATE: the queue by class and state, the reviews, the streams, the revision head, the register, what the act leaves.
 *
 * CASTING (the seed's personas; no persona is created — each one's recorded roles are read from identity.role_bindings before the act):
 * M. Dvořák (executive, collection_manager), N. Eriksen (forecast_owner), J. Weber (strategy_owner), L. Brandt (decision_owner,
 * decision_authority), K. Müller (knowledge_owner), A. Hoffmann (domain_analyst), T. Nakamura (twin_owner — the run's invalidation is the
 * twin owner's act; none of the seven others holds it); the administrator = the platform-admin session. Nothing here prints a credential.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, domainByName, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';
import { STREAM_SOURCE_CONTRACTS } from '../phase1/source-contracts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const O = `${X}/observation`; const E = `${X}/executive`; const P = `${X}/prediction`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 8)}…`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 260)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const mark = async () => (await q('select clock_timestamp() t'))[0].t;
const tStart = Date.now();
console.log(`THE B23 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);

/* ── the casting: each persona's recorded roles read before it acts ─────────────────── */
const CAST = { 'm.dvorak': ['executive', 'collection_manager'], 'n.eriksen': ['forecast_owner'], 'j.weber': ['strategy_owner'], 'l.brandt': ['decision_owner', 'decision_authority'],
  'k.mueller': ['knowledge_owner'], 'a.hoffmann': ['domain_analyst'], 't.nakamura': ['twin_owner'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, m]) => m.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, m]) => `${l} lacks ${m.join(', ')}`).join('; ')}`); process.exit(1); }
}
const dvorak = await who('m.dvorak'); const eriksen = await who('n.eriksen'); const weber = await who('j.weber'); const brandt = await who('l.brandt');
const mueller = await who('k.mueller'); const hoffmann = await who('a.hoffmann'); const nakamura = await who('t.nakamura');
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });

/* ── the outbox, the deliveries, the queue ──────────────────────────────────────────── */
const liveSubs = async () => q(`select subscription_id::text, consumer_kind from graph.subscriptions where tenant_id = $1 and domain_id = $2 and status <> 'revoked'`, [T, D]);
const deliveriesOf = (eventId) => q(`select d.subscription_id::text, d.consumer_kind, d.state, d.deliveries, d.replay_seq, d.items, d.items_applied, d.items_unresolved, d.failure_class, d.last_error
                                       from graph.subscription_deliveries d join graph.subscriptions s on s.subscription_id = d.subscription_id and s.status <> 'revoked'
                                      where d.event_id = $1 order by d.consumer_kind`, [eventId]);
const TERMINAL = ['applied', 'failed', 'refused', 'unresolved'];
async function settled(eventId, kinds, seconds = 150) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = (await deliveriesOf(eventId)).filter((d) => kinds.includes(d.consumer_kind));
    if (ds.length >= kinds.length && ds.every((d) => TERMINAL.includes(d.state))) { await sleep(1500); return deliveriesOf(eventId).then((x) => x.filter((d) => kinds.includes(d.consumer_kind))); }
    await sleep(1000);
  }
  return ds;
}
/** An outbox row of the type, created since the mark, whose payload the predicate accepts — once PUBLISHED. */
async function waitOutbox(eventType, pred, notBefore, seconds = 60) {
  for (let i = 0; i < seconds; i += 1) {
    const rows = await q(`select id::text, status, payload, correlation_id::text, partition_seq::int, created_at from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4 order by created_at desc limit 50`, [eventType, T, D, notBefore]);
    const row = rows.find((r) => pred(r.payload ?? {})) ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
const countOutbox = async (eventType, pred, notBefore) => (await q(`select payload from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4`, [eventType, T, D, notBefore])).filter((r) => pred(r.payload ?? {})).length;
const effects = (d) => { const m = new Map(); for (const x of d?.items_applied ?? []) m.set(x.effect, (m.get(x.effect) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ×${n}`).join(', ') || 'no effect'; };
const itemsOf = (cls, subjectId = null) => q(`select item_id::text, signal_class, subject_kind, subject_id::text, title, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, due_at, created_at, cause_event_id::text
                                               from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = $3 and ($4::uuid is null or subject_id = $4::uuid) order by created_at`, [T, D, cls, subjectId]);
const tally = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'; };
const loginOf = async (principalId) => (await q('select login_name from identity.principals where id = $1', [principalId]))[0]?.login_name ?? short(principalId);
/** Wait until a delivery's replay/redelivery is recorded (deliveries or replay_seq above what it was) and terminal. */
async function redelivered(eventId, subscriptionId, before, seconds = 90) {
  for (let i = 0; i < seconds; i += 1) {
    const d = (await deliveriesOf(eventId)).find((x) => x.subscription_id === subscriptionId) ?? null;
    if (d !== null && (d.deliveries > before.deliveries || d.replay_seq > before.replay_seq) && TERMINAL.includes(d.state)) return d;
    await sleep(1000);
  }
  return (await deliveriesOf(eventId)).find((x) => x.subscription_id === subscriptionId) ?? null;
}

/* ── the routes ─────────────────────────────────────────────────────────────────────── */
const interfaces = () => call(`${G}/interfaces`, env_(weber, 'graph')({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
const subscriptionStatus = async (domainId) => {
  const r = await call(`/v1/tenants/${T}/domains/${domainId}/graph/subscriptions/status`, as(admin, { tenantId: T, domainId }, { purposeId: 'platform.administration', action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, admin.token);
  return r.ok ? r.body.subscriptions : (fail('subscriptions/status', r), null);
};
const replay = (subscriptionId, fromSeq, reason) => call(`${G}/subscriptions/${subscriptionId}/replay`, ad({ action: 'graph.subscription.replay', objectType: 'SUB', objectId: subscriptionId, consequence: 'C2' }), { fromSeq, reason }, admin.token);
const publish = (s, rules, reason) => call(`${E}/attention/policy/publish`, env_(s, 'executive')({ action: 'executive.attention.policy.publish', objectType: 'ATP', consequence: 'C2' }), { rules, reason }, s.token);
const invalidateRun = (s, runId, reason) => call(`${X}/twins/simulations/${runId}/invalidate`, env_(s, 'simulation')({ action: 'simulation.run.invalidate', objectType: 'SIM', objectId: runId, consequence: 'C2' }), { reason }, s.token);
const convene = (s, payload) => call(`${E}/reviews/convene`, env_(s, 'executive')({ action: 'executive.review.convene', objectType: 'RVW', consequence: 'C2' }), payload, s.token);
const listReviews = (s, payload = {}) => call(`${E}/reviews/list`, env_(s, 'executive')({ action: 'executive.review.read', objectType: 'RVW', sideEffect: 'none' }), payload, s.token);
const streamOpen = (s, sourceId, payload) => call(`${O}/sources/${sourceId}/streams/open`, env_(s, 'observation')({ action: 'observation.stream.open', objectType: 'AQS', consequence: 'C2' }), payload, s.token);
const streamResume = (s, streamId, payload) => call(`${O}/streams/${streamId}/resume`, env_(s, 'observation')({ action: 'observation.stream.resume', objectType: 'AQS', objectId: streamId, consequence: 'C2' }), payload, s.token);
const streamInterrupt = (s, streamId, reason) => call(`${O}/streams/${streamId}/interrupt`, env_(s, 'observation')({ action: 'observation.stream.interrupt', objectType: 'AQS', objectId: streamId, consequence: 'C2' }), { reason }, s.token);
const streamGet = (s, streamId) => call(`${O}/streams/${streamId}/get`, env_(s, 'observation')({ action: 'observation.read.streams', objectType: 'AQS', objectId: streamId, sideEffect: 'none' }), {}, s.token);
const streamList = (s, sourceId) => call(`${O}/streams/list`, env_(s, 'observation')({ action: 'observation.read.streams', objectType: 'AQS', sideEffect: 'none' }), { sourceId }, s.token);
const collect = (s, sourceId, contractVersion) => call(`${O}/sources/${sourceId}/collect`, env_(s, 'observation')({ action: 'observation.run.trigger', objectType: 'RUN' }), { contractVersion }, s.token);
const recordMemory = (s, body) => call(`${G}/memory/record`, env_(s, 'memory')({ action: 'memory.item.record', objectType: 'MEM', consequence: 'C2' }), body, s.token);
const context = (s, purpose, subject) => call(`${G}/memory/context`, env_(s, purpose)({ action: 'memory.context.retrieve', objectType: 'MEM', sideEffect: 'none', consequence: 'C2' }), { subject, asOf: null, limit: 50 }, s.token);
const projection = (projection_, verb, reason) => call(`${G}/projections/${projection_}/${verb}`, ad({ action: `graph.projection.${verb}`, objectType: 'PRJ', consequence: 'C2' }), { reason }, admin.token);
const revisionHead = (s) => call(`${G}/revisions/head`, env_(s, 'graph')({ action: 'graph.read', objectType: 'GRV', sideEffect: 'none' }), {}, s.token);
const commitRevision = (s, payload) => call(`${G}/revisions`, env_(s, 'graph')({ action: 'graph.revision.commit', objectType: 'GRV', consequence: 'C2' }), payload, s.token);
const branchScenario = (s, scenarioId, payload) => call(`${P}/scenarios/${scenarioId}/branches`, env_(s, 'prediction')({ action: 'prediction.scenario.branch', objectType: 'SCN', objectId: scenarioId, consequence: 'C2' }), payload, s.token);
const composeBriefing = (s, payload) => call(`${X}/briefings/compose`, env_(s, 'briefing')({ action: 'briefing.compose', objectType: 'BRF', consequence: 'C2' }), payload, s.token);
const getBriefing = (s, id) => call(`${X}/briefings/${id}/get`, env_(s, 'briefing')({ action: 'briefing.read', objectType: 'BRF', objectId: id, sideEffect: 'none' }), {}, s.token);

/** The two classes 0084 adds to the attention policy: who must look at a material change on a decision and at a convened review, and by when. */
const NEW_CLASSES = {
  'decision.material_change': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['decision_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
  'review.convened': { materiality: { min_consequence: 'C2', min_confidence: 0.5, max_hours_to_window: 720 }, route_roles: ['strategy_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
};
const EXPECT_0084 = ['L10-I02', 'L10-I03', 'L1-I02', 'L3-I02', 'L4-I02', 'L7-I02'];
const PURPOSE = 'sourcing decision';
const STREAM = STREAM_SOURCE_CONTRACTS.find((c) => c.source_key === 'red-sea-corridor-stream');
const PK = 'red-sea-corridor-stream:chokepoint4';

/* ── B23-0 THE STATE ───────────────────────────────────────────────────────────────── */
console.log('\nB23-0 THE STATE — the register (50 / 0 / 0); the changed consumers re-registered; attention policy version 3');
{
  const ir = await interfaces();
  if (!ir.ok) fail('graph/interfaces', ir);
  else {
    const all = ir.body.interfaces ?? []; const count = (s) => all.filter((i) => i.binding_state === s).length;
    const six = EXPECT_0084.map((id) => all.find((i) => i.interface_id === id) ?? null);
    if (all.length === 50 && count('bound') === 50 && count('partial') === 0 && count('unbound') === 0 && six.every((r) => r?.binding_state === 'bound' && r?.bound_in === '0084'))
      ok(`the interface register (J. Weber): 50 rows — 50 bound / 0 partial / 0 unbound; bound in 0084: ${six.map((r) => `${r.interface_id} ${r.name}`).join(', ')}`);
    else bad(`the register: ${all.length} rows, ${count('bound')}/${count('partial')}/${count('unbound')}; ${six.map((r) => (r === null ? 'MISSING' : `${r.interface_id} ${r.binding_state} ${r.bound_in}`)).join(', ')}`);
  }
}
const subs = {};
{
  const st = await subscriptionStatus(D);
  const consumers = st?.consumers ?? [];
  const live = (st?.subscriptions ?? []).filter((s) => s.status !== 'revoked');
  const changed = live.filter((s) => { const c = consumers.find((x) => x.kind === s.consumer_kind); return c !== undefined && (c.codeDigest !== s.code_digest || c.version !== s.consumer_version); });
  note(`the origin's ${live.length} live subscriptions: ${changed.length === 0 ? 'every one carries this process\'s consumer identity' : `${changed.map((s) => s.consumer_kind).join(', ')} registered for a consumer whose method has since changed`}`);
  const unexpected = changed.filter((s) => !['decisions', 'attention'].includes(s.consumer_kind));
  if (unexpected.length > 0) note(`kinds changed besides the two B23 names: ${unexpected.map((s) => s.consumer_kind).join(', ')} — re-registered the same way`);
  for (const s of changed) {
    const c = consumers.find((x) => x.kind === s.consumer_kind);
    const row = (await q('select owner_principal_id::text, checkpoint_seq::text from graph.subscriptions where subscription_id = $1', [s.subscription_id]))[0];
    const rv = await call(`${G}/subscriptions/${s.subscription_id}/revoke`, ad({ action: 'graph.subscription.control', objectType: 'SUB', objectId: s.subscription_id, consequence: 'C2' }),
      { reason: `B23: the ${s.consumer_kind} consumer's method changed (${String(s.code_digest).slice(0, 12)}… → ${String(c.codeDigest).slice(0, 12)}…); a changed method is a new consumer` }, admin.token);
    if (!rv.ok) { fail(`revoke the outdated ${s.consumer_kind} subscription`, rv); continue; }
    const r = await call(`${G}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }), { consumerKind: s.consumer_kind, ownerPrincipalId: row.owner_principal_id, backlog: 'leave' }, admin.token);
    if (!r.ok) { fail(`register ${s.consumer_kind}`, r); continue; }
    const n = r.body.subscription;
    ok(`${s.consumer_kind}: subscription ${short(s.subscription_id)} (consumer ${String(s.code_digest).slice(0, 12)}…, cursor ${row.checkpoint_seq ?? 'none'}) REVOKED; registered anew as ${short(n.subscriptionId)} (role ${n.role}, consumer ${n.consumer.version} ${String(n.consumer.codeDigest).slice(0, 12)}…, event types ${n.eventTypes.join(' | ')}, owner ${await loginOf(row.owner_principal_id)}), the backlog LEFT (${r.body.served.reDriven ?? 0} re-driven)`);
  }
  for (const r of await liveSubs()) subs[r.consumer_kind] = r.subscription_id;
  const after = await subscriptionStatus(D);
  const stale = (after?.subscriptions ?? []).filter((s) => s.status !== 'revoked' && (after.consumers ?? []).some((c) => c.kind === s.consumer_kind && (c.codeDigest !== s.code_digest || c.version !== s.consumer_version)));
  if (stale.length === 0 && subs.decisions && subs.attention) ok(`every live subscription of the origin now carries this process's consumer identity (${Object.keys(subs).length} kinds); the attention kind selects ${(after.subscriptions.find((s) => s.subscription_id === subs.attention)?.event_types ?? []).length || 'its'} event types`);
  else bad(`subscriptions still outdated: ${stale.map((s) => s.consumer_kind).join(', ') || 'none'}; decisions ${subs.decisions ?? 'MISSING'}, attention ${subs.attention ?? 'MISSING'}`);
  const mirror = await domainByName(admin, T, 'NORDWERK Exchange Mirror (SYNTHETIC)').catch(() => null);
  if (mirror !== null) {
    const ms = await subscriptionStatus(mirror.id);
    const mstale = (ms?.subscriptions ?? []).filter((s) => s.status !== 'revoked' && (ms.consumers ?? []).some((c) => c.kind === s.consumer_kind && c.codeDigest !== s.code_digest));
    note(`the mirror domain (not this act's): ${mstale.length === 0 ? 'every live subscription current' : `${mstale.map((s) => s.consumer_kind).join(', ')} outdated since earlier batches — left as they are, said`}`);
  }
}
let policyVersion = null;
{
  const active = (await q(`select version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  const has = active !== null && Object.keys(NEW_CLASSES).every((k) => active.rules?.classes?.[k] !== undefined);
  if (active === null) bad('no attention policy is active (act-b22 publishes versions 1 and 2) — version 3 extends the active one');
  else if (has) { policyVersion = active.version; note(`the active policy (version ${active.version}) already carries rules for ${Object.keys(NEW_CLASSES).join(' and ')} — an earlier run published it`); }
  else {
    const rules = { ...active.rules, classes: { ...active.rules.classes, ...NEW_CLASSES } };
    const t0 = await mark();
    const r = await publish(dvorak, rules, 'B23: material changes on a decision go to its owner within four hours; a convened review goes to its chair (strategy owners) within a day; both escalate to the executive once.');
    if (!r.ok) fail('M. Dvořák publishes version 3', r);
    else {
      const p = r.body.policy; policyVersion = p.version;
      ok(`M. Dvořák published attention policy VERSION ${p.version} (supersedes ${p.supersedes}; changed sections ${p.changed_sections.join(', ')}; classes ${p.changed_classes.join(', ')}) — version ${active.version}'s ${Object.keys(active.rules.classes).length} classes kept, the two B23 classes added`);
      const ev = await waitOutbox('AttentionPolicyChanged', (x) => x.policy_id === p.policy_id, t0);
      const d = ev === null ? null : (await settled(ev.id, ['attention'])).find((x) => x.consumer_kind === 'attention') ?? null;
      if (d?.state === 'applied') ok(`AttentionPolicyChanged@${ev.payload.schema_version} (${short(ev.id)}) applied by the NEW attention subscription: ${(d.items ?? []).length} item(s) re-evaluated — ${effects(d)}`);
      else bad(`AttentionPolicyChanged: ${ev === null ? 'not published' : `delivery ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}`}`);
    }
  }
}

/* ── B23-1 L10-I02 MaterialChangeRaised ────────────────────────────────────────────── */
console.log('\nB23-1 L10-I02 — a run a monitored decision cites is invalidated: the package note and MaterialChangeRaised@v1 in one transaction; routed to the owner');
let PKG = null; let MC_ITEM = null; let ROOM = null;
{
  // THE PACKAGE: a committed or monitored one (never the reopened B18 package's draft). THE RUN: cited by its current version, by an option
  // that is NOT the chosen one, cited by no other open package's current version, completed and not invalidated.
  PKG = (await q(`select package_id::text, title, state, current_version, owner_principal_id::text from decision.packages_current where tenant_id = $1 and domain_id = $2 and state in ('committed','monitoring') order by declared_at limit 1`, [T, D]))[0] ?? null;
  if (PKG === null) note('no committed or monitored package stands — the material change is not staged');
  else {
    ROOM = (await q(`select room_id::text from executive.rooms_current where package_id = $1 limit 1`, [PKG.package_id]))[0]?.room_id ?? null;
    const earlier = (await itemsOf('decision.material_change', PKG.package_id));
    const cand = (await q(`
      with cur as (select o.package_id, o.key, c ->> 'id' as run_id from decision.options o join decision.packages_current p on p.package_id = o.package_id and p.current_version = o.version,
                   jsonb_array_elements(o.consequences) c where c ->> 'kind' = 'run')
      select cur.key, cur.run_id, r.run_kind from cur join simulation.runs_current r on r.run_id::text = cur.run_id
       where cur.package_id = $1 and r.state = 'completed' and r.run_kind <> 'control'
         and cur.key <> coalesce((select v.choice ->> 'option_key' from decision.package_versions v join decision.packages_current p on p.package_id = v.package_id and p.current_version = v.version where v.package_id = $1), '')
         and not exists (select 1 from cur o2 where o2.run_id = cur.run_id and o2.package_id <> $1)
         and not exists (select 1 from simulation.run_events e where e.run_id = r.run_id and e.event ilike '%invalidat%')
       order by cur.key limit 1`, [PKG.package_id]))[0] ?? null;
    note(`the package: "${PKG.title}" (${PKG.state}, version ${PKG.current_version}, owner ${await loginOf(PKG.owner_principal_id)}); ${earlier.length > 0 ? `${earlier.length} material-change item(s) already on it (an earlier run)` : 'no material-change item on it yet'}`);
    if (cand === null || earlier.length > 0) {
      if (earlier.length > 0) { MC_ITEM = earlier[0]; note(`an earlier run invalidated a cited run and its material change was routed (item ${short(MC_ITEM.item_id)}, ${MC_ITEM.state}) — no second run is invalidated`); }
      else note('no cited run is eligible (every one is chosen, shared with another package, a control or already invalidated) — the scene is skipped');
    } else {
      const t1 = await mark();
      const inv = await invalidateRun(nakamura, cand.run_id, `B23 demonstration: the ${cand.key} option's run is invalidated by the twin owner — its result is no longer vouched for; the monitored decision that cites it must hear of it`);
      if (!inv.ok) fail('T. Nakamura invalidates the run', inv);
      else {
        ok(`T. Nakamura INVALIDATED run ${short(cand.run_id)} (${cand.run_kind}, option ${cand.key} of "${PKG.title}" — not the chosen option): the SIM withdrawn at version ${inv.body.invalidation.withdrawnVersion}`);
        const gc = await waitOutbox('GraphChanged', (x) => x.change?.kind === 'simulation.invalidated' && (x.simulation?.run_id === cand.run_id || (x.objects?.runs ?? []).includes(cand.run_id)), t1);
        if (gc === null) bad('GraphChanged/simulation.invalidated was not published');
        else {
          const dd = (await settled(gc.id, ['decisions'])).find((x) => x.consumer_kind === 'decisions') ?? null;
          const mine = (dd?.items_applied ?? []).find((x) => x.item === PKG.package_id || x.effect_ref === PKG.package_id) ?? null;
          if (dd?.state === 'applied' && mine?.effect === 'input.invalidated') ok(`GraphChanged/simulation.invalidated (${short(gc.id)}, seq ${gc.partition_seq}) applied by the decisions subscriber: ${effects(dd)} — on "${PKG.title}": ${mine.details?.material_change_raised ? `MaterialChangeRaised with dims ${JSON.stringify(mine.details.material_change_raised.dims)}, policy version ${mine.details.material_change_raised.policy_version}` : 'NO material change raised'}`);
          else bad(`the decisions delivery: ${dd?.state ?? 'NONE'} ${dd?.last_error ?? ''} ${JSON.stringify(dd?.items_applied ?? []).slice(0, 300)}`);
          const noteRow = (await q(`select event_id::text, correlation_id::text, details from decision.package_events where package_id = $1 and event = 'input.invalidated' and details ->> 'outbox_event_id' = $2`, [PKG.package_id, gc.id]))[0] ?? null;
          const mcr = await waitOutbox('MaterialChangeRaised', (x) => x.package_id === PKG.package_id && x.trigger?.event_id === gc.id, t1);
          if (noteRow !== null && mcr !== null && mcr.correlation_id === noteRow.correlation_id && mcr.payload.trigger?.note_id === noteRow.event_id)
            ok(`the package NOTE ${short(noteRow.event_id)} (${noteRow.details.failure_class} → ${noteRow.details.disposition}) and MaterialChangeRaised@${mcr.payload.schema_version} (${short(mcr.id)}, seq ${mcr.partition_seq}) share correlation ${short(mcr.correlation_id)} — ONE transaction: package ${short(mcr.payload.package_id)} v${mcr.payload.version} (${mcr.payload.package_state}, executed ${mcr.payload.executed}), trigger ${mcr.payload.trigger.change_kind}, dims { consequence ${mcr.payload.dims.consequence}, confidence ${mcr.payload.dims.confidence}, hours_to_window ${mcr.payload.dims.hours_to_window} (deadline ${mcr.payload.dims.decision_deadline}), basis ${mcr.payload.dims.basis} }, policy version ${mcr.payload.policy_version}`);
          else bad(`the note and the event: note ${noteRow === null ? 'MISSING' : `${short(noteRow.event_id)} corr ${short(noteRow.correlation_id)}`}; MaterialChangeRaised ${mcr === null ? 'MISSING' : `${short(mcr.id)} corr ${short(mcr.correlation_id)} note ${short(mcr.payload.trigger?.note_id)}`}`);
          if (mcr !== null) {
            const da = (await settled(mcr.id, ['attention'])).find((x) => x.consumer_kind === 'attention') ?? null;
            const routed = (da?.items_applied ?? []).find((x) => x.effect === 'attention.routed') ?? null;
            MC_ITEM = (await itemsOf('decision.material_change', PKG.package_id)).find((x) => x.cause_event_id === mcr.id) ?? null;
            if (da?.state === 'applied' && routed !== null && MC_ITEM !== null && MC_ITEM.owner_principal_id === PKG.owner_principal_id && MC_ITEM.outcome === 'material' && MC_ITEM.policy_version === policyVersion)
              ok(`the attention subscriber ROUTED decision.material_change: item ${short(MC_ITEM.item_id)} "${String(MC_ITEM.title).slice(0, 150)}" → ${MC_ITEM.state}, owner ${await loginOf(MC_ITEM.owner_principal_id)} (the package owner), roles ${MC_ITEM.route_roles.join('+')}, due ${iso(MC_ITEM.due_at)}, policy version ${MC_ITEM.policy_version}; dimensions ${JSON.stringify(MC_ITEM.evaluation?.dimensions)}; reasons: ${(MC_ITEM.evaluation?.reasons ?? []).join('; ')}`);
            else bad(`the attention routing: delivery ${da?.state ?? 'NONE'} ${da?.last_error ?? ''}; item ${MC_ITEM === null ? 'MISSING' : `${MC_ITEM.outcome}/${MC_ITEM.state} owner ${short(MC_ITEM.owner_principal_id)} v${MC_ITEM.policy_version}`}`);
            // AT-LEAST-ONCE, DE-DUPLICATED: the attention subscription replayed over the event; the upstream change re-driven to the decisions subscription.
            const beforeA = (await deliveriesOf(mcr.id)).find((x) => x.subscription_id === subs.attention);
            const ra = await replay(subs.attention, mcr.partition_seq - 1, 'B23 demonstration: the material change re-delivered to the attention subscription — the consumer de-duplicates');
            if (!ra.ok) fail('replay the attention subscription', ra);
            else {
              const again = await redelivered(mcr.id, subs.attention, beforeA ?? { deliveries: 1, replay_seq: 0 });
              const rep = (again?.items_applied ?? []).find((x) => x.effect === 'attention.routed');
              const n = (await itemsOf('decision.material_change', PKG.package_id)).filter((x) => x.cause_event_id === mcr.id).length;
              if (again !== null && again.state === 'applied' && (again.deliveries > (beforeA?.deliveries ?? 1) || again.replay_seq > (beforeA?.replay_seq ?? 0)) && rep?.details?.repeated === true && n === 1)
                ok(`the attention subscription REPLAYED from seq ${mcr.partition_seq - 1} (${ra.body.replayed ?? '?'} event(s) re-driven): the delivery ${again.deliveries} time(s), replay ${again.replay_seq}, answered repeated — still ONE item for the cause (the de-duplication key: class, subject and cause event)`);
              else bad(`the replay: delivery ${again?.state ?? 'NONE'} deliveries ${again?.deliveries} replay ${again?.replay_seq}, repeated ${rep?.details?.repeated}, items ${n}`);
            }
            const beforeD = (await deliveriesOf(gc.id)).find((x) => x.subscription_id === subs.decisions);
            const rd = await replay(subs.decisions, gc.partition_seq - 1, 'B23 demonstration: the invalidation re-driven to the decisions subscription — the note is recorded once per cause');
            if (!rd.ok) fail('replay the decisions subscription', rd);
            else {
              const again = await redelivered(gc.id, subs.decisions, beforeD ?? { deliveries: 1, replay_seq: 0 });
              const eff = (again?.items_applied ?? []).find((x) => x.item === PKG.package_id || x.effect_ref === PKG.package_id);
              const nMcr = await countOutbox('MaterialChangeRaised', (x) => x.package_id === PKG.package_id && x.trigger?.event_id === gc.id, t1);
              if (again?.state === 'applied' && eff?.effect === 'input.already_noted' && nMcr === 1) ok(`GraphChanged re-driven to the decisions subscription (${rd.body.replayed ?? '?'} event(s)): input.already_noted — no second note, still ONE MaterialChangeRaised for the cause`);
              else bad(`the re-drive: delivery ${again?.state ?? 'NONE'}, effect ${eff?.effect ?? 'NONE'}, MaterialChangeRaised ×${nMcr}`);
            }
          }
        }
      }
    }
  }
  note('a MALFORMED MaterialChangeRaised is not planted on a demonstration: its quarantine (invalid_event → human_review, nothing routed) is proven by the harness (phase6-attention-events-b23, E4), said, not staged');
}

/* ── B23-2 L10-I03 ReviewConvened ─────────────────────────────────────────────────── */
console.log('\nB23-2 L10-I03 — a governed review convened by a named human; ReviewConvened routed to the chair; the same key answers the recorded review');
let REVIEW = null;
{
  const KEY = 'b23-act:review-of-the-monitored-decision';
  const recorded = (await q(`select review_id::text, subject_kind, subject_id::text, subject_version, question, chair_principal_id::text chair, reviewers::text[] reviewers, due_at, cause_item_id::text, room_id::text, state
                              from executive.reviews where tenant_id = $1 and domain_id = $2 and convened_by = $3 and convene_key = $4`, [T, D, brandt.principalId, KEY]))[0] ?? null;
  if (PKG === null) note('no monitored package — the review is not staged');
  else {
    const payload = recorded !== null
      ? { subject: { kind: recorded.subject_kind, id: recorded.subject_id, version: recorded.subject_version }, question: recorded.question, chair: recorded.chair, reviewers: recorded.reviewers,
          due_at: iso(recorded.due_at), convene_key: KEY, cause_item_id: recorded.cause_item_id, room_id: recorded.room_id }
      : { subject: { kind: 'decision', id: PKG.package_id, version: Number(PKG.current_version) },
          question: 'Does the monitored decision still stand now that a run one of its options cites was invalidated — or is a reopen or compensation owed?',
          chair: weber.principalId, reviewers: [dvorak.principalId], due_at: new Date(Date.now() + 72 * 3600_000).toISOString(), convene_key: KEY,
          cause_item_id: MC_ITEM?.item_id ?? null, room_id: ROOM };
    if (recorded !== null) note(`an earlier run convened review ${short(recorded.review_id)} under the key (${recorded.state}) — the same content is offered again`);
    const h = await convene(hoffmann, { ...payload, convene_key: 'b23-act:analyst-attempt' });
    if (h.status === 403) ok(`A. Hoffmann (domain_analyst) refused: ${refusalLine(h)}`); else bad(`A. Hoffmann was not refused: ${refusalLine(h)}`);
    const t2 = await mark();
    const r = await convene(brandt, payload);
    if (!r.ok) fail('L. Brandt convenes the review', r);
    else {
      REVIEW = r.body.review;
      ok(`L. Brandt CONVENED review ${short(REVIEW.review_id)}${REVIEW.repeated ? ' (REPEATED — an earlier run recorded it)' : ''}: ${REVIEW.subject_kind} "${REVIEW.subject_title}" at version ${REVIEW.subject_version}, chair ${await loginOf(REVIEW.chair)}, reviewers ${(await Promise.all((REVIEW.reviewers ?? []).map(loginOf))).join(', ')}, due ${iso(REVIEW.due_at)}, from item ${short(REVIEW.cause_item_id)}, in room ${short(REVIEW.room_id)}; digest ${String(REVIEW.request_digest).slice(0, 12)}…`);
      if (!REVIEW.repeated) {
        const ev = await waitOutbox('ReviewConvened', (x) => x.review_id === REVIEW.review_id, t2);
        const d = ev === null ? null : (await settled(ev.id, ['attention'])).find((x) => x.consumer_kind === 'attention') ?? null;
        const it = (await itemsOf('review.convened', REVIEW.review_id))[0] ?? null;
        if (ev !== null && d?.state === 'applied' && it !== null && it.owner_principal_id === weber.principalId)
          ok(`ReviewConvened@${ev.payload.schema_version} (${short(ev.id)}) from the write → the attention subscriber (${effects(d)}): review.convened item ${short(it.item_id)} → ${it.state}, owner ${await loginOf(it.owner_principal_id)} (the chair), roles ${it.route_roles.join('+')}, due ${iso(it.due_at)}, policy version ${it.policy_version}; dimensions ${JSON.stringify(it.evaluation?.dimensions)}`);
        else bad(`the routing of the review: event ${ev === null ? 'MISSING' : short(ev.id)}, delivery ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}, item ${it === null ? 'MISSING' : `${it.state} owner ${short(it.owner_principal_id)}`}`);
      }
      const r2 = await convene(brandt, payload);
      const nEv = await countOutbox('ReviewConvened', (x) => x.review_id === REVIEW.review_id, new Date(0));
      if (r2.ok && r2.body.review.repeated === true && r2.body.review.review_id === REVIEW.review_id && nEv === 1) ok(`the same key and content again → the RECORDED review ${short(r2.body.review.review_id)} (repeated true); ReviewConvened published once for it (×${nEv})`);
      else bad(`the repeat: ${r2.ok ? `review ${short(r2.body.review.review_id)} repeated ${r2.body.review.repeated}` : refusalLine(r2)}; ReviewConvened ×${nEv}`);
      const r3 = await convene(brandt, { ...payload, question: `${payload.question} (a different question under the same key)` });
      if (r3.status === 409) ok(`the same key with another question refused: ${refusalLine(r3)}`); else bad(`the key reused for another review: ${refusalLine(r3)}`);
    }
  }
}

/* ── B23-3 L1-I02 the stream form ─────────────────────────────────────────────────── */
console.log('\nB23-3 L1-I02 — the corridor stream: credit backpressure, an operator\'s interrupt, the resume from the cursor, the explicit incomplete range; the command form unchanged');
let STREAM_ID = null;
{
  let src = (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 order by source_id, contract_version desc`, [T, D, STREAM.source_key]))[0] ?? null;
  if (src === null) {
    const r = await call(`${O}/sources/register`, env_(hoffmann, 'observation')({ action: 'observation.source.register', objectType: 'SRC' }), { contract: STREAM }, hoffmann.token);
    if (!r.ok) fail('A. Hoffmann registers the stream source', r);
    else { src = { source_id: r.body.source.sourceId, contract_version: r.body.source.contractVersion, lifecycle_state: 'draft' }; ok(`A. Hoffmann REGISTERED "${STREAM.name}" (source ${short(src.source_id)}, contract v${src.contract_version}; kept out of the seed, registered through the route)`); }
  } else note(`the stream source is registered (${short(src.source_id)} v${src.contract_version}, ${src.lifecycle_state}) — an earlier run`);
  if (src !== null && src.lifecycle_state === 'draft') {
    const a = await call(`${O}/sources/${src.source_id}/approve`, env_(dvorak, 'observation')({ action: 'observation.source.approve', objectType: 'SRC', objectId: src.source_id }), { contractVersion: src.contract_version, decision: 'approve', reason: 'B23: the synthetic corridor stream fixture reviewed — replay only, synthetic at row level, internal analysis' }, dvorak.token);
    if (a.ok) { src.lifecycle_state = 'approved'; ok('M. Dvořák APPROVED it (a different operator from the registrar)'); } else fail('M. Dvořák approves', a);
  }
  if (src !== null && src.lifecycle_state === 'approved') {
    const t = await call(`${O}/sources/${src.source_id}/transition`, env_(dvorak, 'observation')({ action: 'observation.source.transition', objectType: 'SRC', objectId: src.source_id }), { contractVersion: src.contract_version, target: 'active', reason: 'B23: the stream form demonstrated on the synthetic corridor fixture' }, dvorak.token);
    if (t.ok) { src.lifecycle_state = 'active'; ok('M. Dvořák ACTIVATED it (no agent yet — so no schedule: the scheduler polls nothing no agent may collect)'); } else fail('M. Dvořák activates', t);
  }
  if (src !== null && src.lifecycle_state === 'active') {
    const agent = (await q(`select agent_id::text from observation.agents where source_id = $1 and status = 'active' limit 1`, [src.source_id]))[0] ?? null;
    if (agent === null) {
      const r = await call(`${O}/agents/register`, ad({ action: 'observation.agent.register', objectType: 'AGT', purposeId: 'observation' }), { sourceId: src.source_id, connector: STREAM.connector_kind, ownerPrincipalId: hoffmann.principalId }, admin.token);
      if (r.ok) ok(`the administrator PROVISIONED its collection agent ${short(r.body.agent.agentId)} (owner A. Hoffmann)`); else fail('the administrator provisions the agent', r);
    } else note(`its agent ${short(agent.agent_id)} is active — an earlier run`);
    const cv = Number(src.contract_version);
    const earlier = await q(`select stream_id::text, state from observation.acquisition_streams where source_id = $1 and partition_key = $2 order by opened_at`, [src.source_id, PK]);
    if (earlier.length > 0) note(`streams already on ${PK}: ${earlier.map((s) => `${short(s.stream_id)} ${s.state}`).join(', ')} — an earlier run`);
    const fo = await streamOpen(eriksen, src.source_id, { contractVersion: cv, partitionKey: PK, credit: 1, maxSegments: 2 });
    if (fo.status === 403) ok(`N. Eriksen (forecast_owner) refused the stream: ${refusalLine(fo)}`); else bad(`N. Eriksen was not refused: ${refusalLine(fo)}`);
    const streamsBefore = (await q(`select count(*)::int n from observation.acquisition_streams where source_id = $1`, [src.source_id]))[0].n;
    const done = earlier.find((s) => ['completed', 'closed_incomplete'].includes(s.state)) ?? null;
    const o1 = done !== null ? null : await streamOpen(dvorak, src.source_id, { contractVersion: cv, partitionKey: PK, credit: 1, maxSegments: 2 });
    if (done !== null) {
      STREAM_ID = done.stream_id;
      const g = await streamGet(hoffmann, STREAM_ID);
      if (g.ok) ok(`an earlier run walked ${PK} to its end (stream ${short(STREAM_ID)} ${g.body.stream.state}) — not walked again; its segments ${g.body.segments.map((s) => `${s.seq}${s.incomplete ? ' gap' : ''}:${s.item_count}`).join(' · ')}, ${g.body.incompleteRanges.filter((x) => x.resolved_by_seq === null).map((x) => `[${x.range_from}, ${x.range_to}) ${x.reason_class}`).join(', ') || 'no'} unresolved range`);
      else fail('the stream read', g);
    } else if (!o1.ok) fail('M. Dvořák opens the stream', o1);
    else {
      STREAM_ID = o1.body.stream.stream_id; const s1 = o1.body.stream; const r1 = o1.body.run;
      const ev1 = (await q(`select event from observation.acquisition_stream_events where stream_id = $1 order by ledger_seq`, [STREAM_ID])).map((e) => e.event);
      if (s1.state === 'open' && Number(s1.next_seq) === 2 && r1.segments === 2 && r1.backpressureSignals >= 1 && ev1.includes('backpressured') && ev1.includes('backpressure.relieved') && ev1.at(-1) === 'paused')
        ok(`M. Dvořák OPENED stream ${short(STREAM_ID)} on ${PK} (credit 1, pull limit 2): run ${short(r1.runId)} ${r1.state} — ${r1.segments} segment(s), ${r1.admitted} admitted, ${r1.noop} unchanged, backpressure signalled ${r1.backpressureSignals}×; the stream PAUSES at its cursor (state ${s1.state}, next seq ${s1.next_seq}, high water ${s1.high_water}); its ledger: ${ev1.join(' → ')}`);
      else bad(`the opening: stream ${JSON.stringify({ state: s1.state, next_seq: s1.next_seq })}, run ${JSON.stringify(r1).slice(0, 300)}; ledger ${ev1.join(',')}`);
      const it = await streamInterrupt(hoffmann, STREAM_ID, 'B23: the corridor desk pauses the feed for the shift handover');
      if (it.ok && it.body.stream.state === 'interrupted' && it.body.stream.requested === false) ok(`A. Hoffmann INTERRUPTED the idle stream at once (state ${it.body.stream.state}; the reason recorded on its ledger)`);
      else bad(`the interrupt: ${it.ok ? JSON.stringify(it.body.stream).slice(0, 300) : refusalLine(it)}`);
      const o2 = await streamResume(dvorak, STREAM_ID, { credit: 2 });
      if (!o2.ok) fail('M. Dvořák resumes the stream', o2);
      else {
        const s2 = o2.body.stream; const r2 = o2.body.run;
        const ranges = await q(`select range_from::text, range_to::text, reason_class, detail, declared_seq, resolved_by_seq from observation.acquisition_incomplete_ranges where stream_id = $1 order by declared_at`, [STREAM_ID]);
        const gap = ranges.find((x) => x.reason_class === 'publisher_gap' && x.resolved_by_seq === null) ?? null;
        if (s2.state === 'closed_incomplete' && s2.reached_end === true && r2.incompleteRanges >= 1 && gap !== null)
          ok(`M. Dvořák RESUMED from the cursor with credit 2: run ${short(r2.runId)} ${r2.state} — ${r2.segments} segment(s), ${r2.admitted} admitted, ${r2.noop} unchanged, backpressure ${r2.backpressureSignals}×; the stream reached the end of its range (high water ${s2.high_water}) and CLOSED ${s2.state}: the EXPLICIT INCOMPLETE RANGE [${gap.range_from}, ${gap.range_to}) ${gap.reason_class} at seq ${gap.declared_seq} — "${String(gap.detail).slice(0, 110)}"`);
        else bad(`the resume: stream ${JSON.stringify({ state: s2.state, reached_end: s2.reached_end, next_seq: s2.next_seq })}, run ${JSON.stringify(r2).slice(0, 300)}, ranges ${JSON.stringify(ranges).slice(0, 300)}`);
        const again = await streamResume(dvorak, STREAM_ID, {});
        if (again.status === 409) ok(`a closed stream is not resumed: ${refusalLine(again)}`); else bad(`the closed stream resumed: ${refusalLine(again)}`);
      }
      const g = await streamGet(hoffmann, STREAM_ID);
      const l = await streamList(hoffmann, src.source_id);
      if (g.ok && l.ok) ok(`the reads (A. Hoffmann): segments ${g.body.segments.map((s) => `${s.seq}${s.incomplete ? ' gap' : ''}:${s.item_count}`).join(' · ')}; ${g.body.incompleteRanges.length} incomplete range(s); ${g.body.events.length} ledger event(s); the source's streams listed: ${l.body.streams.length}`);
      else bad(`the reads: get ${g.status}, list ${l.status}`);
    }
    // THE COMMAND FORM, unchanged: collect now on the same source and contract.
    const tc = await mark();
    const c = await collect(dvorak, src.source_id, cv);
    const streamsAfter = (await q(`select count(*)::int n from observation.acquisition_streams where source_id = $1`, [src.source_id]))[0].n;
    if (!c.ok) fail('M. Dvořák collects now (the command form)', c);
    else {
      const run = c.body.run;
      const cp = (await q(`select count(*)::int n from observation.collection_run_events where run_id = $1 and event = 'run.checkpointed'`, [run.runId]))[0].n;
      const segs = (await q(`select count(*)::int n from observation.acquisition_segments s join observation.acquisition_streams a on a.stream_id = s.stream_id where a.source_id = $1 and s.appended_at >= $2`, [src.source_id, tc]).catch(() => [{ n: 0 }]))[0].n;
      if (run.state === 'finished' && streamsAfter === streamsBefore + (o1?.ok ? 1 : 0) && segs === 0)
        ok(`the COMMAND form unchanged: M. Dvořák's collect-now run ${short(run.runId)} ${run.state} — ${run.admitted} admitted, ${run.noop} unchanged, ${run.quarantined} quarantined (the whole snapshot in one run, under its own item keys); run.checkpointed ${cp}×; no stream opened and no segment appended by it`);
      else bad(`the command form: run ${JSON.stringify(run).slice(0, 300)}; streams ${streamsBefore}→${streamsAfter}; segments since ${segs}`);
    }
  }
}

/* ── B23-4 L3-I02 RetrieveContext ─────────────────────────────────────────────────── */
console.log(`\nB23-4 L3-I02 — the corridor's context for a '${PURPOSE}': complete; partial with the omission named while edges_current is withdrawn; complete again`);
{
  const subject = (await q(`select entity_id::text, canonical_name from graph.entities_current where tenant_id = $1 and domain_id = $2 and entity_type = 'place' and lifecycle_state = 'active' and canonical_name ilike 'Cape of Good Hope%' order by created_at limit 1`, [T, D]))[0] ?? null;
  const edge = (await q(`select e.edge_id::text, e.predicate, s.canonical_name subj, o.canonical_name obj, e.evidence_object_id::text, e.evidence_digest from graph.edges_current e
                          join graph.entities_current s on s.entity_id = e.subject_entity_id join graph.entities_current o on o.entity_id = e.object_entity_id
                         where e.tenant_id = $1 and e.domain_id = $2 and e.state = 'asserted' and e.evidence_object_id is not null order by e.asserted_at nulls last limit 1`, [T, D]).catch(async () =>
    q(`select e.edge_id::text, e.predicate, s.canonical_name subj, o.canonical_name obj, e.evidence_object_id::text, e.evidence_digest from graph.edges_current e join graph.entities_current s on s.entity_id = e.subject_entity_id join graph.entities_current o on o.entity_id = e.object_entity_id
        where e.tenant_id = $1 and e.domain_id = $2 and e.state = 'asserted' and e.evidence_object_id is not null limit 1`, [T, D])))[0] ?? null;
  const evd = edge === null ? null : (await q(`select object_id::text, object_version::int from objects.canonical_objects where object_id = $1 and object_type = 'EVD' and payload ->> 'content_digest' = $2 order by object_version desc limit 1`, [edge.evidence_object_id, edge.evidence_digest]))[0] ?? null;
  if (subject === null || edge === null || evd === null) note(`the corridor entity (${subject?.canonical_name ?? 'none'}), an asserted edge (${edge?.predicate ?? 'none'}) or its evidence version (${evd === null ? 'none' : 'found'}) is missing — the scene is skipped`);
  else {
    const TITLE = 'B23: the Cape corridor carried the bearing supply';
    let itemId = (await q(`select item_id::text from memory.items_current where tenant_id = $1 and domain_id = $2 and title = $3 and state = 'active' limit 1`, [T, D, TITLE]))[0]?.item_id ?? null;
    if (itemId !== null) note(`K. Müller's item ${short(itemId)} is recorded — an earlier run`);
    else {
      const t4 = await mark();
      const r = await recordMemory(mueller, {
        recordClass: 'strategic', title: TITLE,
        statement: `B23: while the Red Sea was closed the bookings were rerouted via the ${subject.canonical_name}; the ${edge.subj} → ${edge.predicate} → ${edge.obj} relationship held on that routing — for the next sourcing decision, qualify the second source before the corridor closes.`,
        source: { kind: 'human', ref: 'sourcing review, B23 act' },
        audience: { classification: 'internal', roles: [], purposes: [PURPOSE] },
        validity: { from: '2024-01-17T00:00:00Z', to: null },
        retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-17T00:00:00Z', basis: 'the decision record retention schedule' },
        cites: [{ kind: 'entity', id: subject.entity_id, version: null, rationale: 'the corridor the lesson is about' },
                { kind: 'edge', id: edge.edge_id, version: null, rationale: `the ${edge.predicate} relationship the rerouting kept` },
                { kind: 'evidence', id: evd.object_id, version: evd.object_version, rationale: 'the evidence the relationship was read from' }],
        related: { decisionId: null, objectiveId: null },
      });
      if (!r.ok) fail('K. Müller records the memory item', r);
      else {
        itemId = r.body.memory.itemId;
        ok(`K. Müller RECORDED memory item ${short(itemId)} "${TITLE}" — internal, audience purpose '${PURPOSE}', citing the ${subject.canonical_name} (entity), the ${edge.subj} ${edge.predicate} ${edge.obj} edge and evidence ${short(evd.object_id)}@${evd.object_version}`);
        const gc = await waitOutbox('GraphChanged', (x) => (x.objects?.memory_items ?? x.objects?.memory ?? []).includes?.(itemId) || JSON.stringify(x).includes(itemId), t4);
        if (gc !== null) { const d = await settled(gc.id, ['retrieval']); note(`its GraphChanged (${gc.payload.change?.kind}) verified by the retrieval subscriber: ${d.map((x) => `${x.consumer_kind} ${x.state}`).join(', ') || 'no delivery'}`); }
      }
    }
    if (itemId !== null) {
      const subj = { kind: 'entity', id: subject.entity_id };
      const itemOf = (c) => (c?.items ?? []).find((x) => x.item_id === itemId) ?? null;
      let c1 = null;
      for (let i = 0; i < 20; i += 1) { c1 = await context(hoffmann, PURPOSE, subj); if (!c1.ok || c1.body.context.product_state === 'complete') break; await sleep(1500); }
      const m1 = itemOf(c1?.body?.context);
      if (c1.ok && c1.body.context.product_state === 'complete' && m1 !== null && (m1.explanation_links ?? []).some((l) => l.kind === 'edge'))
        ok(`A. Hoffmann's context of the ${subject.canonical_name} under '${PURPOSE}': ${c1.body.context.product_state} (code ${c1.body.context.code ?? 'OK'}, revision ${c1.body.context.revision}, verified ${c1.body.context.verified_seq}, lag ${c1.body.context.lag_events}, ${c1.body.context.condition}); ${c1.body.context.items.length} item(s) — "${m1.title}" v${m1.version} with its links ${m1.explanation_links.map((l) => `${l.via}:${l.kind}${l.label ? ` "${l.label}"` : ''}${l.state ? ` (${l.state})` : ''}`).join(', ')}; access ${short(m1.access_id)} recorded`);
      else bad(`the complete context: ${c1.ok ? JSON.stringify({ state: c1.body.context.product_state, items: c1.body.context.items.map((x) => x.item_id), omitted: c1.body.context.omitted }).slice(0, 400) : refusalLine(c1)}`);
      const other = await context(hoffmann, 'treasury', subj);
      if (other.ok && !JSON.stringify(other.body.context).includes(itemId)) ok(`the same subject under 'treasury': ${other.body.context.items.length} item(s), ${other.body.context.product_state} — the '${PURPOSE}' item neither served nor mentioned`);
      else bad(`the purpose filter: ${other.ok ? 'the item appears under treasury' : refusalLine(other)}`);
      const w = await projection('edges_current', 'withdraw', 'B23 demonstration: edges_current withdrawn for a minute to show a context answer declaring what it left out');
      if (!w.ok) fail('the administrator withdraws edges_current', w);
      else {
        ok('the administrator WITHDREW edges_current (the operator route; the reason recorded)');
        const c2 = await context(hoffmann, PURPOSE, subj);
        const m2 = itemOf(c2.body?.context);
        const om = (c2.body?.context?.omitted ?? []).find((x) => x.projection === 'edges_current') ?? null;
        if (c2.ok && c2.body.context.product_state === 'partial' && om !== null && m2 !== null && !(m2.explanation_links ?? []).some((l) => l.kind === 'edge') && Number(m2.withheld_links?.edges_current ?? 0) >= 1)
          ok(`the context while it is withdrawn: PARTIAL (code ${c2.body.context.code}) — omitted: ${om.projection}${om.rows === undefined ? '' : ` (rows ${om.rows})`}, "${String(om.reason ?? '').slice(0, 150)}…"; the item still served with ${m2.explanation_links.map((l) => l.kind).join(', ')} and ${m2.withheld_links.edges_current} edge link(s) WITHHELD, never served from a partition that cannot vouch for it`);
        else bad(`the partial context: ${c2.ok ? JSON.stringify({ state: c2.body.context.product_state, omitted: c2.body.context.omitted, links: m2?.explanation_links?.map((l) => l.kind), withheld: m2?.withheld_links }).slice(0, 400) : refusalLine(c2)}`);
        const rb = await projection('edges_current', 'rebuild', 'B23 demonstration: edges_current rebuilt after the context scene');
        if (!rb.ok) fail('the administrator rebuilds edges_current', rb);
        else {
          let c3 = null;
          for (let i = 0; i < 20; i += 1) { c3 = await context(hoffmann, PURPOSE, subj); if (!c3.ok || c3.body.context.product_state === 'complete') break; await sleep(1500); }
          const m3 = itemOf(c3.body?.context);
          if (c3.ok && c3.body.context.product_state === 'complete' && (m3?.explanation_links ?? []).some((l) => l.kind === 'edge')) ok(`the administrator REBUILT edges_current → the context COMPLETE again (${c3.body.context.omitted.length} omitted; the edge link served)`);
          else bad(`after the rebuild: ${c3.ok ? JSON.stringify({ state: c3.body.context.product_state, omitted: c3.body.context.omitted }).slice(0, 300) : refusalLine(c3)}`);
        }
      }
    }
  }
}

/* ── B23-5 L4-I02 CommitGraphRevision ─────────────────────────────────────────────── */
console.log('\nB23-5 L4-I02 — one change set, one revision: the retry answers the first result; a stale head 409; an invalid set 422 and nothing applied');
{
  const KEY = 'b23-act:corridor-relationships';
  const prior = (await q(`select revision_id::text, revision::int, result from graph.revisions where tenant_id = $1 and domain_id = $2 and idempotency_key = $3`, [T, D, KEY]))[0] ?? null;
  // THE FACTS the demonstration's claims support: REL claim versions admitted with their lineage, decided (not queued, rejected or corrected),
  // their evidence held under the lineage's digest, carrying no asserted edge and no revision item yet — each with the relationship it
  // states read from the edge first asserted on it (retracted since, by the B6 act's demonstration), both ends active entities.
  const facts = prior !== null ? [] : await q(`
    select l.claim_object_id::text, l.claim_version::int, c.payload ->> 'predicate' predicate, c.payload ->> 'subject' subj_name, c.payload ->> 'object_value' obj_name,
           e.subject_entity_id::text subj, e.object_entity_id::text obj, coalesce(c.payload -> 'qualifiers' ->> 'valid_from', e.valid_from::text) valid_from, e.edge_id::text first_edge
      from intelligence.claim_lineage l
      join objects.canonical_objects c on c.object_id = l.claim_object_id and c.object_version = l.claim_version and c.tenant_id = l.tenant_id
      join lateral (select * from graph.edges_current x where x.claim_object_id = l.claim_object_id and x.claim_version = l.claim_version and x.tenant_id = l.tenant_id and x.domain_id = l.domain_id order by x.asserted_at nulls last limit 1) e on true
     where l.tenant_id = $1 and l.domain_id = $2 and l.claim_type = 'REL' and c.lifecycle_state not in ('withdrawn', 'deleted', 'corrected')
       and coalesce((select r.state from intelligence.review_current r where r.claim_object_id = l.claim_object_id and r.claim_version = l.claim_version order by r.opened_at desc limit 1), c.payload -> 'review' ->> 'state', 'not_required') not in ('queued', 'rejected', 'corrected')
       and exists (select 1 from objects.canonical_objects v where v.object_id = l.evidence_object_id and v.object_type = 'EVD' and v.payload ->> 'content_digest' = l.evidence_digest)
       and not exists (select 1 from graph.edges_current a where a.claim_object_id = l.claim_object_id and a.state = 'asserted' and a.domain_id = l.domain_id)
       and not exists (select 1 from graph.revision_items i where i.tenant_id = l.tenant_id and i.domain_id = l.domain_id and i.provenance ->> 'claim_object_id' = l.claim_object_id::text)
       and e.predicate = c.payload ->> 'predicate'
       and (select count(*) from graph.entities_current n where n.entity_id in (e.subject_entity_id, e.object_entity_id) and n.lifecycle_state = 'active') = 2
     order by l.claim_object_id`, [T, D]);
  const edgesBefore = async () => (await q(`select count(*)::int n from graph.edges_current where tenant_id = $1 and domain_id = $2`, [T, D]))[0].n;
  const h0 = await revisionHead(mueller);
  if (!h0.ok) fail('K. Müller reads the head', h0);
  else if (prior === null && facts.length === 0) note('no REL claim the demonstration holds is eligible (each carries an asserted edge or a revision already) — the revision is not staged');
  else {
    const ont = h0.body.head.ontology[0] ?? null;
    let body = null;
    if (prior !== null) {
      // the earlier run's change set, rebuilt from its recorded answer in the order it was sent (the same body → the same digest)
      const res = prior.result;
      body = { idempotency_key: KEY, expected_revision: Number(res.expected), change_set: { ontology: { version_id: res.ontology_version_id ?? null }, nodes: [], identifiers: [],
        edges: (res.edge_ids ?? []).sort((a, b) => a.ordinal - b.ordinal).map((x) => ({ predicate: x.predicate, subject: { entity_id: x.subject_entity_id }, object: { entity_id: x.object_entity_id },
          valid_from: new Date(x.valid_from).toISOString(), provenance: { claim_object_id: x.claim_object_id, claim_version: Number(x.claim_version) } })) } };
      note(`an earlier run committed revision ${prior.revision} under the key (${short(prior.revision_id)}) — its change set is offered again`);
    } else {
      body = { idempotency_key: KEY, expected_revision: h0.body.head.revision, change_set: { ontology: { version_id: ont?.version_id ?? null },
        nodes: [], identifiers: [],
        edges: facts.map((f) => ({ predicate: f.predicate, subject: { entity_id: f.subj }, object: { entity_id: f.obj }, valid_from: new Date(f.valid_from).toISOString(), provenance: { claim_object_id: f.claim_object_id, claim_version: f.claim_version } })) } };
      note(`the head: revision ${h0.body.head.revision}; active ontology v${ont?.version} (${short(ont?.version_id)}); the change set: ${facts.map((f) => `${f.subj_name} ${f.predicate} ${f.obj_name} (claim ${short(f.claim_object_id)}@${f.claim_version}; first asserted as ${short(f.first_edge)}, retracted by the B6 act's demonstration)`).join('; ')}`);
      const ah = await commitRevision(hoffmann, { ...body, idempotency_key: 'b23-act:analyst-attempt' });
      if (ah.status === 403) ok(`A. Hoffmann (domain_analyst) refused: ${refusalLine(ah)}`); else bad(`A. Hoffmann was not refused: ${refusalLine(ah)}`);
      const e0 = await edgesBefore(); const t5 = await mark();
      const r = await commitRevision(mueller, body);
      if (!r.ok) fail('K. Müller commits the change set', r);
      else {
        const v = r.body.revision; const e1 = await edgesBefore();
        if (v.repeated === false && v.revision === h0.body.head.revision + 1 && v.counts.edges === facts.length && e1 === e0 + facts.length)
          ok(`K. Müller COMMITTED revision ${v.revision} (${short(v.revision_id)}; expected ${v.expected}): ${v.counts.edges} edge(s), ${v.counts.nodes} node(s), ${v.counts.identifiers} identifier(s), superseded ${v.counts.superseded}; ONE graph transaction — the head ${h0.body.head.revision} → ${v.revision}; digest ${String(v.request_digest).slice(0, 12)}…`);
        else bad(`the commit: ${JSON.stringify({ repeated: v.repeated, revision: v.revision, counts: v.counts }).slice(0, 300)}; edges ${e0}→${e1}`);
        const ev = await waitOutbox('GraphChanged', (x) => x.change?.kind === 'revision.committed' && JSON.stringify(x).includes(v.revision_id), t5);
        if (ev === null) bad('GraphChanged/revision.committed was not published');
        else {
          const kinds = (await deliveriesOf(ev.id)).map((d) => d.consumer_kind);
          const want = [...new Set([...kinds, 'decisions', 'forecasts', 'scenarios', 'twins', 'retrieval', 'memory-mappings'])];
          const ds = await settled(ev.id, want, 120);
          const n = await countOutbox('GraphChanged', (x) => x.change?.kind === 'revision.committed' && JSON.stringify(x).includes(v.revision_id), t5);
          if (ds.length >= 6 && ds.every((d) => d.state === 'applied') && n === 1) ok(`ONE GraphChanged/revision.committed (${short(ev.id)}, seq ${ev.partition_seq}) delivered to ${ds.length} graph consumers: ${ds.map((d) => `${d.consumer_kind} ${d.state} (${effects(d)})`).join('; ')} — relationships selects claim corrections only (its registration's filter), so it receives none`);
          else bad(`the revision's deliveries (event ×${n}): ${ds.map((d) => `${d.consumer_kind} ${d.state} ${d.last_error ?? ''}`).join('; ') || 'none'}`);
        }
      }
    }
    if (body !== null) {
      const cur = (await revisionHead(mueller)).body.head.revision;
      const r2 = await commitRevision(mueller, body);
      const firstRevision = prior?.revision ?? h0.body.head.revision + 1;
      if (r2.ok && r2.body.revision.repeated === true && r2.body.revision.revision === firstRevision) ok(`the RETRY under the same key and change set → the first result: revision ${r2.body.revision.revision} (${short(r2.body.revision.revision_id)}), repeated true, the head read ${r2.body.revision.head ?? cur} — no second effect, no event`);
      else bad(`the retry: ${r2.ok ? JSON.stringify({ repeated: r2.body.revision.repeated, revision: r2.body.revision.revision }) : refusalLine(r2)}`);
      const staleHead = firstRevision - 1;
      const stale = await commitRevision(mueller, { ...body, idempotency_key: `${KEY}:stale`, expected_revision: staleHead });
      if (stale.status === 409 && /conflict/.test(String(stale.body?.message))) ok(`a change set made against the stale head ${staleHead} (a new key) refused: ${refusalLine(stale)}`);
      else bad(`the stale head: ${refusalLine(stale)}`);
      const hBefore = (await revisionHead(mueller)).body.head.revision; const eBefore = await edgesBefore();
      const invalid = { ...body, idempotency_key: `${KEY}:invalid`, expected_revision: hBefore,
        change_set: { ...body.change_set, edges: [body.change_set.edges[0], { ...body.change_set.edges[0], predicate: 'smuggles' }] } };
      const iv = await commitRevision(mueller, invalid);
      const hAfter = (await revisionHead(mueller)).body.head.revision; const eAfter = await edgesBefore();
      if (iv.status === 422 && hAfter === hBefore && eAfter === eBefore) ok(`an INVALID change set (edge 1 admissible, edge 2 a predicate the ontology does not declare) refused WHOLE: ${refusalLine(iv)} — nothing applied: the head stays ${hAfter}, the edges ${eAfter}`);
      else bad(`the invalid change set: ${refusalLine(iv)}; head ${hBefore}→${hAfter}; edges ${eBefore}→${eAfter}`);
    }
  }
}

/* ── B23-6 L7-I02 BranchScenario ──────────────────────────────────────────────────── */
console.log('\nB23-6 L7-I02 — a user-defined branch added to the corridor scenario as a new version; repeat, stale and duplicate refused or answered');
{
  const scn = (await q(`select s.scenario_id::text, s.title, s.current_version::int, b.indicator_id::text blockade_indicator, i.series_key
                          from prediction.scenarios_current s join prediction.branches_current b on b.scenario_id = s.scenario_id and b.kind = 'user-defined' and lower(b.kind_label) = 'regional blockade' and b.state = 'open'
                          join prediction.indicators_current i on i.indicator_id = b.indicator_id
                         where s.tenant_id = $1 and s.domain_id = $2 and s.state = 'active'
                         order by (select count(*) from prediction.branches_current f where f.scenario_id = s.scenario_id and f.state = 'flipped'), s.declared_at nulls last limit 1`, [T, D]).catch(async () =>
    q(`select s.scenario_id::text, s.title, s.current_version::int, b.indicator_id::text blockade_indicator, i.series_key from prediction.scenarios_current s join prediction.branches_current b on b.scenario_id = s.scenario_id and b.kind = 'user-defined' and lower(b.kind_label) = 'regional blockade' and b.state = 'open'
        join prediction.indicators_current i on i.indicator_id = b.indicator_id where s.tenant_id = $1 and s.domain_id = $2 and s.state = 'active'
        order by (select count(*) from prediction.branches_current f where f.scenario_id = s.scenario_id and f.state = 'flipped') limit 1`, [T, D])))[0] ?? null;
  if (scn === null) note('no active scenario carries an open "regional blockade" branch — the scene is skipped');
  else {
    const KEY = 'b23-act:insurer-withdrawal';
    const prior = (await q(`select base_version::int, result_version::int from prediction.scenario_branch_requests where tenant_id = $1 and domain_id = $2 and idempotency_key = $3`, [T, D, KEY]).catch(() => []))[0] ?? null;
    const ind = (await q(`select indicator_id::text, description from prediction.indicators_current i where i.tenant_id = $1 and i.domain_id = $2 and i.state = 'active' and i.series_key = $3 and i.comparator = '<'
                           and i.indicator_id <> $4 and i.description not ilike 'Browser check%'
                           and not exists (select 1 from prediction.branches_current b where b.scenario_id = $5 and b.kind = 'user-defined' and b.state <> 'closed' and b.indicator_id = i.indicator_id and lower(coalesce(b.kind_label, '')) <> 'insurer withdrawal')
                         order by i.defined_at limit 1`, [T, D, scn.series_key, scn.blockade_indicator, scn.scenario_id]))[0] ?? null;
    if (ind === null) note('no second indicator on the corridor series — the scene is skipped');
    else {
      const base = prior?.base_version ?? scn.current_version;
      const branch = { name: 'Insurer withdrawal', kind: 'user-defined', kindLabel: 'insurer withdrawal', statement: 'war-risk cover is withdrawn for the corridor',
        divergence: 'hull and cargo insurers withdraw war-risk cover, so sailings stop whatever the transits say', indicatorId: ind.indicator_id, owner: weber.principalId,
        consequence: 'reroute every open booking via the Cape', consequenceClass: 'C3', responseWindowHours: 24 };
      const body = { expected_version: base, idempotency_key: KEY, branch };
      note(`the scenario: "${scn.title}" at version ${scn.current_version} (its user-defined "regional blockade" branch on indicator ${short(scn.blockade_indicator)}); the new branch rests on indicator ${short(ind.indicator_id)} — "${String(ind.description).slice(0, 70)}"${prior !== null ? `; an earlier run branched it (v${prior.base_version} → v${prior.result_version})` : ''}`);
      const ah = await branchScenario(hoffmann, scn.scenario_id, { ...body, idempotency_key: 'b23-act:analyst-attempt' });
      if (ah.status === 403) ok(`A. Hoffmann (domain_analyst) refused: ${refusalLine(ah)}`); else bad(`A. Hoffmann was not refused: ${refusalLine(ah)}`);
      const t6 = await mark();
      const r = await branchScenario(eriksen, scn.scenario_id, body);
      if (!r.ok) fail('N. Eriksen adds the branch', r);
      else {
        const b = r.body.branching;
        const v = b.version ?? b.result_version ?? b.resultVersion;
        ok(`N. Eriksen ADDED the user-defined branch "insurer withdrawal"${b.repeated ? ' (REPEATED — an earlier run)' : ''}: scenario v${base} → v${v}, branch ${short(b.branch_id ?? b.branchId)} (owner J. Weber), coherence ${b.coherence?.outcome ?? b.coherence_outcome ?? JSON.stringify(b.coherence ?? null).slice(0, 80)}`);
        if (!b.repeated) {
          const ev = await waitOutbox('ScenarioBranched', (x) => x.scenario_id === scn.scenario_id, t6, 30);
          const row = (await q(`select current_version::int from prediction.scenarios_current where scenario_id = $1`, [scn.scenario_id]))[0];
          if (ev !== null && row.current_version === base + 1) ok(`ScenarioBranched@${ev.payload.schema_version} (${short(ev.id)}) from the write; the scenario stands at version ${row.current_version} (the SCN v${base + 1} admitted in the write; v${base} unchanged)`);
          else bad(`after the branching: event ${ev === null ? 'MISSING' : short(ev.id)}, current_version ${row.current_version}`);
        }
        const r2 = await branchScenario(eriksen, scn.scenario_id, body);
        if (r2.ok && r2.body.branching.repeated === true) ok(`the same key and body again → the first result (repeated true, version ${r2.body.branching.version ?? r2.body.branching.result_version ?? '?'}); no second version, branch or event`);
        else bad(`the repeat: ${r2.ok ? JSON.stringify(r2.body.branching).slice(0, 200) : refusalLine(r2)}`);
        const st = await branchScenario(eriksen, scn.scenario_id, { expected_version: base, idempotency_key: `${KEY}:stale`, branch: { ...branch, name: 'Port strike', kindLabel: 'port strike', statement: 'the discharge port strikes', divergence: 'a strike stops discharge whatever the transits say' } });
        if (st.status === 409 && /stale_version/.test(String(st.body?.message))) ok(`a branch read from the stale version ${base} (a new key) refused: ${refusalLine(st)}`); else bad(`the stale version: ${refusalLine(st)}`);
        const cur = (await q(`select current_version::int from prediction.scenarios_current where scenario_id = $1`, [scn.scenario_id]))[0].current_version;
        const dup = await branchScenario(eriksen, scn.scenario_id, { expected_version: cur, idempotency_key: `${KEY}:duplicate-blockade`, branch: { ...branch, name: 'Blockade, again', kindLabel: 'Regional Blockade', statement: 'a regional power closes the strait to merchant traffic', divergence: 'a declared blockade stops transits outright' } });
        const after = (await q(`select current_version::int, (select count(*)::int from prediction.branches_current b where b.scenario_id = $1) branches from prediction.scenarios_current where scenario_id = $1`, [scn.scenario_id]))[0];
        if (dup.status === 409 && /duplicate/.test(String(dup.body?.message)) && after.current_version === cur) ok(`a second "regional blockade" branch refused — never admitted as a failing branch: ${refusalLine(dup)}; the scenario stays at version ${after.current_version} with ${after.branches} branches`);
        else bad(`the duplicate: ${refusalLine(dup)}; version ${cur}→${after.current_version}`);
      }
    }
  }
}

/* ── B23-7 BRF@v2 ─────────────────────────────────────────────────────────────────── */
console.log('\nB23-7 BRF@v2 — the room briefing carries its attention section; a v1 edition still reads as v1');
{
  if (ROOM === null) note('the monitored package has no room — the briefing scene is skipped');
  else {
    const prior = (await q(`select briefing_id::text, known_at, schema_version from executive.briefings where room_id = $1 order by known_at desc limit 1`, [ROOM]))[0] ?? null;
    note(`the room's newest edition: ${prior === null ? 'none' : `${short(prior.briefing_id)} (${prior.schema_version}, known at ${iso(prior.known_at)})`}`);
    const r = await composeBriefing(dvorak, { roomId: ROOM, knownAt: new Date().toISOString(), priorBriefingId: prior?.briefing_id ?? null });
    if (!r.ok) fail('M. Dvořák composes the room briefing', r);
    else {
      const id = r.body.briefing.briefingId ?? r.body.briefing.briefing_id;
      const row = (await q(`select schema_version, attention, known_at, content_digest from executive.briefings where briefing_id = $1`, [id]))[0];
      const a = row?.attention ?? null;
      const mc = (a?.material_changes_since_prior ?? []).find((x) => x.item_id === MC_ITEM?.item_id) ?? null;
      const rvItem = REVIEW === null ? null : (await itemsOf('review.convened', REVIEW.review_id))[0] ?? null;
      const listed = (a?.items ?? []);
      const withBands = listed.filter((x) => ['high', 'medium', 'low', 'unknown'].includes(x.confidence_band)).length;
      // the B23-1 change is "since the prior" only when it was raised after the prior edition's known_at (a re-run's prior already carries it)
      const mcDue = MC_ITEM !== null && (prior === null || new Date(MC_ITEM.created_at) > new Date(prior.known_at));
      if (!mcDue && MC_ITEM !== null) note(`the B23-1 change ${short(MC_ITEM.item_id)} was raised before the prior edition — an earlier run's edition carries it; none is expected since`);
      if (row?.schema_version === 'v2' && a !== null && listed.length > 0 && withBands === listed.length && (!mcDue || mc !== null))
        ok(`M. Dvořák COMPOSED briefing ${short(id)} — schema_version ${row.schema_version}, digest ${String(row.content_digest).slice(0, 12)}…: the ATTENTION SECTION as of ${a.as_of} (since ${a.since ?? 'no prior'}), policy version ${a.policy_version}, ${listed.length} routed item(s) (${tally(listed, 'signal_class')}) each with its confidence band (${tally(listed, 'confidence_band')}); counts ${Object.entries(a.counts ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ')}; material changes since the prior edition: ${(a.material_changes_since_prior ?? []).length}${mc !== null ? ` — the B23-1 change ${short(mc.item_id)} (${mc.state}, confidence ${mc.confidence} ${mc.confidence_band})` : ''}${rvItem !== null && listed.some((x) => x.item_id === rvItem.item_id) ? '; the convened review listed' : ''}`);
      else bad(`the v2 edition: ${JSON.stringify({ schema: row?.schema_version, items: listed.length, withBands, mc: mc === null ? null : mc.item_id, since: a?.since }).slice(0, 300)}`);
      const v1 = (await q(`select briefing_id::text from executive.briefings where room_id = $1 and schema_version = 'v1' order by known_at desc limit 1`, [ROOM]))[0] ?? null;
      if (v1 === null) note('no v1 edition in the room');
      else {
        const g = await getBriefing(dvorak, v1.briefing_id);
        const b = g.body?.briefing;
        if (g.ok && (b?.schema_version ?? 'v1') === 'v1' && (b?.attention ?? null) === null) ok(`the earlier v1 edition ${short(v1.briefing_id)} still reads: schema_version ${b.schema_version ?? 'v1'}, no attention section (${(b.items ?? []).length} item(s))`);
        else bad(`the v1 edition: ${g.ok ? JSON.stringify({ schema: b?.schema_version, attention: b?.attention === null ? null : 'PRESENT' }) : refusalLine(g)}`);
      }
    }
  }
}

/* ── B23-8 THE STATE ──────────────────────────────────────────────────────────────── */
console.log('\nB23-8 THE STATE — what the act leaves');
{
  const it = await q(`select signal_class, state from executive.attention_items where tenant_id = $1 and domain_id = $2`, [T, D]);
  const byClass = new Map(); for (const x of it) { const m = byClass.get(x.signal_class) ?? new Map(); m.set(x.state, (m.get(x.state) ?? 0) + 1); byClass.set(x.signal_class, m); }
  note(`the queue: ${it.length} item(s) — ${[...byClass].map(([c, m]) => `${c} {${[...m].map(([s, n]) => `${s} ${n}`).join(', ')}}`).join('; ')}`);
  const pol = await q(`select version, state from executive.attention_policies where tenant_id = $1 and domain_id = $2 order by version`, [T, D]);
  note(`the policy: ${pol.map((p) => `v${p.version} ${p.state}`).join(', ')}`);
  const rv = await listReviews(weber, {});
  if (rv.ok) note(`the reviews (read by J. Weber): ${rv.body.reviews.length} — ${rv.body.reviews.map((r) => `${short(r.review_id)} ${r.subject_kind} "${String(r.subject_title).slice(0, 50)}" ${r.state}`).join('; ')}`); else fail('the reviews list', rv);
  const st = await q(`select a.state, a.partition_key, (select count(*)::int from observation.acquisition_segments s where s.stream_id = a.stream_id) segs, (select count(*)::int from observation.acquisition_incomplete_ranges r where r.stream_id = a.stream_id and r.resolved_by_seq is null) open_ranges from observation.acquisition_streams a where a.tenant_id = $1 and a.domain_id = $2 order by a.opened_at`, [T, D]);
  note(`the streams: ${st.map((s) => `${s.partition_key} ${s.state} (${s.segs} segments, ${s.open_ranges} unresolved range(s))`).join('; ') || 'none'}`);
  const h = await revisionHead(weber);
  if (h.ok) note(`the revision head: ${h.body.head.revision}; accepted revisions ${h.body.head.recent.length} (${h.body.head.recent.map((r) => `r${r.revision} ${r.idempotency_key}`).join(', ')})`); else fail('the head', h);
  const ir = await interfaces();
  if (ir.ok) { const all = ir.body.interfaces ?? []; note(`the register: ${all.filter((i) => i.binding_state === 'bound').length} bound / ${all.filter((i) => i.binding_state === 'partial').length} partial / ${all.filter((i) => i.binding_state === 'unbound').length} unbound`); }
  const prj = (await subscriptionStatus(D))?.projections ?? [];
  note(`the projections: ${prj.map((p) => `${p.projection} ${p.state}`).join(', ') || 'unread'}`);
  note('LIMITS said: in_app delivery only; the malformed-event quarantine and the lost-queue reconciliation are the harness\'s (E4, E8), not staged here; the stream is segment pull over the replay fixture (no socket, no live publisher); the review\'s due instant has no timer host (its attention item\'s deadline carries it); the context answer has no ranking; the change set carries edges only — no ENT claim the demonstration holds names a thing not already an entity; the invalidated run and the convened review stand as demonstration facts; nothing is cleaned.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
