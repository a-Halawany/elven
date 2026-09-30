#!/usr/bin/env node
/**
 * CP-6 batch B90 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): DATA PRODUCTS, SEMANTIC
 * METRICS, THE METADATA CATALOG (migration 0095; F-P7-F-09/-10/-11) — exercised by the personas through the REAL HTTP path, each scene stating
 * the effect it produced in the ledgers, and where nothing happened, saying so. EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE:
 * each scene first reads what an earlier run left and says "stands — an earlier run" instead of writing it twice. No clock is moved; nothing
 * is planted: every row is a persona's governed act or the schedule's (the attention agent's tick, every 60 s on the demonstration — the act
 * WAITS for it; it calls no tick route, there is none outside the test runtime).
 *
 *   B90-0 THE STATE: 0095 applied; the casting read from identity.role_bindings; the SYNTHETIC personas created through the governed principal
 *         route — F. Aydın (data_steward, the domain's data steward), H. Weber (domain_analyst, NORDWERK's procurement lead); the attention agent
 *         and its cadence; the attention policy EXTENDED with the four B90 classes (product.degradation, subscription.lag, metric.certification,
 *         catalog.coverage → the data steward role; no earlier class dropped).
 *   B90-R THE PLATFORM'S OWN PRODUCTS: scripts/phase6/b90-platform-products.mjs run as a child (the nine registered, declared, reviewed, released
 *         and observed by their demonstration owners; rerun-safe on its own).
 *   B90-E THE CORRIDOR WARNING STREAM (F-P7-F-09): registered as an EVENT product owned by the intelligence domain (N. Eriksen, forecast owner;
 *         the steward registers, the owner event-declares over prediction.warning_events, declares the contract WRN@v2, the steward reviews, the
 *         owner releases); the corridor forecasts product beside it; H. Weber (procurement) registers as a CONSUMER and accepts the released
 *         contract, then SUBSCRIBES (purpose procurement, three fields, C2, lag policy 2 events / 86 400 s); the owner authorizes; ONE corridor
 *         warning raised through the B28 intake (a signal nominated by N. Eriksen, escalated by A. Hoffmann, the intake processed by the owner);
 *         the tick streams it; H. Weber reads and acknowledges through the head; THREE more warnings; the tick flags the subscription LAGGING
 *         (3 > 2) with the offset preserved, the owner's subscription.lag item, the SLO observation lag_events missed on the product; the read
 *         refused while lagging; resumption refused before conformance; H. Weber conforms and catches up, the owner resumes; the next tick
 *         observes lag_events met — the scorecard shows the attainment.
 *   B90-D THE DEGRADATION AND THE RESTORATION: the steward DEGRADES the stream with a reason → the accepted consumer's product.degradation item;
 *         the restoration refused without a domain review; the steward records the accepted domain review; the owner RESTORES.
 *   B90-M THE CERTIFIED METRIC (F-P7-F-10): the Strategy Graph measure "Corridor exposure (EUR at risk)" declared by J. Weber, two SYNTHETIC
 *         readings observed by A. Hoffmann (the demonstration carried no measure in EUR — said); the metric products registered by the steward
 *         for M. Dvořák; the steward DECLARES the exposure metric over measure_observations at grain month, the draft variant (aggregation avg),
 *         and the Strategic Health Score model at grain component; the steward's certification REFUSED (the owner's act); M. Dvořák CERTIFIES
 *         (signed, MET@v1 admitted, 90 days); the executive view SERVES it with its grain and SOURCE REVISION; the uncertified draft REFUSED in
 *         the executive view and served MARKED in the analyst view; the draft's certification refused (the conflict rule); the health score
 *         certified and served.
 *   B90-K THE CATALOG (F-P7-F-11): the SYNTHETIC source "Red Sea AIS positions (synthetic)" registered through the source contract route
 *         (A. Hoffmann registers, M. Dvořák approves and activates — the demonstration had no AIS source: said); the steward RECONCILES (the
 *         registries become catalog entries), sets the AIS source's owner, declares the lineage AIS → corridor forecasts → corridor warning
 *         stream, defines a glossary term, registers the staging asset ais_staging_2025w40 with no owner, reconciles again → ORPHAN
 *         (undiscoverable) and the catalog.coverage item in the steward's queue; the steward SEARCHES "Red Sea AIS" and sees the owner and the
 *         lineage; A. Novák (an internal-cleared reader) searches and sees the hidden count; the coverage debt.
 *   B90-9 THE STATE, the env lines for the walks, the LIMITS said.
 *
 * Every figure is SYNTHETIC (the AIS source, the warnings, the readings, the availability probes); delivery is PULL only (no push, no real
 * provider); the sinks are local. Nothing here prints a credential.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';

// The act may live in a worktree without node_modules or .eye-local: the RUNTIME root is the tree it runs from (the main tree), the code's own root otherwise.
const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const PR = `${X}/products`; const EV = `${PR}/events`; const MT = `${PR}/metrics`; const CT = `${PR}/catalog`;
const O = `${X}/observation`; const P = `${X}/prediction`; const G = `${X}/graph`; const E = `${X}/executive/attention`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const MIN = 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 220)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const dbNow = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
const dbAgo = async (interval) => (await q(`select clock_timestamp() - $1::interval t`, [interval]))[0].t.toISOString();
const dbAhead = async (interval) => (await q(`select clock_timestamp() + $1::interval t`, [interval]))[0].t.toISOString();
const tStart = Date.now();
const elapsed = () => `${((Date.now() - tStart) / 60000).toFixed(1)} min`;
console.log(`THE B90 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) ok(`${label} REFUSED — ${refusalLine(r)}`);
  else bad(`${label}: expected a ${status} refusal, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`);
};
async function waitFor(what, probe, done, ms) {
  const until = Date.now() + ms; let last = null;
  while (Date.now() < until) { last = await probe(); if (done(last)) return last; await sleep(5000); }
  note(`${what}: not within ${Math.round(ms / 1000)} s (the last read ${JSON.stringify(last).slice(0, 200)})`); return last;
}
const ENV_OUT = {};

/* ── B90-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB90-0 THE STATE — 0095, the casting, the new SYNTHETIC personas, the attention agent, the policy extended');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0095%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0095 is not applied'); process.exit(1); }
}
const CAST = { 'm.dvorak': ['executive', 'collection_manager'], 'n.eriksen': ['forecast_owner'], 'a.hoffmann': ['domain_analyst'], 'j.weber': ['strategy_owner'], 'a.novak': ['strategy_owner'], 't.richter': ['domain_admin'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, mm]) => mm.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, mm]) => `${l} lacks ${mm.join(', ')}`).join('; ')}`); process.exit(1); }
}
const NEW_PERSONAS = [
  ['f.aydin', 'F. Aydın — data steward (SYNTHETIC)', 'data_steward', D],
  ['h.weber', 'H. Weber — procurement lead, NORDWERK (SYNTHETIC)', 'domain_analyst', D],
];
for (const [loginName, displayName, roleCode, domainId] of NEW_PERSONAS) {
  const r = await createPersona(admin, T, { displayName, loginName, password: PW, roleCode, domainId });
  if (r.session === null) { bad(`${displayName} could not be created or opened (${r.status} ${r.message ?? ''})`); process.exit(1); }
  if (r.created) ok(`the administrator CREATED ${displayName.split(' — ')[0]} through the governed principal route — role ${roleCode} at the DOMAIN`); else note(`${displayName.split(' — ')[0]} is present — an earlier run`);
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const dvorak = await who('m.dvorak'); const eriksen = await who('n.eriksen'); const hoffmann = await who('a.hoffmann'); const jweber = await who('j.weber'); const novak = await who('a.novak');
const aydin = await who('f.aydin'); const hweber = await who('h.weber');
const NAME = { [dvorak.principalId]: 'M. Dvořák', [eriksen.principalId]: 'N. Eriksen', [hoffmann.principalId]: 'A. Hoffmann', [jweber.principalId]: 'J. Weber', [novak.principalId]: 'A. Novák',
  [aydin.principalId]: 'F. Aydın', [hweber.principalId]: 'H. Weber', [admin.principalId]: 'the administrator' };
const nm = (id) => NAME[id] ?? short(id);
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, consequence: 'C2', ...over });
/** The products routes (the prelude's, the four parts'): the envelope under the purpose `executive`, as the harnesses issue it. */
const pr = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${PR}/${path}`, env_(s, 'executive')({ action, objectType, objectId, ...extra }), payload, s.token);
const ev = (s, path, action, objectType, payload, objectId = null, extra = {}) => call(`${EV}/${path}`, env_(s, 'executive')({ action, objectType, objectId, ...extra }), payload, s.token);
const mt = (s, path, action, payload, objectId = null, extra = {}) => call(`${MT}/${path}`, env_(s, 'executive')({ action, objectType: 'MET', objectId, ...extra }), payload, s.token);
const ct = (s, path, action, payload, objectId = null, extra = {}) => call(`${CT}/${path}`, env_(s, 'executive')({ action, objectType: 'CAT', objectId, ...extra }), payload, s.token);
const pd = (s, path, action, objectType, payload, objectId = null) => call(`${P}/${path}`, env_(s, 'prediction')({ action, objectType, objectId }), payload, s.token);
const gr = (s, path, action, objectType, payload, objectId = null) => call(`${G}/${path}`, env_(s, 'graph')({ action, objectType, objectId }), payload, s.token);
const ob = (s, path, action, payload, objectId = null, extra = {}) => call(`${O}/${path}`, env_(s, 'observation')({ action, objectType: 'SRC', objectId, ...extra }), payload, s.token);
const READ = { sideEffect: 'none' };

// THE ATTENTION AGENT: the tick's host on this runtime (its scheduled ticks are what the act waits for)
const AGENT = (await q(`select agent_id::text, principal_id::text, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (AGENT === null) { bad('the attention agent is ABSENT — the ticks this act waits for would not come (act-b24 registers it)'); process.exit(1); }
{
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [AGENT.agent_id]))[0];
  ok(`the attention agent ${short(AGENT.agent_id)} (registered in B24) — cadence ${AGENT.budgets?.tick_every_seconds ?? '?'} s; ${last.n} tick run(s) in the last ten minutes${last.t ? ` (the latest at ${new Date(last.t).toISOString().slice(0, 19)}Z)` : ''} — the B90 steps event-products (61), subscription-lag (63), product-scorecards (64), metric-certification (65), catalog-reconcile (66) run inside it`);
}
// THE POLICY: the four B90 classes routed to the data steward role (the ports route to a named owner where one stands; the role is the route when none does)
const B90_CLASSES = ['product.degradation', 'subscription.lag', 'metric.certification', 'catalog.coverage'];
let POLICY = null;
{
  const active = (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  if (active === null) bad('no active attention policy (act-b22…b36 publish versions 1–8)');
  else if (B90_CLASSES.every((c) => active.rules?.classes?.[c]?.route_roles?.includes('data_steward'))) { POLICY = active; note(`attention policy version ${active.version} carries the four B90 classes routed to data_steward — an earlier run`); }
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    for (const c of B90_CLASSES) rules.classes[c] = { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['data_steward'], ack_within_minutes: 1440, notify: 'in_app' };
    const r = await call(`${E}/policy/publish`, env_(dvorak, 'executive')({ action: 'executive.attention.policy.publish', objectType: 'ATP' }), { rules, reason: 'B90: the data product classes — product.degradation, subscription.lag, metric.certification, catalog.coverage — routed to the data steward role where no named owner stands (SYNTHETIC).' }, dvorak.token);
    if (!r.ok) fail('M. Dvořák publishes the attention policy', r);
    else { POLICY = { policy_id: r.body.policy.policy_id, version: r.body.policy.version, rules }; ok(`M. Dvořák PUBLISHED attention policy VERSION ${r.body.policy.version}: + ${B90_CLASSES.join(', ')} → route_roles [data_steward] (every earlier class kept: ${Object.keys(active.rules.classes ?? {}).length} → ${Object.keys(rules.classes).length}) — changed ${(r.body.policy.changed_sections ?? r.body.policy.changed_classes ?? []).join(', ')}`); }
  }
}
// The inputs the scenes read
const OBJ_REG = (await q(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title = 'Keep the Regensburg line supplied through Q1' limit 1`, [T, D]))[0] ?? null;
const SRC_NW = (await q(`select distinct on (source_id) source_id::text, contract_version from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = 'nordwerk-internal' order by source_id, contract_version desc`, [T, D]))[0] ?? null;
const EVD = SRC_NW === null ? null : (await q(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and lifecycle_state = 'admitted' and provenance_ref like 'SRC:' || $3 || '@%' order by recorded_at desc limit 1`, [T, D, SRC_NW.source_id]))[0]
  ?? (await q(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' and lifecycle_state = 'admitted' order by recorded_at desc limit 1`, [T, D]))[0] ?? null;
const WRN_V = (await q(`select max(schema_version) v from objects.schema_registry where object_type = 'WRN'`))[0]?.v ?? 'v2';
const FCT_V = (await q(`select max(schema_version) v from objects.schema_registry where object_type = 'FCT'`))[0]?.v ?? 'v1';
if (OBJ_REG === null || EVD === null) { bad(`an input is missing: ${JSON.stringify({ OBJ_REG: !!OBJ_REG, EVD: !!EVD })}`); process.exit(1); }
ok(`the inputs: the Regensburg objective ${short(OBJ_REG.id)} "${OBJ_REG.title}"; the evidence the signals cite ${short(EVD.id)}@${EVD.v} (NORDWERK's synthetic internal records); the schemas WRN@${WRN_V}, FCT@${FCT_V}`);
ENV_OUT.EYE_B90_STEWARD = 'f.aydin'; ENV_OUT.EYE_B90_STEWARD_LOGIN = 'f.aydin';

/* ── B90-R THE PLATFORM'S OWN PRODUCTS ───────────────────────────────────────────────── */
console.log('\nB90-R THE PLATFORM\'S OWN PRODUCTS — scripts/phase6/b90-platform-products.mjs (the nine, by their demonstration owners; rerun-safe on its own)');
{
  const script = join(SELF_ROOT, 'scripts', 'phase6', 'b90-platform-products.mjs');
  let out = ''; let code = 0;
  try { out = execFileSync(process.execPath, [script], { env: { ...process.env, EYE_ROOT: ROOT }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) { out = `${e.stdout ?? ''}${e.stderr ?? ''}`; code = e.status ?? 1; }
  for (const line of out.split('\n').filter((l) => l.trim() !== '')) {
    const m = /^\s*(EYE_B90_[A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) { ENV_OUT[m[1]] = m[2]; continue; }
    if (/^ENV for the walks|^THE B90 PLATFORM PRODUCTS/.test(line)) continue;
    console.log(`    ${line}`);
  }
  const n = (await q(`select count(*)::int n, count(*) filter (where state in ('released', 'degraded'))::int released from products.products_current where tenant_id = $1 and domain_id = $2 and product_key like 'platform.%'`, [T, D]))[0];
  if (code === 0 && n.released === 9) ok(`the platform's nine products stand in the registry: ${n.n} registered, ${n.released} released (each with an owner, an SLO and a first availability observation — SYNTHETIC)`);
  else bad(`the platform products script exited ${code}: ${n.n} registered, ${n.released} released`);
}
ENV_OUT.EYE_B90_PRODUCTS_OWNER = 'n.eriksen';

/* ── the product helpers (the prelude's route: register → declare → review → release) ── */
const productByKey = async (key) => (await q(`select product_id::text id, product_key, title, kind, state, current_version, released_version, owner_principal_id::text owner, degraded_at, degraded_reason from products.products_current where tenant_id = $1 and domain_id = $2 and product_key = $3`, [T, D, key]))[0] ?? null;
const productEvents = async (id) => (await q(`select event, details, occurred_at from products.product_events where product_id = $1 order by occurred_at, event_id`, [id]));
/** A product of this act, found by its key or REGISTERED by the steward for its owner, DECLARED by the owner, REVIEWED by the steward, RELEASED by the owner; `beforeDeclare` runs once between the registration and the declaration (the event declaration). */
async function releasedProduct({ key, title, kind, purpose, owner, decl, beforeDeclare = null }) {
  let p = await productByKey(key);
  if (p === null) {
    const r = await pr(aydin, 'register', 'products.product.register', 'DPR', { key, title, kind, purpose, ownerPrincipalId: owner.principalId });
    if (!r.ok) { fail(`F. Aydın registers ${key}`, r); return null; }
    p = await productByKey(key);
    ok(`F. Aydın REGISTERED ${key} (${kind}) "${title}" for its owner ${nm(owner.principalId)} — ${short(p.id)}`);
  } else note(`${key} stands (${p.state}${p.released_version ? `, v${p.released_version} released` : ''}, owner ${nm(p.owner)}) — an earlier run`);
  if (beforeDeclare !== null) await beforeDeclare(p);
  if (['released', 'degraded', 'withdrawn', 'retired'].includes(p.state)) return p;
  if (p.current_version === null || Number(p.current_version) < 1) { // the registry reads 0 before the first declaration
    const d = await pr(owner, `${p.id}/declare`, 'products.product.declare', 'DPR', { declaration: decl }, p.id);
    if (!d.ok) { fail(`${nm(owner.principalId)} declares ${key}`, d); return p; }
    ok(`${nm(owner.principalId)} DECLARED ${key} v${d.body.product.version}: contract ${JSON.stringify(decl.contract.schema ?? decl.contract.fields?.map((f) => f.name))}, serving ${decl.serving_modes.join('+')}, SLO ${JSON.stringify(decl.slo)}, purposes ${decl.policy.purposes.join('+')} (digest ${String(d.body.product.digest).slice(0, 12)}…)`);
    p = await productByKey(key);
  }
  const v = Number(p.current_version);
  const reviewed = (await q(`select 1 from products.product_reviews where product_id = $1 and version = $2 and kind = 'admission' and outcome = 'accepted'`, [p.id, v])).length > 0;
  if (!reviewed) {
    const rv = await pr(aydin, `${p.id}/reviews`, 'products.product.review', 'DPR', { version: v, kind: 'admission', outcome: 'accepted', notes: `admission of ${key} v${v} reviewed by the data steward: the contract, the SLO and the closed policy stand (SYNTHETIC)`, evidence: { checklist: 'DP-41-006' } }, p.id);
    if (!rv.ok) { fail(`F. Aydın reviews ${key}`, rv); return p; }
    ok(`F. Aydın recorded the ACCEPTED admission review of ${key} v${v}`);
  }
  const rl = await pr(owner, `${p.id}/release`, 'products.product.release', 'DPR', { version: v }, p.id);
  if (!rl.ok) { fail(`${nm(owner.principalId)} releases ${key}`, rl); return p; }
  ok(`${nm(owner.principalId)} RELEASED ${key} v${v} — the DPR admitted at object_version ${rl.body.product.dpr?.object_version ?? '?'}`);
  return productByKey(key);
}
const DECL_BASE = { cost: { basis: 'compute-minutes × the product\'s share of the platform (SYNTHETIC)' }, quality: { completeness: 'declared by its owner' } };
const AIS_KEY = 'red-sea-ais-positions'; const AIS_TITLE = 'Red Sea AIS positions (synthetic)';
const STREAM_KEY = 'corridor-' + 'warning-stream'; /* split: gitleaks flags key-shaped literals */
const FORECASTS_KEY = 'corridor-forecasts';

/* ── B90-E THE CORRIDOR WARNING STREAM ───────────────────────────────────────────────── */
console.log('\nB90-E THE CORRIDOR WARNING STREAM — the event product owned by the intelligence domain; procurement subscribes, falls behind its lag policy and is flagged; the scorecard shows the attainment');
const EVENT_DECL = { schema: { version: 'v1', fields: [{ name: 'title', type: 'string' }, { name: 'consequence_class', type: 'string' }, { name: 'confidence', type: 'number' }, { name: 'closes_at', type: 'instant' }, { name: 'routed_to', type: 'uuid' }] },
  subject_kind: 'warning', ordering_key: 'subject_id', delivery: 'pull', retention_days: 30, replay_policy: { allowed: true }, source: { ledger: 'prediction.warning_events', kinds: ['warning.raised', 'warning.retracted'] } };
const STREAM = await releasedProduct({
  key: STREAM_KEY, title: 'Corridor warning stream (SYNTHETIC)', kind: 'event', owner: eriksen, purpose: 'the corridor early warnings served to governed consumers as a subscribable event product (the intelligence domain\'s; SYNTHETIC)',
  decl: { contract: { schema: [{ object_type: 'WRN', schema_version: WRN_V }] }, serving_modes: ['event'], inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }], outputs: [{ kind: 'object_type', ref: 'WRN', authority: false }],
    // the floor 50 % and the grace of 3 ticks are DECLARED so that the one missed lag observation of this scene does not degrade the stream by the schedule before the steward's own degradation (B90-D); the attainment climbs with every healthy tick
    slo: { lag_events: 2, attainment_floor_pct: 50, grace_ticks: 3 }, policy: { purposes: ['executive', 'procurement'], data_classes: ['internal'] }, ...DECL_BASE },
  beforeDeclare: async (p) => {
    const had = (await q(`select declaration_version, schema_version from products.event_products where product_id = $1`, [p.id]))[0] ?? null;
    if (had) { note(`the event declaration of ${STREAM_KEY} stands (declaration ${had.declaration_version}, schema ${had.schema_version}) — an earlier run`); return; }
    // THE INTAKE DRAINED FIRST: the stream carries every warning raised in the domain after its declaration (since = declared_at), and the demonstration
    // holds candidates earlier batches left pending (twin degradations, exposures) — processed by their owner now, BEFORE the declaration, so the scene's
    // stream counts only the scene's own warnings (rehearsal 1: six pending candidates raised with the first warning put the subscription 7 behind at once)
    for (let pass = 0; pass < 3; pass += 1) {
      const pend = Number((await q(`select count(*)::int n from prediction.warning_candidates where tenant_id = $1 and domain_id = $2 and state = 'pending'`, [T, D]))[0].n);
      if (pend === 0) { if (pass === 0) note('the warning intake holds no pending candidate — nothing to drain before the declaration'); break; }
      const d = await pd(eriksen, 'warnings/candidates/process', 'prediction.warning.candidates.process', 'WRN', { limit: 50 });
      if (!d.ok) { fail('N. Eriksen drains the intake before the declaration', d); break; }
      ok(`N. Eriksen PROCESSED the warning intake BEFORE the stream's declaration: ${pend} pending → ${(d.body.processing?.raised ?? []).filter((x) => x.decision === 'raised').length} raised, the rest decided otherwise (the earlier batches' candidates; the stream starts after them)`);
    }
    const r = await ev(eriksen, `${p.id}/declare`, 'products.event_product.declare', 'DPR', { declaration: EVENT_DECL }, p.id);
    if (!r.ok) fail('N. Eriksen event-declares the stream', r);
    else ok(`N. Eriksen EVENT-DECLARED ${STREAM_KEY}: schema v1 (${EVENT_DECL.schema.fields.map((f) => f.name).join(', ')}), subject warning, ordering by subject, PULL, retention 30 days, replay allowed, source prediction.warning_events [${EVENT_DECL.source.kinds.join(', ')}] — emits corrections ${r.body.event_product?.emits_corrections ?? '?'}`);
  },
});
const FORECASTS = await releasedProduct({
  key: FORECASTS_KEY, title: 'Corridor transit forecasts (SYNTHETIC)', kind: 'forecast', owner: eriksen, purpose: 'the corridor transit forecasts — the Bab el-Mandeb daily transits forecast from the AIS positions and the corridor series (SYNTHETIC)',
  decl: { contract: { schema: [{ object_type: 'FCT', schema_version: FCT_V }] }, serving_modes: ['api'], inputs: [{ kind: 'source', ref: AIS_KEY }, { kind: 'relation', ref: 'prediction.series' }], outputs: [{ kind: 'object_type', ref: 'FCT', authority: false }],
    slo: { availability_pct: 99.5, freshness_seconds: 86400, attainment_floor_pct: 95, grace_ticks: 2 }, policy: { purposes: ['executive', 'prediction'], data_classes: ['internal'] }, ...DECL_BASE },
});
if (FORECASTS && (await q(`select 1 from products.slo_observations where product_id = $1 and measure = 'availability_pct'`, [FORECASTS.id])).length === 0) {
  const o = await pr(eriksen, `${FORECASTS.id}/slo`, 'products.slo.observe', 'DPR', { measure: 'availability_pct', value: 99.9, threshold: 99.5, met: true, source: 'synthetic availability probe (the B90 act)', details: { synthetic: true } }, FORECASTS.id);
  if (!o.ok) fail('N. Eriksen observes the forecasts product', o); else ok(`availability_pct 99.9 OBSERVED on ${FORECASTS_KEY} (SYNTHETIC; the schedule's first scorecard reads it)`);
}
ENV_OUT.EYE_B90_EVENTS_STREAM_TITLE = 'Corridor warning stream'; ENV_OUT.EYE_B90_EVENTS_OWNER = 'n.eriksen'; ENV_OUT.EYE_B90_EVENTS_CONSUMER = 'h.weber'; ENV_OUT.EYE_B90_CONSUMER = 'h.weber';
let SUB = null;
if (STREAM === null || !['released', 'degraded'].includes(STREAM.state)) bad(`the corridor warning stream is ${STREAM?.state ?? 'ABSENT'} — the scene needs it released`);
else {
  // THE CONSUMER (Part R): H. Weber registers procurement as a consumer of the stream and ACCEPTS the released contract — her own act
  const cons = (await q(`select consumer_id::text id, state, contract_version from products.product_consumers where product_id = $1 and consumer_principal_id = $2 and state in ('registered', 'accepted') order by registered_at desc limit 1`, [STREAM.id, hweber.principalId]))[0] ?? null;
  let cid = cons?.id ?? null;
  if (cons === null) {
    const r = await pr(hweber, `${STREAM.id}/consumers/register`, 'products.consumer.register', 'DPR', { purpose: 'procurement reads the corridor warnings to re-route the bearing orders before the booking deadline (SYNTHETIC)', impact: 'purchase orders are not re-routed when the stream breaks' }, STREAM.id);
    if (!r.ok) fail('H. Weber registers as a consumer', r); else { cid = r.body.consumer.consumer_id; ok(`H. Weber (procurement) REGISTERED as a consumer of ${STREAM_KEY}: ${short(cid)} ${r.body.consumer.state}, contract v${r.body.consumer.contract_version}`); }
  } else note(`H. Weber's consumer registration ${short(cons.id)} stands (${cons.state}, v${cons.contract_version}) — an earlier run`);
  if (cid !== null && (cons === null || cons.state === 'registered')) {
    const a = await pr(hweber, `${STREAM.id}/consumers/${cid}/accept`, 'products.consumer.accept', 'DPR', { version: Number(STREAM.released_version) }, STREAM.id);
    if (!a.ok) fail('H. Weber accepts the contract', a); else ok(`H. Weber ACCEPTED contract v${a.body.consumer.contract_version} of ${STREAM_KEY} — the consumer's own act (${a.body.consumer.state})`);
  }
  // THE SUBSCRIPTION (Part E): purpose procurement, three of the five fields, C2, the lag policy 2 events / 86 400 s; the owner authorizes
  const subOf = async () => (await q(`select subscription_id::text id, state, checkpoint_sequence::int checkpoint, paused_reason, conformed_at, schema_version from products.event_subscriptions where product_id = $1 and consumer_principal_id = $2 and state <> 'revoked' order by registered_at desc limit 1`, [STREAM.id, hweber.principalId]))[0] ?? null;
  SUB = await subOf();
  if (SUB === null) {
    const r = await ev(hweber, 'subscriptions/register', 'products.subscription.register', 'SUB', { productId: STREAM.id, purpose: 'procurement', granted: { fields: ['title', 'consequence_class', 'closes_at'], consequence: 'C2', from: null, to: null }, filters: {},
      schemaVersion: 'v1', lagPolicy: { max_lag_events: 2, max_lag_seconds: 86_400 }, handlesCorrections: true, handlesReplays: true });
    if (!r.ok) fail('H. Weber subscribes', r);
    else { SUB = await subOf(); ok(`H. Weber SUBSCRIBED to ${STREAM_KEY}: ${short(SUB.id)} ${r.body.subscription.state} — purpose procurement, fields ${r.body.subscription.granted.fields.join('+')}, consequence C2, schema v1, lag policy ${JSON.stringify(r.body.subscription.lag_policy)}, handles corrections and replays`); }
  } else note(`H. Weber's subscription ${short(SUB.id)} stands (${SUB.state}, checkpoint ${SUB.checkpoint}${SUB.paused_reason ? `, ${SUB.paused_reason}` : ''}) — an earlier run`);
  if (SUB && SUB.state === 'registered') {
    expectRefused('H. Weber reading before the authorization', await ev(hweber, `subscriptions/${SUB.id}/read`, 'products.subscription.read', 'SUB', {}, SUB.id, READ), 409, /subscription rejected \(state\)/);
    const a = await ev(eriksen, `subscriptions/${SUB.id}/authorize`, 'products.subscription.authorize', 'SUB', {}, SUB.id);
    if (!a.ok) fail('N. Eriksen authorizes the subscription', a); else { ok(`N. Eriksen (the owner) AUTHORIZED the subscription: ${a.body.subscription.state} — the authority boundary: the granted fields, the purpose, the tenant, C2`); SUB = await subOf(); }
  }
  // THE WARNINGS through the B28 intake: a signal nominated by N. Eriksen and escalated by A. Hoffmann becomes a candidate of its OWN cause (no subject:
  // the cause key is the signal's), decided by the intake N. Eriksen processes (or by the attention agent's tick, whichever comes first) and RAISED
  const signalByTitle = async (title) => (await q(`select signal_id::text id, disposition from prediction.signals_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, title]))[0] ?? null;
  const raiseWarnings = async (labels) => {
    const raised = [];
    for (const label of labels) {
      const title = `Bab el-Mandeb: SYNTHETIC ${label} (B90)`;
      let sig = await signalByTitle(title);
      if (sig === null) {
        const n = await pd(eriksen, 'signals/nominate', 'prediction.signal.nominate', 'SIG', { title, statement: `A SYNTHETIC report for the B90 demonstration: ${label} — the corridor warning stream carries it to its subscribers (no real incident).`, subjectKind: 'none',
          evidence: [{ object_id: EVD.id, version: EVD.v, stance: 'supporting' }], observation: { reports: 1, incident: label }, baseline: { incidents_per_quarter: 0 }, noveltyBasis: { basis: 'a synthetic report nominated for the B90 demonstration of the event product (no prior report of it)' }, confidence: 0.6 });
        if (!n.ok) { fail(`N. Eriksen nominates "${label}"`, n); continue; }
        sig = { id: n.body.signal.signal_id };
      }
      let cand = (await q(`select candidate_id::text id, state, warning_id::text wid from prediction.warning_candidates where tenant_id = $1 and domain_id = $2 and origin_key like 'signal:' || $3 || ':%' order by submitted_at desc limit 1`, [T, D, sig.id]))[0] ?? null;
      if (cand === null) {
        const e = await pd(hoffmann, `signals/${sig.id}/escalate`, 'prediction.signal.escalate', 'SIG', { note: `Escalated for the B90 demonstration: the report reaches the corridor warning stream (SYNTHETIC; ${label}).`, consequence: 'C2', confidence: 0.6, windowHours: 72, affected: { objectives: [OBJ_REG.id], geographies: ['BAB-EL-MANDEB'], horizon: '30d' } }, sig.id);
        if (!e.ok) { fail(`A. Hoffmann escalates "${label}"`, e); continue; }
        cand = { id: e.body.escalation.candidate.candidate_id, state: e.body.escalation.candidate.state, wid: null };
      }
      raised.push({ label, signal: sig.id, candidate: cand.id });
    }
    if (raised.length === 0) return [];
    const pending = await q(`select candidate_id::text id from prediction.warning_candidates where candidate_id = any($1::uuid[]) and state = 'pending'`, [raised.map((r) => r.candidate)]);
    if (pending.length > 0) {
      const p = await pd(eriksen, 'warnings/candidates/process', 'prediction.warning.candidates.process', 'WRN', { limit: 50 });
      if (!p.ok) fail('N. Eriksen processes the intake', p);
      else note(`N. Eriksen PROCESSED the intake: ${(p.body.processing?.raised ?? []).filter((x) => x.decision === 'raised').length} raised in ${(p.body.processing?.passes ?? []).length} pass(es)`);
    }
    const rows = await q(`select candidate_id::text id, state, warning_id::text wid from prediction.warning_candidates where candidate_id = any($1::uuid[])`, [raised.map((r) => r.candidate)]);
    const lines = raised.map((r) => { const c = rows.find((x) => x.id === r.candidate); return `"${r.label}" → candidate ${short(r.candidate)} ${c?.state} → warning ${short(c?.wid)}`; });
    (rows.every((c) => c.state === 'raised') ? ok : bad)(`${raised.length} SYNTHETIC corridor warning(s) RAISED through the B28 intake (nominated by N. Eriksen, escalated by A. Hoffmann, each its own cause): ${lines.join('; ')}`);
    return rows.filter((c) => c.state === 'raised').map((c) => c.wid);
  };
  const streamHead = async () => Number((await q(`select coalesce(max(sequence), 0)::int h from products.event_stream where product_id = $1`, [STREAM.id]))[0].h);
  const evs = (await productEvents(STREAM.id)).map((e) => e.event);
  const lagged = evs.includes('subscription.lagging'); const resumed = evs.includes('subscription.resumed');
  if (SUB && SUB.state !== 'registered') {
    // (1) ONE warning; the tick streams it; H. Weber reads and acknowledges through the head
    if (!lagged && SUB.checkpoint === 0) {
      let head = await streamHead();
      if (head === 0) {
        await raiseWarnings(['attack reported near Perim']);
        note(`waiting for the attention agent's scheduled tick (event-products, order 61; every ${AGENT.budgets?.tick_every_seconds ?? 60} s) — ${elapsed()}`);
        head = await waitFor('the stream head', streamHead, (h) => h > 0, 4 * MIN);
      } else note(`the stream head is ${head} — an earlier run raised and streamed`);
      if (head > 0) {
        const r = await ev(hweber, `subscriptions/${SUB.id}/read`, 'products.subscription.read', 'SUB', {}, SUB.id, READ);
        if (!r.ok) fail('H. Weber reads the stream', r);
        else {
          const rd = r.body.read; const first = (rd.events ?? [])[0];
          ok(`H. Weber READ the stream after ${rd.after}: ${rd.served} served, head ${rd.head}, corrections omitted ${rd.omitted?.corrections ?? 0}${first ? ` — #${first.sequence} ${first.event_kind} ${first.source_event} "${String(first.payload?.title ?? '').slice(0, 60)}" (the payload PROJECTED to ${Object.keys(first.payload ?? {}).join('+')})` : ''}`);
          const a = await ev(hweber, `subscriptions/${SUB.id}/checkpoint`, 'products.subscription.checkpoint', 'SUB', { sequence: rd.head }, SUB.id);
          if (!a.ok) fail('H. Weber acknowledges', a); else ok(`H. Weber ACKNOWLEDGED through ${a.body.subscription.checkpoint_sequence} (head ${a.body.subscription.head}, lag ${a.body.subscription.lag_events})`);
        }
      }
      SUB = await subOf();
    }
    // (2) THREE more warnings; the tick flags the subscription LAGGING (3 > 2): the offset preserved, the owner's item, the SLO missed; the refusals
    if (!lagged) {
      const before = await streamHead();
      await raiseWarnings(['drone sighting north of the strait', 'a second attack reported by the carrier', 'insurer withdraws war-risk cover']);
      note(`waiting for the attention agent's scheduled tick (event-products 61, then subscription-lag 63, then product-scorecards 64) — ${elapsed()}`);
      const got = await waitFor('the lag flag', subOf, (s) => s?.state === 'lagging', 4 * MIN);
      const head = await streamHead();
      if (got?.state === 'lagging') {
        SUB = got;
        ok(`THE TICK streamed ${head - before} more (head ${head}) and FLAGGED the subscription LAGGING: ${head - SUB.checkpoint} events behind the policy's 2 — the checkpoint ${SUB.checkpoint} PRESERVED (reason ${SUB.paused_reason})`);
        const item = (await q(`select item_id::text id, state, owner_principal_id::text owner, title, details from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'subscription.lag' and subject_id = $3 order by created_at desc limit 1`, [T, D, SUB.id]))[0] ?? null;
        (item ? ok : bad)(`the OWNER'S ITEM: ${item ? `${short(item.id)} subscription.lag "${String(item.title).slice(0, 80)}" → ${item.state}, owner ${nm(item.owner)} (lag ${item.details?.lag_events} > ${item.details?.max_lag_events}, consumer ${nm(item.details?.consumer)})` : 'ABSENT'}`);
        const slo = (await q(`select value, threshold, met, source from products.slo_observations where product_id = $1 and measure = 'lag_events' order by observed_at desc limit 1`, [STREAM.id]))[0] ?? null;
        (slo && slo.met === false ? ok : bad)(`the SLO LEDGER: lag_events ${slo?.value} against ${slo?.threshold} → met ${slo?.met} (${slo?.source})`);
        expectRefused('H. Weber reading while lagging', await ev(hweber, `subscriptions/${SUB.id}/read`, 'products.subscription.read', 'SUB', {}, SUB.id, READ), 409, /subscription rejected \(state\): .*lagging/);
        expectRefused('N. Eriksen resuming before the conformance', await ev(eriksen, `subscriptions/${SUB.id}/resume`, 'products.subscription.resume', 'SUB', {}, SUB.id), 409, /subscription rejected \(state\)/);
      } else bad(`the subscription is ${got?.state ?? 'unknown'} after the tick (head ${head}, checkpoint ${got?.checkpoint})`);
    } else note(`the subscription was flagged lagging by the tick — an earlier run`);
    // (3) CONFORMANCE, the catch-up, the owner's resumption; the next tick observes lag_events met
    SUB = await subOf();
    if (SUB && SUB.state === 'lagging') {
      const c = await ev(hweber, `subscriptions/${SUB.id}/conform`, 'products.subscription.conform', 'SUB', { declaration: { caught_up: true, can_process: true, note: 'the procurement backlog processed; the three new warnings read from the intake (SYNTHETIC)' } }, SUB.id);
      if (!c.ok) fail('H. Weber declares conformance', c); else ok(`H. Weber DECLARED CONFORMANCE (caught up, can process) — the row keeps the declaration; the state stays ${c.body.subscription.state} until the owner resumes`);
      const head = await streamHead();
      if (SUB.checkpoint < head) { const a = await ev(hweber, `subscriptions/${SUB.id}/checkpoint`, 'products.subscription.checkpoint', 'SUB', { sequence: head }, SUB.id); if (!a.ok) fail('H. Weber catches up', a); else ok(`H. Weber CAUGHT UP: acknowledged through ${a.body.subscription.checkpoint_sequence} while lagging (lag ${a.body.subscription.lag_events}) — not resumed on her own`); }
      const rs = await ev(eriksen, `subscriptions/${SUB.id}/resume`, 'products.subscription.resume', 'SUB', {}, SUB.id);
      if (!rs.ok) fail('N. Eriksen resumes', rs); else ok(`N. Eriksen RESUMED the subscription: ${rs.body.subscription.state}, checkpoint ${rs.body.subscription.checkpoint_sequence}`);
      SUB = await subOf();
    } else if (resumed) note('the conformance and the resumption stand — an earlier run');
    // the met observation AFTER the owner's resumption (rehearsal 2: the first tick's lag 1 met, before the lag, satisfied an unbounded read at once)
    const metTrue = () => q(`select o.value, o.met, o.observed_at from products.slo_observations o where o.product_id = $1 and o.measure = 'lag_events' and o.met
                              and o.observed_at > (select max(e.occurred_at) from products.product_events e where e.product_id = $1 and e.event = 'subscription.resumed') order by o.observed_at desc limit 1`, [STREAM.id]).then((r) => r[0] ?? null);
    let mt1 = await metTrue();
    if (mt1 === null && SUB?.state === 'active') { note(`waiting for the next tick's lag observation (subscription-lag 63) — ${elapsed()}`); mt1 = await waitFor('lag_events met', metTrue, (r) => r !== null, 3 * MIN); }
    (mt1 ? ok : bad)(`THE NEXT TICK observed lag_events ${mt1 ? `${mt1.value} → met (at ${new Date(mt1.observed_at).toISOString()})` : 'NOT met'} — the subscription back within its policy after the conformance and the resumption`);
    const rd = await ev(eriksen, `${STREAM.id}/read`, 'products.product.read', 'DPR', {}, STREAM.id, READ);
    if (!rd.ok) fail('N. Eriksen reads the event product', rd);
    else {
      const e = rd.body.event_product; const s = (e.subscriptions ?? []).find((x) => x.subscription_id === SUB?.id);
      ok(`THE OWNER'S READ of ${STREAM_KEY}: head ${e.head}, stream ${JSON.stringify(e.stream?.by_kind ?? {})}, subscriptions ${(e.subscriptions ?? []).length} — H. Weber's ${s?.state} at checkpoint ${s?.checkpoint_sequence} (lag ${s?.lag_events}); the SLO on the product: lag_events ${e.slo?.lag_events ? `${e.slo.lag_events.value} → met ${e.slo.lag_events.met} (${e.slo.lag_events.source})` : 'not yet observed'}`);
    }
    const sc = await pr(aydin, `${STREAM.id}/scorecard`, 'products.product.read', 'DPR', {}, STREAM.id, READ);
    if (!sc.ok) fail('F. Aydın reads the scorecard', sc);
    else {
      const cards = sc.body.scorecard?.scorecards ?? []; const latest = cards[0] ?? null;
      const lag = await q(`select met, count(*)::int n from products.slo_observations where product_id = $1 and measure = 'lag_events' group by met order by met`, [STREAM.id]);
      (latest ? ok : note)(`THE SCORECARD of ${STREAM_KEY} (the schedule's): ${latest ? `${latest.overall}, SLO attainment ${latest.attainment_pct ?? 'none yet'}% against the floor ${latest.floor_pct}% (${cards.length} card(s))` : 'not yet computed by the tick'} — lag_events observed ${lag.map((x) => `${x.n} ${x.met ? 'met' : 'missed'}`).join(', ') || 'none'}: missed at the lag, attained after the conformance and the resumption`);
    }
  }
}

/* ── B90-D THE DEGRADATION AND THE RESTORATION ───────────────────────────────────────── */
console.log('\nB90-D THE DEGRADATION AND THE RESTORATION — the steward degrades the stream with a reason; the consumer\'s item; the domain review; the owner restores');
if (STREAM) {
  let p = await productByKey(STREAM_KEY);
  const evs = await productEvents(STREAM.id);
  const degradedEv = evs.find((e) => e.event === 'product.degraded') ?? null; const restoredEv = evs.find((e) => e.event === 'product.restored') ?? null;
  if (degradedEv) note(`${STREAM_KEY} was degraded (by ${degradedEv.details?.by ?? 'a person'}: "${String(p.degraded_reason ?? degradedEv.details?.reason ?? '').slice(0, 80)}") — an earlier run${restoredEv ? '; restored since' : ''}`);
  else if (p.state === 'released') {
    const r = await pr(aydin, `${STREAM.id}/degrade`, 'products.product.degrade', 'DPR', { reason: 'The corridor warning stream is served from its last emission while the warning ledger is re-indexed; consumers must expect a stale head (SYNTHETIC).' }, STREAM.id);
    if (!r.ok) fail('F. Aydın degrades the stream', r);
    else ok(`F. Aydın DEGRADED ${STREAM_KEY} with a reason: ${r.body.product.state} — every ACCEPTED consumer notified: ${(r.body.product.notified ?? []).map((n) => nm(n.consumer_principal_id)).join(', ') || 'none'}`);
    p = await productByKey(STREAM_KEY);
  } else note(`${STREAM_KEY} is ${p.state} — not degraded by the steward`);
  const item = (await q(`select item_id::text id, state, title from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'product.degradation' and subject_id = $3 and owner_principal_id = $4 order by created_at desc limit 1`, [T, D, STREAM.id, hweber.principalId]))[0] ?? null;
  (item ? ok : bad)(`THE CONSUMER'S ITEM: ${item ? `${short(item.id)} "${String(item.title).slice(0, 90)}" → ${item.state}, on H. Weber's queue (product.degradation)` : 'ABSENT from H. Weber\'s queue'}`);
  if (p.state === 'degraded') {
    const reviewNewer = (await q(`select 1 from products.product_reviews where product_id = $1 and kind = 'domain' and outcome = 'accepted' and reviewed_at > $2`, [STREAM.id, p.degraded_at]));
    if (reviewNewer.length === 0) {
      expectRefused('N. Eriksen restoring before the domain review', await pr(eriksen, `${STREAM.id}/restore`, 'products.product.restore', 'DPR', {}, STREAM.id), 409, /data product rejected \(review\)/);
      const rv = await pr(aydin, `${STREAM.id}/reviews`, 'products.product.review', 'DPR', { version: Number(p.released_version), kind: 'domain', outcome: 'accepted', notes: 'the corridor warning stream reviewed for the domain after its degradation: the ledger re-indexed, the consumers re-read the head (SYNTHETIC)', evidence: { checklist: 'DP-41-005' } }, STREAM.id);
      if (!rv.ok) fail('F. Aydın records the domain review', rv); else ok(`F. Aydın recorded the ACCEPTED domain review of v${p.released_version} (newer than the degradation)`);
    } else note('an accepted domain review newer than the degradation stands — an earlier run');
    const rs = await pr(eriksen, `${STREAM.id}/restore`, 'products.product.restore', 'DPR', { note: 'restored after the domain review (SYNTHETIC)' }, STREAM.id);
    if (!rs.ok) fail('N. Eriksen restores', rs); else ok(`N. Eriksen (the owner) RESTORED ${STREAM_KEY}: ${rs.body.product.state}, restored on ${rs.body.product.restored_on}, released version ${rs.body.product.released_version} kept`);
  } else if (restoredEv) note(`the restoration stands (${p.state}) — an earlier run`);
}

/* ── B90-M THE CERTIFIED METRIC ──────────────────────────────────────────────────────── */
console.log('\nB90-M THE CERTIFIED METRIC — "corridor exposure (EUR at risk)" served with its grain and source revision; the uncertified variant refused in the executive view; the Strategic Health Score');
const MSR_TITLE = 'Corridor exposure (EUR at risk)';
let MSR = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'MSR' and title = $3 and status = 'active' limit 1`, [T, D, MSR_TITLE]))[0]?.id ?? null;
if (MSR) note(`the measure ${short(MSR)} "${MSR_TITLE}" stands — an earlier run`);
else {
  // the demonstration carried no Strategy Graph measure in EUR (said): J. Weber declares one under the Regensburg objective
  const d = await gr(jweber, 'strategy/declare', 'graph.strategy.declare', 'MSR', { objectType: 'MSR', title: MSR_TITLE, statement: 'the value of NORDWERK consignments in transit through Bab el-Mandeb exposed to a corridor closure, in EUR (SYNTHETIC)', status: 'active', restsOn: [{ kind: 'strategy', id: OBJ_REG.id, rationale: 'the exposure is measured against the Regensburg supply objective' }] });
  if (!d.ok) fail('J. Weber declares the exposure measure', d);
  else {
    MSR = d.body.strategy.objectId;
    const df = await gr(jweber, `strategy/measures/${MSR}/define`, 'graph.measure.define', 'MSR', { objectiveId: OBJ_REG.id, unit: 'EUR', direction: 'lower_better', targetValue: 500000, targetDate: '2027-06-30', freshnessDays: 60 }, MSR);
    if (!df.ok) fail('J. Weber defines the measure', df); else ok(`J. Weber DECLARED and DEFINED the measure ${short(MSR)} "${MSR_TITLE}": unit EUR, lower is better, target ≤ 500 000 by 2027-06-30 (the demonstration carried no measure in EUR — said)`);
  }
}
if (MSR) {
  const n = Number((await q(`select count(*)::int n from graph.measure_observations where measure_id = $1`, [MSR]))[0].n);
  if (n >= 2) note(`${n} reading(s) of the measure stand — an earlier run`);
  else {
    const readings = [[610000, '50 days'], [550000, '10 days']].slice(n);
    for (const [value, ago] of readings) {
      const o = await gr(hoffmann, `strategy/measures/${MSR}/observe`, 'graph.measure.observe', 'MSR', { value, observedAt: await dbAgo(ago), source: { kind: 'evidence', id: EVD.id } }, MSR);
      if (!o.ok) fail(`A. Hoffmann observes EUR ${value}`, o); else ok(`A. Hoffmann OBSERVED EUR ${value.toLocaleString('en')} at risk, ${ago} ago (SYNTHETIC; cited on the evidence ${short(EVD.id)})`);
    }
  }
}
const METRICS = [
  { key: 'corridor-exposure-eur', title: 'Corridor exposure (EUR at risk)', purpose: 'the certified corridor exposure metric served to the executive view (SYNTHETIC)', certify: true,
    def: () => ({ measure: 'measure_observations', unit: 'EUR', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: { measure_id: MSR } }), effective: '80 days' },
  { key: 'corridor-exposure-eur-draft', title: 'Corridor exposure (EUR at risk) — draft', purpose: 'an analyst draft of the exposure metric (the mean per month), never certified (SYNTHETIC)', certify: false,
    def: () => ({ measure: 'measure_observations', unit: 'EUR', aggregation: 'avg', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: { measure_id: MSR } }), effective: '80 days' },
  { key: 'strategic-health-score', title: 'Strategic Health Score', purpose: 'the decomposable Strategic Health Score served as a certified metric (its owner the executive)', certify: true,
    // the ACTIVE definition's components (the measure serves the latest snapshot per definition; the superseded definition's would appear beside it)
    def: () => ({ measure: 'health_score', unit: 'points', aggregation: 'last', grain: 'component', dimensions: ['definition_id', 'component_key'], filters: ACTIVE_DEF ? { definition_id: ACTIVE_DEF } : {} }), effective: null },
];
const ACTIVE_DEF = (await q(`select definition_id::text id from executive.health_score_definitions where tenant_id = $1 and domain_id = $2 and state = 'active' order by version desc limit 1`, [T, D]))[0]?.id ?? null;
const MODEL = {};
for (const M of METRICS) {
  let p = await productByKey(M.key);
  if (p === null) {
    const r = await pr(aydin, 'register', 'products.product.register', 'DPR', { key: M.key, title: M.title, kind: 'metric', purpose: M.purpose, ownerPrincipalId: dvorak.principalId });
    if (!r.ok) { fail(`F. Aydın registers ${M.key}`, r); continue; }
    p = await productByKey(M.key); ok(`F. Aydın REGISTERED the metric product ${M.key} "${M.title}" for its owner M. Dvořák — ${short(p.id)}`);
  } else note(`${M.key} stands (${p.state}) — an earlier run`);
  let model = (await q(`select model_id::text id, state, current_version, certified_version, metric_key from products.semantic_models where model_id = $1`, [p.id]))[0] ?? null;
  if (model === null) {
    if (MSR === null && M.def().measure === 'measure_observations') { bad(`no measure to declare ${M.key} over`); continue; }
    const payload = { ...M.def(), ...(M.effective ? { effectiveFrom: await dbAgo(M.effective) } : {}) };
    const d = await mt(aydin, `${p.id}/define`, 'products.metric.declare', payload, p.id);
    if (!d.ok) { fail(`F. Aydın declares ${M.key}`, d); continue; }
    ok(`F. Aydın DECLARED ${M.key} v${d.body.metric.version}: ${payload.measure} · ${payload.aggregation} · grain ${payload.grain} · unit ${payload.unit} · dimensions ${payload.dimensions.join('+')} · filters ${JSON.stringify(payload.filters).replace(/[0-9a-f-]{36}/g, (m) => short(m))}${payload.effectiveFrom ? ` · effective from ${payload.effectiveFrom.slice(0, 10)}` : ''} (digest ${String(d.body.metric.digest).slice(0, 12)}…) — DECLARATIVE: a whitelisted measure, never an expression`);
    model = (await q(`select model_id::text id, state, current_version, certified_version, metric_key from products.semantic_models where model_id = $1`, [p.id]))[0];
  } else note(`the semantic model ${M.key} stands (${model.state}, v${model.current_version}${model.certified_version ? ` certified` : ''}) — an earlier run`);
  MODEL[M.key] = model;
  if (M.certify && model.state !== 'certified') {
    if (M.key === 'corridor-exposure-eur') expectRefused('F. Aydın (the steward) certifying the exposure metric', await mt(aydin, `${p.id}/certify`, 'products.metric.certify', { version: Number(model.current_version), expiresAt: await dbAhead('90 days') }, p.id), 403, /metric certification rejected \(authority\)/);
    const c = await mt(dvorak, `${p.id}/certify`, 'products.metric.certify', { version: Number(model.current_version), expiresAt: await dbAhead('90 days') }, p.id);
    if (!c.ok) fail(`M. Dvořák certifies ${M.key}`, c);
    else { const m = c.body.metric; ok(`M. Dvořák (the owner) CERTIFIED ${M.key} v${m.certification?.version} until ${String(m.certification?.expires_at).slice(0, 10)} — SIGNED (${m.signature?.key_id ?? 'the executive key'}, ${short(m.signature?.signature_id)}), the canonical MET@v1 admitted at object version ${m.met?.object_version} → ${m.state}`); MODEL[M.key] = { ...model, state: m.state, certified_version: m.certified_version }; }
  } else if (M.certify) note(`${M.key} is certified (v${model.certified_version}) — an earlier run`);
}
ENV_OUT.EYE_B90_EXECUTIVE_LOGIN = 'm.dvorak'; ENV_OUT.EYE_B90_METRIC_TITLE = 'Corridor exposure \\(EUR at risk\\)(?! — draft)'; ENV_OUT.EYE_B90_DRAFT_TITLE = 'draft'; ENV_OUT.EYE_B90_HEALTH_TITLE = 'Strategic Health Score';
{
  const s = await mt(dvorak, 'corridor-exposure-eur/serve', 'products.metric.serve', { view: 'executive' });
  if (!s.ok) fail('M. Dvořák serves the exposure metric in the executive view', s);
  else { const v = s.body.serving; ok(`THE EXECUTIVE VIEW SERVED corridor-exposure-eur: ${v.certification_standing}, definition v${v.version} (${String(v.digest).slice(0, 12)}…), grain ${v.grain}, unit ${v.unit}, ${v.aggregation} — SOURCE ${v.source} revision ${String(v.source_revision).slice(0, 16)}… over ${v.source_rows} row(s), freshness ${v.freshness_seconds === null ? '—' : `${Math.round(v.freshness_seconds / 86400)} d`}; values ${(v.values ?? []).map((x) => `${x.grain_key}: ${Number(x.value).toLocaleString('en')} EUR`).join(', ')} (as of ${String(v.as_of).slice(0, 19)}Z, the database's instant)`); }
  expectRefused('the executive view of the UNCERTIFIED draft', await mt(dvorak, 'corridor-exposure-eur-draft/serve', 'products.metric.serve', { view: 'executive' }), 409, /metric rejected \(certification\)/);
  const a = await mt(hoffmann, 'corridor-exposure-eur-draft/serve', 'products.metric.serve', { view: 'analyst' });
  if (!a.ok) fail('A. Hoffmann serves the draft in the analyst view', a);
  else { const v = a.body.serving; ok(`THE ANALYST VIEW SERVED the draft MARKED: "${String(v.note ?? '').slice(0, 60)}" — ${v.aggregation} per ${v.grain}, values ${(v.values ?? []).map((x) => `${x.grain_key}: ${Number(x.value).toLocaleString('en')}`).join(', ')}, certified ${v.certified}`); }
  if (MODEL['corridor-exposure-eur-draft']) expectRefused('M. Dvořák certifying the draft (the same measure, grain and filters under another definition)', await mt(dvorak, `${MODEL['corridor-exposure-eur-draft'].id}/certify`, 'products.metric.certify', { version: Number(MODEL['corridor-exposure-eur-draft'].current_version), expiresAt: await dbAhead('90 days') }, MODEL['corridor-exposure-eur-draft'].id), 409, /metric certification rejected \(conflict\)/);
  const h = await mt(dvorak, 'strategic-health-score/serve', 'products.metric.serve', { view: 'executive' });
  if (!h.ok) fail('M. Dvořák serves the health score', h);
  else { const v = h.body.serving; ok(`THE STRATEGIC HEALTH SCORE SERVED in the executive view: ${v.certification_standing}, grain ${v.grain} — source ${v.source} revision ${String(v.source_revision).slice(0, 16)}…; components ${(v.values ?? []).map((x) => `${x.grain_key} ${x.value === null ? 'withheld' : Number(x.value).toFixed(1)}`).join(', ')}`); }
}

/* ── B90-K THE CATALOG ───────────────────────────────────────────────────────────────── */
console.log('\nB90-K THE CATALOG — the synthetic AIS source, the reconciliation, the owner, the lineage to the corridor forecasts and the warning stream, the orphaned staging asset, the search');
const srcOf = async (key) => (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state, name from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = $3 order by source_id, contract_version desc`, [T, D, key]))[0] ?? null;
let AIS = await srcOf(AIS_KEY);
if (AIS) note(`the source ${AIS_KEY} "${AIS.name}" stands (${AIS.lifecycle_state}) — an earlier run`);
else {
  // the demonstration had no AIS source (the nearest is the Red Sea corridor feed of the stream fixtures) — said: a SYNTHETIC source contract, registered by A. Hoffmann, approved and activated by M. Dvořák (a registrar never approves their own registration)
  const contract = {
    source_key: AIS_KEY, name: AIS_TITLE, publisher: 'SYNTHETIC AIS aggregator (does not exist)', authority_class: 'authoritative', connector_kind: 'upload', acquisition_mode: 'replay', data_origin: 'synthetic',
    identity: { source_identity: AIS_KEY, publisher_identity: 'SYN-AIS-AGGREGATOR (synthetic; does not exist)', endpoints: [], scheme_allowlist: ['https'], cadence_seconds: 86_400, jitter_seconds: 0, collection_window: null },
    authority_and_rights: { owner: 'observation.operations', steward: 'a.hoffmann', authority: 'Vessel positions through Bab el-Mandeb as a SYNTHETIC replay set for the B90 demonstration', legal_basis: 'Internal synthetic data for demonstration; no real vessel is tracked',
      rights_state: 'confirmed', licence: 'internal', permitted_use: ['internal analysis'], robots_policy: 'not applicable', purposes: ['observation', 'prediction'], classification_ceiling: 'internal', residency: 'EU', retention: '24 months', deletion_obligation: 'none' },
    security_and_operations: {
      credential_ref: null, authentication_method: 'none — a synthetic replay set presented by upload',
      authenticity_method: { transport_endpoint: 'not applicable — the positions are uploaded; no transport was performed by this system', byte_integrity: 'SHA-256 digest verified at intake, at admission and on every read', source_origin: 'a synthetic aggregator; no external origin', content_authenticity: 'synthetic positions generated for the demonstration, marked as such' },
      budgets: { max_requests_per_run: 25, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      expected_schema: { media_types: ['text/csv'], required_fields: ['mmsi', 'timestamp', 'lat', 'lon'], drift_tolerance: 0, max_bytes: 16_777_216 },
      freshness_expectation: { threshold_seconds: 604_800, expected_interval: 'weekly' },
      coverage_expectations: { universe_version: 'v1', denominator_derivation: 'one upload per week of positions', expected_items_per_window: null, not_applicable_dimensions: ['latency', 'correction_lag', 'authenticity'], not_applicable_reason: 'a synthetic replay set: no publisher to lag behind, no corrections channel, no external origin' },
      correction_channel: 'a corrected upload under the same contract', replay_set: 'red-sea-ais-synthetic',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  };
  const rg = await ob(hoffmann, 'sources/register', 'observation.source.register', { contract });
  if (!rg.ok) fail('A. Hoffmann registers the AIS source', rg);
  else {
    const sourceId = rg.body.source.sourceId;
    const ap = await ob(dvorak, `sources/${sourceId}/approve`, 'observation.source.approve', { contractVersion: 1, decision: 'approve', reason: 'the synthetic AIS replay contract reviewed for the B90 demonstration: internal ceiling, rights confirmed, no real vessel' }, sourceId);
    const tr = ap.ok ? await ob(dvorak, `sources/${sourceId}/transition`, 'observation.source.transition', { contractVersion: 1, target: 'active', reason: 'activated for the catalog demonstration (SYNTHETIC)' }, sourceId) : null;
    if (!ap.ok || tr === null || !tr.ok) fail('M. Dvořák approves / activates the AIS source', ap.ok ? tr : ap);
    else { AIS = await srcOf(AIS_KEY); ok(`A. Hoffmann REGISTERED the SYNTHETIC source ${AIS_KEY} "${AIS_TITLE}" (upload, replay, synthetic origin); M. Dvořák (collection manager) APPROVED and ACTIVATED contract v1 → ${AIS.lifecycle_state} (${short(sourceId)}) — the demonstration had no AIS source: said`); }
  }
}
ENV_OUT.EYE_B90_AIS_TITLE = 'Red Sea AIS'; ENV_OUT.EYE_B90_READER = 'a.novak';
const assetOf = async (kind, ref) => (await q(`select asset_id::text id, title, owner_principal_id::text owner, flags, trusted, discoverable, recertify_by from products.catalog_assets where tenant_id = $1 and domain_id = $2 and kind = $3 and ref = $4`, [T, D, kind, ref]))[0] ?? null;
const reconcile = async (label) => {
  const r = await ct(aydin, 'reconcile', 'products.catalog.reconcile', {});
  if (!r.ok) { fail(`F. Aydın reconciles (${label})`, r); return null; }
  const c = r.body.run.counts ?? {};
  ok(`F. Aydın RECONCILED the catalog (${label}): ${c.seen} registry rows seen, ${c.created} entries created, flagged ${JSON.stringify(c.flagged_by_kind ?? {})}, cleared ${c.cleared ?? 0}, attention items ${c.attention_items ?? 0}`);
  return r.body.run;
};
if (AIS && STREAM && FORECASTS) {
  let a = await assetOf('source', AIS_KEY);
  if (a === null) { await reconcile('the registries walked: the schemas, the canonical fields, the sources, the products'); a = await assetOf('source', AIS_KEY); }
  else note('the first reconciliation stands (the AIS source is catalogued) — an earlier run');
  if (a === null) bad('the AIS source is not catalogued after the reconciliation');
  else {
    if (a.owner === null) {
      const r = await ct(aydin, `assets/${a.id}/owner`, 'products.catalog.owner.set', { ownerPrincipalId: hoffmann.principalId }, a.id);
      if (!r.ok) fail('F. Aydın sets the AIS source\'s owner', r); else ok(`F. Aydın SET the owner of the catalog entry "${a.title}" → A. Hoffmann (unowned cleared; recertify by ${String(r.body.asset.recertify_by).slice(0, 10)})`);
    } else note(`the AIS entry's owner ${nm(a.owner)} stands — an earlier run`);
    const pf = await assetOf('product', FORECASTS.id); const ps = await assetOf('product', STREAM.id);
    if (pf === null || ps === null) bad(`the product entries are missing (forecasts ${!!pf}, stream ${!!ps})`);
    else {
      const edge = async (from, to) => (await q(`select edge_id::text id from products.lineage_edges where from_asset_id = $1 and to_asset_id = $2 and retired_at is null`, [from, to]))[0] ?? null;
      for (const [from, to, label] of [[a, pf, `"${AIS_TITLE}" → "${pf.title}"`], [pf, ps, `"${pf.title}" → "${ps.title}"`]]) {
        if (await edge(from.id, to.id)) { note(`the lineage ${label} stands — an earlier run`); continue; }
        const r = await ct(aydin, 'lineage/declare', 'products.catalog.lineage.declare', { fromAssetId: from.id, toAssetId: to.id, kind: 'feeds', evidence: { basis: 'the product declaration names its input (SYNTHETIC)' } }, from.id);
        if (!r.ok) fail(`F. Aydın declares the lineage ${label}`, r); else ok(`F. Aydın DECLARED the lineage ${label} (feeds) — ${short(r.body.edge.edge_id)}`);
      }
    }
    const term = (await q(`select term, version from products.glossary_terms where tenant_id = $1 and domain_id = $2 and lower(term) = 'ais position'`, [T, D]))[0] ?? null;
    if (term) note(`the glossary term "${term.term}" v${term.version} stands — an earlier run`);
    else {
      const r = await ct(aydin, 'terms/define', 'products.catalog.term.define', { term: 'AIS position', definition: 'A vessel position report (MMSI, instant, latitude, longitude) received from the Automatic Identification System; in this demonstration SYNTHETIC (SYNTHETIC glossary).', ownerPrincipalId: hoffmann.principalId });
      if (!r.ok) fail('F. Aydın defines the glossary term', r); else ok(`F. Aydın DEFINED the glossary term "${r.body.term.term}" (owner A. Hoffmann) — bound by name to ${(r.body.term.assets ?? []).length} entr(ies)`);
    }
  }
  // THE STAGING ASSET without an owner → the next reconciliation flags it ORPHAN (undiscoverable) and routes the coverage item to the steward role
  const STG = 'ais_staging_2025w40';
  let stg = await assetOf('staging', STG);
  if (stg === null) {
    const r = await ct(aydin, 'assets/register', 'products.catalog.asset.register', { kind: 'staging', ref: STG, title: 'AIS staging 2025 week 40 (SYNTHETIC)', description: 'an intermediate extract of AIS positions before admission — left without an owner (SYNTHETIC)', classification: 'internal', locations: ['relation:staging.ais_2025w40'] });
    if (!r.ok) fail('F. Aydın registers the staging asset', r); else { stg = await assetOf('staging', STG); ok(`F. Aydın REGISTERED the staging asset ${STG} "${stg.title}" with NO owner — flags ${JSON.stringify((stg.flags ?? []).map((f) => f.kind))}`); }
  } else note(`the staging asset ${STG} stands (flags ${JSON.stringify((stg.flags ?? []).map((f) => f.kind))}) — an earlier run`);
  if (stg && !(stg.flags ?? []).some((f) => f.kind === 'orphan')) { await reconcile('the orphan detection'); stg = await assetOf('staging', STG); }
  if (stg) {
    const orphan = (stg.flags ?? []).find((f) => f.kind === 'orphan') ?? null;
    (orphan && stg.discoverable === false ? ok : bad)(`${STG} is ${orphan ? `flagged ORPHAN since ${String(orphan.since).slice(0, 10)} ("${String(orphan.reason).slice(0, 70)}") and UNDISCOVERABLE` : 'NOT flagged orphan'} (discoverable ${stg.discoverable}, trusted ${stg.trusted})`);
    const item = (await q(`select item_id::text id, state, route_roles, title from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'catalog.coverage' and subject_id = $3 order by created_at desc limit 1`, [T, D, stg.id]))[0] ?? null;
    (item ? ok : bad)(`THE COVERAGE ITEM: ${item ? `${short(item.id)} "${String(item.title).slice(0, 90)}" → ${item.state}, routed to the role ${(item.route_roles ?? []).join('+')} (the steward's queue: no owner to name)` : 'ABSENT'}`);
  }
  // THE SEARCH: the steward, then an internal-cleared reader
  const s = await ct(aydin, 'search', 'products.catalog.search', { q: 'Red Sea AIS', kinds: null }, null, READ);
  if (!s.ok) fail('F. Aydın searches "Red Sea AIS"', s);
  else {
    const hit = (s.body.search.hits ?? []).find((h) => h.asset_id === a?.id) ?? null;
    (hit ? ok : bad)(`F. Aydın SEARCHED "Red Sea AIS": ${s.body.search.total} hit(s), ${s.body.search.hidden} hidden (clearance ${s.body.search.clearance}) — ${hit ? `"${hit.title}" owner ${hit.owner_name ?? nm(hit.owner_principal_id)}, trusted ${hit.trusted}, flags ${JSON.stringify((hit.flags ?? []).map((f) => f.kind))}, downstream ${(hit.downstream ?? []).map((n) => `${n.kind} → "${n.title}"`).join('; ') || 'none'}` : 'the AIS source is NOT among the hits'}`);
  }
  const s2 = await ct(aydin, 'search', 'products.catalog.search', { q: 'ais_staging', kinds: null }, null, READ);
  if (s2.ok) ok(`the search "ais_staging" (F. Aydın): ${s2.body.search.total} total, ${s2.body.search.hidden} hidden (${JSON.stringify(s2.body.search.hidden_by ?? {})}) — the orphan is counted, never served`);
  const s3 = await ct(novak, 'search', 'products.catalog.search', { q: 'Red Sea AIS', kinds: null }, null, READ);
  if (!s3.ok) fail('A. Novák searches', s3); else ok(`A. Novák (an internal-cleared reader) SEARCHED "Red Sea AIS": ${s3.body.search.total} hit(s), ${s3.body.search.hidden} hidden — clearance ${s3.body.search.clearance}; no steward's controls`);
  const cv = await ct(aydin, 'coverage', 'products.catalog.read', {}, null, READ);
  if (!cv.ok) fail('F. Aydın reads the coverage', cv);
  else { const c = cv.body.coverage; ok(`THE COVERAGE DEBT: ${Object.entries(c.kinds ?? {}).map(([k, v]) => `${k} ${v.total} (owned ${v.owned}, discoverable ${v.discoverable}${Object.keys(v.flagged ?? {}).length ? `, flagged ${JSON.stringify(v.flagged)}` : ''})`).join('; ')}; ${c.totals?.undiscoverable ?? 0} undiscoverable, ${c.open_items ?? 0} open item(s); last reconciliation ${c.last_reconciliation?.trigger ?? '—'}`); }
}

/* ── B90-9 THE STATE, THE ENV LINES, THE LIMITS ──────────────────────────────────────── */
console.log('\nB90-9 THE STATE and the LIMITS');
{
  const n = (await q(`select (select count(*) from products.products_current where tenant_id = $1 and domain_id = $2)::int products,
                             (select count(*) from products.products_current where tenant_id = $1 and domain_id = $2 and state in ('released', 'degraded'))::int released,
                             (select count(*) from products.product_consumers where tenant_id = $1 and domain_id = $2)::int consumers,
                             (select count(*) from products.event_subscriptions where tenant_id = $1 and domain_id = $2)::int subscriptions,
                             (select count(*) from products.event_stream s join products.products_current p using (product_id) where p.tenant_id = $1 and p.domain_id = $2)::int stream_rows,
                             (select count(*) from products.slo_observations where tenant_id = $1 and domain_id = $2)::int slo_observations,
                             (select count(*) from products.scorecards where tenant_id = $1 and domain_id = $2)::int scorecards,
                             (select count(*) from products.semantic_models where tenant_id = $1 and domain_id = $2)::int models,
                             (select count(*) from products.metric_certifications where tenant_id = $1 and domain_id = $2 and state = 'active')::int certifications,
                             (select count(*) from products.metric_servings where tenant_id = $1 and domain_id = $2)::int servings,
                             (select count(*) from products.catalog_assets where tenant_id = $1 and domain_id = $2)::int assets,
                             (select count(*) from products.lineage_edges e join products.catalog_assets a on a.asset_id = e.from_asset_id where a.tenant_id = $1 and a.domain_id = $2 and e.retired_at is null)::int edges,
                             (select count(*) from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = any($3::text[]))::int b90_items`, [T, D, B90_CLASSES]))[0];
  note(`in the ledgers: ${n.products} products (${n.released} released), ${n.consumers} consumer rows, ${n.subscriptions} subscriptions, ${n.stream_rows} stream rows, ${n.slo_observations} SLO observations, ${n.scorecards} scorecards, ${n.models} semantic models (${n.certifications} active certifications, ${n.servings} servings), ${n.assets} catalog entries, ${n.edges} live lineage edges, ${n.b90_items} B90 attention items`);
  console.log('  the env lines for the walks:');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  note('LIMITS said: EVERY FIGURE IS SYNTHETIC — the AIS source is a synthetic upload contract with no bytes behind it (no real AIS provider), the corridor warnings are synthetic reports nominated and escalated for the demonstration, the EUR readings and the availability probes are the personas\' own observations, not measurements; the event product is served by PULL only (no push delivery, no webhook, no real consumer system — H. Weber reads it by hand); the consumer, the subscriber and the steward are personas of this demonstration; the ticks are the attention agent\'s REAL scheduled ticks (the act waits for them, drives none by hand: there is no tick route outside the test runtime); the stream\'s SLO floor (50 %) and grace (3 ticks) are declared by its owner so one missed lag observation does not degrade the stream by the schedule before the steward\'s own degradation scene — the attainment climbs with every healthy tick; the metric certifications are signed with the demonstration\'s own key (EYE_EXECUTIVE_SIGNING_KEY_DEMO, bound by reference); the semantic layer computes from the platform\'s own canonical rows (graph.measure_observations, executive.health_score_snapshots) and creates no parallel truth; the catalog DESCRIBES and INDEXES authority and mutates no source, schema, product or object. HARNESS-PROVEN and not staged: events — the breaking schema re-declaration pausing a subscription (reason schema) and its conformance to the new version, the correction row withheld from a consumer that cannot process corrections, the replay moving a checkpoint back, the revocation preserving the offsets, the authority-boundary refusals (another tenant, fields outside the schema, a purpose outside the policy), RLS isolation (phase6-events-b90 e, f, g); products — contract tests and the breaking release denied over accepted consumers without a passing test, the migration, the cost attribution, the degradation BY THE TICK after grace_ticks below-floor scorecards, the withdrawal (the DPR\'s withdrawn version) and the retirement (the archived version; refused over an accepted consumer or without a retirement review) (phase6-products-b90 b, c, d, e); metrics — the definition diff withdrawing a certification and exposing its servings, the reproducibility fault (a source row changed → the recalculation withdraws), the expiry sweep by the tick step metric-certification and its item, the whitelist refusals (phase6-metrics-b90 d); catalog — stale and ownership-lapsed entries (stated superuser moves on the dates), the duplicate flag, the steward\'s hand flag, the clearance hiding a confidential entry, the trust read as the stop of new consumption, the tick step catalog-reconcile (phase6-catalog-b90 c2, d). Nothing is cleaned: every object stands as a demonstration fact.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
