#!/usr/bin/env node
/**
 * CP-6 batch B22 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): THE ATTENTION
 * POLICY AND THE CONSUMERS (migration 0083), exercised by the personas through the REAL HTTP path, each scene stating the effect it
 * produced in the ledgers and the outbox — and where nothing happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME by SQL
 * against the database the act is pointed at: no id is hard-coded.
 *
 *   0. THE STATE: the register through the route (44 bound / 6 partial / 0 unbound — L10-I05, L1-I03, L1-I04, L2-I02 bound in 0083;
 *      L9-I05's clause delivered); the FOUR NEW CONSUMERS registered in the origin by the administrator — attention and proposals with
 *      the backlog REPLAYED (the domain's own history of fitness, coherence, warning and extraction events reaches them), observations
 *      and source-health from now (their history is 14,000 recorded observations and the sources' past health — not replayed, said).
 *      With NO POLICY published, the replayed signals are recorded ABSTAINED — deprioritized, visible, never dropped; a signal that no
 *      longer stands (a retired scenario, a closed warning) is recorded on its delivery, not routed.
 *   1. THE POLICY: A. Hoffmann (domain_analyst) refused by the PDP; M. Dvořák (executive) refused on a rule naming an unknown role
 *      (422, the key named); M. Dvořák publishes VERSION 1 → AttentionPolicyChanged@v1; the attention subscriber re-evaluates every
 *      live item (abstained → routed where material) and NOTES the policy cause on the committed and monitored packages.
 *   2. THE QUEUE: the routed items by class; A. Hoffmann refused on N. Eriksen's forecast item (not routed to her); N. Eriksen
 *      ACKNOWLEDGES it (receipt, not agreement); J. Weber SUPPRESSES a warning item with a reason until tomorrow (visible);
 *      L. Ferreira acknowledges a review item.
 *   3. SOURCE HEALTH: M. Dvořák SUSPENDS the PortWatch chokepoints source → SourceHealthChanged → the source-health subscriber sets
 *      IMPACT MARKERS on the derived products (the issued forecast of its series, the warning resting on it) and routes the COVERAGE
 *      LOSS to the collection managers; M. Dvořák acknowledges it and REACTIVATES the source → the markers cleared.
 *   4. OBSERVATIONS: M. Dvořák collects the source now → each ObservationRecorded reaches the observations subscriber → the
 *      TRANSFORMATION PLAN selected (the active corridor-transit-claims method reads this source) — or, when the publisher returned
 *      nothing new, said.
 *   5. POLICY v2 AND THE REOPEN (L9-I05): M. Dvořák raises the scenario class's consequence threshold and widens the warning escalation → re-evaluation
 *      and a second policy note on the packages; L. Brandt REOPENS the B18 corridor package on the POLICY CAUSE → DecisionReopened@v1
 *      with recorded_cause policy_changed; a person who does not own it is refused.
 *   6. ESCALATION: the warning items' two-minute deadline (version 1) passes (the act waits it out — no clock is moved); M. Dvořák escalates the overdue →
 *      escalated to the executive roles, with the missed deadline recorded.
 *   7. THE STATE: the queue by state and class, the markers, the plan selections, the register, what the act leaves.
 *
 * CASTING (the seed's personas; no persona is created): M. Dvořák (collection_manager, executive — the source scenes too: U. Fischer holds collection_manager in the mirror domain only),
 * N. Eriksen (forecast_owner), J. Weber (strategy_owner), L. Brandt (decision_owner, decision_authority), L. Ferreira
 * (extraction_manager), A. Hoffmann (domain_analyst); the administrator = the platform-admin session. Nothing here prints a credential.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const O = `${X}/observation`; const E = `${X}/executive/attention`; const DEC = `${X}/decisions`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 8)}…`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const mark = async () => (await q('select clock_timestamp() t'))[0].t;
const tStart = Date.now();
console.log(`THE B22 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);

const dvorak = await who('m.dvorak'); const eriksen = await who('n.eriksen'); const weber = await who('j.weber');
const brandt = await who('l.brandt'); const ferreira = await who('l.ferreira'); const hoffmann = await who('a.hoffmann');
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });

/* ── the outbox, the deliveries, the queue ──────────────────────────────────────────── */
const deliveriesOf = (eventId) => q(`select subscription_id::text, consumer_kind, state, items, items_applied, items_unresolved, failure_class, last_error from graph.subscription_deliveries where event_id = $1 order by consumer_kind`, [eventId]);
async function settled(eventId, kinds, seconds = 150) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = (await deliveriesOf(eventId)).filter((d) => kinds.includes(d.consumer_kind));
    if (ds.length >= kinds.length && ds.every((d) => ['applied', 'failed', 'refused', 'unresolved'].includes(d.state))) { await sleep(1500); return ds; }
    await sleep(1000);
  }
  return ds;
}
async function waitEvent(eventType, where, notBefore, seconds = 60) {
  for (let i = 0; i < seconds; i += 1) {
    const rows = await q(`select id::text, status, payload from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4 order by created_at desc limit 20`, [eventType, T, D, notBefore]);
    const row = rows.find((r) => Object.entries(where).every(([k, v]) => r.payload?.[k] === v)) ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
const effects = (d) => { const m = new Map(); for (const x of d?.items_applied ?? []) m.set(x.effect, (m.get(x.effect) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ×${n}`).join(', ') || 'no effect'; };
const items = () => q(`select item_id::text, signal_class, subject_kind, subject_id::text, title, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, due_at, escalations, suppressed_until from executive.attention_items where tenant_id = $1 and domain_id = $2 order by created_at`, [T, D]);
const itemEvents = (id) => q(`select event, details from executive.attention_item_events where item_id = $1 order by occurred_at`, [id]);
const tally = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'; };

/* ── the routes ─────────────────────────────────────────────────────────────────────── */
const publish = (s, rules, reason) => call(`${E}/policy/publish`, env_(s, 'executive')({ action: 'executive.attention.policy.publish', objectType: 'ATP', consequence: 'C2' }), { rules, reason }, s.token);
const listItems = (s, payload = {}) => call(`${E}/items/list`, env_(s, 'executive')({ action: 'executive.attention.read', objectType: 'ATI', sideEffect: 'none' }), payload, s.token);
const ack = (s, id, note_) => call(`${E}/items/${id}/acknowledge`, env_(s, 'executive')({ action: 'executive.attention.item.acknowledge', objectType: 'ATI', objectId: id, consequence: 'C2' }), { note: note_ }, s.token);
const suppress = (s, id, until, reason) => call(`${E}/items/${id}/suppress`, env_(s, 'executive')({ action: 'executive.attention.item.suppress', objectType: 'ATI', objectId: id, consequence: 'C2' }), { until, reason }, s.token);
const escalateDue = (s) => call(`${E}/escalate-due`, env_(s, 'executive')({ action: 'executive.attention.escalate', objectType: 'ATI', consequence: 'C2' }), {}, s.token);
const transition = (s, sourceId, contractVersion, target, reason) => call(`${O}/sources/${sourceId}/transition`, env_(s, 'observation')({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId, consequence: 'C2' }), { contractVersion, target, reason }, s.token);
const collect = (s, sourceId, contractVersion) => call(`${O}/sources/${sourceId}/collect`, env_(s, 'observation')({ action: 'observation.run.trigger', objectType: 'RUN' }), { contractVersion }, s.token);
const reopen = (s, packageId, cause) => call(`${DEC}/${packageId}/reopen`, env_(s, 'decision')({ action: 'decision.package.reopen', objectType: 'DPK', objectId: packageId, consequence: 'C2' }), { cause, knownAt: new Date().toISOString() }, s.token);

/** The policy: materiality over transparent dimensions, the accountable roles, the deadlines, escalation and suppression per class. */
const RULES_V1 = {
  classes: {
    'forecast.unfit': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
    'scenario.incoherent': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.5, max_hours_to_window: null }, route_roles: ['strategy_owner', 'decision_owner'], ack_within_minutes: 2, escalate_to_roles: ['executive'], max_escalations: 2, suppression: { allowed: true, max_hours: 72 }, notify: 'in_app' },
    'source.coverage_loss': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['collection_manager'], ack_within_minutes: 30, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' },
    'proposal.review': { materiality: { min_consequence: 'C1', min_confidence: 0.7 }, route_roles: ['extraction_manager', 'knowledge_owner'], ack_within_minutes: 1440, escalate_to_roles: [], max_escalations: 0, suppression: { allowed: true, max_hours: 168 }, notify: 'in_app' },
  },
};
/** Version 2: a scenario incoherence is routed only from consequence C3 (the re-evaluation deprioritizes it, visibly); the warning class also escalates to the domain administrator. */
const RULES_V2 = JSON.parse(JSON.stringify(RULES_V1));
RULES_V2.classes['scenario.incoherent'].materiality.min_consequence = 'C3';
RULES_V2.classes['warning.raised'].escalate_to_roles = ['executive', 'domain_admin'];

/* ── 0. THE STATE ─────────────────────────────────────────────────────────────────────── */
console.log('\n0. THE STATE — the register (44 bound / 6 partial / 0 unbound); the four new consumers registered by the administrator');
{
  const ir = await call(`${G}/interfaces`, env_(weber, 'graph')({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
  if (!ir.ok) fail('graph/interfaces', ir);
  else {
    const all = ir.body.interfaces ?? []; const count = (s) => all.filter((i) => i.binding_state === s).length;
    const four = ['L10-I05', 'L1-I03', 'L1-I04', 'L2-I02'].map((id) => all.find((i) => i.interface_id === id) ?? null);
    const l9 = all.find((i) => i.interface_id === 'L9-I05');
    if (all.length === 50 && count('bound') === 44 && count('partial') === 6 && count('unbound') === 0 && four.every((r) => r?.binding_state === 'bound' && r?.bound_in === '0083') && /a POLICY CHANGE is a recorded cause/.test(String(l9?.bound_to)))
      ok(`the interface register (J. Weber): 50 rows — 44 bound / 6 partial / 0 unbound; ${four.map((r) => `${r.interface_id} ${r.name}`).join(', ')} bound in 0083; L9-I05: a policy change is a recorded cause; partial: ${all.filter((i) => i.binding_state === 'partial').map((i) => i.interface_id).join(', ')}`);
    else bad(`the register: ${count('bound')}/${count('partial')}/${count('unbound')}; ${four.map((r) => (r === null ? 'MISSING' : `${r.interface_id} ${r.binding_state} ${r.bound_in}`)).join(', ')}`);
  }
}
const owners = { attention: dvorak, proposals: ferreira, 'source-health': dvorak, observations: ferreira };
const backlog = { attention: 'replay', proposals: 'replay', 'source-health': 'leave', observations: 'leave' };
const subs = {}; const reDriven = {};
for (const kind of ['attention', 'proposals', 'source-health', 'observations']) {
  const live = (await q(`select subscription_id::text, status from graph.subscriptions where tenant_id = $1 and domain_id = $2 and consumer_kind = $3 and status <> 'revoked'`, [T, D, kind]))[0] ?? null;
  if (live !== null) { subs[kind] = live.subscription_id; note(`${kind}: already registered (${short(live.subscription_id)}, ${live.status}) — an earlier run`); continue; }
  const r = await call(`${G}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }), { consumerKind: kind, ownerPrincipalId: owners[kind].principalId, backlog: backlog[kind] }, admin.token);
  if (!r.ok) { fail(`register ${kind}`, r); continue; }
  subs[kind] = r.body.subscription.subscriptionId; reDriven[kind] = Number(r.body.served.reDriven ?? 0);
  ok(`${kind}: subscription ${short(subs[kind])} (role ${r.body.subscription.role}, event types ${r.body.subscription.eventTypes.join(' | ')}, backlog ${backlog[kind]}, owner ${kind === 'attention' || kind === 'source-health' ? 'M. Dvořák' : 'L. Ferreira'}); ${r.body.served.reDriven} event(s) re-driven`);
}
{
  // the replayed backlog (the attention and proposals history) settles through the dispatcher
  for (let i = 0; i < 150; i += 1) {
    const open = (await q(`select count(*)::int n from graph.subscription_deliveries where subscription_id = any($1::uuid[]) and state not in ('applied','failed','refused','unresolved')`, [[subs.attention, subs.proposals].filter(Boolean)]))[0].n;
    const done = (await q(`select count(*)::int n from graph.subscription_deliveries where subscription_id = any($1::uuid[])`, [[subs.attention, subs.proposals].filter(Boolean)]))[0].n;
    // every replayed event of the two kinds' own types delivered (the registration's re-drive counts the domain's rows; an event of a
    // type the kind does not select yields no delivery — so the expected floor is the kinds' own history, counted in the outbox)
    const expected = (await q(`select count(*)::int n from objects.object_outbox where tenant_id = $1 and domain_id = $2 and status = 'published' and event_type = any($3::text[])`, [T, D, ['ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'ClaimsExtracted', 'IntelligenceObjectAdmitted']]))[0].n;
    if (done >= expected && open === 0) break;
    await sleep(1000);
  }
  const ds = await q(`select consumer_kind, event_type, state, items_applied, failure_class from graph.subscription_deliveries where subscription_id = any($1::uuid[])`, [[subs.attention, subs.proposals].filter(Boolean)]);
  for (const kind of ['attention', 'proposals']) {
    const mine = ds.filter((d) => d.consumer_kind === kind);
    const m = new Map(); for (const d of mine) for (const x of d.items_applied ?? []) m.set(x.effect, (m.get(x.effect) ?? 0) + 1);
    note(`${kind}: the replayed history — ${mine.length} delivery(ies) (${tally(mine, 'event_type')}; states ${tally(mine, 'state')}); effects ${[...m].map(([k, n]) => `${k} ×${n}`).join(', ') || 'none'}`);
  }
  const it = await items();
  if (it.length > 0 && it.every((x) => x.outcome === 'abstained' && x.state === 'deprioritized')) ok(`with no policy published, the ${it.length} replayed signal(s) are ABSTAINED — deprioritized and visible (${tally(it, 'signal_class')}); the reason: "${it[0].evaluation?.reasons?.[0]}"`);
  else if (it.length === 0) note('no replayed signal stands (every one was recorded as no longer standing)');
  else bad(`the replayed items before any policy: ${tally(it, 'state')} / ${tally(it, 'outcome')}`);
}

/* ── 1. THE POLICY ────────────────────────────────────────────────────────────────────── */
console.log('\n1. THE POLICY — a named human sets it; version 1; AttentionPolicyChanged@v1; every live item re-evaluated; the policy cause noted on the packages');
{
  const r = await publish(hoffmann, RULES_V1, 'an analyst tries to set the attention policy');
  if (r.status === 403) ok(`A. Hoffmann (domain_analyst) refused: ${refusalLine(r)}`); else bad(`A. Hoffmann was not refused by the PDP: ${refusalLine(r)}`);
  const badRules = JSON.parse(JSON.stringify(RULES_V1)); badRules.classes['forecast.unfit'].route_roles = ['chief_worrier'];
  const b = await publish(dvorak, badRules, 'a rule naming a role the product does not have');
  if (b.status === 422 && /route_roles names a role/.test(String(b.body?.message))) ok(`M. Dvořák's rule naming an unknown role refused (the key named): ${refusalLine(b)}`); else bad(`the unknown role was not refused as expected: ${refusalLine(b)}`);
}
const t1 = await mark();
let v1 = null;
{
  const r = await publish(dvorak, RULES_V1, 'The first attention policy of the corridor domain: who must look at unfit forecasts, incoherent scenarios, warnings, coverage loss and held claims, and by when.');
  if (!r.ok) fail('M. Dvořák publishes version 1', r);
  else {
    v1 = r.body.policy;
    ok(`M. Dvořák published VERSION ${v1.version} (policy ${short(v1.policy_id)}; changed sections ${v1.changed_sections.join(', ')}; classes ${v1.changed_classes.join(', ')}; digest ${String(v1.rules_digest).slice(0, 12)}…)`);
    const ev = await waitEvent('AttentionPolicyChanged', { policy_id: v1.policy_id }, t1);
    if (ev === null) bad('AttentionPolicyChanged@v1 was not published');
    else {
      ok(`AttentionPolicyChanged@${ev.payload.schema_version} published (outbox ${short(ev.id)}): version ${ev.payload.version}, set by M. Dvořák, "${String(ev.payload.reason).slice(0, 60)}…"`);
      const ds = await settled(ev.id, ['attention']);
      const d = ds.find((x) => x.consumer_kind === 'attention');
      if (d?.state === 'applied') ok(`the attention subscriber applied it: ${(d.items ?? []).length} item(s) — ${effects(d)}`); else bad(`the attention delivery: ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}`);
    }
    const it = await items();
    note(`the queue under version 1: ${tally(it, 'state')} (${tally(it.filter((x) => x.state !== 'deprioritized'), 'signal_class')})`);
    for (const x of it.filter((y) => y.outcome === 'material').slice(0, 6)) note(`  ${x.signal_class}: "${String(x.title).slice(0, 90)}" → ${x.state}, owner ${short(x.owner_principal_id)}, roles ${x.route_roles.join('+')}, due ${x.due_at?.toISOString?.() ?? x.due_at}; reasons: ${(x.evaluation?.reasons ?? []).join('; ')}`);
    const notes = await q(`select p.title, e.event_id::text, e.details from decision.package_events e join decision.packages_current p on p.package_id = e.package_id where e.event = 'policy.changed' and e.tenant_id = $1 and e.domain_id = $2 and e.occurred_at >= $3 order by e.occurred_at`, [T, D, t1]);
    if (notes.length > 0) ok(`the POLICY CAUSE noted on ${notes.length} committed/monitored package(s): ${notes.map((n) => `"${String(n.title).slice(0, 50)}" (from version ${n.details.from_version ?? 'none — no policy stood at the commitment'} to ${n.details.to_version})`).join('; ')}`);
    else note('no committed or monitored package in the domain — no policy cause to note');
  }
}

/* ── 2. THE QUEUE ─────────────────────────────────────────────────────────────────────── */
console.log('\n2. THE QUEUE — acknowledgement is receipt, not agreement; a suppression carries its reason and expiry; a person not routed is refused');
{
  const it = await items();
  const fitness = it.find((x) => x.signal_class === 'forecast.unfit' && ['open', 'escalated'].includes(x.state)) ?? null;
  if (fitness === null) note('no open forecast.unfit item (the demonstration\'s unfit forecast was withdrawn or is no longer unfit)');
  else {
    const h = await ack(hoffmann, fitness.item_id, 'I saw it');
    if (h.status === 403) ok(`A. Hoffmann refused on the forecast item (not its owner, no routed role): ${refusalLine(h)}`); else bad(`A. Hoffmann was not refused: ${refusalLine(h)}`);
    const a = await ack(eriksen, fitness.item_id, 'Received — the data shift is known; the re-issue waits for the corridor to settle.');
    if (a.ok) ok(`N. Eriksen ACKNOWLEDGED "${String(fitness.title).slice(0, 70)}" (receipt, not agreement; within the deadline ${a.body.item.within_deadline})`); else fail('N. Eriksen acknowledges', a);
  }
  const warning = it.find((x) => x.signal_class === 'warning.raised' && ['open', 'escalated'].includes(x.state)) ?? null;
  if (warning === null) note('no open warning item');
  else {
    const until = new Date(Date.now() + 20 * 3600_000).toISOString();
    const s = await suppress(weber, warning.item_id, until, 'The browser-check warning is a test artefact; suppressed until the test data is retired tomorrow.');
    if (s.ok) ok(`J. Weber SUPPRESSED "${String(warning.title).slice(0, 70)}" until ${until} — reason and expiry on the item and its event (visible, lapsing)`); else fail('J. Weber suppresses a warning item', s);
    const other = it.find((x) => x.signal_class === 'warning.raised' && ['open', 'escalated'].includes(x.state) && x.item_id !== warning.item_id) ?? null;
    if (other !== null) {
      const far = await suppress(weber, other.item_id, new Date(Date.now() + 200 * 3600_000).toISOString(), 'suppressed for longer than the policy allows');
      if (far.status === 422) ok(`a suppression beyond the class's 72-hour maximum refused: ${refusalLine(far)}`); else bad(`the over-long suppression: ${refusalLine(far)}`);
    }
  }
  const review = it.find((x) => x.signal_class === 'proposal.review' && ['open', 'escalated'].includes(x.state)) ?? null;
  if (review === null) note('no open review item');
  else {
    const a = await ack(ferreira, review.item_id, 'In the extraction review queue.');
    if (a.ok) ok(`L. Ferreira acknowledged the review item "${String(review.title).slice(0, 70)}"`); else fail('L. Ferreira acknowledges a review item', a);
  }
  const list = await listItems(hoffmann, {});
  if (list.ok) ok(`the queue read by A. Hoffmann (executive.attention.read): counts ${Object.entries(list.body.counts).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ')} — the deprioritized and suppressed listed, not hidden`); else fail('the queue read', list);
}

/* ── 3. SOURCE HEALTH ─────────────────────────────────────────────────────────────────── */
console.log('\n3. SOURCE HEALTH — the PortWatch chokepoints source suspended: impact markers on its derived products and the coverage loss routed; reactivated: the markers cleared');
let tReactivated = null;
const src = (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state, name from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'imf-portwatch-chokepoints' order by source_id, contract_version desc`, [T, D]))[0] ?? null;
if (src === null || src.lifecycle_state !== 'active') note(`the PortWatch chokepoints source is ${src?.lifecycle_state ?? 'absent'} — the scene is skipped`);
else {
  const t3 = await mark();
  const s = await transition(dvorak, src.source_id, Number(src.contract_version), 'suspended', 'B22 demonstration: the source is suspended for a minute to show its derived products marked and the coverage loss routed.');
  if (!s.ok) fail('M. Dvořák suspends the source', s);
  else {
    ok(`M. Dvořák SUSPENDED "${src.name}" (contract version ${src.contract_version})`);
    const ev = await waitEvent('SourceHealthChanged', { source_id: src.source_id, state: 'suspended' }, t3);
    const ds = ev === null ? [] : await settled(ev.id, ['source-health']);
    const d = ds.find((x) => x.consumer_kind === 'source-health');
    if (d?.state === 'applied') ok(`SourceHealthChanged (${short(ev.id)}) applied by the source-health subscriber: ${effects(d)}`); else bad(`the source-health delivery: ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}`);
    const marks = await q(`select subject_kind, subject_id::text, health_state, state from observation.source_impact_markers where source_id = $1 and set_by_event = $2`, [src.source_id, ev?.id ?? null]);
    if (marks.length > 0) ok(`IMPACT MARKERS set: ${marks.map((m) => `${m.subject_kind} ${short(m.subject_id)} (${m.health_state})`).join(', ')}`); else note('no derived product rests on the source (no issued forecast of its series)');
    const loss = (await items()).find((x) => x.signal_class === 'source.coverage_loss' && x.subject_id === src.source_id && ['open', 'escalated', 'unrouted'].includes(x.state)) ?? null;
    if (loss !== null) {
      ok(`the COVERAGE LOSS routed: "${loss.title}" → ${loss.state}, roles ${loss.route_roles.join('+')}, due ${loss.due_at?.toISOString?.() ?? loss.due_at}; dimensions ${JSON.stringify(loss.evaluation?.dimensions)}`);
      const a = await ack(dvorak, loss.item_id, 'Suspended on purpose for the demonstration; reactivating now.');
      if (a.ok) ok('M. Dvořák acknowledged the coverage loss'); else fail('M. Dvořák acknowledges', a);
    } else bad('no coverage-loss item was routed');
    const t3b = await mark(); tReactivated = t3b;
    const r = await transition(dvorak, src.source_id, Number(src.contract_version), 'active', 'B22 demonstration: the source reactivated after the suspension.');
    if (!r.ok) fail('M. Dvořák reactivates the source', r);
    else {
      ok(`M. Dvořák REACTIVATED "${src.name}"`);
      const ev2 = await waitEvent('SourceHealthChanged', { source_id: src.source_id, state: 'active' }, t3b);
      const ds2 = ev2 === null ? [] : await settled(ev2.id, ['source-health']);
      const d2 = ds2.find((x) => x.consumer_kind === 'source-health');
      const cleared = await q(`select subject_kind, subject_id::text from observation.source_impact_markers where source_id = $1 and cleared_by_event = $2`, [src.source_id, ev2?.id ?? null]);
      if (d2?.state === 'applied' && cleared.length === marks.length) ok(`the markers CLEARED (${cleared.length}) by the reactivation's SourceHealthChanged (${effects(d2)})`); else bad(`the reactivation: delivery ${d2?.state ?? 'NONE'}, cleared ${cleared.length} of ${marks.length}`);
    }
  }
}

/* ── 4. OBSERVATIONS ──────────────────────────────────────────────────────────────────── */
console.log('\n4. OBSERVATIONS — a collection now; each ObservationRecorded selects its transformation plan');
if (src !== null) {
  // THE WINDOW is from the reactivation: a reactivation re-syncs the source's schedule and its first tick runs at once (the scheduler's
  // `every` semantics), so the day's new rows may already be admitted by that tick before the person's own collection — both said.
  const t4 = tReactivated ?? await mark();
  const c = await collect(dvorak, src.source_id, Number(src.contract_version));
  if (!c.ok) note(`the collection was not run: ${refusalLine(c)}`);
  else {
    note(`M. Dvořák collected "${src.name}": ${JSON.stringify(c.body.run ?? c.body).slice(0, 200)}`);
    // the reactivation's own tick runs on the scheduler's clock: up to 90 s are given to it before "nothing new" is said
    for (let i = 0; i < 90; i += 1) {
      const n = (await q(`select count(*)::int n from objects.object_outbox where event_type = 'ObservationRecorded' and tenant_id = $1 and domain_id = $2 and created_at >= $3 and payload ->> 'source_id' = $4`, [T, D, t4, src.source_id]))[0].n;
      const ticks = (await q(`select count(*)::int n from observation.scheduled_attempts where source_id = $1 and started_at >= $2`, [src.source_id, t4]))[0].n;
      if (n > 0 || ticks > 0) break;
      await sleep(1000);
    }
    await sleep(3000);
    const attempts = await q(`select trigger, outcome, items_admitted, items_noop from observation.scheduled_attempts where source_id = $1 and started_at >= $2 order by started_at`, [src.source_id, t4]);
    if (attempts.length > 0) note(`the reactivation's scheduled tick(s): ${attempts.map((a) => `${a.trigger} ${a.outcome} (${a.items_admitted} admitted, ${a.items_noop} unchanged)`).join('; ')}`);
    const recorded = await q(`select id::text from objects.object_outbox where event_type = 'ObservationRecorded' and tenant_id = $1 and domain_id = $2 and created_at >= $3 and payload ->> 'source_id' = $4`, [T, D, t4, src.source_id]);
    if (recorded.length === 0) note('the publisher returned nothing new (no evidence admitted, so no ObservationRecorded) — the observations subscriber had nothing to select for; said, not staged');
    else {
      for (const e of recorded.slice(0, 5)) await settled(e.id, ['observations']);
      await sleep(5000);
      const sel = await q(`select p.outcome, p.reason, p.methods, coalesce(c.source_key, 'no source') source_key from intelligence.plan_selections p left join lateral (select source_key from observation.source_contracts_current c where c.source_id = p.source_id limit 1) c on true where p.tenant_id = $1 and p.domain_id = $2 and p.selected_at >= $3`, [T, D, t4]);
      const mine = sel.filter((x) => x.source_key === 'imf-portwatch-chokepoints');
      if (mine.length > 0 && mine.every((x) => x.outcome === 'selected')) ok(`since the reactivation, ${mine.length} ObservationRecorded of "${src.name}": selected, method(s) ${mine[0].methods.map((m) => `${m.method_key}@${m.method_version}`).join(', ')} — "${mine[0].reason}"`);
      else bad(`the source's plan selections since the reactivation: ${tally(mine, 'outcome') }`);
      const others = sel.filter((x) => x.source_key !== 'imf-portwatch-chokepoints');
      if (others.length > 0) note(`meanwhile the domain's scheduled collections recorded ${others.length} other observation(s): ${[...new Set(others.map((x) => `${x.source_key} ${x.outcome}`))].join(', ')} — "${others.find((x) => x.outcome === 'no_plan')?.reason ?? others[0].reason}"`);
    }
  }
}

/* ── 5. POLICY v2 AND THE REOPEN ──────────────────────────────────────────────────────── */
console.log('\n5. POLICY v2 AND THE REOPEN — a changed policy re-evaluates the queue and is a recorded cause to reopen a committed decision (L9-I05)');
const t5 = await mark();
let v2 = null;
{
  const r = await publish(dvorak, RULES_V2, 'Scenario incoherence is routed from consequence C3 only (review handles the rest); warnings also escalate to the domain administrator.');
  if (!r.ok) fail('M. Dvořák publishes version 2', r);
  else {
    v2 = r.body.policy;
    ok(`VERSION ${v2.version} published (supersedes ${v2.supersedes}; changed sections ${v2.changed_sections.join(', ')}; classes ${v2.changed_classes.join(', ')})`);
    const ev = await waitEvent('AttentionPolicyChanged', { policy_id: v2.policy_id }, t5);
    const ds = ev === null ? [] : await settled(ev.id, ['attention']);
    const d = ds.find((x) => x.consumer_kind === 'attention');
    if (d?.state === 'applied') ok(`the attention subscriber applied version 2: ${effects(d)}`); else bad(`the attention delivery of version 2: ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}`);
    const re = await q(`select e.details from executive.attention_item_events e where e.event = 'item.reevaluated' and e.tenant_id = $1 and e.domain_id = $2 and e.occurred_at >= $3`, [T, D, t5]);
    note(`${re.length} item(s) re-evaluated under version 2 (${[...new Set(re.map((x) => `${x.details.from_outcome}→${x.details.to_outcome}`))].join(', ')})`);
  }
}
{
  const pkg = (await q(`select package_id::text, title, state, owner_principal_id::text from decision.packages_current where tenant_id = $1 and domain_id = $2 and state = 'committed' order by declared_at desc limit 1`, [T, D]))[0] ?? null;
  if (pkg === null) note('no committed package stands — the reopen is not staged');
  else {
    const noteRow = (await q(`select event_id::text, details from decision.package_events where package_id = $1 and event = 'policy.changed' and (details ->> 'to_version')::int = $2 order by occurred_at desc limit 1`, [pkg.package_id, v2?.version ?? -1]))[0] ?? null;
    if (noteRow === null) bad(`no policy.changed note on "${pkg.title}" for version ${v2?.version}`);
    else {
      ok(`"${pkg.title}" carries the policy note ${short(noteRow.event_id)} (from version ${noteRow.details.from_version ?? 'none'} to ${noteRow.details.to_version}; sections ${(noteRow.details.changed_sections ?? []).join(', ')})`);
      const w = await reopen(weber, pkg.package_id, { kind: 'policy_changed', ref: noteRow.event_id });
      if (!w.ok) ok(`J. Weber (not the owner) refused: ${refusalLine(w)}`); else bad('J. Weber reopened a package she does not own');
      const t5b = await mark();
      const r = await reopen(brandt, pkg.package_id, { kind: 'policy_changed', ref: noteRow.event_id });
      if (!r.ok) fail('L. Brandt reopens on the policy cause', r);
      else {
        ok(`L. Brandt REOPENED "${pkg.title}" on the POLICY CAUSE: version ${r.body.reopened?.new_version ?? r.body.package?.new_version ?? '—'} opened as a draft; cause ${JSON.stringify(r.body.reopened?.cause ?? r.body.cause ?? {}).slice(0, 160)}`);
        const ev = await waitEvent('DecisionReopened', { package_id: pkg.package_id }, t5b);
        if (ev !== null && ev.payload.recorded_cause?.kind === 'policy_changed') ok(`DecisionReopened@${ev.payload.schema_version} published with recorded_cause policy_changed (from ${ev.payload.recorded_cause.from_version ?? 'none'} to ${ev.payload.recorded_cause.to_version})`);
        else bad(`DecisionReopened: ${ev === null ? 'not published' : JSON.stringify(ev.payload.recorded_cause)}`);
      }
    }
  }
}

/* ── 6. ESCALATION ────────────────────────────────────────────────────────────────────── */
console.log('\n6. ESCALATION — the warning items\' two-minute deadline passes (waited out, no clock moved); the executive escalates the overdue');
{
  const open = (await items()).filter((x) => x.signal_class === 'warning.raised' && ['open', 'escalated'].includes(x.state));
  if (open.length === 0) note('no open warning item to escalate');
  else {
    const latest = Math.max(...open.map((x) => new Date(x.due_at).getTime()));
    const wait = Math.max(0, latest - Date.now()) + 5000;
    note(`${open.length} open warning item(s); waiting ${Math.round(wait / 1000)} s for the deadline`);
    await sleep(wait);
    const r = await escalateDue(dvorak);
    if (!r.ok) fail('M. Dvořák escalates the overdue', r);
    else {
      const esc = r.body.escalation;
      if ((esc.escalated ?? []).length > 0) ok(`${esc.escalated.length} overdue item(s) ESCALATED to the executive (lapsed suppressions reopened: ${(esc.lapsed ?? []).length}; exhausted: ${(esc.exhausted ?? []).length})`);
      else bad(`nothing escalated: ${JSON.stringify(esc)}`);
      const one = esc.escalated?.[0];
      if (one) { const evs = await itemEvents(one); const e = evs.find((x) => x.event === 'item.escalated'); note(`  item ${short(one)}: escalation ${e?.details?.escalation}, missed deadline ${e?.details?.missed_deadline}, roles ${(e?.details?.route_roles ?? []).join('+')}`); }
    }
  }
}

/* ── 7. THE STATE ─────────────────────────────────────────────────────────────────────── */
console.log('\n7. THE STATE — what the act leaves');
{
  const it = await items();
  note(`the queue: ${it.length} item(s) — by state ${tally(it, 'state')}; by class ${tally(it, 'signal_class')}; under version ${[...new Set(it.map((x) => x.policy_version ?? 'none'))].join(', ')}`);
  const pol = await q(`select version, state from executive.attention_policies where tenant_id = $1 and domain_id = $2 order by version`, [T, D]);
  note(`the policy: ${pol.map((p) => `v${p.version} ${p.state}`).join(', ')}`);
  const marks = await q(`select state, count(*)::int n from observation.source_impact_markers where tenant_id = $1 and domain_id = $2 group by 1`, [T, D]);
  note(`the markers: ${marks.map((m) => `${m.state} ${m.n}`).join(', ') || 'none'}`);
  const sel = await q(`select outcome, count(*)::int n from intelligence.plan_selections where tenant_id = $1 and domain_id = $2 group by 1`, [T, D]);
  note(`the plan selections: ${sel.map((m) => `${m.outcome} ${m.n}`).join(', ') || 'none'}`);
  note('LIMITS said: in_app delivery only (no external channel); no timer host — the escalation runs at the attention subscriber\'s deliveries and on a person\'s request; the briefing gains no attention section in B22 (BRF@v1 is closed); the extraction run on a selected plan stays an agent\'s act; the quarantine of an invalid event is exercised by the harness, not staged here; packages are marked by source health only where an option cites the forecast itself (the demonstration\'s cite runs and assumptions).');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(failureCount() === 0 ? 0 : 1);
