#!/usr/bin/env node
/**
 * CP-6 batch B24 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): THE ATTENTION
 * COMPLETION (migrations 0085 and 0086), exercised by the personas through the REAL HTTP path, each scene stating the effect it produced
 * in the ledgers and the outbox — and where nothing happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME by SQL against the
 * database the act is pointed at: no id is hard-coded. No clock is moved and no test hook is used: the act WAITS for the attention
 * agent's real scheduled tick.
 *
 *   B24-0 THE STATE: 0085 and 0086 applied (schema_migrations); the register through the route (50 / 0 / 0); the four subscriptions
 *         whose consumer METHOD changed in B24 (attention, source-health, proposals, observations) REVOKED and registered anew by the
 *         administrator (a changed method is a new consumer; the backlog LEFT); the ATTENTION AGENT registered (the administrator — the
 *         only role that may create an agent principal — naming M. Dvořák accountable; cadence 60 s, the timer pointed at it) and the
 *         EXTRACTION AGENT (its principal provisioned by the administrator, registered by L. Ferreira, the extraction manager);
 *         M. Dvořák publishes attention policy VERSION 4 = version 3 + the further dimensions on classes with real inputs
 *         (decision.material_change: min_irreversibility, min_exposure; forecast.unfit and scenario.incoherent: min_exposure), the
 *         enforced OVERLOAD rule (max_open_per_owner 1, window 168 h, C3 exempt), notify {in_app, demo-mailbox} on the three classes the
 *         act shows, suppression approval_required (approver strategy_owner) on forecast.unfit, a two-minute deadline on a material
 *         change, scenario incoherence routed from C2.
 *   B24-1 TIMER: T. Nakamura invalidates a run the monitored package cites (not the chosen option) → MaterialChangeRaised → a C3
 *         decision.material_change routed to L. Brandt with a two-minute deadline; the deadline passes on the DATABASE clock and the
 *         attention agent's SCHEDULED tick escalates it — under the agent's principal, agent_runs trigger 'scheduler', the tick recorded
 *         with its key (one row per key; a duplicate job of one instant is the harness's to prove — the deployment has no hook).
 *   B24-2 DELIVERY: that item's deliveries — in_app with the placement receipt, demo-mailbox (SYNTHETIC: a local sink in the database)
 *         with its message in the mailbox; L. Brandt's acknowledgement AFTER, shown beside the receipts (neither sets the other). Real
 *         email / SMS / Teams delivery needs a provider (owner decision D6) and is NOT demonstrated.
 *   B24-3 MATERIALITY: the routed item's further dimensions with their bases (real inputs, null declared) and its transparent rank; the
 *         OVERLOAD cap holds the two scenario items (C2, owners at the cap) — the deprioritized view with the overload explanation —
 *         while the C3 item was routed with L. Brandt at the cap (exempt); J. Weber closes the item holding their capacity; the rebalance
 *         (M. Dvořák's route, or the tick's step first) ELEVATES their held item (item.elevated with the reason).
 *   B24-4 GOVERNANCE: N. Eriksen requests a suppression on the approval-required class — the item stays live; they may not approve their
 *         own request; J. Weber (strategy_owner, the approver role) approves → suppressed until the capped instant; L. Brandt DELEGATES a
 *         material-change item to J. Weber with a reason and a key; J. Weber acknowledges it; the same key → the recorded delegation;
 *         a delegation to an agent refused.
 *   B24-5 EVALUATION: dispositions recorded (actioned / not_material); M. Dvořák evaluates the queue over its window → precision and
 *         recall by class (or the abstention below min_sample), rank stability, severe-item visibility, escalation latency — as recorded.
 *   B24-6 MARKERS: the chain a degraded source constrains is built through the governed routes — N. Eriksen issues a 90-day forecast
 *         on the corridor source's series (PortWatch chokepoints first; the port refuses a forecast on a history with governed-deleted
 *         evidence, so the act falls back to the ECB reference rate, the B18 corridor decision's source — both 30-day forecasts are unfit,
 *         and a scenario on an unfit forecast fails coherence before any source gate) and declares a scenario on it; T. Nakamura versions
 *         the twin and runs a control and a reroute on it; L. Brandt declares an act-owned package citing them, S. Okafor approves (NEVER
 *         the owner's reopened B18 draft); M. Dvořák SUSPENDS the source → markers on the forecasts, the scenarios, the runs and the
 *         package; L. Brandt's commitment REFUSED (source_impact) until they acknowledge the markers for that version; then committed; a
 *         run on the scenario REFUSED (source_impact); the source REACTIVATED → every marker cleared.
 *   B24-7 PLAN: A. Hoffmann uploads a SYNTHETIC shipment record to the NORDWERK internal source → ObservationRecorded → the plan
 *         selected (corridor-supply-relationships) → one execution queued; L. Ferreira records the replay fixture for it (hand-written,
 *         recorded_from 'fixture', exactly as the Phase 3 seed does); the plan worker runs it under the EXTRACTION AGENT → done, with
 *         its run and the admitted claims — or the reason it could not, stated.
 *   B24-8 B23-F1: K. Müller records a memory item on the Cape corridor for knowledge owners only; A. Hoffmann's context answer carries
 *         no count and no mention of it; the administrator's answer serves it; with memory_items_current withdrawn the answer is served
 *         from the log with the constant note, still silent about it; rebuilt after.
 *   B24-9 THE STATE: the queue by class and state, deliveries by channel and state (the SYNTHETIC mailbox count), suppression requests,
 *         delegations, evaluations, markers, plan executions, ticks, what the act leaves.
 *
 * CASTING (the seed's personas; no human persona is created — each one's recorded roles are read from identity.role_bindings before the
 * act): M. Dvořák (executive, collection_manager), N. Eriksen (forecast_owner), J. Weber (strategy_owner), L. Brandt (decision_owner,
 * decision_authority), K. Müller (knowledge_owner), A. Hoffmann (domain_analyst), L. Ferreira (extraction_manager), T. Nakamura
 * (twin_owner), S. Okafor (decision_approver — the approver the act-owned package needs: the committing authority is never an approver);
 * the administrator = the platform-admin session. The two AGENT principals are the product's (created through the governed routes).
 * Nothing here prints a credential.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';
import { buildFixtures as supplyFixtures } from '../phase3/build-graph-fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
// THE RUNTIME'S IDENTITIES, read from the build the API runs (apps/api/dist): the attention timer's (an attention agent is registered with
// this runtime's timer — another digest is a drifted agent) and the plan executor's.
const { ATTENTION_TIMER_VERSION, ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_METHOD } = requireApi('./dist/executive/attention/timer-identity.js');
const { PLAN_EXECUTOR } = requireApi('./dist/intelligence/plan/plan-executor.js');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const O = `${X}/observation`; const E = `${X}/executive/attention`; const P = `${X}/prediction`;
const W = `${X}/twins`; const DC = `${X}/decisions`; const I = `${X}/intelligence`;
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
console.log(`THE B24 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);

/* ── the casting: each persona's recorded roles read before it acts ─────────────────── */
const CAST = { 'm.dvorak': ['executive', 'collection_manager'], 'n.eriksen': ['forecast_owner'], 'j.weber': ['strategy_owner'], 'l.brandt': ['decision_owner', 'decision_authority'],
  'k.mueller': ['knowledge_owner'], 'a.hoffmann': ['domain_analyst'], 'l.ferreira': ['extraction_manager'], 't.nakamura': ['twin_owner'], 's.okafor': ['decision_approver'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, m]) => m.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, m]) => `${l} lacks ${m.join(', ')}`).join('; ')}`); process.exit(1); }
}
const dvorak = await who('m.dvorak'); const eriksen = await who('n.eriksen'); const weber = await who('j.weber'); const brandt = await who('l.brandt');
const mueller = await who('k.mueller'); const hoffmann = await who('a.hoffmann'); const ferreira = await who('l.ferreira'); const nakamura = await who('t.nakamura');
const okafor = await who('s.okafor');
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });
const NAME = { [dvorak.principalId]: 'M. Dvořák', [eriksen.principalId]: 'N. Eriksen', [weber.principalId]: 'J. Weber', [brandt.principalId]: 'L. Brandt', [mueller.principalId]: 'K. Müller',
  [hoffmann.principalId]: 'A. Hoffmann', [ferreira.principalId]: 'L. Ferreira', [nakamura.principalId]: 'T. Nakamura', [okafor.principalId]: 'S. Okafor', [admin.principalId]: 'the administrator' };
const loginOf = async (principalId) => NAME[principalId] ?? (await q('select coalesce(login_name, display_name) n from identity.principals where id = $1', [principalId]))[0]?.n ?? short(principalId);

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
const effects = (d) => { const m = new Map(); for (const x of d?.items_applied ?? []) m.set(x.effect, (m.get(x.effect) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ×${n}`).join(', ') || 'no effect'; };
const ITEM_COLS = `item_id::text, signal_class, subject_kind, subject_id::text, title, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, due_at, escalations,
                   suppressed_until, acknowledged_at, acknowledged_by::text, closed_at, created_at, updated_at, cause_event_id::text`;
const itemsOf = (cls, subjectId = null) => q(`select ${ITEM_COLS} from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = $3 and ($4::uuid is null or subject_id = $4::uuid) order by created_at`, [T, D, cls, subjectId]);
const itemRow = async (id) => (await q(`select ${ITEM_COLS} from executive.attention_items where item_id = $1`, [id]))[0] ?? null;
const itemEvents = (id) => q(`select event_id::text, event, actor_principal_id::text actor, details, occurred_at from executive.attention_item_events where item_id = $1 order by occurred_at, event_id`, [id]);
const tally = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'; };
const activePolicy = async () => (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
const ownerLoad = async (rules, owner, self) => (await q(`select executive.attention_owner_load($1::jsonb, $2::uuid, $3::uuid, $4::uuid, $5::uuid) l`, [JSON.stringify(rules), owner, T, D, self]))[0].l;
const exemptOf = async (rules, dims) => (await q(`select executive.attention_overload_exempt($1::jsonb, $2::jsonb) e`, [JSON.stringify(rules), JSON.stringify(dims ?? {})]))[0].e;

/* ── the routes ─────────────────────────────────────────────────────────────────────── */
const interfaces = () => call(`${G}/interfaces`, env_(weber, 'graph')({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
const subscriptionStatus = async () => {
  const r = await call(`${G}/subscriptions/status`, ad({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, admin.token);
  return r.ok ? r.body.subscriptions : (fail('subscriptions/status', r), null);
};
const publish = (s, rules, reason) => call(`${E}/policy/publish`, env_(s, 'executive')({ action: 'executive.attention.policy.publish', objectType: 'ATP', consequence: 'C2' }), { rules, reason }, s.token);
const ack = (s, id, note_) => call(`${E}/items/${id}/acknowledge`, env_(s, 'executive')({ action: 'executive.attention.item.acknowledge', objectType: 'ATI', objectId: id, consequence: 'C2' }), { note: note_ }, s.token);
const closeItem = (s, id, note_) => call(`${E}/items/${id}/close`, env_(s, 'executive')({ action: 'executive.attention.item.close', objectType: 'ATI', objectId: id, consequence: 'C2' }), { note: note_ }, s.token);
const suppress = (s, id, until, reason) => call(`${E}/items/${id}/suppress`, env_(s, 'executive')({ action: 'executive.attention.item.suppress', objectType: 'ATI', objectId: id, consequence: 'C2' }), { until, reason }, s.token);
const decide = (s, id, decision, reason) => call(`${E}/suppressions/${id}/decide`, env_(s, 'executive')({ action: 'executive.attention.suppression.decide', objectType: 'ATS', objectId: id, consequence: 'C2' }), { decision, reason }, s.token);
const suppressionsList = (s, payload = {}) => call(`${E}/suppressions/list`, env_(s, 'executive')({ action: 'executive.attention.read', objectType: 'ATS', sideEffect: 'none' }), payload, s.token);
const delegate = (s, id, payload) => call(`${E}/items/${id}/delegate`, env_(s, 'executive')({ action: 'executive.attention.item.delegate', objectType: 'ATI', objectId: id, consequence: 'C2' }), payload, s.token);
const delegationsList = (s, payload = {}) => call(`${E}/delegations/list`, env_(s, 'executive')({ action: 'executive.attention.read', objectType: 'ATD', sideEffect: 'none' }), payload, s.token);
const disposition = (s, id, payload) => call(`${E}/items/${id}/disposition`, env_(s, 'executive')({ action: 'executive.attention.disposition.record', objectType: 'ATI', objectId: id, consequence: 'C2' }), payload, s.token);
const evaluateQueue = (s, payload) => call(`${E}/evaluations/run`, env_(s, 'executive')({ action: 'executive.attention.queue.evaluate', objectType: 'ATE', consequence: 'C2' }), payload, s.token);
const deliveriesRead = (s, id) => call(`${E}/items/${id}/deliveries`, env_(s, 'executive')({ action: 'executive.attention.read', objectType: 'ATI', objectId: id, sideEffect: 'none' }), {}, s.token);
const mailbox = (s, payload = {}) => call(`${E}/mailbox`, env_(s, 'executive')({ action: 'executive.attention.read', objectType: 'ATI', sideEffect: 'none' }), payload, s.token);
const deprioritized = (s) => call(`${E}/deprioritized`, env_(s, 'executive')({ action: 'executive.attention.read', objectType: 'ATI', sideEffect: 'none' }), {}, s.token);
const rebalance = (s) => call(`${E}/rebalance`, env_(s, 'executive')({ action: 'executive.attention.rebalance', objectType: 'ATI', consequence: 'C2' }), {}, s.token);
const registerAgent = (payload) => call(`${X}/agents/decision/register`, ad({ action: 'agent.register', objectType: 'AGT' }), payload, admin.token);
const invalidateRun = (s, runId, reason) => call(`${X}/twins/simulations/${runId}/invalidate`, env_(s, 'simulation')({ action: 'simulation.run.invalidate', objectType: 'SIM', objectId: runId, consequence: 'C2' }), { reason }, s.token);
const transition = (s, sourceId, contractVersion, target, reason) => call(`${O}/sources/${sourceId}/transition`, env_(s, 'observation')({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId, consequence: 'C2' }), { contractVersion, target, reason }, s.token);
const markersRead = (s, payload) => call(`${O}/source-impact/markers`, env_(s, 'observation')({ action: 'observation.source_impact.read', objectType: 'SRC', sideEffect: 'none' }), payload, s.token);
const ackImpact = (s, pkg, payload) => call(`${DC}/${pkg}/source-impact/acknowledge`, env_(s, 'decision')({ action: 'decision.source_impact.acknowledge', objectType: 'DPK', objectId: pkg, consequence: 'C2' }), payload, s.token);
const simRun = (s, payload) => call(`${W}/simulations/run`, env_(s, 'simulation')({ action: 'simulation.run', objectType: 'SIM' }), payload, s.token);
const lb = env_(brandt, 'decision'); const so = env_(okafor, 'decision'); const ne = env_(eriksen, 'prediction'); const tn = env_(nakamura, 'twin');
const upload = (s, payload) => call(`${O}/upload`, env_(s, 'observation')({ action: 'observation.run.trigger', objectType: 'RUN' }), payload, s.token);
const gatewayRecord = (s, recordings) => call(`${I}/gateway/record`, env_(s, 'intelligence')({ action: 'intelligence.gateway.call', objectType: 'GWC', consequence: 'C2' }), { recordings }, s.token);
const registerExtractionAgent = (s, payload) => call(`${I}/extraction/agents/register`, env_(s, 'intelligence')({ action: 'intelligence.extraction.agent.register', objectType: 'AGT', consequence: 'C2' }), payload, s.token);
const planStatus = (s, payload = {}) => call(`${I}/plan/status`, env_(s, 'intelligence')({ action: 'intelligence.read', objectType: 'PLX', sideEffect: 'none' }), payload, s.token);
const recordMemory = (s, body) => call(`${G}/memory/record`, env_(s, 'memory')({ action: 'memory.item.record', objectType: 'MEM', consequence: 'C2' }), body, s.token);
const context = (s, purpose, subject) => call(`${G}/memory/context`, env_(s, purpose)({ action: 'memory.context.retrieve', objectType: 'MEM', sideEffect: 'none', consequence: 'C2' }), { subject, asOf: null, limit: 50 }, s.token);
const adminContext = (purpose, subject) => call(`${G}/memory/context`, ad({ purposeId: purpose, action: 'memory.context.retrieve', objectType: 'MEM', sideEffect: 'none', consequence: 'C2' }), { subject, asOf: null, limit: 50 }, admin.token);
const projection = (projection_, verb, reason) => call(`${G}/projections/${projection_}/${verb}`, ad({ action: `graph.projection.${verb}`, objectType: 'PRJ', consequence: 'C2' }), { reason }, admin.token);

/* ── the policy version 4 (built on the active version at run time) ─────────────────── */
const BOTH = { channels: ['in_app', 'demo-mailbox'], max_attempts: 3 };
function rulesV4(active) {
  const c = JSON.parse(JSON.stringify(active.rules.classes));
  const mc = c['decision.material_change']; const fu = c['forecast.unfit']; const si = c['scenario.incoherent'];
  c['decision.material_change'] = { ...mc, materiality: { ...mc.materiality, min_irreversibility: 'reversible', min_exposure: 1 }, ack_within_minutes: 2, max_escalations: 1, escalate_to_roles: ['executive'], notify: BOTH };
  c['forecast.unfit'] = { ...fu, materiality: { ...fu.materiality, min_exposure: 0 }, suppression: { allowed: true, max_hours: 24, approval_required: true, approver_roles: ['strategy_owner'] }, notify: BOTH };
  c['scenario.incoherent'] = { ...si, materiality: { ...si.materiality, min_consequence: 'C2', min_exposure: 0 }, notify: BOTH };
  return { classes: c, overload: { max_open_per_owner: 1, window_hours: 168, exempt_min_consequence: 'C3' } };
}
const B24_REASON = 'B24 demonstration';
const PURPOSE = 'sourcing decision';
const PKG24_TITLE = 'B24 — second source for the magnet sets on the 90-day forecast (SYNTHETIC)';
const SCN24_TITLE = 'B24 — the 90-day forecast\'s scenario for the second source (SYNTHETIC)';

/* ── B24-0 THE STATE ───────────────────────────────────────────────────────────────── */
console.log('\nB24-0 THE STATE — 0085/0086 applied; the register (50 / 0 / 0); the changed consumers re-registered; the attention and extraction agents; policy version 4');
{
  const m = await q(`select filename, applied_at from public.schema_migrations where filename like '0085%' or filename like '0086%' order by filename`);
  if (m.length === 2) ok(`migrations applied (public.schema_migrations): ${m.map((r) => `${r.filename} at ${iso(r.applied_at)}`).join('; ')}`);
  else bad(`0085/0086 not both applied: ${m.map((r) => r.filename).join(', ') || 'none'}`);
  const ir = await interfaces();
  if (!ir.ok) fail('graph/interfaces', ir);
  else {
    const all = ir.body.interfaces ?? []; const count = (s) => all.filter((i) => i.binding_state === s).length;
    if (all.length === 50 && count('bound') === 50 && count('partial') === 0 && count('unbound') === 0) ok(`the interface register (J. Weber): 50 rows — 50 bound / 0 partial / 0 unbound (B24 adds no interface)`);
    else bad(`the register: ${all.length} rows, ${count('bound')}/${count('partial')}/${count('unbound')}`);
  }
}
const subs = {};
{
  const st = await subscriptionStatus();
  const consumers = st?.consumers ?? [];
  const live = (st?.subscriptions ?? []).filter((s) => s.status !== 'revoked');
  const changed = live.filter((s) => { const c = consumers.find((x) => x.kind === s.consumer_kind); return c !== undefined && (c.codeDigest !== s.code_digest || c.version !== s.consumer_version); });
  note(`the origin's ${live.length} live subscriptions: ${changed.length === 0 ? 'every one carries this process\'s consumer identity (an earlier run re-registered them)' : `${changed.map((s) => s.consumer_kind).join(', ')} registered for a consumer whose method has since changed`}`);
  const unexpected = changed.filter((s) => !['attention', 'source-health', 'proposals', 'observations'].includes(s.consumer_kind));
  if (unexpected.length > 0) note(`kinds changed besides the four B24 names: ${unexpected.map((s) => s.consumer_kind).join(', ')} — re-registered the same way`);
  for (const s of changed) {
    const c = consumers.find((x) => x.kind === s.consumer_kind);
    const row = (await q('select owner_principal_id::text, checkpoint_seq::text from graph.subscriptions where subscription_id = $1', [s.subscription_id]))[0];
    const rv = await call(`${G}/subscriptions/${s.subscription_id}/revoke`, ad({ action: 'graph.subscription.control', objectType: 'SUB', objectId: s.subscription_id, consequence: 'C2' }),
      { reason: `B24: the ${s.consumer_kind} consumer's method changed (${String(s.code_digest).slice(0, 12)}… → ${String(c.codeDigest).slice(0, 12)}…); a changed method is a new consumer` }, admin.token);
    if (!rv.ok) { fail(`revoke the outdated ${s.consumer_kind} subscription`, rv); continue; }
    const r = await call(`${G}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }), { consumerKind: s.consumer_kind, ownerPrincipalId: row.owner_principal_id, backlog: 'leave' }, admin.token);
    if (!r.ok) { fail(`register ${s.consumer_kind}`, r); continue; }
    const n = r.body.subscription;
    ok(`${s.consumer_kind}: subscription ${short(s.subscription_id)} (consumer ${String(s.code_digest).slice(0, 12)}…, cursor ${row.checkpoint_seq ?? 'none'}) REVOKED; registered anew as ${short(n.subscriptionId)} (role ${n.role}, consumer ${n.consumer.version} ${String(n.consumer.codeDigest).slice(0, 12)}…, event types ${n.eventTypes.join(' | ')}, owner ${await loginOf(row.owner_principal_id)}), the backlog LEFT (${r.body.served.reDriven ?? 0} re-driven)`);
  }
  for (const r of await liveSubs()) subs[r.consumer_kind] = r.subscription_id;
  const after = await subscriptionStatus();
  const stale = (after?.subscriptions ?? []).filter((s) => s.status !== 'revoked' && (after.consumers ?? []).some((c) => c.kind === s.consumer_kind && (c.codeDigest !== s.code_digest || c.version !== s.consumer_version)));
  if (stale.length === 0 && ['attention', 'source-health', 'proposals', 'observations'].every((k) => subs[k])) ok(`every live subscription of the origin now carries this process's consumer identity (${Object.keys(subs).length} kinds)`);
  else bad(`subscriptions still outdated: ${stale.map((s) => s.consumer_kind).join(', ') || 'none'}; ${['attention', 'source-health', 'proposals', 'observations'].filter((k) => !subs[k]).join(', ') || 'all four'} ${['attention', 'source-health', 'proposals', 'observations'].every((k) => subs[k]) ? 'present' : 'MISSING'}`);
}
// THE ATTENTION AGENT — the timer host's principal. agent.register is the platform / tenant administrator's (it creates the agent's principal);
// M. Dvořák (executive) is named the accountable human and the escalation target.
let AGENT = null;
{
  const cur = (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, owner_principal_id::text, escalation_principal_id::text, budgets, created_at, created_by::text
                          from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
  if (cur !== null && cur.code_digest === ATTENTION_TIMER_DIGEST) { AGENT = cur; note(`the attention agent ${short(cur.agent_id)} is registered (principal ${short(cur.principal_id)}, ${cur.agent_version}, cadence ${cur.budgets?.tick_every_seconds ?? 300} s) — an earlier run`); }
  else {
    if (cur !== null) note(`the active attention agent ${short(cur.agent_id)} carries digest ${String(cur.code_digest).slice(0, 12)}… — DRIFTED from this runtime's ${ATTENTION_TIMER_DIGEST.slice(0, 12)}…; registered anew`);
    const r = await registerAgent({ kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: dvorak.principalId, escalationPrincipalId: dvorak.principalId,
      budgets: { max_reads: 1000, max_gateway_calls: 0, max_elapsed_ms: 120000, tick_every_seconds: 60 }, stopConditions: [] });
    if (!r.ok) fail('the administrator registers the attention agent', r);
    else {
      AGENT = (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, owner_principal_id::text, escalation_principal_id::text, budgets, created_at, created_by::text from executive.agents where agent_id = $1`, [r.body.agent.agentId]))[0];
      const roles = (await q(`select array_agg(role_code) r from identity.role_bindings where principal_id = $1 and revoked_at is null`, [AGENT.principal_id]))[0].r ?? [];
      ok(`the administrator REGISTERED the attention agent ${short(AGENT.agent_id)} — principal ${short(AGENT.principal_id)} (kind agent, roles ${roles.join(', ')}), ${ATTENTION_TIMER_METHOD} digest ${ATTENTION_TIMER_DIGEST.slice(0, 12)}…, accountable M. Dvořák, escalation M. Dvořák, budgets ${JSON.stringify(AGENT.budgets)}; the timer: ${JSON.stringify(r.body.timer ?? null).slice(0, 200)}`);
    }
  }
}
// THE EXTRACTION AGENT — its principal provisioned by the administrator (identity.principal.create is the tenant / platform administrator's), registered
// by L. Ferreira (the extraction manager), owner L. Ferreira, escalation K. Müller (the other role the held claims are routed to).
let XAGENT = null;
{
  const cur = (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, owner_principal_id::text, escalation_principal_id::text, budgets, created_by::text from intelligence.extraction_agents where tenant_id = $1 and domain_id = $2 and status = 'active' limit 1`, [T, D]))[0] ?? null;
  if (cur !== null) { XAGENT = cur; note(`the extraction agent ${short(cur.agent_id)} is registered (principal ${short(cur.principal_id)}, executor ${cur.agent_version}, registered by ${await loginOf(cur.created_by)}) — an earlier run`); }
  else {
    const dn = `agent:${PLAN_EXECUTOR.name}@${PLAN_EXECUTOR.version} (${PLAN_EXECUTOR.codeDigest.slice(0, 12)}) — the B24 plan executor`;
    let principalId = (await q(`select p.id::text from identity.principals p where p.tenant_id = $1 and p.kind = 'agent' and p.status = 'active' and p.display_name = $2
                                  and not exists (select 1 from intelligence.extraction_agents a where a.principal_id = p.id) limit 1`, [T, dn]))[0]?.id ?? null;
    if (principalId !== null) note(`an agent principal ${short(principalId)} provisioned by an earlier run is reused`);
    else {
      const pr = await call(`/v1/tenants/${T}/principals`, { scope: 'TENANT', tenantId: T, action: 'identity.principal.create', objectType: 'PRN', principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration' },
        { kind: 'agent', displayName: dn, loginName: `agent-intelligence-plan-${PLAN_EXECUTOR.version}-${PLAN_EXECUTOR.codeDigest.slice(0, 12)}-b24`, roleCode: 'extraction_agent', domainId: D }, admin.token);
      if (!pr.ok) fail('the administrator provisions the extraction agent\'s principal', pr);
      else { principalId = pr.body.principal.principalId; ok(`the administrator PROVISIONED the agent principal ${short(principalId)} "${dn}" (kind agent, role extraction_agent in the domain)`); }
    }
    if (principalId !== null) {
      const r = await registerExtractionAgent(ferreira, { principalId, ownerPrincipalId: ferreira.principalId, escalationPrincipalId: mueller.principalId });
      if (!r.ok) fail('L. Ferreira registers the extraction agent', r);
      else {
        XAGENT = (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, owner_principal_id::text, escalation_principal_id::text, budgets, created_by::text from intelligence.extraction_agents where agent_id = $1`, [r.body.agent.agentId]))[0];
        ok(`L. Ferreira REGISTERED the extraction agent ${short(XAGENT.agent_id)} on that principal — executor ${r.body.agent.executor.name}@${r.body.agent.executor.version} (${String(r.body.agent.executor.codeDigest).slice(0, 12)}…), owner L. Ferreira, escalation K. Müller, budgets ${JSON.stringify(r.body.agent.budgets)}; the drain every ${r.body.served?.everySeconds} s (scheduled ${r.body.served?.drainScheduled}); ${r.body.agent.pending} execution(s) waiting`);
      }
    }
  }
}
let POLICY = null;
{
  const active = await activePolicy();
  if (active === null) bad('no attention policy is active (act-b22/b23 publish versions 1–3) — version 4 extends the active one');
  else if (typeof active.rules?.overload?.max_open_per_owner === 'number') { POLICY = active; note(`the active policy (version ${active.version}) already names the enforced overload rule — an earlier run published it`); }
  else {
    const rules = rulesV4(active);
    const t0 = await mark();
    const r = await publish(dvorak, rules, 'B24: the further dimensions judged where a class has real inputs; one open item per owner (C3 and C4 never held); material changes acknowledged within two minutes and delivered in-app and to the SYNTHETIC demo mailbox; a forecast-unfit suppression needs a strategy owner\'s approval.');
    if (!r.ok) fail('M. Dvořák publishes version 4', r);
    else {
      const p = r.body.policy; POLICY = await activePolicy();
      ok(`M. Dvořák published attention policy VERSION ${p.version} (supersedes ${p.supersedes}; changed sections ${p.changed_sections.join(', ')}; classes ${p.changed_classes.join(', ')}): overload ${JSON.stringify(rules.overload)}; decision.material_change ${JSON.stringify(rules.classes['decision.material_change'].materiality)}, ack ${rules.classes['decision.material_change'].ack_within_minutes} min; forecast.unfit suppression ${JSON.stringify(rules.classes['forecast.unfit'].suppression)}; notify ${JSON.stringify(BOTH)} on decision.material_change, forecast.unfit, scenario.incoherent`);
      const ev = await waitOutbox('AttentionPolicyChanged', (x) => x.policy_id === p.policy_id, t0);
      const d = ev === null ? null : (await settled(ev.id, ['attention'], 240)).find((x) => x.consumer_kind === 'attention') ?? null;
      if (d?.state === 'applied') ok(`AttentionPolicyChanged@${ev.payload.schema_version} (${short(ev.id)}) applied by the NEW attention subscription: ${(d.items ?? []).length} item(s) — ${effects(d)}`);
      else bad(`AttentionPolicyChanged: ${ev === null ? 'not published' : `delivery ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}`}`);
    }
  }
}

/* ── B24-1 TIMER ───────────────────────────────────────────────────────────────────── */
console.log('\nB24-1 TIMER — a material change with a two-minute deadline; the deadline passes on the database clock; the attention agent\'s scheduled tick escalates it');
let PKG = null; let MC = null;
{
  PKG = (await q(`select package_id::text, title, state, current_version, owner_principal_id::text from decision.packages_current where tenant_id = $1 and domain_id = $2 and state in ('committed','monitoring') and title <> $3 order by declared_at limit 1`, [T, D, PKG24_TITLE]))[0] ?? null;
  // an earlier run's material change: MaterialChangeRaised on the package whose triggering run was invalidated for the B24 demonstration
  const earlier = (await q(`select i.item_id::text from executive.attention_items i join objects.object_outbox o on o.id = i.cause_event_id
                             join simulation.run_events e on e.event = 'run.invalidated' and e.details ->> 'reason' like $2 and o.payload -> 'trigger' ->> 'change_kind' = 'simulation.invalidated'
                              and (o.payload ::text like '%' || e.run_id::text || '%')
                            where i.tenant_id = $1 and i.signal_class = 'decision.material_change' order by i.created_at desc limit 1`, [T, `${B24_REASON}%`]))[0] ?? null;
  if (PKG === null) note('no committed or monitored package stands — no material change is staged; the timer is shown on whatever item falls due');
  else if (earlier !== null) { MC = await itemRow(earlier.item_id); note(`an earlier run raised the B24 material change (item ${short(MC.item_id)}, ${MC.state}) — no second run is invalidated`); }
  else {
    const cand = (await q(`
      with cur as (select o.package_id, o.key, c ->> 'id' as run_id from decision.options o join decision.packages_current p on p.package_id = o.package_id and p.current_version = o.version,
                   jsonb_array_elements(o.consequences) c where c ->> 'kind' = 'run')
      select cur.key, cur.run_id, r.run_kind from cur join simulation.runs_current r on r.run_id::text = cur.run_id
       where cur.package_id = $1 and r.state = 'completed' and r.run_kind <> 'control' and r.validity = 'valid'
         and cur.key <> coalesce((select v.choice ->> 'option_key' from decision.package_versions v join decision.packages_current p on p.package_id = v.package_id and p.current_version = v.version where v.package_id = $1), '')
         and not exists (select 1 from cur o2 where o2.run_id = cur.run_id and o2.package_id <> $1)
         and not exists (select 1 from simulation.run_events e where e.run_id = r.run_id and e.event ilike '%invalidat%')
       order by cur.key limit 1`, [PKG.package_id]))[0] ?? null;
    note(`the package: "${PKG.title}" (${PKG.state}, version ${PKG.current_version}, owner ${await loginOf(PKG.owner_principal_id)})`);
    if (cand === null) note('no cited run is eligible (every one is chosen, shared, a control or already invalidated) — no material change is staged');
    else {
      const t1 = await mark();
      const pol = POLICY ?? await activePolicy();
      const loadBefore = await ownerLoad(pol.rules, PKG.owner_principal_id, null);
      const inv = await invalidateRun(nakamura, cand.run_id, `${B24_REASON}: the ${cand.key} option's run is invalidated by the twin owner — the monitored decision that cites it must hear of it, within the policy's deadline`);
      if (!inv.ok) fail('T. Nakamura invalidates the run', inv);
      else {
        ok(`T. Nakamura INVALIDATED run ${short(cand.run_id)} (${cand.run_kind}, option ${cand.key} of "${PKG.title}" — not the chosen option): the SIM withdrawn at version ${inv.body.invalidation.withdrawnVersion}`);
        const mcr = await waitOutbox('MaterialChangeRaised', (x) => x.package_id === PKG.package_id && x.trigger?.change_kind === 'simulation.invalidated', t1, 90);
        if (mcr === null) bad('MaterialChangeRaised was not published');
        else {
          const da = (await settled(mcr.id, ['attention'])).find((x) => x.consumer_kind === 'attention') ?? null;
          MC = (await itemsOf('decision.material_change', PKG.package_id)).find((x) => x.cause_event_id === mcr.id) ?? null;
          if (da?.state === 'applied' && MC !== null && MC.state === 'open' && MC.outcome === 'material' && MC.policy_version === pol.version)
            ok(`MaterialChangeRaised@${mcr.payload.schema_version} (${short(mcr.id)}) → the attention subscriber ROUTED item ${short(MC.item_id)} to ${await loginOf(MC.owner_principal_id)} under version ${MC.policy_version}: ${MC.state}, consequence ${MC.evaluation?.dimensions?.consequence}, due ${iso(MC.due_at)} (created ${iso(MC.created_at)} — the class's ${pol.rules.classes['decision.material_change'].ack_within_minutes}-minute deadline); L. Brandt held ${loadBefore.open} open or escalated item(s) at the cap ${loadBefore.cap} — the C3 item is EXEMPT (no overload record on it: ${MC.evaluation?.overload === undefined})`);
          else bad(`the routing: delivery ${da?.state ?? 'NONE'} ${da?.last_error ?? ''}; item ${MC === null ? 'MISSING' : `${MC.outcome}/${MC.state} v${MC.policy_version} overload ${JSON.stringify(MC.evaluation?.overload ?? null).slice(0, 200)}`}`);
        }
      }
    }
  }
}
let ESC = null; // the escalation event of the B24-1 item
if (MC !== null && AGENT !== null) {
  const evs0 = await itemEvents(MC.item_id);
  ESC = evs0.find((e) => e.event === 'item.escalated' && e.details?.missed_deadline) ?? null;
  if (ESC === null && ['open', 'escalated'].includes(MC.state)) {
    const wait = Math.max(0, new Date(MC.due_at).getTime() - (await mark()).getTime());
    note(`waiting ${Math.round(wait / 1000)} s for the deadline on the database clock, then for the next scheduled tick (cadence ${AGENT.budgets?.tick_every_seconds ?? 300} s) — no clock is moved, no hook is used`);
    await sleep(wait + 1000);
    for (let i = 0; i < 200 && ESC === null; i += 1) { ESC = (await itemEvents(MC.item_id)).find((e) => e.event === 'item.escalated' && e.details?.missed_deadline) ?? null; if (ESC === null) await sleep(1000); }
  }
  if (ESC === null) bad(`item ${short(MC.item_id)} was not escalated (state ${(await itemRow(MC.item_id))?.state})`);
  else {
    const tick = (await q(`select t.tick_id::text, t.tick_key::text, t.cadence_seconds, t.scheduled_at, t.recorded_at, t.run_id::text, t.principal_id::text, t.result, r.trigger_kind, r.trigger_ref, r.task, r.outcome, r.principal_id::text run_principal
                              from executive.attention_ticks t join executive.agent_runs r on r.run_id = t.run_id
                             where t.tenant_id = $1 and t.domain_id = $2 and (t.result -> 'steps' -> 'escalate' -> 'escalated') ? $3 order by t.recorded_at limit 1`, [T, D, MC.item_id]))[0] ?? null;
    const byAgent = ESC.actor === AGENT.principal_id;
    if (byAgent && tick !== null && tick.trigger_kind === 'scheduler' && tick.task === 'attention_tick' && tick.run_principal === AGENT.principal_id)
      ok(`the attention agent's SCHEDULED TICK escalated it at ${iso(ESC.occurred_at)} (missed deadline ${ESC.details.missed_deadline}; escalation ${ESC.details.escalation}; roles now ${(ESC.details.route_roles ?? []).join('+')}) — the event's actor is the agent's principal ${short(AGENT.principal_id)}; agent run ${short(tick.run_id)} task ${tick.task}, trigger ${tick.trigger_kind} (job ${String(tick.trigger_ref).slice(0, 40)}), outcome ${tick.outcome}; tick ${short(tick.tick_id)} key ${tick.tick_key} (cadence ${tick.cadence_seconds} s, scheduled ${iso(tick.scheduled_at)}), steps ${(tick.result?.order ?? []).map((s) => `${s.name}@${s.order}`).join(' → ')}: escalate ${JSON.stringify({ escalated: tick.result.steps.escalate.escalated.length, lapsed: tick.result.steps.escalate.lapsed.length, exhausted: tick.result.steps.escalate.exhausted.length })}`);
    else bad(`the escalation: actor ${await loginOf(ESC.actor)} (${byAgent ? 'the agent' : 'NOT the attention agent'}); tick ${tick === null ? 'NOT FOUND' : `${tick.trigger_kind}/${tick.task}/${short(tick.run_principal)}`}`);
    const keys = (await q(`select count(*)::int n, count(distinct tick_key)::int k, min(recorded_at) first, max(recorded_at) last from executive.attention_ticks where tenant_id = $1 and domain_id = $2`, [T, D]))[0];
    const runs = (await q(`select outcome, count(*)::int n from executive.agent_runs where tenant_id = $1 and domain_id = $2 and task = 'attention_tick' group by 1`, [T, D]));
    if (keys.n === keys.k) ok(`the ticks so far: ${keys.n} recorded, ${keys.k} distinct keys (one row per key — xat_once), from ${iso(keys.first)} to ${iso(keys.last)}; the agent's attention_tick runs: ${runs.map((r) => `${r.outcome} ${r.n}`).join(', ')}. A SECOND job of the same instant answers \`repeated\` — BullMQ delivers each job once here and the deployment has no hook to plant a duplicate: that proof is the harness's (phase6-attention-timer-b24), said, not staged`);
    else bad(`the ticks: ${keys.n} rows for ${keys.k} keys`);
  }
} else note('no item and no attention agent to watch — the timer scene is not staged');

/* ── B24-2 DELIVERY ────────────────────────────────────────────────────────────────── */
console.log('\nB24-2 DELIVERY — the item\'s deliveries with their receipts (in_app; the SYNTHETIC demo mailbox); the acknowledgement a separate act');
if (MC !== null) {
  // the routed and escalated events' attempts are planned and drained by the ticks (deliveries, order 30): wait until none is queued
  for (let i = 0; i < 150; i += 1) {
    const ds = await q(`select state, item_event from executive.attention_deliveries where item_id = $1`, [MC.item_id]);
    if (ds.some((d) => d.item_event === 'item.escalated') && ds.every((d) => d.state !== 'queued')) break;
    await sleep(1000);
  }
  const r = await deliveriesRead(brandt, MC.item_id);
  if (!r.ok) fail('the deliveries read (L. Brandt)', r);
  else {
    const ds = r.body.deliveries;
    const lines = await Promise.all(ds.map(async (d) => `${d.item_event.replace('item.', '')}/${d.channel}${d.synthetic ? ' (SYNTHETIC)' : ''} → ${await loginOf(d.recipient)}: attempt ${d.attempt}/${d.max_attempts} ${d.state} at ${d.attempted_at}${d.channel === 'demo-mailbox' ? ` (message ${short(d.receipt?.message_id)})` : ` (placed ${d.receipt?.placed})`}`));
    const inApp = ds.filter((d) => d.channel === 'in_app'); const mail = ds.filter((d) => d.channel === 'demo-mailbox');
    if (ds.length > 0 && inApp.length > 0 && mail.length > 0 && ds.every((d) => d.state === 'delivered') && ds.some((d) => d.item_event === 'item.escalated'))
      ok(`${ds.length} delivery attempt(s) for item ${short(MC.item_id)} — counts ${JSON.stringify(r.body.counts)}: ${lines.join('; ')}`);
    else bad(`the deliveries: ${lines.join('; ') || 'none'}`);
    const rc = inApp.find((d) => d.item_event === 'item.escalated') ?? inApp[0];
    if (rc) note(`an in_app RECEIPT (the channel's machine proof of placement): ${JSON.stringify(rc.receipt).slice(0, 300)}`);
    const mr = mail.find((d) => d.item_event === 'item.escalated') ?? mail[0];
    if (mr) note(`a demo-mailbox RECEIPT: ${JSON.stringify(mr.receipt).slice(0, 360)}`);
    const mb = await mailbox(brandt, { recipient: brandt.principalId, limit: 50 });
    const mine = mb.ok ? mb.body.messages.filter((m) => mail.some((d) => d.delivery_id === m.delivery_id)) : [];
    if (mb.ok && mb.body.synthetic === true && mine.length === mail.filter((d) => d.recipient === brandt.principalId).length && mine.length > 0)
      ok(`the SYNTHETIC mailbox read by L. Brandt: ${mine.length} message(s) of this item for them — ${mine.map((m) => `"${String(m.subject).slice(0, 110)}" body ${String(m.body_digest).slice(0, 12)}… at ${m.delivered_at}`).join('; ')}; the read says: "${mb.body.note}"`);
    else bad(`the mailbox: ${mb.ok ? `${mine.length} message(s) matched, synthetic ${mb.body.synthetic}` : refusalLine(mb)}`);
    const before = r.body.acknowledgement;
    if (before.acknowledged) note(`the item was already acknowledged (${before.acknowledged_at}) — an earlier run`);
    else {
      const a = await ack(brandt, MC.item_id, 'Received — the invalidated option is not the chosen one; I will check whether the monitored decision still stands.');
      if (!a.ok) fail('L. Brandt acknowledges the item', a);
    }
    const r2 = await deliveriesRead(brandt, MC.item_id);
    if (r2.ok) {
      const lastAttempt = r2.body.deliveries.map((d) => d.attempted_at).filter(Boolean).sort().at(-1);
      const acked = r2.body.acknowledgement;
      if (acked.acknowledged && r2.body.deliveries.length === ds.length && acked.acknowledged_at > lastAttempt)
        ok(`SIDE BY SIDE: the receipts (${r2.body.deliveries.length} delivered, the last placed at ${lastAttempt}) and the acknowledgement (by ${await loginOf(acked.acknowledged_by)} at ${acked.acknowledged_at}) — the acknowledgement added no delivery and changed no receipt; "${r2.body.note}"`);
      else bad(`side by side: acknowledgement ${JSON.stringify(acked)}, deliveries ${ds.length} → ${r2.body.deliveries.length}`);
    } else fail('the deliveries read after the acknowledgement', r2);
  }
  note('NOT DEMONSTRATED: email, SMS, Teams or push delivery — each needs a delivery provider (owner decision D6); the policy validator refuses those channels by name. demo-mailbox is a SYNTHETIC local sink in the database: nothing left it.');
} else note('no B24-1 item — the delivery scene is not staged');

/* ── B24-3 MATERIALITY ─────────────────────────────────────────────────────────────── */
console.log('\nB24-3 MATERIALITY — the further dimensions and the rank; the overload cap holds a C2 item while a C3 item is exempt; a closure frees capacity and the rebalance elevates');
let HELD = null;
{
  if (MC !== null) {
    const it = await itemRow(MC.item_id); const ev = it.evaluation ?? {}; const dm = ev.dimensions ?? {};
    const further = ['probability', 'exposure', 'strategic_relevance', 'information_value', 'irreversibility'];
    if (further.every((k) => k in dm) && dm.dimension_basis && ev.rank?.explanation)
      ok(`the C3 item's further dimensions: ${further.map((k) => `${k} ${dm[k] === null ? 'NULL' : JSON.stringify(dm[k])}`).join(', ')}; their bases ${JSON.stringify(dm.dimension_basis).slice(0, 520)}; the reasons: ${(ev.reasons ?? []).join('; ')}; the RANK: ${ev.rank.explanation} (${ev.rank.rule})`);
    else bad(`the further dimensions: ${JSON.stringify(dm).slice(0, 300)}; rank ${JSON.stringify(ev.rank ?? null).slice(0, 200)}`);
  }
  const pol = POLICY ?? await activePolicy();
  const dv = await deprioritized(dvorak);
  if (!dv.ok) fail('the deprioritized view (M. Dvořák)', dv);
  else {
    const waiting = dv.body.waiting;
    note(`the deprioritized view (M. Dvořák): overload rule ${JSON.stringify(dv.body.overload)}; ${waiting.length} WAITING for capacity, ${dv.body.below.length} below the thresholds or abstained on, ${dv.body.elevated.length} recent elevation(s)`);
    for (const w of waiting) note(`  waiting: ${w.signal_class} "${String(w.title).slice(0, 70)}" (owner ${await loginOf(w.owner_principal_id)}, consequence ${w.dimensions?.consequence}) — ${w.overload?.rule ?? JSON.stringify(w.overload)}; rank: ${w.rank?.explanation}`);
    // THE HELD ITEM the act frees: a waiting item whose owner is at the cap by exactly the items the closure can release — J. Weber's
    HELD = waiting.find((w) => w.owner_principal_id === weber.principalId && w.overload?.displaced_by) ?? null;
    const c2 = waiting.filter((w) => ['C0', 'C1', 'C2'].includes(w.dimensions?.consequence));
    const anyC3 = waiting.some((w) => ['C3', 'C4'].includes(w.dimensions?.consequence));
    if (c2.length > 0 && !anyC3 && c2.every((w) => w.overload?.cap === 1)) ok(`the OVERLOAD cap holds ${c2.length} lower-consequence item(s) (${c2.map((w) => `${w.signal_class} ${w.dimensions?.consequence} for ${NAME[w.owner_principal_id] ?? short(w.owner_principal_id)}: cap ${w.overload.cap}, open ${w.overload.open} within ${w.overload.window_hours} h, displaced by ${(w.overload.displaced_by ?? []).length} item(s)`).join('; ')}) — deprioritized, visible, with the overload explanation; NO C3/C4 item waits`);
    else if (c2.length === 0 && dv.body.elevated.some((e) => e.owner_principal_id === weber.principalId)) note('no item waits for capacity now — an earlier run elevated J. Weber\'s held item');
    else bad(`the waiting items: ${JSON.stringify(waiting.map((w) => ({ c: w.dimensions?.consequence, o: w.overload?.cap }))).slice(0, 300)}`);
    if (MC !== null) {
      const created = (await itemEvents(MC.item_id)).find((e) => e.event === 'item.routed') ?? null;
      const load = await ownerLoad(pol.rules, MC.owner_principal_id, MC.item_id);
      const exempt = await exemptOf(pol.rules, MC.evaluation?.dimensions ?? {});
      if (created !== null && exempt === true && !('overload' in (MC.evaluation ?? {}))) ok(`the C3 item was ROUTED (item.routed at ${iso(created.occurred_at)}) although L. Brandt holds ${load.open} other open or escalated item(s) against the cap ${load.cap}: executive.attention_overload_exempt(version ${pol.version}, its dimensions) = ${exempt} — C3 and C4 are never held for capacity`);
      else bad(`the C3 exemption: routed ${created !== null}, exempt ${exempt}, overload ${JSON.stringify(MC.evaluation?.overload ?? null)}`);
    }
  }
  if (HELD === null) note('J. Weber has no item waiting for capacity (an earlier run elevated it) — the closure and the rebalance are not staged again');
  else {
    const holding = (HELD.overload.displaced_by ?? []);
    const rows = holding.length === 0 ? [] : await q(`select ${ITEM_COLS} from executive.attention_items where item_id = any($1::uuid[]) and state in ('open','escalated') and owner_principal_id = $2`, [holding, weber.principalId]);
    note(`J. Weber's held item: "${String(HELD.title).slice(0, 80)}" — the capacity held by ${rows.map((r) => `${r.signal_class} "${String(r.title).slice(0, 60)}" (${r.state})`).join('; ') || 'nothing now'}`);
    for (const r of rows) {
      const c = await closeItem(weber, r.item_id, 'The review is convened and chaired; the queue item is done — the review itself carries the work from here.');
      if (c.ok) ok(`J. Weber CLOSED ${r.signal_class} item ${short(r.item_id)} — their capacity frees (the rule counts open and escalated items)`); else fail(`J. Weber closes ${short(r.item_id)}`, c);
    }
    const tR = await mark();
    const rb = await rebalance(dvorak);
    if (!rb.ok) fail('M. Dvořák rebalances', rb);
    const elevated = (await itemEvents(HELD.item_id)).filter((e) => e.event === 'item.elevated').at(-1) ?? null;
    const now = await itemRow(HELD.item_id);
    const byRoute = rb.ok && (rb.body.rebalance.elevated ?? []).some((e) => e.item_id === HELD.item_id);
    if (elevated !== null && ['open', 'escalated'].includes(now.state))
      ok(`ELEVATED by ${byRoute ? 'M. Dvořák\'s rebalance route' : `the ${elevated.actor === AGENT?.principal_id ? 'attention agent\'s tick (step rebalance) before the route' : await loginOf(elevated.actor)}`} at ${iso(elevated.occurred_at)}: item.elevated → ${elevated.details.to_state}, due ${elevated.details.due_at}, roles ${(elevated.details.route_roles ?? []).join('+')} — "${elevated.details.explanation}"${byRoute ? '' : `; the route found ${(rb.body?.rebalance?.elevated ?? []).length} more (a second call elevates nothing more)`}; still waiting: ${(rb.body?.rebalance?.waiting ?? []).length} (the owners still at the cap)`);
    else bad(`the elevation: route ${rb.ok ? JSON.stringify(rb.body.rebalance).slice(0, 300) : refusalLine(rb)}; item ${now.state}; event ${elevated === null ? 'NONE' : 'present'} (since ${iso(tR)})`);
  }
}

/* ── B24-4 GOVERNANCE ──────────────────────────────────────────────────────────────── */
console.log('\nB24-4 GOVERNANCE — a suppression a second person approves; an item delegated with a reason and a key');
{
  const pol = POLICY ?? await activePolicy();
  const prior = (await q(`select request_id::text, item_id::text, state, until, approved_until from executive.attention_suppression_requests where tenant_id = $1 and domain_id = $2 and requested_by = $3 and reason like 'B24:%' order by requested_at desc limit 1`, [T, D, eriksen.principalId]))[0] ?? null;
  const target = prior !== null ? await itemRow(prior.item_id)
    : (await q(`select ${ITEM_COLS} from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'forecast.unfit' and owner_principal_id = $3 and state in ('open','escalated','unrouted','acknowledged') and policy_version = $4 order by created_at desc limit 1`, [T, D, eriksen.principalId, pol.version]))[0] ?? null;
  if (prior !== null && prior.state !== 'pending') note(`an earlier run's request ${short(prior.request_id)} on item ${short(prior.item_id)} is ${prior.state}${prior.approved_until ? ` (until ${iso(prior.approved_until)})` : ''} — not requested again`);
  else if (target === null) note('N. Eriksen owns no live forecast.unfit item under the approval-required version — the suppression is not staged');
  else {
    const stateBefore = target.state;
    let requestId = prior?.request_id ?? null;
    if (requestId === null) {
      const until = new Date(Date.now() + 20 * 3600_000).toISOString();
      const r = await suppress(eriksen, target.item_id, until, 'B24: the ECB rate forecast is being re-issued this week; a day of quiet on this unfit item is requested.');
      if (!r.ok) fail('N. Eriksen requests the suppression', r);
      else {
        requestId = r.body.item.request_id;
        const after = await itemRow(target.item_id);
        if (r.body.item.approval_required === true && r.body.item.request_state === 'pending' && after.state === stateBefore && after.suppressed_until === null)
          ok(`N. Eriksen REQUESTED a suppression of "${String(target.title).slice(0, 70)}" until ${until}: request ${short(requestId)} pending, approver roles ${r.body.item.approver_roles.join(', ')} (policy version ${target.policy_version}) — the item STAYS LIVE (${after.state}, still escalating by its deadline)`);
        else bad(`the request: ${JSON.stringify(r.body.item).slice(0, 300)}; item ${after.state}`);
      }
    } else note(`an earlier run's request ${short(requestId)} is still pending`);
    if (requestId !== null) {
      const self = await decide(eriksen, requestId, 'approve', 'approving my own request, which the product must refuse');
      if (!self.ok && /separation of duties/.test(String(self.body?.message))) ok(`N. Eriksen approving their own request refused: ${refusalLine(self)}`); else bad(`the requester's own approval: ${refusalLine(self)}`);
      const h = await decide(hoffmann, requestId, 'approve', 'an analyst approving a suppression outside the approver roles');
      if (!h.ok && h.status === 403) ok(`A. Hoffmann (domain_analyst, not an approver role) refused: ${refusalLine(h)}`); else bad(`A. Hoffmann's approval: ${refusalLine(h)}`);
      const a = await decide(weber, requestId, 'approve', 'Agreed: the forecast is being re-issued; one quiet day is proportionate.');
      if (!a.ok) fail('J. Weber approves', a);
      else {
        const it = await itemRow(target.item_id); const req = a.body.request;
        if (req.state === 'approved' && it.state === 'suppressed' && iso(it.suppressed_until) !== null)
          ok(`J. Weber (strategy_owner) APPROVED request ${short(requestId)} — a second person: the item SUPPRESSED until ${req.approved_until} (requested ${req.until}; capped ${req.capped} at the decision instant + the class's ${req.max_hours} h); decided at ${req.decided_at}`);
        else bad(`the approval: ${JSON.stringify(req).slice(0, 300)}; item ${it.state}`);
      }
    }
  }
  const sl = await suppressionsList(weber, {});
  if (sl.ok) note(`the suppression requests (J. Weber's read): ${tally(sl.body.requests, 'state')}`); else fail('the requests list', sl);
}
{
  // THE DELEGATION: L. Brandt lends a live material-change item they own (not the B24-1 item when another stands) to J. Weber, who holds none of its roles.
  const KEY = 'b24-act:material-change-to-weber';
  const recorded = (await q(`select delegation_id::text, item_id::text, to_principal_id::text, reason, until_at, state from executive.attention_delegations where tenant_id = $1 and domain_id = $2 and from_principal_id = $3 and request_key = $4`, [T, D, brandt.principalId, KEY]))[0] ?? null;
  const target = recorded !== null ? await itemRow(recorded.item_id)
    : (await q(`select ${ITEM_COLS} from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'decision.material_change' and owner_principal_id = $3 and state in ('open','escalated','unrouted','acknowledged','suppressed')
                 order by (item_id = $4::uuid), created_at limit 1`, [T, D, brandt.principalId, MC?.item_id ?? null]))[0] ?? null;
  if (target === null) note('L. Brandt owns no live material-change item — the delegation is not staged');
  else {
    const payload = recorded !== null ? { to: recorded.to_principal_id, reason: recorded.reason, until: iso(recorded.until_at), request_key: KEY }
      : { to: weber.principalId, reason: 'B24: J. Weber chairs the review of this decision; they take the material change while I am travelling.', until: new Date(Date.now() + 48 * 3600_000).toISOString(), request_key: KEY };
    if (recorded === null && target.acknowledged_at === null) {
      const pre = await ack(weber, target.item_id, 'acknowledging an item I hold no role on');
      if (pre.status === 403) ok(`before the delegation, J. Weber's acknowledgement refused (not its owner, none of its roles ${target.route_roles.join('+')}): ${refusalLine(pre)}`); else bad(`J. Weber before the delegation: ${refusalLine(pre)}`);
    }
    const d = await delegate(brandt, target.item_id, payload);
    if (!d.ok) fail('L. Brandt delegates the item', d);
    else {
      const g = d.body.delegation;
      ok(`L. Brandt DELEGATED item ${short(target.item_id)} ("${String(target.title).slice(0, 60)}", ${target.state}) to ${await loginOf(g.to)} until ${g.until}${g.repeated ? ' (REPEATED — an earlier run recorded it)' : ''}: delegation ${short(g.delegation_id)}, owner stays accountable ${g.owner_stays_accountable} (owner ${await loginOf(g.owner)}), key ${g.request_key}, digest ${String(g.request_digest).slice(0, 12)}…`);
      const now = await itemRow(target.item_id);
      if (now.acknowledged_at === null) {
        const a = await ack(weber, target.item_id, 'Received as the delegate — the review I chair will take this change.');
        if (a.ok) ok(`J. Weber, the DELEGATE, acknowledged it (the delegation clause of executive.may_act_on_item): acknowledged by ${await loginOf((await itemRow(target.item_id)).acknowledged_by)}`); else fail('J. Weber acknowledges as the delegate', a);
      } else note(`the item stands acknowledged (by ${await loginOf(now.acknowledged_by)}) — an earlier run`);
      const d2 = await delegate(brandt, target.item_id, payload);
      if (d2.ok && d2.body.delegation.repeated === true && d2.body.delegation.delegation_id === g.delegation_id) ok(`the same key and delegation again → the RECORDED delegation ${short(d2.body.delegation.delegation_id)} (repeated true); no second row, no second event`);
      else bad(`the repeat: ${d2.ok ? JSON.stringify(d2.body.delegation).slice(0, 200) : refusalLine(d2)}`);
      if (AGENT !== null) {
        const ag = await delegate(brandt, target.item_id, { to: AGENT.principal_id, reason: 'B24: handing the item to the attention agent, which the product must refuse', until: new Date(Date.now() + 3600_000).toISOString(), request_key: `${KEY}:agent` });
        if (!ag.ok && /agent is never a delegate/.test(String(ag.body?.message))) ok(`a delegation to the attention AGENT refused: ${refusalLine(ag)}`); else bad(`the delegation to an agent: ${refusalLine(ag)}`);
      }
    }
  }
}

/* ── B24-5 EVALUATION ──────────────────────────────────────────────────────────────── */
console.log('\nB24-5 EVALUATION — dispositions recorded by the people who may act; the queue evaluated by M. Dvořák, the numbers as the record states them');
{
  const disp = [];
  if (MC !== null) disp.push([brandt, MC.item_id, 'actioned', 'B24: the material change was read and taken into the review; the decision stands for now.']);
  const weberClosed = (await q(`select item_id::text from executive.attention_items where tenant_id = $1 and domain_id = $2 and owner_principal_id = $3 and signal_class = 'review.convened' and state = 'closed' order by closed_at desc limit 1`, [T, D, weber.principalId]))[0] ?? null;
  if (weberClosed !== null) disp.push([weber, weberClosed.item_id, 'actioned', 'B24: the review was convened and chaired.']);
  const pw = (await q(`select item_id::text from executive.attention_items where tenant_id = $1 and domain_id = $2 and owner_principal_id = $3 and signal_class = 'forecast.unfit' and state = 'acknowledged' order by created_at limit 1`, [T, D, eriksen.principalId]))[0] ?? null;
  if (pw !== null) disp.push([eriksen, pw.item_id, 'not_material', 'B24: the 30-day chokepoint forecast was already superseded in use by the 90-day one; the unfit flag changed nothing.']);
  const pr = (await q(`select item_id::text from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'proposal.review' and state in ('open','acknowledged') order by created_at limit 1`, [T, D]))[0] ?? null;
  if (pr !== null) disp.push([ferreira, pr.item_id, 'not_material', 'B24: a restatement of a claim already reviewed; nothing to review.']);
  for (const [s, id, dsp, noteText] of disp) {
    const r = await disposition(s, id, { disposition: dsp, note: noteText });
    const it = await itemRow(id);
    if (r.ok) ok(`${await loginOf(s.principalId)} recorded ${dsp} on ${it.signal_class} item ${short(id)} (${it.state}, ${it.acknowledged_at ? 'acknowledged' : 'not acknowledged'})${r.body.disposition.repeated ? ' — REPEATED (an earlier run recorded the same)' : ''}`);
    else fail(`${await loginOf(s.principalId)} records ${dsp}`, r);
  }
  const ev = await evaluateQueue(dvorak, { min_sample: 3 });
  if (!ev.ok) fail('M. Dvořák evaluates the queue', ev);
  else {
    const e = ev.body.evaluation;
    const row = (await q(`select verdict, reason, measures, window_from, window_to, min_sample, evaluated_by::text from executive.attention_queue_evaluations where evaluation_id = $1`, [e.evaluation_id]))[0] ?? null;
    if (row !== null && row.verdict === e.verdict && row.evaluated_by === dvorak.principalId) {
      const m = row.measures; const fmt = (x) => (x.abstained ? `abstained (${x.reason})` : `${x.value} over ${x.sample}`);
      ok(`M. Dvořák EVALUATED the queue (evaluation ${short(e.evaluation_id)}, window ${iso(row.window_from)} → ${iso(row.window_to)}, min_sample ${row.min_sample}): verdict ${row.verdict} — "${row.reason}"`);
      note(`  overall: ${m.overall.items} item(s), true positive ${m.overall.true_positive}, false positive ${m.overall.false_positive}, missed ${m.overall.missed}, late ${m.overall.late}, undisposed ${m.overall.undisposed}; precision ${fmt(m.overall.precision)}; recall ${fmt(m.overall.recall)}`);
      for (const [c, x] of Object.entries(m.classes)) note(`  ${c}: ${x.items} item(s), tp ${x.true_positive} fp ${x.false_positive} missed ${x.missed}; precision ${fmt(x.precision)}; recall ${fmt(x.recall)}`);
      note(`  ranking stability: ${m.ranking_stability.abstained ? `abstained — ${m.ranking_stability.reason}` : `${m.ranking_stability.method} ${m.ranking_stability.value} over ${m.ranking_stability.ranked} ranked item(s) (concordant ${m.ranking_stability.concordant}, discordant ${m.ranking_stability.discordant})`}`);
      note(`  severe (C3/C4): ${m.severe.items} item(s), routed ${m.severe.routed}, acknowledged ${m.severe.acknowledged} (${m.severe.acknowledged_before_deadline} before the first deadline), never held for overload ${m.severe.never_overload_deprioritized}, time to acknowledge ${JSON.stringify(m.severe.time_to_acknowledge_seconds)} s, delivered before the deadline ${JSON.stringify(m.severe.delivered_before_deadline)}; breaches ${m.severe.breaches.length}${m.severe.breaches.length ? ` (${m.severe.breaches.map((b) => `${b.signal_class} ${b.breach}`).join(', ')})` : ''}`);
      note(`  escalation latency: ${m.escalation_latency.abstained ? `abstained — ${m.escalation_latency.reason}` : `${m.escalation_latency.escalations} escalation(s), p50 ${m.escalation_latency.p50_seconds} s, p90 ${m.escalation_latency.p90_seconds} s, max ${m.escalation_latency.max_seconds} s after the missed deadline`}`);
    } else bad(`the evaluation record: ${JSON.stringify({ answer: e.verdict, row: row?.verdict, by: row?.evaluated_by }).slice(0, 200)}`);
    const other = await evaluateQueue(weber, {});
    if (other.status === 403) ok(`J. Weber (strategy_owner) refused — the queue is evaluated by an executive or an administrator: ${refusalLine(other)}`); else bad(`J. Weber's evaluation: ${refusalLine(other)}`);
  }
}

/* ── B24-6 MARKERS ─────────────────────────────────────────────────────────────────── */
console.log('\nB24-6 MARKERS — a suspended source constrains what rests on it: the commitment until acknowledged for its version; a run on its scenario refused; reactivated, cleared');
let SRC = null; let SERIES = null;
let F90 = null; let SCN24 = null; let BRANCH24 = null; let TW = null; let TV = null; let CONTROL = null; let REROUTE = null; let PKG24 = null;
{
  // (a) THE FORECAST at 90 days on a source's series — the corridor forecast's first (the PortWatch chokepoints source, the B22 precedent), else
  // the B18 corridor decision's (the ECB reference rate). The existing 30-day forecasts of both series are assessed UNFIT: a scenario on one fails
  // coherence and a run on it is refused for THAT before the source gate is reached — so a new 90-day forecast is issued (a new horizon
  // supersedes nothing). A series whose history the reader cannot read whole (governed-deleted evidence) is refused by the port: said, and the
  // next candidate taken.
  const CANDIDATES = [{ series: 'portwatch:chokepoint4:n_total', source: 'imf-portwatch-chokepoints', asu: '%corridor stays open%' }, { series: 'ecb-eurusd', source: 'ecb-eurusd', asu: '%EUR/USD stays within%' }];
  const standing = (await q(`select forecast_id::text, series_key, validation_state, fitness_state from prediction.forecasts_current where tenant_id = $1 and domain_id = $2 and series_key = any($3::text[]) and horizon_code = '90d' and state = 'issued' and issued_by = $4 order by issued_at desc limit 1`,
    [T, D, CANDIDATES.map((c) => c.series), eriksen.principalId]))[0] ?? null;
  if (standing !== null) { F90 = standing; SERIES = standing.series_key; note(`the 90-day ${SERIES} forecast ${short(F90.forecast_id)} stands (${F90.validation_state}, fitness ${F90.fitness_state}) — an earlier run`); }
  else {
    for (const c of CANDIDATES) {
      const asu = (await q(`select strategy_object_id::text from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and status = 'active' and title ilike $3 limit 1`, [T, D, c.asu]))[0] ?? null;
      if (asu === null) { note(`no active assumption for ${c.series} — not issued`); continue; }
      const r = await call(`${P}/forecasts/issue`, ne({ action: 'prediction.forecast.issue', objectType: 'FCT' }), { seriesKey: c.series, horizon: '90d', assumptions: [asu.strategy_object_id], refreshCadence: 'weekly', label: 'live' }, eriksen.token);
      if (!r.ok) { note(`N. Eriksen's 90-day forecast on ${c.series} REFUSED by the port: ${refusalLine(r)} — the next candidate`); continue; }
      F90 = (await q(`select forecast_id::text, series_key, validation_state, fitness_state from prediction.forecasts_current where forecast_id = $1`, [r.body.forecast.forecastId]))[0]; SERIES = c.series;
      ok(`N. Eriksen ISSUED ${SERIES} at 90 days: forecast ${short(F90.forecast_id)} [${F90.validation_state}], resting on its assumption; superseded ${r.body.forecast.supersededForecastId ?? 'nothing'}`);
      break;
    }
    if (F90 === null) bad('no 90-day forecast could be issued on either candidate series — the chain is not built');
  }
  if (SERIES !== null) {
    const key = CANDIDATES.find((c) => c.series === SERIES).source;
    SRC = (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state, name, source_key from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 order by source_id, contract_version desc`, [T, D, key]))[0] ?? null;
    note(`the source the chain rests on: "${SRC?.name ?? key}" (${SRC?.lifecycle_state ?? 'absent'})`);
  }
  // (b) THE SCENARIO on it: one baseline branch.
  if (F90 !== null) {
    SCN24 = (await q(`select scenario_id::text, current_version, coherence_state, declared_at from prediction.scenarios_current where tenant_id = $1 and domain_id = $2 and forecast_id = $3 and title = $4 and state = 'active' limit 1`, [T, D, F90.forecast_id, SCN24_TITLE]))[0] ?? null;
    if (SCN24 !== null) note(`the scenario ${short(SCN24.scenario_id)} stands (coherence ${SCN24.coherence_state}) — an earlier run`);
    else {
      const r = await call(`${P}/scenarios/declare`, ne({ action: 'prediction.scenario.declare', objectType: 'SCN' }), { title: SCN24_TITLE, statement: `what ${SERIES} does over the forecast horizon, for the second-source decision (the B24 demonstration; synthetic)`, forecastId: F90.forecast_id, owner: eriksen.principalId, reviewCadence: 'weekly',
        branches: [{ name: 'Baseline', kind: 'baseline', statement: 'the series follows the forecast; the booked routing holds', owner: eriksen.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 }] }, eriksen.token);
      if (!r.ok) fail('N. Eriksen declares the scenario', r);
      else { SCN24 = (await q(`select scenario_id::text, current_version, coherence_state, declared_at from prediction.scenarios_current where scenario_id = $1`, [r.body.scenario.scenarioId]))[0]; ok(`N. Eriksen DECLARED the scenario ${short(SCN24.scenario_id)} "${SCN24_TITLE}" on the forecast (baseline branch; coherence ${SCN24.coherence_state})`); }
    }
    if (SCN24 !== null) BRANCH24 = (await q(`select branch_id::text from prediction.branches_current where scenario_id = $1 and kind = 'baseline' limit 1`, [SCN24.scenario_id]))[0]?.branch_id ?? null;
  }
  // (c) THE TWIN VERSION: a run binds the scenario as it stood at the twin version's known_at — the current version was recorded before the
  // scenario, so T. Nakamura opens a new one carried from it (the same world cut-off) and admits it.
  if (SCN24 !== null) {
    const tw = (await q(`select twin_id::text from twin.twins_current where tenant_id = $1 and domain_id = $2 and title like 'NORDWERK%' and title not like '%mirror%' limit 1`, [T, D]))[0] ?? null;
    TW = tw?.twin_id ?? null;
    const cur = TW === null ? null : (await q(`select version, known_at, observed_through::text ot from twin.twin_versions where twin_id = $1 and state = 'admitted' order by version desc limit 1`, [TW]))[0] ?? null;
    if (cur === null) note('the NORDWERK twin has no admitted version — the runs are not staged');
    else if (new Date(cur.known_at) > new Date(SCN24.declared_at)) { TV = Number(cur.version); note(`the twin's admitted version ${TV} was recorded after the scenario (known at ${iso(cur.known_at)}) — an earlier run`); }
    else {
      // the carried version's fx element cites the B18 90-day forecast, WITHDRAWN as unfit: a run resting on it cannot be a package's consequence
      // (the option port refuses it) — so the element is left out, and grounded anew on the new forecast when the chain rests on the rate series.
      const o = await call(`${W}/${TW}/versions/open`, tn({ action: 'twin.version', objectType: 'TWN', objectId: TW }), { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: cur.ot, carryFrom: Number(cur.version), except: ['context.fx_forecast'] }, nakamura.token);
      if (!o.ok) fail('T. Nakamura opens a twin version', o);
      else {
        const v = o.body.version.version;
        if (SERIES === 'ecb-eurusd') {
          const g = await call(`${W}/${TW}/versions/${v}/ground`, tn({ action: 'twin.ground', objectType: 'TWN', objectId: TW }), { elements: [{ key: 'context.fx_forecast', kind: 'predicted', value: { horizon: '90d', forecast_id: F90.forecast_id }, citations: [{ kind: 'forecast', id: F90.forecast_id }] }] }, nakamura.token);
          if (!g.ok) fail('T. Nakamura grounds the fx element on the new forecast', g);
        }
        const a = await call(`${W}/${TW}/versions/${v}/admit`, tn({ action: 'twin.version.admit', objectType: 'TWN', objectId: TW }), { allowIncomplete: true }, nakamura.token);
        if (!a.ok) fail('T. Nakamura admits the twin version', a);
        else { TV = v; ok(`T. Nakamura OPENED twin version ${v} (carried from ${cur.version}, observed through ${cur.ot}; the fx element citing the withdrawn B18 forecast left out${SERIES === 'ecb-eurusd' ? ', grounded anew on the 90-day forecast' : ''}) and ADMITTED it (${a.body.admitted.completeness}) — recorded after the scenario, so a run may bind it`); }
      }
    }
  }
  // (d) THE RUNS on the scenario's baseline branch: a control and a reroute on it.
  if (TV !== null && BRANCH24 !== null) {
    const existing = await q(`select run_id::text, run_kind, control_run_id::text from simulation.runs_current where scenario_id = $1 and state = 'completed' and validity = 'valid' order by opened_at`, [SCN24.scenario_id]);
    CONTROL = existing.find((r) => r.run_kind === 'control')?.run_id ?? null;
    REROUTE = existing.find((r) => r.run_kind === 'intervention' && r.control_run_id === CONTROL)?.run_id ?? null;
    const base = { twinId: TW, twinVersion: TV, component: 'SYN-PART-MAG', horizonDays: 90, stochastic: { mode: 'deterministic' }, scenarioId: SCN24.scenario_id, scenarioBranchId: BRANCH24, shock: false };
    if (CONTROL === null) {
      const r = await simRun(nakamura, { ...base, runKind: 'control', controlRunId: null, interventions: [{ type: 'none' }] });
      if (!r.ok) fail('T. Nakamura runs the control', r); else { CONTROL = r.body.run.runId; ok(`T. Nakamura ran the CONTROL ${short(CONTROL)} on the scenario's baseline branch: ${r.body.run.state}, ${r.body.run.totals?.line_stop_days} line-stop day(s) — SYNTHETIC`); }
    }
    if (CONTROL !== null && REROUTE === null) {
      const r = await simRun(nakamura, { ...base, runKind: 'intervention', controlRunId: CONTROL, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] });
      if (!r.ok) fail('T. Nakamura runs the reroute', r); else { REROUTE = r.body.run.runId; ok(`T. Nakamura ran the REROUTE ${short(REROUTE)} on the control: ${r.body.run.state}, ${r.body.run.totals?.line_stop_days} line-stop day(s) — SYNTHETIC`); }
    }
    if (existing.length > 0 && CONTROL !== null && REROUTE !== null) note(`the scenario's runs stand: control ${short(CONTROL)}, reroute ${short(REROUTE)} — an earlier run`);
  }
  // (e) THE ACT-OWNED PACKAGE: declared on the demo DEC by L. Brandt, citing the control, the reroute and the forecast; approved by S. Okafor.
  const dec = (await q(`select decision_object_id::text from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'January corridor collapse — Regensburg line' limit 1`, [T, D]))[0]?.decision_object_id ?? null;
  const obj = (await q(`select strategy_object_id::text from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title ilike '%Regensburg line supplied%' limit 1`, [T, D]))[0]?.strategy_object_id ?? null;
  PKG24 = (await q(`select package_id::text, state, current_version, committed_version from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, PKG24_TITLE]))[0] ?? null;
  if (PKG24 !== null) note(`the act-owned package ${short(PKG24.package_id)} stands (${PKG24.state}, version ${PKG24.current_version}) — an earlier run`);
  else if (dec === null || obj === null || CONTROL === null || REROUTE === null || F90 === null) note(`the demo DEC (${dec === null ? 'absent' : 'found'}), the objective (${obj === null ? 'absent' : 'found'}) or the runs are missing — the package is not declared`);
  else {
    const d = await call(`${DC}/declare`, lb({ action: 'decision.package.declare', objectType: 'DPK' }), { decisionObjectId: dec, title: PKG24_TITLE, statement: 'whether to qualify the second magnet source now, on the 90-day forecast and the reroute runs (the B24 demonstration; synthetic)', owner: brandt.principalId }, brandt.token);
    if (!d.ok) fail('L. Brandt declares the package', d);
    else {
      const id = d.body.package.packageId;
      const o = await call(`${DC}/${id}/versions/open`, lb({ action: 'decision.package.version', objectType: 'DPK', objectId: id }), { knownAt: new Date().toISOString(), observedThrough: null }, brandt.token);
      const v1 = o.ok ? o.body.version.version : null;
      const steps = v1 === null ? [o] : [
        await call(`${DC}/${id}/versions/${v1}/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: id }), { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: CONTROL, version: 1 }], risks: [], opportunities: [] }, brandt.token),
        await call(`${DC}/${id}/versions/${v1}/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: id }), { key: 'second-source', title: 'Qualify the second source and reroute', kind: 'intervention', consequences: [{ kind: 'run', id: REROUTE, version: 1 }, { kind: 'forecast', id: F90.forecast_id, version: 1 }], risks: ['the qualification takes six weeks'], opportunities: [] }, brandt.token),
        await call(`${DC}/${id}/versions/${v1}/terms`, lb({ action: 'decision.package.terms', objectType: 'DPK', objectId: id }), { objectives: [obj], constraints: ['no air freight above 60 t/week'], approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 },
          monitoringConditions: [{ kind: 'review', every_days: 7, owner: brandt.principalId }], reversibility: 'the qualification is reversible until the first order is placed', informationValue: 'a week of observation would not change the ranking of the options' }, brandt.token),
        await call(`${DC}/${id}/versions/${v1}/choice`, lb({ action: 'decision.package.choice', objectType: 'DPK', objectId: id }), { option_key: 'second-source', rationale: 'The 90-day forecast gives no early relief on the corridor; a second source removes the single point of failure.', decision_deadline: '2024-01-26',
          accepted_trade_offs: ['six weeks of qualification cost'], action_owner: nakamura.principalId,
          outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: TW, period: { from: '2024-01-11', to: '2024-04-10' } }] }, brandt.token),
      ];
      const bad1 = steps.find((x) => !x.ok);
      if (bad1) fail('the draft (L. Brandt)', bad1);
      else {
        const pr = await call(`${DC}/${id}/versions/${v1}/propose`, lb({ action: 'decision.package.propose', objectType: 'DPK', objectId: id }), {}, brandt.token);
        if (!pr.ok) fail('L. Brandt proposes', pr);
        else {
          const digest = pr.body.proposal.versionDigest;
          const ap = await call(`${DC}/${id}/versions/${v1}/approve`, so({ action: 'decision.approve', objectType: 'APR' }), { decision: 'approve', versionDigest: digest, rationale: 'The second source removes the single point of failure; the forecast supports it.' }, okafor.token);
          if (!ap.ok) fail('S. Okafor approves', ap);
          else ok(`L. Brandt DECLARED the act-owned package ${short(id)} on the demo DEC (status-quo: the control ${short(CONTROL)}; second-source: the reroute ${short(REROUTE)} + the forecast ${short(F90.forecast_id)}), PROPOSED version ${v1} (digest ${digest.slice(0, 12)}…); S. Okafor APPROVED it (${ap.body.approval.state})`);
        }
      }
      PKG24 = (await q(`select package_id::text, state, current_version, committed_version from decision.packages_current where package_id = $1`, [id]))[0];
    }
  }
}
if (SRC === null || SRC.lifecycle_state !== 'active') note(`the source the chain rests on is ${SRC?.lifecycle_state ?? 'absent'} — the suspension is not staged`);
else {
  const t6 = await mark();
  const s = await transition(dvorak, SRC.source_id, Number(SRC.contract_version), 'suspended', `${B24_REASON}: the source is suspended to show what rests on it constrained, then reactivated.`);
  if (!s.ok) fail('M. Dvořák suspends the source', s);
  else {
    ok(`M. Dvořák SUSPENDED "${SRC.name}" (contract version ${SRC.contract_version})`);
    const ev = await waitOutbox('SourceHealthChanged', (x) => x.source_id === SRC.source_id && x.state === 'suspended', t6);
    const d = ev === null ? null : (await settled(ev.id, ['source-health'])).find((x) => x.consumer_kind === 'source-health') ?? null;
    const marks = ev === null ? [] : await q(`select marker_id::text, subject_kind, subject_id::text, health_state from observation.source_impact_markers where source_id = $1 and set_by_event = $2 order by subject_kind`, [SRC.source_id, ev.id]);
    const kinds = new Set(marks.map((m) => m.subject_kind));
    const reach = ['forecast', 'scenario', 'run', 'package'].filter((k) => !kinds.has(k));
    if (d?.state === 'applied' && reach.length === 0) ok(`SourceHealthChanged (${short(ev.id)}) → the source-health subscriber (${effects(d)}): ${marks.length} MARKER(S) — ${tally(marks, 'subject_kind')}: ${marks.map((m) => `${m.subject_kind} ${short(m.subject_id)}`).join(', ')}`);
    else bad(`the markers: delivery ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}; set ${tally(marks, 'subject_kind')}; not reached: ${reach.join(', ') || 'none'}`);
    const loss = (await itemsOf('source.coverage_loss', SRC.source_id)).filter((x) => new Date(x.created_at) >= t6).at(-1) ?? null;
    if (loss !== null) note(`the coverage loss routed: "${String(loss.title).slice(0, 80)}" → ${loss.state}, roles ${loss.route_roles.join('+')}`);
    if (PKG24 !== null) {
      const v = Number(PKG24.committed_version ?? PKG24.current_version);
      const br = await markersRead(brandt, { packageId: PKG24.package_id, version: v });
      const bearing = br.ok ? (br.body.package?.markers ?? []) : [];
      if (br.ok) note(`the markers bearing on version ${v} of the act-owned package (L. Brandt's read): ${bearing.map((b) => `${b.subject_kind} ${short(b.subject_id)} ${b.health_state}${b.acknowledged ? ' (acknowledged)' : ''}`).join(', ') || 'none'}${br.body.package?.gate ? ` — ${JSON.stringify(br.body.package.gate).slice(0, 160)}` : ''}`);
      else fail('the markers read (L. Brandt)', br);
      if (PKG24.state === 'committed' || PKG24.committed_version !== null) note(`the act-owned package was committed by an earlier run (version ${PKG24.committed_version}) — the commitment is not attempted again`);
      else {
        const vr = (await q(`select version_digest from decision.package_versions where package_id = $1 and version = $2`, [PKG24.package_id, v]))[0];
        const c1 = await call(`${DC}/${PKG24.package_id}/versions/${v}/commit`, lb({ action: 'decision.commit', objectType: 'CMT' }), { versionDigest: vr.version_digest }, brandt.token);
        if (!c1.ok && /source_impact/.test(String(c1.body?.message))) ok(`L. Brandt's COMMITMENT of version ${v} REFUSED while the markers stand unacknowledged: ${refusalLine(c1)}`);
        else bad(`the commitment on a suspended source: ${c1.ok ? 'COMMITTED' : refusalLine(c1)}`);
        const ids = bearing.filter((b) => !b.acknowledged).map((b) => b.marker_id);
        const a = await ackImpact(brandt, PKG24.package_id, { version: v, markerIds: ids, reason: 'B24: the second source is qualified on the forecast as issued; a suspended feed for an hour does not change the decision.' });
        if (!a.ok) fail('L. Brandt acknowledges the source impact', a);
        else {
          const k = a.body.acknowledgement;
          ok(`L. Brandt (decision_authority) ACKNOWLEDGED ${k.acknowledged.length} marker(s) for version ${k.version} (event ${short(k.acknowledgement_id)}; outstanding ${k.outstanding.length}) — "${k.reason}"`);
          const c2 = await call(`${DC}/${PKG24.package_id}/versions/${v}/commit`, lb({ action: 'decision.commit', objectType: 'CMT' }), { versionDigest: vr.version_digest }, brandt.token);
          if (c2.ok) ok(`the same commitment NOW admitted: L. Brandt COMMITTED version ${v} (commitment ${short(c2.body.commitment.commitmentId)}, ${c2.body.commitment.opClass}, decided at ${c2.body.commitment.decidedAt}) — the record says who answered for the degraded source`);
          else fail('L. Brandt commits after the acknowledgement', c2);
        }
      }
    }
    const coherence = SCN24 === null ? null : (await q(`select coherence_state from prediction.scenarios_current where scenario_id = $1`, [SCN24.scenario_id]))[0]?.coherence_state ?? null;
    if (coherence === 'failed') note(`the scenario has FAILED its coherence since an earlier run (its forecast was assessed unfit after that run's reactivation brought new rates) — a run on it is refused for THAT before the source gate is read; the source gate was shown by the earlier run, not staged again`);
    else if (TV !== null && BRANCH24 !== null) {
      const rr = await simRun(nakamura, { twinId: TW, twinVersion: TV, component: 'SYN-PART-MAG', horizonDays: 90, stochastic: { mode: 'deterministic' }, scenarioId: SCN24.scenario_id, scenarioBranchId: BRANCH24, shock: false, runKind: 'control', controlRunId: null, interventions: [{ type: 'none' }] });
      if (!rr.ok && /source_impact/.test(String(rr.body?.message))) ok(`T. Nakamura's run on the scenario REFUSED while its source is suspended: ${refusalLine(rr)}`);
      else bad(`the run on a suspended source: ${rr.ok ? `ADMITTED ${short(rr.body.run.runId)}` : refusalLine(rr)}`);
    }
    if (loss !== null && ['open', 'escalated'].includes(loss.state)) { const a = await ack(dvorak, loss.item_id, 'Suspended on purpose for the demonstration; reactivating now.'); if (!a.ok) fail('M. Dvořák acknowledges the coverage loss', a); }
    const t6b = await mark();
    const r = await transition(dvorak, SRC.source_id, Number(SRC.contract_version), 'active', `${B24_REASON}: the source reactivated after the suspension.`);
    if (!r.ok) fail('M. Dvořák reactivates the source', r);
    else {
      const ev2 = await waitOutbox('SourceHealthChanged', (x) => x.source_id === SRC.source_id && x.state === 'active', t6b);
      const d2 = ev2 === null ? null : (await settled(ev2.id, ['source-health'])).find((x) => x.consumer_kind === 'source-health') ?? null;
      const cleared = ev2 === null ? [] : await q(`select subject_kind from observation.source_impact_markers where source_id = $1 and cleared_by_event = $2`, [SRC.source_id, ev2.id]);
      const still = (await q(`select count(*)::int n from observation.source_impact_markers where source_id = $1 and state = 'active'`, [SRC.source_id]))[0].n;
      if (d2?.state === 'applied' && cleared.length >= marks.length && still === 0) ok(`M. Dvořák REACTIVATED the source → SourceHealthChanged (${short(ev2.id)}): ${cleared.length} marker(s) CLEARED (${tally(cleared, 'subject_kind')}); none active`);
      else bad(`the reactivation: delivery ${d2?.state ?? 'NONE'}, cleared ${cleared.length} of ${marks.length}, still active ${still}`);
    }
  }
}

/* ── B24-7 PLAN ────────────────────────────────────────────────────────────────────── */
console.log('\nB24-7 PLAN — an upload recorded; the plan selected; one execution per method; run by the plan worker under the extraction agent');
{
  const src = (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'nordwerk-internal' order by source_id, contract_version desc`, [T, D]))[0] ?? null;
  const FILE = 'shipments-2024Q1-b24-update.csv';
  const csv = ['synthetic,shipment_id,component_id,qty,vessel,position_at_window_open,eta_rotterdam,status',
    'true,SYN-SHIP-4481,SYN-PART-BRG,22000,MV Hanse Meridian,Approaching Bab el-Mandeb,2024-02-02,at risk',
    'true,SYN-SHIP-4482,SYN-PART-HSG,9600,not yet loaded,Ningbo,2024-02-26,bookable', ''].join('\n');
  const bytes = Buffer.from(csv, 'utf8');
  if (src === null || src.lifecycle_state !== 'active') note('the NORDWERK internal upload source is not active — the plan scene is not staged');
  else {
    const t7 = await mark();
    const up = await upload(hoffmann, { sourceId: src.source_id, contractVersion: Number(src.contract_version), files: [{ filename: FILE, mediaType: 'text/csv; charset=utf-8', base64: bytes.toString('base64'), documentTime: null }] });
    if (!up.ok) fail('A. Hoffmann uploads the shipment record', up);
    else {
      const run = up.body.run;
      note(`A. Hoffmann UPLOADED "${FILE}" (a SYNTHETIC shipment record, ${bytes.length} bytes) to the NORDWERK internal source: run ${short(run?.runId)} ${run?.state} — ${run?.admitted} admitted, ${run?.noop} unchanged, ${run?.quarantined} quarantined`);
      // the evidence of these bytes, by their digest (a repeat of the same bytes is an unchanged no-op — an earlier run's evidence is read); the
      // REPLAY FIXTURE for it recorded AT ONCE, before the observations subscriber can queue the execution and the drain (every 60 s) take it —
      // hand-written by the Phase 3 method's own builder, stored recorded_from 'fixture' (no model runs here); its key names the evidence's locator,
      // which the upload assigns, so it cannot be recorded before the upload.
      const digest = createHash('sha256').update(bytes).digest('hex');
      const evd = (await q(`select object_id::text, object_version::int v, payload ->> 'locator' locator, payload ->> 'content_digest' digest from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and payload ->> 'content_digest' = $3 order by object_version desc limit 1`, [T, D, digest]))[0] ?? null;
      if (evd === null) bad(`no evidence object carries the upload's digest ${digest.slice(0, 12)}…`);
      else {
        const fx = supplyFixtures([{ itemKey: evd.locator, contentDigest: evd.digest, excerpt: bytes.toString('utf8').slice(0, 8000) }]);
        const rec = await gatewayRecord(ferreira, fx.map((f) => ({ requestDigest: f.request_digest, response: f.response, modelId: f.model_id, runtimeVersion: f.runtime_version })));
        if (rec.ok) note(`L. Ferreira RECORDED the replay fixture for evidence ${short(evd.object_id)}@${evd.v} (${rec.body.recordings.stored} stored, ${rec.body.recordings.existing} already present; ${(fx[0].response.claims ?? []).length} claim(s) in it) — written by hand by the method's fixture builder (scripts/phase3/build-graph-fixtures.mjs), stored recorded_from 'fixture': no model ran`);
        else fail('L. Ferreira records the fixture', rec);
        let sel = null;
        for (let i = 0; i < 90 && sel === null; i += 1) { sel = (await q(`select selection_id::text, outcome, methods, reason, outbox_event_id::text from intelligence.plan_selections where evd_object_id = $1 order by selected_at desc limit 1`, [evd.object_id]))[0] ?? null; if (sel === null) await sleep(1000); }
        const evRec = sel === null ? null : (await q(`select id::text, event_type from objects.object_outbox where id = $1`, [sel.outbox_event_id]))[0] ?? null;
        if (sel !== null && sel.outcome === 'selected') ok(`${evRec?.event_type ?? 'ObservationRecorded'} (${short(sel.outbox_event_id)}) for evidence ${short(evd.object_id)}@${evd.v} → the observations subscriber SELECTED the plan: ${sel.methods.map((m) => `${m.method_key}@${m.method_version}`).join(', ')} — "${sel.reason}"`);
        else bad(`the plan selection: ${sel === null ? 'none recorded' : `${sel.outcome} — ${sel.reason}`}`);
        const execs = await q(`select execution_id::text, method_key, method_version, state from intelligence.plan_executions where evd_object_id = $1 order by queued_at`, [evd.object_id]);
        if (sel !== null && execs.length === (sel.methods ?? []).length && execs.length > 0) ok(`ONE execution per selected method, queued in the delivery's transaction: ${execs.map((x) => `${short(x.execution_id)} ${x.method_key}@${x.method_version} ${x.state}`).join('; ')}`);
        else bad(`the executions: ${execs.length} for ${(sel?.methods ?? []).length} method(s)`);
        let done = [];
        for (let i = 0; i < 240; i += 1) { done = await q(`select x.execution_id::text, x.method_key, x.state, x.run_id::text, x.agent_id::text, x.principal_id::text, x.attempts, x.last_error, x.outcome, x.finished_at from intelligence.plan_executions x where x.evd_object_id = $1 order by queued_at`, [evd.object_id]); if (done.length > 0 && done.every((x) => ['done', 'refused'].includes(x.state) || (x.state === 'failed' && x.attempts >= Number(XAGENT?.budgets?.max_attempts ?? 3)))) break; await sleep(1000); }
        for (const x of done) {
          const r = x.run_id === null ? null : (await q(`select state, mode, claims_admitted, abstentions, evidence_read, failure_reason, agent_principal_id::text from intelligence.runs_current where run_id = $1`, [x.run_id]))[0] ?? null;
          if (x.state === 'done' && r !== null && XAGENT !== null && x.agent_id === XAGENT.agent_id && r.agent_principal_id === XAGENT.principal_id && r.claims_admitted > 0)
            ok(`execution ${short(x.execution_id)} DONE by the plan worker under the extraction agent ${short(x.agent_id)} (principal ${short(x.principal_id)}; attempt ${x.attempts}): extraction run ${short(x.run_id)} ${r.state}, mode ${r.mode}, ${r.evidence_read} evidence read, ${r.claims_admitted} claim(s) admitted, ${r.abstentions} abstention(s) — ${JSON.stringify(x.outcome).slice(0, 200)}`);
          else bad(`execution ${short(x.execution_id)}: ${x.state} (attempts ${x.attempts}) ${x.last_error ?? ''} run ${r === null ? 'none' : `${r.state}, ${r.claims_admitted} claim(s) ${r.failure_reason ?? ''}`}${r !== null && r.claims_admitted === 0 ? ' — a replay miss: the drain took the execution before the fixture was recorded (the unit fails, the run completes with nothing)' : ''}`);
        }
        const ps = await planStatus(ferreira, { evdObjectId: evd.object_id });
        if (ps.ok) note(`the plan status (L. Ferreira's read): agent ${short(ps.body.agent?.agent_id)} ${ps.body.agent?.status ?? 'none'}; the domain's executions ${JSON.stringify(ps.body.counts)}; ${ps.body.note ?? 'no waiting note'}`); else fail('the plan status', ps);
      }
    }
  }
}

/* ── B24-8 B23-F1 ON THE DEMO ──────────────────────────────────────────────────────── */
console.log(`\nB24-8 B23-F1 — a context answer counts and mentions only what its reader may see; served from the log, it says so`);
{
  const subject = (await q(`select entity_id::text, canonical_name from graph.entities_current where tenant_id = $1 and domain_id = $2 and entity_type = 'place' and lifecycle_state = 'active' and canonical_name ilike 'Cape of Good Hope%' order by created_at limit 1`, [T, D]))[0] ?? null;
  if (subject === null) note('the Cape corridor entity is absent — the scene is skipped');
  else {
    const TITLE = 'B24: the second-source qualification notes (knowledge owners only)';
    let itemId = (await q(`select item_id::text from memory.items_current where tenant_id = $1 and domain_id = $2 and title = $3 and state = 'active' limit 1`, [T, D, TITLE]))[0]?.item_id ?? null;
    if (itemId !== null) note(`K. Müller's restricted item ${short(itemId)} is recorded — an earlier run`);
    else {
      const r = await recordMemory(mueller, {
        recordClass: 'strategic', title: TITLE,
        statement: `B24: the second source for the magnet sets was qualified against the ${subject.canonical_name} routing; the qualification terms are held by the knowledge owners.`,
        source: { kind: 'human', ref: 'sourcing review, B24 act' },
        audience: { classification: 'internal', roles: ['knowledge_owner'], purposes: [PURPOSE] },
        validity: { from: '2024-01-20T00:00:00Z', to: null },
        retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-20T00:00:00Z', basis: 'the decision record retention schedule' },
        cites: [{ kind: 'entity', id: subject.entity_id, version: null, rationale: 'the corridor the qualification rests on' }],
        related: { decisionId: null, objectiveId: null },
      });
      if (!r.ok) fail('K. Müller records the restricted item', r);
      else { itemId = r.body.memory.itemId; ok(`K. Müller RECORDED memory item ${short(itemId)} "${TITLE}" — audience roles knowledge_owner only, purpose '${PURPOSE}', citing the ${subject.canonical_name}`); }
    }
    if (itemId !== null) {
      const subj = { kind: 'entity', id: subject.entity_id };
      const silent = (c) => !JSON.stringify(c).includes(itemId) && !JSON.stringify(c).includes(TITLE) && !(c.omitted ?? []).some((o) => o.projection === 'content_tier');
      let h1 = null;
      for (let i = 0; i < 20; i += 1) { h1 = await context(hoffmann, PURPOSE, subj); if (!h1.ok || h1.body.context.product_state === 'complete') break; await sleep(1500); }
      if (h1.ok && silent(h1.body.context)) ok(`A. Hoffmann's context of the ${subject.canonical_name} under '${PURPOSE}': ${h1.body.context.product_state}, ${h1.body.context.items.length} item(s) (${h1.body.context.items.map((x) => `"${String(x.title).slice(0, 50)}"`).join(', ')}), omitted ${JSON.stringify(h1.body.context.omitted)}, truncated ${h1.body.context.bound.truncated} — NO count and NO mention of the knowledge owners' item`);
      else bad(`A. Hoffmann's answer: ${h1.ok ? JSON.stringify({ state: h1.body.context.product_state, omitted: h1.body.context.omitted, mentions: JSON.stringify(h1.body.context).includes(itemId) }).slice(0, 300) : refusalLine(h1)}`);
      const a1 = await adminContext(PURPOSE, subj);
      if (a1.ok && (a1.body.context.items ?? []).some((x) => x.item_id === itemId)) ok(`the administrator's answer under the same purpose serves it (administrators are admitted to every audience role): ${a1.body.context.items.length} item(s), ${a1.body.context.product_state}`);
      else bad(`the administrator's answer: ${a1.ok ? JSON.stringify(a1.body.context.items.map((x) => x.item_id)).slice(0, 200) : refusalLine(a1)}`);
      const w = await projection('memory_items_current', 'withdraw', 'B24 demonstration: memory_items_current withdrawn for a minute to show a context answer served from the log');
      if (!w.ok) fail('the administrator withdraws memory_items_current', w);
      else {
        ok('the administrator WITHDREW memory_items_current (the operator route; the reason recorded)');
        const h2 = await context(hoffmann, PURPOSE, subj);
        const c2 = h2.body?.context;
        if (h2.ok && c2.source === 'log' && typeof c2.log_note === 'string' && silent(c2)) ok(`A. Hoffmann's answer while it is withdrawn: served from the ${c2.source}, ${c2.product_state} (code ${c2.code ?? 'none'}), ${c2.items.length} item(s); the constant note "${c2.log_note}"; still NO count and NO mention of the restricted item`);
        else bad(`the log-served answer: ${h2.ok ? JSON.stringify({ source: c2.source, note: c2.log_note, state: c2.product_state, omitted: c2.omitted }).slice(0, 300) : refusalLine(h2)}`);
        const rb = await projection('memory_items_current', 'rebuild', 'B24 demonstration: memory_items_current rebuilt after the context scene');
        if (!rb.ok) fail('the administrator rebuilds memory_items_current', rb);
        else {
          let h3 = null;
          for (let i = 0; i < 20; i += 1) { h3 = await context(hoffmann, PURPOSE, subj); if (!h3.ok || (h3.body.context.source === 'projection' && h3.body.context.product_state === 'complete')) break; await sleep(1500); }
          if (h3.ok && h3.body.context.source === 'projection' && h3.body.context.log_note === null) ok(`the administrator REBUILT memory_items_current → served from the projection again (${h3.body.context.product_state}), no log note`);
          else bad(`after the rebuild: ${h3.ok ? JSON.stringify({ source: h3.body.context.source, state: h3.body.context.product_state }) : refusalLine(h3)}`);
        }
      }
    }
  }
}

/* ── B24-9 THE STATE ──────────────────────────────────────────────────────────────── */
console.log('\nB24-9 THE STATE — what the act leaves');
{
  const it = await q(`select signal_class, state from executive.attention_items where tenant_id = $1 and domain_id = $2`, [T, D]);
  const byClass = new Map(); for (const x of it) { const m = byClass.get(x.signal_class) ?? new Map(); m.set(x.state, (m.get(x.state) ?? 0) + 1); byClass.set(x.signal_class, m); }
  note(`the queue: ${it.length} item(s) — ${[...byClass].map(([c, m]) => `${c} {${[...m].map(([s, n]) => `${s} ${n}`).join(', ')}}`).join('; ')}`);
  const pol = await q(`select version, state from executive.attention_policies where tenant_id = $1 and domain_id = $2 order by version`, [T, D]);
  note(`the policy: ${pol.map((p) => `v${p.version} ${p.state}`).join(', ')}`);
  const dl = await q(`select channel, state, count(*)::int n from executive.attention_deliveries where tenant_id = $1 and domain_id = $2 group by 1, 2 order by 1, 2`, [T, D]);
  const mb = (await q(`select count(*)::int n, count(distinct recipient_principal_id)::int r from executive.demo_mailbox where tenant_id = $1 and domain_id = $2`, [T, D]))[0];
  note(`the deliveries: ${dl.map((x) => `${x.channel} ${x.state} ${x.n}`).join(', ') || 'none'}; the SYNTHETIC demo mailbox: ${mb.n} message(s) to ${mb.r} recipient(s)`);
  const el = await q(`select e.item_id::text, e.occurred_at from executive.attention_item_events e where e.tenant_id = $1 and e.domain_id = $2 and e.event = 'item.elevated'`, [T, D]);
  for (const e of el) {
    const dd = (await q(`select count(*)::int n from executive.attention_deliveries d join executive.attention_item_events v on v.event_id = d.item_event_id where d.item_id = $1 and v.occurred_at >= $2`, [e.item_id, e.occurred_at]))[0].n;
    // found by this act's rehearsals and corrected in 0086 §D2 before the demo: the planner plans item.elevated like a routing
    if (dd === 0) bad(`elevated item ${short(e.item_id)} has NO delivery since its elevation — the deliveries step plans item.elevated (0086 §D2)`);
    else ok(`elevated item ${short(e.item_id)}: ${dd} delivery attempt(s) since its elevation (0086 §D2 plans item.elevated like a routing)`);
  }
  const sr = await q(`select state, count(*)::int n from executive.attention_suppression_requests where tenant_id = $1 and domain_id = $2 group by 1`, [T, D]);
  const dg = await q(`select state, count(*)::int n from executive.attention_delegations where tenant_id = $1 and domain_id = $2 group by 1`, [T, D]);
  const qe = await q(`select verdict, count(*)::int n from executive.attention_queue_evaluations where tenant_id = $1 and domain_id = $2 group by 1`, [T, D]);
  note(`suppression requests: ${sr.map((x) => `${x.state} ${x.n}`).join(', ') || 'none'}; item delegations: ${dg.map((x) => `${x.state} ${x.n}`).join(', ') || 'none'}; queue evaluations: ${qe.map((x) => `${x.verdict} ${x.n}`).join(', ') || 'none'}`);
  const mk = await q(`select state, subject_kind, count(*)::int n from observation.source_impact_markers where tenant_id = $1 and domain_id = $2 group by 1, 2 order by 1, 2`, [T, D]);
  note(`the markers: ${mk.map((x) => `${x.state} ${x.subject_kind} ${x.n}`).join(', ') || 'none'}`);
  const px = await q(`select method_key, state, count(*)::int n from intelligence.plan_executions where tenant_id = $1 and domain_id = $2 group by 1, 2 order by 1, 2`, [T, D]);
  const pf = await q(`select last_error from intelligence.plan_executions where tenant_id = $1 and domain_id = $2 and state = 'failed' and last_error is not null limit 1`, [T, D]);
  note(`the plan executions: ${px.map((x) => `${x.method_key} ${x.state} ${x.n}`).join(', ') || 'none'}${pf.length ? ` — a failed one says: "${String(pf[0].last_error).slice(0, 160)}"` : ''}`);
  const tk = (await q(`select count(*)::int n, min(recorded_at) a, max(recorded_at) b from executive.attention_ticks where tenant_id = $1 and domain_id = $2`, [T, D]))[0];
  const tr = await q(`select outcome, count(*)::int n from executive.agent_runs where tenant_id = $1 and domain_id = $2 and task = 'attention_tick' group by 1`, [T, D]);
  note(`the ticks: ${tk.n} (${iso(tk.a)} → ${iso(tk.b)}); the attention agent's runs ${tr.map((x) => `${x.outcome} ${x.n}`).join(', ') || 'none'}`);
  const ir = await interfaces();
  if (ir.ok) { const all = ir.body.interfaces ?? []; note(`the register: ${all.filter((i) => i.binding_state === 'bound').length} bound / ${all.filter((i) => i.binding_state === 'partial').length} partial / ${all.filter((i) => i.binding_state === 'unbound').length} unbound`); }
  note('LIMITS said: no email, SMS, Teams or push channel (owner decision D6) — demo-mailbox is SYNTHETIC; a duplicate tick job, a failing channel\'s retries and abandonment, a revoked agent\'s recorded refusal, the degraded-source admission with controls.source_impact and the degraded → suspended re-marking are the harnesses\' (phase6-attention-*-b24), not staged here; novelty has no input (declared); the legacy per-role cap is not enforced; the attention and extraction agents stay registered and ticking/draining; the invalidated run, the act-owned committed package, the 90-day forecast, its scenario, the twin version, the runs, the upload and its claims, the restricted memory item stand as demonstration facts; nothing is cleaned.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
